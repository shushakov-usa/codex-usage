const cardsEl = document.getElementById('cards');
const tpl = document.getElementById('cardTpl');
const refreshAllBtn = document.getElementById('refreshAllBtn');
const addSlotBtn = document.getElementById('addSlotBtn');

function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString();
}

function fmtTimeLeft(ts) {
  if (!ts) return '';
  const diff = ts - Date.now();
  if (diff <= 0) return 'now';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
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
  if (account.email) return account.email;
  if (account.accountId) return `ID ${shortAccountId(account.accountId)}`;
  return 'Not connected';
}

function usageColor(usedPercent) {
  const p = Math.min(100, Math.max(0, Number(usedPercent || 0))) / 100;
  const r = Math.round(46 + (255 - 46) * p);
  const g = Math.round(204 - (204 - 107) * p);
  const b = Math.round(113 - (113 - 107) * p);
  return `rgb(${r},${g},${b})`;
}

function renderAccount(account) {
  const node = tpl.content.firstElementChild.cloneNode(true);
  node.dataset.slot = account.slot;
  const title = node.querySelector('.slotTitle');
  const accountTitle = node.querySelector('.accountTitle');
  const badge = node.querySelector('.statusBadge');
  const meta = node.querySelector('.meta');
  const usage = node.querySelector('.usage');
  const error = node.querySelector('.error');

  title.textContent = accountLabel(account);
  const plan = account.usage?.plan || account.planTypeFromJwt || '';
  accountTitle.textContent = plan;
  badge.textContent = account.connected ? 'connected' : 'empty';
  badge.classList.add(account.connected ? 'connected' : 'empty');

  meta.appendChild(kv('Checked', fmtDate(account.lastCheckedAt)));

  const windows = account.usage?.windows || [];
  if (windows.length) {
    for (const w of windows) {
      const left = Math.max(0, 100 - Number(w.usedPercent || 0));
      const resetIn = fmtTimeLeft(w.resetAt);
      const box = document.createElement('div');
      box.className = 'window';
      box.innerHTML = `
        <div class="kv"><span class="label">${w.label}</span><span>${left.toFixed(0)}% left</span></div>
        <div class="kv"><span class="label">Reset in</span><span>${resetIn}</span></div>
        <div class="progress"><span style="width:${left.toFixed(0)}%; background:${usageColor(w.usedPercent)}"></span></div>
      `;
      usage.appendChild(box);
    }
  } else {
    usage.appendChild(kv('Usage', account.connected ? 'not fetched yet' : '—'));
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

    const existing = node.querySelector('.callback-paste');
    if (existing) existing.remove();

    const box = document.createElement('div');
    box.className = 'callback-paste';
    box.innerHTML = `
      <p>After authorization, paste the URL from the address bar:</p>
      <div class="paste-row">
        <input type="text" placeholder="http://localhost:1455/auth/callback?code=…" />
        <button>OK</button>
      </div>
    `;
    const input = box.querySelector('input');
    const btn = box.querySelector('button');
    btn.addEventListener('click', async () => {
      const url = input.value.trim();
      if (!url) return;
      btn.disabled = true;
      btn.textContent = '⏳';
      try {
        const r = await fetch(`/api/accounts/${account.slot}/exchange`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
        });
        const d = await r.json();
        if (!r.ok || !d.ok) {
          alert(d.error || 'Exchange failed');
          return;
        }
        box.remove();
        await reload();
      } finally {
        btn.disabled = false;
        btn.textContent = 'OK';
      }
    });
    node.querySelector('.buttons').after(box);
  });

  node.querySelector('[data-action="refresh"]').addEventListener('click', async () => {
    const btn = node.querySelector('[data-action="refresh"]');
    btn.disabled = true;
    btn.textContent = '⏳';
    try {
      await fetch(`/api/accounts/${account.slot}/refresh`, { method: 'POST' });
      await reload();
    } finally {
      btn.disabled = false;
      btn.textContent = 'Refresh';
    }
  });

  node.querySelector('[data-action="logout"]').addEventListener('click', async () => {
    if (!confirm(`Clear ${account.slot}?`)) return;
    await fetch(`/api/accounts/${account.slot}/logout`, { method: 'POST' });
    await reload();
  });

  const deleteBtn = document.createElement('button');
  deleteBtn.textContent = 'Delete';
  deleteBtn.className = 'danger';
  deleteBtn.addEventListener('click', async () => {
    if (account.connected) {
      alert('Logout first');
      return;
    }
    if (!confirm(`Delete ${account.slot}?`)) return;
    await fetch(`/api/accounts/${account.slot}/delete`, { method: 'POST' });
    await reload();
  });
  node.querySelector('.buttons').appendChild(deleteBtn);

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

addSlotBtn.addEventListener('click', async () => {
  addSlotBtn.disabled = true;
  try {
    await fetch('/api/accounts/create', { method: 'POST' });
    await reload();
  } finally {
    addSlotBtn.disabled = false;
  }
});

refreshAllBtn.addEventListener('click', async () => {
  refreshAllBtn.disabled = true;
  const original = refreshAllBtn.textContent;
  refreshAllBtn.textContent = '⏳ Refreshing…';
  try {
    const cards = cardsEl.querySelectorAll('.card');
    const promises = [...cards].map(async (card) => {
      const slot = card.dataset.slot;
      if (!slot) return;
      const btn = card.querySelector('[data-action="refresh"]');
      if (btn) { btn.disabled = true; btn.textContent = '⏳'; }
      try {
        await fetch(`/api/accounts/${slot}/refresh`, { method: 'POST' });
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Refresh'; }
      }
    });
    await Promise.all(promises);
    await reload();
  } finally {
    refreshAllBtn.disabled = false;
    refreshAllBtn.textContent = original;
  }
});

window.addEventListener('message', async (event) => {
  if (event.data?.type === 'codex-login-complete') {
    await reload();
  }
});

reload();
