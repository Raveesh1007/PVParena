import { PrismaClient } from '@prisma/client';
import { assertRegistryReady, loadArenaRegistry } from '@stock-arena/integrations';

import { connectChain } from './chain.js';
import { loadWorkerConfig } from './config.js';
import { tick } from './tick.js';

async function main(): Promise<void> {
  const config = loadWorkerConfig();

  // Fail at startup, not at the first player's first click.
  const registry = loadArenaRegistry(config.arenasConfigPath);
  assertRegistryReady(registry);
  if (
    registry.benchmark.coreFeedId.replace(/^0x/i, '').toLowerCase() !==
    config.benchmarkFeedId.replace(/^0x/i, '').toLowerCase()
  ) {
    throw new Error(
      'PYTH_BENCHMARK_FEED_ID does not match benchmark.coreFeedId in the Arena registry. The ' +
        'Arena PDA is derived from the feed ID, so a mismatch means every lookup would miss.',
    );
  }

  const db = new PrismaClient();
  const ctx = connectChain(config);

  console.log(
    `orchestrator ${ctx.provider.wallet.publicKey.toBase58()} on devnet, ` +
      `benchmark ${config.benchmarkSymbol}, tick ${config.tickIntervalMs}ms`,
  );

  let stopping = false;
  const stop = () => {
    stopping = true;
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  while (!stopping) {
    const started = Date.now();
    try {
      await tick(db, config, ctx);
    } catch (error) {
      // A failed tick is logged and retried on the next one. Exiting would strand live matches
      // mid-round for as long as it took something to restart the process.
      console.error(`tick failed: ${String((error as Error).message ?? error)}`);
    }
    const elapsed = Date.now() - started;
    await sleep(Math.max(0, config.tickIntervalMs - elapsed));
  }

  await db.$disconnect();
  console.log('orchestrator stopped');
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

main().catch((error) => {
  // Configuration errors land here. The message names what is missing; it never echoes a value,
  // because the values in question are keys.
  console.error(String((error as Error).message ?? error));
  process.exit(1);
});
