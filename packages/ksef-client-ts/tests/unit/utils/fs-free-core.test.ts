import { describe, expect, it } from "vitest";

import { findFsMarkers } from "../../../scripts/check-fs-free-core.mjs";

describe("fs-free core bundle guard", () => {
  it("rejects quote- and whitespace-varied fs markers", () => {
    expect(findFsMarkers("require ( 'fs' );")).toContain('require("fs")');
    expect(findFsMarkers('import { readFile } from "node:fs/promises";')).toEqual(
      expect.arrayContaining(["node:fs/promises", "from \"fs/promises\"", "readFile"]),
    );
  });
});
