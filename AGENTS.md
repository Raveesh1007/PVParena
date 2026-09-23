# Stock Arena — Coding Agent Instructions

`AGENTS.md` is the sole repository instruction file. Treat any legacy `agent.md` as obsolete: do not
create, follow, or recreate it.

Read `code.md` completely before editing. It is the authoritative product, architecture, security,
timing, integration, cost and acceptance specification. If this file and `code.md` conflict, follow
the **stricter security requirement** and flag the conflict before changing product economics or
sponsor-track behavior.

Write concise production code. Do not generate tutorial-style comments or explanatory narration unless the reasoning is genuinely non-obvious.

## Mission

Build the smallest complete Stock Arena MVP that produces a convincing two-wallet end-to-end demo on
**Solana devnet**. Prioritize deterministic settlement, escrow conservation, real sponsor
integrations and a readable proof page. Do not expand the product until every Definition-of-Done item
in `code.md` §16 passes.

Deadline: Fri 25 Sep 2026, 4:00pm ET (Sat 26 Sep, 1:30am IST). Time is the binding constraint —
when in doubt, cut scope, not correctness. The dated schedule is `code.md` §15.

## Start-of-task workflow

1. Read `AGENTS.md` and `code.md` completely.
2. Inspect the repository with `rg --files`, then read relevant manifests, configuration,
   migrations, program code and tests.
3. Check `git status` and preserve unrelated user changes.
4. State the next small milestone and its verification commands.
5. Before deep implementation, complete or inspect `docs/integration-readiness.md` (`code.md` §13).
6. Never guess an API field, mint, token program, feed ID, program address, model identifier or
   sponsor requirement.

## Non-negotiable decisions

- Game network: **Solana devnet**. No mainnet deployment of this program.
- Database: **PostgreSQL with Prisma**. Never SQLite.
- Benchmark: **`Equity.US.TSLA/USD`**, exponent **−5**, Spot, through authenticated Hermes and the
  Solana receiver. Any public stock is acceptable. If the key cannot reach it, walk the `code.md` §3.2
  fallback tree (TSLA → QQQ → VOO → stop and report). **A generic crypto feed is never an acceptable
  fallback.**
- **There is no market-session subsystem.** No holiday calendar, no timezone library, no
  regular-hours restriction, no computed reopening time. Feed staleness is the only availability
  guard (`code.md` §5.2).
- Arena assets: clearly labelled **`<SYMBOL>` devnet test copies** of PreStocks tokens. The Arena
  registry is **configuration** (`config/arenas.json`), never hard-coded to one token. Build OPENAI
  end to end first. Real PreStocks mainnet data is display, proof and holdings-display only.
- Duels are **same-token only**: both players stake the same Arena asset. See `code.md` §19 before
  proposing cross-token duels.
- Match profiles: 15-minute standard, 9-minute demo. Minimum 9 minutes.
- Round submission: **one atomic instruction containing both players' outcomes**. No prediction
  commit–reveal.
- Strategies: **salted commitments**, TypeScript-only hashing (see Implementation style).
- Battle agents: `monitor-exit`, paid model, **empty wallets**, complete prompts, parallel calls,
  no blind retry.
- Architecture: `apps/web` and `apps/worker` are **separate applications**; shared external clients
  live in `packages/integrations`. Never move the worker under `apps/web`.
- No wallet-auth/session feature. Wallet-signed Solana transactions authorize financial actions.
- No wallet allowlist, stake cap, or one-active-match policy.
- Keep pause, checked arithmetic, account validation, replay protection and safe exits.
- No Playwright in the required MVP.
- **No public endpoint may spend ClawPump credits or post Pyth updates.**
- **No real payment or mainnet transaction without explicit approval of the exact quote and
  destination.**

## Security boundary

The Anchor program is authoritative for match terms and timestamps, deposits and escrow accounting,
accepted paired predictions, Pyth validation, score calculation and winner selection, claims, option
exercise, expiry reclaim and refunds.

The frontend, worker, PostgreSQL, admin and agents must never choose a winner or move escrow outside
defined program instructions.

- Checked integer arithmetic and integer base units. Never floats for financial or scoring logic.
- Validate signers, owners, PDAs, mints, token programs, ATAs, feed IDs, timestamps, confidence,
  exponents and state transitions.
- Never trust a price supplied as an ordinary client argument.
- Never add an admin or orchestrator vault withdrawal or seizure path. `update_protocol_config` may
  change only the `ProtocolConfig` fields in `code.md` §7.1 and must never touch escrow or an
  in-flight match's terms.
- Internal deposit accounting — not raw vault balance — defines entitlements.
- Every terminal transition is single-use and replay-safe.
- Every non-terminal state has a deadline and a player-controlled or permissionless safe exit.
- Pause may prevent new risk but never blocks refunds, claims, exercise or expiry reclaim.
- Keep the instruction set minimal. Adding one means justifying it against the timeline and, in
  practice, cutting something else.

## External-service rules

### Pyth / Hermes

