// =============================================================================
// Tana Inventory Management App - Main Application JavaScript
// =============================================================================
// Vanilla JS SPA: IndexedDB, UI interactions, tab switching, overlays
// Pure calculation functions are in tana.calc.js (accessed as window.TanaCalc)
// =============================================================================

'use strict';

// =============================================================================
// 1. Utilities
// =============================================================================

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

async function hashString(str) {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// =============================================================================
// 2. Global State
// =============================================================================

let db = null;
let currentTab = 'dashboard';
let currentSubTab = {};
let editingProductId = null;
let activeCountId = null;
let scanCallback = null;
let confirmResolve = null;

// =============================================================================
// 3. IndexedDB Setup
// =============================================================================

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('TanaDB', 1);
        request.onupgradeneeded = (e) => {
            const database = e.target.result;
            // products store
            if (!database.objectStoreNames.contains('products')) {
                const store = database.createObjectStore('products', { keyPath: 'id' });
                store.createIndex('productCode', 'productCode', { unique: true });
                store.createIndex('janCode', 'janCode', { unique: false });
                store.createIndex('name', 'name', { unique: false });
                store.createIndex('nameKana', 'nameKana', { unique: false });
                store.createIndex('category', 'category', { unique: false });
                store.createIndex('isActive', 'isActive', { unique: false });
            }
            // stock_transactions store
            if (!database.objectStoreNames.contains('stock_transactions')) {
                const store = database.createObjectStore('stock_transactions', { keyPath: 'id' });
                store.createIndex('productId', 'productId', { unique: false });
                store.createIndex('transactionType', 'transactionType', { unique: false });
                store.createIndex('date', 'date', { unique: false });
                store.createIndex('lotNumber', 'lotNumber', { unique: false });
                store.createIndex('expiryDate', 'expiryDate', { unique: false });
            }
            // inventory_counts store
            if (!database.objectStoreNames.contains('inventory_counts')) {
                const store = database.createObjectStore('inventory_counts', { keyPath: 'id' });
                store.createIndex('countDate', 'countDate', { unique: false });
                store.createIndex('status', 'status', { unique: false });
            }
            // app_settings store
            if (!database.objectStoreNames.contains('app_settings')) {
                database.createObjectStore('app_settings', { keyPath: 'id' });
            }
        };
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e.target.error);
    });
}

// =============================================================================
// 4. Generic CRUD Helpers
// =============================================================================

function dbAdd(storeName, data) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const request = store.add(data);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function dbUpdate(storeName, data) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const request = store.put(data);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function dbGet(storeName, id) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
    });
}

function dbGetAll(storeName) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
}

function dbDelete(storeName, id) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

function dbClear(storeName) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

function dbGetByIndex(storeName, indexName, value) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const index = store.index(indexName);
        const request = index.getAll(value);
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
}

// =============================================================================
// 5. Settings Helpers
// =============================================================================

async function getSetting(key) {
    const record = await dbGet('app_settings', key);
    return record ? record.value : null;
}

async function saveSetting(key, value) {
    await dbUpdate('app_settings', { id: key, value: value });
}

// =============================================================================
// 6. Toast Notifications
// =============================================================================

function showToast(message, type = 'info', duration = 3000) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.className = 'toast-show ' + type;
    setTimeout(() => {
        toast.className = '';
    }, duration);
}

// =============================================================================
// 7. Confirm Dialog
// =============================================================================

function showConfirm(message) {
    return new Promise((resolve) => {
        const dialog = document.getElementById('confirm-dialog');
        const messageEl = document.getElementById('confirm-message');
        const okBtn = document.getElementById('confirm-ok-btn');
        const cancelBtn = document.getElementById('confirm-cancel-btn');

        if (!dialog || !messageEl) {
            resolve(window.confirm(message));
            return;
        }

        messageEl.textContent = message;
        dialog.hidden = false;

        confirmResolve = resolve;

        const handleOk = () => {
            cleanup();
            dialog.hidden = true;
            resolve(true);
        };

        const handleCancel = () => {
            cleanup();
            dialog.hidden = true;
            resolve(false);
        };

        function cleanup() {
            okBtn.removeEventListener('click', handleOk);
            cancelBtn.removeEventListener('click', handleCancel);
            confirmResolve = null;
        }

        okBtn.addEventListener('click', handleOk);
        cancelBtn.addEventListener('click', handleCancel);
    });
}

// =============================================================================
// 8. Tab Switching
// =============================================================================

