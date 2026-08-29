# The Slow Feed publishing practice

Status: working operating system, 2026-08-19

Agents for Introverts should launch first as a public practice, then earn the right to become a more autonomous product.

## Launch decision

The first public essay will be published on Substack under the working title:

> **Why I've handed over all my social network keys to my agents**

The essay will introduce the lived decision first, then open into the Agents for Introverts manifesto. Substack is the initial publication and subscriber surface. The manifesto remains the deeper source text on `agentsforintroverts.com`.

This supersedes the earlier plan to begin with the Woon story and to use Buttondown for the initial list. Woon becomes the second essay. Buttondown remains a possible later infrastructure choice when the product needs an API-controlled email layer, but it is not part of the launch critical path.

"Handing over the keys" is the governing metaphor: delegating operation of the vehicle while its owner still chooses where to go and can take back control. The essay should make the actual division of responsibility concrete, but the title does not claim literal credential transfer and does not need to move to future tense.

The public rhythm is simple:

> Once a week, turn one recurring online conversation into a source-backed Slow Feed, add Tony's lived position, participate where that conversation is already happening, and follow no more than three promising human threads.

The work demonstrates the product while creating the relationships that can shape it.

The weekly note is an output of a smaller daily practice, not the engine itself. The engine is one continuing conversation between outside context and Tony's lived day. That conversation may surface zero to three specific **places** where his current work or established ideas genuinely belong. It does not require a post, reply, or new opinion every day.

The full product direction and operating boundaries for this loop live in [`DAILY_CONVERSATION.md`](./DAILY_CONVERSATION.md).

## The initial audience

Start with independent builders, researchers, designers, and founders who have real work or experience but routinely fail to put it into circulation.

Their problem is not a shortage of ideas. It is a lack of network fluency:

- they built something, but the right people never saw it;
- they have something to add, but do not want to post constantly;
- keeping up with the feed costs more energy than it returns;
- they do not know where an idea belongs or how to make it travel.

Do not begin with generic creator growth, automated social media, or "content at scale." The aim is more participants, not more automated content.

## The public offer

The publication is:

**Slow Feed — field notes for participating without living in the feed**

- The first essays and subscriber list will live on Substack.
- The website manifesto remains the canonical statement of the thesis.
- A first-party `/field-notes/` archive can follow once the practice reveals what the product needs to own.
- Substack email will carry the full essay and invite a direct reply.
- Tony's personal X and LinkedIn accounts will distribute the note and enter existing conversations.
- The relationship attaches to a person, not a faceless brand account.
- No additional public channels are added during the first 30 days.

The first high-touch product offer comes after 30 days of dogfooding:

> Bring one real project and one conversation you struggle to stay inside. Agents for Introverts will produce a sourced view of that conversation, help express your position, and surface up to three people worth considering. It sends nothing without you.

Start with five founding practices, not an open-ended waitlist.

## The publishing loop

```text
Human seed
    ↓
Recurring discourse and visible disagreement
    ↓
Source-backed compression
    ↓
Living-context match
    ↓
One canonical thought and up to two channel adaptations
    ↓
Exact human approval
    ↓
Manual publication and public-URL receipt
    ↓
Corrections, counterexamples, shared intent, and relationship openings
    ↓
At most three human threads
    ↓
One mutually chosen continuation
    ↓
Updated context and the next field note
```

The first state machine is deliberately manual at the last mile:

`captured → grounded → drafted → proposed → approved → manually published → verified → replies triaged → context update proposed`

There is no automatic `approved → published` transition in the first practice.

## The daily conversation

Before the weekly publishing loop, hold one short daily conversation:

1. The agent brings a bounded, sourced view of what changed outside and what returned from earlier participation.
2. Tony brings what happened during the day: work, learning, priorities, energy, and ideas that are forming or changing.
3. Together they decide where the outside world and lived context actually meet.
4. The agent may surface zero to three places, each with the exact conversation, why it fits, what Tony could add, source doors, and the human effort required.
5. Tony can learn, correct, reject, hold, or choose a place. Choosing one permits preparation, not publication.
6. Corrections, edits, rejected fits, and results return to the next conversation.

