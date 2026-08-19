import { canonicalJson, hashActionPayload, isPayloadHash } from "./canonical.js";
import {
  ACTION_PROPOSAL_SCHEMA,
  AGENT_DEFINITION_SCHEMA,
  APPROVAL_DECISION_SCHEMA,
  EVENT_SCHEMA,
  EXECUTION_RECEIPT_SCHEMA,
  FEED_ITEM_SCHEMA,
  PROVIDER_CONNECTION_SCHEMA,
  RUN_SCHEMA,
  SOURCE_ITEM_SCHEMA,
  type ActionProposal,
  type ActorRef,
  type AgentDefinition,
  type ApprovalDecision,
  type Claim,
  type EventEnvelope,
  type EmbeddedSourceInput,
  type ExecutionReceipt,
  type FeedItem,
  type JsonObject,
  type ProviderConnection,
  type Run,
  type RunCompletedData,
  type RunFailedData,
  type RunPartialData,
  type SourceItem,
  type SourceReference,
  type ValidationIssue,
  type ValidationResult,
} from "./types.js";

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

function issue(
  issues: ValidationIssue[],
  path: string,
  code: string,
  message: string,
): void {
  issues.push({ path, code, message });
}

function recordAt(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    issue(issues, path, "expected_object", "Expected a plain JSON object");
    return undefined;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    issue(issues, path, "expected_plain_object", "Expected a plain JSON object");
    return undefined;
  }
  return value as Record<string, unknown>;
}

function stringAt(
  object: Record<string, unknown>,
  key: string,
  path: string,
  issues: ValidationIssue[],
  options: { optional?: boolean; exact?: string } = {},
): string | undefined {
  const value = object[key];
  if (value === undefined && options.optional) return undefined;
  if (typeof value !== "string" || value.trim().length === 0) {
    issue(issues, `${path}.${key}`, "expected_nonempty_string", "Expected a non-empty string");
    return undefined;
  }
  if (options.exact !== undefined && value !== options.exact) {
    issue(issues, `${path}.${key}`, "unexpected_literal", `Expected ${JSON.stringify(options.exact)}`);
  }
  return value;
}

function booleanAt(
  object: Record<string, unknown>,
  key: string,
  path: string,
  issues: ValidationIssue[],
): boolean | undefined {
  const value = object[key];
  if (typeof value !== "boolean") {
    issue(issues, `${path}.${key}`, "expected_boolean", "Expected a boolean");
    return undefined;
  }
  return value;
}

function integerAt(
  object: Record<string, unknown>,
  key: string,
  path: string,
  issues: ValidationIssue[],
  minimum: number,
): number | undefined {
  const value = object[key];
  if (!Number.isInteger(value) || (value as number) < minimum) {
    issue(issues, `${path}.${key}`, "expected_integer", `Expected an integer >= ${minimum}`);
    return undefined;
  }
  return value as number;
}

function timestampAt(
  object: Record<string, unknown>,
  key: string,
  path: string,
  issues: ValidationIssue[],
  optional = false,
): string | undefined {
  const value = object[key];
  if (value === undefined && optional) return undefined;
  if (
    typeof value !== "string" ||
    !ISO_TIMESTAMP.test(value) ||
    !Number.isFinite(Date.parse(value))
  ) {
    issue(issues, `${path}.${key}`, "invalid_timestamp", "Expected an ISO-8601 timestamp with timezone");
    return undefined;
  }
  return value;
}

function stringArrayAt(
  object: Record<string, unknown>,
  key: string,
  path: string,
  issues: ValidationIssue[],
  options: { minItems?: number; unique?: boolean } = {},
): string[] | undefined {
  const value = object[key];
  if (!Array.isArray(value)) {
    issue(issues, `${path}.${key}`, "expected_array", "Expected an array");
    return undefined;
  }
  if (value.length < (options.minItems ?? 0)) {
    issue(
      issues,
      `${path}.${key}`,
      "too_few_items",
      `Expected at least ${options.minItems ?? 0} item(s)`,
    );
  }
  const strings: string[] = [];
  value.forEach((item, index) => {
    if (typeof item !== "string" || item.trim().length === 0) {
      issue(
        issues,
        `${path}.${key}[${index}]`,
        "expected_nonempty_string",
        "Expected a non-empty string",
      );
    } else {
      strings.push(item);
    }
  });
  if (options.unique && new Set(strings).size !== strings.length) {
    issue(issues, `${path}.${key}`, "duplicate_value", "Array values must be unique");
  }
  return strings;
}

