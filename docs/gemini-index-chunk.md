# indexChunk生成物の仕様

## 概要

`.gemini-export.json`の`indexChunk`を有効にすると、エクスポート完了後に`outDir`配下へ次を追加する。

- `PROJECT_INDEX.md`…入口用の索引（ファイル一覧は先頭のみ掲載し、超過分は省略行で案内）
- `PATH_INDEX.jsonl`…1行1ファイルのJSON（`path`、`kind`、`ext`、`sizeBytes`）
- `chunks/*.md`…精読用チャンク（YAMLフロントマター＋フェンス内本文）

CLIから設定を書き換えずに有効化する場合は`--index-chunk`を付ける（`indexChunk.enabled`より優先）。

## 設定例

```json
{
  "indexChunk": {
    "enabled": true,
    "projectIndexFile": "PROJECT_INDEX.md",
    "pathIndexFile": "PATH_INDEX.jsonl",
    "chunksDir": "chunks",
    "maxChunkBytes": 49152,
    "chunkExtensions": [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".md", ".json", ".yml", ".yaml", ".txt"]
  }
}
```

## PATH_INDEX.jsonl

各オブジェクトのフィールド。

- `path`…エクスポート相対パス
- `kind`…`guessFileKind`による粗い分類（`spec`/`page`/`helper`/`fixture`/`config`/`doc`/`file`）
- `ext`…拡張子（小文字）
- `sizeBytes`…元ファイルのバイト長
- `summary`…将来のrich metadata用。現状は空文字でプレースホルダー（[gemini-export-roadmap.md](gemini-export-roadmap.md)参照）

## chunkファイル

フロントマター例。

```yaml
---
original_path: src/sample.ts
chunk_id: src__sample.ts__001
kind: spec
---
```

本文は言語フェンス付きで、元ファイルの該当バイト範囲を格納する。

## dry-run

`npm run export:gemini:pw:check -- --index-chunk`のように`--check`と併用すると、ディスクへは書かず、標準出力に概算件数を出す。

## 実装の要点

- chunk分割は`maxChunkBytes`（UTF-8バイト）を上限とし、行単位でバッファリングする（実装は[tools/lib/gemini-export-pure.mjs](../tools/lib/gemini-export-pure.mjs)の`splitTextByMaxBytes`）。極端に長い1行は簡易分割にフォールバックするMVPである。
- `PROJECT_INDEX.md`のファイル一覧は行数上限（`PROJECT_INDEX_MAX_LINES`、既定120）があり、超過分は本文末の省略行で`PATH_INDEX.jsonl`へ誘導する（実装は[tools/gemini-export/index-chunk.mjs](../tools/gemini-export/index-chunk.mjs)）。

## 今後の拡張

`bundle`、PATH_INDEXの`summary`充填、chunkの意味単位分割、`index-chunk`モジュールの分割などは[gemini-export-roadmap.md](gemini-export-roadmap.md)の「ロードマップ」および「今後の課題（計画で見送り・低優先）」節に整理する。
