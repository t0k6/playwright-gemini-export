import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { estimateIndexChunkSummary } from "../../tools/gemini-export/index-chunk.mjs";
import { defaultConfig } from "../../tools/gemini-export/default-config.mjs";

describe("estimateIndexChunkSummary", () => {
  it("counts path rows and chunks from readRootAbs", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "idx-est-"));
    try {
      await fs.writeFile(path.join(tmp, "a.ts"), "line1\nline2\n", "utf8");
      const manifest = { copiedFiles: ["a.ts"] };
      const s = await estimateIndexChunkSummary({
        readRootAbs: tmp,
        manifest,
        indexChunkConfig: defaultConfig.indexChunk
      });
      assert.equal(s.pathRowCount, 1);
      assert.ok(s.chunkEstimate >= 1);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});
