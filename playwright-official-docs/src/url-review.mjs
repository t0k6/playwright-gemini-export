/**
 * @file URLリスト検証・差分レポート。
 */

import { docIdToSourceUrl } from "./sidebar.mjs";

/**
 * 差分を計算する。
 * @param {string[]} officialIds
 * @param {string[]} baselineIds
 * @returns {{ added: string[], removed: string[], unchanged: boolean }}
 */
export function diffDocIds(officialIds, baselineIds) {
  const officialSet = new Set(officialIds);
  const baselineSet = new Set(baselineIds);
  const added = officialIds.filter((id) => !baselineSet.has(id));
  const removed = baselineIds.filter((id) => !officialSet.has(id));
  return {
    added,
    removed,
    unchanged: added.length === 0 && removed.length === 0
  };
}

/**
 * 公式URL一覧Markdownを生成する。
 * @param {Array<{ id: string, category: string, sourceUrl: string }>} pages
 * @returns {string}
 */
export function buildOfficialUrlListMarkdown(pages) {
  const lines = [
    "# Playwright Test > Testing documentation (Node.js)",
    "",
    "公式 stable サイドバー由来の URL 一覧。",
    ""
  ];
  let currentCategory = "";
  for (const page of pages) {
    if (page.category !== currentCategory) {
      currentCategory = page.category;
      lines.push(`## ${currentCategory}`);
      lines.push("");
    }
    lines.push(page.sourceUrl);
  }
  lines.push("");
  return lines.join("\n");
}

/**
 * URLレビューレポートを生成する。
 * @param {Array<{ id: string, category: string, sourceUrl: string }>} pages
 * @param {string[]} baselineIds
 * @param {string} docsBaseUrl
 * @returns {string}
 */
export function buildUrlReviewMarkdown(pages, baselineIds, docsBaseUrl) {
  const officialIds = pages.map((p) => p.id);
  const diff = diffDocIds(officialIds, baselineIds);
  const lines = [
    "# URL Review",
    "",
    `公式ページ数: ${officialIds.length}`,
    `ベースライン数: ${baselineIds.length}`,
    `一致: ${diff.unchanged ? "はい" : "いいえ"}`,
    ""
  ];

  if (diff.added.length > 0) {
    lines.push("## 追加（公式にあってベースラインにない）");
    lines.push("");
    for (const id of diff.added) {
      lines.push(`- \`${id}\` — ${docIdToSourceUrl(docsBaseUrl, id)}`);
    }
    lines.push("");
  }

  if (diff.removed.length > 0) {
    lines.push("## 削除（ベースラインにあって公式にない）");
    lines.push("");
    for (const id of diff.removed) {
      lines.push(`- \`${id}\` — ${docIdToSourceUrl(docsBaseUrl, id)}`);
    }
    lines.push("");
  }

  if (diff.unchanged) {
    lines.push("ベースライン URL リストは公式 stable サイドバーと一致しています。");
    lines.push("");
  }

  return lines.join("\n");
}
