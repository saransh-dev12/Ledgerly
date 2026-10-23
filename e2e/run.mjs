import { chromium } from '@playwright/test';
import fs from 'fs';

const WEB = 'http://localhost:5173';
const API = 'http://localhost:4000';
fs.mkdirSync('e2e/screenshots', { recursive: true });

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + String(detail).slice(0, 100) : ''}`);
};
const Shot = (p, n) => p.screenshot({ path: `e2e/screenshots/${n}.png` });
const near = (a, b, tol = 1) => Math.abs(Number(a) - Number(b)) <= tol;

const browser = await chromium.launch();
const errors = [];

async function newPage(viewport = { width: 1440, height: 900 }) {
  const page = await browser.newPage({ viewport });
  page.on('pageerror', e => errors.push(String(e).slice(0, 160)));
  return page;
}
async function ready(page) {
  await page.waitForFunction(() => document.documentElement.dataset.appReady === 'true', { timeout: 20000 });
}
async function openDashboard(page) {
  try {
    await page.click('.contact-btn', { timeout: 8000 });
  } catch {
    await page.goto(WEB + '/#dashboard', { waitUntil: 'domcontentloaded' });
    await ready(page);
  }
  await page.waitForSelector('#dashboard-view.open', { timeout: 10000 });
}
async function login(page) {
  await page.evaluate(base => localStorage.setItem('roviel.api.base', base), API);
  await page.click('#auth-button');
  await page.waitForSelector('#auth-modal.open');
  await page.fill('#auth-email', 'demo@ledgerly.app');
  await page.fill('#auth-password', 'ledgerly123');
  await page.click('#auth-submit');
  await page.waitForFunction(() => document.querySelector('#cloud-status')?.textContent.includes('CLOUD SYNC'), { timeout: 15000 });
  await page.waitForTimeout(2500);
}
async function api(page, path, options = {}) {
  return page.evaluate(async ({ path, options, API: apiBase }) => {
    const token = localStorage.getItem('roviel.api.token');
    const res = await fetch(apiBase + path, { ...options, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token, ...(options.headers || {}) } });
    const text = await res.text();
    let body; try { body = JSON.parse(text); } catch { body = text; }
    return { status: res.status, body };
  }, { path, options, API });
}
const money = text => Number(String(text).replace(/[^0-9.-]/g, '')) || 0;

try {
  // ================= LANDING =================
  const page = await newPage();
  await page.goto(WEB, { waitUntil: 'domcontentloaded' });
  await ready(page);
  check('landing loads', (await page.title()).includes('Roviel'));
  check('4 story slides', (await page.locator('.slide').count()) === 4);
  check('sign-in visible on desktop', await page.locator('#open-auth-modal').isVisible());
  await Shot(page, '01-landing');

  // scroll snap = one scroll, one section
  await page.evaluate(() => window.scrollTo({ top: (document.documentElement.scrollHeight - window.innerHeight) * 0.2, behavior: 'instant' }));
  await page.waitForTimeout(1100);
  const snap = await page.evaluate(() => window.scrollY / (document.documentElement.scrollHeight - window.innerHeight));
  check('scroll snaps to a section', Math.abs(snap - 0.34) < 0.03, 'ratio ' + snap.toFixed(3));
  await page.waitForFunction(() => document.querySelector('#slide-2-img')?.classList.contains('active'), { timeout: 5000 }).catch(() => {});
  check('overview preview appears', await page.locator('#slide-2-img').evaluate(el => el.classList.contains('active')));
  await page.evaluate(() => window.scrollTo({ top: (document.documentElement.scrollHeight - window.innerHeight) * 0.62, behavior: 'instant' }));
  await page.waitForTimeout(1100);
  await page.waitForFunction(() => document.querySelector('#slide-3-img')?.classList.contains('active'), { timeout: 5000 }).catch(() => {});
  check('activity preview appears', await page.locator('#slide-3-img').evaluate(el => el.classList.contains('active')));
  check('activity preview lists four entries', (await page.locator('#slide-3-img .preview-row').count()) === 4);
  await page.evaluate(() => window.scrollTo({ top: (document.documentElement.scrollHeight - window.innerHeight) * 0.94, behavior: 'instant' }));
  await page.waitForTimeout(1100);
  await page.waitForFunction(() => document.querySelector('#slide-4-img')?.classList.contains('active'), { timeout: 5000 }).catch(() => {});
  check('plan preview appears', await page.locator('#slide-4-img').evaluate(el => el.classList.contains('active')));
  check('plan preview lists three goals', (await page.locator('#slide-4-img .preview-goal').count()) === 3);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.waitForTimeout(900);

  // theme switch
  const themeBefore = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  await page.click('[data-theme-toggle]');
  await page.waitForTimeout(1400);
  const themeAfter = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  check('theme switch works', themeBefore !== themeAfter, `${themeBefore} -> ${themeAfter}`);
  check('theme switch error free', errors.length === 0, errors.slice(0, 2).join(' | '));
  const sceneBound = () => page.evaluate(() => {
    const canvas = document.querySelector('#webgl');
    return !!canvas && !!canvas.__rovielRenderer && canvas.__rovielRenderer.domElement === canvas;
  });
  check('coin scene survives theme switch', await sceneBound());
  await page.click('[data-theme-toggle]');
  await page.waitForTimeout(1300);
  check('coin scene survives theme round trip', await sceneBound());

  // ================= CONVERTER =================
  await page.click('#open-currency-tools-nav');
  await page.waitForSelector('#currency-result');
  await page.waitForFunction(() => !document.querySelector('#currency-result').textContent.includes('Loading'), { timeout: 20000 }).catch(() => {});
  let conv = await page.locator('#currency-result').innerText();
  if (/unavailable/i.test(conv)) { await page.click('#refresh-currency-rate').catch(() => {}); await page.waitForTimeout(4000); conv = await page.locator('#currency-result').innerText(); }
  check('converter computes', /EUR/.test(conv) && !/10,000,/.test(conv), conv.replace(/\n/g, ' ').slice(0, 48));
  await page.waitForFunction(() => document.querySelectorAll('#currency-from option').length >= 150, { timeout: 15000 }).catch(() => {});
  check('full currency directory', (await page.locator('#currency-from option').count()) >= 150, (await page.locator('#currency-from option').count()) + ' currencies');
  check('popular pairs rendered', (await page.locator('#currency-popular-list button').count()) === 12);

  // conversion maths must match the shown rate exactly
  await page.fill('#currency-amount', '250');
  await page.selectOption('#currency-from', 'USD');
  await page.selectOption('#currency-to', 'EUR');
  await page.waitForTimeout(4000);
  const facts = await page.locator('#currency-rate-facts').innerText();
  const rateMatch = facts.match(/1 USD = ([\d.]+) EUR/);
  const shown = await page.locator('#currency-result').innerText();
  const eurMatch = shown.match(/€([\d,.]+) EUR/);
  if (rateMatch && eurMatch) {
    const expected = 250 * Number(rateMatch[1]);
    const actual = Number(eurMatch[1].replace(/,/g, ''));
    check('conversion maths exact', near(expected, actual, 0.02), `expected ${expected.toFixed(2)}, got ${actual}`);
  } else check('conversion maths exact', false, 'could not read rate/result');

  // exotic pair (not a headline ECB currency in the local feed)
  await page.selectOption('#currency-from', 'AED');
  await page.selectOption('#currency-to', 'INR');
  await page.waitForTimeout(4500);
  const exotic = await page.locator('#currency-result').innerText();
  check('exotic pair converts', /INR/.test(exotic) && !/unavailable/i.test(exotic), exotic.replace(/\n/g, ' ').slice(0, 40));

  // same currency
  await page.selectOption('#currency-from', 'USD');
  await page.selectOption('#currency-to', 'USD');
  await page.waitForTimeout(2500);
  check('same-currency handled', (await page.locator('#rate-status').innerText()).toLowerCase().includes('same'));

  // swap
  await page.selectOption('#currency-from', 'EUR');
  await page.selectOption('#currency-to', 'GBP');
  await page.waitForTimeout(2500);
  await page.click('#currency-swap');
  await page.waitForTimeout(2500);
  const swapped = [await page.locator('#currency-from').inputValue(), await page.locator('#currency-to').inputValue()];
  check('swap flips pair', swapped[0] === 'GBP' && swapped[1] === 'EUR', swapped.join('/'));

  // search + popular chip
  await page.fill('#currency-search', 'rupee');
  await page.waitForTimeout(500);
  check('search filters currencies', (await page.locator('#currency-from option').count()) < 150);
  await page.fill('#currency-search', '');
  await page.locator('#currency-popular-list button', { hasText: 'USD / INR' }).click();
  await page.waitForTimeout(3500);
  check('popular pair chip works', (await page.locator('#currency-from').inputValue()) === 'USD' && (await page.locator('#currency-to').inputValue()) === 'INR');

  // quote tool: provider rate must never be auto-filled, maths must be right
  const providerBefore = await page.inputValue('#provider-rate');
  check('provider rate never auto-filled', providerBefore === '', `value="${providerBefore}"`);
  await page.fill('#provider-rate', '0.86');
  await page.fill('#fixed-fee', '2');
  await page.fill('#percentage-fee', '1');
  await page.fill('#fee-tax', '5');
  await page.waitForTimeout(900);
  const quote = await page.locator('#quote-results').innerText();
  check('quote breakdown renders', /net|received|reference|diff/i.test(quote), quote.replace(/\n/g, ' ').slice(0, 70));
  await Shot(page, '02-converter');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // ================= DASHBOARD (local demo) =================
  await page.click('.contact-btn');
  await page.waitForSelector('#dashboard-view.open');
  check('8 sidebar views', (await page.locator('.dash-side-nav [data-view]').count()) === 8);
  for (const view of ['transactions', 'accounts', 'budgets', 'goals', 'recurring', 'insights', 'pulse']) {
    await page.click(`.dash-side-nav [data-view="${view}"]`);
    await page.waitForTimeout(320);
    const headline = await page.locator(`#view-${view} .view-head h1`).innerText().catch(() => '');
    check(`view "${view}" has a headline`, (await page.locator(`#view-${view}.active`).count()) === 1 && headline.length > 8, headline.slice(0, 34));
  }

  // add transaction -> exact delta
  await page.click('.dash-side-nav [data-view="overview"]');
  const beforeIncome = money(await page.locator('#total-income').innerText());
  const beforeSpend = money(await page.locator('#total-expenses').innerText());
  await page.click('#open-transaction');
  await page.fill('#transaction-name', 'E2E Flat 250');
  await page.fill('#transaction-amount', '250');
  await page.selectOption('#transaction-type', 'expense');
  await page.click('.tx-submit');
  await page.waitForTimeout(900);
  const afterSpend = money(await page.locator('#total-expenses').innerText());
  check('expense of 250 raises spending by exactly 250', near(afterSpend - beforeSpend, 250, 1), `${beforeSpend} -> ${afterSpend}`);

  // the close button must work (regression: a cloned form used to kill it)
  await page.click('#open-transaction');
  await page.waitForTimeout(300);
  check('transaction modal opens', (await page.locator('#transaction-modal.open').count()) === 1);
  await page.click('#close-transaction');
  await page.waitForTimeout(400);
  check('modal close button works', (await page.locator('#transaction-modal.open').count()) === 0);
  await page.click('#open-transaction');
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  check('modal closes on Escape', (await page.locator('#transaction-modal.open').count()) === 0);

  // invalid input rejected with a message
  await page.click('#open-transaction');
  await page.fill('#transaction-name', '');
  await page.fill('#transaction-amount', '-5');
  await page.click('.tx-submit');
  await page.waitForTimeout(400);
  check('invalid transaction rejected', (await page.locator('#transaction-error').innerText()).length > 5, await page.locator('#transaction-error').innerText());
  await page.click('#close-transaction');
  await page.waitForTimeout(300);

  // delete the entry we just added
  await page.click('.dash-side-nav [data-view="transactions"]');
  await page.fill('#transaction-search', 'E2E Flat 250');
  await page.waitForTimeout(500);
  check('added entry is searchable', (await page.locator('#transaction-list').innerText()).includes('E2E Flat 250'));
  await page.locator('#transaction-list .dash-row .row-del:not([disabled])').first().click();
  await page.waitForTimeout(700);
  check('entry deleted', !(await page.locator('#transaction-list').innerText()).includes('E2E Flat 250'));

  // search + type filter
  await page.fill('#transaction-search', 'rent');
  await page.waitForTimeout(400);
  const searched = await page.locator('#transaction-list').innerText();
  check('search filters rows', searched.toLowerCase().includes('rent') && !searched.includes('Salad'));
  await page.selectOption('#transaction-filter', 'income');
  await page.waitForTimeout(400);
  const incomeOnly = await page.locator('#transaction-list').innerText();
  check('type filter works', !/Uber|Apartment rent|Groceries/.test(incomeOnly), incomeOnly.slice(0, 40));
  await page.selectOption('#transaction-filter', 'all');
  await page.fill('#transaction-search', '');
  await page.waitForTimeout(400);

  check('breakdown renders', (await page.locator('#category-breakdown').innerText()).includes('% of spending'));
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }).catch(() => null), page.click('#export-csv')]);
  check('export CSV downloads', !!download, download ? await download.suggestedFilename() : 'none');
  if (download) {
    const csv = fs.readFileSync(await download.path(), 'utf8').replace(/^\ufeff/, '');
    const header = csv.split(/\r?\n/)[0];
    check('CSV carries currency and minor units', /amount_minor/.test(header) && /currency/.test(header) && /home_amount/.test(header) && csv.includes(',INR,'), header);
  }

  // ================= CLOUD MODE =================
  await login(page);
  await page.click('.dash-side-nav [data-view="overview"]');
  await page.waitForTimeout(900);
  const summary = await api(page, '/api/summary?months=6');
  check('summary endpoint returns', summary.status === 200 && summary.body.totals, JSON.stringify(summary.body.totals || {}).slice(0, 90));

  const shownBalance = money(await page.locator('#total-balance').innerText());
  check('balance matches server', near(shownBalance, summary.body.totals.balanceMajor, 2), `${shownBalance} vs ${summary.body.totals.balanceMajor.toFixed(0)}`);
  const shownIncome = money(await page.locator('#total-income').innerText());
  check('income matches server', near(shownIncome, summary.body.totals.incomeMajor, 2), `${shownIncome} vs ${summary.body.totals.incomeMajor.toFixed(0)}`);
  const shownSpend = money(await page.locator('#total-expenses').innerText());
  check('spending matches server', near(shownSpend, summary.body.totals.expenseMajor, 2), `${shownSpend} vs ${summary.body.totals.expenseMajor.toFixed(0)}`);

  // chart reflects the real months
  const cols = await page.locator('.chart-col').count();
  check('chart renders one column per month', cols === summary.body.months.length, `${cols} vs ${summary.body.months.length}`);
  await page.locator('.chart-col').nth(3).dispatchEvent('mouseenter');
  await page.waitForTimeout(400);
  const tip = await page.locator('#chart-tooltip').innerText();
  const tipMonth = summary.body.months[3];
  check('chart tooltip shows the real month', tip.includes('In') && tip.includes(String(Math.round(tipMonth.income)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')), tip.replace(/\n/g, ' ').slice(0, 60));
  await page.locator('.chart-col').nth(3).dispatchEvent('click');
  await page.waitForTimeout(600);
  check('chart month selection filters', (await page.locator('#chart-selection').innerText()).includes(tipMonth.key), await page.locator('#chart-selection').innerText());
  await page.click('[data-range="12"]');
  await page.waitForTimeout(1800);
  check('chart range switch works', (await page.locator('.chart-col').count()) === 12, (await page.locator('.chart-col').count()) + ' columns');
  await page.click('[data-range="6"]');
  await page.waitForTimeout(1500);

  // metric cards open the detail drawer with real numbers
  await page.click('[data-metric="expense"]');
  await page.waitForTimeout(700);
  const drawerText = await page.locator('#drawer-body').innerText();
  check('spending drawer opens with categories', (await page.locator('#detail-drawer.open').count()) === 1 && drawerText.includes('Housing'), drawerText.replace(/\n/g, ' ').slice(0, 60));
  await Shot(page, '03-drawer');
  await page.click('#drawer-close');
  await page.waitForTimeout(400);
  check('drawer closes', (await page.locator('#detail-drawer.open').count()) === 0);

  // budgets: exact percentage maths
  await page.click('.dash-side-nav [data-view="budgets"]');
  await page.waitForTimeout(900);
  const budgetRows = await page.locator('#budget-list .budget-row').count();
  check('budgets render as rows', budgetRows === summary.body.budgets.length, `${budgetRows} rows`);
  const firstBudget = summary.body.budgets[0];
  const budgetText = await page.locator('#budget-list .budget-row').first().innerText();
  check('budget shows spent of limit', budgetText.includes(String(Math.round(firstBudget.spentMajor)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')) || budgetText.includes(String(Math.round(firstBudget.spentMajor))), budgetText.replace(/\n/g, ' ').slice(0, 70));
  check('budget percentage is exact', budgetText.includes(`${firstBudget.pct}%`), budgetText.replace(/\n/g, ' ').slice(0, 70));

  // create a budget with an exact limit and verify the reported number
  const cat = 'E2E Cat ' + Date.now().toString(36);
  await page.fill('#new-budget-cat', cat);
  await page.fill('#new-budget-limit', '2000');
  await page.click('#add-budget');
  await page.waitForTimeout(1800);
  const created = await api(page, '/api/budgets');
  const raw = created.body.find(b => b.category === cat);
  check('created budget limit is exactly 2000', raw && raw.limitMinor === '200000', raw ? raw.limitMinor : 'not found');
  const createdProgress = (await api(page, '/api/summary')).body.budgets.find(b => b.category === cat);
  check('new budget starts at 0%', !!createdProgress && createdProgress.spentMajor === 0 && createdProgress.pct === 0, createdProgress ? `${createdProgress.spentMajor} / ${createdProgress.pct}%` : 'missing from summary');
  check('new budget reports the exact limit', !!createdProgress && createdProgress.limitMajor === 2000, createdProgress ? String(createdProgress.limitMajor) : 'n/a');

  // goal contribution must add exactly the contributed amount
  await page.click('.dash-side-nav [data-view="goals"]');
  await page.waitForTimeout(900);
  const goalRow = page.locator('#goal-list .goal-row', { hasText: 'Emergency fund' });
  const goalBefore = money((await goalRow.innerText()).split('of')[0]);
  const goalId = await goalRow.locator('[data-goal]').getAttribute('data-goal');
  await goalRow.locator(`[data-contrib="${goalId}"]`).fill('1000');
  await goalRow.locator('[data-goal]').click();
  await page.waitForTimeout(2600);
  const goalAfter = money((await page.locator('#goal-list .goal-row', { hasText: 'Emergency fund' }).innerText()).split('of')[0]);
  check('goal contribute adds exactly 1000', near(goalAfter - goalBefore, 1000, 1), `${goalBefore} -> ${goalAfter}`);

  // recurring post creates exactly one transaction
  await page.click('.dash-side-nav [data-view="recurring"]');
  await page.waitForTimeout(900);
  const txCountBefore = (await api(page, '/api/transactions')).body.length;
  await page.locator('[data-rec]').first().click();
  await page.waitForTimeout(2200);
  const txCountAfter = (await api(page, '/api/transactions')).body.length;
  check('recurring posts exactly one transaction', txCountAfter === txCountBefore + 1, `${txCountBefore} -> ${txCountAfter}`);

  // transfer: source decreases, destination increases
  await page.click('.dash-side-nav [data-view="accounts"]');
  await page.waitForTimeout(900);
  const accountsBefore = (await api(page, '/api/summary')).body.accounts;
  await page.fill('#transfer-amount', '100');
  await page.click('#do-transfer');
  await page.waitForTimeout(2600);
  const accountsAfter = (await api(page, '/api/summary')).body.accounts;
  const srcBefore = accountsBefore[0], srcAfter = accountsAfter[0];
  check('transfer debits the source account exactly', near(srcBefore.balanceMajor - srcAfter.balanceMajor, 100, 0.01), `${srcBefore.balanceMajor} -> ${srcAfter.balanceMajor}`);
  const dstBefore = accountsBefore[1], dstAfter = accountsAfter[1];
  check('transfer credits the destination account', dstAfter.balanceMajor > dstBefore.balanceMajor, `${dstBefore.balanceMajor} -> ${dstAfter.balanceMajor}`);

  // insights cards open evidence
  await page.click('.dash-side-nav [data-view="insights"]');
  await page.waitForTimeout(1000);
  check('insight cards render', (await page.locator('.insight-card').count()) >= 3, (await page.locator('.insight-card').count()) + ' cards');
  check('every insight has evidence', (await page.locator('.insight-card .insight-more').allInnerTexts()).every(t => /Evidence \d+ entr|Open breakdown/.test(t)));
  await page.locator('.insight-card').first().click();
  await page.waitForTimeout(700);
  check('insight opens evidence drawer', (await page.locator('#detail-drawer.open').count()) === 1, (await page.locator('#drawer-body').innerText()).replace(/\n/g, ' ').slice(0, 60));
  await page.click('#drawer-close');
  await page.waitForTimeout(400);

  // pulse
  await page.click('.dash-side-nav [data-view="pulse"]');
  await page.waitForTimeout(2500);
  const hist = await api(page, '/api/fx/history?base=USD&quote=EUR&days=30');
  const histPoints = Object.keys((hist && hist.body && hist.body.rates) || {}).length;
  check('fx history returns daily points', hist.status === 200 && histPoints >= 15, histPoints + ' points');
  check('pulse tiles render', (await page.locator('.pulse-tile').count()) === 4);
  check('pulse shows a rate', /FRESH|STALE/.test(await page.locator('#pulse-list').innerText()));
  await Shot(page, '04-pulse');

  // custom select + bank suggestions
  await page.click('.dash-side-nav [data-view="accounts"]');
  await page.waitForTimeout(800);
  await page.locator('#new-account-name').click();
  await page.waitForTimeout(400);
  check('bank suggestions appear', (await page.locator('.suggest-item').count()) > 3, (await page.locator('.suggest-item').count()) + ' banks');
  await page.fill('#new-account-name', 'hdf');
  await page.waitForTimeout(400);
  check('bank suggestions filter', (await page.locator('.suggest-item').count()) === 1, (await page.locator('.suggest-item').allInnerTexts()).join(','));

  // cleanup: remove the budget created by the test (and prove deletion works)
  await page.click('.dash-side-nav [data-view="budgets"]');
  await page.waitForTimeout(900);
  const e2eRow = page.locator('#budget-list .budget-row', { hasText: cat });
  check('test budget is visible before cleanup', (await e2eRow.count()) === 1);
  await e2eRow.locator('[data-budget-del]').click();
  await page.waitForTimeout(2000);
  check('budget delete removes it', (await api(page, '/api/budgets')).body.every(b => b.category !== cat));
  check('budgets view no longer shows the test budget', !(await page.locator('#budget-list').innerText()).includes(cat));

  // sign out
  await page.click('#auth-button');
  await page.waitForTimeout(900);
  check('sign out restores local demo', (await page.locator('#cloud-status').innerText()).includes('LOCAL DEMO'));
  await page.close();

  // ================= MOBILE =================
  const mob = await newPage({ width: 390, height: 844 });
  await mob.goto(WEB, { waitUntil: 'domcontentloaded' });
  await ready(mob);
  await openDashboard(mob);
  check('mobile: sidebar hidden', !(await mob.locator('.dash-sidebar').isVisible()));
  check('mobile: tab bar visible', await mob.locator('.dash-viewtabs').isVisible());
  await mob.locator('.dash-viewtabs button', { hasText: 'Goals' }).click();
  await mob.waitForTimeout(400);
  check('mobile: tab switches view', (await mob.locator('#view-goals.active').count()) === 1);
  await Shot(mob, '05-mobile');
  await mob.close();

  // ================= OFFLINE =================
  const off = await newPage();
  await off.route('**/api/**', route => route.abort());
  await off.goto(WEB, { waitUntil: 'domcontentloaded' });
  await ready(off);
  await off.waitForTimeout(2500);
  await openDashboard(off);
  check('offline: dashboard still opens', (await off.locator('#total-balance').innerText()).length > 1);
  await off.click('#open-transaction');
  await off.fill('#transaction-name', 'Offline entry');
  await off.fill('#transaction-amount', '99');
  await off.click('.tx-submit');
  await off.waitForTimeout(700);
  check('offline: local save works', (await off.locator('#transaction-list').innerText()).includes('Offline entry'));
  await off.close();
  // ================= AUTH HARDENING =================
  const auth = await newPage();
  await auth.goto(WEB, { waitUntil: 'domcontentloaded' });
  await ready(auth);
  await openDashboard(auth);
  await login(auth);
  const logout = await api(auth, '/api/auth/logout', { method: 'POST' });
  check('auth: logout succeeds', logout.status === 200, logout.status);
  const revoked = await api(auth, '/api/summary?months=1');
  check('auth: revoked token rejected', revoked.status === 401, revoked.status);
  const codes = [];
  for (let i = 0; i < 12; i++) {
    codes.push(await auth.evaluate(async (apiBase) => {
      const res = await fetch(apiBase + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'limit-test@ledgerly.app', password: 'wrong-password' }) });
      return res.status;
    }, API));
  }
  check('auth: failed logins rate-limited', codes.includes(429), codes.join(','));
  await auth.close();

  // ================= ACCOUNT RECOVERY UI =================
  const recovery = await newPage();
  await recovery.goto(WEB + '/?reset=e2e-invalid-reset-token', { waitUntil: 'domcontentloaded' });
  await ready(recovery);
  await recovery.waitForSelector('#auth-modal.open');
  check('recovery: reset link opens the reset form', (await recovery.locator('#auth-title').innerText()) === 'Choose a new password');
  check('recovery: reset token removed from the URL', !recovery.url().includes('reset='));
  await recovery.fill('#auth-password', 'new-password-456');
  await recovery.fill('#auth-password-confirm', 'new-password-457');
  await recovery.click('#auth-submit');
  check('recovery: mismatched passwords rejected', (await recovery.locator('#auth-error').innerText()).includes('do not match'));
  await recovery.fill('#auth-password-confirm', 'new-password-456');
  await recovery.click('#auth-submit');
  await recovery.waitForFunction(() => /invalid or has expired/i.test(document.querySelector('#auth-error')?.textContent || ''), { timeout: 10000 });
  check('recovery: invalid reset token rejected', (await recovery.locator('#auth-error').innerText()).includes('invalid or has expired'));
  await recovery.click('#auth-close');
  await recovery.click('#open-auth-modal');
  await recovery.click('#auth-forgot');
  check('recovery: forgot-password form opens', (await recovery.locator('#auth-title').innerText()) === 'Reset your password');
  await recovery.fill('#auth-email', `missing-e2e-${Date.now()}@example.com`);
  await recovery.click('#auth-submit');
  await recovery.waitForFunction(() => /reset link/i.test(document.querySelector('#auth-error')?.textContent || ''), { timeout: 10000 });
  check('recovery: forgot response is non-enumerating', (await recovery.locator('#auth-error').innerText()).includes('If that email is registered'));
  await recovery.click('#auth-signup');
  check('recovery: back to sign in works', (await recovery.locator('#auth-title').innerText()) === 'Sign in to Roviel');
  await recovery.close();
} catch (e) {
  console.log('SUITE ABORT:', String(e).slice(0, 400));
}

check('no uncaught page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
const failed = results.filter(r => !r.ok);
console.log(`\n==== ${results.length - failed.length}/${results.length} passed ====`);
if (failed.length) console.log('FAILED:\n - ' + failed.map(f => `${f.name} (${f.detail})`).join('\n - '));
process.exit(failed.length ? 1 : 0);
