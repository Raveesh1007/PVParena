import { randomUUID } from 'node:crypto';
import { type JobType, type PrismaClient, Prisma } from '@prisma/client';
import { summarize } from '@stock-arena/integrations';

const LEASE_MS = 5 * 60_000;

export const jobKeys = {
  activate: (matchPda: string) => `activate:${matchPda}`,
  round: (matchPda: string, round: number) => `round:${matchPda}:${round}`,
  settle: (matchPda: string) => `settle:${matchPda}`,
  markOracleFailure: (matchPda: string) => `oracle-failure:${matchPda}`,
} as const;

export interface JobSpec {
  key: string;
  type: JobType;
  matchPda: string;
  round?: number;
}

export type JobResult = 'done' | 'skipped' | 'retry';

/**
 * Run `work` at most once per key, under a lease.
 *
 * Returning `'retry'` from `work` means "this did not finish, and re-running it is safe" — a
 * confirmation that timed out, an RPC blip. Throwing means it failed in a way that is **not**
 * safe to repeat, and the job is marked terminally failed with a sanitized summary. That
 * asymmetry is deliberate: `code.md` §9 forbids blind-retrying a ClawPump chat, so the default
 * for an unexpected error is to stop, not to try again.
 */
export async function withJobLease(
  db: PrismaClient,
  spec: JobSpec,
  work: () => Promise<JobResult>,
): Promise<JobResult> {
  const owner = `${process.pid}:${randomUUID().slice(0, 8)}`;
  const now = new Date();
  const leaseExpiry = new Date(now.getTime() + LEASE_MS);

  try {
    await db.orchestrationJob.create({
      data: {
        idempotencyKey: spec.key,
        type: spec.type,
        matchPda: spec.matchPda,
        round: spec.round ?? null,
        status: 'Leased',
        attempts: 1,
        leaseOwner: owner,
        leaseExpiry,
      },
    });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
      throw error;
    }
    // Somebody already owns this key. Take it over only if it is pending or its lease has
    // lapsed; a finished job — succeeded or terminally failed — is never re-run.
    const claimed = await db.orchestrationJob.updateMany({
      where: {
        idempotencyKey: spec.key,
        OR: [
          { status: 'Pending', nextAttempt: { lte: now } },
          { status: 'Leased', leaseExpiry: { lt: now } },
        ],
      },
      data: { status: 'Leased', leaseOwner: owner, leaseExpiry, attempts: { increment: 1 } },
    });
    if (claimed.count === 0) return 'skipped';
  }

  try {
    const result = await work();
    await db.orchestrationJob.updateMany({
      where: { idempotencyKey: spec.key, status: 'Leased', leaseOwner: owner },
      data:
        result === 'retry'
          ? {
              status: 'Pending',
              leaseOwner: null,
              leaseExpiry: null,
              nextAttempt: new Date(Date.now() + 15_000),
            }
          : { status: 'Succeeded', leaseOwner: null, leaseExpiry: null },
    });
    return result;
  } catch (error) {
    await db.orchestrationJob.updateMany({
      where: { idempotencyKey: spec.key, status: 'Leased', leaseOwner: owner },
      data: {
        status: 'Failed',
        leaseOwner: null,
        leaseExpiry: null,
        errorSummary: summarize(String((error as Error)?.message ?? error)),
      },
    });
    throw error;
  }
}
