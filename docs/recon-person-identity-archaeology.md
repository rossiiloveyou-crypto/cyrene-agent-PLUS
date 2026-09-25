# 人物标识考古 —— 「精确删除某个人与昔涟的记忆」可行性侦察

> 只读侦察报告。所有结论带 `文件路径:行号`。
> 图例：**【类型有】**= 类型定义里存在；**【生产填】**= 生产写入路径真的会写值；**【生产空】**= 生产路径从不填。

---

## A. L2Memory 的逐字段溯源能力

### A.0 生产写入 L2 的全部路径（先收敛入口）

| 路径 | 入口 | 说明 |
|---|---|---|
| P1 自动反思 | `memory-scheduler.ts:42` → `:76` → `memory-manager.ts:120` → `:125 writeL2` | 主路径。每 6 轮触发一次 judge |
| P2 模型工具 | `tool-registry.ts:417 write_memory` → `:470 memoryManager.writeMemory` | 用户明确要求「记住…」时 |
| P3 压缩总结 | `memory-compressor.ts:129` → `compileMemoryCompression` → `memory-store.ts:148 addL2Memory` | 每 20 轮，**只产生总结条目** |
| P4 冲突消解产物 | `memory-store.ts:539-570 applyResolverResolution` | 只产生 resolver 生成的新条目 |
| P5 Obsidian 回流 | `obsidian-importer.ts:160 updateL2Content` | **只改 content，不产新条目** |

`L2Input` 类型是理解一切的钥匙：

```
src/main/memory/memory-store.ts:31
export type L2Input = Omit<L2Memory, "id"|"createdAt"|"lastAccessedAt"|"accessCount"|"weight"|"status"|"keywords">
```

→ `evidenceIds`、`sourceMessageIds`、`scope`、`sourceQuote`、`slug`、`ragId` 都在 `L2Input` 里（**可传**），
但「可传」≠「生产会传」。下面逐字段核对。

### A.1 `sourceConversationId` —— 填的是什么？会话，不是人

| 项 | 结论 | 证据 |
|---|---|---|
| 类型 | `string`（必填） | `memory-types.ts:47` |
| P1 自动路径 | = **渠道 sessionId**，形如 `channel:<channel>:<sha256(channel:chatId) 前16位>`；桌面对话则为桌面对话 id | `memory-scheduler.ts:76`（`conversationId ?? "default"`）→ `memory-judge.ts:185`（`candidate.sourceConversationId = conversationId`）→ `memory-manager.ts:129` |
| `conversationId` 的真实来源 | 渠道运行 = `makeSessionId(msg.channel, msg.chatId)` | `channels/dispatcher.ts:116` → `:218/:309` → `channels/bootstrap.ts:302` → `build-options.ts:995` |
| P2 工具路径 | 见下方陷阱 | `tool-registry.ts:470` → `memory-manager.ts:129` |
| P3 压缩总结 | 继承 `group[0].l2.sourceConversationId`（即被压缩的第一条） | `memory-compressor.ts:120` |
| P4 消解产物 | `newMemory.sourceConversationId \|\| oldMemory.sourceConversationId` | `memory-store.ts:544` |

> ⚠️ **P2 陷阱**：`write_memory` 工具**没有**给 candidate 注入 `sourceConversationId`（对比 `tool-registry.ts:457` 明确注入了 `candidate.scope`）。
> 于是 `memoryManager.ts:129` 的 `candidate.sourceConversationId ?? ""` 落成**空字符串**。
> 即工具路径写入的 L2，`sourceConversationId === ""`，**连会话都追不回来**。

**结论：`sourceConversationId` 是会话/域标识，不是人。** 它只能回答「这条记忆来自哪个群/哪个私聊/哪个桌面对话」，
永远无法回答「这条记忆里说的是 QQ 群中的哪一位」。

### A.2 `sourceMessageIds` —— 【生产空】🟥

| 项 | 结论 | 证据 |
|---|---|---|
| 类型 | `sourceMessageIds?: string[]` | `memory-types.ts:64` |
| 声明为可传 | `L2Input` 里没有 Omit 掉 → 可传 | `memory-store.ts:31` |
| **谁真的传了** | 全仓库只有 2 处引用，**均为测试**：`memory-store.test.ts:191`（`["msg_1","msg_2"]`）；生产代码只在 `memory-store.ts:545-548`（P4 消解产物继承 `oldMemory/newMemory.sourceMessageIds`）与 `:202`（读）出现 | `grep sourceMessageIds` 全量结果 |
| P1 自动路径 | `memory-judge.ts:184-186` 只注入 `sourceConversationId`，**不注入任何 message id**；`MemoryCandidate` 类型里也**没有** `sourceMessageIds` 字段 | `memory-types.ts:171-204` |
| P3 压缩 | `memory-compression-transaction.ts:19-28` 的 `createSummary` 入参里**没有** `sourceMessageIds` | 同上 |

**结论：生产路径为空。** `evidence.messageIds`（`memory-store.ts:202` 读的就是它）因此**也是空的**
——即使某条 L2 的 `sourceMessageIds` 是 `[]`，`createEvidence` 也只是把它原样抄进 evidence。

**这是本次考古最致命的一条：整条记忆链路里不存在任何指向「原始消息」的稳定指针。
无法回答「这条记忆对应聊天记录里的哪几条消息」。**

### A.3 `evidence` 的 `messageIds` / `conversationId`

`MemoryEvidence` 由 `memory-store.ts:196-206 createEvidence()` 在**每次 addL2 时自动生成**：

