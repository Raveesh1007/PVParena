use anchor_lang::prelude::*;
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;

use crate::errors::ArenaError;
use crate::oracle::read_observation;
use crate::scoring::{select_winner, total_score};
use crate::state::*;

#[event]
pub struct MatchActivated {
    pub match_account: Pubkey,
    pub start_price: i64,
    pub start_publish_time: i64,
    pub target_end_ts: i64,
}

/// One event for both outcomes: an indexer must never see one prediction before the other.
#[event]
pub struct RoundSubmitted {
    pub match_account: Pubkey,
    pub round: u8,
    pub creator_outcome: PredictionOutcome,
    pub creator_predicted_price: i64,
    pub challenger_outcome: PredictionOutcome,
    pub challenger_predicted_price: i64,
}

#[event]
pub struct MatchSettled {
    pub match_account: Pubkey,
    pub final_price: i64,
    pub final_publish_time: i64,
    pub creator_score: u128,
    pub challenger_score: u128,
    pub winner: Winner,
}

#[derive(Accounts)]
pub struct ActivateMatch<'info> {
    /// Only the configured orchestrator may start the clock, because activation fixes the start
    /// price every later score is measured against.
    pub orchestrator: Signer<'info>,
    #[account(
        seeds = [b"config"],
        bump = config.bump,
        constraint = config.orchestrator == orchestrator.key() @ ArenaError::NotOrchestrator
    )]
    pub config: Account<'info, ProtocolConfig>,
    #[account(
        seeds = [b"arena", arena.asset_mint.as_ref(), arena.benchmark_feed_id.as_ref()],
        bump = arena.bump
    )]
    pub arena: Account<'info, Arena>,
    #[account(
        mut,
        seeds = [b"match", match_account.creator.as_ref(), &match_account.match_nonce.to_le_bytes()],
        bump = match_account.bump,
        has_one = arena @ ArenaError::AccountMismatch
    )]
    pub match_account: Box<Account<'info, Match>>,
    /// Owned by the Pyth receiver program; the `Account` wrapper enforces that. The worker posts
    /// this immediately before calling, and may close it afterwards to reclaim rent.
    pub price_update: Account<'info, PriceUpdateV2>,
}

/// Pins every absolute deadline on-chain here, so a slow or absent orchestrator cannot move one.
pub fn activate_match(ctx: Context<ActivateMatch>) -> Result<()> {
    // Activation creates new risk (it commits both deposits to a live match), so unlike every
    // refund and claim path it is gated on the global pause. `code.md` §7.4.
    require!(!ctx.accounts.config.paused, ArenaError::ProtocolPaused);

    let now = Clock::get()?.unix_timestamp;
    let arena = &ctx.accounts.arena;
    let observation = read_observation(
        &ctx.accounts.price_update,
        arena,
        &ctx.accounts.match_account,
    )?;

    // The authoritative staleness guard. `code.md` §5.2 makes this the *only* availability
    // check: there is no market-session calendar, so a weekend or holiday gap simply presents as
    // a start price too old to activate on.
    let age = now
        .checked_sub(observation.publish_time)
        .ok_or(ArenaError::MathOverflow)?;
    require!(
        age >= 0
            && age
                <= i64::try_from(ctx.accounts.match_account.max_price_age_seconds)
                    .map_err(|_| ArenaError::MathOverflow)?,
        ArenaError::StalePrice
    );

    let match_account = &mut ctx.accounts.match_account;
    require!(
        match_account.state == MatchState::Ready,
        ArenaError::InvalidMatchState
    );
    require!(
        now <= match_account.activation_deadline_ts,
        ArenaError::ActivationWindowClosed
    );

    let profile = *arena.profile(match_account.profile_kind);
    let mut round_due_ts = [0i64; ROUNDS];
    for (due, offset) in round_due_ts.iter_mut().zip(profile.round_due_offsets) {
        *due = now.checked_add(offset).ok_or(ArenaError::MathOverflow)?;
    }
    let target_end_ts = now
        .checked_add(profile.duration_seconds)
        .ok_or(ArenaError::MathOverflow)?;
    let settlement_deadline_ts = target_end_ts
        .checked_add(profile.settlement_grace_seconds)
        .ok_or(ArenaError::MathOverflow)?;
    // Measured from the settlement *deadline*, not from whenever settlement actually lands, so
    // the loser knows when their position frees up the moment the match starts and a late
    // settlement cannot shorten the winner's window below the configured one.
    let option_expiry_ts = settlement_deadline_ts
        .checked_add(profile.exercise_window_seconds)
        .ok_or(ArenaError::MathOverflow)?;

    match_account.start_ts = now;
    match_account.round_due_ts = round_due_ts;
    match_account.target_end_ts = target_end_ts;
    match_account.settlement_deadline_ts = settlement_deadline_ts;
    match_account.option_expiry_ts = option_expiry_ts;
    match_account.start_observation = observation;
    match_account.state = MatchState::Active;

    emit!(MatchActivated {
        match_account: match_account.key(),
        start_price: observation.price,
        start_publish_time: observation.publish_time,
        target_end_ts,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct SubmitRoundPredictions<'info> {
    pub orchestrator: Signer<'info>,
    #[account(
        seeds = [b"config"],
        bump = config.bump,
        constraint = config.orchestrator == orchestrator.key() @ ArenaError::NotOrchestrator
    )]
    pub config: Account<'info, ProtocolConfig>,
    #[account(
        mut,
        seeds = [b"match", match_account.creator.as_ref(), &match_account.match_nonce.to_le_bytes()],
        bump = match_account.bump
    )]
    pub match_account: Box<Account<'info, Match>>,
}

