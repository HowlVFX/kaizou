"""Grading service — the one grading path used by /grade, /probes/grade-attempt
and /review/answer (§6.8).

    1. Load the probe and verify it belongs to the learner (and to the
       concept/version the caller names, if any)
    2. Grade against the probe's frozen answer_key_snapshot by probe type
       (app.grading.engine) — payload-only and exact-match cloze answers
       use no model at all; free text uses embeddings (+ NLI evidence)
    3. Persist the attempt and any misconception_events
    4. Update memory (half-life, streak, complexity) — empty answers count
       as a failed recall
    5. Evaluate mastery (frozen N_req) and SOLO advancement

🔒 All scoring is deterministic math. The LLM never sees scores.
"""
from __future__ import annotations

import logging
from typing import Any, Optional

import psycopg
import psycopg.types.json
from psycopg.rows import dict_row

from app.grading.answer_key import AnswerKey, parse_answer_key
from app.grading.coverage import as_vector
from app.grading.engine import GradeOutcome, GradingInputError, grade_answer
from app.providers.shared.errors import ProviderError

logger = logging.getLogger(__name__)


class GradingServiceError(Exception):
    """Maps to an HTTP error in the routers."""

    def __init__(self, status_code: int, detail: str):
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)


class GradingService:
    def __init__(
        self,
        conn: psycopg.AsyncConnection,
        settings=None,
        *,
        embedding_service=None,
        nli_service=None,
        nli_factory=None,
    ):
        self._conn = conn
        if settings is None:
            from app.config import get_settings
            settings = get_settings()
        self._s = settings
        self._embedding = embedding_service
        self._nli = nli_service
        self._nli_factory = nli_factory

    # -- collaborators (built lazily; payload/cloze grading never builds them)

    def _get_embedding(self):
        if self._embedding is None:
            from app.ingestion.embedding import create_embedding_service
            self._embedding = create_embedding_service(self._s, conn=self._conn)
        return self._embedding

    def _get_nli(self):
        if self._nli is None:
            if self._nli_factory is not None:
                self._nli = self._nli_factory()
            elif self._s.nli_enabled:
                from app.nli.service import get_nli_service
                self._nli = get_nli_service(settings=self._s, conn=self._conn)
        return self._nli

    async def _embed_texts(self, texts: list[str]) -> list[Any]:
        return await self._get_embedding().compute_batch_embeddings(texts)

    # -- main entry point ---------------------------------------------------

    async def grade(
        self,
        *,
        probe_id: str,
        learner_id: str,
        answer_text: Optional[str] = None,
        answer_payload: Optional[dict] = None,
        confidence_pre: Optional[float] = None,
        concept_id: Optional[str] = None,
        concept_version: Optional[int] = None,
    ) -> dict:
        probe = await self._load_probe(probe_id)
        # Probes carry no learner_id; ownership is the concept's learner.
        # A foreign probe is reported as not found (no existence leak).
        if not probe or str(probe["concept_learner_id"]) != str(learner_id):
            raise GradingServiceError(404, "Probe not found")
        if concept_id is not None and str(concept_id) != str(probe["concept_id"]):
            raise GradingServiceError(422, "probe does not belong to concept_id")
        if concept_version is not None and int(concept_version) != int(probe["concept_version"]):
            raise GradingServiceError(
                422,
                f"probe was generated for concept_version {probe['concept_version']}, "
                f"not {concept_version}",
            )

        cid = str(probe["concept_id"])
        version = int(probe["concept_version"])
        key = parse_answer_key(probe["answer_key_snapshot"], probe["type"])
        if key.is_legacy:
            await self._hydrate_legacy_key(key, cid, version)

        async def claim_embeddings(k: AnswerKey) -> list[Any]:
            return await self._claim_embeddings(k, cid, version)

        try:
            outcome = await grade_answer(
                key,
                answer_text=answer_text,
                answer_payload=answer_payload,
                settings=self._s,
                embed_texts=self._embed_texts,
                claim_embeddings=claim_embeddings,
                get_nli=self._get_nli if self._s.nli_enabled or self._nli_factory else None,
            )
        except GradingInputError as exc:
            raise GradingServiceError(422, str(exc)) from exc
        except ProviderError as exc:
            logger.warning("Grading unavailable (embeddings): %s", exc)
            raise GradingServiceError(
                503, f"Grading temporarily unavailable: {type(exc).__name__}",
            ) from exc

        from app.memory.service import MemoryService
        from app.probes.service import ProbeService

        memory = MemoryService(self._conn, settings=self._s)
        await memory.ensure_memory_state(cid, str(learner_id))
        state = await memory.get_memory_state(cid, str(learner_id))
        predicted_recall = None
        if state and not state.get("never_reviewed"):
            predicted_recall = state.get("recall")

        attempt_id = await self._persist_attempt(
            learner_id=str(learner_id), probe_id=str(probe_id), concept_id=cid,
            concept_version=version, answer_text=answer_text,
            answer_payload=answer_payload, confidence_pre=confidence_pre,
            outcome=outcome, predicted_recall=predicted_recall,
        )
        await self._record_misconceptions(str(learner_id), cid, attempt_id, outcome.misconception_tags)

        mem = await memory.update_after_attempt(
            cid, str(learner_id), outcome.composite, outcome.passed, predicted_recall,
        )
        mastery = await memory.evaluate_mastery(cid, str(learner_id))
        solo_level = await ProbeService(self._conn, settings=self._s).update_solo_level(
            cid, str(learner_id),
        )

        next_review = mem["next_review_at"].isoformat()
        return {
            "attempt_id": attempt_id,
            "probe_id": str(probe_id),
            "probe_type": key.probe_type,
            "concept_id": cid,
            "concept_version": version,
            "grading_mode": outcome.mode,
            "composite_score": outcome.composite,
            "band": outcome.band,
            "passed": outcome.passed,
            "coverage": outcome.coverage,
            "ordering": outcome.ordering,
            "precision": outcome.precision,
            "verbatim": outcome.verbatim,
            "branch_leakage": outcome.branch_leakage,
            "delta_score": outcome.delta_score,
            "ari_mechanism": outcome.ari_mechanism,
            "ari_surface": outcome.ari_surface,
            "principle_ratio": outcome.principle_ratio,
            "gap_report": outcome.gap_report,
            "contradiction": outcome.contradiction,
            "misconceptions": outcome.misconception_tags,
            "memory": {
                "half_life": mem["half_life"],
                "streak": mem["streak"],
                "attempts": mem["attempts"],
                "passes": mem["passes"],
                "predicted_recall": predicted_recall,
                "next_review_at": next_review,
            },
            "mastery": mastery,
            "solo_level": solo_level,
            "next_review_at": next_review,
        }

    # -- data access --------------------------------------------------------

    async def _load_probe(self, probe_id: str) -> Optional[dict]:
        async with self._conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """SELECT p.id, p.concept_id, p.concept_version, p.type::text AS type,
                          p.answer_key_snapshot, c.learner_id AS concept_learner_id
                   FROM probes p
                   JOIN concepts c ON c.id = p.concept_id
                   WHERE p.id = %s""",
                (str(probe_id),),
            )
            row = await cur.fetchone()
        return dict(row) if row else None

    async def _version_claims(self, concept_id: str, version: int) -> list[dict]:
        async with self._conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """SELECT id::text AS id, text, embedding, order_index, is_transition,
                          is_load_bearing, branch_id, weight, aliases
                   FROM claims
                   WHERE concept_id = %s AND concept_version = %s""",
                (concept_id, version),
            )
            return [dict(r) for r in await cur.fetchall()]

    async def _hydrate_legacy_key(self, key: AnswerKey, concept_id: str, version: int) -> None:
        """v1 snapshots stored claim text only; restore metadata by text."""
        rows = await self._version_claims(concept_id, version)
        by_text = {r["text"]: r for r in rows}
        if not key.claims:
            texts = [r["text"] for r in sorted(
                rows, key=lambda r: (r.get("order_index") is None, r.get("order_index") or 0),
            )]
            from app.grading.answer_key import KeyClaim
            key.claims = [KeyClaim(text=t) for t in texts]
        for c in key.claims:
            r = by_text.get(c.text)
            if not r:
                continue
            c.id = r["id"]
            c.order_index = r.get("order_index")
            c.is_transition = bool(r.get("is_transition"))
            c.is_load_bearing = bool(r.get("is_load_bearing"))
            c.branch_id = r.get("branch_id")
            c.weight = float(r["weight"]) if r.get("weight") is not None else 1.0
            c.aliases = list(r.get("aliases") or [])

    async def _claim_embeddings(self, key: AnswerKey, concept_id: str, version: int) -> list[Any]:
        """Embeddings aligned with key.claims: stored vectors, else computed."""
        rows = await self._version_claims(concept_id, version)
        by_id = {r["id"]: r for r in rows}
        by_text = {r["text"]: r for r in rows}
        vectors: list[Any] = []
        missing: list[int] = []
        for i, c in enumerate(key.claims):
            r = by_id.get(c.id) if c.id else None
            r = r or by_text.get(c.text)
            if r is not None and r.get("embedding") is not None:
                vectors.append(as_vector(r["embedding"]))
            else:
                vectors.append(None)
                missing.append(i)
        if missing:
            computed = await self._embed_texts([key.claims[i].text for i in missing])
            for i, vec in zip(missing, computed):
                vectors[i] = vec
        return vectors

    async def _persist_attempt(
        self,
        *,
        learner_id: str,
        probe_id: str,
        concept_id: str,
        concept_version: int,
        answer_text: Optional[str],
        answer_payload: Optional[dict],
        confidence_pre: Optional[float],
        outcome: GradeOutcome,
        predicted_recall: Optional[float],
    ) -> str:
        stored_gap = dict(outcome.gap_report)
        stored_gap["grading"] = outcome.meta
        stored_gap["contradiction"] = outcome.contradiction
        async with self._conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """
                INSERT INTO attempts (
                    id, learner_id, probe_id, concept_id, concept_version,
                    answer_text, answer_payload, confidence_pre,
                    coverage, ordering, precision_score, verbatim,
                    branch_leakage, delta_score, ari_mechanism, ari_surface,
                    principle_ratio, composite_score, band,
                    predicted_recall, passed, gap_report
                ) VALUES (
                    gen_random_uuid(), %s, %s, %s, %s,
                    %s, %s::jsonb, %s,
                    %s, %s, %s, %s,
                    %s, %s, %s, %s,
                    %s, %s, %s,
                    %s, %s, %s::jsonb
                ) RETURNING id
                """,
                (
                    learner_id, probe_id, concept_id, concept_version,
                    answer_text,
                    psycopg.types.json.Jsonb(answer_payload) if answer_payload else None,
                    confidence_pre,
                    outcome.coverage, outcome.ordering, outcome.precision, outcome.verbatim,
                    outcome.branch_leakage, outcome.delta_score, outcome.ari_mechanism,
                    outcome.ari_surface, outcome.principle_ratio,
                    outcome.composite, outcome.band,
                    predicted_recall, outcome.passed,
                    psycopg.types.json.Jsonb(stored_gap),
                ),
            )
            row = await cur.fetchone()
        await self._conn.commit()
        return str(row["id"])

    async def _record_misconceptions(
        self, learner_id: str, concept_id: str, attempt_id: str, tags: list[str],
    ) -> None:
        if not tags:
            return
        async with self._conn.cursor() as cur:
            for tag in dict.fromkeys(tags):
                await cur.execute(
                    """INSERT INTO misconception_events (learner_id, concept_id, attempt_id, tag)
                       VALUES (%s, %s, %s, %s)""",
                    (learner_id, concept_id, attempt_id, tag),
                )
        await self._conn.commit()
