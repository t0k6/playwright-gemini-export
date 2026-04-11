/**
 * @file CLI エントリ（引数解析・設定読込・パイプライン起動・サマリ出力）。
 */

import fs from "node:fs/promises";
import path from "node:path";

import { normalizeAnonymizeConfig } from "./anonymize.mjs";
import { getEffectiveSourcePaths, loadConfig, validateConfig } from "./config.mjs";
import { copyOneFile, walkAndCopy } from "./copy-pipeline.mjs";
import { cleanDir, exists } from "./fs-utils.mjs";
import {
  assertWithinRepoRoot,
  assertSafeRelPath,
  matchesAny,
  normalizeExt
} from "./paths.mjs";
import { buildRedactRules } from "../lib/gemini-export-pure.mjs";
import { runPack } from "./pack.mjs";
import { buildAiReadme } from "./readme.mjs";
import { resolveWithinRepo } from "./repo-path.mjs";

/**
 * ヘルプを標準出力に表示する。
 */
export function printHelp() {
  console.log(`playwright-gemini-export

Usage:
  node ./tools/export-gemini-playwright-context.mjs [--check] [--pack]

Options:
  --check   dry-run (no outDir creation, no file writes)
  --pack    after export, write index/chunk/bundle under outDir/_pack (see docs/gemini-workflow.md)
  --help    show this help
`);
}

/**
 * dry-run かどうかに応じた完了メッセージ。
 * @param {boolean} dryRun
 * @returns {string}
 */
export function checkTitle(dryRun) {
  return dryRun ? "Check completed." : "Export completed.";
}

/**
 * 実行結果の要約を標準出力に表示する。
 * @param {{ outDir: string }} config
 * @param {{ dryRun: boolean, warnings: string[] }} manifest
 * @param {{ copiedCount: number, skippedCount: number, redactedCount: number, anonymizedCount: number, warningsCount: number }} stats
 */
export function printSummary(config, manifest, stats) {
  console.log(checkTitle(manifest.dryRun));
  if (!manifest.dryRun) {
    console.log(`Output: ${config.outDir}`);
  } else {
    console.log(`Output: (dry-run, no files written)`);
  }
  console.log(`Copied: ${stats.copiedCount}`);
  console.log(`Redacted: ${stats.redactedCount}`);
  console.log(`Anonymized: ${stats.anonymizedCount}`);
  console.log(`Skipped: ${stats.skippedCount}`);
  console.log(`Warnings: ${stats.warningsCount}`);

  if (manifest.warnings.length > 0) {
    console.log("\nWarnings:");
    for (const w of manifest.warnings) {
      console.log(`- ${w}`);
    }
  }
}

/**
 * `process.cwd()` をリポジトリルートとして export を実行する。
 * @returns {Promise<void>}
 */
