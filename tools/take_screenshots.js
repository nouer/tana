#!/usr/bin/env node
/**
 * take_screenshots.js
 *
 * Tanaアプリの各画面のスクリーンショットを撮影し docs/images/ に保存する。
 * 前提: アプリが http://localhost:8088 (またはTANA_URL環境変数) で起動していること。
 *
 * 使い方: node tools/take_screenshots.js
 */

'use strict';

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const BASE_URL = process.env.TANA_URL || 'http://localhost:8088';
const OUTPUT_DIR = path.join(__dirname, '..', 'docs', 'images');
const SAMPLE_DATA_PATH = path.join(__dirname, '..', 'local_app', 'sample_data.json');

// デスクトップ / モバイル ビューポート
const DESKTOP = { width: 1280, height: 800 };
const MOBILE  = { width: 375, height: 812 };

/**
 * タブをクリックして表示されるまで待つ
 */
async function switchTab(page, tabName) {
    await page.click(`button.tab-btn[data-tab="${tabName}"]`);
    await page.waitForSelector(`#tab-${tabName}:not([hidden])`, { timeout: 5000 });
    // レンダリング完了を待つ
    await page.waitForTimeout(500);
}

/**
 * サブタブをクリックして表示されるまで待つ
 */
async function switchSubTab(page, subtabName) {
    await page.click(`button.sub-tab-btn[data-subtab="${subtabName}"]`);
    await page.waitForSelector(`#subtab-${subtabName}:not([hidden])`, { timeout: 5000 });
    await page.waitForTimeout(300);
}

/**
 * サンプルデータをアプリに読み込む (IndexedDB経由)
 */
async function loadSampleData(page) {
    const sampleData = JSON.parse(fs.readFileSync(SAMPLE_DATA_PATH, 'utf-8'));

    // ページ内でサンプルデータを読み込むボタンを押す代わりに、
    // IndexedDBに直接データを投入する
    await page.evaluate(async (data) => {
        // script.js が公開している db ヘルパー関数を利用
        // dbAdd / dbUpdate が存在するか確認
        if (typeof dbUpdate !== 'function' || typeof dbAdd !== 'function') {
            throw new Error('dbUpdate/dbAdd が定義されていません。アプリの読み込みを待ってください。');
        }

        // 商品
        if (data.products) {
            for (const p of data.products) {
                try { await dbAdd('products', p); } catch (_) { await dbUpdate('products', p); }
            }
        }

        // 取引
        if (data.stock_transactions) {
            for (const tx of data.stock_transactions) {
                try { await dbAdd('stock_transactions', tx); } catch (_) { await dbUpdate('stock_transactions', tx); }
            }
        }

        // 棚卸
        if (data.inventory_counts) {
            for (const ic of data.inventory_counts) {
                try { await dbAdd('inventory_counts', ic); } catch (_) { await dbUpdate('inventory_counts', ic); }
            }
        }

        // 設定
        if (data.settings) {
            for (const s of data.settings) {
                await dbUpdate('app_settings', s);
            }
        }
    }, sampleData);

    // データ読み込み後、ダッシュボードを再描画
    await page.evaluate(() => {
        if (typeof switchTab === 'function') {
            switchTab('dashboard');
        }
    });
    await page.waitForTimeout(800);
}

async function takeScreenshots() {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
        const page = await browser.newPage();

        // デスクトップビューポート
        await page.setViewport(DESKTOP);

        // アプリに遷移
        console.log(`アプリに接続中: ${BASE_URL}`);
        await page.goto(BASE_URL, { waitUntil: 'networkidle0', timeout: 30000 });
        console.log('ページ読み込み完了');

        // サンプルデータを投入
        console.log('サンプルデータを読み込み中...');
        await loadSampleData(page);
        console.log('サンプルデータ読み込み完了');

        // --- 01: ダッシュボード ---
        await switchTab(page, 'dashboard');
        await page.screenshot({ path: path.join(OUTPUT_DIR, '01_dashboard.png'), fullPage: false });
        console.log('01_dashboard.png を保存しました');

        // --- 02: 商品一覧 ---
        await switchTab(page, 'products');
        await page.screenshot({ path: path.join(OUTPUT_DIR, '02_products.png'), fullPage: false });
        console.log('02_products.png を保存しました');

        // --- 03: 入出庫 ---
        await switchTab(page, 'transactions');
        await page.screenshot({ path: path.join(OUTPUT_DIR, '03_transactions.png'), fullPage: false });
        console.log('03_transactions.png を保存しました');

        // --- 04: 棚卸 ---
        await switchTab(page, 'inventory');
        await page.screenshot({ path: path.join(OUTPUT_DIR, '04_inventory.png'), fullPage: false });
        console.log('04_inventory.png を保存しました');

        // --- 05: ダッシュボード アラート表示 ---
        await switchTab(page, 'dashboard');
        // アラートセクションが見えるようにスクロール
        await page.evaluate(() => {
            const el = document.getElementById('low-stock-alerts');
            if (el) el.scrollIntoView({ behavior: 'instant' });
        });
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(OUTPUT_DIR, '05_dashboard_alerts.png'), fullPage: false });
        console.log('05_dashboard_alerts.png を保存しました');

        // --- 06: モバイルビュー ---
        await page.setViewport(MOBILE);
        await switchTab(page, 'dashboard');
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(OUTPUT_DIR, '06_mobile.png'), fullPage: false });
        console.log('06_mobile.png を保存しました');

        // デスクトップに戻す
        await page.setViewport(DESKTOP);

        // --- 07: 商品追加フォーム ---
        await switchTab(page, 'products');
        await page.click('#add-product-btn');
        await page.waitForSelector('#product-form-overlay:not([hidden])', { timeout: 5000 });
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(OUTPUT_DIR, '07_product_form.png'), fullPage: false });
        console.log('07_product_form.png を保存しました');

        // フォームを閉じる
        await page.click('#product-form-overlay .overlay-close-btn');
        await page.waitForTimeout(200);

        // --- 08: レポート ---
        await switchTab(page, 'reports');
        await page.screenshot({ path: path.join(OUTPUT_DIR, '08_reports.png'), fullPage: false });
        console.log('08_reports.png を保存しました');

        // --- 09: 設定 ---
        await switchTab(page, 'settings');
        await page.screenshot({ path: path.join(OUTPUT_DIR, '09_settings.png'), fullPage: false });
        console.log('09_settings.png を保存しました');

        console.log(`\n全スクリーンショットを ${OUTPUT_DIR} に保存しました。`);

    } finally {
        await browser.close();
    }
}

takeScreenshots().catch((err) => {
    console.error('スクリーンショット撮影に失敗しました:', err);
    process.exit(1);
});
