import { Router } from 'express';
import { prisma } from '../lib/db.js';
import { requireAuth, type AuthedRequest } from '../middleware/requireAuth.js';
import { toMajorUnits } from '../lib/money.js';

const router = Router();
router.use(requireAuth);

// Deterministic, evidence-based insights — no black-box advice. AI provider plugs in later.
router.get('/', async (req: AuthedRequest, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) { res.status(404).json({ error: 'Not found' }); return; }
  const home = user.homeCurrency;
  const txs = await prisma.transaction.findMany({ where: { userId: req.userId! }, orderBy: { bookedAt: 'desc' }, take: 500 });

  // Everything is reported in the user's home currency, in major units.
  const value = (t: any) => {
    const rate = t.rateToHome && Number(t.rateToHome) > 0 ? Number(t.rateToHome) : 1;
    return toMajorUnits(t.amountMinor, t.currency) * rate;
  };
  const income = txs.filter(t => t.kind === 'income').reduce((s, t) => s + value(t), 0);
  const expense = txs.filter(t => t.kind === 'expense').reduce((s, t) => s + Math.abs(value(t)), 0);
  const byCat: Record<string, number> = {};
  txs.forEach(t => { if (t.kind === 'expense') byCat[t.category] = (byCat[t.category] || 0) + Math.abs(value(t)); });
  const top = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0];
  const money = (n: number) => `${home} ${Math.round(n).toLocaleString('en-US')}`;
  const monthLabel = (key: string) => {
    const [y, m] = key.split('-').map(Number);
    return new Date(y, (m || 1) - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };
  const rate = income > 0 ? Math.round(((income - expense) / income) * 1000) / 10 : 0;
  const monthly = new Map<string, number>();
  txs.forEach(t => { if (t.kind === 'expense') { const k = new Date(t.bookedAt).toISOString().slice(0, 7); monthly.set(k, (monthly.get(k) || 0) + Math.abs(value(t))); } });
  // The current month is still in progress — comparing it with full months would
  // always crown it the "lightest". Use completed months when we have them.
  const currentKey = new Date().toISOString().slice(0, 7);
  const completed = [...monthly.entries()].filter(([key]) => key !== currentKey);
  const comparable = completed.length >= 2 ? completed : [...monthly.entries()];
  const best = [...comparable].sort((a, b) => a[1] - b[1])[0];
  const worst = [...comparable].sort((a, b) => b[1] - a[1])[0];

  const insights = [];
  insights.push({
    kind: 'savings-rate',
    title: rate >= 0 ? 'You are keeping money' : 'You are spending more than you earn',
    body: rate >= 0
      ? `Savings rate ${rate}% — ${money(income - expense)} left of ${money(income)} recorded income.`
      : `Savings rate ${rate}% — spending ran ${money(expense - income)} above recorded income.`,
    value: `${rate}%`, refs: txs.filter(t => t.kind === 'income').slice(0, 3).map(t => t.id),
  });
  if (top) insights.push({
    kind: 'top-category',
    title: `Biggest outflow: ${top[0]}`,
    body: `${money(top[1])} across ${txs.filter(t => t.category === top[0] && t.kind === 'expense').length} entries — ${Math.round(top[1] / (expense || 1) * 100)}% of all spending.`,
    value: money(top[1]), refs: txs.filter(t => t.category === top[0]).slice(0, 3).map(t => t.id),
  });
  if (best && worst && best[0] !== worst[0]) insights.push({
    kind: 'monthly',
    title: 'Cheapest and heaviest months',
    body: `${monthLabel(best[0])} was your lightest month at ${money(best[1])}. ${monthLabel(worst[0])} was the heaviest at ${money(worst[1])}.`,
    value: `${money(worst[1] - best[1])} swing`,
    refs: txs.filter(t => t.kind === 'expense' && new Date(t.bookedAt).toISOString().slice(0, 7) === worst[0]).slice(0, 3).map(t => t.id),
  });
  insights.push({
    kind: 'entries',
    title: 'Ledger size',
    body: `${txs.length} entries recorded${txs.length ? ` · oldest ${new Date(txs[txs.length - 1].bookedAt).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}` : ''}.`,
    value: String(txs.length), refs: txs.slice(0, 3).map(t => t.id),
  });

  res.json({
    insights, currency: home,
    counts: { income: Math.round(income), expense: Math.round(expense), n: txs.length },
    disclaimer: 'Deterministic summaries computed from your entries. No predictions.',
  });
});
export default router;