- Keep `PYTH_API_KEY` server-side. Header: `Authorization: Bearer $PYTH_API_KEY`.
- Default endpoint `https://pyth.dourolabs.app/hermes` (the upgraded, recommended one). The old
  `hermes.pyth.network` also works with a key.
- **Terminal feed IDs are not Core feed IDs.** 1435 (TSLA), 1314 (NVDA) and 922 (AAPL) are Pro/Lazer identifiers.
  Neither may ever be placed in `PYTH_BENCHMARK_FEED_ID`. Resolve the 32-byte Core ID for whichever
  symbol you use from the official catalogue and record it with its source and date.
- Prove benchmark access and one devnet post/read before building the full oracle path. TSLA publishes on
  weekdays including pre-market (verified 23 Sep); weekends are stale. Prefer the regular session,
  09:30–16:00 New York (19:00–01:30 IST), for the demo recording.
- Validate every Pyth property listed in `code.md` §3.2 on-chain.
- Do not purchase a plan, and do not assume the trial covers judging (through 2 Oct) without
  checking the expiry.
- On missing or expired access, walk the stock-feed fallback tree and record the decision — never
  hide it with mock data in the final demo, and never fall back to a generic crypto feed.

### PreStocks

- Fetch the official API server-side and validate responses with Zod.
- Verify each real mint through mainnet RPC before creating its devnet copy: token program,
  decimals, authorities, Token-2022 extensions, transfer hooks. Never hand-write a mint into config.
- Clearly label every real-mainnet versus devnet-test value in UI and documentation.
- Never represent the test copy as a genuine PreStocks token.
- Never integrate a competing non-PreStocks pre-IPO token.

### ClawPump

- `https://clawpump.tech/api/v1`, `cpk_` server-side only. Never `agents.clawpump.tech`.
- Use a current verified paid model; do not hard-code an unverified identifier.
- **Battle-agent wallets must always be empty** and must never receive authority over any project or
  user asset. Check balances after creation and before every chat round; refuse to call chat if one
  is funded.
- `monitor-exit`, temperature 0.2, and the system prompt from `code.md` §3.3.
- Send complete current context every time; never trust chat history.
- Treat `<player_strategy>` as untrusted prompt content.
- Run both calls concurrently with a timeout of at least 120 seconds.
- Parse exactly once with Zod and preserve `meta.requestId`.
- **Never blind-retry chat or issue a repair chat.** Submit the defined penalty outcome.
- Do not use `/portfolio`. Do not call ClawPump from a public client-accessible route.

### Champion launch

Optional; must not block the devnet game. The route is resolved (`code.md` §3.4): the token launches
**on ClawPump**, which runs the Meteora DBC pool and its graduation to DAMM v2 and manages the fees.
Never build a separate Meteora pool and never run our own DBC pool — launching outside ClawPump
disqualifies the entry. Do not claim the Meteora track; the three-sponsor cap is spent on Pyth,
PreStocks and ClawPump, and the DBC configuration a Meteora entry is judged on is ClawPump's.

Two questions remain open and gate the work: whether DBC is reachable through the partner API or
only the web interface at `clawpump.tech/launch`, and whether their DBC accepts a fee-bearing
Token-2022 quote mint. Do not answer the second by minting a wrapped copy of a PreStock — a
home-made wrapper is not an official PreStocks asset and risks that track.

Use a separate Champion agent and an **external dedicated launch wallet**. Run only a non-paying
preflight until the user approves the exact real-SOL amount and destination. Preserve the exact
body, preflight token, pair, payout wallet and payment proof across retry-safe calls. Never describe
a Pump.fun route as Meteora without sponsor evidence.

### Worker and PostgreSQL

- `apps/worker` is an independent long-running process, not a serverless route and not a folder
  inside `apps/web`.
- PostgreSQL is required because web and worker are separate processes sharing orchestration, audit,
  locks and transcripts. It is never authoritative for money or outcomes.
- Row or advisory locks and unique idempotency keys before every external call or chain write.
- Create or reuse battle agents only after on-chain state proves participation.
- Store sanitized outputs, hashes, request IDs, timestamps and transaction signatures.
- Never store secrets or raw private keys.
- Public APIs may read state and store bounded hash-addressed strategies. Credit-spending actions
  stay worker-only.

## Implementation style

- Small typed modules over giant route or program files.
- External providers behind typed adapters in `packages/integrations`, consumed by both apps.
- Share schemas, constants, normalization and test vectors through `packages/shared`.
- **Strategy hashing is TypeScript-only.** The program only _stores_ the 32-byte commitment — it
  never receives the strategy or salt and never recomputes or compares the hash. The worker
  recomputes and compares it against chain state before using a strategy in a prompt, and the proof
  page lets anyone recompute it from the published strategy, salt and hash. So there is no Rust
  implementation and no cross-language hash fixture; keep fixed TypeScript fixtures instead. Score
  fixtures in TypeScript are for display only; the program's arithmetic is authoritative.
