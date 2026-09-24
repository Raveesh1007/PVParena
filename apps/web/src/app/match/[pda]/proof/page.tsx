import { createHash } from 'node:crypto';
import { notFound } from 'next/navigation';
import { PublicKey } from '@solana/web3.js';
import { PROGRAM_ID } from '@stock-arena/idl';
import { STRATEGY_DOMAIN, computeCommitment } from '@stock-arena/shared';

import { Row } from '@/components/cards';
import { explorerTx, formatPrice, stamp } from '@/lib/format';
import { loadMatch } from '@/lib/matches';
import { arenaRegistry, db, parsePubkey } from '@/lib/server';
import { transcriptFilters } from '@/lib/transcript';
import { Beam } from '@/components/beam';

export const dynamic = 'force-dynamic';

export default async function ProofPage({ params }: { params: Promise<{ pda: string }> }) {
  const { pda } = await params;
  const key = parsePubkey(pda);
  if (!key) notFound();

  const match = await loadMatch(key);
  if (!match) notFound();

  const revealed = match.deadlines.start > 0;
  const filters = transcriptFilters(match);
  const [turns, strategies, agents, projection] = await Promise.all([
    db().agentTurn.findMany({
      where: filters.turns,
      orderBy: [{ round: 'asc' }, { playerIndex: 'asc' }],
    }),
    revealed
      ? db().strategyCommitment.findMany({ where: filters.strategies })
      : Promise.resolve([]),
    revealed
      ? db().battleAgent.findMany({
          where: { playerWallet: { in: [match.creator, match.challenger ?? ''] } },
        })
      : Promise.resolve([]),
    db().matchProjection.findUnique({ where: { matchPda: match.pda } }),
  ]);
  const registry = arenaRegistry();
  const signatures =
    projection?.signatures &&
    typeof projection.signatures === 'object' &&
    !Array.isArray(projection.signatures)
      ? Object.entries(projection.signatures).filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string',
        )
      : [];

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
    <div className="mx-auto max-w-4xl space-y-8">
      <header>
        <h1 className="title-page">Proof</h1>
        <p className="mt-1 break-all font-mono text-xs text-text-muted">{match.pda}</p>
      </header>

      <Beam>
        <section className="rounded-surface border border-border-subtle bg-surface-1 p-4">
          <h2 className="eyebrow">On-chain record</h2>
          <dl className="mt-3 space-y-1.5 text-sm">
            <Row label="Program ID" value={PROGRAM_ID.toBase58()} />
            <Row label="Cluster" value="devnet" />
            <Row label="Arena" value={match.arena} />
            <Row label="State" value={match.state} />
            <Row label="Winner" value={match.winner} />
          </dl>
          <a
            href={`https://explorer.solana.com/address/${match.pda}?cluster=devnet`}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-block text-sm text-info underline underline-offset-2"
          >
            View match account ↗
          </a>
        </section>
      </Beam>

      <Beam>
        <section className="rounded-surface border border-border-subtle bg-surface-1 p-4">
          <h2 className="title-section">Assets and benchmark</h2>
          <dl className="mt-3 space-y-2 text-sm">
            {(['creator', 'challenger'] as const).map((side) => {
              const stake = match.stakes[side];
              const entry = registry.arenas.find(
                (arena) => arena.devnetTestMint && arena.symbol === stake.symbol,
              );
              return (
                <div
                  key={side}
                  className="border-t border-border-subtle pt-2 first:border-0 first:pt-0"
                >
                  <Row
                    label={`${side} · devnet test copy`}
                    value={`${stake.symbol} · ${entry?.devnetTestMint ?? 'mint unavailable'}`}
                  />
                  <Row
                    label={`${side} · mainnet reference`}
                    value={entry?.mainnetMint ?? 'unavailable'}
                  />
                </div>
              );
            })}
            <Row label="Pyth benchmark" value={registry.benchmark.symbol} />
            <Row label="Core feed ID" value={registry.benchmark.coreFeedId} />
            <Row
              label="Start · on-chain"
              value={
                match.startObservation
                  ? `${formatPrice(match.startObservation.price, match.startObservation.exponent)} · ${stamp(match.startObservation.publishTime)} UTC`
                  : 'Pending'
              }
            />
            <Row
              label="Final · on-chain"
              value={
                match.finalObservation
                  ? `${formatPrice(match.finalObservation.price, match.finalObservation.exponent)} · ${stamp(match.finalObservation.publishTime)} UTC`
                  : 'Pending'
              }
            />
          </dl>
        </section>
      </Beam>

      <Beam>
        <section className="rounded-surface border border-border-subtle bg-surface-1 p-4">
          <h2 className="title-section">Transaction evidence</h2>
          {signatures.length === 0 ? (
            <p className="mt-2 text-sm text-text-secondary">
              Posting, round, and settlement signatures have not been recorded in the audit
              projection yet. The match account above shows the on-chain state.
            </p>
          ) : (
            <dl className="mt-3 space-y-2 text-sm">
              {signatures.map(([step, signature]) => (
                <Row
                  key={step}
                  label={step}
                  value={
                    <a
                      href={explorerTx(signature)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-info underline underline-offset-2"
                    >
                      {signature}
                    </a>
                  }
                />
              ))}
            </dl>
          )}
        </section>
      </Beam>

      <Beam>
        <section className="rounded-surface border border-border-subtle bg-surface-1 p-4">
          <h2 className="title-section">Battle agents</h2>
          {!revealed ? (
            <p className="mt-2 text-sm text-text-secondary">
              Agent identities appear after activation.
            </p>
          ) : agents.length === 0 ? (
            <p className="mt-2 text-sm text-text-secondary">No battle agents recorded yet.</p>
          ) : (
            <dl className="mt-3 space-y-3 text-sm">
              {agents.map((agent) => (
                <div
                  key={agent.agentId}
                  className="border-t border-border-subtle pt-2 first:border-0 first:pt-0"
                >
                  <Row label="Player" value={agent.playerWallet} />
                  <Row label="Agent ID" value={agent.agentId} />
                  <Row label="Agent wallet · mainnet" value={agent.agentWallet} />
                  <Row label="Configured model" value={agent.model} />
                  <Row label="Preset" value={agent.preset} />
                  <Row
                    label="Wallet check"
                    value={
                      agent.lastZeroBalanceCheck
                        ? `Empty at ${agent.lastZeroBalanceCheck.toISOString()} · historical check`
                        : 'No verified empty-wallet check recorded'
                    }
                  />
                </div>
              ))}
            </dl>
          )}
        </section>
      </Beam>

      <section>
        <h2 className="title-section">Strategy commitments</h2>
        <p className="mt-1 text-sm text-text-secondary">
          <code className="text-xs">
            sha256(&quot;{STRATEGY_DOMAIN}&quot; || match_pda || player || salt_32 || strategy)
          </code>
          . The program stores only the 32 bytes and never recomputes them; the signed transaction
          is what binds a commitment to its player.
        </p>
        {!revealed ? (
          <p className="mt-4 rounded-control bg-surface-1 px-3 py-4 text-sm text-text-secondary">
            Strategies are revealed when the match activates. Publishing one earlier would let an
            opponent read it before committing their own.
          </p>
        ) : verified.length === 0 ? (
          <p className="mt-4 text-sm text-text-secondary">
            No strategy was recorded for this match.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {verified.map((row) => (
              <li key={row.commitment}>
                <Beam>
                  <div className="rounded-surface border border-border-subtle bg-surface-1 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className="break-all font-mono text-xs text-text-secondary">
                        {row.playerWallet}
                      </span>
                      <span
                        className={
                          row.matches
                            ? 'rounded-control bg-surface-3 px-2 py-0.5 text-xs text-accent'
                            : 'rounded-control bg-surface-3 px-2 py-0.5 text-xs text-danger'
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
                    <pre className="mt-3 whitespace-pre-wrap break-all rounded-control bg-canvas p-3 text-xs text-text-secondary">
                      {row.strategy}
                    </pre>
                  </div>
                </Beam>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="title-section">Agent transcript</h2>
        <p className="mt-1 text-sm text-text-secondary">
          Every turn, including the ones that failed. The worker sees both answers before submitting
          them on-chain — atomic submission stops third parties copying a prediction, not the worker
          itself. These hashes and request IDs are what make that trust checkable.
        </p>
        {turns.length === 0 ? (
          <p className="mt-4 text-sm text-text-secondary">No turns recorded yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {turns.map((turn) => {
              const recomputed = turn.sanitizedResponse
                ? createHash('sha256').update(turn.sanitizedResponse, 'utf8').digest('hex')
                : null;
              const intact = recomputed === null || recomputed === turn.responseHash;
              return (
                <li key={turn.id}>
                  <Beam>
                    <div className="rounded-surface border border-border-subtle bg-surface-1 p-4">
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <span className="text-text-secondary">
                          round {turn.round + 1} ·{' '}
                          {turn.playerIndex === 0 ? 'creator' : 'challenger'} · {turn.outcome}
                        </span>
                        {!intact ? (
                          <span className="rounded-control bg-surface-3 px-2 py-0.5 text-danger">
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
                        <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-control bg-canvas p-3 text-xs text-text-secondary">
                          {turn.sanitizedResponse}
                        </pre>
                      ) : null}
                    </div>
                  </Beam>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
