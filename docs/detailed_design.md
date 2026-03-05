# Tana - 在庫管理アプリ 詳細設計書

---

## 1. 固定UI要素

アプリケーション全体で常時表示または条件付きで表示される固定UI要素の仕様。

### 1.1 アプリヘッダー

| 項目 | 仕様 |
|------|------|
| 位置 | `position: sticky; top: 0` |
| z-index | 100 |
| 背景色 | `#ffffff`（白） |
| テキスト色 | `var(--text)`（`#111827`） |
| 高さ | 48px（`height: 48px; display: flex; align-items: center`） |
| パディング | 0 16px |
| 下線 | `border-bottom: 1px solid var(--border)` |
| 影 | なし |

- タイトル: 「Tana - 在庫管理」（font-size: 17px、font-weight: 700、letter-spacing: -0.01em）
- サブタイトル: `display: none` で非表示

### 1.2 メインタブナビゲーション

| 項目 | 仕様 |
|------|------|
| 位置 | `position: sticky; top: 48px` |
| z-index | 90 |
| 背景色 | `#ffffff` |
| レイアウト | `display: flex; overflow-x: auto` |
| スクロールバー | 非表示（`scrollbar-width: none`） |
| 下線 | `border-bottom: 1px solid var(--border)` |
| 影 | なし |

6つのタブボタン（各ボタンにアイコン `<span class="tab-icon">` 付き）:

| data-tab | ラベル | アイコン | 初期状態 |
|----------|--------|---------|----------|
| dashboard | ダッシュボード | ▦ (`&#x25A6;`) | active |
| products | 商品 | ○ (`&#x25CB;`) | - |
| transactions | 入出庫 | ⇅ (`&#x21C5;`) | - |
| inventory | 棚卸 | ✓ (`&#x2713;`) | - |
| reports | レポート | ≡ (`&#x2261;`) | - |
| settings | 設定 | ⚙ (`&#x2699;`) | - |

- 各ボタン: `flex: 0 0 auto`、`min-width: 64px`、`font-size: 13px`、`flex-direction: column`
- タブアイコン: `font-size: 18px`、`line-height: 1`
- アクティブ状態: `color: var(--primary)`（`#10b981`）、`border-bottom: 2px solid var(--primary)`、`font-weight: 600`
- 非アクティブ状態: `color: var(--text-secondary)`（`#9ca3af`）、`border-bottom: 2px solid transparent`
- hover時（非アクティブ）: `color: var(--text)`
- モバイルでは水平スクロール対応（`-webkit-overflow-scrolling: touch`）

### 1.3 スクロールトップボタン

| 項目 | 仕様 |
|------|------|
| 要素ID | `scroll-top-btn` |
| 位置 | `position: fixed; bottom: 24px; right: 24px` |
| z-index | 900 |
| サイズ | 44px x 44px |
| 形状 | 円形（`border-radius: 50%`） |
| 背景色 | `var(--primary)`（`#10b981`） |
| 表示条件 | `window.scrollY > 300` で `.visible` クラス付与 |
| クリック時 | `window.scrollTo({ top: 0, behavior: 'smooth' })` |
| 影 | `var(--shadow-lg)`（`0 4px 16px rgba(0, 0, 0, 0.08)`） |
| hover時 | 背景色: `var(--primary-dark)`（`#059669`）、`transform: scale(1.1)` |

### 1.4 更新バナー

| 項目 | 仕様 |
|------|------|
| 要素ID | `update-banner` |
| 位置 | `position: fixed; top: 0; left: 0; right: 0` |
| z-index | 1000 |
| 背景色 | `#f59e0b`（warning色） |
| テキスト色 | `#1f2937` |
| 表示条件 | Service Workerの新バージョン検出時 |

- メッセージ: 「新しいバージョンが利用可能です。」
- 「更新する」ボタン: 白背景、クリック時に `applyUpdate()` 実行（SW skip waiting + ページリロード）
- 初期状態: `hidden` 属性で非表示

### 1.5 トースト通知

| 項目 | 仕様 |
|------|------|
| 要素ID | `toast` |
| 位置 | `position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%)` |
| z-index | 1100 |
| 形状 | ピル型（`border-radius: 24px`） |
| パディング | 12px 24px |
| フォント | 14px、font-weight: 500 |
| 影 | `0 4px 12px rgba(0, 0, 0, 0.15)` |
| 最大幅 | `calc(100vw - 32px)` |
| デフォルト表示時間 | 3000ms |
| アニメーション | `transform` + `opacity` の0.3sトランジション |

3種類のスタイル:

| クラス | 背景色 | 用途 |
|--------|--------|------|
| `toast-success` | `var(--success)`（`#10b981`） | 操作成功 |
| `toast-error` | `var(--danger)`（`#dc2626`） | エラー |
| `toast-info` | `#3b82f6`（ブルー） | 情報通知 |