function switchTab(tabName) {
    currentTab = tabName;

    // Hide all tab contents
    document.querySelectorAll('.tab-content').forEach(el => {
        el.hidden = true;
    });

    // Show target tab
    const targetTab = document.getElementById('tab-' + tabName);
    if (targetTab) {
        targetTab.hidden = false;
    }

    // Update nav button active states
    document.querySelectorAll('#main-tab-nav button').forEach(btn => {
        if (btn.dataset.tab === tabName) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // Load tab data
    switch (tabName) {
        case 'dashboard':
            loadDashboard();
            break;
        case 'products':
            loadProducts();
            break;
        case 'transactions':
            loadTransactionTab();
            break;
        case 'inventory':
            loadInventoryTab();
            break;
        case 'reports':
            loadReports(currentSubTab['reports'] || 'report-stock');
            break;
        case 'settings':
            loadSettings();
            break;
    }

    // Update URL without reload
    const url = new URL(window.location);
    url.searchParams.set('tab', tabName);
    window.history.replaceState({}, '', url);
}

function switchSubTab(parentTab, subTabName) {
    currentSubTab[parentTab] = subTabName;

    // Hide all sub-tab contents within the parent tab
    const parentEl = document.getElementById('tab-' + parentTab);
    if (parentEl) {
        parentEl.querySelectorAll('.subtab-content').forEach(el => {
            el.hidden = true;
        });

        // Show target sub-tab
        const targetSubTab = parentEl.querySelector('#subtab-' + subTabName);
        if (targetSubTab) {
            targetSubTab.hidden = false;
        }

        // Update sub-tab button active states
        parentEl.querySelectorAll('.sub-tab-nav button').forEach(btn => {
            if (btn.dataset.subtab === subTabName) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    // Load sub-tab data (only when called directly, not from loadReports/loadTransactionTab)
    if (parentTab === 'reports' && !switchSubTab._loading) {
        switchSubTab._loading = true;
        loadReports(subTabName).finally(() => { switchSubTab._loading = false; });
    }
}

// =============================================================================
// 9. Product Management
// =============================================================================

async function loadProducts() {
    const products = await dbGetAll('products');
    const activeProducts = products.filter(p => p.isActive !== false);
    const transactions = await dbGetAll('stock_transactions');

    // Get search and filter values
    const searchInput = document.getElementById('product-search');
    const categoryFilter = document.getElementById('product-category-filter');
    const searchQuery = searchInput ? searchInput.value.trim().toLowerCase() : '';
    const categoryValue = categoryFilter ? categoryFilter.value : '';

    // Calculate stock for each product
    const stockMap = {};
    transactions.forEach(tx => {
        if (!stockMap[tx.productId]) stockMap[tx.productId] = 0;
        stockMap[tx.productId] += tx.quantity;
    });

    // Apply filters
    let filtered = activeProducts;
    if (searchQuery) {
        filtered = filtered.filter(p =>
            (p.name && p.name.toLowerCase().includes(searchQuery)) ||
            (p.nameKana && p.nameKana.toLowerCase().includes(searchQuery)) ||
            (p.productCode && p.productCode.toLowerCase().includes(searchQuery)) ||
            (p.janCode && p.janCode.toLowerCase().includes(searchQuery))
        );
    }
    if (categoryValue) {
        filtered = filtered.filter(p => p.category === categoryValue);
    }

    // Update category filter options
    if (categoryFilter) {
        const categories = [...new Set(activeProducts.map(p => p.category).filter(Boolean))];
        const currentValue = categoryFilter.value;
        categoryFilter.innerHTML = '<option value="">全カテゴリ</option>';
        categories.sort().forEach(cat => {
            const option = document.createElement('option');
            option.value = cat;
            option.textContent = cat;
            categoryFilter.appendChild(option);
        });
        categoryFilter.value = currentValue;
    }

    // Render product list
    const listEl = document.getElementById('product-list');
    if (!listEl) return;

    if (filtered.length === 0) {
        listEl.innerHTML = '<div class="empty-state"><p>商品が見つかりません</p></div>';
        return;
    }

    // Sort by name
    filtered.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ja'));

    let html = '';
    filtered.forEach(product => {
        const stock = stockMap[product.id] || 0;
        html += renderProductCard(product, stock);
    });
    listEl.innerHTML = html;

    // Update product count
    const countEl = document.getElementById('product-count');
    if (countEl) {
        countEl.textContent = filtered.length + ' 件';
    }
}

function renderProductCard(product, stock) {
    const TanaCalc = window.TanaCalc;
    const esc = TanaCalc ? TanaCalc.escapeHtml : (s) => s;

    const name = esc(product.name || '');
    const category = esc(product.category || '');
    const code = esc(product.productCode || '');
    const unit = esc(product.unit || '');
    const minStock = product.minStock || 0;

    let stockClass = 'stock-normal';
    if (stock <= 0) {
        stockClass = 'stock-zero';
    } else if (stock <= minStock) {
        stockClass = 'stock-low';
    }

    const photoHtml = product.photo
        ? '<img src="' + product.photo + '" alt="' + name + '" class="product-thumb" />'
        : '<div class="product-thumb product-thumb-placeholder"></div>';

    return '<div class="product-card" data-id="' + product.id + '" onclick="showProductDetail(\'' + product.id + '\')">'
        + '<div class="product-card-photo">' + photoHtml + '</div>'
        + '<div class="product-card-info">'
        + '<div class="product-card-name">' + name + '</div>'
        + (category ? '<span class="category-badge">' + category + '</span>' : '')
        + '<div class="product-card-code">' + code + '</div>'
        + '</div>'
        + '<div class="product-card-stock">'
        + '<span class="stock-badge ' + stockClass + '">' + stock + ' ' + unit + '</span>'
        + '</div>'
        + '</div>';
}

function openProductForm(productId) {
    editingProductId = productId || null;

    const overlay = document.getElementById('product-form-overlay');
    const titleEl = document.getElementById('product-form-title');
    const form = document.getElementById('product-form');

    if (!overlay || !form) return;

    // Reset form
    form.reset();
    clearPhoto();

    if (editingProductId) {
        // Edit mode: load product data
        titleEl.textContent = '商品編集';
        dbGet('products', editingProductId).then(product => {
            if (!product) return;
            const setVal = (id, val) => {
                const el = document.getElementById(id);
                if (el) el.value = val || '';
            };
            setVal('product-code', product.productCode);
            setVal('product-name', product.name);
            setVal('product-name-kana', product.nameKana);
            setVal('product-jan-code', product.janCode);
            setVal('product-category', product.category);
            setVal('product-unit', product.unit);
            setVal('product-min-stock', product.minStock);
            setVal('product-description', product.description);
            setVal('product-supplier', product.supplier);
            setVal('product-price', product.price);

            const trackExpiryEl = document.getElementById('product-track-expiry');
            if (trackExpiryEl) trackExpiryEl.checked = product.trackExpiry || false;

            // Show photo preview if exists
            if (product.photo) {
                const preview = document.getElementById('photo-preview');
                if (preview) {
                    preview.src = product.photo;
                    preview.hidden = false;
                }
                const clearBtn = document.getElementById('clear-photo-btn');
                if (clearBtn) clearBtn.hidden = false;
            }

            // Make product code field read-only in edit mode
            const codeField = document.getElementById('product-code');
            if (codeField) codeField.readOnly = true;
        });
    } else {
        // New mode: auto-generate product code
        titleEl.textContent = '商品登録';
        const codeField = document.getElementById('product-code');
        if (codeField) {
            codeField.value = 'P' + Date.now().toString().slice(-8);
            codeField.readOnly = false;
        }
    }

    overlay.hidden = false;
}

function closeProductForm() {
    const overlay = document.getElementById('product-form-overlay');
    if (overlay) overlay.hidden = true;
    editingProductId = null;
}

async function saveProduct() {
    const TanaCalc = window.TanaCalc;

    const getValue = (id) => {
        const el = document.getElementById(id);
        return el ? el.value.trim() : '';
    };

    const productData = {
        productCode: getValue('product-code'),
        name: getValue('product-name'),
        nameKana: getValue('product-name-kana'),
        janCode: getValue('product-jan-code'),
        category: getValue('product-category'),
        unit: getValue('product-unit') || '個',
        minStock: parseInt(getValue('product-min-stock')) || 0,
        description: getValue('product-description'),
        supplier: getValue('product-supplier'),
        price: parseFloat(getValue('product-price')) || 0,
        trackExpiry: document.getElementById('product-track-expiry')
            ? document.getElementById('product-track-expiry').checked
            : false,
        isActive: true,
    };

    // Validate
    if (TanaCalc && TanaCalc.validateProduct) {
        const result = TanaCalc.validateProduct(productData);
        if (result && !result.valid) {
            showToast(result.errors[0], 'error');
            return;
        }
    }

    // Process photo
    const preview = document.getElementById('photo-preview');
    if (preview && preview.src && !preview.hidden) {
        productData.photo = preview.src;
    } else {
        productData.photo = '';
    }

    try {
        if (editingProductId) {
            // Update existing product
            const existing = await dbGet('products', editingProductId);
            if (existing) {
                Object.assign(existing, productData);
                existing.updatedAt = new Date().toISOString();
                await dbUpdate('products', existing);
                showToast('商品を更新しました', 'success');
            }
        } else {
            // Add new product
            productData.id = generateId();
            productData.createdAt = new Date().toISOString();
            productData.updatedAt = new Date().toISOString();
            await dbAdd('products', productData);
            showToast('商品を登録しました', 'success');
        }

        closeProductForm();
        await loadProducts();
        // Rebuild transaction product dropdowns if on transaction tab
        if (currentTab === 'transactions') {
            await populateProductDropdowns();
        }
    } catch (err) {
        console.error('Failed to save product:', err);
        if (err.name === 'ConstraintError') {
            showToast('その商品コードは既に使用されています', 'error');
        } else {
            showToast('保存に失敗しました', 'error');
        }
    }
}

async function showProductDetail(productId) {
    const product = await dbGet('products', productId);
    if (!product) {
        showToast('商品が見つかりません', 'error');
        return;
    }

    const TanaCalc = window.TanaCalc;
    const esc = TanaCalc ? TanaCalc.escapeHtml : (s) => s;

    // Calculate current stock
    const transactions = await dbGetByIndex('stock_transactions', 'productId', productId);
    const stock = transactions.reduce((sum, tx) => sum + tx.quantity, 0);

    const overlay = document.getElementById('product-detail-overlay');
    const content = document.getElementById('product-detail-info');
    if (!overlay || !content) return;

    const photoHtml = product.photo
        ? '<img src="' + product.photo + '" alt="' + esc(product.name) + '" class="product-detail-photo" />'
        : '<div class="product-detail-photo product-thumb-placeholder"></div>';

    const minStock = product.minStock || 0;
    let stockClass = 'stock-normal';
    if (stock <= 0) {
        stockClass = 'stock-zero';
    } else if (stock <= minStock) {
        stockClass = 'stock-low';
    }

    let html = '<div class="product-detail">'
        + photoHtml
        + '<h2>' + esc(product.name) + '</h2>'
        + (product.nameKana ? '<p class="detail-kana">' + esc(product.nameKana) + '</p>' : '')
        + '<div class="detail-stock">'
        + '<span class="stock-badge ' + stockClass + '">在庫: ' + stock + ' ' + esc(product.unit || '個') + '</span>'
        + '</div>'
        + '<table class="detail-table">'
        + '<tr><th>商品コード</th><td>' + esc(product.productCode || '') + '</td></tr>'
        + '<tr><th>JANコード</th><td>' + esc(product.janCode || '') + '</td></tr>'
        + '<tr><th>カテゴリ</th><td>' + esc(product.category || '') + '</td></tr>'
        + '<tr><th>単位</th><td>' + esc(product.unit || '個') + '</td></tr>'
        + '<tr><th>最低在庫数</th><td>' + minStock + '</td></tr>'
        + '<tr><th>仕入先</th><td>' + esc(product.supplier || '') + '</td></tr>'
        + '<tr><th>単価</th><td>' + (product.price ? product.price.toLocaleString() + ' 円' : '-') + '</td></tr>'
        + '<tr><th>期限管理</th><td>' + (product.trackExpiry ? 'あり' : 'なし') + '</td></tr>'
        + '<tr><th>備考</th><td>' + esc(product.description || '') + '</td></tr>'
        + '</table>'
        + '<div class="detail-actions">'
        + '<button class="btn btn-primary" onclick="openProductForm(\'' + product.id + '\'); closeProductDetail();">編集</button>'
        + '<button class="btn btn-danger" onclick="deleteProduct(\'' + product.id + '\')">削除</button>'
        + '</div>'
        + '</div>';

    content.innerHTML = html;
    overlay.hidden = false;
}

function closeProductDetail() {
    const overlay = document.getElementById('product-detail-overlay');
    if (overlay) overlay.hidden = true;
}

async function deleteProduct(productId) {
    const confirmed = await showConfirm('この商品を削除しますか？（在庫データは保持されます）');
    if (!confirmed) return;

    const product = await dbGet('products', productId);
    if (product) {
        product.isActive = false;
        product.updatedAt = new Date().toISOString();
        await dbUpdate('products', product);
        showToast('商品を削除しました', 'success');
        closeProductDetail();
        await loadProducts();
    }
}

// Photo handling
function handlePhotoInput(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            // Compress image
            const canvas = document.createElement('canvas');
            const maxWidth = 400;
            let width = img.width;
            let height = img.height;

            if (width > maxWidth) {
                height = Math.round((height * maxWidth) / width);
                width = maxWidth;
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            const compressed = canvas.toDataURL('image/jpeg', 0.6);

            // Display preview
            const preview = document.getElementById('photo-preview');
            if (preview) {
                preview.src = compressed;
                preview.hidden = false;
            }
            const clearBtn = document.getElementById('clear-photo-btn');
            if (clearBtn) clearBtn.hidden = false;
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function clearPhoto() {
    const preview = document.getElementById('photo-preview');
    if (preview) {
        preview.src = '';
        preview.hidden = true;
    }
    const clearBtn = document.getElementById('clear-photo-btn');
    if (clearBtn) clearBtn.hidden = true;
    const fileInput = document.getElementById('photo-input');
    if (fileInput) fileInput.value = '';
}

function filterProducts() {
    loadProducts();
}

// =============================================================================
// 10. Barcode Scanning
// =============================================================================

let html5QrcodeScanner = null;
let lastScanCode = '';
let lastScanTime = 0;

function openScanner(callback) {
    const overlay = document.getElementById('scan-overlay');
    if (!overlay) return;

    scanCallback = callback;
    overlay.hidden = false;

    const scannerEl = document.getElementById('scan-reader');
    if (!scannerEl) return;

    if (typeof Html5Qrcode === 'undefined') {
        showToast('スキャナーライブラリが読み込まれていません', 'error');
        return;
    }

    if (!html5QrcodeScanner) {
        html5QrcodeScanner = new Html5Qrcode('scan-reader');
    }

    html5QrcodeScanner.start(
        { facingMode: 'environment' },
        {
            fps: 10,
            qrbox: { width: 250, height: 150 },
        },
        onScanSuccess,
        (errorMessage) => {
            // Scan error - ignore, keep scanning
        }
    ).catch(err => {
        console.error('Scanner start failed:', err);
        showToast('カメラの起動に失敗しました', 'error');
    });
}

function closeScanner() {
    const overlay = document.getElementById('scan-overlay');
    if (overlay) overlay.hidden = true;

    if (html5QrcodeScanner) {
        html5QrcodeScanner.stop().catch(() => {});
    }
    scanCallback = null;
}

function onScanSuccess(decodedText) {
    const now = Date.now();

    // Debounce: skip if same code within 2 seconds
    if (decodedText === lastScanCode && (now - lastScanTime) < 2000) {
        return;
    }

    lastScanCode = decodedText;
    lastScanTime = now;

    const TanaCalc = window.TanaCalc;

    // Validate JAN code
    if (TanaCalc && TanaCalc.validateJanCode) {
        const result = TanaCalc.validateJanCode(decodedText);
        if (result && !result.valid) {
            showToast('無効なバーコードです: ' + decodedText, 'error');
            return;
        }
    }

    // Play scan sound if enabled
    playScanSound();

    // Call callback
    if (scanCallback) {
        scanCallback(decodedText);
    }

    closeScanner();
}

function playScanSound() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.frequency.value = 1000;
        oscillator.type = 'sine';
        gainNode.gain.value = 0.1;
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.1);
    } catch (e) {
        // Sound not available
    }
}

async function lookupByBarcode(code) {
    const products = await dbGetByIndex('products', 'janCode', code);
    const active = products.filter(p => p.isActive !== false);
    return active.length > 0 ? active[0] : null;
}

// =============================================================================
// 11. Transaction Management
// =============================================================================

async function loadTransactionTab() {
    await populateProductDropdowns();

    // Set default dates to today
    const today = getTodayString();
    const dateInputs = [
        'receive-date',
        'use-date',
        'sell-date',
    ];
    dateInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el && !el.value) el.value = today;
    });

    // Set default sub-tab
    if (!currentSubTab['transactions']) {
        currentSubTab['transactions'] = 'receive';
    }
    switchSubTab('transactions', currentSubTab['transactions']);
}

function getTodayString() {
    const d = new Date();
    return d.getFullYear() + '-'
        + String(d.getMonth() + 1).padStart(2, '0') + '-'
        + String(d.getDate()).padStart(2, '0');
}

async function populateProductDropdowns() {
    const products = await dbGetAll('products');
    const activeProducts = products.filter(p => p.isActive !== false);
    activeProducts.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ja'));

    const TanaCalc = window.TanaCalc;
    const esc = TanaCalc ? TanaCalc.escapeHtml : (s) => s;

    const dropdowns = [
        'receive-product',
        'use-product',
        'sell-product',
    ];

    dropdowns.forEach(id => {
        const select = document.getElementById(id);
        if (!select) return;

        const currentValue = select.value;
        select.innerHTML = '<option value="">商品を選択</option>';

        activeProducts.forEach(p => {
            const option = document.createElement('option');
            option.value = p.id;
            option.textContent = p.name + ' (' + p.productCode + ')';
            select.appendChild(option);
        });

        if (currentValue) select.value = currentValue;
    });
}

async function saveTransaction(type) {
    const TanaCalc = window.TanaCalc;

    const prefix = type;
    const getValue = (suffix) => {
        const el = document.getElementById(prefix + '-' + suffix);
        return el ? el.value.trim() : '';
    };

    const productId = getValue('product');
    const dateStr = getValue('date');
    const quantityStr = getValue('quantity');
    const lotNumber = getValue('lot-number');
    const expiryDate = getValue('expiry-date');
    const unitCostStr = getValue('unit-cost');
    const notes = getValue('notes');

    if (!productId) {
        showToast('商品を選択してください', 'error');
        return;
    }

    let quantity = parseInt(quantityStr);
    if (isNaN(quantity) || quantity <= 0) {
        showToast('数量を正しく入力してください', 'error');
        return;
    }

    // For use and sell, store quantity as negative
    if (type === 'use' || type === 'sell') {
        quantity = -Math.abs(quantity);
    }

    const transaction = {
        id: generateId(),
        productId: productId,
        transactionType: type,
        quantity: quantity,
        date: dateStr || getTodayString(),
        lotNumber: lotNumber || '',
        expiryDate: expiryDate || '',
        unitCost: unitCostStr ? parseInt(unitCostStr) : null,
        notes: notes || '',
        createdAt: new Date().toISOString(),
    };

    // Validate
    if (TanaCalc && TanaCalc.validateTransaction) {
        const result = TanaCalc.validateTransaction(transaction);
        if (result && !result.valid) {
            showToast(result.errors[0], 'error');
            return;
        }
    }

    // Check if use/sell would result in negative stock
    if (type === 'use' || type === 'sell') {
        const existingTx = await dbGetByIndex('stock_transactions', 'productId', productId);
        const currentStock = existingTx.reduce((sum, tx) => sum + tx.quantity, 0);
        if (currentStock + quantity < 0) {
            const confirmed = await showConfirm(
                '在庫がマイナスになります（現在: ' + currentStock + '）。続行しますか？'
            );
            if (!confirmed) return;
        }
    }

    try {
        await dbAdd('stock_transactions', transaction);

        const product = await dbGet('products', productId);
        const productName = product ? product.name : '';
        const typeLabel = type === 'receive' ? '入庫' : type === 'use' ? '使用' : '販売';
        showToast(productName + ' の' + typeLabel + 'を記録しました', 'success');

        // Clear form
        const form = document.getElementById(prefix + '-form');
        if (form) {
            form.reset();
            const dateInput = document.getElementById(prefix + '-date');
            if (dateInput) dateInput.value = getTodayString();
        }

        // Hide lot/expiry fields
        const lotFields = document.getElementById(prefix + '-lot-fields');
        if (lotFields) lotFields.hidden = true;

    } catch (err) {
        console.error('Failed to save transaction:', err);
        showToast('保存に失敗しました', 'error');
    }
}

async function loadTransactionHistory() {
    const transactions = await dbGetAll('stock_transactions');
    const products = await dbGetAll('products');

    const productMap = {};
    products.forEach(p => { productMap[p.id] = p; });

    // Get filter values
    const dateFromEl = document.getElementById('history-date-from');
    const dateToEl = document.getElementById('history-date-to');
    const productFilterEl = document.getElementById('history-product-filter');
    const typeFilterEl = document.getElementById('history-type-filter');

    const dateFrom = dateFromEl ? dateFromEl.value : '';
    const dateTo = dateToEl ? dateToEl.value : '';
    const productFilter = productFilterEl ? productFilterEl.value : '';
    const typeFilter = typeFilterEl ? typeFilterEl.value : '';

    // Populate product filter
    if (productFilterEl && productFilterEl.options.length <= 1) {
        const activeProducts = products.filter(p => p.isActive !== false);
        activeProducts.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ja'));
        productFilterEl.innerHTML = '<option value="">全商品</option>';
        activeProducts.forEach(p => {
            const option = document.createElement('option');
            option.value = p.id;
            option.textContent = p.name;
            productFilterEl.appendChild(option);
        });
        if (productFilter) productFilterEl.value = productFilter;
    }

    // Apply filters
    let filtered = transactions;
    if (dateFrom) {
        filtered = filtered.filter(tx => tx.date >= dateFrom);
    }
    if (dateTo) {
        filtered = filtered.filter(tx => tx.date <= dateTo);
    }
    if (productFilter) {
        filtered = filtered.filter(tx => tx.productId === productFilter);
    }
    if (typeFilter) {
        filtered = filtered.filter(tx => tx.transactionType === typeFilter);
    }

    // Sort by date descending, then by createdAt descending
    filtered.sort((a, b) => {
        if (a.date !== b.date) return b.date.localeCompare(a.date);
        return (b.createdAt || '').localeCompare(a.createdAt || '');
    });

    // Render
    const listEl = document.getElementById('transaction-list');
    if (!listEl) return;

    if (filtered.length === 0) {
        listEl.innerHTML = '<div class="empty-state"><p>取引履歴がありません</p></div>';
        return;
    }

    let html = '';
    filtered.forEach(tx => {
        const product = productMap[tx.productId];
        const productName = product ? product.name : '(削除された商品)';
        html += renderTransactionItem(tx, productName);
    });
    listEl.innerHTML = html;
}

function renderTransactionItem(transaction, productName) {
    const TanaCalc = window.TanaCalc;
    const esc = TanaCalc ? TanaCalc.escapeHtml : (s) => s;

    let typeLabel = '';
    let borderClass = '';
    switch (transaction.transactionType) {
        case 'receive':
            typeLabel = '入庫';
            borderClass = 'tx-receive';
            break;
        case 'use':
            typeLabel = '使用';
            borderClass = 'tx-use';
            break;
        case 'sell':
            typeLabel = '販売';
            borderClass = 'tx-sell';
            break;
        case 'adjust':
            typeLabel = '棚卸調整';
            borderClass = 'tx-adjust';
            break;
        case 'dispose':
            typeLabel = '廃棄';
            borderClass = 'tx-dispose';
            break;
        default:
            typeLabel = transaction.transactionType || '';
            borderClass = 'tx-other';
    }

    const displayQty = Math.abs(transaction.quantity);
    const sign = transaction.quantity >= 0 ? '+' : '-';
    const qtyClass = transaction.quantity >= 0 ? 'qty-plus' : 'qty-minus';

    let html = '<div class="transaction-item ' + borderClass + '">'
        + '<div class="tx-info">'
        + '<div class="tx-product-name">' + esc(productName) + '</div>'
        + '<div class="tx-meta">'
        + '<span class="tx-type-badge">' + typeLabel + '</span>'
        + '<span class="tx-date">' + esc(transaction.date) + '</span>'
        + '</div>';

    if (transaction.lotNumber) {
        html += '<div class="tx-lot">ロット: ' + esc(transaction.lotNumber) + '</div>';
    }
    if (transaction.expiryDate) {
        html += '<div class="tx-expiry">期限: ' + esc(transaction.expiryDate) + '</div>';
    }
    if (transaction.notes) {
        html += '<div class="tx-notes">' + esc(transaction.notes) + '</div>';
    }

    html += '</div>'
        + '<div class="tx-quantity ' + qtyClass + '">' + sign + displayQty + '</div>'
        + '</div>';

    return html;
}

function onTransactionProductChange(selectElement, type) {
    const productId = selectElement.value;
    const lotFields = document.getElementById(type + '-lot-fields');
    if (!lotFields) return;

    if (!productId) {
        lotFields.hidden = true;
        return;
    }

    dbGet('products', productId).then(product => {
        if (product && product.trackExpiry) {
            lotFields.hidden = false;
        } else {
            lotFields.hidden = true;
        }
    });
}

// =============================================================================
// 12. Inventory Count
// =============================================================================

async function loadInventoryTab() {
    // Check for active count
    const counts = await dbGetAll('inventory_counts');
    const activeCounts = counts.filter(c => c.status === 'in_progress');

    const activeSection = document.getElementById('active-count-section');
    const startSection = document.querySelector('.inventory-controls');
    const historySection = document.getElementById('count-history-list');

    if (activeCounts.length > 0) {
        // Resume active count
        activeCountId = activeCounts[0].id;
        const activeCount = activeCounts[0];

        if (startSection) startSection.hidden = true;
        if (activeSection) {
            activeSection.hidden = false;
            renderActiveCount(activeCount);
        }
    } else {
        activeCountId = null;
        if (activeSection) activeSection.hidden = true;
        if (startSection) startSection.hidden = false;
    }

    // Show history
    if (historySection) {
        const completedCounts = counts
            .filter(c => c.status === 'completed')
            .sort((a, b) => (b.countDate || '').localeCompare(a.countDate || ''));

        if (completedCounts.length === 0) {
            historySection.innerHTML = '<h3>棚卸履歴</h3><div class="empty-state"><p>履歴がありません</p></div>';
        } else {
            let html = '<h3>棚卸履歴</h3><div class="count-history-list">';
            completedCounts.forEach(count => {
                const itemCount = count.items ? count.items.length : 0;
                const varianceCount = count.items
                    ? count.items.filter(i => i.actualQuantity !== i.systemQuantity).length
                    : 0;
                html += '<div class="count-history-item">'
                    + '<div class="count-history-date">' + (count.countDate || '') + '</div>'
                    + '<div class="count-history-meta">'
                    + '<span>' + itemCount + ' 品目</span>'
                    + '<span>差異: ' + varianceCount + ' 件</span>'
                    + '</div>'
                    + '</div>';
            });
            html += '</div>';
            historySection.innerHTML = html;
        }
    }
}

async function startNewCount() {
    const products = await dbGetAll('products');
    const activeProducts = products.filter(p => p.isActive !== false);

    if (activeProducts.length === 0) {
        showToast('商品が登録されていません', 'error');
        return;
    }

    const transactions = await dbGetAll('stock_transactions');
    const stockMap = {};
    transactions.forEach(tx => {
        if (!stockMap[tx.productId]) stockMap[tx.productId] = 0;
        stockMap[tx.productId] += tx.quantity;
    });

    const items = activeProducts.map(p => ({
        productId: p.id,
        productName: p.name,
        productCode: p.productCode,
        photo: p.photo || '',
        unit: p.unit || '個',
        systemQuantity: stockMap[p.id] || 0,
        actualQuantity: null,
        status: 'uncounted',
    }));

    // Sort by name
    items.sort((a, b) => (a.productName || '').localeCompare(b.productName || '', 'ja'));

    const count = {
        id: generateId(),
        countDate: getTodayString(),
        status: 'in_progress',
        items: items,
        createdAt: new Date().toISOString(),
    };

    await dbAdd('inventory_counts', count);
    activeCountId = count.id;

    showToast('棚卸を開始しました（' + items.length + ' 品目）', 'info');
    await loadInventoryTab();
}

function renderActiveCount(count) {
    const container = document.getElementById('active-count-section');
    if (!container) return;

    const TanaCalc = window.TanaCalc;
    const esc = TanaCalc ? TanaCalc.escapeHtml : (s) => s;

    const items = count.items || [];
    const countedCount = items.filter(i => i.status === 'counted').length;
    const totalCount = items.length;
    const progress = totalCount > 0 ? Math.round((countedCount / totalCount) * 100) : 0;

    let html = '<div class="count-header">'
        + '<h3>棚卸実施中 - ' + esc(count.countDate) + '</h3>'
        + '<div class="count-progress">'
        + '<div class="progress-bar"><div class="progress-fill" style="width:' + progress + '%"></div></div>'
        + '<span>' + countedCount + ' / ' + totalCount + ' 完了 (' + progress + '%)</span>'
        + '</div>'
        + '</div>'
        + '<div class="count-items">';

    items.forEach((item, index) => {
        html += renderCountItem(item, index);
    });

    html += '</div>'
        + '<div class="count-actions">'
        + '<button class="btn btn-primary" onclick="completeCount()" '
        + (countedCount < totalCount ? 'disabled' : '') + '>棚卸完了</button>'
        + '<button class="btn btn-danger" onclick="cancelCount()">中止</button>'
        + '</div>';

    container.innerHTML = html;
}

function renderCountItem(item, index) {
    const TanaCalc = window.TanaCalc;
    const esc = TanaCalc ? TanaCalc.escapeHtml : (s) => s;

    const statusClass = item.status === 'counted' ? 'count-item-done' : 'count-item-pending';
    const actualDisplay = item.actualQuantity !== null ? item.actualQuantity : '-';

    let varianceHtml = '';
    if (item.status === 'counted' && item.actualQuantity !== item.systemQuantity) {
        const diff = item.actualQuantity - item.systemQuantity;
        const diffSign = diff > 0 ? '+' : '';
        varianceHtml = '<span class="count-variance">(差異: ' + diffSign + diff + ')</span>';
    }

    const photoHtml = item.photo
        ? '<img src="' + item.photo + '" alt="" class="count-item-photo" />'
        : '<div class="count-item-photo product-thumb-placeholder"></div>';

    return '<div class="count-item ' + statusClass + '" onclick="openNumpad(' + index + ')">'
        + '<div class="count-item-left">'
        + photoHtml
        + '<div class="count-item-info">'
        + '<div class="count-item-name">' + esc(item.productName) + '</div>'
        + '<div class="count-item-code">' + esc(item.productCode || '') + '</div>'
        + '</div>'
        + '</div>'
        + '<div class="count-item-right">'
        + '<div class="count-item-system">理論: ' + item.systemQuantity + ' ' + esc(item.unit) + '</div>'
        + '<div class="count-item-actual">実数: ' + actualDisplay + ' ' + esc(item.unit) + '</div>'
        + varianceHtml
        + '</div>'
        + '</div>';
}

let numpadValue = '';
let numpadIndex = -1;

function openNumpad(index) {
    const count = null; // Will fetch from DB
    dbGet('inventory_counts', activeCountId).then(activeCount => {
        if (!activeCount || !activeCount.items[index]) return;

        const item = activeCount.items[index];
        numpadIndex = index;
        numpadValue = item.actualQuantity !== null ? String(item.actualQuantity) : '';

        const overlay = document.getElementById('numpad-overlay');
        const productNameEl = document.getElementById('numpad-product-name');
        const systemQtyEl = document.getElementById('numpad-system-stock');
        const displayEl = document.getElementById('numpad-display');

        const TanaCalc = window.TanaCalc;
        const esc = TanaCalc ? TanaCalc.escapeHtml : (s) => s;

        if (productNameEl) productNameEl.textContent = item.productName;
        if (systemQtyEl) systemQtyEl.textContent = '理論在庫: ' + item.systemQuantity + ' ' + item.unit;
        if (displayEl) displayEl.textContent = numpadValue || '0';
        if (overlay) overlay.hidden = false;
    });
}

function closeNumpad() {
    const overlay = document.getElementById('numpad-overlay');
    if (overlay) overlay.hidden = true;
    numpadIndex = -1;
    numpadValue = '';
}

function numpadInput(value) {
    const displayEl = document.getElementById('numpad-display');

    if (value === 'C' || value === 'clear') {
        numpadValue = '';
    } else if (value === 'backspace') {
        numpadValue = numpadValue.slice(0, -1);
    } else {
        // Prevent leading zeros (except for "0" itself)
        if (numpadValue === '0' && value !== '.') {
            numpadValue = value;
        } else {
            numpadValue += value;
        }
    }

    if (displayEl) {
        displayEl.textContent = numpadValue || '0';
    }
}

async function confirmNumpad() {
    if (numpadIndex < 0 || !activeCountId) return;

    const qty = numpadValue === '' ? 0 : parseInt(numpadValue);
    if (isNaN(qty) || qty < 0) {
        showToast('正しい数量を入力してください', 'error');
        return;
    }

    const activeCount = await dbGet('inventory_counts', activeCountId);
    if (!activeCount || !activeCount.items[numpadIndex]) return;

    activeCount.items[numpadIndex].actualQuantity = qty;
    activeCount.items[numpadIndex].status = 'counted';

    await dbUpdate('inventory_counts', activeCount);

    closeNumpad();
    renderActiveCount(activeCount);
}

async function completeCount() {
    if (!activeCountId) return;

    const confirmed = await showConfirm('棚卸を完了しますか？差異がある商品は自動調整されます。');
    if (!confirmed) return;

    const activeCount = await dbGet('inventory_counts', activeCountId);
    if (!activeCount) return;

    const TanaCalc = window.TanaCalc;
    const items = activeCount.items || [];

    // Check that all items are counted
    const uncounted = items.filter(i => i.status !== 'counted');
    if (uncounted.length > 0) {
        showToast('未カウントの商品があります（' + uncounted.length + ' 件）', 'error');
        return;
    }

    // Generate variance report
    let varianceReport = null;
    if (TanaCalc && TanaCalc.buildVarianceReport) {
        varianceReport = TanaCalc.buildVarianceReport(items);
    }

    // Create adjustment transactions for discrepancies
    let adjustmentCount = 0;
    for (const item of items) {
        const diff = item.actualQuantity - item.systemQuantity;
        if (diff !== 0) {
            const adjustmentTx = {
                id: generateId(),
                productId: item.productId,
                transactionType: 'adjust',
                quantity: diff,
                date: activeCount.countDate,
                lotNumber: '',
                expiryDate: '',
                notes: '棚卸調整 (ID: ' + activeCount.id + ')',
                createdAt: new Date().toISOString(),
            };
            await dbAdd('stock_transactions', adjustmentTx);
            adjustmentCount++;
        }
    }

    // Update count status
    activeCount.status = 'completed';
    activeCount.completedAt = new Date().toISOString();
    activeCount.varianceReport = varianceReport;
    await dbUpdate('inventory_counts', activeCount);

    activeCountId = null;

    // Show summary
    const totalItems = items.length;
    const matchItems = items.filter(i => i.actualQuantity === i.systemQuantity).length;
    showToast('棚卸完了: ' + totalItems + ' 品目中 ' + matchItems + ' 品目一致、'
        + adjustmentCount + ' 件調整', 'success');

    await loadInventoryTab();
}

async function cancelCount() {
    if (!activeCountId) return;

    const confirmed = await showConfirm('棚卸を中止しますか？入力済みのデータは破棄されます。');
    if (!confirmed) return;

    await dbDelete('inventory_counts', activeCountId);
    activeCountId = null;
    showToast('棚卸を中止しました', 'info');
    await loadInventoryTab();
}

// =============================================================================
// 13. Dashboard
// =============================================================================

async function loadDashboard() {
    const TanaCalc = window.TanaCalc;
    const esc = TanaCalc ? TanaCalc.escapeHtml : (s) => s;

    const products = await dbGetAll('products');
    const activeProducts = products.filter(p => p.isActive !== false);
    const transactions = await dbGetAll('stock_transactions');

    // Calculate stock for each product
    const stockMap = {};
    transactions.forEach(tx => {
        if (!stockMap[tx.productId]) stockMap[tx.productId] = 0;
        stockMap[tx.productId] += tx.quantity;
    });

    // Build product stock info array
    const productStockInfo = activeProducts.map(p => ({
        ...p,
        currentStock: stockMap[p.id] || 0,
    }));

    // --- Summary Cards ---
    const totalProducts = activeProducts.length;
    const totalStock = Object.values(stockMap).reduce((a, b) => a + b, 0);
    const totalProductsEl = document.getElementById('dashboard-total-products');
    const totalStockEl = document.getElementById('dashboard-total-stock');
    if (totalProductsEl) totalProductsEl.textContent = totalProducts;
    if (totalStockEl) totalStockEl.textContent = totalStock;

    // --- Low Stock Alerts ---
    let lowStockAlerts = [];
    if (TanaCalc && TanaCalc.getLowStockAlerts) {
        const alertProducts = TanaCalc.getLowStockAlerts(activeProducts, stockMap);
        lowStockAlerts = alertProducts.map(p => ({
            ...p,
            currentStock: stockMap[p.id] || 0,
        }));
    } else {
        lowStockAlerts = productStockInfo.filter(p => p.currentStock < (p.minStock || 0));
    }

    const lowStockEl = document.getElementById('dashboard-low-stock');
    const lowStockCountEl = document.getElementById('dashboard-low-stock-count');
    if (lowStockCountEl) lowStockCountEl.textContent = lowStockAlerts.length;

    if (lowStockEl) {
        if (lowStockAlerts.length === 0) {
            lowStockEl.innerHTML = '<div class="empty-state"><p>在庫不足の商品はありません</p></div>';
        } else {
            let html = '<div class="alert-list">';
            lowStockAlerts.forEach(item => {
                html += '<div class="alert-item alert-warning">'
                    + '<div class="alert-product">' + esc(item.name) + '</div>'
                    + '<div class="alert-detail">'
                    + '現在: ' + item.currentStock + ' ' + esc(item.unit || '個')
                    + ' / 最低: ' + (item.minStock || 0) + ' ' + esc(item.unit || '個')
                    + '</div>'
                    + '</div>';
            });
            html += '</div>';
            lowStockEl.innerHTML = html;
        }
    }

    // --- Expiry Alerts ---
    let expiryAlerts = [];
    if (TanaCalc && TanaCalc.getExpiryAlerts) {
        // Build stockByLotMap: { productId: [{lotNumber, expiryDate, quantity}] }
        const stockByLotMap = {};
        transactions.filter(tx => tx.expiryDate).forEach(tx => {
            if (!stockByLotMap[tx.productId]) stockByLotMap[tx.productId] = [];
            stockByLotMap[tx.productId].push({
                lotNumber: tx.lotNumber || '',
                expiryDate: tx.expiryDate,
                quantity: tx.quantity,
            });
        });
        const expiryProducts = activeProducts.filter(p => p.trackExpiry);
        const rawAlerts = TanaCalc.getExpiryAlerts(stockByLotMap, expiryProducts);
        expiryAlerts = rawAlerts.map(a => {
            const product = activeProducts.find(p => p.id === a.productId);
            return {
                ...a,
                productName: product ? product.name : '(不明)',
            };
        });
    } else {
        // Manual fallback: find transactions with expiry within 90 days
        const now = new Date();
        const threshold = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
        const expiryTx = transactions.filter(tx => {
            if (!tx.expiryDate) return false;
            const expDate = new Date(tx.expiryDate);
            return expDate <= threshold;
        });
        expiryAlerts = expiryTx.map(tx => {
            const product = activeProducts.find(p => p.id === tx.productId);
            return {
                productName: product ? product.name : '(不明)',
                expiryDate: tx.expiryDate,
                lotNumber: tx.lotNumber || '',
            };
        });
    }

    const expiryEl = document.getElementById('dashboard-expiry');
    const expiryCountEl = document.getElementById('dashboard-expiry-count');
    if (expiryCountEl) expiryCountEl.textContent = expiryAlerts.length;

    if (expiryEl) {
        if (expiryAlerts.length === 0) {
            expiryEl.innerHTML = '<div class="empty-state"><p>期限切れの心配はありません</p></div>';
        } else {
            let html = '<div class="alert-list">';
            expiryAlerts.forEach(item => {
                const productName = item.productName || item.name || '';
                html += '<div class="alert-item alert-expiry">'
                    + '<div class="alert-product">' + esc(productName) + '</div>'
                    + '<div class="alert-detail">'
                    + '期限: ' + esc(item.expiryDate)
                    + (item.lotNumber ? ' / ロット: ' + esc(item.lotNumber) : '')
                    + '</div>'
                    + '</div>';
            });
            html += '</div>';
            expiryEl.innerHTML = html;
        }
    }

    // --- Recent Transactions ---
    const recentTx = transactions
        .sort((a, b) => {
            if (a.date !== b.date) return b.date.localeCompare(a.date);
            return (b.createdAt || '').localeCompare(a.createdAt || '');
        })
        .slice(0, 10);

    const recentEl = document.getElementById('dashboard-recent');
    if (recentEl) {
        if (recentTx.length === 0) {
            recentEl.innerHTML = '<div class="empty-state"><p>取引履歴がありません</p></div>';
        } else {
            const productMap = {};
            activeProducts.forEach(p => { productMap[p.id] = p; });

            let html = '';
            recentTx.forEach(tx => {
                const product = productMap[tx.productId];
                const productName = product ? product.name : '(削除された商品)';
                html += renderTransactionItem(tx, productName);
            });
            recentEl.innerHTML = html;
        }
    }

    // --- Backup Reminder ---
    const lastExport = await getSetting('last_export_time');
    const backupEl = document.getElementById('dashboard-backup-reminder');
    if (backupEl) {
        if (lastExport) {
            const lastExportDate = new Date(lastExport);
            const daysSince = Math.floor((Date.now() - lastExportDate.getTime()) / (1000 * 60 * 60 * 24));
            if (daysSince > 30) {
                backupEl.innerHTML = '<div class="alert-item alert-warning">'
                    + '<div class="alert-product">バックアップのお知らせ</div>'
                    + '<div class="alert-detail">最後のエクスポートから ' + daysSince + ' 日経過しています。'
                    + 'データのバックアップをお勧めします。</div>'
                    + '</div>';
                backupEl.hidden = false;
            } else {
                backupEl.hidden = true;
            }
        } else {
            backupEl.innerHTML = '<div class="alert-item alert-warning">'
                + '<div class="alert-product">バックアップのお知らせ</div>'
                + '<div class="alert-detail">まだデータのバックアップが行われていません。'
                + '設定画面からエクスポートしてください。</div>'
                + '</div>';
            backupEl.hidden = false;
        }
    }
}

// =============================================================================
// 14. Reports
// =============================================================================

async function loadReports(subTab) {
    if (!currentSubTab['reports']) {
        currentSubTab['reports'] = 'report-stock';
    }
    if (subTab) {
        currentSubTab['reports'] = subTab;
    }

    switchSubTab('reports', currentSubTab['reports']);

    switch (currentSubTab['reports']) {
        case 'report-stock':
            await loadStockReport();
            break;
        case 'report-history':
            await loadHistoryReport();
            break;
        case 'report-expiry':
            await loadExpiryReport();
            break;
        case 'report-variance':
            await loadVarianceReport();
            break;
    }
}

async function loadStockReport() {
    const TanaCalc = window.TanaCalc;
    const esc = TanaCalc ? TanaCalc.escapeHtml : (s) => s;

    const products = await dbGetAll('products');
    const activeProducts = products.filter(p => p.isActive !== false);
    const transactions = await dbGetAll('stock_transactions');

    let reportData = [];
    if (TanaCalc && TanaCalc.buildStockSummaryReport) {
        reportData = TanaCalc.buildStockSummaryReport(activeProducts, transactions);
    } else {
        // Fallback
        const stockMap = {};
        transactions.forEach(tx => {
            if (!stockMap[tx.productId]) stockMap[tx.productId] = 0;
            stockMap[tx.productId] += tx.quantity;
        });
        reportData = activeProducts.map(p => ({
            productCode: p.productCode,
            name: p.name,
            category: p.category || '',
            unit: p.unit || '個',
            currentStock: stockMap[p.id] || 0,
            minStock: p.minStock || 0,
            status: (stockMap[p.id] || 0) <= 0 ? 'zero'
                : (stockMap[p.id] || 0) <= (p.minStock || 0) ? 'low' : 'normal',
        }));
    }

    const containerEl = document.getElementById('stock-report-table');
    if (!containerEl) return;

    if (reportData.length === 0) {
        containerEl.innerHTML = '<div class="empty-state"><p>データがありません</p></div>';
        return;
    }

    let html = '<table class="report-table">'
        + '<thead><tr>'
        + '<th>商品コード</th><th>商品名</th><th>カテゴリ</th>'
        + '<th>現在庫</th><th>最低在庫</th><th>状態</th>'
        + '</tr></thead><tbody>';

    reportData.forEach(row => {
        const statusLabel = row.status === 'zero' ? '欠品'
            : row.status === 'low' ? '不足' : '正常';
        const statusClass = 'status-' + row.status;
        html += '<tr>'
            + '<td>' + esc(row.productCode || '') + '</td>'
            + '<td>' + esc(row.name || '') + '</td>'
            + '<td>' + esc(row.category || '') + '</td>'
            + '<td>' + row.currentStock + ' ' + esc(row.unit || '') + '</td>'
            + '<td>' + row.minStock + '</td>'
            + '<td><span class="' + statusClass + '">' + statusLabel + '</span></td>'
            + '</tr>';
    });

    html += '</tbody></table>';
    containerEl.innerHTML = html;
}

async function loadHistoryReport() {
    const TanaCalc = window.TanaCalc;
    const esc = TanaCalc ? TanaCalc.escapeHtml : (s) => s;

    const products = await dbGetAll('products');
    const transactions = await dbGetAll('stock_transactions');

    // Get filter values
    const dateFromEl = document.getElementById('report-history-date-from');
    const dateToEl = document.getElementById('report-history-date-to');
    const dateFrom = dateFromEl ? dateFromEl.value : '';
    const dateTo = dateToEl ? dateToEl.value : '';

    let reportData = [];
    if (TanaCalc && TanaCalc.buildTransactionReport) {
        reportData = TanaCalc.buildTransactionReport(transactions, products, {
            dateFrom: dateFrom,
            dateTo: dateTo,
        });
    } else {
        // Fallback
        const productMap = {};
        products.forEach(p => { productMap[p.id] = p; });

        let filtered = transactions;
        if (dateFrom) filtered = filtered.filter(tx => tx.date >= dateFrom);
        if (dateTo) filtered = filtered.filter(tx => tx.date <= dateTo);

        filtered.sort((a, b) => {
            if (a.date !== b.date) return b.date.localeCompare(a.date);
            return (b.createdAt || '').localeCompare(a.createdAt || '');
        });

        reportData = filtered.map(tx => {
            const product = productMap[tx.productId];
            return {
                date: tx.date,
                productName: product ? product.name : '(不明)',
                transactionType: tx.transactionType,
                quantity: tx.quantity,
                lotNumber: tx.lotNumber || '',
                notes: tx.notes || '',
            };
        });
    }

    const containerEl = document.getElementById('history-report-table');
    if (!containerEl) return;

    if (reportData.length === 0) {
        containerEl.innerHTML = '<div class="empty-state"><p>データがありません</p></div>';
        return;
    }

    const typeLabels = {
        receive: '入庫',
        use: '使用',
        sell: '販売',
        adjust: '棚卸調整',
        dispose: '廃棄',
    };

    let html = '<table class="report-table">'
        + '<thead><tr>'
        + '<th>日付</th><th>商品名</th><th>種類</th>'
        + '<th>数量</th><th>ロット</th><th>メモ</th>'
        + '</tr></thead><tbody>';

    reportData.forEach(row => {
        const typeLabel = typeLabels[row.transactionType] || row.transactionType;
        const sign = row.quantity >= 0 ? '+' : '';
        html += '<tr>'
            + '<td>' + esc(row.date || '') + '</td>'
            + '<td>' + esc(row.productName || '') + '</td>'
            + '<td>' + typeLabel + '</td>'
            + '<td>' + sign + row.quantity + '</td>'
            + '<td>' + esc(row.lotNumber || '') + '</td>'
            + '<td>' + esc(row.notes || '') + '</td>'
            + '</tr>';
    });

    html += '</tbody></table>';
    containerEl.innerHTML = html;
}

async function loadExpiryReport() {
    const TanaCalc = window.TanaCalc;
    const esc = TanaCalc ? TanaCalc.escapeHtml : (s) => s;

    const products = await dbGetAll('products');
    const activeProducts = products.filter(p => p.isActive !== false);
    const transactions = await dbGetAll('stock_transactions');

    let reportData = [];
    if (TanaCalc && TanaCalc.buildExpiryReport) {
        reportData = TanaCalc.buildExpiryReport(transactions, activeProducts);
    } else {
        // Fallback: find all transactions with expiry dates
        const productMap = {};
        activeProducts.forEach(p => { productMap[p.id] = p; });

        const expiryTx = transactions.filter(tx => tx.expiryDate && tx.quantity > 0);
        const now = new Date();

        reportData = expiryTx.map(tx => {
            const product = productMap[tx.productId];
            const expDate = new Date(tx.expiryDate);
            const daysUntil = Math.ceil((expDate - now) / (1000 * 60 * 60 * 24));
            let status = 'normal';
            if (daysUntil < 0) status = 'expired';
            else if (daysUntil <= 30) status = 'critical';
            else if (daysUntil <= 90) status = 'warning';

            return {
                productName: product ? product.name : '(不明)',
                lotNumber: tx.lotNumber || '',
                expiryDate: tx.expiryDate,
                daysUntil: daysUntil,
                status: status,
                quantity: tx.quantity,
            };
        });

        reportData.sort((a, b) => a.daysUntil - b.daysUntil);
    }

    const containerEl = document.getElementById('expiry-report-table');
    if (!containerEl) return;

    if (reportData.length === 0) {
        containerEl.innerHTML = '<div class="empty-state"><p>期限管理データがありません</p></div>';
        return;
    }

    let html = '<table class="report-table">'
        + '<thead><tr>'
        + '<th>商品名</th><th>ロット番号</th><th>使用期限</th>'
        + '<th>残日数</th><th>状態</th>'
        + '</tr></thead><tbody>';

    reportData.forEach(row => {
        const statusLabels = {
            expired: '期限切れ',
            critical: '期限間近',
            warning: '注意',
            normal: '正常',
        };
        const statusLabel = statusLabels[row.status] || row.status;
        const statusClass = 'expiry-' + row.status;
        html += '<tr class="' + statusClass + '">'
            + '<td>' + esc(row.productName || '') + '</td>'
            + '<td>' + esc(row.lotNumber || '') + '</td>'
            + '<td>' + esc(row.expiryDate || '') + '</td>'
            + '<td>' + row.daysUntil + ' 日</td>'
            + '<td><span class="' + statusClass + '-badge">' + statusLabel + '</span></td>'
            + '</tr>';
    });

    html += '</tbody></table>';
    containerEl.innerHTML = html;
}

async function loadVarianceReport() {
    const TanaCalc = window.TanaCalc;
    const esc = TanaCalc ? TanaCalc.escapeHtml : (s) => s;

    const counts = await dbGetAll('inventory_counts');
    const completedCounts = counts
        .filter(c => c.status === 'completed')
        .sort((a, b) => (b.countDate || '').localeCompare(a.countDate || ''));

    const containerEl = document.getElementById('variance-report-table');
    const selectorEl = document.getElementById('variance-session-select');
    if (!containerEl) return;

    // Populate selector
    if (selectorEl) {
        const currentValue = selectorEl.value;
        selectorEl.innerHTML = '<option value="">棚卸を選択</option>';
        completedCounts.forEach(count => {
            const option = document.createElement('option');
            option.value = count.id;
            option.textContent = count.countDate + ' (' + (count.items ? count.items.length : 0) + ' 品目)';
            selectorEl.appendChild(option);
        });
        if (currentValue) selectorEl.value = currentValue;
    }

    // Get selected count
    const selectedId = selectorEl ? selectorEl.value : '';
    if (!selectedId) {
        containerEl.innerHTML = '<div class="empty-state"><p>棚卸を選択してください</p></div>';
        return;
    }

    const selectedCount = completedCounts.find(c => c.id === selectedId);
    if (!selectedCount || !selectedCount.items) {
        containerEl.innerHTML = '<div class="empty-state"><p>データがありません</p></div>';
        return;
    }

    let reportData = selectedCount.items;
    if (TanaCalc && TanaCalc.buildVarianceReport) {
        reportData = TanaCalc.buildVarianceReport(selectedCount.items);
    }

    let html = '<table class="report-table">'
        + '<thead><tr>'
        + '<th>商品名</th><th>商品コード</th>'
        + '<th>理論在庫</th><th>実在庫</th><th>差異</th>'
        + '</tr></thead><tbody>';

    const items = Array.isArray(reportData) ? reportData : (reportData.items || selectedCount.items);
    items.forEach(item => {
        const diff = (item.actualQuantity || 0) - (item.systemQuantity || 0);
        const diffSign = diff > 0 ? '+' : '';
        const diffClass = diff !== 0 ? 'variance-diff' : '';
        html += '<tr class="' + diffClass + '">'
            + '<td>' + esc(item.productName || '') + '</td>'
            + '<td>' + esc(item.productCode || '') + '</td>'
            + '<td>' + (item.systemQuantity || 0) + '</td>'
            + '<td>' + (item.actualQuantity || 0) + '</td>'
            + '<td>' + diffSign + diff + '</td>'
            + '</tr>';
    });

    html += '</tbody></table>';
    containerEl.innerHTML = html;
}

// =============================================================================
// 15. Settings
// =============================================================================

async function loadSettings() {
    // Load clinic info
    const clinicInfo = await getSetting('clinic_info');
    if (clinicInfo) {
        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.value = val || '';
        };
        setVal('clinic-name', clinicInfo.clinicName);
        setVal('owner-name', clinicInfo.ownerName);
        setVal('zip-code', clinicInfo.zipCode);
        setVal('address', clinicInfo.address);
        setVal('phone', clinicInfo.phone);
    }

    // Load inventory settings
    const invSettings = await getSetting('inventory_settings');
    if (invSettings) {
        const el = document.getElementById('setting-low-stock-threshold');
        if (el) el.value = invSettings.lowStockThreshold || '';
        const expiryEl = document.getElementById('default-expiry-alert-days');
        if (expiryEl) expiryEl.value = invSettings.expiryWarningDays || 90;
    }

    // Load notification setting
    const notifEnabled = await getSetting('notification_enabled');
    const notifEl = document.getElementById('notification-enabled');
    if (notifEl) notifEl.checked = notifEnabled !== false;

    // Load last export time
    const lastExport = await getSetting('last_export_time');
    const lastExportEl = document.getElementById('setting-last-export');
    if (lastExportEl) {
        if (lastExport) {
            const d = new Date(lastExport);
            lastExportEl.textContent = '最終エクスポート: '
                + d.getFullYear() + '/'
                + String(d.getMonth() + 1).padStart(2, '0') + '/'
                + String(d.getDate()).padStart(2, '0') + ' '
                + String(d.getHours()).padStart(2, '0') + ':'
                + String(d.getMinutes()).padStart(2, '0');
        } else {
            lastExportEl.textContent = 'エクスポート履歴なし';
        }
    }

    // Show data counts
    const products = await dbGetAll('products');
    const transactions = await dbGetAll('stock_transactions');
    const counts = await dbGetAll('inventory_counts');

    const dataCountEl = document.getElementById('setting-data-counts');
    if (dataCountEl) {
        dataCountEl.innerHTML = '商品: ' + products.filter(p => p.isActive !== false).length + ' 件'
            + ' / 取引: ' + transactions.length + ' 件'
            + ' / 棚卸: ' + counts.length + ' 件';
    }
}

