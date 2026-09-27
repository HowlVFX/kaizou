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
    """Readable-text extractor for HTML pages.

    Drops page chrome (scripts, navigation, menus, headers/footers, sidebars,
    cookie banners, citation markers, edit links) and, when the page marks up
    its main content (<main>, <article>, role=main), keeps only that. Block
    elements become line breaks so paragraphs survive.
    """

    SKIP_TAGS = {
        'script', 'style', 'noscript', 'template', 'svg', 'canvas', 'iframe',
        'nav', 'header', 'footer', 'aside', 'form', 'button', 'select',
        'menu', 'dialog', 'head',
    }
    VOID_TAGS = {
        'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link',
        'meta', 'source', 'track', 'wbr',
    }
    BLOCK_TAGS = {
        'p', 'div', 'section', 'article', 'main', 'li', 'ul', 'ol', 'table',
        'tr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'dd',
        'dt', 'figcaption', 'br',
    }
    SKIP_ROLES = {'navigation', 'banner', 'contentinfo', 'search', 'complementary', 'menu', 'menubar'}
    # Exact class/id tokens (Wikipedia and common CMS chrome).
    SKIP_TOKENS = {
        'reference', 'references', 'reflist', 'mw-references-wrap', 'mw-editsection',
        'navbox', 'vertical-navbox', 'toc', 'catlinks', 'printfooter', 'mw-jump-link',
        'noprint', 'metadata', 'sistersitebox', 'breadcrumb', 'breadcrumbs',
        'share', 'social', 'advert', 'ads', 'comments',
    }
    SKIP_SUBSTRINGS = ('sidebar', 'cookie', 'navbar', 'menu', 'footer', 'banner', 'subscribe', 'popup')
    MAIN_IDS = {'content', 'main', 'main-content', 'mw-content-text', 'bodycontent'}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self._all: list[str] = []
        self._main: list[str] = []
        self._skip_stack: list[str] = []
        self._main_stack: list[str] = []

    # Page-level containers carry site-wide classes (e.g. Wikipedia's <html
    # class="... vector-feature-main-menu-...">); never skip them by class.
    NEVER_SKIP = {'html', 'body', 'main', 'article'}

    def _should_skip(self, tag: str, attrs: list[tuple[str, str | None]]) -> bool:
        if tag in self.SKIP_TAGS:
            return True
        if tag in self.NEVER_SKIP:
            return False
        a = {k: (v or '') for k, v in attrs}
        if a.get('role', '').lower() in self.SKIP_ROLES or 'hidden' in a or a.get('aria-hidden') == 'true':
            return True
        tokens = (a.get('class', '') + ' ' + a.get('id', '')).lower().split()
        return any(t in self.SKIP_TOKENS or any(s in t for s in self.SKIP_SUBSTRINGS) for t in tokens)

    def _is_main(self, tag: str, attrs: list[tuple[str, str | None]]) -> bool:
        a = {k: (v or '') for k, v in attrs}
        return (
            tag in ('main', 'article')
            or a.get('role', '').lower() == 'main'
            or a.get('id', '').lower() in self.MAIN_IDS
        )

    def _emit(self, text: str) -> None:
        self._all.append(text)
        if self._main_stack:
            self._main.append(text)

    def handle_starttag(self, tag, attrs):
        void = tag in self.VOID_TAGS
        if self._skip_stack:
            if not void:
                self._skip_stack.append(tag)
            return
        if not void and self._should_skip(tag, attrs):
            self._skip_stack.append(tag)
            return
        if self._main_stack:
            if not void:
                self._main_stack.append(tag)
        elif not void and self._is_main(tag, attrs):
            self._main_stack.append(tag)
        if tag in self.BLOCK_TAGS:
            self._emit('\n')

    def handle_startendtag(self, tag, attrs):
        if not self._skip_stack and tag in self.BLOCK_TAGS:
            self._emit('\n')

    @staticmethod
    def _pop(stack: list[str], tag: str) -> None:
        # Tolerate unclosed children: pop up to and including the match.
        if tag in stack:
            while stack and stack.pop() != tag:
                pass

    def handle_endtag(self, tag):
        if self._skip_stack:
            self._pop(self._skip_stack, tag)
            return
        if tag in self.BLOCK_TAGS:
            self._emit('\n')
        if self._main_stack:
            self._pop(self._main_stack, tag)

    def handle_data(self, data):
        if self._skip_stack:
            return
        # Whitespace-only runs between inline tags still separate words.
        text = re.sub(r'\s+', ' ', data)
        if text:
            self._emit(text)

    def get_text(self) -> str:
        main = ''.join(self._main)
        # Prefer the page's main content when it holds real text.
        chosen = main if len(main.strip()) >= 200 else ''.join(self._all)
        lines = [re.sub(r'[ \t]+', ' ', ln).strip() for ln in chosen.split('\n')]
        out: list[str] = []
        for ln in lines:
            if ln:
                out.append(ln)
            elif out and out[-1] != '':
                out.append('')
        return '\n'.join(out).strip()


def extract_text_from_html(html: str) -> str:
    """Extract readable text (paragraphs separated by blank lines) from HTML."""
    parser = HTMLTextExtractor()
    parser.feed(html)
    parser.close()
    return parser.get_text()


class FetchBlockedError(ValueError):
    """URL rejected by the SSRF policy (scheme, host, or resolved address)."""


class FetchTooLargeError(ValueError):
    """Response exceeded the configured byte cap."""


ALLOWED_SCHEMES = {'http', 'https'}

# Wikipedia (and sites following its UA policy) return 403 to generic agents;
# a descriptive bot UA with a contact URL is accepted there. Some CDNs block
# every bot UA, so a 403 is retried once with a browser-style agent.
BOT_USER_AGENT = 'KaizouBot/1.0 (https://github.com/HowlVFX/kaizou; learning-app source fetcher) httpx'
BROWSER_USER_AGENT = (
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
    '(KHTML, like Gecko) Chrome/124.0 Safari/537.36 KaizouBot/1.0'
)
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
        headers={
            'Accept': 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5',
            'Accept-Language': 'en;q=0.9',
        },
        timeout=timeout,
        transport=transport,
        trust_env=False,  # never route through env-configured proxies
    ) as client:
        user_agent = BOT_USER_AGENT
        redirects = 0
        for _hop in range(max_redirects + 2):  # +1 for a single 403 UA retry
            parsed, ip = await validate_url(current, resolver)
            request = _pinned_request(client, parsed, ip)
            request.headers['User-Agent'] = user_agent
            response = await client.send(request, stream=True)
            try:
                if response.is_redirect:
                    location = response.headers.get('location')
                    if not location:
                        raise FetchBlockedError('Redirect without Location header')
                    current = str(parsed.join(location))
                    redirects += 1
                    if redirects > max_redirects:
                        raise FetchBlockedError(f'Too many redirects (max {max_redirects})')
                    continue
                if response.status_code == 403 and user_agent == BOT_USER_AGENT:
                    # Some CDNs reject bot agents outright; retry the same URL
                    # once with a browser agent (same SSRF checks apply).
                    user_agent = BROWSER_USER_AGENT
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
    title = ''
    if 'text/html' in content_type:
        clean_text = extract_text_from_html(raw_content)
        m = re.search(r'<title[^>]*>(.*?)</title>', raw_content, re.IGNORECASE | re.DOTALL)
        if m:
            import html as _html
            title = re.sub(r'\s+', ' ', _html.unescape(m.group(1))).strip()[:200]
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
        'title': title,
    }