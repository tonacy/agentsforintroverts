import { canonicalJson, isCanonicalHash } from "./canonical.js";
import {
  hashContextPack,
  hashEntityRecord,
  hashLedgerEvent,
  makeLedgerEventKind,
} from "./context-canonical.js";
import {
  CONTEXT_PACK_SCHEMA,
  CONTEXT_PACK_RECEIPT_SCHEMA,
  CONTEXT_STATEMENT_SCHEMA,
  CONVERSATION_SCHEMA,
  DECISION_SCHEMA,
  DRAFT_SCHEMA,
  EVIDENCE_ITEM_SCHEMA,
  FEEDBACK_SIGNAL_SCHEMA,
  LEDGER_ENTITY_TYPES,
  LEDGER_EVENT_SCHEMA,
  PLACE_SCHEMA,
  SCRATCH_CUE_SCHEMA,
  SELECTION_RUN_SCHEMA,
  THREAD_SCHEMA,
  type AuthorityDecision,
  type ContextPack,
  type ContextPackReceipt,
  type ContextStatement,
  type Conversation,
  type Decision,
  type Draft,
  type EntityRef,
  type EvidenceItem,
  type FeedbackSignal,
  type LedgerAuthority,
  type LedgerEntity,
  type LedgerEntityType,
  type LedgerEvent,
  type Place,
  type RecordProvenance,
  type RetentionPolicy,
  type ScratchCue,
  type SelectionRun,
  type Thread,
} from "./context-types.js";
import type {
  ActorRef,
  ApprovalDecision,
  EventProducer,
  ExecutionReceipt,
  JsonObject,
  ValidationIssue,
  ValidationResult,
} from "./types.js";
import {
  validateApprovalDecision,
  validateExecutionReceipt,
} from "./validation.js";

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

function issue(
  issues: ValidationIssue[],
  path: string,
  code: string,
  message: string,
): void {
  issues.push({ path, code, message });
}

function finish<T>(value: unknown, issues: ValidationIssue[]): ValidationResult<T> {
  return issues.length === 0
    ? { ok: true, value: value as T }
    : { ok: false, issues };
}

function objectAt(
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
  optional = false,
): string | undefined {
  const value = object[key];
  if (value === undefined && optional) return undefined;
  if (typeof value !== "string" || value.trim().length === 0) {
    issue(issues, `${path}.${key}`, "expected_nonempty_string", "Expected a non-empty string");
    return undefined;
  }
  return value;
}

function literalAt(
  object: Record<string, unknown>,
  key: string,
  expected: string | boolean,
  path: string,
  issues: ValidationIssue[],
): void {
  if (object[key] !== expected) {
    issue(
      issues,
      `${path}.${key}`,
      "unexpected_literal",
      `Expected ${JSON.stringify(expected)}`,
    );
  }
}

function integerAt(
  object: Record<string, unknown>,
  key: string,
  path: string,
  issues: ValidationIssue[],
  minimum = 0,
  optional = false,
): number | undefined {
  const value = object[key];
  if (value === undefined && optional) return undefined;
  if (!Number.isInteger(value) || (value as number) < minimum) {
    issue(issues, `${path}.${key}`, "expected_integer", `Expected an integer >= ${minimum}`);
    return undefined;
  }
  return value as number;
}

function numberAt(
  object: Record<string, unknown>,
  key: string,
  path: string,
  issues: ValidationIssue[],
  optional = false,
): number | undefined {
  const value = object[key];
  if (value === undefined && optional) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    issue(issues, `${path}.${key}`, "expected_number", "Expected a finite number");
    return undefined;
  }
  return value;
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

