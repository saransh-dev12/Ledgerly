import { prisma } from './db.js';

const BASE = (process.env.FRANKFURTER_BASE_URL || 'https://api.frankfurter.dev/v2').replace(/\/$/, '');
const FALLBACK_BASE = (process.env.FX_FALLBACK_BASE_URL || 'https://open.er-api.com/v6/latest').replace(/\/$/, '');

export function isStale(dateISO: string): boolean {
  const t = new Date(dateISO + 'T00:00:00Z').getTime();
  if (!Number.isFinite(t)) return true;
  return (Date.now() - t) / 86400000 > 4;
}

// Wide-coverage fallback (160+ currencies, no API key) for pairs the ECB feed does not publish.
async function getFallbackRate(base: string, quote: string): Promise<{ rate: number; date: string } | null> {
  try {
    const res = await fetch(`${FALLBACK_BASE}/${base}`);
    if (!res.ok) return null;
    const json: any = await res.json();
    const rate = Number(json?.rates?.[quote]);
    if (!Number.isFinite(rate) || rate <= 0) return null;
    const stamp = String(json?.time_last_update_utc || json?.time_last_update_unix || '');
    const parsed = stamp ? new Date(stamp) : new Date();
    const date = Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
    return { rate, date };
  } catch { return null; }
}

// Matches the live frontend: GET {BASE}/rate/{from}/{to} -> { base, quote, rate, date }
export async function getRate(base: string, quote: string, date = 'latest'): Promise<{ rate: number; date: string; stale: boolean; source: string }> {
  const B = base.toUpperCase(), Q = quote.toUpperCase();
  if (B === Q) return { rate: 1, date: new Date().toISOString().slice(0, 10), stale: false, source: 'identity' };
  if (date !== 'latest') {
    const cached = await prisma.exchangeRate.findUnique({
      where: { base_quote_date: { base: B, quote: Q, date } }
    }).catch(() => null);
    if (cached) return { rate: Number(cached.rate), date: cached.date, stale: isStale(cached.date), source: cached.source };
  }
  try {
    const res = await fetch(`${BASE}/rate/${B.toLowerCase()}/${Q.toLowerCase()}`);
    if (!res.ok) {
      if (res.status === 422) throw new Error(`No reference rate for ${B}/${Q}.`);
      throw new Error(`FX upstream ${res.status}`);
    }
    const record: any = await res.json();
    const rate = Number(record.rate);
    const obsDate: string = record.date;
    if (!Number.isFinite(rate) || rate <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(obsDate || '')) {
      throw new Error('Invalid quote from provider.');
    }
    await prisma.exchangeRate.upsert({
      where: { base_quote_date: { base: B, quote: Q, date: obsDate } },
      create: { base: B, quote: Q, date: obsDate, rate, source: 'frankfurter' },
      update: { rate }
    }).catch(() => {});
    return { rate, date: obsDate, stale: isStale(obsDate), source: 'frankfurter' };
  } catch (primaryError) {
    const fallback = await getFallbackRate(B, Q);
    if (!fallback) throw primaryError;
    await prisma.exchangeRate.upsert({
      where: { base_quote_date: { base: B, quote: Q, date: fallback.date } },
      create: { base: B, quote: Q, date: fallback.date, rate: fallback.rate, source: 'wide-coverage' },
      update: { rate: fallback.rate }
    }).catch(() => {});
    return { rate: fallback.rate, date: fallback.date, stale: isStale(fallback.date), source: 'wide-coverage' };
  }
}

export async function getHistory(base: string, quote: string, days = 30) {
  const B = base.toUpperCase(), Q = quote.toUpperCase();
  const end = new Date();
  const start = new Date(Date.now() - Math.min(days, 365) * 86400000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const res = await fetch(`${BASE}/rates?base=${B}&quotes=${Q}&from=${fmt(start)}&to=${fmt(end)}`);
  if (!res.ok) throw new Error(`FX history ${res.status}`);
  const payload: any = await res.json();
  if (payload && !Array.isArray(payload) && payload.rates) return payload;
  if (!Array.isArray(payload)) throw new Error('Unexpected history payload.');
  const rates: Record<string, number> = {};
  payload.forEach((row: any) => {
    const rate = Number(row?.rate);
    if (row?.date && Number.isFinite(rate)) rates[row.date] = rate;
  });
  return { base: B, quote: Q, rates };
}

export async function getCurrencies() {
  const res = await fetch(`${BASE}/currencies`);
  if (!res.ok) throw new Error(`FX directory ${res.status}`);
  return res.json();
}
