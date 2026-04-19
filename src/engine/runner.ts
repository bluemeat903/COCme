import type { SessionRepo } from '../db/repo.js';
import { executeTurn, type ExecuteTurnDeps, type ExecuteTurnInput, type ExecuteTurnResult } from './executor.js';
import { computeTurnDelta } from './persist.js';

// ---------------------------------------------------------------------------
// executeTurnAndCommit: the public entry-point for "play one turn".
//
//   1. load SessionState from the repo
//   2. run the executor (which calls the KP + rules engine)
//   3. compute the delta
//   4. commit atomically via the repo
//   5. return the player view + new state
//
// If anything between (1) and (4) throws, nothing has been committed.  If (4)
// itself throws, the in-memory new state is discarded so the caller can
// retry by re-reading from DB.
// ---------------------------------------------------------------------------

export async function executeTurnAndCommit(
  repo: SessionRepo,
  sessionId: string,
  input: ExecuteTurnInput,
  deps: ExecuteTurnDeps,
): Promise<ExecuteTurnResult> {
  const prev = await repo.loadSession(sessionId);
  const result = await executeTurn(prev, input, deps);
  const delta = computeTurnDelta(prev, result.state);
  await repo.commitTurn(delta);
  return result;
}
