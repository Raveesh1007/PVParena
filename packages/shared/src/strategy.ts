import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { PublicKey } from '@solana/web3.js';
import { MAX_STRATEGY_BYTES, STRATEGY_SALT_BYTES } from './constants.js';

export const STRATEGY_DOMAIN = 'stock-arena:strategy:v1';

export class StrategyError extends Error {}

/**
 * Normalize strategy text: NFKC, CRLF -> LF, trim, then bound the length.
 * Order matters — trimming after newline folding keeps a trailing "\r\n" from surviving as "\n".
 */
export function normalizeStrategy(raw: string): string {
  const normalized = raw.normalize('NFKC').replace(/\r\n/g, '\n').trim();
  if (normalized.length === 0) throw new StrategyError('Strategy must not be empty.');
  const bytes = Buffer.byteLength(normalized, 'utf8');
  if (bytes > MAX_STRATEGY_BYTES) {
    throw new StrategyError(
      `Strategy is ${bytes} UTF-8 bytes; the maximum is ${MAX_STRATEGY_BYTES}.`,
    );
  }
  return normalized;
}

export function generateSalt(): Buffer {
  return randomBytes(STRATEGY_SALT_BYTES);
}

export interface CommitmentInput {
  matchPda: PublicKey;
  player: PublicKey;
  salt: Uint8Array;
  /** Raw text; it is normalized here so callers cannot skip that step. */
  strategy: string;
}

/**
 * sha256(domain || match_pda || player || salt_32 || normalized_strategy_utf8).
 * The salt is mandatory: without it the preset strategies could be brute-forced by hashing each
 * preset and comparing against an on-chain commitment before joining.
 */
export function computeCommitment(input: CommitmentInput): {
  commitment: Buffer;
  normalizedStrategy: string;
} {
  if (input.salt.length !== STRATEGY_SALT_BYTES) {
    throw new StrategyError(`Salt must be exactly ${STRATEGY_SALT_BYTES} bytes.`);
  }
  const normalizedStrategy = normalizeStrategy(input.strategy);
  const commitment = createHash('sha256')
    .update(Buffer.from(STRATEGY_DOMAIN, 'utf8'))
    .update(input.matchPda.toBytes())
    .update(input.player.toBytes())
    .update(input.salt)
    .update(Buffer.from(normalizedStrategy, 'utf8'))
    .digest();
  return { commitment, normalizedStrategy };
}

/** Constant-time compare of a recomputed commitment against the one recorded on-chain. */
export function commitmentMatches(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
