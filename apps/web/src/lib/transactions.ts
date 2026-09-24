import { AnchorProvider, BN, Program } from '@coral-xyz/anchor';
import { ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token';
import type { AnchorWallet } from '@solana/wallet-adapter-react';
import {
  type Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  type TransactionSignature,
} from '@solana/web3.js';
import { IDL, type StockArena } from '@stock-arena/idl';

/** Browser builders for the player instructions. Account layouts mirror the program tests. */

export interface MatchRef {
  pda: string;
  creator: string;
  challenger: string | null;
  /** The creator's Arena and the challenger's; equal in a same-token duel. */
  creatorArena: string;
  challengerArena: string;
}

export interface MatchTermsInput {
  creatorStake: bigint;
  challengerStake: bigint;
  creatorStrike: bigint;
  challengerStrike: bigint;
  profile: 'standard' | 'demo';
}

export function arenaProgram(connection: Connection, wallet: AnchorWallet): Program<StockArena> {
  return new Program<StockArena>(
    IDL,
    new AnchorProvider(connection, wallet, { commitment: 'confirmed' }),
  );
}

const bn = (value: bigint) => new BN(value.toString());

const vaultFor = (mint: PublicKey, match: PublicKey, tokenProgram: PublicKey) =>
  getAssociatedTokenAddressSync(mint, match, true, tokenProgram);

/** Everything about one Arena's token that an instruction needs, read from chain, never assumed. */
async function stakeSide(program: Program<StockArena>, arena: PublicKey, owner: PublicKey) {
  const account = await program.account.arena.fetch(arena);
  return {
    arena,
    mint: account.assetMint,
    tokenProgram: account.assetTokenProgram,
    quoteMint: account.quoteMint,
    quoteTokenProgram: account.quoteTokenProgram,
    ownerAccount: getAssociatedTokenAddressSync(
      account.assetMint,
      owner,
      false,
      account.assetTokenProgram,
    ),
  };
}

/** The Arena that holds `player`'s stake: the program rejects a payout through any other. */
const arenaOf = (match: MatchRef, player: PublicKey) =>
  new PublicKey(player.toBase58() === match.creator ? match.creatorArena : match.challengerArena);

export async function createMatchTx(
  program: Program<StockArena>,
  input: {
    creator: PublicKey;
    matchPda: PublicKey;
    nonce: bigint;
    creatorArena: PublicKey;
    challengerArena: PublicKey;
    terms: MatchTermsInput;
    commitment: Uint8Array;
  },
): Promise<Transaction> {
  const [own, other] = await Promise.all([
    stakeSide(program, input.creatorArena, input.creator),
    stakeSide(program, input.challengerArena, input.creator),
  ]);
  return program.methods
    .createMatch(
      bn(input.nonce),
      {
        creatorStakeAmount: bn(input.terms.creatorStake),
        challengerStakeAmount: bn(input.terms.challengerStake),
        creatorStakeStrike: bn(input.terms.creatorStrike),
        challengerStakeStrike: bn(input.terms.challengerStrike),
        profileKind: { [input.terms.profile]: {} } as never,
      },
      Array.from(input.commitment),
    )
    .accountsPartial({
      creator: input.creator,
      arena: input.creatorArena,
      challengerArena: input.challengerArena,
      matchAccount: input.matchPda,
      assetMint: own.mint,
      challengerAssetMint: other.mint,
      creatorAssetAccount: own.ownerAccount,
      vault: vaultFor(own.mint, input.matchPda, own.tokenProgram),
      assetTokenProgram: own.tokenProgram,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .transaction();
}

export async function joinMatchTx(
  program: Program<StockArena>,
  match: MatchRef,
  challenger: PublicKey,
  commitment: Uint8Array,
): Promise<Transaction> {
  const pda = new PublicKey(match.pda);
  const side = await stakeSide(program, new PublicKey(match.challengerArena), challenger);
  return program.methods
    .joinMatch(Array.from(commitment))
    .accountsPartial({
      challenger,
      arena: new PublicKey(match.creatorArena),
      challengerArena: side.arena,
      matchAccount: pda,
      assetMint: side.mint,
      challengerAssetAccount: side.ownerAccount,
      vault: vaultFor(side.mint, pda, side.tokenProgram),
      assetTokenProgram: side.tokenProgram,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .transaction();
}

/** Every instruction that returns a player's own deposit shares this account shape. */
async function ownStake(program: Program<StockArena>, match: MatchRef, player: PublicKey) {
  const pda = new PublicKey(match.pda);
  const side = await stakeSide(program, arenaOf(match, player), player);
  return {
    pda,
    side,
    accounts: {
      arena: side.arena,
      matchAccount: pda,
      assetMint: side.mint,
      vault: vaultFor(side.mint, pda, side.tokenProgram),
      assetTokenProgram: side.tokenProgram,
    },
  };
}

export async function cancelTx(program: Program<StockArena>, match: MatchRef, creator: PublicKey) {
  const { accounts, side } = await ownStake(program, match, creator);
  return program.methods
    .cancelOpenMatch()
    .accountsPartial({ ...accounts, creator, creatorAssetAccount: side.ownerAccount })
    .transaction();
}

export async function refundTx(
  program: Program<StockArena>,
  match: MatchRef,
  claimant: PublicKey,
  reason: 'tie' | 'failed',
  markOracleFailure = false,
): Promise<Transaction> {
  const { accounts, side, pda } = await ownStake(program, match, claimant);
  const refundAccounts = { ...accounts, claimant, claimantAssetAccount: side.ownerAccount };
  const refund =
    reason === 'tie'
      ? program.methods.refundTie().accountsPartial(refundAccounts)
      : program.methods.refundFailedMatch().accountsPartial(refundAccounts);
  const tx = new Transaction();
  // Permissionless, and the refund depends on it, so both go in one atomic transaction.
  if (markOracleFailure) {
    tx.add(
      await program.methods
        .markOracleFailureRefundable()
        .accountsPartial({ matchAccount: pda })
        .instruction(),
    );
  }
  return tx.add(await refund.instruction());
}

export async function claimTx(program: Program<StockArena>, match: MatchRef, winner: PublicKey) {
  const { accounts, side } = await ownStake(program, match, winner);
  return program.methods
    .claimWinnerStake()
    .accountsPartial({ ...accounts, winner, winnerAssetAccount: side.ownerAccount })
    .transaction();
}

export async function reclaimTx(program: Program<StockArena>, match: MatchRef, loser: PublicKey) {
  const { accounts, side } = await ownStake(program, match, loser);
  return program.methods
    .reclaimAfterOptionExpiry()
    .accountsPartial({ ...accounts, loser, loserAssetAccount: side.ownerAccount })
    .transaction();
}

/** The winner pays the loser's strike in the quote token and takes the loser's stake. */
export async function exerciseTx(
  program: Program<StockArena>,
  match: MatchRef,
  winner: PublicKey,
): Promise<Transaction> {
  const loser = new PublicKey(
    winner.toBase58() === match.creator ? (match.challenger ?? '') : match.creator,
  );
  const { accounts, side } = await ownStake(program, match, loser);
  return program.methods
    .exerciseOption()
    .accountsPartial({
      ...accounts,
      winner,
      loser,
      quoteMint: side.quoteMint,
      winnerAssetAccount: getAssociatedTokenAddressSync(
        side.mint,
        winner,
        false,
        side.tokenProgram,
      ),
      winnerQuoteAccount: getAssociatedTokenAddressSync(
        side.quoteMint,
        winner,
        false,
        side.quoteTokenProgram,
      ),
      loserQuoteAccount: getAssociatedTokenAddressSync(
        side.quoteMint,
        loser,
        false,
        side.quoteTokenProgram,
      ),
      quoteTokenProgram: side.quoteTokenProgram,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .transaction();
}

export class TransactionRejected extends Error {}

/**
 * Simulate first, so a transaction the program would reject is reported with the program's own
 * message instead of being put in front of the wallet to sign.
 */
export async function simulateAndSend(
  connection: Connection,
  tx: Transaction,
  payer: PublicKey,
  send: (tx: Transaction, connection: Connection) => Promise<TransactionSignature>,
): Promise<TransactionSignature> {
  const latest = await connection.getLatestBlockhash('confirmed');
  tx.feePayer = payer;
  tx.recentBlockhash = latest.blockhash;

  const simulation = await connection.simulateTransaction(tx);
  if (simulation.value.err) {
    throw new TransactionRejected(programMessage(simulation.value.logs ?? []));
  }
  const signature = await send(tx, connection);
  const confirmation = await connection.confirmTransaction({ signature, ...latest }, 'confirmed');
  if (confirmation.value.err) {
    throw new TransactionRejected(`Transaction ${signature} failed on-chain.`);
  }
  return signature;
}

/** Anchor logs `Error Message: <text>.`; token programs log their own reason. */
function programMessage(logs: string[]): string {
  const anchor = logs.map((line) => /Error Message: (.*)$/.exec(line)?.[1]).find(Boolean);
  if (anchor) return anchor.replace(/\.+$/, '.');
  const token = logs.find((line) => /insufficient funds/i.test(line));
  if (token) return 'Insufficient token balance for this transaction.';
  return 'The program rejected this transaction.';
}
