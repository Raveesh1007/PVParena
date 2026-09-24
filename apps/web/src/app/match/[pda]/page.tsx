import { notFound } from 'next/navigation';
import { MATCH_PROFILES, type MatchProfileKind } from '@stock-arena/shared';

import { BattleArena } from '@/components/battle-arena';
import type { BattlePoint } from '@/components/benchmark-chart';
import { Row } from '@/components/cards';
import { MatchActions } from '@/components/match-actions';
import { MatchClock } from '@/components/match-clock';
import { type BenchmarkView, loadBenchmark } from '@/lib/benchmark';
import { publishedPromptPoints } from '@/lib/battle-points';
import {
  QUOTE_DECIMALS,
  formatAmount,
  formatBps,
  formatPrice,
  shortKey as short,
  stamp,
} from '@/lib/format';
import { PLAYER, type Side, matchStatus } from '@/lib/match-status';
import { type MatchView, type RoundView, loadMatch } from '@/lib/matches';
import { db, parsePubkey } from '@/lib/server';
import { Beam } from '@/components/beam';

export const dynamic = 'force-dynamic';

const SIDES: Side[] = ['creator', 'challenger'];

export default async function MatchPage({ params }: { params: Promise<{ pda: string }> }) {
  const { pda } = await params;
  const key = parsePubkey(pda);
  if (!key) notFound();

  const [match, benchmark] = await Promise.all([loadMatch(key), loadBenchmark()]);
  if (!match) notFound();

  const revealed = match.deadlines.start > 0;
  const acceptedRounds = match.rounds
    .filter((round) => round.creator.outcome !== 'unsubmitted')
    .map((round) => round.round);
  const turns =
    revealed && acceptedRounds.length > 0
      ? await db()
          .agentTurn.findMany({
            where: { matchPda: match.pda, round: { in: acceptedRounds }, outcome: 'Valid' },
            orderBy: [{ round: 'asc' }, { playerIndex: 'asc' }],
          })
          .catch(() => [])
      : [];
  const promptPoints = publishedPromptPoints(match, turns, benchmark);
  const status = matchStatus(match, Math.floor(Date.now() / 1000));
  const benchmarkName = shortBenchmark(benchmark.symbol);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="eyebrow text-warning">
          {match.stakes.creator.symbol} vs {match.stakes.challenger.symbol} · devnet test copies ·
          benchmark {benchmarkName}
        </p>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="title-page">{status.label}</h1>
          {status.deadline > 0 ? (
            <span className="text-sm text-text-secondary">
              {status.deadlineLabel}{' '}
              <MatchClock deadline={status.deadline} label={status.deadlineLabel} />
            </span>
          ) : null}
        </div>
        {status.detail ? (
          <p className="max-w-3xl text-sm text-text-secondary">{status.detail}</p>
        ) : null}
      </header>

      <Beam>
        <section className="rounded-surface border border-border-subtle bg-surface-1 p-4">
          <h2 className="title-section mb-3">Your move</h2>
          <MatchActions
            benchmarkStale={benchmark.stale}
            match={{
              pda: match.pda,
              state: match.state,
              creator: match.creator,
              challenger: match.challenger,
              winner: match.winner,
              creatorArena: match.stakes.creator.arena,
              challengerArena: match.stakes.challenger.arena,
              deadlines: match.deadlines,
              deposits: match.deposits,
              flags: match.flags,
              stakes: match.stakes,
            }}
          />
        </section>
      </Beam>

      {revealed ? (
        <BattleArena
          match={match}
          benchmark={benchmark}
          promptPoints={promptPoints}
          status={status}
        />
      ) : null}

      {revealed ? (
        <Scoreboard match={match} promptPoints={promptPoints} benchmarkName={benchmarkName} />
      ) : null}

      <section className="grid gap-4 md:grid-cols-2">
        <Stakes match={match} />
        <Rules match={match} benchmarkName={benchmarkName} />
      </section>

      <TechnicalDetails match={match} benchmark={benchmark} />
    </div>
  );
}

