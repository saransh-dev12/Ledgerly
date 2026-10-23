// Ported from index.html BigInt math — preserves existing quote/converter guarantees.
// Fixed fees in destination currency, % fee on provider amount, tax on fees.
export function normalizeCurrency(input: unknown): string | null {
  const code = String(input ?? '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) return null;
  try {
    // Intl validates the ISO 4217 code (Node ships with full ICU).
    new Intl.NumberFormat('en-US', { style: 'currency', currency: code }).format(0);
    return code;
  } catch {
    return null;
  }
}

export function minorScale(currency: string): number {
  const zero: Record<string, number> = { JPY: 1, KRW: 1, VND: 1, CLP: 1 };
  const three: Record<string, number> = { BHD: 1000, JOD: 1000, KWD: 1000, OMD: 1000, TND: 1000 };
  if (zero[currency]) return zero[currency];
  if (three[currency]) return three[currency];
  return 100;
}
export function toMinor(amount: string | number, currency: string): bigint {
  const scale = minorScale(currency);
  const digits = Math.round(Math.log10(scale));
  const n = Number(amount);
  if (!Number.isFinite(n)) return 0n;
  return BigInt(Math.round(n * scale));
}
export function fromMinor(minor: bigint, currency: string): number {
  return Number(minor) / minorScale(currency);
}
export function toMajorUnits(minor: bigint | number | string, currency: string): number {
  return Number(minor) / minorScale(currency);
}
export function convertWithRate(amountMinor: bigint, rate: number, fromCur: string, toCur: string): bigint {
  const fromScale = minorScale(fromCur);
  const toDigits = Math.round(Math.log10(minorScale(toCur)));
  // amountMajor * rate = destMajor -> destMinor
  const major = Number(amountMinor) / fromScale;
  return BigInt(Math.round(major * rate * minorScale(toCur)));
}
export function quoteBreakdown(opts: {
  amountMajor: number; refRate: number; providerRate: number;
  fromCur: string; toCur: string; fixedFeeMajor: number; pctFee: number; taxPct: number;
}) {
  const { amountMajor, refRate, providerRate, fromCur, toCur, fixedFeeMajor, pctFee, taxPct } = opts;
  const refMinor = convertWithRate(toMinor(amountMajor, fromCur), refRate, fromCur, toCur);
  const grossMinor = convertWithRate(toMinor(amountMajor, fromCur), providerRate, fromCur, toCur);
  const fixedMinor = toMinor(fixedFeeMajor, toCur);
  const pctMinor = BigInt(Math.round(Number(grossMinor) * (pctFee / 100)));
  const taxable = fixedMinor + pctMinor;
  const taxMinor = BigInt(Math.round(Number(taxable) * (taxPct / 100)));
  const netMinor = grossMinor - fixedMinor - pctMinor - taxMinor;
  return {
    refMinor: refMinor.toString(), grossMinor: grossMinor.toString(),
    fixedMinor: fixedMinor.toString(), pctMinor: pctMinor.toString(),
    taxMinor: taxMinor.toString(), netMinor: netMinor.toString(),
    diffMinor: (netMinor - refMinor).toString(),
    refMajor: fromMinor(refMinor, toCur), netMajor: fromMinor(netMinor, toCur),
  };
}
