/**
 * tana.calc.js - Pure calculation/utility functions for Tana inventory management app
 * No DOM operations, No IndexedDB operations
 */

// ============================================================
// 1. Stock Calculation
// ============================================================

/**
 * Sum of quantity from transactions.
 * receive: +, use: -, sell: -, adjust: signed, dispose: -
 * @param {Array} transactions
 * @returns {number}
 */
function calculateCurrentStock(transactions) {
    if (!Array.isArray(transactions) || transactions.length === 0) {
        return 0;
    }
    return transactions.reduce(function (sum, tx) {
        var qty = Number(tx.quantity) || 0;
        switch (tx.transactionType) {
            case 'receive':
                return sum + qty;
            case 'use':
            case 'sell':
            case 'dispose':
                return sum - qty;
            case 'adjust':
                return sum + qty;
            default:
                return sum;
        }
    }, 0);
}

/**
 * Group by lotNumber, return [{lotNumber, expiryDate, quantity}]
 * @param {Array} transactions
 * @returns {Array}
 */
function calculateStockByLot(transactions) {
    if (!Array.isArray(transactions) || transactions.length === 0) {
        return [];
    }
    var lots = {};
    transactions.forEach(function (tx) {
        var lot = tx.lotNumber || '';
        if (!lots[lot]) {
            lots[lot] = { lotNumber: lot, expiryDate: tx.expiryDate || null, quantity: 0 };
        }
        var qty = Number(tx.quantity) || 0;
        switch (tx.transactionType) {
            case 'receive':
                lots[lot].quantity += qty;
                if (tx.expiryDate) {
                    lots[lot].expiryDate = tx.expiryDate;
                }
                break;
            case 'use':
            case 'sell':
            case 'dispose':
                lots[lot].quantity -= qty;
                break;
            case 'adjust':
                lots[lot].quantity += qty;
                break;
            default:
                break;
        }
    });
    return Object.keys(lots).map(function (key) {
        return lots[key];
    }).filter(function (lot) {
        return lot.quantity !== 0;
    });
}

/**
 * Calculate total value based on remaining stock and unit costs.
 * @param {Array} transactions
 * @returns {number}
 */
function calculateStockValue(transactions) {
    if (!Array.isArray(transactions) || transactions.length === 0) {
        return 0;
    }
    var totalQty = calculateCurrentStock(transactions);
    if (totalQty <= 0) {
        return 0;
    }
    // Weighted average cost from receive transactions
    var totalCost = 0;
    var totalReceived = 0;
    transactions.forEach(function (tx) {
        if (tx.transactionType === 'receive') {
            var qty = Number(tx.quantity) || 0;
            var unitCost = Number(tx.unitCost) || 0;
            totalCost += qty * unitCost;
            totalReceived += qty;
        }
    });
    if (totalReceived === 0) {
        return 0;
    }
    var avgCost = totalCost / totalReceived;
    return Math.round(totalQty * avgCost);
}

// ============================================================
// 2. Expiry Management
// ============================================================

/**
 * Returns "ok" | "warning" | "expired"
 * @param {string|null} expiryDate - YYYY-MM-DD format
 * @param {number} alertDays
 * @param {Date|string} refDate - reference date
 * @returns {string}
 */
function getExpiryStatus(expiryDate, alertDays, refDate) {
    if (!expiryDate || expiryDate === '') {
        return 'ok';
    }
    var expiry = new Date(expiryDate);
    if (isNaN(expiry.getTime())) {
        return 'ok';
    }
    var ref = refDate instanceof Date ? new Date(refDate.getTime()) : new Date(refDate);
    if (isNaN(ref.getTime())) {
        return 'ok';
    }
    // Reset times to midnight for date-only comparison
    expiry.setHours(0, 0, 0, 0);
    ref.setHours(0, 0, 0, 0);

    if (expiry < ref) {
        return 'expired';
    }
    var warningDate = new Date(ref.getTime());
    warningDate.setDate(warningDate.getDate() + (Number(alertDays) || 0));
    if (expiry <= warningDate) {
        return 'warning';
    }
    return 'ok';
}

