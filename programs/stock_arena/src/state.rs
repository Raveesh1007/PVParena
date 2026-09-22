use anchor_lang::prelude::*;

/// Round weights in basis points, summing to BPS_DENOMINATOR. `code.md` §5.1.
pub const ROUND_WEIGHTS_BPS: [u16; 3] = [2000, 3000, 5000];
pub const BPS_DENOMINATOR: u128 = 10_000;
pub const ROUNDS: usize = 3;

/// Error charged for a prediction that was invalid, failed or never submitted. `code.md` §5.6.
pub const MAX_ROUND_ERROR_BPS: u128 = 100_000;

/// The exponent every price is normalized to before scoring. `code.md` §2.
pub const BENCHMARK_EXPONENT: i32 = -5;

/// Production window lengths. The program reads the Arena's `TimingProfile`, not these; they exist
/// so the configure script has one place to state the intended values. `code.md` §5.1.
pub const JOIN_WINDOW_SECONDS: i64 = 15 * 60;
pub const ACTIVATION_WINDOW_SECONDS: i64 = 5 * 60;

#[account]
#[derive(InitSpace)]
pub struct ProtocolConfig {
    pub admin: Pubkey,
    pub orchestrator: Pubkey,
    /// Blocks match creation and activation only. Never blocks a refund, claim, exercise or
    /// expiry reclaim. `code.md` §7.4.
    pub paused: bool,
    pub min_duration_seconds: i64,
    pub max_duration_seconds: i64,
    pub max_price_age_seconds: u64,
    pub max_confidence_bps: u64,
    pub bump: u8,
}

/// Timing for one match profile, in seconds relative to activation. `code.md` §5.1.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace, PartialEq, Eq, Debug)]
pub struct TimingProfile {
    pub duration_seconds: i64,
    pub round_due_offsets: [i64; ROUNDS],
    pub settlement_grace_seconds: i64,
    pub exercise_window_seconds: i64,
    /// How long an Open match stays joinable, and how long a Ready match stays activatable.
    /// These live here rather than as constants so every deadline is Arena-configured and can
    /// therefore be driven to expiry in a test. `code.md` §7.1 puts timing profiles on the Arena.
    pub join_window_seconds: i64,
    pub activation_window_seconds: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace, PartialEq, Eq, Debug)]
pub enum MatchProfileKind {
    Standard,
    Demo,
}

#[account]
#[derive(InitSpace)]
pub struct Arena {
    /// Devnet test copy of the PreStocks asset. Never the real mainnet mint. `code.md` §2.
    pub asset_mint: Pubkey,
    pub asset_token_program: Pubkey,
    pub quote_mint: Pubkey,
    pub quote_token_program: Pubkey,
    /// Pyth 32-byte Core feed ID. Never a Terminal/Lazer identifier such as 1314 or 922.
    pub benchmark_feed_id: [u8; 32],
    pub benchmark_exponent: i32,
    pub standard_profile: TimingProfile,
    pub demo_profile: TimingProfile,
    pub round_weights_bps: [u16; ROUNDS],
    pub max_price_age_seconds: u64,
    pub max_confidence_bps: u64,
    pub active: bool,
    pub bump: u8,
}

impl Arena {
    pub fn profile(&self, kind: MatchProfileKind) -> &TimingProfile {
        match kind {
            MatchProfileKind::Standard => &self.standard_profile,
            MatchProfileKind::Demo => &self.demo_profile,
        }
    }
}

/// `code.md` §7.2.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace, PartialEq, Eq, Debug)]
pub enum MatchState {
    Open,
    Ready,
    Active,
    AwaitingSettlement,
    WinnerOptionOpen,
    TieRefundable,
    FailureRefundable,
    OptionExercised,
    OptionExpired,
    Cancelled,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace, PartialEq, Eq, Debug)]
pub enum Winner {
    Unset,
    Creator,
    Challenger,
    Tie,
}

/// Why a prediction is or is not usable. A non-Valid outcome carries a zero price and receives
/// MAX_ROUND_ERROR_BPS. `code.md` §5.5.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace, PartialEq, Eq, Debug)]
pub enum PredictionOutcome {
    Unsubmitted,
    Valid,
    Timeout,
    ApiError,
    Malformed,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace, PartialEq, Eq, Debug)]
pub struct PredictionRecord {
    pub outcome: PredictionOutcome,
    pub predicted_price: i64,
}

/// One player's prediction for one round, as the orchestrator submits it. `code.md` §5.5.
///
/// Distinct from `PredictionRecord` because `Unsubmitted` is a *stored* state the program reaches
/// on its own when a round is never submitted, and must never be something the orchestrator can
/// claim happened.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug)]
pub struct PredictionInput {
    pub outcome: PredictionOutcome,
    pub predicted_price: i64,
}

