import { db, requireInternalSecret } from '@/lib/server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const denied = requireInternalSecret(request, 'INTERNAL_WORKER_SECRET');
  if (denied) return denied;
  return status();
}

export async function GET(request: Request): Promise<Response> {
  const denied = requireInternalSecret(request, 'INTERNAL_WORKER_SECRET');
  if (denied) return denied;
  return status();
}

async function status(): Promise<Response> {
  const now = new Date();
  const [byStatus, stuck, recentFailures, lastActivity] = await Promise.all([
    db().orchestrationJob.groupBy({ by: ['status'], _count: { _all: true } }),
    // A lease that has outlived its expiry means a worker died mid-job. The next tick takes it
    // over, so this is a symptom to watch rather than an error — unless it never clears.
    db().orchestrationJob.count({
      where: { status: 'Leased', leaseExpiry: { lt: now } },
    }),
    db().orchestrationJob.findMany({
      where: { status: 'Failed' },
      orderBy: { updatedAt: 'desc' },
      take: 10,
      select: { idempotencyKey: true, type: true, errorSummary: true, updatedAt: true },
    }),
    db().orchestrationJob.findFirst({
      orderBy: { updatedAt: 'desc' },
      select: { updatedAt: true },
    }),
  ]);

  return Response.json({
    note: 'Status only. Orchestration runs in apps/worker, never here. code.md §2.',
    jobs: Object.fromEntries(byStatus.map((row) => [row.status, row._count._all])),
    expiredLeases: stuck,
    lastJobActivity: lastActivity?.updatedAt ?? null,
    // Already sanitized when written: no secrets, no raw upstream bodies.
    recentFailures,
  });
}
