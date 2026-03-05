# Tana - 在庫管理アプリ 基本設計書

## 1. アーキテクチャ概要

### 設計方針

| 方針 | 説明 |
|------|------|
| オフラインファースト | PWA + IndexedDB により、ネットワーク接続なしで全機能が動作する |
| シングルページアプリケーション | タブ切替式の SPA。ページ遷移なしで全画面を表示する |
| 外部サーバー不要 | データはすべてブラウザ内の IndexedDB に保存。バックエンドサーバーを必要としない |
| 外部ライブラリ最小 | html5-qrcode のみ使用（ローカル同梱でオフライン対応） |
| モバイルファースト | スマートフォンでの操作を最優先としたレスポンシブデザイン |
| Vanilla 技術スタック | フレームワーク不使用。Vanilla JavaScript (ES6+) + Vanilla CSS + CSS Custom Properties |

### システム構成図

```
┌─────────────────────────────────────────┐
│            ブラウザ (PWA)                │
│                                         │
│  ┌─────────────┐  ┌──────────────────┐  │
│  │ index.html  │  │    script.js     │  │
│  │ style.css   │  │   (UI操作/DB操作) │  │
│  │             │  │                  │  │
│  │             │  │  tana.calc.js    │  │
│  │             │  │   (純粋関数)     │  │
│  └─────────────┘  └───────┬──────────┘  │
│                           │             │
│  ┌────────────────────────┴──────────┐  │
│  │        IndexedDB (TanaDB)         │  │
│  │  products | stock_transactions    │  │
│  │  inventory_counts | app_settings  │  │
│  └───────────────────────────────────┘  │
│                                         │
│  ┌─────────────┐  ┌──────────────────┐  │
│  │    sw.js    │  │  manifest.json   │  │
│  │ (キャッシュ) │  │   (PWA設定)      │  │
│  └─────────────┘  └──────────────────┘  │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │      html5-qrcode.min.js         │  │
│  │     (バーコードスキャン)           │  │
│  └───────────────────────────────────┘  │
└──────────────────┬──────────────────────┘
                   │ 初回ダウンロードのみ
┌──────────────────┴──────────────────────┐
│       Docker + nginx:alpine             │
│       (静的ファイル配信・ポート 8088)     │
└─────────────────────────────────────────┘
```

### JavaScript モジュール分割方針

| ファイル | 役割 | 制約 |
|----------|------|------|
| `script.js` | UI 操作、DOM 操作、IndexedDB CRUD、イベントハンドラ、タブ切替、オーバーレイ制御 | tana.calc.js の関数を `window.TanaCalc.*` 経由で呼び出す |
| `tana.calc.js` | 純粋計算関数（在庫計算、バリデーション、フォーマット、検索・ソート・フィルタ、レポート生成） | DOM 操作禁止、IndexedDB 操作禁止。Node.js / ブラウザ両対応 |
| `version.js` | バージョン情報（`window.APP_INFO`） | ビルドスクリプトで自動生成 |
| `sw.js` | Service Worker（キャッシュ管理、オフライン対応） | 独立スコープ |

---

## 2. ディレクトリ構成

