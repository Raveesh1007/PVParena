import type { MatchView } from './matches';

/** Publish only signed strategies after activation and predictions confirmed together on-chain. */
export function transcriptFilters(
  match: Pick<MatchView, 'pda' | 'creator' | 'challenger' | 'commitments' | 'deadlines' | 'rounds'>,
) {
  const participants = [{ playerWallet: match.creator, commitment: match.commitments.creator }];
  if (match.challenger && match.commitments.challenger) {
    participants.push({ playerWallet: match.challenger, commitment: match.commitments.challenger });
  }
  return {
    strategies: { matchPda: match.pda, OR: match.deadlines.start > 0 ? participants : [] },
    turns: {
      matchPda: match.pda,
      round: {
        in: match.rounds
          .filter(
            (round) =>
              round.creator.outcome !== 'unsubmitted' && round.challenger.outcome !== 'unsubmitted',
          )
          .map((round) => round.round),
      },
    },
  };
}
