/**
 * Today's capture file, created from the workspace template so Tony can open
 * it and write. It is never overwritten: the words in it are his.
 */

import { join } from "node:path";
import { capturePath, compactDate, readTextIfExists, weekdayOf, writeText } from "./workspace.mjs";

const FALLBACK_TEMPLATE = `---
id: capture_YYYYMMDD_slug
created_at: YYYY-MM-DDTHH:MM:SSZ
author: human
source_kind: voice_note_or_written_note
status: captured
---

# Capture title

## Human seed

Preserve Tony's wording here. Do not silently rewrite this section.

## Why it matters now

## Lived evidence

## Current position

## Unresolved

## Commitments present
`;

export async function newCapture({ workspace, date, now = () => new Date() }) {
  const path = capturePath(workspace, date);
  if ((await readTextIfExists(path)) !== null) {
    return { path, created: false };
  }

  const template = (await readTextIfExists(join(workspace, "templates", "capture.md"))) ?? FALLBACK_TEMPLATE;
  const stamp = now().toISOString().replace(/\.\d{3}Z$/, "Z");
  const text = template
    .replace("id: capture_YYYYMMDD_slug", `id: capture_${compactDate(date)}_day`)
    .replace("created_at: YYYY-MM-DDTHH:MM:SSZ", `created_at: ${stamp}`)
    .replace("source_kind: voice_note_or_written_note", "source_kind: written_note")
    .replace("# Capture title", `# ${weekdayOf(date)}`);

  await writeText(path, text);
  return { path, created: true };
}