function jsonObjectAt(
  object: Record<string, unknown>,
  key: string,
  path: string,
  issues: ValidationIssue[],
  optional = false,
): JsonObject | undefined {
  const value = object[key];
  if (value === undefined && optional) return undefined;
  if (recordAt(value, `${path}.${key}`, issues) === undefined) return undefined;
  try {
    canonicalJson(value);
  } catch (error) {
    issue(
      issues,
      `${path}.${key}`,
      "invalid_json_value",
      error instanceof Error ? error.message : "Invalid JSON value",
    );
    return undefined;
  }
  return value as JsonObject;
}

function finish<T>(value: unknown, issues: ValidationIssue[]): ValidationResult<T> {
  return issues.length === 0
    ? { ok: true, value: value as T }
    : { ok: false, issues };
}

function appendNestedIssues<T>(
  result: ValidationResult<T>,
  prefix: string,
  issues: ValidationIssue[],
): T | undefined {
  if (result.ok) return result.value;
  result.issues.forEach((entry) => {
    const suffix = entry.path === "$" ? "" : entry.path.slice(1);
    issues.push({ ...entry, path: `${prefix}${suffix}` });
  });
  return undefined;
}

function actorAt(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): ActorRef | undefined {
  const actor = recordAt(value, path, issues);
  if (!actor) return undefined;
  stringAt(actor, "actor_id", path, issues);
  const actorType = stringAt(actor, "actor_type", path, issues);
  if (
    actorType !== undefined &&
    !["user", "agent", "provider", "system", "service"].includes(actorType)
  ) {
    issue(issues, `${path}.actor_type`, "unknown_actor_type", "Unknown actor type");
  }
  stringAt(actor, "display_name", path, issues, { optional: true });
  return actor as unknown as ActorRef;
}

export function sourceReferenceKey(source: SourceReference): string {
  return canonicalJson({
    source_item_id: source.source_item_id,
    ...(source.locator === undefined ? {} : { locator: source.locator }),
    ...(source.excerpt === undefined ? {} : { excerpt: source.excerpt }),
    ...(source.observed_at === undefined ? {} : { observed_at: source.observed_at }),
  });
}

function sourceReferenceAt(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): SourceReference | undefined {
  const source = recordAt(value, path, issues);
  if (!source) return undefined;
  stringAt(source, "source_item_id", path, issues);
  stringAt(source, "locator", path, issues, { optional: true });
  stringAt(source, "excerpt", path, issues, { optional: true });
  timestampAt(source, "observed_at", path, issues, true);
  return source as unknown as SourceReference;
}

function sourceArrayAt(
  object: Record<string, unknown>,
  key: string,
  path: string,
  issues: ValidationIssue[],
  minimum: number,
): SourceReference[] | undefined {
  const value = object[key];
  if (!Array.isArray(value)) {
    issue(issues, `${path}.${key}`, "expected_array", "Expected an array");
    return undefined;
  }
  if (value.length < minimum) {
    issue(issues, `${path}.${key}`, "too_few_items", `Expected at least ${minimum} source(s)`);
  }
  const sources = value
    .map((item, index) => sourceReferenceAt(item, `${path}.${key}[${index}]`, issues))
    .filter((item): item is SourceReference => item !== undefined);
  const keys = sources.map(sourceReferenceKey);
  if (new Set(keys).size !== keys.length) {
    issue(issues, `${path}.${key}`, "duplicate_source", "Source references must be unique");
  }
  return sources;
}

function embeddedSourceAt(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): EmbeddedSourceInput | undefined {
  const source = recordAt(value, path, issues);
  if (!source) return undefined;
  stringAt(source, "source_item_id", path, issues);
  stringAt(source, "external_id", path, issues);
  stringAt(source, "kind", path, issues);
  stringAt(source, "url", path, issues, { optional: true });
  stringAt(source, "title", path, issues, { optional: true });
  timestampAt(source, "captured_at", path, issues);
  stringAt(source, "content_hash", path, issues);
  stringAt(source, "excerpt", path, issues, { optional: true });
  jsonObjectAt(source, "metadata", path, issues, true);
  return source as unknown as EmbeddedSourceInput;
}

function embeddedSourceArrayAt(
  object: Record<string, unknown>,
  key: string,
  path: string,
  issues: ValidationIssue[],
): EmbeddedSourceInput[] | undefined {
  const value = object[key];
  if (!Array.isArray(value)) {
    issue(issues, `${path}.${key}`, "expected_array", "Expected an array");
    return undefined;
  }
  const sources = value
    .map((item, index) => embeddedSourceAt(item, `${path}.${key}[${index}]`, issues))
    .filter((item): item is EmbeddedSourceInput => item !== undefined);
  const ids = sources.map((source) => source.source_item_id);
  if (new Set(ids).size !== ids.length) {
    issue(
      issues,
      `${path}.${key}`,
      "duplicate_source_item_id",
      "Embedded source_item_id values must be unique",
    );
  }
  return sources;
}

