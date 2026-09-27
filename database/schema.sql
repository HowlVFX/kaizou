-- Extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Enums
CREATE TYPE note_status AS ENUM ('PENDING', 'READY', 'FAILED');
CREATE TYPE concept_track AS ENUM ('SOURCE_BACKED', 'SELF_AUTHORED', 'ANALOGY');
CREATE TYPE concept_shape AS ENUM ('PROCEDURAL', 'DEFINITION', 'ORDERED_PROCESS', 'CAUSAL_RELATION');
CREATE TYPE concept_category AS ENUM ('DETERMINISTIC_MECHANISM', 'CONVENTIONAL', 'PROBABILISTIC', 'AXIOMATIC', 'OUT_OF_SCOPE');
CREATE TYPE concept_status AS ENUM ('UNRESOLVED_PREREQUISITE', 'VERIFIED_CONCEPT');
CREATE TYPE solo_level AS ENUM ('Prestructural', 'Unistructural', 'Multistructural', 'Relational', 'Extended_Abstract');
CREATE TYPE edge_type AS ENUM ('WIKILINK', 'SEMANTIC', 'REQUIRES', 'ANALOGY_OF', 'EXPLAINED_BY');
CREATE TYPE edge_flag AS ENUM ('CYCLE_CONFLICT', 'MERGE_CANDIDATE');
CREATE TYPE source_trust_tier AS ENUM ('PEER_REVIEWED', 'INSTITUTIONAL', 'GENERAL', 'SELF_AUTHORED');
CREATE TYPE template_tier AS ENUM ('SOURCE_GROUNDED', 'GENERATED');
CREATE TYPE template_confidence AS ENUM ('stable', 'unstable');
CREATE TYPE probe_type AS ENUM ('CLOZE', 'RECALL', 'PROCESS_TRACE', 'PROCEDURAL', 'MISCONCEPTION_MCQ', 'CONCEPT_SORT', 'PERTURBATION', 'NEAR_TRANSFER', 'FAR_TRANSFER', 'ANALOGY_FORWARD', 'ANALOGY_SIMULATE', 'ANALOGY_BREAKDOWN');
CREATE TYPE grading_band AS ENUM ('Full', 'Shallow', 'Incomplete', 'Not_Yet_Engaged');
CREATE TYPE lineage_event AS ENUM ('SAME', 'EVOLVED', 'MERGED', 'SPLIT', 'NEW', 'DISSOLVED');
CREATE TYPE cluster_status AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE job_status AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');
CREATE TYPE learner_role AS ENUM ('learner', 'admin');
CREATE TYPE capability_event_type AS ENUM ('SOLO_ADVANCE', 'PERTURBATION_PASS', 'TRANSFER_PASS', 'MASTERY');
CREATE TYPE review_mode AS ENUM ('Understand', 'Abstract');
CREATE TYPE decay_sensitivity AS ENUM ('Low', 'Standard', 'High');
CREATE TYPE admin_role AS ENUM ('owner', 'moderator');
CREATE TYPE note_type AS ENUM ('SOURCE_BACKED', 'USER_DEFINED', 'ANALOGY');
CREATE TYPE note_source_kind AS ENUM ('link', 'file', 'paste');

-- Tables

CREATE TABLE learners (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name VARCHAR(100),
    preferred_language VARCHAR(10) DEFAULT 'en',
    portal_optin BOOLEAN DEFAULT false,
    -- Learning preferences (migration 005). decay_sensitivity feeds the memory scheduler.
    daily_goal INTEGER NOT NULL DEFAULT 10,
    review_mode review_mode NOT NULL DEFAULT 'Understand',
    decay_sensitivity decay_sensitivity NOT NULL DEFAULT 'Standard',
    solo_notifications BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Admins are a separate identity domain from learners (own credentials, own
-- tokens signed with a separate secret). Two tiers: owner (protected) and
-- moderator. No admin signup route — provisioned by an operator/owner.
CREATE TABLE admins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name VARCHAR(100),
    admin_role admin_role NOT NULL DEFAULT 'moderator',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMPTZ
);

CREATE TABLE admin_refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID REFERENCES admins(id) ON DELETE CASCADE NOT NULL,
    token TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL
);

-- Invite-only signup: only emails here may create a learner account.
CREATE TABLE signup_allowlist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    added_by UUID REFERENCES admins(id) ON DELETE SET NULL,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    used_at TIMESTAMPTZ
);

CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    learner_id UUID REFERENCES learners(id) ON DELETE CASCADE,
    token TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    learner_id UUID REFERENCES learners(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    body_md TEXT NOT NULL DEFAULT '',
    markdown_hash TEXT,
    language VARCHAR(10) DEFAULT 'en',
    ingestion_status note_status DEFAULT 'PENDING',
    note_type note_type NOT NULL DEFAULT 'SOURCE_BACKED',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Concept versioning design decision: Immutable versions for claims and templates.
-- Allows consistent state references for memory scheduling even as the underlying concept evolves.
CREATE TABLE concepts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    learner_id UUID REFERENCES learners(id) ON DELETE CASCADE NOT NULL,
    canonical_label TEXT NOT NULL,
    label_embedding vector(1536),
    track concept_track NOT NULL,
    shape concept_shape NOT NULL,
    category concept_category NOT NULL,
    status concept_status DEFAULT 'VERIFIED_CONCEPT',
    version INTEGER DEFAULT 1 NOT NULL,
    c_struct REAL,
    c_bloom REAL,
    c_0 REAL,
    c_current REAL,
    n_req INTEGER,
    solo_level solo_level DEFAULT 'Prestructural',
    probe_eligible BOOLEAN DEFAULT true,
    source_trust_tier source_trust_tier,
    -- "Go deeper" (migration 008): level band, the step generated from this
    -- concept, bedrock flag, and the teaser shown on an explanation node.
    level_band TEXT,
    deeper_question TEXT,
    deeper_primer TEXT,
    simplification_note TEXT,
    deeper_version INTEGER,
    is_bedrock BOOLEAN NOT NULL DEFAULT false,
    bedrock_reason TEXT,
    teaser TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Added after concepts exists (FKs to concepts).
ALTER TABLE notes ADD COLUMN analogy_target_concept_id UUID REFERENCES concepts(id) ON DELETE SET NULL;
ALTER TABLE notes ADD COLUMN target_concept_id UUID REFERENCES concepts(id) ON DELETE SET NULL;

-- Sources attached to a note. Stored separately; never merged into body_md.
CREATE TABLE note_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    note_id UUID REFERENCES notes(id) ON DELETE CASCADE NOT NULL,
    kind note_source_kind NOT NULL,
    title TEXT,
    url TEXT,
    content_text TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_note_sources_note ON note_sources(note_id);

-- Analogy about a topic with no note yet (migration 009): resolved by ingestion.
ALTER TABLE notes ADD COLUMN analogy_target_label TEXT;

-- Replaced versions of a note (notes change only via "Update note").
CREATE TABLE note_revisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    note_id UUID REFERENCES notes(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    body_md TEXT NOT NULL,
    written_at TIMESTAMPTZ,
    replaced_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_note_revisions_note ON note_revisions(note_id, replaced_at);

CREATE TABLE note_concepts (
    note_id UUID REFERENCES notes(id) ON DELETE CASCADE,
    concept_id UUID REFERENCES concepts(id) ON DELETE CASCADE,
    PRIMARY KEY (note_id, concept_id)
);

CREATE TABLE claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    concept_id UUID REFERENCES concepts(id) ON DELETE CASCADE NOT NULL,
    concept_version INTEGER NOT NULL,
    text TEXT NOT NULL,
    embedding vector(1536),
    order_index INTEGER,
    is_transition BOOLEAN DEFAULT false,
    is_load_bearing BOOLEAN DEFAULT false,
    branch_id TEXT,
    weight REAL DEFAULT 1.0 NOT NULL,
    aliases TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE edges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    learner_id UUID REFERENCES learners(id) ON DELETE CASCADE NOT NULL,
    source_id UUID REFERENCES concepts(id) ON DELETE CASCADE NOT NULL,
    target_id UUID REFERENCES concepts(id) ON DELETE CASCADE NOT NULL,
    type edge_type NOT NULL,
    weight REAL DEFAULT 1.0,
    confidence REAL,
    flag edge_flag,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(source_id, target_id, type)
);

CREATE TABLE sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    concept_id UUID REFERENCES concepts(id) ON DELETE CASCADE NOT NULL,
    url TEXT NOT NULL,
    domain TEXT NOT NULL,
    trust_tier source_trust_tier NOT NULL,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    content_sha256 TEXT NOT NULL,
    content_text TEXT NOT NULL,
    robots_ok BOOLEAN DEFAULT true
);

