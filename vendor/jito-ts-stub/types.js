/**
 * The only symbol `@pythnetwork/solana-utils` imports from jito-ts, and only inside
 * `sendTransactionsJito`, which this project never calls.
 *
 * Constructing it throws rather than returning something inert, so if a future change does route
 * transactions through Jito it fails loudly here instead of silently sending nothing.
 */
export class Bundle {
  constructor() {
    throw new Error(
      'jito-ts is stubbed in this repository; Jito bundles are not used. See vendor/jito-ts-stub/README.md.',
    );
  }
}
