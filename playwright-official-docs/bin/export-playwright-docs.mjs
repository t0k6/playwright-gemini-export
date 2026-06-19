#!/usr/bin/env node
/**
 * @file Playwright公式DocsエクスポートCLIランチャー。
 */

var MIN_NODE_MAJOR = 18;
var nodeMajor = Number(process.versions.node.split(".")[0]);

if (nodeMajor < MIN_NODE_MAJOR) {
  console.error(
    "Node.js " + MIN_NODE_MAJOR + " or newer is required (current: " + process.version + ")."
  );
  process.exit(1);
}

import("../src/cli.mjs")
  .then(function (mod) {
    return mod.runCli();
  })
  .catch(function (err) {
    console.error(err && err.message ? err.message : String(err));
    process.exit(1);
  });
