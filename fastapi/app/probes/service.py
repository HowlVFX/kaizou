"""Probe service — orchestrates probe lifecycle (§6.7, §8).

Coordinates probe type selection, process templates, generation, leakage
checking with a bounded retry loop, hand-authored fallback, persistence
(with the frozen answer-key snapshot), and SOLO level advancement.
"""
from __future__ import annotations

import logging
import random
from typing import Optional

import psycopg
import psycopg.types.json
from psycopg.rows import dict_row

from app.grading.answer_key import PROBE_TYPES, build_snapshot
from app.grading.coverage import as_vector
from app.memory.telemetry import evaluate_solo_advancement
from app.probes.generation import (
    MAX_CONTEXT_CLAIMS,
    ORDER_DEPENDENT_TYPES,
    GeneratedProbe,
    ProbeGenerator,
    ProbeValidationError,
    fallback_probe,
)
from app.probes.leakage import validate_probe
from app.providers.shared.errors import ProviderError

logger = logging.getLogger(__name__)

MAX_LEAKAGE_RETRIES = 3  # default; Settings.probe_leakage_max_retries overrides

# Probe types that test one specific claim; repeat probes rotate the claim.
CLAIM_TARGETED_TYPES = frozenset({"CLOZE", "MISCONCEPTION_MCQ"})


class ProbeServiceError(Exception):
    """Maps to an HTTP error in the router."""

    def __init__(self, status_code: int, detail: str):
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)


