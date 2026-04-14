import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildYamlFrontmatter,
  extractRelativeImports,
  extractSymbols,
  splitTextIntoLineChunks,
  stripYamlFrontmatter
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
    assert.ok(y.includes("\\t"), y);
    assert.ok(y.includes("\\r"), y);
  });
});