export function validateEmbeddedSourceInput(
  input: unknown,
): ValidationResult<EmbeddedSourceInput> {
  const issues: ValidationIssue[] = [];
  embeddedSourceAt(input, "$", issues);
  return finish(input, issues);
}

function sameSourceIds(
  references: readonly SourceReference[],
  embedded: readonly EmbeddedSourceInput[],
): boolean {
  const referenceIds = references.map((source) => source.source_item_id).sort();
  const embeddedIds = embedded.map((source) => source.source_item_id).sort();
  return canonicalJson(referenceIds) === canonicalJson(embeddedIds);
}

function validateRunCompletion(
  value: unknown,
  expectedStatus: "completed" | "partial" | "failed",
  path: string,
  issues: ValidationIssue[],
): void {
  const completion = recordAt(value, path, issues);
  if (!completion) return;
  stringAt(completion, "status", path, issues, { exact: expectedStatus });

  if (expectedStatus === "completed") {
    stringAt(completion, "summary", path, issues);
    stringArrayAt(completion, "output_ids", path, issues, { unique: true });
  } else if (expectedStatus === "partial") {
    stringAt(completion, "summary", path, issues);
    stringArrayAt(completion, "completed_steps", path, issues, { unique: true });
    stringArrayAt(completion, "remaining_steps", path, issues, { minItems: 1, unique: true });
    jsonObjectAt(completion, "checkpoint", path, issues);
  } else {
    const error = recordAt(completion.error, `${path}.error`, issues);
    if (error) {
      stringAt(error, "code", `${path}.error`, issues);
      stringAt(error, "message", `${path}.error`, issues);
      booleanAt(error, "retryable", `${path}.error`, issues);
    }
    jsonObjectAt(completion, "checkpoint", path, issues, true);
  }
}

export function validateAgentDefinition(input: unknown): ValidationResult<AgentDefinition> {
  const issues: ValidationIssue[] = [];
  const object = recordAt(input, "$", issues);
  if (!object) return finish(input, issues);
  stringAt(object, "schema", "$", issues, { exact: AGENT_DEFINITION_SCHEMA });
  stringAt(object, "agent_id", "$", issues);
  stringAt(object, "slug", "$", issues);
  integerAt(object, "version", "$", issues, 1);
  stringAt(object, "name", "$", issues);
  stringAt(object, "purpose", "$", issues);
  stringAt(object, "system_prompt", "$", issues);
  stringArrayAt(object, "capabilities", "$", issues, { minItems: 1, unique: true });
  stringArrayAt(object, "source_kinds", "$", issues, { minItems: 1, unique: true });
  stringArrayAt(object, "action_kinds", "$", issues, { unique: true });
  booleanAt(object, "enabled", "$", issues);
  timestampAt(object, "created_at", "$", issues);
  timestampAt(object, "updated_at", "$", issues);
  return finish(input, issues);
}

export function validateProviderConnection(input: unknown): ValidationResult<ProviderConnection> {
  const issues: ValidationIssue[] = [];
  const object = recordAt(input, "$", issues);
  if (!object) return finish(input, issues);
  stringAt(object, "schema", "$", issues, { exact: PROVIDER_CONNECTION_SCHEMA });
  stringAt(object, "connection_id", "$", issues);
  stringAt(object, "user_id", "$", issues);
  stringAt(object, "provider", "$", issues);
  stringAt(object, "adapter", "$", issues);
  stringAt(object, "account_ref", "$", issues);
  stringAt(object, "model", "$", issues, { optional: true });
  stringArrayAt(object, "capabilities", "$", issues, { unique: true });
  const status = stringAt(object, "status", "$", issues);
  if (status !== undefined && !["connected", "disabled", "error"].includes(status)) {
    issue(issues, "$.status", "unknown_connection_status", "Unknown connection status");
  }
  jsonObjectAt(object, "metadata", "$", issues);
  timestampAt(object, "created_at", "$", issues);
  timestampAt(object, "updated_at", "$", issues);
  return finish(input, issues);
}