export async function runCli() {
  const repoRoot = process.cwd();
  const args = process.argv.slice(2);
  const checkOnly = args.includes("--check");
  const doPack = args.includes("--pack");
  if (args.includes("-h") || args.includes("--help")) {
    printHelp();
    return;
  }

  const { config, warnings: configWarnings } = await loadConfig(repoRoot);
  validateConfig(config, repoRoot);

  const manifest = {
    generatedAt: new Date().toISOString(),
    repoRoot,
    outDir: config.outDir,
    sourcePaths: [],
    dryRun: checkOnly,
    copiedFiles: [],
    skippedFiles: [],
    redactedFiles: [],
    anonymizedFiles: [],
    warnings: []
  };

  const staticNotices = [
    "[NOTICE] secrets は完全には検出できません。必ず `manifest.json` を人間が確認してください。",
    "[NOTICE] 設定の配列（例: `redactTextPatterns` / `excludeFilePatterns`）はデフォルトと結合されます。空配列でも既定が無効化されません。"
  ];
  const initialWarnings = [...configWarnings, ...staticNotices];
  manifest.warnings.push(...initialWarnings);
  for (const w of initialWarnings) console.warn(w);

  const includeExtSet = new Set(config.includeExtensions.map(normalizeExt));
  const excludeDirSet = new Set(config.excludeDirs);
  const excludeFileRegexes = config.excludeFilePatterns.map((p) => new RegExp(p, "i"));
  const excludePathRegexes = config.excludePathPatterns.map((p) => new RegExp(p, "i"));
  const redactRules = buildRedactRules(config.redactTextPatterns);

  const effectiveSourcePaths = getEffectiveSourcePaths(config);
  manifest.sourcePaths = effectiveSourcePaths;

  const anonymizeConfig = normalizeAnonymizeConfig(config.anonymize);

  assertSafeRelPath(config.outDir, repoRoot);
  const outDirAbs = path.join(repoRoot, config.outDir);
  assertWithinRepoRoot(outDirAbs, repoRoot, "outDir", { disallowRepoRoot: true });
  if (!checkOnly) {
    await cleanDir(outDirAbs);
    await fs.mkdir(outDirAbs, { recursive: true });
  }

  const ctx = {
    repoRoot,
    outDirAbs,
    includeExtSet,
    excludeDirSet,
    excludeFileRegexes,
    excludePathRegexes,
    redactRules,
    maxFileSizeBytes: config.maxFileSizeBytes,
    manifest,
    checkOnly,
    anonymizeConfig
  };

  for (const relPath of effectiveSourcePaths) {
    if (matchesAny(relPath, excludePathRegexes)) {
      manifest.warnings.push(`sourcePath is excluded by pattern (config mistake?): ${relPath}`);
      manifest.skippedFiles.push(`${relPath} [excluded sourcePath]`);
      continue;
    }

    const absPath = path.join(repoRoot, relPath);
    if (!(await exists(absPath))) {
      manifest.warnings.push(`source path not found: ${relPath}`);
      continue;
    }

    const res = await resolveWithinRepo(absPath, repoRoot);
    if (!res.ok) {
      if (res.cannotStat) {
        manifest.warnings.push(`[realpath-failed] cannot resolve sourcePath: ${relPath}`);
      } else {
        const outside = res.skipTag === "[path-outside-repo]" || res.skipTag === "[symlink-outside-repo]";
        manifest.warnings.push(
          outside
            ? `${res.skipTag} sourcePath resolves outside repo: ${relPath}`
            : `${res.skipTag} cannot resolve sourcePath: ${relPath}`
        );
      }
      manifest.skippedFiles.push(`${relPath} ${res.skipTag}`);
      continue;
    }

    const st = await fs.stat(absPath);
    if (st.isDirectory()) {
      await walkAndCopy(ctx, absPath);
      continue;
    }

    if (st.isFile()) {
      await copyOneFile(ctx, { srcAbs: absPath, relSourcePath: relPath });
      continue;
    }

    manifest.skippedFiles.push(`${relPath} [not file or directory]`);
  }

  for (const relPath of config.includeFiles) {
    const absPath = path.join(repoRoot, relPath);
    if (!(await exists(absPath))) continue;

    const incRes = await resolveWithinRepo(absPath, repoRoot);
    if (!incRes.ok) {
      if (incRes.cannotStat) {
        manifest.warnings.push(`[realpath-failed] cannot resolve includeFiles path: ${relPath}`);
      } else {
        const outside =
          incRes.skipTag === "[path-outside-repo]" || incRes.skipTag === "[symlink-outside-repo]";
        manifest.warnings.push(
          outside
            ? `${incRes.skipTag} includeFiles path resolves outside repo: ${relPath}`
            : `${incRes.skipTag} cannot resolve includeFiles path: ${relPath}`
        );
      }
      manifest.skippedFiles.push(`${relPath} ${incRes.skipTag}`);
      continue;
    }

    await copyOneFile(ctx, {
      srcAbs: absPath,
      relSourcePath: relPath,
      isExplicitIncludeFile: true
    });
  }

  if (config.generateAiReadme && !checkOnly) {
    const readmePath = path.join(outDirAbs, "README_FOR_AI.md");
    await fs.writeFile(readmePath, buildAiReadme(manifest), "utf8");
    manifest.copiedFiles.push("README_FOR_AI.md");
  }

  if (doPack) {
    await runPack({ repoRoot, outDirAbs, manifest, config, checkOnly });
  }

  const stats = {
    copiedCount: manifest.copiedFiles.length,
    skippedCount: manifest.skippedFiles.length,
    redactedCount: manifest.redactedFiles.length,
    anonymizedCount: manifest.anonymizedFiles.length,
    warningsCount: manifest.warnings.length
  };

  if (!checkOnly) {
    const manifestPath = path.join(outDirAbs, "manifest.json");
    await fs.writeFile(manifestPath, JSON.stringify({ ...manifest, stats }, null, 2), "utf8");
  }

  printSummary(config, manifest, stats);

  if (config.failOnWarnings && manifest.warnings.length > 0) {
    process.exitCode = 2;
  }
}
