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

Use the repository-pinned Node 22.23.2 for all website install, build,
verification, and deploy commands. The enforced range is `>=22.23.2 <23`;
Wrangler 4 no longer supports the default Node 20 runtime on this machine. With
`nvm`, activate the checked-in `.nvmrc`, then confirm the active executables
before installing from the lockfiles:

```bash
nvm use
node --version
npm --version
npm ci
npm ci --prefix services/mcp
npm run dev
```

### Field Notes URL

`FIELD_NOTES_URL` is an optional build-time setting. When it is unset, empty,
or whitespace-only, the site stays in its honest pre-publication state:

- header and footer links point to `/#field-notes`;
- the status reads “The first field note is being written.”; and
- its call to action points to the existing Substack publication and reads
  “Follow on Substack ↗”, with subscriptions handled there. The manifesto
  remains the landing page's primary action.

When it is set, it must be an absolute `https:` URL with no embedded username
or password. Invalid, credential-bearing, or non-HTTPS values fail the build.
The value is trimmed, parsed, and normalized with the standard URL parser; the
header, footer, and status call to action then use that same URL. The live
status reads “Notes from the practice.” and its call to action reads “Read
the field notes ↗”. Do not set it until substantive field notes are publishing.

### Landing-page opening

The reviewed ink-ocean opening keeps the title and links visible throughout.
Its 7.2-second sequence runs once per session on desktop. Mobile, reduced
motion, direct anchor visits, and no-JavaScript rendering use the calm state.
The skip control settles the scene and focuses the headline. Geometry and
deduplicated keyframes come from Figma scene `42:92`; the water PNG contains
the approved image adjustments and opacity, and is composited with Multiply.

### Build and verify

`npm run build` creates the website-only production export. The release gate is
broader:

```bash
npm run build
npm run verify
npm --prefix services/hub run typecheck
git diff --check
npm run verify:site
```

`npm run verify` covers the agent, protocol, Context Kernel, Hub, MCP,
integration, Swift, lint, and website build suites. `npm run verify:site`
additionally verifies the exported routes, social assets, security-header file,
and public version marker.

Every production build emits `out/version.json`. The public marker is available
at `/version.json` with this contract:

```json
{
  "schemaVersion": 1,
  "service": "agentsforintroverts.com",
  "commitSha": "<40-character Git SHA>",
  "branch": "main",
  "sourceTree": "clean",
  "buildMode": "static-export"
}
```

Field order and whitespace are not significant. A release is eligible only
when the marker says `main` and `clean`, its SHA equals both local `HEAD` and
fresh `origin/main`, and `npm run verify:site` passes.

### Deploy and verify the exact release

Deployment remains an explicit, separate action. `npm run deploy` rebuilds the
site, so use the same `FIELD_NOTES_URL` value that was present during the
verified build.

```bash
git fetch origin
test "$(git branch --show-current)" = "main"
test -z "$(git status --porcelain)"
test "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)"
npm run deploy
```

Save the 40-character SHA and Wrangler deployment URL, then verify the public
site against that exact commit:

```bash
npm run verify:site:public -- --expected-commit "$(git rev-parse HEAD)"
```

The public check must confirm the HTML routes and launch assets, the canonical
production URLs, and the `/version.json` receipt. It must also confirm the
Cloudflare Pages headers declared in `public/_headers`:

- the global Content Security Policy includes `base-uri 'self'`,
  `form-action 'self'`, and `frame-ancestors 'none'`;
- `Permissions-Policy` disables camera, geolocation, and microphone;
- `Referrer-Policy` is `strict-origin-when-cross-origin`;
- `X-Content-Type-Options` is `nosniff` and `X-Frame-Options` is `DENY`;
- `/_next/static/*` is cached immutably; and
- `/version.json` uses `Cache-Control: no-store`.

A successful local build, a successful Pages upload, and a matching public
marker are three separate proof gates.

Private project — Tony Llongueras.
