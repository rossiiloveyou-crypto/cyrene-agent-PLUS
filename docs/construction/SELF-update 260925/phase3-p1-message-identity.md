# Phase 3 · P1 施工方案：消息身份（Message Identity）

> **上级文档**：`docs/construction/phase3-person-memory-overview.md`
> **本阶段目标**：给渠道 transcript 的每条消息一个稳定 `id`，并让这个 `id` 能从「写入点」冒泡到「dispatcher 层」可取。
> **状态**：✅ **已施工完成**，代码 + 自动化验收全绿，**§5.2 手工验证已通过**（记录见 §9；含一条与 P1 无关但影响 P3 的发现，见 §9.6 末）。
> **✅ 前置条件已满足**：**P0（删除镜像消息）已落地**（记录见总概览 §3.4）。`channel-context.ts` 里的绑定分支（`appendBoundConversationMessage` / `boundConversationId` / `loadBoundConversationHistory`）已不存在，`appendIncomingContext` / `appendAssistantContext` 现在各只剩「写渠道历史」一件事，是直筒子。
> 因此本文件原先的「若 P0 未做，需额外在绑定分支的 `return;` 上返回 `entry`」双 return 点注意事项**已作废**，可直接按 §3.2 施工。

---

## 0. 阶段定位

### 0.1 为什么需要它

P2 要给每条 L2 记忆记录「依据的是哪几条原始消息」（`sourceMessageIds`）。没有消息 id，这个指针无从建立。

现状（`src/main/channels/history-log.ts:32-45`）：

```ts
export interface HistoryEntry {
  speakerId?: string;
  speakerName?: string;
  isBot?: boolean;
  triggered?: boolean;
  role: "user" | "assistant";
  content: string;
  at: string;
}
```

**没有 `id`。** 一行 JSONL 无法被任何东西指向。

对照：桌面对话消息**已有** `id`（`src/main/chats/chats-store.ts:356` 收到的 `randomUUID()`）。渠道侧是缺口。

### 0.2 本阶段的范围边界

| 做 | 不做 |
|---|---|
| 渠道消息（`channels/history/*.jsonl`）新增 `id` | ❌ 桌面消息（已有 uuid，不动） |
| `appendHistory` 返回落盘的消息对象 | ❌ `channels/log.jsonl`（与记忆链路无关） |
| `channel-context` 两个 append 方法返回该对象 | ❌ `ChatMessage`（给模型看的消息体，不需要 id） |
| 归档 / 迁移自动保留 `id`（加测试锁住） | ❌ 透传到 `scheduleMemoryWrite`（**P2 的活**） |
| 老记录兼容（无 `id` 不崩） | ❌ 存量消息回填 id（结构上无法做，见 §2.5） |

### 0.3 验收标准

> **发一条群消息后，`channels/history/<sessionId>.jsonl` 的最后一行包含 `id` 字段；且 `appendIncomingContext()` 的返回值里能直接拿到同一个 id。**

### 0.4 本阶段的用户可见效果

**无。** P1 是纯增量地基（只加字段、只改返回值），不改变任何现有行为。

这是有意的：把「让数据存在」和「让数据被使用」拆成两次改动，P1 风险最低，可先落地观察。P2 才消费它。

---

## 1. 现状接线（施工前必读）

### 1.1 三个写入方

> ✅ 下表行号已按 **P0 之后**的代码更新（P0 已落地）。行号仍可能随 P2 漂移，**以符号名为准**。

| 写入方 | 位置 | 场景 |
|---|---|---|
| `writeObservedTranscript` | `src/main/channels/adapters/qq/napcat-adapter.ts` `appendHistory(...)` | 群聊旁听（`triggered: false`） |
| `appendIncomingContext` | `src/main/channels/channel-context.ts:149` | 被叫起来的用户消息 |
| `appendAssistantContext` | `src/main/channels/channel-context.ts:174` | 昔涟的回复 |
| （旁路）`deliverProactive` | `src/main/channels/proactive-delivery.ts` `appendHistory(...)` | 主动消息写入渠道历史 |

`appendChannelHistory` 在 `src/main/channels/bootstrap.ts` 的 `createChannelContext({...})` 里被绑定为 `appendHistory` 本体。

> P0 之后 `appendIncomingContext` / `appendAssistantContext` 各只剩「写渠道历史」一件事 —— 原先的绑定会话写入分支已删除，这两个方法现在是直筒子（见文件头前置条件）。

### 1.2 两个读取方（本阶段不受影响，但要知道）

| 读取方 | 位置 | 用途 |
|---|---|---|
| `loadRecentHistory(sid, 16, {conversationOnly:true})` | `src/main/channels/bootstrap.ts:98-103` | 对话滑窗 |
| `buildGroupContextBlock(sid, limit)` | `src/main/orchestrator/index.ts:157` | 【群聊近期上下文】注入块 |

两者都只是多读到一个字段，不需要改。

### 1.3 ⚠️ 关键时序（决定 P2 的设计，P1 只需知道）

