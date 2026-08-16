import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Plain CommonJS Node bootstrap script, not part of the app bundle
    // (same exclusion as Cleano Ops's eslint.config.mjs).
    "scripts/dev-server.js",
  ]),
]);

export default eslintConfig;
