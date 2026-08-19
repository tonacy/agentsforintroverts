import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "apps/quiet-desk/.build/**",
    "packages/protocol/dist/**",
    "services/hub/.test-dist/**",
    "services/hub/worker-configuration.d.ts",
    "services/mcp/dist/**",
  ]),
]);

export default eslintConfig;