関数シグネチャ: `showToast(message, type = 'info', duration = 3000)`

### 1.6 スキャンFAB

| 項目 | 仕様 |
|------|------|
| CSSクラス | `scan-fab` |
| 位置 | `position: fixed; bottom: 80px; right: 24px` |
| z-index | 800 |
| サイズ | 56px x 56px |
| 形状 | 円形（`border-radius: 50%`） |
| 背景色 | `var(--primary)`（`#10b981`） |
| テキスト | 「スキャン」（font-size: 24px） |
| hover時 | 背景色: `var(--primary-dark)`（`#059669`）、`transform: scale(1.1)` |
| 影 | `var(--shadow-lg)`（`0 4px 16px rgba(0, 0, 0, 0.08)`） |

- 商品タブ、入出庫タブに配置
- クリック時にバーコードスキャナーオーバーレイを開く

---

## 2. IndexedDB CRUD操作一覧

データベース名: `TanaDB`、バージョン: `1`

### 2.1 オブジェクトストア定義

| ストア名 | keyPath | インデックス |
|----------|---------|-------------|
| products | id | productCode（unique）、janCode、name、nameKana、category、isActive |
| stock_transactions | id | productId、transactionType、date、lotNumber、expiryDate |
| inventory_counts | id | countDate、status |
| app_settings | id | なし |

### 2.2 汎用CRUD操作

| 関数名 | 操作 | 引数 | 戻り値 |
|--------|------|------|--------|
| `openDB()` | DB接続 | なし | `Promise<IDBDatabase>` |
| `dbAdd(storeName, data)` | 新規追加 | ストア名、データ | `Promise<IDBValidKey>` |
| `dbUpdate(storeName, data)` | 追加または更新（put） | ストア名、データ | `Promise<IDBValidKey>` |
| `dbGet(storeName, id)` | 単一取得 | ストア名、ID | `Promise<Object\|null>` |
| `dbGetAll(storeName)` | 全件取得 | ストア名 | `Promise<Array>` |
| `dbDelete(storeName, id)` | 単一削除 | ストア名、ID | `Promise<void>` |
| `dbClear(storeName)` | 全件削除 | ストア名 | `Promise<void>` |
| `dbGetByIndex(storeName, indexName, value)` | インデックス検索 | ストア名、インデックス名、検索値 | `Promise<Array>` |

### 2.3 商品操作

| 関数名 | 処理内容 | 備考 |
|--------|---------|------|
| `saveProduct()` | 商品の新規登録または更新 | 新規時: `dbAdd`、`generateId()` でID生成、`createdAt`/`updatedAt` 設定。更新時: `dbUpdate`、`updatedAt` のみ更新 |
| `deleteProduct(id)` | 商品の論理削除 | `isActive = false` に設定して `dbUpdate`。物理削除はしない |
| `loadProducts()` | アクティブな商品一覧を取得・表示 | `dbGetAll('products')` → `isActive !== false` でフィルタ |

### 2.4 取引操作

| 関数名 | 処理内容 | 備考 |
|--------|---------|------|
| `saveTransaction(type)` | 取引記録の新規作成 | `dbAdd('stock_transactions', ...)` でID自動生成。use/sellの数量は負数に変換して保存 |
| `loadTransactionHistory()` | 全取引履歴の取得・表示 | `dbGetAll('stock_transactions')` → 日付降順ソート。フィルター（日付範囲、商品、種別）適用可 |
| `lookupByBarcode(code)` | JANコードで商品検索 | `dbGetByIndex('products', 'janCode', code)` → アクティブな商品のみ返却 |

### 2.5 棚卸操作

| 関数名 | 処理内容 | 備考 |
|--------|---------|------|
| `startNewCount()` | 新規棚卸セッション作成 | 全アクティブ商品をアイテムとして登録。status: `in_progress` |
| `confirmNumpad()` | 実数入力の確定 | 該当アイテムの `actualQuantity` と `status = 'counted'` を更新 |
| `completeCount()` | 棚卸完了処理 | 差異のある商品に `adjust` 取引を自動生成。status: `completed` に更新 |
| `cancelCount()` | 棚卸中止 | `dbDelete` で棚卸レコードを物理削除 |

### 2.6 設定操作

| 関数名 | 処理内容 | 備考 |
|--------|---------|------|
| `getSetting(key)` | 設定値の取得 | `dbGet('app_settings', key)` → `record.value` を返却。存在しない場合は `null` |
| `saveSetting(key, value)` | 設定値の保存 | `dbUpdate('app_settings', { id: key, value: value })` |
| `saveClinicInfo()` | 施設情報の保存 | キー: `clinic_info`、値: オブジェクト |
| `saveInventorySettings()` | 在庫管理設定の保存 | キー: `inventory_settings`、値: オブジェクト |
| `saveNotificationSetting()` | 通知設定の保存 | キー: `notification_enabled`、値: boolean |

