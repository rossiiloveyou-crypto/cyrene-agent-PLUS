# Cyrene-Agent 官方代码对比 & 合并重难点报告

生成时间：基于 `E:\AI_Chating\cyrene-agent`（你的包）与 `E:\AI_Chating\off-cyan\Cyrene-Agent`（官方最新 clone）
所有结论均来自实际 git 三方合并试跑（`git merge-tree` / 沙箱真实 merge），未运行 tsc / vitest / 构建。

---

## 0. 最重要的结论：这不是"分叉"，是"你落后 12 天"

| 事实 | 数值 |
|---|---|
| 你的 HEAD | `eb6c311a`（2026-09-13） |
| 官方 HEAD | `b11b8851`（2026-09-25 23:30） |
| 你的 HEAD 是否为官方 HEAD 的祖先 | **是**（`merge-base` = `eb6c311a`） |
| 官方领先提交数 | **219 个** |
| 官方改动文件数 | 863 |
| **你的未提交工作** | **252 文件 / +43,325 行** |
| 你独有的已提交提交 | 0（官方已吸收你的插件市场双源等提交） |

**关键含义**：`git merge` 会 **fast-forward** —— 直接快进到官方，你的 **未提交工作不受 git 保护**。
真正要合并的不是"两个分支"，而是 **你的 252 个未提交文件 × 官方的 219 个提交**。

> ⚠️ **动手前第一件事**：`10-my-uncommitted.patch` 只含已跟踪文件（131 M + 13 D），**不含 74 个未跟踪文件**。
> 你的 zones / corpus / audit-log / tool-access / keyword-policy / transcript-erasure 等新模块**只存在于工作区**。
> 任何 checkout / merge / stash 前必须先 `git add -A && git commit`（或 `git stash -u`）。

---

## 1. 官方这 12 天做了什么（219 提交 / 5 大主线）

按影响面排序：

### 主线 A — CTA 会话轨迹架构（最大，~65 个提交）
`cta` = **Conversation Transcript Architecture**。重心**不在** `channels/`，而在 `src/main/orchestrator/`：

新增 10 个模块（你的树里**全部不存在**）：
- `conversation-transcript-store.ts`（1077 行，15 个提交）
- `conversation-transcript-projection.ts`（831 行，10 个提交）
- `conversation-journal-service.ts`（514 行，12 个提交）— 渠道侧唯一入口
- `conversation-transcript-types.ts`（302）、`conversation-session-migration.ts`（269）
- `conversation-transcript-coordinator.ts`、`-compactor.ts`、`-context.ts`、`-archive.ts`
- `conversation-interruption-reconciliation.ts`

设计文档：`docs/design/2026-09-21-cta-conversation-transcript-architecture-design.md`

**对渠道的影响**：`dispatcher.ts` 现在写 journal，注释明确写 *"Canonical journal; it is the sole model-history source."*
渠道的模型上下文来源从 `priorMessages` 改为 `journal.buildModelContext()`。

### 主线 B — 旧窗口下线，全面 React 化
- `f228355e` **删除旧设置窗口与日程窗口**：删 `src/renderer/settings/index.html`(2221) + `settings.ts`(1967) + `settings.css`(4771) + `src/renderer/tasks/**`，并从 vite 入口移除 `settings:` 与 `tasks:`。设置现在是 React 窗口 + `IPC.SETTINGS_SWITCH_SECTION`。
- `19958611` 下线旧 HTML 状态栏窗口（含 `src/renderer/sidebar/sidebar.ts`）。
- `6965d3e9` 迁移通话窗口，并顺手把 `vite.config.ts` → **`vite.config.mts`**（根目录新增 `tsconfig.json`、`tsconfig.renderer.json`）。
- `af95b8f1` **清理 settings i18n 与 i18n-runtime**（−1210 行）。

### 主线 C — 聊天渲染迁移到 Streamdown
`@ant-design/x-markdown` **被移除**，改用 `streamdown` 2.6.0 + `@streamdown/math` + `katex`。

### 主线 D — 设置弹窗/面板重构
`2b2fa18f`（27 文件，+1582/−266）：modal 改为 `showNotice`/`showAlert`/`showConfirm` + FIFO `blockingQueue`，新增 `dialog-focus.ts` 纯工具。

### 主线 E — 基建与厂商体系
- `src/shared/vendor-registry/**` 抽取（`cbf06168`、`265b69ee`、`fbcfc7e7`、`fa9deac9`）
- 依赖大升级：**Vite 7.3.6→8.3.0、Vitest 4.1.9→5.0.1、Electron 43→44.4.3、@ag-ui/client+core 0.0.57→1.0.0、@vitejs/plugin-react 4→6**
- 新增依赖：streamdown、katex、motion、radix-ui、@lobehub/ui+icons、simple-icons、vscode-icons-js、devicon、dnd-kit、tailwindcss 等
- 新增 CI：`package-windows.yml`、`dependabot.yml`

