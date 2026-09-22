import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './globals.css';
import { Disclosure } from '@/components/disclosure';

export const metadata: Metadata = {
  title: 'Stock Arena',
  description:
    'Two-player PvP market prediction on Solana devnet. PreStocks the asset, ClawPump the ' +
    'fighters, Pyth the benchmark.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-neutral-950 text-neutral-100">
        <header className="border-b border-neutral-800">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
            <a href="/" className="text-lg font-semibold tracking-tight">
              Stock Arena
            </a>
            {/* Never ambiguous about which network the escrow is on. `code.md` §11. */}
            <span className="rounded border border-amber-600/60 bg-amber-950/40 px-2 py-1 text-xs font-medium text-amber-300">
              devnet
            </span>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
        <Disclosure />
      </body>
    </html>
  );
}
