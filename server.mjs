import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const requireFromOpenClaw = createRequire('/home/old/src/openclaw/package.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const STORE_PATH = path.join(DATA_DIR, 'accounts.json');
const PORT = Number(process.env.PORT || 1455);
const HOST = process.env.HOST || '127.0.0.1';
const OPENAI_PROXY = process.env.OPENAI_PROXY || 'http://localhost:7890';

const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const AUTHORIZE_URL = 'https://auth.openai.com/oauth/authorize';
const TOKEN_URL = 'https://auth.openai.com/oauth/token';
const USAGE_URL = 'https://chatgpt.com/backend-api/wham/usage';
const REDIRECT_URI = 'http://localhost:1455/auth/callback';
const SCOPE = 'openid profile email offline_access';
const JWT_CLAIM_PATH = 'https://api.openai.com/auth';
const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

const pendingLogins = new Map();

let proxyDispatcher = null;
try {
  const { ProxyAgent } = requireFromOpenClaw('undici');
  proxyDispatcher = new ProxyAgent(OPENAI_PROXY);
  console.log(`Using OpenAI proxy: ${OPENAI_PROXY}`);
} catch (err) {
  console.warn(`ProxyAgent unavailable, falling back to direct fetch: ${String(err?.message || err)}`);
}

function fetchOpenAI(url, options = {}) {
  return fetch(url, proxyDispatcher ? { ...options, dispatcher: proxyDispatcher } : options);
}

function ensureStore() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STORE_PATH)) {
    fs.writeFileSync(
      STORE_PATH,
      JSON.stringify({ version: 1, accounts: {} }, null, 2) + '\n',
      'utf8',
    );
  }
}

function loadStore() {
  ensureStore();
  const raw = fs.readFileSync(STORE_PATH, 'utf8');
  const parsed = JSON.parse(raw || '{}');
  parsed.accounts ||= {};
  return parsed;
}

function saveStore(store) {
  ensureStore();
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2) + '\n', 'utf8');
}

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function sendHtml(res, status, html) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

function maskEmail(email) {
  if (!email || !email.includes('@')) return null;
  const [name, domain] = email.split('@');
  if (!name || !domain) return email;
  if (name.length <= 3) return `${name}*@${domain}`;
  return `${name.slice(0, 4)}***@${domain}`;
}

