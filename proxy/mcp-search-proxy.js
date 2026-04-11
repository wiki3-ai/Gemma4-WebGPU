/**
 * MCP Web Search Proxy — Smart 2-Stage Search with Weather Fallback
 */

import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { request as httpsRequest } from 'node:https';
import { URL } from 'node:url';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import iconv from 'iconv-lite';

// .env 読み込み（依存ライブラリなし）
const __dirname = dirname(fileURLToPath(import.meta.url));
try {
  const envFile = readFileSync(join(__dirname, '.env'), 'utf8');
  for (const line of envFile.split('\n')) {
    const match = line.match(/^([^#=\s][^=]*)=(.*)$/);
    if (match) process.env[match[1].trim()] ??= match[2].trim();
  }
} catch { /* .env がなければ環境変数をそのまま使用 */ }

// =============================================================================
// 設定項目 — proxy/.env で上書き可
// =============================================================================
const PORT = parseInt(process.env.PORT || '3001');
const MCP_SERVER_PATH = process.env.MCP_SERVER_PATH || '/Users/knishika/Desktop/works/web-search-mcp/dist/index.js';
// =============================================================================

const DESC_MAX_LENGTH = 2000;
const MAX_SUMMARIES = 10;
const TOP_EXTRACT_COUNT = 3;

let messageId = 1;
const pendingRequests = new Map();

let mcpProcess = null;
let mcpInitialized = false;
let initPromise = null;
let stdoutBuffer = '';
let serverCapabilities = null;
let availableTools = null;

/**
 * HTTPレスポンスのBodyを適切なエンコーディングでデコードする
 */
function decodeBody(chunks, contentType) {
  const buffer = Buffer.concat(chunks);
  const charsetMatch = contentType && contentType.match(/charset=([^;]+)/i);
  const charset = charsetMatch ? charsetMatch[1].trim().toLowerCase() : 'utf-8';
  
  return iconv.decode(buffer, charset);
}

/**
 * 天気クエリかを判定
 */
function isWeatherQuery(query) {
  const weatherPatterns = [
    /天気| weather | Forecast/i,
    /降水確率|降雨|雨|晴れ|曇り|晴れ|気温/,
    /\d+月\d+日.+(?:東京|大阪|名古屋|札幌|福岡|天気)/,
    /(?:東京|大阪|名古屋|札幌|福岡).+(?:天気|気温|晴れ|雨)/,
  ];
  return weatherPatterns.some(p => p.test(query));
}

/**
 * tenki.jpから天気情報を取得（天気クエリのフォールバック）
 */
function fetchWeatherFromTenki(query) {
  return new Promise((resolve, reject) => {
    const now = new Date();
    const today = now.getDay();
    
    let targetDay = 0; // 今日
    if (query.includes('明日') || query.includes('tomorrow')) targetDay = 1;
    if (query.includes('明後') || query.includes('day after')) targetDay = 2;
    
    let location = 'tokyo';
    if (query.includes('大阪') || query.includes('京都') || query.includes('名古屋')) location = 'osaka';
    if (query.includes('札幌') || query.includes('北海道')) location = 'sapporo';
    if (query.includes('福岡') || query.includes('九州')) location = 'fukuoka';
    if (query.includes('仙台')) location = 'sendai';
    if (query.includes('沖縄')) location = 'okinawa';
    
    const urls = {
      tokyo: 'https://tenki.jp/forecast/3/16/4410/',
      osaka: 'https://tenki.jp/forecast/3/27/6200/',
      sapporo: 'https://tenki.jp/forecast/1/1/0160/',
      fukuoka: 'https://tenki.jp/forecast/4/7/8210/',
      sendai: 'https://tenki.jp/forecast/2/4/0410/',
      okinawa: 'https://tenki.jp/forecast/5/1/9110/',
    };
    
    const url = urls[location];
    console.log(`[proxy:weather] Fetching ${url}`);
    
    const req = httpsRequest(url, { 
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html',
      },
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try {
          const contentType = res.headers['content-type'];
          const data = decodeBody(chunks, contentType);
          const weather = parseTenkiForecast(data, location);
          resolve(weather);
        } catch (e) {
          reject(e);
        }
      });
    });
    
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

/**
 * Googleから天気情報を取得（バックアップ用）
 */
function fetchGoogleWeather(targetDay) {
  return new Promise((resolve, reject) => {
    const dates = ['today', 'tomorrow', 'dayafter'];
    const dateStr = dates[targetDay] || 'today';
    const url = `https://www.google.com/search?q=${encodeURIComponent('天気 ' + dateStr)}`;
    
    const req = httpsRequest(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html',
      },
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try {
          const contentType = res.headers['content-type'];
          const data = decodeBody(chunks, contentType);
          const results = parseGoogleWeatherHtml(data);
          resolve(results);
        } catch (e) {
          reject(e);
        }
      });
    });
    
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

/**
 * Google天気予報HTMLをパース
 */
function parseGoogleWeatherHtml(html) {
  return {
    title: '天気予報情報',
    url: 'https://www.google.com/search?q=天気+予報',
    description: '天気予報の確認には tenki.jp (https://tenki.jp) をご覧ください。',
  };
}

function sendToMcp(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = messageId++;
    const message = { jsonrpc: '2.0', id, method, params };

    const timeout = setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error(`MCP request timeout: ${method}`));
    }, 60000);

    pendingRequests.set(id, { resolve, reject, timeout });

    const data = JSON.stringify(message) + '\n';
    if (!mcpProcess || mcpProcess.stdin.destroyed) {
      clearTimeout(timeout);
      pendingRequests.delete(id);
      reject(new Error('MCP process not available'));
      return;
    }
    mcpProcess.stdin.write(data);
  });
}

