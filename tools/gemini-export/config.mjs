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

/**
 * オブジェクトは再帰マージ、配列は重複除去付き concat（空配列でも既定を消さない）。
 * @param {unknown} base
 * @param {unknown} override
 * @returns {unknown}
 */
export function deepMerge(base, override) {
  if (Array.isArray(base) && Array.isArray(override)) {
    const seen = new Set();
    const out = [];
    for (const item of [...base, ...override]) {
      const key = typeof item === "string" ? `s:${item}` : `j:${JSON.stringify(item)}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push(item);
      }
    }
    return out;
  }
  if (Array.isArray(base) || Array.isArray(override)) return override ?? base;
  if (typeof base !== "object" || base === null) return override ?? base;
  if (typeof override !== "object" || override === null) return override ?? base;

  const out = { ...base };
  for (const key of Object.keys(override)) {
    out[key] = key in base ? deepMerge(base[key], override[key]) : override[key];
  }
  return out;
}

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
