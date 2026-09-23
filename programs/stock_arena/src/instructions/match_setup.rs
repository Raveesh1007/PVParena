use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{
    transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked,
};

use crate::errors::ArenaError;
use crate::state::*;
use crate::vault::pay_out;

/// Every term is fixed by the creator and accepted as-is by the challenger; nothing is negotiated
/// after deposit.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct MatchTerms {
    pub creator_stake_amount: u64,
    pub challenger_stake_amount: u64,
    pub creator_stake_strike: u64,
    pub challenger_stake_strike: u64,
    pub profile_kind: MatchProfileKind,
}

#[derive(Accounts)]
#[instruction(match_nonce: u64)]
pub struct CreateMatch<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Box<Account<'info, ProtocolConfig>>,
    #[account(
        seeds = [b"arena", arena.asset_mint.as_ref(), arena.benchmark_feed_id.as_ref()],
        bump = arena.bump,
        constraint = arena.active @ ArenaError::ArenaInactive
    )]
    pub arena: Box<Account<'info, Arena>>,
    /// May be `arena` itself for a same-token duel.
    #[account(
        seeds = [
            b"arena",
            challenger_arena.asset_mint.as_ref(),
            challenger_arena.benchmark_feed_id.as_ref()
        ],
        bump = challenger_arena.bump,
        constraint = challenger_arena.active @ ArenaError::ArenaInactive,
        constraint = challenger_arena.benchmark_feed_id == arena.benchmark_feed_id
            && challenger_arena.benchmark_exponent == arena.benchmark_exponent
            && challenger_arena.quote_mint == arena.quote_mint @ ArenaError::ArenaMismatch
    )]
    pub challenger_arena: Box<Account<'info, Arena>>,
    #[account(
        init,
        payer = creator,
        space = 8 + Match::INIT_SPACE,
        seeds = [b"match", creator.key().as_ref(), &match_nonce.to_le_bytes()],
        bump
    )]
    pub match_account: Box<Account<'info, Match>>,
    #[account(address = arena.asset_mint @ ArenaError::MintMismatch)]
    pub asset_mint: Box<InterfaceAccount<'info, Mint>>,
    /// Read only for its decimals, to apply the minimum stake to the challenger's side.
    #[account(address = challenger_arena.asset_mint @ ArenaError::MintMismatch)]
    pub challenger_asset_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        token::mint = asset_mint,
        token::authority = creator,
        token::token_program = asset_token_program
    )]
    pub creator_asset_account: Box<InterfaceAccount<'info, TokenAccount>>,
    /// One vault per staked mint: that mint's ATA owned by the Match PDA. A same-token duel shares
    /// it, which is safe because payouts follow recorded deposits. `code.md` §7.1.
    #[account(
        init,
        payer = creator,
        associated_token::mint = asset_mint,
        associated_token::authority = match_account,
        associated_token::token_program = asset_token_program
    )]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(address = arena.asset_token_program @ ArenaError::MintMismatch)]
    pub asset_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn create_match(
    ctx: Context<CreateMatch>,
    match_nonce: u64,
    terms: MatchTerms,
    strategy_commitment: [u8; 32],
) -> Result<()> {
    require!(!ctx.accounts.config.paused, ArenaError::ProtocolPaused);
    require!(
        terms.creator_stake_amount >= min_stake_amount(ctx.accounts.asset_mint.decimals)?
            && terms.challenger_stake_amount
                >= min_stake_amount(ctx.accounts.challenger_asset_mint.decimals)?,
        ArenaError::StakeBelowMinimum
    );
    require!(
        terms.creator_stake_strike > 0 && terms.challenger_stake_strike > 0,
        ArenaError::ZeroAmount
    );

    let arena = &ctx.accounts.arena;
    let profile = *arena.profile(terms.profile_kind);
    require!(
        profile.duration_seconds >= ctx.accounts.config.min_duration_seconds
            && profile.duration_seconds <= ctx.accounts.config.max_duration_seconds,
        ArenaError::DurationOutOfBounds
    );

    let now = Clock::get()?.unix_timestamp;
    let join_deadline_ts = now
        .checked_add(profile.join_window_seconds)
        .ok_or(ArenaError::MathOverflow)?;

    transfer_checked(
        CpiContext::new(
            ctx.accounts.asset_token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.creator_asset_account.to_account_info(),
                mint: ctx.accounts.asset_mint.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.creator.to_account_info(),
            },
        ),
        terms.creator_stake_amount,
        ctx.accounts.asset_mint.decimals,
    )?;

    ctx.accounts.match_account.set_inner(Match {
        arena: arena.key(),
        challenger_arena: ctx.accounts.challenger_arena.key(),
        creator: ctx.accounts.creator.key(),
        challenger: Pubkey::default(),
        match_nonce,
        creator_stake_amount: terms.creator_stake_amount,
        challenger_stake_amount: terms.challenger_stake_amount,
        creator_stake_strike: terms.creator_stake_strike,
        challenger_stake_strike: terms.challenger_stake_strike,
        profile_kind: terms.profile_kind,
        max_price_age_seconds: arena
            .max_price_age_seconds
            .min(ctx.accounts.config.max_price_age_seconds),
        max_confidence_bps: arena
            .max_confidence_bps
            .min(ctx.accounts.config.max_confidence_bps),
        creator_strategy_commitment: strategy_commitment,
        challenger_strategy_commitment: [0u8; 32],
        created_ts: now,
        join_deadline_ts,
        activation_deadline_ts: 0,
        start_ts: 0,
        round_due_ts: [0; ROUNDS],
        target_end_ts: 0,
        settlement_deadline_ts: 0,
        option_expiry_ts: 0,
        start_observation: PriceObservation::default(),
        final_observation: PriceObservation::default(),
        predictions: [[PredictionRecord::default(); 2]; ROUNDS],
        submitted_rounds: 0,
        creator_score: 0,
        challenger_score: 0,
        winner: Winner::Unset,
        state: MatchState::Open,
        creator_deposit: terms.creator_stake_amount,
        challenger_deposit: 0,
        winner_stake_claimed: false,
        creator_refunded: false,
        challenger_refunded: false,
        bump: ctx.bumps.match_account,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct JoinMatch<'info> {
    #[account(mut)]
    pub challenger: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Box<Account<'info, ProtocolConfig>>,
    #[account(seeds = [b"arena", arena.asset_mint.as_ref(), arena.benchmark_feed_id.as_ref()], bump = arena.bump)]
    pub arena: Box<Account<'info, Arena>>,
    #[account(address = match_account.challenger_arena @ ArenaError::AccountMismatch)]
    pub challenger_arena: Box<Account<'info, Arena>>,
    #[account(
        mut,
        seeds = [b"match", match_account.creator.as_ref(), &match_account.match_nonce.to_le_bytes()],
        bump = match_account.bump,
        has_one = arena @ ArenaError::AccountMismatch
    )]
    pub match_account: Box<Account<'info, Match>>,
    #[account(address = challenger_arena.asset_mint @ ArenaError::MintMismatch)]
    pub asset_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        token::mint = asset_mint,
        token::authority = challenger,
        token::token_program = asset_token_program
    )]
    pub challenger_asset_account: Box<InterfaceAccount<'info, TokenAccount>>,
    /// Already exists for a same-token duel; created here for a cross-token one.
    #[account(
        init_if_needed,
        payer = challenger,
        associated_token::mint = asset_mint,
        associated_token::authority = match_account,
        associated_token::token_program = asset_token_program
    )]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(address = challenger_arena.asset_token_program @ ArenaError::MintMismatch)]
    pub asset_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn join_match(ctx: Context<JoinMatch>, strategy_commitment: [u8; 32]) -> Result<()> {
    require!(!ctx.accounts.config.paused, ArenaError::ProtocolPaused);
    let match_account = &mut ctx.accounts.match_account;
    require!(
        match_account.state == MatchState::Open,
        ArenaError::InvalidMatchState
    );
    require!(
        ctx.accounts.challenger.key() != match_account.creator,
        ArenaError::SelfChallenge
    );

    let now = Clock::get()?.unix_timestamp;
    require!(
        now <= match_account.join_deadline_ts,
        ArenaError::JoinWindowClosed
    );

    // Exactly the amount the creator named, in the exact mint and token program. code.md 7.4.
    transfer_checked(
        CpiContext::new(
            ctx.accounts.asset_token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.challenger_asset_account.to_account_info(),
                mint: ctx.accounts.asset_mint.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.challenger.to_account_info(),
            },
        ),
        match_account.challenger_stake_amount,
        ctx.accounts.asset_mint.decimals,
    )?;

    let activation_window = ctx
        .accounts
        .arena
        .profile(match_account.profile_kind)
        .activation_window_seconds;

    match_account.challenger = ctx.accounts.challenger.key();
    match_account.challenger_strategy_commitment = strategy_commitment;
    match_account.challenger_deposit = match_account.challenger_stake_amount;
    match_account.activation_deadline_ts = now
        .checked_add(activation_window)
        .ok_or(ArenaError::MathOverflow)?;
    // Terms and both commitments are immutable from here: no instruction mutates them after join.
    match_account.state = MatchState::Ready;
    Ok(())
}

