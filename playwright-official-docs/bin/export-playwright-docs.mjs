#!/usr/bin/env node
/**
 * @file Playwright公式DocsエクスポートCLIランチャー。
 */

import { runCli } from "../src/cli.mjs";

runCli().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
