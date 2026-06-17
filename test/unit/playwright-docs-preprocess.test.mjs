import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  expandTabs,
  extractTabItems,
  filterLanguagesPage,
  preprocessMdx,
  removeApiReferenceFooter
} from "../../playwright-official-docs/src/preprocess.mjs";

describe("playwright-docs preprocess", () => {
  it("expands nested Tabs blocks iteratively", () => {
    const body = `<Tabs>
<TabItem value="outer" label="outer">
Outer
<Tabs>
<TabItem value="npm" label="npm">

\`\`\`bash
npm test
\`\`\`

</TabItem>
</Tabs>
</TabItem>
</Tabs>`;
    const expanded = expandTabs(body, { packageManager: "npm" });
    assert.match(expanded, /npm test/);
    assert.doesNotMatch(expanded, /<Tabs/);
    assert.doesNotMatch(expanded, /<TabItem/);
  });

  it("selects npm tab content by default", () => {
    const tabs = `<Tabs>
<TabItem value="npm" label="npm">

\`\`\`bash
npm init playwright@latest
\`\`\`

</TabItem>
<TabItem value="yarn" label="yarn">

\`\`\`bash
yarn create playwright
\`\`\`

</TabItem>
</Tabs>`;
    const items = extractTabItems(tabs);
    assert.equal(items.length, 2);
    const expanded = expandTabs(tabs, { packageManager: "npm" });
    assert.match(expanded, /npm init playwright@latest/);
    assert.doesNotMatch(expanded, /yarn create playwright/);
  });

  it("removes API reference footer definitions", () => {
    const body = "## Title\n\nContent.\n\n[Page]: /api/class-page.mdx \"Page\"\n";
    const cleaned = removeApiReferenceFooter(body);
    assert.match(cleaned, /Content\./);
    assert.doesNotMatch(cleaned, /\[Page\]:/);
  });

  it("keeps only JavaScript and TypeScript on languages page", () => {
    const body = `## Introduction\n\nIntro.\n\n## JavaScript and TypeScript\n\nNode docs.\n\n## Python\n\nPython docs.\n`;
    const filtered = filterLanguagesPage(body);
    assert.match(filtered, /JavaScript and TypeScript/);
    assert.doesNotMatch(filtered, /## Python/);
  });

  it("preprocesses full MDX with output frontmatter", () => {
    const mdx = `---
id: intro
title: "Installation"
---
import Tabs from '@theme/Tabs';

## Introduction

Hello.

[Page]: /api/class-page.mdx "Page"
`;
    const { markdown } = preprocessMdx(
      mdx,
      {
        id: "intro",
        category: "Getting Started",
        order: 1,
        sourceUrl: "https://playwright.dev/docs/intro",
        rawUrl: "https://example.com/intro.mdx"
      },
      { packageManager: "npm" }
    );
    assert.match(markdown, /^---\n/);
    assert.match(markdown, /source_url: https:\/\/playwright\.dev\/docs\/intro/);
    assert.match(markdown, /## Introduction/);
    assert.doesNotMatch(markdown, /^import /m);
    assert.doesNotMatch(markdown, /\[Page\]:/);
  });
});
