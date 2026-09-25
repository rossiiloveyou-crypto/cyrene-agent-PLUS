# Phase 1 施工蓝图：群聊上下文旁听与结构化 Transcript

## 一、施工目标

**核心问题**：QQ 群里用户 A 说"xxx是什么"（未 @昔涟），用户 B 说"@昔涟 你知道吗"时，昔涟只能看到"你知道吗"四个字，无法理解 A 的上下文。

**根本原因**：`src/main/channels/adapters/qq/napcat-adapter.ts:125` 的 `classifyQqEvent` 函数对未 @ 且未命中触发词的群消息直接返回 `{ allowed: false, allowlist: false }`，导致 `onMessage` 根本不被调用，消息从未进入群历史记录。

**目标**：
1. ✅ **分离"旁听"与"回话"**：群白名单内的所有消息都写入群 transcript（带说话人），但只有 @/触发词才起 LLM run
2. ✅ **结构化 transcript**：`channels/history/*.jsonl` 的每条记录加 `speakerId` / `speakerName` / `triggered` 字段，废弃字符串硬拼 `[群聊发送者：xxx]` 的方式
3. ✅ **群上下文注入**：`buildAlwaysOnContext` 在群聊场景下，读取最近 N 条群消息（含非触发消息）拼成上下文块注入
4. ✅ **验证场景**：A 说"xxx是什么" → B 说"@昔涟 你知道吗" → 昔涟能基于群上下文回答

**非目标**（留给 Phase 2）：
- ❌ 记忆隔离（scope 字段、区块系统）
- ❌ 查询改写小模型（Phase 1 只做规则层的"近因窗口扩展"）
- ❌ UI 改造

---

## 二、核心设计

### 2.1 三态决策模型

**当前**：`classifyQqEvent` 返回 `{ allowed: boolean, reason?, allowlist?, trigger? }`

**升级后**：
```ts
export type QqEventAction = "respond" | "observe" | "drop";

export type QqEventDecision =
  | { action: "respond"; trigger: QqEventTrigger }   // 触发 LLM run
  | { action: "observe" }                            // 写 transcript，不调 LLM
  | { action: "drop"; reason: string; allowlist: boolean };  // 丢弃
```

**决策逻辑**（群聊场景）：
```
群消息进来
  ├─ 群不在白名单？ → drop (allowlist: false)
  ├─ 群在白名单 + 未 @/触发词？ → observe
  └─ 群在白名单 + @ 或触发词？
       ├─ 成员无权限？ → drop (allowlist: true)
       └─ 成员有权限？ → respond
```

### 2.2 结构化 Transcript Schema

**文件**：`channels/history/<sessionId>.jsonl`

**当前格式**：
```json
{"role":"user","content":"[群聊发送者：张三](@昔涟)\nxxx是什么","at":"2024-01-15T10:30:00.000Z"}
```

**新格式**（向后兼容）：
```json
{
  "speakerId": "123456789",
  "speakerName": "张三",
  "isBot": false,
  "triggered": false,
  "role": "user",
  "content": "xxx是什么",
  "at": "2024-01-15T10:30:00.000Z"
}
```

**字段说明**：
- `speakerId`：发言者的平台 ID（QQ 号 / openid）。群消息必填，私聊可选
- `speakerName`：发言者昵称（可选）
- `isBot`：是否是昔涟自己（`role === "assistant"` 时固定为 `true`）
- `triggered`：这条消息是否触发了昔涟回复（只有 @ 或触发词才为 `true`）
- `content`：纯正文，**不再包含** `[群聊发送者：xxx]` 前缀

**向后兼容策略**：
- 读取时：旧格式（无 `speakerId`）仍能解析；`content` 若含 `[群聊发送者：xxx]` 前缀，自动提取到 `speakerName`
- 写入时：统一写新格式

### 2.3 群上下文注入机制

**注入位置**：`src/main/orchestrator/index.ts` 的 `buildAlwaysOnContext` 函数

**当前签名**：
```ts
export async function buildAlwaysOnContext(
  userInput: string,
  recentMessages: Array<{ role: string; content: string }>,
): Promise<string>
```

**新签名**：
```ts
export async function buildAlwaysOnContext(
  userInput: string,
  recentMessages: Array<{ role: string; content: string }>,
  sessionId?: string,  // 新增：用于判断是否群聊 + 读取群历史
): Promise<string>
```

