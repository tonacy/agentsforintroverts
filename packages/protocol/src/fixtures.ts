import { hashActionPayload, sha256Hex } from "./canonical.js";
import {
  ACTION_PROPOSAL_SCHEMA,
  AGENT_DEFINITION_SCHEMA,
  FEED_ITEM_SCHEMA,
  PROVIDER_CONNECTION_SCHEMA,
  RUN_SCHEMA,
  SOURCE_ITEM_SCHEMA,
  type ActionProposal,
  type AgentDefinition,
  type EmbeddedSourceInput,
  type FeedItem,
  type JsonObject,
  type ProviderConnection,
  type Run,
  type SourceItem,
  type SourceReference,
} from "./types.js";

export const SYNTHETIC_FIXTURE_NOTICE =
  "SYNTHETIC TEST DATA ONLY — people, accounts, messages, meetings, and outcomes are fictional.";

const USER_ID = "user_synthetic_tony";
const CREATED_AT = "2026-08-19T13:00:00.000Z";

export const syntheticProviderConnections: ProviderConnection[] = [
  {
    schema: PROVIDER_CONNECTION_SCHEMA,
    connection_id: "provider_synthetic_openai",
    user_id: USER_ID,
    provider: "openai",
    adapter: "responses-api",
    account_ref: "acct_synthetic_openai",
    model: "synthetic-model-a",
    capabilities: ["text.generate", "tools.call"],
    status: "connected",
    metadata: { synthetic: true, notice: SYNTHETIC_FIXTURE_NOTICE },
    created_at: CREATED_AT,
    updated_at: CREATED_AT,
  },
  {
    schema: PROVIDER_CONNECTION_SCHEMA,
    connection_id: "provider_synthetic_xai",
    user_id: USER_ID,
    provider: "xai",
    adapter: "grok-api",
    account_ref: "acct_synthetic_xai",
    model: "synthetic-model-b",
    capabilities: ["text.generate", "tools.call"],
    status: "connected",
    metadata: { synthetic: true, notice: SYNTHETIC_FIXTURE_NOTICE },
    created_at: CREATED_AT,
    updated_at: CREATED_AT,
  },
];

export const syntheticAgentDefinitions: AgentDefinition[] = [
  {
    schema: AGENT_DEFINITION_SCHEMA,
    agent_id: "agent_inbox_v1",
    slug: "inbox",
    version: 1,
    name: "Inbox Agent",
    purpose: "Distill correspondence and surface only items that merit attention.",
    system_prompt:
      "Read available correspondence, publish source-grounded claims, and propose rather than execute replies.",
    capabilities: ["source.read", "feed.publish", "action.propose"],
    source_kinds: ["email.message", "newsletter.issue"],
    action_kinds: ["email.reply"],
    enabled: true,
    created_at: CREATED_AT,
    updated_at: CREATED_AT,
  },
  {
    schema: AGENT_DEFINITION_SCHEMA,
    agent_id: "agent_follow_up_v1",
    slug: "follow-up",
    version: 1,
    name: "Follow-up Agent",
    purpose: "Find genuinely stalled conversations and prepare considerate nudges.",
    system_prompt:
      "Use thread history and dates to identify a stalled commitment. Cite the thread and only propose a follow-up.",
    capabilities: ["source.read", "feed.publish", "action.propose"],
    source_kinds: ["email.thread", "crm.thread"],
    action_kinds: ["email.follow_up"],
    enabled: true,
    created_at: CREATED_AT,
    updated_at: CREATED_AT,
  },
  {
    schema: AGENT_DEFINITION_SCHEMA,
    agent_id: "agent_scheduling_v1",
    slug: "scheduling",
    version: 1,
    name: "Scheduling Agent",
    purpose: "Protect focus time and resolve calendar conflicts for review.",
    system_prompt:
      "Compare calendar evidence, explain conflicts, and propose changes without modifying the calendar.",
    capabilities: ["source.read", "feed.publish", "action.propose"],
    source_kinds: ["calendar.event", "email.message"],
    action_kinds: ["calendar.reschedule"],
    enabled: true,
    created_at: CREATED_AT,
    updated_at: CREATED_AT,
  },
  {
    schema: AGENT_DEFINITION_SCHEMA,
    agent_id: "agent_group_chat_v1",
    slug: "group-chat",
    version: 1,
    name: "Group Chat Agent",
    purpose: "Condense busy rooms into decisions, open questions, and mentions.",
    system_prompt:
      "Summarize only what the cited messages support and propose a response only when the user is needed.",
    capabilities: ["source.read", "feed.publish", "action.propose"],
    source_kinds: ["slack.thread", "discord.thread"],
    action_kinds: ["chat.reply"],
    enabled: true,
    created_at: CREATED_AT,
    updated_at: CREATED_AT,
  },
  {
    schema: AGENT_DEFINITION_SCHEMA,
    agent_id: "agent_meetup_v1",
    slug: "meetup",
    version: 1,
    name: "Meetup Agent",
    purpose: "Distill invitations and prepare low-friction RSVP choices.",
    system_prompt:
      "Extract date, place, response deadline, and conflicts. Cite the invitation and propose an RSVP for review.",
    capabilities: ["source.read", "feed.publish", "action.propose"],
    source_kinds: ["email.invitation", "calendar.event"],
    action_kinds: ["meetup.rsvp"],
    enabled: true,
    created_at: CREATED_AT,
    updated_at: CREATED_AT,
  },
];

