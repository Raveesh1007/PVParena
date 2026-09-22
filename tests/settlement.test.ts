import { beforeAll, describe, expect, it } from 'vitest';
import { Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import {
  BENCHMARK_PRICE,
  type CreateOptions,
  type Harness,
  type OpenMatch,
  type Player,
  IDL,
  PYTH_RECEIVER_PROGRAM_ID,
  type PriceUpdateOptions,
  STAKE,
  STRIKE,
  bn,
  clockNow,
  expectAnchorError,
  expectFailure,
  fundedPlayer,
  giveTokens,
  join,
  mintToAccount,
  openMatch,
  pause,
  postPriceUpdate,
  quoteAtaFor,
  setupHarness,
  tokenBalance,
  warpTo,
} from './setup.js';

/**
 * The settlement half of the lifecycle: activation, paired round submission, scoring, the Battle
 * Option and every refund path out of them. `code.md` §14.
 *
 * Two things shape this suite. First, every deadline is pinned by `create_arena` and may not be
 * shortened to suit a test, so the tests warp the bank clock to exact timestamps read off the
 * Match account. Second, the Pyth updates are synthesized accounts rather than real posted ones —
 * see `postPriceUpdate` for why that tests the right thing.
 */

let h: Harness;

/**
 * The IDL exactly as `anchor build` wrote it. Instruction names there are snake_case; the
 * generated `StockArena` type declares them camelCase, because that is the shape Anchor hands the
 * TypeScript client after conversion. The structural assertions below are about the artefact on
 * disk, so they read it untyped.
 */
const idlInstructions = IDL.instructions as unknown as {
  name: string;
  accounts: { name: string; signer?: boolean }[];
}[];

/** 224.000 at exponent -5. Far enough from the start price to make errors legible. */
const FINAL_PRICE = 22_400_000n;

type Outcome = 'valid' | 'timeout' | 'apiError' | 'malformed' | 'unsubmitted';

const prediction = (outcome: Outcome, price: bigint) => ({
  outcome: { [outcome]: {} },
  predictedPrice: bn(price),
});
const valid = (price: bigint) => prediction('valid', price);
const failed = (outcome: Outcome = 'timeout') => prediction(outcome, 0n);

interface LiveMatch extends OpenMatch {
  challenger: Player;
  /** Exactly three, so indexing a round is not an optional access. */
  roundDue: readonly [bigint, bigint, bigint];
  targetEnd: bigint;
  settlementDeadline: bigint;
  optionExpiry: bigint;
}

function activate(m: OpenMatch, priceUpdate: PublicKey, orchestrator?: Keypair) {
  const call = h.program.methods.activateMatch().accountsPartial({
    orchestrator: orchestrator?.publicKey ?? h.payer.publicKey,
    config: h.configPda,
    arena: h.arenaPda,
    matchAccount: m.match,
    priceUpdate,
  });
  return orchestrator ? call.signers([orchestrator]).rpc() : call.rpc();
}

function submitRound(
  m: OpenMatch,
  round: number,
  creatorInput: ReturnType<typeof valid>,
  challengerInput: ReturnType<typeof valid>,
  orchestrator?: Keypair,
) {
  const call = h.program.methods
    .submitRoundPredictions(round, creatorInput as never, challengerInput as never)
    .accountsPartial({
      orchestrator: orchestrator?.publicKey ?? h.payer.publicKey,
      config: h.configPda,
      matchAccount: m.match,
    });
  return orchestrator ? call.signers([orchestrator]).rpc() : call.rpc();
}

const settle = (m: OpenMatch, priceUpdate: PublicKey) =>
  h.program.methods
    .settleMatch()
    .accountsPartial({
      arena: h.arenaPda,
      config: h.configPda,
      matchAccount: m.match,
      priceUpdate,
    })
    .rpc();

const markOracleFailure = (m: OpenMatch) =>
  h.program.methods.markOracleFailureRefundable().accountsPartial({ matchAccount: m.match }).rpc();

const claim = (m: OpenMatch, winner: Player) =>
  h.program.methods
    .claimWinnerStake()
    .accountsPartial({
      winner: winner.keypair.publicKey,
      arena: h.arenaPda,
      matchAccount: m.match,
      assetMint: h.assetMint,
      winnerAssetAccount: winner.assetAccount,
      vault: m.vault,
      assetTokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([winner.keypair])
    .rpc();

function exercise(
  m: OpenMatch,
  winner: Player,
  loser: Player,
  winnerQuoteAccount: PublicKey,
  overrides: { quoteMint?: PublicKey; loserQuoteAccount?: PublicKey } = {},
) {
  return h.program.methods
    .exerciseOption()
    .accountsPartial({
      winner: winner.keypair.publicKey,
      loser: loser.keypair.publicKey,
      arena: h.arenaPda,
      matchAccount: m.match,
      assetMint: h.assetMint,
      quoteMint: overrides.quoteMint ?? h.quoteMint,
      winnerAssetAccount: winner.assetAccount,
      winnerQuoteAccount,
      loserQuoteAccount: overrides.loserQuoteAccount ?? quoteAtaFor(h, loser.keypair.publicKey),
      vault: m.vault,
      assetTokenProgram: TOKEN_PROGRAM_ID,
      quoteTokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .signers([winner.keypair])
    .rpc();
}

const reclaim = (m: OpenMatch, loser: Player) =>
  h.program.methods
    .reclaimAfterOptionExpiry()
    .accountsPartial({
      loser: loser.keypair.publicKey,
      arena: h.arenaPda,
      matchAccount: m.match,
      assetMint: h.assetMint,
      loserAssetAccount: loser.assetAccount,
      vault: m.vault,
      assetTokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([loser.keypair])
    .rpc();

const refundTie = (m: OpenMatch, claimant: Player) =>
  h.program.methods
    .refundTie()
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

/** A match with both deposits escrowed, still in Ready. */
async function readyMatch(
  options: CreateOptions = {},
): Promise<OpenMatch & { challenger: Player }> {
  const m = await openMatch(h, options);
  const challenger = await fundedPlayer(h, STAKE * 2n);
  await join(h, m, challenger);
  return { ...m, challenger };
}

/** A Ready match activated on a fresh start price, with its pinned deadlines read back. */
async function liveMatch(
  options: CreateOptions = {},
  priceOptions: PriceUpdateOptions = {},
): Promise<LiveMatch> {
  const m = await readyMatch(options);
  await activate(m, await postPriceUpdate(h, priceOptions));
  const state = await h.program.account.match.fetch(m.match);
  return {
    ...m,
    roundDue: state.roundDueTs.map((t) => BigInt(t.toString())) as unknown as [
      bigint,
      bigint,
      bigint,
    ],
    targetEnd: BigInt(state.targetEndTs.toString()),
    settlementDeadline: BigInt(state.settlementDeadlineTs.toString()),
    optionExpiry: BigInt(state.optionExpiryTs.toString()),
  };
}

/**
 * Run all three rounds and settle, with the creator predicting `creatorPrice` and the challenger
 * `challengerPrice` every round. Returns the live match, already settled.
 */
async function playOut(
  creatorPrice: bigint,
  challengerPrice: bigint,
  options: { skipRound?: number } = {},
): Promise<LiveMatch> {
  const m = await liveMatch();
  for (const [round, due] of m.roundDue.entries()) {
    await warpTo(h, due);
    if (round === options.skipRound) continue;
    await submitRound(m, round, valid(creatorPrice), valid(challengerPrice));
  }
  await warpTo(h, m.targetEnd);
  await settle(m, await postPriceUpdate(h, { price: FINAL_PRICE, publishTime: m.targetEnd }));
  return m;
}

beforeAll(async () => {
  h = await setupHarness();
}, 120_000);

describe('activate_match', () => {
  it('records the start price and pins every downstream deadline', async () => {
    const m = await readyMatch();
    const at = await clockNow(h);
    await activate(m, await postPriceUpdate(h, { publishTime: at }));

    const state = await h.program.account.match.fetch(m.match);
    expect(state.state).toEqual({ active: {} });
    expect(BigInt(state.startObservation.price.toString())).toBe(BENCHMARK_PRICE);
    expect(state.startObservation.exponent).toBe(-5);
    expect(BigInt(state.startObservation.publishTime.toString())).toBe(at);

    const start = BigInt(state.startTs.toString());
    // Demo profile: 9 minutes, rounds at +0 / +3m / +6m, 5 minute grace, 10 minute exercise.
    expect(state.roundDueTs.map((t) => BigInt(t.toString()) - start)).toEqual([0n, 180n, 360n]);
    expect(BigInt(state.targetEndTs.toString()) - start).toBe(540n);
    expect(BigInt(state.settlementDeadlineTs.toString()) - start).toBe(540n + 300n);
    // Expiry runs from the settlement deadline, not from whenever settlement lands, so the loser
    // knows at activation when their position frees up.
    expect(BigInt(state.optionExpiryTs.toString()) - start).toBe(540n + 300n + 600n);
  });

  it('refuses a signer that is not the configured orchestrator', async () => {
    const m = await readyMatch();
    const impostor = await fundedPlayer(h, 0n);
    await expectAnchorError(
      activate(m, await postPriceUpdate(h), impostor.keypair),
      'NotOrchestrator',
    );
  });

  it('is blocked while paused, because activation commits both deposits to a live match', async () => {
    const m = await readyMatch();
    await pause(h, true);
    await expectAnchorError(activate(m, await postPriceUpdate(h)), 'ProtocolPaused');
    await pause(h, false);
    await activate(m, await postPriceUpdate(h));
  });

  it('refuses an update for a different feed', async () => {
    const m = await readyMatch();
    const update = await postPriceUpdate(h, { feedId: Buffer.alloc(32, 0xcd) });
    await expectAnchorError(activate(m, update), 'FeedMismatch');
  });

  it('refuses a start price older than the configured maximum age', async () => {
    const m = await readyMatch();
    const stale = (await clockNow(h)) - 61n; // max_price_age_seconds is 60
    await expectAnchorError(
      activate(m, await postPriceUpdate(h, { publishTime: stale })),
      'StalePrice',
    );
  });

  it('refuses a non-positive price', async () => {
    const m = await readyMatch();
    await expectAnchorError(activate(m, await postPriceUpdate(h, { price: -1n })), 'InvalidPrice');
    await expectAnchorError(activate(m, await postPriceUpdate(h, { price: 0n })), 'InvalidPrice');
  });

  it('refuses a future start observation', async () => {
    const m = await readyMatch();
    const publishTime = (await clockNow(h)) + 60n;
    await expectAnchorError(activate(m, await postPriceUpdate(h, { publishTime })), 'StalePrice');
  });

  it('rejects confidence one mantissa unit above the limit without rounding down', async () => {
    const m = await readyMatch();
    await expectAnchorError(
      activate(m, await postPriceUpdate(h, { price: 20_000_000n, conf: 1_000_001n })),
      'ConfidenceTooHigh',
    );
    await activate(m, await postPriceUpdate(h, { price: 20_000_000n, conf: 1_000_000n }));
  });

  it('keeps existing oracle terms when protocol limits change and applies new limits to new matches', async () => {
    const m = await readyMatch();
    const original = await h.program.account.protocolConfig.fetch(h.configPda);
    const update = (maxPriceAgeSeconds: number, maxConfidenceBps: number) =>
      h.program.methods
        .updateProtocolConfig({
          orchestrator: original.orchestrator,
          minDurationSeconds: original.minDurationSeconds,
          maxDurationSeconds: original.maxDurationSeconds,
          maxPriceAgeSeconds: bn(maxPriceAgeSeconds),
          maxConfidenceBps: bn(maxConfidenceBps),
        })
        .accountsPartial({ admin: h.payer.publicKey, config: h.configPda })
        .rpc();
    try {
      await update(1, 1);
      await activate(
        m,
        await postPriceUpdate(h, { conf: 100_000n, publishTime: (await clockNow(h)) - 2n }),
      );
      const later = await readyMatch();
      const terms = await h.program.account.match.fetch(later.match);
      expect(terms.maxConfidenceBps.toString()).toBe('1');
      expect(terms.maxPriceAgeSeconds.toString()).toBe('1');
      await expectAnchorError(
        activate(later, await postPriceUpdate(h, { conf: 100_000n })),
        'ConfidenceTooHigh',
      );
      const state = await h.program.account.match.fetch(m.match);
      const target = BigInt(state.targetEndTs.toString());
      await warpTo(h, target);
      await settle(m, await postPriceUpdate(h, { conf: 100_000n, publishTime: target }));
    } finally {
      await update(original.maxPriceAgeSeconds.toNumber(), original.maxConfidenceBps.toNumber());
    }
  });

  it('refuses a confidence interval wider than the configured ratio', async () => {
    const m = await readyMatch();
    // max_confidence_bps is 500, so anything above 5% of the price.
    const update = await postPriceUpdate(h, { conf: BENCHMARK_PRICE / 10n });
    await expectAnchorError(activate(m, update), 'ConfidenceTooHigh');
  });

  it('refuses an exponent that cannot be converted to the Arena exponent exactly', async () => {
    const m = await readyMatch();
    // At -8 the mantissa would have to be divided by 1000; one that does not divide evenly is
    // refused rather than truncated. `code.md` §5.6.
    const update = await postPriceUpdate(h, { exponent: -8, price: 22_251_500_001n });
    await expectAnchorError(activate(m, update), 'IncompatibleExponent');
  });

  it('accepts an exponent that converts exactly', async () => {
    const m = await readyMatch();
    await activate(m, await postPriceUpdate(h, { exponent: -8, price: 22_251_500_000n }));
    const state = await h.program.account.match.fetch(m.match);
    expect(BigInt(state.startObservation.price.toString())).toBe(BENCHMARK_PRICE);
    expect(state.startObservation.exponent).toBe(-5);
  });

  it('refuses a partially verified update', async () => {
    const m = await readyMatch();
    const update = await postPriceUpdate(h, { verificationLevel: 'partial' });
    await expectAnchorError(activate(m, update), 'UnverifiedPrice');
  });

  it('refuses an account that is not owned by the Pyth receiver', async () => {
    const m = await readyMatch();
    const update = await postPriceUpdate(h, { owner: TOKEN_PROGRAM_ID });
    await expectAnchorError(activate(m, update), 'AccountOwnedByWrongProgram');
  });

  it('refuses activation once the activation window has closed', async () => {
    const m = await readyMatch();
    const state = await h.program.account.match.fetch(m.match);
    await warpTo(h, BigInt(state.activationDeadlineTs.toString()) + 1n);
    await expectAnchorError(activate(m, await postPriceUpdate(h)), 'ActivationWindowClosed');
  });

  it('cannot be activated twice', async () => {
    const m = await liveMatch();
    await expectAnchorError(activate(m, await postPriceUpdate(h)), 'InvalidMatchState');
  });
});

describe('submit_round_predictions', () => {
  it('records both players in one instruction and marks the round used', async () => {
    const m = await liveMatch();
    await warpTo(h, m.roundDue[0]);
    await submitRound(m, 0, valid(22_300_000n), failed('apiError'));

    const state = await h.program.account.match.fetch(m.match);
    expect(state.submittedRounds).toBe(0b001);
    // predictions is [round][player]; player 0 is the creator, player 1 the challenger.
    const [creatorRecord, challengerRecord] = state.predictions[0] as [
      (typeof state.predictions)[0][0],
      (typeof state.predictions)[0][0],
    ];
    expect(creatorRecord.outcome).toEqual({ valid: {} });
    expect(BigInt(creatorRecord.predictedPrice.toString())).toBe(22_300_000n);
    expect(challengerRecord.outcome).toEqual({ apiError: {} });
    expect(BigInt(challengerRecord.predictedPrice.toString())).toBe(0n);
  });

  it('refuses a second submission for the same round', async () => {
    const m = await liveMatch();
    await warpTo(h, m.roundDue[0]);
    await submitRound(m, 0, valid(1n), valid(1n));
    await expectAnchorError(submitRound(m, 0, valid(2n), valid(2n)), 'RoundAlreadySubmitted');
  });

  it('refuses a signer that is not the configured orchestrator', async () => {
    const m = await liveMatch();
    await warpTo(h, m.roundDue[0]);
    const impostor = await fundedPlayer(h, 0n);
    await expectAnchorError(
      submitRound(m, 0, valid(1n), valid(1n), impostor.keypair),
      'NotOrchestrator',
    );
  });

  it('refuses a round index outside 0..3', async () => {
    const m = await liveMatch();
    await warpTo(h, m.roundDue[0]);
    await expectAnchorError(submitRound(m, 3, valid(1n), valid(1n)), 'InvalidRound');
  });

  it('refuses a round submitted before it is due', async () => {
    const m = await liveMatch();
    await warpTo(h, m.roundDue[1] - 1n);
    await expectAnchorError(submitRound(m, 1, valid(1n), valid(1n)), 'RoundWindowClosed');
  });

  it('refuses a round submitted after its window has closed', async () => {
    const m = await liveMatch();
    // Round 0 closes exactly when round 1 becomes due; late is as invalid as early, because a
    // late round would be chosen with more of the price path already known.
    await warpTo(h, m.roundDue[1]);
    await expectAnchorError(submitRound(m, 0, valid(1n), valid(1n)), 'RoundWindowClosed');
  });

  it('refuses the final round once the target has passed', async () => {
    const m = await liveMatch();
    await warpTo(h, m.targetEnd);
    await expectAnchorError(submitRound(m, 2, valid(1n), valid(1n)), 'RoundWindowClosed');
  });

  it('refuses a Valid outcome without a positive price', async () => {
    const m = await liveMatch();
    await warpTo(h, m.roundDue[0]);
    await expectAnchorError(submitRound(m, 0, valid(0n), valid(1n)), 'InvalidPredictionOutcome');
    await expectAnchorError(
      submitRound(m, 0, valid(1n), prediction('valid', -5n)),
      'InvalidPredictionOutcome',
    );
  });

  it('refuses a failure outcome that smuggles in a price', async () => {
    const m = await liveMatch();
    await warpTo(h, m.roundDue[0]);
    await expectAnchorError(
      submitRound(m, 0, prediction('timeout', 22_400_000n), valid(1n)),
      'InvalidPredictionOutcome',
    );
  });

  it('refuses Unsubmitted, which only the program may reach on its own', async () => {
    const m = await liveMatch();
    await warpTo(h, m.roundDue[0]);
    await expectAnchorError(
      submitRound(m, 0, failed('unsubmitted'), valid(1n)),
      'InvalidPredictionOutcome',
    );
  });

  it('is not blocked by pause, because a live match must be able to finish', async () => {
    const m = await liveMatch();
    await warpTo(h, m.roundDue[0]);
    await pause(h, true);
    await submitRound(m, 0, valid(1n), valid(1n));
    await pause(h, false);
  });
});

describe('settle_match', () => {
  it('scores both players with checked integer math and picks the lower total', async () => {
    const m = await playOut(FINAL_PRICE, FINAL_PRICE + 1_000_000n);
    const state = await h.program.account.match.fetch(m.match);

    expect(state.winner).toEqual({ creator: {} });
    expect(state.state).toEqual({ winnerOptionOpen: {} });
    expect(BigInt(state.creatorScore.toString())).toBe(0n);
    // |1_000_000| * 10_000 / 22_251_500 = 449 bps, weighted per round and truncated before
    // summing: 89 + 134 + 224. Weighting each round separately is what makes the total depend
    // on the weights rather than on the order of operations.
    expect(BigInt(state.challengerScore.toString())).toBe(447n);
    expect(BigInt(state.finalObservation.price.toString())).toBe(FINAL_PRICE);
  });

  it('settles a challenger win symmetrically', async () => {
    const m = await playOut(FINAL_PRICE + 1_000_000n, FINAL_PRICE);
    const state = await h.program.account.match.fetch(m.match);
    expect(state.winner).toEqual({ challenger: {} });
    expect(BigInt(state.creatorScore.toString())).toBe(447n);
    expect(BigInt(state.challengerScore.toString())).toBe(0n);
  });

  it('ties on equal scores and refunds rather than breaking the tie', async () => {
    const m = await playOut(FINAL_PRICE, FINAL_PRICE);
    const state = await h.program.account.match.fetch(m.match);
    expect(state.winner).toEqual({ tie: {} });
    expect(state.state).toEqual({ tieRefundable: {} });
    expect(state.creatorScore.toString()).toBe(state.challengerScore.toString());
  });

  it('charges both players the maximum penalty for a round nobody submitted', async () => {
    const m = await playOut(FINAL_PRICE, FINAL_PRICE, { skipRound: 2 });
    const state = await h.program.account.match.fetch(m.match);
    // MAX_ROUND_ERROR_BPS 100_000 at the 50% final-round weight.
    expect(BigInt(state.creatorScore.toString())).toBe(50_000n);
    expect(BigInt(state.challengerScore.toString())).toBe(50_000n);
    expect(state.winner).toEqual({ tie: {} });
  });

  it('refuses to settle before the target end', async () => {
    const m = await liveMatch();
    await warpTo(h, m.targetEnd - 1n);
    const update = await postPriceUpdate(h, { publishTime: m.targetEnd });
    await expectAnchorError(settle(m, update), 'TargetNotReached');
  });

  it('refuses a price published before the target end', async () => {
    const m = await liveMatch();
    await warpTo(h, m.targetEnd);
    const update = await postPriceUpdate(h, { publishTime: m.targetEnd - 1n });
    await expectAnchorError(settle(m, update), 'SettlementWindowMissed');
  });

  it('refuses a price published after the grace deadline', async () => {
    const m = await liveMatch();
    await warpTo(h, m.settlementDeadline);
    const update = await postPriceUpdate(h, { publishTime: m.settlementDeadline + 1n });
    await expectAnchorError(settle(m, update), 'SettlementWindowMissed');
  });

  it('accepts a price published exactly on the grace deadline', async () => {
    const m = await liveMatch();
    await warpTo(h, m.settlementDeadline);
    await settle(m, await postPriceUpdate(h, { publishTime: m.settlementDeadline }));
    expect((await h.program.account.match.fetch(m.match)).winner).toEqual({ tie: {} });
  });

  it('refuses a future final observation even within the grace window', async () => {
    const m = await liveMatch();
    await warpTo(h, m.targetEnd);
    await expectAnchorError(
      settle(m, await postPriceUpdate(h, { publishTime: m.targetEnd + 1n })),
      'SettlementWindowMissed',
    );
  });

  it('cannot race the refund path with a historical price after the settlement deadline', async () => {
    const m = await liveMatch();
    await warpTo(h, m.settlementDeadline + 1n);
    await expectAnchorError(
      settle(m, await postPriceUpdate(h, { publishTime: m.targetEnd })),
      'SettlementWindowMissed',
    );
    await markOracleFailure(m);
  });

  it('cannot be settled twice', async () => {
    const m = await playOut(FINAL_PRICE, FINAL_PRICE + 1_000_000n);
    const update = await postPriceUpdate(h, { publishTime: m.targetEnd });
    await expectAnchorError(settle(m, update), 'InvalidMatchState');
  });

  it('is permissionless: neither it nor the oracle-failure exit takes a signer', async () => {
    // A vanished orchestrator must never be able to strand escrow, so these two carry no
    // authority account at all. `code.md` §7.4.
    for (const name of ['settle_match', 'mark_oracle_failure_refundable']) {
      const instruction = idlInstructions.find((i) => i.name === name);
      expect(instruction, name).toBeDefined();
      expect(instruction?.accounts.some((a) => a.signer === true)).toBe(false);
    }
  });
});

describe('mark_oracle_failure_refundable', () => {
  it('refuses to fire before the settlement deadline', async () => {
    const m = await liveMatch();
    await warpTo(h, m.settlementDeadline);
    await expectAnchorError(markOracleFailure(m), 'SettlementDeadlineNotPassed');
  });

  it('refunds both deposits when no valid final price ever arrives', async () => {
    const m = await liveMatch();
    const before = await tokenBalance(h, m.player.assetAccount);
    await warpTo(h, m.settlementDeadline + 1n);
    await markOracleFailure(m);

    await refundTieOrFailure(m, m.player);
    await refundTieOrFailure(m, m.challenger);
    expect(await tokenBalance(h, m.vault)).toBe(0n);
    expect(await tokenBalance(h, m.player.assetAccount)).toBe(before + STAKE);
  });
});

/** `refund_failed_match` reaches the same payout as `refund_tie`; both are safe exits. */
const refundTieOrFailure = (m: OpenMatch, claimant: Player) =>
  h.program.methods
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

describe('refund_tie', () => {
  it('returns each deposit exactly once and empties the vault', async () => {
    const m = await playOut(FINAL_PRICE, FINAL_PRICE);
    const creatorBefore = await tokenBalance(h, m.player.assetAccount);
    const challengerBefore = await tokenBalance(h, m.challenger.assetAccount);

    await refundTie(m, m.player);
    await refundTie(m, m.challenger);

    expect(await tokenBalance(h, m.player.assetAccount)).toBe(creatorBefore + STAKE);
    expect(await tokenBalance(h, m.challenger.assetAccount)).toBe(challengerBefore + STAKE);
    expect(await tokenBalance(h, m.vault)).toBe(0n);

    await expectAnchorError(refundTie(m, m.player), 'AlreadySettled');
  });

  it('refuses a match that was not a tie', async () => {
    const m = await playOut(FINAL_PRICE, FINAL_PRICE + 1_000_000n);
    await expectAnchorError(refundTie(m, m.player), 'InvalidMatchState');
  });

  it('still works while paused, because pause must never block a safe exit', async () => {
    const m = await playOut(FINAL_PRICE, FINAL_PRICE);
    await pause(h, true);
    await refundTie(m, m.player);
    await pause(h, false);
  });
});

describe('claim_winner_stake', () => {
  it('returns the winner their own stake exactly once', async () => {
    const m = await playOut(FINAL_PRICE, FINAL_PRICE + 1_000_000n);
    const before = await tokenBalance(h, m.player.assetAccount);

    await claim(m, m.player);
    expect(await tokenBalance(h, m.player.assetAccount)).toBe(before + STAKE);
    // The loser's position is still escrowed: the option has not been resolved yet.
    expect(await tokenBalance(h, m.vault)).toBe(STAKE);

    await expectAnchorError(claim(m, m.player), 'AlreadySettled');
  });

  it('refuses the loser', async () => {
    const m = await playOut(FINAL_PRICE, FINAL_PRICE + 1_000_000n);
    await expectAnchorError(claim(m, m.challenger), 'NotWinner');
  });
});

describe('exercise_option', () => {
  it('moves the exact strike to the loser and the position to the winner in one instruction', async () => {
    const m = await playOut(FINAL_PRICE, FINAL_PRICE + 1_000_000n);
    const winner = m.player;
    const loser = m.challenger;
    const winnerQuote = await giveTokens(h, winner.keypair.publicKey, h.quoteMint, STRIKE);
    const winnerAssetBefore = await tokenBalance(h, winner.assetAccount);

    await exercise(m, winner, loser, winnerQuote);

    // The loser had no quote account; exercise created it with the winner paying rent.
    expect(await tokenBalance(h, quoteAtaFor(h, loser.keypair.publicKey))).toBe(STRIKE);
    expect(await tokenBalance(h, winnerQuote)).toBe(0n);
    expect(await tokenBalance(h, winner.assetAccount)).toBe(winnerAssetBefore + STAKE);

    const state = await h.program.account.match.fetch(m.match);
    expect(state.state).toEqual({ optionExercised: {} });

    // The winner's own stake is untouched by exercising and is still claimable afterwards.
    await claim(m, winner);
    expect(await tokenBalance(h, m.vault)).toBe(0n);
  });

  it('cannot be replayed', async () => {
    const m = await playOut(FINAL_PRICE, FINAL_PRICE + 1_000_000n);
    const winnerQuote = await giveTokens(h, m.player.keypair.publicKey, h.quoteMint, STRIKE * 2n);
    await exercise(m, m.player, m.challenger, winnerQuote);
    await expectAnchorError(exercise(m, m.player, m.challenger, winnerQuote), 'InvalidMatchState');
  });

  it('refuses the loser', async () => {
    const m = await playOut(FINAL_PRICE, FINAL_PRICE + 1_000_000n);
    const loserQuote = await giveTokens(h, m.challenger.keypair.publicKey, h.quoteMint, STRIKE);
    await expectAnchorError(exercise(m, m.challenger, m.player, loserQuote), 'NotWinner');
  });

  it('refuses a quote mint that is not the Arena quote asset', async () => {
    const m = await playOut(FINAL_PRICE, FINAL_PRICE + 1_000_000n);
    // Substitute the Arena's *asset* mint for its quote mint, with matching token accounts on
    // both sides so the attempt is well formed and it is the address constraint that rejects it.
    await expectAnchorError(
      exercise(m, m.player, m.challenger, m.player.assetAccount, {
        quoteMint: h.assetMint,
        loserQuoteAccount: m.challenger.assetAccount,
      }),
      'MintMismatch',
    );
  });

  it('refuses a winner who cannot cover the exact strike', async () => {
    const m = await playOut(FINAL_PRICE, FINAL_PRICE + 1_000_000n);
    const underfunded = await giveTokens(h, m.player.keypair.publicKey, h.quoteMint, STRIKE - 1n);
    await expectFailure(exercise(m, m.player, m.challenger, underfunded));
    // Nothing moved: the position is still escrowed and the option still open.
    expect(await tokenBalance(h, m.vault)).toBe(STAKE * 2n);
  });

  it('refuses once the exercise window has closed', async () => {
    const m = await playOut(FINAL_PRICE, FINAL_PRICE + 1_000_000n);
    const winnerQuote = await giveTokens(h, m.player.keypair.publicKey, h.quoteMint, STRIKE);
    await warpTo(h, m.optionExpiry + 1n);
    await expectAnchorError(exercise(m, m.player, m.challenger, winnerQuote), 'OptionWindowClosed');
  });

  it('still works while paused', async () => {
    const m = await playOut(FINAL_PRICE, FINAL_PRICE + 1_000_000n);
    const winnerQuote = await giveTokens(h, m.player.keypair.publicKey, h.quoteMint, STRIKE);
    await pause(h, true);
    await exercise(m, m.player, m.challenger, winnerQuote);
    await pause(h, false);
  });
});

describe('reclaim_after_option_expiry', () => {
  it('refuses while the option is still open', async () => {
    const m = await playOut(FINAL_PRICE, FINAL_PRICE + 1_000_000n);
    await warpTo(h, m.optionExpiry);
    await expectAnchorError(reclaim(m, m.challenger), 'OptionWindowStillOpen');
  });

  it('returns the loser their position exactly once after expiry', async () => {
    const m = await playOut(FINAL_PRICE, FINAL_PRICE + 1_000_000n);
    const before = await tokenBalance(h, m.challenger.assetAccount);
    await warpTo(h, m.optionExpiry + 1n);

    await reclaim(m, m.challenger);
    expect(await tokenBalance(h, m.challenger.assetAccount)).toBe(before + STAKE);
    await expectAnchorError(reclaim(m, m.challenger), 'InvalidMatchState');

    // And the winner can still take their own stake, emptying the vault.
    await claim(m, m.player);
    expect(await tokenBalance(h, m.vault)).toBe(0n);
  });

  it('refuses anyone but the loser', async () => {
    const m = await playOut(FINAL_PRICE, FINAL_PRICE + 1_000_000n);
    await warpTo(h, m.optionExpiry + 1n);
    await expectAnchorError(reclaim(m, m.player), 'AccountMismatch');
  });
});

describe('escrow conservation', () => {
  it('pays out recorded deposits only, so an unsolicited vault transfer grants nobody anything', async () => {
    const m = await playOut(FINAL_PRICE, FINAL_PRICE + 1_000_000n);
    // Somebody sends tokens into the vault that no deposit accounts for. Entitlements derive
    // from the recorded deposits, so the donation must simply sit there. `code.md` §7.1.
    const donation = 7_000_000n;
    await mintToAccount(h, h.assetMint, m.vault, donation);

    const winnerQuote = await giveTokens(h, m.player.keypair.publicKey, h.quoteMint, STRIKE);
    await exercise(m, m.player, m.challenger, winnerQuote);
    await claim(m, m.player);
    // Both recorded deposits paid out, and the donation is still stranded in the vault rather
    // than having inflated either payout.
    expect(await tokenBalance(h, m.vault)).toBe(donation);

    const state = await h.program.account.match.fetch(m.match);
    expect(BigInt(state.creatorDeposit.toString())).toBe(0n);
    expect(BigInt(state.challengerDeposit.toString())).toBe(0n);
  });

  it('conserves both deposits across every terminal state', async () => {
    // Exercised: winner ends with both positions, loser with the strike.
    const exercised = await playOut(FINAL_PRICE, FINAL_PRICE + 1_000_000n);
    const quote = await giveTokens(h, exercised.player.keypair.publicKey, h.quoteMint, STRIKE);
    await exercise(exercised, exercised.player, exercised.challenger, quote);
    await claim(exercised, exercised.player);
    expect(await tokenBalance(h, exercised.vault)).toBe(0n);

    // Expired: each player ends with their own position back.
    const expired = await playOut(FINAL_PRICE, FINAL_PRICE + 1_000_000n);
    await warpTo(h, expired.optionExpiry + 1n);
    await reclaim(expired, expired.challenger);
    await claim(expired, expired.player);
    expect(await tokenBalance(h, expired.vault)).toBe(0n);

    // Tied: both refunded.
    const tied = await playOut(FINAL_PRICE, FINAL_PRICE);
    await refundTie(tied, tied.player);
    await refundTie(tied, tied.challenger);
    expect(await tokenBalance(h, tied.vault)).toBe(0n);
  });
});

describe('update_protocol_config', () => {
  it('cannot reach escrow: it takes no match, vault or mint account', async () => {
    const instruction = idlInstructions.find((i) => i.name === 'update_protocol_config');
    expect(instruction?.accounts.map((a) => a.name).sort()).toEqual(['admin', 'config']);
  });

  it('has no admin withdrawal instruction anywhere in the IDL', async () => {
    const names = idlInstructions.map((i) => i.name);
    expect(names).not.toContain('withdraw');
    expect(names.filter((n) => n.includes('withdraw'))).toEqual([]);
    // The full §7.3 list, and nothing beyond it.
    expect(names.length).toBe(16);
  });

  it('exposes the Pyth receiver program as the only accepted price-update owner', () => {
    expect(PYTH_RECEIVER_PROGRAM_ID.toBase58()).toBe('rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ');
  });
});
