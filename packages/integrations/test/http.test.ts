import { afterEach, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { fetchJson, IntegrationTimeoutError } from '../src/http.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('times out a stalled response body after headers have arrived', async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url, init: RequestInit) => ({
      ok: true,
      text: () =>
        new Promise<string>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    })),
  );
  const result = fetchJson({
    provider: 'test',
    url: 'https://example.invalid',
    schema: z.object({}),
    timeoutMs: 120_000,
  });
  const rejected = expect(result).rejects.toBeInstanceOf(IntegrationTimeoutError);
  await vi.advanceTimersByTimeAsync(120_000);
  await rejected;
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('does not include an upstream body in an HTTP error', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('opaque-private-credential', { status: 500 })),
  );
  await expect(
    fetchJson({ provider: 'test', url: 'https://example.invalid', schema: z.object({}) }),
  ).rejects.toThrow(/^HTTP 500$/);
});
