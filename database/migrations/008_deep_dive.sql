-- Migration 008: "Go deeper" (the why-ladder towards bedrock truths).
--
-- A deep-dive step on concept P asks one enticing "why" question, shows a
-- short primer at the learner's level, and creates the explanations as
-- locked (UNRESOLVED_PREREQUISITE) nodes E1..En, each with a teaser:
--
--     P  --EXPLAINED_BY-->  E_i        (source = shallower, target = deeper)
--
-- EXPLAINED_BY is NOT a prerequisite: REQUIRES means "needed to follow this
-- note" and stays at or below the note's level; EXPLAINED_BY is "the reason
-- underneath" and may sit one level band higher. Nothing is generated until
-- the learner asks, and the learner decides at every step whether to go on.
--
-- A concept whose deeper explanation has been learnt (any EXPLAINED_BY
-- target VERIFIED) is shown as "upgraded"; its note may optionally be updated.
-- Primer and teasers are never part of a note: never extracted, never tested.
--
-- Idempotent: safe to re-run.

ALTER TYPE edge_type ADD VALUE IF NOT EXISTS 'EXPLAINED_BY';

-- Level band the concept is pitched at: young_child | school | university | expert
ALTER TABLE concepts ADD COLUMN IF NOT EXISTS level_band TEXT;
-- The step generated FROM this concept (question + primer), if any.
ALTER TABLE concepts ADD COLUMN IF NOT EXISTS deeper_question TEXT;
ALTER TABLE concepts ADD COLUMN IF NOT EXISTS deeper_primer TEXT;
-- Set when going deeper shows the learner's statement is a simplification.
ALTER TABLE concepts ADD COLUMN IF NOT EXISTS simplification_note TEXT;
-- Concept version the step was generated for (a re-written note regenerates).
ALTER TABLE concepts ADD COLUMN IF NOT EXISTS deeper_version INTEGER;
-- Bedrock: nothing deeper (axiom, definition, fundamental law, observed fact).
ALTER TABLE concepts ADD COLUMN IF NOT EXISTS is_bedrock BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE concepts ADD COLUMN IF NOT EXISTS bedrock_reason TEXT;
-- On an explanation node: a one-line teaser of what it explains.
ALTER TABLE concepts ADD COLUMN IF NOT EXISTS teaser TEXT;
