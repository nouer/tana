# アルゴリズム・ロジック仕様書 — Tana 在庫管理

本ドキュメントは、Tana 在庫管理アプリで使用される全アルゴリズムの詳細仕様を記載する。
純粋計算関数は `local_app/tana.calc.js` に集約されており、DOM操作・IndexedDB操作を含まない。
UI側ユーティリティ（ID生成・写真圧縮）は `local_app/script.js` に定義されている。

---

## 1. 在庫計算アルゴリズム

### 1.1 現在庫計算 (`calculateCurrentStock`)

**ファイル**: `local_app/tana.calc.js`

**入力**:
- `transactions`: Array — 対象商品の取引履歴配列

**出力**:
- `number` — 現在の在庫数（負数もあり得る）

**アルゴリズム**:
```
FUNCTION calculateCurrentStock(transactions)
    IF transactions が配列でない OR 空配列 THEN
        RETURN 0
    END IF

    sum = 0
    FOR EACH tx IN transactions
        qty = Number(tx.quantity) OR 0

        SWITCH tx.transactionType
            CASE 'receive':
                sum += qty          // 入庫：加算
            CASE 'use':
                sum -= qty          // 使用：減算
            CASE 'sell':
                sum -= qty          // 販売：減算
            CASE 'dispose':
                sum -= qty          // 廃棄：減算
            CASE 'adjust':
                sum += qty          // 調整：符号付き加算（正=増、負=減）
            DEFAULT:
                何もしない          // 未知の種別は無視
        END SWITCH
    END FOR

    RETURN sum
END FUNCTION
```

**計算例**:

| # | 取引種別 | 数量 | 計算式 | 累計 |
|---|---------|------|--------|------|
| 1 | receive | 20 | 0 + 20 | 20 |
| 2 | use | 3 | 20 - 3 | 17 |
| 3 | sell | 2 | 17 - 2 | 15 |
| 4 | adjust | -1 | 15 + (-1) | 14 |
| 5 | dispose | 1 | 14 - 1 | 13 |

**エッジケース**:
| 入力 | 出力 | 理由 |
|------|------|------|
| `null` | 0 | 配列でない |
| `undefined` | 0 | 配列でない |
| `[]` | 0 | 空配列 |
| `[{transactionType: 'unknown', quantity: 5}]` | 0 | 未知の取引種別は無視 |
| `[{transactionType: 'receive', quantity: 'abc'}]` | 0 | `Number('abc')` は NaN、`\|\| 0` で 0 |
| `[{transactionType: 'receive', quantity: -5}]` | -5 | 数量がそのまま加算される |

---

### 1.2 ロット別在庫計算 (`calculateStockByLot`)

**ファイル**: `local_app/tana.calc.js`

**入力**:
- `transactions`: Array — 対象商品の取引履歴配列

**出力**:
- `Array<{lotNumber: string, expiryDate: string|null, quantity: number}>` — ロットごとの在庫一覧（数量0のロットは除外）

**アルゴリズム**:
```
FUNCTION calculateStockByLot(transactions)
    IF transactions が配列でない OR 空配列 THEN
        RETURN []
    END IF

    lots = {}   // キー: ロット番号、値: {lotNumber, expiryDate, quantity}

    FOR EACH tx IN transactions
        lot = tx.lotNumber OR ''    // ロット番号なしは空文字列でグルーピング

        IF lots[lot] が存在しない THEN
            lots[lot] = {
                lotNumber: lot,
                expiryDate: tx.expiryDate OR null,
                quantity: 0
            }
        END IF

        qty = Number(tx.quantity) OR 0

        SWITCH tx.transactionType
            CASE 'receive':
                lots[lot].quantity += qty
                IF tx.expiryDate が存在する THEN
                    lots[lot].expiryDate = tx.expiryDate   // 入庫時に使用期限を更新
                END IF
            CASE 'use', 'sell', 'dispose':
                lots[lot].quantity -= qty
            CASE 'adjust':
                lots[lot].quantity += qty   // 符号付き
        END SWITCH
    END FOR

    // 数量が 0 のロットを除外して返却
    RETURN lots の全エントリ WHERE quantity !== 0
END FUNCTION
```

**計算例**:

入力トランザクション:
| # | ロット番号 | 取引種別 | 数量 | 使用期限 |
|---|-----------|---------|------|---------|
| 1 | LOT-A | receive | 10 | 2026-06-30 |
| 2 | LOT-B | receive | 5 | 2026-12-31 |
| 3 | LOT-A | use | 3 | - |
| 4 | LOT-B | sell | 5 | - |

出力:
| ロット番号 | 使用期限 | 数量 |
|-----------|---------|------|
| LOT-A | 2026-06-30 | 7 |

（LOT-B は数量 0 のため除外）

**エッジケース**:
| 入力 | 出力 | 理由 |
|------|------|------|
| `null` | `[]` | 配列でない |
| ロット番号なしのトランザクションのみ | `[{lotNumber: '', ...}]` | 空文字列でグルーピング |
| 同一ロットに複数回 receive | 最後の expiryDate が採用される | receive ごとに expiryDate を上書き |
| 全ロットの数量が 0 | `[]` | すべてフィルタで除外 |

---

### 1.3 在庫金額計算 (`calculateStockValue`)

**ファイル**: `local_app/tana.calc.js`

**入力**:
- `transactions`: Array — 対象商品の取引履歴配列

**出力**:
- `number` — 在庫金額（円、整数に丸め）

**アルゴリズム**:
```
FUNCTION calculateStockValue(transactions)
    IF transactions が配列でない OR 空配列 THEN
        RETURN 0
    END IF

    totalQty = calculateCurrentStock(transactions)
    IF totalQty <= 0 THEN
        RETURN 0
    END IF

    // 入庫トランザクションのみから加重平均単価を算出
    totalCost = 0
    totalReceived = 0
    FOR EACH tx IN transactions
        IF tx.transactionType === 'receive' THEN
            qty = Number(tx.quantity) OR 0
            unitCost = Number(tx.unitCost) OR 0
            totalCost += qty * unitCost
            totalReceived += qty
        END IF
    END FOR

    IF totalReceived === 0 THEN
        RETURN 0
    END IF

    avgCost = totalCost / totalReceived
    RETURN Math.round(totalQty * avgCost)
END FUNCTION
```

**計算例**:

| # | 取引種別 | 数量 | 仕入単価 | 小計コスト |
|---|---------|------|---------|-----------|
| 1 | receive | 10 | 800 | 8,000 |
| 2 | receive | 5 | 900 | 4,500 |
| 3 | use | 3 | - | - |

計算:
```
totalQty = 10 + 5 - 3 = 12
totalCost = 8,000 + 4,500 = 12,500
totalReceived = 10 + 5 = 15
avgCost = 12,500 / 15 = 833.333...
在庫金額 = Math.round(12 * 833.333...) = Math.round(10,000) = 10,000
```

**エッジケース**:
| 入力状態 | 出力 | 理由 |
|---------|------|------|
| 空配列 | 0 | 初期チェックで return |
| 在庫数 <= 0 | 0 | `totalQty <= 0` で return |
| 入庫なし（use/adjust のみ） | 0 | `totalReceived === 0` で return |
| unitCost が未設定 | 0 | `Number(undefined) \|\| 0` で単価 0 |

---

## 2. 期限管理アルゴリズム

### 2.1 期限ステータス判定 (`getExpiryStatus`)

**ファイル**: `local_app/tana.calc.js`

**入力**:
- `expiryDate`: string|null — 使用期限（YYYY-MM-DD 形式）
- `alertDays`: number — アラート日数（期限前の警告対象日数）
- `refDate`: Date|string — 基準日

**出力**:
- `string` — `"ok"` | `"warning"` | `"expired"`

**アルゴリズム**:
```
FUNCTION getExpiryStatus(expiryDate, alertDays, refDate)
    // 使用期限が未設定 or 空文字列の場合
    IF expiryDate が空 OR 空文字列 THEN
        RETURN "ok"
    END IF

    expiry = Date(expiryDate) に変換
    IF expiry が無効な日付 THEN
        RETURN "ok"
    END IF

    // refDate を Date オブジェクトに変換（Date インスタンスならコピー、文字列なら変換）
    ref = refDate のコピーまたは変換
    IF ref が無効な日付 THEN
        RETURN "ok"
    END IF

    // 時刻を 00:00:00.000 にリセット（日付のみで比較）
    expiry.setHours(0, 0, 0, 0)
    ref.setHours(0, 0, 0, 0)

    // 1. 期限切れ判定: 使用期限 < 基準日
    IF expiry < ref THEN
        RETURN "expired"
    END IF

    // 2. 警告判定: 基準日 + alertDays 以内
    warningDate = ref + (Number(alertDays) OR 0) 日
    IF expiry <= warningDate THEN
        RETURN "warning"
    END IF

    // 3. 問題なし
    RETURN "ok"
END FUNCTION
```

