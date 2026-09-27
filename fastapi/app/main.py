"""Kaizou — FastAPI Computational/ML Backend.

This service owns all computational and ML-intensive operations:
ingestion, grading, retrieval, memory, graph, probes, evaluation, and jobs.

Master Design: §12 Service Boundaries
"""

import asyncio
import sys

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager

# psycopg's async pool cannot run on Windows' default Proactor loop. Select the
# selector loop before the event loop is created. Unaffected on Linux (the
# deployment target), which already uses a compatible loop.
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from app.providers.shared.errors import BudgetExhaustedError, ProviderConfigError, ProviderError

from app.config import get_settings
from app.dependencies import init_pool, close_pool, require_internal_key
from app.ingestion.router import router as ingestion_router
from app.retrieval.router import router as retrieval_router
from app.grading.router import router as grading_router
from app.probes.router import router as probes_router
from app.memory.router import router as review_router
from app.graph.router import router as learning_paths_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifecycle: DB pool startup/shutdown."""
    settings = get_settings()
    await init_pool(settings.database_url)
    # Optional NLI model preload in the background; startup does not wait.
    nli_warmup = None
    if settings.nli_enabled and settings.nli_preload:
        from app.nli.service import warm_up_nli
        nli_warmup = asyncio.create_task(warm_up_nli(settings))
    yield
    if nli_warmup is not None and not nli_warmup.done():
        nli_warmup.cancel()  # the loader thread finishes on its own
    await close_pool()


app = FastAPI(
    title="Kaizou API",
    description=(
        "Computational/ML backend for the Kaizou learning system. "
        "Handles ingestion, grading, retrieval, memory decay, graph computation, "
        "probe generation, evaluation, and background jobs. "
        "See: _references/second-brain-master-design.md"
    ),
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in get_settings().fastapi_cors_origins.split(",") if o.strip()],
    allow_credentials=False,  # auth is a server-side header, not cookies
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type", "X-Internal-Key"],
)

# --- Internal routers: every route requires the Express shared key ---
_internal = [Depends(require_internal_key)]
app.include_router(ingestion_router, dependencies=_internal)
app.include_router(retrieval_router, dependencies=_internal)
app.include_router(grading_router, dependencies=_internal)
app.include_router(probes_router, dependencies=_internal)
app.include_router(review_router, dependencies=_internal)
app.include_router(learning_paths_router, dependencies=_internal)


@app.exception_handler(ProviderError)
async def provider_error_handler(request: Request, exc: ProviderError):
    """Map AI-provider failures to clear HTTP errors (no key values leak:
    messages name env vars, never their contents)."""
    if isinstance(exc, BudgetExhaustedError):
        # 402 Payment Required: the AI budget cap stopped this call.
        return JSONResponse(
            status_code=402,
            content={"error": "ai_budget_exhausted", "provider": "budget",
                     "detail": str(exc), "spent_inr": round(exc.spent_inr, 2),
                     "cap_inr": round(exc.cap_inr, 2)},
        )
    status = 503 if isinstance(exc, ProviderConfigError) else 502
    return JSONResponse(
        status_code=status,
        content={"error": "ai_provider_error", "provider": exc.provider,
                 "type": type(exc).__name__, "detail": str(exc)},
    )


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok"}