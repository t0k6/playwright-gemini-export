/**
 * @file Export後の outDir から index / chunk を生成する後段フェーズ。
 */

import fs from "node:fs/promises";
import path from "node:path";

import { isWithinBaseDir, normalizeExt, normalizeRelPath } from "./paths.mjs";
import { chunkIdBaseFromRelPath, guessFileKind, splitTextByMaxBytes } from "../lib/gemini-export-pure.mjs";

/** `PROJECT_INDEX.md` 内の行数上限（ヘッダー＋ファイル行の合計がこの未満ならファイル行を追加）。 */
export const PROJECT_INDEX_MAX_LINES = 120;

function languageFromExt(ext) {
  switch (ext) {
    case ".ts":
    case ".tsx":
      return "ts";
    case ".js":
    case ".jsx":
    case ".mjs":
    case ".cjs":
      return "js";
    case ".json":
      return "json";
    case ".yaml":
    case ".yml":
      return "yaml";
    case ".md":
      return "md";
    case ".html":
      return "html";
    case ".css":
      return "css";
    default:
      return "";
  }
}

/**
 * `--check` 用: 読み取りルート上のファイルから index 行数・chunk 数を概算する。
 * @param {{
 *   readRootAbs: string,
 *   manifest: { copiedFiles?: string[] },
 *   indexChunkConfig: { maxChunkBytes: number, chunkExtensions?: string[] }
 * }} opts
 * @returns {Promise<{ pathRowCount: number, chunkEstimate: number }>}
 */
export async function estimateIndexChunkSummary(opts) {
  const { readRootAbs, manifest, indexChunkConfig } = opts;
  const copiedFiles = Array.isArray(manifest.copiedFiles) ? manifest.copiedFiles : [];

  const allowedExts = new Set(
    (indexChunkConfig.chunkExtensions ?? []).map((e) => normalizeExt(String(e)))
  );

  let pathRowCount = 0;
  let chunkEstimate = 0;

  for (const rel of copiedFiles) {
    const relNorm = normalizeRelPath(rel);
    const ext = normalizeExt(path.extname(relNorm));
    const abs = path.join(readRootAbs, relNorm);
    if (!isWithinBaseDir(abs, readRootAbs)) continue;

    let stat;
    try {
      stat = await fs.stat(abs);
    } catch {
      continue;
    }
    if (!stat.isFile()) continue;

    pathRowCount++;

    if (allowedExts.size > 0 && !allowedExts.has(ext)) continue;

    let text;
    try {
      text = await fs.readFile(abs, "utf8");
    } catch {
      continue;
    }

    const chunks = splitTextByMaxBytes(text, { maxChunkBytes: indexChunkConfig.maxChunkBytes });
    chunkEstimate += chunks.length;
  }

  return { pathRowCount, chunkEstimate };
}

/**
 * @param {{
 *   copiedFiles: string[],
 *   warnings: string[],
 *   indexFiles?: string[],
 *   chunkFiles?: string[],
 *   chunkCount?: number,
 * }} manifest export の `manifest` を直接更新する
 * @param {string} outDirAbs 出力ディレクトリの絶対パス
 * @param {{
 *   projectIndexFile: string,
 *   pathIndexFile: string,
 *   chunksDir: string,
 *   maxChunkBytes: number,
 *   chunkExtensions?: string[]
 * }} indexChunkConfig
 * @returns {Promise<void>}
 */
