#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const repoRoot = process.cwd();
const configPath = path.join(repoRoot, ".gemini-export.json");

const defaultConfig = {
  sourceDir: "playwright",
  outDir: ".ai-context/playwright-gemini",
  includeExtensions: [
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".json",
    ".md",
    ".yml",
    ".yaml",
    ".txt",
    ".css",
    ".html"
  ],
  includeFiles: [
    "package.json",
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "tsconfig.json"
  ],
  excludeDirs: [
    ".git",
    "node_modules",
    "playwright-report",
    "test-results",
    "coverage",
    "dist",
    "build",
    ".next",
    ".turbo",
    ".cache"
  ],
  excludeFilePatterns: [
    "^\\.env($|\\.)",
    "\\.pem$",
    "\\.key$",
    "\\.p12$",
    "\\.crt$",
    "\\.cer$",
    "\\.der$",
    "\\.jks$",
    "\\.keystore$",
    "\\.sqlite$",
    "\\.db$",
    "\\.mp4$",
    "\\.webm$",
    "\\.zip$",
    "\\.gz$",
    "\\.png$",
    "\\.jpg$",
    "\\.jpeg$",
    "\\.gif$",
    "\\.svg$",
    "\\.pdf$",
    "\\.trace$"
  ],
  redactTextPatterns: [
    {
      name: "generic-api-key-assignment",
      regex: "(?i)\\b(api[_-]?key|token|secret|password|passwd|client[_-]?secret)\\b\\s*[:=]\\s*[\"'`][^\"'`\\n]{6,}[\"'`]",
      replacement: "$1 = \"***REDACTED***\""
    },
    {
      name: "bearer-token",
      regex: "(?i)bearer\\s+[a-z0-9\\-._~+/]+=*",
      replacement: "Bearer ***REDACTED***"
    },
    {
      name: "authorization-header",
      regex: "(?i)(authorization\\s*[:=]\\s*[\"'`]?)([^\"'`\\n]+)",
      replacement: "$1***REDACTED***"
    }
  ],
  maxFileSizeBytes: 512 * 1024,
  generateAiReadme: true
};

async function main() {
  const config = await loadConfig();
  const sourceDirAbs = path.join(repoRoot, config.sourceDir);
  const outDirAbs = path.join(repoRoot, config.outDir);

  await ensureExists(sourceDirAbs, `sourceDir not found: ${config.sourceDir}`);
  await cleanDir(outDirAbs);
  await fs.mkdir(outDirAbs, { recursive: true });

  const manifest = {
    generatedAt: new Date().toISOString(),
    repoRoot,
    sourceDir: config.sourceDir,
    outDir: config.outDir,
    copiedFiles: [],
    skippedFiles: [],
    redactedFiles: [],
    warnings: []
  };

  const includeExtSet = new Set(config.includeExtensions.map(normalizeExt));
  const excludeDirSet = new Set(config.excludeDirs);
  const excludeFileRegexes = config.excludeFilePatterns.map((p) => new RegExp(p, "i"));
  const redactRules = config.redactTextPatterns.map((r) => ({
    name: r.name,
    regex: new RegExp(r.regex, "g"),
    replacement: r.replacement
  }));

  await walkAndCopy({
    currentAbs: sourceDirAbs,
    sourceRootAbs: sourceDirAbs,
    outRootAbs: path.join(outDirAbs, path.basename(config.sourceDir)),
    includeExtSet,
    excludeDirSet,
    excludeFileRegexes,
    redactRules,
    maxFileSizeBytes: config.maxFileSizeBytes,
    manifest
  });

  for (const file of config.includeFiles) {
    const src = path.join(repoRoot, file);
    if (await exists(src)) {
      await copyOneFile({
        srcAbs: src,
        srcBaseAbs: repoRoot,
        outRootAbs: outDirAbs,
        redactRules,
        maxFileSizeBytes: config.maxFileSizeBytes,
        manifest
      });
    }
  }

  if (config.generateAiReadme) {
    const readmePath = path.join(outDirAbs, "README_FOR_AI.md");
    const readme = buildAiReadme(config, manifest);
    await fs.writeFile(readmePath, readme, "utf8");
    manifest.copiedFiles.push(relFromRepo(readmePath));
  }

  const manifestPath = path.join(outDirAbs, "manifest.json");
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  console.log("Export completed.");
  console.log(`Output: ${config.outDir}`);
  console.log(`Copied files: ${manifest.copiedFiles.length}`);
  console.log(`Redacted files: ${manifest.redactedFiles.length}`);
  console.log(`Skipped files: ${manifest.skippedFiles.length}`);

  if (manifest.warnings.length > 0) {
    console.log("\nWarnings:");
    for (const w of manifest.warnings) console.log(`- ${w}`);
  }
}

async function loadConfig() {
  if (!(await exists(configPath))) return defaultConfig;
  const raw = await fs.readFile(configPath, "utf8");
  const userConfig = JSON.parse(raw);
  return deepMerge(defaultConfig, userConfig);
}

