import type { Wallet } from '@coral-xyz/anchor';
import { PythSolanaReceiver } from '@pythnetwork/pyth-solana-receiver';
import type { Connection, PublicKey, TransactionInstruction } from '@solana/web3.js';
import { fetchLatestPrice } from '@stock-arena/integrations';

import type { WorkerConfig } from './config.js';

export interface ObservedPrice {
  /** Mantissa as a decimal string; never parsed into a float. */
  price: string;
  conf: string;
  exponent: number;
  publishTime: number;
}

export interface PriceUpdateOutcome {
  signatures: string[];
  observed: ObservedPrice;
}

/**
 * Fetch the latest benchmark price, post it to devnet, and run `buildConsumer`'s instruction
 * against the resulting account — all in one atomic sequence.
 *
 * `buildConsumer` receives the address the update will live at and returns the program
 * instruction that should consume it (`activate_match` or `settle_match`).
 */
export async function withPriceUpdate(
  config: WorkerConfig,
  connection: Connection,
  wallet: Wallet,
  buildConsumer: (priceUpdate: PublicKey) => Promise<TransactionInstruction>,
): Promise<PriceUpdateOutcome> {
  const observed = await fetchLatestPrice({
    baseUrl: config.hermesUrl,
    apiKey: config.pythApiKey,
    feedId: config.benchmarkFeedId,
  });
  const feedId = `0x${observed.feedId}`;

  const receiver = new PythSolanaReceiver({ connection, wallet });
  const builder = receiver.newTransactionBuilder({ closeUpdateAccounts: true });

  // Fully verified. See the note above before changing this.
  await builder.addPostPriceUpdates(observed.binary);

  await builder.addPriceConsumerInstructions(
    async (getPriceUpdateAccount: (id: string) => PublicKey) => [
      { instruction: await buildConsumer(getPriceUpdateAccount(feedId)), signers: [] },
    ],
  );

  // No tightComputeBudget: it caps each transaction at the sum of declared units, and the consumer
  // declares none, so activate/settle would run on zero budget (PostUpdate alone overran 35k on devnet).
  const transactions = await builder.buildVersionedTransactions({
    computeUnitPriceMicroLamports: 50_000,
  });
  const signatures = await receiver.provider.sendAll(transactions, {
    // Preflight catches a rejected update (wrong feed, stale, confidence too wide) before paying
    // for it, and surfaces the program's own error code rather than a generic failure.
    skipPreflight: false,
    preflightCommitment: 'confirmed',
  });

  return {
    signatures,
    observed: {
      price: observed.price,
      conf: observed.conf,
      exponent: observed.exponent,
      publishTime: observed.publishTime,
    },
  };
}

/**
 * Read the benchmark without posting anything, for prompts and for the UI's freshness display.
 * Cheap and side-effect free — no devnet SOL, no accounts.
 */
export async function readBenchmark(config: WorkerConfig): Promise<ObservedPrice> {
  const observed = await fetchLatestPrice({
    baseUrl: config.hermesUrl,
    apiKey: config.pythApiKey,
    feedId: config.benchmarkFeedId,
  });
  return {
    price: observed.price,
    conf: observed.conf,
    exponent: observed.exponent,
    publishTime: observed.publishTime,
  };
}
