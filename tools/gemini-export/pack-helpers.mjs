/**
 * @file Pack 共通: パック対象の判定・役割推定・パスキー生成。
 */

import path from "node:path";

/** manifest.copiedFiles から除外するファイル名（完全一致）。 */
export const PACK_SKIP_EXACT = new Set(["manifest.json", "README_FOR_AI.md"]);

const PACK_EXT = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".md",
  ".yml",
  ".yaml",
  ".txt",
  ".css",
  ".html"
]);

/**
 * Pack の対象外パスか。
 * @param {string} relPath リポジトリ相対（export 出力レイアウトと同じ）
 * @param {string} packOutSubDir 例: `_pack`
 * @returns {boolean} true なら pack 対象
 */
export function isPackableRelPath(relPath, packOutSubDir) {
  if (!relPath || typeof relPath !== "string") return false;
  const n = relPath.replace(/\\/g, "/");
  if (n.startsWith(`${packOutSubDir}/`) || n === packOutSubDir) return false;
  if (PACK_SKIP_EXACT.has(n)) return false;
  return true;
}

/**
 * @param {string} ext `path.extname` の結果（小文字推奨）
 */
export function isPackableExtension(ext) {
  return PACK_EXT.has(ext.toLowerCase());
}

/**
 * パスとファイル名から推定役割。
 * @param {string} relPath
 * @returns {"spec"|"page"|"helper"|"fixture"|"config"|"other"}
 */
export function inferRole(relPath) {
  const p = relPath.replace(/\\/g, "/");
  const base = path.basename(p).toLowerCase();

  if (/\.(spec|test)\.(tsx|ts|jsx|js|cjs|mjs)$/.test(base)) return "spec";
  if (p.includes("/pages/") || p.startsWith("pages/")) return "page";
  if (p.includes("/helpers/") || p.startsWith("helpers/")) return "helper";
  if (p.includes("/fixtures/") || p.startsWith("fixtures/")) return "fixture";
  if (base === "package.json" || /^tsconfig(\.|$)/i.test(base) || /playwright\.config\./i.test(base)) {
    return "config";
  }
  return "other";
}

/**
 * chunk ファイル名用にパスをフラット化（先頭の `chunks/` は付けない）。
 * @param {string} relPath
 */
export function escapePathForChunkBase(relPath) {
  const n = relPath.replace(/\\/g, "/");
  return n
    .split("/")
    .join("__")
    .replace(/[^a-zA-Z0-9_.-]+/g, "_");
}

/**
 * bundle 用ディレクトリキー（先頭 `bundleGroupDepth` セグメント、ディレクトリ部分のみ優先）。
 * @param {string} relPath
 * @param {number} depth
 */
export function dirKeyFromPath(relPath, depth) {
  const parts = relPath.replace(/\\/g, "/").split("/").filter(Boolean);
  if (parts.length === 0) return "root";
  const dirParts = parts.length > 1 ? parts.slice(0, -1) : [];
  const fileStem = parts[parts.length - 1].replace(/\.[^.]+$/, "") || "file";

  let keyParts;
  if (dirParts.length >= depth) {
    keyParts = dirParts.slice(0, depth);
  } else if (dirParts.length > 0) {
    keyParts = dirParts;
  } else {
    keyParts = [fileStem];
  }

  const slug = keyParts
    .join("-")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return slug.length > 0 ? slug : "root";
}

/**
 * @param {string} dirKey
 * @param {string} role
 */
export function bundleFileName(dirKey, role) {
  const dk = String(dirKey).replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  const r = String(role).replace(/[^a-zA-Z0-9_-]/g, "-");
  return `bundle-${dk || "root"}-${r}.md`;
}

/**
 * @param {string} ext
 */
export function languageTagFromExt(ext) {
  const e = ext.toLowerCase();
  if (e === ".ts" || e === ".tsx") return "ts";
  if (e === ".js" || e === ".jsx" || e === ".mjs" || e === ".cjs") return "js";
  if (e === ".json") return "json";
  if (e === ".md") return "markdown";
  if (e === ".yml" || e === ".yaml") return "yaml";
  if (e === ".css") return "css";
  if (e === ".html") return "html";
  return "text";
}

/**
 * copiedFiles から pack 対象の相対パス一覧を得る。
 * @param {string[]} copiedFiles
 * @param {string} packOutSubDir
 */
export function filterPackablePaths(copiedFiles, packOutSubDir) {
  const out = [];
  for (const rel of copiedFiles) {
    if (!isPackableRelPath(rel, packOutSubDir)) continue;
    const ext = path.extname(rel);
    if (!isPackableExtension(ext)) continue;
    out.push(rel.replace(/\\/g, "/"));
  }
  return out;
}
