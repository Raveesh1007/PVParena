/** Shared constants. The Anchor program is authoritative; these mirror it for display and tests. */

/** Match timing, in seconds relative to activation. `code.md` §5.1. */
export interface MatchProfile {
  readonly durationSeconds: number;
  /** Due time of each of the three rounds, relative to activation. */
  readonly roundDueOffsets: readonly [number, number, number];
  readonly settlementGraceSeconds: number;
  readonly exerciseWindowSeconds: number;
  /** How long an Open match stays joinable, and a Ready match activatable. Arena-configured so
   *  every deadline can be driven to expiry in a test rather than waited out. */
  readonly joinWindowSeconds: number;
  readonly activationWindowSeconds: number;
}

/** Production window lengths, carried into both profiles below. `code.md` §5.1. */
export const JOIN_WINDOW_SECONDS = 15 * 60;
export const ACTIVATION_WINDOW_SECONDS = 5 * 60;

export const STANDARD_PROFILE: MatchProfile = {
  durationSeconds: 15 * 60,
  roundDueOffsets: [0, 5 * 60, 10 * 60],
  settlementGraceSeconds: 5 * 60,
  exerciseWindowSeconds: 10 * 60,
  joinWindowSeconds: JOIN_WINDOW_SECONDS,
  activationWindowSeconds: ACTIVATION_WINDOW_SECONDS,
};

export const DEMO_PROFILE: MatchProfile = {
  durationSeconds: 9 * 60,
  roundDueOffsets: [0, 3 * 60, 6 * 60],
  settlementGraceSeconds: 5 * 60,
  exerciseWindowSeconds: 10 * 60,
  joinWindowSeconds: JOIN_WINDOW_SECONDS,
  activationWindowSeconds: ACTIVATION_WINDOW_SECONDS,
};

export const MATCH_PROFILES = { standard: STANDARD_PROFILE, demo: DEMO_PROFILE } as const;
export type MatchProfileKind = keyof typeof MATCH_PROFILES;

/** Round weights in basis points, summing to 10_000. `code.md` §5.1. */
export const ROUND_WEIGHTS_BPS: readonly [number, number, number] = [2000, 3000, 5000];

export const BPS_DENOMINATOR = 10_000;

/** Error applied to an invalid, failed or unsubmitted prediction. `code.md` §5.6. */
export const MAX_ROUND_ERROR_BPS = 100_000n;

export const AGENT_TIMEOUT_MS = 120_000;

/** The benchmark exponent every price is normalized to before scoring. `code.md` §2. */
export const BENCHMARK_EXPONENT = -5;

/**
 * Both on-chain price fields are i64 (`PredictionInput.predicted_price`, `PriceObservation.price`),
 * so a larger mantissa can never be submitted and must be rejected at the parse boundary rather
 * than overflowing at the program boundary. i64::MAX has 19 digits.
 */
export const I64_MAX = 9_223_372_036_854_775_807n;
export const I64_MAX_DIGITS = 19;

export const MAX_STRATEGY_BYTES = 500;
export const STRATEGY_SALT_BYTES = 32;
export const MAX_THESIS_BYTES = 280;
