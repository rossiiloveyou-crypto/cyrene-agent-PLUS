# Phase 3 · P2 施工方案：L2 人格化（Person Attribution）

> **上级文档**：`docs/construction/phase3-person-memory-overview.md`
> **本阶段目标**：让每条 L2 记忆知道「**谁说的**」和「**关于谁**」，并让召回侧认这个归属。
> **状态**：✅ **已施工完成**，代码 + 自动化验收全绿（记录见 §9）。手工验证（§5.2，需真实 QQ）待做。
> **⚠️ 前置条件**：P0（删除镜像消息）、P1（消息身份）均已落地。

---

## 0. 阶段定位

### 0.1 本阶段要解决什么

P1 让消息有了 id，但记忆仍然不知道自己在说谁。P2 把这条链接通：

```
消息(msg_xxx) ──► 说话人(qq:10001) ──► 记忆(speakerIds / subjectIds)
     ▲                                            │
     └──────────── sourceMessageIds ──────────────┘
```

做完之后：
- **删除**可以按 `subjectIds` 定位（"删掉关于小明的一切"）
- **召回**可以按提问者加权（"小明问的，优先给关于小明的记忆"）
- **溯源**可以顺着 `sourceMessageIds` 跳回原话

### 0.2 验收标准

> **群里小明（`qq:10001`）说「我最近在学 Rust」→ 若干轮后写入的 L2 条目应带：**
> ```json
> {
>   "content": "小明最近在学 Rust",
>   "sourceConversationId": "channel:qq:ab12cd34",
>   "speakerIds": ["qq:10001"],
>   "subjectIds": ["qq:10001"],
>   "sourceMessageIds": ["msg_1758..._a3f9k2"]
> }
> ```
> **且 `sourceMessageIds` 指向的那条消息，其 `speakerId` 确实是 `10001`。**

> **本验收只看存储层，不依赖召回侧。** 原因见 §0.4：L2 既不进主聊天 prompt，召回侧改造也已整体移到 P3.5。

### 0.3 范围边界

**本阶段只做数据层 —— 采集归属 + 落库 + 打通链路，不追求任何可见效果。**

| 做 | 不做（→ P3.5） |
|---|---|
| 归属采集（透传链 5 层） | ❌ **召回重排**（关于提问者优先） |
| judge 输出 `subjectNames` / `sourceTurnIndexes` | ❌ **`buildMemoryInjection` 接进主聊天路径**（改 L2 底层注入） |
| 落库 `speakerIds` / `subjectIds` / `sourceMessageIds` | ❌ `ToolContext.speakerId` 与工具侧重排/过滤 |
| `personKey` 约定（P3 的删除键） | ❌ 召回**硬过滤**（隐私开关） |
| 压缩总结 / 冲突消解继承归属（并集） | ❌ 给群成员建 L0/L1（总概览 §5 已否决） |
| 顺手修 `write_memory` 的 `sourceConversationId` 空串 | ❌ 存量记忆回填归属（结构上做不到） |
| | ❌ Episode / Saga、记忆管理 UI（P3） |

**为什么收窄到数据层**：见 §0.4 —— 召回侧真正需要的是"L2 底层注入改造 + 归属过滤"一整套，那是一件独立且带真实行为风险的工作，已另立 **P3.5**。

---

### 0.4 ⚠️ 施工前必须知道：**L2 不进主聊天 prompt，但串记忆问题依然存在 —— 它换了扇门**

核对召回链路时发现的现状，**它同时解释了"为什么问题还在"和"为什么 P2 不修它"**。

#### 事实一：自动注入路径上，L2 根本没进 prompt

核实结论（全仓 grep，只列生产调用点）：

| 注入入口 | 谁在用 |
|---|---|
| `buildMemoryInjection()`（`src/main/orchestrator/index.ts:32`，即 `【相关记忆】` 块） | **只有两处**：语音通话（`src/main/call/call-prompt-builder.ts:58`）、主动消息（`src/main/proactive/proactive-lifecycle.ts:110`） |
| `buildAlwaysOnContext()`（`src/main/orchestrator/index.ts:112`） | 主聊天（`src/main/orchestrator/build-options.ts:553`）、语音通话、主动消息、定时任务 |

**`buildAlwaysOnContext` 只注入三样东西**（`:119-207`）：世界书、【群聊近期上下文】、L0/L1 画像。
**它不调用 `buildMemoryInjection`。**

连带确认：
- `l2DmaeManager.updateActivation()` 生产调用点**只有** `call-prompt-builder.ts:51` —— **DMAE 激活状态只在语音通话时推进**
- `searchMemory(..., 'user_memory', ...)` 生产调用点**只有** `user_memory` 工具（`tool-registry.ts:256`）
- `getL2ForScope()` 生产调用点只有 `buildMemoryInjection` 和 `read_memory` 工具

#### 事实二：⚠️ 串记忆问题**没有消失，只是换了扇门 —— 而且更严重**

L2 进不了 prompt ≠ 群成员记忆不串。**它从"自动注入"这扇门，搬到了"工具调用"这扇门**：

```
群里小明问「@昔涟 你记得我什么？」
  → 模型调用 user_memory 工具
  → searchMemory(query, 'user_memory', topK, { scopeId })
  → scopeId 只到「哪个群」→ 返回的池子里混着小明、小红、所有人的记忆
  → 模型把小红的事当成小明的事说出来
```

**为什么说更严重**：

| 维度 | 自动注入（语音通话 / 主动消息） | 工具路径（主聊天实际走的） |
|---|---|---|
| 候选范围 | DMAE 门控后的 top-4，有筛选 | **原始检索命中**，无任何人物过滤 |
| 模型如何使用 | 作为"相关记忆"背景 | **直接当成"你说过的话"复述**（"我记得你……"） |
| 出错可见度 | 隐蔽 | **正面翻车** —— 用户当场发现"这不是我说的" |

**所以当前串记忆的主战场是 `user_memory` / `read_memory` 这两个工具，不是 `buildMemoryInjection`。**

#### 事实三：三个目标分属不同阶段

| 目标 | 修在哪 | 为什么 |
|---|---|---|
| **串记忆（工具路径）** | **P3.5** | 需要"召回侧认归属" —— 重排 / 过滤，属召回改造 |
| **针对性回复** | **P3.5** | 需要先把 L2 接进主聊天路径（改 L2 底层注入），再谈排序 |
| **精确删除 / 完全擦除** | **P3** | 纯存储层，**不依赖召回侧** ✅ |

#### 处置：P2 收窄为纯铺垫

**P2 只做采集与落库，不碰召回侧。**

三条理由：
1. 召回侧改造（接入 + 重排 + 工具侧过滤 + DMAE 推进）是一件完整的、带真实行为风险的独立工作 —— 串味、啰嗦、token 成本三重风险。混进 P2 会让"纯数据层改动"也背上这些风险，**验收标准也会变得含糊**。
2. **P3 的擦除不依赖召回侧**，把召回改造排到 P3 之后（= P3.5）不影响主线交付。
3. P2 的归属字段正是 P3.5 的前置条件 —— **先有数据，再谈怎么用**。

> **记录在案，P3.5 再细谈。** P2 的职责只有一条：**保证数据是对的、是全的。**

---

## 1. 现状接线（施工前必读）

### 1.1 归属信息有两条通路，且**已经有一条在手边**