export function validateRun(input: unknown): ValidationResult<Run> {
  const issues: ValidationIssue[] = [];
  const object = recordAt(input, "$", issues);
  if (!object) return finish(input, issues);
  stringAt(object, "schema", "$", issues, { exact: RUN_SCHEMA });
  stringAt(object, "run_id", "$", issues);
  stringAt(object, "user_id", "$", issues);
  stringAt(object, "agent_id", "$", issues);
  integerAt(object, "agent_version", "$", issues, 1);
  stringAt(object, "provider_connection_id", "$", issues);
  stringAt(object, "goal", "$", issues);
  stringArrayAt(object, "input_source_item_ids", "$", issues, { unique: true });
  const status = stringAt(object, "status", "$", issues);
  if (
    status !== undefined &&
    !["queued", "running", "completed", "partial", "failed"].includes(status)
  ) {
    issue(issues, "$.status", "unknown_run_status", "Unknown run status");
  }
  timestampAt(object, "requested_at", "$", issues);
  timestampAt(object, "started_at", "$", issues, true);
  timestampAt(object, "ended_at", "$", issues, true);
  integerAt(object, "last_sequence", "$", issues, 0);

  const terminal = status === "completed" || status === "partial" || status === "failed";
  if (terminal) {
    if (object.ended_at === undefined) {
      issue(issues, "$.ended_at", "terminal_timestamp_required", "Terminal runs require ended_at");
    }
    if (object.completion === undefined) {
      issue(issues, "$.completion", "completion_required", "Terminal runs require completion data");
    } else {
      validateRunCompletion(object.completion, status, "$.completion", issues);
    }
  } else {
    if (object.ended_at !== undefined) {
      issue(issues, "$.ended_at", "premature_terminal_timestamp", "Non-terminal runs cannot have ended_at");
    }
    if (object.completion !== undefined) {
      issue(issues, "$.completion", "premature_completion", "Non-terminal runs cannot have completion data");
    }
  }
  if ((status === "running" || terminal) && object.started_at === undefined) {
    issue(issues, "$.started_at", "started_timestamp_required", "Started runs require started_at");
  }
  return finish(input, issues);
}

function validateProducer(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): Record<string, unknown> | undefined {
  const producer = recordAt(value, path, issues);
  if (!producer) return undefined;
  stringAt(producer, "connection_id", path, issues);
  stringAt(producer, "provider", path, issues);
  stringAt(producer, "external_agent_id", path, issues, { optional: true });
  return producer;
}

function validateRunRef(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): Record<string, unknown> | undefined {
  const run = recordAt(value, path, issues);
  if (!run) return undefined;
  stringAt(run, "external_id", path, issues);
  stringAt(run, "agent_key", path, issues);
  stringAt(run, "trigger", path, issues, { optional: true });
  return run;
}

