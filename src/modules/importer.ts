import { randomUUID } from 'node:crypto';
import { callJsonWithSchema } from '../ai/json-call.js';
import type { ChatCompletion } from '../ai/provider.js';
import type { ModuleRow } from '../db/types.js';
import { ModuleContent } from '../schemas/module.js';
import type { ModuleContent as ModuleContentT } from '../schemas/module.js';
import { MODULE_IMPORT_SYSTEM_PROMPT, buildImportUserMessage } from './prompts.js';
import { validateAndNormalizeModuleContent } from './validate.js';

// ---------------------------------------------------------------------------
// importModule: user-uploaded text -> canonical ModuleContent.
// Lower temperature than generation; fidelity > creativity.
// ---------------------------------------------------------------------------

export interface ImportModuleInput {
  raw_text: string;
  title_hint?: string;
  era_hint?: string;
  owner_id: string;
  /** Storage path (if the raw was uploaded to Supabase Storage). */
  original_upload_path?: string;
}

export interface ImportModuleOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  maxRepairAttempts?: number;
  signal?: AbortSignal;
  /** Max raw-text length to ship in one call.  Longer docs should be chunked upstream. */
  maxInputChars?: number;
}

export interface ImportModuleResult {
  module: ModuleRow;
  warnings: string[];
}

const DEFAULT_MAX_INPUT_CHARS = 40_000;

export async function importModule(
  input: ImportModuleInput,
  opts: ImportModuleOptions,
  deps: { chat: ChatCompletion; reasonModel: string; chatModel: string },
): Promise<ImportModuleResult> {
  const maxChars = opts.maxInputChars ?? DEFAULT_MAX_INPUT_CHARS;
  if (input.raw_text.length > maxChars) {
    throw new Error(
      `importModule: input too long (${input.raw_text.length} chars > ${maxChars}). ` +
        `Split the document or raise maxInputChars.`,
    );
  }
  if (input.raw_text.trim().length === 0) {
    throw new Error('importModule: empty input');
  }

  const model = opts.model ?? deps.reasonModel;

  const importParams: { document: string; title_hint?: string; era_hint?: string } = {
    document: input.raw_text,
  };
  if (input.title_hint !== undefined) importParams.title_hint = input.title_hint;
  if (input.era_hint !== undefined) importParams.era_hint = input.era_hint;

  const content: ModuleContentT = await callJsonWithSchema(
    ModuleContent,
    [
      { role: 'system', content: MODULE_IMPORT_SYSTEM_PROMPT },
      { role: 'user', content: buildImportUserMessage(importParams) },
    ],
    {
      model,
      temperature: opts.temperature ?? 0.3,
      ...(opts.maxTokens !== undefined ? { maxTokens: opts.maxTokens } : {}),
      maxRepairAttempts: opts.maxRepairAttempts ?? 2,
      ...(opts.signal !== undefined ? { signal: opts.signal } : {}),
    },
    deps.chat,
  );

  const { warnings } = validateAndNormalizeModuleContent(content);

  // If the import LLM missed meta.warnings entirely, surface our own.
  if (warnings.length > 0) {
    content.meta.warnings = [...(content.meta.warnings ?? []), ...warnings];
  }

  const now = new Date().toISOString();
  const row: ModuleRow = {
    id: randomUUID(),
    owner_id: input.owner_id,
    source_kind: 'user_upload',
    title: content.meta.title || input.title_hint || '未命名模组',
    era: content.meta.era ?? input.era_hint ?? '1920s',
    premise: content.premise,
    tags: content.meta.tags ?? [],
    duration_min: content.meta.duration_min ?? null,
    schema_version: 1,
    content,
    original_upload_path: input.original_upload_path ?? null,
    is_public: false,
    is_archived: false,
    created_at: now,
    updated_at: now,
  };

  return { module: row, warnings };
}
