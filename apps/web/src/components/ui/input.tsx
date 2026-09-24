import * as React from 'react';

import { cn } from '@/lib/utils';

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        'h-11 w-full rounded-control border border-border-subtle bg-surface-1 px-2 font-mono text-sm tabular-nums text-text-primary placeholder:text-text-muted focus:border-text-muted focus:outline-none disabled:opacity-60 sm:h-8',
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export { Input };
