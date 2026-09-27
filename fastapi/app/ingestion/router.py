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

    Primary entry point called by Express when a note is created/updated.
    Behaviour depends on INGEST_MODE:
      - "job":    enqueue a background job and return status PENDING (a
                  running worker processes it).
      - "inline": run the pipeline now and return the concept result.
    Exactly one of these happens — never both.
    """
    from app.config import get_settings
    settings = get_settings()

    if settings.ingest_mode == "job":
        from app.jobs.dispatcher import JobDispatcher
        dispatcher = JobDispatcher(db)
        await dispatcher.dispatch_ingest(request.note_id, request.learner_id)
        return IngestResponse(concept_id=None, status="PENDING", claims_count=0)

    # inline
    from app.ingestion.service import IngestionService
    service = IngestionService(conn=db)  # self-provisions guarded clients
    result = await service.ingest_note(
        str(request.note_id), str(request.learner_id),
    )
    return IngestResponse(
        concept_id=result.get("concept_id"),
        status=result["status"],
        claims_count=result["claims_count"],
    )


@router.post("/extract-claims", response_model=ExtractClaimsResponse)
async def extract_claims(
    request: ExtractClaimsRequest,
    db: psycopg.AsyncConnection = Depends(get_db),
):
    """Extract claims from raw text (standalone utility endpoint)."""
    from app.ingestion.extractor import ClaimExtractor

    extractor = ClaimExtractor(conn=db)
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
async def extract_prerequisites(
    request: ExtractPrerequisitesRequest,
    db: psycopg.AsyncConnection = Depends(get_db),
):
    """Extract prerequisite concepts from text."""
    from app.ingestion.extractor import ClaimExtractor

    extractor = ClaimExtractor(conn=db)
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
    emb_service = create_embedding_service(settings, conn=db)

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
    concept_id = str(result.concept_id) if result.concept_id else str(uuid4())

    return ResolveIdentityResponse(
        concept_id=concept_id,
        is_new=result.is_new,
        similarity=result.similarity,
    )


@router.post("/embed", response_model=EmbedResponse)
async def embed(
    request: EmbedRequest,
    db: psycopg.AsyncConnection = Depends(get_db),
):
    """Compute embedding for text."""
    from app.ingestion.embedding import create_embedding_service
    from app.config import get_settings

    settings = get_settings()
    emb_service = create_embedding_service(settings, conn=db)

    embedding = await emb_service.compute_embedding(request.text)

    return EmbedResponse(
        embedding=embedding,
        dimensions=len(embedding),
    )