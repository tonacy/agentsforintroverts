import { timingSafeEqual } from "node:crypto";

export interface BridgeConfig {
  hubUrl: string;
  connectionId: string;
  userId: string;
  provider: string;
  hubSecret?: string;
  hubReadToken?: string;
  mcpBearerToken?: string;
  host: string;
  port: number;
  allowedHosts: string[];
}

function optional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function parsePort(value: string | undefined): number {
  if (!value) return 8788;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error("QUIET_MCP_PORT must be an integer from 1 to 65535");
  }
  return parsed;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): BridgeConfig {
  const hubUrl = optional(env.QUIET_HUB_URL) ?? "http://127.0.0.1:8787";
  let parsed: URL;
  try {
    parsed = new URL(hubUrl);
  } catch {
    throw new Error("QUIET_HUB_URL must be an absolute http(s) URL");
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error("QUIET_HUB_URL must use http or https");
  }

  return {
    hubUrl: parsed.toString().replace(/\/$/, ""),
    connectionId: optional(env.QUIET_HUB_CONNECTION_ID) ?? "local-quiet-desk",
    userId: optional(env.QUIET_USER_ID) ?? "local-user",
    provider: optional(env.QUIET_HUB_PROVIDER) ?? "local",
    hubSecret: optional(env.QUIET_HUB_SECRET),
    hubReadToken: optional(env.QUIET_HUB_READ_TOKEN),
    mcpBearerToken: optional(env.QUIET_MCP_BEARER_TOKEN),
    host: optional(env.QUIET_MCP_HOST) ?? "127.0.0.1",
    port: parsePort(env.QUIET_MCP_PORT),
    allowedHosts: (optional(env.QUIET_MCP_ALLOWED_HOSTS) ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  };
}

export function isLoopbackHost(host: string): boolean {
  return host === "127.0.0.1" || host === "::1" || host === "localhost";
}

export function assertSafeRemoteBinding(config: BridgeConfig): void {
  if (!isLoopbackHost(config.host) && !config.mcpBearerToken) {
    throw new Error("QUIET_MCP_BEARER_TOKEN is required when binding beyond loopback");
  }
  if (!isLoopbackHost(config.host) && config.allowedHosts.length === 0) {
    throw new Error("QUIET_MCP_ALLOWED_HOSTS is required when binding beyond loopback");
  }
}

export function bearerMatches(header: string | undefined, expected: string | undefined): boolean {
  if (!expected) return true;
  if (!header?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(header.slice(7), "utf8");
  const wanted = Buffer.from(expected, "utf8");
  return supplied.length === wanted.length && timingSafeEqual(supplied, wanted);
}
