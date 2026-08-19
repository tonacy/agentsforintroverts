PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS events (
  canonical_event_id TEXT PRIMARY KEY NOT NULL,
  canonical_run_id TEXT NOT NULL,
  canonical_feed_id TEXT,
  schema_version TEXT NOT NULL CHECK (schema_version = 'afi.event.v1'),
  connection_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  agent_key TEXT NOT NULL,
  external_event_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence >= 1),
  kind TEXT NOT NULL,
  received_at TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  UNIQUE (connection_id, external_event_id),
  UNIQUE (connection_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS events_run_order
  ON events (canonical_run_id, sequence, occurred_at, canonical_event_id);

CREATE INDEX IF NOT EXISTS events_feed_order
  ON events (kind, occurred_at DESC, canonical_event_id);

CREATE INDEX IF NOT EXISTS events_agent_order
  ON events (agent_key, occurred_at DESC, canonical_event_id);

CREATE TABLE IF NOT EXISTS ingest_nonces (
  key_id TEXT NOT NULL,
  nonce TEXT NOT NULL,
  expires_at_ms INTEGER NOT NULL,
  created_at_ms INTEGER NOT NULL,
  PRIMARY KEY (key_id, nonce)
);

CREATE INDEX IF NOT EXISTS ingest_nonces_expiry
  ON ingest_nonces (expires_at_ms);

CREATE TRIGGER IF NOT EXISTS events_are_append_only_update
BEFORE UPDATE ON events
BEGIN
  SELECT RAISE(ABORT, 'events are append-only');
END;

CREATE TRIGGER IF NOT EXISTS events_are_append_only_delete
BEFORE DELETE ON events
BEGIN
  SELECT RAISE(ABORT, 'events are append-only');
END;