CREATE TABLE validations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    note_id UUID REFERENCES notes(id) ON DELETE CASCADE NOT NULL,
    source_id UUID REFERENCES sources(id) ON DELETE CASCADE NOT NULL,
    source_coverage REAL NOT NULL,
    contradiction_count INTEGER NOT NULL DEFAULT 0,
    flagged_pairs JSONB DEFAULT '[]',
    computed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE process_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    concept_id UUID REFERENCES concepts(id) ON DELETE CASCADE NOT NULL,
    concept_version INTEGER NOT NULL,
    tier template_tier NOT NULL,
    confidence template_confidence NOT NULL DEFAULT 'unstable',
    disputed_count INTEGER DEFAULT 0,
    order_tau REAL,
    structure JSONB NOT NULL,
    deltas JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(concept_id, concept_version)
);

CREATE TABLE memory_states (
    concept_id UUID REFERENCES concepts(id) ON DELETE CASCADE NOT NULL,
    learner_id UUID REFERENCES learners(id) ON DELETE CASCADE NOT NULL,
    half_life REAL NOT NULL DEFAULT 1.0,
    last_reviewed TIMESTAMPTZ,
    streak INTEGER DEFAULT 0,
    attempts INTEGER DEFAULT 0,
    passes INTEGER DEFAULT 0,
    decay_exempt BOOLEAN DEFAULT false,
    mastered_at TIMESTAMPTZ,
    stagnation_clock INTEGER DEFAULT 0,
    PRIMARY KEY (concept_id, learner_id)
);

CREATE TABLE probes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    concept_id UUID REFERENCES concepts(id) ON DELETE CASCADE NOT NULL,
    concept_version INTEGER NOT NULL,
    type probe_type NOT NULL,
    prompt_text TEXT NOT NULL,
    answer_key_snapshot JSONB NOT NULL,
    payload JSONB DEFAULT '{}',
    retries INTEGER DEFAULT 0,
    leaked BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    learner_id UUID REFERENCES learners(id) ON DELETE CASCADE NOT NULL,
    probe_id UUID REFERENCES probes(id) ON DELETE CASCADE NOT NULL,
    concept_id UUID REFERENCES concepts(id) ON DELETE CASCADE NOT NULL,
    concept_version INTEGER NOT NULL,
    answer_text TEXT,
    answer_payload JSONB,
    confidence_pre REAL,
    coverage REAL,
    ordering REAL,
    precision_score REAL,
    verbatim REAL,
    branch_leakage REAL,
    delta_score REAL,
    ari_mechanism REAL,
    ari_surface REAL,
    principle_ratio REAL,
    composite_score REAL NOT NULL,
    band grading_band NOT NULL,
    predicted_recall REAL,
    passed BOOLEAN NOT NULL,
    gap_report JSONB DEFAULT '{}',
    submitted_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE misconception_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    learner_id UUID REFERENCES learners(id) ON DELETE CASCADE NOT NULL,
    concept_id UUID REFERENCES concepts(id) ON DELETE CASCADE NOT NULL,
    attempt_id UUID REFERENCES attempts(id) ON DELETE CASCADE NOT NULL,
    tag TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Human expert band for a graded attempt (ground truth for Cohen's kappa,
-- §5.25.1). Separate from attempts so labelling is an explicit admin action.
CREATE TABLE attempt_gold_labels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attempt_id UUID REFERENCES attempts(id) ON DELETE CASCADE NOT NULL,
    human_band grading_band NOT NULL,
    rater TEXT NOT NULL,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (attempt_id, rater)
);

-- Append-only log of demonstrated capabilities (SOLO advances, passed
-- transfer/perturbation probes, mastery) so Insights can show a timeline.
CREATE TABLE capability_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    learner_id UUID REFERENCES learners(id) ON DELETE CASCADE NOT NULL,
    concept_id UUID REFERENCES concepts(id) ON DELETE CASCADE NOT NULL,
    attempt_id UUID REFERENCES attempts(id) ON DELETE SET NULL,
    event_type capability_event_type NOT NULL,
    detail JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE clusters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    learner_id UUID REFERENCES learners(id) ON DELETE CASCADE NOT NULL,
    parent_cluster_id UUID REFERENCES clusters(id),
    label TEXT NOT NULL,
    modularity REAL,
    member_count INTEGER DEFAULT 0,
    resolution REAL DEFAULT 1.0,
    status cluster_status DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    last_named_at TIMESTAMPTZ
);

