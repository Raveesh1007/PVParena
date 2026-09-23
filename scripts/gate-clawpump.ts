// Gate 10 (`code.md` §13): one empty `monitor-exit` battle agent completes one strict-JSON chat.
// Creates a ClawPump agent and spends one chat's credit, so it is opt-in and never part of `npm test`.
//
//   PLAYER=<devnet player pubkey> MATCH=<devnet match pda> npm run test:integration:clawpump
import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import {
  assertAgentWalletEmpty,
  createBattleAgent,
  fetchLatestPrice,
  loadIntegrationConfig,
  optional,
  required,
  requestPrediction,
} from '@stock-arena/integrations';

import { buildPrompt, predictionContext, type RoundContext } from '../apps/worker/src/agents.js';

const config = loadIntegrationConfig();
const player = new PublicKey(required('PLAYER'));
const mainnet = new Connection(
  optional('SOLANA_MAINNET_RPC_URL', 'https://api.mainnet-beta.solana.com'),
  'confirmed',
);

async function assertEmpty(agentWallet: string): Promise<void> {
  await assertAgentWalletEmpty(agentWallet, async (wallet) => {
    const owner = new PublicKey(wallet);
    const [lamports, classic, token2022] = await Promise.all([
      mainnet.getBalance(owner, 'confirmed'),
      mainnet.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_PROGRAM_ID }),
      mainnet.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_2022_PROGRAM_ID }),
    ]);
    return { lamports, tokenAccounts: classic.value.length + token2022.value.length };
  });
}

async function main(): Promise<void> {
  const agent = await createBattleAgent({
    baseUrl: config.clawpumpBaseUrl,
    apiKey: config.clawpumpApiKey,
    model: config.clawpumpModel,
    playerWallet: player.toBase58(),
  });
  console.log('agent', agent.agentId, 'wallet', agent.agentWallet, 'model', agent.model);
  await assertEmpty(agent.agentWallet);
  console.log('wallet empty on mainnet after creation');

  const observed = await fetchLatestPrice({
    baseUrl: config.hermesUrl,
    apiKey: config.pythApiKey,
    feedId: config.benchmarkFeedId,
  });
  const context: RoundContext = {
    matchPda: new PublicKey(required('MATCH')),
    round: 0,
    observed,
    history: [],
    targetPublishTime: observed.publishTime + 9 * 60,
    benchmarkSymbol: config.benchmarkSymbol,
    benchmarkFeedId: config.benchmarkFeedId,
  };

  await assertEmpty(agent.agentWallet);
  const started = Date.now();
  const turn = await requestPrediction({
    baseUrl: config.clawpumpBaseUrl,
    apiKey: config.clawpumpApiKey,
    model: config.clawpumpModel,
    agentId: agent.agentId,
    prompt: buildPrompt(context, 'Favour a small move in the direction of the last hour.'),
    context: predictionContext(context),
  });
  console.log('elapsed ms', Date.now() - started);
  console.log('requestId', turn.requestId);
  console.log('parsed', JSON.stringify(turn.parsed, null, 2));
  if (turn.parsed.outcome !== 'valid') console.log('response', turn.sanitizedResponse);
  await assertEmpty(agent.agentWallet);
  console.log('wallet still empty after chat');
  process.exit(turn.parsed.outcome === 'valid' ? 0 : 1);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
