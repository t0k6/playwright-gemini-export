import ts from "typescript";

/**
 * @typedef {{ start: number, end: number, replacement: string }} TextEdit
 */

function isRedactableKeyText(keyText, keysLowerSet) {
  if (typeof keyText !== "string") return false;
  return keysLowerSet.has(keyText.toLowerCase());
}

function getKeyTextFromName(nameNode) {
  if (!nameNode) return null;
  if (ts.isIdentifier(nameNode)) return nameNode.text;
  if (ts.isStringLiteral(nameNode)) return nameNode.text;
  if (ts.isNumericLiteral(nameNode)) return nameNode.text;
  if (ts.isComputedPropertyName(nameNode)) {
    const e = nameNode.expression;
    if (ts.isStringLiteral(e)) return e.text;
    if (ts.isIdentifier(e)) return e.text;
  }
  // Keep it conservative; we only handle common static keys.
  return null;
}

function getKeyTextFromLhs(lhs) {
  if (ts.isPropertyAccessExpression(lhs)) {
    return lhs.name.text;
  }
  if (ts.isElementAccessExpression(lhs)) {
    const arg = lhs.argumentExpression;
    if (!arg) return null;
    if (ts.isStringLiteral(arg)) return arg.text;
    if (ts.isIdentifier(arg)) return arg.text;
  }
  return null;
}

function rhsReplacement(expr) {
  if (ts.isStringLiteral(expr)) return '"***REDACTED***"';
  if (ts.isNoSubstitutionTemplateLiteral(expr)) return "`***REDACTED***`";
  if (ts.isTemplateExpression(expr)) return "`***REDACTED***`";
  return null;
}

function applyEdits(text, edits) {
  if (edits.length === 0) return { text, didChange: false };
  const sorted = [...edits].sort((a, b) => b.start - a.start);
  let out = text;
  for (const e of sorted) {
    out = out.slice(0, e.start) + e.replacement + out.slice(e.end);
  }
  return { text: out, didChange: true };
}

/**
 * @param {string | undefined} filePath
 * @returns {ts.ScriptKind}
 */
function inferScriptKind(filePath) {
  if (!filePath) return ts.ScriptKind.TS;
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (lower.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (lower.endsWith(".js") || lower.endsWith(".mjs") || lower.endsWith(".cjs")) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

/**
 * `createSourceFile` は構文エラーでも例外を投げないため、診断でフォールバック要否を判定する。
 * @param {string} text
 * @param {string} fileName
 * @param {ts.ScriptKind} scriptKind
 */
function hasTranspileErrors(text, fileName, scriptKind) {
  const jsx =
    scriptKind === ts.ScriptKind.TSX || scriptKind === ts.ScriptKind.JSX ? { jsx: ts.JsxEmit.React } : {};
  const result = ts.transpileModule(text, {
    fileName,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.Latest,
      allowJs: true,
      ...jsx
    }
  });
  return (result.diagnostics ?? []).some((d) => d.category === ts.DiagnosticCategory.Error);
}

/**
 * AST-based redaction for common `password`-like keys.
 * - Redacts only when RHS is a literal (string or template literal).
 * - Keeps RHS when it's a reference/expression (identifier, member access, element access, call, etc.).
 *
 * @param {string} text
 * @param {{
 *   filePath?: string,
 *   keys?: string[],
 * }} [opts]
 * @returns {{ text: string, redacted: boolean, parseFailed?: boolean }}
 */
export function redactByAst(text, opts = {}) {
  const keys = opts.keys ?? ["password", "passwd", "secret", "token", "apiKey", "api_key", "clientSecret", "client_secret"];
  const keysLowerSet = new Set(keys.map((k) => k.toLowerCase()));

  /** @type {TextEdit[]} */
  const edits = [];

  try {
    const fileName = opts.filePath ?? "input.ts";
    const scriptKind = inferScriptKind(opts.filePath);
    if (hasTranspileErrors(text, fileName, scriptKind)) {
      return { text, redacted: false, parseFailed: true };
    }

    const sourceFile = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, /*setParentNodes*/ true, scriptKind);

    /** @param {ts.Node} node */
    const visit = (node) => {
      // Object literal: { password: "literal" }
      if (ts.isPropertyAssignment(node)) {
        const keyText = getKeyTextFromName(node.name);
        if (isRedactableKeyText(keyText, keysLowerSet)) {
          const rep = rhsReplacement(node.initializer);
          if (rep) {
            edits.push({ start: node.initializer.getStart(sourceFile), end: node.initializer.getEnd(), replacement: rep });
          }
        }
      }

      // Assignment: obj.password = "literal" or obj["password"] = "literal"
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
        const keyText = getKeyTextFromLhs(node.left);
        if (isRedactableKeyText(keyText, keysLowerSet)) {
          const rep = rhsReplacement(node.right);
          if (rep) {
            edits.push({ start: node.right.getStart(sourceFile), end: node.right.getEnd(), replacement: rep });
          }
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  } catch {
    return { text, redacted: false, parseFailed: true };
  }

  const applied = applyEdits(text, edits);
  return { text: applied.text, redacted: applied.didChange };
}

