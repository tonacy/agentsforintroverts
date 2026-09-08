import { parseArgs } from "node:util";

/** Shared CLI parsing so the three commands read the same flags the same way. */
export function readArgs(argv, extraOptions = {}) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      workspace: { type: "string" },
      date: { type: "string" },
      provider: { type: "string" },
      model: { type: "string" },
      json: { type: "boolean", default: false },
      mode: { type: "string", default: "short" },
      "window-days": { type: "string", default: "7" },
      approve: { type: "boolean", default: false },
      "include-inside": { type: "boolean", default: false },
      out: { type: "string" },
      max: { type: "string", default: "20" },
      ...extraOptions,
    },
  });
  return { values, positionals };
}

export function requireWorkspace(values) {
  if (!values.workspace) {
    throw new Error("--workspace <dir> is required (a copy of templates/quiet-desk-publishing).");
  }
  return values.workspace;
}

export function requireDate(values) {
  if (!values.date || !/^\d{4}-\d{2}-\d{2}$/.test(values.date)) {
    throw new Error("--date YYYY-MM-DD is required.");
  }
  return values.date;
}