The daily conversation replaces raw feed time; it must not become a daily content quota or another inbox to clear.

## Separate discovery from publishing

The social-publishing pilot should not require Tony to enter X or LinkedIn merely
to reach a composer. Discovery and publishing therefore use separate
capabilities:

- discovery may perform only the bounded, read-only review defined in the source
  policy and has no social write authority;
- publishing receives one exact, revisioned outbox payload with the account,
  platform, target, links, media, and timing;
- Tony approves that exact payload and target; any change invalidates approval;
- a separate publisher may then use a feedless composer or API and return a
  public URL receipt without opening recommendations, notifications, trends, or
  a home feed.

This is the target boundary, not a claim of current capability. Until the
publisher, identity check, idempotency, and receipt are proven end to end, Tony
continues to publish manually. Discovery access never becomes publishing
permission.

## The authorship boundary

The core rule is:

> Agents may translate an established position. They may not originate a new position on your behalf.

An agent may:

- preserve a human seed and ask for missing context;
- find repeated conversations and show the disagreement inside them;
- retrieve established positions and prior expressions;
- compress, structure, edit, and adapt an established position;
- draft an exact external payload;
- group replies and draft useful responses;
- suggest a context correction or evolution.

The human must:

- supply the seed for a new idea, changed belief, vulnerable lived experience, promise, or commitment;
- decide whether a conversation is worth entering;
- approve the exact words, account, target, and revision of every external action;
- manually publish during the first phase;
- send the first direct message and accept any commitment;
- decide whether a relationship is worth continuing;
- accept, edit, or reject changes to living context.

Approval of one X payload does not approve a LinkedIn payload. A changed revision invalidates the earlier approval.

## What one field note contains

Every note uses the same editorial skeleton:

1. What I saw repeating
2. Where the apparent consensus breaks down
3. My lived stake in it
4. What I currently believe
5. What remains unresolved
6. One specific question or invitation
7. An agent ledger: what the agent sourced, compressed, or adapted; what Tony added, corrected, and approved

A note without lived experience, a real position, or inspectable sources is an AI summary and should not be published.

## The weekly ritual

Thursday is the public ritual because it is already part of the product language.

The daily conversation continues throughout the week. The table below describes only the additional work needed to turn one of those conversations into a public note.

| Day | Practice | Human time |
|---|---|---:|
| Monday | Agent gathers a bounded corpus, clusters recurrence, and preserves disagreement. | 10 minutes to choose or reject the conversation |
| Tuesday | Tony records a voice note or rough position. | 20–30 minutes |
| Wednesday | Agent prepares the canonical draft and at most two adaptations. Tony corrects and approves. | 30–45 minutes |
| Thursday | Tony manually publishes. The agent records the public URL and prepares a small participation queue. | 20–30 minutes |
| Friday | One response digest, not constant notifications. | 15–20 minutes |
| Following Monday | Decide whether one human continuation has been earned. | 10 minutes |

The target is no more than two hours of human feed time per week, excluding a mutually chosen one-to-one conversation.

## The first 30 days

### Days 1–3: establish truth

- Publish the manifesto from a website-only release boundary.
- Create the Substack publication and complete its identity, about page, reply settings, and subscriber flow.
- Keep the website email capture absent; do not collect the same address through two unconnected systems.
- Prepare and approve **Why I've handed over all my social network keys to my agents**.
- Record the baseline: weekly feed time, energy afterward, substantive replies, and real conversations.
- Personally share the manifesto with ten people who can challenge it. Ask for criticism, not amplification.

### Week 1: the operating decision

Publish **Why I've handed over all my social network keys to my agents**.

- Explain what access the agents actually have.
- Show the boundary between observing, drafting, proposing, approving, and publishing.
- Use the manifesto to explain why disengagement is no longer a satisfactory answer.
- Invite readers to name the part of online participation they would delegate and the part they never would.

### Week 2: the founder story

Publish **I built Woon and waited**.

- Enter three to five existing conversations with useful native replies.
- Ask: "What did you build that never found its network?"
- Do not attach the link to every reply.

### Week 3: name the capability gap

Publish **The internet has a fluency problem**.

