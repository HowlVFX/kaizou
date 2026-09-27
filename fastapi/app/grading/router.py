"""Grading API router (§12 — FastAPI service boundary).

Endpoints:
    POST /grade               — Grade a probe attempt
    POST /grade/contradiction — Run contradiction detection

The pipeline lives in app.grading.service.GradingService (shared with
/probes/grade-attempt and /review/answer):
    1. Load the probe, verify learner/concept ownership
    2. Grade against the probe's answer_key_snapshot by probe type
    3. Contradiction evidence via local NLI (explicit flag when disabled)
    4. Persist attempt + misconception_events
    5. Update memory, mastery, SOLO level

🔒 All scoring is deterministic math. The LLM never sees scores.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
import psycopg

from app.dependencies import get_db
from app.grading.schemas import (
    GradeRequest,
    GradeResponse,
    ContradictionRequest,
    ContradictionResponse,
)
from app.grading.service import GradingService, GradingServiceError

router = APIRouter(prefix="/grade", tags=["Grading"])


@router.post("", response_model=GradeResponse)
async def grade_attempt(
    request: GradeRequest,
    db: psycopg.AsyncConnection = Depends(get_db),
):
    """Grade a probe attempt through the full deterministic pipeline."""
    try:
        return await GradingService(db).grade(
            probe_id=str(request.probe_id),
            learner_id=str(request.learner_id),
            concept_id=str(request.concept_id) if request.concept_id else None,
            concept_version=request.concept_version,
            answer_text=request.answer_text,
            answer_payload=request.answer_payload,
            confidence_pre=request.confidence_pre,
        )
    except GradingServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@router.post("/contradiction", response_model=ContradictionResponse)
async def run_contradiction(
    request: ContradictionRequest,
    db: psycopg.AsyncConnection = Depends(get_db),
):
    """Run standalone contradiction detection (§5.10).

    Uses the local NLI model (premise = source claim, hypothesis = learner
    claim). If NLI is disabled/unavailable, returns an explicit flag rather
    than silently reporting zero contradictions — "no check ran" and "no
    contradictions found" are different facts (§P12).

    NLI is CPU-bound; large batches belong in the worker. This endpoint
    serves small on-demand checks.
    """
    from app.config import get_settings
    from app.nli.service import get_nli_service, NLIUnavailable
    from app.grading.contradiction import ContradictionDetector

    settings = get_settings()
    nli = get_nli_service(conn=db)
    if not nli.enabled:
        return ContradictionResponse(
            contradiction_count=0,
            flagged_pairs=[{"nli_disabled": True,
                            "note": "NLI unavailable — no contradiction check ran"}],
        )
    detector = ContradictionDetector(nli, threshold=settings.nli_contradiction_threshold)
    try:
        report = await detector.detect(request.source_claims, request.learner_claims)
    except NLIUnavailable:
        return ContradictionResponse(
            contradiction_count=0,
            flagged_pairs=[{"nli_disabled": True,
                            "note": "NLI unavailable — no contradiction check ran"}],
        )
    return ContradictionResponse(
        contradiction_count=report.contradiction_count,
        flagged_pairs=report.to_dict()["flagged_pairs"],
    )
