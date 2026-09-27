"""Pydantic schemas for the ingestion API (§4, §12)."""
from __future__ import annotations

from pydantic import BaseModel
from uuid import UUID
from typing import Optional, List


class IngestRequest(BaseModel):
    note_id: UUID
    learner_id: UUID


class IngestResponse(BaseModel):
    concept_id: Optional[str] = None   # None for PENDING (job mode) or UNCHANGED
    status: str
    claims_count: int


class ClaimDTO(BaseModel):
    text: str
    order_index: Optional[int] = None
    is_transition: bool = False
    is_load_bearing: bool = False
    branch_id: Optional[str] = None
    weight: float = 1.0
    aliases: List[str] = []


class ExtractClaimsRequest(BaseModel):
    text: str
    shape: str = "DEFINITION"


class ExtractClaimsResponse(BaseModel):
    claims: List[ClaimDTO]


class ExtractPrerequisitesRequest(BaseModel):
    text: str
    existing_concepts: List[str]


class ExtractPrerequisitesResponse(BaseModel):
    prerequisites: List[str]


class ResolveIdentityRequest(BaseModel):
    label: str
    learner_id: UUID


class ResolveIdentityResponse(BaseModel):
    concept_id: str
    is_new: bool
    similarity: Optional[float] = None


class EmbedRequest(BaseModel):
    text: str


class EmbedResponse(BaseModel):
    embedding: List[float]
    dimensions: int