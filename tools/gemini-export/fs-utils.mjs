/**
 * @file 非同期ファイルシステムの軽量ヘルパ。
 */

import fs from "node:fs/promises";

/**
 * パスが存在するか（アクセス可能か）。
 * @param {string} absPath
 * @returns {Promise<boolean>}
 */
export async function exists(absPath) {
  try {
    await fs.access(absPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * ディレクトリを再帰削除する（存在しなくてもよい）。
 * @param {string} dir
 * @returns {Promise<void>}
 */
export async function cleanDir(dir) {
  await fs.rm(dir, { recursive: true, force: true });
}
