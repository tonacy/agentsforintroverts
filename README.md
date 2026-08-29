# Agents for Introverts

This repository now contains both the public brand site and the first private
product: **Quiet Desk**, a provider-neutral agent feed for calm, sourced review.

Codex and Grok can run the same seven roles through one bounded MCP tool surface.
Quiet Hub owns the append-only feed, run, and source projections. A separate
local-first Context Kernel owns portable personal context and assembles the same
bounded Context Pack for any harness. The native Mac app is the review surface;
providers are executors, never the system of record.

```text
Codex (local STDIO) ─┐
                     ├─ MCP bridge ─ signed afi.event.v1 ─ Quiet Hub ─ Slow Feed
Grok (remote HTTPS) ─┘                                      │
                                                           └─ source doors

any trusted harness ─ MCP / CLI ─ local Context Kernel ─ Markdown + JSON
                                           │
                                           └─ rebuildable SQLite index
```

## What is built

- `apps/quiet-desk/` — native SwiftUI Mac app with three calm destinations:
  Now, Activity, and Agents & Sources. Detail stays behind an on-demand
  inspector; the app currently ships with clearly synthetic fixtures and no
  provider-side execution code.
- `packages/protocol/` — provider-neutral TypeScript contracts, JSON Schema,
  deterministic projection helpers, canonical payload hashing, fixtures, and
  invariant tests.
- `services/context-kernel/` — encrypted local create-only context ledger,
  deterministic Markdown/JSON projections, bounded Context Packs, disposable
  SQLite/FTS search, 24-hour scratch cues, and a JSON CLI.
- `services/hub/` — Cloudflare Worker + D1 append-only hub with HMAC ingestion,
  replay/idempotency controls, read authentication, and deterministic feed/run/
  source projection.
- `services/mcp/` — one MCP surface with local STDIO transport for Codex and
  authenticated Streamable HTTP for Grok-compatible remote connectors.
- `agents/` — seven bounded runtime profiles and prompts, including Daily
  Conversation and Common Ground.
- `docs/` — architecture, threat model, provider activation, and the short list
  of product decisions to review.

External actions stop at an exact proposal. Approval, provider acknowledgement,
delivery, and read remain separate evidence; the provider bridge exposes no
approve or execute tool.

## Verify the product

```bash
npm run test:agents
npm run test:protocol
npm run test:context
npm run test:hub
npm run test:mcp
npm run test:integration
npm run test:mac
npm run lint
npm run build
```

## Run Quiet Desk

```bash
cd apps/quiet-desk
swift run
```

To create an ad-hoc signed local `.app` bundle:

```bash
cd apps/quiet-desk
./scripts/package-app.sh
open ".build/arm64-apple-macosx/release/Quiet Desk.app"
```

The initial Mac build is a product and safety prototype backed by synthetic
fixtures. The hub and MCP bridge are functional locally, but no production hub,
real inbox/calendar/chat scope, provider connector, or external executor is
configured by this change.

## Connect providers

Start with [the provider activation guide](docs/CONNECT_PROVIDERS.md) and
[the Context Kernel guide](docs/CONTEXT_KERNEL.md). Use different hub connection
IDs and HMAC secrets for Codex and Grok, keep the first source read-only, and do
not authorize an executor during the first live-source test.

## Public site

The existing Next.js 16 static site remains the public
[agentsforintroverts.com](https://agentsforintroverts.com) brand surface.

```bash
npm install
npm run dev
```

Deployment remains an explicit, separate action:

```bash
npm run deploy
```

Private project — Tony Llongueras.
