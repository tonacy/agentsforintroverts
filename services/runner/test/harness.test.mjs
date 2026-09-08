import { test } from "node:test";
import assert from "node:assert/strict";
import { claudeProvider, codexProvider } from "../src/providers/harness.mjs";

const schema = { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false };

function fakeFs() {
  const files = new Map();
  return {
    files,
    mkdtemp: async () => "/tmp/afi-harness-test",
    writeFile: async (path, text) => {
      files.set(path, text);
    },
    readFile: async (path) => {
      if (!files.has(path)) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      return files.get(path);
    },
    rm: async () => {},
  };
}

test("claude: runs Claude Code in print mode with no tools, our system prompt, and the schema", async () => {
  const calls = [];
  const spawn = async (call) => {
    calls.push(call);
    return {
      code: 0,
      stdout: JSON.stringify({
        type: "result",
        is_error: false,
        result: '{"ok":true}',
        structured_output: { ok: true },
        usage: { input_tokens: 12, output_tokens: 34 },
        total_cost_usd: 0.01,
        modelUsage: { "claude-opus-5": {} },
      }),
      stderr: "",
    };
  };
  const provider = claudeProvider({ bin: "/usr/local/bin/claude", model: "opus", spawn, fs: fakeFs() });

  const answer = await provider.converse({ system: "SYSTEM PROMPT", user: "USER TURN", schema });

  assert.equal(provider.name, "claude");
  assert.equal(provider.model, "opus");
  assert.equal(calls.length, 1);
  const { bin, args, stdin, cwd } = calls[0];
  assert.equal(bin, "/usr/local/bin/claude");
  assert.ok(args.includes("-p"), "print mode");
  assert.ok(!args.includes("--bare"), "--bare skips the keychain login and must not be used");
  assert.deepEqual(args.slice(args.indexOf("--output-format"), args.indexOf("--output-format") + 2), ["--output-format", "json"]);
  assert.deepEqual(args.slice(args.indexOf("--tools"), args.indexOf("--tools") + 2), ["--tools", ""]);
  assert.deepEqual(args.slice(args.indexOf("--system-prompt"), args.indexOf("--system-prompt") + 2), ["--system-prompt", "SYSTEM PROMPT"]);
  assert.deepEqual(args.slice(args.indexOf("--model"), args.indexOf("--model") + 2), ["--model", "opus"]);
  assert.equal(JSON.parse(args[args.indexOf("--json-schema") + 1]).required[0], "ok");
  assert.ok(args.includes("--no-session-persistence"));
  assert.equal(stdin, "USER TURN");
  assert.equal(cwd, "/tmp/afi-harness-test", "runs in an empty temp dir, never in the repo");

  assert.equal(answer.stop_reason, "end_turn");
  assert.deepEqual(answer.output, { ok: true });
  assert.equal(answer.usage.input_tokens, 12);
  assert.equal(answer.usage.cost_usd, 0.01);
});

test("claude: omits --model when none is chosen and falls back to parsing the result text", async () => {
  const spawn = async () => ({
    code: 0,
    stdout: JSON.stringify({ type: "result", is_error: false, result: '{"ok":false}', usage: {} }),
    stderr: "",
  });
  let seen;
  const provider = claudeProvider({ bin: "claude", spawn: async (c) => { seen = c; return spawn(); }, fs: fakeFs() });
  const answer = await provider.converse({ system: "s", user: "u", schema });
  assert.ok(!seen.args.includes("--model"));
  assert.deepEqual(answer.output, { ok: false });
  assert.equal(provider.model, null);
});

test("claude: a not-logged-in answer is reported as such, never as a conversation", async () => {
  const spawn = async () => ({
    code: 0,
    stdout: JSON.stringify({ type: "result", is_error: true, result: "Not logged in · Please run /login", usage: {} }),
    stderr: "",
  });
  const provider = claudeProvider({ bin: "claude", spawn, fs: fakeFs() });
  const answer = await provider.converse({ system: "s", user: "u", schema });
  assert.equal(answer.stop_reason, "not_signed_in");
  assert.equal(answer.output, null);
  assert.match(answer.stop_details.message, /not logged in/i);
});

test("claude: a non-zero exit is a provider error with the stderr tail", async () => {
  const spawn = async () => ({ code: 1, stdout: "", stderr: "boom\nreally boom" });
  const provider = claudeProvider({ bin: "claude", spawn, fs: fakeFs() });
  const answer = await provider.converse({ system: "s", user: "u", schema });
  assert.equal(answer.stop_reason, "error");
  assert.match(answer.stop_details.message, /really boom/);
});

test("codex: runs codex exec read-only and ephemeral with the schema file, reads the last message file", async () => {
  const fs = fakeFs();
  const calls = [];
  const spawn = async (call) => {
    calls.push(call);
    // The harness writes the final message where -o points.
    const out = call.args[call.args.indexOf("-o") + 1];
    fs.files.set(out, '{"ok":true}');
    return {
      code: 0,
      stdout: [
        JSON.stringify({ type: "item.completed", item: { id: "item_1", type: "agent_message", text: '{"ok":true}' } }),
        JSON.stringify({ type: "turn.completed", usage: { input_tokens: 100, output_tokens: 20 } }),
      ].join("\n"),
      stderr: "noise from mcp servers",
    };
  };
  const provider = codexProvider({ bin: "/opt/codex", model: "gpt-5", spawn, fs });

  const answer = await provider.converse({ system: "SYSTEM", user: "USER", schema });

  const { bin, args, stdin, cwd } = calls[0];
  assert.equal(bin, "/opt/codex");
  assert.equal(args[0], "exec");
  for (const flag of ["--ephemeral", "--skip-git-repo-check", "--ignore-user-config", "--json"]) {
    assert.ok(args.includes(flag), `${flag} present`);
  }
  assert.deepEqual(args.slice(args.indexOf("-s"), args.indexOf("-s") + 2), ["-s", "read-only"]);
  assert.deepEqual(args.slice(args.indexOf("-m"), args.indexOf("-m") + 2), ["-m", "gpt-5"]);
  assert.equal(args[args.length - 1], "-", "prompt is read from stdin");
  const schemaPath = args[args.indexOf("--output-schema") + 1];
  assert.deepEqual(JSON.parse(fs.files.get(schemaPath)), schema);
  assert.equal(cwd, "/tmp/afi-harness-test");
  assert.ok(stdin.startsWith("<system>\nSYSTEM\n</system>"), "system prompt leads the stdin prompt");
  assert.ok(stdin.includes("USER"));

  assert.equal(answer.stop_reason, "end_turn");
  assert.deepEqual(answer.output, { ok: true });
  assert.equal(answer.usage.input_tokens, 100);
});

test("codex: a missing last-message file is unparseable output, and a non-zero exit is an error", async () => {
  const fs = fakeFs();
  const okSpawn = async () => ({ code: 0, stdout: "", stderr: "" });
  const provider = codexProvider({ bin: "codex", spawn: okSpawn, fs });
  const answer = await provider.converse({ system: "s", user: "u", schema });
  assert.equal(answer.stop_reason, "end_turn");
  assert.equal(answer.output, null);

  const badSpawn = async () => ({ code: 2, stdout: "", stderr: "not logged in" });
  const failing = codexProvider({ bin: "codex", spawn: badSpawn, fs: fakeFs() });
  const failed = await failing.converse({ system: "s", user: "u", schema });
  assert.equal(failed.stop_reason, "error");
});
