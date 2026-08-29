# Source and retention policy

Status: activation policy for the Daily Conversation

This policy defines what Agents for Introverts may inspect, what may become
evidence, and how long each class of material may exist. It applies before any
authenticated social source or Computer History input is used.

The governing distinction is simple: an authenticated observation may help the
agent know where to look or what to ask about, but it is not automatically a
durable source and it is never automatically part of Tony's lived experience.

## Source classes

| Class | Purpose | Durable? | Hub eligible? | Default retention |
|---|---|---:|---:|---|
| Raw browser state | Navigate an authorized surface during one bounded review | No | No | Memory only; any necessary temporary artifact is deleted within 24 hours |
| Authenticated-feed cue | Point to a possibly relevant public conversation | No | No | End of run; 24-hour hard limit |
| Computer History recall cue | Help Tony remember what happened during the current local day | No | No | End of run; 24-hour hard limit |
| Revalidated public source | Support a factual briefing claim or Place through an exact public source door | Yes, minimized | Yes, after revalidation | Local source record reviewed or deleted after 30 days |
| Confirmed human capture | Preserve only the words Tony explicitly confirms and authorizes for retention | Yes, private | Not in the current Hub | Until Tony revises or deletes it |
| Derived projection | Make evidence easier to inspect in a daily note, Thread, Place, or search index | Rebuildable | Only when its inputs are eligible | Rebuild whenever inputs change |

Retention is a ceiling, not a reason to keep something. Delete a cue as soon as
it has served its purpose. A 30-day public source record may remain longer only
when Tony promotes it to a durable Thread, position, project, or historical
reference; record that promotion as a separate event.

## X: Following only

An X review is authorized only under all of these conditions:

1. A personal-account handle is explicitly configured in the user's source
   preferences. The expected identity is not derived from whichever account is
   already signed in.
2. Before reading any post, the agent visibly inspects the signed-in account and
   records its handle in the fresh runtime boundary. The visible handle must be
   unambiguous and an exact normalized match for the configured handle.
   Normalization is limited to letter case, surrounding whitespace, and one
   leading `@`; a display name or similar-looking identity is not a match.
3. The agent navigates to the home timeline and can visibly verify that
   **Following** is selected before reading any post.
4. The agent repeats both identity and Following verification after a reload,
   navigation, account change, or any state change that could switch the account
   or timeline.
5. The review is bounded by the current run's source and time budget.
6. Inspection is read-only. The agent does not like, repost, quote, reply,
   bookmark, follow, unfollow, mute, block, message, or publish.

The following X surfaces are denied: **For You**, Explore, trends, search-driven
firehoses, notifications, messages, lists not explicitly approved, promoted
posts, and recommended-account modules. If the Following label is absent,
ambiguous, or cannot be visibly verified, stop the X portion of the run.

A work, product, or brand account is not a substitute for the configured
personal account, even when the same person owns both. If the expected handle is
missing, the visible handle is missing or ambiguous, or the two handles do not
match, stop before reading, mark the outside-context result `partial`, and
report the mismatch and smallest account-switch step. If the problem is noticed
after reading began, discard every cue gathered from that session; none may
fuel the personal Daily Conversation or be promoted through public
revalidation.

A post seen in Following is an ephemeral cue. Before it can support a factual
briefing claim, durable source record, or Place, open its exact post URL and
revalidate that the material intended for citation is publicly accessible. Do
not preserve feed-position data, recommendations, impressions, private account
content, cookies, or the surrounding authenticated page.

## LinkedIn: bounded organic reading

LinkedIn access is limited to:

- organic items visible in the home feed during a bounded review; and
- an exact post and its directly relevant comments when opened from an approved
  source door.

Skip anything labeled Sponsored, Promoted, Suggested, or otherwise paid or
recommended. Profile browsing, People You May Know, connection graphs,
notifications, messages, invitations, job recommendations, contact export, and
search-driven prospecting are denied. All writes and reactions are denied.

The home feed is algorithmically mixed, so an item appearing there does not
mean Tony follows, endorses, knows, or has a relationship with its author. Treat
it as an ephemeral cue until the exact post or comment is revalidated through a
publicly accessible source door. A commenter's identity is retained only when it
is necessary to understand the cited public exchange.

## Computer History: recall, not autobiography

Computer History may be consulted only for the current local calendar day and
only to offer concise recall cues before Tony describes or confirms his day.
Prefer application/task-level descriptions such as "you spent time editing the
partner paywall" over copied titles, page contents, messages, credentials, or
private names.

A recall cue is not evidence of intent, belief, importance, emotion, progress,
or completion. The agent must not:

- write a first-person account on Tony's behalf;
- infer a belief from a page that was open or text that was typed;
- promote an observed activity into living context;
- retain screenshots, raw event streams, clipboard contents, private messages,
  credentials, or unrelated activity; or
- use a cue from an earlier day without a new, explicit request.

Ask Tony what the cue means. Only his confirmed wording may enter the daily
capture, and only after he authorizes retention of that minimized excerpt.

## Evidence promotion

`observe_source` writes durable provenance to Quiet Hub. Therefore:

- do not call `observe_source` for raw browser state, authenticated-feed cues,
  Computer History cues, or inferred interpretations;
- do not place those cues in source records, feed items, Places, living context,
  logs, or the current append-only Hub;
- revalidate a selected social item as public, minimize it, assign an exact
  HTTP(S) door, hash the observed public content, and then call
  `observe_source`; and
- record a confirmed human capture only when Tony explicitly authorizes the
  exact excerpt, and keep it local until a separate private-data Hub design has
  been approved.

Current Hub schemas and credentials are not an authorization to ingest
authenticated personal data. Public revalidation changes the source's evidence
status; it does not imply endorsement or permission to act.

## Storage and deletion

- Keep raw DOM, screenshots, browser automation output, and Computer History
  event detail in process memory whenever possible.
- If debugging requires a temporary artifact, place it in an OS temporary
  directory, record why it exists, and remove it within 24 hours.
- Keep selected public source records in the private local Quiet Desk archive
  for at most 30 days unless explicitly promoted.
- Never store cookies, tokens, credentials, full authenticated pages, DMs,
  contact lists, or private relationship graphs.
- A correction or deletion request creates an auditable tombstone or
  superseding event; projections must stop showing the withdrawn material.

The target durable architecture is defined in
[`HISTORY_ARCHITECTURE.md`](./HISTORY_ARCHITECTURE.md). Until that local ledger
exists, the private Quiet Desk files are the recoverable copy and the Hub must
not be treated as the only copy of anything Tony expects to keep.

## Failure behavior

Stop the affected source review and report the boundary when:

- X's expected account is missing or its visibly verified account is ambiguous
  or mismatched;
- X Following cannot be visibly verified;
- an item cannot be distinguished from sponsored or recommended content;
- public revalidation fails;
- the source would require opening a denied surface;
- current-day Computer History is unavailable or stale; or
- safe minimization would remove the context needed to make the claim.

Missing access is an honest partial result, not a reason to broaden scope.
