import { agentPredictionSchema } from '@stock-arena/shared';

import type { BattlePoint } from '@/components/benchmark-chart';
import type { MatchView } from './matches';

export function publishedPromptPoints(
  match: MatchView,
  turns: { round: number; playerIndex: number; parsedPrediction: unknown }[],
  benchmark: { symbol: string; coreFeedId: string; exponent: number },
): BattlePoint[] {
  const points: BattlePoint[] = [];
  if (match.deadlines.start === 0) return points;
  for (const turn of turns) {
    const round = match.rounds[turn.round];
    if (
      !round ||
      round.creator.outcome === 'unsubmitted' ||
      round.challenger.outcome === 'unsubmitted'
    )
      continue;
    if (points.some((point) => point.label === `Round ${turn.round + 1}`)) continue;
    const parsed = agentPredictionSchema.safeParse(turn.parsedPrediction);
    if (
      !parsed.success ||
      parsed.data.matchId !== match.pda ||
      parsed.data.round !== turn.round ||
      parsed.data.benchmarkSymbol !== benchmark.symbol ||
      parsed.data.benchmarkFeedId !== benchmark.coreFeedId ||
      parsed.data.observedExponent !== benchmark.exponent ||
      parsed.data.observedPublishTime < match.deadlines.start ||
      parsed.data.observedPublishTime > match.deadlines.targetEnd
    )
      continue;
    const onChain = round[turn.playerIndex === 0 ? 'creator' : 'challenger'];
    if (onChain.outcome !== 'valid' || onChain.predictedPrice !== parsed.data.predictedFinalPrice)
      continue;
    points.push({
      label: `Round ${turn.round + 1}`,
      observation: {
        price: parsed.data.observedPrice,
        exponent: parsed.data.observedExponent,
        confidence: '0',
        publishTime: parsed.data.observedPublishTime,
      },
      source: 'prompt',
    });
  }
  return points;
}