function handleMcpStdout(chunk) {
  stdoutBuffer += chunk.toString();
  const lines = stdoutBuffer.split('\n');
  stdoutBuffer = lines.pop() || '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;

    try {
      const message = JSON.parse(trimmed);
      if (message.id !== undefined) {
        const pending = pendingRequests.get(message.id);
        if (pending) {
          clearTimeout(pending.timeout);
          pendingRequests.delete(message.id);
          if (message.error) {
            pending.reject(new Error(message.error.message || JSON.stringify(message.error)));
          } else {
            pending.resolve(message.result);
          }
        }
      }
    } catch {
      // MCPサーバーのログ行は無視
    }
  }
}

function initMcpProcess() {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    return new Promise((resolve, reject) => {
      console.log('[proxy] Starting MCP server...');

      mcpProcess = spawn('node', [MCP_SERVER_PATH], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
      });

      mcpProcess.stdout.on('data', (chunk) => handleMcpStdout(chunk));

      mcpProcess.stderr.on('data', (chunk) => {
        const msg = chunk.toString().trim();
        if (msg) console.log(`[mcp] ${msg}`);
      });

      mcpProcess.on('error', (err) => {
        console.error('[proxy] MCP process error:', err.message);
        reject(err);
      });

      mcpProcess.on('exit', (code) => {
        console.log(`[proxy] MCP process exited (code ${code})`);
        mcpProcess = null;
        mcpInitialized = false;
        initPromise = null;
        serverCapabilities = null;
        availableTools = null;
        for (const [, pending] of pendingRequests) {
          clearTimeout(pending.timeout);
          pending.reject(new Error('MCP process exited'));
        }
        pendingRequests.clear();
      });

      sendToMcp('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'mcp-search-proxy', version: '0.1.0' },
      })
        .then((initResult) => {
          serverCapabilities = initResult?.capabilities || {};

          mcpProcess.stdin.write(JSON.stringify({
            jsonrpc: '2.0',
            method: 'notifications/initialized',
          }) + '\n');

          mcpInitialized = true;
          console.log('[proxy] MCP server initialized');
          resolve();
        })
        .catch(reject);
    });
  })();

  return initPromise;
}

