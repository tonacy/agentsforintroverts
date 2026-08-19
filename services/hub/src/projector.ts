import type {
  FeedItem,
  RunProjection,
  RunStatus,
  SourceItem,
  SourceReference,
  StoredEvent,
  StoredSourceRef,
} from "./types.js";

interface CanonicalFeedPayload {
  schema: "afi.feed_item.v1";
  feed_item_id: string;
  user_id: string;
  run_id: string;
  agent_id: string;
  revision: number;
  title: string;
  summary: string;
  lane: FeedItem["lane"];
  why_it_matters: string;
  confidence?: number;
  claims: FeedItem["claims"];
  sources: SourceReference[];
  status: FeedItem["status"];
  created_at: string;
}

interface FeedRevisionEvent {
  event: StoredEvent;
  feedItemId: string;
  revision: number;
  previousRevision?: number;
  payload: Partial<CanonicalFeedPayload>;
  operation: "publish" | "update";
}

export function compareEventOrder(left: StoredEvent, right: StoredEvent): number {
  if (left.sequence !== right.sequence) return left.sequence - right.sequence;
  const timestampOrder = Date.parse(left.occurred_at) - Date.parse(right.occurred_at);
  if (timestampOrder !== 0) return timestampOrder;
  return left.canonical_event_id.localeCompare(right.canonical_event_id);
}

function latestRunStatus(current: RunStatus, event: StoredEvent): RunStatus {
  switch (event.kind) {
    case "run.started":
    case "run.progress":
    case "source.observed":
    case "feed.item.published":
    case "feed.item.updated":
    case "feed.item.withdrawn":
    case "feedback.recorded":
      return "running";
    case "action.proposed":
      return "awaiting_approval";
    case "run.partial":
      return "partial";
    case "run.completed":
      return "completed";
    case "run.failed":
      return "failed";
    default:
      return current;
  }
}

export function projectRun(events: StoredEvent[]): RunProjection | null {
  if (events.length === 0) return null;
  const ordered = [...events].sort(compareEventOrder);
  const first = ordered[0];
  if (!first) return null;
  let status: RunStatus = "pending";
  for (const event of ordered) status = latestRunStatus(status, event);

  const chronological = [...ordered].sort((left, right) => {
    const timestampOrder = Date.parse(left.occurred_at) - Date.parse(right.occurred_at);
    return timestampOrder || left.canonical_event_id.localeCompare(right.canonical_event_id);
  });

  return {
    run_id: first.canonical_run_id,
    external_id: first.run.external_id,
    provider: first.producer.provider,
    connection_id: first.producer.connection_id,
    agent_key: first.run.agent_key,
    trigger: first.run.trigger,
    status,
    started_at: chronological[0]!.occurred_at,
    updated_at: chronological[chronological.length - 1]!.occurred_at,
    event_count: ordered.length,
    feed_item_count: projectFeedItems(ordered).length,
    events: ordered,
  };
}

function sourceItemsForEvents(events: StoredEvent[]): StoredSourceRef[] {
  const byId = new Map<string, StoredSourceRef>();
  for (const event of [...events].sort(compareEventOrder)) {
    for (const source of event.sources) byId.set(source.source_item_id, structuredClone(source));
  }
  return [...byId.values()].sort((left, right) => left.source_item_id.localeCompare(right.source_item_id));
}

function toProjectedFeedItem(
  payload: CanonicalFeedPayload,
  event: StoredEvent,
  sourceEvents: StoredEvent[],
): FeedItem {
  return {
    ...structuredClone(payload),
    event_id: event.canonical_event_id,
    occurred_at: event.occurred_at,
    provider: event.producer.provider,
    connection_id: event.producer.connection_id,
    source_items: sourceItemsForEvents(sourceEvents),
  };
}

function revisionEvent(event: StoredEvent): FeedRevisionEvent | null {
  if (event.kind !== "feed.item.published" && event.kind !== "feed.item.updated") return null;
  const data = event.data as {
    feed_item: Partial<CanonicalFeedPayload>;
    previous_revision?: number;
  };
  const feedItemId = data.feed_item.feed_item_id;
  const revision = data.feed_item.revision;
  if (!feedItemId || revision === undefined) return null;
  return {
    event,
    feedItemId,
    revision,
    previousRevision: data.previous_revision,
    payload: data.feed_item,
    operation: event.kind === "feed.item.published" ? "publish" : "update",
  };
}

