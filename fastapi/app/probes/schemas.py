"""Pydantic schemas for the probes API (§8, §12)."""
from __future__ import annotations

from pydantic import BaseModel
from uuid import UUID
from typing import Optional, Dict, Any, List


class GenerateProbeRequest(BaseModel):
    concept_id: UUID
    concept_version: int
    learner_id: UUID
    probe_type: str = "RECALL"  # Default; auto-select if omitted


class GenerateProbeResponse(BaseModel):
    probe_id: UUID
    prompt_text: str
    probe_type: str
    leaked: bool = False


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
