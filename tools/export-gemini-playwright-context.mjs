#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import {
  assertSafeRelPath,
  assertWithinRepoRoot,
  applyRedactions,
  buildRedactRules,
  deepMerge,
  isWithinBaseDir,
  isWithinRepoRoot,
  matchesAny,
  normalizeExt,
  normalizeRelPath,
  relFromRepo,
  relPathHasParentSegment,
  uniqueNormalizedPaths
} from "./lib/gemini-export-pure.mjs";

const repoRoot = process.cwd();
const configPath = path.join(repoRoot, ".gemini-export.json");

async function tryRealpath(absPath) {
  try {
    const resolved = await fs.realpath(absPath);
    return { ok: true, path: resolved };
  } catch {
    return { ok: false };
  }
}

const defaultConfig = {
  sourcePaths: [],
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
    "\\.trace$",
    "\\.har$"
  ],
  excludePathPatterns: [
    "(^|/)fixtures/real(/|$)",
    "(^|/)fixtures/private(/|$)",
    "(^|/)auth(/|$)",
    "(^|/)storageState(/|$)",
    "(^|/)secrets?(/|$)",
    "(^|/)downloads?(/|$)"
  ],
  redactTextPatterns: [
    {
      name: "generic-secret-assignment-quoted",
      regex: "\\b(api[_-]?key|token|secret|password|passwd|client[_-]?secret)\\b\\s*([:=])\\s*[\"'`]([^\"'`\\n]{6,})[\"'`]",
      replacement: "$1$2\"***REDACTED***\""
    },
    {
      name: "generic-secret-assignment-unquoted",
      regex: "\\b(api[_-]?key|token|secret|password|passwd|client[_-]?secret)\\b\\s*([:=])\\s*[^\\s\"'`\\n]{6,}",
      replacement: "$1$2\"***REDACTED***\""
    },
    {
      name: "generic-secret-assignment-backtick-multiline",
      regex: "\\b(api[_-]?key|token|secret|password|passwd|client[_-]?secret)\\b\\s*([:=])\\s*`[\\s\\S]{6,}?`",
      replacement: "$1$2\"***REDACTED***\""
    },
    {
      name: "bearer-token",
      regex: "bearer\\s+[a-z0-9\\-._~+/]+=*",
      replacement: "Bearer ***REDACTED***"
    },
    {
      name: "authorization-header-quoted",
      regex: "(authorization\\s*[:=]\\s*[\"'`])([^\"'`\\n]+)([\"'`])",
      replacement: "$1***REDACTED***$3"
    },
    {
      name: "authorization-header-unquoted",
      regex: "(authorization\\s*[:=]\\s*)([^\"'`\\n\\s]+)",
      replacement: "$1***REDACTED***"
    },
    {
      name: "url-query-tokens",
      regex: "([?&])(api[_-]?key|token|secret|password|passwd|client[_-]?secret)=([^&\\s\"'`]{6,})",
      replacement: "$1$2=***REDACTED***"
    }
  ],
  maxFileSizeBytes: 512 * 1024,
  generateAiReadme: true,
  failOnWarnings: false,
  anonymize: {
    enabled: true,
    salt: "playwright-gemini-export:v1",
    fixtureSandboxOnly: true,
    includeExtensions: [".json", ".yaml", ".yml"],
    keys: [
      "email",
      "phone",
      "name",
      "firstName",
      "lastName",
      "fullName",
      "address",
      "postalCode",
      "zip",
      "customerId",
      "accountId",
      "contractId"
    ]
  }
};

