import { BN } from '@coral-xyz/anchor';
import type { PrismaClient } from '@prisma/client';
import { PublicKey } from '@solana/web3.js';
import { arenaPda, parseFeedId } from '@stock-arena/idl';

import {
  type ChainContext,
  type MatchAccount,
  chainNow,
  fetchActionableMatches,
  stateOf,
} from './chain.js';
import { type RoundPlayer, runRoundTurns } from './agents.js';
import type { WorkerConfig } from './config.js';
import { jobKeys, withJobLease } from './jobs.js';
import { readBenchmark, withPriceUpdate } from './pyth.js';
import { dueRound, toSeconds } from './windows.js';

export async function tick(
  db: PrismaClient,
  config: WorkerConfig,
  ctx: ChainContext,
): Promise<void> {
  const now = await chainNow(ctx);
  const slot = await ctx.connection.getSlot('confirmed');
  const matches = await fetchActionableMatches(ctx);

  for (const { pda, account } of matches) {
    try {
      // AgentTurn's foreign key requires the projection before the first turn is reserved.
      const projection = {
        chainState: stateOf(account),
        lastSlot: BigInt(slot),
        creatorWallet: account.creator.toBase58(),
        challengerWallet: account.challenger.toBase58(),
        arenaPda: account.arena.toBase58(),
        profileKind: Object.keys(account.profileKind)[0]!,
        roundDueTs: account.roundDueTs.map((time) => new Date(toSeconds(time) * 1000)),
        creatorCommitment: Buffer.from(account.creatorStrategyCommitment).toString('hex'),
        challengerCommitment: Buffer.from(account.challengerStrategyCommitment).toString('hex'),
      };
      await db.matchProjection.upsert({
        where: { matchPda: pda.toBase58() },
        create: { matchPda: pda.toBase58(), ...projection },
        update: projection,
      });
      await driveMatch(db, config, ctx, pda, account, now);
    } catch (error) {
      // One bad match must never stop the others: a stuck match has its own safe exits, but a
      // stalled worker would miss every other match's round windows too.
      console.error(`[match ${pda.toBase58()}] ${String((error as Error).message ?? error)}`);
    }
  }
}

async function driveMatch(
  db: PrismaClient,
  config: WorkerConfig,
  ctx: ChainContext,
  pda: PublicKey,
  account: MatchAccount,
  now: number,
): Promise<void> {
  const key = pda.toBase58();
  const state = stateOf(account);

  if (state === 'ready') {
    // Past the activation deadline there is nothing to do: the match is refundable and either
    // player can exit. Activating late would be rejected on-chain anyway.
    if (now > toSeconds(account.activationDeadlineTs)) return;
    await withJobLease(db, { key: jobKeys.activate(key), type: 'Activate', matchPda: key }, () =>
      activate(config, ctx, pda, account),
    );
    return;
  }

  if (state !== 'active') return;

  const targetEnd = toSeconds(account.targetEndTs);
  const settlementDeadline = toSeconds(account.settlementDeadlineTs);

  if (now >= targetEnd) {
    if (now > settlementDeadline) {
      // No valid final price arrived in the window. Flip the match to refundable so both players
      // can exit; nobody, including the admin, may substitute a price instead. `code.md` §3.2.
      await withJobLease(
        db,
        { key: jobKeys.markOracleFailure(key), type: 'MarkOracleFailure', matchPda: key },
        () => markOracleFailure(ctx, pda),
      );
      return;
    }
    await withJobLease(db, { key: jobKeys.settle(key), type: 'Settle', matchPda: key }, () =>
      settle(config, ctx, pda, account),
    );
    return;
  }

  const round = dueRound(account, now);
  if (round === null) return;
  await withJobLease(
    db,
    { key: jobKeys.round(key, round), type: 'SubmitRound', matchPda: key, round },
    () => submitRound(db, config, ctx, pda, account, round),
  );
}

async function activate(
  config: WorkerConfig,
  ctx: ChainContext,
  pda: PublicKey,
  account: MatchAccount,
) {
  await withPriceUpdate(config, ctx.connection, ctx.provider.wallet as never, (priceUpdate) =>
    ctx.program.methods
      .activateMatch()
      .accountsPartial({
        orchestrator: ctx.provider.wallet.publicKey,
        config: ctx.config,
        arena: account.arena,
        matchAccount: pda,
        priceUpdate,
      })
      .instruction(),
  );
  return 'done' as const;
}

async function settle(
  config: WorkerConfig,
  ctx: ChainContext,
  pda: PublicKey,
  account: MatchAccount,
) {
  await withPriceUpdate(config, ctx.connection, ctx.provider.wallet as never, (priceUpdate) =>
    ctx.program.methods
      .settleMatch()
      .accountsPartial({
        arena: account.arena,
        config: ctx.config,
        matchAccount: pda,
        priceUpdate,
      })
      .instruction(),
  );
  return 'done' as const;
}

async function markOracleFailure(ctx: ChainContext, pda: PublicKey) {
  await ctx.program.methods
    .markOracleFailureRefundable()
    .accountsPartial({ matchAccount: pda })
    .rpc();
  return 'done' as const;
}

async function submitRound(
  db: PrismaClient,
  config: WorkerConfig,
  ctx: ChainContext,
  pda: PublicKey,
  account: MatchAccount,
  round: number,
) {
  const players: [RoundPlayer, RoundPlayer] = [
    {
      wallet: account.creator,
      index: 0,
      commitment: Buffer.from(account.creatorStrategyCommitment),
    },
    {
      wallet: account.challenger,
      index: 1,
      commitment: Buffer.from(account.challengerStrategyCommitment),
    },
  ];

  // Read-only: the prompts need current price context, but a round posts nothing on-chain.
  const observed = await readBenchmark(config);

  const turns = await runRoundTurns(
    db,
    config,
    ctx.connection,
    {
      matchPda: pda,
      round,
      observed,
      targetPublishTime: toSeconds(account.targetEndTs),
      benchmarkSymbol: config.benchmarkSymbol,
      benchmarkFeedId: config.benchmarkFeedId,
    },
    players,
  );

  // Both players' results in one instruction, so no third party can observe one prediction before
  // the other. `code.md` §6.
  await ctx.program.methods
    .submitRoundPredictions(round, toInput(turns[0]), toInput(turns[1]))
    .accountsPartial({
      orchestrator: ctx.provider.wallet.publicKey,
      config: ctx.config,
      matchAccount: pda,
    })
    .rpc();

  return 'done' as const;
}

/**
 * Map a parsed agent response onto the on-chain `PredictionInput`.
 *
 * Every non-valid outcome carries a zero price, which the program enforces too — a failure
 * outcome smuggling in a price is rejected at submission. The three failure kinds all take
 * `MAX_ROUND_ERROR_BPS`; they differ only so the transcript is honest about what happened.
 */
function toInput(turn: { parsed: import('@stock-arena/shared').ParsedPrediction }) {
  if (turn.parsed.outcome === 'valid') {
    return {
      outcome: { valid: {} },
      predictedPrice: new BN(turn.parsed.prediction.predictedFinalPrice),
    } as never;
  }
  const outcome =
    turn.parsed.outcome === 'timeout'
      ? { timeout: {} }
      : turn.parsed.outcome === 'apiError'
        ? { apiError: {} }
        : { malformed: {} };
  return { outcome, predictedPrice: new BN(0) } as never;
}

/** Fail fast at startup if the configured benchmark feed does not match the deployed Arena. */
export function expectedArena(config: WorkerConfig, assetMint: PublicKey): PublicKey {
  return arenaPda(assetMint, parseFeedId(config.benchmarkFeedId));
}
