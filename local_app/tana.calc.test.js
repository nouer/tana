const TanaCalc = require('./tana.calc.js');

// ============================================================
// 1. Stock Calculation (UT-STK-001~012)
// ============================================================

describe('在庫計算', () => {
    test('UT-STK-001: 入庫のみ → 正の在庫数', () => {
        const transactions = [
            { transactionType: 'receive', quantity: 10 }
        ];
        expect(TanaCalc.calculateCurrentStock(transactions)).toBe(10);
    });

    test('UT-STK-002: 入庫+使用 → 差分', () => {
        const transactions = [
            { transactionType: 'receive', quantity: 10 },
            { transactionType: 'use', quantity: 3 }
        ];
        expect(TanaCalc.calculateCurrentStock(transactions)).toBe(7);
    });

    test('UT-STK-003: 入庫+販売 → 差分', () => {
        const transactions = [
            { transactionType: 'receive', quantity: 10 },
            { transactionType: 'sell', quantity: 2 }
        ];
        expect(TanaCalc.calculateCurrentStock(transactions)).toBe(8);
    });

    test('UT-STK-004: 入庫+廃棄 → 差分', () => {
        const transactions = [
            { transactionType: 'receive', quantity: 10 },
            { transactionType: 'dispose', quantity: 1 }
        ];
        expect(TanaCalc.calculateCurrentStock(transactions)).toBe(9);
    });

    test('UT-STK-005: 入庫+調整 → 調整後', () => {
        const transactions = [
            { transactionType: 'receive', quantity: 10 },
            { transactionType: 'adjust', quantity: -3 }
        ];
        expect(TanaCalc.calculateCurrentStock(transactions)).toBe(7);
    });

    test('UT-STK-006: 空配列 → 0', () => {
        expect(TanaCalc.calculateCurrentStock([])).toBe(0);
    });

    test('UT-STK-007: 出庫が入庫を超える → 負の値', () => {
        const transactions = [
            { transactionType: 'receive', quantity: 3 },
            { transactionType: 'use', quantity: 10 }
        ];
        expect(TanaCalc.calculateCurrentStock(transactions)).toBe(-7);
    });

    test('UT-STK-008: calculateStockByLot 異なるロットの在庫計算', () => {
        const transactions = [
            { transactionType: 'receive', quantity: 10, lotNumber: 'LOT-A', expiryDate: '2025-06-01' },
            { transactionType: 'receive', quantity: 5, lotNumber: 'LOT-B', expiryDate: '2025-12-01' },
            { transactionType: 'use', quantity: 3, lotNumber: 'LOT-A' }
        ];
        const result = TanaCalc.calculateStockByLot(transactions);
        expect(result).toHaveLength(2);
        const lotA = result.find(l => l.lotNumber === 'LOT-A');
        const lotB = result.find(l => l.lotNumber === 'LOT-B');
        expect(lotA.quantity).toBe(7);
        expect(lotA.expiryDate).toBe('2025-06-01');
        expect(lotB.quantity).toBe(5);
        expect(lotB.expiryDate).toBe('2025-12-01');
    });

    test('UT-STK-009: calculateStockByLot ロット番号なし', () => {
        const transactions = [
            { transactionType: 'receive', quantity: 10 },
            { transactionType: 'use', quantity: 3 }
        ];
        const result = TanaCalc.calculateStockByLot(transactions);
        expect(result).toHaveLength(1);
        expect(result[0].lotNumber).toBe('');
        expect(result[0].quantity).toBe(7);
    });

    test('UT-STK-010: calculateStockValue 基本計算', () => {
        const transactions = [
            { transactionType: 'receive', quantity: 10, unitCost: 100 },
            { transactionType: 'use', quantity: 3 }
        ];
        // remaining = 7, avgCost = 100, value = 700
        expect(TanaCalc.calculateStockValue(transactions)).toBe(700);
    });

    test('UT-STK-011: calculateStockValue 複数入庫単価の加重平均', () => {
        const transactions = [
            { transactionType: 'receive', quantity: 10, unitCost: 100 },
            { transactionType: 'receive', quantity: 10, unitCost: 200 },
            { transactionType: 'use', quantity: 5 }
        ];
        // totalReceived = 20, totalCost = 1000+2000 = 3000, avgCost = 150
        // remaining = 15, value = 15 * 150 = 2250
        expect(TanaCalc.calculateStockValue(transactions)).toBe(2250);
    });

    test('UT-STK-012: calculateStockValue 空配列 → 0', () => {
        expect(TanaCalc.calculateStockValue([])).toBe(0);
    });
});

// ============================================================
// 2. Expiry Management (UT-EXP-001~010)
// ============================================================

