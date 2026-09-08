#!/usr/bin/env node
/**
 * providers.mjs list [--workspace DIR] --json
 * providers.mjs use --workspace DIR --provider <id> [--model <id>] --json
 */
import { readArgs, requireWorkspace } from "./src/args.mjs";
import { readPreference, writePreference } from "./src/preferences.mjs";
import { detectProviders } from "./src/providers/detect.mjs";

try {
  const { values, positionals } = readArgs(process.argv.slice(2));
  const command = positionals[0] ?? "list";

  if (command === "list") {
    const preference = values.workspace ? await readPreference(values.workspace) : null;
    const catalog = await detectProviders({}, { preference });
    process.stdout.write(`${JSON.stringify(catalog, null, 2)}\n`);
  } else if (command === "use") {
    const workspace = requireWorkspace(values);
    if (!values.provider) throw new Error("--provider <id> is required.");
    const preference = await writePreference(workspace, { provider: values.provider, model: values.model ?? null });
    process.stdout.write(`${JSON.stringify(preference, null, 2)}\n`);
  } else {
    throw new Error(`Unknown command ${JSON.stringify(command)}. Expected list or use.`);
  }
  process.exitCode = 0;
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