---

## 2. 真实合并结果（沙箱实测，非估算）

在 `E:\AI_Chating\_merge-sandbox` 把你的工作区提交为 checkpoint 后实跑 `git merge official/master`：

| 指标 | 未归一化 | `-X renormalize` |
|---|---|---|
| 冲突文件 | 50 | **46** |
| 冲突块（hunk） | 69 | **64** |

`-X renormalize` 消除 4 个**纯行尾假冲突**：`agui-bridge.ts`、`application/default-dependencies.ts`、`memory/memory-user-ipc.ts`、`token-usage-store.ts`。

### 46 个真冲突分三类

| 类别 | 数量 | 含义 | 处置 |
|---|---|---|---|
| **A. 官方删除 / 你仍在改** | **15** | 你的工作落在被官方废弃的文件上 | 逐个人工决策（多数需移植） |
| **B. 双方都改** | **31** | 真三方冲突 | 逐个手工解决 |
| **C. 你删除 / 官方在改** | **0** | — | 无风险 |

其余：**111 个未跟踪文件与官方 0 冲突**（无 add/add 碰撞）；**75 个已跟踪改动可干净套用**；**你是纯删除的文件 0 个危险项**。

---

## 3. 重难点（按危险度排序）

### 🔴 难点 1 — 行尾（CRLF/LF）索引错位：必须先修，否则合并是场灾难

**根因**：两个仓库都为 `core.autocrlf=true` 且**都没有 `.gitattributes`**，但索引入库行尾不同：

```
官方: i/crlf  w/crlf
你的: i/lf    w/crlf
```

同一份文件在两边是**不同 blob**。精确测量（存储 blob 里的 CR 字节数）：

| 文件 | 基准 blob | 官方 blob | git 冲突? | 三边归一化后 `merge-file` 结果 |
|---|---|---|---|---|
| `src/main/agui-bridge.ts` | CRLF (903) | LF (0) | 是 | **0 冲突** |
| `src/main/application/default-dependencies.ts` | CRLF (663) | LF (0) | 是 | **0 冲突** |
| `src/main/memory/memory-user-ipc.ts` | LF (0) | CRLF (433) | 是 | **0 冲突** |
| `src/main/token-usage-store.ts` | LF (0) | CRLF (306) | 是 | **0 冲突** |
| `src/main/memory/memory-manager.test.ts` | LF (0) | LF (0) | 是 | **0 冲突**（两边都是 LF 却仍冲突，需手工合） |
| `src/main/orchestrator/tools/registry/tool-registry.ts` | LF (0) | CRLF (475) | 是 | 1（真实） |
| `src/main/settings/general-settings.ts` | CRLF (180) | LF (0) | 是 | 1（真实） |

对应的 diff 膨胀倍数：

| 文件 | 原始 diff | 剥掉行尾后 | 膨胀 |
|---|---|---|---|
| `orchestrator/tools/registry/tool-registry.ts` | 475 + 475 − | **1 + 1 −** | **475×** |
| `memory/memory-user-ipc.ts` | 436 + 435 − | 9 + 8 − | 48× |
| `main/token-usage-store.ts` | 306 + 290 − | 18 + 2 − | 17× |
| `settings/general-settings.ts` | 189 + 180 − | 15 + 6 − | 12.6× |
| `application/default-dependencies.ts` | 780 + 663 − | 165 + 48 − | 4.7× |
| `main/agui-bridge.ts` | 1073 + 903 − | 308 + 138 − | 3.5× |

**处置**：合并前在**你的仓库**加 `.gitattributes`（至少 `* text=auto eol=lf`）并 `git add --renormalize .` 单独提交，之后永远用 `git merge -X renormalize`。
好处：假冲突直接消失，冲突块从 69 降到 64。
对这 5 个纯行尾文件，**不要手工解冲突标记**（有把 CRLF 又烤回去的风险）—— 直接取官方文件，再把你那点小 delta 手工贴回
（`agui-bridge.ts` 12+/3−、`default-dependencies.ts` 9+/0−、`memory-user-ipc.ts` 85+/1−、`token-usage-store.ts` 13+/0−、`memory-manager.test.ts` 94+/0−）。

### 🔴 难点 2 — 官方删了 15 个你正在改的文件（架构级冲突，无法机械合并）

