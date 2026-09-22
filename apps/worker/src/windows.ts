import type { BN } from '@coral-xyz/anchor';

export const toSeconds = (value: BN | number): number =>
  typeof value === 'number' ? value : value.toNumber();

export interface RoundWindows {
  roundDueTs: (BN | number)[];
  targetEndTs: BN | number;
  /** Bit `i` is set once round `i` has been submitted. */
  submittedRounds: number;
}

/**
 * The round that is currently submittable, if any.
 *
 * A round opens at its due time and closes when the next one is due — the final round closes at
 * the match's target end. Each may be submitted once.
 *
 * Getting this wrong is silent and expensive in both directions: picking a round whose window has
 * closed spends a paid ClawPump turn on a transaction the program will reject, and skipping one
 * that is open hands **both** players the maximum penalty for it. Returning `null` rather than
 * guessing at the nearest round keeps the worker from attempting a submission that cannot land.
 */
export function dueRound(account: RoundWindows, now: number): number | null {
  const due = account.roundDueTs.map(toSeconds);
  const targetEnd = toSeconds(account.targetEndTs);
  for (let round = 0; round < due.length; round += 1) {
    const start = due[round];
    const end = round + 1 < due.length ? due[round + 1] : targetEnd;
    if (start === undefined || end === undefined) continue;
    if ((account.submittedRounds & (1 << round)) !== 0) continue;
    if (now >= start && now < end) return round;
  }
  return null;
}