**判定フロー図**:
```
expiryDate 未設定? ──YES──> "ok"
        |
       NO
        |
日付パース失敗? ──YES──> "ok"
        |
       NO
        |
refDate パース失敗? ──YES──> "ok"
        |
       NO
        |
expiry < ref? ──YES──> "expired"
        |
       NO
        |
expiry <= ref + alertDays? ──YES──> "warning"
        |
       NO
        |
    "ok"
```

**境界値テーブル** (alertDays=30, ref=2026-03-01):

| expiryDate | 計算 | 判定 | 理由 |
|-----------|------|------|------|
| (空) | - | ok | 使用期限未設定 |
| "invalid" | - | ok | 日付パース失敗 |
| 2026-02-28 | 2/28 < 3/1 | expired | 基準日より前 |
| 2026-03-01 | 3/1 < 3/1 → false | warning | 同日は expired ではない。3/1 <= 3/31 → warning |
| 2026-03-15 | 3/15 < 3/1 → false | warning | 3/15 <= 3/31(=3/1+30) → warning |
| 2026-03-31 | 3/31 <= 3/31 | warning | ちょうど warningDate と同日 |
| 2026-04-01 | 4/1 <= 3/31 → false | ok | warningDate を超過 |

**alertDays=0 の特殊ケース** (ref=2026-03-01):

| expiryDate | 判定 | 理由 |
|-----------|------|------|
| 2026-02-28 | expired | 基準日より前 |
| 2026-03-01 | warning | 同日: 3/1 <= 3/1(=3/1+0) → warning |
| 2026-03-02 | ok | 3/2 <= 3/1 → false |

---

### 2.2 期限切れアイテム抽出 (`getExpiringItems`)

**ファイル**: `local_app/tana.calc.js`

**入力**:
- `stockByLot`: Array<{lotNumber, expiryDate, quantity, productId}> — ロット別在庫一覧
- `alertDays`: number — アラート日数
- `refDate`: Date|string — 基準日

**出力**:
- `Array<{lotNumber, expiryDate, quantity, status, productId}>` — warning または expired のアイテムのみ

**アルゴリズム**:
```
FUNCTION getExpiringItems(stockByLot, alertDays, refDate)
    IF stockByLot が配列でない OR 空配列 THEN
        RETURN []
    END IF

    result = []
    FOR EACH item IN stockByLot
        status = getExpiryStatus(item.expiryDate, alertDays, refDate)

        IF status === "warning" OR status === "expired" THEN
            result に追加:
                lotNumber:  item.lotNumber
                expiryDate: item.expiryDate
                quantity:   item.quantity
                status:     status
                productId:  item.productId
        END IF
    END FOR

    RETURN result
END FUNCTION
```

**計算例** (alertDays=30, refDate=2026-03-01):

入力:
| lotNumber | expiryDate | quantity | productId |
|-----------|-----------|----------|-----------|
| LOT-A | 2026-02-15 | 5 | P-0001 |
| LOT-B | 2026-03-20 | 10 | P-0001 |
| LOT-C | 2026-06-01 | 8 | P-0002 |
| LOT-D | (null) | 3 | P-0003 |

出力:
| lotNumber | expiryDate | quantity | status | productId |
|-----------|-----------|----------|--------|-----------|
| LOT-A | 2026-02-15 | 5 | expired | P-0001 |
| LOT-B | 2026-03-20 | 10 | warning | P-0001 |

（LOT-C は ok のため除外、LOT-D は期限未設定で ok のため除外）

---

### 2.3 期限日ソート (`sortByExpiry`)

**ファイル**: `local_app/tana.calc.js`

**入力**:
- `items`: Array — expiryDate プロパティを持つオブジェクトの配列

**出力**:
- `Array` — 使用期限の昇順でソートされた新しい配列（元配列は変更しない）

**アルゴリズム**:
```
FUNCTION sortByExpiry(items)
    IF items が配列でない THEN
        RETURN []
    END IF

    // 元配列を変更しないよう slice() でコピー
    RETURN items.slice().sort(比較関数)

    比較関数(a, b):
        aDate = a.expiryDate OR null
        bDate = b.expiryDate OR null

        IF aDate === null AND bDate === null THEN RETURN 0   // 両方 null は同位
        IF aDate === null THEN RETURN 1                       // null は末尾へ
        IF bDate === null THEN RETURN -1                      // null は末尾へ
        IF aDate < bDate THEN RETURN -1                       // 昇順
        IF aDate > bDate THEN RETURN 1
        RETURN 0
END FUNCTION
```

**ソート例**:

入力:
| # | expiryDate |
|---|-----------|
| 1 | 2026-06-01 |
| 2 | (null) |
| 3 | 2026-03-15 |
| 4 | 2026-01-10 |
| 5 | (null) |

出力:
| # | expiryDate | 理由 |
|---|-----------|------|
| 4 | 2026-01-10 | 最も早い |
| 3 | 2026-03-15 | |
| 1 | 2026-06-01 | |
| 2 | (null) | null は末尾 |
| 5 | (null) | null は末尾 |

**エッジケース**:
| 入力 | 出力 | 理由 |
|------|------|------|
| `null` | `[]` | 配列でない |
| `[]` | `[]` | 空配列のソートは空配列 |
| 全要素が null | 入力順のまま | null 同士は同位（RETURN 0） |

---

## 3. 棚卸アルゴリズム

### 3.1 差異計算 (`calculateVariance`)

**ファイル**: `local_app/tana.calc.js`

**入力**:
- `systemQty`: number — システム上の在庫数
- `actualQty`: number — 実棚数

**出力**:
- `number` — 差異（実棚数 - システム在庫数）

**アルゴリズム**:
```
FUNCTION calculateVariance(systemQty, actualQty)
    RETURN (Number(actualQty) OR 0) - (Number(systemQty) OR 0)
END FUNCTION
```

**計算例**:
| systemQty | actualQty | 差異 | 意味 |
|-----------|-----------|------|------|
| 10 | 12 | +2 | 実在庫がシステムより 2 多い |
| 10 | 10 | 0 | 差異なし |
| 10 | 7 | -3 | 実在庫がシステムより 3 少ない |
| 0 | 5 | +5 | システム上は 0 だが実在庫あり |
| null | null | 0 | 両方 null は 0 として計算 |

---

### 3.2 差異レポート生成 (`generateVarianceReport`)

**ファイル**: `local_app/tana.calc.js`

**入力**:
- `countItems`: Array<{productId, productName, systemQuantity, actualQuantity}> — 棚卸項目一覧

**出力**:
```
{
    totalItems: number,           // 全商品数
    countedItems: number,         // 実棚カウント済み商品数
    discrepancies: number,        // 差異がある商品数
    totalVariancePositive: number, // プラス差異の合計
    totalVarianceNegative: number, // マイナス差異の合計
    items: Array<{productId, productName, systemQuantity, actualQuantity, variance}>
}
```

**アルゴリズム**:
```
FUNCTION generateVarianceReport(countItems)
    IF countItems が配列でない OR 空配列 THEN
        RETURN {
            totalItems: 0,
            countedItems: 0,
            discrepancies: 0,
            totalVariancePositive: 0,
            totalVarianceNegative: 0,
            items: []
        }
    END IF

    totalItems = countItems.length
    countedItems = 0
    discrepancies = 0
    totalVariancePositive = 0
    totalVarianceNegative = 0
    items = []

    FOR EACH item IN countItems
        variance = calculateVariance(item.systemQuantity, item.actualQuantity)

        // actualQuantity が null/undefined でなければカウント済み
        IF item.actualQuantity !== null AND item.actualQuantity !== undefined THEN
            countedItems++
        END IF

        // 差異がある場合
        IF variance !== 0 THEN
            discrepancies++
            IF variance > 0 THEN
                totalVariancePositive += variance
            ELSE
                totalVarianceNegative += variance
            END IF
        END IF

        items に追加:
            productId:   item.productId
            productName: item.productName
            systemQuantity: item.systemQuantity
            actualQuantity: item.actualQuantity
            variance:    variance
    END FOR

    RETURN {totalItems, countedItems, discrepancies,
            totalVariancePositive, totalVarianceNegative, items}
END FUNCTION
```

