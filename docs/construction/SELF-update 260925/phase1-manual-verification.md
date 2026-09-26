# Phase 1 手工验证清单

## 前置条件

### 1. NapCat 环境准备
- ✅ NapCat 已启动并连接到 QQ
- ✅ 昔涟已连接到 NapCat（`channels-settings.json` 的 `qq.enabled: true`）
- ✅ 有一个测试 QQ 群（记录群号，例如 `123456789`）
- ✅ 至少有两个测试账号（A 和 B）在群里

### 2. 配置检查

**打开** `<userData>/channels/channels-settings.json`，确认：

```json
{
  "qq": {
    "enabled": true,
    "allowedGroupIds": ["123456789"],  // 把测试群号加进去
    "groupRequireMention": true         // 保持默认（必须 @）
  }
}
```

**重启昔涟**（改配置后需要重启才能生效）。

---

## 测试场景 1：基础旁听（A 说话，昔涟不回）

### 操作步骤
1. 用测试账号 A 在群里发：
   ```
   TypeScript 的联合类型怎么收窄？
   ```

2. 等待 5 秒（确保写入完成）

### 验证点

#### ✅ Transcript 写入检查
打开文件：`<userData>/channels/history/channel_qq_<群号哈希>.jsonl`

**如何找到这个文件**：
- 群号哈希是 `sha256(群号).slice(0, 16)`
- 直接去 `<userData>/channels/history/` 目录，找最新修改的 `.jsonl` 文件
- 或者在控制台搜索 `[ChannelHistory]` 日志，看文件名

**期望内容**（最后一行）：
```json
{
  "speakerId": "A的QQ号",
  "speakerName": "A的昵称",
  "isBot": false,
  "triggered": false,
  "role": "user",
  "content": "TypeScript 的联合类型怎么收窄？",
  "at": "2024-01-15T10:30:00.000Z"
}
```

**关键检查项**：
- ✅ `speakerId` 是 A 的 QQ 号
- ✅ `triggered: false`（没有触发昔涟回复）
- ✅ `content` 是纯正文，**没有** `[群聊发送者：]` 前缀

#### ✅ 昔涟没有回复
- 群里昔涟**没有回复**
- 控制台**没有** LLM 调用日志（搜索 `[Agent]` 或 `[LLM]`）

---

## 测试场景 2：触发回复（B @昔涟，能看到 A 的上下文）

### 操作步骤
1. 用测试账号 B 在群里发：
   ```
   @昔涟 你知道吗？
   ```

2. 等待昔涟回复

### 验证点

#### ✅ Transcript 写入检查
打开同一个 `.jsonl` 文件，**最后三行**应该是：

```json
{"speakerId":"B的QQ号","speakerName":"B的昵称","isBot":false,"triggered":true,"role":"user","content":"你知道吗？","at":"..."}
{"isBot":true,"role":"assistant","content":"（昔涟的回复）","at":"..."}
```

**关键检查项**：
- ✅ B 的消息 `triggered: true`（触发了回复）
- ✅ 昔涟的回复被写入（`role: "assistant"`, `isBot: true`）

#### ✅ 昔涟的回复包含 A 的上下文
**期望行为**：昔涟的回复**应该提到 A 的问题**，例如：
- "刚才 A（或 A的昵称）问的是 TypeScript 联合类型收窄..."
- "关于类型收窄的问题..."
- 或者直接回答类型收窄的内容（说明理解了 A 的问题）

**如果昔涟回复类似**：
- ❌ "你想知道什么？"（说明没看到 A 的上下文）
- ❌ "我不太明白你的意思"（同上）

#### ✅ Always-on 上下文检查（可选，需要看日志）
在控制台搜索 `【群聊近期上下文】`，应该能找到类似：

```
【群聊近期上下文】
以下是本群最近 2 条消息，供你理解当前话题的来龙去脉：
[A的昵称]: TypeScript 的联合类型怎么收窄？
[B的昵称 @昔涟]: 你知道吗？
```

**注意**：日志可能被折叠或压缩，搜索关键词即可。

---

## 测试场景 3：连续对话（验证上下文窗口）

### 操作步骤
1. A 说："那 type guard 怎么写？"（不 @昔涟）
2. 等待 5 秒
3. B 说："@昔涟 继续讲讲"

### 验证点

#### ✅ 昔涟能承接上一轮的回答
**期望行为**：昔涟的回复应该：
- 提到"刚才说的 type guard"或"接着前面的话题"
- 或者直接讲 type guard 的写法（说明理解了 A 的追问）

#### ✅ Transcript 包含完整对话
打开 `.jsonl` 文件，应该有：
```
A: TypeScript 的联合类型怎么收窄？
B: 你知道吗？
昔涟: （第一次回复）
A: 那 type guard 怎么写？
B: 继续讲讲
昔涟: （第二次回复）
```

---

## 测试场景 4：边缘情况（未加白群）

### 操作步骤
1. 找一个**没有**加入白名单的 QQ 群
2. 在那个群里发："@昔涟 你好"

### 验证点

#### ✅ 昔涟没有回复
- 群里昔涟**没有回复**

#### ✅ 控制台无拦截日志（静默丢弃）
- 控制台**没有**拦截日志（搜索 `[ChannelEventLog]` 或 `未获授权`）
- 因为 `allowlist: false`，这条消息被静默丢弃

#### ✅ Transcript 未写入
- `<userData>/channels/history/` 目录下**没有**新增文件（或该群对应的文件没有更新）

