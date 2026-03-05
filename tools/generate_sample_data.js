#!/usr/bin/env node
/**
 * generate_sample_data.js
 *
 * Tanaアプリ用のサンプルデータを生成し、JSONとしてstdoutに出力する。
 * 使い方: node tools/generate_sample_data.js
 *
 * 出力形式は local_app/sample_data.json と同じ構造。
 */

'use strict';

const crypto = require('crypto');

// ============================================================
// ユーティリティ
// ============================================================

function uuid() {
    return crypto.randomUUID();
}

/** 指定日数前のDateオブジェクトを返す */
function daysAgo(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d;
}

/** ISO文字列 (datetime) */
function isoDatetime(date) {
    return date.toISOString();
}

/** YYYY-MM-DD */
function isoDate(date) {
    return date.toISOString().split('T')[0];
}

/** min以上max以下のランダム整数 */
function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** 配列からランダムに1つ選ぶ */
function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

// ============================================================
// 商品データ定義 (15品: 消耗品10 + 物販5)
// ============================================================

const now = new Date();
const baseCreatedAt = daysAgo(90);

const productDefs = [
    // --- 消耗品 10品 ---
    {
        name: 'セイリン鍼 J-15',
        nameKana: 'セイリンハリ ジェイジュウゴ',
        category: 'consumable',
        unit: '本',
        defaultPrice: 25,
        costPrice: 12,
        trackExpiry: true,
        expiryAlertDays: 90,
        minStock: 100,
        supplier: 'セイリン株式会社',
        janCode: '4901234567890',
        notes: 'ディスポーザブル鍼 0.16mm×15mm',
    },
    {
        name: 'せんねん灸 太陽',
        nameKana: 'センネンキュウ タイヨウ',
        category: 'consumable',
        unit: '個',
        defaultPrice: 50,
        costPrice: 30,
        trackExpiry: true,
        expiryAlertDays: 180,
        minStock: 50,
        supplier: 'セネファ株式会社',
        janCode: '4901234567906',
        notes: '火を使わないお灸 温熱タイプ',
    },
    {
        name: 'キネシオテーピングテープ 50mm',
        nameKana: 'キネシオテーピングテープ ゴジュウミリ',
        category: 'consumable',
        unit: '巻',
        defaultPrice: 800,
        costPrice: 450,
        trackExpiry: false,
        expiryAlertDays: 30,
        minStock: 10,
        supplier: 'ニトリート株式会社',
        janCode: '4901234567913',
        notes: '伸縮性テーピング 50mm×5m',
    },
    {
        name: 'アルコール綿',
        nameKana: 'アルコールメン',
        category: 'consumable',
        unit: '枚',
        defaultPrice: 5,
        costPrice: 2,
        trackExpiry: true,
        expiryAlertDays: 60,
        minStock: 100,
        supplier: '白十字株式会社',
        janCode: '4901234567920',
        notes: '個包装タイプ 消毒用',
    },
    {
        name: 'マッサージオイル グレープシード',
        nameKana: 'マッサージオイル グレープシード',
        category: 'consumable',
        unit: '本',
        defaultPrice: 2500,
        costPrice: 1200,
        trackExpiry: true,
        expiryAlertDays: 90,
        minStock: 3,
        supplier: '生活の木',
        janCode: '4901234567937',
        notes: 'グレープシードオイル 250ml',
    },
    {
        name: '使い捨てシーツ',
        nameKana: 'ツカイステシーツ',
        category: 'consumable',
        unit: '枚',
        defaultPrice: 30,
        costPrice: 15,
        trackExpiry: false,
        expiryAlertDays: 30,
        minStock: 50,
        supplier: '大和紙工株式会社',
        janCode: '4901234567944',
        notes: 'ベッド用 不織布 90cm×180cm',
    },
    {
        name: 'ディスポ手袋 M',
        nameKana: 'ディスポテブクロ エム',
        category: 'consumable',
        unit: '枚',
        defaultPrice: 10,
        costPrice: 5,
        trackExpiry: false,
        expiryAlertDays: 30,
        minStock: 100,
        supplier: 'オカモト株式会社',
        janCode: '4901234567951',
        notes: 'ニトリル製 パウダーフリー Mサイズ',
    },
    {
        name: 'ホットパック（大）',
        nameKana: 'ホットパック ダイ',
        category: 'consumable',
        unit: '個',
        defaultPrice: 3500,
        costPrice: 2000,
        trackExpiry: false,
        expiryAlertDays: 30,
        minStock: 3,
        supplier: '三和化研工業',
        janCode: '',
        notes: '電子レンジ加熱タイプ 繰り返し使用可',
    },
    {
        name: 'パルス鍼通電用コード',
        nameKana: 'パルスハリツウデンヨウコード',
        category: 'consumable',
        unit: '本',
        defaultPrice: 1500,
        costPrice: 800,
        trackExpiry: false,
        expiryAlertDays: 30,
        minStock: 5,
        supplier: 'セイリン株式会社',
        janCode: '4901234567968',
        notes: 'パルス通電用クリップコード 2本組',
    },
    {
        name: 'フェイスペーパー',
        nameKana: 'フェイスペーパー',
        category: 'consumable',
        unit: '枚',
        defaultPrice: 3,
        costPrice: 1,
        trackExpiry: false,
        expiryAlertDays: 30,
        minStock: 100,
        supplier: '大和紙工株式会社',
        janCode: '4901234567975',
        notes: 'フェイスクレードル用 200枚入',
    },

    // --- 物販 5品 ---
    {
        name: 'グルコサミン＆コンドロイチン',
        nameKana: 'グルコサミン アンド コンドロイチン',
        category: 'retail',
        unit: '個',
        defaultPrice: 3800,
        costPrice: 1900,
        trackExpiry: true,
        expiryAlertDays: 90,
        minStock: 5,
        supplier: 'DHC株式会社',
        janCode: '4901234567982',
        notes: '90日分 サプリメント',
    },
    {
        name: 'シャンプー 薬用スカルプ',
        nameKana: 'シャンプー ヤクヨウスカルプ',
        category: 'retail',
        unit: '本',
        defaultPrice: 2200,
        costPrice: 1100,
        trackExpiry: true,
        expiryAlertDays: 120,
        minStock: 3,
        supplier: 'アンファー株式会社',
        janCode: '4901234567999',
        notes: 'スカルプDシャンプー 350ml',
    },
    {
        name: 'トリートメント 薬用',
        nameKana: 'トリートメント ヤクヨウ',
        category: 'retail',
        unit: '本',
        defaultPrice: 2400,
        costPrice: 1200,
        trackExpiry: true,
        expiryAlertDays: 120,
        minStock: 3,
        supplier: 'アンファー株式会社',
        janCode: '4901234568002',
        notes: '薬用トリートメントパック 350g',
    },
    {
        name: '膝サポーター',
        nameKana: 'ヒザサポーター',
        category: 'retail',
        unit: '個',
        defaultPrice: 2800,
        costPrice: 1400,
        trackExpiry: false,
        expiryAlertDays: 30,
        minStock: 3,
        supplier: 'バンテリン',
        janCode: '4901234568019',
        notes: 'しっかり加圧タイプ Mサイズ',
    },
    {
        name: 'ストレッチバンド',
        nameKana: 'ストレッチバンド',
        category: 'retail',
        unit: '本',
        defaultPrice: 1200,
        costPrice: 600,
        trackExpiry: false,
        expiryAlertDays: 30,
        minStock: 5,
        supplier: 'セラバンド',
        janCode: '4901234568026',
        notes: 'レッド（ミディアム）1.5m',
    },
];

