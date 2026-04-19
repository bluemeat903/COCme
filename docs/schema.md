# 领域模型 / 数据库 Schema

单人 BRP 兼容恐怖调查引擎的数据模型。首版范围：一个用户、一个调查员、一个模组、一局游戏、全程结构化叙事与检定、局后成长。联机 / 多人 / 语音后置。

底层用 Supabase（Postgres + Auth + RLS + Storage）。所有业务表都开 RLS，不留裸表。

---

## 0. 设计原则

1. **AI 不写数据库，只提建议**：KP 模型每回合输出结构化 JSON（叙述 + 建议检定 + 建议状态变更），由服务端规则引擎执行骰子、写 `checks`、写 `session_events`、更新 `session_investigator_state`。表结构里没有任何字段是「让模型自己改」的。
2. **模组来源一致化**：用户上传文档抽取出的模组，和 AI 原创模组，最后都落到同一个 `modules.content` canonical schema。运行时只认一个结构。
3. **局内 ≠ 局外**：调查员有「出厂态」（`investigators`）和「会话态」（`session_investigator_state`）。局中所有变化写在会话态，结束后由 `growth_records` 决定哪些改动回写到 `investigators`。这样单局回滚、复盘、重玩都干净。
4. **回合是叙事的最小单位**：`turns` 串起整局；`checks` / `session_events` / `session_clues` 都挂在 `turns` 或 `sessions` 上。
5. **IP 边界**：规则和字段设计按 BRP 通用骨架（8 项属性、百分制技能、难度级别、推动检定、SAN）。CoC 特有的 Lovecraft 命名实体（神话技能名、神祇等）属于上层内容数据，不写进 schema，避免以后和 Chaosium 的 Product Identity 冲突。

---

## 1. 实体总览

```
auth.users                     (Supabase Auth)
  └── investigators            一个用户可有多张人物卡
        └── session_investigator_state  每一局的可变快照

  └── modules                  用户拥有的模组（上传 / AI 生成 / 预置）
        └── module_chunks      分片 + 可选 embedding（RAG 用）

  └── sessions                 一次跑团 = 一个 investigator × 一个 module
        ├── session_investigator_state  (1:1)
        ├── turns              每个回合（玩家输入 / KP 输出）
        │     └── checks       该回合发起的检定
        ├── session_clues      线索实例（发现 / 未发现）
        ├── session_npcs       NPC 实例状态
        ├── session_events     结构化事件日志（时间推进、SAN 变更、场景切换…）
        └── growth_records     局后成长记录（应用回 investigator）

content_moderation             对用户上传 / AI 产出文本的审核结果
```

---

## 2. 表定义与要点

### 2.1 `investigators` —— 调查员（出厂态）

BRP 8 项核心属性 + 派生值 + JSONB 存技能、物品、背景。

- `skills jsonb`：形如 `{ "侦查": { "base": 25, "value": 60 }, "心理学": { ... } }`。之所以用 JSONB 而不是独立的 `investigator_skills` 表，是因为技能列表按时代/职业差异大，查询维度单一（按人物卡加载），用 JSONB 更简单。真要做跨人物的技能统计再建视图。
- `background jsonb`：Pulp/Classic 的背景七项（信念、重要之人、意义地点、珍视之物、特质、伤痕、奇异际遇）。
- `portrait_url text`：指向 Supabase Storage 中的 `portraits/` bucket。
- 没有 `deleted_at`：删除走硬删 + RLS。归档用 `is_archived bool`。

### 2.2 `modules` —— 模组

- `source_kind`：`'user_upload' | 'ai_generated' | 'preset'`。三种来源最终结构相同。
- `content jsonb`：canonical schema：

  ```
  {
    "meta": { "title", "era", "tags", "warnings" },
    "premise": "...",
    "locations": [{ "key", "name", "description", "features": [] }],
    "npcs": [{ "key", "name", "role", "stats"?, "motivations", "secrets" }],
    "clues": [{ "key", "name", "text", "found_at": [location_key], "requires_check"?, "reveals": [clue_key] }],
    "truth_graph": { nodes, edges },
    "scene_nodes": [{ "id", "title", "setup", "on_enter", "transitions": [{ "to", "condition" }] }],
    "encounters": [...],
    "ending_conditions": [{ "key", "label", "requires": ["clue_xx", "npc_alive_yy"] }]
  }
  ```

- `schema_version int`：以后改结构才不痛。
- `is_public bool`：为将来分享模组预留，RLS 里允许其他用户只读。

### 2.3 `module_chunks` —— 分片（RAG 用）

每回合 KP 不能读全本模组，用向量检索或关键词检索喂相关片段。

- `embedding vector(1024)` **可空**：首版用 tsvector + 关键词即可跑通；等接入 BGE-M3 / 第三方 embedding 服务后再回填。
- 索引：`embedding` 用 ivfflat（可空时 where embedding is not null）；`content` 用 GIN on `to_tsvector('simple', content)`。

### 2.4 `sessions` —— 一次跑团

- `status`���`'active' | 'completed' | 'abandoned' | 'failed'`。
- `current_scene_id text`：指向 `modules.content.scene_nodes[].id`，不做外键（JSONB 内）。
- `game_clock jsonb`：`{ "in_game": "1923-10-14T22:17:00", "elapsed_minutes": 137 }`。
- `ending text`：结局标签（成功 / 代价成功 / 失败逃生 / 死亡 / 疯狂 / …）。
- `summary text`：结束时由 KP 模型生成的复盘稿，正文文本。

### 2.5 `session_investigator_state` —— 会话内的人物快照

1:1 挂在 session 上。

