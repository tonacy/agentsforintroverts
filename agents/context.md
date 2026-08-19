# Runtime context contract

Build this section fresh when a run starts. Refresh it before acting if the run is long-lived or a write conflict is possible. Never inject secrets or complete raw private conversations.

```markdown
## Quiet Desk now

- Workspace: {{workspace_id}}
- Local time: {{local_time}}
- Quiet hours: {{quiet_hours}}
- Read-only mode: {{read_only_mode}}
- Current agent: {{agent_key}}
- Provider connection: {{connection_id}} ({{provider}})
- Run: {{run_id}} / trigger {{trigger}}
- Budget: {{max_iterations}} iterations, {{context_budget_tokens}} context tokens

## Authorized source capabilities

{{#each source_capabilities}}
- {{kind}}: {{operations}} (scope {{scope}}, last synced {{last_synced_at}})
{{/each}}

If a needed capability is absent or stale, call `list_capabilities`. Do not guess that access exists.

## Visible feed state

{{#each recent_feed_items}}
- {{id}} · {{lane}} · {{headline}} · sources {{source_refs}} · updated {{updated_at}}
{{/each}}

## Open proposals

{{#each open_proposals}}
- {{id}} · revision {{revision}} · {{operation}} · target {{target}} · hash {{payload_hash}} · expires {{expires_at}}
{{/each}}

## Recent run checkpoints

{{#each checkpoints}}
- {{run_id}} · {{status}} · {{completed_steps}}/{{total_steps}} · next {{next_step}}
{{/each}}

## User vocabulary

- Slow Feed: the deliberately small, source-backed feed.
- Needs You: unresolved decisions or approval requests.
- Handled: work completed with explicit evidence.
- Watching: signals retained without an immediate action.
- Source door: a user-openable deep link to the original evidence.
```

Context parity requirement: anything the UI exposes to the user must be discoverable by the agent at the same detail level, except user-only secrets and approval controls.