**注入逻辑**：
```ts
if (sessionId?.includes(":group:")) {
  const groupContext = await buildGroupContextBlock(sessionId, 10);  // 取最近 10 条
  if (groupContext) {
    parts.push(groupContext);  // 插入到 worldBook 之后、L0/L1 之前
  }
}
```

**上下文块格式示例**：
```
【群聊近期上下文】
[张三]: 有人知道 TypeScript 的联合类型怎么收窄吗
[李四]: 用 type guard 啊
[王五 @昔涟]: 你知道吗
```

---

## 三、施工清单

### 任务 3.1：改造 `classifyQqEvent` 返回三态

**文件**：`src/main/channels/adapters/qq/napcat-adapter.ts`

**修改点 1**：定义新类型（在文件顶部，line 70 附近）

```ts
// 修改前（line 70-79）
export type QqEventTrigger = "mention" | "trigger_keyword" | "private";

export type QqEventDecision =
  | { allowed: true; trigger: QqEventTrigger }
  | { allowed: false; reason: string; allowlist: boolean; trigger?: QqEventTrigger };

// 修改后
export type QqEventTrigger = "mention" | "trigger_keyword" | "private";
export type QqEventAction = "respond" | "observe" | "drop";

export type QqEventDecision =
  | { action: "respond"; trigger: QqEventTrigger }
  | { action: "observe" }
  | { action: "drop"; reason: string; allowlist: boolean };
```

**修改点 2**：`classifyQqEvent` 函数体（line 96-146）

**当前代码的关键段**：
```ts
// line 120-127
const mentioned = event.message.some((segment) =>
  segment.type === "at" && oneBotId(segment.data.qq) === selfId,
);
const matched = mentioned ? null : findTriggerKeyword(textFromSegments(event.message), triggerKeywords);
if (!mentioned && !matched && config.groupRequireMention) {
  return { allowed: false, reason: "群聊消息未 @ 昔涟，也未命中触发关键词", allowlist: false };
}
const trigger: QqEventTrigger = matched ? "trigger_keyword" : "mention";
```

**替换为**：
```ts
const mentioned = event.message.some((segment) =>
  segment.type === "at" && oneBotId(segment.data.qq) === selfId,
);
const matched = mentioned ? null : findTriggerKeyword(textFromSegments(event.message), triggerKeywords);

// 群在白名单 + 未触发 → observe（旁听模式）
if (!mentioned && !matched && config.groupRequireMention) {
  return { action: "observe" };
}

const trigger: QqEventTrigger = matched ? "trigger_keyword" : "mention";
```

**修改点 3**：私聊路径返回值（line 104-118）

```ts
// 修改前（line 110-118）
if (decision.blocked) {
  return {
    allowed: false,
    reason: decision.reason ?? `发送者 ${senderId} 未获授权`,
    allowlist: true,
    trigger: "private",
  };
}
return { allowed: true, trigger: "private" };

// 修改后
if (decision.blocked) {
  return {
    action: "drop",
    reason: decision.reason ?? `发送者 ${senderId} 未获授权`,
    allowlist: true,
  };
}
return { action: "respond", trigger: "private" };
```

**修改点 4**：群聊白名单检查返回值（line 129-131）

```ts
// 修改前
if (!config.allowedGroupIds.includes(groupId)) {
  return { allowed: false, reason: `群 ${groupId} 不在群聊白名单中`, allowlist: true, trigger };
}

// 修改后
if (!config.allowedGroupIds.includes(groupId)) {
  return { action: "drop", reason: `群 ${groupId} 不在群聊白名单中`, allowlist: false };
}
```

**修改点 5**：群成员权限检查返回值（line 138-145）

```ts
// 修改前
if (memberDecision.blocked) {
  return {
    allowed: false,
    reason: memberDecision.reason ?? `发送者 ${senderId} 未获授权`,
    allowlist: true,
    trigger,
  };
}
return { allowed: true, trigger };

// 修改后
if (memberDecision.blocked) {
  return {
    action: "drop",
    reason: memberDecision.reason ?? `发送者 ${senderId} 未获授权`,
    allowlist: true,
  };
}
return { action: "respond", trigger };
```

**修改点 6**：`isQqEventAllowed` 函数（line 149-157）

