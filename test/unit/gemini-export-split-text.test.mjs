import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { splitTextByMaxBytes } from "../../tools/lib/gemini-export-pure.mjs";

describe("splitTextByMaxBytes", () => {
  it("returns no chunks for empty string", () => {
    const chunks = splitTextByMaxBytes("", { maxChunkBytes: 100 });
    assert.equal(chunks.length, 0);
  });

  it("splits lines to stay under byte cap", () => {
    const line = "a".repeat(20);
    const text = `${line}\n${line}\n${line}\n`;
    const chunks = splitTextByMaxBytes(text, { maxChunkBytes: 50 });
    assert.ok(chunks.length >= 2);
    for (const c of chunks) {
      assert.ok(c.text.length > 0, "chunk must be non-empty");
      assert.ok(Buffer.byteLength(c.text, "utf8") <= 50, "chunk must not exceed byte cap");
    }
  });

  it("handles one long line exceeding cap with fallback split", () => {
    const long = "x".repeat(200);
    const chunks = splitTextByMaxBytes(`${long}\n`, { maxChunkBytes: 40 });
    assert.ok(chunks.length >= 2);
  });
});
