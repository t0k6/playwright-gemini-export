import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  buildYamlFrontmatter,
  extractRelativeImports,
  extractSymbols,
  splitTextIntoLineChunks,
  stripYamlFrontmatter,
  writePackChunks
} from "../../tools/gemini-export/pack-chunk.mjs";

describe("pack-chunk", () => {
  it("splitTextIntoLineChunks splits by maxLines", () => {
    const text = "a\nb\nc\nd\ne\n";
    const parts = splitTextIntoLineChunks(text, 2);
    assert.equal(parts.length, 3);
    assert.ok(parts[0].includes("a"));
  });

  it("splitTextIntoLineChunks does not create empty tail chunk on terminal newline", () => {
    const text = "a\nb\n";
    const parts = splitTextIntoLineChunks(text, 2);
    assert.equal(parts.length, 1);
    assert.equal(parts[0], "a\nb");
  });

  it("extractSymbols finds describe and test", () => {
    const src = `describe("Login", () => {
  test('redirects', async () => {});
});`;
    const syms = extractSymbols(src);
    assert.ok(syms.some((s) => s.includes("describe")));
    assert.ok(syms.some((s) => s.includes("test")));
  });

  it("extractRelativeImports finds from './x' and from '../up'", () => {
    const src = `import x from './foo/bar';\nimport y from "../up";`;
    const im = extractRelativeImports(src);
    assert.ok(im.includes("./foo/bar"));
    assert.ok(im.includes("../up"));
  });

  it("writePackChunks uses dynamic code fence when content contains backticks", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "pack-chunk-fence-"));
    const readRootAbs = path.join(tmp, "in");
    const packRootAbs = path.join(tmp, "out");
    await fs.mkdir(path.join(readRootAbs, "src"), { recursive: true });

    const rel = "src/with-fence.ts";
    const srcAbs = path.join(readRootAbs, "src", "with-fence.ts");
    const content = [
      "export const x = 1;",
      "",
      "```",
      "inside triple backticks",
      "```",
      "",
      "````",
      "inside quadruple backticks",
      "````",
      ""
    ].join("\n");
    await fs.writeFile(srcAbs, content, "utf8");

    const records = await writePackChunks({
      readRootAbs,
      packRootAbs,
      packableRelPaths: [rel],
      packConfig: { chunkMaxLines: 300 },
      checkOnly: false
    });
    assert.equal(records.length, 1);
    assert.equal(records[0].chunkRelPaths.length, 1);

    const outAbs = path.join(packRootAbs, ...records[0].chunkRelPaths[0].split("/"));
    const md = await fs.readFile(outAbs, "utf8");

    const longestTickRun = Math.max(0, ...((content.match(/`{3,}/g) ?? []).map((m) => m.length)));
    assert.ok(longestTickRun >= 4);

    const openFence = md.split("\n").find((line) => /^`{3,}/.test(line));
    assert.ok(openFence, md);
    const fenceLen = (openFence.match(/^`+/) ?? [""])[0].length;
    assert.ok(fenceLen > longestTickRun, `expected fenceLen>${longestTickRun}, got ${fenceLen}`);

    assert.ok(md.includes("```"), "expected triple backticks preserved");
    assert.ok(md.includes("````"), "expected quadruple backticks preserved");

    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("buildYamlFrontmatter renders empty arrays as explicit []", () => {
    const y = buildYamlFrontmatter({
      original_path: "src/a.ts",
      chunk: "1/1",
      role: "other",
      symbols: [],
      depends_on: []
    });
    assert.match(y, /^symbols: \[\]$/m, y);
    assert.match(y, /^depends_on: \[\]$/m, y);
  });

  it("buildYamlFrontmatter produces valid block", () => {
    const y = buildYamlFrontmatter({
      original_path: "src/a.ts",
      chunk: "1/1",
      role: "other",
      symbols: ["a: b"],
      depends_on: ["./x"]
    });
    assert.match(y, /^---\n/);
    assert.match(y, /\n---$/);
    assert.ok(y.includes("original_path:"));
  });

  it("buildYamlFrontmatter quotes YAML-sensitive scalar values", () => {
    const y = buildYamlFrontmatter({
      original_path: "src/a.ts",
      chunk: "1/1",
      role: "other",
      symbols: ["#comment"],
      depends_on: ["x: y"]
    });
    assert.ok(y.includes('"#comment"'));
    assert.ok(y.includes('"x: y"'));
  });

  it("buildYamlFrontmatter quotes original_path with hash, colon, and spaces", () => {
    const y = buildYamlFrontmatter({
      original_path: "foo#bar/baz: qux.md",
      chunk_id: "id__001",
      kind: "spec"
    });
    assert.match(y, /^original_path: "/m);
    assert.ok(y.includes("foo#bar"));
    assert.ok(y.includes("baz: qux"));
  });

  it("stripYamlFrontmatter removes first frontmatter", () => {
    const md = "---\nrole: spec\n---\n\nbody\n";
    assert.equal(stripYamlFrontmatter(md), "body\n");
  });

  it("stripYamlFrontmatter does not strip when inner block lacks YAML-like keys", () => {
    const md = "---\nplain line\n---\n\nbody\n";
    assert.equal(stripYamlFrontmatter(md), md);
  });

  it("buildYamlFrontmatter escapes tab and CR in quoted scalars", () => {
    const y = buildYamlFrontmatter({
      original_path: "src/a.ts",
      chunk: "1/1",
      role: "other",
      symbols: ["a\tb\rc"]
    });
    // 配列要素1行: 先頭2スペース + "- " + 二重引用符で囲んだエスケープ済みスカラー（\t \r は YAML 上の二文字）
    assert.match(y, /^ {2}- "a\\tb\\rc"$/m, y);
  });
});
