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
        "src/models/**",
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
