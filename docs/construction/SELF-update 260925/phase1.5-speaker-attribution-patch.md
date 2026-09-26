# Phase 1.5 补丁蓝图：说话人归属修复 + 旁听/对话分流

> **前置**：`docs/construction/phase1-group-context-observe.md`（已完成，当前在 working tree 未提交）
> **本补丁的目的**：把 Phase 1 想要的「**LLM 知道谁在请求 + 只读请求方与最近 x 条旁听**」真正落地。
> **不涉及**：区块系统、记忆 scope（那些是 Phase 2）。

---

## 0. 验收标准（本补丁完成后必须满足）

| # | 标准 | 可验证方式 |
|---|---|---|
| V1 | 群聊**滑动窗口**里的历史消息带说话人 | 日志/prompt 里出现 `[小明]: 大家好` 而非裸 `大家好` |
| V2 | 群聊**旁听块**只含未触发昔涟的群友发言 | `【群聊近期上下文】` 里不出现被判为触发的那条 |
| V3 | 同一批消息**不再重复注入** | 一条群友发言要么在滑动窗口、要么在旁听块，不会两边都有 |
| V4 | 私聊行为**完全不变** | 私聊 history 读取结果与补丁前逐字节一致 |
| V5 | 旧格式 history 仍能正确解析出说话人 | 老 jsonl（含 `[群聊发送者：…]` 前缀）读取后 `speakerName/speakerId` 正确 |
| V6 | 热层截断时，被丢弃的原文进入温层归档（按月分文件） | 写 250 条后 `channels/archive/<sid>/` 出现归档文件，含 `msg0` |
| V7 | 归档不改变热层行为 | 既有断言 `msg50`/`msg249` 仍成立；归档不进 prompt |
| V8 | 全量测试 + 类型检查通过 | `vitest run` 全绿；两个 tsconfig 零错误 |

---

## 1. 缺陷清单（含证据）

### 缺陷 D1：Phase 1 的 `normalizeEntry` 把说话人从正文里剥掉了，滑动窗口因此丢人

**证据**（`git diff HEAD -- src/main/channels/history-log.ts`）：

```diff
-          parsed.push(e);
+          parsed.push(normalizeEntry(e));
```

**补丁前**：`loadRecentHistory` 返回的 `content` 是 `[群聊发送者：小明 (10001)]\n大家好` → 模型在滑动窗口里**能看到**说话人。
**Phase 1 后**：`normalizeEntry` 把前缀提取成 `speakerName` 并**从 content 里删掉** → `content = "大家好"`。
而 `bootstrap.ts:177` 的映射**只取 role + content**：

```ts
const historyMessages = (priorMessages ?? [])
  .map((m) => ({ role: ..., content: m.content }));   // ← speakerName/speakerId 被丢弃
```

**结果**：群聊滑动窗口里所有历史消息都成了**没有说话人的裸 user 消息**，看起来像请求方说的。多人群聊会认错人。**这是 Phase 1 引入的回归。**

### 缺陷 D2：`LEGACY_SPEAKER_PREFIX` 与真实写入格式不匹配

`history-log.ts:55`：

```ts
const LEGACY_SPEAKER_PREFIX = /^\[群聊发送者：([^\]]+)\](\(@昔涟\)|\(触发词\))?\n?(.*)/s;
```

但 `channel-context.ts:92` 的 `formatChannelUserText` **从不产生** `(@昔涟)` / `(触发词)`。真实输出是：

```
[群聊发送者：小明 (10001)]
你好                                          ← @ 触发
[群聊发送者：小明 (10001)]
[本条消息命中触发关键词（未 @ 你），按约定需要你回复]
你好                                          ← 触发词触发
```

后果：
- 捕获组 2 永不命中 → `triggered` 恒为 `false`
- `speakerName` 提取出 **`小明 (10001)`**（把 QQ 号一起吞进名字）→ 与旁听记录的 `小明` 格式不一致
- `history-log.test.ts:199` 的测试数据 `[群聊发送者：王五](@昔涟)\n在吗` 是一个**生产代码从不产生**的格式（测试绿了但路径是死的）

### 缺陷 D3：旁听内容与滑动窗口重复注入

```
滑动窗口   = loadRecentHistory(sessionId, 16)      ← 同一个 jsonl
旁听块     = buildGroupContextBlock(sessionId, 10) ← 同一个 jsonl
```

同一批群消息在 prompt 里出现两次。且请求方自己那句话出现两次（旁听块 + `agentUserText`）。

### 缺陷 D4：`triggered` 在真实链路上没落盘

`channel-context.ts:171` 写群聊历史时没传 meta：

```ts
await options.appendChannelHistory(context.sessionId, "user", modelText);
//                                                     ↑ 第 4 个参数缺失
```

所以群聊正式轮**没有** `speakerId/speakerName/triggered` 结构化字段，只能靠 D2 那个失效的正则去猜。

---

## 2. 设计决策

### 2.1 「只读请求方 + 最近 x 条旁听」的精确定义

```
请求方        = 当前轮 user 消息（agentUserText，自带 [群聊发送者：昵称 (QQ号)]）
              + 滑动窗口里的正式对话轮（群聊时 = 被叫起来的轮次 + 昔涟的回复）
最近 x 条旁听 = 旁听块（群聊时 = 未被叫起来的群友发言，默认 10 条，Phase 2 可配）
```

**两类消息严格互斥，不重复**：

