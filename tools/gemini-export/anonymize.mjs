/**
 * @file JSON/YAML の構造化匿名化と設定の正規化。
 */

import crypto from "node:crypto";
import { createRequire } from "node:module";

import { normalizeExt } from "./paths.mjs";

/** @type {unknown} */
let yamlModuleCache = undefined;

/**
 * 依存パッケージ `yaml` を一度だけ読み込む。無ければ警告を manifest に追加して null。
 * @param {{ warnings: string[] }} manifest
 * @returns {unknown | null}
 */
export function getYamlModule(manifest) {
  if (yamlModuleCache !== undefined) return yamlModuleCache;
  try {
    const require = createRequire(import.meta.url);
    yamlModuleCache = require("yaml");
    return yamlModuleCache;
  } catch {
    manifest.warnings.push("yaml module not found; YAML anonymization is skipped");
    yamlModuleCache = null;
    return null;
  }
}

/**
 * 設定オブジェクトを実行時用の形（Set 等）に正規化する。
 * @param {{ enabled?: boolean, salt?: string, includeExtensions?: string[], keys?: string[], fixtureSandboxOnly?: boolean } | undefined} anonymize
 * @returns {object}
 */
export function normalizeAnonymizeConfig(anonymize) {
  if (!anonymize || anonymize.enabled !== true) {
    return { enabled: false };
  }
  const salt = typeof anonymize.salt === "string" ? anonymize.salt : "playwright-gemini-export:v1";
  const includeExtensions = Array.isArray(anonymize.includeExtensions)
    ? anonymize.includeExtensions.map(normalizeExt)
    : [".json", ".yaml", ".yml"];
  const keys = new Set(Array.isArray(anonymize.keys) ? anonymize.keys.map((k) => String(k)) : []);
  return {
    enabled: true,
    salt,
    includeExtensions: new Set(includeExtensions),
    keys,
    fixtureSandboxOnly: anonymize.fixtureSandboxOnly !== false
  };
}

/**
 * このファイルで匿名化を試みるか。
 * @param {string} relPath
 * @param {string} ext
 * @param {ReturnType<typeof normalizeAnonymizeConfig>} anonymizeConfig
 * @returns {boolean}
 */
export function shouldAnonymize(relPath, ext, anonymizeConfig) {
  if (!anonymizeConfig?.enabled) return false;
  if (!anonymizeConfig.includeExtensions?.has(ext)) return false;
  if (anonymizeConfig.fixtureSandboxOnly) {
    return /(^|\/)fixtures\/sandbox\//i.test(relPath);
  }
  return true;
}

/**
 * JSON/YAML テキストをパースし、キーに応じて値を置換する。
 * @param {string} relPath
 * @param {string} ext
 * @param {string} text
 * @param {Exclude<ReturnType<typeof normalizeAnonymizeConfig>, { enabled: false }>} anonymizeConfig
 * @param {{ warnings: string[] }} manifest
 * @returns {{ didChange: boolean, fieldsChanged: string[], text: string }}
 */
export function anonymizeStructuredText(relPath, ext, text, anonymizeConfig, manifest) {
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

/**
 * オブジェクトツリーを再帰走査し、設定キーに一致する文字列だけを置換する。
 * @param {unknown} value
 * @param {Exclude<ReturnType<typeof normalizeAnonymizeConfig>, { enabled: false }>} anonymizeConfig
 * @param {Set<string>} [fieldsChanged]
 * @returns {{ changed: boolean, fieldsChanged: string[], value: unknown }}
 */
export function anonymizeObject(value, anonymizeConfig, fieldsChanged = new Set()) {
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

/**
 * キー種別に応じた擬似値を生成する。
 * @param {string} key
 * @param {string} raw
 * @param {string} salt
 * @returns {string}
 */
export function pseudonymizeValue(key, raw, salt) {
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