---

## 3. バリデーション仕様

### 3.1 商品バリデーション（validateProduct）

`tana.calc.js` の純粋関数。引数: `product` オブジェクト。戻り値: `{ valid: boolean, errors: string[] }`

| フィールド | ルール | エラーメッセージ |
|-----------|--------|----------------|
| name | 必須、string型、空文字不可、1〜100文字 | 「商品名は必須です」「商品名は100文字以内で入力してください」 |
| category | `"consumable"` または `"retail"` のいずれか | 「カテゴリは「consumable」または「retail」を指定してください」 |
| janCode | 空OK（null/undefined/空文字は有効）。値がある場合はJAN-8またはJAN-13形式、チェックデジット検証 | 「JANコードが不正です」 |
| nameKana | 空OK。値がある場合はひらがな（U+3040〜U+309F）＋長音符（U+30FC）＋スペースのみ | 「フリガナはひらがなで入力してください」 |
| defaultPrice | 空OK。値がある場合は0以上の数値 | 「販売価格は0以上の数値を入力してください」 |
| costPrice | 空OK。値がある場合は0以上の数値 | 「原価は0以上の数値を入力してください」 |
| minStock | 空OK。値がある場合は0以上の数値 | 「最小在庫数は0以上の数値を入力してください」 |
| expiryAlertDays | 空OK。値がある場合は0以上の数値 | 「期限アラート日数は0以上の数値を入力してください」 |

正規表現パターン（nameKana）: `/^[\u3040-\u309F\u30FC\s]+$/`

### 3.2 取引バリデーション（validateTransaction）

`tana.calc.js` の純粋関数。引数: `transaction` オブジェクト。戻り値: `{ valid: boolean, errors: string[] }`

| フィールド | ルール | エラーメッセージ |
|-----------|--------|----------------|
| productId | 必須（falsy値不可） | 「商品IDは必須です」 |
| transactionType | `receive`、`use`、`sell`、`adjust`、`dispose` のいずれか | 「取引種別が不正です（receive, use, sell, adjust, dispose）」 |
| quantity | 必須（null/undefined不可）、0以外の数値 | 「数量は必須です」「数量は0以外の数値を入力してください」 |
| date | 必須、YYYY-MM-DD形式（正規表現: `/^\d{4}-\d{2}-\d{2}$/`） | 「日付は必須です」「日付はYYYY-MM-DD形式で入力してください」 |
| notes | 空OK。値がある場合は1000文字以内 | 「備考は1000文字以内で入力してください」 |

### 3.3 JANコード検証（validateJanCode）

`tana.calc.js` の純粋関数。引数: `code`（string/null）。戻り値: `{ valid: boolean }`

| 入力 | 判定 |
|------|------|
| null / undefined / 空文字 | `{ valid: true }` |
| 数字以外を含む | `{ valid: false }` |
| 8桁・13桁以外 | `{ valid: false }` |

**JAN-13 チェックデジット計算:**
1. 先頭12桁を処理
2. 奇数位置（1,3,5,...）の数字 x 1 を合計
3. 偶数位置（2,4,6,...）の数字 x 3 を合計
4. チェックデジット = `(10 - (合計 % 10)) % 10`
5. 13桁目と照合

**JAN-8 チェックデジット計算:**
1. 先頭7桁を処理
2. 奇数位置（1,3,5,7）の数字 x 3 を合計
3. 偶数位置（2,4,6）の数字 x 1 を合計
4. チェックデジット = `(10 - (合計 % 10)) % 10`
5. 8桁目と照合

### 3.4 インポートデータ検証（validateImportData）

`tana.calc.js` の純粋関数。引数: `data` オブジェクト。戻り値: `{ valid: boolean, errors: string[] }`

| チェック項目 | 条件 | エラーメッセージ |
|------------|------|----------------|
| data自体 | null/undefined/falsyでないこと | 「インポートデータが空です」 |
| appName | `=== "tana"` であること | 「appNameが"tana"ではありません」 |
| products | 配列であること | 「productsが配列ではありません」 |
| products[N].id | 各要素にidプロパティがあること | 「products[N]にidがありません」 |
| stock_transactions | 配列であること | 「stock_transactionsが配列ではありません」 |
| inventory_counts | 配列であること | 「inventory_countsが配列ではありません」 |
| settings | null/undefinedの場合はスキップ。それ以外はオブジェクト型（配列不可）であること | 「settingsはオブジェクトである必要があります」 |

### 3.5 UI操作バリデーション

script.js 内のUI操作時に行われる追加バリデーション:

| 操作 | 条件 | エラーメッセージ | 表示方法 |
|------|------|----------------|----------|
| 取引保存時の商品選択 | productIdが空 | 「商品を選択してください」 | トースト（error） |
| 取引保存時の数量入力 | NaN または 0以下 | 「数量を正しく入力してください」 | トースト（error） |
| テンキー確定時 | NaN または 負数 | 「正しい数量を入力してください」 | トースト（error） |
| 商品コード重複 | IndexedDB ConstraintError | 「その商品コードは既に使用されています」 | トースト（error） |
| インポート時のファイル選択 | ファイル未選択 | 「ファイルを選択してください」 | トースト（error） |
| 棚卸完了時の未カウント | `status !== 'counted'` の商品が存在 | 「未カウントの商品があります（N 件）」 | トースト（error） |
| use/sell時の在庫マイナス | 現在庫 + 数量 < 0 | 「在庫がマイナスになります（現在: N）。続行しますか？」 | 確認ダイアログ |

---

## 4. 商品オーバーレイ詳細

### 4.1 商品登録/編集フォーム

| 項目 | 仕様 |
|------|------|
| 要素ID | `product-form-overlay` |
| 背景 | 半透明黒（`rgba(0, 0, 0, 0.3)`）のバックドロップ |
| アニメーション | 右からスライドイン（`transform: translateX(100%)` → `translateX(0)`） |
| タイトル（新規） | 「商品登録」 |
| タイトル（編集） | 「商品編集」 |
| ヘッダー | sticky、閉じるボタン（×）付き |

**フォームフィールド一覧:**

| フィールドID | ラベル | type | 必須 | 備考 |
|-------------|--------|------|------|------|
| product-code | 商品コード | text | - | 新規時は自動生成（`P` + タイムスタンプ下8桁）、編集時は読み取り専用 |
| product-name | 商品名 | text | required | 1〜100文字 |
| product-name-kana | 商品名（カナ） | text | - | ひらがなのみ |
| product-jan-code | JANコード | text | - | JAN-8/JAN-13形式 |
| product-category | カテゴリ | select | required | 選択肢: 消耗品（consumable）、物販（retail） |
| product-unit | 単位 | text | - | placeholder: 「例: 個、本、箱」。デフォルト: 「個」 |
| product-default-price | 販売価格 | number | - | min=0、step=1 |
| product-cost-price | 仕入価格 | number | - | min=0、step=1 |
| product-track-expiry | 使用期限を管理する | checkbox | - | チェック時に期限アラート日数フィールドを表示 |
| product-expiry-alert-days | 期限アラート日数 | number | - | min=1、デフォルト: 30。`product-track-expiry` チェック時のみ表示 |
| product-min-stock | 最低在庫数 | number | - | min=0、step=1、デフォルト: 0 |
| product-supplier | 仕入先 | text | - | - |
| product-notes | 備考 | textarea | - | rows=3 |

**写真セクション:**

| 機能 | 仕様 |
|------|------|
| ファイル入力 | `<input type="file" accept="image/*" capture="environment">` |
| 圧縮処理 | Canvas API使用。最大幅: 400px、JPEG品質: 0.6 |
| プレビュー | `<img>` 要素で圧縮後の画像を表示 |
| 削除ボタン | 「写真を削除」テキストボタン。プレビューとデータをクリア |
| 保存形式 | base64文字列（data:image/jpeg;base64,...） |

**ボタン:**
- 「保存」ボタン: `primary-btn` クラス → `saveProduct()` 実行
- 「キャンセル」ボタン: `secondary-btn` クラス → `closeProductForm()` 実行

### 4.2 商品詳細オーバーレイ

| 項目 | 仕様 |
|------|------|
| 要素ID | `product-detail-overlay` |
| タイトル | 「商品詳細」 |
| アニメーション | 右からスライドイン |

**表示内容:**

| 項目 | 表示形式 |
|------|---------|
| 写真 | 大サイズ画像表示（最大幅: 300px） |
| 商品名 | h2見出し |
| フリガナ | 商品名の下にテキスト表示 |
| 在庫数 | `stock-badge` クラスで色分け表示（stock-normal/stock-low/stock-zero） |
| 詳細テーブル | 商品コード、JANコード、カテゴリ、単位、最低在庫数、仕入先、単価、期限管理、備考 |

**在庫バッジの色分け:**

| 条件 | クラス | 表示色 |
|------|--------|--------|
| 在庫 > 最低在庫数 | stock-normal | 通常色 |
| 0 < 在庫 <= 最低在庫数 | stock-low | 警告色（`var(--warning)` / `#f59e0b`） |
| 在庫 <= 0 | stock-zero | 危険色（`var(--danger)` / `#dc2626`） |

**ボタン:**
- 「編集」: `primary-btn` → 商品フォームオーバーレイを開く
- 「削除」: `danger-btn` → 確認ダイアログ後に論理削除（`isActive = false`）
- 「閉じる」: `secondary-btn` → オーバーレイを閉じる

---

## 5. 入出庫オーバーレイ詳細

### 5.1 入出庫タブ構成

入出庫タブには4つのサブタブがある:

| data-subtab | ラベル | 初期状態 |
|-------------|--------|----------|
| receive | 入庫 | active |
| use | 使用 | - |
| sell | 販売 | - |
| history | 履歴 | - |

サブタブのスタイル: アンダーライン型（メインタブと統一）、`border-bottom: 2px solid var(--primary)`、アクティブ時はテキスト色 `var(--primary)` + 下線

### 5.2 入庫フォーム（subtab-receive）

| フィールドID | ラベル | type | 必須 | 備考 |
|-------------|--------|------|------|------|
| receive-product | 商品 | select | required | アクティブ商品一覧。名前順ソート |
| receive-quantity | 数量 | number | required | min=1、step=1 |
| receive-date | 入庫日 | date | required | デフォルト: 今日 |
| receive-unit-cost | 仕入単価 | number | - | min=0、step=1 |
| receive-lot-number | ロット番号 | text | - | 商品の `trackExpiry` が true の場合のみ表示 |
| receive-expiry-date | 使用期限 | date | - | 商品の `trackExpiry` が true の場合のみ表示 |
| receive-notes | 備考 | textarea | - | rows=2 |

- 「バーコードスキャン」ボタン: スキャナーを開き、読み取ったJANコードの商品をドロップダウンで自動選択
- 「入庫を保存」ボタン: 数量は正数のまま保存（`transactionType: 'receive'`）

### 5.3 使用フォーム（subtab-use）

| フィールドID | ラベル | type | 必須 | 備考 |
|-------------|--------|------|------|------|
| use-product | 商品 | select | required | アクティブ商品一覧 |
| use-quantity | 数量 | number | required | min=1、step=1 |
| use-date | 使用日 | date | required | デフォルト: 今日 |
| use-notes | 備考 | textarea | - | rows=2 |

- 数量は負数に変換して保存（`quantity = -Math.abs(quantity)`）
- 在庫がマイナスになる場合は確認ダイアログを表示

### 5.4 販売フォーム（subtab-sell）

| フィールドID | ラベル | type | 必須 | 備考 |
|-------------|--------|------|------|------|
| sell-product | 商品 | select | required | アクティブ商品一覧 |
| sell-quantity | 数量 | number | required | min=1、step=1 |
| sell-date | 販売日 | date | required | デフォルト: 今日 |
| sell-notes | 備考 | textarea | - | rows=2 |

- 数量は負数に変換して保存（`quantity = -Math.abs(quantity)`）
- 在庫がマイナスになる場合は確認ダイアログを表示

### 5.5 履歴サブタブ（subtab-history）

フィルターバー:

| フィールドID | ラベル | type | 備考 |
|-------------|--------|------|------|
| history-date-from | 開始日 | date | 日付範囲の下限 |
| history-date-to | 終了日 | date | 日付範囲の上限 |
| history-product-filter | 商品 | select | 「すべて」+全アクティブ商品 |
| history-type-filter | 種別 | select | すべて/入庫/使用/販売 |

- 取引は日付降順、同日の場合は `createdAt` 降順でソート
- 各取引アイテムは左ボーダーで種別を色分け表示

---

## 6. スキャンオーバーレイ詳細

| 項目 | 仕様 |
|------|------|
| 要素ID | `scan-overlay` |
| 背景 | `#000`（全画面黒） |
| z-index | 2000 |
| 表示 | `position: fixed; top: 0; left: 0; right: 0; bottom: 0` |

**構成要素:**

| 要素 | 仕様 |
|------|------|
| スキャンリーダー | `<div id="scan-reader">`、最大幅: 400px、アスペクト比: 1:1 |
| ステータス表示 | `<p id="scan-status">`、初期テキスト: 「カメラを起動中...」 |
| 閉じるボタン | 右上、44x44px、円形、半透明白背景 |

**html5-qrcode設定:**

| 設定項目 | 値 |
|----------|-----|
| facingMode | `environment`（背面カメラ） |
| fps | 10 |
| qrbox | 幅: 250px、高さ: 150px |

**スキャン成功時の処理:**
1. デバウンス: 同一コードは2秒以内の再読み取りを無視
2. JANコード検証（`validateJanCode`）
3. スキャン音再生（Web Audio API、1000Hz、0.1秒間）
4. コールバック関数を実行
5. スキャナーを停止・閉じる

**スキャン結果の分岐（商品タブFABからの場合）:**
- 商品が見つかった場合: 商品詳細オーバーレイを表示
- 商品が見つからない場合: 「新規登録しますか？」確認ダイアログ → JANコードフィールドに自動入力

---

## 7. テンキーオーバーレイ詳細

| 項目 | 仕様 |
|------|------|
| 要素ID | `numpad-overlay` |
| 背景 | `#ffffff`（全画面白） |
| z-index | 2000 |
| レイアウト | `display: flex; flex-direction: column` |

**構成要素:**