describe('期限管理', () => {
    const refDate = new Date('2025-01-01');

    test('UT-EXP-001: 期限が30日以上先 → "ok"', () => {
        expect(TanaCalc.getExpiryStatus('2025-03-01', 30, refDate)).toBe('ok');
    });

    test('UT-EXP-002: 期限がちょうどalertDays → "warning"', () => {
        // refDate=2025-01-01, alertDays=30 → warningDate=2025-01-31
        // expiry=2025-01-31 <= warningDate → warning
        expect(TanaCalc.getExpiryStatus('2025-01-31', 30, refDate)).toBe('warning');
    });

    test('UT-EXP-003: 期限がalertDays未満 → "warning"', () => {
        // refDate=2025-01-01, alertDays=30 → warningDate=2025-01-31
        // expiry=2025-01-15 <= warningDate → warning
        expect(TanaCalc.getExpiryStatus('2025-01-15', 30, refDate)).toBe('warning');
    });

    test('UT-EXP-004: 期限が当日 → "warning"', () => {
        // refDate=2025-01-01, alertDays=30 → warningDate=2025-01-31
        // expiry=2025-01-01: expiry < ref? No (equal). expiry <= warningDate? Yes → warning
        expect(TanaCalc.getExpiryStatus('2025-01-01', 30, refDate)).toBe('warning');
    });

    test('UT-EXP-005: 期限切れ → "expired"', () => {
        expect(TanaCalc.getExpiryStatus('2024-12-31', 30, refDate)).toBe('expired');
    });

    test('UT-EXP-006: カスタムalertDays(60) → 正しい判定', () => {
        // refDate=2025-01-01, alertDays=60 → warningDate=2025-03-02
        // expiry=2025-02-15 <= warningDate → warning
        expect(TanaCalc.getExpiryStatus('2025-02-15', 60, refDate)).toBe('warning');
        // expiry=2025-03-15 → ok
        expect(TanaCalc.getExpiryStatus('2025-03-15', 60, refDate)).toBe('ok');
    });

    test('UT-EXP-007: getExpiringItems 正しくフィルタリング', () => {
        const stockByLot = [
            { lotNumber: 'L1', expiryDate: '2025-06-01', quantity: 5, productId: 'P1' },  // ok
            { lotNumber: 'L2', expiryDate: '2025-01-15', quantity: 3, productId: 'P2' },  // warning
            { lotNumber: 'L3', expiryDate: '2024-12-01', quantity: 2, productId: 'P3' }   // expired
        ];
        const result = TanaCalc.getExpiringItems(stockByLot, 30, refDate);
        expect(result).toHaveLength(2);
        expect(result[0].status).toBe('warning');
        expect(result[0].lotNumber).toBe('L2');
        expect(result[1].status).toBe('expired');
        expect(result[1].lotNumber).toBe('L3');
    });

    test('UT-EXP-008: getExpiringItems 全てok → 空配列', () => {
        const stockByLot = [
            { lotNumber: 'L1', expiryDate: '2025-06-01', quantity: 5, productId: 'P1' },
            { lotNumber: 'L2', expiryDate: '2025-12-01', quantity: 3, productId: 'P2' }
        ];
        const result = TanaCalc.getExpiringItems(stockByLot, 30, refDate);
        expect(result).toHaveLength(0);
    });

    test('UT-EXP-009: sortByExpiry 昇順ソート', () => {
        const items = [
            { expiryDate: '2025-06-01' },
            { expiryDate: '2025-01-01' },
            { expiryDate: '2025-03-01' },
            { expiryDate: null }
        ];
        const result = TanaCalc.sortByExpiry(items);
        expect(result[0].expiryDate).toBe('2025-01-01');
        expect(result[1].expiryDate).toBe('2025-03-01');
        expect(result[2].expiryDate).toBe('2025-06-01');
        expect(result[3].expiryDate).toBeNull();
    });

    test('UT-EXP-010: null/空の期限 → "ok"', () => {
        expect(TanaCalc.getExpiryStatus(null, 30, refDate)).toBe('ok');
        expect(TanaCalc.getExpiryStatus('', 30, refDate)).toBe('ok');
    });
});

// ============================================================
// 3. JAN Code (UT-JAN-001~012)
// ============================================================

describe('JANコード検証', () => {
    test('UT-JAN-001: 有効なJAN-13 "4901234567894" → valid', () => {
        expect(TanaCalc.validateJanCode('4901234567894')).toEqual({ valid: true });
    });

    test('UT-JAN-002: 有効なJAN-8 "49123456" → valid', () => {
        // JAN-8 check: 4*3+9*1+1*3+2*1+3*3+4*1+5*3 = 12+9+3+2+9+4+15 = 54
        // check = (10 - 54%10) % 10 = 6, str[7] = '6' → valid
        expect(TanaCalc.validateJanCode('49123456')).toEqual({ valid: true });
    });

    test('UT-JAN-003: 無効なJAN-13チェックディジット "4901234567890" → invalid', () => {
        expect(TanaCalc.validateJanCode('4901234567890')).toEqual({ valid: false });
    });

    test('UT-JAN-004: 無効なJAN-8チェックディジット "49123450" → invalid', () => {
        expect(TanaCalc.validateJanCode('49123450')).toEqual({ valid: false });
    });

    test('UT-JAN-005: 12桁 → invalid', () => {
        expect(TanaCalc.validateJanCode('490123456789')).toEqual({ valid: false });
    });

    test('UT-JAN-006: 14桁 → invalid', () => {
        expect(TanaCalc.validateJanCode('49012345678901')).toEqual({ valid: false });
    });

    test('UT-JAN-007: 英字混在 → invalid', () => {
        expect(TanaCalc.validateJanCode('490123456789A')).toEqual({ valid: false });
    });

    test('UT-JAN-008: 空文字 → valid', () => {
        expect(TanaCalc.validateJanCode('')).toEqual({ valid: true });
    });

    test('UT-JAN-009: null → valid', () => {
        expect(TanaCalc.validateJanCode(null)).toEqual({ valid: true });
    });

    test('UT-JAN-010: オールゼロ "00000000" → valid', () => {
        // JAN-8: 0*3+0*1+0*3+0*1+0*3+0*1+0*3 = 0, check = (10-0)%10 = 0, str[7]='0' → valid
        expect(TanaCalc.validateJanCode('00000000')).toEqual({ valid: true });
    });

    test('UT-JAN-011: 9桁 → invalid', () => {
        expect(TanaCalc.validateJanCode('123456789')).toEqual({ valid: false });
    });

    test('UT-JAN-012: ハイフン入り "490-123-456" → invalid', () => {
        expect(TanaCalc.validateJanCode('490-123-456')).toEqual({ valid: false });
    });
});

