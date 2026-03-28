#!/usr/bin/env node
/**
 * @file Gemini / AI 向けコンテキスト export の CLI ランチャー。実装は `./gemini-export/` に分割している。
 * テスト向けの純粋関数は `./lib/gemini-export-pure.mjs` を参照。
 */

import { runCli } from "./gemini-export/cli.mjs";

runCli().catch((err) => {
  console.error(err);
  process.exit(1);
});
