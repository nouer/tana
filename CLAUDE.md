# Tana - 在庫管理アプリ

小規模事業者向けの在庫管理アプリ（消耗品・物販商品）

## プロジェクト構造

```
tana/
├── local_app/                 # アプリ本体（PWA）
│   ├── index.html             # メインHTML（SPA）
│   ├── script.js              # UI操作・DB操作（IndexedDB）
│   ├── tana.calc.js           # 純粋関数（計算・バリデーション）
│   ├── style.css              # スタイルシート
│   ├── sw.js                  # Service Worker（オフライン対応）
│   ├── version.js             # バージョン情報（ビルド時自動生成）
│   ├── manifest.json          # PWAマニフェスト
│   ├── sample_data.json       # サンプルデータ
│   ├── manual.html            # ユーザーマニュアル（ビルド時生成）
│   ├── notify.html            # 通知ページ
│   ├── promotion.html         # プロモーションページ
│   ├── tana.calc.test.js      # ユニットテスト（Jest）
│   ├── e2e.test.js            # E2Eテスト（Puppeteer）
│   ├── icons/                 # PWAアイコン（SVG→PNG生成）
│   └── lib/
│       └── html5-qrcode.min.js  # バーコードスキャナー（唯一の外部ライブラリ）
├── docs/                      # ドキュメント
│   ├── requirements_definition.md  # 要件定義書
│   ├── basic_design.md        # 基本設計書
│   ├── detailed_design.md     # 詳細設計書
│   ├── algorithm_logic.md     # アルゴリズム・計算ロジック
│   ├── test_specification.md  # テスト仕様書
│   ├── manual.md              # ユーザーマニュアル（Markdown原本）
│   └── promotion.md           # プロモーション用テキスト
├── scripts/                   # ビルド・ユーティリティスクリプト
│   ├── build.sh               # Docker ビルド＆起動
│   ├── rebuild.sh             # 強制リビルド
│   ├── build-docs.sh          # Markdown→HTML変換（manual, promotion）
│   ├── generate-icons.sh      # SVG→PNGアイコン生成
│   ├── generate_version.sh    # version.js 生成
│   └── md-to-html.py          # Markdown→HTMLコンバーター
├── tools/                     # 開発補助ツール
│   ├── generate_sample_data.js  # サンプルデータ生成
│   └── take_screenshots.js    # スクリーンショット取得
├── tasks/                     # タスク管理
│   ├── todo.md                # 進行中タスク
│   └── lessons.md             # 学んだ教訓
├── nginx/
│   └── default.conf           # Nginx設定
├── Dockerfile                 # アプリ用Dockerfile（Nginx）
├── Dockerfile.test            # テスト用Dockerfile（Puppeteer）
├── docker-compose.yml         # Docker Compose定義
├── package.json               # npm設定（Jest）
└── README.md                  # プロジェクト概要
```

## 開発コマンド

```bash
# Docker ビルド＆起動（ポート 8088）
bash scripts/build.sh

# 強制リビルド
bash scripts/rebuild.sh

# ユニットテスト
npm test

# E2Eテスト（Docker内で実行）
docker compose run --rm tana-test
```

## コーディング規約

- `tana.calc.js` には純粋関数のみ（DOM操作・IndexedDB操作禁止）
- `script.js` にUI操作・DB操作を集約
- 外部ライブラリ追加禁止（html5-qrcodeのみ例外、ローカル同梱）
- HTML特殊文字は必ず `escapeHtml()` でエスケープ

## コミットメッセージ

- コミットメッセージは常に日本語で記述してください。
- 英語プレフィックス (`docs:`, `chore:` 等) は使わないでください。

## コミット対象ファイル

- `local_app/sw.js` と `local_app/version.js` は必ずコミットに含めること
  - これらはビルド時に自動生成されるが、PWAのアップデート検出に必要
  - `sw.js` の `CACHE_NAME` が変わることでブラウザが新バージョンを検知する
  - `version.js` の `buildTime` がアプリ内のバージョン表示に使われる

## ワークフロー設計

### Plan モード
- 大きな機能変更はまず Plan モードで設計してからコード変更に移る
- 途中でうまくいかなくなったら、無理に進めず立ち止まって再計画する

### サブエージェント
- 独立したファイル調査・リサーチは Agent ツールに委任する
- メインのコンテキストウィンドウをクリーンに保つ

## タスク管理

- `tasks/todo.md` で進行中タスクを管理（チェックリスト形式）
- `tasks/lessons.md` で学んだ教訓を記録（修正を受けたら必ず追記）
- 完了した項目は随時マークし、各ステップで高レベルのサマリーを提供する

## ブラウザ操作・スクリーンショット

- E2Eテストの動作確認、マニュアル用スクリーンショット取得など、ブラウザ操作が必要な場合は **Playwright MCP** を使用する
- Puppeteer スクリプト（`tools/take_screenshots.js` 等）は使わず、Playwright MCP の `browser_navigate` / `browser_snapshot` / `browser_take_screenshot` / `browser_click` 等のツールで直接操作する
- アプリの URL は `http://localhost:8088`

## 完了前検証ルール

- `npm test` でユニットテストが全件パス
- `docker compose run --rm tana-test` でE2Eテストが全件パス
- 変更したコードに関連するドキュメントが更新済み
- 動作を証明できるまでタスクを完了とマークしない

## ドキュメント更新ルール

- バリデーションルール、フィールドの必須/任意、UI挙動を変更した場合は、必ず `docs/` 配下の該当ドキュメントも同時に更新する
- コミット前にドキュメントの更新漏れがないか確認する
- 対象ドキュメントと更新基準:
  - `docs/requirements_definition.md` — フィールドの追加/削除/必須変更、機能要件の変更
  - `docs/detailed_design.md` — バリデーションルール変更、UI要素の追加/変更、画面構成の変更
  - `docs/test_specification.md` — テストケースの追加/変更/削除
  - `docs/algorithm_logic.md` — 計算ロジック、アルゴリズムの変更
  - `README.md` — 機能追加時にセクション更新

## バグ修正時の横展開ルール

バグを修正する際は、同じ種類のバグが他の画面/コンポーネントにも存在しないか確認すること:
1. 修正するバグの「類型」を特定する（例: undefined表示、内部値漏出、CSSクラス不一致）
2. 同じ類型のバグがないか全UIを走査するE2Eテストを追加する
3. テストが全画面でパスすることを確認してから修正完了とする

## コア原則

- **シンプル第一**：すべての変更をできる限りシンプルにする。影響するコードを最小限にする。
- **手を抜かない**：根本原因を見つける。一時的な修正は避ける。
- **影響を最小化する**：変更は必要な箇所のみにとどめる。
