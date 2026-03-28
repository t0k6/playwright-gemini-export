import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  anonymizeStructuredText,
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

  describe("anonymizeStructuredText", () => {
    it("rewrites nested JSON keys per config", () => {
      const manifest = { warnings: [] };
      const cfg = normalizeAnonymizeConfig({
        enabled: true,
        salt: "t",
        keys: ["email"],
        includeExtensions: [".json"],
        fixtureSandboxOnly: false
      });
      const raw = JSON.stringify({ user: { email: "e@example.com" } }, null, 2);
      const res = anonymizeStructuredText("any.json", ".json", `${raw}\n`, cfg, manifest);
      assert.equal(res.didChange, true);
      assert.ok(res.fieldsChanged.includes("email"));
      assert.doesNotMatch(res.text, /e@example\.com/);
    });

    it("anonymizes YAML when yaml module resolves", () => {
      const manifest = { warnings: [] };
      const cfg = normalizeAnonymizeConfig({
        enabled: true,
        salt: "y",
        keys: ["email"],
        includeExtensions: [".yaml"],
        fixtureSandboxOnly: false
      });
      const res = anonymizeStructuredText(
        "fixtures/sandbox/cfg.yaml",
        ".yaml",
        "email: keep@example.com\n",
        cfg,
        manifest
      );
      assert.equal(res.didChange, true);
      assert.doesNotMatch(res.text, /keep@example\.com/);
    });
  });
});