/**
 * Filter stockByLot for items with warning or expired status.
 * @param {Array} stockByLot - [{lotNumber, expiryDate, quantity, productId}]
 * @param {number} alertDays
 * @param {Date|string} refDate
 * @returns {Array} [{lotNumber, expiryDate, quantity, status, productId}]
 */
function getExpiringItems(stockByLot, alertDays, refDate) {
    if (!Array.isArray(stockByLot) || stockByLot.length === 0) {
        return [];
    }
    var result = [];
    stockByLot.forEach(function (item) {
        var status = getExpiryStatus(item.expiryDate, alertDays, refDate);
        if (status === 'warning' || status === 'expired') {
            result.push({
                lotNumber: item.lotNumber,
                expiryDate: item.expiryDate,
                quantity: item.quantity,
                status: status,
                productId: item.productId
            });
        }
    });
    return result;
}

/**
 * Sort array by expiryDate ascending (null/empty at end).
 * @param {Array} items
 * @returns {Array}
 */
function sortByExpiry(items) {
    if (!Array.isArray(items)) {
        return [];
    }
    return items.slice().sort(function (a, b) {
        var aDate = a.expiryDate || null;
        var bDate = b.expiryDate || null;
        if (aDate === null && bDate === null) return 0;
        if (aDate === null) return 1;
        if (bDate === null) return -1;
        if (aDate < bDate) return -1;
        if (aDate > bDate) return 1;
        return 0;
    });
}

// ============================================================
// 3. Inventory Count
// ============================================================

/**
 * Returns actualQty - systemQty
 * @param {number} systemQty
 * @param {number} actualQty
 * @returns {number}
 */
function calculateVariance(systemQty, actualQty) {
    return (Number(actualQty) || 0) - (Number(systemQty) || 0);
}

/**
 * Generate variance report from count items.
 * @param {Array} countItems - [{productId, productName, systemQuantity, actualQuantity}]
 * @returns {object}
 */
function generateVarianceReport(countItems) {
    if (!Array.isArray(countItems) || countItems.length === 0) {
        return {
            totalItems: 0,
            countedItems: 0,
            discrepancies: 0,
            totalVariancePositive: 0,
            totalVarianceNegative: 0,
            items: []
        };
    }
    var totalItems = countItems.length;
    var countedItems = 0;
    var discrepancies = 0;
    var totalVariancePositive = 0;
    var totalVarianceNegative = 0;
    var items = countItems.map(function (item) {
        var variance = calculateVariance(item.systemQuantity, item.actualQuantity);
        if (item.actualQuantity !== null && item.actualQuantity !== undefined) {
            countedItems++;
        }
        if (variance !== 0) {
            discrepancies++;
            if (variance > 0) {
                totalVariancePositive += variance;
            } else {
                totalVarianceNegative += variance;
            }
        }
        return {
            productId: item.productId,
            productName: item.productName,
            productCode: item.productCode,
            systemQuantity: item.systemQuantity,
            actualQuantity: item.actualQuantity,
            variance: variance
        };
    });
    return {
        totalItems: totalItems,
        countedItems: countedItems,
        discrepancies: discrepancies,
        totalVariancePositive: totalVariancePositive,
        totalVarianceNegative: totalVarianceNegative,
        items: items
    };
}

/**
 * For each item with variance != 0, create an adjust transaction.
 * @param {Array} countItems - [{productId, systemQuantity, actualQuantity}]
 * @param {string} countDate - YYYY-MM-DD
 * @returns {Array}
 */
function buildAdjustmentTransactions(countItems, countDate) {
    if (!Array.isArray(countItems) || countItems.length === 0) {
        return [];
    }
    var result = [];
    countItems.forEach(function (item) {
        var variance = calculateVariance(item.systemQuantity, item.actualQuantity);
        if (variance !== 0) {
            result.push({
                productId: item.productId,
                transactionType: 'adjust',
                quantity: variance,
                date: countDate,
                notes: '棚卸調整'
            });
        }
    });
    return result;
}

// ============================================================
// 4. Dashboard
// ============================================================

/**
 * Returns products where calculateCurrentStock < product.minStock.
 * @param {Array} products
 * @param {object} stockMap - { productId: currentStock }
 * @returns {Array}
 */