async function main() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes("--check");
  if (args.includes("-h") || args.includes("--help")) {
    printHelp();
    return;
  }

  const { config, warnings: configWarnings } = await loadConfig();
  validateConfig(config);

  const manifest = {
    generatedAt: new Date().toISOString(),
    repoRoot,
    outDir: config.outDir,
    sourcePaths: [],
    dryRun: checkOnly,
    copiedFiles: [],
    skippedFiles: [],
    redactedFiles: [],
    anonymizedFiles: [],
    warnings: []
  };

  const staticNotices = [
    "[NOTICE] secrets は完全には検出できません。必ず `manifest.json` を人間が確認してください。",
    "[NOTICE] 設定の配列（例: `redactTextPatterns` / `excludeFilePatterns`）はデフォルトと結合されます。空配列でも既定が無効化されません。"
  ];
  const initialWarnings = [...configWarnings, ...staticNotices];
  manifest.warnings.push(...initialWarnings);
  for (const w of initialWarnings) console.warn(w);

  const includeExtSet = new Set(config.includeExtensions.map(normalizeExt));
  const excludeDirSet = new Set(config.excludeDirs);
  const excludeFileRegexes = config.excludeFilePatterns.map((p) => new RegExp(p, "i"));
  const excludePathRegexes = config.excludePathPatterns.map((p) => new RegExp(p, "i"));
  const redactRules = buildRedactRules(config.redactTextPatterns);

  const effectiveSourcePaths = getEffectiveSourcePaths(config);
  manifest.sourcePaths = effectiveSourcePaths;

  const anonymizeConfig = normalizeAnonymizeConfig(config.anonymize);

  assertSafeRelPath(config.outDir, repoRoot);
  const outDirAbs = path.join(repoRoot, config.outDir);
  assertWithinRepoRoot(outDirAbs, repoRoot, "outDir", { disallowRepoRoot: true });
  if (!checkOnly) {
    await cleanDir(outDirAbs);
    await fs.mkdir(outDirAbs, { recursive: true });
  }

  for (const relPath of effectiveSourcePaths) {
    if (matchesAny(relPath, excludePathRegexes)) {
      manifest.warnings.push(`sourcePath is excluded by pattern (config mistake?): ${relPath}`);
      manifest.skippedFiles.push(`${relPath} [excluded sourcePath]`);
      continue;
    }

    const absPath = path.join(repoRoot, relPath);
    if (!(await exists(absPath))) {
      manifest.warnings.push(`source path not found: ${relPath}`);
      continue;
    }

    const topLstat = await fs.lstat(absPath);
    const topIsSymlink = topLstat.isSymbolicLink();
    const topReal = await tryRealpath(absPath);
    if (!topReal.ok) {
      const tag = topIsSymlink ? "[symlink-outside-repo]" : "[realpath-failed]";
      manifest.warnings.push(`${tag} cannot resolve sourcePath: ${relPath}`);
      manifest.skippedFiles.push(`${relPath} ${tag}`);
      continue;
    }
    if (!isWithinRepoRoot(topReal.path, repoRoot)) {
      const tag = topIsSymlink ? "[symlink-outside-repo]" : "[path-outside-repo]";
      manifest.warnings.push(`${tag} sourcePath resolves outside repo: ${relPath}`);
      manifest.skippedFiles.push(`${relPath} ${tag}`);
      continue;
    }

    const st = await fs.stat(absPath);
    if (st.isDirectory()) {
      await walkAndCopy({
        currentAbs: absPath,
        outDirAbs,
        includeExtSet,
        excludeDirSet,
        excludeFileRegexes,
        excludePathRegexes,
        redactRules,
        maxFileSizeBytes: config.maxFileSizeBytes,
        manifest,
        checkOnly,
        anonymizeConfig
      });
      continue;
    }

    if (st.isFile()) {
      await copyOneFile({
        srcAbs: absPath,
        relSourcePath: relPath,
        outDirAbs,
        includeExtSet,
        excludeFileRegexes,
        excludePathRegexes,
        redactRules,
        maxFileSizeBytes: config.maxFileSizeBytes,
        manifest,
        checkOnly,
        anonymizeConfig
      });
      continue;
    }

    manifest.skippedFiles.push(`${relPath} [not file or directory]`);
  }

  for (const relPath of config.includeFiles) {
    const absPath = path.join(repoRoot, relPath);
    if (!(await exists(absPath))) continue;

    const incLstat = await fs.lstat(absPath);
    const incIsSymlink = incLstat.isSymbolicLink();
    const incReal = await tryRealpath(absPath);
    if (!incReal.ok) {
      const tag = incIsSymlink ? "[symlink-outside-repo]" : "[realpath-failed]";
      manifest.warnings.push(`${tag} cannot resolve includeFiles path: ${relPath}`);
      manifest.skippedFiles.push(`${relPath} ${tag}`);
      continue;
    }
    if (!isWithinRepoRoot(incReal.path, repoRoot)) {
      const tag = incIsSymlink ? "[symlink-outside-repo]" : "[path-outside-repo]";
      manifest.warnings.push(`${tag} includeFiles path resolves outside repo: ${relPath}`);
      manifest.skippedFiles.push(`${relPath} ${tag}`);
      continue;
    }

    await copyOneFile({
      srcAbs: absPath,
      relSourcePath: relPath,
      outDirAbs,
      includeExtSet,
      excludeFileRegexes,
      excludePathRegexes,
      redactRules,
      maxFileSizeBytes: config.maxFileSizeBytes,
      manifest,
      checkOnly,
      anonymizeConfig,
      isExplicitIncludeFile: true
    });
  }

  if (config.generateAiReadme && !checkOnly) {
    const readmePath = path.join(outDirAbs, "README_FOR_AI.md");
    await fs.writeFile(readmePath, buildAiReadme(manifest), "utf8");
    manifest.copiedFiles.push("README_FOR_AI.md");
  }

  const stats = {
    copiedCount: manifest.copiedFiles.length,
    skippedCount: manifest.skippedFiles.length,
    redactedCount: manifest.redactedFiles.length,
    anonymizedCount: manifest.anonymizedFiles.length,
    warningsCount: manifest.warnings.length
  };

  if (!checkOnly) {
    const manifestPath = path.join(outDirAbs, "manifest.json");
    await fs.writeFile(manifestPath, JSON.stringify({ ...manifest, stats }, null, 2), "utf8");
  }

  printSummary(config, manifest, stats);

  if (config.failOnWarnings && manifest.warnings.length > 0) {
    process.exitCode = 2;
  }
}

