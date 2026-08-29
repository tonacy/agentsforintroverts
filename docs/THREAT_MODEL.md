# Quiet Desk MVP threat model

## Protected assets

- private source metadata and any opted-in excerpts;
- revisioned personal-context statements, their basis, and supporting evidence;
- relationship candidates and the reasoning used to surface them;
- provider connector credentials and hub signing keys;
- user attention and trust in human-thread matching;
- user authority over external communications, calendars, invitations, and posts;
- append-only provenance, approval, and execution evidence.
- authenticated social-feed state and current-day Computer History cues;
- the private local Quiet Desk archive and its deletion history.

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
| An ordinary agent claims a user identity at the low-level API | Interchangeable agents use the MCP bridge, where identity and roles are fixed by trusted process configuration; the direct API/CLI is documented as owner/admin access | Add a separately authenticated owner UI before distributing the low-level API beyond one trusted device |
| One agent role takes over another role's inferred record | The bridge binds an entity to its originating run role and requires current-record visibility before every revision | Add multi-user policy identities before sharing one workspace across people |
| A context budget returns a claim without its cited support | Purpose selection follows exact semantic/provenance edges and admits each parent plus dependencies as one atomic budget group | Add clustering-quality evals for live high-volume sources |
| A caller forges or rebinds a Context Pack during refresh | The canonical pack binds owner, run, role, immutable purpose, budget, exact requested refs, source selection, trace, and watermark; a workspace-key HMAC authenticates the whole pack | Rotate workspace keys through a separately tested migration path |
| Refresh silently substitutes a newer entity for an exact requested revision | Authenticated refresh rejects stale or deleted requested refs and requires a new explicit assembly | Add a user-facing diff for choosing replacement revisions |
| Sensitive raw-body retention | Raw browser/history material is ephemeral and excluded from source records and Hub; selected public sources are minimized and reviewed or deleted after 30 days | Enforce expiry and deletion automatically before live collectors |
| X silently returns to an engagement-ranked surface | A run must visibly verify Following before reading and after navigation; For You, Explore, trends, notifications, promoted content, and all writes are denied | Add a surface-state assertion and fail-closed browser eval before recurring runs |
| LinkedIn home-feed content is mistaken for an endorsed relationship | Only organic home-feed items and exact posts/comments are readable; profiles, relationship graphs, sponsored/recommended modules, DMs, and writes are denied | Add labeled-content and navigation-boundary evals before recurring runs |
| Authenticated observations leak into the shared Hub | Authenticated-feed and Computer History cues are exempt from `observe_source` and current Hub ingestion until selected content is publicly revalidated | Add evidence-class authorization in code before any private-data Hub design |
| Computer activity becomes a false autobiography | Computer History is limited to minimized current-day recall cues; only the person's confirmed, authorized words may persist | Add cue-expiry and confirmation-state enforcement in the local ledger writer |
| Obsidian plugin or overlapping sync leaks or corrupts private history | Obsidian is optional over the same portable archive; plugins default off and one reviewed sync system is required | Ship an activation checklist and conflict-recovery test before recommending vault sync |
| Hub outage or deletion destroys the only durable history | Target design keeps immutable one-event-per-file records locally; Hub is an optional eligible-event replica and SQLite is rebuildable | Implement offline replay and encrypted-backup recovery tests |
| Unsafe source doors | Bridge, hub, and Mac client accept user-openable HTTP(S) links only; native navigation is explicit | Add connector-specific domain policy if desired |
| Inference becomes a claimed user belief | Context records preserve explicit, observed, and inferred basis; the UI labels inference as needing confirmation | Add user-authored confirmation, correction, deletion, and revision history before live context |
| Recurrence is flattened into false consensus | Thread claims retain source evidence and inference labels; prompts require disagreement and uncertainty to survive grouping | Add clustering/disagreement evals before live social sources |
| Topical similarity becomes unsolicited targeting | A thread surfaces at most three people with evidence of shared intent and stops at an exact proposal | Add relationship-sensitive suppression and contact-policy controls before outreach |
| Personal context silently authorizes speech | Context is routing input only; MCP exposes proposal-only external actions and providers cannot approve | Preserve this boundary in any future context-write or executor service |

## Explicit non-goals in this build

- sending email or chat messages;
- posting to social networks;
- creating, changing, or deleting calendar events;
- RSVPing, purchasing, deleting, or changing permissions;
- multi-user tenancy;
- production deployment or live connector authorization.

Adding any of these expands the threat model and requires a fresh review.