function getLowStockAlerts(products, stockMap) {
    if (!Array.isArray(products) || !stockMap) {
        return [];
    }
    return products.filter(function (product) {
        var currentStock = stockMap[product.id] !== undefined ? stockMap[product.id] : 0;
        var minStock = Number(product.minStock) || 0;
        return currentStock < minStock;
    });
}

/**
 * Returns items from stockByLotMap that are warning or expired.
 * @param {object} stockByLotMap - { productId: [{lotNumber, expiryDate, quantity}] }
 * @param {Array} products - [{id, expiryAlertDays, ...}]
 * @returns {Array}
 */
function getExpiryAlerts(stockByLotMap, products) {
    if (!stockByLotMap || !Array.isArray(products)) {
        return [];
    }
    var now = new Date();
    var result = [];
    products.forEach(function (product) {
        var lots = stockByLotMap[product.id];
        if (!Array.isArray(lots)) return;
        var alertDays = Number(product.expiryAlertDays) || 0;
        lots.forEach(function (lot) {
            var status = getExpiryStatus(lot.expiryDate, alertDays, now);
            if (status === 'warning' || status === 'expired') {
                result.push({
                    lotNumber: lot.lotNumber,
                    expiryDate: lot.expiryDate,
                    quantity: lot.quantity,
                    status: status,
                    productId: product.id
                });
            }
        });
    });
    return result;
}

// ============================================================
// 5. Validation
// ============================================================

/**
 * Validate JAN code (barcode).
 * @param {string|null} code
 * @returns {object} {valid: bool}
 */
function validateJanCode(code) {
    if (code === null || code === undefined || code === '') {
        return { valid: true };
    }
    var str = String(code);
    if (!/^\d+$/.test(str)) {
        return { valid: false };
    }
    if (str.length !== 8 && str.length !== 13) {
        return { valid: false };
    }
    if (str.length === 13) {
        // JAN-13: positions 1-12, odd positions weight 1, even positions weight 3
        var sum = 0;
        for (var i = 0; i < 12; i++) {
            var digit = parseInt(str[i], 10);
            if (i % 2 === 0) {
                sum += digit * 1;
            } else {
                sum += digit * 3;
            }
        }
        var checkDigit = (10 - (sum % 10)) % 10;
        return { valid: checkDigit === parseInt(str[12], 10) };
    }
    if (str.length === 8) {
        // JAN-8: positions 1,3,5,7 weight 3, positions 2,4,6 weight 1
        var sum = 0;
        for (var i = 0; i < 7; i++) {
            var digit = parseInt(str[i], 10);
            if (i % 2 === 0) {
                sum += digit * 3;
            } else {
                sum += digit * 1;
            }
        }
        var checkDigit = (10 - (sum % 10)) % 10;
        return { valid: checkDigit === parseInt(str[7], 10) };
    }
    return { valid: false };
}

/**
 * Validate product data.
 * @param {object} product
 * @returns {object} {valid: bool, errors: string[]}
 */
