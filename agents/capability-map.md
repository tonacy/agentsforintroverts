# Quiet Desk capability map

| UI action | UI location | Agent tool | Status |
|---|---|---|---|
| View the bounded daily-conversation context projection | Today | `assemble_context`, `get_entity` | Agent path done; Mac uses synthetic projection |
| Discover available providers and scopes | Agents, Sources | `list_capabilities` | Done |
| Discover the local memory surface and authority boundary | Agent run | `context_capabilities` | Done |
| Open one bounded, idempotent context run | Agent run | `open_run` | Done |
| Assemble a watermark-bound explicit/observed/inferred context view | Agent run | `assemble_context`, `refresh_context` | Done |
| Search and inspect current context records | Agent run, future context inspector | `search_entities`, `get_entity`, `get_changes` | Done |
| Retain an uncertain current-day cue outside durable memory | Agent run | `record_scratch_cue` | Done |
| Record minimized public or work evidence | Agent run | `record_evidence` | Done |
| Propose an observed or inferred context change | Agent run | `append_context_event` | Done |
| Checkpoint and explicitly close a context run | Agent run | `checkpoint_run`, `complete_context_run` | Done |
| Confirm an explicit belief or human decision | Future user-only surface | Intentionally no agent tool | N/A |
| Record a minimized live source before synthesis | Daily Conversation, Activity | `observe_source` | Done |
| Check that bounded outside context is current and sourced | Daily Conversation | Fresh runtime context + `list_capabilities`, `observe_source` | Role defined |
| Bring an explicit human account of the day into the conversation | Today | Future authenticated owner gateway + fresh runtime context | Planned; user authority |
| Calibrate short, deep, or no-new-input conversation depth | Today | User-only input injected into fresh runtime context | N/A; user authority |
| Surface zero to three timely Places | Daily Conversation | `list_feed_items`, `get_feed_item`, `publish_feed_item`, `update_feed_item` | Role defined |
| Inspect a pilot recommendation, negative result, and evaluation counts | Daily Conversation, Activity | Runtime evaluation packet + source and feed read tools | Contract defined |
| Evaluate a bounded marketing/GEO tactic read-only | Daily Conversation → pilot evidence | Existing read/analysis primitives; no consequential effect | Planned |
| Prepare an evidence-backed pull request | Pilot evidence | Scoped repository and GitHub proposal capabilities | Planned |
| Review, merge, or deploy a pilot change | Pull request | User-only authority | N/A |
| Approve an exact social outbox payload | Places → Outbox | User-only authority | N/A |
| Publish an approved planned post without entering discovery | Outbox | Separate identity-bound publisher + public receipt | Planned |
| Inspect recurring common-ground threads | Today → supporting Thread | Runtime context + `list_feed_items`, `get_feed_item` | Contract defined |
| Inspect the living context used for fit | Today → Inside | Runtime context injection | Contract defined |
| View or filter source activity | Activity | `list_feed_items` | Done |
| Inspect activity evidence | Activity detail | `get_feed_item` | Done |
| Browse sources | Sources | `list_sources`, `get_source` | Done |
| Search visible data | Toolbar search | list tools with text filters | Done |
| Publish or extend a sourced recurring distillation | Provider run | `publish_feed_item`, `update_feed_item` | Done |
| Correct a distillation | Activity detail | `update_feed_item` | Done |
| Remove a distillation from active views | Activity detail | `withdraw_feed_item` | Done |
| Propose one exact human handoff | Thread detail | `propose_action` | Done |
| Record a context correction or preference | Thread or activity detail | `record_feedback` | Done |
| Finish or checkpoint a run | Run detail | `complete_run` | Done |
| Approve or reject an exact handoff | Thread detail | User-only authority | N/A |
| Change local appearance/settings | Settings | Device preference | N/A |
| Open an external source deep link | Source door | User navigation | N/A |

The Daily Conversation activation role stops before `propose_action`; choosing a
Place authorizes no external action. Marketing/GEO evaluation and social
publishing are pilot contracts, not proven live capabilities. A prepared pull
request still leaves review, merge, and deployment to the user. Social discovery
and publishing require separate permissions; the publisher may consume only an
exact approved outbox payload and must return a public receipt. Parity tests
assert that every currently implemented named tool appears in MCP metadata and
in the base prompt. Context tools appear only when a server-configured local
Context Kernel adapter is present; caller-supplied actor or approval authority is
never accepted. The bundled Mac app remains a synthetic projection; the
runtime context blocks above define context parity for the future read-only hub
adapter and must be implemented before calling the product live-connected.
Conversation depth, lived-day capture, context confirmation, and Place selection
are user-authored authority. Ordinary agents may propose conversation outcomes
and Places through `append_context_event`, but they may not choose or persist
those human inputs on Tony's behalf.