```
tana/
├── local_app/                    # Web アプリケーション（nginx 配信ルート）
│   ├── index.html                # SPA エントリポイント（全画面・オーバーレイ定義）
│   ├── style.css                 # スタイルシート（モバイルファースト + レスポンシブ）
│   ├── script.js                 # UI操作・DB操作・イベントハンドラ
│   ├── tana.calc.js              # 純粋計算関数（テスト可能）
│   ├── sw.js                     # Service Worker（キャッシュ戦略）
│   ├── version.js                # バージョン情報（自動生成）
│   ├── manifest.json             # PWA マニフェスト
│   ├── notify.html               # お知らせページ
│   ├── manual.html               # マニュアル（MD から自動生成）
│   ├── promotion.html            # 紹介ページ（MD から自動生成）
│   ├── sample_data.json          # サンプルデータ
│   ├── e2e.test.js               # E2E テスト（Playwright）
│   ├── tana.calc.test.js         # ユニットテスト（Jest）
│   ├── icons/                    # PWA アイコン
│   │   ├── icon.svg              # マスター SVG
│   │   ├── icon-maskable.svg     # マスカブル SVG
│   │   ├── icon-512.png          # 512x512 アイコン
│   │   ├── icon-192.png          # 192x192 アイコン
│   │   ├── icon-maskable-512.png # マスカブル 512x512
│   │   ├── apple-touch-icon.png  # Apple Touch アイコン
│   │   ├── favicon-32.png        # ファビコン 32x32
│   │   └── favicon-16.png        # ファビコン 16x16
│   └── lib/                      # 外部ライブラリ（ローカル同梱）
│       └── html5-qrcode.min.js   # バーコードスキャンライブラリ
├── docs/                         # Markdown ドキュメント
│   ├── requirements_definition.md  # 要件定義書
│   ├── basic_design.md             # 基本設計書（本書）
│   ├── detailed_design.md          # 詳細設計書
│   ├── algorithm_logic.md          # アルゴリズム・ロジック仕様書
│   ├── test_specification.md       # テスト仕様書
│   ├── manual.md                   # マニュアル（HTML 生成元）
│   └── promotion.md                # 紹介ページ（HTML 生成元）
├── scripts/                      # ビルド・ユーティリティスクリプト
│   ├── build.sh                  # Docker ビルド＆起動
│   ├── rebuild.sh                # 強制リビルド
│   ├── build-docs.sh             # ドキュメント HTML 生成
│   ├── md-to-html.py             # MD → HTML 変換
│   ├── generate-icons.sh         # PWA アイコン生成（SVG → PNG）
│   └── generate_version.sh       # バージョン情報生成（version.js）
├── tools/                        # 開発ツール
│   ├── generate_sample_data.js   # サンプルデータ生成
│   └── take_screenshots.js       # スクリーンショット撮影（Playwright）
├── nginx/
│   └── default.conf              # nginx 設定（JS/CSS キャッシュ無効化）
├── docker-compose.yml            # Docker Compose 定義（3 サービス）
├── Dockerfile                    # アプリ用（nginx:alpine）
├── Dockerfile.test               # テスト用（Playwright）
├── package.json                  # npm 設定（テスト依存）
├── README.md                     # プロジェクト概要
└── CLAUDE.md                     # AI 開発ガイドライン
```

---

## 3. データモデル

### 3.1 IndexedDB 構成

| 項目 | 値 |
|------|-----|
| データベース名 | `TanaDB` |
| バージョン | `1` |
| オブジェクトストア数 | 4 |

| オブジェクトストア | 主キー | 説明 |
|-------------------|--------|------|
| `products` | `id` | 商品マスター |
| `stock_transactions` | `id` | 入出庫履歴 |
| `inventory_counts` | `id` | 棚卸記録 |
| `app_settings` | `id` | アプリ設定（キーバリュー形式） |

### 3.2 インデックス定義

**products**

| インデックス名 | 対象フィールド | ユニーク |
|---------------|---------------|---------|
| `productCode` | `productCode` | Yes |
| `janCode` | `janCode` | No |
| `name` | `name` | No |
| `nameKana` | `nameKana` | No |
| `category` | `category` | No |
| `isActive` | `isActive` | No |

**stock_transactions**

| インデックス名 | 対象フィールド | ユニーク |
|---------------|---------------|---------|
| `productId` | `productId` | No |
| `transactionType` | `transactionType` | No |
| `date` | `date` | No |
| `lotNumber` | `lotNumber` | No |
| `expiryDate` | `expiryDate` | No |

**inventory_counts**

| インデックス名 | 対象フィールド | ユニーク |
|---------------|---------------|---------|
| `countDate` | `countDate` | No |
| `status` | `status` | No |

**app_settings**

インデックスなし（主キー `id` のみ）。

### 3.3 レコード構造

#### products（商品マスター）