| 被官方删除的文件 | 你的改动 | 官方替代 |
|---|---|---|
| `src/renderer/settings/index.html` | +699/−925（2022 行） | React `react/features/settings/**` |
| `src/renderer/settings/settings.ts` | +121/−929 | 同上 |
| `src/renderer/settings/settings.css` | +723/−26（5277 行） | 同上 |
| `src/renderer/settings/i18n/zh-CN.json` | +274 | `react/i18n/` 单一体系 |
| `src/renderer/settings/i18n/en.json` | +263 | 同上 |
| `src/renderer/settings/mcp/panel.test.ts` | +18/−11 | React MCP 页 `1a8c6f78` |
| `src/renderer/sidebar/sidebar.ts` | +10/−5 | React 侧栏 |
| `src/renderer/react/hooks/useChatAppearance.ts`(+test) | +6 / +16 | `src/shared/message-typography.ts` |
| `src/renderer/react/features/chat/components/ModelModePanel.tsx`(+css) | +13 / +14 | 官方重构 |
| `src/shared/chat-appearance.ts`(+test) | +44 / +32 | 同上 |
| `vite.config.ts` | +6/−1 | `vite.config.mts` |
| `dist/renderer/toast/index.html` | +12 | 官方已取消跟踪该产物 |

**另注**：`src/renderer/settings/api/presets.ts` 官方**保留并修改**（被 `react/features/settings/ModelSettingsPanel.tsx:52` import），而你把它**删了**并把目录 fork 到 `react/features/chat/components/api-config/presets.ts`。这会在合并时变成 modify/delete 冲突 —— 且删掉它会连带移除 `vendor-registry-consistency.test.ts` 这道一致性守卫。

> 好消息：你删掉的 2 个文件里，`settings/api/presets.ts` 与 `settings/tokens/panel.ts` 是**完整的删除**（树上已无），官方对它们零提交，语义上可谈；但它们被官方 React 侧引用，**不能简单接受删除**。

**关于 `src/shared/chat-appearance.ts` 的处置（重要，别硬抢救整个文件）**：
官方对 `ChatAppearanceSettings` / `normalizeChatAppearance` / `DEFAULT_CHAT_APPEARANCE` 的 `git grep` 结果是 **0 命中** —— 整个"聊天外观"概念被删除，由新的 `src/shared/message-typography.ts`（`MessageTypography` / `DEFAULT_MESSAGE_TYPOGRAPHY` / `MESSAGE_TYPOGRAPHY_RANGES` / `normalizeMessageTypography`）+ `src/renderer/ui/message-typography.ts` 取代。

而**你自己的新增只有 44 行 / 3 个导出**：
```ts
export const USAGE_BADGE_PRESETS: ReadonlyArray<{ id: string; label: string; image: string }>
export function normalizeUsageBadgeColor(value: unknown): string
export function resolveUsageBadgeImage(color: string): string
```
→ **把这 3 个抽到新模块（例如 `src/shared/usage-badge.ts`），然后删掉/忽略 `chat-appearance.ts` 其余部分。**
不要把整个文件复活 —— `CHAT_TYPOGRAPHY_CHANGED` 这个 IPC 在官方已不存在，排版管线现在是 `message-typography`。

### 🟡 难点 3 — 你的"记忆 / 区块 / 控制台"官方完全没有对手（这是好消息）

用 `findstr` 在全官方 `src` 检索，**0 命中**：

| 你的独有功能 | 官方命中 | 结论 |
|---|---|---|
| 记忆管理 console (`memory-console`) | 0 | 官方没有 → 自建保留 |
| 区块 (`ZONES_*`, `zoneWhitelist`) | 0 | 官方没有 → 自建保留 |
| 渠道控制台审计 (`audit-log`/`auditLog`) | 0 | 官方没有 → 自建保留 |
| 按人擦除 (`person-erasure`/`erasePerson`) | 0 | 官方没有 → 自建保留 |
| 用量徽章 (`usageBadge`) | 0 | 官方没有 → 自建保留 |
| 工具白名单 (`tool-access`/`toolAccess`) | 0 | 官方没有 → 自建保留 |
| 关键词策略 (`keyword-policy`) | 0 | 官方没有 → 自建保留 |
| 群语料 (`group-corpus`) | 0 | 官方没有 → 自建保留 |
| `groupContextLimit`（区块上下文上限） | 0 | 官方没有 → 自建保留 |
| 会话用量 (`conversation-usage`) | 0 | 官方没有 → 自建保留 |
| 弹窗确认门 (`confirmValue`) | 0 | 官方没有 → 自建保留 |
| 群聊旁听/观察态 (`旁听`/`observedOnly`/`triggered`) | 0 | 官方没有 → 自建保留 |