**計算例**:

入力:
| productId | productName | systemQuantity | actualQuantity |
|-----------|-----------|-----------|-----------|
| P-0001 | シャンプーA | 10 | 12 |
| P-0002 | トリートメントB | 5 | 5 |
| P-0003 | オイルC | 8 | 6 |
| P-0004 | クリームD | 3 | null |

出力:
```
{
    totalItems: 4,
    countedItems: 3,        // P-0004 は null なので未カウント
    discrepancies: 2,       // P-0001(+2), P-0003(-2)
    totalVariancePositive: 2,
    totalVarianceNegative: -2,
    items: [
        {productId: "P-0001", productName: "シャンプーA",       systemQuantity: 10, actualQuantity: 12,   variance: 2},
        {productId: "P-0002", productName: "トリートメントB",    systemQuantity: 5,  actualQuantity: 5,    variance: 0},
        {productId: "P-0003", productName: "オイルC",           systemQuantity: 8,  actualQuantity: 6,    variance: -2},
        {productId: "P-0004", productName: "クリームD",         systemQuantity: 3,  actualQuantity: null, variance: -3}
    ]
}
```

**注意**: `actualQuantity` が `null` の場合でも `calculateVariance` により `variance` は `0 - systemQuantity` として計算される。
ただし `countedItems` には含まれない（null/undefined チェック）。

---

### 3.3 調整トランザクション生成 (`buildAdjustmentTransactions`)

**ファイル**: `local_app/tana.calc.js`

**入力**:
- `countItems`: Array<{productId, systemQuantity, actualQuantity}> — 棚卸項目一覧
- `countDate`: string — 棚卸実施日（YYYY-MM-DD 形式）

**出力**:
- `Array<{productId, transactionType, quantity, date, notes}>` — 調整トランザクション配列

**アルゴリズム**:
```
FUNCTION buildAdjustmentTransactions(countItems, countDate)
    IF countItems が配列でない OR 空配列 THEN
        RETURN []
    END IF

    result = []
    FOR EACH item IN countItems
        variance = calculateVariance(item.systemQuantity, item.actualQuantity)

        IF variance !== 0 THEN
            result に追加:
                productId:       item.productId
                transactionType: 'adjust'
                quantity:        variance       // 正=増加調整、負=減少調整
                date:            countDate
                notes:           '棚卸調整'
        END IF
    END FOR

    RETURN result
END FUNCTION
```

**計算例**:

入力 (countDate = "2026-03-05"):
| productId | systemQuantity | actualQuantity |
|-----------|-----------|-----------|
| P-0001 | 10 | 12 |
| P-0002 | 5 | 5 |
| P-0003 | 8 | 6 |

出力:
| productId | transactionType | quantity | date | notes |
|-----------|----------------|----------|------|-------|
| P-0001 | adjust | +2 | 2026-03-05 | 棚卸調整 |
| P-0003 | adjust | -2 | 2026-03-05 | 棚卸調整 |

（P-0002 は差異 0 のため生成されない）

---

### 3.4 未カウント商品の自動補完 (`completeCount` 内処理)

**ファイル**: `local_app/script.js` — `completeCount()` 関数

**概要**: 棚卸完了時に未カウント商品がある場合、理論在庫数（systemQuantity）で自動補完する。

**アルゴリズム**:
```
FUNCTION completeCount() 内の自動補完処理
    items = activeCount.items OR []

    // 1. 未カウント商品を抽出
    uncounted = items.filter(item => item.status !== 'counted')

    // 2. 未カウント商品がある場合、確認ダイアログを表示
    IF uncounted.length > 0 THEN
        autoFill = showConfirm('未カウントの商品が ' + uncounted.length + ' 件あります。\n理論在庫数で棚卸しますか？')
        IF autoFill が false THEN
            RETURN  // 棚卸完了を中止
        END IF

        // 3. 未カウント商品に理論在庫数を設定
        FOR EACH item IN uncounted
            item.actualQuantity = item.systemQuantity
            item.status = 'counted'
        END FOR
    END IF

    // 4. 以降、通常の棚卸完了フロー（差異レポート生成・調整トランザクション作成）に進む
END FUNCTION
```

**動作例**:

棚卸に5商品あり、3商品がカウント済み・2商品が未カウントの場合:

| 商品 | カウント前 status | systemQuantity | actualQuantity（補完前） | actualQuantity（補完後） |
|------|-----------------|----------------|------------------------|------------------------|
| シャンプーA | counted | 10 | 12 | 12 |
| トリートメントB | counted | 5 | 5 | 5 |
| オイルC | counted | 8 | 6 | 6 |
| クリームD | pending | 3 | null | 3 |
| ワックスE | pending | 7 | null | 7 |

確認ダイアログ: 「未カウントの商品が 2 件あります。理論在庫数で棚卸しますか？」

**注意**: ユーザーが確認ダイアログでキャンセルした場合、棚卸完了処理全体が中止される。

---

## 4. ダッシュボードアルゴリズム

### 4.1 低在庫アラート判定 (`getLowStockAlerts`)

**ファイル**: `local_app/tana.calc.js`

**入力**:
- `products`: Array — 商品マスタ配列（各商品に `id`, `minStock` プロパティ）
- `stockMap`: Object — `{ productId: currentStock }` 形式の在庫マップ

**出力**:
- `Array` — 在庫が最小在庫数を下回る商品の配列

**アルゴリズム**:
```
FUNCTION getLowStockAlerts(products, stockMap)
    IF products が配列でない OR stockMap が falsy THEN
        RETURN []
    END IF

    RETURN products を以下の条件でフィルタ:
        currentStock = stockMap[product.id] が存在すれば その値、なければ 0
        minStock = Number(product.minStock) OR 0
        条件: currentStock < minStock
END FUNCTION
```

**計算例**:

入力:
| product.id | product.minStock | stockMap[id] | 判定 |
|-----------|-----------------|-------------|------|
| P-0001 | 5 | 3 | アラート（3 < 5） |
| P-0002 | 10 | 10 | 正常（10 < 10 → false） |
| P-0003 | 0 | 0 | 正常（0 < 0 → false） |
| P-0004 | 3 | (未定義) | アラート（0 < 3） |
| P-0005 | (未設定) | 5 | 正常（5 < 0 → false） |

**エッジケース**:
| 入力 | 出力 | 理由 |
|------|------|------|
| `products=null` | `[]` | 配列でない |
| `stockMap=null` | `[]` | falsy |
| `product.minStock=undefined` | 0 として扱う | `Number(undefined) \|\| 0` |
| `stockMap に product.id が存在しない` | currentStock=0 | `undefined !== undefined → false` で 0 |

---

### 4.2 期限アラート判定 (`getExpiryAlerts`)

**ファイル**: `local_app/tana.calc.js`

**入力**:
- `stockByLotMap`: Object — `{ productId: [{lotNumber, expiryDate, quantity}] }` 形式のロット別在庫マップ
- `products`: Array — 商品マスタ配列（各商品に `id`, `expiryAlertDays` プロパティ）

**出力**:
- `Array<{lotNumber, expiryDate, quantity, status, productId}>` — warning または expired のロット一覧

**アルゴリズム**:
```
FUNCTION getExpiryAlerts(stockByLotMap, products)
    IF stockByLotMap が falsy OR products が配列でない THEN
        RETURN []
    END IF

    now = 現在日時（new Date()）
    result = []

    FOR EACH product IN products
        lots = stockByLotMap[product.id]
        IF lots が配列でない THEN
            CONTINUE      // この商品にロットデータなし
        END IF

        alertDays = Number(product.expiryAlertDays) OR 0

        FOR EACH lot IN lots
            status = getExpiryStatus(lot.expiryDate, alertDays, now)

            IF status === "warning" OR status === "expired" THEN
                result に追加:
                    lotNumber:  lot.lotNumber
                    expiryDate: lot.expiryDate
                    quantity:   lot.quantity
                    status:     status
                    productId:  product.id
            END IF
        END FOR
    END FOR

    RETURN result
END FUNCTION
```

**計算例** (現在日: 2026-03-05):

商品マスタ:
| product.id | expiryAlertDays |
|-----------|----------------|
| P-0001 | 30 |
| P-0002 | 60 |

ロット別在庫マップ:
| productId | lotNumber | expiryDate | quantity |
|-----------|-----------|-----------|----------|
| P-0001 | LOT-A | 2026-03-01 | 5 |
| P-0001 | LOT-B | 2026-04-10 | 10 |
| P-0002 | LOT-C | 2026-04-20 | 3 |