```ts
// 修改前
export function isQqEventAllowed(...): boolean {
  return classifyQqEvent(event, config, selfId, triggerKeywords, access).allowed;
}

// 修改后
export function isQqEventAllowed(...): boolean {
  return classifyQqEvent(event, config, selfId, triggerKeywords, access).action !== "drop";
}
```

---

### 任务 3.2：处理 `observe` 动作（写 transcript 但不调 LLM）

**文件**：`src/main/channels/adapters/qq/napcat-adapter.ts`

**修改点 1**：`handleMessage` 函数（line 349-381）

**当前代码结构**：
```ts
const decision = classifyQqEvent(event, config, this.selfId, settings.keywords.trigger, settings.toolAccess);
if (!decision.allowed) {
  if (decision.allowlist) {
    // 记录拦截日志
  }
  return;
}
// ... 构造 incoming
incoming.trigger = decision.trigger;
await this.onMessage?.(incoming);
```

**替换为**：
```ts
const decision = classifyQqEvent(event, config, this.selfId, settings.keywords.trigger, settings.toolAccess);

// 处理 drop：记录拦截日志后返回
if (decision.action === "drop") {
  if (decision.allowlist) {
    const sessionId = makeSessionId("qq", oneBotId(event.message_type === "group" ? event.group_id : event.user_id));
    this.eventLog.recordBlocked({
      sessionId,
      senderId: oneBotId(event.user_id),
      senderName: event.sender?.card || event.sender?.nickname || "",
      reason: decision.reason,
      channel: "qq",
      chatType: event.message_type,
      at: Date.now(),
    });
  }
  return;
}

// 构造 incoming（respond 和 observe 都需要）
const incoming: IncomingMessage = {
  channel: "qq",
  chatType: event.message_type,
  messageId: String(event.message_id),
  senderId: oneBotId(event.user_id),
  senderName: event.sender?.card || event.sender?.nickname,
  chatId: event.message_type === "group" ? oneBotId(event.group_id) : oneBotId(event.user_id),
  text: textFromSegments(event.message),
  attachments: this.extractAttachments(event.message),
  mentions: event.message
    .filter((s) => s.type === "at")
    .map((s) => ({ userId: oneBotId(s.data.qq) })),
  reply: this.extractReply(event.message),
  at: new Date(event.time * 1000),
};

// 处理 observe：只写 transcript，不调 onMessage
if (decision.action === "observe") {
  await this.writeGroupTranscript(incoming, false);  // triggered = false
  return;
}

// 处理 respond：写 transcript + 调 onMessage
incoming.trigger = decision.trigger;
await this.writeGroupTranscript(incoming, true);   // triggered = true
await this.onMessage?.(incoming);
```

**修改点 2**：新增 `writeGroupTranscript` 方法（插入到类的末尾，line 430 附近）

```ts
/**
 * 写入群聊 transcript（旁听模式和响应模式共用）
 */
private async writeGroupTranscript(msg: IncomingMessage, triggered: boolean): Promise<void> {
  if (msg.chatType !== "group") return;
  
  const sessionId = makeSessionId(msg.channel, msg.chatId);
  const historyLogger = getChannelHistoryLogger();
  
  try {
    await historyLogger.append(sessionId, {
      speakerId: msg.senderId,
      speakerName: msg.senderName,
      isBot: false,
      triggered,
      role: "user",
      content: msg.text,
      at: msg.at.toISOString(),
    });
  } catch (err) {
    console.warn(`[NapCat] 写入群 transcript 失败 (${sessionId}):`, err);
  }
}
```

**注意**：
1. `getChannelHistoryLogger()` 是已有函数，返回 `ChannelHistoryLogger` 实例
2. `append` 方法需要在任务 3.3 中改造以支持新字段

---

### 任务 3.3：改造 `ChannelHistoryLogger` 支持结构化字段

**文件**：`src/main/channels/history-log.ts`

**修改点 1**：`HistoryEntry` 类型定义（line 10-15）

```ts
// 修改前
export interface HistoryEntry {
  role: "user" | "assistant";
  content: string;
  at: string;
}

// 修改后
export interface HistoryEntry {
  // 新增字段（群聊必填，私聊可选）
  speakerId?: string;
  speakerName?: string;
  isBot?: boolean;
  triggered?: boolean;
  
  // 原有字段
  role: "user" | "assistant";
  content: string;
  at: string;
}
```

**修改点 2**：`append` 方法（line 50-65，保持签名不变）

