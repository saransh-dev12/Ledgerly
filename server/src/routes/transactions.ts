import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { requireAuth, type AuthedRequest } from '../middleware/requireAuth.js';
import { toMinor, minorScale, convertWithRate } from '../lib/money.js';
import { getRate } from '../lib/fx.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req: AuthedRequest, res) => {
  const { accountId, from, to, kind } = req.query as any;
  const txs = await prisma.transaction.findMany({
    where: { userId: req.userId!, ...(accountId ? { accountId: String(accountId) } : {}), ...(kind && kind !== 'all' ? { kind: String(kind) } : {}),
      ...(from || to ? { bookedAt: { ...(from ? { gte: new Date(String(from)) } : {}), ...(to ? { lte: new Date(String(to)) } : {}) } } : {}) },
    orderBy: { bookedAt: 'desc' }, take: 200,
  });
  res.json(txs.map(t => ({ ...t, amountMinor: t.amountMinor.toString() })));
});

router.post('/', async (req: AuthedRequest, res) => {
  const s = z.object({
    accountId: z.string(), kind: z.enum(['income', 'expense']),
    amountMajor: z.number().positive(), currency: z.string().length(3).optional(),
    note: z.string().max(140).default(''), category: z.string().max(40).default('Other'),
    bookedAt: z.string().optional(),
  }).safeParse(req.body);
  if (!s.success) { res.status(400).json({ error: s.error.issues[0]?.message }); return; }
  const acct = await prisma.account.findFirst({ where: { id: s.data.accountId, userId: req.userId! } });
  if (!acct) { res.status(404).json({ error: 'Account not found' }); return; }
  const cur = (s.data.currency || acct.currency).toUpperCase();
  const signed = s.data.kind === 'income' ? toMinor(s.data.amountMajor, cur) : -toMinor(s.data.amountMajor, cur);
  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  let rateToHome: number | null = null;
  if (cur !== user!.homeCurrency) {
    try { const r = await getRate(cur, user!.homeCurrency); rateToHome = r.rate; } catch {}
  } else rateToHome = 1;
  const tx = await prisma.transaction.create({ data: {
    userId: req.userId!, accountId: acct.id, kind: s.data.kind,
    amountMinor: signed, currency: cur, note: s.data.note, category: s.data.kind === 'income' ? 'Income' : s.data.category,
    bookedAt: s.data.bookedAt ? new Date(s.data.bookedAt) : new Date(),
    rateToHome,
  }});
  res.status(201).json({ ...tx, amountMinor: tx.amountMinor.toString() });
});

router.post('/transfer', async (req: AuthedRequest, res) => {
  const s = z.object({ fromAccountId: z.string(), toAccountId: z.string(), amountMajor: z.number().positive(), note: z.string().max(140).default('') }).safeParse(req.body);
  if (!s.success) { res.status(400).json({ error: s.error.issues[0]?.message }); return; }
  const [from, to] = await Promise.all([
    prisma.account.findFirst({ where: { id: s.data.fromAccountId, userId: req.userId! } }),
    prisma.account.findFirst({ where: { id: s.data.toAccountId, userId: req.userId! } }),
  ]);
  if (!from || !to) { res.status(404).json({ error: 'Account not found' }); return; }
  if (from.id === to.id) { res.status(400).json({ error: 'Choose two different accounts' }); return; }
  let rate = 1;
  if (from.currency !== to.currency) { try { rate = (await getRate(from.currency, to.currency)).rate; } catch { res.status(502).json({ error: 'FX unavailable' }); return; } }
  const outMinor = -toMinor(s.data.amountMajor, from.currency);
  // Exact per-currency path: major → rate → dest minor (no assumed ×100).
  const inMinor = convertWithRate(-outMinor, rate, from.currency, to.currency);
  const result = await prisma.$transaction(async (db) => {
    const out = await db.transaction.create({ data: { userId: req.userId!, accountId: from.id, kind: 'transfer_out', amountMinor: outMinor, currency: from.currency, note: s.data.note || `Transfer to ${to.name}`, category: 'Transfer' } });
    const inn = await db.transaction.create({ data: { userId: req.userId!, accountId: to.id, kind: 'transfer_in', amountMinor: inMinor, currency: to.currency, note: s.data.note || `Transfer from ${from.name}`, category: 'Transfer' } });
    await db.transactionLink.create({ data: { fromId: out.id, toId: inn.id, linkType: 'transfer' } });
    return { out, inn };
  });
  res.status(201).json({ out: { ...result.out, amountMinor: result.out.amountMinor.toString() }, in: { ...result.inn, amountMinor: result.inn.amountMinor.toString() }, rate });
});

router.delete('/:id', async (req: AuthedRequest, res) => {
  const tx = await prisma.transaction.findFirst({
    where: { id: req.params.id, userId: req.userId! },
    include: { linksFrom: true, linksTo: true },
  });
  if (!tx) { res.status(404).json({ error: 'Not found' }); return; }
  if (tx.kind !== 'income' && tx.kind !== 'expense') {
    res.status(400).json({ error: 'Linked transfers cannot be deleted. Reverse them with a new transfer.' });
    return;
  }
  if (tx.linksFrom.length || tx.linksTo.length) {
    res.status(400).json({ error: 'Linked transaction. Reverse it instead of deleting.' });
    return;
  }
  await prisma.transaction.delete({ where: { id: tx.id } });
  res.json({ ok: true });
});

export default router;