出力:
| lotNumber | expiryDate | quantity | status | productId |
|-----------|-----------|----------|--------|-----------|
| LOT-A | 2026-03-01 | 5 | expired | P-0001 |
| LOT-C | 2026-04-20 | 3 | warning | P-0002 |

（LOT-B: 4/10 は 3/5+30=4/4 より後 → ok。LOT-C: 4/20 は 3/5+60=5/4 以内 → warning。）

---

## 5. バリデーションアルゴリズム

### 5.1 JANコード検証 (`validateJanCode`)

**ファイル**: `local_app/tana.calc.js`

**入力**:
- `code`: string|null — JANコード文字列

**出力**:
- `{valid: boolean}` — 検証結果

**アルゴリズム**:
```
FUNCTION validateJanCode(code)
    // 空・未設定は有効（任意フィールドのため）
    IF code が null OR undefined OR 空文字列 THEN
        RETURN {valid: true}
    END IF

    str = String(code)

    // 数字のみで構成されているか
    IF str が /^\d+$/ にマッチしない THEN
        RETURN {valid: false}
    END IF

    // 桁数チェック（8桁 or 13桁のみ有効）
    IF str.length !== 8 AND str.length !== 13 THEN
        RETURN {valid: false}
    END IF

    // --- JAN-13 チェックデジット検証 ---
    IF str.length === 13 THEN
        sum = 0
        FOR i = 0 TO 11
            digit = str[i] の数値
            IF i が偶数（0始まり: 位置1,3,5,7,9,11）THEN
                sum += digit * 1    // 奇数位置: 重み 1
            ELSE
                sum += digit * 3    // 偶数位置: 重み 3
            END IF
        END FOR
        checkDigit = (10 - (sum % 10)) % 10
        RETURN {valid: checkDigit === str[12] の数値}
    END IF

    // --- JAN-8 チェックデジット検証 ---
    IF str.length === 8 THEN
        sum = 0
        FOR i = 0 TO 6
            digit = str[i] の数値
            IF i が偶数（0始まり: 位置1,3,5,7）THEN
                sum += digit * 3    // 奇数位置: 重み 3
            ELSE
                sum += digit * 1    // 偶数位置: 重み 1
            END IF
        END FOR
        checkDigit = (10 - (sum % 10)) % 10
        RETURN {valid: checkDigit === str[7] の数値}
    END IF

    RETURN {valid: false}
END FUNCTION
```

**JAN-13 計算例** (コード: `4901234567894`):
```
位置(0始まり):  0  1  2  3  4  5  6  7  8  9  10 11 | 12
桁:            4  9  0  1  2  3  4  5  6  7  8  9  | 4
重み:          1  3  1  3  1  3  1  3  1  3  1  3
積:            4  27 0  3  2  9  4  15 6  21 8  27

sum = 4+27+0+3+2+9+4+15+6+21+8+27 = 126
checkDigit = (10 - (126 % 10)) % 10 = (10 - 6) % 10 = 4
str[12] = 4 → 一致 → valid: true
```

**JAN-8 計算例** (コード: `49123457`):
```
位置(0始まり):  0  1  2  3  4  5  6 | 7
桁:            4  9  1  2  3  4  5  | 7
重み:          3  1  3  1  3  1  3
積:            12 9  3  2  9  4  15

sum = 12+9+3+2+9+4+15 = 54
checkDigit = (10 - (54 % 10)) % 10 = (10 - 4) % 10 = 6
str[7] = 7 → 不一致 → valid: false
```

**重みの違いに関する注意**:
- JAN-13: 奇数位置(1,3,5...) → 重み1、偶数位置(2,4,6...) → 重み3
- JAN-8: 奇数位置(1,3,5,7) → 重み3、偶数位置(2,4,6) → 重み1
- コード上は 0 始まりインデックスのため `i % 2 === 0` の扱いが逆になる

**エッジケース**:
| 入力 | 出力 | 理由 |
|------|------|------|
| `null` | `{valid: true}` | 任意フィールドのため空は有効 |
| `""` | `{valid: true}` | 同上 |
| `"12345"` | `{valid: false}` | 桁数が 8 でも 13 でもない |
| `"ABCDEFGH"` | `{valid: false}` | 数字以外を含む |
| `"12345678901234"` | `{valid: false}` | 14桁は無効 |

---

### 5.2 商品バリデーション (`validateProduct`)

**ファイル**: `local_app/tana.calc.js`

**入力**:
- `product`: Object — 商品データオブジェクト

**出力**:
- `{valid: boolean, errors: string[]}` — 検証結果とエラーメッセージ配列

**アルゴリズム**:
```
FUNCTION validateProduct(product)
    errors = []

    IF product が falsy THEN
        RETURN {valid: false, errors: ['商品データが空です']}
    END IF

    // --- 必須フィールド ---

    // 商品名: 必須、1〜100文字
    IF product.name が未設定 OR 非文字列 OR trim後に空 THEN
        errors に追加: '商品名は必須です'
    ELSE IF product.name.length > 100 THEN
        errors に追加: '商品名は100文字以内で入力してください'
    END IF

    // カテゴリ: 必須、"consumable" or "retail"
    IF product.category !== 'consumable' AND product.category !== 'retail' THEN
        errors に追加: 'カテゴリは「consumable」または「retail」を指定してください'
    END IF

    // --- 任意フィールド（設定されている場合のみ検証）---

    // JANコード: 任意、設定されていれば validateJanCode で検証
    IF product.janCode が null/undefined/空文字列 でない THEN
        IF validateJanCode(product.janCode).valid === false THEN
            errors に追加: 'JANコードが不正です'
        END IF
    END IF

    // ふりがな: 任意、ひらがな・英数字・長音符・中黒・ハイフン・スペースのみ
    IF product.nameKana が null/undefined/空文字列 でない THEN
        IF nameKana が /^[\u3040-\u309F\u30FC\s0-9a-zA-Z\u30FB\-]+$/ にマッチしない THEN
            errors に追加: 'ふりがなに使用できない文字が含まれています'
        END IF
    END IF

    // 販売価格: 任意、0以上の数値
    IF product.defaultPrice が null/undefined/空文字列 でない THEN
        IF Number(defaultPrice) < 0 OR NaN THEN
            errors に追加: '販売価格は0以上の数値を入力してください'
        END IF
    END IF

    // 原価: 任意、0以上の数値
    IF product.costPrice が null/undefined/空文字列 でない THEN
        IF Number(costPrice) < 0 OR NaN THEN
            errors に追加: '原価は0以上の数値を入力してください'
        END IF
    END IF

    // 最小在庫数: 任意、0以上の数値
    IF product.minStock が null/undefined/空文字列 でない THEN
        IF Number(minStock) < 0 OR NaN THEN
            errors に追加: '最小在庫数は0以上の数値を入力してください'
        END IF
    END IF

    // 期限アラート日数: 任意、0以上の数値
    IF product.expiryAlertDays が null/undefined/空文字列 でない THEN
        IF Number(expiryAlertDays) < 0 OR NaN THEN
            errors に追加: '期限アラート日数は0以上の数値を入力してください'
        END IF
    END IF

    RETURN {valid: errors.length === 0, errors: errors}
END FUNCTION
```

**バリデーションルール一覧**:

| フィールド | 必須/任意 | 型 | 制約 | エラーメッセージ |
|-----------|---------|-----|------|---------------|
| name | 必須 | string | 1〜100文字、空白のみ不可 | 商品名は必須です / 商品名は100文字以内で入力してください |
| category | 必須 | string | "consumable" or "retail" | カテゴリは「consumable」または「retail」を指定してください |
| janCode | 任意 | string | JAN-8 or JAN-13、チェックデジット検証 | JANコードが不正です |
| nameKana | 任意 | string | ひらがな・英数字・長音符(ー)・中黒(・)・ハイフン(-)・空白 | ふりがなに使用できない文字が含まれています |
| defaultPrice | 任意 | number | >= 0 | 販売価格は0以上の数値を入力してください |
| costPrice | 任意 | number | >= 0 | 原価は0以上の数値を入力してください |
| minStock | 任意 | number | >= 0 | 最小在庫数は0以上の数値を入力してください |
| expiryAlertDays | 任意 | number | >= 0 | 期限アラート日数は0以上の数値を入力してください |

---

### 5.3 取引バリデーション (`validateTransaction`)

**ファイル**: `local_app/tana.calc.js`

**入力**:
- `transaction`: Object — 取引データオブジェクト

**出力**:
- `{valid: boolean, errors: string[]}` — 検証結果とエラーメッセージ配列