| 条目 | `triggered` | 归属 |
|---|---|---|
| 群友闲聊（未 @、未命中触发词） | `false` | 旁听块 |
| 群友 @昔涟 / 命中触发词 | `true` 或 `undefined`(旧) | 滑动窗口 |
| 昔涟的回复（assistant） | 任意 | 滑动窗口 |
| 私聊消息 | `undefined` | 滑动窗口（私聊无旁听概念） |

### 2.2 过滤谓词的关键设计：用 `!== false` 而不是 `=== true`

```ts
conversationOnly : role === "assistant" || triggered !== false
observedOnly     : role === "user"      && triggered === false
```

**为什么**：旧记录和私聊记录的 `triggered` 是 `undefined`。若用 `=== true`，这些记录会被**全部排除**，导致私聊滑动窗口清空、老群记录消失。
用 `!== false` 后：`undefined`（旧/私聊）和 `true`（新触发轮）都进滑动窗口，只有明确标记 `false`（旁听）的进旁听块。**向后兼容零成本。**

### 2.3 先过滤再截断

```ts
return filterHistory(parsed, query).slice(-limit);
```

必须**先过滤再截断**，才能保证"最后 N 条该类消息"。若先截断再过滤，一个刷屏的群可能让滑动窗口只捞到 2 条正式轮。

> 注意：这是对现有 `loadRecentHistory` 语义的**有意变更**（原来是纯 `slice(-limit)`）。无 query 参数时行为不变。

---

## 3. 施工任务

### 任务 T1：修复 `normalizeEntry`（结构化解析）

**文件**：`src/main/channels/history-log.ts`

**修改点 1**：替换正则（line 50-55）

```ts
// 修改前
/**
 * 旧格式的 content 前缀: `[群聊发送者：张三](@昔涟)\n正文`.
 * 结构化改造前, 说话人信息是硬拼进正文的; 读取时提取到 speakerName / triggered,
 * 把正文还原成纯内容. 只在没有 speakerId 的旧记录上生效.
 */
const LEGACY_SPEAKER_PREFIX = /^\[群聊发送者：([^\]]+)\](\(@昔涟\)|\(触发词\))?\n?(.*)/s;

// 修改后
/**
 * 旧格式 content 前缀解析。
 *
 * 真实写入格式（channel-context.formatChannelUserText）:
 *   @ 触发        : `[群聊发送者：小明 (10001)]\n你好`
 *   触发词触发    : `[群聊发送者：小明 (10001)]\n[本条消息命中触发关键词（未 @ 你），按约定需要你回复]\n你好`
 *   带引用        : `[群聊发送者：小明 (10001)]\n引用 小红：前一条\n你好`
 *
 * 另兼容历史遗留标记 `(@昔涟)` / `(触发词)`（当前生产代码不产生，但旧数据可能有）。
 * 只负责"剥前缀"，不负责拆名字里的 QQ 号——拆号在 parseLegacySender 里做。
 */
const LEGACY_SPEAKER_PREFIX =
  /^\[群聊发送者：([^\]\n]+)\]\n?(?:\((?:@昔涟|触发词)\)\n?)?(?:\[本条消息命中触发关键词[^\]]*\]\n?)?/;

/** 把 `小明 (10001)` 拆成 { name: "小明", id: "10001" }；拆不开时 name = 原串。 */
function parseLegacySender(raw: string): { name: string; id?: string } {
  const m = raw.match(/^(.*?)\s*\((\d+)\)$/);
  if (m) return { name: m[1].trim(), id: m[2] };
  return { name: raw.trim() };
}
```

**修改点 2**：替换 `normalizeEntry`（line 57-69）

```ts
// 修改前
function normalizeEntry(entry: HistoryEntry): HistoryEntry {
  const normalized: HistoryEntry = { ...entry };
  if (!normalized.speakerId) {
    const match = normalized.content.match(LEGACY_SPEAKER_PREFIX);
    if (match) {
      normalized.speakerName = normalized.speakerName ?? match[1];
      normalized.triggered = normalized.triggered ?? Boolean(match[2]);
      normalized.content = match[3] || normalized.content;
    }
  }
  return normalized;
}

// 修改后
function normalizeEntry(entry: HistoryEntry): HistoryEntry {
  // 新格式（写入时已结构化）不需要解析正文前缀。
  if (entry.speakerId) return { ...entry };

  const match = entry.content.match(LEGACY_SPEAKER_PREFIX);
  if (!match) return { ...entry };

  const sender = parseLegacySender(match[1]);
  const normalized: HistoryEntry = { ...entry };
  normalized.speakerName = normalized.speakerName ?? sender.name;
  if (sender.id) normalized.speakerId = sender.id;
  // 命中"触发关键词提示行"才判定为触发；@ 触发的旧记录没有标记，保持 undefined。
  const hadKeywordNote = /\[本条消息命中触发关键词/.test(match[0]);
  normalized.triggered = normalized.triggered ?? (hadKeywordNote ? true : undefined);
  normalized.content = entry.content.slice(match[0].length) || entry.content;
  return normalized;
}
```

> **为什么 `triggered` 对旧 @ 记录保持 `undefined`**：真实格式里 @ 触发不带任何标记，无法从正文推断。用 2.2 的 `!== false` 谓词，`undefined` 会被正确归入滑动窗口，**无需推断**。

