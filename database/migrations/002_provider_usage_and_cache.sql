-- Migration 002 — AI provider spend ledger and reuse cache.
--
-- Purpose: enforce the hard AI budget cap and avoid re-paying for unchanged
-- work. DB-backed only (D-13: no Redis).
--
-- 🔒 Privacy: NO free-text note/answer/prompt content is stored here. The
-- ledger holds only accounting; the cache stores hashed keys plus the
-- structured result the app already persists elsewhere.

-- Per-call accounting for every paid provider request.
CREATE TABLE IF NOT EXISTS provider_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL,                 -- 'gemini' | 'jev/typesafe' | ...
    model TEXT NOT NULL,
    task TEXT NOT NULL,                     -- 'generation' | 'embedding' | 'classification'
    input_tokens INTEGER,                   -- reported by provider, else NULL
    output_tokens INTEGER,
    tokens_estimated BOOLEAN NOT NULL DEFAULT false,  -- true = token counts are our estimate
    est_cost_inr REAL NOT NULL DEFAULT 0,   -- our estimate, NOT the billed amount
    reserved BOOLEAN NOT NULL DEFAULT false,-- true = pre-call worst-case hold (superseded on record)
    success BOOLEAN NOT NULL DEFAULT true,
    retry_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Sum of est_cost_inr over this table is the spend used against the cap.
CREATE INDEX IF NOT EXISTS idx_provider_usage_created ON provider_usage(created_at);
CREATE INDEX IF NOT EXISTS idx_provider_usage_task ON provider_usage(task, created_at);

-- Reuse cache. One row per (kind, key_hash). value_json is the structured
-- result to replay on a hit. Embedding vectors are stored as a JSON array.
CREATE TABLE IF NOT EXISTS ai_cache (
    kind TEXT NOT NULL,                     -- 'generation' | 'embedding' | 'nli'
    key_hash TEXT NOT NULL,                 -- sha256 of the normalized key parts
    model TEXT NOT NULL,
    value_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    hits INTEGER NOT NULL DEFAULT 0,
    last_used_at TIMESTAMPTZ,
    PRIMARY KEY (kind, key_hash)
);

CREATE INDEX IF NOT EXISTS idx_ai_cache_created ON ai_cache(created_at);
