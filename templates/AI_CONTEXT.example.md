# AI_CONTEXT

## Purpose

このPlaywright一式は、E2Eテストコードの生成・修正・レビュー支援のためにGeminiに渡す。

## Test Style

- `test.describe`を使う
- specには業務シナリオ中心を書く
- 画面操作ロジックはpage object / helperに寄せる
- `waitForTimeout`は原則禁止
- locatorは`data-testid`優先
- brittleな`nth()`や曖昧なtext matchは極力避ける

## Page Object Policy

- 画面単位の責務をpagesに寄せる
- specから直接複雑なlocatorを書かない
- 再利用できるUI操作はhelper化する

## Environment Assumptions

- staging環境前提
- 認証済みstateを使う場合がある
- 実顧客データは禁止
- 実シークレットは禁止

## Output Expectations

- 既存流儀に合わせる
- 差分は最小にする
- 足りないファイルがある場合は推測しすぎず明示する
- 新規specを作る場合は、既存のfixture / helper / page objectを優先利用する

## Common Review Points

- flakyな待機になっていないか
- assertionが弱すぎないか
- UI変化に脆いlocatorになっていないか
- 再利用可能な処理をspecにベタ書きしていないか
