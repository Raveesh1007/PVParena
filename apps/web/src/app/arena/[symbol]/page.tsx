import { randomUUID } from 'node:crypto';
import { notFound } from 'next/navigation';
import { PublicKey } from '@solana/web3.js';
import { arenaPda, parseFeedId } from '@stock-arena/idl';
import { fetchMainnetPrices, fetchPreStocks, findToken, optional } from '@stock-arena/integrations';

import {
  BenchmarkCard,
  DevnetTestCopyCard,
  MainnetReferenceCard,
  Row,
  StaleFeedNotice,
} from '@/components/cards';
import { QUOTE_DECIMALS, formatAmount, formatPrice, stamp, truncateDecimal } from '@/lib/format';
import { CreateMatchForm, type ReferencePrices } from '@/components/create-match-form';
import { loadBenchmark } from '@/lib/benchmark';
import { listMatches, loadArenaOptions, type StakeView } from '@/lib/matches';
import { arenaRegistry, program } from '@/lib/server';
import { Beam } from '@/components/beam';

export const dynamic = 'force-dynamic';

export default async function ArenaPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  const registry = arenaRegistry();
  const entry = registry.arenas.find((a) => a.symbol.toUpperCase() === symbol.toUpperCase());
  if (!entry || !entry.enabled) notFound();

  const [snapshot, mainnetPrices] = await Promise.all([
    loadPreStocks(),
    loadMainnetPrices(
      registry.arenas.filter((a) => a.issuer === 'xstocks').map((a) => a.mainnetMint),
    ),
  ]);
  const jupiter = mainnetPrices?.prices[entry.mainnetMint];
  const prestocks =
    entry.issuer === 'prestocks' ? (snapshot?.bySymbol(entry.symbol) ?? null) : null;

  const feedConfigured = registry.benchmark.coreFeedId !== '';
  const pda =
    feedConfigured && entry.devnetTestMint !== ''
      ? arenaPda(new PublicKey(entry.devnetTestMint), parseFeedId(registry.benchmark.coreFeedId))
      : null;
  const [chain, benchmark] = await Promise.all([loadArenaChainData(pda), loadBenchmark()]);
  const { arena, matches, options, errorId } = chain;
  const own = options.find((option) => option.arena === pda?.toBase58());
  const open = matches.filter((m) => m.state === 'open');
  const referencePrices: ReferencePrices = Object.fromEntries(
    options.flatMap((option) => {
      const token = snapshot?.bySymbol(option.symbol);
      const mint = registry.arenas.find((a) => a.symbol === option.symbol)?.mainnetMint ?? '';
      const traded = mainnetPrices?.prices[mint];
      const reference = token?.tokenPrice
        ? { raw: token.tokenPrice, source: 'PreStocks', retrievedAt: token.retrievedAt }
        : traded && mainnetPrices
          ? { raw: traded.usdPrice, source: 'Jupiter', retrievedAt: mainnetPrices.retrievedAt }
          : null;
      const price = reference ? truncateDecimal(reference.raw, QUOTE_DECIMALS) : null;
      return reference && price
        ? [[option.arena, { price, source: reference.source, retrievedAt: reference.retrievedAt }]]
        : [];
    }),
  );

  return (
    <div className="space-y-8">
      <header>
        <h1 className="title-page">{entry.symbol} Arena</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Stake the devnet test copy of {entry.symbol} against the same token or any other Arena on
          this benchmark. The creator names both stakes and both strikes up front, so no token ever
          needs a price the program would have to trust.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <MainnetReferenceCard title={prestocks?.name ?? entry.symbol}>
          <Row
            label="Issuer"
            value={entry.issuer === 'prestocks' ? 'PreStocks' : 'Backed Finance'}
          />
          <Row label="Mint" value={entry.mainnetMint || '—'} />
          {entry.issuer === 'prestocks' ? (
            <>
              <Row label="markPrice" value={prestocks?.markPrice ?? '—'} />
              <Row label="tokenPrice" value={prestocks?.tokenPrice ?? '—'} />
              <Row label="Retrieved" value={prestocks?.retrievedAt ?? 'unavailable'} />
            </>
          ) : (
            <>
              <Row label="Mainnet price" value={jupiter ? `$${jupiter.usdPrice}` : 'unavailable'} />
              <Row
                label="xStocks reference"
                value={jupiter?.referencePrice ? `$${jupiter.referencePrice}` : '—'}
              />
              <Row label="Source" value="Jupiter price API" />
              <Row label="Retrieved" value={mainnetPrices?.retrievedAt ?? 'unavailable'} />
            </>
          )}
        </MainnetReferenceCard>

        <DevnetTestCopyCard title={`${entry.symbol} (devnet test copy)`}>
          <Row label="Mint" value={entry.devnetTestMint || '—'} />
          <Row label="Arena PDA" value={pda?.toBase58() ?? '—'} />
          <Row
            label="On-chain"
            value={
              errorId
                ? 'unavailable'
                : arena
                  ? arena.active
                    ? 'active'
                    : 'inactive'
                  : 'not created'
            }
          />
        </DevnetTestCopyCard>

        <BenchmarkCard title={registry.benchmark.symbol || 'Not configured'}>
          <Row label="Core feed ID" value={registry.benchmark.coreFeedId || '—'} />
          <Row label="Exponent" value={String(registry.benchmark.exponent)} />
          <Row label="Source" value={registry.benchmark.source || '—'} />
          <Row
            label="Latest Hermes price"
            value={
              benchmark.price ? formatPrice(benchmark.price, benchmark.exponent) : 'unavailable'
            }
          />
          <Row
            label="Confidence"
            value={
              benchmark.confidence
                ? formatPrice(benchmark.confidence, benchmark.exponent)
                : 'unavailable'
            }
          />
          <Row
            label="Published"
            value={benchmark.publishTime ? `${stamp(benchmark.publishTime)} UTC` : 'unavailable'}
          />
          <Row label="Freshness" value={benchmark.stale ? 'stale or unavailable' : 'fresh'} />
        </BenchmarkCard>
      </section>
      {benchmark.stale ? <StaleFeedNotice /> : null}
      {errorId ? (
        <p role="alert" className="rounded-control bg-surface-2 px-3 py-2 text-sm text-warning">
          Solana devnet RPC is unavailable. Arena actions and challenge listings will return when it
          responds. Reference: <span className="font-mono">{errorId}</span>
        </p>
      ) : null}

      <p className="rounded-control bg-surface-1 px-3 py-2 text-xs text-text-secondary">
        The mainnet asset is a reference only and is never escrowed. Its live PreStocks price only
        pre-fills the strike you sign; after that, only the signed number counts. What is escrowed
        is the devnet test copy; what decides the winner is the benchmark feed.
      </p>

      {!errorId && own ? (
        <Beam>
          <section className="rounded-surface border border-border-subtle bg-surface-1 p-4">
            <h2 className="title-section mb-3">Create challenge</h2>
            <CreateMatchForm
              own={own}
              options={options}
              referencePrices={referencePrices}
              benchmarkStale={benchmark.stale}
            />
          </section>
        </Beam>
      ) : null}

      <section>
        <h2 className="title-section">Open challenges</h2>
        {errorId ? (
          <p className="mt-3 text-sm text-text-secondary">Challenges cannot be read right now.</p>
        ) : !arena ? (
          <Beam>
            <p className="mt-3 rounded-surface border border-border-subtle bg-surface-1 px-3 py-4 text-sm text-text-secondary">
              This Arena is configured but has not been created on-chain yet.
            </p>
          </Beam>
        ) : open.length === 0 ? (
          <Beam>
            <p className="mt-3 rounded-surface border border-border-subtle bg-surface-1 px-3 py-4 text-sm text-text-secondary">
              No open challenges. A player creates one by escrowing a stake and naming the exact
              USDC strike the winner could later pay for the loser&rsquo;s position.
            </p>
          </Beam>
        ) : (
          <ul className="mt-3 space-y-2">
            {open.map((match) => (
              <li key={match.pda}>
                <Beam>
                  <a
                    href={`/match/${match.pda}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-surface border border-border-subtle bg-surface-1 px-4 py-3 text-sm transition-colors hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    <span className="font-mono text-xs text-text-secondary">
                      {match.creator.slice(0, 4)}…{match.creator.slice(-4)}
                    </span>
                    <span>
                      {stakeLabel(match.stakes.creator)} vs {stakeLabel(match.stakes.challenger)} ·{' '}
                      {match.profile}
                    </span>
                  </a>
                </Beam>
              </li>
            ))}
          </ul>
        )}
      </section>

      {matches.length > open.length ? (
        <section>
          <h2 className="title-section">Recent matches</h2>
          <ul className="mt-3 space-y-2">
            {matches
              .filter((m) => m.state !== 'open')
              .slice(0, 20)
              .map((match) => (
                <li key={match.pda}>
                  <Beam>
                    <a
                      href={`/match/${match.pda}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-surface border border-border-subtle bg-surface-1 px-4 py-3 text-sm transition-colors hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                    >
                      <span className="font-mono text-xs text-text-muted">
                        {match.pda.slice(0, 8)}…
                      </span>
                      <span className="text-text-secondary">
                        {match.state}
                        {match.winner !== 'unset' ? ` · ${match.winner}` : ''}
                      </span>
                    </a>
                  </Beam>
                </li>
              ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

async function loadMainnetPrices(mints: string[]) {
  try {
    const prices = await fetchMainnetPrices(mints.filter(Boolean));
    return { prices, retrievedAt: new Date().toISOString().replace('T', ' ').slice(0, 19) };
  } catch {
    // Display and strike suggestion only; the Arena stays playable with a typed-in price.
    return null;
  }
}

async function loadPreStocks() {
  try {
    const snapshot = await fetchPreStocks({
      url: optional('PRESTOCKS_API_URL', 'https://prestocks.com/api/prestocks'),
    });
    const retrievedAt = snapshot.retrievedAt.toISOString().replace('T', ' ').slice(0, 19);
    return {
      bySymbol(symbol: string) {
        const token = findToken(snapshot, symbol);
        if (!token) return null;
        return {
          name: token.name,
          markPrice: token.markPrice ?? null,
          tokenPrice: token.tokenPrice ?? null,
          retrievedAt,
        };
      },
    };
  } catch {
    // The Arena is still playable without live PreStocks data — it is display and a strike
    // suggestion only — so the page degrades rather than failing. The upstream message is not
    // surfaced: it can echo request details.
    return null;
  }
}

function stakeLabel(stake: StakeView): string {
  return `${formatAmount(stake.amount, stake.decimals)} ${stake.symbol}`;
}

async function loadArenaChainData(pda: PublicKey | null) {
  try {
    const arena = pda ? await program().account.arena.fetchNullable(pda) : null;
    const [matches, options] = await Promise.all([
      pda && arena ? listMatches(pda) : [],
      loadArenaOptions(),
    ]);
    return { arena, matches, options, errorId: null };
  } catch (error) {
    const errorId = randomUUID();
    console.error(
      'Arena devnet RPC read failed',
      errorId,
      error instanceof Error ? error.name : 'unknown',
    );
    return { arena: null, matches: [], options: [], errorId };
  }
}
