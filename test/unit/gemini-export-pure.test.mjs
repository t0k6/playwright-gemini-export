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
import {
  applyRedactions,
  buildRedactRules,
  chunkIdBaseFromRelPath,
  splitTextByMaxBytes
} from "../../tools/lib/gemini-export-pure.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fakeRepoRoot = path.join(__dirname, "_fake_repo_root_marker");

/** `tools/gemini-export/default-config.mjs` の `generic-secret-assignment-unquoted` と同一 */
const GENERIC_SECRET_ASSIGNMENT_UNQUOTED_REGEX =
  "(?<!\\.)(?:\\b(api[_-]?key|token|secret|password|passwd|client[_-]?secret)\\b)\\s*([:=])\\s*(?!\\b(?:string|number|boolean|any|unknown|never|void|null|undefined|object|bigint|symbol)\\b)(?![A-Za-z_$][\\w$]*[.\\[])[^\\s\"'`\\n]{6,}";

const GENERIC_SECRET_ASSIGNMENT_QUOTED_REGEX =
  "\\b(api[_-]?key|token|secret|password|passwd|client[_-]?secret)\\b\\s*([:=])\\s*[\"'`]([^\"'`\\n]{6,})[\"'`]";

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
    describe("generic-secret-assignment-quoted (マスクする例)", () => {
      const quotedRules = buildRedactRules([
        {
          name: "generic-secret-assignment-quoted",
          regex: GENERIC_SECRET_ASSIGNMENT_QUOTED_REGEX,
          replacement: '$1$2"***REDACTED***"'
        }
      ]);

      it("トップレベル代入: const api_key = \"…\"（6文字以上）", () => {
        const input = 'const api_key = "verylongsecrethere";\n';
        const { text, redacted } = applyRedactions(input, quotedRules);
        assert.equal(redacted, true);
        assert.match(text, /\*\*\*REDACTED\*\*\*/);
        assert.doesNotMatch(text, /verylongsecrethere/);
      });

      it("プロパティチェーン代入でも文字列リテラルはマスク: this.account.password = \"…\"", () => {
        const input = 'this.account.password = "hardcodedSecretValue";\n';
        const { text, redacted } = applyRedactions(input, quotedRules);
        assert.equal(redacted, true);
        assert.doesNotMatch(text, /hardcodedSecretValue/);
      });
    });

    describe("generic-secret-assignment-unquoted（具体例: マスクしない）", () => {
      const unquotedRules = buildRedactRules([
        {
          name: "generic-secret-assignment-unquoted",
          regex: GENERIC_SECRET_ASSIGNMENT_UNQUOTED_REGEX,
          replacement: '$1$2"***REDACTED***"'
        }
      ]);

      const unchangedCases = [
        {
          title: "型注釈: async login(id: string, password: string)",
          line: "async login(id: string, password: string) {}\n"
        },
        {
          title: "オブジェクト + 環境変数参照: password: process.env.DB_PASSWORD",
          line: "const x = { password: process.env.DB_PASSWORD };\n"
        },
        {
          title: "代入 + 添字参照: this.password = record['password']",
          line: "this.password = record['password'];\n"
        },
        {
          title: "ネストプロパティ + 識別子右辺: this.account.password = initialPasswordForTest",
          line: "this.account.password = initialPasswordForTest;\n"
        },
        {
          title: "options.client_secret は . の直後なのでキーとして扱わない（誤爆防止）",
          line: "options.client_secret = someRefFromElsewhere;\n"
        }
      ];

      for (const { title, line } of unchangedCases) {
        it(title, () => {
          const { text, redacted } = applyRedactions(line, unquotedRules);
          assert.equal(redacted, false, title);
          assert.equal(text, line, title);
        });
      }
    });

    describe("generic-secret-assignment-unquoted（具体例: マスクする）", () => {
      const unquotedRules = buildRedactRules([
        {
          name: "generic-secret-assignment-unquoted",
          regex: GENERIC_SECRET_ASSIGNMENT_UNQUOTED_REGEX,
          replacement: '$1$2"***REDACTED***"'
        }
      ]);

      const redactCases = [
        {
          title: "オブジェクトリテラル + 未クォートトークン: password: supersecret123",
          line: "password: supersecret123\n",
          leaked: "supersecret123"
        },
        {
          title: "token: bareTokenValue123",
          line: "const row = { token: bareTokenValue123 };\n",
          leaked: "bareTokenValue123"
        },
        {
          title: "api_key: unquotedSecret123（キー直前が . でない）",
          line: "const row = { api_key: unquotedSecret123 };\n",
          leaked: "unquotedSecret123"
        }
      ];

      for (const { title, line, leaked } of redactCases) {
        it(title, () => {
          const { text, redacted } = applyRedactions(line, unquotedRules);
          assert.equal(redacted, true, title);
          assert.match(text, /\*\*\*REDACTED\*\*\*/, title);
          assert.doesNotMatch(text, new RegExp(leaked), title);
        });
      }
    });
  });

  describe("chunking helpers", () => {
    it("builds stable chunk id base from path", () => {
      assert.equal(
        chunkIdBaseFromRelPath("playwright/tests/auth/login.spec.ts"),
        "playwright__tests__auth__login.spec.ts"
      );
    });

    it("splits text by maxChunkBytes (line-based)", () => {
      const input = ["aaa", "bbb", "ccc", "ddd", "eee"].join("\n") + "\n";
      const chunks = splitTextByMaxBytes(input, { maxChunkBytes: 8 });
      assert.ok(chunks.length >= 2);
      assert.equal(chunks[0].index, 1);
      assert.equal(typeof chunks[0].text, "string");
    });
  });
});
