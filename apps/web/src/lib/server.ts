import 'server-only';

import { AnchorProvider, Program } from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { PrismaClient } from '@prisma/client';
import { IDL, PROGRAM_ID, type StockArena, configPda } from '@stock-arena/idl';
import { loadArenaRegistry, optional, required } from '@stock-arena/integrations';

/**
 * A read-only provider. It holds a throwaway keypair purely because Anchor requires a wallet to
 * construct a `Program`; nothing is ever signed with it, and it is generated per process so it
 * cannot accidentally accumulate a balance or become an authority.
 */
function readOnlyProvider(connection: Connection): AnchorProvider {
  const placeholder = Keypair.generate();
  return new AnchorProvider(
    connection,
    {
      publicKey: placeholder.publicKey,
      signTransaction: () => Promise.reject(new Error('The web app never signs transactions.')),
      signAllTransactions: () => Promise.reject(new Error('The web app never signs transactions.')),
    },
    { commitment: 'confirmed' },
  );
}

let cachedProgram: Program<StockArena> | undefined;

export function program(): Program<StockArena> {
  if (!cachedProgram) {
    const connection = new Connection(required('SOLANA_RPC_URL'), 'confirmed');
    cachedProgram = new Program<StockArena>(IDL, readOnlyProvider(connection));
  }
  return cachedProgram;
}

export const protocolConfigPda = (): PublicKey => configPda(PROGRAM_ID);

/**
 * A read-only connection to **mainnet**, used for one thing: showing a player the PreStocks
 * assets they really hold, so the Arena picker can say "you hold SPACEX on mainnet". It never
 * moves value and its balances are never a trusted price or an input to any program decision.
 * `code.md` §3.1.
 */
let cachedMainnet: Connection | undefined;

export function mainnetConnection(): Connection {
  if (!cachedMainnet) {
    cachedMainnet = new Connection(required('SOLANA_MAINNET_RPC_URL'), 'confirmed');
  }
  return cachedMainnet;
}

// Next's dev server re-evaluates modules on every edit, which would otherwise open a new pool of
// database connections each time until Postgres refuses more.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function db(): PrismaClient {
  if (!globalForPrisma.prisma) globalForPrisma.prisma = new PrismaClient();
  return globalForPrisma.prisma;
}

export const arenaRegistry = () =>
  loadArenaRegistry(optional('ARENAS_CONFIG_PATH', 'config/arenas.json'));

/**
 * Constant-time-ish comparison for the internal shared secrets.
 *
 * These guard the routes the worker calls. They are compared without an early return on the first
 * differing byte so the check does not leak the secret's prefix through timing — a small thing,
 * but the alternative costs nothing.
 */
export function secretMatches(provided: string | null, expected: string): boolean {
  if (provided === null || provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

export function requireInternalSecret(request: Request, envName: string): Response | null {
  const expected = process.env[envName];
  if (!expected) {
    return Response.json({ error: `${envName} is not configured.` }, { status: 503 });
  }
  const provided = request.headers.get('authorization')?.replace(/^Bearer /, '') ?? null;
  if (!secretMatches(provided, expected)) {
    return Response.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  return null;
}

/** Parse a base58 public key from a route parameter, or answer 400 rather than throwing a 500. */
export function parsePubkey(value: string): PublicKey | null {
  try {
    return new PublicKey(value);
  } catch {
    return null;
  }
}