**回归确认**：`history-log.test.ts:199` 的 fixture `[群聊发送者：王五](@昔涟)\n在吗` 仍能被解析 → `speakerName="王五"`、`triggered=true`、`content="在吗"`。**该测试保持通过。**

---

### 任务 T2：`loadRecentHistory` 支持按类过滤

**文件**：`src/main/channels/history-log.ts`

**修改点 1**：新增类型（放在 `HistoryEntryMeta` 定义之后）

```ts
/** 历史读取的过滤条件。两个开关互斥，同时为真时 observedOnly 优先。 */
export interface HistoryQuery {
  /**
   * 只取正式对话轮：assistant，或 triggered !== false 的 user。
   * 群聊滑动窗口用它，避免与【群聊近期上下文】块重复注入同一批消息。
   * 私聊消息的 triggered 为 undefined，因此不受影响（全部保留）。
   */
  conversationOnly?: boolean;
  /** 只取旁听消息：role === "user" 且 triggered === false。 */
  observedOnly?: boolean;
}
```

**修改点 2**：新增过滤 helper（放在 `normalizeEntry` 之后）

```ts
function filterHistory(entries: HistoryEntry[], query?: HistoryQuery): HistoryEntry[] {
  if (!query) return entries;
  if (query.observedOnly) {
    return entries.filter((e) => e.role === "user" && e.triggered === false);
  }
  if (query.conversationOnly) {
    return entries.filter((e) => e.role === "assistant" || e.triggered !== false);
  }
  return entries;
}
```

**修改点 3**：`loadRecentHistory` 签名与返回

```ts
// 修改前
export function loadRecentHistory(sessionId: string, limit: number): HistoryEntry[] {
  // ...
  const sliced = parsed.slice(-limit);
  return sliced;
}

// 修改后
export function loadRecentHistory(
  sessionId: string,
  limit: number,
  query?: HistoryQuery,
): HistoryEntry[] {
  // ...解析逻辑不变（含 normalizeEntry）
  // 先过滤再截断：保证拿到"最后 N 条该类消息"（刷屏群不会挤掉正式轮）
  return filterHistory(parsed, query).slice(-limit);
}
```

**注意**：`reloadAllHistory` 内部调用 `loadRecentHistory(sid, MAX_FILE_LINES)` —— 不传 query，行为不变。

---

### 任务 T3：`buildGroupContextBlock` 只看旁听

**文件**：`src/main/channels/history-log.ts`

```ts
// 修改前
export function buildGroupContextBlock(sessionId: string, limit = 10): string | null {
  const entries = loadRecentHistory(sessionId, limit);
  if (entries.length === 0) return null;

  const lines = entries.map((entry) => {
    if (entry.role === "assistant") {
      return `[昔涟]: ${entry.content}`;
    }
    const speaker = entry.speakerName || entry.speakerId || "用户";
    const triggeredMark = entry.triggered ? " @昔涟" : "";
    return `[${speaker}${triggeredMark}]: ${entry.content}`;
  });

  return [
    "【群聊近期上下文】",
    `以下是本群最近 ${entries.length} 条消息，供你理解当前话题的来龙去脉：`,
    ...lines,
  ].join("\n");
}

// 修改后
export function buildGroupContextBlock(sessionId: string, limit = 10): string | null {
  // 只取旁听消息（没在叫昔涟的群友发言）。
  // 被叫起来的轮次 + 昔涟的回复走滑动窗口，不在这里重复出现。
  const entries = loadRecentHistory(sessionId, limit, { observedOnly: true });
  if (entries.length === 0) return null;

  const lines = entries.map((entry) => {
    // 防御分支：observedOnly 已排除 assistant，保留以防未来复用本函数。
    if (entry.role === "assistant") return `[昔涟]: ${entry.content}`;
    const speaker = entry.speakerName || entry.speakerId || "用户";
    return `[${speaker}]: ${entry.content}`;
  });

  return [
    "【群聊近期上下文】",
    `以下是你没被叫到时，群里最近的 ${entries.length} 条发言，供你理解当前话题的来龙去脉：`,
    ...lines,
  ].join("\n");
}
```

---

### 任务 T4：`ChatMessage` 暴露说话人字段

**文件**：`src/main/channels/channel-context.ts`

```ts
// 修改前（line 7-11）
export interface ChatMessage {
  role: "user" | "assistant" | "system" | "tool";
  content?: string;
}

// 修改后
export interface ChatMessage {
  role: "user" | "assistant" | "system" | "tool";
  content?: string;
  /** 群聊说话人昵称（仅渠道历史填充；私聊与绑定会话历史为空）。 */
  speakerName?: string;
  /** 群聊说话人平台 ID（QQ 号等）。 */
  speakerId?: string;
  /** 该条是否触发了昔涟回复。群聊旁听为 false；旧记录/私聊可能缺失。 */
  triggered?: boolean;
}
```

**说明**：`bootstrap.ts` 的 `loadRecentChannelHistory` 实际返回的是 `HistoryEntry[]`（结构上兼容 `ChatMessage[]`，多出的字段在运行时存在）。补齐类型后，下游映射即可安全读取。

> **不需要**改 `CreateChannelContextOptions.appendChannelHistory` 的签名（任务 T6 才动）。

---

### 任务 T5：修复滑动窗口映射 + 传 conversationOnly

**文件**：`src/main/channels/bootstrap.ts`

**修改点 1**：`loadRecentChannelHistory` 传过滤（line 98-101）

