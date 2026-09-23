use anchor_lang::prelude::*;

#[error_code]
pub enum ArenaError {
    #[msg("Protocol is paused; new risk cannot be created.")]
    ProtocolPaused,
    #[msg("Arena is not active.")]
    ArenaInactive,
    #[msg("Caller is not the protocol admin.")]
    NotAdmin,
    #[msg("Caller is not the configured orchestrator.")]
    NotOrchestrator,
    #[msg("A player cannot challenge themselves.")]
    SelfChallenge,
    #[msg("Amount must be greater than zero.")]
    ZeroAmount,
    #[msg("Match duration is outside the configured bounds.")]
    DurationOutOfBounds,
    #[msg("Match is not in the required state for this action.")]
    InvalidMatchState,
    #[msg("The join window for this match has closed.")]
    JoinWindowClosed,
    #[msg("The activation window for this match has closed.")]
    ActivationWindowClosed,
    #[msg("The activation window is still open; the match is not refundable yet.")]
    ActivationWindowStillOpen,
    #[msg("Arithmetic overflow.")]
    MathOverflow,
    #[msg("Price is zero, negative, or otherwise unusable.")]
    InvalidPrice,
    #[msg("Feed exponent cannot be converted to the Arena exponent without losing precision.")]
    IncompatibleExponent,
    #[msg("Account does not belong to this match or arena.")]
    AccountMismatch,
    #[msg("Token mint does not match the configured mint.")]
    MintMismatch,
    #[msg("Deposit accounting does not match the expected stake.")]
    DepositMismatch,
    #[msg("This action has already been taken and cannot be replayed.")]
    AlreadySettled,
    #[msg("Price update is not fully verified.")]
    UnverifiedPrice,
    #[msg("Price update is for a different feed than this Arena's benchmark.")]
    FeedMismatch,
    #[msg("Price confidence exceeds the configured maximum ratio.")]
    ConfidenceTooHigh,
    #[msg("Price update is older than the configured maximum age.")]
    StalePrice,
    #[msg("Round index is outside 0..3.")]
    InvalidRound,
    #[msg("This round is not open for submission yet, or its window has closed.")]
    RoundWindowClosed,
    #[msg("This round has already been submitted.")]
    RoundAlreadySubmitted,
    #[msg("A non-valid prediction outcome must carry a zero price, and Unsubmitted may not be submitted.")]
    InvalidPredictionOutcome,
    #[msg("The match has not reached its target end time.")]
    TargetNotReached,
    #[msg("No price update published inside the settlement window.")]
    SettlementWindowMissed,
    #[msg("The settlement deadline has not passed yet.")]
    SettlementDeadlineNotPassed,
    #[msg("Caller is not the winner of this match.")]
    NotWinner,
    #[msg("The option exercise window has closed.")]
    OptionWindowClosed,
    #[msg("The option exercise window is still open.")]
    OptionWindowStillOpen,
    #[msg("Mint carries a Token-2022 extension that is unsafe for escrow; see code.md 3.1.")]
    UnsafeMintExtension,
    #[msg("Stake is below the 0.05-token minimum.")]
    StakeBelowMinimum,
    #[msg("Both stake Arenas must share the benchmark feed, exponent and quote mint.")]
    ArenaMismatch,
}
