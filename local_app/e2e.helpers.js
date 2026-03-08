/**
 * e2e.helpers.js - E2Eテスト共通ヘルパー関数
 * e2e.test.js と e2e.workflow.test.js の両方から利用される
 */

/**
 * Puppeteer の page と baseUrl を受け取り、ヘルパー関数群を返すファクトリ
 * @param {import('puppeteer').Page} page
 * @param {string} baseUrl
 */
function createHelpers(page, baseUrl) {

    /** 短い待機 */
    function sleep(ms) {
        return new Promise(r => setTimeout(r, ms));
    }

    /** ページをリロードし、アプリの初期化完了まで待つ */
    async function reloadPage() {
        await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 15000 });
        await page.waitForFunction(() => !!window.appReady, { timeout: 15000 });
        await sleep(500);
    }

    /** タブ切り替え（JS直接呼び出しで確実に切り替え） */
    async function switchToTab(tabName) {
        await page.evaluate((name) => {
            document.querySelectorAll('.tab-content').forEach(el => { el.hidden = true; });
            const target = document.getElementById('tab-' + name);
            if (target) target.hidden = false;
            document.querySelectorAll('#main-tab-nav button').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.tab === 'tab-' + name || btn.dataset.tab === name);
            });
        }, tabName);
        await page.evaluate((name) => {
            if (typeof switchTab === 'function') {
                switchTab(name);
            }
        }, tabName);
        await sleep(500);
    }

    /** サブタブ切り替え */
    async function switchToSubTab(parentTab, subTabName) {
        await page.evaluate((parent, sub) => {
            if (typeof switchSubTab === 'function') {
                switchSubTab(parent, sub);
            }
        }, parentTab, subTabName);
        await sleep(300);
    }

    /** Toast メッセージを待つ */
    async function waitForToast(timeout = 5000) {
        try {
            await page.waitForFunction(
                () => {
                    const toast = document.getElementById('toast');
                    return toast && toast.style.display === 'block';
                },
                { timeout }
            );
            const text = await page.$eval('#toast-text', el => el.textContent);
            return text;
        } catch (e) {
            return null;
        }
    }

    /** Toast が消えるのを待つ */
    async function waitForToastDismiss() {
        try {
            await page.waitForFunction(
                () => {
                    const toast = document.getElementById('toast');
                    return !toast || toast.style.display === 'none' || toast.style.display === '';
                },
                { timeout: 5000 }
            );
        } catch (e) {
            // ignore
        }
    }

    /** IndexedDB を全クリア */
    async function clearAllData() {
        await page.evaluate(async () => {
            if (typeof dbClear === 'function' && window.db) {
                await dbClear('products');
                await dbClear('stock_transactions');
                await dbClear('inventory_counts');
                await dbClear('app_settings');
            }
        });
        await sleep(300);
    }

    /** サンプルデータを JS から読み込み */
    async function loadSampleDataViaJS() {
        await page.evaluate(async () => {
            const response = await fetch('sample_data.json');
            const data = await response.json();
            if (data.products) {
                for (const p of data.products) {
                    try { await dbAdd('products', p); } catch (e) { await dbUpdate('products', p); }
                }
            }
            if (data.stock_transactions) {
                for (const tx of data.stock_transactions) {
                    try { await dbAdd('stock_transactions', tx); } catch (e) { await dbUpdate('stock_transactions', tx); }
                }
            }
            if (data.inventory_counts) {
                for (const c of data.inventory_counts) {
                    try { await dbAdd('inventory_counts', c); } catch (e) { await dbUpdate('inventory_counts', c); }
                }
            }
            if (data.settings) {
                if (Array.isArray(data.settings)) {
                    for (const s of data.settings) {
                        await dbUpdate('app_settings', s);
                    }
                } else {
                    for (const [key, value] of Object.entries(data.settings)) {
                        await saveSetting(key, value);
                    }
                }
            }
        });
        await sleep(300);
    }

    /** 確認ダイアログ（カスタム overlay）の OK を押す */
    async function acceptConfirmDialog() {
        try {
            await page.waitForSelector('#confirm-dialog:not([hidden])', { timeout: 3000 });
            await page.click('#confirm-ok-btn');
            await sleep(300);
        } catch (e) {
            // ダイアログが表示されない場合は無視
        }
    }

    /** 確認ダイアログ（カスタム overlay）のキャンセルを押す */
    async function cancelConfirmDialog() {
        try {
            await page.waitForSelector('#confirm-dialog:not([hidden])', { timeout: 3000 });
            await page.click('#confirm-cancel-btn');
            await sleep(300);
        } catch (e) {
            // ignore
        }
    }

    /** 商品フォームを開いてフィールドに入力する */
    async function fillProductForm(fields) {
        await page.waitForSelector('#product-form-overlay:not([hidden])', { timeout: 5000 });
        await sleep(300);

        if (fields.name) {
            await page.$eval('#product-name', el => el.value = '');
            await page.type('#product-name', fields.name);
        }
        if (fields.nameKana) {
            await page.$eval('#product-name-kana', el => el.value = '');
            await page.type('#product-name-kana', fields.nameKana);
        }
        if (fields.janCode) {
            await page.$eval('#product-jan-code', el => el.value = '');
            await page.type('#product-jan-code', fields.janCode);
        }
        if (fields.category) {
            await page.select('#product-category', fields.category);
        }
        if (fields.unit) {
            await page.$eval('#product-unit', el => el.value = '');
            await page.type('#product-unit', fields.unit);
        }
        if (fields.defaultPrice !== undefined) {
            await page.$eval('#product-default-price', el => el.value = '');
            await page.type('#product-default-price', String(fields.defaultPrice));
        }
        if (fields.costPrice !== undefined) {
            await page.$eval('#product-cost-price', el => el.value = '');
            await page.type('#product-cost-price', String(fields.costPrice));
        }
        if (fields.trackExpiry) {
            const checked = await page.$eval('#product-track-expiry', el => el.checked);
            if (!checked) await page.click('#product-track-expiry');
        }
        if (fields.minStock !== undefined) {
            await page.$eval('#product-min-stock', el => el.value = '');
            await page.type('#product-min-stock', String(fields.minStock));
        }
        if (fields.supplier) {
            await page.$eval('#product-supplier', el => el.value = '');
            await page.type('#product-supplier', fields.supplier);
        }
        if (fields.notes) {
            await page.$eval('#product-notes', el => el.value = '');
            await page.type('#product-notes', fields.notes);
        }
    }

    /** 商品を IndexedDB に直接追加（UI を経由せず高速） */
    async function addProductDirectly(product) {
        await page.evaluate(async (p) => {
            p.id = p.id || (Date.now().toString(36) + Math.random().toString(36).substr(2, 9));
            p.createdAt = p.createdAt || new Date().toISOString();
            p.updatedAt = p.updatedAt || new Date().toISOString();
            p.isActive = p.isActive !== undefined ? p.isActive : true;
            try { await dbAdd('products', p); } catch (e) { await dbUpdate('products', p); }
        }, product);
        await sleep(100);
    }

    /** 取引を IndexedDB に直接追加 */
    async function addTransactionDirectly(tx) {
        await page.evaluate(async (t) => {
            t.id = t.id || (Date.now().toString(36) + Math.random().toString(36).substr(2, 9));
            t.createdAt = t.createdAt || new Date().toISOString();
            try { await dbAdd('stock_transactions', t); } catch (e) { await dbUpdate('stock_transactions', t); }
        }, tx);
        await sleep(100);
    }

    /** DB内の商品数を取得 */
    async function getProductCount() {
        return await page.evaluate(async () => {
            const products = await dbGetAll('products');
            return products.filter(p => p.isActive !== false).length;
        });
    }

    /** DB内の取引数を取得 */
    async function getTransactionCount() {
        return await page.evaluate(async () => {
            const tx = await dbGetAll('stock_transactions');
            return tx.length;
        });
    }

    return {
        sleep,
        reloadPage,
        switchToTab,
        switchToSubTab,
        waitForToast,
        waitForToastDismiss,
        clearAllData,
        loadSampleDataViaJS,
        acceptConfirmDialog,
        cancelConfirmDialog,
        fillProductForm,
        addProductDirectly,
        addTransactionDirectly,
        getProductCount,
        getTransactionCount
    };
}

module.exports = { createHelpers };
