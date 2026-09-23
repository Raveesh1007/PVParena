import { describe, expect, it } from 'vitest';

import { solanaMint } from '../src/xstocks.js';

const tokens = [
  {
    symbol: 'AAPLx',
    name: 'Apple xStock',
    deployments: [
      { network: 'Ethereum', address: 'eip155:1:0x9d275685dc284c8eb1c79f6aba7a63dc75ec890a' },
      { network: 'Solana', address: 'svm:XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp' },
    ],
  },
  { symbol: 'EVMONLYx', name: 'No Solana', deployments: [{ network: 'Ethereum', address: '0x1' }] },
  { symbol: 'BADx', name: 'Bad', deployments: [{ network: 'Solana', address: 'svm:0OIl' }] },
];

describe('solanaMint', () => {
  it('strips the svm: namespace and matches the symbol case-insensitively', () => {
    expect(solanaMint(tokens, 'aaplx')).toEqual({
      name: 'Apple xStock',
      symbol: 'AAPLx',
      mainnetMint: 'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp',
    });
  });

  it('returns nothing for a token with no Solana deployment or an invalid address', () => {
    expect(solanaMint(tokens, 'EVMONLYx')).toBeUndefined();
    expect(solanaMint(tokens, 'BADx')).toBeUndefined();
    expect(solanaMint(tokens, 'MISSING')).toBeUndefined();
  });
});
