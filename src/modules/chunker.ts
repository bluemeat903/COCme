import type { ModuleContent } from '../schemas/module.js';

/**
 * Turn a ModuleContent into retrieval chunks.  Each chunk carries a `section`
 * label in metadata so the RAG layer can filter by section type (KP typically
 * wants the current scene + discovered-clue + live-npc chunks).
 *
 * Embeddings are NOT computed here -- the `module_chunks.embedding` column is
 * nullable; fill it later when you plug in an embedding service.
 */

export interface ModuleChunk {
  chunk_index: number;
  content: string;
  metadata: {
    section: 'premise' | 'location' | 'npc' | 'clue' | 'scene' | 'ending' | 'encounter';
    key: string;
  };
}

export interface ChunkOptions {
  /** Soft character budget per chunk; long fields are split on paragraph. */
  maxChars?: number;
  /** Character overlap when splitting a long field. */
  overlap?: number;
}

const DEFAULT_MAX_CHARS = 1200;
const DEFAULT_OVERLAP = 120;

export function chunkModule(m: ModuleContent, opts: ChunkOptions = {}): ModuleChunk[] {
  const maxChars = opts.maxChars ?? DEFAULT_MAX_CHARS;
  const overlap = opts.overlap ?? DEFAULT_OVERLAP;

  const chunks: ModuleChunk[] = [];

  const push = (section: ModuleChunk['metadata']['section'], key: string, text: string): void => {
    const clean = text.trim();
    if (!clean) return;
    const pieces = splitLong(clean, maxChars, overlap);
    for (const p of pieces) {
      chunks.push({
        chunk_index: chunks.length,
        content: p,
        metadata: { section, key },
      });
    }
  };

  push('premise', 'premise', `# 模组前情 ${m.meta.title}\n\n${m.premise}`);

  for (const loc of m.locations) {
    const body = [
      `# 地点：${loc.name}`,
      loc.description,
      loc.features.length > 0 ? `特征：\n- ${loc.features.join('\n- ')}` : '',
    ].filter(Boolean).join('\n\n');
    push('location', loc.key, body);
  }

  for (const npc of m.npcs) {
    const body = [
      `# NPC：${npc.name}（${npc.role}）`,
      npc.motivations.length > 0 ? `动机：\n- ${npc.motivations.join('\n- ')}` : '',
      npc.secrets.length > 0 ? `秘密：\n- ${npc.secrets.join('\n- ')}` : '',
      npc.stats
        ? `数据：${JSON.stringify(npc.stats)}`
        : '',
    ].filter(Boolean).join('\n\n');
    push('npc', npc.key, body);
  }

  for (const clue of m.clues) {
    const body = [
      `# 线索：${clue.name}`,
      clue.text,
      clue.found_at.length > 0 ? `可在以下地点/场景获得：${clue.found_at.join(', ')}` : '',
      clue.requires_check ? `需要检定：${clue.requires_check.skill} (${clue.requires_check.difficulty})` : '',
      clue.reveals.length > 0 ? `引出：${clue.reveals.join(', ')}` : '',
    ].filter(Boolean).join('\n\n');
    push('clue', clue.key, body);
  }

  for (const scene of m.scene_nodes) {
    const body = [
      `# 场景：${scene.title} (${scene.id})`,
      scene.setup,
      scene.on_enter.length > 0 ? `入场触发：\n- ${scene.on_enter.join('\n- ')}` : '',
      scene.transitions.length > 0
        ? `转场：\n- ${scene.transitions.map(t => `${t.to}${t.condition ? ` (${t.condition})` : ''}`).join('\n- ')}`
        : '',
    ].filter(Boolean).join('\n\n');
    push('scene', scene.id, body);
  }

  for (const enc of m.encounters) {
    const body = [
      `# 遭遇：${enc.key}`,
      enc.description,
      enc.opponents.length > 0
        ? `对手：\n- ${enc.opponents.map(o => `${o.name} (HP ${o.hp})`).join('\n- ')}`
        : '',
    ].filter(Boolean).join('\n\n');
    push('encounter', enc.key, body);
  }

  for (const end of m.ending_conditions) {
    const body = [
      `# 结局：${end.label} (${end.key})`,
      end.requires.length > 0 ? `要求：\n- ${end.requires.join('\n- ')}` : '无前置条件',
    ].join('\n\n');
    push('ending', end.key, body);
  }

  return chunks;
}

/**
 * Split `text` on paragraph breaks such that each piece is <= maxChars, with
 * a small overlap prepended from the previous piece for context continuity.
 */
function splitLong(text: string, maxChars: number, overlap: number): string[] {
  if (text.length <= maxChars) return [text];

  const paragraphs = text.split(/\n{2,}/);
  const pieces: string[] = [];
  let cur = '';

  const flush = (): void => {
    if (cur.trim().length > 0) pieces.push(cur.trim());
  };

  for (const p of paragraphs) {
    if ((cur + '\n\n' + p).length > maxChars) {
      flush();
      cur = overlap > 0 && pieces.length > 0
        ? tail(pieces[pieces.length - 1]!, overlap) + '\n\n' + p
        : p;
    } else {
      cur = cur.length === 0 ? p : cur + '\n\n' + p;
    }
  }
  flush();

  // A single paragraph longer than maxChars -> hard split on chars.
  const final: string[] = [];
  for (const piece of pieces) {
    if (piece.length <= maxChars) {
      final.push(piece);
      continue;
    }
    let offset = 0;
    while (offset < piece.length) {
      const end = Math.min(offset + maxChars, piece.length);
      const sub = piece.slice(offset, end);
      final.push(final.length > 0 && overlap > 0 ? tail(final[final.length - 1]!, overlap) + sub : sub);
      offset += maxChars - overlap;
      if (offset <= 0) offset = end;  // safety
    }
  }

  return final;
}

function tail(s: string, n: number): string {
  return s.length <= n ? s : s.slice(s.length - n);
}