`src/main/channels/dispatcher.ts` 的实际顺序：

```
218  await appendIncomingContext(msg, context)   ← user 消息落盘，id 可得
224  await buildAndRunAgent(...)                 ← run 期间触发 onRunFinished → scheduleMemoryWrite
309  await appendAssistantContext(...)           ← assistant 消息此时才落盘
```

**结论：`scheduleMemoryWrite` 触发时，assistant 消息的 id 还不存在。**
P2 因此只指向 **user 消息**（judge prompt 本来就要求「必须是用户主动表达的信息，不是 AI 说的」，见 `src/main/memory/memory-judge.ts:85`）。P1 只需保证 **user 消息的 id 在 `appendIncomingContext` 返回时可取**。

---

## 2. 设计决策

### 2.1 id 格式

**采用 `msg_<Date.now()>_<rand6>`**，例如 `msg_1758681234567_a3f9k2`。

理由：

| 候选 | 评价 |
|---|---|
| `msg_<ts>_<rand6>` ✅ | 与项目既有 id 风格完全一致（`l2_` / `ev_` / `ent_` / `zone_` 都是 `<prefix>_<ts>_<rand>`，见 `memory-store.ts:152`、`memory-store.ts:198`、`entity-graph.ts:125`、`zone-store.ts:127`）；短、可读、日志里一眼可辨 |
| `randomUUID()` | 与桌面对话消息一致，但风格不统一，且 36 字符写进每行 JSONL |

唯一性：transcript 是单进程串行追加；`rand6` 的 base36 空间约 `2.1e9`，同一毫秒内写入两条并碰撞的概率可忽略。

> 注：沿用仓库既有写法 `Math.random().toString(36).slice(2, 8)`，极端情况下可能短于 6 字符（与 `memory-store.ts:152` 行为一致）。如需保证定长，用 `.padEnd(6, "0")` —— 本阶段**保持与既有代码一致，不做 padEnd**。

### 2.2 类型设计：为什么要两个类型

```ts
export interface HistoryEntry {
  /** 消息稳定标识（P1 引入）。本阶段之前写入的老记录没有此字段。 */
  id?: string;
  speakerId?: string;
  speakerName?: string;
  isBot?: boolean;
  triggered?: boolean;
  role: "user" | "assistant";
  content: string;
  at: string;
}

/** 已落盘的消息（id 保证存在）。appendHistory 的返回类型。 */
export type PersistedHistoryEntry = HistoryEntry & { id: string };
```

- `HistoryEntry.id` **必须是可选的**：磁盘上确实存在没有 id 的老行，`JSON.parse` 出来的对象就是没有。类型必须诚实，否则读路径到处是类型谎言。
- `PersistedHistoryEntry` 让**写入方**拿到强类型，不必每次判空。

### 2.3 ⚠️ `HistoryEntryMeta` 必须排除 `id`

当前定义（`history-log.ts:48`）：

```ts
export type HistoryEntryMeta = Omit<HistoryEntry, "role" | "content" | "at">;
```

如果只给 `HistoryEntry` 加 `id` 而不改这里，`HistoryEntryMeta` 会**自动获得 `id?: string`**，调用方就能伪造或复用 id。

**必须改成：**

```ts
/** 除必填字段与 id 外的结构化元信息。id 由 appendHistory 生成，调用方不得提供。 */
export type HistoryEntryMeta = Omit<HistoryEntry, "id" | "role" | "content" | "at">;
```

这是一处**容易漏掉、且漏掉不报错**的改动 —— 类型仍然可编译，只是防线没了。

### 2.4 失败语义：返回 `null` 而不是抛错

`appendHistory` 当前返回 `void`，IO 异常被内部 `catch` 吞掉只打 warn（`history-log.ts:259-261`）。

改为返回 `PersistedHistoryEntry | null`：

| 情况 | 返回 |
|---|---|
| 正常落盘 | `entry` |
| `!sessionId \|\| !content`（现有 early return） | `null` |
| 落盘 IO 异常 | `null` |
| **截断/归档失败**（消息已落盘） | **`entry`** ← 见下 |

**为什么落盘失败返回 `null` 而不是仍返回 entry**：指针若指向一条**根本没落盘**的消息，P3 擦除时"按 id 查不到"，无法区分「已经删干净」和「从来就没有」。宁可让记忆没有指针（诚实），也不要悬空指针。

**为什么截断失败仍返回 `entry`**：`appendFileSync` 已经成功，消息确实在磁盘上。现有注释（`history-log.ts:254-255`）也说明了这个设计：「先归档、后截断……结果是'加了新行、但没截断'，绝不丢原文」。因此需要把**一次 try 拆成两次**（见 §3.1）。

### 2.5 老数据：不迁移

