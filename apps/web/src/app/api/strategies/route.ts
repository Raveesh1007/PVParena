import { PublicKey } from '@solana/web3.js';
import { MAX_STRATEGY_BYTES, STRATEGY_SALT_BYTES, computeCommitment } from '@stock-arena/shared';
import { z } from 'zod';

import { db } from '@/lib/server';

export const dynamic = 'force-dynamic';

const bodySchema = z
  .object({
    matchPda: z.string().min(32).max(44),
    playerWallet: z.string().min(32).max(44),
    strategy: z
      .string()
      .min(1)
      .max(MAX_STRATEGY_BYTES * 4),
    salt: z.string().regex(/^[0-9a-f]{64}$/i, 'Salt must be 32 bytes of hex.'),
  })
  .strict();

export async function POST(request: Request): Promise<Response> {
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

  let matchPda: PublicKey;
  let playerWallet: PublicKey;
  try {
    matchPda = new PublicKey(parsed.data.matchPda);
    playerWallet = new PublicKey(parsed.data.playerWallet);
  } catch {
    return Response.json({ error: 'matchPda and playerWallet must be base58.' }, { status: 400 });
  }

  const salt = Buffer.from(parsed.data.salt, 'hex');
  if (salt.length !== STRATEGY_SALT_BYTES) {
    return Response.json({ error: `Salt must be ${STRATEGY_SALT_BYTES} bytes.` }, { status: 400 });
  }

  let commitment: Buffer;
  let normalizedStrategy: string;
  try {
    // Derived here, never taken from the request.
    ({ commitment, normalizedStrategy } = computeCommitment({
      matchPda,
      player: playerWallet,
      salt,
      strategy: parsed.data.strategy,
    }));
  } catch (error) {
    return Response.json({ error: String((error as Error).message) }, { status: 400 });
  }

  const key = commitment.toString('hex');
  const existing = await db().strategyCommitment.findUnique({ where: { commitment: key } });
  if (existing) {
    const identical =
      existing.strategy === normalizedStrategy &&
      existing.salt.toLowerCase() === parsed.data.salt.toLowerCase();
    // A retry of the same submission succeeds; anything else is an attempt to rewrite history.
    return identical
      ? Response.json({ commitment: key, stored: false })
      : Response.json({ error: 'This commitment is already stored.' }, { status: 409 });
  }

  await db().strategyCommitment.create({
    data: {
      commitment: key,
      matchPda: matchPda.toBase58(),
      playerWallet: playerWallet.toBase58(),
      strategy: normalizedStrategy,
      salt: parsed.data.salt.toLowerCase(),
      byteLength: Buffer.byteLength(normalizedStrategy, 'utf8'),
    },
  });

  return Response.json({ commitment: key, stored: true }, { status: 201 });
}