// ============================================================
// 4. Inventory Count (UT-CNT-001~008)
// ============================================================

describe('棚卸計算', () => {
    test('UT-CNT-001: calculateVariance 差異なし → 0', () => {
        expect(TanaCalc.calculateVariance(10, 10)).toBe(0);
    });

    test('UT-CNT-002: 実数 > システム数 → 正の値', () => {
        expect(TanaCalc.calculateVariance(10, 15)).toBe(5);
    });

    test('UT-CNT-003: 実数 < システム数 → 負の値', () => {
        expect(TanaCalc.calculateVariance(10, 7)).toBe(-3);
    });

    test('UT-CNT-004: generateVarianceReport 差異ありなし混在', () => {
        const countItems = [
            { productId: 'P1', productName: '商品A', systemQty: 10, actualQty: 10 },
            { productId: 'P2', productName: '商品B', systemQty: 5, actualQty: 8 },
            { productId: 'P3', productName: '商品C', systemQty: 20, actualQty: 17 }
        ];
        const report = TanaCalc.generateVarianceReport(countItems);
        expect(report.totalItems).toBe(3);
        expect(report.countedItems).toBe(3);
        expect(report.discrepancies).toBe(2);
        expect(report.totalVariancePositive).toBe(3);
        expect(report.totalVarianceNegative).toBe(-3);
        expect(report.items).toHaveLength(3);
        expect(report.items[0].variance).toBe(0);
        expect(report.items[1].variance).toBe(3);
        expect(report.items[2].variance).toBe(-3);
    });

    test('UT-CNT-005: generateVarianceReport 全て一致 → discrepancies=0', () => {
        const countItems = [
            { productId: 'P1', productName: '商品A', systemQty: 10, actualQty: 10 },
            { productId: 'P2', productName: '商品B', systemQty: 5, actualQty: 5 }
        ];
        const report = TanaCalc.generateVarianceReport(countItems);
        expect(report.discrepancies).toBe(0);
        expect(report.totalVariancePositive).toBe(0);
        expect(report.totalVarianceNegative).toBe(0);
    });

    test('UT-CNT-006: generateVarianceReport 未カウント品(actualQtyがnull/undefined)', () => {
        const countItems = [
            { productId: 'P1', productName: '商品A', systemQty: 10, actualQty: 10 },
            { productId: 'P2', productName: '商品B', systemQty: 5, actualQty: null },
            { productId: 'P3', productName: '商品C', systemQty: 8, actualQty: undefined }
        ];
        const report = TanaCalc.generateVarianceReport(countItems);
        expect(report.totalItems).toBe(3);
        expect(report.countedItems).toBe(1);
        // null/undefined actualQty → variance = 0 - systemQty = negative
        // P2: variance = 0 - 5 = -5 (discrepancy)
        // P3: variance = 0 - 8 = -8 (discrepancy)
        expect(report.discrepancies).toBe(2);
    });

    test('UT-CNT-007: buildAdjustmentTransactions 差異があるもののみ', () => {
        const countItems = [
            { productId: 'P1', systemQty: 10, actualQty: 10 },
            { productId: 'P2', systemQty: 5, actualQty: 8 },
            { productId: 'P3', systemQty: 20, actualQty: 17 }
        ];
        const result = TanaCalc.buildAdjustmentTransactions(countItems, '2025-01-15');
        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({
            productId: 'P2',
            transactionType: 'adjust',
            quantity: 3,
            date: '2025-01-15',
            notes: '棚卸調整'
        });
        expect(result[1]).toEqual({
            productId: 'P3',
            transactionType: 'adjust',
            quantity: -3,
            date: '2025-01-15',
            notes: '棚卸調整'
        });
    });

    test('UT-CNT-008: buildAdjustmentTransactions 差異なし → 空配列', () => {
        const countItems = [
            { productId: 'P1', systemQty: 10, actualQty: 10 },
            { productId: 'P2', systemQty: 5, actualQty: 5 }
        ];
        const result = TanaCalc.buildAdjustmentTransactions(countItems, '2025-01-15');
        expect(result).toHaveLength(0);
    });
});

// ============================================================
// 5. Product Validation (UT-VP-001~015)
// ============================================================

