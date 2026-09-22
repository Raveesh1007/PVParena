import { Keypair } from '@solana/web3.js';
import {
  ConfigError,
  type IntegrationConfig,
  loadIntegrationConfig,
  optional,
  required,
} from '@stock-arena/integrations';

export interface WorkerConfig extends IntegrationConfig {
  rpcUrl: string;
  /** The devnet orchestrator. Minimally funded — it pays for Pyth posting and its own fees, and
   *  it can never move escrow, because no instruction gives it that power. */
  orchestrator: Keypair;
  /** How often the tick loop runs. */
  tickIntervalMs: number;
  databaseUrl: string;
}

/**
 * Parse `ORCHESTRATOR_KEYPAIR_JSON`, the 64-byte secret key array Solana's CLI writes.
 *
 * Deliberately read from an environment variable rather than a file path so a deployment does not
 * have to mount a keypair file, and never logged, echoed or included in an error message: the
 * message below reports the shape that was wrong, never the value.
 */
function loadOrchestrator(): Keypair {
  const raw = required('ORCHESTRATOR_KEYPAIR_JSON');
  let bytes: unknown;
  try {
    bytes = JSON.parse(raw);
  } catch {
    throw new ConfigError('ORCHESTRATOR_KEYPAIR_JSON is not valid JSON.');
  }
  if (!Array.isArray(bytes) || bytes.length !== 64 || !bytes.every((b) => Number.isInteger(b))) {
    throw new ConfigError(
      `ORCHESTRATOR_KEYPAIR_JSON must be a 64-element byte array; got ${
        Array.isArray(bytes) ? `${bytes.length} elements` : typeof bytes
      }.`,
    );
  }
  return Keypair.fromSecretKey(Uint8Array.from(bytes as number[]));
}

export function loadWorkerConfig(): WorkerConfig {
  const cluster = optional('NEXT_PUBLIC_SOLANA_CLUSTER', 'devnet');
  if (cluster !== 'devnet') {
    // The program is devnet-only and must never be deployed to mainnet. `code.md` §2.
    throw new ConfigError(
      `Refusing to run against cluster "${cluster}". Stock Arena is devnet-only.`,
    );
  }
  return {
    ...loadIntegrationConfig(),
    rpcUrl: required('SOLANA_RPC_URL'),
    orchestrator: loadOrchestrator(),
    tickIntervalMs: Number(optional('WORKER_TICK_INTERVAL_MS', '5000')),
    databaseUrl: required('DATABASE_URL'),
  };
}