**冲突面极小**：

| 你保护的区域 | 你的文件数 | 与官方真冲突 |
|---|---|---|
| `src/main/memory/` | 42（24 改 + 18 新） | **2** |
| `src/main/zones/` | 8 | **0** |
| `src/main/corpus/` | — | **0** |
| `src/main/relationship/` | — | **0** |

**`src/main/memory/` 的 42 个文件其实几乎零风险** —— 官方整个 memory 改动只有 **3 个文件**：

```
123  123  memory-llm-shared.ts   → 去掉空白后真实差异 1/1
 11    1  memory-manager.test.ts → 真实修复（11 增 1 删）
436  435  memory-user-ipc.ts     → 去掉空白后真实差异 7/6
```

其中 `memory-user-ipc.ts`、`memory-llm-shared.ts` 的 400+ 行是**纯行尾替换**（`f228355e`/`19958611`/`1a8c6f78`/`4b5a05f4` 这批 EOL 转换提交）。
唯一真实的官方 memory 修复是 `12163a9f`：mock `./obsidian-exporter` 并在 `afterEach` 加 `await vi.dynamicImportSettled()`，解决 Vitest 5 下 `vi.resetModules()` 与 fire-and-forget 动态导入的竞态。

→ **你点名要保的记忆/区块/控制台，主体是"纯增量、无冲突"的，风险只集中在少数装配点上。**

### 🟡 难点 4 — 历史（history）的真相：你的 `history-log.ts` 安全，但会被"饿死"

你点名担心的 history，实测结论与直觉相反：

- `src/main/channels/history-log.ts` 的**基准 blob 在两边完全一致**（`49e41717`），官方对它有 **0 个提交**。
  → 你从 126 行扩到 **598 行**的改动 **100% 干净套用，不可能产生冲突**。
- 但官方用 CTA **绕过了**它：
  - 读路径：`loadRecentHistory` 在官方**零个生产调用者**；
  - 写路径：只剩 `proactive-delivery.ts:114` 一处；
  - 官方的 `channel-context.ts` 明确**删掉**了这三行：`formatChannelUserText(...)` / `appendChannelHistory(...)` / `modelContext:`，并且 `ChannelContext` 接口不再声明这两个字段。
- 官方 journal 的 `TranscriptEntry` 联合类型**没有"旁听/未触发"这一类**，也**没有按人擦除**能力 → 你的 598 行不是被取代，而是**官方没有的独家能力**。

> ⚠️ **最危险的静默失败**：如果合并时官方版 `dispatcher.ts`/`bootstrap.ts` 直接胜出、你的读取接缝被丢掉，
> `channels/history/<sessionId>.jsonl` 只会被 `proactive-delivery` 写入，
> `loadRecentHistory` 对每个渠道会话返回 `[]`，`buildGroupContextBlock` 返回 `null`，群聊旁听上下文**静默消失**，
> 按人擦除会"报告删除 0 条却看起来成功"。
> **而 `history-log.test.ts` 与 `transcript-erasure.test.ts` 直接调 `appendHistory`，不会失败** —— 没有任何测试能抓到它。
> 必须补一个「断言 dispatcher 真的写了 history」的集成测试。

### 🟡 难点 5 — dispatcher / bootstrap / channel-context：不是文本冲突，是类型不兼容

三个核心文件是**两种竞争架构**：

| | 你的方案 | 官方方案 |
|---|---|---|
| 历史归属 | 渠道自己持有（`channels/history-log`） | journal 唯一权威 |
| agent 输入 | 位置参数 `(msg, sessionId, priorMessages, userMessageId)` | 对象 `ChannelAgentInput{ modelContext, transcriptSink, runId, target }` |
| 上下文构造 | `buildOptions({messages:[...]})` | `modelContext` + fail-closed reader |

冲突块分布（实测）：`dispatcher.test.ts` 10 块、`bootstrap.ts` 7 块、`dispatcher.ts` 6 块、`channel-context.ts` 5 块、`bootstrap.test.ts` 4 块 —— 全部集中在同一批方法体内。

**处置**：这 3 个文件 + 3 个测试**不要手工合并**，按官方新结构**重写**，把你的功能重新挂上去。
两个具体建议（可直接用）：
- `interceptByKeyword` + 审计发射放进官方的 `processIncomingCanonical` 内部：放在 `getChannelTurnState` **重放去重之后**（否则重投消息会重复写拦截审计），但放在 `limiter.tryConsume` **之前**（保住"被拦截不消耗额度"的意图）。
- `ChannelAgentInput` 需要**加一个字段**承载你 P2 的用户轮次 id（该 id 现在只存在于 dispatcher），例如 `userEntryId?: string`；或改用 `journal.appendUser()` 返回的 `{id}`。

