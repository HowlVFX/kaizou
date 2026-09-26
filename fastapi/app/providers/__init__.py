"""AI provider layer (backend-only).

    classification/  Jev (TypeSafe AI)          — bounded-choice decisions
    generation/      Claude Opus 5.5 (primary)  — structured content
                     Gemini (secondary, flag)   — benchmarking only
    embeddings/      gemini-embedding-2 @1536   — similarity / identity / leakage
    shared/          errors, retrying HTTP, common types

Contradiction detection is NOT here: it stays on the local NLI model
(settings.nli_model) by design. API keys are read from FastAPI settings only
and must never be returned to Express or any frontend.
"""
from app.providers.classification import check_classification_provider, get_classification_client
from app.providers.embeddings import check_embedding_provider, get_embedding_client
from app.providers.generation import check_generation_provider, get_generation_client

__all__ = [
    "check_classification_provider",
    "check_embedding_provider",
    "check_generation_provider",
    "get_classification_client",
    "get_embedding_client",
    "get_generation_client",
]
