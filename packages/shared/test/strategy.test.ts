import { describe, expect, it } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import {
  MAX_STRATEGY_BYTES,
  commitmentMatches,
  computeCommitment,
  generateSalt,
  normalizeStrategy,
} from '../src/index.js';

const MATCH = new PublicKey('11111111111111111111111111111111');
const OTHER_MATCH = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const PLAYER = new PublicKey('SysvarC1ock11111111111111111111111111111111');
const OTHER_PLAYER = new PublicKey('SysvarRent111111111111111111111111111111111');
const SALT = Buffer.alloc(32, 7);

describe('normalizeStrategy', () => {
  it('applies NFKC, folds CRLF and trims', () => {
    expect(normalizeStrategy('  \r\nﬁrst\r\nline  ')).toBe('first\nline');
  });

  it('rejects empty and whitespace-only input', () => {
    expect(() => normalizeStrategy('   \r\n  ')).toThrow(/must not be empty/i);
  });

  it('bounds length in UTF-8 bytes, not code units', () => {
    const multibyte = 'é'.repeat(MAX_STRATEGY_BYTES / 2);
    expect(Buffer.byteLength(multibyte, 'utf8')).toBe(MAX_STRATEGY_BYTES);
    expect(normalizeStrategy(multibyte)).toBe(multibyte);
    expect(() => normalizeStrategy(multibyte + 'é')).toThrow(/502 UTF-8 bytes/);
  });
});

describe('computeCommitment', () => {
  const base = { matchPda: MATCH, player: PLAYER, salt: SALT, strategy: 'Momentum rider' };

  it('is deterministic and 32 bytes', () => {
    const a = computeCommitment(base);
    const b = computeCommitment(base);
    expect(a.commitment).toHaveLength(32);
    expect(commitmentMatches(a.commitment, b.commitment)).toBe(true);
  });

  it('normalizes before hashing, so equivalent text commits identically', () => {
    const padded = computeCommitment({ ...base, strategy: '  Momentum rider\r\n' });
    expect(padded.normalizedStrategy).toBe('Momentum rider');
    expect(commitmentMatches(padded.commitment, computeCommitment(base).commitment)).toBe(true);
  });

  it.each([
    ['salt', { salt: Buffer.alloc(32, 8) }],
    ['match', { matchPda: OTHER_MATCH }],
    ['player', { player: OTHER_PLAYER }],
    ['strategy', { strategy: 'Mean reverter' }],
  ])('is bound to the %s', (_label, override) => {
    const changed = computeCommitment({ ...base, ...override });
    expect(commitmentMatches(changed.commitment, computeCommitment(base).commitment)).toBe(false);
  });

  // Locked fixture. This digest is the whole compatibility contract for a published commitment:
  // if it changes, every strategy already committed on-chain becomes unverifiable on the proof page.
  it('matches the locked v1 fixture', () => {
    expect(computeCommitment(base).commitment.toString('hex')).toBe(
      '2d0e1df99319fd67674d1a26d90929eef1a20e8fbbebc9cbcbe94cb6dd7d7960',
    );
  });

  it('requires a 32-byte salt', () => {
    expect(() => computeCommitment({ ...base, salt: Buffer.alloc(31) })).toThrow(
      /exactly 32 bytes/,
    );
  });

  it('generates 32-byte salts', () => {
    expect(generateSalt()).toHaveLength(32);
  });
});