describe('商品バリデーション', () => {
    const validProduct = {
        name: 'テスト商品',
        category: 'consumable'
    };

    test('UT-VP-001: 有効な最小限の商品 → valid', () => {
        const result = TanaCalc.validateProduct(validProduct);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    test('UT-VP-002: 空の商品名 → invalid "商品名は必須です"', () => {
        const result = TanaCalc.validateProduct({ ...validProduct, name: '' });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('商品名は必須です');
    });

    test('UT-VP-003: 商品名100文字超 → invalid', () => {
        const longName = 'あ'.repeat(101);
        const result = TanaCalc.validateProduct({ ...validProduct, name: longName });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('商品名は100文字以内で入力してください');
    });

    test('UT-VP-004: 無効なカテゴリ → invalid', () => {
        const result = TanaCalc.validateProduct({ ...validProduct, category: 'invalid' });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('カテゴリは「consumable」または「retail」を指定してください');
    });

    test('UT-VP-005: カテゴリ "consumable" → valid', () => {
        const result = TanaCalc.validateProduct({ ...validProduct, category: 'consumable' });
        expect(result.valid).toBe(true);
    });

    test('UT-VP-006: カテゴリ "retail" → valid', () => {
        const result = TanaCalc.validateProduct({ ...validProduct, category: 'retail' });
        expect(result.valid).toBe(true);
    });

    test('UT-VP-007: 無効なJANコード → invalid', () => {
        const result = TanaCalc.validateProduct({ ...validProduct, janCode: '1234567890123' });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('JANコードが不正です');
    });

    test('UT-VP-008: 有効なJANコード → valid', () => {
        const result = TanaCalc.validateProduct({ ...validProduct, janCode: '4901234567894' });
        expect(result.valid).toBe(true);
    });

    test('UT-VP-009: 負の販売価格 → invalid', () => {
        const result = TanaCalc.validateProduct({ ...validProduct, defaultPrice: -100 });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('販売価格は0以上の数値を入力してください');
    });

    test('UT-VP-010: 負の原価 → invalid', () => {
        const result = TanaCalc.validateProduct({ ...validProduct, costPrice: -50 });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('原価は0以上の数値を入力してください');
    });

    test('UT-VP-011: 負の最小在庫数 → invalid', () => {
        const result = TanaCalc.validateProduct({ ...validProduct, minStock: -1 });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('最小在庫数は0以上の数値を入力してください');
    });

    test('UT-VP-012: expiryAlertDays = 0 → valid', () => {
        const result = TanaCalc.validateProduct({ ...validProduct, expiryAlertDays: 0 });
        expect(result.valid).toBe(true);
    });

    test('UT-VP-013: expiryAlertDays < 0 → invalid', () => {
        const result = TanaCalc.validateProduct({ ...validProduct, expiryAlertDays: -1 });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('期限アラート日数は0以上の数値を入力してください');
    });

    test('UT-VP-014: nameKanaにカタカナ → invalid', () => {
        const result = TanaCalc.validateProduct({ ...validProduct, nameKana: 'テストショウヒン' });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('フリガナはひらがなで入力してください');
    });

    test('UT-VP-015: nameKanaにひらがな → valid', () => {
        const result = TanaCalc.validateProduct({ ...validProduct, nameKana: 'てすとしょうひん' });
        expect(result.valid).toBe(true);
    });
});

// ============================================================
// 6. Transaction Validation (UT-VT-001~010)
// ============================================================

describe('取引バリデーション', () => {
    const validTransaction = {
        productId: 'P-0001',
        transactionType: 'receive',
        quantity: 10,
        date: '2025-01-15'
    };

    test('UT-VT-001: 有効な入庫取引 → valid', () => {
        const result = TanaCalc.validateTransaction(validTransaction);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    test('UT-VT-002: productIdなし → invalid', () => {
        const result = TanaCalc.validateTransaction({ ...validTransaction, productId: '' });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('商品IDは必須です');
    });

    test('UT-VT-003: 無効な取引種別 → invalid', () => {
        const result = TanaCalc.validateTransaction({ ...validTransaction, transactionType: 'invalid' });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('取引種別が不正です（receive, use, sell, adjust, dispose）');
    });

    test('UT-VT-004: 数量0 → invalid', () => {
        const result = TanaCalc.validateTransaction({ ...validTransaction, quantity: 0 });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('数量は0以外の数値を入力してください');
    });

    test('UT-VT-005: 空の日付 → invalid', () => {
        const result = TanaCalc.validateTransaction({ ...validTransaction, date: '' });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('日付は必須です');
    });

    test('UT-VT-006: 不正な日付形式 → invalid', () => {
        const result = TanaCalc.validateTransaction({ ...validTransaction, date: '2025/01/15' });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('日付はYYYY-MM-DD形式で入力してください');
    });

    test('UT-VT-007: ロット番号付き → valid', () => {
        const result = TanaCalc.validateTransaction({ ...validTransaction, lotNumber: 'LOT-001' });
        expect(result.valid).toBe(true);
    });

    test('UT-VT-008: 入庫に単価付き → valid', () => {
        const result = TanaCalc.validateTransaction({ ...validTransaction, unitCost: 500 });
        expect(result.valid).toBe(true);
    });

    test('UT-VT-009: 全有効取引種別 → 各valid', () => {
        const types = ['receive', 'use', 'sell', 'adjust', 'dispose'];
        types.forEach(type => {
            const result = TanaCalc.validateTransaction({ ...validTransaction, transactionType: type });
            expect(result.valid).toBe(true);
        });
    });

    test('UT-VT-010: 備考1000文字超 → invalid', () => {
        const longNotes = 'あ'.repeat(1001);
        const result = TanaCalc.validateTransaction({ ...validTransaction, notes: longNotes });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('備考は1000文字以内で入力してください');
    });
});

// ============================================================
// 7. Import Validation (UT-IMP-001~008)
// ============================================================

describe('インポートバリデーション', () => {
    const validImportData = {
        appName: 'tana',
        products: [{ id: 'P-0001', name: '商品A' }],
        stock_transactions: [],
        inventory_counts: [],
        settings: {}
    };

    test('UT-IMP-001: 有効なインポートデータ → valid', () => {
        const result = TanaCalc.validateImportData(validImportData);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    test('UT-IMP-002: 不正なappName → invalid', () => {
        const result = TanaCalc.validateImportData({ ...validImportData, appName: 'other' });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('appNameが"tana"ではありません');
    });

    test('UT-IMP-003: null → invalid', () => {
        const result = TanaCalc.validateImportData(null);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('インポートデータが空です');
    });

    test('UT-IMP-004: productsが配列でない → invalid', () => {
        const result = TanaCalc.validateImportData({ ...validImportData, products: 'not array' });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('productsが配列ではありません');
    });

    test('UT-IMP-005: stock_transactionsが配列でない → invalid', () => {
        const result = TanaCalc.validateImportData({ ...validImportData, stock_transactions: 'not array' });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('stock_transactionsが配列ではありません');
    });

    test('UT-IMP-006: inventory_countsが配列でない → invalid', () => {
        const result = TanaCalc.validateImportData({ ...validImportData, inventory_counts: 'not array' });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('inventory_countsが配列ではありません');
    });

    test('UT-IMP-007: productにidがない → invalid', () => {
        const data = { ...validImportData, products: [{ name: '商品A' }] };
        const result = TanaCalc.validateImportData(data);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('products[0]にidがありません');
    });

    test('UT-IMP-008: settingsがオブジェクトでない → invalid', () => {
        const result = TanaCalc.validateImportData({ ...validImportData, settings: 'not object' });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('settingsはオブジェクトまたは配列である必要があります');
    });

    test('UT-IMP-009: settingsが配列形式 → valid（後方互換）', () => {
        const data = { ...validImportData, settings: [{ id: 'clinic_info', value: {} }] };
        const result = TanaCalc.validateImportData(data);
        expect(result.valid).toBe(true);
    });
});

// ============================================================
// 8. Product Code Generation (UT-PC-001~006)
// ============================================================

describe('商品コード生成', () => {
    test('UT-PC-001: 既存なし → "P-0001"', () => {
        expect(TanaCalc.generateProductCode([])).toBe('P-0001');
    });

    test('UT-PC-002: ["P-0001","P-0002"] → "P-0003"', () => {
        expect(TanaCalc.generateProductCode(['P-0001', 'P-0002'])).toBe('P-0003');
    });

    test('UT-PC-003: ["P-0001","P-0005"] → "P-0006" (欠番あり)', () => {
        expect(TanaCalc.generateProductCode(['P-0001', 'P-0005'])).toBe('P-0006');
    });

    test('UT-PC-004: null/undefined → "P-0001"', () => {
        expect(TanaCalc.generateProductCode(null)).toBe('P-0001');
        expect(TanaCalc.generateProductCode(undefined)).toBe('P-0001');
    });

    test('UT-PC-005: 不正なコード混在 → 無視して生成', () => {
        expect(TanaCalc.generateProductCode(['invalid', 'P-0003', 'abc'])).toBe('P-0004');
    });

    test('UT-PC-006: ["P-9999"] → throws', () => {
        expect(() => TanaCalc.generateProductCode(['P-9999'])).toThrow('商品コードが上限（P-9999）に達しました');
    });
});

// ============================================================
// 9. Dashboard (UT-DSH-001~004)
// ============================================================

describe('ダッシュボード', () => {
    test('UT-DSH-001: getLowStockAlerts 在庫不足を検出 (stock=2, minStock=5)', () => {
        const products = [
            { id: 'P1', name: '商品A', minStock: 5 },
            { id: 'P2', name: '商品B', minStock: 3 }
        ];
        const stockMap = { P1: 2, P2: 10 };
        const result = TanaCalc.getLowStockAlerts(products, stockMap);
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('P1');
    });

    test('UT-DSH-002: getLowStockAlerts 全て十分 → 空配列', () => {
        const products = [
            { id: 'P1', name: '商品A', minStock: 5 },
            { id: 'P2', name: '商品B', minStock: 3 }
        ];
        const stockMap = { P1: 10, P2: 10 };
        const result = TanaCalc.getLowStockAlerts(products, stockMap);
        expect(result).toHaveLength(0);
    });

    test('UT-DSH-003: getExpiryAlerts 期限切れ・警告を検出', () => {
        const products = [
            { id: 'P1', expiryAlertDays: 30 },
            { id: 'P2', expiryAlertDays: 30 }
        ];
        // Use dates far in the past (expired) and far in the future (ok)
        const stockByLotMap = {
            P1: [{ lotNumber: 'L1', expiryDate: '2020-01-01', quantity: 5 }],
            P2: [{ lotNumber: 'L2', expiryDate: '2099-12-31', quantity: 3 }]
        };
        const result = TanaCalc.getExpiryAlerts(stockByLotMap, products);
        expect(result).toHaveLength(1);
        expect(result[0].status).toBe('expired');
        expect(result[0].productId).toBe('P1');
    });

    test('UT-DSH-004: getExpiryAlerts 期限問題なし → 空配列', () => {
        const products = [
            { id: 'P1', expiryAlertDays: 30 }
        ];
        const stockByLotMap = {
            P1: [{ lotNumber: 'L1', expiryDate: '2099-12-31', quantity: 5 }]
        };
        const result = TanaCalc.getExpiryAlerts(stockByLotMap, products);
        expect(result).toHaveLength(0);
    });
});

// ============================================================
// 10. Utilities (UT-UTL-001~012)
// ============================================================

describe('ユーティリティ', () => {
    test('UT-UTL-001: escapeHtml 通常文字列', () => {
        expect(TanaCalc.escapeHtml('hello')).toBe('hello');
    });

    test('UT-UTL-002: escapeHtml "&" → "&amp;"', () => {
        expect(TanaCalc.escapeHtml('a&b')).toBe('a&amp;b');
    });

    test('UT-UTL-003: escapeHtml "<" → "&lt;"', () => {
        expect(TanaCalc.escapeHtml('<script>')).toBe('&lt;script&gt;');
    });

    test('UT-UTL-004: escapeHtml \'"\' → "&quot;"', () => {
        expect(TanaCalc.escapeHtml('say "hello"')).toBe('say &quot;hello&quot;');
    });

    test('UT-UTL-005: escapeHtml null → 空文字', () => {
        expect(TanaCalc.escapeHtml(null)).toBe('');
    });

    test('UT-UTL-006: escapeHtml undefined → 空文字', () => {
        expect(TanaCalc.escapeHtml(undefined)).toBe('');
    });

    test('UT-UTL-007: escapeHtml 数値 → 文字列化', () => {
        expect(TanaCalc.escapeHtml(123)).toBe('123');
    });

    test('UT-UTL-008: formatCurrency カンマ区切り (1234567 → "¥1,234,567")', () => {
        expect(TanaCalc.formatCurrency(1234567)).toBe('\u00a51,234,567');
    });

    test('UT-UTL-009: formatCurrency(0) → "¥0"', () => {
        expect(TanaCalc.formatCurrency(0)).toBe('\u00a50');
    });

    test('UT-UTL-010: formatDate("2025-01-15") → "2025/01/15"', () => {
        expect(TanaCalc.formatDate('2025-01-15')).toBe('2025/01/15');
    });

    test('UT-UTL-011: formatDate("invalid") → "---"', () => {
        expect(TanaCalc.formatDate('invalid')).toBe('---');
    });

    test('UT-UTL-012: searchProducts 名前/カナ/JANでマッチ', () => {
        const products = [
            { name: 'コピー用紙', nameKana: 'こぴーようし', janCode: '4901234567894' },
            { name: 'ボールペン', nameKana: 'ぼーるぺん', janCode: '4902345678901' },
            { name: 'ファイル', nameKana: 'ふぁいる', janCode: '4903456789012' }
        ];
        // name match
        expect(TanaCalc.searchProducts(products, 'コピー')).toHaveLength(1);
        expect(TanaCalc.searchProducts(products, 'コピー')[0].name).toBe('コピー用紙');
        // kana match
        expect(TanaCalc.searchProducts(products, 'ぼーる')).toHaveLength(1);
        expect(TanaCalc.searchProducts(products, 'ぼーる')[0].name).toBe('ボールペン');
        // JAN match
        expect(TanaCalc.searchProducts(products, '4903456')).toHaveLength(1);
        expect(TanaCalc.searchProducts(products, '4903456')[0].name).toBe('ファイル');
    });
});

// ============================================================
// 11. Reports (UT-RPT-001~006)
// ============================================================

describe('レポート', () => {
    test('UT-RPT-001: buildStockSummaryReport 商品あり', () => {
        const products = [
            { id: 'P1', name: '商品A', productCode: 'P-0001', category: 'consumable', unit: '個', minStock: 5 },
            { id: 'P2', name: '商品B', productCode: 'P-0002', category: 'retail', unit: '本', minStock: 3 }
        ];
        const transactions = [
            { productId: 'P1', quantity: 10 },
            { productId: 'P2', quantity: 5 }
        ];
        const result = TanaCalc.buildStockSummaryReport(products, transactions);
        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({
            productId: 'P1',
            productName: '商品A',
            productCode: 'P-0001',
            category: 'consumable',
            currentStock: 10,
            minStock: 5,
            unit: '個',
            status: 'normal'
        });
        expect(result[1]).toEqual({
            productId: 'P2',
            productName: '商品B',
            productCode: 'P-0002',
            category: 'retail',
            currentStock: 5,
            minStock: 3,
            unit: '本',
            status: 'normal'
        });
    });

    test('UT-RPT-002: buildStockSummaryReport カテゴリフィルタ', () => {
        const products = [
            { id: 'P1', name: '商品A', category: 'consumable' },
            { id: 'P2', name: '商品B', category: 'retail' },
            { id: 'P3', name: '商品C', category: 'consumable' }
        ];
        const filtered = TanaCalc.filterByCategory(products, 'consumable');
        const result = TanaCalc.buildStockSummaryReport(filtered, []);
        expect(result).toHaveLength(2);
        expect(result.every(r => r.category === 'consumable')).toBe(true);
    });

    test('UT-RPT-003: buildTransactionReport 日付範囲フィルタ', () => {
        const transactions = [
            { productId: 'P1', transactionType: 'receive', date: '2025-01-01', quantity: 10 },
            { productId: 'P1', transactionType: 'use', date: '2025-01-15', quantity: 3 },
            { productId: 'P1', transactionType: 'sell', date: '2025-02-01', quantity: 2 },
            { productId: 'P1', transactionType: 'receive', date: '2025-03-01', quantity: 5 }
        ];
        const products = [{ id: 'P1', name: '商品A', productCode: 'P-0001' }];
        const result = TanaCalc.buildTransactionReport(transactions, products, {
            startDate: '2025-01-10',
            endDate: '2025-02-01'
        });
        expect(result).toHaveLength(2);
        expect(result[0].date).toBe('2025-02-01');
        expect(result[1].date).toBe('2025-01-15');
        expect(result[0].productName).toBe('商品A');
    });

    test('UT-RPT-004: buildExpiryReport ステータス色分け', () => {
        const products = [
            { id: 'P1', name: '商品A', expiryAlertDays: 30, trackExpiry: true }
        ];
        const transactions = [
            { productId: 'P1', lotNumber: 'L1', expiryDate: '2020-01-01', quantity: 5, transactionType: 'receive' },
            { productId: 'P1', lotNumber: 'L2', expiryDate: '2099-12-31', quantity: 3, transactionType: 'receive' }
        ];
        const result = TanaCalc.buildExpiryReport(transactions, products);
        expect(result).toHaveLength(2);
        expect(result[0].status).toBe('expired');
        expect(result[0].productId).toBe('P1');
        expect(result[0].productName).toBe('商品A');
        expect(result[0].lotNumber).toBe('L1');
        expect(result[1].status).toBe('normal');
        expect(result[1].lotNumber).toBe('L2');
    });

    test('UT-RPT-005: buildVarianceReport', () => {
        const inventoryCount = {
            countDate: '2025-01-15',
            status: 'completed',
            items: [
                { productName: '商品A', systemQty: 10, actualQty: 10 },
                { productName: '商品B', systemQty: 5, actualQty: 8 }
            ]
        };
        const result = TanaCalc.buildVarianceReport(inventoryCount);
        expect(result.countDate).toBe('2025-01-15');
        expect(result.status).toBe('completed');
        expect(result.items).toHaveLength(2);
        expect(result.items[0].variance).toBe(0);
        expect(result.items[1].variance).toBe(3);
        expect(result.summary.totalItems).toBe(2);
        expect(result.summary.countedItems).toBe(2);
        expect(result.summary.discrepancies).toBe(1);
        expect(result.summary.totalVariancePositive).toBe(3);
        expect(result.summary.totalVarianceNegative).toBe(0);
    });

    test('UT-RPT-006: buildVarianceReport 空カウント → 空', () => {
        const result = TanaCalc.buildVarianceReport(null);
        expect(result.countDate).toBeNull();
        expect(result.status).toBeNull();
        expect(result.items).toHaveLength(0);
        expect(result.summary).toEqual({});
    });

    test('UT-RPT-007: buildStockSummaryReport ステータス判定（欠品・不足・正常）', () => {
        const products = [
            { id: 'P1', name: '欠品商品', minStock: 5 },
            { id: 'P2', name: '不足商品', minStock: 10 },
            { id: 'P3', name: '正常商品', minStock: 3 }
        ];
        const transactions = [
            { productId: 'P1', quantity: -5 },
            { productId: 'P1', quantity: 5 },
            { productId: 'P1', quantity: -5 },  // P1: net -5 → <=0 → zero
            { productId: 'P2', quantity: 5 },    // P2: 5 <= 10 → low
            { productId: 'P3', quantity: 20 }    // P3: 20 > 3 → normal
        ];
        const result = TanaCalc.buildStockSummaryReport(products, transactions);
        expect(result[0].status).toBe('zero');
        expect(result[1].status).toBe('low');
        expect(result[2].status).toBe('normal');
    });

    test('UT-RPT-008: buildStockSummaryReport 空配列', () => {
        expect(TanaCalc.buildStockSummaryReport([], [])).toHaveLength(0);
    });

    test('UT-RPT-009: buildTransactionReport 商品IDフィルタ', () => {
        const transactions = [
            { productId: 'P1', transactionType: 'receive', date: '2025-01-01', quantity: 10 },
            { productId: 'P2', transactionType: 'receive', date: '2025-01-01', quantity: 5 }
        ];
        const products = [
            { id: 'P1', name: '商品A' },
            { id: 'P2', name: '商品B' }
        ];
        const result = TanaCalc.buildTransactionReport(transactions, products, { productId: 'P1' });
        expect(result).toHaveLength(1);
        expect(result[0].productName).toBe('商品A');
    });

    test('UT-RPT-010: buildTransactionReport 取引種別フィルタ', () => {
        const transactions = [
            { productId: 'P1', transactionType: 'receive', date: '2025-01-01', quantity: 10 },
            { productId: 'P1', transactionType: 'use', date: '2025-01-02', quantity: -3 }
        ];
        const result = TanaCalc.buildTransactionReport(transactions, [], { transactionType: 'use' });
        expect(result).toHaveLength(1);
        expect(result[0].transactionType).toBe('use');
    });

    test('UT-RPT-011: buildTransactionReport dateFrom/dateTo フィルタ', () => {
        const transactions = [
            { productId: 'P1', transactionType: 'receive', date: '2025-01-01', quantity: 10 },
            { productId: 'P1', transactionType: 'use', date: '2025-01-15', quantity: -3 },
            { productId: 'P1', transactionType: 'sell', date: '2025-02-01', quantity: -2 }
        ];
        const result = TanaCalc.buildTransactionReport(transactions, [], { dateFrom: '2025-01-10', dateTo: '2025-01-20' });
        expect(result).toHaveLength(1);
        expect(result[0].date).toBe('2025-01-15');
    });

    test('UT-RPT-012: buildExpiryReport ロット別在庫集計', () => {
        const products = [{ id: 'P1', name: '商品A', trackExpiry: true, expiryAlertDays: 30 }];
        const transactions = [
            { productId: 'P1', lotNumber: 'L1', expiryDate: '2099-12-31', quantity: 10, transactionType: 'receive' },
            { productId: 'P1', lotNumber: 'L1', expiryDate: '2099-12-31', quantity: -3, transactionType: 'use' }
        ];
        const result = TanaCalc.buildExpiryReport(transactions, products);
        expect(result).toHaveLength(1);
        expect(result[0].quantity).toBe(7);
    });

    test('UT-RPT-013: buildExpiryReport 在庫0ロット除外', () => {
        const products = [{ id: 'P1', name: '商品A', trackExpiry: true, expiryAlertDays: 30 }];
        const transactions = [
            { productId: 'P1', lotNumber: 'L1', expiryDate: '2099-12-31', quantity: 5, transactionType: 'receive' },
            { productId: 'P1', lotNumber: 'L1', expiryDate: '2099-12-31', quantity: -5, transactionType: 'use' }
        ];
        const result = TanaCalc.buildExpiryReport(transactions, products);
        expect(result).toHaveLength(0);
    });

    test('UT-RPT-014: buildExpiryReport trackExpiry=false 除外', () => {
        const products = [{ id: 'P1', name: '商品A', trackExpiry: false }];
        const transactions = [
            { productId: 'P1', lotNumber: 'L1', expiryDate: '2099-12-31', quantity: 5, transactionType: 'receive' }
        ];
        const result = TanaCalc.buildExpiryReport(transactions, products);
        expect(result).toHaveLength(0);
    });
});

// ============================================================
// 11b. getCategoryLabel (UT-CAT-001~003)
// ============================================================

describe('カテゴリラベル', () => {
    test('UT-CAT-001: "consumable" → "消耗品"', () => {
        expect(TanaCalc.getCategoryLabel('consumable')).toBe('消耗品');
    });

    test('UT-CAT-002: "retail" → "物販"', () => {
        expect(TanaCalc.getCategoryLabel('retail')).toBe('物販');
    });

    test('UT-CAT-003: 不明値 → そのまま返す', () => {
        expect(TanaCalc.getCategoryLabel('unknown')).toBe('unknown');
    });

    test('UT-CAT-004: null/undefined → 空文字', () => {
        expect(TanaCalc.getCategoryLabel(null)).toBe('');
        expect(TanaCalc.getCategoryLabel(undefined)).toBe('');
    });
});

// =============================================================================
// 12. Sample Data Integrity (UT-SD-001~006)
// =============================================================================
describe('12. サンプルデータ整合性', () => {
    const sampleData = require('./sample_data.json');

    test('UT-SD-001: productCode の一意性', () => {
        const codes = sampleData.products.map(p => p.productCode);
        const unique = new Set(codes);
        expect(unique.size).toBe(codes.length);
    });

    test('UT-SD-002: janCode のフォーマット検証', () => {
        sampleData.products.forEach(p => {
            if (p.janCode) {
                const result = TanaCalc.validateJanCode(p.janCode);
                expect(result.valid).toBe(true);
            }
        });
    });

    test('UT-SD-003: stock_transactions の productId が products に存在', () => {
        const productIds = new Set(sampleData.products.map(p => p.id));
        sampleData.stock_transactions.forEach(tx => {
            expect(productIds.has(tx.productId)).toBe(true);
        });
    });

    test('UT-SD-004: inventory_counts の items.productId が products に存在', () => {
        const productIds = new Set(sampleData.products.map(p => p.id));
        sampleData.inventory_counts.forEach(count => {
            count.items.forEach(item => {
                expect(productIds.has(item.productId)).toBe(true);
            });
        });
    });

    test('UT-SD-005: category が "consumable" | "retail" のみ', () => {
        sampleData.products.forEach(p => {
            expect(['consumable', 'retail']).toContain(p.category);
        });
    });

    test('UT-SD-006: transactionType が正しい値のみ', () => {
        const validTypes = ['receive', 'use', 'sell', 'adjust', 'dispose'];
        sampleData.stock_transactions.forEach(tx => {
            expect(validTypes).toContain(tx.transactionType);
        });
    });
});
