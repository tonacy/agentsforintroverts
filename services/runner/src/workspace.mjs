/**
 * Reading and writing the Quiet Desk workspace.
 *
 * The workspace is Tony's, not the runner's: the rules in
 * `templates/quiet-desk-publishing/README.md` apply. The helpers here read a
 * file before it is changed, never rewrite a human capture, and keep every
 * write inside the workspace root.
 */

import { createHash, randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export const SOURCE_SCHEMA = "afi.local_source_record.v1";
export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

export function slugify(text, max = 40) {
  const slug = String(text)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, max)
    .replace(/-$/, "");
  return slug || "untitled";
}

export function compactDate(date) {
  return date.replaceAll("-", "");
}

export function weekdayOf(date) {
  const [y, m, d] = date.split("-").map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

export function makeRunId(date, now) {
  const stamp = now.toISOString().slice(11, 19).replaceAll(":", "");
  return `run_${compactDate(date)}_${stamp}_${randomBytes(2).toString("hex")}`;
}

export async function ensureDir(path) {
  await mkdir(path, { recursive: true });
}

export async function writeText(path, text) {
  await ensureDir(dirname(path));
  await writeFile(path, text);
}

export async function writeJson(path, value) {
  await writeText(path, `${JSON.stringify(value, null, 2)}\n`);
}

export async function readTextIfExists(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") return null;
    throw error;
  }
}

export async function readJsonIfExists(path) {
  const text = await readTextIfExists(path);
  return text === null ? null : JSON.parse(text);
}

export async function removeFile(path) {
  await unlink(path);
}

/** A very small frontmatter parser: `key: value` lines between `---` fences. */
export function parseFrontmatter(text) {
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (!match) return { frontmatter: {}, body: text };
  const frontmatter = {};
  for (const line of match[1].split("\n")) {
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    frontmatter[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return { frontmatter, body: text.slice(match[0].length) };
}

/** The lines of a `## heading` section, up to the next `## `. */
export function sectionOf(markdown, heading) {
  const lines = markdown.split("\n");
  const start = lines.findIndex((line) => line.trim().toLowerCase() === `## ${heading}`.toLowerCase());
  if (start === -1) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^##\s/.test(line));
  return rest.slice(0, end === -1 ? rest.length : end).join("\n").trim();
}

export function bulletsOf(sectionText) {
  if (!sectionText) return [];
  return sectionText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+/.test(line))
    .map((line) => line.replace(/^[-*]\s+/, "").trim())
    .filter((line) => line.length > 0 && !/^none\.?$/i.test(line));
}

export function capturePath(workspace, date) {
  return join(workspace, "daily", date, "capture.md");
}

/**
 * Tony's account of the day, in his words. Returned verbatim: the runner may
 * quote it, cite it, and hash it, but never rewrites it.
 */
export async function loadCapture(workspace, date) {
  const path = capturePath(workspace, date);
  const raw = await readTextIfExists(path);
  if (raw === null) return null;
  const { frontmatter, body } = parseFrontmatter(raw);
  return {
    path,
    relativePath: `daily/${date}/capture.md`,
    frontmatter,
    body,
    raw,
    sha256: sha256(raw),
    authoredBy: frontmatter.author ?? "unknown",
    humanSeed: sectionOf(body, "Human seed"),
    positions: bulletsOf(sectionOf(body, "Current position")),
    unresolved: bulletsOf(sectionOf(body, "Unresolved")),
    commitments: bulletsOf(sectionOf(body, "Commitments present")),
  };
}

export async function listSourceFiles(workspace) {
  const dir = join(workspace, "sources");
  let names;
  try {
    names = await readdir(dir);
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }
  return names.filter((name) => name.endsWith(".json")).sort().map((name) => join(dir, name));
}

export async function loadAllSources(workspace) {
  const files = await listSourceFiles(workspace);
  const records = [];
  for (const path of files) {
    const record = await readJsonIfExists(path);
    if (record && record.schema === SOURCE_SCHEMA) records.push({ path, record });
  }
  return records;
}

/**
 * The outside-context gate's inputs: only records revalidated as public and
 * captured inside the research window count. Anything else stays on disk but
 * cannot support a claim today.
 */
export async function loadSources(workspace, { date, windowDays = 7 }) {
  const dayStart = Date.parse(`${date}T00:00:00Z`);
  const windowStart = dayStart - windowDays * 86_400_000;
  // The date is Tony's local day; captured_at is UTC. A collect run late in
  // the local evening lands on the next UTC date, so the window closes a day
  // after the date ends rather than at UTC midnight.
  const dayEnd = dayStart + 2 * 86_400_000;
  const all = await loadAllSources(workspace);
  const seen = new Set();
  return all
    .map(({ record }) => record)
    .filter((record) => record.public_revalidation?.status === "verified")
    .filter((record) => {
      const captured = Date.parse(record.captured_at);
      return Number.isFinite(captured) && captured >= windowStart && captured < dayEnd;
    })
    .sort((a, b) => Date.parse(b.captured_at) - Date.parse(a.captured_at))
    .filter(record => { const key = record.external_id ?? record.url; if (seen.has(key)) return false; seen.add(key); return true; });
}
