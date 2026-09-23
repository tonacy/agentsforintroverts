import { spawn } from "node:child_process";

// Use the installed Codex app-server protocol and the same persisted session
// store as Desktop. Merely reading a session does not run a model.
export class CodexRPC {
  constructor({ bin = "codex", spawnImpl = spawn, timeoutMs = 20000 } = {}) {
    this.timeoutMs = timeoutMs;
    this.nextId = 0;
    this.pending = new Map();
    this.child = spawnImpl(bin, ["app-server", "--stdio"], { stdio: ["pipe", "pipe", "pipe"] });
    let buffer = "";
    this.child.stdout.setEncoding("utf8");
    this.child.stdout.on("data", chunk => {
      buffer += chunk;
      let boundary;
      while ((boundary = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 1);
        let message; try { message = JSON.parse(line); } catch { continue; }
        const waiting = this.pending.get(message.id);
        if (!waiting) continue;
        this.pending.delete(message.id); clearTimeout(waiting.timer);
        if (message.error) waiting.reject(new Error(message.error.message ?? "Codex request failed"));
        else waiting.resolve(message.result);
      }
    });
    this.child.stderr.resume(); // Never surface credentials or raw runtime logs.
    this.child.stdin.on("error", () => {});
    this.child.on("error", error => this.fail(error));
    this.child.on("exit", () => this.fail(new Error("Codex connection closed. Open Codex and try again.")));
  }
  fail(error) {
    for (const value of this.pending.values()) { clearTimeout(value.timer); value.reject(error); }
    this.pending.clear();
  }
  call(method, params = {}) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Codex ${method} timed out. Your saved context is unchanged.`)); }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  }
  async initialize() {
    const result = await this.call("initialize", { clientInfo: { name: "quiet-desk", title: "Quiet Desk", version: "0.1.0" }, capabilities: { experimentalApi: true } });
    this.child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "initialized" }) + "\n");
    return result;
  }
  close() { this.fail(new Error("Codex connection closed")); this.child.stdin.end(); this.child.kill(); }
}

export async function withCodex(work) {
  const rpc = new CodexRPC();
  try { await rpc.initialize(); return await work(rpc); }
  finally { rpc.close(); }
}
