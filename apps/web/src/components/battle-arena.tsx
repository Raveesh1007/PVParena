import type { BenchmarkView } from '@/lib/benchmark';
import { formatAmount, formatBps, formatPrice, shortKey } from '@/lib/format';
import { type MatchStatus, PLAYER } from '@/lib/match-status';
import type { MatchView, RoundView } from '@/lib/matches';

import { type BattlePoint, BenchmarkChart } from '@/components/benchmark-chart';
import { Beam } from '@/components/beam';
import { MatchClock } from '@/components/match-clock';

export function BattleArena({
  match,
  benchmark,
  promptPoints,
  status,
}: {
  match: MatchView;
  benchmark: BenchmarkView;
  promptPoints: BattlePoint[];
  status: MatchStatus;
}) {
  if (!match.startObservation) return null;
  const accepted = match.rounds.filter((round) => round.creator.outcome !== 'unsubmitted');
  const points: BattlePoint[] = [
    { label: 'Start', observation: match.startObservation, source: 'chain' },
    ...promptPoints,
  ];
  if (match.finalObservation) {
    points.push({ label: 'Final', observation: match.finalObservation, source: 'chain' });
  } else if (
    benchmark.price &&
    benchmark.publishTime &&
    benchmark.publishTime >= match.deadlines.start
  ) {
    points.push({
      label: 'Latest Hermes',
      observation: {
        price: benchmark.price,
        exponent: benchmark.exponent,
        confidence: '0',
        publishTime: benchmark.publishTime,
      },
      source: 'live',
    });
  }
  const exponent = match.startObservation.exponent;

  return (
    <Beam>
      <section
        aria-label="Live battle"
        className="overflow-hidden rounded-surface border border-border-subtle bg-surface-1"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle bg-surface-2 px-4 py-3">
          <div>
            <p className="eyebrow text-warning">
              {match.stakes.creator.symbol} · devnet test copy
              {match.stakes.challenger.symbol !== match.stakes.creator.symbol
                ? ` vs ${match.stakes.challenger.symbol} · devnet test copy`
                : ''}
            </p>
            <p className="mt-1 text-sm text-text-secondary">Pyth · {benchmark.symbol}</p>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px]">
            <span className="font-mono text-lg tabular-nums text-text-primary">
              {benchmark.price ? formatPrice(benchmark.price, benchmark.exponent) : '—'}
            </span>
            <span className={benchmark.stale ? 'text-warning' : 'text-text-secondary'}>
              {benchmark.stale ? 'Oracle stale' : 'Oracle fresh'}
            </span>
            <span className="font-medium text-accent">{status.label}</span>
            {status.deadline > 0 ? (
              <span className="text-text-secondary">
                {status.deadlineLabel}{' '}
                <MatchClock deadline={status.deadline} label={status.deadlineLabel} />
              </span>
            ) : null}
          </div>
        </div>

        <div className="grid gap-0 lg:grid-cols-[minmax(150px,1fr)_minmax(0,3fr)_minmax(150px,1fr)]">
          <AgentPanel match={match} side="creator" round={accepted.at(-1)} />
          <div className="order-first min-w-0 border-b border-border-subtle p-4 lg:order-none lg:border-x lg:border-b-0">
            <h2 className="title-section">{benchmarkLabel(benchmark.symbol)} price</h2>
            <p className="mt-1 text-xs text-text-secondary">
              Filled dots: prices recorded on-chain. Hollow dots: the price each agent saw when
              predicting. Dashed lines: each player&rsquo;s latest prediction of the final price.
            </p>
            <BenchmarkChart
              points={points}
              rounds={accepted}
              roundDue={match.deadlines.rounds}
              targetEnd={match.deadlines.targetEnd}
              live={match.state === 'active' || match.state === 'awaitingSettlement'}
            />
          </div>
          <AgentPanel match={match} side="challenger" round={accepted.at(-1)} />
        </div>

        <div className="border-t border-border-subtle bg-surface-2 px-4 py-3 font-mono text-xs text-text-secondary">
          <p className="font-semibold text-text-primary">Battle log</p>
          <ol className="mt-2 space-y-1">
            <li>
              &gt; Match started · opening price{' '}
              {formatPrice(match.startObservation.price, exponent)}.
            </li>
            {accepted.map((item) => (
              <li key={item.round}>
                &gt; Round {item.round + 1}: {PLAYER.creator} predicted{' '}
                {predictionText(item.creator.outcome, item.creator.predictedPrice, exponent)},{' '}
                {PLAYER.challenger} predicted{' '}
                {predictionText(item.challenger.outcome, item.challenger.predictedPrice, exponent)}.
              </li>
            ))}
            {match.finalObservation && match.scores ? (
              <li>
                &gt; Final price {formatPrice(match.finalObservation.price, exponent)} ·{' '}
                {match.winner === 'tie'
                  ? 'tie'
                  : `${PLAYER[match.winner as 'creator' | 'challenger']} wins`}{' '}
                ({formatBps(match.scores.creator)} vs {formatBps(match.scores.challenger)} weighted
                error).
              </li>
            ) : (
              <li>
                &gt;{' '}
                {benchmark.stale
                  ? 'Oracle stale.'
                  : accepted.length < 3
                    ? `Waiting for round ${accepted.length + 1}.`
                    : 'Waiting for the final price.'}
              </li>
            )}
          </ol>
        </div>
      </section>
    </Beam>
  );
}

