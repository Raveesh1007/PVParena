import { PublicKey } from '@solana/web3.js';
import { arenaPda, parseFeedId } from '@stock-arena/idl';
import { playableArenas } from '@stock-arena/integrations';
import { DISCLOSURE } from '@stock-arena/shared';

import { loadBenchmark } from '@/lib/benchmark';
import { arenaRegistry, program } from '@/lib/server';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const registry = arenaRegistry();
  const playable = playableArenas(registry);

  const benchmark = await loadBenchmark();

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
    disclosure: DISCLOSURE,
  });
}
