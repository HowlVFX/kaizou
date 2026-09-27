"""Pydantic schemas for the probes API (§8, §12)."""
from __future__ import annotations

from pydantic import BaseModel
from uuid import UUID
from typing import Optional, Dict, Any, List


class GenerateProbeRequest(BaseModel):
    concept_id: UUID
    learner_id: UUID
    # Optional: if given it must equal the concept's current version (409
    # otherwise). Probes are always generated against the current version.
    concept_version: Optional[int] = None
    # Omit (or null) to auto-select by SOLO level with type round-robin.
    probe_type: Optional[str] = None


class GenerateProbeResponse(BaseModel):
    probe_id: UUID
    concept_id: UUID
    concept_version: int
    prompt_text: str
    probe_type: str
    requested_probe_type: Optional[str] = None
    # Learner-visible extras: {"options": [...]} for MCQ, {"items": [...]}
    # for CONCEPT_SORT, {} otherwise. Never contains the answer key.
    payload: Dict[str, Any] = {}
    leaked: bool = False
    retries: int = 0
    fallback: bool = False
    fallback_reason: Optional[str] = None
    leakage_check: str = "none"
    target_branch: Optional[str] = None


class CheckLeakageRequest(BaseModel):
    probe_text: str
    required_claims: List[str]


class CheckLeakageResponse(BaseModel):
    is_valid: bool
    semantic_score: float
    lexical_score: float


class GradeAttemptRequest(BaseModel):
    probe_id: UUID
    learner_id: UUID
    answer_text: Optional[str] = None
    answer_payload: Optional[Dict[str, Any]] = None
    confidence_pre: Optional[float] = None
