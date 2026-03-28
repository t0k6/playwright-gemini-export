/**
 * @file `.gemini-export.json` の読み込み・検証・深いマージ。
 */

import fs from "node:fs/promises";
import path from "node:path";

import { defaultConfig } from "./default-config.mjs";
import { exists } from "./fs-utils.mjs";
import { assertSafeRelPath, uniqueNormalizedPaths } from "./paths.mjs";

/** 設定ファイル名（リポジトリルート直下）。 */
export const CONFIG_BASENAME = ".gemini-export.json";

import { deepMerge } from "../lib/gemini-export-pure.mjs";

/** `../lib/gemini-export-pure.mjs` からの再エクスポート（`loadConfig` とテストで共有）。 */
export { deepMerge };

/**
 * リポジトリルートの設定を読み、既定とマージする。
 * @param {string} repoRoot
 * @returns {Promise<{ config: typeof defaultConfig, warnings: string[] }>}
 */
export async function loadConfig(repoRoot) {
  const configPath = path.join(repoRoot, CONFIG_BASENAME);
  if (!(await exists(configPath))) return { config: defaultConfig, warnings: [] };
  const raw = await fs.readFile(configPath, "utf8");
  const userConfig = JSON.parse(raw);

  const warnings = [];
  for (const key of [
    "excludeFilePatterns",
    "excludePathPatterns",
    "redactTextPatterns",
    "excludeDirs",
    "includeExtensions",
    "includeFiles"
  ]) {
    if (
      Object.prototype.hasOwnProperty.call(userConfig, key) &&
      Array.isArray(userConfig[key]) &&
      userConfig[key].length === 0
    ) {
      warnings.push(
        `[NOTICE] ${key} を空配列にしてもデフォルトは維持されます（安全のため既定は concat マージします）。`
      );
    }
  }

  return { config: deepMerge(defaultConfig, userConfig), warnings };
}

/**
 * 実行に最低限必要な設定項目を検証する。
 * @param {typeof defaultConfig} config
 * @param {string} repoRoot
 */
export function validateConfig(config, repoRoot) {
  if (!config.outDir || typeof config.outDir !== "string") {
    throw new Error("outDir is required.");
  }
  if (!Array.isArray(config.sourcePaths) || config.sourcePaths.length === 0) {
    throw new Error(
      "sourcePaths must be a non-empty array. Create .gemini-export.json (e.g. copy .gemini-export.example.json) and set sourcePaths."
    );
  }
  for (const p of config.sourcePaths) {
    assertSafeRelPath(p, repoRoot);
  }
  if (Array.isArray(config.includeFiles)) {
    for (const p of config.includeFiles) {
      assertSafeRelPath(p, repoRoot);
    }
  }
}

/**
 * `sourcePaths` を正規化して一意化する。
 * @param {typeof defaultConfig} config
 * @returns {string[]}
 */
export function getEffectiveSourcePaths(config) {
  return uniqueNormalizedPaths(config.sourcePaths);
}
