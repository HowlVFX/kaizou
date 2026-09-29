"""Ingestion pipeline orchestrator (§4.4–4.6, §8.1).

Full pipeline for a note:
  1. Classify: track, shape, category, Bloom level
  2. Extract claims from the note body
  3. Compute embeddings for the concept label and each claim
  4. Resolve concept identity (new vs existing vs ambiguous, §4.6);
     an UNRESOLVED_PREREQUISITE placeholder that matches is promoted
  5. Extract prerequisites and resolve them to existing concepts or
     placeholder (UNRESOLVED_PREREQUISITE) concepts
  6. Compute prerequisite depth, structural complexity, N_req
  7. Create / promote / version-bump the concept
  8. Write the complete claim set for the concept's current version
  9. Create edges (REQUIRES with cycle check, MERGE_CANDIDATE, WIKILINK,
     SEMANTIC)
  10. Update note status to READY and enqueue a per-learner recluster job

Claim versioning contract (D-04): every concept version holds its full
claim set. Readers select ``claims WHERE concept_id = X AND concept_version
= V`` with V = ``concepts.version`` (current) or the version pinned on a
probe/attempt.

REQUIRES direction: ``source_id REQUIRES target_id`` (target is the
prerequisite). See app.graph.prerequisites.build_requires_forward.
"""
from __future__ import annotations

import dataclasses
import hashlib
import logging
from uuid import uuid4

import psycopg
from psycopg.rows import dict_row

from app.grading.coverage import as_vector, build_similarity_matrix, match_claims
from app.ingestion.classifier import NoteClassifier, ClassificationResult
from app.ingestion.embedding import EmbeddingService
from app.ingestion.extractor import ClaimExtractor, extract_wikilinks, has_analogy_cue
from app.ingestion.identity import (
    resolve_concept_identity,
    deduplicate_claims,
)
from app.ingestion.source_match import (
    SOURCE_MATCH_THRESHOLD,
    SOURCE_TEXT_LIMIT,
    grounding_fraction,
    is_incorrect_note,
    rejection_reason,
    unsupported_contradiction_count,
)
from app.graph.linking import find_semantic_neighbours
from app.graph.prerequisites import build_requires_forward, plan_requires_edges
from app.memory.mastery import (
    calculate_required_streak,
    compute_structural_complexity,
    compute_initial_complexity,
)
from app.memory.decay import calculate_initial_half_life

logger = logging.getLogger(__name__)

UNRESOLVED = "UNRESOLVED_PREREQUISITE"
VERIFIED = "VERIFIED_CONCEPT"

# Placeholder concepts need values for the NOT NULL enum columns; they are
# overwritten when a real note promotes the placeholder.
PLACEHOLDER_TRACK = "SELF_AUTHORED"
PLACEHOLDER_SHAPE = "DEFINITION"
PLACEHOLDER_CATEGORY = "DETERMINISTIC_MECHANISM"

# The learner's declared note type (notes.note_type) → concept track.
NOTE_TYPE_TRACK = {
    "SOURCE_BACKED": "SOURCE_BACKED",
    "USER_DEFINED": "SELF_AUTHORED",
    "ANALOGY": "ANALOGY",
}

# Classification for an analogy node detected inside another note.
EMBEDDED_ANALOGY_CLASSIFICATION = ClassificationResult(
    track="ANALOGY", shape="DEFINITION", category="CONVENTIONAL", bloom_level=1.5,
)


def _vector_literal(vec) -> str | None:
    """pgvector text literal for a list/str vector (None passes through)."""
    if vec is None:
        return None
    if isinstance(vec, str):
        return vec
    return "[" + ",".join(repr(float(x)) for x in vec) + "]"


def compose_claim_version(
    previous_claims: list[dict],
    new_claims: list[dict],
    replace: bool,
) -> list[dict]:
    """Build the complete claim set for a new concept version (D-04).

    ``replace`` is True when the note being ingested is the concept's only
    source: its fresh extraction supersedes the previous version entirely.
    Otherwise (the concept is shared with other notes) every previous claim
    is carried forward and only new claims that are not duplicates (sim >= τ)
    are appended, with order_index offset after the carried ones.

    Each returned dict has: text, embedding, order_index, is_transition,
    is_load_bearing, branch_id, weight, aliases, carried (bool).
    """
    if replace and new_claims:
        return [{**c, "carried": False} for c in new_claims]

    carried = [{**c, "carried": True} for c in previous_claims]
    unique = deduplicate_claims(new_claims, previous_claims)

    existing_orders = [c["order_index"] for c in previous_claims if c.get("order_index") is not None]
    base = (max(existing_orders) + 1) if existing_orders else 0
    appended = []
    for c in unique:
        order = c.get("order_index")
        appended.append({
            **c,
            "order_index": (base + order) if order is not None else None,
            "carried": False,
        })
    return carried + appended


