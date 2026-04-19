import type { NextRequest } from 'next/server';
import { LocalSessionRepo } from '@/db/local';
import {
  executeTurnAndCommit,
  type KpCaller,
} from '@/engine';
import { cryptoRng } from '@/rules';
import { createDeepSeek, streamCallKp } from '@/ai';
import { requireSessionOwner } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// POST /api/sessions/[id]/turn
// Body: { player_input: string | null }
// Response: text/event-stream
//   event: narration    data: { text }          (cumulative text so far)
//   event: complete     data: <PlayerView>      (final view after commit)
//   event: error        data: { message }       (terminal error)
// ---------------------------------------------------------------------------

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: sessionId } = await params;

  try {
    await requireSessionOwner(sessionId);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 403 });
  }

  let playerInput: string | null = null;
  try {
    const body = (await req.json()) as { player_input?: string | null };
    playerInput = body.player_input ?? null;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const ds = createDeepSeek();
  const repo = new LocalSessionRepo();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown): void => {
        const line = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(line));
      };

      const kp: KpCaller = async (ctx: unknown) => {
        return streamCallKp(
          ctx,
          { client: ds.client, model: ds.chatModel },
          { onNarrationChange: text => send('narration', { text }) },
        );
      };

      try {
        const result = await executeTurnAndCommit(
          repo,
          sessionId,
          { player_input: playerInput },
          { rng: cryptoRng, callKp: kp },
        );
        send('complete', result.view);
      } catch (err) {
        send('error', { message: (err as Error).message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
