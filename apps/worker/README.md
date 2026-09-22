# Orchestrator worker

An independent long-running process, never a route in the web app. Rounds fire on a timer and a
single ClawPump turn can take 120 seconds, which no serverless request budget accommodates.
Splitting it out also keeps the ClawPump key and the orchestrator keypair in a process that never
serves a browser. `code.md` §2, §8.

```
npm run build --workspace @stock-arena/worker
npm start     --workspace @stock-arena/worker
```

## What it can and cannot do

It activates matches, records both players' predictions, and posts the Pyth updates that settle
them. It **cannot** choose a winner, cannot supply a price the program will trust, and cannot
withdraw from a vault — no instruction gives it that power. If it disappears entirely, every match
still has a permissionless or player-controlled safe exit (`refund_failed_match`,
`mark_oracle_failure_refundable`, `reclaim_after_option_expiry`), and `settle_match` takes no
signer, so anyone can settle a match the worker abandoned. `code.md` §6, §7.4.

## Why it is bundled rather than run from `dist/*.js`

`@pythnetwork/pyth-solana-receiver` is the official SDK for posting price updates, and its
published ESM build cannot be loaded by Node's ESM resolver. Two separate packaging faults:

- `dist/esm/vaa.mjs` imports the **directory** `@coral-xyz/anchor/dist/cjs/utils/bytes`, which ESM
  does not resolve (`ERR_UNSUPPORTED_DIR_IMPORT`).
- its dependency `@pythnetwork/solana-utils` re-exports a Jito helper from its entry point, which
  imports the **extensionless** `jito-ts/dist/sdk/block-engine/types`.

Both are resolvable by a bundler, which is how the SDK is normally consumed, so `npm run build`
runs esbuild and emits a single `dist/worker.cjs`. `@prisma/client` stays external because it
loads generated query-engine binaries at runtime.

Loading the real `jito-ts` fails a third way — its CJS entry requires `rpc-websockets/dist/lib/client`,
a subpath current `rpc-websockets` no longer exports — so `vendor/jito-ts-stub` replaces it. We do
not use Jito; transactions go through `AnchorProvider.sendAll`. See that directory's README.

Revisit all of this when the SDK fixes its ESM build.

## Configuration

See `code.md` §12 and `.env.example`. Every value is required at startup and the process exits with
the name of whatever is missing — it never echoes a value, because the values in question are keys.

`ORCHESTRATOR_KEYPAIR_JSON` is a minimally funded **devnet** keypair. It pays transaction fees and
the free devnet SOL for posting Pyth updates. The worker refuses to start against any cluster other
than devnet.