| 信息 | 来源 | 通路 |
|---|---|---|
| **说话人**（`channel` + `senderId`） | `IncomingMessage` | ✅ **bootstrap 层直接有** —— `buildAndRunAgent(msg, ...)` 的 `msg` 就含 `channel`/`senderId`/`senderName`（`src/main/channels/bootstrap.ts:113`，`senderId` 在 `:197`/`:228` 已在用） |
| **消息 id** | P1 产出 | ❌ 需要新增透传：`dispatcher` → `buildAndRunAgent` 第 4 参数 |

**这是个好消息**：说话人不需要从 transcript 反查，也不依赖 P0 之前那个「私聊 transcript 不写 `speakerId`」的缺口（总概览 §4.3）—— **`msg.senderId` 在私聊和群聊都有值**。

### 1.2 ⚠️ 透传链的终点在 ALS 作用域之外

```
src/main/channels/bootstrap.ts:236   runWithConversationScope(sessionId, () => agent.runWithEvents(...))
src/main/channels/bootstrap.ts:~245  ← Promise 在此 resolve（ALS 作用域已退出）
src/main/channels/bootstrap.ts:249   await deps.agentRuntime.onRunFinished(...)   ← 在这里
      └─ src/main/orchestrator/agent-runtime.ts:289
           └─ src/main/orchestrator/build-options.ts:964 onAgentRunFinished
                └─ src/main/orchestrator/build-options.ts:995 deps.scheduleMemoryWrite(...)
                     └─ src/main/memory/memory-scheduler.ts:42 scheduleMemoryWrite
```

**`onRunFinished` 在 `runWithConversationScope` 之外调用**，所以**不能靠 AsyncLocalStorage 传递归属**。

> 顺带说明为什么不用 ALS：`runWithConversationScope`（`src/main/conversation-usage-store.ts:162`）是 AsyncLocalStorage，它**能**服务工具路径，但服务不了主路径。两条路径用两套机制会造成长期维护负担。**本阶段统一走显式透传。**

### 1.3 judge 的输入与输出（现状）

- 输入：`turns: MemoryJudgeTurn[]`（`src/main/memory/memory-types.ts:206-209`），只有 `userInput` / `assistantReply` 两个字段。
  **群聊的说话人已经写在 `userInput` 的文本前缀里**（`[群聊发送者：小明 (10001)]\n正文`，来自 `formatChannelUserText`），但**没有结构化**。
- 输出：`{ candidates, entities }`，candidate 有 `layer`/`content`/`slug`/`sourceQuote`/`certainty`/`attribution`… **但没有任何"关于谁"的字段**。

### 1.4 召回的三个入口（**P3.5 才改**，本阶段只记录现状）

| 入口 | 位置 | 现状 | 主聊天路径是否生效 |
|---|---|---|---|
| `buildMemoryInjection` | `src/main/orchestrator/index.ts:32-88` | 只按 `scope` 取池，DMAE 取 top-4 | ❌ **不生效**（见 §0.4） |
| `user_memory` 工具 | `src/main/orchestrator/tools/registry/tool-registry.ts:253-258` | `searchMemory(..., { scopeId })` | ✅ |
| `read_memory` 工具 | `src/main/orchestrator/tools/registry/tool-registry.ts:376-413` | `getL2ForScope(scopeId)` | ✅ |

`ToolContext`（`src/main/orchestrator/tools/registry/tool-context.ts:12-44`）**当前没有 speakerId** —— 只有 `userQuery` / `conversationId` / `runId` / `metadata`。

---

## 2. 设计决策

### 2.1 `personKey` 格式：`<channel>:<senderId>`

例：`qq:2914636187`。

**为什么带 channel 前缀**：QQ 和微信的 id 空间独立，裸 id 会跨渠道撞车。而 `L2Memory.subjectIds` 是跨域查询的键（Q1 决定全局删除），必须全局唯一。

**在哪组合**：bootstrap 层（`${msg.channel}:${msg.senderId}`），因为它同时持有两者。

**transcript 里的 `speakerId` 保持裸值不动**（`channels/history/*.jsonl` 里仍是 `"10001"`）—— P0/P1 不碰它。P3 擦除时需要的 channel 可以从 sessionId 解析（`channel:qq:ab12cd34`）。

### 2.2 为什么必须两个字段

```
小红说：「小明最近在学 Rust」
```

| 字段 | 值 | 用途 |
|---|---|---|
| `speakerIds` | `["qq:10002"]`（小红） | **证据归因** —— 这句话谁说的，可信度、来源 |
| `subjectIds` | `["qq:10001"]`（小明） | **召回过滤 / 删除定位 / 隐私边界** |

**只用一个会出错**：如果拿 `speakerIds` 当"关于谁"，上例就变成"关于小红的记忆"，然后被拿去回答小明 —— **又串回去了**。

### 2.3 `subjectNames` → `subjectIds` 的映射策略

LLM 最可靠的能力是**文本匹配**，不是复述 ID。所以：

- **LLM 只输出 `subjectNames: string[]`**（自然语言人名，如 `["小明"]`）
- **调度层用名册映射回 `personKey`**

**名册 = 本批 turns 的说话人**（`speakerName` → `personKey`）。

| 场景 | 结果 |
|---|---|
| "小明最近在学 Rust"（小明本人在场说过话） | 映射成功 → `["qq:10001"]` |
| 提到一个本批没出现的人（"小红的男朋友"） | 映射失败 → **丢弃**（不猜） |
| **私聊**：名册只有对端，且 `senderName` 可能缺失 | 兜底：`subjectIds = [该私聊的 personKey]` |
| **群聊**：映射失败 | `subjectIds` 留空 → 视为**公共记忆**（所有策略下中性） |

> ⚠️ **限制要写进 judge prompt**：名册只有"本批说过话的人"。跨批提到的人无法归属 —— 这是可接受的降级，不是 bug。

### 2.4 ⚠️ LLM 还要输出 `sourceTurnIndexes`

只输出 `subjectNames` 不够 —— `sourceMessageIds` 需要知道**这条候选来自第几轮**。

**让 LLM 输出轮次号（1-based），而不是 ID。** 理由：
- 轮次号是它眼前就能数出来的（prompt 里每轮标了「第 N 轮」）
- 幻觉了也只是指向**别的轮**，范围可控；让它复述 `msg_1758...` 这种 ID 才是灾难

调度层用 `sourceTurnIndexes` 去查 turn → `messageId` / `personKey`。缺失时退化为**整批**（指向一批比没有指针强，且**删除不依赖它**）。

### 2.5 召回策略：**重排，不硬过滤**（⬅️ 已整体移至 **P3.5**）

> ⚠️ **本节不属 P2 实现范围**（§0.3）。保留在此仅为**记录设计思路**，供 P3.5 直接取用。
> 结论先行：**工具路径（`user_memory` / `read_memory`）才是当前串记忆的主战场**（§0.4 事实二），P3.5 必须优先改它，而不是 `buildMemoryInjection`。

| 方案 | 评价 |
|---|---|
| 硬过滤（只留关于提问者的） | ❌ 会切断上下文 —— 昔涟在群里回复小明时，有时确实需要提"小红说的那个事" |
| 对 DMAE 排序插权重因子 | ❌ 会污染 DMAE 语义，且难测 |
| **注入后重排** ✅ | 纯函数、可测、可回退、不切断 |