| 要素 | 内容 |
|------|------|
| 商品情報ヘッダー | 商品写真（任意）、商品名、理論在庫数（「理論在庫: N 単位」） |
| デジタル表示 | 入力値を大きなフォントで表示（font-size: 48px、font-weight: 700）。初期値: 「0」 |
| テンキーグリッド | 4列 x 3行（`grid-template-columns: repeat(4, 1fr)`） |

**テンキーグリッドの配置:**

```
[ 1 ] [ 2 ] [ 3 ]
[ 4 ] [ 5 ] [ 6 ]
[ 7 ] [ 8 ] [ 9 ]
[ C ] [ 0 ] [ ← ]
        [ 確定 ]
```

| ボタン | data-numpad | 動作 |
|--------|-------------|------|
| 0〜9 | `"0"`〜`"9"` | 数値を追加（先頭0は置換） |
| C | `"C"` | 入力値をクリア |
| ← | `"backspace"` | 末尾1文字を削除 |
| 確定 | `"confirm"` | `confirmNumpad()` 実行 |

- 各ボタンサイズ: `min-height: 60px`（モバイル: 52px）
- 「C」ボタン: 赤色テキスト（`var(--danger)` / `#dc2626`）
- 「←」ボタン: グレーテキスト（`var(--text-light)` / `#6b7280`）
- 「確定」ボタン: プライマリグリーン背景（`var(--primary)` / `#10b981`）

**操作ボタン:**
- 「キャンセル」ボタン: `secondary-btn` → `closeNumpad()` 実行

---

## 8. 確認ダイアログ

| 項目 | 仕様 |
|------|------|
| 要素ID | `confirm-dialog` |
| レイアウト | 中央配置モーダル（`overlay-dialog` クラス） |
| 背景 | 白（オーバーレイ内） |

**構成要素:**

| 要素 | 仕様 |
|------|------|
| メッセージ | `<p id="confirm-message">`、動的にテキスト設定 |
| OKボタン | `id="confirm-ok-btn"`、`primary-btn` クラス |
| キャンセルボタン | `id="confirm-cancel-btn"`、`secondary-btn` クラス |

**関数シグネチャ:** `showConfirm(message) → Promise<boolean>`

- OKクリック時: `resolve(true)`
- キャンセルクリック時: `resolve(false)`
- フォールバック: DOM要素が見つからない場合は `window.confirm()` を使用
- 全データ削除時のみ特殊な確認: テキスト入力欄で「削除」の入力を要求

---

## 9. 設定画面詳細

### 9.1 クリニック・サロン情報

| フィールドID | ラベル | type | 備考 |
|-------------|--------|------|------|
| clinic-name | 店舗名 | text | - |
| owner-name | オーナー名 | text | - |
| zip-code | 郵便番号 | tel | placeholder: 「000-0000」 |
| address | 住所 | text | - |
| phone | 電話番号 | tel | - |

- 保存先: `app_settings` ストア、キー: `clinic_info`
- 「クリニック情報を保存」ボタンで一括保存

### 9.2 在庫管理設定

| フィールドID | ラベル | type | 備考 |
|-------------|--------|------|------|
| default-expiry-alert-days | 使用期限アラート日数（デフォルト） | number | min=1、初期値: 30 |
| scan-sound-enabled | スキャン時に音を鳴らす | checkbox | - |
| default-transaction-type | デフォルトの取引種別 | select | 入庫/使用/販売 |

- 保存先: `app_settings` ストア、キー: `inventory_settings`
- 「在庫管理設定を保存」ボタンで一括保存

### 9.3 通知設定

| フィールドID | ラベル | type | 備考 |
|-------------|--------|------|------|
| notification-enabled | 通知を有効にする | checkbox | - |

- 保存先: `app_settings` ストア、キー: `notification_enabled`
- 「通知設定を保存」ボタンで保存
- 通知チェック: アプリ起動時に `notify.html` を取得し、SHA-256ハッシュの変更を検出

### 9.4 データ管理

#### エクスポート

| 項目 | 仕様 |
|------|------|
| ボタン | 「データをエクスポート」（`secondary-btn`） |
| ファイル名 | `tana_export_YYYYMMDD_HHMMSS.json` |
| ファイル形式 | JSON（インデント: 2スペース） |
| MIME type | `application/json` |

エクスポートJSONの構造:
```json
{
  "appName": "tana",
  "version": "1.0.0",
  "exportDate": "ISO 8601形式",
  "products": [...],
  "stock_transactions": [...],
  "inventory_counts": [...],
  "settings": [...]
}
```

- エクスポート後、`last_export_time` 設定を更新

#### インポート

| 項目 | 仕様 |
|------|------|
| ファイル入力 | `<input type="file" accept=".json">` |
| ボタン | 「データをインポート」（`secondary-btn`） |
| バリデーション | `validateImportData()` による構造検証 |
| 確認 | インポート件数を表示して確認ダイアログ |
| マージ方式 | 同一IDのデータは上書き（`dbUpdate`）。新規データは追加（`dbAdd`） |