interface SyntheticSourceSpec {
  id: string;
  providerConnectionId: string;
  provider: string;
  kind: string;
  externalId: string;
  threadId?: string;
  title: string;
  content: string;
  occurredAt: string;
}

const sourceSpecs: SyntheticSourceSpec[] = [
  {
    id: "source_synthetic_inbox_001",
    providerConnectionId: "provider_synthetic_openai",
    provider: "gmail",
    kind: "email.message",
    externalId: "gmail_synthetic_msg_001",
    threadId: "gmail_synthetic_thread_001",
    title: "[SYNTHETIC] Written Q&A request",
    content:
      "[SYNTHETIC] Maya Example asks whether a written Q&A would work instead of a live talk and requests an answer by Friday.",
    occurredAt: "2026-08-19T12:10:00.000Z",
  },
  {
    id: "source_synthetic_follow_up_001",
    providerConnectionId: "provider_synthetic_xai",
    provider: "gmail",
    kind: "email.thread",
    externalId: "gmail_synthetic_thread_002",
    threadId: "gmail_synthetic_thread_002",
    title: "[SYNTHETIC] Draft review thread",
    content:
      "[SYNTHETIC] Alex Example promised comments on the draft ten days ago; the thread has no newer reply.",
    occurredAt: "2026-08-09T15:30:00.000Z",
  },
  {
    id: "source_synthetic_scheduling_001",
    providerConnectionId: "provider_synthetic_openai",
    provider: "google-calendar",
    kind: "calendar.event",
    externalId: "gcal_synthetic_event_001",
    title: "[SYNTHETIC] Partner call",
    content:
      "[SYNTHETIC] A partner call is scheduled Thursday 09:30–10:00 during a focus block marked unavailable.",
    occurredAt: "2026-08-20T14:30:00.000Z",
  },
  {
    id: "source_synthetic_group_chat_001",
    providerConnectionId: "provider_synthetic_xai",
    provider: "slack",
    kind: "slack.thread",
    externalId: "slack_synthetic_thread_001",
    threadId: "slack_synthetic_thread_001",
    title: "[SYNTHETIC] #build release thread",
    content:
      "[SYNTHETIC] In a 41-message thread, the team agrees to move the fictional release from Friday to Monday; no question is left for Tony.",
    occurredAt: "2026-08-19T14:05:00.000Z",
  },
  {
    id: "source_synthetic_meetup_001",
    providerConnectionId: "provider_synthetic_openai",
    provider: "gmail",
    kind: "email.invitation",
    externalId: "gmail_synthetic_invite_001",
    threadId: "gmail_synthetic_thread_003",
    title: "[SYNTHETIC] Neighborhood founders dinner",
    content:
      "[SYNTHETIC] A fictional founders dinner is Saturday at 18:30 at Example Hall; RSVP is requested by Thursday.",
    occurredAt: "2026-08-19T11:45:00.000Z",
  },
];