function printHelp() {
  console.log(`playwright-gemini-export

Usage:
  node ./tools/export-gemini-playwright-context.mjs [--check]

Options:
  --check   dry-run (no outDir creation, no file writes)
  --help    show this help
`);
}

async function loadConfig() {
  if (!(await exists(configPath))) return { config: defaultConfig, warnings: [] };
  const raw = await fs.readFile(configPath, "utf8");
  const userConfig = JSON.parse(raw);

  const warnings = [];
  for (const key of [
    "excludeFilePatterns",
    "excludePathPatterns",
    "redactTextPatterns",
    "excludeDirs",
    "includeExtensions",
    "includeFiles"
  ]) {
    if (
      Object.prototype.hasOwnProperty.call(userConfig, key) &&
      Array.isArray(userConfig[key]) &&
      userConfig[key].length === 0
    ) {
      warnings.push(
        `[NOTICE] ${key} を空配列にしてもデフォルトは維持されます（安全のため既定は concat マージします）。`
      );
    }
  }

  return { config: deepMerge(defaultConfig, userConfig), warnings };
}

function validateConfig(config) {
  if (!config.outDir || typeof config.outDir !== "string") {
    throw new Error("outDir is required.");
  }
  if (!Array.isArray(config.sourcePaths) || config.sourcePaths.length === 0) {
    throw new Error(
      "sourcePaths must be a non-empty array. Create .gemini-export.json (e.g. copy .gemini-export.example.json) and set sourcePaths."
    );
  }
  for (const p of config.sourcePaths) {
    assertSafeRelPath(p, repoRoot);
  }
  if (Array.isArray(config.includeFiles)) {
    for (const p of config.includeFiles) {
      assertSafeRelPath(p, repoRoot);
    }
  }
}

function getEffectiveSourcePaths(config) {
  return uniqueNormalizedPaths(config.sourcePaths);
}

