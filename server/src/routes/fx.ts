import { Router } from 'express';
import { z } from 'zod';
import { getRate, getHistory, isStale, getCurrencies } from '../lib/fx.js';
import { normalizeCurrency, quoteBreakdown } from '../lib/money.js';
import { prisma } from '../lib/db.js';
import { requireAuth, type AuthedRequest } from '../middleware/requireAuth.js';

const router = Router();

router.get('/rate', async (req, res) => {
  const { base, quote, date } = req.query as any;
  const b = normalizeCurrency(base);
  const q = normalizeCurrency(quote);
  if (!b || !q) { res.status(400).json({ error: 'Use supported three-letter currency codes.' }); return; }
  if (date !== undefined && date !== 'latest' && !/^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
    res.status(400).json({ error: 'date must be YYYY-MM-DD.' }); return;
  }
  try {
    const r = await getRate(b, q, date ? String(date) : 'latest');
    res.json({ base: b, quote: q, ...r });
  } catch {
    // Serve dated cache if available
    const cached = await prisma.exchangeRate.findFirst({ where: { base: b, quote: q }, orderBy: { date: 'desc' } }).catch(() => null);
    if (cached) { res.json({ base: cached.base, quote: cached.quote, rate: Number(cached.rate), date: cached.date, stale: true, source: cached.source, warning: 'Live rate unavailable — showing dated cached observation.' }); return; }
    res.status(502).json({ error: 'Rate unavailable' });
  }
});

router.get('/history', async (req, res) => {
  const { base, quote, days } = req.query as any;
  const b = normalizeCurrency(base);
  const q = normalizeCurrency(quote);
  if (!b || !q) { res.status(400).json({ error: 'Use supported three-letter currency codes.' }); return; }
  const requestedDays = days === undefined ? 30 : Number(days);
  if (!Number.isInteger(requestedDays) || requestedDays < 1 || requestedDays > 365) {
    res.status(400).json({ error: 'days must be a whole number from 1 to 365.' }); return;
  }
  try {
    res.json(await getHistory(b, q, requestedDays));
  } catch { res.status(502).json({ error: 'History unavailable' }); }
});

router.get('/currencies', async (_req, res) => {
  try { res.json(await getCurrencies()); }
  catch (e: any) { res.status(502).json({ error: 'Directory unavailable', detail: e?.message }); }
});

router.post('/quote', async (req, res) => {
  const s = z.object({
    amountMajor: z.number().finite().positive(), refRate: z.number().finite().positive(), providerRate: z.number().finite().positive(),
    fromCur: z.string().length(3), toCur: z.string().length(3),
    fixedFeeMajor: z.number().finite().min(0).default(0), pctFee: z.number().finite().min(0).max(100).default(0), taxPct: z.number().finite().min(0).max(100).default(0),
  }).safeParse(req.body);
  if (!s.success) { res.status(400).json({ error: s.error.issues[0]?.message }); return; }
  const fromCur = normalizeCurrency(s.data.fromCur);
  const toCur = normalizeCurrency(s.data.toCur);
  if (!fromCur || !toCur) { res.status(400).json({ error: 'Unsupported currency code.' }); return; }
  res.json({ ...quoteBreakdown({ ...s.data, fromCur, toCur }), assumptions: 'Fixed fees in destination currency; % fee on provider amount; tax on fees. Rounded per currency. Not a provider guarantee.' });
});

router.get('/pulse', requireAuth, async (req: AuthedRequest, res) => {
  // Global Currency Pulse: top movers from cache + portfolio summary placeholder
  const rates = await prisma.exchangeRate.findMany({ orderBy: { createdAt: 'desc' }, take: 20 }).catch(() => []);
  res.json({ movers: rates.map(r => ({ pair: `${r.base}/${r.quote}`, rate: Number(r.rate), date: r.date, stale: isStale(r.date) })), note: 'Reference rates only — not provider quotes.' });
});

export default router;