function projectCanonicalFeedItems(events: StoredEvent[]): FeedItem[] {
  const revisionsByFeed = new Map<string, FeedRevisionEvent[]>();
  const withdrawalsByFeed = new Map<string, Array<{ revision: number; event: StoredEvent }>>();

  for (const event of events) {
    const revision = revisionEvent(event);
    if (revision) {
      const group = revisionsByFeed.get(revision.feedItemId) ?? [];
      group.push(revision);
      revisionsByFeed.set(revision.feedItemId, group);
    }
    if (event.kind === "feed.item.withdrawn") {
      const data = event.data as { feed_item_id: string; feed_item_revision: number };
      const group = withdrawalsByFeed.get(data.feed_item_id) ?? [];
      group.push({ revision: data.feed_item_revision, event });
      withdrawalsByFeed.set(data.feed_item_id, group);
    }
  }

  const projected: FeedItem[] = [];
  for (const [feedItemId, revisions] of revisionsByFeed) {
    revisions.sort((left, right) => {
      const revisionOrder = left.revision - right.revision;
      return revisionOrder || compareEventOrder(left.event, right.event);
    });
    const published = revisions.find((revision) => revision.operation === "publish");
    if (!published) continue;

    let payload = structuredClone(published.payload) as CanonicalFeedPayload;
    let latestEvent = published.event;
    const appliedEvents = [published.event];
    for (const revision of revisions) {
      if (revision === published || revision.operation !== "update") continue;
      if (
        revision.previousRevision !== payload.revision
        || revision.revision !== payload.revision + 1
      ) {
        continue;
      }
      payload = { ...payload, ...structuredClone(revision.payload) };
      latestEvent = revision.event;
      appliedEvents.push(revision.event);
    }

    const withdrawn = (withdrawalsByFeed.get(feedItemId) ?? [])
      .some((withdrawal) => withdrawal.revision === payload.revision);
    if (!withdrawn) projected.push(toProjectedFeedItem(payload, latestEvent, appliedEvents));
  }
  return projected;
}

export function projectFeedItems(events: StoredEvent[]): FeedItem[] {
  return projectCanonicalFeedItems(events)
    .sort((left, right) => {
      const timestampOrder = Date.parse(right.occurred_at) - Date.parse(left.occurred_at);
      return timestampOrder || left.feed_item_id.localeCompare(right.feed_item_id);
    });
}

interface MutableSourceItem extends Omit<SourceItem, "run_ids" | "event_ids" | "feed_ids"> {
  run_ids: Set<string>;
  event_ids: Set<string>;
  feed_ids: Set<string>;
}

function sourceWithTracking(source: StoredSourceRef, event: StoredEvent): MutableSourceItem {
  return {
    ...structuredClone(source),
    provider: event.producer.provider,
    connection_id: event.producer.connection_id,
    first_seen_at: event.occurred_at,
    last_seen_at: event.occurred_at,
    run_ids: new Set([event.canonical_run_id]),
    event_ids: new Set([event.canonical_event_id]),
    feed_ids: new Set(event.canonical_feed_id ? [event.canonical_feed_id] : []),
  };
}

export function projectSources(events: StoredEvent[]): SourceItem[] {
  const ordered = [...events].sort(compareEventOrder);
  const byId = new Map<string, MutableSourceItem>();

  for (const event of ordered) {
    for (const source of event.sources) {
      const current = byId.get(source.source_item_id);
      if (!current) {
        byId.set(source.source_item_id, sourceWithTracking(source, event));
        continue;
      }

      // Source text is untrusted evidence. It may update display metadata, but
      // it never changes authority, routing, approvals, or execution state.
      Object.assign(current, structuredClone(source));
      current.last_seen_at = event.occurred_at;
      current.run_ids.add(event.canonical_run_id);
      current.event_ids.add(event.canonical_event_id);
      if (event.canonical_feed_id) current.feed_ids.add(event.canonical_feed_id);
    }
  }

  const feedItems = projectFeedItems(ordered);
  for (const item of feedItems) {
    for (const source of item.source_items) byId.get(source.source_item_id)?.feed_ids.add(item.feed_item_id);
  }

  return [...byId.values()]
    .map((source): SourceItem => ({
      ...source,
      run_ids: [...source.run_ids].sort(),
      event_ids: [...source.event_ids].sort(),
      feed_ids: [...source.feed_ids].sort(),
    }))
    .sort((left, right) => {
      const timestampOrder = Date.parse(right.last_seen_at) - Date.parse(left.last_seen_at);
      return timestampOrder || left.source_item_id.localeCompare(right.source_item_id);
    });
}