**排序规则**（稳定排序，三档）：

```
1. subjectIds 含提问者        ← 最前
2. subjectIds 为空（公共/老数据）  ← 中间
3. subjectIds 含别人但不含提问者   ← 最后
```

**决策依据**：这条排序**只改变注入顺序，不改变候选集合**，所以最坏情况是"效果没提升"，不会"信息丢失"。P3 再加真正的隐私开关（硬过滤）。

### 2.6 桌面 / 私聊 / 老数据

| 场景 | `speakerIds` | `subjectIds` | 行为变化 |
|---|---|---|---|
| **桌面**（无 `msg.senderId`） | 空 | 空 | 完全不变 ✅ |
| **私聊** | `["qq:<对端>"]` | 默认同 `speakerIds` | 重排后仍是原来的记忆（池里本来就只有他） ✅ |
| **群聊** | 本批说话人 | `subjectNames` 映射 | **本阶段的行为变更点** |
| **老 L2**（P2 之前写入） | 空 | 空 | 视为公共记忆，排在中间 ✅ |

### 2.7 压缩总结的归属继承

`src/main/memory/memory-compressor.ts:31-80` 按同域聚类，一条总结可能压了小明的和小红的三条碎片。

**继承规则：取被压缩条目的并集。**

```ts
speakerIds: union(sources.map(s => s.speakerIds))
subjectIds: union(sources.map(s => s.subjectIds))
```

**为什么是并集而不是"删掉混合的"**：并集保留了完整信息，P3 删除时再决定"总结里含被删者怎么办"（总概览 §4.4 已列出三个选项）。**本阶段不做删除逻辑，只保证信息不丢。**

---

## 3. 逐文件改动

### 3.1 归属采集：dispatcher → agent 运行

**改动 1** — `src/main/channels/dispatcher.ts`

`DispatcherDeps.buildAndRunAgent` 加第 4 参数：

```ts
readonly buildAndRunAgent: (
  msg: IncomingMessage,
  sessionId: string,
  priorMessages?: ChatMessage[],
  /** P1 产出的 user 消息 id；用于建立「记忆 → 原话」指针。 */
  userMessageId?: string,
) => Promise<{ text: string; sticker: string | null }>;
```

调用点（`processIncoming`，`src/main/channels/dispatcher.ts:192`，P0 之后已无绑定分支）：

```ts
const userEntry = await this.deps.context.appendIncomingContext(msg, context);
// ...
const result = await this.deps.buildAndRunAgent(msg, sessionId, priorMessages, userEntry?.id);
```

**改动 2** — `src/main/channels/bootstrap.ts`

`buildAndRunAgent` 实现签名加参数，并在两处注入归属：

```ts
const buildAndRunAgent: DispatcherDeps["buildAndRunAgent"] = async (msg, sessionId, priorMessages, userMessageId) => {
  // ...
  const personKey = `${msg.channel}:${msg.senderId}`;   // ← 组合点

  const { options } = await deps.agentRuntime.buildOptions({
    // ...现有字段
    personKey,                                            // → CyreneRunOptions（供工具读）
  });
  // ...
  const finished = await deps.agentRuntime.onRunFinished(agent.lastResult, agentUserText, {
    // ...现有字段
    personKey,
    speakerName: msg.senderName,
    userMessageId,
  });
};
```

### 3.2 归属进入 scheduler

**~~改动 3~~ / ~~改动 4~~ — ⬅️ 已移至 P3.5**

> 原内容：`CyreneRunOptions.personKey`（`src/main/orchestrator/cyrene-agent.ts:95`）与 `AguiRunInput.personKey`（`src/main/agui-bridge.ts:91`）。
> **移出原因**：这两个字段唯一的消费者是 `ToolContext.speakerId`（工具侧归属），而那属于 P3.5（§3.6）。
> **P2 不提前加** —— 加了没人用，是死代码。P2 只需保证 `personKey` 在 `bootstrap` 层被组合出来（改动 2）。

**改动 5** — `src/main/orchestrator/agent-runtime.ts`

```ts
// AgentRunFinishedContext 加三个可选字段
export interface AgentRunFinishedContext {
  // ...
  personKey?: string;
  speakerName?: string;
  userMessageId?: string;
}
```

`onRunFinished`（`:289`）把它们透传给 `onAgentRunFinished` 的第 6 个参数 `finishedContext`。

**改动 6** — `src/main/orchestrator/build-options.ts`

`OnRunFinishedDeps.scheduleMemoryWrite`（`:195`）签名：

```ts
scheduleMemoryWrite: (
  userText: string,
  reply: string,
  conversationId?: string,
  attribution?: TurnAttribution,
) => void;
```

`onAgentRunFinished`（`:964`）从 `finishedContext` 取出并传入（`:995`）：

```ts
deps.scheduleMemoryWrite(sideEffectUserText, chatContent, conversationId, {
  personKey: finishedContext?.personKey,
  speakerName: finishedContext?.speakerName,
  messageId: finishedContext?.userMessageId,
});
```

**改动 7** — `src/main/memory/memory-scheduler.ts`

```ts
private turnsByScope = new Map<MemoryScopeId, Array<MemoryJudgeTurn & { seq: number }>>();

scheduleMemoryWrite(
  userInput: string,
  assistantReply: string,
  conversationId?: string,
  attribution?: TurnAttribution,
): void {
  const scopeId = resolveScopeId(conversationId);
  const seq = ++this.nextTurnSeq;
  const bucket = this.turnsByScope.get(scopeId) ?? [];
  bucket.push({ seq, userInput, assistantReply, ...attribution });
  // ...不变
}
```

`runQueuedMemoryWrite`（`:59`）里构造 turns 时带上归属，并在 judge 之后做归属注入：

```ts
const turns: MemoryJudgeTurn[] = bucketTurns.map(
  ({ userInput, assistantReply, personKey, speakerName, messageId }) =>
    ({ userInput, assistantReply, personKey, speakerName, messageId }),
);
const { candidates, entities } = await this.deps.judgeMemory(turns, conversationId ?? "default");

const scoped = attributeCandidates(candidates, turns, scopeId);   // ← 新增纯函数
if (scoped.length > 0) await this.deps.writeMemory(scoped);
```

### 3.3 新增：`src/main/memory/person-attribution.ts`

**全部是纯函数**，零 IO、零 LLM、可单测。这是 P2 的核心逻辑所在。

