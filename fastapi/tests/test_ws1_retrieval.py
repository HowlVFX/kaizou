"""WS1: SSRF-guarded fetcher, trust tiers, web search wiring.

All HTTP is httpx.MockTransport and DNS is a fake resolver — no network.
"""
from __future__ import annotations

import asyncio

import httpx
import pytest

from app.retrieval import router as retrieval_router
from app.retrieval.fetcher import (
    FetchBlockedError,
    FetchTooLargeError,
    fetch_url,
    is_public_ip,
    validate_url,
)
from app.retrieval.schemas import SearchRequest
from app.retrieval.search import (
    SearchUnavailableError,
    WebSearchService,
    classify_trust_tier,
    normalize_trust_tiers,
)

PUBLIC = "93.184.216.34"


def resolver_for(table: dict[str, list[str]]):
    async def resolve(host, port):
        if host not in table:
            raise OSError("NXDOMAIN")
        return table[host]
    return resolve


@pytest.mark.parametrize("ip,ok", [
    (PUBLIC, True), ("2606:4700::1111", True),
    ("127.0.0.1", False), ("10.1.2.3", False), ("192.168.0.1", False), ("172.16.5.5", False),
    ("169.254.169.254", False), ("100.64.0.1", False), ("0.0.0.0", False), ("224.0.0.1", False),
    ("::1", False), ("fe80::1", False), ("fc00::1", False), ("::ffff:127.0.0.1", False),
    ("240.0.0.1", False), ("not-an-ip", False),
])
def test_is_public_ip(ip, ok):
    assert is_public_ip(ip) is ok


def test_validate_url_rejections():
    async def run():
        res = resolver_for({"good.test": [PUBLIC], "internal.test": ["10.0.0.5"],
                            "mixed.test": [PUBLIC, "127.0.0.1"]})
        _, ip = await validate_url("https://good.test/x", res)
        assert ip == PUBLIC
        for bad in ("file:///etc/passwd", "gopher://good.test/", "ftp://good.test/",
                    "http://internal.test/", "http://mixed.test/", "http://127.0.0.1:8000/",
                    "http://[::1]/", "http://169.254.169.254/latest/meta-data/",
                    "http://nxdomain.test/", "http:///nohost"):
            with pytest.raises(FetchBlockedError):
                await validate_url(bad, res)
    asyncio.run(run())


def test_fetch_pins_ip_and_extracts_text():
    seen = {}

    def handler(request: httpx.Request):
        seen["host"] = request.url.host
        seen["host_header"] = request.headers["host"]
        seen["sni"] = request.extensions.get("sni_hostname")
        return httpx.Response(200, headers={"content-type": "text/html; charset=utf-8"},
                              content=b"<html><script>x</script><p>Hello  world</p></html>")

    async def run():
        out = await fetch_url("https://docs.test/page", resolver=resolver_for({"docs.test": [PUBLIC]}),
                              transport=httpx.MockTransport(handler))
        assert out["content"] == "Hello world" and out["token_count"] == 2
        assert seen == {"host": PUBLIC, "host_header": "docs.test", "sni": "docs.test"}
    asyncio.run(run())


def test_redirect_to_private_host_is_blocked_per_hop():
    def handler(request: httpx.Request):
        if request.headers["host"] == "pub.test":
            return httpx.Response(302, headers={"location": "http://metadata.test/secret"})
        raise AssertionError("private host must never be contacted")

    async def run():
        res = resolver_for({"pub.test": [PUBLIC], "metadata.test": ["169.254.169.254"]})
        with pytest.raises(FetchBlockedError):
            await fetch_url("http://pub.test/", resolver=res, transport=httpx.MockTransport(handler))
    asyncio.run(run())