```json
{
  "id": "prod_hari_001",
  "productCode": "P-0001",
  "name": "マッサージオイル",
  "nameKana": "まっさーじおいる",
  "category": "consumable",
  "janCode": "4901234567890",
  "unit": "本",
  "defaultPrice": 1500,
  "costPrice": 800,
  "photo": null,
  "trackExpiry": true,
  "expiryAlertDays": 30,
  "minStock": 5,
  "supplier": "サンプル商事",
  "notes": "",
  "isActive": true,
  "createdAt": "2026-03-01T10:00:00.000Z",
  "updatedAt": "2026-03-01T10:00:00.000Z"
}
```

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `id` | string | Yes | 主キー（`Date.now().toString(36)` + ランダム文字列で生成） |
| `productCode` | string | Yes | 商品コード（`P-NNNN` 形式、自動採番、一意） |
| `name` | string | Yes | 商品名（1〜100文字） |
| `nameKana` | string | No | 商品名ふりがな（ひらがなのみ） |
| `category` | string | Yes | カテゴリ（`consumable`: 消耗品 / `retail`: 物販） |
| `janCode` | string | No | JANコード（JAN-8 または JAN-13、チェックディジット検証） |
| `unit` | string | No | 単位（例: 個、本、箱） |
| `defaultPrice` | number | No | 販売価格（0以上） |
| `costPrice` | number | No | 仕入価格（0以上） |
| `photo` | string/null | No | 写真データ（圧縮 base64 文字列） |
| `trackExpiry` | boolean | No | 使用期限管理の有効/無効 |
| `expiryAlertDays` | number | No | 期限アラートを表示する残日数（デフォルト 30） |
| `minStock` | number | No | 最低在庫数（0以上。下回ると在庫不足アラート表示） |
| `supplier` | string | No | 仕入先 |
| `notes` | string | No | 備考 |
| `isActive` | boolean | No | 有効フラグ（論理削除用） |
| `createdAt` | string | Yes | 作成日時（ISO 8601） |
| `updatedAt` | string | Yes | 更新日時（ISO 8601） |

#### stock_transactions（入出庫履歴）

```json
{
  "id": "m1n2o3p4q5r6s7t8w",
  "productId": "prod_hari_001",
  "transactionType": "receive",
  "quantity": 10,
  "date": "2026-03-01",
  "lotNumber": "LOT-2026A",
  "expiryDate": "2027-03-01",
  "unitCost": 800,
  "notes": "月初仕入れ",
  "createdAt": "2026-03-01T10:30:00.000Z"
}
```

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `id` | string | Yes | 主キー |
| `productId` | string | Yes | 対象商品の `products.id` |
| `transactionType` | string | Yes | 取引種別（後述） |
| `quantity` | number | Yes | 数量（0以外の数値） |
| `date` | string | Yes | 取引日（`YYYY-MM-DD` 形式） |
| `lotNumber` | string | No | ロット番号 |
| `expiryDate` | string | No | 使用期限（`YYYY-MM-DD` 形式） |
| `unitCost` | number | No | 仕入単価 |
| `notes` | string | No | 備考（最大 1000 文字） |
| `createdAt` | string | Yes | 作成日時（ISO 8601） |

**transactionType の種別と在庫への影響**

| 種別 | 日本語名 | 在庫計算 | 発生条件 |
|------|---------|---------|---------|
| `receive` | 入庫 | `+quantity` | ユーザーが入庫フォームから登録 |
| `use` | 使用 | `-quantity` | ユーザーが使用フォームから登録 |
| `sell` | 販売 | `-quantity` | ユーザーが販売フォームから登録 |
| `adjust` | 棚卸調整 | `+quantity`（符号付き） | 棚卸完了時に自動生成（差異がある場合） |
| `dispose` | 廃棄 | `-quantity` | ユーザーが廃棄操作を実行 |

#### inventory_counts（棚卸記録）