```ts
// 修改前
const loadRecentChannelHistory = async (sessionId: string, limit: number) => {
  const { loadRecentHistory } = await import("./history-log");
  return loadRecentHistory(sessionId, limit);
};

// 修改后
const loadRecentChannelHistory = async (sessionId: string, limit: number) => {
  const { loadRecentHistory } = await import("./history-log");
  // 滑动窗口只放正式对话轮；未触发昔涟的群友发言交给
  // buildAlwaysOnContext 的【群聊近期上下文】块，避免同一批消息注入两遍。
  return loadRecentHistory(sessionId, limit, { conversationOnly: true });
};
```

**修改点 2**：`buildAndRunAgent` 里的映射（line 177-182）

```ts
// 修改前
const historyMessages = (priorMessages ?? [])
  .filter((m) => typeof m.content === "string" && m.content.trim().length > 0)
  .map((m) => ({
    role: m.role as "user" | "assistant" | "system",
    content: m.content,
  }));

// 修改后
// 群聊历史在 history-log 里已被剥掉 `[群聊发送者：…]` 前缀（结构化到 speakerName），
// 这里必须把说话人补回正文，否则多人群聊里"谁说的"会丢失，全部看起来像请求方说的。
const historyMessages = (priorMessages ?? [])
  .filter((m) => typeof m.content === "string" && m.content.trim().length > 0)
  .map((m) => {
    const speaker = m.speakerName || m.speakerId;
    return {
      role: m.role as "user" | "assistant" | "system",
      content: speaker ? `[${speaker}]: ${m.content}` : m.content,
    };
  });
```

> **格式对齐**：这里渲染成 `[小明]: 大家好`，与旁听块的 `[张三]: xxx` **格式一致**，模型看到的两种上下文块风格统一。

---

### 任务 T6：写入侧结构化 meta（**已确认要做**，改良版）

> **为什么要做**：Phase 2 需要按"是谁说的"归属记忆，结构化字段比正文前缀可靠得多；
> 且能让触发轮与旁听轮的数据格式统一。
>
> **核心手法：`stripSpeakerPrefix`**——只砍掉正文里的「发送者前缀」那一行，
> **保留**「引用 …」与「触发提示」两行。这样既拿到结构化字段、又不会双前缀、还不丢引用。
> ⚠️ **不要写 `msg.text`**（那会把引用行一起丢掉）；**不要写 `modelText` 整段**（那会双前缀）。

**文件 1**：`src/main/channels/channel-context.ts`

扩展选项签名（line 62-66）：

```ts
// 修改前
appendChannelHistory: (
  sessionId: string,
  role: "user" | "assistant",
  content: string,
) => void | Promise<void>;

// 修改后
appendChannelHistory: (
  sessionId: string,
  role: "user" | "assistant",
  content: string,
  meta?: { speakerId?: string; speakerName?: string; isBot?: boolean; triggered?: boolean },
) => void | Promise<void>;
```

**文件 2**：同文件新增 helper（放在 `formatChannelUserText` 定义之后）

```ts
/**
 * 群聊正文去掉「发送者前缀」那一行，保留其余内容（引用行 / 触发提示行）。
 *
 * 为什么需要它：结构化字段（speakerId 等）会跟正文里的 `[群聊发送者：…]` 前缀重复表达同一件事，
 * 且 speakerId 存在会让 history-log 的 normalizeEntry 跳过剥前缀，再叠上滑动窗口映射的前缀
 * 就会变成 `[小明]: [群聊发送者：小明 (10001)]\n…`。所以写入时就要把前缀砍掉。
 *
 * 只砍前缀、不砍引用：`引用 小红：…` 与 `[本条消息命中触发关键词…]` 是正文语义，必须保留。
 */
function stripSpeakerPrefix(text: string): string {
  return text.replace(/^\[群聊发送者：[^\]\n]+\]\n?/, "");
}
```

**文件 3**：同文件 `appendIncomingContext`（line 168-174）

```ts
// 修改前
async appendIncomingContext(msg, context): Promise<void> {
  const modelText = formatChannelUserText(msg);
  try {
    await options.appendChannelHistory(context.sessionId, "user", modelText);
  } catch (err) { /* ... */ }

// 修改后
async appendIncomingContext(msg, context): Promise<void> {
  const modelText = formatChannelUserText(msg);
  const isGroup = msg.chatType === "group";
  try {
    // ⚠️ 群聊写 stripSpeakerPrefix(modelText)：砍掉发送者前缀、保留引用行。
    //    写 msg.text 会丢引用；写 modelText 整段会双前缀。两者都不要。
    await options.appendChannelHistory(
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
    );
  } catch (err) { /* ... */ }
```

**文件 4**：同文件 `appendAssistantContext`（line 197-202）

```ts
// 修改前
await options.appendChannelHistory(
  context.sessionId,
  "assistant",
  prepared.assistantText,
);

// 修改后
await options.appendChannelHistory(
  context.sessionId,
  "assistant",
  prepared.assistantText,
  { isBot: true },
);
```

**文件 5**：`src/main/channels/proactive-delivery.ts:111`

```ts
// 修改前
(input.appendHistory ?? appendChannelHistory)(recipient.sessionId, "assistant", deliveredText);

// 修改后
(input.appendHistory ?? appendChannelHistory)(recipient.sessionId, "assistant", deliveredText, { isBot: true });
```