function validateProduct(product) {
    var errors = [];
    if (!product) {
        return { valid: false, errors: ['商品データが空です'] };
    }
    // name: required, 1-100 chars
    if (!product.name || typeof product.name !== 'string' || product.name.trim().length === 0) {
        errors.push('商品名は必須です');
    } else if (product.name.length > 100) {
        errors.push('商品名は100文字以内で入力してください');
    }
    // category: required, "consumable" or "retail"
    if (product.category !== 'consumable' && product.category !== 'retail') {
        errors.push('カテゴリは「consumable」または「retail」を指定してください');
    }
    // janCode: optional, validate if present
    if (product.janCode !== null && product.janCode !== undefined && product.janCode !== '') {
        var janResult = validateJanCode(product.janCode);
        if (!janResult.valid) {
            errors.push('JANコードが不正です');
        }
    }
    // nameKana: optional, hiragana only if present
    if (product.nameKana !== null && product.nameKana !== undefined && product.nameKana !== '') {
        if (!/^[\u3040-\u309F\u30FC\s]+$/.test(product.nameKana)) {
            errors.push('フリガナはひらがなで入力してください');
        }
    }
    // Numeric validations
    if (product.defaultPrice !== null && product.defaultPrice !== undefined && product.defaultPrice !== '') {
        if (Number(product.defaultPrice) < 0 || isNaN(Number(product.defaultPrice))) {
            errors.push('販売価格は0以上の数値を入力してください');
        }
    }
    if (product.costPrice !== null && product.costPrice !== undefined && product.costPrice !== '') {
        if (Number(product.costPrice) < 0 || isNaN(Number(product.costPrice))) {
            errors.push('原価は0以上の数値を入力してください');
        }
    }
    if (product.minStock !== null && product.minStock !== undefined && product.minStock !== '') {
        if (Number(product.minStock) < 0 || isNaN(Number(product.minStock))) {
            errors.push('最小在庫数は0以上の数値を入力してください');
        }
    }
    if (product.expiryAlertDays !== null && product.expiryAlertDays !== undefined && product.expiryAlertDays !== '') {
        if (Number(product.expiryAlertDays) < 0 || isNaN(Number(product.expiryAlertDays))) {
            errors.push('期限アラート日数は0以上の数値を入力してください');
        }
    }
    return { valid: errors.length === 0, errors: errors };
}

/**
 * Validate transaction data.
 * @param {object} transaction
 * @returns {object} {valid: bool, errors: string[]}
 */
function validateTransaction(transaction) {
    var errors = [];
    if (!transaction) {
        return { valid: false, errors: ['取引データが空です'] };
    }
    // productId: required
    if (!transaction.productId) {
        errors.push('商品IDは必須です');
    }
    // transactionType: required, must be one of the valid types
    var validTypes = ['receive', 'use', 'sell', 'adjust', 'dispose'];
    if (!transaction.transactionType || validTypes.indexOf(transaction.transactionType) === -1) {
        errors.push('取引種別が不正です（receive, use, sell, adjust, dispose）');
    }
    // quantity: required, != 0
    if (transaction.quantity === null || transaction.quantity === undefined) {
        errors.push('数量は必須です');
    } else if (Number(transaction.quantity) === 0 || isNaN(Number(transaction.quantity))) {
        errors.push('数量は0以外の数値を入力してください');
    }
    // date: required, YYYY-MM-DD
    if (!transaction.date) {
        errors.push('日付は必須です');
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(transaction.date)) {
        errors.push('日付はYYYY-MM-DD形式で入力してください');
    }
    // notes: optional, max 1000 chars
    if (transaction.notes !== null && transaction.notes !== undefined && transaction.notes !== '') {
        if (String(transaction.notes).length > 1000) {
            errors.push('備考は1000文字以内で入力してください');
        }
    }
    return { valid: errors.length === 0, errors: errors };
}

/**
 * Validate import data structure.
 * @param {object} data
 * @returns {object} {valid: bool, errors: string[]}
 */
function validateImportData(data) {
    var errors = [];
    if (!data) {
        return { valid: false, errors: ['インポートデータが空です'] };
    }
    if (data.appName !== 'tana') {
        errors.push('appNameが"tana"ではありません');
    }
    if (!Array.isArray(data.products)) {
        errors.push('productsが配列ではありません');
    } else {
        data.products.forEach(function (product, index) {
            if (!product.id) {
                errors.push('products[' + index + ']にidがありません');
            }
        });
    }
    if (!Array.isArray(data.stock_transactions)) {
        errors.push('stock_transactionsが配列ではありません');
    }
    if (!Array.isArray(data.inventory_counts)) {
        errors.push('inventory_countsが配列ではありません');
    }
    if (data.settings !== null && data.settings !== undefined) {
        if (typeof data.settings !== 'object') {
            errors.push('settingsはオブジェクトまたは配列である必要があります');
        }
    }
    return { valid: errors.length === 0, errors: errors };
}

// ============================================================
// 6. Code Generation
// ============================================================

/**
 * Generate next product code "P-NNNN" from existing codes array.
 * @param {Array} existingCodes - e.g. ["P-0001", "P-0003"]
 * @returns {string}
 */
