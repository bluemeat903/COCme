import type { KpOutput } from '../schemas/index.js';
import type { ModuleContent } from '../schemas/module.js';
import type { SessionState } from './state.js';

export const FIXTURE_MODULE: ModuleContent = {
  meta: { title: '仓库试玩', era: '1920s', tags: ['horror', 'test'], warnings: [] },
  premise: '你在雨夜收到一张纸条，让你去码头旁的仓库。',
  locations: [
    { key: 'loc_warehouse_ext', name: '仓库外', description: '潮湿的街角。', features: [] },
    { key: 'loc_warehouse_int', name: '仓库内', description: '箱子堆满的走道。', features: [] },
  ],
  npcs: [
    { key: 'npc_docker', name: '码头工人', role: '看门人', motivations: [], secrets: [] },
  ],
  clues: [
    { key: 'clue_blood_crate', name: '带血的木箱', text: '一只木箱的缝隙里渗着暗红。', found_at: ['scene_warehouse_int'], reveals: [] },
    { key: 'clue_note', name: '撕碎的纸条', text: '只剩下一个日期。', found_at: ['scene_warehouse_ext'], reveals: [] },
  ],
  truth_graph: { nodes: [], edges: [] },
  scene_nodes: [
    { id: 'scene_warehouse_ext', title: '雨中街角', setup: '你站在仓库外。', on_enter: [], transitions: [{ to: 'scene_warehouse_int' }] },
    { id: 'scene_warehouse_int', title: '仓库内部', setup: '你进入仓库。',       on_enter: [], transitions: [] },
  ],
  encounters: [],
  ending_conditions: [
    { key: 'end_escape', label: 'escaped', requires: [] },
    { key: 'end_dead', label: 'dead', requires: [] },
  ],
};

export function makeFixtureState(): SessionState {
  const base = {
    name: '林夏',
    era: '1920s',
    occupation: '记者',
    age: 28,
    stats: { str: 50, con: 60, siz: 55, dex: 65, app: 60, int: 75, pow: 60, edu: 80 },
    hp_max: 12,
    mp_max: 12,
    san_max: 60,
    san_start: 60,
    luck_start: 55,
    mov: 8,
    damage_bonus: '0',
    build: 0,
    skills: {
      '侦查': { base: 25, value: 60 },
      '聆听': { base: 20, value: 40 },
      '心理学': { base: 10, value: 50 },
      '闪避': { base: 32, value: 50 },
    },
    inventory: [{ item: '怀表', qty: 1 }],
    background: { ideology: '真相高于一切' },
  };
  return {
    session_id: 'sess_test',
    owner_id: 'user_test',
    investigator_id: 'inv_test',
    module_id: 'mod_test',
    investigator: {
      base,
      current: {
        hp_current: 12,
        mp_current: 12,
        san_current: 60,
        luck: 55,
        skills: Object.fromEntries(
          Object.entries(base.skills).map(([k, v]) => [k, { ...v, used_this_session: false }]),
        ),
        inventory: [{ item: '怀表', qty: 1 }],
        conditions: [],
        phobias_manias: [],
      },
    },
    module: FIXTURE_MODULE,
    current_scene_id: 'scene_warehouse_ext',
    game_clock: { elapsed_minutes: 0 },
    turns: [],
    events: [],
    clues: {},
    npcs: {},
    flags: {},
    pending_check: null,
    status: 'active',
    started_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

/** Script a KP to return a fixed sequence of outputs; fails the test if overrun. */
export function scriptedKp(seq: KpOutput[]): {
  caller: (ctx: unknown) => Promise<KpOutput>;
  contexts: unknown[];
} {
  const contexts: unknown[] = [];
  let i = 0;
  return {
    contexts,
    caller: async (ctx: unknown) => {
      contexts.push(ctx);
      if (i >= seq.length) throw new Error('scripted KP exhausted');
      return seq[i++]!;
    },
  };
}
