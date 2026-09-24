import type { ReactNode } from 'react';
import { Beam } from '@/components/beam';

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
    mainnet: 'text-info',
    devnet: 'text-warning',
    benchmark: 'text-accent',
  } as const;
  return (
    <Beam>
      <section className="rounded-surface border border-border-subtle bg-surface-1 p-4">
        <span className={`eyebrow ${tones[tone]}`}>{label}</span>
        <h3 className="title-section mt-2">{title}</h3>
        <dl className="mt-3 space-y-1.5 text-sm text-text-secondary">{children}</dl>
      </section>
    </Beam>
  );
}

export function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="shrink-0 text-text-muted">{label}</dt>
      <dd className="min-w-0 break-all text-right font-mono text-xs tabular-nums text-text-primary">
        {value}
      </dd>
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
    <p className="rounded-control bg-surface-2 px-3 py-2 text-sm text-warning">
      Benchmark updates are currently stale. New matches are temporarily unavailable.
    </p>
  );
}
