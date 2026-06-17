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
 * 行がフェンスコードブロックの境界か判定する。
 * @param {string} line
 * @returns {boolean}
 */
function isFenceBoundary(line) {
  return /^`{3,}/.test(line.trim());
}

/**
 * コードフェンス外のテキストだけ変換する。
 * @param {string} body
 * @param {(segment: string) => string} transform
 * @returns {string}
 */
function transformOutsideFences(body, transform) {
  const lines = body.split("\n");
  let inFence = false;
  /** @type {string[]} */
  const out = [];
  /** @type {string[]} */
  let buffer = [];

  const flushBuffer = () => {
    if (buffer.length === 0) {
      return;
    }
    const text = buffer.join("\n");
    buffer = [];
    out.push(inFence ? text : transform(text));
  };

  for (const line of lines) {
    if (isFenceBoundary(line)) {
      flushBuffer();
      out.push(line);
      inFence = !inFence;
      continue;
    }
    buffer.push(line);
  }
  flushBuffer();
  return out.join("\n");
}

/**
 * import行とDocusaurusコンポーネント行を削除する（コードフェンス内は保持）。
 * @param {string} body
 * @returns {{ body: string, removedImports: number }}
 */
export function removeImportsAndComponentLines(body) {
  const lines = body.split("\n");
  let inFence = false;
  let removedImports = 0;
  /** @type {string[]} */
  const kept = [];

  for (const line of lines) {
    if (isFenceBoundary(line)) {
      inFence = !inFence;
      kept.push(line);
      continue;
    }
    if (!inFence) {
      const trimmed = line.trim();
      if (trimmed.startsWith("import ")) {
        removedImports += 1;
        continue;
      }
      if (trimmed.startsWith("<HTMLCard")) {
        continue;
      }
    }
    kept.push(line);
  }

  return { body: kept.join("\n"), removedImports };
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
export function selectTabContent(items, options = {}) {
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
export function expandTabs(body, options = {}) {
  let result = body;
  const tabsPattern = /<Tabs[^>]*>([\s\S]*?)<\/Tabs>/g;
  let prev;
  do {
    prev = result;
    result = result.replace(tabsPattern, (_full, inner) => {
      const items = extractTabItems(inner);
      return selectTabContent(items, options);
    });
  } while (result !== prev && /<Tabs[\s>]/.test(result));
  return result;
}

/**
 * 自己終了タグや空コンポーネントを削除する。
 * @param {string} body
 * @returns {string}
 */
export function removeJsxComponents(body) {
  return transformOutsideFences(body, (segment) =>
    segment
      .replace(/<[A-Z][A-Za-z0-9]*\b[^>]*\/>/g, "")
      .replace(/<TabItem[^>]*\/>/g, "")
      .replace(/<Tabs[^>]*\/>/g, "")
      .replace(/<\/Tabs>/g, "")
      .replace(/<\/TabItem>/g, "")
  );
}

/**
 * 画像をテキスト注記へ置換する。
 * @param {string} body
 * @returns {string}
 */
export function replaceImages(body) {
  return transformOutsideFences(body, (segment) =>
    segment.replace(/!\[([^\]]*)\]\([^)]+\)/g, (_m, alt) => {
      const text = alt?.trim();
      return text ? `*(image: ${text})*` : "*(image)*";
    })
  );
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
export function preprocessMdx(mdx, page, options = {}) {
  const tabsCount = (mdx.match(/<Tabs/g) ?? []).length;
  const { meta, body } = parseFrontmatter(mdx);
  const { body: strippedBody, removedImports } = removeImportsAndComponentLines(body);
  let processed = strippedBody;
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
      removedImports,
      expandedTabs: tabsCount,
      removedApiRefs
    }
  };
}
