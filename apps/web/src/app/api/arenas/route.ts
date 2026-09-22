import { PublicKey } from '@solana/web3.js';
import { arenaPda, parseFeedId } from '@stock-arena/idl';
import {
  STALE_FEED_MESSAGE,
  fetchLatestPrice,
  isStale,
  optional,
  playableArenas,
} from '@stock-arena/integrations';

import { arenaRegistry, program } from '@/lib/server';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const registry = arenaRegistry();
  const playable = playableArenas(registry);

  let benchmark: {
    symbol: string;
    coreFeedId: string;
    price: string | null;
    exponent: number;
    publishTime: number | null;
    stale: boolean;
    message: string | null;
  };

  try {
    const feedId = optional('PYTH_BENCHMARK_FEED_ID', registry.benchmark.coreFeedId);
    const latest = await fetchLatestPrice({
      baseUrl: optional('PYTH_HERMES_URL', 'https://pyth.dourolabs.app/hermes'),
      apiKey: process.env.PYTH_API_KEY ?? '',
      feedId,
    });
    const maxAge = Number(optional('BENCHMARK_MAX_AGE_SECONDS', '60'));
    const stale = isStale(latest, maxAge, Math.floor(Date.now() / 1000));
    benchmark = {
      symbol: registry.benchmark.symbol,
      coreFeedId: latest.feedId,
      price: latest.price,
      exponent: latest.exponent,
      publishTime: latest.publishTime,
      stale,
      message: stale ? STALE_FEED_MESSAGE : null,
    };
  } catch {
    // An unreachable Hermes is indistinguishable from a stale feed as far as the player is
    // concerned: either way new matches are unavailable, and either way we do not guess when that
    // will change. The upstream error is deliberately not surfaced — it can echo the API key.
    benchmark = {
      symbol: registry.benchmark.symbol,
      coreFeedId: registry.benchmark.coreFeedId,
      price: null,
      exponent: registry.benchmark.exponent,
      publishTime: null,
      stale: true,
      message: STALE_FEED_MESSAGE,
    };
  }

  const feedBytes =
    registry.benchmark.coreFeedId === '' ? null : parseFeedId(registry.benchmark.coreFeedId);

  const arenas = await Promise.all(
    playable.map(async (entry) => {
      const devnetMint = new PublicKey(entry.devnetTestMint);
      const pda = feedBytes ? arenaPda(devnetMint, feedBytes) : null;
      const account = pda ? await program().account.arena.fetchNullable(pda) : null;
      return {
        symbol: entry.symbol,
        /** The real asset on mainnet. Display and eligibility only; never escrowed. */
        mainnetMint: entry.mainnetMint,
        /** The devnet test copy. This is what create_match and join_match actually move. */
        devnetTestMint: entry.devnetTestMint,
        arenaPda: pda?.toBase58() ?? null,
        /** Null means the Arena is configured but not yet created on-chain. */
        deployed: account !== null,
        active: account?.active ?? false,
      };
    }),
  );

  return Response.json({
    network: 'devnet',
    benchmark,
    arenas,
    disclosure:
      'Stock Arena is an experimental devnet hackathon prototype. The escrowed assets are test ' +
      'tokens with no monetary value. The displayed PreStocks assets are separate mainnet ' +
      'references and may represent economic exposure rather than legal share ownership. This is ' +
      'not investment, legal or financial advice.',
  });
}
