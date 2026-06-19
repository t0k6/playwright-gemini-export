import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseArgs } from "../../playwright-official-docs/src/cli.mjs";

describe("playwright-docs cli", () => {
  it("rejects --fixture-dir when next arg is another flag", () => {
    assert.throws(
      () => parseArgs(["--fixture-dir", "--check"]),
      /--fixture-dir requires a path/
    );
  });

  it("accepts a valid fixture dir path", () => {
    const parsed = parseArgs(["--fixture-dir", "./test/fixtures/playwright-docs"]);
    assert.equal(parsed.fixtureDir, "./test/fixtures/playwright-docs");
    assert.equal(parsed.dryRun, false);
  });
});
