import 'server-only';

import { STALE_FEED_MESSAGE, fetchLatestPrice, isStale, optional } from '@stock-arena/integrations';

import { arenaRegistry } from './server';

export interface BenchmarkView {
  symbol: string;
  coreFeedId: string;
  price: string | null;
  confidence: string | null;
  exponent: number;
  publishTime: number | null;
  stale: boolean;
  message: string | null;
}

/** The one freshness check every page and route shares, so none can disagree about staleness. */
export async function loadBenchmark(): Promise<BenchmarkView> {
  const { benchmark } = arenaRegistry();
  try {
    const latest = await fetchLatestPrice({
      baseUrl: optional('PYTH_HERMES_URL', 'https://pyth.dourolabs.app/hermes'),
      apiKey: process.env.PYTH_API_KEY ?? '',
      feedId: optional('PYTH_BENCHMARK_FEED_ID', benchmark.coreFeedId),
    });
    const stale = isStale(
      latest,
      Number(optional('BENCHMARK_MAX_AGE_SECONDS', '60')),
      Math.floor(Date.now() / 1000),
    );
    return {
      symbol: benchmark.symbol,
      coreFeedId: `0x${latest.feedId}`,
      price: latest.price,
      confidence: latest.conf,
      exponent: latest.exponent,
      publishTime: latest.publishTime,
      stale,
      message: stale ? STALE_FEED_MESSAGE : null,
    };
  } catch {
    // Unreachable and stale look the same to a player: no new matches either way, and no guess
    // about when that changes. The upstream error is not surfaced — it can echo the API key.
    return {
      symbol: benchmark.symbol,
      coreFeedId: benchmark.coreFeedId,
      price: null,
      confidence: null,
      exponent: benchmark.exponent,
      publishTime: null,
      stale: true,
      message: STALE_FEED_MESSAGE,
    };
  }
}
