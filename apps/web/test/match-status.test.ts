import { describe, expect, it } from 'vitest';

import { type StatusInput, currentRound, matchStatus } from '../src/lib/match-status';

const stake = { symbol: 'OPENAI', decimals: 9, amount: '50000000', strike: '1000000' };
const base: StatusInput = {
  state: 'open',
  winner: 'unset',
  deadlines: {
    join: 100,
    activation: 200,
    rounds: [1000, 1180, 1360],
    targetEnd: 1540,
    settlementDeadline: 1840,
    optionExpiry: 2440,
  },
  stakes: { creator: stake, challenger: stake },
};

describe('matchStatus', () => {
  it('counts down the join window, then says it closed', () => {
    expect(matchStatus(base, 50)).toMatchObject({ label: 'Waiting for opponent', deadline: 100 });
    expect(matchStatus(base, 101)).toMatchObject({ label: 'Join window closed', deadline: 0 });
  });

  it('names the live round from the round due times', () => {
    const active = { ...base, state: 'active' };
    expect(matchStatus(active, 1000).label).toBe('Live · Round 1 of 3');
    expect(matchStatus(active, 1200).label).toBe('Live · Round 2 of 3');
    expect(matchStatus(active, 1500).label).toBe('Live · Round 3 of 3');
    expect(matchStatus(active, 1600).label).toBe('Settling');
    expect(matchStatus(active, 1841).label).toBe('Settlement missed');
  });

  it('describes the winner option and its expiry', () => {
    const won = { ...base, state: 'winnerOptionOpen', winner: 'challenger' };
    const open = matchStatus(won, 2000);
    expect(open.label).toBe('Player B won');
    expect(open.detail).toContain("Player A's 0.05 OPENAI for 1 USDC-DEV");
    expect(open.deadline).toBe(2440);
    expect(matchStatus(won, 2441).label).toBe('Player B won · option expired');
  });

  it('reports ties and failures literally', () => {
    expect(matchStatus({ ...base, state: 'tieRefundable', winner: 'tie' }, 0).label).toBe('Tie');
    expect(matchStatus({ ...base, state: 'failureRefundable' }, 0).label).toBe('Match failed');
  });
});

describe('currentRound', () => {
  it('is zero before activation and ignores unset due times', () => {
    expect(currentRound([0, 0, 0], 5000)).toBe(0);
    expect(currentRound([1000, 1180, 1360], 999)).toBe(0);
    expect(currentRound([1000, 1180, 1360], 1180)).toBe(2);
  });
});
