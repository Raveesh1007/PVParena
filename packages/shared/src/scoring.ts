import { BPS_DENOMINATOR, MAX_ROUND_ERROR_BPS, ROUND_WEIGHTS_BPS } from './constants.js';

export class ScoringError extends Error {}

function abs(v: bigint): bigint {
  return v < 0n ? -v : v;
}

/**
 * Rescale a price mantissa from one exponent to another. Scaling up (losing precision) is only
 * allowed when it is exact, so a silently truncated price can never reach scoring.
 */
export function normalizeToExponent(mantissa: bigint, fromExponent: number, toExponent: number) {
  if (fromExponent === toExponent) return mantissa;
  if (fromExponent < toExponent) {
    const divisor = 10n ** BigInt(toExponent - fromExponent);
    if (mantissa % divisor !== 0n) {
      throw new ScoringError(
        `Cannot rescale ${mantissa} from exponent ${fromExponent} to ${toExponent} without loss.`,
      );
    }
    return mantissa / divisor;
  }
  return mantissa * 10n ** BigInt(fromExponent - toExponent);
}

/** A round either produced a usable price, or it did not. `code.md` §5.5 PredictionInput. */
export type RoundPrediction = { valid: true; predictedPrice: bigint } | { valid: false };

/**
 * error_bps = |predicted - actual| * 10_000 / |start_price|, capped-by-substitution at
 * MAX_ROUND_ERROR_BPS for a prediction that never arrived or arrived unusable.
 */
export function roundErrorBps(
  prediction: RoundPrediction,
  actualFinalPrice: bigint,
  startPrice: bigint,
): bigint {
  if (startPrice === 0n) throw new ScoringError('Start price must be non-zero.');
  if (!prediction.valid) return MAX_ROUND_ERROR_BPS;
  if (prediction.predictedPrice <= 0n) {
    throw new ScoringError('A valid prediction requires a positive price.');
  }
  const absoluteError = abs(prediction.predictedPrice - actualFinalPrice);
  return (absoluteError * BigInt(BPS_DENOMINATOR)) / abs(startPrice);
}

/** weighted_error = error_bps * round_weight_bps / 10_000 */
export function weightedErrorBps(errorBps: bigint, weightBps: number): bigint {
  return (errorBps * BigInt(weightBps)) / BigInt(BPS_DENOMINATOR);
}

export interface RoundBreakdown {
  round: number;
  weightBps: number;
  errorBps: bigint;
  weightedErrorBps: bigint;
}

/** All three rounds must be supplied; an unsubmitted round is `{ valid: false }`, not omitted. */
export function totalScore(
  predictions: readonly [RoundPrediction, RoundPrediction, RoundPrediction],
  actualFinalPrice: bigint,
  startPrice: bigint,
): { total: bigint; rounds: RoundBreakdown[] } {
  const rounds = predictions.map((prediction, index) => {
    const weightBps = ROUND_WEIGHTS_BPS[index]!;
    const errorBps = roundErrorBps(prediction, actualFinalPrice, startPrice);
    return {
      round: index,
      weightBps,
      errorBps,
      weightedErrorBps: weightedErrorBps(errorBps, weightBps),
    };
  });
  return { total: rounds.reduce((sum, r) => sum + r.weightedErrorBps, 0n), rounds };
}

export type Winner = 'creator' | 'challenger' | 'tie';

/** Lower score wins. Equal scores are a tie and refund — never randomness. `code.md` §5.6. */
export function selectWinner(creatorScore: bigint, challengerScore: bigint): Winner {
  if (creatorScore === challengerScore) return 'tie';
  return creatorScore < challengerScore ? 'creator' : 'challenger';
}
