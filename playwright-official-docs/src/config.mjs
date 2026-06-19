/**
 * @file 設定読込。
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assertSafeRelPath, assertWithinRepoRoot } from "./paths.mjs";

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
 * @param {string} repoRoot
 */
export function validateConfig(config, repoRoot) {
  const required = ["sidebarUrl", "mdxBaseUrl", "docsBaseUrl", "outDir"];
  for (const key of required) {
    if (typeof config[key] !== "string" || config[key].length === 0) {
      throw new Error(`config.${key} must be a non-empty string`);
    }
  }
  if (!Array.isArray(config.baselineDocIds)) {
    throw new Error("config.baselineDocIds must be an array");
  }

  if (config.fixtureDir !== undefined && config.fixtureDir !== null) {
    if (
      typeof config.fixtureDir !== "string" ||
      config.fixtureDir.trim().length === 0
    ) {
      throw new Error("config.fixtureDir must be null, undefined, or a non-empty string");
    }
  }

  assertSafeRelPath(String(config.outDir), repoRoot);
  assertWithinRepoRoot(path.resolve(repoRoot, String(config.outDir)), repoRoot, "outDir");

  if (config.fixtureDir) {
    const fixtureRel = path.isAbsolute(String(config.fixtureDir))
      ? path.relative(repoRoot, path.resolve(String(config.fixtureDir)))
      : String(config.fixtureDir);
    if (path.isAbsolute(String(config.fixtureDir))) {
      assertWithinRepoRoot(
        path.resolve(String(config.fixtureDir)),
        repoRoot,
        "fixtureDir"
      );
    } else {
      assertSafeRelPath(fixtureRel, repoRoot);
      assertWithinRepoRoot(path.resolve(repoRoot, fixtureRel), repoRoot, "fixtureDir");
    }
  }
}

/**
 * fixtureDir をリポジトリ内の絶対パスへ正規化する。
 * @param {string | null} fixtureDir
 * @param {string} repoRoot
 * @returns {string | null}
 */
export function resolveFixtureDir(fixtureDir, repoRoot) {
  if (!fixtureDir) {
    return null;
  }
  return path.isAbsolute(fixtureDir)
    ? path.resolve(fixtureDir)
    : path.resolve(repoRoot, fixtureDir);
}
