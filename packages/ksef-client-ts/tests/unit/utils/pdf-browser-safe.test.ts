import { describe, expect, it } from "vitest";

import { findNodeMarkers } from "../../../scripts/check-pdf-browser-safe.mjs";

describe("./pdf browser-safety guard", () => {
  it("catches static node imports in either module format", () => {
    expect(findNodeMarkers('import crypto from "node:crypto";')).toContain('from "node:*"');
    expect(findNodeMarkers("const fs = require( 'node:fs/promises' );")).toContain(
      'require("node:*")',
    );
    expect(findNodeMarkers('import { readFile } from "fs/promises";')).toContain(
      "bare node builtin",
    );
  });

  /**
   * The version probe hides `node:module` behind a variable so no bundler
   * resolves it. A literal in the output means that variable was folded away —
   * the one thing this guard exists to notice.
   */
  it("passes a lazily-specified import but fails a folded one", () => {
    expect(findNodeMarkers("const s=['node','module'].join(':');import(s)")).toEqual([]);
    expect(findNodeMarkers('await import("node:module")')).toContain('import("node:*")');
  });

  it("catches Buffer without tripping over names that merely contain it", () => {
    expect(findNodeMarkers("Buffer.from(x, 'utf8')")).toContain("Buffer.from/alloc/concat");
    expect(findNodeMarkers("function createPdfBuffer(){} stream.getBuffer()")).toEqual([]);
  });
});
