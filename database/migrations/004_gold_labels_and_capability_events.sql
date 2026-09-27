-- Migration 004: grading gold-labels + capability/SOLO event log.
--
-- Two additions that unblock previously-stubbed features:
--
-- 1. attempt_gold_labels — a human expert's band for a graded attempt, the
--    ground truth Cohen's kappa (§5.25.1) compares the machine grade against.
--    Kept in a separate table (not a column on attempts) so labelling is an
--    explicit, auditable admin action and most attempts stay unlabelled.
--
-- 2. capability_events — an append-only log of SOLO-level advances and passed
--    transfer/perturbation probes, so Insights can show WHEN a capability was
--    earned (SOLO changes are otherwise in-place UPDATEs with no history).
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS attempt_gold_labels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attempt_id UUID REFERENCES attempts(id) ON DELETE CASCADE NOT NULL,
    -- The human expert's four-band judgement (same enum as attempts.band).
    human_band grading_band NOT NULL,
    -- Free-text rater id (an admin email/handle); no FK so raters need not be learners.
    rater TEXT NOT NULL,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- One gold label per (attempt, rater); re-labelling updates in place.
    UNIQUE (attempt_id, rater)
);

CREATE INDEX IF NOT EXISTS idx_attempt_gold_labels_attempt ON attempt_gold_labels(attempt_id);

-- capability_event_type: what kind of capability was demonstrated.
DO $$ BEGIN
    CREATE TYPE capability_event_type AS ENUM (
        'SOLO_ADVANCE', 'PERTURBATION_PASS', 'TRANSFER_PASS', 'MASTERY'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS capability_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    learner_id UUID REFERENCES learners(id) ON DELETE CASCADE NOT NULL,
    concept_id UUID REFERENCES concepts(id) ON DELETE CASCADE NOT NULL,
    attempt_id UUID REFERENCES attempts(id) ON DELETE SET NULL,
    event_type capability_event_type NOT NULL,
    -- e.g. SOLO_ADVANCE: {"from":"Multistructural","to":"Relational"};
    --      TRANSFER_PASS: {"probe_type":"FAR_TRANSFER","score":0.88}.
    detail JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_capability_events_learner ON capability_events(learner_id, created_at);
