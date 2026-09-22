# Stock Arena

Two-player PvP market-prediction game on **Solana devnet**. Two players escrow equal amounts of a
clearly labelled devnet test copy of the OpenAI PreStocks token, each supplies a strategy for an
empty-wallet ClawPump battle agent, and the agents make three timed predictions for the final price
of a Pyth stock benchmark. The Anchor program calculates the winner deterministically.

The winner gets their own stake back plus a short-lived **Battle Option**: the right to buy the
loser's stake for the exact USDC strike both players signed. If the option expires, the loser
reclaims their stake.

> PreStocks supplies the Arena asset, ClawPump supplies the fighters, Pyth supplies the benchmark,
> Solana supplies escrow and deterministic settlement — and the player supplies the strategy.

**Stock Arena is an experimental devnet hackathon prototype. The escrowed assets are test tokens
with no monetary value. The displayed PreStocks asset is a separate mainnet reference and may
represent economic exposure rather than legal share ownership. This is not investment, legal or
financial advice.**

`code.md` is the authoritative specification. `AGENTS.md` is the only coding-agent instruction file.

## Status

Phase 1 in progress. Not yet deployed; no integration gate has been verified — see
`docs/integration-readiness.md`.

| Piece                                                                     | State                    |
| ------------------------------------------------------------------------- | ------------------------ |
| `packages/shared` — strategy commitments, agent schema, reference scoring | 43 tests passing         |
| `programs/stock_arena` — protocol, arena, create/join/cancel escrow       | 14 program tests passing |
| Pyth activation, scoring, settlement, option, refunds                     | not started              |
| `apps/worker`, `apps/web`, Prisma schema                                  | not started              |
| Every external integration                                                | unverified — no keys yet |

Verified on 2026-09-21: `cargo fmt`, `cargo clippy -D warnings`, `anchor build`, `anchor test`,
`tsc --build`, `prettier --check`, 43 unit tests, 14 program tests.

Timeout coverage is partial: `create_arena` pins duration, round offsets, settlement grace and the
exercise window to the exact §5.1 values, so only the join and activation windows can be driven
to expiry cheaply. Round-submission windows, settlement grace and option expiry still need a
clock-controlling harness — see the harness note below.

## Layout

```
programs/stock_arena    authoritative state machine and value movement
packages/shared         schemas, constants, normalization, reference scoring
docs/                   integration evidence
```

`apps/web`, `apps/worker`, `packages/integrations` and `packages/idl` arrive with the code that
needs them. The worker will be an independent long-running process, never a route inside the web
app: rounds fire on a timer and a ClawPump turn can take 120 s.

## Setup

Requires WSL (or Linux) for the Solana toolchain. `solana` and `anchor` are not on the
non-interactive login PATH, so export it first:

```sh
export PATH="$HOME/.avm/bin:$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$PATH"
avm use 0.31.1
```

```sh
npm install
cp .env.example .env    # then fill it in; never commit .env
```

## Verification

TypeScript, from Windows or WSL:

```sh
npm run format:check
npm run typecheck
npm test              # 43 unit tests; does not need a validator
```

Rust and program tests, from WSL (needs the Solana toolchain):

```sh
bash scripts/verify.sh   # anchor build, cargo fmt, clippy -D warnings, program tests
```

Use that script rather than reading exit codes by hand. Two traps it guards against: `anchor test`
exits 0 even when the suite crashes without running a single test, and `$?` does not survive a
`wsl.exe -- bash -lc '...'` invocation, so a hand-captured exit code reads 0 regardless. The Vitest
summary is the only trustworthy signal and a missing summary means failure.

`npm run lint` is not wired — strict `tsc` covers the typing half; ESLint is deferred until the
required MVP behavior is complete.

### Harness note

Program tests run on **bankrun**, not a validator, because a validator cannot move its clock and
the deadline paths need it: the join window, the activation window (the only route into
`refund_failed_match`), settlement grace and option expiry. Those windows are fixed by `code.md`
§5.1 and pinned in `create_arena`, so tests warp the bank clock rather than shortening them.

bankrun and LiteSVM both publish native bindings for linux and macOS only, with no win32 binary and
no working WASI fallback, so **the program tests run under WSL**. The cross-platform native
binaries are deliberately kept out of `package.json`, because declaring them makes every Windows
`npm install` fail with `notsup`. Install them once:

```sh
npm run wsl:deps
```

A later `npm install` prunes them, so re-run it if the program tests stop resolving their bindings.

External integration tests will be opt-in, so a normal run never spends ClawPump credits or needs
private keys:

```sh
npm run test:integration:pyth
npm run test:integration:clawpump
```

## Security boundary

The Anchor program is authoritative for match terms and timestamps, deposits and escrow
accounting, accepted paired predictions, Pyth validation, scores, winner selection, claims, option
exercise, expiry reclaim and refunds. The frontend, worker, PostgreSQL and agents never choose a
winner or move escrow outside a defined instruction.

- Checked integer arithmetic only; no floats anywhere in financial or scoring logic.
- Entitlements derive from internal recorded deposits, never raw vault balance, so an unsolicited
  transfer into a vault grants nobody anything.
- There is no admin or orchestrator vault-withdrawal path. `update_protocol_config` touches only
  `ProtocolConfig` and cannot reach escrow.
- Pause blocks new risk, never a refund, claim, exercise or expiry reclaim.
- Battle-agent wallets are always empty and are never a delegate, authority or signer.
- Strategy hashing is TypeScript-only: the program stores the 32-byte commitment and never
  recomputes it.

The worker sees both predictions before submitting them. Atomic paired submission prevents public
copying and front-running, **not** worker manipulation — the transcript and response hashes make
the demo auditable instead. Do not describe this as trustless.

## Cost

Everything on devnet is free. Real money is only ever spent on ClawPump paid-model credit and, if
that bounty is attempted at all, an explicitly approved mainnet Champion launch.
# PVParena
