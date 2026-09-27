"""Retrieval API router (§10, §12).

Endpoints:
    POST /retrieval/search   — Search for authoritative sources
    POST /retrieval/fetch    — Fetch and store a source document
    POST /retrieval/validate — Validate a note against its source

Source trust tiers (§10.1), stored as the ``source_trust_tier`` enum:
    PEER_REVIEWED  — Tier 1: peer-reviewed, authoritative textbooks
    INSTITUTIONAL  — Tier 2: established educational resources, docs
    GENERAL        — Tier 3/4: community or unverified content
    SELF_AUTHORED  — learner-supplied material
    Mapping lives in app.retrieval.search.classify_trust_tier.

Source validation (§10.2):
    Coverage: what fraction of the source's claims does the note cover?
    Contradiction: does the note contradict the source? (uses §5.10 NLI)
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
import httpx
import psycopg
from psycopg.rows import dict_row

from app.dependencies import get_db
from app.retrieval.fetcher import FetchBlockedError, FetchTooLargeError, fetch_url
from app.retrieval.schemas import (
    SearchRequest, SearchResponse, SourceResult,
    FetchRequest, FetchResponse,
    ValidateRequest, ValidateResponse,
)
from app.retrieval.search import (
    SearchUnavailableError,
    WebSearchService,
    classify_trust_tier,
    normalize_trust_tiers,
)
from app.retrieval.service import upsert_source

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/retrieval", tags=["Retrieval"])


@router.post("/search", response_model=SearchResponse)
async def search(request: SearchRequest):
    """Search for authoritative sources for a concept's claims.

    Uses Google Custom Search (GOOGLE_SEARCH_API_KEY + GOOGLE_SEARCH_ENGINE_ID).
    Results are classified by trust tier and filtered to ``trust_tiers``
    (enum names or tier_1..tier_4; empty = all). When search is not
    configured the response is ``{results: [], configured: false}``.
    """
    try:
        tiers = normalize_trust_tiers(request.trust_tiers)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    service = WebSearchService.from_settings()
    if not service.configured:
        return SearchResponse(
            results=[], configured=False,
            detail="Web search is not configured (set GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_ENGINE_ID).",
        )

    logger.info("Search requested with %d claims", len(request.claims))
    try:
        found = await service.search_for_concept(
            request.concept_label, request.claims, tiers or None, raise_errors=True,
        )
    except SearchUnavailableError as e:
        raise HTTPException(status_code=502, detail=str(e))

    return SearchResponse(
        results=[
            SourceResult(
                url=r["url"], domain=r["domain"], trust_tier=r["trust_tier"],
                snippet=r.get("snippet", ""), title=r.get("title", ""),
            )
            for r in found
        ],
        configured=True,
    )


@router.post("/fetch", response_model=FetchResponse)
async def fetch(
    request: FetchRequest,
    db: psycopg.AsyncConnection = Depends(get_db),
):
    """Fetch and store a source document.

    Downloads the content (HTML stripped to text), computes SHA-256,
    and persists to the sources table. token_count is computed for the
    response only; the schema does not store it.
    """
    from urllib.parse import urlparse

    async with db.cursor(row_factory=dict_row) as cur:
        await cur.execute("SELECT 1 AS ok FROM concepts WHERE id = %s", (str(request.concept_id),))
        if not await cur.fetchone():
            raise HTTPException(status_code=404, detail="Concept not found")

    try:
        fetched = await fetch_url(str(request.url))
    except FetchBlockedError as e:
        raise HTTPException(status_code=400, detail=f"URL not allowed: {e}")
    except FetchTooLargeError as e:
        raise HTTPException(status_code=413, detail=str(e))
    except httpx.HTTPError as e:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to fetch source: {type(e).__name__}",
        )

    # Domain for trust classification = host only (no port / userinfo).
    domain = (urlparse(str(request.url)).hostname or "").lower()
    source_id = await upsert_source(
        db,
        concept_id=str(request.concept_id),
        url=str(request.url),
        domain=domain,
        trust_tier=classify_trust_tier(domain),
        content_sha256=fetched["content_hash"],
        content_text=fetched["content"],
    )
    await db.commit()

    return FetchResponse(
        source_id=source_id,
        content_sha256=fetched["content_hash"],
        token_count=fetched["token_count"],
    )


@router.post("/validate", response_model=ValidateResponse)
async def validate(
    request: ValidateRequest,
    db: psycopg.AsyncConnection = Depends(get_db),
):
    """Validate a note against its source document.

    Computes source coverage (what fraction of source claims the note covers)
    and checks for contradictions.
    """
    # Fetch note claims
    async with db.cursor(row_factory=dict_row) as cur:
        await cur.execute(
            # Current version only: each version holds the full claim set,
            # so reading every version would count carried claims repeatedly.
            """SELECT c.text, c.embedding
               FROM claims c
               JOIN note_concepts nc ON nc.concept_id = c.concept_id
               JOIN concepts co ON co.id = c.concept_id AND c.concept_version = co.version
               WHERE nc.note_id = %s""",
            (str(request.note_id),),
        )
        note_claims = await cur.fetchall()

    # Fetch source content
    async with db.cursor(row_factory=dict_row) as cur:
        await cur.execute(
            "SELECT content_text FROM sources WHERE id = %s",
            (str(request.source_id),),
        )
        source = await cur.fetchone()

    if not source or not note_claims:
        raise HTTPException(
            status_code=422,
            detail="Note claims or source not found",
        )

    # Extract claims from source text
    from app.ingestion.extractor import ClaimExtractor
    from app.config import get_settings

    settings = get_settings()
    extractor = ClaimExtractor(conn=db)
    source_claims = await extractor.extract_claims(source["content_text"])

    # Compute embeddings for source claims
    from app.ingestion.embedding import create_embedding_service

    emb_service = create_embedding_service(settings, conn=db)

    source_embeddings = await emb_service.compute_batch_embeddings(
        [c.text for c in source_claims],
    )
    note_embeddings = [c["embedding"] for c in note_claims if c.get("embedding")]

    # Compute source coverage using grading pipeline
    from app.grading.coverage import (
        build_similarity_matrix, match_claims, calculate_coverage,
    )

    if source_embeddings and note_embeddings:
        sim_matrix = build_similarity_matrix(source_embeddings, note_embeddings)
        matched, _, _ = match_claims(sim_matrix, settings.semantic_match_threshold)
        source_coverage = calculate_coverage(
            matched, [1.0] * len(source_embeddings),
        )
    else:
        source_coverage = 0.0

    # Contradiction detection (§5.10): premise = source claim, hypothesis =
    # the learner's note claim. Skipped (with an explicit flag) if NLI is off.
    import psycopg.types.json
    from app.nli.service import get_nli_service, NLIUnavailable
    from app.grading.contradiction import ContradictionDetector

    contradiction_count = 0
    flagged_pairs: list = []
    nli_ran = False
    nli = get_nli_service(conn=db)
    if nli.enabled:
        try:
            report = await ContradictionDetector(
                nli, threshold=settings.nli_contradiction_threshold,
            ).detect(
                source_claims=[c.text for c in source_claims],
                learner_claims=[c["text"] for c in note_claims],
            )
            contradiction_count = report.contradiction_count
            flagged_pairs = report.to_dict()["flagged_pairs"]
            nli_ran = True
        except NLIUnavailable:
            nli_ran = False

    # Store validation result
    async with db.cursor() as cur:
        await cur.execute(
            """INSERT INTO validations (
                id, source_id, note_id, source_coverage,
                contradiction_count, flagged_pairs
            ) VALUES (
                gen_random_uuid(), %s, %s, %s, %s, %s
            ) ON CONFLICT DO NOTHING""",
            (str(request.source_id), str(request.note_id), source_coverage,
             contradiction_count, psycopg.types.json.Jsonb(flagged_pairs)),
        )
    await db.commit()

    return ValidateResponse(
        source_coverage=source_coverage,
        contradiction_count=contradiction_count,
        flagged_pairs=flagged_pairs if nli_ran else [{"nli_disabled": True}],
    )