class ProbeService:
    """Orchestrates probe generation, validation, and SOLO advancement."""

    def __init__(
        self,
        conn: psycopg.AsyncConnection,
        generator: ProbeGenerator | None = None,
        embedding_service=None,
        template_manager=None,
        settings=None,
    ):
        self._conn = conn
        self._generator = generator
        self._embedding = embedding_service
        self._templates = template_manager
        if settings is None:
            from app.config import get_settings
            settings = get_settings()
        self._s = settings

    # -- lazy collaborators (no provider client is built unless needed) -----

    def _get_generator(self) -> ProbeGenerator:
        if self._generator is None:
            self._generator = ProbeGenerator(conn=self._conn)
        return self._generator

    def _get_templates(self):
        if self._templates is None:
            from app.probes.templates import ProcessTemplateManager
            self._templates = ProcessTemplateManager(conn=self._conn)
        return self._templates

    def _get_embedding(self):
        if self._embedding is None:
            from app.ingestion.embedding import create_embedding_service
            self._embedding = create_embedding_service(self._s, conn=self._conn)
        return self._embedding

    # -- generation ---------------------------------------------------------

    async def generate_probe_for_concept(
        self,
        concept_id: str,
        learner_id: str,
        probe_type: str | None = None,
        concept_version: int | None = None,
    ) -> dict:
        """Generate, validate, persist and return a probe (§6.7).

        Pipeline:
            1. Validate probe_type (before any paid call)
            2. Fetch concept (ownership, eligibility) + current-version claims
            3. Select probe type by SOLO level if not given
            4. Process template for order-dependent types
            5. Generate → validate → leakage check, up to N attempts, each a
               fresh sample (variant leak-retry-{n}) with the violation
               report appended
            6. Hand-authored fallback if every attempt fails or the provider
               is unavailable / over budget
            7. Persist with answer_key_snapshot and return
        """
        if probe_type is not None:
            probe_type = probe_type.strip().upper()
            if probe_type not in PROBE_TYPES:
                raise ProbeServiceError(
                    422, f"Invalid probe_type '{probe_type}'. Valid: {sorted(PROBE_TYPES)}",
                )

        async with self._conn.cursor(row_factory=dict_row) as cur:
            await cur.execute('SELECT * FROM concepts WHERE id = %s', (concept_id,))
            concept = await cur.fetchone()

        if not concept or str(concept.get('learner_id')) != str(learner_id):
            raise ProbeServiceError(404, 'Concept not found')
        concept = dict(concept)
        if concept.get('status') == 'UNRESOLVED_PREREQUISITE':
            raise ProbeServiceError(422, 'Concept is a locked prerequisite; write a note to unlock it')
        # Every note the learner wrote is testable, including user-defined
        # notes the classifier would label OUT_OF_SCOPE (meta/non-academic).
        if concept.get('probe_eligible') is False:
            raise ProbeServiceError(422, 'Concept is not probe-eligible')
        current_version = concept['version']
        if concept_version is not None and concept_version != current_version:
            raise ProbeServiceError(
                409, f'Stale concept_version {concept_version}; current is {current_version}',
            )

        async with self._conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """SELECT id, text, embedding, order_index, is_transition,
                          is_load_bearing, branch_id, weight, aliases
                   FROM claims
                   WHERE concept_id = %s AND concept_version = %s
                   ORDER BY order_index ASC NULLS LAST, created_at ASC""",
                (concept_id, current_version),
            )
            claims = [dict(c) for c in await cur.fetchall()]

        if not claims:
            raise ProbeServiceError(422, f'No claims for concept {concept_id} version {current_version}')

        if not probe_type:
            async with self._conn.cursor(row_factory=dict_row) as cur:
                await cur.execute(
                    """SELECT p.type::text AS type, MAX(a.submitted_at) AS last_at
                       FROM probes p
                       JOIN attempts a ON a.probe_id = p.id
                       WHERE a.learner_id = %s AND p.concept_id = %s
                       GROUP BY p.type
                       ORDER BY last_at DESC""",
                    (learner_id, concept_id),
                )
                recent = await cur.fetchall()
            probe_type = await self._get_generator().select_probe_type(
                concept.get('solo_level') or 'Prestructural',
                concept.get('shape') or 'DEFINITION',
                [r['type'] for r in recent],
                track=concept.get('track'),
            )

        # Process template (order-dependent probe types on structured shapes).
        template_snapshot = None
        target_branch = None
        focus = None
        if probe_type in ORDER_DEPENDENT_TYPES and concept.get('shape') != 'DEFINITION':
            template_snapshot = await self._template_for(concept, claims)
            branches = (template_snapshot or {}).get('branches') or {}
            if branches:
                target_branch = random.choice(sorted(branches))
                focus = f"Focus the question on the '{target_branch}' case/branch only."

        # Analogy nodes: name what the analogy is FOR, so analogy probes can
        # refer to the real concept instead of "its target concept".
        if concept.get('track') == 'ANALOGY':
            async with self._conn.cursor(row_factory=dict_row) as cur:
                await cur.execute(
                    "SELECT c.canonical_label FROM edges e JOIN concepts c ON c.id = e.target_id "
                    "WHERE e.source_id = %s AND e.type = 'ANALOGY_OF' LIMIT 1",
                    (concept_id,),
                )
                target_row = await cur.fetchone()
            if target_row:
                note = f"'{concept.get('canonical_label')}' is the learner's analogy for '{target_row['canonical_label']}'."
                focus = f"{focus}\n{note}" if focus else note

        # Variety: the Nth probe of this type for this concept version is its
        # own cache sample (otherwise a retest replays the identical question)
        # and, for claim-targeted types, rotates onto a different claim.
        async with self._conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                "SELECT COUNT(*) AS n FROM probes WHERE concept_id = %s "
                "AND concept_version = %s AND type = %s",
                (concept_id, current_version, probe_type),
            )
            row = await cur.fetchone()
            prior_probes = int(row['n']) if row else 0
        sample_prefix = f"s{prior_probes}-" if prior_probes else ""
        if prior_probes and probe_type in CLAIM_TARGETED_TYPES and len(claims) > 1:
            k = prior_probes % min(len(claims), MAX_CONTEXT_CLAIMS)
            rotate = f"Base the question on claim {k} (0-based) this time."
            focus = f"{focus}\n{rotate}" if focus else rotate

        max_attempts = max(1, int(getattr(self._s, 'probe_leakage_max_retries', MAX_LEAKAGE_RETRIES)))
        claim_embeddings = [as_vector(c['embedding']) for c in claims if c.get('embedding') is not None]
        claim_token_lists = [c['text'].split() for c in claims]

        chosen: Optional[GeneratedProbe] = None
        leaked = False
        attempts_made = 0
        leakage_check = 'none'
        fallback_reason = None
        violation = None

        for attempt in range(max_attempts):
            attempts_made = attempt + 1
            try:
                candidate = await self._get_generator().generate_probe(
                    concept=concept,
                    claims=claims,
                    probe_type=probe_type,
                    variant=f"{sample_prefix}leak-retry-{attempt}",
                    violation=violation,
                    focus=focus,
                )
            except ProbeValidationError as exc:
                violation = f"invalid probe: {exc}"
                logger.info('Probe validation failed (attempt %d): %s', attempt, exc)
                continue
            except ProviderError as exc:
                logger.warning('Probe generation unavailable, using fallback: %s', exc)
                fallback_reason = f'provider_error: {type(exc).__name__}'
                break

            is_valid, leakage_check, report = await self._check_leakage(
                candidate, claim_embeddings, claim_token_lists,
            )
            if is_valid:
                chosen = candidate
                break
            violation = report

        if chosen is None:
            if fallback_reason is None:
                fallback_reason = 'leakage_or_validation_retries_exhausted'
            chosen = fallback_probe(probe_type, concept, claims)
            if chosen.probe_type != 'CLOZE':
                lex_ok, _, _ = validate_probe(
                    [], chosen.prompt_text.split(), [], claim_token_lists,
                    lexical_threshold=self._s.probe_leakage_ngram,
                    ngram_n=self._s.probe_leakage_ngram_n,
                )
                leaked = not lex_ok
            leakage_check = 'lexical_only'

        snapshot = build_snapshot(
            concept=concept,
            claims=claims,
            probe_type=chosen.probe_type,
            target_claim_index=chosen.target_claim_index,
            cloze=chosen.cloze,
            mcq=chosen.mcq,
            sort=chosen.sort,
            template=template_snapshot,
            target_branch=target_branch,
            perturbation=chosen.perturbation,
            divergences=chosen.divergences,
        )
        retries = max(0, attempts_made - 1) if not chosen.fallback else attempts_made

        async with self._conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """INSERT INTO probes (
                    id, concept_id, concept_version, type,
                    prompt_text, answer_key_snapshot, payload, leaked, retries
                ) VALUES (
                    gen_random_uuid(), %s, %s, %s,
                    %s, %s::jsonb, %s::jsonb, %s, %s
                ) RETURNING id""",
                (
                    concept_id, current_version, chosen.probe_type,
                    chosen.prompt_text,
                    psycopg.types.json.Jsonb(snapshot),
                    psycopg.types.json.Jsonb(chosen.payload or {}),
                    leaked, retries,
                ),
            )
            row = await cur.fetchone()

        await self._conn.commit()

        return {
            'probe_id': str(row['id']),
            'concept_id': str(concept_id),
            'concept_version': current_version,
            'prompt_text': chosen.prompt_text,
            'probe_type': chosen.probe_type,
            'requested_probe_type': probe_type,
            'payload': chosen.payload or {},
            'leaked': leaked,
            'retries': retries,
            'fallback': chosen.fallback,
            'fallback_reason': fallback_reason if chosen.fallback else None,
            'leakage_check': leakage_check,
            'target_branch': target_branch,
        }

    async def _template_for(self, concept: dict, claims: list[dict]) -> Optional[dict]:
        """Fetch or build the Process Template; never fails the probe."""
        try:
            template = await self._get_templates().get_or_generate_template(
                concept_id=str(concept['id']),
                concept_version=concept['version'],
                concept_label=concept.get('canonical_label', ''),
                claims=claims,
                conn=self._conn,
            )
        except ProviderError as exc:
            logger.warning('Process template unavailable: %s', exc)
            return None
        structure = template.get('structure') or {}
        return {
            'trunk': list(structure.get('trunk') or []),
            'branches': dict(structure.get('branches') or {}),
            'confidence': template.get('confidence'),
        }

    async def _check_leakage(
        self,
        candidate: GeneratedProbe,
        claim_embeddings: list,
        claim_token_lists: list[list[str]],
    ) -> tuple[bool, str, str]:
        """§5.15 check. Returns (is_valid, check_kind, violation_report).

        CLOZE leakage (answer present in the prompt) is enforced during
        validation. For other types the stem (+ sort items) is checked
        lexically always, and semantically when embeddings are available.
        """
        if candidate.probe_type == 'CLOZE':
            return True, 'cloze_answer', ''
        text = candidate.prompt_text
        if candidate.probe_type == 'CONCEPT_SORT':
            text = ' '.join([text, *candidate.payload.get('items', [])])

        probe_embedding = None
        check = 'lexical_only'
        if claim_embeddings:
            try:
                probe_embedding = await self._get_embedding().compute_embedding(text)
                check = 'semantic+lexical'
            except ProviderError as exc:
                logger.warning('Leakage semantic check skipped: %s', exc)

        is_valid, sem, lex = validate_probe(
            probe_embedding if probe_embedding is not None else [],
            text.split(),
            claim_embeddings if probe_embedding is not None else [],
            claim_token_lists,
            semantic_threshold=self._s.probe_leakage_semantic,
            lexical_threshold=self._s.probe_leakage_ngram,
            ngram_n=self._s.probe_leakage_ngram_n,
        )
        report = f"semantic similarity {sem:.2f}, 4-gram overlap {lex:.2f}"
        return is_valid, check, report

    # -- capability events --------------------------------------------------

    async def _log_capability_event(
        self,
        learner_id: str,
        concept_id: str,
        event_type: str,
        detail: dict,
        attempt_id: str | None = None,
    ) -> None:
        """Append a capability_events row, idempotently (§5.25.1 timeline).

        SOLO_ADVANCE is deduped on (learner, concept, from→to); the transfer /
        perturbation events on their triggering attempt_id — so re-running
        grading or SOLO re-evaluation never spams duplicate rows.
        """
        async with self._conn.cursor() as cur:
            if attempt_id is not None:
                await cur.execute(
                    """INSERT INTO capability_events
                           (learner_id, concept_id, attempt_id, event_type, detail)
                       SELECT %s, %s, %s, %s, %s::jsonb
                       WHERE NOT EXISTS (
                           SELECT 1 FROM capability_events
                           WHERE attempt_id = %s AND event_type = %s
                       )""",
                    (learner_id, concept_id, attempt_id, event_type,
                     psycopg.types.json.Jsonb(detail), attempt_id, event_type),
                )
            else:
                await cur.execute(
                    """INSERT INTO capability_events
                           (learner_id, concept_id, event_type, detail)
                       SELECT %s, %s, %s, %s::jsonb
                       WHERE NOT EXISTS (
                           SELECT 1 FROM capability_events
                           WHERE learner_id = %s AND concept_id = %s
                             AND event_type = %s AND detail = %s::jsonb
                       )""",
                    (learner_id, concept_id, event_type,
                     psycopg.types.json.Jsonb(detail),
                     learner_id, concept_id, event_type,
                     psycopg.types.json.Jsonb(detail)),
                )

    # -- SOLO ---------------------------------------------------------------

    async def update_solo_level(
        self,
        concept_id: str,
        learner_id: str,
    ) -> str:
        """Re-evaluate and update SOLO level after grading (§5.24.1).

        Evidence, read from this learner's graded attempts on the concept:
            max claims matched on any single probe      → Uni (>=1) / Multi (>=3)
            distinct probe types on which every
            transition claim matched (key had >= 1)      → Relational (>= 2)
            best passed PERTURBATION delta_score         → Relational (>= 0.70)
            best passed FAR_TRANSFER composite           → Extended Abstract (>= 0.85)
        Per-attempt facts come from attempts.gap_report.grading, written by
        the grader. Levels only advance, never regress.
        """
        async with self._conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                'SELECT solo_level::text AS solo_level FROM concepts WHERE id = %s',
                (concept_id,),
            )
            concept = await cur.fetchone()
            current_level = (concept or {}).get('solo_level') or 'Prestructural'

            await cur.execute(
                """SELECT
                     COALESCE(MAX(COALESCE((a.gap_report->'grading'->>'total_matched')::int, 0)), 0)
                         AS max_matched,
                     COUNT(DISTINCT p.type) FILTER (
                         WHERE a.gap_report->'grading'->>'all_transitions_matched' = 'true'
                     ) AS transition_types,
                     MAX(a.delta_score) FILTER (
                         WHERE p.type = 'PERTURBATION' AND a.passed
                     ) AS best_perturbation,
                     MAX(a.composite_score) FILTER (
                         WHERE p.type = 'FAR_TRANSFER' AND a.passed
                     ) AS best_far_transfer,
                     (ARRAY_AGG(a.id::text ORDER BY a.delta_score DESC NULLS LAST)
                          FILTER (WHERE p.type = 'PERTURBATION' AND a.passed))[1]
                         AS perturbation_attempt_id,
                     (ARRAY_AGG(a.id::text ORDER BY a.composite_score DESC NULLS LAST)
                          FILTER (WHERE p.type IN ('NEAR_TRANSFER', 'FAR_TRANSFER')
                                        AND a.passed))[1]
                         AS transfer_attempt_id
                   FROM attempts a
                   JOIN probes p ON p.id = a.probe_id
                   WHERE a.concept_id = %s AND a.learner_id = %s""",
                (concept_id, learner_id),
            )
            ev = await cur.fetchone() or {}

        transition_types = int(ev.get('transition_types') or 0)
        best_pert = ev.get('best_perturbation')
        best_far = ev.get('best_far_transfer')

        new_level = evaluate_solo_advancement(
            current_level=current_level,
            total_claims_matched=int(ev.get('max_matched') or 0),
            transition_claims_all_matched=transition_types > 0,
            distinct_probe_types_with_transitions=transition_types,
            has_passed_perturbation=best_pert is not None,
            perturbation_delta=float(best_pert or 0.0),
            has_passed_far_transfer=best_far is not None,
            far_transfer_score=float(best_far or 0.0),
        )

        # Capability timeline (§5.25.1). Passed-transfer / perturbation events
        # are deduped on their triggering attempt; SOLO_ADVANCE on from→to.
        pert_attempt = ev.get('perturbation_attempt_id')
        if best_pert is not None and pert_attempt:
            await self._log_capability_event(
                learner_id, concept_id, 'PERTURBATION_PASS',
                {'delta_score': float(best_pert)}, attempt_id=pert_attempt,
            )
        transfer_attempt = ev.get('transfer_attempt_id')
        if transfer_attempt:
            await self._log_capability_event(
                learner_id, concept_id, 'TRANSFER_PASS', {}, attempt_id=transfer_attempt,
            )

        if new_level != current_level:
            async with self._conn.cursor() as cur:
                await cur.execute(
                    'UPDATE concepts SET solo_level = %s WHERE id = %s',
                    (new_level, concept_id),
                )
            await self._log_capability_event(
                learner_id, concept_id, 'SOLO_ADVANCE',
                {'from': current_level, 'to': new_level},
            )
            logger.info(
                'SOLO level advanced: %s -> %s for concept %s',
                current_level, new_level, concept_id,
            )

        await self._conn.commit()
        return new_level