impl PredictionInput {
    /// `Valid` carries a positive price; every failure outcome carries exactly zero and later
    /// takes `MAX_ROUND_ERROR_BPS`. A failure outcome smuggling in a price, or a `Valid` with a
    /// zero or negative one, is rejected at submission rather than at scoring. `code.md` §5.5.
    pub fn into_record(self) -> Result<PredictionRecord> {
        match self.outcome {
            PredictionOutcome::Unsubmitted => {
                return Err(crate::errors::ArenaError::InvalidPredictionOutcome.into())
            }
            PredictionOutcome::Valid => require!(
                self.predicted_price > 0,
                crate::errors::ArenaError::InvalidPredictionOutcome
            ),
            _ => require!(
                self.predicted_price == 0,
                crate::errors::ArenaError::InvalidPredictionOutcome
            ),
        }
        Ok(PredictionRecord {
            outcome: self.outcome,
            predicted_price: self.predicted_price,
        })
    }
}

impl Default for PredictionRecord {
    fn default() -> Self {
        Self {
            outcome: PredictionOutcome::Unsubmitted,
            predicted_price: 0,
        }
    }
}

/// A Pyth observation recorded on-chain after validation. `code.md` §3.2.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace, Default, Debug)]
pub struct PriceObservation {
    pub price: i64,
    pub exponent: i32,
    pub confidence: u64,
    pub publish_time: i64,
}

#[account]
#[derive(InitSpace)]
pub struct Match {
    pub arena: Pubkey,
    pub creator: Pubkey,
    /// Pubkey::default() until join_match. Compare against creator to reject a self-challenge.
    pub challenger: Pubkey,
    pub match_nonce: u64,

    /// Exact Arena-asset amount each player escrows.
    pub stake_amount: u64,
    /// Exact quote-token amount the winner pays the loser to exercise. Binding as signed.
    pub strike_amount: u64,
    pub profile_kind: MatchProfileKind,
    /// Effective oracle limits fixed at creation; protocol updates affect new matches only.
    pub max_price_age_seconds: u64,
    pub max_confidence_bps: u64,

    pub creator_strategy_commitment: [u8; 32],
    pub challenger_strategy_commitment: [u8; 32],

    pub created_ts: i64,
    pub join_deadline_ts: i64,
    pub activation_deadline_ts: i64,
    pub start_ts: i64,
    pub round_due_ts: [i64; ROUNDS],
    pub target_end_ts: i64,
    pub settlement_deadline_ts: i64,
    pub option_expiry_ts: i64,

    pub start_observation: PriceObservation,
    pub final_observation: PriceObservation,

    /// [round][player_index]; player_index 0 = creator, 1 = challenger.
    pub predictions: [[PredictionRecord; 2]; ROUNDS],
    /// Bit i set once round i has been submitted. Enforces single-use per round.
    pub submitted_rounds: u8,

    pub creator_score: u128,
    pub challenger_score: u128,
    pub winner: Winner,
    pub state: MatchState,

    /// Internal deposit accounting. Entitlements derive from these, never from raw vault
    /// balance, so an unsolicited transfer into the vault grants nobody anything. `code.md` §7.1.
    pub creator_deposit: u64,
    pub challenger_deposit: u64,

    pub winner_stake_claimed: bool,
    pub creator_refunded: bool,
    pub challenger_refunded: bool,

    pub bump: u8,
}

impl Match {
    pub const CREATOR_INDEX: usize = 0;
    pub const CHALLENGER_INDEX: usize = 1;

    pub fn round_submitted(&self, round: u8) -> bool {
        self.submitted_rounds & (1 << round) != 0
    }

    pub fn mark_round_submitted(&mut self, round: u8) {
        self.submitted_rounds |= 1 << round;
    }

    /// Total recorded deposits. Player entitlements must never exceed this. `code.md` §7.4.
    pub fn total_deposits(&self) -> Option<u64> {
        self.creator_deposit.checked_add(self.challenger_deposit)
    }

    /// (winner, loser) once `settle_match` has recorded a decisive result. A tie has no winner
    /// and refunds instead, so it is an error here rather than an arbitrary choice.
    pub fn winner_and_loser(&self) -> Result<(Pubkey, Pubkey)> {
        match self.winner {
            Winner::Creator => Ok((self.creator, self.challenger)),
            Winner::Challenger => Ok((self.challenger, self.creator)),
            Winner::Unset | Winner::Tie => Err(crate::errors::ArenaError::InvalidMatchState.into()),
        }
    }

    /// The deadline after which round `round` may no longer be submitted: the next round's due
    /// time, or for the final round the match's target end. `code.md` §5.1.
    pub fn round_window_end(&self, round: usize) -> i64 {
        if round + 1 < ROUNDS {
            self.round_due_ts[round + 1]
        } else {
            self.target_end_ts
        }
    }
}
