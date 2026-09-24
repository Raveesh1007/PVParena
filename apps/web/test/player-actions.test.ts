import { describe, expect, it } from 'vitest';

import { type ActionInput, availableActions } from '../src/lib/player-actions';

const A = 'creator-wallet';
const B = 'challenger-wallet';
const base: ActionInput = {
  state: 'open',
  creator: A,
  challenger: null,
  winner: 'unset',
  deadlines: { join: 100, activation: 200, settlementDeadline: 300, optionExpiry: 400 },
  deposits: { creator: '5', challenger: '0' },
  flags: { winnerStakeClaimed: false, creatorRefunded: false, challengerRefunded: false },
};
const joined = { ...base, challenger: B, deposits: { creator: '5', challenger: '7' } };

describe('availableActions', () => {
  it('offers nothing without a wallet', () => {
    expect(availableActions(base, null, 0)).toEqual([]);
  });

  it('lets the creator cancel and anyone else join until the join deadline', () => {
    expect(availableActions(base, A, 50)).toEqual(['cancel']);
    expect(availableActions(base, B, 100)).toEqual(['join']);
    expect(availableActions(base, B, 101)).toEqual([]);
  });

  it('opens the Ready refund only after the activation deadline, for players only', () => {
    const ready = { ...joined, state: 'ready' };
    expect(availableActions(ready, A, 200)).toEqual([]);
    expect(availableActions(ready, A, 201)).toEqual(['refundFailed']);
    expect(availableActions(ready, 'stranger', 201)).toEqual([]);
  });

  it('marks an oracle failure only after the settlement deadline', () => {
    const active = { ...joined, state: 'active' };
    expect(availableActions(active, B, 300)).toEqual([]);
    expect(availableActions(active, B, 301)).toEqual(['markOracleFailure']);
  });

  it('refunds each player once', () => {
    const tie = { ...joined, state: 'tieRefundable' };
    expect(availableActions(tie, A, 0)).toEqual(['refundTie']);
    const refunded = {
      ...tie,
      deposits: { creator: '0', challenger: '7' },
      flags: { ...tie.flags, creatorRefunded: true },
    };
    expect(availableActions(refunded, A, 0)).toEqual([]);
    expect(availableActions(refunded, B, 0)).toEqual(['refundTie']);
  });

  it('gives the winner claim and exercise until expiry, then the loser reclaim', () => {
    const won = { ...joined, state: 'winnerOptionOpen', winner: 'challenger' };
    expect(availableActions(won, B, 400)).toEqual(['claim', 'exercise']);
    expect(availableActions(won, A, 400)).toEqual([]);
    expect(availableActions(won, B, 401)).toEqual(['claim']);
    expect(availableActions(won, A, 401)).toEqual(['reclaim']);
  });

  it('still lets a winner who exercised first claim their own stake', () => {
    const exercised = { ...joined, state: 'optionExercised', winner: 'creator' };
    expect(availableActions(exercised, A, 0)).toEqual(['claim']);
    const claimed = { ...exercised, flags: { ...exercised.flags, winnerStakeClaimed: true } };
    expect(availableActions(claimed, A, 0)).toEqual([]);
  });
});
