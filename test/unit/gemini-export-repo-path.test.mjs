import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { resolveWithinRepo } from "../../tools/gemini-export/repo-path.mjs";

describe("gemini-export repo-path", () => {
  it("resolveWithinRepo succeeds for a regular file under repoRoot", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "gemini-repo-path-"));
    try {
      const fileAbs = path.join(tmp, "note.txt");
      await fs.writeFile(fileAbs, "x", "utf8");
      const res = await resolveWithinRepo(fileAbs, tmp);
      assert.equal(res.ok, true);
      if (res.ok) {
        assert.match(res.realPath, /note\.txt$/);
      }
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it("resolveWithinRepo reports cannotStat for missing path", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "gemini-repo-path-"));
    try {
      const missing = path.join(tmp, "nope.txt");
      const res = await resolveWithinRepo(missing, tmp);
      assert.equal(res.ok, false);
      if (!res.ok) {
        assert.equal(res.cannotStat, true);
        assert.equal(res.skipTag, "[realpath-failed]");
      }
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});
