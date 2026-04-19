import { describe, it, expect } from 'vitest';
import type { ChatCompletion } from '../ai/provider.js';
import { generateModule } from './generator.js';
import { importModule } from './importer.js';
import { FIXTURE_MODULE } from '../engine/fixtures.test-utils.js';
import type { ModuleContent } from '../schemas/module.js';

// A helper to build a ChatCompletion stub that returns a given sequence.
function stubChat(seq: Array<{ content: string | null }>): {
  chat: ChatCompletion;
  calls: Array<Parameters<ChatCompletion>[0]>;
} {
  const calls: Array<Parameters<ChatCompletion>[0]> = [];
  let i = 0;
  const chat: ChatCompletion = async (req) => {
    calls.push(req);
    if (i >= seq.length) throw new Error('stub chat exhausted');
    return seq[i++]!;
  };
  return { chat, calls };
}

// Minimal valid ModuleContent as JSON string.
function validModuleJson(overrides: Partial<ModuleContent> = {}): string {
  const base: ModuleContent = {
    meta: { title: '测试模组', era: '1920s', tags: [], warnings: [] },
    premise: '一段很短的前情。',
    locations: [
      { key: 'loc_a', name: '地点A', description: '描述A', features: [] },
      { key: 'loc_b', name: '地点B', description: '描述B', features: [] },
    ],
    npcs: [
      { key: 'npc_a', name: '张三', role: '目击者', motivations: ['找回妻子'], secrets: ['隐瞒了时间'] },
      { key: 'npc_b', name: '李四', role: '警官', motivations: ['结案'], secrets: [] },
    ],
    clues: [
      { key: 'clue_1', name: '纸条', text: '一张撕碎的纸条', found_at: ['loc_a'], reveals: [] },
      { key: 'clue_2', name: '血迹', text: '门框血迹', found_at: ['scene_2'], reveals: [] },
      { key: 'clue_3', name: '录音', text: '模糊录音', found_at: ['loc_b'], reveals: ['clue_1'] },
    ],
    truth_graph: { nodes: [], edges: [] },
    scene_nodes: [
      { id: 'scene_1', title: '入场', setup: 's1', on_enter: [], transitions: [{ to: 'scene_2' }] },
      { id: 'scene_2', title: '调查', setup: 's2', on_enter: [], transitions: [{ to: 'scene_3' }] },
      { id: 'scene_3', title: '冲突', setup: 's3', on_enter: [], transitions: [{ to: 'scene_4' }] },
      { id: 'scene_4', title: '收尾', setup: 's4', on_enter: [], transitions: [] },
    ],
    encounters: [],
    ending_conditions: [
      { key: 'end_good', label: 'good', requires: ['clue_1'] },
      { key: 'end_bad',  label: 'bad',  requires: [] },
    ],
    ...overrides,
  };
  return JSON.stringify(base);
}

