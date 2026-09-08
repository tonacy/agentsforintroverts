/**
 * The one preference the app writes into the workspace: which provider runs
 * the daily conversation. It names a harness; it never contains a credential.
 */

import { join } from "node:path";
import { PROVIDER_IDS } from "./providers/detect.mjs";
import { readJsonIfExists, writeJson } from "./workspace.mjs";

export const PREFERENCE_SCHEMA = "afi.provider_preference.v1";

export function preferencePath(workspace) {
  return join(workspace, "preferences", "provider.json");
}

export async function readPreference(workspace) {
  const saved = await readJsonIfExists(preferencePath(workspace));
  if (!saved || saved.schema !== PREFERENCE_SCHEMA || !PROVIDER_IDS.includes(saved.provider)) return null;
  return saved;
}

export async function writePreference(workspace, { provider, model = null, now = () => new Date() }) {
  if (!PROVIDER_IDS.includes(provider)) {
    throw new Error(`Unknown provider ${JSON.stringify(provider)}. Expected one of ${PROVIDER_IDS.join(", ")}.`);
  }
  const preference = {
    schema: PREFERENCE_SCHEMA,
    provider,
    model: model || null,
    chosen_at: now().toISOString(),
  };
  await writeJson(preferencePath(workspace), preference);
  return preference;
}
