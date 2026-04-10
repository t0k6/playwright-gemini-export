/**
 * @file 出力先に生成する `README_FOR_AI.md` の本文ビルダ。
 */

/**
 * マニフェストの集計情報を人間／AI 向けに要約した Markdown。
 * @param {{
 *   sourcePaths: string[],
 *   copiedFiles: string[],
 *   redactedFiles: unknown[],
 *   anonymizedFiles: unknown[],
 *   skippedFiles: string[],
 *   warnings: string[]
 * }} manifest
 * @returns {string}
 */
export function buildAiReadme(manifest) {
  const indexFiles = Array.isArray(manifest.indexFiles) ? manifest.indexFiles : [];
  const chunkCount = typeof manifest.chunkCount === "number" ? manifest.chunkCount : 0;
  return `# README_FOR_AI

## Purpose
This export is a sanitized subset of a Playwright E2E test codebase for AI-assisted work.

## Included scope
${manifest.sourcePaths.map((p) => `- \`${p}\``).join("\n")}

## Index and chunks
- indexFiles: ${indexFiles.length > 0 ? indexFiles.map((p) => `\`${p}\``).join(", ") : "(not generated)"}
- chunkCount: ${chunkCount}

## Important constraints
- Some files and directories are intentionally excluded
- Sensitive-looking values may be redacted as \`***REDACTED***\`
- Missing files should not be assumed absent from the original repository
- Prefer minimal, convention-preserving changes

## Recommended AI behavior
- infer coding conventions from existing tests and helpers
- reuse fixtures, helpers, and page objects where possible
- avoid brittle locators and arbitrary waits
- state uncertainty when necessary files appear to be omitted

## Export summary
- copiedFiles: ${manifest.copiedFiles.length}
- redactedFiles: ${manifest.redactedFiles.length}
- anonymizedFiles: ${manifest.anonymizedFiles.length}
- skippedFiles: ${manifest.skippedFiles.length}
- warnings: ${manifest.warnings.length}
`;
}
