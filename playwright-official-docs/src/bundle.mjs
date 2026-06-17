/**
 * @file NotebookLM向けbundle生成。
 */

import { categoryToSlug } from "./sidebar.mjs";

/**
 * order のゼロ埋め幅を決める。
 * @param {number} totalPages
 * @returns {number}
 */
export function orderPaddingWidth(totalPages) {
  return Math.max(2, String(totalPages).length);
}

/**
 * orderをゼロ埋めする。
 * @param {number} order
 * @param {number} width
 * @returns {string}
 */
export function formatOrder(order, width) {
  return String(order).padStart(width, "0");
}

/**
 * ページファイル名を生成する。
 * @param {{ order: number, id: string }} page
 * @param {number} orderWidth
 * @returns {string}
 */
export function pageFileName(page, orderWidth) {
  return `${formatOrder(page.order, orderWidth)}-${page.id}.md`;
}

/**
 * bundle ファイル名を生成する。
 * @param {string} category
 * @returns {string}
 */
export function bundleFileName(category) {
  const slug = categoryToSlug(category);
  if (!/^[a-z0-9-]+$/.test(slug)) {
    throw new Error(`Unsafe bundle slug: ${slug}`);
  }
  return `${slug}.md`;
}

/**
 * カテゴリ単位でbundle Markdownを生成する。
 * @param {string} category
 * @param {Array<{ order: number, id: string, title?: string, markdown: string }>} pages
 * @returns {string}
 */
export function buildCategoryBundle(category, pages) {
  const slug = categoryToSlug(category);
  const lines = [
    "---",
    `bundle: ${slug}`,
    `category: ${JSON.stringify(category)}`,
    `page_count: ${pages.length}`,
    "---",
    "",
    `# ${category}`,
    ""
  ];
  const sorted = [...pages].sort((a, b) => a.order - b.order);
  for (const page of sorted) {
    lines.push(`## ${page.title ?? page.id}`);
    lines.push("");
    lines.push(`<!-- source: ${page.id} -->`);
    lines.push("");
    const body = page.markdown.replace(/^---[\s\S]*?---\n*/, "");
    lines.push(body.trim());
    lines.push("");
    lines.push("---");
    lines.push("");
  }
  return lines.join("\n").trimEnd() + "\n";
}

/**
 * ページをカテゴリ別にグループ化する。
 * @param {Array<{ category: string } & Record<string, unknown>>} pages
 * @returns {Map<string, Array<Record<string, unknown>>>}
 */
export function groupPagesByCategory(pages) {
  /** @type {Map<string, Array<Record<string, unknown>>>} */
  const map = new Map();
  for (const page of pages) {
    const list = map.get(page.category) ?? [];
    list.push(page);
    map.set(page.category, list);
  }
  return map;
}

/**
 * PROJECT_INDEX.md を生成する。
 * @param {Array<{ order: number, id: string, title: string, category: string, sourceUrl: string }>} pages
 * @returns {string}
 */
export function buildProjectIndex(pages) {
  const lines = [
    "# Playwright Official Docs Index",
    "",
    "NotebookLM / Gemini 向け索引。詳細は `notebooklm/` の bundle を参照。",
    "",
    "| order | id | title | category | source |",
    "| --- | --- | --- | --- | --- |"
  ];
  for (const page of pages) {
    lines.push(
      `| ${page.order} | ${page.id} | ${page.title} | ${page.category} | ${page.sourceUrl} |`
    );
  }
  lines.push("");
  return lines.join("\n");
}
