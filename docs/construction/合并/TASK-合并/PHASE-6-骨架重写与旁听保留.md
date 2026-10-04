# Phase 6 施工蓝图：骨架重写与旁听保留（Tier C）

> **执行者**：agent。本文件**自包含**，不需要对话历史即可执行。
> **风险等级**：**高**（全任务最高 —— 渠道主链路 + orchestrator 依赖面，且含 3 处**静默隐私回归**风险）
> **预计耗时**：180–300 分钟
> **文档规范**：见 [`../methodology/BLUEPRINT-撰写规范.md`](../methodology/BLUEPRINT-撰写规范.md) §4（施工蓝图 **12 节**）
> **前置**：P5 已完成（[`PHASE-5-完成报告.md`](PHASE-5-完成报告.md)）—— `UU` 已收敛到 **9 个文件**
> **读取纪律**：不要通读 `../methodology/`。本阶段只需 **3 份**：撰写规范**相关章节** + [`BLUEPRINT-总蓝图.md`](BLUEPRINT-总蓝图.md) **相关节** + 本文档。

> ⚠️ **立项决定（2026，项目所有者已拍板）**：
> **旁听迁进 CTA 轨迹（D3 的方案 1）本次不做。**
> 用户在「A 分两步 / B 一次做完 / C 只做骨架重写、CTA 迁移不做」三选一中选了 **C**。
> 因此本 Phase **不新增任何 transcript kind**、**不改 `conversation-transcript-*`**、**不动 `history-log.ts`**。
> 旁听 A 继续由 `history-log.ts` 的 `buildGroupContextBlock` 承担（详见 §一 非目标 · N1）。

---

## ★ 零、执行者先读这一节（3 处拍板 + 3 处块外陷阱）

> 本节是 33 个 channels 冲突块**逐块实测分析**的结论汇总（另 3 块在 §四 4.2–4.4）。
> **§四 的逐块表告诉你"做什么"，本节告诉你"为什么"以及"哪里会踩空"。**

### 决策 D-α · 全局策略 S（决定 30 个块，无需你判断）

| 文件 | 策略 |
|---|---|
| `channel-context.ts` | **取 ours**（保留本地历史能力）+ **删掉官方新增的绑定三件套** |
| `bootstrap.ts` / `dispatcher.ts` | **以官方 canonical journal 骨架为主** + **手工重挂本地能力**（history-log 写入、工具白名单、拦截关键词、P2 归属）+ **剥离绑定** |
| 3 个测试文件 | 见「决策 D-γ」 |

**为什么骨架必须用官方的（实测，非偏好）**：`DispatcherDeps.journal` 是**必填字段**（`dispatcher.ts:105`，块外）、
`bootstrap.ts:110-115` 已构造 `conversationJournal`、`:401` 已注入；
`ChannelAgentInput` / `ChannelConversationJournal` / `makeChannelTurnId` / `toJournalAttachments` / `broadcastIncoming` 等 **9 个成员全在冲突块之外、已由自动合并就位**。
**改回 ours 的旧路径要删掉约 350 行块外代码** —— 那不叫"解决冲突"，那叫重写。

### 决策 D-β · D1 的删除是**唯一自洽解**（实证推翻 `01` 文档的方案甲）

[`01-已拍板决策与技术修正.md`](01-已拍板决策与技术修正.md) §二 曾推荐「**方案甲**：官方 store 原样保留 + 保留官方 `resolveBoundConversationId`（永远返回 null）+ 完全不用碰 channel-context / dispatcher / bootstrap」。

**实测证伪（本次复核）**：

```
conversation-binding-store.ts 的索引版（stage 0，blob 50b3a290，178 行）只有：
  :104  flush(): void
  :108  list(): ChannelConversationBindingSnapshot
官方 MERGE_HEAD 版却有（:119 / :132 / :141）：
  bind(sessionId, conversationId, updatedAt) / unbind(sessionId) / resolve(sessionId)
```

→ **`bind` / `unbind` / `resolve` 已被自动合并"干净删除"（取了 HEAD 版）**。
官方 `bootstrap.ts:137-140` 的 `getChannelConversationBindingStore().resolve(sessionId)` 在合并树里**必然 TypeError**
（被官方自己的 try/catch 吞掉 → 每条渠道消息打一条 warn 并永远回退 sessionId）。
**方案甲要恢复就得反向加回被删代码 → 已不可达。D1 的"删除"是唯一自洽解。**

> ✅ **好消息（省掉一大块工作）**：D1 的改动面**不溢出本批**。
> 全仓库 `boundConversationId|resolveChannelConversationTarget|ChannelConversationTarget|resolveBoundConversationId` 共 **30 处命中，全部落在这 6 个文件内**。
> 另：`queue.run()` 的绑定分支（官方 `stage3:177-179` 的 `context.boundConversationId ? queue.run("conversation:…")`）**已被 git 静默丢弃**，
> 块外 `handleIncoming` 整段是 ours → **队列 key 这一项已经对了，不要再去"修"它**。

### 决策 D-γ · 🔴 三处**必须拍板**的分叉点（其余 30 块由策略 S 唯一确定）

| 分叉点 | 议题 | **本蓝图的决定** | 依据 |
|---|---|---|---|
| **bp-4** | `bootstrap.ts` 的群聊 `historyMessages`（把 `speakerName` 补回正文 `[小明]: …`）**是否接线到 agent messages** | **取 theirs（不接线）** | ① 模型消息源已由 `journal.buildModelContext()`（块外 `:287`）接管，再叠一层会把**同一批消息注入两遍** —— ours 自己的注释就警告过这个坑；② **旁听 A 不经过这里**（它走 `buildGroupContextBlock`），所以取 theirs 不会切断旁听；③ 群聊"谁说的"由官方 `appendPresentation` 的 `channelSource.senderName` 承担<br>⚠️ **若取 ours，必须真的接线**；只留声明不接线 → `historyMessages` 成死变量（未开 `noUnusedLocals`，**编译器不提醒**），表现为"群里所有人都显示成请求方说的" = 典型静默坏 |
| **dp-5** | `dispatcher.ts` 是否保留 `appendIncomingContext`（渠道历史**写入**） | **保留（保留 ours 的写入调用）** | P5 交接第 3 条 + 总蓝图 §8.2 A3：**A6 静默失效探测器就是断言这一行落盘**。⚠️ 必须与 `dpt-9`（`expect(appendHistory)` 断言）**同侧**；且**顺序不能反**：先 `resolvePriorMessages` 再 `appendIncomingContext`，否则本条消息被模型读两遍 |
| **dpt-10** | `dispatcher.test.ts` 官方的 **9 条** canonical 用例（并发串行 / 送达回执 fail-safe 矩阵 / 重放保护）是否保留 | **保留（追加合并）** + 保留 ours 的 2 条拦截关键词用例 + **改写** ours 的 3 条 P2 归属用例 | 那 9 条守的是**本 Phase 保留下来的 journal 骨架**；删了等于"代码在跑但没有回归网"，P7/P8 会把红点集中爆发在别处。D1 不影响它们（断言用 `expect.any(String)` 取 conversationId） |

> 🔴 **`bp-4` 的翻转条件**：仅当你决定**放弃官方 journal 骨架**（= 删约 350 行块外代码）时才取 ours —— 那就变成另一个 Phase 的活了。**本 Phase 不做。**

### 🔴 三处「冲突块之外」的陷阱（**自动合并造成，冲突扫描器看不见**）

| # | 位置 | 症状 | 必须做的动作 |
|---|---|---|---|
| **X1** | `channel-context.test.ts:8` + `:27-36` | 这是**官方新增**的绑定用例（`resolveChannelConversationTarget({boundConversationId:"desktop-1"})`），**落在 135-468 冲突块之外**。删掉 `resolveChannelConversationTarget` 后它会 **import 解析失败 → 整个 suite 加载失败 → 该文件 25 个用例全红**（含 18 个本地能力用例），而红因显示为 import 错误 → 极易被误判成"取 ours 取错了" | **手删**：`:8` 的 import 名 + `:27-36` 整个 `it(...)`。实测：该绑定用例在**本地版（stage 2）里不存在**、只存在于官方版（stage 3 `:7`/`:26-32`） → 删它不损失任何本地能力覆盖 |
| **X2** | `bootstrap.test.ts` 的 harness（`buildAndRunAgent` 4 参形式） | 它在**块外**且**已是 ours 的 4 参形式**（`buildAndRunAgent(msg, "channel:…:test", [], userMessageId)`）；`bp-3` 取官方 2 参签名后，官方写的 `typeof input === "string"` 兼容分支会**静默吞掉** `priorMessages` / `userMessageId` → 块外**已合并就位**的 3 个 P2 用例（断言 `context.userMessageId === "msg_1758681234567_a3f9k2"`）红，而**红点附近没有任何冲突标记** | **必须与 `bp-3` 同批次改**：把 harness 改成传对象（`{ sessionId, conversationId, userMessageId, … }`） |
| **X3** | `bootstrap.ts` 的 `userMessageId`（块外已合并） | `ChannelAgentInput` 若没有 `userMessageId?: string`，块外那句 `...(userMessageId ? { userMessageId } : {})` 每次成功轮次抛 **ReferenceError** | 在 `ChannelAgentInput` 里**新增** `userMessageId?: string`（最终形态见 §四 4.5.2） |

### 「静默坏 / 响亮坏」对照表（决定验收能不能抓到）

| 坏法 | 症状 | 谁能抓到 |
|---|---|---|
| `appendChannelHistory` 注入被丢（`bp-7` 取 theirs） | 渠道历史**只读不写** → `channels/history/<sid>.jsonl` 永不增长 → `loadRecentHistory({conversationOnly:true})` 恒空 | **只有 A6 静默失效探测器**；其余测试全绿 |
| `appendIncomingContext` 不保留（`dp-5` 取 theirs） | 同上（同一后果） | 同上（**A6 就是为它写的**） |
| `historyMessages` 只声明不接线（`bp-4` 取 ours 但忘了接） | 群里所有人显示成请求方说的 | **无测试覆盖**（纯静默） |
| `userMessageId` 未定义（X2/X3） | **ReferenceError** | `bootstrap.test.ts` 的 3 个 P2 用例（**响亮**） |
| `grantedTools` 未声明（`bp-5` 只取 theirs） | **ReferenceError** → 渠道消息全链路崩 | `bootstrap.test.ts` 真链路用例（**响亮**） |
| `trace` 第 3 参被删（§四 4.3 取 theirs） | 群聊旁听**静默消失** | `group-context-injection.test.ts`（≥5 条断言） |
| `getAllL2()`（§四 4.4 取 theirs） | 群聊能捞出桌面私聊 L2（**跨域隐私回归**） | `tool-registry-memory.test.ts:143` |

### 📌 两条与"将来做 D3 迁移"有关的事实（**本 Phase 不用，但必须记下来**）

1. **旁听 A 的真实写入点不在 `dispatcher`，而在 `src/main/channels/adapters/qq/napcat-adapter.ts` 的 `writeObservedTranscript()`**
   （`appendHistory(makeSessionId(...), "user", content, { speakerId, speakerName, isBot:false, triggered:false })`，只处理群聊）。
   [`03-旁听迁移方案修订.md`](03-旁听迁移方案修订.md) §四 第 6 项写的是"dispatcher 未触发分支" → **定位需修正到 adapter**。
2. 旁听 A 的**读取点**是 `src/main/orchestrator/index.ts:157` 的 `buildGroupContextBlock(trace.sessionId, limit)`。
   → 将来迁移 `observed_message` 必须**同时替换这两个端点**，否则会变成"写轨迹、读 jsonl"的劈叉。

> ⚠️ **D3 的 D-β 附带结论**：`01-已拍板决策与技术修正.md` §二 的"方案甲"与本条冲突，已在该文档补注（见 §十三 回写清单 T3）。

---

## 一、施工目标

### 核心问题（为什么需要本 Phase）

P5 之后剩余的 **9 个文件 / 36 个冲突块**全部落在**渠道主链路**与 **orchestrator 依赖面**上，
它们不是"两段代码并排"，而是**官方把渠道链路整体重写成了 CTA journal 路径**，与本地新增的三套能力撞在同一批函数里：

| # | 撞车点 | `file:line` | 实测事实 |
|---|---|---|---|
| 1 | **桌面对话绑定** | `channel-context.ts:33,37-48,96,185-200`、`dispatcher.ts:35-36,87,234` | 官方新增 `DispatchContext.boundConversationId` + `ChannelConversationTarget` + `resolveChannelConversationTarget()` + `CreateChannelContextOptions.resolveBoundConversationId`；**D1 要求整条删除** |
| 2 | **渠道历史读写（本地）** | `channel-context.ts:2-8,13-48,56-97,211-264` | 本地新增 `ChatMessage`（带 `speakerName`/`speakerId`/`triggered`）、`resolvePriorMessages`、`appendIncomingContext`、`appendAssistantContext`、注入点 `loadRecentChannelHistory`/`appendChannelHistory` |
| 3 | **群聊旁听上下文（本地）** | `orchestrator/index.ts:150-162` ← `history-log.ts:364 buildGroupContextBlock` | 该方法**只在本地存在**（官方 219 提交从未碰过 `history-log.ts`，故它**不是冲突文件**）；它是 D3-M 阶段旁听的**唯一承载体** |
| 4 | **owner 域隔离（本地）** | `build-options.ts:65-94`（冲突块）、`:126`、`:635-644`、`:662` | 本地给 `ChannelTraceContext` + `normalizeGroupContextLimit` + `resolveScopeId/rootScope`；**取错侧 = 群里会注入你的私人画像与关系线（静默隐私回归）** |
| 5 | **记忆限域（本地）** | `tool-registry.ts:376-391` | 本地 `read_memory` 走 `resolveScopeId(ctx?.conversationId)` + `getL2ForScope`；官方侧是 `(args)` + `require()` + `getAllL2()` → **取错侧 = 群聊能捞出桌面私聊的 L2** |

### 目标清单（可勾选）

- [x] **T1** 9 个文件的 **36 个冲突块**全部解决；这 9 个文件的冲突标记数 = **0**
- [x] **T2** **D1 落地**：`boundConversationId` / `ChannelConversationTarget` / `resolveChannelConversationTarget` / `resolveBoundConversationId` 从**生产代码**中消失（`conversation-binding-store.ts` **保留**，见 §一 非目标 N2）
      > 📌 **执行时的判据收窄（依据 §四 4.5 的说明 + 实测）**：删的是**绑定语义**，不是这三个**名字**。
      > 实测 `ChannelConversationTarget` 被 `dispatcher.ts` 的 `ChannelAgentInput.target` 与非冲突区 6 处
      > `target.conversationId` 使用，且 `conversation-transcript-phase2.acceptance.test.ts` 直接断言
      > `input.target.conversationId` → **保留该 interface**（已去掉 `boundConversationId?` 字段，形态为 `{ conversationId: string }`）。
      > **D1 的实质判据（A3）仍严格达标**：`resolveChannelConversationTarget` 与 `resolveBoundConversationId` **全仓库 0 命中**。
