import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { generateIndexAndChunks } from "../../tools/gemini-export/index-chunk.mjs";
import { splitTextByMaxBytes } from "../../tools/lib/gemini-export-pure.mjs";

describe("index-chunk chunk filename padding", () => {
  it("uses zero width based on chunk count so 10+ chunks sort lexicographically", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "idx-chunk-pad-"));
    const outDirAbs = path.join(tmp, "out");
    await fs.mkdir(outDirAbs, { recursive: true });
    const lines = Array.from({ length: 200 }, () => "aaaaa");
    const text = `${lines.join("\n")}\n`;
    await fs.writeFile(path.join(outDirAbs, "many.txt"), text, "utf8");

    const manifest = { copiedFiles: ["many.txt"], warnings: [] };
    const chunks = splitTextByMaxBytes(text, { maxChunkBytes: 24 });
    await generateIndexAndChunks(manifest, outDirAbs, {
      projectIndexFile: "PROJECT_INDEX.md",
      pathIndexFile: "PATH_INDEX.jsonl",
      chunksDir: "chunks",
      maxChunkBytes: 24,
      chunkExtensions: [".txt"]
    });

    const chunkDir = path.join(outDirAbs, "chunks");
    const names = (await fs.readdir(chunkDir)).filter((n) => n.endsWith(".md"));
    assert.ok(chunks.length >= 10, `expected >=10 chunks, got ${chunks.length}`);
    assert.ok(names.length >= 10, `expected >=10 chunk files, got ${names.length}`);

    const widths = names.map((n) => {
      const m = n.match(/__(\d+)\.md$/);
      assert.ok(m, `unexpected chunk name: ${n}`);
      return m[1].length;
    });
    const expectedWidth = String(chunks.length).length;
    assert.ok(widths.every((w) => w === expectedWidth), `widths ${widths.join(",")} expected ${expectedWidth}`);

    await fs.rm(tmp, { recursive: true, force: true });
  });
});
