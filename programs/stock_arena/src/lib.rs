// Silences undeclared-cfg and deprecated-realloc warnings from Anchor 0.31 macro expansion, which
// would otherwise fail `-D warnings` on generated code.
// ponytail: crate-wide, so it also masks deprecated calls we write. Narrow it if that matters.
#![allow(unexpected_cfgs)]
#![allow(deprecated)]

use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod oracle;
pub mod scoring;
pub mod state;
pub mod vault;

use instructions::*;
use state::{MatchProfileKind, PredictionInput};

declare_id!("8xYafVKnRmi99cRPQV2TLRHRH2MsfjZtJH4DMy8anHiC");

#[program]
pub mod stock_arena {
    use super::*;

    pub fn initialize_protocol(
        ctx: Context<InitializeProtocol>,
        params: ProtocolParams,
    ) -> Result<()> {
        instructions::protocol::initialize_protocol(ctx, params)
    }

    pub fn update_protocol_config(
        ctx: Context<UpdateProtocolConfig>,
        params: ProtocolParams,
    ) -> Result<()> {
        instructions::protocol::update_protocol_config(ctx, params)
    }

    pub fn set_paused(ctx: Context<UpdateProtocolConfig>, paused: bool) -> Result<()> {
        instructions::protocol::set_paused(ctx, paused)
    }

    pub fn create_arena(ctx: Context<CreateArena>, params: ArenaParams) -> Result<()> {
        instructions::arena::create_arena(ctx, params)
    }

    pub fn create_match(
        ctx: Context<CreateMatch>,
        match_nonce: u64,
        stake_amount: u64,
        strike_amount: u64,
        profile_kind: MatchProfileKind,
        strategy_commitment: [u8; 32],
    ) -> Result<()> {
        instructions::match_setup::create_match(
            ctx,
            match_nonce,
            stake_amount,
            strike_amount,
            profile_kind,
            strategy_commitment,
        )
    }

    pub fn join_match(ctx: Context<JoinMatch>, strategy_commitment: [u8; 32]) -> Result<()> {
        instructions::match_setup::join_match(ctx, strategy_commitment)
    }

    pub fn cancel_open_match(ctx: Context<CancelOpenMatch>) -> Result<()> {
        instructions::match_setup::cancel_open_match(ctx)
    }

    pub fn refund_failed_match(ctx: Context<RefundDeposit>) -> Result<()> {
        instructions::refund::refund_failed_match(ctx)
    }

    pub fn refund_tie(ctx: Context<RefundDeposit>) -> Result<()> {
        instructions::refund::refund_tie(ctx)
    }

    pub fn activate_match(ctx: Context<ActivateMatch>) -> Result<()> {
        instructions::settlement::activate_match(ctx)
    }

    pub fn submit_round_predictions(
        ctx: Context<SubmitRoundPredictions>,
        round: u8,
        creator_input: PredictionInput,
        challenger_input: PredictionInput,
    ) -> Result<()> {
        instructions::settlement::submit_round_predictions(
            ctx,
            round,
            creator_input,
            challenger_input,
        )
    }

    pub fn settle_match(ctx: Context<SettleMatch>) -> Result<()> {
        instructions::settlement::settle_match(ctx)
    }

    pub fn mark_oracle_failure_refundable(ctx: Context<MarkOracleFailureRefundable>) -> Result<()> {
        instructions::settlement::mark_oracle_failure_refundable(ctx)
    }

    pub fn claim_winner_stake(ctx: Context<ClaimWinnerStake>) -> Result<()> {
        instructions::option::claim_winner_stake(ctx)
    }

    pub fn exercise_option(ctx: Context<ExerciseOption>) -> Result<()> {
        instructions::option::exercise_option(ctx)
    }

    pub fn reclaim_after_option_expiry(ctx: Context<ReclaimAfterOptionExpiry>) -> Result<()> {
        instructions::option::reclaim_after_option_expiry(ctx)
    }
}
