"""Pydantic schemas for the grading API (§5, §12)."""
from __future__ import annotations

from pydantic import BaseModel
from uuid import UUID
from typing import Optional, List, Dict, Any, Tuple


class GradeRequest(BaseModel):
    """Request body for POST /grade."""
    probe_id: UUID
    learner_id: UUID
    concept_id: UUID
    concept_version: int
    answer_text: Optional[str] = None
    answer_payload: Optional[Dict[str, Any]] = None
    confidence_pre: Optional[float] = None


class GradeResponse(BaseModel):
    """Response body from POST /grade."""
    attempt_id: str
    composite_score: float
    band: str
    coverage: float
    ordering: Optional[float] = None
    precision: float
    verbatim: float
    branch_leakage: float
    gap_report: Dict[str, Any]
    passed: bool


class ContradictionRequest(BaseModel):
    """Request body for POST /grade/contradiction."""
    learner_claims: List[str]
    source_claims: List[str]


class ContradictionResponse(BaseModel):
    """Response body from POST /grade/contradiction."""
    contradiction_count: int
    flagged_pairs: List[Dict[str, Any]] = []