async function walkAndCopy({
  currentAbs,
  sourceRootAbs,
  outRootAbs,
  includeExtSet,
  excludeDirSet,
  excludeFileRegexes,
  redactRules,
  maxFileSizeBytes,
  manifest
}) {
  const entries = await fs.readdir(currentAbs, { withFileTypes: true });

  for (const entry of entries) {
    const abs = path.join(currentAbs, entry.name);
    const relFromSource = path.relative(sourceRootAbs, abs);
    const normalizedRel = relFromSource.split(path.sep).join("/");

    if (entry.isDirectory()) {
      if (excludeDirSet.has(entry.name)) {
        manifest.skippedFiles.push(`${normalizedRel}/ [excluded dir]`);
        continue;
      }
      await walkAndCopy({
        currentAbs: abs,
        sourceRootAbs,
        outRootAbs,
        includeExtSet,
        excludeDirSet,
        excludeFileRegexes,
        redactRules,
        maxFileSizeBytes,
        manifest
      });
      continue;
    }

    if (!entry.isFile()) {
      manifest.skippedFiles.push(`${normalizedRel} [not regular file]`);
      continue;
    }

    const basename = path.basename(abs);
    const ext = normalizeExt(path.extname(abs));

    if (excludeFileRegexes.some((r) => r.test(basename) || r.test(normalizedRel))) {
      manifest.skippedFiles.push(`${normalizedRel} [excluded pattern]`);
      continue;
    }

    if (!includeExtSet.has(ext)) {
      manifest.skippedFiles.push(`${normalizedRel} [extension not included]`);
      continue;
    }

    await copyOneFile({
      srcAbs: abs,
      srcBaseAbs: sourceRootAbs,
      outRootAbs,
      redactRules,
      maxFileSizeBytes,
      manifest
    });
  }
}

async function copyOneFile({
  srcAbs,
  srcBaseAbs,
  outRootAbs,
  redactRules,
  maxFileSizeBytes,
  manifest
}) {
  const rel = path.relative(srcBaseAbs, srcAbs);
  const destAbs = path.join(outRootAbs, rel);

  const stat = await fs.stat(srcAbs);
  if (stat.size > maxFileSizeBytes) {
    manifest.skippedFiles.push(`${relFromRepo(srcAbs)} [too large: ${stat.size} bytes]`);
    return;
  }

  await fs.mkdir(path.dirname(destAbs), { recursive: true });

  let content = await fs.readFile(srcAbs);

  const isText = looksLikeText(content);
  if (!isText) {
    manifest.skippedFiles.push(`${relFromRepo(srcAbs)} [binary file]`);
    return;
  }

  let text = content.toString("utf8");
  const originalHash = sha256(text);
  let redacted = false;

  for (const rule of redactRules) {
    const next = text.replace(rule.regex, rule.replacement);
    if (next !== text) {
      redacted = true;
      text = next;
    }
  }

  await fs.writeFile(destAbs, text, "utf8");
  manifest.copiedFiles.push(relFromRepo(destAbs));

  if (redacted) {
    manifest.redactedFiles.push({
      file: relFromRepo(destAbs),
      beforeSha256: originalHash,
      afterSha256: sha256(text)
    });
  }
}

function buildAiReadme(config, manifest) {
  return `# README_FOR_AI

## Purpose
This export is a sanitized subset of the Playwright-related test codebase for assistance with:
- writing new E2E tests
- improving locator strategy
- refactoring page objects
- reducing flakiness
- aligning new tests with existing conventions

## Source
- sourceDir: \`${config.sourceDir}\`
- generatedAt: \`${manifest.generatedAt}\`

## Constraints
- This export may exclude secrets, large files, reports, screenshots, traces, and non-essential directories
- Some values may be redacted as \`***REDACTED***\`
- Treat missing files as intentionally omitted unless obviously required for code understanding

## What AI should do
- infer project conventions from existing tests and helpers
- preserve naming patterns already used
- prefer minimal diffs over large rewrites
- avoid inventing environment-specific details
- call out uncertainty explicitly when required files are missing

## Recommended tasks
- generate a new spec consistent with existing tests
- extract reusable helpers from duplicated logic
- improve wait strategy and flaky selectors
- suggest page object refinements
- explain test failure causes from logs/snippets

## Export summary
- copiedFiles: ${manifest.copiedFiles.length}
- redactedFiles: ${manifest.redactedFiles.length}
- skippedFiles: ${manifest.skippedFiles.length}
`;
}

function normalizeExt(ext) {
  return ext.toLowerCase();
}

function looksLikeText(buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
  let suspicious = 0;
  for (const b of sample) {
    if (b === 0) return false;
    if (b < 7 || (b > 14 && b < 32)) suspicious++;
  }
  return suspicious / Math.max(sample.length, 1) < 0.05;
}

async function cleanDir(dir) {
  await fs.rm(dir, { recursive: true, force: true });
}

async function ensureExists(absPath, message) {
  if (!(await exists(absPath))) {
    throw new Error(message);
  }
}

async function exists(absPath) {
  try {
    await fs.access(absPath);
    return true;
  } catch {
    return false;
  }
}

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function relFromRepo(absPath) {
  return path.relative(repoRoot, absPath).split(path.sep).join("/");
}

function deepMerge(base, override) {
  if (Array.isArray(base) || Array.isArray(override)) {
    return override ?? base;
  }
  if (typeof base !== "object" || base === null) return override ?? base;
  if (typeof override !== "object" || override === null) return override ?? base;

  const out = { ...base };
  for (const key of Object.keys(override)) {
    out[key] = key in base ? deepMerge(base[key], override[key]) : override[key];
  }
  return out;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
