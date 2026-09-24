import { describe, expect, it } from 'vitest';

import { toMainnetPrices } from '../src/jupiter.js';

describe('toMainnetPrices', () => {
  it('keeps prices as strings and skips mints Jupiter cannot price', () => {
    expect(
      toMainnetPrices({
        XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp: {
          usdPrice: '335.69930721397805',
          liquidity: '570015.092673367',
          stockData: { price: '336.86' },
        },
        Unpriced111111111111111111111111111111111111: null,
      }),
    ).toEqual({
      XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp: {
        usdPrice: '335.69930721397805',
        liquidity: '570015.092673367',
        referencePrice: '336.86',
      },
    });
  });
});