- [x] **T3** **群聊旁听继续可用**：`history-log.ts` 零改动；`buildGroupContextBlock` 的调用链（`index.ts:154-162`）完好；新增一条**静默失效探测器**测试（§六 A6）
- [x] **T4** **隐私边界不回归**：`build-options.ts` 的 owner 域隔离与 `tool-registry.ts` 的 `read_memory` 限域**两个都不能丢**
- [x] **T5** 全仓库**第一次能编译**：`tsc -p tsconfig.main.json` 的 **TS1185（冲突标记）归零**；剩余错误全部能归因到「不算失败」清单
- [x] **T6** 语料豁免边界完好：`memory-deletion.test.ts` + `group-corpus-isolation.test.ts` **全绿**（D4 的守卫）
- [x] **T7** 人工环节：登记/回执 H-08、H-09（§五）

### 非目标（明确不做）

| 不做 | 为什么 | 何时做 |
|---|---|---|
| **N1** ❌ 把旁听迁进 CTA 轨迹（D3 方案 1） | **项目所有者已拍板本次不做**（三选一选 C）。理由：往 CTA 写新 kind 属**协议级不可回撤**改动（`append` 不查白名单、**读盘才 fail-closed** → 写能成功、读会被拒 → 整段对话加载失败/消息静默丢失），而 P6 本身已是最高风险 Phase，两者混在一次验收里失败时无法归因 | 合并完成后的**独立功能变更**；设计清单已备好（见 §二 事实 6） |
| **N2** ❌ 删 `src/main/channels/conversation-binding-store.ts` | D1 删的是**"渠道消息路由到桌面对话"这条链**，不是这个存储类。实测它**未被本次合并改动、也不冲突**，且被 `memory-console.ts:35`、`person-erasure.ts:67`、`person-erase-plan.ts:27`、`zones-ipc.ts:10` 使用（其中「按人擦除」是 11 项受保护功能之一） | 永不（它是**其他功能的依赖**） |
| **N3** ❌ 改 `src/main/channels/history-log.ts` | 它是**本地已提交**版本（blob `c7e54e88`，与 HEAD 逐字节相同），官方从未碰过它 → **不在冲突清单里**。它含 16 个本地独有导出 | 永不（旁听 A 的承载体） |
| **N4** ❌ 改 `src/main/corpus/**` | D4 硬约束：语料是"只增不减的长期资产"，物理上必须在 `MEMORY_TARGETS` 之外 | 永不 |
| **N5** ❌ 新增/删除任何 transcript kind | 见 N1 | 见 N1 |
| **N6** ❌ `npm ci` / 改 `package.json` / 重建 `package-lock.json` | P8 的活 | P8 |
| **N7** ❌ 删除任何测试文件 | 属产品决定；「失去被测对象」的测试已有处置流程（H-07 / J-08 / J-09） | P8（H-07） |
| **N8** ❌ 提交 | 提交时机在 **P7 之后** | P7 之后 |

---

## 二、实测证据（决定本 Phase 做法，执行前请读）★

> 全部为本次撰写会话在**同一工作区**实测；命令可复现，不要凭记忆推断。

### 事实 1 · 范围：9 文件 / 36 块（权威坐标）

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$env:PATH = "D:\data\node24;" + $env:PATH
cd E:\AI_Chating\cyrene-agent
$p6 = @(
 'src/main/channels/bootstrap.ts','src/main/channels/bootstrap.test.ts',
 'src/main/channels/channel-context.ts','src/main/channels/channel-context.test.ts',
 'src/main/channels/dispatcher.ts','src/main/channels/dispatcher.test.ts',
 'src/main/orchestrator/agent-runtime.ts','src/main/orchestrator/build-options.ts',
 'src/main/orchestrator/tools/registry/tool-registry.ts')
$tot = 0
foreach ($f in $p6) {
  $l = [System.IO.File]::ReadAllLines((Resolve-Path -LiteralPath $f))
  $spans = @(); $i = 0
  while ($i -lt $l.Count) {
    if ($l[$i] -match '^<{7} ') {
      $s = $i + 1; $m = -1; $e = -1; $j = $i + 1
      while ($j -lt $l.Count -and $m -lt 0) { if ($l[$j] -match '^={7}$') { $m = $j + 1 }; $j++ }
      while ($j -lt $l.Count -and $e -lt 0) { if ($l[$j] -match '^>{7} ') { $e = $j + 1 }; $j++ }
      $spans += "$s-$e"; $tot++; $i = $j
    } else { $i++ }
  }
  "{0,4} 行 | {1,2} 块 | {2}" -f $l.Count, $spans.Count, $f
  "         块行区间: " + ($spans -join ', ')
}
"===== P6 合计: $tot 块 / $($p6.Count) 文件（期望 36 块 / 9 文件）====="
```

**实测结果（写本文档时的坐标；执行时重新扫描，判据是"块数 36 / 文件数 9"）**：

| 文件 | 行数 | 块数 | 冲突块行区间 |
|---|---|---|---|
| `src/main/channels/bootstrap.ts` | 449 | **7** | `21-28`, `102-117`, `130-145`, `171-193`, `228-238`, `311-337`, `373-378` |
| `src/main/channels/bootstrap.test.ts` | 560 | **4** | `9-13`, `63-79`, `84-92`, `220-264` |
| `src/main/channels/channel-context.ts` | 281 | **5** | `2-8`, `13-48`, `56-97`, `185-200`, `211-264` |
| `src/main/channels/channel-context.test.ts` | 470 | **1** | `135-468`（ours 331 行 / theirs 0 行） |
| `src/main/channels/dispatcher.ts` | 498 | **6** | `45-48`, `113-120`, `219-238`, `244-281`, `306-345`, `376-380` |
| `src/main/channels/dispatcher.test.ts` | 1055 | **10** | `76-84`, `98-103`, `206-277`, `297-304`, `309-321`, `327-351`, `360-363`, `385-391`, `416-425`, `613-1052` |
| `src/main/orchestrator/agent-runtime.ts` | 409 | **1** | `216-228` |
| `src/main/orchestrator/build-options.ts` | 1202 | **1** | `65-94` |
| `src/main/orchestrator/tools/registry/tool-registry.ts` | 485 | **1** | `376-391` |

### 事实 2 · 🔴 冲突块**不是**整合面 —— 孤立决策会产出编译不过的树

**实测**（去 CRLF 噪声后 `git diff` stage2↔stage3 的变更点数）：

| 文件 | 冲突块 | **真实整合面（变更点）** |
|---|---|---|
| `agent-runtime.ts` | 1 | **15 处** |
| `build-options.ts` | 1 | **20 处** |
| `tool-registry.ts` | 1 | **6 处** |

**推论（必须理解）**：非冲突区已被三方合并按「谁改谁赢」**混入了双方内容**。
所以"逐块二选一"**不足以**让文件编译通过 —— 每处改动都必须核对**它在非冲突区的调用方**。

> 🔴 **纪律**：每个块处理完后，**立刻**对该文件跑一次
> `npx tsc -p tsconfig.main.json 2>&1 | Select-String "<文件名>"`，
> **不要**等全部 36 块做完再一起编译（那时定位成本翻十倍）。

### 事实 3 · 🔴 D1（删绑定）的**正确做法**已由官方架构本身给出

**实测**：官方渠道主链路把消息写进 **CTA journal**，键就是"目标会话 id"：

```
bootstrap.ts:12-13   import { ConversationJournalService } / { getConversationTranscriptStore }
bootstrap.ts:401     journal: conversationJournal        ← 注入 dispatcher
dispatcher.ts:105    readonly journal: ChannelConversationJournal;   // "Canonical journal; it is the sole model-history source."
dispatcher.ts:233-234  const journal = this.deps.journal!;
                       const target = resolveChannelConversationTarget(context);
dispatcher.ts:250      const userEntry = await journal.appendUser(target.conversationId, {...});
dispatcher.ts:287      const modelContext = await journal.buildModelContext(target.conversationId);
```

而 `resolveChannelConversationTarget` 的全部逻辑就是：

```ts
// channel-context.ts:42-48（官方侧）
return context.boundConversationId
  ? { conversationId: context.boundConversationId }     // ← 绑定到桌面对话
  : { conversationId: context.sessionId };              // ← 否则用它自己
```

**→ 删掉绑定后，渠道自动落进"以 `context.sessionId` 为键的自有 CTA 会话"**：
官方那句注释（工作区 `channel-context.ts` 非冲突区）已经把这个状态写出来了：

> `resolveDispatchContext(sessionId: string): DispatchContext;` 上方的注释：
> **「解析一次上下文快照（渠道会话自带短期上下文，不再绑定桌面对话）。」**

**所以 D1 的施工是"删除"，不是"重写"** —— 这是本 Phase 最省力的一条。

### 事实 4 · 🔴 旁听不会因为 D1 消失（**必须照此保住**）

| 环节 | 实测 | 结论 |
|---|---|---|
| 本地旁听写入 | `bootstrap.ts:377` 注入 `appendChannelHistory`（= `history-log.appendHistory`）；`channel-context.ts:211-264` 的 `appendIncomingContext` 用 `stripSpeakerPrefix` + `{speakerId,speakerName,isBot:false,triggered:true}` 写盘 | **与绑定无关**，删绑定不影响它 |
| 旁听读取 | `orchestrator/index.ts:154` `if (trace?.chatType === "group")` → `:157 buildGroupContextBlock(trace.sessionId, limit)` → `:158 parts.push(...)` | 依赖 `trace`（见事实 5），**不依赖 CTA** |
| 旁听判别 | `history-log.ts:137-146`：`observedOnly` → `role==="user" && triggered===false` | **`triggered` 字段就是旁听标记** |
| `history-log.ts` 状态 | blob `c7e54e88`（556 行）= HEAD，**非冲突文件**，官方 219 提交从未碰过 | **零改动**（N3） |

> ⚠️ **`observed_message` 的载荷语义（留给未来的 P6b，不要现在做）**：
> `buildGroupContextBlock` 返回的是**已排版的多行字符串**（首行 `【群聊近期上下文】`，其后每条 `[说话人]: 正文`），
> **不是消息数组**。将来若真做迁移，需先决定迁"原始 observed 条目数组"还是"渲染结果"
> —— 照抄字符串会得到「N 条真消息压成 1 条文本」的 entry，与"迁进轨迹"的语义不符。

### 事实 5 · `trace`（`ChannelTraceContext`）是群聊旁听的**命脉**

```
build-options.ts:65-87（ours 侧）  定义 ChannelTraceContext + import resolveScopeId/rootScope/TurnAttribution/normalizeGroupContextLimit
build-options.ts:126               deps.buildAlwaysOnContext(userText, messages, trace?)   ← 第 3 参
build-options.ts:657-666           trace = { sessionId, chatType, groupContextLimit: normalizeGroupContextLimit(...) }
build-options.ts:666               deps.buildAlwaysOnContext(latestUserText, slimMessages, trace)
orchestrator/index.ts:113          buildAlwaysOnContext(..., trace?: ChannelTraceContext)
orchestrator/index.ts:154,157      用 trace.chatType / trace.sessionId
agent-runtime.ts:216-228（冲突块）  决定 trace 到底传不传进去
```

**官方侧把这 3 个参数删成了 2 个**（`agent-runtime.ts:225-227` 的 theirs 段）。
→ **若某个块取 theirs，`trace` 变 `undefined` → `index.ts:154` 恒 false → 群聊旁听静默消失（无报错、无测试失败）。**

### 事实 6 · 备份：若将来要做 CTA 迁移，清单已备好（**本 Phase 不执行**）

> 仅供将来立项时参考，**P6 不要动这些文件**。

| 位置 | 不改的后果 |
|---|---|
| `conversation-transcript-types.ts:214-254`（`TranscriptEntry` 联合，现有 **10** 个 kind） | TS 编译不过，写不进去 |
| **`conversation-transcript-store.ts:702-706`（`kinds` Set，fail-closed ①）** | **读回转瞬即 `TRANSCRIPT_CORRUPT_ROW`，消息静默丢失** |
| **`conversation-transcript-store.ts:732-784`（`isValidTranscriptPayload` 的 `switch`，`default: return false`，fail-closed ②）** | 同上 |
| `conversation-transcript-projection.ts:109-149` / `:534-605`（两个投影 `switch`，`default: break` **不抛错**） | 消息在轨迹里但模型/UI 看不见 |
| `conversation-transcript-types.ts:290`（`assertValidTranscriptDraft`） | 仅当需要额外字段约束时才改 |

> 🔴 **最危险的静默窗口（这就是本次不做的理由）**：
> `append`（`store:135`）**不查 kind 白名单**（`assertValidTranscriptDraft` 只校验 id / user-revision / replace_user），
> **写能成功、读会被拒** —— 而且**全代码库没有 `assertNever` 穷尽性守卫**，编译器**完全不会提醒**。

### 事实 7 · P6 施工期回填的 4 处「块外缺口」（撰写者已逐条复算）

> 这 4 处在原蓝图里**没有覆盖**，由执行者按证据自行修正并请确认。
> **撰写者复算结论：4 条全部成立**；其中第 3 条的括号注释措辞需改（见下），其余 3 条连措辞都不用动。

| # | 执行者的修正 | 撰写者复算证据 | 判定 |
|---|---|---|---|
| 1 | `build-options.ts` **补回 5 个转录 import** | `git show HEAD:<文件>` 与 `git show eb6c311a:<文件>` 对该组 6 个符号各命中 **0 次**；官方侧这些 import 在 **`:65-69`（块内）**，而非原文所称"块外 `:95-99`"。只取 ours → 块外官方新增代码逐个 `TS2304` | ✅ 成立，并**改正了本文 4.2 的原错误说法** |
| 2 | `dispatcher.ts` **删除 `broadcastIncoming` / `broadcastOutgoing`** | ours（`HEAD`）侧该组标识符 **0 命中**（官方新增）；`bootstrap.ts` 注入 `broadcastChat`：ours **0** / 官方 **2** / 工作区 **0** → `?.` 恒为 no-op；其唯一前置 `settings.mirrorToDesktop` 已被本地作业从 `ChannelsSettings` 删除（`settings-store.ts:379` 的 migrate 注释为证） | ✅ 成立（删掉的是**永不执行**的分支） |
| 3 | 修官方新测试 `conversation-transcript-phase2.acceptance.test.ts` 的夹具（补 `keywords`、去 `mirrorToDesktop`） | 工作区 `dispatcher.ts:188` 是 `this.settings.keywords.intercept`（**没有 `?.`**）→ 官方夹具缺 `keywords` 即 `TypeError`；`tsconfig.main.json` 的 `exclude` 含 `src/main/**/*.test.ts` → **编译器不会提醒**；`vitest.config.ts` 的 `include` 含 `src/main/**/*.test.ts` → vitest 会收到该文件 | ✅ 修正动作成立。⚠️ **但括号注释「这条测试此前从未真正跑过」措辞需改**：官方 dispatcher 只读 `rateLimitPerUser` / `rateLimitPerChannel` / `ttsEnabled` / `stickerEnabled` / `mirrorToDesktop` 共 5 个字段，官方夹具**恰好全给了** → 它在官方侧是够用的；准确表述是「**本分支合并前该文件不存在**，合并态下跑不通」 |
| 4 | `tool-registry.ts` **整体取 ours** | `git diff --ignore-cr-at-eol eb6c311a MERGE_HEAD -- <该文件>` = **1 行改动（一句注释措辞）**；`… eb6c311a HEAD` = **30/28 行**（限域那套） | ✅ 成立。取 ours 只丢那句注释改词，**不丢任何官方功能** |

> ⚠️ **测量方法教训（应进经验库）**：判断"官方相对我们改了什么"**必须**用
> `git diff --ignore-cr-at-eol <合并基> MERGE_HEAD`。不做 `--ignore-cr-at-eol` 时，
> 行尾 CR 差异会把整个文件报成改写（本例 `eb6c311a → MERGE_HEAD` 报 **475/475 行**），
> 让"官方只改了一句注释"这一**正确**判断看起来是假的。

> **附带发现（不在上述 4 条内，撰写者本轮扫描得到）**：D1 的可见面还没清干净 ——
> 官方 React 面板**仍渲染**「镜像到桌面」开关（`ChannelsSettingsPanel.tsx:26` / `:281`，
> 路由 `AppearanceSettingsPage.tsx:282`，文案 `react/i18n/{zh-CN,en}.json:1058`），
> 而主进程已不读该字段 → **能翻但毫无作用的死开关**。已登记为 `HUMAN-人工验证台账.md` **H-14 第 5 步**，
> 并作为 **P7 的待办**（渲染层清残留）；**不属于 P6 范围**（P6 只动 channels + orchestrator）。

### 事实 8 · 撰写者对 P6 交付态的独立复核（报告到达后实测）

**① 报告的核心结论已独立复现（不是"只读报告"）**

| 复核项 | 撰写者实跑结果 | 报告声明 | 一致 |
|---|---|---|---|
| A9 定向门禁（12 文件） | **Test Files 12 passed / Tests 269 passed** | 12 / 269 | ✅ 逐字吻合 |
| `tsc -p tsconfig.main.json` | **恰好 1 条**：`create-aux-windows.ts(36,55) TS2694`（①类依赖） | 22 → 1，①类 | ✅ |
| `tsc -p tsconfig.preload.json` | **exit 0** | exit 0 | ✅ |
| 冲突标记（全仓库 `src`） | **0** | 0 | ✅ |
| `UU` / `UD` / `DU` / `AA` | **全 0** | 全 0 | ✅ |

**② 🔴 索引 ≠ 工作区 —— 提交前必须处理**（报告 §二 写"9 文件状态 `M`（已 staged）"，实测**有 5 个文件是 `MM`/`AM`**：工作区已修、索引仍是修前态）

| 文件 | 工作区比索引多出的内容 | 索引侧的后果 |
|---|---|---|
| `dispatcher.ts` | 删 `broadcast*` 两方法 + 2 处调用（偏差 3） | 索引版**带** 4 条 `TS2339` |
| `build-options.ts` | 补回 5 个转录 import（偏差 2） | 索引版**缺** import → 18 条 `TS2304` |
| `channel-context.ts` | 保留并重新导出 `ChannelConversationTarget`（偏差 7） | 索引版 → 2 条 `TS2305` |
| `conversation-transcript-phase2.acceptance.test.ts` | 夹具补 `keywords`、去 `mirrorToDesktop`（偏差 4） | 索引版跑该测试即 `TypeError` |
| `HUMAN-人工验证台账.md` | 回写 + H-14 第 5 步 | 索引版缺这些内容 |

> **即：此刻提交，会提交一棵"编译不过"的树。** 修正命令（下一个 Phase 起手第一批做）：

```powershell
git add -- src/main/channels/dispatcher.ts src/main/channels/channel-context.ts `
  src/main/orchestrator/build-options.ts `
  src/main/orchestrator/conversation-transcript-phase2.acceptance.test.ts `
  "docs/construction/合并/TASK-合并/HUMAN-人工验证台账.md"
git diff --ignore-cr-at-eol --name-status   # 期望：只剩 docs 旧路径的 D 行
```

