use anchor_lang::prelude::*;

use crate::errors::ArenaError;
use crate::state::{
    PredictionOutcome, PredictionRecord, Winner, BPS_DENOMINATOR, MAX_ROUND_ERROR_BPS, ROUNDS,
};

/// Rescale a price mantissa between exponents. Scaling down (losing precision) is rejected rather
/// than truncated, so a silently altered price can never reach scoring.
pub fn normalize_to_exponent(mantissa: i64, from_exponent: i32, to_exponent: i32) -> Result<i64> {
    if from_exponent == to_exponent {
        return Ok(mantissa);
    }
    let steps = from_exponent
        .checked_sub(to_exponent)
        .ok_or(ArenaError::MathOverflow)?;
    // 10^19 already exceeds i64, so anything beyond that cannot be represented either way.
    let magnitude = steps.unsigned_abs();
    require!(magnitude <= 18, ArenaError::MathOverflow);
    let factor = 10i128
        .checked_pow(magnitude)
        .ok_or(ArenaError::MathOverflow)?;
    let value = i128::from(mantissa);

    let scaled = if steps > 0 {
        // Fewer decimal places at the source: multiply up.
        value.checked_mul(factor).ok_or(ArenaError::MathOverflow)?
    } else {
        require!(
            value.checked_rem(factor).ok_or(ArenaError::MathOverflow)? == 0,
            ArenaError::IncompatibleExponent
        );
        value.checked_div(factor).ok_or(ArenaError::MathOverflow)?
    };
    i64::try_from(scaled).map_err(|_| ArenaError::MathOverflow.into())
}

/// `error_bps = |predicted - actual| * 10_000 / |start_price|`
///
/// A prediction that never arrived or arrived unusable is charged `MAX_ROUND_ERROR_BPS` instead of
/// being skipped, so a failing agent always loses ground rather than gaining an advantage.
pub fn round_error_bps(
    prediction: &PredictionRecord,
    actual_final_price: i64,
    start_price: i64,
) -> Result<u128> {
    require!(start_price != 0, ArenaError::InvalidPrice);

    if prediction.outcome != PredictionOutcome::Valid {
        require!(prediction.predicted_price == 0, ArenaError::InvalidPrice);
        return Ok(MAX_ROUND_ERROR_BPS);
    }
    require!(prediction.predicted_price > 0, ArenaError::InvalidPrice);

    let absolute_error = i128::from(prediction.predicted_price)
        .checked_sub(i128::from(actual_final_price))
        .ok_or(ArenaError::MathOverflow)?
        .checked_abs()
        .ok_or(ArenaError::MathOverflow)?;
    let start_abs = i128::from(start_price)
        .checked_abs()
        .ok_or(ArenaError::MathOverflow)?;

    let scaled = (absolute_error as u128)
        .checked_mul(BPS_DENOMINATOR)
        .ok_or(ArenaError::MathOverflow)?;
    scaled
        .checked_div(start_abs as u128)
        .ok_or(ArenaError::MathOverflow.into())
}

/// `weighted_error = error_bps * round_weight_bps / 10_000`
pub fn weighted_error_bps(error_bps: u128, weight_bps: u16) -> Result<u128> {
    error_bps
        .checked_mul(u128::from(weight_bps))
        .ok_or(ArenaError::MathOverflow)?
        .checked_div(BPS_DENOMINATOR)
        .ok_or(ArenaError::MathOverflow.into())
}

/// Sum of the three weighted round errors for one player. Lower is better.
pub fn total_score(
    predictions: &[PredictionRecord; ROUNDS],
    round_weights_bps: &[u16; ROUNDS],
    actual_final_price: i64,
    start_price: i64,
) -> Result<u128> {
    let mut total: u128 = 0;
    for round in 0..ROUNDS {
        let error_bps = round_error_bps(&predictions[round], actual_final_price, start_price)?;
        let weighted = weighted_error_bps(error_bps, round_weights_bps[round])?;
        total = total
            .checked_add(weighted)
            .ok_or(ArenaError::MathOverflow)?;
    }
    Ok(total)
}