**注意事项（务必遵守）**：
1. **群聊写 `stripSpeakerPrefix(modelText)`**：只砍发送者前缀，**保留引用行**。
   - 写 `msg.text` → 引用行丢失 ❌
   - 写 `modelText` 整段 → 双前缀（`[小明]: [群聊发送者：小明 (10001)]\n…`）❌
2. **私聊保持写 `modelText`**（== `msg.text`，实际无差别），且**不传 meta** —— 保证私聊零变化。
3. **引用行不会丢**：`stripSpeakerPrefix` 只砍 `[群聊发送者：…]` 那一行，`引用 小红：…` 与触发提示行都保留在 content 里。
   - 若你希望连**触发提示行**（`[本条消息命中触发关键词…]`）也从历史里去掉（它只是当轮的引导语，回放时属噪声），
     把 helper 的正则扩成同时匹配该行即可，属可选项：
     ```ts
     text.replace(/^\[群聊发送者：[^\]\n]+\]\n?(?:\[本条消息命中触发关键词[^\]]*\]\n?)?/, "")
     ```
4. **加一条单测锁死**：群聊写入后，`content` 里 **不含** `[群聊发送者：`，且含 `引用 ` 时该行仍在。

### 任务 T7：温层归档（超窗口的原文不丢）

> **背景**：热层 `channels/history/<sid>.jsonl` 上限 200 行，超出**直接丢弃最老的**。
> 繁忙的群 200 行可能只覆盖几十分钟，A 的问题会因为刷屏滚掉而**永久消失**（旁听消息不进向量库，丢了就真没了）。
> **目标**：被丢弃的行在丢弃前，按「月」追加到温层归档，保证原文**一句话都不丢**。
> **非目标**：归档**不参与 prompt**（热层职责不变）；Phase 1.5 **不接 UI**（留给未来的导出/翻查）。

**布局**

```
channels/
  history/
    channel_qq_<hash>.jsonl        ← 热层（≤200 行，喂模型）
  archive/
    channel_qq_<hash>/
      2026-09.jsonl                ← 温层（按月，只归档，不读进 prompt）
      2026-10.jsonl
```

**文件**：`src/main/channels/history-log.ts`

**修改点 1**：新增归档路径与写入工具（放在 `filePath()` 之后）

```ts
/** 温层归档目录：按会话分文件夹。 */
function archiveDir(sessionId: string): string {
  return path.join(app.getPath("userData"), "channels", "archive", safeName(sessionId));
}

function archiveFilePath(sessionId: string, month: string): string {
  return path.join(archiveDir(sessionId), `${month}.jsonl`);
}

/** 从一行 JSONL 里取 `YYYY-MM`；取不到归入 "unknown"。 */
function monthOf(line: string): string {
  try {
    const at = (JSON.parse(line) as { at?: unknown }).at;
    if (typeof at === "string") {
      const m = at.slice(0, 7);
      if (/^\d{4}-\d{2}$/.test(m)) return m;
    }
  } catch { /* 落到 unknown */ }
  return "unknown";
}

/**
 * 把被截断的行按月份追加到温层归档。
 *
 * 调用约定：**必须在截断热文件之前调用，且让异常向上抛**——
 * 归档失败时要放弃本次截断（宁可热文件胖一点，也不能丢原文）。
 */
function appendToArchive(sessionId: string, dropped: readonly string[]): void {
  const byMonth = new Map<string, string[]>();
  for (const line of dropped) {
    if (!line) continue;                 // split("\n") 会带出末尾空串
    const month = monthOf(line);
    const bucket = byMonth.get(month);
    if (bucket) bucket.push(line);
    else byMonth.set(month, [line]);
  }
  if (byMonth.size === 0) return;
  for (const [month, lines] of byMonth) {
    const fp = archiveFilePath(sessionId, month);
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.appendFileSync(fp, lines.join("\n") + "\n", "utf8");
  }
}
```

**修改点 2**：改造 `appendHistory` 的截断分支（**保持截断算术不变**）

```ts
// 修改前
    const buf = fs.readFileSync(fp, "utf8");
    const lines = buf.split("\n");
    if (lines.length > MAX_FILE_LINES + 1) {
      const trimmed = lines.slice(lines.length - MAX_FILE_LINES).join("\n");
      fs.writeFileSync(fp, trimmed.endsWith("\n") ? trimmed : trimmed + "\n", "utf8");
    }

// 修改后
    const buf = fs.readFileSync(fp, "utf8");
    const lines = buf.split("\n");
    if (lines.length > MAX_FILE_LINES + 1) {
      const cut = lines.length - MAX_FILE_LINES;
      const dropped = lines.slice(0, cut);
      const trimmed = lines.slice(cut).join("\n");
      // 先归档、后截断。appendToArchive 抛错会被外层 catch 接住，
      // 结果是"加了新行、但没截断"——热文件暂时变长，下次 append 再试。绝不丢原文。
      appendToArchive(sessionId, dropped);
      fs.writeFileSync(fp, trimmed.endsWith("\n") ? trimmed : trimmed + "\n", "utf8");
    }
```

> ⚠️ **不要动 `MAX_FILE_LINES + 1` 和 `slice` 的写法**。既有测试 `history-log.test.ts:84-97` 断言截断后最老是 `msg50`、最新是 `msg249`（即刚好保留 200 条）。改算术会让它红。

**修改点 3**：新增读取接口（供测试与未来的导出/翻查 UI；**不参与 prompt**）

