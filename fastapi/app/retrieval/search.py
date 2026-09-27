"""Web search service for source discovery (§10.1).

Searches for authoritative sources to validate learner notes against.
Uses Google Custom Search API or similar.
"""
from __future__ import annotations

import logging
from urllib.parse import urlparse

import httpx

logger = logging.getLogger(__name__)

# Domain → trust tier mapping (§10.1). Values are the DB enum
# ``source_trust_tier`` labels, so they can be inserted directly:
#   Tier 1 → PEER_REVIEWED, Tier 2 → INSTITUTIONAL, Tier 3/4 → GENERAL.
# SELF_AUTHORED is reserved for learner-supplied material, never web results.
DOMAIN_TRUST_MAP: dict[str, str] = {
    'nature.com': 'PEER_REVIEWED', 'science.org': 'PEER_REVIEWED',
    'pubmed.ncbi.nlm.nih.gov': 'PEER_REVIEWED', 'ieee.org': 'PEER_REVIEWED',
    'acm.org': 'PEER_REVIEWED', 'scholar.google.com': 'PEER_REVIEWED',
    'docs.python.org': 'INSTITUTIONAL', 'developer.mozilla.org': 'INSTITUTIONAL',
    'docs.oracle.com': 'INSTITUTIONAL', 'mathworld.wolfram.com': 'INSTITUTIONAL',
    'britannica.com': 'INSTITUTIONAL', 'khanacademy.org': 'INSTITUTIONAL',
    'stackoverflow.com': 'GENERAL', 'en.wikipedia.org': 'GENERAL',
    'geeksforgeeks.org': 'GENERAL',
}


def classify_trust_tier(domain: str) -> str:
    """Classify a domain into a ``source_trust_tier`` enum value."""
    # Exact host or subdomain match only: a substring test would let
    # "nature.com.attacker.io" or "notnature.com" claim PEER_REVIEWED.
    domain = domain.lower().split(':', 1)[0].rstrip('.')
    if domain.startswith('www.'):
        domain = domain[4:]
    for known, tier in DOMAIN_TRUST_MAP.items():
        if domain == known or domain.endswith('.' + known):
            return tier
    return 'GENERAL'


WEB_TRUST_TIERS = ('PEER_REVIEWED', 'INSTITUTIONAL', 'GENERAL')

# Accepted spellings for SearchRequest.trust_tiers → enum value.
_TIER_ALIASES: dict[str, str] = {
    '1': 'PEER_REVIEWED', 'TIER1': 'PEER_REVIEWED', 'T1': 'PEER_REVIEWED',
    'PEER_REVIEWED': 'PEER_REVIEWED', 'PEERREVIEWED': 'PEER_REVIEWED',
    '2': 'INSTITUTIONAL', 'TIER2': 'INSTITUTIONAL', 'T2': 'INSTITUTIONAL',
    'INSTITUTIONAL': 'INSTITUTIONAL',
    '3': 'GENERAL', 'TIER3': 'GENERAL', 'T3': 'GENERAL',
    '4': 'GENERAL', 'TIER4': 'GENERAL', 'T4': 'GENERAL',
    'GENERAL': 'GENERAL',
}


class SearchUnavailableError(RuntimeError):
    """The search API call failed (network / HTTP status / bad payload)."""


def normalize_trust_tiers(tiers: list[str] | None) -> list[str]:
    """Map request tier names (enum names, 'tier_1', '1', ...) to enum values.

    Raises ValueError for unknown names or SELF_AUTHORED (never a web result).
    """
    out: list[str] = []
    for raw in tiers or []:
        key = str(raw).strip().upper().replace('-', '').replace(' ', '')
        key = key.replace('TIER_', 'TIER')
        tier = _TIER_ALIASES.get(key)
        if tier is None:
            raise ValueError(
                f"Unknown trust tier '{raw}'. Use one of {', '.join(WEB_TRUST_TIERS)} "
                f"(or tier_1..tier_4)."
            )
        if tier not in out:
            out.append(tier)
    return out


class WebSearchService:
    """Searches the web for authoritative sources."""

    def __init__(
        self,
        api_key: str = '',
        search_engine_id: str = '',
        transport: httpx.AsyncBaseTransport | None = None,
    ):
        self._api_key = api_key
        self._search_engine_id = search_engine_id
        self._transport = transport

    @classmethod
    def from_settings(cls, settings=None) -> 'WebSearchService':
        if settings is None:
            from app.config import get_settings
            settings = get_settings()
        return cls(settings.google_search_api_key, settings.google_search_engine_id)

    @property
    def configured(self) -> bool:
        return bool(self._api_key and self._search_engine_id)

    async def search(
        self,
        query: str,
        preferred_tiers: list[str] | None = None,
        max_results: int = 10,
        raise_errors: bool = False,
    ) -> list[dict]:
        """Search for sources matching a query.

        Returns list of dicts: {url, domain, trust_tier, snippet, title}.
        With raise_errors=True, API failures raise SearchUnavailableError
        instead of returning [] (the error never includes the API key).
        """
        if not self.configured:
            logger.warning('Web search not configured — no API key or engine ID')
            return []

        try:
            async with httpx.AsyncClient(transport=self._transport) as client:
                response = await client.get(
                    'https://www.googleapis.com/customsearch/v1',
                    params={
                        'key': self._api_key,
                        'cx': self._search_engine_id,
                        'q': query,
                        'num': min(max_results, 10),
                    },
                    timeout=15.0,
                )
                response.raise_for_status()
                data = response.json()

            results = []
            for item in data.get('items', []):
                url = item.get('link', '')
                parsed = urlparse(url)
                domain = parsed.netloc
                tier = classify_trust_tier(domain)

                # Filter by preferred tiers if specified
                if preferred_tiers and tier not in preferred_tiers:
                    continue

                results.append({
                    'url': url,
                    'domain': domain,
                    'trust_tier': tier,
                    'snippet': item.get('snippet', ''),
                    'title': item.get('title', ''),
                })

            return results

        except (httpx.HTTPError, ValueError) as e:
            # The request URL carries the API key as a query param, so log
            # only the exception type / status, never str(e).
            status = getattr(getattr(e, 'response', None), 'status_code', None)
            logger.error('Web search failed: %s (status=%s)', type(e).__name__, status)
            if raise_errors:
                raise SearchUnavailableError(
                    f'Web search failed ({type(e).__name__}, status={status})'
                ) from None
            return []

    async def search_for_concept(
        self,
        concept_label: str,
        claims: list[str],
        preferred_tiers: list[str] | None = None,
        raise_errors: bool = False,
    ) -> list[dict]:
        """Search for sources about a specific concept.

        Constructs a search query from the concept label and key claims.
        """
        # Build query from label + first 2 claims for specificity
        query_parts = [concept_label]
        for claim in claims[:2]:
            if len(claim) < 100:
                query_parts.append(claim)

        query = ' '.join(query_parts)
        return await self.search(query, preferred_tiers, raise_errors=raise_errors)