/**
 * @file Pack: ディレクトリキー + 役割で chunk を束ねた bundle Markdown を生成する。
 */

import fs from "node:fs/promises";
import path from "node:path";

import { bundleFileName, dirKeyFromPath } from "./pack-helpers.mjs";
import { stripYamlFrontmatter } from "./pack-chunk.mjs";

/**
 * @param {{
 *   packRootAbs: string,
 *   chunkRecords: Array<{ originalPath: string, role: string, chunkRelPaths: string[] }>,
 *   packConfig: { bundleGroupDepth: number },
 *   checkOnly: boolean
 * }} opts
 */
export async function writePackBundles(opts) {
  const { packRootAbs, chunkRecords, packConfig, checkOnly } = opts;
  const depth = packConfig.bundleGroupDepth;

  /** @type {Map<string, Array<{ originalPath: string, role: string, chunkRelPaths: string[] }>>} */
  const groups = new Map();

  for (const rec of chunkRecords) {
    const dk = dirKeyFromPath(rec.originalPath, depth);
    const key = `${dk}|${rec.role}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(rec);
  }

  const bundlesDirAbs = path.join(packRootAbs, "bundles");
  if (!checkOnly) {
    await fs.mkdir(bundlesDirAbs, { recursive: true });
  }

  const keysSorted = [...groups.keys()].sort();
  for (const key of keysSorted) {
    const [dirKey, role] = key.split("|");
    const name = bundleFileName(dirKey, role);
    const recs = groups.get(key);
    if (!recs) continue;
    recs.sort((a, b) => a.originalPath.localeCompare(b.originalPath));

    let body = `# Bundle: ${dirKey} (${role})\n\n`;
    body += `この bundle は \`--pack\` が **ディレクトリ階層（深さ ${depth}）** と **推定役割** でグルーピングした chunk の集まりです。\n\n`;

    for (const rec of recs) {
      body += `## \`${rec.originalPath}\`\n\n`;
      for (const chunkRel of rec.chunkRelPaths) {
        const chunkAbs = path.join(packRootAbs, ...chunkRel.split("/"));
        let chunkText = "";
        if (!checkOnly) {
          chunkText = await fs.readFile(chunkAbs, "utf8");
        }
        const stripped = stripYamlFrontmatter(chunkText);
        body += stripped.trimEnd() + "\n\n";
      }
    }

    if (!checkOnly) {
      await fs.writeFile(path.join(bundlesDirAbs, name), body, "utf8");
    }
  }
}
