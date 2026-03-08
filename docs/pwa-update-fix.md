# PWA アップデート検出・適用パターン

## 症状

- 「アップデートを確認」ボタンを押すと常に「最新バージョンです」と表示される
- 実際にはアプリ再起動時に更新が適用されている
- 更新バナーが表示されない
- バナーを無視してアプリを閉じ、次回起動時にバナーが再表示されない

## 根本原因

Service Worker の `install` イベント内で `self.skipWaiting()` を呼んでいるため、新しい Service Worker が **waiting 状態を経由せず即座に activate** される。

### Service Worker ライフサイクル

```
[ダウンロード] → [install] → [waiting] → [activate] → [稼働中]
                                 ↑
                          ここで待機するのが正常
```

`skipWaiting()` を install 内で呼ぶと:

```
[ダウンロード] → [install] → (waiting をスキップ) → [activate] → [稼働中]
```

この結果:

1. **`reg.waiting` が常に null** — `checkForUpdate()` で `reg.update()` 後に waiting worker を確認しても見つからない
2. **更新バナーが表示されない** — `installing` 状態が一瞬で `activated` に遷移し、バナー表示のタイミングを逃す
3. **更新は実際に起きている** — `skipWaiting()` + `clients.claim()` により、次のナビゲーション/リロードで新しい SW が制御を取る

## 修正パターン

### 1. install イベントから skipWaiting を削除

```javascript
// 修正前（問題あり）
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(PRECACHE_ASSETS))
            .then(() => self.skipWaiting())  // ← これを削除
    );
});

// 修正後
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(PRECACHE_ASSETS))
    );
});
```

`SKIP_WAITING` メッセージハンドラは残す（ユーザー操作時に使用）:

```javascript
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
```

### 2. checkForUpdate — installing SW の完了を待つ

`reg.update()` は新しい SW のダウンロードを開始するが、install が完了するまで `reg.waiting` は設定されない。`reg.installing` の状態変化を監視する必要がある。

```javascript
async function checkForUpdate() {
    if (!('serviceWorker' in navigator)) {
        showToast('非対応ブラウザです', 'warning');
        return;
    }
    try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (!reg) {
            showToast('最新バージョンです', 'success');
            return;
        }
        // 既に waiting 中の SW がある場合
        if (reg.waiting) {
            showUpdateBanner();
            return;
        }
        await reg.update();
        // update() 後に即座に waiting になった場合
        if (reg.waiting) {
            showUpdateBanner();
            return;
        }
        // installing 中の場合、完了を待つ
        if (reg.installing) {
            const installingWorker = reg.installing;
            await new Promise((resolve) => {
                installingWorker.onstatechange = function() {
                    if (this.state === 'installed' || this.state === 'redundant') {
                        resolve();
                    }
                };
                // フォールバック: ハンドラ設定前に状態遷移が完了していた場合
                if (installingWorker.state === 'installed' || installingWorker.state === 'redundant') {
                    resolve();
                }
            });
            if (reg.waiting) {
                showUpdateBanner();
                return;
            }
        }
        showToast('最新バージョンです', 'success');
    } catch (err) {
        showToast('更新の確認に失敗しました', 'error');
    }
}
```

### 3. applyUpdate — controllerchange を待ってから reload

`postMessage()` で `SKIP_WAITING` を送信した後、Service Worker が実際に切り替わる前に `reload()` すると、古い SW が応答してしまう。`controllerchange` イベントを待つことで、新しい SW が制御を開始した後に reload する。

```javascript
function applyUpdate() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.getRegistration().then(reg => {
        if (reg && reg.waiting) {
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                window.location.reload();
            });
            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        } else {
            window.location.reload();
        }
    });
}
```

### 4. showUpdateBanner — CSS の display 制御

バナーの `hidden` 属性を外すだけでは不十分な場合がある。CSS で `display: none` をデフォルトにしている場合、`.visible` クラスの付与が必要。

```javascript
function showUpdateBanner() {
    const banner = document.getElementById('update-banner');
    if (banner) {
        banner.hidden = false;
        banner.classList.add('visible');
    }
}
```

```css
#update-banner {
    display: none;
}

#update-banner.visible {
    display: block;
}
```

### 5. registerServiceWorker — reg.waiting の起動時チェック

`onupdatefound` は新しい SW のダウンロードが始まったときに発火するが、**既に waiting 状態の SW がある場合は再発火しない**。ユーザーがバナーを無視してアプリを閉じると、次回起動時にバナーが表示されなくなる。

`register().then()` 内で `reg.waiting` を即座にチェックする:

```javascript
navigator.serviceWorker.register('/sw.js').then(reg => {
    // 起動時チェック: 前回の訪問で waiting のまま残った SW がないか確認
    if (reg.waiting && navigator.serviceWorker.controller) {
        showUpdateBanner();
    }

    reg.onupdatefound = () => {
        // ... 既存の onupdatefound ハンドラ
    };
});
```

**ポイント**: `navigator.serviceWorker.controller` のチェックにより、初回インストール時（controller が null）にバナーが誤表示されることを防ぐ。

### 6. registerServiceWorker — onstatechange のレースコンディション

`onupdatefound` 内で `reg.installing` の `onstatechange` を設定するが、SW のインストールが高速に完了した場合、**ハンドラ設定前に `installed` 状態に遷移**しうる。この場合 `onstatechange` は発火せず、バナーが表示されない。

ハンドラ設定直後に `newWorker.state` を即チェックするフォールバックを入れる:

```javascript
reg.onupdatefound = () => {
    const newWorker = reg.installing;
    newWorker.onstatechange = () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateBanner();
        }
    };
    // フォールバック: ハンドラ設定前に installed に遷移していた場合
    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
        showUpdateBanner();
    }
};
```

**ポイント**: `onstatechange` ハンドラと即時チェックの両方で `showUpdateBanner()` が呼ばれる可能性があるが、バナー表示は冪等な操作なので問題ない。

## 検証方法

1. 更新がない状態で「アップデートを確認」→「最新バージョンです」が表示されること
2. SW のキャッシュ名を変更して再デプロイ → 「アップデートを確認」→ 更新バナーが表示されること
3. 「更新する」ボタン → ページがリロードされ、新しいバージョンが表示されること

## 注意事項

- **初回インストール**: `navigator.serviceWorker.controller` が null のため、バナーは表示されない
- **複数タブ**: `SKIP_WAITING` で全タブの controller が変わるが、`controllerchange` で reload するのは操作したタブのみ
- **activate イベントの `clients.claim()`**: これは残す。初回インストール時にクライアントを即座に制御するために必要
