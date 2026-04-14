import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { estimatePackSummary } from "../../tools/gemini-export/pack.mjs";

describe("pack", () => {
  it("estimatePackSummary line mode matches chunking boundary with terminal newline", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "gemini-pack-estimate-"));
    try {
      const fileRel = "src/sample.ts";
      const fileAbs = path.join(tmp, "src", "sample.ts");
      await fs.mkdir(path.dirname(fileAbs), { recursive: true });
      await fs.writeFile(fileAbs, "a\nb\n", "utf8");

      const summary = await estimatePackSummary({
        repoRoot: tmp,
        manifest: { copiedFiles: [fileRel] },
        pack: {
          outSubDir: "_pack",
          chunkMode: "line",
          chunkMaxLines: 2,
          bundleGroupDepth: 2
        }
      });

      assert.equal(summary.chunkEstimate, 1);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});
