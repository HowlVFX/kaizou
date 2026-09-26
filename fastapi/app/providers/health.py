"""Provider health checks — confirm keys and endpoints with one real call each.

Usage (from second_brain-main/fastapi, with .env populated):

    python -m app.providers.health                  # all three roles
    python -m app.providers.health classification   # just Jev
    python -m app.providers.health generation       # configured generator
    python -m app.providers.health generation --provider gemini
    python -m app.providers.health embeddings

Exit code 0 when every selected check passes, 1 otherwise. Failures print the
provider's actionable message, not a stack trace. Each check costs well under
one US cent.

Deliberately not exposed as an HTTP endpoint: an unauthenticated route that
triggers paid provider calls would be a cost/abuse risk.
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from typing import Awaitable, Callable

from app.providers.classification import check_classification_provider
from app.providers.embeddings import check_embedding_provider
from app.providers.generation import check_generation_provider
from app.providers.shared.errors import ProviderError
from app.providers.shared.types import HealthCheckResult

ROLES = ("classification", "generation", "embeddings")


async def _run_one(role: str, check: Callable[[], Awaitable[HealthCheckResult]]) -> HealthCheckResult:
    try:
        return await check()
    except ProviderError as exc:
        return HealthCheckResult(role=role, provider=exc.provider, model="?", ok=False, detail=str(exc))
    except Exception as exc:  # unexpected: still no raw traceback for the user
        return HealthCheckResult(role=role, provider="?", model="?", ok=False,
                                 detail=f"unexpected {type(exc).__name__}: {exc}")


async def run_checks(roles: tuple[str, ...] = ROLES, generation_provider: str | None = None) -> list[HealthCheckResult]:
    checks: dict[str, Callable[[], Awaitable[HealthCheckResult]]] = {
        "classification": check_classification_provider,
        "generation": lambda: check_generation_provider(provider=generation_provider),
        "embeddings": check_embedding_provider,
    }
    return list(await asyncio.gather(*(_run_one(r, checks[r]) for r in roles)))


def _print(results: list[HealthCheckResult]) -> None:
    for r in results:
        mark = "PASS" if r.ok else "FAIL"
        latency = f" {r.latency_ms:.0f}ms" if r.latency_ms is not None else ""
        print(f"[{mark}] {r.role:<14} {r.provider:<16} {r.model}{latency}")
        print(f"       {r.detail}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Check AI provider connectivity.")
    parser.add_argument("roles", nargs="*", choices=ROLES, help="roles to check (default: all)")
    parser.add_argument("--provider", choices=("anthropic", "gemini"),
                        help="override GENERATION_PROVIDER for the generation check")
    args = parser.parse_args(argv)

    # Provider messages can contain non-ASCII; don't crash a cp1252 console.
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(errors="replace")

    results = asyncio.run(run_checks(tuple(args.roles) or ROLES, args.provider))
    _print(results)
    return 0 if all(r.ok for r in results) else 1


if __name__ == "__main__":
    sys.exit(main())