---

## 测试场景 5：触发关键词（不 @，用暗号）

**前置条件**：在 `channels-settings.json` 里配置了触发关键词，例如：

```json
{
  "keywords": {
    "trigger": ["昔涟", "cyrene"]
  }
}
```

### 操作步骤
1. A 说："昔涟在吗"（不 @，但包含触发词）

### 验证点

#### ✅ 昔涟回复了
- 群里昔涟有回复

#### ✅ Transcript 标记 `triggered: true`
```json
{
  "speakerId": "A的QQ号",
  "speakerName": "A的昵称",
  "triggered": true,
  "role": "user",
  "content": "昔涟在吗",
  "at": "..."
}
```

#### ✅ 用户消息的格式包含提示（可选，需要看日志）
在控制台搜索 A 的消息，应该能看到：
```
[群聊发送者：A的昵称 (QQ号)]
[本条消息命中触发关键词（未 @ 你），按约定需要你回复]
昔涟在吗
```

---

## 测试场景 6：向后兼容（旧格式读取）

**前置条件**：有一个群的历史文件包含**旧格式**记录。

如果没有，手工造一个：

### 操作步骤
1. 打开 `<userData>/channels/history/channel_qq_<某群哈希>.jsonl`
2. 在文件末尾追加一行（旧格式）：
   ```json
   {"role":"user","content":"[群聊发送者：老张](@昔涟)\n这是旧格式的消息","at":"2024-01-15T09:00:00.000Z"}
   ```
3. 保存文件
4. 在群里发："@昔涟 刚才老张说的什么？"

### 验证点

#### ✅ 昔涟能理解旧格式的消息
**期望行为**：昔涟的回复应该：
- 提到"老张说的是..."
- 或者复述"这是旧格式的消息"的内容

#### ✅ 日志显示旧格式被解析
在控制台搜索 `【群聊近期上下文】`，应该能看到：
```
[老张 @昔涟]: 这是旧格式的消息
```

**说明**：`history-log.ts` 的向后兼容逻辑正常工作（提取了 `[群聊发送者：老张]` 中的昵称）。

---

## 常见问题排查

### Q1：Transcript 文件找不到
**原因**：
- 群不在白名单里（`allowedGroupIds` 没加群号）
- 配置改了但没重启昔涟

**解决**：
1. 检查 `channels-settings.json` 的 `qq.allowedGroupIds`
2. 重启昔涟
3. 在群里发一条消息（不 @），然后去 `<userData>/channels/history/` 找最新修改的文件

### Q2：昔涟看不到 A 的上下文（B 问"你知道吗"时昔涟答不上）
**可能原因**：
- A 的消息 `triggered: false` 没写进去（检查 transcript）
- `buildGroupContextBlock` 没调用（检查控制台日志，搜索 `【群聊近期上下文】`）
- 取的消息数量太少（默认 10 条，如果 A 和 B 之间隔了很多其他消息，可能被挤出窗口）

**排查步骤**：
1. 打开 transcript 文件，确认 A 的消息在里面且 `triggered: false`
2. 控制台搜索 `【群聊近期上下文】`，看有没有 A 的消息
3. 如果日志里有，但昔涟还是答不上，可能是模型理解问题（换个更明确的问题试试）

### Q3：控制台报错 `Cannot read property 'loadRecent' of undefined`
**原因**：`buildGroupContextBlock` 调用了不存在的函数。

**解决**：检查 `orchestrator/index.ts` 的 import：
```typescript
import { loadRecentHistory, buildGroupContextBlock } from "../channels/history-log";
```

确保 `history-log.ts` 导出了这个函数。

### Q4：昔涟每次回复都重复说"以下是本群最近的消息"
**原因**：上下文块被注入到了滑动窗口（`recentMessages`），形成了循环引用。

**当前不应该发生**：因为上下文块只注入到 `always-on context`，不进滑窗。如果出现了，说明代码有 bug。

---

## 验证完成标准

**所有场景通过** = Phase 1 交付完成 ✅

- ✅ 场景 1：A 说话，transcript 写入，昔涟不回
- ✅ 场景 2：B @昔涟，昔涟能看到 A 的上下文并回答
- ✅ 场景 3：连续对话，上下文承接正常
- ✅ 场景 4：未加白群，静默丢弃
- ✅ 场景 5：触发关键词，正常回复
- ✅ 场景 6：旧格式兼容，能正常读取

**如果某个场景失败**：
1. 按"常见问题排查"检查
2. 如果是代码 bug，记录现象（日志 + transcript 截图）并反馈给开发者
3. 如果是配置问题，按排查步骤修复后重新测试

---

## 日志收集（用于问题报告）

如果测试失败，需要收集以下信息：

### 1. Transcript 内容
```bash
# 打开群对应的 jsonl 文件，复制最后 20 行
tail -n 20 "<userData>/channels/history/channel_qq_<哈希>.jsonl"
```

### 2. 控制台日志
搜索关键词：
- `[ChannelHistory]`
- `【群聊近期上下文】`
- `[Agent]`
- `[LLM]`

复制相关日志段（最近 50 行即可）。

### 3. 配置文件
```bash
# 复制 channels-settings.json 的内容（敏感信息可打码）
cat "<userData>/channels/channels-settings.json"
```

### 4. 测试步骤复现
- 哪个账号说了什么
- 昔涟的实际回复是什么
- 期望的回复应该是什么

---

**预计测试时间**：15-20 分钟（包含配置 + 6 个场景）
