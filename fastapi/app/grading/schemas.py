"""Pydantic schemas for the grading API (§5, §12)."""
from __future__ import annotations

from pydantic import BaseModel
from uuid import UUID
from typing import Optional, List, Dict, Any


class GradeRequest(BaseModel):
    """Request body for POST /grade.

    concept_id / concept_version are optional cross-checks: if given they
    must match the probe (422 otherwise). The probe's frozen answer key is
    always what is graded against.
    """
    probe_id: UUID
    learner_id: UUID
    concept_id: Optional[UUID] = None
    concept_version: Optional[int] = None
    answer_text: Optional[str] = None
    # MCQ: {"selected_index": int}   CONCEPT_SORT: {"groups": [[int, ...], ...]}
    answer_payload: Optional[Dict[str, Any]] = None
    confidence_pre: Optional[float] = None


class ReviewAnswerRequest(BaseModel):
    """Body for POST /review/answer (learner_id comes from the query string)."""
    probe_id: UUID
    answer_text: Optional[str] = None
    answer_payload: Optional[Dict[str, Any]] = None
    confidence_pre: Optional[float] = None


class GradeResponse(BaseModel):
    """Response body from POST /grade and POST /review/answer."""
    attempt_id: str
    probe_id: str
    probe_type: str
    concept_id: str
    concept_version: int
    grading_mode: str            # claim_coverage | cloze_exact | mcq | concept_sort | empty
    composite_score: float
    band: str
    passed: bool
    coverage: Optional[float] = None
    ordering: Optional[float] = None
    precision: Optional[float] = None
    verbatim: Optional[float] = None
    branch_leakage: Optional[float] = None
    delta_score: Optional[float] = None
    ari_mechanism: Optional[float] = None
    ari_surface: Optional[float] = None
    principle_ratio: Optional[float] = None
    gap_report: Dict[str, Any]
    contradiction: Dict[str, Any] = {}
    misconceptions: List[str] = []
    memory: Dict[str, Any] = {}
    mastery: Dict[str, Any] = {}
    solo_level: Optional[str] = None
    next_review_at: Optional[str] = None


class ContradictionRequest(BaseModel):
    """Request body for POST /grade/contradiction."""
    learner_claims: List[str]
    source_claims: List[str]


class ContradictionResponse(BaseModel):
    """Response body from POST /grade/contradiction."""
    contradiction_count: int
    flagged_pairs: List[Dict[str, Any]] = []
