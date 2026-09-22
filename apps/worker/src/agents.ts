import { createHash } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { type Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import {
  assertAgentWalletEmpty,
  createBattleAgent,
  requestPrediction,
  summarize,
  type AgentTurnResult,
} from '@stock-arena/integrations';
import {
  type PredictionContext,
  type ParsedPrediction,
  computeCommitment,
} from '@stock-arena/shared';

import type { WorkerConfig } from './config.js';
import type { ObservedPrice } from './pyth.js';

export interface RoundPlayer {
  wallet: PublicKey;
  /** 0 = creator, 1 = challenger, matching `predictions[round][player]` on-chain. */
  index: number;
  /** The 32-byte commitment recorded on-chain. */
  commitment: Buffer;
}

export interface RoundContext {
  matchPda: PublicKey;
  round: number;
  observed: ObservedPrice;
  targetPublishTime: number;
  benchmarkSymbol: string;
  benchmarkFeedId: string;
}

export interface TurnRecord {
  playerIndex: number;
  parsed: ParsedPrediction;
}

/** Reuse this wallet's agent, or create one. Creation is gated on proven on-chain participation. */
export async function ensureAgent(
  db: PrismaClient,
  config: WorkerConfig,
  connection: Connection,
  playerWallet: PublicKey,
): Promise<{ agentId: string; agentWallet: string }> {
  const key = playerWallet.toBase58();
  const existing = await db.battleAgent.findUnique({ where: { playerWallet: key } });
  if (existing && existing.status === 'Active') {
    await assertEmpty(connection, existing.agentWallet);
    await db.battleAgent.update({
      where: { playerWallet: key },
      data: { lastZeroBalanceCheck: new Date() },
    });
    return { agentId: existing.agentId, agentWallet: existing.agentWallet };
  }
  if (existing) {
    throw new Error(
      `Battle agent for ${key} is ${existing.status} and will not be used. A quarantined agent ` +
        'held funds at some point and must be investigated, not silently replaced.',
    );
  }

  const created = await createBattleAgent({
    baseUrl: config.clawpumpBaseUrl,
    apiKey: config.clawpumpApiKey,
    model: config.clawpumpModel,
    playerWallet: key,
  });
  // Checked immediately after creation, before the agent is ever used or persisted as Active.
  await assertEmpty(connection, created.agentWallet);
  await db.battleAgent.create({
    data: {
      playerWallet: key,
      agentId: created.agentId,
      agentWallet: created.agentWallet,
      model: created.model,
      preset: 'monitor-exit',
      lastZeroBalanceCheck: new Date(),
    },
  });
  return { agentId: created.agentId, agentWallet: created.agentWallet };
}

/**
 * The chain is the authority on what an agent wallet holds, not the provider that created it.
 * Both token programs are checked, because a Token-2022 balance is just as much a balance.
 */
async function assertEmpty(connection: Connection, agentWallet: string): Promise<void> {
  await assertAgentWalletEmpty(agentWallet, async (wallet) => {
    const owner = new PublicKey(wallet);
    const lamports = await connection.getBalance(owner, 'confirmed');
    const [classic, token2022] = await Promise.all([
      connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_PROGRAM_ID }),
      connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_2022_PROGRAM_ID }),
    ]);
    return { lamports, tokenAccounts: classic.value.length + token2022.value.length };
  });
}

/**
 * Verify the stored strategy actually hashes to the commitment recorded on-chain, then build the
 * prompt.
 *
 * Recomputing here rather than trusting the database row is the point: the program stores only
 * the 32 bytes and never recomputes them, so this check is what ties the text an agent is about
 * to read to the text the player signed for. A mismatch means the row was tampered with, and the
 * player takes the maximum penalty rather than getting a strategy they never committed to.
 * `code.md` §5.3.
 */
export async function loadVerifiedStrategy(
  db: PrismaClient,
  matchPda: PublicKey,
  player: RoundPlayer,
): Promise<string | null> {
  const row = await db.strategyCommitment.findUnique({
    where: { commitment: player.commitment.toString('hex') },
  });
  if (!row) return null; // A player who never posted a strategy takes the maximum penalty.

  const { commitment } = computeCommitment({
    matchPda,
    player: player.wallet,
    salt: Buffer.from(row.salt, 'hex'),
    strategy: row.strategy,
  });
  if (!commitment.equals(player.commitment)) {
    throw new Error(
      `Stored strategy for ${player.wallet.toBase58()} does not hash to its on-chain commitment.`,
    );
  }
  return row.strategy;
}

export function buildPrompt(context: RoundContext, strategy: string | null): string {
  const schema = predictionContext(context);
  return [
    `Round ${context.round} of 3 in match ${context.matchPda.toBase58()}.`,
    '',
    'Benchmark facts (identical for both players):',
    JSON.stringify(schema, null, 2),
    '',
    'Return exactly one JSON object with these keys and no others:',
    'schemaVersion, matchId, round, benchmarkSymbol, benchmarkFeedId, observedPrice,',
    'observedExponent, observedPublishTime, targetPublishTime, predictedFinalPrice,',
    'confidenceBps, thesis.',
    '',
    'Echo every field above back unchanged. predictedFinalPrice is a positive decimal string at',
    `exponent ${context.observed.exponent}. confidenceBps is 0-10000. thesis is at most 280 bytes.`,
    'No markdown fences, no prose outside the object.',
    '',
    '<player_strategy>',
    strategy ?? '(The player supplied no strategy. Use your default judgement.)',
    '</player_strategy>',
  ].join('\n');
}

