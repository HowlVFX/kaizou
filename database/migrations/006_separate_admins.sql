-- Migration 006: separate admin identity domain + invite-only signup allowlist.
--
-- Admins are NOT learners-with-a-flag. They have their own table, their own
-- credentials (same email can exist as both a learner and an admin with
-- different passwords), their own refresh tokens, and (in code) tokens signed
-- with a SEPARATE secret + aud='admin'. There is no admin signup route; admins
-- are provisioned by an operator or by an existing owner from the portal.
--
-- Two admin tiers (admin_role):
--   owner      — highest; can manage admins and the allowlist. Protected:
--                nobody (not even another owner) may modify/demote/delete an
--                owner via the API (enforced in code). Seeded once here.
--   moderator  — can manage the signup allowlist and view the portal; cannot
--                touch owners or change admin roles.
--
-- Invite-only signup: a learner email may only sign up if it is on
-- signup_allowlist (managed by owner/moderator).
--
-- Idempotent: safe to re-run.

DO $$ BEGIN
    CREATE TYPE admin_role AS ENUM ('owner', 'moderator');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS admins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name VARCHAR(100),
    admin_role admin_role NOT NULL DEFAULT 'moderator',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS admin_refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID REFERENCES admins(id) ON DELETE CASCADE NOT NULL,
    token TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_refresh_tokens_admin ON admin_refresh_tokens(admin_id);

-- Invite-only signup allowlist. Only emails here may create a learner account.
CREATE TABLE IF NOT EXISTS signup_allowlist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,          -- stored lowercased
    added_by UUID REFERENCES admins(id) ON DELETE SET NULL,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    used_at TIMESTAMPTZ                          -- set when the email signs up
);

-- The learner `role` column is no longer an auth mechanism. Portal access is
-- determined solely by the admins table + admin tokens.
ALTER TABLE learners DROP COLUMN IF EXISTS role;
