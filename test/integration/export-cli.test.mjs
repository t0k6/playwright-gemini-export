import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..");
const scriptPath = path.join(projectRoot, "tools", "export-gemini-playwright-context.mjs");
const fixtureSource = path.join(projectRoot, "test", "fixtures", "minimal-repo");

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

async function copyFixture(dest) {
  await fs.cp(fixtureSource, dest, { recursive: true });
}

describe("export-gemini-playwright-context CLI", () => {
  it("exports with redaction and JSON anonymization under fixtures/sandbox", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "gemini-export-"));
    try {
      await copyFixture(tmp);
      const { code, stderr } = await runExport(tmp);
      assert.equal(code, 0, stderr);

      const outRoot = path.join(tmp, ".ai-context", "playwright-test-export");
      const sampleOut = path.join(outRoot, "src", "sample.ts");
      const sampleText = await fs.readFile(sampleOut, "utf8");
      assert.match(sampleText, /\*\*\*REDACTED\*\*\*/);
      assert.doesNotMatch(sampleText, /verylongsecrethere/);

      const userOut = path.join(outRoot, "src", "fixtures", "sandbox", "user.json");
      const user = JSON.parse(await fs.readFile(userOut, "utf8"));
      assert.notEqual(user.email, "alice@example.com");
      assert.match(user.email, /^user-[0-9a-f]{8}@example\.test$/);

      await assert.rejects(() => fs.access(path.join(outRoot, "src", "auth", "hidden.ts")), {
        code: "ENOENT"
      });
      await assert.rejects(() => fs.access(path.join(outRoot, "src", "image.png")), {
        code: "ENOENT"
      });
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it("--check does not create outDir", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "gemini-export-"));
    try {
      await copyFixture(tmp);
      const { code, stderr } = await runExport(tmp, ["--check"]);
      assert.equal(code, 0, stderr);
      const outRoot = path.join(tmp, ".ai-context", "playwright-test-export");
      await assert.rejects(() => fs.access(outRoot), { code: "ENOENT" });
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it("exits non-zero when sourcePaths contains parent escape", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "gemini-export-"));
    try {
      await copyFixture(tmp);
      await fs.writeFile(
        path.join(tmp, ".gemini-export.json"),
        JSON.stringify({
          sourcePaths: ["../outside"],
          outDir: ".ai-context/playwright-test-export"
        }),
        "utf8"
      );
      const { code, stderr } = await runExport(tmp);
      assert.notEqual(code, 0);
      assert.match(stderr, /not allowed|Error/i);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it("--help exits 0 and prints usage", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "gemini-export-"));
    try {
      await copyFixture(tmp);
      const { code, stdout } = await runExport(tmp, ["--help"]);
      assert.equal(code, 0);
      assert.match(stdout, /Usage:|--check/i);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it("exits non-zero when sourcePaths is empty", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "gemini-export-"));
    try {
      await copyFixture(tmp);
      await fs.writeFile(
        path.join(tmp, ".gemini-export.json"),
        JSON.stringify({
          sourcePaths: [],
          outDir: ".ai-context/playwright-test-export"
        }),
        "utf8"
      );
      const { code, stderr } = await runExport(tmp);
      assert.notEqual(code, 0);
      assert.match(stderr, /sourcePaths|Error/i);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it("exits non-zero when outDir is empty string", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "gemini-export-"));
    try {
      await copyFixture(tmp);
      await fs.writeFile(
        path.join(tmp, ".gemini-export.json"),
        JSON.stringify({
          sourcePaths: ["src"],
          outDir: ""
        }),
        "utf8"
      );
      const { code, stderr } = await runExport(tmp);
      assert.notEqual(code, 0);
      assert.match(stderr, /outDir|Error/i);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it("exits with code 2 when failOnWarnings is true", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "gemini-export-"));
    try {
      await copyFixture(tmp);
      const cfg = JSON.parse(
        await fs.readFile(path.join(tmp, ".gemini-export.json"), "utf8")
      );
      cfg.failOnWarnings = true;
      await fs.writeFile(
        path.join(tmp, ".gemini-export.json"),
        JSON.stringify(cfg),
        "utf8"
      );
      const { code, stderr } = await runExport(tmp);
      assert.equal(code, 2, stderr);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});
