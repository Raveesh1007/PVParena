import { z } from 'zod';

import { fetchJson } from './http.js';

const priceSchema = z.object({
  price: z.string().regex(/^-?\d+$/),
  conf: z.string().regex(/^\d+$/),
  expo: z.number().int(),
  publish_time: z.number().int(),
});

const parsedSchema = z.object({
  id: z.string().regex(/^[0-9a-f]{64}$/i),
  price: priceSchema,
  ema_price: priceSchema.optional(),
});

const updatesSchema = z.object({
  binary: z.object({
    encoding: z.literal('base64'),
    data: z.array(z.string().min(1)),
  }),
  parsed: z.array(parsedSchema).optional(),
});

export interface HermesPrice {
  /** 32-byte Core feed ID, lowercase hex without the `0x` prefix. */
  feedId: string;
  /** Mantissa as a decimal string; never parsed into a float. */
  price: string;
  conf: string;
  exponent: number;
  publishTime: number;
  /** The signed update blobs, base64, to be posted to the receiver program. */
  binary: string[];
}

export interface HermesClientOptions {
  /** e.g. `https://pyth.dourolabs.app/hermes` */
  baseUrl: string;
  /** Required since the Core upgrade. Never logged, never sent to the browser. */
  apiKey: string;
  timeoutMs?: number;
}

/**
 * Fetch the latest update for one feed.
 *
 * `feedId` must be the 32-byte Core ID. A Pyth **Terminal** identifier such as 1314 (NVDA) or 922
 * (AAPL) is a Pro/Lazer identifier for an entirely different product and will silently fetch
 * nothing useful, so it is rejected here rather than at settlement time. `code.md` §3.2.
 */
export async function fetchLatestPrice(
  options: HermesClientOptions & { feedId: string },
): Promise<HermesPrice> {
  const feedId = normalizeFeedId(options.feedId);
  const url = `${options.baseUrl.replace(/\/$/, '')}/v2/updates/price/latest?ids[]=0x${feedId}&encoding=base64&parsed=true`;

  const response = await fetchJson({
    provider: 'hermes',
    url,
    schema: updatesSchema,
    headers: { authorization: `Bearer ${options.apiKey}` },
    // A read-only GET, so a bounded retry is safe and avoids failing a match over one blip.
    retries: 2,
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
  });

  const parsed = response.parsed?.find((entry) => normalizeFeedId(entry.id) === feedId);
  if (!parsed) {
    throw new Error(
      `Hermes returned no parsed price for feed 0x${feedId}. Check that this is the 32-byte Core ` +
        'ID from the official catalogue and not a Terminal/Lazer identifier.',
    );
  }
  if (response.binary.data.length === 0) {
    throw new Error(`Hermes returned no binary update for feed 0x${feedId}; nothing to post.`);
  }

  return {
    feedId,
    price: parsed.price.price,
    conf: parsed.price.conf,
    exponent: parsed.price.expo,
    publishTime: parsed.price.publish_time,
    binary: response.binary.data,
  };
}

/**
 * Whether a price is too old to open new matches on.
 *
 * This is the **courtesy** check only — the off-chain half of `code.md` §5.2. The authoritative
 * staleness guard is the freshness check inside `activate_match`, which cannot be bypassed by a
 * client. There is deliberately no market-session subsystem behind this: no holiday calendar, no
 * timezone handling, and above all no computed reopening time, because the benchmark publishes
 * 24/5 and a weekend gap is simply a stale price.
 */
export function isStale(price: HermesPrice, maxAgeSeconds: number, nowSeconds: number): boolean {
  return nowSeconds - price.publishTime > maxAgeSeconds;
}

/** The exact sentence to show when the feed is stale. Never accompanied by a reopening time. */
export const STALE_FEED_MESSAGE =
  'Benchmark updates are currently stale. New matches are temporarily unavailable.';

function normalizeFeedId(id: string): string {
  const body = (id.startsWith('0x') || id.startsWith('0X') ? id.slice(2) : id).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(body)) {
    throw new Error(
      `"${id}" is not a 32-byte Pyth Core feed ID. Terminal identifiers such as 1314 or 922 are ` +
        'Pro/Lazer IDs and must never be used here. `code.md` §3.2.',
    );
  }
  return body;
}
