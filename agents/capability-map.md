# Quiet Desk capability map

| UI action | UI location | Agent tool | Status |
|---|---|---|---|
| Discover available providers and scopes | Agents, Sources | `list_capabilities` | Done |
| View or filter feed | Today, Slow Feed, Handled, Watching | `list_feed_items` | Done |
| Inspect feed evidence | Feed detail | `get_feed_item` | Done |
| Browse sources | Sources | `list_sources`, `get_source` | Done |
| Search visible data | Toolbar search | list tools with text filters | Done |
| Publish a sourced distillation | Provider run | `publish_feed_item` | Done |
| Correct a distillation | Feed detail | `update_feed_item` | Done |
| Remove a distillation from the active feed | Feed detail | `withdraw_feed_item` | Done |
| Propose an exact draft action | Needs You | `propose_action` | Done |
| Record a preference/correction | Feed detail | `record_feedback` | Done |
| Finish or checkpoint a run | Run detail | `complete_run` | Done |
| Approve or reject a proposal | Needs You | User-only authority | N/A |
| Change local appearance/settings | Settings | Device preference | N/A |
| Open an external source deep link | Source door | User navigation | N/A |

Parity tests should assert that every non-N/A tool appears in MCP metadata and in the base prompt. New UI actions update this table in the same change.
