import { requireUser } from '@/lib/auth';
import { getUserDeepSeekKeyStatus } from '@/lib/localdb/users';
import { saveDeepSeekKeyAction, clearDeepSeekKeyAction } from './actions';
import { Card } from '@/app/_components/Card';

export const dynamic = 'force-dynamic';

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string; cleared?: string }>;
}) {
  const sp = await searchParams;
  const user = await requireUser();
  const status = await getUserDeepSeekKeyStatus(user.id);
  const envFallback = Boolean(process.env['DEEPSEEK_API_KEY']);

  return (
    <section className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-serif text-2xl">设置</h1>
        <p className="mt-1 text-sm text-ink-400">{user.email}</p>
      </div>

      {sp.error && (
        <p className="rounded border border-rust-600/60 bg-rust-700/20 p-3 text-sm">{sp.error}</p>
      )}
      {sp.saved && (
        <p className="rounded border border-emerald-600/60 bg-emerald-700/10 p-3 text-sm text-emerald-200">
          已保存；下一次 AI 生成或回合推进会用这把 key。
        </p>
      )}
      {sp.cleared && (
        <p className="rounded border border-ink-700 bg-ink-900 p-3 text-sm text-ink-300">
          已清除；现在会回落到服务器环境变量（如果有）。
        </p>
      )}

      <Card title="DeepSeek API key">
        <p className="mb-4 text-sm text-ink-300">
          用于 AI 生成模组、AI 导入整理、以及跑团中的 KP 推进。
          我们把它用 AES-256-GCM 加密后存在本地数据文件里，永远不会原样打印到日志或回显到网页。
          <br />
          <a
            href="https://platform.deepseek.com/api_keys"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-rust-500"
          >
            去 DeepSeek 控制台创建新的 key →
          </a>
        </p>

        <div className="mb-4 space-y-1 rounded border border-ink-800 bg-ink-950 p-3 text-sm">
          <div>
            <span className="text-ink-400">当前状态：</span>
            {status.configured ? (
              <span className="text-emerald-300">
                已配置
                {status.last4 !== null && <span className="ml-2 font-mono">…{status.last4}</span>}
              </span>
            ) : (
              <span className="text-ink-300">未配置</span>
            )}
          </div>
          {status.configured && status.updated_at && (
            <div className="text-xs text-ink-500">
              更新于 {new Date(status.updated_at).toLocaleString('zh-CN')}
            </div>
          )}
          {!status.configured && envFallback && (
            <div className="text-xs text-ink-500">
              当前回落到服务器的 DEEPSEEK_API_KEY 环境变量。
            </div>
          )}
          {!status.configured && !envFallback && (
            <div className="text-xs text-rust-400">
              服务器也没配 DEEPSEEK_API_KEY —— 必须填一个才能用 AI 功能。
            </div>
          )}
        </div>

        <form action={saveDeepSeekKeyAction} className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block text-ink-200">
              {status.configured ? '更新为新的 key' : '粘贴你的 key'}
            </span>
            <input
              required
              type="password"
              name="key"
              autoComplete="off"
              spellCheck={false}
              placeholder="sk-..."
              className="w-full rounded border border-ink-700 bg-ink-900 px-3 py-2 font-mono text-sm outline-none focus:border-rust-500"
            />
          </label>
          <p className="text-xs text-ink-500">
            以 <code>sk-</code> 开头，长度通常 30-40 字符。保存前我们不会做网络校验，写错了下次点生成才会失败。
          </p>
          <div className="flex gap-2">
            <button
              type="submit"
              className="rounded border border-rust-600 bg-rust-700/60 px-4 py-2 text-sm hover:bg-rust-600"
            >
              {status.configured ? '更新' : '保存'}
            </button>
            {status.configured && (
              <button
                type="submit"
                formAction={clearDeepSeekKeyAction}
                className="rounded border border-ink-700 bg-ink-900 px-4 py-2 text-sm text-ink-300 hover:border-rust-500 hover:text-rust-500"
              >
                清除
              </button>
            )}
          </div>
        </form>
      </Card>

      <Card title="账号">
        <div className="space-y-1 text-sm text-ink-300">
          <p>邮箱：{user.email}</p>
          <p className="text-xs text-ink-500">
            密码修改、重置邮件这些功能还没做；你要换账号只能注册一个新邮箱。
          </p>
        </div>
      </Card>
    </section>
  );
}
