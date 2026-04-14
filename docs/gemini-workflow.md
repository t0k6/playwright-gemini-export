# Gemini / NotebookLM 運用ガイド（index・chunk・bundle）

このドキュメントは、`playwright-gemini-export` の **Pack** 機能（`--pack`）で生成する成果物の意味と、Gemini チャットおよび NotebookLM での実運用をまとめたものです。

## なぜ index / chunk / bundle が必要か

Gemini の通常チャットは、**長い会話の中でコードベース全体を常に保持し続ける**用途には向きません。コンテキストウィンドウの制限に加え、添付ファイル数やサイズにも上限があります。

そのため、次の役割分担が現実的です。

| 層 | 役割 |
| --- | --- |
| **NotebookLM**（任意） | 比較的大きな資料群をソースとして保持し、質問に応じて参照する（疑似 RAG に近い使い方） |
| **Gemini チャット** | 今まさに扱うタスクに必要な **索引（index）** と **断面（bundle / chunk）** だけを添付する |
| **このリポジトリの export + pack** | 機密を減らしたうえで、上記に渡しやすい形へ **自動整形** する |

## 三種類の成果物（概念）

### index（索引）

**常に小さく保ちたいメタ情報**です。

- リポジトリ相当の **ディレクトリツリー**
- **ファイル一覧**（相対パス・推定役割・行数など）
- 人間・モデルが「どこに何があるか」を掴むための入口

代表ファイル:

- `PROJECT_INDEX.md` … 概要・ツリー要約・ファイル表
- `DIRECTORY_TREE.md` … ツリー表示のみ
- `PATH_INDEX.jsonl` … 1 行 1 ファイルの JSON（機械可読）

### chunk（精読用の小片）

**1 ファイルまたはその分割**を、YAML フロントマター付き Markdown にしたものです。

- 長いファイルは **行数上限で分割**（設定: `pack.chunkMaxLines`）
- フロントマターに `original_path`・`role`・チャンク番号などを載せ、**元のパスを失わない**ようにする

用途: 「このファイルだけ詳しく見てほしい」ときに、該当 chunk だけを Gemini に添付する。

### bundle（話題単位のまとめ）

**ディレクトリ階層 + 推定役割**でグルーピングし、複数 chunk の内容を 1 つの Markdown に束ねたものです。

- 例: `tests/auth/` 配下の spec を 1 本の `bundle-tests-auth-spec.md` にまとめる
- 会話の話題が「認証まわりのテスト」に絞れるとき、**bundle 1 本 + index** で足りることが多い

用途: 関連する複数ファイルをまとめて渡したいが、リポジトリ全体は渡したくないとき。

## 出力ディレクトリ構造（`--pack` 使用時）

export の `outDir`（既定: `.ai-context/playwright-gemini`）の直下に、サニタイズ済みファイルのほか次が追加されます。

```text
{outDir}/
  ... サニタイズ済みのコピー ...
  manifest.json
  README_FOR_AI.md          # generateAiReadme が true のとき（--pack 利用時は _pack 生成のあとに書き出し）
  _pack/
    PROJECT_INDEX.md
    DIRECTORY_TREE.md
    PATH_INDEX.jsonl
    chunks/
      <エスケープ済みパス>.md
    bundles/
      bundle-<dirKey>-<role>.md
```

`_pack` の名前は `pack.outSubDir` で変更できます（`..` は禁止）。

### README と pack の実行順

`generateAiReadme` が `true` で通常実行（`--check` ではない）のとき、CLI は次の順で処理します。

1. サニタイズ済みファイルのコピー
2. **`--pack` 指定時は** `outDir` 配下に `_pack/`（または `pack.outSubDir`）を生成し、`manifest.json` 用の `copiedFiles` に pack 成果物を追加
3. **`README_FOR_AI.md` を書き出し**（この時点の `manifest` には pack 結果が含まれるため、`copiedFiles` 件数や `_pack` への言及が実出力と一致する）

`--pack` かつ `generateAiReadme: true` のとき、README 本文には `pack.outSubDir`（既定 `_pack`）配下の入口（`PROJECT_INDEX.md`、`DIRECTORY_TREE.md`、`PATH_INDEX.jsonl`、`chunks/`、`bundles/`）を案内する節が付与されます。

### 同一パスが `sourcePaths` と `includeFiles` の両方に出る場合

同じ相対パス（例: ルートの `package.json`）を `sourcePaths` と既定の `includeFiles` の両方に含めた場合でも、**エクスポート結果と pack 索引では 1 回分として扱われます**（`manifest.copiedFiles` の重複登録と pack 入力の二重化を防ぐ実装）。

