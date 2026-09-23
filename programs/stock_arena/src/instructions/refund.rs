use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::errors::ArenaError;
use crate::state::*;
use crate::vault::pay_out;

/// Shared by both refund paths: they differ only in accepted state, not in payout.
#[derive(Accounts)]
pub struct RefundDeposit<'info> {
    #[account(mut)]
    pub claimant: Signer<'info>,
    /// The claimant's own stake Arena; checked against the match in the handler.
    #[account(seeds = [b"arena", arena.asset_mint.as_ref(), arena.benchmark_feed_id.as_ref()], bump = arena.bump)]
    pub arena: Account<'info, Arena>,
    #[account(
        mut,
        seeds = [b"match", match_account.creator.as_ref(), &match_account.match_nonce.to_le_bytes()],
        bump = match_account.bump
    )]
    pub match_account: Box<Account<'info, Match>>,
    #[account(address = arena.asset_mint @ ArenaError::MintMismatch)]
    pub asset_mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        token::mint = asset_mint,
        token::authority = claimant,
        token::token_program = asset_token_program
    )]
    pub claimant_asset_account: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = asset_mint,
        associated_token::authority = match_account,
        associated_token::token_program = asset_token_program
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    #[account(address = arena.asset_token_program @ ArenaError::MintMismatch)]
    pub asset_token_program: Interface<'info, TokenInterface>,
}

/// Flag and zero before transferring, so a replay finds the flag set instead of paying twice.
/// Non-players are rejected outright rather than handed a zero-amount no-op.
fn withdraw_own_deposit(match_account: &mut Match, claimant: Pubkey) -> Result<u64> {
    let amount = if claimant == match_account.creator {
        require!(!match_account.creator_refunded, ArenaError::AlreadySettled);
        match_account.creator_refunded = true;
        core::mem::replace(&mut match_account.creator_deposit, 0)
    } else if claimant == match_account.challenger {
        require!(
            !match_account.challenger_refunded,
            ArenaError::AlreadySettled
        );
        match_account.challenger_refunded = true;
        core::mem::replace(&mut match_account.challenger_deposit, 0)
    } else {
        return Err(ArenaError::AccountMismatch.into());
    };
    require!(amount > 0, ArenaError::DepositMismatch);
    Ok(amount)
}

fn settle_refund(ctx: Context<RefundDeposit>) -> Result<()> {
    let claimant = ctx.accounts.claimant.key();
    let match_account = &mut ctx.accounts.match_account;
    require!(
        ctx.accounts.arena.key() == match_account.stake_arena(claimant)?,
        ArenaError::AccountMismatch
    );
    let amount = withdraw_own_deposit(match_account, claimant)?;
    pay_out(
        match_account,
        &ctx.accounts.asset_token_program,
        &ctx.accounts.asset_mint,
        &ctx.accounts.vault,
        &ctx.accounts.claimant_asset_account,
        amount,
    )
}

/// Safe exit for an unactivated `Ready` match and for a failed oracle — no winner was determined,
/// so each player takes back their own stake. Needs no orchestrator or admin, and is not gated on
/// `paused`: pause stops new risk and must never trap existing deposits.
pub fn refund_failed_match(ctx: Context<RefundDeposit>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;

    // A Ready match becomes refundable once its activation window closes. Anyone may make that
    // transition; only a player can withdraw.
    match ctx.accounts.match_account.state {
        MatchState::Ready => {
            require!(
                now > ctx.accounts.match_account.activation_deadline_ts,
                ArenaError::ActivationWindowStillOpen
            );
            ctx.accounts.match_account.state = MatchState::FailureRefundable;
        }
        MatchState::FailureRefundable => {}
        _ => return Err(ArenaError::InvalidMatchState.into()),
    }

    settle_refund(ctx)
}

/// Ties refund rather than tiebreak: every on-chain tiebreak is grindable or favours who moved
/// first. Separate from `refund_failed_match` only to keep the reason legible; payout is identical.
pub fn refund_tie(ctx: Context<RefundDeposit>) -> Result<()> {
    require!(
        ctx.accounts.match_account.state == MatchState::TieRefundable,
        ArenaError::InvalidMatchState
    );
    settle_refund(ctx)
}
