# Tana -- 在庫管理アプリ

治療院・サロン向けの在庫管理アプリ。施術用消耗品と物販商品をブラウザだけで管理できます。

---

## 主な機能

### 商品管理
施術用消耗品と物販商品を一括管理。バーコードスキャンで素早く検索・登録。

### 入出庫記録
入庫・使用・販売・廃棄・調整の5種類で在庫変動を正確に記録。

### 棚卸
テンキー入力で素早くカウント。差異を自動検出し調整トランザクションを生成。

### 期限管理
使用期限の近い商品をダッシュボードでアラート表示。廃棄ロスを最小化。

---

## 特徴

| 項目 | 内容 |
|------|------|
| **完全オフライン** | PWA対応。インターネット接続なしで全機能利用可能 |
| **プライバシー** | データは端末内に保存。外部サーバーへの送信なし |
| **データポータビリティ** | JSON形式でエクスポート/インポート対応 |
| **バーコード対応** | スマホカメラでJAN-8/JAN-13を読み取り |
| **モバイル対応** | スマートフォン・タブレット・PCのレスポンシブデザイン |

---

## 技術スタック

| カテゴリ | 技術 |
|---------|------|
| フロントエンド | Vanilla JavaScript (ES6+) |
| スタイリング | Vanilla CSS + CSS Custom Properties |
| データストア | IndexedDB |
| PWA | Service Worker + Web App Manifest |
| バーコード | html5-qrcode (ローカル同梱) |
| テスト | Jest + Puppeteer |
| サーバー | Docker + nginx:alpine |

---

## セットアップ

### 必要環境
- Docker & Docker Compose

### ビルド＆起動
```bash
bash scripts/build.sh
```

ブラウザで `http://localhost:8088` を開く。

### 強制リビルド
```bash
bash scripts/rebuild.sh
```

---

## テスト

### ユニットテスト
```bash
npm test
```

### E2Eテスト
```bash
docker compose run --rm tana-test
```

---

## ドキュメント

| ドキュメント | 内容 |
|------------|------|
| [要件定義書](docs/requirements_definition.md) | 機能要件・非機能要件 |
| [基本設計書](docs/basic_design.md) | アーキテクチャ・データモデル |
| [詳細設計書](docs/detailed_design.md) | バリデーション・UI仕様 |
| [アルゴリズム仕様書](docs/algorithm_logic.md) | 計算ロジック |
| [テスト仕様書](docs/test_specification.md) | テストケース一覧 |
| [ユーザーマニュアル](docs/manual.md) | 操作手順 |

---

## ライセンス

MIT License
