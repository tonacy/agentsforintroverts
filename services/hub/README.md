# Quiet Hub

Quiet Hub is a provider-neutral, append-only ingest service for `afi.event.v1` events. Codex, Grok, or another adapter can publish the same signed envelope; read clients consume deterministic run, feed, and source projections without receiving execution authority.

## HTTP surface

| Method | Path | Authentication | Purpose |
| --- | --- | --- | --- |
| `GET` | `/health` | Public | Process and storage health |
| `POST` | `/v1/events` | HMAC | Append one event |
| `POST` | `/v1/subscribe` | Public, origin-gated | Add one address to the mailing list |
| `GET` | `/v1/feed` | Bearer | Projected feed with filters |
| `GET` | `/v1/feed/:id` | Bearer | One projected feed item |
| `GET` | `/v1/runs/:id` | Bearer | One deterministic run projection |
| `GET` | `/v1/sources` | Bearer | Canonical source projections |
| `GET` | `/v1/sources/:id` | Bearer | One canonical source projection |

Feed filters are `agent_key`, `lane` (or `kind`), `provider`, `run_id`, `status`, `q`, `since`/`after`, `until`/`before`, and `limit`. Source filters are `kind`, `provider`, `run_id`, `q`, and `limit`. Limits range from 1 to 100.

All read endpoints other than health require:

```text
Authorization: Bearer <READ_TOKEN>
```

## Signed ingest contract

Send `Content-Type: application/json` and these headers:

```text
X-AFI-Key-Id: <producer connection_id>
X-AFI-Timestamp: <Unix epoch seconds; milliseconds also accepted>
X-AFI-Nonce: <a unique nonce>
X-AFI-Signature: <lowercase HMAC-SHA256 hex; sha256=<hex> is also accepted>
```

The exact signature input bytes are:

```text
UTF8(timestamp + "\n" + nonce + "\n") || raw_request_body
```

The nonce must be 16–160 characters matching `[A-Za-z0-9._:-]`.

The default replay window is 300 seconds and the default body limit is 262,144 bytes. A nonce can be claimed only once per key inside that window. `producer.connection_id` must equal `X-AFI-Key-Id`.

Successful writes return `202 Accepted` with the canonical event/run/feed IDs and `duplicate: true|false`. A repeated idempotency key returns the original IDs; conflicting reuse returns `409`.

`source_item_id` is supplied by the bridge as the canonical AFI ID and is preserved. `external_id` remains the provider's native identifier. Feed claims and action proposals cite `SourceReference.source_item_id`, and all references must resolve to the event's top-level embedded sources. Source URLs are optional and, when present, must use HTTP or HTTPS.

Provider-signed events may propose actions, but they cannot approve or execute them. Canonical action proposals require the exact `afi.action_proposal.v1` shape, an agent actor bound to the event run, and `payload_hash = sha256(canonical_json(payload))`. Source text and metadata are always treated as untrusted evidence. Unknown non-authority event kinds are retained as audit records and ignored by the current projectors. In particular, legacy `feed.proposed` events never synthesize feed items; only canonical `feed.item.published`, `feed.item.updated`, and `feed.item.withdrawn` events affect the feed.

## Mailing list

`POST /v1/subscribe` is the one deliberately unauthenticated write. A browser cannot hold an HMAC secret, and a marketing signup is not an agent event, so the endpoint has its own table and its own rules:

```http
POST /v1/subscribe
Origin: https://agentsforintroverts.com
Content-Type: application/json

{"email": "reader@example.test", "source": "site"}
```

- The address is trimmed, lowercased, and validated on the server. `source` is an optional `[a-z0-9._-]` label, defaulting to `site`.
- The response is always `202 {"subscribed": true}`. A repeat address is idempotent: it never returns a conflict, and the body never reveals whether the address was already stored.
- `Origin` must appear in `SUBSCRIBE_ALLOWED_ORIGINS` (a comma-separated allowlist). A request with no `Origin` — curl, a server-side client — is accepted but receives no CORS headers. `OPTIONS` answers the preflight for allowlisted origins only.
- Requests are rate limited per client IP (`SUBSCRIBE_RATE_LIMIT_MAX` per `SUBSCRIBE_RATE_LIMIT_WINDOW_SECONDS`, default 5 per hour) and bounded by `SUBSCRIBE_MAX_BODY_BYTES` (default 4,096). Exceeding the limit returns `429` with `Retry-After`.
- The raw IP is never stored. `SUBSCRIBE_IP_SALT` (a secret) salts the SHA-256 digest kept on the subscriber and rate-limit rows.

Subscribers live in `subscribers`, created by `migrations/0002_subscribers.sql`, and carry no append-only triggers. Rows must stay updatable and deletable: someone who asks to be forgotten has to actually disappear. `unsubscribed_at` is sticky — a repeat signup touches `updated_at` and never silently resurrects an unsubscribe.

## Local verification

From this directory, with the repository dependencies installed:

```sh
npm run typecheck
npm test
```

For local Wrangler development, create an uncommitted `.dev.vars`:

```dotenv
INGEST_SECRETS_JSON={"connection-codex":"replace-with-a-long-random-secret"}
READ_TOKEN=replace-with-a-long-random-token
SUBSCRIBE_ALLOWED_ORIGINS=http://localhost:3000
SUBSCRIBE_IP_SALT=replace-with-a-long-random-salt
```

Then create and migrate D1, replace the placeholder `database_id` in `wrangler.jsonc`, and start the Worker:

```sh
npx wrangler d1 create agents-for-introverts-hub
npx wrangler d1 migrations apply agents-for-introverts-hub --local --config wrangler.jsonc
npx wrangler dev --config wrangler.jsonc
```

For a future remote environment, set `INGEST_SECRETS_JSON`, `READ_TOKEN`, and `SUBSCRIBE_IP_SALT` with `wrangler secret put`, set `SUBSCRIBE_ALLOWED_ORIGINS` to the public site origin, apply the migration with `--remote`, and only then deploy. Secrets do not belong in `wrangler.jsonc`.

## Storage model

`EventStore` is the only persistence boundary for the log, and `SubscriberStore` the only one for the mailing list; both stores implement both. `MemoryEventStore` supports deterministic tests; `D1EventStore` uses the migrations in `migrations/`. D1 enforces unique connection-scoped event/idempotency keys, stores the full event JSON, and blocks updates or deletes from the event log. Feed, source, and run state are rebuilt deterministically from that log, so late events do not depend on arrival order.
