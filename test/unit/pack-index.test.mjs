import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildDirectoryTreeLines } from "../../tools/gemini-export/pack-index.mjs";

describe("pack-index", () => {
  it("buildDirectoryTreeLines renders nested paths", () => {
    const tree = buildDirectoryTreeLines(["src/a.ts", "src/b/c.ts"]);
    assert.match(tree, /src/);
    assert.match(tree, /a\.ts/);
    assert.match(tree, /b/);
  });
});
