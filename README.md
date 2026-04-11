# Playwright → Gemini Export Tool

PlaywrightのE2Eテストコードを、安全にGeminiに渡すためのサニタイズエクスポートツール。

## 目的

- プロジェクトのgitリポジトリは機密
- GitHubミラーは禁止
- Google Workspace上のGemini/NotebookLMを活用したい
- そのため、AIに渡してよい最小限のコード断面だけを抽出する

## 特徴

- `sourcePaths`によるallowlist方式（基本）
- 典型的な危険ディレクトリや成果物の除外
- テキストベースの簡易redaction
- fixtures/sandboxの構造化ファイル（JSON/YAML）の匿名化（決定的擬似化）
- AI用README自動生成（`README_FOR_AI.md`）
- manifest出力による人間レビュー
- sensitiveっぽい内容へのwarning
- `--check`（dry-run）で「何が出るか」だけ確認可能
- `--pack` で `outDir/_pack/` に index・chunk・bundle を生成（Gemini / NotebookLM 向けの分割成果物。詳細は [docs/gemini-workflow.md](docs/gemini-workflow.md)）

## 前提

Node.js 18以上を推奨

## セットアップ

### まず置く場所（共通）

この手順は、**エクスポートしたいPlaywrightプロジェクト（Playwrightのテストを含むリポジトリ）**で実行します。
迷ったら、そのリポジトリの`package.json`があるフォルダーへ移動してから進めてください。
モノレポで`package.json`が複数ある場合は、Playwrightのテストが含まれるパッケージ側を選びます。
次のファイル・ディレクトリは、**コマンドを実行するフォルダー**を基準に置きます。

| 置くもの | 場所（ルートからの相対） | 役割 |
| --- | --- | --- |
| `.gemini-export.json` | ルート直下 | allowlist などの設定（必須。ない場合は内蔵デフォルトとマージ） |
| `tools/` 一式 | `tools/export-gemini-playwright-context.mjs` ほか | CLI 本体（自プロジェクトへ取り込む場合） |
| 出力 | 既定では `.ai-context/playwright-gemini/`（`outDir` で変更可） | Gemini に渡す成果物（`.gitignore` 推奨） |

`sourcePaths` や `outDir` に書くパスは、**いずれもコマンドを実行するフォルダーからの相対パス**です。

### 実行場所ごとの例（モノレポルート / `playwright/`）

`sourcePaths` の書き方は、**どこでコマンドを実行するか**で変わります。まずは、次の例のいずれで運用するかを決めてください。

#### 例A: モノレポルートで実行する（`playwright/` が直下にある）

- **実行する場所**: モノレポのルート
- **`sourcePaths` の例**: `playwright/` で始める

`.gemini-export.example.json` は、この例A（モノレポルート実行）を想定したサンプルです。

```json
{
  "sourcePaths": [
    "playwright/tests",
    "playwright/pages",
    "playwright/helpers",
    "playwright/fixtures/sandbox",
    "playwright/playwright.config.ts",
    "playwright/AI_CONTEXT.md"
  ],
  "outDir": ".ai-context/playwright-gemini"
}
```

#### 例B: `playwright/` で実行する（設定・出力も `playwright/` 配下に閉じる）

- **実行する場所**: `playwright/` ディレクトリ
- **`sourcePaths` の例**: `playwright/` を付けない

```json
{
  "sourcePaths": [
    "tests",
    "pages",
    "helpers",
    "fixtures/sandbox",
    "playwright.config.ts",
    "AI_CONTEXT.md"
  ],
  "outDir": ".ai-context/playwright-gemini"
}
```

#### 例C: ツールのルートとモノレポのルートを分ける

モノレポのルートに `package.json` があり、このツール側にも `package.json` や `.gemini-export.json` を置くため、**同じディレクトリに両方を置きたくない**場合の例です。モノレポのチェックアウト先を子フォルダー `workdir/` にまとめ、**常にその親でコマンドを実行**します。

- **実行する場所**: `workdir` の親（例では `export-workspace/`）。このフォルダーに、このリポジトリの `package.json`・`tools/`・`.gemini-export.json` を置く。
- **`workdir/`**: モノレポのルート（`workdir/playwright/`がPlaywright用のルートになる構成を想定）。Gitのsparse checkoutで`playwright/`だけを展開してもよい。
- **`sourcePaths`の例**: 例Aと同じ並びだが、先頭に`workdir/`を付ける。