- `base_snapshot jsonb`：开局那一刻从 `investigators` 拷贝下来的完整数据。局中不改。
- `current_state jsonb`：会变的部分（HP、SAN、MP、luck、inventory、skills 是否本局内成功触发过 improvement mark、临时状态如 injured/bleeding/insanity 等）。
- 所有 HP/SAN/技能改动都写 `session_events`，再反映到这里，保证有审计。

### 2.6 `turns` —— 回合

- `actor`：`'player' | 'kp' | 'system'`（system 用于自动时间推进、自动触发）。
- `player_input text`：玩家自由输入或选项 label。
- `kp_output jsonb`：严格 schema：

  ```
  {
    "scene_id": "...",
    "visible_narration": "...",
    "player_options": ["..."],
    "required_check": { "kind", "skill", "difficulty", "bonus_penalty", "allow_push" } | null,
    "state_ops": [ { "op": "advance_clock", "minutes": 3 }, ... ],
    "hidden_notes": ["..."]
  }
  ```

- `visible_narration text`：从 `kp_output` 抽出来的冗余字段，单独索引，做玩家日志快速查询。
- `hidden_notes` 永不 stream 给前端，只回 `visible_narration` + `player_options` + `required_check` 的「玩家可见投影」。

### 2.7 `checks` —— 检定

真正的骰子全部由服务端 CSPRNG 生成，写这张表。LLM 不接触骰子。

- `kind`：`'skill' | 'characteristic' | 'opposed' | 'san' | 'luck' | 'damage' | 'custom'`。
- `target int`：目标值（含难度修正已解过后的值，也保留 `difficulty` 原值以便复盘）。
- `bonus_dice` / `penalty_dice`：奖励/惩罚骰数量。
- `roll_raw jsonb`：`{ "tens": [3, 7], "units": 4, "chosen": 34 }` 之类，结构透明好回放。
- `outcome`：`'fumble' | 'fail' | 'regular_success' | 'hard_success' | 'extreme_success' | 'critical'`。
- `pushed bool`：推动过一次为 true，失败则按 BRP 的推动惩罚走。

### 2.8 `session_clues`

按 module clue 模板实例化。线索不在 module 表里直接打标「已发现」，因为同一个模组可以被多个人跑多次，实例状态必须在会话维度。

### 2.9 `session_npcs`

同上。每个 NPC 在局中独立实例：态度、生死、HP、额外笔记。

### 2.10 `session_events` —— 通用事件日志

不是所有事都值得单独建表。事件日志用于：

- 时间推进
- SAN / HP / MP / luck 变化
- 场景切换
- 物品增减
- 人际关系变动
- 触发剧情旗标

`payload jsonb` 按 `kind` 自行约束（在 TS 层写 discriminated union）。

### 2.11 `growth_records` —— 局后成长

- 记录本局触发过哪些技能的「成功 / 推动成功」，局后做 improvement roll。
- 记录 SAN 总损失、新获得的恐惧症 / 躁狂症（按 BRP/CoC 单次 ≥5 点 SAN 损失规则）。
- 记录身体伤害、疤痕。
- 记录 NPC 关系变化（为以后出现的 campaign 模式备料）。
- `applied bool` / `applied_at`：是否已经把成长结果回写到 `investigators`。未 applied 前，玩家可以在复盘页确认 / 调整。

### 2.12 `content_moderation`

对 user upload 和 AI 生成叙事做一次审查，把结果记下来。DeepSeek 没有 moderation endpoint���所以这一列会由你自己的规则（关键词表 + 可选的第三方审核）填充。字段留着，首版先填一份空结果即可。

---

## 3. 关键不变量 (invariants)

下面这些是写业务代码时必须保持的：

1. `sessions.status = 'active'` 的会话在同一个 `investigator_id` 下最多一条。
2. `turns.turn_index` 在同一 session 内单调递增、无重复。
3. `checks.turn_id` 必须属于同一 `session_id`。
4. `session_investigator_state.current_state.hp_current >= 0`；到 0 后不能再直接减，必须走「重伤 / 死亡」分支写 `session_events`。
5. 任何修改 `current_state` 的操作都必须同时写一条 `session_events`，并且两者在同一个事务里。
6. `modules.content.scene_nodes[*].id` 唯一；`sessions.current_scene_id` 必须能在当前模组内解析到。这个约束在应用层校验，数据库只建 check 约束骨架。
7. `growth_records.applied = true` 之后不可再改，只能新建修正记录。

---

## 4. 索引与性能

- `sessions(owner_id, status)`：跳转到「当前这局」。
- `turns(session_id, turn_index desc)`：跑团主界面分页加载。
- `checks(session_id, created_at desc)`。
- `session_events(session_id, created_at desc)`。
- `module_chunks` GIN on `to_tsvector`；`embedding` 用 ivfflat（数据量起来再建）。
- 所有 `*_id uuid` 外键自动有 btree。

---

## 5. 与 AI 层的接触面（schema 视角）

KP 每回合的输入 = 以下切片的 JSON 拼装：

- `sessions` 基础信息
- `session_investigator_state.current_state` 中 KP 应知道的部分（排除 `hidden_player_notes`）
- 最近 N 条 `turns`（visible + hidden）
- 命中当前场景的 `module_chunks`（top-K）
- 当前 scene node 的完整定义
- 已发现 `session_clues`、仍活跃 `session_npcs`

KP 每回合的输出 = 写入一条 `turns`（带严格 schema 的 `kp_output`），以及服务端据此执行 `state_ops`（写 `checks` / `session_events` / 更新 `current_state`）。模型永远不直接写数据库。