当前实现已经接受 `Partial<HistoryEntry>`，不需要改签名。但要确保新字段被正确写入：

```ts
async append(sessionId: string, entry: Partial<HistoryEntry>): Promise<void> {
  // 补全必填字段
  const fullEntry: HistoryEntry = {
    role: entry.role ?? "user",
    content: entry.content ?? "",
    at: entry.at ?? new Date().toISOString(),
    // 新增字段透传
    ...(entry.speakerId && { speakerId: entry.speakerId }),
    ...(entry.speakerName && { speakerName: entry.speakerName }),
    ...(entry.isBot !== undefined && { isBot: entry.isBot }),
    ...(entry.triggered !== undefined && { triggered: entry.triggered }),
  };
  
  // ... 后续写文件逻辑保持不变
}
```

**修改点 3**：`loadRecent` 方法的向后兼容处理（line 80-110）

在读取后，对旧格式进行兼容转换：

```ts
async loadRecent(sessionId: string, limit: number): Promise<HistoryEntry[]> {
  // ... 原有读取逻辑
  
  // 向后兼容：旧格式的 content 可能含 [群聊发送者：xxx] 前缀
  return lines
    .map((line) => {
      try {
        const entry = JSON.parse(line) as HistoryEntry;
        
        // 兼容旧格式：提取说话人信息
        if (!entry.speakerId && entry.content.startsWith("[群聊发送者：")) {
          const match = entry.content.match(/^\[群聊发送者：([^\]]+)\](\(@昔涟\)|\(触发词\))?\n?(.*)/s);
          if (match) {
            entry.speakerName = match[1];
            entry.triggered = !!match[2];
            entry.content = match[3] || entry.content;
          }
        }
        
        return entry;
      } catch {
        return null;
      }
    })
    .filter((entry): entry is HistoryEntry => entry !== null)
    .slice(-limit);
}
```

---

### 任务 3.4：改造 `formatChannelUserText` 简化格式

**文件**：`src/main/channels/channel-context.ts`

**修改点**：`formatChannelUserText` 函数（line 92-105）

```ts
// 修改前
function formatChannelUserText(msg: IncomingMessage): string {
  const sender = msg.senderName || msg.senderId || "未知";
  const triggerNote = msg.trigger === "mention" ? "(@昔涟)" : msg.trigger === "trigger_keyword" ? "(触发词)" : "";
  const reply = msg.reply ? `\n[回复: ${msg.reply.text || "..."}]` : "";
  return `[群聊发送者：${sender}]${triggerNote}${reply}\n${msg.text}`;
}

// 修改后
function formatChannelUserText(msg: IncomingMessage): string {
  // 群聊：保留说话人信息（供 LLM 识别身份），但简化格式
  if (msg.chatType === "group") {
    const speaker = msg.senderName || msg.senderId || "用户";
    const triggerNote = msg.trigger === "mention" ? " @昔涟" : msg.trigger === "trigger_keyword" ? " (触发词)" : "";
    const reply = msg.reply ? `\n[回复: ${msg.reply.senderName || "..."}说的"${msg.reply.text || "..."}"]` : "";
    return `[${speaker}${triggerNote}]${reply}: ${msg.text}`;
  }
  
  // 私聊：不加前缀（就是用户本人在说话）
  return msg.text;
}
```

**设计理由**：
- 群聊格式 `[张三 @昔涟]: 你知道吗` 比旧的 `[群聊发送者：张三](@昔涟)\n你知道吗` 更紧凑
- 私聊不加前缀，因为私聊就是用户本人，不需要"发送者"标注

---

### 任务 3.5：`buildAlwaysOnContext` 加群上下文注入

**文件**：`src/main/orchestrator/index.ts`

**修改点 1**：函数签名（line 99）

```ts
// 修改前
export async function buildAlwaysOnContext(
  userInput: string,
  recentMessages: Array<{ role: string; content: string }>,
): Promise<string>

// 修改后
export async function buildAlwaysOnContext(
  userInput: string,
  recentMessages: Array<{ role: string; content: string }>,
  sessionId?: string,  // 新增参数
): Promise<string>
```

**修改点 2**：函数体（在 worldBook 注入之后、L0/L1 注入之前插入，约 line 130）

