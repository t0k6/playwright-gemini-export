import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildAiReadme } from "../../tools/gemini-export/readme.mjs";

describe("gemini-export readme", () => {
  it("buildAiReadme lists sourcePaths and summary counts", () => {
    const md = buildAiReadme({
      sourcePaths: ["src", "tests"],
      copiedFiles: ["a.ts", "b.ts"],
      redactedFiles: [{}],
      anonymizedFiles: [],
      skippedFiles: ["x"],
      warnings: ["w"]
    });
    assert.match(md, /`src`/);
    assert.match(md, /`tests`/);
    assert.match(md, /copiedFiles: 2/);
    assert.match(md, /skippedFiles: 1/);
    assert.match(md, /warnings: 1/);
    assert.match(md, /\(not generated\)/);
    assert.match(md, /chunkCount: 0/);
  });

  it("buildAiReadme includes pack section when packOutSubDir is set", () => {
    const md = buildAiReadme(
      {
        sourcePaths: ["src"],
        copiedFiles: ["src/x.ts", "_pack/PROJECT_INDEX.md"],
        redactedFiles: [],
        anonymizedFiles: [],
        skippedFiles: [],
        warnings: []
      },
      { packOutSubDir: "_pack" }
    );
    assert.match(md, /Pack output/);
    assert.match(md, /`_pack\/PROJECT_INDEX\.md`/);
    assert.match(md, /`_pack\/chunks\/`/);
    assert.match(md, /`_pack\/bundles\/`/);
  });
});
