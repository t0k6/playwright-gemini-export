/**
 * @file Pack: PROJECT_INDEX.md / DIRECTORY_TREE.md / PATH_INDEX.jsonl 生成。
 */

import fs from "node:fs/promises";
import path from "node:path";

import { inferRole } from "./pack-helpers.mjs";
export const PROJECT_INDEX_MAX_ROWS = 120;

/**
 * ファイルパス一覧からツリー文字列を組み立てる。
 * @param {string[]} filePaths POSIX 区切りの相対パス
 * @returns {string}
 */
export function buildDirectoryTreeLines(filePaths) {
  const sorted = [...new Set(filePaths)].sort();
  /** @type {Record<string, object>} */
  const root = {};
  for (const fp of sorted) {
    const parts = fp.split("/").filter(Boolean);
    if (parts.length === 0) continue;
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const seg = parts[i];
      if (!node[seg]) node[seg] = {};
      node = /** @type {Record<string, object>} */ (node[seg]);
    }
  }

  /** @param {Record<string, object>} node @param {number} depth */
  function walk(node, depth) {
    const keys = Object.keys(node).sort();
    let out = "";
    for (const k of keys) {
      out += `${"  ".repeat(depth)}${k}\n`;
      out += walk(/** @type {Record<string, object>} */ (node[k]), depth + 1);
    }
    return out;
  }

  return walk(root, 0).replace(/\n$/, "");
}

/**
 * @param {{ path: string, role: string, kind: string, lineCount: number, sizeBytes: number, ext: string, chunkRelPaths?: string[], summary?: string }[]} rows
 */
function buildPathIndexJsonl(rows) {
  return rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length > 0 ? "\n" : "");
}

/**
 * @param {{
 *   packRootAbs: string,
 *   packableRelPaths: string[],
 *   chunkRecords: Array<{ originalPath: string, role: string, chunkRelPaths: string[] }>,
 *   readRootAbs: string,
 *   checkOnly: boolean
 * }} opts
 */
export async function writePackIndex(opts) {
  const { packRootAbs, packableRelPaths, chunkRecords, readRootAbs, checkOnly } = opts;

  const chunkByPath = new Map(chunkRecords.map((c) => [c.originalPath, c.chunkRelPaths]));

  /** @type {{ path: string, role: string, kind: string, lineCount: number, sizeBytes: number, ext: string, chunkRelPaths: string[], summary: string }[]} */
  const rows = [];
  for (const rel of packableRelPaths) {
    const normalized = rel.replace(/\\/g, "/");
    const abs = path.join(readRootAbs, ...normalized.split("/"));
    const text = await fs.readFile(abs, "utf8");
    const st = await fs.stat(abs);
    const lineCount = text === "" ? 0 : text.split(/\r?\n/).length;
    const ext = path.extname(normalized).toLowerCase();
    const role = inferRole(normalized);
    const kind = role;
    const chunkRelPaths = chunkByPath.get(normalized) ?? [];
    rows.push({ path: normalized, role, kind, lineCount, sizeBytes: st.size, ext, chunkRelPaths, summary: "" });
  }

  const tree = buildDirectoryTreeLines(packableRelPaths);
  const directoryTreeMd = `# DIRECTORY_TREE\n\n\`\`\`text\n${tree}\n\`\`\`\n`;

  const listedRows = rows.slice(0, PROJECT_INDEX_MAX_ROWS);
  const omittedRows = Math.max(0, rows.length - listedRows.length);
  const tableRows = listedRows
    .map((r) => {
      const chunks = r.chunkRelPaths.map((c) => `\`${c}\``).join("<br>");
      return `| \`${r.path}\` | ${r.role} | ${r.lineCount} | ${r.sizeBytes} | ${r.ext} | ${chunks} |`;
    })
    .join("\n");

  const projectIndexMd = `# PROJECT_INDEX

このファイルは \`playwright-gemini-export\` の \`--pack\` が生成した索引です。Gemini / NotebookLM ではまず本ファイルと \`DIRECTORY_TREE.md\` を渡し、必要に応じて \`bundles/\` または \`chunks/\` を追加してください。

## ファイル一覧

| path | role | lines | bytes | ext | chunks |
| --- | --- | ---: | ---: | --- | --- |
${tableRows}

${omittedRows > 0 ? `> 一覧省略: 全${rows.length}件中、先頭${listedRows.length}件を表示。詳細は \`PATH_INDEX.jsonl\` を参照。` : ""}

## ディレクトリツリー（抜粋）

\`\`\`text
${tree}
\`\`\`
`;

  const jsonl = buildPathIndexJsonl(rows);

  if (!checkOnly) {
    await fs.mkdir(packRootAbs, { recursive: true });
    await fs.writeFile(path.join(packRootAbs, "PROJECT_INDEX.md"), projectIndexMd, "utf8");
    await fs.writeFile(path.join(packRootAbs, "DIRECTORY_TREE.md"), directoryTreeMd, "utf8");
    await fs.writeFile(path.join(packRootAbs, "PATH_INDEX.jsonl"), jsonl, "utf8");
  }
}
