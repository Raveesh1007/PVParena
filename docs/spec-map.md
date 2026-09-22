# Spec map — read this to decide what _not_ to read

`code.md` is ~6,300 tokens. Most tasks need two or three of its sections, not all nineteen. This file
holds **no requirements of its own**, only pointers, so it cannot drift out of step with the spec.

| Working on                    | Read                                                             |
| ----------------------------- | ---------------------------------------------------------------- |
| Anything at all, first        | §2 fixed decisions, §7.4 invariants                              |
| Escrow, deposits, vaults      | §7.1, §7.4                                                       |
| A new instruction             | §7.2 states, §7.3 instructions, §7.4 invariants                  |
| Pyth, activation, settlement  | §3.2, §5.2, §5.6, §7.4                                           |
| Scoring or prices             | §5.5 schema, §5.6 formulas                                       |
| Strategy hashing              | §5.3                                                             |
| ClawPump / agents             | §3.3, §5.5                                                       |
| Champion launch               | §3.4, §4                                                         |
| PreStocks data or mints       | §3.1                                                             |
| Worker or routes              | §9, §10                                                          |
| UI                            | §11, §5.2 (stale-feed copy), §3.1 (the three-concept separation) |
| Database                      | §10                                                              |
| Env vars                      | §12                                                              |
| Setup / external verification | §13, plus `integration-readiness.md`                             |
| Writing tests                 | §14                                                              |
| Deciding what to cut          | §15 schedule, §16 definition of done                             |
| Cross-token duels             | §19 — read before proposing them                                 |

## Where the truth lives

| Question                                   | Source                                        |
| ------------------------------------------ | --------------------------------------------- |
| What must be built                         | `code.md`                                     |
| How to work, what not to do                | `AGENTS.md`                                   |
| What has actually been verified externally | `docs/integration-readiness.md`               |
| Which tokens have Arenas                   | `config/arenas.json`                          |
| What builds and passes right now           | `README.md` status table, `scripts/verify.sh` |

`code.md` is authoritative for requirements; `integration-readiness.md` is authoritative for what has
been _proven_ about the outside world. When they disagree, the readiness doc describes reality and
`code.md` describes the target.

## Traps already paid for

These cost real time once. They are documented in `integration-readiness.md`; this is the index.

- `$?` does not survive `wsl.exe -- bash -lc '...'` — a hand-captured exit code reads 0 regardless.
- `anchor test` exits 0 even when the suite crashes without running a single test.
- WSL `/tmp` does not persist between separate `wsl.exe` invocations.
- Eight crates must stay pinned below their latest versions or the SBF toolchain cannot parse their
  manifests. Never run a bare `cargo update`.
- `pyth-solana-receiver-sdk` must stay at 0.6.1 with `anchor-lang` pinned to 0.31.1.
- Declaring a cross-platform native binary in `package.json` breaks every Windows `npm install`; they
  live behind `npm run wsl:deps`.

Read the summary of a test run, never its exit code. A missing summary is a failure.
