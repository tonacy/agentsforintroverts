import { createHubApp } from "./app.js";
import { D1EventStore } from "./d1-store.js";

function stringBinding(env: Env, name: string): string {
  const value = Reflect.get(env, name);
  return typeof value === "string" ? value : "";
}

function integerBinding(env: Env, name: keyof Env, fallback: number): number {
  const parsed = Number(env[name]);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function ingestSecrets(env: Env): Record<string, string> {
  const raw = stringBinding(env, "INGEST_SECRETS_JSON");
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("INGEST_SECRETS_JSON must be a JSON object of key IDs to HMAC secrets.");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("INGEST_SECRETS_JSON must be a JSON object of key IDs to HMAC secrets.");
  }

  const entries = Object.entries(parsed).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0,
  );
  return Object.fromEntries(entries);
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const store = new D1EventStore(
      env.DB,
      integerBinding(env, "MAX_EVENTS_PER_READ", 10_000),
    );
    const app = createHubApp({
      store,
      resolveSecret: async (keyId) => ingestSecrets(env)[keyId] ?? null,
      readToken: stringBinding(env, "READ_TOKEN"),
      maxBodyBytes: integerBinding(env, "MAX_BODY_BYTES", 256 * 1_024),
      replayWindowSeconds: integerBinding(env, "REPLAY_WINDOW_SECONDS", 300),
    });
    return app.fetch(request);
  },
};

export default worker;
