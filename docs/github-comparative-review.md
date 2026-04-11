# GitHub上での2ブランチ比較レビューと統合計画

同一テーマを別々に計画・実装した2ブランチを、GitHub上で比較レビューし、最終的に1本にまとめるための手順です。リポジトリのデフォルトは`t0k6/playwright-gemini-export`です。フォークやリネーム後はURLとスクリプトの引数を読み替えてください。

## 1. 親Issueの作り方

1. GitHubの**Issues** → **New issue** → **統合・2ブランチ比較レビュー**を選ぶ（[Issueテンプレート](../.github/ISSUE_TEMPLATE/integration-compare-review.md)）。
2. `REPLACE_BRANCH_A` / `REPLACE_BRANCH_B`を実ブランチ名に置換する（例: `feature/pseudo-rag-approach/gpt`と`feature/pseudo-rag-approach/opus`はスラッシュをURLエンコードする場合あり）。
3. PRがまだなら開き、本文に[比較レビュー用PRテンプレート](../.github/PULL_REQUEST_TEMPLATE/comparative-review.md)を使う（新規PR作成時に`?template=comparative-review.md`を付与）。

### 比較用URLの組み立て

`BASE`、`BRANCH_A`、`BRANCH_B`を置き換えたうえでブラウザで開く。

```text
https://github.com/t0k6/playwright-gemini-export/compare/BASE...BRANCH_A
https://github.com/t0k6/playwright-gemini-export/compare/BASE...BRANCH_B
https://github.com/t0k6/playwright-gemini-export/compare/BRANCH_A...BRANCH_B
```

ローカルで一括出力する場合は[scripts/print-github-compare-urls.ps1](../scripts/print-github-compare-urls.ps1)を参照。

## 2. クロスレビュー依頼文（PRにコピー）

### PR-A（ブランチA → ベース）向け

```markdown
## 比較レビュー依頼

ブランチ**B**（PR: <!-- PR-BのURL -->）と同じ要件を別設計で実装しています。本PRをレビューする際は次の順で参照してください。

1. PR-Bの説明と主要コミット（設計意図）
2. compare `A...B`: <!-- `https://github.com/t0k6/playwright-gemini-export/compare/A...B` -->
3. 本PRの差分（`BASE...A`）

**コメントしてほしい観点**: 要件充足、境界ケース、テスト不足、API・設定の互換、パフォーマンス、保守性。Bと重複・矛盾する点があれば明示してください。
```

### PR-B向け

上記のA/Bを入れ替えて同様に記載する。

### レビュアーアサインの目安

- 実装者A → 主に**PR-B**をレビュー（PR-Aと`A...B`を参照）
- 実装者B → 主に**PR-A**をレビュー（PR-Bと`A...B`を参照）
- 採用の最終整理はテックリードまたは第三者（統合責任者）が親Issueに記載する

## 3. 統合責任者向けテンプレート（親Issueに追記）

親Issueの「統合・改善計画」セクションを埋める。未定ならチェックボックスだけ置き、決定したら更新する。

- **要件マッピング**: 各要件がA/Bのどこで満たされているか
- **採用方針**: 主軸ブランチ、もう一方から取り込む・捨てる・後続PR
- **マージ順**: コンフリクト、マイグレーション、公開APIの依存
- **統合後の改善**: 重複削除、命名、テスト、ドキュメント
- **リスクとロールバック**

## 4. 1本化の実行パターン（ローカル）

ブランチ名は例。実際の名前に置き換える。マージ前にCIとレビュー承認を済ませること。

### パターンA: 短寿命の統合ブランチ

```powershell
git fetch origin
git checkout -b integration/ab origin/main
git merge --no-ff origin/REPLACE_BRANCH_A -m "merge: REPLACE_BRANCH_A into integration"
# コンフリクト解消後
git merge --no-ff origin/REPLACE_BRANCH_B -m "merge: REPLACE_BRANCH_B into integration"
# テスト実行後、GitHubにpushしintegration → mainのPRを開く
```

### パターンB: ベースへ順次マージ

```powershell
git fetch origin
git checkout main
git pull origin main
# PR-AをGitHub上でマージ後
git checkout REPLACE_BRANCH_B
git rebase origin/main   # またはmerge。方針に合わせる
# 解消・テスト後にPR-Bを更新してマージ
```

### 避けたいこと

採用理由を残さないまま大きなsquashのみで片方の文脈を消すこと。親Issueの「決定ログ」に、何をどちらから採用したかを残すことを推奨する。

## 5. 関連ファイル

| 用途 | パス |
|------|------|
| 親Issueテンプレ | [.github/ISSUE_TEMPLATE/integration-compare-review.md](../.github/ISSUE_TEMPLATE/integration-compare-review.md) |
| PRチェックリスト | [.github/PULL_REQUEST_TEMPLATE/comparative-review.md](../.github/PULL_REQUEST_TEMPLATE/comparative-review.md) |
| 比較用URLの出力 | [scripts/print-github-compare-urls.ps1](../scripts/print-github-compare-urls.ps1) |
