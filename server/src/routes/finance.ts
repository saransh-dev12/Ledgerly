import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { requireAuth, type AuthedRequest } from '../middleware/requireAuth.js';
import { normalizeCurrency, toMinor } from '../lib/money.js';
import { getRate } from '../lib/fx.js';

const router = Router();
router.use(requireAuth);
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

// Budgets
router.get('/budgets', async (req: AuthedRequest, res) => {
  const { month } = req.query as any;
  if (month !== undefined && !MONTH_RE.test(String(month))) {
    res.status(400).json({ error: 'month must use YYYY-MM.' });
    return;
  }
  const list = await prisma.budget.findMany({ where: { userId: req.userId!, ...(month ? { yearMonth: String(month) } : {}) }, orderBy: [{ yearMonth: 'desc' }, { category: 'asc' }] });
  res.json(list.map(b => ({ ...b, limitMinor: b.limitMinor.toString() })));
});
router.post('/budgets', async (req: AuthedRequest, res) => {
  const s = z.object({ category: z.string().trim().min(1).max(40), limitMajor: z.number().finite().positive().max(1_000_000_000_000), currency: z.string(), yearMonth: z.string().regex(MONTH_RE) }).safeParse(req.body);
  if (!s.success) { res.status(400).json({ error: s.error.issues[0]?.message }); return; }
  const currency = normalizeCurrency(s.data.currency);
  if (!currency) { res.status(400).json({ error: 'Unsupported currency code.' }); return; }
  try {
    const b = await prisma.budget.create({ data: { userId: req.userId!, category: s.data.category, limitMinor: toMinor(s.data.limitMajor, currency), currency, yearMonth: s.data.yearMonth } });
    res.status(201).json({ ...b, limitMinor: b.limitMinor.toString() });
  } catch (error: any) {
    if (error?.code === 'P2002') { res.status(409).json({ error: 'A budget already exists for that category and month.' }); return; }
    throw error;
  }
});
router.delete('/budgets/:id', async (req: AuthedRequest, res) => {
  const b = await prisma.budget.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!b) { res.status(404).json({ error: 'Not found' }); return; }
  await prisma.budget.delete({ where: { id: b.id } });
  res.status(204).end();
});
// Goals
router.get('/goals', async (req: AuthedRequest, res) => {
  const list = await prisma.savingsGoal.findMany({ where: { userId: req.userId! }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }] });
  res.json(list.map(g => ({ ...g, targetMinor: g.targetMinor.toString(), savedMinor: g.savedMinor.toString() })));
});
router.post('/goals', async (req: AuthedRequest, res) => {
  const s = z.object({ title: z.string().trim().min(1).max(80), targetMajor: z.number().finite().positive().max(1_000_000_000_000), currency: z.string(), deadline: z.string().optional() }).safeParse(req.body);
  if (!s.success) { res.status(400).json({ error: s.error.issues[0]?.message }); return; }
  const currency = normalizeCurrency(s.data.currency);
  if (!currency) { res.status(400).json({ error: 'Unsupported currency code.' }); return; }
  const deadline = s.data.deadline ? new Date(s.data.deadline) : null;
  if (deadline && !Number.isFinite(deadline.getTime())) { res.status(400).json({ error: 'Enter a valid deadline.' }); return; }
  const g = await prisma.savingsGoal.create({ data: { userId: req.userId!, title: s.data.title, targetMinor: toMinor(s.data.targetMajor, currency), currency, deadline } });
  res.status(201).json({ ...g, targetMinor: g.targetMinor.toString(), savedMinor: g.savedMinor.toString() });
});
router.patch('/goals/:id', async (req: AuthedRequest, res) => {
  const s = z.object({
    title: z.string().trim().min(1).max(80).optional(),
    targetMajor: z.number().finite().positive().max(1_000_000_000_000).optional(),
    deadline: z.string().nullable().optional(),
  }).safeParse(req.body);
  if (!s.success) { res.status(400).json({ error: s.error.issues[0]?.message }); return; }
  const g = await prisma.savingsGoal.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!g) { res.status(404).json({ error: 'Not found' }); return; }
  const deadline = s.data.deadline === undefined ? undefined : s.data.deadline === null ? null : new Date(s.data.deadline);
  if (deadline instanceof Date && !Number.isFinite(deadline.getTime())) { res.status(400).json({ error: 'Enter a valid deadline.' }); return; }
  const updated = await prisma.savingsGoal.update({
    where: { id: g.id },
    data: {
      ...(s.data.title !== undefined ? { title: s.data.title } : {}),
      ...(s.data.targetMajor !== undefined ? { targetMinor: toMinor(s.data.targetMajor, g.currency) } : {}),
      ...(deadline !== undefined ? { deadline } : {}),
    },
  });
  res.json({ ...updated, targetMinor: updated.targetMinor.toString(), savedMinor: updated.savedMinor.toString() });
});
router.delete('/goals/:id', async (req: AuthedRequest, res) => {
  const g = await prisma.savingsGoal.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!g) { res.status(404).json({ error: 'Not found' }); return; }
  await prisma.savingsGoal.delete({ where: { id: g.id } });
  res.status(204).end();
});
router.post('/goals/:id/contribute', async (req: AuthedRequest, res) => {
  const s = z.object({ amountMajor: z.number().finite().positive().max(1_000_000_000_000) }).safeParse(req.body);
  if (!s.success) { res.status(400).json({ error: 'Invalid amount' }); return; }
  const g = await prisma.savingsGoal.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!g) { res.status(404).json({ error: 'Not found' }); return; }
  const updated = await prisma.savingsGoal.update({ where: { id: g.id }, data: { savedMinor: g.savedMinor + toMinor(s.data.amountMajor, g.currency) } });
  res.json({ ...updated, targetMinor: updated.targetMinor.toString(), savedMinor: updated.savedMinor.toString() });
});
// Recurring
router.get('/recurring', async (req: AuthedRequest, res) => {
  const list = await prisma.recurringRule.findMany({ where: { userId: req.userId! }, orderBy: [{ nextRun: 'asc' }, { id: 'asc' }] });
  res.json(list.map(r => ({ ...r, amountMinor: r.amountMinor.toString() })));
});
router.post('/recurring', async (req: AuthedRequest, res) => {
  const s = z.object({ title: z.string().trim().min(1).max(80), kind: z.enum(['income', 'expense']), amountMajor: z.number().finite().positive().max(1_000_000_000_000), currency: z.string(), category: z.string().trim().max(40).default('Other'), frequency: z.enum(['weekly', 'monthly', 'yearly']).default('monthly'), nextRun: z.string(), accountId: z.string().optional() }).safeParse(req.body);
  if (!s.success) { res.status(400).json({ error: s.error.issues[0]?.message }); return; }
  const currency = normalizeCurrency(s.data.currency);
  if (!currency) { res.status(400).json({ error: 'Unsupported currency code.' }); return; }
  const nextRun = new Date(s.data.nextRun);
  if (!Number.isFinite(nextRun.getTime())) { res.status(400).json({ error: 'Enter a valid next run date.' }); return; }
  if (s.data.accountId) {
    const account = await prisma.account.findFirst({ where: { id: s.data.accountId, userId: req.userId! } });
    if (!account) { res.status(404).json({ error: 'Account not found' }); return; }
    if (account.currency !== currency) { res.status(400).json({ error: `This rule is in ${currency}; choose a ${currency} account.` }); return; }
  }
  const r = await prisma.recurringRule.create({ data: { userId: req.userId!, title: s.data.title, kind: s.data.kind, amountMinor: toMinor(s.data.amountMajor, currency), currency, category: s.data.category, frequency: s.data.frequency, nextRun, accountId: s.data.accountId } });
  res.status(201).json({ ...r, amountMinor: r.amountMinor.toString() });
});
router.post('/recurring/:id/post', async (req: AuthedRequest, res) => {
  const rule = await prisma.recurringRule.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!rule) { res.status(404).json({ error: 'Not found' }); return; }
  const account = rule.accountId
    ? await prisma.account.findFirst({ where: { id: rule.accountId, userId: req.userId! } })
    : await prisma.account.findFirst({ where: { userId: req.userId!, currency: rule.currency }, orderBy: { createdAt: 'asc' } });
  if (!account) { res.status(409).json({ error: `Add a ${rule.currency} account before posting this rule.` }); return; }
  if (account.currency !== rule.currency) { res.status(409).json({ error: `This rule is in ${rule.currency}, but its account holds ${account.currency}.` }); return; }
  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  let rateToHome: number | null = rule.currency === user!.homeCurrency ? 1 : null;
  if (rateToHome === null) { try { rateToHome = (await getRate(rule.currency, user!.homeCurrency)).rate; } catch {} }
  const signed = rule.kind === 'income' ? rule.amountMinor : -rule.amountMinor;
  const next = new Date(rule.nextRun);
  if (rule.frequency === 'weekly') next.setDate(next.getDate() + 7);
  else if (rule.frequency === 'yearly') next.setFullYear(next.getFullYear() + 1);
  else next.setMonth(next.getMonth() + 1);
  const result = await prisma.$transaction(async db => {
    const transaction = await db.transaction.create({ data: {
      userId: req.userId!, accountId: account.id, kind: rule.kind, amountMinor: signed,
      currency: rule.currency, note: rule.title, category: rule.kind === 'income' ? 'Income' : rule.category,
      bookedAt: new Date(), rateToHome,
    }});
    const recurring = await db.recurringRule.update({ where: { id: rule.id }, data: { nextRun: next } });
    return { transaction, recurring };
  });
  res.status(201).json({
    transaction: { ...result.transaction, amountMinor: result.transaction.amountMinor.toString() },
    rule: { ...result.recurring, amountMinor: result.recurring.amountMinor.toString() },
    ...(rateToHome === null ? { fxWarning: `No ${rule.currency}/${user!.homeCurrency} rate is available; totals will exclude this entry.` } : {}),
  });
});

export default router;
