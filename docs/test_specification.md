# テスト仕様書 — Tana 在庫管理

## テスト概要

### テスト環境
- ユニットテスト: Jest
- E2Eテスト: Puppeteer + Jest
- 実行環境: Docker コンテナ (Node.js)
- テストコマンド: `npm test` (UT), `docker compose run --rm tana-test` (E2E)

### テスト構成
| 種別 | ファイル | テスト数 |
|------|---------|---------|
| ユニットテスト | tana.calc.test.js | 109件 |
| E2Eテスト | e2e.test.js | 43件 |
| **合計** | | **152件** |

### テストID体系
- UT-XXX-NNN: ユニットテスト（XXX=カテゴリ、NNN=連番）
- E2E-XXX-NNN: E2Eテスト（XXX=カテゴリ、NNN=連番）

### カバレッジ目標
- tana.calc.js: 全エクスポート関数の正常系・異常系・境界値をカバー
- E2E: 全主要ユーザーフローをカバー

---

## 1. ユニットテスト

### 1.1 在庫計算 (UT-STK)

| ID | テスト内容 | 期待結果 |
|----|-----------|---------|
| UT-STK-001 | 入庫のみ → 正の在庫数 | receive 10 → 10を返す |
| UT-STK-002 | 入庫+使用 → 差分 | receive 10, use 3 → 7を返す |
| UT-STK-003 | 入庫+販売 → 差分 | receive 10, sell 2 → 8を返す |
| UT-STK-004 | 入庫+廃棄 → 差分 | receive 10, dispose 1 → 9を返す |
| UT-STK-005 | 入庫+調整 → 調整後 | receive 10, adjust -3 → 7を返す |
| UT-STK-006 | 空配列 → 0 | calculateCurrentStock([]) → 0 |
| UT-STK-007 | 出庫が入庫を超える → 負の値 | receive 3, use 10 → -7を返す |
| UT-STK-008 | calculateStockByLot 異なるロットの在庫計算 | LOT-A: 7, LOT-B: 5（ロット別の在庫数を返す） |
| UT-STK-009 | calculateStockByLot ロット番号なし | ロット番号空文字で1件、quantity 7 |
| UT-STK-010 | calculateStockValue 基本計算 | receive 10@100, use 3 → 700 |
| UT-STK-011 | calculateStockValue 複数入庫単価の加重平均 | 10@100 + 10@200, use 5 → 2250 |
| UT-STK-012 | calculateStockValue 空配列 → 0 | calculateStockValue([]) → 0 |

### 1.2 期限管理 (UT-EXP)

| ID | テスト内容 | 期待結果 |
|----|-----------|---------|
| UT-EXP-001 | 期限が30日以上先 → "ok" | getExpiryStatus('2025-03-01', 30, refDate) → 'ok' |
| UT-EXP-002 | 期限がちょうどalertDays → "warning" | getExpiryStatus('2025-01-31', 30, refDate) → 'warning' |
| UT-EXP-003 | 期限がalertDays未満 → "warning" | getExpiryStatus('2025-01-15', 30, refDate) → 'warning' |
| UT-EXP-004 | 期限が当日 → "warning" | getExpiryStatus('2025-01-01', 30, refDate) → 'warning' |
| UT-EXP-005 | 期限切れ → "expired" | getExpiryStatus('2024-12-31', 30, refDate) → 'expired' |
| UT-EXP-006 | カスタムalertDays(60) → 正しい判定 | alertDays=60で期限内/期限間近を正しく判定 |
| UT-EXP-007 | getExpiringItems 正しくフィルタリング | warning/expiredのみ抽出、okは除外（2件返す） |
| UT-EXP-008 | getExpiringItems 全てok → 空配列 | 全ロット期限内 → 空配列 |
| UT-EXP-009 | sortByExpiry 昇順ソート | 期限日昇順、null/未設定は末尾 |
| UT-EXP-010 | null/空の期限 → "ok" | getExpiryStatus(null) / getExpiryStatus('') → 'ok' |

### 1.3 JANコード検証 (UT-JAN)

