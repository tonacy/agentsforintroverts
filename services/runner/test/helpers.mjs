import { cp, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
export const repoRoot = resolve(here, "../../..");
export const templateRoot = resolve(repoRoot, "templates/quiet-desk-publishing");
export const fixturesRoot = resolve(here, "fixtures");

/** A fresh workspace copied from the checked-in template, in a temp dir. */
export async function makeWorkspace() {
  const root = await mkdtemp(join(tmpdir(), "afi-runner-"));
  await cp(templateRoot, root, { recursive: true });
  for (const dir of ["daily", "sources", "places", "runs", "drafts"]) {
    await mkdir(join(root, dir), { recursive: true });
  }
  return root;
}

export async function writeCapture(workspace, date, body = defaultCaptureBody, frontmatter = {}) {
  const fm = {
    id: `capture_${date.replaceAll("-", "")}_test`,
    created_at: `${date}T07:30:00Z`,
    author: "human",
    source_kind: "written_note",
    status: "captured",
    ...frontmatter,
  };
  const text = `---\n${Object.entries(fm)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n")}\n---\n\n${body}`;
  const dir = join(workspace, "daily", date);
  await mkdir(dir, { recursive: true });
  const path = join(dir, "capture.md");
  await writeFile(path, text);
  return path;
}

export const defaultCaptureBody = `# Thursday

## Human seed

Wired the subscribe endpoint. Deleted the seven-second opening; the page starts settled now. Avoided the Woon essay again.

## Why it matters now

The site can finally hold a list before the first essay goes out.

## Lived evidence

Spent the morning on the hub tests. Afternoon went nowhere.

## Current position

- Agents may draft. They never send.
- A landing page should show the practice, not describe it.

## Unresolved

Whether the essay title overclaims.

## Commitments present

None.
`;

export function sourceRecord(overrides = {}) {
  const id = overrides.source_item_id ?? "source_20260904_example";
  return {
    schema: "afi.local_source_record.v1",
    source_item_id: id,
    external_id: overrides.url ?? `https://example.com/${id}`,
    kind: "public_web",
    url: overrides.url ?? `https://example.com/${id}`,
    captured_at: "2026-09-04T06:00:00Z",
    selected_at: "2026-09-04T06:00:00Z",
    content_hash: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
    title: "Example source",
    author: "Example",
    excerpt: "An example excerpt.",
    evidence_class: "observed_public",
    public_revalidation: {
      status: "verified",
      verified_at: "2026-09-04T06:00:00Z",
      verified_url: overrides.url ?? `https://example.com/${id}`,
      authenticated_origin_retained: false,
    },
    retention: {
      class: "selected_public_source",
      review_or_delete_at: "2026-10-04T06:00:00Z",
      promotion_event_id: null,
    },
    hub_eligible: true,
    metadata: {
      published_at: "2026-09-01T00:00:00Z",
      retrieval_method: "public_web",
      visibility: "public",
      notes: "test fixture",
    },
    ...overrides,
  };
}

export async function writeSource(workspace, record) {
  const path = join(workspace, "sources", `${record.source_item_id}.json`);
  await writeFile(path, `${JSON.stringify(record, null, 2)}\n`);
  return path;
}

/** Two verified sources inside the default window for 2026-09-04. */
export async function writeReadySources(workspace) {
  const a = sourceRecord({ source_item_id: "source_20260904_alpha", kind: "rss", title: "Alpha" });
  const b = sourceRecord({ source_item_id: "source_20260903_beta", captured_at: "2026-09-03T06:00:00Z", title: "Beta" });
  await writeSource(workspace, a);
  await writeSource(workspace, b);
  return [a.source_item_id, b.source_item_id];
}