### 🟢 难点 6 — 需要显式决策：桌面对话绑定（别让 git 替你决定）

- 你**删除**了 `conversation-binding-api.ts`（+test）与 3 个 `CHANNELS_CONTEXT_*` 常量、`useChannelMirrorEvents.ts`、store 的 `bindings` 数组。
- 官方**保留了** `conversation-binding-api.ts`，`init.ts:23-27` 仍在 import 它，并把 `boundConversationId` 留作 **CTA journal 的写入目标**。
- 有意思的是：官方**独立地**清掉了同一批绑定镜像路径（`3d39068b` 删绑定历史镜像、`1df0246f` UI 持久化改投影）→ **你的方向与官方收敛**，唯一分歧是 journal 目标。

**建议**：本次合并**保留官方语义**（成本最低 —— 不需要改 binding-api、IPC 常量、设置面板绑定 UI、`bindings`、`DispatchContext`），"不绑定"的行为仍然可达（就是不设绑定）。删除作为独立改动另做。

### 🔴 难点 6.5 — `vite.config.ts` 会**静默遮蔽** `vite.config.mts`（最阴险的陷阱）

官方把 `vite.config.ts` 重命名为 `vite.config.mts`。但 Vite 的默认配置查找顺序是：

```
["vite.config.js","vite.config.mjs","vite.config.ts","vite.config.cjs","vite.config.mts",...]
```

加载器取**第一个存在的文件然后 `break`，且不发出任何警告**（已在安装的 `node_modules/vite/dist/node/chunks/logger.js:152-159` 与 `chunks/config.js` 中确认）。

**后果**：如果合并后你的 `vite.config.ts` 还在，`npm run dev` / `build:renderer` 会**静默使用旧配置** —— 没有 Tailwind、没有 CSP 插件、入口列表错误（会去找已删除的 `sidebar`/`tasks`/`settings`/`call` 目录）。
→ **必须删除 `vite.config.ts`，而不是合并它。**

### 🟡 难点 6.6 — Node 版本是硬阻塞

- `engines`: `node >=24 <25`、`npm >=10`（两边一致）
- 你的机器当前：**Node v22.23.2 / npm 10.9.8**
- 官方 lockfile 是用 **npm 11.16（Node 24）** 重新生成的（`84f69f88`）

→ **必须先装 Node 24 LTS + npm 11**，否则 `npm ci` 会 EBADENGINE 并生成与官方分歧的 lockfile。

### 🟢 难点 7 — 构建与依赖（合并后必须重装）

| 项 | 你的 | 官方 | 处置 |
|---|---|---|---|
| vite 配置 | `vite.config.ts` | **`vite.config.mts`**（已重命名） | 接受官方重命名 |
| 根 `tsconfig.json` | 不存在 | **新增** | 采用官方 |
| 构建入口 | renderer/sidebar/tasks/**settings**/stickers/call/chat-react/music/toast | renderer/stickers/call-react/chat-react/music/toast（官方另有 perf harness 分支） | 采用官方 |
| Vite | 7.3.6 | **8.3.0** | ⚠️ 大版本 |
| Vitest | ^4.1.9 | **^5.0.1** | ⚠️ 默认 `clearMocks` 变化 |
| Electron | ^43.0.0 | **^44.4.3** | ⚠️ 大版本 |
| @ag-ui/client+core | ^0.0.57 | **1.0.0** | ⚠️ 破坏性 |
| @vitejs/plugin-react | ^4.7.0 | **^6.0.5** | ⚠️ |
| `@ant-design/x-markdown` | ^2.9.0 | **已移除** | 你仅在 `ChatMessageList.tsx`(+test) 引用，且这 2 个文件**干净未改** → 安全 |

**你在 `vite.config.ts` 里的未提交改动是真实 bug 修复，必须抢救到 `vite.config.mts`**：
```ts
server: {
  host: "127.0.0.1",   // 不显式绑 IPv4 时 Vite 只监听 [::1]:5173，
                       // 而主进程 12 处硬编码 http://localhost:5173，
                       // Chromium 走 127.0.0.1 → ERR_CONNECTION_REFUSED (-102)
  port: 5173,
  strictPort: true,    // 主进程端口硬编码，5173 被占必须立刻报错，不能静默改端口
}
```

`package.json` 你只改了 `version` → `1.2.2-PLUS`（会与官方冲突，取官方 + 你的后缀）。
`package-lock.json` 必须**重新生成**，不要手工合并（官方改动 **10,947 行**；你的 13 行差异只是版本号 + 一个 optional peer）。

