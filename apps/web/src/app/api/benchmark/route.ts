import { type BenchmarkView, loadBenchmark } from '@/lib/benchmark';

export const dynamic = 'force-dynamic';

const CACHE_MS = 2_000;
let cached: { at: number; view: Promise<BenchmarkView> } | null = null;

/** Latest benchmark read for the live chart. Read-only; one Hermes call per 2 s at most. */
export async function GET(): Promise<Response> {
  if (!cached || Date.now() - cached.at > CACHE_MS) {
    cached = { at: Date.now(), view: loadBenchmark() };
  }
  const { symbol, price, exponent, publishTime, stale } = await cached.view;
  return Response.json({ symbol, price, exponent, publishTime, stale });
}