**③ 🔴 任务文档处于"搬了家但索引没搬"的半状态**

| 位置 | 索引 | 磁盘 | 后果 |
|---|---|---|---|
| `docs/merge-plan/*.md`（14 个，含旧《总蓝图》《PHASE-1..3》） | **在索引里**（已 staged） | **不存在**（`git diff` 报 `D`） | 提交后仓库会留下 14 个磁盘上不存在的文档 |
| `docs/construction/合并/TASK-合并/*.md`（22 个：本任务全部蓝图/报告/台账） | **仅 2 个**（台账、`PHASE-5-完成报告.md`） | 全部存在 | 提交会漏掉 20 个文档，且那 2 个成为旧路径条目的"副本" |

> 二选一 —— **已拍板选 A**（记入 [BLUEPRINT-总蓝图.md](BLUEPRINT-总蓝图.md) §五 **D6**；理由：任务文档是过程产物，不该进合并提交）：
> - **A 排除**：`git reset -q -- docs/merge-plan "docs/construction/合并"` → 索引不再有文档条目，磁盘文件保持未跟踪。
> - **B 收编**：`git add "docs/construction/合并"` + `git rm -r --cached --quiet docs/merge-plan` → 22 个文档进提交、旧路径条目清掉。

**④ 审计发现：报告 §九 的"4 处超范围修正均已获确认"与实际确认清单不符**

- 实际送确认的是这 4 条：① `build-options` 补 import ② 删 `broadcast*` 死代码 ③ 修 acceptance 夹具 ④ **`tool-registry` 取 ours**。
- 但报告 §九 的 ④ 写成了「保留 `ChannelConversationTarget`」，且 §十二 子节 1 还有**第 5 处**（`bootstrap.ts` 删 `typeof input === "string"` 兼容分支）——**这两处从未单独送确认**。
- 撰写者实测两处都**站得住**：`ChannelConversationTarget` 被 `channel-context.ts` 1 处定义 + `dispatcher.ts` 4 处引用，且 `acceptance.test.ts` 断言 `input.target.conversationId`；string 分支的唯一调用方 `dispatcher.ts`（`:115` 定义 / `:309` 调用）传的都是对象，删掉不会留下悬空调用。
- **处置（已完成）**：项目所有者已在复核轮次**追认**这 2 处改动；报告 §九 的超范围清单已**就地标注补正**为实际的 5 条（原文保留不改）。

**⑤ 渲染层残留（不在 P6 范围，交接给 P7；以下为实测，不是推测）**

`tsc -p tsconfig.renderer.json`（**P6 报告完全未跑**）实测 **48 条错误**：

| 类别 | 条数 | 性质 |
|---|---|---|
| `TS2307` 模块未安装 | **29**（`simple-icons` 9 / `radix-ui` 4 / `@lobehub/icons` 3 / `motion/react` 2 / 其余 7 个模块各 1） | ①类，`npm ci` 后应消失 |
| `TS7006` / `TS7031` 隐式 `any` | **13** | 缺模块的连带（参数类型来自那些模块） |
| `TS7016`（`qrcode` 无类型声明） | 1 | 需 `@types/qrcode` 或 `declare module` |
| **`TS2339`：在调已删除的 IPC** | **5** | 🔴 **真问题，不是连带** |

🔴 **`ChannelsSettingsPanel.tsx` 仍在调 D1 已删除的绑定 IPC**：`channelsContextBindingsGet`（`:19` / `:102` / `:115`）、`channelsContextBind`（`:170`）、`channelsContextUnbind`（`:181`）。全仓库实测这三个名字**只出现在渲染层**（面板 5 处 + `ChannelsSettingsMigration.test.ts` 3 处 fixture），**`src/preload` / `src/shared` / `src/main` 的定义面 = 0 命中**。

> 后果不是"少一个按钮"：`:115` 的挂载副作用把 `api.channelsContextBindingsGet()` 写在 `Promise.all([...])` 的**实参**里 —— 数组求值时即 `TypeError: ... is not a function`，**同步抛在 `useEffect` 内，`.catch` 兜不住** → **「设置 → 渠道」页会直接崩**（该页由 `AppearanceSettingsPage.tsx:282` 正常路由可达）。
>
> 连带项：同一面板 `:281` 还渲染「镜像到桌面」开关（`mirrorToDesktop`，主进程已不读 → 死开关，见 `HUMAN-人工验证台账.md` H-14 第 5 步）。
>
> **P7 需处置 3 件渲染层清理**：① 删绑定 UI + 那 5 处调用与 3 处测试 fixture；② 删镜像开关与其 i18n key；③ 装齐 15 个渲染层依赖以收口 29 + 13 条。

### 被推翻的原计划（必读）

| 原计划 | 实测结论 | 现在的做法 |
|---|---|---|
| P6 = 10 文件 / 37 块 | **9 / 36**（`general-settings-lifecycle.ts` 曾被同时算进 P5 与 P6；P5 完成报告与本文件**两次独立实测**都得 36） | 按 9 / 36 执行（已回写总蓝图 §四） |
| 冲突块总数 = 64（P3 沙箱预演实测） | P6 实剩 **36**；P5 期初实测 **27** → **27 + 36 = 63 ≠ 64**。**这 1 块差额是账目问题、不是丢块**（P4 已消化过一部分删除类冲突），已在总蓝图 §四 如实记录 | P6 只看"**9 文件 / 36 块**"这一条判据 |
| "P6 骨架重写 + 旁听迁移（11 文件 / 42 块）" | 迁移属**独立功能变更**，且是协议级不可回撤改动 | **本次不做**（用户拍板 C）；旁听保留在 `history-log` |
| 前置"读本地**未提交**的 `history-log.ts`" | 该文件**没有任何未提交改动**；函数在 **HEAD 已提交**版本里（`history-log.ts:364`） | 照读即可，无缺失风险 |
| 逐块在 36 个冲突块里做二选一 | 真实整合面是 36 块的 **3–20 倍**（冲突块外已混入双方） | 每块处置后**立刻**单文件 `tsc`；§四 给出跨块依赖关系 |
| `orchestrator/index.ts` 的 `buildGroupContextBlock` import 会悬空 | 实测**不会**：该函数在本地 HEAD 里存在，且 `history-log.ts` 非冲突文件 | 无需补救；只需**不要**动 `history-log.ts`（N3） |

---

## 三、前置条件与停止条件

### 前置条件（逐条给命令 + 期望值；**不满足不得开始**）

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$env:PATH = "D:\data\node24;" + $env:PATH
cd E:\AI_Chating\cyrene-agent
```

| # | 检查项 | 命令 | 期望 |
|---|---|---|---|
| P1 | 合并仍在进行 | `git rev-parse --short MERGE_HEAD` | `b11b8851` |
| P2 | HEAD 未变 | `git rev-parse --short HEAD` | `598dfb75` |
| P3 | 只剩本 Phase 的冲突 | `(git status --porcelain \| Where-Object { $_.Substring(0,2) -eq 'UU' } \| Measure-Object).Count` | **9** |
| P4 | 无删除类残留 | `git status --porcelain \| Where-Object { $_.Substring(0,2) -match '^(UD\|DU)$' }` | **无输出** |
| P5 | **P5 的 17 个文件已归零** | 见下方命令 | 无输出 |
| P6 | `history-log.ts` **未被改动**（N3） | `git status --porcelain -- src/main/channels/history-log.ts` | **无输出** |
| P7 | 群聊旁听承载体在位 | `Test-Path src/main/channels/history-log.ts` + `Select-String -LiteralPath src/main/channels/history-log.ts -Pattern 'export function buildGroupContextBlock'` | `True` + 1 命中 |
| P8 | 回退网在 | `git rev-parse --short phase3-work-snapshot` / `phase0-full` | `586eae90` / `34f0669f` |
| P9 | Node 版本 | `node -v` | **`v24.21.0`** |
| P10 | **上阶段回写清单无未勾选项** | 见下方命令 | **无输出**（`PHASE-5-完成报告.md` §十 的 `[ ]` 项**必须已由 P5 执行者/蓝图作者勾完**） |

```powershell
# P5 · P5 的 17 个文件必须已归零
$p5 = @('README.md','package-lock.json','src/shared/ipc-channels.ts',
 'src/main/settings/settings-facade.ts','src/main/settings/general-settings.ts',
 'src/main/settings/general-settings-lifecycle.ts','src/main/channels/settings-store.ts',
 'src/renderer/settings/general/dom.ts','src/renderer/settings/shared/types.ts',
 'src/renderer/settings/memory/panel.ts','src/renderer/settings/shared/modal.ts',
 'src/renderer/react/i18n/en.json','src/renderer/react/i18n/zh-CN.json',
 'src/renderer/react/features/chat/components/ChatPageNavigation.tsx',
 'src/renderer/react/features/chat/components/ChatPagePanelHost.tsx',
 'src/renderer/react/features/chat/pages/ChatPage.tsx',
 'src/renderer/react/styles/react-root.css')
foreach ($f in $p5) {
  $c = (Select-String -LiteralPath $f -Pattern '^<{7} ' -Encoding UTF8 -ErrorAction SilentlyContinue | Measure-Object).Count
  if ($c -ne 0) { "✘ 仍有 $c 块: $f" }
}
# 期望：无输出
```

```powershell
# P10 · 上阶段回写清单无未勾选项（v2.2 硬要求）
Select-String -Path "docs\construction\合并\TASK-合并\PHASE-5-完成报告.md" -Pattern '^\s*-\s*\[ \]|\|\s*\[ \]\s*\|'
# 期望：无输出
```

> 🔴 **P10 的已知情况（执行者必读）**：P5 完成报告的 §十 回写清单里有若干 `[ ]`（文档回写待办，**不影响代码正确性**）。
> 按规范 §5.1「未勾完不得提交」，而**提交时机本身在 P7 之后**，所以它们最迟须在 **P7 提交前**做完。
> **本 Phase 开工时的判据是：`[ ]` 只允许剩下"经验库追加（T4）"与"总蓝图某节待补"这类纯文档项；
> 若还剩「代码相关的判据修正未回写」，先停下来补完再开工。**

### 停止条件（出现即**立即停止并报告**）

| # | 现象 | 为什么必须停 |
|---|---|---|
| S1 | `MERGE_HEAD` 不存在，或 HEAD ≠ `598dfb75` | 合并状态被改动，全部坐标失效 |
| S2 | `UU` 计数 ≠ 9 | P5 成果被改动；或本 Phase 已越界改了别的文件 |
| S3 | 某个文件的剩余块数**多于**事实 1 的行区间表 | 文件被外部修改过 |
| S4 | `history-log.ts` 出现任何改动（`git status` 非空） | **违反 N3**；会一次性丢掉 16 个本地独有导出（含 `buildGroupContextBlock`），`orchestrator/index.ts:8` 立刻悬空 |
| S5 | 你准备**新增 transcript kind** 或改 `conversation-transcript-*` | **违反 N1/N5**（用户已拍板本次不做）；写新 kind 会污染轨迹协议且不可回撤 |
| S6 | 你准备删 `conversation-binding-store.ts` 或其导出 | **违反 N2**；`memory-console` / `person-erasure` / `zones-ipc` 会立刻红（其中「按人擦除」是受保护功能） |
| S7 | 取某块后 **owner 域隔离或 `read_memory` 限域**丢失（见 §四 4.O3/4.O4 的自检命令不再通过） | **静默隐私回归**：群里会注入私人画像 / 捞出桌面私聊 L2 |
| S8 | 全仓库 `tsc -p tsconfig.main.json` 仍报 **TS1185**（冲突标记） | 说明还有未解决的块；不得带着标记进入 P7 |
| S9 | `git status --porcelain` 的 `??` 行数**下降** | 有文件被误删（本 Phase 只改既有文件 + 新增 1 个测试文件） |
| S10 | 定向 vitest 出现**新失败**且无法归因到 §六「不算失败」四类 | 属真回归 |

---

## 四、改动清单（Agent 直接执行）

### 执行总顺序（**顺序敏感，不得调换**）

```
4.0 预检 + 记录行号映射 + 单文件快照备份
 └─► 4.1 channel-context.ts        （类型与接口层：D1 删除 + 本地历史能力保留）
      └─► 4.2 build-options.ts     （trace / owner 域隔离 —— 别人依赖它）
           └─► 4.3 agent-runtime.ts（trace 传参链的收口）
                └─► 4.4 tool-registry.ts（read_memory 限域）
                     └─► 4.5 dispatcher.ts（渠道主链路：journal + 本地历史并存）
                          └─► 4.6 bootstrap.ts（装配层：注入点对齐 history-log 签名）
                               └─► 4.7 dispatcher.test.ts / bootstrap.test.ts / channel-context.test.ts（测试同侧改造）
                                    ├─► 4.8 新增「静默失效探测器」测试
                                    └─► 4.9 git add + 自检
