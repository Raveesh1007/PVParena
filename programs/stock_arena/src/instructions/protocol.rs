use anchor_lang::prelude::*;

use crate::errors::ArenaError;
use crate::state::*;

#[derive(Accounts)]
pub struct InitializeProtocol<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        init,
        payer = admin,
        space = 8 + ProtocolConfig::INIT_SPACE,
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, ProtocolConfig>,
    pub system_program: Program<'info, System>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct ProtocolParams {
    pub orchestrator: Pubkey,
    pub min_duration_seconds: i64,
    pub max_duration_seconds: i64,
    pub max_price_age_seconds: u64,
    pub max_confidence_bps: u64,
}

fn validate(params: &ProtocolParams) -> Result<()> {
    require!(
        params.min_duration_seconds >= 9 * 60,
        ArenaError::DurationOutOfBounds
    );
    require!(
        params.max_duration_seconds >= params.min_duration_seconds,
        ArenaError::DurationOutOfBounds
    );
    require!(params.max_price_age_seconds > 0, ArenaError::ZeroAmount);
    require!(params.max_confidence_bps > 0, ArenaError::ZeroAmount);
    Ok(())
}

pub fn initialize_protocol(ctx: Context<InitializeProtocol>, params: ProtocolParams) -> Result<()> {
    validate(&params)?;
    ctx.accounts.config.set_inner(ProtocolConfig {
        admin: ctx.accounts.admin.key(),
        orchestrator: params.orchestrator,
        paused: false,
        min_duration_seconds: params.min_duration_seconds,
        max_duration_seconds: params.max_duration_seconds,
        max_price_age_seconds: params.max_price_age_seconds,
        max_confidence_bps: params.max_confidence_bps,
        bump: ctx.bumps.config,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct UpdateProtocolConfig<'info> {
    pub admin: Signer<'info>,
    #[account(
        mut,
        seeds = [b"config"],
        bump = config.bump,
        has_one = admin @ ArenaError::NotAdmin
    )]
    pub config: Account<'info, ProtocolConfig>,
}

/// Rotates the orchestrator key and Pyth limits without a redeploy. Takes no Match or vault
/// account, so it cannot reach escrow or in-flight terms.
pub fn update_protocol_config(
    ctx: Context<UpdateProtocolConfig>,
    params: ProtocolParams,
) -> Result<()> {
    validate(&params)?;
    let config = &mut ctx.accounts.config;
    config.orchestrator = params.orchestrator;
    config.min_duration_seconds = params.min_duration_seconds;
    config.max_duration_seconds = params.max_duration_seconds;
    config.max_price_age_seconds = params.max_price_age_seconds;
    config.max_confidence_bps = params.max_confidence_bps;
    Ok(())
}

pub fn set_paused(ctx: Context<UpdateProtocolConfig>, paused: bool) -> Result<()> {
    ctx.accounts.config.paused = paused;
    Ok(())
}
