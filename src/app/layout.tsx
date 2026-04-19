import type { Metadata } from 'next';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import './globals.css';

export const metadata: Metadata = {
  title: 'COC 单人调查',
  description: '单人 BRP 兼容恐怖调查网页引擎',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser().catch(() => null);

  return (
    // suppressHydrationWarning: some browser extensions (e.g. Redeviation BS)
    // inject data-* attributes on <html> before React hydrates.  This flag
    // only relaxes the mismatch check for this element's own attributes -- it
    // does NOT silence real hydration bugs inside the tree.
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="min-h-screen bg-ink-950 text-ink-100" suppressHydrationWarning>
        <header className="border-b border-ink-800">
          <nav className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
            <Link href="/" className="font-serif text-xl tracking-wide">
              COC<span className="text-rust-500">·</span>调查
            </Link>
            <div className="flex items-center gap-6 text-sm">
              {user ? (
                <>
                  <Link href="/investigators" className="hover:text-rust-500">
                    人物卡
                  </Link>
                  <Link href="/modules" className="hover:text-rust-500">
                    模组
                  </Link>
                  <Link href="/sessions/new" className="hover:text-rust-500">
                    开局
                  </Link>
                  <Link href="/settings" className="hover:text-rust-500">
                    设置
                  </Link>
                  <span className="text-ink-400">{user.email}</span>
                  <form action="/sign-out" method="post">
                    <button
                      type="submit"
                      className="rounded border border-ink-700 px-3 py-1 hover:border-rust-500"
                    >
                      登出
                    </button>
                  </form>
                </>
              ) : (
                <>
                  <Link href="/sign-in" className="hover:text-rust-500">
                    登录
                  </Link>
                  <Link
                    href="/sign-up"
                    className="rounded border border-rust-600 bg-rust-700/50 px-3 py-1 hover:bg-rust-600"
                  >
                    注册
                  </Link>
                </>
              )}
            </div>
          </nav>
        </header>
        <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
      </body>
    </html>
  );
}
