"""Application settings (§5.26 — all tunable constants)."""
from __future__ import annotations
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """All configuration derived from environment variables."""

    # extra="ignore" so a stale .env (e.g. the retired LLM_PROVIDER /
    # LLM_API_KEY keys) does not crash startup.
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore",
    )

    # --- Infrastructure ---
    database_url: str = "postgresql://localhost:5432/kaizou"
    nli_model: str = "cross-encoder/nli-deberta-v3-base"  # local, not a provider

    # --- AI providers (see AI_PROVIDER_DECISIONS.md) ---
    # All keys are backend-only. Never expose them to Express responses or
    # any frontend bundle.

    # Classification: Jev (TypeSafe System One decision model)
    jev_backend: str = "openrouter"          # "openrouter" | "typesafe"
    openrouter_api_key: str = ""             # used when jev_backend=openrouter
    typesafe_api_key: str = ""               # used when jev_backend=typesafe
    jev_model: str = ""                      # blank → backend default (pinned)

    # Generation: primary LLM (+ optional secondary for benchmarking)
    generation_provider: str = "anthropic"   # "anthropic" (primary) | "gemini"
    anthropic_api_key: str = ""
    generation_model: str = "claude-opus-5-5"
    generation_effort: str = "medium"        # low|medium|high|xhigh|max
    generation_max_tokens: int = 16000       # covers thinking + JSON output
    gemini_generation_model: str = "gemini-3.8-flash"

    # Embeddings (GEMINI_API_KEY also covers the secondary generator)
    gemini_api_key: str = ""
    embedding_model: str = "gemini-embedding-2"

    # Shared HTTP behaviour for all providers
    provider_timeout_seconds: float = 120.0
    provider_max_retries: int = 3
    fastapi_host: str = "0.0.0.0"
    fastapi_port: int = 8000
    express_base_url: str = "http://localhost:3000"
    internal_api_key: str = ""  # shared secret for Express↔FastAPI

    # --- Thresholds (§5.26) ---
    # Claim matching
    semantic_match_threshold: float = 0.82      # τ
    concept_identity_threshold: float = 0.90    # τ_identity
    semantic_link_threshold: float = 0.80       # τ_link
    semantic_top_k: int = 3

    # Verbatim
    verbatim_dead_zone: float = 0.35            # v_0

    # Probe leakage
    probe_leakage_semantic: float = 0.75        # τ_leak
    probe_leakage_ngram: float = 0.50           # τ_ngram

    # NLI
    nli_contradiction_threshold: float = 0.70   # θ_c

    # Composite score
    pass_threshold: float = 0.50                # s_pass
    w_coverage: float = 0.55
    w_ordering: float = 0.15
    w_precision: float = 0.30
    gamma_verbatim: float = 0.20                # γ
    beta_leakage: float = 0.25                  # β

    # Bands
    band_full: float = 0.85
    band_shallow: float = 0.50
    band_incomplete: float = 0.20

    # Memory decay
    spacing_lambda: float = 1.5                 # λ
    failure_multiplier: float = 0.50            # ρ
    stagnation_kappa: float = 0.60              # κ_s

    # Complexity
    complexity_min: float = 0.5
    complexity_max: float = 2.0
    complexity_alpha: float = 0.10              # α
    complexity_s_target: float = 0.85
    complexity_min_attempts: int = 5

    # Curriculum
    centrality_kappa: float = 0.50              # κ
    recency_guard_hours: float = 12.0
    detour_delta: float = 0.10                  # δ
    max_detour_depth: int = 2
    default_session_size: int = 8

    # Clustering
    cluster_resolution_top: float = 1.0         # γ_res top-level
    cluster_resolution_sub: float = 1.6         # γ_res sub-cluster
    cluster_modularity_min: float = 0.30
    cluster_min_for_sub: int = 12

    # Privacy
    privacy_floor: int = 5                      # N=5 (D-10)

    # Embedding — must equal the vector(N) columns in database/schema.sql
    embedding_dimensions: int = 1536


@lru_cache
def get_settings() -> Settings:
    """Return cached Settings singleton."""
    return Settings()