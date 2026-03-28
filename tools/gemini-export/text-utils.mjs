/**
 * @file テキスト判定（バイナリ除外・機微値ヒューリスティック）とハッシュ。
 */

import crypto from "node:crypto";

/**
 * UTF-8 として扱えそうなバッファか（ヌル・制御文字比率で判定）。
 * @param {Buffer} buffer
 * @returns {boolean}
 */
export function looksLikeText(buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
  let suspicious = 0;
  for (const b of sample) {
    if (b === 0) return false;
    if (b < 7 || (b > 14 && b < 32)) suspicious++;
  }
  return suspicious / Math.max(sample.length, 1) < 0.05;
}

/**
 * パス名や本文から機微そうな内容を推測する（警告用、網羅ではない）。
 * @param {string} relPath
 * @param {string} text
 * @returns {boolean}
 */
export function looksSensitiveByHeuristic(relPath, text) {
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

/**
 * 文字列の SHA-256 16 進ダイジェスト。
 * @param {string} text
 * @returns {string}
 */
export function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}