export function validateEventEnvelope<TData = JsonObject>(
  input: unknown,
): ValidationResult<EventEnvelope<TData>> {
  const issues: ValidationIssue[] = [];
  const object = recordAt(input, "$", issues);
  if (!object) return finish(input, issues);
  stringAt(object, "schema", "$", issues, { exact: EVENT_SCHEMA });
  stringAt(object, "event_id", "$", issues);
  stringAt(object, "idempotency_key", "$", issues);
  timestampAt(object, "occurred_at", "$", issues);
  const envelopeProducer = validateProducer(object.producer, "$.producer", issues);
  const envelopeRun = validateRunRef(object.run, "$.run", issues);
  integerAt(object, "sequence", "$", issues, 1);
  const kind = stringAt(object, "kind", "$", issues);
  const data = recordAt(object.data, "$.data", issues);
  if (data) {
    try {
      canonicalJson(data);
    } catch (error) {
      issue(
        issues,
        "$.data",
        "invalid_json_value",
        error instanceof Error ? error.message : "Invalid JSON value",
      );
    }
  }
  const envelopeSources = embeddedSourceArrayAt(object, "sources", "$", issues) ?? [];

  if (kind === "run.started") {
    if (data) stringAt(data, "status", "$.data", issues, { exact: "running" });
  } else if (kind === "run.completed") {
    validateRunCompletion(data, "completed", "$.data", issues);
  } else if (kind === "run.partial") {
    validateRunCompletion(data, "partial", "$.data", issues);
  } else if (kind === "run.failed") {
    validateRunCompletion(data, "failed", "$.data", issues);
  } else if (
    data &&
    (data.status === "completed" || data.status === "partial" || data.status === "failed")
  ) {
    issue(
      issues,
      "$.kind",
      "terminal_kind_required",
      `Terminal status ${JSON.stringify(data.status)} requires kind run.${data.status}`,
    );
  }

  if (kind === "feed.item.published" || kind === "feed.item.updated") {
    if (data) {
      const feedItem = appendNestedIssues(
        validateFeedItem(data.feed_item),
        "$.data.feed_item",
        issues,
      );
      if (feedItem && !sameSourceIds(feedItem.sources, envelopeSources)) {
        issue(
          issues,
          "$.sources",
          "event_source_mismatch",
          "Envelope embedded source IDs must exactly cover feed item source IDs",
        );
      }
      if (feedItem && envelopeRun) {
        const bindings = [
          ["run_id", feedItem.run_id, "external_id"],
          ["agent_id", feedItem.agent_id, "agent_key"],
        ] as const;
        bindings.forEach(([entityField, entityValue, envelopeField]) => {
          if (envelopeRun[envelopeField] !== entityValue) {
            issue(
              issues,
              `$.data.feed_item.${entityField}`,
              "event_run_binding_mismatch",
              `Feed item ${entityField} must match envelope run.${envelopeField}`,
            );
          }
        });
      }
      if (kind === "feed.item.published" && feedItem?.revision !== 1) {
        issue(issues, "$.data.feed_item.revision", "invalid_initial_revision", "Published feed item revision must be 1");
      }
      if (kind === "feed.item.updated") {
        const previous = integerAt(data, "previous_revision", "$.data", issues, 1);
        if (feedItem && previous !== undefined && feedItem.revision !== previous + 1) {
          issue(
            issues,
            "$.data.feed_item.revision",
            "invalid_feed_revision",
            "Updated feed item revision must equal previous_revision + 1",
          );
        }
      }
    }
  } else if (kind === "feed.item.withdrawn") {
    if (data) {
      stringAt(data, "feed_item_id", "$.data", issues);
      integerAt(data, "feed_item_revision", "$.data", issues, 1);
      stringAt(data, "reason", "$.data", issues);
      actorAt(data.withdrawn_by, "$.data.withdrawn_by", issues);
    }
  } else if (kind === "action.proposed") {
    if (data) {
      const proposal = appendNestedIssues(
        validateActionProposal(data.proposal),
        "$.data.proposal",
        issues,
      );
      if (proposal && !sameSourceIds(proposal.sources, envelopeSources)) {
        issue(
          issues,
          "$.sources",
          "event_source_mismatch",
          "Envelope embedded source IDs must exactly cover action proposal source IDs",
        );
      }
      if (proposal && envelopeRun) {
        const bindings = [
          ["run_id", proposal.run_id, "external_id"],
          ["agent_id", proposal.agent_id, "agent_key"],
        ] as const;
        bindings.forEach(([entityField, entityValue, envelopeField]) => {
          if (envelopeRun[envelopeField] !== entityValue) {
            issue(
              issues,
              `$.data.proposal.${entityField}`,
              "event_run_binding_mismatch",
              `Action proposal ${entityField} must match envelope run.${envelopeField}`,
            );
          }
        });
      }
      if (
        proposal &&
        envelopeProducer &&
        proposal.provider_connection_id !== envelopeProducer.connection_id
      ) {
        issue(
          issues,
          "$.data.proposal.provider_connection_id",
          "event_producer_binding_mismatch",
          "Action proposal provider_connection_id must match envelope producer.connection_id",
        );
      }
    }
  } else if (kind === "action.approval_decided") {
    if (data) {
      appendNestedIssues(
        validateApprovalDecision(data.decision),
        "$.data.decision",
        issues,
      );
    }
  } else if (kind === "action.execution_receipt.recorded") {
    if (data) {
      const receipt = appendNestedIssues(
        validateExecutionReceipt(data.receipt),
        "$.data.receipt",
        issues,
      );
      if (
        receipt &&
        envelopeProducer &&
        receipt.provider_connection_id !== envelopeProducer.connection_id
      ) {
        issue(
          issues,
          "$.data.receipt.provider_connection_id",
          "event_producer_binding_mismatch",
          "Receipt provider_connection_id must match envelope producer.connection_id",
        );
      }
    }
  } else if (kind === "feedback.recorded") {
    if (data) {
      stringAt(data, "feedback_id", "$.data", issues);
      stringAt(data, "feed_item_id", "$.data", issues);
      stringAt(data, "feedback_kind", "$.data", issues);
      actorAt(data.recorded_by, "$.data.recorded_by", issues);
      if (data.value === undefined) {
        issue(issues, "$.data.value", "value_required", "Feedback value is required");
      } else {
        try {
          canonicalJson(data.value);
        } catch (error) {
          issue(
            issues,
            "$.data.value",
            "invalid_json_value",
            error instanceof Error ? error.message : "Invalid JSON value",
          );
        }
      }
    }
  }
  return finish(input, issues);
}

export function validateSourceItem(input: unknown): ValidationResult<SourceItem> {
  const issues: ValidationIssue[] = [];
  const object = recordAt(input, "$", issues);
  if (!object) return finish(input, issues);
  stringAt(object, "schema", "$", issues, { exact: SOURCE_ITEM_SCHEMA });
  stringAt(object, "source_item_id", "$", issues);
  stringAt(object, "user_id", "$", issues);
  stringAt(object, "provider_connection_id", "$", issues);
  stringAt(object, "provider", "$", issues);
  stringAt(object, "source_kind", "$", issues);
  stringAt(object, "external_id", "$", issues);
  stringAt(object, "thread_id", "$", issues, { optional: true });
  stringAt(object, "title", "$", issues, { optional: true });
  stringAt(object, "content", "$", issues);
  stringAt(object, "url", "$", issues, { optional: true });
  timestampAt(object, "occurred_at", "$", issues);
  timestampAt(object, "captured_at", "$", issues);
  jsonObjectAt(object, "metadata", "$", issues);
  return finish(input, issues);
}