def test_redirect_limit_and_relative_redirects():
    def loop_handler(request):
        return httpx.Response(301, headers={"location": "/again"})

    def ok_after_one(request):
        if request.url.path == "/start":
            return httpx.Response(302, headers={"location": "/final"})
        return httpx.Response(200, headers={"content-type": "text/plain"}, content=b"done")

    async def run():
        res = resolver_for({"a.test": [PUBLIC]})
        with pytest.raises(FetchBlockedError, match="Too many redirects"):
            await fetch_url("http://a.test/", resolver=res, max_redirects=3,
                            transport=httpx.MockTransport(loop_handler))
        out = await fetch_url("http://a.test/start", resolver=res,
                              transport=httpx.MockTransport(ok_after_one))
        assert out["content"] == "done" and out["url"] == "http://a.test/final"
    asyncio.run(run())


def test_size_cap_and_content_type():
    async def run():
        res = resolver_for({"big.test": [PUBLIC]})
        big = httpx.MockTransport(lambda r: httpx.Response(
            200, headers={"content-type": "text/plain"}, content=b"x" * 5000))
        with pytest.raises(FetchTooLargeError):
            await fetch_url("http://big.test/", resolver=res, max_bytes=1000, transport=big)
        binary = httpx.MockTransport(lambda r: httpx.Response(
            200, headers={"content-type": "application/octet-stream"}, content=b"\x00"))
        with pytest.raises(FetchBlockedError):
            await fetch_url("http://big.test/", resolver=res, transport=binary)
    asyncio.run(run())


def test_trust_tier_domain_matching_is_not_substring():
    assert classify_trust_tier("www.nature.com") == "PEER_REVIEWED"
    assert classify_trust_tier("docs.python.org:443") == "INSTITUTIONAL"
    assert classify_trust_tier("nature.com.attacker.io") == "GENERAL"
    assert classify_trust_tier("notnature.com") == "GENERAL"


def test_normalize_trust_tiers():
    assert normalize_trust_tiers(["tier_1", "Tier-2", "3", "4", "PEER_REVIEWED"]) == \
        ["PEER_REVIEWED", "INSTITUTIONAL", "GENERAL"]
    assert normalize_trust_tiers([]) == []
    for bad in (["SELF_AUTHORED"], ["gold"]):
        with pytest.raises(ValueError):
            normalize_trust_tiers(bad)


def test_web_search_filters_tiers_and_hides_key_on_error():
    items = {"items": [
        {"link": "https://www.nature.com/a", "snippet": "s1", "title": "t1"},
        {"link": "https://random.blog/b", "snippet": "s2", "title": "t2"},
    ]}

    async def run():
        ok = WebSearchService("SECRETKEY", "cx", transport=httpx.MockTransport(
            lambda r: httpx.Response(200, json=items)))
        res = await ok.search_for_concept("Topic", ["claim"], ["PEER_REVIEWED"])
        assert [r["trust_tier"] for r in res] == ["PEER_REVIEWED"]

        bad = WebSearchService("SECRETKEY", "cx", transport=httpx.MockTransport(
            lambda r: httpx.Response(403, json={})))
        assert await bad.search("q") == []
        with pytest.raises(SearchUnavailableError) as exc:
            await bad.search("q", raise_errors=True)
        assert "SECRETKEY" not in str(exc.value)
    asyncio.run(run())


def test_search_endpoint_reports_unconfigured(monkeypatch):
    monkeypatch.setattr(WebSearchService, "from_settings",
                        classmethod(lambda cls, settings=None: cls("", "")))

    async def run():
        out = await retrieval_router.search(SearchRequest(concept_label="x", claims=[]))
        assert out.results == [] and out.configured is False and out.detail
    asyncio.run(run())


def test_search_endpoint_rejects_unknown_tier():
    from fastapi import HTTPException

    async def run():
        with pytest.raises(HTTPException) as exc:
            await retrieval_router.search(SearchRequest(concept_label="x", claims=[], trust_tiers=["gold"]))
        assert exc.value.status_code == 422
    asyncio.run(run())