```json
{
  "id": "i9j0k1l2m3n4o5p6q",
  "countDate": "2026-03-01",
  "status": "completed",
  "items": [
    {
      "productId": "prod_hari_001",
      "productName": "マッサージオイル",
      "systemQty": 10,
      "actualQty": 9
    }
  ],
  "completedAt": "2026-03-01T15:00:00.000Z",
  "createdAt": "2026-03-01T14:00:00.000Z"
}
```

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `id` | string | Yes | 主キー |
| `countDate` | string | Yes | 棚卸日（`YYYY-MM-DD` 形式） |
| `status` | string | Yes | ステータス（`in_progress` / `completed`） |
| `items` | array | Yes | 棚卸項目の配列 |
| `items[].productId` | string | Yes | 対象商品の `products.id` |
| `items[].productName` | string | Yes | 商品名（スナップショット） |
| `items[].systemQty` | number | Yes | システム上の在庫数（棚卸開始時点） |
| `items[].actualQty` | number/null | No | 実地棚卸数量（未カウントは `null`） |
| `completedAt` | string | No | 完了日時（ISO 8601、完了時に設定） |
| `createdAt` | string | Yes | 作成日時（ISO 8601） |

#### app_settings（設定）

```json
{
  "id": "clinic_info",
  "value": {
    "clinicName": "サンプル治療院",
    "ownerName": "山田太郎",
    "zipCode": "100-0001",
    "address": "東京都千代田区千代田1-1",
    "phone": "03-1234-5678"
  }
}
```

キーバリュー形式。`id` が設定キー、`value` が設定値（任意の型）。

**設定キー一覧**

| キー | 値の型 | 説明 |
|------|-------|------|
| `clinic_info` | object | クリニック・サロン情報（名前、オーナー名、郵便番号、住所、電話番号） |
| `inventory_settings` | object | 在庫管理設定（期限アラート日数、スキャン音、デフォルト取引種別） |
| `notification_enabled` | boolean | 通知の有効/無効 |
| `notification_hash` | string | 通知コンテンツの SHA-256 ハッシュ（既読判定用） |
| `notification_content` | string | 通知コンテンツのキャッシュ |
| `last_export_time` | string | 最終エクスポート日時（ISO 8601） |

### 3.4 エクスポート/インポートデータ形式

データのバックアップ・復元には JSON ファイルを使用する。

```json
{
  "appName": "tana",
  "version": "1.0.0",
  "exportDate": "2026-03-01T15:00:00.000Z",
  "products": [ ... ],
  "stock_transactions": [ ... ],
  "inventory_counts": [ ... ],
  "settings": { ... }
}
```

インポート時のバリデーション:
- `appName` が `"tana"` であること
- `products` が配列であり、各要素に `id` が存在すること
- `stock_transactions` が配列であること
- `inventory_counts` が配列であること
- `settings` がオブジェクトであること（存在する場合）

---

## 4. 画面設計

### 4.1 タブ構成

6 タブ構成の SPA。メインナビゲーションはヘッダー直下に横並びで配置する。

| # | タブ名 | data-tab 値 | 内容 |
|---|--------|------------|------|
| 1 | ダッシュボード | `dashboard` | アラート表示、概要サマリー、クイックアクション |
| 2 | 商品 | `products` | 商品一覧・検索・フィルタ・追加 |
| 3 | 入出庫 | `transactions` | 入庫/使用/販売フォーム、履歴閲覧 |
| 4 | 棚卸 | `inventory` | 棚卸の開始・実施・完了、棚卸履歴 |
| 5 | レポート | `reports` | 各種レポート閲覧 |
| 6 | 設定 | `settings` | クリニック情報、在庫管理設定、データ管理 |

### 4.2 サブタブ構成

2 つのタブがサブタブを持つ。

**入出庫タブ**

| サブタブ | data-subtab 値 | 内容 |
|---------|---------------|------|
| 入庫 | `receive` | 入庫フォーム（商品選択、数量、日付、仕入単価、ロット番号、使用期限、備考） |
| 使用 | `use` | 使用フォーム（商品選択、数量、日付、備考） |
| 販売 | `sell` | 販売フォーム（商品選択、数量、日付、備考） |
| 履歴 | `history` | 取引履歴一覧（日付範囲・商品・種別でフィルタ可能） |

**レポートタブ**