```ts
// 在这一段之后：
if (relevantWorldBookEntries.length > 0) {
  parts.push(formatWorldBook(relevantWorldBookEntries));
}

// 插入群上下文块（新增）
if (sessionId?.includes(":group:")) {
  const groupContext = await buildGroupContextBlock(sessionId, 10);
  if (groupContext) {
    parts.push(groupContext);
  }
}

// 然后是原有的 L0/L1 注入
const memoryStore = getMemoryStore();
// ...
```

**修改点 3**：新增 `buildGroupContextBlock` 辅助函数（插入到文件末尾，line 174 之后）

```ts
/**
 * 构建群聊近期上下文块（Phase 1 规则层实现）
 * 
 * @param sessionId - 群会话 ID（格式：channel:qq:group:<chatId>）
 * @param limit - 取最近 N 条消息（默认 10）
 * @returns 格式化的上下文文本，失败时返回 null
 */
async function buildGroupContextBlock(
  sessionId: string,
  limit: number = 10,
): Promise<string | null> {
  try {
    const historyLogger = getChannelHistoryLogger();
    const recentEntries = await historyLogger.loadRecent(sessionId, limit);
    
    if (recentEntries.length === 0) {
      return null;
    }
    
    // 格式化为对话形式
    const lines = recentEntries.map((entry) => {
      if (entry.role === "assistant") {
        return `[昔涟]: ${entry.content}`;
      }
      
      // 用户消息
      const speaker = entry.speakerName || entry.speakerId || "用户";
      const triggeredMark = entry.triggered ? " @昔涟" : "";
      return `[${speaker}${triggeredMark}]: ${entry.content}`;
    });
    
    return `【群聊近期上下文】\n以下是本群最近 ${recentEntries.length} 条消息，供你理解当前话题的来龙去脉：\n${lines.join("\n")}`;
  } catch (err) {
    console.warn("[Orchestrator] 构建群上下文失败:", err);
    return null;
  }
}
```

**注意**：`getChannelHistoryLogger()` 需要先 import：

```ts
// 在文件顶部 import 区域添加
import { getChannelHistoryLogger } from "../channels/history-log";
```

---

### 任务 3.6：调用点传递 `sessionId` 参数

**文件 1**：`src/main/orchestrator/agent-runtime.ts`

**修改点**：`buildAlwaysOnContext` 的调用点（line 188-189）

```ts
// 修改前
buildAlwaysOnContext: ((userText, messages) =>
  buildAlwaysOnContext(userText, messages as any)) as BuildOptionsDeps["buildAlwaysOnContext"],

// 修改后
buildAlwaysOnContext: ((userText, messages, sessionId) =>
  buildAlwaysOnContext(userText, messages as any, sessionId)) as BuildOptionsDeps["buildAlwaysOnContext"],
```

**文件 2**：`src/main/orchestrator/run-options/types.ts`

**修改点**：`BuildAlwaysOnContext` 类型定义（约 line 30-35）

```ts
// 修改前
export type BuildAlwaysOnContext = (
  userInput: string,
  recentMessages: Array<{ role: string; content: string }>,
) => Promise<string>;

// 修改后
export type BuildAlwaysOnContext = (
  userInput: string,
  recentMessages: Array<{ role: string; content: string }>,
  sessionId?: string,
) => Promise<string>;
```

**文件 3**：`src/main/orchestrator/run-options/build-always-on-context.ts`（如果存在单独的调用点）

**修改点**：查找所有 `buildAlwaysOnContext(userInput, recentMessages)` 的调用，改为 `buildAlwaysOnContext(userInput, recentMessages, sessionId)`

使用 grep 查找：
```bash
npx grep -r "buildAlwaysOnContext\(" src/main/orchestrator
```

然后逐个修改调用点，确保传入 `sessionId`。

---

### 任务 3.7：补充单元测试

**文件 1**：`src/main/channels/adapters/qq/napcat-adapter.test.ts`

**新增测试用例**（插入到文件末尾，约 line 200+）

