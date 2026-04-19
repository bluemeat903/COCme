import Link from 'next/link';
import { signInAction } from './actions';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const sp = await searchParams;

  return (
    <section className="mx-auto max-w-md space-y-6">
      <h1 className="font-serif text-2xl">登录</h1>
      <form action={signInAction} className="space-y-4">
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
          <span className="mb-1 block text-ink-200">密码</span>
          <input
            required
            type="password"
            name="password"
            autoComplete="current-password"
            className="w-full rounded border border-ink-700 bg-ink-900 px-3 py-2 outline-none focus:border-rust-500"
          />
        </label>
        <button
          type="submit"
          className="w-full rounded border border-rust-600 bg-rust-700/60 py-2 hover:bg-rust-600"
        >
          登录
        </button>
      </form>
      {sp.error && (
        <p className="rounded border border-rust-600/60 bg-rust-700/20 p-3 text-sm">
          {sp.error}
        </p>
      )}
      <p className="text-xs text-ink-400">
        没有账号？<Link href="/sign-up" className="underline hover:text-rust-500">注册</Link>
      </p>
    </section>
  );
}
