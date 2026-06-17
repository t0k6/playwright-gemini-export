/**
 * @file MDX前処理（TypeScript/Node.js向け）。
 */

/**
 * MDX frontmatterを解析する。
 * @param {string} mdx
 * @returns {{ meta: Record<string, string>, body: string }}
 */
export function parseFrontmatter(mdx) {
  if (!mdx.startsWith("---\n")) {
    return { meta: {}, body: mdx };
  }
  const end = mdx.indexOf("\n---\n", 4);
  if (end === -1) {
    return { meta: {}, body: mdx };
  }
  const raw = mdx.slice(4, end);
  /** @type {Record<string, string>} */
  const meta = {};
  for (const line of raw.split("\n")) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) {
      continue;
    }
    const [, key, value] = match;
    meta[key] = value.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
  }
  return { meta, body: mdx.slice(end + 5) };
}

/**
 * import行とDocusaurusコンポーネント行を削除する。
 * @param {string} body
 * @returns {string}
 */
export function removeImportsAndComponentLines(body) {
  return body
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("import ")) {
        return false;
      }
      if (trimmed.startsWith("<HTMLCard")) {
        return false;
      }
      return true;
    })
    .join("\n");
}

/**
 * TabItemブロックを抽出する。
 * @param {string} tabsBlock
 * @returns {Array<{ value: string, label: string, content: string }>}
 */
export function extractTabItems(tabsBlock) {
  /** @type {Array<{ value: string, label: string, content: string }>} */
  const items = [];
  const re = /<TabItem\s+([^>]*?)>([\s\S]*?)<\/TabItem>/g;
  let match;
  while ((match = re.exec(tabsBlock)) !== null) {
    const attrs = match[1];
    const content = match[2].trim();
    const valueMatch = attrs.match(/value="([^"]+)"/);
    const labelMatch = attrs.match(/label="([^"]+)"/);
    items.push({
      value: valueMatch?.[1] ?? "",
      label: labelMatch?.[1] ?? valueMatch?.[1] ?? "",
      content
    });
  }
  return items;
}

/**
 * 優先タブを選択する。
 * @param {Array<{ value: string, label: string, content: string }>} items
 * @param {{ packageManager?: string, languageTab?: string, tabMode?: string }} options
 * @returns {string}
 */
export function selectTabContent(items, options) {
  if (items.length === 0) {
    return "";
  }
  if (options.tabMode === "all") {
    return items.map((item) => `### ${item.label}\n\n${item.content}`).join("\n\n");
  }

  const pm = options.packageManager ?? "npm";
  const lang = options.languageTab ?? "typescript";
  const pmValues = [pm, "npm", "npx"];
  const langValues = [lang, "typescript", "js", "javascript"];

  for (const v of pmValues) {
    const found = items.find((item) => item.value.toLowerCase() === v.toLowerCase());
    if (found) {
      return found.content;
    }
  }
  for (const v of langValues) {
    const found = items.find((item) => item.value.toLowerCase() === v.toLowerCase());
    if (found) {
      return found.content;
    }
  }
  return items[0].content;
}

/**
 * Tabsブロックを展開する。
 * @param {string} body
 * @param {{ packageManager?: string, languageTab?: string, tabMode?: string }} options
 * @returns {string}
 */
export function expandTabs(body, options) {
  return body.replace(/<Tabs[^>]*>([\s\S]*?)<\/Tabs>/g, (_full, inner) => {
    const items = extractTabItems(inner);
    return selectTabContent(items, options);
  });
}

/**
 * 自己終了タグや空コンポーネントを削除する。
 * @param {string} body
 * @returns {string}
 */
export function removeJsxComponents(body) {
  return body
    .replace(/<TabItem[^>]*\/>/g, "")
    .replace(/<Tabs[^>]*\/>/g, "")
    .replace(/<\/Tabs>/g, "")
    .replace(/<\/TabItem>/g, "");
}

/**
 * 画像をテキスト注記へ置換する。
 * @param {string} body
 * @returns {string}
 */
export function replaceImages(body) {
  return body.replace(/!\[([^\]]*)\]\([^)]+\)/g, (_m, alt) => {
    const text = alt?.trim();
    return text ? `*(image: ${text})*` : "*(image)*";
  });
}

/**
 * API reference 定義フッターを削除する。
 * @param {string} body
 * @returns {string}
 */
export function removeApiReferenceFooter(body) {
  const lines = body.split("\n");
  const idx = lines.findIndex((line) => /^\[[A-Za-z][A-Za-z0-9]*\]:\s+\/api\//.test(line.trim()));
  if (idx === -1) {
    return body;
  }
  return lines.slice(0, idx).join("\n").trimEnd();
}

/**
 * languages.mdx から他言語セクションを削除する。
 * @param {string} body
 * @returns {string}
 */
export function filterLanguagesPage(body) {
  const start = body.indexOf("## Introduction");
  if (start === -1) {
    return body;
  }
  const jsStart = body.indexOf("## JavaScript and TypeScript");
  const pyStart = body.indexOf("## Python");
  if (jsStart === -1) {
    return body;
  }
  const end = pyStart === -1 ? body.length : pyStart;
  const intro = body.slice(start, jsStart).trim();
  const js = body.slice(jsStart, end).trim();
  return `${intro}\n\n${js}\n`;
}

/**
 * 連続空行を圧縮する。
 * @param {string} body
 * @returns {string}
 */
export function collapseBlankLines(body) {
  return body.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * 出力frontmatterを構築する。
 * @param {Record<string, string>} meta
 * @param {{ id: string, category: string, order: number, sourceUrl: string, rawUrl: string }} page
 * @returns {string}
 */
export function buildOutputFrontmatter(meta, page) {
  const title = meta.title ?? page.id;
  const lines = [
    "---",
    `id: ${page.id}`,
    `title: ${JSON.stringify(title)}`,
    `source_url: ${page.sourceUrl}`,
    `raw_url: ${page.rawUrl}`,
    `category: ${JSON.stringify(page.category)}`,
    `order: ${page.order}`,
    "---",
    ""
  ];
  return lines.join("\n");
}

/**
 * MDXをNotebookLM向けMarkdownへ前処理する。
 * @param {string} mdx
 * @param {{ id: string, category: string, order: number, sourceUrl: string, rawUrl: string }} page
 * @param {{ packageManager?: string, languageTab?: string, tabMode?: string }} options
 * @returns {{ markdown: string, stats: { removedImports: number, expandedTabs: number, removedApiRefs: number } }}
 */
export function preprocessMdx(mdx, page, options) {
  const importCount = (mdx.match(/^import /gm) ?? []).length;
  const tabsCount = (mdx.match(/<Tabs/g) ?? []).length;
  const { meta, body } = parseFrontmatter(mdx);
  let processed = removeImportsAndComponentLines(body);
  processed = expandTabs(processed, options);
  processed = removeJsxComponents(processed);
  processed = replaceImages(processed);
  if (page.id === "languages") {
    processed = filterLanguagesPage(processed);
  }
  const beforeApi = processed;
  processed = removeApiReferenceFooter(processed);
  const removedApiRefs = beforeApi === processed ? 0 : 1;
  processed = collapseBlankLines(processed);
  const markdown = `${buildOutputFrontmatter(meta, page)}${processed}\n`;
  return {
    markdown,
    stats: {
      removedImports: importCount,
      expandedTabs: tabsCount,
      removedApiRefs
    }
  };
}