async function ensureMcpReady() {
  if (!mcpInitialized) await initMcpProcess();
}

async function discoverTools() {
  if (availableTools) return availableTools;
  await ensureMcpReady();

  if (serverCapabilities?.tools) {
    const listResult = await sendToMcp('tools/list', {});
    availableTools = listResult?.tools || [];
    console.log(`[proxy] Discovered ${availableTools.length} tools:`, availableTools.map(t => t.name).join(', '));
  }
  return availableTools;
}

function extractQueryTokens(query) {
  const tokens = [];
  const jpRe = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\u3400-\u4DBF]+/g;
  const enRe = /[a-zA-Z]{2,}/g;
  let m;
  while ((m = jpRe.exec(query)) !== null) tokens.push(m[0].toLowerCase());
  while ((m = enRe.exec(query)) !== null) tokens.push(m[0].toLowerCase());
  return tokens;
}

function scoreSnippet(text, queryTokens) {
  if (!text) return 0;
  const lower = text.toLowerCase();
  let score = 0;
  for (const token of queryTokens) {
    if (lower.includes(token)) score += 1;
  }
  return score;
}

function parseSummariesFromFullSearch(text) {
  const results = [];
  const entryRe = /\*\*\d+\.\s+(.+?)\*\*\s*\n\s*URL:\s*(\S+)\s*\n\s*Description:\s*([\s\S]*?)(?=\n\s*\*\*(?:Full Content|Content Preview|Content Extraction Failed)|\n\s*---|$)/g;
  let match;
  while ((match = entryRe.exec(text)) !== null) {
    results.push({
      title: match[1].trim(),
      url: match[2].trim(),
      description: match[3].trim(),
    });
  }
  return results;
}

function extractContentBody(text) {
  const contentRe = /\*\*Content:\*\*\s*([\s\S]*)$/;
  const m = contentRe.exec(text);
  if (m) return m[1].trim();
  return text.replace(/\*\*(?:Page Content from|Title|Word Count|Content Length):\*\*[^\n]*/g, '').trim();
}

/**
 * スマート検索メイン
 */
async function smartSearch(query, limit = 5) {
  // 天気クエリはspecial handling
  if (isWeatherQuery(query)) {
    console.log(`[proxy] Weather query detected: "${query}"`);
    try {
      const weatherResult = await handleWeatherQuery(query);
      if (weatherResult) {
        return { query, results: weatherResult };
      }
    } catch (e) {
      console.log(`[proxy:weather] Fallback: ${e.message}`);
    }
    // 天気処理が失败したら通常の検索にfallback
    console.log('[proxy] Falling back to normal search');
  }

  await ensureMcpReady();
  await discoverTools();

  // Stage 1: full-web-search with includeContent=false
  console.log('[proxy] Stage 1: getting search summaries...');
  const summariesResult = await sendToMcp('tools/call', {
    name: 'full-web-search',
    arguments: {
      query,
      limit: MAX_SUMMARIES,
      includeContent: false,
    },
  });

  let summaries = [];
  if (summariesResult.content && Array.isArray(summariesResult.content)) {
    const text = summariesResult.content.map(c => c.text || '').join('\n');
    summaries = parseSummariesFromFullSearch(text);
  }

  if (summaries.length === 0) {
    console.log('[proxy] No summaries found, trying includeContent=true fallback');
    return fallbackFullSearch(query, limit);
  }

  console.log(`[proxy] Stage 1: got ${summaries.length} summaries`);

  // Stage 2: スコアリング
  const queryTokens = extractQueryTokens(query);
  const scored = summaries.map((s) => ({
    ...s,
    score: scoreSnippet(`${s.title} ${s.description} ${s.url}`, queryTokens),
  }));

  scored.sort((a, b) => b.score - a.score);

  const relevant = scored.filter(s => s.score > 0);
  const topUrls = (relevant.length > 0 ? relevant : scored).slice(0, TOP_EXTRACT_COUNT);

  console.log(`[proxy] Stage 2: top ${topUrls.length} URLs selected`);

  // Stage 3: コンテンツ抽出
  const results = [];
  for (const item of topUrls) {
    try {
      console.log(`[proxy] Stage 3: extracting ${item.url}`);
      const contentResult = await sendToMcp('tools/call', {
        name: 'get-single-web-page-content',
        arguments: { url: item.url, maxContentLength: DESC_MAX_LENGTH },
      });

      let content = '';
      if (contentResult.content && Array.isArray(contentResult.content)) {
        content = contentResult.content.map(c => c.text || '').join('\n');
      }

      const body = extractContentBody(content);

      results.push({
        title: item.title,
        url: item.url,
        description: body.substring(0, DESC_MAX_LENGTH),
      });
    } catch (e) {
      console.log(`[proxy] Stage 3: failed for ${item.url}: ${e.message}`);
      results.push({
        title: item.title,
        url: item.url,
        description: item.description.substring(0, DESC_MAX_LENGTH),
      });
    }
  }

  return { query, results: results.slice(0, limit) };
}

