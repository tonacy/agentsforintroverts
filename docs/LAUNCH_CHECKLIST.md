# Agents for Introverts launch checklist

Status date: 2026-08-31

This project has three distinct launches. Complete and name them separately:

1. **Public practice** — the website, Substack, first real handoff, and a manual
   thirty-day experiment.
2. **Private product pilot** — live read-only context, a trustworthy Daily
   Conversation, and feedless proposals for a small number of testers.
3. **Autopilot product** — channel-specific standing permissions and proven
   external execution.

The immediate goal is the **public-practice launch**. A deployed website does
not prove the Mac app, context sources, approval system, or publishers are live.

## 0. Preserve the launch baseline

- [ ] `main` contains the manifesto, current hourglass/focus identity, Quiet
  Desk prototype, Context Kernel/MCP work, editorial draft, and this checklist.
- [ ] The superseded `hero-opening-crescendo` worktree changes are preserved on
  their own branch and are not merged over the newer hourglass direction.
- [ ] `origin/main` is refreshed and is an ancestor of the proposed launch
  commit; update `main` only by fast-forward and never by force.
- [ ] Run the full local verification suite from the exact proposed commit.
- [ ] Record the final commit SHA and keep it with the deployment receipt.

Baseline commands:

```bash
nvm use
node --version
npm --version
npm ci
npm ci --prefix services/mcp
npm run build
npm run verify
npm --prefix services/hub run typecheck
git diff --check
npm run verify:site
```

`npm run verify` covers the agent, protocol, Context Kernel, Hub, MCP,
integration, Swift, lint, and production website build suites. It does not
prove deployment, native UI behavior, notarization, or a live provider.
`npm run build` is the website-only production export. Run every command above
with the checked-in `.nvmrc` value, Node 22.23.2; release tooling enforces
`>=22.23.2 <23`. Recording `node --version` and `npm --version` makes the
release environment explicit.

## 1. Public-practice launch — do this first

### Website release

- [ ] Run `nvm use` and confirm Node 22.23.2 from `.nvmrc`; release tooling
  rejects versions outside `>=22.23.2 <23`, and Wrangler no longer supports the
  default Node 20 runtime.
- [ ] Run `npm ci` and `npm ci --prefix services/mcp` from the exact clean
  launch commit. Do not substitute `npm install` during release preparation.
- [ ] Decide the build-time `FIELD_NOTES_URL` state:
  - [ ] Until Slow Feed has a real public URL, leave it unset or blank and
    confirm the header/footer stay on `/#field-notes`, the status says “The
    first field note is being written.”, and its CTA remains `/manifesto/`.
  - [ ] After the publication exists, set its absolute HTTPS URL and confirm
    the header, footer, and “Read the field notes →” status CTA all use the
    normalized URL and the copy says “Slow Feed is now publishing.”
  - [ ] Confirm a malformed, relative, credential-bearing, or non-HTTPS value
    fails the build.
- [ ] Run `npm run build`, then the complete baseline verification commands
  above using the same `FIELD_NOTES_URL` state intended for deployment.
- [ ] Confirm the static build contains:
  - [ ] `/index.html`
  - [ ] `/manifesto/index.html`
  - [ ] `/made-with/index.html`
  - [ ] `/robots.txt`
  - [ ] `/sitemap.xml`
  - [ ] `/version.json`
  - [ ] `/_headers`
  - [ ] root and manifesto Open Graph images
  - [ ] favicon and Apple icon
- [ ] Inspect `out/version.json` and confirm its contract is
  `schemaVersion: 1`, `service: "agentsforintroverts.com"`, the full 40-character
  `commitSha`, `branch: "main"`, `sourceTree: "clean"`, and
  `buildMode: "static-export"`.
- [ ] Run `npm run verify:site`; do not infer route, marker, asset, or header
  readiness from `npm run build` alone.
- [ ] Review the built site locally on desktop and at 390 px.
- [ ] Exercise keyboard focus, the Skip opening control, and reduced motion.
- [ ] Immediately before deployment, fetch `origin/main` and confirm all three
  SHAs are identical: `out/version.json` `commitSha`, local `HEAD`, and fresh
  `origin/main`. Confirm the branch is `main` and the source tree is clean.