### 🟡 难点 7.5 — IPC 契约（`src/shared/ipc-channels.ts`）：一个 hunk，但牵动全局

密钥集合对比：基准 **333** 个 → 官方 **330** 个 → 你 **358** 个。同键不同值：**0 个**。全文只有**一个冲突块**：

```
<<<<<<< OURS
  CHAT_SESSION_USAGE_GET: "chat:session-usage:get",
  CHAT_SESSION_USAGE_CHANGED: "chat:session-usage:changed",
  CHAT_TYPOGRAPHY_CHANGED: "chat-typography:changed",
||||||| BASE
  CHAT_TYPOGRAPHY_CHANGED: "chat-typography:changed",
=======
>>>>>>> THEIRS
```

**处置**：保留你新增的 2 个，**删掉 `CHAT_TYPOGRAPHY_CHANGED`** —— 它还被 `src/main/settings/general-settings-lifecycle.ts:154` 与 `src/preload/index.ts:339,341` 引用，这 3 处也要一起删。

**必须存活的 28 个你新增的 channel**：
`APP_RESTART`；`CHAT_SESSION_USAGE_GET/CHANGED`；`CHAT_OPEN_PANEL`；`MEMORY_DELETE_ALL`；`MEMORY_MANAGER_LIST/QUERY/DELETE`；`MEMORY_ERASE_PREVIEW/ERASE_PERSON`；`MEMORY_TRACE_SOURCE`；`ZONES_*`（9 个：LIST/CREATE/RENAME/DELETE/UPDATE_CONFIG/ADD_MEMBER/ADD_MANUAL_GROUP/REMOVE_MEMBER/MOVE_MEMBERS）；`CHANNELS_AUDIT_GET/CLEAR/APPENDED/OPEN_LOG/REVEAL_LOG`、`CHANNELS_TOOL_ACCESS_GET/SAVE`、`CHANNELS_KEYWORDS_IMPORT_TXT`（8 个）。

**官方删掉、你树里仍在引用的 25 个键**（全部是基准代码，不是你自己的工作，删掉零损失）：`EMBEDDING_*`（4）、`CHAT_TYPOGRAPHY_CHANGED`、`CHATS_APPEND/UPSERT/REPLACE_MESSAGES/REPLACE_TAIL/SET_MESSAGE_TTS_CACHE`、`HARNESS_GET_INTERRUPTED_RUN`、`SETTINGS_CLOSE/MINIMIZE/OPEN_SIDEBAR/...`、`SIDEBAR_*`、`TASKS_*`（旧 HTML 窗口遗留）。

⚠️ **官方新增了自动化 IPC 契约扫描器**：`src/main/application/ipc-contract-scanner.ts` + `ipc-contract.test.ts`（均为新文件）。
落地你的 28 个新 channel 时，如果 preload 暴露与主进程 handler 注册不匹配，**这个测试会失败**。合并后必须跑它。

### 🟡 难点 7.6 — Vitest 5 的 `clearMocks` 默认值会静默打掉你的测试

官方为此专门打了一个补丁（`e6849201`）：在模块顶层快照 `toolRegistry.register` 的 mock 调用记录 —— 因为 Vitest 5 默认 `clearMocks: true`，导致「25 个测试全部取不到工具定义」。

**直接命中你改过的两个文件**：
- `src/main/orchestrator/tools/registry/tool-registry-memory.test.ts`
- `src/main/orchestrator/tools/__snapshots__/built-in-tools.snapshot.test.ts.snap`

这两个文件官方**未改动**，但官方重写了 `tool-registry.ts`。合并后需要**重新生成快照**，并检查是否有 import 期填充 mock 的断言会静默返回空。

另注：`vitest.config.ts` 官方把并发从 `singleFork/maxWorkers:1/fileParallelism:false` 改成 `maxWorkers:4/fileParallelism:true`（测试语义变化，干净合并）。
**`tsconfig.renderer.json` 不覆盖 `src/renderer/settings/**`** → 你新增的 `settings/zones/*.ts`、`settings/memory/*.ts` 不会被 `check:renderer` 类型检查（但 `src/shared/zone-group.ts` 会在 `strict: true` 下被检查）。

---

## 4. 冲突热度排行（双方改动行数相乘）

