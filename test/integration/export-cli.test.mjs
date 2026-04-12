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

      await assert.rejects(() => fs.access(path.join(outRoot, "PROJECT_INDEX.md")), {
        code: "ENOENT"
      });
      await assert.rejects(() => fs.access(path.join(outRoot, "PATH_INDEX.jsonl")), {
        code: "ENOENT"
      });
      await assert.rejects(() => fs.access(path.join(outRoot, "chunks")), { code: "ENOENT" });
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it("generates PROJECT_INDEX, PATH_INDEX, and chunks when indexChunk is enabled", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "gemini-export-"));
    try {
      await copyFixture(tmp);
      const cfgPath = path.join(tmp, ".gemini-export.json");
      const cfg = JSON.parse(await fs.readFile(cfgPath, "utf8"));
      cfg.indexChunk = { enabled: true, maxChunkBytes: 2048 };
      await fs.writeFile(cfgPath, JSON.stringify(cfg), "utf8");

      const { code, stderr } = await runExport(tmp);
      assert.equal(code, 0, stderr);

      const outRoot = path.join(tmp, ".ai-context", "playwright-test-export");
      await fs.access(path.join(outRoot, "PROJECT_INDEX.md"));
      await fs.access(path.join(outRoot, "PATH_INDEX.jsonl"));
      const chunkDir = path.join(outRoot, "chunks");
      const entries = await fs.readdir(chunkDir);
      assert.ok(entries.some((n) => n.endsWith(".md")), `expected chunk md files, got: ${entries.join(",")}`);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it("manifest.json and README_FOR_AI reflect indexChunk; PATH_INDEX and chunks have required metadata", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "gemini-export-"));
    try {
      await copyFixture(tmp);
      const cfgPath = path.join(tmp, ".gemini-export.json");
      const cfg = JSON.parse(await fs.readFile(cfgPath, "utf8"));
      cfg.indexChunk = { enabled: true, maxChunkBytes: 2048 };
      cfg.generateAiReadme = true;
      await fs.writeFile(cfgPath, JSON.stringify(cfg), "utf8");

      const { code, stderr } = await runExport(tmp);
      assert.equal(code, 0, stderr);

      const outRoot = path.join(tmp, ".ai-context", "playwright-test-export");
      const man = JSON.parse(await fs.readFile(path.join(outRoot, "manifest.json"), "utf8"));
      assert.ok(Array.isArray(man.indexFiles));
      assert.ok(man.indexFiles.includes("PROJECT_INDEX.md"));
      assert.ok(man.indexFiles.includes("PATH_INDEX.jsonl"));
      assert.ok(Array.isArray(man.chunkFiles));
      assert.ok(man.chunkCount > 0);
      assert.equal(man.chunkFiles.length, man.chunkCount);

      const readme = await fs.readFile(path.join(outRoot, "README_FOR_AI.md"), "utf8");
      assert.match(readme, /chunkCount: [1-9]\d*/);
      assert.match(readme, /PROJECT_INDEX\.md/);
      assert.match(readme, /PATH_INDEX\.jsonl/);

      const jsonl = await fs.readFile(path.join(outRoot, "PATH_INDEX.jsonl"), "utf8");
      const firstLine = jsonl.trim().split("\n").find((l) => l.length > 0);
      assert.ok(firstLine);
      const row = JSON.parse(firstLine);
      assert.ok(typeof row.path === "string" && row.path.length > 0);
      assert.ok(typeof row.kind === "string");
      assert.ok(typeof row.ext === "string");
      assert.ok(typeof row.sizeBytes === "number");

      const chunkDir = path.join(outRoot, "chunks");
      const chunkName = (await fs.readdir(chunkDir)).find((n) => n.endsWith(".md"));
      assert.ok(chunkName);
      const chunkText = await fs.readFile(path.join(chunkDir, chunkName), "utf8");
      assert.match(chunkText, /^---\r?\n/m);
      assert.match(chunkText, /^original_path:/m);
      assert.match(chunkText, /^chunk_id:/m);
      assert.match(chunkText, /^kind:/m);
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

  it("--index-chunk forces index/chunk when fixture has indexChunk.enabled false", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "gemini-export-"));
    try {
      await copyFixture(tmp);
      const { code, stderr } = await runExport(tmp, ["--index-chunk"]);
      assert.equal(code, 0, stderr);

      const outRoot = path.join(tmp, ".ai-context", "playwright-test-export");
      await fs.access(path.join(outRoot, "PROJECT_INDEX.md"));
      await fs.access(path.join(outRoot, "PATH_INDEX.jsonl"));
      const chunkDir = path.join(outRoot, "chunks");
      const entries = await fs.readdir(chunkDir);
      assert.ok(entries.some((n) => n.endsWith(".md")), `expected chunk md files, got: ${entries.join(",")}`);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it("--check --index-chunk prints dry-run estimate without writing outDir", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "gemini-export-"));
    try {
      await copyFixture(tmp);
      const { code, stdout, stderr } = await runExport(tmp, ["--check", "--index-chunk"]);
      assert.equal(code, 0, stderr);
      assert.match(stdout, /Index\/chunk \(dry-run\)/);

      const outRoot = path.join(tmp, ".ai-context", "playwright-test-export");
      await assert.rejects(() => fs.access(outRoot), { code: "ENOENT" });
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it("--check does not create outDir when indexChunk is enabled", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "gemini-export-"));
    try {
      await copyFixture(tmp);
      const cfgPath = path.join(tmp, ".gemini-export.json");
      const cfg = JSON.parse(await fs.readFile(cfgPath, "utf8"));
      cfg.indexChunk = { enabled: true };
      await fs.writeFile(cfgPath, JSON.stringify(cfg), "utf8");

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

  it("PROJECT_INDEX shows omission note when file list exceeds cap", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "gemini-export-many-"));
    try {
      await copyFixture(tmp);
      const srcDir = path.join(tmp, "src");
      await fs.mkdir(srcDir, { recursive: true });
      for (let i = 0; i < 107; i++) {
        await fs.writeFile(path.join(srcDir, `bulk-${i}.ts`), `export const v${i} = ${i};\n`, "utf8");
      }

      const cfgPath = path.join(tmp, ".gemini-export.json");
      const cfg = JSON.parse(await fs.readFile(cfgPath, "utf8"));
      cfg.indexChunk = { enabled: true, maxChunkBytes: 2048 };
      await fs.writeFile(cfgPath, JSON.stringify(cfg), "utf8");

      const { code, stderr } = await runExport(tmp);
      assert.equal(code, 0, stderr);

      const outRoot = path.join(tmp, ".ai-context", "playwright-test-export");
      const projectIndex = await fs.readFile(path.join(outRoot, "PROJECT_INDEX.md"), "utf8");
      assert.match(projectIndex, /一覧省略/);
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
