# Playwright Official Docs Export

Playwright公式 Node.js ドキュメントを、NotebookLM / Gemini 向けに取得・前処理・保存するツール。

既存の [Playwright → Gemini Export Tool](../README.md)（E2Eテストコードのサニタイズエクスポート）を補完する位置づけで、**独立サブディレクトリ**として配置している。

## 目的

- 公式 Web ページを直接 NotebookLM に登録すると、ナビ・フッター等のノイズが混入する
- TypeScript / Node.js 向け情報に絞り、原文をできるだけ保全した Markdown を生成する
- 冪等に再実行できる決定的パイプラインを提供する

## 取得元

- URL 一覧: `microsoft/playwright.dev` の stable サイドバー（`docs` セクションのみ）
- 本文: 同リポジトリの `versioned_docs/version-stable/*.mdx`（HTML ではなく MDX ソース）

API reference（`/docs/api/class-*`）は対象外。

## 出力

`playwright-official-docs/output/` に以下を生成する。

| パス | 内容 |
| --- | --- |
| `pages/NN-id.md` | ページ単位の前処理済み Markdown |
| `notebooklm/*.md` | サイドバーカテゴリ単位の bundle（NotebookLM 登録の主対象） |
| `PROJECT_INDEX.md` | 全ページ索引 |
| `official-url-list.md` | 公式 URL 一覧 |
| `url-review.md` | ベースライン URL との差分 |
| `manifest.json` | 機械可読メタデータ |

## 実行

```bash
npm run export:playwright-docs:check   # dry-run
npm run export:playwright-docs         # 取得・前処理・保存
```

fixture モード（テスト・オフライン用）:

```bash
node ./playwright-official-docs/bin/export-playwright-docs.mjs --fixture-dir ./test/fixtures/playwright-docs
```

## NotebookLM 運用

1. `PROJECT_INDEX.md` と `notebooklm/` 配下の bundle を NotebookLM に登録する
2. 個別ページの精読が必要なときは `pages/` から該当ファイルを追加する
3. 更新時は再実行してソースを差し替える

詳細は [docs/gemini-workflow.md](../docs/gemini-workflow.md) の index / bundle 運用と同様の考え方。

## 前処理

- Docusaurus `import` / `Tabs` / `HTMLCard` を除去または展開
- パッケージマネージャタブは `npm` を優先（`config.default.json` で変更可）
- `languages.mdx` は JavaScript and TypeScript セクションのみ残す
- 末尾の API reference 定義ブロックを削除
- 画像は `*(image: alt)*` 注記へ置換

## 設定

[`config.default.json`](config.default.json) を編集する。主な項目:

- `sidebarUrl` / `mdxBaseUrl` / `docsBaseUrl`
- `packageManager` / `languageTab` / `tabMode`
- `baselineDocIds` — URL レビュー用の既知 ID 一覧
