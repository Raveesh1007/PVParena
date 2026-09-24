'use client';

import { useAnchorWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { matchPda } from '@stock-arena/idl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { StrategyField, commitStrategy, strategyTooLong } from '@/components/strategy-field';
import {
  PrimaryButton,
  SecondaryButton,
  TransactionStatus,
  useTransaction,
} from '@/components/transaction-button';
import { Input } from '@/components/ui/input';
import { QUOTE_DECIMALS, formatAmount, minStake, parseAmount, strikeFor } from '@/lib/format';
import { type MatchTermsInput, arenaProgram, createMatchTx } from '@/lib/transactions';

export interface ArenaOption {
  arena: string;
  symbol: string;
  decimals: number;
}

/** Live mainnet price per whole token, already cut to quote decimals. Keyed by Arena. */
export type ReferencePrices = Record<
  string,
  { price: string; source: string; retrievedAt: string }
>;

function Field(props: { id: string; label: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label htmlFor={props.id} className="text-xs font-medium text-text-secondary">
        {props.label}
      </label>
      {props.children}
      <p className="text-xs text-text-muted">{props.hint}</p>
    </div>
  );
}

export function CreateMatchForm({
  own,
  options,
  referencePrices,
  benchmarkStale,
}: {
  own: ArenaOption;
  options: ArenaOption[];
  referencePrices: ReferencePrices;
  benchmarkStale: boolean;
}) {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const router = useRouter();
  const { status, run, busy } = useTransaction();
  const [form, setForm] = useState({
    opponentArena: own.arena,
    creatorStake: '1',
    challengerStake: '1',
    creatorPrice: referencePrices[own.arena]?.price ?? '',
    challengerPrice: referencePrices[own.arena]?.price ?? '',
    profile: 'demo' as MatchTermsInput['profile'],
  });
  const [strategy, setStrategy] = useState('');
  const [reviewing, setReviewing] = useState(false);

  const opponent = options.find((o) => o.arena === form.opponentArena) ?? own;
  const set = (key: keyof typeof form) => (value: string) => {
    setForm({
      ...form,
      [key]: value,
      // A new opponent token starts from its own mainnet price, not the previous token's.
      ...(key === 'opponentArena' ? { challengerPrice: referencePrices[value]?.price ?? '' } : {}),
    });
    setReviewing(false);
  };

  const terms = parseTerms(form, own, opponent);
  const problem =
    typeof terms === 'string'
      ? terms
      : !strategy.trim()
        ? 'Enter a strategy for your battle agent.'
        : strategyTooLong(strategy)
          ? 'Strategy is too long.'
          : null;

  if (!wallet) {
    return (
      <p className="text-[13px] text-text-secondary">Connect a wallet to create a challenge.</p>
    );
  }
  if (benchmarkStale) {
    return (
      <p className="text-[13px] text-warning">
        Benchmark stale — new matches are temporarily unavailable.
      </p>
    );
  }

  const create = () => {
    if (typeof terms === 'string') return;
    const creator = wallet.publicKey;
    const nonce = crypto.getRandomValues(new BigUint64Array(1))[0] ?? 0n;
    const pda = matchPda(creator, nonce);
    return run(
      async (step) => {
        step('Storing strategy commitment');
        const commitment = await commitStrategy(pda, creator, strategy);
        return createMatchTx(arenaProgram(connection, wallet), {
          creator,
          matchPda: pda,
          nonce,
          creatorArena: new PublicKey(own.arena),
          challengerArena: new PublicKey(opponent.arena),
          terms,
          commitment,
        });
      },
      () => router.push(`/match/${pda.toBase58()}`),
    );
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="creator-stake"
          label={`You deposit (${own.symbol})`}
          hint="Minimum 0.05. Devnet test copy."
        >
          <Input
            id="creator-stake"
            inputMode="decimal"
            value={form.creatorStake}
            disabled={busy}
            onChange={(e) => set('creatorStake')(e.target.value)}
          />
        </Field>
        <Field id="opponent-arena" label="Opponent deposits" hint="Any Arena on this benchmark.">
          <div className="flex gap-2">
            <Input
              id="challenger-stake"
              aria-label="Opponent stake amount"
              inputMode="decimal"
              value={form.challengerStake}
              disabled={busy}
              onChange={(e) => set('challengerStake')(e.target.value)}
            />
            <select
              id="opponent-arena"
              className="h-11 rounded-control border border-border-subtle bg-surface-1 px-2 text-sm text-text-primary focus:border-text-muted focus:outline-none sm:h-8"
              value={form.opponentArena}
              disabled={busy}
              onChange={(e) => set('opponentArena')(e.target.value)}
            >
              {options.map((option) => (
                <option key={option.arena} value={option.arena}>
                  {option.symbol}
                </option>
              ))}
            </select>
          </div>
        </Field>
        <PriceField
          id="creator-price"
          symbol={own.symbol}
          reference={referencePrices[own.arena]}
          value={form.creatorPrice}
          disabled={busy}
          onChange={set('creatorPrice')}
          strike={typeof terms === 'string' ? null : terms.creatorStrike}
          note="If your opponent wins, they may pay this strike to take your stake."
        />
        <PriceField
          id="challenger-price"
          symbol={opponent.symbol}
          reference={referencePrices[opponent.arena]}
          value={form.challengerPrice}
          disabled={busy}
          onChange={set('challengerPrice')}
          strike={typeof terms === 'string' ? null : terms.challengerStrike}
          note="If you win, you may pay this strike to take their stake."
        />
        <Field id="profile" label="Duration" hint="Three rounds either way.">
          <select
            id="profile"
            className="h-11 w-full rounded-control border border-border-subtle bg-surface-1 px-2 text-sm text-text-primary focus:border-text-muted focus:outline-none sm:h-8"
            value={form.profile}
            disabled={busy}
            onChange={(e) => set('profile')(e.target.value)}
          >
            <option value="demo">Demo · 9 minutes</option>
            <option value="standard">Standard · 15 minutes</option>
          </select>
        </Field>
      </div>

      <StrategyField value={strategy} onChange={setStrategy} disabled={busy} />

      {reviewing && typeof terms !== 'string' ? (
        <div className="space-y-3 rounded-surface bg-surface-2 p-4">
          <h3 className="text-sm font-semibold">Review terms — fixed once you sign</h3>
          <dl className="grid gap-x-6 gap-y-1 text-[13px] sm:grid-cols-2">
            <Term
              label="You deposit"
              value={`${formatAmount(terms.creatorStake.toString(), own.decimals)} ${own.symbol}`}
            />
            <Term
              label="Opponent deposits"
              value={`${formatAmount(terms.challengerStake.toString(), opponent.decimals)} ${opponent.symbol}`}
            />
            <Term
              label="Strike for your stake"
              value={`${formatAmount(terms.creatorStrike.toString(), QUOTE_DECIMALS)} USDC-DEV`}
            />
            <Term
              label="Strike for their stake"
              value={`${formatAmount(terms.challengerStrike.toString(), QUOTE_DECIMALS)} USDC-DEV`}
            />
            <Term label="Duration" value={terms.profile === 'demo' ? '9 minutes' : '15 minutes'} />
          </dl>
          <p className="text-xs text-text-secondary">
            Lower prediction error over three rounds wins. The winner takes back their own stake
            and, until the option expires, may pay the strike to take the loser&rsquo;s stake; after
            expiry the loser reclaims it. A tie or an oracle failure refunds both deposits.
          </p>
          <div className="flex gap-2">
            <PrimaryButton onClick={() => void create()} disabled={busy}>
              Create match
            </PrimaryButton>
            <SecondaryButton onClick={() => setReviewing(false)} disabled={busy}>
              Edit
            </SecondaryButton>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {problem ? <p className="text-[13px] text-text-secondary">{problem}</p> : null}
          <PrimaryButton onClick={() => setReviewing(true)} disabled={problem !== null}>
            Review terms
          </PrimaryButton>
        </div>
      )}
      <TransactionStatus status={status} />
    </div>
  );
}

function Term({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-text-secondary">{label}</dt>
      <dd className="font-mono tabular-nums">{value}</dd>
    </div>
  );
}

function parseTerms(
  form: {
    creatorStake: string;
    challengerStake: string;
    creatorPrice: string;
    challengerPrice: string;
    profile: MatchTermsInput['profile'];
  },
  own: ArenaOption,
  opponent: ArenaOption,
): MatchTermsInput | string {
  const creatorStake = parseAmount(form.creatorStake, own.decimals);
  const challengerStake = parseAmount(form.challengerStake, opponent.decimals);
  const creatorPrice = parseAmount(form.creatorPrice, QUOTE_DECIMALS);
  const challengerPrice = parseAmount(form.challengerPrice, QUOTE_DECIMALS);
  if (creatorStake === null || challengerStake === null) {
    return 'Stakes must be plain decimal amounts.';
  }
  if (creatorStake < minStake(own.decimals) || challengerStake < minStake(opponent.decimals)) {
    return 'Each stake must be at least 0.05 tokens.';
  }
  if (creatorPrice === null || challengerPrice === null) {
    return `Prices must be USDC-DEV amounts with at most ${QUOTE_DECIMALS} decimals.`;
  }
  const creatorStrike = strikeFor(creatorStake, own.decimals, creatorPrice);
  const challengerStrike = strikeFor(challengerStake, opponent.decimals, challengerPrice);
  if (creatorStrike === 0n || challengerStrike === 0n) {
    return 'Each strike must come to more than zero USDC-DEV.';
  }
  return { creatorStake, challengerStake, creatorStrike, challengerStrike, profile: form.profile };
}

function PriceField(props: {
  id: string;
  symbol: string;
  reference: ReferencePrices[string] | undefined;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  strike: bigint | null;
  note: string;
}) {
  return (
    <Field
      id={props.id}
      label={`Price per ${props.symbol} (USDC-DEV)`}
      hint={
        props.reference
          ? `${props.reference.source} mainnet price ${props.reference.price}, retrieved ${props.reference.retrievedAt.slice(11, 16)} UTC. Edit to set your own.`
          : `No mainnet price feed for ${props.symbol}; enter the price you want.`
      }
    >
      <Input
        id={props.id}
        inputMode="decimal"
        value={props.value}
        disabled={props.disabled}
        onChange={(e) => props.onChange(e.target.value)}
      />
      <p className="text-xs text-text-secondary">
        Strike{' '}
        <span className="font-mono tabular-nums text-text-primary">
          {props.strike === null
            ? '—'
            : `${formatAmount(props.strike.toString(), QUOTE_DECIMALS)} USDC-DEV`}
        </span>
        . {props.note}
      </p>
    </Field>
  );
}