export function predictionContext(context: RoundContext): PredictionContext {
  return {
    matchId: context.matchPda.toBase58(),
    round: context.round as 0 | 1 | 2,
    benchmarkSymbol: context.benchmarkSymbol,
    benchmarkFeedId: context.benchmarkFeedId.startsWith('0x')
      ? context.benchmarkFeedId.toLowerCase()
      : `0x${context.benchmarkFeedId.toLowerCase()}`,
    observedPrice: context.observed.price,
    observedExponent: context.observed.exponent,
    observedPublishTime: context.observed.publishTime,
    targetPublishTime: context.targetPublishTime,
  };
}

/**
 * Both agents, concurrently, one attempt each.
 *
 * Already-recorded turns are reused rather than re-requested. That is what makes a *round job*
 * safely resumable without making a *chat* retryable: if the worker crashed after both agents
 * answered but before the on-chain submission landed, the next attempt re-submits the recorded
 * answers instead of spending credit to ask again — and gets the same result, because the answers
 * are what was recorded, not what a second call would have produced.
 */
export async function runRoundTurns(
  db: PrismaClient,
  config: WorkerConfig,
  connection: Connection,
  context: RoundContext,
  players: [RoundPlayer, RoundPlayer],
): Promise<[TurnRecord, TurnRecord]> {
  const matchKey = context.matchPda.toBase58();
  const recorded = await db.agentTurn.findMany({
    where: { matchPda: matchKey, round: context.round },
  });

  const results = await Promise.all(
    players.map(async (player): Promise<TurnRecord> => {
      const already = recorded.find((turn) => turn.playerIndex === player.index);
      if (already) {
        return { playerIndex: player.index, parsed: revive(already) };
      }

      const strategy = await loadVerifiedStrategy(db, context.matchPda, player);
      const prompt = buildPrompt(context, strategy);
      const promptHash = createHash('sha256').update(prompt, 'utf8').digest('hex');

      // Reserve before any non-idempotent call. A crash leaves a penalty, never permission
      // to ask the model again. The unique constraint arbitrates concurrent attempts.
      let reserved;
      try {
        reserved = await db.agentTurn.create({
          data: {
            matchPda: matchKey,
            round: context.round,
            playerIndex: player.index,
            promptHash,
            outcome: 'ApiError',
            errorCode: 'TurnInterrupted',
          },
        });
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002')
          throw error;
        const existing = await db.agentTurn.findUniqueOrThrow({
          where: {
            matchPda_round_playerIndex: {
              matchPda: matchKey,
              round: context.round,
              playerIndex: player.index,
            },
          },
        });
        return { playerIndex: player.index, parsed: revive(existing) };
      }

      let agentPlayerWallet: string | null = null;
      let turn: AgentTurnResult = {
        parsed: { outcome: 'malformed', reason: 'MissingStrategy' },
        sanitizedResponse: null,
        requestId: null,
      };
      if (strategy !== null) {
        try {
          const agent = await ensureAgent(db, config, connection, player.wallet);
          agentPlayerWallet = player.wallet.toBase58();
          turn = await requestPrediction({
            baseUrl: config.clawpumpBaseUrl,
            apiKey: config.clawpumpApiKey,
            model: config.clawpumpModel,
            agentId: agent.agentId,
            prompt,
            context: predictionContext(context),
          });
        } catch (error) {
          turn = {
            parsed: { outcome: 'apiError', reason: summarize(String((error as Error).message)) },
            sanitizedResponse: null,
            requestId: null,
          };
        }
      }

      await db.agentTurn.update({
        where: { id: reserved.id },
        data: {
          matchPda: matchKey,
          round: context.round,
          playerIndex: player.index,
          agentPlayerWallet,
          promptHash,
          sanitizedResponse: turn.sanitizedResponse,
          responseHash: turn.sanitizedResponse
            ? createHash('sha256').update(turn.sanitizedResponse, 'utf8').digest('hex')
            : null,
          // Prisma distinguishes "SQL NULL" from "absent"; `Prisma.DbNull` is the explicit null
          // a nullable Json column wants, and `undefined` is not accepted under
          // exactOptionalPropertyTypes.
          parsedPrediction:
            turn.parsed.outcome === 'valid'
              ? (turn.parsed.prediction as Prisma.InputJsonValue)
              : Prisma.DbNull,
          outcome:
            turn.parsed.outcome === 'valid'
              ? 'Valid'
              : turn.parsed.outcome === 'timeout'
                ? 'Timeout'
                : turn.parsed.outcome === 'apiError'
                  ? 'ApiError'
                  : 'Malformed',
          errorCode: turn.parsed.outcome === 'valid' ? null : turn.parsed.reason.slice(0, 200),
          requestId: turn.requestId,
        },
      });

      return { playerIndex: player.index, parsed: turn.parsed };
    }),
  );

  const byIndex = (index: number): TurnRecord => {
    const found = results.find((r) => r.playerIndex === index);
    if (!found) throw new Error(`No turn produced for player ${index}.`);
    return found;
  };
  return [byIndex(0), byIndex(1)];
}

function revive(turn: { outcome: string; parsedPrediction: unknown }): ParsedPrediction {
  if (turn.outcome === 'Valid' && turn.parsedPrediction) {
    return { outcome: 'valid', prediction: turn.parsedPrediction as never };
  }
  const outcome =
    turn.outcome === 'Timeout'
      ? 'timeout'
      : turn.outcome === 'Malformed'
        ? 'malformed'
        : 'apiError';
  return { outcome, reason: 'Recorded on a previous attempt.' };
}
