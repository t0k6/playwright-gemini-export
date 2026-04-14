# GPT ブランチに対するコードレビュー

> レビュー実施: Opus モデル
> 対象ブランチ: `feature/pseudo-rag-approach/gpt`（`fcba6db`）
> 比較対象: `feature/pseudo-rag-approach/opus`（`3709678`）
> 日付: 2026-04-12

以降の対応状況と見送り項目は[gemini-export-roadmap.md](gemini-export-roadmap.md)（とくに「今後の課題（計画で見送り・低優先）」）を参照する。

---

## 総評

GPT ブランチは `index + chunk` 機能を**設定駆動**（`indexChunk.enabled`）で実装しており、既存の copy-pipeline を壊さず後段フェーズとして追加する方針は Opus 側と一致している。コードは読みやすく、セキュリティチェック（`isWithinBaseDir` による出力パス検証）も適切に入っている。

一方で、以下の点について改善余地がある。

---

## 1. アーキテクチャと設計

### 1-1. 単一モジュール vs モジュール分割

GPT の `index-chunk.mjs` は 179 行の単一関数 `generateIndexAndChunks` に index 生成・chunk 生成・PATH_INDEX 書き出し・PROJECT_INDEX 書き出しのすべてを詰め込んでいる。

Opus 側はオーケストレータ（`pack.mjs`）+ 個別モジュール（`pack-chunk.mjs`, `pack-index.mjs`, `pack-bundle.mjs`, `pack-helpers.mjs`）の 5 ファイル構成で、各責務が明確に分離されている。

**推奨**: 現状の 179 行は許容範囲だが、今後 bundle 生成を追加する際にこの関数が肥大化するリスクがある。早めにオーケストレータ＋個別モジュール構成へリファクタリングを検討すべき。少なくとも:
- index 生成ロジック
- chunk 生成ロジック
- ヘルパー（`languageFromExt` など）

を分離すると、テスタビリティとメンテナンス性が上がる。

### 1-2. CLI フラグがない

GPT は `indexChunk.enabled` の設定のみで制御し、CLI フラグ（`--pack` 相当）を持たない。Opus は `--pack` フラグで明示的に有効化する。

**影響**: 設定ファイルを書き換えずに一時的に index/chunk を生成したい、あるいは CI で条件分岐したい場合に不便。`--index-chunk` のようなフラグの追加を推奨する。

### 1-3. `--check` 時の見積もりがない

GPT は `--check` 時に index/chunk をスキップするだけで、「何本の chunk が生成されるか」の見積もりを出さない。Opus は `estimatePackSummary` で chunk 数・bundle 数の概算を標準出力に表示する。

**推奨**: dry-run 時にも見積もり情報を出力すると、運用上の判断材料が増える。

---

## 2. 機能の比較

### 2-1. bundle 生成が未実装

GPT ブランチのロードマップ（`gemini-export-roadmap.md`）では bundle を「優先度1」に挙げているが、実装はない。Opus はすでに bundle 生成を実装済み（`pack-bundle.mjs`）で、ディレクトリ階層 + 推定役割によるグルーピングが動作する。

ロードマップで「次の最優先」と宣言するなら、計画だけでなく着手を進めるべき。

### 2-2. chunk メタデータが貧弱

GPT の chunk フロントマターは `original_path` と `chunk_id` の 2 フィールドのみ。

```yaml
---
original_path: src/sample.ts
chunk_id: src__sample.ts__001
---
```

Opus の chunk フロントマターはより豊富:

```yaml
---
original_path: src/sample.ts
chunk: 1/3
role: spec
symbols:
  - describe: login flow
  - test: ログイン成功
depends_on:
  - ../helpers/session.mjs
---
```

**推奨**: 最低限 `role` は追加すべき。`guessFileKind` がすでに PATH_INDEX 用に存在するのでフロントマターにも載せるコストは低い。`symbols` と `depends_on` も、Gemini でチャンクの関連性を把握するうえで有用。

### 2-3. DIRECTORY_TREE.md がない

Opus は `DIRECTORY_TREE.md` を独立ファイルとして生成し、ツリー構造を一目で把握できる。GPT はツリー出力がないため、PROJECT_INDEX.md のファイル一覧で代替するしかないが、120 行の上限があるため大規模プロジェクトでは途切れる。

### 2-4. PROJECT_INDEX.md の 120 行制限

