import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  assertFullCommitSha,
  assertReleaseNode,
  getSourceState,
  repoRoot,
  sleep,
} from "./site-release-utils.mjs";

assertReleaseNode();

const canonicalOrigin = "https://agentsforintroverts.com";
const outputDirectory = join(repoRoot, "out");
const routeExpectations = [
  { path: "/", file: "index.html" },
  { path: "/manifesto/", file: "manifesto/index.html" },
  { path: "/made-with/", file: "made-with/index.html" },
];
const requiredFiles = [
  "index.html",
  "manifesto/index.html",
  "made-with/index.html",
  "robots.txt",
  "sitemap.xml",
  "version.json",
  "_headers",
  "opengraph-image.png",
  "twitter-image.png",
  "manifesto/opengraph-image.png",
  "manifesto/twitter-image.png",
  "favicon.ico",
  "apple-icon.png",
];

function fail(message) {
  throw new Error(message);
}

function requireText(haystack, needle, label) {
  if (!haystack.includes(needle)) {
    fail(`${label} is missing ${JSON.stringify(needle)}.`);
  }
}

function parseArguments(argv) {
  const parsed = { baseUrl: null, expectedCommit: null };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--base-url") {
      parsed.baseUrl = argv[index + 1] ?? fail("--base-url requires a value.");
      index += 1;
    } else if (argument === "--expected-commit") {
      parsed.expectedCommit =
        argv[index + 1] ?? fail("--expected-commit requires a value.");
      index += 1;
    } else {
      fail(`Unknown argument: ${argument}`);
    }
  }

  if (parsed.expectedCommit) assertFullCommitSha(parsed.expectedCommit);
  if (parsed.baseUrl) {
    const url = new URL(parsed.baseUrl);
    if (url.protocol !== "https:") fail("--base-url must use HTTPS.");
    parsed.baseUrl = url.origin;
  }

  return parsed;
}

function assertVersion(version, expected) {
  const required = {
    schemaVersion: 1,
    service: "agentsforintroverts.com",
    commitSha: expected.commitSha,
    branch: expected.branch,
    sourceTree: expected.sourceTree,
    buildMode: "static-export",
  };

  for (const [key, value] of Object.entries(required)) {
    if (version[key] !== value) {
      fail(
        `/version.json ${key} must be ${JSON.stringify(value)}; received ${JSON.stringify(version[key])}.`,
      );
    }
  }
}

function assertPageMetadata(html, path) {
  const canonical = `${canonicalOrigin}${path}`;
  requireText(html, `rel="canonical" href="${canonical}"`, `${path} canonical`);
  requireText(html, `property="og:url" content="${canonical}"`, `${path} Open Graph URL`);
  requireText(html, "property=\"og:image:alt\"", `${path} Open Graph metadata`);
  requireText(html, "name=\"twitter:image:alt\"", `${path} Twitter metadata`);
}

function outputPathForUrlPath(pathname) {
  const decoded = decodeURIComponent(pathname);
  if (decoded === "/") return join(outputDirectory, "index.html");
  if (decoded.endsWith("/")) {
    return join(outputDirectory, decoded.slice(1), "index.html");
  }
  return join(outputDirectory, decoded.slice(1));
}

async function assertInternalReferences(html, sourcePath) {
  const attributePattern = /\b(?:href|src)="([^"]+)"/g;
  for (const match of html.matchAll(attributePattern)) {
    const reference = match[1];
    if (
      reference.startsWith("http://") ||
      reference.startsWith("https://") ||
      reference.startsWith("mailto:") ||
      reference.startsWith("data:") ||
      reference.startsWith("#")
    ) {
      continue;
    }

    const resolved = new URL(reference, `${canonicalOrigin}${sourcePath}`);
    const targetPath = outputPathForUrlPath(resolved.pathname);
    try {
      await access(targetPath);
    } catch {
      fail(`${sourcePath} references missing output ${resolved.pathname}.`);
    }

    if (resolved.hash && resolved.pathname.endsWith("/")) {
      const targetHtml = await readFile(targetPath, "utf8");
      const id = decodeURIComponent(resolved.hash.slice(1));
      if (!targetHtml.includes(`id="${id}"`)) {
        fail(`${sourcePath} references missing anchor ${resolved.pathname}${resolved.hash}.`);
      }
    }
  }
}

async function assertPngDimensions(relativePath, width, height) {
  const buffer = await readFile(join(outputDirectory, relativePath));
  const signature = buffer.subarray(0, 8).toString("hex");
  if (signature !== "89504e470d0a1a0a") fail(`${relativePath} is not a PNG.`);
  const actualWidth = buffer.readUInt32BE(16);
  const actualHeight = buffer.readUInt32BE(20);
  if (actualWidth !== width || actualHeight !== height) {
    fail(
      `${relativePath} must be ${width}x${height}; received ${actualWidth}x${actualHeight}.`,
    );
  }
}