function claimAt(value: unknown, path: string, issues: ValidationIssue[]): Claim | undefined {
  const claim = recordAt(value, path, issues);
  if (!claim) return undefined;
  stringAt(claim, "claim_id", path, issues);
  stringAt(claim, "kind", path, issues);
  stringAt(claim, "text", path, issues);
  sourceArrayAt(claim, "source_refs", path, issues, 1);
  if (claim.confidence !== undefined) {
    if (
      typeof claim.confidence !== "number" ||
      !Number.isFinite(claim.confidence) ||
      claim.confidence < 0 ||
      claim.confidence > 1
    ) {
      issue(issues, `${path}.confidence`, "invalid_confidence", "Confidence must be between 0 and 1");
    }
  }
  return claim as unknown as Claim;
}

export function validateFeedItem(input: unknown): ValidationResult<FeedItem> {
  const issues: ValidationIssue[] = [];
  const object = recordAt(input, "$", issues);
  if (!object) return finish(input, issues);
  stringAt(object, "schema", "$", issues, { exact: FEED_ITEM_SCHEMA });
  stringAt(object, "feed_item_id", "$", issues);
  stringAt(object, "user_id", "$", issues);
  stringAt(object, "run_id", "$", issues);
  stringAt(object, "agent_id", "$", issues);
  integerAt(object, "revision", "$", issues, 1);
  stringAt(object, "title", "$", issues);
  stringAt(object, "summary", "$", issues);
  const lane = stringAt(object, "lane", "$", issues);
  if (
    lane !== undefined &&
    !["needs_you", "handled", "watching", "digest"].includes(lane)
  ) {
    issue(issues, "$.lane", "unknown_feed_lane", "Unknown feed lane");
  }
  stringAt(object, "why_it_matters", "$", issues);
  if (object.confidence !== undefined) {
    if (
      typeof object.confidence !== "number" ||
      !Number.isFinite(object.confidence) ||
      object.confidence < 0 ||
      object.confidence > 1
    ) {
      issue(issues, "$.confidence", "invalid_confidence", "Confidence must be between 0 and 1");
    }
  }
  const feedSources = sourceArrayAt(object, "sources", "$", issues, 1) ?? [];
  const sourceKeys = new Set(feedSources.map(sourceReferenceKey));

  if (!Array.isArray(object.claims)) {
    issue(issues, "$.claims", "expected_array", "Expected an array");
  } else {
    if (object.claims.length === 0) {
      issue(issues, "$.claims", "claim_required", "Feed items require at least one sourced claim");
    }
    const claims = object.claims
      .map((item, index) => claimAt(item, `$.claims[${index}]`, issues))
      .filter((item): item is Claim => item !== undefined);
    const claimIds = claims.map((claim) => claim.claim_id);
    if (new Set(claimIds).size !== claimIds.length) {
      issue(issues, "$.claims", "duplicate_claim_id", "Claim IDs must be unique");
    }
    claims.forEach((claim, claimIndex) => {
      claim.source_refs.forEach((source, sourceIndex) => {
        if (!sourceKeys.has(sourceReferenceKey(source))) {
          issue(
            issues,
            `$.claims[${claimIndex}].source_refs[${sourceIndex}]`,
            "claim_source_not_listed",
            "Every claim source must exactly match a FeedItem.sources reference",
          );
        }
      });
    });
  }
  const status = stringAt(object, "status", "$", issues);
  if (status !== undefined && !["unread", "saved", "dismissed", "handled"].includes(status)) {
    issue(issues, "$.status", "unknown_feed_status", "Unknown feed status");
  }
  timestampAt(object, "created_at", "$", issues);
  return finish(input, issues);
}

/**
 * Storage-boundary provenance check. The base FeedItem validator proves every
 * claim cites FeedItem.sources; this function additionally proves those AFI
 * source IDs exist for the same user and quoted excerpts occur in source text.
 */
