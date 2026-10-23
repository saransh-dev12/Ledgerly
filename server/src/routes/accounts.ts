import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { requireAuth, type AuthedRequest } from '../middleware/requireAuth.js';
import { normalizeCurrency, toMinor } from '../lib/money.js';

const router = Router();
router.use(requireAuth);

const ACCOUNT_TYPES = ['cash', 'bank', 'wallet', 'card'] as const;

router.get('/', async (req: AuthedRequest, res) => {
  const accounts = await prisma.account.findMany({ where: { userId: req.userId! }, orderBy: { createdAt: 'asc' } });
  res.json(accounts.map(a => ({ ...a, openingMinor: a.openingMinor.toString() })));
});

router.post('/', async (req: AuthedRequest, res) => {
  const s = z.object({
    name: z.string().trim().min(1).max(60),
    currency: z.string(),
    type: z.enum(ACCOUNT_TYPES).default('cash'),
    openingMajor: z.number().finite().min(-1_000_000_000_000).max(1_000_000_000_000).default(0),
  }).safeParse(req.body);
  if (!s.success) { res.status(400).json({ error: s.error.issues[0]?.message }); return; }
  const currency = normalizeCurrency(s.data.currency);
  if (!currency) { res.status(400).json({ error: 'Unsupported currency code.' }); return; }
  const a = await prisma.account.create({ data: {
    userId: req.userId!, name: s.data.name, currency, type: s.data.type,
    openingMinor: toMinor(s.data.openingMajor, currency),
  } });
  res.status(201).json({ ...a, openingMinor: a.openingMinor.toString() });
});

router.patch('/:id', async (req: AuthedRequest, res) => {
  const s = z.object({ name: z.string().trim().min(1).max(60).optional(), type: z.enum(ACCOUNT_TYPES).optional() }).safeParse(req.body);
  if (!s.success) { res.status(400).json({ error: s.error.issues[0]?.message }); return; }
  const account = await prisma.account.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!account) { res.status(404).json({ error: 'Not found' }); return; }
  const updated = await prisma.account.update({ where: { id: account.id }, data: s.data });
  res.json({ ...updated, openingMinor: updated.openingMinor.toString() });
});

router.delete('/:id', async (req: AuthedRequest, res) => {
  const account = await prisma.account.findFirst({
    where: { id: req.params.id, userId: req.userId! },
    include: { _count: { select: { transactions: true } } },
  });
  if (!account) { res.status(404).json({ error: 'Not found' }); return; }
  if (account._count.transactions > 0) {
    res.status(409).json({ error: 'This account has transactions. Move or remove them before deleting it.' });
    return;
  }
  const total = await prisma.account.count({ where: { userId: req.userId! } });
  if (total <= 1) {
    res.status(409).json({ error: 'Keep at least one account so new activity has somewhere to go.' });
    return;
  }
  await prisma.account.delete({ where: { id: account.id } });
  res.status(204).end();
});

export default router;