async function saveClinicInfo() {
    const getValue = (id) => {
        const el = document.getElementById(id);
        return el ? el.value.trim() : '';
    };

    const clinicInfo = {
        clinicName: getValue('clinic-name'),
        ownerName: getValue('owner-name'),
        zipCode: getValue('zip-code'),
        address: getValue('address'),
        phone: getValue('phone'),
    };

    await saveSetting('clinic_info', clinicInfo);
    showToast('施設情報を保存しました', 'success');
}

async function saveInventorySettings() {
    const thresholdEl = document.getElementById('setting-low-stock-threshold');
    const expiryEl = document.getElementById('default-expiry-alert-days');

    const invSettings = {
        lowStockThreshold: thresholdEl ? parseInt(thresholdEl.value) || 0 : 0,
        expiryWarningDays: expiryEl ? parseInt(expiryEl.value) || 90 : 90,
    };

    await saveSetting('inventory_settings', invSettings);
    showToast('在庫設定を保存しました', 'success');
}

async function saveNotificationSetting() {
    const notifEl = document.getElementById('setting-notification');
    const enabled = notifEl ? notifEl.checked : true;
    await saveSetting('notification_enabled', enabled);
    showToast('通知設定を保存しました', 'success');
}

// Data management
async function exportData() {
    try {
        const products = await dbGetAll('products');
        const transactions = await dbGetAll('stock_transactions');
        const counts = await dbGetAll('inventory_counts');
        const settings = await dbGetAll('app_settings');

        const exportObj = {
            appName: 'tana',
            version: '1.0.0',
            exportDate: new Date().toISOString(),
            products: products,
            stock_transactions: transactions,
            inventory_counts: counts,
            settings: settings,
        };

        const jsonStr = JSON.stringify(exportObj, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const now = new Date();
        const filename = 'tana_export_'
            + now.getFullYear()
            + String(now.getMonth() + 1).padStart(2, '0')
            + String(now.getDate()).padStart(2, '0')
            + '_'
            + String(now.getHours()).padStart(2, '0')
            + String(now.getMinutes()).padStart(2, '0')
            + String(now.getSeconds()).padStart(2, '0')
            + '.json';

        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        // Update last export time
        await saveSetting('last_export_time', new Date().toISOString());
        showToast('データをエクスポートしました', 'success');

        // Refresh settings display
        await loadSettings();
    } catch (err) {
        console.error('Export failed:', err);
        showToast('エクスポートに失敗しました', 'error');
    }
}

async function importData() {
    const fileInput = document.getElementById('import-file');
    if (!fileInput) {
        // Create a temporary file input
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e) => {
            await processImportFile(e.target.files[0]);
        };
        input.click();
        return;
    }

    // Use existing file input
    if (fileInput.files.length === 0) {
        showToast('ファイルを選択してください', 'error');
        return;
    }

    await processImportFile(fileInput.files[0]);
}

