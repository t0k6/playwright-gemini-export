import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { categoryToSlug, extractDocsPages } from "../../playwright-official-docs/src/sidebar.mjs";
import { diffDocIds } from "../../playwright-official-docs/src/url-review.mjs";

describe("playwright-docs sidebar", () => {
  it("extracts doc pages from sidebar categories", () => {
    const sidebar = {
      docs: [
        {
          type: "category",
          label: "Getting Started",
          items: [{ type: "doc", id: "intro" }]
        },
        { type: "doc", id: "languages" }
      ]
    };
    const pages = extractDocsPages(sidebar, {
      docsBaseUrl: "https://playwright.dev",
      mdxBaseUrl: "https://example.com/mdx"
    });
    assert.equal(pages.length, 2);
    assert.equal(pages[0].id, "intro");
    assert.equal(pages[0].category, "Getting Started");
    assert.equal(pages[0].sourceUrl, "https://playwright.dev/docs/intro");
    assert.equal(pages[1].category, "Other");
  });

  it("maps categories to bundle slugs", () => {
    assert.equal(categoryToSlug("Getting Started"), "getting-started");
    assert.equal(categoryToSlug("Playwright Test"), "playwright-test");
    assert.equal(categoryToSlug("Guides"), "guides");
  });

  it("rejects invalid doc ids from sidebar", () => {
    assert.throws(
      () =>
        extractDocsPages(
          { docs: [{ type: "doc", id: "../escape" }] },
          { docsBaseUrl: "https://playwright.dev", mdxBaseUrl: "https://example.com/mdx" }
        ),
      /Invalid sidebar doc id/
    );
  });
});

describe("playwright-docs url-review", () => {
  it("detects added and removed doc ids", () => {
    const diff = diffDocIds(["intro", "new-page"], ["intro", "old-page"]);
    assert.deepEqual(diff.added, ["new-page"]);
    assert.deepEqual(diff.removed, ["old-page"]);
    assert.equal(diff.unchanged, false);
  });

  it("reports unchanged when lists match", () => {
    const diff = diffDocIds(["a", "b"], ["a", "b"]);
    assert.equal(diff.unchanged, true);
  });
});
