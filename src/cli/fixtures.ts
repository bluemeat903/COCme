import { randomUUID } from 'node:crypto';
import { buildInvestigator } from '../character/index.js';
import type { InvestigatorRow, ModuleRow } from '../db/types.js';
import { FIXTURE_MODULE } from '../engine/fixtures.test-utils.js';

/**
 * Builds a demo investigator via the real character builder so the CLI
 * exercises the same code path a UI-originated submission would.
 */
export function buildDemoInvestigator(ownerId: string): InvestigatorRow {
  const { investigator } = buildInvestigator(
    {
      name: '林夏',
      era: '1920s',
      age: 28,
      occupation_key: 'journalist',
      stats: { str: 50, con: 60, siz: 55, dex: 65, app: 60, int: 75, pow: 60, edu: 80 },
      luck: 55,
      skill_allocations: {
        '侦查':       { from_occupation: 50, from_interest: 0 },
        '心理学':     { from_occupation: 40, from_interest: 0 },
        '说服':       { from_occupation: 30, from_interest: 0 },
        '图书馆使用': { from_occupation: 30, from_interest: 0 },
        '话术':       { from_occupation: 30, from_interest: 0 },
        '历史':       { from_occupation: 30, from_interest: 0 },
        '其他语言':   { from_occupation: 30, from_interest: 0 },
        '母语':       { from_occupation: 0,  from_interest: 5 },
        '急救':       { from_occupation: 0,  from_interest: 20 },
        '闪避':       { from_occupation: 0,  from_interest: 10 },
        '聆听':       { from_occupation: 0,  from_interest: 30 },
        '攀爬':       { from_occupation: 0,  from_interest: 20 },
      },
      background: {
        ideology_beliefs: '真相高于一切。',
        significant_people: '失踪的妹妹。',
        traits: '沉默，固执；对印刷油墨的味道上瘾。',
      },
      inventory: [
        { item: '怀表', qty: 1 },
        { item: '笔记本', qty: 1 },
        { item: '打火机', qty: 1 },
      ],
    },
    { owner_id: ownerId },
  );
  return investigator;
}

/** Wraps the test-fixture canonical module content into a full ModuleRow. */
export function buildDemoModule(ownerId: string): ModuleRow {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    owner_id: ownerId,
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
    created_at: now,
    updated_at: now,
  };
}