function AgentPanel({
  match,
  side,
  round,
}: {
  match: MatchView;
  side: 'creator' | 'challenger';
  round: RoundView | undefined;
}) {
  const stake = match.stakes[side];
  const prediction = round?.[side];
  const won = match.winner === side;
  return (
    <div className="min-w-0 border-b border-border-subtle p-4 lg:border-b-0">
      <div className="flex items-center gap-3">
        <AgentSprite variant={side} />
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{PLAYER[side]}</h3>
          <p className="truncate font-mono text-xs text-text-muted" title={match[side] ?? ''}>
            {match[side] ? shortKey(match[side]!) : 'Waiting for opponent'}
          </p>
        </div>
      </div>
      <dl className="mt-4 space-y-2 text-[13px]">
        <div>
          <dt className="text-text-muted">Stake · devnet test copy</dt>
          <dd className="font-mono tabular-nums">
            {formatAmount(stake.amount, stake.decimals)} {stake.symbol}
          </dd>
        </div>
        <div>
          <dt className="text-text-muted">Latest prediction</dt>
          <dd className="font-mono tabular-nums">
            {prediction && match.startObservation
              ? predictionText(
                  prediction.outcome,
                  prediction.predictedPrice,
                  match.startObservation.exponent,
                )
              : 'Agent prediction pending'}
          </dd>
        </div>
        <div>
          <dt className="text-text-muted">Weighted error · lower wins</dt>
          <dd className="font-mono tabular-nums">
            {match.scores ? formatBps(match.scores[side]) : 'scored at the end'}
          </dd>
        </div>
      </dl>
      <label className="mt-3 block text-xs text-text-muted">
        Rounds submitted ·{' '}
        {match.rounds.filter((item) => item.creator.outcome !== 'unsubmitted').length} / 3
        <progress
          value={match.rounds.filter((item) => item.creator.outcome !== 'unsubmitted').length}
          max={3}
          className="mt-1 h-1.5 w-full accent-accent"
        />
      </label>
      {match.scores ? (
        <p className={`mt-3 text-xs font-semibold ${won ? 'text-accent' : 'text-text-secondary'}`}>
          {won ? 'Winner' : match.winner === 'tie' ? 'Tie · refund' : 'Lost'}
        </p>
      ) : null}
    </div>
  );
}

function AgentSprite({ variant }: { variant: 'creator' | 'challenger' }) {
  const pixels =
    variant === 'creator'
      ? ['001100', '011110', '111111', '101101', '111111', '011110', '010010', '110011']
      : ['001100', '011110', '111111', '110011', '111111', '011110', '010010', '110011'];
  return (
    <svg
      role="img"
      aria-label={`${variant} agent avatar`}
      viewBox="0 0 6 8"
      className="h-10 w-8 shrink-0 text-accent"
      shapeRendering="crispEdges"
    >
      {pixels.flatMap((row, y) =>
        [...row].map((pixel, x) =>
          pixel === '1' ? (
            <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="currentColor" />
          ) : null,
        ),
      )}
    </svg>
  );
}

const predictionText = (outcome: string, price: string, exponent: number) =>
  outcome === 'valid' ? formatPrice(price, exponent) : `no valid answer (${outcome})`;

const benchmarkLabel = (symbol: string) => symbol.split('.').at(-1) ?? symbol;