| 字段 | 生产填充情况 | 证据 |
|---|---|---|
| `id` | ✅ 自动 `ev_<ts>_<rand>` | `memory-store.ts:198` |
| `memoryId` | ✅ | `memory-store.ts:199` |
| `quoteSnippet` | ✅ = `triggerText \|\| content` 前 300 字（**LLM 生成的引文**，不是原始消息） | `memory-store.ts:200`，上限 `:21` |
| `conversationId` | ⚠️ = `input.sourceConversationId \|\| undefined` —— 即**会话 id**，不是人；P2 工具路径下为 `undefined` | `memory-store.ts:201` |
| `messageIds` | 🟥 **生产路径为空** = `input.sourceMessageIds`（永远 undefined） | `memory-store.ts:202` |
| `contextBeforeSnippet` / `contextAfterSnippet` | 🟥 从未被赋值（类型有，代码零引用） | `memory-types.ts:163-164` |
| `sourceStatus` | ✅ 恒为 `"active"`，且**永远不变** | `memory-store.ts:204` |

`evidenceIds` 本身在生产路径**会被填**：`memory-store.ts:159/163`（`addL2Memory`）、`:692/:696`（`addL2Batch`）。
但 `evidenceIds` 指向的 evidence 里没有消息指针 —— 证据链止步于「LLM 写的一段引文」。

### A.4 `scope` 的取值来源

| 项 | 结论 | 证据 |
|---|---|---|
| 类型 | `scope?: string`（宽松 string） | `memory-types.ts:79` |
| 取值规范 | `zone:root` / `zone:<zoneId>` / `solo:<sessionId>` | `zones/types.ts:75-89` |
| P1 注入点 | **调度层注入**，LLM 不产出：`memory-scheduler.ts:79`（`{ ...candidate, scope: scopeId }`），`scopeId = resolveScopeId(conversationId)` | `memory-scheduler.ts:43` |
| `resolveScopeId` 规则 | 非 `channel:` 前缀 → `zone:root`；渠道会话且在某区块 → `zone:<zoneId>`；否则 → `solo:<sessionId>` | `zones/scope.ts:28-34` |
| P2 工具 | `resolveScopeId(ctx?.conversationId)`，显式注入 | `tool-registry.ts:457` |
| P3 压缩 | 继承 `group[0].l2.scope`，且**按 scope 分桶聚类**（跨域不压缩） | `memory-compressor.ts:44-50`、`:122` |
| P4 消解 | `newMemory.scope ?? oldMemory.scope` | `memory-store.ts:564-566` |
| 兜底 | 缺失视为 legacy；`repairMigrations` **不补** scope | `memory-types.ts:76-78`、`memory-store-migrations.ts:14-24` |

**结论：`scope` 粒度是「群 / 私聊对端 / 桌面对话」这一级，不是「人」。**
一个 QQ 群里的小明、小红、小刚，他们的记忆**共享同一个 `zone:xxx` / `solo:channel:qq:<hash16>`**。

### A.5 其余涉及「人」的字段

| 字段 | 生产情况 | 证据 |
|---|---|---|
| `content` / `triggerText` / `sourceQuote` | ✅ 但**都是 LLM 生成的自由文本**。人名只以「文本里出现的字符串」存在，无结构化标识 | `memory-manager.ts:127-137`；prompt 见 `memory-judge.ts:106-119` |
| `slug` | ✅ 生产填（LLM 输出），但只是**主题标题**（如「和小张约饭」），非人 ID | `memory-manager.ts:135`、`memory-judge.ts:107-110` |
| `keywords` | ✅ 自动生成，但 `extractMemoryKeywords` 是**逐字 CJK 切分**（「小明」→ `["小","明"]`），**不保留人名** | `memory-store.ts:160`、`memory-store-defaults.ts:57-74` |
| `conflictWith` / `supersededBy` / `mergedInto` | ✅ 填，但指向 **ragId / l2Id**，与「人」无关 | `memory-store.ts:319`、`:575-579` |
| `subEntryIds` | ✅ 生产填（仅压缩总结条目） | `memory-compression-transaction.ts:43,50` |
| `ragId` | ✅ | `memory-manager.ts:149` |

### A.6 A 节总结

> **L2Memory 里不存在任何可用于「精确删除某个人」的字段。**
> - 最细的稳定归属是 `scope`（群/会话级）。
> - 唯一的人名载体是 `content`/`triggerText`/`sourceQuote` 的自由文本 ——
>   要做「按人删除」只能靠 **文本匹配 + LLM 归因**，本质是**猜测**，不是「精确删除」。
> - `sourceMessageIds` / `evidence.messageIds` 生产路径为空 → **无法回溯到原始消息**，
>   因此也无法先在 transcript 里锁定 speakerId、再反查记忆。

---

## B. 渠道聊天记录（transcript）里的人物标识

### B.1 热层 `channels/history/<sessionId>.jsonl`

`HistoryEntry` 结构（`channels/history-log.ts:32-45`）：

| 字段 | 生产填充 | 证据 |
|---|---|---|
| `speakerId` | ✅ **群聊必填**（平台 ID：QQ 号 / openid） | `channel-context.ts:210`（正式轮）、`napcat-adapter.ts:499`（旁听） |
| `speakerName` | ✅ 群聊常填（QQ 群名片 / 昵称） | `channel-context.ts:211`、`napcat-adapter.ts:500` |
| `isBot` | ✅ user 轮 `false`，assistant 轮 `true` | `channel-context.ts:212`、`:248` |
| `triggered` | ✅ 正式轮 `true`，旁听 `false` | `channel-context.ts:214`、`napcat-adapter.ts:502` |
| `role` / `content` / `at` | ✅ | `history-log.ts:234-242` |

**私聊**：`meta === undefined`（`channel-context.ts:216`），所以**私聊条目不写 speakerId** ——
但私聊本身 sessionId 就是「对端 chatId 的 hash」，人 = 会话，不需要 speakerId。

**旧记录兼容**：`normalizeEntry` 从正文 `[群聊发送者：小明 (10001)]` 前缀里**反解**出 speakerId/speakerName（`history-log.ts:80-99`、正则 `:69-70`、`parseLegacySender` `:73-77`）。**旧数据也有 speakerId。**

### B.2 温层归档 `channels/archive/<sessionId>/<YYYY-MM>.jsonl`