async function walkAndCopy({
  currentAbs,
  outDirAbs,
  includeExtSet,
  excludeDirSet,
  excludeFileRegexes,
  excludePathRegexes,
  redactRules,
  maxFileSizeBytes,
  manifest,
  checkOnly,
  anonymizeConfig
}) {
  const entries = await fs.readdir(currentAbs, { withFileTypes: true });

  for (const entry of entries) {
    const abs = path.join(currentAbs, entry.name);
    let lstat;
    try {
      lstat = await fs.lstat(abs);
    } catch {
      const relGuess = relFromRepo(abs, repoRoot);
      manifest.warnings.push(`[realpath-failed] cannot stat path: ${relGuess}`);
      manifest.skippedFiles.push(`${relGuess} [realpath-failed]`);
      continue;
    }
    const isSymlink = lstat.isSymbolicLink();

    const realResult = await tryRealpath(abs);
    if (!realResult.ok) {
      const tag = isSymlink ? "[symlink-outside-repo]" : "[realpath-failed]";
      const relFromRepoPath = relFromRepo(abs, repoRoot);
      manifest.warnings.push(`${tag} cannot resolve path: ${relFromRepoPath}`);
      manifest.skippedFiles.push(`${relFromRepoPath} ${tag}`);
      continue;
    }
    if (!isWithinRepoRoot(realResult.path, repoRoot)) {
      const tag = isSymlink ? "[symlink-outside-repo]" : "[path-outside-repo]";
      const relFromRepoPath = relFromRepo(abs, repoRoot);
      manifest.warnings.push(`${tag} resolves outside repo: ${relFromRepoPath}`);
      manifest.skippedFiles.push(`${relFromRepoPath} ${tag}`);
      continue;
    }

    const relFromRepoPath = relFromRepo(abs, repoRoot);
    if (relPathHasParentSegment(relFromRepoPath)) {
      manifest.warnings.push(`[unsafe-relative-path] path has parent segments: ${relFromRepoPath}`);
      manifest.skippedFiles.push(`${relFromRepoPath} [unsafe-relative-path]`);
      continue;
    }

    let stTarget;
    try {
      stTarget = await fs.stat(realResult.path);
    } catch {
      manifest.warnings.push(`[realpath-failed] cannot stat resolved path: ${relFromRepoPath}`);
      manifest.skippedFiles.push(`${relFromRepoPath} [realpath-failed]`);
      continue;
    }

    if (stTarget.isDirectory()) {
      if (excludeDirSet.has(entry.name)) {
        manifest.skippedFiles.push(`${relFromRepoPath}/ [excluded dir]`);
        continue;
      }
      if (matchesAny(relFromRepoPath, excludePathRegexes)) {
        manifest.skippedFiles.push(`${relFromRepoPath}/ [excluded path pattern]`);
        continue;
      }
      await walkAndCopy({
        currentAbs: abs,
        outDirAbs,
        includeExtSet,
        excludeDirSet,
        excludeFileRegexes,
        excludePathRegexes,
        redactRules,
        maxFileSizeBytes,
        manifest,
        checkOnly,
        anonymizeConfig
      });
      continue;
    }

    if (stTarget.isFile()) {
      await copyOneFile({
        srcAbs: abs,
        relSourcePath: relFromRepoPath,
        outDirAbs,
        includeExtSet,
        excludeFileRegexes,
        excludePathRegexes,
        redactRules,
        maxFileSizeBytes,
        manifest,
        checkOnly,
        anonymizeConfig
      });
      continue;
    }

    manifest.skippedFiles.push(`${relFromRepoPath} [not regular file]`);
  }
}

