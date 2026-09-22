import { readFileSync } from 'node:fs';
import { z } from 'zod';

const mint = z.string().min(32).max(64);

const arenaEntrySchema = z
  .object({
    symbol: z.string().min(1),
    enabled: z.boolean(),
    note: z.string().optional(),
    /** Empty until a setup script resolves and verifies it. */
    mainnetMint: z.union([mint, z.literal('')]),
    devnetTestMint: z.union([mint, z.literal('')]),
  })
  .strict();

const benchmarkSchema = z
  .object({
    symbol: z.string(),
    coreFeedId: z.union([z.string().regex(/^(0x)?[0-9a-f]{64}$/i), z.literal('')]),
    exponent: z.number().int(),
    source: z.string(),
    dateResolved: z.string(),
  })
  .strict();

const registrySchema = z
  .object({
    $comment: z.array(z.string()).optional(),
    benchmark: benchmarkSchema,
    arenas: z.array(arenaEntrySchema).min(1),
  })
  .strict();

export type ArenaEntry = z.infer<typeof arenaEntrySchema>;
export type BenchmarkConfig = z.infer<typeof benchmarkSchema>;
export type ArenaRegistry = z.infer<typeof registrySchema>;

export function loadArenaRegistry(path: string): ArenaRegistry {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    throw new Error(`Could not read the Arena registry at ${path}: ${String(error)}`);
  }
  const parsed = registrySchema.safeParse(JSON.parse(text));
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
      .join('; ');
    throw new Error(`${path} is not a valid Arena registry: ${issues}`);
  }
  return parsed.data;
}

/**
 * The Arenas that are actually playable: enabled, and with both mints resolved.
 *
 * An entry that is enabled but still missing a mint is a configuration mistake, not something to
 * render as a half-working Arena — the picker would offer a match that `create_match` would reject.
 */
export function playableArenas(registry: ArenaRegistry): ArenaEntry[] {
  return registry.arenas.filter(
    (arena) => arena.enabled && arena.mainnetMint !== '' && arena.devnetTestMint !== '',
  );
}

/**
 * Throw unless the registry is complete enough to run matches. Called at worker startup so a
 * half-configured deployment fails immediately rather than at the first player's first click.
 */
export function assertRegistryReady(registry: ArenaRegistry): void {
  if (registry.benchmark.coreFeedId === '') {
    throw new Error(
      'benchmark.coreFeedId is empty. Resolve the 32-byte Pyth Core ID from the official ' +
        'catalogue and record it, with its source and date, in docs/integration-readiness.md. ' +
        'A Terminal identifier such as 1314 is not a Core ID. `code.md` §3.2.',
    );
  }
  const enabled = registry.arenas.filter((arena) => arena.enabled);
  const incomplete = enabled.filter(
    (arena) => arena.mainnetMint === '' || arena.devnetTestMint === '',
  );
  if (incomplete.length > 0) {
    throw new Error(
      `These Arenas are enabled but have unresolved mints: ${incomplete
        .map((a) => a.symbol)
        .join(', ')}. Run the setup scripts; never hand-write a mint into config/arenas.json.`,
    );
  }
  if (enabled.length === 0) {
    throw new Error('No Arena is enabled, so no match can be created.');
  }
}
