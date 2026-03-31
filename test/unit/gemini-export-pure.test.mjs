import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { deepMerge } from "../../tools/gemini-export/config.mjs";
import {
  assertSafeRelPath,
  assertWithinRepoRoot,
  normalizeRelPath,
  relPathHasParentSegment,
  uniqueNormalizedPaths
} from "../../tools/gemini-export/paths.mjs";
import { applyRedactions, buildRedactRules } from "../../tools/lib/gemini-export-pure.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fakeRepoRoot = path.join(__dirname, "_fake_repo_root_marker");

describe("gemini-export (paths + config re-exports, pure redact)", () => {
  describe("normalizeRelPath", () => {
    it("flattens separators and trims", () => {
      assert.equal(normalizeRelPath(`a${path.sep}b`), "a/b");
      assert.equal(normalizeRelPath("./src/foo/"), "src/foo");
    });
  });

  describe("relPathHasParentSegment", () => {
    it("detects .. segment", () => {
      assert.equal(relPathHasParentSegment("a/../b"), true);
      assert.equal(relPathHasParentSegment("a/b"), false);
    });
  });

  describe("uniqueNormalizedPaths", () => {
    it("dedupes after normalization", () => {
      assert.deepEqual(uniqueNormalizedPaths(["src", "./src/", "src"]), ["src"]);
    });
  });

  describe("assertSafeRelPath", () => {
    it("rejects parent escape", () => {
      assert.throws(
        () => assertSafeRelPath("../escape", fakeRepoRoot),
        /'\.\.' is not allowed/
      );
    });

    it("rejects absolute paths", () => {
      assert.throws(
        () => assertSafeRelPath("/etc/passwd", fakeRepoRoot),
        /absolute paths are not allowed/
      );
    });

    it("accepts in-repo relative path", () => {
      assertSafeRelPath("src/foo.ts", fakeRepoRoot);
    });
  });

  describe("assertWithinRepoRoot", () => {
    it("throws when path escapes repo root", () => {
      const outside = path.resolve(fakeRepoRoot, "..", "outside");
      assert.throws(
        () => assertWithinRepoRoot(outside, fakeRepoRoot, "outDir"),
        /escapes repoRoot/
      );
    });

    it("throws when disallowRepoRoot and path is repo root", () => {
      assert.throws(
        () =>
          assertWithinRepoRoot(fakeRepoRoot, fakeRepoRoot, "outDir", {
            disallowRepoRoot: true
          }),
        /must not be repoRoot/
      );
    });
  });

  describe("deepMerge", () => {
    it("concats arrays and dedupes string entries", () => {
      const a = { x: [1, 2], y: 1 };
      const b = { x: [2, 3], z: 2 };
      assert.deepEqual(deepMerge(a, b), { x: [1, 2, 3], y: 1, z: 2 });
    });

    it("merges nested objects", () => {
      const base = { a: { b: 1, c: 2 } };
      const over = { a: { c: 3 } };
      assert.deepEqual(deepMerge(base, over), { a: { b: 1, c: 3 } });
    });
  });

  describe("buildRedactRules and applyRedactions", () => {
    it("redacts quoted api_key assignment", () => {
      const rules = buildRedactRules([
        {
          name: "generic-secret-assignment-quoted",
          regex:
            "\\b(api[_-]?key|token|secret|password|passwd|client[_-]?secret)\\b\\s*([:=])\\s*[\"'`]([^\"'`\\n]{6,})[\"'`]",
          replacement: '$1$2"***REDACTED***"'
        }
      ]);
      const input = 'const api_key = "verylongsecrethere";\n';
      const { text, redacted } = applyRedactions(input, rules);
      assert.equal(redacted, true);
      assert.match(text, /\*\*\*REDACTED\*\*\*/);
      assert.doesNotMatch(text, /verylongsecrethere/);
    });

    it("does not redact TypeScript type annotations like password: string", () => {
      const rules = buildRedactRules([
        {
          name: "generic-secret-assignment-unquoted",
          regex:
            "\\b(api[_-]?key|token|secret|password|passwd|client[_-]?secret)\\b\\s*([:=])\\s*(?!\\b(?:string|number|boolean|any|unknown|never|void|null|undefined|object|bigint|symbol)\\b)[^\\s\"'`\\n]{6,}",
          replacement: '$1$2"***REDACTED***"'
        }
      ]);

      const input = "async login(id: string, password: string) {}\n";
      const { text, redacted } = applyRedactions(input, rules);
      assert.equal(redacted, false);
      assert.equal(text, input);
    });

    it("still redacts unquoted password assignments that look like secrets", () => {
      const rules = buildRedactRules([
        {
          name: "generic-secret-assignment-unquoted",
          regex:
            "\\b(api[_-]?key|token|secret|password|passwd|client[_-]?secret)\\b\\s*([:=])\\s*(?!\\b(?:string|number|boolean|any|unknown|never|void|null|undefined|object|bigint|symbol)\\b)[^\\s\"'`\\n]{6,}",
          replacement: '$1$2"***REDACTED***"'
        }
      ]);

      const input = "password: supersecret123\n";
      const { text, redacted } = applyRedactions(input, rules);
      assert.equal(redacted, true);
      assert.match(text, /\*\*\*REDACTED\*\*\*/);
      assert.doesNotMatch(text, /supersecret123/);
    });
  });
});