- 已写入的行保持原样（没有 `id`）。
- **`normalizeEntry` 不改** —— 它只负责还原 legacy 的说话人前缀（`history-log.ts:80-99`），与 id 无关。
- 读取时老行的 `entry.id === undefined`，调用方判空即可。
- **不做批量回填**：P2 的指针是「写入时记录」的，只对本轮新消息生效；历史消息不会被重新判定，所以老消息不需要 id。而 P3 的擦除是靠 `speakerId` 扫文件，**不依赖 id**，所以老消息没有 id 也不影响删除。

### 2.6 归档 / 迁移会自动保留 id

| 路径 | 机制 | 需要改吗 |
|---|---|---|
| `appendToArchive`（`history-log.ts:168-183`） | 原样搬运 `lines.slice(0, cut)` 的 raw line | ❌ 不用，但**要加测试锁住** |
| `migrateHistory`（`history-log.ts:327-338`） | `fs.copyFileSync` | ❌ 不用，同上 |

### 2.7 不动的三处

1. **桌面消息**：`ChatMessage.id` 已是 `randomUUID`（`chats-store.ts:356`），本阶段不统一、不改。
2. **`channels/log.jsonl`**：`LogEntry`（`message-log.ts:17-29`）是"给人看的运行日志"，与记忆溯源无关，且滚动上限 1000 行，不适合做证据链。
3. **`ChatMessage`**（`channel-context.ts:8-17`）：这是喂给模型的消息体，加 id 无意义。

---

## 3. 逐文件改动

### 3.1 `src/main/channels/history-log.ts`

**改动 1**：新增 id 生成函数（导出以便测试）。

```ts
/**
 * 生成消息稳定标识。
 *
 * 格式 `msg_<ts>_<rand6>`，与 memory.json 的 `l2_` / `ev_` / `ent_` 风格保持一致。
 * 纯函数：给定 now 即确定前缀，随机部分由 Math.random 提供。
 */
export function createMessageId(now = Date.now()): string {
  return `msg_${now}_${Math.random().toString(36).slice(2, 8)}`;
}
```

**改动 2**：`HistoryEntry` 加 `id?: string`；新增 `PersistedHistoryEntry`；修改 `HistoryEntryMeta`。

（类型定义见 §2.2 / §2.3）

**改动 3**：`appendHistory` 生成 id、拆分 try、返回对象。

```ts
/** 追加一条. role 只能是 user/assistant (dispatcher 内部强制).
 *  meta 承载结构化字段 (说话人 / 是否触发); 只写有值的字段, 保持旧记录可读.
 *  返回落盘的消息对象（含 id）；未落盘时返回 null。 */
export function appendHistory(
  sessionId: string,
  role: "user" | "assistant",
  content: string,
  meta?: HistoryEntryMeta,
): PersistedHistoryEntry | null {
  if (!sessionId || !content) return null;
  const entry: PersistedHistoryEntry = {
    id: createMessageId(),
    role,
    content,
    at: new Date().toISOString(),
    ...(meta?.speakerId !== undefined && { speakerId: meta.speakerId }),
    ...(meta?.speakerName !== undefined && { speakerName: meta.speakerName }),
    ...(meta?.isBot !== undefined && { isBot: meta.isBot }),
    ...(meta?.triggered !== undefined && { triggered: meta.triggered }),
  };
  const fp = filePath(sessionId);

  // ① 落盘：失败则本条消息不存在，返回 null（不能让下游拿到悬空指针）
  try {
    fs.mkdirSync(dir(), { recursive: true });
    fs.appendFileSync(fp, JSON.stringify(entry) + "\n", "utf8");
  } catch (err) {
    console.warn(LOG, "appendHistory 落盘失败:", sessionId, err instanceof Error ? err.message : String(err));
    return null;
  }

  // ② 截断 + 归档：消息已落盘，失败不回滚 id（宁可热文件变胖，绝不丢原文）
  try {
    const buf = fs.readFileSync(fp, "utf8");
    const lines = buf.split("\n");
    if (lines.length > MAX_FILE_LINES + 1) {
      const cut = lines.length - MAX_FILE_LINES;
      const dropped = lines.slice(0, cut);
      const trimmed = lines.slice(cut).join("\n");
      appendToArchive(sessionId, dropped);
      fs.writeFileSync(fp, trimmed.endsWith("\n") ? trimmed : trimmed + "\n", "utf8");
    }
  } catch (err) {
    console.warn(LOG, "appendHistory 截断失败:", sessionId, err instanceof Error ? err.message : String(err));
  }

  return entry;
}
```

**改动 4**：文件头注释补一段，说明 id 的用途与老数据差异。

### 3.2 `src/main/channels/channel-context.ts`

**改动 5**：`CreateChannelContextOptions.appendChannelHistory` 返回类型放宽。

```ts
import type { PersistedHistoryEntry } from "./history-log";

appendChannelHistory: (
  sessionId: string,
  role: "user" | "assistant",
  content: string,
  meta?: { speakerId?: string; speakerName?: string; isBot?: boolean; triggered?: boolean },
) => PersistedHistoryEntry | null | Promise<PersistedHistoryEntry | null>;
```

