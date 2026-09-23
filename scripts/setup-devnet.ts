// Creates the labelled devnet test copy of one PreStocks token and the USDC-DEV quote mint, funds
// both demo players, and writes the mints back to config. Re-runnable: existing mints are reused
// and balances are only topped up. `code.md` §3.1, §13 gates 1, 3 and 4.
//
//   SYMBOL=OPENAI AUTHORITY_KEYPAIR=<path> PLAYERS=<pubkeyA>,<pubkeyB> npx vite-node scripts/setup-devnet.ts
import { readFileSync, writeFileSync } from 'node:fs';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  ExtensionType,
  TOKEN_2022_PROGRAM_ID,
  TYPE_SIZE,
  LENGTH_SIZE,
  createInitializeMetadataPointerInstruction,
  createInitializeMintInstruction,
  getMint,
  getMintLen,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from '@solana/spl-token';
import { createInitializeInstruction, pack, type TokenMetadata } from '@solana/spl-token-metadata';
import { fetchPreStocks, findToken, loadArenaRegistry } from '@stock-arena/integrations';

const ENV_PATH = '.env';
const env = Object.fromEntries(
  readFileSync(ENV_PATH, 'utf8')
    .split(/\r?\n/)
    .filter((line) => /^[A-Z0-9_]+=/.test(line))
    .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1).trim()]),
);
const setting = (key: string, fallback?: string) => {
  const value = process.env[key] || env[key] || fallback;
  if (!value) throw new Error(`${key} is required.`);
  return value;
};

const symbol = setting('SYMBOL', 'OPENAI').toUpperCase();
const configPath = setting('ARENAS_CONFIG_PATH', 'config/arenas.json');
const authority = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(readFileSync(setting('AUTHORITY_KEYPAIR'), 'utf8'))),
);
const players = setting('PLAYERS')
  .split(',')
  .map((key) => new PublicKey(key.trim()));
const ASSET_UNITS = BigInt(setting('ASSET_UNITS_PER_PLAYER', '100'));
const QUOTE_UNITS = BigInt(setting('QUOTE_UNITS_PER_PLAYER', '100000'));
const QUOTE_DECIMALS = 6;

const devnet = new Connection(
  setting('SOLANA_RPC_URL', 'https://api.devnet.solana.com'),
  'confirmed',
);
const mainnet = new Connection(
  setting('SOLANA_MAINNET_RPC_URL', 'https://api.mainnet-beta.solana.com'),
  'confirmed',
);

async function main() {
  const snapshot = await fetchPreStocks({ url: setting('PRESTOCKS_API_URL') });
  const token = findToken(snapshot, symbol);
  if (!token) throw new Error(`PreStocks API has no ${symbol} record.`);
  const mainnetMint = new PublicKey(token.mainnetMint);
  const owner = (await mainnet.getAccountInfo(mainnetMint))?.owner;
  if (!owner) throw new Error(`Mainnet mint ${mainnetMint.toBase58()} not found.`);
  const real = await getMint(mainnet, mainnetMint, 'confirmed', owner);
  // The copy must share the real token program; create_arena's allowlist needs Token-2022 anyway.
  if (!owner.equals(TOKEN_2022_PROGRAM_ID)) {
    throw new Error(`${symbol} mainnet mint is owned by ${owner.toBase58()}, not Token-2022.`);
  }
  console.log(`PreStocks ${symbol}: ${mainnetMint.toBase58()}, ${real.decimals} decimals`);

  const registry = loadArenaRegistry(configPath);
  const arena = registry.arenas.find((entry) => entry.symbol === symbol);
  if (!arena) throw new Error(`${symbol} is not in ${configPath}.`);

  const assetMint = arena.devnetTestMint
    ? await reuse(arena.devnetTestMint, real.decimals)
    : await createLabelledMint(`${symbol} (devnet test copy)`, `${symbol}-DEV`, real.decimals);
  const quoteMint = env.QUOTE_ASSET_DEVNET_MINT
    ? await reuse(env.QUOTE_ASSET_DEVNET_MINT, QUOTE_DECIMALS)
    : await createLabelledMint('USDC-DEV (devnet test quote)', 'USDC-DEV', QUOTE_DECIMALS);

  for (const player of players) {
    await topUp(assetMint, player, ASSET_UNITS * 10n ** BigInt(real.decimals));
    await topUp(quoteMint, player, QUOTE_UNITS * 10n ** BigInt(QUOTE_DECIMALS));
  }

  const raw = JSON.parse(readFileSync(configPath, 'utf8'));
  const entry = raw.arenas.find((candidate: { symbol: string }) => candidate.symbol === symbol);
  entry.mainnetMint = mainnetMint.toBase58();
  entry.devnetTestMint = assetMint.toBase58();
  writeFileSync(configPath, `${JSON.stringify(raw, null, 2)}\n`);
  writeEnv('QUOTE_ASSET_DEVNET_MINT', quoteMint.toBase58());
  console.log(`Wrote ${configPath} and ${ENV_PATH}.`);
}