```ts
describe("classifyQqEvent - observe mode", () => {
  const config: QqChannelConfig = {
    enabled: true,
    listenMode: "auto",
    port: 3000,
    allowedGroupIds: ["123"],
    groupRequireMention: true,
    groupReplyStyle: "reply-and-mention",
    groupMemoryPolicy: "shared-personal",
  };
  const selfId = "bot123";
  const access = DEFAULT_TOOL_ACCESS;

  it("returns observe for whitelisted group without mention or trigger keyword", () => {
    const event = {
      message_type: "group" as const,
      user_id: "user1",
      group_id: "123",
      message: [{ type: "text", data: { text: "xxx是什么" } }],
    };
    const decision = classifyQqEvent(event, config, selfId, [], access);
    
    expect(decision.action).toBe("observe");
  });

  it("returns respond for mentioned message in whitelisted group", () => {
    const event = {
      message_type: "group" as const,
      user_id: "user1",
      group_id: "123",
      message: [
        { type: "at", data: { qq: "bot123" } },
        { type: "text", data: { text: "你知道吗" } },
      ],
    };
    const decision = classifyQqEvent(event, config, selfId, [], access);
    
    expect(decision.action).toBe("respond");
    if (decision.action === "respond") {
      expect(decision.trigger).toBe("mention");
    }
  });

  it("returns respond for trigger keyword in whitelisted group", () => {
    const event = {
      message_type: "group" as const,
      user_id: "user1",
      group_id: "123",
      message: [{ type: "text", data: { text: "昔涟 你知道吗" } }],
    };
    const decision = classifyQqEvent(event, config, selfId, ["昔涟"], access);
    
    expect(decision.action).toBe("respond");
    if (decision.action === "respond") {
      expect(decision.trigger).toBe("trigger_keyword");
    }
  });

  it("returns drop for non-whitelisted group", () => {
    const event = {
      message_type: "group" as const,
      user_id: "user1",
      group_id: "456",  // 不在白名单
      message: [{ type: "text", data: { text: "hello" } }],
    };
    const decision = classifyQqEvent(event, config, selfId, [], access);
    
    expect(decision.action).toBe("drop");
    if (decision.action === "drop") {
      expect(decision.allowlist).toBe(false);
    }
  });
});
```

**文件 2**：`src/main/channels/history-log.test.ts`

**新增测试用例**（验证结构化字段的读写）

```ts
describe("HistoryEntry with structured fields", () => {
  it("writes and reads entries with speakerId and triggered fields", async () => {
    const logger = new ChannelHistoryLogger(tempDir);
    const sessionId = "test-session";
    
    await logger.append(sessionId, {
      speakerId: "123456",
      speakerName: "张三",
      isBot: false,
      triggered: false,
      role: "user",
      content: "xxx是什么",
      at: "2024-01-15T10:30:00.000Z",
    });
    
    const entries = await logger.loadRecent(sessionId, 10);
    expect(entries).toHaveLength(1);
    expect(entries[0].speakerId).toBe("123456");
    expect(entries[0].speakerName).toBe("张三");
    expect(entries[0].triggered).toBe(false);
    expect(entries[0].content).toBe("xxx是什么");
  });

  it("parses old format with [群聊发送者：] prefix", async () => {
    const logger = new ChannelHistoryLogger(tempDir);
    const sessionId = "test-session";
    const filePath = path.join(tempDir, `${sessionId}.jsonl`);
    
    // 手写旧格式
    await fs.promises.writeFile(
      filePath,
      JSON.stringify({
        role: "user",
        content: "[群聊发送者：李四](@昔涟)\n你知道吗",
        at: "2024-01-15T10:31:00.000Z",
      }) + "\n",
      "utf8",
    );
    
    const entries = await logger.loadRecent(sessionId, 10);
    expect(entries).toHaveLength(1);
    expect(entries[0].speakerName).toBe("李四");
    expect(entries[0].triggered).toBe(true);
    expect(entries[0].content).toBe("你知道吗");
  });
});
```

**文件 3**：`src/main/orchestrator/index.test.ts`（新建或扩展）

**新增测试用例**（验证群上下文注入）