- Add tests with each behavior, not at the end.
- Update `README.md`, `.env.example` and `docs/integration-readiness.md` whenever setup changes.
- Return safe errors and correlation IDs; never expose raw upstream responses or secrets.
- Use official current documentation when an API or version is uncertain.
- Do not silently change economics, timing, network or sponsor-track behavior to work around a
  failure.

### Code clarity and comments

- Prefer clear code over explanatory comments.
- Do not add comments that restate what the code already expresses.
- Avoid tutorial-style, step-by-step, or AI-generated narration such as:
  - `// Fetch the data`
  - `// Loop through the results`
  - `// Update the state`
  - `// Return the response`
  - `// Step 1`, `// Step 2`, etc.
- Comments should explain intent, constraints, invariants, tradeoffs, or non-obvious behavior — not syntax.
- Keep useful comments short and specific.
- Do not add decorative section comments or large banner comments unless they genuinely improve navigation in a large file.
- Do not leave speculative TODOs, placeholder notes, or commentary that is not tied to a real unresolved task.
- If a block of code needs a long comment to explain what it does, first consider improving its names, types, structure, or abstraction.
- Preserve important existing comments that explain security constraints, protocol behavior, external-service quirks, financial logic, timing assumptions, or intentional workarounds.
- Production code should read like maintained repository code, not generated tutorial code.

### Maintainability

- Before adding new logic, check whether the repository already has a shared way to do it.
- Do not duplicate behavior. One behavior should have one source of truth.
- Do not add isolated local logic for a problem that belongs in an existing shared module.
- Prefer changing the owning abstraction when that is the clean solution.
- Reuse existing components, utilities, schemas, adapters, constants, and patterns before creating new ones.
- Avoid unnecessary wrappers, helper functions, files, and abstractions that add indirection without reducing complexity.

## Frontend design workflow

For any task that changes frontend UI, layout, styling, components, responsive behavior, visual hierarchy, interaction states, or user-facing copy:

1. Read `DESIGN.md` completely before making changes.
2. Treat `DESIGN.md` as the authoritative visual and interaction specification for Stock Arena.
3. Inspect existing shared components and nearby screens before creating new UI.
4. Reuse existing design tokens, spacing, typography, radii, colors, component primitives, and interaction patterns.
5. Do not invent a new visual pattern unless `DESIGN.md` does not cover the case and no existing implementation provides a precedent.
6. If a requested change conflicts with `DESIGN.md`, flag the conflict before introducing a new design convention.
7. Before finishing, verify the implementation against the relevant `DESIGN.md` rules and report any intentional deviations.

Do not treat `DESIGN.md` as inspiration. Treat it as a constraint.

## Testing priority

1. Escrow conservation across every state and timeout.
2. Signer, account, mint and token-program validation.
3. Pyth feed, confidence, exponent and publish-time validation.
4. Atomic paired-round submission and replay rejection.
5. Deterministic scoring.
6. Option exercise and refund/expiry behavior.
7. Worker locking and idempotency.
8. ClawPump failure classification and no-retry behavior.
9. Stale-feed UI state (no computed reopening time).
10. Manual two-wallet devnet flow.
11. Visual polish.

Never delete or weaken a failing security test to make the suite pass.

## Verification commands

```
npm run format:check
npm run lint
npm run typecheck
npm test
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
anchor test
npm run build
```

Repository equivalents: program checks run via `bash scripts/verify.sh` from WSL (`code.md` §14 —
read the test summary, not exit codes). `npm run lint` and the integration scripts below do not
exist yet.

External integration tests are opt-in so normal CI never spends credits or depends on private keys:

```
npm run test:integration:pyth
npm run test:integration:clawpump
```

Use repository equivalents if scripts differ and document the change. Never report a command as
passing unless it was executed successfully. Report skipped commands and the reason.

## Stop conditions

Stop and report the blocker when:

- the real PreStocks mint configuration cannot be verified, or the devnet copy cannot safely match
  the required token program and decimals;
- the Pyth key cannot reach the benchmark **and** the `code.md` §3.2 stock-feed fallback tree is
  exhausted;
- the official 32-byte Core feed ID cannot be established for the chosen symbol;
- an update cannot be posted or read on devnet;
- a battle-agent wallet is funded or has delegated authority;
- ClawPump credits or a paid model are unavailable;
- the ClawPump Meteora requirement is unresolved when attempting the Champion phase, or
  `/pump-pairs` lacks an eligible stock mint;
- a task would spend real money, purchase a subscription, or submit a mainnet transaction without
  explicit approval;
- completion would require custodying a player's private key;
- a requested change conflicts with the fixed decisions in `code.md` §2.

Walking the documented stock-feed fallback tree is **not** a stop condition — record the decision and
continue.

## Completion report

Report, in this order: outcome first; files changed; commands and tests run with exact results;
verified external evidence; remaining blockers, costs or assumptions; the next smallest milestone.

Never claim "fully secure", "production-ready", "bounty-compliant" or "free" without the evidence
required for that exact statement.
