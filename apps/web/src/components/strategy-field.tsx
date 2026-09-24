'use client';

import type { PublicKey } from '@solana/web3.js';
import { MAX_STRATEGY_BYTES, STRATEGY_PRESETS } from '@stock-arena/shared/constants';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

const utf8Bytes = (text: string) => new TextEncoder().encode(text.trim()).length;

export const strategyTooLong = (text: string) => utf8Bytes(text) > MAX_STRATEGY_BYTES;

export function StrategyField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const bytes = utf8Bytes(value);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <label htmlFor="strategy" className="text-xs font-medium text-text-secondary">
          Strategy
        </label>
        <div className="flex flex-wrap gap-1">
          {STRATEGY_PRESETS.map((preset) => (
            <Button
              key={preset.name}
              type="button"
              variant="ghost"
              size="compact"
              disabled={disabled}
              onClick={() => onChange(preset.text)}
            >
              {preset.name}
            </Button>
          ))}
        </div>
      </div>
      <Textarea
        id="strategy"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        rows={4}
        placeholder="How should your battle agent read the benchmark?"
      />
      <p className="flex justify-between gap-4 text-xs text-text-muted">
        <span>
          Guides your battle agent. It stays private until the match activates, then is published
          with its salt so anyone can check it against the on-chain commitment.
        </span>
        <span
          className={`shrink-0 font-mono tabular-nums ${bytes > MAX_STRATEGY_BYTES ? 'text-danger' : ''}`}
        >
          {bytes}/{MAX_STRATEGY_BYTES} bytes
        </span>
      </p>
    </div>
  );
}

/**
 * Store the strategy and get back the commitment to sign. The salt is generated here, in the
 * browser; the server recomputes the commitment itself and stores the row write-once, so the proof
 * page can later show strategy, salt and hash for anyone to verify.
 */
export async function commitStrategy(
  matchPda: PublicKey,
  player: PublicKey,
  strategy: string,
): Promise<Uint8Array> {
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const response = await fetch('/api/strategies', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      matchPda: matchPda.toBase58(),
      playerWallet: player.toBase58(),
      strategy,
      salt: Array.from(salt, (b) => b.toString(16).padStart(2, '0')).join(''),
    }),
  });
  const body = (await response.json().catch(() => ({}))) as { commitment?: string; error?: string };
  if (!response.ok || !body.commitment) {
    throw new Error(body.error ?? `Strategy could not be stored (HTTP ${response.status}).`);
  }
  return Uint8Array.from(body.commitment.match(/../g) ?? [], (h) => parseInt(h, 16));
}
