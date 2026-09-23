/**
 * The person's loose pages: things put on the Desk in the moment, in their
 * own words. The Mac app writes them under `captures/<date>/`; this module
 * only reads them, so an agent can see what is waiting to be talked through.
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function unquote(value) {
  if (!value.startsWith('"')) return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function parsePage(text) {
  if (!text.startsWith("---\n")) return null;
  const end = text.indexOf("\n---\n", 3);
  if (end === -1) return null;
  const fields = {};
  for (const line of text.slice(4, end).split("\n")) {
    const colon = line.indexOf(":");
    if (colon > 0) fields[line.slice(0, colon).trim()] = unquote(line.slice(colon + 1).trim());
  }
  return { fields, body: text.slice(end + 5).trim() };
}

/** Loose, human-authored pages, newest first. Set-aside pages stay out. */
export async function loosePages(root, { limit = 20, maxText = 2000 } = {}) {
  let days;
  try {
    days = (await readdir(join(root, "captures"))).filter((d) => DAY.test(d));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const pages = [];
  for (const day of days) {
    for (const name of (await readdir(join(root, "captures", day))).filter((n) => n.endsWith(".md"))) {
      const parsed = parsePage(await readFile(join(root, "captures", day, name), "utf8"));
      if (!parsed || parsed.fields.author !== "human" || parsed.fields.status !== "loose") continue;
      pages.push({
        path: `captures/${day}/${name}`,
        created_at: parsed.fields.created_at ?? null,
        author: "human",
        kind: parsed.fields.source_kind ?? "quick_note",
        text: parsed.body.slice(0, maxText),
        url: parsed.fields.url ?? null,
        attachment: parsed.fields.attachment ?? null,
      });
    }
  }
  return pages
    .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? "") || b.path.localeCompare(a.path))
    .slice(0, limit);
}