function generateProductCode(existingCodes) {
    if (!Array.isArray(existingCodes) || existingCodes.length === 0) {
        return 'P-0001';
    }
    var maxNum = 0;
    existingCodes.forEach(function (code) {
        var match = String(code).match(/^P-(\d{4})$/);
        if (match) {
            var num = parseInt(match[1], 10);
            if (num > maxNum) {
                maxNum = num;
            }
        }
    });
    var next = maxNum + 1;
    if (next > 9999) {
        throw new Error('商品コードが上限（P-9999）に達しました');
    }
    var padded = String(next);
    while (padded.length < 4) {
        padded = '0' + padded;
    }
    return 'P-' + padded;
}

// ============================================================
// 7. Formatting
// ============================================================

/**
 * Format date string to "YYYY/MM/DD".
 * @param {string} dateStr
 * @returns {string}
 */
function formatDate(dateStr) {
    if (!dateStr) {
        return '---';
    }
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) {
        return '---';
    }
    var year = d.getFullYear();
    var month = String(d.getMonth() + 1);
    var day = String(d.getDate());
    if (month.length < 2) month = '0' + month;
    if (day.length < 2) day = '0' + day;
    return year + '/' + month + '/' + day;
}

/**
 * Format number with comma separators and yen prefix.
 * @param {number} amount
 * @returns {string}
 */
function formatCurrency(amount) {
    if (amount === null || amount === undefined || isNaN(Number(amount))) {
        return '\u00a50';
    }
    var num = Number(amount);
    var parts = Math.abs(num).toString().split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    var formatted = parts.join('.');
    if (num < 0) {
        formatted = '-' + formatted;
    }
    return '\u00a5' + formatted;
}

/**
 * Escape HTML special chars: & < > " '
 * @param {*} str
 * @returns {string}
 */
