import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Geist_Mono, Inter, Newsreader } from 'next/font/google';

import './globals.css';
import { Disclosure } from '@/components/disclosure';
import { ThemeToggle, themeScript } from '@/components/theme-toggle';
import { ConnectButton, WalletProviders } from '@/components/wallet';

export const metadata: Metadata = {
  title: 'Stock Arena',
  description:
    'Two-player PvP market prediction on Solana devnet. PreStocks the asset, ClawPump the ' +
    'fighters, Pyth the benchmark.',
};

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const newsreader = Newsreader({
  subsets: ['latin'],
  variable: '--font-newsreader',
  display: 'swap',
});
const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
  display: 'swap',
});

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body
        className={`${inter.variable} ${newsreader.variable} ${geistMono.variable} min-h-screen bg-canvas text-text-primary`}
      >
        <WalletProviders>
          <header className="sticky top-0 z-10 border-b border-border-subtle bg-canvas/80 backdrop-blur">
            <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
              <a href="/" className="font-display text-xl tracking-tight">
                Stock Arena
              </a>
              <div className="flex items-center gap-3">
                {/* Never ambiguous about which network the escrow is on. `code.md` §11. */}
                <span className="eyebrow text-warning">Solana devnet</span>
                <ThemeToggle />
                <ConnectButton />
              </div>
            </div>
          </header>
          <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
          <Disclosure />
        </WalletProviders>
      </body>
    </html>
  );
}
