**[English version (README.en.md)](./README.en.md)**

# MCP Web Search Proxy

`mcp-search-proxy.js` は、AIエージェントやブラウザからWeb検索機能を簡単に利用できるようにするための、スマートな検索プロキシサーバーです。

## 🌟 特徴

- **2段階スマート検索**: 
  1. まず検索結果の要約（タイトル、URL、説明文）を取得。
  2. 関連性の高い上位サイトの本文を自動的に抽出し、精度の高いコンテキストを提供。
- **天気予報の特別対応**: 
  - 「東京 天気」などのクエリを検知すると、通常のWeb検索ではなく `tenki.jp` から直接天気情報を取得・パースします。
- **文字化け対策**: 
  - `iconv-lite` を使用し、`Shift-JIS` や `EUC-JP` など、異なるエンコーディングのWebサイトからでも日本語を正しく取得します。
- **CORS対応**: 
  - ブラウザから直接 `fetch` して利用可能です。

## 🔧 前提: web-search-mcp のセットアップ

このプロキシは **[web-search-mcp](https://github.com/mrkrsl/web-search-mcp/)** を内部で起動します。
NPM 未公開のため、ソースから手動ビルドが必要です。

```bash
# 1. GitHub から最新リリースの zip をダウンロード・展開
#    https://github.com/mrkrsl/web-search-mcp/releases

# 2. 展開先ディレクトリでビルド
cd /path/to/web-search-mcp
npm install
npx playwright install   # ブラウザ自動化エンジン
npm run build            # dist/index.js が生成される
```

ビルド後、 `dist/index.js` のパスを下記proxy側の `.env` に設定してください。

## 🛠 設定方法

`.env.example` をコピーして `.env` を作成し、環境に合わせて編集してください。

```bash
cp .env.example .env
```

```env
PORT=3001
MCP_SERVER_PATH=/path/to/web-search-mcp/dist/index.js
```

必要に応じて `package.json` に `"type": "module"` を追加すると、Node.js 起動時の ESM warning を避けやすくなります。

```json
{
  "type": "module",
  "dependencies": {
    "iconv-lite": "^0.7.2"
  }
}
```

## 🚀 使い方

### 1. 依存関係のインストール

```bash
npm install
```

### 2. サーバーの起動

```bash
node mcp-search-proxy.js
```

起動に成功すると、以下のメッセージが表示されます。
`MCP Search Proxy ready → http://localhost:3001/search?q=your+query`

## 🌐 本番運用メモ

フロントを `https://example.com/Gemma4-WebGPU/` のようなサブディレクトリで公開する場合、クライアントは既定で `https://example.com/Gemma4-WebGPU/proxy` を参照します。

そのため、本番では Nginx などで `/Gemma4-WebGPU/proxy/` を `localhost:3001` にリバースプロキシします。

例:

```nginx
location /Gemma4-WebGPU/proxy/ {
    proxy_pass http://127.0.0.1:3001/;
    proxy_http_version 1.1;

    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location = /Gemma4-WebGPU/proxy {
    return 301 /Gemma4-WebGPU/proxy/;
}
```

## 🔁 常駐運用

暫定運用なら `nohup`:

```bash
nohup node mcp-search-proxy.js > proxy.log 2>&1 &
```

確認:

```bash
ps aux | grep mcp-search-proxy
tail -f proxy.log
```

本番運用なら `pm2` 推奨:

```bash
pm2 start mcp-search-proxy.js --name gemma4-search-proxy
pm2 save
pm2 startup
```

確認:

```bash
pm2 list
pm2 logs gemma4-search-proxy
```

### 3. 検索リクエストの例

ブラウザや `curl` から以下のようにアクセスして、検索結果をJSON形式で取得できます。

**通常の検索:**
```bash
curl "http://localhost:3001/search?q=MacBook+Neo+の評価"
```

**天気予報の検索:**
```bash
curl "http://localhost:3001/search?q=東京+天気"
```

本番での確認例:

```bash
curl "https://example.com/Gemma4-WebGPU/proxy/search?q=test"
```

## 📚 技術仕様

- **通信プロトコル**: HTTP (JSON API)
- **検索ロジック**: 
  - Stage 1: `full-web-search` (summaryのみ)
  - Stage 2: 検索クエリとのスコアリング
  - Stage 3: `get-single-web-page-content` (上位サイトの本文抽出)
- **天気取得**: `tenki.jp` のHTMLをパースして回答を生成
