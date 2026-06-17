/**
 * @file リモート/ローカル取得。
 */

import fs from "node:fs/promises";
import path from "node:path";

import { parseFrontmatter } from "./preprocess.mjs";

/**
 * HTTPテキストを取得する。
 * @param {string} url
 * @returns {Promise<string>}
 */
export async function fetchText(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "playwright-official-docs-export/1.0" }
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  return res.text();
}

/**
 * サイドバーJSONを取得する。
 * @param {Record<string, unknown>} config
 * @returns {Promise<unknown>}
 */
export async function loadSidebar(config) {
  if (config.fixtureDir) {
    const file = path.join(String(config.fixtureDir), "sidebar.json");
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw);
  }
  const text = await fetchText(String(config.sidebarUrl));
  return JSON.parse(text);
}

/**
 * MDX frontmatter の id からファイル名 stem への索引を構築する。
 * @param {Record<string, unknown>} config
 * @returns {Promise<Map<string, string>>}
 */
export async function buildMdxCatalog(config) {
  /** @type {Map<string, string>} */
  const catalog = new Map();

  if (config.fixtureDir) {
    const dir = path.join(String(config.fixtureDir), "mdx");
    const files = await fs.readdir(dir);
    for (const file of files.filter((name) => name.endsWith(".mdx"))) {
      const stem = file.replace(/\.mdx$/, "");
      const content = await fs.readFile(path.join(dir, file), "utf8");
      const { meta } = parseFrontmatter(content);
      catalog.set(meta.id ?? stem, stem);
    }
    return catalog;
  }

  const listingUrl =
    "https://api.github.com/repos/microsoft/playwright.dev/contents/nodejs/versioned_docs/version-stable?ref=main";
  const res = await fetch(listingUrl, {
    headers: { "User-Agent": "playwright-official-docs-export/1.0" }
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch MDX listing: ${res.status} ${res.statusText}`);
  }
  const listing = /** @type {Array<{ name: string, download_url: string, type: string }>} */ (
    await res.json()
  );

  for (const entry of listing) {
    if (entry.type !== "file" || !entry.name.endsWith(".mdx")) {
      continue;
    }
    const stem = entry.name.replace(/\.mdx$/, "");
    const content = await fetchText(entry.download_url);
    const { meta } = parseFrontmatter(content);
    catalog.set(meta.id ?? stem, stem);
  }

  return catalog;
}

/**
 * doc id から MDX ファイル stem を解決する。
 * @param {Map<string, string>} catalog
 * @param {string} id
 * @returns {string}
 */
export function resolveMdxStem(catalog, id) {
  return catalog.get(id) ?? id;
}

/**
 * MDX本文を取得する。
 * @param {Record<string, unknown>} config
 * @param {string} id
 * @param {Map<string, string>} catalog
 * @returns {Promise<{ content: string, stem: string, rawUrl: string }>}
 */
export async function loadMdx(config, id, catalog) {
  const stem = resolveMdxStem(catalog, id);
  const rawUrl = `${config.mdxBaseUrl}/${stem}.mdx`;

  if (config.fixtureDir) {
    const file = path.join(String(config.fixtureDir), "mdx", `${stem}.mdx`);
    const content = await fs.readFile(file, "utf8");
    return { content, stem, rawUrl };
  }

  const content = await fetchText(rawUrl);
  return { content, stem, rawUrl };
}
