# Integration readiness

Phase 0 evidence for the gates in `code.md` §13. Every row starts UNVERIFIED and may only be
changed by someone who actually ran the check and pasted the evidence. A blocking failure is
reported, never hidden behind mock data in the sponsor demo.

Last updated: 2026-09-23

| #   | Gate                                                                          | Status       | Evidence                                                                       |
| --- | ----------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------ |
| 1   | PreStocks API returns the current OpenAI record                               | **VERIFIED** | 23 Sep 2026: 8 tokens; OPENAI mint matches gate 2 — see "Devnet assets" below  |
| 2   | Real mainnet mint inspected: token program, decimals, authorities, extensions | **VERIFIED** | OPENAI, 22 Sep 2026 — see "Mainnet mint inspection" below                      |
| 3   | Labelled devnet test copy created; two demo wallets funded                    | **VERIFIED** | `8u5symXKPiA5wvUzkEy8HKS184j2of29ZkWwkiqUDkHV`, 100 each — see "Devnet assets" |
| 4   | Circle devnet USDC verified, or `USDC-DEV` (6 decimals) created               | **VERIFIED** | `USDC-DEV` `9XfmajjGiw7u4UmWHJM9CZ14NpJnbB5F7Kv3AH1pbUiW`, 100,000 each        |
| 5   | `app.pyth.com` account + API key; trial expiry outlasts 2 Oct 2026            | **VERIFIED** | Trial ends ~6 Oct (13 days left on 23 Sep); key works — see below              |
| 6   | Official 32-byte Core feed ID resolved for the chosen symbol                  | **VERIFIED** | TSLA, 23 Sep 2026 — see "Benchmark decision" below                             |
| 7   | Authenticated Hermes fetch succeeds at `pyth.dourolabs.app/hermes`            | **VERIFIED** | TSLA, 23 Sep 2026 08:14 UTC — see below                                        |
| 8   | Update posted to and read from Solana devnet                                  | **VERIFIED** | TSLA, 23 Sep 2026 08:48 UTC — see "Devnet post/read" below                     |
| 9   | `cpk_` key, verified paid model, sufficient credit                            | **VERIFIED** | 25 Sep 2026: switched to `openai/gpt-5.4-mini` — see "ClawPump model switch"   |
| 10  | Empty `monitor-exit` battle agent completes one strict-JSON call, no tool use | **BLOCKED**  | 23 Sep 2026: model not honoured, reply empty once — see "ClawPump gate 10"     |
| 11  | ClawPump answered the Pump.fun-versus-Meteora question                        | **ANSWERED** | Discord, Tomi204, 20–22 Sep 2026 — see "ClawPump launch route" below           |
| 12  | `/pump-pairs` lists an eligible stock mint; launch preflight recorded unpaid  | UNVERIFIED   |                                                                                |
| 13  | Devnet SOL collected for both demo wallets and the deploy wallet              | **VERIFIED** | 23 Sep 2026: deploy 20.9, player A 5.66, player B 2.00 SOL                     |

## ClawPump billing (verified 2026-09-23, MCP + mainnet RPC)

Credit is **account-level**: `get_account_status` reports `credit_balance` and one account
`deposit_wallet` (`zqUkbZcX87dCzAycRFTMuUKEhbMVKey5ysNALo2AG4S`), and `sync_billing` takes no agent
ID. Agents are paid from that pool, so battle-agent wallets can stay empty.

Deposits are **USDC to the account deposit wallet**, not SOL to an agent wallet. 0.001 SOL sent to
Agent1's wallet (`3iVAce…xkrJ`) was ignored by `sync_billing` (`deposits_processed: 0`) and is still
there. Model catalog: `moonshotai/kimi-k2.5` at $0.585 / $2.925 per million input/output tokens.
The free tier (10 requests/day) uses `:free` models only and does not satisfy the paid-model rule.

The user deposited mainnet USDC (`EPjFWdd5…Dt1v`); the deposit wallet's USDC account
`6DmPprCLMsa2FR8CVnwCpamAr4hYVW4aQ3LVETqbzXbr` held 1.039483 at finalized commitment. `sync_billing`
at 13:29 UTC returned `deposits_processed: 1`, `credits_added: 1.008299`, and Agent1's
`get_balance` then showed the same 1.008299, confirming one pool shared by all agents. The USDC
stayed in the deposit wallet after the sync.

## ClawPump gate 10 (attempted 2026-09-23)

