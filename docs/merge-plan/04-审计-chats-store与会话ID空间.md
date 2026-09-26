# 04 · 审计报告：作者重写 `chats-store.ts` 是否动了渠道会话 ID 空间

> **审计结论：没有动。你的渠道历史键完全安全，不需要任何迁移或兼容代码。**
> 这是最后一个技术未知项，至此全部澄清。

---

## 一、结论

**作者对 `chats-store.ts` 的 919 行重写，完全没有触及渠道会话 ID 的生成或消费。**

你 `history-log.ts` 赖以定位磁盘文件的 `sessionId` 空间**逐字节稳定** ——
合并后旧的渠道历史文件仍然能读到，不会出现「历史一分为二」的情况。

---

## 二、为什么可以确定（五条独立证据）

### 证据 1 · 渠道与桌面是两个不相交的 ID 空间

| | 生成方式 | 形态 | 谁在用 |
|---|---|---|---|
| **桌面对话** | `randomUUID()`（`chats-store.ts:408`） | UUID | `chats-store.ts` 全套 |
| **渠道会话** | `makeSessionId(channel, chatId)`（`channel-context.ts:45`） | `channel:<渠道>:<16位hex>` | `history-log` / `bootstrap` / CTA |

`chats-store.ts` 那 919 行改动全部落在**桌面对话内部**：
待发队列（`chats-pending-queue`）、标题生成（`conversation-title-service`）、
侧栏整理（`sidebar-organization-store`）、外部打开（`open-in-app`）、工作区文件。
**没有一行碰渠道会话 ID。**

### 证据 2 · `makeSessionId` 一字未改（决定性）

```ts
// src/main/channels/channel-context.ts:44-51（官方 HEAD 原文）
/** 计算稳定且匿名的渠道会话标识。 */
export function makeSessionId(channel: ChannelId, chatId: string): string {
  const hash = createHash("sha256")
    .update(`${channel}:${chatId}`)
    .digest("hex")
    .slice(0, 16);
  return `channel:${channel}:${hash}`;
}
```

区间内**只有 3d39068b 一个提交**碰过 `channel-context.ts`，而其 diff 里 `makeSessionId`
**没有出现在任何 hunk 中** —— 它原样保留。

### 证据 3 · 磁盘键的转换规则仍然对齐

```ts
// history-log.ts（你的版本）
function safeName(sessionId: string): string {
  return sessionId.replace(/[:/\\<>:"|?*]/g, "_");
}
```
`channel:qq:a1b2c3d4e5f60718` → `channel_qq_a1b2c3d4e5f60718.jsonl`

### 证据 4 · 反解正则与新格式严格互锁

```ts
// history-log.ts:500-506
export function sessionIdFromFileName(fileBase: string, known: ReadonlyMap<string, string>): string | null {
  const authoritative = known.get(fileBase);          // ① 名册优先，权威
  if (authoritative) return authoritative;
  const m = /^channel_([a-z][a-z0-9]*)_([0-9a-f]{16})$/.exec(fileBase);   // ② 退化正则
  if (!m) return null;
  return `channel:${m[1]}:${m[2]}`;
}
```

与 `makeSessionId` 的输出**完全咬合**：
- 哈希是 `digest("hex")` → **全小写十六进制**，必然满足 `[0-9a-f]{16}`
- 渠道名捕获组 `[a-z][a-z0-9]*` **不含下划线** → 与 `safeName` 把 `:` 换成 `_` 后不会歧义
- 两层兜底：名册查不到才退化正则，都不匹配则返回 `null`（列为"无法识别来源"，**不处理**，不会误删）

### 证据 5 · 旧键迁移路径在官方**仍然存活**（我一开始误判了）

`migrateHistory` 是处理"老文件按 `senderId` 键、新文件按 `chatId` 键"的兼容逻辑。
我一度以为官方删了它 —— **核查后确认没删**：

```ts
// src/main/channels/channel-context.ts:92-98（官方 HEAD 原文）
    recordIncomingSession(msg, context): void {
      options.migrateHistory(
        makeSessionId(msg.channel, msg.senderId),   // 旧键（senderId 派生）
        context.sessionId,                          // 新键（chatId 派生）
      );
      recordSession(msg.channel, msg.senderId, context.sessionId);
    },
```

调用链完整：
- `channel-context.ts:35` 接口声明 `migrateHistory`
- `channel-context.ts:93` 在 `recordIncomingSession` 内调用（`dispatcher.ts:203` 触发）
- `bootstrap.ts:29` `import { migrateHistory } from "./history-log"`
- `bootstrap.ts:249` 注入到 `createChannelContext`

**这意味着**：官方不但没破坏你的键空间，还保留着你需要的那条 `senderId → chatId` 兼容迁移调用。

---

## 三、对合并的具体影响

| 项目 | 结论 |
|---|---|
| `history-log.ts` 的键反解 | ✅ 无需改动 |
| 旧的渠道历史文件 | ✅ 合并后仍可读 |
| "历史一分为二"风险 | ✅ 不存在 |
| `migrateHistory` 调用点 | ✅ 官方保留，你只需在重写 `channel-context.ts` 时保住它 |
| `externalChats` 的 `sessionId`（你 zones 在用） | ✅ 同一个 `sessionId` 空间，稳定 |
| 需要新增的兼容代码 | ✅ **零** |

### 唯一一个值得记录的细节

CTA 的轨迹目录名是 `transcripts/v2-<sha256(conversationId)>/`（store `:94-97`），
即它**对 conversationId 再做一次哈希**。
而 `conversationId` 在无绑定时 = `sessionId`（`channel:<渠道>:<hash>`）。
所以轨迹目录名是**二次哈希**，与 `history-log` 的 `safeName` 文件名**形态不同** ——
这**不是问题**（两者各自独立寻址），但排查问题时不要指望它们的目录名能对上。

---

## 四、至此，未知项清单已清空

| 事项 | 状态 |
|---|---|
| 官方 219 提交改了什么 | ✅ 已梳理（5 条主线） |
| 真实冲突数量与性质 | ✅ 已实测（46 文件 = 15 删除 + 31 内容） |
| 桌面对话绑定 | ✅ 已定：彻底删除（官方 UI 已死，你删的是他没删完的管道） |
| 旧设置窗口路线 | ✅ 已定：走 React |
| 旁听 A 迁移方案 | ✅ 已定：方案 1 迁进 CTA（含 2 个陷阱 + 1 个节流设计） |
| 语料 B | ✅ 已定：**原地不动**（你的注释已写明它是只增不减的长期资产） |
| **`chats-store.ts` 是否动 ID 空间** | ✅ **本次审计：没有动** |
| 前置条件 | Phase 0 你在另一窗口执行 |
