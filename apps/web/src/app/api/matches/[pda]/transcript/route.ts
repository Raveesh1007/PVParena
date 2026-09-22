import { loadMatch } from '@/lib/matches';
import { db, parsePubkey } from '@/lib/server';
import { transcriptFilters } from '@/lib/transcript';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ pda: string }> },
): Promise<Response> {
  const { pda } = await params;
  const key = parsePubkey(pda);
  if (!key) return Response.json({ error: 'Not a base58 address.' }, { status: 400 });

  const match = await loadMatch(key);
  if (!match) return Response.json({ error: 'No such match.' }, { status: 404 });

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

  return Response.json({
    matchPda: match.pda,
    state: match.state,
    strategiesRevealed: revealed,
    /** Everything needed to recompute each commitment: see `computeCommitment` in the shared
     *  package. The program only ever stored the 32 bytes. */
    strategies: strategies.map((row) => ({
      commitment: row.commitment,
      playerWallet: row.playerWallet,
      strategy: row.strategy,
      salt: row.salt,
      byteLength: row.byteLength,
    })),
    onChainCommitments: match.commitments,
    turns: turns.map((turn) => ({
      round: turn.round,
      playerIndex: turn.playerIndex,
      outcome: turn.outcome,
      errorCode: turn.errorCode,
      promptHash: turn.promptHash,
      responseHash: turn.responseHash,
      response: turn.sanitizedResponse,
      requestId: turn.requestId,
      recordedAt: turn.createdAt.toISOString(),
    })),
    /** The predictions as the program actually recorded them, for comparison against the turns
     *  above. A disagreement between the two is exactly what an auditor is looking for. */
    onChainRounds: match.rounds,
  });
}