/**
 * 天気クエリの专用handle
 */
async function handleWeatherQuery(query) {
  // まずGoogle Weatherの结构化JSON试试
  const weatherData = await fetchGoogleWeatherStructured(query);
  if (weatherData) {
    return [weatherData];
  }
  
  // fallback: tenki.jpを試す
  try {
    const weather = await fetchWeatherFromTenki(query);
    if (weather) return [weather];
  } catch (e) {
    console.log(`[proxy:weather] tenki.jp failed: ${e.message}`);
  }
  
  return null;
}

/**
 * Google Weather的结构化データを取得
 */
function fetchGoogleWeatherStructured(query) {
  return new Promise((resolve, reject) => {
    // 日本の天気情報を直接取得できるURL
    // Googleの天气API endpoint
    const locations = {
      '東京': 'tokyo',
      '大阪': 'osaka', 
      '名古屋': 'nagoya',
      '札幌': 'sapporo',
      '福岡': 'fukuoka',
      '仙台': 'sendai',
      '沖縄': 'okinawa',
    };
    
    let locationCode = '';
    for (const [name, code] of Object.entries(locations)) {
      if (query.includes(name)) {
        locationCode = code;
        break;
      }
    }
    
    if (!locationCode) locationCode = 'tokyo';
    
    // tenki.jpの直接リンクを生成
    const tenkiLinks = {
      tokyo: 'https://tenki.jp/forecast/3-16-4410.html',
      osaka: 'https://tenki.jp/forecast/3-27-6200.html',
      nagoya: 'https://tenki.jp/forecast/3-23-5100.html',
      sapporo: 'https://tenki.jp/forecast/1-1-0160.html',
      fukuoka: 'https://tenki.jp/forecast/4-7-8210.html',
      sendai: 'https://tenki.jp/forecast/2-4-0410.html',
      okinawa: 'https://tenki.jp/forecast/5-1-9110.html',
    };
    
    const targetUrl = tenkiLinks[locationCode];
    
    // 直接コンテンツを取得
    const req = httpsRequest(targetUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html',
      },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const weather = parseTenkiForecast(data, locationCode);
          resolve(weather);
        } catch (e) {
          reject(e);
        }
      });
    });
    
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

/**
 * tenki.jpの予報ページをパース
 */
