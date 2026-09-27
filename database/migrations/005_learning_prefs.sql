-- Migration 005: persist learner learning preferences on the learners row.
--
-- These were previously frontend-only React state that reset on reload.
-- Now stored so they survive sessions AND so the FastAPI memory scheduler can
-- honour decay_sensitivity when computing half-life.
--
--   daily_goal          concepts to review per day (UI target only)
--   review_mode         default Retest mode: 'Understand' | 'Abstract'
--   decay_sensitivity   'Low' | 'Standard' | 'High' — scales half-life:
--                         Low  = slower forgetting (longer half-life)
--                         High = faster forgetting (shorter half-life)
--   solo_notifications  UI toggle for SOLO-change alerts
--
-- Idempotent: safe to re-run.

DO $$ BEGIN
    CREATE TYPE review_mode AS ENUM ('Understand', 'Abstract');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE decay_sensitivity AS ENUM ('Low', 'Standard', 'High');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE learners
    ADD COLUMN IF NOT EXISTS daily_goal INTEGER NOT NULL DEFAULT 10,
    ADD COLUMN IF NOT EXISTS review_mode review_mode NOT NULL DEFAULT 'Understand',
    ADD COLUMN IF NOT EXISTS decay_sensitivity decay_sensitivity NOT NULL DEFAULT 'Standard',
    ADD COLUMN IF NOT EXISTS solo_notifications BOOLEAN NOT NULL DEFAULT true;
