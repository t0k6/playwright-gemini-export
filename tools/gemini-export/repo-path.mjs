/**
 * @file realpath 解決と「リポジトリ内に留まるか」の共通判定。
 * walk / copy / CLI で繰り返していた symlink とタグ付けを集約する。
 */

import fs from "node:fs/promises";

import { isWithinBaseDir } from "./paths.mjs";

/**
 * `fs.realpath` の結果を返す。失敗時は `ok: false`。
 * @param {string} absPath
 * @returns {Promise<{ ok: true, path: string } | { ok: false }>}
 */
export async function tryRealpath(absPath) {
  try {
    const resolved = await fs.realpath(absPath);
    return { ok: true, path: resolved };
  } catch {
    return { ok: false };
  }
}

/**
 * `lstat` → `realpath` → `repoRoot` 配下チェックまでを一括実行する。
 * @param {string} absPath
 * @param {string} repoRoot
 * @returns {Promise<
 *   | { ok: true, realPath: string }
 *   | { ok: false, skipTag: string, cannotStat?: boolean }
 * >}
 */
export async function resolveWithinRepo(absPath, repoRoot) {
  let lstat;
  try {
    lstat = await fs.lstat(absPath);
  } catch {
    return { ok: false, skipTag: "[realpath-failed]", cannotStat: true };
  }
  const isSymlink = lstat.isSymbolicLink();
  const topReal = await tryRealpath(absPath);
  if (!topReal.ok) {
    return {
      ok: false,
      skipTag: isSymlink ? "[symlink-outside-repo]" : "[realpath-failed]"
    };
  }
  if (!isWithinBaseDir(topReal.path, repoRoot)) {
    return {
      ok: false,
      skipTag: isSymlink ? "[symlink-outside-repo]" : "[path-outside-repo]"
    };
  }
  return { ok: true, realPath: topReal.path };
}