```ts
// 归属解析：把 LLM 的自然语言输出 + 本批 turns，解析成 personKey。
//
// 分工：
//   - LLM 只负责「这条候选关于谁」的语义判断，输出人名（subjectNames）与轮次号（sourceTurnIndexes）
//   - 本模块负责把名字映射回稳定 ID
//
// 设计原则：映射不上就丢弃，绝不猜。

import type { MemoryCandidate, MemoryJudgeTurn } from "./memory-types";

/** 组合说话人稳定标识。 */
export function buildPersonKey(channel: string, senderId: string): string {
  return `${channel}:${senderId}`;
}

/** 从 `channel:<channel>:<hash>` 形式的 sessionId 解析渠道前缀（P3 擦除用）。 */
export function channelFromSessionId(sessionId: string): string | null {
  const m = /^channel:([^:]+):/.exec(sessionId);
  return m ? m[1] : null;
}

/** 本批说话人的名册：昵称 → personKey，以及出现的全部 personKey。 */
export interface SpeakerRoster {
  byName: Map<string, string>;
  all: string[];
}

export function buildSpeakerRoster(turns: readonly MemoryJudgeTurn[]): SpeakerRoster;

/** 把 LLM 输出的 subjectNames 映射成 personKey；映射不上的丢弃。 */
export function resolveSubjectIds(
  names: readonly string[] | undefined,
  roster: SpeakerRoster,
): string[];

/**
 * 给一批候选注入归属。
 *
 * - speakerIds ← sourceTurnIndexes 指向的轮的 personKey（缺失时退化为整批）
 * - subjectIds ← subjectNames 映射（映射结果为空时，私聊退化为 speakerIds，群聊留空）
 * - sourceMessageIds ← sourceTurnIndexes 指向的轮的 messageId
 */
export function attributeCandidates(
  candidates: readonly MemoryCandidate[],
  turns: readonly MemoryJudgeTurn[],
  scopeId: string,
): MemoryCandidate[];

/**
 * 注入重排：关于 speakerId 的排前，无归属的居中，关于别人的排后。
 *
 * **稳定排序**（同档内保持原顺序，即 DMAE 的 activation 次序）。
 */
export function rankBySubjectAffinity<T extends { subjectIds?: string[] }>(
  items: readonly T[],
  speakerId: string | undefined,
): T[];
```

**关键实现要点**：

1. `resolveSubjectIds` 必须**精确匹配**昵称（trim 后全等），不做模糊/子串匹配 —— 否则"小明"会匹配到"小明明"。
2. `attributeCandidates` 里判断"是否私聊"用 `channelFromSessionId`？**不行** —— sessionId 里群/私聊同形。
   ~~改用：**turns 的 personKey 去重后只有一个** ⇒ 视为单人会话（私聊或桌面），退化为该 personKey。~~
   > ⚠️ **本判据已在施工中被证伪并替换**（详见 §9.3 偏离 1）：群里只有一个人说过话时它也成立，
   > 会把公共记忆错误地标成「关于他」，而 P3 的删除正是按 `subjectIds` 定位的。
   > 实际实现改用 **`chatType === "private"`**（`IncomingMessage` 本来就带，已随归属一并透传）。
3. `rankBySubjectAffinity` 用 `Array.prototype.sort` 不保证稳定 ⇒ 必须**手动分组拼接**（`[...a, ...b, ...c]`），不要用 sort。

### 3.4 judge：prompt 与 schema

**改动 8** — `src/main/memory/memory-types.ts`

```ts
export interface MemoryJudgeTurn {
  userInput: string;
  assistantReply: string;
  /** 说话人的稳定标识（`<channel>:<senderId>`）。桌面路径与老调用方为 undefined。 */
  personKey?: string;
  /** 说话人昵称；仅用于把 subjectNames 映射回 personKey。 */
  speakerName?: string;
  /** 该轮 user 消息在 transcript 的 id（P1 产出）。 */
  messageId?: string;
}

/** 一轮对话的说话人归属。由渠道入口注入，非 LLM 产出。 */
export interface TurnAttribution {
  personKey?: string;
  speakerName?: string;
  messageId?: string;
}

export interface MemoryCandidate {
  // ...现有字段
  /** LLM 输出：本条记忆主要关于谁（人名，自然语言）。 */
  subjectNames?: string[];
  /** LLM 输出：本条候选来自第几轮（1-based）。 */
  sourceTurnIndexes?: number[];
  /** 调度层注入：来源说话人 personKey。非 LLM 产出。 */
  speakerIds?: string[];
  /** 调度层注入：本条记忆关于的 personKey。非 LLM 产出。 */
  subjectIds?: string[];
  /** 调度层注入：来源消息 id（P1 的消息身份）。非 LLM 产出。 */
  sourceMessageIds?: string[];
}
```

> ⚠️ `MemoryCandidate` **此前没有 `sourceMessageIds`** —— 这是漏掉的一环，本阶段补上。

**改动 9** — `src/main/memory/memory-schemas.ts:102-148` `MEMORY_JUDGE_JSON_SCHEMA`

candidate 加两个字段（注意 `additionalProperties: false`，不加会被 A 档模型拒绝）：

```ts
subjectNames: { type: "array", items: { type: "string" } },
sourceTurnIndexes: { type: "array", items: { type: "number" } },
```

`parseMemoryJudgeResult`（`:268`）在候选解析处把这两个字段读进来（做**类型与长度校验**：`subjectNames` 每项 ≤32 字、最多 5 项；`sourceTurnIndexes` 为正整数、最多 10 项）。

**改动 10** — `src/main/memory/memory-judge.ts:61-157` prompt

在 `L2 sourceQuote 抽取` 之后插入一段：

```
L2 归属抽取（与候选一起输出，复用本次调用，不额外开销）：
- L2 候选必须输出 subjectNames 字段：这条记忆主要关于谁（人名数组）
- 规则：
  · 只填对话里出现过的具体人名，不要填「用户」「对方」「群友」这类泛指
  · 如果这条记忆和某个具体的人无关（例如纯粹的项目进展），subjectNames 返回空数组 []
  · 如果对话里有多个人，只填这条记忆真正关于的那个人
- L2 候选必须输出 sourceTurnIndexes 字段：这条记忆是从第几轮对话提取的（1-based 轮次号数组）
  · 例：从第 3 轮提取 → [3]；综合第 2、3 轮 → [2, 3]
- 示例：第 2 轮中小明说「我最近在学 Rust」→ subjectNames=["小明"], sourceTurnIndexes=[2]
- 示例：第 4 轮中小红说「小明最近在学 Rust」→ subjectNames=["小明"], sourceTurnIndexes=[4]
```

同时在 prompt 里**明确每轮的说话人**（现在只有 `userInput` 里带前缀，结构化后再显式标一次更稳）：

```ts
const transcript = turns.map((turn, index) => [
  `第 ${index + 1} 轮：`,
  `说话人：${turn.speakerName ?? "用户"}${turn.personKey ? `（${turn.personKey}）` : ""}`,
  `用户：${turn.userInput}`,
  `AI：${turn.assistantReply}`,
].join("\n")).join("\n\n");
```

### 3.5 落库

**改动 11** — `src/main/memory/memory-manager.ts:125-141` `writeL2`

```ts
if (candidate.slug) l2Input.slug = candidate.slug;
if (candidate.sourceQuote) l2Input.sourceQuote = candidate.sourceQuote;
if (candidate.scope) l2Input.scope = candidate.scope;
// P2：归属
if (candidate.speakerIds?.length) l2Input.speakerIds = candidate.speakerIds;
if (candidate.subjectIds?.length) l2Input.subjectIds = candidate.subjectIds;
if (candidate.sourceMessageIds?.length) l2Input.sourceMessageIds = candidate.sourceMessageIds;
```

`src/main/memory/memory-store.ts:196-206` `createEvidence` **不需要改** —— 它已经读 `input.sourceMessageIds`（`:202`），此前因为没人填所以恒空，现在自动生效。✅

**改动 12** — `src/main/memory/memory-types.ts:31-80` `L2Memory`

```ts
/**
 * 本条记忆的说话人 personKey 列表（P2 引入）。
 * 取值形如 `qq:2914636187`；缺失 = P2 之前的老数据或桌面路径。
 */
speakerIds?: string[];
/**
 * 本条记忆「关于谁」的 personKey 列表（P2 引入）。
 * 用于召回重排、按人定位删除、隐私边界判定。
 */
subjectIds?: string[];
```