#### 全データ削除

| 項目 | 仕様 |
|------|------|
| ボタン | 「すべてのデータを削除」（`danger-btn`） |
| 確認1 | 「全てのデータを削除しますか？この操作は取り消せません。」 |
| 確認2 | テキスト入力で「削除」と入力を要求 |
| 処理 | 4つの全ストア（products、stock_transactions、inventory_counts、app_settings）を `dbClear` |

#### サンプルデータ投入

| 項目 | 仕様 |
|------|------|
| ボタン | 「サンプルデータを読み込む」（`secondary-btn`） |
| データソース | `sample_data.json`（fetch API で取得） |
| 確認 | 「サンプルデータを読み込みますか？既存データはそのまま保持されます。」 |
| マージ方式 | 同一IDは上書き、新規は追加 |

### 9.5 アプリ情報

| 表示項目 | 要素ID | 内容 |
|----------|--------|------|
| バージョン | `app-version` | `window.APP_INFO.version` の値（例: 「v1.0.0」） |
| ビルド日時 | `app-build-time` | `window.APP_INFO.buildTime` の値 |

- 「アップデートを確認」ボタン: Service Worker の更新を確認

---

## 10. 検索・フィルター仕様

### 10.1 商品検索

| 項目 | 仕様 |
|------|------|
| 要素ID | `product-search` |
| type | search |
| placeholder | 「商品名で検索...」 |
| イベント | `input` イベントで即時フィルタ |

**検索対象フィールド:**

| フィールド | 検索方法 |
|-----------|---------|
| name | 部分一致（大小文字区別なし） |
| nameKana | 部分一致（大小文字区別なし） |
| productCode | 部分一致（大小文字区別なし） |
| janCode | 部分一致（大小文字区別なし） |

検索ロジック: 各フィールドを `toLowerCase()` して `indexOf(query) !== -1` で判定。いずれかのフィールドがマッチすれば表示。

### 10.2 カテゴリフィルター

| 項目 | 仕様 |
|------|------|
| 要素ID | `product-category-filter` |
| type | select |
| イベント | `change` イベントでフィルタ |

**選択肢:**

| value | ラベル |
|-------|--------|
| （空文字） | すべて |
| consumable | 消耗品 |
| retail | 物販 |

### 10.3 取引履歴フィルター

4つのフィルター要素（全て `change` イベントで `loadTransactionHistory()` を再実行）:

| フィルター | 動作 |
|-----------|------|
| 開始日 | `tx.date >= dateFrom` |
| 終了日 | `tx.date <= dateTo` |
| 商品 | `tx.productId === productFilter` |
| 種別 | `tx.transactionType === typeFilter` |

### 10.4 レポートフィルター

**在庫一覧レポート:**

| フィールドID | ラベル | 選択肢 |
|-------------|--------|--------|
| stock-report-category | カテゴリ | すべて/消耗品/物販 |
| stock-report-sort | 並び替え | 商品名/在庫数（少ない順）/在庫数（多い順）/在庫金額 |

**入出庫履歴レポート:**

| フィールドID | ラベル | type |
|-------------|--------|------|
| report-history-date-from | 開始日 | date |
| report-history-date-to | 終了日 | date |
| report-history-product | 商品 | select |
| report-history-type | 種別 | select |

**棚卸差異レポート:**

| フィールドID | ラベル | 備考 |
|-------------|--------|------|
| variance-session-select | 棚卸セッション | 完了済み棚卸セッション一覧（日付降順） |

---

## 11. レスポンシブデザイン

### 11.1 モバイル（max-width: 480px）

| 要素 | 変更内容 |
|------|---------|
| ヘッダータイトル | font-size: 15px |
| タブコンテンツ | padding: 16px 12px |
| タブボタン | padding: 6px 12px、font-size: 11px |
| タブアイコン | font-size: 16px |
| ツールバー | gap: 6px |
| 商品カード | padding: 10px、gap: 10px |
| 商品サムネイル | 44px x 44px |
| ダッシュボードカード値 | font-size: 24px |
| クイックアクションボタン | min-height: 56px、padding: 10px、font-size: 12px |
| テンキー表示値 | font-size: 36px |
| テンキーボタン | min-height: 52px、font-size: 18px |

### 11.2 タブレット（min-width: 768px）

| 要素 | 変更内容 |
|------|---------|
| ヘッダー | padding: 0 24px |
| ヘッダータイトル | font-size: 18px |
| タブコンテンツ | padding: 32px 24px、max-width: 960px、margin: 0 auto |
| 商品グリッド | `grid-template-columns: repeat(2, 1fr)`、gap: 12px |
| ダッシュボードグリッド | `grid-template-columns: repeat(2, 1fr)`、gap: 12px |
| ツールバー | `flex-wrap: nowrap` |
| クイックアクションボタン | `flex: 1 1 auto`、min-width: 100px |
| オーバーレイ | max-width: 600px、右寄せ（`left: auto; right: 0`）、左側影付き |
| テンキーオーバーレイ | max-width: 400px、中央配置（`left: 50%; transform: translateX(-50%)`）、上下10%マージン、角丸 |
| 設定セクション | padding: 24px |

