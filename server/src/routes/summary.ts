import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { requireAuth, type AuthedRequest } from '../middleware/requireAuth.js';
import { toMajorUnits, minorScale } from '../lib/money.js';
import { getRate } from '../lib/fx.js';

const router = Router();
router.use(requireAuth);

// Convert an amount in `currency` to the user's home currency using the latest
// observation we have (cached in Postgres, refreshed from Frankfurter when stale).
async function homeRate(currency: string, home: string, cache: Map<string, number>) {
  if (currency === home) return 1;
  const key = `${currency}/${home}`;
  if (cache.has(key)) return cache.get(key)!;
  let rate = 1;
  try {
    const r = await getRate(currency, home);
    rate = r.rate;
  } catch {
    const cached = await prisma.exchangeRate.findFirst({
      where: { base: currency, quote: home }, orderBy: { date: 'desc' },
    }).catch(() => null);
    rate = cached ? Number(cached.rate) : 1;
  }
  cache.set(key, rate);
  return rate;
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

router.get('/', async (req: AuthedRequest, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) { res.status(404).json({ error: 'Not found' }); return; }
  const home = user.homeCurrency;
  const months = Number((req.query.months as any) || 12);

  const [accounts, transactions, budgets, goals] = await Promise.all([
    prisma.account.findMany({ where: { userId: req.userId! }, orderBy: { createdAt: 'asc' } }),
    prisma.transaction.findMany({ where: { userId: req.userId! }, orderBy: { bookedAt: 'desc' } }),
    prisma.budget.findMany({ where: { userId: req.userId! } }),
    prisma.savingsGoal.findMany({ where: { userId: req.userId! } }),
  ]);

  const cache = new Map<string, number>();
  const currencies = [...new Set(accounts.map(a => a.currency))];
  for (const currency of currencies) await homeRate(currency, home, cache);

  // Per-account balance in its own currency + converted home value
  const balances = accounts.map(account => {
    const rows = transactions.filter(t => t.accountId === account.id);
    const netMinor = rows.reduce((sum, t) => sum + Number(t.amountMinor), 0);
    const opening = toMajorUnits(account.openingMinor, account.currency);
    const net = toMajorUnits(netMinor, account.currency);
    const rate = cache.get(`${account.currency}/${home}`) ?? 1;
    return {
      id: account.id, name: account.name, type: account.type, currency: account.currency,
      openingMajor: opening, netMajor: net, balanceMajor: opening + net,
      homeMajor: (opening + net) * rate, rate,
    };
  });

  // Totals in home currency
  let incomeHome = 0, expenseHome = 0;
  const byCategory = new Map<string, number>();
  const byCategoryMonth = new Map<string, Map<string, number>>();
  for (const t of transactions) {
    const rate = t.rateToHome && Number(t.rateToHome) > 0 ? Number(t.rateToHome) : (cache.get(`${t.currency}/${home}`) ?? 1);
    const major = toMajorUnits(t.amountMinor, t.currency) * rate;
    // Transfers move money between your own accounts — they are not income or spending.
    if (t.kind === 'income') incomeHome += major;
    else if (t.kind === 'expense') {
      expenseHome += Math.abs(major);
      byCategory.set(t.category, (byCategory.get(t.category) || 0) + Math.abs(major));
      const mKey = monthKey(new Date(t.bookedAt));
      if (!byCategoryMonth.has(mKey)) byCategoryMonth.set(mKey, new Map());
      const monthMap = byCategoryMonth.get(mKey)!;
      monthMap.set(t.category, (monthMap.get(t.category) || 0) + Math.abs(major));
    }
  }
  const totalBalanceHome = balances.reduce((sum, b) => sum + b.homeMajor, 0);

  // Monthly series for the chart (real data, oldest -> newest)
  const now = new Date();
  const buckets: { key: string; label: string; income: number; expense: number; net: number }[] = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString(undefined, { month: 'short' }),
      income: 0, expense: 0, net: 0,
    });
  }
  const index = new Map(buckets.map(b => [b.key, b]));
  for (const t of transactions) {
    const key = monthKey(new Date(t.bookedAt));
    const bucket = index.get(key);
    if (!bucket) continue;
    const rate = t.rateToHome && Number(t.rateToHome) > 0 ? Number(t.rateToHome) : (cache.get(`${t.currency}/${home}`) ?? 1);
    const major = toMajorUnits(t.amountMinor, t.currency) * rate;
    if (t.kind === 'income') { bucket.income += major; bucket.net += major; }
    else if (t.kind === 'expense') { bucket.expense += Math.abs(major); bucket.net -= Math.abs(major); }
  }

  // Budget progress in the budget's own currency (converted spend -> budget currency)
  const currentMonth = monthKey(new Date());
  const budgetProgress = budgets.map(b => {
    const rate = b.currency === home ? 1 : (cache.get(`${home}/${b.currency}`) ?? 1);
    // A budget is scoped to its own month (falling back to this month only when
    // no month was set) — never to "whatever month happens to have activity".
    const scope = b.yearMonth || currentMonth;
    const monthMap = byCategoryMonth.get(scope) || new Map<string, number>();
    const spent = (monthMap.get(b.category) || 0) * rate;
    const limit = toMajorUnits(b.limitMinor, b.currency);
    return {
      id: b.id, category: b.category, currency: b.currency, yearMonth: b.yearMonth, scopedMonth: scope,
      limitMajor: limit, spentMajor: spent,
      pct: limit > 0 ? Math.round(spent / limit * 100) : 0, over: limit > 0 && spent > limit,
    };
  });

  const goalProgress = goals.map(g => {
    const target = toMajorUnits(g.targetMinor, g.currency);
    const saved = toMajorUnits(g.savedMinor, g.currency);
    return {
      id: g.id, title: g.title, currency: g.currency, targetMajor: target, savedMajor: saved,
      remainingMajor: Math.max(0, target - saved),
      pct: target > 0 ? Math.round(saved / target * 100) : 0,
      deadline: g.deadline,
    };
  });

  res.json({
    homeCurrency: home,
    totals: {
      balanceMajor: totalBalanceHome,
      incomeMajor: incomeHome,
      expenseMajor: expenseHome,
      netMajor: incomeHome - expenseHome,
      savingsRate: incomeHome > 0 ? Math.round((incomeHome - expenseHome) / incomeHome * 1000) / 10 : 0,
      transactionCount: transactions.length,
    },
    accounts: balances,
    categories: [...byCategory.entries()].map(([category, amount]) => ({ category, amountMajor: amount })).sort((a, b) => b.amountMajor - a.amountMajor),
    months: buckets,
    budgets: budgetProgress,
    goals: goalProgress,
    minorScale: Object.fromEntries([...new Set(accounts.map(a => a.currency))].map(c => [c, minorScale(c)])),
    disclaimer: 'Values in your home currency use the latest reference rate. Informational, not provider quotes.',
  });
});

export default router;
