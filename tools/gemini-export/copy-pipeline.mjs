/**
 * @file ソースツリーの走査と単一ファイルのフィルタ・リダクト・匿名化・書き込み。
 */

import fs from "node:fs/promises";
import path from "node:path";

import { applyRedactions } from "../lib/gemini-export-pure.mjs";
import { redactByAst } from "./ast-redact.mjs";
import { anonymizeStructuredText, shouldAnonymize } from "./anonymize.mjs";
import {
  isWithinBaseDir,
  matchesAny,
  normalizeExt,
  normalizeRelPath,
  relFromRepo,
  relPathHasParentSegment
} from "./paths.mjs";
import { resolveWithinRepo } from "./repo-path.mjs";
import { looksLikeText, looksSensitiveByHeuristic, sha256 } from "./text-utils.mjs";

/**
 * @typedef {object} RedactRule
 * @property {string} name
 * @property {RegExp} regex
 * @property {string} replacement
 */

/**
 * 1 回の export 実行で walk / copy が共有するコンテキスト（`cli.mjs` で組み立てる）。
 * @typedef {object} ExportRunContext
 * @property {string} repoRoot
 * @property {string} outDirAbs
 * @property {Set<string>} includeExtSet
 * @property {Set<string>} excludeDirSet
 * @property {RegExp[]} excludeFileRegexes
 * @property {RegExp[]} excludePathRegexes
 * @property {RedactRule[]} redactRules
 * @property {number} maxFileSizeBytes
 * @property {{
 *   generatedAt: string,
 *   repoRoot: string,
 *   outDir: string,
 *   sourcePaths: string[],
 *   dryRun: boolean,
 *   copiedFiles: string[],
 *   skippedFiles: string[],
 *   redactedFiles: { file: string, beforeSha256: string, afterSha256: string }[],
 *   anonymizedFiles: { file: string, fieldsChanged: string[], beforeSha256: string, afterSha256: string }[],
 *   warnings: string[]
 * }} manifest
 * @property {Set<string>} copiedFilesSet `manifest.copiedFiles` と同期した重複検査用
 * @property {boolean} checkOnly
 * @property {object} anonymizeConfig `normalizeAnonymizeConfig()` の戻り値（enabled と Set フィールドを含む）
 */

/**
 * ディレクトリを再帰走査し、条件を満たすファイルを `copyOneFile` に渡す。
 * @param {ExportRunContext} ctx
 * @param {string} currentAbs
 * @returns {Promise<void>}
 */
export async function walkAndCopy(ctx, currentAbs) {
  const { manifest, excludeDirSet, excludePathRegexes, repoRoot } = ctx;
  const entries = await fs.readdir(currentAbs, { withFileTypes: true });

  for (const entry of entries) {
    const abs = path.join(currentAbs, entry.name);
    const res = await resolveWithinRepo(abs, repoRoot);
    if (!res.ok) {
      const relFromRepoPath = relFromRepo(abs, repoRoot);
      if (res.cannotStat) {
        manifest.warnings.push(`[realpath-failed] cannot stat path: ${relFromRepoPath}`);
        manifest.skippedFiles.push(`${relFromRepoPath} [realpath-failed]`);
        continue;
      }
      const tag = res.skipTag;
      const outside = tag === "[path-outside-repo]" || tag === "[symlink-outside-repo]";
      manifest.warnings.push(
        outside
          ? `${tag} resolves outside repo: ${relFromRepoPath}`
          : `${tag} cannot resolve path: ${relFromRepoPath}`
      );
      manifest.skippedFiles.push(`${relFromRepoPath} ${tag}`);
      continue;
    }

    const relFromRepoPath = relFromRepo(abs, repoRoot);
    if (relPathHasParentSegment(relFromRepoPath)) {
      manifest.warnings.push(`[unsafe-relative-path] path has parent segments: ${relFromRepoPath}`);
      manifest.skippedFiles.push(`${relFromRepoPath} [unsafe-relative-path]`);
      continue;
    }

    let stTarget;
    try {
      stTarget = await fs.stat(res.realPath);
    } catch {
      manifest.warnings.push(`[realpath-failed] cannot stat resolved path: ${relFromRepoPath}`);
      manifest.skippedFiles.push(`${relFromRepoPath} [realpath-failed]`);
      continue;
    }

    if (stTarget.isDirectory()) {
      if (excludeDirSet.has(entry.name)) {
        manifest.skippedFiles.push(`${relFromRepoPath}/ [excluded dir]`);
        continue;
      }
      if (matchesAny(relFromRepoPath, excludePathRegexes)) {
        manifest.skippedFiles.push(`${relFromRepoPath}/ [excluded path pattern]`);
        continue;
      }
      await walkAndCopy(ctx, abs);
      continue;
    }

    if (stTarget.isFile()) {
      await copyOneFile(ctx, { srcAbs: abs, relSourcePath: relFromRepoPath });
      continue;
    }

    manifest.skippedFiles.push(`${relFromRepoPath} [not regular file]`);
  }
}

/**
 * 1 ファイルを読み、フィルタ・リダクト・匿名化のうえ出力する。
 * @param {ExportRunContext} ctx
 * @param {{ srcAbs: string, relSourcePath: string, isExplicitIncludeFile?: boolean }} opts
 * @returns {Promise<void>}
 */
