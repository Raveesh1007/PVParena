import 'server-only';

import type { BN } from '@coral-xyz/anchor';
import { getMint } from '@solana/spl-token';
import type { PublicKey } from '@solana/web3.js';
import { BPS_DENOMINATOR, MAX_ROUND_ERROR_BPS, ROUND_WEIGHTS_BPS } from '@stock-arena/shared';

import { arenaRegistry, program } from './server';

const n = (value: BN | number): number => (typeof value === 'number' ? value : value.toNumber());

const enumName = (value: object): string => Object.keys(value)[0] ?? 'unknown';

export interface RoundView {
  round: number;
  weightBps: number;
  creator: { outcome: string; predictedPrice: string; errorBps: string | null };
  challenger: { outcome: string; predictedPrice: string; errorBps: string | null };
}

/** One side's escrow terms. `strike` is what the winner pays to take this stake. */
export interface StakeView {
  arena: string;
  symbol: string;
  decimals: number;
  amount: string;
  strike: string;
}

export interface MatchView {
  pda: string;
  state: string;
  arena: string;
  creator: string;
  challenger: string | null;
  stakes: { creator: StakeView; challenger: StakeView };
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
  const [creatorAsset, challengerAsset] = await Promise.all([
    stakeAsset(account.arena),
    stakeAsset(account.challengerArena),
  ]);

  return {
    pda: pda.toBase58(),
    state: enumName(account.state),
    arena: account.arena.toBase58(),
    creator: account.creator.toBase58(),
    challenger: challenger === zeroPubkey ? null : challenger,
    stakes: {
      creator: {
        ...creatorAsset,
        amount: account.creatorStakeAmount.toString(),
        strike: account.creatorStakeStrike.toString(),
      },
      challenger: {
        ...challengerAsset,
        amount: account.challengerStakeAmount.toString(),
        strike: account.challengerStakeStrike.toString(),
      },
    },
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

/** Symbol from the registry and decimals from the devnet mint the Arena escrows. */
async function stakeAsset(arena: PublicKey) {
  const account = await program().account.arena.fetch(arena);
  const mint = await getMint(
    program().provider.connection,
    account.assetMint,
    'confirmed',
    account.assetTokenProgram,
  );
  const entry = arenaRegistry().arenas.find(
    (candidate) => candidate.devnetTestMint === account.assetMint.toBase58(),
  );
  return {
    arena: arena.toBase58(),
    symbol: entry?.symbol ?? account.assetMint.toBase58().slice(0, 6),
    decimals: mint.decimals,
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

/** Matches with either side staked in this Arena, newest first. Offsets are the account
 *  discriminator, then `arena`, then `challenger_arena`. */
export async function listMatches(arena: PublicKey): Promise<MatchView[]> {
  const [asCreator, asChallenger] = await Promise.all(
    [8, 40].map((offset) =>
      program().account.match.all([{ memcmp: { offset, bytes: arena.toBase58() } }]),
    ),
  );
  const unique = new Map(
    [...(asCreator ?? []), ...(asChallenger ?? [])].map((entry) => [
      entry.publicKey.toBase58(),
      entry.publicKey,
    ]),
  );
  const views = await Promise.all([...unique.values()].map((pda) => loadMatch(pda)));
  return views
    .filter((view): view is MatchView => view !== null)
    .sort((a, b) => b.deadlines.created - a.deadlines.created);
}
