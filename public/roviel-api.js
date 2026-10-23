// Roviel API client — additive layer. Existing localStorage demo keeps working
// offline; when VITE_API_URL + token exist, dashboard syncs to Postgres.
// Usage: <script src="/roviel-api.js"></script> then RovielAPI.*
(function () {
  function getBase() {
    const explicit = (window.__ROVIEL_API__ || window.__LEDGERLY_API__ || (document.querySelector('meta[name="roviel-api"]') || document.querySelector('meta[name="ledgerly-api"]') || {}).content || localStorage.getItem('roviel.api.base') || localStorage.getItem('ledgerly.api.base') || '').replace(/\/$/, '');
    if (explicit) return explicit;
    // Local-dev default so Sign in works out of the box: web on :5173, API on :4000.
    try {
      const h = window.location.hostname;
      if (h === 'localhost' || h === '127.0.0.1') return 'http://localhost:4000';
    } catch {}
    return '';
  }
  const tokenKey = 'roviel.api.token';
  async function req(path, opts = {}) {
    const BASE = getBase();
    const token = localStorage.getItem(tokenKey);
    const res = await fetch(BASE + path, {
      ...opts,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(opts.headers || {}) },
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
    return res.json();
  }
  window.RovielAPI = {
    get base() { return getBase(); },
    isCloud() { return !!getBase() && !!localStorage.getItem(tokenKey); },
    async signup(email, password) { const r = await req('/api/auth/signup', { method: 'POST', body: JSON.stringify({ email, password }) }); localStorage.setItem(tokenKey, r.token); return r; },
    async login(email, password) { const r = await req('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }); localStorage.setItem(tokenKey, r.token); return r; },
    forgotPassword: (email) => req('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
    resetPassword: (token, password) => req('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) }),
    async changePassword(currentPassword, newPassword) {
      const r = await req('/api/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) });
      if (r.token) localStorage.setItem(tokenKey, r.token);
      return r;
    },
    async logout() {
      const token = localStorage.getItem(tokenKey);
      localStorage.removeItem(tokenKey);
      if (!token) return;
      try { await fetch(getBase() + '/api/auth/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + token } }); } catch {}
    },
    listTransactions: () => req('/api/transactions'),
    exportTransactions: () => req('/api/transactions/export'),
    createTransaction: (b) => req('/api/transactions', { method: 'POST', body: JSON.stringify(b) }),
    transfer: (b) => req('/api/transactions/transfer', { method: 'POST', body: JSON.stringify(b) }),
    fxRate: (b, q, d) => fetch(getBase() + `/api/fx/rate?base=${b}&quote=${q}${d ? `&date=${d}` : ''}`).then(r => r.json()),
    fxHistory: (b, q, days) => fetch(getBase() + `/api/fx/history?base=${b}&quote=${q}&days=${days || 30}`).then(r => r.json()),
    insights: () => req('/api/insights'),
    // One-click demo import: pushes localStorage demo txs to cloud account
    async importDemo(getAccounts) {
      const raw = JSON.parse(localStorage.getItem('roviel.transactions.v1') || '[]');
      const accounts = getAccounts ? await getAccounts() : await req('/api/accounts');
      const cash = accounts[0];
      for (const t of raw.slice(0, 20)) {
        await req('/api/transactions', { method: 'POST', body: JSON.stringify({ accountId: cash.id, kind: t.type === 'income' ? 'income' : 'expense', amountMajor: Math.abs(Number(t.amount)), note: t.name, category: t.category }) }).catch(() => {});
      }
      return true;
    },
  };
})();
