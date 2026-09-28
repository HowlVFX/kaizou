-- Migration 010: the signup allowlist now gates the MANAGEMENT PORTAL, not
-- learner signup.
--
-- Before: only allowlisted emails could create a learner account.
-- After:  learner signup/login is open to any email; only allowlisted emails
--         can sign up for or log in to the management portal (owners exempt).
--
-- Backfill: existing moderator accounts are added to the allowlist so they
-- keep their portal access. Remove an entry to revoke that moderator.
--
-- Idempotent: safe to re-run.
INSERT INTO signup_allowlist (email, note, used_at)
SELECT LOWER(a.email), 'existing moderator (migration 010)', NOW()
FROM admins a
WHERE a.admin_role = 'moderator'
ON CONFLICT (email) DO NOTHING;

COMMENT ON TABLE signup_allowlist IS
    'Emails allowed to sign up for / log in to the management portal (owners exempt). Learner signup is open.';