async function processImportFile(file) {
    if (!file) return;

    try {
        const text = await file.text();
        const data = JSON.parse(text);

        const TanaCalc = window.TanaCalc;

        // Validate import data
        if (TanaCalc && TanaCalc.validateImportData) {
            const result = TanaCalc.validateImportData(data);
            if (result && !result.valid) {
                showToast('無効なデータです: ' + result.errors[0], 'error');
                return;
            }
        } else {
            // Basic validation
            if (!data.appName || data.appName !== 'tana') {
                showToast('Tanaのエクスポートファイルではありません', 'error');
                return;
            }
        }

        // Show confirmation with counts
        const productCount = data.products ? data.products.length : 0;
        const txCount = data.stock_transactions ? data.stock_transactions.length : 0;
        const countCount = data.inventory_counts ? data.inventory_counts.length : 0;

        const confirmed = await showConfirm(
            'データをインポートしますか？\n\n'
            + '商品: ' + productCount + ' 件\n'
            + '取引: ' + txCount + ' 件\n'
            + '棚卸: ' + countCount + ' 件\n\n'
            + '同じIDのデータは上書きされます。'
        );
        if (!confirmed) return;

        // Merge: add/update products
        if (data.products && Array.isArray(data.products)) {
            for (const product of data.products) {
                await dbUpdate('products', product);
            }
        }

        // Add transactions
        if (data.stock_transactions && Array.isArray(data.stock_transactions)) {
            for (const tx of data.stock_transactions) {
                try {
                    await dbAdd('stock_transactions', tx);
                } catch (e) {
                    // Duplicate key - update instead
                    await dbUpdate('stock_transactions', tx);
                }
            }
        }

        // Add counts
        if (data.inventory_counts && Array.isArray(data.inventory_counts)) {
            for (const count of data.inventory_counts) {
                try {
                    await dbAdd('inventory_counts', count);
                } catch (e) {
                    await dbUpdate('inventory_counts', count);
                }
            }
        }

        // Update settings
        if (data.settings && Array.isArray(data.settings)) {
            for (const setting of data.settings) {
                await dbUpdate('app_settings', setting);
            }
        }

        showToast('データをインポートしました', 'success');

        // Reload current tab
        switchTab(currentTab);
    } catch (err) {
        console.error('Import failed:', err);
        showToast('インポートに失敗しました: ' + err.message, 'error');
    }
}