function parseTenkiForecast(html, location) {
  // 地域の名称
  const locationNames = {
    tokyo: '東京',
    osaka: '大阪',
    nagoya: '名古屋',
    sapporo: '札幌',
    fukuoka: '福岡',
    sendai: '仙台',
    okinawa: '沖縄',
  };

  // HTMLからデータを抽出するための正規表現
  // tenki.jpの構造変更に備え、可能な限り汎用的なパターンを使用
  
  // 1. 天気 (例: 晴れ, 曇り)
  // <p class="weather">晴れ</p のような形式を想定
  const weatherRe = /<p[^>]*class="weather"[^>]*>([^<]+)<\/p>/i;
  const weatherMatch = html.match(weatherRe);
  const weather = weatherMatch ? weatherMatch[1].trim() : '';

  // 2. 気温 (最高・最低)
  // 例: <td>25℃</td>
  const tempRe = /<td>(\d+)℃<\/td>/g;
  const temps = [];
  let tempMatch;
  while ((tempMatch = tempRe.exec(html)) !== null && temps.length < 2) {
    temps.push(tempMatch[1]);
  }

  // 3. 降水確率 (例: 10%)
  // <span class="precipitation">10%</span> などの形式を想定
  const rainRe = /(\d+)%/g;
  const rains = [];
  let rainMatch;
  while ((rainMatch = rainRe.exec(html)) !== null && rains.length < 3) {
    rains.push(rainMatch[1]);
  }

  const today = new Date();
  const dateStr = `${today.getMonth() + 1}月${today.getDate()}日`;
  const locName = locationNames[location] || '指定地域';

  let description = `${dateStr}の${locName}の天気\n`;
  if (weather) description += `天気: ${weather}\n`;
  if (temps[0]) description += `最高気温: ${temps[0]}℃\n`;
  if (temps[1]) description += `最低気温: ${temps[1]}℃\n`;
  if (rains.length > 0) {
    description += `降水確率: ${rains.join(' / ')} (時間帯別)\n`;
  }

  description += '\n詳細: https://tenki.jp';

  return {
    title: `${locName}の天気予報 - ${dateStr}`,
    url: 'https://tenki.jp',
    description: description.substring(0, DESC_MAX_LENGTH),
  };
}

async function fallbackFullSearch(query, limit) {
  const result = await sendToMcp('tools/call', {
    name: 'full-web-search',
    arguments: {
      query,
      limit,
      includeContent: true,
      maxContentLength: DESC_MAX_LENGTH,
    },
  });

  const results = [];
  if (result.content && Array.isArray(result.content)) {
    const text = result.content.map(c => c.text || '').join('\n');
    const parsed = parseSummariesFromFullSearch(text);
    results.push(...parsed);
  }

  return { query, results: results.slice(0, limit) };
}

// ─── HTTP サーバー ────────────────────────────────────────────────────────────

const server = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  let url;
  try { url = new URL(req.url, `http://localhost:${PORT}`); }
  catch { res.writeHead(400); res.end(JSON.stringify({ error: 'Bad request' })); return; }

  if (url.pathname !== '/search') {
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Use GET /search?q=query' }));
    return;
  }

  const query = url.searchParams.get('q')?.trim();
  if (!query) {
    res.writeHead(400);
    res.end(JSON.stringify({ error: 'Missing parameter: q' }));
    return;
  }

  const limit = parseInt(url.searchParams.get('limit') || '5', 10);

  try {
    console.log(`[Search] "${query}" (via MCP smart search)`);
    const results = await smartSearch(query, limit);
    console.log(`[Search] ${results.results.length} results`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(results));
  } catch (e) {
    console.error('[Search] Error:', e.message);
    res.writeHead(500);
    res.end(JSON.stringify({ error: e.message }));
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[proxy] Port ${PORT} is already in use`);
  } else {
    console.error('[proxy] Server error:', err.message);
  }
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`MCP Search Proxy ready → http://localhost:${PORT}/search?q=your+query`);
});

process.on('SIGINT', () => {
  console.log('[proxy] Shutting down...');
  if (mcpProcess) mcpProcess.kill('SIGTERM');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000);
});

process.on('SIGTERM', () => {
  console.log('[proxy] Shutting down...');
  if (mcpProcess) mcpProcess.kill('SIGTERM');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000);
});
