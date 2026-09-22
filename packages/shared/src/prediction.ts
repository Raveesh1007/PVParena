import { z } from 'zod';
import { I64_MAX, I64_MAX_DIGITS, MAX_THESIS_BYTES } from './constants.js';

/**
 * A decimal mantissa that actually fits the on-chain i64. The length bound comes first so an
 * absurdly long digit string is rejected before it reaches BigInt.
 */
const i64DecimalString = z
  .string()
  .regex(/^(?:0|[1-9][0-9]*)$/, 'Must be a non-negative decimal integer string.')
  .max(I64_MAX_DIGITS, `Must be at most ${I64_MAX_DIGITS} digits to fit an i64.`)
  .refine((value) => BigInt(value) <= I64_MAX, {
    message: `Must not exceed the on-chain i64 maximum of ${I64_MAX}.`,
  });

const unixSeconds = z.number().int().positive();

export const agentPredictionSchema = z
  .object({
    schemaVersion: z.literal(1),
    matchId: z.string().min(32).max(44),
    round: z.union([z.literal(0), z.literal(1), z.literal(2)]),
    benchmarkSymbol: z.string().min(1),
    benchmarkFeedId: z
      .string()
      .regex(/^0x[0-9a-f]{64}$/, 'Must be a 32-byte lowercase hex Core feed ID.'),
    observedPrice: i64DecimalString,
    observedExponent: z.number().int(),
    observedPublishTime: unixSeconds,
    targetPublishTime: unixSeconds,
    predictedFinalPrice: i64DecimalString,
    confidenceBps: z.number().int().min(0).max(10_000),
    thesis: z.string().refine((v) => Buffer.byteLength(v, 'utf8') <= MAX_THESIS_BYTES, {
      message: `Thesis must be at most ${MAX_THESIS_BYTES} UTF-8 bytes.`,
    }),
  })
  .strict();

export type AgentPrediction = z.infer<typeof agentPredictionSchema>;

/** The fixed fields the prompt supplied, which the response must echo back unchanged. */
export type PredictionContext = Pick<
  AgentPrediction,
  | 'matchId'
  | 'round'
  | 'benchmarkSymbol'
  | 'benchmarkFeedId'
  | 'observedPrice'
  | 'observedExponent'
  | 'observedPublishTime'
  | 'targetPublishTime'
>;

/** `code.md` §5.5 PredictionInput. A non-valid outcome carries a zero price and the max penalty. */
export type PredictionOutcome = 'valid' | 'timeout' | 'apiError' | 'malformed';

export type ParsedPrediction =
  | { outcome: 'valid'; prediction: AgentPrediction }
  | { outcome: 'timeout' | 'apiError' | 'malformed'; reason: string };

/**
 * Parse exactly one JSON object and nothing else. Called once per response: chat is
 * non-idempotent, so a failure here becomes a penalty outcome, never a retry.
 */
export function parseAgentResponse(raw: string, context: PredictionContext): ParsedPrediction {
  const text = raw.trim();
  if (!text.startsWith('{') || !text.endsWith('}')) {
    return { outcome: 'malformed', reason: 'Response is not a bare JSON object.' };
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    return {
      outcome: 'malformed',
      reason: `Response is not valid JSON: ${(error as Error).message}`,
    };
  }
  const parsed = agentPredictionSchema.safeParse(json);
  if (!parsed.success) {
    return {
      outcome: 'malformed',
      reason: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    };
  }
  if (parsed.data.predictedFinalPrice === '0') {
    return { outcome: 'malformed', reason: 'predictedFinalPrice must be positive.' };
  }
  const mismatch = (Object.keys(context) as (keyof PredictionContext)[]).find(
    (key) => parsed.data[key] !== context[key],
  );
  if (mismatch) {
    return {
      outcome: 'malformed',
      reason: `Context field "${mismatch}" does not match the prompt.`,
    };
  }
  return { outcome: 'valid', prediction: parsed.data };
}
