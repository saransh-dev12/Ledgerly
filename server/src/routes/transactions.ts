import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { requireAuth, type AuthedRequest } from '../middleware/requireAuth.js';
import { toMinor, normalizeCurrency, convertWithRate, toMajorUnits } from '../lib/money.js';
import { getRate } from '../lib/fx.js';

const router = Router();
router.use(requireAuth);

type LinkedTransaction = {
  id: string; amountMinor: bigint; currency: string;
  account: { id: string; name: string; currency: string };
  linksFrom?: { id: string; rate: any; rateDate: string | null; rateSource: string | null; to: LinkedTransaction }[];
  linksTo?: { id: string; rate: any; rateDate: string | null; rateSource: string | null; from: LinkedTransaction }[];
  [key: string]: any;
};

function serializeTransaction(t: LinkedTransaction) {
  const outLink = t.linksFrom?.[0];
  const inLink = t.linksTo?.[0];
  const link: any = outLink || inLink || null;
  let transfer: any = null;
  if (link) {
    const out = outLink ? t : link.from;
    const inn = outLink ? link.to : t;
    const storedRate = link.rate ? Number(link.rate) : null;
    const sentMajor = Math.abs(toMajorUnits(out.amountMinor, out.currency));
    const receivedMajor = Math.abs(toMajorUnits(inn.amountMinor, inn.currency));
    const derivedRate = sentMajor > 0 ? receivedMajor / sentMajor : null;
    transfer = {
      linkId: link.id,
      direction: outLink ? 'out' : 'in',
      rate: storedRate || derivedRate,
      rateDate: link.rateDate || null,
      rateSource: link.rateSource || (storedRate ? 'stored' : 'derived'),
      fromAccount: out.account,
      toAccount: inn.account,
      sentMinor: out.amountMinor.toString(),
      receivedMinor: inn.amountMinor.toString(),
    };
  }
  const { linksFrom: _from, linksTo: _to, ...rest } = t;
  return { ...rest, amountMinor: t.amountMinor.toString(), ...(transfer ? { transfer } : {}) };
}

const TRANSACTION_KINDS = ['all', 'income', 'expense', 'transfer_in', 'transfer_out', 'refund', 'reversal'];

function parseQueryDate(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

router.get('/', async (req: AuthedRequest, res) => {
  const { accountId, from, to, kind } = req.query as any;
  if (kind !== undefined && !TRANSACTION_KINDS.includes(String(kind))) {
    res.status(400).json({ error: 'Unknown transaction type filter.' });
    return;
  }
  const fromDate = from === undefined ? undefined : parseQueryDate(from);
  const toDate = to === undefined ? undefined : parseQueryDate(to);
  if ((from !== undefined && !fromDate) || (to !== undefined && !toDate)) {
    res.status(400).json({ error: 'Use a valid ISO date for from and to.' });
    return;
  }
  if (fromDate && toDate && fromDate > toDate) {
    res.status(400).json({ error: 'The from date must be before the to date.' });
    return;
  }
  const txs = await prisma.transaction.findMany({
    where: { userId: req.userId!, ...(accountId ? { accountId: String(accountId) } : {}), ...(kind && kind !== 'all' ? { kind: String(kind) } : {}),
      ...(fromDate || toDate ? { bookedAt: { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lte: toDate } : {}) } } : {}) },
    orderBy: { bookedAt: 'desc' }, take: 200,
    include: {
      account: { select: { id: true, name: true, currency: true } },
      linksFrom: { include: { to: { include: { account: { select: { id: true, name: true, currency: true } } } } } },
      linksTo: { include: { from: { include: { account: { select: { id: true, name: true, currency: true } } } } } },
    },
  });
  res.json(txs.map(t => serializeTransaction(t as LinkedTransaction)));
});