## ファイル役割（自動分類）

Pack はパスと拡張子から **推定役割** を付けます（上から優先）。

1. `*.spec.ts` / `*.spec.js` / `*.test.ts` / `*.test.js` など → `spec`
2. パスに `pages/` を含む → `page`
3. `helpers/` を含む → `helper`
4. `fixtures/` を含む → `fixture`
5. `playwright.config.*` / `tsconfig*.json` / `package.json` など → `config`
6. それ以外 → `other`

**注意**: 推定はヒューリスティックです。プロジェクトの慣習とずれる場合は、bundle 名や `role` を鵜呑みにせず、パスで判断してください。

## chunk のフォーマット仕様

各 chunk は次のような構成です。

1. YAML フロントマター（`---` で囲む）
2. 本文にフェンス付きコードブロック（言語タグ + 元パスをコメントで併記）

フロントマターに含まれる主なキー:

| キー | 説明 |
| --- | --- |
| `original_path` | エクスポート出力内の相対パス（リポジトリルート基準ではなく **outDir 基準** の場合と **元 sourcePaths ツリー上の相対** の場合がある。現実装は **outDir からの相対** で統一） |
| `chunk` | `1/3` のような **現在チャンク / 総チャンク** |
| `role` | `spec` / `page` / `helper` / `fixture` / `config` / `other` |
| `symbols` | `describe` / `test` 名など、軽量に抽出したシンボル（ない場合は空） |
| `depends_on` | `from './x'` 形式の相対 import の列挙（完全な解決はしない） |

## PATH_INDEX.jsonl のスキーマ

1 行 1 オブジェクト（JSON Lines）。例:

```json
{"path":"tests/auth/login.spec.ts","role":"spec","lineCount":42,"ext":".ts","chunkRelPaths":["chunks/tests__auth__login.spec.ts.md"]}
```

- `path` … outDir からの相対パス（`_pack` や `manifest.json` は含まない）
- `role` … 上記の推定役割
- `lineCount` … 行数
- `ext` … 拡張子（小文字）
- `chunkRelPaths` … 当該ファイルに対応する chunk の相対パス配列（`_pack/` からの相対。分割時は複数要素）

## bundle の構造

- ファイル名: `bundle-<dirKey>-<role>.md`
- `dirKey` は、パスの先頭から `pack.bundleGroupDepth` セグメントを取り、区切り `/` を `-` にしたもの（英数字以外は `-` に正規化）
- 同一 bundle に複数 chunk が入る場合、見出しで chunk を区切る

## NotebookLM 運用のすすめ

公式のソース上限・種別は NotebookLM のヘルプを参照してください。運用上の目安として:

1. **Notebook に載せるもの（優先）**
   - `PROJECT_INDEX.md`
   - `DIRECTORY_TREE.md`
   - 頻繁に参照する **bundle** 数本（例: 認証・決済・一覧画面などドメイン単位）
2. **chunk は NotebookLM に全部入れない**ことも多い（ソース数上限があるため）。Gemini 側で必要になったら都度添付する運用が現実的です。
3. エクスポートを更新したら、NotebookLM のソースは **再取り込みまたは同期** が必要な場合があります（NotebookLM は静的コピーとして保持する挙動です）。

## Gemini チャット運用のすすめ

1. **会話の最初**: `PROJECT_INDEX.md`（と必要なら `DIRECTORY_TREE.md`）だけ添付する。
2. **話題が定まったら**: 対応する **bundle 1 本** を添付する。
3. **行単位の修正や詳細レビュー**: そのファイルの **chunk** だけを追加する。
4. モデルに依頼するときは、「`original_path` はエクスポートツリー上の相対パス」と明示すると取り違えが減ります。

## CLI での使い方

通常の export に加えて `--pack` を付けると、上記 `_pack/` が生成されます。

```bash
node ./tools/export-gemini-playwright-context.mjs --pack
```

dry-run（`--check`）では、ディスクへの書き込みは行わず、**サニタイズ済みの outDir が存在しない**ため `_pack/` は生成しません。その代わり、Pack が **おおよそ何本の chunk / bundle を書くか** を標準出力に要約します（行数はワークスペース上の元ファイルから概算します）。

```bash
node ./tools/export-gemini-playwright-context.mjs --check --pack
```

設定は `.gemini-export.json` で `pack` オブジェクトを上書きできます（既定値は `default-config.mjs` の `pack` を参照）。

## 関連ファイル

- ツール本体: [README.md](../README.md)
- 設定例: [.gemini-export.example.json](../.gemini-export.example.json)
