import { z } from 'zod';

import { db, requireInternalSecret } from '@/lib/server';

export const dynamic = 'force-dynamic';

const bodySchema = z
  .object({
    provider: z.string().min(1),
    checkType: z.string().min(1),
    network: z.enum(['devnet', 'mainnet', 'offchain']),
    result: z.enum(['Pass', 'Fail', 'Blocker']),
    identifiers: z.record(z.string()).default({}),
    hashes: z.record(z.string()).default({}),
    signature: z.string().optional(),
    notes: z.string().max(2_000).optional(),
  })
  .strict();

export async function POST(request: Request): Promise<Response> {
  const denied = requireInternalSecret(request, 'INTERNAL_WORKER_SECRET');
  if (denied) return denied;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: 'Body must be JSON.' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') },
      { status: 400 },
    );
  }

  const evidence = await db().integrationEvidence.create({
    data: {
      provider: parsed.data.provider,
      checkType: parsed.data.checkType,
      network: parsed.data.network,
      identifiers: parsed.data.identifiers,
      hashes: parsed.data.hashes,
      signature: parsed.data.signature ?? null,
      result: parsed.data.result,
      notes: parsed.data.notes ?? null,
    },
  });

  return Response.json({ id: evidence.id, observedAt: evidence.observedAt }, { status: 201 });
}

export async function GET(request: Request): Promise<Response> {
  const denied = requireInternalSecret(request, 'INTERNAL_WORKER_SECRET');
  if (denied) return denied;

  const rows = await db().integrationEvidence.findMany({
    orderBy: { observedAt: 'desc' },
    take: 200,
  });
  return Response.json({ evidence: rows });
}
