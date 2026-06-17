/**
 * @file 設定読込。
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultConfigPath = path.join(__dirname, "..", "config.default.json");

/**
 * デフォルト設定を読み込む。
 * @returns {Promise<Record<string, unknown>>}
 */
export async function loadDefaultConfig() {
  const raw = await fs.readFile(defaultConfigPath, "utf8");
  return JSON.parse(raw);
}

/**
 * ユーザー設定をマージする。
 * @param {Record<string, unknown>} base
 * @param {Record<string, unknown>} override
 * @returns {Record<string, unknown>}
 */
export function mergeConfig(base, override) {
  return { ...base, ...override };
}

/**
 * 設定を検証する。
 * @param {Record<string, unknown>} config
 */
export function validateConfig(config) {
  const required = ["sidebarUrl", "mdxBaseUrl", "docsBaseUrl", "outDir"];
  for (const key of required) {
    if (typeof config[key] !== "string" || config[key].length === 0) {
      throw new Error(`config.${key} must be a non-empty string`);
    }
  }
  if (!Array.isArray(config.baselineDocIds)) {
    throw new Error("config.baselineDocIds must be an array");
  }
}
