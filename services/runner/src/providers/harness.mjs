/**
 * Harness providers: run the daily-conversation role through an agent CLI the
 * person already uses and is already signed in to. Quiet Desk never holds a
 * credential; the harness holds its own.
 *
 * Both adapters run in an empty temporary directory, with no tools (Claude
 * Code) or a read-only sandbox (Codex), so the harness can neither read the
 * repository nor act on anything. They return the same shape as the SDK
 * provider: `{ stop_reason, stop_details, usage, output }`.
 */

import { spawn as nodeSpawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const defaultFs = {
  mkdtemp: () => mkdtemp(join(tmpdir(), "afi-harness-")),
  writeFile,
  readFile,
  rm: (path) => rm(path, { recursive: true, force: true }),
};

/** Runs a process to completion, feeding stdin and collecting both streams. */
export function spawnProcess({ bin, args, cwd, stdin, env, timeoutMs = 10 * 60 * 1000 }) {
  return new Promise((resolve, reject) => {
    const child = nodeSpawn(bin, args, { cwd, env, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`${bin} did not finish within ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
    child.stdin.on("error", () => {});
    child.stdin.end(stdin ?? "");
  });
}

function tail(text, lines = 6) {
  return String(text ?? "")
    .trim()
    .split("\n")
    .slice(-lines)
    .join("\n");
}

function tryParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function errorAnswer(message) {
  return { stop_reason: "error", stop_details: { message }, usage: null, output: null };
}

/**
 * Claude Code in print mode. `--bare` is deliberately absent: it skips the
 * keychain, which is exactly where the person's login lives.
 */
export function claudeProvider({ bin = "claude", model = null, spawn = spawnProcess, fs = defaultFs, env = process.env } = {}) {
  return {
    name: "claude",
    model,
    async converse({ system, user, schema }) {
      const cwd = await fs.mkdtemp();
      try {
        const args = [
          "-p",
          "--output-format",
          "json",
          "--no-session-persistence",
          "--tools",
          "",
          "--system-prompt",
          system,
          "--exclude-dynamic-system-prompt-sections",
          "--json-schema",
          JSON.stringify(schema),
        ];
        if (model) args.push("--model", model);

        let result;
        try {
          result = await spawn({ bin, args, cwd, stdin: user, env });
        } catch (error) {
          return errorAnswer(error instanceof Error ? error.message : String(error));
        }
        if (result.code !== 0) {
          return errorAnswer(`claude exited ${result.code}: ${tail(result.stderr) || tail(result.stdout)}`);
        }

        const json = tryParse(result.stdout);
        if (!json || json.type !== "result") {
          return errorAnswer(`claude returned no result document: ${tail(result.stdout)}`);
        }

        const usage = {
          input_tokens: json.usage?.input_tokens ?? null,
          output_tokens: json.usage?.output_tokens ?? null,
          cost_usd: json.total_cost_usd ?? null,
          models: json.modelUsage ? Object.keys(json.modelUsage) : [],
        };

        if (json.is_error) {
          const message = String(json.result ?? "");
          const reason = /not logged in|\/login/i.test(message) ? "not_signed_in" : "error";
          return { stop_reason: reason, stop_details: { message }, usage, output: null };
        }

        const output =
          json.structured_output && typeof json.structured_output === "object"
            ? json.structured_output
            : tryParse(String(json.result ?? ""));

        return { stop_reason: "end_turn", stop_details: null, usage, output };
      } finally {
        await fs.rm(cwd);
      }
    },
  };
}

/**
 * Codex CLI in non-interactive mode. Read-only sandbox, ephemeral session, the
 * person's config file ignored so no MCP server or plugin joins the run.
 */
export function codexProvider({ bin = "codex", model = null, spawn = spawnProcess, fs = defaultFs, env = process.env } = {}) {
  return {
    name: "codex",
    model,
    async converse({ system, user, schema }) {
      const cwd = await fs.mkdtemp();
      try {
        const schemaPath = join(cwd, "schema.json");
        const outPath = join(cwd, "last-message.json");
        await fs.writeFile(schemaPath, JSON.stringify(schema));

        const args = [
          "exec",
          "--ephemeral",
          "-s",
          "read-only",
          "--skip-git-repo-check",
          "--ignore-user-config",
          "-C",
          cwd,
          "--output-schema",
          schemaPath,
          "-o",
          outPath,
          "--json",
        ];
        if (model) args.push("-m", model);
        args.push("-");

        const stdin = `<system>\n${system}\n</system>\n\n${user}`;

        let result;
        try {
          result = await spawn({ bin, args, cwd, stdin, env });
        } catch (error) {
          return errorAnswer(error instanceof Error ? error.message : String(error));
        }
        if (result.code !== 0) {
          return errorAnswer(`codex exited ${result.code}: ${tail(result.stderr) || tail(result.stdout)}`);
        }

        let usage = null;
        for (const line of String(result.stdout).split("\n")) {
          const event = tryParse(line);
          if (event?.type === "turn.completed" && event.usage) {
            usage = {
              input_tokens: event.usage.input_tokens ?? null,
              output_tokens: event.usage.output_tokens ?? null,
              cached_input_tokens: event.usage.cached_input_tokens ?? null,
            };
          }
        }

        let output = null;
        try {
          output = tryParse(await fs.readFile(outPath, "utf8"));
        } catch {
          output = null;
        }

        return { stop_reason: "end_turn", stop_details: null, usage, output };
      } finally {
        await fs.rm(cwd);
      }
    },
  };
}
