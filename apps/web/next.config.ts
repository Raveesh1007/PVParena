import { resolve } from 'node:path';
import type { NextConfig } from 'next';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants';

/**
 * The web app never runs the orchestrator: no route here posts a Pyth update, spends ClawPump
 * credit, or signs with the orchestrator key. Those live in apps/worker. `code.md` §9.
 */
const config = (phase: string): NextConfig => ({
  reactStrictMode: true,
  distDir: phase === PHASE_DEVELOPMENT_SERVER ? '.next-dev' : '.next',
  // The workspace packages ship TypeScript sources compiled to dist/; Next needs to transpile
  // them because they are not published builds.
  transpilePackages: ['@stock-arena/shared', '@stock-arena/idl', '@stock-arena/integrations'],
  outputFileTracingRoot: resolve(__dirname, '../..'),
});

export default config;