| ID | テスト内容 | 期待結果 |
|----|-----------|---------|
| UT-JAN-001 | 有効なJAN-13 "4901234567894" → valid | { valid: true } |
| UT-JAN-002 | 有効なJAN-8 "49123456" → valid | { valid: true } |
| UT-JAN-003 | 無効なJAN-13チェックディジット "4901234567890" → invalid | { valid: false } |
| UT-JAN-004 | 無効なJAN-8チェックディジット "49123450" → invalid | { valid: false } |
| UT-JAN-005 | 12桁 → invalid | { valid: false } |
| UT-JAN-006 | 14桁 → invalid | { valid: false } |
| UT-JAN-007 | 英字混在 → invalid | { valid: false } |
| UT-JAN-008 | 空文字 → valid | { valid: true }（任意項目） |
| UT-JAN-009 | null → valid | { valid: true }（任意項目） |
| UT-JAN-010 | オールゼロ "00000000" → valid | { valid: true } |
| UT-JAN-011 | 9桁 → invalid | { valid: false } |
| UT-JAN-012 | ハイフン入り "490-123-456" → invalid | { valid: false } |

### 1.4 棚卸計算 (UT-CNT)

| ID | テスト内容 | 期待結果 |
|----|-----------|---------|
| UT-CNT-001 | calculateVariance 差異なし → 0 | calculateVariance(10, 10) → 0 |
| UT-CNT-002 | 実数 > システム数 → 正の値 | calculateVariance(10, 15) → 5 |
| UT-CNT-003 | 実数 < システム数 → 負の値 | calculateVariance(10, 7) → -3 |
| UT-CNT-004 | generateVarianceReport 差異ありなし混在 | totalItems=3, discrepancies=2, 各varianceを正しく計算 |
| UT-CNT-005 | generateVarianceReport 全て一致 → discrepancies=0 | discrepancies=0, totalVariancePositive/Negative=0 |
| UT-CNT-006 | generateVarianceReport 未カウント品(actualQtyがnull/undefined) | countedItems=1, 未カウント品は差異として計上 |
| UT-CNT-007 | buildAdjustmentTransactions 差異があるもののみ | 差異2件に対して2件のadjustトランザクションを生成 |
| UT-CNT-008 | buildAdjustmentTransactions 差異なし → 空配列 | 全一致時は空配列 |

### 1.5 商品バリデーション (UT-VP)

| ID | テスト内容 | 期待結果 |
|----|-----------|---------|
| UT-VP-001 | 有効な最小限の商品 → valid | valid=true, errors空配列 |
| UT-VP-002 | 空の商品名 → invalid "商品名は必須です" | valid=false, エラーメッセージ含む |
| UT-VP-003 | 商品名100文字超 → invalid | valid=false, "商品名は100文字以内で入力してください" |
| UT-VP-004 | 無効なカテゴリ → invalid | valid=false, "カテゴリは「consumable」または「retail」を指定してください" |
| UT-VP-005 | カテゴリ "consumable" → valid | valid=true |
| UT-VP-006 | カテゴリ "retail" → valid | valid=true |
| UT-VP-007 | 無効なJANコード → invalid | valid=false, "JANコードが不正です" |
| UT-VP-008 | 有効なJANコード → valid | valid=true |
| UT-VP-009 | 負の販売価格 → invalid | valid=false, "販売価格は0以上の数値を入力してください" |
| UT-VP-010 | 負の原価 → invalid | valid=false, "原価は0以上の数値を入力してください" |
| UT-VP-011 | 負の最小在庫数 → invalid | valid=false, "最小在庫数は0以上の数値を入力してください" |
| UT-VP-012 | expiryAlertDays = 0 → valid | valid=true |
| UT-VP-013 | expiryAlertDays < 0 → invalid | valid=false, "期限アラート日数は0以上の数値を入力してください" |
| UT-VP-014 | nameKanaにカタカナ → invalid | valid=false, "フリガナはひらがなで入力してください" |
| UT-VP-015 | nameKanaにひらがな → valid | valid=true |

### 1.6 取引バリデーション (UT-VT)

| ID | テスト内容 | 期待結果 |
|----|-----------|---------|
| UT-VT-001 | 有効な入庫取引 → valid | valid=true, errors空配列 |
| UT-VT-002 | productIdなし → invalid | valid=false, "商品IDは必須です" |
| UT-VT-003 | 無効な取引種別 → invalid | valid=false, "取引種別が不正です（receive, use, sell, adjust, dispose）" |
| UT-VT-004 | 数量0 → invalid | valid=false, "数量は0以外の数値を入力してください" |
| UT-VT-005 | 空の日付 → invalid | valid=false, "日付は必須です" |
| UT-VT-006 | 不正な日付形式 → invalid | valid=false, "日付はYYYY-MM-DD形式で入力してください" |
| UT-VT-007 | ロット番号付き → valid | valid=true |
| UT-VT-008 | 入庫に単価付き → valid | valid=true |
| UT-VT-009 | 全有効取引種別 → 各valid | receive/use/sell/adjust/dispose 全てvalid=true |
| UT-VT-010 | 備考1000文字超 → invalid | valid=false, "備考は1000文字以内で入力してください" |

