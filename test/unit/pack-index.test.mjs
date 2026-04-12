import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { buildDirectoryTreeLines, writePackIndex } from "../../tools/gemini-export/pack-index.mjs";

describe("pack-index", () => {
  it("buildDirectoryTreeLines renders nested paths", () => {
    const tree = buildDirectoryTreeLines(["src/a.ts", "src/b/c.ts"]);
    assert.match(tree, /src/);
    assert.match(tree, /a\.ts/);
    assert.match(tree, /b/);
  });

  it("writePackIndex lineCount ignores trailing newline synthetic empty line", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "gemini-pack-index-"));
    try {
      const readRootAbs = path.join(tmp, "out");
      const packRootAbs = path.join(readRootAbs, "_pack");
      await fs.mkdir(path.join(readRootAbs, "src"), { recursive: true });
      await fs.writeFile(path.join(readRootAbs, "src", "sample.ts"), "a\nb\n", "utf8");

      await writePackIndex({
        packRootAbs,
        packableRelPaths: ["src/sample.ts"],
        chunkRecords: [{ originalPath: "src/sample.ts", role: "other", chunkRelPaths: ["chunks/src__sample.ts.md"] }],
        readRootAbs,
        checkOnly: false
      });

      const jsonl = await fs.readFile(path.join(packRootAbs, "PATH_INDEX.jsonl"), "utf8");
      const row = JSON.parse(jsonl.trim());
      assert.equal(row.lineCount, 2);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});
