import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { requireAuth, type AuthedRequest } from '../middleware/requireAuth.js';
import { toMinor } from '../lib/money.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req: AuthedRequest, res) => {
  const accounts = await prisma.account.findMany({ where: { userId: req.userId! }, orderBy: { createdAt: 'asc' } });
  res.json(accounts.map(a => ({ ...a, openingMinor: a.openingMinor.toString() })));
});
router.post('/', async (req: AuthedRequest, res) => {
  const s = z.object({ name: z.string().min(1).max(60), currency: z.string().length(3), type: z.string().default('cash'), openingMajor: z.number().default(0) }).safeParse(req.body);
  if (!s.success) { res.status(400).json({ error: s.error.issues[0]?.message }); return; }
  const a = await prisma.account.create({ data: { userId: req.userId!, name: s.data.name, currency: s.data.currency.toUpperCase(), type: s.data.type, openingMinor: toMinor(s.data.openingMajor, s.data.currency.toUpperCase()) } });
  res.status(201).json({ ...a, openingMinor: a.openingMinor.toString() });
});
export default router;