> `import type` 是纯类型引用，编译后消失，不引入运行时循环依赖（`history-log` 也不反向依赖 `channel-context`）。

**改动 6**：`ChannelContext` 接口的两个方法返回值。

```ts
export interface ChannelContext {
  // ...
  /** 写入用户消息，返回落盘对象（含 id）；未落盘时 null。 */
  appendIncomingContext(msg: IncomingMessage, context: DispatchContext): Promise<PersistedHistoryEntry | null>;
  /** 写入助手消息，返回落盘对象（含 id）；未落盘时 null。 */
  appendAssistantContext(msg: IncomingMessage, context: DispatchContext, prepared: PreparedOutgoing): Promise<PersistedHistoryEntry | null>;
}
```

**改动 7**：`appendIncomingContext` 实现 —— 接住并返回渠道历史的 entry。

P0 之后该方法只剩「写渠道历史」一件事，是直筒子：

```ts
async appendIncomingContext(msg, context): Promise<PersistedHistoryEntry | null> {
  const modelText = formatChannelUserText(msg);
  const isGroup = msg.chatType === "group";
  try {
    // ⚠️ 群聊写 stripSpeakerPrefix(modelText)：砍掉发送者前缀、保留引用行。
    //    写 msg.text 会丢引用；写 modelText 整段会双前缀。两者都不要。
    return (await options.appendChannelHistory(
      context.sessionId,
      "user",
      isGroup ? stripSpeakerPrefix(modelText) : modelText,
      isGroup
        ? {
            speakerId: msg.senderId,
            ...(msg.senderName ? { speakerName: msg.senderName } : {}),
            isBot: false,
            // 能走到 appendIncomingContext 就是被叫起来了（dispatcher 只处理 respond）
            triggered: true,
          }
        : undefined,
    )) ?? null;
  } catch (err) {
    console.warn(LOG, "渠道用户历史写入失败:", err);
    return null;
  }
}
```

**要点**：
- 原来的 `try/catch` **吞掉异常不冒泡**的行为保留 —— 历史写入失败不能中断对话主流程。
- `?? null` 是必要的：`appendChannelHistory` 是注入的，测试/未来实现可能返回 `undefined`。
- **P0 已完成**，这里已经没有绑定会话分支和第二个 `return;`（原易漏点已随 P0 消失）。

**改动 8**：`appendAssistantContext` 同样处理（现在也只剩「写渠道历史」一件事）。

### 3.3 调用方（无需改动）

| 调用方 | 位置 | 说明 |
|---|---|---|
| `bootstrap.ts` | `:382` `appendChannelHistory: appendHistory` | 返回类型变宽，赋值兼容 ✅ |
| `napcat-adapter.ts` | `:498` | 忽略返回值 ✅ |
| `proactive-delivery.ts` | `:111` | 忽略返回值 ✅ |
| `dispatcher.ts` | `:218` / `:309` | 忽略返回值，**P1 不改**（透传是 P2 的活） ✅ |

> TypeScript 不会因为「忽略返回值」而报错，所以这些调用方零改动。

---

## 4. 测试计划

### 4.1 `src/main/channels/history-log.test.ts`（新增用例）

沿用文件既有的 electron mock 与 `beforeEach` 清理（`:8-33`）。

| # | 用例 | 断言 |
|---|---|---|
| 1 | `createMessageId` 格式 | 匹配 `/^msg_\d+_[a-z0-9]+$/` |
| 2 | `createMessageId` 唯一性 | 连续 1000 次调用无重复 |
| 3 | `appendHistory` 返回带 id 的对象 | 返回非 null，`id` 匹配格式 |
| 4 | 返回值与落盘一致 | `loadRecentHistory(sid, 10)` 最后一条的 `id` === 返回值的 `id` |
| 5 | 两次调用 id 不同 | — |
| 6 | 空 sessionId / 空 content | 返回 `null`（且不写文件） |
| 7 | 老格式行兼容 | 手写一行无 `id` 的 JSONL → 读回 `entry.id === undefined`，不抛错 |
| 8 | **归档保留 id** | 写 250 条 → `loadArchivedHistory` 抽查条目 `id` 存在 |
| 9 | **迁移保留 id** | `migrateHistory(from, to)` 后读 `to`，`id` 存在且与原文件一致 |
| 10 | meta 不能携带 id | 类型层用例（见 4.3） |

### 4.2 `src/main/channels/channel-context.test.ts`（新增用例）

| # | 用例 | 断言 |
|---|---|---|
| 11 | `appendIncomingContext` 返回 entry | `appendChannelHistory` mock 返回 `{id:"msg_1_a", ...}` → 方法返回同一对象 |
| 12 | `appendChannelHistory` 返回 `null` / `undefined` | 方法返回 `null` |
| 13 | `appendChannelHistory` 抛错 | 方法返回 `null`，不冒泡 |
| 14 | `appendAssistantContext` 同理 | 同 11–13 |

### 4.3 类型防线（可选，建议）

在 `history-log.test.ts` 加一条**编译期**断言，防止 §2.3 被回退：

