/**
 * @file リモート/ローカル取得。
 */

import fs from "node:fs/promises";
import path from "node:path";

import { resolveWithinRepo } from "../../tools/gemini-export/repo-path.mjs";
import { isWithinBaseDir } from "../../tools/lib/gemini-export-pure.mjs";
import { parseFrontmatter } from "./preprocess.mjs";

/**
 * @typedef {{ catalog: Map<string, string>, contentByStem: Map<string, string> }} MdxIndex
 */

const TRUSTED_FETCH_HOSTS = new Set(["raw.githubusercontent.com", "api.github.com"]);
const SAFE_MDX_STEM = /^[a-z0-9-]+$/;
const SAFE_MDX_FILE = /^[a-z0-9-]+\.mdx$/;

/**
 * MDX stem が安全な形式か検証する。
 * @param {string} stem
 */
export function assertSafeMdxStem(stem) {
  if (!SAFE_MDX_STEM.test(stem)) {
    throw new Error(`Invalid MDX stem: ${stem}`);
  }
}

/**
 * fixture の MDX を containment 検証付きで読み込む。
 * @param {string} fixtureDir
 * @param {string} stem
 * @param {string} repoRoot
 * @returns {Promise<string>}
 */
async function readFixtureMdx(fixtureDir, stem, repoRoot) {
  assertSafeMdxStem(stem);
  const mdxDir = path.join(fixtureDir, "mdx");
  const candidate = path.join(mdxDir, `${stem}.mdx`);
  const resolved = await resolveWithinRepo(candidate, repoRoot);
  if (!resolved.ok) {
    throw new Error(`Fixture MDX path not allowed: ${candidate} (${resolved.skipTag})`);
  }
  let realMdxDir;
  try {
    realMdxDir = await fs.realpath(mdxDir);
  } catch {
    throw new Error(`Fixture MDX directory not found: ${mdxDir}`);
  }
  if (!isWithinBaseDir(resolved.realPath, realMdxDir)) {
    throw new Error(`Fixture MDX escapes mdx directory: ${stem}`);
  }
  return fs.readFile(resolved.realPath, "utf8");
}

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
 * @param {string} [repoRoot]
 * @returns {Promise<MdxIndex>}
 */
export async function buildMdxCatalog(config, repoRoot) {
  /** @type {MdxIndex} */
  const index = {
    catalog: new Map(),
    contentByStem: new Map()
  };

  if (config.fixtureDir) {
    if (!repoRoot) {
      throw new Error("repoRoot is required when using fixtureDir");
    }
    const fixtureDir = String(config.fixtureDir);
    const dir = path.join(fixtureDir, "mdx");
    const files = await fs.readdir(dir);
    for (const file of files) {
      if (!SAFE_MDX_FILE.test(file)) {
        continue;
      }
      const stem = file.replace(/\.mdx$/, "");
      const content = await readFixtureMdx(fixtureDir, stem, repoRoot);
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
 * @param {string} [repoRoot]
 * @returns {Promise<{ content: string, stem: string, rawUrl: string }>}
 */
export async function loadMdx(config, id, index, repoRoot) {
  const stem = resolveMdxStem(index.catalog, id);
  const rawUrl = `${config.mdxBaseUrl}/${stem}.mdx`;

  const cached = index.contentByStem.get(stem);
  if (cached !== undefined) {
    return { content: cached, stem, rawUrl };
  }

  if (config.fixtureDir) {
    if (!repoRoot) {
      throw new Error("repoRoot is required when using fixtureDir");
    }
    const content = await readFixtureMdx(String(config.fixtureDir), stem, repoRoot);
    index.contentByStem.set(stem, content);
    return { content, stem, rawUrl };
  }

  assertTrustedDownloadUrl(rawUrl);
  const content = await fetchText(rawUrl);
  index.contentByStem.set(stem, content);
  return { content, stem, rawUrl };
}
