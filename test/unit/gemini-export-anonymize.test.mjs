import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizeAnonymizeConfig,
  pseudonymizeValue,
  shouldAnonymize
} from "../../tools/gemini-export/anonymize.mjs";

describe("gemini-export anonymize", () => {
  describe("normalizeAnonymizeConfig", () => {
    it("returns disabled when anonymize is missing or not enabled", () => {
      assert.deepEqual(normalizeAnonymizeConfig(undefined), { enabled: false });
      assert.deepEqual(normalizeAnonymizeConfig({ enabled: false }), { enabled: false });
    });

    it("normalizes enabled config with keys and extensions", () => {
      const cfg = normalizeAnonymizeConfig({
        enabled: true,
        salt: "s",
        keys: ["email"],
        includeExtensions: [".JSON"],
        fixtureSandboxOnly: true
      });
      assert.equal(cfg.enabled, true);
      assert.equal(cfg.salt, "s");
      assert.equal(cfg.fixtureSandboxOnly, true);
      assert.ok(cfg.keys.has("email"));
      assert.ok(cfg.includeExtensions.has(".json"));
    });
  });

  describe("shouldAnonymize", () => {
    it("is false when disabled", () => {
      const cfg = { enabled: false };
      assert.equal(shouldAnonymize("fixtures/sandbox/x.json", ".json", cfg), false);
    });

    it("requires sandbox path when fixtureSandboxOnly", () => {
      const cfg = normalizeAnonymizeConfig({
        enabled: true,
        fixtureSandboxOnly: true,
        includeExtensions: [".json"]
      });
      assert.equal(shouldAnonymize("src/fixtures/sandbox/user.json", ".json", cfg), true);
      assert.equal(shouldAnonymize("src/auth/x.json", ".json", cfg), false);
    });

    it("allows any path when fixtureSandboxOnly is false", () => {
      const cfg = normalizeAnonymizeConfig({
        enabled: true,
        fixtureSandboxOnly: false,
        includeExtensions: [".json"]
      });
      assert.equal(shouldAnonymize("src/auth/x.json", ".json", cfg), true);
    });
  });

  describe("pseudonymizeValue", () => {
    it("is deterministic for same key, raw, salt", () => {
      const a = pseudonymizeValue("email", "alice@example.com", "fixed-salt");
      const b = pseudonymizeValue("email", "alice@example.com", "fixed-salt");
      assert.equal(a, b);
      assert.match(a, /^user-[0-9a-f]{8}@example\.test$/);
    });
  });
});
