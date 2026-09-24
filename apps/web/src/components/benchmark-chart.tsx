'use client';

import { useEffect, useState } from 'react';

import { formatPrice, stamp } from '@/lib/format';
import { PLAYER, type Side } from '@/lib/match-status';
import type { Observation, RoundView } from '@/lib/matches';

export interface BattlePoint {
  label: string;
  observation: Observation;
  source: 'chain' | 'prompt' | 'live';
}

const POLL_MS = 3_000;
const MAX_LIVE_POINTS = 600;
const SIDE_COLOR: Record<Side, string> = {
  creator: 'rgb(var(--info))',
  challenger: 'rgb(var(--warning))',
};

/**
 * The benchmark as the players see it: on-chain observations, the price each agent saw, a live
 * Hermes line while the match runs, and every prediction accepted on-chain. Live points are
 * provisional display; nothing here decides a score.
 */
export function BenchmarkChart({
  points,
  rounds,
  roundDue,
  targetEnd,
  live,
}: {
  points: BattlePoint[];
  /** Only rounds whose paired outcome is already accepted on-chain. */
  rounds: RoundView[];
  roundDue: number[];
  targetEnd: number;
  live: boolean;
}) {
  const livePoints = useLivePrices(live, points[0]?.observation.publishTime ?? 0);
  const exponent = points[0]?.observation.exponent ?? -5;
  const series = [...points, ...livePoints]
    .filter((point) => point.observation.exponent === exponent)
    .sort((a, b) => a.observation.publishTime - b.observation.publishTime);
  const predictions = rounds.flatMap((round) =>
    (['creator', 'challenger'] as const)
      .filter((side) => round[side].outcome === 'valid')
      .map((side) => ({
        side,
        round: round.round,
        price: Number(round[side].predictedPrice),
        text: formatPrice(round[side].predictedPrice, exponent),
        time: roundDue[round.round] ?? 0,
      })),
  );

  const values = [
    ...series.map((point) => Number(point.observation.price)),
    ...predictions.map((p) => p.price),
  ];
  if (values.length === 0) {
    return <p className="py-12 text-sm text-text-muted">Waiting for benchmark observations.</p>;
  }
  const low = Math.min(...values);
  const high = Math.max(...values);
  const pad = Math.max((high - low) * 0.12, 1);
  const min = low - pad;
  const span = high - low + 2 * pad;
  const first = series[0]?.observation.publishTime ?? roundDue[0] ?? 0;
  const last = Math.max(targetEnd, series.at(-1)?.observation.publishTime ?? first, first + 1);
  const x = (time: number) => 56 + ((time - first) / (last - first)) * 528;
  const y = (price: number) => 196 - ((price - min) / span) * 164;
  const priceText = (value: number) => formatPrice(BigInt(Math.round(value)).toString(), exponent);
  const liveLine = series.filter((point) => point.source !== 'prompt');
  const latest = series.at(-1);

  return (
    <div className="mt-4">
      <svg
        viewBox="0 0 640 244"
        className="w-full"
        role="img"
        aria-label="Benchmark price over the match with each player's predictions"
      >
        {[0, 1, 2, 3].map((line) => (
          <line
            key={line}
            x1="56"
            x2="584"
            y1={32 + line * 54.7}
            y2={32 + line * 54.7}
            stroke="rgb(var(--border-subtle))"
          />
        ))}
        <text x="2" y="36" fill="rgb(var(--text-muted))" fontSize="11">
          {priceText(high)}
        </text>
        <text x="2" y="200" fill="rgb(var(--text-muted))" fontSize="11">
          {priceText(low)}
        </text>

        {[
          ...roundDue.map((time, index) => ({ time, label: `R${index + 1}` })),
          { time: targetEnd, label: 'Final' },
        ]
          .filter((mark) => mark.time > 0)
          .map((mark) => (
            <g key={mark.label}>
              <line
                x1={x(mark.time)}
                x2={x(mark.time)}
                y1="24"
                y2="204"
                stroke="rgb(var(--border-subtle))"
                strokeDasharray="2 4"
              />
              <text
                x={x(mark.time)}
                y="18"
                textAnchor="middle"
                fill="rgb(var(--text-muted))"
                fontSize="11"
              >
                {mark.label}
              </text>
            </g>
          ))}

        {liveLine.length > 1 ? (
          <polyline
            points={liveLine
              .map(
                (point) =>
                  `${x(point.observation.publishTime)},${y(Number(point.observation.price))}`,
              )
              .join(' ')}
            fill="none"
            stroke="rgb(var(--text-secondary))"
            strokeWidth="1.5"
          />
        ) : null}

        {series
          .filter((point) => point.source !== 'live')
          .map((point, index) => (
            <circle
              key={`${point.label}-${index}`}
              cx={x(point.observation.publishTime)}
              cy={y(Number(point.observation.price))}
              r="4"
              fill={point.source === 'chain' ? 'rgb(var(--text-primary))' : 'rgb(var(--canvas))'}
              stroke="rgb(var(--text-primary))"
              strokeWidth="1.5"
            >
              <title>{`${point.label}: ${formatPrice(point.observation.price, exponent)}`}</title>
            </circle>
          ))}

        {predictions.map((p) => (
          <g key={`${p.side}-${p.round}`}>
            <line
              x1={x(p.time)}
              x2={x(targetEnd)}
              y1={y(p.price)}
              y2={y(p.price)}
              stroke={SIDE_COLOR[p.side]}
              strokeDasharray="3 4"
              strokeOpacity="0.6"
            />
            <rect
              x={x(p.time) - 4}
              y={y(p.price) - 4}
              width="8"
              height="8"
              transform={`rotate(45 ${x(p.time)} ${y(p.price)})`}
              fill={SIDE_COLOR[p.side]}
            >
              <title>{`${PLAYER[p.side]} round ${p.round + 1}: ${p.text}`}</title>
            </rect>
            <text
              x={x(p.time) + 8}
              y={y(p.price) + (p.side === 'creator' ? -6 : 14)}
              fill={SIDE_COLOR[p.side]}
              fontSize="11"
            >
              {`${p.side === 'creator' ? 'A' : 'B'}${p.round + 1}`}
            </text>
          </g>
        ))}

        {latest?.source === 'live' ? (
          <circle
            cx={x(latest.observation.publishTime)}
            cy={y(Number(latest.observation.price))}
            r="3.5"
            fill="rgb(var(--accent))"
          />
        ) : null}

        <text x="56" y="232" fill="rgb(var(--text-muted))" fontSize="11">
          {stamp(first).slice(11)} UTC
        </text>
        <text x="584" y="232" textAnchor="end" fill="rgb(var(--text-muted))" fontSize="11">
          {stamp(last).slice(11)} UTC
        </text>
      </svg>

      <dl className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
        {(['creator', 'challenger'] as const).map((side) => (
          <div key={side} className="flex flex-wrap gap-x-2">
            <dt style={{ color: SIDE_COLOR[side] }}>◆ {PLAYER[side]} predicted</dt>
            <dd className="font-mono tabular-nums text-text-secondary">
              {predictions
                .filter((p) => p.side === side)
                .map((p) => `R${p.round + 1} ${p.text}`)
                .join(' · ') || 'pending'}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-1 text-xs text-text-secondary">
        {latest
          ? `${latest.source === 'live' ? 'Live' : latest.label}: ${formatPrice(latest.observation.price, exponent)} · ${stamp(latest.observation.publishTime).slice(11)} UTC`
          : 'No observation yet'}
        {latest?.source === 'live' ? ' · live Hermes price, not recorded on-chain' : ''}
      </p>
    </div>
  );
}

/** Polls the read-only benchmark route while the match runs; history starts when the page opens. */
function useLivePrices(active: boolean, since: number): BattlePoint[] {
  const [points, setPoints] = useState<BattlePoint[]>([]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const response = await fetch('/api/benchmark', { cache: 'no-store' });
        if (!response.ok) return;
        const latest = (await response.json()) as {
          price: string | null;
          exponent: number;
          publishTime: number | null;
          stale: boolean;
        };
        if (cancelled || latest.stale || !latest.price || !latest.publishTime) return;
        const observation = {
          price: latest.price,
          exponent: latest.exponent,
          confidence: '0',
          publishTime: latest.publishTime,
        };
        if (observation.publishTime < since) return;
        setPoints((current) =>
          current.at(-1)?.observation.publishTime === observation.publishTime
            ? current
            : [...current, { label: 'Live', observation, source: 'live' as const }].slice(
                -MAX_LIVE_POINTS,
              ),
        );
      } catch {
        // A missed poll just leaves a gap; the next one fills in the line.
      }
    };
    void poll();
    const timer = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [active, since]);

  return points;
}
