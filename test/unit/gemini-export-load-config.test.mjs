import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { CONFIG_BASENAME, loadConfig } from "../../tools/gemini-export/config.mjs";

describe("gemini-export loadConfig", () => {
  it("merges user JSON and warns on empty excludeDirs override", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "gemini-loadcfg-"));
    try {
      await fs.writeFile(
        path.join(tmp, CONFIG_BASENAME),
        JSON.stringify({
          sourcePaths: ["src"],
          excludeDirs: []
        }),
        "utf8"
      );
      const { config, warnings } = await loadConfig(tmp);
      assert.ok(Array.isArray(config.sourcePaths));
      assert.ok(config.sourcePaths.includes("src"));
      assert.ok(
        warnings.some((w) => w.includes("excludeDirs") && w.includes("空配列")),
        `expected excludeDirs empty-array notice, got: ${warnings.join(" | ")}`
      );
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it("merges indexChunk object with defaults", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "gemini-loadcfg-"));
    try {
      await fs.writeFile(
        path.join(tmp, CONFIG_BASENAME),
        JSON.stringify({
          sourcePaths: ["src"],
          indexChunk: {
            enabled: true,
            maxChunkBytes: 12345
          }
        }),
        "utf8"
      );
      const { config } = await loadConfig(tmp);
      assert.equal(config.indexChunk.enabled, true);
      assert.equal(config.indexChunk.maxChunkBytes, 12345);
      assert.equal(typeof config.indexChunk.projectIndexFile, "string");
      assert.equal(typeof config.indexChunk.pathIndexFile, "string");
      assert.equal(typeof config.indexChunk.chunksDir, "string");
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});
