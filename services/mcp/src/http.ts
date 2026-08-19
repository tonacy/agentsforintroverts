import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { NextFunction, Request, Response } from "express";
import { assertSafeRemoteBinding, bearerMatches, loadConfig } from "./config.js";
import { HubClient } from "./hub-client.js";
import { createQuietDeskServer } from "./server.js";

const MAX_REQUEST_BYTES = 512 * 1024;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 120;
const MAX_RATE_KEYS = 4_096;

interface RateWindow {
  startedAt: number;
  count: number;
}

const config = loadConfig();
assertSafeRemoteBinding(config);

const app = createMcpExpressApp({
  host: config.host,
  ...(config.allowedHosts.length ? { allowedHosts: config.allowedHosts } : {}),
});
const rates = new Map<string, RateWindow>();

function authorize(req: Request, res: Response, next: NextFunction): void {
  const rawContentLength = req.header("content-length") ?? "0";
  const contentLength = Number(rawContentLength);
  if (!Number.isSafeInteger(contentLength) || contentLength < 0 || contentLength > MAX_REQUEST_BYTES) {
    res.status(413).json({ error: "request_too_large" });
    return;
  }
  if (!bearerMatches(req.header("authorization"), config.mcpBearerToken)) {
    res.setHeader("www-authenticate", "Bearer");
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  let key = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  if (!rates.has(key) && rates.size >= MAX_RATE_KEYS) {
    for (const [candidate, window] of rates) {
      if (now - window.startedAt >= RATE_WINDOW_MS) rates.delete(candidate);
    }
    if (rates.size >= MAX_RATE_KEYS) key = "overflow";
  }
  const current = rates.get(key);
  if (!current || now - current.startedAt >= RATE_WINDOW_MS) {
    rates.set(key, { startedAt: now, count: 1 });
  } else {
    current.count += 1;
    if (current.count > RATE_LIMIT) {
      res.setHeader("retry-after", String(Math.ceil((RATE_WINDOW_MS - (now - current.startedAt)) / 1000)));
      res.status(429).json({ error: "rate_limited" });
      return;
    }
  }
  next();
}

app.get("/health", (_req, res) => {
  res.json({ service: "quiet-desk-mcp", status: "ok", transport: "streamable-http" });
});

app.use("/mcp", authorize);

app.post("/mcp", async (req, res) => {
  const server = createQuietDeskServer(new HubClient(config));
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  let cleanedUp = false;
  const cleanup = (): void => {
    if (cleanedUp) return;
    cleanedUp = true;
    void Promise.allSettled([transport.close(), server.close()]);
  };
  res.once("close", cleanup);
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    process.stderr.write(`MCP request failed: ${error instanceof Error ? error.message : String(error)}\n`);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  } finally {
    if (res.writableEnded) cleanup();
  }
});

app.get("/mcp", (_req, res) => {
  res.setHeader("allow", "POST");
  res.status(405).json({ error: "method_not_allowed" });
});

app.delete("/mcp", (_req, res) => {
  res.setHeader("allow", "POST");
  res.status(405).json({ error: "method_not_allowed" });
});

const listener = app.listen(config.port, config.host, () => {
  process.stderr.write(`Quiet Desk MCP listening at http://${config.host}:${config.port}/mcp\n`);
});

function shutdown(): void {
  listener.close((error) => {
    if (error) process.stderr.write(`MCP shutdown error: ${error.message}\n`);
    process.exit(error ? 1 : 0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
