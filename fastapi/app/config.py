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

    # --- Local NLI (contradiction detection, §5.10) — runs on CPU, no API ---
    # Multilingual by default: the only benchmarked candidate that handled
    # cross-lingual claim pairs. English-only alternatives:
    # cross-encoder/nli-deberta-v3-base (Apache-2.0). PROVISIONAL — confirm
    # with a project-specific benchmark before shipping.
    nli_enabled: bool = True
    nli_model: str = "MoritzLaurer/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7"
    nli_revision: str = "b5113eb38ab63efdd7f280f8c144ea8b13f978ce"  # pinned for reproducibility
    nli_device: str = "cpu"                 # "cpu" | "cuda"
    nli_max_length: int = 256               # tokens per premise+hypothesis pair
    nli_batch_size: int = 16                # pairs per forward pass
    nli_preprocessing_version: str = "v1"   # bump to invalidate the NLI cache
    nli_preload: bool = False               # load the model in the background at startup

    # --- AI providers (see AI_PROVIDER_DECISIONS.md) ---
    # All keys are backend-only. Never expose them to Express responses or
    # any frontend bundle.

    # Classification: Jev (TypeSafe System One decision model)
    jev_backend: str = "openrouter"          # "openrouter" | "typesafe"
    openrouter_api_key: str = ""             # used when jev_backend=openrouter
    typesafe_api_key: str = ""               # used when jev_backend=typesafe
    jev_model: str = ""                      # blank → backend default (pinned)

    # Generation: primary LLM (+ optional secondary for benchmarking)
    generation_provider: str = "gemini"      # "gemini" (default, budget) | "anthropic" (optional)
    anthropic_api_key: str = ""
    generation_model: str = "claude-opus-5-5"
    generation_effort: str = "medium"        # low|medium|high|xhigh|max
    generation_max_tokens: int = 16000       # covers thinking + JSON output
    gemini_generation_model: str = "gemini-3.8-flash"
    # minimal|low|medium|high; blank → model default. Thinking is billed as
    # output and shares the generation_max_tokens ceiling.
    gemini_thinking_level: str = ""

    # Embeddings (GEMINI_API_KEY also covers the secondary generator)
    gemini_api_key: str = ""
    embedding_model: str = "gemini-embedding-2"

    # Shared HTTP behaviour for all providers
    provider_timeout_seconds: float = 120.0
    provider_max_retries: int = 3

    # --- Budget, ledger, cache (see AI_PROVIDER_DECISIONS.md §Cost controls) ---
    # Hard ceiling on cumulative estimated AI spend. When exhausted, paid
    # calls raise BudgetExhaustedError; deterministic features keep working.
    ai_budget_inr: float = 2000.0
    # Below this fraction of the cap, optional work (benchmarking, extra
    # retries) is skipped to preserve budget for core calls.
    ai_budget_soft_fraction: float = 0.80
    # USD→INR used to convert provider prices. Update with the rate + date.
    usd_inr_rate: float = 96.0
    # Toggle the ledger (spend tracking) and reuse cache. Both default on.
    ai_ledger_enabled: bool = True
    ai_cache_enabled: bool = True
    # Prompt/schema version tags — bump to invalidate cached generations.
    ai_prompt_version: str = "v1"

    # Ingestion execution mode:
    # "inline" — /ingest runs the pipeline synchronously (works without a
    #            running worker; good for dev/single-box).
    # "job"    — /ingest enqueues a job; a running worker processes it.
    ingest_mode: str = "inline"
    fastapi_host: str = "0.0.0.0"
    fastapi_port: int = 8000
    express_base_url: str = "http://localhost:3000"
    internal_api_key: str = ""  # shared secret for Express↔FastAPI (X-Internal-Key)
    # Escape hatch for local experiments without a key. Never enable in deployment.
    allow_unauthenticated_internal: bool = False
    # Comma-separated. FastAPI is called server-to-server by Express, so
    # browsers normally never need it; only list origins that must reach it.
    fastapi_cors_origins: str = "http://localhost:3000"

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
    probe_leakage_ngram_n: int = 4              # n-gram size for τ_ngram
    probe_leakage_max_retries: int = 3          # bounded regenerate loop (§6.7)
    cloze_short_answer_max_chars: int = 10      # ≤ this: exact/alias match only

    # NLI
    nli_contradiction_threshold: float = 0.70   # θ_c

    # Composite score
    pass_threshold: float = 0.50                # s_pass
    # §5.12/§5.24.1: a perturbation probe passes (and gates Relational) at its
    # own delta-score threshold, independent of the composite pass gate.
    perturbation_pass_threshold: float = 0.70   # δ_pass
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
    review_forgetting_threshold: float = 0.60   # queue only R(now) < this (§6.9)

    # Clustering
    cluster_resolution_top: float = 1.0         # γ_res top-level
    cluster_resolution_sub: float = 1.6         # γ_res sub-cluster
    cluster_modularity_min: float = 0.30
    cluster_min_for_sub: int = 12
    # Delay before a post-ingestion recluster job runs, so a burst of note
    # saves collapses into one run (the job is deduped per learner).
    recluster_delay_seconds: int = 60

    # --- Web source retrieval (§10.1) — blank = search disabled ---
    google_search_api_key: str = ""
    google_search_engine_id: str = ""
    # SSRF / size guards for /retrieval/fetch and the source fetcher
    fetch_max_bytes: int = 2_000_000
    fetch_max_redirects: int = 5
    fetch_timeout_seconds: float = 20.0

    # Privacy
    privacy_floor: int = 5                      # N=5 (D-10)

    # Grading agreement (§5.25.1) — Cohen's kappa is only written to
    # portal_aggregates once at least this many attempts carry a human gold
    # label; below it the row is suppressed (too small a sample to trust).
    kappa_min_labels: int = 20

    # Embedding — must equal the vector(N) columns in database/schema.sql
    embedding_dimensions: int = 1536


@lru_cache
def get_settings() -> Settings:
    """Return cached Settings singleton."""
    return Settings()