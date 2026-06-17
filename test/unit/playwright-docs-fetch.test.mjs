import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { buildMdxCatalog, resolveMdxStem } from "../../playwright-official-docs/src/fetch.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.join(__dirname, "..", "fixtures", "playwright-docs");

describe("playwright-docs fetch", () => {
  it("builds catalog from fixture frontmatter ids", async () => {
    const catalog = await buildMdxCatalog({ fixtureDir });
    assert.equal(resolveMdxStem(catalog, "intro"), "intro");
    assert.equal(resolveMdxStem(catalog, "writing-tests"), "writing-tests");
    assert.equal(resolveMdxStem(catalog, "languages"), "languages");
  });

  it("falls back to doc id when catalog has no entry", () => {
    const catalog = new Map([["intro", "intro"]]);
    assert.equal(resolveMdxStem(catalog, "unknown-page"), "unknown-page");
  });
});
