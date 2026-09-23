import { beforeAll, describe, expect, it } from 'vitest';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import {
  ACTIVATION_WINDOW,
  BENCHMARK_FEED_ID,
  type CreateOptions,
  DEMO_DURATION,
  JOIN_WINDOW,
  type OpenMatch,
  STAKE,
  STANDARD_DURATION,
  STRIKE,
  type Harness,
  type Player,
  ASSET_DECIMALS,
  advanceClock,
  arenaPda,
  bn,
  commitment,
  createTransferFeeMint,
  createWith as createWithOf,
  expectAnchorError,
  expectFailure,
  fundedPlayer,
  fundedPlayerOfMint,
  join as joinOf,
  matchPda,
  mintToAccount,
  openMatch as openMatchOf,
  pause as pauseOf,
  setupHarness,
  timingProfile,
  tokenBalance,
  vaultFor,
} from './setup.js';

/**
 * Escrow and state-machine tests. `code.md` §14 puts these first: deposit conservation, then
 * signer / account / mint / token-program validation, then replay safety, then that every state
 * has a safe exit.
 */

let h: Harness;

/**
 * These bind the shared helpers in `setup.ts` to this file's harness. They live there rather than
 * here because the settlement suite needs the same match setup, and two copies of "create, join,
 * assert an error code" would be two things to keep in step with the program.
 */
const openMatch = (options: CreateOptions = {}) => openMatchOf(h, options);
const createWith = (player: Player, options: CreateOptions = {}) =>
  createWithOf(h, player, options);
const join = (m: OpenMatch, challenger: Player, fill = 2) => joinOf(h, m, challenger, fill);
const pause = (paused: boolean) => pauseOf(h, paused);

