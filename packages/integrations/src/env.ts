export class ConfigError extends Error {}

export function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    throw new ConfigError(`${name} is not set. See code.md §12 and .env.example.`);
  }
  return value.trim();
}

export function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value.trim() === '' ? fallback : value.trim();
}

export interface IntegrationConfig {
  prestocksUrl: string;
  hermesUrl: string;
  pythApiKey: string;
  benchmarkSymbol: string;
  benchmarkFeedId: string;
  benchmarkExponent: number;
  clawpumpBaseUrl: string;
  clawpumpApiKey: string;
  clawpumpModel: string;
  arenasConfigPath: string;
}

/**
 * Terminal/Lazer identifiers are short decimal numbers and a Core ID is 32 bytes of hex, so the
 * common mistake — pasting 1314 from the Pyth Terminal — is caught by shape alone.
 */
function assertCoreFeedId(value: string): string {
  const body = value.startsWith('0x') ? value.slice(2) : value;
  if (!/^[0-9a-f]{64}$/i.test(body)) {
    throw new ConfigError(
      `PYTH_BENCHMARK_FEED_ID must be the 32-byte Pyth Core feed ID as hex, got "${value}". ` +
        'Terminal identifiers such as 1314 (NVDA) or 922 (AAPL) are Pro/Lazer IDs and must never ' +
        'appear here. Resolve the Core ID from the official catalogue. `code.md` §3.2.',
    );
  }
  return value;
}

export function loadIntegrationConfig(): IntegrationConfig {
  const exponent = Number(optional('PYTH_BENCHMARK_EXPONENT', '-5'));
  if (!Number.isInteger(exponent)) {
    throw new ConfigError(`PYTH_BENCHMARK_EXPONENT must be an integer, got "${exponent}".`);
  }
  return {
    prestocksUrl: optional('PRESTOCKS_API_URL', 'https://prestocks.com/api/prestocks'),
    hermesUrl: optional('PYTH_HERMES_URL', 'https://pyth.dourolabs.app/hermes'),
    pythApiKey: required('PYTH_API_KEY'),
    benchmarkSymbol: optional('PYTH_BENCHMARK_SYMBOL', 'Equity.US.NVDA/USD'),
    benchmarkFeedId: assertCoreFeedId(required('PYTH_BENCHMARK_FEED_ID')),
    benchmarkExponent: exponent,
    clawpumpBaseUrl: optional('CLAWPUMP_BASE_URL', 'https://clawpump.tech/api/v1'),
    clawpumpApiKey: required('CLAWPUMP_API_KEY'),
    clawpumpModel: required('CLAWPUMP_PAID_MODEL'),
    arenasConfigPath: optional('ARENAS_CONFIG_PATH', 'config/arenas.json'),
  };
}
