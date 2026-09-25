# Stock Arena

**Stake a pre-IPO or tokenized stock. Send an AI agent to predict a real stock. The better
prediction wins.**

Stock Arena is a two-player prediction game on Solana. Each player stakes a tokenized stock (a
PreStocks pre-IPO token such as OpenAI, or an xStock such as Apple), writes a strategy in plain
English, and hands it to an AI agent. The two agents predict where Tesla's price will be at the end
of a short match. A Pyth price feed records the real result, and an on-chain program scores both
agents and pays the winner.

Live demo (Solana devnet): **https://stockarena-web-kohl.vercel.app**

> Experimental hackathon prototype on Solana **devnet**. Staked tokens are test copies with no
> monetary value. Real PreStocks and xStocks prices are shown for reference only. Not investment,
> legal or financial advice.

## Why it is easy to play

- **No trading skills needed.** Your strategy is one sentence, like _"Predict the latest price
  unless there is a clear trend."_ Three presets are one click away.
- **Your wallet signs, nobody else holds your funds.** Stakes sit in an on-chain escrow account that
  only the program can move. There is no admin withdrawal.
- **Every match has an exit.** If nobody joins, the match stalls or the price feed fails, each
  player can take their stake back. Pausing the game never blocks a refund or claim.
- **Plain-language status.** The match page says what is happening and what you can do next, with a
  live price chart and each agent's prediction as it lands.
- **Fair and checkable.** Strategies are locked in with a hash before the match starts. The proof
  page shows each strategy, each agent's full answer and every transaction, so anyone can verify
  the result.

## How a match works

1. **Challenge.** Player A picks both stakes (0.05 tokens or more each), the USDC price for each
   side, a 9- or 15-minute match and a strategy, then signs.
2. **Join.** Player B has 15 minutes to accept the terms, add their strategy and sign.
3. **Predict.** At the start and at one-third and two-thirds of the match, both agents predict the
   final TSLA price. Rounds are weighted 20%, 30% and 50%.
4. **Settle.** At the end, the real TSLA price is recorded from Pyth and the program picks the
   agent with the smaller weighted error.
5. **Collect.** The winner takes back their own stake and, for 10 minutes, can buy the loser's
   stake at the agreed USDC price. If they don't, the loser takes it back.

| Part                | Role                                                       |
| ------------------- | ---------------------------------------------------------- |
| PreStocks / xStocks | The staked assets (devnet test copies; mainnet data shown) |
| ClawPump            | The AI agents, each with an empty wallet                   |
| Pyth                | The TSLA price that settles every match                    |
| Solana program      | Escrow, scoring, winner selection and payouts              |

## Run it locally

### Prerequisites

- Node.js 20.6 or newer
- PostgreSQL (a local database or a free Supabase project)
- A Solana wallet such as Phantom, set to **Devnet**
- API keys: Pyth (Hermes), ClawPump (`cpk_…`), and devnet plus mainnet RPC URLs (for example
  Helius)

The Solana program is already deployed to devnet (`8xYafVKnRmi99cRPQV2TLRHRH2MsfjZtJH4DMy8anHiC`),
so you don't need the Rust toolchain to run the app.

### Setup

```sh
git clone https://github.com/Raveesh1007/PVParena.git
cd PVParena
npm install
cp .env.example .env
```

Fill in `.env`. The important values:

| Variable                                       | What to put                                                        |
| ---------------------------------------------- | ------------------------------------------------------------------ |
| `DATABASE_URL`                                 | Your PostgreSQL URL (Supabase: use the **Session pooler** URL)     |
| `SOLANA_RPC_URL`, `NEXT_PUBLIC_SOLANA_RPC_URL` | A devnet RPC URL                                                   |
| `SOLANA_MAINNET_RPC_URL`                       | A mainnet RPC URL (read-only, for showing real holdings)           |
| `PYTH_API_KEY`, `PYTH_BENCHMARK_FEED_ID`       | Your Hermes key and the TSLA Core feed ID in `config/arenas.json`  |
| `CLAWPUMP_API_KEY`, `CLAWPUMP_PAID_MODEL`      | Your ClawPump key and a paid model, e.g. `openai/gpt-5.4-mini`     |
| `ORCHESTRATOR_KEYPAIR_JSON`                    | A devnet-only keypair with a little devnet SOL, used by the worker |

Create the database tables:

```sh
npx prisma migrate deploy
```

### Start

Run each in its own terminal:

```sh
npm run dev:web      # the website, http://localhost:3000
npm run dev:worker   # runs matches: calls the agents, records prices, settles
```

Run exactly one worker. Matches only progress while it is running.

### Test tokens

Players need devnet test tokens to stake. The project authority mints them and funds wallets:

```sh
SYMBOL=OPENAI AUTHORITY_KEYPAIR=<path> PLAYERS=<walletA>,<walletB> npm run setup:devnet
```

## Deploying

- **Website:** Vercel, Root Directory `apps/web`.
  - Install command: `npm install --prefix=../.. --include=dev`
  - Build command:
    `cd ../.. && npx --no-install prisma generate && npx --no-install tsc --build && npm run build --workspace @stock-arena/web`
  - `DATABASE_URL`: Supabase **Transaction pooler** (port 6543) ending in
    `?pgbouncer=true&connection_limit=1`.
  - Keep `CLAWPUMP_*` and `ORCHESTRATOR_KEYPAIR_JSON` off Vercel. The website never needs them.
- **Worker:** any always-on machine or service (it has no web port). Start it with
  `npm run dev:worker`.

## Project layout

```
apps/web                Next.js website
apps/worker             background process that runs matches
programs/stock_arena    Solana (Anchor) program: escrow, scoring, payouts
packages/integrations   Pyth, PreStocks, xStocks, Jupiter and ClawPump clients
packages/shared         shared schemas, constants and scoring
config/arenas.json      which tokens have an Arena
```

## Tests

```sh
npm run typecheck
npm test                 # unit tests, no network or keys needed
bash scripts/verify.sh   # Solana program tests (Linux or WSL with the Anchor toolchain)
```

## Security

The Solana program alone decides match terms, holds the stakes, validates the Pyth price, scores
the predictions and moves funds. The website, worker, database and agents cannot pick a winner or
move escrow. Scoring uses integer arithmetic only, agent wallets are always empty, and every
terminal action can happen only once.

The worker sees both predictions before submitting them together. That stops players from copying
each other, but the worker itself is trusted to pass answers on unchanged. The proof page's
transcripts and hashes make that auditable.

## More

- `code.md`: full product and technical specification
- `DESIGN.md`: visual design system
- `docs/integration-readiness.md`: evidence for each external integration