### 1.7 インポートバリデーション (UT-IMP)

| ID | テスト内容 | 期待結果 |
|----|-----------|---------|
| UT-IMP-001 | 有効なインポートデータ → valid | valid=true, errors空配列 |
| UT-IMP-002 | 不正なappName → invalid | valid=false, "appNameが\"tana\"ではありません" |
| UT-IMP-003 | null → invalid | valid=false, "インポートデータが空です" |
| UT-IMP-004 | productsが配列でない → invalid | valid=false, "productsが配列ではありません" |
| UT-IMP-005 | stock_transactionsが配列でない → invalid | valid=false, "stock_transactionsが配列ではありません" |
| UT-IMP-006 | inventory_countsが配列でない → invalid | valid=false, "inventory_countsが配列ではありません" |
| UT-IMP-007 | productにidがない → invalid | valid=false, "products[0]にidがありません" |
| UT-IMP-008 | settingsがオブジェクトでない → invalid | valid=false, "settingsはオブジェクトである必要があります" |

### 1.8 商品コード生成 (UT-PC)

| ID | テスト内容 | 期待結果 |
|----|-----------|---------|
| UT-PC-001 | 既存なし → "P-0001" | generateProductCode([]) → 'P-0001' |
| UT-PC-002 | ["P-0001","P-0002"] → "P-0003" | 最大値+1のコードを返す |
| UT-PC-003 | ["P-0001","P-0005"] → "P-0006" (欠番あり) | 欠番を埋めず最大値+1 |
| UT-PC-004 | null/undefined → "P-0001" | null/undefinedは空配列と同等に処理 |
| UT-PC-005 | 不正なコード混在 → 無視して生成 | 'invalid', 'abc'は無視し'P-0003'から'P-0004' |
| UT-PC-006 | ["P-9999"] → throws | "商品コードが上限（P-9999）に達しました"例外 |

### 1.9 ダッシュボード (UT-DSH)

| ID | テスト内容 | 期待結果 |
|----|-----------|---------|
| UT-DSH-001 | getLowStockAlerts 在庫不足を検出 (stock=2, minStock=5) | 不足商品1件を返す |
| UT-DSH-002 | getLowStockAlerts 全て十分 → 空配列 | 全商品がminStock以上 → 空配列 |
| UT-DSH-003 | getExpiryAlerts 期限切れ・警告を検出 | expired商品1件を返す |
| UT-DSH-004 | getExpiryAlerts 期限問題なし → 空配列 | 全ロット期限内 → 空配列 |

### 1.10 ユーティリティ (UT-UTL)

| ID | テスト内容 | 期待結果 |
|----|-----------|---------|
| UT-UTL-001 | escapeHtml 通常文字列 | 'hello' → 'hello'（変換なし） |
| UT-UTL-002 | escapeHtml "&" → "&amp;" | 'a&b' → 'a&amp;b' |
| UT-UTL-003 | escapeHtml "<" → "&lt;" | '\<script\>' → '&lt;script&gt;' |
| UT-UTL-004 | escapeHtml '"' → "&quot;" | 'say "hello"' → 'say &quot;hello&quot;' |
| UT-UTL-005 | escapeHtml null → 空文字 | escapeHtml(null) → '' |
| UT-UTL-006 | escapeHtml undefined → 空文字 | escapeHtml(undefined) → '' |
| UT-UTL-007 | escapeHtml 数値 → 文字列化 | escapeHtml(123) → '123' |
| UT-UTL-008 | formatCurrency カンマ区切り (1234567 → "¥1,234,567") | formatCurrency(1234567) → '¥1,234,567' |
| UT-UTL-009 | formatCurrency(0) → "¥0" | formatCurrency(0) → '¥0' |
| UT-UTL-010 | formatDate("2025-01-15") → "2025/01/15" | YYYY-MM-DD → YYYY/MM/DD変換 |
| UT-UTL-011 | formatDate("invalid") → "---" | 不正な日付 → '---' |
| UT-UTL-012 | searchProducts 名前/カナ/JANでマッチ | 名前・ふりがな・JANコードそれぞれで検索可能 |

