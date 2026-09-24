'use client';

import { BorderBeam } from 'border-beam';
import type { ReactNode } from 'react';

import { useTheme } from '@/components/theme-toggle';

/**
 * The one card border treatment (DESIGN.md): a thin mono beam at low strength, so it frames a card
 * without competing with its text. The library already stops under prefers-reduced-motion.
 */
export function Beam({ children }: { children: ReactNode }) {
  return (
    <BorderBeam
      size="line"
      colorVariant="mono"
      strength={0.35}
      duration={6}
      theme={useTheme()}
      className="h-full [&>*]:h-full"
    >
      {children}
    </BorderBeam>
  );
}
