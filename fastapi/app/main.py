"""Kaizou — FastAPI Computational/ML Backend.

This service owns all computational and ML-intensive operations:
ingestion, grading, retrieval, memory, graph, probes, evaluation, and jobs.

Master Design: §12 Service Boundaries
"""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager

from app.providers.shared.errors import ProviderConfigError, ProviderError

from app.config import get_settings
from app.dependencies import init_pool, close_pool
from app.ingestion.router import router as ingestion_router
from app.retrieval.router import router as retrieval_router
from app.grading.router import router as grading_router
from app.probes.router import router as probes_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifecycle: DB pool startup/shutdown."""
    settings = get_settings()
    await init_pool(settings.database_url)
    yield
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
    allow_origins=["*"],  # TODO: Restrict to Express + frontend origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Public routers ---
app.include_router(ingestion_router)
app.include_router(retrieval_router)
app.include_router(grading_router)
app.include_router(probes_router)


@app.exception_handler(ProviderError)
async def provider_error_handler(request: Request, exc: ProviderError):
    """Map AI-provider failures to clear HTTP errors (no key values leak:
    messages name env vars, never their contents)."""
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