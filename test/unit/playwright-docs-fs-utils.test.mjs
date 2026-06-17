import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { cleanDir, exists, writeAtomically } from "../../playwright-official-docs/src/fs-utils.mjs";
import { removeJsxComponents } from "../../playwright-official-docs/src/preprocess.mjs";

describe("playwright-docs fs-utils", () => {
  it("restores previous output when rename fails", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "pw-docs-fs-"));
    const outDir = path.join(root, "output");
    const previous = path.join(outDir, "keep.txt");

    try {
      await fs.mkdir(outDir, { recursive: true });
      await fs.writeFile(previous, "previous-export", "utf8");

      const originalRename = fs.rename.bind(fs);
      let renameCalls = 0;
      fs.rename = async (from, to) => {
        renameCalls += 1;
        if (renameCalls === 2) {
          throw new Error("simulated rename failure");
        }
        return originalRename(from, to);
      };

      try {
        await assert.rejects(
          () =>
            writeAtomically(outDir, async (tmpDir) => {
              await fs.writeFile(path.join(tmpDir, "new.txt"), "new-export", "utf8");
            }),
          /simulated rename failure/
        );
      } finally {
        fs.rename = originalRename;
      }

      assert.equal(await exists(previous), true);
      assert.equal(await fs.readFile(previous, "utf8"), "previous-export");
    } finally {
      await cleanDir(root);
    }
  });
});

describe("playwright-docs preprocess jsx cleanup", () => {
  it("removes LiteYouTube self-closing components", () => {
    const body =
      '## Video\n\n<LiteYouTube videoid="abc123" title="Demo" />\n\nAfter.\n';
    const cleaned = removeJsxComponents(body);
    assert.match(cleaned, /After\./);
    assert.doesNotMatch(cleaned, /LiteYouTube/);
  });
});