### 11.3 デスクトップ（min-width: 1024px）

| 要素 | 変更内容 |
|------|---------|
| タブコンテンツ | max-width: 1100px |
| 商品グリッド | `grid-template-columns: repeat(3, 1fr)` |
| ダッシュボードグリッド | `grid-template-columns: repeat(4, 1fr)` |

---

## 12. ボタンカラー規約

### 12.1 ボタン共通スタイル

全ボタン共通（`.btn` クラス）:

| プロパティ | 値 |
|-----------|-----|
| padding | 10px 20px |
| border-radius | `var(--radius)`（12px） |
| font-size | 14px |
| font-weight | 600 |
| min-height | 44px |
| cursor | pointer |
| transition | background 0.2s, color 0.2s, border-color 0.2s, transform 0.1s |
| active時 | `transform: scale(0.97)` |

### 12.2 ボタンバリエーション

| クラス | 背景色 | hover時背景色 | テキスト色 | ボーダー色 | 用途 |
|--------|--------|-------------|-----------|-----------|------|
| `primary-btn` | `var(--primary)`（`#10b981`） | `var(--primary-dark)`（`#059669`） | `#ffffff` | `var(--primary)` | コミットアクション（保存、登録、完了、OK） |
| `secondary-btn` | `var(--white)` | `#f3f4f6` | `var(--text)`（`#111827`） | `var(--border-strong)`（`#d1d5db`） | 副次アクション（エクスポート、サンプル読込、更新確認） |
| `danger-btn` | `var(--danger)`（`#dc2626`） | `#b91c1c` | `#ffffff` | `var(--danger)` | 破壊的操作（削除、全データ削除） |
| `text-btn` | `transparent` | `var(--primary-bg)` | `#059669` | なし | テキストボタン（軽量アクション） |
| `btn-outline` | `transparent` | `var(--primary-bg)` | `#059669` | `#059669` | 遷移アクション（編集） |
| `cancel-btn` | （secondary-btnを継承） | （secondary-btnを継承） | （secondary-btnを継承） | （secondary-btnを継承） | キャンセル |
| `scan-btn` | `#f8fafc` | `var(--secondary)` | `var(--secondary)`（`#64748b`） | `#cbd5e1` | ツール操作（バーコードスキャン） |
| `btn-icon` | `transparent` | `var(--bg)` | `var(--text-light)` | `var(--border-strong)`（`#d1d5db`） | アイコンボタン |

### 12.3 disabled状態

| プロパティ | 値 |
|-----------|-----|
| opacity | 0.5 |
| cursor | not-allowed |
| transform | none |
| pointer-events | none |

### 12.4 CSSカスタムプロパティ一覧

| プロパティ | 値 | 用途 |
|-----------|-----|------|
| `--primary` | `#10b981` | メインカラー（モダンなエメラルドグリーン） |
| `--primary-dark` | `#059669` | hover/active用 |
| `--primary-hover` | `#059669` | hover用（primary-darkと同値） |
| `--primary-light` | `#6ee7b7` | アクセントカラー |
| `--primary-bg` | `#f0fdf4` | プライマリ背景 |
| `--secondary` | `#64748b` | セカンダリカラー（スレートグレー） |
| `--danger` | `#dc2626` | 危険・エラー（WCAG AA準拠） |
| `--danger-bg` | `#fef2f2` | 危険背景 |
| `--warning` | `#f59e0b` | 警告 |
| `--warning-bg` | `#fffbeb` | 警告背景 |
| `--success` | `#10b981` | 成功 |
| `--success-bg` | `#f0fdf4` | 成功背景 |
| `--text` | `#111827` | テキスト色（より濃い黒） |
| `--text-light` | `#6b7280` | 薄いテキスト色 |
| `--text-secondary` | `#9ca3af` | 第三階層テキスト色 |
| `--border` | `#f0f0f0` | ボーダー色（より薄い） |
| `--border-strong` | `#d1d5db` | ボーダー色（ボタン・アイコン用、視認性強化） |
| `--bg` | `#f8f9fa` | ページ背景色 |
| `--white` | `#ffffff` | 白 |
| `--shadow` | `0 1px 2px rgba(0,0,0,0.04), 0 1px 4px rgba(0,0,0,0.04)` | 標準影（軽い） |
| `--shadow-lg` | `0 4px 16px rgba(0,0,0,0.08)` | 大きい影 |
| `--radius` | `12px` | 標準角丸 |
| `--radius-lg` | `16px` | 大きい角丸 |
