import { generateModuleAction } from '../actions';
import { LongTaskButton } from '@/app/_components/LongTaskButton';

export const dynamic = 'force-dynamic';

export default async function NewModulePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;

  return (
    <section className="mx-auto max-w-2xl space-y-6">
      <h1 className="font-serif text-2xl">AI 生成新模组</h1>
      <p className="text-sm text-ink-300">
        输入一些关键词，由 DeepSeek 的 reasoner 生成一份 2-3 小时的单人调查模组。
        reasoner 思考较久，通常 <strong className="text-ink-100">30 秒 - 2 分钟</strong>；
        按钮上会显示实时耗时，生成期间请保持本页打开、勿重复点击。
      </p>
      <p className="text-xs text-ink-400">
        已经有剧情文档？
        <a href="/modules/import" className="ml-1 underline hover:text-rust-500">
          粘贴导入
        </a>
        。
      </p>

      {sp.error && (
        <p className="rounded border border-rust-600/60 bg-rust-700/20 p-3 text-sm">
          {sp.error}
        </p>
      )}

      <form action={generateModuleAction} className="space-y-4">
        <label className="block text-sm">
          <span className="mb-1 block text-ink-200">主题</span>
          <input
            name="theme"
            required
            placeholder="e.g. 码头仓库里失踪的工人、褪色的航海日志"
            className="w-full rounded border border-ink-700 bg-ink-900 px-3 py-2 outline-none focus:border-rust-500"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-ink-200">时代</span>
          <select
            name="era"
            defaultValue="1920s"
            className="w-full rounded border border-ink-700 bg-ink-900 px-3 py-2 outline-none focus:border-rust-500"
          >
            <option value="1920s">1920s 经典</option>
            <option value="modern">现代</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-ink-200">基调（可选）</span>
          <input
            name="tone"
            placeholder="classic / pulp / 非神话的都市怪谈 / ..."
            className="w-full rounded border border-ink-700 bg-ink-900 px-3 py-2 outline-none focus:border-rust-500"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-ink-200">目标时长（分钟）</span>
          <input
            name="duration_min"
            type="number"
            min={30}
            max={240}
            defaultValue={120}
            className="w-full rounded border border-ink-700 bg-ink-900 px-3 py-2 outline-none focus:border-rust-500"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-ink-200">额外要求（可选）</span>
          <textarea
            name="extra"
            rows={3}
            placeholder="e.g. 主 NPC 是一名海员遗孀、结局里要有道德两难"
            className="w-full rounded border border-ink-700 bg-ink-900 px-3 py-2 outline-none focus:border-rust-500"
          />
        </label>
        <LongTaskButton pendingLabel="生成中（reasoner 思考）">开始生成</LongTaskButton>
      </form>
    </section>
  );
}