export function validateFeedItemWithSourceItems(
  feedInput: unknown,
  sourceInputs: readonly unknown[],
): ValidationResult<FeedItem> {
  const feedResult = validateFeedItem(feedInput);
  const issues: ValidationIssue[] = feedResult.ok ? [] : [...feedResult.issues];
  const sources = sourceInputs
    .map((source, index) =>
      appendNestedIssues(validateSourceItem(source), `$.source_items[${index}]`, issues),
    )
    .filter((source): source is SourceItem => source !== undefined);
  const byId = new Map<string, SourceItem>();
  sources.forEach((source, index) => {
    if (byId.has(source.source_item_id)) {
      issue(
        issues,
        `$.source_items[${index}].source_item_id`,
        "duplicate_source_item_id",
        "SourceItem IDs must be unique",
      );
    } else {
      byId.set(source.source_item_id, source);
    }
  });

  if (feedResult.ok) {
    feedResult.value.sources.forEach((reference, index) => {
      const source = byId.get(reference.source_item_id);
      if (!source) {
        issue(
          issues,
          `$.sources[${index}].source_item_id`,
          "source_item_not_found",
          "SourceReference must resolve to SourceItem.source_item_id",
        );
        return;
      }
      if (source.user_id !== feedResult.value.user_id) {
        issue(
          issues,
          `$.sources[${index}].source_item_id`,
          "source_owner_mismatch",
          "Feed item and source item must have the same user_id",
        );
      }
      if (reference.excerpt !== undefined && !source.content.includes(reference.excerpt)) {
        issue(
          issues,
          `$.sources[${index}].excerpt`,
          "unsupported_source_excerpt",
          "Quoted source excerpt must occur verbatim in SourceItem.content",
        );
      }
    });
  }

  return feedResult.ok
    ? finish(feedResult.value, issues)
    : { ok: false, issues };
}

export function validateActionProposal(input: unknown): ValidationResult<ActionProposal> {
  const issues: ValidationIssue[] = [];
  const object = recordAt(input, "$", issues);
  if (!object) return finish(input, issues);
  stringAt(object, "schema", "$", issues, { exact: ACTION_PROPOSAL_SCHEMA });
  stringAt(object, "action_id", "$", issues);
  integerAt(object, "revision", "$", issues, 1);
  stringAt(object, "user_id", "$", issues);
  stringAt(object, "run_id", "$", issues);
  stringAt(object, "agent_id", "$", issues);
  stringAt(object, "provider_connection_id", "$", issues);
  stringAt(object, "action_kind", "$", issues);
  stringAt(object, "rationale", "$", issues);
  const payload = jsonObjectAt(object, "payload", "$", issues);
  const payloadHash = stringAt(object, "payload_hash", "$", issues);
  if (payloadHash !== undefined && !isPayloadHash(payloadHash)) {
    issue(issues, "$.payload_hash", "invalid_payload_hash", "Expected sha256:<64 lowercase hex chars>");
  }
  if (payload !== undefined && payloadHash !== undefined) {
    const expected = hashActionPayload(payload);
    if (payloadHash !== expected) {
      issue(
        issues,
        "$.payload_hash",
        "payload_hash_mismatch",
        "payload_hash must exactly match canonical action payload bytes",
      );
    }
  }
  actorAt(object.proposed_by, "$.proposed_by", issues);
  timestampAt(object, "proposed_at", "$", issues);
  timestampAt(object, "expires_at", "$", issues, true);
  sourceArrayAt(object, "sources", "$", issues, 1);
  stringAt(object, "status", "$", issues, { exact: "proposed" });
  return finish(input, issues);
}

export function validateApprovalDecision(input: unknown): ValidationResult<ApprovalDecision> {
  const issues: ValidationIssue[] = [];
  const object = recordAt(input, "$", issues);
  if (!object) return finish(input, issues);
  stringAt(object, "schema", "$", issues, { exact: APPROVAL_DECISION_SCHEMA });
  stringAt(object, "decision_id", "$", issues);
  stringAt(object, "action_id", "$", issues);
  integerAt(object, "action_revision", "$", issues, 1);
  const payloadHash = stringAt(object, "payload_hash", "$", issues);
  if (payloadHash !== undefined && !isPayloadHash(payloadHash)) {
    issue(issues, "$.payload_hash", "invalid_payload_hash", "Expected sha256:<64 lowercase hex chars>");
  }
  const decision = stringAt(object, "decision", "$", issues);
  if (decision !== undefined && !["approved", "rejected"].includes(decision)) {
    issue(issues, "$.decision", "unknown_decision", "Decision must be approved or rejected");
  }
  const actor = actorAt(object.decided_by, "$.decided_by", issues);
  if (actor && actor.actor_type !== "user") {
    issue(
      issues,
      "$.decided_by.actor_type",
      "approval_actor_must_be_user",
      "Providers, agents, and services cannot approve their own proposals",
    );
  }
  timestampAt(object, "decided_at", "$", issues);
  timestampAt(object, "valid_until", "$", issues, true);
  stringAt(object, "reason", "$", issues, { optional: true });
  return finish(input, issues);
}

