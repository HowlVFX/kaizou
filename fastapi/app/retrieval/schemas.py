"""Pydantic schemas for the retrieval API (§10, §12)."""
from __future__ import annotations

from pydantic import BaseModel
from uuid import UUID
from typing import List, Any, Optional


class SourceResult(BaseModel):
    url: str
    domain: str
    trust_tier: str
    snippet: str


class SearchRequest(BaseModel):
    concept_label: str
    claims: List[str]
    trust_tiers: List[str] = []


class SearchResponse(BaseModel):
    results: List[SourceResult]


class FetchRequest(BaseModel):
    url: str
    concept_id: UUID


class FetchResponse(BaseModel):
    source_id: str
    content_sha256: str
    token_count: int


class ValidateRequest(BaseModel):
    note_id: UUID
    source_id: UUID


class ValidateResponse(BaseModel):
    source_coverage: float
    contradiction_count: int = 0
    flagged_pairs: List[Any] = []