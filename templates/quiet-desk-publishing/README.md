# Quiet Desk publishing workspace template

Copy this folder to a private, user-owned location outside the public product repository. A local Git repository with no remote is useful for revision history, but is not required.

Suggested structure after copying:

```text
Quiet Desk/
├── daily/
├── captures/
├── sources/
├── context/
│   ├── context.md
│   └── statements/
├── places/
├── threads/
├── evaluations/
├── change-sets/
├── drafts/
├── outbox/
├── publications/
├── runs/
├── preferences/
│   ├── channels.md
│   └── outside-context.md
└── templates/
```

Create entity-scoped folders as work appears, for example `daily/2026-08-20/`, `places/place-example/`, `drafts/2026-08-20-woon/`, and `publications/2026-08-20-woon/`.

## Rules

1. Read an existing file again before changing it; Tony may have edited it.
2. Preserve human wording in captures. Do not silently polish the source record.
3. Mark context as explicit, observed, or inferred. Inference is not permission to speak.
4. Require a human seed for new or changed beliefs, vulnerable experience, promises, and commitments.
5. Freeze each external payload with a target, revision, expiration, and hash.
6. Approval belongs to one exact payload. Any edit invalidates it.
7. Publish manually until a separately authenticated executor and public-URL receipt exist.
8. Store credentials nowhere in this workspace.
9. Minimize source material; do not copy full private conversations when a reference and short excerpt will do.
10. End every run explicitly as completed, partial, or failed.
11. A daily conversation may end with zero places and no external action. Do not manufacture an opportunity to make the ritual feel productive.
12. Treat an intentional `no new input` choice as a completed no-op, not a
    failed capture and not permission to infer the day.
13. Keep social discovery and publishing separate. A publisher may consume only
    an exact approved outbox payload and must not browse a feed to reach a
    composer.
14. An evaluation may recommend nothing. Show evaluated and rejected counts in
    the summary and preserve sources, method, results, rationale, and failures
    in the drill-down record.
15. A PR-ready change set may be prepared only after the evidence threshold is
    met. Review, merge, deployment, spend, outreach, and live claims remain
    separate human gates.

Review `preferences/outside-context.md` before gathering public material. Store one minimized record per observed source using `templates/source-record.json`; a source record is evidence, not a claim that the source matters.

Start each day with `templates/daily-conversation.md` only after the
outside-context readiness gate is met. Create `templates/place.md` only for a
specific conversation that earns consideration. Use `templates/evaluation.json`
for both recommendations and useful negative results. Create
`templates/change-set.json` only when an evaluation has earned a reversible,
PR-ready implementation. The source of truth is always the current file state,
not the agent's memory.