router.get('/export', async (req: AuthedRequest, res) => {
  const [user, txs] = await Promise.all([
    prisma.user.findUnique({ where: { id: req.userId! }, select: { homeCurrency: true } }),
    prisma.transaction.findMany({ where: { userId: req.userId! }, orderBy: { bookedAt: 'desc' } }),
  ]);
  if (!user) { res.status(404).json({ error: 'Not found' }); return; }
  res.set('Cache-Control', 'no-store');
  res.json({
    homeCurrency: user.homeCurrency,
    transactions: txs.map(t => ({
      ...t,
      amountMinor: t.amountMinor.toString(),
      rateToHome: t.rateToHome === null ? null : Number(t.rateToHome),
    })),
  });
});

router.post('/', async (req: AuthedRequest, res) => {
  const s = z.object({
    accountId: z.string(), kind: z.enum(['income', 'expense']),
    amountMajor: z.number().finite().positive().max(1_000_000_000_000), currency: z.string().optional(),
    note: z.string().max(140).default(''), category: z.string().max(40).default('Other'),
    bookedAt: z.string().optional(),
  }).safeParse(req.body);
  if (!s.success) { res.status(400).json({ error: s.error.issues[0]?.message }); return; }
  const acct = await prisma.account.findFirst({ where: { id: s.data.accountId, userId: req.userId! } });
  if (!acct) { res.status(404).json({ error: 'Account not found' }); return; }
  const requested = s.data.currency ? normalizeCurrency(s.data.currency) : acct.currency;
  if (!requested) { res.status(400).json({ error: 'Unsupported currency code.' }); return; }
  if (requested !== acct.currency) {
    res.status(400).json({ error: `This account holds ${acct.currency}. Record ${requested} activity in a ${requested} account.` });
    return;
  }
  const bookedAt = s.data.bookedAt ? new Date(s.data.bookedAt) : new Date();
  if (!Number.isFinite(bookedAt.getTime())) { res.status(400).json({ error: 'Enter a valid transaction date.' }); return; }
  const cur = acct.currency;
  const signed = s.data.kind === 'income' ? toMinor(s.data.amountMajor, cur) : -toMinor(s.data.amountMajor, cur);
  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  let rateToHome: number | null = null;
  if (cur !== user!.homeCurrency) {
    try { const r = await getRate(cur, user!.homeCurrency); rateToHome = r.rate; } catch {}
  } else rateToHome = 1;
  const tx = await prisma.transaction.create({ data: {
    userId: req.userId!, accountId: acct.id, kind: s.data.kind,
    amountMinor: signed, currency: cur, note: s.data.note, category: s.data.kind === 'income' ? 'Income' : s.data.category,
    bookedAt,
    rateToHome,
  }});
  res.status(201).json({
    ...tx, amountMinor: tx.amountMinor.toString(),
    ...(rateToHome === null && cur !== user!.homeCurrency ? { fxWarning: `No ${cur}/${user!.homeCurrency} rate is available yet; home-currency totals will exclude this entry until a rate is observed.` } : {}),
  });
});

router.post('/transfer', async (req: AuthedRequest, res) => {
  const s = z.object({ fromAccountId: z.string(), toAccountId: z.string(), amountMajor: z.number().finite().positive().max(1_000_000_000_000), note: z.string().max(140).default('') }).safeParse(req.body);
  if (!s.success) { res.status(400).json({ error: s.error.issues[0]?.message }); return; }
  const [from, to] = await Promise.all([
    prisma.account.findFirst({ where: { id: s.data.fromAccountId, userId: req.userId! } }),
    prisma.account.findFirst({ where: { id: s.data.toAccountId, userId: req.userId! } }),
  ]);
  if (!from || !to) { res.status(404).json({ error: 'Account not found' }); return; }
  if (from.id === to.id) { res.status(400).json({ error: 'Choose two different accounts' }); return; }
  let rate = 1;
  let rateDate = new Date().toISOString().slice(0, 10);
  let rateSource = 'identity';
  if (from.currency !== to.currency) {
    try {
      const quote = await getRate(from.currency, to.currency);
      rate = quote.rate; rateDate = quote.date; rateSource = quote.source;
    } catch { res.status(502).json({ error: 'FX unavailable' }); return; }
  }
  const outMinor = -toMinor(s.data.amountMajor, from.currency);
  // Exact per-currency path: major → rate → dest minor (no assumed ×100).
  const inMinor = convertWithRate(-outMinor, rate, from.currency, to.currency);
  const result = await prisma.$transaction(async (db) => {
    const out = await db.transaction.create({ data: { userId: req.userId!, accountId: from.id, kind: 'transfer_out', amountMinor: outMinor, currency: from.currency, note: s.data.note || `Transfer to ${to.name}`, category: 'Transfer' } });
    const inn = await db.transaction.create({ data: { userId: req.userId!, accountId: to.id, kind: 'transfer_in', amountMinor: inMinor, currency: to.currency, note: s.data.note || `Transfer from ${from.name}`, category: 'Transfer' } });
    await db.transactionLink.create({ data: { fromId: out.id, toId: inn.id, linkType: 'transfer', rate, rateDate, rateSource } });
    return { out, inn };
  });
  res.status(201).json({ out: { ...result.out, amountMinor: result.out.amountMinor.toString() }, in: { ...result.inn, amountMinor: result.inn.amountMinor.toString() }, rate, rateDate, rateSource });
});

