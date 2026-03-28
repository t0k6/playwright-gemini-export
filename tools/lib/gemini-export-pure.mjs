import path from "node:path";

export function assertWithinRepoRoot(
  absPath,
  repoRoot,
  label,
  { disallowRepoRoot = false } = {}
) {
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

/** True if absPath is under baseAbs (inclusive of base itself). */
export function isWithinBaseDir(absPath, baseAbs) {
  const abs = path.resolve(absPath);
  const base = path.resolve(baseAbs);
  const rel = path.relative(base, abs);
  return !rel.startsWith("..") && !path.isAbsolute(rel);
}

export function isWithinRepoRoot(absPath, repoRoot) {
  return isWithinBaseDir(absPath, repoRoot);
}

/** Reject normalized repo-relative paths that contain `..` segments (path traversal in manifest/output). */
export function relPathHasParentSegment(normalizedRel) {
  return normalizedRel.split("/").some((seg) => seg === "..");
}

export function relFromRepo(absPath, repoRoot) {
  return normalizeRelPath(path.relative(repoRoot, absPath));
}

export function normalizeExt(ext) {
  return ext.toLowerCase();
}

export function uniqueNormalizedPaths(paths) {
  return [...new Set(paths.map(normalizeRelPath))];
}

export function normalizeRelPath(p) {
  return p.split(path.sep).join("/").replace(/^\.\/+/, "").replace(/\/+$/, "");
}

export function assertSafeRelPath(p, repoRoot) {
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

export function matchesAny(value, regexes) {
  return regexes.some((r) => r.test(value));
}

export function deepMerge(base, override) {
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

export function buildRedactRules(redactTextPatterns) {
  return redactTextPatterns.map((r) => ({
    name: r.name,
    regex: new RegExp(r.regex, "gi"),
    replacement: r.replacement
  }));
}

export function applyRedactions(text, redactRules) {
  let t = text;
  let redacted = false;
  for (const rule of redactRules) {
    const next = t.replace(rule.regex, rule.replacement);
    if (next !== t) {
      redacted = true;
      t = next;
    }
  }
  return { text: t, redacted };
}
