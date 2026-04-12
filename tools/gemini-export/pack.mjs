/**
 * @file Pack オーケストレータ: chunk → index → bundle の順で生成する。
 */

import fs from "node:fs/promises";
import path from "node:path";

import { writePackBundles } from "./pack-bundle.mjs";
import { writePackChunks } from "./pack-chunk.mjs";
import { dirKeyFromPath, filterPackablePaths, inferRole } from "./pack-helpers.mjs";
import { writePackIndex } from "./pack-index.mjs";

/**
 * `--check` 時: おおよその chunk 数と bundle 数を見積もる（元ファイルは repoRoot から読む）。
 * @param {{ repoRoot: string, manifest: { copiedFiles: string[] }, pack: object }} opts
 */
export async function estimatePackSummary(opts) {
  const { repoRoot, manifest, pack } = opts;
  const packable = filterPackablePaths(manifest.copiedFiles, pack.outSubDir);
  let chunkEstimate = 0;
  const bundleKeys = new Set();

  for (const rel of packable) {
    const normalized = rel.replace(/\\/g, "/");
    const abs = path.join(repoRoot, ...normalized.split("/"));
    try {
      const text = await fs.readFile(abs, "utf8");
      const lines = text === "" ? 0 : text.split(/\r?\n/).length;
      chunkEstimate += Math.max(1, Math.ceil(lines / pack.chunkMaxLines));
    } catch {
      chunkEstimate += 1;
    }
    bundleKeys.add(`${dirKeyFromPath(normalized, pack.bundleGroupDepth)}|${inferRole(normalized)}`);
  }

  return {
    fileCount: packable.length,
    chunkEstimate,
    bundleCount: bundleKeys.size
  };
}

/**
 * @param {{
 *   repoRoot: string,
 *   outDirAbs: string,
 *   manifest: { copiedFiles: string[] },
 *   config: { outDir: string, pack: object },
 *   checkOnly: boolean
 * }} opts
 */
export async function runPack(opts) {
  const { repoRoot, outDirAbs, manifest, config, checkOnly } = opts;
  const pack = config.pack;
  if (!pack || typeof pack !== "object") return;

  const packRootAbs = path.join(outDirAbs, pack.outSubDir);
  const relPackRoot = path.posix.join(config.outDir.replace(/\\/g, "/"), pack.outSubDir);

  if (checkOnly) {
    const s = await estimatePackSummary({ repoRoot, manifest, pack });
    console.log(
      `Pack (dry-run): ${s.fileCount} packable files -> ~${s.chunkEstimate} chunks, ${s.bundleCount} bundles (would write under ${relPackRoot})`
    );
    return;
  }

  const packable = filterPackablePaths(manifest.copiedFiles, pack.outSubDir);

  await fs.rm(packRootAbs, { recursive: true, force: true });
  await fs.mkdir(path.join(packRootAbs, "chunks"), { recursive: true });
  await fs.mkdir(path.join(packRootAbs, "bundles"), { recursive: true });

  const chunkRecords = await writePackChunks({
    readRootAbs: outDirAbs,
    packRootAbs,
    packableRelPaths: packable,
    packConfig: pack,
    checkOnly: false
  });

  await writePackIndex({
    packRootAbs,
    packableRelPaths: packable,
    chunkRecords,
    readRootAbs: outDirAbs,
    checkOnly: false
  });

  await writePackBundles({
    packRootAbs,
    chunkRecords,
    packConfig: pack,
    checkOnly: false
  });

  const prefix = `${pack.outSubDir}/`;
  manifest.copiedFiles.push(
    `${prefix}PROJECT_INDEX.md`,
    `${prefix}DIRECTORY_TREE.md`,
    `${prefix}PATH_INDEX.jsonl`
  );
  for (const r of chunkRecords) {
    for (const c of r.chunkRelPaths) {
      manifest.copiedFiles.push(`${prefix}${c.replace(/\\/g, "/")}`);
    }
  }
  const bundlesDir = path.join(packRootAbs, "bundles");
  const bundleNames = await fs.readdir(bundlesDir);
  for (const e of bundleNames.sort()) {
    manifest.copiedFiles.push(`${prefix}bundles/${e}`);
  }
}
