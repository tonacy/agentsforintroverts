import { test } from "node:test";
import assert from "node:assert/strict";
import { renderTemplate } from "../src/context-render.mjs";

test("substitutes simple variables", () => {
  const out = renderTemplate("- Workspace: {{workspace_id}}\n- Run: {{run_id}}", {
    workspace_id: "ws",
    run_id: "run_1",
  });
  assert.equal(out, "- Workspace: ws\n- Run: run_1");
});

test("unknown identity or verification fields render as not_checked, other unknowns as none", () => {
  const out = renderTemplate(
    "x {{x_following_verified}} / mode {{daily_conversation_mode}} / q {{quiet_hours}}",
    {},
  );
  assert.equal(out, "x not_checked / mode not_checked / q none");
});

test("expands #each blocks once per item and renders an empty list as none", () => {
  const template = "{{#each items}}\n- {{id}} · {{kind}}\n{{/each}}\n{{#each empty}}\n- {{id}}\n{{/each}}";
  const out = renderTemplate(template, {
    items: [
      { id: "a", kind: "rss" },
      { id: "b", kind: "public_web" },
    ],
    empty: [],
  });
  assert.equal(out, "- a · rss\n- b · public_web\n- none\n");
});

test("joins array values inside a block with commas", () => {
  const out = renderTemplate("{{#each rows}}\n- {{source_refs}}\n{{/each}}", {
    rows: [{ source_refs: ["s1", "s2"] }],
  });
  assert.equal(out, "- s1, s2\n");
});

test("never leaves a handlebars token behind", () => {
  const out = renderTemplate("{{a}} {{#each b}}{{c}}{{/each}} {{d.e}}", { a: 1 });
  assert.doesNotMatch(out, /\{\{/);
});