export async function copyOneFile(ctx, { srcAbs, relSourcePath, isExplicitIncludeFile = false }) {
  const {
    outDirAbs,
    includeExtSet,
    excludeFileRegexes,
    excludePathRegexes,
    redactRules,
    maxFileSizeBytes,
    manifest,
    copiedFilesSet,
    checkOnly,
    anonymizeConfig,
    repoRoot
  } = ctx;

  const normalizedRel = normalizeRelPath(relSourcePath);
  const basename = path.basename(normalizedRel);
  const ext = normalizeExt(path.extname(normalizedRel));

  if (copiedFilesSet.has(normalizedRel)) {
    return;
  }

  if (relPathHasParentSegment(normalizedRel)) {
    manifest.warnings.push(`[unsafe-relative-path] export path has parent segments: ${normalizedRel}`);
    manifest.skippedFiles.push(`${normalizedRel} [unsafe-relative-path]`);
    return;
  }

  const destAbsPreview = path.join(outDirAbs, normalizedRel);
  if (!isWithinBaseDir(destAbsPreview, outDirAbs)) {
    manifest.warnings.push(`[dest-outside-outDir] refused export path: ${normalizedRel}`);
    manifest.skippedFiles.push(`${normalizedRel} [dest-outside-outDir]`);
    return;
  }

  if (matchesAny(normalizedRel, excludePathRegexes)) {
    manifest.skippedFiles.push(`${normalizedRel} [excluded path pattern]`);
    return;
  }

  if (matchesAny(basename, excludeFileRegexes) || matchesAny(normalizedRel, excludeFileRegexes)) {
    manifest.skippedFiles.push(`${normalizedRel} [excluded file pattern]`);
    return;
  }

  if (!isExplicitIncludeFile && !includeExtSet.has(ext)) {
    manifest.skippedFiles.push(`${normalizedRel} [extension not included]`);
    return;
  }

  const res = await resolveWithinRepo(srcAbs, repoRoot);
  if (!res.ok) {
    if (res.cannotStat) {
      manifest.warnings.push(`[realpath-failed] cannot stat source: ${normalizedRel}`);
    } else {
      const outside = res.skipTag === "[path-outside-repo]" || res.skipTag === "[symlink-outside-repo]";
      manifest.warnings.push(
        outside
          ? `${res.skipTag} source resolves outside repo: ${normalizedRel}`
          : `${res.skipTag} cannot resolve source: ${normalizedRel}`
      );
    }
    manifest.skippedFiles.push(`${normalizedRel} ${res.skipTag}`);
    return;
  }

  const stat = await fs.stat(srcAbs);
  if (stat.size > maxFileSizeBytes) {
    manifest.skippedFiles.push(`${normalizedRel} [too large: ${stat.size} bytes]`);
    return;
  }

  const raw = await fs.readFile(srcAbs);

  if (!looksLikeText(raw)) {
    manifest.skippedFiles.push(`${normalizedRel} [binary or non-text]`);
    return;
  }

  let text = raw.toString("utf8");

  if (looksSensitiveByHeuristic(normalizedRel, text)) {
    manifest.warnings.push(`possible sensitive content: ${normalizedRel}`);
  }

  const originalHash = sha256(text);
  let redacted = false;
  if (includeExtSet.has(ext) && [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"].includes(ext)) {
    const ast = redactByAst(text, { filePath: normalizedRel });
    if (ast.parseFailed) {
      manifest.warnings.push(`[ast-redact-parse-failed] fell back to regex redaction: ${normalizedRel}`);
    } else if (ast.redacted) {
      redacted = true;
      text = ast.text;
    }
  }

  const { text: textAfterRegexRedact, redacted: regexRedacted } = applyRedactions(text, redactRules);
  text = textAfterRegexRedact;
  redacted = redacted || regexRedacted;
  const afterRedactHash = sha256(text);

  let anonymized = false;
  let anonymizedFields = [];
  if (shouldAnonymize(normalizedRel, ext, anonymizeConfig) && anonymizeConfig.enabled) {
    const beforeHash = afterRedactHash;
    const result = anonymizeStructuredText(normalizedRel, ext, text, anonymizeConfig, manifest);
    if (result.didChange) {
      anonymized = true;
      anonymizedFields = result.fieldsChanged;
      text = result.text;
    }
    if (anonymized) {
      manifest.anonymizedFiles.push({
        file: normalizedRel,
        fieldsChanged: anonymizedFields,
        beforeSha256: beforeHash,
        afterSha256: sha256(text)
      });
    }
  }

  if (!checkOnly) {
    const destAbs = path.join(outDirAbs, normalizedRel);
    if (!isWithinBaseDir(destAbs, outDirAbs)) {
      manifest.warnings.push(`[dest-outside-outDir] refused write at copy time: ${normalizedRel}`);
      manifest.skippedFiles.push(`${normalizedRel} [dest-outside-outDir]`);
      return;
    }
    await fs.mkdir(path.dirname(destAbs), { recursive: true });
    await fs.writeFile(destAbs, text, "utf8");
  }

  manifest.copiedFiles.push(normalizedRel);
  copiedFilesSet.add(normalizedRel);

  if (redacted) {
    manifest.redactedFiles.push({
      file: normalizedRel,
      beforeSha256: originalHash,
      afterSha256: afterRedactHash
    });
  }
}
