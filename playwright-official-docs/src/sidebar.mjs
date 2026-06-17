/**
 * @file Playwright公式サイドバー解析。
 */

/**
 * カテゴリ名をbundleファイル名へ変換する。
 * @param {string} category
 * @returns {string}
 */
export function categoryToSlug(category) {
  const map = {
    "Getting Started": "getting-started",
    "Playwright Test": "playwright-test",
    Guides: "guides",
    Migration: "migration",
    Integrations: "integrations",
    Other: "other"
  };
  return map[category] ?? category.toLowerCase().replace(/\s+/g, "-");
}

/**
 * サイドバーJSONからdocsページ一覧を抽出する。
 * @param {{ docs: unknown[] }} sidebar
 * @param {{ docsBaseUrl: string, mdxBaseUrl: string }} urls
 * @returns {Array<{ id: string, title: string, category: string, order: number, sourceUrl: string, rawUrl: string }>}
 */
export function extractDocsPages(sidebar, urls) {
  /** @type {Array<{ id: string, title: string, category: string, order: number, sourceUrl: string, rawUrl: string }>} */
  const pages = [];
  let order = 0;

  /**
   * @param {unknown[]} items
   * @param {string} category
   */
  function walk(items, category) {
    for (const item of items) {
      if (!item || typeof item !== "object") {
        continue;
      }
      const typed = /** @type {{ type?: string, label?: string, id?: string, items?: unknown[] }} */ (item);
      if (typed.type === "category" && Array.isArray(typed.items)) {
        walk(typed.items, typed.label ?? category);
      } else if (typed.type === "doc" && typeof typed.id === "string") {
        if (!/^[a-z0-9-]+$/.test(typed.id)) {
          throw new Error(`Invalid sidebar doc id: ${typed.id}`);
        }
        order += 1;
        pages.push({
          id: typed.id,
          title: typed.id,
          category,
          order,
          sourceUrl: `${urls.docsBaseUrl}/docs/${typed.id}`,
          rawUrl: `${urls.mdxBaseUrl}/${typed.id}.mdx`
        });
      }
    }
  }

  if (!Array.isArray(sidebar.docs)) {
    throw new Error("sidebar.docs must be an array");
  }
  walk(sidebar.docs, "Other");
  return pages;
}

/**
 * doc id から公式URLを生成する。
 * @param {string} docsBaseUrl
 * @param {string} id
 * @returns {string}
 */
export function docIdToSourceUrl(docsBaseUrl, id) {
  return `${docsBaseUrl}/docs/${id}`;
}