`npm run test:integration:clawpump` (`scripts/gate-clawpump.ts`) creates one agent through the real
adapter, checks its wallet on **mainnet** (where agent wallets live), sends the real worker prompt
with a live Hermes TSLA price, and checks the wallet again. Every wallet check read 0 lamports and
no token accounts.

| Call                                    | Agent       | Result                                                                                                                      |
| --------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------- |
| Gate, agent never started               | `ee16d48e…` | HTTP 500 after 61 s; no message, usage or cost recorded. Agents are created `stopped`; the adapter now calls `POST /start`. |
| Gate, after `/start`                    | `51d9bdad…` | 16.8 s, `requestId 6f58c251…`. Dashboard history: `kimi-k2.5` returned the exact strict JSON. REST `content` was **empty**. |
| Diagnostic `{"ok":true}`                | `51d9bdad…` | `content` correct, but answered by **`openai/gpt-5.4-mini`**, 4,068 prompt tokens, `cost: 0` in the body.                   |
| Diagnostic with `model` + `temperature` | `51d9bdad…` | Still `openai/gpt-5.4-mini`. The documented per-call override was not honoured.                                             |

Account credit went 1.008299 → 0.99798 ($0.0103) across the three billed calls. After the first two,
`get_usage` showed $0.0054 for 2 requests, so the `gpt-5.4-mini` call was billed although its body
said `cost: 0`.

Workaround for the empty `content`: the adapter reads `GET /agents/{id}/messages` (shape checked
live: `messages[].role/content/model/createdAt`, oldest first) and takes the assistant message that
follows the exact prompt it sent. No second chat is issued.

Blockers to raise with ClawPump: (1) why a paid, pinned model is replaced by `gpt-5.4-mini`;
(2) why the REST `content` was empty when the stored message holds the reply; (3) whether the
~4k-token prompt means tool definitions are sent to the model. Both test agents were stopped via
`POST /stop` afterwards (not deleted); both are `is_public: true` and `accepting_bids: true`, with always-on skills
including `wallet-ops`, `perps-trading`, `x402` and `private-transfers`.

## ClawPump model switch (verified 2026-09-25)

`CLAWPUMP_PAID_MODEL` changed from `moonshotai/kimi-k2.5` to `openai/gpt-5.4-mini` (catalog:
$0.975 / $5.85 per million input/output tokens). Account credit before the tests: 0.940347.

- **kimi-k2.5 failed intermittently.** Across devnet matches `5T7zsLv…`, `EXoU3ka…` and `Hj6TmiY…`,
  7 of 14 chats that reached ClawPump returned HTTP 500 after 35–60 s with no `requestId`, and none
  of them appear in the agent's message history. Agents were `running` throughout.
- **gemini-2.5-flash is unusable here.** Two gate runs (agents `93af2751…`, `845226f9…`, requestIds
  `ef7ce90b…`, `4a839619…`, 8.4 s each): ClawPump fetched `https://Equity.US.TSLA/USD` from the
  symbol and the reply led with the fetch error, then a fenced object. Strictly parsed as
  malformed, even after the prompt forbade tools.
- **gpt-5.4-mini passes.** Gate requested `openai/gpt-5-mini`; creation reported
  `openai/gpt-5.4-mini`, so that is the configured value. Agent `595a4da8…`, `requestId a1f79aef…`,
  3.2 s, strict JSON parsed `valid`. Every agent wallet read empty on mainnet before and after.
- The earlier `schemaVersion` malformed replies were a prompt bug (the value was never shown); the
  prompt now includes `"schemaVersion": 1`.
- Open: ClawPump replays each agent's chat history to the model, and battle agents are reused per
  wallet, so a reply referenced the player's strategy from a previous match. Not yet fixed.

## Web transaction builders on devnet (verified 2026-09-23)

`apps/web/src/lib/transactions.ts`, the builders behind the web app's wallet actions, driven from a
script with the demo player keypairs (the wallet adapter only signs). Cross-token: player A stakes
0.05 OPENAI-DEV, player B 0.05 AAPLX-DEV, demo profile, placeholder commitments.

| Step                                  | Result                                                                           |
| ------------------------------------- | -------------------------------------------------------------------------------- |
| Create `A1i4T3tQ…` → cancel           | `2S1B2uwG…`, `4uqtET48…`; `open` → `cancelled`; A's OPENAI-DEV restored exactly  |
| Create `B2NVEyZt…` → B joins          | `X4YAQmTU…`, `3QxmqUi7…`; state `ready`                                          |
| Refund before the activation deadline | Rejected in simulation: "The activation window is still open; …"; nothing signed |
| Both refund after the deadline        | `Vk5peg9E…`, `4VdmbwxA…`; `failureRefundable`; both balances restored exactly    |

