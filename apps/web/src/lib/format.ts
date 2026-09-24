/** Format a Pyth mantissa/exponent pair without going through a float. */
export function formatPrice(mantissa: string, exponent: number): string {
  const negative = mantissa.startsWith('-');
  const digits = (negative ? mantissa.slice(1) : mantissa).padStart(-exponent + 1, '0');
  const cut = digits.length + exponent;
  const whole = digits.slice(0, cut) || '0';
  const fraction = digits.slice(cut);
  return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`;
}

/** `USDC-DEV`, the quote mint every Arena shares (`docs/integration-readiness.md` gate 4). */
export const QUOTE_DECIMALS = 6;

/** Base units to a decimal string, again without a float. */
export function formatAmount(amount: string, decimals: number): string {
  if (decimals === 0) return amount;
  const padded = amount.padStart(decimals + 1, '0');
  const whole = padded.slice(0, padded.length - decimals);
  const fraction = padded.slice(padded.length - decimals).replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole;
}

/** Basis points as a percentage: `"2"` → `"0.02%"`. */
export const formatBps = (bps: string): string => `${formatAmount(bps, 2)}%`;

/** A typed decimal to base units. Null for anything malformed or finer than the mint allows. */
export function parseAmount(text: string, decimals: number): bigint | null {
  const match = /^(\d+)(?:\.(\d*))?$/.exec(text.trim());
  if (!match) return null;
  const fraction = match[2] ?? '';
  if (fraction.length > decimals) return null;
  return BigInt(match[1] + fraction.padEnd(decimals, '0'));
}

/** An upstream decimal cut (never rounded up) to `decimals` places; null if it is not plain decimal. */
export function truncateDecimal(text: string, decimals: number): string | null {
  const match = /^(\d+)(?:\.(\d*))?$/.exec(text.trim());
  if (!match) return null;
  const fraction = (match[2] ?? '').slice(0, decimals).replace(/0+$/, '');
  return fraction ? `${match[1]}.${fraction}` : match[1]!;
}

/** Strike in quote base units for `stake` base units at `price` quote base units per whole token. Floors. */
export const strikeFor = (stake: bigint, decimals: number, price: bigint): bigint =>
  (stake * price) / 10n ** BigInt(decimals);

/** `create_match` minimum: 0.05 tokens in the mint's own base units. Mirrors `min_stake_amount`. */
export const minStake = (decimals: number): bigint =>
  decimals < 2 ? 0n : 5n * 10n ** BigInt(decimals - 2);

export const shortKey = (key: string): string => `${key.slice(0, 4)}…${key.slice(-4)}`;

export const stamp = (seconds: number): string =>
  seconds === 0 ? '—' : new Date(seconds * 1000).toISOString().replace('T', ' ').slice(0, 19);

export const explorerTx = (signature: string): string =>
  `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