```ts
it("HistoryEntryMeta 不得包含 id（编译期防线）", () => {
  type HasId = "id" extends keyof HistoryEntryMeta ? true : false;
  const mustBeFalse: HasId = false;
  expect(mustBeFalse).toBe(false);
});
```

> 若 `HistoryEntryMeta` 被改回包含 `id`，`HasId` 会变成 `true`，`const mustBeFalse: true = false` 直接编译失败。

### 4.4 回归关注点

运行全量测试时，重点看这几处**不应该红**（它们只断言入参或映射后的字段）：

- `channel-context.test.ts` 中 `toHaveBeenCalledWith(...)` 的用例 —— 断言的是**入参**，不受返回值影响
- `dispatcher.test.ts` 中 `appendChannelHistory: appendHistory` 的接线 —— 用真实函数，返回值被忽略
- `history-log.test.ts` 既有用例 —— 大多 `map((e) => e.content)` 或属性访问，不 `toEqual` 整个对象
- `group-context-injection.test.ts` —— mock 掉了 `buildGroupContextBlock`

> ✅ **行号位移已发生**：P0 已落地，删除了 `channel-context.ts` 的绑定分支与 `dispatcher.ts` 的绑定/广播逻辑，本文件引用的具体行号（`:149,325,358`、`:92` 等）**已全部失效**。**以符号名为准，不要按行号找。**

**如果出现 `toEqual` 整个 entry 的断言，需要同步更新期望值**（这是预期的、合理的破坏）。

---

## 5. 验收

### 5.1 命令

```powershell
npx vitest run
npx tsc -p tsconfig.main.json
npx tsc -p tsconfig.preload.json
npx vite build
```

> 本机 PowerShell 执行策略会拦截 `npx.ps1`。改用 `npm.cmd` 或直接 `node node_modules/vitest/vitest.mjs run`。

### 5.2 手工验证

1. 启动应用，用测试 QQ 往白名单群发一条消息。
2. 打开 `%APPDATA%/<app>/channels/history/`，找到对应 `channel_qq_<hash>.jsonl`。
3. 确认最后一行形如：

```json
{"id":"msg_1758681234567_a3f9k2","role":"user","content":"...","at":"2026-09-24T...","speakerId":"10001","speakerName":"小明","isBot":false,"triggered":true}
```

4. 再发一条旁听消息（不 @ 昔涟），确认 `triggered: false` 且**同样带 id**。

### 5.3 通过标准

- 新增 15 条用例全绿，既有用例无回归（或仅有预期的 `toEqual` 更新）
- 两个 tsconfig 编译 0 错误
- 手工观察：新消息行均带 `id`，老行仍无 `id` 且读取正常

---

## 6. 风险与回滚

| 风险 | 评估 | 缓解 |
|---|---|---|
| `HistoryEntryMeta` 漏改，id 可被调用方伪造 | 中（不报错） | §4.3 编译期防线 |
| 拆 try 改变了截断失败的行为 | 低 | 行为等价（原来也是 warn 后继续），只是返回值更准确 |
| 某处 `toEqual` 整对象断言变红 | 低 | §4.4 已列出排查清单 |
| 下游把返回值当 `void` 用 | 极低 | TS 结构类型，忽略返回值合法 |
| ~~绑定分支漏 return~~ | ✅ | P0 已删除该分支 |

**回滚**：P1 是纯增量，`git revert` 即可。

- 回滚后磁盘上已写入的行**仍带 `id`**（文件是追加的）。
- 旧代码读这些行**不会出问题**：`JSON.parse` 得到多余字段，`normalizeEntry` 原样返回，消费方只取已知字段。
- 因此 P1 可以安全地先发布、观察、再决定是否继续 P2。

---

## 7. 为 P2 预留的接口

P1 完成后，P2 的输入已经就位：

```ts
// dispatcher.ts:218 —— P2 要在这里接住
const userEntry = await this.deps.context.appendIncomingContext(msg, context);
// userEntry?.id  ── 这就是将来 L2.sourceMessageIds 里的那个值
```

P2 需要新增的透传链（**不在 P1 范围**）：

```
dispatcher.processIncoming(userEntry.id)
  └─ deps.buildAndRunAgent(msg, sessionId, priorMessages, userMessageId)
       └─ bootstrap.ts buildAndRunAgent → agentRuntime.buildOptions({ ..., userMessageId })
            └─ AgentRunInput / AgentRunFinishedContext
                 └─ onRunFinished(result, latestUserText, context)
                      └─ onAgentRunFinished(..., finishedContext)
                           └─ deps.scheduleMemoryWrite(userInput, reply, conversationId, userMessageId)
                                └─ MemoryScheduler.scheduleMemoryWrite（存入 turn 桶）
```

**同时 P2 还要在这里取 `speakerId`**：群聊的说话人已经在 `msg.senderId`（dispatcher 手上有），无需从 transcript 反查 —— 这与「私聊 transcript 不写 speakerId」（总概览 §4.3）的缺口正好互补：**P2 直接从 `IncomingMessage` 取，不从文件反查**。

