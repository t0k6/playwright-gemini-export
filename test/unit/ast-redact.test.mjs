import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { redactByAst } from "../../tools/gemini-export/ast-redact.mjs";

describe("ast redaction", () => {
  it("keeps references on RHS (process.env)", () => {
    const input = "const x = { password: process.env.DB_PASSWORD };\n";
    const out = redactByAst(input, { filePath: "a.ts", keys: ["password"] });
    assert.equal(out.parseFailed, undefined);
    assert.equal(out.redacted, false);
    assert.equal(out.text, input);
  });

  it("keeps element access expressions on RHS (record['password'])", () => {
    const input = "this.password = record['password'];\n";
    const out = redactByAst(input, { filePath: "a.ts", keys: ["password"] });
    assert.equal(out.redacted, false);
    assert.equal(out.text, input);
  });

  it("keeps identifier RHS on nested property assignment", () => {
    const input = "this.account.password = initialPasswordForTest;\n";
    const out = redactByAst(input, { filePath: "a.ts", keys: ["password"] });
    assert.equal(out.redacted, false);
    assert.equal(out.text, input);
  });

  it("redacts string literal RHS in object literal property", () => {
    const input = "const x = { password: \"supersecret123\" };\n";
    const out = redactByAst(input, { filePath: "a.ts", keys: ["password"] });
    assert.equal(out.redacted, true);
    assert.match(out.text, /password:\s*"\*\*\*REDACTED\*\*\*"/);
    assert.doesNotMatch(out.text, /supersecret123/);
  });

  it("redacts string literal RHS in assignment expression", () => {
    const input = "this.account.password = \"supersecret123\";\n";
    const out = redactByAst(input, { filePath: "a.ts", keys: ["password"] });
    assert.equal(out.redacted, true);
    assert.doesNotMatch(out.text, /supersecret123/);
  });

  it("returns parseFailed on invalid input and does not change text", () => {
    const input = "const x = { password: ; }\n";
    const out = redactByAst(input, { filePath: "a.ts", keys: ["password"] });
    assert.equal(out.parseFailed, true);
    assert.equal(out.redacted, false);
    assert.equal(out.text, input);
  });
});

