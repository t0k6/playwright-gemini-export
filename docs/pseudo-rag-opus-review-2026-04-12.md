# pseudo-rag-opus レビュー

2026-04-12時点のブランチ観測記録。

## Findings

### 1. `main`のfixture設定を取り込めておらず、ブランチ単体で統合テストが壊れている

- 重要度: High
- 対象: `test/integration/export-cli.test.mjs`

`pseudo-rag-opus`で`npm test`を実行すると、統合テスト5件が失敗する。失敗理由は`copyFixture()`が複製する`test/fixtures/minimal-repo`に`.gemini-export.json`が存在せず、CLIが`sourcePaths must be a non-empty array`で即終了するため。

確認結果:

- `pseudo-rag-opus`の`HEAD`には`test/fixtures/minimal-repo/.gemini-export.json`が存在しない
- `main`には同ファイルが存在し、同じ`npm test`が成功する
- そのため、`--pack` 向けに追加した統合テストだけでなく、既存の通常系テストも巻き込んで赤化している

影響:

- ブランチ状態のままではCI通過不可
- pack実装レビュー以前に、ベースとの差分取り込み不足でmerge-readyではない

推奨:

- `main`の`test/fixtures/minimal-repo/.gemini-export.json`を取り込む
- 取り込み後に`npm test`を再実行し、既存ケースと`--pack`ケースの両方を確認する

### 2. `--pack`実行時に`README_FOR_AI.md`が古い内容のまま出力される

- 重要度: Medium
- 対象: `tools/gemini-export/cli.mjs`, `tools/gemini-export/readme.mjs`

`cli.mjs`では`README_FOR_AI.md`を先に書き出し、その後で`runPack()`を実行している。この順序だとREADMEはpack成果物を一切反映できない。

再現:

1. 最小fixtureに`.gemini-export.json`を置いて`node ./tools/export-gemini-playwright-context.mjs --pack`実行
2. `manifest.json`には`_pack/PROJECT_INDEX.md`などが入り、`copiedFiles`は10
3. しかし`README_FOR_AI.md`は`copiedFiles: 2`のままで、`_pack`生成物への言及もない

影響:

- AIに渡す入口ファイルが実際の出力物を正しく説明しない
- packを使うほどREADMEの情報価値が下がる

比較:

- `pseudo-rag-gpt`ではindex/chunk生成後のmanifestをREADMEに反映する実装とテストが入っている
- Opus側も同様に、pack後のmanifestを使ってREADMEを生成すべき

推奨:

- `runPack()`完了後に`README_FOR_AI.md`を生成する
- READMEに`_pack`の入口（`PROJECT_INDEX.md`、`DIRECTORY_TREE.md`、`bundles/`、`chunks/`）を明記する
- `--pack`実行時のREADME内容を検証する統合テストを追加する

### 3. `sourcePaths`と`includeFiles`が重複するとpack索引が重複行を出す

- 重要度: Medium
- 対象: `tools/gemini-export/pack.mjs`, `tools/gemini-export/pack-index.mjs`

`runPack()`は`manifest.copiedFiles`をそのまま`filterPackablePaths()`に渡しているが、ここで重複除去していない。既定の`includeFiles`に含まれる`package.json`を`sourcePaths`にも列挙すると、同じファイルが2回pack対象になる。

再現:

```json
{
  "sourcePaths": ["src", "package.json"],
  "outDir": ".ai-context/playwright-test-export"
}
```

観測結果:

- `manifest.json`の`copiedFiles`に`package.json`が2回入る
- `_pack/PROJECT_INDEX.md`に`package.json`行が2行出る
- `_pack/chunks/package.json.md`は同じパスへ2回書かれ、manifest側だけ重複が残る

影響:

- pack索引の信頼性低下
- `copiedFiles`件数やレビュー用メタデータが水増しされる
- 重複入力時に「何が何件出力されたか」が不正確になる

推奨:

- `runPack()`の入力段階でpack対象パスを一意化する
- 可能ならexport本体でも`copiedFiles`を重複排除する
- `sourcePaths`と`includeFiles`の重複ケースをテスト追加する

## Verification

- `pseudo-rag-opus`で`npm test`実行 → fail 5
- `main`で`npm test`実行 → fail 0
- 最小fixtureに対して`--pack`手動実行し、`manifest.json`/`README_FOR_AI.md`/`_pack/PROJECT_INDEX.md`を確認
