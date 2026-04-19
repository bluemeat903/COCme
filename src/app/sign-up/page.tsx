import Link from 'next/link';
import { signUpAction } from './actions';

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const sp = await searchParams;

  return (
    <section className="mx-auto max-w-md space-y-6">
      <h1 className="font-serif text-2xl">注册</h1>
      <p className="text-sm text-ink-300">
        邮箱和密码只保存在本机。不发邮件，不联系第三方。
      </p>
      <form action={signUpAction} className="space-y-4">
        <input type="hidden" name="next" value={sp.next ?? '/investigators'} />
        <label className="block text-sm">
          <span className="mb-1 block text-ink-200">邮箱</span>
          <input
            required
            type="email"
            name="email"
            autoComplete="email"
            className="w-full rounded border border-ink-700 bg-ink-900 px-3 py-2 outline-none focus:border-rust-500"
            placeholder="you@example.com"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-ink-200">密码（至少 6 位）</span>
          <input
            required
            type="password"
            name="password"
            autoComplete="new-password"
            minLength={6}
            className="w-full rounded border border-ink-700 bg-ink-900 px-3 py-2 outline-none focus:border-rust-500"
          />
        </label>
        <button
          type="submit"
          className="w-full rounded border border-rust-600 bg-rust-700/60 py-2 hover:bg-rust-600"
        >
          创建账号
        </button>
      </form>
      {sp.error && (
        <p className="rounded border border-rust-600/60 bg-rust-700/20 p-3 text-sm">
          {sp.error}
        </p>
      )}
      <p className="text-xs text-ink-400">
        已有账号？<Link href="/sign-in" className="underline hover:text-rust-500">登录</Link>
      </p>
    </section>
  );
}