async function deleteAllData() {
    // First confirmation
    const confirmed1 = await showConfirm(
        '全てのデータを削除しますか？\nこの操作は取り消せません。'
    );
    if (!confirmed1) return;

    // Require typing "削除" for safety
    const overlay = document.getElementById('confirm-dialog');
    const messageEl = document.getElementById('confirm-message');

    // Use a prompt-like approach with a second confirmation
    const confirmed2 = await new Promise((resolve) => {
        if (!overlay || !messageEl) {
            const input = window.prompt('確認のため「削除」と入力してください');
            resolve(input === '削除');
            return;
        }

        // Create input field in confirm dialog
        messageEl.innerHTML = '確認のため「削除」と入力してください<br><input type="text" id="confirm-delete-input" class="form-input" placeholder="削除" />';
        overlay.hidden = false;

        const okBtn = document.getElementById('confirm-ok-btn');
        const cancelBtn = document.getElementById('confirm-cancel-btn');

        const handleOk = () => {
            const input = document.getElementById('confirm-delete-input');
            const value = input ? input.value.trim() : '';
            cleanup();
            overlay.hidden = true;
            resolve(value === '削除');
        };

        const handleCancel = () => {
            cleanup();
            overlay.hidden = true;
            resolve(false);
        };

        function cleanup() {
            okBtn.removeEventListener('click', handleOk);
            cancelBtn.removeEventListener('click', handleCancel);
        }

        okBtn.addEventListener('click', handleOk);
        cancelBtn.addEventListener('click', handleCancel);
    });

    if (!confirmed2) {
        showToast('削除がキャンセルされました', 'info');
        return;
    }

    try {
        await dbClear('products');
        await dbClear('stock_transactions');
        await dbClear('inventory_counts');
        await dbClear('app_settings');

        activeCountId = null;
        showToast('全データを削除しました', 'success');

        // Reload
        switchTab('dashboard');
    } catch (err) {
        console.error('Delete all failed:', err);
        showToast('データ削除に失敗しました', 'error');
    }
}

