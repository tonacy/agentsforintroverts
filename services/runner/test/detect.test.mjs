import { test } from "node:test";
import assert from "node:assert/strict";
import { detectProviders, PROVIDER_IDS } from "../src/providers/detect.mjs";

function harness({ bins = {}, files = [], keychain = false, env = {}, versions = {} } = {}) {
  const present = new Set(files);
  return {
    env: { PATH: "/usr/bin:/bin", HOME: "/Users/t", ...env },
    home: "/Users/t",
    exists: async (path) => present.has(path) || Object.values(bins).includes(path),
    listDir: async (dir) => files.filter((f) => f.startsWith(`${dir}/`)).map((f) => f.slice(dir.length + 1).split("/")[0]),
    execVersion: async (bin) => versions[bin] ?? null,
    keychainHas: async () => keychain,
    bins,
  };
}

test("lists the four providers in a stable order with the schema", async () => {
  const catalog = await detectProviders(harness());
  assert.equal(catalog.schema, "afi.provider_catalog.v1");
  assert.deepEqual(catalog.providers.map((p) => p.id), PROVIDER_IDS);
  assert.deepEqual(PROVIDER_IDS, ["claude", "codex", "anthropic", "fixture"]);
  assert.ok(catalog.checked_at);
  assert.equal(catalog.preferred, null);
});

test("finds Claude Code outside PATH in ~/.local/bin and reads sign-in from the keychain, never a secret", async () => {
  const h = harness({
    bins: { claude: "/Users/t/.local/bin/claude" },
    keychain: true,
    versions: { "/Users/t/.local/bin/claude": "2.1.263 (Claude Code)" },
  });
  const { providers } = await detectProviders(h);
  const claude = providers.find((p) => p.id === "claude");
  assert.equal(claude.installed, true);
  assert.equal(claude.path, "/Users/t/.local/bin/claude");
  assert.equal(claude.version, "2.1.263");
  assert.equal(claude.signed_in, true);
  assert.match(claude.sign_in_hint, /login/);
  assert.ok(claude.models.some((m) => m.id === null), "a default model choice exists");
});

test("Codex is signed in when ~/.codex/auth.json exists; the file is never read", async () => {
  const h = harness({
    bins: { codex: "/Users/t/.nvm/versions/node/v22.23.2/bin/codex" },
    files: ["/Users/t/.codex/auth.json", "/Users/t/.nvm/versions/node/v22.23.2/bin"],
    versions: { "/Users/t/.nvm/versions/node/v22.23.2/bin/codex": "codex-cli 0.153.2" },
  });
  const { providers } = await detectProviders(h);
  const codex = providers.find((p) => p.id === "codex");
  assert.equal(codex.installed, true);
  assert.equal(codex.version, "0.153.2");
  assert.equal(codex.signed_in, true);
});

test("not installed means not signed in, with a hint that tells Tony what to do", async () => {
  const { providers } = await detectProviders(harness());
  const codex = providers.find((p) => p.id === "codex");
  assert.equal(codex.installed, false);
  assert.equal(codex.path, null);
  assert.equal(codex.signed_in, false);
  assert.match(codex.sign_in_hint, /codex login/);
});

test("the Anthropic account counts as signed in with an env token or an ant profile", async () => {
  const viaEnv = await detectProviders(harness({ env: { ANTHROPIC_API_KEY: "sk-test" } }));
  assert.equal(viaEnv.providers.find((p) => p.id === "anthropic").signed_in, true);

  const viaProfile = await detectProviders(harness({ files: ["/Users/t/.config/anthropic/credentials/default.json"] }));
  assert.equal(viaProfile.providers.find((p) => p.id === "anthropic").signed_in, true);

  const neither = await detectProviders(harness());
  assert.equal(neither.providers.find((p) => p.id === "anthropic").signed_in, false);
});

test("the sample provider is always installed and signed in", async () => {
  const { providers } = await detectProviders(harness());
  const fixture = providers.find((p) => p.id === "fixture");
  assert.equal(fixture.installed, true);
  assert.equal(fixture.signed_in, true);
  assert.equal(fixture.sign_in_hint, null);
});

test("an unreadable keychain reports unknown rather than guessing", async () => {
  const h = harness({ bins: { claude: "/usr/local/bin/claude" } });
  h.keychainHas = async () => {
    throw new Error("security: not available");
  };
  const { providers } = await detectProviders(h);
  assert.equal(providers.find((p) => p.id === "claude").signed_in, null);
});

test("reports the workspace's preferred provider when one is saved", async () => {
  const catalog = await detectProviders(harness(), { preference: { provider: "codex", model: null } });
  assert.equal(catalog.preferred, "codex");
});
