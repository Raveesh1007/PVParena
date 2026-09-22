import { afterEach, expect, it, vi } from 'vitest';
import { Prisma, type PrismaClient } from '@prisma/client';
import { withJobLease } from '../src/jobs.js';

afterEach(() => vi.useRealTimers());

it('an expired worker cannot complete the lease now owned by another worker', async () => {
  vi.useFakeTimers();
  let row: { status: string; leaseOwner: string | null; leaseExpiry: Date | null } | undefined;
  const db = {
    orchestrationJob: {
      create: vi.fn(async ({ data }) => {
        if (row)
          throw new Prisma.PrismaClientKnownRequestError('duplicate', {
            code: 'P2002',
            clientVersion: '6',
          });
        row = data;
      }),
      updateMany: vi.fn(async ({ where, data }) => {
        if (!row) return { count: 0 };
        if (where.OR) {
          if (!row.leaseExpiry || row.leaseExpiry >= new Date()) return { count: 0 };
        } else if (where.leaseOwner !== row.leaseOwner || where.status !== row.status) {
          return { count: 0 };
        }
        Object.assign(row, data);
        return { count: 1 };
      }),
    },
  };
  const spec = { key: 'round:match:0', type: 'SubmitRound' as const, matchPda: 'match', round: 0 };
  let finishOld!: () => void;
  let finishNew!: () => void;
  const oldGate = new Promise<void>((resolve) => {
    finishOld = resolve;
  });
  const newGate = new Promise<void>((resolve) => {
    finishNew = resolve;
  });
  const old = withJobLease(db as unknown as PrismaClient, spec, async () => {
    await oldGate;
    return 'done';
  });
  await Promise.resolve();
  vi.advanceTimersByTime(5 * 60_000 + 1);
  const newer = withJobLease(db as unknown as PrismaClient, spec, async () => {
    await newGate;
    return 'done';
  });
  await Promise.resolve();
  await Promise.resolve();
  const newOwner = row!.leaseOwner;
  finishOld();
  await old;
  expect(row!.status).toBe('Leased');
  expect(row!.leaseOwner).toBe(newOwner);
  finishNew();
  await newer;
  expect(row!.status).toBe('Succeeded');
});