/** Accepts canonical ULIDs and UUIDv7s, both lexically/time sortable. */
export function isTimeSortableId(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const ulid = /^(?:[a-z][a-z0-9_-]*_)?[0-9A-HJKMNP-TV-Z]{26}$/i;
  const uuidV7 = /^(?:[a-z][a-z0-9_-]*_)?[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return ulid.test(value) || uuidV7.test(value);
}

function enumAt<T extends string>(
  object: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
  path: string,
  issues: ValidationIssue[],
  optional = false,
): T | undefined {
  const value = stringAt(object, key, path, issues, optional);
  if (value !== undefined && !allowed.includes(value as T)) {
    issue(
      issues,
      `${path}.${key}`,
      "unexpected_enum_value",
      `Expected one of ${allowed.join(", ")}`,
    );
    return undefined;
  }
  return value as T | undefined;
}

function stringArrayAt(
  object: Record<string, unknown>,
  key: string,
  path: string,
  issues: ValidationIssue[],
  minimum = 0,
): string[] {
  const value = object[key];
  if (!Array.isArray(value)) {
    issue(issues, `${path}.${key}`, "expected_array", "Expected an array");
    return [];
  }
  if (value.length < minimum) {
    issue(issues, `${path}.${key}`, "too_few_items", `Expected at least ${minimum} item(s)`);
  }
  const output: string[] = [];
  value.forEach((entry, index) => {
    if (typeof entry !== "string" || entry.trim().length === 0) {
      issue(
        issues,
        `${path}.${key}[${index}]`,
        "expected_nonempty_string",
        "Expected a non-empty string",
      );
    } else {
      output.push(entry);
    }
  });
  if (new Set(output).size !== output.length) {
    issue(issues, `${path}.${key}`, "duplicate_value", "Values must be unique");
  }
  return output;
}

function jsonValueAt(
  object: Record<string, unknown>,
  key: string,
  path: string,
  issues: ValidationIssue[],
): void {
  if (object[key] === undefined) {
    issue(issues, `${path}.${key}`, "value_required", "A JSON value is required");
    return;
  }
  try {
    canonicalJson(object[key]);
  } catch (error) {
    issue(
      issues,
      `${path}.${key}`,
      "invalid_json_value",
      error instanceof Error ? error.message : "Invalid JSON value",
    );
  }
}

function jsonObjectAt(
  object: Record<string, unknown>,
  key: string,
  path: string,
  issues: ValidationIssue[],
): JsonObject | undefined {
  const value = objectAt(object[key], `${path}.${key}`, issues);
  if (!value) return undefined;
  try {
    canonicalJson(value);
  } catch (error) {
    issue(
      issues,
      `${path}.${key}`,
      "invalid_json_value",
      error instanceof Error ? error.message : "Invalid JSON value",
    );
  }
  return value as JsonObject;
}

function actorAt(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): ActorRef | undefined {
  const actor = objectAt(value, path, issues);
  if (!actor) return undefined;
  stringAt(actor, "actor_id", path, issues);
  enumAt(actor, "actor_type", ["user", "agent", "provider", "system", "service"], path, issues);
  stringAt(actor, "display_name", path, issues, true);
  return actor as unknown as ActorRef;
}

function entityRefAt<T extends string = string>(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  expectedType?: T,
): EntityRef<T> | undefined {
  const ref = objectAt(value, path, issues);
  if (!ref) return undefined;
  const entityType = stringAt(ref, "entity_type", path, issues);
  if (expectedType !== undefined && entityType !== undefined && entityType !== expectedType) {
    issue(issues, `${path}.entity_type`, "entity_type_mismatch", `Expected ${expectedType}`);
  }
  stringAt(ref, "entity_id", path, issues);
  integerAt(ref, "revision", path, issues, 1, true);
  const recordHash = stringAt(ref, "record_hash", path, issues, true);
  if (recordHash !== undefined && !isCanonicalHash(recordHash)) {
    issue(issues, `${path}.record_hash`, "invalid_hash", "Expected sha256:<64 lowercase hex chars>");
  }
  return ref as unknown as EntityRef<T>;
}

function entityRefArrayAt<T extends string = string>(
  object: Record<string, unknown>,
  key: string,
  path: string,
  issues: ValidationIssue[],
  expectedType?: T,
  minimum = 0,
): EntityRef<T>[] {
  const value = object[key];
  if (!Array.isArray(value)) {
    issue(issues, `${path}.${key}`, "expected_array", "Expected an array");
    return [];
  }
  if (value.length < minimum) {
    issue(issues, `${path}.${key}`, "too_few_items", `Expected at least ${minimum} item(s)`);
  }
  const refs = value
    .map((entry, index) =>
      entityRefAt(entry, `${path}.${key}[${index}]`, issues, expectedType),
    )
    .filter((entry): entry is EntityRef<T> => entry !== undefined);
  const keys = refs.map((ref) => `${ref.entity_type}:${ref.entity_id}:${ref.revision ?? ""}`);
  if (new Set(keys).size !== keys.length) {
    issue(issues, `${path}.${key}`, "duplicate_reference", "Entity references must be unique");
  }
  return refs;
}

function externalRefAt(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  const ref = objectAt(value, path, issues);
  if (!ref) return;
  stringAt(ref, "provider", path, issues);
  stringAt(ref, "kind", path, issues);
  stringAt(ref, "external_id", path, issues);
  stringAt(ref, "uri", path, issues, true);
  timestampAt(ref, "observed_at", path, issues, true);
}

function externalRefArrayAt(
  object: Record<string, unknown>,
  key: string,
  path: string,
  issues: ValidationIssue[],
): void {
  const value = object[key];
  if (!Array.isArray(value)) {
    issue(issues, `${path}.${key}`, "expected_array", "Expected an array");
    return;
  }
  value.forEach((entry, index) => externalRefAt(entry, `${path}.${key}[${index}]`, issues));
}

function provenanceAt(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): RecordProvenance | undefined {
  const provenance = objectAt(value, path, issues);
  if (!provenance) return undefined;
  enumAt(provenance, "basis", ["explicit", "observed", "inferred", "derived"], path, issues);
  entityRefArrayAt(provenance, "evidence_refs", path, issues, "evidence_item");
  entityRefArrayAt(provenance, "human_seed_refs", path, issues);
  entityRefArrayAt(provenance, "derived_from_refs", path, issues);
  externalRefArrayAt(provenance, "external_refs", path, issues);
  const confidence = numberAt(provenance, "confidence", path, issues, true);
  if (confidence !== undefined && (confidence < 0 || confidence > 1)) {
    issue(issues, `${path}.confidence`, "invalid_confidence", "Confidence must be between 0 and 1");
  }
  timestampAt(provenance, "recorded_at", path, issues);
  return provenance as unknown as RecordProvenance;
}

function retentionAt(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): RetentionPolicy | undefined {
  const retention = objectAt(value, path, issues);
  if (!retention) return undefined;
  enumAt(retention, "classification", ["private", "eligible_shared", "public"], path, issues);
  const mode = enumAt(retention, "mode", ["durable", "ttl"], path, issues);
  enumAt(retention, "replication", ["local_only", "eligible", "replicated"], path, issues);
  enumAt(retention, "body_storage", ["inline", "encrypted_object", "reference_only"], path, issues);
  const expiresAt = timestampAt(retention, "expires_at", path, issues, true);
  if (mode === "ttl" && expiresAt === undefined) {
    issue(issues, `${path}.expires_at`, "ttl_requires_expiration", "TTL retention requires expires_at");
  }
  return retention as unknown as RetentionPolicy;
}

interface BaseValidation {
  object: Record<string, unknown>;
  createdBy?: ActorRef;
  lastModifiedBy?: ActorRef;
  provenance?: RecordProvenance;
  retention?: RetentionPolicy;
}

function validateEntityBase(
  input: unknown,
  schema: string,
  entityType: LedgerEntityType,
  issues: ValidationIssue[],
): BaseValidation | undefined {
  const object = objectAt(input, "$", issues);
  if (!object) return undefined;
  literalAt(object, "schema", schema, "$", issues);
  literalAt(object, "entity_type", entityType, "$", issues);
  stringAt(object, "entity_id", "$", issues);
  stringAt(object, "owner_id", "$", issues);
  integerAt(object, "revision", "$", issues, 1);
  const recordHash = stringAt(object, "record_hash", "$", issues);
  if (recordHash !== undefined && !isCanonicalHash(recordHash)) {
    issue(issues, "$.record_hash", "invalid_hash", "Expected sha256:<64 lowercase hex chars>");
  }
  const createdAt = timestampAt(object, "created_at", "$", issues);
  const updatedAt = timestampAt(object, "updated_at", "$", issues);
  if (createdAt !== undefined && updatedAt !== undefined && Date.parse(updatedAt) < Date.parse(createdAt)) {
    issue(issues, "$.updated_at", "updated_before_created", "updated_at cannot predate created_at");
  }
  const createdBy = actorAt(object.created_by, "$.created_by", issues);
  const lastModifiedBy = actorAt(object.last_modified_by, "$.last_modified_by", issues);
  const provenance = provenanceAt(object.provenance, "$.provenance", issues);
  const retention = retentionAt(object.retention, "$.retention", issues);
  if (recordHash !== undefined && isCanonicalHash(recordHash)) {
    try {
      if (recordHash !== hashEntityRecord(object)) {
        issue(issues, "$.record_hash", "record_hash_mismatch", "record_hash must bind the exact canonical entity snapshot");
      }
    } catch (error) {
      issue(
        issues,
        "$",
        "invalid_json_value",
        error instanceof Error ? error.message : "Invalid JSON value",
      );
    }
  }
  return { object, createdBy, lastModifiedBy, provenance, retention };
}

export function validateEvidenceItem(input: unknown): ValidationResult<EvidenceItem> {
  const issues: ValidationIssue[] = [];
  const base = validateEntityBase(input, EVIDENCE_ITEM_SCHEMA, "evidence_item", issues);
  if (!base) return finish(input, issues);
  const { object } = base;
  enumAt(object, "evidence_kind", ["human_capture", "public_source", "work_artifact", "provider_receipt", "conversation_receipt", "other"], "$", issues);
  stringAt(object, "title", "$", issues);
  stringAt(object, "summary", "$", issues);
  timestampAt(object, "occurred_at", "$", issues, true);
  timestampAt(object, "captured_at", "$", issues);
  stringAt(object, "content", "$", issues, true);
  stringAt(object, "source_uri", "$", issues, true);
  if (object.content_object !== undefined) {
    const contentObject = objectAt(object.content_object, "$.content_object", issues);
    if (contentObject) {
      stringAt(contentObject, "object_id", "$.content_object", issues);
      const contentHash = stringAt(contentObject, "content_hash", "$.content_object", issues);
      if (contentHash !== undefined && !isCanonicalHash(contentHash)) {
        issue(issues, "$.content_object.content_hash", "invalid_hash", "Expected a canonical SHA-256 hash");
      }
      if (typeof contentObject.encrypted !== "boolean") {
        issue(issues, "$.content_object.encrypted", "expected_boolean", "Expected a boolean");
      }
      stringAt(contentObject, "media_type", "$.content_object", issues, true);
      integerAt(contentObject, "byte_length", "$.content_object", issues, 0, true);
    }
  }
  if (object.content === undefined && object.content_object === undefined && object.source_uri === undefined) {
    issue(issues, "$", "evidence_content_required", "Evidence requires content, content_object, or source_uri");
  }
  jsonObjectAt(object, "metadata", "$", issues);
  return finish(input, issues);
}

export function validateContextStatement(input: unknown): ValidationResult<ContextStatement> {
  const issues: ValidationIssue[] = [];
  const base = validateEntityBase(input, CONTEXT_STATEMENT_SCHEMA, "context_statement", issues);
  if (!base) return finish(input, issues);
  const { object, createdBy, provenance } = base;
  const basis = enumAt(object, "basis", ["explicit", "observed", "inferred"], "$", issues);
  enumAt(object, "status", ["proposed", "active", "contested", "superseded", "expired"], "$", issues);
  stringAt(object, "subject", "$", issues);
  stringAt(object, "predicate", "$", issues);
  jsonValueAt(object, "value", "$", issues);
  const scope = objectAt(object.scope, "$.scope", issues);
  if (scope) {
    const scopeKind = enumAt(scope, "kind", ["person", "project", "domain", "relationship", "global"], "$.scope", issues);
    const scopeId = stringAt(scope, "id", "$.scope", issues, true);
    if (scopeKind !== "global" && scopeId === undefined) {
      issue(issues, "$.scope.id", "scope_id_required", "Non-global context requires a scope id");
    } else if (scopeKind === "global" && scopeId !== undefined) {
      issue(issues, "$.scope.id", "global_scope_id_forbidden", "Global context must not name a narrower scope id");
    }
  }
  const validFrom = timestampAt(object, "valid_from", "$", issues, true);
  const validUntil = timestampAt(object, "valid_until", "$", issues, true);
  if (validFrom && validUntil && Date.parse(validUntil) <= Date.parse(validFrom)) {
    issue(issues, "$.valid_until", "invalid_validity_window", "valid_until must be after valid_from");
  }
  if (object.supersedes !== undefined) {
    entityRefAt(object.supersedes, "$.supersedes", issues, "context_statement");
  }
  if (basis !== undefined && provenance?.basis !== basis) {
    issue(issues, "$.provenance.basis", "basis_mismatch", "Context basis must match provenance basis");
  }
  if (basis === "observed" && (provenance?.evidence_refs.length ?? 0) === 0) {
    issue(issues, "$.provenance.evidence_refs", "observed_context_requires_evidence", "Observed context requires evidence");
  }
  if (basis === "inferred" && provenance?.confidence === undefined) {
    issue(issues, "$.provenance.confidence", "inference_confidence_required", "Inferred context requires confidence");
  }
  if (basis === "explicit" && createdBy?.actor_type !== "user") {
    issue(issues, "$.created_by.actor_type", "explicit_context_requires_user_origin", "Explicit context must name a user as its semantic creator");
  }
  return finish(input, issues);
}

function conversationOutcomeAt(value: unknown, path: string, issues: ValidationIssue[]): void {
  const outcome = objectAt(value, path, issues);
  if (!outcome) return;
  const disposition = enumAt(outcome, "disposition", ["understanding_only", "no_new_input", "context_change_proposed", "decision_recorded", "thread_updated", "place_proposed", "draft_prepared", "change_set_prepared", "external_action_proposed"], path, issues);
  stringAt(outcome, "summary", path, issues);
  stringArrayAt(outcome, "learned", path, issues);
  stringArrayAt(outcome, "uncertainties", path, issues);
  entityRefArrayAt(outcome, "proposed_context_refs", path, issues, "context_statement");
  entityRefArrayAt(outcome, "decision_refs", path, issues, "decision");
  entityRefArrayAt(outcome, "thread_refs", path, issues, "thread");
  entityRefArrayAt(outcome, "place_refs", path, issues, "place");
  entityRefArrayAt(outcome, "draft_refs", path, issues, "draft");
  entityRefArrayAt(outcome, "action_refs", path, issues);
  stringArrayAt(outcome, "carry_forward", path, issues);
  const noActionReason = stringAt(outcome, "no_action_reason", path, issues, true);
  if (
    (disposition === "understanding_only" || disposition === "no_new_input") &&
    noActionReason === undefined
  ) {
    issue(issues, `${path}.no_action_reason`, "no_action_reason_required", "A no-output conversation must explain why no action was created");
  }
}

export function validateConversation(input: unknown): ValidationResult<Conversation> {
  const issues: ValidationIssue[] = [];
  const base = validateEntityBase(input, CONVERSATION_SCHEMA, "conversation", issues);
  if (!base) return finish(input, issues);
  const { object } = base;
  stringAt(object, "purpose", "$", issues);
  enumAt(object, "mode", ["short", "deep", "no_new_input", "other"], "$", issues);
  const startedAt = timestampAt(object, "started_at", "$", issues);
  const endedAt = timestampAt(object, "ended_at", "$", issues, true);
  if (startedAt && endedAt && Date.parse(endedAt) < Date.parse(startedAt)) {
    issue(issues, "$.ended_at", "conversation_time_order", "ended_at cannot predate started_at");
  }
  if (!Array.isArray(object.participants) || object.participants.length === 0) {
    issue(issues, "$.participants", "participants_required", "At least one participant is required");
  } else {
    object.participants.forEach((entry, index) => actorAt(entry, `$.participants[${index}]`, issues));
  }
  stringAt(object, "input_context_pack_id", "$", issues, true);
  enumAt(object, "transcript_retention", ["none", "summary_only", "full_private"], "$", issues);
  entityRefArrayAt(object, "human_seed_refs", "$", issues);
  if (object.outcome !== undefined) conversationOutcomeAt(object.outcome, "$.outcome", issues);
  return finish(input, issues);
}

export function validateDecision(input: unknown): ValidationResult<Decision> {
  const issues: ValidationIssue[] = [];
  const base = validateEntityBase(input, DECISION_SCHEMA, "decision", issues);
  if (!base) return finish(input, issues);
  const { object } = base;
  enumAt(object, "decision_kind", ["context_confirmation", "context_rejection", "priority", "product", "publishing", "retention", "other"], "$", issues);
  stringAt(object, "statement", "$", issues);
  enumAt(object, "status", ["active", "superseded", "reversed"], "$", issues);
  const decidedBy = actorAt(object.decided_by, "$.decided_by", issues);
  if (decidedBy?.actor_type !== "user") {
    issue(issues, "$.decided_by.actor_type", "decision_actor_must_be_user", "Canonical decisions require a user decision maker");
  }
  timestampAt(object, "decided_at", "$", issues);
  timestampAt(object, "effective_until", "$", issues, true);
  entityRefArrayAt(object, "target_refs", "$", issues);
  return finish(input, issues);
}

export function validateThread(input: unknown): ValidationResult<Thread> {
  const issues: ValidationIssue[] = [];
  const base = validateEntityBase(input, THREAD_SCHEMA, "thread", issues);
  if (!base) return finish(input, issues);
  const { object } = base;
  stringAt(object, "title", "$", issues);
  stringAt(object, "summary", "$", issues);
  enumAt(object, "status", ["watching", "active", "quiet", "closed"], "$", issues);
  if (!Array.isArray(object.claims)) {
    issue(issues, "$.claims", "expected_array", "Expected an array");
  } else {
    const claimIds: string[] = [];
    object.claims.forEach((entry, index) => {
      const claim = objectAt(entry, `$.claims[${index}]`, issues);
      if (!claim) return;
      const claimId = stringAt(claim, "claim_id", `$.claims[${index}]`, issues);
      if (claimId) claimIds.push(claimId);
      stringAt(claim, "text", `$.claims[${index}]`, issues);
      entityRefArrayAt(claim, "evidence_refs", `$.claims[${index}]`, issues, "evidence_item", 1);
      const first = timestampAt(claim, "first_seen_at", `$.claims[${index}]`, issues);
      const last = timestampAt(claim, "last_seen_at", `$.claims[${index}]`, issues);
      integerAt(claim, "occurrence_count", `$.claims[${index}]`, issues, 1);
      if (first && last && Date.parse(last) < Date.parse(first)) {
        issue(issues, `$.claims[${index}].last_seen_at`, "invalid_recurrence_window", "last_seen_at cannot predate first_seen_at");
      }
    });
    if (new Set(claimIds).size !== claimIds.length) {
      issue(issues, "$.claims", "duplicate_claim_id", "Thread claim IDs must be unique");
    }
  }
  entityRefArrayAt(object, "context_refs", "$", issues, "context_statement");
  externalRefArrayAt(object, "participant_refs", "$", issues);
  const firstSeen = timestampAt(object, "first_seen_at", "$", issues);
  const lastSeen = timestampAt(object, "last_seen_at", "$", issues);
  if (firstSeen && lastSeen && Date.parse(lastSeen) < Date.parse(firstSeen)) {
    issue(issues, "$.last_seen_at", "invalid_thread_window", "last_seen_at cannot predate first_seen_at");
  }
  return finish(input, issues);
}

export function validateSelectionRun(input: unknown): ValidationResult<SelectionRun> {
  const issues: ValidationIssue[] = [];
  const base = validateEntityBase(input, SELECTION_RUN_SCHEMA, "selection_run", issues);
  if (!base) return finish(input, issues);
  const { object } = base;
  stringAt(object, "evaluation_kind", "$", issues);
  stringAt(object, "question", "$", issues);
  stringAt(object, "method", "$", issues);
  const evaluatedCount = integerAt(object, "evaluated_count", "$", issues, 0);
  const rejectedCount = integerAt(object, "rejected_count", "$", issues, 0);
  const result = enumAt(object, "result", ["recommendation", "none_worth_recommending", "inconclusive"], "$", issues);
  const candidateIds: string[] = [];
  const recommendedIdsFromCandidates: string[] = [];
  let rejectedFromCandidates = 0;
  if (!Array.isArray(object.candidates)) {
    issue(issues, "$.candidates", "expected_array", "Expected an array");
  } else {
    object.candidates.forEach((entry, index) => {
      const candidate = objectAt(entry, `$.candidates[${index}]`, issues);
      if (!candidate) return;
      const candidateId = stringAt(candidate, "candidate_id", `$.candidates[${index}]`, issues);
      if (candidateId) candidateIds.push(candidateId);
      stringAt(candidate, "label", `$.candidates[${index}]`, issues);
      const disposition = enumAt(candidate, "disposition", ["recommended", "rejected", "watching"], `$.candidates[${index}]`, issues);
      if (disposition === "recommended" && candidateId) recommendedIdsFromCandidates.push(candidateId);
      if (disposition === "rejected") rejectedFromCandidates += 1;
      stringAt(candidate, "rationale", `$.candidates[${index}]`, issues);
      const score = numberAt(candidate, "score", `$.candidates[${index}]`, issues, true);
      if (score !== undefined && (score < 0 || score > 1)) {
        issue(issues, `$.candidates[${index}].score`, "invalid_score", "Score must be between 0 and 1");
      }
      entityRefArrayAt(candidate, "evidence_refs", `$.candidates[${index}]`, issues, "evidence_item");
    });
  }
  if (new Set(candidateIds).size !== candidateIds.length) {
    issue(issues, "$.candidates", "duplicate_candidate_id", "Candidate IDs must be unique");
  }
  if (evaluatedCount !== undefined && evaluatedCount !== candidateIds.length) {
    issue(issues, "$.evaluated_count", "evaluated_count_mismatch", "evaluated_count must equal the number of candidates");
  }
  if (rejectedCount !== undefined && rejectedCount !== rejectedFromCandidates) {
    issue(issues, "$.rejected_count", "rejected_count_mismatch", "rejected_count must equal rejected candidates");
  }
  const recommendedIds = stringArrayAt(object, "recommended_candidate_ids", "$", issues);
  if (
    recommendedIds.length !== recommendedIdsFromCandidates.length ||
    recommendedIds.some((id) => !recommendedIdsFromCandidates.includes(id))
  ) {
    issue(issues, "$.recommended_candidate_ids", "recommendation_mismatch", "Recommended IDs must exactly match recommended candidates");
  }
  if (result === "recommendation" && recommendedIds.length === 0) {
    issue(issues, "$.recommended_candidate_ids", "recommendation_required", "A recommendation result requires a recommended candidate");
  }
  if (result === "none_worth_recommending" && recommendedIds.length > 0) {
    issue(issues, "$.recommended_candidate_ids", "negative_result_has_recommendation", "A negative result cannot recommend a candidate");
  }
  stringArrayAt(object, "limitations", "$", issues);
  timestampAt(object, "completed_at", "$", issues);
  return finish(input, issues);
}

export function validatePlace(input: unknown): ValidationResult<Place> {
  const issues: ValidationIssue[] = [];
  const base = validateEntityBase(input, PLACE_SCHEMA, "place", issues);
  if (!base) return finish(input, issues);
  const { object } = base;
  entityRefAt(object.thread_ref, "$.thread_ref", issues, "thread");
  if (object.selection_run_ref !== undefined) entityRefAt(object.selection_run_ref, "$.selection_run_ref", issues, "selection_run");
  stringAt(object, "title", "$", issues);
  externalRefAt(object.source_door, "$.source_door", issues);
  stringAt(object, "opportunity", "$", issues);
  stringAt(object, "contribution", "$", issues);
  externalRefArrayAt(object, "people_refs", "$", issues);
  stringAt(object, "next_move", "$", issues);
  enumAt(object, "human_cost", ["low", "medium", "high"], "$", issues);
  enumAt(object, "status", ["proposed", "selected", "dismissed", "expired", "completed"], "$", issues);
  timestampAt(object, "expires_at", "$", issues);
  return finish(input, issues);
}

export function validateDraft(input: unknown): ValidationResult<Draft> {
  const issues: ValidationIssue[] = [];
  const base = validateEntityBase(input, DRAFT_SCHEMA, "draft", issues);
  if (!base) return finish(input, issues);
  const { object } = base;
  enumAt(object, "draft_kind", ["post", "reply", "article", "message", "change_set", "other"], "$", issues);
  stringAt(object, "title", "$", issues, true);
  stringAt(object, "body", "$", issues);
  enumAt(object, "status", ["working", "ready", "approved", "superseded"], "$", issues);
  if (object.target !== undefined) {
    const target = objectAt(object.target, "$.target", issues);
    if (target) {
      stringAt(target, "channel", "$.target", issues);
      stringAt(target, "account_ref", "$.target", issues, true);
      stringAt(target, "audience", "$.target", issues, true);
      if (target.reply_to !== undefined) externalRefAt(target.reply_to, "$.target.reply_to", issues);
    }
  }
  const sources = entityRefArrayAt(object, "source_refs", "$", issues, "evidence_item");
  const seeds = entityRefArrayAt(object, "human_seed_refs", "$", issues);
  if (sources.length === 0 && seeds.length === 0) {
    issue(issues, "$", "draft_requires_source_or_human_seed", "A draft requires evidence or an authorized human seed");
  }
  if (object.place_ref !== undefined) entityRefAt(object.place_ref, "$.place_ref", issues, "place");
  return finish(input, issues);
}

export function validateFeedbackSignal(input: unknown): ValidationResult<FeedbackSignal> {
  const issues: ValidationIssue[] = [];
  const base = validateEntityBase(input, FEEDBACK_SIGNAL_SCHEMA, "feedback_signal", issues);
  if (!base) return finish(input, issues);
  const { object } = base;
  entityRefAt(object.target_ref, "$.target_ref", issues);
  enumAt(object, "signal_kind", ["accepted", "rejected", "corrected", "dismissed", "useful", "not_useful", "other"], "$", issues);
  jsonValueAt(object, "value", "$", issues);
  actorAt(object.recorded_by, "$.recorded_by", issues);
  timestampAt(object, "recorded_at", "$", issues);
  return finish(input, issues);
}

export function validateLedgerEntity(input: unknown): ValidationResult<LedgerEntity> {
  const issues: ValidationIssue[] = [];
  const object = objectAt(input, "$", issues);
  if (!object) return finish(input, issues);
  switch (object.entity_type) {
    case "evidence_item": return validateEvidenceItem(input);
    case "context_statement": return validateContextStatement(input);
    case "conversation": return validateConversation(input);
    case "decision": return validateDecision(input);
    case "thread": return validateThread(input);
    case "selection_run": return validateSelectionRun(input);
    case "place": return validatePlace(input);
    case "draft": return validateDraft(input);
    case "feedback_signal": return validateFeedbackSignal(input);
    case "context_pack":
      issue(issues, "$.entity_type", "derived_record_not_ledger_entity", "Context Packs are derived and cannot be canonical ledger entities");
      return finish(input, issues);
    default:
      issue(issues, "$.entity_type", "unknown_entity_type", `Expected one of ${LEDGER_ENTITY_TYPES.join(", ")}`);
      return finish(input, issues);
  }
}

function ledgerWatermarkAt(value: unknown, path: string, issues: ValidationIssue[]): void {
  const watermark = objectAt(value, path, issues);
  if (!watermark) return;
  stringAt(watermark, "ledger_id", path, issues);
  integerAt(watermark, "sequence", path, issues, 1);
  stringAt(watermark, "event_id", path, issues);
  const eventHash = stringAt(watermark, "event_hash", path, issues);
  if (eventHash !== undefined && !isCanonicalHash(eventHash)) {
    issue(issues, `${path}.event_hash`, "invalid_hash", "Expected a canonical SHA-256 hash");
  }
}

export function validateContextPack(input: unknown): ValidationResult<ContextPack> {
  const issues: ValidationIssue[] = [];
  const object = objectAt(input, "$", issues);
  if (!object) return finish(input, issues);
  literalAt(object, "schema", CONTEXT_PACK_SCHEMA, "$", issues);
  const packId = stringAt(object, "pack_id", "$", issues);
  stringAt(object, "owner_id", "$", issues);
  stringAt(object, "run_id", "$", issues);
  stringAt(object, "purpose", "$", issues);
  stringAt(object, "agent_role", "$", issues);
  literalAt(object, "derived", true, "$", issues);
  ledgerWatermarkAt(object.ledger_watermark, "$.ledger_watermark", issues);
  integerAt(object, "token_budget", "$", issues, 1);
  entityRefArrayAt(object, "requested_refs", "$", issues);
  const sourcePack = objectAt(object.source_pack, "$.source_pack", issues);
  if (sourcePack) {
    literalAt(sourcePack, "schema", "afi.context_kernel_pack.v1", "$.source_pack", issues);
    const sourcePackHash = stringAt(sourcePack, "pack_hash", "$.source_pack", issues);
    if (sourcePackHash !== undefined && !isCanonicalHash(sourcePackHash)) {
      issue(issues, "$.source_pack.pack_hash", "invalid_hash", "Expected a canonical SHA-256 hash");
    }
  }
  const sectionRefs = new Set<string>();
  if (!Array.isArray(object.sections)) {
    issue(issues, "$.sections", "expected_array", "Expected an array");
  } else {
    const sectionKeys: string[] = [];
    object.sections.forEach((entry, index) => {
      const section = objectAt(entry, `$.sections[${index}]`, issues);
      if (!section) return;
      const key = stringAt(section, "key", `$.sections[${index}]`, issues);
      if (key) sectionKeys.push(key);
      stringAt(section, "title", `$.sections[${index}]`, issues);
      enumAt(section, "authority", ["explicit", "observed", "inferred", "derived"], `$.sections[${index}]`, issues);
      stringAt(section, "summary", `$.sections[${index}]`, issues, true);
      for (const ref of entityRefArrayAt(section, "record_refs", `$.sections[${index}]`, issues)) {
        sectionRefs.add(`${ref.entity_type}\u0000${ref.entity_id}\u0000${ref.revision ?? ""}`);
      }
      integerAt(section, "token_count", `$.sections[${index}]`, issues, 0, true);
    });
    if (new Set(sectionKeys).size !== sectionKeys.length) {
      issue(issues, "$.sections", "duplicate_section_key", "Context Pack section keys must be unique");
    }
  }
  const traceRefs = new Set<string>();
  if (!Array.isArray(object.trace)) {
    issue(issues, "$.trace", "expected_array", "Expected an array");
  } else {
    object.trace.forEach((entry, index) => {
      const trace = objectAt(entry, `$.trace[${index}]`, issues);
      if (!trace) return;
      const ref = entityRefAt(trace.ref, `$.trace[${index}].ref`, issues);
      if (ref) {
        if (ref.revision === undefined || ref.record_hash === undefined) {
          issue(issues, `$.trace[${index}].ref`, "unbound_trace_ref", "Trace refs require revision and record_hash");
        }
        traceRefs.add(`${ref.entity_type}\u0000${ref.entity_id}\u0000${ref.revision ?? ""}`);
      }
      enumAt(trace, "basis", ["explicit", "observed", "inferred", "system"], `$.trace[${index}]`, issues);
      stringAt(trace, "event_id", `$.trace[${index}]`, issues);
      const eventHash = stringAt(trace, "event_hash", `$.trace[${index}]`, issues);
      if (eventHash !== undefined && !isCanonicalHash(eventHash)) {
        issue(issues, `$.trace[${index}].event_hash`, "invalid_hash", "Expected a canonical SHA-256 hash");
      }
    });
    if (traceRefs.size !== object.trace.length) {
      issue(issues, "$.trace", "duplicate_trace_ref", "Trace refs must be unique");
    }
  }
  for (const key of sectionRefs) {
    if (!traceRefs.has(key)) issue(issues, "$.sections", "section_ref_missing_trace", "Every selected record ref requires an exact trace entry");
  }
  for (const key of traceRefs) {
    if (!sectionRefs.has(key)) issue(issues, "$.trace", "trace_ref_not_selected", "Every trace ref must appear in a section");
  }
  stringArrayAt(object, "capabilities", "$", issues);
  stringArrayAt(object, "omissions", "$", issues);
  const assembledAt = timestampAt(object, "assembled_at", "$", issues);
  const expiresAt = timestampAt(object, "expires_at", "$", issues, true);
  if (assembledAt && expiresAt && Date.parse(expiresAt) <= Date.parse(assembledAt)) {
    issue(issues, "$.expires_at", "invalid_pack_expiration", "expires_at must be after assembled_at");
  }
  const packHash = stringAt(object, "pack_hash", "$", issues);
  if (packHash !== undefined && !isCanonicalHash(packHash)) {
    issue(issues, "$.pack_hash", "invalid_hash", "Expected a canonical SHA-256 hash");
  } else if (packHash !== undefined) {
    try {
      if (packHash !== hashContextPack(object)) {
        issue(issues, "$.pack_hash", "pack_hash_mismatch", "pack_hash must bind the exact derived context package");
      }
      const expectedPackId = `pack_${packHash.slice("sha256:".length)}`;
      if (packId !== undefined && packId !== expectedPackId) {
        issue(issues, "$.pack_id", "pack_id_mismatch", "pack_id must derive from pack_hash");
      }
    } catch (error) {
      issue(issues, "$", "invalid_json_value", error instanceof Error ? error.message : "Invalid JSON value");
    }
  }
  return finish(input, issues);
}

/** Shape/integrity validation only; the workspace boundary must authenticate mac. */
export function validateContextPackReceipt(input: unknown): ValidationResult<ContextPackReceipt> {
  const issues: ValidationIssue[] = [];
  const object = objectAt(input, "$", issues);
  if (!object) return finish(input, issues);
  literalAt(object, "schema", CONTEXT_PACK_RECEIPT_SCHEMA, "$", issues);
  const packValidation = validateContextPack(object.pack);
  if (!packValidation.ok) {
    for (const packIssue of packValidation.issues) {
      issue(
        issues,
        `$.pack${packIssue.path === "$" ? "" : packIssue.path.slice(1)}`,
        packIssue.code,
        packIssue.message,
      );
    }
  }
  const mac = stringAt(object, "mac", "$", issues);
  if (mac !== undefined && !/^hmac-sha256:[a-f0-9]{64}$/.test(mac)) {
    issue(issues, "$.mac", "invalid_mac", "Expected hmac-sha256:<64 lowercase hex chars>");
  }
  return finish(input, issues);
}

export function validateScratchCue(input: unknown): ValidationResult<ScratchCue> {
  const issues: ValidationIssue[] = [];
  const object = objectAt(input, "$", issues);
  if (!object) return finish(input, issues);
  literalAt(object, "schema", SCRATCH_CUE_SCHEMA, "$", issues);
  stringAt(object, "cue_id", "$", issues);
  stringAt(object, "owner_id", "$", issues);
  stringAt(object, "channel", "$", issues);
  stringAt(object, "summary", "$", issues);
  stringAt(object, "locator", "$", issues, true);
  const observedAt = timestampAt(object, "observed_at", "$", issues);
  const expiresAt = timestampAt(object, "expires_at", "$", issues);
  if (observedAt && expiresAt && Date.parse(expiresAt) <= Date.parse(observedAt)) {
    issue(issues, "$.expires_at", "scratch_expiration_required", "Scratch cues must expire after observation");
  }
  stringAt(object, "uncertainty", "$", issues);
  const retention = objectAt(object.retention, "$.retention", issues);
  if (retention) {
    literalAt(retention, "classification", "ephemeral", "$.retention", issues);
    literalAt(retention, "persistence", "scratch", "$.retention", issues);
    literalAt(retention, "replication", "never", "$.retention", issues);
  }
  return finish(input, issues);
}

function authorityAt(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): LedgerAuthority | undefined {
  const authority = objectAt(value, path, issues);
  if (!authority) return undefined;
  enumAt(authority, "mode", ["user_originated", "user_confirmation", "agent_proposal", "connector_observation", "system_derived"], path, issues);
  if (authority.granted_by !== undefined) actorAt(authority.granted_by, `${path}.granted_by`, issues);
  if (authority.confirmation_ref !== undefined) {
    const ref = entityRefAt(authority.confirmation_ref, `${path}.confirmation_ref`, issues, "decision");
    if (ref && (ref.revision === undefined || ref.record_hash === undefined)) {
      issue(issues, `${path}.confirmation_ref`, "unbound_confirmation_ref", "Confirmation must bind an exact Decision revision and hash");
    }
  }
  return authority as unknown as LedgerAuthority;
}

export function evaluateContextStatementAuthority(
  statement: ContextStatement,
  actor: ActorRef,
  authority: LedgerAuthority,
): AuthorityDecision {
  const reasons: string[] = [];
  let required: AuthorityDecision["required_authority"] = "none";

  if (statement.basis === "explicit") {
    const userOriginated =
      actor.actor_type === "user" &&
      actor.actor_id === statement.owner_id &&
      authority.mode === "user_originated";
    const userConfirmed =
      authority.mode === "user_confirmation" &&
      authority.granted_by?.actor_type === "user" &&
      authority.granted_by.actor_id === statement.owner_id &&
      authority.confirmation_ref !== undefined;
    if (!userOriginated && !userConfirmed) {
      required = actor.actor_type === "user" ? "user_originated" : "user_confirmation";
      reasons.push("Explicit context must be originated by its owner or bind a recorded owner confirmation.");
    }
  } else if (statement.basis === "observed") {
    if (statement.provenance.evidence_refs.length === 0) {
      required = "evidence_required";
      reasons.push("Observed context requires at least one evidence reference.");
    }
    if (!['connector_observation', 'agent_proposal', 'user_originated'].includes(authority.mode)) {
      reasons.push("Observed context requires observation, proposal, or user-originated authority.");
    }
  } else {
    if (actor.actor_type !== "user" && authority.mode !== "agent_proposal") {
      required = "agent_proposal";
      reasons.push("Non-user inference must use agent_proposal authority.");
    }
    if (actor.actor_type !== "user" && statement.status !== "proposed") {
      required = "user_confirmation";
      reasons.push("An agent-authored inference must remain proposed until a user confirms a separate explicit statement.");
    }
  }

  return { allowed: reasons.length === 0, required_authority: required, reasons };
}

function isRecordedOwnerConfirmation(
  ownerId: string,
  authority: LedgerAuthority,
): boolean {
  return (
    authority.mode === "user_confirmation" &&
    authority.granted_by?.actor_type === "user" &&
    authority.granted_by.actor_id === ownerId &&
    authority.confirmation_ref !== undefined
  );
}

/**
 * Central authority decision for every durable entity mutation. Shape
 * validation alone is not authority: storage writers must call this helper (or
 * validateLedgerEvent, which calls it) before appending an event.
 */
export function evaluateLedgerEntityAuthority(
  entity: LedgerEntity,
  actor: ActorRef,
  authority: LedgerAuthority,
  producer?: EventProducer,
): AuthorityDecision {
  if (entity.entity_type === "context_statement") {
    return evaluateContextStatementAuthority(entity, actor, authority);
  }
  const reasons: string[] = [];
  let required: AuthorityDecision["required_authority"] = "none";
  const userOriginated =
    actor.actor_type === "user" &&
    actor.actor_id === entity.owner_id &&
    authority.mode === "user_originated";
  const userConfirmed = isRecordedOwnerConfirmation(entity.owner_id, authority);

  if (entity.entity_type === "decision" && !userOriginated && !userConfirmed) {
    required = actor.actor_type === "user" ? "user_originated" : "user_confirmation";
    reasons.push("A canonical human decision must be owner-originated or bind a recorded owner confirmation.");
  }
  if (
    entity.entity_type === "draft" &&
    entity.status === "approved" &&
    !userOriginated &&
    !userConfirmed
  ) {
    required = "user_confirmation";
    reasons.push("An agent may prepare a draft but cannot mark it approved without recorded owner authority.");
  }
  if (entity.entity_type === "evidence_item" && entity.evidence_kind === "provider_receipt") {
    if (
      (actor.actor_type !== "provider" && actor.actor_type !== "service") ||
      producer === undefined
    ) {
      required = "none";
      reasons.push("Provider receipt evidence requires a provider or service actor and bound producer identity.");
    }
  }
  return { allowed: reasons.length === 0, required_authority: required, reasons };
}

export function validateLedgerEntityAuthority(
  entityInput: unknown,
  actorInput: unknown,
  authorityInput: unknown,
  producerInput?: unknown,
): ValidationResult<LedgerEntity> {
  const entityResult = validateLedgerEntity(entityInput);
  const issues: ValidationIssue[] = entityResult.ok ? [] : [...entityResult.issues];
  const actor = actorAt(actorInput, "$.authority_actor", issues);
  const authority = authorityAt(authorityInput, "$.authority", issues);
  let producer: EventProducer | undefined;
  if (producerInput !== undefined) {
    const producerObject = objectAt(producerInput, "$.producer", issues);
    if (producerObject) {
      stringAt(producerObject, "connection_id", "$.producer", issues);
      stringAt(producerObject, "provider", "$.producer", issues);
      stringAt(producerObject, "external_agent_id", "$.producer", issues, true);
      producer = producerObject as unknown as EventProducer;
    }
  }
  if (!entityResult.ok || !actor || !authority) return { ok: false, issues };
  const decision = evaluateLedgerEntityAuthority(entityResult.value, actor, authority, producer);
  decision.reasons.forEach((reason) =>
    issue(issues, "$.authority", "entity_authority_denied", reason),
  );
  return finish(entityResult.value, issues);
}

/**
 * Resolves user_confirmation authority against an earlier, active Decision.
 * This closes the gap between a structurally valid reference and actual ledger
 * authority. The decision must bind the exact target entity.
 */
export function validateUserConfirmationForEvent(
  eventInput: unknown,
  confirmationInput: unknown,
): ValidationResult<LedgerEvent> {
  const eventResult = validateLedgerEvent(eventInput);
  const issues: ValidationIssue[] = eventResult.ok ? [] : [...eventResult.issues];
  if (!eventResult.ok) return { ok: false, issues };
  const event = eventResult.value;
  if (event.authority.mode !== "user_confirmation") return finish(event, issues);
  const decisionResult = validateDecision(confirmationInput);
  if (!decisionResult.ok) {
    decisionResult.issues.forEach((entry) => {
      const suffix = entry.path === "$" ? "" : entry.path.slice(1);
      issues.push({ ...entry, path: `$.confirmation${suffix}` });
    });
    return finish(event, issues);
  }
  const confirmation = decisionResult.value;
  const ref = event.authority.confirmation_ref;
  if (
    ref === undefined ||
    ref.entity_id !== confirmation.entity_id ||
    ref.revision !== confirmation.revision ||
    ref.record_hash !== confirmation.record_hash
  ) {
    issue(issues, "$.authority.confirmation_ref", "confirmation_binding_mismatch", "Authority must bind the exact resolved Decision revision and hash");
  }
  if (
    confirmation.owner_id !== event.owner_id ||
    confirmation.decided_by.actor_type !== "user" ||
    confirmation.decided_by.actor_id !== event.owner_id ||
    confirmation.status !== "active"
  ) {
    issue(issues, "$.confirmation", "invalid_owner_confirmation", "Confirmation must be an active decision by the ledger owner");
  }
  if (Date.parse(confirmation.decided_at) > Date.parse(event.occurred_at)) {
    issue(issues, "$.confirmation.decided_at", "confirmation_predates_required", "Confirmation must predate the authorized event");
  }
  const bindsTarget = confirmation.target_refs.some(
    (target) =>
      target.entity_type === event.target.entity_type &&
      target.entity_id === event.target.entity_id &&
      (target.revision === undefined || target.revision === event.revision),
  );
  if (!bindsTarget) {
    issue(issues, "$.confirmation.target_refs", "confirmation_target_mismatch", "Confirmation Decision must target the authorized entity revision");
  }
  return finish(event, issues);
}

/** Binds approval authorship to the actor presenting the record. */
export function validateApprovalDecisionAuthority(
  decisionInput: unknown,
  actorInput: unknown,
): ValidationResult<ApprovalDecision> {
  const decisionResult = validateApprovalDecision(decisionInput);
  const issues: ValidationIssue[] = decisionResult.ok ? [] : [...decisionResult.issues];
  const actor = actorAt(actorInput, "$.authority_actor", issues);
  if (!decisionResult.ok || !actor) return { ok: false, issues };
  if (
    actor.actor_type !== "user" ||
    actor.actor_id !== decisionResult.value.decided_by.actor_id
  ) {
    issue(issues, "$.authority_actor", "approval_authority_denied", "Only the named user decision maker can record an approval");
  }
  return finish(decisionResult.value, issues);
}

/**
 * Execution proof is provider evidence, never an agent assertion. This helper
 * binds a receipt to its authenticated adapter identity.
 */
export function validateExecutionReceiptAuthority(
  receiptInput: unknown,
  actorInput: unknown,
  producerInput: unknown,
): ValidationResult<ExecutionReceipt> {
  const receiptResult = validateExecutionReceipt(receiptInput);
  const issues: ValidationIssue[] = receiptResult.ok ? [] : [...receiptResult.issues];
  const actor = actorAt(actorInput, "$.authority_actor", issues);
  const producer = objectAt(producerInput, "$.producer", issues);
  if (producer) {
    stringAt(producer, "connection_id", "$.producer", issues);
    stringAt(producer, "provider", "$.producer", issues);
    stringAt(producer, "external_agent_id", "$.producer", issues, true);
  }
  if (!receiptResult.ok || !actor || !producer) return { ok: false, issues };
  if (actor.actor_type !== "provider" && actor.actor_type !== "service") {
    issue(issues, "$.authority_actor.actor_type", "execution_authority_denied", "Ordinary agents cannot manufacture provider execution proof");
  }
  if (producer.connection_id !== receiptResult.value.provider_connection_id) {
    issue(issues, "$.producer.connection_id", "execution_producer_mismatch", "Receipt must bind the authenticated provider connection");
  }
  return finish(receiptResult.value, issues);
}

export function validateContextStatementAuthority(
  statementInput: unknown,
  actorInput: unknown,
  authorityInput: unknown,
): ValidationResult<ContextStatement> {
  const statementResult = validateContextStatement(statementInput);
  const issues: ValidationIssue[] = statementResult.ok ? [] : [...statementResult.issues];
  const actor = actorAt(actorInput, "$.authority_actor", issues);
  const authority = authorityAt(authorityInput, "$.authority", issues);
  if (!statementResult.ok || !actor || !authority) return { ok: false, issues };
  const decision = evaluateContextStatementAuthority(statementResult.value, actor, authority);
  decision.reasons.forEach((reason) =>
    issue(issues, "$.authority", "context_authority_denied", reason),
  );
  return finish(statementResult.value, issues);
}

export function validateLedgerEvent(input: unknown): ValidationResult<LedgerEvent> {
  const issues: ValidationIssue[] = [];
  const object = objectAt(input, "$", issues);
  if (!object) return finish(input, issues);
  literalAt(object, "schema", LEDGER_EVENT_SCHEMA, "$", issues);
  stringAt(object, "ledger_id", "$", issues);
  const eventId = stringAt(object, "event_id", "$", issues);
  if (eventId !== undefined && !isTimeSortableId(eventId)) {
    issue(issues, "$.event_id", "event_id_not_time_sortable", "event_id must be a ULID or UUIDv7, optionally with a stable prefix");
  }
  const eventHash = stringAt(object, "event_hash", "$", issues);
  if (eventHash !== undefined && !isCanonicalHash(eventHash)) {
    issue(issues, "$.event_hash", "invalid_hash", "Expected a canonical SHA-256 hash");
  }
  const previousEventHash = stringAt(object, "previous_event_hash", "$", issues, true);
  if (previousEventHash !== undefined && !isCanonicalHash(previousEventHash)) {
    issue(issues, "$.previous_event_hash", "invalid_hash", "Expected a canonical SHA-256 hash");
  }
  stringAt(object, "idempotency_key", "$", issues);
  const sequence = integerAt(object, "sequence", "$", issues, 1);
  stringAt(object, "owner_id", "$", issues);
  const occurredAt = timestampAt(object, "occurred_at", "$", issues);
  const recordedAt = timestampAt(object, "recorded_at", "$", issues);
  if (occurredAt && recordedAt && Date.parse(recordedAt) < Date.parse(occurredAt)) {
    issue(issues, "$.recorded_at", "recorded_before_occurred", "recorded_at cannot predate occurred_at");
  }
  const operation = enumAt(object, "operation", ["created", "revised", "corrected", "tombstoned"], "$", issues);
  const target = entityRefAt(object.target, "$.target", issues);
  if (target && !LEDGER_ENTITY_TYPES.includes(target.entity_type as LedgerEntityType)) {
    issue(issues, "$.target.entity_type", "unknown_entity_type", "Target must be a durable ledger entity type");
  }
  const kind = stringAt(object, "kind", "$", issues);
  if (target && operation && kind !== makeLedgerEventKind(target.entity_type as LedgerEntityType, operation)) {
    issue(issues, "$.kind", "event_kind_mismatch", "kind must be derived from target entity type and operation");
  }
  const revision = integerAt(object, "revision", "$", issues, 1);
  const previousRevision = integerAt(object, "previous_revision", "$", issues, 1, true);
  const previousEntityHash = stringAt(object, "previous_entity_hash", "$", issues, true);
  if (previousEntityHash !== undefined && !isCanonicalHash(previousEntityHash)) {
    issue(issues, "$.previous_entity_hash", "invalid_hash", "Expected a canonical SHA-256 hash");
  }
  const actor = actorAt(object.actor, "$.actor", issues);
  if (object.producer !== undefined) {
    const producer = objectAt(object.producer, "$.producer", issues);
    if (producer) {
      stringAt(producer, "connection_id", "$.producer", issues);
      stringAt(producer, "provider", "$.producer", issues);
      stringAt(producer, "external_agent_id", "$.producer", issues, true);
    }
  }
  const authority = authorityAt(object.authority, "$.authority", issues);
  stringAt(object, "run_id", "$", issues, true);
  stringAt(object, "correlation_id", "$", issues, true);
  const causationEventId = stringAt(object, "causation_event_id", "$", issues, true);
  if (causationEventId !== undefined && !isTimeSortableId(causationEventId)) {
    issue(issues, "$.causation_event_id", "event_id_not_time_sortable", "causation_event_id must be a ULID or UUIDv7");
  }
  const supersedesEventId = stringAt(object, "supersedes_event_id", "$", issues, true);
  if (supersedesEventId !== undefined && !isTimeSortableId(supersedesEventId)) {
    issue(issues, "$.supersedes_event_id", "event_id_not_time_sortable", "supersedes_event_id must be a ULID or UUIDv7");
  }
  stringAt(object, "reason", "$", issues, true);

  if (sequence === 1 && previousEventHash !== undefined) {
    issue(issues, "$.previous_event_hash", "initial_event_has_predecessor", "The first ledger event cannot have a predecessor hash");
  } else if (sequence !== undefined && sequence > 1 && previousEventHash === undefined) {
    issue(issues, "$.previous_event_hash", "previous_event_hash_required", "Every event after sequence one must bind its predecessor");
  }

  if (operation === "created") {
    if (revision !== 1) issue(issues, "$.revision", "invalid_initial_revision", "Created entities start at revision 1");
    if (previousRevision !== undefined || previousEntityHash !== undefined) {
      issue(issues, "$", "create_has_entity_predecessor", "Created entities cannot name a previous entity revision");
    }
  } else if (operation !== undefined) {
    if (previousRevision === undefined || previousEntityHash === undefined) {
      issue(issues, "$", "entity_predecessor_required", "Revision, correction, and tombstone events must bind the previous entity snapshot");
    } else if (revision !== undefined && revision !== previousRevision + 1) {
      issue(issues, "$.revision", "non_monotonic_revision", "revision must equal previous_revision + 1");
    }
    if (operation === "corrected" && object.reason === undefined) {
      issue(issues, "$.reason", "correction_reason_required", "Corrections require an explanation");
    }
    if (operation === "corrected" && supersedesEventId === undefined) {
      issue(issues, "$.supersedes_event_id", "superseded_event_required", "Corrections must identify the prior event they supersede");
    }
  }

  if (operation === "tombstoned") {
    if (object.entity !== undefined || object.entity_hash !== undefined) {
      issue(issues, "$.entity", "tombstone_contains_entity", "Tombstones cannot retain an entity body");
    }
    const tombstone = objectAt(object.tombstone, "$.tombstone", issues);
    if (tombstone) {
      stringAt(tombstone, "reason", "$.tombstone", issues);
      stringArrayAt(tombstone, "erased_object_ids", "$.tombstone", issues);
    }
  } else if (operation !== undefined) {
    if (object.tombstone !== undefined) {
      issue(issues, "$.tombstone", "mutation_contains_tombstone", "Entity mutations cannot contain a tombstone");
    }
    const entityResult = validateLedgerEntity(object.entity);
    if (!entityResult.ok) {
      entityResult.issues.forEach((entry) => {
        const suffix = entry.path === "$" ? "" : entry.path.slice(1);
        issues.push({ ...entry, path: `$.entity${suffix}` });
      });
    } else {
      const entity = entityResult.value;
      const entityHash = stringAt(object, "entity_hash", "$", issues);
      if (entityHash !== undefined && !isCanonicalHash(entityHash)) {
        issue(issues, "$.entity_hash", "invalid_hash", "Expected a canonical SHA-256 hash");
      }
      if (entityHash !== entity.record_hash) {
        issue(issues, "$.entity_hash", "entity_hash_mismatch", "Event entity_hash must match the sealed entity record");
      }
      if (
        entity.entity_type !== target?.entity_type ||
        entity.entity_id !== target?.entity_id ||
        entity.revision !== revision ||
        entity.owner_id !== object.owner_id
      ) {
        issue(issues, "$.entity", "event_entity_binding_mismatch", "Entity identity, owner, and revision must match the event envelope");
      }
      if (actor && authority) {
        const authorityDecision = evaluateLedgerEntityAuthority(
          entity,
          actor,
          authority,
          object.producer as EventProducer | undefined,
        );
        authorityDecision.reasons.forEach((reason) =>
          issue(issues, "$.authority", "entity_authority_denied", reason),
        );
      }
    }
  }

  if (eventHash !== undefined && isCanonicalHash(eventHash)) {
    try {
      if (eventHash !== hashLedgerEvent(object)) {
        issue(issues, "$.event_hash", "event_hash_mismatch", "event_hash must bind the exact canonical event");
      }
    } catch (error) {
      issue(issues, "$", "invalid_json_value", error instanceof Error ? error.message : "Invalid JSON value");
    }
  }
  return finish(input, issues);
}

export function validateLedgerTransition(
  previous: LedgerEntity | undefined,
  eventInput: unknown,
): ValidationResult<LedgerEvent> {
  const eventResult = validateLedgerEvent(eventInput);
  if (!eventResult.ok) return eventResult;
  const event = eventResult.value;
  const issues: ValidationIssue[] = [];
  if (event.operation === "created") {
    if (previous !== undefined) {
      issue(issues, "$.operation", "entity_already_exists", "A created event cannot replace an existing entity");
    }
    return finish(event, issues);
  }
  if (previous === undefined) {
    issue(issues, "$.operation", "entity_not_found", "Revision, correction, and tombstone require an existing entity");
    return finish(event, issues);
  }
  if (
    previous.entity_type !== event.target.entity_type ||
    previous.entity_id !== event.target.entity_id ||
    previous.owner_id !== event.owner_id
  ) {
    issue(issues, "$.target", "previous_entity_binding_mismatch", "Previous entity identity or owner does not match event target");
  }
  if (
    event.previous_revision !== previous.revision ||
    event.previous_entity_hash !== previous.record_hash
  ) {
    issue(issues, "$", "stale_entity_revision", "Event does not bind the current entity revision and hash");
  }
  if (event.operation !== "tombstoned") {
    const next = event.entity;
    if (next.created_at !== previous.created_at) {
      issue(issues, "$.entity.created_at", "created_at_changed", "Entity revisions must preserve created_at");
    }
    if (Date.parse(next.updated_at) < Date.parse(previous.updated_at)) {
      issue(issues, "$.entity.updated_at", "updated_at_regressed", "Entity updated_at cannot move backwards");
    }
    const broadensReplication =
      previous.retention.replication === "local_only" &&
      next.retention.replication !== "local_only";
    const broadensClassification =
      previous.retention.classification === "private" &&
      next.retention.classification !== "private";
    if (
      (broadensReplication || broadensClassification) &&
      event.actor.actor_type !== "user" &&
      !(
        event.authority.mode === "user_confirmation" &&
        event.authority.granted_by?.actor_type === "user" &&
        event.authority.granted_by.actor_id === event.owner_id &&
        event.authority.confirmation_ref !== undefined
      )
    ) {
      issue(issues, "$.entity.retention", "retention_authority_denied", "An agent cannot broaden sharing or replication without recorded user confirmation");
    }
  }
  return finish(event, issues);
}