### 3.6 召回侧 —— ⬅️ **整体移至 P3.5**

> **本阶段不做。** 范围收窄见 §0.3，原因见 §0.4 事实二/三。

**移出的原改动 13–16**：

| 原编号 | 内容 | 归属 |
|---|---|---|
| ~~改动 13~~ | `buildMemoryInjection` 加 `speakerId` 参数 + 重排 | P3.5 |
| ~~改动 14~~ | `ToolContext.speakerId` 字段 | P3.5 |
| ~~改动 15~~ | `tool-runtime.ts` / `task-runtime.ts` 填 `speakerId` | P3.5 |
| ~~改动 16~~ | `user_memory` / `read_memory` 工具重排 | **P3.5 的第一优先项** |

**P3.5 的完整范围**（记录在此，届时展开成独立文档）：

1. **工具侧归属过滤/重排** ← **优先**。§0.4 事实二已确认：当前串记忆的主战场是 `user_memory` / `read_memory`，不是 `buildMemoryInjection`。
2. `personKey` 到工具的通路：`bootstrap` 已组合出 `personKey`（§3.1）→ 需新增 `CyreneRunOptions.personKey` / `AguiRunInput.personKey`（原改动 3、4，本次一并移出）→ `ToolContext.speakerId`。
3. **L2 底层注入改造**：把 `buildMemoryInjection` 接进 `buildAlwaysOnContext` 路径 + 推进 DMAE（原 §3.9 的完整方案）。这是「针对性回复」的关键路径。
4. 召回**硬过滤**（隐私开关，可配置）。

> **P2 不为 P3.5 预留死代码**：`CyreneRunOptions.personKey` 等字段在 P2 阶段没人消费，**不提前加**。
> P2 只保证 `personKey` 在 `bootstrap` 层已被正确组合出来（§3.1 改动 2）—— P3.5 顺着这条线接一根到 options 即可。

### 3.7 压缩总结的归属继承

**改动 17** — `src/main/memory/memory-compressor.ts:117-128`

```ts
await commitMemoryCompression({
  content: cleanSummary,
  triggerText: group[0].l2.triggerText,
  sourceConversationId: group[0].l2.sourceConversationId,
  ...(group[0].l2.scope ? { scope: group[0].l2.scope } : {}),
  // P2：归属取被压缩条目的并集（保留完整信息，删除策略留给 P3）
  speakerIds: unionOf(group.map((g) => g.l2.speakerIds)),
  subjectIds: unionOf(group.map((g) => g.l2.subjectIds)),
  sources: [...],
}, { ... });
```

`unionOf` 是 `person-attribution.ts` 里的一个小工具（去重、保序、忽略 undefined）。

**改动 18** — `src/main/memory/memory-store.ts:539-570` `applyResolverResolution`

冲突消解产生的新条目（`resolved`）同样继承：

```ts
...(newMemory.scope || oldMemory.scope ? { scope: newMemory.scope ?? oldMemory.scope } : {}),
// P2：归属取两者并集
speakerIds: unionOf([newMemory.speakerIds, oldMemory.speakerIds]),
subjectIds: unionOf([newMemory.subjectIds, oldMemory.subjectIds]),
```

### 3.8 顺手修：`write_memory` 的 `sourceConversationId` 空串

**改动 19** — `src/main/orchestrator/tools/registry/tool-registry.ts:444-471`

现状：`write_memory` 注入了 `candidate.scope`，**但没有注入 `sourceConversationId`**，导致 `memory-manager.ts:129` 的 `?? ""` 落成**空串** —— 这类记忆连会话都追不回来。

```ts
candidate.scope = resolveScopeId(ctx?.conversationId);
// P2：补上来源会话（此前为空串，导致工具写入的记忆无法溯源）
candidate.sourceConversationId = ctx?.conversationId;
// P2：工具写入也带归属
candidate.speakerIds = ctx?.speakerId ? [ctx.speakerId] : undefined;
candidate.subjectIds = ctx?.speakerId ? [ctx.speakerId] : undefined;
```

---

### 3.9 L2 底层注入改造 —— ⬅️ **整体移至 P3.5**

> **本阶段不做。** 原编号为"可选、建议独立决策"，现已正式**独立为 P3.5 的核心议题**（§0.4 事实三）。

**为什么它是独立议题而非 P2 的可选项**：

- 它改的是**主聊天路径的 prompt 组成**，不是数据层。混在 P2 里会让"纯数据改动"背上 prompt 行为风险
- 它是「**群内针对性回复**」的关键路径 —— 而 P2 已明确收窄为"只给 P3 铺垫"（§0.3）
- 它有三个必须单独验收的真实风险：**群聊变啰嗦**（每轮多注入最多 4 条）、**串味的最后一道口子**（现在靠"不注入"天然屏蔽，接上后必须靠归属过滤兜）、**DMAE 冷启动**（老数据 `l2DmaeStates` 全是 `archived`）

**设计要点已记录在此，P3.5 直接取用**：

| 要素 | 位置 |
|---|---|
| 接入点：`buildAlwaysOnContext` 之后追加 `buildMemoryInjection`（与 `relationshipContext` 同级） | `src/main/orchestrator/build-options.ts:542-556` |
| 必须同时补 DMAE 推进（否则激活永远停在 0） | 参照 `src/main/call/call-prompt-builder.ts:40-54` 的同构写法 |
| 建议灰度姿势 | ① 加开关 `l2InjectionEnabled`，默认关 ② 先只对 `root` 域开（桌面），观察后再放群聊 |

**P3.5 展开时的完整清单**（§3.6 已列）：工具侧归属过滤 → `personKey` 到 options 的通路 → 本节的注入接入 + DMAE 推进 → 召回硬过滤。

---

## 4. 测试计划

### 4.1 新增 `src/main/memory/person-attribution.test.ts`（核心）

| # | 用例 | 断言 |
|---|---|---|
| 1 | `buildPersonKey` | `("qq","10001")` → `"qq:10001"` |
| 2 | `channelFromSessionId` | `"channel:qq:ab12"` → `"qq"`；`"desktop-1"` → `null` |
| 3 | `buildSpeakerRoster` | 三个 turn（含重复说话人）→ `byName` 去重、`all` 保序去重 |
| 4 | `resolveSubjectIds` 精确匹配 | `["小明"]` + 名册含"小明" → `["qq:10001"]` |
| 5 | `resolveSubjectIds` **不做子串匹配** | `["小明"]` + 名册只有"小明明" → `[]` |
| 6 | `resolveSubjectIds` 忽略空白 | `[" 小明 "]` → 命中 |
| 7 | `resolveSubjectIds` 无名字 | `undefined` / `[]` → `[]` |
| 8 | **说话人 ≠ 主体** | 小红说"小明在学 Rust" → `speakerIds=["qq:10002"]`、`subjectIds=["qq:10001"]` |
| 9 | `sourceTurnIndexes` 映射 | `[2]` → 取第 2 轮的 `messageId` 与 `personKey` |
| 10 | `sourceTurnIndexes` 越界/缺失 | 越界项忽略；全部无效 → 退化为整批 |
| 11 | 单人会话兜底 | turns 只有一个 personKey 且 `subjectNames` 映射为空 → `subjectIds = [该 personKey]` |
| 12 | 群聊映射失败 | turns 有多个 personKey 且映射为空 → `subjectIds = []` |
| 13 | `unionOf` | 去重保序；全 undefined → `[]` |

