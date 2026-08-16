import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// vitest.config.ts doesn't set test.globals:true, so @testing-library/react's
// own auto-cleanup never registers itself. Without this, every component
// test in the same file leaves its rendered tree in the DOM for the next
// test. Same convention as Cleano Ops's vitest.setup.ts.
afterEach(() => {
  cleanup();
});
