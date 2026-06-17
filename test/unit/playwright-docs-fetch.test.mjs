import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import {
  assertSafeMdxStem,
  buildMdxCatalog,
  resolveMdxStem
} from "../../playwright-official-docs/src/fetch.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const fixtureDir = path.join(repoRoot, "test", "fixtures", "playwright-docs");

describe("playwright-docs fetch", () => {
  it("builds catalog from fixture frontmatter ids", async () => {
    const index = await buildMdxCatalog({ fixtureDir }, repoRoot);
    assert.equal(resolveMdxStem(index.catalog, "intro"), "intro");
    assert.equal(resolveMdxStem(index.catalog, "writing-tests"), "writing-tests");
    assert.equal(resolveMdxStem(index.catalog, "languages"), "languages");
    assert.ok(index.contentByStem.has("intro"));
  });

  it("reuses cached content in loadMdx without re-reading file", async () => {
    const { loadMdx } = await import("../../playwright-official-docs/src/fetch.mjs");
    const index = await buildMdxCatalog({ fixtureDir }, repoRoot);
    const first = await loadMdx({ fixtureDir }, "intro", index, repoRoot);
    index.contentByStem.set("intro", "mutated");
    const second = await loadMdx({ fixtureDir }, "intro", index, repoRoot);
    assert.notEqual(first.content, second.content);
    assert.equal(second.content, "mutated");
  });

  it("falls back to doc id when catalog has no entry", () => {
    const catalog = new Map([["intro", "intro"]]);
    assert.equal(resolveMdxStem(catalog, "unknown-page"), "unknown-page");
  });

  it("rejects unsafe MDX stem", () => {
    assert.throws(() => assertSafeMdxStem("../secret"), /Invalid MDX stem/);
  });

  it("ignores unsafe fixture filenames when building catalog", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "pw-docs-fetch-"));
    try {
      const mdxDir = path.join(tmp, "mdx");
      await fs.mkdir(mdxDir, { recursive: true });
      await fs.writeFile(path.join(mdxDir, "valid.mdx"), "---\nid: valid\n---\n\nok\n", "utf8");
      await fs.writeFile(path.join(mdxDir, "..secret.mdx"), "---\nid: secret\n---\n\nno\n", "utf8");
      const index = await buildMdxCatalog({ fixtureDir: tmp }, tmp);
      assert.equal(index.catalog.has("valid"), true);
      assert.equal(index.catalog.has("secret"), false);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});
