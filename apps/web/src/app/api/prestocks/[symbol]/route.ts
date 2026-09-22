import { fetchPreStocks, findToken, optional } from '@stock-arena/integrations';

import { arenaRegistry } from '@/lib/server';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ symbol: string }> },
): Promise<Response> {
  const { symbol } = await params;
  const registry = arenaRegistry();
  const entry = registry.arenas.find(
    (arena) => arena.symbol.toUpperCase() === symbol.toUpperCase(),
  );
  if (!entry) {
    return Response.json({ error: `No Arena configured for "${symbol}".` }, { status: 404 });
  }

  let snapshot;
  try {
    snapshot = await fetchPreStocks({
      url: optional('PRESTOCKS_API_URL', 'https://prestocks.com/api/prestocks'),
    });
  } catch (error) {
    // Upstream is down or changed shape. Say so plainly rather than serving the last thing we saw
    // as if it were live — and never echo the upstream body, which can carry request details.
    return Response.json(
      {
        error: 'The PreStocks API is currently unavailable.',
        detail: String((error as Error).message).slice(0, 300),
      },
      { status: 502 },
    );
  }

  const token = findToken(snapshot, entry.symbol);
  if (!token) {
    return Response.json(
      { error: `PreStocks returned no record for "${entry.symbol}".` },
      { status: 404 },
    );
  }

  return Response.json({
    symbol: token.symbol,
    name: token.name,
    mainnet: {
      mintFromApi: token.mainnetMint,
      mintFromRegistry: entry.mainnetMint === '' ? null : entry.mainnetMint,
      matchesRegistry: entry.mainnetMint !== '' && entry.mainnetMint === token.mainnetMint,
      markPrice: token.markPrice ?? null,
      tokenPrice: token.tokenPrice ?? null,
    },
    devnetTestMint: entry.devnetTestMint === '' ? null : entry.devnetTestMint,
    retrievedAt: snapshot.retrievedAt.toISOString(),
    note:
      'markPrice and tokenPrice are off-chain display values. They never change an existing match ' +
      'and never affect settlement.',
  });
}
