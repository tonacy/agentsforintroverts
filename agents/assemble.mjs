import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { basename, dirname, resolve } from "node:path";

const agentsDirectory = dirname(fileURLToPath(import.meta.url));
const definitionsDirectory = resolve(agentsDirectory, "definitions");
const allowedRoles = new Set(
  (await readdir(definitionsDirectory))
    .filter((name) => name.endsWith(".json"))
    .map((name) => basename(name, ".json")),
);

function assertRuntimeProfile(profile, role) {
  if (profile.schema !== "afi.agent_runtime_profile.v1") {
    throw new Error(`${role} uses unsupported schema ${JSON.stringify(profile.schema)}`);
  }
  if (profile.key !== `afi.${role}`) {
    throw new Error(`${role} must use the stable key afi.${role}`);
  }
  if (!Array.isArray(profile.allowed_effects) || profile.allowed_effects.length === 0) {
    throw new Error(`${role} must declare allowed_effects`);
  }
  const forbidden = profile.allowed_effects.filter((effect) =>
    ["approve", "execute", "send", "publish_external"].includes(effect),
  );
  if (forbidden.length) {
    throw new Error(`${role} grants forbidden external authority: ${forbidden.join(", ")}`);
  }
}

export async function assembleAgent(role) {
  if (!allowedRoles.has(role)) {
    throw new Error(`Unknown role ${JSON.stringify(role)}. Expected one of: ${[...allowedRoles].sort().join(", ")}`);
  }

  const definitionPath = resolve(definitionsDirectory, `${role}.json`);
  const profile = JSON.parse(await readFile(definitionPath, "utf8"));
  assertRuntimeProfile(profile, role);

  const [basePrompt, rolePrompt, contextTemplate, toolCatalog] = await Promise.all([
    readFile(resolve(agentsDirectory, "prompts/base.md"), "utf8"),
    readFile(resolve(dirname(definitionPath), profile.prompt), "utf8"),
    readFile(resolve(agentsDirectory, "context.md"), "utf8"),
    readFile(resolve(agentsDirectory, "tool-catalog.json"), "utf8").then(JSON.parse),
  ]);

  return {
    schema: "afi.agent_execution_bundle.v1",
    role: profile.key,
    profile,
    system_prompt: `${basePrompt.trim()}\n\n${rolePrompt.trim()}\n`,
    context_template: contextTemplate,
    tools: toolCatalog.tools,
  };
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (invokedPath === import.meta.url) {
  const role = process.argv[2];
  if (!role) {
    process.stderr.write(`Usage: node agents/assemble.mjs <${[...allowedRoles].sort().join("|")}>\n`);
    process.exitCode = 2;
  } else {
    try {
      process.stdout.write(`${JSON.stringify(await assembleAgent(role), null, 2)}\n`);
    } catch (error) {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    }
  }
}