**アルゴリズム**:
```
FUNCTION validateTransaction(transaction)
    errors = []

    IF transaction が falsy THEN
        RETURN {valid: false, errors: ['取引データが空です']}
    END IF

    // 商品ID: 必須
    IF transaction.productId が falsy THEN
        errors に追加: '商品IDは必須です'
    END IF

    // 取引種別: 必須、有効値のみ
    validTypes = ['receive', 'use', 'sell', 'adjust', 'dispose']
    IF transaction.transactionType が未設定 OR validTypes に含まれない THEN
        errors に追加: '取引種別が不正です（receive, use, sell, adjust, dispose）'
    END IF

    // 数量: 必須、0以外の数値
    IF transaction.quantity が null OR undefined THEN
        errors に追加: '数量は必須です'
    ELSE IF Number(quantity) === 0 OR NaN THEN
        errors に追加: '数量は0以外の数値を入力してください'
    END IF

    // 日付: 必須、YYYY-MM-DD 形式
    IF transaction.date が falsy THEN
        errors に追加: '日付は必須です'
    ELSE IF date が /^\d{4}-\d{2}-\d{2}$/ にマッチしない THEN
        errors に追加: '日付はYYYY-MM-DD形式で入力してください'
    END IF

    // 備考: 任意、1000文字以内
    IF transaction.notes が null/undefined/空文字列 でない THEN
        IF notes.length > 1000 THEN
            errors に追加: '備考は1000文字以内で入力してください'
        END IF
    END IF

    RETURN {valid: errors.length === 0, errors: errors}
END FUNCTION
```

**バリデーションルール一覧**:

| フィールド | 必須/任意 | 型 | 制約 | エラーメッセージ |
|-----------|---------|-----|------|---------------|
| productId | 必須 | string | 非空 | 商品IDは必須です |
| transactionType | 必須 | string | receive/use/sell/adjust/dispose | 取引種別が不正です |
| quantity | 必須 | number | !== 0、非NaN | 数量は必須です / 数量は0以外の数値を入力してください |
| date | 必須 | string | YYYY-MM-DD 正規表現 | 日付は必須です / 日付はYYYY-MM-DD形式で入力してください |
| notes | 任意 | string | <= 1000文字 | 備考は1000文字以内で入力してください |

**注意**: 日付のバリデーションは正規表現による形式チェックのみ。`2026-13-45` のような無効な日付値も形式が合えば通過する。

---

### 5.4 インポートデータ検証 (`validateImportData`)

**ファイル**: `local_app/tana.calc.js`

**入力**:
- `data`: Object — インポート用JSONデータ

**出力**:
- `{valid: boolean, errors: string[]}` — 検証結果とエラーメッセージ配列

**アルゴリズム**:
```
FUNCTION validateImportData(data)
    errors = []

    IF data が falsy THEN
        RETURN {valid: false, errors: ['インポートデータが空です']}
    END IF

    // appName チェック
    IF data.appName !== 'tana' THEN
        errors に追加: 'appNameが"tana"ではありません'
    END IF

    // products チェック
    IF data.products が配列でない THEN
        errors に追加: 'productsが配列ではありません'
    ELSE
        FOR EACH product, index IN data.products
            IF product.id が falsy THEN
                errors に追加: 'products[{index}]にidがありません'
            END IF
        END FOR
    END IF

    // stock_transactions チェック
    IF data.stock_transactions が配列でない THEN
        errors に追加: 'stock_transactionsが配列ではありません'
    END IF

    // inventory_counts チェック
    IF data.inventory_counts が配列でない THEN
        errors に追加: 'inventory_countsが配列ではありません'
    END IF

    // settings チェック（存在する場合のみ）
    IF data.settings が null/undefined でない THEN
        IF settings が非オブジェクト OR 配列 THEN
            errors に追加: 'settingsはオブジェクトである必要があります'
        END IF
    END IF

    RETURN {valid: errors.length === 0, errors: errors}
END FUNCTION
```

**期待されるインポートデータ構造**:
```json
{
    "appName": "tana",
    "products": [
        {"id": "xxx", "name": "...", ...}
    ],
    "stock_transactions": [...],
    "inventory_counts": [...],
    "settings": {}              // 任意（null/undefined も可）
}
```

**検証ルール一覧**:

| フィールド | 必須 | 型 | 制約 | エラーメッセージ |
|-----------|------|-----|------|---------------|
| appName | 必須 | string | === 'tana' | appNameが"tana"ではありません |
| products | 必須 | Array | 各要素に id が必要 | productsが配列ではありません / products[N]にidがありません |
| stock_transactions | 必須 | Array | - | stock_transactionsが配列ではありません |
| inventory_counts | 必須 | Array | - | inventory_countsが配列ではありません |
| settings | 任意 | Object | 配列不可 | settingsはオブジェクトである必要があります |

---

## 6. コード生成アルゴリズム

### 6.1 商品コード生成 (`generateProductCode`)

**ファイル**: `local_app/tana.calc.js`

**入力**:
- `existingCodes`: Array<string> — 既存の商品コード配列（例: `["P-0001", "P-0003"]`）

**出力**:
- `string` — 新しい商品コード（例: `"P-0004"`）
- 上限超過時は `Error` をスロー

**アルゴリズム**:
```
FUNCTION generateProductCode(existingCodes)
    // 既存コードがない場合は初番
    IF existingCodes が配列でない OR 空配列 THEN
        RETURN "P-0001"
    END IF

    // 既存コードから最大番号を取得
    maxNum = 0
    FOR EACH code IN existingCodes
        match = String(code) を /^P-(\d{4})$/ でマッチ
        IF match が成功 THEN
            num = match[1] の数値
            IF num > maxNum THEN
                maxNum = num
            END IF
        END IF
    END FOR

    // 次番号を計算
    next = maxNum + 1

    // 上限チェック
    IF next > 9999 THEN
        THROW Error('商品コードが上限（P-9999）に達しました')
    END IF

    // 4桁ゼロ埋め
    padded = String(next)
    WHILE padded.length < 4
        padded = '0' + padded
    END WHILE

    RETURN "P-" + padded
END FUNCTION
```

**計算例**:

| 既存コード | 最大番号 | 次番号 | 出力 |
|-----------|---------|-------|------|
| `[]` | 0 | 1 | P-0001 |
| `["P-0001"]` | 1 | 2 | P-0002 |
| `["P-0001", "P-0003"]` | 3 | 4 | P-0004 |
| `["P-0001", "ABC", "P-0010"]` | 10 | 11 | P-0011 |
| `["ABC", "DEF"]` | 0 | 1 | P-0001 |
| `["P-9999"]` | 9999 | 10000 | Error スロー |

**エッジケース**:
| 入力 | 出力 | 理由 |
|------|------|------|
| `null` | `"P-0001"` | 配列でないので初番 |
| `["P-0001", "invalid"]` | `"P-0002"` | 正規表現にマッチしないコードは無視 |
| `["P-9999"]` | Error | 上限超過 |
| `["p-0001"]` | `"P-0001"` | 大文字小文字区別あり、`/^P-/` にマッチしない |

---

## 7. フォーマットアルゴリズム

### 7.1 日付フォーマット (`formatDate`)

**ファイル**: `local_app/tana.calc.js`

**入力**:
- `dateStr`: string — 日付文字列（任意の JavaScript Date パース可能な形式）

**出力**:
- `string` — `"YYYY/MM/DD"` 形式の日付文字列、または `"---"`（無効な場合）

**アルゴリズム**:
```
FUNCTION formatDate(dateStr)
    IF dateStr が falsy THEN
        RETURN "---"
    END IF

    d = new Date(dateStr)
    IF d が無効な日付 THEN
        RETURN "---"
    END IF

    year  = d.getFullYear()
    month = d.getMonth() + 1    // 0始まりのため +1
    day   = d.getDate()

    // 月・日を 2 桁ゼロ埋め
    IF month が 1桁 THEN month = "0" + month
    IF day が 1桁 THEN day = "0" + day

    RETURN year + "/" + month + "/" + day
END FUNCTION
```

**変換例**:
| 入力 | 出力 | 理由 |
|------|------|------|
| `"2026-03-05"` | `"2026/03/05"` | 正常変換 |
| `"2026-12-25"` | `"2026/12/25"` | 正常変換 |
| `"2026-01-01T15:30:00"` | `"2026/01/01"` | 時刻部分は無視 |
| `null` | `"---"` | falsy |
| `""` | `"---"` | falsy（空文字列） |
| `"invalid"` | `"---"` | Date パース失敗 |
| `undefined` | `"---"` | falsy |

