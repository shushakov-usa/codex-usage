import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ProxyAgent, fetch as undiciFetch } from 'undici';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, 'dist');
const DATA_DIR = path.join(__dirname, 'data');
const STORE_PATH = path.join(DATA_DIR, 'accounts.json');
const SETTINGS_PATH = path.join(DATA_DIR, 'settings.json');
const HISTORY_PATH = path.join(DATA_DIR, 'history.json');
const DEFAULT_SETTINGS = { liveInterval: 30, backgroundInterval: 300 };
const MAX_HISTORY_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const PORT = Number(process.env.PORT || 1455);
const HOST = process.env.HOST || '127.0.0.1';
const OPENAI_PROXY = process.env.OPENAI_PROXY || '';

const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const AUTHORIZE_URL = 'https://auth.openai.com/oauth/authorize';
const TOKEN_URL = 'https://auth.openai.com/oauth/token';
const USAGE_URL = 'https://chatgpt.com/backend-api/wham/usage';

const REDIRECT_URI = `http://localhost:${PORT}/auth/callback`;
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

const PROXY_URL = OPENAI_PROXY || process.env.https_proxy || process.env.http_proxy || '';
const proxyDispatcher = PROXY_URL ? new ProxyAgent(PROXY_URL) : null;
if (proxyDispatcher) console.log(`Proxy: ${PROXY_URL}`);

function fetchOpenAI(url, options = {}) {
  return proxyDispatcher
    ? undiciFetch(url, { ...options, dispatcher: proxyDispatcher })
    : globalThis.fetch(url, options);
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

function loadSettings() {
  ensureStore();
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      const raw = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
      // Migrate legacy refreshInterval → liveInterval + backgroundInterval
      if ('refreshInterval' in raw && !('liveInterval' in raw)) {
        const migrated = {
          liveInterval: raw.refreshInterval || 30,
          backgroundInterval: raw.backgroundInterval || 300,
        };
        saveSettings(migrated);
        return migrated;
      }
      return { ...DEFAULT_SETTINGS, ...raw };
    }
  } catch {}
  return { ...DEFAULT_SETTINGS };
}

function saveSettings(settings) {
  ensureStore();
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n', 'utf8');
}

function loadHistory() {
  try {
    if (fs.existsSync(HISTORY_PATH)) {
      return JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8'));
    }
  } catch {}
  return { snapshots: [] };
}

function saveHistory(history) {
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history) + '\n', 'utf8');
}

