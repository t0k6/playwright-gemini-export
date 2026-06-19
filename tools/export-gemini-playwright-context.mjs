#!/usr/bin/env node
/**
 * @file Gemini / AI 向けコンテキスト export の CLI ランチャー。実装は `./gemini-export/` に分割している。
 * テスト向けの純粋関数は `./lib/gemini-export-pure.mjs` を参照。
 */

var MIN_NODE_MAJOR = 18;
var nodeMajor = Number(process.versions.node.split(".")[0]);

if (nodeMajor < MIN_NODE_MAJOR) {
  console.error(
    "Node.js " + MIN_NODE_MAJOR + " or newer is required (current: " + process.version + ")."
  );
  process.exit(1);
}

import("./gemini-export/cli.mjs")
  .then(function (mod) {
    return mod.runCli();
  })
  .catch(function (err) {
    console.error(err && err.message ? err.message : String(err));
    process.exit(1);
  });