export const syntheticSourceItems: SourceItem[] = sourceSpecs.map((source) => ({
  schema: SOURCE_ITEM_SCHEMA,
  source_item_id: source.id,
  user_id: USER_ID,
  provider_connection_id: source.providerConnectionId,
  provider: source.provider,
  source_kind: source.kind,
  external_id: source.externalId,
  ...(source.threadId === undefined ? {} : { thread_id: source.threadId }),
  title: source.title,
  content: source.content,
  url: `https://example.test/synthetic-source/${source.id}`,
  occurred_at: source.occurredAt,
  captured_at: CREATED_AT,
  metadata: { synthetic: true, notice: SYNTHETIC_FIXTURE_NOTICE },
}));

export const syntheticEmbeddedSourceInputs: EmbeddedSourceInput[] = syntheticSourceItems.map(
  (source) => ({
    source_item_id: source.source_item_id,
    external_id: source.external_id,
    kind: source.source_kind,
    ...(source.url === undefined ? {} : { url: source.url }),
    ...(source.title === undefined ? {} : { title: source.title }),
    captured_at: source.captured_at,
    content_hash: `sha256:${sha256Hex(source.content)}`,
    excerpt: source.content,
    metadata: { synthetic: true, notice: SYNTHETIC_FIXTURE_NOTICE },
  }),
);

function sourceRef(source: SourceItem): SourceReference {
  return {
    source_item_id: source.source_item_id,
    locator: source.url,
    excerpt: source.content,
    observed_at: source.captured_at,
  };
}

const feedSpecs = [
  {
    lane: "needs_you",
    title: "Written Q&A needs a reply by Friday",
    summary: "A synthetic invitation was converted to a lower-pressure written option.",
    why: "The sender explicitly requested a decision and supplied a deadline.",
    claim: "Maya Example asked for a written Q&A response by Friday.",
    confidence: 0.98,
  },
  {
    lane: "watching",
    title: "Draft-review thread has been quiet for ten days",
    summary: "A synthetic promised review has no follow-up response yet.",
    why: "The open commitment may now merit a considerate nudge.",
    claim: "The last visible commitment is ten days old and has no newer reply.",
    confidence: 0.91,
  },
  {
    lane: "needs_you",
    title: "Thursday call overlaps protected focus time",
    summary: "A synthetic calendar event conflicts with an unavailable block.",
    why: "Moving the call would preserve a declared focus boundary.",
    claim: "The 09:30 partner call overlaps a block marked unavailable.",
    confidence: 1,
  },
  {
    lane: "handled",
    title: "Release moved to Monday; nothing is waiting on you",
    summary: "The synthetic group resolved its release-date question without Tony.",
    why: "The decision is useful context, but no response is requested.",
    claim: "The group agreed on Monday and left no open question for Tony.",
    confidence: 0.94,
  },
  {
    lane: "digest",
    title: "Saturday dinner RSVP is due Thursday",
    summary: "A synthetic local dinner invitation includes a clear time and deadline.",
    why: "The response deadline is approaching and the calendar should be checked.",
    claim: "The dinner is Saturday at 18:30 and requests an RSVP by Thursday.",
    confidence: 0.97,
  },
] as const;

export const syntheticRuns: Run[] = syntheticAgentDefinitions.map((agent, index) => ({
  schema: RUN_SCHEMA,
  run_id: `run_synthetic_${agent.slug.replaceAll("-", "_")}_001`,
  user_id: USER_ID,
  agent_id: agent.agent_id,
  agent_version: agent.version,
  provider_connection_id: syntheticSourceItems[index]!.provider_connection_id,
  goal: `[SYNTHETIC] Distill ${agent.name} source input into the quiet feed.`,
  input_source_item_ids: [syntheticSourceItems[index]!.source_item_id],
  status: "running",
  requested_at: "2026-08-19T13:01:00.000Z",
  started_at: "2026-08-19T13:01:01.000Z",
  last_sequence: 1,
}));

