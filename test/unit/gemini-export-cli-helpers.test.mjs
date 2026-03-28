import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkTitle } from "../../tools/gemini-export/cli.mjs";

describe("gemini-export cli helpers", () => {
  it("checkTitle reflects dry-run", () => {
    assert.equal(checkTitle(true), "Check completed.");
    assert.equal(checkTitle(false), "Export completed.");
  });
});