function cancel(m: OpenMatch, signer: Player) {
  return h.program.methods
    .cancelOpenMatch()
    .accountsPartial({
      creator: signer.keypair.publicKey,
      arena: h.arenaPda,
      matchAccount: m.match,
      assetMint: h.assetMint,
      creatorAssetAccount: signer.assetAccount,
      vault: m.vault,
      assetTokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([signer.keypair])
    .rpc();
}

function refund(m: OpenMatch, claimant: Player) {
  return h.program.methods
    .refundFailedMatch()
    .accountsPartial({
      claimant: claimant.keypair.publicKey,
      arena: h.arenaPda,
      matchAccount: m.match,
      assetMint: h.assetMint,
      claimantAssetAccount: claimant.assetAccount,
      vault: m.vault,
      assetTokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([claimant.keypair])
    .rpc();
}

beforeAll(async () => {
  h = await setupHarness();
}, 120_000);

describe('protocol configuration', () => {
  it('records the admin and the Pyth limits', async () => {
    const config = await h.program.account.protocolConfig.fetch(h.configPda);
    expect(config.admin.toBase58()).toBe(h.payer.publicKey.toBase58());
    expect(config.paused).toBe(false);
    expect(config.maxConfidenceBps.toString()).toBe('500');
  });

  it('refuses a config update from anyone but the admin', async () => {
    const intruder = await fundedPlayer(h, 0n);
    await expectAnchorError(
      h.program.methods
        .updateProtocolConfig({
          orchestrator: intruder.keypair.publicKey,
          minDurationSeconds: bn(DEMO_DURATION),
          maxDurationSeconds: bn(STANDARD_DURATION),
          maxPriceAgeSeconds: bn(60),
          maxConfidenceBps: bn(500),
        })
        .accountsPartial({ admin: intruder.keypair.publicKey, config: h.configPda })
        .signers([intruder.keypair])
        .rpc(),
      'NotAdmin',
    );
  });
});

describe('arena', () => {
  it('stores the benchmark feed id, exponent and the fixed round weights', async () => {
    const arena = await h.program.account.arena.fetch(arenaPda(h.assetMint, BENCHMARK_FEED_ID));
    expect(Buffer.from(arena.benchmarkFeedId)).toEqual(BENCHMARK_FEED_ID);
    expect(arena.benchmarkExponent).toBe(-5);
    expect(arena.roundWeightsBps.map(Number)).toEqual([2000, 3000, 5000]);
    expect(arena.assetTokenProgram.toBase58()).toBe(TOKEN_PROGRAM_ID.toBase58());
  });

  it('rejects a mint carrying a transfer fee, so sent always equals received', async () => {
    const feeMint = await createTransferFeeMint(h, ASSET_DECIMALS);
    const otherFeed = Buffer.alloc(32, 0xfe);
    await expectAnchorError(
      h.program.methods
        .createArena({
          benchmarkFeedId: Array.from(otherFeed),
          benchmarkExponent: -5,
          standardProfile: timingProfile(STANDARD_DURATION),
          demoProfile: timingProfile(DEMO_DURATION),
          maxPriceAgeSeconds: bn(60),
          maxConfidenceBps: bn(500),
        })
        .accountsPartial({
          admin: h.payer.publicKey,
          config: h.configPda,
          arena: arenaPda(feeMint, otherFeed),
          assetMint: feeMint,
          quoteMint: h.quoteMint,
          systemProgram: SystemProgram.programId,
        })
        .rpc(),
      'UnsafeMintExtension',
    );
  });

  it('pins the join and activation windows to the specified values', async () => {
    const otherFeed = Buffer.alloc(32, 0xcd);
    const shortened = { ...timingProfile(DEMO_DURATION), joinWindowSeconds: bn(4) };
    await expectAnchorError(
      h.program.methods
        .createArena({
          benchmarkFeedId: Array.from(otherFeed),
          benchmarkExponent: -5,
          standardProfile: timingProfile(STANDARD_DURATION),
          demoProfile: shortened,
          maxPriceAgeSeconds: bn(60),
          maxConfidenceBps: bn(500),
        })
        .accountsPartial({
          admin: h.payer.publicKey,
          config: h.configPda,
          arena: arenaPda(h.quoteMint, otherFeed),
          assetMint: h.quoteMint,
          quoteMint: h.quoteMint,
          systemProgram: SystemProgram.programId,
        })
        .rpc(),
      'DurationOutOfBounds',
    );
  });
});

describe('create_match', () => {
  it('escrows exactly the stake and records it as the creator deposit', async () => {
    const { player, match, vault } = await openMatch();
    expect(await tokenBalance(h, vault)).toBe(STAKE);
    expect(await tokenBalance(h, player.assetAccount)).toBe(STAKE); // funded 2x, staked 1x

    const state = await h.program.account.match.fetch(match);
    expect(state.creatorDeposit.toString()).toBe(STAKE.toString());
    expect(state.challengerDeposit.toString()).toBe('0');
    expect(state.challenger.toBase58()).toBe(PublicKey.default.toBase58());
    expect(state.state).toHaveProperty('open');
  });

  it('rejects a zero strike', async () => {
    await expectAnchorError(openMatch({ strike: 0n }), 'ZeroAmount');
  });

  // 0.05 tokens at ASSET_DECIMALS is 5 * 10^(decimals - 2) base units.
  const MIN_STAKE = 5n * 10n ** BigInt(ASSET_DECIMALS - 2);

  it.each([
    ['a zero stake', { stake: 0n }],
    ['a creator stake one unit under 0.05 tokens', { stake: MIN_STAKE - 1n }],
    ['a challenger stake one unit under 0.05 tokens', { challengerStake: MIN_STAKE - 1n }],
  ])('rejects %s', async (_label, options) => {
    await expectAnchorError(openMatch(options), 'StakeBelowMinimum');
  });

  it('accepts a stake of exactly 0.05 tokens on both sides', async () => {
    const { match } = await openMatch({ stake: MIN_STAKE });
    const state = await h.program.account.match.fetch(match);
    expect(state.creatorStakeAmount.toString()).toBe(MIN_STAKE.toString());
    expect(state.challengerStakeAmount.toString()).toBe(MIN_STAKE.toString());
  });

  it('rejects a mint that is not the Arena asset', async () => {
    const player = await fundedPlayerOfMint(h, h.quoteMint, STAKE);
    await expectAnchorError(createWith(player, { assetMint: h.quoteMint }), 'MintMismatch');
  });

  it('is blocked while paused, and works again once unpaused', async () => {
    await pause(true);
    await expectAnchorError(openMatch(), 'ProtocolPaused');
    await pause(false);
    const { vault } = await openMatch();
    expect(await tokenBalance(h, vault)).toBe(STAKE);
  });
});

describe('join_match', () => {
  it('escrows a second identical deposit and moves the match to Ready', async () => {
    const m = await openMatch();
    const challenger = await fundedPlayer(h, STAKE);
    await join(m, challenger);

    expect(await tokenBalance(h, m.vault)).toBe(STAKE * 2n);
    expect(await tokenBalance(h, challenger.assetAccount)).toBe(0n);

    const state = await h.program.account.match.fetch(m.match);
    expect(state.creatorDeposit.toString()).toBe(STAKE.toString());
    expect(state.challengerDeposit.toString()).toBe(STAKE.toString());
    expect(state.challenger.toBase58()).toBe(challenger.keypair.publicKey.toBase58());
    expect(state.state).toHaveProperty('ready');
    expect(Buffer.from(state.challengerStrategyCommitment)).toEqual(Buffer.alloc(32, 2));
  });

  it('refuses to let the creator challenge themselves', async () => {
    const m = await openMatch();
    await expectAnchorError(join(m, m.player, 3), 'SelfChallenge');
  });

  it('refuses a challenger who cannot cover the exact stake', async () => {
    const m = await openMatch();
    const underfunded = await fundedPlayer(h, STAKE - 1n);
    await expectFailure(join(m, underfunded));
    // The failed join left the creator's deposit exactly as it was.
    expect(await tokenBalance(h, m.vault)).toBe(STAKE);
  });

  it('refuses a second challenger once the match is Ready', async () => {
    const m = await openMatch();
    await join(m, await fundedPlayer(h, STAKE));
    const latecomer = await fundedPlayer(h, STAKE);
    await expectAnchorError(join(m, latecomer, 4), 'InvalidMatchState');
    expect(await tokenBalance(h, m.vault)).toBe(STAKE * 2n);
  });

  it('refuses a join once the window has closed', async () => {
    const m = await openMatch();
    const challenger = await fundedPlayer(h, STAKE);
    await advanceClock(h, JOIN_WINDOW + 1);

    await expectAnchorError(join(m, challenger), 'JoinWindowClosed');
    expect(await tokenBalance(h, m.vault)).toBe(STAKE);
  });
});

describe('cancel_open_match', () => {
  it('returns the full stake once and cannot be replayed', async () => {
    const m = await openMatch();
    await cancel(m, m.player);

    expect(await tokenBalance(h, m.vault)).toBe(0n);
    expect(await tokenBalance(h, m.player.assetAccount)).toBe(STAKE * 2n);

    const state = await h.program.account.match.fetch(m.match);
    expect(state.state).toHaveProperty('cancelled');
    expect(state.creatorDeposit.toString()).toBe('0');
    expect(state.creatorRefunded).toBe(true);

    await expectAnchorError(cancel(m, m.player), 'InvalidMatchState');
  });

  it('still works while paused, because pause must never block a safe exit', async () => {
    const m = await openMatch();
    await pause(true);
    await cancel(m, m.player);
    await pause(false);
    expect(await tokenBalance(h, m.player.assetAccount)).toBe(STAKE * 2n);
  });

  it('pays out recorded deposits only, so an unsolicited vault transfer grants nothing', async () => {
    const m = await openMatch();
    const donation = 7_000_000n;
    await mintToAccount(h, h.assetMint, m.vault, donation);
    expect(await tokenBalance(h, m.vault)).toBe(STAKE + donation);

    await cancel(m, m.player);

    // Exactly the recorded deposit left the vault; the donation is stranded, not claimable.
    expect(await tokenBalance(h, m.player.assetAccount)).toBe(STAKE * 2n);
    expect(await tokenBalance(h, m.vault)).toBe(donation);
  });

  it('refuses a cancel signed by anyone but the creator', async () => {
    const m = await openMatch();
    const intruder = await fundedPlayer(h, 0n);
    await expectAnchorError(cancel(m, intruder), 'AccountMismatch');
  });

  it('cannot cancel a match that has already been joined', async () => {
    const m = await openMatch();
    await join(m, await fundedPlayer(h, STAKE));
    await expectAnchorError(cancel(m, m.player), 'InvalidMatchState');
    expect(await tokenBalance(h, m.vault)).toBe(STAKE * 2n);
  });
});

describe('refund_failed_match', () => {
  /** A Ready match whose activation window has expired. */
  async function abandonedMatch() {
    const m = await openMatch();
    const challenger = await fundedPlayer(h, STAKE);
    await join(m, challenger);
    await advanceClock(h, ACTIVATION_WINDOW + 1);
    return { ...m, challenger };
  }

  it('refuses to refund while the activation window is still open', async () => {
    const m = await openMatch();
    const challenger = await fundedPlayer(h, STAKE);
    await join(m, challenger);
    await expectAnchorError(refund(m, m.player), 'ActivationWindowStillOpen');
    expect(await tokenBalance(h, m.vault)).toBe(STAKE * 2n);
  });

  it('returns both deposits once the activation window has closed, conserving the escrow', async () => {
    const m = await abandonedMatch();

    await refund(m, m.player);
    const afterFirst = await h.program.account.match.fetch(m.match);
    expect(afterFirst.state).toHaveProperty('failureRefundable');
    expect(afterFirst.creatorDeposit.toString()).toBe('0');
    expect(afterFirst.challengerDeposit.toString()).toBe(STAKE.toString());
    expect(await tokenBalance(h, m.vault)).toBe(STAKE);

    await refund(m, m.challenger);
    expect(await tokenBalance(h, m.vault)).toBe(0n);
    expect(await tokenBalance(h, m.player.assetAccount)).toBe(STAKE * 2n);
    expect(await tokenBalance(h, m.challenger.assetAccount)).toBe(STAKE);

    const state = await h.program.account.match.fetch(m.match);
    expect(state.creatorRefunded).toBe(true);
    expect(state.challengerRefunded).toBe(true);
    expect(state.challengerDeposit.toString()).toBe('0');
  });

  it('cannot be replayed by either player', async () => {
    const m = await abandonedMatch();
    await refund(m, m.player);
    await expectAnchorError(refund(m, m.player), 'AlreadySettled');
    await refund(m, m.challenger);
    await expectAnchorError(refund(m, m.challenger), 'AlreadySettled');
    expect(await tokenBalance(h, m.vault)).toBe(0n);
  });

  it('refuses a claimant who is not a player in the match', async () => {
    const m = await abandonedMatch();
    const intruder = await fundedPlayer(h, 0n);
    await expectAnchorError(refund(m, intruder), 'AccountMismatch');
    expect(await tokenBalance(h, m.vault)).toBe(STAKE * 2n);
  });

  it('still works while paused, because pause must never block a safe exit', async () => {
    const m = await abandonedMatch();
    await pause(true);
    await refund(m, m.player);
    await refund(m, m.challenger);
    await pause(false);
    expect(await tokenBalance(h, m.vault)).toBe(0n);
  });
});
