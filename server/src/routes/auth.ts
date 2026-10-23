import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { hashPassword, verifyPassword, signToken } from '../lib/auth.js';
import { requireAuth, type AuthedRequest } from '../middleware/requireAuth.js';
import rateLimit from 'express-rate-limit';

const router = Router();
const signupSchema = z.object({ email: z.string().email(), password: z.string().min(8), displayName: z.string().max(60).optional(), homeCurrency: z.string().length(3).optional() });
const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

const signupLimiter = rateLimit({
  windowMs: 60_000, max: 5, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => `signup:${req.ip}`,
  message: { error: 'Too many sign-up attempts. Try again in a minute.' },
});
const loginLimiter = rateLimit({
  windowMs: 60_000, max: 10, standardHeaders: true, legacyHeaders: false, skipSuccessfulRequests: true,
  keyGenerator: (req) => `login:${req.ip}:${String((req.body as any)?.email || '').toLowerCase()}`,
  message: { error: 'Too many sign-in attempts. Try again in a minute.' },
});

router.post('/signup', signupLimiter, async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return; }
  try {
  const { email, password, displayName, homeCurrency } = parsed.data;
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) { res.status(409).json({ error: 'Email already registered' }); return; }
  const user = await prisma.user.create({
    data: {
      email, passwordHash: await hashPassword(password),
      displayName: displayName || 'My workspace',
      homeCurrency: (homeCurrency || 'INR').toUpperCase(),
      categories: { create: [
        { name: 'Food & dining', kind: 'expense' }, { name: 'Housing', kind: 'expense' },
        { name: 'Transport', kind: 'expense' }, { name: 'Shopping', kind: 'expense' },
        { name: 'Health', kind: 'expense' }, { name: 'Other', kind: 'expense' },
        { name: 'Income', kind: 'income' },
      ]},
      accounts: { create: [{ name: 'Cash', currency: (homeCurrency || 'INR').toUpperCase(), openingMinor: 70660 * 100 }] },
    }, include: { accounts: true },
  });
  const token = signToken(user.id, user.tokenVersion);
  res.json({ token, user: { id: user.id, email: user.email, displayName: user.displayName, homeCurrency: user.homeCurrency } });
  } catch (e) { console.error('signup failed', e); res.status(503).json({ error: 'Database unavailable. Start Postgres and retry.' }); }
});

router.post('/login', loginLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid credentials' }); return; }
  try {
  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    res.status(401).json({ error: 'Invalid email or password' }); return;
  }
  const token = signToken(user.id, user.tokenVersion);
  res.json({ token, user: { id: user.id, email: user.email, displayName: user.displayName, homeCurrency: user.homeCurrency } });
  } catch (e) { console.error('login failed', e); res.status(503).json({ error: 'Database unavailable. Start Postgres and retry.' }); }
});

router.get('/me', requireAuth, async (req: AuthedRequest, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) { res.status(404).json({ error: 'Not found' }); return; }
  res.json({ id: user.id, email: user.email, displayName: user.displayName, homeCurrency: user.homeCurrency, locale: user.locale });
});

router.post('/logout', requireAuth, async (req: AuthedRequest, res) => {
  await prisma.user.update({ where: { id: req.userId! }, data: { tokenVersion: { increment: 1 } } });
  res.json({ ok: true });
});

router.delete('/account', requireAuth, async (req: AuthedRequest, res) => {
  await prisma.user.delete({ where: { id: req.userId! } });
  res.json({ ok: true });
});

export default router;