async function loadSampleData() {
    try {
        const response = await fetch('sample_data.json');
        if (!response.ok) {
            showToast('サンプルデータの読み込みに失敗しました', 'error');
            return;
        }

        const data = await response.json();

        const confirmed = await showConfirm(
            'サンプルデータを読み込みますか？\n既存データはそのまま保持されます。'
        );
        if (!confirmed) return;

        // Import sample data
        if (data.products && Array.isArray(data.products)) {
            for (const product of data.products) {
                try {
                    await dbAdd('products', product);
                } catch (e) {
                    await dbUpdate('products', product);
                }
            }
        }

        if (data.stock_transactions && Array.isArray(data.stock_transactions)) {
            for (const tx of data.stock_transactions) {
                try {
                    await dbAdd('stock_transactions', tx);
                } catch (e) {
                    await dbUpdate('stock_transactions', tx);
                }
            }
        }

        if (data.inventory_counts && Array.isArray(data.inventory_counts)) {
            for (const count of data.inventory_counts) {
                try {
                    await dbAdd('inventory_counts', count);
                } catch (e) {
                    await dbUpdate('inventory_counts', count);
                }
            }
        }

        if (data.settings && Array.isArray(data.settings)) {
            for (const setting of data.settings) {
                await dbUpdate('app_settings', setting);
            }
        }

        showToast('サンプルデータを読み込みました', 'success');
        switchTab(currentTab);
    } catch (err) {
        console.error('Sample data load failed:', err);
        showToast('サンプルデータの読み込みに失敗しました', 'error');
    }
}

