"""Web search service for source discovery (§10.1).

Searches for authoritative sources to validate learner notes against.
Uses Google Custom Search API or similar.
"""
from __future__ import annotations

import logging
from urllib.parse import urlparse

import httpx

logger = logging.getLogger(__name__)

# Domain → trust tier mapping (§10.1)
DOMAIN_TRUST_MAP: dict[str, str] = {
    'nature.com': 'TIER_1', 'science.org': 'TIER_1',
    'pubmed.ncbi.nlm.nih.gov': 'TIER_1', 'ieee.org': 'TIER_1',
    'acm.org': 'TIER_1', 'scholar.google.com': 'TIER_1',
    'docs.python.org': 'TIER_2', 'developer.mozilla.org': 'TIER_2',
    'docs.oracle.com': 'TIER_2', 'mathworld.wolfram.com': 'TIER_2',
    'britannica.com': 'TIER_2', 'khanacademy.org': 'TIER_2',
    'stackoverflow.com': 'TIER_3', 'en.wikipedia.org': 'TIER_3',
    'geeksforgeeks.org': 'TIER_3',
}


def classify_trust_tier(domain: str) -> str:
    """Classify a domain into a trust tier."""
    domain = domain.lower()
    for known, tier in DOMAIN_TRUST_MAP.items():
        if known in domain:
            return tier
    return 'TIER_4'


class WebSearchService:
    """Searches the web for authoritative sources."""

    def __init__(self, api_key: str = '', search_engine_id: str = ''):
        self._api_key = api_key
        self._search_engine_id = search_engine_id

    async def search(
        self,
        query: str,
        preferred_tiers: list[str] | None = None,
        max_results: int = 10,
    ) -> list[dict]:
        """Search for sources matching a query.

        Returns list of dicts: {url, domain, trust_tier, snippet, title}
        """
        if not self._api_key or not self._search_engine_id:
            logger.warning('Web search not configured — no API key or engine ID')
            return []

        try:
            async with httpx.AsyncClient() as client:
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

        except httpx.HTTPError as e:
            logger.error('Web search failed: %s', e)
            return []

    async def search_for_concept(
        self,
        concept_label: str,
        claims: list[str],
        preferred_tiers: list[str] | None = None,
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
        return await self.search(query, preferred_tiers)