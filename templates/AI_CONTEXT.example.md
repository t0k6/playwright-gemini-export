# AI_CONTEXT

## Purpose
この Playwright 一式は、E2E テストコードの生成・修修正・レビュー支援のために Gemini に渡す。

## Test Style
- `test.describe` を使う
- spec には業務シナリオ中心を書く
- 画面操作ロジックは page object / helper に寄せる
- `waitForTimeout` は原則禁止
- locator は `data-testid` 優先
- brittle な `nth()` や曖昧な text match は極力避ける

## Page Object Policy
- 画面単位の責務を pages に寄せる
- spec から直接複雑な locator を書かない
- 再利用できる UI 操作は helper 化する

## Environment Assumptions
- staging 環境前提
- 認証済み state を使う場合がある
- 実顧客データは禁止
- 実シークレットは禁止

## Output Expectations
- 既存流儀に合わせる
- 差分は最小にする
- 足りないファイルがある場合は推測しすぎず明示する
- 新規 spec を作る場合は、既存の fixture / helper / page object を優先利用する

## Common Review Points
- flaky な待機になっていないか
- assertion が弱すぎないか
- UI変化に脆い locator になっていないか
- 再利用可能な処理を spec にベタ書きしていないか

