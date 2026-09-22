import { createHash } from 'node:crypto';
import { notFound } from 'next/navigation';
import { PublicKey } from '@solana/web3.js';
import { PROGRAM_ID } from '@stock-arena/idl';
import { STRATEGY_DOMAIN, computeCommitment } from '@stock-arena/shared';

import { Row } from '@/components/cards';
import { loadMatch } from '@/lib/matches';
import { db, parsePubkey } from '@/lib/server';
import { transcriptFilters } from '@/lib/transcript';

export const dynamic = 'force-dynamic';

export default async function ProofPage({ params }: { params: Promise<{ pda: string }> }) {
  const { pda } = await params;
  const key = parsePubkey(pda);
  if (!key) notFound();

  const match = await loadMatch(key);
  if (!match) notFound();

  const revealed = match.deadlines.start > 0;
  const filters = transcriptFilters(match);
  const [turns, strategies] = await Promise.all([
    db().agentTurn.findMany({
      where: filters.turns,
      orderBy: [{ round: 'asc' }, { playerIndex: 'asc' }],
    }),
    revealed
      ? db().strategyCommitment.findMany({ where: filters.strategies })
      : Promise.resolve([]),
  ]);

  const verified = strategies.map((row) => {
    let recomputed: string;
    try {
      recomputed = computeCommitment({
        matchPda: new PublicKey(match.pda),
        player: new PublicKey(row.playerWallet),
        salt: Buffer.from(row.salt, 'hex'),
        strategy: row.strategy,
      }).commitment.toString('hex');
    } catch (error) {
      recomputed = `error: ${String((error as Error).message)}`;
    }
    const signed =
      row.playerWallet === match.creator
        ? match.commitments.creator
        : row.playerWallet === match.challenger
          ? match.commitments.challenger
          : null;
    return { ...row, recomputed, matches: recomputed === row.commitment && recomputed === signed };
  });

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Proof</h1>
        <p className="mt-1 font-mono text-xs text-neutral-500">{match.pda}</p>
      </header>

      <section className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">Program</h2>
        <dl className="mt-3 space-y-1.5 text-sm">
          <Row label="Program ID" value={PROGRAM_ID.toBase58()} />
          <Row label="Cluster" value="devnet" />
          <Row label="Arena" value={match.arena} />
          <Row label="State" value={match.state} />
        </dl>
      </section>

      <section>
        <h2 className="text-xl font-semibold">Strategy commitments</h2>
        <p className="mt-1 text-sm text-neutral-400">
          <code className="text-xs">
            sha256(&quot;{STRATEGY_DOMAIN}&quot; || match_pda || player || salt_32 || strategy)
          </code>
          . The program stores only the 32 bytes and never recomputes them; the signed transaction
          is what binds a commitment to its player.
        </p>
        {!revealed ? (
          <p className="mt-4 rounded border border-neutral-800 px-3 py-4 text-sm text-neutral-400">
            Strategies are revealed when the match activates. Publishing one earlier would let an
            opponent read it before committing their own.
          </p>
        ) : verified.length === 0 ? (
          <p className="mt-4 text-sm text-neutral-400">No strategy was recorded for this match.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {verified.map((row) => (
              <li key={row.commitment} className="rounded-lg border border-neutral-800 p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-xs text-neutral-400">{row.playerWallet}</span>
                  <span
                    className={
                      row.matches
                        ? 'rounded border border-emerald-700/70 bg-emerald-950/40 px-2 py-0.5 text-[11px] text-emerald-300'
                        : 'rounded border border-red-700/70 bg-red-950/40 px-2 py-0.5 text-[11px] text-red-300'
                    }
                  >
                    {row.matches ? 'hash verified' : 'HASH MISMATCH'}
                  </span>
                </div>
                <dl className="mt-3 space-y-1.5 text-sm">
                  <Row label="Commitment" value={row.commitment} />
                  <Row label="Recomputed" value={row.recomputed} />
                  <Row label="Salt" value={row.salt} />
                  <Row label="Bytes" value={String(row.byteLength)} />
                </dl>
                <pre className="mt-3 whitespace-pre-wrap rounded bg-neutral-950 p-3 text-xs text-neutral-300">
                  {row.strategy}
                </pre>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-xl font-semibold">Agent transcript</h2>
        <p className="mt-1 text-sm text-neutral-400">
          Every turn, including the ones that failed. The worker sees both answers before submitting
          them on-chain — atomic submission stops third parties copying a prediction, not the worker
          itself. These hashes and request IDs are what make that trust checkable.
        </p>
        {turns.length === 0 ? (
          <p className="mt-4 text-sm text-neutral-400">No turns recorded yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {turns.map((turn) => {
              const recomputed = turn.sanitizedResponse
                ? createHash('sha256').update(turn.sanitizedResponse, 'utf8').digest('hex')
                : null;
              const intact = recomputed === null || recomputed === turn.responseHash;
              return (
                <li key={turn.id} className="rounded-lg border border-neutral-800 p-4">
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-neutral-400">
                      round {turn.round} · player {turn.playerIndex} · {turn.outcome}
                    </span>
                    {!intact ? (
                      <span className="rounded border border-red-700/70 bg-red-950/40 px-2 py-0.5 text-red-300">
                        RESPONSE HASH MISMATCH
                      </span>
                    ) : null}
                  </div>
                  <dl className="mt-3 space-y-1.5 text-sm">
                    <Row label="Prompt hash" value={turn.promptHash} />
                    <Row label="Response hash" value={turn.responseHash ?? '—'} />
                    <Row label="Request ID" value={turn.requestId ?? '—'} />
                    {turn.errorCode ? <Row label="Error" value={turn.errorCode} /> : null}
                  </dl>
                  {turn.sanitizedResponse ? (
                    <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-neutral-950 p-3 text-xs text-neutral-300">
                      {turn.sanitizedResponse}
                    </pre>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
