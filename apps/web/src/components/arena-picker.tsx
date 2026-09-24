'use client';

import { useWallet } from '@solana/wallet-adapter-react';
import { useEffect, useState } from 'react';

import { formatAmount } from '@/lib/format';
import { Beam } from '@/components/beam';

interface ArenaSummary {
  symbol: string;
  note?: string | undefined;
  devnetTestMint: string;
}
interface Holding {
  symbol: string;
  amount: string;
  decimals: number;
}

export function ArenaPicker({ arenas }: { arenas: ArenaSummary[] }) {
  const { publicKey } = useWallet();
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [message, setMessage] = useState('Connect a wallet to check read-only mainnet holdings.');

  useEffect(() => {
    if (!publicKey) {
      setHoldings([]);
      setMessage('Connect a wallet to check read-only mainnet holdings.');
      return;
    }
    const controller = new AbortController();
    setMessage('Checking mainnet reference holdings…');
    fetch(`/api/holdings/${publicKey.toBase58()}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Mainnet holdings unavailable.');
        return response.json() as Promise<{ holdings: Holding[] }>;
      })
      .then((result) => {
        setHoldings(result.holdings);
        setMessage('Mainnet holdings are read-only references. Matches use devnet test copies.');
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setHoldings([]);
        setMessage(error instanceof Error ? error.message : 'Mainnet holdings unavailable.');
      });
    return () => controller.abort();
  }, [publicKey]);

  return (
    <>
      <p role="status" className="text-xs text-text-secondary">
        {message}
      </p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {arenas.map((arena) => {
          const holding = holdings.find((item) => item.symbol === arena.symbol);
          return (
            <li key={arena.symbol}>
              <Beam>
                <a
                  href={`/arena/${arena.symbol}`}
                  className="block rounded-surface border border-border-subtle bg-surface-1 p-4 transition-colors hover:border-accent/50 hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-display text-2xl">{arena.symbol}</span>
                    {holding ? (
                      <span className="rounded-control bg-surface-3 px-2 py-1 text-xs text-info">
                        Mainnet reference holding · {formatAmount(holding.amount, holding.decimals)}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 font-mono text-xs text-warning">
                    Devnet test copy · {arena.devnetTestMint.slice(0, 8)}…
                  </div>
                  {arena.note ? (
                    <div className="mt-2 text-xs text-text-secondary">{arena.note}</div>
                  ) : null}
                </a>
              </Beam>
            </li>
          );
        })}
      </ul>
    </>
  );
}