/// Both players' predictions for exactly one round, in one instruction.
///
/// Atomicity is the point: a separate per-player instruction would let whoever sees the first
/// transaction copy or front-run the second. It does **not** make the orchestrator trustless — it
/// sees both agent responses before building this transaction — and `code.md` §6 is explicit that
/// the MVP does not claim otherwise. What it does buy is that no third party can exploit the
/// gap, and that the pair is auditable against the recorded transcript.
///
/// Deliberately not gated on `paused`: pausing blocks new risk, and a match that is already
/// running must still be able to finish rather than being frozen mid-flight.
pub fn submit_round_predictions(
    ctx: Context<SubmitRoundPredictions>,
    round: u8,
    creator_input: PredictionInput,
    challenger_input: PredictionInput,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let match_account = &mut ctx.accounts.match_account;
    require!(
        match_account.state == MatchState::Active,
        ArenaError::InvalidMatchState
    );

    let index = usize::from(round);
    require!(index < ROUNDS, ArenaError::InvalidRound);
    require!(
        !match_account.round_submitted(round),
        ArenaError::RoundAlreadySubmitted
    );

    // Open from this round's due time until the next round is due (or, for the final round, the
    // match's target end). Late is as invalid as early: a round submitted after its window would
    // let the orchestrator pick predictions with more of the price path already known.
    require!(
        now >= match_account.round_due_ts[index] && now < match_account.round_window_end(index),
        ArenaError::RoundWindowClosed
    );

    let creator = creator_input.into_record()?;
    let challenger = challenger_input.into_record()?;
    match_account.predictions[index][Match::CREATOR_INDEX] = creator;
    match_account.predictions[index][Match::CHALLENGER_INDEX] = challenger;
    match_account.mark_round_submitted(round);

    emit!(RoundSubmitted {
        match_account: match_account.key(),
        round,
        creator_outcome: creator.outcome,
        creator_predicted_price: creator.predicted_price,
        challenger_outcome: challenger.outcome,
        challenger_predicted_price: challenger.predicted_price,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct SettleMatch<'info> {
    #[account(
        seeds = [b"arena", arena.asset_mint.as_ref(), arena.benchmark_feed_id.as_ref()],
        bump = arena.bump
    )]
    pub arena: Account<'info, Arena>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, ProtocolConfig>,
    #[account(
        mut,
        seeds = [b"match", match_account.creator.as_ref(), &match_account.match_nonce.to_le_bytes()],
        bump = match_account.bump,
        has_one = arena @ ArenaError::AccountMismatch
    )]
    pub match_account: Box<Account<'info, Match>>,
    pub price_update: Account<'info, PriceUpdateV2>,
}

