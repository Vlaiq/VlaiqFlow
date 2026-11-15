CREATE TABLE IF NOT EXISTS flow_accounts (
  issuer text NOT NULL,
  subject text NOT NULL,
  profile jsonb NOT NULL,
  avatar_version uuid,
  avatar_bytes bytea,
  wallet jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (issuer, subject),
  CHECK (octet_length(avatar_bytes) <= 1048576)
);
CREATE TABLE IF NOT EXISTS flow_team (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  presentation jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- No email-based identity linking; no user-editable role/coin columns.
