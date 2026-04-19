# COC · 单人调查 · Single-player Horror TRPG Engine

一个基于 **BRP / CoC 7e** 规则的单人恐怖调查跑团网页引擎。你建一张调查员卡、选一个模组（或让 AI 为你写一个），剩下的 KP（守秘人）、叙事、检定、落库全部交给服务端。

DeepSeek 负责"会讲故事"，纯 TypeScript 写的规则引擎负责"会定成败"——模型不碰骰子，规则引擎不编剧。两层分开，各干各的，谁也不能越界。

---

## 这是什么

- **单人、离线优先**：所有数据默认存在本机的 `./data/*.json` 里，不依赖任何云。
- **端到端跑一局流程**：注册登录 → 建卡（带实时技能点预算 UI） → AI 生成模组（或粘贴导入已有剧情） → 开局 → 带骰子动画的回合推进 → 局后复盘 + 成长应用。
- **KP 是 DeepSeek**：`deepseek-chat` 负责每回合的叙事 + 选项，`deepseek-reasoner` 负责生成/整理模组结构。模型只提"建议掷什么检定"，不掷骰、不改状态。
- **规则引擎纯 TS**：d100、奖励/惩罚骰、难度分级、推动检定、对抗、SAN 检定，全部单元测试覆盖（`npm test` 74 项）。
- **流式回合**：每次回合 KP 的叙事通过 SSE 边写边显示到前端，不用盯着 loading 转圈 30 秒。
- **每个用户自己填 key**：`/settings` 页面里把自己的 DeepSeek key 贴进去，AES-256-GCM 加密存盘。

