/**
 * Which instruction a wallet can usefully send for a match right now. The program remains the
 * authority — this only decides which button to show, from the same state, deadlines and flags the
 * program checks, so a player is not invited to sign a transaction that must fail.
 */
export type PlayerAction =
  | 'join'
  | 'cancel'
  | 'refundFailed'
  | 'markOracleFailure'
  | 'refundTie'
  | 'claim'
  | 'exercise'
  | 'reclaim';

export interface ActionInput {
  state: string;
  creator: string;
  challenger: string | null;
  winner: string;
  deadlines: { join: number; activation: number; settlementDeadline: number; optionExpiry: number };
  deposits: { creator: string; challenger: string };
  flags: { winnerStakeClaimed: boolean; creatorRefunded: boolean; challengerRefunded: boolean };
}

export function availableActions(
  match: ActionInput,
  wallet: string | null,
  now: number,
): PlayerAction[] {
  if (!wallet) return [];
  const role =
    wallet === match.creator ? 'creator' : wallet === match.challenger ? 'challenger' : null;

  if (match.state === 'open') {
    if (role === 'creator') return ['cancel'];
    return now <= match.deadlines.join ? ['join'] : [];
  }
  if (!role) return [];

  const ownDeposit = BigInt(match.deposits[role]) > 0n;
  const refunded =
    role === 'creator' ? match.flags.creatorRefunded : match.flags.challengerRefunded;
  const canWithdraw = ownDeposit && !refunded;

  switch (match.state) {
    case 'ready':
      return canWithdraw && now > match.deadlines.activation ? ['refundFailed'] : [];
    case 'active':
      return canWithdraw && now > match.deadlines.settlementDeadline ? ['markOracleFailure'] : [];
    case 'failureRefundable':
      return canWithdraw ? ['refundFailed'] : [];
    case 'tieRefundable':
      return canWithdraw ? ['refundTie'] : [];
    case 'winnerOptionOpen':
    case 'optionExercised':
    case 'optionExpired': {
      const actions: PlayerAction[] = [];
      if (role === match.winner) {
        if (!match.flags.winnerStakeClaimed) actions.push('claim');
        if (match.state === 'winnerOptionOpen' && now <= match.deadlines.optionExpiry) {
          actions.push('exercise');
        }
      } else if (
        match.state === 'winnerOptionOpen' &&
        now > match.deadlines.optionExpiry &&
        canWithdraw
      ) {
        actions.push('reclaim');
      }
      return actions;
    }
    default:
      return [];
  }
}
