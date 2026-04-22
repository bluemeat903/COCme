# COC · 单人调查 · Single-player Horror TRPG Engine

基于 **BRP / CoC 7e** 规则的单人恐怖调查跑团网页引擎。建一张调查员卡，选一份模组（或让 AI 现写一份），剩下的 KP、叙事、检定、落库全都交给服务端。可选地挂一个本地 ComfyUI，每回合顺便产一张 16-bit 像素风的场景图。

DeepSeek 负责"会讲故事"，纯 TypeScript 写的规则引擎负责"会定成败"——模型不碰骰子，规则引擎不编剧。两层分开，各干各的，谁也不能越界。

![routes-20](https://img.shields.io/badge/routes-19-8b3a23) ![tests-74](https://img.shields.io/badge/tests-74%20passing-emerald) ![nextjs-15](https://img.shields.io/badge/Next.js-15-black) ![ts](https://img.shields.io/badge/TypeScript-strict-3178c6) ![visuals](https://img.shields.io/badge/visuals-ComfyUI%20%2B%20FLUX-7c3aed)

---

## 这是什么

- **单人、离线优先**：所有数据默认存在本机的 `./data/*.json`，不依赖任何云。
- **端到端跑一局**：注册登录 → 建卡（实时技能点预算） → AI 生成/导入模组 → 开局 → 流式叙事 + 骰子动画 + 像素插画 → 局后复盘 + 成长应用。
- **KP 是 DeepSeek**：`deepseek-chat` 负责每回合的叙事/选项，`deepseek-reasoner` 负责生成/整理模组结构。模型只"建议掷什么检定"，不掷骰、不改状态。
- **规则引擎纯 TS**：d100、奖励/惩罚骰、难度分级、推动检定、对抗、SAN 检定，74 个 vitest 覆盖。
- **流式回合**：每回合 KP 的叙事通过 SSE 边写边显示，不用盯着 loading 转圈 30 秒。
- **可选本地 AI 绘图**：挂一个 ComfyUI（FLUX.1 [schnell]），每回合 ~2 秒出一张 640×384 的低饱和像素风定场图；每条线索也自带一张证物图。跑在本地 GPU，图不上云。
- **每用户自己填 key**：`/settings` 里粘贴 DeepSeek / ComfyUI 配置，AES-256-GCM 加密落盘。

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

- **AI 生成**：给出主题 / 时代 / 基调 / 目标时长，reasoner 产一个符合 canonical schema 的模组结构（前情 / 地点 / NPC / 线索 / 真相图 / 场景 / 遭遇 / 结局）。带**渐进式进度条** + 阶段标签（"reasoner 思考 → 生成结构 → 编织线索 → 整理结局"）
- **粘贴导入**：把已有剧情文档贴进来，chat 模型整理成同一份 schema，缺失部分合理补全并写进 `meta.warnings`
- 详情页：完整展示所有字段 + 跨引用校验（线索指向的地点/场景/NPC/其它 clue 是否存在）
- 分片 + metadata：每份模组切成检索单位（premise / location / npc / clue / scene / ending），embedding 列暂留空

### 跑团

- **自动流式开场**：新 session 自动触发一次回合（player_input=null），~1000-1500 字的文学化开场，不抛检定只铺气氛
- **流式叙事**：`/api/sessions/[id]/turn` 是一个 SSE route，KP 一边生成文字一边显示，边上实时脉动光标
- **每回合顺便出一张场景图**：commit 成功后异步派发 job 给 ComfyUI，图好了挂在叙事卡上方。KP 每回合填一段英文 `visual_brief`（spoiler-safe）做 prompt，让图贴合当前氛围
- **骰子动画**：十位 + 个位两颗摇 ~900ms 落定，按 outcome 高亮（暴击金 / 困难绿 / 失败锈色 / 大失败暗红）。check_resolved 事件通过 SSE 提前下发，让骰子动画和 KP 写稿并行
- **检定结果影响叙事**：KP system prompt 里有强约束（R1-R5），成功必须写出"捕获到细节"、失败必须写"没看清/抓空"，并用不同的图构图反映（成功 → 聚焦清晰近景；失败 → 空/模糊/远景）
- **人物卡抽屉**：右侧竖排"人物卡"标签，点开滑入完整 sheet（属性 / 派生 / 技能 / 物品），Esc / 点遮罩 / 按钮关闭
- **线索板侧栏**：发现的线索可折叠，每条带 ◆ / ◌ / ⨯ 小标提示图片状态；展开可看证物图
- **推动检定**：失败后点"推动"再掷一次，带叙事惩罚；结果落库
- **放弃本局** / **Session 列表页**（`/sessions`）按"进行中 / 过往"分组

### 结算与成长

- 复盘页：状态 / HP/SAN/Luck 变化（带色差） / 线索 / 检定记录 / 事件时间线
- 一键"应用成长"：按 CoC 7e 规则 d100 > 技能值 → 1d10 加成，终局 HP/SAN/Luck 回写调查员档案
- 新增恐惧 / 躁狂 append 到 background

### 视觉层（可选 ComfyUI）

- **模型**：FLUX.1 [schnell] all-in-one 检查点（17 GB 单文件，含 UNet + dual CLIP + VAE）
- **分辨率**：场景 640×384、证物 512×512；H20 上 4-step ~2 秒一张
- **像素风 pipeline**：工作流在 VAE decode 后先 area-downsample 到 1/4 分辨率，再 nearest-exact 回到原尺寸，出真"块状像素"而不是 FLUX 的软像素；UI 用 `image-rendering: pixelated` 渲染
- **风格**：低饱和、16-32 色索引调色板、抖动阴影、复古恐怖游戏语汇（Yume Nikki / Ib / Faith / Petscop 参照），负向词屏蔽写实 / 卡通 / 鲜艳
- **触发**：每个 KP 回合自动生成场景图；`reveal_clue` 事件触发证物图；都是异步 job，失败不影响回合推进
- **Prompt 来源**：优先用 KP 本回合的 `visual_brief`（英文，spoiler-safe），回落到模组的 `visual_hint`，再回落到模板 fallback
- **可切档位**：`off` / `key_only`（只关键线索） / `normal`（所有线索 + 每回合场景）
- **可清盘**：`/settings` → 危险区域，支持"只清图片"或"清全部跑团存档"（保留人物卡和模组）

### 认证与数据

- 本地邮箱 + 密码注册（bcryptjs 10 轮），零外部服务
- HMAC 签名的 session cookie，14 天有效
- 每用户自选 DeepSeek key + ComfyUI URL：`/settings` 里粘贴后 AES-256-GCM 加密落 `data/users.json`
- 所有业务数据在 `./data/` 下的 JSON 文件（`users / investigators / modules / sessions / turns / checks / session_events / session_clues / session_npcs / growth_records / visual_assets` 等）
- 生成的图：`./data/assets/visuals/<uuid>.png`
- Per-session 异步互斥锁保护 `load → execute → commit` 免于并发回合竞态

---

## 技术栈

- **Next.js 15 App Router** + React 19
- **TypeScript** strict + `exactOptionalPropertyTypes`
- **Tailwind CSS v3** (`ink` / `rust` 双色调)
- **Zod** — 所有 AI 输出都走 schema 校验
- **bcryptjs** — 密码哈希（无 native 依赖）
- **OpenAI SDK** 指向 `https://api.deepseek.com` — 原生 JSON 结构化输出 + 流式
- **ComfyUI** (可选) — 本地 FLUX.1 [schnell] 推理
- **Vitest** — 74 个规则引擎 / 建卡器 / 模组管道 / 存储层单元测试

---

## 快速开始

### 前置条件

- Node.js **20+**
- 一把 DeepSeek API key（可在 `/settings` 填；也可提前写到 `.env.local`）
- （可选）本机一张至少 12 GB VRAM 的 NVIDIA GPU 用于 ComfyUI + FLUX Schnell fp8

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

打开 <http://localhost:3000>（或你选的端口）。注册邮箱 + 密码 → `/settings` 粘 DeepSeek key → 然后：

```
/investigators/new  →  建卡（填属性 + 分配技能）
/modules/new        →  AI 生成一份模组（30s - 2min，带进度条）
/sessions/new       →  选一人 × 一模 → 开局 → 看流式开场白 🎲
/sessions           →  所有存档，进行中/过往分组
```

### 自定端口

```bash
# 开发
npx next dev -p 7878 -H 0.0.0.0

# 生产
PORT=7878 npm start
```

### 可选：挂本地 ComfyUI 出图

仓库里已经有一份可用安装脚本的痕迹（`ComfyUI/`，gitignore），按这个顺序即可：

```bash
# 1. 拉 ComfyUI
git clone https://github.com/comfyanonymous/ComfyUI ./ComfyUI     # 或 https://gitee.com/mirrors/ComfyUI.git 镜像
cd ComfyUI

# 2. 建 venv（Python 3.10-3.12 都行）
python3.11 -m venv venv
# 把 pip cache 挪开（避免把系统盘填满）
export PIP_CACHE_DIR="$PWD/pip-cache"
export TMPDIR="$PWD/tmp"
mkdir -p "$PIP_CACHE_DIR" "$TMPDIR"

# 3. 装 torch (CUDA 12.6 + tsinghua 镜像)
./venv/bin/pip install \
  -i https://pypi.tuna.tsinghua.edu.cn/simple \
  --extra-index-url https://download.pytorch.org/whl/cu126 \
  torch torchvision torchaudio torchsde

# 4. 装 ComfyUI 其它依赖
./venv/bin/pip install -i https://pypi.tuna.tsinghua.edu.cn/simple -r requirements.txt

# 5. 下 FLUX Schnell all-in-one 检查点 (~17 GB)
mkdir -p models/checkpoints
curl -fsSL --retry 3 -o models/checkpoints/flux1-schnell-fp8.safetensors \
  https://hf-mirror.com/Comfy-Org/flux1-schnell/resolve/main/flux1-schnell-fp8.safetensors

# 6. 启动（COMFY_GPU 锁定一张卡；默认 cuda:1）
cd ..
./ComfyUI/start.sh    # 默认 127.0.0.1:8188
```

然后在 `/settings` 里勾上"启用证物图像生成"，ComfyUI 地址写 `http://127.0.0.1:8188`，保存。下一回合就会有图。

---

## 项目结构

```
src/
├── app/                  Next.js App Router
│   ├── _components/      共享 UI (DiceRoll / SceneVisual / ClueBoard /
│   │                       InvestigatorDrawer / Card / GenerationProgress)
│   ├── sessions/         Session 列表页 + 路径分组
│   ├── sessions/[id]/    跑团主界面 (GameView 客户端 + SSE 消费)
│   ├── sessions/[id]/summary/  局后复盘 + 应用成长
│   ├── investigators/    人物卡列表 / 详情 / 新建（含技能分配 UI）
│   ├── modules/          模组列表 / 详情 / AI 生成 / 粘贴导入（带进度条）
│   ├── api/sessions/[id]/turn/       SSE 流式回合
│   ├── api/visuals/session/[id]/     当前 session 所有图片资产
│   ├── api/visuals/[id]/image/       读一张图的 PNG 字节
│   ├── dice-lab/         独立骰子动画调试页
│   ├── settings/         DeepSeek key + 图像开关 + 危险区域
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
│   └── summary.ts        computeSummary + computeGrowth
│
├── rules/                纯 TS BRP 规则引擎（0 AI 依赖）
│   ├── rng.ts            cryptoRng + seeded mulberry32
│   ├── dice.ts           d100 / NdM+K 表达式解析
│   ├── check.ts          难度分级 / 暴击 / 大失败 / 推动 / 对抗
│   └── san.ts            SAN 检定 + 疯狂阈值
│
├── schemas/              Zod contracts
│   ├── kp-output.ts      KP 每回合的 JSON 契约（含 visual_brief）
│   ├── state-op.ts       14 种 StateOp 的 discriminated union
│   └── module.ts         canonical ModuleContent（clue / scene 上可挂 visual_hint）
│
├── ai/                   AI provider 层
│   ├── provider.ts       ChatCompletion 抽象类型
│   ├── deepseek.ts       createDeepSeek(apiKey) → {chat, client, chatModel, reasonModel}
│   ├── json-call.ts      callJsonWithSchema — 自动 retry-on-schema-fail
│   ├── stream.ts         streamCallKp — SSE + 部分 JSON 渐进解析 + 未知 op 过滤
│   └── prompt.ts         KP 系统提示（含开场白特例 / 检定结果硬规则 / visual_brief 指引）
│
├── visual/               图像生成层
│   ├── types.ts          ImageProvider 接口
│   ├── prompt.ts         像素恐怖游戏风格模板 + preset + 低饱和负向词
│   ├── workflows/flux-schnell.ts  ComfyUI workflow（含像素块 downsample/upscale）
│   ├── providers/comfyui.ts       /prompt → /history 轮询 → /view 取图
│   ├── trigger.ts        每回合场景 + 线索揭示 → 异步 job
│   └── worker.ts         单进程 in-memory 队列 + globalThis 锚定
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
│   ├── session-lock.ts   per-sessionId 异步互斥锁（抗并发回合）
│   ├── crypto.ts         AES-256-GCM for per-user DeepSeek keys
│   ├── localdb/db.ts     LocalDB 单进程持久化 (globalThis singleton + mtime 失效
│   │                      + 故障隔离的 mutate writeQueue)
│   ├── localdb/users.ts  注册 / 登录 / key 管理 / visual settings
│   ├── deepseek-resolver.ts  用户 key → env fallback 优先级
│   └── supabase/*        (未使用) Supabase 客户端
│
└── cli/                  终端试玩（离线脚本 KP，开发辅助）

supabase/migrations/      可选云端模式的 Postgres migrations（0001..0004）
docs/
├── schema.md             领域模型 / 不变量 / AI 接触面
└── DEPLOY.md             实验室服务器拉式部署指南
ComfyUI/                  （可选）本地 ComfyUI 安装（gitignore）
data/                     运行时产物（gitignore）
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
  "hidden_notes": ["玩家还没注意到码头工人"],
  "visual_brief": {
    "subject": "a rain-soaked back alley of a brick warehouse, rusted side door slightly ajar, one wet lamp overhead",
    "mood": "damp, hushed, predawn",
    "palette": "muted cold blue-gray, bruised shadows, sickly amber highlight"
  }
}
```

- **`required_check`** 只是"建议哪种检定"，服务端用 CSPRNG 掷骰并写 `checks` 表
- **`state_ops`** 是"想做哪些状态变更"，[`applyStateOp`](src/engine/ops.ts) 执行并写 `session_events`
- **`hidden_notes`** 只给下一回合的 KP 看，绝不渲染给玩家
- **`visual_brief`** 是这回合画面的英文简报（spoiler-safe），喂给 text-to-image 模型。留空 / null 时 trigger 自动降级到模组静态 hint
- 未知 op 名（模型瞎编）或未知 key 引用 → 默默跳过 + 警告日志，回合不中断

### 2. 模组双来源统一 schema

不管是 AI 生成还是用户粘贴导入，最终都落到同一个 canonical [`ModuleContent`](src/schemas/module.ts)：

```
{ meta, premise, locations[], npcs[], clues[], truth_graph, scene_nodes[], encounters[], ending_conditions[] }
```

其中 `clues[]` / `scene_nodes[]` 可挂 `visual_hint`（可选；缺席时 trigger 用 fallback）。

### 3. 调查员状态分两层

- [`investigators`](src/db/types.ts) — 出厂态（档案），跨 session 存在
- [`session_investigator_states`](src/db/types.ts) — 当局可变快照

局结束后，玩家点"应用成长"才把 current_state 回写到 investigator（技能成长检定、final HP/SAN 持久化、新增恐惧/躁狂）。

### 4. 每回合事务化落库 + 会话串行化

```
withSessionLock(sessionId, async () => {
  executeTurnAndCommit
    = loadSession(id)
    → executeTurn(state, input, { rng, callKp })      ← in-memory clone
    → computeTurnDelta(prev, next)                    ← 差分出要写的行
    → repo.commitTurn(delta)                          ← 原子提交
})
```

中途任何 throw 都不落库。`delta` 包括 `new_turns / new_checks / new_events / clue_upserts / npc_upserts / investigator_current_state / session_patch`。

`withSessionLock` 让同一 session 的 turn/push 严格串行，避免两次并发 POST 拿到同一份 `load` 状态后 commit 时撞 `non-monotonic turn_index`。锁是单进程 + globalThis 锚定。

### 5. 流式回合

`/api/sessions/[id]/turn` 是一个 Route Handler，返回 `text/event-stream`：

```
event: check_resolved  data: { outcome, roll, target, kind, summary }  ← 骰子落地，立刻推给前端
event: narration       data: { text: "你站在…" }                        ← KP 文字渐增
event: narration       data: { text: "你站在仓库外，雨声敲着…" }
...
event: complete        data: <full PlayerView>                          ← 落库完成后最终 view
```

前端 `GameView` 用 `fetch` + `ReadableStream` 消费。骰子动画在 KP 还在写稿时就已经开始播放，时间线上能"同时"看到骰子和正在增长的叙事。

### 6. 像素风图像的两层降噪

- **风格层**：STYLE_CORE / NEGATIVE_BASE 用大量像素恐怖游戏语汇（"16-bit horror adventure screenshot / limited indexed palette / hard pixel edges / dithered gradients"），FLUX 朝像素美学走
- **几何层**：ComfyUI 工作流在 VAEDecode 后插两个 ImageScale —— `area` 算法下采样到 1/4（每 4×4 像素平均成一色），再 `nearest-exact` 回到原尺寸。出的是**真块状像素**，跟 FLUX 自己输出的"像素风味软边"不是一回事
- **渲染层**：前端 `<img>` 挂 `image-rendering: pixelated`，浏览器缩放时不插值抹平

单张 640×384 在 H20 上 4-step 约 2 秒，生成一整局 20+ 张图也不拖节奏。

---

## 环境变量

| 变量 | 必需 | 说明 |
|------|------|------|
| `SESSION_SECRET` | ✅ ≥16 字符 | HMAC 签名 session cookie + 派生 KEK 加密用户 DeepSeek key |
| `DEEPSEEK_API_KEY` | 可选 | 服务器级默认 key，fallback；每用户可在 `/settings` 覆盖 |
| `LOCAL_DATA_DIR` | 可选 | 数据文件目录，默认 `./data` |
| `NEXT_PUBLIC_SUPABASE_URL` | 未用 | Supabase 云端模式预留 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 未用 | 同上 |
| `SUPABASE_SERVICE_ROLE_KEY` | 未用 | 同上 |

`SESSION_SECRET` 生成：`openssl rand -hex 32`。**重要：换了这个变量后所有用户存的 DeepSeek key 都解不开，得让用户重新登录 + 重填 key。**

ComfyUI 的地址不走环境变量，每个用户在 `/settings` 里单独配（每个用户可能跑自己的实例）。

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

# 可选：本地 ComfyUI
./ComfyUI/start.sh                         # 默认 cuda:1, port 8188
COMFY_GPU=2 COMFY_PORT=8189 ./ComfyUI/start.sh
```

---

## 存储 / 安全

- 所有业务数据：`./data/*.json`（被 `.gitignore`），每次 mutation 走 atomic write-to-temp + rename
- 生成的图：`./data/assets/visuals/<uuid>.png`
- 密码：bcrypt 10 轮哈希
- Session cookie：`<userId>.<issuedMs>.<HMAC-SHA256>`，timing-safe 校验，14 天 TTL
- 用户的 DeepSeek key：AES-256-GCM，KEK = `SHA256(SESSION_SECRET || "::deepseek-key-kek")`，永不回显
- 每次 AI 调用的 key 只存在于单次请求的内存里，不打印到日志
- `LocalDB.mutate` 容错 —— 一次 throw 不会污染整个写队列（早期 bug 曾因此让"注册"也继承了另一条 commit 的报错）
- `/settings` 危险区域：两个明确的 "清图片 / 清存档" 操作，都需要在确认框里输入"删除"。只删当前用户 owner 的数据

威胁模型：本地单机 / 小型实验室部署。**不防 root 攻击者**（他们读得到 `SESSION_SECRET`，能解密所有 key）。这对离线模式来说是合理取舍。

---

## 还没做的

- **Embeddings**：`module_chunks.embedding` 列留着，目前检索走 KP 自己过滤模组切片
- **多人 / 协作**：完全单人
- **语音 KP**：可能接 DeepSeek Voice / OpenAI Realtime，当前不做
- **密码重置 / 邮件验证**：本地模式无邮件能力
- **手机响应式**：桌面优先，手机大致能看但抽屉/侧栏布局未优化
- **国际化**：纯中文 UI
- **云端 provider**：图像目前只接了 ComfyUI；fal.ai / Replicate 的 provider 接口已经抽好，未接线
- **ComfyUI 并发**：worker 单协程串行处理 job；下一张要等上一张完。多卡并发没做
- **模组的 visual_hint annotator**：目前模组生成时不主动给每条 clue/scene 打 visual_hint，靠 KP 每回合的 visual_brief 兜底。第二阶段可加一个独立 annotator pass

---

## 协议与致敬

- **规则基础**：BRP / Chaosium 的 CoC 7e；本引擎以 BRP 通用骨架设计，CoC 专属内容（神话技能 / Lovecraftian 专有名词等）保留给上层模组内容
- **内容审慎**：所有生成提示里明确避让 Chaosium 的 Product Identity（神话神祇专有名词、"Call of Cthulhu" 商标字样、官方 artwork 风格描述），用通用恐怖意象表达
- **图像模型**：FLUX.1 [schnell]（Apache-2.0，Black Forest Labs）；ComfyUI（GPL-3.0）
- 代码：MIT（如果你要 fork，请保留 `/docs/schema.md` 里关于 IP 边界的那一节）

---

## 贡献

目前是单人项目，欢迎 issue 讨论。代码规范：

- Strict TypeScript，`exactOptionalPropertyTypes` 开启
- 纯函数优先，副作用集中在 `ops.ts` / `actions.ts`
- AI 调用必须走 `callJsonWithSchema` / `streamCallKp`，不绕过 Zod 校验
- 新 StateOp 要同时更新 `src/schemas/state-op.ts`、`src/engine/ops.ts`、`src/ai/stream.ts` 的 `KNOWN_OPS` 集合，以及 `src/ai/prompt.ts` 里 KP 能看到的 op 清单
- 新视觉 target_type 要同时更新 `schemas/module.ts` 的 `VisualHint.kind`、`visual/prompt.ts` 的 `PRESET`、`visual/trigger.ts` 的入队逻辑

---

## 仓库地址

<https://github.com/bluemeat903/COCme>
