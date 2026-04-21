import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.d.ts",
        // Model layer: only type-only files are excluded. Runtime helpers
        // (e.g. `src/models/document-structures/helpers.ts`) stay in the
        // coverage denominator so the gate catches drift there too.
        "src/models/common.ts",
        "src/models/**/types.ts",
        "src/models/sessions/batch-types.ts",
        "src/models/sessions/online-types.ts",
        "src/models/sessions/session-state.ts",
        "src/models/sessions/status-types.ts",
        "src/**/index.ts",
        "src/http/rest-response.ts",
        "src/errors/types.ts",
        "src/errors/assert-never.ts",
        "src/errors/error-codes.ts",
      ],
      thresholds: {
        lines: 97.5,
        statements: 97.5,
        branches: 93,
        functions: 94,
      },
      reporter: ["text", "json-summary"],
    },
  },
});
