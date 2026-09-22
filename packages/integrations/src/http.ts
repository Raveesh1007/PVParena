import type { z, ZodTypeAny } from 'zod';

export class IntegrationError extends Error {
  constructor(
    message: string,
    readonly provider: string,
    readonly status?: number,
    readonly cause?: unknown,
  ) {
    super(redact(message));
    this.name = 'IntegrationError';
  }
}

/** Raised when the upstream did not answer in time, as distinct from answering with an error. */
export class IntegrationTimeoutError extends IntegrationError {
  constructor(provider: string, timeoutMs: number) {
    super(`No response within ${timeoutMs}ms.`, provider);
    this.name = 'IntegrationTimeoutError';
  }
}

/**
 * Strip anything that looks like a credential from text that is about to be logged, stored or
 * thrown. Deliberately pattern-based rather than "remove the exact key we hold": an upstream may
 * echo a differently formatted token, and a redactor that only knows one secret gives false
 * confidence.
 */
export function redact(text: string): string {
  return text
    .replace(/\bcpk_[A-Za-z0-9_-]+/g, 'cpk_[redacted]')
    .replace(
      /\b(bearer|token|api[-_]?key|apikey|secret|password)\b(\s*[:=]\s*|\s+)\S+/gi,
      '$1 [redacted]',
    )
    .replace(/([?&](?:api[-_]?key|key|token|access_token)=)[^&\s]+/gi, '$1[redacted]');
}

/** Upstream bodies can be enormous; a summary is enough to diagnose and safe to store. */
export function summarize(body: string, limit = 400): string {
  const clean = redact(body.replace(/\s+/g, ' ').trim());
  return clean.length <= limit ? clean : `${clean.slice(0, limit)}… (${clean.length} chars)`;
}

export interface FetchJsonOptions<S extends ZodTypeAny> {
  provider: string;
  url: string;
  /**
   * Generic over the schema rather than over its output type, so that a schema carrying a
   * `.transform` reports the transformed type. Writing `ZodType<T>` here makes TypeScript infer
   * `T` from the schema's *input*, which silently hands the caller the pre-transform shape.
   */
  schema: S;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  /**
   * How many times to retry. Only ever non-zero for an idempotent GET — the default is 0 so that
   * making a call retryable is a deliberate act at the call site.
   */
  retries?: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;

export async function fetchJson<S extends ZodTypeAny>(
  options: FetchJsonOptions<S>,
): Promise<z.output<S>> {
  const {
    provider,
    url,
    schema,
    method = 'GET',
    headers = {},
    body,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = 0,
  } = options;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await once();
    } catch (error) {
      lastError = error;
      // A 4xx will not become a 2xx by asking again; only transport failures and 5xx are worth
      // another attempt.
      if (error instanceof IntegrationError && error.status && error.status < 500) throw error;
      if (attempt === retries) break;
      await sleep(250 * 2 ** attempt);
    }
  }
  throw lastError;

  async function once(): Promise<z.output<S>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    let text: string;
    try {
      const init: RequestInit = {
        method,
        headers: body === undefined ? headers : { 'content-type': 'application/json', ...headers },
        signal: controller.signal,
      };
      if (body !== undefined) init.body = JSON.stringify(body);
      response = await fetch(url, init);
      // Receiving headers does not finish the request: the body can stall too.
      text = await response.text();
    } catch (error) {
      if (controller.signal.aborted) throw new IntegrationTimeoutError(provider, timeoutMs);
      throw new IntegrationError(`Request failed: ${String(error)}`, provider, undefined, error);
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new IntegrationError(`HTTP ${response.status}`, provider, response.status);
    }

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new IntegrationError('Response was not JSON.', provider);
    }

    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
        .join('; ');
      throw new IntegrationError(`Response did not match the expected shape: ${issues}`, provider);
    }
    return parsed.data;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