| 文件 | 你 | 官方 | 风险 |
|---|---|---|---|
| `src/renderer/react/i18n/en.json` | 240 | 1287 | 极高（但可按 key 脚本合并） |
| `src/renderer/react/i18n/zh-CN.json` | 240 | 1286 | 极高（但可按 key 脚本合并） |
| `package-lock.json` | 13 | 10947 | 重新生成 |
| `src/main/channels/dispatcher.test.ts` | 184 | 376 | 重写 |
| `src/main/memory/memory-user-ipc.ts` | 85 | 436 | 实际仅 7/6 行真差异（其余 CRLF） |
| `src/main/orchestrator/agent-runtime.test.ts` | 58 | 316 | 重写测试 |
| `src/renderer/settings/shared/modal.ts` | 46 | 394 | 重写（针对新 modal 契约） |
| `src/main/orchestrator/tools/registry/tool-registry.ts` | 30 | 475 | 实际仅 1+1 行真差异（其余 CRLF） |
| `src/main/agui-bridge.ts` | 12 | 1073 | 行尾噪音为主（真实 12+/3−） |
| `src/main/orchestrator/build-options.ts` | 77 | 144 | 硬 |

**逐块清单（本 lane，按危险度）**：

| 冲突 | 块数 | 性质 | 处置 |
|---|---|---|---|
| `ChatPageNavigation.tsx` | 5 | 你加 `ToolConsoleButton`/`UsageBadge`/`console` 面板；官方换新 `cy-page-titlebar` + `SidebarSearchDialog` + `scheduledTasks` | 并入官方新导航壳 |
| `ChatPagePanelHost.tsx` | 2 | 你渲染 `ModelModePanel`/`PluginModePanel`；官方把 ModelModePanel **删了**，面板迁到 `settings/*SettingsPanel.tsx` | 重写 |
| `tool-registry.ts` | 1 | 你 `execute(args, ctx)` vs 官方 `execute(args)` | 重新推导（官方新增 executor 管线） |
| `build-options.ts` | 1 | 你加 `zones/scope` + `TurnAttribution`；官方加 transcript-context + `UncertainEffect` | import 并集 + 复核函数体 |
| `agent-runtime.ts` | 1 | 你 `buildToneInjection` 4 参 vs 官方 0 参 + `buildAlwaysOnContext` | 语义级 |
| `settings-facade.ts` | 1 | 你 import 已删的 `chat-appearance` + `window-visibility-settings` | 删两个 import |
| `general-settings-lifecycle.ts` | 1 | 你 5 行外观广播（含 `IPC.CHAT_TYPOGRAPHY_CHANGED`）vs 官方 0 | 删除 |
| `general-settings.ts` | 1 | 你加 group-context 设置；官方加 `recentProjects: string[]` | 并集（留意 interface + defaults + normalizer 三处） |
| `react-root.css` / `react/i18n/*.json` | 各 1 | 双方在同一区域追加 | 并集 / 按 key 合并 |

**双方改动都 >50 行的文件只有 8 个** —— 整体可控。

---

## 5. 建议的合并顺序

```
Phase 0（阻塞）  备份：git add -A && git commit 到临时分支（或 git stash -u）
                 确认 74 个未跟踪文件入库 —— 它们只存在于工作区
Phase 1          装 Node 24 LTS + npm 11（engines 硬要求，你现在是 v22.23.2 / npm 10.9.8）
Phase 2          加 .gitattributes + git add --renormalize . 单独提交（消除 CRLF 假冲突）
Phase 3          从 checkpoint 起 git merge -X renormalize b11b8851
                 把冲突标记当工作清单（不要在官方树上手工重贴 2.2MB 改动）
Phase 4  Tier A  直接套用（零官方重叠）：
                 13 个 channels 新模块 + types.ts / agent-policy / message-log /
                 napcat·qqbot 适配器 / proactive-delivery / init.ts(8 处) / history-log.ts；
                 memory 的 24 改 + 18 新（几乎全干净）；zones 8 个 / corpus / zone-group
Phase 5  Tier B  移植到官方形状：
                 - 抽取 USAGE_BADGE_* 三个导出到 src/shared/usage-badge.ts
                 - 28 个新 IPC channel 并入 ipc-channels.ts，删 CHAT_TYPOGRAPHY_CHANGED 及其 3 处引用
                 - i18n 键按 key 合并进 react/i18n（不要按 hunk 合）
                 - settings-store.ts：把你的 toolAccess/keywords/audit 折进官方的 normalize
                 - channel-context.ts：保留官方 ChannelConversationTarget + recordIncomingSession
Phase 6  Tier C  按官方新结构重写：
                 dispatcher.ts / bootstrap.ts / dispatcher.test.ts；
                 ChatPageNavigation.tsx（你的 tool/console 面板要并入官方新导航壳）
                 + 补「dispatcher 确实写 history」的集成测试（防难点 4 的静默失败）
Phase 7  Tier D  边界编译修复：build-options / agent-runtime / tool-registry(execute 签名去掉 ctx) /
                 settings-facade / general-settings-lifecycle / general-settings / agui-bridge /
                 default-dependencies / chat-ui-ipc
Phase 8          删除 vite.config.ts（否则静默遮蔽 .mts）；抢救 host/strictPort 到 .mts；
                 删除 dist/renderer/toast/index.html；取官方 tsconfig.json + tsconfig.renderer.json
Phase 9          取官方 package.json + package-lock.json，重贴 version=1.2.2-PLUS；
                 Remove-Item node_modules; npm ci; npm run build; npm run build:renderer
Phase 10         闸门：tsc -p tsconfig.main.json / tsconfig.preload.json、check:renderer、
                 ipc-contract.test.ts、vitest run（预期 Vitest 5 clearMocks 余波 + 重新快照）
```

