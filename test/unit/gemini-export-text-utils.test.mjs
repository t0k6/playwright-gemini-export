import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { looksLikeText, sha256 } from "../../tools/gemini-export/text-utils.mjs";

describe("gemini-export text-utils", () => {
  describe("looksLikeText", () => {
    it("returns true for utf8 prose buffer", () => {
      assert.equal(looksLikeText(Buffer.from("hello world\n", "utf8")), true);
    });

    it("returns false when NUL appears in sample", () => {
      const buf = Buffer.alloc(10);
      buf.write("abc", 0);
      buf[3] = 0;
      assert.equal(looksLikeText(buf), false);
    });
  });

  describe("sha256", () => {
    it("matches known digest for empty string", () => {
      assert.equal(
        sha256(""),
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
      );
    });
  });
});
