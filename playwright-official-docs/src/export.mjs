/**
 * @file エクスポートオーケストレーション。
 */

import fs from "node:fs/promises";
import path from "node:path";

import {
  buildCategoryBundle,
  buildProjectIndex,
  bundleFileName,
  groupPagesByCategory,
  orderPaddingWidth,
  pageFileName
} from "./bundle.mjs";
import { buildMdxCatalog, loadMdx, loadSidebar } from "./fetch.mjs";
import { ensureDir, writeAtomically } from "./fs-utils.mjs";
import { preprocessMdx } from "./preprocess.mjs";
import { extractDocsPages } from "./sidebar.mjs";
import {
  buildOfficialUrlListMarkdown,
  buildUrlReviewMarkdown,
  diffDocIds
} from "./url-review.mjs";

/**
 * ページタイトルをfrontmatterから補完する。
 * @param {string} markdown
 * @param {string} fallback
 * @returns {string}
 */
function extractTitle(markdown, fallback) {
  const match = markdown.match(/^title:\s*(.+)$/m);
  if (!match) {
    return fallback;
  }
  try {
    return JSON.parse(match[1].trim());
  } catch {
    return match[1].trim().replace(/^"(.*)"$/, "$1");
  }
}

/**
 * エクスポートを実行する。
 * @param {Record<string, unknown>} config
 * @param {{ dryRun?: boolean, repoRoot: string }} options
 * @returns {Promise<{ pageCount: number, bundleCount: number, urlUnchanged: boolean }>}
 */
export async function runExport(config, options) {
  const repoRoot = options.repoRoot;
  const outDir = path.resolve(repoRoot, String(config.outDir));
  const sidebar = await loadSidebar(config);
  const pages = extractDocsPages(sidebar, {
    docsBaseUrl: String(config.docsBaseUrl),
    mdxBaseUrl: String(config.mdxBaseUrl)
  });

  const baselineIds = /** @type {string[]} */ (config.baselineDocIds);
  const diff = diffDocIds(
    pages.map((p) => p.id),
    baselineIds
  );

  if (options.dryRun) {
    return {
      pageCount: pages.length,
      bundleCount: groupPagesByCategory(pages).size,
      urlUnchanged: diff.unchanged
    };
  }

  /** @type {Array<{ order: number, id: string, title: string, category: string, sourceUrl: string, rawUrl: string, markdown: string, stats: Record<string, number> }>} */
  const processedPages = [];
  const mdxIndex = await buildMdxCatalog(config);
  const orderWidth = orderPaddingWidth(pages.length);

  for (const page of pages) {
    const { content, rawUrl } = await loadMdx(config, page.id, mdxIndex);
    const pageWithRaw = { ...page, rawUrl };
    const { markdown, stats } = preprocessMdx(content, pageWithRaw, {
      packageManager: String(config.packageManager ?? "npm"),
      languageTab: String(config.languageTab ?? "typescript"),
      tabMode: String(config.tabMode ?? "select")
    });
    const title = extractTitle(markdown, page.id);
    processedPages.push({
      ...pageWithRaw,
      title,
      markdown,
      stats
    });
  }

  await writeAtomically(outDir, async (tmpDir) => {
    const pagesDir = path.join(tmpDir, "pages");
    const notebookDir = path.join(tmpDir, "notebooklm");
    await ensureDir(pagesDir);
    await ensureDir(notebookDir);

    for (const page of processedPages) {
      await fs.writeFile(
        path.join(pagesDir, pageFileName(page, orderWidth)),
        page.markdown,
        "utf8"
      );
    }

    const grouped = groupPagesByCategory(processedPages);
    for (const [category, categoryPages] of grouped) {
      const bundleName = bundleFileName(category);
      const bundle = buildCategoryBundle(category, categoryPages);
      await fs.writeFile(path.join(notebookDir, bundleName), bundle, "utf8");
    }

    const urlList = buildOfficialUrlListMarkdown(processedPages);
    await fs.writeFile(path.join(tmpDir, "official-url-list.md"), urlList, "utf8");

    const urlReview = buildUrlReviewMarkdown(
      processedPages,
      baselineIds,
      String(config.docsBaseUrl)
    );
    await fs.writeFile(path.join(tmpDir, "url-review.md"), urlReview, "utf8");

    const index = buildProjectIndex(processedPages);
    await fs.writeFile(path.join(tmpDir, "PROJECT_INDEX.md"), index, "utf8");

    const manifest = {
      pageCount: processedPages.length,
      bundleCount: grouped.size,
      urlReview: diff,
      pages: processedPages.map((p) => ({
        id: p.id,
        title: p.title,
        category: p.category,
        order: p.order,
        sourceUrl: p.sourceUrl,
        rawUrl: p.rawUrl,
        outputFile: `pages/${pageFileName(p, orderWidth)}`,
        stats: p.stats
      }))
    };
    await fs.writeFile(
      path.join(tmpDir, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8"
    );
  });

  return {
    pageCount: processedPages.length,
    bundleCount: groupPagesByCategory(processedPages).size,
    urlUnchanged: diff.unchanged
  };
}