### ⚠️ 合并时"神圣不可动"的清单（按你的要求：功能性东西不要动）

以下全部经 `findstr` 确认**官方 0 命中**，是纯增量、无对手的自建能力，合并时只应"保留 + 适配装配点"：

| 必须保留 | 关键文件 |
|---|---|
| 记忆管理 / 控制台 | `src/main/memory/memory-console.ts`、`memory-deletion.ts`、`memory-schema-gate.ts`、`memory-user-ipc.ts`、`src/renderer/settings/memory/**` |
| 按人擦除 / 身份归属 | `src/main/memory/person-attribution.ts`、`person-erase-plan.ts`、`person-erasure.ts`、`run-erasure.ts`、`src/main/channels/transcript-erasure.ts` |
| 区块（zones） | `src/main/zones/**`（8 个）、`src/shared/zone-group.ts`、`src/renderer/settings/zones/**` |
| 渠道控制台 / 审计 | `src/main/channels/audit-log.ts`、`audit-events.ts` + 4 个 IPC handler |
| 工具白名单 | `src/main/channels/tool-access.ts`、`tool-guard.ts`、`resolveChannelAgentPolicy` |
| 关键词策略 | `src/main/channels/keyword-policy.ts`、`interceptByKeyword` |
| 群语料 / 旁听 | `src/main/corpus/group-corpus.ts`、`IncomingMessage.trigger`、`buildGroupContextBlock`、`speakerId/speakerName/triggered` |
| 用量徽章 | `USAGE_BADGE_PRESETS`、`normalizeUsageBadgeColor`、`resolveUsageBadgeImage`、`conversation-usage-store.ts` |
| 群上下文上限 | `groupContextLimit`（`settings-facade` / `general-settings` / `shared/types`） |
| 弹窗确认门 | `confirmValue`（modal.ts，需移植到官方新的 queue-based `renderInputDialog`） |

---

## 6. 证据文件

| 文件 | 内容 |
|---|---|
| `00-diffstat.txt` | 官方 219 提交逐文件 diffstat |
| `01-namestatus.txt` | 官方改动文件全清单（863） |
| `02-official-commits.txt` | 官方 219 提交主题 |
| `10-my-uncommitted.patch` | 你的已跟踪改动补丁（**不含未跟踪文件**） |
| `11-official-219.patch` | 官方全部改动补丁（19.6 MB） |
| `12-overlap-files.txt` | 69 个双方都改的文件 |
| `20-conflicts-git.txt` | 原始 merge-tree 冲突日志 |
| `30-official-deleted.txt` | 官方删除的 78 个文件 |
| `40-conflicts-with-renormalize.txt` | **归一化后 46 个冲突文件（权威清单）** |
| `60-A_official_deleted.txt` | 15 个"官方删除/你仍在改" |
| `60-C_both_modified.txt` | 31 个真三方冲突 |

临时目录：`E:\AI_Chating\_merge-sandbox`（合并沙箱，可随时删除）

---

## 7. 未验证事项（明确声明，非猜测）

1. 未运行 `tsc` / `vitest` / `npm run build` —— 所有"编译断裂"均为类型层阅读结论，非执行结果。
2. 官方 `conversation-transcript-projection.ts`（831 行）未逐行读完，因此**"能否给官方 `TranscriptEntry` 联合类型加一个"旁听/未触发"种类而不破坏投影 reducer 与快照校验"**未确定 —— 这是"群聊旁听上下文应该建在 CTA 上还是继续建在 history-log 上"的决定性未知项。
3. 官方 `chats-store.ts`（1203 行重写）是否改变了 session/conversation-id 空间、从而影响 `history-log` 的 `sessionId` 键（`safeName` / `sessionIdFromFileName` 反解）—— 未审计，值得后续跟进。
4. `src/main/channels/adapters/**` 内部哪些适配器被官方改动未逐一枚举（`napcat-adapter.ts` 本身 0 官方提交）。
