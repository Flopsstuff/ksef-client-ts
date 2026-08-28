import { defineConfig } from "vitest/config";

// E2E specs drive the live KSeF TEST API: every `beforeAll` authenticates over
// the network (self-signed cert + XAdES ceremony) and most specs poll
// asynchronous server-side operations. Vitest's defaults — 5s per test, 10s per
// hook — leave almost no headroom on a 4-core CI runner, where the suite runs
// roughly twice as slow as on a dev machine.
//
// Raising them here rather than per file matters: a `describe`-level `timeout`
// option applies to tests but NOT to hooks, so a spec can declare
// `{ timeout: 120_000 }` and still have its `beforeAll` killed at the 10s
// default. That mismatch is what made earlier CI failures look arbitrary.
export default defineConfig({
  test: {
    globals: true,
    include: ["tests/e2e/**/*.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 60_000,
    // One retry absorbs a transient network blip against the shared sandbox.
    // A genuine regression still fails twice and is reported as a failure.
    retry: 1,
  },
});
