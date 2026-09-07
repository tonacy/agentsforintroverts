/**
 * The smallest collector: unauthenticated GETs of RSS/Atom feeds and public
 * pages listed in `preferences/feeds.json`, minimized into
 * `afi.local_source_record.v1` files.
 *
 * Because the fetch is unauthenticated, what it observed is by construction
 * publicly accessible, so `public_revalidation.status` is `verified`. Nothing
 * authenticated is ever touched (see docs/SOURCE_AND_RETENTION_POLICY.md), and
 * the record keeps a title, a short excerpt, and a hash rather than a body.
 */

import { join } from "node:path";
import {
  compactDate,
  loadAllSources,
  readJsonIfExists,
  readTextIfExists,
  removeFile,
  sha256,
  slugify,
  writeJson,
} from "./workspace.mjs";

export const USER_AGENT = "agents-for-introverts-collector/0.1 (+https://agentsforintroverts.com; read-only)";
export const EXCERPT_MAX = 280;
export const RETENTION_DAYS = 30;
const DEFAULT_TIMEOUT_MS = 10_000;

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeEntities(text) {
  return String(text)
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

function unwrapCdata(text) {
  return String(text).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}

export function stripTags(html) {
  return decodeEntities(
    decodeEntities(unwrapCdata(html))
      .replace(/<(script|style|noscript)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<\/?(p|div|br|li|h[1-6]|blockquote|tr|section|article)\b[^>]*>/gi, " ")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function tagText(block, tag) {
  const match = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i").exec(block);
  return match ? match[1] : "";
}

function toIso(value) {
  const parsed = Date.parse(String(value).trim());
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function atomLink(entry) {
  const links = [...entry.matchAll(/<link\b([^>]*)\/?>/gi)].map((m) => m[1]);
  const pick = (predicate) => links.find(predicate);
  const chosen =
    pick((attrs) => /rel=["']alternate["']/i.test(attrs)) ?? pick((attrs) => !/rel=/i.test(attrs)) ?? links[0] ?? "";
  const href = /href=["']([^"']+)["']/i.exec(chosen);
  return href ? decodeEntities(href[1]) : "";
}

export function parseFeed(xml) {
  const text = String(xml);
  const isAtom = /<feed\b/i.test(text) && !/<rss\b/i.test(text);
  const blocks = [...text.matchAll(isAtom ? /<entry\b[\s\S]*?<\/entry>/gi : /<item\b[\s\S]*?<\/item>/gi)].map((m) => m[0]);
  return blocks.map((block) => ({
    title: stripTags(tagText(block, "title")),
    link: isAtom ? atomLink(block) : stripTags(tagText(block, "link")) || decodeEntities(tagText(block, "guid")).trim(),
    published: toIso(
      isAtom ? tagText(block, "published") || tagText(block, "updated") : tagText(block, "pubDate") || tagText(block, "dc:date"),
    ),
    summary: stripTags(isAtom ? tagText(block, "summary") || tagText(block, "content") : tagText(block, "description") || tagText(block, "content:encoded")),
  }));
}

export function extractPage(html) {
  const text = String(html).replace(/<(script|style|noscript|nav|header|footer)\b[\s\S]*?<\/\1>/gi, " ");
  const description =
    /<meta\s+(?:[^>]*?\s)?(?:name|property)=["'](?:description|og:description)["'][^>]*?content=["']([^"']*)["']/i.exec(text)?.[1] ??
    /<meta\s+(?:[^>]*?\s)?content=["']([^"']*)["'][^>]*?(?:name|property)=["'](?:description|og:description)["']/i.exec(text)?.[1] ??
    "";
  const paragraphs = [...text.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => stripTags(m[1]))
    .filter((p) => p.length > 0)
    .slice(0, 2);
  return {
    title: stripTags(tagText(text, "title")),
    description: decodeEntities(description).trim(),
    text: paragraphs.join(" "),
  };
}

export function canonicalUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    for (const key of [...parsed.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|ref$)/i.test(key)) parsed.searchParams.delete(key);
    }
    parsed.hostname = parsed.hostname.toLowerCase();
    let out = parsed.toString();
    if (out.endsWith("/") && parsed.pathname !== "/") out = out.slice(0, -1);
    return out;
  } catch {
    return String(url).trim();
  }
}

function excerptOf(text) {
  const clean = String(text).replace(/\s+/g, " ").trim();
  return clean.length <= EXCERPT_MAX ? clean : `${clean.slice(0, EXCERPT_MAX - 1).trimEnd()}…`;
}

async function fetchText(fetchImpl, url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "user-agent": USER_AGENT, accept: "application/rss+xml, application/atom+xml, application/xml, text/html;q=0.9, */*;q=0.5" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

function buildRecord({ item, now, label }) {
  const capturedAt = now.toISOString();
  const observed = `${item.title}\n${item.excerpt}`;
  return {
    schema: "afi.local_source_record.v1",
    source_item_id: item.source_item_id,
    external_id: item.canonical,
    kind: item.kind,
    url: item.canonical,
    captured_at: capturedAt,
    selected_at: capturedAt,
    content_hash: `sha256:${sha256(observed)}`,
    title: item.title || item.canonical,
    author: label,
    excerpt: item.excerpt,
    evidence_class: "observed_public",
    public_revalidation: {
      status: "verified",
      verified_at: capturedAt,
      verified_url: item.canonical,
      authenticated_origin_retained: false,
    },
    retention: {
      class: "selected_public_source",
      review_or_delete_at: new Date(now.getTime() + RETENTION_DAYS * 86_400_000).toISOString(),
      promotion_event_id: null,
    },
    hub_eligible: true,
    metadata: {
      published_at: item.published ?? null,
      retrieval_method: item.kind === "rss" ? "rss" : "public_web",
      visibility: "public",
      notes: `Unauthenticated public fetch (${item.kind}). Only the title, a short excerpt, and a content hash were retained.`,
    },
  };
}

export async function collect({ workspace, fetch: fetchImpl = globalThis.fetch, now = () => new Date(), max = 20, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const stamp = now();
  const preferences = (await readJsonIfExists(join(workspace, "preferences", "feeds.json"))) ?? { feeds: [], pages: [] };
  const existing = new Set((await loadAllSources(workspace)).map(({ record }) => record.external_id));
  const written = [];
  const skipped = [];
  const errors = [];
  const candidates = [];

  for (const feed of preferences.feeds ?? []) {
    try {
      const xml = await fetchText(fetchImpl, feed.url, timeoutMs);
      for (const item of parseFeed(xml)) {
        if (!item.link) continue;
        candidates.push({ kind: "rss", url: item.link, title: item.title, excerpt: excerptOf(item.summary), published: item.published, label: feed.label ?? feed.url });
      }
    } catch (error) {
      errors.push({ url: feed.url, error: error instanceof Error ? error.message : String(error) });
    }
  }

  for (const page of preferences.pages ?? []) {
    try {
      const html = await fetchText(fetchImpl, page.url, timeoutMs);
      const extracted = extractPage(html);
      candidates.push({
        kind: "public_web",
        url: page.url,
        title: extracted.title || page.label || page.url,
        excerpt: excerptOf([extracted.description, extracted.text].filter(Boolean).join(" ")),
        published: null,
        label: page.label ?? page.url,
      });
    } catch (error) {
      errors.push({ url: page.url, error: error instanceof Error ? error.message : String(error) });
    }
  }

  const usedIds = new Set();
  for (const candidate of candidates) {
    const canonical = canonicalUrl(candidate.url);
    if (existing.has(canonical)) {
      skipped.push(canonical);
      continue;
    }
    if (written.length >= max) break;
    let id = `source_${compactDate(stamp.toISOString().slice(0, 10))}_${slugify(candidate.title || canonical)}`;
    let suffix = 2;
    while (usedIds.has(id) || (await readTextIfExists(join(workspace, "sources", `${id}.json`))) !== null) {
      id = `${id.replace(/-\d+$/, "")}-${suffix++}`;
    }
    usedIds.add(id);
    const record = buildRecord({ item: { ...candidate, canonical, source_item_id: id }, now: stamp, label: candidate.label });
    await writeJson(join(workspace, "sources", `${id}.json`), record);
    existing.add(canonical);
    written.push(id);
  }

  return { written, skipped, errors };
}

/** Retention is a ceiling: delete expired records unless Tony promoted them. */
export async function prune({ workspace, now = () => new Date() }) {
  const cutoff = now().getTime();
  const deleted = [];
  const kept = [];
  for (const { path, record } of await loadAllSources(workspace)) {
    const reviewAt = Date.parse(record.retention?.review_or_delete_at ?? "");
    const promoted = Boolean(record.retention?.promotion_event_id);
    if (Number.isFinite(reviewAt) && reviewAt < cutoff && !promoted) {
      await removeFile(path);
      deleted.push(record.source_item_id);
    } else {
      kept.push(record.source_item_id);
    }
  }
  return { deleted, kept };
}