async function copyOneFile({
  srcAbs,
  relSourcePath,
  outDirAbs,
  includeExtSet,
  excludeFileRegexes,
  excludePathRegexes,
  redactRules,
  maxFileSizeBytes,
  manifest,
  checkOnly,
  anonymizeConfig,
  isExplicitIncludeFile = false
}) {
  const normalizedRel = normalizeRelPath(relSourcePath);
  const basename = path.basename(normalizedRel);
  const ext = normalizeExt(path.extname(normalizedRel));

  if (relPathHasParentSegment(normalizedRel)) {
    manifest.warnings.push(`[unsafe-relative-path] export path has parent segments: ${normalizedRel}`);
    manifest.skippedFiles.push(`${normalizedRel} [unsafe-relative-path]`);
    return;
  }

  const destAbsPreview = path.join(outDirAbs, normalizedRel);
  if (!isWithinBaseDir(destAbsPreview, outDirAbs)) {
    manifest.warnings.push(`[dest-outside-outDir] refused export path: ${normalizedRel}`);
    manifest.skippedFiles.push(`${normalizedRel} [dest-outside-outDir]`);
    return;
  }

  if (matchesAny(normalizedRel, excludePathRegexes)) {
    manifest.skippedFiles.push(`${normalizedRel} [excluded path pattern]`);
    return;
  }

  if (matchesAny(basename, excludeFileRegexes) || matchesAny(normalizedRel, excludeFileRegexes)) {
    manifest.skippedFiles.push(`${normalizedRel} [excluded file pattern]`);
    return;
  }

  if (!isExplicitIncludeFile && !includeExtSet.has(ext)) {
    manifest.skippedFiles.push(`${normalizedRel} [extension not included]`);
    return;
  }

  let srcLstat;
  try {
    srcLstat = await fs.lstat(srcAbs);
  } catch {
    manifest.warnings.push(`[realpath-failed] cannot stat source: ${normalizedRel}`);
    manifest.skippedFiles.push(`${normalizedRel} [realpath-failed]`);
    return;
  }
  const srcIsSymlink = srcLstat.isSymbolicLink();
  const srcReal = await tryRealpath(srcAbs);
  if (!srcReal.ok) {
    const tag = srcIsSymlink ? "[symlink-outside-repo]" : "[realpath-failed]";
    manifest.warnings.push(`${tag} cannot resolve source: ${normalizedRel}`);
    manifest.skippedFiles.push(`${normalizedRel} ${tag}`);
    return;
  }
  if (!isWithinRepoRoot(srcReal.path, repoRoot)) {
    const tag = srcIsSymlink ? "[symlink-outside-repo]" : "[path-outside-repo]";
    manifest.warnings.push(`${tag} source resolves outside repo: ${normalizedRel}`);
    manifest.skippedFiles.push(`${normalizedRel} ${tag}`);
    return;
  }

  const stat = await fs.stat(srcAbs);
  if (stat.size > maxFileSizeBytes) {
    manifest.skippedFiles.push(`${normalizedRel} [too large: ${stat.size} bytes]`);
    return;
  }

  const raw = await fs.readFile(srcAbs);

  if (!looksLikeText(raw)) {
    manifest.skippedFiles.push(`${normalizedRel} [binary or non-text]`);
    return;
  }

  let text = raw.toString("utf8");
  const warningsBefore = manifest.warnings.length;

  if (looksSensitiveByHeuristic(normalizedRel, text)) {
    manifest.warnings.push(`possible sensitive content: ${normalizedRel}`);
  }

  const originalHash = sha256(text);
  const { text: afterRedact, redacted } = applyRedactions(text, redactRules);
  text = afterRedact;
  const afterRedactHash = sha256(text);

  let anonymized = false;
  let anonymizedFields = [];
  if (shouldAnonymize(normalizedRel, ext, anonymizeConfig)) {
    const beforeHash = afterRedactHash;
    const result = anonymizeStructuredText(normalizedRel, ext, text, anonymizeConfig, manifest);
    if (result.didChange) {
      anonymized = true;
      anonymizedFields = result.fieldsChanged;
      text = result.text;
    }
    if (anonymized) {
      manifest.anonymizedFiles.push({
        file: normalizedRel,
        fieldsChanged: anonymizedFields,
        beforeSha256: beforeHash,
        afterSha256: sha256(text)
      });
    }
  }

  if (!checkOnly) {
    const destAbs = path.join(outDirAbs, normalizedRel);
    if (!isWithinBaseDir(destAbs, outDirAbs)) {
      manifest.warnings.push(`[dest-outside-outDir] refused write at copy time: ${normalizedRel}`);
      manifest.skippedFiles.push(`${normalizedRel} [dest-outside-outDir]`);
      return;
    }
    await fs.mkdir(path.dirname(destAbs), { recursive: true });
    await fs.writeFile(destAbs, text, "utf8");
  }

  manifest.copiedFiles.push(normalizedRel);

  if (redacted) {
    manifest.redactedFiles.push({
      file: normalizedRel,
      beforeSha256: originalHash,
      afterSha256: afterRedactHash
    });
  }

  if (manifest.warnings.length > warningsBefore) {
    // warning already appended
  }
}