| サブタブ | data-subtab 値 | 内容 |
|---------|---------------|------|
| 在庫一覧 | `report-stock` | 商品別の在庫数・在庫金額（カテゴリフィルタ、並び替え対応） |
| 入出庫履歴 | `report-history` | 取引履歴レポート（日付範囲・商品・種別でフィルタ可能） |
| 使用期限 | `report-expiry` | 使用期限が設定された商品のロット別期限状態 |
| 棚卸差異 | `report-variance` | 棚卸セッション別の差異レポート |

### 4.3 画面フロー

```
アプリ起動
│
├── [ダッシュボード]
│   ├── 在庫不足アラート → (商品タップで商品詳細へ)
│   ├── 使用期限アラート
│   ├── 最近の入出庫
│   ├── 概要（登録商品数・総在庫数）
│   ├── バックアップリマインダー
│   └── クイックアクション
│       ├── スキャンして入庫 → バーコードスキャン → 入庫フォーム
│       ├── スキャンして使用 → バーコードスキャン → 使用フォーム
│       └── 棚卸を開始 → 棚卸タブへ遷移
│
├── [商品]
│   ├── 検索バー（名前・カナ・JANコード検索）
│   ├── カテゴリフィルタ（すべて/消耗品/物販）
│   ├── 商品追加ボタン → 商品登録オーバーレイ
│   ├── 商品カード一覧
│   │   └── 商品タップ → 商品詳細オーバーレイ
│   │       ├── 編集ボタン → 商品編集オーバーレイ
│   │       └── 削除ボタン → 確認ダイアログ
│   └── バーコードスキャン FAB → バーコードスキャンオーバーレイ
│
├── [入出庫]
│   ├── [入庫] 入庫フォーム → 保存
│   ├── [使用] 使用フォーム → 保存
│   ├── [販売] 販売フォーム → 保存
│   ├── [履歴] 取引履歴一覧（フィルタ付き）
│   └── バーコードスキャン FAB → バーコードスキャンオーバーレイ
│
├── [棚卸]
│   ├── 新規棚卸を開始ボタン
│   ├── 棚卸実施中セクション
│   │   ├── 進捗バー
│   │   ├── 商品別カウント入力 → テンキーオーバーレイ
│   │   └── 棚卸を完了ボタン → 確認ダイアログ → 調整トランザクション自動生成
│   └── 棚卸履歴一覧
│
├── [レポート]
│   ├── [在庫一覧] カテゴリフィルタ + 並び替え → テーブル表示
│   ├── [入出庫履歴] 日付範囲 + 商品 + 種別フィルタ → テーブル表示
│   ├── [使用期限] ロット別期限状態テーブル
│   └── [棚卸差異] セッション選択 → 差異テーブル
│
└── [設定]
    ├── クリニック・サロン情報（店舗名、オーナー名、郵便番号、住所、電話番号）
    ├── 在庫管理設定（期限アラート日数、スキャン音、デフォルト取引種別）
    ├── データ管理（エクスポート / インポート / 全削除）
    ├── サンプルデータ読み込み
    ├── 通知設定
    └── アプリ情報（バージョン、ビルド日時、アップデート確認）
```

### 4.4 オーバーレイ一覧

すべてのオーバーレイは `<div class="overlay" hidden>` で定義され、表示/非表示を `hidden` 属性で制御する。

| オーバーレイ名 | ID | トリガー | 内容 |
|--------------|-----|---------|------|
| 商品登録/編集 | `product-form-overlay` | 商品追加ボタン / 商品詳細の編集ボタン | 商品情報入力フォーム（写真撮影、バーコード入力含む） |
| 商品詳細 | `product-detail-overlay` | 商品カードのタップ | 商品情報表示、現在庫数、編集/削除ボタン |
| 取引入力 | `transaction-form-overlay` | バーコードスキャン後の取引入力 | 動的に生成される取引入力フォーム |
| バーコードスキャン | `scan-overlay` | スキャンボタン / FAB | カメラプレビュー（html5-qrcode）、スキャン状態表示 |
| テンキー | `numpad-overlay` | 棚卸カウント入力 | 商品情報表示、テンキーグリッド（0-9, C, バックスペース, 確定） |
| 確認ダイアログ | `confirm-dialog` | 削除操作、棚卸完了、データ全削除など | 確認メッセージ、OK/キャンセルボタン |

