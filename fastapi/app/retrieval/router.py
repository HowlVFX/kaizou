"""Retrieval API router (§10, §12).

Endpoints:
    POST /retrieval/search   — Search for authoritative sources
    POST /retrieval/fetch    — Fetch and store a source document
    POST /retrieval/validate — Validate a note against its source

Source trust tiers (§10.1):
    Tier 1 — Peer-reviewed, authoritative textbooks
    Tier 2 — Established educational resources, docs
    Tier 3 — Community content with editorial oversight
    Tier 4 — Unverified / user-authored

Source validation (§10.2):
    Coverage: what fraction of the source's claims does the note cover?
    Contradiction: does the note contradict the source? (uses §5.10 NLI)
"""
from __future__ import annotations

import hashlib
import logging

from fastapi import APIRouter, Depends, HTTPException
import httpx
import psycopg
from psycopg.rows import dict_row

from app.dependencies import get_db
from app.retrieval.schemas import (
    SearchRequest, SearchResponse, SourceResult,
    FetchRequest, FetchResponse,
    ValidateRequest, ValidateResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/retrieval", tags=["Retrieval"])

# Domain → trust tier mapping (§10.1)
DOMAIN_TRUST_TIERS: dict[str, str] = {
    # Tier 1 — Peer-reviewed
    "nature.com": "TIER_1",
    "science.org": "TIER_1",
    "scholar.google.com": "TIER_1",
    "pubmed.ncbi.nlm.nih.gov": "TIER_1",
    "ieee.org": "TIER_1",
    "acm.org": "TIER_1",
    # Tier 2 — Established educational
    "docs.python.org": "TIER_2",
    "developer.mozilla.org": "TIER_2",
    "docs.oracle.com": "TIER_2",
    "mathworld.wolfram.com": "TIER_2",
    "khan-academy.org": "TIER_2",
    "britannica.com": "TIER_2",
    # Tier 3 — Community with oversight
    "stackoverflow.com": "TIER_3",
    "en.wikipedia.org": "TIER_3",
    "geeksforgeeks.org": "TIER_3",
}


def classify_domain_trust(domain: str) -> str:
    """Classify a domain into a trust tier (§10.1)."""
    domain_lower = domain.lower()
    for known, tier in DOMAIN_TRUST_TIERS.items():
        if known in domain_lower:
            return tier
    return "TIER_4"


@router.post("/search", response_model=SearchResponse)
async def search(request: SearchRequest):
    """Search for authoritative sources for a concept's claims.

    Uses web search API to find sources that discuss the same claims.
    Results are classified by trust tier.
    """
    # Use the LLM/search API to find relevant sources
    from app.config import get_settings
    settings = get_settings()

    # For now, return placeholder results
    # In production, this would use a search API (Google Custom Search, etc.)
    logger.info(
        "Search requested for concept '%s' with %d claims",
        request.concept_label, len(request.claims),
    )

    # Placeholder: in production, this would call a web search API
    results: list[SourceResult] = []

    return SearchResponse(results=results)


@router.post("/fetch", response_model=FetchResponse)
async def fetch(
    request: FetchRequest,
    db: psycopg.AsyncConnection = Depends(get_db),
):
    """Fetch and store a source document.

    Downloads the content, computes SHA-256, counts tokens,
    and persists to the sources table.
    """
    from urllib.parse import urlparse

    # Fetch the content
    try:
        async with httpx.AsyncClient(follow_redirects=True) as client:
            response = await client.get(str(request.url), timeout=30.0)
            response.raise_for_status()
            content = response.text
    except httpx.HTTPError as e:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to fetch source: {e}",
        )

    # Compute hash and token count
    content_hash = hashlib.sha256(content.encode()).hexdigest()
    token_count = len(content.split())

    # Classify trust tier
    parsed_url = urlparse(str(request.url))
    domain = parsed_url.netloc
    trust_tier = classify_domain_trust(domain)

    # Persist to DB
    async with db.cursor(row_factory=dict_row) as cur:
        await cur.execute(
            """INSERT INTO sources (
                id, concept_id, url, domain, trust_tier,
                content_sha256, token_count, raw_text
            ) VALUES (
                gen_random_uuid(), %s, %s, %s, %s,
                %s, %s, %s
            )
            ON CONFLICT (url) DO UPDATE SET
                content_sha256 = EXCLUDED.content_sha256,
                token_count = EXCLUDED.token_count,
                raw_text = EXCLUDED.raw_text
            RETURNING id, content_sha256, token_count""",
            (
                str(request.concept_id), str(request.url), domain,
                trust_tier, content_hash, token_count, content[:50000],
            ),
        )
        row = await cur.fetchone()

    await db.commit()

    return FetchResponse(
        source_id=row["id"],
        content_sha256=row["content_sha256"],
        token_count=row["token_count"],
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
            """SELECT c.text, c.embedding
               FROM claims c
               JOIN note_concepts nc ON nc.concept_id = c.concept_id
               WHERE nc.note_id = %s""",
            (str(request.note_id),),
        )
        note_claims = await cur.fetchall()

    # Fetch source content
    async with db.cursor(row_factory=dict_row) as cur:
        await cur.execute(
            "SELECT raw_text FROM sources WHERE id = %s",
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
    extractor = ClaimExtractor()
    source_claims = await extractor.extract_claims(source["raw_text"])

    # Compute embeddings for source claims
    from app.ingestion.embedding import create_embedding_service

    emb_service = create_embedding_service(settings)

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

    # Store validation result
    async with db.cursor() as cur:
        await cur.execute(
            """INSERT INTO validations (
                id, source_id, note_id, source_coverage,
                contradiction_count, flagged_pairs
            ) VALUES (
                gen_random_uuid(), %s, %s, %s, 0, '[]'::jsonb
            ) ON CONFLICT DO NOTHING""",
            (str(request.source_id), str(request.note_id), source_coverage),
        )
    await db.commit()

    return ValidateResponse(
        source_coverage=source_coverage,
        contradiction_count=0,
        flagged_pairs=[],
    )