// =============================================================================
// 16. Notification Check
// =============================================================================

async function checkNotification() {
    try {
        const notifEnabled = await getSetting('notification_enabled');
        if (notifEnabled === false) return;

        const response = await fetch('notify.html', { cache: 'no-cache' });
        if (!response.ok) return;

        const content = await response.text();
        if (!content || content.trim() === '') return;

        const currentHash = await hashString(content);
        const storedHash = await getSetting('notification_hash');

        if (storedHash !== currentHash) {
            // New notification
            await saveSetting('notification_hash', currentHash);

            const indicator = document.getElementById('notification-indicator');
            if (indicator) indicator.hidden = false;

            // Store notification content
            await saveSetting('notification_content', content);
        }
    } catch (err) {
        // Notification check failed silently (might be offline)
        console.log('Notification check skipped:', err.message);
    }
}

function showNotification() {
    getSetting('notification_content').then(content => {
        if (!content) return;

        const overlay = document.getElementById('notification-overlay');
        const contentEl = document.getElementById('notification-content');
        if (overlay && contentEl) {
            contentEl.innerHTML = content;
            overlay.hidden = false;
        }

        // Hide indicator
        const indicator = document.getElementById('notification-indicator');
        if (indicator) indicator.hidden = true;
    });
}

function closeNotification() {
    const overlay = document.getElementById('notification-overlay');
    if (overlay) overlay.hidden = true;
}

// =============================================================================
// 17. PWA / Service Worker
// =============================================================================

