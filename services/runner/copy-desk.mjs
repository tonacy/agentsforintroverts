#!/usr/bin/env node
import { readArgs, requireWorkspace } from "./src/args.mjs";
import { renderCopyDesk } from "./src/copy-desk.mjs";

try {
  const { values, positionals } = readArgs(process.argv.slice(2), {
    draft: { type: "string" },
    output: { type: "string", default: "copy-desk.html" },
    force: { type: "boolean", default: false },
  });
  if (positionals[0] !== "render") throw new Error("Expected: copy-desk.mjs render --workspace <dir> [--draft drafts/<folder>]");
  const result = await renderCopyDesk({
    workspace: requireWorkspace(values),
    draft: values.draft,
    output: values.output,
    force: values.force,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
