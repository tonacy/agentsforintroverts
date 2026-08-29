# Outside-context preferences

This file defines the bounded public world the agents may inspect before a daily conversation. It is a watchlist, not a command to fill a feed.

## Priority questions

- How are people delegating online participation to personal agents without delegating identity or belief?
- Where are thoughtful builders struggling with distribution, network fluency, or the demand for constant presence?
- Which tools are helping people reduce feed exposure while remaining able to participate?
- How are authors, researchers, and communities drawing the boundary between AI adaptation and human authorship?
- Where is shared interest becoming shared intent or a concrete project?

## Priority topics

- personal and social agents;
- human authorship, identity, and agent representation;
- feeds, attention, and public participation;
- independent builders and the distribution problem;
- relationship and trust as capability becomes abundant;
- source-backed compression and preserving disagreement.

## Named people, projects, and publications

Add only sources Tony wants to hear from repeatedly. The entries below are
proposed bootstrap anchors, not approved permanent subscriptions.

- Microsoft Research — Dittos
  - Why it belongs: the closest published parallel to reciprocal personal agents representing someone and reporting back.
  - Public source door or feed: https://www.microsoft.com/en-us/research/publication/dittos-mimetic-reciprocal-agents-in-ai-mediated-communication/
  - Review after: 2026-09-20
- Knight First Amendment Institute — feed legibility work
  - Why it belongs: a concrete vocabulary for understanding how feeds select and rank information.
  - Public source door or feed: https://knightcolumbia.org/content/into-the-drivers-seat-with-social-media-content-feeds
  - Review after: 2026-11-20
- Bluesky — custom feeds and algorithmic choice
  - Why it belongs: a constructive counterexample to the claim that every algorithmic feed removes agency.
  - Public source door or feed: https://bsky.social/about/blog/7-27-2023-custom-feeds
  - Review after: 2026-11-20
- IndieWeb — POSSE
  - Why it belongs: a durable model for keeping one canonical human-authored origin while adapting across networks.
  - Public source door or feed: https://indieweb.org/POSSE
  - Review after: 2026-11-20
- NIST — AI Agent Standards Initiative
  - Why it belongs: an evolving public program around identity, authorization, interoperability, and agents acting for people.
  - Public source door or feed: https://www.nist.gov/artificial-intelligence/ai-agent-standards-initiative
  - Review after: 2026-09-20

## Authorized read-only network surfaces

Authenticated access is a temporary navigation aid, not permission to retain a
timeline or relationship graph. Review the complete boundary in
`docs/SOURCE_AND_RETENTION_POLICY.md` before the first live run.

### X

- Expected personal account handle: `@tonylongname`
- Explicitly excluded work or brand account handles: `@thepeptideapp`
- Identity rule: treat these as user-owned preferences, not universal product
  defaults. Visibly verify the signed-in handle is an exact match for the
  expected personal handle before reading anything.
- Allowed: the home timeline only while **Following** is visibly selected, plus
  an exact public post opened from that bounded review.
- Required check: visibly verify both the signed-in account and Following before
  reading and again after every reload, navigation, or state change that could
  switch the account or tab.
- Failure rule: a missing, ambiguous, or mismatched account—or an unverified
  Following tab—stops the X review and makes the run partial. Discard cues from
  the wrong session; never substitute an excluded work or brand account.
- Denied: For You, Explore, trends, notifications, messages, promoted posts,
  recommended accounts, unapproved lists, and search-driven firehoses.
- Writes denied: like, repost, quote, reply, bookmark, follow, unfollow, mute,
  block, message, and publish.

### LinkedIn

- Allowed: organic items in the home feed, plus an exact post and its directly
  relevant comments when opened from an approved source door.
- Denied: Sponsored, Promoted, Suggested, or recommended items; profiles;
  People You May Know; relationship graphs; notifications; messages;
  invitations; job recommendations; contact export; and prospecting searches.
- Writes denied: react, comment, repost, connect, follow, message, invite, save,
  and publish.

An authenticated-feed item remains an ephemeral cue. It cannot support a Place,
enter living context, or be sent to `observe_source` until its exact content is
revalidated as public. Appearance in either feed does not establish that Tony
follows, endorses, knows, or agrees with its author.

### Computer History

- Allowed: minimized cues from the current local calendar day that help Tony
  remember what he worked on or wants to discuss.
- Denied: earlier days without a new explicit request, screenshots, raw event
  streams, credentials, clipboard contents, private messages, and unrelated
  activity.
- A cue is not an account of intent, belief, emotion, priority, progress, or
  completion. Ask Tony what it means; only his confirmed words may enter the
  human capture.

## Manual source inbox

High-intent URLs Tony supplies should be reviewed before broad discovery. Add the URL and one sentence about why it caught his attention.

- URL:
  - Why it caught my attention:

## Deliberate disagreement

List viewpoints or source types that should be sought so the lens does not become agreement theater.

- User-controlled algorithmic feeds
  - Why it may complicate the current thesis: the problem may be lack of legibility and choice, not feeds themselves.
- Research showing low trust cost from disclosed AI assistance
  - Why it may complicate the current thesis: social trust may depend more on relationship and setting than on a universal anti-AI response.
- Research on formulaic agent-to-agent discourse
  - Why it may complicate the current thesis: more agent participation can reproduce the noise the product is meant to reduce.
- Founders whose customers do not inhabit founder networks
  - Why it may complicate the current thesis: better network fluency cannot fix distribution into the wrong network.

## Exclusions

- no home timelines beyond the explicitly authorized bounded reads above, and
  no unbounded keyword firehoses;
- no authenticated surfaces beyond the explicitly authorized, bounded network
  reads above;
- no private groups, messages, notifications, contacts, profile browsing, or
  relationship-graph collection;
- no copied full articles when a source door and short excerpt are sufficient;
- no source selected only because it is popular;
- no inferred endorsement because Tony supplied or opened a link.

## Retention

- Keep raw browser state and authenticated-feed or Computer History cues in
  process memory; delete any unavoidable temporary artifact within 24 hours.
- Keep a selected, minimized, publicly revalidated source locally for 30 days,
  then delete it or record an explicit promotion to a durable Thread or project.
- Do not place authenticated personal data or recall cues in the current
  append-only Hub.
- Obsidian may edit the portable Quiet Desk archive, but it is not a second copy
  or a synchronization authority.

## Daily research budget

Proposed defaults — Tony should confirm or change these before recurring runs.

- Maximum public sources observed: 12 during bootstrap; 6 on an ordinary day
- Maximum research time: 30 minutes during bootstrap; 15 minutes on an ordinary day
- Freshness window: 30 days for developments and open conversations
- Older sources allowed when: they define a durable model, named project, primary result, or historical precedent
- Languages: English for the first slice

## Outside-context readiness

The daily conversation may begin only when the agent can state:

- which topics, sources, and time window it actually covered;
- which important surfaces it could not inspect;
- which claims have direct source doors;
- whether recurrence is supported by independent sources rather than repetition from one origin;
- where disagreement, uncertainty, or a counterexample remains;
- why the bounded corpus is relevant to a confirmed current priority.

If those conditions are not met, the agent should report that outside context is still being prepared. It should not manufacture Places from a thin corpus.
