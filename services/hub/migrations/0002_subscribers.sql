-- The mailing list deliberately lives outside the append-only `events` table.
-- Subscribers must be updatable and deletable: a person who asks to be removed
-- has to actually disappear. No append-only triggers belong on these tables.

CREATE TABLE IF NOT EXISTS subscribers (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL,
  ip_hash TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  unsubscribed_at TEXT
);

CREATE INDEX IF NOT EXISTS subscribers_created_at
  ON subscribers (created_at DESC, id);

CREATE INDEX IF NOT EXISTS subscribers_active
  ON subscribers (unsubscribed_at, created_at DESC);

-- Fixed-window counters for the unauthenticated subscribe endpoint. Rows are
-- keyed by a salted hash of the client IP; the raw address is never stored.
CREATE TABLE IF NOT EXISTS subscribe_rate_limits (
  ip_hash TEXT PRIMARY KEY NOT NULL,
  window_start_ms INTEGER NOT NULL,
  attempts INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS subscribe_rate_limits_window
  ON subscribe_rate_limits (window_start_ms);