router.patch('/:id', async (req: AuthedRequest, res) => {
  const s = z.object({
    amountMajor: z.number().finite().positive().max(1_000_000_000_000).optional(),
    note: z.string().max(140).optional(),
    category: z.string().trim().min(1).max(40).optional(),
    bookedAt: z.string().optional(),
    accountId: z.string().optional(),
    kind: z.enum(['income', 'expense']).optional(),
  }).safeParse(req.body);
  if (!s.success) { res.status(400).json({ error: s.error.issues[0]?.message }); return; }
  const tx = await prisma.transaction.findFirst({
    where: { id: req.params.id, userId: req.userId! },
    include: { linksFrom: true, linksTo: true },
  });
  if (!tx) { res.status(404).json({ error: 'Not found' }); return; }
  if (tx.kind !== 'income' && tx.kind !== 'expense') {
    res.status(400).json({ error: 'Transfer legs cannot be edited. Reverse the transfer and record a new one.' });
    return;
  }
  if (tx.linksFrom.length || tx.linksTo.length) {
    res.status(400).json({ error: 'Linked transactions cannot be edited.' });
    return;
  }
  let accountId = tx.accountId;
  if (s.data.accountId && s.data.accountId !== tx.accountId) {
    const target = await prisma.account.findFirst({ where: { id: s.data.accountId, userId: req.userId! } });
    if (!target) { res.status(404).json({ error: 'Account not found' }); return; }
    if (target.currency !== tx.currency) {
      res.status(400).json({ error: `This entry is in ${tx.currency}; choose a ${tx.currency} account.` });
      return;
    }
    accountId = target.id;
  }
  const bookedAt = s.data.bookedAt ? new Date(s.data.bookedAt) : undefined;
  if (bookedAt && !Number.isFinite(bookedAt.getTime())) { res.status(400).json({ error: 'Enter a valid transaction date.' }); return; }
  const kind = s.data.kind || tx.kind;
  const amountMinor = s.data.amountMajor !== undefined ? toMinor(s.data.amountMajor, tx.currency) : undefined;
  const signed = amountMinor === undefined ? undefined : (kind === 'income' ? amountMinor : -amountMinor);
  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  let rateToHome = tx.rateToHome ? Number(tx.rateToHome) : null;
  if (rateToHome === null) {
    if (tx.currency === user!.homeCurrency) rateToHome = 1;
    else { try { rateToHome = (await getRate(tx.currency, user!.homeCurrency)).rate; } catch {} }
  }
  const updated = await prisma.transaction.update({
    where: { id: tx.id },
    data: {
      accountId,
      ...(signed !== undefined ? { amountMinor: signed } : {}),
      ...(s.data.kind ? { kind } : {}),
      ...(s.data.note !== undefined ? { note: s.data.note } : {}),
      ...(s.data.category !== undefined || s.data.kind ? { category: kind === 'income' ? 'Income' : (s.data.category || (tx.category === 'Income' ? 'Other' : tx.category)) } : {}),
      ...(bookedAt ? { bookedAt } : {}),
      rateToHome,
    },
  });
  res.json({ ...updated, amountMinor: updated.amountMinor.toString() });
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
