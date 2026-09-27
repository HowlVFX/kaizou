-- Migration 009: standalone analogy topics + note revisions.
--
-- notes.analogy_target_label: an ANALOGY note may be about a topic the
-- learner has no note for yet. Ingestion resolves the label to an existing
-- concept or creates a locked placeholder for it, then sets
-- analogy_target_concept_id.
--
-- note_revisions: notes are read-only once created and change only through
-- an explicit "Update note" submit. The text being replaced is kept here, so
-- the original (first) version of a note can always be viewed.
--
-- Idempotent: safe to re-run.

ALTER TABLE notes ADD COLUMN IF NOT EXISTS analogy_target_label TEXT;

CREATE TABLE IF NOT EXISTS note_revisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    note_id UUID REFERENCES notes(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    body_md TEXT NOT NULL,
    written_at TIMESTAMPTZ,                      -- when this text was written
    replaced_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_note_revisions_note ON note_revisions(note_id, replaced_at);