- [ ] Deploy from the checked-out, verified `main` commit.
- [ ] Run `npm run deploy` with the pinned Node 22.23.2 and the same
  `FIELD_NOTES_URL` value used by the verified build. Remember that this
  command rebuilds before the Pages upload.
- [ ] Save the Wrangler deployment output, Pages deployment URL, and deployed
  commit SHA.
- [ ] Verify the production URLs independently after deployment:
  - [ ] `/`
  - [ ] `/manifesto/`
  - [ ] `/made-with/`
  - [ ] `/robots.txt`
  - [ ] `/sitemap.xml`
  - [ ] `/version.json`
  - [ ] both Open Graph images
  - [ ] favicon
- [ ] Run `npm run verify:site:public -- --expected-commit <40-character SHA>`
  against the recorded release SHA. The public marker must match; a successful
  Wrangler upload is not production proof by itself.
- [ ] Verify production response headers:
  - [ ] global CSP contains `base-uri 'self'`, `form-action 'self'`, and
    `frame-ancestors 'none'`
  - [ ] `Permissions-Policy` disables camera, geolocation, and microphone
  - [ ] `Referrer-Policy: strict-origin-when-cross-origin`
  - [ ] `X-Content-Type-Options: nosniff`
  - [ ] `X-Frame-Options: DENY`
  - [ ] one emitted `/_next/static/*` asset has immutable caching
  - [ ] `/version.json` has `Cache-Control: no-store`
- [ ] Confirm canonical URLs and social-card previews use the production
  domain.
- [ ] Confirm `http://agentsforintroverts.com/` and the `www` host redirect to
  the canonical HTTPS apex instead of serving a second copy.

Current evidence: the live root and manifesto respond, but production still
matches an older commit. `/made-with/`, the sitemap, the new Open Graph assets,
the Apple icon, and the public version marker were not live as of this
checklist. The `www` host also served a second copy instead of redirecting. Keep
these items unchecked until the post-deploy public verification passes.

### Substack foundation

- [ ] Create the **Slow Feed** Substack publication.
- [ ] Add the publication name, description, portrait/mark, About page, and a
  link back to the manifesto.
- [ ] Set the reply-to behavior so readers can answer Tony directly.
- [ ] Run the complete subscriber smoke test with a real address:
  subscribe → confirmation → delivery → reply → unsubscribe.
- [ ] Confirm an export of posts and subscribers can be downloaded.
- [ ] Keep Substack as the only subscriber system for the first month; do not
  add a disconnected website email form.

### First real handoff

- [ ] Choose one narrow permission that makes the article title true. The
  recommended first handoff is a feedless publish of one approved launch post
  from Tony's personal X account, `@tonylongname`.
- [ ] Freeze the account, target, exact text, links, media, timing, and revision
  before approval.
- [ ] Keep DMs, follows, likes, deletions, commitments, and autonomous replies
  outside this first permission.
- [ ] Publish without opening the discovery feed.
- [ ] Capture the public URL, payload hash/revision, time, executor, and any
  correction Tony made.
- [ ] Confirm the public result from a separate read-only view.
- [ ] Keep an immediate pause/revoke path available.

The handoff receipt is product evidence and the missing lived scene in the
opening article. Do not manufacture it retroactively.

### Opening article

- [x] Preserve the first draft in
  [`editorial/2026-08-31-why-ive-handed-over-my-social-network-keys-draft.md`](./editorial/2026-08-31-why-ive-handed-over-my-social-network-keys-draft.md).
- [ ] Replace the pre-publication note with the real handoff: what permission
  changed, what the agent did, what Tony corrected, and the public receipt.
- [ ] Complete Tony's final truth-and-voice review.
- [ ] Check every product claim against current capability; explicitly label
  intended end state versus demonstrated behavior.
- [ ] Publish manually to Substack.
- [ ] Verify the public page, subscriber email, reply path, canonical URL, and
  social card.