```ts
import { buildAlwaysOnContext } from "./index";
import { getChannelHistoryLogger } from "../channels/history-log";

// Mock historyLogger
vi.mock("../channels/history-log", () => ({
  getChannelHistoryLogger: vi.fn(() => ({
    loadRecent: vi.fn(async (sessionId: string, limit: number) => [
      {
        speakerId: "user1",
        speakerName: "张三",
        role: "user",
        content: "xxx是什么",
        triggered: false,
        at: "2024-01-15T10:30:00.000Z",
      },
      {
        speakerId: "user2",
        speakerName: "李四",
        role: "user",
        content: "你知道吗",
        triggered: true,
        at: "2024-01-15T10:31:00.000Z",
      },
    ]),
  })),
}));

describe("buildAlwaysOnContext with group context", () => {
  it("includes group context block for group session", async () => {
    const context = await buildAlwaysOnContext(
      "你知道吗",
      [],
      "channel:qq:group:123456",
    );
    
    expect(context).toContain("【群聊近期上下文】");
    expect(context).toContain("[张三]: xxx是什么");
    expect(context).toContain("[李四 @昔涟]: 你知道吗");
  });

  it("does not include group context for non-group session", async () => {
    const context = await buildAlwaysOnContext(
      "hello",
      [],
      "channel:qq:private:123456",
    );
    
    expect(context).not.toContain("【群聊近期上下文】");
  });

  it("does not include group context when sessionId is undefined", async () => {
    const context = await buildAlwaysOnContext("hello", []);
    
    expect(context).not.toContain("【群聊近期上下文】");
  });
});
```

---

### 任务 3.8：更新类型定义（TypeScript 兼容性）

**文件**：`src/main/channels/adapters/qq/napcat-adapter.ts`

**检查点**：所有使用 `decision.allowed` 的地方都需要改成 `decision.action`

使用 grep 查找：
```bash
npx grep "decision\.allowed" src/main/channels/adapters/qq/napcat-adapter.ts
```

**预期需要修改的位置**：
- `isQqEventAllowed` 函数（已在任务 3.1 修改）
- 测试文件中的断言（已在任务 3.7 修改）
- 可能还有其他调用点（需逐个检查）

---

## 四、验证方案

### 4.1 单元测试验证

**运行命令**：
```bash
npx vitest run src/main/channels/adapters/qq/napcat-adapter.test.ts
npx vitest run src/main/channels/history-log.test.ts
npx vitest run src/main/orchestrator/index.test.ts
```

**预期结果**：所有测试通过，无 regression。

---

### 4.2 集成测试验证（手工）

**前置条件**：
1. NapCat 已启动并连接到 QQ
2. 有一个测试 QQ 群（如 `123456`）已加入白名单（`channels-settings.json` 的 `qq.allowedGroupIds`）
3. 至少有两个测试账号（A 和 B）在群里

**测试步骤**：
1. **启动应用**：
   ```bash
   pnpm run dev
   ```

2. **A 发送非触发消息**（不 @ 昔涟）：
   - A 在群里发："TypeScript 的联合类型怎么收窄？"
   - **验证点 1**：检查 `channels/history/channel_qq_group_123456.jsonl` 是否新增了一条记录：
     ```json
     {"speakerId":"user_a_id","speakerName":"A的昵称","isBot":false,"triggered":false,"role":"user","content":"TypeScript 的联合类型怎么收窄？","at":"2024-01-15T..."}
     ```
   - **验证点 2**：昔涟**没有回复**（控制台无 LLM 调用日志）

3. **B 触发昔涟回复**：
   - B 在群里发："@昔涟 你知道吗？"
   - **验证点 3**：检查 `channels/history/` 新增两条记录：
     ```json
     {"speakerId":"user_b_id","speakerName":"B的昵称","isBot":false,"triggered":true,"role":"user","content":"你知道吗？","at":"..."}
     {"isBot":true,"role":"assistant","content":"（昔涟的回复）","at":"..."}
     ```
   - **验证点 4**：昔涟的回复**提到了 A 的问题内容**（如："A 刚才问的是 TypeScript 联合类型收窄..."）

4. **检查 always-on context**（可选，需看日志）：
   - 在控制台搜索 `【群聊近期上下文】`
   - 确认日志包含 A 的消息和 B 的消息

---

### 4.3 边缘情况测试

| 场景 | 预期行为 |
|---|---|
| 群不在白名单 + 非触发消息 | drop，不写 transcript |
| 群不在白名单 + @ 昔涟 | drop，记录拦截日志 |
| 群在白名单 + 非触发消息 + 成员无权限 | observe，写 transcript，不回复 |
| 群在白名单 + @ 昔涟 + 成员无权限 | drop，记录拦截日志 |
| 私聊 + 未授权 | drop，记录拦截日志 |
| 旧格式 history 读取 | 正常解析，`speakerName` 从 `[群聊发送者：xxx]` 提取 |

---

## 五、回滚方案