// ============================================================
// 商品レコード生成
// ============================================================

const products = productDefs.map((def, i) => {
    const code = 'P-' + String(i + 1).padStart(4, '0');
    const createdAt = new Date(baseCreatedAt.getTime() + i * 60000);
    return {
        id: uuid(),
        productCode: code,
        janCode: def.janCode,
        name: def.name,
        nameKana: def.nameKana,
        category: def.category,
        unit: def.unit,
        defaultPrice: def.defaultPrice,
        costPrice: def.costPrice,
        trackExpiry: def.trackExpiry,
        expiryAlertDays: def.expiryAlertDays,
        minStock: def.minStock,
        supplier: def.supplier,
        notes: def.notes,
        photo: '',
        isActive: true,
        createdAt: isoDatetime(createdAt),
        updatedAt: isoDatetime(createdAt),
    };
});

// ============================================================
// 取引データ生成 (30件, 過去60日)
// ============================================================

const transactionTypes = ['receive', 'use', 'sell', 'adjust', 'dispose'];

const notesByType = {
    receive: ['定期発注分', '追加発注', '初回入庫', '緊急発注分', '月初入庫'],
    use: ['施術使用', '施術消費', '今週使用分', '午前中使用分', '午後使用分'],
    sell: ['患者販売', '物販販売', '窓口販売', 'お客様購入'],
    adjust: ['棚卸調整', '在庫修正', '数量補正'],
    dispose: ['期限切れ廃棄', '破損廃棄', '品質不良により廃棄'],
};