- [ ] Add the final Substack URL to the website or a small launch note without
  creating a second subscriber funnel.

### Distribution and authorship

- [ ] Prepare one canonical launch thought and at most one adaptation each for
  X and LinkedIn.
- [ ] Use Tony's personal accounts, not `@thepeptideapp`.
- [ ] Attach the Agents for Introverts authorship disclosure once per original
  content unit; do not append promotional boilerplate to every human reply.
- [ ] Join only conversations where Tony's existing experience genuinely fits.
- [ ] Record public URLs and substantive responses.
- [ ] Personally send the manifesto to ten people who can challenge it. Ask for
  criticism, not amplification.

### Baseline and first-month ledger

- [ ] Record the pre-launch baseline: weekly feed time, energy afterward,
  publishing frequency, substantive replies, and continuing conversations.
- [ ] Start a small human-readable ledger for:
  - [ ] human minutes spent
  - [ ] agent corrections
  - [ ] accepted and rejected Places
  - [ ] substantive responses
  - [ ] returning participants
  - [ ] opt-in continuations or shared actions
  - [ ] unauthorized-action count
- [ ] Keep the human feed-time ceiling at two hours per week.
- [ ] Treat zero worthwhile Places as a valid result.

### Public-practice launch definition of done

- [ ] Verified current website is live from the recorded `main` SHA.
- [ ] Slow Feed subscription, delivery, reply, and unsubscribe are proven.
- [ ] One real bounded handoff has a public receipt.
- [ ] The opening essay is published and distributed.
- [ ] The baseline and first-month ledger have begun.
- [ ] Nothing implies that synthetic Quiet Desk data or unbuilt autopilot is
  live.

## 2. Thirty-day public practice

- [ ] Week 1 — publish **Why I've handed over all my social network keys to my
  agents**.
- [ ] Week 2 — publish **I built Woon and waited** and ask builders what never
  found its network.
- [ ] Week 3 — publish **The internet has a fluency problem** and classify
  substantive responses.
- [ ] Week 4 — publish **Four hundred people are not a consensus** from a
  bounded, cited corpus.
- [ ] Publish a thirty-day report including time, energy, corrections, missed
  matches, useful conversations, and failures.
- [ ] Invite five people with concrete projects into a founding practice only
  after the system has produced at least one credible continuing human thread.

Primary outcome: recurring human threads that become an opt-in continuation or
shared action. Impressions, likes, followers, and opens are diagnostic only.

## 3. Private product pilot — blocked until these are complete

### Approval integrity

- [ ] Fix the P1 approve → reload → reinspect → reapprove defect. Reload must
  reconcile the snapshot, receipt, notice, payload hash, revision, and approval
  eligibility as one invariant.
- [ ] Add a regression test for the complete sequence.
- [ ] Manually exercise short, deep, and no-new-input modes; selection,
  rejection, empty/error/sample states; relaunch; narrow windows; keyboard;
  VoiceOver; and duplicate menu-bar windows.
- [ ] Keep Quiet Desk read-only and clearly synthetic until this gate passes.

### Literal Inside/Outside separation

- [ ] Replace metadata-only classification with separate Inside and Outside
  storage/security domains, keys, indexes, and process capabilities.
- [ ] Ensure no Outside publisher can read Inside and no Inside reader can
  publish Outside.
- [ ] Implement a human-controlled reflection/release bridge that exports only
  a revisioned `PublicContextRelease`.
- [ ] Test that private body text, source locators, computer-history cues, and
  unreleased beliefs cannot cross the bridge.
- [ ] Test correction, revocation, deletion, backup, and full rebuild for each
  side independently.

### Live context and Daily Conversation

- [ ] Build the authenticated owner gateway for human capture, confirmation,
  release, and Place selection.
- [ ] Connect Quiet Desk to a real read-only projection instead of
  `.bundledSyntheticFixtures`.
- [ ] Add a bounded Computer History adapter that treats observations as
  uncertain, asks for calibration, and deletes unconfirmed cues within 24
  hours.
