/**
 * @file リポジトリ相対パスの正規化・検証、パターン一致の再エクスポート。
 * 実装の単一ソースは `../lib/gemini-export-pure.mjs`（本モジュール経由で import すればテストと本番が同一コードになる）。
 * `repoRoot` は各 API の引数で受け取る。非同期の realpath／lstat 集約は `repo-path.mjs`。
 */

export {
  assertSafeRelPath,
  assertWithinRepoRoot,
  isWithinBaseDir,
  matchesAny,
  normalizeExt,
  normalizeRelPath,
  relFromRepo,
  relPathHasParentSegment,
  uniqueNormalizedPaths
} from "../lib/gemini-export-pure.mjs";
