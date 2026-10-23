import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();
const base = (process.env.API_URL || 'http://localhost:4000').replace(/\/$/, '');
const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const testIp = `198.51.100.${Math.floor(Math.random() * 200) + 20}`;
let signupIpCounter = 20;
const password = 'test-password-123';
const created = [];

async function call(path, { method = 'GET', token, body, ip } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), 'X-Forwarded-For': ip || testIp, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, body: json };
}

async function signup(label) {
  const email = `API.Test+${stamp}-${label}@Example.COM`;
  const ip = `198.51.100.${(signupIpCounter++ % 200) + 20}`;
  const res = await call('/api/auth/signup', { method: 'POST', body: { email, password }, ip });
  assert.equal(res.status, 200, `signup ${label}: ${JSON.stringify(res.body)}`);
  assert.equal(res.body.user.email, email.toLowerCase(), 'email must be normalized');
  const user = { email: res.body.user.email, token: res.body.token, password };
  created.push(user);
  return { ...res.body, password };
}

const resetHash = token => crypto.createHash('sha256').update(token).digest('hex');

async function createAccount(token, { name = 'Test', currency = 'INR', openingMajor = 0 } = {}) {
  const res = await call('/api/accounts', { method: 'POST', token, body: { name, currency, openingMajor } });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body;
}

