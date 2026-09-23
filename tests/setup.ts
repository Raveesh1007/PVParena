import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect } from 'vitest';
import { BN, Program, Wallet } from '@coral-xyz/anchor';
import { BankrunProvider } from 'anchor-bankrun';
import { Clock, startAnchor, type ProgramTestContext } from 'solana-bankrun';
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  type AccountInfo,
  type TransactionInstruction,
} from '@solana/web3.js';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  ExtensionType,
  MINT_SIZE,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createInitializeMint2Instruction,
  createInitializeTransferFeeConfigInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  getMintLen,
  unpackAccount,
} from '@solana/spl-token';
import type { StockArena } from '../target/types/stock_arena.js';

/**
 * Shared harness for the program tests, running on bankrun rather than a validator.
 *
 * A validator cannot move its clock, which left every deadline path untestable: the join window,
 * the activation window (the only route into the `refund_failed_match` safe exit), settlement
 * grace and option expiry. Those windows are fixed by `code.md` §5.1 and pinned in the program, so
 * the harness warps time rather than shortening them — shortening a production rule to suit a test
 * is what made this necessary in the first place.
 *
 * bankrun ships native bindings for linux and macOS only, so these tests run under WSL. Install
 * the cross-platform binaries once with `npm run wsl:deps`.
 */

export const IDL: StockArena = JSON.parse(
  readFileSync(new URL('../target/idl/stock_arena.json', import.meta.url), 'utf8'),
) as StockArena;

/** The production windows, pinned in `create_arena`. `code.md` §5.1. */
export const STANDARD_DURATION = 15 * 60;
export const DEMO_DURATION = 9 * 60;
export const JOIN_WINDOW = 15 * 60;
export const ACTIVATION_WINDOW = 5 * 60;

export const ASSET_DECIMALS = 6;
export const QUOTE_DECIMALS = 6;
export const STAKE = 100_000_000n; // 100 tokens at 6 decimals
export const STRIKE = 50_000_000n;

/** Anchor's borsh coder requires BN for every i64/u64 field; a plain number throws at encode. */
export const bn = (value: number | bigint): BN => new BN(value.toString());

export interface Harness {
  context: ProgramTestContext;
  provider: BankrunProvider;
  program: Program<StockArena>;
  payer: Keypair;
  assetMint: PublicKey;
  quoteMint: PublicKey;
  configPda: PublicKey;
  arenaPda: PublicKey;
}

export function programId(): PublicKey {
  return new PublicKey(IDL.address);
}

export function configPda(): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from('config')], programId())[0];
}

/**
 * Keyed by collateral mint AND benchmark feed, so one collateral can host several Arenas that
 * differ only in which stock the agents predict.
 */
export function arenaPda(assetMint: PublicKey, benchmarkFeedId: Buffer): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('arena'), assetMint.toBuffer(), benchmarkFeedId],
    programId(),
  )[0];
}

/** The feed this suite's primary Arena is built on. */
export const BENCHMARK_FEED_ID = Buffer.alloc(32, 0xab);

export function matchPda(creator: PublicKey, nonce: bigint): PublicKey {
  const nonceLe = Buffer.alloc(8);
  nonceLe.writeBigUInt64LE(nonce);
  return PublicKey.findProgramAddressSync(
    [Buffer.from('match'), creator.toBuffer(), nonceLe],
    programId(),
  )[0];
}

/** The match PDA is off-curve, hence allowOwnerOffCurve. */
export function vaultFor(assetMint: PublicKey, matchAccount: PublicKey): PublicKey {
  return getAssociatedTokenAddressSync(assetMint, matchAccount, true, TOKEN_PROGRAM_ID);
}

/** Send raw setup instructions through the bank, paid and signed by the context payer. */
export async function sendInstructions(
  h: Harness,
  instructions: TransactionInstruction[],
  signers: Keypair[] = [],
): Promise<void> {
  const tx = new Transaction();
  tx.add(...instructions);
  const latest = await h.context.banksClient.getLatestBlockhash();
  if (!latest) throw new Error('bank returned no blockhash');
  tx.recentBlockhash = latest[0];
  tx.feePayer = h.payer.publicKey;
  tx.sign(h.payer, ...signers);
  await h.context.banksClient.processTransaction(tx);
}

