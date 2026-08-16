import { defineConfig } from "vitest/config";
import path from "path";

// Separate config for tests that need a real Postgres connection - the
// capacity-allocation function and RLS policy boundaries are genuinely
// DB-side logic that pure TS unit tests can't cover. Kept out of the fast
// `npm test` suite (vitest.config.ts) so every commit stays fast and
// DB-independent; run explicitly via `npm run test:integration` against a
// disposable test database (see tests/integration/README or the Phase 1
// plan's open decision #5), never the dev/seed database.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts", "tests/rls/**/*.test.ts"],
    testTimeout: 20000,
    hookTimeout: 20000,
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