---

### 7.2 通貨フォーマット (`formatCurrency`)

**ファイル**: `local_app/tana.calc.js`

**入力**:
- `amount`: number — 金額

**出力**:
- `string` — `"¥"` プレフィックス付き、3桁カンマ区切りの金額文字列

**アルゴリズム**:
```
FUNCTION formatCurrency(amount)
    IF amount が null OR undefined OR NaN THEN
        RETURN "¥0"
    END IF

    num = Number(amount)

    // 絶対値を文字列に変換
    parts = |num| を文字列に変換し、"." で分割
    // 整数部に 3桁ごとにカンマを挿入
    parts[0] に正規表現で 3桁区切りカンマを挿入
    formatted = parts を "." で結合

    // 負数の場合はマイナス符号を付加
    IF num < 0 THEN
        formatted = "-" + formatted
    END IF

    RETURN "¥" + formatted
END FUNCTION
```

**変換例**:
| 入力 | 出力 | 理由 |
|------|------|------|
| `1000` | `"¥1,000"` | 3桁区切り |
| `0` | `"¥0"` | ゼロ |
| `1234567` | `"¥1,234,567"` | 7桁 |
| `-500` | `"¥-500"` | 負数 |
| `99.5` | `"¥99.5"` | 小数あり |
| `null` | `"¥0"` | null は 0 扱い |
| `undefined` | `"¥0"` | undefined は 0 扱い |
| `NaN` | `"¥0"` | NaN は 0 扱い |

**注意**: `¥` は Unicode `\u00a5`（円記号）を使用。バックスラッシュ問題を回避している。

---

### 7.3 HTMLエスケープ (`escapeHtml`)

**ファイル**: `local_app/tana.calc.js`

**入力**:
- `str`: any — エスケープ対象の値

**出力**:
- `string` — HTML特殊文字をエスケープした文字列

**アルゴリズム**:
```
FUNCTION escapeHtml(str)
    IF str が null OR undefined THEN
        RETURN ""        // 空文字列を返す（エラーにしない）
    END IF

    RETURN String(str) に対して以下の置換を順に適用:
        & → &amp;    // 最初に置換（他のエスケープ文字に & が含まれるため）
        < → &lt;
        > → &gt;
        " → &quot;
        ' → &#39;
END FUNCTION
```

**置換対象一覧**:
| 文字 | エスケープ後 | 理由 |
|------|------------|------|
| `&` | `&amp;` | HTML エンティティの開始文字 |
| `<` | `&lt;` | タグの開始 |
| `>` | `&gt;` | タグの終了 |
| `"` | `&quot;` | 属性値の区切り文字 |
| `'` | `&#39;` | 属性値の区切り文字（シングルクォート） |

**変換例**:
| 入力 | 出力 |
|------|------|
| `"<script>alert('XSS')</script>"` | `"&lt;script&gt;alert(&#39;XSS&#39;)&lt;/script&gt;"` |
| `'A & B "C"'` | `"A &amp; B &quot;C&quot;"` |
| `null` | `""` |
| `undefined` | `""` |
| `123` | `"123"` |
| `"通常テキスト"` | `"通常テキスト"` |

**重要**: `&` の置換は必ず最初に行う。後から置換すると `&lt;` が `&amp;lt;` に二重エスケープされてしまうため。

---

## 8. 検索・フィルターアルゴリズム

### 8.1 商品検索 (`searchProducts`)

**ファイル**: `local_app/tana.calc.js`

**入力**:
- `products`: Array — 商品マスタ配列
- `query`: string — 検索文字列

**出力**:
- `Array` — 検索条件に一致する商品の配列

**アルゴリズム**:
```
FUNCTION searchProducts(products, query)
    IF products が配列でない THEN
        RETURN []
    END IF
    IF query が falsy OR trim 後に空文字列 THEN
        RETURN products       // 検索条件なしは全件返却
    END IF

    q = query.toLowerCase()   // 大文字小文字を区別しない

    RETURN products をフィルタ:
        name = (product.name OR '').toLowerCase()
        kana = (product.nameKana OR '').toLowerCase()
        jan  = (product.janCode OR '').toLowerCase()

        条件: name に q を含む
              OR kana に q を含む
              OR jan に q を含む
END FUNCTION
```

**検索対象フィールドと検索方式**:
| フィールド | 検索方式 | 大文字小文字 |
|-----------|---------|------------|
| name（商品名） | 部分一致（indexOf） | 区別しない |
| nameKana（ふりがな） | 部分一致（indexOf） | 区別しない |
| janCode（JANコード） | 部分一致（indexOf） | 区別しない |

**検索例**:

商品マスタ:
| name | nameKana | janCode |
|------|---------|---------|
| シャンプーA | しゃんぷー | 4901234567894 |
| トリートメントB | とりーとめんと | 4901234567900 |
| ヘアオイルC | へあおいる | - |

| 検索クエリ | 一致商品 | 理由 |
|-----------|---------|------|
| `"シャンプー"` | シャンプーA | name 部分一致 |
| `"しゃん"` | シャンプーA | nameKana 部分一致 |
| `"4901234567"` | シャンプーA, トリートメントB | janCode 部分一致 |
| `""` | 全商品 | 空文字列は全件返却 |
| `"存在しない"` | (なし) | 一致なし |

---

### 8.2 商品ソート (`sortProducts`)

**ファイル**: `local_app/tana.calc.js`

**入力**:
- `products`: Array — 商品マスタ配列
- `field`: string — ソート対象フィールド名（`"name"`, `"stock"`, `"category"`, `"price"`）
- `direction`: string — ソート方向（`"asc"` or `"desc"`）

**出力**:
- `Array` — ソートされた新しい配列（元配列は変更しない）

**アルゴリズム**:
```
FUNCTION sortProducts(products, field, direction)
    IF products が配列でない THEN
        RETURN []
    END IF

    dir = (direction === 'desc') ? -1 : 1

    RETURN products.slice().sort(比較関数)

    比較関数(a, b):
        aVal = a[field]
        bVal = b[field]

        // "price" フィールドの場合は defaultPrice を使用
        IF field === 'price' THEN
            aVal = a.defaultPrice
            bVal = b.defaultPrice
        END IF

        // null/undefined は空文字列として扱う
        IF aVal が null OR undefined THEN aVal = ''
        IF bVal が null OR undefined THEN bVal = ''

        // 文字列の場合は localeCompare で比較（日本語対応）
        IF aVal が文字列型 THEN
            RETURN dir * aVal.localeCompare(bVal)
        END IF

        // 数値の場合は大小比較
        IF aVal < bVal THEN RETURN -1 * dir
        IF aVal > bVal THEN RETURN 1 * dir
        RETURN 0
END FUNCTION
```

**フィールドマッピング**:
| field 引数 | 実際のプロパティ | 型 | 比較方式 |
|-----------|---------------|-----|---------|
| `"name"` | `product.name` | string | localeCompare |
| `"category"` | `product.category` | string | localeCompare |
| `"stock"` | `product.stock` | number | 数値比較 |
| `"price"` | `product.defaultPrice` | number | 数値比較 |

**ソート例** (field="name", direction="asc"):

| 入力順 | name | ソート後の順 |
|--------|------|-----------|
| 1 | トリートメント | 2 |
| 2 | シャンプー | 1 |
| 3 | ヘアオイル | 3 |

---

### 8.3 カテゴリフィルター (`filterByCategory`)

**ファイル**: `local_app/tana.calc.js`

**入力**:
- `products`: Array — 商品マスタ配列
- `category`: string — フィルタ対象カテゴリ

**出力**:
- `Array` — 指定カテゴリの商品のみの配列

**アルゴリズム**:
```
FUNCTION filterByCategory(products, category)
    IF products が配列でない THEN
        RETURN []
    END IF

    // カテゴリ未指定・空文字列・"all" の場合は全件返却
    IF category が falsy OR '' OR 'all' THEN
        RETURN products
    END IF

    RETURN products をフィルタ:
        条件: product.category === category
END FUNCTION
```

**フィルタ例**:
| category 引数 | 動作 |
|-------------|------|
| `"consumable"` | consumable のみ返却 |
| `"retail"` | retail のみ返却 |
| `"all"` | 全件返却 |
| `""` | 全件返却 |
| `null` | 全件返却 |
| `undefined` | 全件返却 |

---

## 9. レポート生成アルゴリズム

### 9.1 在庫一覧レポート (`buildStockSummaryReport`)

**ファイル**: `local_app/tana.calc.js`

