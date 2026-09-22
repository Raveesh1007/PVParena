use anchor_lang::prelude::*;
use anchor_spl::token_2022::spl_token_2022::{
    extension::{BaseStateWithExtensions, ExtensionType, StateWithExtensions},
    state::Mint as SplMint,
};
use anchor_spl::token_interface::Mint;

use crate::errors::ArenaError;
use crate::state::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct ArenaParams {
    /// Pyth 32-byte Core feed ID. A Terminal/Lazer identifier (1314, 922) is not a Core ID and
    /// must never be stored here. `code.md` §3.2.
    pub benchmark_feed_id: [u8; 32],
    pub benchmark_exponent: i32,
    pub standard_profile: TimingProfile,
    pub demo_profile: TimingProfile,
    pub max_price_age_seconds: u64,
    pub max_confidence_bps: u64,
}

fn validate_profile(profile: &TimingProfile, config: &ProtocolConfig, duration: i64) -> Result<()> {
    require!(
        profile.duration_seconds == duration
            && profile.round_due_offsets == [0, duration / 3, duration / 3 * 2]
            && profile.settlement_grace_seconds == 5 * 60
            && profile.exercise_window_seconds == 10 * 60,
        ArenaError::DurationOutOfBounds
    );
    require!(
        profile.duration_seconds >= config.min_duration_seconds
            && profile.duration_seconds <= config.max_duration_seconds,
        ArenaError::DurationOutOfBounds
    );
    require!(profile.settlement_grace_seconds > 0, ArenaError::ZeroAmount);
    require!(profile.exercise_window_seconds > 0, ArenaError::ZeroAmount);
    // Pinned, not merely positive: `code.md` §5.1 fixes these and §2 says the fixed decisions must
    // not drift. Tests reach the expiry paths by warping the bank clock, not by shortening them.
    require!(
        profile.join_window_seconds == JOIN_WINDOW_SECONDS
            && profile.activation_window_seconds == ACTIVATION_WINDOW_SECONDS,
        ArenaError::DurationOutOfBounds
    );
    // Round 0 is due at activation and each later round strictly after the previous one; the
    // final round must still leave a submission window before the target.
    require!(
        profile.round_due_offsets[0] == 0,
        ArenaError::DurationOutOfBounds
    );
    require!(
        profile.round_due_offsets[1] > profile.round_due_offsets[0]
            && profile.round_due_offsets[2] > profile.round_due_offsets[1]
            && profile.duration_seconds > profile.round_due_offsets[2],
        ArenaError::DurationOutOfBounds
    );
    Ok(())
}

/// Allowlist, not a denylist: an unrecognised or future extension fails closed. Metadata is
/// permitted only because `code.md` §3.1 requires the `<SYMBOL> (devnet test copy)` label.
const ALLOWED_MINT_EXTENSIONS: [ExtensionType; 2] =
    [ExtensionType::MetadataPointer, ExtensionType::TokenMetadata];

/// Enforces the unrestricted devnet copy `code.md` §3.1 requires, rather than trusting the setup
/// script that mints it. A transfer fee breaks sent-equals-received so recorded deposits overstate
/// escrow; a permanent delegate drains the vault regardless of accounting; a pausable mint or armed
/// hook blocks the safe exits §7.4 requires. The real PreStocks mints carry all four — evidence in
/// `docs/integration-readiness.md`.
fn require_escrow_safe_mint(mint: &InterfaceAccount<Mint>) -> Result<()> {
    let info = mint.to_account_info();
    // Legacy SPL Token has no extension area to inspect.
    if info.owner == &anchor_spl::token::ID {
        return Ok(());
    }
    let data = info.try_borrow_data()?;
    let state = StateWithExtensions::<SplMint>::unpack(&data)
        .map_err(|_| error!(ArenaError::UnsafeMintExtension))?;
    for ext in state
        .get_extension_types()
        .map_err(|_| error!(ArenaError::UnsafeMintExtension))?
    {
        require!(
            ALLOWED_MINT_EXTENSIONS.contains(&ext),
            ArenaError::UnsafeMintExtension
        );
    }
    Ok(())
}

#[derive(Accounts)]
#[instruction(params: ArenaParams)]
pub struct CreateArena<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump, has_one = admin @ ArenaError::NotAdmin)]
    pub config: Account<'info, ProtocolConfig>,
    #[account(
        init,
        payer = admin,
        space = 8 + Arena::INIT_SPACE,
        seeds = [b"arena", asset_mint.key().as_ref(), params.benchmark_feed_id.as_ref()],
        bump
    )]
    pub arena: Account<'info, Arena>,
    /// Devnet test copy of the PreStocks asset.
    pub asset_mint: InterfaceAccount<'info, Mint>,
    pub quote_mint: InterfaceAccount<'info, Mint>,
    pub system_program: Program<'info, System>,
}

/// There is deliberately no `update_arena`: redeploy or create a new Arena instead, so an
/// in-flight match's benchmark and timing can never be changed underneath it. `code.md` §7.3.
pub fn create_arena(ctx: Context<CreateArena>, params: ArenaParams) -> Result<()> {
    let config = &ctx.accounts.config;
    validate_profile(&params.standard_profile, config, 15 * 60)?;
    validate_profile(&params.demo_profile, config, 9 * 60)?;
    require!(
        params.benchmark_feed_id != [0u8; 32],
        ArenaError::AccountMismatch
    );
    require!(params.max_price_age_seconds > 0, ArenaError::ZeroAmount);
    require!(params.max_confidence_bps > 0, ArenaError::ZeroAmount);
    require_escrow_safe_mint(&ctx.accounts.asset_mint)?;
    require_escrow_safe_mint(&ctx.accounts.quote_mint)?;

    ctx.accounts.arena.set_inner(Arena {
        asset_mint: ctx.accounts.asset_mint.key(),
        asset_token_program: *ctx.accounts.asset_mint.to_account_info().owner,
        quote_mint: ctx.accounts.quote_mint.key(),
        quote_token_program: *ctx.accounts.quote_mint.to_account_info().owner,
        benchmark_feed_id: params.benchmark_feed_id,
        benchmark_exponent: params.benchmark_exponent,
        standard_profile: params.standard_profile,
        demo_profile: params.demo_profile,
        round_weights_bps: ROUND_WEIGHTS_BPS,
        max_price_age_seconds: params.max_price_age_seconds,
        max_confidence_bps: params.max_confidence_bps,
        active: true,
        bump: ctx.bumps.arena,
    });
    Ok(())
}