Claim, exercise and reclaim need a settled match, so they wait for the worker rehearsal.

## Benchmark decision

Chosen symbol: **`Equity.US.TSLA/USD`** (23 Sep 2026).

The benchmark only has to be a public stock (the user confirmed any stock is acceptable). The Pyth
Terminal trial grants 21 feeds; the only single stock among them is TSLA (the others are QQQ and VOO,
both ETFs). NVDA, AAPL, AAPLX and AAPLON are not on the trial. Fallback order is now
`Equity.US.TSLA/USD` → `Equity.US.QQQ/USD` → `Equity.US.VOO/USD` → stop and report. A generic crypto
feed is never an acceptable fallback.

| Field                            | Value                                                                                                             |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Symbol                           | `Equity.US.TSLA/USD` (TESLA INC / US DOLLAR, spot, min publishers 2, state stable)                                |
| Core feed ID (32-byte hex)       | `0x16dad506d7db8da01c87581c87ca897a012a153557d4d578c3b9c9e1bc0632f1`                                              |
| Catalogue source URL             | `history.pyth-lazer.dourolabs.app/history/v1/symbols` (`hermes_id`), matches `hermes.pyth.network/v2/price_feeds` |
| Date resolved                    | 2026-09-23                                                                                                        |
| Exponent                         | −5 (same as the program's `BENCHMARK_EXPONENT`; no program change)                                                |
| Reason for falling back (if any) | NVDA not entitled on the Pyth Terminal trial                                                                      |

Pro/Terminal ID for TSLA is 1435; like 1314 (NVDA) it is not a Core ID. Regular session is
09:30–16:00 America/New_York; Pyth Pro also lists pre-market, post-market and overnight sessions.
Hermes Core pre-market publishing verified 23 Sep 2026 (see below).

**API key (gates 5 and 7), 23 Sep 2026.** The Terminal trial ("Demo") shows 13 days remaining, so
it ends ~6 Oct, after judging. The Free plan has no API access, so the trial is the only API route.

At 08:14 UTC the key returned TSLA from Hermes Core on both `pyth.dourolabs.app/hermes` and
`hermes.pyth.network`: price `38060001`, expo −5, conf `8001` (~2 bps), publish time
2026-09-23 08:14:03Z, 633-byte signed binary update. The Pro History API returned TSLA (1435) with
`market_session: "preMarket"`, 13 publishers — so the benchmark publishes outside the regular
session. The Pyth MCP server (`mcp.pyth.network/mcp`) returned the same price.

Two traps, both observed:

- Pyth answers **`invalid API key` for a valid key requesting a feed the plan does not entitle**
  (NVDA returned it at the same moment TSLA succeeded). Do not read that message as a bad key.
- Between ~07:00 and 07:25 UTC the same key was rejected everywhere, including for entitled feeds;
  it worked by 08:13. A freshly issued trial key appears to need time to activate.

## Devnet assets (gates 1, 3, 4, 13 — verified 2026-09-23)

Created by `scripts/setup-devnet.ts` (re-run confirmed idempotent: both mints reused, nothing minted).

| Role           | Address                                        | Devnet SOL (23 Sep) |
| -------------- | ---------------------------------------------- | ------------------- |
| Deploy / admin | `ChiKEw62eYHh4QnWwCHbzk12CwM4gdyJgTUAcA1fTWsH` | 20.9                |
| Orchestrator   | `B5yRr7xG5Rm7SbwM2k8swGrM6A35nRQ43QF42nEEMndM` | 0.995               |
| Player A       | `4TafDy66p9jT9Fn58vC6JM1Pw5yeGVfJtYskMgyH9cno` | 5.66                |
| Player B       | `88Tq3dYiim1nuegSAMNkNtU9cmfRP4fiYYe8Ksp87ArG` | 2.00                |

| Mint                                                        | Label                                       | Decimals | Extensions                     | Freeze | Per player |
| ----------------------------------------------------------- | ------------------------------------------- | -------- | ------------------------------ | ------ | ---------- |
| `8u5symXKPiA5wvUzkEy8HKS184j2of29ZkWwkiqUDkHV` (Token-2022) | `OPENAI (devnet test copy)` / `OPENAI-DEV`  | 9        | MetadataPointer, TokenMetadata | none   | 100        |
| `9XfmajjGiw7u4UmWHJM9CZ14NpJnbB5F7Kv3AH1pbUiW` (Token-2022) | `USDC-DEV (devnet test quote)` / `USDC-DEV` | 6        | MetadataPointer, TokenMetadata | none   | 100,000    |

Both mints carry only the extensions `create_arena` allows. Mint authority is the deploy wallet.
Circle devnet USDC was not used: its faucet is a captcha-gated web page, and §2 permits a labelled
six-decimal `USDC-DEV`.

## Program deployment (verified 2026-09-23)

`stock_arena` `8xYafVKnRmi99cRPQV2TLRHRH2MsfjZtJH4DMy8anHiC` deployed to devnet by the deploy wallet
(upgrade authority) after `scripts/verify.sh` passed. `npm run setup:devnet` then initialized the
protocol (admin `ChiK…`, orchestrator `B5yR…`, 9–15 min durations, 60 s max price age, 500 bps max
confidence) and created the OPENAI Arena (TSLA Core ID, exponent −5, `USDC-DEV` quote). A re-run
read both accounts back and matched admin, orchestrator and mints. Signatures in `code.md` §20.

| Account        | Address                                        |
| -------------- | ---------------------------------------------- |
| ProtocolConfig | `GpEb3kYnx6N1XvhEQpcEcVu6eWGeAQq4nSnLTGwXYegj` |
| OPENAI Arena   | `EiU5fEjdekCARW7eUseaebi23HwAjZZJ9789Kx28KiPt` |

## AAPLX tokenized-stock Arena (verified 2026-09-23)

Mainnet mint `XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp` (Apple xStock, issuer Backed Finance).
Resolved from `https://api.backed.fi/api/v1/token` (`deployments[].network == "Solana"`, `svm:`
prefix) and matched against the `xstocks.fi` site's `addresses.solana`. Mainnet RPC: Token-2022,
**8 decimals**, mint and freeze authorities set, extensions `metadataPointer`, `permanentDelegate`,
`defaultAccountState`, `scaledUiAmountConfig`, `pausableConfig`, `confidentialTransferMint`, a
dormant `transferHook` (no program) and `tokenMetadata`. No transfer fee.

As with OPENAI the devnet copy reproduces only the token program, decimals and label:
`AAPLX (devnet test copy)` `2dQA9pgpvuBqdB4Q5xp2Ruxh8yE7hGeWQ52x85V94dKg`, both players funded with
100 AAPLX-DEV. Arena `GiQBaoRxcEBRoTNFVxdaKqFe8S5ih7oXvCaGaTvnVPC1` (TSLA benchmark, `USDC-DEV`
quote); `create_arena` accepting it proves the copy passes the extension allowlist.

Cross-token smoke test after the in-place upgrade (`4naJVC…MzcDVMcXB`), match
`2YXxVDFqfdGDev62FPWU1hVvjBo4twVRtnf4QPkaBhvs`: create `7YS3zi…yuFqFJcXiHFTtSA`, join
`3uQqEC…Hf5nFB5HMzWtUY`, refunds `29CeTV…jNk2Px8P` and `3kT5Gd…6EXwZ445cNDKR71B`. Vaults held
50,000,000 and 5,000,000 base units (0.05 each), then zero; both players restored exactly.

## Devnet post/read (gate 8, verified 2026-09-23)

A live Hermes TSLA update was posted through the Pyth receiver
(`rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ`) on devnet by the orchestrator
`B5yRr7xG5Rm7SbwM2k8swGrM6A35nRQ43QF42nEEMndM`, read back, and closed.

| Field                 | Value                                                                                                                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PriceUpdateV2 account | `7mERnirR6x9uwCaF6BY5ZauMURdu5hQgQJeZVwCjPkNo` (owner: receiver)                                                                                                                     |
| Post signatures       | `D55eBFzjuzArW81VQX78SqcDqBz3LdziiUNbbiS5e4aJZHfpJ25wHfMoDLNFfdtKd35yZv6jdHAZzvQaJ5spboW`, `DouUhyRM7SGhkrSrB1KPJQVPUcXoYt6CAw7Td8CPDSg4LepEKtYEKSg8NAWW9EsBdkxc3FAJkB7r3BEt7zUexPu` |
| Read back             | feed `0x16dad506…32f1`, price `38075000`, expo −5, conf `8000`, publish `1790152084` — identical to Hermes; verification level `Full`                                                |
| Close signature       | `2iXp4FRNKG4MVL6sS1UNSaFejTtVqa4A62utNQrjPr3Yud4XDSV1nynGpApDexm1udAQCHGyETFEF9jc1MoiWy2J`                                                                                           |
| Net cost              | 0.00243273 devnet SOL (rent reclaimed on close)                                                                                                                                      |

`tightComputeBudget: true` fails: the SDK caps the transaction at its 35,000-unit `PostUpdate`
estimate, which `PostUpdate` itself nearly exhausts (34,966). The worker no longer sets it.

## Mainnet mint inspection — OPENAI (verified 2026-09-22)

`getAccountInfo(PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF, jsonParsed)` against
`api.mainnet-beta.solana.com`, slot 449409901. The mint documented in `code.md` §3.1 is real and
its on-chain metadata matches ("OpenAI PreStocks" / `OPENAI` / `https://prestocks.com/metadata/openai.json`).
Read-only; no value moved.

| Property         | Value                                                                   |
| ---------------- | ----------------------------------------------------------------------- |
| Token program    | Token-2022 `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb`                |
| Decimals         | 9                                                                       |
| Supply           | 1901852418781 base units                                                |
| Mint authority   | `WV9PJN7XTmTLVwbutCLFxp8TyePee6Xq5mRq6Fti5Wc`                           |
| Freeze authority | `WV9PJN7XTmTLVwbutCLFxp8TyePee6Xq5mRq6Fti5Wc` (same key as every other) |
| Account space    | 902 bytes                                                               |

Extensions present:

| Extension                       | State                                                             | Escrow impact                                                                      |
| ------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `transferFeeConfig`             | **100 bps** now (50 bps prior epoch), `maximumFee` = `u64::MAX`   | **Fatal** — uncapped, so the vault receives less than `stake_amount` at every size |
| `permanentDelegate`             | `WV9PJ…`                                                          | **Fatal** — the delegate can move tokens out of the match vault                    |
| `pausableConfig`                | present, `paused: false`                                          | **Fatal** — a pause would block refunds, claims and expiry reclaim                 |
| `transferHook`                  | authority `WV9PJ…`, `programId: null`                             | Dormant but armable by that authority                                              |
| `confidentialTransferMint`      | authority `WV9PJ…`, auto-approve off                              | Moves balance out of plain view                                                    |
| `confidentialTransferFeeConfig` | harvest enabled, withheld 0                                       | —                                                                                  |
| `defaultAccountState`           | `initialized`                                                     | Benign today; `frozen` would break vault ATA creation                              |
| `scaledUiAmountConfig`          | multiplier 1 → **1.4861347**, effective 1784305800 (already live) | Display only; base units unaffected                                                |
| `metadataPointer`               | self-pointing                                                     | Benign                                                                             |
| `tokenMetadata`                 | OpenAI PreStocks / OPENAI                                         | Benign                                                                             |

**Consequence.** `code.md` §3.1 already requires the devnet copy to be created **unrestricted** with
the same token program and decimals, so the copy is Token-2022 with 9 decimals and _none_ of the
fatal extensions. Sent equals received, and the existing exact-amount deposit accounting stays
correct. The copy therefore does **not** reproduce the transfer fee: reproducing it would contradict
§3.1, force balance-delta accounting through every payout path, and double the escrow-conservation
test matrix, while adding nothing to the demo.

What changed in the program: `create_arena` now rejects any asset or quote mint carrying a
Token-2022 extension outside a two-entry allowlist (`MetadataPointer`, `TokenMetadata`, needed for
the `<SYMBOL> (devnet test copy)` label). The rule the spec already stated is now enforced on-chain
rather than trusted from a setup script, because the Arena registry is configuration and pointing it
at a restricted mint is the reachable mistake. Legacy SPL Token mints have no extension area and
pass without inspection.

Still open for gate 3: whether `spl-token-cli` / the setup script creates the devnet copy with the
metadata extensions only. Gate 1 (live PreStocks API response) remains UNVERIFIED — this check read
the chain directly, not `prestocks.com/api/prestocks`.

## ClawPump launch route (answered 2026-09-22)

Source: ClawPump Discord, Tomi204, across 20–22 Sep 2026. Recorded because it reverses the earlier
plan; `code.md` §3.4 carries the requirement text.

| Question                               | Answer                                                                    |
| -------------------------------------- | ------------------------------------------------------------------------- |
| What satisfies the ClawPump track?     | "The requirement is a clawpump token" — it must launch on ClawPump        |
| Is Meteora reachable through ClawPump? | Yes: start on **DBC**, graduate to **DAMM v2**                            |
| Custom quote pair (a stock token)?     | "Yes, you can set a custom pair"                                          |
| Who handles fees?                      | "We manage and distribute the fees"                                       |
| Our own DBC pool outside ClawPump?     | **Disqualifying** — "you can, but you can't participate on the hackathon" |
| Other configurables                    | Holder rewards, buybacks, burns; Tomi204 offered to add a specific config |

So: no separate Meteora DAMM v2 pool of ours, no self-run DBC pool, and the dev-buy wallet question
is moot because ClawPump owns the launch.

**Meteora track: not claimed.** Permitted alongside ClawPump, but the three-sponsor cap
(`code.md` §18) is spent on Pyth, PreStocks and ClawPump, and the DBC configuration a Meteora entry
would be judged on is set by ClawPump rather than by us.

**Two things still unconfirmed — gate 12 stays UNVERIFIED until both are answered.**

1. Whether the DBC launch is exposed through the partner API or only at `clawpump.tech/launch`. The
   partner API documents no DBC route, and the launch page renders client-side so it could not be
   read here. The linked example token (`EpXtn6xGoZ4Y45vRjiDUHSCGbBoJD5FaEqZbF98YswH1`) is a
   Pump.fun/SOL pair, not a DBC stock pair, so it is not evidence either way. A web-only manual
   launch on Thursday with saved transaction links is acceptable.
2. Whether their DBC accepts a Token-2022 quote mint charging a transfer fee. The real OPENAI mint
   charges 100 bps uncapped and carries a permanent delegate over every holder's balance; AMMs
   frequently reject or mis-account fee-bearing mints. Ask before assuming the pair is configurable.

Do **not** resolve (2) by minting a wrapped fee-free copy of the PreStock. Another team in that
thread is doing exactly this; a home-made wrapper is not an official PreStocks asset and puts the
PreStocks track at risk for a launch that is optional anyway.

## Toolchain (verified 2026-09-21)

Running under WSL Ubuntu; the repo lives on the Windows filesystem at `/mnt/e/stocklana/pvpstats`.

| Tool           | Version                                                     |
| -------------- | ----------------------------------------------------------- |
| anchor-cli     | 0.31.1 (pinned via `avm use 0.31.1`; 0.32.1 also installed) |
| solana-cli     | 2.3.13 (Agave)                                              |
| rustc (host)   | 1.88.0                                                      |
| platform-tools | v1.48 (rustc 1.84.1 for SBF)                                |
| node           | 20.19.5 (WSL) / 24.13.1 (Windows)                           |
| PostgreSQL     | 14.18 (WSL)                                                 |

`solana` and `anchor` are not on the non-interactive login PATH. Prefix commands with:

```
export PATH="$HOME/.avm/bin:$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$PATH"
```

### Running Node from WSL against a Windows-installed `node_modules`

The Solana toolchain lives in WSL but `npm install` runs from Windows, so `node_modules` carries
win32 native binaries. Any native module then fails when the same tree is used from WSL. Two were
hit and fixed by installing both platforms' binaries side by side, which coexist fine:

```sh
npm install -D --force @rollup/rollup-linux-x64-gnu@<rollup ver> @esbuild/linux-x64@<esbuild ver>
```

Keep these pinned to the exact versions of the installed `rollup` and `esbuild`, or Vitest fails at
startup under WSL with a misleading "npm has a bug related to optional dependencies" message.

`litesvm` and `solana-bankrun` publish no win32 binary, and `litesvm-wasm32-wasi` does not exist,
so the program tests run **under WSL on bankrun**. bankrun is required rather than a validator
because only it can warp the bank clock, and every deadline in `code.md` §5.1 is pinned in
`create_arena` and therefore has to be reached by warping rather than by shortening the window.

The cross-platform native binaries are kept out of `package.json` on purpose: declaring
`@esbuild/linux-x64` as a dependency makes every Windows `npm install` fail with
`Unsupported platform`. They install via `npm run wsl:deps`, and a later `npm install` prunes them.

`anchor-bankrun@0.5.0` declares a peer of `@coral-xyz/anchor@^0.30.0`, which excludes the pinned
0.31.1, so it is installed with `--legacy-peer-deps`. It is a thin Provider shim and the program
tests exercise it directly, so the skew would surface immediately.

**Two exit-code traps.** `anchor test` returned 0 on a run where Vitest crashed at startup and
zero tests executed. Worse, `$?` does not survive a `wsl.exe -d Ubuntu -- bash -lc '...'`
invocation — it is expanded by the outer shell, so a hand-captured exit code reads 0 no matter
what happened, which hid a failing `cargo clippy` for some time. Use `cmd && echo PASS || echo FAIL`
inside the WSL shell, read the Vitest summary, and treat a missing summary as a failure.
`scripts/verify.sh` does all three.

### Pinned dependency downgrades

`anchor build` compiles the program with platform-tools v1.48, whose bundled cargo is **1.84.0**
and cannot even _parse_ a manifest declaring `edition = "2024"`. Eight crates in the resolved graph
had moved past it — either declaring edition 2024 or a `rust-version` above 1.84.1 — so
`Cargo.lock` holds deliberate downgrades:

| Crate                  | Pinned | Was    | Reason                                                      |
| ---------------------- | ------ | ------ | ----------------------------------------------------------- |
| `blake3`               | 1.5.5  | 1.8.7  | pulled `digest 0.11` -> `block-buffer 0.12.1`               |
| `proc-macro-crate`     | 3.2.0  | 3.5.0  | pulled `toml_edit 0.25`, `toml_parser`, `toml_datetime 1.x` |
| `indexmap`             | 2.9.0  | 2.14.2 | edition 2024                                                |
| `hashbrown`            | 0.15.5 | 0.17.1 | came down with `indexmap`                                   |
| `zeroize`              | 1.8.1  | 1.9.0  | held `zeroize_derive` at 1.5.0                              |
| `zeroize_derive`       | 1.4.2  | 1.5.0  | edition 2024                                                |
| `unicode-segmentation` | 1.12.0 | 1.13.3 | declares `rust-version = 1.85.0`                            |

`anchor-lang` and `anchor-spl` are pinned `=0.31.1` to match the CLI exactly rather than drifting
to 0.31.2 on a `^` bump.

**Commit `Cargo.lock`, and do not run a bare `cargo update`** — it re-resolves straight back to
the edition-2024 versions and the build stops parsing manifests again. To re-check the graph after
any dependency change, scan every resolved manifest rather than discovering one crate per build:

```sh
cargo fetch
python3 - <<'SCAN'
import re, glob, os
def ver(s):
    p = [int(x) for x in re.findall(r"\d+", s)[:3]]
    return tuple(p + [0] * (3 - len(p)))
LIMIT = (1, 84, 1)   # the rustc inside platform-tools v1.48
lock = open("Cargo.lock").read()
pkgs = re.findall(r'\[\[package\]\]
name = "([^"]+)"
version = "([^"]+)"', lock)
roots = glob.glob(os.path.expanduser("~/.cargo/registry/src/*"))
bad = []
for n, v in pkgs:
    for r in roots:
        p = os.path.join(r, n + "-" + v, "Cargo.toml")
        if os.path.exists(p):
            t = open(p, encoding="utf-8", errors="ignore").read()
            m = re.search(r'^rust-version\s*=\s*"([^"]+)"', t, re.M)
            if m and ver(m.group(1)) > LIMIT:
                bad.append((n, v, m.group(1)))
            elif re.search(r'^edition\s*=\s*"2024"', t, re.M):
                bad.append((n, v, "edition2024"))
            break
for b in sorted(bad):
    print("%-32s %-12s needs %s" % b)
print("COUNT", len(bad))
SCAN
```

Program ID (devnet + localnet): `8xYafVKnRmi99cRPQV2TLRHRH2MsfjZtJH4DMy8anHiC`
Keypair: `target/deploy/stock_arena-keypair.json` (gitignored).

## Known gaps in the specification

Raised while reading `code.md`; each needs a decision before the code that depends on it lands.

1. **Quote ATA on exercise.** §7.1 has no persistent quote vault — quote tokens move winner
   → loser directly. If the loser holds no quote-mint token account, `exercise_option` fails and
   the winner loses the option through no fault of their own. Resolution: create it with
   `init_if_needed`, winner pays the rent.
2. **Missing strategy row.** The strategy endpoint is unauthenticated and write-once, and the
   worker needs that row to build a prompt. §5.6 defines penalties for timeout, API error and
   malformed output, but not for a player who never posted a strategy. Resolution: reuse the
   existing maximum-penalty outcome.
3. **`mark_oracle_failure_refundable` has no named caller.** §7.4 says anyone may settle but is
   silent here. Resolution: permissionless once `settlement_deadline_ts` has passed, which is the
   only reading consistent with "every non-terminal state has a player-controlled or
   permissionless safe exit". The same reading is already applied in `refund_failed_match`, which
   makes the activation-failure exit permissionless after `activation_deadline_ts`. **Resolved for
   activation failure; still open for oracle failure, which needs settlement to exist.**
4. **Exponent handling.** §5.6 says normalize to the Arena exponent; §14 says reject
   incompatible exponents. Resolution: on-chain, require the feed exponent to equal
   `arena.benchmark_exponent` and reject otherwise — the worker normalizes agent-supplied prices
   off-chain before submitting. A lossy rescale is refused rather than truncated.
5. **Demo profile margin.** Rounds sit 180 s apart against a >= 120 s agent timeout plus
   confirmation. Inside the stated rule, but a single slow ClawPump turn consumes the window.
6. **`npm run lint`** is not yet defined; strict `tsc` covers the typing half. ESLint is deferred
   until the required behavior is complete.

## Pyth receiver SDK compatibility (resolved 2026-09-21)

`code.md` §7 makes Anchor 0.31.1 conditional on "compatib[ility] with the selected Pyth receiver
SDK". It is compatible, but only with a specific version and a pin.

| SDK version        | Verdict                                                                                                                                                                                                          |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `2.0.0` (Jun 2026) | **Unusable.** Pulls a second `anchor-lang 1.2.0` plus `solana-address 4.x`, `solana-hash 4.x`, `solana-pubkey 4.x`, `wincode`, all requiring rustc **1.89**. Platform-tools v1.48 ships **1.84.1**. 23 blockers. |
| `0.6.1` (Apr 2025) | **Works**, but only after pinning. Its `anchor-lang` requirement is a loose range, so cargo still resolves 1.2.0 on its own.                                                                                     |

The fix is `cargo update anchor-lang@1.2.0 --precise 0.31.1`, which unifies both copies on 0.31.1 and
drops roughly twenty transitive crates. Verified: scan reports zero blockers and `anchor build`
passes with the SDK linked.

**Do not bump `pyth-solana-receiver-sdk` past 0.6.1** without either upgrading platform-tools to a
rustc >= 1.89 release or dropping the SDK and decoding `PriceUpdateV2` directly. Either is a real
piece of work, not a version bump.

## Review findings addressed 2026-09-21

An external review found five issues; all five are fixed.

| Finding                                                                                | Resolution                                                                                                                  |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Joined deposits had no exit: `Ready` was reachable but no instruction accepted it      | Added `refund_failed_match`, permissionless after the activation deadline, per-player and replay-safe                       |
| Program tests ran but did not typecheck (15 errors)                                    | Typed as `Program<StockArena>` with `.accountsPartial()`; `npm run typecheck` now includes `tests/` so it cannot hide again |
| Agent-price parsing accepted values above `i64::MAX`                                   | Both `predictedFinalPrice` and `observedPrice` bounded to `i64::MAX`, with regression tests at the boundary                 |
| Join and activation windows were loosened to "any positive value" for test convenience | Pinned to the §5.1 values; the harness moved to bankrun and warps the clock instead                                         |
| Test coverage narrower than reported                                                   | Added wrong-mint, underfunded join, repeat join, cancel-after-join and six refund cases                                     |

The fourth item is worth remembering as a rule: a test that needs a production constant relaxed is
a sign the harness is wrong, not the constant.

## Mainnet trade price for xStocks (Jupiter) — 24 Sep 2026

Backed's `api.backed.fi/api/v1/token` publishes mints but no price. The AAPLX mainnet price shown on
the Arena card and used to pre-fill strikes comes from Jupiter's public price API,
`GET https://lite-api.jup.ag/price/v3?ids=<mint>` (no key), adapter
`packages/integrations/src/jupiter.ts`. Live response for `XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp`:
`usdPrice` 335.699…, `liquidity` ≈ 570k, `stockData.price` 336.86 (xStocks reference). Display and
strike suggestion only: the signed USDC strike remains the only price any instruction uses. PreStocks
Arenas keep the official PreStocks `tokenPrice`.