function appendSnapshot() {
  const history = loadHistory();
  const now = Date.now();

  // Don't store more than one snapshot per 5 minutes
  const lastTs = history.snapshots.length > 0
    ? history.snapshots[history.snapshots.length - 1].timestamp
    : 0;
  if (now - lastTs < 5 * 60 * 1000) return;

  const store = loadStore();
  const accounts = {};
  for (const [slot, account] of Object.entries(store.accounts)) {
    if (!account || !account.usage) continue;
    accounts[slot] = {
      email: account.email || null,
      windows: (account.usage.windows || []).map(w => ({
        label: w.label,
        usedPercent: w.usedPercent,
      })),
    };
  }

  if (Object.keys(accounts).length > 0) {
    history.snapshots.push({ timestamp: now, accounts });
  }

  // Prune entries older than 30 days
  const cutoff = now - MAX_HISTORY_AGE_MS;
  history.snapshots = history.snapshots.filter(s => s.timestamp > cutoff);

  saveHistory(history);
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

function extractEntitlementFromIdToken(idToken) {
  if (!idToken) return null;
  try {
    const payload = decodeJwt(idToken);
    const auth = payload?.[JWT_CLAIM_PATH] || {};
    const plan = auth.chatgpt_plan_type || null;
    const activeUntil = auth.chatgpt_subscription_active_until || null;
    const active = plan && plan !== 'free' && !!activeUntil;
    return { active, plan, activeUntil };
  } catch {
    return null;
  }
}

function normalizeWindowLabel(windowHours) {
  if (windowHours >= 168) return 'Week';
  if (windowHours >= 24) return 'Day';
  return `${windowHours}h`;
}

function resolveSecondaryWindowLabel({ windowHours, secondaryResetAt, primaryResetAt }) {
  const WEEKLY_RESET_GAP_SECONDS = 3 * 24 * 60 * 60;
  if (
    typeof secondaryResetAt === 'number' &&
    typeof primaryResetAt === 'number' &&
    secondaryResetAt - primaryResetAt >= WEEKLY_RESET_GAP_SECONDS
  ) {
    return 'Week';
  }
  return normalizeWindowLabel(windowHours);
}

function toUsageSnapshot(data) {
  const windows = [];
  if (data?.rate_limit?.primary_window) {
    const pw = data.rate_limit.primary_window;
    const windowHours = Math.round((pw.limit_window_seconds || 10800) / 3600);
    windows.push({
      label: normalizeWindowLabel(windowHours),
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
    if (balance > 0) plan = plan ? `${plan} ($${balance.toFixed(2)})` : `$${balance.toFixed(2)}`;
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

  const entitlement = extractEntitlementFromIdToken(json.id_token);
  return {
    access: json.access_token,
    refresh: json.refresh_token,
    expires: Date.now() + json.expires_in * 1000,
    accountId,
    entitlement,
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
  const entitlement = extractEntitlementFromIdToken(json.id_token);
  return {
    ...account,
    access: json.access_token,
    refresh: json.refresh_token,
    expires: Date.now() + json.expires_in * 1000,
    accountId,
    email: profile.email || account.email || null,
    planTypeFromJwt: profile.planTypeFromJwt || account.planTypeFromJwt || null,
    entitlement: entitlement || account.entitlement || null,
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
    const needsTokenRefresh = !working.access
      || Date.now() >= Number(working.expires || 0)
      || working.entitlement == null
      || !('activeUntil' in working.entitlement);
    if (needsTokenRefresh) {
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
    // Reload store to avoid overwriting parallel slot updates
    const freshStore = loadStore();
    freshStore.accounts[slot] = working;
    saveStore(freshStore);
    return { ok: true, account: sanitizeAccount(slot, working) };
  } catch (err) {
    working.lastError = String(err?.message || err);
    working.lastCheckedAt = Date.now();
    const freshStore = loadStore();
    freshStore.accounts[slot] = working;
    saveStore(freshStore);
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
    accountId: account.accountId || null,
    planTypeFromJwt: account.planTypeFromJwt || null,
    usage: account.usage || null,
    expires: account.expires || null,
    updatedAt: account.updatedAt || null,
    lastCheckedAt: account.lastCheckedAt || null,
    lastError: account.lastError || null,
    entitlement: account.entitlement || null,
  };
}

function getAccountsView() {
  const store = loadStore();
  return Object.keys(store.accounts).sort().map((slot) => sanitizeAccount(slot, store.accounts[slot]));
}

function findDuplicateSlot(store, accountId, email, excludeSlot) {
  for (const [slot, acct] of Object.entries(store.accounts)) {
    if (slot === excludeSlot || !acct) continue;
    if (accountId && acct.accountId === accountId) return { slot, email: acct.email };
    if (email && acct.email === email) return { slot, email: acct.email };
  }
  return null;
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
    const slots = Object.keys(store.accounts);
    const results = await Promise.all(slots.map((slot) => refreshUsageForSlot(slot)));
    appendSnapshot();
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

  if (url.pathname === '/api/settings') {
    if (req.method === 'GET') {
      return json(res, 200, loadSettings());
    }
    if (req.method === 'PUT') {
      const body = await parseBody(req);
      const current = loadSettings();
      const updated = { ...current };
      if ('liveInterval' in body) {
        const v = Number(body.liveInterval);
        if (isNaN(v) || v < 0) return json(res, 400, { ok: false, error: 'Invalid liveInterval' });
        updated.liveInterval = v;
      }
      if ('backgroundInterval' in body) {
        const v = Number(body.backgroundInterval);
        if (isNaN(v) || v < 60) return json(res, 400, { ok: false, error: 'backgroundInterval must be >= 60' });
        updated.backgroundInterval = v;
      }
      // Migrate legacy field
      if ('refreshInterval' in body && !('liveInterval' in body) && !('backgroundInterval' in body)) {
        updated.liveInterval = Number(body.refreshInterval) || 30;
      }
      saveSettings(updated);
      startAutoRefresh();
      return json(res, 200, { ok: true, ...updated });
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/history') {
    const range = url.searchParams.get('range') || '24h';
    const rangeMs = { '24h': 86400000, '7d': 604800000, '30d': 2592000000 }[range] || 86400000;
    const cutoff = Date.now() - rangeMs;
    const history = loadHistory();
    const filtered = history.snapshots.filter(s => s.timestamp > cutoff);
    return json(res, 200, { snapshots: filtered });
  }

  const slotMatch = url.pathname.match(/^\/api\/accounts\/(slot\d+)\/(login|refresh|logout|delete|exchange)$/);
  if (!slotMatch) return false;

  const [, slot, action] = slotMatch;

  if (action !== 'login' && action !== 'exchange') {
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

  if (action === 'exchange') {
    const body = await parseBody(req);
    const callbackUrl = String(body.url || '');
    let parsed;
    try {
      parsed = new URL(callbackUrl);
    } catch {
      json(res, 400, { ok: false, error: 'Невалидный URL' });
      return true;
    }
    const code = parsed.searchParams.get('code');
    const state = parsed.searchParams.get('state');
    if (!code || !state) {
      json(res, 400, { ok: false, error: 'URL не содержит code или state' });
      return true;
    }
    const pending = pendingLogins.get(state);
    if (!pending) {
      json(res, 400, { ok: false, error: 'Неизвестный или истёкший state' });
      return true;
    }
    try {
      const creds = await exchangeAuthorizationCode(code, pending.verifier);
      const profile = getTokenProfile(creds.access);
      const store = loadStore();
      const dup = findDuplicateSlot(store, creds.accountId, profile.email, pending.slot);
      if (dup) {
        pendingLogins.delete(state);
        json(res, 409, { ok: false, error: `Этот аккаунт уже подключён (${dup.email || dup.slot})` });
        return true;
      }
      store.accounts[pending.slot] = {
        slot: pending.slot,
        access: creds.access,
        refresh: creds.refresh,
        expires: creds.expires,
        accountId: creds.accountId,
        email: profile.email,
        planTypeFromJwt: profile.planTypeFromJwt,
        entitlement: creds.entitlement || null,
        usage: null,
        updatedAt: Date.now(),
        lastCheckedAt: null,
        lastError: null,
      };
      saveStore(store);
      pendingLogins.delete(state);
      await refreshUsageForSlot(pending.slot);
      json(res, 200, { ok: true, slot: pending.slot, accounts: getAccountsView() });
    } catch (err) {
      console.error(`Exchange failed for ${pending.slot}:`, err?.message || err);
      pendingLogins.delete(state);
      json(res, 500, { ok: false, error: String(err?.message || err) });
    }
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
    const dup = findDuplicateSlot(store, creds.accountId, profile.email, pending.slot);
    if (dup) {
      pendingLogins.delete(state);
      return sendHtml(res, 409, `<!doctype html><html><head><meta charset="utf-8"><title>Duplicate</title><style>body{font-family:system-ui;margin:40px;background:#0b1020;color:#e6edf3}a{color:#8ab4ff}</style></head><body><h1>Аккаунт уже подключён</h1><p>Этот аккаунт уже используется (${dup.email || dup.slot}).</p><p><a href="/">Вернуться в dashboard</a></p></body></html>`);
    }
    store.accounts[pending.slot] = {
      slot: pending.slot,
      access: creds.access,
      refresh: creds.refresh,
      expires: creds.expires,
      accountId: creds.accountId,
      email: profile.email,
      planTypeFromJwt: profile.planTypeFromJwt,
      entitlement: creds.entitlement || null,
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

async function autoRefreshAll() {
  const store = loadStore();
  const connected = Object.keys(store.accounts).filter(s => store.accounts[s]?.refresh);
  if (!connected.length) return;
  console.log(`Auto-refresh: ${connected.length} account(s)`);
  const results = await Promise.all(connected.map(s => refreshUsageForSlot(s)));
  const ok = results.filter(r => r.ok).length;
  const fail = results.filter(r => !r.ok).length;
  console.log(`Auto-refresh done: ${ok} ok, ${fail} failed`);
}

let autoRefreshTimer = null;

function startAutoRefresh() {
  if (autoRefreshTimer) clearInterval(autoRefreshTimer);
  autoRefreshTimer = null;
  const settings = loadSettings();
  const interval = (settings.backgroundInterval || 300) * 1000;
  if (interval <= 0) {
    console.log('Background refresh: disabled');
    return;
  }
  console.log(`Background refresh: every ${settings.backgroundInterval || 300}s`);
  autoRefreshTimer = setInterval(async () => {
    await autoRefreshAll();
    appendSnapshot();
  }, interval);
}

// Initial refresh 10s after startup
setTimeout(async () => {
  await autoRefreshAll();
  appendSnapshot();
}, 10_000);

startAutoRefresh();
