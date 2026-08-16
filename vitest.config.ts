import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    // Default stays "node" for plain-logic *.test.ts files (computeFare,
    // buildSnapshot, etc.) - fast, no DOM needed. Component tests opt into
    // jsdom per-file via a `// @vitest-environment jsdom` comment, rather
    // than switching everything to jsdom globally (same convention as
    // Cleano Ops's vitest.config.ts).
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: ["./vitest.setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
