# Playwright → Gemini Export Tool

Playwright の E2E テストコードを、安全に Gemini に渡すためのサニタイズエクスポートツール。

## 背景

- プロダクトを管理しているgitリポジトリ上のコードは対外機密
- GitHub ミラーは禁止
- Gemini / NotebookLM のみ使用可能
- そのため「必要最小限だけ」安全に抽出する

## できること

- Playwright ディレクトリから必要なファイルだけ抽出
- secrets, 大容量ファイル, レポート を除外
- 簡易マスキング
- AI 用 README 自動生成
- manifest 出力（レビュー用）

## 使い方

### 1. リポジトリにコピー

このツールを対象リポジトリにコピー

### 2. 設定ファイルを配置

```
cp .gemini-export.example.json .gemini-export.json
```

必要に応じて編集

### 3. 実行

```
npm run export:gemini:pw
```

### 4. 出力

```
.ai-context/playwright-gemini/
```

これを Gemini に渡す

## 注意

- secrets は「完全には」検出できない
- 必ず manifest を人間が確認すること
- fixture に実データを入れないこと

## 推奨運用

- sourcePaths による allowlist 化
- AI_CONTEXT.md の整備
- CI によるエクスポート固定化（任意）
