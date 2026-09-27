-- Migration 003 — FULL SCHEMA RESET to the UUID design.
--
-- ⚠ DESTRUCTIVE: drops the legacy integer-key learners/notes/refresh_tokens
-- and all their data (existing users are intentionally cleared, per an
-- explicit decision), then rebuilds the complete 19-table UUID schema plus
-- the provider_usage / ai_cache tables from migration 002.
--
-- After this, learners.id is UUID, notes uses body_md + ingestion_status,
-- and every learner_id foreign key is UUID. Express JWT/OAuth keep working
-- because the token payload id is an opaque value (now a UUID string).
--
-- Safe to re-run: everything is guarded with IF EXISTS / dropped-then-created.

BEGIN;

-- 1. Drop everything this schema owns (order doesn't matter with CASCADE).
DROP TABLE IF EXISTS
    provider_usage, ai_cache,
    portal_aggregates, jobs,
    cluster_lineage, cluster_members, clusters,
    misconception_events, attempts, probes, memory_states,
    process_templates, validations, sources, edges,
    claims, note_concepts, concepts,
    notes, refresh_tokens, learners
    CASCADE;

DROP TYPE IF EXISTS
    note_status, concept_track, concept_shape, concept_category,
    concept_status, solo_level, edge_type, edge_flag, source_trust_tier,
    template_tier, template_confidence, probe_type, grading_band,
    lineage_event, cluster_status, job_status, learner_role
    CASCADE;

-- Legacy SERIAL sequences from the old integer-key tables.
DROP SEQUENCE IF EXISTS learners_id_seq, refresh_tokens_id_seq CASCADE;

COMMIT;

-- 2. Rebuild. The complete current schema is applied from database/schema.sql
--    by the migration runner immediately after this file (see apply script).
--    Keeping the DDL in one canonical place (schema.sql) avoids drift.
