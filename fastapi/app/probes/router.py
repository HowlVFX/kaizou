"""Probe generation and grading router (§8, §12).

Endpoints:
    POST /probes/generate       — Generate a probe for a concept
    POST /probes/check-leakage  — Check probe for answer leakage
    POST /probes/grade-attempt  — Grade a probe attempt (shared grading path)

Probe types (§8):
    CLOZE, RECALL, PROCESS_TRACE, PROCEDURAL, MISCONCEPTION_MCQ,
    CONCEPT_SORT, PERTURBATION, NEAR_TRANSFER, FAR_TRANSFER,
    ANALOGY_FORWARD, ANALOGY_SIMULATE, ANALOGY_BREAKDOWN

Generation, templates, leakage retry and fallback live in
app.probes.service.ProbeService; this module is the HTTP wrapper.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
import psycopg

from app.dependencies import get_db
from app.probes.schemas import (
    GenerateProbeRequest,
    GenerateProbeResponse,
    CheckLeakageRequest,
    CheckLeakageResponse,
    GradeAttemptRequest,
)
from app.probes.leakage import validate_probe
from app.probes.service import ProbeService, ProbeServiceError
from app.grading.schemas import GradeResponse
from app.grading.service import GradingService, GradingServiceError

router = APIRouter(prefix="/probes", tags=["Probes"])


@router.post("/generate", response_model=GenerateProbeResponse)
async def generate_probe(
    request: GenerateProbeRequest,
    db: psycopg.AsyncConnection = Depends(get_db),
):
    """Generate a probe for a concept (§6.7).

    probe_type is validated before any paid call (422 if invalid). Provider
    failures (budget exhausted, missing key, outage) and exhausted leakage
    retries fall back to a hand-authored probe instead of failing.
    """
    try:
        result = await ProbeService(db).generate_probe_for_concept(
            concept_id=str(request.concept_id),
            learner_id=str(request.learner_id),
            probe_type=request.probe_type,
            concept_version=request.concept_version,
        )
    except ProbeServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return GenerateProbeResponse(**result)


@router.post("/check-leakage", response_model=CheckLeakageResponse)
async def check_leakage(
    request: CheckLeakageRequest,
    db: psycopg.AsyncConnection = Depends(get_db),
):
    """Check a probe text for answer leakage (§5.15)."""
    from app.ingestion.embedding import create_embedding_service
    from app.config import get_settings

    settings = get_settings()
    emb_service = create_embedding_service(settings, conn=db)

    probe_embedding = await emb_service.compute_embedding(request.probe_text)
    claim_embeddings = await emb_service.compute_batch_embeddings(
        request.required_claims,
    )
    claim_token_lists = [c.split() for c in request.required_claims]

    is_valid, sem_score, lex_score = validate_probe(
        probe_embedding, request.probe_text.split(),
        claim_embeddings, claim_token_lists,
        semantic_threshold=settings.probe_leakage_semantic,
        lexical_threshold=settings.probe_leakage_ngram,
        ngram_n=settings.probe_leakage_ngram_n,
    )

    return CheckLeakageResponse(
        is_valid=is_valid,
        semantic_score=sem_score,
        lexical_score=lex_score,
    )


@router.post("/grade-attempt", response_model=GradeResponse)
async def grade_probe_attempt(
    request: GradeAttemptRequest,
    db: psycopg.AsyncConnection = Depends(get_db),
):
    """Grade a probe attempt via the shared grading path."""
    try:
        return await GradingService(db).grade(
            probe_id=str(request.probe_id),
            learner_id=str(request.learner_id),
            answer_text=request.answer_text,
            answer_payload=request.answer_payload,
            confidence_pre=request.confidence_pre,
        )
    except GradingServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