> `rankBySubjectAffinity` 的 3 条用例（三档顺序 / 稳定性 / 无 speakerId）随该函数一并移至 **P3.5**（§3.6）。
> ⚠️ 稳定性那条（**不能用 `sort`**）务必带到 P3.5 —— 它是纯函数设计约束，忘了就会静默打乱 DMAE 的 activation 次序。

### 4.2 既有文件的增量用例

| 文件 | 用例 |
|---|---|
| `memory-scheduler.test.ts` | `scheduleMemoryWrite` 带 attribution → turn 桶里三个字段都在；judge 收到的 turns 带归属 |
| `memory-judge.test.ts` | `subjectNames` / `sourceTurnIndexes` 解析；非法值被丢弃；prompt 含新字段说明与「说话人：」行 |
| `memory-manager.test.ts` | `writeL2` 落 `speakerIds`/`subjectIds`/`sourceMessageIds`；空数组不落字段 |
| `memory-store.test.ts` | `createEvidence` 的 `messageIds` 现在有值（回归：此前恒空） |
| `memory-compressor.test.ts` | 总结继承并集归属 |
| `dispatcher.test.ts` | `buildAndRunAgent` 收到第 4 参数 = P1 的 entry id |
| `bootstrap.test.ts` | `onRunFinished` 的 context 带 `personKey`/`speakerName`/`userMessageId` |
| `tool-registry-memory.test.ts` | `write_memory` 落 `sourceConversationId`（回归：此前空串） |

> ~~`build-memory-injection.test.ts`~~、~~`tool-registry-memory.test.ts` 的 `ctx.speakerId` 重排用例~~ —— 随召回侧移至 P3.5。

### 4.3 回归关注点

- `memory-judge.test.ts` 有 **prompt 快照**类断言吗？若有需同步更新（新增两段说明）。
- `MEMORY_JUDGE_JSON_SCHEMA` 被 `memory-schemas.test.ts` 断言结构吗？加字段可能需同步。
- ✅ **本阶段不改任何召回代码**，所以 P1 之后的所有注入行为应**完全不变** —— 这是最容易验证的回归点。

---

## 5. 验收

### 5.1 命令

```powershell
npx vitest run
npx tsc -p tsconfig.main.json
npx tsc -p tsconfig.preload.json
npx vite build
```

### 5.2 手工验证（需要测试 QQ 号）

1. 白名单群里，用账号 **A（如 10001，昵称"小明"）** @昔涟 说：「我最近在学 Rust」
2. 用账号 **B（10002，昵称"小红"）** 说几句话，凑够 6 轮触发 judge
3. 打开 `%APPDATA%/<app>/memory.json`，找到新增的 L2 条目，确认：

```json
{
  "content": "…Rust…",
  "scope": "zone:<该群所在区块>",
  "speakerIds": ["qq:10001"],
  "subjectIds": ["qq:10001"],
  "sourceMessageIds": ["msg_…"]
}
```

4. 拿这个 `sourceMessageIds[0]` 去 `channels/history/channel_qq_<hash>.jsonl` 里搜，确认：

```json
{"id":"msg_…","role":"user","speakerId":"10001","speakerName":"小明","triggered":true,…}
```

5. **说话人 ≠ 主体**验证：让 B 说「小明最近在学 Rust」，确认新条目的 `speakerIds=["qq:10002"]` 而 `subjectIds=["qq:10001"]`

> ~~原第 6 步「召回重排验证」~~ —— P2 不改召回侧，该步骤随 §3.6 移至 **P3.5**。

### 5.3 通过标准

- 新增 13 条 `person-attribution` 纯函数用例 + 各文件增量用例全绿
- 两个 tsconfig 编译 0 错误
- 手工验证 5 步全部符合预期
- **回归**：**P1 之后的所有对话行为、注入内容、召回结果应完全不变** —— 本阶段只往存储里加字段，不改任何读取路径
- ⚠️ **不包含**「群里针对性回复」与「工具召回不再串味」的验收 —— 两者都是 P3.5 的验收项

---

## 6. 风险与回滚

| 风险 | 评估 | 缓解 |
|---|---|---|
| **透传链断在某一层**（5 层：dispatcher → bootstrap → agent-runtime → build-options → scheduler） | **高** —— 少改一层就静默失效（`personKey` 全是 undefined，且不报错） | §4.2 每层都有用例；`bootstrap.test.ts` 直接断言 `onRunFinished` 收到的 context |
| LLM 不输出新字段（弱模型） | 中 | 两字段都是可选；缺失时 `subjectIds` 留空（公共记忆），行为退化为 P1 状态 |
| LLM 输出 `subjectNames` 幻觉 | 低 | 名册精确匹配，映射不上就丢弃 |
| `MEMORY_JUDGE_JSON_SCHEMA` 加字段影响 B/C 档模型（非严格 schema 路径） | 低 | 两条路径都走 `parseMemoryJudgeResult`，解析层统一容错 |
| judge prompt 变长导致输出质量波动 | 低-中 | 新说明只占约 10 行；先观察 `judge.result` 的 `kept` 数量是否稳定 |
| **P2 做完后「串记忆」和「针对性回复」都还没解决** | **确定发生** | **§0.4 事实二/三已说明**：两者都在召回侧（P3.5）。P2 的职责就是"把数据准备好"，验收标准也只考核数据 |

**回滚**：本阶段**不改存储格式**（只加可选字段）。回滚 = `git revert`。

- 已写入的 `speakerIds` / `subjectIds` 对旧代码是**未知字段**，被忽略 ✅
- 已写入的 `sourceMessageIds` 会让 `createEvidence` 带上 `messageIds`，旧代码只是多存一个字段 ✅
- **无需数据迁移、无需重启、无 schema 版本变更**

---

## 7. 为 P3 预留

P2 完成后，P3 需要的输入已经全部就位：

| P3 需要 | P2 产出 |
|---|---|
| 按人定位 L2 | `L2Memory.subjectIds` |
| 从记忆反查原话 | `L2Memory.sourceMessageIds` → transcript 的 `id` |
| 从消息取说话人 | transcript 的 `speakerId`（P0 之前就有） |
| 从 sessionId 取渠道 | `channelFromSessionId()` |
| 群 transcript 逐行过滤 | `HistoryEntry.speakerId`（P0 未动它） |
| 全局删除的键 | `personKey` = `<channel>:<senderId>` |

**P3 还需要新增、但 P2 不做的东西**：
- 压缩总结含被删者的处理策略（P2 只保证信息不丢）
- L0/L1 文本扫描（总概览 §4.5）
- 记忆管理 UI（按人浏览）

> ⚠️ **P3 的删除功能不受 §0.4 影响** —— 删除走的是存储层（`subjectIds` + transcript 过滤），不依赖召回侧。**「完全擦除」可以在 P3.5 之前独立交付。**

---

## 8. 改动文件清单

### 8.1 P2 必做（13 项）

