"""Ingestion API router (§8.1, §12).

Endpoints:
    POST /ingest                 — Trigger full ingestion pipeline for a note
    POST /ingest/extract-claims  — Extract claims from text (standalone)
    POST /ingest/extract-prerequisites — Extract prerequisites from text
    POST /ingest/resolve-identity — Resolve concept identity
    POST /ingest/embed           — Compute embedding for text
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
import psycopg
from psycopg.rows import dict_row

from app.dependencies import get_db
from app.ingestion.schemas import (
    IngestRequest, IngestResponse,
    ExtractClaimsRequest, ExtractClaimsResponse, ClaimDTO,
    ExtractPrerequisitesRequest, ExtractPrerequisitesResponse,
    ResolveIdentityRequest, ResolveIdentityResponse,
    EmbedRequest, EmbedResponse,
)

router = APIRouter(prefix="/ingest", tags=["Ingestion"])


@router.post("", response_model=IngestResponse)
async def trigger_ingestion(
    request: IngestRequest,
    db: psycopg.AsyncConnection = Depends(get_db),
):
    """Trigger full ingestion pipeline for a note.

    This is the primary entry point called by Express when a note
    is created or updated. It dispatches a background job.
    """
    from app.jobs.dispatcher import JobDispatcher

    dispatcher = JobDispatcher(db)
    job_id = await dispatcher.dispatch_ingest(
        request.note_id, request.learner_id,
    )

    # For now, run synchronously (background job support comes later)
    from app.ingestion.service import IngestionService
    from app.ingestion.classifier import NoteClassifier
    from app.ingestion.extractor import ClaimExtractor
    from app.ingestion.embedding import create_embedding_service
    from app.config import get_settings

    settings = get_settings()
    service = IngestionService(
        conn=db,
        classifier=NoteClassifier(),
        extractor=ClaimExtractor(),
        embedding_service=create_embedding_service(settings),
    )

    result = await service.ingest_note(
        str(request.note_id), str(request.learner_id),
    )

    concept_id = result.get("concept_id")
    if not concept_id:
        raise HTTPException(status_code=422, detail="Ingestion produced no concept")

    return IngestResponse(
        concept_id=concept_id,
        status=result["status"],
        claims_count=result["claims_count"],
    )


@router.post("/extract-claims", response_model=ExtractClaimsResponse)
async def extract_claims(request: ExtractClaimsRequest):
    """Extract claims from raw text (standalone utility endpoint)."""
    from app.ingestion.extractor import ClaimExtractor
    from app.config import get_settings

    settings = get_settings()
    extractor = ClaimExtractor()
    claims = await extractor.extract_claims(request.text, request.shape)

    return ExtractClaimsResponse(
        claims=[
            ClaimDTO(
                text=c.text,
                order_index=c.order_index,
                is_transition=c.is_transition,
                is_load_bearing=c.is_load_bearing,
                branch_id=c.branch_id,
                weight=1.0,
                aliases=c.aliases,
            )
            for c in claims
        ]
    )


@router.post("/extract-prerequisites", response_model=ExtractPrerequisitesResponse)
async def extract_prerequisites(request: ExtractPrerequisitesRequest):
    """Extract prerequisite concepts from text."""
    from app.ingestion.extractor import ClaimExtractor
    from app.config import get_settings

    settings = get_settings()
    extractor = ClaimExtractor()
    prereqs = await extractor.extract_prerequisites(
        request.text, request.existing_concepts,
    )

    return ExtractPrerequisitesResponse(prerequisites=prereqs)


@router.post("/resolve-identity", response_model=ResolveIdentityResponse)
async def resolve_identity(
    request: ResolveIdentityRequest,
    db: psycopg.AsyncConnection = Depends(get_db),
):
    """Resolve concept identity for a label."""
    from app.ingestion.identity import resolve_concept_identity
    from app.ingestion.embedding import create_embedding_service
    from app.config import get_settings

    settings = get_settings()
    emb_service = create_embedding_service(settings)

    label_embedding = await emb_service.compute_embedding(request.label)

    async with db.cursor(row_factory=dict_row) as cur:
        await cur.execute(
            "SELECT id, canonical_label AS label, label_embedding AS embedding "
            "FROM concepts WHERE learner_id = %s AND label_embedding IS NOT NULL",
            (str(request.learner_id),),
        )
        existing = await cur.fetchall()

    result = resolve_concept_identity(
        label_embedding, [dict(c) for c in existing],
    )

    from uuid import uuid4
    concept_id = result.concept_id or str(uuid4())

    return ResolveIdentityResponse(
        concept_id=concept_id,
        is_new=result.is_new,
        similarity=result.similarity,
    )


@router.post("/embed", response_model=EmbedResponse)
async def embed(request: EmbedRequest):
    """Compute embedding for text."""
    from app.ingestion.embedding import create_embedding_service
    from app.config import get_settings

    settings = get_settings()
    emb_service = create_embedding_service(settings)

    embedding = await emb_service.compute_embedding(request.text)

    return EmbedResponse(
        embedding=embedding,
        dimensions=len(embedding),
    )