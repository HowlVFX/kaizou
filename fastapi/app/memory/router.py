"""Review queue API (Â§5.20, Â§6.9).

Express proxies here:  GET  /review/queue?learner_id=...
                       POST /review/answer?learner_id=...   (body forwarded)

The review queue logic lives in MemoryService; grading in GradingService.
This is the HTTP wrapper.
"""
from __future__ import annotations

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
import psycopg

from app.dependencies import get_db
from app.grading.schemas import GradeResponse, ReviewAnswerRequest
from app.grading.service import GradingService, GradingServiceError
from app.memory.service import MemoryService

router = APIRouter(prefix="/review", tags=["Review"])


@router.get("/queue")
async def review_queue(
    learner_id: UUID = Query(...),
    session_size: Optional[int] = Query(None, ge=1, le=50),
    db: psycopg.AsyncConnection = Depends(get_db),
):
    """Return the prioritised review queue for a learner."""
    from app.config import get_settings
    size = session_size or get_settings().default_session_size
    queue = await MemoryService(db).get_review_queue(str(learner_id), size)
    return {"queue": queue, "count": len(queue)}


@router.post("/answer", response_model=GradeResponse)
async def review_answer(
    body: ReviewAnswerRequest,
    learner_id: UUID = Query(...),
    db: psycopg.AsyncConnection = Depends(get_db),
):
    """Submit an answer to a review probe.

    Grades via the shared grading path, records the attempt, updates the
    memory state (half-life), mastery and SOLO level, and returns the grade
    plus the next review time.
    """
    try:
        return await GradingService(db).grade(
            probe_id=str(body.probe_id),
            learner_id=str(learner_id),
            answer_text=body.answer_text,
            answer_payload=body.answer_payload,
            confidence_pre=body.confidence_pre,
        )
    except GradingServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