---

## 8. 改动文件清单

| 文件 | 类型 | 说明 |
|---|---|---|
| `src/main/channels/history-log.ts` | 改 | 类型 + `createMessageId` + `appendHistory` 返回值 |
| `src/main/channels/channel-context.ts` | 改 | 两个 append 方法返回值贯通 |
| `src/main/channels/history-log.test.ts` | 改 | 新增用例 1–10 |
| `src/main/channels/channel-context.test.ts` | 改 | 新增用例 11–15 |
| `src/main/channels/proactive-delivery.ts` | 改（清单外） | 只动注入点的**类型**，零运行时影响，见 §9.3 |
| （其余调用方） | 不改 | 返回值可安全忽略 |

---

## 9. 施工记录（已落地）

> **施工环境**：源码开发模式，工作区含 P0 全部改动（未提交）。行号以施工当刻为准，**以符号名为准**。

### 9.1 逐条落地情况

§3.1 / §3.2 的 8 处改动全部按原文落地，无删减：

| 改动 | 位置 | 结果 |
|---|---|---|
| 1 `createMessageId(now = Date.now())` | `history-log.ts` | ✅ 导出，格式 `msg_<ts>_<rand6>`，未做 `padEnd`（与既有 id 风格一致） |
| 2 类型三件套 | `history-log.ts` | ✅ `HistoryEntry.id?: string` / `PersistedHistoryEntry` / `HistoryEntryMeta = Omit<HistoryEntry, "id" \| ...>` |
| 3 `appendHistory` 返回对象 | `history-log.ts` | ✅ 一次 try 拆成两次：①落盘失败 → `null`；②截断/归档失败 → 仍返回 `entry` |
| 4 文件头注释 | `history-log.ts` | ✅ 新增「消息 id (Phase 3 P1 引入)」段落，写明用途与老数据差异 |
| 5 option 返回类型放宽 | `channel-context.ts` | ✅（比原文多一个 `\| undefined`，见 §9.3） |
| 6 `ChannelContext` 两个方法返回值 | `channel-context.ts` | ✅ |
| 7 `appendIncomingContext` | `channel-context.ts` | ✅ 直筒子 + `?? null`，保留吞异常语义 |
| 8 `appendAssistantContext` | `channel-context.ts` | ✅ 同上 |

§3.3 的四个调用方逐一复核，**均未改动**（`bootstrap.ts` / `napcat-adapter.ts` / `proactive-delivery.ts` 调用行 / `dispatcher.ts`）：TypeScript 允许忽略返回值，赋值兼容。

### 9.2 验证结果

**基线**（P1 施工前，同一工作区）：`vitest run` → 484 文件 / **4296 passed / 1 skipped**，全绿。
（与总概览 §3.4 记录的 P0 后基线完全一致，说明期间没有其他改动混入。）

**施工后**：

```powershell
node node_modules/vitest/vitest.mjs run   # 484 文件 / 4318 passed / 1 skipped，exit 0
npx.cmd tsc -p tsconfig.main.json         # 0 错误
npx.cmd tsc -p tsconfig.preload.json      # 0 错误
npx.cmd vite build                        # ✓ built in 38.69s
```

- **+22 条用例**（`history-log.test.ts` 35→50 = +15；`channel-context.test.ts` 13→20 = +7），**文件数不变**（没有新增/删除测试文件），**零回归**。
- 没有任何 `toEqual` 整对象断言变红 —— §4.4 预判的破坏**没有发生**。
- 产物复核：`dist/main/main/channels/history-log.js` 含 `createMessageId`，`dist/main/main/channels/bootstrap.js` 为 `appendChannelHistory: history_log_1.appendHistory`（即 P1 代码已进入 dev 模式产物）。

### 9.3 与原方案的偏离（4 处，均为清单外发现）

