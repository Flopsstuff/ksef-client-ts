import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["esm", "cjs"],
    dts: true,
    clean: true,
    sourcemap: true,
    splitting: false,
    shims: true,
    target: "node18",
    removeNodeProtocol: false,
  },
  {
    entry: { cli: "src/cli/index.ts" },
    format: ["esm"],
    dts: false,
    clean: false,
    sourcemap: true,
    splitting: false,
    target: "node18",
    banner: { js: "#!/usr/bin/env node" },
    removeNodeProtocol: false,
  },
]);
