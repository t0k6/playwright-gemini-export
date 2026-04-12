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
});
