import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { InMemorySessionRepo } from './memory.js';
import type { InvestigatorRow, ModuleRow } from './types.js';
import { FIXTURE_MODULE } from '../engine/fixtures.test-utils.js';
import { executeTurnAndCommit } from '../engine/runner.js';
import { seededRng, type Rng } from '../rules/rng.js';
import type { KpOutput } from '../schemas/kp-output.js';

function fixedRng(seq: number[]): Rng {
  let i = 0;
  return { int: () => seq[i++ % seq.length]! };
}

function makeInvestigator(): InvestigatorRow {
  return {
    id: randomUUID(),
    owner_id: 'user_test',
    name: '林夏',
    era: '1920s',
    occupation: '记者',
    age: 28,
    gender: null,
    residence: null,
    birthplace: null,
    stat_str: 50, stat_con: 60, stat_siz: 55, stat_dex: 65,
    stat_app: 60, stat_int: 75, stat_pow: 60, stat_edu: 80,
    luck: 55,
    hp_max: 12, hp_current: 12,
    mp_max: 12, mp_current: 12,
    san_max: 60, san_start: 60, san_current: 60,
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
    portrait_url: null,
    is_archived: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function makeModule(): ModuleRow {
  return {
    id: randomUUID(),
    owner_id: 'user_test',
    source_kind: 'preset',
    title: FIXTURE_MODULE.meta.title,
    era: FIXTURE_MODULE.meta.era,
    premise: FIXTURE_MODULE.premise,
    tags: FIXTURE_MODULE.meta.tags,
    duration_min: null,
    schema_version: 1,
    content: FIXTURE_MODULE,
    original_upload_path: null,
    is_public: false,
    is_archived: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function scripted(seq: KpOutput[]): (ctx: unknown) => Promise<KpOutput> {
  let i = 0;
  return async (_ctx: unknown) => {
    if (i >= seq.length) throw new Error('scripted KP exhausted');
    return seq[i++]!;
  };
}

describe('InMemorySessionRepo + executeTurnAndCommit', () => {
  it('persists a full session across multiple turns', async () => {
    const repo = new InMemorySessionRepo();
    const inv = makeInvestigator();
    const mod = makeModule();
    const { session_id } = await repo.createSession({
      owner_id: 'user_test',
      investigator: inv,
      module: mod,
    });

    const kp = scripted([
      // Turn 1: KP opens the scene and asks for 侦查 check
      {
        scene_id: 'scene_warehouse_ext',
        visible_narration: '一扇侧门半开着。',
        player_options: ['观察', '走过'],
        required_check: {
          kind: 'skill',
          skill_or_stat: '侦查',
          difficulty: 'regular',
          bonus_dice: 0,
          penalty_dice: 0,
          allow_push: true,
        },
        state_ops: [{ op: 'advance_clock', minutes: 1 }],
        hidden_notes: [],
      },
      // Turn 2: after the 侦查 success, reveal the clue and ask to enter
      {
        scene_id: 'scene_warehouse_ext',
        visible_narration: '门框上有新鲜划痕，你记下了这个。',
        player_options: ['进入仓库'],
        required_check: null,
        state_ops: [{ op: 'reveal_clue', clue_key: 'clue_note' }],
        hidden_notes: [],
      },
      // Turn 3: player enters -> scene change + inventory add
      {
        scene_id: 'scene_warehouse_int',
        visible_narration: '你推门进入，木屑的腐味扑面。',
        player_options: [],
        required_check: null,
        state_ops: [
          { op: 'change_scene', scene_id: 'scene_warehouse_int' },
          { op: 'add_inventory', item: '铁棍', qty: 1 },
        ],
        hidden_notes: [],
      },
    ]);

    // Turn 1
    const r1 = await executeTurnAndCommit(
      repo,
      session_id,
      { player_input: null },
      { rng: seededRng(1), callKp: kp },
    );
    expect(r1.view.pending_check?.skill_or_stat).toBe('侦查');

    // Turn 2: player responds, check rolls a 12 -> extreme_success
    const r2 = await executeTurnAndCommit(
      repo,
      session_id,
      { player_input: '仔细观察' },
      { rng: fixedRng([2, 1]), callKp: kp },
    );
    expect(r2.view.resolved_check!.outcome).toBe('extreme_success');

    // After commit, the DB should have the clue + session.pending_check = null
    const afterT2 = await repo.loadSession(session_id);
    expect(afterT2.clues['clue_note']?.discovered).toBe(true);
    expect(afterT2.pending_check).toBeNull();
    expect(afterT2.turns).toHaveLength(3);       // KP, player+check, KP

    // Turn 3: player says enter; no pending_check this time
    const r3 = await executeTurnAndCommit(
      repo,
      session_id,
      { player_input: '进入仓库' },
      { rng: seededRng(7), callKp: kp },
    );
    expect(r3.view.scene_id).toBe('scene_warehouse_int');

    const final = await repo.loadSession(session_id);
    expect(final.current_scene_id).toBe('scene_warehouse_int');
    expect(final.investigator.current.inventory.some(i => i.item === '铁棍')).toBe(true);
    expect(final.game_clock.elapsed_minutes).toBe(1);

    // Persistence-specific checks: one check row, three scene-ish events
    const sessionChecks = repo.checks.filter(c => c.session_id === session_id);
    expect(sessionChecks).toHaveLength(1);
    expect(sessionChecks[0]!.outcome).toBe('extreme_success');

    const sessionEvents = repo.events.filter(e => e.session_id === session_id);
    const kinds = sessionEvents.map(e => e.kind);
    expect(kinds).toContain('clock_advance');
    expect(kinds).toContain('clue_found');
    expect(kinds).toContain('scene_change');
    expect(kinds).toContain('inventory_add');
  });

  it('rejects non-monotonic turn_index on commit', async () => {
    const repo = new InMemorySessionRepo();
    const inv = makeInvestigator();
    const mod = makeModule();
    const { session_id, state } = await repo.createSession({
      owner_id: 'user_test', investigator: inv, module: mod,
    });

    await repo.commitTurn({
      session_id,
      new_turns: [{
        id: randomUUID(), turn_index: 1, actor: 'kp',
        player_input: null, kp_output: null, visible_narration: 'x',
        check_resolution: null, created_at: new Date().toISOString(),
      }],
      new_checks: [], new_events: [],
      clue_upserts: [], npc_upserts: [],
      investigator_current_state: state.investigator.current,
      session_patch: {
        current_scene_id: state.current_scene_id,
        game_clock: state.game_clock,
        status: 'active',
        ending: null,
        pending_check: null,
        flags: {},
        updated_at: new Date().toISOString(),
      },
    });

    await expect(
      repo.commitTurn({
        session_id,
        new_turns: [{
          id: randomUUID(), turn_index: 1, actor: 'kp',
          player_input: null, kp_output: null, visible_narration: 'y',
          check_resolution: null, created_at: new Date().toISOString(),
        }],
        new_checks: [], new_events: [],
        clue_upserts: [], npc_upserts: [],
        investigator_current_state: state.investigator.current,
        session_patch: {
          current_scene_id: state.current_scene_id,
          game_clock: state.game_clock,
          status: 'active',
          ending: null,
          pending_check: null,
          flags: {},
          updated_at: new Date().toISOString(),
        },
      }),
    ).rejects.toThrow(/non-monotonic/);
  });
});
