import { notFound } from 'next/navigation';

import { Row, formatAmount, formatPrice } from '@/components/cards';
import { loadMatch } from '@/lib/matches';
import { parsePubkey } from '@/lib/server';

export const dynamic = 'force-dynamic';

export default async function MatchPage({ params }: { params: Promise<{ pda: string }> }) {
  const { pda } = await params;
  const key = parsePubkey(pda);
  if (!key) notFound();

  const match = await loadMatch(key);
  if (!match) notFound();

  const settled = match.finalObservation !== null;
  const revealed = match.deadlines.start > 0;

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Match</h1>
          <span className="rounded border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-xs uppercase tracking-wide text-neutral-300">
            {match.state}
          </span>
        </div>
        <p className="font-mono text-xs text-neutral-500">{match.pda}</p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">Terms</h2>
          <dl className="mt-3 space-y-1.5 text-sm">
            <Row label="Profile" value={match.profile} />
            <Row label="Stake each" value={formatAmount(match.stakeAmount, 6)} />
            <Row label="Option strike" value={`${formatAmount(match.strikeAmount, 6)} USDC`} />
            <Row label="Creator" value={short(match.creator)} />
            <Row label="Challenger" value={match.challenger ? short(match.challenger) : 'open'} />
          </dl>
          <p className="mt-3 text-xs text-neutral-500">
            Terms are immutable once the challenger joins. The strike is the exact amount both
            players signed; no price feed and no <code>markPrice</code> can change it.
          </p>
        </div>

        <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">
            Schedule
          </h2>
          <dl className="mt-3 space-y-1.5 text-sm">
            {revealed ? (
              <>
                {match.deadlines.rounds.map((ts, index) => (
                  <Row key={index} label={`Round ${index}`} value={stamp(ts)} />
                ))}
                <Row label="Target end" value={stamp(match.deadlines.targetEnd)} />
                <Row label="Settlement by" value={stamp(match.deadlines.settlementDeadline)} />
                <Row label="Option expires" value={stamp(match.deadlines.optionExpiry)} />
              </>
            ) : (
              <>
                <Row label="Join by" value={stamp(match.deadlines.join)} />
                <Row
                  label="Activate by"
                  value={
                    match.deadlines.activation === 0
                      ? 'after join'
                      : stamp(match.deadlines.activation)
                  }
                />
              </>
            )}
          </dl>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <Observation title="Start price" observation={match.startObservation} />
        <Observation title="Final price" observation={match.finalObservation} />
      </section>

      <section>
        <h2 className="text-xl font-semibold">Rounds</h2>
        <p className="mt-1 text-sm text-neutral-400">
          Both players&rsquo; predictions are submitted in a single instruction, so neither appears
          before the other. A round that timed out, errored or returned something unparseable takes
          the maximum penalty — the three are recorded separately, but they score identically.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="py-2">Round</th>
                <th>Weight</th>
                <th>Creator</th>
                <th>Error</th>
                <th>Challenger</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody className="font-mono text-xs">
              {match.rounds.map((round) => (
                <tr key={round.round} className="border-t border-neutral-800">
                  <td className="py-2">{round.round}</td>
                  <td>{round.weightBps / 100}%</td>
                  <td>{outcome(round.creator)}</td>
                  <td>{round.creator.errorBps ?? '—'}</td>
                  <td>{outcome(round.challenger)}</td>
                  <td>{round.challenger.errorBps ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {settled ? (
        <section className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
          <h2 className="text-xl font-semibold">Result</h2>
          <dl className="mt-3 space-y-1.5 text-sm">
            <Row label="Creator score" value={match.scores?.creator ?? '—'} />
            <Row label="Challenger score" value={match.scores?.challenger ?? '—'} />
            <Row label="Winner" value={match.winner} />
          </dl>
          <p className="mt-3 text-xs text-neutral-500">
            Lower total wins. Equal scores tie and refund both deposits — never a coin flip. The
            winner shown here is the one the program recorded; the per-round errors above are
            recomputed from the same integers for display.
          </p>
        </section>
      ) : null}

      <a
        href={`/match/${match.pda}/proof`}
        className="inline-block rounded border border-neutral-700 px-3 py-2 text-sm transition hover:border-neutral-500"
      >
        Proof and transcript →
      </a>
    </div>
  );
}

function Observation({
  title,
  observation,
}: {
  title: string;
  observation: { price: string; exponent: number; confidence: string; publishTime: number } | null;
}) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">{title}</h2>
      {observation === null ? (
        <p className="mt-3 text-sm text-neutral-500">Not recorded yet.</p>
      ) : (
        <dl className="mt-3 space-y-1.5 text-sm">
          <Row label="Price" value={formatPrice(observation.price, observation.exponent)} />
          <Row
            label="Confidence"
            value={formatPrice(observation.confidence, observation.exponent)}
          />
          <Row label="Published" value={stamp(observation.publishTime)} />
        </dl>
      )}
    </div>
  );
}

const outcome = (side: { outcome: string; predictedPrice: string }) =>
  side.outcome === 'valid' ? side.predictedPrice : side.outcome;

const short = (key: string) => `${key.slice(0, 4)}…${key.slice(-4)}`;

const stamp = (seconds: number) =>
  seconds === 0 ? '—' : new Date(seconds * 1000).toISOString().replace('T', ' ').slice(0, 19);
