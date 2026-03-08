# Tana - バグパターン集

バグ修正時に発見したパターンを記録し、同類バグの予防に活用する。

## パターン一覧

### P1: イベントリスナー未登録
- 症状: HTML要素は存在するがクリックしても何も起きない
- 原因: HTML追加時にscript.jsへのaddEventListener追加を忘れた
- 発見箇所: ダッシュボード クイックアクションボタン3つ（BUG-01）
- 予防: HTML要素にid/イベント属性を追加したら、script.jsの初期化処理にリスナー追加を確認。E2E-SIG-001で全ボタンのリスナー有無を自動検査

### P2: 内部値のUI漏出
- 症状: ユーザーに見える場所に英語の内部値（consumable, retail等）が表示される
- 原因: ドロップダウン再構築時にgetCategoryLabel()を通さずraw値を表示
- 発見箇所: 商品一覧カテゴリフィルタ（BUG-02）
- 予防: UIに表示する値は必ずラベル変換関数を通す。E2E-QA-012〜014で全画面を監視。E2E-SIG-004で全タブの内部値漏出を自動検査

### P3: 動的HTML vs 静的HTMLの二重構造
- 症状: 同じ情報（在庫数、ボタン等）が画面上に2つ表示される
- 原因: showProductDetail()がinnerHTMLで動的生成する内容と、index.htmlの静的要素が重複
- 発見箇所: 商品詳細の在庫バッジ・編集/削除ボタン（BUG-03, BUG-04）
- 予防: 動的HTMLを生成する関数は、対応する静的HTML要素がないか確認する

### P4: 要素ID不一致
- 症状: JSが要素を見つけられずnullになり、機能が動作しない
- 原因: HTML側のid属性とJS側のgetElementById引数が異なる命名規則
- 発見箇所: 入庫フォームのロット/期限フィールド — JSが`receive-lot-fields`を探索、HTMLは`receive-lot-number-group`（BUG-05）; 設定画面の閾値・エクスポート日時・件数表示（BUG-09）; アップデートバナー×ボタン（BUG-10）
- 予防: 要素IDを変更・追加したら、grepで全参照箇所を確認。E2E-SIG-002で全getElementById呼び出しのnull返却を自動検査

### P5: 関数引数の型不一致
- 症状: 関数が期待するオブジェクト構造と実際に渡される引数が異なり、内部でundefinedアクセス
- 原因: buildVarianceReport()はcountオブジェクト全体を期待するが、count.items（配列）が渡された
- 発見箇所: 棚卸差異レポート（BUG-06）
- 予防: 関数のJSDocコメントで引数の型を明示する

### P6: 出力プロパティの欠落
- 症状: テーブルの特定列が空欄になる
- 原因: generateVarianceReport()がproductCodeを出力オブジェクトに含めていなかった
- 発見箇所: 棚卸差異レポートの商品コード列（BUG-06b）
- 予防: UI側で参照するプロパティが、データ生成関数の出力に全て含まれているか確認。E2E-SIG-005でレポートテーブルの空列を自動検査

### P7: scriptタグの記載漏れ
- 症状: ライブラリのJSファイルは存在するが、`typeof LibName === 'undefined'` になり機能が動作しない
- 原因: `index.html` に `<script src="...">` タグが記載されていない
- 発見箇所: html5-qrcode.min.js — バーコードスキャン全機能が動作不能（BUG-07）
- 予防: 外部ライブラリを同梱したら、index.htmlのscriptタグ追加とE2Eでの読み込み確認テストを必ず行う。E2E-SIG-003で全参照リソースのロード成功を自動検査

### P8: HTML id と JS getElementById の不一致（FAB）
- 症状: FABボタンが表示されているがクリックしても何も起きない
- 原因: HTMLで `product-scan-fab` / `transaction-scan-fab`、JSで `scan-fab` を参照 — IDが一致しない
- 発見箇所: 商品タブ・入出庫タブのスキャンFABボタン（BUG-08）
- 予防: P4と同類。FABなど複数画面に配置する要素は、全IDに対してイベントリスナーが登録されているかE2Eで検証する。E2E-SIG-001 + E2E-SIG-002で自動検査

### P9: オーバーレイ×ボタンのイベントリスナー未登録
- 症状: オーバーレイの×（閉じる）ボタンをクリックしても閉じない
- 原因: `.overlay-close-btn` classのボタンは存在するが、汎用的なクリックハンドラが未登録
- 発見箇所: 商品フォーム・商品詳細・取引フォーム・棚卸詳細の4オーバーレイ（BUG-11）
- 予防: E2E-SIG-006で全オーバーレイの閉じるボタン動作を自動検査

### P10: 棚卸完了ボタンのイベントリスナー未登録
- 症状: 棚卸画面の「棚卸を完了」ボタンをクリックしても何も起きない
- 原因: `complete-count-btn` の addEventListener 登録漏れ（動的HTML内の onclick 版は存在）
- 発見箇所: 棚卸タブの静的「棚卸を完了」ボタン（BUG-12）
- 予防: P1と同類。E2E-SIG-001で自動検査

### P11: Dead Form Field（HTMLフィールドのJS配線欠落）
- 症状: フォームフィールドがHTMLに存在するが、入力値が保存されない・読み込まれない・UIが連動しない
- 原因: HTMLにinput/select要素を追加した際に、save関数での値読み取り、load/edit関数での値書き込み、イベントリスナーの登録のいずれかが欠落
- 発見箇所: 商品フォームのexpiryAlertDays（save/load/changeイベント全欠落）、設定画面のscan-sound-enabled（save/load未実装、playScanSound未参照）、設定画面のdefault-transaction-type（save/load未実装、loadTransactionTab未参照）
- 予防: E2E-SIG-007で全フォームフィールドとsave/loadロジックの対応マッピングを自動検査。E2E-PRD-RT-001/E2E-SET-RT-001でラウンドトリップ（保存→再表示→値一致）を検証