async function createMint(h: Harness, decimals: number): Promise<PublicKey> {
  const mint = Keypair.generate();
  await sendInstructions(
    h,
    [
      SystemProgram.createAccount({
        fromPubkey: h.payer.publicKey,
        newAccountPubkey: mint.publicKey,
        space: MINT_SIZE,
        // Comfortably over rent-exempt. bankrun never reclaims, and under-funding would fail in
        // the system program rather than anywhere this suite cares about.
        lamports: 10_000_000,
        programId: TOKEN_PROGRAM_ID,
      }),
      createInitializeMint2Instruction(
        mint.publicKey,
        decimals,
        h.payer.publicKey,
        null,
        TOKEN_PROGRAM_ID,
      ),
    ],
    [mint],
  );
  return mint.publicKey;
}

/** A Token-2022 mint carrying `transferFeeConfig`, for `create_arena`'s rejection path. */
export async function createTransferFeeMint(h: Harness, decimals: number): Promise<PublicKey> {
  const mint = Keypair.generate();
  await sendInstructions(
    h,
    [
      SystemProgram.createAccount({
        fromPubkey: h.payer.publicKey,
        newAccountPubkey: mint.publicKey,
        space: getMintLen([ExtensionType.TransferFeeConfig]),
        lamports: 10_000_000,
        programId: TOKEN_2022_PROGRAM_ID,
      }),
      // Token-2022 rejects an extension added after InitializeMint2.
      createInitializeTransferFeeConfigInstruction(
        mint.publicKey,
        h.payer.publicKey,
        h.payer.publicKey,
        100,
        BigInt('18446744073709551615'),
        TOKEN_2022_PROGRAM_ID,
      ),
      createInitializeMint2Instruction(
        mint.publicKey,
        decimals,
        h.payer.publicKey,
        null,
        TOKEN_2022_PROGRAM_ID,
      ),
    ],
    [mint],
  );
  return mint.publicKey;
}

export interface Player {
  keypair: Keypair;
  assetAccount: PublicKey;
}

/** A player holding SOL (they pay rent for match and vault) plus `amount` of the Arena asset. */
export async function fundedPlayer(h: Harness, amount: bigint): Promise<Player> {
  return fundedPlayerOfMint(h, h.assetMint, amount);
}

export async function fundedPlayerOfMint(
  h: Harness,
  mint: PublicKey,
  amount: bigint,
): Promise<Player> {
  const keypair = Keypair.generate();
  const assetAccount = getAssociatedTokenAddressSync(
    mint,
    keypair.publicKey,
    false,
    TOKEN_PROGRAM_ID,
  );
  const instructions: TransactionInstruction[] = [
    SystemProgram.transfer({
      fromPubkey: h.payer.publicKey,
      toPubkey: keypair.publicKey,
      lamports: 5 * LAMPORTS_PER_SOL,
    }),
    createAssociatedTokenAccountInstruction(
      h.payer.publicKey,
      assetAccount,
      keypair.publicKey,
      mint,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    ),
  ];
  if (amount > 0n) {
    instructions.push(
      createMintToInstruction(mint, assetAccount, h.payer.publicKey, amount, [], TOKEN_PROGRAM_ID),
    );
  }
  await sendInstructions(h, instructions);
  return { keypair, assetAccount };
}

export async function mintToAccount(
  h: Harness,
  mint: PublicKey,
  destination: PublicKey,
  amount: bigint,
): Promise<void> {
  await sendInstructions(h, [
    createMintToInstruction(mint, destination, h.payer.publicKey, amount, [], TOKEN_PROGRAM_ID),
  ]);
}

export async function tokenBalance(h: Harness, account: PublicKey): Promise<bigint> {
  const raw = await h.context.banksClient.getAccount(account);
  if (!raw) throw new Error(`Token account ${account.toBase58()} does not exist.`);
  const info: AccountInfo<Buffer> = {
    data: Buffer.from(raw.data),
    executable: raw.executable,
    lamports: raw.lamports,
    owner: raw.owner,
    rentEpoch: Number(raw.rentEpoch),
  };
  return unpackAccount(account, info, TOKEN_PROGRAM_ID).amount;
}

/**
 * Move the bank's wall clock forward. This is what makes the deadline paths testable without
 * weakening the windows the specification fixes.
 */
export async function advanceClock(h: Harness, seconds: number): Promise<void> {
  const clock = await h.context.banksClient.getClock();
  h.context.setClock(
    new Clock(
      clock.slot,
      clock.epochStartTimestamp,
      clock.epoch,
      clock.leaderScheduleEpoch,
      clock.unixTimestamp + BigInt(seconds),
    ),
  );
}

