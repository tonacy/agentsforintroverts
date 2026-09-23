# Quiet Desk work-item checkpoints

The studio shelf is an explicit agent-authored projection of evolving work. It
never parses the prose summary to guess items, completion, publishing stages, or
delivery. It does not modify human context or captures.

Continue using `services/runner/companion.mjs checkpoint --workspace <workspace>`
with JSON on stdin and the latest `expected_revision` from `read`. Existing
`summary`, `open_questions`, `message_ids`, and `reason` remain required.

Two optional fields are additive:

- `work_items`: the complete current shelf, up to 24 items. Omit to preserve the
  last explicit shelf. `[]` explicitly clears it. Preserve unrelated items when
  making a change. Keep IDs stable across edits, even if a title changes.
- `latest_decision`: `{ "text": "…", "work_item_id": "stable-id" }`, or `null`.
  Only include an actual evidenced decision. It must refer to a shelf item.
  Omission preserves it, except removing its item also clears the decision.

Each work item has this shape (illustrative field values, not user data):

```json
{
  "id": "stable-work-id",
  "project": "Project name",
  "title": "A concrete piece of work",
  "state": "Exploring two approaches",
  "preview": [
    { "heading": "Current direction", "text": "A short grounded preview." }
  ],
  "notes": "Full detail, open constraints, and corrections.",
  "evidence": "What supports this interpretation and what remains unverified.",
  "message_ids": [],
  "sources": [
    { "label": "Saved context", "path": ".quiet-desk/updates/00000001.json" }
  ],
  "image_path": null
}
```

`id` uses lowercase letters, digits, hyphens or underscores (1–80 characters).
`project` is at most 80 characters; `title` 180; `state` 100. State is explicit
human-readable text supplied by the companion, not a computed workflow stage.
`preview` has up to four `{heading,text}` blocks (140/700 characters); `notes`
up to 8,000; `evidence` is required (1–1,500). All items are labeled as Codex
interpretations in the app, not human quotes or receipts.

Each item needs at least one source or imported conversation message ID. Up to
20 message IDs are accepted and must exist in the Desk's imported messages.
Up to eight sources may each contain a label plus **one** of:

- `path`: an existing workspace-relative file. Absolute paths, escapes, and
  symlinks resolving outside the workspace are rejected. The app reveals files
  in Finder rather than executing them.
- `url`: credential-free HTTPS. The app opens it in the user's browser on click.

`image_path` optionally references an existing PNG/JPEG/WebP inside the workspace.
A selected design reference is a valid preview if the notes clearly identify it
as a concept, not a screenshot proving implementation. No image is required.

`latest_decision.text` is at most 500 characters. Its claim must be grounded in
its work item's evidence. Neither the runner nor the UI can establish external
publication or completion from a state label alone.

The existing CAS revision and atomic history apply to the entire checkpoint.
Safe retries retain their revision. Older checkpoints omit these fields and
remain readable; old clients cannot accidentally erase a shelf by omitting it.
`status` and `read.status` now include `work_items` and `latest_decision`.

## Loose pages and pieces

A source `path` may point at one of the person's loose pages under
`captures/<date>/`. The Desk then shows that page as gathered, so it leaves the
loose pages row. A source pointing into `drafts/<folder>/` links the work item to
that piece: its card offers "Open the piece in the studio". Pieces follow
[the piece guide](../templates/quiet-desk-publishing/piece/PIECE.md).

## Conversation guidance

Let each project's work drive its story. Offer concrete grounded suggestions
proactively. Emotional reflection is optional. Agents for Introverts can be a
publishing vehicle without making its philosophy the theme of every project.
See [companion and editorial guidance](editorial/companion-guidance.md).
