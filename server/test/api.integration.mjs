import assert from 'node:assert/strict';

const base = (process.env.API_URL || 'http://localhost:4000').replace(/\/$/, '');
const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const testIp = `198.51.100.${Math.floor(Math.random() * 200) + 20}`;
const password = 'test-password-123';
const created = [];

async function call(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), 'X-Forwarded-For': testIp, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, body: json };
}

async function signup(label) {
  const email = `API.Test+${stamp}-${label}@Example.COM`;
  const res = await call('/api/auth/signup', { method: 'POST', body: { email, password } });
  assert.equal(res.status, 200, `signup ${label}: ${JSON.stringify(res.body)}`);
  assert.equal(res.body.user.email, email.toLowerCase(), 'email must be normalized');
  created.push({ email: res.body.user.email, token: res.body.token });
  return res.body;
}

async function createAccount(token, { name = 'Test', currency = 'INR', openingMajor = 0 } = {}) {
  const res = await call('/api/accounts', { method: 'POST', token, body: { name, currency, openingMajor } });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body;
}

async function run() {
  // Config/health
  const health = await call('/health');
  assert.equal(health.status, 200);

  // Signup starts at zero, not a fabricated opening balance.
  const a = await signup('a');
  const aAccounts = await call('/api/accounts', { token: a.token });
  assert.equal(aAccounts.status, 200);
  assert.equal(aAccounts.body.length, 1);
  assert.equal(aAccounts.body[0].openingMinor, '0');
  assert.equal(aAccounts.body[0].currency, 'INR');

  // Duplicate signup is rejected even with different casing.
  const duplicate = await call('/api/auth/signup', { method: 'POST', body: { email: `api.test+${stamp}-a@example.com`, password } });
  assert.equal(duplicate.status, 409);

  // Login is case-insensitive too.
  const login = await call('/api/auth/login', { method: 'POST', body: { email: `API.TEST+${stamp}-A@example.com`, password } });
  assert.equal(login.status, 200);

  // Unsupported currency and non-finite values are rejected.
  const badCurrency = await call('/api/accounts', { method: 'POST', token: a.token, body: { name: 'Bad', currency: 'US' } });
  assert.equal(badCurrency.status, 400);
  const badOpening = await call('/api/accounts', { method: 'POST', token: a.token, body: { name: 'Bad', currency: 'INR', openingMajor: 1e30 } });
  assert.equal(badOpening.status, 400);

  const usd = await createAccount(a.token, { name: 'USD wallet', currency: 'USD' });
  const inr2 = await createAccount(a.token, { name: 'Second INR', currency: 'INR' });
  const inr1 = aAccounts.body[0];

  // A transaction cannot be recorded in a currency the account does not hold.
  const mismatch = await call('/api/transactions', { method: 'POST', token: a.token, body: { accountId: inr1.id, kind: 'expense', amountMajor: 10, currency: 'USD' } });
  assert.equal(mismatch.status, 400);

  const expense = await call('/api/transactions', { method: 'POST', token: a.token, body: { accountId: inr1.id, kind: 'expense', amountMajor: 100, note: 'Lunch', category: 'Food & dining' } });
  assert.equal(expense.status, 201, JSON.stringify(expense.body));
  assert.equal(expense.body.amountMinor, '-10000');
  assert.equal(expense.body.currency, 'INR');

  // Transfers are balance movements only — never income or expense.
  const transfer = await call('/api/transactions/transfer', { method: 'POST', token: a.token, body: { fromAccountId: inr1.id, toAccountId: inr2.id, amountMajor: 25 } });
  assert.equal(transfer.status, 201);

  const before = await call('/api/summary?months=6', { token: a.token });
  assert.equal(before.status, 200);
  assert.equal(before.body.totals.incomeMajor, 0);
  assert.equal(before.body.totals.expenseMajor, 100);
  assert.equal(before.body.totals.balanceMajor, -100);

  // Editing recomputes the signed minor amount without changing the currency.
  const edited = await call(`/api/transactions/${expense.body.id}`, { method: 'PATCH', token: a.token, body: { amountMajor: 40, note: 'Lunch (corrected)', kind: 'expense' } });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.amountMinor, '-4000');
  const after = await call('/api/summary?months=6', { token: a.token });
  assert.equal(after.body.totals.expenseMajor, 40);

  // An account with activity cannot be deleted; empty accounts can.
  const refusedDelete = await call(`/api/accounts/${inr1.id}`, { method: 'DELETE', token: a.token });
  assert.equal(refusedDelete.status, 409);
  const emptyDelete = await call(`/api/accounts/${usd.id}`, { method: 'DELETE', token: a.token });
  assert.equal(emptyDelete.status, 204);

  // Recurring rules cannot reference another user's account, and posting uses the rule's account.
  const b = await signup('b');
  const bAccount = (await call('/api/accounts', { token: b.token })).body[0];
  const crossAccountRule = await call('/api/recurring', { method: 'POST', token: a.token, body: { title: 'Cross', kind: 'expense', amountMajor: 5, currency: 'INR', nextRun: new Date().toISOString(), accountId: bAccount.id } });
  assert.equal(crossAccountRule.status, 404);

  const rule = await call('/api/recurring', { method: 'POST', token: a.token, body: { title: 'Rent', kind: 'expense', amountMajor: 20, currency: 'INR', nextRun: new Date().toISOString() } });
  assert.equal(rule.status, 201);
  const posted = await call(`/api/recurring/${rule.body.id}/post`, { method: 'POST', token: a.token, body: {} });
  assert.equal(posted.status, 201, JSON.stringify(posted.body));
  assert.equal(posted.body.transaction.accountId, inr1.id);
  assert.equal(posted.body.transaction.amountMinor, '-2000');

  // Two-user isolation across read and write paths.
  const bList = await call('/api/transactions', { token: b.token });
  assert.equal(bList.status, 200);
  assert.equal(bList.body.length, 0);
  assert.equal((await call(`/api/transactions/${expense.body.id}`, { method: 'PATCH', token: b.token, body: { amountMajor: 1 } })).status, 404);
  assert.equal((await call(`/api/transactions/${expense.body.id}`, { method: 'DELETE', token: b.token })).status, 404);
  assert.equal((await call(`/api/accounts/${inr2.id}`, { method: 'PATCH', token: b.token, body: { name: 'Mine now' } })).status, 404);
  assert.equal((await call(`/api/recurring/${rule.body.id}/post`, { method: 'POST', token: b.token, body: {} })).status, 404);
  assert.equal((await call('/api/budgets', { token: a.token })).body.length, 0);

  // Home-currency changes are explicit and supported.
  const me = await call('/api/auth/me', { method: 'PATCH', token: a.token, body: { homeCurrency: 'usd' } });
  assert.equal(me.status, 200);
  assert.equal(me.body.homeCurrency, 'USD');

  // Account deletion requires password + explicit confirmation.
  const wrongDelete = await call('/api/auth/account', { method: 'DELETE', token: a.token, body: { password: 'wrong', confirm: 'DELETE' } });
  assert.equal(wrongDelete.status, 401);
  const badConfirm = await call('/api/auth/account', { method: 'DELETE', token: a.token, body: { password, confirm: 'delete' } });
  assert.equal(badConfirm.status, 400);
}

try {
  await run();
  console.log('API integration tests passed.');
} finally {
  for (const user of created) {
    await call('/api/auth/account', { method: 'DELETE', token: user.token, body: { password, confirm: 'DELETE' } }).catch(() => {});
  }
}
