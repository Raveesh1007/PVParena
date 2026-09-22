import { BN } from '@coral-xyz/anchor';
import { describe, expect, it } from 'vitest';

import { dueRound } from '../src/windows.js';

/**
 * The worker's round-window arithmetic.
 *
 * This is worth a test of its own because getting it wrong is silent and expensive: picking a
 * round whose window has closed wastes a paid ClawPump turn on a transaction the program will
 * reject, and skipping a round that is open hands **both** players the maximum penalty for it.
 * The program enforces the same boundaries, so a mistake here never corrupts a result — it just
 * quietly ruins the match.
 */

/** Demo profile after activation at t=1000: rounds at +0 / +3m / +6m, target at +9m. */
const account = (submittedRounds: number) => ({
  roundDueTs: [new BN(1000), new BN(1180), new BN(1360)],
  targetEndTs: new BN(1540),
  submittedRounds,
});

describe('dueRound', () => {
  it('opens a round at its due time and closes it when the next one is due', () => {
    expect(dueRound(account(0), 999)).toBeNull();
    expect(dueRound(account(0), 1000)).toBe(0);
    expect(dueRound(account(0), 1179)).toBe(0);
    // Round 0 closes exactly as round 1 opens; there is no gap and no overlap.
    expect(dueRound(account(0), 1180)).toBe(1);
  });

  it('runs the final round until the target end, not past it', () => {
    expect(dueRound(account(0b011), 1360)).toBe(2);
    expect(dueRound(account(0b011), 1539)).toBe(2);
    // At the target the match settles instead; a late round would be chosen with the answer known.
    expect(dueRound(account(0b011), 1540)).toBeNull();
  });

  it('skips a round that has already been submitted rather than resubmitting it', () => {
    expect(dueRound(account(0b001), 1000)).toBeNull();
    expect(dueRound(account(0b010), 1180)).toBeNull();
  });

  it('does not fall back to an earlier round whose window has closed', () => {
    // Round 0 was missed entirely. It stays missed and both players take the penalty for it —
    // submitting it during round 1's window is exactly what the program rejects.
    expect(dueRound(account(0), 1200)).toBe(1);
  });
});
