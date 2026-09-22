import 'server-only';

import type { BN } from '@coral-xyz/anchor';
import type { PublicKey } from '@solana/web3.js';
import { BPS_DENOMINATOR, MAX_ROUND_ERROR_BPS, ROUND_WEIGHTS_BPS } from '@stock-arena/shared';

import { program } from './server';

const n = (value: BN | number): number => (typeof value === 'number' ? value : value.toNumber());

const enumName = (value: object): string => Object.keys(value)[0] ?? 'unknown';

export interface RoundView {
  round: number;
  weightBps: number;
  creator: { outcome: string; predictedPrice: string; errorBps: string | null };
  challenger: { outcome: string; predictedPrice: string; errorBps: string | null };
}

export interface MatchView {
  pda: string;
  state: string;
  arena: string;
  creator: string;
  challenger: string | null;
  stakeAmount: string;
  strikeAmount: string;
  profile: string;
  commitments: { creator: string; challenger: string | null };
  deadlines: {
    created: number;
    join: number;
    activation: number;
    start: number;
    rounds: number[];
    targetEnd: number;
    settlementDeadline: number;
    optionExpiry: number;
  };
  startObservation: Observation | null;
  finalObservation: Observation | null;
  rounds: RoundView[];
  scores: { creator: string; challenger: string } | null;
  winner: string;
  deposits: { creator: string; challenger: string };
  flags: { winnerStakeClaimed: boolean; creatorRefunded: boolean; challengerRefunded: boolean };
}

export interface Observation {
  price: string;
  exponent: number;
  confidence: string;
  publishTime: number;
}

const zeroPubkey = '11111111111111111111111111111111';

export async function loadMatch(pda: PublicKey): Promise<MatchView | null> {
  const account = await program().account.match.fetchNullable(pda);
  if (!account) return null;

  const challenger = account.challenger.toBase58();
  const startObservation = observation(account.startObservation);
  const finalObservation = observation(account.finalObservation);
  const settled = finalObservation !== null;

  return {
    pda: pda.toBase58(),
    state: enumName(account.state),
    arena: account.arena.toBase58(),
    creator: account.creator.toBase58(),
    challenger: challenger === zeroPubkey ? null : challenger,
    stakeAmount: account.stakeAmount.toString(),
    strikeAmount: account.strikeAmount.toString(),
    profile: enumName(account.profileKind),
    commitments: {
      creator: hex(account.creatorStrategyCommitment),
      challenger: challenger === zeroPubkey ? null : hex(account.challengerStrategyCommitment),
    },
    deadlines: {
      created: n(account.createdTs),
      join: n(account.joinDeadlineTs),
      activation: n(account.activationDeadlineTs),
      start: n(account.startTs),
      rounds: account.roundDueTs.map(n),
      targetEnd: n(account.targetEndTs),
      settlementDeadline: n(account.settlementDeadlineTs),
      optionExpiry: n(account.optionExpiryTs),
    },
    startObservation,
    finalObservation,
    rounds: account.predictions.map((pair, round) => ({
      round,
      weightBps: ROUND_WEIGHTS_BPS[round] ?? 0,
      creator: prediction(pair[0], startObservation, finalObservation, settled),
      challenger: prediction(pair[1], startObservation, finalObservation, settled),
    })),
    scores: settled
      ? { creator: account.creatorScore.toString(), challenger: account.challengerScore.toString() }
      : null,
    winner: enumName(account.winner),
    deposits: {
      creator: account.creatorDeposit.toString(),
      challenger: account.challengerDeposit.toString(),
    },
    flags: {
      winnerStakeClaimed: account.winnerStakeClaimed,
      creatorRefunded: account.creatorRefunded,
      challengerRefunded: account.challengerRefunded,
    },
  };
}

function hex(bytes: number[]): string {
  return Buffer.from(bytes).toString('hex');
}

function observation(raw: {
  price: BN;
  exponent: number;
  confidence: BN;
  publishTime: BN;
}): Observation | null {
  // An unset observation is all zeroes; a real one always has a publish time.
  if (n(raw.publishTime) === 0) return null;
  return {
    price: raw.price.toString(),
    exponent: raw.exponent,
    confidence: raw.confidence.toString(),
    publishTime: n(raw.publishTime),
  };
}

/**
 * The per-round error breakdown the result page shows.
 *
 * Recomputed here from the same integers the program used, so the page can display a score
 * breakdown without the program having to store one. It is display only — the winner on screen is
 * always the winner the program recorded, never one derived from this arithmetic. BigInt
 * throughout, because a float would disagree with the on-chain result in the last digit and make
 * the published breakdown look wrong.
 */
function prediction(
  record: { outcome: object; predictedPrice: BN },
  start: Observation | null,
  final: Observation | null,
  settled: boolean,
): RoundView['creator'] {
  const outcome = enumName(record.outcome);
  const view = {
    outcome,
    predictedPrice: record.predictedPrice.toString(),
    errorBps: null as string | null,
  };
  if (!settled || !start || !final) return view;

  if (outcome !== 'valid') {
    view.errorBps = MAX_ROUND_ERROR_BPS.toString();
    return view;
  }
  const startPrice = BigInt(start.price);
  if (startPrice === 0n) return view;
  const diff = BigInt(record.predictedPrice.toString()) - BigInt(final.price);
  const absolute = diff < 0n ? -diff : diff;
  const absoluteStart = startPrice < 0n ? -startPrice : startPrice;
  view.errorBps = ((absolute * BigInt(BPS_DENOMINATOR)) / absoluteStart).toString();
  return view;
}

/** All matches for an Arena, newest first, for the Arena page's challenge list. */
export async function listMatches(arena: PublicKey): Promise<MatchView[]> {
  const all = await program().account.match.all([
    { memcmp: { offset: 8, bytes: arena.toBase58() } },
  ]);
  const views = await Promise.all(all.map((entry) => loadMatch(entry.publicKey)));
  return views
    .filter((view): view is MatchView => view !== null)
    .sort((a, b) => b.deadlines.created - a.deadlines.created);
}