**入力**:
- `products`: Array — 商品マスタ配列
- `transactions`: Array — 全取引履歴配列

**出力**:
- `Array<{productId, productName, productCode, category, currentStock, minStock, unit, status}>`
  - `status`: `'zero'`（在庫0以下）、`'low'`（在庫が最小在庫以下）、`'normal'`

**アルゴリズム**:
```
FUNCTION buildStockSummaryReport(products, transactions)
    IF products が配列でない THEN
        RETURN []
    END IF

    // transactions から stockMap を内部構築
    stockMap = {}
    IF transactions が配列 THEN
        FOR EACH tx IN transactions
            stockMap[tx.productId] += tx.quantity  // 初期値 0
        END FOR
    END IF

    RETURN products.map:
        currentStock = stockMap[product.id] が存在すれば その値、なければ 0
        minStock = Number(product.minStock) OR 0

        productId:    product.id
        productName:  product.name
        productCode:  product.productCode OR ''
        category:     product.category
        currentStock: currentStock
        minStock:     minStock
        unit:         product.unit OR ''
        status:       currentStock <= 0 なら 'zero'、
                      currentStock <= minStock なら 'low'、
                      それ以外 'normal'
END FUNCTION
```

**出力例**:

入力:
- products: `[{id: "P-0001", name: "シャンプーA", productCode: "P-0001", category: "retail", unit: "本", minStock: 5}]`
- transactions: `[{productId: "P-0001", quantity: 20}, {productId: "P-0001", quantity: -5}]`

出力:
```json
[{
    "productId": "P-0001",
    "productName": "シャンプーA",
    "productCode": "P-0001",
    "category": "retail",
    "currentStock": 15,
    "minStock": 5,
    "unit": "本",
    "status": "normal"
}]
```

---

### 9.2 入出庫履歴レポート (`buildTransactionReport`)

**ファイル**: `local_app/tana.calc.js`

**入力**:
- `transactions`: Array — 全取引履歴配列
- `products`: Array — 商品マスタ配列（取引に商品名・商品コードを付与するために使用）
- `filters`: Object — フィルタ条件
  - `startDate` / `dateFrom`: string (YYYY-MM-DD) — 開始日（任意、両方指定時は `startDate` 優先）
  - `endDate` / `dateTo`: string (YYYY-MM-DD) — 終了日（任意、両方指定時は `endDate` 優先）
  - `productId`: string — 商品ID（任意）
  - `transactionType`: string — 取引種別（任意）

**出力**:
- `Array<{id, productId, productName, productCode, transactionType, quantity, date, lotNumber, expiryDate, notes}>` — フィルタ条件に一致し、商品情報で補完された取引の配列（日付降順→作成日時降順でソート）

**アルゴリズム**:
```
FUNCTION buildTransactionReport(transactions, products, filters)
    IF transactions が配列でない THEN
        RETURN []
    END IF

    // products から productMap を構築
    productMap = {}
    IF products が配列 THEN
        FOR EACH p IN products
            productMap[p.id] = p
        END FOR
    END IF

    filters = filters OR {}
    startDate = filters.startDate OR filters.dateFrom OR ''
    endDate = filters.endDate OR filters.dateTo OR ''

    filtered = transactions をフィルタ:
        // 各フィルタ条件は設定されている場合のみ適用
        IF filters.productId が設定済み AND tx.productId !== filters.productId THEN
            除外
        END IF
        IF filters.transactionType が設定済み AND tx.transactionType !== filters.transactionType THEN
            除外
        END IF
        IF startDate が設定済み AND tx.date < startDate THEN
            除外
        END IF
        IF endDate が設定済み AND tx.date > endDate THEN
            除外
        END IF
        上記いずれにも該当しなければ 採用

    // 日付降順→作成日時降順でソート
    filtered をソート: date DESC, createdAt DESC

    // 商品情報を付与して返却
    RETURN filtered.map:
        p = productMap[tx.productId]
        id:              tx.id
        productId:       tx.productId
        productName:     p が存在すれば p.name、なければ '(不明)'
        productCode:     p が存在すれば p.productCode OR ''、なければ ''
        transactionType: tx.transactionType
        quantity:        tx.quantity
        date:            tx.date
        lotNumber:       tx.lotNumber OR ''
        expiryDate:      tx.expiryDate OR ''
        notes:           tx.notes OR ''
END FUNCTION
```

**フィルタ組み合わせ例**:

| filters | 動作 |
|---------|------|
| `{productId: "P-0001"}` | P-0001 の取引のみ |
| `{startDate: "2026-01-01", endDate: "2026-03-31"}` | 1〜3月の取引のみ |
| `{dateFrom: "2026-01-01", dateTo: "2026-03-31"}` | 上と同等（エイリアス） |
| `{transactionType: "receive"}` | 入庫のみ |
| `{productId: "P-0001", transactionType: "use"}` | P-0001 の使用取引のみ |
| `null` | 全件返却 |
| `{}` | 全件返却（全フィルタが falsy） |

**注意**: 日付の比較は文字列比較（`<`, `>`）で行われる。YYYY-MM-DD 形式であれば文字列比較でも正しく動作する。

---

### 9.3 使用期限レポート (`buildExpiryReport`)

**ファイル**: `local_app/tana.calc.js`

**入力**:
- `transactions`: Array — 全取引履歴配列
- `products`: Array — 商品マスタ配列

**出力**:
- `Array<{productId, productName, lotNumber, expiryDate, quantity, daysUntil, status}>`
  - `status`: `'expired'`（期限切れ）、`'critical'`（30日以内）、`'warning'`（alertDays以内）、`'normal'`

**アルゴリズム**:
```
FUNCTION buildExpiryReport(transactions, products)
    IF transactions が配列でない OR products が配列でない THEN
        RETURN []
    END IF

    // trackExpiry が有効な商品のみ対象
    expiryProducts = products.filter(p => p.trackExpiry)
    productMap = expiryProducts を productId でマップ化

    // transactions からロット別在庫を内部構築
    lotMap = {}
    FOR EACH tx IN transactions
        IF productMap[tx.productId] が存在しない OR tx.lotNumber が空 OR tx.expiryDate が空 THEN
            CONTINUE
        END IF
        key = tx.productId + '|' + tx.lotNumber
        lotMap[key].quantity += tx.quantity  // 初期値 0、expiryDate も保持
    END FOR

    today = formatDate(new Date())

    // 在庫が正のロットのみ返却
    RETURN lotMap の全エントリ
        .filter(lot => lot.quantity > 0)
        .map:
            p = productMap[lot.productId]
            daysUntil = ceil((new Date(lot.expiryDate) - new Date(today)) / 86400000)
            alertDays = Number(p.expiryAlertDays) OR 30

            status = daysUntil <= 0 なら 'expired'、
                     daysUntil <= 30 なら 'critical'、
                     daysUntil <= alertDays なら 'warning'、
                     それ以外 'normal'

            productId:   lot.productId
            productName: p.name OR ''
            lotNumber:   lot.lotNumber
            expiryDate:  lot.expiryDate
            quantity:    lot.quantity
            daysUntil:   daysUntil
            status:      status
        .sort(daysUntil 昇順)
END FUNCTION
```

**注意**: `getExpiryAlerts` と異なり、ステータスが `"normal"` のロットも含めて在庫が正の全ロットを返却する。結果は `daysUntil` 昇順でソートされる。

---

### 9.4 棚卸差異レポート (`buildVarianceReport`)

**ファイル**: `local_app/tana.calc.js`

**入力**:
- `inventoryCount`: Object — 棚卸データ
  - `countDate`: string — 棚卸日
  - `status`: string — 棚卸ステータス
  - `items`: Array<{productName, systemQuantity, actualQuantity}> — 棚卸項目

**出力**:
```
{
    countDate: string|null,
    status: string|null,
    items: Array<{productId, productName, systemQuantity, actualQuantity, variance}>,
    summary: {
        totalItems: number,
        countedItems: number,
        discrepancies: number,
        totalVariancePositive: number,
        totalVarianceNegative: number
    }
}
```

**アルゴリズム**:
```
FUNCTION buildVarianceReport(inventoryCount)
    IF inventoryCount が falsy THEN
        RETURN {countDate: null, status: null, items: [], summary: {}}
    END IF

    items = inventoryCount.items が配列なら そのまま、でなければ []
    report = generateVarianceReport(items)    // 3.2 のアルゴリズムを使用

    RETURN {
        countDate: inventoryCount.countDate OR null,
        status:    inventoryCount.status OR null,
        items:     report.items,
        summary: {
            totalItems:            report.totalItems,
            countedItems:          report.countedItems,
            discrepancies:         report.discrepancies,
            totalVariancePositive: report.totalVariancePositive,
            totalVarianceNegative: report.totalVarianceNegative
        }
    }
END FUNCTION
```

