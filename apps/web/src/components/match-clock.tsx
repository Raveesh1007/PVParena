'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export function MatchClock({ deadline, label }: { deadline: number; label: string }) {
  const router = useRouter();
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1_000);
    const refresh = setInterval(() => router.refresh(), 15_000);
    return () => {
      clearInterval(timer);
      clearInterval(refresh);
    };
  }, [router]);

  const remaining = Math.max(0, deadline - now);
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  return (
    <span className="font-mono tabular-nums" role="timer" aria-label={label}>
      {remaining === 0
        ? '00:00'
        : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`}
    </span>
  );
}
