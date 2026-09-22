use anchor_lang::prelude::*;
use pyth_solana_receiver_sdk::price_update::{PriceUpdateV2, VerificationLevel};

use crate::errors::ArenaError;
use crate::scoring::normalize_to_exponent;
use crate::state::{Arena, Match, PriceObservation, BPS_DENOMINATOR};

/// Ownership is enforced by `Account<PriceUpdateV2>`, which deserializes only receiver-owned data.
/// Freshness is left to callers: start price is judged on wall-clock age, final price on the
/// settlement window, and one shared parameter would invite passing the wrong one.
pub fn read_observation(
    price_update: &PriceUpdateV2,
    arena: &Arena,
    match_account: &Match,
) -> Result<PriceObservation> {
    // Partial verification checks under two thirds of guardians; escrow moves, so require full.
    require!(
        price_update.verification_level == VerificationLevel::Full,
        ArenaError::UnverifiedPrice
    );

    let message = &price_update.price_message;
    require!(
        message.feed_id == arena.benchmark_feed_id,
        ArenaError::FeedMismatch
    );
    require!(message.price > 0, ArenaError::InvalidPrice);

    // Cross-multiply: integer division would accept confidence just above the signed limit.
    let confidence_scaled = u128::from(message.conf)
        .checked_mul(BPS_DENOMINATOR)
        .ok_or(ArenaError::MathOverflow)?;
    let confidence_limit = u128::try_from(message.price)
        .map_err(|_| ArenaError::MathOverflow)?
        .checked_mul(u128::from(match_account.max_confidence_bps))
        .ok_or(ArenaError::MathOverflow)?;
    require!(
        confidence_scaled <= confidence_limit,
        ArenaError::ConfidenceTooHigh
    );

    // Both the price and its confidence are stored at the Arena exponent so that everything
    // recorded on the Match shares one scale and scoring never has to rescale again. A
    // conversion that cannot be made exactly is refused rather than truncated (`code.md` §5.6);
    // that can only happen when an Arena's exponent does not match its feed's, which is a
    // misconfiguration, and it fails into `mark_oracle_failure_refundable` rather than into a
    // wrong winner.
    let price = normalize_to_exponent(message.price, message.exponent, arena.benchmark_exponent)?;
    let confidence = normalize_to_exponent(
        i64::try_from(message.conf).map_err(|_| ArenaError::MathOverflow)?,
        message.exponent,
        arena.benchmark_exponent,
    )?;

    Ok(PriceObservation {
        price,
        exponent: arena.benchmark_exponent,
        confidence: u64::try_from(confidence).map_err(|_| ArenaError::MathOverflow)?,
        publish_time: message.publish_time,
    })
}