describe('generateModule', () => {
  it('returns a ModuleRow with source_kind=ai_generated', async () => {
    const { chat, calls } = stubChat([{ content: validModuleJson() }]);
    const { module, warnings } = await generateModule(
      { theme: '码头幽灵', era: '1920s', owner_id: 'u1' },
      {},
      { chat, reasonModel: 'deepseek-reasoner', chatModel: 'deepseek-chat' },
    );
    expect(module.source_kind).toBe('ai_generated');
    expect(module.title).toBe('测试模组');
    expect(module.content.scene_nodes).toHaveLength(4);
    expect(module.owner_id).toBe('u1');
    expect(warnings).toEqual([]);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.response_format).toEqual({ type: 'json_object' });
  });

  it('retries once on bad JSON and recovers', async () => {
    const { chat, calls } = stubChat([
      { content: 'this is not json' },
      { content: validModuleJson() },
    ]);
    const { module } = await generateModule(
      { theme: 'x', era: '1920s', owner_id: 'u1' },
      { maxRepairAttempts: 1 },
      { chat, reasonModel: 'r', chatModel: 'c' },
    );
    expect(module.title).toBe('测试模组');
    expect(calls).toHaveLength(2);
    // 2nd call should have the repair message appended
    const lastMsgs = calls[1]!.messages;
    expect(lastMsgs[lastMsgs.length - 1]!.content).toMatch(/不符合 schema/);
  });

  it('throws after exhausting retries on structurally invalid content', async () => {
    const badPayload = JSON.stringify({ meta: { title: 'x' }, premise: 'y' }); // missing scene_nodes etc.
    const { chat } = stubChat([
      { content: badPayload },
      { content: badPayload },
    ]);
    await expect(
      generateModule(
        { theme: 't', era: '1920s', owner_id: 'u1' },
        { maxRepairAttempts: 1 },
        { chat, reasonModel: 'r', chatModel: 'c' },
      ),
    ).rejects.toThrow(/failed after/);
  });

  it('surfaces cross-reference warnings from validate.ts', async () => {
    const bad = validModuleJson({
      clues: [
        { key: 'clue_x', name: 'x', text: 't', found_at: ['loc_MISSING'], reveals: ['clue_DOES_NOT_EXIST'] },
        { key: 'clue_y', name: 'y', text: 't', found_at: ['loc_a'], reveals: [] },
        { key: 'clue_z', name: 'z', text: 't', found_at: ['loc_a'], reveals: [] },
      ],
    });
    const { chat } = stubChat([{ content: bad }]);
    const { warnings } = await generateModule(
      { theme: 't', era: '1920s', owner_id: 'u1' },
      {},
      { chat, reasonModel: 'r', chatModel: 'c' },
    );
    expect(warnings.some(w => w.includes('loc_MISSING'))).toBe(true);
    expect(warnings.some(w => w.includes('clue_DOES_NOT_EXIST'))).toBe(true);
  });
});

describe('importModule', () => {
  it('produces a ModuleRow with source_kind=user_upload', async () => {
    const { chat, calls } = stubChat([{ content: validModuleJson() }]);
    const { module } = await importModule(
      { raw_text: '某个故事文档……', owner_id: 'u1', title_hint: '迷路的孩子' },
      {},
      { chat, reasonModel: 'r', chatModel: 'c' },
    );
    expect(module.source_kind).toBe('user_upload');
    expect(calls).toHaveLength(1);
    // lower temperature for import
    expect(calls[0]!.temperature).toBeLessThan(0.5);
  });

  it('rejects empty input', async () => {
    const { chat } = stubChat([]);
    await expect(
      importModule({ raw_text: '   ', owner_id: 'u1' }, {}, { chat, reasonModel: 'r', chatModel: 'c' }),
    ).rejects.toThrow(/empty input/);
  });

  it('rejects oversized input', async () => {
    const { chat } = stubChat([]);
    await expect(
      importModule(
        { raw_text: 'x'.repeat(50_000), owner_id: 'u1' },
        { maxInputChars: 40_000 },
        { chat, reasonModel: 'r', chatModel: 'c' },
      ),
    ).rejects.toThrow(/too long/);
  });

  it('appends cross-ref warnings into content.meta.warnings', async () => {
    const bad = validModuleJson({
      clues: [
        { key: 'c1', name: 'x', text: 't', found_at: ['nowhere'], reveals: [] },
        { key: 'c2', name: 'y', text: 't', found_at: ['loc_a'], reveals: [] },
        { key: 'c3', name: 'z', text: 't', found_at: ['loc_a'], reveals: [] },
      ],
    });
    const { chat } = stubChat([{ content: bad }]);
    const { module } = await importModule(
      { raw_text: 'doc', owner_id: 'u1' },
      {},
      { chat, reasonModel: 'r', chatModel: 'c' },
    );
    expect(module.content.meta.warnings.some(w => w.includes('nowhere'))).toBe(true);
  });
});
