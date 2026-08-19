# Quiet Desk agents

The five agents are provider-neutral roles. `afi.inbox` means the same job whether a run is performed by Codex, Grok, or a future executor. Providers publish the same `afi.event.v1` events into Quiet Hub; they never own feed state or approval state.

The first release is intentionally read-only plus drafts:

- agents may observe sources, distill sourced claims, publish feed items, and propose exact actions;
- agents may not approve their own proposals or execute an external side effect;
- every run ends explicitly as `run.completed`, `run.partial`, or `run.failed`;
- email, chat, calendar, and social content is untrusted data, never instructions.

## Layout

- `definitions/` contains provider-neutral runtime profiles. They deliberately use
  `afi.agent_runtime_profile.v1`; the canonical wire-level AgentDefinition remains
  `afi.agent_definition.v1` in `packages/protocol`.
- `prompts/` contains shared behavior and role-specific judgment.
- `context.md` defines fresh runtime context injected at the beginning of each run.
- `tool-catalog.json` is the provider-neutral capability catalog.
- `capability-map.md` tracks parity between Quiet Desk UI actions and agent tools.

Run `node agents/assemble.mjs <role>` to compose `prompts/base.md`, one role
prompt, the current runtime profile, the tool catalog, and the context template
into a provider-neutral execution bundle. Prompts contain judgment; services
enforce authentication, provenance, idempotency, approval, retention, and
authorization.

## Shared workspace

The optional local workspace is organized by domain rather than by actor:

```text
Quiet Desk/
├── sources/        # minimized source metadata and user-authored notes
├── feed/           # exports and user edits
├── runs/           # checkpoints and explicit completion summaries
├── drafts/         # exact proposed payloads
└── preferences/    # user-tuned filters and quiet hours
```

Both the user and agents operate on the same records. An agent must read the current record before proposing an update and must never overwrite a user edit silently. Credentials and raw private message bodies do not belong in this workspace.
