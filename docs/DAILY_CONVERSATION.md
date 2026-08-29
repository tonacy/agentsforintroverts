# The daily conversation

Status: product direction, 2026-08-20

## Activation status

The first local activation slice now exists:

- a private, user-owned `Quiet Desk/` workspace holds human captures, source
  records, context, Places, and run state;
- a bounded 12-source public bootstrap corpus establishes initial reference
  points and preserves deliberate disagreements;
- the MCP bridge can record one minimized source as `source.observed` before
  interpretation, with its provenance and receipt intact;
- the provider-neutral `afi.daily-conversation` role refuses to synthesize from
  stale or assumed context, requires an explicit human capture, surfaces zero to
  three Places, and has no proposal tool in its assembled capability set.
- Quiet Desk now opens on a clearly synthetic Daily Conversation surface with
  session-only `short`, `deep`, and `no_new_input` calibration. It uses existing
  recurring Threads only as supporting material and visibly holds back Places
  while the Context Kernel and a trusted human-capture path are not connected.

This is not yet a recurring live connection. The Mac calibration is not written
to the Context Kernel or retained as a preference. `observe_source` records evidence;
it does not fetch the web. A public-source collector or bounded research run, a
configured persistent Quiet Hub, fresh runtime context injection, and a daily
trigger are still required. The Mac app remains a synthetic projection.

The current research packet and its honest readiness verdict live in
[`research/OUTSIDE_CONTEXT_BOOTSTRAP.md`](./research/OUTSIDE_CONTEXT_BOOTSTRAP.md).

The primary interface for Agents for Introverts is not a feed or a dashboard. It is one continuing conversation between a person's lived day and the outside world.

Each day, the agents bring a bounded, source-backed view of what is happening outside. The person brings what they made, learned, noticed, changed their mind about, struggled with, or now wants to make happen. Together they look for the few places where those two realities genuinely meet.

```text
Outside context + lived context
              ↓
      Daily conversation
              ↓
        Zero to three places
              ↓
  Learn, hold, respond, or create
              ↓
     Reactions and better context
              ↺
```

The goal is not to create a daily content obligation. A conversation can end with a better understanding of the world, a corrected piece of context, one useful response, or no action at all.

## Two sides of the conversation

### Outside context

The agents should not attempt to summarize the whole internet. They should prepare a small, inspectable view of:

- conversations recurring across more than one pocket;
- meaningful disagreement hidden by apparent consensus;
- work, people, and projects that intersect with current priorities;
- replies or developments from places previously entered;
- source doors that let the person inspect the original material.

Recurrence is not consensus. Compression must preserve disagreement, uncertainty, and enough provenance to return to the source.

### Lived context

The other half comes from the person:

- what happened during the day;
- what they worked on or are trying to change;
- what they learned, felt, or found difficult;
- what has become more or less important;
- how much attention or energy they have available;
- which ideas are established positions and which are still forming.

Connected tools may help recall the day, but they must not turn lived context into surveillance. The person decides what becomes part of the conversation and what enters their living context.

Authenticated participation is also identity-bound. Before X can contribute
even ephemeral cues, the run must compare the personal account configured in
user-owned preferences with the account visibly signed in, and it must visibly
verify Following. Owning several accounts does not make them interchangeable: a
work or brand timeline cannot silently fuel the personal Daily Conversation.
A missing, ambiguous, or mismatched account produces an honest partial run.

## A place

**A place is a timely, specific opening in which this person may have something real to contribute.**

A thread and a place are different. A **thread** is recurring discourse that persists over time. A **place** is a concrete opening inside or adjacent to that thread: a particular post, exchange, person, publication, or project where participation makes sense now.

A place is not a generic channel, an audience segment, or a growth opportunity. It earns attention only when the agent can explain:

1. **Where it is** — the exact conversation and source doors.
2. **What is happening** — a fair compression of the discussion and disagreement.
3. **Why it fits now** — the confirmed priority, project, or established position it intersects.
4. **What the person could add** — not merely that they could be visible there.
5. **What it asks of them** — the human time, judgment, vulnerability, or commitment required.
6. **What the next move could be** — learn, hold, reply, publish, ask, or meet.

The agents should surface no more than three places in a daily conversation. That is a ceiling, not a target. A place should expire or return to watching when its timely opening passes. Zero is a successful result when nothing has earned the person's attention.

## The conversation loop

The conversation should be adaptive rather than a scripted digest, but it normally moves through six beats:

1. **What changed outside?** The agent offers only the developments likely to matter, with sources and uncertainty.
2. **What changed inside?** The person describes their day, priorities, energy, and any new or evolving thoughts.
3. **Where do they meet?** The agent connects outside context to confirmed lived context and explains the fit.
4. **Which places deserve attention?** The person can explore, correct, hold, reject, or choose a place.
5. **What contribution is actually theirs?** The agent may research, compress, edit, or adapt; the person supplies new positions and commitments.
6. **What returns tomorrow?** Reactions, corrections, rejected fits, and chosen continuations improve the next conversation.

This loop should learn from more than approvals. Rejections, edits, fatigue, changed priorities, counterexamples, and the instruction never to surface a kind of place again are equally valuable signals.

### Calibrate the depth before adding input

The conversation should respond to the person's available attention without
pretending to know their inner state. Current-day Computer History cues may
suggest a fragmented day, but that is only a hypothesis to calibrate. The agent
can say that several items are available but none appears urgent, then offer a
short version, a deeper look, or no new input.

The short version contains one compact outside update and one recommendation—or
an honest conclusion that no new action earned attention—and at most one Place.
The deeper look uses the normal zero-to-three ceiling. No new input means the
agent carries forward existing state without pressing for a narrative or
manufacturing a new match. A mode choice belongs to that check-in unless the
person explicitly makes it a standing preference.

Tony chose the short version on 2026-08-20. The result was to add no new active
lane and carry forward two product pilots: bounded marketing/GEO evaluation and
social publishing separated from feed discovery.

## The first two pilots

The Daily Conversation should first coordinate two bounded capabilities rather
than proliferating more product surfaces:

- evaluate marketing tools and tactics through read-only, time-bounded,
  reversible tests, using existing data before creating new data collection;
- let the person publish an already planned social contribution without entering
  the discovery feed merely to reach a composer.

Trust is built visibly. A result starts with the recommendation—or the useful
conclusion that none was worth recommending—plus the number of approaches
evaluated and rejected and a short reason. Sources, method, individual results,
failure reasons, limitations, and rationale remain available for drill-down and
challenge.

Evidence may earn an automatically prepared pull request. It does not authorize
merge, deployment, spend, outreach, publishing, or another consequential action.
Social discovery has no write authority; a future publisher receives only an
exact, revisioned payload after account- and target-specific human approval and
must not browse a feed to reach the composer.

The complete operating and proof contract lives in
[`PILOT_OPERATING_MODEL.md`](./PILOT_OPERATING_MODEL.md).

## Authorship and agency

The daily conversation is where the authorship boundary becomes visible:

- an established position may be translated or adapted by an agent;
- a new idea, changed belief, vulnerable lived experience, promise, or commitment requires a human seed;
- inferred context remains labeled and cannot silently become a belief;
- changes to living context are proposed, inspectable, and reversible;
- every external payload still requires approval of its exact words, target, account, and revision;
- approval to speak in one place does not grant general permission to speak elsewhere.

The conversation may create agency for the agents over time, but only by making that boundary more legible—not by making it disappear.

## Product implication

The Daily Conversation should become the front door of Quiet Desk.

Threads, Activity, Living Context, and Agents & Sources remain essential, but they become inspectable supporting layers behind the conversation:

- **Daily Conversation** is where outside and lived context are brought together.
- **Places** holds the small set of specific conversations being considered or continued.
- **Activity** preserves the source and operational record.
- **Living Context** shows what informed a match and what still needs confirmation.
- **Agents & Sources** shows what can be accessed and what work is happening.

The current human-thread projection is therefore not discarded. It becomes an input to the conversation rather than the first thing a person must interpret on their own.

## What the practice can prove first

The practice can begin manually before the product has live connectors:

1. the person gives a short account of the day;
2. the agent researches a deliberately bounded outside corpus;
3. they hold the daily conversation;
4. the agent records any proposed context changes and places;
5. the person manually publishes or responds after exact approval;
6. the next conversation begins with what came back.

Today, Quiet Desk demonstrates synthetic local projections. It does not yet have automatic access to a person's day or live social-network conversations. Those are separate activation gates, not implied capabilities.

## Measures that fit the idea

Measure whether the practice creates presence without exhaustion:

- time spent inside raw feeds;
- energy before and after the daily conversation;
- percentage of surfaced places accepted, held, or rejected;
- corrections to outside compression and living context;
- contributions the person believed were genuinely theirs;
- substantive replies and recurring human threads;
- opt-in continuations or shared action;
- zero unapproved posts, messages, or commitments.

Post volume, reply speed, impressions, and follower growth are diagnostic signals, not the purpose of the system.
