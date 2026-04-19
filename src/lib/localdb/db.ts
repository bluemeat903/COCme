import { mkdir, readFile, rename, writeFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type {
  CheckRow,
  InvestigatorRow,
  ModuleRow,
  SessionClueRow,
  SessionEventRow,
  SessionInvestigatorStateRow,
  SessionNpcRow,
  SessionRow,
  TurnRow,
} from '@/db/types';

/**
 * Single-process local database.  One in-memory snapshot of every "table",
 * backed by a JSON file per table under ./data/.  Writes are serialized
 * through a queue so two concurrent request handlers can't corrupt the file.
 *
 * Not suitable for multi-process deployments; fine for a dedicated server
 * running one Next.js node.  Atomic across a single `save()` call via write-
 * to-temp + rename.
 *
 * Important: in Next.js dev mode, the dev server may evaluate this module
 * multiple times across different route module graphs.  A class-level
 * `static instance` field is NOT shared across those evaluations, which
 * means each route would see its own stale LocalDB.  We pin the singleton
 * to `globalThis` so it survives module re-evaluation within one process,
 * and every `get()` call cheaply checks file mtimes and reloads any table
 * whose disk copy has moved ahead of what we last loaded.
 */

export interface UserRow {
  id: string;
  email: string;           // lower-cased
  password_hash: string;   // bcrypt
  created_at: string;
  /** AES-GCM ciphertext of the user's own DeepSeek API key (optional). */
  deepseek_api_key_enc?: string;
  deepseek_api_key_updated_at?: string;
}

export interface ModuleChunkRow {
  id: string;
  module_id: string;
  chunk_index: number;
  content: string;
  metadata: Record<string, unknown>;
  embedding: number[] | null;
}

export interface GrowthRecordRow {
  id: string;
  session_id: string;
  investigator_id: string;
  skill_improvements: Array<{ skill: string; d100: number; pre: number; post: number; gain: number }>;
  san_delta: number;
  hp_delta: number;
  luck_delta: number;
  new_phobias_manias: string[];
  conditions_carried: string[];
  applied: boolean;
  applied_at: string | null;
  created_at: string;
}

interface Schema {
  users: UserRow[];
  investigators: InvestigatorRow[];
  modules: ModuleRow[];
  module_chunks: ModuleChunkRow[];
  sessions: SessionRow[];
  session_investigator_states: SessionInvestigatorStateRow[];
  turns: TurnRow[];
  checks: CheckRow[];
  session_events: SessionEventRow[];
  session_clues: SessionClueRow[];
  session_npcs: SessionNpcRow[];
  growth_records: GrowthRecordRow[];
}

const TABLES: readonly (keyof Schema)[] = [
  'users',
  'investigators',
  'modules',
  'module_chunks',
  'sessions',
  'session_investigator_states',
  'turns',
  'checks',
  'session_events',
  'session_clues',
  'session_npcs',
  'growth_records',
] as const;

// Anchor the singleton to globalThis so Next.js dev mode's module
// re-evaluation for separate route graphs all share one LocalDB instance.
const GLOBAL_KEY = Symbol.for('__coc_localdb_singleton__');
type GlobalHolder = { [GLOBAL_KEY]?: LocalDB };

export class LocalDB {
  // Per-table arrays. Use methods on `LocalDB` to query; callers shouldn't
  // grab these directly unless they know the invariants.
  users: UserRow[] = [];
  investigators: InvestigatorRow[] = [];
  modules: ModuleRow[] = [];
  module_chunks: ModuleChunkRow[] = [];
  sessions: SessionRow[] = [];
  session_investigator_states: SessionInvestigatorStateRow[] = [];
  turns: TurnRow[] = [];
  checks: CheckRow[] = [];
  session_events: SessionEventRow[] = [];
  session_clues: SessionClueRow[] = [];
  session_npcs: SessionNpcRow[] = [];
  growth_records: GrowthRecordRow[] = [];

  private writeQueue: Promise<void> = Promise.resolve();

  /** Last-loaded mtime per table, milliseconds since epoch.  0 = never loaded. */
  private loadedAt: Record<string, number> = {};

  private constructor(private readonly dataDir: string) {}

  static async get(): Promise<LocalDB> {
    const holder = globalThis as unknown as GlobalHolder;
    let db = holder[GLOBAL_KEY];
    if (!db) {
      const dir = process.env['LOCAL_DATA_DIR'] ?? join(process.cwd(), 'data');
      await mkdir(dir, { recursive: true });
      db = new LocalDB(dir);
      await db.loadAll();
      holder[GLOBAL_KEY] = db;
    } else {
      // Cheap freshness check: reload any table whose disk mtime moved ahead.
      await db.refreshChangedTables();
    }
    return db;
  }

  private async loadAll(): Promise<void> {
    for (const table of TABLES) {
      await this.loadTable(table);
    }
  }

  /** Reload a single table from disk, updating the in-memory array + mtime. */
  private async loadTable(table: keyof Schema): Promise<void> {
    const file = join(this.dataDir, `${table}.json`);
    if (!existsSync(file)) {
      this.loadedAt[table] = 0;
      return;
    }
    try {
      const [raw, st] = await Promise.all([readFile(file, 'utf8'), stat(file)]);
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        (this as unknown as Record<string, unknown>)[table] = parsed;
      }
      this.loadedAt[table] = st.mtimeMs;
    } catch (err) {
      throw new Error(`LocalDB: failed to load ${table}.json: ${(err as Error).message}`);
    }
  }

  /** Reload only tables whose on-disk mtime is newer than what we last loaded. */
  private async refreshChangedTables(): Promise<void> {
    await Promise.all(
      TABLES.map(async table => {
        const file = join(this.dataDir, `${table}.json`);
        if (!existsSync(file)) return;
        const st = await stat(file);
        if (st.mtimeMs > (this.loadedAt[table] ?? 0)) {
          await this.loadTable(table);
        }
      }),
    );
  }

  /**
   * Execute a mutation closure, then persist every affected table.  All
   * mutations are serialized; a second call waits for the first to finish
   * before running.  The closure may return data to be passed back.
   */
  async mutate<T>(
    tables: ReadonlyArray<keyof Schema>,
    fn: (db: LocalDB) => T | Promise<T>,
  ): Promise<T> {
    let outcome!: T;
    const run = async (): Promise<void> => {
      // Refresh first so the closure sees any concurrent writes from
      // elsewhere (e.g. another route's mutation during page render).
      await this.refreshChangedTables();
      outcome = await fn(this);
      await this.saveTables(tables);
    };
    this.writeQueue = this.writeQueue.then(run);
    await this.writeQueue;
    return outcome;
  }

  private async saveTables(tables: ReadonlyArray<keyof Schema>): Promise<void> {
    for (const t of tables) {
      const file = join(this.dataDir, `${t}.json`);
      const tmp = `${file}.tmp`;
      const data = JSON.stringify((this as unknown as Record<string, unknown>)[t], null, 2);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(tmp, data, 'utf8');
      await rename(tmp, file);
      try {
        const st = await stat(file);
        this.loadedAt[t] = st.mtimeMs;
      } catch {
        /* ignore */
      }
    }
  }

  /** Reset for tests only.  No-op in normal runtime. */
  static _resetForTests(): void {
    const holder = globalThis as unknown as GlobalHolder;
    delete holder[GLOBAL_KEY];
  }
}
