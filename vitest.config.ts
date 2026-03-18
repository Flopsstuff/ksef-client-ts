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
        "src/models/**/types.ts",
        "src/**/index.ts",
        "src/http/rest-response.ts",
        "src/errors/types.ts",
      ],
      reporter: ["text", "json-summary"],
    },
  },
});
