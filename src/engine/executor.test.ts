import { describe, it, expect } from 'vitest';
import { executeTurn, pushLastFailedCheck } from './executor.js';
import { makeFixtureState, scriptedKp } from './fixtures.test-utils.js';
import { seededRng, type Rng } from '../rules/rng.js';
import type { KpOutput } from '../schemas/kp-output.js';

function fixedRng(seq: number[]): Rng {
  let i = 0;
  return { int: (_a, _b) => seq[i++ % seq.length]! };
}

describe('executeTurn', () => {
  it('opens the scene with no player input', async () => {
    const state = makeFixtureState();
    const kp = scriptedKp([
      {
        scene_id: 'scene_warehouse_ext',
        visible_narration: '你站在仓库外，冷雨敲打着铁皮屋顶。',
        player_options: ['推开侧门', '敲门', '绕到后巷'],
        required_check: null,
        state_ops: [{ op: 'advance_clock', minutes: 2 }],
        hidden_notes: ['玩家还未察觉里面有人'],
      },
    ]);

    const { state: s2, view } = await executeTurn(state, { player_input: null }, {
      rng: seededRng(1),
      callKp: kp.caller,
    });

    expect(view.narration).toContain('仓库外');
    expect(view.options).toHaveLength(3);
    expect(view.pending_check).toBeNull();
    expect(view.effects).toEqual(['clock +2m']);
    expect(s2.game_clock.elapsed_minutes).toBe(2);
    expect(s2.turns).toHaveLength(1);             // only KP turn (no player input)
    expect(s2.turns[0]!.actor).toBe('kp');
  });

  it('sets pending_check then resolves it on next turn', async () => {
    const state = makeFixtureState();
    // Turn 1: KP opens scene and asks for a 侦查 check.
    // Turn 2: KP follows up with the result.
    const kp = scriptedKp([
      {
        scene_id: 'scene_warehouse_ext',
        visible_narration: '一扇侧门半开。',
        player_options: ['仔细观察', '径直走过'],
        required_check: {
          kind: 'skill',
          skill_or_stat: '侦查',
          difficulty: 'regular',
          bonus_dice: 0,
          penalty_dice: 0,
          allow_push: true,
        },
        state_ops: [],
        hidden_notes: [],
      },
      {
        scene_id: 'scene_warehouse_ext',
        visible_narration: '你注意到门框上有一道新鲜的划痕。',
        player_options: ['走进去'],
        required_check: null,
        state_ops: [{ op: 'reveal_clue', clue_key: 'clue_note' }],
        hidden_notes: [],
      } satisfies KpOutput,
    ]);

    // First turn: opens scene
    const r1 = await executeTurn(state, { player_input: null }, {
      rng: seededRng(100),
      callKp: kp.caller,
    });
    expect(r1.view.pending_check).not.toBeNull();
    expect(r1.state.pending_check?.skill_or_stat).toBe('侦查');

    // Second turn: player responds. Deterministic RNG: units=2, tens=1 -> d100=12.
    // Target 60, regular. 12 <= 12 (extreme threshold=12) -> extreme_success.
    const r2 = await executeTurn(r1.state, { player_input: '仔细观察' }, {
      rng: fixedRng([2, 1]),
      callKp: kp.caller,
    });

    expect(r2.view.resolved_check).not.toBeNull();
    expect(r2.view.resolved_check!.outcome).toBe('extreme_success');
    expect(r2.state.pending_check).toBeNull();
    // Clue was revealed by this turn's KP state_ops
    expect(r2.state.clues['clue_note']?.discovered).toBe(true);
    // The KP's context for the 2nd call included the resolved check
    const ctx2 = kp.contexts[1] as { resolved_check_this_turn: unknown };
    expect(ctx2.resolved_check_this_turn).not.toBeNull();
    // used_this_session marked on successful skill check
    expect(r2.state.investigator.current.skills['侦查']?.used_this_session).toBe(true);
  });

  it('applies damage_roll via rules engine, bounds HP at 0, ends session on death', async () => {
    const state = makeFixtureState();
    state.investigator.current.hp_current = 3;     // barely alive

    const kp = scriptedKp([
      {
        scene_id: 'scene_warehouse_ext',
        visible_narration: '冷气从门缝漏出，一只手扼住你的咽喉。',
        player_options: [],
        required_check: null,
        state_ops: [
          { op: 'damage_roll', expression: '2d6', armor: 0, reason: '被袭' },
        ],
        hidden_notes: [],
      },
    ]);

    // 2d6: rng.int(1,6) twice -> 6, 5 = 11 damage
    const { state: s2, view } = await executeTurn(state, { player_input: null }, {
      rng: fixedRng([6, 5]),
      callKp: kp.caller,
    });

    expect(s2.investigator.current.hp_current).toBe(0);
    expect(s2.investigator.current.conditions).toContain('dead');
    expect(s2.status).toBe('failed');
    expect(s2.ending).toBe('dead');
    expect(view.hud.hp.current).toBe(0);
    const hasDamageEvt = s2.events.some(e => e.kind === 'damage_roll');
    const hasDeathEvt  = s2.events.some(e => e.kind === 'character_dead');
    expect(hasDamageEvt).toBe(true);
    expect(hasDeathEvt).toBe(true);
  });

  it('san_check op writes event, reduces SAN, flags insanity threshold', async () => {
    const state = makeFixtureState();
    const kp = scriptedKp([
      {
        scene_id: 'scene_warehouse_ext',
        visible_narration: '墙上的画开始扭曲。',
        player_options: ['闭上眼'],
        required_check: null,
        state_ops: [{ op: 'san_check', loss: '1/1d6+1', source: '扭曲的画' }],
        hidden_notes: [],
      },
    ]);

    // d100: units=5, tens=8 -> 85 > SAN 60 -> FAIL
    // failure "1d6+1": rng.int(1,6) = 6, + 1 -> loss 7 (>=5 triggers threshold)
    const { state: s2 } = await executeTurn(state, { player_input: null }, {
      rng: fixedRng([5, 8, 6]),
      callKp: kp.caller,
    });

    expect(s2.investigator.current.san_current).toBe(53);
    expect(s2.investigator.current.conditions).toContain('temp_insanity_pending');
    expect(s2.events.some(e => e.kind === 'san_check' && !e.passed)).toBe(true);
    expect(s2.events.some(e => e.kind === 'temp_insanity_threshold')).toBe(true);
  });

  it('change_scene op updates current_scene_id and emits event', async () => {
    const state = makeFixtureState();
    const kp = scriptedKp([
      {
        scene_id: 'scene_warehouse_int',
        visible_narration: '你跨过门槛进入仓库。',
        player_options: [],
        required_check: null,
        state_ops: [{ op: 'change_scene', scene_id: 'scene_warehouse_int' }],
        hidden_notes: [],
      },
    ]);

    const { state: s2 } = await executeTurn(state, { player_input: '进入仓库' }, {
      rng: seededRng(7),
      callKp: kp.caller,
    });

    expect(s2.current_scene_id).toBe('scene_warehouse_int');
    const evt = s2.events.find(e => e.kind === 'scene_change');
    expect(evt).toBeTruthy();
  });

  it('rejects KP output referencing unknown scene_id', async () => {
    const state = makeFixtureState();
    const kp = scriptedKp([
      {
        scene_id: 'scene_MOON_BASE',
        visible_narration: 'x',
        player_options: [],
        required_check: null,
        state_ops: [],
        hidden_notes: [],
      },
    ]);

    await expect(
      executeTurn(state, { player_input: null }, { rng: seededRng(1), callKp: kp.caller }),
    ).rejects.toThrow(/unknown scene_id/);
  });

  it('previous state is untouched on failure (transactional via clone)', async () => {
    const state = makeFixtureState();
    const kp = scriptedKp([
      {
        scene_id: 'bogus',
        visible_narration: 'x',
        player_options: [],
        required_check: null,
        state_ops: [],
        hidden_notes: [],
      },
    ]);

    const before = JSON.stringify(state);
    try {
      await executeTurn(state, { player_input: null }, { rng: seededRng(1), callKp: kp.caller });
    } catch {/* expected */}
    expect(JSON.stringify(state)).toBe(before);
  });
});

