/**
 * @file ユーザー設定とマージする既定の export 設定。
 * `.gemini-export.json` が無い場合や、配列キーは concat マージの左側として使われる。
 */

/** マージ対象の既定 export 設定オブジェクト。 */
export const defaultConfig = {
  sourcePaths: [],
  outDir: ".ai-context/playwright-gemini",
  includeExtensions: [
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".json",
    ".md",
    ".yml",
    ".yaml",
    ".txt",
    ".css",
    ".html"
  ],
  includeFiles: [
    "package.json",
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "tsconfig.json"
  ],
  excludeDirs: [
    ".git",
    "node_modules",
    "playwright-report",
    "test-results",
    "coverage",
    "dist",
    "build",
    ".next",
    ".turbo",
    ".cache"
  ],
  excludeFilePatterns: [
    "^\\.env($|\\.)",
    "\\.pem$",
    "\\.key$",
    "\\.p12$",
    "\\.crt$",
    "\\.cer$",
    "\\.der$",
    "\\.jks$",
    "\\.keystore$",
    "\\.sqlite$",
    "\\.db$",
    "\\.mp4$",
    "\\.webm$",
    "\\.zip$",
    "\\.gz$",
    "\\.png$",
    "\\.jpg$",
    "\\.jpeg$",
    "\\.gif$",
    "\\.svg$",
    "\\.pdf$",
    "\\.trace$",
    "\\.har$"
  ],
  excludePathPatterns: [
    "(^|/)fixtures/real(/|$)",
    "(^|/)fixtures/private(/|$)",
    "(^|/)auth(/|$)",
    "(^|/)storageState(/|$)",
    "(^|/)secrets?(/|$)",
    "(^|/)downloads?(/|$)"
  ],
  redactTextPatterns: [
    {
      name: "generic-secret-assignment-quoted",
      regex:
        "\\b(api[_-]?key|token|secret|password|passwd|client[_-]?secret)\\b\\s*([:=])\\s*[\"'`]([^\"'`\\n]{6,})[\"'`]",
      replacement: "$1$2\"***REDACTED***\""
    },
    {
      name: "generic-secret-assignment-unquoted",
      regex:
        "(?<!\\.)(?:\\b(api[_-]?key|token|secret|password|passwd|client[_-]?secret)\\b)\\s*([:=])\\s*(?!\\b(?:string|number|boolean|any|unknown|never|void|null|undefined|object|bigint|symbol)\\b)(?![A-Za-z_$][\\w$]*[.\\[])[^\\s\"'`\\n]{6,}",
      replacement: "$1$2\"***REDACTED***\""
    },
    {
      name: "generic-secret-assignment-backtick-multiline",
      regex:
        "\\b(api[_-]?key|token|secret|password|passwd|client[_-]?secret)\\b\\s*([:=])\\s*`[\\s\\S]{6,}?`",
      replacement: "$1$2\"***REDACTED***\""
    },
    {
      name: "bearer-token",
      regex: "bearer\\s+[a-z0-9\\-._~+/]+=*",
      replacement: "Bearer ***REDACTED***"
    },
    {
      name: "authorization-header-quoted",
      regex: "(authorization\\s*[:=]\\s*[\"'`])([^\"'`\\n]+)([\"'`])",
      replacement: "$1***REDACTED***$3"
    },
    {
      name: "authorization-header-unquoted",
      regex: "(authorization\\s*[:=]\\s*)([^\"'`\\n\\s]+)",
      replacement: "$1***REDACTED***"
    },
    {
      name: "url-query-tokens",
      regex: "([?&])(api[_-]?key|token|secret|password|passwd|client[_-]?secret)=([^&\\s\"'`]{6,})",
      replacement: "$1$2=***REDACTED***"
    }
  ],
  maxFileSizeBytes: 512 * 1024,
  generateAiReadme: true,
  failOnWarnings: false,
  anonymize: {
    enabled: true,
    salt: "playwright-gemini-export:v1",
    fixtureSandboxOnly: true,
    includeExtensions: [".json", ".yaml", ".yml"],
    keys: [
      "email",
      "phone",
      "name",
      "firstName",
      "lastName",
      "fullName",
      "address",
      "postalCode",
      "zip",
      "customerId",
      "accountId",
      "contractId"
    ]
  }
};
