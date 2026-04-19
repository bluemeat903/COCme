'use client';

import { useState } from 'react';
import type { DiscoveredClueView } from '@/engine/projection';

/**
 * Sidebar "clue board".  Shows discovered clues most-recent-first.  Each can
 * be expanded to read its full text.  New clues (same identity as in last
 * render) don't animate; we rely on the React key reconciliation only.
 */
export function ClueBoard({ clues }: { clues: DiscoveredClueView[] }) {
  return (
    <div className="rounded border border-ink-700 bg-ink-900 p-4 text-sm">
      <h3 className="mb-2 flex items-center justify-between font-serif text-lg">
        <span>线索板</span>
        <span className="text-xs text-ink-400">{clues.length}</span>
      </h3>
      {clues.length === 0 ? (
        <p className="text-xs text-ink-500">尚未发现线索。</p>
      ) : (
        <ul className="space-y-2">
          {[...clues].reverse().map(c => (
            <ClueItem key={c.key} clue={c} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ClueItem({ clue }: { clue: DiscoveredClueView }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="border-l border-rust-700/60 pl-2">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full text-left text-ink-100 hover:text-rust-500"
      >
        <span className="font-serif">{clue.name}</span>
        <span className="ml-2 text-xs text-ink-500">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="mt-1 space-y-1 text-xs">
          <p className="text-ink-300 whitespace-pre-wrap">{clue.text}</p>
          {clue.context && <p className="text-ink-500">发现场合：{clue.context}</p>}
        </div>
      )}
    </li>
  );
}
