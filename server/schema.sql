CREATE TABLE IF NOT EXISTS secret_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  ciphertext text NOT NULL,
  iv text NOT NULL,
  salt text NOT NULL,
  ip_address inet,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  expired boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_secret_messages_expires_at ON secret_messages(expires_at);
-- Access is through our server API; do not expose rows through the public Data API.
ALTER TABLE secret_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE secret_messages ADD COLUMN IF NOT EXISTS burn_after_read boolean NOT NULL DEFAULT false;
ALTER TABLE secret_messages ADD COLUMN IF NOT EXISTS burn_token_hash text;
ALTER TABLE secret_messages ADD COLUMN IF NOT EXISTS delete_token_hash text;
ALTER TABLE secret_messages ADD COLUMN IF NOT EXISTS view_count integer NOT NULL DEFAULT 0;
