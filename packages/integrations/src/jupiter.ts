import { z } from 'zod';

import { fetchJson } from './http.js';

/** Jupiter's public price API. Verified 24 Sep 2026 for the AAPLX and OPENAI mainnet mints. */
export const JUPITER_PRICE_URL = 'https://lite-api.jup.ag/price/v3';

/** Kept as strings: shown to people and cut to quote decimals, never used in float arithmetic. */
const priceLike = z.union([z.number(), z.string()]).transform((v) => String(v));

const entrySchema = z
  .object({
    usdPrice: priceLike,
    liquidity: priceLike.optional(),
    stockData: z.object({ price: priceLike.optional() }).passthrough().optional(),
  })
  .passthrough();

// A mint Jupiter cannot price comes back missing or null; that is not an error for the others.
const responseSchema = z.record(z.string(), entrySchema.nullable());

export interface MainnetPrice {
  /** Last traded USD price on Solana mainnet DEXs. */
  usdPrice: string;
  liquidity?: string;
  /** The issuer's own reference price for the underlying stock, when Jupiter carries one. */
  referencePrice?: string;
}

export async function fetchMainnetPrices(
  mints: string[],
  options: { url?: string; timeoutMs?: number } = {},
): Promise<Record<string, MainnetPrice>> {
  if (mints.length === 0) return {};
  const raw = await fetchJson({
    provider: 'jupiter',
    url: `${options.url ?? JUPITER_PRICE_URL}?ids=${mints.map(encodeURIComponent).join(',')}`,
    schema: responseSchema,
    retries: 2,
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
  });
  return toMainnetPrices(raw);
}

export function toMainnetPrices(
  raw: z.output<typeof responseSchema>,
): Record<string, MainnetPrice> {
  return Object.fromEntries(
    Object.entries(raw).flatMap(([mint, entry]) =>
      entry
        ? [
            [
              mint,
              {
                usdPrice: entry.usdPrice,
                ...(entry.liquidity === undefined ? {} : { liquidity: entry.liquidity }),
                ...(entry.stockData?.price === undefined
                  ? {}
                  : { referencePrice: entry.stockData.price }),
              },
            ],
          ]
        : [],
    ),
  );
}
