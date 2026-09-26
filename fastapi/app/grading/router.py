"""Grading API router (§12 — FastAPI service boundary).

Endpoints:
    POST /grade           — Grade a probe attempt
    POST /grade/contradiction — Run contradiction detection

The router coordinates the deterministic grading pipeline:
    1. Fetch answer key (claims) from DB
    2. Segment learner answer into claims
    3. Compute embeddings
    4. Run claim matching (§5.2)
    5. Calculate coverage, precision, ordering, verbatim, composite (§5.3-5.8)
    6. Generate gap report (§5.9)
    7. Persist attempt record
    8. Update memory state

🔒 All scoring is deterministic math. The LLM never sees scores.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
import psycopg
from psycopg.rows import dict_row

from app.dependencies import get_db
from app.grading.schemas import (
    GradeRequest,
    GradeResponse,
    ContradictionRequest,
    ContradictionResponse,
)
from app.grading.coverage import (
    build_similarity_matrix,
    match_claims,
    calculate_claim_weight,
    calculate_coverage,
)
from app.grading.precision import calculate_precision
from app.grading.ordering import calculate_kendall_tau_b, calculate_ordering_score
from app.grading.verbatim import calculate_verbatim_ratio, calculate_verbatim_penalty
from app.grading.composite import (
    calculate_composite_score,
    classify_understanding_band,
    calculate_branch_leakage,
)
from app.grading.gap_report import GapReportBuilder

router = APIRouter(prefix="/grade", tags=["Grading"])


@router.post("", response_model=GradeResponse)
async def grade_attempt(
    request: GradeRequest,
    db: psycopg.AsyncConnection = Depends(get_db),
):
    """Grade a probe attempt through the full deterministic pipeline."""

    # 1. Fetch probe and its answer key
    async with db.cursor(row_factory=dict_row) as cur:
        await cur.execute(
            "SELECT * FROM probes WHERE id = %s",
            (str(request.probe_id),),
        )
        probe = await cur.fetchone()

    if not probe:
        raise HTTPException(status_code=404, detail="Probe not found")

    # 2. Fetch the concept's claims (answer key)
    async with db.cursor(row_factory=dict_row) as cur:
        await cur.execute(
            """SELECT text, order_index, is_transition, is_load_bearing,
                      branch_id, weight, aliases, embedding
               FROM claims
               WHERE concept_id = %s AND concept_version = %s
               ORDER BY order_index ASC NULLS LAST""",
            (str(request.concept_id), request.concept_version),
        )
        answer_key_rows = await cur.fetchall()

    if not answer_key_rows:
        raise HTTPException(
            status_code=422,
            detail="No claims found for this concept version",
        )

    # 3. Fetch the concept's shape
    async with db.cursor(row_factory=dict_row) as cur:
        await cur.execute(
            "SELECT shape, c_current FROM concepts WHERE id = %s",
            (str(request.concept_id),),
        )
        concept_row = await cur.fetchone()

    if not concept_row:
        raise HTTPException(status_code=404, detail="Concept not found")

    shape = concept_row["shape"]
    is_ordered = shape in ("ORDERED_PROCESS", "PROCEDURAL")

    # 4. Handle empty answer → short-circuit to Not_Yet_Engaged
    if not request.answer_text and not request.answer_payload:
        attempt_id = await _persist_attempt(
            db, request, score=0.0, band="Not_Yet_Engaged",
            coverage=0.0, ordering=None, precision=0.0,
            verbatim=0.0, branch_leakage=0.0, gap_report={},
            passed=False, predicted_recall=None,
        )
        return GradeResponse(
            attempt_id=attempt_id,
            composite_score=0.0,
            band="Not_Yet_Engaged",
            coverage=0.0,
            ordering=None,
            precision=0.0,
            verbatim=0.0,
            branch_leakage=0.0,
            gap_report={},
            passed=False,
        )

    # 5. Compute embeddings for the learner's answer
    # Split learner answer into sentences (claims)
    answer_text = request.answer_text or ""
    learner_sentences = _segment_into_sentences(answer_text)

    if not learner_sentences:
        attempt_id = await _persist_attempt(
            db, request, score=0.0, band="Not_Yet_Engaged",
            coverage=0.0, ordering=None, precision=0.0,
            verbatim=0.0, branch_leakage=0.0, gap_report={},
            passed=False, predicted_recall=None,
        )
        return GradeResponse(
            attempt_id=attempt_id,
            composite_score=0.0,
            band="Not_Yet_Engaged",
            coverage=0.0,
            ordering=None,
            precision=0.0,
            verbatim=0.0,
            branch_leakage=0.0,
            gap_report={},
            passed=False,
        )

    # Get embeddings from the ingestion embedding service
    from app.ingestion.embedding import create_embedding_service
    from app.config import get_settings

    settings = get_settings()
    emb_service = create_embedding_service(settings)

    learner_embeddings = await emb_service.compute_batch_embeddings(learner_sentences)

    # Answer key embeddings (from DB)
    answer_key_embeddings = [
        row["embedding"] for row in answer_key_rows
    ]
    answer_key_texts = [row["text"] for row in answer_key_rows]

    # 6. Build similarity matrix and match claims (§5.2)
    # Build alias table
    alias_table: dict[int, list[str]] = {}
    for i, row in enumerate(answer_key_rows):
        if row.get("aliases"):
            alias_table[i] = row["aliases"]

    sim_matrix = build_similarity_matrix(
        answer_key_embeddings,
        learner_embeddings,
        alias_table=alias_table,
        learner_texts=learner_sentences,
    )

    matched_req, supported_learn, match_pairs = match_claims(
        sim_matrix, threshold=settings.semantic_match_threshold,
    )

    # 7. Calculate weights
    weights = [
        calculate_claim_weight(
            row["is_transition"], row["is_load_bearing"], row["weight"],
        )
        for row in answer_key_rows
    ]

    # 8. Coverage (§5.3)
    coverage = calculate_coverage(matched_req, weights)

    # 9. Precision (§5.4)
    precision = calculate_precision(supported_learn, len(learner_sentences))

    # 10. Ordering (§5.5) — only for ordered shapes
    ordering_score = None
    if is_ordered:
        # Build the ordering sequences from match pairs
        canonical_order = []
        learner_offsets = []
        for i, j, sim in match_pairs:
            if answer_key_rows[i]["order_index"] is not None:
                canonical_order.append(answer_key_rows[i]["order_index"])
                # Use sentence index as proxy for character offset
                learner_offsets.append(j)

        tau_b = calculate_kendall_tau_b(canonical_order, learner_offsets)
        ordering_score = calculate_ordering_score(tau_b)

    # 11. Verbatim penalty (§5.6)
    answer_tokens = answer_text.lower().split()
    source_tokens = " ".join(answer_key_texts).lower().split()
    v_ratio = calculate_verbatim_ratio(answer_tokens, source_tokens)
    verbatim = calculate_verbatim_penalty(v_ratio, settings.verbatim_dead_zone)

    # 12. Branch leakage (§5.7)
    branch_leakage = 0.0
    target_branch = request.answer_payload.get("target_branch") if request.answer_payload else None
    if target_branch:
        non_target_matched = []
        non_target_weights = []
        target_weights = []

        for i, row in enumerate(answer_key_rows):
            if row["branch_id"] == target_branch:
                target_weights.append(weights[i])
            elif row["branch_id"] is not None:
                non_target_matched.append(matched_req[i])
                non_target_weights.append(weights[i])

        if target_weights:
            branch_leakage = calculate_branch_leakage(
                non_target_matched, non_target_weights, target_weights,
            )

    # 13. Composite score (§5.8)
    composite = calculate_composite_score(
        coverage, precision, ordering_score, verbatim, branch_leakage,
    )

    # 14. Band classification (§5.8.3)
    all_transitions_matched = all(
        matched_req[i]
        for i, row in enumerate(answer_key_rows)
        if row["is_transition"]
    )
    band = classify_understanding_band(composite, all_transitions_matched)

    # 15. Gap report (§5.9)
    builder = GapReportBuilder()
    gap_report = builder.build(
        matched_claims=matched_req,
        answer_key_claims=answer_key_texts,
        weights=weights,
        is_transition=[row["is_transition"] for row in answer_key_rows],
        is_load_bearing=[row["is_load_bearing"] for row in answer_key_rows],
        coverage=coverage,
        band=band,
    )

    passed = composite >= settings.pass_threshold

    # 16. Persist attempt
    # Compute predicted recall for memory update
    predicted_recall = None
    from app.memory.service import MemoryService
    mem_service = MemoryService(db)
    mem_state = await mem_service.get_memory_state(
        str(request.concept_id), str(request.learner_id),
    )
    if mem_state:
        predicted_recall = mem_state.get("recall")

    attempt_id = await _persist_attempt(
        db, request,
        score=composite, band=band,
        coverage=coverage, ordering=ordering_score,
        precision=precision, verbatim=verbatim,
        branch_leakage=branch_leakage,
        gap_report=gap_report.to_dict(),
        passed=passed, predicted_recall=predicted_recall,
    )

    # 17. Update memory state
    if mem_state:
        await mem_service.update_after_attempt(
            str(request.concept_id),
            str(request.learner_id),
            composite,
            passed,
            predicted_recall or 0.5,
        )

    return GradeResponse(
        attempt_id=attempt_id,
        composite_score=composite,
        band=band,
        coverage=coverage,
        ordering=ordering_score,
        precision=precision,
        verbatim=verbatim,
        branch_leakage=branch_leakage,
        gap_report=gap_report.to_dict(),
        passed=passed,
    )


@router.post("/contradiction", response_model=ContradictionResponse)
async def run_contradiction(request: ContradictionRequest):
    """Run standalone contradiction detection (§5.10).

    Note: this endpoint requires an NLI model to be loaded. If not
    available, returns a placeholder response.
    """
    # Contradiction detection requires an NLI model
    # For now, return empty — will be implemented when NLI model is loaded
    return ContradictionResponse(
        contradiction_count=0,
        flagged_pairs=[],
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _segment_into_sentences(text: str) -> list[str]:
    """Split text into sentence-level claims.

    Simple rule-based segmentation. For production, consider using
    a sentence tokenizer (e.g., spaCy or NLTK punkt).
    """
    import re
    # Split on sentence-ending punctuation
    raw = re.split(r'(?<=[.!?])\s+', text.strip())
    # Filter empties and very short fragments
    return [s.strip() for s in raw if len(s.strip()) > 10]


async def _persist_attempt(
    db: psycopg.AsyncConnection,
    request: GradeRequest,
    *,
    score: float,
    band: str,
    coverage: float,
    ordering: float | None,
    precision: float,
    verbatim: float,
    branch_leakage: float,
    gap_report: dict,
    passed: bool,
    predicted_recall: float | None,
) -> str:
    """Insert an attempt record and return its ID."""
    import psycopg.types.json

    async with db.cursor() as cur:
        await cur.execute(
            """
            INSERT INTO attempts (
                id, learner_id, probe_id, concept_id, concept_version,
                answer_text, answer_payload, confidence_pre,
                coverage, ordering, precision_score, verbatim,
                branch_leakage, composite_score, band,
                predicted_recall, passed, gap_report
            ) VALUES (
                gen_random_uuid(), %s, %s, %s, %s,
                %s, %s::jsonb, %s,
                %s, %s, %s, %s,
                %s, %s, %s,
                %s, %s, %s::jsonb
            ) RETURNING id
            """,
            (
                str(request.learner_id), str(request.probe_id),
                str(request.concept_id), request.concept_version,
                request.answer_text,
                psycopg.types.json.Jsonb(request.answer_payload) if request.answer_payload else None,
                request.confidence_pre,
                coverage, ordering, precision, verbatim,
                branch_leakage, score, band,
                predicted_recall, passed,
                psycopg.types.json.Jsonb(gap_report),
            ),
        )
        row = await cur.fetchone()

    await db.commit()
    return str(row[0])