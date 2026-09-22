use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{
    transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked,
};

use crate::errors::ArenaError;
use crate::state::*;
use crate::vault::pay_out;

#[event]
pub struct OptionExercised {
    pub match_account: Pubkey,
    pub winner: Pubkey,
    pub loser: Pubkey,
    pub asset_amount: u64,
    pub strike_amount: u64,
}

#[derive(Accounts)]
pub struct ClaimWinnerStake<'info> {
    #[account(mut)]
    pub winner: Signer<'info>,
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
    #[account(address = arena.asset_mint @ ArenaError::MintMismatch)]
    pub asset_mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        token::mint = asset_mint,
        token::authority = winner,
        token::token_program = asset_token_program
    )]
    pub winner_asset_account: InterfaceAccount<'info, TokenAccount>,
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

/// Accepted in every post-settlement state: the winner's own deposit is unrelated to the option,
/// and gating it on one state would strand a winner who exercised before claiming.
pub fn claim_winner_stake(ctx: Context<ClaimWinnerStake>) -> Result<()> {
    let match_account = &mut ctx.accounts.match_account;
    require!(
        matches!(
            match_account.state,
            MatchState::WinnerOptionOpen | MatchState::OptionExercised | MatchState::OptionExpired
        ),
        ArenaError::InvalidMatchState
    );
    let (winner, _) = match_account.winner_and_loser()?;
    require!(ctx.accounts.winner.key() == winner, ArenaError::NotWinner);
    require!(
        !match_account.winner_stake_claimed,
        ArenaError::AlreadySettled
    );

    // Debit the record before the transfer so the flag and the deposit can never disagree, even
    // if the CPI below were to fail and be retried.
    match_account.winner_stake_claimed = true;
    let amount = if winner == match_account.creator {
        core::mem::replace(&mut match_account.creator_deposit, 0)
    } else {
        core::mem::replace(&mut match_account.challenger_deposit, 0)
    };
    require!(amount > 0, ArenaError::DepositMismatch);

    pay_out(
        match_account,
        &ctx.accounts.asset_token_program,
        &ctx.accounts.asset_mint,
        &ctx.accounts.vault,
        &ctx.accounts.winner_asset_account,
        amount,
    )
}

/// Boxed: twelve inline accounts overflow the 4KB BPF stack frame in generated `try_accounts`.
#[derive(Accounts)]
pub struct ExerciseOption<'info> {
    #[account(mut)]
    pub winner: Signer<'info>,
    /// CHECK: identity only — it is the ATA authority for the strike payment and is checked
    /// against the match's recorded loser in the handler. It is never read or written.
    #[account(
        constraint = loser.key() == match_account.creator
            || loser.key() == match_account.challenger @ ArenaError::AccountMismatch
    )]
    pub loser: UncheckedAccount<'info>,
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
    #[account(address = arena.asset_mint @ ArenaError::MintMismatch)]
    pub asset_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(address = arena.quote_mint @ ArenaError::MintMismatch)]
    pub quote_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        token::mint = asset_mint,
        token::authority = winner,
        token::token_program = asset_token_program
    )]
    pub winner_asset_account: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        token::mint = quote_mint,
        token::authority = winner,
        token::token_program = quote_token_program
    )]
    pub winner_quote_account: Box<InterfaceAccount<'info, TokenAccount>>,
    /// There is no persistent quote vault: the strike moves straight from winner to loser.
    /// `init_if_needed` so a loser who has never held the quote asset can still be paid, with the
    /// winner covering the rent as the party choosing to exercise. `code.md` §7.1.
    #[account(
        init_if_needed,
        payer = winner,
        associated_token::mint = quote_mint,
        associated_token::authority = loser,
        associated_token::token_program = quote_token_program
    )]
    pub loser_quote_account: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        associated_token::mint = asset_mint,
        associated_token::authority = match_account,
        associated_token::token_program = asset_token_program
    )]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(address = arena.asset_token_program @ ArenaError::MintMismatch)]
    pub asset_token_program: Interface<'info, TokenInterface>,
    #[account(address = arena.quote_token_program @ ArenaError::MintMismatch)]
    pub quote_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