describe('pushLastFailedCheck', () => {
  it('re-rolls the last failed check and marks it pushed', async () => {
    const state = makeFixtureState();
    const kp = scriptedKp([
      {
        scene_id: 'scene_warehouse_ext',
        visible_narration: '你试图撬开锁。',
        player_options: [],
        required_check: {
          kind: 'skill',
          skill_or_stat: '闪避',
          difficulty: 'regular',
          bonus_dice: 0,
          penalty_dice: 0,
          allow_push: true,
        },
        state_ops: [],
        hidden_notes: [],
      },
    ]);

    // opens scene -> sets pending_check
    const r1 = await executeTurn(state, { player_input: null }, {
      rng: seededRng(42),
      callKp: kp.caller,
    });

    // player responds, roll fails: units=8, tens=7 -> 78 > target 50 -> fail
    const scriptedKp2 = scriptedKp([
      {
        scene_id: 'scene_warehouse_ext',
        visible_narration: '锁纹丝不动。',
        player_options: ['再试一次', '放弃'],
        required_check: null,
        state_ops: [],
        hidden_notes: [],
      },
    ]);
    const r2 = await executeTurn(r1.state, { player_input: '撬' }, {
      rng: fixedRng([8, 7]),
      callKp: scriptedKp2.caller,
    });
    expect(r2.view.resolved_check!.outcome).toBe('fail');

    // push: units=1, tens=0 -> 1 = critical
    const pushed = pushLastFailedCheck(r2.state, fixedRng([1, 0]));
    expect(pushed.resolution.outcome).toBe('critical');
    expect(pushed.resolution.skill_result!.pushed).toBe(true);
  });
});