| # | 文件 | 类型 |
|---|---|---|
| 1 | `src/main/channels/dispatcher.ts` | 改（`buildAndRunAgent` 第 4 参数） |
| 2 | `src/main/channels/bootstrap.ts` | 改（组合 `personKey`，注入 `onRunFinished` context） |
| 3 | `src/main/orchestrator/agent-runtime.ts` | 改（`AgentRunFinishedContext` + 透传） |
| 4 | `src/main/orchestrator/build-options.ts` | 改（`scheduleMemoryWrite` 签名 + 传参） |
| 5 | `src/main/memory/memory-scheduler.ts` | 改（turn 桶带归属 + 调用 `attributeCandidates`） |
| 6 | **`src/main/memory/person-attribution.ts`** | **新增** |
| 7 | `src/main/memory/memory-types.ts` | 改（`L2Memory` / `MemoryCandidate` / `MemoryJudgeTurn` / `TurnAttribution`） |
| 8 | `src/main/memory/memory-schemas.ts` | 改（JSON schema + 解析） |
| 9 | `src/main/memory/memory-judge.ts` | 改（prompt + transcript 结构） |
| 10 | `src/main/memory/memory-manager.ts` | 改（`writeL2` 落归属） |
| 11 | `src/main/memory/memory-compressor.ts` | 改（总结继承并集） |
| 12 | `src/main/memory/memory-store.ts` | 改（`applyResolverResolution` 继承并集） |
| 13 | `src/main/orchestrator/tools/registry/tool-registry.ts` | 改（**仅**修 `write_memory` 的 `sourceConversationId` 空串） |
| — | （对应测试文件：7 个改 + 1 个新增） | 改/新增 |

### 8.2 已移至 P3.5（不在本阶段）

| 原编号 | 文件 | 内容 |
|---|---|---|
| ~~3~~ | `src/main/orchestrator/cyrene-agent.ts` | `CyreneRunOptions.personKey` |
| ~~4~~ | `src/main/agui-bridge.ts` | `AguiRunInput.personKey` |
| ~~13~~ | `src/main/orchestrator/index.ts` | `buildMemoryInjection` 加参 + 重排 |
| ~~14~~ | `src/main/orchestrator/tools/registry/tool-context.ts` | `ToolContext.speakerId` |
| ~~15~~ | `src/main/orchestrator/harness/adapter/tool-runtime.ts`、`src/main/orchestrator/task-runtime.ts` | 填 `speakerId` |
| ~~16~~ | `src/main/orchestrator/tools/registry/tool-registry.ts` | 工具侧归属重排/过滤（**P3.5 第一优先项**） |
| §3.9 | `src/main/orchestrator/build-options.ts` | L2 注入接进主聊天路径 + DMAE 推进 |

> **注意第 13 项与"已移至 P3.5"的 `tool-registry.ts` 是同一个文件**：P2 只改其中的 `write_memory` 空串（一行），不改工具召回逻辑。施工时注意别越界。

---

## 9. 施工记录（已落地）

> **施工进度**：§3.1–§3.8 的归属链路与落库全部落地，判定/存储/透传的验收命令全绿。

### 9.1 逐条落地情况

| §  | 改动 | 落地 |
|---|---|---|
| §3.1 改动 1 | `dispatcher.ts` 的 `buildAndRunAgent` 第 4 参数 + 接住 `appendIncomingContext` 返回的 `entry.id` | ✅ |
| §3.1 改动 2 | `bootstrap.ts` 组合 `personKey`、注入 `onRunFinished` context | ✅（另加 `chatType`，见 §9.3 偏离 1） |
| §3.2 改动 5 | `agent-runtime.ts` `AgentRunFinishedContext` + 透传第 6 参数 | ✅ |
| §3.2 改动 6 | `build-options.ts` `scheduleMemoryWrite` 签名（`TurnAttribution`）+ 传参 | ✅ |
| §3.2 改动 7 | `memory-scheduler.ts` turn 桶带归属 + 调用 `attributeCandidates` | ✅ |
| §3.3 | **新增 `person-attribution.ts`** 五个纯函数 + `unionOf` | ✅ |
| §3.4 改动 8 | `memory-types.ts` 四类型扩展 | ✅（`MemoryJudgeTurn` 另加 `chatType`） |
| §3.4 改动 9 | `memory-schemas.ts` JSON schema + `parseSubjectNames` / `parseSourceTurnIndexes` | ✅ |
| §3.4 改动 10 | `memory-judge.ts` prompt 新增段 + transcript 显式「说话人：」行 | ✅ |
| §3.5 改动 11 | `memory-manager.ts` `writeL2` 落三个归属字段 | ✅ |
| §3.5 改动 12 | `L2Memory.speakerIds` / `subjectIds` | ✅ |
| §3.7 改动 17 | 压缩总结继承并集（含 `memory-compression-transaction.ts` 接口扩展） | ✅（清单外多改一个文件） |
| §3.7 改动 18 | `applyResolverResolution` 继承并集 | ✅ |
| §3.8 改动 19 | `write_memory` 补 `sourceConversationId` | ✅（两处 `require()` 顺手改动态 import，见 §9.3 偏离 2） |
| §3.2 改动 3/4 | `CyreneRunOptions.personKey` / `AguiRunInput.personKey` | ⬜ **未加**（按 §3.6 移出，确认无消费者） |
| §3.6 改动 13–16、§3.9 | 召回侧全部 | ⬜ **未做**（按 §3.6 整体移至 P3.5） |

> **范围自查**：`tool-registry.ts` 只动了 `write_memory` 的归属注入与两处加载方式，
> **召回逻辑一行未改**（`user_memory` / `read_memory` 的检索与排序保持原样）—— §3.6 「别越界」的要求已满足。

### 9.2 验收结果

| 项 | 基线（P1 之后） | 施工后 |
|---|---|---|
| `vitest run` | 484 文件 / 4318 passed / 1 skipped | **485 文件 / 4403 passed / 1 skipped**（+1 文件 / +85 用例，零回归） |
| `tsc -p tsconfig.main.json` | 0 错误 | 0 错误 |
| `tsc -p tsconfig.preload.json` | 0 错误 | 0 错误 |
| `vite build` | 通过 | 通过（动态 import 分块正常） |
| §5.2 手工验证 | — | ⬜ **待做**（需真实 QQ 号） |

**用例分布**（新增 86 条，其中 `build-options.test.ts` 的 1 条为在既有用例内改写断言；净 +85）：

| 文件 | 条数 | 覆盖 |
|---|---|---|
| `person-attribution.test.ts`（新增） | 36 | §4.1 的 13 条 + 兜底判据 / 纯函数性 / 上游字段保留等边界 |
| `memory-scheduler.test.ts` | +5 | 归属进 turn 桶、形状不变性、落库候选三字段、说话人 ≠ 主体、桌面路径 |
| `memory-judge.test.ts` | +5 | prompt 新段与两个示例、schema 示例、transcript 说话人行、无归属退化 |
| `memory-schemas.test.ts` | +16 | `parseSubjectNames` / `parseSourceTurnIndexes` 边界 + 候选解析 + schema 声明 |
| `memory-manager.test.ts` | +4 | `writeL2` 落归属、`createEvidence.messageIds` 有值、空数组不落字段 |
| `memory-store.test.ts` | +2 | 消解结果归属并集、老数据不产生空数组 |
| `memory-compression-transaction.test.ts` | +3 | 归属并集传给总结、空/缺失不落字段 |
| `dispatcher.test.ts` | +3 | 第 4 参数 = 落盘 id（含真链路 `createChannelContext` + `appendHistory` 桩）、落盘失败退化 |
| `bootstrap.test.ts` | +3 | 归属四字段进 `onRunFinished`、`chatType` 缺省 `private`、落盘失败不阻断 |
| `agent-runtime.test.ts` | +2 | 归属进第 6 参数且**不外泄到插件事件载荷**、桌面路径全 undefined |
| `tool-registry-memory.test.ts` | +5 | `write_memory` 候选带来源会话与域、Root 域、无会话退化、L0 锁定短路、`read_memory` 动态 import 后可调用 |
| `build-options.test.ts` | 1 改写 | 桌面路径第 4 参数由「不传」变为「传全 undefined 对象」 |

