import { describe, expect, it } from 'vitest';
import { parseAgentResponse, type PredictionContext } from '../src/index.js';

const CONTEXT: PredictionContext = {
  matchId: '7yMXHkKyXmGQYQWQwqMcqVXbFVXMhMBzKPQW1nAnQPxU',
  round: 0,
  benchmarkSymbol: 'Equity.US.NVDA/USD',
  benchmarkFeedId: '0x' + 'ab'.repeat(32),
  observedPrice: '22251500',
  observedExponent: -5,
  observedPublishTime: 1790000300,
  targetPublishTime: 1790001200,
};

const valid = {
  ...CONTEXT,
  schemaVersion: 1,
  predictedFinalPrice: '22400000',
  confidenceBps: 6800,
  thesis: 'Momentum holds.',
};
const body = (over: Record<string, unknown> = {}) => JSON.stringify({ ...valid, ...over });

describe('parseAgentResponse', () => {
  it('accepts one bare JSON object echoing the prompt context', () => {
    const result = parseAgentResponse(body(), CONTEXT);
    expect(result.outcome).toBe('valid');
    if (result.outcome === 'valid') expect(result.prediction.predictedFinalPrice).toBe('22400000');
  });

  it('tolerates surrounding whitespace only', () => {
    expect(parseAgentResponse(`\n  ${body()}  \n`, CONTEXT).outcome).toBe('valid');
  });

  it.each([
    ['a markdown fence', '```json\n' + body() + '\n```'],
    ['leading prose', 'Here is my prediction: ' + body()],
    ['not JSON at all', 'I cannot predict that.'],
    ['a truncated object', body().slice(0, -1)],
  ])('classifies %s as malformed', (_label, raw) => {
    expect(parseAgentResponse(raw, CONTEXT).outcome).toBe('malformed');
  });

  it('rejects a float price, which would lose i64 mantissa precision', () => {
    expect(parseAgentResponse(body({ predictedFinalPrice: 22400000.5 }), CONTEXT).outcome).toBe(
      'malformed',
    );
  });

  it('rejects a zero predicted price, since Valid requires a positive one', () => {
    expect(parseAgentResponse(body({ predictedFinalPrice: '0' }), CONTEXT).outcome).toBe(
      'malformed',
    );
  });

  it('rejects an extra settlement-critical field rather than ignoring it', () => {
    expect(parseAgentResponse(body({ payout: 'me' }), CONTEXT).outcome).toBe('malformed');
  });

  it.each([
    ['round', { round: 1 }],
    ['matchId', { matchId: 'SysvarC1ock11111111111111111111111111111111' }],
    ['observedPrice', { observedPrice: '22251501' }],
    ['targetPublishTime', { targetPublishTime: 1790001201 }],
  ])('rejects a response that alters the %s context field', (field, over) => {
    const result = parseAgentResponse(body(over), CONTEXT);
    expect(result.outcome).toBe('malformed');
    if (result.outcome !== 'valid') expect(result.reason).toContain(field);
  });

  it.each([
    ['confidenceBps out of range', { confidenceBps: 10_001 }],
    ['an oversized thesis', { thesis: 'x'.repeat(281) }],
    ['a wrong schemaVersion', { schemaVersion: 2 }],
    ['a Terminal feed ID instead of a Core one', { benchmarkFeedId: '1314' }],
  ])('rejects %s', (_label, over) => {
    expect(parseAgentResponse(body(over), CONTEXT).outcome).toBe('malformed');
  });

  // Regression: the schema previously validated digit *format* only, so 2^63 and beyond parsed as
  // valid and would have overflowed the i64 the program stores.
  it.each([
    ['exactly i64::MAX', '9223372036854775807', 'valid'],
    ['one past i64::MAX', '9223372036854775808', 'malformed'],
    ['far past i64::MAX', '99999999999999999999999999', 'malformed'],
  ])('bounds predictedFinalPrice at %s', (_label, price, outcome) => {
    expect(parseAgentResponse(body({ predictedFinalPrice: price }), CONTEXT).outcome).toBe(outcome);
  });

  it('bounds observedPrice the same way, not just the predicted price', () => {
    const over = '9223372036854775808';
    const result = parseAgentResponse(body({ observedPrice: over }), {
      ...CONTEXT,
      observedPrice: over,
    });
    expect(result.outcome).toBe('malformed');
  });
});
