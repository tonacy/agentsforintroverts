# Runner

One daily conversation, locally. This is the engine the rest of the repository
was waiting on: it reads verified public sources and Tony's own account of the
day from a private Quiet Desk workspace, runs the `afi.daily-conversation`
role once, and writes zero to three Places back into that workspace. Everything
it produces is held. Nothing it does is external.

It needs no hub, no MCP transport, and no Mac app. Those remain the next
activation gates; this runner is what makes real days exist for them to show.

## Codex companion (Mac app default)

Today opens an ongoing Codex conversation. The first handoff includes a prepared
check-in; Codex Desktop prefills it and the person presses Send. Later handoffs
return to the same conversation. No prompt writing, recap transfer, or reflection
form is required. The manual check-in and publishing flow is under Advanced.

`companion.mjs open --workspace <path>` writes scoped instructions to
`.quiet-desk/CODEX.md` and returns the supported Codex deep link. It discovers the
resulting session by its workspace and unique handoff marker, never by title alone.
The bridge uses the installed `codex app-server --stdio` protocol to read persisted
sessions. It does not start a shared daemon, change global Codex configuration,
choose a model, or take over an active conversation.

Codex uses `companion.mjs read`, `checkpoint` and `research`. Checkpoints take JSON
on stdin, validate evidence IDs, require the current revision, and append atomic
agent-attributed revisions. Codex is instructed to checkpoint before every final
reply and when wrapping up: there is no reliable desktop conversation-ended event.
Saved state and recent changes appear in Today when the app regains focus or the
person refreshes. A failed save/sync remains visible, not reported as success.

Only actual user/assistant text from the bound conversation is mirrored into
`.quiet-desk/messages`; tools and reasoning are excluded. The prepared handoff is
labeled `desk_prompt`. Sync reads the most recent 20 turns, not a complete transcript
archive. The full conversation stays in Codex. Existing human context and captures
are preserved; `.quiet-desk/updates` contains agent understanding, not human claims.
Public source records remain in `sources/`; research receives only minimized public
topics through the isolated public researcher. This is a local companion adapter,
not activation of the separately implemented encrypted Context Kernel.

### Loose pages and pieces

`read` also returns `inside.loose_pages`: the person's own pages from
`captures/<date>/` (written by the Mac app's capture well and menu bar, marked
`author: human`), newest first, verbatim, without the ones they set aside. And it
returns `pieces`: every folder under `drafts/` with a `piece.json`, and the state
of each form (`draft`, `signed`, `changed_since_signed`, `published`) derived from
the bytes on disk, never from a status word in the manifest.

`piece.mjs render --workspace <path> --piece drafts/<folder>` sets a piece in the
house style: `index.html`, three social cards under `cards/`, and the house fonts
and stylesheet under `assets/`, so it opens from disk. It never replaces a
hand-built page; `--output edition.html` sets one beside it. The page is signed
only while a saved approval matches the exact words of `article.md`. See
[the piece guide](../../templates/quiet-desk-publishing/piece/PIECE.md). Agents
never write `approvals/` or `receipts/`: those are the person's marks.

## Codex check-in

The Mac app can now prepare today's recap through Codex and the installed
Computer History connection, or from supplied context. It saves the person's
calibration separately, pins the reviewed recap, researches public topics in a
separate web-only call, and passes both attributed inside inputs to synthesis.
See [the workspace guide](../../templates/quiet-desk-publishing/CODEX.md).

Outside research verifies fetched pages, rejects common access challenges,
and refreshes previously known URLs. Each retrieval remains a separate source
snapshot; only the newest snapshot per URL counts toward the source gate.
Publication time, when discoverable, remains separate from retrieval time.

## The gates

Every gate fails closed and is written to `runs/<run_id>.json` with a named
blocker. None of them is a suggestion.

| Gate | Rule | Result |
|---|---|---|
| Capture | `daily/<date>/capture.md` exists and its frontmatter says `author: human` | otherwise `failed`, blocker `capture_missing` or `capture_not_human_authored`, exit 2, no model call |
| No new input | `--mode no_new_input` | `completed` as an intentional no-op: no model call, no Places, existing state carried forward |
| Outside context | at least 2 source records with `public_revalidation.status: verified` captured inside the window (default 7 days) | otherwise `partial`, blocker `outside_context_not_ready`, exit 3, no model call |
| Provider answer | `stop_reason: end_turn` and parseable JSON | otherwise `failed`, blocker `provider_stop_<reason>` or `provider_output_unparseable` |
| Citations | every development and Place cites a loaded `source_item_id`; three Places is a ceiling | violators are dropped and listed under `validation_dropped`; if nothing survives, `partial` with blocker `no_source_backed_claims` |
| Human edits | `daily-conversation.md` matches the hash recorded on the last run | otherwise the new conversation is written beside it as `daily-conversation.<run_id>.md` |
| Public view | `export-public` was run with `--approve` | otherwise exit 4 and no `public.json` |

