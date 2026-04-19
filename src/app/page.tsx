import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function Landing() {
  const user = await getCurrentUser().catch(() => null);

  return (
    <section className="prose prose-invert mx-auto max-w-3xl space-y-8">
      <h1 className="font-serif text-4xl leading-tight tracking-wide">
        一个人<span className="text-rust-500">、</span>一位调查员
        <br />
        一场不必解释给别人听的恐怖
      </h1>
      <p className="text-ink-300 leading-relaxed">
        这是一个单人的、全自动的 BRP 兼容恐怖调查网页引擎。
        你建一张卡，选一个模组（或者让 AI 为你写一个），然后开始。
        守秘人是 AI；检定和规则判定由服务端的规则引擎独立执行。
      </p>
      <div className="flex gap-3">
        {user ? (
          <Link
            href="/investigators"
            className="rounded border border-rust-600 bg-rust-700/50 px-5 py-2 hover:bg-rust-600"
          >
            进入你的调查档案
          </Link>
        ) : (
          <>
            <Link
              href="/sign-up"
              className="rounded border border-rust-600 bg-rust-700/50 px-5 py-2 hover:bg-rust-600"
            >
              注册（邮箱 + 密码）
            </Link>
            <Link
              href="/sign-in"
              className="rounded border border-ink-700 px-5 py-2 hover:border-rust-500"
            >
              登录
            </Link>
          </>
        )}
      </div>
    </section>
  );
}