function escapeHtml(str) {
    if (str === null || str === undefined) {
        return '';
    }
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ============================================================
// 8. Search/Filter/Sort
// ============================================================

/**
 * Search products by name, nameKana, productCode, or janCode (case-insensitive).
 * @param {Array} products
 * @param {string} query
 * @returns {Array}
 */
function searchProducts(products, query) {
    if (!Array.isArray(products) || !query || query.trim() === '') {
        return Array.isArray(products) ? products : [];
    }
    var q = query.toLowerCase();
    return products.filter(function (p) {
        var name = (p.name || '').toLowerCase();
        var kana = (p.nameKana || '').toLowerCase();
        var code = (p.productCode || '').toLowerCase();
        var jan = (p.janCode || '').toLowerCase();
        return name.indexOf(q) !== -1 || kana.indexOf(q) !== -1 || code.indexOf(q) !== -1 || jan.indexOf(q) !== -1;
    });
}

/**
 * Sort products by field.
 * @param {Array} products
 * @param {string} field - name, stock, category, price
 * @param {string} direction - "asc" or "desc"
 * @returns {Array}
 */
function sortProducts(products, field, direction) {
    if (!Array.isArray(products)) return [];
    var dir = direction === 'desc' ? -1 : 1;
    return products.slice().sort(function (a, b) {
        var aVal = a[field];
        var bVal = b[field];
        if (field === 'price') {
            aVal = a.defaultPrice;
            bVal = b.defaultPrice;
        }
        if (aVal === null || aVal === undefined) aVal = '';
        if (bVal === null || bVal === undefined) bVal = '';
        if (typeof aVal === 'string') {
            return dir * aVal.localeCompare(bVal);
        }
        if (aVal < bVal) return -1 * dir;
        if (aVal > bVal) return 1 * dir;
        return 0;
    });
}

/**
 * Filter products by category.
 * @param {Array} products
 * @param {string} category
 * @returns {Array}
 */
function filterByCategory(products, category) {
    if (!Array.isArray(products)) return [];
    if (!category || category === '' || category === 'all') {
        return products;
    }
    return products.filter(function (p) {
        return p.category === category;
    });
}

// ============================================================
// 9. Report Building
// ============================================================

/**
 * Build stock summary report.
 * @param {Array} products
 * @param {Array} transactions
 * @returns {Array}
 */
function buildStockSummaryReport(products, transactions) {
    if (!Array.isArray(products)) return [];
    var stockMap = {};
    if (Array.isArray(transactions)) {
        transactions.forEach(function(tx) {
            if (!stockMap[tx.productId]) stockMap[tx.productId] = 0;
            stockMap[tx.productId] += tx.quantity;
        });
    }
    return products.map(function (p) {
        var currentStock = stockMap[p.id] !== undefined ? stockMap[p.id] : 0;
        var minStock = Number(p.minStock) || 0;
        return {
            productId: p.id,
            productName: p.name,
            productCode: p.productCode || '',
            category: p.category,
            currentStock: currentStock,
            minStock: minStock,
            unit: p.unit || '',
            status: currentStock <= 0 ? 'zero'
                : currentStock <= minStock ? 'low' : 'normal'
        };
    });
}

/**
 * Filter transactions and enrich with product info.
 * @param {Array} transactions
 * @param {Array} products
 * @param {object} filters - {startDate, endDate, dateFrom, dateTo, productId, transactionType}
 * @returns {Array}
 */
function buildTransactionReport(transactions, products, filters) {
    if (!Array.isArray(transactions)) return [];
    var productMap = {};
    if (Array.isArray(products)) {
        products.forEach(function(p) { productMap[p.id] = p; });
    }
    filters = filters || {};
    var startDate = filters.startDate || filters.dateFrom || '';
    var endDate = filters.endDate || filters.dateTo || '';
    var filtered = transactions.filter(function (tx) {
        if (filters.productId && tx.productId !== filters.productId) return false;
        if (filters.transactionType && tx.transactionType !== filters.transactionType) return false;
        if (startDate && tx.date < startDate) return false;
        if (endDate && tx.date > endDate) return false;
        return true;
    });
    filtered.sort(function(a, b) {
        if (a.date !== b.date) return b.date < a.date ? -1 : b.date > a.date ? 1 : 0;
        return ((b.createdAt || '') < (a.createdAt || '')) ? -1
            : ((b.createdAt || '') > (a.createdAt || '')) ? 1 : 0;
    });
    return filtered.map(function(tx) {
        var p = productMap[tx.productId];
        return {
            id: tx.id,
            productId: tx.productId,
            productName: p ? p.name : '(不明)',
            productCode: p ? (p.productCode || '') : '',
            transactionType: tx.transactionType,
            quantity: tx.quantity,
            date: tx.date,
            lotNumber: tx.lotNumber || '',
            expiryDate: tx.expiryDate || '',
            notes: tx.notes || ''
        };
    });
}

/**
 * Build expiry report from transactions and products.
 * @param {Array} transactions
 * @param {Array} products
 * @returns {Array}
 */
function buildExpiryReport(transactions, products) {
    if (!Array.isArray(transactions) || !Array.isArray(products)) return [];
    var expiryProducts = products.filter(function(p) { return p.trackExpiry; });
    var productMap = {};
    expiryProducts.forEach(function(p) { productMap[p.id] = p; });
    // Build lot-level stock from transactions
    var lotMap = {};
    transactions.forEach(function(tx) {
        if (!productMap[tx.productId] || !tx.lotNumber || !tx.expiryDate) return;
        var key = tx.productId + '|' + tx.lotNumber;
        if (!lotMap[key]) lotMap[key] = { productId: tx.productId, lotNumber: tx.lotNumber, expiryDate: tx.expiryDate, quantity: 0 };
        lotMap[key].quantity += tx.quantity;
    });
    var today = formatDate(new Date());
    var lots = [];
    var keys = Object.keys(lotMap);
    for (var i = 0; i < keys.length; i++) {
        lots.push(lotMap[keys[i]]);
    }
    return lots.filter(function(lot) {
        return lot.quantity > 0;
    }).map(function(lot) {
        var p = productMap[lot.productId];
        var daysUntil = Math.ceil((new Date(lot.expiryDate) - new Date(today)) / 86400000);
        var alertDays = p ? (Number(p.expiryAlertDays) || 30) : 30;
        var status = daysUntil <= 0 ? 'expired'
            : daysUntil <= 30 ? 'critical'
            : daysUntil <= alertDays ? 'warning' : 'normal';
        return {
            productId: lot.productId,
            productName: p ? p.name : '',
            lotNumber: lot.lotNumber,
            expiryDate: lot.expiryDate,
            quantity: lot.quantity,
            daysUntil: daysUntil,
            status: status
        };
    }).sort(function(a, b) { return a.daysUntil - b.daysUntil; });
}

/**
 * Build variance report from inventory count.
 * @param {object} inventoryCount - {countDate, status, items: [{productName, systemQuantity, actualQuantity}]}
 * @returns {object}
 */
function buildVarianceReport(inventoryCount) {
    if (!inventoryCount) {
        return { countDate: null, status: null, items: [], summary: {} };
    }
    var items = Array.isArray(inventoryCount.items) ? inventoryCount.items : [];
    var report = generateVarianceReport(items);
    return {
        countDate: inventoryCount.countDate || null,
        status: inventoryCount.status || null,
        items: report.items,
        summary: {
            totalItems: report.totalItems,
            countedItems: report.countedItems,
            discrepancies: report.discrepancies,
            totalVariancePositive: report.totalVariancePositive,
            totalVarianceNegative: report.totalVarianceNegative
        }
    };
}

// ============================================================
// 10. Category Label
// ============================================================

/**
 * Convert category internal value to Japanese label.
 * @param {string} category
 * @returns {string}
 */
function getCategoryLabel(category) {
    var labels = { consumable: '消耗品', retail: '物販' };
    return labels[category] || category || '';
}

// ============================================================
// Module Export (Node.js and Browser)
// ============================================================

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        calculateCurrentStock: calculateCurrentStock,
        calculateStockByLot: calculateStockByLot,
        calculateStockValue: calculateStockValue,
        getExpiryStatus: getExpiryStatus,
        getExpiringItems: getExpiringItems,
        sortByExpiry: sortByExpiry,
        calculateVariance: calculateVariance,
        generateVarianceReport: generateVarianceReport,
        buildAdjustmentTransactions: buildAdjustmentTransactions,
        getLowStockAlerts: getLowStockAlerts,
        getExpiryAlerts: getExpiryAlerts,
        validateProduct: validateProduct,
        validateTransaction: validateTransaction,
        validateJanCode: validateJanCode,
        validateImportData: validateImportData,
        generateProductCode: generateProductCode,
        formatDate: formatDate,
        formatCurrency: formatCurrency,
        escapeHtml: escapeHtml,
        searchProducts: searchProducts,
        sortProducts: sortProducts,
        filterByCategory: filterByCategory,
        buildStockSummaryReport: buildStockSummaryReport,
        buildTransactionReport: buildTransactionReport,
        buildExpiryReport: buildExpiryReport,
        buildVarianceReport: buildVarianceReport,
        getCategoryLabel: getCategoryLabel
    };
} else {
    window.TanaCalc = {
        calculateCurrentStock: calculateCurrentStock,
        calculateStockByLot: calculateStockByLot,
        calculateStockValue: calculateStockValue,
        getExpiryStatus: getExpiryStatus,
        getExpiringItems: getExpiringItems,
        sortByExpiry: sortByExpiry,
        calculateVariance: calculateVariance,
        generateVarianceReport: generateVarianceReport,
        buildAdjustmentTransactions: buildAdjustmentTransactions,
        getLowStockAlerts: getLowStockAlerts,
        getExpiryAlerts: getExpiryAlerts,
        validateProduct: validateProduct,
        validateTransaction: validateTransaction,
        validateJanCode: validateJanCode,
        validateImportData: validateImportData,
        generateProductCode: generateProductCode,
        formatDate: formatDate,
        formatCurrency: formatCurrency,
        escapeHtml: escapeHtml,
        searchProducts: searchProducts,
        sortProducts: sortProducts,
        filterByCategory: filterByCategory,
        buildStockSummaryReport: buildStockSummaryReport,
        buildTransactionReport: buildTransactionReport,
        buildExpiryReport: buildExpiryReport,
        buildVarianceReport: buildVarianceReport,
        getCategoryLabel: getCategoryLabel
    };
}