### 4.5 各画面の構成要素

#### ダッシュボード

| セクション | 要素 | 説明 |
|-----------|------|------|
| 在庫不足アラート | カード + バッジ | 最低在庫数を下回る商品を一覧表示 |
| 使用期限アラート | カード + バッジ | 期限切れ / 期限間近の商品を一覧表示 |
| 最近の入出庫 | カード | 直近の入出庫履歴を表示 |
| 概要 | サマリーカード | 登録商品数、総在庫数 |
| バックアップ | カード | 最終エクスポートからの経過日数、リマインダー表示 |
| クイックアクション | ボタン群 | スキャンして入庫 / スキャンして使用 / 棚卸を開始 |

#### 商品タブ

| 要素 | 説明 |
|------|------|
| 検索バー | テキスト入力。商品名・カナ・JANコードで検索 |
| カテゴリフィルタ | セレクトボックス（すべて / 消耗品 / 物販） |
| 商品追加ボタン | 商品登録オーバーレイを開く |
| 商品カード一覧 | 写真サムネイル、商品名、カテゴリ、在庫数、仕入先を表示 |
| バーコードスキャン FAB | フローティングアクションボタン |

#### 設定タブ

| セクション | 設定項目 |
|-----------|---------|
| クリニック・サロン情報 | 店舗名、オーナー名、郵便番号、住所、電話番号 |
| 在庫管理設定 | 使用期限アラート日数（デフォルト）、スキャン時の音、デフォルト取引種別 |
| データ管理 | エクスポート（JSON）、インポート（JSON）、全データ削除 |
| サンプルデータ | テスト用サンプルデータの読み込み |
| 通知設定 | 通知の有効/無効 |
| アプリ情報 | バージョン、ビルド日時、アップデート確認ボタン |

---

## 5. レスポンシブ対応

### 5.1 ブレークポイント

| ブレークポイント | 対象デバイス | 主な変更 |
|----------------|------------|---------|
| ベース（〜479px） | スマートフォン（小） | モバイルファーストの基本レイアウト。シングルカラム |
| `max-width: 480px` | スマートフォン | コンパクト UI（ヘッダーフォント 16px、タブボタン小、パディング縮小、テンキーボタン 52px） |
| `min-width: 768px` | タブレット | 2 カラムグリッド（商品・ダッシュボード）、オーバーレイをサイドパネル化（右寄せ 600px 幅）、テンキー中央ダイアログ化 |
| `min-width: 1024px` | デスクトップ | 3〜4 カラムグリッド（商品 3 列、ダッシュボード 4 列）、コンテンツ幅上限 1100px |

### 5.2 レスポンシブ設計の詳細

**モバイル（ベース）**
- 全要素がシングルカラムで縦に積まれる
- タブナビゲーションは横スクロール可能
- オーバーレイは画面全体を覆う
- テンキーは画面全体を覆うフルスクリーン表示

**タブレット（768px〜）**
- 商品一覧が `grid-template-columns: repeat(2, 1fr)` の 2 カラムグリッド
- ダッシュボードカードが 2 カラムグリッド
- オーバーレイは右サイドパネル（`max-width: 600px`、左に影）
- テンキーは中央ダイアログ（`max-width: 400px`、角丸）
- コンテンツ幅上限 960px、中央寄せ

**デスクトップ（1024px〜）**
- 商品一覧が 3 カラムグリッド
- ダッシュボードカードが 4 カラムグリッド
- コンテンツ幅上限 1100px

### 5.3 印刷対応

`@media print` でヘッダー、ナビゲーション、ボタン類を非表示にし、レポートテーブルのみを印刷出力可能にする。

---

## 6. PWA 構成

### 6.1 Service Worker（sw.js）

**キャッシュ戦略: Cache First**