```

**为什么这个顺序**：① 类型/接口（`channel-context.ts`）先行，它的每个改动都会传播到 `dispatcher` / `bootstrap` / 测试；
② `build-options.ts` 的 `ChannelTraceContext` 与 `buildAlwaysOnContext` 签名是 `agent-runtime.ts` 与 `orchestrator/index.ts` 的**上游**；
③ `dispatcher.ts` 依赖前四者全部定型；④ 测试最后改（**测试必须与实现同侧**，见 4.7）。

### 4.0 预检与备份

```powershell
New-Item -ItemType Directory -Force .cyrene-merge-analysis\p6 | Out-Null
$p6 = @('src/main/channels/bootstrap.ts','src/main/channels/bootstrap.test.ts',
 'src/main/channels/channel-context.ts','src/main/channels/channel-context.test.ts',
 'src/main/channels/dispatcher.ts','src/main/channels/dispatcher.test.ts',
 'src/main/orchestrator/agent-runtime.ts','src/main/orchestrator/build-options.ts',
 'src/main/orchestrator/tools/registry/tool-registry.ts')
foreach ($f in $p6) { git hash-object -- "$f" } | Set-Content -Encoding ASCII .cyrene-merge-analysis\p6\pre-hashes.txt
# 期望：9 行

$dst = "E:\AI_Chating\cyrene-agent-p6-backup"
New-Item -ItemType Directory -Force $dst | Out-Null
foreach ($f in $p6) { Copy-Item -LiteralPath $f -Destination (Join-Path $dst ($f -replace '[\\/]','__')) -Force }
(Get-ChildItem $dst).Count      # 期望：9
```

### 4.1 `src/main/channels/channel-context.ts`（5 块）★ 类型层，先做

**逐块落笔**：

| 块 | 行区间 | 落笔 | 说明 |
|---|---|---|---|
| ① | `2-8` | **取 ours** | 两行纯类型 import：`PersistedHistoryEntry`（`./history-log`）、`PreparedOutgoing`（`./outgoing-composer`）。theirs 为空（官方无这两个概念）。**删掉它们会让 ③⑤ 的签名悬空**（两者都被 ours 侧使用） |
| ② | `13-48` | **追加合并（两侧都留）** | ours 的 `ChatMessage`（含 `speakerName`/`speakerId`/`triggered` 三个注释齐全的字段）**必须留**；theirs 的 `DispatchContext` **要留但改造**（见下"②-D1 改造"）；theirs 的 `ChannelConversationTarget` + `resolveChannelConversationTarget` **删除**（D1） |
| ③ | `56-97` | **追加合并** | ours 的 `resolvePriorMessages` / `appendIncomingContext` / `appendAssistantContext` 三个接口方法 + `CreateChannelContextOptions.loadRecentChannelHistory` / `appendChannelHistory` **全留**；theirs 的 `CreateChannelContextOptions.resolveBoundConversationId` **删除**（D1）；块后 `migrateHistory`（非冲突区）**保留** |
| ④ | `185-200` | **取 ours，但补 `DispatchContext` 的字段** | ours 只有 `return { sessionId };`。**这是 D1 的正确形态**：官方那 12 行是"查绑定 + try/catch + 返回 `boundConversationId`"，整段删除。**注意**：删除后 `DispatchContext` 只剩 `sessionId: string`，所以 ② 里的接口定义也要同步只有这一个字段 |
| ⑤ | `211-264` | **取 ours** | 51 行：`resolvePriorMessages` / `appendIncomingContext` / `appendAssistantContext` 三个实现。**这是本地历史能力的实现体，一个字都不能丢** |

**②-D1 改造（本 Phase 的核心删除动作之一）**：

```ts
/** 单条入站消息已经确定的上下文快照。 */
export interface DispatchContext {
  sessionId: string;
  // 🔴 本分支决定（D1）：桌面对话绑定已彻底删除。
  //    官方在此处有 `boundConversationId: string | null`，本分支不带该字段 ——
  //    渠道会话自带短期上下文，不再绑定桌面对话（见 resolveDispatchContext 的注释）。
}

// 🔴 D1：以下官方新增内容整段删除，不要保留
// export interface ChannelConversationTarget { … }
// export function resolveChannelConversationTarget(…) { … }
```

**判定命令**（期望：本文件 0 标记 / `boundConversationId` 0 命中 / 本地三方法各 1 命中）：

```powershell
$f = 'src/main/channels/channel-context.ts'
(Select-String -LiteralPath $f -Pattern '^<{7} ' -Encoding UTF8 | Measure-Object).Count            # 期望 0
Select-String -LiteralPath $f -Pattern 'boundConversationId|ChannelConversationTarget|resolveChannelConversationTarget' -Encoding UTF8   # 期望 0 命中
Select-String -LiteralPath $f -Pattern 'resolvePriorMessages|appendIncomingContext|appendAssistantContext' -Encoding UTF8 | Measure-Object | Select-Object -Expand Count   # 期望 ≥6（接口 + 实现）
Select-String -LiteralPath $f -Pattern 'triggered|speakerName|speakerId' -Encoding UTF8 | Measure-Object | Select-Object -Expand Count    # 期望 ≥6
```

> 🔴 **必改且编译器不会提醒你的陷阱**：`DispatchContext` 去掉 `boundConversationId` 后，
> **所有构造 `DispatchContext` 字面量的地方都会 TS 报"缺少属性"或"多余属性"**
> —— 这是好事（编译器帮你找全）。但**测试里的 `{ sessionId, boundConversationId: null }` 字面量是"多余属性"，
> 对象字面量赋给接口时报错、而 `as` 断言会掩盖它** → 见 4.7 的测试改造。

### 4.2 `src/main/orchestrator/build-options.ts`（1 块，`65-94`）★ 隐私相关

**落笔：取 ours（且只取 ours，不可追加）**

| 侧 | 内容 | 为什么 |
|---|---|---|
| ours（`66-88`） | `ChannelTraceContext` 接口 + 3 个 import（`resolveScopeId, rootScope` / `TurnAttribution` / `normalizeGroupContextLimit`） | 非冲突区**已经在用**它们：`:126 deps.buildAlwaysOnContext(..., trace?: ChannelTraceContext)`、`:662 normalizeGroupContextLimit(...)`、`:635 resolveScopeId`、`:637 rootScope()`、`:216 attribution?: TurnAttribution` |
| theirs（`65-69`，**就在块内**） | 转录系统 5 个 import（共 6 个符号：`resolveTranscriptRetainTokens` / `MaterializedTranscript` / `UncertainEffect` / `DEFAULT_HARNESS_CONFIG` / `estimateMessageTokens` / `createTranscriptCompactionRequiredError`） | 🔴 **勘误（P6 施工实测）**：原文写"这 5 个 import 已在非冲突区 `:95-99`（块之后）存在"，**该说法作废**。实测它们在 `:65-69`，正是冲突块的起点；且这组标识符在 ours（`HEAD`）与合并基 `eb6c311a` 里的出现次数**都是 0** —— 整条转录链是官方新增，块外**没有任何地方**能承担它们 |

> 🔴 **为什么"追加合并"和"只取 ours"都会编译不过**（实测）：
> - **追加** → 5 个 import 各出现两次 → `TS2300 重复标识符`；
> - **取 theirs** → `:126` 的 `ChannelTraceContext` 未定义 → `TS2304`，且 `:662` 的 `normalizeGroupContextLimit` 也丢；
> - **只取 ours 且不补**（本次实测撞到）→ `ChannelTraceContext` 在，但块外由官方新增、被自动合并进来的整片转录代码（工作区 `:159` / `:533` / `:572-602`）会引用上述 6 个符号 → **逐个 `TS2304`**。
>
> **唯一正确解**：**取 ours + 手工在 import 段尾部补回这 5 行**（原文"让块外的 `:95-99` 承担"已作废，见 §二 事实 7）。

**判定命令**（三组符号都必须恰好存在）：

```powershell
$f = 'src/main/orchestrator/build-options.ts'
(Select-String -LiteralPath $f -Pattern '^<{7} ' -Encoding UTF8 | Measure-Object).Count                              # 期望 0
Select-String -LiteralPath $f -Pattern 'ChannelTraceContext|normalizeGroupContextLimit' -Encoding UTF8 | Measure-Object | Select-Object -Expand Count   # 期望 ≥4
Select-String -LiteralPath $f -Pattern 'DEFAULT_HARNESS_CONFIG|estimateMessageTokens|createTranscriptCompactionRequiredError' -Encoding UTF8 | Measure-Object | Select-Object -Expand Count  # 期望 ≥3（取 ours 后必须手工补回；块外不存在）
Select-String -LiteralPath $f -Pattern 'resolveScopeId|rootScope' -Encoding UTF8 | Measure-Object | Select-Object -Expand Count                          # 期望 ≥3
```

**🔴 隐私自检（S7 的判据，必须通过）**：

```powershell
# owner 域隔离：群里不得注入 L0/L1 画像
Select-String -LiteralPath 'src/main/orchestrator/index.ts' -Pattern 'shouldInjectOwnerProfile|resolveScopeId' -Encoding UTF8
# 期望：至少 2 处命中（定义在 index.ts 里，用 trace.sessionId 解析域）
Select-String -LiteralPath 'src/main/orchestrator/build-options.ts' -Pattern 'rootScope|resolveScopeId' -Encoding UTF8 | Measure-Object | Select-Object -Expand Count
# 期望：≥3
```

### 4.3 `src/main/orchestrator/agent-runtime.ts`（1 块，`216-228`）★ trace 命脉

**落笔：手工重写**（tone 取 theirs / alwaysOn 取 ours / scene 两项删除）。

**可粘贴的最终代码**（替换 `216-228` 整段，含三行标记）：

```ts
      buildToneInjection: (() => buildToneInjection()) as BuildOptionsDeps["buildToneInjection"],
      buildAlwaysOnContext: ((userText, messages, trace) =>
        buildAlwaysOnContext(userText, messages as any, trace)) as BuildOptionsDeps["buildAlwaysOnContext"],
```

**依据（三条实测，缺一就会选错）**：

1. `BuildOptionsDeps.buildToneInjection` 在**非冲突区已被官方改成 0 参**（`build-options.ts:121 () => string`），调用点 `:768` 也是零参 → **ours 的 4 参 wrapper 是死代码**，且 `tone-injector.ts` 的 `buildToneInjection()` 本身零参 → 保留 ours 会 `TS2554 参数过多`。
2. `sceneEmbeddingIndex` / `getSceneEmbeddingProvider` 在 `BuildOptionsDeps` **已不存在**（grep 0 命中）→ ours 那两个属性会 `TS2339`。
3. **`buildAlwaysOnContext` 的第 3 参 `trace` 必须保留**：`orchestrator/index.ts:113` 的形参仍是 `trace?: ChannelTraceContext`，`:154/:157` 靠它做群聊旁听注入 → 少了它 **群聊旁听静默消失**。

**判定命令**（期望：0 标记 / `trace` 传参链完整）：

```powershell
$f = 'src/main/orchestrator/agent-runtime.ts'
(Select-String -LiteralPath $f -Pattern '^<{7} ' -Encoding UTF8 | Measure-Object).Count     # 期望 0
Select-String -LiteralPath $f -Pattern 'buildAlwaysOnContext' -Encoding UTF8               # 期望 1 命中（且带 trace）
Select-String -LiteralPath $f -Pattern 'sceneEmbeddingIndex|getSceneEmbeddingProvider' -Encoding UTF8   # 期望 0 命中
Select-String -LiteralPath 'src/main/orchestrator/build-options.ts' -Pattern 'buildAlwaysOnContext' -Encoding UTF8
# 期望：声明处形参含 `trace?: ChannelTraceContext`
```

### 4.4 `src/main/orchestrator/tools/registry/tool-registry.ts`（1 块，`376-391`）★ 隐私相关

**落笔：取 ours**

| 侧 | 内容 | 判定 |
|---|---|---|
| ours（`377-385`） | `read_memory` 用 `await import()` 动态加载 + `resolveScopeId(ctx?.conversationId)` + `getL2ForScope(scopeId)` | ✅ **取它** |
| theirs（`387-390`） | `execute: async (args)`（丢 `ctx`）+ `require(...)` + `getAllL2()` | ❌ 取它 = 跨域隐私回归 |

**三条依据（实测）**：

1. **非冲突区 `:253-255`（`search_memory`）已经按 ours 的限域口径保留**（`execute: async (args, ctx)` + `resolveScopeId(ctx?.conversationId)`），`ToolDefinition.execute` 的签名（`:106`）本就是 `(args, ctx?: ToolContext)` → ours 与非冲突区**自洽**。
2. 取 theirs 的 `getAllL2()` → **群聊里问"我喜欢什么"会捞出桌面私聊的 L2**；且 `tool-registry-memory.test.ts:143` 断言 `getL2ForScope` 被调用 → **该测试会红**。
3. 取 theirs 的 `require(...)` → ESM 打包产物与 vitest 下**不可拦截**（本地注释写明"这条路径会因此完全无法单测"）→ 打包后可能直接运行时报错。

**判定命令**：

```powershell
$f = 'src/main/orchestrator/tools/registry/tool-registry.ts'
(Select-String -LiteralPath $f -Pattern '^<{7} ' -Encoding UTF8 | Measure-Object).Count      # 期望 0
Select-String -LiteralPath $f -Pattern 'getL2ForScope' -Encoding UTF8 | Measure-Object | Select-Object -Expand Count   # 期望 ≥2
Select-String -LiteralPath $f -Pattern 'getAllL2' -Encoding UTF8                            # 期望 0 命中
Select-String -LiteralPath $f -Pattern 'require\(' -Encoding UTF8                           # 期望 0 命中
```

### 4.5 `src/main/channels/dispatcher.ts`（6 块）★ 渠道主链路

**总原则**：**官方 CTA journal 路径 + 本地历史/旁听写入，两者并存**。
`target.conversationId` 在 D1 之后**恒等于 `context.sessionId`**（官方架构本身支持，见事实 3）。

| 块 | 行区间 | 落笔 |
|---|---|---|
| ① | `45-48` | **追加合并**：`export type { ChatMessage, DispatchContext }` —— ours 的 `ChatMessage` 与 theirs 的 `DispatchContext` 都要导出 |
| ② | `113-120` | **追加合并**（两侧都是 import/依赖声明，见 4.5 细则） |
| ③ | `219-238` | **取 theirs 为骨架 + D1 改造**：官方把 `processIncoming` 拆成"薄壳 + `processIncomingCanonical`"；保留这个结构，但 `target` 的来源改为**直接构造**（因为 `resolveChannelConversationTarget` 已删） |
| ④ | `244-281` | **追加合并**：ours 的审计日志写入（`appendLog({dir:"incoming",…})`）与 theirs 的 journal 写入（`appendUser` / `getChannelTurnState` / `appendDeliveryReceipt` / `appendPresentation`）**都要** |
| ⑤ | `306-345` | **追加合并**（36 行 ours / 1 行 theirs，逐行核对后取并集） |
| ⑥ | `376-380` | **取 ours**（1 行 ours / 1 行 theirs，按非冲突区调用方判定） |

**③ 的 D1 改造（照此落笔）**：

```ts
    const journal = this.deps.journal!;
    // 🔴 D1：桌面对话绑定已删除 → 目标恒为渠道会话自身
    //    （官方此处是 resolveChannelConversationTarget(context)，其 else 分支就是 { conversationId: context.sessionId }）
    const target: ChannelConversationTarget = { conversationId: context.sessionId };
    const turnId = makeChannelTurnId(msg, "user");
    const assistantTurnId = makeChannelTurnId(msg, "assistant");
    const runId = randomUUID();
