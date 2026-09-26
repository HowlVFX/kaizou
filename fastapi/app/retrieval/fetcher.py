"""HTTP content fetcher for source retrieval (§10.2).

Fetches web pages, extracts clean text content, and computes
content hashes for change detection.
"""
from __future__ import annotations

import hashlib
import logging
import re
from html.parser import HTMLParser

import httpx

logger = logging.getLogger(__name__)


class HTMLTextExtractor(HTMLParser):
    """Simple HTML to text converter."""

    SKIP_TAGS = {'script', 'style', 'nav', 'header', 'footer', 'aside'}

    def __init__(self):
        super().__init__()
        self._text_parts: list[str] = []
        self._skip_depth = 0

    def handle_starttag(self, tag, attrs):
        if tag in self.SKIP_TAGS:
            self._skip_depth += 1

    def handle_endtag(self, tag):
        if tag in self.SKIP_TAGS and self._skip_depth > 0:
            self._skip_depth -= 1

    def handle_data(self, data):
        if self._skip_depth == 0:
            text = data.strip()
            if text:
                self._text_parts.append(text)

    def get_text(self) -> str:
        return ' '.join(self._text_parts)


def extract_text_from_html(html: str) -> str:
    """Extract clean text from HTML content."""
    parser = HTMLTextExtractor()
    parser.feed(html)
    text = parser.get_text()
    # Collapse whitespace
    text = re.sub(r'\s+', ' ', text).strip()
    return text


async def fetch_url(url: str, timeout: float = 30.0) -> dict:
    """Fetch a URL and return structured content.

    Returns:
        dict with keys: url, content, content_hash, token_count, content_type
    """
    async with httpx.AsyncClient(
        follow_redirects=True,
        headers={'User-Agent': 'Kaizou/1.0 (educational-tool)'},
    ) as client:
        response = await client.get(url, timeout=timeout)
        response.raise_for_status()

    content_type = response.headers.get('content-type', '')
    raw_content = response.text

    # Extract clean text based on content type
    if 'text/html' in content_type:
        clean_text = extract_text_from_html(raw_content)
    else:
        clean_text = raw_content

    # Compute hash and token count
    content_hash = hashlib.sha256(clean_text.encode()).hexdigest()
    token_count = len(clean_text.split())

    return {
        'url': str(url),
        'content': clean_text[:50000],  # Cap at 50k chars
        'content_hash': content_hash,
        'token_count': token_count,
        'content_type': content_type,
    }