/** The only profile shape `create_arena` accepts: offsets exactly [0, d/3, 2d/3]. */
export function timingProfile(durationSeconds: number) {
  const third = Math.floor(durationSeconds / 3);
  return {
    durationSeconds: bn(durationSeconds),
    roundDueOffsets: [bn(0), bn(third), bn(third * 2)],
    settlementGraceSeconds: bn(5 * 60),
    exerciseWindowSeconds: bn(10 * 60),
    joinWindowSeconds: bn(JOIN_WINDOW),
    activationWindowSeconds: bn(ACTIVATION_WINDOW),
  };
}

/** One bank, protocol, arena and two mints per test file. */
export async function setupHarness(): Promise<Harness> {
  const context = await startAnchor(process.cwd(), [], []);
  const provider = new BankrunProvider(context);
  const program = new Program<StockArena>(IDL, provider);

  const h: Harness = {
    context,
    provider,
    program,
    payer: context.payer,
    assetMint: PublicKey.default,
    quoteMint: PublicKey.default,
    configPda: configPda(),
    arenaPda: PublicKey.default,
  };

  h.assetMint = await createMint(h, ASSET_DECIMALS);
  h.quoteMint = await createMint(h, QUOTE_DECIMALS);
  h.arenaPda = arenaPda(h.assetMint, BENCHMARK_FEED_ID);

  await program.methods
    .initializeProtocol({
      orchestrator: (provider.wallet as Wallet).publicKey,
      minDurationSeconds: bn(DEMO_DURATION),
      maxDurationSeconds: bn(STANDARD_DURATION),
      maxPriceAgeSeconds: bn(60),
      maxConfidenceBps: bn(500),
    })
    .accountsPartial({ admin: h.payer.publicKey, systemProgram: SystemProgram.programId })
    .rpc();

  await createArenaFor(h, h.assetMint);
  return h;
}

