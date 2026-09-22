import { playableArenas } from '@stock-arena/integrations';

import { BenchmarkCard, Row, StaleFeedNotice, formatPrice } from '@/components/cards';
import { arenaRegistry } from '@/lib/server';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const registry = arenaRegistry();
  const arenas = playableArenas(registry);

  // Read through our own route so the page and the public API cannot disagree about staleness.
  const benchmark = await loadBenchmark();

  return (
    <div className="space-y-10">
      <section>
        <h1 className="text-3xl font-semibold tracking-tight">
          Stake a pre-IPO token. Send an agent to predict a stock.
        </h1>
        <p className="mt-3 max-w-2xl text-neutral-300">
          Two players escrow equal amounts of the same devnet test token and each supplies a
          strategy for an empty-wallet battle agent. The agents make three timed predictions of a
          public stock benchmark. Pyth supplies the price and the program picks the winner
          deterministically — the winner gets their stake back plus a short-lived option to buy the
          loser&rsquo;s position at a strike both players signed before the match.
        </p>
        <p className="mt-4 flex flex-wrap gap-2 text-xs text-neutral-400">
          {[
            'PreStocks — the asset',
            'ClawPump — the fighters',
            'Pyth — the benchmark',
            'Solana — escrow and settlement',
          ].map((item) => (
            <span key={item} className="rounded border border-neutral-800 px-2 py-1">
              {item}
            </span>
          ))}
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Benchmark</h2>
        {benchmark.stale ? <StaleFeedNotice /> : null}
        <BenchmarkCard title={benchmark.symbol || 'Not yet configured'}>
          <Row label="Core feed ID" value={benchmark.coreFeedId || '—'} />
          <Row
            label="Price"
            value={
              benchmark.price === null ? '—' : formatPrice(benchmark.price, benchmark.exponent)
            }
          />
          <Row
            label="Published"
            value={
              benchmark.publishTime === null
                ? '—'
                : new Date(benchmark.publishTime * 1000)
                    .toISOString()
                    .replace('T', ' ')
                    .slice(0, 19)
            }
          />
        </BenchmarkCard>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Arenas</h2>
        {arenas.length === 0 ? (
          <p className="rounded border border-neutral-800 bg-neutral-900/40 px-3 py-6 text-sm text-neutral-400">
            No Arena is playable yet. Each one needs its real mainnet mint resolved and a labelled
            devnet test copy created by the setup scripts — mints are never hand-written into
            <code className="mx-1 rounded bg-neutral-800 px-1">config/arenas.json</code>.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {arenas.map((arena) => (
              <li key={arena.symbol}>
                <a
                  href={`/arena/${arena.symbol}`}
                  className="block rounded-lg border border-neutral-800 bg-neutral-900/40 p-4 transition hover:border-neutral-600"
                >
                  <div className="text-base font-semibold">{arena.symbol}</div>
                  <div className="mt-1 font-mono text-[11px] text-neutral-500">
                    devnet copy {arena.devnetTestMint.slice(0, 8)}…
                  </div>
                  {arena.note ? (
                    <div className="mt-2 text-xs text-neutral-400">{arena.note}</div>
                  ) : null}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

async function loadBenchmark() {
  const registry = arenaRegistry();
  const { fetchLatestPrice, isStale, optional } = await import('@stock-arena/integrations');
  try {
    const latest = await fetchLatestPrice({
      baseUrl: optional('PYTH_HERMES_URL', 'https://pyth.dourolabs.app/hermes'),
      apiKey: process.env.PYTH_API_KEY ?? '',
      feedId: optional('PYTH_BENCHMARK_FEED_ID', registry.benchmark.coreFeedId),
    });
    return {
      symbol: registry.benchmark.symbol,
      coreFeedId: latest.feedId,
      price: latest.price as string | null,
      exponent: latest.exponent,
      publishTime: latest.publishTime as number | null,
      stale: isStale(
        latest,
        Number(optional('BENCHMARK_MAX_AGE_SECONDS', '60')),
        Math.floor(Date.now() / 1000),
      ),
    };
  } catch {
    // Unreachable and stale look the same to a player: no new matches either way, and no guess
    // about when that changes.
    return {
      symbol: registry.benchmark.symbol,
      coreFeedId: registry.benchmark.coreFeedId,
      price: null,
      exponent: registry.benchmark.exponent,
      publishTime: null,
      stale: true,
    };
  }
}
