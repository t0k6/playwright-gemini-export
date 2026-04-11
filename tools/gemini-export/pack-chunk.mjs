/**
 * @file Pack: チャンク Markdown 生成（YAML フロントマター + フェンス付き本文）。
 */

import fs from "node:fs/promises";
import path from "node:path";

import { escapePathForChunkBase, inferRole, languageTagFromExt } from "./pack-helpers.mjs";

/**
 * describe / test / it のタイトル文字列をざっくり抽出する。
 * @param {string} text
 * @returns {string[]}
 */
export function extractSymbols(text) {
  const out = [];
  const re = /\b(describe|test|it)\s*\(\s*(['"`])([\s\S]*?)\2/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const title = m[3].replace(/\s+/g, " ").trim().slice(0, 120);
    if (title) out.push(`${m[1]}: ${title}`);
    if (out.length >= 30) break;
  }
  return out;
}

/**
 * `from './*'` 形式の相対 import を列挙する（拡張子解決はしない）。
 * @param {string} text
 * @returns {string[]}
 */
export function extractRelativeImports(text) {
  const out = new Set();
  const re = /from\s+['"]((?:\.\.?\/)[^'"]+)['"]/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    out.add(m[1]);
    if (out.size >= 50) break;
  }
  return [...out];
}

/**
 * @param {string|number} v
 */
function yamlScalar(v) {
  const s = String(v);
  if (/^[\w.-]+$/.test(s) && !/^\d/.test(s)) return s;
  const escaped = s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
  return `"${escaped}"`;
}

/**
 * @param {Record<string, unknown>} fields
 */
export function buildYamlFrontmatter(fields) {
  const lines = ["---"];
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) {
      lines.push(`${k}:`);
      for (const item of v) {
        lines.push(`  - ${yamlScalar(item)}`);
      }
      continue;
    }
    if (typeof v === "string" || typeof v === "number") {
      lines.push(`${k}: ${yamlScalar(v)}`);
    }
  }
  lines.push("---");
  return lines.join("\n");
}

/**
 * @param {string} text
 * @param {number} maxLines
 * @returns {string[]}
 */
export function splitTextIntoLineChunks(text, maxLines) {
  const lines = text.split(/\r?\n/);
  const chunks = [];
  for (let i = 0; i < lines.length; i += maxLines) {
    chunks.push(lines.slice(i, i + maxLines).join("\n"));
  }
  return chunks.length > 0 ? chunks : [""];
}

/**
 * 先頭の YAML フロントマターを除去する（bundle 用）。
 * @param {string} fullText
 */
export function stripYamlFrontmatter(fullText) {
  if (!fullText.startsWith("---\n")) return fullText;
  const end = fullText.indexOf("\n---\n", 4);
  if (end === -1) return fullText;
  return fullText.slice(end + 5).trimStart();
}

/**
 * @param {{
 *   readRootAbs: string,
 *   packRootAbs: string,
 *   packableRelPaths: string[],
 *   packConfig: { chunkMaxLines: number },
 *   checkOnly: boolean
 * }} opts
 * @returns {Promise<Array<{ originalPath: string, role: string, chunkRelPaths: string[] }>>}
 */
export async function writePackChunks(opts) {
  const { readRootAbs, packRootAbs, packableRelPaths, packConfig, checkOnly } = opts;
  const maxLines = packConfig.chunkMaxLines;
  const chunksDirAbs = path.join(packRootAbs, "chunks");
  if (!checkOnly) {
    await fs.mkdir(chunksDirAbs, { recursive: true });
  }

  /** @type {Array<{ originalPath: string, role: string, chunkRelPaths: string[] }>} */
  const records = [];

  for (const relPath of packableRelPaths) {
    const normalized = relPath.replace(/\\/g, "/");
    const srcAbs = path.join(readRootAbs, ...normalized.split("/"));
    const text = await fs.readFile(srcAbs, "utf8");
    const role = inferRole(normalized);
    const ext = path.extname(normalized);
    const lang = languageTagFromExt(ext);
    const symbols = extractSymbols(text);
    const dependsOn = extractRelativeImports(text);
    const parts = splitTextIntoLineChunks(text, maxLines);
    const base = escapePathForChunkBase(normalized);
    const chunkRelPaths = [];

    for (let i = 0; i < parts.length; i++) {
      const partLabel = `${i + 1}/${parts.length}`;
      const suffix = parts.length > 1 ? `__p${i + 1}of${parts.length}` : "";
      const chunkName = `${base}${suffix}.md`;
      const chunkRelPosix = `chunks/${chunkName}`;
      const body = parts[i];
      const fence = "```" + lang + "\n// " + normalized + "\n" + body + "\n```\n";
      const fm = buildYamlFrontmatter({
        original_path: normalized,
        chunk: partLabel,
        role,
        symbols,
        depends_on: dependsOn
      });
      const md = `${fm}\n\n${fence}\n`;
      if (!checkOnly) {
        const dest = path.join(chunksDirAbs, chunkName);
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.writeFile(dest, md, "utf8");
      }
      chunkRelPaths.push(chunkRelPosix);
    }

    records.push({
      originalPath: normalized,
      role,
      chunkRelPaths
    });
  }

  return records;
}
