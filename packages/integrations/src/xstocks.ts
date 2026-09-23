import { z } from 'zod';

import { fetchJson } from './http.js';

export const XSTOCKS_API_URL = 'https://api.backed.fi/api/v1/token';

const tokenSchema = z
  .object({
    symbol: z.string().min(1),
    name: z.string().min(1),
    deployments: z.array(z.object({ network: z.string(), address: z.string() }).passthrough()),
  })
  .passthrough();

const responseSchema = z.union([z.array(tokenSchema), z.object({ nodes: z.array(tokenSchema) })]);

export interface XStockToken {
  name: string;
  symbol: string;
  /** Must still be verified over mainnet RPC before use, like any issuer-reported mint. */
  mainnetMint: string;
}

/** The Solana mint the issuer (Backed Finance) publishes for an xStock such as `AAPLx`. */
export async function fetchXStock(
  symbol: string,
  options: { url?: string; timeoutMs?: number } = {},
): Promise<XStockToken | undefined> {
  const raw = await fetchJson({
    provider: 'xstocks',
    url: options.url ?? XSTOCKS_API_URL,
    schema: responseSchema,
    retries: 2,
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
  });
  return solanaMint(Array.isArray(raw) ? raw : raw.nodes, symbol);
}

export function solanaMint(
  tokens: z.infer<typeof tokenSchema>[],
  symbol: string,
): XStockToken | undefined {
  const wanted = symbol.toUpperCase();
  const token = tokens.find((candidate) => candidate.symbol.toUpperCase() === wanted);
  const deployment = token?.deployments.find((d) => d.network === 'Solana');
  if (!token || !deployment) return undefined;
  // Backed prefixes Solana addresses with the `svm:` namespace.
  const mainnetMint = deployment.address.replace(/^svm:/, '');
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mainnetMint)) return undefined;
  return { name: token.name, symbol: token.symbol, mainnetMint };
}
