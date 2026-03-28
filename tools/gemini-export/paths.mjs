/**
 * @file リポジトリ相対パスの正規化・検証、パス包含判定、パターン一致。
 * `repoRoot` は常に引数で受け取り、グローバル cwd に依存しない API とする。
 */

import path from "node:path";

/**
 * 絶対パスが base の配下（base 自身を含む）かどうか。
 * @param {string} absPath
 * @param {string} baseAbs
 * @returns {boolean}
 */
export function isWithinBaseDir(absPath, baseAbs) {
  const abs = path.resolve(absPath);
  const base = path.resolve(baseAbs);
  const rel = path.relative(base, abs);
  return !rel.startsWith("..") && !path.isAbsolute(rel);
}

/**
 * outDir 等が repoRoot 配下に留まることを検証する。`disallowRepoRoot` でルート直下出力を拒否できる。
 * @param {string} absPath
 * @param {string} repoRoot
 * @param {string} label エラーメッセージ用ラベル
 * @param {{ disallowRepoRoot?: boolean }} [options]
 */
export function assertWithinRepoRoot(absPath, repoRoot, label, { disallowRepoRoot = false } = {}) {
  const abs = path.resolve(absPath);
  const rootAbs = path.resolve(repoRoot);

  const rel = path.relative(rootAbs, abs);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`[SECURITY] ${label} escapes repoRoot: ${abs}`);
  }

  if (disallowRepoRoot) {
    const isRepoRoot = rel === "" || rel === ".";
    if (isRepoRoot) {
      throw new Error(`[SECURITY] ${label} must not be repoRoot: ${abs}`);
    }
  }
}

/**
 * マニフェスト用に正規化した repo 相対パス（`..` セグメントは別チェック）。
 * @param {string} absPath
 * @param {string} repoRoot
 * @returns {string}
 */
export function relFromRepo(absPath, repoRoot) {
  return normalizeRelPath(path.relative(repoRoot, absPath));
}

/**
 * 正規化済み相対パスに `..` セグメントが含まれるか（パストラバーサル抑止）。
 * @param {string} normalizedRel
 * @returns {boolean}
 */
export function relPathHasParentSegment(normalizedRel) {
  return normalizedRel.split("/").some((seg) => seg === "..");
}

/**
 * 区切りを `/` に統一し、先頭 `./` と末尾 `/` を除去する。
 * @param {string} p
 * @returns {string}
 */
export function normalizeRelPath(p) {
  return p.split(path.sep).join("/").replace(/^\.\/+/, "").replace(/\/+$/, "");
}

/**
 * 拡張子を小文字化する。
 * @param {string} ext
 * @returns {string}
 */
export function normalizeExt(ext) {
  return ext.toLowerCase();
}

/**
 * パス配列を正規化し重複を除く。
 * @param {string[]} paths
 * @returns {string[]}
 */
export function uniqueNormalizedPaths(paths) {
  return [...new Set(paths.map(normalizeRelPath))];
}

/**
 * 設定上の相対パスが repo 外へ解決しないことを検証する。
 * @param {string} p
 * @param {string} repoRoot
 */
export function assertSafeRelPath(p, repoRoot) {
  if (typeof p !== "string" || p.length === 0) {
    throw new Error("sourcePaths entries must be non-empty strings.");
  }
  if (path.isAbsolute(p)) {
    throw new Error(`absolute paths are not allowed in sourcePaths: ${p}`);
  }

  const normalized = normalizeRelPath(p);
  if (normalized.includes("..")) {
    throw new Error(`'..' is not allowed in sourcePaths: ${p}`);
  }

  const resolved = path.resolve(repoRoot, normalized);
  const rootResolved = path.resolve(repoRoot);
  const rel = path.relative(rootResolved, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`sourcePath escapes repo root: ${p}`);
  }
}

/**
 * いずれかの正規表現に一致するか。
 * @param {string} value
 * @param {RegExp[]} regexes
 * @returns {boolean}
 */
export function matchesAny(value, regexes) {
  return regexes.some((r) => r.test(value));
}