function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').then(reg => {
            reg.onupdatefound = () => {
                const newWorker = reg.installing;
                newWorker.onstatechange = () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        showUpdateBanner();
                    }
                };
            };
        }).catch(err => {
            console.log('Service Worker registration failed:', err);
        });
    }
}

function showUpdateBanner() {
    const banner = document.getElementById('update-banner');
    if (banner) banner.hidden = false;
}

function applyUpdate() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistration().then(reg => {
            if (reg && reg.waiting) {
                reg.waiting.postMessage({ type: 'SKIP_WAITING' });
            }
        });
    }
    // Reload the page
    window.location.reload();
}

function dismissUpdateBanner() {
    const banner = document.getElementById('update-banner');
    if (banner) banner.hidden = true;
}

// =============================================================================
// 18. Scroll Top
// =============================================================================

function setupScrollTop() {
    const scrollBtn = document.getElementById('scroll-top-btn');
    if (!scrollBtn) return;

    window.addEventListener('scroll', () => {
        if (window.scrollY > 300) {
            scrollBtn.classList.add('visible');
        } else {
            scrollBtn.classList.remove('visible');
        }
    });

    scrollBtn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
}

// =============================================================================
// 19. Version Display
// =============================================================================

function displayVersion() {
    const appInfo = window.APP_INFO;
    if (!appInfo) return;

    const versionEl = document.getElementById('app-version');
    if (versionEl) {
        versionEl.textContent = 'v' + (appInfo.version || '1.0.0');
    }

    const buildTimeEl = document.getElementById('app-build-time');
    if (buildTimeEl && appInfo.buildTime) {
        buildTimeEl.textContent = 'Build: ' + appInfo.buildTime;
    }

    const footerEl = document.getElementById('app-info');
    if (footerEl) {
        footerEl.textContent = (appInfo.name || 'Tana') + ' v' + (appInfo.version || '1.0.0');
    }
}

// =============================================================================
// 20. Initialization
// =============================================================================

document.addEventListener('DOMContentLoaded', async () => {
    try {
        db = await openDB();
        window.db = db;
    } catch (err) {
        console.error('Failed to open database:', err);
        showToast('データベースの初期化に失敗しました', 'error');
        return;
    }

    // Register event listeners for all tabs
    document.querySelectorAll('#main-tab-nav button').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // Sub-tab listeners for transactions
    const transactionTabEl = document.getElementById('tab-transactions');
    if (transactionTabEl) {
        transactionTabEl.querySelectorAll('.sub-tab-nav button').forEach(btn => {
            btn.addEventListener('click', () => {
                switchSubTab('transactions', btn.dataset.subtab);
                if (btn.dataset.subtab === 'history') {
                    loadTransactionHistory();
                }
            });
        });
    }

    // Sub-tab listeners for reports
    const reportsTabEl = document.getElementById('tab-reports');
    if (reportsTabEl) {
        reportsTabEl.querySelectorAll('.sub-tab-nav button').forEach(btn => {
            btn.addEventListener('click', () => {
                loadReports(btn.dataset.subtab);
            });
        });
    }

    // Product search/filter listeners
    const productSearch = document.getElementById('product-search');
    if (productSearch) {
        productSearch.addEventListener('input', filterProducts);
    }

    const productCategoryFilter = document.getElementById('product-category-filter');
    if (productCategoryFilter) {
        productCategoryFilter.addEventListener('change', filterProducts);
    }

    // Product form listeners
    const productSaveBtn = document.getElementById('save-product-btn');
    if (productSaveBtn) {
        productSaveBtn.addEventListener('click', saveProduct);
    }

    const productCancelBtn = document.getElementById('cancel-product-btn');
    if (productCancelBtn) {
        productCancelBtn.addEventListener('click', closeProductForm);
    }

    const productAddBtn = document.getElementById('add-product-btn');
    if (productAddBtn) {
        productAddBtn.addEventListener('click', () => openProductForm());
    }

    const photoInput = document.getElementById('photo-input');
    if (photoInput) {
        photoInput.addEventListener('change', handlePhotoInput);
    }

    const photoClearBtn = document.getElementById('clear-photo-btn');
    if (photoClearBtn) {
        photoClearBtn.addEventListener('click', clearPhoto);
    }

    // Product detail close
    const productDetailCloseBtn = document.getElementById('close-product-detail');
    if (productDetailCloseBtn) {
        productDetailCloseBtn.addEventListener('click', closeProductDetail);
    }

    // Transaction form listeners
    ['receive', 'use', 'sell'].forEach(type => {
        const saveBtn = document.getElementById('save-' + type + '-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => saveTransaction(type));
        }

        const productSelect = document.getElementById(type + '-product');
        if (productSelect) {
            productSelect.addEventListener('change', (e) => onTransactionProductChange(e.target, type));
        }
    });

    // Transaction history filter listeners
    ['history-date-from', 'history-date-to', 'history-product-filter', 'history-type-filter'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', loadTransactionHistory);
        }
    });

    // Inventory count listeners
    const startCountBtn = document.getElementById('start-count-btn');
    if (startCountBtn) {
        startCountBtn.addEventListener('click', startNewCount);
    }

    // Settings listeners
    const saveClinicBtn = document.getElementById('save-clinic-info-btn');
    if (saveClinicBtn) {
        saveClinicBtn.addEventListener('click', saveClinicInfo);
    }

    const saveInventoryBtn = document.getElementById('save-inventory-settings-btn');
    if (saveInventoryBtn) {
        saveInventoryBtn.addEventListener('click', saveInventorySettings);
    }

    const notificationToggle = document.getElementById('notification-enabled');
    if (notificationToggle) {
        notificationToggle.addEventListener('change', saveNotificationSetting);
    }

    const exportBtn = document.getElementById('export-data-btn');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportData);
    }

    const importBtn = document.getElementById('import-data-btn');
    if (importBtn) {
        importBtn.addEventListener('click', importData);
    }

    const deleteAllBtn = document.getElementById('delete-all-btn');
    if (deleteAllBtn) {
        deleteAllBtn.addEventListener('click', deleteAllData);
    }

    const sampleDataBtn = document.getElementById('load-sample-data-btn');
    if (sampleDataBtn) {
        sampleDataBtn.addEventListener('click', loadSampleData);
    }

    // Scan FAB listeners
    const scanFab = document.getElementById('scan-fab');
    if (scanFab) {
        scanFab.addEventListener('click', () => {
            openScanner(async (code) => {
                // Default scan behavior: look up product
                const product = await lookupByBarcode(code);
                if (product) {
                    showProductDetail(product.id);
                } else {
                    const addNew = await showConfirm(
                        'JANコード「' + code + '」の商品が見つかりません。\n新規登録しますか？'
                    );
                    if (addNew) {
                        openProductForm();
                        const janField = document.getElementById('product-jan-code');
                        if (janField) janField.value = code;
                    }
                }
            });
        });
    }

    // Scanner close listener
    const scannerCloseBtn = document.getElementById('scan-close-btn');
    if (scannerCloseBtn) {
        scannerCloseBtn.addEventListener('click', closeScanner);
    }

    // Numpad button listeners
    document.querySelectorAll('.numpad-btn').forEach(btn => {
        btn.addEventListener('click', () => numpadInput(btn.dataset.numpad));
    });

    const numpadConfirmBtn = document.getElementById('numpad-confirm-btn');
    if (numpadConfirmBtn) {
        numpadConfirmBtn.addEventListener('click', confirmNumpad);
    }

    const numpadCancelBtn = document.getElementById('numpad-cancel-btn');
    if (numpadCancelBtn) {
        numpadCancelBtn.addEventListener('click', closeNumpad);
    }

    // Confirm dialog is handled inline by showConfirm()

    // Update banner listener
    const updateBtn = document.getElementById('update-btn');
    if (updateBtn) {
        updateBtn.addEventListener('click', applyUpdate);
    }

    const updateDismissBtn = document.getElementById('update-dismiss-btn');
    if (updateDismissBtn) {
        updateDismissBtn.addEventListener('click', dismissUpdateBanner);
    }

    // Notification listeners
    const notifIndicator = document.getElementById('notification-indicator');
    if (notifIndicator) {
        notifIndicator.addEventListener('click', showNotification);
    }

    const notifCloseBtn = document.getElementById('notification-close-btn');
    if (notifCloseBtn) {
        notifCloseBtn.addEventListener('click', closeNotification);
    }

    // Report history filter listeners
    const reportHistoryFrom = document.getElementById('report-history-date-from');
    if (reportHistoryFrom) {
        reportHistoryFrom.addEventListener('change', () => loadHistoryReport());
    }
    const reportHistoryTo = document.getElementById('report-history-date-to');
    if (reportHistoryTo) {
        reportHistoryTo.addEventListener('change', () => loadHistoryReport());
    }

    // Variance report selector listener
    const varianceSelector = document.getElementById('variance-session-select');
    if (varianceSelector) {
        varianceSelector.addEventListener('change', () => loadVarianceReport());
    }

    // Scan buttons within transaction forms
    ['receive', 'use', 'sell'].forEach(type => {
        const scanBtn = document.getElementById(type + '-scan-btn');
        if (scanBtn) {
            scanBtn.addEventListener('click', () => {
                openScanner(async (code) => {
                    const product = await lookupByBarcode(code);
                    if (product) {
                        const select = document.getElementById(type + '-product');
                        if (select) {
                            select.value = product.id;
                            onTransactionProductChange(select, type);
                        }
                        showToast(product.name + ' を選択しました', 'success');
                    } else {
                        showToast('JANコード「' + code + '」の商品が見つかりません', 'error');
                    }
                });
            });
        }
    });

    // Overlay close on background click
    document.querySelectorAll('.overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.hidden = true;
                // Clean up scanner if it was the scan overlay
                if (overlay.id === 'scan-overlay') {
                    closeScanner();
                }
            }
        });
    });

    // Check URL params for initial tab
    const params = new URLSearchParams(window.location.search);
    const initialTab = params.get('tab') || 'dashboard';
    switchTab(initialTab);

    // Display version
    displayVersion();

    // Register service worker
    registerServiceWorker();

    // Setup scroll top
    setupScrollTop();

    // Check notifications
    checkNotification();

    // Signal that the app is fully initialized
    window.appReady = true;
});
