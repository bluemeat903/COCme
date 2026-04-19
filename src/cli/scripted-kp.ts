import type { KpCaller } from '../engine/index.js';
import type { KpOutput } from '../schemas/kp-output.js';

/**
 * Offline "KP" that plays a tiny 6-turn scripted adventure against the
 *仓库试玩 fixture module.  Used by --dry-run so developers can smoke-test
 * the engine loop without burning DeepSeek tokens.
 *
 * The script is deterministic and does not read player input.  Its purpose
 * is to exercise every feature:
 *   - required_check (skill, SAN)
 *   - damage_roll, san_check, reveal_clue
 *   - change_scene, add_inventory, flag_set
 *   - a final ending_condition nudge
 */
export const SCRIPTED_KP_OUTPUTS: KpOutput[] = [
  // 0: opens the scene outside, asks for a 侦查 check on the side door
  {
    scene_id: 'scene_warehouse_ext',
    visible_narration:
      '你站在仓库的侧门外。潮气从砖缝里冒出来，贴着你的皮肤。' +
      '远处的码头灯在雨雾中一明一暗，像某种慢速呼吸的东西。',
    player_options: ['仔细观察侧门', '绕到后巷', '直接敲门'],
    required_check: {
      kind: 'skill',
      skill_or_stat: '侦查',
      difficulty: 'regular',
      bonus_dice: 0,
      penalty_dice: 0,
      allow_push: true,
      note: '在昏暗中找出侧门上的异样',
    },
    state_ops: [{ op: 'advance_clock', minutes: 2 }],
    hidden_notes: ['玩家还未察觉里面有人'],
  },

  // 1: after the check is resolved, reveal the note clue and nudge inside
  {
    scene_id: 'scene_warehouse_ext',
    visible_narration:
      '你借着路灯的余光俯身——门框上新鲜的划痕，靠近地面的位置。' +
      '像是有人拖着沉物进出。你看见地上被水冲刷过的一角纸条，上面有一个被撕掉大半的日期。',
    player_options: ['推开侧门进入', '把纸条收起来再走', '退开，先通知同事'],
    required_check: null,
    state_ops: [
      { op: 'reveal_clue', clue_key: 'clue_note', context: '门口拾得' },
      { op: 'advance_clock', minutes: 1 },
    ],
    hidden_notes: ['纸条上的日期是昨晚'],
  },

  // 2: player moved inside -> change_scene + san check on atmosphere
  {
    scene_id: 'scene_warehouse_int',
    visible_narration:
      '你侧身进入。空气一下子变得稠重，木屑的腐味和某种甜腻的铁锈味混在一起。' +
      '远处传来——极低极慢——像是木箱被拖动的声音，但节奏不像人。',
    player_options: ['顺声源靠近', '先检查最近的木箱', '退回门口'],
    required_check: {
      kind: 'san',
      skill_or_stat: null,
      difficulty: 'regular',
      bonus_dice: 0,
      penalty_dice: 0,
      allow_push: false,
      note: '0/1d4',  // loss expression encoded in note
    },
    state_ops: [
      { op: 'change_scene', scene_id: 'scene_warehouse_int' },
      { op: 'add_inventory', item: '铁棍', qty: 1, notes: '从门后捡起，生锈但结实' },
      { op: 'advance_clock', minutes: 1 },
    ],
    hidden_notes: ['若玩家未到 clue_blood_crate，下一轮给线索提示'],
  },

  // 3: reveal blood crate, offer options
  {
    scene_id: 'scene_warehouse_int',
    visible_narration:
      '你在最靠近过道的一只木��旁停下。缝隙里渗出的暗红色在地面结成了一小摊，' +
      '像是渗了很久。拖行的声响停了。你听见自己的呼吸变得很轻。',
    player_options: ['撬开木箱', '记下位置，继续追声源', '悄悄退出仓库'],
    required_check: null,
    state_ops: [
      { op: 'reveal_clue', clue_key: 'clue_blood_crate', context: '仓库过道最外侧' },
      { op: 'flag_set', key: 'heard_dragging', value: true },
    ],
    hidden_notes: ['撬开 -> damage_roll（指尖受伤）；继续 -> 更深入；退出 -> escape ending'],
  },

  // 4: suppose player tries to pry -> small self-inflicted damage
  {
    scene_id: 'scene_warehouse_int',
    visible_narration:
      '铁棍卡进缝隙。木头撕裂——一小片尖刺弹起，擦破你的手背。' +
      '里面蜷着的不是尸体，但也不是活物。它的轮廓在你把手电照过去时——轻轻地移动了一下。',
    player_options: ['猛地合上木箱离开', '强迫自己再看一眼'],
    required_check: {
      kind: 'san',
      skill_or_stat: null,
      difficulty: 'regular',
      bonus_dice: 0,
      penalty_dice: 0,
      allow_push: false,
      note: '1/1d6',
    },
    state_ops: [
      { op: 'damage_roll', expression: '1d3', armor: 0, reason: '撬箱时被木刺划破' },
    ],
    hidden_notes: ['无论选哪条都朝 escape ending 收'],
  },

  // 5: escape ending
  {
    scene_id: 'scene_warehouse_int',
    visible_narration:
      '你把箱子盖子按回去——它比你预想的要沉。雨还在敲屋顶。' +
      '你退出仓库，把笔记本贴胸前夹好。无论里面是什么，它还没追出来。' +
      '这一夜，你是带着活人的心跳离开的。',
    player_options: [],
    required_check: null,
    state_ops: [
      { op: 'change_scene', scene_id: 'scene_warehouse_ext' },
      { op: 'flag_set', key: 'escaped', value: true },
    ],
    hidden_notes: ['局结束'],
  },
];

export function createScriptedKp(): KpCaller {
  let i = 0;
  return async (_ctx: unknown) => {
    if (i >= SCRIPTED_KP_OUTPUTS.length) {
      // Loop on the last output (closure) in case the player keeps typing.
      return SCRIPTED_KP_OUTPUTS[SCRIPTED_KP_OUTPUTS.length - 1]!;
    }
    return SCRIPTED_KP_OUTPUTS[i++]!;
  };
}

export const SCRIPT_LENGTH = SCRIPTED_KP_OUTPUTS.length;
