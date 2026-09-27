-- Migration 007: note types, analogy targets, locked-node targets, and
-- separately stored note sources.
--
-- note_type:
--   SOURCE_BACKED — the learner's own note, optionally supported by sources
--                   (links / files / pasted text) stored in note_sources.
--   USER_DEFINED  — the learner's own understanding with no source at all.
--   ANALOGY       — the note IS an analogy for another concept
--                   (analogy_target_concept_id) -> ANALOGY_OF edge.
--
-- target_concept_id: when a learner clicks "learn this concept" on a locked
-- (UNRESOLVED_PREREQUISITE) node, the new note carries that concept id so
-- ingestion promotes exactly that placeholder instead of creating a duplicate.
--
-- Sources are NEVER merged into notes.body_md. Extraction reads only the body.
--
-- Idempotent: safe to re-run.

DO $$ BEGIN
    CREATE TYPE note_type AS ENUM ('SOURCE_BACKED', 'USER_DEFINED', 'ANALOGY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE note_source_kind AS ENUM ('link', 'file', 'paste');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE notes ADD COLUMN IF NOT EXISTS note_type note_type NOT NULL DEFAULT 'SOURCE_BACKED';
ALTER TABLE notes ADD COLUMN IF NOT EXISTS analogy_target_concept_id UUID REFERENCES concepts(id) ON DELETE SET NULL;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS target_concept_id UUID REFERENCES concepts(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS note_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    note_id UUID REFERENCES notes(id) ON DELETE CASCADE NOT NULL,
    kind note_source_kind NOT NULL,
    title TEXT,
    url TEXT,
    content_text TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_note_sources_note ON note_sources(note_id);
