import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { request as httpsRequest } from "node:https";
import { codexProvider } from "./providers/harness.mjs";
import { join } from "node:path";
import { writeJson } from "./workspace.mjs";
import { readPreference } from "./preferences.mjs";
import { collect } from "./collect.mjs";

function publicAddress(address) {
  if (isIP(address) === 6) return /^[23][0-9a-f]{3}:/i.test(address);
  if (isIP(address) !== 4) return false;
  const [a, b] = address.split(".").map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19)));
}

export async function validatePublicURL(value, resolveHost = lookup) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.hostname.endsWith(".local") || url.hostname === "localhost") throw new Error("Only public HTTPS source URLs are supported.");
  const addresses = await resolveHost(url.hostname, { all: true });
  if (!addresses.length || addresses.some(({ address }) => !publicAddress(address))) throw new Error("Source URL does not resolve to a public address.");
  return url;
}

// No authentication, redirect-by-redirect validation, and bounded response size.
export async function publicFetch(value, options) {
  let url = value;
  for (let redirects = 0; redirects <= 5; redirects++) {
    let addresses;
    const parsed = await validatePublicURL(url, async (host, settings) => {
      addresses = await lookup(host, settings);
      return addresses;
    });
    // Pin the verified DNS answer for this request; a second DNS lookup could
    // otherwise rebind a public-looking source URL to a private service.
    const response = await new Promise((resolve, reject) => {
      const request = httpsRequest(parsed, {
        method: "GET", signal: options.signal, headers: options.headers,
        lookup: (_host, settings, callback) => settings.all
          ? callback(null, addresses)
          : callback(null, addresses[0].address, addresses[0].family),
      }, resolve);
      request.on("error", reject); request.end();
    });
    const status = response.statusCode ?? 0;
    if ([301, 302, 303, 307, 308].includes(status)) {
      const location = response.headers.location;
      response.destroy();
      if (!location) throw new Error("Source redirected without a destination.");
      url = new URL(location, url).href;
      continue;
    }
    const ok = status >= 200 && status < 300;
    const contentType = response.headers["content-type"] ?? "";
    if (!ok) { response.destroy(); return { ok, status }; }
    if (contentType && !/text\/|application\/(?:xhtml\+xml|xml|rss\+xml|atom\+xml)/i.test(contentType)) {
      response.destroy();
      throw new Error("Source is not a readable public text page.");
    }
    return { ok, status, async text() {
      let size = 0; const chunks = [];
      for await (const chunk of response) {
        size += chunk.length;
        if (size > 2_000_000) throw new Error("Source page is too large.");
        chunks.push(chunk);
      }
      return Buffer.concat(chunks).toString("utf8");
    } };
  }
  throw new Error("Too many source redirects.");
}

export async function researchOutside({ workspace, date, topics, provider, collectImpl = collect }) {
  if (typeof topics !== "string" || !topics.trim() || topics.length > 2000) throw new Error("Describe the public topics to research (up to 2,000 characters).");
  await writeJson(join(workspace, "preferences", "check-in.json"), { public_topics: topics });
  const preference = await readPreference(workspace);
  const agent = provider ?? codexProvider({ model: preference?.provider === "codex" ? preference.model : null, config: ['web_search="live"', "features.shell_tool=false"] });
  const answer = await agent.converse({
    system: "Research public outside context for Quiet Desk. Use web search only. You have no private context and must not read local files. Find up to five specific, relevant primary-source pages, preferably published in the last seven days. Preserve dates and disagreement. Never invent a URL or imply a new retrieval means a new development. Return fewer results if evidence is weak.",
    user: `Local date: ${date}. Public research topics supplied by the user: ${JSON.stringify(topics)}`,
    schema: { type: "object", additionalProperties: false, required: ["urls"], properties: { urls: { type: "array", items: { type: "string" } } } },
  });
  if (answer.stop_reason !== "end_turn" || !Array.isArray(answer.output?.urls)) throw new Error("Codex could not research outside sources.");
  const urls = [...new Set(answer.output.urls)].slice(0, 5);
  if (!urls.length) throw new Error("No suitable public sources were found. Try a more specific public topic.");
  for (const url of urls) {
    if (typeof url !== "string" || url.length > 2000) throw new Error("Research returned an invalid URL.");
  }
  return collectImpl({ workspace, pages: urls.map(url => ({ url })), refresh: true, max: 5, fetch: publicFetch });
}
