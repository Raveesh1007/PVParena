# jito-ts stub

`@pythnetwork/pyth-solana-receiver` depends on `@pythnetwork/solana-utils`, whose barrel
unconditionally re-exports a Jito helper. That helper imports one symbol from `jito-ts`:

    import { Bundle } from "jito-ts/dist/sdk/block-engine/types";

The real `jito-ts@3.0.1` cannot be loaded in this project by either module system:

- **ESM** rejects the extensionless specifier above (`ERR_MODULE_NOT_FOUND`, "Did you mean
  types.js?"), because `jito-ts` publishes no `exports` map.
- **CJS** fails differently, on `rpc-websockets/dist/lib/client`, a subpath that the
  `rpc-websockets` version required by current `@solana/web3.js` no longer exports.

Either way, `import { PythSolanaReceiver }` crashes the worker at startup — not at the point where
Jito would be used, but on the very first import.

We do not use Jito. Transactions go through `AnchorProvider.sendAll`. So the root `package.json`
overrides `jito-ts` with this stub, which satisfies that single import and throws if anything ever
actually tries to build a bundle.

Remove this once `@pythnetwork/solana-utils` either fixes the specifier or stops re-exporting Jito
from its entry point.