**归档是热层行的原样搬运，不是重新组装**：

```
history-log.ts:168-183  appendToArchive(sessionId, dropped)
  dropped = 热文件被截断的原始文本行（string[]）
  → 按 at.slice(0,7) 分月 → fs.appendFileSync(fp, lines.join("\n"))
```

- `dropped` 来源：`history-log.ts:249-252`，`lines.slice(0, cut)` —— **未经 JSON 解析、未经重组的原始行**；
- 因此归档条目与热层**同结构同字段**，`speakerId`/`speakerName`/`triggered`/`isBot` 全部保留；
- 读取时同样走 `normalizeEntry`：`history-log.ts:212`（`loadArchivedHistory`）；
- **热层与温层都带 speakerId**（只要写入时带了）。归档目录按会话（= 群）分文件夹，**不按人分**。

### B.3 群聊旁听写入路径

```
napcat-adapter.ts:475-478   decision.action === "observe" → writeObservedTranscript(incoming)
napcat-adapter.ts:494-504   appendHistory(makeSessionId(channel, chatId), "user", content,
                              { speakerId, speakerName, isBot:false, triggered:false })
```

旁听条目**带 speakerId**（`napcat-adapter.ts:499`）。这是群里「小明说话但没 @ 昔涟」的那条。

### B.4 其他带人的日志（非记忆系统，但含完整人标识）

| 文件 | 人标识字段 | 证据 |
|---|---|---|
| `channels/log.jsonl` | `senderId`, `senderName`, `chatId` | `message-log.ts:17-29`（`senderId` 必填 `:23`） |
| `channels/audit/index.jsonl` + `logs/*.log` | `senderId`(必填), `senderName`, `chatId`, `sessionId`, `userText` | `audit-log.ts:35-68`（`senderId:44`）、`:70-92` |
| `channels/context-bindings.json` | `externalChats[].chatId`, `senderName` | `conversation-binding-store.ts:10-18` |

### B.5 关键断链（B 节的核心结论）

渠道 transcript **有** `speakerId`（QQ 号级），记忆 L2 **没有**任何消息指针。
两者之间**没有 join key**：

```
speakerId(10001)  ──✗──  L2.evidence.messageIds(空)
transcript 行      ──✗──  L2.sourceMessageIds(空)
```

唯一能连接的桥是 `sessionId`（= `scope` 的 `solo:`/`zone:` 部分），但那只到「哪个群」。
**要落到「群里的小明」，只能靠正文文本里出现了「小明」两个字**。

---

## C. 其他持久化文件里的「人」痕迹

### C.1 `entity-graph.json` —— ✅ **唯一有稳定人 ID 的文件**

```
memory/entity-graph.ts:60-61   path = userData/entity-graph.json
```

| 结构 | 字段 | 证据 |
|---|---|---|
| `EntityNode` | `id`（**稳定**：`ent_<ts>_<rand>`）、`name`、`type`（含 `"person"`）、`aliases[]`、`mentionCount`、`firstMentionedAt`、`lastMentionedAt`、`scope?` | `entity-graph.ts:16-29`，id 生成 `:125` |
| `EntityRelation` | `id`、`sourceId`、`targetId`、`relation`、`confidence`、`strength` | `entity-graph.ts:31-38` |
| 写入 | `ingestEntities(extracted, scope)`：**同域内按 name/alias 去重**，跨域同名是两条记录 | `entity-graph.ts:97-143`（去重 `:107-110`） |
| 调用点 | `memory-scheduler.ts:121`（judge 顺手抽实体，零额外 LLM） | — |

**这是全系统唯一「人 = 一条带 id 的记录」的地方。**
但注意：
- 它**不指向任何 L2**（没有 `mentionedInL2Ids` 反向指针）；
- 关系边只在**同域实体之间**成立（`entity-graph.ts:174-175`）；
- `person` 实体是 LLM 从对话里抽的**名字**，与渠道 `speakerId` **无关联**（QQ 群里的「小明」抽出来是 `name:"小明"`，无法映射到 `speakerId:10001`）；
- 导出到 Obsidian 时才有反向链接（`obsidian-exporter.ts:525-551` 扫 content 里的实体名），**PMRS 内没有**。

### C.2 `relationship-log.json` —— 按 scope，不按人

```
relationship/relationship-log.ts:56   path = userData/relationship-log.json
```

| 结构 | 关键字段 | 证据 |
|---|---|---|
| `RelationshipLogEntry` | `userText`、`assistantText`、`channel`、`scope?`、`userMood`、`relationshipSignal`、`importantMoment?`、`nextCareCue`、`date`、`id` | `relationship-log.ts:20-28` |
| `RelationshipDailySummary` | `date`、`scope?`、`summary`、`nextCareCue` | `relationship-log.ts:30-40` |
| 分桶键 | **`(scope, date)`** —— 不按人 | `relationship-log.ts:222-231` |
| 调用点 | `build-options.ts:1019-1026`，`scope: resolveScopeId(conversationId)`，`channel: channel ?? "desktop"` | — |

**人只作为 `userText` 里的文本痕迹存在**：`recordRelationshipTurn` 收到的 `userText` 是
`stripTurnModelContextForSideEffects(latestUserText)`（`build-options.ts:973`、`:313-329`），
而 `latestUserText` 正是 `formatChannelUserText(msg)`（`channels/bootstrap.ts:218`），
群聊时形如 `[群聊发送者：小明 (10001)]\n…`（`channel-context.ts:99-112`）。

→ **entries 里「谁的发言」靠正文前缀；dailySummaries 里连前缀都被 `compact()` 截断（上限 120 字，`relationship-log.ts:67-70`）后揉成一条摘要，人物信息基本丢失。**
条目总数上限 500、摘要上限 90（`relationship-log.ts:52-53`），旧的会被静默丢弃。

### C.3 `moments.json` / `moments-state.json` / `moments-reaction-queue.json` / `moments-media/`

