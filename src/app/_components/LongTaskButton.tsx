'use client';

import { useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';

/**
 * Submit button that ticks a live elapsed-seconds counter while the parent
 * `<form>`'s server action is pending.  Uses the standard `useFormStatus()`
 * hook, so no extra wiring is needed — drop this inside any server-rendered
 * form with `action={serverAction}`.
 */
export function LongTaskButton({
  children,
  pendingLabel = '生成中',
  className = 'rounded border border-rust-600 bg-rust-700/60 px-5 py-2 hover:bg-rust-600 disabled:opacity-60',
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!pending) {
      setElapsed(0);
      return;
    }
    const started = Date.now();
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - started) / 1000));
    }, 250);
    return () => clearInterval(id);
  }, [pending]);

  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? `${pendingLabel}… ${elapsed}s` : children}
    </button>
  );
}
