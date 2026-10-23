import { Router } from 'express';
import { prisma } from '../lib/db.js';
import { requireAuth, type AuthedRequest } from '../middleware/requireAuth.js';
import { toMajorUnits, minorScale } from '../lib/money.js';
import { homeQuote, type HomeQuote, type QuoteCache } from '../lib/homeQuote.js';

const router = Router();
router.use(requireAuth);

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

router.get('/', async (req: AuthedRequest, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) { res.status(404).json({ error: 'Not found' }); return; }
  const home = user.homeCurrency;
  const months = Math.min(36, Math.max(1, Number((req.query.months as any) || 12)));

  const [accounts, transactions, budgets, goals] = await Promise.all([
    prisma.account.findMany({ where: { userId: req.userId! }, orderBy: { createdAt: 'asc' } }),
    prisma.transaction.findMany({ where: { userId: req.userId! }, orderBy: { bookedAt: 'desc' } }),
    prisma.budget.findMany({ where: { userId: req.userId! } }),
    prisma.savingsGoal.findMany({ where: { userId: req.userId! } }),
  ]);

  const cache: QuoteCache = new Map();
  const quotes = new Map<string, HomeQuote | null>();
  const quoteFor = async (currency: string) => {
    if (!quotes.has(currency)) quotes.set(currency, await homeQuote(currency, home, cache));
    return quotes.get(currency) ?? null;
  };
  await Promise.all([...new Set([...accounts.map(a => a.currency), ...transactions.map(t => t.currency)])].map(quoteFor));

  const missingBalances = new Set<string>();
  const missingTotals = new Set<string>();
  const stale = new Map<string, string>();

  const balances = accounts.map(account => {
    const rows = transactions.filter(t => t.accountId === account.id);
    const netMinor = rows.reduce((sum, t) => sum + Number(t.amountMinor), 0);
    const opening = toMajorUnits(account.openingMinor, account.currency);
    const net = toMajorUnits(netMinor, account.currency);
    const balance = opening + net;
    const quote = quotes.get(account.currency) ?? null;
    if (!quote) missingBalances.add(account.currency);
    else if (quote.stale) stale.set(`${account.currency}/${home}`, quote.date);
    return {
      id: account.id, name: account.name, type: account.type, currency: account.currency,
      openingMajor: opening, netMajor: net, balanceMajor: balance,
      homeMajor: quote ? balance * quote.rate : null,
      rate: quote ? quote.rate : null,
    };
  });

  let incomeHome = 0, expenseHome = 0;
  const byCategory = new Map<string, number>();
  const byCategoryMonth = new Map<string, Map<string, number>>();
  const incompleteMonths = new Set<string>();
  for (const t of transactions) {
    let rate: number | null = t.rateToHome && Number(t.rateToHome) > 0 ? Number(t.rateToHome) : null;
    if (rate === null) {
      const quote = quotes.get(t.currency) ?? null;
      if (!quote) { missingTotals.add(t.currency); incompleteMonths.add(monthKey(new Date(t.bookedAt))); continue; }
      rate = quote.rate;
      if (quote.stale) stale.set(`${t.currency}/${home}`, quote.date);
    }
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
  const totalsComplete = missingTotals.size === 0;
  const balancesComplete = missingBalances.size === 0;
  const totalBalanceHome = balancesComplete ? balances.reduce((sum, b) => sum + (b.homeMajor || 0), 0) : null;

  const now = new Date();
  const buckets: { key: string; label: string; income: number; expense: number; net: number; incomplete: boolean }[] = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString(undefined, { month: 'short' }),
      income: 0, expense: 0, net: 0, incomplete: false,
    });
  }
  const index = new Map(buckets.map(b => [b.key, b]));
  for (const t of transactions) {
    const key = monthKey(new Date(t.bookedAt));
    const bucket = index.get(key);
    if (!bucket) continue;
    let rate: number | null = t.rateToHome && Number(t.rateToHome) > 0 ? Number(t.rateToHome) : null;
    if (rate === null) {
      const quote = quotes.get(t.currency) ?? null;
      if (!quote) { bucket.incomplete = true; continue; }
      rate = quote.rate;
    }
    const major = toMajorUnits(t.amountMinor, t.currency) * rate;
    if (t.kind === 'income') { bucket.income += major; bucket.net += major; }
    else if (t.kind === 'expense') { bucket.expense += Math.abs(major); bucket.net -= Math.abs(major); }
  }

  const currentMonth = monthKey(new Date());
  const budgetProgress = await Promise.all(budgets.map(async b => {
    const limit = toMajorUnits(b.limitMinor, b.currency);
    let rate = 1;
    let complete = totalsComplete;
    if (b.currency !== home) {
      const quote = await quoteFor(b.currency);
      if (!quote) { complete = false; rate = NaN; }
      else {
        rate = 1 / quote.rate;
        if (quote.stale) stale.set(`${b.currency}/${home}`, quote.date);
      }
    }
    const scope = b.yearMonth || currentMonth;
    const monthMap = byCategoryMonth.get(scope) || new Map<string, number>();
    const spent = Number.isFinite(rate) ? (monthMap.get(b.category) || 0) * rate : null;
    return {
      id: b.id, category: b.category, currency: b.currency, yearMonth: b.yearMonth, scopedMonth: scope,
      limitMajor: limit, spentMajor: spent, complete,
      pct: spent !== null && limit > 0 ? Math.round(spent / limit * 100) : null,
      over: spent !== null && limit > 0 && spent > limit,
    };
  }));

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

  const missing = [...new Set([...missingTotals, ...missingBalances])].sort();
  const disclaimer = 'Values in your home currency use the latest reference rate. Informational, not provider quotes.'
    + (missing.length ? ` Missing FX rates for ${missing.join(', ')}; affected totals are marked unavailable.` : '');

  res.json({
    homeCurrency: home,
    locale: user.locale,
    totals: {
      balanceMajor: totalBalanceHome,
      incomeMajor: totalsComplete ? incomeHome : null,
      expenseMajor: totalsComplete ? expenseHome : null,
      netMajor: totalsComplete ? incomeHome - expenseHome : null,
      savingsRate: totalsComplete && incomeHome > 0 ? Math.round((incomeHome - expenseHome) / incomeHome * 1000) / 10 : null,
      transactionCount: transactions.length,
      complete: totalsComplete,
    },
    fx: {
      base: home,
      missing,
      missingForTotals: [...missingTotals].sort(),
      missingForBalances: [...missingBalances].sort(),
      stale: [...stale.entries()].map(([pair, date]) => ({ pair, date })),
    },
    accounts: balances,
    categories: [...byCategory.entries()].map(([category, amount]) => ({ category, amountMajor: amount })).sort((a, b) => b.amountMajor - a.amountMajor),
    months: buckets,
    budgets: budgetProgress,
    goals: goalProgress,
    minorScale: Object.fromEntries([...new Set([...accounts.map(a => a.currency), ...budgets.map(b => b.currency)])].map(c => [c, minorScale(c)])),
    disclaimer,
  });
});

export default router;