```
moments/moments-store.ts:38    STORE_FILE_NAME = "moments.json"
moments/moments-policy.ts:151  moments-state.json
moments/moments-service.ts:803 moments-reaction-queue.json
moments/moments-store.ts:39    MEDIA_ROOT_DIR_NAME = "moments-media"
```

| 结构 | 人标识 | 证据 |
|---|---|---|
| `MomentPost` | `author: MomentAuthor`（`"user"`/`"cyrene"`/**注册角色昵称**）、`mentions?: string[]`、`source?: {type, triggerConversationId?, triggerRunId?, triggerExcerpt?}` | `shared/moments-types.ts:41-53`、`:34-39` |
| `MomentComment` | `author`、`replyTo`、`sourceTaskId?` | `shared/moments-types.ts:55-68` |
| `MomentReaction` | `actor: MomentAuthor` | `shared/moments-types.ts:70-76` |
| `ReactionTask` | `actor`（"cyrene" 或角色名）、`postId`、`mentioned?` | `moments/reaction-queue.ts:25-41` |

**关键**：
- `author` / `actor` 是**朋友圈内的身份**（user / cyrene / 入驻角色），**不是渠道好友**。
  QQ 群里的小明**不会**出现在朋友圈（朋友圈没有渠道入口）。
- AI 发帖时 `source` 只写 `{ type: "conversation", triggerExcerpt: summary }`（`moments-agent.ts:657`），
  **`triggerConversationId` 在生产路径从不填**（只有手工发帖走 `{ type: "manual" }`，`moments-store.ts:275`）。
- `moments-state.json` 只存策略状态（冷却/日上限/事件去重键），`buildMomentsEventKey` 用 conversationId + 文本 hash（`moments-policy.ts:104`）——**无人的标识**。

→ **朋友圈对「渠道里的人」零覆盖。** 与「删除群里小明」无关。

### C.4 `chat-social-atoms.json` —— 语义上带人，但**只覆盖 owner 域**

```
services/social-context/social-context-service.ts:34  path = userData/chat-social-atoms.json
```

| 结构 | 字段 | 证据 |
|---|---|---|
| `SocialAtom` | `id`、`conversationId`、`type`（long_term/short_term/open_loop）、`content`、`evidenceTurnId`、`evidenceQuote`、`createdAt`、`expiresAt?`、`status`、`supersededByAtomId?`、`resolvedByTurnId?` | `social-context/types.ts:18-30` |
| store key | `listActive(conversationId)` —— **按 conversationId 过滤**，不是按人 | `social-context/store.ts:56-59` |

`evidenceTurnId` 的构造**确实带 senderId**：

```
channels/bootstrap.ts:234  userTurnId = `${msg.channel}:${msg.senderId}:${msg.at.toISOString()}:user`
channels/bootstrap.ts:235  assistantTurnId = `${msg.channel}:${msg.senderId}:${...}:assistant`
```

`evidenceTurnId` 被原样存进 atom（`social-context/extractor.ts:198`）。

> ⚠️ 但**渠道会话根本不会产生社交原子**：
> `build-options.ts:524-527` 的 `socialContextEnabled = isChatMode && isOwnerScope && …`，
> 而 `isOwnerScope = scopeId === rootScope()`（`:523`），`rootScope()` 只有桌面对话能命中（`zones/scope.ts:30`）。
> 渠道会话的 scope 是 `zone:xxx` / `solo:channel:…` → `socialContextEnabled === false`
> → `build-options.ts:934-943` 不注入 `socialContext` → `:978` 走 `else` 分支 → **不抽取原子**。

**结论：`chat-social-atoms.json` 只含桌面对话（owner 自己）的原子。**
它**是**唯一「带 senderId 的持久化记忆类文件」（若未来放开渠道），但**当前生产不覆盖渠道**。

### C.5 `channels/context-bindings.json` —— ✅ 外部会话绑定

```
channels/conversation-binding-store.ts:208  path = userData/channels/context-bindings.json
```

| 结构 | 字段 | 证据 |
|---|---|---|
| `ExternalChannelChat` | `sessionId`、`channel`、`chatId`、`chatType`、`senderName?`、`lastAt` | `conversation-binding-store.ts:10-18` |
| `ChannelConversationBinding` | `sessionId`、`conversationId`、`updatedAt` | `conversation-binding-store.ts:20-24` |
| 写入点 | `channels/bootstrap.ts:105-114`（`observeExternalChat`） | — |

**群聊时 `chatId` = 群号**（`bootstrap.ts:109` 传 `msg.chatId`），`senderName` = **触发消息的发送者昵称**（`:111`）——只是「最后说话的人」，会被后续消息覆盖。
**私聊时 `chatId` = 对端 id** → `sessionId = makeSessionId(channel, chatId)` **可反查具体人**。
上限 200 条未绑定会话（`conversation-binding-store.ts:7`、`:105`），旧的被淘汰。

### C.6 世界书 `worldbook` + `worldbook-state.json`

| 项 | 结论 | 证据 |
|---|---|---|
| `WorldbookEntry` | `id`、`keywords[]`、`content`、`priority`、`permanent`、`enabled`、`intrinsicValue`、`linkTriggers[]` —— **无任何人的字段** | `rag/worldbook.ts:8-17` |
| 来源 | `<promptDir>/worldbook/*.md`（作者手写设定），不是运行时数据 | `rag/index.ts:46-50`、`worldbook.ts:383-415` |
| `worldbook-state.json` | 只存 DMAE 运行时状态，**以 `entry.id` 为 key** | `rag/index.ts:48` |
| 持久化现状 | **v1 no-op**：`loadState()` 是空实现，重启回 0 | `worldbook.ts:353`、`:410`、`:643` |

→ **与「人」无关**（设定文件里可能提到角色名，但那是作者写的静态文本）。

### C.7 主动消息 `proactive-state.json`

| 项 | 结论 | 证据 |
|---|---|---|
| `ProactiveState` | `proactiveEpoch`、`unansweredCount`、`lastProactiveAt`、`lastProactiveScene`、`globalDesire`、**`affinity: Record<string, number>`**、`lastFiredAt` | `proactive/proactive-types.ts:17-26` |
| `affinity` 的 key | **sceneId**（场景），不是人 | `proactive-types.ts:12-15`、`proactive-types.ts:24` |
| 文件路径 | `userData/proactive-state.json` | `proactive-state-store.ts:22` |
| 收件人 | `RecentProactiveChannelRecipient` 在**内存** Map 里（`channels/proactive-delivery.ts:26-44`），**不持久化**，重启即空 | `proactive-delivery.ts:27` |

→ **与「人」无关**（只送微信/飞书两渠道的最近收件人，且不落盘）。

### C.8 表情包 / 定时任务

| 子系统 | 结论 |
|---|---|
| 表情包（`sticker-*`, `local-sticker://`） | 全局素材库 + 启用开关（`memory-user-ipc.ts:71-121`），**无人的归属** → 与「人」无关 |
| 定时任务（`scheduler/`） | 任务定义 + 运行历史，`CyreneAgent({ threadId: 'scheduler-<taskId>' })`（`scheduler-runner.ts:113`），**无渠道人标识** → 与「人」无关 |
| 桌面对话 `cyrene-chats/` | `message.channelSource = { channel, chatType, senderName }`（`channels/bootstrap.ts:146-149`）—— 绑定镜像消息**只有 senderName，没有 senderId** |

---

## D. 现有删除路径的能力边界

### D.1 `memoryStore.deleteL2(id)` —— 只清 2 处，漏 8 处

```
memory-store.ts:276-287
  store.l2        = store.l2.filter(m => m.id !== id)                    ← 清了
  store.evidence  = store.evidence.filter(e => e.memoryId !== id)        ← 清了
  await this.save(store)
```

**没清理的（清单）**：

| # | 遗留物 | 位置 | 后果 |
|---|---|---|---|
| 1 | **向量**（`rag-data/memory-store.json` 里 `metadata.l2Id === id` 的条目） | `deleteL2` 从不调 `deleteUserMemoryVectors` | 向量仍在库里；但召回侧有 `allowedEntryIds` 兜底（`rag/index.ts:200-221`），且**启动 reconciliation 会把它当 stale 删掉**（`memory-rag-reconciliation.ts:78-80,119-127`）。**进程内不重启不会清** |
| 2 | `l2DmaeStates` 中该 l2Id 的状态 | `l2DmaeManager.getActiveL2ForPrompt` 的 `allowedEntryIds`… 实际是按传入 l2List 过滤，孤儿 state 不注入但会**永久留在文件里**；`syncToStore` 只遍历 store 里现存 state（`l2-dmae-manager.ts:192-205`） | 文件膨胀 + `getAllL2DmaeStates()` 返回幽灵 |
| 3 | `conflictLogs` 中 `sourceL2Id/targetL2Id === id` 的日志 | `memory-store.ts:422-449` 只 append，从不按 L2 清理 | 冲突日志指向已删条目 |
| 4 | 其他条目上的 `conflictWith`（存的是 **ragId**，不是 l2Id） | `memory-store.ts:319` | 指向已删条目的 ragId → 注入时会显示「⚠️（该信息可能存在矛盾记录）」（`orchestrator/index.ts:47-48`）**误报** |
| 5 | 其他条目上的 `supersededBy` / `mergedInto`（存 l2Id） | `memory-store.ts:575-579` | 悬空指针 → Obsidian 导出成 `[[不存在的链接]]`（`obsidian-exporter.ts:190-197`） |
| 6 | 压缩总结条目上的 `subEntryIds` | `memory-compression-transaction.ts:50` | 总结仍 `[[链接]]` 到已删原始条目（`obsidian-exporter.ts:184-187`） |
| 7 | `recent-injected-memory` 内存缓存 | `recent-injected-memory.ts:14` | 10 分钟 TTL 内 `wasRecentlyInjectedMemory(id)` 仍为 true → 影响 conflict scoring（`memory-manager.ts:220-223`），**短暂幽灵** |
| 8 | Obsidian vault 里的 `记忆/<slug>.md` 与 `实体/<name>.md` 里的反向链接 | `obsidian-exporter.ts:506-551` | 见 D.4 |

> ⚠️ **额外发现：`deleteL2` 在生产代码里几乎没有调用方。**
> `grep deleteL2(` 生产只有一处：`memory-compressor.ts:141` 的 `deleteSummary`（**压缩事务回滚路径**）。
> 其余全是测试（`memory-store.test.ts:220`、`obsidian-exporter.test.ts:392`）。
> **没有任何 IPC、没有任何模型工具暴露单条 L2 删除。**
> IPC 只有 `MEMORY_DELETE_ALL`（全删，`memory-user-ipc.ts:146`）和 `MEMORY_PANEL_DELETE_IMPORTED_DOC`（删文档，`:162`）。
> 模型工具只有 `read_memory` / `write_memory`（`tool-registry.ts:355`、`:417`）——**没有 forget/delete 工具**。

### D.2 `deleteUserMemoryVectors` / `deleteEntriesByIds`

```
rag/index.ts:473-476
  deleteUserMemoryVectors(ragIds) → store.deleteEntriesByIds(ragIds, "user_memory")

rag/vectorstore.ts:535-547
  this.entries = this.entries.filter(entry => !idSet.has(entry.id) || (source !== undefined && entry.source !== source))
  if (deleted > 0) { this.dirty = true; this.markIndexDirty(); this.save() }
```

| 能力 | 说明 | 证据 |
|---|---|---|
| 只按 **ragId** 删，且必须 `source === "user_memory"` | 别 source 的同 id 条目不受影响 | `vectorstore.ts:539` |
| **同步**返回删除条数（非 Promise） | — | `vectorstore.ts:535` |
| 立即全量重写 `memory-store.json` | `save()` 写整个 `entries` 数组 | `vectorstore.ts:216-225` |
| **副作用：IVF 索引失效** | `markIndexDirty()` → `this.ivf = null` | `vectorstore.ts:315-317` |
| IVF **不会立即重建**，下次 `search` 时惰性重建 | `ensureIndex()`；仅 `entries.length >= 2` 时重建 | `vectorstore.ts:320-325` |
| 重建前/无 IVF 时**降级为全量线性扫描** | `search()` 的 else 分支 | `vectorstore.ts:490-506` |
| IVF 索引仅内存态，**不持久化** | 崩溃/重启后首次搜索重建 | `vectorstore.ts:170` |
| 索引参数 | `K ≈ sqrt(n)/2`，上限 512；搜索只探 `nprobe = max(2, K/8)` 个簇 | `vectorstore.ts:308`、`:464` |
| 索引元数据（`memory-store-meta.json`）**不因删除而变** | 只有切模型/维度不一致时才清 | `vectorstore.ts:204-214`、`rag/index.ts:110-126` |

> **重要边界**：删向量**不会**删 memory.json 里的 L2。
> 若 L2 仍 `status: active|aging` 且 `syncStatus: synced`，
> **下次启动的 reconciliation 会用 `provider.embed()` 把它重新嵌入并重新写上 ragId**（`memory-rag-reconciliation.ts:64-75,103-117`）——
> 即「只删向量」是**无效删除**，会复活。

### D.3 `deleteAllMemory()` —— 15 条路径，需重启

```
memory/memory-deletion.ts:15-31  MEMORY_TARGETS
  1  memory.json                        7  chat-social-atoms.json
  2  memory-trace.log                   8  worldbook-state.json
  3  relationship-log.json              9  proactive-state.json
  4  entity-graph.json                 10  rag-data/memory-store.json
  5  moments.json                      11  rag-data/memory-store-meta.json
  6  moments-state.json                12  rag-data/document-cache.json
  7  moments-reaction-queue.json       13  channels/history/       (目录)
                                      14  channels/archive/       (目录)
                                      15  (trace 重建一条 memory.deleteAll 审计，:78-87)

memory-deletion.ts:34-38  MEMORY_PRESERVED
  cyrene-chats/  channels-settings.json  zones.json
```

| 关键约束 | 证据 |
|---|---|
| **不删 `cyrene-chats/`**（桌面聊天记录保留） | `memory-deletion.ts:35`，注释 `:13` |
| **不删 `zones.json`** → 区块配置保留（scope 仍可解析） | `:37` |
| **不删 `channels/log.jsonl`、`channels/audit/`、`channels/context-bindings.json`** → **人标识仍在** | 不在 `MEMORY_TARGETS` 里 |
| **不删 Obsidian vault**（vault 在 userData 之外） | 无此路径 |
| 调用方**必须重启**，否则三处缓存把旧数据写回 | `memory-deletion.ts:55-57`；`memory-user-ipc.ts:144-154`（`restartRequired: true`，UI 提供「立即重启」`:156-160`） |
| 启动期 schema 闸门也走它 | `memory-schema-gate.ts:64` |

→ **`deleteAllMemory` 是「核弹」，不是「手术刀」。** 对本次需求只能作为兜底。

### D.4 Obsidian exporter / importer —— 会不会回流复活？

| 问题 | 答案 | 证据 |
|---|---|---|
| L2 在 PMRS 侧被删后，vault 里的 md 会怎样？ | md **留在原地**（导出器只在**下次导出时**按 manifest 删上次写的文件） | `obsidian-exporter.ts:439-458`（读旧 manifest → `unlinkSync`） |
| 会不会回流复活？ | **不会。** 导入器按 frontmatter `id` 精确查 L2，查不到就 `not-found` 直接返回 | `obsidian-importer.ts:148-155`（`if (!existing) return { id, ok:false, reason:"not-found" }`） |
| 导出器会清理孤儿文件吗？ | **只在下次导出时**。真正「孤儿」（用户手写、不在 manifest 里）**永不清理** | `obsidian-exporter.ts:442-454`（只删 `oldManifest.files`） |
| 那 vault 里会不会永久残留已删记忆明文？ | **会。** 如果删除后没触发过导出，`记忆/<slug>.md`（含 `content`、`sourceConversationId`，`obsidian-exporter.ts:157-177`）**一直留着** | 触发导出的条件：`memory-store.save()` → `notifyMemoryChanged()` → 2s 防抖（`memory-store.ts:97-98`、`obsidian-exporter.ts:637-656`）。而 **`deleteL2` 内部调用 `this.save()`，所以会触发一次导出**——但只在**已绑定 vault 且 autoSync 开启**时（`:639-641`） |
| `实体/<name>.md` 呢？ | 导出器会用「当前 L2 扫 content 命中的实体」重建反向链接（`obsidian-exporter.ts:525-551`）；**实体记录本身不会被删**（除非 `entity-graph.json` 里的实体被删） | — |
| 回流 watcher 何时启动？ | 绑定 vault 时（`memory-user-ipc.ts:227`）与**应用启动时若已绑定**（`:457-460`） | — |
| 用户在 Obsidian 里编辑那条孤儿 md，会怎样？ | watcher 触发 → `importL2Markdown` → `not-found`，**只记日志不写盘**（`obsidian-importer.ts:240-242` 只在 `changed` 时打日志）；随后 `notifyMemoryChanged` 被导入器跳过（`obsidian-importer.ts:149/162` 的 flag），**不会**触发反向导出清孤儿 | — |

> **隐私结论**：已删除的记忆明文可能长期滞留在 vault（userData 之外，`deleteAllMemory` 也不覆盖）。
> 「精确删除」若要彻底，必须**显式删除 vault 里对应 md 并触发一次导出重建 manifest**。

### D.5 `memory-rag-reconciliation.ts` 是做什么的？启动检查会不会恢复删掉的记忆？

**做什么**（`memory-rag-reconciliation.ts:54-130`）：保证 `memory.json` 的 L2 ↔ `rag-data/memory-store.json` 的向量一一对应。

```
:64-76   遍历 L2 —— 只处理 status ∈ {active, aging}
         vector 存在 && metadata.l2Id === memory.id && text === content  → 保留（必要时补 syncStatus）
         否则                                                          → 列入 rebuild
:78-80   vectors 中不在 validVectorIds 的 → 列入 staleVectorIds
:91      有变化先 deps.backup()（备份 memory.json + memory-store.json，保留 3 份）
:93-101  relink：同步 syncStatus
:103-117 rebuild：对 rebuild 列表 addVector + markSynced（**会真的调 embedding**）
:119-127 删除 staleVectorIds
```

**启动调用点**：`application/default-dependencies.ts:150-166`（`reconcileUserMemoryIndex`），
由 `:626-634` 的 `reconcileMemory` 在 background 阶段执行；前置条件是向量库可写（`:151-154`）。
备份实现：`memory-rag-reconciliation.ts:30-48` → `userData/memory-reconcile-backups/`。

**会不会把删掉的记忆恢复？**

| 场景 | 结果 |
|---|---|
| 删了 L2（memory.json 里没了）、向量还在 | **不会恢复 L2**。向量会被当 `staleVectorIds` **删掉**（`:78-80`）。这是正确的清理。 |
| 只删了向量、L2 还在且 active/aging | **会重建向量**（`:103-117`）→ 记忆**复活**（语义可召回）。**这是「只删向量」无效的原因。** |
| L2 被改成 `archived`/`superseded`/`merged` 而非删除 | `isSemanticallyRecallable` 返回 false（`:50-52`）→ 跳过 → 向量**不会被删**，但召回侧 `isL2LocallyRecallable` 也拦截（`memory-types.ts:84-91`）→ 不召回，留垃圾 |
| L2 被删、Obsidian md 还在 | **不会**从 md 恢复（导入器没有全量扫描/重建入口，只有 fs.watch 增量 + `importL2File`） |
| 想「从 Obsidian 重建全部记忆」 | **没有这个功能** —— `obsidian-importer.ts` 只有 watcher 驱动的增量回流 |

---

## E. 进程内缓存清单 —— 删除后必须失效的

| # | 缓存 | 位置 | 有失效/重载方法吗？ |
|---|---|---|---|
| 1 | **`memoryStore.cache`**（整个 MemoryStore 对象，含 l2/evidence/conflictLogs/l2DmaeStates） | `memory-store.ts:34` | ❌ **没有**。`load()` 命中 cache 直接返回（`:37`）。无 `reload()`/`invalidate()`。**只能重启**（`memory-deletion.ts:55-57`、`memory-user-ipc.ts:144-145`） |
| 2 | **`entityGraph.cache`** | `entity-graph.ts:64` | ⚠️ 只有 `reset()`（清空重建，`:204-207`），**没有 reload from disk**。想让「外部删除 entity-graph.json」生效，只能重启 |
| 3 | **`JsonVectorStore.entries`** | `vectorstore.ts:165` | ⚠️ 没有 reload。`load()` 只在构造时调一次（`:177`）。删除走 `deleteEntriesByIds` 直接改数组并 `save()`（`:535-547`）✅ 这部分是自洽的 |
| 4 | **`JsonVectorStore.ivf`（IVF 倒排索引）** | `vectorstore.ts:170` | ✅ `markIndexDirty()`（`:315-317`，私有，删除时自动调）+ `rebuildIndex()`（`:301-312`，**public**）+ `ensureIndex()` 惰性重建（`:320-325`）。**注意它只是内存态，不存在「磁盘索引要重建」的问题** |
| 5 | **`JsonVectorStore.indexMeta`** | `vectorstore.ts:167` | ❌ 无失效接口（只有切模型时清文件，`rag/index.ts:120-123`） |
| 6 | **`recent-injected-memory`（模块级数组）** | `recent-injected-memory.ts:14` | ✅ **有**：`clearRecentMemoryInjections()`（`:30-32`）—— **但只在测试里调用**（`build-memory-injection.test.ts:38`、`recent-injected-memory.test.ts:12`），**生产删除路径从不调用** |
| 7 | **`l2DmaeManager.dmae`（DMAE 引擎状态）+ `intrinsicValues` Map + `turnCounter`** | `l2-dmae-manager.ts:61-74` | ✅ **有**：`loadStates()`（`:77-91`，会 `dmae.clear()` + 重载）。但**没有 public 的 invalidate**，且 `loaded` 标志（`:74`）一旦 true 就不会再自动重载 |
| 8 | **`WorldbookManager.entries` + `dmae` 状态 + `lastCascadeEntries`** | `worldbook.ts:358-363` | ⚠️ 有 `loadFromDirectory()`（`:383-415`）/`loadFromEntries()`（`:419-423`），可重载。`worldbook-state.json` 本身是 no-op（`:643+`） |
| 9 | **jieba `customWords` Set** | `rag/retriever.ts:57` | ❌ **只增不减，没有 clear/remove 接口**。只有 `registerJiebaCustomWord`（`:60-62`）与 `registerJiebaCustomWords`（`:65-69`）。来源 `entity-graph.ts:153`（新实体）/`:232`（`feedEntityNamesToJieba` 启动灌入）、调用点 `rag/index.ts:54`。**删了实体，分词仍会把该名字强制合并** |
| 10 | **`momentsStore.cache`** | `moments-store.ts:50` | ❌ 无 reload（`initialize()` 只在 `cache` 为空时加载，`:95-102`） |
| 11 | **`socialAtomStore` 的 `atoms` + `loaded`** | `social-context/store.ts:27-28` | ⚠️ 只有 `replaceForTest()`（`:107-110`，测试用），**无生产 reload** |
| 12 | **`ZoneStore.state`（zones.json 进程内缓存）** | `zone-store.ts:55`、`load()` `:60-80` | ❌ 无 reload。**注意：`deleteZone()` 不删任何记忆**（`:170-178`，注释明说「成员回到独立域，不自动迁移数据」）→ 删 zone 后原 `zone:<id>` 的 L2 变成**悬空 scope，永远召回不到且无人能删** |
| 13 | **`ConversationBindingStore.state`** | `conversation-binding-store.ts:78` | ❌ 无 reload |
| 14 | **`RelationshipLogStore`** | `relationship-log.ts:130-146` | ✅ **无缓存**（每次 `readData` 读盘、`writeData` 写盘）→ 外部删除立即生效 |
| 15 | **`channel-context` 的 `sessionIndex`**（sessionId → {channel, senderId}） | `channel-context.ts:84-87` | ❌ 纯内存、上限 5000、**重启即空**（`:283-288`）。这是**唯一**「sessionId → 原始 senderId」的运行期映射，**不落盘** |
| 16 | **proactive 的 `recipientRegistry`** | `proactive-delivery.ts:27` | ❌ 纯内存、重启即空 |
| 17 | **`embedding` provider 缓存** | `rag/embedding.ts:291` | ✅ 有 `resetEmbeddingProvider()`（`rag/index.ts:451` 里调）；`resetRAG()`（`:446-452`）可整体重来，**但生产只在启动时 `initRAG`（`default-dependencies.ts:396`），无运行时调用** |

---

## F. 结论：现有数据能否把「QQ 群里的小明」和某条记忆关联起来？

### F.1 直接回答：**不能。**

| 关联所需的桥 | 存在吗 | 证据 |
|---|---|---|
| 记忆 → 原始消息 | ❌ `sourceMessageIds` / `evidence.messageIds` **生产路径为空** | A.2 / A.3 |
| 原始消息 → 说话人 | ✅ transcript 有 `speakerId`/`speakerName` | B.1 / B.3 |
| 记忆 → 人（结构化） | ❌ L2 无 person 字段；`sourceConversationId` 只到「哪个群」 | A.1 / A.4 |
| 记忆 → 人（文本） | ⚠️ 仅 `content`/`triggerText`/`sourceQuote` 里「碰巧出现人名」 | A.5 |
| 人 → 稳定 ID | ⚠️ 仅 `entity-graph.json` 的 `person` 实体有 id，但**不与 speakerId 关联、不指向 L2** | C.1 |
| 群里所有人 → 稳定 ID | ⚠️ `channels/history/` 与 `channels/archive/` 的 `speakerId`（QQ 号级）**存在**，但**只覆盖「说过话的人」，且与会话（群）绑定** | B.1 / B.2 |

**唯一可用的实操路径**（且都是启发式，不是精确）：

1. **文本搜人名**：在 `channels/history/<sessionId>.jsonl` + `archive/` 里 grep `speakerName`/`speakerId` → 拿到该人的发言原文与时间；
2. **反向文本匹配 L2**：拿这些原文片段去 L2 的 `content`/`triggerText`/`sourceQuote` 做子串/语义匹配；
3. **人工/LLM 复核**后，才对命中的 L2 执行删除。

这条路径的固有缺陷：
- L2 是 LLM **浓缩**后的结论（`memory-judge.ts`），原文里的人名可能根本没进 `content`；
- 压缩总结（`subEntryIds`）会把多人的记忆**揉成一条**，删它等于删别人的；
- 同一个群 → 同一个 `scope`，**scope 级删除无法区分人**；
- `archive` 只保留被截断的行（热层上限 200 行，`history-log.ts:50`），**早期原文可能已被归档，仍在**，但热点会话的完整时间线不保证。

### F.2 要支持「精确删除某个人」，缺失的最小能力集

| 需求 | 当前状态 | 需要补什么 |
|---|---|---|
| 记忆 ↔ 原始消息 | ❌ 空 | 写入时把 `speakerId` + transcript 行号/消息 id 落进 `evidence` |
| 人 → 稳定 ID | ⚠️ 半成品 | transcript 已有 `speakerId`（QQ 号）。**`speakerId` 本身就可当稳定 ID**，不需要新建 |
| 记忆 → 人 | ❌ | 在 L2（或 evidence）上新增 `speakerIds?: string[]`，由调度层从本轮 transcript 注入（与会话/群无关，是「本轮谁说的话被抽成了这条记忆」） |
| 群 → 人清单 | ⚠️ 可从 transcript 反推 | 需要一个「群成员/发言人索引」；当前只能扫 jsonl |
| 单条 L2 删除 API | ❌ 无 IPC、无工具 | 需要新增 IPC + 把 D.1 的 8 项遗留一并清 |
| 删除后缓存失效 | ❌ 大多没有 | 至少需要：`memoryStore` 加 `reload()`、`entityGraph` 加 `reload()`、调 `clearRecentMemoryInjections()`、`l2DmaeManager.loadStates()` |
| vault 明文清理 | ❌ | 删除后强制触发一次导出（重建 manifest），或直接把孤儿 md 拉进删除清单 |

### F.3 一句话结论

> **现有数据不支持「精确删除某个人」。** L2 记忆的最细归属是 `scope`（群/会话级）；
> 人名只以自由文本存在于 `content`/`triggerText`/`sourceQuote`，或作为 `entity-graph.json` 里
> 与渠道 `speakerId` **无关联**的 `person` 实体。
> `sourceMessageIds` 与 `evidence.messageIds` 在**所有生产写入路径上都是空的**，
> 因此不存在「记忆 → 原始消息 → speakerId」的可靠链路。
> 渠道 transcript（热层 + 温层归档）**确实**带 `speakerId`/`speakerName`，
> 但它是「会话维度」的记录，与记忆库之间**没有 join key**。
> 若要做精确删除，必须先补「L2/evidence 携带 speakerId」这一环（写入侧改造），
> 否则只能做「文本匹配 + 人工复核」的近似删除。