async function verifyLocal(expectedCommit) {
  for (const relativePath of requiredFiles) {
    try {
      await access(join(outputDirectory, relativePath));
    } catch {
      fail(`Static export is missing out/${relativePath}.`);
    }
  }

  const source = getSourceState();
  const commitSha = expectedCommit ?? source.commitSha;
  assertFullCommitSha(commitSha);
  const version = JSON.parse(
    await readFile(join(outputDirectory, "version.json"), "utf8"),
  );
  assertVersion(version, {
    commitSha,
    branch: source.branch,
    sourceTree: source.sourceTree,
  });

  for (const route of routeExpectations) {
    const html = await readFile(join(outputDirectory, route.file), "utf8");
    assertPageMetadata(html, route.path);
    await assertInternalReferences(html, route.path);
  }

  const robots = await readFile(join(outputDirectory, "robots.txt"), "utf8");
  requireText(
    robots,
    `Sitemap: ${canonicalOrigin}/sitemap.xml`,
    "robots.txt",
  );
  const sitemap = await readFile(join(outputDirectory, "sitemap.xml"), "utf8");
  for (const route of routeExpectations) {
    requireText(sitemap, `<loc>${canonicalOrigin}${route.path}</loc>`, "sitemap.xml");
  }

  const headers = await readFile(join(outputDirectory, "_headers"), "utf8");
  for (const expected of [
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "camera=()",
    "geolocation=()",
    "microphone=()",
    "Referrer-Policy: strict-origin-when-cross-origin",
    "X-Content-Type-Options: nosniff",
    "X-Frame-Options: DENY",
    "Cache-Control: public, max-age=31536000, immutable",
    "Cache-Control: no-store",
  ]) {
    requireText(headers, expected, "_headers");
  }

  await Promise.all([
    assertPngDimensions("opengraph-image.png", 1200, 630),
    assertPngDimensions("twitter-image.png", 1200, 630),
    assertPngDimensions("manifesto/opengraph-image.png", 1200, 630),
    assertPngDimensions("manifesto/twitter-image.png", 1200, 630),
  ]);

  process.stdout.write(
    `Verified static website export for ${commitSha.slice(0, 12)} (${source.branch}, ${source.sourceTree}).\n`,
  );
}

async function fetchWithRetry(url, options = {}) {
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        cache: "no-store",
        redirect: options.redirect ?? "follow",
      });
      if (response.status < 500 || attempt === 4) return response;
      lastError = new Error(`${url} returned ${response.status}.`);
    } catch (error) {
      lastError = error;
    }
    await sleep(attempt * 1_000);
  }
  throw lastError;
}

function assertStatus(response, url) {
  if (!response.ok) fail(`${url} returned HTTP ${response.status}.`);
}

function assertHeader(headers, name, expected) {
  const value = headers.get(name) ?? "";
  if (!value.toLowerCase().includes(expected.toLowerCase())) {
    fail(`${name} must include ${JSON.stringify(expected)}; received ${JSON.stringify(value)}.`);
  }
}

async function verifyPublic(baseUrl, expectedCommit) {
  const commitSha = expectedCommit ?? getSourceState().commitSha;
  assertFullCommitSha(commitSha);

  let rootHtml = "";
  for (const route of routeExpectations) {
    const url = `${baseUrl}${route.path}`;
    const response = await fetchWithRetry(url);
    assertStatus(response, url);
    if (response.url !== `${canonicalOrigin}${route.path}`) {
      fail(`${url} resolved to unexpected canonical URL ${response.url}.`);
    }
    const html = await response.text();
    assertPageMetadata(html, route.path);
    if (route.path === "/") {
      rootHtml = html;
      for (const [name, expected] of [
        ["content-security-policy", "base-uri 'self'"],
        ["content-security-policy", "form-action 'self'"],
        ["content-security-policy", "frame-ancestors 'none'"],
        ["permissions-policy", "camera=()"],
        ["permissions-policy", "geolocation=()"],
        ["permissions-policy", "microphone=()"],
        ["referrer-policy", "strict-origin-when-cross-origin"],
        ["x-content-type-options", "nosniff"],
        ["x-frame-options", "DENY"],
      ]) {
        assertHeader(response.headers, name, expected);
      }
    }
  }

  for (const path of [
    "/robots.txt",
    "/sitemap.xml",
    "/opengraph-image.png",
    "/twitter-image.png",
    "/manifesto/opengraph-image.png",
    "/manifesto/twitter-image.png",
    "/favicon.ico",
    "/apple-icon.png",
  ]) {
    const url = `${baseUrl}${path}`;
    const response = await fetchWithRetry(url);
    assertStatus(response, url);
    if (path === "/robots.txt") {
      requireText(
        await response.text(),
        `Sitemap: ${canonicalOrigin}/sitemap.xml`,
        "public robots.txt",
      );
    }
  }

  const versionUrl = `${baseUrl}/version.json`;
  const versionResponse = await fetchWithRetry(versionUrl);
  assertStatus(versionResponse, versionUrl);
  assertHeader(versionResponse.headers, "cache-control", "no-store");
  const version = await versionResponse.json();
  assertVersion(version, {
    commitSha,
    branch: "main",
    sourceTree: "clean",
  });

  const staticAssetMatch = rootHtml.match(/(?:src|href)="(\/_next\/static\/[^"]+)"/);
  if (!staticAssetMatch) fail("The public homepage has no emitted Next.js static asset.");
  const staticAssetUrl = `${baseUrl}${staticAssetMatch[1]}`;
  const staticAssetResponse = await fetchWithRetry(staticAssetUrl);
  assertStatus(staticAssetResponse, staticAssetUrl);
  assertHeader(staticAssetResponse.headers, "cache-control", "immutable");
  assertHeader(staticAssetResponse.headers, "cache-control", "max-age=31536000");

  process.stdout.write(
    `Verified public website at ${baseUrl} for ${commitSha}.\n`,
  );
}

const options = parseArguments(process.argv.slice(2));
if (options.baseUrl) {
  await verifyPublic(options.baseUrl, options.expectedCommit);
} else {
  await verifyLocal(options.expectedCommit);
}
