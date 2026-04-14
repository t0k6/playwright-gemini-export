import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { writePackBundles } from "../../tools/gemini-export/pack-bundle.mjs";
import { buildYamlFrontmatter } from "../../tools/gemini-export/pack-chunk.mjs";

describe("pack-bundle", () => {
  it("writePackBundles writes grouped bundle file", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "pack-bundle-"));
    try {
      const packRoot = path.join(tmp, "_pack");
      const chunksDir = path.join(packRoot, "chunks");
      await fs.mkdir(chunksDir, { recursive: true });
      const fm = buildYamlFrontmatter({
        original_path: "tests/auth/a.spec.ts",
        chunk: "1/1",
        role: "spec",
        symbols: [],
        depends_on: []
      });
      await fs.writeFile(path.join(chunksDir, "a.md"), `${fm}\n\n\`\`\`ts\nx\n\`\`\`\n`, "utf8");

      await writePackBundles({
        packRootAbs: packRoot,
        chunkRecords: [
          {
            originalPath: "tests/auth/a.spec.ts",
            role: "spec",
            chunkRelPaths: ["chunks/a.md"]
          }
        ],
        packConfig: { bundleGroupDepth: 2 },
        checkOnly: false
      });

      const names = await fs.readdir(path.join(packRoot, "bundles"));
      const bundleName = names.find((n) => n.startsWith("bundle-tests-auth-spec"));
      assert.ok(bundleName, `expected bundle-tests-auth-spec*.md, got: ${names.join(",")}`);
      const text = await fs.readFile(path.join(packRoot, "bundles", bundleName), "utf8");
      assert.match(text, /tests\/auth\/a\.spec\.ts/);
      assert.match(text, /```ts/);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});
