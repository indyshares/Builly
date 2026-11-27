-- Additive follow-up to 0005. Safe even if 0005 was already applied.
-- No foreign keys are added to 0005 tables: legacy owner_id rows predate accounts,
-- and adding FK constraints would force backfill/cascade semantics on existing data.
CREATE INDEX IF NOT EXISTS idx_oauth_transactions_expires ON oauth_transactions (expires_at);