1. `install` イベント: 事前キャッシュ対象アセットをすべてダウンロードしてキャッシュに格納。完了後 `skipWaiting()` を呼び出す
2. `activate` イベント: 現在のキャッシュ名以外の古いキャッシュを全削除。`clients.claim()` で即座に制御を取得する
3. `fetch` イベント: GET リクエストのみをインターセプトし、以下の順序で応答する
   - キャッシュにヒットすればキャッシュから応答
   - キャッシュにない場合はネットワークからフェッチし、成功すればキャッシュに追加して応答
   - ネットワークも失敗した場合、ドキュメントリクエストなら `/index.html` をフォールバック
4. `message` イベント: `SKIP_WAITING` メッセージを受信すると `skipWaiting()` を実行

**事前キャッシュ対象**

```
/
/index.html
/style.css
/script.js
/tana.calc.js
/version.js
/manifest.json
/lib/html5-qrcode.min.js
/icons/icon-192.png
/icons/icon-512.png
/icons/icon-maskable-512.png
/icons/apple-touch-icon.png
/icons/favicon-32.png
/icons/favicon-16.png
```

**キャッシュ名の命名規則**

`tana-v{バージョン}-{タイムスタンプ}` 形式（例: `tana-v1.0.0-1772705863`）。`generate_version.sh` がビルド時にタイムスタンプを含むキャッシュ名を生成する。

**バージョンアップデートフロー**

```
sw.js 更新検知 (onupdatefound)
    │
    ├── 新 SW が installed 状態 && 既存コントローラーあり
    │       │
    │       └── アップデートバナー表示
    │               │
    │               ├── 「更新する」ボタン押下
    │               │       └── waiting SW に SKIP_WAITING メッセージ送信
    │               │               └── ページリロード
    │               │
    │               └── バナー非表示（dismiss）
    │
    └── 初回インストール → 即座に有効化
```

### 6.2 Web App Manifest（manifest.json）

| 項目 | 値 |
|------|-----|
| `name` | `Tana - 在庫管理` |
| `short_name` | `Tana` |
| `description` | `治療院・サロン向け在庫管理アプリ` |
| `start_url` | `/index.html` |
| `display` | `standalone` |
| `orientation` | `portrait` |
| `background_color` | `#ffffff` |
| `theme_color` | `#059669` |

**アイコン**

| ファイル | サイズ | 用途 |
|---------|-------|------|
| `icon-192.png` | 192x192 | 標準アイコン |
| `icon-512.png` | 512x512 | 標準アイコン |
| `icon-maskable-512.png` | 512x512 | マスカブルアイコン（`purpose: "maskable"`） |

**ショートカット**

| 名前 | URL |
|------|-----|
| 商品一覧 | `/index.html?tab=products` |
| 入出庫 | `/index.html?tab=transactions` |

### 6.3 インストール要件

PWA としてインストール可能な条件:
- HTTPS（または localhost）で配信されていること
- 有効な `manifest.json` が `<link rel="manifest">` でリンクされていること
- Service Worker が登録されていること
- 192x192 以上のアイコンが manifest に含まれていること

---

## 7. デプロイ構成

### 7.1 Docker 構成

**Dockerfile**
- ベースイメージ: `nginx:alpine`
- `local_app/` ディレクトリを `/usr/share/nginx/html` にコピー
- `nginx/default.conf` をカスタム設定として配置

**docker-compose.yml（3 サービス）**

| サービス | 役割 | ポート公開 |
|---------|------|----------|
| `tana-app` | テスト・E2E 用アプリサーバー。ホストへポート公開しない | なし（内部ネットワーク `172.33.0.10`） |
| `tana-app-public` | ブラウザアクセス用アプリサーバー | `${TANA_PORT:-8088}:80` |
| `tana-test` | E2E テスト実行コンテナ（Playwright） | なし（`tana-app` に依存） |

**ネットワーク**
- ブリッジネットワーク `tana_net`（サブネット `172.33.0.0/24`）
- テストコンテナとアプリコンテナは同一ネットワーク内で通信

