import { QUOTE_DECIMALS, formatAmount } from './format';

export type Side = 'creator' | 'challenger';

export const PLAYER: Record<Side, string> = { creator: 'Player A', challenger: 'Player B' };

const other = (side: Side): Side => (side === 'creator' ? 'challenger' : 'creator');

export interface StatusInput {
  state: string;
  winner: string;
  deadlines: {
    join: number;
    activation: number;
    rounds: number[];
    targetEnd: number;
    settlementDeadline: number;
    optionExpiry: number;
  };
  stakes: Record<Side, { symbol: string; decimals: number; amount: string; strike: string }>;
}

export interface MatchStatus {
  label: string;
  detail: string;
  /** Zero when nothing is counting down. */
  deadline: number;
  deadlineLabel: string;
}

/** 1-based round whose due time has passed; 0 before the match starts. */
export function currentRound(rounds: number[], now: number): number {
  return rounds.filter((due) => due > 0 && now >= due).length;
}

/** Plain-language state for people; the program's own state and deadlines decide every branch. */
export function matchStatus(match: StatusInput, now: number): MatchStatus {
  const { deadlines } = match;
  const none = { deadline: 0, deadlineLabel: '' };
  const refund = 'Each player can refund their own deposit.';
  const settling: MatchStatus = {
    label: 'Settling',
    detail:
      'The final benchmark price is being recorded on-chain and the program is scoring both players.',
    deadline: deadlines.settlementDeadline,
    deadlineLabel: 'Settlement deadline in',
  };

  switch (match.state) {
    case 'open':
      return now <= deadlines.join
        ? {
            label: 'Waiting for opponent',
            detail:
              'Player A has escrowed their stake. The match starts once another wallet joins.',
            deadline: deadlines.join,
            deadlineLabel: 'Join closes in',
          }
        : {
            label: 'Join window closed',
            detail: 'Player A can cancel and take back their stake.',
            ...none,
          };
    case 'ready':
      return now <= deadlines.activation
        ? {
            label: 'Starting',
            detail:
              'Both stakes are in escrow. The opening benchmark price is being recorded, then round 1 begins.',
            deadline: deadlines.activation,
            deadlineLabel: 'Must start within',
          }
        : {
            label: 'Did not start',
            detail: `The match was not started in time. ${refund}`,
            ...none,
          };
    case 'active': {
      if (now > deadlines.settlementDeadline) {
        return {
          label: 'Settlement missed',
          detail: `No valid final price was recorded in time. ${refund}`,
          ...none,
        };
      }
      if (now >= deadlines.targetEnd) return settling;
      const round = Math.max(1, currentRound(deadlines.rounds, now));
      return {
        label: `Live · Round ${round} of 3`,
        detail:
          'Each round, both agents predict the benchmark price at the end of the match. Closest wins; later rounds count more.',
        deadline: deadlines.targetEnd,
        deadlineLabel: 'Final price in',
      };
    }
    case 'awaitingSettlement':
      return settling;
    case 'winnerOptionOpen':
    case 'optionExercised':
    case 'optionExpired': {
      if (match.winner !== 'creator' && match.winner !== 'challenger') break;
      const winner = PLAYER[match.winner];
      const loser = PLAYER[other(match.winner)];
      const stake = match.stakes[other(match.winner)];
      const stakeText = `${formatAmount(stake.amount, stake.decimals)} ${stake.symbol}`;
      if (match.state === 'optionExercised') {
        return {
          label: `${winner} won · option exercised`,
          detail: `${winner} paid the strike and took ${loser}'s ${stakeText}. The match is complete.`,
          ...none,
        };
      }
      if (match.state === 'optionExpired' || now > deadlines.optionExpiry) {
        return {
          label: `${winner} won · option expired`,
          detail:
            match.state === 'optionExpired'
              ? `${winner} did not buy ${loser}'s stake, and ${loser} took back their ${stakeText}. The match is complete.`
              : `${winner} did not buy ${loser}'s stake in time. ${loser} can reclaim their ${stakeText}.`,
          ...none,
        };
      }
      return {
        label: `${winner} won`,
        detail: `${winner} gets their own stake back and may buy ${loser}'s ${stakeText} for ${formatAmount(stake.strike, QUOTE_DECIMALS)} USDC-DEV. If they don't, ${loser} takes it back.`,
        deadline: deadlines.optionExpiry,
        deadlineLabel: 'Option expires in',
      };
    }
    case 'tieRefundable':
      return { label: 'Tie', detail: `Both players scored exactly the same. ${refund}`, ...none };
    case 'failureRefundable':
      return {
        label: 'Match failed',
        detail: `The match could not be completed with a valid benchmark price. ${refund}`,
        ...none,
      };
    case 'cancelled':
      return {
        label: 'Cancelled',
        detail: 'Player A withdrew the challenge before anyone joined.',
        ...none,
      };
  }
  return { label: match.state, detail: '', ...none };
}
