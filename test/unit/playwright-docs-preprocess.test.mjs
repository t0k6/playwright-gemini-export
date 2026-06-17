import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  expandTabs,
  extractTabItems,
  filterLanguagesPage,
  preprocessMdx,
  removeApiReferenceFooter,
  removeImportsAndComponentLines,
  removeJsxComponents,
  replaceImages,
  selectTabContent
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

  it("removes MDX imports but keeps imports inside fenced code blocks", () => {
    const body = `import Tabs from '@theme/Tabs';

## Example

\`\`\`js
import { test, expect } from '@playwright/test';
test('ok', async () => {});
\`\`\`
`;
    const { body: cleaned, removedImports } = removeImportsAndComponentLines(body);
    assert.equal(removedImports, 1);
    assert.doesNotMatch(cleaned, /^import Tabs/m);
    assert.match(cleaned, /import \{ test, expect \} from '@playwright\/test'/);
  });

  it("keeps JSX inside fenced code blocks but removes MDX chrome outside", () => {
    const body = `<LiteYouTube videoid="abc" />\n\n\`\`\`tsx\nawait mount(<App />)\n\`\`\`\n`;
    const cleaned = removeJsxComponents(body);
    assert.match(cleaned, /await mount\(<App \/>\)/);
    assert.doesNotMatch(cleaned, /LiteYouTube/);
  });

  it("keeps markdown image syntax inside fenced code blocks", () => {
    const body = `![outside](./outside.png)\n\n\`\`\`md\n![inside](./inside.png)\n\`\`\`\n`;
    const cleaned = replaceImages(body);
    assert.match(cleaned, /\*\(image: outside\)\*/);
    assert.match(cleaned, /!\[inside\]\(\.\/inside\.png\)/);
  });

  it("allows tab helpers to run without options", () => {
    const items = [{ value: "npm", label: "npm", content: "npm ok" }];
    assert.equal(selectTabContent(items), "npm ok");
    const expanded = expandTabs(
      '<Tabs><TabItem value="npm" label="npm">npm ok</TabItem></Tabs>'
    );
    assert.match(expanded, /npm ok/);
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
