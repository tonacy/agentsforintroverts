import assert from "node:assert/strict";
import test from "node:test";
import {
  assertSafeRemoteBinding,
  bearerMatches,
  loadConfig,
} from "../config.js";

test("loads safe local defaults", () => {
  const config = loadConfig({});
  assert.equal(config.hubUrl, "http://127.0.0.1:8787");
  assert.equal(config.host, "127.0.0.1");
  assert.equal(config.userId, "local-user");
  assert.deepEqual(config.allowedHosts, []);
  assert.equal(config.contextRoot, undefined);
  assert.equal(config.contextActorId, "local-agent");
  assert.deepEqual(config.contextRoles, ["afi.daily-conversation", "afi.common-ground"]);
  assert.doesNotThrow(() => assertSafeRemoteBinding(config));
});

test("loads an optional local Context Kernel without granting caller authority", () => {
  const config = loadConfig({
    QUIET_CONTEXT_ROOT: "/private/context",
    QUIET_CONTEXT_AGENT_ID: "codex-local",
    QUIET_CONTEXT_ROLES: "afi.daily-conversation, afi.common-ground, afi.daily-conversation",
  });

  assert.equal(config.contextRoot, "/private/context");
  assert.equal(config.contextActorId, "codex-local");
  assert.deepEqual(config.contextRoles, [
    "afi.daily-conversation",
    "afi.common-ground",
    "afi.daily-conversation",
  ]);
  assert.equal("contextActorType" in config, false);
  assert.equal("contextApproval" in config, false);
});

test("remote binding requires bearer auth and an allowlist", () => {
  const base = loadConfig({ QUIET_MCP_HOST: "0.0.0.0" });
  assert.throws(() => assertSafeRemoteBinding(base), /BEARER_TOKEN/);

  const tokenOnly = loadConfig({
    QUIET_MCP_HOST: "0.0.0.0",
    QUIET_MCP_BEARER_TOKEN: "secret",
  });
  assert.throws(() => assertSafeRemoteBinding(tokenOnly), /ALLOWED_HOSTS/);

  const safe = loadConfig({
    QUIET_MCP_HOST: "0.0.0.0",
    QUIET_MCP_BEARER_TOKEN: "secret",
    QUIET_MCP_ALLOWED_HOSTS: "quiet.example.com, localhost",
  });
  assert.doesNotThrow(() => assertSafeRemoteBinding(safe));
  assert.deepEqual(safe.allowedHosts, ["quiet.example.com", "localhost"]);
});

test("bearer matching fails closed when a token is configured", () => {
  assert.equal(bearerMatches(undefined, "expected"), false);
  assert.equal(bearerMatches("Basic expected", "expected"), false);
  assert.equal(bearerMatches("Bearer wrong", "expected"), false);
  assert.equal(bearerMatches("Bearer expected", "expected"), true);
  assert.equal(bearerMatches(undefined, undefined), true);
});