function base64urlEncode(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function generatePKCE() {
  const verifier = base64urlEncode(crypto.randomBytes(32));
  const challenge = base64urlEncode(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

function createState() {
  return crypto.randomBytes(16).toString('hex');
}

function decodeJwt(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = payload + '='.repeat((4 - (payload.length % 4 || 4)) % 4);
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

function getAccountId(accessToken) {
  const payload = decodeJwt(accessToken);
  const auth = payload?.[JWT_CLAIM_PATH];
  const accountId = auth?.chatgpt_account_id;
  return typeof accountId === 'string' && accountId ? accountId : null;
}

function getTokenProfile(accessToken) {
  const payload = decodeJwt(accessToken) || {};
  const auth = payload[JWT_CLAIM_PATH] || {};
  const profile = payload['https://api.openai.com/profile'] || {};
  return {
    email: typeof profile.email === 'string' ? profile.email : null,
    planTypeFromJwt: typeof auth.chatgpt_plan_type === 'string' ? auth.chatgpt_plan_type : null,
    accountId: typeof auth.chatgpt_account_id === 'string' ? auth.chatgpt_account_id : null,
  };
}

function resolveSecondaryWindowLabel({ windowHours, secondaryResetAt, primaryResetAt }) {
  const WEEKLY_RESET_GAP_SECONDS = 3 * 24 * 60 * 60;
  if (windowHours >= 168) return 'Week';
  if (windowHours < 24) return `${windowHours}h`;
  if (
    typeof secondaryResetAt === 'number' &&
    typeof primaryResetAt === 'number' &&
    secondaryResetAt - primaryResetAt >= WEEKLY_RESET_GAP_SECONDS
  ) {
    return 'Week';
  }
  return 'Day';
}

function toUsageSnapshot(data) {
  const windows = [];
  if (data?.rate_limit?.primary_window) {
    const pw = data.rate_limit.primary_window;
    const windowHours = Math.round((pw.limit_window_seconds || 10800) / 3600);
    windows.push({
      label: `${windowHours}h`,
      usedPercent: Number(pw.used_percent || 0),
      resetAt: pw.reset_at ? pw.reset_at * 1000 : null,
    });
  }
  if (data?.rate_limit?.secondary_window) {
    const sw = data.rate_limit.secondary_window;
    const windowHours = Math.round((sw.limit_window_seconds || 86400) / 3600);
    windows.push({
      label: resolveSecondaryWindowLabel({
        windowHours,
        primaryResetAt: data?.rate_limit?.primary_window?.reset_at,
        secondaryResetAt: sw.reset_at,
      }),
      usedPercent: Number(sw.used_percent || 0),
      resetAt: sw.reset_at ? sw.reset_at * 1000 : null,
    });
  }
  let plan = data?.plan_type || null;
  if (data?.credits?.balance !== undefined && data?.credits?.balance !== null) {
    const balance = typeof data.credits.balance === 'number' ? data.credits.balance : Number(data.credits.balance || 0);
    plan = plan ? `${plan} ($${balance.toFixed(2)})` : `$${balance.toFixed(2)}`;
  }
  return { plan, windows, raw: data };
}

async function exchangeAuthorizationCode(code, verifier) {
  const response = await fetchOpenAI(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      code,
      code_verifier: verifier,
      redirect_uri: REDIRECT_URI,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Token exchange failed: ${response.status} ${text}`.trim());
  }

  const json = await response.json();
  if (!json.access_token || !json.refresh_token || typeof json.expires_in !== 'number') {
    throw new Error('Token response missing fields');
  }

  const accountId = getAccountId(json.access_token);
  if (!accountId) throw new Error('Failed to extract accountId from token');

  return {
    access: json.access_token,
    refresh: json.refresh_token,
    expires: Date.now() + json.expires_in * 1000,
    accountId,
  };
}

async function refreshAccount(account) {
  const response = await fetchOpenAI(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: account.refresh,
      client_id: CLIENT_ID,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Refresh failed: ${response.status} ${text}`.trim());
  }

  const json = await response.json();
  if (!json.access_token || !json.refresh_token || typeof json.expires_in !== 'number') {
    throw new Error('Refresh response missing fields');
  }

  const accountId = getAccountId(json.access_token);
  if (!accountId) throw new Error('Failed to extract accountId from refreshed token');

  const profile = getTokenProfile(json.access_token);
  return {
    ...account,
    access: json.access_token,
    refresh: json.refresh_token,
    expires: Date.now() + json.expires_in * 1000,
    accountId,
    email: profile.email || account.email || null,
    planTypeFromJwt: profile.planTypeFromJwt || account.planTypeFromJwt || null,
    updatedAt: Date.now(),
  };
}

async function fetchUsage(account) {
  const headers = {
    Authorization: `Bearer ${account.access}`,
    'User-Agent': 'CodexUsageDashboard',
    Accept: 'application/json',
  };
  if (account.accountId) headers['ChatGPT-Account-Id'] = account.accountId;

  const response = await fetchOpenAI(USAGE_URL, { method: 'GET', headers });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const err = new Error(`Usage request failed: ${response.status} ${text}`.trim());
    err.status = response.status;
    throw err;
  }
  return toUsageSnapshot(await response.json());
}

async function refreshUsageForSlot(slot) {
  const store = loadStore();
  const account = store.accounts[slot];
  if (!account) {
    return { ok: false, error: 'Slot is empty' };
  }

  let working = { ...account };
  try {
    if (!working.access || Date.now() >= Number(working.expires || 0)) {
      working = await refreshAccount(working);
    }

    let usage;
    try {
      usage = await fetchUsage(working);
    } catch (err) {
      if (err?.status === 401 || err?.status === 403) {
        working = await refreshAccount(working);
        usage = await fetchUsage(working);
      } else {
        throw err;
      }
    }

    working.usage = usage;
    working.lastCheckedAt = Date.now();
    working.lastError = null;
    store.accounts[slot] = working;
    saveStore(store);
    return { ok: true, account: sanitizeAccount(slot, working) };
  } catch (err) {
    working.lastError = String(err?.message || err);
    working.lastCheckedAt = Date.now();
    store.accounts[slot] = working;
    saveStore(store);
    return { ok: false, error: working.lastError, account: sanitizeAccount(slot, working) };
  }
}

function sanitizeAccount(slot, account) {
  if (!account) {
    return { slot, connected: false };
  }
  return {
    slot,
    connected: true,
    email: account.email || null,
    emailMasked: maskEmail(account.email),
    accountId: account.accountId || null,
    planTypeFromJwt: account.planTypeFromJwt || null,
    usage: account.usage || null,
    expires: account.expires || null,
    updatedAt: account.updatedAt || null,
    lastCheckedAt: account.lastCheckedAt || null,
    lastError: account.lastError || null,
  };
}

function getAccountsView() {
  const store = loadStore();
  return Object.keys(store.accounts).sort().map((slot) => sanitizeAccount(slot, store.accounts[slot]));
}

async function parseBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

async function handleApi(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/accounts') {
    return json(res, 200, { accounts: getAccountsView() });
  }

  if (req.method === 'POST' && url.pathname === '/api/refresh-all') {
    const store = loadStore();
    const results = [];
    for (const slot of Object.keys(store.accounts)) {
      results.push(await refreshUsageForSlot(slot));
    }
    return json(res, 200, { ok: true, results, accounts: getAccountsView() });
  }

  if (req.method === 'POST' && url.pathname === '/api/accounts/create') {
    const store = loadStore();
    const existing = Object.keys(store.accounts)
      .map(s => parseInt(s.replace('slot', ''), 10))
      .filter(n => !isNaN(n));
    const next = existing.length ? Math.max(...existing) + 1 : 1;
    const slotName = `slot${next}`;
    store.accounts[slotName] = null;
    saveStore(store);
    return json(res, 200, { ok: true, slot: slotName, accounts: getAccountsView() });
  }

  const slotMatch = url.pathname.match(/^\/api\/accounts\/(slot\d+)\/(login|refresh|logout|delete)$/);
  if (!slotMatch) return false;

  const [, slot, action] = slotMatch;

  if (action !== 'login') {
    const store = loadStore();
    if (!(slot in store.accounts)) {
      json(res, 404, { ok: false, error: 'Unknown slot' });
      return true;
    }
  }

  if (req.method !== 'POST') {
    json(res, 405, { ok: false, error: 'Method not allowed' });
    return true;
  }

  if (action === 'login') {
    const { verifier, challenge } = await generatePKCE();
    const state = createState();
    const startedAt = Date.now();
    pendingLogins.set(state, { slot, verifier, startedAt });

    for (const [key, pending] of pendingLogins.entries()) {
      if (startedAt - pending.startedAt > 15 * 60 * 1000) pendingLogins.delete(key);
    }

    const authUrl = new URL(AUTHORIZE_URL);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
    authUrl.searchParams.set('scope', SCOPE);
    authUrl.searchParams.set('code_challenge', challenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('id_token_add_organizations', 'true');
    authUrl.searchParams.set('codex_cli_simplified_flow', 'true');
    authUrl.searchParams.set('originator', 'codex-usage-dashboard');

    json(res, 200, { ok: true, authUrl: authUrl.toString(), slot });
    return true;
  }

  if (action === 'refresh') {
    const result = await refreshUsageForSlot(slot);
    json(res, result.ok ? 200 : 500, result);
    return true;
  }

  if (action === 'logout') {
    const store = loadStore();
    store.accounts[slot] = null;
    saveStore(store);
    json(res, 200, { ok: true, slot, account: sanitizeAccount(slot, null) });
    return true;
  }

  if (action === 'delete') {
    const store = loadStore();
    if (store.accounts[slot]) {
      json(res, 400, { ok: false, error: 'Сначала отключите аккаунт' });
      return true;
    }
    delete store.accounts[slot];
    saveStore(store);
    json(res, 200, { ok: true, slot, accounts: getAccountsView() });
    return true;
  }

  return false;
}

async function handleAuthCallback(req, res, url) {
  const state = url.searchParams.get('state');
  const code = url.searchParams.get('code');
  if (!state || !code) {
    return sendHtml(res, 400, '<h1>OAuth error</h1><p>Missing state or code.</p>');
  }

  const pending = pendingLogins.get(state);
  if (!pending) {
    return sendHtml(res, 400, '<h1>OAuth error</h1><p>Unknown or expired login state.</p>');
  }

  try {
    const creds = await exchangeAuthorizationCode(code, pending.verifier);
    const profile = getTokenProfile(creds.access);
    const store = loadStore();
    store.accounts[pending.slot] = {
      slot: pending.slot,
      access: creds.access,
      refresh: creds.refresh,
      expires: creds.expires,
      accountId: creds.accountId,
      email: profile.email,
      planTypeFromJwt: profile.planTypeFromJwt,
      usage: null,
      updatedAt: Date.now(),
      lastCheckedAt: null,
      lastError: null,
    };
    saveStore(store);
    pendingLogins.delete(state);

    await refreshUsageForSlot(pending.slot);

    return sendHtml(
      res,
      200,
      `<!doctype html><html><head><meta charset="utf-8"><title>OAuth complete</title><style>body{font-family:system-ui;margin:40px;background:#0b1020;color:#e6edf3}a{color:#8ab4ff}</style></head><body><h1>Аккаунт подключён</h1><p>Слот: <b>${pending.slot}</b></p><p>Можно закрыть вкладку и вернуться в <a href="/">dashboard</a>.</p><script>try{window.opener&&window.opener.postMessage({type:'codex-login-complete',slot:${JSON.stringify(pending.slot)}},'*')}catch(e){}</script></body></html>`,
    );
  } catch (err) {
    pendingLogins.delete(state);
    return sendHtml(
      res,
      500,
      `<!doctype html><html><head><meta charset="utf-8"><title>OAuth failed</title></head><body><h1>OAuth failed</h1><pre>${String(err?.message || err)}</pre><p><a href="/">Back</a></p></body></html>`,
    );
  }
}

function serveStatic(req, res, url) {
  let filePath = path.join(PUBLIC_DIR, url.pathname === '/' ? 'index.html' : url.pathname);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { 'Content-Type': CONTENT_TYPES[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  try {
    if (url.pathname === '/auth/callback') {
      await handleAuthCallback(req, res, url);
      return;
    }

    const handledApi = await handleApi(req, res, url);
    if (handledApi !== false) return;

    if (req.method === 'GET') {
      serveStatic(req, res, url);
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  } catch (err) {
    json(res, 500, { ok: false, error: String(err?.message || err) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Codex Usage Dashboard: http://${HOST}:${PORT}`);
});
