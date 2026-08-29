import { assertSortableId, canonicalJson } from "./canonical.js";
import { appendChange } from "./ledger.js";
import type { ChangeResult, RunCheckpointInput, RunCompletionInput } from "./types.js";
import type { WorkspacePaths } from "./workspace.js";

export async function checkpointRun(paths: WorkspacePaths, input: RunCheckpointInput): Promise<ChangeResult> {
  assertSortableId(input.run_id, "run_id");
  return appendChange(paths, {
    idempotency_key: input.idempotency_key,
    occurred_at: input.occurred_at,
    actor: input.actor,
    kind: "run.checkpointed",
    basis: input.actor.actor_type === "agent" ? "inferred" : "system",
    entity_type: "run",
    entity_id: input.run_id,
    expected_revision: input.expected_revision,
    payload: { phase: "checkpoint" },
    body: canonicalJson({ summary: input.summary, state: input.state ?? {} }),
  });
}

export async function completeRun(paths: WorkspacePaths, input: RunCompletionInput): Promise<ChangeResult> {
  assertSortableId(input.run_id, "run_id");
  return appendChange(paths, {
    idempotency_key: input.idempotency_key,
    occurred_at: input.occurred_at,
    actor: input.actor,
    kind: "run.completed",
    basis: input.actor.actor_type === "agent" ? "inferred" : "system",
    entity_type: "run",
    entity_id: input.run_id,
    expected_revision: input.expected_revision,
    payload: {
      phase: "complete",
      status: input.status,
      output_refs: input.output_refs ?? [],
    },
    body: canonicalJson({ summary: input.summary }),
  });
}
