-- Migration 011: a source-backed note that does not match its source.
--
-- REJECTED is not a crash. Ingestion finishes normally and stores why the
-- note was refused, so the editor can show an "incorrect note" popup
-- instead of the generic processing-failed state.
--
-- Idempotent: safe to re-run.

ALTER TYPE note_status ADD VALUE IF NOT EXISTS 'REJECTED';

ALTER TABLE notes ADD COLUMN IF NOT EXISTS source_match REAL;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS ingestion_rejection TEXT;
