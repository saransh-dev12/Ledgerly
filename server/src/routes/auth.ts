import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { createResetToken, hashPassword, hashResetToken, verifyPassword, signToken } from '../lib/auth.js';
import { sendPasswordResetEmail } from '../lib/email.js';
import { appBaseUrl } from '../config.js';
import { requireAuth, type AuthedRequest } from '../middleware/requireAuth.js';
import rateLimit from 'express-rate-limit';
import { normalizeCurrency } from '../lib/money.js';

const router = Router();
const signupSchema = z.object({ email: z.string().trim().email().max(254), password: z.string().min(8).max(128), displayName: z.string().trim().max(60).optional(), homeCurrency: z.string().optional() });
const loginSchema = z.object({ email: z.string().trim().email().max(254), password: z.string().min(1).max(128) });
const passwordSchema = z.string().min(8).max(128);
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
const RESET_ACK = 'If that email is registered, a reset link is on its way.';

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
const forgotLimiter = rateLimit({
  windowMs: 15 * 60_000, max: 10, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => `forgot:${req.ip}`,
  message: { error: 'Too many reset requests. Try again in 15 minutes.' },
});
const resetLimiter = rateLimit({
  windowMs: 15 * 60_000, max: 10, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => `reset:${req.ip}`,
  message: { error: 'Too many reset attempts. Try again in 15 minutes.' },
});
const changePasswordLimiter = rateLimit({
  windowMs: 60 * 60_000, max: 10, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => `change-password:${(req as AuthedRequest).userId || req.ip}`,
  message: { error: 'Too many password changes. Try again later.' },
});

router.post('/signup', signupLimiter, async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return; }
  try {
  const email = parsed.data.email.toLowerCase();
  const { password, displayName } = parsed.data;
  const homeCurrency = normalizeCurrency(parsed.data.homeCurrency || 'INR');
  if (!homeCurrency) { res.status(400).json({ error: 'Unsupported home currency.' }); return; }
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) { res.status(409).json({ error: 'Email already registered' }); return; }
  const user = await prisma.user.create({
    data: {
      email, passwordHash: await hashPassword(password),
      displayName: displayName || 'My workspace',
      homeCurrency,
      categories: { create: [
        { name: 'Food & dining', kind: 'expense' }, { name: 'Housing', kind: 'expense' },
        { name: 'Transport', kind: 'expense' }, { name: 'Shopping', kind: 'expense' },
        { name: 'Health', kind: 'expense' }, { name: 'Other', kind: 'expense' },
        { name: 'Income', kind: 'income' },
      ]},
      accounts: { create: [{ name: 'Cash', currency: homeCurrency, openingMinor: 0 }] },
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
  const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    res.status(401).json({ error: 'Invalid email or password' }); return;
  }
  const token = signToken(user.id, user.tokenVersion);
  res.json({ token, user: { id: user.id, email: user.email, displayName: user.displayName, homeCurrency: user.homeCurrency } });
  } catch (e) { console.error('login failed', e); res.status(503).json({ error: 'Database unavailable. Start Postgres and retry.' }); }
});

router.post('/forgot-password', forgotLimiter, async (req, res) => {
  const parsed = z.object({ email: z.string().trim().email().max(254) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Enter a valid email address.' }); return; }
  const email = parsed.data.email.toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) { res.status(202).json({ ok: true, message: RESET_ACK }); return; }

  const token = createResetToken();
  const now = new Date();
  await prisma.$transaction(async db => {
    await db.passwordResetToken.deleteMany({ where: { userId: user.id } });
    await db.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashResetToken(token),
        expiresAt: new Date(now.getTime() + RESET_TOKEN_TTL_MS),
      },
    });
  });

  const resetUrl = new URL(appBaseUrl());
  resetUrl.searchParams.set('reset', token);
  res.status(202).json({ ok: true, message: RESET_ACK });
  void sendPasswordResetEmail(email, resetUrl.toString()).catch(error => {
    console.error('password reset email failed', error instanceof Error ? error.message : error);
  });
});

