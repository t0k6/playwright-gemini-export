# ロードマップ

このドキュメントは、PlaywrightプロジェクトをGeminiに渡すためのエクスポートツールとして、**今後検討しうる拡張**をフェーズ別に整理したものです。優先度はプロジェクトのニーズに応じて変わります。

関連ドキュメント:

- [Gemini/NotebookLM運用ガイド](gemini-workflow.md)
- [README](../README.md)
- [pseudo-rag-opusレビュー記録と対応状況](pseudo-rag-opus-review-2026-04-12.md)

## 完了した項目（参考）

次は実装済みのため、ロードマップ本文の「未着手」一覧から外した。

- **統合テスト用フィクスチャ**: `test/fixtures/minimal-repo/.gemini-export.json`の欠落を解消（レビュー指摘1）
- **`README_FOR_AI.md`と`--pack`**: pack実行後にREADMEを生成し、`_pack`入口の説明をREADMEに含める。`--pack`+`generateAiReadme`の統合テストを追加（レビュー指摘2）
- **`copiedFiles`/pack入力の重複**: `sourcePaths`と`includeFiles`の同一パス重複をexportおよび`filterPackablePaths`で排除（レビュー指摘3）

## Phase 1: 品質強化（短期）

### Packのテストカバレッジ拡充

- **複数チャンク分割**: `chunkMaxLines`を超える大きいファイルで、`__001`のようなゼロ埋め連番サフィックス付きチャンク（例: `tests__auth__big.spec.ts__001.md`）が生成される経路の統合テスト
- **`writePackBundles`**: `checkOnly: true`の分岐、同一bundleに複数ソースファイルが入るケースのテスト
- **`estimatePackSummary`**: 標準出力だけでなく、chunk数・bundle数の数値が期待どおりかを検証するユニットテスト
- **`validatePackConfig`**: `bundleGroupDepth`の範囲外、`outSubDir`に`..`を含む場合など、境界条件のテスト
- **`languageTagFromExt` / `isPackableExtension`**: 拡張子ごとの分類のユニットテスト

### その他

- **`.gemini-export.example.json`**: `includeExtensions` の重複エントリを整理し、例として読みやすくする

## Phase 2: Pack機能の拡張（中期）

- **カスタム役割マッピング**: `.gemini-export.json` の `pack.roleOverrides`（仮）などで、パスパターンから `role` を上書きできるようにする。ヒューリスティックとプロジェクト慣習のずれを埋める
- **bundleサイズ制御**: 行数やトークン概算に基づき、1本のbundleが大きすぎるときに自動分割する。Geminiの添付サイズ・コンテキスト制限への配慮
- **シンボル抽出の強化**: `describe`/`test`/`it`に加え、`class`/`export function`/page objectのメソッド名などを軽量に抽出し、chunkの`symbols`の有用性を上げる
- **依存グラフの可視化**: `depends_on`を集約し、Mermaidなどで`_pack/DEPENDENCY_GRAPH.md`を生成する（spec→page→helper→fixtureの俯瞰）
- **差分エクスポート**: 前回の`manifest.json`と比較し、変更ファイルだけをre-packする`--incremental`（仮）。大規模リポジトリでの再実行コストを下げる

## Phase 3: Gemini/NotebookLM連携の自動化（中〜長期）

- **Google Driveアップロード**: `--upload`（仮）で`_pack/`成果物を指定フォルダーへ配置。OAuthまたはサービスアカウントなど、認証方式は設計が必要
- **NotebookLMソース更新の半自動化**: Drive上のファイル更新後にNotebookLMで同期する手順を`_pack/`に出力する、または将来の公式APIに対応する
- **Geminiチャット用プロンプトテンプレート**: `_pack/PROMPT_TEMPLATE.md`を生成し、添付順・会話の進め方をテンプレート化する

## Phase 4: 汎用化（長期）

- **Playwright以外のプロファイル**: 既定の`excludePathPatterns`や役割推定を、`--profile playwright`/`--profile generic`（仮）などで切り替え可能にする
- **npmパッケージ化**: `private: true`を外し、`npx`で利用できる形への公開（メンテナンス方針の決定が前提）
- **プラグイン機構**: role推定・シンボル抽出・redactionを外部モジュールで差し替え可能にする（複雑さとのトレードオフを要検討）

## 非目標（明示的に持たないもの）

次のような領域は、このリポジトリのスコープ外とする想定である（必要なら別ツールやIDE連携で補う）。

- エクスポート成果物の**Gemini APIへの自動送信**（認証・データ境界・組織ポリシーが絡むため、手動添付やDrive経由を正とする）
- **本番アプリケーションコード全体**のミラー化（allowlist方針と矛盾する）

## 更新方針

ロードマップは実装の進捗や利用者のフィードバックに応じて見直す。完了した項目は本ドキュメントから削除するか、「完了」セクションへ移す。