CREATE TABLE cluster_members (
    cluster_id UUID REFERENCES clusters(id) ON DELETE CASCADE NOT NULL,
    concept_id UUID REFERENCES concepts(id) ON DELETE CASCADE NOT NULL,
    computed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (cluster_id, concept_id)
);

CREATE TABLE cluster_lineage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    learner_id UUID REFERENCES learners(id) ON DELETE CASCADE NOT NULL,
    cluster_id UUID REFERENCES clusters(id) ON DELETE CASCADE NOT NULL,
    parent_cluster_ids UUID[] DEFAULT '{}',
    event lineage_event NOT NULL,
    jaccard REAL,
    run_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_type TEXT NOT NULL,
    payload JSONB DEFAULT '{}',
    status job_status DEFAULT 'PENDING',
    run_after TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    locked_by TEXT,
    locked_at TIMESTAMPTZ,
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    last_error TEXT,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Privacy boundary design decision: Strict anonymization in portal_aggregates
-- No free-text columns are allowed in this table (privacy constraint D-10) to prevent leaking PII.
CREATE TABLE portal_aggregates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_key TEXT NOT NULL,
    cohort_key TEXT DEFAULT 'all',
    window_start TIMESTAMPTZ,
    window_end TIMESTAMPTZ,
    value REAL NOT NULL,
    sample_size INTEGER NOT NULL,
    suppressed BOOLEAN DEFAULT false,
    dimensions JSONB DEFAULT '{}',
    computed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Indexes

-- Exact k-NN rationale:
-- Explicitly avoiding HNSW or IVFFLAT indexes on vector columns to enforce exact k-NN searches.
-- In our domain, precision is more important than lookup speed on high-dimensional vectors,
-- as approximate matches can lead to incorrect memory clustering.

CREATE INDEX idx_notes_learner ON notes(learner_id);
CREATE INDEX idx_concepts_learner_status ON concepts(learner_id, status);
CREATE INDEX idx_claims_concept_version ON claims(concept_id, concept_version);
CREATE INDEX idx_edges_learner_type ON edges(learner_id, type);
CREATE INDEX idx_edges_source ON edges(source_id);
CREATE INDEX idx_edges_target ON edges(target_id);
CREATE INDEX idx_attempts_learner_concept ON attempts(learner_id, concept_id, submitted_at);
CREATE INDEX idx_memory_states_last_reviewed ON memory_states(last_reviewed);
CREATE INDEX idx_jobs_status_run_after ON jobs(status, run_after) WHERE status = 'PENDING';
CREATE INDEX idx_clusters_learner ON clusters(learner_id);
CREATE INDEX idx_misconception_events_learner ON misconception_events(learner_id, concept_id);
CREATE INDEX idx_attempt_gold_labels_attempt ON attempt_gold_labels(attempt_id);
CREATE INDEX idx_capability_events_learner ON capability_events(learner_id, created_at);
CREATE INDEX idx_portal_aggregates_key ON portal_aggregates(metric_key, computed_at);

-- ---------------------------------------------------------------------------
-- AI provider spend ledger and reuse cache (migration 002).
-- 🔒 No free-text note/answer/prompt content stored here (D-10-aligned).
-- ---------------------------------------------------------------------------

CREATE TABLE provider_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    task TEXT NOT NULL,
    input_tokens INTEGER,
    output_tokens INTEGER,
    tokens_estimated BOOLEAN NOT NULL DEFAULT false,
    est_cost_inr REAL NOT NULL DEFAULT 0,
    reserved BOOLEAN NOT NULL DEFAULT false,
    success BOOLEAN NOT NULL DEFAULT true,
    retry_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_provider_usage_created ON provider_usage(created_at);
CREATE INDEX idx_provider_usage_task ON provider_usage(task, created_at);

CREATE TABLE ai_cache (
    kind TEXT NOT NULL,
    key_hash TEXT NOT NULL,
    model TEXT NOT NULL,
    value_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    hits INTEGER NOT NULL DEFAULT 0,
    last_used_at TIMESTAMPTZ,
    PRIMARY KEY (kind, key_hash)
);

CREATE INDEX idx_ai_cache_created ON ai_cache(created_at);