```

> ⚠️ **`ChannelConversationTarget` 这个类型本身要不要留？**
> 它被 `dispatcher.ts:87`（`ChannelAgentInput.target`）使用，而 `ChannelAgentInput` 是**非冲突区**。
> **保留该 interface（它已不含绑定语义，只是 `{ conversationId: string }`），只删 `resolveChannelConversationTarget` 函数与 `DispatchContext.boundConversationId`。**
> 这是"最小删除"：改了 `DispatchContext` 的字段就必须改的地方，一处不少；不该动的类型不动。

**判定命令**（期望：0 标记 / 绑定链路 0 命中 / journal 与本地历史**同时**在）：

```powershell
$f = 'src/main/channels/dispatcher.ts'
(Select-String -LiteralPath $f -Pattern '^<{7} ' -Encoding UTF8 | Measure-Object).Count                               # 期望 0
Select-String -LiteralPath $f -Pattern 'boundConversationId|resolveChannelConversationTarget|resolveBoundConversationId' -Encoding UTF8   # 期望 0
Select-String -LiteralPath $f -Pattern 'journal\.(appendUser|appendPresentation|buildModelContext|createRunSink)' -Encoding UTF8 | Measure-Object | Select-Object -Expand Count  # 期望 ≥4
Select-String -LiteralPath $f -Pattern 'appendIncomingContext|appendAssistantContext|resolvePriorMessages' -Encoding UTF8 | Measure-Object | Select-Object -Expand Count        # 期望 ≥3（本地历史能力仍在）
```

### 4.6 `src/main/channels/bootstrap.ts`（7 块）★ 装配层 + 签名对齐

**总原则**：**一律以本地 `history-log.ts` 的签名为准**（它是本地的严格超集，见事实 4）。

| 块 | 行区间 | 落笔 |
|---|---|---|
| ① | `21-28` | ours 4 行 / theirs 1 行 → 逐行核对，取并集（import 声明） |
| ② | `102-117` | ours 6 行 / theirs 7 行 → **追加合并**（`loadRecentHistory` 的动态 import 与官方新 import 并存） |
| ③ | `130-145` | ours 5 行 / theirs 8 行 → **追加合并**；**`resolveBoundConversationId` 的构造（ours `:137`）删除**（D1） |
| ④ | `171-193` | ours 16 行 / theirs 4 行 → **取 ours 为主**（本地历史注入面） |
| ⑤ | `228-238` | ours 3 行 / theirs 5 行 → 追加合并 |
| ⑥ | `311-337` | ours 23 行 / theirs 1 行 → **取 ours** |
| ⑦ | `373-378` | ours 2 行 / theirs 1 行 → **取 ours**：`appendChannelHistory: appendHistory`（注入 dispatcher，与事实 4 的旁听写入链一致） |

**🔴 三处"取 theirs 会静默坏掉"的地方（本 Phase 最需要盯的）**：

| 位置 | 若取 theirs | 症状 |
|---|---|---|
| `bootstrap.ts:377` 的 `appendChannelHistory` 注入 | dispatcher 拿不到历史写入器 | `channel-context.ts` 的 `appendChannelHistory` 变成 `undefined` → `appendIncomingContext` 返回 `null`（本地实现已 try/catch 吞错）→ **旁听消息永远不落盘 → `observedOnly` 恒空 → 群聊旁听上下文静默为空**（无报错） |
| `:104` 的 `loadRecentHistory` 动态 import（`{conversationOnly:true}`） | 滑窗读取丢失 | 渠道会话的"正式历史"为空 → 模型看不到上文（同样是静默） |
| `:137` 的绑定构造 | 若**保留**它而 `DispatchContext` 已删字段 | `TS2353 对象字面量只能指定已知属性`（**这个会报错**，属好事） |

**判定命令**：

```powershell
$f = 'src/main/channels/bootstrap.ts'
(Select-String -LiteralPath $f -Pattern '^<{7} ' -Encoding UTF8 | Measure-Object).Count                                # 期望 0
Select-String -LiteralPath $f -Pattern 'resolveBoundConversationId' -Encoding UTF8                                    # 期望 0
Select-String -LiteralPath $f -Pattern 'appendChannelHistory' -Encoding UTF8                                          # 期望 ≥1（注入点）
Select-String -LiteralPath $f -Pattern 'loadRecentHistory' -Encoding UTF8 | Measure-Object | Select-Object -Expand Count   # 期望 ≥2
Select-String -LiteralPath $f -Pattern 'journal:' -Encoding UTF8                                                      # 期望 ≥1（CTA journal 注入）
```

> 🔴 **签名对齐（S4 同源风险）**：本地 `appendHistory` 返回 `PersistedHistoryEntry | null`（官方旧签名是 `void`）、
> `loadRecentHistory` 多第 3 个 `HistoryQuery` 参。**`bootstrap.ts` 是这两个签名的消费方**
> → 取官方签名 = 旁听标记 `triggered` 丢失。

#### 4.6.1 🔴 `bootstrap.ts` 的**块外**连带修改（3 处，必做；不做会"响亮地"或"静默地"坏）

| # | 位置 | 现状（自动合并的结果） | 必须改成 | 不改的后果 |
|---|---|---|---|---|
| **B-1** | 块外 `:35` 的 import | **theirs 版**：`import { migrateHistory } from "./history-log";` —— **没有 `appendHistory`** | `import { appendHistory, migrateHistory } from "./history-log";` | 块外/块内 `:375` 用了 `appendHistory` → 运行到 `createChannelContext({appendChannelHistory: appendHistory})` 时 **ReferenceError** → `bootstrap.test.ts` 全文件红（**响亮**） |
| **B-2** | 块外 `ChannelAgentInput`（在 `dispatcher.ts`） | `target: ChannelConversationTarget` | 改成 `conversationId: string`（D1 后恒等于 `sessionId`）+ `userMessageId?: string`（X3） | `:306` 附近的 `...(userMessageId ? { userMessageId } : {})` 抛 **ReferenceError**（**响亮**）；`target.conversationId` 的 6 处块外引用（`:215/256/266/300/336/358`）会连锁 |
| **B-3** | `bootstrap.test.ts` 的 harness（块外，4 参） | `buildAndRunAgent(msg, \`channel:${…}:test\`, [], userMessageId)` | 改成传**对象**：`buildAndRunAgent(msg, { sessionId, conversationId, userMessageId, … })` | 见 X2：官方 `typeof input === "string"` 兼容分支**静默吞掉** `priorMessages`/`userMessageId` → 3 个 P2 用例红且红点远离冲突标记 |

#### 4.6.2 `bp-5` 的最终形态（**两侧都要**，照抄）

块外 `:239` 是 theirs 的续行、块外 `:241` 是 ours 的消费方 —— **二选一必死**。
把该段整体替换为：

```ts
    if (channelInput.transcriptSink) options.transcriptSink = channelInput.transcriptSink;
    options.runId = channelInput.runId;
    const grantedTools = policy.exposeTools
      ? [...(options.capabilities?.tools ?? exposedTools)]
      : [];
    options.tools = grantedTools;
```

> 其下方（`applyChannelToolGuard(grantedTools, {…})`）**原样不动**。
> 只取 theirs → `grantedTools` 未定义 → **渠道消息全链路崩**（响亮）；
> 只取 ours → `options.transcriptSink` / `runId` 不设 → journal 的 run sink 断链（**静默**）。

#### 4.6.3 `bp-6` 的最终形态（渠道审计 + P2 索引，**取 ours 但去掉绑定依赖**）

块外已有 6 处 `channelInput.target.conversationId`（`:215/256/266/300/336/358`）。
按 D1，**把它们统一换成 `channelInput.conversationId`**（或等价的 `channelInput.sessionId`）；
`bp-6` 的索引调用改成：

```ts
      void indexConversationTurn(channelInput.sessionId, agentUserText, reply);
```

> 取 theirs → 「渠道审计（失败轮次可观测）」整段消失，而 `bootstrap.test.ts` **没有任何 `recordTurnFailure` 断言** → **静默坏**：
> 用户在控制台再也看不到"哪句话把昔涟弄崩了"（渠道审计是 11 项受保护功能之一）。

### 4.7 三个测试文件：**测试必须与实现同侧**

> 🔴 **这一条是 P5 踩过的坑（见 [`PHASE-5-完成报告.md`](PHASE-5-完成报告.md) 偏差 10）**：
> 官方为自己的新实现写了断言，我们如果取本地实现却留着官方断言 → **"两边各自自洽、合起来必红"**，
> 而且失败原因极难定位。**先判"该用例属哪一侧"，再决定它与实现同侧还是删。**

**实测的用例归属（Node 脚本按 `it|test|describe` 标题字面量算差集；可直接引用，不必重算）**：

| 测试文件 | 官方独有 | 本地独有 | 两者都有 |
|---|---|---|---|
| `bootstrap.test.ts` | 2 | 4 | 12 |
| `channel-context.test.ts` | 1 | 18 | 7 |
| `dispatcher.test.ts` | 16 | 8 | 8 |

**处置对照（★ = 必须手改的块外项）**：

| 用例 | 归属 | 处置 |
|---|---|---|
| `bootstrap.test.ts` 「把共享 journal 注入 dispatcher，绑定不再读取 chats-store 正式历史」 | 官方独有（块内） | **保留**（骨架哨兵） |
| `bootstrap.test.ts` 「resolves bindings from metadata without reading the full conversation」 | 官方独有 | **已被 git 静默删除** —— 方向符合 D1，**无需动作** |
| `bootstrap.test.ts` 「observeExternalChat 把见过的外部会话写进绑定存储」 | 本地独有（块内 bp-t4） | 取 ours 保留（注意：它写的是**绑定存储**，而 `flush`/`list` 仍在 → 保留可用） |
| `bootstrap.test.ts` P2 归属 ×3（`personKey`/`speakerName`/`userMessageId`/`chatType`） | 本地独有（**块外**） | **已在树里** → 但必须配合 **X2/B-3** 改 harness，否则必红 |
| `channel-context.test.ts` 「绑定渠道使用桌面对话 journal…」 | 官方独有（**块外 X1**） | 🔴 **手删**（连同 `:8` 的 import） |
| `channel-context.test.ts` 18 个本地用例（前缀剥离 / 昵称含 `]` / 返回值冒泡 …） | 本地独有（块内 cc-t1） | **取 ours**（这是本地能力唯一的回归网） |
| `dispatcher.test.ts` 「turn ID 回退源中的换行会被压成空格」 | 官方独有（**块外**） | **已在树里** → 说明 journal 骨架构成本已付，**别回头** |
| `dispatcher.test.ts` 绑定用例 ×2（QQ 群身份 / 内建表情） | 官方独有（块内 dpt-3） | **删**（D1） |
| `dispatcher.test.ts` 「falls back to the unbound channel path when binding lookup fails」 | 官方独有（块内 dpt-6） | **删**（D1） |
| `dispatcher.test.ts` 「不同外部会话绑定到同一桌面会话时必须串行」等 3 条 | 官方独有 | **已被 git 静默删除**；其中"不同桌面会话之间保持并行"已被 ours 的「不同外部会话之间保持并行」取代 —— **正好符合 D1 的队列 key 语义**，无需动作 |
| `dispatcher.test.ts` 9 条 canonical（并发串行 / 回执 fail-safe 矩阵 / 重放保护） | 官方独有（块内 dpt-10） | **保留**（见 D-γ） |
| `dispatcher.test.ts` 拦截关键词 ×2 | 本地独有（块内 dpt-10） | **保留** |
| `dispatcher.test.ts` P2 归属第 4 参数 ×3 | 本地独有（块内 dpt-10） | **保留但改写断言**：位置参数 → `expect.objectContaining({ sessionId, userMessageId: "msg_1758681234567_a3f9k2" })` |
| `dispatcher.test.ts` 「渠道历史读取失败时照常回复」 | **两侧同名、语义相反**（块内 dpt-5 + 块外） | **整段定一侧**（取 ours 语义）—— 半取会造出"最难查的红" |
| `dispatcher.test.ts` `dpt-1` 的三个"尸体开关"（`resolveBoundConversationId?` / `loadBoundConversationHistory?` / `appendBoundConversationMessage?`） | 官方独有 | **删**（官方实现已不读后两者，只被 `.not.toHaveBeenCalled()` 断言）→ 保留 `loadRecentChannelHistory`（ours 的类型化版）+ `journal?`（canonical 用例必需） |
| `dispatcher.test.ts` `dpt-9`（`expect(appendHistory)`） | 本地独有 | **保留**，且**必须与 `dp-5` 同侧**（决定了"渠道历史写入"有没有哨兵） |

> 🔴 **`dpt-2` 的一条实测便利**：`makeDispatcher` 的默认 context 取 ours 后，
> `createChannelContext` 不再收到 `resolveBoundConversationId` → `resolveDispatchContext` 返回 `{sessionId}`；
> 而官方 canonical 用例里用 `expect.any(String)` 断言 conversationId → **照样绿，无需改**。
> 这就是"骨架保留 + 绑定剥离"能兼容的原因。

**判法（若你要自己复核某个测试文件的标题差集）**：

```powershell
$env:PATH = "D:\data\node24;" + $env:PATH
$js = @'
const fs=require("fs");
const p=process.argv[2];
const L=fs.readFileSync(p,"utf8").split(/\r?\n/);
let si=-1,mi=-1,ei=-1;
L.forEach((ln,i)=>{ if(si<0&&/^<{7} /.test(ln))si=i; if(mi<0&&/^={7}$/.test(ln))mi=i; if(ei<0&&/^>{7} /.test(ln))ei=i; });
const grab=a=>[...a.join("\n").matchAll(/\b(it|describe)\(\s*"([^"]+)"/g)].map(m=>m[2]);
const ours=grab(L.slice(si+1,mi)), theirs=grab(L.slice(mi+1,ei));
console.log("ours 独有标题:"); ours.filter(x=>!theirs.includes(x)).forEach(x=>console.log("  O "+x));
console.log("theirs 独有标题:"); theirs.filter(x=>!ours.includes(x)).forEach(x=>console.log("  T "+x));
'@
$js | Set-Content "$env:TEMP\testsides.cjs" -Encoding UTF8
node "$env:TEMP\testsides.cjs" src/main/channels/dispatcher.test.ts
node "$env:TEMP\testsides.cjs" src/main/channels/bootstrap.test.ts
node "$env:TEMP\testsides.cjs" src/main/channels/channel-context.test.ts
```

**三个测试文件的处置原则**：

| 文件 | 判据 |
|---|---|
| `channel-context.test.ts`（1 块：ours 331 行 / theirs 0 行） | **取 ours**（theirs 侧为空）。⚠️ 但 ours 的 331 行里**含绑定用例吗？** 实测 ours 是"本地新增历史能力"的用例集，需逐条核对是否有 `boundConversationId` 字面量 → 有则删该用例（D1 已删实现，留断言必红） |
| `bootstrap.test.ts`（4 块） | `:63-79` / `:84-92` 含 `resolveBoundConversation` 与 `vi.mock("./conversation-binding-store")` → **与 D1 冲突的用例删除**；其余按同侧原则 |
| `dispatcher.test.ts`（10 块） | `:81,102,221,239,266,330,350` 全是 `resolveBoundConversationId` 相关（**官方新增**）→ **这些用例整组删除**（实现已按 D1 删除）；本地新增的 journal/历史用例按 ours 保留 |

**必做的删除留痕**：每删一条用例，在完成报告 §十（回写清单）或 §五（偏差）里记一行：`文件:行号 / 用例标题 / 为什么必须删`。

### 4.8 新增「静默失效探测器」测试（T3 · **本 Phase 唯一的强制新增文件**）

> **为什么必须新增**：`history-log.test.ts` 直接调 `appendHistory`，**不走 dispatcher**，
> 所以"dispatcher 不再写 history"时它**永远不会失败**。群聊旁听是本任务**最危险的失效模式**（静默消失）。
> 这个测试是本 Phase 唯一能抓住它的手段，也是总蓝图 §8.2 A3 的硬要求。

**新文件**：`src/main/channels/group-context-flow.test.ts`

**要断言的三件事（最小充分集）：

```ts
import { describe, expect, it, vi } from "vitest";
// 1) dispatcher 处理完一条渠道消息后，history-log 的写入器被调用过（且带 triggered 语义）
// 2) 群聊 sessionId 的 observed 条目能被 buildGroupContextBlock 渲染出来（含 [说话人]: 正文）
// 3) 非群聊（私聊）不触发群上下文块
```

**落地建议（避免把测试写成"镜像实现"）**：

- 用**真实** `history-log`（它只碰文件系统，可用 `fs.mkdtempSync` 造 userData 根）而不是 mock；
- dispatcher 侧只需断言"**注入的 `appendChannelHistory` 被以群聊 sessionId 调用过一次**"，
  然后直接用 `loadRecentHistory(sid, 10, { observedOnly: true })` + `buildGroupContextBlock(sid, 10)` 验证链路；
- **断言必须是等值/包含性的**（`toContain("[小明]: 你好")`），不要写"命中数 ≥ 1"。

> ⚠️ 若你在写这个测试时发现**必须改产品代码才能让它通过** → **停下来报告**（S10），不要为了让测试变绿去改产品。

### 4.9 自检与清理

```powershell
$env:PATH = "D:\data\node24;" + $env:PATH

# ① 本 Phase 的 9 个文件必须 0 标记
foreach ($f in $p6) {
  $c = (Select-String -LiteralPath $f -Pattern '^(<{7}|={7}|>{7}) ' -Encoding UTF8 -ErrorAction SilentlyContinue | Measure-Object).Count
  if ($c -ne 0) { "✘ 仍有标记 $c 个: $f" }
}
# 期望：无输出

# ② 全仓库再无冲突标记
Get-ChildItem -Recurse -File -Include *.ts,*.tsx,*.json,*.css,*.html -Path src |
  Select-String -Pattern '^(<{7}|={7}|>{7}) ' -Encoding UTF8 | ForEach-Object { "✘ " + $_.Path + ":" + $_.LineNumber }
# 期望：无输出

# ③ D1 施工面清零
Get-ChildItem -Recurse -File -Include *.ts,*.tsx -Path src |
  Select-String -Pattern 'resolveChannelConversationTarget|resolveBoundConversationId' -Encoding UTF8
# 期望：无输出（注意：boundConversationId 这个字段名在 conversation-binding-store.ts 里不存在，故一并 0 命中；
#       但 ChannelConversationTarget 类型名按 4.5 的说明保留）

# ④ history-log.ts 零改动（N3）
git status --porcelain -- src/main/channels/history-log.ts      # 期望：无输出

# ⑤ 语料边界（D4）
Select-String -LiteralPath src/main/corpus/group-corpus.ts -Pattern 'MEMORY_TARGETS|只增不减' -Encoding UTF8 | Measure-Object | Select-Object -Expand Count   # 期望 ≥2

# ⑥ git add（否则 UU 计数不会变）
foreach ($f in $p6) { git add -- "$f" }
git add -- src/main/channels/group-context-flow.test.ts
```

---

## 五、人工环节 ★

### H-A 阻塞性拍板（开工前；未答复不得开始）

| # | 议题 | 状态 | 为什么需要（或不需要）你 |
|---|---|---|---|
| **H-A1** | **旁听是否迁进 CTA 轨迹** | ✅ **已拍板：不迁**（三选一选 C） | 决定了本 Phase 是 36 块骨架重写，还是额外背一个**协议级不可回撤**的改动 |
| **H-A2** | D1（桌面对话绑定彻底删除）是否仍成立 | ✅ 已拍板（总蓝图 §五 D1） | **本 Phase 最大的删除动作**（`channel-context` / `dispatcher` / `bootstrap` / 3 个测试）全由它推出 |
| **H-A3** | **两处既有行为是否保持现状** | ⏳ **待确认（1 分钟，不阻塞推理但请在开工前回一句）** | 见下 —— **它不是新决策** |

> 🔴 **H-A3 的措辞已修正（2026）**：本节原先写作"两处隐私相关**取舍**"，那是**措辞错误**。
> 这两件事**都不是新功能取舍，而是本分支既有的实现**，本 Phase 只是要**保住它们不被官方侧覆盖**：
>
> | # | 事实（实测） | 本 Phase 要做的事 |
> |---|---|---|
> | ① | **「注入本人画像」开关早就在区块功能里** —— `zones/types.ts:50` 的 `injectOwnerProfile`；判定函数 `zones/scope.ts:43` `shouldInjectOwnerProfile`；**root 恒 `true` 且不可关**（`zone-store.ts:164` 只对非 root 写入）、**新区块默认 `false`**（`zone-store.ts:137`）、**solo（未归区的外部会话，含群）恒 `false`**（`scope.ts:45-46`，注释原文「私人画像绝不外泄到陌生群」）；已有 9 个 it 在守 | **保住 `trace` 参数链**：`build-options.ts:65-94` 取 ours + `agent-runtime.ts:216-228` 的 `buildAlwaysOnContext` **保留第 3 参**。官方把它删成了 2 参 → 取错则 `trace` 为 `undefined` → `index.ts:154` 恒 false（**连群聊上下文都不注入**），且 `:170` 的画像判定失去输入 |
> | ② | **`read_memory` 的域过滤是既有的** —— 现为 `getL2ForScope(scopeId)`（`memory-store.ts:627`：`store.l2.filter(m => m.scope === scopeId)`）；官方侧是 `getAllL2()`（`memory-store.ts:616`：`return store.l2` **全量**）。同一文件里 **`search_memory` 已在非冲突区限域**（`tool-registry.ts:253-256`，注释原文「只召回当前会话所属记忆域：群聊里问"我喜欢什么"不该捞出桌面的私聊记忆」），现有测试 `tool-registry-memory.test.ts:143` 断言 `getL2ForScope` 被调用 | **取 ours**（30 秒的事） |
>
> **你要回答的只有一句：「保持现状」（推荐）还是「按官方改为不过滤」。**
> 第二条如果改成不过滤，**群聊里问一句"我喜欢什么"就能读到桌面私聊的记忆** —— 而且
> `search_memory` 已经限域、`read_memory` 不过滤会**自相矛盾**（后者是"通读"，等于把限域绕过去）。

### H-B 完工评审（本 Phase 的**退出条件**）

| 编号 | 评审项 | 人只做判断 |
|---|---|---|
| **H-B1** | 逐条确认 §十 的 🔴 项 | ✅/❌ + 理由 |
| **H-B2** | 确认「渠道消息仍然会写进 `channels/history/<sessionId>.jsonl`」这一行为没被官方 CTA 路径取代（这是旁听的生命线） | 可由 A6 的测试代替；人只看测试是否真的断言了这件事 |

### H-C 待验项登记（本 Phase 登记 **6 条**）

| 编号 | 内容 | 何时销账 |
|---|---|---|
| **H-08** | 群聊旁听端到端可用：群里发一条**没 @ 昔涟**的消息 → 昔涟下一条回复应"知道刚才群里在聊什么" | **P8**（依赖未装齐时应用起不来） |
| **H-09** | 渠道会话的 CTA 会话键 = 渠道 sessionId（**不再落进桌面对话**）：在渠道里聊完，桌面会话列表**不应**多出一个对话 | **P8** |
| **H-11** | **渠道审计可见性**：跑崩一轮后，「渠道控制台」面板里应能看到 `turn_failed`（对话失败 · 发送者）条目与三段详情 | **P8** |
| **H-12** | **工具白名单 + 拦截关键词**：未授权账号不调工具；命中拦截词的消息不进模型且审计里出现 `message_blocked` | **P8** |
| **H-13** | **隐私边界**：群聊不注入画像、`read_memory` 只读当前域 L2 —— **代码级现在就能查**（含 3 条现成命令），运行期 P8 补 | 🟢 代码级现在；运行期 P8 |
| **H-14** | **桌面对话绑定彻底消失**（D1 的可见后果）：UI 里不再有任何绑定入口；渠道消息不串进桌面当前对话 | **P8** |

> 六条全部已登记进 [`HUMAN-人工验证台账.md`](HUMAN-人工验证台账.md) §三（各含逐步对照表 + 期望值 + "不算失败"的情形）。
> **为什么补 H-11/H-12/H-13/H-14**：P6 恰好要动 `bootstrap.ts`（渠道审计、工具白名单）与 `dispatcher.ts`（拦截关键词）这几段，
> 而 **`bootstrap.test.ts` 里没有任何 `recordTurnFailure` 断言** —— 取错侧即**静默坏**；
> 原有台账对这 4 个面**零覆盖**，只靠 P8 那次「走一遍 11 项功能」的泛泛冒烟很容易漏。

> **本 Phase 明确不需要人做的事**：不需要人重算块数/命中数（脚本判）；不需要 P6 期间启动应用（依赖未装齐）。

---

## 六、验收测试

### A1 · 冲突标记归零（第一判据）

期望：§四 4.9 的 ① 与 ② 均无输出（**不只是 9 个文件，是全仓库**）。

### A2 · 范围正确：只剩 0 个 `UU`

```powershell
git status --porcelain | ForEach-Object { $_.Substring(0,2) } | Group-Object | Sort-Object Name | ForEach-Object { "{0} = {1}" -f $_.Name, $_.Count }
# 期望：UU = 0；UD = 0；DU = 0
```

> ⚠️ **前提**：本 Phase 的 9 个文件**已 `git add`**（否则"改干净了"不会反映到 porcelain 码 —— P5 踩过这个坑）。

### A3 · D1 施工面清零（充分判据）

```powershell
Get-ChildItem -Recurse -File -Include *.ts,*.tsx -Path src | Select-String -Pattern 'resolveChannelConversationTarget|resolveBoundConversationId' -Encoding UTF8
# 期望：0 命中
Select-String -LiteralPath src/main/channels/dispatcher.ts -Pattern 'target: ChannelConversationTarget = \{ conversationId: context.sessionId \}' -Encoding UTF8
# 期望：1 命中（D1 的落点）
Test-Path src/main/channels/conversation-binding-store.ts      # 期望 True（N2：不许删）
```

### A4 · 隐私边界不回归（**本 Phase 最不能失败的一条**）

```powershell
# ① owner 域隔离：群聊不得注入 L0/L1
Select-String -LiteralPath src/main/orchestrator/index.ts -Pattern 'shouldInjectOwnerProfile' -Encoding UTF8 | Measure-Object | Select-Object -Expand Count   # 期望 ≥1
Select-String -LiteralPath src/main/orchestrator/build-options.ts -Pattern 'rootScope\(\)|resolveScopeId' -Encoding UTF8 | Measure-Object | Select-Object -Expand Count   # 期望 ≥3
# ② read_memory 限域
Select-String -LiteralPath src/main/orchestrator/tools/registry/tool-registry.ts -Pattern 'getL2ForScope' -Encoding UTF8 | Measure-Object | Select-Object -Expand Count   # 期望 ≥2
Select-String -LiteralPath src/main/orchestrator/tools/registry/tool-registry.ts -Pattern 'getAllL2' -Encoding UTF8      # 期望 0 命中
# ③ 交叉验证（跑真实测试，而不是只 grep）
npx vitest run src/main/orchestrator/tools/registry/tool-registry-memory.test.ts src/main/orchestrator/group-context-injection.test.ts
# 期望：全绿（这两条正是"隐私 + 旁听注入"的回归网）
```

> **为什么 ③ 必须有**：`grep` 是启发式判据（名字在 ≠ 逻辑对）。这两条测试直接断言"**该调谁、不该调谁**"。

### A5 · 群聊旁听链路在（T3）

```powershell
Select-String -LiteralPath src/main/channels/history-log.ts -Pattern 'export function buildGroupContextBlock' -Encoding UTF8   # 期望 1 命中
Select-String -LiteralPath src/main/orchestrator/index.ts -Pattern 'buildGroupContextBlock' -Encoding UTF8 | Measure-Object | Select-Object -Expand Count   # 期望 ≥2（import + 调用）
Select-String -LiteralPath src/main/channels/bootstrap.ts -Pattern 'appendChannelHistory' -Encoding UTF8 | Measure-Object | Select-Object -Expand Count     # 期望 ≥1（注入点）
git status --porcelain -- src/main/channels/history-log.ts      # 期望 无输出（N3）
```

### A6 · 静默失效探测器（**唯一能抓住"旁听静默消失"的门禁**）

```powershell
$env:PATH = "D:\data\node24;" + $env:PATH
npx vitest run src/main/channels/group-context-flow.test.ts
# 期望：全绿；且测试文件里必须出现对以下两者的断言：
#   ① 群聊 sessionId 的 observed 条目被写出（appendChannelHistory 被调用）
#   ② buildGroupContextBlock(sid, N) 的返回值包含 "[<说话人>]: <正文>"
```

> 🔴 **反例警告**：如果这个测试只是"调 `appendHistory` 再调 `buildGroupContextBlock`"（不走 dispatcher），
> 那它**与 `history-log.test.ts` 同构、抓不到本 Phase 的风险**。必须让断言落在**"dispatcher 的处理路径会产生这次写入"**上。

### A7 · 语料豁免边界（D4）

```powershell
$env:PATH = "D:\data\node24;" + $env:PATH
npx vitest run src/main/memory/memory-deletion.test.ts src/main/corpus/group-corpus-isolation.test.ts
# 期望：全绿（P6 开工前实测：memory-deletion 15 tests 全绿；group-corpus-isolation 因
#       channel-context.ts 的冲突标记导致 transform 失败 —— 解决冲突后应转绿）
```

### A8 · 静态检查（**"通过 或 已归因"，不做全绿硬判**）

```powershell
$env:PATH = "D:\data\node24;" + $env:PATH
npx tsc -p tsconfig.main.json     ; "main exit=$LASTEXITCODE"
npx tsc -p tsconfig.preload.json  ; "preload exit=$LASTEXITCODE"
```

**判据（两条都算通过）**：
- ✅ 退出码 0；**或**
- ✅ 非 0，但**逐条错误**都能归因到「不算失败」四类，**且**满足下面两条硬要求：
  1. **TS1185（冲突标记）计数 = 0**（P5 之后 main 有 65 条全为此类）；
  2. **错误里没有本 Phase 9 个文件的** `TS2307 / TS2304 / TS2339 / TS2353 / TS2554 / TS2678 / TS2367`。

### A9 · 定向 vitest（本 Phase 的门禁）

```powershell
$env:PATH = "D:\data\node24;" + $env:PATH
npx vitest run `
  src/main/channels/group-context-flow.test.ts `
  src/main/channels/history-log.test.ts `
  src/main/channels/channel-context.test.ts `
  src/main/channels/dispatcher.test.ts `
  src/main/channels/bootstrap.test.ts `
  src/main/channels/settings-store.test.ts `
  src/main/orchestrator/tools/registry/tool-registry-memory.test.ts `
  src/main/orchestrator/group-context-injection.test.ts `
  src/main/orchestrator/build-options.test.ts `
  src/main/orchestrator/agent-runtime.test.ts `
  src/main/settings/settings-facade.test.ts `
  src/main/conversation-usage-store.test.ts
```

**判据**：每个文件要么全绿，要么失败能落到下面「不算失败」的任一类。
⚠️ **不要**加 `--reporter=basic`（vitest 4 已移除该 reporter，会启动失败，**不是**测试失败）。

### 四类「不算失败」（**必须提前写明**）

| 类别 | 具体现象 | 为什么不算失败 |
|---|---|---|
| **① 依赖未安装** | `Failed to resolve import "@lobehub/icons"` / `"@lobehub/ui"` / `motion` / `streamdown` 等（15 个，清单见 P5 完成报告 §四 A9） | `package.json` 已声明但 `node_modules` 未装；**P8 的 `npm ci` 是唯一解法** |
| **② 失去被测对象** | 依赖 P4 已删文件的测试（7 个，见判据台账 **J-06/J-08/J-09**） | 其"合并前绿"是**假基线**；处置权在 **H-07** |
| **③ 官方新增但无基线** | P5 已识别 6 个（`settings/shared/modal.test.ts` 等），本 Phase 之后应全绿或归因① | 无基线可对照 → 报告制 |
| **④ 存量违规（非本次引入）** | `theme-token-contract.test.ts` 对 `ToolConsolePanel.css` 的令牌违规（P5 实测 6 passed / 1 failed） | 本地自建 CSS 的**存量**问题，与合并无关；**P8 处置**（P5 完成报告 §四 A8-B / §八 第 5 条） |

---

## 七、产出物清单

| # | 产出 | 验证方式 |
|---|---|---|
| 1 | **9 个文件冲突归零**（全仓库 0 标记） | A1 / A2 |
| 2 | `src/main/channels/group-context-flow.test.ts`（**新建**，静默失效探测器） | A6 |
| 3 | `.cyrene-merge-analysis/p6/pre-hashes.txt`（9 行 blob 哈希） | §四 4.0 |
| 4 | `E:\AI_Chating\cyrene-agent-p6-backup`（9 文件原始态） | §八 |
| 5 | [`HUMAN-人工验证台账.md`](HUMAN-人工验证台账.md) 的 **H-08 / H-09 / H-11 / H-12 / H-13 / H-14** | §五 |
| 6 | [`PHASE-6-完成报告.md`](PHASE-6-完成报告.md)（**10 节**，含「十、回写清单」） | 规范 §5 |
| 7 | 总蓝图回写（P6 完成 / 基线刷新 / 新判据） | §十三 |
| 8 | 施工记录（**§十二 子节 0 人工环节回执**为必需） | 规范 §8 |

---

## 八、回退方法（分级）

```powershell
cd E:\AI_Chating\cyrene-agent

# 级 1 · 单文件（最常用）
Copy-Item "E:\AI_Chating\cyrene-agent-p6-backup\<path 以 __ 替换斜杠>" <path> -Force
git checkout MERGE_HEAD -- <path>          # 取官方原始版（带标记）
git checkout phase3-work-snapshot -- <path>  # 取合并前本地版

# 级 2 · 本 Phase 的 9 个文件整批回退
foreach ($f in $p6) { git checkout phase3-work-snapshot -- $f }
# ⚠️ 会把 9 个文件恢复成【合并前本地版本】，冲突标记也随之消失

# 级 3 · 放弃本 Phase
git checkout phase3-work-snapshot -- .

# 级 4 · 连 .git 都没了
robocopy E:\AI_Chating\cyrene-agent-backup-phase0 E:\AI_Chating\cyrene-agent /E /XD node_modules
```

> 🔴 **永不** `git merge --abort`（会丢弃 P3/P4/P5 全部成果）。
> 🔴 **永不** 对 `src/main/channels/history-log.ts` 执行任何 `checkout`（会一次性丢掉 16 个本地独有导出）。

---

## 九、已知坑（本 Phase 相关 + 复现情况）

> 来源：[`../methodology/BLUEPRINT-经验库-通用.md`](../methodology/BLUEPRINT-经验库-通用.md)（H/M，写蓝图前整份过一遍）
> + [`../methodology/BLUEPRINT-经验库-具体坑.md`](../methodology/BLUEPRINT-经验库-具体坑.md)（L，只查 git / Node / PowerShell 章）。

| # | 坑 | 本次复现情况 | 应对 |
|---|---|---|---|
| K4 | 会话 `node -v` 仍是 v22 | P5 未复现（首条命令即前置 PATH） | 每条 node/npx 前 `$env:PATH = "D:\data\node24;" + $env:PATH` |
| K7 | 冲突块方向易误读（哪一行属哪一侧） | P5 复现过 | **展开三行标记实际读**；本文档已把 9 个文件的关键块方向写死 |
| K10 | PowerShell `-Pattern` 计数不可靠（转义/口径） | P5 复现（`groupContextLimit` 计 4 vs 实际 7） | **计数一律用 Node 复核** |
| K12 | 合并态"全局替换冲突标记"会误伤 | P5 未发生（只对白名单动手） | 只对 §四 列的 9 个文件动手 |
| K15 | **删宿主文件不会自动暴露依赖者** | P5 抓到 4 处 | ① 删/改类动作后**必须做反向引用扫描**；② **`tsc` 是唯一抓得住悬空模块引用的工具**（vitest 会被 suite 级错误噪音盖住） |
| **K16**（P5 新增） | **i18n/JSON 大块拼接要按括号配平算缺口** | P5 复现（"补一个逗号"不成立，实际要补一行 `},`） | 拼接前逐段算 `depth`；**修缩进必须按行号锚定**，不要用无锚点正则 |
| **K17**（P5 新增） | **官方阻塞队列改变"连续调用同一弹窗"的重入语义** | P5 复现 | 测试夹具的 `reset()` 必须同时清 `blockingQueue` 与 `blockingActive` |
| **K18**（P5 新增） | **"取 ours 还是 theirs" 要看测试属于哪一侧** | P5 复现（删了 1 条官方专属用例） | 先 `git show MERGE_HEAD:<test>` 判该用例属官方还是本地；**测试与实现必须同侧**，跨侧只能删用例并留痕 |
| **K19**（本 Phase 新增风险） | **冲突块数 ≠ 整合面**（非冲突区已混入双方） | **本次实测**（agent-runtime 1 块但 15 处变更） | 每块处置后**立刻**单文件 `tsc`；核对非冲突区的调用方 |
| **K20**（本 Phase 新增风险） | **`trade`/签名类参数被"取 theirs"删掉后，功能静默消失** | 本次实测（`buildAlwaysOnContext` 的 `trace` 第 3 参） | 对每个"签名变化"块，**先 grep 调用方**（`git grep -n '<函数名>'`），确认参数个数与含义 |

### 🆕 本 Phase 新发现（建议追加进经验库，见 §十三 T4）

| 坑 | 症状 | 根因 | 正确做法 |
|---|---|---|---|
| **官方重写"渠道链路"时会把本地注入点整段拿掉** | 编译通过、测试绿，但本地能力（旁听写入/滑窗读取）不再被调用 | 官方把 `deps` 的注入项换成了自己的 journal | 对每个"装配层（bootstrap）"块，**逐项核对注入面清单**（本地新增的注入项必须逐条确认仍被注入） |
| **`DispatchContext` 删字段会同时影响"对象字面量"与"类型导出"** | `TS2353 对象字面量只能指定已知属性`（构造处）/ `TS2305 模块没有导出成员`（导出处） | 类型是跨 3 个文件 + 3 个测试的公共契约 | 删字段后**立刻**跑 `tsc`；测试里的 `as` 断言会掩盖缺字段 → 逐个去掉断言核对 |

---

## 十、给下一个 Phase 的交接提示（编号清单，🔴 必读）

1. 🔴 **P6 完成后 `UU` 必须精确等于 0**（前提：9 个文件已 `git add`）。
2. 🔴 **P7 的首要任务：全仓库边界编译修复**。P6 之后 `tsc -p tsconfig.main.json` 应已无 TS1185，但**仍会有「①依赖未安装」类错误**（15 个包）。
3. 🔴 **不要动 `src/main/channels/history-log.ts`**（本地 16 个独有导出，含 `buildGroupContextBlock`）。
4. 📌 **`conversation-binding-store.ts` 保留**（被 `memory-console` / `person-erasure` / `zones-ipc` 使用）。
5. 📌 **若将来要做"旁听迁进 CTA"**：设计清单在本文档 §二 事实 6；**必须先解决**"写能成功、读会被拒"的静默窗口（两个 fail-closed 校验点）并补**全链路往返测试**（追加 → 读取 → 快照 → 压缩 → 归档）。
6. 📌 **P8 待处置清单（H-07 / 判据台账）**：① 7 个"失去被测对象"的测试；② `theme-token-contract` 的 `ToolConsolePanel.css` 存量违规；③ A5② 判据的同名干扰；④ `npm ci` 装齐 15 个依赖后重跑 A8-A 门禁。
7. 📌 **`package-lock.json` 收尾在 P8**：`npm ci` 之后用 `npm install --package-lock-only` 重建。
8. 💾 **回退网**：`phase3-work-snapshot`（`586eae90`）/ `phase0-full`（`34f0669f`）/ `cyrene-agent-p5-backup`（17 文件）/ `cyrene-agent-p6-backup`（9 文件）。
9. 🔴 **仍不要提交** —— 提交时机在 **P7 之后**（全部 `UU` 解决 + 边界编译修完）。

---

## 十一、改动的目标达成核对（执行后回填）

| 目标（来自 §一） | 状态 | 证据 |
|---|---|---|
| T1 · 9 文件 / 36 块归零 | ✅ | A1（全仓库标记 = 0）+ A2（`UU`/`UD`/`DU`/`AA` 全 = 0，`git diff --diff-filter=U` 无输出） |
| T2 · D1 落地（绑定链路删除） | ✅ | A3（`resolveChannelConversationTarget|resolveBoundConversationId` 全仓库 **0** 命中；落点 `dispatcher.ts:231` 1 命中；`conversation-binding-store.ts` 保留 = True） |
| T3 · 群聊旁听仍可用 + 探测器测试 | ✅ | A5（`buildGroupContextBlock` 定义 1 / `index.ts` 引用 2 / `appendChannelHistory` 注入 1 / `history-log.ts` 零改动）+ A6（4 tests 全绿，且**突变验证**：注释掉写入链后 4 红） |
| T4 · 隐私边界不回归 | ✅ | A4（`shouldInjectOwnerProfile` 4 命中 / `rootScope()|resolveScopeId` 4 / `getL2ForScope` 1 / `getAllL2` **0**）+ 40 tests 全绿（H-13 四条代码级命令） |
| T5 · 全仓库首次能编译（TS1185 = 0） | ✅ | A8（`main`：**TS1185 = 0**，仅剩 1 条属①类；`preload`：**exit 0 全绿**）。**22 → 1 条**，逐条归因见 §十二 子节 5 |
| T6 · 语料豁免边界完好 | ✅ | A7（`memory-deletion` 15 + `group-corpus-isolation` 7 = **22 tests 全绿**） |
| T7 · 人工环节 | ✅ | §十二 子节 0（H-A3 已拍板；H-08/09/11/12/13/14 已登记；H-13 代码级已销） |
| **非目标遵守** | ✅ | 未新增 transcript kind / 未动 `history-log.ts`（`git status` 空）/ 未动 `corpus/**` / 未删 `binding-store` / **未提交**（提交时机在 P7 之后） |

**回写清单已闭合**：☑（见 §十三，全部 `[x]`）

---

## 十二、施工记录（执行者追加；**子节 0 为必需**）

### 子节 0 · 人工环节回执

**H-A 答复（原样抄录）**

| 编号 | 议题 | 答复原文 | 时间 |
|---|---|---|---|
| H-A1 | 旁听是否迁进 CTA | **不迁**（沿用蓝图 §零 立项决定 C；本 Phase 未新增任何 transcript kind） | 2026（施工前已拍板） |
| H-A2 | D1 是否仍成立 | **成立**（沿总蓝图 §五 D1；本 Phase 的全部删除动作由它推出） | 2026（施工前已拍板） |
| H-A3 | 两处隐私相关取 ours 是否确认为本分支意图 | **「两处都保持现状（推荐）」** —— ① 区块 `injectOwnerProfile` 画像注入判定 ② `read_memory` 的 `getL2ForScope` 域过滤。答复于本 Phase 完工验收阶段取得（施工已按「保持现状」执行并实测通过） | 2026（P6 验收阶段） |

**H-B 评审结论**

| 编号 | 评审项 | 结论 | 说明 |
|---|---|---|---|
| H-B1 | §十 的 🔴 项逐条确认 | ⏳ **待项目所有者逐条 ✅/❌** | 9 条中第 1/2/3/4/5/9 条已由本次实测数据支撑（见 §十二 子节 5）；第 6/7/8 条属 P8 待处置 |
| H-B2 | 渠道消息仍写入 `channels/history/` | ✅ **由 A6 探测器代替人眼判定** | `group-context-flow.test.ts` 断言"磁盘真的多了这一轮（user+assistant 共 2 行）"，并已用**突变测试**证明它会在写入链断开时变红 |

**H-C 登记确认**

| 编号 | 台账条目 | 已登记 |
|---|---|---|
| H-08 / H-09 / H-11 / H-12 / H-13 / H-14 | [`HUMAN-人工验证台账.md`](HUMAN-人工验证台账.md) §三 | ☑（**P6 施工前即已在册**，本次核对无缺；其中 **H-13 的代码级部分本次已销账**，见子节 5） |

### 子节 1 · 实际落地（偏离三列表）

| 蓝图 | 实际实现 | 原因 |
|---|---|---|
| §四 4.2「取 ours，让 theirs 的 5 个转录 import 继续由**块外 `:95-99`** 承担」 | **取 ours + 把 5 个 import 手工补回块内** | 🔴 **蓝图的坐标是错的**：实测块外**不存在**这 5 个 import（官方版在 `:65-69`，正是冲突块内）。照蓝图执行会让块外整片 `TS2304`（实测 18 条）。详见 §五 偏差 2 |
| §四 4.5「保留 `ChannelConversationTarget` interface，**只删** `resolveChannelConversationTarget` 函数与 `DispatchContext.boundConversationId`」 | **保留了该 interface**（未按 ② 的"整段删除"字面执行） | 它被 `dispatcher.ts` 的 `ChannelAgentInput.target` 与非冲突区 6 处 `target.conversationId` 使用，且 `conversation-transcript-phase2.acceptance.test.ts` 直接断言 `input.target.conversationId`。**蓝图内部两处要求互相矛盾**，取"保留"侧才自洽（与 §四 4.5 的说明一致） |
| §四 4.5 ③「`const target: ChannelConversationTarget = { conversationId: context.sessionId }`」 | 同左，逐字采用 | — |
| （蓝图未覆盖）`dispatcher.ts` 的 `broadcastIncoming` / `broadcastOutgoing` | **删除这两个私有方法及 2 处调用** | 见 §五 偏差 3：依赖已被 P5 主动删除的 `mirrorToDesktop`，且 `bootstrap` 从不注入 `broadcastChat` → **永远不执行** |
| （蓝图未覆盖）`dispatcher.ts` 的助手侧历史写入 | **补回 `appendAssistantContext` 调用**（发送确认成功后） | 自动合并把它丢了。缺它则本地滑窗只剩 user 侧 → 模型看不到自己历史回复（3 条既有测试红） |
| （蓝图未覆盖）`bootstrap.ts` 的字符串兼容分支 | **删除** `typeof input === "string"` 分支 | 它以默认值静默吞掉 `userMessageId`（正是 X2 描述的坑）。蓝图要求 harness 改传对象后，该分支已无调用方 |

### 子节 2 · 蓝图未覆盖、施工中发现的漏洞

| 位置 | 问题 | 修复 |
|---|---|---|
| `build-options.ts:65-88` | 蓝图声称 5 个转录 import 在"块外"；实测块外为**空**，取 ours 后块外 18 条 `TS2304` | 补回 5 行 import（官方原文照抄） |
| `dispatcher.ts:423-435` | `broadcastIncoming/Outgoing` 依赖已删的 `mirrorToDesktop` 与未注入的 `broadcastChat`（4 条 `TS2339`） | 删方法 + 删 2 处调用 |
| `dispatcher.ts` 成功路径 | 合并后**没有**任何地方调用 `appendAssistantContext` → 本地滑窗缺助手侧 | 在发送确认成功后补调用 |
| `bootstrap.ts` `buildAndRunAgent` | 块外有 4 处裸 `sessionId`（`channelInput.target.conversationId` 才是 D1 后的正解），另有 `randomUUID` 变成未用 import | 引入 `channelConversationId` 局部量统一替换；删除 `randomUUID` import |
| `dispatcher.test.ts` 的 3 个 `ChannelContext` 桩 | 只实现了 `resolveDispatchContext`/`recordIncomingSession`，缺本地历史三方法 → 运行到 `resolvePriorMessages` 抛 `TypeError` | 补齐桩（**注意：`tsconfig.main.json` 与 `tsconfig.renderer.json` 都 exclude `*.test.ts`，故这类缺口编译器永不提醒**） |
| `conversation-transcript-phase2.acceptance.test.ts:226` | 官方新测试的夹具缺 `keywords`（本分支 dispatcher 必读）、却带着已删的 `mirrorToDesktop` | 修夹具（该测试因此**首次真正跑通**，6/6 绿） |
| `bootstrap.test.ts` 直调 `buildAndRunAgent` 的 5 处 | 传的是位置参数或残缺对象，缺 `runId`（对象契约的必填字段） | 全部改传完整对象 |

### 子节 3 · 蓝图最大不确定点的核实结论

| 蓝图原文 | 结论 | 证据 |
|---|---|---|
| §四 4.5「D1 后 `target` 恒为 `context.sessionId`」 | ✅ **成立** | A6 探测器（4 绿）+ `group-context-injection.test.ts`（10 绿）+ `conversation-transcript-phase2.acceptance.test.ts`（6 绿，含"渠道 dispatcher 写读同一 journal 上下文"） |
| §四 4.7「测试必须与实现同侧」 | ✅ **成立，且是必需纪律** | 删官方绑定用例 6 条（`dispatcher.test.ts` 3 + `channel-context.test.ts` 1 + `bootstrap.test.ts` 1 组 + 块外 X1 1）；保留 ours 本地用例 18/4/8 条；改写 P2 归属 3 条。逐条台账见 §五 偏差 6 |

### 子节 4 · 有意保留的「不处理」点

| 项 | 为什么不管 |
|---|---|
| `conversation-binding-store.ts` 及其 4 个消费方 | N2：D1 删的是路由链，不是这个存储类；它被「按人擦除」等功能使用 |
| `history-log.ts` 的 16 个本地独有导出 | N3：旁听 A 的承载体 |
| `create-aux-windows.ts:36` 的 `TS2694` | **不在 P6 的 9 文件内**；根因是 `electron` 装的是 **43.1.0** 而 `package.json` 要求 **`^44.4.3`**（该类型 `Electron.WindowStatePersistence` 只存在于新版）→ 属①类，P8 `npm ci` 解决，**归 P7 边界编译** |
| `tsc` 对 `*.test.ts` 的检查缺口 | 三份 tsconfig 全部 exclude 测试文件 → 测试桩的接口不完整**编译器永不提醒**（本次实测撞到 2 次）。列而不改：加配置属另一 Phase 的范围决定 |
| 9 条全仓库剩余测试失败（见 §十二 子节 5） | 全部可归因到 §六 四类，且**无一条触碰 P6 施工面**（已用脚本反查：31 个失败文件中 0 个 import P6 的 9 文件） |

### 子节 5 · 验收（实测数字）

| 命令 | 结果 |
|---|---|
| 冲突标记（9 文件） | **0** |
| 冲突标记（全仓库 `src`，5 种扩展名） | **0** |
| `git status --porcelain` 的 `UU`/`UD`/`DU`/`AA` | **0 / 0 / 0 / 0**；`git diff --diff-filter=U` 无输出 |
| D1 施工面 grep | **0** 命中；落点 1 命中；`conversation-binding-store.ts` 存在 |
| A9 定向 vitest（12 文件） | **Test Files 12 passed / Tests 269 passed**（全绿，无需归因） |
| A6 探测器 | **4 passed**；且**突变验证**（破坏写入链 → 4 failed；已还原，blob 逐字节相同） |
| A7 语料边界 | **22 passed**（memory-deletion 15 + corpus-isolation 7） |
| A4③ + H-13④ 隐私回归网 | **40 passed**（5 文件；台账预告 39） |
| `tsc -p tsconfig.main.json` | exit 2 / **22 → 1 条** / **TS1185 = 0** / P6 9 文件 0 条 |
| `tsc -p tsconfig.preload.json` | **exit 0（全绿）** |
| 全仓库 vitest | **Test Files 31 failed / 542 passed；Tests 9 failed / 5293 passed / 1 skipped**（9 条全部归因见下） |
| A1 · 11 项受保护功能 | **11/11 与基线一致**（4/8/5/11/13/6/10/5/2/10/5）——`USAGE_BADGE` 由 P5 新建模块承接（2）、`groupContextLimit` 为 P4 已归因的 10 |

**全仓库剩余 9 条失败的归因（按 §六 四类）**：

| 类别 | 条数 | 具体 |
|---|---|---|
| ① 依赖未安装 | 6 | `motion/react`、`simple-icons`、`@lobehub/icons`、`date-fns`、`ansi-to-react`、`@modelcontextprotocol/server-filesystem` |
| ② 失去被测对象 | 1 | `panel-layout.test.ts`（J-08/J-09 已定义：4 passed / 2 failed，`ModelModePanel.css` 被 P4 删） |
| ③ 官方新增无基线 | 1 | `theme-token-contract.test.ts`（P5 已识别；存量 CSS 令牌）+ `ChatMarkdownStyles.test.ts`（Streamdown 未安装→实为①） |
| ④ 存量违规（非本次引入） | 1 | `default-dialogs-regression.test.ts`：`ToolConsolePanel.tsx:285` 的 `window.confirm` —— 实测该文件在工作区、`HEAD`、`phase3-work-snapshot` **三者逐字节相同**，与 P6 无关 |

> ✅ **本次顺带修好 1 条**：`conversation-transcript-phase2.acceptance.test.ts`（官方新文件，此前 5/6）→ **6/6 全绿**，靠的是补齐它缺 `keywords` 的夹具。

### 子节 6 · 验收后修复

| 现象 | 根因 | 修复 | 复验 |
|---|---|---|---|
| `dispatcher.ts` 报 `TS2305: no exported member 'ChannelConversationTarget'` | 蓝图 ② 要求"整段删除"该 interface，但 §四 4.5 又要求保留它 | 在 `channel-context.ts` 重新导出该 interface（去掉 `boundConversationId?`，D1 语义不变） | `tsc` 该文件 0 条 |
| `build-options.ts` 18 条 `TS2304` | 蓝图把 5 个转录 import 的位置写错（见子节 1） | 补回 5 行 import | `tsc` 该文件 0 条 |
| `dispatcher.ts` 4 条 `TS2339` | 死代码依赖已删的 `mirrorToDesktop` | 删方法 + 调用 | `tsc` 该文件 0 条 |
| `dispatcher.test.ts` 3 条红（助手侧历史） | 自动合并丢了 `appendAssistantContext` | 成功路径补调用 | 29/29 绿 |
| `bootstrap.test.ts` 6 条红 | harness 传位置参数/残缺对象 | 改传完整对象（含 `runId`） | 17/17 绿 |

### 子节 7 · 经验追加

| 经验 | 等级 | 归位 |
|---|---|---|
| 冲突块数 ≠ 整合面 | H/M | `经验库-通用.md` |
| 装配层块必须逐项核对注入面 | M | `经验库-通用.md` |
| 删公共类型字段会同时打到"对象字面量"与"导出面" | L | `经验库-具体坑.md` §TypeScript |
| **蓝图给的"块外行号"必须自己复核**（本次 4.2 的 `:95-99` 是错的，按字面执行会产出 18 条编译错） | **M** | `经验库-通用.md`（本次新增） |
| **测试文件被 tsconfig 全量 exclude 时，桩的接口缺口编译器永不提醒** | **L** | `经验库-具体坑.md`（本次新增） |
| **"官方改了 N 行"要按"去 CRLF 后的内容差"复核**：`tool-registry.ts` 表面积 950 行，实际内容差仅 1 行注释 | **M** | `经验库-通用.md`（本次新增） |

### 子节 8 · 待做 / 未做

| 项 | 状态 | 说明 |
|---|---|---|
| 旁听迁进 CTA（D3 方案 1） | **未做（用户拍板 C）** | 设计清单见 §二 事实 6 |
| H-B1（§十 🔴 项人工逐条确认） | ⏳ 待项目所有者 | 数据已全部备好（子节 5） |
| `npm ci` / 15 个依赖安装 | 未做（N6） | P8 |

---

## 十三、回写清单（**规范 §5.1 的 T1–T4；未勾完不得提交**）

| 触发条件 | 回写目标 | 回写内容一句话 | 已勾选 |
|---|---|---|---|
| T2 基线数值被改写 | [`BLUEPRINT-总蓝图.md`](BLUEPRINT-总蓝图.md) §四 + §九 | P6 完成、`UU = 0`；P6 = 9 文件 / 36 块（已回写） | [x] |
| T3 蓝图描述被推翻 | [`BLUEPRINT-总蓝图.md`](BLUEPRINT-总蓝图.md) §五 决策表 | **D3 修订**：旁听迁进 CTA **本次不做**（用户三选一选 C）；旁听 A 继续由 `history-log.buildGroupContextBlock` 承担 | [x] |
| T3 蓝图描述被推翻 | [`BLUEPRINT-总蓝图.md`](BLUEPRINT-总蓝图.md) §8.2 | 「P6 必须新增静默失效探测器」保留，但**删去"旁听迁移"相关表述** | [x] |
| T1 判据被修正 | [`BLUEPRINT-总蓝图.md`](BLUEPRINT-总蓝图.md) §二 判据台账 | 新增 **J-11**：P6 的编译判据由"全绿"改为「**TS1185 = 0** + 错误可归因到四类」 | [x] |
| T1 判据被修正（**本次新触发**） | [`BLUEPRINT-总蓝图.md`](BLUEPRINT-总蓝图.md) §二 判据台账 | 新增 **J-13**：图纸里的**块外行号/坐标不可直接采信** —— 必须自己重扫；本次 `build-options.ts` 的"块外 `:95-99`"实测为**空**，按字面执行产出 18 条 `TS2304` | [x] |
| T2 基线数值被改写（**本次新触发**） | [`HUMAN-人工验证台账.md`](HUMAN-人工验证台账.md) §三 H-13 ② | `getL2ForScope` 的期望由「**≥2**」改为「**≥1**」：实测该函数在 `tool-registry.ts` 内只有 1 处（`read_memory`）；`search_memory` 走的是 `searchMemory(..., { scopeId })` 参数限域，**不经过它**。原判据会让正确实现被误判为失败 | [x] |
| T4 新增经验 | [`../methodology/BLUEPRINT-经验库-通用.md`](../methodology/BLUEPRINT-经验库-通用.md) | H/M 级：**冲突块数 ≠ 整合面**（非冲突区已混入双方） | [x] |
| T4 新增经验 | [`../methodology/BLUEPRINT-经验库-通用.md`](../methodology/BLUEPRINT-经验库-通用.md) | M 级：**装配层块必须逐项核对注入面**（官方重写会整段拿掉本地注入点） | [x] |
| T4 新增经验 | [`../methodology/BLUEPRINT-经验库-具体坑.md`](../methodology/BLUEPRINT-经验库-具体坑.md) | L 级：删公共类型字段会同时打到"对象字面量"与"导出面" | [x] |
| T4 新增经验（**本次新触发**） | [`../methodology/BLUEPRINT-经验库-通用.md`](../methodology/BLUEPRINT-经验库-通用.md) | M 级：**蓝图给的"块外行号"必须自己复核**（本次实测错 1 处，代价 18 条编译错） | [x] |
| T4 新增经验（**本次新触发**） | [`../methodology/BLUEPRINT-经验库-通用.md`](../methodology/BLUEPRINT-经验库-通用.md) | M 级：**"官方改了 N 行"须按"去 CRLF 后的内容差"复核**（`tool-registry.ts` 表面积 950 行 / 实际内容差 1 行注释） | [x] |
| T4 新增经验（**本次新触发**） | [`../methodology/BLUEPRINT-经验库-具体坑.md`](../methodology/BLUEPRINT-经验库-具体坑.md) | L 级：**tsconfig 全量 exclude `*.test.ts` 时，测试桩的接口缺口编译器永不提醒** | [x] |
| T3 蓝图描述被推翻（**本次新触发**） | 本文件 §四 4.2 | 4.2 的"theirs 的 5 个 import 已在非冲突区 `:95-99`"**是错的**（实测块外为空）；已在 §十二 子节 1/2 就地记录 | [x] |
| T3 蓝图描述被推翻（**本次新触发**） | 本文件 §四 4.5 | 4.5 内部自相矛盾（② 要求"删除 `ChannelConversationTarget`"，同节又要求"保留该 interface"）；**取"保留"侧**才自洽，已在 §十二 子节 1 记录 | [x] |
| — | — | 本 Phase 无其他触发（执行者须逐条再核对一次 T1–T4，**无触发时写"无"**） | [x] |
