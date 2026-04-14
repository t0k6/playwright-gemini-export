import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { validateConfig, validatePackConfig } from "../../tools/gemini-export/config.mjs";
import { defaultConfig } from "../../tools/gemini-export/default-config.mjs";

const repoRoot = path.resolve("/tmp/gemini-validate-fake-root");

describe("gemini-export validateConfig", () => {
  it("throws when outDir is missing or empty", () => {
    assert.throws(
      () =>
        validateConfig(
          { ...defaultConfig, outDir: "", sourcePaths: ["src"] },
          repoRoot
        ),
      /outDir is required/
    );
  });

  it("throws when sourcePaths is empty", () => {
    assert.throws(
      () =>
        validateConfig(
          { ...defaultConfig, sourcePaths: [], outDir: ".ai-context/out" },
          repoRoot
        ),
      /sourcePaths must be a non-empty array/
    );
  });

  it("throws on parent escape in sourcePaths", () => {
    assert.throws(
      () =>
        validateConfig(
          { ...defaultConfig, sourcePaths: ["../evil"], outDir: ".ai-context/out" },
          repoRoot
        ),
      /'\.\.' is not allowed|escapes repo root/
    );
  });

  it("accepts minimal valid config", () => {
    validateConfig(
      { ...defaultConfig, sourcePaths: ["src"], outDir: ".ai-context/out" },
      repoRoot
    );
  });

  it("throws when pack.outSubDir contains slash", () => {
    assert.throws(
      () =>
        validatePackConfig(
          { outSubDir: "evil/nested", chunkMaxLines: 300, bundleGroupDepth: 2 },
          ".ai-context/out",
          repoRoot
        ),
      /pack\.outSubDir|single path segment/
    );
  });

  it("throws when pack.outSubDir is '.'", () => {
    assert.throws(
      () =>
        validatePackConfig(
          { outSubDir: ".", chunkMaxLines: 300, bundleGroupDepth: 2 },
          ".ai-context/out",
          repoRoot
        ),
      /must not be '\.' \(would write pack output/
    );
  });

  it("throws when pack.chunkMaxLines is out of range", () => {
    assert.throws(
      () =>
        validatePackConfig(
          { outSubDir: "_pack", chunkMaxLines: 10, bundleGroupDepth: 2 },
          ".ai-context/out",
          repoRoot
        ),
      /chunkMaxLines/
    );
  });

  it("throws when pack.chunkMaxLines exceeds upper bound", () => {
    assert.throws(
      () =>
        validatePackConfig(
          { outSubDir: "_pack", chunkMaxLines: 5001, bundleGroupDepth: 2 },
          ".ai-context/out",
          repoRoot
        ),
      /chunkMaxLines/
    );
  });

  it("throws when pack.chunkMaxLines is not an integer", () => {
    assert.throws(
      () =>
        validatePackConfig(
          { outSubDir: "_pack", chunkMaxLines: 50.5, bundleGroupDepth: 2 },
          ".ai-context/out",
          repoRoot
        ),
      /chunkMaxLines/
    );
  });

  it("throws when pack.bundleGroupDepth is out of range", () => {
    assert.throws(
      () =>
        validatePackConfig(
          { outSubDir: "_pack", chunkMaxLines: 300, bundleGroupDepth: 0 },
          ".ai-context/out",
          repoRoot
        ),
      /bundleGroupDepth/
    );
    assert.throws(
      () =>
        validatePackConfig(
          { outSubDir: "_pack", chunkMaxLines: 300, bundleGroupDepth: 11 },
          ".ai-context/out",
          repoRoot
        ),
      /bundleGroupDepth/
    );
  });

  it("throws when pack.chunkMode='byte' and maxChunkBytes is missing/invalid", () => {
    assert.throws(
      () =>
        validatePackConfig(
          { outSubDir: "_pack", chunkMode: "byte", chunkMaxLines: 300, bundleGroupDepth: 2 },
          ".ai-context/out",
          repoRoot
        ),
      /maxChunkBytes/
    );
    assert.throws(
      () =>
        validatePackConfig(
          {
            outSubDir: "_pack",
            chunkMode: "byte",
            chunkMaxLines: 300,
            maxChunkBytes: 0,
            bundleGroupDepth: 2
          },
          ".ai-context/out",
          repoRoot
        ),
      /pack\.maxChunkBytes must be an integer >= 4/
    );
    assert.throws(
      () =>
        validatePackConfig(
          {
            outSubDir: "_pack",
            chunkMode: "byte",
            chunkMaxLines: 300,
            maxChunkBytes: 3,
            bundleGroupDepth: 2
          },
          ".ai-context/out",
          repoRoot
        ),
      /pack\.maxChunkBytes must be an integer >= 4/
    );
  });

  it("throws when indexChunk.chunksDir escapes repo (enabled)", () => {
    assert.throws(
      () =>
        validateConfig(
          {
            ...defaultConfig,
            sourcePaths: ["src"],
            outDir: ".ai-context/out",
            indexChunk: {
              ...defaultConfig.indexChunk,
              enabled: true,
              chunksDir: "../evil-chunks"
            }
          },
          repoRoot
        ),
      /not allowed|'..' is not allowed|escapes repo root/
    );
  });

  it("throws when indexChunk.maxChunkBytes is invalid (enabled)", () => {
    assert.throws(
      () =>
        validateConfig(
          {
            ...defaultConfig,
            sourcePaths: ["src"],
            outDir: ".ai-context/out",
            indexChunk: {
              ...defaultConfig.indexChunk,
              enabled: true,
              maxChunkBytes: 0
            }
          },
          repoRoot
        ),
      /indexChunk\.maxChunkBytes must be an integer >= 4/
    );
  });

  it("throws when indexChunk.maxChunkBytes is 1..3 (enabled)", () => {
    assert.throws(
      () =>
        validateConfig(
          {
            ...defaultConfig,
            sourcePaths: ["src"],
            outDir: ".ai-context/out",
            indexChunk: {
              ...defaultConfig.indexChunk,
              enabled: true,
              maxChunkBytes: 3
            }
          },
          repoRoot
        ),
      /indexChunk\.maxChunkBytes must be an integer >= 4/
    );
  });

  it("throws when indexChunk.maxChunkBytes is 1..3 even if indexChunk.enabled is false", () => {
    assert.throws(
      () =>
        validateConfig(
          {
            ...defaultConfig,
            sourcePaths: ["src"],
            outDir: ".ai-context/out",
            indexChunk: {
              ...defaultConfig.indexChunk,
              enabled: false,
              maxChunkBytes: 3
            }
          },
          repoRoot
        ),
      /indexChunk\.maxChunkBytes must be an integer >= 4/
    );
  });

  it("throws when pack is an array", () => {
    assert.throws(
      () =>
        validateConfig(
          {
            ...defaultConfig,
            sourcePaths: ["src"],
            outDir: ".ai-context/out",
            pack: []
          },
          repoRoot
        ),
      /pack must be a non-null object/
    );
  });

  it("throws when indexChunk is an array", () => {
    assert.throws(
      () =>
        validateConfig(
          {
            ...defaultConfig,
            sourcePaths: ["src"],
            outDir: ".ai-context/out",
            indexChunk: []
          },
          repoRoot
        ),
      /indexChunk must be an object/
    );
  });
});