export const syntheticFeedItems: FeedItem[] = feedSpecs.map((spec, index) => {
  const source = sourceRef(syntheticSourceItems[index]!);
  return {
    schema: FEED_ITEM_SCHEMA,
    feed_item_id: `feed_synthetic_${syntheticAgentDefinitions[index]!.slug.replaceAll("-", "_")}_001`,
    user_id: USER_ID,
    run_id: syntheticRuns[index]!.run_id,
    agent_id: syntheticAgentDefinitions[index]!.agent_id,
    revision: 1,
    title: spec.title,
    summary: spec.summary,
    lane: spec.lane,
    why_it_matters: spec.why,
    confidence: spec.confidence,
    claims: [
      {
        claim_id: `claim_synthetic_${index + 1}`,
        kind: "source_summary",
        text: spec.claim,
        source_refs: [source],
        confidence: spec.confidence,
      },
    ],
    sources: [source],
    status: "unread",
    created_at: "2026-08-19T13:02:00.000Z",
  };
});

const actionSpecs: { actionKind: string; payload: JsonObject }[] = [
  {
    actionKind: "email.reply",
    payload: {
      channel: "email",
      thread_id: "gmail_synthetic_thread_001",
      draft: "[SYNTHETIC] A written Q&A works well. Please send the questions.",
    },
  },
  {
    actionKind: "email.follow_up",
    payload: {
      channel: "email",
      thread_id: "gmail_synthetic_thread_002",
      draft: "[SYNTHETIC] Quick nudge on the fictional draft whenever you have a moment.",
    },
  },
  {
    actionKind: "calendar.reschedule",
    payload: {
      event_id: "gcal_synthetic_event_001",
      proposed_start: "2026-08-20T19:00:00.000Z",
      duration_minutes: 30,
    },
  },
  {
    actionKind: "chat.reply",
    payload: {
      channel_id: "slack_synthetic_build",
      thread_id: "slack_synthetic_thread_001",
      draft: "[SYNTHETIC] Monday works for me.",
    },
  },
  {
    actionKind: "meetup.rsvp",
    payload: {
      invitation_id: "gmail_synthetic_invite_001",
      response: "tentative",
      note: "[SYNTHETIC] Holding this pending a calendar check.",
    },
  },
];

export const syntheticActionProposals: ActionProposal[] = actionSpecs.map((spec, index) => {
  const agent = syntheticAgentDefinitions[index]!;
  const run = syntheticRuns[index]!;
  return {
    schema: ACTION_PROPOSAL_SCHEMA,
    action_id: `action_synthetic_${agent.slug.replaceAll("-", "_")}_001`,
    revision: 1,
    user_id: USER_ID,
    run_id: run.run_id,
    agent_id: agent.agent_id,
    provider_connection_id: run.provider_connection_id,
    action_kind: spec.actionKind,
    rationale: syntheticFeedItems[index]!.why_it_matters,
    payload: spec.payload,
    payload_hash: hashActionPayload(spec.payload),
    proposed_by: {
      actor_id: agent.agent_id,
      actor_type: "agent",
      display_name: agent.name,
    },
    proposed_at: "2026-08-19T13:03:00.000Z",
    expires_at: "2026-08-20T13:03:00.000Z",
    sources: syntheticFeedItems[index]!.sources,
    status: "proposed",
  };
});

export interface SyntheticAgentFixture {
  notice: typeof SYNTHETIC_FIXTURE_NOTICE;
  agent: AgentDefinition;
  provider_connection: ProviderConnection;
  run: Run;
  source_item: SourceItem;
  embedded_source: EmbeddedSourceInput;
  feed_item: FeedItem;
  action_proposal: ActionProposal;
}

export const syntheticAgentFixtures: SyntheticAgentFixture[] = syntheticAgentDefinitions.map(
  (agent, index) => ({
    notice: SYNTHETIC_FIXTURE_NOTICE,
    agent,
    provider_connection: syntheticProviderConnections.find(
      (connection) => connection.connection_id === syntheticRuns[index]!.provider_connection_id,
    )!,
    run: syntheticRuns[index]!,
    source_item: syntheticSourceItems[index]!,
    embedded_source: syntheticEmbeddedSourceInputs[index]!,
    feed_item: syntheticFeedItems[index]!,
    action_proposal: syntheticActionProposals[index]!,
  }),
);
