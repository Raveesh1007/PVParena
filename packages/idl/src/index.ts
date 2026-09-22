import { PublicKey } from '@solana/web3.js';

import idlJson from './generated/stock_arena.json' with { type: 'json' };
import type { StockArena } from './generated/stock_arena.js';

export type { StockArena };

/** The IDL exactly as `anchor build` generated it. Instruction names are snake_case here; Anchor's
 *  `Program` converts them to camelCase for the client. */
export const IDL = idlJson as StockArena;

export const PROGRAM_ID = new PublicKey(IDL.address);

const seed = (text: string) => Buffer.from(text, 'utf8');

/** `[b"config"]` — one global ProtocolConfig. Pause is therefore global too. `code.md` §2. */
export function configPda(programId: PublicKey = PROGRAM_ID): PublicKey {
  return PublicKey.findProgramAddressSync([seed('config')], programId)[0];
}

/**
 * `[b"arena", asset_mint, benchmark_feed_id]`.
 *
 * Keyed by the feed as well as the mint so one collateral token can host several Arenas that
 * differ only in which stock the agents predict. `code.md` §7.1.
 */
export function arenaPda(
  assetMint: PublicKey,
  benchmarkFeedId: Uint8Array,
  programId: PublicKey = PROGRAM_ID,
): PublicKey {
  if (benchmarkFeedId.length !== 32) {
    throw new Error(
      `benchmarkFeedId must be the 32-byte Pyth Core ID, got ${benchmarkFeedId.length} bytes. ` +
        'A Terminal/Lazer identifier such as 1314 is not a Core ID.',
    );
  }
  return PublicKey.findProgramAddressSync(
    [seed('arena'), assetMint.toBuffer(), Buffer.from(benchmarkFeedId)],
    programId,
  )[0];
}

/** `[b"match", creator, match_nonce_le]`. */
export function matchPda(
  creator: PublicKey,
  matchNonce: bigint,
  programId: PublicKey = PROGRAM_ID,
): PublicKey {
  const nonce = Buffer.alloc(8);
  nonce.writeBigUInt64LE(matchNonce);
  return PublicKey.findProgramAddressSync([seed('match'), creator.toBuffer(), nonce], programId)[0];
}

/** Parse a 32-byte Pyth Core feed ID from its hex form, with or without the `0x` prefix. */
export function parseFeedId(hex: string): Uint8Array {
  const body = hex.startsWith('0x') || hex.startsWith('0X') ? hex.slice(2) : hex;
  if (!/^[0-9a-fA-F]{64}$/.test(body)) {
    throw new Error(
      `Expected a 64-character hex Pyth Core feed ID, got "${hex}". ` +
        'Terminal identifiers such as 1314 (NVDA) or 922 (AAPL) are Pro/Lazer IDs and are not ' +
        'usable here. `code.md` §3.2.',
    );
  }
  return Uint8Array.from(Buffer.from(body, 'hex'));
}

export const feedIdToHex = (feedId: Uint8Array): string =>
  `0x${Buffer.from(feedId).toString('hex')}`;