```js
if (projectIndexLines.length < 120) {
  projectIndexLines.push(`- \`${relNorm}\` (${kind})`);
}
```

120 行以降のファイルはリストに載らない。大規模プロジェクトでは重要なファイルが省略される可能性がある。Opus は Markdown テーブルで全ファイルを列挙する。

**推奨**: 少なくとも省略されたファイル数を末尾に表示する（「他 N ファイル省略」）。理想的にはテーブル形式で全件を出すか、別途全件を PATH_INDEX.jsonl に委ねる旨を明記する。

---

## 3. chunk 分割の品質

### 3-1. バイト単位 vs 行単位

GPT は `maxChunkBytes`（既定 48KB）によるバイトベース分割。Opus は `chunkMaxLines`（既定 300 行）による行ベース分割。

バイトベースは多言語テキスト（日本語など UTF-8 のマルチバイト文字）で公平なサイズ制御ができる利点はある。一方、「何行入っているか」が読み手にとってわかりにくい。

### 3-2. 長行の分割ロジックが粗い

```js
if (lineBytes > maxChunkBytes) {
  let rest = lineWithNl;
  while (Buffer.byteLength(rest, "utf8") > maxChunkBytes) {
    const slice = rest.slice(0, Math.max(1, Math.floor(rest.length / 2)));
    chunks.push({ index: idx++, text: slice });
    rest = rest.slice(slice.length);
  }
```

`Math.floor(rest.length / 2)` は code unit 数の半分で切るため、UTF-8 のバイト長とは一致しない。最悪ケースでは再帰的な半分切りが繰り返される。実用上は巨大な1行ファイルが稀なため問題になりにくいが、コメントで「MVPである」旨を明記済みなのは良い。

---

## 4. 設定と検証

### 4-1. `indexChunk` の設定検証は充実している

`config.mjs` の `validateConfig` 内で、`indexChunk.enabled` が boolean か、`maxChunkBytes` が正の整数か、`chunkExtensions` が配列かなどを丁寧に検証している。この点は評価できる。

### 4-2. `indexChunk` のパス安全性検証

`assertSafeRelPath` を `projectIndexFile`, `pathIndexFile`, `chunksDir` にも適用しており、セキュリティ面は問題ない。

---

## 5. テスト

### 5-1. 統合テストのカバレッジ

統合テスト（`export-cli.test.mjs`）に以下を網羅しているのは良い:
- `indexChunk` 無効時に index/chunk が生成されないこと（66-72 行目）
- `indexChunk` 有効時に PROJECT_INDEX, PATH_INDEX, chunks が生成されること
- manifest.json に `indexFiles` / `chunkFiles` / `chunkCount` が反映されること
- README_FOR_AI.md に chunk 情報が含まれること
- PATH_INDEX.jsonl の最低限のスキーマ検証
- chunk のフロントマター（`original_path`, `chunk_id`）の存在確認
- `--check` 時に `indexChunk` 有効でも出力されないこと

### 5-2. 不足しているテスト

- **chunk 分割の境界テスト**: `maxChunkBytes` ぴったりのファイル、1 バイト超えるファイル、空ファイルなどの境界条件のユニットテスト
- **`languageFromExt` のユニットテスト**: 未知の拡張子で空文字列を返すことの確認
- **セキュリティ**: `indexChunk.chunksDir` に `../` を含む値を設定した場合の拒否テスト（設定検証で弾かれるはずだが、テストがない）
- **120 行超のプロジェクト**: ファイル数が 120 を超えるフィクスチャでの PROJECT_INDEX 省略の挙動確認

---

## 6. ドキュメント

### 6-1. ドキュメント間の整合性問題

`gemini-context-strategy.md`（57-64 行目）に以下の記述がある:

> 一方で、次はまだ今後の実装対象である。
> - `index` の生成
> - `chunk` の生成

実際には `index + chunk` は**実装済み**であり、ロードマップ（`gemini-export-roadmap.md`）の記述と矛盾する。ドキュメントの更新漏れ。

**推奨**: `gemini-context-strategy.md` を現状に合わせて更新すること。

### 6-2. README に `indexChunk` の使い方がない

README.md には `indexChunk` 設定の説明がない。利用者が index/chunk 機能を発見できない。

**推奨**: README の「推奨設定」セクションまたは新セクションに `indexChunk` の設定例を追加する:

```json
{
  "indexChunk": {
    "enabled": true,
    "maxChunkBytes": 49152
  }
}
```

### 6-3. Opus 側のドキュメントとの差

Opus は `docs/gemini-workflow.md` で chunk のフォーマット仕様、PATH_INDEX のスキーマ、bundle の構造、NotebookLM 運用のすすめ、Gemini チャット運用のすすめを詳細にドキュメント化している。GPT 側には同等のドキュメントがなく、生成物の仕様が `gemini-context-strategy.md` の「将来構想」としてしか記述されていない。

**推奨**: 実装済みの index/chunk の仕様を独立したドキュメントにまとめる。

---

## 7. コード品質の細かい指摘

### 7-1. `generateIndexAndChunks` の実行順序

`cli.mjs` で `generateIndexAndChunks` が `README_FOR_AI.md` 生成の**前**に呼ばれる（218-220 行目）。これ自体は正しいが、README 生成後に `manifest.copiedFiles` に `README_FOR_AI.md` が push される（225 行目）ため、index フェーズからは README_FOR_AI.md が**含まれない**。意図的であれば問題ないが、逆に README_FOR_AI.md を index/chunk 対象にしたい場合は順序の調整が必要。これは設計判断としてコメントがあると良い。

### 7-2. `PATH_INDEX.jsonl` の `summary` が常に空文字

```js
const row = {
  path: relNorm,
  kind,
  ext,
  sizeBytes: stat.size,
  summary: ""
};
```

`summary` フィールドを出力するなら値があるべき。値を埋める実装がないなら、フィールド自体をまだ出さないか、ロードマップに明記して `""` のまま出す理由を説明するかのどちらかにすべき。

### 7-3. `deepMerge` の配置

`deepMerge` が `paths.mjs` にある（83-105 行目）。これはパス操作と無関係な汎用ユーティリティであり、配置場所として不自然。Opus 側のように `gemini-export-pure.mjs` に集約するほうが適切（GPT も一部 `gemini-export-pure.mjs` を使っているが、`paths.mjs` にも `deepMerge` が存在する二重定義状態）。

確認: `config.mjs` は `gemini-export-pure.mjs` から `deepMerge` をインポートしている。`paths.mjs` にある `deepMerge` が実際に使用されているかを確認し、使われていなければ削除する。使われているなら一本化する。

### 7-4. `chunkIdBaseFromRelPath` の区切り文字

```js
export function chunkIdBaseFromRelPath(relPath) {
  return String(relPath).replace(/[\\/]/g, "__");
}
```

パス区切りを `__` に置換するが、ファイル名自体に `__` が含まれる場合に衝突する。Opus 側の `escapePathForChunkBase` も同様のリスクはあるが、追加で `[^a-zA-Z0-9_.-]+` を `_` に正規化しているため、衝突リスクはやや低い。

---

## 8. マージに向けた推奨アクション

優先度順:

1. **`gemini-context-strategy.md` の更新漏れ修正**（ドキュメント整合性）
2. **README に `indexChunk` 設定の説明追加**（ユーザビリティ）
3. **PROJECT_INDEX の 120 行制限に省略表示を追加**（実用性）
4. **chunk フロントマターに `role` を追加**（メタデータ品質）
5. **`paths.mjs` の `deepMerge` を整理**（コード整理）
6. **chunk 分割の境界条件ユニットテスト追加**（テスト品質）
7. **bundle 生成の実装着手**（ロードマップ優先度 1 との整合）

---

## 9. 良い点（評価）

- **セキュリティ**: `isWithinBaseDir` を index/chunk 出力パスにも適用しており、パストラバーサル防止が一貫している
- **設定検証**: `indexChunk` の各フィールドを丁寧にバリデーションしている
- **後段フェーズの設計**: copy-pipeline に手を入れず、別モジュールとして追加した判断は正しい
- **テストカバレッジ**: 統合テストで index/chunk の基本契約を網羅している
- **計画文書の充実**: 実装計画（`index_+_chunk_実装計画_a35614fb.plan.md`）が事前に整理されており、実装がそれに忠実にしたがっている

---

## 付録: 両ブランチの設計差異まとめ

| 観点 | GPT | Opus |
| --- | --- | --- |
| 機能名 | `indexChunk` | `pack`（`--pack`） |
| 有効化 | 設定ファイルの `indexChunk.enabled` | CLI フラグ `--pack` |
| chunk 分割単位 | バイト（`maxChunkBytes`） | 行（`chunkMaxLines`） |
| chunk メタデータ | `original_path`, `chunk_id` | `original_path`, `chunk`, `role`, `symbols`, `depends_on` |
| bundle | 未実装（ロードマップに記載） | 実装済み（dir + role グルーピング） |
| DIRECTORY_TREE | なし | あり |
| PROJECT_INDEX 形式 | 箇条書き（120 行制限） | Markdown テーブル（全件） |
| PATH_INDEX スキーマ | `path`, `kind`, `ext`, `sizeBytes`, `summary` | `path`, `role`, `lineCount`, `ext`, `chunkRelPaths` |
| dry-run 見積もり | なし | あり（`estimatePackSummary`） |
| モジュール構成 | 単一（`index-chunk.mjs`） | 5 ファイル分割 |
| シンボル抽出 | なし | `describe`/`test`/`it` 抽出 |
| 依存関係抽出 | なし | 相対 import 抽出 |
