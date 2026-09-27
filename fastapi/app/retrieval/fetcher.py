"""HTTP content fetcher for source retrieval (§10.2).

Fetches web pages, extracts clean text content, and computes
content hashes for change detection.

🔒 SSRF policy (applies to /retrieval/fetch, source discovery and
snapshots, which all go through ``fetch_url``): http/https only, every
resolved address must be public, the connection is pinned to the checked
IP, redirects are re-validated hop by hop, and the body is size-capped.
"""
from __future__ import annotations

import asyncio
import hashlib
import ipaddress
import logging
import re
import socket
from html.parser import HTMLParser
from typing import Awaitable, Callable

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


class FetchBlockedError(ValueError):
    """URL rejected by the SSRF policy (scheme, host, or resolved address)."""


class FetchTooLargeError(ValueError):
    """Response exceeded the configured byte cap."""


ALLOWED_SCHEMES = {'http', 'https'}
TEXT_CONTENT_TYPES = ('text/', 'application/xhtml+xml', 'application/xml', 'application/json')

Resolver = Callable[[str, int], Awaitable[list[str]]]


async def _default_resolver(host: str, port: int) -> list[str]:
    loop = asyncio.get_running_loop()
    infos = await loop.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    return list(dict.fromkeys(info[4][0] for info in infos))


def is_public_ip(ip: str) -> bool:
    """True only for globally routable unicast addresses.

    Rejects private, loopback, link-local (incl. 169.254.169.254 metadata),
    CGNAT, reserved, multicast and unspecified ranges; IPv4-mapped IPv6 is
    checked as the embedded IPv4 address.
    """
    try:
        addr = ipaddress.ip_address(ip.split('%', 1)[0])
    except ValueError:
        return False
    if isinstance(addr, ipaddress.IPv6Address) and addr.ipv4_mapped is not None:
        addr = addr.ipv4_mapped
    return bool(
        addr.is_global
        and not addr.is_multicast
        and not addr.is_private
        and not addr.is_loopback
        and not addr.is_link_local
        and not addr.is_reserved
        and not addr.is_unspecified
    )


async def validate_url(url: str, resolver: Resolver | None = None) -> tuple[httpx.URL, str]:
    """Check scheme/host and resolve the host to a single public IP.

    Returns (parsed_url, pinned_ip). Every resolved address must be public,
    otherwise a DNS answer mixing public and private records could be used
    to reach an internal host.
    """
    try:
        parsed = httpx.URL(url)
    except Exception as e:
        raise FetchBlockedError(f'Invalid URL: {e}') from None
    if parsed.scheme not in ALLOWED_SCHEMES:
        raise FetchBlockedError('Only http and https URLs can be fetched')
    host = parsed.host
    if not host:
        raise FetchBlockedError('URL has no host')
    port = parsed.port or (443 if parsed.scheme == 'https' else 80)

    try:
        literal = ipaddress.ip_address(host)
        addresses = [str(literal)]
    except ValueError:
        try:
            addresses = await (resolver or _default_resolver)(host, port)
        except (OSError, socket.gaierror) as e:
            raise FetchBlockedError(f'Host could not be resolved: {host}') from e
    if not addresses:
        raise FetchBlockedError(f'Host could not be resolved: {host}')
    bad = [a for a in addresses if not is_public_ip(a)]
    if bad:
        raise FetchBlockedError('URL resolves to a non-public address')
    return parsed, addresses[0]


def _pinned_request(client: httpx.AsyncClient, parsed: httpx.URL, ip: str) -> httpx.Request:
    """Build a request that connects to the already-validated IP.

    Connecting by IP closes the DNS-rebinding gap between validation and
    connect. The Host header keeps virtual hosting working, and sni_hostname
    keeps TLS SNI + certificate verification bound to the real hostname.
    """
    target = parsed.copy_with(host=ip) if ip != parsed.host else parsed
    host_header = parsed.host if parsed.port is None else f'{parsed.host}:{parsed.port}'
    extensions = {'sni_hostname': parsed.host} if parsed.scheme == 'https' else {}
    return client.build_request('GET', target, headers={'Host': host_header}, extensions=extensions)


async def fetch_url(
    url: str,
    timeout: float | None = None,
    *,
    max_bytes: int | None = None,
    max_redirects: int | None = None,
    resolver: Resolver | None = None,
    transport: httpx.AsyncBaseTransport | None = None,
) -> dict:
    """Fetch a URL with SSRF protection and return structured content.

    * http/https only; the host must resolve to public addresses only, and
      the connection is pinned to the validated IP
    * redirects are followed manually (at most ``max_redirects``) and every
      hop is re-validated
    * the body is streamed and aborted past ``max_bytes``
    * only text-like content types are accepted

    Raises FetchBlockedError / FetchTooLargeError for policy violations and
    httpx.HTTPError for transport / HTTP status failures.

    Returns:
        dict with keys: url, content, content_hash, token_count, content_type
    """
    from app.config import get_settings
    s = get_settings()
    timeout = timeout if timeout is not None else s.fetch_timeout_seconds
    max_bytes = max_bytes if max_bytes is not None else s.fetch_max_bytes
    max_redirects = max_redirects if max_redirects is not None else s.fetch_max_redirects

    current = url
    async with httpx.AsyncClient(
        follow_redirects=False,
        headers={'User-Agent': 'Kaizou/1.0 (educational-tool)'},
        timeout=timeout,
        transport=transport,
        trust_env=False,  # never route through env-configured proxies
    ) as client:
        for _hop in range(max_redirects + 1):
            parsed, ip = await validate_url(current, resolver)
            request = _pinned_request(client, parsed, ip)
            response = await client.send(request, stream=True)
            try:
                if response.is_redirect:
                    location = response.headers.get('location')
                    if not location:
                        raise FetchBlockedError('Redirect without Location header')
                    current = str(parsed.join(location))
                    continue
                response.raise_for_status()

                content_type = response.headers.get('content-type', '')
                if content_type and not content_type.lower().startswith(TEXT_CONTENT_TYPES):
                    raise FetchBlockedError(f'Unsupported content type: {content_type.split(";")[0]}')
                declared = response.headers.get('content-length')
                if declared and declared.isdigit() and int(declared) > max_bytes:
                    raise FetchTooLargeError(f'Response larger than {max_bytes} bytes')

                chunks: list[bytes] = []
                size = 0
                async for chunk in response.aiter_bytes():
                    size += len(chunk)
                    if size > max_bytes:
                        raise FetchTooLargeError(f'Response larger than {max_bytes} bytes')
                    chunks.append(chunk)
                encoding = response.charset_encoding or 'utf-8'
                try:
                    raw_content = b''.join(chunks).decode(encoding, errors='replace')
                except LookupError:
                    raw_content = b''.join(chunks).decode('utf-8', errors='replace')
                break
            finally:
                await response.aclose()
        else:
            raise FetchBlockedError(f'Too many redirects (max {max_redirects})')

    # Extract clean text based on content type
    if 'text/html' in content_type:
        clean_text = extract_text_from_html(raw_content)
    else:
        clean_text = raw_content

    # Compute hash and token count
    content_hash = hashlib.sha256(clean_text.encode()).hexdigest()
    token_count = len(clean_text.split())

    return {
        'url': current,
        'content': clean_text[:50000],  # Cap at 50k chars
        'content_hash': content_hash,
        'token_count': token_count,
        'content_type': content_type,
    }