function looksSensitiveByHeuristic(relPath, text) {
  const lowerPath = relPath.toLowerCase();
  if (
    lowerPath.includes("storage") ||
    lowerPath.includes("auth") ||
    lowerPath.includes("secret") ||
    lowerPath.includes("credential")
  ) {
    return true;
  }

  const patterns = [
    /\bAKIA[0-9A-Z]{16}\b/,
    /\bAIza[0-9A-Za-z\-_]{20,}\b/,
    /\bghp_[0-9A-Za-z]{20,}\b/,
    /\bglpat-[0-9A-Za-z\-_]{20,}\b/,
    /\beyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9._-]{10,}\.[a-zA-Z0-9._-]{10,}\b/,
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
    /\b\d{2,4}[- ]?\d{2,4}[- ]?\d{3,4}\b/
  ];

  return patterns.some((r) => r.test(text));
}

function buildAiReadme(manifest) {
  return `# README_FOR_AI

## Purpose
This export is a sanitized subset of a Playwright E2E test codebase for AI-assisted work.

## Included scope
${manifest.sourcePaths.map((p) => `- \`${p}\``).join("\n")}

## Important constraints
- Some files and directories are intentionally excluded
- Sensitive-looking values may be redacted as \`***REDACTED***\`
- Missing files should not be assumed absent from the original repository
- Prefer minimal, convention-preserving changes

## Recommended AI behavior
- infer coding conventions from existing tests and helpers
- reuse fixtures, helpers, and page objects where possible
- avoid brittle locators and arbitrary waits
- state uncertainty when necessary files appear to be omitted

## Export summary
- copiedFiles: ${manifest.copiedFiles.length}
- redactedFiles: ${manifest.redactedFiles.length}
- anonymizedFiles: ${manifest.anonymizedFiles.length}
- skippedFiles: ${manifest.skippedFiles.length}
- warnings: ${manifest.warnings.length}
`;
}

