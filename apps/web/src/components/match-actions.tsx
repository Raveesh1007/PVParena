'use client';

import { useAnchorWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { useEffect, useState } from 'react';

import { StrategyField, commitStrategy, strategyTooLong } from '@/components/strategy-field';
import {
  PrimaryButton,
  SecondaryButton,
  TransactionStatus,
  useTransaction,
} from '@/components/transaction-button';
import { QUOTE_DECIMALS, formatAmount } from '@/lib/format';
import { PLAYER } from '@/lib/match-status';
import { type ActionInput, type PlayerAction, availableActions } from '@/lib/player-actions';
import {
  type MatchRef,
  arenaProgram,
  cancelTx,
  claimTx,
  exerciseTx,
  joinMatchTx,
  reclaimTx,
  refundTx,
} from '@/lib/transactions';

interface Stake {
  symbol: string;
  decimals: number;
  amount: string;
  strike: string;
}

export interface MatchActionsProps {
  match: ActionInput & MatchRef & { stakes: { creator: Stake; challenger: Stake } };
  benchmarkStale: boolean;
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

export function MatchActions({ match, benchmarkStale }: MatchActionsProps) {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const { status, run, busy } = useTransaction();
  const [strategy, setStrategy] = useState('');
  const [now, setNow] = useState(nowSeconds);

  // Deadlines pass while the page is open; re-derive which action is valid.
  useEffect(() => {
    const timer = setInterval(() => setNow(nowSeconds()), 5_000);
    return () => clearInterval(timer);
  }, []);

  if (!wallet) {
    return (
      <p className="text-[13px] text-text-secondary">
        Connect a wallet to join or act on this match.
      </p>
    );
  }

  const player = wallet.publicKey;
  const actions = availableActions(match, player.toBase58(), now);
  const program = () => arenaProgram(connection, wallet);
  const loserStake = match.winner === 'creator' ? match.stakes.challenger : match.stakes.creator;
  const ownStake =
    player.toBase58() === match.creator ? match.stakes.creator : match.stakes.challenger;
  const role =
    player.toBase58() === match.creator
      ? 'creator'
      : player.toBase58() === match.challenger
        ? 'challenger'
        : null;
  const identity = (
    <p className="text-[13px] text-text-secondary">
      {role
        ? `This wallet is ${PLAYER[role]}.`
        : 'This wallet is not a player in this match. You are watching.'}
    </p>
  );

  const act = (action: PlayerAction) => {
    const p = program();
    switch (action) {
      case 'cancel':
        return run(() => cancelTx(p, match, player));
      case 'refundTie':
        return run(() => refundTx(p, match, player, 'tie'));
      case 'refundFailed':
        return run(() => refundTx(p, match, player, 'failed'));
      case 'markOracleFailure':
        return run(() => refundTx(p, match, player, 'failed', true));
      case 'claim':
        return run(() => claimTx(p, match, player));
      case 'exercise':
        return run(() => exerciseTx(p, match, player));
      case 'reclaim':
        return run(() => reclaimTx(p, match, player));
      case 'join':
        return run(async (step) => {
          step('Storing strategy commitment');
          const commitment = await commitStrategy(new PublicKey(match.pda), player, strategy);
          return joinMatchTx(p, match, player, commitment);
        });
    }
  };

  if (actions.includes('join')) {
    const stake = match.stakes.challenger;
    return (
      <div className="space-y-4">
        <p className="text-sm text-text-secondary">
          You join as {PLAYER.challenger}. Joining deposits exactly{' '}
          <span className="font-mono text-text-primary">
            {formatAmount(stake.amount, stake.decimals)} {stake.symbol}
          </span>{' '}
          (devnet test copy). The terms below are fixed and cannot change after you sign.
        </p>
        <StrategyField value={strategy} onChange={setStrategy} disabled={busy} />
        {benchmarkStale ? (
          <p className="text-[13px] text-warning">
            Benchmark stale — joining is unavailable until it updates.
          </p>
        ) : null}
        <PrimaryButton
          onClick={() => act('join')}
          disabled={busy || benchmarkStale || !strategy.trim() || strategyTooLong(strategy)}
        >
          Join match
        </PrimaryButton>
        <TransactionStatus status={status} />
      </div>
    );
  }

  const labels: Record<Exclude<PlayerAction, 'join'>, { label: string; note: string }> = {
    cancel: {
      label: 'Cancel match',
      note: 'Waiting for opponent. Cancelling returns your deposit and closes the challenge.',
    },
    refundFailed: {
      label: 'Refund deposit',
      note: 'The match never activated, so each player takes back their own deposit.',
    },
    markOracleFailure: {
      label: 'Refund deposit',
      note: 'The settlement deadline passed without a valid benchmark update. Refunding marks the oracle failure and returns your deposit in one transaction.',
    },
    refundTie: {
      label: 'Refund deposit',
      note: 'Equal scores: each player takes back their own deposit.',
    },
    claim: {
      label: 'Claim your stake',
      note: `You won. Your own ${formatAmount(ownStake.amount, ownStake.decimals)} ${ownStake.symbol} is claimable at any time.`,
    },
    exercise: {
      label: 'Exercise option',
      note: `Pay ${formatAmount(loserStake.strike, QUOTE_DECIMALS)} USDC-DEV to take the loser's ${formatAmount(loserStake.amount, loserStake.decimals)} ${loserStake.symbol}. Available until the option expires.`,
    },
    reclaim: {
      label: 'Reclaim stake',
      note: 'The winner did not exercise before expiry, so your deposit is yours again.',
    },
  };

  if (actions.length === 0) {
    return (
      <div className="space-y-1">
        {identity}
        {role ? (
          <p className="text-[13px] text-text-secondary">
            Nothing to do right now. This page updates by itself.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {identity}
      {actions.map((action, index) => {
        const { label, note } = labels[action as Exclude<PlayerAction, 'join'>];
        const Button = index === 0 && action !== 'cancel' ? PrimaryButton : SecondaryButton;
        return (
          <div key={action} className="space-y-2">
            <p className="text-[13px] text-text-secondary">{note}</p>
            <Button onClick={() => act(action)} disabled={busy}>
              {label}
            </Button>
          </div>
        );
      })}
      <TransactionStatus status={status} />
    </div>
  );
}