如果 Phase 1 上线后出现严重问题（如群消息全部丢失、LLM 调用失败率飙升），可按以下步骤回滚：

### 5.1 代码回滚

```bash
git revert <commit-hash>
git push
```

### 5.2 数据兼容性

- 新格式的 `channels/history/*.jsonl` 向后兼容旧客户端（旧客户端会忽略 `speakerId` 等未知字段）
- 旧格式的历史记录在新客户端能正常读取（任务 3.3 已做兼容处理）
- **无需数据迁移或清理**

---

## 六、后续工作（Phase 2 预告）

Phase 1 完成后，群内上下文问题已解决，但记忆仍然是全局共享的（群 A 的记忆会污染群 B）。Phase 2 将引入：

1. **区块系统**（`zone-store.ts`）：
   - root 区块：包含所有桌面会话 + 最多 1 个 QQ 私聊（镜像消息）
   - 自定义区块：用户手动创建，加入多个会话共享记忆域

2. **记忆隔离**：
   - `memory.json` 的 L2 加 `scope: { kind: "zone", zoneId: "..." }` 字段
   - `rag-data/memory-store.json` 的 metadata 加 `scopeId`
   - `searchMemoryEntries` 按 scope 过滤

3. **UI**：
   - 设置页新增"区块管理"标签
   - 区块列表 + 成员管理（复用现有 conversation picker）

---

## 七、注意事项（给 Agent 的提示）

### 7.1 关于依赖关系

- `getChannelHistoryLogger()` 是 `src/main/channels/history-log.ts` 导出的单例获取函数
- `makeSessionId(channel, chatId)` 是 `src/main/channels/types.ts` 的工具函数
- `DEFAULT_TOOL_ACCESS` 是 `src/main/channels/tool-access.ts` 的常量

### 7.2 关于测试策略

- **先跑已有测试**：确保改动没有 break 现有功能
- **再加新测试**：覆盖 observe 模式、结构化字段、群上下文注入
- **最后手工验证**：用真实 QQ 群测试 A→B 场景

### 7.3 关于 Commit 策略

建议拆成 3 个 commit：
1. `refactor(channels): classifyQqEvent 返回三态 + observe 模式`（任务 3.1-3.2）
2. `feat(channels): 结构化 transcript + 向后兼容`（任务 3.3-3.4）
3. `feat(orchestrator): 群上下文注入到 always-on context`（任务 3.5-3.6）

每个 commit 都要能独立运行测试通过。

### 7.4 关于性能影响

- **写入频率增加**：observe 模式会让每条群消息都写 jsonl（原来只写触发消息）
- **token 消耗增加**：每次群触发会多注入最近 N 条消息（约 +200 tokens）
- **建议**：如果群非常活跃（>100 消息/分钟），考虑加 rate limit（但 Phase 1 不做）

### 7.5 关于向后兼容

- 旧客户端读新格式：忽略未知字段，不影响功能
- 新客户端读旧格式：任务 3.3 已做兼容处理，能正常提取 `speakerName`
- **无需配置迁移或数据清理**

---

## 八、Checklist（施工完成标准）

- [ ] 任务 3.1：`classifyQqEvent` 返回三态（`respond` / `observe` / `drop`）
- [ ] 任务 3.2：`handleMessage` 处理 `observe` 动作 + 新增 `writeGroupTranscript` 方法
- [ ] 任务 3.3：`HistoryEntry` 加结构化字段 + 向后兼容读取
- [ ] 任务 3.4：`formatChannelUserText` 简化格式
- [ ] 任务 3.5：`buildAlwaysOnContext` 加 `sessionId` 参数 + 群上下文注入
- [ ] 任务 3.6：所有调用点传递 `sessionId`
- [ ] 任务 3.7：补充单元测试（napcat-adapter / history-log / orchestrator）
- [ ] 任务 3.8：更新类型定义，检查所有 `decision.allowed` 改成 `decision.action`
- [ ] 验证 4.1：单元测试全部通过
- [ ] 验证 4.2：手工测试 A→B 场景成功
- [ ] 验证 4.3：边缘情况测试通过

---

**预计工作量**：3-4 小时（含测试编写 + 手工验证）

**风险等级**：🟡 中等（涉及核心消息处理流程，但有完善的测试覆盖 + 向后兼容保证）

**依赖前置**：无（Phase 1 独立，不依赖 Phase 2 的区块系统）