### 1.11 レポート (UT-RPT)

| ID | テスト内容 | 期待結果 |
|----|-----------|---------|
| UT-RPT-001 | buildStockSummaryReport 商品あり | 商品数分のレポートデータを返す（productId, productName, currentStock等） |
| UT-RPT-002 | buildStockSummaryReport カテゴリフィルタ | filterByCategory + buildStockSummaryReport → 指定カテゴリのみ |
| UT-RPT-003 | buildTransactionReport 日付範囲フィルタ | startDate〜endDate範囲の取引のみ返す |
| UT-RPT-004 | buildExpiryReport ステータス色分け | expired/okステータスを正しく付与 |
| UT-RPT-005 | buildVarianceReport | 棚卸差異レポート生成（variance, summary含む） |
| UT-RPT-006 | buildVarianceReport 空カウント → 空 | null入力 → countDate/status=null, items空配列, summary空オブジェクト |

### 1.12 サンプルデータ整合性 (UT-SD)

| ID | テスト内容 | 期待結果 |
|----|-----------|---------|
| UT-SD-001 | productCode の一意性 | 全商品のproductCodeが重複しない |
| UT-SD-002 | janCode のフォーマット検証 | janCodeが設定されている商品は全てvalidateJanCode通過 |
| UT-SD-003 | stock_transactions の productId が products に存在 | 全取引のproductIdが商品マスタに存在 |
| UT-SD-004 | inventory_counts の items.productId が products に存在 | 棚卸データの全商品IDが商品マスタに存在 |
| UT-SD-005 | category が "consumable" \| "retail" のみ | 全商品のcategoryが有効値のみ |
| UT-SD-006 | transactionType が正しい値のみ | 全取引のtransactionTypeがreceive/use/sell/adjust/disposeのいずれか |

---

## 2. E2Eテスト

### 2.1 アプリ起動 (E2E-APP)

| ID | テスト内容 | 期待結果 |
|----|-----------|---------|
| E2E-APP-001 | アプリが読み込まれ、JSエラーなし、タイトルに"Tana"を含む | タイトル・ヘッダーに"Tana"含む、致命的JSエラーなし |
| E2E-APP-002 | 6つのメインタブが表示される | ダッシュボード/商品/入出庫/棚卸/レポート/設定の6タブ |
| E2E-APP-003 | 設定タブにバージョン情報が表示される | #app-versionが空でなく"-"でもない |

### 2.2 タブ切替 (E2E-TAB)

| ID | テスト内容 | 期待結果 |
|----|-----------|---------|
| E2E-TAB-001 | 全6タブが切り替え可能 | 各タブクリック時に対応コンテンツが表示（hidden=false） |
| E2E-TAB-002 | 入出庫サブタブが切り替え可能（入庫/使用/販売/履歴） | 4つのサブタブ全てが切り替え可能 |
| E2E-TAB-003 | レポートサブタブが切り替え可能（在庫一覧/入出庫履歴/使用期限/棚卸差異） | 4つのサブタブ全てが切り替え可能 |

### 2.3 設定 (E2E-SET)

| ID | テスト内容 | 期待結果 |
|----|-----------|---------|
| E2E-SET-001 | クリニック情報の保存とリロード後の永続性 | 入力した情報がIndexedDBに保存され、リロード後も保持 |
| E2E-SET-002 | 在庫管理設定の保存 | 期限アラート日数(60日)が保存される |
| E2E-SET-003 | 通知トグルの保存 | 通知ON/OFFがトグル可能で保存される |
| E2E-SET-004 | アプリバージョンとビルド日時が表示される | #app-version, #app-build-timeが空でない |

### 2.4 商品管理 (E2E-PRD)

| ID | テスト内容 | 期待結果 |
|----|-----------|---------|
| E2E-PRD-001 | 消耗品の商品登録（全フィールド入力） | 商品一覧に表示され、商品数が1以上 |
| E2E-PRD-002 | 物販商品の登録とカテゴリフィルター確認 | retail商品が登録され、カテゴリフィルターで表示確認 |
| E2E-PRD-003 | 商品詳細に全フィールドが表示される | 商品カードクリックで詳細オーバーレイが表示(hidden=false) |
| E2E-PRD-004 | 商品名の編集 | 商品名を変更して保存 → DB上の値が更新される |
| E2E-PRD-005 | 商品の削除（ソフトデリート）→ 一覧から消える | isActive=false設定後、一覧から非表示（カウント-1） |
| E2E-PRD-006 | 商品名で検索 | 検索フィールドに入力 → 一致する商品のみ表示 |
| E2E-PRD-007 | JANコードで検索 | JANコード入力 → 対応商品のみ表示 |
| E2E-PRD-008 | カテゴリフィルター | consumableフィルター → consumable商品のみ表示 |

