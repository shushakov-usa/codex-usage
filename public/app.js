const cardsEl = document.getElementById('cards');
const tpl = document.getElementById('cardTpl');
const refreshAllBtn = document.getElementById('refreshAllBtn');

function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString();
}

function fmtPercent(used) {
  const left = Math.max(0, 100 - Number(used || 0));
  return { used: Number(used || 0).toFixed(0), left: left.toFixed(0) };
}

function kv(label, value) {
  const div = document.createElement('div');
  div.className = 'kv';
  div.innerHTML = `<span class="label">${label}</span><span class="value">${value ?? '—'}</span>`;
  return div;
}

function shortAccountId(value) {
  if (!value) return '—';
  return value.length > 12 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;
}

function accountLabel(account) {
  if (account.emailMasked) return account.emailMasked;
  if (account.email) return account.email;
  if (account.accountId) return `ID ${shortAccountId(account.accountId)}`;
  return 'Не подключён';
}

function renderAccount(account) {
  const node = tpl.content.firstElementChild.cloneNode(true);
  const title = node.querySelector('.slotTitle');
  const accountTitle = node.querySelector('.accountTitle');
  const badge = node.querySelector('.statusBadge');
  const meta = node.querySelector('.meta');
  const usage = node.querySelector('.usage');
  const error = node.querySelector('.error');

  title.textContent = account.slot;
  accountTitle.textContent = accountLabel(account);
  badge.textContent = account.connected ? 'подключён' : 'пусто';
  badge.classList.add(account.connected ? 'connected' : 'empty');

  meta.appendChild(kv('ID', shortAccountId(account.accountId)));
  meta.appendChild(kv('Plan', account.usage?.plan || account.planTypeFromJwt || '—'));
  meta.appendChild(kv('Exp', fmtDate(account.expires)));
  meta.appendChild(kv('Check', fmtDate(account.lastCheckedAt)));

  const windows = account.usage?.windows || [];
  if (windows.length) {
    for (const w of windows) {
      const { used, left } = fmtPercent(w.usedPercent);
      const box = document.createElement('div');
      box.className = 'window';
      box.innerHTML = `
        <div class="kv"><span class="label">${w.label}</span><span>${left}% left</span></div>
        <div class="kv"><span class="label">Used</span><span>${used}%</span></div>
        <div class="kv"><span class="label">Reset</span><span>${fmtDate(w.resetAt)}</span></div>
        <div class="progress"><span style="width:${Math.min(100, Math.max(0, Number(w.usedPercent || 0)))}%"></span></div>
      `;
      usage.appendChild(box);
    }
  } else {
    usage.appendChild(kv('Usage', account.connected ? 'ещё не запрошен' : '—'));
  }

  error.textContent = account.lastError || '';

  node.querySelector('[data-action="login"]').addEventListener('click', async () => {
    const res = await fetch(`/api/accounts/${account.slot}/login`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok || !data.authUrl) {
      alert(data.error || 'Login start failed');
      return;
    }
    window.open(data.authUrl, '_blank', 'noopener,noreferrer');
  });

  node.querySelector('[data-action="refresh"]').addEventListener('click', async () => {
    await fetch(`/api/accounts/${account.slot}/refresh`, { method: 'POST' });
    await reload();
  });

  node.querySelector('[data-action="logout"]').addEventListener('click', async () => {
    if (!confirm(`Очистить ${account.slot}?`)) return;
    await fetch(`/api/accounts/${account.slot}/logout`, { method: 'POST' });
    await reload();
  });

  return node;
}

async function reload() {
  const res = await fetch('/api/accounts');
  const data = await res.json();
  cardsEl.innerHTML = '';
  for (const account of data.accounts || []) {
    cardsEl.appendChild(renderAccount(account));
  }
}

refreshAllBtn.addEventListener('click', async () => {
  refreshAllBtn.disabled = true;
  try {
    await fetch('/api/refresh-all', { method: 'POST' });
    await reload();
  } finally {
    refreshAllBtn.disabled = false;
  }
});

window.addEventListener('message', async (event) => {
  if (event.data?.type === 'codex-login-complete') {
    await reload();
  }
});

reload();
