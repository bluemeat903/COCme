import { randomUUID } from 'node:crypto';
import { callJsonWithSchema } from '../ai/json-call.js';
import type { ChatCompletion } from '../ai/provider.js';
import type { ModuleRow } from '../db/types.js';
import { ModuleContent } from '../schemas/module.js';
import type { ModuleContent as ModuleContentT } from '../schemas/module.js';
import { MODULE_GENERATION_SYSTEM_PROMPT, buildGenerateUserMessage } from './prompts.js';
import { validateAndNormalizeModuleContent } from './validate.js';

// ---------------------------------------------------------------------------
// generateModule: AI-authored module from high-level parameters.
// Uses the reasoner model by default for better structural coherence.
// ---------------------------------------------------------------------------

export interface GenerateModuleInput {
  theme: string;
  era: string;                    // '1920s' | 'modern' | ...
  tone?: string;
  duration_min?: number;
  extra?: string;
  /** Owner user id for the resulting ModuleRow (null = preset). */
  owner_id: string | null;
}

export interface GenerateModuleOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  maxRepairAttempts?: number;
  signal?: AbortSignal;
}

export interface GenerateModuleResult {
  module: ModuleRow;
  /** Soft warnings from cross-reference validation (dangling clue targets, etc.). */
  warnings: string[];
}

export async function generateModule(
  input: GenerateModuleInput,
  opts: GenerateModuleOptions,
  deps: { chat: ChatCompletion; reasonModel: string; chatModel: string },
): Promise<GenerateModuleResult> {
  const model = opts.model ?? deps.reasonModel;

  const content: ModuleContentT = await callJsonWithSchema(
    ModuleContent,
    [
      { role: 'system', content: MODULE_GENERATION_SYSTEM_PROMPT },
      { role: 'user', content: buildGenerateUserMessage(input) },
    ],
    {
      model,
      temperature: opts.temperature ?? 1.0,
      ...(opts.maxTokens !== undefined ? { maxTokens: opts.maxTokens } : {}),
      maxRepairAttempts: opts.maxRepairAttempts ?? 2,
      ...(opts.signal !== undefined ? { signal: opts.signal } : {}),
    },
    deps.chat,
  );

  const { warnings } = validateAndNormalizeModuleContent(content);

  const now = new Date().toISOString();
  const row: ModuleRow = {
    id: randomUUID(),
    owner_id: input.owner_id,
    source_kind: 'ai_generated',
    title: content.meta.title,
    era: content.meta.era ?? input.era,
    premise: content.premise,
    tags: content.meta.tags ?? [],
    duration_min: content.meta.duration_min ?? input.duration_min ?? null,
    schema_version: 1,
    content,
    original_upload_path: null,
    is_public: false,
    is_archived: false,
    created_at: now,
    updated_at: now,
  };

  return { module: row, warnings };
}