export function validateApprovalForProposal(
  proposalInput: unknown,
  decisionInput: unknown,
  now: string,
): ValidationResult<ApprovalDecision> {
  const proposalResult = validateActionProposal(proposalInput);
  const decisionResult = validateApprovalDecision(decisionInput);
  const issues: ValidationIssue[] = [
    ...(proposalResult.ok ? [] : proposalResult.issues),
    ...(decisionResult.ok ? [] : decisionResult.issues),
  ];
  const nowObject = { now };
  const nowIssues: ValidationIssue[] = [];
  timestampAt(nowObject, "now", "$", nowIssues);
  issues.push(...nowIssues);
  if (!proposalResult.ok || !decisionResult.ok || nowIssues.length > 0) {
    return { ok: false, issues };
  }

  const proposal = proposalResult.value;
  const decision = decisionResult.value;
  if (decision.action_id !== proposal.action_id) {
    issue(issues, "$.action_id", "action_id_mismatch", "Approval targets a different action");
  }
  if (decision.action_revision !== proposal.revision) {
    issue(issues, "$.action_revision", "stale_action_revision", "Approval targets a stale action revision");
  }
  if (decision.payload_hash !== proposal.payload_hash) {
    issue(issues, "$.payload_hash", "payload_hash_mismatch", "Approval does not bind the exact proposed payload");
  }
  if (decision.decided_by.actor_id !== proposal.user_id) {
    issue(issues, "$.decided_by.actor_id", "wrong_approver", "Only the proposal owner may decide");
  }
  if (decision.decided_by.actor_id === proposal.proposed_by.actor_id) {
    issue(issues, "$.decided_by.actor_id", "self_approval_forbidden", "Proposal author cannot self-approve");
  }
  if (Date.parse(decision.decided_at) < Date.parse(proposal.proposed_at)) {
    issue(issues, "$.decided_at", "decision_predates_proposal", "Decision cannot predate proposal");
  }
  if (
    proposal.expires_at !== undefined &&
    (Date.parse(decision.decided_at) > Date.parse(proposal.expires_at) ||
      Date.parse(now) > Date.parse(proposal.expires_at))
  ) {
    issue(issues, "$.expires_at", "stale_approval", "Proposal expired before execution");
  }
  if (decision.valid_until !== undefined && Date.parse(now) > Date.parse(decision.valid_until)) {
    issue(issues, "$.valid_until", "stale_approval", "Approval is no longer valid");
  }
  return finish(decision, issues);
}

export function validateExecutionReceipt(input: unknown): ValidationResult<ExecutionReceipt> {
  const issues: ValidationIssue[] = [];
  const object = recordAt(input, "$", issues);
  if (!object) return finish(input, issues);
  stringAt(object, "schema", "$", issues, { exact: EXECUTION_RECEIPT_SCHEMA });
  stringAt(object, "receipt_id", "$", issues);
  stringAt(object, "action_id", "$", issues);
  integerAt(object, "action_revision", "$", issues, 1);
  const payloadHash = stringAt(object, "payload_hash", "$", issues);
  if (payloadHash !== undefined && !isPayloadHash(payloadHash)) {
    issue(issues, "$.payload_hash", "invalid_payload_hash", "Expected sha256:<64 lowercase hex chars>");
  }
  stringAt(object, "provider_connection_id", "$", issues);
  const status = stringAt(object, "status", "$", issues);
  if (
    status !== undefined &&
    !["provider_acknowledged", "delivered", "read", "failed"].includes(status)
  ) {
    issue(issues, "$.status", "unknown_receipt_status", "Unknown execution proof status");
  }
  timestampAt(object, "occurred_at", "$", issues);
  const evidence = recordAt(object.evidence, "$.evidence", issues);
  if (evidence) {
    stringAt(evidence, "source", "$.evidence", issues);
    stringAt(evidence, "external_id", "$.evidence", issues);
    jsonObjectAt(evidence, "detail", "$.evidence", issues, true);
  }
  return finish(input, issues);
}

export class ProtocolValidationError extends Error {
  readonly issues: ValidationIssue[];

  constructor(label: string, issues: ValidationIssue[]) {
    super(`${label} failed validation: ${issues.map((entry) => `${entry.path} ${entry.message}`).join("; ")}`);
    this.name = "ProtocolValidationError";
    this.issues = issues;
  }
}

export function assertValid<T>(result: ValidationResult<T>, label = "Protocol value"): T {
  if (!result.ok) throw new ProtocolValidationError(label, result.issues);
  return result.value;
}

export type TerminalRunEventData = RunCompletedData | RunPartialData | RunFailedData;
