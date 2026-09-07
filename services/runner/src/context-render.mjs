/**
 * A deliberately tiny renderer for `agents/context.md`.
 *
 * The template uses two constructs only: `{{name}}` and
 * `{{#each list}}…{{/each}}`. Anything the runner does not know is rendered as
 * an honest placeholder rather than silently dropped: identity, verification,
 * mode, and status fields become `not_checked` (the vocabulary the role prompt
 * expects), everything else becomes `none`. An empty list renders as `- none`
 * so a section is never blank in a way that could be read as "nothing to say".
 */

const NOT_CHECKED_HINTS = [
  "x_",
  "linkedin",
  "verified",
  "match",
  "mode",
  "status",
  "hypothesis",
  "calibration",
  "read_only",
  "recommendation",
];

const EACH_PATTERN = /\{\{#each\s+([\w.]+)\}\}\n?([\s\S]*?)\{\{\/each\}\}\n?/g;
const VAR_PATTERN = /\{\{([\w.]+)\}\}/g;

function lookup(scope, path) {
  let current = scope;
  for (const segment of path.split(".")) {
    if (current === null || current === undefined || typeof current !== "object") return undefined;
    current = current[segment];
  }
  return current;
}

function fallback(name) {
  return NOT_CHECKED_HINTS.some((hint) => name.includes(hint)) ? "not_checked" : "none";
}

function stringify(value, name) {
  if (value === undefined || value === null || value === "") return fallback(name);
  if (Array.isArray(value)) return value.length ? value.map((v) => stringify(v, name)).join(", ") : "none";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function renderVars(text, scope) {
  return text.replace(VAR_PATTERN, (_match, name) => stringify(lookup(scope, name), name));
}

export function renderTemplate(template, vars) {
  const expanded = template.replace(EACH_PATTERN, (_match, name, body) => {
    const list = lookup(vars, name);
    if (!Array.isArray(list) || list.length === 0) return "- none\n";
    return list.map((item) => renderVars(body, item)).join("");
  });
  return renderVars(expanded, vars);
}
