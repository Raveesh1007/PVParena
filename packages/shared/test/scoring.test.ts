import { describe, expect, it } from 'vitest';
import {
  MAX_ROUND_ERROR_BPS,
  normalizeToExponent,
  roundErrorBps,
  selectWinner,
  totalScore,
  weightedErrorBps,
} from '../src/index.js';

const START = 22_251_500n; // 222.515 at exponent -5
const FINAL = 22_400_000n;

describe('normalizeToExponent', () => {
  it('is a no-op at the same exponent', () => {
    expect(normalizeToExponent(START, -5, -5)).toBe(START);
  });

  it('scales up exactly', () => {
    expect(normalizeToExponent(222_515n, -3, -5)).toBe(22_251_500n);
  });

  it('scales down when lossless', () => {
    expect(normalizeToExponent(22_251_500_000n, -8, -5)).toBe(22_251_500n);
  });

  it('refuses a lossy rescale rather than truncating a price', () => {
    expect(() => normalizeToExponent(22_251_500_001n, -8, -5)).toThrow(/without loss/);
  });
});

describe('roundErrorBps', () => {
  it('is zero for an exact prediction', () => {
    expect(roundErrorBps({ valid: true, predictedPrice: FINAL }, FINAL, START)).toBe(0n);
  });

  it('truncates toward zero exactly as on-chain integer division does', () => {
    // |22_300_000 - 22_400_000| * 10_000 / 22_251_500 = 44.94... -> 44
    expect(roundErrorBps({ valid: true, predictedPrice: 22_300_000n }, FINAL, START)).toBe(44n);
  });

  it('is symmetric above and below the final price', () => {
    const under = roundErrorBps({ valid: true, predictedPrice: FINAL - 100_000n }, FINAL, START);
    const over = roundErrorBps({ valid: true, predictedPrice: FINAL + 100_000n }, FINAL, START);
    expect(under).toBe(over);
  });

  it('applies the maximum penalty to a failed or unsubmitted round', () => {
    expect(roundErrorBps({ valid: false }, FINAL, START)).toBe(MAX_ROUND_ERROR_BPS);
  });

  it('rejects a non-positive price claiming to be valid', () => {
    expect(() => roundErrorBps({ valid: true, predictedPrice: 0n }, FINAL, START)).toThrow(
      /positive/,
    );
  });
});

describe('weightedErrorBps', () => {
  it('weights by round', () => {
    expect(weightedErrorBps(44n, 2000)).toBe(8n);
    expect(weightedErrorBps(MAX_ROUND_ERROR_BPS, 5000)).toBe(50_000n);
  });
});

describe('totalScore', () => {
  it('sums the three weighted rounds', () => {
    const { total, rounds } = totalScore(
      [
        { valid: true, predictedPrice: 22_300_000n },
        { valid: true, predictedPrice: FINAL },
        { valid: false },
      ],
      FINAL,
      START,
    );
    expect(rounds.map((r) => r.weightedErrorBps)).toEqual([8n, 0n, 50_000n]);
    expect(total).toBe(50_008n);
  });

  it('gives both players the maximum when a round never lands', () => {
    const allMissed = totalScore(
      [{ valid: false }, { valid: false }, { valid: false }],
      FINAL,
      START,
    );
    expect(allMissed.total).toBe(100_000n); // 20% + 30% + 50% of MAX_ROUND_ERROR_BPS
  });
});

describe('selectWinner', () => {
  it('awards the lower score', () => {
    expect(selectWinner(10n, 20n)).toBe('creator');
    expect(selectWinner(20n, 10n)).toBe('challenger');
  });

  it('ties on equal scores instead of breaking them randomly', () => {
    expect(selectWinner(50_008n, 50_008n)).toBe('tie');
  });
});
