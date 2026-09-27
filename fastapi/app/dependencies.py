"""Dependency injection for FastAPI (§12).

Provides:
- Database connection pool (psycopg async)
- Settings singleton
- Service-to-service auth verification
"""
from __future__ import annotations

import hmac
import logging
from contextlib import asynccontextmanager
from functools import lru_cache

from fastapi import Header, HTTPException
from typing import AsyncGenerator, Optional

import psycopg
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

from app.config import Settings

logger = logging.getLogger(__name__)

# Global connection pool — initialised in lifespan
_pool: Optional[AsyncConnectionPool] = None


@lru_cache
def get_settings() -> Settings:
    """Return cached Settings singleton."""
    return Settings()


async def init_pool(database_url: str) -> AsyncConnectionPool:
    """Create and open the async connection pool."""
    global _pool
    _pool = AsyncConnectionPool(
        conninfo=database_url,
        min_size=2,
        max_size=10,
        kwargs={"row_factory": dict_row},
    )
    await _pool.open()
    logger.info("Database connection pool opened")
    return _pool


async def close_pool() -> None:
    """Close the connection pool."""
    global _pool
    if _pool:
        await _pool.close()
        _pool = None
        logger.info("Database connection pool closed")


async def get_db() -> AsyncGenerator[psycopg.AsyncConnection, None]:
    """Yield an async database connection from the pool.
    
    Usage as a FastAPI dependency:
        async def endpoint(db=Depends(get_db)):
            async with db.cursor() as cur:
                await cur.execute("SELECT ...")
    """
    if _pool is None:
        raise RuntimeError("Database pool not initialised. Call init_pool() first.")
    async with _pool.connection() as conn:
        yield conn


def verify_internal_token(token: Optional[str]) -> bool:
    """Constant-time check of the Express→FastAPI shared secret.

    Fails closed: with no INTERNAL_API_KEY configured, nothing is accepted
    unless ALLOW_UNAUTHENTICATED_INTERNAL=true is set explicitly (local
    experiments only; never in deployment).
    """
    settings = get_settings()
    expected = settings.internal_api_key
    if not expected:
        return bool(settings.allow_unauthenticated_internal)
    if not token:
        return False
    return hmac.compare_digest(token.encode(), expected.encode())


async def require_internal_key(
    x_internal_key: Optional[str] = Header(default=None, alias="X-Internal-Key"),
) -> None:
    """Router-level dependency: only Express (holding the shared key) may call.

    FastAPI trusts the learner_id Express sends because Express derives it
    from a verified JWT; this dependency is what makes that trust valid.
    """
    if not verify_internal_token(x_internal_key):
        raise HTTPException(status_code=401, detail="Invalid or missing X-Internal-Key")