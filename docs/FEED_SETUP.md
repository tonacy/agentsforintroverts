# Quiet Desk feed setup

Feed setup is a local, user-authored permission plan. It is not OAuth and it
never grants an agent permission to broaden a source. Quiet Desk and trusted
local agent harnesses share the plan through a small file protocol under:

```text
~/Library/Application Support/Agents for Introverts/Quiet Desk/feeds
```

`plan.json` is revisioned and hash-bound. Agents can read it, but only the Mac
app can change it. Agents may append create-only, short-lived evidence receipts
under `receipts/` after actually exercising a configured boundary. They may then
append a minimized cue while that receipt is still fresh. Inside recall is
physically separated under `inside-cues/`; Outside observations live under
`outside-cues/`. Receipts and cues do not contain credentials, browser cookies,
raw feed bodies, or Computer History event-stream locators.

The setup surface separates three lanes:

1. **Outside context** — read-only, bounded X Following and LinkedIn organic
   cues. Discovery never grants publishing permission.
2. **Inside recall** — current-day Computer History cues used only to ask the
   person what their day meant. Cues are not autobiography.
3. **Publishing** — X, LinkedIn, and Substack destinations. Each destination
   independently chooses exact-item review, an approved standing policy, or
   draft-only/manual publishing.

Saving writes the requested plan to local Mac preferences and the shared local
file protocol. The UI calls a feed connected only while a matching receipt is
fresh. Every receipt is bound to the exact plan revision, plan hash, identity,
permission, and scope. Changing any of those invalidates the old receipt.

Two verification adapters exist in this build:

- **Computer History · Today** checks only current-day segment metadata and the
  referenced event file's readability and freshness. It stores no activity
  content. Its receipt expires after 15 minutes.
- **X · Following** accepts a receipt only after an agent visibly proves the
  signed-in account, exact configured handle, selected Following tab, and a
  bounded read with no writes. Its receipt expires after one hour.

LinkedIn and publishing destinations remain plan-only. Daily Conversation can
now mix active local cues with synthetic recurring Threads and living context.
The cue layer is not a Context Kernel projection: cues expire within 24 hours,
remain uncertain, and cannot support a factual claim, belief, or Place.

Both Inside and Outside cues must set `uncertain` and `requiresCalibration` to
true. The MCP writer and Mac reader enforce the same rule, including when the
Mac app reopens files created by another local process. A valid receipt does not
allow a cue to present itself as confirmed context.

## Capability map

| User action | Location | Agent equivalent | Status |
|---|---|---|---|
| Inspect the feed catalog and boundaries | Agents & Sources → Set up feeds | `list_feed_connections` | Implemented |
| Select a feed and enter its expected identity | Feed setup | User-only permission boundary | Intentionally user-only |
| Choose per-channel publishing review | Feed setup | User-only standing-policy grant | Intentionally user-only |
| Save the local plan | Feed setup | No agent write tool; an agent cannot grant itself access | Intentionally user-only |
| Verify current-day Computer History availability | Verify on this Mac | App-local metadata adapter | Implemented; no content import |
| Verify X account and Following boundary | Refresh after agent check | `record_feed_connection_receipt` | Implemented; evidence only |
| Append a minimized observation after a verified read | Daily Conversation cue inbox | `record_feed_cue` | Implemented for Computer History and X Following |
| Read active cues into Daily Conversation | Today | `list_feed_cues` | Implemented; short/deep bounds apply and no-new-input ignores them |
| Promote a cue into living context or evidence | Not present in this build | Future owner confirmation or public-source capture | Intentionally blocked |
| Publish to a configured channel | Not present in this build | Provider adapter with independent delivery receipts | Not connected |

The permission mutation is intentionally not action-parity enabled: an agent
must not be able to authorize itself or change the account it is expected to
verify. Context parity is provided through the read projection and evidence
append tool. The Mac app owns the grant; the agent can only report what it
actually observed within that grant.