/// The strike is frozen at join and no off-chain price influences it, which is what makes the
/// option safe on an asset with no trustworthy on-chain price.
pub fn exercise_option(ctx: Context<ExerciseOption>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let match_account = &mut ctx.accounts.match_account;
    require!(
        match_account.state == MatchState::WinnerOptionOpen,
        ArenaError::InvalidMatchState
    );
    require!(
        now <= match_account.option_expiry_ts,
        ArenaError::OptionWindowClosed
    );

    let (winner, loser) = match_account.winner_and_loser()?;
    require!(ctx.accounts.winner.key() == winner, ArenaError::NotWinner);
    require!(
        ctx.accounts.loser.key() == loser,
        ArenaError::AccountMismatch
    );

    let strike_amount = match_account.strike_amount;
    let asset_amount = if loser == match_account.creator {
        core::mem::replace(&mut match_account.creator_deposit, 0)
    } else {
        core::mem::replace(&mut match_account.challenger_deposit, 0)
    };
    require!(asset_amount > 0, ArenaError::DepositMismatch);
    match_account.state = MatchState::OptionExercised;

    // Strike first, then the position. Both legs are in this one instruction, so a failure in
    // either reverts the other along with the state change above — the winner can never end up
    // having paid without receiving.
    transfer_checked(
        CpiContext::new(
            ctx.accounts.quote_token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.winner_quote_account.to_account_info(),
                mint: ctx.accounts.quote_mint.to_account_info(),
                to: ctx.accounts.loser_quote_account.to_account_info(),
                authority: ctx.accounts.winner.to_account_info(),
            },
        ),
        strike_amount,
        ctx.accounts.quote_mint.decimals,
    )?;

    pay_out(
        match_account,
        &ctx.accounts.asset_token_program,
        &ctx.accounts.asset_mint,
        &ctx.accounts.vault,
        &ctx.accounts.winner_asset_account,
        asset_amount,
    )?;

    emit!(OptionExercised {
        match_account: match_account.key(),
        winner,
        loser,
        asset_amount,
        strike_amount,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct ReclaimAfterOptionExpiry<'info> {
    #[account(mut)]
    pub loser: Signer<'info>,
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
    #[account(address = arena.asset_mint @ ArenaError::MintMismatch)]
    pub asset_mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        token::mint = asset_mint,
        token::authority = loser,
        token::token_program = asset_token_program
    )]
    pub loser_asset_account: InterfaceAccount<'info, TokenAccount>,
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

/// Bounds the loss: the exercise window is the whole exposure and nobody can extend it.
pub fn reclaim_after_option_expiry(ctx: Context<ReclaimAfterOptionExpiry>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let match_account = &mut ctx.accounts.match_account;
    require!(
        match_account.state == MatchState::WinnerOptionOpen,
        ArenaError::InvalidMatchState
    );
    require!(
        now > match_account.option_expiry_ts,
        ArenaError::OptionWindowStillOpen
    );

    let (_, loser) = match_account.winner_and_loser()?;
    require!(
        ctx.accounts.loser.key() == loser,
        ArenaError::AccountMismatch
    );

    let amount = if loser == match_account.creator {
        match_account.creator_refunded = true;
        core::mem::replace(&mut match_account.creator_deposit, 0)
    } else {
        match_account.challenger_refunded = true;
        core::mem::replace(&mut match_account.challenger_deposit, 0)
    };
    require!(amount > 0, ArenaError::DepositMismatch);
    match_account.state = MatchState::OptionExpired;

    pay_out(
        match_account,
        &ctx.accounts.asset_token_program,
        &ctx.accounts.asset_mint,
        &ctx.accounts.vault,
        &ctx.accounts.loser_asset_account,
        amount,
    )
}
