import { Router } from 'express';
import { z } from 'zod';
import { getRate, getHistory, isStale, getCurrencies } from '../lib/fx.js';
import { quoteBreakdown } from '../lib/money.js';
import { prisma } from '../lib/db.js';
import { requireAuth, type AuthedRequest } from '../middleware/requireAuth.js';

const router = Router();

router.get('/rate', async (req, res) => {
  const { base, quote, date } = req.query as any;
  if (!base || !quote) { res.status(400).json({ error: 'base and quote required' }); return; }
  try {
    const r = await getRate(String(base).toUpperCase(), String(quote).toUpperCase(), date ? String(date) : 'latest');
    res.json({ base: String(base).toUpperCase(), quote: String(quote).toUpperCase(), ...r });
  } catch (e: any) {
    // Serve dated cache if available
    const cached = await prisma.exchangeRate.findFirst({ where: { base: String(base).toUpperCase(), quote: String(quote).toUpperCase() }, orderBy: { date: 'desc' } }).catch(() => null);
    if (cached) { res.json({ base: cached.base, quote: cached.quote, rate: Number(cached.rate), date: cached.date, stale: true, source: cached.source, warning: 'Live rate unavailable — showing dated cached observation.' }); return; }
    res.status(502).json({ error: 'Rate unavailable', detail: e?.message });
  }
});

router.get('/history', async (req, res) => {
  const { base, quote, days } = req.query as any;
  if (!base || !quote) { res.status(400).json({ error: 'base and quote required' }); return; }
  try {
    res.json(await getHistory(String(base).toUpperCase(), String(quote).toUpperCase(), Math.min(Number(days) || 30, 365)));
  } catch (e: any) { res.status(502).json({ error: 'History unavailable', detail: e?.message }); }
});

router.get('/currencies', async (_req, res) => {
  try { res.json(await getCurrencies()); }
  catch (e: any) { res.status(502).json({ error: 'Directory unavailable', detail: e?.message }); }
});

router.post('/quote', async (req, res) => {
  const s = z.object({
    amountMajor: z.number().positive(), refRate: z.number().positive(), providerRate: z.number().positive(),
    fromCur: z.string().length(3), toCur: z.string().length(3),
    fixedFeeMajor: z.number().min(0).default(0), pctFee: z.number().min(0).max(100).default(0), taxPct: z.number().min(0).max(100).default(0),
  }).safeParse(req.body);
  if (!s.success) { res.status(400).json({ error: s.error.issues[0]?.message }); return; }
  const d = s.data;
  res.json({ ...quoteBreakdown({ ...d, fromCur: d.fromCur.toUpperCase(), toCur: d.toCur.toUpperCase() }), assumptions: 'Fixed fees in destination currency; % fee on provider amount; tax on fees. Rounded per currency. Not a provider guarantee.' });
});

router.get('/pulse', requireAuth, async (req: AuthedRequest, res) => {
  // Global Currency Pulse: top movers from cache + portfolio summary placeholder
  const rates = await prisma.exchangeRate.findMany({ orderBy: { createdAt: 'desc' }, take: 20 }).catch(() => []);
  res.json({ movers: rates.map(r => ({ pair: `${r.base}/${r.quote}`, rate: Number(r.rate), date: r.date, stale: isStale(r.date) })), note: 'Reference rates only — not provider quotes.' });
});

export default router;
