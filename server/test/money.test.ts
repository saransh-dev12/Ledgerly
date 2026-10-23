import { describe, expect, it } from 'vitest';
import { convertWithRate, fromMinor, minorScale, normalizeCurrency, quoteBreakdown, toMajorUnits, toMinor } from '../src/lib/money';

describe('minor units', () => {
  it('uses 1:1 for zero-decimal currencies', () => {
    expect(minorScale('JPY')).toBe(1);
    expect(minorScale('KRW')).toBe(1);
    expect(toMinor('1234', 'JPY')).toBe(1234n);
    expect(toMinor(1234.6, 'JPY')).toBe(1235n);
    expect(fromMinor(1234n, 'JPY')).toBe(1234);
    expect(toMajorUnits('1234', 'JPY')).toBe(1234);
  });

  it('uses 1000 for three-decimal currencies', () => {
    expect(minorScale('KWD')).toBe(1000);
    expect(minorScale('BHD')).toBe(1000);
    expect(toMinor('1.234', 'KWD')).toBe(1234n);
    expect(toMinor(100.5, 'KWD')).toBe(100500n);
    expect(fromMinor(100500n, 'KWD')).toBe(100.5);
    expect(toMajorUnits('1234', 'KWD')).toBe(1.234);
  });

  it('defaults to 2 decimals', () => {
    expect(minorScale('USD')).toBe(100);
    expect(toMinor('10.005', 'USD')).toBe(1001n);
    expect(toMajorUnits(1001, 'USD')).toBe(10.01);
  });
});

describe('currency validation', () => {
  it('normalizes supported ISO codes and rejects malformed input', () => {
    expect(normalizeCurrency(' inr ')).toBe('INR');
    expect(normalizeCurrency('kwd')).toBe('KWD');
    expect(normalizeCurrency('US')).toBeNull();
    expect(normalizeCurrency('123')).toBeNull();
    expect(normalizeCurrency(undefined)).toBeNull();
  });
});

describe('conversion across scales', () => {
  it('converts JPY to KWD without assuming 100 minor units', () => {
    expect(convertWithRate(100000n, 0.00205, 'JPY', 'KWD')).toBe(205000n);
  });

  it('converts KWD to JPY', () => {
    expect(convertWithRate(205000n, 487.8, 'KWD', 'JPY')).toBe(99999n);
  });

  it('round-trips with a 1:1 rate', () => {
    expect(convertWithRate(1234n, 1, 'KWD', 'KWD')).toBe(1234n);
    expect(convertWithRate(1234n, 1, 'JPY', 'JPY')).toBe(1234n);
  });
});

describe('quote breakdown', () => {
  it('keeps whole yen when there are no fees', () => {
    const q = quoteBreakdown({ amountMajor: 100000, refRate: 1, providerRate: 1, fromCur: 'JPY', toCur: 'JPY', fixedFeeMajor: 0, pctFee: 0, taxPct: 0 });
    expect(q.refMinor).toBe('100000');
    expect(q.grossMinor).toBe('100000');
    expect(q.netMinor).toBe('100000');
    expect(q.netMajor).toBe(100000);
  });

  it('applies fixed, percentage and tax fees in three-decimal KWD', () => {
    const q = quoteBreakdown({ amountMajor: 100, refRate: 1, providerRate: 1, fromCur: 'KWD', toCur: 'KWD', fixedFeeMajor: 0.5, pctFee: 1, taxPct: 15 });
    expect(q.grossMinor).toBe('100000');
    expect(q.fixedMinor).toBe('500');
    expect(q.pctMinor).toBe('1000');
    expect(q.taxMinor).toBe('225');
    expect(q.netMinor).toBe('98275');
    expect(q.netMajor).toBe(98.275);
  });
});
