#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { ContextKernelError } from "./errors.js";
import { ContextKernel, initializeContextWorkspace } from "./kernel.js";
import type {
  ChangeInput,
  ContextPackInput,
  DeleteInput,
  RunCheckpointInput,
  RunCompletionInput,
  ScratchCueInput,
  SearchInput,
  WorkspaceInitInput,
} from "./types.js";

interface CliArguments {
  command: string;
  workspace: string;
  input?: string;
  inputFile?: string;
}

async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2));
  const input = await readInput(args);
  let output: unknown;
  if (args.command === "init") {
    const initialized = await initializeContextWorkspace(args.workspace, input as unknown as WorkspaceInitInput);
    output = { created: initialized.created, manifest: initialized.manifest, root: initialized.kernel.root };
  } else {
    const kernel = await ContextKernel.open(args.workspace);
    switch (args.command) {
      case "describe": output = await kernel.describe(); break;
      case "change": output = await kernel.change(input as unknown as ChangeInput); break;
      case "correct": output = await kernel.correct(input as unknown as ChangeInput); break;
      case "delete": output = await kernel.delete(input as unknown as DeleteInput); break;
      case "get": {
        const request = input as { entity_type: string; entity_id: string };
        output = await kernel.get(request.entity_type, request.entity_id);
        break;
      }
      case "changes": output = await kernel.changes(input as { after_event_id?: string; limit?: number }); break;
      case "search": output = await kernel.search(input as unknown as SearchInput); break;
      case "replay": output = await kernel.replay({ writeProjections: true }); break;
      case "rebuild-index": output = await kernel.rebuildIndex(); break;
      case "pack": output = await kernel.assembleContextPack(input as ContextPackInput); break;
      case "prune-expired": output = await kernel.pruneExpiredEntities(); break;
      case "scratch-add": output = await kernel.addScratch(input as unknown as ScratchCueInput); break;
      case "scratch-list": output = await kernel.listScratch(input as { now?: string }); break;
      case "scratch-prune": output = await kernel.pruneScratch(input as { now?: string }); break;
      case "run-checkpoint": output = await kernel.checkpointRun(input as unknown as RunCheckpointInput); break;
      case "run-complete": output = await kernel.completeRun(input as unknown as RunCompletionInput); break;
      default: throw new TypeError(`Unknown command: ${args.command}`);
    }
  }
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

function parseArguments(argv: string[]): CliArguments {
  const command = argv[0];
  if (!command || command === "help" || command === "--help") {
    process.stdout.write(helpText());
    process.exit(0);
  }
  let workspace = "";
  let input: string | undefined;
  let inputFile: string | undefined;
  for (let index = 1; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === "--workspace" && value) { workspace = value; index += 1; }
    else if (flag === "--input" && value) { input = value; index += 1; }
    else if (flag === "--input-file" && value) { inputFile = value; index += 1; }
    else throw new TypeError(`Unknown or incomplete argument: ${flag}`);
  }
  if (!workspace) throw new TypeError("--workspace is required");
  if (input && inputFile) throw new TypeError("Use either --input or --input-file, not both");
  return { command, workspace, input, inputFile };
}

async function readInput(args: CliArguments): Promise<Record<string, unknown>> {
  const raw = args.inputFile ? await readFile(args.inputFile, "utf8") : args.input;
  return raw ? JSON.parse(raw) as Record<string, unknown> : {};
}

function helpText(): string {
  return `afi-context <command> --workspace <path> [--input <json> | --input-file <path>]

Commands:
  init describe change correct delete get changes search replay rebuild-index pack prune-expired
  scratch-add scratch-list scratch-prune run-checkpoint run-complete
`;
}

main().catch((error: unknown) => {
  const output = error instanceof ContextKernelError
    ? { error: error.code, message: error.message, details: error.details }
    : { error: "INVALID_REQUEST", message: error instanceof Error ? error.message : String(error) };
  process.stderr.write(`${JSON.stringify(output, null, 2)}\n`);
  process.exitCode = 1;
});
