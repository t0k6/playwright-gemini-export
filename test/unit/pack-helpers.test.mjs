import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  bundleFileName,
  dirKeyFromPath,
  escapePathForChunkBase,
  filterPackablePaths,
  inferRole,
  isPackableRelPath
} from "../../tools/gemini-export/pack-helpers.mjs";

describe("pack-helpers", () => {
  it("isPackableRelPath excludes manifest and _pack", () => {
    assert.equal(isPackableRelPath("manifest.json", "_pack"), false);
    assert.equal(isPackableRelPath("_pack/foo.md", "_pack"), false);
    assert.equal(isPackableRelPath("src/a.ts", "_pack"), true);
  });

  it("filterPackablePaths keeps only text-like extensions", () => {
    const list = ["src/a.ts", "img.png", "manifest.json", "readme.md"];
    const out = filterPackablePaths(list, "_pack");
    assert.deepEqual(out, ["src/a.ts", "readme.md"]);
  });

  it("inferRole detects spec, page, helper, fixture, config", () => {
    assert.equal(inferRole("tests/auth/login.spec.ts"), "spec");
    assert.equal(inferRole("playwright/pages/login.ts"), "page");
    assert.equal(inferRole("helpers/foo.ts"), "helper");
    assert.equal(inferRole("fixtures/sandbox/x.json"), "fixture");
    assert.equal(inferRole("package.json"), "config");
    assert.equal(inferRole("playwright.config.ts"), "config");
    assert.equal(inferRole("tsconfig.json"), "config");
    assert.equal(inferRole("src/utils.ts"), "other");
  });

  it("dirKeyFromPath respects depth", () => {
    assert.equal(dirKeyFromPath("tests/auth/login.spec.ts", 2), "tests-auth");
    assert.equal(dirKeyFromPath("src/sample.ts", 2), "src");
  });

  it("escapePathForChunkBase flattens path", () => {
    assert.match(escapePathForChunkBase("src/auth/login.spec.ts"), /src__auth/);
  });

  it("bundleFileName combines dirKey and role", () => {
    assert.equal(bundleFileName("tests-auth", "spec"), "bundle-tests-auth-spec.md");
  });
});
