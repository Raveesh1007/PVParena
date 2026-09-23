import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PredictionContext } from '@stock-arena/shared';

import { createBattleAgent, requestPrediction } from '../src/clawpump.js';

const options = { baseUrl: 'https://clawpump.tech/api/v1', apiKey: 'cpk_test', model: 'm' };
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

afterEach(() => vi.unstubAllGlobals());

it('starts a new agent, because chat with a stopped agent fails', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      json({ id: 'a1', walletAddress: '5DC44dEXoDtgTuE86taeKR3BtMyGRVAFPt3KyzwDG83J' }),
    )
    .mockResolvedValueOnce(json({ id: 'a1', status: 'running' }));
  vi.stubGlobal('fetch', fetch);

  await createBattleAgent({
    ...options,
    playerWallet: '4TafDy66p9jT9Fn58vC6JM1Pw5yeGVfJtYskMgyH9cno',
  });

  expect(fetch.mock.calls[1]?.[0]).toBe('https://clawpump.tech/api/v1/agents/a1/start');
});

it('reads the reply from `content` and keeps meta.requestId', async () => {
  const context: PredictionContext = {
    matchId: '2YXxVDFqfdGDev62FPWU1hVvjBo4twVRtnf4QPkaBhvs',
    round: 0,
    benchmarkSymbol: 'Equity.US.TSLA/USD',
    benchmarkFeedId: `0x${'16'.repeat(32)}`,
    observedPrice: '22251500',
    observedExponent: -5,
    observedPublishTime: 1790000300,
    targetPublishTime: 1790001200,
  };
  const content = JSON.stringify({
    schemaVersion: 1,
    ...context,
    predictedFinalPrice: '22400000',
    confidenceBps: 6800,
    thesis: 'Momentum.',
  });
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(json({ role: 'assistant', content, meta: { requestId: 'r1' } })),
  );

  const turn = await requestPrediction({ ...options, agentId: 'a1', prompt: 'p', context });

  expect(turn.parsed.outcome).toBe('valid');
  expect(turn.requestId).toBe('r1');
});

describe('empty chat content', () => {
  const context: PredictionContext = {
    matchId: '2YXxVDFqfdGDev62FPWU1hVvjBo4twVRtnf4QPkaBhvs',
    round: 1,
    benchmarkSymbol: 'Equity.US.TSLA/USD',
    benchmarkFeedId: `0x${'16'.repeat(32)}`,
    observedPrice: '22251500',
    observedExponent: -5,
    observedPublishTime: 1790000300,
    targetPublishTime: 1790001200,
  };
  const reply = (predictedFinalPrice: string) =>
    JSON.stringify({
      schemaVersion: 1,
      ...context,
      predictedFinalPrice,
      confidenceBps: 1,
      thesis: 't',
    });
  const message = (role: string, content: string, at: string) => ({
    role,
    content,
    createdAt: `2026-09-23T13:${at}.000+00:00`,
  });

  it('recovers the reply that follows this exact prompt from history', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(json({ content: '', meta: { requestId: 'r2' } }))
        .mockResolvedValueOnce(
          json({
            messages: [
              message('user', 'other match prompt', '39:10'),
              message('user', 'this prompt', '39:11'),
              message('assistant', reply('22300000'), '39:11.5'),
              message('assistant', reply('99999999'), '39:12'),
            ],
          }),
        ),
    );

    const turn = await requestPrediction({
      ...options,
      agentId: 'a1',
      prompt: 'this prompt',
      context,
    });

    expect(turn.parsed).toMatchObject({
      outcome: 'valid',
      prediction: { predictedFinalPrice: '22300000' },
    });
    expect(turn.requestId).toBe('r2');
  });

  it('stays malformed when history has no reply to this prompt', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(json({ content: '' }))
        .mockResolvedValueOnce(
          json({
            messages: [
              message('user', 'other match prompt', '39:10'),
              message('assistant', reply('22300000'), '39:11'),
              message('user', 'this prompt', '39:12'),
            ],
          }),
        ),
    );

    const turn = await requestPrediction({
      ...options,
      agentId: 'a1',
      prompt: 'this prompt',
      context,
    });

    expect(turn.parsed.outcome).toBe('malformed');
  });
});