class IngestionService:
    """Orchestrates the full note ingestion pipeline."""

    def __init__(
        self,
        conn: psycopg.AsyncConnection,
        classifier: NoteClassifier | None = None,
        extractor: ClaimExtractor | None = None,
        embedding_service: EmbeddingService | None = None,
        enqueue_recluster: bool = True,
    ):
        self._conn = conn
        # Self-provision guarded (budget + cache) clients from the connection
        # when not supplied. This is what lets the background worker build
        # IngestionService(conn) with no extra wiring.
        from app.ingestion.embedding import create_embedding_service
        self._classifier = classifier or NoteClassifier(conn=conn)
        self._extractor = extractor or ClaimExtractor(conn=conn)
        self._embedding = embedding_service or create_embedding_service(conn=conn)
        self._enqueue_recluster = enqueue_recluster

    async def ingest_note(self, note_id: str, learner_id: str) -> dict:
        """Run the full ingestion pipeline for a note.

        Returns dict with concept_id, claims_count, status, is_new_concept,
        concept_version, prerequisites_count, placeholders_created.
        """
        note_id = str(note_id)
        learner_id = str(learner_id)

        # 1. Fetch the note
        async with self._conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                "SELECT * FROM notes WHERE id = %s AND learner_id = %s",
                (note_id, learner_id),
            )
            note = await cur.fetchone()

        if not note:
            raise ValueError(f"Note {note_id} not found for learner {learner_id}")

        body = note["body_md"] or note.get("body", "") or ""
        title = note["title"]
        # Migration 007 columns. Absent (older rows / test doubles) → the
        # classifier alone decides and none of the note-type features run.
        note_type = note.get("note_type")
        has_note_type = "note_type" in note
        analogy_target = (
            str(note["analogy_target_concept_id"])
            if note_type == "ANALOGY" and note.get("analogy_target_concept_id") else None
        )
        locked_target = str(note["target_concept_id"]) if note.get("target_concept_id") else None
        analogy_label = (note.get("analogy_target_label") or "").strip() if note_type == "ANALOGY" else ""

        try:
            # Standalone analogy (migration 009): the topic has no note yet.
            # Resolve it to an existing concept or a locked placeholder once,
            # then remember it on the note.
            if note_type == "ANALOGY" and not analogy_target and analogy_label:
                analogy_target = await self._resolve_analogy_topic(learner_id, analogy_label, locked_target)
                async with self._conn.cursor() as cur:
                    await cur.execute(
                        "UPDATE notes SET analogy_target_concept_id = %s WHERE id = %s",
                        (analogy_target, note_id),
                    )

            # 2. Check if content changed (skip if hash matches). The note type,
            # analogy target, and attached source text are part of the
            # "content": changing any of them must re-ingest.
            source_blob = ""
            if note_type == "SOURCE_BACKED":
                async with self._conn.cursor(row_factory=dict_row) as cur:
                    await cur.execute(
                        "SELECT content_text FROM note_sources "
                        "WHERE note_id = %s AND btrim(content_text) <> ''",
                        (note_id,),
                    )
                    source_rows = await cur.fetchall()
                source_blob = "\n".join(
                    (row.get("content_text") or "").strip()
                    for row in source_rows
                    if (row.get("content_text") or "").strip()
                )
            hash_input = body if not has_note_type else (
                f"{body}\x00{note_type}\x00{analogy_target or ''}\x00{source_blob}"
            )
            content_hash = hashlib.sha256(hash_input.encode()).hexdigest()
            if note.get("markdown_hash") == content_hash:
                logger.info("Note %s unchanged, skipping ingestion", note_id)
                # Express set PENDING on save; restore READY so the UI doesn't spin forever.
                async with self._conn.cursor() as cur:
                    await cur.execute(
                        "UPDATE notes SET ingestion_status = 'READY' WHERE id = %s",
                        (note_id,),
                    )
                await self._conn.commit()
                return {"concept_id": None, "claims_count": 0, "status": "UNCHANGED"}

            # 3. Classify the note. The learner's declared note type wins over
            # the classifier's track guess, and a note the learner wrote is
            # always testable (OUT_OF_SCOPE would block every probe).
            classification = await self._classifier.classify(body)
            overrides = {}
            if note_type in NOTE_TYPE_TRACK:
                overrides["track"] = NOTE_TYPE_TRACK[note_type]
            if classification.category == "OUT_OF_SCOPE":
                overrides["category"] = "CONVENTIONAL"
            if overrides:
                classification = dataclasses.replace(classification, **overrides)

            # 4. Extract claims
            claims = await self._extractor.extract_claims(body, classification.shape)

            # 5. Compute embeddings
            label_embedding = as_vector(await self._embedding.compute_embedding(title))
            claim_embeddings = await self._embedding.compute_batch_embeddings(
                [c.text for c in claims]
            )
            new_claim_dicts = [
                {
                    "text": c.text,
                    "embedding": as_vector(emb),
                    "order_index": c.order_index,
                    "is_transition": c.is_transition,
                    "is_load_bearing": c.is_load_bearing,
                    "branch_id": c.branch_id,
                    "weight": 1.0,
                    "aliases": c.aliases or [],
                }
                for c, emb in zip(claims, claim_embeddings)
            ]

            # 5b. Source-backed notes must agree with their attached source.
            # Checked before any concept is written. A mismatch returns
            # normally (note status REJECTED) so the job does not fail.
            if note_type == "SOURCE_BACKED":
                mismatch = await self._source_mismatch(note_id, new_claim_dicts)
                if mismatch is not None:
                    await self._mark_rejected(note_id, mismatch)
                    return {
                        "concept_id": None,
                        "claims_count": 0,
                        "status": "REJECTED",
                        "source_match": mismatch["source_match"],
                        "reason": mismatch["reason"],
                    }

            # 6. Resolve concept identity
            existing_concepts = await self._load_learner_concepts(learner_id)
            by_id = {c["id"]: c for c in existing_concepts}
            # An analogy note must never be merged into the concept it is an
            # analogy OF (their labels are usually close in embedding space).
            # Embedded-analogy children (owned by another concept) are not
            # identity matches either.
            child_ids = await self._analogy_child_ids(learner_id) if has_note_type else set()
            identity_pool = [
                c for c in existing_concepts
                if c["id"] != analogy_target and c["id"] not in child_ids
            ]
            identity = resolve_concept_identity(label_embedding, identity_pool)

            locked_status = (
                by_id[locked_target]["status"] if locked_target and locked_target in by_id
                else await self._owned_status(learner_id, locked_target) if locked_target else None
            )
            if locked_status:
                # "Learn this concept" / "Write analogy" on a locked node:
                # this note IS that node (fills it in place, no duplicate).
                concept_id = locked_target
                mode = "promote" if locked_status == UNRESOLVED else "update"
            elif identity.is_new:
                # A placeholder created from an earlier note's prerequisite list
                # with the same label is this concept: promote, don't duplicate.
                placeholder = next(
                    (c for c in existing_concepts
                     if c["status"] == UNRESOLVED
                     and c["label"].strip().lower() == title.strip().lower()),
                    None,
                )
                if placeholder:
                    mode, concept_id = "promote", placeholder["id"]
                else:
                    mode, concept_id = "new", str(uuid4())
            else:
                concept_id = str(identity.concept_id)
                matched = by_id.get(concept_id)
                mode = "promote" if matched and matched["status"] == UNRESOLVED else "update"

            # A note maps to one concept; drop links left by an earlier
            # version of this note that resolved to a different concept.
            async with self._conn.cursor(row_factory=dict_row) as cur:
                await cur.execute(
                    "DELETE FROM note_concepts WHERE note_id = %s AND concept_id <> %s",
                    (note_id, concept_id),
                )
                await cur.execute(
                    "SELECT COUNT(*) AS n FROM note_concepts WHERE concept_id = %s AND note_id <> %s",
                    (concept_id, note_id),
                )
                row = await cur.fetchone()
                other_notes = int(row["n"]) if row else 0
            # Sole source of the concept → this note's content replaces the
            # previous version's claims and prerequisite edges.
            sole_source = other_notes == 0

            # 7. Prerequisites → concept ids (existing or placeholder)
            prereq_pool = [
                c for c in existing_concepts
                if c["id"] != concept_id and c["id"] not in child_ids
            ]
            if note_type == "ANALOGY":
                # An analogy hangs off its target via ANALOGY_OF; it has no
                # prerequisite chain of its own (and this saves a paid call).
                prereq_labels = []
            else:
                prereq_labels = await self._extractor.extract_prerequisites(
                    body,
                    # Placeholder labels are included so the model reuses them.
                    [c["label"] for c in prereq_pool],
                    concept_label=title,
                    # Prerequisites stay at the note's own level band.
                    bloom_level=classification.bloom_level,
                )
            prereq_ids, placeholders_created = await self._resolve_prerequisites(
                learner_id, prereq_labels, prereq_pool,
            )

            # 8. REQUIRES plan with cycle check (D-15) → prerequisite depth
            replace_requires = sole_source and mode != "new"
            requires_edges = await self._load_requires_edges(
                learner_id, exclude_source=concept_id if replace_requires else None,
            )
            forward = build_requires_forward(requires_edges)
            planned_edges, prereq_depth = plan_requires_edges(concept_id, prereq_ids, forward)

            # 9. Create / promote / version-bump the concept
            if mode in ("new", "promote"):
                version = await self._write_verified_concept(
                    mode, concept_id, learner_id, title, label_embedding,
                    classification, len(claims), prereq_depth, len(body.split()),
                )
                previous_claims: list[dict] = []
            else:
                version = await self._bump_version(concept_id)
                previous_claims = await self._load_claims(concept_id, version - 1)
                if has_note_type and sole_source:
                    # The note's declared type (and so the track) may have
                    # changed since the concept was created.
                    async with self._conn.cursor() as cur:
                        await cur.execute(
                            "UPDATE concepts SET track = %s, category = %s WHERE id = %s",
                            (classification.track, classification.category, concept_id),
                        )

            # 10. Write the complete claim set for this version
            claim_set = compose_claim_version(previous_claims, new_claim_dicts, sole_source)
            await self._insert_claims(concept_id, version, claim_set)
            new_claims_count = sum(1 for c in claim_set if not c["carried"])

            # 11. Link note to concept
            async with self._conn.cursor() as cur:
                await cur.execute(
                    """
                    INSERT INTO note_concepts (note_id, concept_id)
                    VALUES (%s, %s)
                    ON CONFLICT DO NOTHING
                    """,
                    (note_id, concept_id),
                )

            # 12. REQUIRES edges (flagged CYCLE_CONFLICT when they would close a cycle)
            await self._write_requires_edges(learner_id, concept_id, planned_edges, replace_requires)

            # 13. MERGE_CANDIDATE for the ambiguous identity band (§4.6)
            if (identity.is_merge_candidate and identity.best_match_id
                    and str(identity.best_match_id) != concept_id):
                async with self._conn.cursor() as cur:
                    await cur.execute(
                        """
                        INSERT INTO edges (id, learner_id, source_id, target_id, type, weight, confidence, flag)
                        VALUES (gen_random_uuid(), %s, %s, %s, 'SEMANTIC', %s, %s, 'MERGE_CANDIDATE')
                        ON CONFLICT (source_id, target_id, type)
                        DO UPDATE SET flag = 'MERGE_CANDIDATE', confidence = EXCLUDED.confidence
                        """,
                        (learner_id, concept_id, str(identity.best_match_id),
                         identity.similarity, identity.similarity),
                    )

            # 14. Wikilink edges
            wikilinks = extract_wikilinks(body)
            for target_label in wikilinks:
                async with self._conn.cursor(row_factory=dict_row) as cur:
                    await cur.execute(
                        "SELECT id FROM concepts WHERE learner_id = %s AND LOWER(canonical_label) = LOWER(%s)",
                        (learner_id, target_label),
                    )
                    target = await cur.fetchone()
                    if target and str(target["id"]) != concept_id:
                        await cur.execute(
                            """
                            INSERT INTO edges (id, learner_id, source_id, target_id, type, weight)
                            VALUES (gen_random_uuid(), %s, %s, %s, 'WIKILINK', 1.0)
                            ON CONFLICT (source_id, target_id, type) DO NOTHING
                            """,
                            (learner_id, concept_id, str(target["id"])),
                        )

            # 15. Semantic edges (placeholders are not semantic neighbours)
            semantic_neighbours = find_semantic_neighbours(
                label_embedding,
                [c for c in existing_concepts
                 if c["id"] != concept_id and c["status"] == VERIFIED
                 and c["id"] not in child_ids],
            )
            for neighbour in semantic_neighbours:
                async with self._conn.cursor() as cur:
                    await cur.execute(
                        """
                        INSERT INTO edges (id, learner_id, source_id, target_id, type, weight, confidence)
                        VALUES (gen_random_uuid(), %s, %s, %s, 'SEMANTIC', %s, %s)
                        ON CONFLICT (source_id, target_id, type) DO NOTHING
                        """,
                        (
                            learner_id, concept_id, neighbour["concept_id"],
                            neighbour["similarity"], neighbour["similarity"],
                        ),
                    )

            # 15b. Analogy links (migration 007 schema only).
            analogy_children = 0
            if has_note_type:
                await self._write_explicit_analogy_edge(learner_id, concept_id, analogy_target)
                if note_type != "ANALOGY":
                    analogy_children = await self._sync_embedded_analogy(
                        learner_id, concept_id, title, body,
                    )

            # 16. Update note status
            async with self._conn.cursor() as cur:
                await cur.execute(
                    """
                    UPDATE notes
                    SET ingestion_status = 'READY',
                        markdown_hash = %s,
                        source_match = NULL,
                        ingestion_rejection = NULL,
                        updated_at = NOW()
                    WHERE id = %s
                    """,
                    (content_hash, note_id),
                )

            # 17. Graph changed → per-learner recluster (deduped), same transaction
            if self._enqueue_recluster:
                from app.jobs.repository import JobRepository
                await JobRepository(self._conn).enqueue_recluster(learner_id)

            await self._conn.commit()

            return {
                "concept_id": concept_id,
                "claims_count": new_claims_count,
                "status": "READY",
                "is_new_concept": mode != "update",
                "concept_version": version,
                "prerequisites_count": len(planned_edges),
                "placeholders_created": placeholders_created,
                "analogy_children": analogy_children,
            }

        except Exception as e:
            # Mark note as failed
            logger.error("Ingestion failed for note %s: %s", note_id, e, exc_info=True)
            # Discard partial writes (and clear an aborted transaction) before
            # recording the failure, otherwise this UPDATE itself would fail.
            await self._conn.rollback()
            async with self._conn.cursor() as cur:
                await cur.execute(
                    "UPDATE notes SET ingestion_status = 'FAILED' WHERE id = %s",
                    (note_id,),
                )
            await self._conn.commit()
            raise

    # ------------------------------------------------------------------
    # Source agreement
    # ------------------------------------------------------------------

    async def _source_mismatch(self, note_id: str, note_claims: list[dict]) -> dict | None:
        """Return {source_match, reason} when the note does not match its source.

        No attached source text, or no claims to compare, means there is
        nothing to judge — ingestion continues. A failure of contradiction
        detection is ignored; grounding still decides.
        """
        if not note_claims:
            return None
        async with self._conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                "SELECT content_text FROM note_sources "
                "WHERE note_id = %s AND btrim(content_text) <> ''",
                (note_id,),
            )
            sources = await cur.fetchall()
        source_text = "\n\n".join(
            (row.get("content_text") or "").strip() for row in sources
        ).strip()
        if not source_text:
            return None

        source_claims = await self._extractor.extract_claims(source_text[:SOURCE_TEXT_LIMIT])
        if not source_claims:
            return None

        source_embeddings = await self._embedding.compute_batch_embeddings(
            [c.text for c in source_claims]
        )
        sim = build_similarity_matrix(
            [as_vector(emb) for emb in source_embeddings],
            [c["embedding"] for c in note_claims],
        )
        _matched, supported, _pairs = match_claims(sim, SOURCE_MATCH_THRESHOLD)
        grounding = grounding_fraction(supported)

        contradicted = [False] * len(note_claims)
        try:
            from app.nli.service import get_nli_service
            from app.grading.contradiction import ContradictionDetector
            from app.config import get_settings

            nli = get_nli_service(conn=self._conn)
            if nli.enabled:
                report = await ContradictionDetector(
                    nli, threshold=get_settings().nli_contradiction_threshold,
                ).detect(
                    source_claims=[c.text for c in source_claims],
                    learner_claims=[c["text"] for c in note_claims],
                )
                for pair in report.flagged_pairs:
                    idx = pair.learner_index
                    if 0 <= idx < len(contradicted):
                        contradicted[idx] = True
        except Exception:
            logger.warning("Contradiction check skipped for note %s", note_id, exc_info=True)

        bad = unsupported_contradiction_count(supported, contradicted)
        if not is_incorrect_note(grounding, bad):
            return None
        return {
            "source_match": grounding,
            "reason": rejection_reason(grounding, bad),
        }

    async def _mark_rejected(self, note_id: str, mismatch: dict) -> None:
        """Drop anything this run wrote, then record the refusal. Does not raise."""
        await self._conn.rollback()
        async with self._conn.cursor() as cur:
            await cur.execute(
                """
                UPDATE notes
                SET ingestion_status = 'REJECTED',
                    source_match = %s,
                    ingestion_rejection = %s,
                    updated_at = NOW()
                WHERE id = %s
                """,
                (mismatch["source_match"], mismatch["reason"], note_id),
            )
        await self._conn.commit()

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    async def _load_learner_concepts(self, learner_id: str) -> list[dict]:
        async with self._conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                "SELECT id, canonical_label AS label, label_embedding AS embedding, "
                "status::text AS status "
                "FROM concepts WHERE learner_id = %s AND label_embedding IS NOT NULL",
                (learner_id,),
            )
            rows = await cur.fetchall()
        # psycopg returns uuid.UUID / pgvector text; normalise once so identity
        # results, neighbour comparisons and the JSON response share one type.
        return [
            {
                "id": str(r["id"]),
                "label": r["label"],
                "embedding": as_vector(r["embedding"]),
                "status": r.get("status") or VERIFIED,
            }
            for r in rows
        ]

    # -- analogy nodes (migration 007) ------------------------------------

    _CHILD_ANALOGY_SQL = (
        "SELECT DISTINCT c.id FROM concepts c "
        "JOIN edges e ON e.source_id = c.id AND e.type = 'ANALOGY_OF' "
        "WHERE c.learner_id = %s AND c.track = 'ANALOGY' "
        # Empty analogy nodes the learner added ("Add analogy node") are
        # locked and waiting for their own note; they are not detected children.
        "AND c.status = 'VERIFIED_CONCEPT' "
        "AND NOT EXISTS (SELECT 1 FROM note_concepts nc WHERE nc.concept_id = c.id)"
    )

    async def _owned_status(self, learner_id: str, concept_id: str) -> str | None:
        """Status of a learner's concept (covers placeholders with no embedding)."""
        async with self._conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                "SELECT status::text AS status FROM concepts WHERE id = %s AND learner_id = %s",
                (concept_id, learner_id),
            )
            row = await cur.fetchone()
        return row["status"] if row else None

    async def _resolve_analogy_topic(
        self, learner_id: str, label: str, exclude_id: str | None,
    ) -> str:
        """Concept for an analogy's topic: exact label, else identity match on
        the label embedding, else a new locked placeholder for the topic."""
        label = " ".join(label.split())[:120]
        async with self._conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                "SELECT id FROM concepts WHERE learner_id = %s AND LOWER(canonical_label) = LOWER(%s) "
                "AND track <> 'ANALOGY' AND (%s::uuid IS NULL OR id <> %s::uuid) LIMIT 1",
                (learner_id, label, exclude_id, exclude_id),
            )
            row = await cur.fetchone()
        if row:
            return str(row["id"])
        emb = as_vector(await self._embedding.compute_embedding(label))
        pool = [c for c in await self._load_learner_concepts(learner_id) if c["id"] != exclude_id]
        res = resolve_concept_identity(emb, pool)
        if not res.is_new and res.concept_id:
            return str(res.concept_id)
        pid = str(uuid4())
        async with self._conn.cursor() as cur:
            await cur.execute(
                """INSERT INTO concepts (id, learner_id, canonical_label, label_embedding,
                       track, shape, category, status, version, probe_eligible)
                   VALUES (%s, %s, %s, %s::vector, %s, %s, %s, 'UNRESOLVED_PREREQUISITE', 1, false)""",
                (pid, learner_id, label, _vector_literal(emb),
                 PLACEHOLDER_TRACK, PLACEHOLDER_SHAPE, PLACEHOLDER_CATEGORY),
            )
        return pid

    async def _analogy_child_ids(self, learner_id: str, parent_id: str | None = None) -> set[str]:
        """Analogy nodes detected inside a note: owned by their parent concept
        through an ANALOGY_OF edge and not linked to any note of their own."""
        sql, params = self._CHILD_ANALOGY_SQL, [learner_id]
        if parent_id:
            sql += " AND e.target_id = %s"
            params.append(parent_id)
        async with self._conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(sql, params)
            rows = await cur.fetchall()
        return {str(r["id"]) for r in rows}

    async def _write_explicit_analogy_edge(
        self, learner_id: str, concept_id: str, target_id: str | None,
    ) -> None:
        """An ANALOGY note's concept ANALOGY_OF its declared target. Replaced
        on every ingest so changing (or clearing) the target is reflected."""
        async with self._conn.cursor() as cur:
            # Children point child -> parent, so the parent's outgoing
            # ANALOGY_OF edges are exactly its explicit analogy target.
            await cur.execute(
                "DELETE FROM edges WHERE source_id = %s AND type = 'ANALOGY_OF'",
                (concept_id,),
            )
            if target_id and target_id != concept_id:
                # Ownership enforced by the SELECT: a foreign id inserts nothing.
                await cur.execute(
                    """
                    INSERT INTO edges (id, learner_id, source_id, target_id, type, weight)
                    SELECT gen_random_uuid(), %s, %s, c.id, 'ANALOGY_OF', 1.0
                    FROM concepts c WHERE c.id = %s AND c.learner_id = %s
                    ON CONFLICT (source_id, target_id, type) DO NOTHING
                    """,
                    (learner_id, concept_id, target_id, learner_id),
                )

    async def _sync_embedded_analogy(
        self, learner_id: str, parent_id: str, title: str, body: str,
    ) -> int:
        """Detect an analogy the learner wrote inside this note and keep one
        ANALOGY child node for it (ANALOGY_OF → parent). The paid detection
        call only runs when the body contains an analogy cue. Returns the
        number of child nodes now attached (0 or 1)."""
        existing = sorted(await self._analogy_child_ids(learner_id, parent_id))
        detected = None
        detect = getattr(self._extractor, "extract_embedded_analogy", None)
        if detect is not None and has_analogy_cue(body):
            try:
                detected = await detect(body, title)
            except Exception as exc:  # detection is best-effort; never fail ingest
                logger.warning("Embedded analogy detection failed: %s", exc)
                detected = None

        keep: str | None = None
        if detected and detected.claims:
            label = detected.label
            label_emb = as_vector(await self._embedding.compute_embedding(label))
            claim_embs = await self._embedding.compute_batch_embeddings(detected.claims)
            claim_set = [
                {"text": t, "embedding": as_vector(e), "order_index": i,
                 "is_transition": False, "is_load_bearing": False, "branch_id": None,
                 "weight": 1.0, "aliases": []}
                for i, (t, e) in enumerate(zip(detected.claims, claim_embs))
            ]
            if existing:
                keep = existing[0]
                async with self._conn.cursor() as cur:
                    await cur.execute(
                        "UPDATE concepts SET canonical_label = %s, label_embedding = %s::vector "
                        "WHERE id = %s AND learner_id = %s",
                        (label, _vector_literal(label_emb), keep, learner_id),
                    )
                version = await self._bump_version(keep)
            else:
                keep = str(uuid4())
                version = await self._write_verified_concept(
                    "new", keep, learner_id, label, label_emb,
                    EMBEDDED_ANALOGY_CLASSIFICATION, len(claim_set), 0,
                    sum(len(t.split()) for t in detected.claims),
                )
                async with self._conn.cursor() as cur:
                    await cur.execute(
                        """
                        INSERT INTO edges (id, learner_id, source_id, target_id, type, weight)
                        VALUES (gen_random_uuid(), %s, %s, %s, 'ANALOGY_OF', 1.0)
                        ON CONFLICT (source_id, target_id, type) DO NOTHING
                        """,
                        (learner_id, keep, parent_id),
                    )
            await self._insert_claims(keep, version, claim_set)

        stale = [cid for cid in existing if cid != keep]
        if stale:
            async with self._conn.cursor() as cur:
                await cur.execute(
                    "DELETE FROM concepts WHERE id = ANY(%s::uuid[]) AND learner_id = %s",
                    (stale, learner_id),
                )
        return 1 if keep else 0

    async def _resolve_prerequisites(
        self, learner_id: str, labels: list[str], candidates: list[dict],
    ) -> tuple[list[str], int]:
        """Map prerequisite labels to concept ids, creating placeholders.

        Resolution order: exact (case-insensitive) label → identity
        resolution on the label embedding (sim >= τ_identity) → new
        UNRESOLVED_PREREQUISITE placeholder.
        """
        if not labels:
            return [], 0
        candidates = list(candidates)  # placeholders created here are appended
        embeddings = await self._embedding.compute_batch_embeddings(labels)
        ids: list[str] = []
        created = 0
        for label, emb in zip(labels, embeddings):
            emb = as_vector(emb)
            exact = next(
                (c for c in candidates if c["label"].strip().lower() == label.strip().lower()),
                None,
            )
            if exact:
                ids.append(exact["id"])
                continue
            res = resolve_concept_identity(emb, candidates)
            if not res.is_new and res.concept_id:
                ids.append(str(res.concept_id))
                continue
            pid = str(uuid4())
            async with self._conn.cursor() as cur:
                await cur.execute(
                    """
                    INSERT INTO concepts (
                        id, learner_id, canonical_label, label_embedding,
                        track, shape, category, status, version, probe_eligible
                    ) VALUES (
                        %s, %s, %s, %s::vector,
                        %s, %s, %s, 'UNRESOLVED_PREREQUISITE', 1, false
                    )
                    """,
                    (pid, learner_id, label, _vector_literal(emb),
                     PLACEHOLDER_TRACK, PLACEHOLDER_SHAPE, PLACEHOLDER_CATEGORY),
                )
            candidates.append({"id": pid, "label": label, "embedding": emb, "status": UNRESOLVED})
            ids.append(pid)
            created += 1
        return ids, created

    async def _load_requires_edges(self, learner_id: str, exclude_source: str | None) -> list[dict]:
        async with self._conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                "SELECT source_id, target_id, flag::text AS flag FROM edges "
                "WHERE learner_id = %s AND type = 'REQUIRES'",
                (learner_id,),
            )
            rows = await cur.fetchall()
        return [
            r for r in rows
            if exclude_source is None or str(r["source_id"]) != exclude_source
        ]

    async def _write_verified_concept(
        self,
        mode: str,
        concept_id: str,
        learner_id: str,
        title: str,
        label_embedding: list[float],
        classification: ClassificationResult,
        claim_count: int,
        prereq_depth: int,
        token_count: int,
    ) -> int:
        """Insert a new concept or promote a placeholder. Returns its version."""
        c_struct = compute_structural_complexity(claim_count, prereq_depth, token_count)
        c_0 = compute_initial_complexity(c_struct, classification.bloom_level)
        h_0 = calculate_initial_half_life(c_0)
        # N_req is frozen from C_0 (D-05); C_0 is fixed at first ingest, so
        # computing it here is equivalent to "at first probe".
        n_req = calculate_required_streak(c_0, classification.shape == "PROCEDURAL")

        version = 1
        async with self._conn.cursor(row_factory=dict_row) as cur:
            if mode == "new":
                await cur.execute(
                    """
                    INSERT INTO concepts (
                        id, learner_id, canonical_label, label_embedding,
                        track, shape, category, status, version,
                        c_struct, c_bloom, c_0, c_current, n_req, solo_level,
                        source_trust_tier
                    ) VALUES (
                        %s, %s, %s, %s::vector,
                        %s, %s, %s, 'VERIFIED_CONCEPT', 1,
                        %s, %s, %s, %s, %s, 'Prestructural',
                        NULL
                    )
                    """,
                    (
                        concept_id, learner_id, title, _vector_literal(label_embedding),
                        classification.track, classification.shape,
                        classification.category,
                        c_struct, classification.bloom_level, c_0, c_0, n_req,
                    ),
                )
            else:
                # Promotion keeps the id (existing REQUIRES edges point at it)
                # and the version (a placeholder never had claims or probes).
                await cur.execute(
                    """
                    UPDATE concepts
                    SET canonical_label = %s, label_embedding = %s::vector,
                        track = %s, shape = %s, category = %s,
                        status = 'VERIFIED_CONCEPT', probe_eligible = true,
                        c_struct = %s, c_bloom = %s, c_0 = %s, c_current = %s,
                        n_req = %s
                    WHERE id = %s
                    RETURNING version
                    """,
                    (
                        title, _vector_literal(label_embedding),
                        classification.track, classification.shape,
                        classification.category,
                        c_struct, classification.bloom_level, c_0, c_0, n_req,
                        concept_id,
                    ),
                )
                row = await cur.fetchone()
                version = int(row["version"]) if row else 1

            await cur.execute(
                """
                INSERT INTO memory_states (concept_id, learner_id, half_life)
                VALUES (%s, %s, %s)
                ON CONFLICT DO NOTHING
                """,
                (concept_id, learner_id, h_0),
            )
        return version

    async def _bump_version(self, concept_id: str) -> int:
        async with self._conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                "UPDATE concepts SET version = version + 1 WHERE id = %s "
                "RETURNING version, c_0, shape::text AS shape, n_req",
                (concept_id,),
            )
            row = await cur.fetchone()
            if not row:
                raise ValueError(f"Concept {concept_id} disappeared during ingestion")
            # Concepts created before N_req was persisted get it once (frozen).
            if row.get("n_req") is None and row.get("c_0") is not None:
                await cur.execute(
                    "UPDATE concepts SET n_req = %s WHERE id = %s AND n_req IS NULL",
                    (calculate_required_streak(row["c_0"], row.get("shape") == "PROCEDURAL"),
                     concept_id),
                )
        return int(row["version"])

    async def _load_claims(self, concept_id: str, version: int) -> list[dict]:
        async with self._conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """SELECT text, embedding, order_index, is_transition, is_load_bearing,
                          branch_id, weight, aliases
                   FROM claims
                   WHERE concept_id = %s AND concept_version = %s
                   ORDER BY order_index ASC NULLS LAST, created_at ASC""",
                (concept_id, version),
            )
            rows = await cur.fetchall()
        return [
            {
                "text": r["text"],
                "embedding": as_vector(r["embedding"]) if r.get("embedding") is not None else None,
                "order_index": r.get("order_index"),
                "is_transition": bool(r.get("is_transition")),
                "is_load_bearing": bool(r.get("is_load_bearing")),
                "branch_id": r.get("branch_id"),
                "weight": r.get("weight") if r.get("weight") is not None else 1.0,
                "aliases": list(r.get("aliases") or []),
            }
            for r in rows
        ]

    async def _insert_claims(self, concept_id: str, version: int, claim_set: list[dict]) -> None:
        for c in claim_set:
            async with self._conn.cursor() as cur:
                await cur.execute(
                    """
                    INSERT INTO claims (
                        id, concept_id, concept_version, text, embedding,
                        order_index, is_transition, is_load_bearing,
                        branch_id, weight, aliases
                    ) VALUES (
                        gen_random_uuid(), %s, %s, %s, %s::vector,
                        %s, %s, %s, %s, %s, %s
                    )
                    """,
                    (
                        concept_id, version, c["text"], _vector_literal(c.get("embedding")),
                        c.get("order_index"), bool(c.get("is_transition")),
                        bool(c.get("is_load_bearing")), c.get("branch_id"),
                        float(c.get("weight") or 1.0), list(c.get("aliases") or []),
                    ),
                )

    async def _write_requires_edges(
        self, learner_id: str, concept_id: str, planned: list[dict], replace: bool,
    ) -> None:
        async with self._conn.cursor() as cur:
            if replace:
                # Sole-source re-ingest: the new prerequisite list supersedes the old one.
                await cur.execute(
                    "DELETE FROM edges WHERE source_id = %s AND type = 'REQUIRES'",
                    (concept_id,),
                )
            for e in planned:
                await cur.execute(
                    """
                    INSERT INTO edges (id, learner_id, source_id, target_id, type, weight, flag)
                    VALUES (gen_random_uuid(), %s, %s, %s, 'REQUIRES', 1.0, %s::edge_flag)
                    ON CONFLICT (source_id, target_id, type) DO NOTHING
                    """,
                    (learner_id, e["source_id"], e["target_id"], e["flag"]),
                )
