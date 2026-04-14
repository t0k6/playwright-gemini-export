import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { copyOneFile } from "../../tools/gemini-export/copy-pipeline.mjs";
import { buildRedactRules } from "../../tools/lib/gemini-export-pure.mjs";

function emptyManifest(repoRoot, outDirRel = "out") {
  return {
    generatedAt: new Date().toISOString(),
    repoRoot,
    outDir: outDirRel,
    sourcePaths: [],
    dryRun: false,
    copiedFiles: [],
    skippedFiles: [],
    redactedFiles: [],
    anonymizedFiles: [],
    warnings: []
  };
}

function baseCtx(repoRoot, outDirAbs, manifest, overrides = {}) {
  return {
    repoRoot,
    outDirAbs,
    includeExtSet: new Set([".txt"]),
    excludeDirSet: new Set(),
    excludeFileRegexes: [],
    excludePathRegexes: [],
    redactRules: buildRedactRules([]),
    maxFileSizeBytes: 512 * 1024,
    manifest,
    copiedFilesSet: new Set(manifest.copiedFiles),
    checkOnly: false,
    anonymizeConfig: { enabled: false },
    ...overrides
  };
}

describe("gemini-export copyOneFile", () => {
  it("skips file larger than maxFileSizeBytes", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "gemini-copy-"));
    const repoRoot = path.join(tmp, "repo");
    const outDirAbs = path.join(repoRoot, "export");
    const srcDir = path.join(repoRoot, "src");
    await fs.mkdir(srcDir, { recursive: true });
    const bigPath = path.join(srcDir, "big.txt");
    await fs.writeFile(bigPath, "x".repeat(300), "utf8");

    const manifest = emptyManifest(repoRoot);
    const ctx = baseCtx(repoRoot, outDirAbs, manifest, { maxFileSizeBytes: 100 });

    await copyOneFile(ctx, { srcAbs: bigPath, relSourcePath: "src/big.txt" });

    assert.ok(manifest.skippedFiles.some((s) => s.includes("too large")));
    assert.equal(manifest.copiedFiles.includes("src/big.txt"), false);
    try {
      await fs.access(path.join(outDirAbs, "src", "big.txt"));
      assert.fail("output should not exist");
    } catch (e) {
      assert.equal(e.code, "ENOENT");
    }

    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("skips binary-looking content", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "gemini-copy-"));
    const repoRoot = path.join(tmp, "repo");
    const outDirAbs = path.join(repoRoot, "export");
    const srcDir = path.join(repoRoot, "src");
    await fs.mkdir(srcDir, { recursive: true });
    const binPath = path.join(srcDir, "raw.txt");
    const buf = Buffer.alloc(20, 0);
    buf.write("abc", 0);
    await fs.writeFile(binPath, buf);

    const manifest = emptyManifest(repoRoot);
    const ctx = baseCtx(repoRoot, outDirAbs, manifest);

    await copyOneFile(ctx, { srcAbs: binPath, relSourcePath: "src/raw.txt" });

    assert.ok(manifest.skippedFiles.some((s) => s.includes("binary or non-text")));

    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("writes text file under outDir when checkOnly is false", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "gemini-copy-"));
    const repoRoot = path.join(tmp, "repo");
    const outDirAbs = path.join(repoRoot, "export");
    const srcDir = path.join(repoRoot, "src");
    await fs.mkdir(srcDir, { recursive: true });
    const srcPath = path.join(srcDir, "note.txt");
    await fs.writeFile(srcPath, "plain text\n", "utf8");

    const manifest = emptyManifest(repoRoot);
    const ctx = baseCtx(repoRoot, outDirAbs, manifest);

    await copyOneFile(ctx, { srcAbs: srcPath, relSourcePath: "src/note.txt" });

    assert.ok(manifest.copiedFiles.includes("src/note.txt"));
    const outText = await fs.readFile(path.join(outDirAbs, "src", "note.txt"), "utf8");
    assert.equal(outText, "plain text\n");

    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("does not write when checkOnly is true but records copiedFiles", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "gemini-copy-"));
    const repoRoot = path.join(tmp, "repo");
    const outDirAbs = path.join(repoRoot, "export");
    const srcDir = path.join(repoRoot, "src");
    await fs.mkdir(srcDir, { recursive: true });
    const srcPath = path.join(srcDir, "dry.txt");
    await fs.writeFile(srcPath, "dry-run\n", "utf8");

    const manifest = emptyManifest(repoRoot);
    manifest.dryRun = true;
    const ctx = baseCtx(repoRoot, outDirAbs, manifest, { checkOnly: true });

    await copyOneFile(ctx, { srcAbs: srcPath, relSourcePath: "src/dry.txt" });

    assert.ok(manifest.copiedFiles.includes("src/dry.txt"));
    await assert.rejects(() => fs.access(path.join(outDirAbs, "src", "dry.txt")), {
      code: "ENOENT"
    });

    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("appends possible sensitive warning when path suggests secrets", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "gemini-copy-"));
    const repoRoot = path.join(tmp, "repo");
    const outDirAbs = path.join(repoRoot, "export");
    const srcDir = path.join(repoRoot, "src", "auth");
    await fs.mkdir(srcDir, { recursive: true });
    const srcPath = path.join(srcDir, "x.txt");
    await fs.writeFile(srcPath, "no tokens here\n", "utf8");

    const manifest = emptyManifest(repoRoot);
    const ctx = baseCtx(repoRoot, outDirAbs, manifest);

    await copyOneFile(ctx, { srcAbs: srcPath, relSourcePath: "src/auth/x.txt" });

    assert.ok(manifest.warnings.some((w) => w.startsWith("possible sensitive content:")));

    await fs.rm(tmp, { recursive: true, force: true });
  });
});