#[derive(Accounts)]
pub struct CancelOpenMatch<'info> {
    #[account(mut, address = match_account.creator @ ArenaError::AccountMismatch)]
    pub creator: Signer<'info>,
    #[account(seeds = [b"arena", arena.asset_mint.as_ref(), arena.benchmark_feed_id.as_ref()], bump = arena.bump)]
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
        token::authority = creator,
        token::token_program = asset_token_program
    )]
    pub creator_asset_account: InterfaceAccount<'info, TokenAccount>,
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

/// A safe exit, so it is deliberately not gated on paused. code.md 7.4.
pub fn cancel_open_match(ctx: Context<CancelOpenMatch>) -> Result<()> {
    let match_account = &mut ctx.accounts.match_account;
    require!(
        match_account.state == MatchState::Open,
        ArenaError::InvalidMatchState
    );
    require!(!match_account.creator_refunded, ArenaError::AlreadySettled);

    // Pay out from internal accounting, never the raw vault balance: an unsolicited transfer into
    // the vault must not increase what the creator can withdraw. code.md 7.1.
    let amount = match_account.creator_deposit;
    require!(amount > 0, ArenaError::DepositMismatch);

    match_account.creator_deposit = 0;
    match_account.creator_refunded = true;
    match_account.state = MatchState::Cancelled;

    pay_out(
        match_account,
        &ctx.accounts.asset_token_program,
        &ctx.accounts.asset_mint,
        &ctx.accounts.vault,
        &ctx.accounts.creator_asset_account,
        amount,
    )
}