![routes-15](https://img.shields.io/badge/routes-16-8b3a23) ![tests-74](https://img.shields.io/badge/tests-74%20passing-emerald) ![nextjs-15](https://img.shields.io/badge/Next.js-15-black) ![ts](https://img.shields.io/badge/TypeScript-strict-3178c6)

---

## 功能一览

### 调查员

- 完整 BRP 8 属性 + 派生值（HP / MP / SAN / MOV / DB / Build）
- 年龄档修正（15-19 / 20-39 / 40+ / 50+ / 60+ / 70+ / 80+）
- 33 条中文技能，按调查 / 人际 / 身体 / 战斗 / 知识 / 技术 / 语言 / 特殊 分组
- 3 个职业模板：**记者 / 学者 / 警探**（每个的技能点公式与职业技能集）
- 实时技能点预算 UI：职业点（按公式 `EDU×4` / `EDU×2+DEX×2` 等） + 兴趣点（`INT×2`），超支时提交按钮灰掉
- 锁定 `克苏鲁神话` 技能，建卡阶段禁止分配
- 详情页 + 归档；跑团界面右侧可开合的"人物卡抽屉"

### 模组

- **AI 生成**：给出主题 / 时代 / 基调 / 目标时长，reasoner 产一个符合 canonical schema 的模组结构（前情 / 地点 / NPC / 线索 / 场景 / 遭遇 / 结局）
- **粘贴导入**：把已有的剧情文档贴进来，AI 整理成同一份 schema，缺失的部分合理补全并写进 `meta.warnings`
- 详情页：完整展示所有字段 + 跨引用校验（线索指向的地点 / 场景 / NPC / clue 是否存��）
- 分片 + metadata：每条模组切成检索单位（premise / location / npc / clue / scene / ending），embedding 列暂留空

### 跑团

- **开场白自动流式铺陈**：进入新 session 自动触发，~1000-1500 字的文学化开场，不抛检定只铺气氛
- **骰子动画**：十位 + 个位两颗骰子摇 ~900ms 落定，按 outcome 高亮（大成功金 / 困难成功绿 / 失败锈色 / 大失败暗红）
- **流式叙事**：通过 `/api/sessions/[id]/turn` 的 SSE，KP 一边生成文字一边显示，边上还有实时脉动光标
- **人物卡抽屉**：右侧竖排"人物卡"标签，点开滑入完整 sheet（属性 / 派生 / 技能 / 物品），Esc / 点遮罩 / 按钮关闭
- **线索板侧栏**：已发现的线索可折叠查看
- **推动检定**：失败后点"推动"再掷一次，带叙事惩罚；结果落库
- **放弃本局** / **结束自动提示复盘**

### 结算与成长

- 复盘页：状态 / HP/SAN/Luck 变化（带色差） / 线索 / 检定记录 / 事件时间线
- 一键"应用成长"：按 CoC 7e 规则 d100 > 技能值 → 1d10 加成，终局 HP/SAN/Luck 回写调查员档案
- 新增恐惧 / 躁狂 append 到 background

### 认证与数据

- 本地邮箱 + 密码注册（bcryptjs 10 轮），零外部服务
- HMAC 签名的 session cookie，14 天有效
- 每用户自选 DeepSeek key：`/settings` 粘贴后 AES-256-GCM 加密落 `data/users.json`
- 所有业务数据在 `./data/` 下的 JSON 文件（`users / investigators / modules / sessions / turns / checks / session_events / session_clues / session_npcs / growth_records` 等）

---

## 技术栈

- **Next.js 15 App Router** + React 19
- **TypeScript** strict + `exactOptionalPropertyTypes`
- **Tailwind CSS v3** (`ink` / `rust` 双色调)
- **Zod** — 所有 AI 输出都走 schema 校验
- **bcryptjs** — 密码哈希（无 native 依赖）
- **OpenAI SDK** 指向 `https://api.deepseek.com` — 原生 JSON 结构化输出 + 流式
- **Vitest** — 74 个规则引擎 / 建卡器 / 模组管道 / 存储层单元测试

---

## 快速开始

### 前置条件

- Node.js **20+**
- 一把 DeepSeek API key（注册/登录后在 UI 的 `/settings` 填；也可以提前写到 `.env.local`）

### 装依赖 + 启动

```bash
git clone https://github.com/bluemeat903/COCme.git
cd COCme
npm install

# 配一份 .env.local
cat > .env.local <<EOF
SESSION_SECRET=$(openssl rand -hex 32)
# 下面这一行可留空 —— 每个用户可在 /settings 里自己填
DEEPSEEK_API_KEY=
EOF

# 开发模式（热加载）
npm run dev

# 或生产模式
npm run build
npm start
```

打开 <http://localhost:3000>（或你选的端口），注册邮箱 + 密码，进 `/settings` 粘贴 DeepSeek key，然后：

```
/investigators/new  →  建卡（填属性 + 分配技能）
/modules/new        →  AI 生成一份模组（30s - 2min）
/sessions/new       →  选一人 × 一模 → 开局 → 看流式开场白 🎲
```

### 自定端口

```bash
# 开发
npx next dev -p 7878 -H 0.0.0.0

# 生产
PORT=7878 npm start
```

---

## 项目结构

```
src/
├── app/                  Next.js App Router
│   ├── _components/      共享 UI (DiceRoll / InvestigatorDrawer / ClueBoard / Card / LongTaskButton)
│   ├── sessions/[id]/    跑团主界面 (GameView 客户端 + SSE 消费)
│   ├── sessions/[id]/summary/  局后复盘 + 应用成长
│   ├── investigators/    人物卡列表 / 详情 / 新建（含技能分配 UI）
│   ├── modules/          模组列表 / 详情 / AI 生成 / 粘贴导入
│   ├── api/sessions/[id]/turn/  SSE 流式回合 route handler
│   ├── settings/         DeepSeek key 管理页
│   ├── sign-in / sign-up / sign-out
│   └── layout.tsx, page.tsx, globals.css
│
├── engine/               规则引擎上层：回合状态机 + 持久化
│   ├── state.ts          SessionState / TurnRecord / SessionEvent 联合
│   ├── executor.ts       executeTurn() 主循环 + pushLastFailedCheck
│   ├── ops.ts            applyStateOp — 14 种 StateOp 的副作用实现
│   ├── context.ts        buildKpContext — 给 KP 的输入切片
│   ├── projection.ts     PlayerView / HudSnapshot / InvestigatorSheet
│   ├── persist.ts        computeTurnDelta — prev/next state 差分
│   ├── runner.ts         executeTurnAndCommit — load → run → commit
│   └── summary.ts        computeSummary + computeGrowth (成长检定)
│
├── rules/                纯 TS BRP 规则引擎（0 依赖 AI）
│   ├── rng.ts            cryptoRng + seeded mulberry32
│   ├── dice.ts           d100 / NdM+K 表达式解析
│   ├── check.ts          难度分级 / 暴击 / 大失败 / 推动 / 对抗
│   └── san.ts            SAN 检定 + 疯狂阈值
│
├── schemas/              Zod contracts
│   ├── kp-output.ts      KP 每回合的 JSON 契约
│   ├── state-op.ts       14 种 StateOp 的 discriminated union
│   └── module.ts         canonical ModuleContent
│
├── ai/                   AI provider 层
│   ├── provider.ts       ChatCompletion 抽象类型
│   ├���─ deepseek.ts       createDeepSeek(apiKey) → {chat, client, chatModel, reasonModel}
│   ├── json-call.ts      callJsonWithSchema — 自动 retry-on-schema-fail
│   ├── stream.ts         streamCallKp — SSE + 部分 JSON 渐进解析 + 未知 op 过滤
│   └── prompt.ts         KP 系统提示（含开场白特例 + op 命名一致性警告）
│
├── character/            建卡器
│   ├── skills.ts         33 条中文技能 + 基础值 + 类别标签
│   ├── occupations.ts    职业模板（记者 / 学者 / 警探）
│   ├── derived.ts        HP/MP/SAN/MOV/DB/Build + 年龄修正
│   ├── builder.ts        buildInvestigator — draft → InvestigatorRow
│   └── snapshot.ts       investigator → session snapshot 转换
│
├── modules/              模组管道
│   ├── generator.ts      AI 原创 (theme → ModuleRow)
│   ├── importer.ts       文档 → ModuleRow
│   ├── chunker.ts        canonical → retrieval chunks
│   └── validate.ts       跨引用校验
│
├── db/                   持久化层
│   ├── repo.ts           SessionRepo 接口
│   ├── local.ts          LocalSessionRepo (JSON-backed, 默认)
│   ├── memory.ts         InMemorySessionRepo (tests)
│   ├── supabase.ts       SupabaseSessionRepo (未使用，为未来云端模式留着)
│   └── types.ts          DB 行类型
│
├── lib/
│   ├── auth.ts           requireUser / requireSessionOwner / cookie helpers
│   ├── session-cookie.ts HMAC 签名 cookie
│   ├── crypto.ts         AES-256-GCM for per-user DeepSeek keys
│   ├── localdb/db.ts     LocalDB 单进程持久化 (globalThis singleton + mtime 失效)
│   ├── localdb/users.ts  注册 / 登录 / key 管理
│   ├── deepseek-resolver.ts  用户 key → env fallback 优先级
│   └── supabase/*        (未使用) Supabase 客户端
│
└── cli/                  终端试玩（离线脚本 KP，开发辅助）

supabase/migrations/      可选云端模式的 Postgres migrations（0001..0004）
docs/
├── schema.md             领域模型 / 不变量 / AI 接触面
└── DEPLOY.md             实验室服务器拉式部署指南
```

---

## 关键设计

### 1. AI 只负责叙事，不碰状态

KP 每回合必须输出严格 schema 的 JSON（[`KpOutput`](src/schemas/kp-output.ts)）：

```json
{
  "scene_id": "scene_warehouse_ext",
  "visible_narration": "你站在仓库外……",
  "player_options": ["推开侧门", "敲门", "绕到后巷"],
  "required_check": { "kind": "skill", "skill_or_stat": "侦查", "difficulty": "regular", ... },
  "state_ops": [{ "op": "advance_clock", "minutes": 2 }, { "op": "reveal_clue", "clue_key": "clue_note" }],
  "hidden_notes": ["玩家还没注意到码头工人"]
}
```

- **`required_check`** 只是"建议哪种检定"，服务端用 CSPRNG 掷骰并写 `checks` 表
- **`state_ops`** 是"想做哪些状态变更"，服务端的 [`applyStateOp`](src/engine/ops.ts) 执行并写 `session_events`
- **`hidden_notes`** 只给下一回合的 KP 看，绝不渲染给玩家
- 未知 op 名称（模型瞎编）+ 未知 key 引用 → 默默跳过 + 警告日志，回合继续

### 2. 模组双来源统一 schema

不管是 AI 生成还是用户粘贴导入，最终都落到同一个 canonical [`ModuleContent`](src/schemas/module.ts) JSONB，运行时只认一个结构：

```
{ meta, premise, locations[], npcs[], clues[], truth_graph, scene_nodes[], encounters[], ending_conditions[] }
```

### 3. 调查员状态分两层

- [`investigators`](src/db/types.ts) — 出厂态（档案），跨 session 存在
- [`session_investigator_states`](src/db/types.ts) — 当局可变快照

局结束后，玩家点"应用成长"才把 current_state 回写到 investigator（技能成长检定、final HP/SAN 持久化、新增恐惧/躁狂）。

### 4. 每回合事务化落库

```
executeTurnAndCommit
  = loadSession(id)
  → executeTurn(state, input, { rng, callKp })      ← in-memory clone
  → computeTurnDelta(prev, next)                    ← 差分出要写的行
  → repo.commitTurn(delta)                          ← 原子提交
```

中途任何 throw 都不落库。`delta` 包括 `new_turns / new_checks / new_events / clue_upserts / npc_upserts / investigator_current_state / session_patch`。

### 5. 流式回合

`/api/sessions/[id]/turn` 是一个 Route Handler，返回 `text/event-stream`：

```
event: narration   data: { "text": "你站在…" }   ← 每次文字增长
event: narration   data: { "text": "你站在仓库外，雨声敲着…" }
...
event: complete    data: <full PlayerView>        ← 落库完成后最终 view
```

前端 `GameView` 用 `fetch` + `ReadableStream` 消费，文字边流边显示。服务端用正则 + 部分 JSON 解析从累积的字符里渐进提取 `visible_narration` 字段。

---

## 环境变量

| 变量 | 必需 | 说明 |
|------|------|------|
| `SESSION_SECRET` | ✅ ≥16 字符 | HMAC 签名 session cookie + 派生 KEK 加密用户 DeepSeek key |
| `DEEPSEEK_API_KEY` | 可选 | 服务器级默认 key，fallback；每用户可在 `/settings` 覆盖 |
| `LOCAL_DATA_DIR` | 可选 | 数据文件目录，默认 `./data` |
| `NEXT_PUBLIC_SUPABASE_URL` | 未用 | Supabase 云端模式预留，本地模式不需要 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 未用 | 同上 |
| `SUPABASE_SERVICE_ROLE_KEY` | 未用 | 同上 |

`SESSION_SECRET` 生成：`openssl rand -hex 32`。**重要：换了这个变量后所有用户存的 DeepSeek key 都解不开，得让用户重新登录 + 重填 key。**

---

## 命令

```bash
npm run dev            # 开发模式，热加载
npm run build          # 生产构建到 .next/
npm start              # 生产启动（要先 build）
npm run typecheck      # tsc --noEmit
npm test               # vitest run，74 项单元测试
npm run test:watch     # vitest 监听模式

# 离线 CLI 跑团（开发辅助，走脚本 KP 不烧 token）
npm run play:dry

# 真 DeepSeek 跑 CLI
npm run play:live
```

---

## 存储 / 安全

- 所有业务数据：`./data/*.json`（被 `.gitignore`），每次 mutation 走 atomic write-to-temp + rename
- 密码：bcrypt 10 轮哈希
- Session cookie：`<userId>.<issuedMs>.<HMAC-SHA256>`，timing-safe 校验，14 天 TTL
- 用户的 DeepSeek key：AES-256-GCM，KEK = `SHA256(SESSION_SECRET || "::deepseek-key-kek")`，永不回显
- 每次 AI 调用的 key 只存在于单次请求的内存里，不打印到日志

威胁模型：本地单机 / 小型实验室部署。**不防 root 攻击者**（他们读得到 `SESSION_SECRET`，能解密所有 key）。这对离线模式来说是合理的取舍。

---

## 还没做的

- **Embeddings**：`module_chunks.embedding` 列留着，目前所有检索走 KP 自己过滤模组切片
- **多人 / 协作**：完全单人
- **语音 KP**：可能接 DeepSeek Voice / OpenAI Realtime，当前不做
- **密码重置 / 邮件验证**：本地模式无邮件能力
- **手机响应式**：桌面优先，手机大致能看但抽屉/侧栏布局未优化
- **国际化**：纯中文 UI
- **Session 列表页**：只能通过 URL 直接访问进行中的 session；"我有哪些未完成的局" 没列表入口

---

## 协议与致敬

- **规则基础**：BRP / Chaosium 的 CoC 7e；本引擎以 BRP 通用骨架设计，CoC 专属内容（神话技能 / Lovecraftian 专有名词等）保留给上层模组内容
- **内容审慎**：生成提示里明确避让 Chaosium 的 Product Identity（神话神祇专有名词、"Call of Cthulhu" 商标字样），用通用恐怖意象表达
- 代码：MIT（如果你要 fork，请保留 `/docs/schema.md` 里关于 IP 边界的那一节）

---

## 贡献

目前是单人项目，欢迎 issue 讨论。代码规范：

- Strict TypeScript，`exactOptionalPropertyTypes` 开启
- 纯函数优先，副作用集中在 `ops.ts` / `actions.ts`
- AI 调用必须走 `callJsonWithSchema` / `streamCallKp`，不绕过 Zod 校验
- 新 StateOp 要同时更新 `src/schemas/state-op.ts`、`src/engine/ops.ts`、`src/ai/stream.ts` 的 `KNOWN_OPS` 集合，以及 `src/ai/prompt.ts` 里 KP 能看到的 op 清单

---

## 仓库地址

<https://github.com/bluemeat903/COCme>
