#!/usr/bin/env node
import { readArgs, requireWorkspace } from "./src/args.mjs";
import { renderPiece } from "./src/piece.mjs";

try {
  const { values, positionals } = readArgs(process.argv.slice(2), {
    piece: { type: "string" },
    output: { type: "string", default: "index.html" },
    force: { type: "boolean", default: false },
  });
  if (positionals[0] !== "render") throw new Error("Expected: piece.mjs render --workspace <dir> --piece <folder>");
  if (!values.piece) throw new Error("--piece <folder inside the workspace> is required.");
  const result = await renderPiece({
    workspace: requireWorkspace(values),
    piece: values.piece,
    output: values.output,
    force: values.force,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
