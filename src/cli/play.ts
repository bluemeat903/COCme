#!/usr/bin/env -S node --experimental-strip-types --no-warnings
import * as readline from 'node:readline';
import { stdin, stdout, stderr } from 'node:process';
import { InMemorySessionRepo } from '../db/memory.js';
import { executeTurnAndCommit, pushLastFailedCheck, type KpCaller } from '../engine/index.js';
import { cryptoRng } from '../rules/index.js';
import { callKp, createDeepSeek } from '../ai/index.js';
import { buildDemoInvestigator, buildDemoModule } from './fixtures.js';
import { renderBanner, renderHelp, renderPlayerView } from './render.js';
import { createScriptedKp } from './scripted-kp.js';

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------
interface CliArgs {
  mode: 'dry-run' | 'live';
  max_turns: number;
}

function parseArgs(argv: string[]): CliArgs {
  let mode: CliArgs['mode'] = 'dry-run';
  let max_turns = 50;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--dry-run') mode = 'dry-run';
    else if (a === '--live') mode = 'live';
    else if (a === '--turns') {
      const n = Number(argv[++i]);
      if (!Number.isInteger(n) || n <= 0) throw new Error('--turns requires a positive integer');
      max_turns = n;
    } else if (a === '-h' || a === '--help') {
      printUsageAndExit(0);
    } else {
      stderr.write(`Unknown arg: ${a}\n`);
      printUsageAndExit(1);
    }
  }
  return { mode, max_turns };
}

function printUsageAndExit(code: number): never {
  stderr.write(
    [
      'Usage: npm run play [-- --live|--dry-run] [-- --turns N]',
      '',
      '  --dry-run     Use offline scripted KP (default).',
      '  --live        Call real DeepSeek. Requires DEEPSEEK_API_KEY.',
      '  --turns N     Cap total turns (default 50).',
      '',
    ].join('\n'),
  );
  process.exit(code);
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const kp: KpCaller = args.mode === 'live' ? makeLiveKp() : createScriptedKp();

  const ownerId = 'cli_user';
  const repo = new InMemorySessionRepo();
  const investigator = buildDemoInvestigator(ownerId);
  const moduleRow = buildDemoModule(ownerId);
  const { session_id } = await repo.createSession({
    owner_id: ownerId,
    investigator,
    module: moduleRow,
  });

  const rl = readline.createInterface({
    input: stdin,
    output: stdout,
    terminal: Boolean(stdin.isTTY),
  });
  const iter = rl[Symbol.asyncIterator]() as AsyncIterator<string>;

  async function readLine(prompt: string): Promise<string | null> {
    stdout.write(prompt);
    const { value, done } = await iter.next();
    if (done) return null;
    return value;
  }

  // Let Ctrl+C close rl gracefully.
  process.on('SIGINT', () => rl.close());

  stdout.write(renderBanner(args.mode, session_id));
  stdout.write(
    `调查员: ${investigator.name} / ${investigator.occupation} / ${investigator.age} 岁\n` +
      `模组: ${moduleRow.title}\n\n`,
  );
  stdout.write(renderHelp());

  // First turn: KP opens the scene (no player input).
  let playerInput: string | null = null;

  for (let turn = 0; turn < args.max_turns; turn++) {
    let result;
    try {
      result = await executeTurnAndCommit(
        repo,
        session_id,
        { player_input: playerInput },
        { rng: cryptoRng, callKp: kp },
      );
    } catch (err) {
      stderr.write(`\n[执行器错误] ${(err as Error).message}\n`);
      break;
    }

    stdout.write('\n' + renderPlayerView(result.view) + '\n');

    if (result.view.status !== 'active') break;

    const rawLine = await readLine('\n> ');
    if (rawLine === null) break;                // stdin EOF
    const raw = rawLine.trim();

    if (raw.length === 0) {
      playerInput = null;
      continue;
    }
    const lower = raw.toLowerCase();
    if (lower === 'q' || lower === 'exit' || lower === 'quit') break;
    if (lower === 'help' || lower === '?') {
      stdout.write('\n' + renderHelp());
      playerInput = null;
      continue;
    }
    if (lower === 'push') {
      try {
        const state = await repo.loadSession(session_id);
        const { resolution } = pushLastFailedCheck(state, cryptoRng);
        stdout.write(`\n[推动] ${resolution.summary}\n`);
        playerInput = '我选择推动上一次的检定。';
      } catch (err) {
        stderr.write(`\n[推动失败] ${(err as Error).message}\n`);
        playerInput = null;
      }
      continue;
    }

    // Numbered-option shortcut: "1" selects player_options[0].
    if (/^\d+$/.test(raw)) {
      const idx = parseInt(raw, 10) - 1;
      if (idx >= 0 && idx < result.view.options.length) {
        playerInput = result.view.options[idx]!;
      } else {
        playerInput = raw;
      }
    } else {
      playerInput = raw;
    }
  }

  rl.close();
  const final = await repo.loadSession(session_id);
  stdout.write(
    `\n————————————————————————————————————————————————\n` +
      `会话结束 · 回合数 ${final.turns.length} · 状态 ${final.status}` +
      `${final.ending ? ` · 结局 ${final.ending}` : ''}\n` +
      `线索: ${Object.values(final.clues).filter(c => c.discovered).map(c => c.clue_key).join(', ') || '(无)'}\n`,
  );
}

function makeLiveKp(): KpCaller {
  if (!process.env['DEEPSEEK_API_KEY']) {
    stderr.write(
      '错误: 未检测到 DEEPSEEK_API_KEY。\n' +
        '  - 复制 .env.example 到 .env.local 并填入你的 key，然后 `npm run play:live`\n' +
        '  - 或直接 `npm run play:dry` 跑离线脚本模式\n',
    );
    process.exit(1);
  }
  const ds = createDeepSeek();
  const kp: KpCaller = async (ctx: unknown) => {
    return callKp({ context: ctx }, {}, { chat: ds.chat, chatModel: ds.chatModel });
  };
  return kp;
}

main().catch(err => {
  stderr.write(`\n[致命] ${(err as Error).stack ?? err}\n`);
  process.exit(1);
});
