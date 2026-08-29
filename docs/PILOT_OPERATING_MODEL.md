# The first two agent pilots

Status: product direction, 2026-08-20

Agents for Introverts should first reduce two concrete forms of network work:

1. evaluating marketing and GEO tools or tactics without creating another
   research habit for the person;
2. publishing an already planned social contribution without requiring the
   person to enter a distracting feed.

These are two pilot capabilities inside the Daily Conversation, not two new
inboxes or daily obligations. The current recommendation is to add no other
active lane until these loops have produced trustworthy evidence over several
real days.

## One trust contract

Early agent work should be visibly inspectable. Do not quietly optimize and
present only the winner.

Every evaluation that reaches the person starts with a compact outcome:

- **Recommendation:** the one approach worth considering, or **none worth
  recommending**;
- **Coverage:** how many approaches were evaluated and how many were rejected;
- **Reason:** the shortest defensible explanation of why the recommendation
  survived or why every candidate failed;
- **Next authority:** what, if anything, the person is being asked to approve.

The summary is a doorway, not the whole evidence record. The person must be able
to inspect and challenge:

- sources and source dates;
- the question, constraints, and comparison method;
- candidates considered;
- tests or observations performed;
- results, including negative results;
- rejection reasons and known limitations;
- the rationale for the recommendation;
- the proposed change, proof plan, and rollback path.

"Nothing was worth recommending" is a successful result when the bounded work
was completed honestly. Preserve enough of the failed search to prevent the
person or a later agent from repeating the same feed-driven investigation
without new evidence.

## Pilot one: marketing-tool and tactic evaluation

The agent may investigate marketing, GEO, distribution, sponsorship, or
measurement ideas when they connect to a confirmed project priority. Begin with
the data and tools already available. Set a bounded question, time or query
budget, candidate set, success criteria, and stopping rule before testing.

The first pass is read-only, bounded, and reversible. It may:

- inspect current product, search, analytics, or campaign evidence;
- compare a small set of tools or tactics using public and first-party data;
- run local analyses, dry runs, previews, or sandboxed tests;
- record a negative result and stop;
- prepare a scoped branch and pull request after the evidence threshold is met.

It may not spend money, alter a live account, contact someone, publish content,
merge code, deploy, or change production merely because a test looks promising.

### Evidence threshold for a pull request

A pull request is earned when:

- the problem and intended outcome are explicit;
- the selected approach beat the rejected alternatives on the stated criteria;
- the evidence is current enough and can be reproduced or inspected;
- the change is scoped, testable, and reversible;
- claims and measurements preserve their proof boundaries;
- limitations and failure conditions are named.

Once that threshold is met, an agent may prepare and open a pull request without
asking the person to perform the mechanical code work. The pull request must
carry the compact outcome plus the full evidence packet and verification plan.
The person retains review and approval; merge, deployment, spend, outreach, and
all other consequential actions remain separate human decisions.

The desired endpoint is not a stream of marketing suggestions. It is an
occasional PR-ready, evidence-backed improvement with a clear reason to exist.

## Pilot two: social publishing without discovery

Discovery and publishing are different capabilities and should have different
permissions.

The discovery side may inspect only the bounded, authorized surfaces defined in
the source policy. It has no publishing authority. On X, it must never use For
You as a substitute for the personal Following review.

The publishing side receives an exact planned payload from the outbox. It does
not browse a home feed, recommendations, trends, notifications, or search merely
to reach a composer. Before execution it requires approval of:

- account and platform;
- exact text and revision;
- reply target or canonical post target, when applicable;
- links and media;
- timing.

A changed payload invalidates prior approval. After approval, a separate
publisher may perform the mechanical post through a feedless composer, API, or
equally bounded surface and return a public URL receipt. Approval of one target
does not authorize cross-posting or replies elsewhere.

The current product does not yet have a proven external publisher. Until the
executor, account check, idempotency, and public receipt are verified end to
end, manual publication remains the honest fallback. The product target is that
the person can publish a planned contribution without entering the feed, not
that an agent can speak whenever it chooses.

There is also a protocol gap to resolve before activation. The local publication
proposal can cite a human seed and legitimately have no public source when the
post makes no external factual claim. The canonical `afi.action_proposal.v1` and
current MCP `propose_action` input require at least one source and have no
revision-bound human-seed field. Do not invent a public source to satisfy that
contract. Add canonical human-seed references—and allow zero external sources
for a source-free human-authored payload—before routing this pilot through MCP.

## How the Daily Conversation presents these pilots

Computer History can provide cautious, current-day recall cues about the
texture of the day. It cannot establish intent, emotion, priority, progress, or
completion. Before adapting the conversation, the agent asks for calibration.
A useful check-in is:

> It may have been a fragmented day. I have several items available, but none
> looks urgent. Would you like the short version, a deeper look, or no new input?

The language is a hypothesis, not a diagnosis. The person can correct it.

- **Short version:** one compact outside update and one recommendation—or an
  honest statement that no new action earned attention. Surface at most one
  Place.
- **Deeper look:** use the normal bounded conversation and surface zero to three
  Places.
- **No new input:** do not press for a day narrative or manufacture a match.
  Carry forward existing state and return only something already urgent.

Tony chose the short version on 2026-08-20. The resulting recommendation was to
open no additional active lane and to carry these two pilots forward as the
current product-learning focus. Treat that as current, reviewable context—not a
permanent preference inferred from one tired day.

## Pilot proof

The pilots should initially prove:

- fewer visits to raw feeds to research or publish;
- useful negative results that prevent repeated research;
- recommendations that remain defensible under drill-down;
- PRs whose evidence and scope survive review;
- exact social approvals with no account or revision drift;
- zero unapproved posts, merges, deployments, spend, outreach, or commitments;
- whether the short/deeper/no-input calibration leaves the person with more
  energy rather than another queue to clear.
