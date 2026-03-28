import { defineConfig } from "eslint/config";
import js from "@eslint/js";
import json from "@eslint/json";
import globals from "globals";

export default defineConfig([
  {
    ignores: [
      "node_modules/**",
      ".ai-context/**",
      ".cursor/**",
      "**/package-lock.json",
    ],
  },
  {
    files: ["tools/**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: globals.node,
    },
  },
  {
    files: ["tools/**/*.mjs"],
    ...js.configs.recommended,
  },
  {
    files: ["**/*.json"],
    plugins: { json },
    language: "json/json",
    extends: ["json/recommended"],
  },
]);
