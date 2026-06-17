import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildCategoryBundle,
  formatOrder,
  orderPaddingWidth,
  pageFileName
} from "../../playwright-official-docs/src/bundle.mjs";

describe("playwright-docs bundle", () => {
  it("formats page file names with order prefix", () => {
    assert.equal(pageFileName({ order: 3, id: "intro" }, 2), "03-intro.md");
  });

  it("uses dynamic padding width for 100+ pages", () => {
    assert.equal(orderPaddingWidth(72), 2);
    assert.equal(orderPaddingWidth(100), 3);
    assert.equal(formatOrder(100, 3), "100");
    assert.equal(pageFileName({ order: 10, id: "intro" }, 3), "010-intro.md");
  });

  it("builds category bundle with page separators", () => {
    const bundle = buildCategoryBundle("Getting Started", [
      {
        order: 1,
        id: "intro",
        title: "Installation",
        markdown: "---\nid: intro\n---\n\n## Introduction\n\nBody.\n"
      }
    ]);
    assert.match(bundle, /^---\nbundle: getting-started/);
    assert.match(bundle, /## Installation/);
    assert.match(bundle, /<!-- source: intro -->/);
    assert.match(bundle, /## Introduction/);
  });
});