```ts
/** 列出某会话已归档的月份（升序，形如 ["2026-09","2026-10"]）。 */
export function listArchiveMonths(sessionId: string): string[] {
  try {
    const dirPath = archiveDir(sessionId);
    if (!fs.existsSync(dirPath)) return [];
    return fs.readdirSync(dirPath)
      .filter((n) => n.endsWith(".jsonl"))
      .map((n) => n.replace(/\.jsonl$/, ""))
      .sort();
  } catch {
    return [];
  }
}

/**
 * 读取某会话某月的归档（按写入顺序 = 时间顺序）。
 * 只给"人"用（导出/翻查）；**不要**把它接进 buildAlwaysOnContext。
 */
export function loadArchivedHistory(sessionId: string, month: string): HistoryEntry[] {
  const fp = archiveFilePath(sessionId, month);
  if (!fs.existsSync(fp)) return [];
  try {
    return fs.readFileSync(fp, "utf8")
      .split("\n")
      .filter((l) => l.length > 0)
      .map((line) => {
        try {
          return normalizeEntry(JSON.parse(line) as HistoryEntry);
        } catch {
          return null;
        }
      })
      .filter((e): e is HistoryEntry =>
        e !== null && (e.role === "user" || e.role === "assistant"));
  } catch {
    return [];
  }
}
```

**关键约束（务必遵守）**
1. **先归档、后截断**。归档失败 → 本次不截断。绝不为了"省空间"而丢数据。
2. **只归档被丢弃的行**，不做全量复制。
3. **不改变截断算术**（见修改点 2 的警告）。
4. **按月分桶**，月份从每行 `at` 取；解析不出来归 `unknown.jsonl`。
5. **归档不设上限**（用户明确要求"一句话都不丢"）。将来若需要清理策略，另开任务。
6. **归档不进 prompt**。`loadRecentHistory` / `buildGroupContextBlock` 一律不读 archive。

---

## 4. 测试改动清单

### 4.1 必须更新（会因行为变更而失败）

| 文件:行 | 现状 | 更新为 |
|---|---|---|
| `history-log.test.ts:211-233` | 断言旁听块含 `[王五 @昔涟]: 你知道吗`（`triggered: true`） | 改为断言**不含**王五，只含 `[张三]` / `[李四]`；并新增一条断言：`loadRecentHistory(sid, 10, { conversationOnly: true })` 含王五 |

> ⚠️ 这是**有意的行为变更**（缺陷 D3 的修复），不是回归。

### 4.2 T6 需要同步更新（已确认执行）

| 文件:行 | 现状 | 更新为 |
|---|---|---|
| `channel-context.test.ts:148-152` | `toHaveBeenCalledWith(sid, "user", "[群聊发送者：小明 (10001)]\n大家好")` | `toHaveBeenCalledWith(sid, "user", "大家好", { speakerId: "10001", speakerName: "小明", isBot: false, triggered: true })` |
| `channel-context.test.ts:191-195` | `toHaveBeenCalledWith(sid, "assistant", "收到")` | `toHaveBeenCalledWith(sid, "assistant", "收到", { isBot: true })` |
| `dispatcher.test.ts:389-393` | `toHaveBeenCalledWith(sid, "assistant", "传输成功")` | 末尾补 `expect.anything()` 或 `{ isBot: true }` |
| `dispatcher.test.ts:363-367` | `not.toHaveBeenCalledWith(sid, "assistant", expect.any(String))` | 末尾补 `expect.anything()`（否则断言恒真，失去意义） |

### 4.3 建议新增

**`history-log.test.ts`**：