export async function createArenaFor(
  h: Harness,
  assetMint: PublicKey,
  feedId: Buffer = BENCHMARK_FEED_ID,
  quoteMint: PublicKey = h.quoteMint,
): Promise<PublicKey> {
  await h.program.methods
    .createArena({
      benchmarkFeedId: Array.from(feedId),
      benchmarkExponent: -5,
      standardProfile: timingProfile(STANDARD_DURATION),
      demoProfile: timingProfile(DEMO_DURATION),
      maxPriceAgeSeconds: bn(60),
      maxConfidenceBps: bn(500),
    })
    .accountsPartial({
      admin: h.payer.publicKey,
      assetMint,
      quoteMint,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  return arenaPda(assetMint, feedId);
}

/** A second asset with its own Arena on the same benchmark, for cross-token duels. */
export async function addArena(
  h: Harness,
  decimals: number,
  feedId: Buffer = BENCHMARK_FEED_ID,
  quoteMint: PublicKey = h.quoteMint,
): Promise<{ mint: PublicKey; arena: PublicKey }> {
  const mint = await createMint(h, decimals);
  return { mint, arena: await createArenaFor(h, mint, feedId, quoteMint) };
}

/* ------------------------------------------------------------------------------------------- */
/* Pyth fixtures                                                                                 */
/* ------------------------------------------------------------------------------------------- */

/**
 * The Pyth Solana receiver program. `Account<'info, PriceUpdateV2>` derives its owner check from
 * this address, so a fixture written under any other owner is rejected before deserialization —
 * which is exactly the "wrong owner" case the suite asserts.
 */
export const PYTH_RECEIVER_PROGRAM_ID = new PublicKey(
  'rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ',
);

/** 222.515 at exponent -5, the same vector the Rust and TypeScript scoring tests use. */
export const BENCHMARK_PRICE = 22_251_500n;

export interface PriceUpdateOptions {
  price?: bigint;
  conf?: bigint;
  exponent?: number;
  publishTime?: bigint;
  feedId?: Buffer;
  verificationLevel?: 'full' | 'partial';
  owner?: PublicKey;
}

/**
 * Write a `PriceUpdateV2` account straight into the bank.
 *
 * Posting a real update needs a Wormhole VAA and the receiver program, neither of which exists in
 * bankrun; what the program actually depends on is the resulting *account*, so the tests
 * synthesize it. That is sound precisely because the program treats Hermes as a delivery route
 * and never as a trusted party: the receiver verifies guardian signatures at post time, and
 * everything this program checks — owner, feed, verification level, sign, confidence, exponent,
 * publish time — is a property of the account, which is what these fixtures vary.
 *
 * The real posting path is covered by the opt-in devnet integration test, not here.
 */
export async function postPriceUpdate(
  h: Harness,
  options: PriceUpdateOptions = {},
): Promise<PublicKey> {
  const {
    price = BENCHMARK_PRICE,
    conf = 1_000n,
    exponent = -5,
    feedId = BENCHMARK_FEED_ID,
    verificationLevel = 'full',
    owner = PYTH_RECEIVER_PROGRAM_ID,
  } = options;
  const publishTime = options.publishTime ?? (await clockNow(h));

  // Anchor's account discriminator: the first eight bytes of sha256("account:<name>").
  const discriminator = createHash('sha256')
    .update('account:PriceUpdateV2')
    .digest()
    .subarray(0, 8);
  // Borsh enum: one tag byte, then that variant's fields. Partial carries a u8 signature count,
  // Full carries nothing.
  const level = verificationLevel === 'full' ? Buffer.from([1]) : Buffer.from([0, 3]);

  const message = Buffer.alloc(32 + 8 + 8 + 4 + 8 + 8 + 8 + 8);
  feedId.copy(message, 0);
  message.writeBigInt64LE(price, 32);
  message.writeBigUInt64LE(conf, 40);
  message.writeInt32LE(exponent, 48);
  message.writeBigInt64LE(publishTime, 52);
  message.writeBigInt64LE(publishTime - 1n, 60); // prev_publish_time
  message.writeBigInt64LE(price, 68); // ema_price
  message.writeBigUInt64LE(conf, 76); // ema_conf

  const postedSlot = Buffer.alloc(8);
  postedSlot.writeBigUInt64LE((await h.context.banksClient.getClock()).slot);

  const data = Buffer.concat([
    discriminator,
    h.payer.publicKey.toBuffer(), // write_authority
    level,
    message,
    postedSlot,
  ]);

  const address = Keypair.generate().publicKey;
  h.context.setAccount(address, {
    lamports: 10_000_000,
    data,
    owner,
    executable: false,
    rentEpoch: 0,
  });
  return address;
}

/* ------------------------------------------------------------------------------------------- */
/* Clock                                                                                         */
/* ------------------------------------------------------------------------------------------- */

export async function clockNow(h: Harness): Promise<bigint> {
  return (await h.context.banksClient.getClock()).unixTimestamp;
}

/**
 * Jump the bank clock to an exact timestamp read off the Match account, rather than nudging it by
 * a guessed number of seconds. Round and settlement windows are half-open and one second either
 * side changes which error is correct, so the tests name the boundary they mean.
 */
export async function warpTo(h: Harness, unixTimestamp: bigint | number): Promise<void> {
  const clock = await h.context.banksClient.getClock();
  h.context.setClock(
    new Clock(
      clock.slot,
      clock.epochStartTimestamp,
      clock.epoch,
      clock.leaderScheduleEpoch,
      BigInt(unixTimestamp),
    ),
  );
}

/* ------------------------------------------------------------------------------------------- */
/* Shared match helpers                                                                          */
/* ------------------------------------------------------------------------------------------- */

let nonceCounter = 0n;
export const nextNonce = (): bigint => ++nonceCounter;

/** The 32-byte commitment is opaque to the program: it stores it and never recomputes it. */
export const commitment = (fill: number): number[] => Array.from(Buffer.alloc(32, fill));

/**
 * Assert a specific Anchor error code. bankrun surfaces a failure as a thrown error carrying the
 * program logs, so match the whole payload rather than assuming a parsed AnchorError.
 */
export async function expectAnchorError(promise: Promise<unknown>, code: string): Promise<void> {
  try {
    await promise;
  } catch (error) {
    const parsed = (error as { error?: { errorCode?: { code?: string } } })?.error?.errorCode?.code;
    if (parsed) {
      expect(parsed).toBe(code);
      return;
    }
    const logs = (error as { logs?: string[] })?.logs?.join('\n') ?? '';
    expect(`${String(error)}\n${logs}`).toContain(code);
    return;
  }
  throw new Error(`Expected the transaction to fail with ${code}, but it succeeded.`);
}

/** For failures raised by the token program, which carry no Anchor error code. */
export async function expectFailure(promise: Promise<unknown>): Promise<void> {
  await expect(promise).rejects.toThrow();
}

export interface OpenMatch {
  player: Player;
  match: PublicKey;
  arena: PublicKey;
  assetMint: PublicKey;
  vault: PublicKey;
  challengerArena: PublicKey;
  challengerMint: PublicKey;
  /** The challenger's vault; equal to `vault` in a same-token duel. */
  challengerVault: PublicKey;
}

export interface CreateOptions {
  stake?: bigint;
  strike?: bigint;
  challengerStake?: bigint;
  challengerStrike?: bigint;
  challengerArena?: PublicKey;
  challengerMint?: PublicKey;
  profile?: 'standard' | 'demo';
  assetMint?: PublicKey;
}

export async function openMatch(h: Harness, options: CreateOptions = {}): Promise<OpenMatch> {
  const player = await fundedPlayer(h, STAKE * 2n);
  return createWith(h, player, options);
}

export async function createWith(
  h: Harness,
  player: Player,
  options: CreateOptions = {},
): Promise<OpenMatch> {
  const matchNonce = nextNonce();
  const match = matchPda(player.keypair.publicKey, matchNonce);
  const assetMint = options.assetMint ?? h.assetMint;
  const challengerArena = options.challengerArena ?? h.arenaPda;
  const challengerMint = options.challengerMint ?? h.assetMint;
  const stake = options.stake ?? STAKE;
  const strike = options.strike ?? STRIKE;
  await h.program.methods
    .createMatch(
      bn(matchNonce),
      {
        creatorStakeAmount: bn(stake),
        challengerStakeAmount: bn(options.challengerStake ?? stake),
        creatorStakeStrike: bn(strike),
        challengerStakeStrike: bn(options.challengerStrike ?? strike),
        profileKind: { [options.profile ?? 'demo']: {} } as never,
      },
      commitment(1),
    )
    .accountsPartial({
      creator: player.keypair.publicKey,
      config: h.configPda,
      arena: h.arenaPda,
      challengerArena,
      matchAccount: match,
      assetMint,
      challengerAssetMint: challengerMint,
      creatorAssetAccount: player.assetAccount,
      vault: vaultFor(assetMint, match),
      assetTokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .signers([player.keypair])
    .rpc();
  return {
    player,
    match,
    arena: h.arenaPda,
    assetMint,
    vault: vaultFor(assetMint, match),
    challengerArena,
    challengerMint,
    challengerVault: vaultFor(challengerMint, match),
  };
}

export function join(h: Harness, m: OpenMatch, challenger: Player, fill = 2): Promise<string> {
  return h.program.methods
    .joinMatch(commitment(fill))
    .accountsPartial({
      challenger: challenger.keypair.publicKey,
      config: h.configPda,
      arena: h.arenaPda,
      challengerArena: m.challengerArena,
      matchAccount: m.match,
      assetMint: m.challengerMint,
      challengerAssetAccount: challenger.assetAccount,
      vault: m.challengerVault,
      assetTokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .signers([challenger.keypair])
    .rpc();
}

/** The Arena, mint and vault holding `player`'s stake. Anyone but the creator gets the challenger
 *  side, so a non-player still reaches the program and is rejected there. */
export function stakeSide(m: OpenMatch, player: Player) {
  return player.keypair.publicKey.equals(m.player.keypair.publicKey)
    ? { arena: m.arena, mint: m.assetMint, vault: m.vault }
    : { arena: m.challengerArena, mint: m.challengerMint, vault: m.challengerVault };
}

export const pause = (h: Harness, paused: boolean): Promise<string> =>
  h.program.methods
    .setPaused(paused)
    .accountsPartial({ admin: h.payer.publicKey, config: h.configPda })
    .rpc();

/** A token account of `mint` for an existing wallet, funded with `amount`. */
export async function giveTokens(
  h: Harness,
  owner: PublicKey,
  mint: PublicKey,
  amount: bigint,
): Promise<PublicKey> {
  const account = getAssociatedTokenAddressSync(mint, owner, false, TOKEN_PROGRAM_ID);
  const instructions: TransactionInstruction[] = [
    createAssociatedTokenAccountInstruction(
      h.payer.publicKey,
      account,
      owner,
      mint,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    ),
  ];
  if (amount > 0n) {
    instructions.push(
      createMintToInstruction(mint, account, h.payer.publicKey, amount, [], TOKEN_PROGRAM_ID),
    );
  }
  await sendInstructions(h, instructions);
  return account;
}

/** The address `exercise_option` creates for a loser who holds no quote account yet. */
export const quoteAtaFor = (h: Harness, owner: PublicKey): PublicKey =>
  getAssociatedTokenAddressSync(h.quoteMint, owner, false, TOKEN_PROGRAM_ID);
