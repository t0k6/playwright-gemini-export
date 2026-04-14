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

/**
 * Convert a repo-relative path to a stable chunk id base.
 * @param {string} relPath
 * @returns {string}
 */
export function chunkIdBaseFromRelPath(relPath) {
  return String(relPath).replace(/[\\/]/g, "__");
}

/**
 * Split text into chunks with an approximate UTF-8 byte cap.
 * Chunk boundaries are line-based to preserve readability.
 * @param {string} text
 * @param {{ maxChunkBytes: number }} opts
 * @returns {{ index: number, text: string }[]}
 */
export function splitTextByMaxBytes(text, { maxChunkBytes }) {
  const lines = String(text).split(/\r?\n/);
  const chunks = [];

  let buf = "";
  let bufBytes = 0;
  let idx = 1;

  /**
   * `s` の先頭から UTF-16 インデックスで見た最大 prefix で `Buffer.byteLength` が `maxChunkBytes` 以下になるものを返す。
   * 先頭コードポイントが `maxChunkBytes` より大きい場合は **空文字**（呼び出し側でバイト境界切りにフォールバック）。
   * @param {string} s
   * @returns {string}
   */
  const takePrefixWithinBytes = (s) => {
    if (s.length === 0) return "";
    // Quick path: whole string fits.
    if (Buffer.byteLength(s, "utf8") <= maxChunkBytes) return s;

    let lo = 0;
    let hi = s.length;
    let best = 0;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      const bytes = Buffer.byteLength(s.slice(0, mid), "utf8");
      if (bytes <= maxChunkBytes) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    while (best > 0 && Buffer.byteLength(s.slice(0, best), "utf8") > maxChunkBytes) {
      best--;
    }
    return s.slice(0, best);
  };

  const pushChunk = () => {
    const out = buf.replace(/\s+$/u, "");
    if (out.length === 0) return;
    chunks.push({ index: idx++, text: out + "\n" });
    buf = "";
    bufBytes = 0;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineWithNl = i === lines.length - 1 ? line : `${line}\n`;
    const lineBytes = Buffer.byteLength(lineWithNl, "utf8");

    if (bufBytes > 0 && bufBytes + lineBytes > maxChunkBytes) {
      pushChunk();
    }

    if (lineBytes > maxChunkBytes) {
      // Fall back to a hard split within a long line.
      let rest = lineWithNl;
      while (Buffer.byteLength(rest, "utf8") > maxChunkBytes) {
        let slice = takePrefixWithinBytes(rest);
        if (slice.length > 0) {
          chunks.push({ index: idx++, text: slice });
          rest = rest.slice(slice.length);
          continue;
        }
        const rb = Buffer.from(rest, "utf8");
        let cut = Math.min(maxChunkBytes, rb.length);
        while (cut > 0) {
          const part = rb.subarray(0, cut);
          const decoded = part.toString("utf8");
          if (Buffer.from(decoded, "utf8").equals(part)) {
            slice = decoded;
            break;
          }
          cut--;
        }
        if (slice.length === 0) {
          cut = 1;
          slice = rb.subarray(0, cut).toString("utf8");
        }
        chunks.push({ index: idx++, text: slice });
        rest = rb.subarray(cut).toString("utf8");
      }
      buf = rest;
      bufBytes = Buffer.byteLength(buf, "utf8");
      continue;
    }

    buf += lineWithNl;
    bufBytes += lineBytes;
  }

  pushChunk();
  return chunks;
}

/**
 * Best-effort kind classification for index output.
 * @param {string} relPath
 * @returns {string}
 */
export function guessFileKind(relPath) {
  const p = String(relPath).toLowerCase();
  if (/(^|\/)tests?\//.test(p) || /(\.|\/)(spec|test)\.(ts|tsx|js|jsx|mjs|cjs)$/.test(p)) return "spec";
  if (/(^|\/)pages?\//.test(p)) return "page";
  if (/(^|\/)helpers?\//.test(p) || /(^|\/)utils?\//.test(p)) return "helper";
  if (/(^|\/)fixtures?\//.test(p)) return "fixture";
  if (/playwright\.config\.(ts|js|mjs|cjs)$/.test(p) || /(^|\/)tsconfig\.json$/.test(p)) return "config";
  if (/\.(md|txt)$/.test(p)) return "doc";
  return "file";
}
