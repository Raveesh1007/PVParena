import { loadMatch } from '@/lib/matches';
import { parsePubkey } from '@/lib/server';

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
  return Response.json(match);
}
