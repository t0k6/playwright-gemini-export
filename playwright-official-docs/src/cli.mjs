/**
 * @file CLI。
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadDefaultConfig, mergeConfig, validateConfig } from "./config.mjs";
import { runExport } from "./export.mjs";

/**
 * ヘルプを表示する。
 */
export function printHelp() {
  console.log(`export-playwright-docs

Usage:
  node ./playwright-official-docs/bin/export-playwright-docs.mjs [--check] [--fixture-dir <path>]

Options:
  --check              dry-run (no file writes)
  --fixture-dir <path> use local fixtures instead of network fetch
  --help               show this help
`);
}

/**
 * CLI引数を解析する。
 * @param {string[]} argv
 * @returns {{ dryRun: boolean, fixtureDir: string | null }}
 */
export function parseArgs(argv) {
  const dryRun = argv.includes("--check");
  let fixtureDir = null;
  const fixtureIdx = argv.indexOf("--fixture-dir");
  if (fixtureIdx !== -1) {
    fixtureDir = argv[fixtureIdx + 1] ?? null;
    if (!fixtureDir) {
      throw new Error("--fixture-dir requires a path");
    }
  }
  return { dryRun, fixtureDir };
}

/**
 * CLIを実行する。
 * @returns {Promise<void>}
 */
export async function runCli() {
  const args = process.argv.slice(2);
  if (args.includes("-h") || args.includes("--help")) {
    printHelp();
    return;
  }

  const { dryRun, fixtureDir } = parseArgs(args);
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const config = mergeConfig(await loadDefaultConfig(), fixtureDir ? { fixtureDir } : {});
  validateConfig(config);

  const result = await runExport(config, { dryRun, repoRoot });

  if (dryRun) {
    console.log("Check completed.");
    console.log(`Pages: ${result.pageCount}`);
    console.log(`Bundles: ${result.bundleCount}`);
    console.log(`URL list unchanged: ${result.urlUnchanged ? "yes" : "no"}`);
    console.log("Output: (dry-run, no files written)");
    return;
  }

  console.log("Export completed.");
  console.log(`Output: ${path.resolve(repoRoot, String(config.outDir))}`);
  console.log(`Pages: ${result.pageCount}`);
  console.log(`Bundles: ${result.bundleCount}`);
  console.log(`URL list unchanged: ${result.urlUnchanged ? "yes" : "no"}`);
}