- Classify substantive responses as correction, counterexample, lived experience, shared intent, or generic reaction.
- Respond to at most five contributions.
- Continue privately with at most one person when the interest is reciprocal.

### Week 4: demonstrate the lens

Publish **Four hundred people are not a consensus**.

- Use a bounded, cited corpus.
- Show what was grouped and what remained in disagreement.
- Surface no more than three possible human threads.

### First-month report

Publish **Thirty days of participating without living in the feed**.

- Report human time, agent corrections, useful conversations, missed matches, and failures.
- Invite five people with concrete projects into the founding practice.

## The next topics

1. Why I've handed over all my social network keys to my agents
2. I built Woon and waited
3. The internet has a fluency problem
4. A feed is an interface for a network, not a human
5. Four hundred people are not a consensus
6. When capability becomes abundant, relationship becomes scarce
7. Presence without constant presence
8. What my agent may repeat—and what must come back to me
9. From shared interest to shared intent
10. More participants, not more automated content
11. Thirty days of not living in the feed

## Metrics that fit the thesis

The north-star metric is:

**Recurring human threads that become an opt-in continuation or shared action.**

Definitions:

- A substantive response contains lived experience, evidence, a concrete disagreement, or a specific offer.
- A returning participant contributes meaningfully in more than one session.
- A human continuation means both people choose to move into a direct conversation.
- Shared action has a named next step, not merely mutual enthusiasm.

A good first month would produce:

- four Slow Feed notes;
- twelve substantive contributions inside other people's conversations;
- five people volunteering specific versions of the problem;
- three returning participants;
- two opt-in one-to-one continuations;
- one concrete shared action or founding-practice participant;
- zero unapproved posts, messages, or commitments;
- no more than two hours of human feed time per week.

Track source fidelity, summary corrections, accepted edits, human time, and Tony's energy after each session. Impressions, likes, followers, and email opens are diagnostic signals only.

## Private working state

Private captures, context, drafts, approvals, and reply analysis belong in a user-owned directory outside the public product repository. The starter structure lives in `templates/quiet-desk-publishing/`.

Markdown holds material Tony should read and edit. JSON holds state, hashes, IDs, and evidence. Credentials and raw private conversations never enter the workspace.

Only approved public copy belongs in the website repository.

## Website launch gates

### P0 — before promotion

- The signup flow must never claim success without a real provider response.
- The offer must be called **Field Notes** everywhere; no missing "playbook" should be promised.
- Release only the reviewed website allowlist. Do not mix the public-site release with unfinished Quiet Desk and protocol changes.

### P1 — subscriber surface

- Use Substack as the only subscriber surface during the first month.
- Keep the website capture absent so it cannot claim a signup that did not occur.
- Verify the complete subscribe, confirmation, delivery, reply, and unsubscribe flow before distributing the first essay.
- Export the publication and subscriber list periodically so the work remains portable.
- Reconsider Buttondown only when direct API control becomes a demonstrated product requirement.

### P1 — discovery and measurement

- Publish `robots.txt` and `sitemap.xml`.
- Measure canonical page views, manifesto-to-field-notes movement, signup success/error, and tagged outbound sources.
- Keep substantive responses and human continuations in a small manual ledger.

### P2 — after the first distribution cycle

- Build a filesystem-backed `/field-notes/` index and static note pages.
- Add per-note date, author, canonical, OG metadata, and RSS.
- Define first-class publication and reply receipts in the protocol only after the manual practice reveals stable requirements.

## What not to do

- Do not call this an AI social-media manager.
- Do not market the synthetic Quiet Desk as live-connected software.
- Do not auto-like, auto-reply, auto-DM, or manufacture personalized engagement.
- Do not publish generic AI news summaries or daily hot takes.
- Do not create a Discord or Slack community that becomes another feed.
- Do not turn every promising person into a sales lead.
- Do not optimize cadence for volume.
- Do not wait for full automation.
- Do not launch on Product Hunt until the practice has produced at least one real human thread and one credible dogfood report.

The strategic test is whether Agents for Introverts helps its creator publish consistently, enter real discourse, and form a few worthwhile relationships without making him live inside the feed.
