import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma, type PrismaClient } from '@prisma/client';
import { Keypair, type Connection } from '@solana/web3.js';
import { computeCommitment } from '@stock-arena/shared';
import { requestPrediction, createBattleAgent } from '@stock-arena/integrations';
import { runRoundTurns, type RoundContext, type RoundPlayer } from '../src/agents.js';
import type { WorkerConfig } from '../src/config.js';

vi.mock('@stock-arena/integrations', () => ({
  assertAgentWalletEmpty: vi.fn(),
  createBattleAgent: vi.fn(),
  requestPrediction: vi.fn(),
  summarize: (value: string) => value,
}));

const context: RoundContext = {
  matchPda: Keypair.generate().publicKey,
  round: 0,
  observed: { price: '100', conf: '1', exponent: -5, publishTime: 1000 },
  targetPublishTime: 1540,
  benchmarkSymbol: 'Equity.US.NVDA/USD',
  benchmarkFeedId: 'ab'.repeat(32),
};
const strategy = 'Predict the current price';
const salt = Buffer.alloc(32, 7);
const players = [0, 1].map((index) => {
  const wallet = Keypair.generate().publicKey;
  return {
    wallet,
    index,
    commitment: computeCommitment({ matchPda: context.matchPda, player: wallet, salt, strategy })
      .commitment,
  };
}) as [RoundPlayer, RoundPlayer];
const config = {} as WorkerConfig;
const connection = {} as Connection;

function database(missingStrategy = false) {
  const rows: Record<string, unknown>[] = [];
  const fake = {
    strategyCommitment: {
      findUnique: vi.fn(async () =>
        missingStrategy ? null : { strategy, salt: salt.toString('hex') },
      ),
    },
    battleAgent: {
      findUnique: vi.fn(async () => ({
        status: 'Active',
        agentId: 'agent',
        agentWallet: Keypair.generate().publicKey.toBase58(),
      })),
      update: vi.fn(),
    },
    agentTurn: {
      findMany: vi.fn(async () => rows.map((row) => ({ ...row }))),
      create: vi.fn(async ({ data }) => {
        if (rows.some((row) => row.playerIndex === data.playerIndex)) {
          throw new Prisma.PrismaClientKnownRequestError('duplicate', {
            code: 'P2002',
            clientVersion: '6',
          });
        }
        const row = { id: String(data.playerIndex), ...data };
        rows.push(row);
        return row;
      }),
      findUniqueOrThrow: vi.fn(async ({ where }) =>
        rows.find((row) => row.playerIndex === where.matchPda_round_playerIndex.playerIndex),
      ),
      update: vi.fn(async ({ where, data }) => {
        const row = rows.find((candidate) => candidate.id === where.id)!;
        Object.assign(row, data);
        return row;
      }),
    },
  };
  return { fake, rows, db: fake as unknown as PrismaClient };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requestPrediction).mockResolvedValue({
    parsed: { outcome: 'timeout', reason: 'timeout' },
    sanitizedResponse: null,
    requestId: 'request',
  });
});

describe('durable agent turns', () => {
  it('penalizes absent strategies without creating agents or spending chat credits', async () => {
    const { db, rows } = database(true);
    const turns = await runRoundTurns(db, config, connection, context, players);
    expect(turns.map((turn) => turn.parsed.outcome)).toEqual(['malformed', 'malformed']);
    expect(requestPrediction).not.toHaveBeenCalled();
    expect(createBattleAgent).not.toHaveBeenCalled();
    expect(rows).toHaveLength(2);
    expect(
      rows.every((row) => row.agentPlayerWallet === null && row.errorCode === 'MissingStrategy'),
    ).toBe(true);
  });

  it('reserves both turns before concurrent chat and reuses completed results', async () => {
    const { db, rows } = database();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.mocked(requestPrediction).mockImplementation(async () => {
      expect(rows).toHaveLength(2);
      await gate;
      return {
        parsed: { outcome: 'timeout', reason: 'timeout' },
        sanitizedResponse: null,
        requestId: 'request',
      };
    });
    const running = runRoundTurns(db, config, connection, context, players);
    await vi.waitFor(() => expect(requestPrediction).toHaveBeenCalledTimes(2));
    release();
    await running;
    await runRoundTurns(db, config, connection, context, players);
    expect(requestPrediction).toHaveBeenCalledTimes(2);
  });

  it('never calls chat again when saving the first responses fails', async () => {
    const { db, fake, rows } = database();
    fake.agentTurn.update.mockRejectedValue(new Error('database disconnected'));
    await expect(runRoundTurns(db, config, connection, context, players)).rejects.toThrow(
      'database disconnected',
    );
    expect(rows.every((row) => row.errorCode === 'TurnInterrupted')).toBe(true);
    const resumed = await runRoundTurns(db, config, connection, context, players);
    expect(resumed.map((turn) => turn.parsed.outcome)).toEqual(['apiError', 'apiError']);
    expect(requestPrediction).toHaveBeenCalledTimes(2);
  });
});
