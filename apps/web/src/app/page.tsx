import { playableArenas } from '@stock-arena/integrations';

import { BenchmarkCard, Row, StaleFeedNotice } from '@/components/cards';
import { ArenaPicker } from '@/components/arena-picker';
import { loadBenchmark } from '@/lib/benchmark';
import { formatPrice, stamp } from '@/lib/format';
import { arenaRegistry } from '@/lib/server';
import { Beam } from '@/components/beam';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const registry = arenaRegistry();
  const arenas = playableArenas(registry);

  const benchmark = await loadBenchmark();

  return (
    <div className="space-y-12">
      <section className="pb-4 pt-8">
        <p className="eyebrow">PvP market prediction · Solana devnet</p>
        <h1 className="mt-4 max-w-4xl font-display text-[44px] font-normal leading-[1.05] tracking-tight sm:text-[56px]">
          Stake a pre-IPO/tokenized stock.{' '}
          <span className="text-text-secondary">Send an agent to predict a stock.</span>
        </h1>
        <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-text-secondary">
          You can trade any type of tokenized stock, even pre-IPO ones. Two players escrow devnet
          test copies and each write a strategy for an AI agent. The agents predict a public stock
          three times; Pyth supplies the price and the program picks the winner. The winner gets
          their own stake back and can take the loser&rsquo;s stake at the price they both agreed.
        </p>
        <ul className="mt-8 grid max-w-3xl grid-cols-2 border-t border-border-subtle sm:grid-cols-4">
          {[
            ['PreStocks', 'pre-IPO assets'],
            ['ClawPump', 'the fighters'],
            ['Pyth', 'the benchmark'],
            ['Solana', 'escrow and settlement'],
          ].map(([name, role]) => (
            <li key={name} className="border-b border-border-subtle py-3 pr-4">
              <span className="block text-sm text-text-primary">{name}</span>
              <span className="eyebrow">{role}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-4">
        <p className="eyebrow">01 / Benchmark</p>
        <h2 className="title-section">The stock the agents predict</h2>
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
            label="Confidence"
            value={
              benchmark.confidence ? formatPrice(benchmark.confidence, benchmark.exponent) : '—'
            }
          />
          <Row
            label="Published"
            value={benchmark.publishTime === null ? '—' : stamp(benchmark.publishTime)}
          />
        </BenchmarkCard>
      </section>

      <section className="space-y-4">
        <p className="eyebrow">02 / Arenas</p>
        <h2 className="title-section">Pick the token you stake</h2>
        {arenas.length === 0 ? (
          <Beam>
            <p className="rounded-surface border border-border-subtle bg-surface-1 px-3 py-6 text-sm text-text-secondary">
              No Arena is playable yet. Each one needs its real mainnet mint resolved and a labelled
              devnet test copy created by the setup scripts — mints are never hand-written into
              <code className="mx-1 rounded-control bg-surface-2 px-1">config/arenas.json</code>.
            </p>
          </Beam>
        ) : (
          <ArenaPicker arenas={arenas} />
        )}
      </section>
    </div>
  );
}