**計算例**:

入力:
```json
{
    "countDate": "2026-03-05",
    "status": "completed",
    "items": [
        {"productId": "P-0001", "productName": "シャンプーA", "systemQuantity": 10, "actualQuantity": 12},
        {"productId": "P-0002", "productName": "オイルB",     "systemQuantity": 5,  "actualQuantity": 5}
    ]
}
```

出力:
```json
{
    "countDate": "2026-03-05",
    "status": "completed",
    "items": [
        {"productId": "P-0001", "productName": "シャンプーA", "systemQuantity": 10, "actualQuantity": 12, "variance": 2},
        {"productId": "P-0002", "productName": "オイルB",     "systemQuantity": 5,  "actualQuantity": 5,  "variance": 0}
    ],
    "summary": {
        "totalItems": 2,
        "countedItems": 2,
        "discrepancies": 1,
        "totalVariancePositive": 2,
        "totalVarianceNegative": 0
    }
}
```

---

## 10. 写真圧縮アルゴリズム

**ファイル**: `local_app/script.js` — `handlePhotoInput()` 関数

**入力**:
- `event`: InputEvent — ファイル入力イベント（`<input type="file">` から発火）

**出力**:
- base64 データURL（JPEG形式）がプレビュー要素に設定される

**アルゴリズム**:
```
FUNCTION handlePhotoInput(event)
    file = event.target.files[0]
    IF file が存在しない THEN
        RETURN
    END IF

    // 1. ファイルを FileReader で読み込み
    reader = new FileReader()
    reader.readAsDataURL(file)

    // 2. 読み込み完了時
    reader.onload:
        img = new Image()
        img.src = reader.result    // base64 データURL

        // 3. 画像読み込み完了時
        img.onload:
            // --- リサイズ計算 ---
            maxWidth = 400    // 最大幅（ピクセル）
            width = img.width
            height = img.height

            IF width > maxWidth THEN
                // アスペクト比を維持してリサイズ
                height = Math.round((height * maxWidth) / width)
                width = maxWidth
            END IF

            // --- Canvas で圧縮 ---
            canvas = document.createElement('canvas')
            canvas.width = width
            canvas.height = height
            ctx = canvas.getContext('2d')
            ctx.drawImage(img, 0, 0, width, height)

            // JPEG 品質 0.6 で圧縮
            compressed = canvas.toDataURL('image/jpeg', 0.6)

            // 4. プレビュー表示
            preview 要素に compressed を設定
            クリアボタンを表示
END FUNCTION
```

**リサイズ計算例**:
| 元サイズ (W x H) | maxWidth | リサイズ後 (W x H) | 計算 |
|-----------------|----------|-------------------|------|
| 800 x 600 | 400 | 400 x 300 | height = round(600 * 400 / 800) = 300 |
| 1920 x 1080 | 400 | 400 x 225 | height = round(1080 * 400 / 1920) = 225 |
| 300 x 200 | 400 | 300 x 200 | リサイズ不要（width <= maxWidth） |
| 400 x 400 | 400 | 400 x 400 | リサイズ不要（width <= maxWidth） |
| 4000 x 3000 | 400 | 400 x 300 | height = round(3000 * 400 / 4000) = 300 |

**圧縮パラメータ**:
| パラメータ | 値 | 説明 |
|----------|-----|------|
| 最大幅 | 400px | これを超える画像は縮小 |
| 出力形式 | image/jpeg | JPEG 形式 |
| 品質 | 0.6 | 0.0〜1.0（1.0が最高品質） |
| 出力 | base64 データURL | `data:image/jpeg;base64,...` 形式 |

---

## 11. ID生成アルゴリズム

**ファイル**: `local_app/script.js` — `generateId()` 関数

**入力**:
- なし

**出力**:
- `string` — ユニークなID文字列

**アルゴリズム**:
```
FUNCTION generateId()
    part1 = Date.now().toString(36)           // 現在時刻（ミリ秒）を36進数に変換
    part2 = Math.random().toString(36).substr(2, 9)  // 乱数を36進数にし、先頭2文字を除いた9文字
    RETURN part1 + part2
END FUNCTION
```

**生成例**:
```
Date.now() = 1709654400000
part1 = (1709654400000).toString(36) = "m5x3k5xc"   // 8〜9文字
part2 = Math.random() → 0.7382... → "0.7382...".toString(36) → "0.q8f..." → substr(2,9) → "q8f..."  // 最大9文字

結果: "m5x3k5xcq8f..."   // 合計 17〜18文字程度
```

**特性**:
| 項目 | 値 |
|------|-----|
| 形式 | 36進数（0-9, a-z） |
| 長さ | 約 17〜18 文字（可変長） |
| 時系列性 | 前半部分がタイムスタンプのため、おおよそ時系列順 |
| 一意性保証 | ミリ秒精度 + 乱数による衝突回避（暗号学的保証はなし） |
| 用途 | 商品ID、取引ID、棚卸IDの生成 |

**注意**: `crypto.randomUUID()` は使用していない。タイムスタンプ + 乱数の組み合わせによる簡易的なID生成方式を採用している。

---

## 付録A: 関数一覧と依存関係

### tana.calc.js エクスポート関数一覧

| # | 関数名 | セクション | 依存する関数 |
|---|-------|----------|------------|
| 1 | `calculateCurrentStock` | 1.1 | なし |
| 2 | `calculateStockByLot` | 1.2 | なし |
| 3 | `calculateStockValue` | 1.3 | `calculateCurrentStock` |
| 4 | `getExpiryStatus` | 2.1 | なし |
| 5 | `getExpiringItems` | 2.2 | `getExpiryStatus` |
| 6 | `sortByExpiry` | 2.3 | なし |
| 7 | `calculateVariance` | 3.1 | なし |
| 8 | `generateVarianceReport` | 3.2 | `calculateVariance` |
| 9 | `buildAdjustmentTransactions` | 3.3 | `calculateVariance` |
| 10 | `getLowStockAlerts` | 4.1 | なし |
| 11 | `getExpiryAlerts` | 4.2 | `getExpiryStatus` |
| 12 | `validateJanCode` | 5.1 | なし |
| 13 | `validateProduct` | 5.2 | `validateJanCode` |
| 14 | `validateTransaction` | 5.3 | なし |
| 15 | `validateImportData` | 5.4 | なし |
| 16 | `generateProductCode` | 6.1 | なし |
| 17 | `formatDate` | 7.1 | なし |
| 18 | `formatCurrency` | 7.2 | なし |
| 19 | `escapeHtml` | 7.3 | なし |
| 20 | `searchProducts` | 8.1 | なし |
| 21 | `sortProducts` | 8.2 | なし |
| 22 | `filterByCategory` | 8.3 | なし |
| 23 | `buildStockSummaryReport` | 9.1 | なし |
| 24 | `buildTransactionReport` | 9.2 | なし |
| 25 | `buildExpiryReport` | 9.3 | `getExpiryStatus` |
| 26 | `buildVarianceReport` | 9.4 | `generateVarianceReport` → `calculateVariance` |

### script.js ユーティリティ関数

| # | 関数名 | セクション | 依存する関数 |
|---|-------|----------|------------|
| 1 | `generateId` | 11 | なし |
| 2 | `handlePhotoInput` | 10 | なし（DOM操作のみ） |

---

## 付録B: モジュールエクスポート

`tana.calc.js` は Node.js とブラウザの両環境に対応したエクスポートを行う。

```
IF typeof module !== 'undefined' AND module.exports THEN
    // Node.js 環境: module.exports にオブジェクトとしてエクスポート
    // テスト（npm test）で使用
    module.exports = { calculateCurrentStock, calculateStockByLot, ... }
ELSE
    // ブラウザ環境: window.TanaCalc にオブジェクトとしてエクスポート
    // script.js から TanaCalc.calculateCurrentStock() のように呼び出し
    window.TanaCalc = { calculateCurrentStock, calculateStockByLot, ... }
END IF
```

| 環境 | エクスポート先 | 呼び出し例 |
|------|-------------|-----------|
| Node.js | `module.exports` | `const calc = require('./tana.calc'); calc.calculateCurrentStock(...)` |
| ブラウザ | `window.TanaCalc` | `TanaCalc.calculateCurrentStock(...)` |