| # | 偏离 | 为什么清单会漏 / 不改会怎样 | 实际处置 |
|---|---|---|---|
| 1 | **§4.3 的「编译期防线」在今天的流水线里不会真的报错** | `tsconfig.main.json` 显式 `exclude: ["src/main/**/*.test.ts"]`，仓库**没有**覆盖测试的 tsconfig；`vitest` 走 esbuild、`vite build` 走 esbuild，**都不做类型检查**。所以 `const mustBeFalse: HasId = false` 即使 `HasId` 变成 `true` 也无人报警 —— 这条防线是"纸做的" | ✅ 断言仍保留（日后加 test tsconfig / 开 vitest typecheck 即刻生效），但**另加一条运行时用例**锁住同一件事：往 meta 里塞 `id`，`appendHistory` 只挑白名单字段，生成自己的 id。已用一次性探针实测确认类型防线本身有效：`{ id }` 赋给 `HistoryEntryMeta` 报 `TS2353`，`HasId` 为 `false` |
| 2 | `CreateChannelContextOptions.appendChannelHistory` 的返回类型补了 `\| undefined` | 原文 §3.2 改动 7 自己写了「`?? null` 是必要的：注入的，测试/未来实现可能返回 `undefined`」，但改动 5 的类型**不含** `undefined` —— 类型与实现自相矛盾，且"返回 undefined"这条用例写不出来（`Mock<() => undefined>` 不可赋值） | 类型改为 `PersistedHistoryEntry \| null \| undefined \| Promise<...>`。对所有真实调用方**赋值兼容性不变**，只是让 `?? null` 有据可依 |
| 3 | `proactive-delivery.ts` 的 `appendHistory?: typeof appendChannelHistory` 改成显式函数类型（`... \| void`） | 该字段用 `typeof` 引用了真实函数类型，返回值一变它就跟着变；`proactive-delivery.test.ts:192` 的 void 桩函数（只改 `committedText`）从此**不再可赋值**。§3.3 声称"零改动"，这一处是例外 | 只改**类型**：`(...args: Parameters<...>) => ReturnType<...> \| void`。运行时零影响，测试桩保持原样 |
| 4 | 新增用例数 15 → **22** | §4 列了 1–15（含 §4.3 可选），实际补了更多边界：落盘 IO 失败返回 `null`、新旧记录混排、旧前缀归一化不吞 id、meta 伪造 id 被忽略、§0.3 验收标准的自动化版本 | 见 9.4 |

> 偏离 1 是**最重要的发现**：本仓库现行流水线（vitest + 两个 tsconfig + vite build）对**测试文件**不做类型检查，
> 因此"在测试里写类型断言当防线"这个模式在本项目里**普遍不可靠**。后续 P2/P3 若要立类型防线，要么新增覆盖测试的
> tsconfig，要么用运行时断言表达。

### 9.4 新增用例清单（22 条）

`history-log.test.ts` → 新 `describe("消息身份 id (Phase 3 P1)")`，15 条：

| # | 用例 | 对应用户文档条目 |
|---|---|---|
| 1 | `createMessageId` 格式 `msg_<ts>_<rand6>`（含传入 `now`） | §4.1 #1 |
| 2 | 连续 1000 次无重复 | §4.1 #2 |
| 3 | `appendHistory` 返回带 id 的落盘对象 | §4.1 #3 |
| 4 | 返回值与落盘内容同一个 id | §4.1 #4 |
| 5 | 两次调用 id 不同（含落盘两行） | §4.1 #5 |
| 6 | 空 sessionId / 空 content → `null` 且**不产生任何文件** | §4.1 #6 |
| 7 | **落盘 IO 失败 → `null`**（把 history 目录占成文件触发 EEXIST） | §2.4 失败语义 |
| 8 | 老格式行（无 id）读回 `id === undefined` 且不抛错 | §4.1 #7 |
| 9 | **新旧混排**：老行无 id、新行有 id | §2.5 |
| 10 | **归档保留 id**（写 250 条，抽查归档首条 id 与返回值一致、无重复） | §4.1 #8 |
| 11 | **迁移保留 id**（`migrateHistory` 后新旧文件 id 完全一致） | §4.1 #9 |
| 12 | **旧前缀归一化不吞 id**（带 id 的 legacy 前缀行） | §2.5 |
| 13 | **meta 里混进 id 不会被采纳**（运行时防线） | §2.3（补强） |
| 14 | `HistoryEntryMeta` 不含 `id`（类型层断言，见 §9.3 偏离 1） | §4.1 #10 / §4.3 |
| 15 | **§0.3 验收标准的自动化版本**：用**真实** `appendHistory` + 真实 `createChannelContext`（接线与 `bootstrap.ts` 一致，不 mock），断言 `appendIncomingContext` 返回的 id == 落盘最后一行的 id | §0.3 |

`channel-context.test.ts` → 新 `describe("历史写入返回值 (Phase 3 P1)")`，7 条：

| # | 用例 | 对应用户文档条目 |
|---|---|---|
| 16 | `appendIncomingContext` 原样返回（`toBe` 同一对象），且入参未被改动 | §4.2 #11 |
| 17 | 实现返回 `null` → 方法返回 `null` | §4.2 #12 |
| 18 | 实现返回 `undefined` → 方法返回 `null`（`?? null`） | §4.2 #12 |
| 19 | 实现**同步抛错** → 返回 `null`、不冒泡，且打 warn | §4.2 #13 |
| 20 | 实现**异步 reject** → 同样被吞掉返回 `null` | §4.2 #13（补强） |
| 21 | `appendAssistantContext` 原样返回落盘对象 | §4.2 #14 |
| 22 | `appendAssistantContext` 的 `null` / `undefined` / 抛错都归一成 `null` | §4.2 #14 |

### 9.5 数据与行为影响

- **行为变化：无。** 只多写一个字段、只多返回一个值，没有调用方消费返回值（P2 才消费）。
- **磁盘变化：新写入的行多一个 `id`。** 老行原样保留，读取端 `entry.id === undefined`。
- **回滚安全性已验证**：`id` 是增量字段，旧代码 `JSON.parse` 出来只是多一个未知字段，`normalizeEntry` 原样透传，消费方只取已知字段 —— 不会崩。

