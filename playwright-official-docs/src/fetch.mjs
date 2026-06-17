/**
 * @file リモート/ローカル取得。
 */

import fs from "node:fs/promises";
import path from "node:path";

import { parseFrontmatter } from "./preprocess.mjs";

/**
 * @typedef {{ catalog: Map<string, string>, contentByStem: Map<string, string> }} MdxIndex
 */

const TRUSTED_FETCH_HOSTS = new Set(["raw.githubusercontent.com", "api.github.com"]);

/**
 * 取得 URL が許可ホストか検証する。
 * @param {string} url
 */
function assertTrustedDownloadUrl(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || !TRUSTED_FETCH_HOSTS.has(parsed.hostname)) {
    throw new Error(`Untrusted download URL: ${url}`);
  }
}

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
  assertTrustedDownloadUrl(String(config.sidebarUrl));
  const text = await fetchText(String(config.sidebarUrl));
  return JSON.parse(text);
}

/**
 * カタログへエントリを登録する。
 * @param {MdxIndex} index
 * @param {string} id
 * @param {string} stem
 * @param {string} content
 */
function registerMdxEntry(index, id, stem, content) {
  const existingStem = index.catalog.get(id);
  if (existingStem !== undefined && existingStem !== stem) {
    console.warn(
      `Warning: duplicate doc id "${id}" in MDX catalog (${existingStem} vs ${stem}); using ${stem}`
    );
  }
  index.catalog.set(id, stem);
  index.contentByStem.set(stem, content);
}

/**
 * MDX frontmatter の id からファイル名 stem への索引を構築する。
 * @param {Record<string, unknown>} config
 * @returns {Promise<MdxIndex>}
 */
export async function buildMdxCatalog(config) {
  /** @type {MdxIndex} */
  const index = {
    catalog: new Map(),
    contentByStem: new Map()
  };

  if (config.fixtureDir) {
    const dir = path.join(String(config.fixtureDir), "mdx");
    const files = await fs.readdir(dir);
    for (const file of files.filter((name) => name.endsWith(".mdx"))) {
      const stem = file.replace(/\.mdx$/, "");
      const content = await fs.readFile(path.join(dir, file), "utf8");
      const { meta } = parseFrontmatter(content);
      registerMdxEntry(index, meta.id ?? stem, stem, content);
    }
    return index;
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
    assertTrustedDownloadUrl(entry.download_url);
    const content = await fetchText(entry.download_url);
    const { meta } = parseFrontmatter(content);
    registerMdxEntry(index, meta.id ?? stem, stem, content);
  }

  return index;
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
 * @param {MdxIndex} index
 * @returns {Promise<{ content: string, stem: string, rawUrl: string }>}
 */
export async function loadMdx(config, id, index) {
  const stem = resolveMdxStem(index.catalog, id);
  const rawUrl = `${config.mdxBaseUrl}/${stem}.mdx`;

  const cached = index.contentByStem.get(stem);
  if (cached !== undefined) {
    return { content: cached, stem, rawUrl };
  }

  if (config.fixtureDir) {
    const file = path.join(String(config.fixtureDir), "mdx", `${stem}.mdx`);
    const content = await fs.readFile(file, "utf8");
    index.contentByStem.set(stem, content);
    return { content, stem, rawUrl };
  }

  assertTrustedDownloadUrl(rawUrl);
  const content = await fetchText(rawUrl);
  index.contentByStem.set(stem, content);
  return { content, stem, rawUrl };
}
