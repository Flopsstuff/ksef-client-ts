import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["src/index.ts", "src/node.ts", "src/pdf/index.ts"],
    format: ["esm", "cjs"],
    dts: true,
    clean: true,
    sourcemap: true,
    splitting: false,
    shims: true,
    target: "node20",
    removeNodeProtocol: false,
    // pdfmake is an optional peer — never bundle it; it is loaded lazily at runtime.
    external: ["pdfmake"],
  },
  {
    entry: { cli: "src/cli/index.ts" },
    format: ["esm"],
    dts: false,
    clean: false,
    sourcemap: true,
    splitting: false,
    target: "node20",
    banner: { js: "#!/usr/bin/env node" },
    removeNodeProtocol: false,
    // The CLI lazily bridges into ./pdf, which lazily imports pdfmake — keep it
    // external so it is never pulled into the CLI bundle (optional peer).
    external: ["pdfmake"],
  },
]);
