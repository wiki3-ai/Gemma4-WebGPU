# MCP Web Search Proxy

`mcp-search-proxy.js` is a smart search proxy server that makes it easy for AI agents and browsers to perform web searches.

## 🌟 Features

- **Two-stage smart search**: 
  1. First, retrieve search result summaries (title, URL, description).
  2. Then, automatically extract the body text of the most relevant sites, providing high-quality context.
- **Special weather handling**: 
  - Queries like "Tokyo weather" are detected and, instead of a normal web search, weather information is fetched and parsed directly from `tenki.jp`.
- **Character encoding support**: 
  - Uses `iconv-lite` to correctly decode Japanese text from websites encoded in `Shift-JIS`, `EUC-JP`, and other encodings.
- **CORS support**: 
  - Can be called directly from the browser via `fetch`.

## 🔧 Prerequisite: Setting up web-search-mcp

This proxy internally launches **[web-search-mcp](https://github.com/mrkrsl/web-search-mcp/)**. Since it is not published on NPM, you need to build it from source manually.

```bash
# 1. Download and extract the latest release zip from GitHub
#    https://github.com/mrkrsl/web-search-mcp/releases

# 2. Build in the extracted directory
cd /path/to/web-search-mcp
npm install
npx playwright install   # Browser automation engine
npm run build            # Generates dist/index.js
```

After building, set the path to `dist/index.js` in the proxy's `.env` file (see below).

## 🛠 Configuration

Copy `.env.example` to `.env` and edit it to match your environment.

```bash
cp .env.example .env
```

```env
PORT=3001
MCP_SERVER_PATH=/path/to/web-search-mcp/dist/index.js
```

Optionally add `"type": "module"` to `package.json` to avoid Node.js ESM warnings.

```json
{
  "type": "module",
  "dependencies": {
    "iconv-lite": "^0.7.2"
  }
}
```

## 🚀 Usage

### 1. Install dependencies

```bash
npm install
```

### 2. Start the server

```bash
node mcp-search-proxy.js
```

On successful startup, the following message is displayed:
`MCP Search Proxy ready → http://localhost:3001/search?q=your+query`

## 🌐 Production Deployment Notes

When the frontend is served from a subdirectory such as `https://example.com/Gemma4-WebGPU/`, the client defaults to `https://example.com/Gemma4-WebGPU/proxy`.

In production, use Nginx (or similar) to reverse-proxy `/Gemma4-WebGPU/proxy/` to `localhost:3001`.

Example:

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

## 🔁 Running as a Daemon

For quick/temporary use, `nohup` works:

```bash
nohup node mcp-search-proxy.js > proxy.log 2>&1 &
```

To verify:

```bash
ps aux | grep mcp-search-proxy
tail -f proxy.log
```

For production, `pm2` is recommended:

```bash
pm2 start mcp-search-proxy.js --name gemma4-search-proxy
pm2 save
pm2 startup
```

To verify:

```bash
pm2 list
pm2 logs gemma4-search-proxy
```

### 3. Search Request Examples

You can query via browser or `curl` to get search results in JSON format.

**Normal search:**
```bash
curl "http://localhost:3001/search?q=MacBook+Neo+review"
```

**Weather search:**
```bash
curl "http://localhost:3001/search?q=Tokyo+weather"
```

Production example:

```bash
curl "https://example.com/Gemma4-WebGPU/proxy/search?q=test"
```

## 📚 Technical Specifications

- **Protocol**: HTTP (JSON API)
- **Search Logic**: 
  - Stage 1: `full-web-search` (summaries only)
  - Stage 2: Scoring against search query tokens
  - Stage 3: `get-single-web-page-content` (body extraction of top sites)
- **Weather Retrieval**: Parses HTML from `tenki.jp` to generate an answer