```ts
describe("loadRecentHistory 过滤", () => {
  it("conversationOnly 排除旁听，保留触发轮与 assistant", () => {
    const sid = "channel:qq:filter-conv";
    appendHistory(sid, "user", "闲聊一", { speakerId: "u9", triggered: false });
    appendHistory(sid, "user", "正式问", { speakerId: "u1", triggered: true });
    appendHistory(sid, "assistant", "昔涟答复", { isBot: true });
    appendHistory(sid, "user", "闲聊二", { speakerId: "u8", triggered: false });

    const got = loadRecentHistory(sid, 10, { conversationOnly: true });
    expect(got.map((e) => e.content)).toEqual(["正式问", "昔涟答复"]);
  });

  it("observedOnly 只保留未触发的 user", () => {
    const sid = "channel:qq:filter-obs";
    appendHistory(sid, "user", "闲聊", { speakerId: "u9", triggered: false });
    appendHistory(sid, "user", "正式问", { speakerId: "u1", triggered: true });
    expect(loadRecentHistory(sid, 10, { observedOnly: true }).map((e) => e.content))
      .toEqual(["闲聊"]);
  });

  it("triggered 缺失的记录（私聊/旧数据）默认进滑动窗口", () => {
    const sid = "channel:qq:filter-legacy";
    appendHistory(sid, "user", "私聊或旧消息");   // 无 meta
    const conv = loadRecentHistory(sid, 10, { conversationOnly: true });
    const obs = loadRecentHistory(sid, 10, { observedOnly: true });
    expect(conv.map((e) => e.content)).toEqual(["私聊或旧消息"]);
    expect(obs).toEqual([]);
  });

  it("先过滤再截断：刷屏旁听不会挤掉正式轮", () => {
    const sid = "channel:qq:filter-flood";
    appendHistory(sid, "user", "重要的正式问", { speakerId: "u1", triggered: true });
    for (let i = 0; i < 20; i++) {
      appendHistory(sid, "user", `旁听${i}`, { speakerId: "u9", triggered: false });
    }
    const got = loadRecentHistory(sid, 5, { conversationOnly: true });
    expect(got.map((e) => e.content)).toEqual(["重要的正式问"]);
  });
});

describe("normalizeEntry 真实前缀解析", () => {
  it("拆出昵称与 QQ 号", () => { /* [群聊发送者：小明 (10001)]\n大家好 */ });

  it("识别真实的关键词提示行", () => {
    // [群聊发送者：小明 (10001)]\n[本条消息命中触发关键词（未 @ 你），按约定需要你回复]\n你好
    // → speakerName 小明, speakerId 10001, triggered true, content 你好
  });

  it("@ 触发的旧记录 triggered 保持 undefined（不可推断）", () => { /* ... */ });
});

describe("温层归档 (T7)", () => {
  it("超窗口被丢弃的行进入归档，最新数据仍留热层", () => {
    const sid = "channel:qq:archive-a";
    for (let i = 0; i < 250; i++) appendHistory(sid, "user", `msg${i}`);

    const months = listArchiveMonths(sid);
    expect(months.length).toBeGreaterThan(0);
    const archived = months.flatMap((m) => loadArchivedHistory(sid, m)).map((e) => e.content);
    expect(archived).toContain("msg0");        // 最老的被归档
    expect(archived).not.toContain("msg249");  // 最新的仍在热层
    // 热层既有的 "msg50 最老 / msg249 最新" 断言不因归档而改变（见 4.1 的既有用例）
  });

  it("按月分桶", () => {
    const sid = "channel:qq:archive-months";
    const fp = path.join(
      HISTORY_TMP, "channels", "history",
      sid.replace(/[:/\\<>:"|?*]/g, "_") + ".jsonl",
    );
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.writeFileSync(
      fp,
      JSON.stringify({ role: "user", content: "九月", at: "2026-09-30T10:00:00.000Z" }) + "\n" +
      JSON.stringify({ role: "user", content: "十月", at: "2026-10-01T10:00:00.000Z" }) + "\n",
      "utf8",
    );
    for (let i = 0; i < 205; i++) appendHistory(sid, "user", `pad${i}`);

    expect(listArchiveMonths(sid).sort()).toEqual(["2026-09", "2026-10"]);
    expect(loadArchivedHistory(sid, "2026-09")[0].content).toBe("九月");
    expect(loadArchivedHistory(sid, "2026-10")[0].content).toBe("十月");
  });

  it("归档不进入 prompt 路径", () => {
    const sid = "channel:qq:archive-not-prompt";
    for (let i = 0; i < 250; i++) appendHistory(sid, "user", `msg${i}`, { speakerId: "u1", triggered: false });
    // 热层只有最近 200 条，旁听块也只从热层取
    const block = buildGroupContextBlock(sid, 500)!;
    expect(block).not.toContain("msg0");
  });
});
```

**⚠️ 测试目录清理要一并扩展**：`history-log.test.ts:20-28` 的 `beforeEach` 目前只清 `channels/history`。
T7 之后必须**同时清 `channels/archive`**，否则用例之间会互相污染：

```ts
beforeEach(() => {
  for (const sub of ["history", "archive"]) {
    const dir = path.join(HISTORY_TMP, "channels", sub);
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  }
});
```

同时记得在文件顶部补 import：`listArchiveMonths, loadArchivedHistory`。

---

## 5. 施工后的 prompt 形态（自检用）

群聊场景：A 说"xxx是什么"（未 @）→ B 说"@昔涟 你知道吗"。

**always-on 上下文**（`buildAlwaysOnContext` 产出）：

```
【群聊近期上下文】
以下是你没被叫到时，群里最近的 1 条发言，供你理解当前话题的来龙去脉：
[张三]: xxx是什么
```

**messages**（`buildAndRunAgent` 产出，滑动窗口 + 本轮）：

```jsonc
[
  // ……更早的正式轮（若有）：{ "role": "user", "content": "[李四]: 前面正式问的" }
  { "role": "user", "content": "[王五]: @昔涟 你知道吗" }   // 本轮 agentUserText（formatChannelUserText 原样）
]
```

✅ A 的话只出现在旁听块，不重复
✅ B（请求方）在 messages 里带身份
✅ 历史正式轮带 `[说话人]` 前缀

---

## 6. 验收步骤

```bash
# 1. 类型检查
npx tsc -p tsconfig.main.json --noEmit
npx tsc -p tsconfig.preload.json --noEmit

# 2. 全量测试（Phase 1 基线：469 文件 / 4113 通过）
npx vitest run
```

**手工验证**（需真实 NapCat + 两账号，同 Phase 1 的 4.2）：

1. 群里 A（未 @）说「TypeScript 联合类型怎么收窄」
2. 检查 `<userData>/channels/history/<群>.jsonl` 最后一行：`triggered: false` + `speakerId/speakerName`
3. B @昔涟 说「你知道吗」
4. 控制台搜 `【群聊近期上下文】` → **应只含 A 的那条**（不含 B 的）
5. 检查 messages 里 B 的消息 → **应含** `[B的昵称]` 前缀
6. 昔涟回复应针对 A 的问题

**回归验证（私聊不变）**：
7. 私聊里往返 3 轮 → 滑动窗口内容与补丁前一致（无 `[说话人]` 前缀，无旁听块）

