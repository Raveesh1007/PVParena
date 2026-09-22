import { describe, expect, it } from 'vitest';
import type { MatchView } from '../src/lib/matches';
import { transcriptFilters } from '../src/lib/transcript';

const match = {
  pda: 'match',
  creator: 'alice',
  challenger: 'bob',
  commitments: { creator: 'alice-hash', challenger: 'bob-hash' },
  deadlines: { start: 0 },
  rounds: [
    { round: 0, creator: { outcome: 'unsubmitted' }, challenger: { outcome: 'unsubmitted' } },
    { round: 1, creator: { outcome: 'valid' }, challenger: { outcome: 'timeout' } },
  ],
} as unknown as MatchView;

describe('public transcript filters', () => {
  it('withholds strategies from matches that failed before activation', () => {
    expect(transcriptFilters(match).strategies.OR).toEqual([]);
  });
  it('selects only the two wallet/commitment pairs signed on-chain', () => {
    const active = { ...match, deadlines: { ...match.deadlines, start: 1000 } };
    expect(transcriptFilters(active).strategies).toEqual({
      matchPda: 'match',
      OR: [
        { playerWallet: 'alice', commitment: 'alice-hash' },
        { playerWallet: 'bob', commitment: 'bob-hash' },
      ],
    });
  });
  it('hides saved responses until both predictions are confirmed on-chain', () => {
    expect(transcriptFilters(match).turns).toEqual({ matchPda: 'match', round: { in: [1] } });
  });
});
