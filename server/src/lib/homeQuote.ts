import { prisma } from './db.js';
import { getRate } from './fx.js';

export type HomeQuote = { rate: number; date: string; stale: boolean; source: string };
export type QuoteCache = Map<string, Promise<HomeQuote | null>>;

function daysOld(date: string) {
  const time = new Date(`${date}T00:00:00Z`).getTime();
  return Number.isFinite(time) ? (Date.now() - time) / 86_400_000 : Infinity;
}

// Resolve one currency into the reporting currency. Missing data returns null;
// callers must surface that state instead of assuming a 1:1 rate.
export async function homeQuote(currency: string, home: string, cache: QuoteCache): Promise<HomeQuote | null> {
  if (currency === home) {
    return { rate: 1, date: new Date().toISOString().slice(0, 10), stale: false, source: 'identity' };
  }
  const key = `${currency}/${home}`;
  const existing = cache.get(key);
  if (existing) return existing;
  const pending = (async (): Promise<HomeQuote | null> => {
    try {
      return await getRate(currency, home);
    } catch {
      const cached = await prisma.exchangeRate.findFirst({
        where: { base: currency, quote: home }, orderBy: { date: 'desc' },
      }).catch(() => null);
      if (!cached) return null;
      return { rate: Number(cached.rate), date: cached.date, stale: daysOld(cached.date) > 3, source: 'cache' };
    }
  })();
  cache.set(key, pending);
  return pending;
}

export async function homeRate(currency: string, home: string, cache: QuoteCache): Promise<number | null> {
  const quote = await homeQuote(currency, home, cache);
  return quote ? quote.rate : null;
}
