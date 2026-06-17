import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..");
const scriptPath = path.join(projectRoot, "playwright-official-docs", "bin", "export-playwright-docs.mjs");
const fixtureDir = path.join(projectRoot, "test", "fixtures", "playwright-docs");

/**
 * @param {string} cwd
 * @param {string[]} args
 */
function runExport(cwd, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env }
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => {
      stdout += d;
    });
    child.stderr?.on("data", (d) => {
      stderr += d;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

describe("export-playwright-docs CLI", () => {
  it("exports fixture docs with preprocessing", async () => {
    const { code, stderr } = await runExport(projectRoot, [
      "--fixture-dir",
      fixtureDir
    ]);
    assert.equal(code, 0, stderr);

    const actualOut = path.join(projectRoot, "playwright-official-docs", "output");
    const intro = await fs.readFile(path.join(actualOut, "pages", "01-intro.md"), "utf8");
    assert.match(intro, /npm init playwright@latest/);
    assert.doesNotMatch(intro, /yarn create playwright/);
    assert.doesNotMatch(intro, /\[Page\]:/);

    const languages = await fs.readFile(path.join(actualOut, "pages", "03-languages.md"), "utf8");
    assert.match(languages, /JavaScript and TypeScript/);
    assert.doesNotMatch(languages, /## Python/);

    const bundle = await fs.readFile(
      path.join(actualOut, "notebooklm", "getting-started.md"),
      "utf8"
    );
    assert.match(bundle, /## Installation/);
    assert.match(bundle, /## Writing tests/);

    const manifest = JSON.parse(await fs.readFile(path.join(actualOut, "manifest.json"), "utf8"));
    assert.equal(manifest.pageCount, 3);
    assert.ok(manifest.pages.some((p) => p.id === "intro"));
  });

  it("dry-run does not require existing output", async () => {
    const { code, stdout, stderr } = await runExport(projectRoot, [
      "--check",
      "--fixture-dir",
      fixtureDir
    ]);
    assert.equal(code, 0, stderr);
    assert.match(stdout, /Check completed/);
    assert.match(stdout, /Pages: 3/);
  });

  it("is idempotent on repeated fixture export", async () => {
    await runExport(projectRoot, ["--fixture-dir", fixtureDir]);
    const outDir = path.join(projectRoot, "playwright-official-docs", "output");
    const first = await fs.readFile(path.join(outDir, "pages", "01-intro.md"), "utf8");
    await runExport(projectRoot, ["--fixture-dir", fixtureDir]);
    const second = await fs.readFile(path.join(outDir, "pages", "01-intro.md"), "utf8");
    assert.equal(first, second);
  });
});
