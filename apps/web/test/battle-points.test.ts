import { describe, expect, it } from 'vitest';

import { publishedPromptPoints } from '../src/lib/battle-points';
import type { MatchView } from '../src/lib/matches';

const match = {
  pda: '7xGBQdGMZeFaDT4cQVvuLYRuM8zF7tnTdJMaAQetmcD4',
  deadlines: { start: 100, targetEnd: 1790001200 },
  rounds: [
    {
      round: 0,
      creator: { outcome: 'valid', predictedPrice: '22400000' },
      challenger: { outcome: 'valid', predictedPrice: '22300000' },
    },
    {
      round: 1,
      creator: { outcome: 'unsubmitted', predictedPrice: '0' },
      challenger: { outcome: 'unsubmitted', predictedPrice: '0' },
    },
  ],
} as MatchView;

const prediction = {
  schemaVersion: 1,
  matchId: match.pda,
  round: 0,
  benchmarkSymbol: 'Equity.US.TSLA/USD',
  benchmarkFeedId: `0x${'1'.repeat(64)}`,
  observedPrice: '22251500',
  observedExponent: -5,
  observedPublishTime: 1790000300,
  targetPublishTime: 1790001200,
  predictedFinalPrice: '22400000',
  confidenceBps: 6800,
  thesis: 'Momentum remains positive.',
};
const benchmark = {
  symbol: 'Equity.US.TSLA/USD',
  coreFeedId: prediction.benchmarkFeedId,
  exponent: -5,
};

describe('published battle observations', () => {
  it('shows only observations tied to an accepted paired round and matching chain prediction', () => {
    const turns = [
      { round: 0, playerIndex: 0, parsedPrediction: prediction },
      { round: 1, playerIndex: 0, parsedPrediction: { ...prediction, round: 1 } },
      { round: 0, playerIndex: 1, parsedPrediction: { ...prediction, predictedFinalPrice: '999' } },
    ];
    expect(publishedPromptPoints(match, turns, benchmark)).toEqual([
      {
        label: 'Round 1',
        observation: { price: '22251500', exponent: -5, confidence: '0', publishTime: 1790000300 },
        source: 'prompt',
      },
    ]);
    expect(
      publishedPromptPoints(
        { ...match, deadlines: { ...match.deadlines, start: 0 } },
        turns,
        benchmark,
      ),
    ).toEqual([]);
    expect(
      publishedPromptPoints(
        {
          ...match,
          rounds: [
            {
              ...match.rounds[0]!,
              challenger: { outcome: 'unsubmitted', predictedPrice: '0', errorBps: null },
            },
          ],
        },
        turns,
        benchmark,
      ),
    ).toEqual([]);
    expect(
      publishedPromptPoints(match, turns, { ...benchmark, coreFeedId: `0x${'2'.repeat(64)}` }),
    ).toEqual([]);
  });
});