---

## 7. 风险

| 风险 | 等级 | 缓解 |
|---|---|---|
| 旁听块因过滤后为空而完全不注入 | 🟢 低 | `buildGroupContextBlock` 返回 null，调用方已处理；这是**正确**行为（没有旁听就没有上下文块） |
| 老群历史（Phase 1 前写入）解析后 `triggered` 缺省 → 全进滑动窗口 | 🟢 低 | 符合预期（旧数据无法推断是否触发）；Phase 2 会清空 |
| T6 的双前缀陷阱 | 🟡 中 | 用 `stripSpeakerPrefix` 写入；补一条单测锁死（断言 `content` 不含 `[群聊发送者：`） |
| T6 误丢引用行 | 🟢 低 | 方案已改为只剥发送者前缀；补一条单测断言含 `引用 ` 时该行保留 |
| `ChatMessage` 结构扩张影响绑定会话历史 | 🟢 低 | 新字段全部可选；`loadBoundConversationHistory` 不填即 undefined |
| T7 归档失败导致丢原文 | 🟡 中 | **先归档、后截断**；归档抛错则本次不截断（热文件暂时变长） |
| T7 归档目录无界增长 | 🟢 低 | 用户已明确"一句话都不丢"；按月分文件已把文件数控制在「会话数 × 月数」。将来需要再加清理 |
| T7 归档内容被误当记忆清不掉 | 🟡 中 | **Phase 2 的 `deleteAllMemory` 必须包含 `channels/archive/`**（见该蓝图第 4.1 节） |

**回滚**：全部改动集中在 `channels/history-log.ts` / `channels/bootstrap.ts` / `channels/channel-context.ts`（+ 测试），`git checkout` 这三个文件即可。

---

## 8. 建议 Commit 拆分

1. `fix(channels): restore speaker attribution in group sliding window`（T1 + T2 + T4 + T5）
2. `refactor(channels): split observed vs conversational history injection`（T2 + T3，与 1 同批也可）
3. `refactor(channels): persist structured speaker meta on channel history`（T6，独立 commit）
4. `feat(channels): archive truncated history by month`（T7，独立 commit）

每个 commit 后跑全量测试。

---

## 9. Checklist

- [ ] T1 `LEGACY_SPEAKER_PREFIX` 换真实前缀正则 + `parseLegacySender` 拆 QQ 号
- [ ] T1 `normalizeEntry` 用行解析、`triggered` 只对关键词提示行置 true
- [ ] T2 新增 `HistoryQuery` 类型 + `filterHistory`
- [ ] T2 `loadRecentHistory(sessionId, limit, query?)` 先过滤再截断
- [ ] T3 `buildGroupContextBlock` 用 `observedOnly` + 更新文案
- [ ] T4 `ChatMessage` 加 `speakerName/speakerId/triggered`
- [ ] T5 `loadRecentChannelHistory` 传 `{ conversationOnly: true }`
- [ ] T5 `buildAndRunAgent` 映射补 `[说话人]: ` 前缀
- [ ] T6 `appendChannelHistory` 加 meta 参数
- [ ] T6 新增 `stripSpeakerPrefix` helper
- [ ] T6 `appendIncomingContext` 群聊写 `stripSpeakerPrefix(modelText)` + meta（**防双前缀、保引用**）
- [ ] T6 `appendAssistantContext` 传 `{ isBot: true }`
- [ ] T6 `proactive-delivery` 传 `{ isBot: true }`
- [ ] T7 新增 `archiveDir` / `archiveFilePath` / `monthOf` / `appendToArchive`
- [ ] T7 改造截断分支为「先归档、后截断」（**不改算术**）
- [ ] T7 新增 `listArchiveMonths` / `loadArchivedHistory`（不进 prompt）
- [ ] T7 测试 `beforeEach` 一并清理 `channels/archive`
- [ ] 更新 `history-log.test.ts:211-233`
- [ ] T6 后更新 `channel-context.test.ts` / `dispatcher.test.ts` 的 4 处断言
- [ ] 新增过滤/解析/归档测试用例（4.3）
- [ ] `tsc` 两个 project 零错误
- [ ] `vitest run` 全绿
- [ ] 手工验证 7 步

---

## 10. 给 Agent 的提示

1. **T1~T5 必须做；T6 与 T7 都要做**（用户已拍板）。建议顺序：先 T1~T5 跑绿 → T6 → T7。
2. **`triggered !== false` 是核心**——不要写成 `=== true`，否则私聊/旧数据全被过滤掉。
3. **先过滤再截断**，不要图省事改成先截断。
4. **T6 群聊写 `stripSpeakerPrefix(modelText)`**：写 `msg.text` 会丢引用，写 `modelText` 整段会双前缀。
5. **T7 先归档、后截断**：归档抛错就放弃本次截断。**不要动截断算术**（`MAX_FILE_LINES + 1` / `slice`），否则 `history-log.test.ts:84` 会红。
6. **T7 的 `beforeEach` 记得清 `channels/archive`**，否则用例互相污染。
7. **`history-log.test.ts:211` 的失败是预期的**，按 4.1 更新，不要为了让它绿而回退 T3。
8. **归档不进 prompt**：`loadRecentHistory` / `buildGroupContextBlock` 一律不读 `channels/archive/`。
9. 遇到与本蓝图不一致的真实代码，**以真实代码为准**并记录偏离原因（Phase 1 的做法，效果很好）。