async function reuse(address: string, decimals: number): Promise<PublicKey> {
  const mint = new PublicKey(address);
  const info = await getMint(devnet, mint, 'confirmed', TOKEN_2022_PROGRAM_ID);
  if (info.decimals !== decimals || !info.mintAuthority?.equals(authority.publicKey)) {
    throw new Error(`${address} exists but has other decimals or another mint authority.`);
  }
  console.log(`Reusing ${address}`);
  return mint;
}

/** Token-2022 with MetadataPointer + TokenMetadata only: the allowlist `create_arena` enforces. */
async function createLabelledMint(name: string, ticker: string, decimals: number) {
  const mint = Keypair.generate();
  const metadata: TokenMetadata = {
    mint: mint.publicKey,
    name,
    symbol: ticker,
    uri: '',
    additionalMetadata: [],
  };
  const mintLen = getMintLen([ExtensionType.MetadataPointer]);
  // Metadata is written after InitializeMint and reallocs, so fund its rent up front.
  const lamports = await devnet.getMinimumBalanceForRentExemption(
    mintLen + TYPE_SIZE + LENGTH_SIZE + pack(metadata).length,
  );
  const transaction = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: authority.publicKey,
      newAccountPubkey: mint.publicKey,
      space: mintLen,
      lamports,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeMetadataPointerInstruction(
      mint.publicKey,
      authority.publicKey,
      mint.publicKey,
      TOKEN_2022_PROGRAM_ID,
    ),
    createInitializeMintInstruction(
      mint.publicKey,
      decimals,
      authority.publicKey,
      null,
      TOKEN_2022_PROGRAM_ID,
    ),
    createInitializeInstruction({
      programId: TOKEN_2022_PROGRAM_ID,
      metadata: mint.publicKey,
      updateAuthority: authority.publicKey,
      mint: mint.publicKey,
      mintAuthority: authority.publicKey,
      name,
      symbol: ticker,
      uri: '',
    }),
  );
  const signature = await sendAndConfirmTransaction(devnet, transaction, [authority, mint]);
  console.log(`Created ${name}: ${mint.publicKey.toBase58()} (${signature})`);
  return mint.publicKey;
}

async function topUp(mint: PublicKey, owner: PublicKey, target: bigint) {
  const account = await getOrCreateAssociatedTokenAccount(
    devnet,
    authority,
    mint,
    owner,
    false,
    'confirmed',
    undefined,
    TOKEN_2022_PROGRAM_ID,
  );
  if (account.amount >= target) return;
  await mintTo(
    devnet,
    authority,
    mint,
    account.address,
    authority,
    target - account.amount,
    [],
    undefined,
    TOKEN_2022_PROGRAM_ID,
  );
  console.log(`Minted ${mint.toBase58().slice(0, 6)}… to ${owner.toBase58()} up to ${target}`);
}

function writeEnv(key: string, value: string) {
  const text = readFileSync(ENV_PATH, 'utf8');
  const line = new RegExp(`^${key}=.*$`, 'm');
  writeFileSync(
    ENV_PATH,
    line.test(text) ? text.replace(line, `${key}=${value}`) : `${text}\n${key}=${value}\n`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
