import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { requireAuth, type AuthedRequest } from '../middleware/requireAuth.js';
import { toMinor } from '../lib/money.js';

const router = Router();
router.use(requireAuth);

// Budgets
router.get('/budgets', async (req: AuthedRequest, res) => {
  const { month } = req.query as any;
  const list = await prisma.budget.findMany({ where: { userId: req.userId!, ...(month ? { yearMonth: String(month) } : {}) }, orderBy: [{ yearMonth: 'desc' }, { category: 'asc' }] });
  res.json(list.map(b => ({ ...b, limitMinor: b.limitMinor.toString() })));
});
router.post('/budgets', async (req: AuthedRequest, res) => {
  const s = z.object({ category: z.string().min(1), limitMajor: z.number().positive(), currency: z.string().length(3), yearMonth: z.string().regex(/^\d{4}-\d{2}$/) }).safeParse(req.body);
  if (!s.success) { res.status(400).json({ error: s.error.issues[0]?.message }); return; }
  const b = await prisma.budget.create({ data: { userId: req.userId!, category: s.data.category, limitMinor: toMinor(s.data.limitMajor, s.data.currency.toUpperCase()), currency: s.data.currency.toUpperCase(), yearMonth: s.data.yearMonth } });
  res.status(201).json({ ...b, limitMinor: b.limitMinor.toString() });
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
  const s = z.object({ title: z.string().min(1).max(80), targetMajor: z.number().positive(), currency: z.string().length(3), deadline: z.string().optional() }).safeParse(req.body);
  if (!s.success) { res.status(400).json({ error: s.error.issues[0]?.message }); return; }
  const g = await prisma.savingsGoal.create({ data: { userId: req.userId!, title: s.data.title, targetMinor: toMinor(s.data.targetMajor, s.data.currency.toUpperCase()), currency: s.data.currency.toUpperCase(), deadline: s.data.deadline ? new Date(s.data.deadline) : null } });
  res.status(201).json({ ...g, targetMinor: g.targetMinor.toString(), savedMinor: g.savedMinor.toString() });
});
router.post('/goals/:id/contribute', async (req: AuthedRequest, res) => {
  const s = z.object({ amountMajor: z.number().positive() }).safeParse(req.body);
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
  const s = z.object({ title: z.string().min(1), kind: z.enum(['income', 'expense']), amountMajor: z.number().positive(), currency: z.string().length(3), category: z.string().default('Other'), frequency: z.enum(['weekly', 'monthly', 'yearly']).default('monthly'), nextRun: z.string(), accountId: z.string().optional() }).safeParse(req.body);
  if (!s.success) { res.status(400).json({ error: s.error.issues[0]?.message }); return; }
  const r = await prisma.recurringRule.create({ data: { userId: req.userId!, title: s.data.title, kind: s.data.kind, amountMinor: toMinor(s.data.amountMajor, s.data.currency.toUpperCase()), currency: s.data.currency.toUpperCase(), category: s.data.category, frequency: s.data.frequency, nextRun: new Date(s.data.nextRun), accountId: s.data.accountId } });
  res.status(201).json({ ...r, amountMinor: r.amountMinor.toString() });
});
export default router;