router.post('/reset-password', resetLimiter, async (req, res) => {
  const parsed = z.object({ token: z.string().trim().min(20).max(200), password: passwordSchema }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Enter a new password of at least 8 characters.' });
    return;
  }
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashResetToken(parsed.data.token) } });
  if (!record || record.usedAt || record.expiresAt <= new Date()) {
    res.status(400).json({ error: 'This reset link is invalid or has expired. Request a new one.' });
    return;
  }
  const passwordHash = await hashPassword(parsed.data.password);
  const updated = await prisma.$transaction(async db => {
    const claimed = await db.passwordResetToken.updateMany({
      where: { id: record.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (claimed.count !== 1) return false;
    const user = await db.user.update({
      where: { id: record.userId },
      data: { passwordHash, tokenVersion: { increment: 1 } },
    });
    await db.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    return true;
  });
  if (!updated) {
    res.status(400).json({ error: 'This reset link is invalid or has expired. Request a new one.' });
    return;
  }
  res.json({ ok: true });
});

router.get('/me', requireAuth, async (req: AuthedRequest, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) { res.status(404).json({ error: 'Not found' }); return; }
  res.json({ id: user.id, email: user.email, displayName: user.displayName, homeCurrency: user.homeCurrency, locale: user.locale });
});

router.patch('/me', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = z.object({
    displayName: z.string().trim().min(1).max(60).optional(),
    homeCurrency: z.string().optional(),
    locale: z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/).optional(),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return; }
  const homeCurrency = parsed.data.homeCurrency ? normalizeCurrency(parsed.data.homeCurrency) : undefined;
  if (parsed.data.homeCurrency && !homeCurrency) { res.status(400).json({ error: 'Unsupported home currency.' }); return; }
  const data: any = { ...parsed.data };
  if (homeCurrency) data.homeCurrency = homeCurrency;
  const [user] = await prisma.$transaction(async db => {
    const updated = await db.user.update({ where: { id: req.userId! }, data });
    if (homeCurrency) {
      // Rate snapshots are relative to the old home currency. Keep original
      // transaction amounts, but let reporting revalue them with current rates.
      await db.transaction.updateMany({ where: { userId: updated.id }, data: { rateToHome: null } });
    }
    return [updated];
  });
  res.json({ id: user.id, email: user.email, displayName: user.displayName, homeCurrency: user.homeCurrency, locale: user.locale });
});

router.post('/change-password', requireAuth, changePasswordLimiter, async (req: AuthedRequest, res) => {
  const parsed = z.object({ currentPassword: z.string().min(1).max(128), newPassword: passwordSchema }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Enter your current password and a new password of at least 8 characters.' });
    return;
  }
  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user || !(await verifyPassword(parsed.data.currentPassword, user.passwordHash))) {
    res.status(401).json({ error: 'Current password is incorrect.' });
    return;
  }
  if (await verifyPassword(parsed.data.newPassword, user.passwordHash)) {
    res.status(400).json({ error: 'Choose a password you have not used here.' });
    return;
  }
  const nextPasswordHash = await hashPassword(parsed.data.newPassword);
  const updated = await prisma.$transaction(async db => {
    const next = await db.user.update({
      where: { id: user.id },
      data: { passwordHash: nextPasswordHash, tokenVersion: { increment: 1 } },
    });
    await db.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } });
    return next;
  });
  res.json({ ok: true, token: signToken(updated.id, updated.tokenVersion) });
});

router.post('/logout', requireAuth, async (req: AuthedRequest, res) => {
  await prisma.user.update({ where: { id: req.userId! }, data: { tokenVersion: { increment: 1 } } });
  res.json({ ok: true });
});

router.delete('/account', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = z.object({ password: z.string().min(1).max(128), confirm: z.literal('DELETE') }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Confirm with your password and the word DELETE.' }); return; }
  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    res.status(401).json({ error: 'Password is incorrect.' }); return;
  }
  await prisma.user.delete({ where: { id: user.id } });
  res.json({ ok: true });
});

export default router;
