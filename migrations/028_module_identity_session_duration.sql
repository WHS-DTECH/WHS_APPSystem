ALTER TABLE module_identity_grants
  ALTER COLUMN expires_at SET DEFAULT NOW() + INTERVAL '8 hours';
