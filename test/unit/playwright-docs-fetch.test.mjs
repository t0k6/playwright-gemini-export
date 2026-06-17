import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { buildMdxCatalog, resolveMdxStem } from "../../playwright-official-docs/src/fetch.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.join(__dirname, "..", "fixtures", "playwright-docs");

describe("playwright-docs fetch", () => {
  it("builds catalog from fixture frontmatter ids", async () => {
    const index = await buildMdxCatalog({ fixtureDir });
    assert.equal(resolveMdxStem(index.catalog, "intro"), "intro");
    assert.equal(resolveMdxStem(index.catalog, "writing-tests"), "writing-tests");
    assert.equal(resolveMdxStem(index.catalog, "languages"), "languages");
    assert.ok(index.contentByStem.has("intro"));
  });

  it("reuses cached content in loadMdx without re-reading file", async () => {
    const { loadMdx } = await import("../../playwright-official-docs/src/fetch.mjs");
    const index = await buildMdxCatalog({ fixtureDir });
    const first = await loadMdx({ fixtureDir }, "intro", index);
    index.contentByStem.set("intro", "mutated");
    const second = await loadMdx({ fixtureDir }, "intro", index);
    assert.notEqual(first.content, second.content);
    assert.equal(second.content, "mutated");
  });

  it("falls back to doc id when catalog has no entry", () => {
    const catalog = new Map([["intro", "intro"]]);
    assert.equal(resolveMdxStem(catalog, "unknown-page"), "unknown-page");
  });
});