### 7.2 nginx 設定

| 設定 | 内容 |
|------|------|
| ドキュメントルート | `/usr/share/nginx/html` |
| JS/CSS キャッシュ | `Cache-Control: no-cache, must-revalidate`（開発中のブラウザキャッシュ問題を防止） |
| 文字エンコーディング | `charset utf-8` |

### 7.3 ビルドコマンド

| コマンド | 説明 |
|---------|------|
| `bash scripts/build.sh` | Docker イメージビルド＆コンテナ起動（ポート 8088） |
| `bash scripts/rebuild.sh` | 強制リビルド（キャッシュなし） |
| `bash scripts/generate_version.sh` | `version.js` を生成（バージョン + ビルド日時） |
| `bash scripts/generate-icons.sh` | SVG から PNG アイコンを生成 |
| `bash scripts/build-docs.sh` | Markdown ドキュメントを HTML に変換 |

---

## 8. CSS 設計

### 8.1 CSS Custom Properties（デザイントークン）

```css
:root {
    --primary: #059669;         /* メインカラー（エメラルドグリーン） */
    --primary-dark: #047857;    /* メインカラー（暗） */
    --primary-hover: #047857;   /* ホバー時 */
    --primary-light: #34d399;   /* メインカラー（明） */
    --primary-bg: #ecfdf5;      /* メインカラー背景 */
    --secondary: #6b7280;       /* セカンダリカラー（グレー） */
    --danger: #dc2626;          /* 危険色（赤） */
    --danger-bg: #fef2f2;       /* 危険色背景 */
    --warning: #f59e0b;         /* 警告色（オレンジ） */
    --warning-bg: #fffbeb;      /* 警告色背景 */
    --success: #059669;         /* 成功色（緑） */
    --success-bg: #ecfdf5;      /* 成功色背景 */
    --text: #1f2937;            /* テキスト色 */
    --text-light: #6b7280;      /* テキスト色（薄） */
    --border: #e5e7eb;          /* ボーダー色 */
    --bg: #f9fafb;              /* 背景色 */
    --white: #ffffff;           /* 白 */
    --shadow: 0 1px 3px rgba(0,0,0,0.1);      /* 標準シャドウ */
    --shadow-lg: 0 4px 12px rgba(0,0,0,0.15);  /* 大シャドウ */
    --radius: 8px;              /* 標準角丸 */
    --radius-lg: 12px;          /* 大角丸 */
}
```

### 8.2 ボタンスタイル

| クラス | 用途 | 外観 |
|--------|------|------|
| `.primary-btn` | 主要アクション（保存、登録） | 緑背景、白文字 |
| `.secondary-btn` | 補助アクション（キャンセル、エクスポート） | 白背景、グレー枠 |
| `.danger-btn` | 危険なアクション（削除、全データ削除） | 赤背景、白文字 |
| `.text-btn` | テキストリンク風ボタン | 枠なし、テキストのみ |
| `.scan-btn` | バーコードスキャンボタン | フォーム上部に配置 |
| `.scan-fab` | フローティングアクションボタン | 画面右下に固定表示 |
| `.quick-action-btn` | クイックアクションボタン | カード型、横並び |

### 8.3 フォント

システムフォントスタックを使用。外部フォントの読み込みなし。

```css
font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
    'Helvetica Neue', Arial, sans-serif;
```

---

## 9. セキュリティ設計

### 9.1 XSS 対策

ユーザー入力値を HTML に出力する際は、必ず `escapeHtml()` 関数でエスケープする。

```javascript
// & < > " ' をエスケープ
escapeHtml(str)
```

### 9.2 データ保護

- すべてのデータはブラウザ内の IndexedDB に保存される（外部送信なし）
- エクスポートファイルはユーザーのローカルファイルシステムにダウンロードされる
- インポート時はデータ構造のバリデーションを実施する

### 9.3 写真データ

- カメラ撮影またはファイル選択で取得した画像を `<canvas>` で圧縮し、base64 文字列として IndexedDB に保存する
- 外部サーバーへのアップロードは行わない
