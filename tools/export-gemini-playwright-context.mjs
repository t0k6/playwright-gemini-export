#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";

const repoRoot = process.cwd();
const configPath = path.join(repoRoot, ".gemini-export.json");

function assertWithinRepoRoot(absPath, label, { disallowRepoRoot = false } = {}) {
  const abs = path.resolve(absPath);
  const rootAbs = path.resolve(repoRoot);

  const rel = path.relative(rootAbs, abs);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`[SECURITY] ${label} escapes repoRoot: ${abs}`);
  }

  if (disallowRepoRoot) {
    const isRepoRoot = rel === "" || rel === ".";
    if (isRepoRoot) {
      throw new Error(`[SECURITY] ${label} must not be repoRoot: ${abs}`);
    }
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
  const redactRules = config.redactTextPatterns.map((r) => ({
    name: r.name,
    regex: new RegExp(r.regex, "gi"),
    replacement: r.replacement
  }));

  const effectiveSourcePaths = getEffectiveSourcePaths(config);
  manifest.sourcePaths = effectiveSourcePaths;

  const anonymizeConfig = normalizeAnonymizeConfig(config.anonymize);

  assertSafeRelPath(config.outDir);
  const outDirAbs = path.join(repoRoot, config.outDir);
  assertWithinRepoRoot(outDirAbs, "outDir", { disallowRepoRoot: true });
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
    assertSafeRelPath(p);
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
    const relFromRepoPath = normalizeRelPath(path.relative(repoRoot, abs));

    if (entry.isDirectory()) {
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

    if (!entry.isFile()) {
      manifest.skippedFiles.push(`${relFromRepoPath} [not regular file]`);
      continue;
    }

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
  let redacted = false;

  for (const rule of redactRules) {
    const next = text.replace(rule.regex, rule.replacement);
    if (next !== text) {
      redacted = true;
      text = next;
    }
  }

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

function normalizeExt(ext) {
  return ext.toLowerCase();
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

function uniqueNormalizedPaths(paths) {
  return [...new Set(paths.map(normalizeRelPath))];
}

function normalizeRelPath(p) {
  return p.split(path.sep).join("/").replace(/^\.\/+/, "").replace(/\/+$/, "");
}

function assertSafeRelPath(p) {
  if (typeof p !== "string" || p.length === 0) {
    throw new Error("sourcePaths entries must be non-empty strings.");
  }
  if (path.isAbsolute(p)) {
    throw new Error(`absolute paths are not allowed in sourcePaths: ${p}`);
  }

  const normalized = normalizeRelPath(p);
  if (normalized.includes("..")) {
    throw new Error(`'..' is not allowed in sourcePaths: ${p}`);
  }

  const resolved = path.resolve(repoRoot, normalized);
  const rootResolved = path.resolve(repoRoot);
  const rel = path.relative(rootResolved, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`sourcePath escapes repo root: ${p}`);
  }
}

function matchesAny(value, regexes) {
  return regexes.some((r) => r.test(value));
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

function deepMerge(base, override) {
  if (Array.isArray(base) && Array.isArray(override)) {
    const seen = new Set();
    const out = [];
    for (const item of [...base, ...override]) {
      const key = typeof item === "string" ? `s:${item}` : `j:${JSON.stringify(item)}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push(item);
      }
    }
    return out;
  }
  if (Array.isArray(base) || Array.isArray(override)) return override ?? base;
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