function Scoreboard({
  match,
  promptPoints,
  benchmarkName,
}: {
  match: MatchView;
  promptPoints: BattlePoint[];
  benchmarkName: string;
}) {
  const exponent = match.startObservation?.exponent ?? -5;
  const final = match.finalObservation;
  const seen = (round: number) =>
    promptPoints.find((point) => point.label === `Round ${round + 1}`)?.observation;

  return (
    <Beam>
      <section className="rounded-surface border border-border-subtle bg-surface-1 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="title-section">Scoreboard</h2>
          <p className="text-sm text-text-secondary">
            Final {benchmarkName}:{' '}
            <span className="font-mono tabular-nums text-text-primary">
              {final ? formatPrice(final.price, final.exponent) : 'not recorded yet'}
            </span>
          </p>
        </div>
        <p className="mt-1 text-[13px] text-text-secondary">
          Error is how far each prediction landed from the final price. Lower is better.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="text-left text-xs text-text-muted">
              <tr>
                <th className="py-2 font-medium">Round</th>
                <th className="font-medium">Weight</th>
                <th className="font-medium">{benchmarkName} when predicting</th>
                <th className="font-medium">{PLAYER.creator} predicted · error</th>
                <th className="font-medium">{PLAYER.challenger} predicted · error</th>
                <th className="font-medium">Closer</th>
              </tr>
            </thead>
            <tbody className="font-mono text-xs tabular-nums">
              {match.rounds.map((round) => {
                const observed = seen(round.round);
                return (
                  <tr key={round.round} className="border-t border-border-subtle">
                    <td className="py-2">{round.round + 1}</td>
                    <td>{round.weightBps / 100}%</td>
                    <td>{observed ? formatPrice(observed.price, observed.exponent) : '—'}</td>
                    {SIDES.map((side) => (
                      <td key={side}>{prediction(round[side], exponent, final?.price)}</td>
                    ))}
                    <td className="font-sans">{closer(round)}</td>
                  </tr>
                );
              })}
            </tbody>
            {match.scores ? (
              <tfoot>
                <tr className="border-t border-border-subtle">
                  <td colSpan={3} className="py-2 text-[13px] text-text-secondary">
                    Weighted total, recorded on-chain
                  </td>
                  {SIDES.map((side) => (
                    <td key={side} className="font-mono text-xs tabular-nums">
                      {formatBps(match.scores![side])}
                      {match.winner === side ? (
                        <span className="ml-2 font-sans font-semibold text-accent">Winner</span>
                      ) : null}
                    </td>
                  ))}
                  <td className="text-[13px]">{match.winner === 'tie' ? 'Tie' : ''}</td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
        <p className="mt-3 text-xs text-text-muted">
          {match.scores
            ? 'Total = each round’s error × its weight. The winner is the one the program recorded.'
            : 'Errors appear once the final price is recorded on-chain.'}
        </p>
      </section>
    </Beam>
  );
}

function Stakes({ match }: { match: MatchView }) {
  return (
    <Beam>
      <div className="rounded-surface border border-border-subtle bg-surface-1 p-4">
        <h2 className="title-section">What&rsquo;s at stake</h2>
        <dl className="mt-3 space-y-3 text-sm">
          {SIDES.map((side) => {
            const stake = match.stakes[side];
            const wallet = match[side];
            return (
              <div key={side}>
                <dt className="text-text-secondary">
                  {PLAYER[side]}{' '}
                  <span className="font-mono text-xs text-text-muted">
                    {wallet ? short(wallet) : 'waiting for opponent'}
                  </span>
                </dt>
                <dd className="mt-0.5">
                  Stakes{' '}
                  <span className="font-mono tabular-nums">
                    {formatAmount(stake.amount, stake.decimals)} {stake.symbol}
                  </span>{' '}
                  <span className="text-xs text-warning">devnet test copy</span>. If they lose, the
                  winner may buy it for{' '}
                  <span className="font-mono tabular-nums">
                    {formatAmount(stake.strike, QUOTE_DECIMALS)} USDC-DEV
                  </span>
                  .
                </dd>
              </div>
            );
          })}
        </dl>
        <p className="mt-3 text-xs text-text-muted">
          These terms were fixed when both players signed and cannot change.
        </p>
      </div>
    </Beam>
  );
}

function Rules({ match, benchmarkName }: { match: MatchView; benchmarkName: string }) {
  const profile = MATCH_PROFILES[match.profile as MatchProfileKind];
  if (!profile) return null;
  const minutes = (seconds: number) => seconds / 60;
  const [, second, third] = profile.roundDueOffsets;
  return (
    <Beam>
      <div className="rounded-surface border border-border-subtle bg-surface-1 p-4">
        <h2 className="title-section">How it&rsquo;s decided</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-text-secondary">
          <li>
            The match lasts {minutes(profile.durationSeconds)} minutes. Each player&rsquo;s AI agent
            follows their strategy and predicts where {benchmarkName} will be at the end.
          </li>
          <li>
            Agents predict three times: at the start, at {minutes(second)} min and at{' '}
            {minutes(third)} min. The rounds count 20%, 30% and 50%.
          </li>
          <li>
            The final {benchmarkName} price comes from Pyth. The lower weighted error wins; an exact
            tie refunds both players.
          </li>
          <li>
            The winner takes back their stake and has {minutes(profile.exerciseWindowSeconds)}{' '}
            minutes to buy the loser&rsquo;s stake at its strike. Otherwise the loser takes it back.
          </li>
        </ol>
      </div>
    </Beam>
  );
}

function TechnicalDetails({ match, benchmark }: { match: MatchView; benchmark: BenchmarkView }) {
  const revealed = match.deadlines.start > 0;
  return (
    <Beam>
      <details className="rounded-surface border border-border-subtle bg-surface-1 p-4">
        <summary className="cursor-pointer text-sm font-semibold">Technical details</summary>
        <div className="mt-4 grid gap-6 md:grid-cols-2">
          <dl className="space-y-1.5 text-sm">
            <Row
              label="Match account"
              value={
                <a
                  className="underline hover:text-text-secondary"
                  href={`https://explorer.solana.com/address/${match.pda}?cluster=devnet`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {match.pda}
                </a>
              }
            />
            <Row label="On-chain state" value={match.state} />
            <Row label="Profile" value={match.profile} />
            <Row label="Benchmark feed" value={benchmark.symbol} />
            {revealed ? (
              <>
                {match.deadlines.rounds.map((ts, index) => (
                  <Row key={index} label={`Round ${index + 1} due`} value={stamp(ts)} />
                ))}
                <Row label="Final price at" value={stamp(match.deadlines.targetEnd)} />
                <Row label="Settle by" value={stamp(match.deadlines.settlementDeadline)} />
                <Row label="Option expires" value={stamp(match.deadlines.optionExpiry)} />
              </>
            ) : (
              <>
                <Row label="Join by" value={stamp(match.deadlines.join)} />
                <Row
                  label="Start by"
                  value={
                    match.deadlines.activation === 0
                      ? 'after join'
                      : stamp(match.deadlines.activation)
                  }
                />
              </>
            )}
          </dl>
          <dl className="space-y-1.5 text-sm">
            {(
              [
                ['Start', match.startObservation],
                ['Final', match.finalObservation],
              ] as const
            ).map(([label, observation]) => (
              <Row
                key={label}
                label={`${label} price`}
                value={
                  observation
                    ? `${formatPrice(observation.price, observation.exponent)} ± ${formatPrice(observation.confidence, observation.exponent)} · ${stamp(observation.publishTime)}`
                    : 'not recorded'
                }
              />
            ))}
            <Row label="Strategy hash A" value={match.commitments.creator} />
            <Row label="Strategy hash B" value={match.commitments.challenger ?? '—'} />
          </dl>
        </div>
        <p className="mt-4 text-xs text-text-muted">All times UTC.</p>
        <a
          href={`/match/${match.pda}/proof`}
          className="mt-3 inline-block rounded-control bg-surface-2 px-3 py-2 text-sm transition-colors hover:bg-surface-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          Proof and agent transcript →
        </a>
      </details>
    </Beam>
  );
}

const OUTCOME_LABELS: Record<string, string> = {
  unsubmitted: 'pending',
  timeout: 'timed out · max penalty',
  apiError: 'agent error · max penalty',
  malformed: 'invalid answer · max penalty',
};

function prediction(side: RoundView['creator'], exponent: number, finalPrice?: string) {
  if (side.outcome !== 'valid') return OUTCOME_LABELS[side.outcome] ?? side.outcome;
  const price = formatPrice(side.predictedPrice, exponent);
  if (side.errorBps === null) return price;
  // The program floors to whole bps, so 0 means under 0.01%, not necessarily exact.
  const error =
    side.errorBps === '0' && side.predictedPrice !== finalPrice
      ? '<0.01%'
      : formatBps(side.errorBps);
  return `${price} · ${error}`;
}

/** Display comparison of this round's recorded errors; the winner still comes from the program. */
function closer(round: RoundView) {
  const a = round.creator.errorBps;
  const b = round.challenger.errorBps;
  if (a === null || b === null) return '—';
  if (BigInt(a) === BigInt(b)) return 'Even';
  return BigInt(a) < BigInt(b) ? PLAYER.creator : PLAYER.challenger;
}

const shortBenchmark = (symbol: string) => symbol.split('.').at(-1) ?? symbol;
