import { notFound } from 'next/navigation';
import { PublicKey } from '@solana/web3.js';
import { arenaPda, parseFeedId } from '@stock-arena/idl';
import { fetchPreStocks, findToken, optional } from '@stock-arena/integrations';

import {
  BenchmarkCard,
  DevnetTestCopyCard,
  MainnetReferenceCard,
  Row,
  formatAmount,
} from '@/components/cards';
import { listMatches } from '@/lib/matches';
import { arenaRegistry, program } from '@/lib/server';

export const dynamic = 'force-dynamic';

export default async function ArenaPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  const registry = arenaRegistry();
  const entry = registry.arenas.find((a) => a.symbol.toUpperCase() === symbol.toUpperCase());
  if (!entry || !entry.enabled) notFound();

  const prestocks = await loadPreStocks(entry.symbol);

  const feedConfigured = registry.benchmark.coreFeedId !== '';
  const pda =
    feedConfigured && entry.devnetTestMint !== ''
      ? arenaPda(new PublicKey(entry.devnetTestMint), parseFeedId(registry.benchmark.coreFeedId))
      : null;
  const arena = pda ? await program().account.arena.fetchNullable(pda) : null;
  const matches = pda && arena ? await listMatches(pda) : [];
  const open = matches.filter((m) => m.state === 'open');

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{entry.symbol} Arena</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Both players stake the same devnet test copy of {entry.symbol}. Same-token only: equal
          stakes across two different tokens would mean equal dollar value, and no pre-IPO token has
          a price this program can trust.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <MainnetReferenceCard title={prestocks?.name ?? entry.symbol}>
          <Row label="Mint" value={entry.mainnetMint || '—'} />
          <Row label="markPrice" value={prestocks?.markPrice ?? '—'} />
          <Row label="tokenPrice" value={prestocks?.tokenPrice ?? '—'} />
          <Row label="Retrieved" value={prestocks?.retrievedAt ?? 'unavailable'} />
        </MainnetReferenceCard>

        <DevnetTestCopyCard title={`${entry.symbol} (devnet test copy)`}>
          <Row label="Mint" value={entry.devnetTestMint || '—'} />
          <Row label="Arena PDA" value={pda?.toBase58() ?? '—'} />
          <Row
            label="On-chain"
            value={arena ? (arena.active ? 'active' : 'inactive') : 'not created'}
          />
        </DevnetTestCopyCard>

        <BenchmarkCard title={registry.benchmark.symbol || 'Not configured'}>
          <Row label="Core feed ID" value={registry.benchmark.coreFeedId || '—'} />
          <Row label="Exponent" value={String(registry.benchmark.exponent)} />
          <Row label="Source" value={registry.benchmark.source || '—'} />
        </BenchmarkCard>
      </section>

      <p className="rounded border border-neutral-800 bg-neutral-900/40 px-3 py-2 text-xs text-neutral-400">
        The mainnet asset is a reference only. It is never escrowed and its price never affects a
        match. What is escrowed is the devnet test copy; what decides the winner is the benchmark
        feed.
      </p>

      <section>
        <h2 className="text-xl font-semibold">Open challenges</h2>
        {!arena ? (
          <p className="mt-3 rounded border border-neutral-800 px-3 py-4 text-sm text-neutral-400">
            This Arena is configured but has not been created on-chain yet.
          </p>
        ) : open.length === 0 ? (
          <p className="mt-3 rounded border border-neutral-800 px-3 py-4 text-sm text-neutral-400">
            No open challenges. A player creates one by escrowing a stake and naming the exact USDC
            strike the winner could later pay for the loser&rsquo;s position.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {open.map((match) => (
              <li key={match.pda}>
                <a
                  href={`/match/${match.pda}`}
                  className="flex items-center justify-between rounded border border-neutral-800 bg-neutral-900/40 px-4 py-3 text-sm transition hover:border-neutral-600"
                >
                  <span className="font-mono text-xs text-neutral-400">
                    {match.creator.slice(0, 4)}…{match.creator.slice(-4)}
                  </span>
                  <span>
                    {formatAmount(match.stakeAmount, 6)} {entry.symbol} · strike{' '}
                    {formatAmount(match.strikeAmount, 6)} USDC · {match.profile}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      {matches.length > open.length ? (
        <section>
          <h2 className="text-xl font-semibold">Recent matches</h2>
          <ul className="mt-3 space-y-2">
            {matches
              .filter((m) => m.state !== 'open')
              .slice(0, 20)
              .map((match) => (
                <li key={match.pda}>
                  <a
                    href={`/match/${match.pda}`}
                    className="flex items-center justify-between rounded border border-neutral-800 bg-neutral-900/40 px-4 py-3 text-sm transition hover:border-neutral-600"
                  >
                    <span className="font-mono text-xs text-neutral-500">
                      {match.pda.slice(0, 8)}…
                    </span>
                    <span className="text-neutral-300">
                      {match.state}
                      {match.winner !== 'unset' ? ` · ${match.winner}` : ''}
                    </span>
                  </a>
                </li>
              ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

async function loadPreStocks(symbol: string) {
  try {
    const snapshot = await fetchPreStocks({
      url: optional('PRESTOCKS_API_URL', 'https://prestocks.com/api/prestocks'),
    });
    const token = findToken(snapshot, symbol);
    if (!token) return null;
    return {
      name: token.name,
      markPrice: token.markPrice ?? null,
      tokenPrice: token.tokenPrice ?? null,
      retrievedAt: snapshot.retrievedAt.toISOString().replace('T', ' ').slice(0, 19),
    };
  } catch {
    // The Arena is still playable without live PreStocks data — it is display only — so the page
    // degrades rather than failing. The upstream message is not surfaced: it can echo request
    // details.
    return null;
  }
}
