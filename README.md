# Playwright → Gemini Export Tool

Playwright の E2E テストコードを、安全に Gemini に渡すためのサニタイズエクスポートツール。

## 目的

- GitLab 上の本来のリポジトリは機密
- GitHub ミラーは禁止
- Google Workspace 上の Gemini / NotebookLM を活用したい
- そのため、AI に渡してよい最小限のコード断面だけを抽出する

## 特徴

- `sourcePaths` による allowlist 方式（基本はこれ）
- 典型的な危険ディレクトリや成果物の除外
- テキストベースの簡易 redaction
- fixtures/sandbox の構造化ファイル（JSON/YAML）の匿名化（決定的擬似化）
- AI 用 README 自動生成（`README_FOR_AI.md`）
- manifest 出力による人間レビュー
- sensitive っぽい内容への warning
- `--check`（dry-run）で「何が出るか」だけ確認可能

## 前提

Node.js 18 以上を推奨

## セットアップ

```bash
cp .gemini-export.example.json .gemini-export.json
```

必要に応じて `sourcePaths` を修正する。

## 実行

### 通常実行（書き込みあり）

```bash
npm run export:gemini:pw
```

### dry-run（書き込みなし）

```bash
node ./tools/export-gemini-playwright-context.mjs --check
```

## 出力先

```text
.ai-context/playwright-gemini/
```

このディレクトリを Gemini に渡す。

## 推奨設定

まずは `sourceDir` ではなく `sourcePaths` を使う（`sourceDir` は非対応）。

例:

```json
{
  "sourcePaths": [
    "playwright/tests",
    "playwright/pages",
    "playwright/helpers",
    "playwright/fixtures/sandbox",
    "playwright/playwright.config.ts",
    "playwright/AI_CONTEXT.md"
  ]
}
```

## AI 向け説明ファイル

- `playwright/AI_CONTEXT.md`: 人間がメンテするプロジェクト固有知識（テスト流儀・禁則・環境前提など）
- `README_FOR_AI.md`: ツールが生成する「この出力物の説明」

`templates/AI_CONTEXT.example.md` を起点に、対象リポジトリ側で `playwright/AI_CONTEXT.md` を用意する運用を推奨。

## 重要な注意

- redaction は補助。漏洩防止の本体は allowlist（`sourcePaths`）
- `fixtures/real` / `fixtures/private` / `auth` / `storageState` などは export しない（設定ミスは warning 扱い）
- `manifest.json` は毎回人間が確認する
- warning が出たら無視しない（必要なら `failOnWarnings: true`）

## 推奨運用

- `AI_CONTEXT.md` を人間が管理する
- fixture は sandbox / real を分離する
- 実際に Gemini に渡す前に出力物をレビューする