/// Settle with a Pyth update published inside the match's settlement window.
///
/// Permissionless on purpose. The orchestrator is expected to do it, but if it never does, either
/// player (or anyone at all) can post a valid update and settle; that is what stops a vanished
/// worker from stranding escrow while a decisive price exists. The caller supplies only an
/// account, never a number — there is no code path anywhere that accepts a client-supplied price.
pub fn settle_match(ctx: Context<SettleMatch>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let arena = &ctx.accounts.arena;
    let observation = read_observation(
        &ctx.accounts.price_update,
        arena,
        &ctx.accounts.match_account,
    )?;
    let weights = arena.round_weights_bps;

    let match_account = &mut ctx.accounts.match_account;
    require!(
        match_account.state == MatchState::Active,
        ArenaError::InvalidMatchState
    );
    require!(
        now >= match_account.target_end_ts,
        ArenaError::TargetNotReached
    );

    // `target_end_ts <= publish_time <= target_end_ts + settlement_grace_seconds`. `code.md` §3.2.
    //
    // The lower bound matters as much as the upper one: an update published before the target is
    // not the closing price, and accepting one would let a settler choose the most favourable
    // moment from the recent past. If no update lands inside the window the match is not settled
    // by approximation — it becomes refundable through `mark_oracle_failure_refundable`.
    require!(
        now <= match_account.settlement_deadline_ts
            && observation.publish_time <= now
            && observation.publish_time >= match_account.target_end_ts
            && observation.publish_time <= match_account.settlement_deadline_ts,
        ArenaError::SettlementWindowMissed
    );

    let start_price = match_account.start_observation.price;
    let final_price = observation.price;
    // Both observations were normalized to the Arena exponent when they were read, so scoring
    // compares like with like without rescaling anything here.
    let creator_predictions = [
        match_account.predictions[0][Match::CREATOR_INDEX],
        match_account.predictions[1][Match::CREATOR_INDEX],
        match_account.predictions[2][Match::CREATOR_INDEX],
    ];
    let challenger_predictions = [
        match_account.predictions[0][Match::CHALLENGER_INDEX],
        match_account.predictions[1][Match::CHALLENGER_INDEX],
        match_account.predictions[2][Match::CHALLENGER_INDEX],
    ];
    let creator_score = total_score(&creator_predictions, &weights, final_price, start_price)?;
    let challenger_score =
        total_score(&challenger_predictions, &weights, final_price, start_price)?;
    let winner = select_winner(creator_score, challenger_score);

    match_account.final_observation = observation;
    match_account.creator_score = creator_score;
    match_account.challenger_score = challenger_score;
    match_account.winner = winner;
    // A tie refunds both deposits rather than resolving by any tiebreak, so it never enters the
    // option flow. `code.md` §5.6.
    match_account.state = if winner == Winner::Tie {
        MatchState::TieRefundable
    } else {
        MatchState::WinnerOptionOpen
    };

    emit!(MatchSettled {
        match_account: match_account.key(),
        final_price,
        final_publish_time: observation.publish_time,
        creator_score,
        challenger_score,
        winner,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct MarkOracleFailureRefundable<'info> {
    #[account(
        mut,
        seeds = [b"match", match_account.creator.as_ref(), &match_account.match_nonce.to_le_bytes()],
        bump = match_account.bump
    )]
    pub match_account: Box<Account<'info, Match>>,
}

/// The safe exit from `Active` when no usable final price ever arrives.
///
/// Permissionless once the settlement deadline passes, and requiring no accounts beyond the match
/// itself, so neither the orchestrator nor an admin can withhold it. There is deliberately no
/// instruction that lets anyone substitute a price instead: a match with no oracle result refunds
/// both players rather than producing a winner someone chose. `code.md` §3.2, §7.3.
pub fn mark_oracle_failure_refundable(ctx: Context<MarkOracleFailureRefundable>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let match_account = &mut ctx.accounts.match_account;
    require!(
        match_account.state == MatchState::Active,
        ArenaError::InvalidMatchState
    );
    require!(
        now > match_account.settlement_deadline_ts,
        ArenaError::SettlementDeadlineNotPassed
    );
    match_account.state = MatchState::FailureRefundable;
    Ok(())
}
