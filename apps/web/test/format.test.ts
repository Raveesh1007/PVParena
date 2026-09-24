import { describe, expect, it } from 'vitest';

import { formatBps, strikeFor, truncateDecimal } from '../src/lib/format';

describe('truncateDecimal', () => {
  it('cuts an upstream price to quote decimals without rounding up', () => {
    expect(truncateDecimal('1328.9206662065212', 6)).toBe('1328.920666');
    expect(truncateDecimal('1024.2286839999', 6)).toBe('1024.228683');
    expect(truncateDecimal('150', 6)).toBe('150');
    expect(truncateDecimal('2.500000', 6)).toBe('2.5');
  });

  it('rejects anything that is not a plain decimal', () => {
    expect(truncateDecimal('1e-7', 6)).toBeNull();
    expect(truncateDecimal('-3', 6)).toBeNull();
    expect(truncateDecimal('', 6)).toBeNull();
  });
});

describe('strikeFor', () => {
  it('prices a 9-decimal stake in 6-decimal quote units', () => {
    expect(strikeFor(1_000_000_000n, 9, 1_328_920_666n)).toBe(1_328_920_666n);
    expect(strikeFor(50_000_000n, 9, 1_328_920_666n)).toBe(66_446_033n);
  });

  it('floors to whole quote base units', () => {
    expect(strikeFor(1n, 9, 1_000_000n)).toBe(0n);
    expect(strikeFor(333_333_333n, 9, 3n)).toBe(0n);
  });
});

describe('formatBps', () => {
  it('shows basis points as a percentage', () => {
    expect(formatBps('2')).toBe('0.02%');
    expect(formatBps('100000')).toBe('1000%');
  });
});