### 9.3 与原清单的差异（施工中发现的、清单没写到的）

| # | 位置 | 为什么清单会漏 | 实际处置 |
|---|---|---|---|
| 1 | `MemoryJudgeTurn` / `TurnAttribution` **新增 `chatType`**，透传链从 3 字段变 4 字段 | §3.3 关键实现要点 2 写的单人会话判据是「turns 的 personKey 去重后只有一个」，并明确否掉了 `channelFromSessionId`。**这个替代判据是错的**：群里只有一个人说过话时也满足它，于是「纯项目进展」（公共记忆）会被兜底成「关于他」—— 而 P3 的删除正是按 `subjectIds` 定位的，标错就等于删错人的记忆。恰好 §0.2 的验收样例（B 单人说「小明最近在学 Rust」，小明不在场）就落在这个坑里 | 改用**真实判据 `chatType === "private"`**：`IncomingMessage` 本来就带它，bootstrap 层直接透传。<br>首次施工时按原文实现**已被新用例当场证伪**（`attributeCandidates` 的单人兜底把群聊公共记忆标成了 `qq:10002`），故改为本方案 |
| 2 | `tool-registry.ts` 的 `read_memory` / `write_memory` 两处 `require()` → `await import()` | §3.8 只要求「补一行 `sourceConversationId`」，但该工具用 `require()` 懒加载 `memory-manager` / `memory-store`：**`require` 在 ESM 打包产物与 vitest 下都不可拦截**，导致这条路径**完全无法单测**（首次尝试写用例时实测撞到 `Cannot find module`） | 改为动态 `import()`：懒加载语义不变（仍是调用时才解析），但 `vi.mock` 可拦截。这正是 §4.2 要求的那条回归用例（`write_memory` 落 `sourceConversationId`）**能写出来的前提** |
| 3 | `memory-compression-transaction.ts` | §3.7 只写了改 `memory-compressor.ts` 的调用点，但 `CompressionTransactionInput` / `createSummary` 的入参类型里没有归属字段，编译期根本传不进去 | 一并扩展 `CompressionTransactionInput` 与 `CompressionTransactionDeps.createSummary` 的签名（空数组不落字段的约定与 `writeL2` 对齐） |
| 4 | `context-builder.ts` | §8.1 清单没有它，但它是 `memoryScheduler.scheduleMemoryWrite` 的门面（`orchestrator/index.ts` 从这里 re-export） | 门面签名同步加第 4 参数（纯转发，零逻辑） |
| 5 | `agent-runtime.test.ts` 新增「归属不进插件载荷」用例 | 清单没提，但归属进了 `AgentRunFinishedContext`（= 插件 `turn:completed` 事件的同源 context），存在**顺带把群成员 QQ 号泄进插件事件**的风险 | 用例锁住「归属只走记忆链路，不进插件事件契约」 |

### 9.4 关键实现细节（与原方案的实质区别）

1. **`speakerIds` 从「来源轮」取，缺失时退化为整批**（`resolveSourceTurns`）。原文 §3.3 只说了 `subjectIds` / `sourceMessageIds` 的退化规则；`speakerIds` 采用同一规则，保证「一批指向」优于「没有指针」。
2. **`subjectIds` 兜底只看 `chatType`，不看人数**。桌面路径（无 `chatType` 也无 `personKey`）不兜底 —— 与 P1 行为完全一致。私聊里若出现两个说话人（异常数据：同一 chatId 换人发言）同样不兜底。
3. **`attributeCandidates` 保留上游已有字段**：解析结果为空时不会把候选上已有的 `speakerIds` / `subjectIds` / `sourceMessageIds` 抹掉（测试桩与未来调用方都依赖这一点）。
4. **空数组不落字段**（`writeL2` / 压缩事务一致）：让「老数据 / 桌面路径」与「解析后无归属」在磁盘上同形，读取侧只需判一种。
5. **`channelFromSessionId` 目前无生产消费者**（P3 擦除流程才用）。按 §3.3 的完整规格实现并配 3 条用例，**不删** —— 先于消费者的纯函数在总概览 §7 的 P3 输入清单里，删了 P3 要重写。
6. **`MemoryJudgeTurn` 的字段按需展开**（不写 `undefined` 键）：桌面路径（无归属）的 turn 形状与 P1 **逐键一致**，已用 `Object.keys` 断言锁住。

### 9.5 回归确认（§4.3 「本阶段不改任何召回代码」）

**成立且已实证**：

- `user_memory` / `read_memory` 的检索、排序、返回内容**一行未改**（只改了工具内部加载模块的方式）。
- `buildMemoryInjection` / `buildAlwaysOnContext` / `l2DmaeManager` **完全未触碰**。
- 桌面路径端到端：`build-options.test.ts` 断言第 4 参数为「全 undefined 的归属对象」→ scheduler 侧 `attributeCandidates` 不产生任何字段 → 落库与 P1 逐字段相同。
- P1 的既有用例 `history-log.test.ts`（真 `appendHistory` + 真 `createChannelContext`，断言 id 一致）**零改动通过**。

### 9.6 新发现（对 P3 / P3.5 有价值）

1. **⚠️「单人发言」绝不能等同于「单人会话」。** 这是本阶段最容易写错的一处（§9.3 偏离 1）。
   P3.5 做召回重排时若也要"认提问者"，判据必须取自 `IncomingMessage.chatType` 或工具上下文里的会话类型，
   **不要用「本批只有一个 speaker」** 作代理 —— 群里完全可能只有一个人说话。
2. **测试里可以完整驱动「渠道消息 → L2 归属」这条链，无需真实 QQ。**
   `memory-scheduler.test.ts` 的新用例用真实 `MemoryScheduler` + 桩 judge，即可断言
   `turns[].personKey` → `candidate.subjectIds` → `writeMemory` 收到的候选；
   `dispatcher.test.ts` 用真 `createChannelContext` + `appendHistory` 桩即可断言「第 4 参数 = 落盘 id」。
   §5.2 的手工验证因此只承担「LLM 真会输出 `subjectNames` 吗」这一件无法 mock 的事。
3. **`require()` 是测试盲区**（§9.3 偏离 2 的通用教训）。本仓库还有 `fs-tools` 等懒加载点；
   凡是走 `require()` 的生产路径，**都无法用 `vi.mock` 拦截**，只能靠集成测试兜。改用动态 `import()` 即可解除。
4. **`tsconfig.main.json` 的 `exclude` 覆盖了 `*.test.ts`**（P1 §9 新发现 1 再次确认）：
   本次所有类型防线（`TurnAttribution` 等）都是**靠 5 层透传的运行时用例**兜住的，
   而不是靠类型断言 —— 少改一层会出现「编译通过但静默失效」，用例是唯一防线。
