import { z } from 'zod';

import { fetchJson } from './http.js';

export const PRESTOCKS_SYMBOLS = [
  'ANDURIL',
  'ANTHROPIC',
  'FIGUREAI',
  'KALSHI',
  'NEURALINK',
  'OPENAI',
  'POLYMARKET',
  'SPACEX',
] as const;

export type PreStocksSymbol = (typeof PRESTOCKS_SYMBOLS)[number];

/**
 * Prices arrive as numbers or numeric strings depending on the field, and are kept as strings
 * here. They are shown to humans, never used in arithmetic that decides anything, so converting
 * them to floats would add a precision hazard for no benefit.
 */
const priceLike = z.union([z.number(), z.string()]).transform((v) => String(v));

const tokenSchema = z
  .object({
    name: z.string().min(1),
    symbol: z.string().min(1),
    contract_address: z.string().min(32).max(64),
    markPrice: priceLike.optional(),
    tokenPrice: priceLike.optional(),
  })
  // Not strict: PreStocks may add fields, and an unknown extra field is not a reason to take the
  // whole Arena picker down. The fields we depend on are all required above.
  .passthrough();

const responseSchema = z.union([
  z.array(tokenSchema),
  z.object({ data: z.array(tokenSchema) }),
  z.object({ tokens: z.array(tokenSchema) }),
]);

export interface PreStocksToken {
  name: string;
  symbol: string;
  /** The mainnet mint as the API reports it. Must be verified over mainnet RPC before use. */
  mainnetMint: string;
  markPrice?: string;
  tokenPrice?: string;
}

export interface PreStocksSnapshot {
  tokens: PreStocksToken[];
  /** When this snapshot was retrieved, so the UI can show its age rather than implying it is live. */
  retrievedAt: Date;
}

export async function fetchPreStocks(options: {
  url: string;
  timeoutMs?: number;
}): Promise<PreStocksSnapshot> {
  const raw = await fetchJson({
    provider: 'prestocks',
    url: options.url,
    schema: responseSchema,
    // A safe, unauthenticated GET, so a transient failure is worth one or two retries rather than
    // blanking the Arena picker.
    retries: 2,
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
  });

  const list = Array.isArray(raw) ? raw : 'data' in raw ? raw.data : raw.tokens;
  return {
    tokens: list.map((token) => ({
      name: token.name,
      symbol: token.symbol,
      mainnetMint: token.contract_address,
      ...(token.markPrice === undefined ? {} : { markPrice: String(token.markPrice) }),
      ...(token.tokenPrice === undefined ? {} : { tokenPrice: String(token.tokenPrice) }),
    })),
    retrievedAt: new Date(),
  };
}

export function findToken(snapshot: PreStocksSnapshot, symbol: string): PreStocksToken | undefined {
  const wanted = symbol.toUpperCase();
  return snapshot.tokens.find((token) => token.symbol.toUpperCase() === wanted);
}
