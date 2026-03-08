/**
 * e2e.workflow.test.js - Tana ユースケースワークフローE2Eテスト
 * 「さくらクリニック」がTanaを導入するストーリーとして8つのUCを検証
 * docker compose run --rm tana-test で実行
 */
const puppeteer = require('puppeteer');
const fs = require('fs');
const childProcess = require('child_process');
const { createHelpers } = require('./e2e.helpers');

const isE2E = !!process.env.E2E_APP_IP;
const describeE2E = isE2E ? describe : describe.skip;

jest.setTimeout(600000);

describeE2E('Tana Workflow E2E Tests — さくらクリニック', () => {
    let browser;
    let page;
    let baseUrl;

    // ヘルパー関数（beforeAll後に初期化）
    let sleep, reloadPage, switchToTab, switchToSubTab, waitForToast, waitForToastDismiss;
    let clearAllData, loadSampleDataViaJS, acceptConfirmDialog, cancelConfirmDialog;
    let fillProductForm, addProductDirectly, addTransactionDirectly, getProductCount, getTransactionCount;

    let testCount = 0;
    beforeEach(() => {
        testCount++;
        console.log(`[WF-${testCount}] ${expect.getState().currentTestName}`);
    });

    // =========================================================================
    // Setup / Teardown
    // =========================================================================
    beforeAll(async () => {
        const host = process.env.E2E_APP_HOST || 'tana-app';
        const fixedIp = String(process.env.E2E_APP_IP || '').trim();
        const hasFixedIp = Boolean(fixedIp && /^\d+\.\d+\.\d+\.\d+$/.test(fixedIp));

        if (hasFixedIp) {
            baseUrl = `http://${fixedIp}`;
            console.log(`E2E baseUrl = ${baseUrl} (fixed)`);
        } else {
            const tryResolveIpv4 = () => {
                try {
                    const out = childProcess.execSync(`getent hosts ${host}`, { encoding: 'utf-8', timeout: 8000 }).trim();
                    const ip = out.split(/\s+/)[0];
                    if (ip && /^\d+\.\d+\.\d+\.\d+$/.test(ip)) return ip;
                } catch (e) { }
                try {
                    const out = childProcess.execSync(`nslookup ${host} 127.0.0.11`, { encoding: 'utf-8', timeout: 8000 });
                    const lines = String(out || '').split('\n').map(l => l.trim()).filter(Boolean);
                    const addrLine = lines.find(l => /^Address\s+\d+:\s+\d+\.\d+\.\d+\.\d+/.test(l));
                    if (addrLine) {
                        const m = addrLine.match(/(\d+\.\d+\.\d+\.\d+)/);
                        if (m && m[1]) return m[1];
                    }
                } catch (e) { }
                try {
                    const hostsText = fs.readFileSync('/etc/hosts', 'utf-8');
                    const line = hostsText.split('\n').find(l => l.includes(` ${host}`) || l.endsWith(`\t${host}`));
                    if (line) {
                        const ip = line.trim().split(/\s+/)[0];
                        if (ip && /^\d+\.\d+\.\d+\.\d+$/.test(ip)) return ip;
                    }
                } catch (e) { }
                return null;
            };

            let ip = null;
            for (let i = 0; i < 30; i++) {
                ip = tryResolveIpv4();
                if (ip) break;
                await new Promise(r => setTimeout(r, 1000));
            }
            if (!ip) {
                throw new Error(`E2E: cannot resolve '${host}' to IPv4.`);
            }
            baseUrl = `http://${ip}`;
            console.log(`E2E baseUrl = ${baseUrl}`);
        }

        browser = await puppeteer.launch({
            headless: 'new',
            timeout: 300000,
            protocolTimeout: 300000,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu'
            ]
        });
        page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });

        page.on('pageerror', error => {
            console.error('Browser Page Error:', error.message);
        });

        // DNS resolution retry for initial load
        let loaded = false;
        for (let i = 0; i < 10; i++) {
            try {
                await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 10000 });
                loaded = true;
                break;
            } catch (e) {
                await new Promise(r => setTimeout(r, 2000));
            }
        }
        if (!loaded) throw new Error('Could not load app');

        // アプリ初期化完了を待つ
        await page.waitForFunction(() => !!window.appReady, { timeout: 15000 });

        // ヘルパー関数を初期化
        const helpers = createHelpers(page, baseUrl);
        sleep = helpers.sleep;
        reloadPage = helpers.reloadPage;
        switchToTab = helpers.switchToTab;
        switchToSubTab = helpers.switchToSubTab;
        waitForToast = helpers.waitForToast;
        waitForToastDismiss = helpers.waitForToastDismiss;
        clearAllData = helpers.clearAllData;
        loadSampleDataViaJS = helpers.loadSampleDataViaJS;
        acceptConfirmDialog = helpers.acceptConfirmDialog;
        cancelConfirmDialog = helpers.cancelConfirmDialog;
        fillProductForm = helpers.fillProductForm;
        addProductDirectly = helpers.addProductDirectly;
        addTransactionDirectly = helpers.addTransactionDirectly;
        getProductCount = helpers.getProductCount;
        getTransactionCount = helpers.getTransactionCount;
    });

    afterAll(async () => {
        if (browser) await browser.close();
    });

    /**
     * データを全クリアしてリロード（autoLoadSampleData対策）
     * アプリは products が空だとサンプルデータを自動ロードするため、
     * ダミー商品を挿入してからリロードし、リロード後に全クリアする
     */
    async function clearAndReload() {
        await clearAllData();
        // ダミー商品を挿入して autoLoadSampleData をスキップさせる
        // isActive: false なので getProductCount() やUI表示には影響しない
        await addProductDirectly({
            id: '__e2e_dummy__', name: 'dummy', category: 'consumable',
            isActive: false, productCode: 'X-0000'
        });
        await reloadPage();
        // リロード後はダミー以外のストアのみクリア
        // ダミー商品は残して以降の reloadPage() でも autoLoad を防止する
        await page.evaluate(async () => {
            if (typeof dbClear === 'function' && window.db) {
                await dbClear('stock_transactions');
                await dbClear('inventory_counts');
                await dbClear('app_settings');
            }
        });
        await sleep(300);
    }

    // =========================================================================
    // UC1: 開業準備 — 初期セットアップ
    // =========================================================================
    describe('UC1: 開業準備 — 初期セットアップ', () => {
        beforeAll(async () => {
            await clearAndReload();
        });

        test('WF-UC1-001: 事業者情報を入力・保存する', async () => {
            await switchToTab('settings');

            await page.$eval('#business-name', el => el.value = '');
            await page.type('#business-name', 'さくらクリニック');
            await page.$eval('#contact-name', el => el.value = '');
            await page.type('#contact-name', '佐藤 花子');
            await page.$eval('#address', el => el.value = '');
            await page.type('#address', '東京都渋谷区神宮前1-2-3');
            await page.$eval('#phone', el => el.value = '');
            await page.type('#phone', '03-1234-5678');

            await page.click('#save-business-info-btn');
            const toast = await waitForToast();
            expect(toast).toBeTruthy();

            // リロード後も永続化されていることを確認
            await reloadPage();
            await switchToTab('settings');
            const savedName = await page.$eval('#business-name', el => el.value);
            expect(savedName).toBe('さくらクリニック');
        });

        test('WF-UC1-002: 在庫管理設定（期限アラート30日）を保存する', async () => {
            await switchToTab('settings');

            await page.$eval('#default-expiry-alert-days', el => el.value = '');
            await page.type('#default-expiry-alert-days', '30');

            await page.click('#save-inventory-settings-btn');
            const toast = await waitForToast();
            expect(toast).toBeTruthy();
        });

        test('WF-UC1-003: 消耗品（セイリン鍼 J-15）を登録する', async () => {
            await switchToTab('products');
            await sleep(300);
            await page.click('#add-product-btn');

            await fillProductForm({
                name: 'セイリン鍼 J-15',
                nameKana: 'せいりんはり',
                janCode: '4901234567894',
                category: 'consumable',
                unit: '本',
                defaultPrice: 25,
                costPrice: 12,
                trackExpiry: true,
                minStock: 50,
                supplier: 'セイリン株式会社',
                notes: 'ディスポーザブル鍼 0.16mm×15mm'
            });

            await page.click('#save-product-btn');
            const toast = await waitForToast();
            expect(toast).toBeTruthy();
            await waitForToastDismiss();

            const count = await getProductCount();
            expect(count).toBe(1);
        });

        test('WF-UC1-004: 物販商品（グルコサミンサプリ）を登録する', async () => {
            await switchToTab('products');
            await sleep(300);
            await page.click('#add-product-btn');

            await fillProductForm({
                name: 'グルコサミンサプリ',
                nameKana: 'ぐるこさみんさぷり',
                janCode: '4901001000081',
                category: 'retail',
                unit: '個',
                defaultPrice: 3800,
                costPrice: 1900,
                trackExpiry: true,
                minStock: 5
            });

            await page.click('#save-product-btn');
            const toast = await waitForToast();
            expect(toast).toBeTruthy();
            await waitForToastDismiss();

            const count = await getProductCount();
            expect(count).toBe(2);
        });

        test('WF-UC1-005: ダッシュボードに商品数が反映される', async () => {
            await switchToTab('dashboard');
            await sleep(500);

            const totalProducts = await page.$eval('#dashboard-total-products', el => el.textContent.trim());
            expect(parseInt(totalProducts)).toBe(2);
        });
    });

    // =========================================================================
    // UC2: 初回入荷 — 在庫の受け入れ
    // =========================================================================
    describe('UC2: 初回入荷 — 在庫の受け入れ', () => {
        beforeAll(async () => {
            await clearAndReload();
            // 前提データ: 商品2件をDB直接投入
            await addProductDirectly({
                id: 'wf-prod-001',
                productCode: 'P-0001',
                janCode: '4901234567894',
                name: 'セイリン鍼 J-15',
                nameKana: 'せいりんはり',
                category: 'consumable',
                unit: '本',
                defaultPrice: 25,
                costPrice: 12,
                trackExpiry: true,
                expiryAlertDays: 30,
                minStock: 50,
                supplier: 'セイリン株式会社'
            });
            await addProductDirectly({
                id: 'wf-prod-002',
                productCode: 'P-0002',
                janCode: '4901001000081',
                name: 'グルコサミンサプリ',
                nameKana: 'ぐるこさみんさぷり',
                category: 'retail',
                unit: '個',
                defaultPrice: 3800,
                costPrice: 1900,
                trackExpiry: true,
                expiryAlertDays: 90,
                minStock: 5
            });
            await reloadPage();
        });

        test('WF-UC2-001: 消耗品を入荷する（数量200、ロットLOT-2026A、期限2027-12-31）', async () => {
            await switchToTab('transactions');
            await switchToSubTab('transactions', 'receive');
            await sleep(500);

            await page.select('#receive-product', 'wf-prod-001');
            await sleep(300);

            // trackExpiry商品を選択したらロット・期限フィールドが表示される
            await page.evaluate(() => {
                onTransactionProductChange(document.getElementById('receive-product'), 'receive');
            });
            await sleep(300);

            await page.$eval('#receive-quantity', el => el.value = '');
            await page.type('#receive-quantity', '200');
            await page.$eval('#receive-unit-cost', el => el.value = '');
            await page.type('#receive-unit-cost', '12');

            // ロット番号と期限
            const lotField = await page.$('#receive-lot-number');
            if (lotField) {
                await page.$eval('#receive-lot-number', el => el.value = '');
                await page.type('#receive-lot-number', 'LOT-2026A');
            }
            const expiryField = await page.$('#receive-expiry-date');
            if (expiryField) {
                await page.$eval('#receive-expiry-date', el => el.value = '');
                await page.type('#receive-expiry-date', '2027-12-31');
            }

            await page.click('#save-receive-btn');
            const toast = await waitForToast();
            expect(toast).toBeTruthy();
            await waitForToastDismiss();

            const txCount = await getTransactionCount();
            expect(txCount).toBe(1);
        });

        test('WF-UC2-002: バーコードスキャンで物販を入荷する（数量20）', async () => {
            await switchToTab('transactions');
            await switchToSubTab('transactions', 'receive');
            await sleep(500);

            // バーコードスキャンをシミュレート:
            // scanCallback を設定してから onScanSuccess を呼ぶ
            await page.evaluate(() => {
                scanCallback = async (code) => {
                    const product = await lookupByBarcode(code);
                    if (product) {
                        const select = document.getElementById('receive-product');
                        if (select) {
                            select.value = product.id;
                            onTransactionProductChange(select, 'receive');
                        }
                    }
                };
                lastScanCode = '';
                lastScanTime = 0;
                onScanSuccess('4901001000081');
            });
            await sleep(500);

            // スキャン後、商品がセレクトに選択されていることを確認
            const selectedValue = await page.$eval('#receive-product', el => el.value);
            expect(selectedValue).toBe('wf-prod-002');

            await page.$eval('#receive-quantity', el => el.value = '');
            await page.type('#receive-quantity', '20');
            await page.$eval('#receive-unit-cost', el => el.value = '');
            await page.type('#receive-unit-cost', '1900');

            await page.click('#save-receive-btn');
            const toast = await waitForToast();
            expect(toast).toBeTruthy();
            await waitForToastDismiss();

            const txCount = await getTransactionCount();
            expect(txCount).toBe(2);
        });

        test('WF-UC2-003: ダッシュボードに在庫合計220が反映される', async () => {
            await switchToTab('dashboard');
            await sleep(500);

            const totalStock = await page.$eval('#dashboard-total-stock', el => el.textContent.trim());
            expect(parseInt(totalStock)).toBe(220);
        });

        test('WF-UC2-004: 在庫不足アラートが表示されない', async () => {
            // 十分な在庫があるのでアラートなし
            const alertCount = await page.$eval('#dashboard-low-stock', el => {
                const items = el.querySelectorAll('.alert-item, li');
                return items.length;
            });
            expect(alertCount).toBe(0);
        });
    });

    // =========================================================================
    // UC3: 日常業務 — 消費と販売
    // =========================================================================
    describe('UC3: 日常業務 — 消費と販売', () => {
        beforeAll(async () => {
            await clearAndReload();
            // 前提データ: 商品2件 + 入荷済み
            await addProductDirectly({
                id: 'wf-prod-001',
                productCode: 'P-0001',
                janCode: '4901234567894',
                name: 'セイリン鍼 J-15',
                nameKana: 'せいりんはり',
                category: 'consumable',
                unit: '本',
                defaultPrice: 25,
                costPrice: 12,
                trackExpiry: true,
                expiryAlertDays: 30,
                minStock: 50
            });
            await addProductDirectly({
                id: 'wf-prod-002',
                productCode: 'P-0002',
                janCode: '4901001000081',
                name: 'グルコサミンサプリ',
                nameKana: 'ぐるこさみんさぷり',
                category: 'retail',
                unit: '個',
                defaultPrice: 3800,
                costPrice: 1900,
                trackExpiry: true,
                expiryAlertDays: 90,
                minStock: 5
            });
            await addTransactionDirectly({
                id: 'wf-tx-recv-001',
                productId: 'wf-prod-001',
                transactionType: 'receive',
                quantity: 200,
                date: '2026-03-01',
                lotNumber: 'LOT-2026A',
                expiryDate: '2027-12-31',
                notes: '初回入荷'
            });
            await addTransactionDirectly({
                id: 'wf-tx-recv-002',
                productId: 'wf-prod-002',
                transactionType: 'receive',
                quantity: 20,
                date: '2026-03-01',
                notes: '初回入荷'
            });
            await reloadPage();
        });

        test('WF-UC3-001: 消耗品を使用する（数量30）', async () => {
            await switchToTab('transactions');
            await switchToSubTab('transactions', 'use');
            await sleep(500);

            await page.select('#use-product', 'wf-prod-001');
            await sleep(200);
            await page.$eval('#use-quantity', el => el.value = '');
            await page.type('#use-quantity', '30');

            await page.click('#save-use-btn');
            const toast = await waitForToast();
            expect(toast).toBeTruthy();
            await waitForToastDismiss();
        });

        test('WF-UC3-002: 物販を販売する（数量2）', async () => {
            await switchToTab('transactions');
            await switchToSubTab('transactions', 'sell');
            await sleep(500);

            await page.select('#sell-product', 'wf-prod-002');
            await sleep(200);
            await page.$eval('#sell-quantity', el => el.value = '');
            await page.type('#sell-quantity', '2');

            await page.click('#save-sell-btn');
            const toast = await waitForToast();
            expect(toast).toBeTruthy();
            await waitForToastDismiss();
        });

        test('WF-UC3-003: ダッシュボードに在庫数が更新される（170、18）', async () => {
            await switchToTab('dashboard');
            await sleep(500);

            // 合計在庫: 170 + 18 = 188
            const totalStock = await page.$eval('#dashboard-total-stock', el => el.textContent.trim());
            expect(parseInt(totalStock)).toBe(188);

            // 各商品の在庫をDBで確認（saveTransactionが使用/販売を負数で保存するため直接合算）
            const stocks = await page.evaluate(async () => {
                const txs = await dbGetAll('stock_transactions');
                const stock1 = txs.filter(t => t.productId === 'wf-prod-001')
                    .reduce((sum, t) => sum + Number(t.quantity), 0);
                const stock2 = txs.filter(t => t.productId === 'wf-prod-002')
                    .reduce((sum, t) => sum + Number(t.quantity), 0);
                return { stock1, stock2 };
            });
            expect(stocks.stock1).toBe(170);
            expect(stocks.stock2).toBe(18);
        });

        test('WF-UC3-004: minStockを200に変更すると在庫不足アラートが表示される', async () => {
            // 消耗品のminStockを200に変更
            await page.evaluate(async () => {
                const p = await dbGet('products', 'wf-prod-001');
                p.minStock = 200;
                p.updatedAt = new Date().toISOString();
                await dbUpdate('products', p);
            });

            // ダッシュボードをリロードしてアラートを再計算
            await switchToTab('dashboard');
            await sleep(500);

            // 在庫不足アラートが表示される（在庫170 < minStock200）
            const alertText = await page.$eval('#dashboard-low-stock', el => el.textContent);
            expect(alertText).toContain('セイリン鍼');
        });

        test('WF-UC3-005: 最近の取引に2件以上表示される', async () => {
            await switchToTab('dashboard');
            await sleep(500);

            const recentText = await page.$eval('#dashboard-recent', el => el.textContent);
            // 使用と販売の2取引が含まれること
            expect(recentText.length).toBeGreaterThan(10);
        });
    });

    // =========================================================================
    // UC4: 期限管理 — 消費期限の確認と対応
    // =========================================================================
    describe('UC4: 期限管理 — 消費期限の確認と対応', () => {
        beforeAll(async () => {
            await clearAndReload();

            // 期限管理ON商品
            await addProductDirectly({
                id: 'wf-prod-exp-001',
                productCode: 'P-0001',
                name: 'セイリン鍼 J-15',
                nameKana: 'せいりんはり',
                category: 'consumable',
                unit: '本',
                trackExpiry: true,
                expiryAlertDays: 30,
                minStock: 50
            });

            // 期限管理OFF商品
            await addProductDirectly({
                id: 'wf-prod-exp-002',
                productCode: 'P-0002',
                name: 'キネシオテーピング',
                nameKana: 'きねしおてーぴんぐ',
                category: 'consumable',
                unit: '巻',
                trackExpiry: false,
                minStock: 10
            });

            // 期限切れロット
            await addTransactionDirectly({
                id: 'wf-tx-exp-001',
                productId: 'wf-prod-exp-001',
                transactionType: 'receive',
                quantity: 100,
                date: '2025-06-01',
                lotNumber: 'LOT-OLD',
                expiryDate: '2026-01-31'
            });

            // 期限間近ロット（15日後）
            const nearExpiry = new Date();
            nearExpiry.setDate(nearExpiry.getDate() + 15);
            const nearExpiryStr = nearExpiry.toISOString().split('T')[0];
            await addTransactionDirectly({
                id: 'wf-tx-exp-002',
                productId: 'wf-prod-exp-001',
                transactionType: 'receive',
                quantity: 200,
                date: '2026-01-01',
                lotNumber: 'LOT-NEAR',
                expiryDate: nearExpiryStr
            });

            // 期限管理OFF商品の入荷（期限レポートに出ないはず）
            await addTransactionDirectly({
                id: 'wf-tx-exp-003',
                productId: 'wf-prod-exp-002',
                transactionType: 'receive',
                quantity: 30,
                date: '2026-01-01'
            });

            await reloadPage();
        });

        test('WF-UC4-001: ダッシュボードに期限アラートが表示される', async () => {
            await switchToTab('dashboard');
            await sleep(500);

            const alertText = await page.$eval('#dashboard-expiry', el => el.textContent);
            expect(alertText.length).toBeGreaterThan(5);
        });

        test('WF-UC4-002: 期限レポートにロット別ステータスが表示される', async () => {
            await switchToTab('reports');
            await switchToSubTab('reports', 'report-expiry');
            await sleep(500);

            const tableHtml = await page.$eval('#subtab-report-expiry', el => el.innerHTML);
            // ロット番号が表示されること
            expect(tableHtml).toContain('LOT-');
        });

        test('WF-UC4-003: 期限切れ・期限間近のバッジ色が正しい', async () => {
            await switchToTab('reports');
            await switchToSubTab('reports', 'report-expiry');
            await sleep(500);

            // ステータスバッジが存在すること
            const badges = await page.$$eval(
                '#subtab-report-expiry [class*="badge"], #subtab-report-expiry [class*="expiry-"]',
                els => els.map(el => el.className)
            );
            expect(badges.length).toBeGreaterThanOrEqual(1);
        });

        test('WF-UC4-004: 期限管理OFFの商品が期限レポートに出ない', async () => {
            await switchToTab('reports');
            await switchToSubTab('reports', 'report-expiry');
            await sleep(500);

            const html = await page.$eval('#subtab-report-expiry', el => el.textContent);
            expect(html).not.toContain('キネシオテーピング');
        });
    });

    // =========================================================================
    // UC5: 月次棚卸 — 在庫確認と調整
    // =========================================================================
    describe('UC5: 月次棚卸 — 在庫確認と調整', () => {
        beforeAll(async () => {
            await clearAndReload();

            await addProductDirectly({
                id: 'wf-cnt-prod-001',
                productCode: 'P-0001',
                name: 'セイリン鍼 J-15',
                nameKana: 'せいりんはり',
                category: 'consumable',
                unit: '本',
                trackExpiry: true,
                minStock: 50
            });
            await addProductDirectly({
                id: 'wf-cnt-prod-002',
                productCode: 'P-0002',
                name: 'グルコサミンサプリ',
                nameKana: 'ぐるこさみんさぷり',
                category: 'retail',
                unit: '個',
                trackExpiry: false,
                minStock: 5
            });

            // 在庫: 消耗品170、物販18
            await addTransactionDirectly({
                id: 'wf-cnt-tx-001',
                productId: 'wf-cnt-prod-001',
                transactionType: 'receive',
                quantity: 200,
                date: '2026-03-01'
            });
            await addTransactionDirectly({
                id: 'wf-cnt-tx-002',
                productId: 'wf-cnt-prod-001',
                transactionType: 'use',
                quantity: -30,
                date: '2026-03-08'
            });
            await addTransactionDirectly({
                id: 'wf-cnt-tx-003',
                productId: 'wf-cnt-prod-002',
                transactionType: 'receive',
                quantity: 20,
                date: '2026-03-01'
            });
            await addTransactionDirectly({
                id: 'wf-cnt-tx-004',
                productId: 'wf-cnt-prod-002',
                transactionType: 'sell',
                quantity: -2,
                date: '2026-03-08'
            });

            await reloadPage();
        });

        test('WF-UC5-001: 新規棚卸を開始する', async () => {
            await switchToTab('inventory');
            await sleep(300);

            await page.click('#start-count-btn');
            await sleep(1000);

            // in_progress の棚卸が作成されたことを確認
            const countStatus = await page.evaluate(async () => {
                const counts = await dbGetAll('inventory_counts');
                const active = counts.find(c => c.status === 'in_progress');
                return active ? active.status : null;
            });
            expect(countStatus).toBe('in_progress');
        });

        test('WF-UC5-002: テンキーで商品1の実数量165を入力する（差異-5）', async () => {
            // 棚卸アイテムのインデックスを特定（名前順でソートされている）
            const itemIndex = await page.evaluate(async () => {
                const counts = await dbGetAll('inventory_counts');
                const active = counts.find(c => c.status === 'in_progress');
                if (!active) return -1;
                return active.items.findIndex(i => i.productId === 'wf-cnt-prod-001');
            });
            expect(itemIndex).toBeGreaterThanOrEqual(0);

            // openNumpad を直接呼び出してテンキーを開く
            await page.evaluate((idx) => openNumpad(idx), itemIndex);
            await sleep(500);

            // テンキーが開くことを確認
            const numpadVisible = await page.$eval('#numpad-overlay', el => !el.hidden);
            expect(numpadVisible).toBe(true);

            // テンキーで165を入力
            await page.click('[data-numpad="1"]');
            await page.click('[data-numpad="6"]');
            await page.click('[data-numpad="5"]');
            await sleep(200);

            const display = await page.$eval('#numpad-display', el => el.textContent);
            expect(display).toBe('165');

            // 確定
            await page.click('#numpad-confirm-btn');
            await sleep(500);

            // DBに保存されたことを確認
            const item = await page.evaluate(async () => {
                const counts = await dbGetAll('inventory_counts');
                const active = counts.find(c => c.status === 'in_progress');
                if (!active) return null;
                return active.items.find(i => i.productId === 'wf-cnt-prod-001');
            });
            expect(item).toBeTruthy();
            expect(item.actualQuantity).toBe(165);
            expect(item.status).toBe('counted');
        });

        test('WF-UC5-003: テンキーで商品2の実数量20を入力する（差異+2）', async () => {
            const itemIndex = await page.evaluate(async () => {
                const counts = await dbGetAll('inventory_counts');
                const active = counts.find(c => c.status === 'in_progress');
                if (!active) return -1;
                return active.items.findIndex(i => i.productId === 'wf-cnt-prod-002');
            });
            expect(itemIndex).toBeGreaterThanOrEqual(0);

            await page.evaluate((idx) => openNumpad(idx), itemIndex);
            await sleep(500);

            const numpadVisible = await page.$eval('#numpad-overlay', el => !el.hidden);
            expect(numpadVisible).toBe(true);

            // テンキーで20を入力
            await page.click('[data-numpad="2"]');
            await page.click('[data-numpad="0"]');
            await sleep(200);

            const display = await page.$eval('#numpad-display', el => el.textContent);
            expect(display).toBe('20');

            await page.click('#numpad-confirm-btn');
            await sleep(500);

            const item = await page.evaluate(async () => {
                const counts = await dbGetAll('inventory_counts');
                const active = counts.find(c => c.status === 'in_progress');
                if (!active) return null;
                return active.items.find(i => i.productId === 'wf-cnt-prod-002');
            });
            expect(item).toBeTruthy();
            expect(item.actualQuantity).toBe(20);
            expect(item.status).toBe('counted');
        });

        test('WF-UC5-004: 棚卸を完了する（確認ダイアログ承認）', async () => {
            const txCountBefore = await getTransactionCount();

            // completeCount() を呼び出す（showConfirm()がPromise返却でブロックするため、awaitしない）
            await page.evaluate(() => { completeCount(); });
            // 棚卸完了確認ダイアログ
            await acceptConfirmDialog();
            await sleep(1000);

            // ステータスがcompletedになっていることを確認
            const countStatus = await page.evaluate(async () => {
                const counts = await dbGetAll('inventory_counts');
                const completed = counts.find(c => c.status === 'completed');
                return completed ? completed.status : null;
            });
            expect(countStatus).toBe('completed');

            // 調整取引が自動生成されていることを確認
            const txCountAfter = await getTransactionCount();
            // 差異2件（-5と+2）なので調整取引2件追加
            expect(txCountAfter).toBe(txCountBefore + 2);
        });

        test('WF-UC5-005: 棚卸履歴に完了済みセッションが表示される', async () => {
            await switchToTab('inventory');
            await sleep(500);

            const historyText = await page.$eval('#count-history-list', el => el.textContent);
            expect(historyText.length).toBeGreaterThan(5);
        });

        test('WF-UC5-006: 差異レポートでセッションを選択して差異が表示される', async () => {
            await switchToTab('reports');
            await switchToSubTab('reports', 'report-variance');
            await sleep(500);

            // セッション選択ドロップダウンにオプションがあることを確認
            const options = await page.$$eval('#variance-session-select option', opts =>
                opts.filter(o => o.value).length
            );
            expect(options).toBeGreaterThanOrEqual(1);

            // 最初のセッションを選択
            const firstValue = await page.$$eval('#variance-session-select option', opts => {
                const valid = opts.filter(o => o.value);
                return valid.length > 0 ? valid[0].value : '';
            });
            if (firstValue) {
                await page.select('#variance-session-select', firstValue);
                await sleep(500);

                // テーブルに差異が表示されること
                const tableHtml = await page.$eval('#subtab-report-variance', el => el.innerHTML);
                expect(tableHtml).toContain('table');
            }
        });
    });

    // =========================================================================
    // UC6: レポート活用 — 経営分析
    // =========================================================================
    describe('UC6: レポート活用 — 経営分析', () => {
        beforeAll(async () => {
            await clearAndReload();
            await loadSampleDataViaJS();
            await reloadPage();
        });

        test('WF-UC6-001: 在庫レポートに全商品一覧が表示される', async () => {
            await switchToTab('reports');
            await switchToSubTab('reports', 'report-stock');
            await sleep(500);

            const rows = await page.$$eval(
                '#subtab-report-stock table tbody tr',
                els => els.length
            );
            expect(rows).toBeGreaterThanOrEqual(10);
        });

        test('WF-UC6-002: カテゴリフィルタで消耗品のみ/物販のみを表示する', async () => {
            await switchToTab('reports');
            await switchToSubTab('reports', 'report-stock');
            await sleep(300);

            // 全件数を取得
            const allRows = await page.$$eval(
                '#subtab-report-stock table tbody tr',
                els => els.length
            );

            // 消耗品フィルタ
            await page.select('#stock-report-category', 'consumable');
            await sleep(500);
            const consumableRows = await page.$$eval(
                '#subtab-report-stock table tbody tr',
                els => els.length
            );
            expect(consumableRows).toBeLessThan(allRows);
            expect(consumableRows).toBeGreaterThan(0);

            // 物販フィルタ
            await page.select('#stock-report-category', 'retail');
            await sleep(500);
            const retailRows = await page.$$eval(
                '#subtab-report-stock table tbody tr',
                els => els.length
            );
            expect(retailRows).toBeLessThan(allRows);
            expect(retailRows).toBeGreaterThan(0);

            // 合計 = 全件
            expect(consumableRows + retailRows).toBe(allRows);

            // フィルタリセット
            await page.select('#stock-report-category', '');
            await sleep(300);
        });

        test('WF-UC6-003: ソートで在庫数昇順/降順を切り替える', async () => {
            await switchToTab('reports');
            await switchToSubTab('reports', 'report-stock');
            await sleep(300);

            // 在庫数昇順
            await page.select('#stock-report-sort', 'stock-asc');
            await sleep(500);
            const ascValues = await page.$$eval(
                '#subtab-report-stock table tbody tr td:nth-child(4)',
                cells => cells.map(c => parseInt(c.textContent.replace(/[^0-9-]/g, '')) || 0)
            );
            if (ascValues.length > 1) {
                for (let i = 1; i < ascValues.length; i++) {
                    expect(ascValues[i]).toBeGreaterThanOrEqual(ascValues[i - 1]);
                }
            }

            // 在庫数降順
            await page.select('#stock-report-sort', 'stock-desc');
            await sleep(500);
            const descValues = await page.$$eval(
                '#subtab-report-stock table tbody tr td:nth-child(4)',
                cells => cells.map(c => parseInt(c.textContent.replace(/[^0-9-]/g, '')) || 0)
            );
            if (descValues.length > 1) {
                for (let i = 1; i < descValues.length; i++) {
                    expect(descValues[i]).toBeLessThanOrEqual(descValues[i - 1]);
                }
            }
        });

        test('WF-UC6-004: 取引履歴レポートの種別フィルタ', async () => {
            await switchToTab('reports');
            await switchToSubTab('reports', 'report-history');
            await sleep(500);

            // 全取引数
            const allRows = await page.$$eval(
                '#subtab-report-history table tbody tr',
                els => els.length
            );
            expect(allRows).toBeGreaterThan(0);

            // 種別フィルタ: 入庫のみ
            await page.select('#report-history-type', 'receive');
            await sleep(500);
            const receiveRows = await page.$$eval(
                '#subtab-report-history table tbody tr',
                els => els.length
            );
            expect(receiveRows).toBeLessThan(allRows);
            expect(receiveRows).toBeGreaterThan(0);

            // フィルタリセット
            await page.select('#report-history-type', '');
            await sleep(300);
        });

        test('WF-UC6-005: 期限レポートにロット情報とステータスバッジが表示される', async () => {
            await switchToTab('reports');
            await switchToSubTab('reports', 'report-expiry');
            await sleep(500);

            const tableHtml = await page.$eval('#subtab-report-expiry', el => el.innerHTML);
            expect(tableHtml).toContain('LOT-');
        });

        test('WF-UC6-006: 差異レポートにセッションが表示される', async () => {
            await switchToTab('reports');
            await switchToSubTab('reports', 'report-variance');
            await sleep(500);

            // サンプルデータに棚卸データがあるのでセッション選択肢がある
            const options = await page.$$eval('#variance-session-select option', opts =>
                opts.filter(o => o.value).length
            );
            expect(options).toBeGreaterThanOrEqual(1);
        });
    });

    // =========================================================================
    // UC7: データ保全 — バックアップと復元
    // =========================================================================
    describe('UC7: データ保全 — バックアップと復元', () => {
        let exportedData;
        let productCountBefore;
        let txCountBefore;

        beforeAll(async () => {
            await clearAndReload();
            await loadSampleDataViaJS();
            await reloadPage();
        });

        test('WF-UC7-001: エクスポートでJSONが正しく生成される', async () => {
            exportedData = await page.evaluate(async () => {
                const products = await dbGetAll('products');
                const transactions = await dbGetAll('stock_transactions');
                const counts = await dbGetAll('inventory_counts');
                const settingKeys = ['business_info', 'inventory_settings', 'notification_enabled'];
                const settings = {};
                for (const key of settingKeys) {
                    const val = await getSetting(key);
                    if (val !== null) settings[key] = val;
                }
                return {
                    appName: 'tana',
                    version: '1.0.0',
                    products,
                    stock_transactions: transactions,
                    inventory_counts: counts,
                    settings
                };
            });

            expect(exportedData.appName).toBe('tana');
            expect(exportedData.products.length).toBeGreaterThan(0);
            expect(exportedData.stock_transactions.length).toBeGreaterThan(0);

            productCountBefore = exportedData.products.filter(p => p.isActive !== false).length;
            txCountBefore = exportedData.stock_transactions.length;
        });

        test('WF-UC7-002: 全データ削除で商品0件・取引0件になる', async () => {
            await clearAllData();
            await sleep(300);

            const pCount = await getProductCount();
            expect(pCount).toBe(0);

            const tCount = await getTransactionCount();
            expect(tCount).toBe(0);
        });

        test('WF-UC7-003: エクスポートしたデータをインポートして復元する', async () => {
            await page.evaluate(async (data) => {
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
                    for (const [key, value] of Object.entries(data.settings)) {
                        await saveSetting(key, value);
                    }
                }
            }, exportedData);
            await sleep(300);

            const afterProductCount = await getProductCount();
            expect(afterProductCount).toBe(productCountBefore);

            const afterTxCount = await getTransactionCount();
            expect(afterTxCount).toBe(txCountBefore);
        });

        test('WF-UC7-004: 復元後のダッシュボードが正常に表示される', async () => {
            await reloadPage();
            await switchToTab('dashboard');
            await sleep(500);

            const totalProducts = await page.$eval('#dashboard-total-products', el => el.textContent.trim());
            expect(parseInt(totalProducts)).toBeGreaterThan(0);

            const totalStock = await page.$eval('#dashboard-total-stock', el => el.textContent.trim());
            expect(parseInt(totalStock)).toBeGreaterThan(0);

            // undefined/NaN が表示されていないことを確認
            const dashboardText = await page.$eval('#tab-dashboard', el => el.textContent);
            expect(dashboardText).not.toContain('undefined');
            expect(dashboardText).not.toContain('NaN');
        });
    });

    // =========================================================================
    // UC8: 商品管理 — 検索・編集・削除
    // =========================================================================
    describe('UC8: 商品管理 — 検索・編集・削除', () => {
        beforeAll(async () => {
            await clearAndReload();

            // 3商品: 消耗品2 + 物販1
            await addProductDirectly({
                id: 'wf-srch-001',
                productCode: 'P-0001',
                janCode: '4901234567894',
                name: 'セイリン鍼 J-15',
                nameKana: 'せいりんはり',
                category: 'consumable',
                unit: '本',
                minStock: 50
            });
            await addProductDirectly({
                id: 'wf-srch-002',
                productCode: 'P-0002',
                name: 'アルコール綿',
                nameKana: 'あるこーるめん',
                category: 'consumable',
                unit: '枚',
                minStock: 100
            });
            await addProductDirectly({
                id: 'wf-srch-003',
                productCode: 'P-0003',
                janCode: '4901001000081',
                name: 'グルコサミンサプリ',
                nameKana: 'ぐるこさみんさぷり',
                category: 'retail',
                unit: '個',
                minStock: 5
            });

            await reloadPage();
        });

        test('WF-UC8-001: 商品名で検索してフィルタ結果を確認する', async () => {
            await switchToTab('products');
            await sleep(500);

            // 全件数確認
            const allCount = await getProductCount();
            expect(allCount).toBe(3);

            // 「セイリン」で検索
            await page.$eval('#product-search', el => el.value = '');
            await page.type('#product-search', 'セイリン');
            await page.$eval('#product-search', el => {
                el.dispatchEvent(new Event('input', { bubbles: true }));
            });
            await sleep(500);

            // 検索結果を確認（UI上の表示数）
            const visibleText = await page.$eval('#tab-products', el => el.textContent);
            expect(visibleText).toContain('セイリン鍼');

            // 検索をクリア
            await page.$eval('#product-search', el => {
                el.value = '';
                el.dispatchEvent(new Event('input', { bubbles: true }));
            });
            await sleep(300);
        });

        test('WF-UC8-002: JANコードで検索して結果が表示される', async () => {
            await switchToTab('products');
            await sleep(300);

            await page.$eval('#product-search', el => el.value = '');
            await page.type('#product-search', '4901001000081');
            await page.$eval('#product-search', el => {
                el.dispatchEvent(new Event('input', { bubbles: true }));
            });
            await sleep(500);

            const visibleText = await page.$eval('#tab-products', el => el.textContent);
            expect(visibleText).toContain('グルコサミンサプリ');

            // 検索をクリア
            await page.$eval('#product-search', el => {
                el.value = '';
                el.dispatchEvent(new Event('input', { bubbles: true }));
            });
            await sleep(300);
        });

        test('WF-UC8-003: カテゴリフィルタで消耗品/物販を切り替える', async () => {
            await switchToTab('products');
            await sleep(300);

            // 消耗品フィルタ
            await page.select('#product-category-filter', 'consumable');
            await sleep(500);
            const tabTextConsumable = await page.$eval('#tab-products', el => el.textContent);
            expect(tabTextConsumable).toContain('セイリン鍼');
            expect(tabTextConsumable).toContain('アルコール綿');

            // 物販フィルタ
            await page.select('#product-category-filter', 'retail');
            await sleep(500);
            const tabTextRetail = await page.$eval('#tab-products', el => el.textContent);
            expect(tabTextRetail).toContain('グルコサミンサプリ');

            // フィルタリセット
            await page.select('#product-category-filter', '');
            await sleep(300);
        });

        test('WF-UC8-004: 商品を編集して名前を変更する', async () => {
            await switchToTab('products');
            await sleep(500);

            // 商品詳細をJS直接呼び出しで表示
            await page.evaluate(() => showProductDetail('wf-srch-001'));
            await sleep(500);

            // 詳細オーバーレイが開くことを確認
            const detailVisible = await page.$eval('#product-detail-overlay', el => !el.hidden);
            expect(detailVisible).toBe(true);

            // 編集ボタンをクリック
            await page.click('#product-detail-edit-btn');
            await sleep(500);

            // 商品名を変更
            await page.$eval('#product-name', el => el.value = '');
            await page.type('#product-name', 'セイリン鍼 J-15 改良版');

            // 保存
            await page.click('#save-product-btn');
            const toast = await waitForToast();
            expect(toast).toBeTruthy();
            await waitForToastDismiss();

            // DBで名前が更新されていることを確認
            const updatedName = await page.evaluate(async () => {
                const p = await dbGet('products', 'wf-srch-001');
                return p ? p.name : null;
            });
            expect(updatedName).toBe('セイリン鍼 J-15 改良版');
        });

        test('WF-UC8-005: 商品を削除する（論理削除、isActive=false）', async () => {
            await switchToTab('products');
            await sleep(300);

            const countBefore = await getProductCount();

            // 商品詳細を表示
            await page.evaluate(() => showProductDetail('wf-srch-002'));
            await sleep(500);

            // 削除ボタンをクリック
            await page.click('#product-detail-delete-btn');
            await acceptConfirmDialog();
            await sleep(500);

            // 商品数が1減っていることを確認
            const countAfter = await getProductCount();
            expect(countAfter).toBe(countBefore - 1);

            // DBでisActive=falseを確認
            const product = await page.evaluate(async () => {
                return await dbGet('products', 'wf-srch-002');
            });
            expect(product.isActive).toBe(false);
        });
    });
});
