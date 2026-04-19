import { describe, it, expect } from 'vitest';
import { chunkModule } from './chunker.js';
import { FIXTURE_MODULE } from '../engine/fixtures.test-utils.js';

describe('chunkModule', () => {
  it('emits one chunk per section object in the fixture', () => {
    const chunks = chunkModule(FIXTURE_MODULE);
    const sections = chunks.map(c => c.metadata.section);
    // premise + 2 locations + 1 npc + 2 clues + 2 scenes + 0 encounters + 2 endings
    expect(sections).toEqual([
      'premise',
      'location', 'location',
      'npc',
      'clue', 'clue',
      'scene', 'scene',
      'ending', 'ending',
    ]);
  });

  it('keys are propagated into metadata', () => {
    const chunks = chunkModule(FIXTURE_MODULE);
    const locChunks = chunks.filter(c => c.metadata.section === 'location');
    expect(locChunks.map(c => c.metadata.key).sort()).toEqual(['loc_warehouse_ext', 'loc_warehouse_int']);
    const sceneChunks = chunks.filter(c => c.metadata.section === 'scene');
    expect(sceneChunks.map(c => c.metadata.key)).toEqual(['scene_warehouse_ext', 'scene_warehouse_int']);
  });

  it('chunk_index is monotonic and unique', () => {
    const chunks = chunkModule(FIXTURE_MODULE);
    const idxs = chunks.map(c => c.chunk_index);
    expect(idxs).toEqual(idxs.slice().sort((a, b) => a - b));
    expect(new Set(idxs).size).toBe(idxs.length);
  });

  it('splits long premise on paragraph boundaries', () => {
    const longParas = Array.from({ length: 5 }, (_, i) =>
      `这是第${i + 1}段，用于测试分片逻辑。` + '内容内容内容。'.repeat(80),
    ).join('\n\n');
    const m = {
      ...FIXTURE_MODULE,
      meta: { ...FIXTURE_MODULE.meta },
      premise: longParas,
    };
    const chunks = chunkModule(m, { maxChars: 800, overlap: 40 });
    const premises = chunks.filter(c => c.metadata.section === 'premise');
    expect(premises.length).toBeGreaterThan(1);
    for (const c of premises) {
      expect(c.content.length).toBeLessThanOrEqual(1100); // account for overlap headroom
    }
  });
});