async function cleanDir(dir) {
  await fs.rm(dir, { recursive: true, force: true });
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

function looksLikeText(buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
  let suspicious = 0;
  for (const b of sample) {
    if (b === 0) return false;
    if (b < 7 || (b > 14 && b < 32)) suspicious++;
  }
  return suspicious / Math.max(sample.length, 1) < 0.05;
}

function normalizeAnonymizeConfig(anonymize) {
  if (!anonymize || anonymize.enabled !== true) {
    return { enabled: false };
  }
  const salt = typeof anonymize.salt === "string" ? anonymize.salt : "playwright-gemini-export:v1";
  const includeExtensions = Array.isArray(anonymize.includeExtensions)
    ? anonymize.includeExtensions.map(normalizeExt)
    : [".json", ".yaml", ".yml"];
  const keys = new Set(
    Array.isArray(anonymize.keys) ? anonymize.keys.map((k) => String(k)) : []
  );
  return {
    enabled: true,
    salt,
    includeExtensions: new Set(includeExtensions),
    keys,
    fixtureSandboxOnly: anonymize.fixtureSandboxOnly !== false
  };
}

function shouldAnonymize(relPath, ext, anonymizeConfig) {
  if (!anonymizeConfig?.enabled) return false;
  if (!anonymizeConfig.includeExtensions?.has(ext)) return false;
  if (anonymizeConfig.fixtureSandboxOnly) {
    return /(^|\/)fixtures\/sandbox\//i.test(relPath);
  }
  return true;
}

function anonymizeStructuredText(relPath, ext, text, anonymizeConfig, manifest) {
  try {
    if (ext === ".json") {
      const data = JSON.parse(text);
      const { changed, fieldsChanged, value } = anonymizeObject(data, anonymizeConfig);
      if (!changed) return { didChange: false, fieldsChanged: [], text };
      return { didChange: true, fieldsChanged, text: JSON.stringify(value, null, 2) + "\n" };
    }

    if (ext === ".yaml" || ext === ".yml") {
      const YAML = getYamlModule(manifest);
      if (!YAML) return { didChange: false, fieldsChanged: [], text };

      const doc = YAML.parseDocument(text);
      const data = doc.toJSON();
      const { changed, fieldsChanged, value } = anonymizeObject(data, anonymizeConfig);
      if (!changed) return { didChange: false, fieldsChanged: [], text };
      return { didChange: true, fieldsChanged, text: YAML.stringify(value) };
    }
  } catch (e) {
    manifest.warnings.push(`anonymize parse failed (skipped anonymize): ${relPath} (${String(e?.message ?? e)})`);
    return { didChange: false, fieldsChanged: [], text };
  }

  return { didChange: false, fieldsChanged: [], text };
}

function anonymizeObject(value, anonymizeConfig, fieldsChanged = new Set()) {
  if (Array.isArray(value)) {
    let changed = false;
    const out = value.map((v) => {
      const res = anonymizeObject(v, anonymizeConfig, fieldsChanged);
      if (res.changed) changed = true;
      return res.value;
    });
    return { changed, fieldsChanged: [...fieldsChanged], value: out };
  }

  if (value && typeof value === "object") {
    let changed = false;
    const out = { ...value };
    for (const [k, v] of Object.entries(value)) {
      if (typeof v === "string" && anonymizeConfig.keys.has(k)) {
        const next = pseudonymizeValue(k, v, anonymizeConfig.salt);
        if (next !== v) {
          out[k] = next;
          changed = true;
          fieldsChanged.add(k);
        }
        continue;
      }
      const res = anonymizeObject(v, anonymizeConfig, fieldsChanged);
      if (res.changed) changed = true;
      out[k] = res.value;
    }
    return { changed, fieldsChanged: [...fieldsChanged], value: out };
  }

  return { changed: false, fieldsChanged: [...fieldsChanged], value };
}

function pseudonymizeValue(key, raw, salt) {
  const h = crypto.createHash("sha256").update(`${salt}\0${key}\0${raw}`).digest("hex");

  if (key === "email") {
    return `user-${h.slice(0, 8)}@example.test`;
  }
  if (key === "phone") {
    const digits = h.replace(/[^0-9]/g, "").padEnd(10, "0").slice(0, 10);
    return `000-${digits.slice(0, 3)}-${digits.slice(3, 7)}`;
  }
  if (key === "postalCode" || key === "zip") {
    return `${h.slice(0, 3)}-${h.slice(3, 7)}`.replace(/[^0-9-]/g, "0");
  }
  if (key === "firstName" || key === "lastName" || key === "name" || key === "fullName") {
    return `User-${h.slice(0, 6)}`;
  }
  if (key === "address") {
    return `Anon-Address-${h.slice(0, 6)}`;
  }

  return `ANON-${h.slice(0, 10).toUpperCase()}`;
}

function printSummary(config, manifest, stats) {
  console.log(checkTitle(manifest.dryRun));
  if (!manifest.dryRun) {
    console.log(`Output: ${config.outDir}`);
  } else {
    console.log(`Output: (dry-run, no files written)`);
  }
  console.log(`Copied: ${stats.copiedCount}`);
  console.log(`Redacted: ${stats.redactedCount}`);
  console.log(`Anonymized: ${stats.anonymizedCount}`);
  console.log(`Skipped: ${stats.skippedCount}`);
  console.log(`Warnings: ${stats.warningsCount}`);

  if (manifest.warnings.length > 0) {
    console.log("\nWarnings:");
    for (const w of manifest.warnings) {
      console.log(`- ${w}`);
    }
  }
}

function checkTitle(dryRun) {
  return dryRun ? "Check completed." : "Export completed.";
}

let yamlModuleCache = undefined;
function getYamlModule(manifest) {
  if (yamlModuleCache !== undefined) return yamlModuleCache;
  try {
    const require = createRequire(import.meta.url);
    yamlModuleCache = require("yaml");
    return yamlModuleCache;
  } catch {
    // ESM-only environment: try dynamic import via createRequire not available here.
    // If yaml isn't available, skip YAML anonymization safely.
    manifest.warnings.push("yaml module not found; YAML anonymization is skipped");
    yamlModuleCache = null;
    return null;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
