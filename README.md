# Playwright → Gemini Export Tool

PlaywrightのE2Eテストコードを、安全にGeminiに渡すためのサニタイズエクスポートツール。

## 目的

- プロジェクトのgitリポジトリは機密
- GitHubミラーは禁止
- Google Workspace上のGemini/NotebookLMを活用したい
- そのため、AIに渡してよい最小限のコード断面だけを抽出する

## 特徴

- `sourcePaths`によるallowlist方式（基本）
- 典型的な危険ディレクトリや成果物の除外
- テキストベースの簡易redaction
- fixtures/sandboxの構造化ファイル（JSON/YAML）の匿名化（決定的擬似化）
- AI用README自動生成（`README_FOR_AI.md`）
- manifest出力による人間レビュー
- sensitiveっぽい内容へのwarning
- `--check`（dry-run）で「何が出るか」だけ確認可能

## 前提

Node.js 18以上を推奨

## セットアップ

```bash
cp .gemini-export.example.json .gemini-export.json
```

必要に応じて`sourcePaths`を修正する。

## 実行

### 通常実行（書き込みあり）

```bash
npm run export:gemini:pw
```

### dry-run（書き込みなし）

```bash
npm run export:gemini:pw:check
```

## CI での推奨

- **本番相当のリポジトリ**では、パイプラインで`npm run export:gemini:pw`（または先に`export:gemini:pw:check`）を実行し、**`failOnWarnings: true`**を有効にすると、機密っぽい検知・設定ミス・セキュリティ関連スキップを警告のまま放置しにくくなります。設定例の断片は[templates/gemini-export.ci.snippet.json](templates/gemini-export.ci.snippet.json)を参照し、`.gemini-export.json`にマージしてください。
- ローカルでは`--check`で差分を確認し、問題なければ通常実行、という流れが安全です。
- `manifest.json`の`warnings`/`skippedFiles`に、次の**固定タグ**が付いた行がないか毎回確認してください（自動検索・レビュー用）。
  - `[symlink-outside-repo]` … シンボリックリンクがリポジトリ外に解決した、または解決不能
  - `[path-outside-repo]` … 解決先がリポジトリ外（通常ファイルパス）
  - `[dest-outside-outDir]` … 出力パスが`outDir`外にならないよう拒否された
  - `[unsafe-relative-path]` … エクスポート相対パスに`..`セグメントが含まれる
  - `[realpath-failed]` …`realpath`/`stat`に失敗（壊れたリンクなど）

## 出力先

```text
.ai-context/playwright-gemini/
```

このディレクトリをGeminiに渡す。

## 推奨設定

まずは`sourceDir`ではなく`sourcePaths`を使う（`sourceDir`は非対応）。

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

## AI向け説明ファイル

- `playwright/AI_CONTEXT.md`:人間がメンテするプロジェクト固有知識（テスト流儀・禁則・環境前提など）
- `README_FOR_AI.md`:ツールが生成する「この出力物の説明」

`templates/AI_CONTEXT.example.md`を起点に、対象リポジトリ側で`playwright/AI_CONTEXT.md`を用意する運用を推奨。

## 重要な注意

- redactionは補助。漏洩防止の本体はallowlist（`sourcePaths`）
- `fixtures/real` / `fixtures/private` / `auth` / `storageState`などはexportしない（設定ミスはwarning扱い）
- `manifest.json`は毎回人間が確認する
- warningが出たら無視しない（必要なら`failOnWarnings: true`）
- 実行時にNOTICEが標準出力されるので、内容を確認する
- fixtureに実データを入れない（sandbox/realを分離する）

## 推奨運用

- `AI_CONTEXT.md`を人間が管理する
- fixtureはsandbox/realを分離する
- 実際にGeminiに渡す前に出力物をレビューする
