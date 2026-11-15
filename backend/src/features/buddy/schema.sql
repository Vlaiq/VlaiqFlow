-- Apply only after the reviewed Auth0 migration, through an explicit operator migration.
-- No new balance/currency: the existing flow_accounts.wallet is updated in the same transaction.
CREATE TABLE IF NOT EXISTS flow_buddy_progress (
  issuer text NOT NULL,
  subject text NOT NULL,
  state jsonb NOT NULL CHECK (jsonb_typeof(state) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (issuer, subject),
  FOREIGN KEY (issuer, subject) REFERENCES flow_accounts(issuer, subject) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS flow_buddy_receipts (
  issuer text NOT NULL,
  subject text NOT NULL,
  idempotency_key text NOT NULL CHECK (length(idempotency_key) <= 120),
  source text NOT NULL CHECK (source IN ('education', 'cosmetic')),
  coins integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (issuer, subject, idempotency_key),
  FOREIGN KEY (issuer, subject) REFERENCES flow_accounts(issuer, subject) ON DELETE CASCADE,
  CHECK ((source = 'education' AND coins = 5) OR (source = 'cosmetic' AND coins < 0 AND coins >= -1000))
);
