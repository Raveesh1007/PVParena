import type { ReactNode } from 'react';

function Shell({
  label,
  tone,
  title,
  children,
}: {
  label: string;
  tone: 'mainnet' | 'devnet' | 'benchmark';
  title: string;
  children: ReactNode;
}) {
  const tones = {
    mainnet: 'border-sky-800/70 bg-sky-950/30 text-sky-300',
    devnet: 'border-amber-700/70 bg-amber-950/30 text-amber-300',
    benchmark: 'border-violet-800/70 bg-violet-950/30 text-violet-300',
  } as const;
  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
      <span
        className={`inline-block rounded border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${tones[tone]}`}
      >
        {label}
      </span>
      <h3 className="mt-3 text-base font-semibold">{title}</h3>
      <dl className="mt-3 space-y-1.5 text-sm text-neutral-300">{children}</dl>
    </section>
  );
}

export function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="shrink-0 text-neutral-500">{label}</dt>
      <dd className="truncate text-right font-mono text-xs">{value}</dd>
    </div>
  );
}

/** The real asset. Sponsor proof and live data; never escrowed, never a trusted price. */
export function MainnetReferenceCard(props: { title: string; children: ReactNode }) {
  return (
    <Shell label="Mainnet reference" tone="mainnet" title={props.title}>
      {props.children}
    </Shell>
  );
}

/** The devnet test copy. This is what `create_match` and `join_match` actually move. */
export function DevnetTestCopyCard(props: { title: string; children: ReactNode }) {
  return (
    <Shell label="Devnet test copy" tone="devnet" title={props.title}>
      {props.children}
    </Shell>
  );
}

/** The Pyth feed that settles the match. Not the staked asset, and not related to its price. */
export function BenchmarkCard(props: { title: string; children: ReactNode }) {
  return (
    <Shell label="Benchmark feed" tone="benchmark" title={props.title}>
      {props.children}
    </Shell>
  );
}

/**
 * The stale-feed notice. The sentence is fixed by `code.md` §5.2 and must not gain a reopening
 * time: the benchmark publishes 24/5, there is no session calendar anywhere in this system, and
 * promising a time we cannot compute would be worse than saying nothing.
 */
export function StaleFeedNotice() {
  return (
    <p className="rounded border border-amber-700/60 bg-amber-950/30 px-3 py-2 text-sm text-amber-200">
      Benchmark updates are currently stale. New matches are temporarily unavailable.
    </p>
  );
}

/** Format a Pyth mantissa/exponent pair without going through a float. */
export function formatPrice(mantissa: string, exponent: number): string {
  const negative = mantissa.startsWith('-');
  const digits = (negative ? mantissa.slice(1) : mantissa).padStart(-exponent + 1, '0');
  const cut = digits.length + exponent;
  const whole = digits.slice(0, cut) || '0';
  const fraction = digits.slice(cut);
  return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`;
}

/** Base units to a decimal string, again without a float. */
export function formatAmount(amount: string, decimals: number): string {
  if (decimals === 0) return amount;
  const padded = amount.padStart(decimals + 1, '0');
  const whole = padded.slice(0, padded.length - decimals);
  const fraction = padded.slice(padded.length - decimals).replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole;
}
