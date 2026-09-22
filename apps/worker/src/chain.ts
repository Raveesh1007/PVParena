import { AnchorProvider, Program, Wallet } from '@coral-xyz/anchor';
import { Connection, type PublicKey } from '@solana/web3.js';
import { IDL, PROGRAM_ID, type StockArena, configPda } from '@stock-arena/idl';

import type { WorkerConfig } from './config.js';

export interface ChainContext {
  connection: Connection;
  program: Program<StockArena>;
  provider: AnchorProvider;
  config: PublicKey;
}

export function connectChain(config: WorkerConfig): ChainContext {
  const connection = new Connection(config.rpcUrl, 'confirmed');
  const provider = new AnchorProvider(connection, new Wallet(config.orchestrator), {
    commitment: 'confirmed',
    // Fail fast on a transaction that would fail anyway, rather than paying for it and finding
    // out from the explorer.
    preflightCommitment: 'confirmed',
  });
  const program = new Program<StockArena>(IDL, provider);
  return { connection, program, provider, config: configPda(PROGRAM_ID) };
}

/** The on-chain match states, as the Anchor client renders the enum. `code.md` §7.2. */
export type MatchState =
  | 'open'
  | 'ready'
  | 'active'
  | 'awaitingSettlement'
  | 'winnerOptionOpen'
  | 'tieRefundable'
  | 'failureRefundable'
  | 'optionExercised'
  | 'optionExpired'
  | 'cancelled';

export type MatchAccount = Awaited<ReturnType<Program<StockArena>['account']['match']['fetch']>>;

/** Anchor renders a Rust enum as a single-key object; this turns it back into a name. */
export function stateOf(match: MatchAccount): MatchState {
  return Object.keys(match.state)[0] as MatchState;
}

export { toSeconds } from './windows.js';

/**
 * Every match the worker might need to act on.
 *
 * `getProgramAccounts` with a discriminator filter is enough at this scale — a hackathon devnet
 * deployment has tens of matches, not millions — and it has the useful property of being
 * stateless: a worker that restarts, or a second worker, sees exactly the same set without
 * needing the database to be correct first.
 */
export async function fetchActionableMatches(
  ctx: ChainContext,
): Promise<{ pda: PublicKey; account: MatchAccount }[]> {
  const all = await ctx.program.account.match.all();
  return all
    .map((entry) => ({ pda: entry.publicKey, account: entry.account }))
    .filter(({ account }) => {
      const state = stateOf(account);
      return state === 'ready' || state === 'active';
    });
}

export async function chainNow(ctx: ChainContext): Promise<number> {
  const slot = await ctx.connection.getSlot('confirmed');
  const time = await ctx.connection.getBlockTime(slot);
  // getBlockTime can return null for a slot that has been skipped; the wall clock is a safe
  // fallback because every deadline comparison on-chain uses the bank clock anyway and this value
  // is only used to decide *whether to try*.
  return time ?? Math.floor(Date.now() / 1000);
}