## The three commands

```bash
# 1. Gather read-only public sources listed in preferences/feeds.json
node services/runner/collect.mjs --workspace "$QD" [--max 20]
node services/runner/collect.mjs --workspace "$QD" prune        # drop expired records

# 2. Run today's conversation
node services/runner/run-day.mjs --workspace "$QD" --date 2026-09-07 \
  --provider anthropic|fixture --mode short|deep|no_new_input --window-days 7

# 3. Approve a public, minimized view of the day
node services/runner/export-public.mjs --workspace "$QD" --date 2026-09-07 --approve \
  [--include-inside] [--out src/content/day.json]
```

`--provider fixture` is deterministic and offline. `--provider anthropic` uses
the Anthropic SDK with whatever credential the environment or an `ant auth
login` profile provides; the runner never reads or stores a key.

## End-to-end walkthrough

```bash
# A private workspace, outside this repository and outside any synced folder.
export QD="$HOME/Quiet Desk"
cp -R templates/quiet-desk-publishing "$QD"
mkdir -p "$QD/daily" "$QD/sources" "$QD/places" "$QD/runs" "$QD/drafts"

# Add any RSS/Atom feeds you want read to preferences/feeds.json (pages are seeded).

# Collect. Unauthenticated GETs only; each item becomes one minimized source record.
node services/runner/collect.mjs --workspace "$QD"

# Write today's capture in your own words, from the template.
mkdir -p "$QD/daily/2026-09-07"
cp templates/quiet-desk-publishing/templates/capture.md "$QD/daily/2026-09-07/capture.md"
$EDITOR "$QD/daily/2026-09-07/capture.md"      # keep `author: human`

# Run the day.
node services/runner/run-day.mjs --workspace "$QD" --date 2026-09-07 --provider anthropic

# Read daily/2026-09-07/daily-conversation.md and places/*/place.md. Decide.

# When a day is fit for public view, approve it and hand it to the site.
node services/runner/export-public.mjs --workspace "$QD" --date 2026-09-07 --approve \
  --out src/content/day.json
```

What lands in the workspace:

```text
daily/2026-09-07/capture.md              yours, never rewritten
daily/2026-09-07/daily-conversation.md   the conversation, from the template
daily/2026-09-07/conversation.json       afi.local_daily_conversation.v1
daily/2026-09-07/public.json             afi.public_day.v1, only after --approve
places/2026-09-07-<slug>/place.md        one per Place, Decision left to you
sources/source_<date>_<slug>.json        afi.local_source_record.v1
runs/run_<date>_<time>_<id>.json         status, blockers, usage, what was dropped
```

## Providers: the sign-in your terminal already has

Quiet Desk holds no credential. The runner can use a harness that is already
signed in on this Mac, and the app shows which ones are:

```bash
node services/runner/providers.mjs list --json [--workspace "$QD"]
node services/runner/providers.mjs use --workspace "$QD" --provider claude [--model opus] --json
```

| Provider | How it runs | Signed in when |
|---|---|---|
| `claude` | Claude Code in print mode: no tools, our system prompt, a JSON schema, an empty temp directory | the keychain holds Claude Code's login (checked by name; the secret is never read) |
| `codex` | `codex exec`, read-only sandbox, ephemeral, user config ignored | `~/.codex/auth.json` exists (never read) |
| `anthropic` | the SDK directly | `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, or an `ant auth login` profile exists |
| `fixture` | canned, offline | always |

The chosen provider is written to `preferences/provider.json` (a name, never a
key). `run-day` without `--provider` uses it, and `--model` picks a model the
harness understands (`opus`, `sonnet`, `haiku` for Claude Code).

Two more commands exist for the app:

```bash
node services/runner/status.mjs --workspace "$QD" --date 2026-09-07     # afi.day_status.v1
node services/runner/capture.mjs new --workspace "$QD" --date 2026-09-07 # creates capture.md from the template, never overwrites
```

## What it deliberately does not do

- It does not send, post, reply, follow, like, schedule, or publish anything.
- It does not approve. `export-public` needs `--approve` every time, and the
  exported view is minimized: source doors as label and URL, no hashes, no
  excerpts, and no capture text unless `--include-inside` is passed.
- It does not fetch authenticated surfaces. X, LinkedIn, inboxes, and Computer
  History are governed by `docs/SOURCE_AND_RETENTION_POLICY.md` and are out of
  scope for the collector by construction.
- It does not rewrite the capture, and it does not infer the day when the
  capture is missing.
- It does not produce hub receipts. Observations are recorded as
  `observation_event_id: local-only` until a configured Quiet Hub exists.

## Tests

```bash
npm --prefix services/runner test
```

The suites cover the gates, the context renderer, output validation, file
writing and the no-overwrite rule, the approval gate and minimization of the
public export, and the collector's RSS, Atom, and HTML parsing, idempotency,
and pruning. No test touches the network.