/// Lower score wins. Equal scores are a tie and refund — never randomness. `code.md` §5.6.
pub fn select_winner(creator_score: u128, challenger_score: u128) -> Winner {
    if creator_score == challenger_score {
        Winner::Tie
    } else if creator_score < challenger_score {
        Winner::Creator
    } else {
        Winner::Challenger
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::ROUND_WEIGHTS_BPS;

    const START: i64 = 22_251_500; // 222.515 at exponent -5
    const FINAL: i64 = 22_400_000;

    fn valid(price: i64) -> PredictionRecord {
        PredictionRecord {
            outcome: PredictionOutcome::Valid,
            predicted_price: price,
        }
    }

    fn failed(outcome: PredictionOutcome) -> PredictionRecord {
        PredictionRecord {
            outcome,
            predicted_price: 0,
        }
    }

    #[test]
    fn exponent_normalization_is_exact_or_refused() {
        assert_eq!(normalize_to_exponent(START, -5, -5).unwrap(), START);
        assert_eq!(normalize_to_exponent(222_515, -3, -5).unwrap(), 22_251_500);
        assert_eq!(
            normalize_to_exponent(22_251_500_000, -8, -5).unwrap(),
            START
        );
        // Truncating a price silently is never acceptable.
        assert!(normalize_to_exponent(22_251_500_001, -8, -5).is_err());
    }

    #[test]
    fn an_exact_prediction_scores_zero() {
        assert_eq!(round_error_bps(&valid(FINAL), FINAL, START).unwrap(), 0);
    }

    #[test]
    fn integer_division_truncates_toward_zero() {
        // |22_300_000 - 22_400_000| * 10_000 / 22_251_500 = 44.94... -> 44
        assert_eq!(
            round_error_bps(&valid(22_300_000), FINAL, START).unwrap(),
            44
        );
    }

    #[test]
    fn error_is_symmetric_around_the_final_price() {
        let under = round_error_bps(&valid(FINAL - 100_000), FINAL, START).unwrap();
        let over = round_error_bps(&valid(FINAL + 100_000), FINAL, START).unwrap();
        assert_eq!(under, over);
    }

    #[test]
    fn every_failure_mode_takes_the_maximum_penalty() {
        for outcome in [
            PredictionOutcome::Unsubmitted,
            PredictionOutcome::Timeout,
            PredictionOutcome::ApiError,
            PredictionOutcome::Malformed,
        ] {
            assert_eq!(
                round_error_bps(&failed(outcome), FINAL, START).unwrap(),
                MAX_ROUND_ERROR_BPS
            );
        }
    }

    #[test]
    fn a_non_valid_outcome_must_carry_a_zero_price() {
        let lying = PredictionRecord {
            outcome: PredictionOutcome::Timeout,
            predicted_price: 22_400_000,
        };
        assert!(round_error_bps(&lying, FINAL, START).is_err());
    }

    #[test]
    fn a_valid_outcome_must_carry_a_positive_price() {
        assert!(round_error_bps(&valid(0), FINAL, START).is_err());
        assert!(round_error_bps(&valid(-1), FINAL, START).is_err());
    }

    #[test]
    fn a_zero_start_price_is_refused_rather_than_dividing_by_zero() {
        assert!(round_error_bps(&valid(FINAL), FINAL, 0).is_err());
    }

    #[test]
    fn weights_apply_per_round() {
        assert_eq!(weighted_error_bps(44, 2000).unwrap(), 8);
        assert_eq!(
            weighted_error_bps(MAX_ROUND_ERROR_BPS, 5000).unwrap(),
            50_000
        );
    }

    #[test]
    fn total_matches_the_typescript_reference_vector() {
        let predictions = [
            valid(22_300_000),
            valid(FINAL),
            failed(PredictionOutcome::Timeout),
        ];
        let total = total_score(&predictions, &ROUND_WEIGHTS_BPS, FINAL, START).unwrap();
        // 8 + 0 + 50_000, identical to packages/shared scoring.test.ts
        assert_eq!(total, 50_008);
    }

    #[test]
    fn an_entirely_unsubmitted_match_charges_the_full_maximum() {
        let predictions = [
            failed(PredictionOutcome::Unsubmitted),
            failed(PredictionOutcome::Unsubmitted),
            failed(PredictionOutcome::Unsubmitted),
        ];
        // 20% + 30% + 50% of MAX_ROUND_ERROR_BPS
        assert_eq!(
            total_score(&predictions, &ROUND_WEIGHTS_BPS, FINAL, START).unwrap(),
            MAX_ROUND_ERROR_BPS
        );
    }

    #[test]
    fn the_lower_score_wins_and_equal_scores_tie() {
        assert_eq!(select_winner(10, 20), Winner::Creator);
        assert_eq!(select_winner(20, 10), Winner::Challenger);
        assert_eq!(select_winner(50_008, 50_008), Winner::Tie);
    }

    #[test]
    fn extreme_mantissas_do_not_overflow() {
        // A worst-case i64 spread must fail cleanly or compute, never wrap.
        let result = round_error_bps(&valid(i64::MAX), i64::MIN + 1, 1);
        assert!(result.is_err() || result.unwrap() > 0);
    }
}