### 2.5 入出庫管理 (E2E-TXN)

| ID | テスト内容 | 期待結果 |
|----|-----------|---------|
| E2E-TXN-001 | 入庫取引の登録（全フィールド） | 商品選択・数量100・単価500・ロット・備考を入力し保存成功 |
| E2E-TXN-002 | 使用取引の登録 | 使用数量10で保存成功 |
| E2E-TXN-003 | 販売取引の登録 | 販売数量5で保存成功 |
| E2E-TXN-004 | trackExpiry 商品でロット/使用期限フィールドが表示される | ロット番号・使用期限入力フィールドが存在（非null） |
| E2E-TXN-005 | 取引履歴フィルター | 種別フィルター"receive"選択 → 入庫取引のみ表示（1件以上） |
| E2E-TXN-006 | 在庫が商品カードに反映される | receive +100, use -10, sell -5 → DB上の在庫合計が85 |

### 2.6 棚卸 (E2E-CNT)

| ID | テスト内容 | 期待結果 |
|----|-----------|---------|
| E2E-CNT-001 | 新規棚卸を開始 → 商品が表示される | status='in_progress'の棚卸レコードが作成される |
| E2E-CNT-002 | テンキー入力 → カウント更新 | 実数値が設定され、numpadオーバーレイが存在する |
| E2E-CNT-003 | 棚卸完了 → ステータスが "completed" | 全アイテムカウント後、status='completed'に更新・調整取引生成 |
| E2E-CNT-004 | 棚卸差異レポートが利用可能 | 完了した棚卸が存在し、レポートセレクターに選択肢あり |

### 2.7 ダッシュボード (E2E-DSH)

| ID | テスト内容 | 期待結果 |
|----|-----------|---------|
| E2E-DSH-001 | 在庫不足アラートが表示される | #low-stock-alertsにアラートアイテムが表示される |
| E2E-DSH-002 | 使用期限アラートが表示される（期限切れロットあり） | #expiry-alertsにアラートアイテムが表示される |
| E2E-DSH-003 | 最近の取引が表示される | #recent-transactions-summaryに取引アイテムが表示される |

### 2.8 レポート (E2E-RPT)

| ID | テスト内容 | 期待結果 |
|----|-----------|---------|
| E2E-RPT-001 | 在庫レポートに商品が表示される | レポートテーブルまたは商品データが表示される |
| E2E-RPT-002 | 入出庫履歴レポートに取引が表示される | レポートテーブルが表示される |
| E2E-RPT-003 | 使用期限レポートに期限管理対象商品が表示される | レポートテーブルまたはロット情報が表示される |
| E2E-RPT-004 | 棚卸差異レポートに完了した棚卸が表示される | status='completed'の棚卸セッションが存在する |

### 2.9 データ管理 (E2E-DM)

| ID | テスト内容 | 期待結果 |
|----|-----------|---------|
| E2E-DM-001 | サンプルデータ読み込み → 商品が表示される | 商品数が15件以上表示される |
| E2E-DM-002 | エクスポートがダウンロードをトリガーする | JSONが生成されappName='tana'を含む有効なデータ |
| E2E-DM-003 | エクスポート → 全削除 → インポート → データ復元 | エクスポート→全削除(0件)→インポート→元の件数に復元 |
| E2E-DM-004 | 全データ削除 → 確認 → 全て空になる | products/stock_transactions/inventory_counts全て0件 |

### 2.10 バリデーション (E2E-VAL)

| ID | テスト内容 | 期待結果 |
|----|-----------|---------|
| E2E-VAL-001 | 商品名なしで保存 → エラー | エラートーストが表示されるか、フォームが閉じない |
| E2E-VAL-002 | 取引数量 0 で保存 → エラー | エラートーストが表示される |
| E2E-VAL-003 | 無効な JSON のインポート → エラー | appName不正のデータ → valid=false, errorsあり |
| E2E-VAL-004 | 不正な JAN コード → エラー | チェックディジット不正/桁数不正/英字含む → 全てvalid=false |