const transactions = [];

// まず全商品に対して入庫取引を作成 (最初の15件のうちいくつか)
// 入庫を中心に、使用・販売・調整・廃棄を混ぜて30件生成
function generateTransactions() {
    const txList = [];
    let txIndex = 0;

    // 全商品に入庫を1件ずつ (15件)
    for (const prod of products) {
        const d = daysAgo(randInt(30, 60));
        const tx = {
            id: uuid(),
            productId: prod.id,
            transactionType: 'receive',
            quantity: prod.category === 'consumable' ? randInt(20, 50) : randInt(5, 20),
            date: isoDate(d),
            lotNumber: prod.trackExpiry ? `LOT-${String.fromCharCode(65 + txIndex % 26)}${now.getFullYear()}` : '',
            expiryDate: prod.trackExpiry ? isoDate(new Date(now.getTime() + randInt(180, 720) * 86400000)) : '',
            notes: pick(notesByType.receive),
            createdAt: isoDatetime(d),
        };
        txList.push(tx);
        txIndex++;
    }

    // 残り15件は使用・販売・調整・廃棄をランダムに
    const otherTypes = ['use', 'use', 'use', 'sell', 'sell', 'sell', 'adjust', 'dispose'];
    for (let i = 0; i < 15; i++) {
        const prod = pick(products);
        const type = pick(otherTypes);
        const d = daysAgo(randInt(1, 55));
        const qty = type === 'receive'
            ? randInt(5, 30)
            : -(randInt(1, 10));

        const tx = {
            id: uuid(),
            productId: prod.id,
            transactionType: type,
            quantity: qty,
            date: isoDate(d),
            lotNumber: (prod.trackExpiry && type === 'receive') ? `LOT-${String.fromCharCode(65 + (txIndex + i) % 26)}${now.getFullYear()}` : '',
            expiryDate: (prod.trackExpiry && type === 'receive') ? isoDate(new Date(now.getTime() + randInt(180, 720) * 86400000)) : '',
            notes: pick(notesByType[type]),
            createdAt: isoDatetime(d),
        };
        txList.push(tx);
    }

    // 日付順ソート
    txList.sort((a, b) => a.date.localeCompare(b.date));
    return txList;
}

const stockTransactions = generateTransactions();

// ============================================================
// 棚卸データ生成 (1件, 完了済み)
// ============================================================

const countDate = daysAgo(7);
const inventoryCounts = [
    {
        id: uuid(),
        countDate: isoDate(countDate),
        status: 'completed',
        completedAt: isoDatetime(countDate),
        items: products.map((prod) => {
            // 入庫合計を簡易計算 (この商品の全取引を集計)
            let systemQty = 0;
            for (const tx of stockTransactions) {
                if (tx.productId === prod.id) {
                    systemQty += tx.quantity;
                }
            }
            if (systemQty < 0) systemQty = 0;

            // 一部に差異を入れる (約30%の確率)
            const hasDiscrepancy = Math.random() < 0.3;
            const diff = hasDiscrepancy ? randInt(-3, -1) : 0;
            const actualQty = Math.max(0, systemQty + diff);

            return {
                productId: prod.id,
                productName: prod.name,
                productCode: prod.productCode,
                unit: prod.unit,
                systemQuantity: systemQty,
                actualQuantity: actualQty,
                status: 'counted',
            };
        }),
        createdAt: isoDatetime(new Date(countDate.getTime() - 2 * 3600000)),
    },
];

// ============================================================
// 設定データ
// ============================================================

const settings = [
    {
        id: 'clinic_info',
        value: {
            name: 'サンプル治療院',
            address: '東京都新宿区西新宿1-2-3 メディカルビル3F',
            phone: '03-9876-5432',
        },
    },
    {
        id: 'inventory_settings',
        value: {
            lowStockThreshold: 5,
            expiryWarningDays: 30,
        },
    },
    {
        id: 'notification_enabled',
        value: true,
    },
];

// ============================================================
// 出力
// ============================================================

const output = {
    appName: 'tana',
    version: '1.0.0',
    exportedAt: isoDatetime(now),
    products: products,
    stock_transactions: stockTransactions,
    inventory_counts: inventoryCounts,
    settings: settings,
};

process.stdout.write(JSON.stringify(output, null, 2) + '\n');
