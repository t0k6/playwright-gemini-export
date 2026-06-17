/**
 * @file ファイルシステムヘルパ。
 */

import fs from "node:fs/promises";
import path from "node:path";

/**
 * パスが存在するか。
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
 * ディレクトリを再帰削除する。
 * @param {string} dir
 * @returns {Promise<void>}
 */
export async function cleanDir(dir) {
  await fs.rm(dir, { recursive: true, force: true });
}

/**
 * ディレクトリを作成する。
 * @param {string} dir
 * @returns {Promise<void>}
 */
export async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

/**
 * 一時ディレクトリへ書き込み後、出力先へ原子的に置換する。
 * rename 失敗時は既存 outDir をバックアップから復元する。
 * @param {string} outDir
 * @param {(tmpDir: string) => Promise<void>} writer
 * @returns {Promise<void>}
 */
export async function writeAtomically(outDir, writer) {
  const parent = path.dirname(outDir);
  await ensureDir(parent);
  const tmpDir = `${outDir}.tmp-${process.pid}`;
  const backupDir = `${outDir}.bak-${process.pid}`;
  await cleanDir(tmpDir);
  await ensureDir(tmpDir);

  let movedOutToBackup = false;

  try {
    await writer(tmpDir);

    if (await exists(outDir)) {
      await cleanDir(backupDir);
      await fs.rename(outDir, backupDir);
      movedOutToBackup = true;
    }

    await fs.rename(tmpDir, outDir);
    movedOutToBackup = false;
    await cleanDir(backupDir);
  } catch (err) {
    if (movedOutToBackup && !(await exists(outDir)) && (await exists(backupDir))) {
      await fs.rename(backupDir, outDir);
    }
    await cleanDir(tmpDir);
    await cleanDir(backupDir);
    throw err;
  }
}
