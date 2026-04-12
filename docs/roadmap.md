# ロードマップ

このドキュメントは、Playwright プロジェクトを Gemini に渡すためのエクスポートツールとして、**今後検討しうる拡張**をフェーズ別に整理したものです。優先度はプロジェクトのニーズに応じて変わります。

関連ドキュメント:

- [Gemini / NotebookLM 運用ガイド](gemini-workflow.md)
- [README](../README.md)
- [pseudo-rag-opus レビュー記録と対応状況](pseudo-rag-opus-review-2026-04-12.md)

## 完了した項目（参考）

次は実装済みのため、ロードマップ本文の「未着手」一覧から外した。

- **統合テスト用フィクスチャ**: `test/fixtures/minimal-repo/.gemini-export.json` の欠落を解消（レビュー指摘 1）
- **`README_FOR_AI.md` と `--pack`**: pack 実行後に README を生成し、`_pack` 入口の説明を README に含める。`--pack` + `generateAiReadme` の統合テストを追加（レビュー指摘 2）
- **`copiedFiles` / pack 入力の重複**: `sourcePaths` と `includeFiles` の同一パス重複を export および `filterPackablePaths` で排除（レビュー指摘 3）

## Phase 1: 品質強化（短期）

### Pack のテストカバレッジ拡充

- **複数チャンク分割**: `chunkMaxLines` を超える大きいファイルで、`__p2of3` のような分割ファイル名が生成される経路の統合テスト
- **`writePackBundles`**: `checkOnly: true` の分岐、同一 bundle に複数ソースファイルが入るケースのテスト
- **`estimatePackSummary`**: 標準出力だけでなく、chunk 数・bundle 数の数値が期待どおりかを検証するユニットテスト
- **`validatePackConfig`**: `bundleGroupDepth` の範囲外、`outSubDir` に `..` を含む場合など、境界条件のテスト
- **`languageTagFromExt` / `isPackableExtension`**: 拡張子ごとの分類のユニットテスト

### その他

- **`.gemini-export.example.json`**: `includeExtensions` の重複エントリを整理し、例として読みやすくする

## Phase 2: Pack 機能の拡張（中期）

- **カスタム役割マッピング**: `.gemini-export.json` の `pack.roleOverrides`（仮）などで、パスパターンから `role` を上書きできるようにする。ヒューリスティックとプロジェクト慣習のずれを埋める
- **bundle サイズ制御**: 行数やトークン概算に基づき、1 本の bundle が大きすぎるときに自動分割する。Gemini の添付サイズ・コンテキスト制限への配慮
- **シンボル抽出の強化**: `describe` / `test` / `it` に加え、`class` / `export function` / page object のメソッド名などを軽量に抽出し、chunk の `symbols` の有用性を上げる
- **依存グラフの可視化**: `depends_on` を集約し、Mermaid などで `_pack/DEPENDENCY_GRAPH.md` を生成する（spec → page → helper → fixture の俯瞰）
- **差分エクスポート**: 前回の `manifest.json` と比較し、変更ファイルだけを再 pack する `--incremental`（仮）。大規模リポジトリでの再実行コストを下げる

## Phase 3: Gemini / NotebookLM 連携の自動化（中〜長期）

- **Google Drive アップロード**: `--upload`（仮）で `_pack/` 成果物を指定フォルダーへ配置。OAuth またはサービスアカウントなど、認証方式は設計が必要
- **NotebookLM ソース更新の半自動化**: Drive 上のファイル更新後に NotebookLM で同期する手順を `_pack/` に出力する、または将来の公式 API に対応する
- **Gemini チャット用プロンプトテンプレート**: `_pack/PROMPT_TEMPLATE.md` を生成し、添付順・会話の進め方をテンプレート化する

## Phase 4: 汎用化（長期）

- **Playwright 以外のプロファイル**: 既定の `excludePathPatterns` や役割推定を、`--profile playwright` / `--profile generic`（仮）などで切り替え可能にする
- **npm パッケージ化**: `private: true` を外し、`npx` で利用できる形への公開（メンテナンス方針の決定が前提）
- **プラグイン機構**: role 推定・シンボル抽出・redaction を外部モジュールで差し替え可能にする（複雑さとのトレードオフを要検討）

## 非目標（明示的に持たないもの）

次のような領域は、このリポジトリのスコープ外とする想定である（必要なら別ツールや IDE 連携で補う）。

- エクスポート成果物の **Gemini API への自動送信**（認証・データ境界・組織ポリシーが絡むため、手動添付や Drive 経由を正とする）
- **本番アプリケーションコード全体**のミラー化（allowlist 方針と矛盾する）

## 更新方針

ロードマップは実装の進捗や利用者のフィードバックに応じて見直す。完了した項目は本ドキュメントから削除するか、「完了」セクションへ移す。
