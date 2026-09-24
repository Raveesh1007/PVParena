'use client';

import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import type { Transaction } from '@solana/web3.js';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { explorerTx } from '@/lib/format';
import { TransactionRejected, simulateAndSend } from '@/lib/transactions';

type Status =
  | { kind: 'idle' }
  | { kind: 'pending'; step: string }
  | { kind: 'confirmed'; signature: string }
  | { kind: 'failed'; message: string };

export function useTransaction() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const router = useRouter();
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  /** `build` may do its own async preparation (for example storing a strategy) before signing. */
  async function run(
    build: (step: (label: string) => void) => Promise<Transaction>,
    onConfirmed?: () => void,
  ) {
    if (!publicKey || status.kind === 'pending') return;
    try {
      setStatus({ kind: 'pending', step: 'Preparing transaction' });
      const tx = await build((step) => setStatus({ kind: 'pending', step }));
      setStatus({ kind: 'pending', step: 'Waiting for wallet signature' });
      const signature = await simulateAndSend(connection, tx, publicKey, sendTransaction);
      setStatus({ kind: 'confirmed', signature });
      if (onConfirmed) onConfirmed();
      else router.refresh();
    } catch (error) {
      setStatus({ kind: 'failed', message: failure(error) });
    }
  }

  return { status, run, busy: status.kind === 'pending' };
}

function failure(error: unknown): string {
  if (error instanceof TransactionRejected) return error.message;
  const message = error instanceof Error ? error.message : String(error);
  if (/reject|denied|cancel/i.test(message)) return 'Signature request rejected in the wallet.';
  return message.length > 160 ? `${message.slice(0, 160)}…` : message;
}

export function TransactionStatus({ status }: { status: Status }) {
  if (status.kind === 'idle') return null;
  if (status.kind === 'pending') {
    return (
      <p role="status" className="text-[13px] text-text-secondary">
        {status.step}…
      </p>
    );
  }
  if (status.kind === 'confirmed') {
    return (
      <p role="status" className="text-[13px] text-text-secondary">
        Transaction confirmed ·{' '}
        <a
          href={explorerTx(status.signature)}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-text-primary underline underline-offset-2"
        >
          {status.signature.slice(0, 8)}…
        </a>
      </p>
    );
  }
  return (
    <p role="alert" className="text-[13px] text-danger">
      Transaction failed: {status.message}
    </p>
  );
}

export function PrimaryButton(props: {
  onClick: () => void;
  disabled?: boolean;
  children: string;
}) {
  return (
    <Button type="button" size="prominent" onClick={props.onClick} disabled={props.disabled}>
      {props.children}
    </Button>
  );
}

export function SecondaryButton(props: {
  onClick: () => void;
  disabled?: boolean;
  children: string;
}) {
  return (
    <Button type="button" variant="secondary" onClick={props.onClick} disabled={props.disabled}>
      {props.children}
    </Button>
  );
}
