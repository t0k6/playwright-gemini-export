import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { validateConfig } from "../../playwright-official-docs/src/config.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const baseConfig = {
  sidebarUrl: "https://example.com/sidebar.json",
  mdxBaseUrl: "https://example.com/mdx",
  docsBaseUrl: "https://playwright.dev",
  outDir: "playwright-official-docs/output",
  baselineDocIds: ["intro"]
};

describe("playwright-docs config", () => {
  it("accepts outDir and fixtureDir within repo", () => {
    assert.doesNotThrow(() =>
      validateConfig(
        {
          ...baseConfig,
          fixtureDir: "test/fixtures/playwright-docs"
        },
        repoRoot
      )
    );
  });

  it("rejects outDir that escapes repo", () => {
    assert.throws(
      () => validateConfig({ ...baseConfig, outDir: "../outside" }, repoRoot),
      /escapes repoRoot|not allowed/
    );
  });

  it("rejects fixtureDir that escapes repo", () => {
    assert.throws(
      () =>
        validateConfig(
          {
            ...baseConfig,
            fixtureDir: "../outside"
          },
          repoRoot
        ),
      /escapes repoRoot|not allowed/
    );
  });

  it("rejects non-string fixtureDir", () => {
    assert.throws(
      () => validateConfig({ ...baseConfig, fixtureDir: 123 }, repoRoot),
      /config\.fixtureDir must be null, undefined, or a non-empty string/
    );
  });

  it("rejects empty string fixtureDir", () => {
    assert.throws(
      () => validateConfig({ ...baseConfig, fixtureDir: "" }, repoRoot),
      /config\.fixtureDir must be null, undefined, or a non-empty string/
    );
  });

  it("rejects whitespace-only fixtureDir", () => {
    assert.throws(
      () => validateConfig({ ...baseConfig, fixtureDir: "   " }, repoRoot),
      /config\.fixtureDir must be null, undefined, or a non-empty string/
    );
  });
});
