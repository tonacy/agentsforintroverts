# Quiet Desk MVP threat model

## Protected assets

- private source metadata and any opted-in excerpts;
- provider connector credentials and hub signing keys;
- user attention and trust in the Slow Feed;
- user authority over external communications, calendars, invitations, and posts;
- append-only provenance, approval, and execution evidence.

## Principal threats and controls

| Threat | MVP control | Remaining work |
|---|---|---|
| Prompt injection inside email/chat/calendar content | Base prompt labels source content untrusted; source text is data only; bridge exposes bounded primitives | Add adversarial connector evals before live scopes |
| Forged provider events | Per-connection HMAC over timestamp, nonce, and exact body; key ID must match producer connection | Store/rotate secrets in deployment secret manager |
| Replay or duplicate delivery | Timestamp window, nonce store, idempotency key, append-only event IDs | Size retention for production traffic |
| Out-of-order provider events | Deterministic projection by run sequence and revision | Add dead-letter/inspection UI for irreconcilable gaps |
| Provider self-approves or claims execution | Provider keys cannot emit approval decisions or trusted execution receipts; MCP has no approve/execute tools | Build a separately authenticated user/executor boundary |
| Proposal changes after approval | Approval binds action ID, revision, expiration, and canonical payload hash | Add exact visual diff and one-shot execution receipt |
| Secret leakage through MCP output | Tools return canonical data only; no secrets in structured results; separate read/write credentials | Add automated secret scanning in CI |
| Public MCP exposure | Bearer auth, request cap, in-process rate limit, host allowlist, TLS required by deployment | Replace single bearer token with OAuth for multi-user use; edge rate limits |
| Cross-user data access | MVP carries an explicit single user ID | Tenant isolation and authorization tests required before multi-user use |
| Sensitive raw-body retention | Fixtures are synthetic; model favors hashes, minimized excerpts, and source doors | Define retention/deletion policy and connector-level opt-in |
| Unsafe source doors | Bridge, hub, and Mac client accept user-openable HTTP(S) links only; native navigation is explicit | Add connector-specific domain policy if desired |

## Explicit non-goals in this build

- sending email or chat messages;
- posting to social networks;
- creating, changing, or deleting calendar events;
- RSVPing, purchasing, deleting, or changing permissions;
- multi-user tenancy;
- production deployment or live connector authorization.

Adding any of these expands the threat model and requires a fresh review.
