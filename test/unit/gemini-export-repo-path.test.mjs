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

  it("resolveWithinRepo rejects symlink whose target is outside repoRoot", async (t) => {
    const base = await fs.mkdtemp(path.join(os.tmpdir(), "gemini-repo-sym-"));
    const repoRoot = path.join(base, "repo");
    const outside = path.join(base, "outside");
    await fs.mkdir(repoRoot, { recursive: true });
    await fs.mkdir(outside, { recursive: true });
    const targetFile = path.join(outside, "secret.txt");
    await fs.writeFile(targetFile, "x", "utf8");
    const linkPath = path.join(repoRoot, "link.txt");
    try {
      await fs.symlink(targetFile, linkPath);
    } catch (err) {
      t.skip(`symlink unavailable: ${String(err?.message ?? err)}`);
      await fs.rm(base, { recursive: true, force: true });
      return;
    }
    try {
      const res = await resolveWithinRepo(linkPath, repoRoot);
      assert.equal(res.ok, false);
      if (!res.ok) {
        assert.equal(res.skipTag, "[symlink-outside-repo]");
      }
    } finally {
      await fs.rm(base, { recursive: true, force: true });
    }
  });
});
