# Neo4j Aura モバイルビューワー

スマホブラウザから Neo4j Aura データベースに直接接続できる Web アプリ。

## 技術スタック
- React 18 + Vite
- Tailwind CSS v3
- Lucide React（アイコン）

## 機能
- Neo4j Aura への HTTP API 直接接続（バックエンド不要）
- 接続設定の localStorage 保存（パスワードはセッション中のみ保持）
- ノード閲覧タブ：ラベル別フィルター・テキスト検索・詳細モーダル
- クエリタブ：Cypher 自由入力・プリセット・テーブル/ノードカード表示
- 設定タブ：接続情報確認・再接続・切断

## 接続方式
Neo4j HTTP Transactional API を使用:
```
POST https://<host>/db/<database>/tx/commit
Authorization: Basic <base64(username:password)>
Content-Type: application/json

{ "statements": [{ "statement": "...", "resultDataContents": ["row", "graph"] }] }
```
Bolt URI（`neo4j+s://...`）を入力すると自動的に `https://` に変換。

## 開発コマンド
```bash
npm install
npm run dev      # 開発サーバー（http://localhost:5173）
npm run build    # プロダクションビルド
npm run preview  # ビルド結果のプレビュー
```

## ディレクトリ構成
```
src/
├── App.jsx                      # ルート（タブ型ナビ: 閲覧/クエリ/設定）
├── main.jsx
├── index.css
└── components/
    ├── useNeo4jApi.js           # HTTP API 接続・Cypher 実行フック
    ├── useNeo4jData.js          # ユーティリティ（getNodeTitle, getLabelColor）
    ├── ConnectionForm.jsx       # 接続設定フォーム
    ├── QueryRunner.jsx          # Cypher クエリ実行タブ
    ├── LabelFilter.jsx          # ラベルフィルタータブ
    ├── SearchBar.jsx            # 検索バー
    ├── NodeCard.jsx             # ノードカード（一覧用）
    └── NodeDetail.jsx           # ノード詳細モーダル
```

## 拡張アイデア
- ノード/プロパティの編集・作成・削除（CRUD）
- グラフ可視化ビュー（force-graph 等）
- クエリ履歴の保存
- CSV エクスポート
