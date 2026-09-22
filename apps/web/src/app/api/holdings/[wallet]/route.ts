import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token';

import { arenaRegistry, mainnetConnection, parsePubkey } from '@/lib/server';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ wallet: string }> },
): Promise<Response> {
  const { wallet } = await params;
  const owner = parsePubkey(wallet);
  if (!owner) return Response.json({ error: 'Not a base58 address.' }, { status: 400 });

  const registry = arenaRegistry();
  const byMint = new Map(
    registry.arenas
      .filter((arena) => arena.mainnetMint !== '')
      .map((arena) => [arena.mainnetMint, arena.symbol] as const),
  );
  if (byMint.size === 0) {
    return Response.json({ wallet: owner.toBase58(), network: 'mainnet', holdings: [] });
  }

  const connection = mainnetConnection();
  // Both token programs: a PreStocks token could be Token-2022, and a balance held there is just
  // as real. Which program each mint uses is recorded during setup, not assumed here.
  const [classic, token2022] = await Promise.all([
    connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_PROGRAM_ID }),
    connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_2022_PROGRAM_ID }),
  ]);

  const holdings: { symbol: string; mainnetMint: string; amount: string; decimals: number }[] = [];
  for (const { account } of [...classic.value, ...token2022.value]) {
    const info = account.data.parsed?.info as
      { mint?: string; tokenAmount?: { amount?: string; decimals?: number } } | undefined;
    const mint = info?.mint;
    const amount = info?.tokenAmount?.amount;
    if (!mint || !amount || amount === '0') continue;
    const symbol = byMint.get(mint);
    if (!symbol) continue;
    holdings.push({
      symbol,
      mainnetMint: mint,
      // Raw base units as a string. Formatting is the UI's job; parsing this into a float would
      // lose precision for no reason.
      amount,
      decimals: info?.tokenAmount?.decimals ?? 0,
    });
  }

  return Response.json({
    wallet: owner.toBase58(),
    network: 'mainnet',
    note: 'Read-only mainnet reference. These assets are never escrowed; matches use devnet test copies.',
    holdings,
  });
}