- [ ] Add an X discovery adapter restricted to `@tonylongname`'s **Following**
  feed; fail closed on For You, Explore, trends, ads, and notifications.
- [ ] Add a bounded LinkedIn organic-feed adapter that excludes sponsored,
  suggested, profile-graph, invitation, messaging, and prospecting surfaces.
- [ ] Revalidate public source items before they become durable Outside
  evidence.
- [ ] Demonstrate a real Daily Conversation that produces zero to three sourced
  Places without creating a content quota.

### Provider infrastructure

- [ ] Create the production D1 database and replace
  `REPLACE_WITH_D1_DATABASE_ID`.
- [ ] Choose and document the Quiet Hub and MCP hosting boundary.
- [ ] Create separate provider identities and rotateable secrets.
- [ ] Prove a signed ingest, durable D1 read, replay rejection, idempotent retry,
  correction, deletion, and backup restore. `/health` alone is not storage
  proof.
- [ ] Add environment templates that name required variables without containing
  credentials.
- [ ] Add CI for the complete verification suite and pin the Node/Swift
  toolchains.

### Private-pilot onboarding

- [ ] Explain the product in one sentence and distinguish the public practice
  from the installed app.
- [ ] Let the user choose a local context directory they own.
- [ ] Connect one agent harness through the provider-neutral MCP interface.
- [ ] Show the Inside/Outside boundary before asking for any source access.
- [ ] Connect one read-only source first and display exactly what it may see.
- [ ] Run a visible sample/no-op Daily Conversation.
- [ ] Ask the user to correct the inferred day/context before persisting it.
- [ ] Configure channel permissions separately by account and action type.
- [ ] Demonstrate pause, revoke, export, and delete before inviting automation.

### Mac distribution

- [ ] Replace the fixed version/build values and add the approved app icon.
- [ ] Produce a universal or intentionally architecture-scoped release build.
- [ ] Sign with Developer ID, enable hardened runtime, notarize, staple, and
  verify Gatekeeper.
- [ ] Package a DMG or signed installer with checksum and release notes.
- [ ] Define an update mechanism and rollback path.
- [ ] Test a clean-machine install, first launch, relaunch, upgrade, uninstall,
  and local-data retention/deletion behavior.

### Private-pilot definition of done

- [ ] Five invited people can install and connect one read-only source.
- [ ] Every displayed claim opens its source door or states its limitation.
- [ ] The approval-reload invariant passes automated and hands-on testing.
- [ ] Inside content cannot be read by an Outside publisher.
- [ ] No consequential external action exists in this phase.
- [ ] A pilot can end with understanding or no recommendation, not forced
  content.

## 4. Autopilot product — later, separately proven

- [ ] Implement a publisher that never receives discovery-feed access.
- [ ] Bind every external action to account, operation, target, payload,
  revision, policy revision, and idempotency key.
- [ ] Return provider acknowledgement, public URL, delivery, and failure as
  distinct receipts.
- [ ] Enforce separate channel policies for original posts, replies, DMs,
  follows, deletions, money, and time commitments.
- [ ] Support X standing permission only for already released public context;
  new beliefs, changed positions, vulnerable stories, promises, and commitments
  return to the Desk.
- [ ] Keep Substack publication approval-required unless the user explicitly
  changes that policy.
- [ ] Add rate limits, anomaly detection, duplicate prevention, kill switch,
  audit log, pause, revoke, correction, and incident recovery.
- [ ] Run a shadow period, then a bounded canary, before any standing permission.
- [ ] Demonstrate authorship fidelity, source fidelity, no increased exhaustion,
  zero unauthorized actions, and at least one worthwhile human continuation.

## 5. Intentionally deferred

- [ ] First-party `/field-notes/` archive, per-note metadata, and RSS.
- [ ] Buttondown or another API-controlled email layer.
- [ ] General waitlist or self-serve onboarding.
- [ ] Multiple social accounts per person.
- [ ] Product Hunt or broad launch.

Do not pull these forward until the manual practice exposes a real need. The
next action after this checklist lands is the website/Substack/first-handoff
launch, not another feature lane.