export async function generateIndexAndChunks(manifest, outDirAbs, indexChunkConfig) {
  const copiedFiles = Array.isArray(manifest.copiedFiles) ? manifest.copiedFiles : [];

  const projectIndexRel = normalizeRelPath(indexChunkConfig.projectIndexFile);
  const pathIndexRel = normalizeRelPath(indexChunkConfig.pathIndexFile);
  const chunksDirRel = normalizeRelPath(indexChunkConfig.chunksDir);

  const projectIndexAbs = path.join(outDirAbs, projectIndexRel);
  const pathIndexAbs = path.join(outDirAbs, pathIndexRel);
  const chunksDirAbs = path.join(outDirAbs, chunksDirRel);

  for (const [label, abs] of [
    ["projectIndexFile", projectIndexAbs],
    ["pathIndexFile", pathIndexAbs],
    ["chunksDir", chunksDirAbs]
  ]) {
    if (!isWithinBaseDir(abs, outDirAbs)) {
      throw new Error(`[SECURITY] indexChunk.${label} escapes outDir: ${abs}`);
    }
  }

  const allowedExts = new Set(
    (indexChunkConfig.chunkExtensions ?? []).map((e) => normalizeExt(String(e)))
  );

  const indexLines = [];
  const projectIndexLines = [];
  const chunkFiles = [];

  projectIndexLines.push("# PROJECT_INDEX");
  projectIndexLines.push("");
  projectIndexLines.push("この出力には、Playwright E2E テストコードのサニタイズ済みサブセットが含まれます。");
  projectIndexLines.push("");
  projectIndexLines.push("## 生成物");
  projectIndexLines.push(`- \`${projectIndexRel}\`: このファイル（入口）`);
  projectIndexLines.push(`- \`${pathIndexRel}\`: パス索引（JSONL）`);
  projectIndexLines.push(`- \`${chunksDirRel}/\`: 精読用チャンク`);
  projectIndexLines.push("");
  projectIndexLines.push("## 使い方（推奨）");
  projectIndexLines.push("- Gemini にはまずこのファイルと、必要な `chunks/*` だけを渡します。");
  projectIndexLines.push("- NotebookLM には `PATH_INDEX.jsonl` を入れて検索起点にします。");
  projectIndexLines.push("");
  projectIndexLines.push("## ファイル一覧（抜粋）");

  await fs.mkdir(chunksDirAbs, { recursive: true });

  let totalChunks = 0;
  /** @type {number} `PATH_INDEX.jsonl` に載る通常ファイル数 */
  let pathIndexFileCount = 0;
  /** @type {number} `PROJECT_INDEX.md` に箇条書きしたファイル数 */
  let projectIndexFileListed = 0;

  for (const rel of copiedFiles) {
    const relNorm = normalizeRelPath(rel);
    const ext = normalizeExt(path.extname(relNorm));
    const abs = path.join(outDirAbs, relNorm);
    if (!isWithinBaseDir(abs, outDirAbs)) continue;

    let stat;
    try {
      stat = await fs.stat(abs);
    } catch {
      manifest.warnings.push(`[index-chunk] cannot stat: ${relNorm}`);
      continue;
    }
    if (!stat.isFile()) continue;

    pathIndexFileCount++;

    const kind = guessFileKind(relNorm);
    const row = {
      path: relNorm,
      kind,
      ext,
      sizeBytes: stat.size,
      summary: ""
    };
    indexLines.push(JSON.stringify(row));

    if (projectIndexLines.length < PROJECT_INDEX_MAX_LINES) {
      projectIndexLines.push(`- \`${relNorm}\` (${kind})`);
      projectIndexFileListed++;
    }

    if (allowedExts.size > 0 && !allowedExts.has(ext)) continue;

    let text;
    try {
      text = await fs.readFile(abs, "utf8");
    } catch {
      manifest.warnings.push(`[index-chunk] cannot read as text: ${relNorm}`);
      continue;
    }

    const chunks = splitTextByMaxBytes(text, { maxChunkBytes: indexChunkConfig.maxChunkBytes });
    const idBase = chunkIdBaseFromRelPath(relNorm);
    const lang = languageFromExt(ext);

    for (const c of chunks) {
      const chunkId = `${idBase}__${String(c.index).padStart(3, "0")}`;
      const chunkRel = normalizeRelPath(path.join(chunksDirRel, `${chunkId}.md`));
      const chunkAbs = path.join(outDirAbs, chunkRel);
      if (!isWithinBaseDir(chunkAbs, outDirAbs)) {
        manifest.warnings.push(`[index-chunk] refused chunk path: ${chunkRel}`);
        continue;
      }

      const header = [
        "---",
        `original_path: ${relNorm}`,
        `chunk_id: ${chunkId}`,
        `kind: ${kind}`,
        "---",
        ""
      ].join("\n");

      const fence = lang ? `\`\`\`${lang}` : "```";
      const body = [header, fence, c.text.replace(/\s+$/u, ""), "```", ""].join("\n");
      await fs.writeFile(chunkAbs, body, "utf8");
      chunkFiles.push(chunkRel);
      totalChunks++;
    }
  }

  if (projectIndexFileListed < pathIndexFileCount) {
    const omitted = pathIndexFileCount - projectIndexFileListed;
    projectIndexLines.push("");
    projectIndexLines.push(
      `**一覧省略**: 通常ファイルは全${pathIndexFileCount}件。本ファイルには先頭${projectIndexFileListed}件のみ掲載。残り${omitted}件は\`${pathIndexRel}\`（PATH_INDEX）を参照。`
    );
  }

  await fs.writeFile(pathIndexAbs, indexLines.join("\n") + "\n", "utf8");
  await fs.writeFile(projectIndexAbs, projectIndexLines.join("\n") + "\n", "utf8");

  manifest.indexFiles ??= [];
  manifest.chunkFiles ??= [];
  manifest.indexFiles.push(projectIndexRel, pathIndexRel);
  manifest.chunkFiles.push(...chunkFiles);
  manifest.chunkCount = totalChunks;
}