```text
export-workspace/          ← ここで npm run export（process.cwd() がこのツールのルート）
  .gemini-export.json
  package.json
  tools/
  workdir/                 ← モノレポのルート
    playwright/
      tests/
      ...
```

```json
{
  "sourcePaths": [
    "workdir/playwright/tests",
    "workdir/playwright/pages",
    "workdir/playwright/helpers",
    "workdir/playwright/fixtures/sandbox",
    "workdir/playwright/playwright.config.ts",
    "workdir/playwright/AI_CONTEXT.md"
  ],
  "outDir": ".ai-context/playwright-gemini"
}
```

`includeFiles`（ロックファイルや `tsconfig.json` など）も、**すべて実行時のルートからの相対パス**です。モノレポ側のファイルを含めたい場合は、例として `workdir/package.json` のように `workdir/` を付けて列挙してください。

##### 注意

- `export-workspace/gemini-export-playwright/` と `export-workspace/workdir/` を**兄弟**にし、常に前者だけに `cd` して実行すると、モノレポへ向けるパスが `../workdir/...` になります。設定では **`..` を含む相対パスは使えない**ため、この配置のままでは困りがちです。**親を1つにまとめる**（この例Cの形）か、実行時は必ず `workdir` を子として含む親に `cd` してください。
- リポジトリ外に解決するシンボリックリンクはエクスポート対象外になることがあります（[CI での推奨](#ci-での推奨)の固定タグ `[symlink-outside-repo]` など）。

### パターンA: このリポジトリをクローンして使う

1. GitHubからこのリポジトリを任意の作業フォルダーにクローンする。
2. クローンしたディレクトリに移動する（以降、このディレクトリがルート）。モノレポのルートとツールのルートを分けたい場合は、[例C](#例c-ツールのルートとモノレポのルートを分ける) のレイアウトに合わせて親フォルダーへファイルを置き、`workdir/` にモノレポをチェックアウトしてもよい。
3. `npm install` で依存関係を入れる。
4. ルートに設定ファイルを作る。`.gemini-export.example.json`をコピーして`.gemini-export.json`という名前で置く。
5. 必要に応じて`sourcePaths`を修正する（後述の「推奨設定」も参照）。
6. ルートにいる状態で `npm run export:gemini:pw:check` を試し、問題なければ `npm run export:gemini:pw` を実行する。

本リポジトリではローカル用の `.gemini-export.json` を `.gitignore` しているため、手元では例からコピーして編集してください。

### パターンB: 既存の別プロジェクト（自前の Playwright リポジトリ）に組み込む

npmパッケージとしては公開していない（`package.json` は `private`）ため、**ツールのファイルを対象プロジェクト側へ取り込む**形になります。

1. このリポジトリから **`tools/` ディレクトリ全体**（`export-gemini-playwright-context.mjs`・`gemini-export/`・`lib/`）を、**対象プロジェクトのルート直下**にコピーする（ディレクトリ構成はこのリポジトリと同じ `tools/...` を推奨）。
2. 対象プロジェクトの `package.json` に、依存として `yaml`（例: `"yaml": "^2.8.3"`）と、`export:gemini:pw` / `export:gemini:pw:check` 用の `scripts` を追加する（中身はこのリポジトリの `package.json` をそのまま流用できる）。
3. 対象プロジェクトのルートで `npm install` を実行する。
4. 対象プロジェクトのルートに `.gemini-export.json` を置く（このリポジトリの `.gemini-export.example.json` をコピーしてリネームし、プロジェクトのディレクトリ構成に合わせて `sourcePaths` を編集する）。
5. **必ず対象プロジェクトのルートに `cd` した状態**で `npm run export:gemini:pw:check` → 問題なければ `npm run export:gemini:pw` を実行する。

チームで設定を共有したい場合は、自プロジェクトの運用に合わせて `.gemini-export.json` をリポジトリにコミットしてよい（機密が含まれないことを確認すること）。

## 実行

### 通常実行（書き込みあり）

```bash
npm run export:gemini:pw
```

### dry-run（書き込みなし）

```bash
npm run export:gemini:pw:check
```

### Pack（index / chunk / bundle）

コンテキストウィンドウに収めやすいよう、`outDir` 配下の `_pack/` に索引・チャンク・バンドルを追加生成します。運用の考え方は [docs/gemini-workflow.md](docs/gemini-workflow.md) を参照してください。

```bash
npm run export:gemini:pw:pack
```

（同等: `npm run export:gemini:pw -- --pack`）

`--check` と併用した場合は `_pack/` は作らず、標準出力に chunk / bundle 数の概算のみ出します。

```bash
npm run export:gemini:pw:check -- --pack
```

`.gemini-export.json` の `pack`（`chunkMaxLines` / `bundleGroupDepth` / `outSubDir`）で調整できます。既定値は [tools/gemini-export/default-config.mjs](tools/gemini-export/default-config.mjs) の `pack` を参照してください。

## CI での推奨

- **本番相当のリポジトリ**では、パイプラインで`npm run export:gemini:pw`（または先に`export:gemini:pw:check`）を実行し、**`failOnWarnings: true`**を有効にすると、機密っぽい検知・設定ミス・セキュリティ関連スキップを警告のまま放置しにくくなります。設定例の断片は[templates/gemini-export.ci.snippet.json](templates/gemini-export.ci.snippet.json)を参照し、`.gemini-export.json`にマージしてください。
- ローカルでは`--check`で差分を確認し、問題なければ通常実行、という流れが安全です。
- `manifest.json`の`warnings`/`skippedFiles`に、次の**固定タグ**が付いた行がないか毎回確認してください（自動検索・レビュー用）。
  - `[symlink-outside-repo]` … シンボリックリンクがリポジトリ外に解決した、または解決不能
  - `[path-outside-repo]` … 解決先がリポジトリ外（通常ファイルパス）
  - `[dest-outside-outDir]` … 出力パスが`outDir`外にならないよう拒否された
  - `[unsafe-relative-path]` … エクスポート相対パスに`..`セグメントが含まれる
  - `[realpath-failed]` …`realpath`/`stat`に失敗（壊れたリンクなど）

## 出力先

```text
.ai-context/playwright-gemini/
  ... サニタイズ済みのコピー ...
  manifest.json
  README_FOR_AI.md   # 生成が有効な場合
  _pack/             # `npm run export:gemini:pw -- --pack` 実行時のみ
```

サニタイズ済みツリーに加え、Pack を付けた場合は `_pack/` 内の `PROJECT_INDEX.md` や `bundles/` を NotebookLM や Gemini チャットに渡す運用が可能です。

## 推奨設定

まずは`sourceDir`ではなく`sourcePaths`を使う（`sourceDir`は非対応）。

例（モノレポルートで実行する場合）:

```json
{
  "sourcePaths": [
    "playwright/tests",
    "playwright/pages",
    "playwright/helpers",
    "playwright/fixtures/sandbox",
    "playwright/playwright.config.ts",
    "playwright/AI_CONTEXT.md"
  ]
}
```

## AI向け説明ファイル

- `playwright/AI_CONTEXT.md`:人間がメンテするプロジェクト固有知識（テスト流儀・禁則・環境前提など）
- `README_FOR_AI.md`:ツールが生成する「この出力物の説明」

`templates/AI_CONTEXT.example.md`を起点に、対象リポジトリ側で`playwright/AI_CONTEXT.md`を用意する運用を推奨。

## 重要な注意

- redactionは補助。漏洩防止の本体はallowlist（`sourcePaths`）
- `fixtures/real` / `fixtures/private` / `auth` / `storageState`などはexportしない（設定ミスはwarning扱い）
- `manifest.json`は毎回人間が確認する
- warningが出たら無視しない（必要なら`failOnWarnings: true`）
- 実行時にNOTICEが標準出力されるので、内容を確認する
- fixtureに実データを入れない（sandbox/realを分離する）

## 推奨運用

- `AI_CONTEXT.md`を人間が管理する
- fixtureはsandbox/realを分離する
- 実際にGeminiに渡す前に出力物をレビューする