### 9.6 手工验证（§5.2）—— ✅ 已通过

**环境**：源码开发模式（`dist/main` + `dist/preload` 用 P1 代码重建），真实 QQ + NapCat，
群 `543627098`（白名单内），userData = `%APPDATA%\live2d-cyrene`。

**结果**：新建的 `channels/history/channel_qq_20b39082aa808213.jsonl` 三行**全部带 id**：

```json
{"id":"msg_1790314743531_61zvme","role":"user","content":"p1验收一","at":"2026-09-25T05:39:03.531Z","speakerId":"2914636187","speakerName":"AIKIEB","isBot":false,"triggered":true}
{"id":"msg_1790314761292_zu3u8t","role":"assistant","content":"BeiKia，……","at":"2026-09-25T05:39:21.292Z","isBot":true}
{"id":"msg_1790314771133_urdv97","role":"user","content":"p1验收二 大家好啊","at":"2026-09-25T05:39:31.133Z","speakerId":"2914636187","speakerName":"AIKIEB","isBot":false,"triggered":false}
```

| §5.2 步骤 | 结果 | 证据 |
|---|---|---|
| 1 起应用、发群消息 | ✅ | `channels/log.jsonl` 有 `incoming` / `outgoing` 两条（`chatId: 543627098`） |
| 2 找到 transcript | ✅ | 新群文件 `channel_qq_20b39082aa808213.jsonl`（= `qq:543627098` 的 sha256 前 16 位） |
| 3 @ 触发行带 id | ✅ | 第 1 行 `triggered: true` + `id`；assistant 回复行（第 2 行）**也有 id** |
| 4 旁听行（不 @）同样带 id | ✅ | 第 3 行 `triggered: false` + `id`，且三条 id 互不重复 |
| 5 老行仍无 id 且读取正常 | ⚠️ **无法在真实数据上复核**（见下），由单元测试覆盖 | 用例 8「老格式行读回 `id === undefined`」、用例 9「新旧混排」 |

三条 id 全局唯一（跨文件去重后仍为 3 条），格式全部匹配 `msg_<ts>_<rand6>`。

#### ⚠️ 验证期间发现：老 transcript 被「记忆格式升级」闸门自动清空（与 P1 无关）

**发生了什么**：验证前 `channels/history/` 有两个老文件（`channel_qq_9cdd5e32b57efa9e.jsonl` 54 行 = 群
`1055799748`、`channel_qq_afc083f8a0114240.jsonl` 2 行 = 私聊 `2914636187`，均无 id）。
应用启动后这两个文件**消失了**。

**原因（有审计证据）**：`%APPDATA%\live2d-cyrene\memory-trace.log` 头两行 ——

```json
{"ts":1790314669247,"op":"memory.deleteAll","layer":"store","status":"ok",
 "details":{"deleted":["memory.json","memory-trace.log","relationship-log.json","moments-state.json","proactive-state.json","channels/history/"],"failed":[]}}
{"ts":1790314669248,"op":"migration.zoneUpgrade","layer":"migration","status":"ok",
 "details":{"from":2,"to":3,"deleted":[...同上...]}}
```

即 Phase 2 「区块」版引入的启动期 schema 闸门 `runMemorySchemaGate()`
（`src/main/memory/memory-schema-gate.ts`）发现 `memory.json` 还是 `schemaVersion: 2`，
弹框「旧记忆无法自动迁移，将被清空」，用户点「清空记忆并继续」后调用了 `deleteAllMemory()`；
而 `MEMORY_TARGETS`（`src/main/memory/memory-deletion.ts:15-31`）**显式包含
`channels/history/`（热层）与 `channels/archive/`（温层）**，于是老 transcript 一并被删。

**结论与影响**：

1. **不是 P1 引入的回归** —— P1 只加字段，没有任何删除路径；闸门与 `deleteAllMemory` 都是既有代码。
2. **代价**：§5.2 的第 5 条（"老行仍无 id 且读取正常"）**失去了真实数据样本**，只能在单元测试里验证。
   首次验证前若想保住这个样本，应先把 `channels/` 备份出去。
3. **⚠️ 对 P3 是个必须处理的交集**：`deleteAllMemory` 会删 transcript，而 P3 的「完全擦除某人」是
   **按 `speakerId` 逐行过滤重写** transcript（保留别人的话）。两者语义不同、作用域重叠 ——
   P3 设计时要明确：记忆控制台的「删除」入口与「删除全部记忆」按钮**不能共用一套实现**，
   否则「删一个人」会顺手动到别人的 transcript。
4. 这次闸门是**用户确认**后才删的（弹框第二项是"退出应用"），不是静默删除；但**升级提示里没有
   提到"渠道聊天记录也会一起没"**，文案与 `MEMORY_TARGETS` 的实际范围不一致 —— 可另立议题修文案。