async function run() {
  // Config/health
  const health = await call('/health');
  assert.equal(health.status, 200);
  assert.equal(health.body.database, 'up');

  assert.equal((await call('/api/fx/rate?base=ZZZ&quote=EUR')).status, 400);
  assert.equal((await call('/api/fx/rate?base=USD&quote=EUR&date=not-a-date')).status, 400);
  assert.equal((await call('/api/fx/history?base=USD&quote=EUR&days=0')).status, 400);
  assert.equal((await call('/api/fx/history?base=USD&quote=EUR&days=366')).status, 400);
  assert.equal((await call('/api/fx/quote', { method: 'POST', body: { amountMajor: 10, refRate: 1, providerRate: 1, fromCur: 'ZZZ', toCur: 'EUR' } })).status, 400);

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
  const login = await call('/api/auth/login', { method: 'POST', body: { email: `API.TEST+${stamp}-A@Example.COM`, password } });
  assert.equal(login.status, 200);

  // Password recovery is single-use, expiring and non-enumerating.
  const c = await signup('c');
  const cUser = await db.user.findUnique({ where: { email: c.user.email } });
  assert.ok(cUser);
  const forgotExisting = await call('/api/auth/forgot-password', { method: 'POST', body: { email: c.user.email } });
  assert.equal(forgotExisting.status, 202);
  assert.equal(forgotExisting.body.message, 'If that email is registered, a reset link is on its way.');
  assert.ok(await db.passwordResetToken.findFirst({ where: { userId: cUser.id } }));
  const forgotMissing = await call('/api/auth/forgot-password', { method: 'POST', body: { email: `missing-${stamp}@example.com` } });
  assert.equal(forgotMissing.status, 202);
  assert.deepEqual(forgotMissing.body, forgotExisting.body);
  const forgotInvalid = await call('/api/auth/forgot-password', { method: 'POST', body: { email: 'not-an-email' } });
  assert.equal(forgotInvalid.status, 400);

  await db.passwordResetToken.deleteMany({ where: { userId: cUser.id } });
  const resetToken = crypto.randomBytes(32).toString('base64url');
  await db.passwordResetToken.create({
    data: { userId: cUser.id, tokenHash: resetHash(resetToken), expiresAt: new Date(Date.now() + 30 * 60_000) },
  });
  const newPassword = 'new-password-456';
  assert.equal((await call('/api/auth/reset-password', { method: 'POST', body: { token: resetToken, password: 'short' } })).status, 400);
  assert.equal((await call('/api/auth/reset-password', { method: 'POST', body: { token: 'not-a-real-token-not-a-real-token', password: newPassword } })).status, 400);
  const reset = await call('/api/auth/reset-password', { method: 'POST', body: { token: resetToken, password: newPassword } });
  assert.equal(reset.status, 200, JSON.stringify(reset.body));
  assert.equal((await call('/api/auth/reset-password', { method: 'POST', body: { token: resetToken, password: newPassword } })).status, 400);
  assert.equal((await call('/api/auth/me', { token: c.token })).status, 401, 'reset must revoke existing sessions');
  assert.equal((await call('/api/auth/login', { method: 'POST', body: { email: c.user.email, password } })).status, 401);
  const newLogin = await call('/api/auth/login', { method: 'POST', body: { email: c.user.email, password: newPassword } });
  assert.equal(newLogin.status, 200);
  c.password = newPassword;
  c.token = newLogin.body.token;

  const expiredToken = crypto.randomBytes(32).toString('base64url');
  await db.passwordResetToken.create({
    data: { userId: cUser.id, tokenHash: resetHash(expiredToken), expiresAt: new Date(Date.now() - 1_000) },
  });
  assert.equal((await call('/api/auth/reset-password', { method: 'POST', body: { token: expiredToken, password: 'another-password-789' } })).status, 400);

  // A signed-in password change revokes other sessions and returns a fresh token.
  const d = await signup('d');
  const changedWrong = await call('/api/auth/change-password', { method: 'POST', token: d.token, body: { currentPassword: 'wrong-password', newPassword: 'new-password-456' } });
  assert.equal(changedWrong.status, 401);
  const changedSame = await call('/api/auth/change-password', { method: 'POST', token: d.token, body: { currentPassword: password, newPassword: password } });
  assert.equal(changedSame.status, 400);
  const changed = await call('/api/auth/change-password', { method: 'POST', token: d.token, body: { currentPassword: password, newPassword: 'new-password-456' } });
  assert.equal(changed.status, 200, JSON.stringify(changed.body));
  assert.ok(changed.body.token);
  assert.equal((await call('/api/auth/me', { token: d.token })).status, 401);
  assert.equal((await call('/api/auth/me', { token: changed.body.token })).status, 200);
  assert.equal((await call('/api/auth/login', { method: 'POST', body: { email: d.user.email, password } })).status, 401);
  assert.equal((await call('/api/auth/login', { method: 'POST', body: { email: d.user.email, password: 'new-password-456' } })).status, 200);
  d.password = 'new-password-456';
  d.token = changed.body.token;

  // Unsupported currency and non-finite values are rejected.
  const badCurrency = await call('/api/accounts', { method: 'POST', token: a.token, body: { name: 'Bad', currency: 'US' } });
  assert.equal(badCurrency.status, 400);
  const unknownCurrency = await call('/api/accounts', { method: 'POST', token: a.token, body: { name: 'Bad', currency: 'ZZZ' } });
  assert.equal(unknownCurrency.status, 400);
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

  // Invalid date and type filters are client errors, not outages.
  assert.equal((await call('/api/transactions?from=not-a-date', { token: a.token })).status, 400);
  assert.equal((await call('/api/transactions?to=not-a-date', { token: a.token })).status, 400);
  assert.equal((await call('/api/transactions?from=2026-10-10&to=2026-10-01', { token: a.token })).status, 400);
  assert.equal((await call('/api/transactions?kind=everything', { token: a.token })).status, 400);
  assert.equal((await call('/api/transactions?from=2026-10-01&to=2026-10-31', { token: a.token })).status, 200);

  // Transfers are balance movements only — never income or expense.
  const transfer = await call('/api/transactions/transfer', { method: 'POST', token: a.token, body: { fromAccountId: inr1.id, toAccountId: inr2.id, amountMajor: 25 } });
  assert.equal(transfer.status, 201);
  assert.equal(transfer.body.rate, 1);
  const linkedSame = (await call('/api/transactions', { token: a.token })).body.find(t => t.id === transfer.body.out.id);
  assert.equal(linkedSame.transfer.rate, 1);
  assert.equal(linkedSame.transfer.direction, 'out');
  assert.equal(linkedSame.transfer.fromAccount.id, inr1.id);
  assert.equal(linkedSame.transfer.toAccount.id, inr2.id);
  assert.equal(linkedSame.transfer.sentMinor, transfer.body.out.amountMinor);
  assert.equal(linkedSame.transfer.receivedMinor, transfer.body.in.amountMinor);

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

  // Cross-currency transfers persist the exact quote and both counterparts.
  const usd2 = await createAccount(a.token, { name: 'Cross USD', currency: 'USD' });
  const cross = await call('/api/transactions/transfer', { method: 'POST', token: a.token, body: { fromAccountId: inr2.id, toAccountId: usd2.id, amountMajor: 10, note: 'Cross transfer' } });
  assert.equal(cross.status, 201, JSON.stringify(cross.body));
  assert.ok(Number(cross.body.rate) > 0);
  const linkedCross = (await call('/api/transactions', { token: a.token })).body.find(t => t.id === cross.body.out.id);
  assert.ok(linkedCross.transfer, 'transfer details must survive a reload');
  assert.equal(linkedCross.transfer.rate, cross.body.rate);
  assert.equal(linkedCross.transfer.rateDate, cross.body.rateDate);
  assert.equal(linkedCross.transfer.rateSource, cross.body.rateSource);
  assert.equal(linkedCross.transfer.direction, 'out');
  assert.equal(linkedCross.transfer.fromAccount.currency, 'INR');
  assert.equal(linkedCross.transfer.toAccount.currency, 'USD');
  assert.equal(linkedCross.transfer.sentMinor, cross.body.out.amountMinor);
  assert.equal(linkedCross.transfer.receivedMinor, cross.body.in.amountMinor);
  const inboundCross = (await call('/api/transactions', { token: a.token })).body.find(t => t.id === cross.body.in.id);
  assert.equal(inboundCross.transfer.direction, 'in');
  assert.equal(inboundCross.transfer.receivedMinor, cross.body.in.amountMinor);
  assert.equal((await call(`/api/transactions/${cross.body.out.id}`, { method: 'DELETE', token: a.token })).status, 400);

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
  const budgetBody = { category: 'Duplicate check', limitMajor: 50, currency: 'INR', yearMonth: '2026-10' };
  assert.equal((await call('/api/budgets', { method: 'POST', token: a.token, body: budgetBody })).status, 201);
  assert.equal((await call('/api/budgets', { method: 'POST', token: a.token, body: budgetBody })).status, 409);
  assert.equal((await call('/api/budgets', { method: 'POST', token: a.token, body: { ...budgetBody, category: 'Bad month', yearMonth: '2026-13' } })).status, 400);
  assert.equal((await call('/api/budgets?month=2026-13', { token: a.token })).status, 400);
  const invalidMonths = await call('/api/summary?months=abc', { token: a.token });
  assert.equal(invalidMonths.status, 400);
  assert.equal((await call('/api/summary?months=0', { token: a.token })).status, 400);
  assert.equal((await call('/api/summary?months=37', { token: a.token })).status, 400);
  assert.equal((await call('/api/summary?months=36', { token: a.token })).status, 200);

  // Goals can be edited and deleted, and neither action crosses user boundaries.
  const goal = await call('/api/goals', { method: 'POST', token: a.token, body: { title: 'Editable goal', targetMajor: 1000, currency: 'INR' } });
  assert.equal(goal.status, 201);
  const editedGoal = await call(`/api/goals/${goal.body.id}`, { method: 'PATCH', token: a.token, body: { title: 'Edited goal', targetMajor: 7500 } });
  assert.equal(editedGoal.status, 200);
  assert.equal(editedGoal.body.title, 'Edited goal');
  assert.equal(editedGoal.body.targetMinor, '750000');
  assert.equal((await call(`/api/goals/${goal.body.id}`, { method: 'PATCH', token: b.token, body: { title: 'Not mine' } })).status, 404);
  assert.equal((await call(`/api/goals/${goal.body.id}`, { method: 'DELETE', token: b.token })).status, 404);
  assert.equal((await call(`/api/goals/${goal.body.id}`, { method: 'DELETE', token: a.token })).status, 204);
  assert.ok(!(await call('/api/goals', { token: a.token })).body.some(item => item.id === goal.body.id));

  // CSV/export must not inherit the 200-row ledger view cap.
  await db.transaction.createMany({
    data: Array.from({ length: 201 }, (_, index) => ({
      userId: a.user.id, accountId: inr1.id, kind: 'expense', amountMinor: -100n,
      currency: 'INR', note: `Bulk export ${index}`, category: 'Other', rateToHome: 1,
    })),
  });
  const cappedLedger = await call('/api/transactions', { token: a.token });
  assert.equal(cappedLedger.body.length, 200, 'the interactive ledger remains capped');
  const exported = await call('/api/transactions/export', { token: a.token });
  assert.equal(exported.status, 200);
  assert.ok(exported.body.transactions.length > 200, `export returned ${exported.body.transactions.length}`);
  assert.equal(exported.body.homeCurrency, 'INR');
  assert.ok(exported.body.transactions.some(t => t.note === 'Bulk export 200' && t.amountMinor === '-100'));

  // Home-currency changes are explicit and supported.
  const me = await call('/api/auth/me', { method: 'PATCH', token: a.token, body: { homeCurrency: 'usd' } });
  assert.equal(me.status, 200);
  assert.equal(me.body.homeCurrency, 'USD');

  // Recovery codes provide a zero-cost account recovery path without email.
  const f = await signup('f');
  const fUser = await db.user.findUnique({ where: { email: f.user.email } });
  const recoveryNewPassword = 'recovery-password-789';
  assert.equal((await call('/api/auth/recovery-codes', { method: 'POST', token: f.token, body: { password: 'wrong' } })).status, 401);
  const generatedCodes = await call('/api/auth/recovery-codes', { method: 'POST', token: f.token, body: { password } });
  assert.equal(generatedCodes.status, 200);
  assert.equal(generatedCodes.body.codes.length, 10);
  assert.equal(new Set(generatedCodes.body.codes).size, 10);
  assert.ok(generatedCodes.body.codes.every(code => /^ROV-(?:[A-F0-9]{4}-){4}[A-F0-9]{4}$/.test(code)));
  const storedCodes = await db.recoveryCode.findMany({ where: { userId: fUser.id } });
  assert.equal(storedCodes.length, 10);
  assert.ok(storedCodes.every(code => code.codeHash.length === 64 && !generatedCodes.body.codes.includes(code.codeHash)));
  assert.equal((await call('/api/auth/recover-with-code', { method: 'POST', body: { email: a.user.email, code: generatedCodes.body.codes[0], password: recoveryNewPassword } })).status, 400);
  assert.equal((await call('/api/auth/recover-with-code', { method: 'POST', body: { email: f.user.email, code: 'ROV-0000-0000-0000-0000-0000', password: recoveryNewPassword } })).status, 400);
  const recovered = await call('/api/auth/recover-with-code', { method: 'POST', body: { email: f.user.email, code: generatedCodes.body.codes[0].toLowerCase(), password: recoveryNewPassword } });
  assert.equal(recovered.status, 200, JSON.stringify(recovered.body));
  assert.equal((await call('/api/auth/me', { token: f.token })).status, 401);
  assert.equal((await call('/api/auth/login', { method: 'POST', body: { email: f.user.email, password } })).status, 401);
  const recoveryLogin = await call('/api/auth/login', { method: 'POST', body: { email: f.user.email, password: recoveryNewPassword } });
  assert.equal(recoveryLogin.status, 200);
  assert.equal((await call('/api/auth/recover-with-code', { method: 'POST', body: { email: f.user.email, code: generatedCodes.body.codes[0], password: 'another-recovery-123' } })).status, 400);
  assert.equal((await call('/api/auth/recover-with-code', { method: 'POST', body: { email: f.user.email, code: generatedCodes.body.codes[1], password: 'another-recovery-123' } })).status, 400);
  assert.equal(await db.recoveryCode.count({ where: { userId: fUser.id, usedAt: null } }), 0);
  const changedByRecovery = await call('/api/auth/change-password', { method: 'POST', token: recoveryLogin.body.token, body: { currentPassword: recoveryNewPassword, newPassword: 'final-recovery-456' } });
  assert.equal(changedByRecovery.status, 200);
  assert.equal(await db.recoveryCode.count({ where: { userId: fUser.id, usedAt: null } }), 0);
  f.password = 'final-recovery-456';
  f.token = changedByRecovery.body.token;

  // Account deletion requires password + explicit confirmation.
  const wrongDelete = await call('/api/auth/account', { method: 'DELETE', token: a.token, body: { password: 'wrong', confirm: 'DELETE' } });
  assert.equal(wrongDelete.status, 401);
  const badConfirm = await call('/api/auth/account', { method: 'DELETE', token: a.token, body: { password, confirm: 'delete' } });
  assert.equal(badConfirm.status, 400);

  // Successful deletion revokes the session, blocks login and cascades every owned row.
  const e = await signup('e');
  const eUser = await db.user.findUnique({ where: { email: e.user.email } });
  assert.ok(eUser);
  const eFirst = (await call('/api/accounts', { token: e.token })).body[0];
  const eSecond = await createAccount(e.token, { name: 'Delete destination', currency: 'INR' });
  const eTx = await call('/api/transactions', { method: 'POST', token: e.token, body: { accountId: eFirst.id, kind: 'expense', amountMajor: 12, note: 'Delete me' } });
  assert.equal(eTx.status, 201);
  const eBudget = await call('/api/budgets', { method: 'POST', token: e.token, body: { category: 'Delete budget', limitMajor: 10, currency: 'INR', yearMonth: '2026-10' } });
  assert.equal(eBudget.status, 201);
  const eGoal = await call('/api/goals', { method: 'POST', token: e.token, body: { title: 'Delete goal', targetMajor: 10, currency: 'INR' } });
  assert.equal(eGoal.status, 201);
  const eRule = await call('/api/recurring', { method: 'POST', token: e.token, body: { title: 'Delete rule', kind: 'expense', amountMajor: 1, currency: 'INR', nextRun: new Date().toISOString() } });
  assert.equal(eRule.status, 201);
  const eTransfer = await call('/api/transactions/transfer', { method: 'POST', token: e.token, body: { fromAccountId: eFirst.id, toAccountId: eSecond.id, amountMajor: 5 } });
  assert.equal(eTransfer.status, 201);
  await call('/api/auth/forgot-password', { method: 'POST', body: { email: e.user.email } });
  const deleted = await call('/api/auth/account', { method: 'DELETE', token: e.token, body: { password, confirm: 'DELETE' } });
  assert.equal(deleted.status, 200);
  assert.equal((await call('/api/auth/me', { token: e.token })).status, 401);
  assert.equal((await call('/api/auth/login', { method: 'POST', body: { email: e.user.email, password } })).status, 401);
  assert.equal(await db.user.count({ where: { email: e.user.email } }), 0);
  assert.equal(await db.account.count({ where: { userId: eUser.id } }), 0);
  assert.equal(await db.transaction.count({ where: { userId: eUser.id } }), 0);
  assert.equal(await db.budget.count({ where: { userId: eUser.id } }), 0);
  assert.equal(await db.savingsGoal.count({ where: { userId: eUser.id } }), 0);
  assert.equal(await db.recurringRule.count({ where: { userId: eUser.id } }), 0);
  assert.equal(await db.passwordResetToken.count({ where: { userId: eUser.id } }), 0);
  assert.equal(await db.transactionLink.count({ where: { OR: [{ fromId: eTransfer.body.out.id }, { toId: eTransfer.body.in.id }] } }), 0);
}

try {
  await run();
  console.log('API integration tests passed.');
} finally {
  for (const user of created) {
    const freshLogin = await call('/api/auth/login', { method: 'POST', body: { email: user.email, password: user.password } }).catch(() => null);
    const token = freshLogin?.body?.token || user.token;
    await call('/api/auth/account', { method: 'DELETE', token, body: { password: user.password, confirm: 'DELETE' } }).catch(() => {});
  }
  await db.$disconnect();
}
