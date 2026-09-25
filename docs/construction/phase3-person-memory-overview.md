# Phase 3 施工总概览：记忆人格化与「完全擦除」

> **前置阅读**：`docs/construction/phase1-group-context-observe.md`、`docs/construction/phase1.5-speaker-attribution-patch.md`、`docs/construction/phase2-zones-and-memory-isolation.md`（均已完成）
> **本阶段目标**：把「这条记忆是关于谁的」这条链打通，并在此之上实现「删除某个人 → 完全不认识，重头再来」。
> **状态**：P0 已完成并通过全部验收（含 4 条手工验证，施工记录见 §3.4）；P1 已完成并通过验收（自动化 + §5.2 手工验证，施工记录见 §3.5）；**P2 已完成，自动化验收全绿（施工记录见 §3.6），§5.2 手工验证待做**；**P3 已完成，自动化验收全绿（施工记录见 §3.8 / P3 文档 §9），§5.2 手工验证八步已全部跑完（1–6c 通过；第 2 步抓到并修复了 D1「控制台删除漏删向量」；**第 7 步主测通过、群内加测暴露 D5「`role=assistant` 的行未擦且逐字复述被擦者信息、每轮都进上下文」**；第 8 步改在群里做后通过）。**D1–D6 六条缺陷与 O2/O3/O4 三条观察已全部落地，各配有会变红的用例（§9.3b 第 16 条、§9.3d 第 21–22 条、§9.3e 第 23–25 条、§9.3f 第 26–29 条），并在真实数据上复测通过（§9.6.6）；门禁 500 文件 / 4655 通过 / tsc 0 错误 / vite build ✓**；**无未落地项** —— §9.6.7 只留三条如实记录的产品边界（`memory-trace.log` 的删除动作记录属有意保留、§6② 判据已改为该文件例外；"一个字都没提他"的旧版本孤儿回复结构上无法定位，只能靠文案说明；§6③ 是擦除那一刻的时点断言）。D5 的修复反转了 §2.5 约束 1（原为"不删昔涟自己的回复，接受残留"）；D4 把 `cyrene-runs/sessions/` 补进 `PERSON_ERASABLE`（12 → 13 条），把 `reviews/` 与 `tool-results/` 写进 `MEMORY_PRESERVED`（4 → 6 条）并纳入疑似残留清单；O2 把弹窗文案收敛成可被证据支撑的说法并列出保留清单。**；P3.5 待编写。

---

## 0. 背景

### 0.1 三种「串记忆」，修了两种

Phase 1 / 1.5 / 2 解决了群聊上下文与跨域隔离，但还剩一类没修：

| 种类 | 表现 | 状态 |
|---|---|---|
| 跨平台 | 群 A 的记忆出现在群 B | ✅ Phase 2 已修（`scope`） |
| 跨域 | 桌面/私聊记忆出现在群里 | ✅ Phase 2 已修（`scope` + `shouldInjectOwnerProfile`） |
| **域内跨人** | **小明的记忆被拿去回复小红** | ❌ **未修，且无字段可依** |

第三种与前两种性质不同：前两种是「房间串房间」，第三种是「**房间里人串人**」。Phase 2 把房间墙砌好了，但房间里没有座位号。

### 0.2 根因只有两条

1. **L2 记忆条目没有「人」维度。**
   `L2Memory`（`src/main/memory/memory-types.ts:31-80`）只有 `sourceConversationId`（会话）和 `scope`（记忆域），没有归属人字段。
   私聊场景天然可推（`chatId === senderId`，见 `src/main/channels/adapters/qq/onebot-normalizer.ts:155`），群聊场景完全无法追溯。

2. **「记忆 → 原始消息」的证据链从未接通。**
   `L2Memory.sourceMessageIds`（`memory-types.ts:64`）与 `MemoryEvidence.messageIds`（`memory-types.ts:166`）**类型定义里早就有，但没有任何生产代码往里写过**。
   原因有两层：记忆侧不填；**而且消息侧根本没有 id 可填** —— `HistoryEntry` 只有 `{ speakerId?, speakerName?, isBot?, triggered?, role, content, at }`（`src/main/channels/history-log.ts:32-45`），**没有消息 id**。（桌面对话消息反而有 `randomUUID`，见 `src/main/chats/chats-store.ts:356`，这是一个不对称。）

### 0.3 上下文层其实早就做对了

需要澄清一个容易混淆的点：**短期上下文本身已经是「房间 + 每条标说话人」的模型**，符合原始设计意图：

- 当前说话人带 `[群聊发送者：小明 (10001)]` 前缀（`src/main/channels/channel-context.ts:99-112`）
- 历史消息在喂给模型前重新补上 `[小明]:` 前缀（`src/main/channels/bootstrap.ts:181-189`）
- 旁听消息渲染成 `[小红]: 我想学画画` 注入（`src/main/channels/history-log.ts:303-321`）

**缺的不是上下文层，是长期记忆层。** PMRS 整条流水线（judge prompt / L0 / L1 / candidate schema）都是按「一个用户」写的；群聊接入时只换了 `scope`，没有把「一个用户」泛化成「多个人」。

最能说明问题的是 `src/main/memory/memory-manager.ts:74-80`：

```ts
// L0/L1 是 owner 级画像。群聊/独立域里的候选绝不能升级成 owner 的画像，
// 否则群里陌生人一句话就能改写"你是谁"。
if (!isOwnerScope(candidate.scope)) { continue }
```

这是代码在用「丢弃」回避「多用户建模」—— 后果是**群里每个人的长期信息处于半丢失状态**：L0/L1 全丢，只剩没有归属人的 L2 碎片。

---

## 1. 目标与验收标准

### 1.1 最终目标

让「昔涟对群里每个人的了解」可定位、可过滤、可删除，并支持**彻底擦除一个人**。

### 1.2 删除粒度阶梯

| 级别 | 语义 | 实现键 | 依赖阶段 |
|---|---|---|---|
| L1 | 删某一条记忆 | `l2.id` | P3 |
| L2 | 删某个来源会话 | `sourceConversationId` | **P3（不依赖改造，现在就能做）** |
| L3 | 删某个记忆域（区块/独立会话） | `scope` | **P3（同上）** |
| L4 | **删某个人（他说的 + 他的私聊）** | `speakerIds` + 私聊会话 | P3 |
| L5 | **同上，全局（跨群跨私聊）** | `personKey` | P3 |
| L6 | 全部 | 已有 `deleteAllMemory` | ✅ 已存在 |

> ⚠️ **`subjectIds` 不在删除判据里**（P3 已定，见 §2 的 Q2 行）：它只用于「按人浏览」的展示与 P3.5 的召回重排。**删的是「从他嘴里出来的」，留的是「别人提到他的」。**

### 1.3 「完全擦除」的验收标准

> **在他自己的会话上下文里**，你问「小明是谁」，昔涟应该反问「小明是谁呀？」

**⚠️ 判据是「来源」而不是「名字」**：要求她**不再拥有来自他本人的任何认知**（他说的、他和她的私聊全部消失），**不是**要求这个名字在系统里 0 出现 —— 别人转述他的记忆**有意保留**（Q2，见 §2）。

这个标准仍然很强，因为它要求**所有从他那条来源流出的东西**都清干净：L2、向量、transcript、审计、日志、备份、实体与关系。范围见 §4 与 P3 文档 §0.2 B。

---

## 2. 已定决策（本次拍板）

| # | 问题 | 决定 |
|---|---|---|
| Q1 | 「这个人」跨域吗？ | **全局删除** —— 他在所有群、所有私聊、所有域的痕迹一起清 |
| Q2 | 别人的记忆里提到他，删不删？ | **不删** —— 已落地为 P3 的**主判据**（不是边界特例）：删「他说的 + 他的私聊」，留「别人提到他的」 |
| Q3 | 审计日志怎么处理？ | **保留「删除动作」本身，清掉被删对象的内容** |
| Q4 | 删除后他再来？ | **重置** —— 从零重新认识，**不做永久屏蔽** |

### 从决策推导出的边界

- **群 transcript 是共享文件** → 删他 = **按 `speakerId` 逐行过滤重写**，不是删文件（群文件里还有别人的话）。
- **Q2 的落地形态（P3 §2.3 的三条理由）**：① B 不说就不会被调用；② 即便被调用，LLM 拿到的也只是「B 提过一个人」，够不上"认识"；③ **那条记忆往往同时是 B 自己的经历**（「我和小明去看漫展」），删它等于抹掉 B 的事。→ 因此验收标准按「**来源**」而不是「**名字**」判定。
- **Q2 的代价（已接受）**：别人提过他之后，昔涟可能表现出「听说过有这么个人」。**真正的补丁在 P3.5**：召回侧必须区分「说话人是提问者」与「只是有人提过他」。
- **Q3 的落地形态**：`memory-trace.log` 追加一条 `op: "memory.personErase"`，记录删除者、时间、`personKey`、命中数量；**不记录被删内容**。
- **Q4 的连带影响**：不做黑名单，所以删完之后如果群里别人继续聊他，昔涟会**重新**认识他。这是符合直觉的。

---

## 3. 分阶段路线

**五个阶段**，依赖严格串行（后一阶段消费前一阶段的产出）：

```
P0 删除镜像 ─► P1 消息身份 ─► P2 L2 人格化 ─► P3 擦除与记忆管理 ─► P3.5 召回侧改造
（减法清场）   （每条消息有 id） （只做数据层）    （按人浏览 / 完全擦除）   （串味 / 针对性回复）
```

| 阶段 | 产出 | 可独立验收？ | 用户可见效果 |
|---|---|---|---|
| **P0** ✅ | 删除「渠道消息镜像进桌面对话」整套功能（详见 §3.2） | ✅ 渠道照常工作，只是不再镜像 | 渠道消息不再出现在桌面对话里 |
| **P1** ✅ | 渠道消息有稳定 `id`，且 `id` 能从写入点冒泡到 dispatcher 层 | ✅ 纯增量，零行为变化 | 无 |
| **P2** ✅ | **只做数据层**：`L2Memory` 带 `speakerIds` / `subjectIds`、`sourceMessageIds` 落库、judge 输出归属、`personKey` 约定 | ✅ 可从 `memory.json` 观察到 | **无（纯铺垫）** |
| **P3** | 记忆管理控制台（按人浏览）+ 精确删除 + **完全擦除** | ✅ | **核心需求落地** |
| **P3.5** | 召回侧改造：工具侧归属过滤 → L2 底层注入接入 → 召回硬过滤 | ✅ | 群内**不再串味** + **针对性回复** |

> **P3 与 P3.5 的排序依据**：`P3 完全擦除` 是纯存储层操作（`subjectIds` 定位 + transcript 逐行过滤），**不依赖召回侧**，所以能先交付；
> **串味**与**针对性回复**都得改召回，是一件独立且带真实 prompt 行为风险的活，放最后单独做。
> 详见 §4.8。

### 3.1 为什么 P0 要排在 P1 前面

P0 与 P1 改的是**同一批文件**（`channel-context.ts` / `bootstrap.ts` / `dispatcher.ts`）。先删后加，避免「在旧结构上改一遍、再删一遍」。

而且 P0 是**减法**：删完之后 `channel-context.ts` 的绑定分支整段消失，P1 的改动从「要小心两个 return 点」变成直筒子，P2/P3 也少一条链路要照顾。

### 3.2 P0：删除镜像消息 —— 完整清单

**定位**：`channels/context-bindings.json` 存了**两样东西**，只有一样该删。

| 字段 | 用途 | 处置 |
|---|---|---|
| `bindings[]` | 渠道会话 ↔ 桌面对话的映射（镜像的载体） | ❌ **删** |
| `externalChats[]` | 见过的外部会话（含群名/昵称） | ✅ **必须保留** |

> ⚠️ **`externalChats` 是区块成员选择器的唯一数据源**（`src/renderer/settings/zones/picker.ts:36,46,64`），也是手动加群后补全群名的来源（`src/renderer/settings/zones/manual-group.ts:83`）。删掉它，区块就选不出成员了。

**背景依据**：Phase 2 蓝图已明确分工（`phase2-zones-and-memory-isolation.md:1526`）——`context-bindings` 管**消息映射**，区块管**记忆域**。本次删除的是前者。

**删除后的语义**：QQ 私聊放进 root 区块后，**仍然共享记忆域（L0/L1/L2）**，但**不再共享短期上下文**。这是正确的：短期上下文本就该按房间隔离，只有长期记忆该共享。

#### A. 消息持久化镜像（「双 id」的来源）

| # | 位置 | 动作 |
|---|---|---|
| 1 | `src/main/channels/bootstrap.ts:133-161` `appendBoundConversationMessage` | 整个删 |
| 2 | `src/main/channels/channel-context.ts:26-33` `BoundConversationMessageMetadata` | 整个删 |
| 3 | `src/main/channels/channel-context.ts:74-79` `appendBoundConversationMessage` option | 删 |
| 4 | `src/main/channels/channel-context.ts:222-240`、`254-273` 两处绑定写入分支 | 删 |
| 5 | `src/main/channels/dispatcher.ts:40` 的类型 re-export | 删 |

#### B. 绑定式上下文读取

| # | 位置 | 动作 |
|---|---|---|
| 6 | `src/main/channels/bootstrap.ts:116-119` `resolveBoundConversationId` | 整个删 |
| 7 | `src/main/channels/bootstrap.ts:121-131` `loadBoundConversationHistory` | 整个删 |
| 8 | `src/main/channels/channel-context.ts:22` `DispatchContext.boundConversationId` | 删字段 |
| 9 | `src/main/channels/channel-context.ts:59`、`64-67` 两个 options | 删 |
| 10 | `src/main/channels/channel-context.ts:149-167` `resolveDispatchContext` 绑定解析 | 简化为直接返回 sessionId |
| 11 | `src/main/channels/channel-context.ts:177-187` `resolvePriorMessages` 绑定分支 | 删，只走渠道历史 |
| 12 | `src/main/channels/dispatcher.ts:136-138` 队列 key 的绑定分支 | 删，只按 `external:<sessionId>` 串行 |

#### C. 实时广播（内存镜像，不落盘）

| # | 位置 | 动作 |
|---|---|---|
| 13 | `src/main/channels/dispatcher.ts:74-82` `DispatcherDeps.broadcastChat` | 删 |
| 14 | `src/main/channels/dispatcher.ts:181-195` 入站广播 | 删 |
| 15 | `src/main/channels/dispatcher.ts:277-291` 出站广播 | 删 |
| 16 | `src/main/channels/bootstrap.ts:340-376` `broadcastChat` 实现 | 删 |
| 17 | `src/main/channels/settings-store.ts:238,274,377,502` `mirrorToDesktop` | 删字段（注意兼容读取：旧配置多一个 key 应被忽略而非报错） |
| 18 | 镜像开关 UI 侧 4 处 | 删 `channels/panel.ts:9,284,350,366` 的读写、`channels/dom.ts:14` 的 `channelsMirrorEl`、`index.html:1174-1175` 的 `#channels-mirror-desktop`、`settings.ts:52` 的 import。<br>⚠️ `dom-refs-consistency.test.ts` 要求 HTML id 与 `dom.ts` 引用**双向一致**，两边必须同删 |
| 19 | `src/renderer/react/features/chat/hooks/useChannelMirrorEvents.ts` + `ChatPage.tsx:59,184` | 整个删（含 `.test.ts`） |

#### D. 绑定存储与 IPC

| # | 位置 | 动作 |
|---|---|---|
| 20 | `src/main/channels/conversation-binding-store.ts` | 删 `ChannelConversationBinding`、`isBinding`、`bind()`、`unbind()`、`resolve()`、快照的 `bindings` 字段，以及 `observe()` 里「已绑定会话优先保留」的裁剪逻辑（`:102-105`） |
| 21 | `src/main/channels/conversation-binding-api.ts` | 删 `bindContextConversation` / `unbindContextConversation` / `ContextBindingSnapshot.conversations` |
| 22 | `src/shared/ipc-channels.ts:455-457` | 删三条 IPC：`CHANNELS_CONTEXT_BINDINGS_GET` / `BIND` / `UNBIND` |
| 23 | `src/main/channels/init.ts:404-418` | 删三个 handler |
| 24 | `src/preload/index.ts:448-451` | 删三个转发 |
| 25 | `src/renderer/settings/channels/panel.ts:178,220-255,261` | 删绑定列表渲染 |
| 26 | `src/renderer/settings/index.html:1146` `#channels-context-bindings-list` | 删 |
| 27 | `src/renderer/settings/channels/dom.ts:55` | 删（⚠️ `dom-refs-consistency.test.ts` 会校验 id 一致性） |
| 28 | `src/renderer/settings/settings.css:4146` | 删 `.channels-context-bindings` |
| 29 | `src/renderer/settings/shared/types.ts:277,287,421` | 删 `ZoneBinding` / `channelsContextBindingsGet` 类型 |

#### E. 区块侧连带（容易漏）

| # | 位置 | 动作 |
|---|---|---|
| 30 | `src/main/zones/zones-ipc.ts:23-24,113-117` | 快照不再返回 `bindings` |
| 31 | `src/renderer/settings/zones/panel.ts:75-88` `describePrivateMapping` | 改为只显示私聊成员本身，不再显示"绑定到哪个桌面对话" |
| 32 | `src/main/zones/types.ts:6,15` 注释 | 更新心智模型（root 私聊不再镜像） |
| 33 | `src/renderer/settings/zones/dom.ts` / `index.html` | 若 `describePrivateMapping` 的展示位需要调整 |

#### F. 必须保留（别误删）

| 位置 | 为什么 |
|---|---|
| `conversation-binding-store.ts` 的 `externalChats` + `observe()` | 区块成员选择器的数据源 |
| `bootstrap.ts:105-114` `observeExternalChat` | 同上 |
| `bootstrap.ts:449` `getChannelConversationBindingStore().flush()` | 退出时落盘 |
| `zones/picker.ts` / `zones/manual-group.ts` | 依赖 `externalChats` |
| `conversation-binding-store.test.ts:191-232` | 锁住「已绑定会话优先保留」的裁剪行为 —— 删掉 bindings 后**这条测试的语义要改**（不再是「绑定的优先保留」，而是「最近活跃的优先保留」） |

#### G. P0 验收

```powershell
npx vitest run && npx tsc -p tsconfig.main.json && npx tsc -p tsconfig.preload.json && npx vite build
```

手工验证：
1. QQ 私聊昔涟 → **桌面对话列表里不再出现这条消息**，渠道侧正常收发
2. 设置 → 连接手机 → 绑定列表区域消失，无残留空白块
3. 设置 → 记忆区块 → 成员选择器仍能列出见过的外部会话（`externalChats` 保留验证）
4. 旧 `context-bindings.json`（含 `bindings[]`）加载不报错，`bindings` 被忽略

预期破坏：`dispatcher.test.ts`、`channel-context.test.ts`、`bootstrap.test.ts` 中所有绑定相关用例需删除或改写（三个文件合计 60+ 处匹配，其中 `dispatcher.test.ts` 有 5 个整用例是专测绑定的）。

### 3.4 P0 施工记录（已完成）

> **施工进度**：§3.2 清单 A–F 全部落地，验收命令全绿。

#### 与原清单的差异（施工中发现的、清单没写到的连带改动）

| 位置 | 为什么清单会漏 | 实际处置 |
|---|---|---|
| `conversation-binding-api.ts` | 清单只写了「删三个导出」，但该文件**只**服务绑定 UI，删完就空了 | 整个文件 + 其 `.test.ts` 一起删除 |
| `index.html` 的整张「上下文绑定」卡片 | 清单第 26 条只说删 `#channels-context-bindings-list`，但同卡片里的 `#channels-context-source` / `#channels-context-target` / `#channels-context-bind` / `#channels-context-feedback` 服务于**同一套已删除的 IPC**，留着就是死 UI | 整张 `channels-card` 删除 |
| `zones/panel.ts` 的 i18n 文案 | `privateMapping` 原模板是 `私聊映射：{{name}} → {{conversation}}（↔ 桌面双向镜像）`，绑定删掉后 `{{conversation}}` 永远取不到 | 模板简化成 `私聊映射：{{name}}`（zh-CN + en 同步） |
| `qqbot-adapter.test.ts` / `napcat-adapter.integration.test.ts` | 两处 `ChannelsSettings` 字面量里有 `mirrorToDesktop: false`，字段删掉后 `satisfies` 会报多余属性 | 删掉该行 |
| `conversation-binding-store.ts` 的旧文件兼容 | 清单要求「旧配置多一个 key 应被忽略而非报错」。仅 **不校验** 还不够：旧文件的 `bindings` 字段会被原样留在内存里，下一次 `persist()` 又写回磁盘，永远清不掉 | `PersistedBindingState` 不声明 `bindings`，读取只校验自己认识的字段；写回时该字段自然消失。已加测试锁住（含「重启后磁盘上不再有 bindings」） |

#### 明确保留（§3.2 F 逐条复核）

- `externalChats` + `observe()` + `getChannelConversationBindingStore().flush()` —— 区块成员选择器数据源，测试仍覆盖。
- `zones-ipc.ts` 的 `conversations`（桌面对话列表）**保留**：它被 `zones/panel.ts` 的 root 卡片只读行与 `zoneMemberCount` 使用，与绑定无关；清单第 30 条只要求快照不再返回 `bindings`。
- `chats-store` 的 `channelSource` 字段与其全部读取端 UI（`ChatMessageList` 的渠道来源标签等）**保留**：删除写入方后它不再被生产，属无害的死数据；清理它会牵动 `chats-store` / `chat-types` / 多个渲染组件，超出 P0「先清场」的范围。

#### 语义变化（行为上唯一需要注意的两点）

1. **并发模型变了**：删掉 `queue.run("conversation:<id>")` 这层嵌套后，两个**不同**外部会话不再因为绑到同一个桌面对话而互相串行；只有同一 `external:<sessionId>` 仍然串行。`dispatcher.test.ts` 已把用例改写为锁住新语义。
2. **`conversation-binding-store` 的裁剪语义变了**：从「已绑定会话优先保留」变成「最近活跃的优先保留」（`conversation-binding-store.test.ts` 对应用例已改写）。

#### 回归基线与结果

- 施工前基线：`vitest run` → 486 文件 / 4321 通过 / 1 skipped，全绿。
- 施工后：`vitest run` → **484 文件 / 4296 通过 / 1 skipped**，全绿；`tsc -p tsconfig.main.json` 与 `tsc -p tsconfig.preload.json` 均 0 错误；`vite build` 通过。
- 差额说明：`-2 文件 / -25 用例`，来自 2 个被整体删除的绑定专属文件（`conversation-binding-api.ts` + `.test.ts`、`useChannelMirrorEvents.ts` + `.test.ts`）与各套件中被删/被改写的绑定用例；同一批里也**新增**了若干锁住新语义的用例（如 `observeExternalChat 把见过的外部会话写进绑定存储`、旧 `bindings` key 兼容、同会话串行 / 跨会话并行）。

#### 手工验证（§3.2 G 四条，已全部完成）

环境：源码开发模式（`dist/main` + `dist/preload` 用 P0 代码重建，旧绑定/镜像符号 0 残留），
真实 QQ + NapCat，userData = `%APPDATA%\live2d-cyrene`。

| # | 验收项 | 结果 | 证据 |
|---|---|---|---|
| 1 | 渠道消息不再镜像进桌面对话 | ✅ | 私聊发一条 → 目标桌面对话消息数 **4 → 4 不变**、`channelSource` 消息 **0 条**、`updatedAt` **完全未变**；同轮 `channels/history/channel_qq_afc083f8a0114240.jsonl` 正常产生 2 行（user + assistant）→ 渠道侧未受影响 |
| 2 | 绑定区域消失、无残留空白 | ✅ | 「上下文绑定」整卡 + 镜像开关已删；人工目视确认 QQ 卡片与「全局」卡片之间**无空白块、无半截边框**；`dom-refs-consistency.test.ts`（HTML id ↔ `dom.ts` 引用双向校验）通过 |
| 3 | 成员选择器仍列出 `externalChats` | ✅ | 人工目视：root「添加成员」仍列出 4 条（`543627098` / `1055799748` / `323798863` 三群 + `2914636187` 私聊） |
| 4 | 旧 `bindings[]` 加载不报错、被忽略 | ✅ | 启动前文件含 `bindings`；运行后顶层键只剩 `version, externalChats`，**`bindings` 已从磁盘清除**，`version` 仍为 1，`externalChats` 4 条完好（含私聊观察记录），`log.jsonl` 绑定相关 error **0 条**（本轮零 error；日志中另两条 error 经时间戳确认是 09-17 / 09-20 的历史条目） |

> ⚠️ **验证 1 的方法学要点（下次复用）**：原始那条私聊绑定指向的桌面对话（`c9a20793-…`）**已被删除**，
> 而 `resolveBoundConversationId` 会校验桌面对话是否存在，因此原状态下它本来就返回 `null`，
> 直接测会得到**假阴性**。本次先把该绑定改指向一个**仍存在**的桌面对话再做验证，镜像路径才真正可达。
> 备份留在 `%APPDATA%\live2d-cyrene\channels\context-bindings.json.p0-backup`。

#### 手工验证期间发现（均与 P0 无关，另立议题）

1. **模型把元叙述当正文吐出来**：私聊那轮 assistant 正文是
   `用户发送了“测试~”，需要确认连接正常，并以昔涟明亮、温柔、自然的口吻在QQ即时通讯渠道中简短回复。\n\nBeiKia，收到啦！…`
   —— 即"第三人称复述情境 + 真回复"。已逐层排查确认**渠道侧的 reasoning 分流是正确的**：
   `openai-normalizer.ts`（`reasoning_content`→`reasoning_delta`、`content`→`text_delta`）、
   `accumulator.ts`（`thinking` / `text` 双字段）、`cyrene-harness.ts`（`bufferProgressContent(response.text)` 只取 `text`）
   三处都没有把思考混进正文。**结论：模型把元叙述写在了 `content` 通道里**，该轮无工具调用 → 被
   `commitProgressBuffer()` 直接 commit 成 `finalAnswer`。桌面路径共用同一套 harness/accumulator，
   故不是渠道特有回归。
2. **已知遗留（施工前就存在）**：`src/renderer/settings/channels/panel.ts` 的 `hadQqToken`
   在 `try` 内声明、却在 QQ 保存处理器里使用（TS2304）。删掉绑定/镜像代码后该问题仍在，未修。
3. **门禁局限**：渲染进程无 tsconfig，`vite build` 走 esbuild **不做类型检查**；本阶段仍以
   「全量 vitest + 两个 tsconfig + vite build」为准。

### 3.3 为什么 P1 单独成阶段

P1 上线后**没有任何用户可见变化**，看起来"白做"。这是有意的：

- 它是纯增量改动（只加字段、只改返回值），**风险最低**，适合先落地观察
- P2 的复杂度集中在「归属人怎么取、怎么存、怎么用」，如果把「消息 id」也混进去，一次改动面过大
- P1 完成后，P2 就只剩"消费"这一件事

**不要跳过 P1 直接做 P2** —— `subjectIds` 的可信度完全依赖 `sourceMessageIds` 能指回原话；没有指针，归属人就只能靠 LLM 猜，而"删除"场景下猜错的代价是删掉别人的记忆。

### 3.5 P1 施工记录（已完成）

> 详细记录（逐条落地、偏离、22 条新增用例清单）见 `docs/construction/phase3-p1-message-identity.md` §9。此处只留结论与新发现。

**落地**：P1 文档 §3.1 / §3.2 的 8 处改动全部按原文实现，四个调用方零改动。

**验收结果**：

| 项 | 基线 | 施工后 |
|---|---|---|
| `vitest run` | 484 文件 / 4296 passed / 1 skipped | **484 文件 / 4318 passed / 1 skipped**（+22 用例，零回归） |
| `tsc -p tsconfig.main.json` | 0 错误 | 0 错误 |
| `tsc -p tsconfig.preload.json` | 0 错误 | 0 错误 |
| `vite build` | 通过 | 通过 |
| §5.2 手工验证（真实 QQ + NapCat） | — | **✅ 通过**：群 `543627098` 的 user/assistant/旁听三行全部带 `msg_*` id，`triggered` 分别为 `true`/—/`false`，id 全局唯一 |

§4.1「assistant 消息时序」的结论**已被代码确认**（`dispatcher.ts` 里 `appendIncomingContext` 在 `buildAndRunAgent` 之前、`appendAssistantContext` 在其之后），P2 只指向 user 消息的设计前提成立。

**新发现（对 P2/P3 有价值）**：

1. **⚠️「在测试里写类型断言当防线」在本仓库不成立**。`tsconfig.main.json` 显式 `exclude` 掉 `*.test.ts`，仓库没有覆盖测试的 tsconfig，vitest 与 vite build 都走 esbuild **不做类型检查** —— 类型断言写进 `.test.ts` 不会拦任何人（P1 文档 §4.3 原本把它当"编译期防线"，实际是纸做的）。P1 已用**运行时**用例补上等价保证；**P2/P3 若要用类型防线（例如"`subjectIds` 不允许空数组"），必须同时提供运行时断言**，否则等于没写。
2. **`typeof someFunction` 作为注入点类型是脆的**：被引用函数的返回值一变，该字段类型跟着变，原本合法的 void 桩函数立刻不可赋值（P1 在 `proactive-delivery.ts` 上撞到）。
3. **P1 的自动化验收已经覆盖 §0.3 的验收标准**：`history-log.test.ts` 里有一条用例用**真实** `appendHistory` + 真实 `createChannelContext`（接线与 `bootstrap.ts` 一致）断言"返回值的 id == 落盘最后一行的 id"，不需要 QQ 就能验证主链路。
4. **⚠️⚠️ 「记忆格式升级」闸门会连渠道 transcript 一起清空 —— P3 必须处理这个交集**（详见 P1 文档 §9.6 末）：
   手工验证期间，启动期 `runMemorySchemaGate()`（`memory-schema-gate.ts`）发现 `memory.json` 还是 `schemaVersion: 2`，
   用户点「清空记忆并继续」后调用 `deleteAllMemory()`，而 `MEMORY_TARGETS`（`memory-deletion.ts:15-31`）
   **显式包含 `channels/history/` 与 `channels/archive/`** —— 两个老 transcript 文件被一并删除（`memory-trace.log` 有 `memory.deleteAll` / `migration.zoneUpgrade` 双条审计）。
   后果与 P3 的关系：
   - **语义冲突**：`deleteAllMemory` 是"整目录删"，P3 的「完全擦除某人」是"按 `speakerId` 逐行过滤重写、保留别人的话"。两者作用域重叠，**不能共用实现**，否则"删一个人"会顺手动到别人的 transcript。
   - **提示文案与行为不一致**：升级弹框只说"旧记忆将被清空（桌面对话记录会保留）"，**没提渠道聊天记录也会一起没**。建议另立议题修文案。
   - **验证流程教训**：做 transcript 相关手工验证前，先备份 `channels/` —— 否则"老数据兼容"这一类样本会被闸门吃掉，只能退回单元测试（P1 §5.2 第 5 条就是这样失去真实样本的）。

---

### 3.6 P2 施工记录（已完成，自动化验收全绿）

> 详细记录（逐条落地、5 条偏离、+86 条用例分布、对 P3/P3.5 的新发现）见 `docs/construction/phase3-p2-l2-person-attribution.md` §9。此处只留结论与新发现。

**落地**：P2 文档 §3.1–§3.8 的归属链路（dispatcher → bootstrap → agent-runtime → build-options → memory-scheduler → L2 落库）与判定侧（judge prompt / JSON schema / 解析校验）、压缩与消解继承全部实现。**召回侧一行未改**（§3.6 移出项确认没有消费者，`buildMemoryInjection` / `ToolContext` 完全未触碰）。

**验收结果**：

| 项 | 基线（P1 之后） | 施工后 |
|---|---|---|
| `vitest run` | 484 文件 / 4318 passed / 1 skipped | **485 文件 / 4403 passed / 1 skipped**（+1 文件 / +85 用例，零回归） |
| `tsc -p tsconfig.main.json` | 0 错误 | 0 错误 |
| `tsc -p tsconfig.preload.json` | 0 错误 | 0 错误 |
| `vite build` | 通过 | 通过 |
| §5.2 手工验证（真实 QQ） | — | ⬜ **待做**（只承担「LLM 真会输出 `subjectNames` 吗」这一件无法 mock 的事） |

**数据模型落地**（§6 的 P2 部分全部兑现）：

```
memory.json  L2Memory
  + speakerIds?: string[]         ✅ 谁说的 —— 证据归因
  + subjectIds?: string[]         ✅ 关于谁 —— 召回过滤/删除定位
  ~ sourceMessageIds              ✅ 由空转为真实填充（连带 MemoryEvidence.messageIds 有值）
memory.json  MemoryEvidence
  ~ messageIds                    ✅ 同上
  ~ conversationId                ✅ write_memory 工具路径补上（此前为空串）
```

**新发现（对 P3 / P3.5 有价值）**：

1. **⚠️⚠️ 「单人发言」绝不能等同于「单人会话」** —— P2 文档原本给的单人兜底判据是「本批 turns 的 personKey 去重后只剩一个」，**首次按原文实现后被新用例当场证伪**："群里只有小明说过一句话"也满足该判据，于是**纯项目进展（公共记忆）会被兜底成「关于小明」**。而 P3 的删除正是按 `subjectIds` 定位的 —— **标错就等于删错人的记忆**（§1.3 的代价）。恰好 P2 §0.2 的验收样例（B 单人说「小明最近在学 Rust」、小明不在场）就落在坑里。**正确判据是 `IncomingMessage.chatType === "private"`**（bootstrap 层本来就持有，已随归属一并透传）。
   > **P3.5 直接取用**：做"认提问者"的重排时，判据必须取自 `chatType` 或工具上下文里的会话类型，**不要用「本批只有一个 speaker」作代理**。
2. **归属链可被完整自动化验证，不需要 QQ**（这改变了 §7「手工验证要测什么」的分工）：`memory-scheduler.test.ts` 用真 `MemoryScheduler` + 桩 judge 断言 `turns[].personKey` → `subjectIds` → `writeMemory` 收到的候选；`dispatcher.test.ts` 用真 `createChannelContext` + `appendHistory` 桩断言「第 4 参数 == 落盘那条记录的 id」；`bootstrap.test.ts` 断言 `onRunFinished` 收到的 context 四个归属字段。→ §5.2 手工验证因此只需验证 **LLM 是否真的按 prompt 输出 `subjectNames` / `sourceTurnIndexes`**。
3. **⚠️ `require()` 是测试盲区**：`tool-registry.ts` 的 `read_memory` / `write_memory` 用 `require()` 懒加载 memory 模块，而 `require` 在 ESM 打包产物与 vitest 下**都不可拦截** → 这两条路径**无法单测**（写 P2 §4.2 要求的回归用例时实测撞到 `Cannot find module`）。已改为动态 `import()`（懒加载语义不变，可 mock）。**本仓库其他 `require()` 懒加载点（如 fs-tools）有同样问题。**
4. **`tsconfig.main.json` 排除 `*.test.ts`**（§3.5 新发现 1 再次确认）：P2 的 5 层透传**只能靠运行时用例兜**，任何一个字段少接一层都会"编译通过但静默失效" —— 4 个归属字段 × 5 层的用例是唯一防线，不是可选项。
5. **归属不外泄到插件事件**：`AgentRunFinishedContext` 与插件 `turn:completed` 事件同源，已加用例锁住「归属只走记忆链路，不进插件载荷」—— 否则会把群成员 QQ 号顺带塞进第三方插件的事件流。

---

### 3.7 P3 交付概要（详见 `phase3-p3-erasure-and-console.md`）

P3 交付三件事，**全部在存储层与 UI，不碰召回侧**：

| # | 交付 | 关键内容 |
|---|---|---|
| ① | **删除内核** | 新增唯一删除入口 `deleteL2Cascade(ids)`。现状 `memoryStore.deleteL2`（`memory-store.ts:277-288`）只清 `l2` + `evidence`，**漏 6 处**：向量、`l2DmaeStates`、`conflictLogs`、`conflictWith`/`supersededBy`/`mergedInto` 悬空指针、引用它的压缩总结、`reflectionLogs` 里的原文 |
| ② | **完全擦除** | `erasePerson(personKey)`：**两条命中规则 + 一条保留**（删：他说的话 / 他的私聊会话内的一切；留：别人提到他的）→ **14 类载体** + 7 处缓存 + 审计。含 transcript 逐行过滤重写、压缩总结**去压缩**（删总结 + 恢复幸存子条目，零 LLM）、**关系日志按人删（它是唯一每轮都进主聊天的载体，见 P3 §2.10）**、备份与调试日志整份销毁。**有意保留两样：群聊语料（§5）+ 别人转述他的记忆（§2 Q2）** |
| ③ | **记忆管理控制台** | 设置 → 记忆 → 「记忆管理」：按人 / 按域 / 按会话三视图 + 单条/批量删除 + 溯源（`sourceMessageIds` 跳回原话）+ 彻底擦除（**预演 → 二次确认 → 执行 → 报告**） |

**本阶段确立的两条判据（P3.5 会直接复用）**：

- **R2（删）**：`speakerIds ∋ 他` —— **从他嘴里出来的**，无论在哪个会话里。
- **K（留）**：只有 `subjectIds ∋ 他`、`speakerIds` 不含他 —— **别人提到他的**。这就是 Q2 的落地形态，**也是 P3.5 召回硬过滤的原型**：K 类记忆在召回时只能说成「某位群友提过」，不能说成「我了解他」。

> ⚠️ **`subjectIds` 从此只服务「展示」与「P3.5 召回」，不再参与任何删除判据** —— 这是 P3 刻意收缩出来的一条边界（P3 文档 §2.2 的类型设计里锁住了它）。

**不需要重启**：与「删除全部记忆」（必须重启，`memory-user-ipc.ts:143-154`）最大的体验差别 —— 擦除全程走内存缓存失效（`memoryStore` 原地 mutate、`l2DmaeManager.loadStates()`、`entityGraph` 原地移除、`vectorstore` 自带 `markIndexDirty`）。

---

### 3.8 P3 施工记录（已完成，自动化验收全绿）

> 详细记录（逐条落地、12 条偏离、测试文件清单、8 条新坑）见 `docs/construction/phase3-p3-erasure-and-console.md` §9。此处只留结论与新发现。

**落地**：§3 的 A–E 全部实现 —— 删除内核（`deleteL2Cascade` + 纯函数 `planL2Cascade`/`previewL2Cascade`）、完全擦除（`person-erase-plan.ts` 判据 + `person-erasure.ts` 12 步编排 + `transcript-erasure.ts` 同步重写）、记忆管理控制台（`memory-console.ts` + 6 条 IPC + 渲染侧三视图/预演确认报告）、外围 10 个模块的按人删除 API。**召回侧一行未改。**

**验收结果**：

| 项 | 基线（P2 之后） | 施工后 |
|---|---|---|
| `vitest run` | 487 文件 / 4433 passed / 1 skipped | **499 文件 / 4621 passed / 1 skipped**（+12 文件 / +188 用例，零回归） |
| `tsc -p tsconfig.main.json` | 0 错误 | 0 错误 |
| `tsc -p tsconfig.preload.json` | 0 错误 | 0 错误 |
| `vite build` | 通过 | 通过 |
| §5.2 手工验证（真实 QQ） | — | ⬜ **待做**（只剩"真实数据长什么样"这一件无法 mock 的事） |

**新发现（对 P3.5 最有价值的三条）**：

1. **⚠️ `JsonVectorStore.addUnique()` 不去重**（名字骗人）：它不走 `add()` 那套 `search(..., 0.95)` 语义去重，直接插入。所以"先删后建"的写法一旦只删了一半就会留下**同一 `l2Id` 的重复向量行**，而重复行会被 `rag/index.ts` 的双向一致检查判成孤儿。→ P3.5 重建向量前先确认该条当前有没有向量。
2. **⚠️ 压缩**不删**子条目的向量，只是把 `status` 置 `archived`。** "被压缩"与"被删向量"是两件事 —— 所以 P3 的**去压缩**只把 `status` 还原为 `active`，向量健康就原样复用（原方案写的"先删后建"会平白删掉一条 K 类记忆的向量，与 §4.5 的验收标准冲突）。
3. **⭐ 判据已沉淀成可复用件**：`person-erase-plan.ts` 的 `computeEraseHits`/`buildPrivateSessions`/`buildSpeakingSessions`（纯函数）+ `relationship-log.ts` 的 `matchesRemovedUserTextFingerprint`（纯函数）+ `memory-console.ts` 的 `own`/`mentioned` 分组 —— **P3.5 的召回硬过滤可以直接取用这三处**，不必重写"谁是说话人、谁是主语"。

> 其他坑（`build-options` 实参名、`require()` 在 ESM 下不可用、归档空目录的触发条件、`deleteAllMemory().deleted` 混入绝对路径）见 P3 文档 §9.3 / §9.5。

---

## 4. 跨阶段关键约束（现在就必须知道）

这几条会贯穿三个阶段，方案设计时必须预留，否则到 P2/P3 会推倒重来。

### 4.1 ⚠️ assistant 消息的时序问题

渠道路径的实际顺序（`src/main/channels/dispatcher.ts`）：

```
218  await appendIncomingContext(msg, context)     ← user 消息此时落盘，id 可得
224  await buildAndRunAgent(...)                   ← run 期间触发 onRunFinished
       └─ src/main/channels/bootstrap.ts:299 → agentRuntime.onRunFinished(...)
            └─ src/main/orchestrator/build-options.ts:995 → scheduleMemoryWrite(...)
309  await appendAssistantContext(...)             ← assistant 消息此时才落盘
```

**也就是说：`scheduleMemoryWrite` 触发时，assistant 消息的 id 还不存在。**

**应对（P2 采用）**：记忆只需指向 **user 消息**。理由：judge prompt 明确要求「必须是用户主动表达的信息，不是 AI 说的」（`src/main/memory/memory-judge.ts:85`），assistant 侧对事实溯源价值很低。这样 P1 只需保证 user 消息的 id 在 `appendIncomingContext` 返回时可取。

### 4.2 ✅ 镜像消息的「双 id」—— 已由 P0 消除

**（原约束，现已被 P0 删除镜像功能解决，保留记录备查）**

原状态下，开了 `mirrorToDesktop` 或私聊绑定桌面对话时，同一条消息在两处各有一份：

| 位置 | id |
|---|---|
| `channels/history/<sessionId>.jsonl` | P1 新增的 `msg_*` |
| `cyrene-chats/sessions/<id>.json` | 已有的 `randomUUID`（`bootstrap.ts:140`） |

P0 删除镜像功能后，渠道消息**不再写进桌面对话文件**，双 id 场景消失。
**仍保留的约定**：`L2Memory.sourceConversationId` 记录的始终是**渠道 sessionId**，指向的消息 id 也只能是渠道 transcript 的 `msg_*`。

### 4.3 ⚠️ 私聊 transcript 没有 `speakerId`

`src/main/channels/channel-context.ts:216` 对非群聊传 `meta = undefined`，所以私聊消息不写 `speakerId`。

**影响**：P3 的「全局擦除」按 `speakerId` 扫 transcript 时，**私聊文件会漏掉**。
**应对**：私聊会话 ↔ 人一一对应（`chatId === senderId`），擦除时对私聊**整文件处理**，无需 `speakerId`。这条要在 P3 文档里显式实现。

### 4.4 ⚠️ 压缩总结会混合多人

`src/main/memory/memory-compressor.ts:31-80` 按**同域**聚类，一条总结可能同时压缩小明的和小红的三条碎片（`subEntryIds`）。

**P3 删除时必须选一个策略**（无免费选项）：
- 删总结 → 连累小红的信息
- 留总结 → 正文里可能还有小明的事，等于没删干净
- 重新生成 → 要调 LLM，重算文本不可控
- ✅ **P3 实际选的是第 4 条：去压缩（de-compress）** —— 删掉总结，把**幸存**子条目（`subEntryIds \ 被删 id`）确定性还原为 `active` 并重建向量。零 LLM、不丢别人的信息，且因为压缩器的候选集只收 `status === "active"`（`memory-compressor.ts:34`），"还原为 active"就是**精确回到压缩前状态**，不是猜测。完整推导见 P3 文档 §2.6。

### 4.5 ⚠️ L0/L1 是结构化文本，删不掉（P3 已降级为「本地名字匹配 + 人工确认」）

如果主人的 `permanentNote` 里写着「我的网友小明喜欢喝咖啡」，这条文本**没有归属人字段**，结构上无法定位。

**原打算**：P3 擦除流程中加一步「**LLM 扫描 L0/L1，列出疑似提及，人工确认后编辑**」。

**P3 实际采用的方案（更省、更可靠）**：**不调 LLM**，改用「已知名字集合的子串匹配」产出「疑似残留清单」，由人工确认后自行编辑。理由与完整范围见 **P3 文档 §2.12**。

> 结论不变（L0/L1 的文本残留**不自动改**，这是"完全擦除"里最容易被漏掉的地方），只是实现从 LLM 降级为确定性匹配。

### 4.6 删除必须与后台写入串行化

记忆写入跑在 `enqueueLLMTask` 的**全局 FIFO 串行队列**（`src/main/llm-queue.ts:33-63`）。

**P3 的删除任务也入同一个队列**，天然与 judge 写入串行，零竞态。代价是删除要排队等当前 LLM 调用跑完（数秒），UI 给「正在排队」状态即可。

### 4.7 缓存清单（"立刻生效"的关键）

「完全擦除」不能要求重启。P3 逐项核实后的结论（**其中两条与原判断不同**）：

| 缓存 | 位置 | 现状与 P3 处置 |
|---|---|---|
| `memoryStore.cache` | `src/main/memory/memory-store.ts:35` | ✅ **不需要新增 `reload()`** —— 重新判断：所有写路径都是「mutate 缓存对象 + `save()`」，级联删除同样走这条路，缓存与磁盘始终同源。⚠️ 但 `getAllL2()` 返回**数组引用**（`:364-367`），`store.l2 = filter(...)` 会换掉数组身份 → 删除后必须重新取，不能复用旧引用 |
| `entityGraph.cache` | `src/main/memory/entity-graph.ts:64` | ⚠️ 只有 `reset()`（全清）→ P3 新增 `removeEntities({names,…})`（内部 mutate + `save()`） |
| `JsonVectorStore.entries` / `.ivf` | `src/main/rag/vectorstore.ts:165,170` | ✅ `deleteEntriesByIds` 内部已 `markIndexDirty()` + `save()` |
| `recent-injected-memory` | `src/main/memory/recent-injected-memory.ts:14` | ⚠️ 现有 `clearRecentMemoryInjections()`（`:30`）是**全清** → P3 新增 `forgetMemoryInjections(ids)`（按 id） |
| `l2DmaeManager` | `src/main/memory/l2-dmae-manager.ts:61-74` | ✅ **有现成的全量失效入口**：`loadStates()`（`:77-91`）内部 `dmae.clear()` + 按 store 重建 → 擦除后直接调用，无需新增 API |
| `channel-context.sessionIndex` | `src/main/channels/channel-context.ts:71-74` | ⚠️ 除 5000 条 LRU 外无移除入口 → P3 新增 `forgetSessionIndex(senderId)` |
| jieba 自定义词表 | `src/main/rag/retriever.ts:57-67` | ❌ 只增不减、无移除 API → P3 明确接受残留（只影响分词，不影响"认识"） |

### 4.8 ⚠️⚠️ L2 记忆**不进主聊天 prompt**，但串记忆问题依然存在 —— 它换了扇门

P2 核对召回链路时发现的现状。**它同时解释了"为什么问题还在"和"为什么 P2.5 阶段被拆出来"。**

#### 事实一：自动注入路径上，L2 根本没进 prompt

全仓核实（只列生产调用点）：

| 事实 | 证据 |
|---|---|
| `buildMemoryInjection()`（`【相关记忆】` 块）**只有两个调用方** | `src/main/call/call-prompt-builder.ts:58`（语音通话）、`src/main/proactive/proactive-lifecycle.ts:110`（主动消息） |
| 主聊天走的 `buildAlwaysOnContext()` **不调用它** | `src/main/orchestrator/index.ts:112-214` 只注入：世界书、【群聊近期上下文】、L0/L1 画像 |
| `l2DmaeManager.updateActivation()` 生产调用点**只有语音通话** | `src/main/call/call-prompt-builder.ts:51` |
| `searchMemory(..., 'user_memory', ...)` 生产调用点**只有 `user_memory` 工具** | `src/main/orchestrator/tools/registry/tool-registry.ts:256` |

> **在桌面聊天和渠道群聊/私聊里，L2 记忆不会自动进入上下文**，只能靠模型主动调用 `user_memory` / `read_memory` 工具捞。
> 整套 L2 + DMAE v5（含 `l2DmaeStates` 持久化与仿真器）在**主聊天路径上是空转的**。

#### 事实二：⚠️ 串记忆**没有消失，只是换了扇门 —— 而且更严重**

L2 进不了 prompt ≠ 群成员记忆不串。**它从"自动注入"搬到了"工具调用"**：

```
群里小明问「@昔涟 你记得我什么？」
  → 模型调用 user_memory 工具
  → searchMemory(query, 'user_memory', topK, { scopeId })
  → scopeId 只到「哪个群」→ 返回的池子里混着小明、小红、所有人的记忆
  → 模型把小红的事当成小明的事说出来
```

| 维度 | 自动注入（语音通话 / 主动消息） | 工具路径（**主聊天实际走的**） |
|---|---|---|
| 候选范围 | DMAE 门控后的 top-4，有筛选 | **原始检索命中**，无任何人物过滤 |
| 模型如何使用 | 作为"相关记忆"背景 | **直接当成"你说过的话"复述**（"我记得你……"） |
| 出错可见度 | 隐蔽 | **正面翻车** —— 用户当场发现"这不是我说的" |

**所以当前串记忆的主战场是 `user_memory` / `read_memory` 两个工具，不是 `buildMemoryInjection`。**

#### 事实三：三个目标分属不同阶段

| 目标 | 修在哪 | 为什么 |
|---|---|---|
| P2 归属字段落库 | ✅ P2 | 纯存储层，与其他目标解耦 |
| **串记忆（工具路径）** | **P3.5** | 需要"召回侧认归属" —— 重排 / 过滤 |
| **针对性回复** | **P3.5** | 需要先把 L2 接进主聊天路径（改底层注入），再谈排序 |
| **精确删除 / 完全擦除** | **P3** | 纯存储层，**不依赖召回侧** ✅ |

#### 处置：P2 收窄为纯铺垫，召回侧独立为 P3.5

**P2 只做采集与落库，不碰召回侧。** 三条理由：

1. 召回侧改造（工具侧过滤 + 注入接入 + DMAE 推进 + 硬过滤）是一件完整的、带真实 prompt 行为风险的独立工作 —— 串味、啰嗦、token 成本三重风险。混进 P2 会让"纯数据层改动"也背上这些风险，**验收标准也会变得含糊**。
2. **P3 的擦除不依赖召回侧**，把召回改造排到 P3 之后不影响主线交付。
3. P2 的归属字段正是 P3.5 的前置条件 —— **先有数据，再谈怎么用**。

> P2 文档：§0.4（本节详情）、§3.6（移出清单与 P3.5 完整范围）、§3.9（L2 底层注入改造方案，已记录待 P3.5 展开）。

### 4.9 ⚠️ P3 侦察新发现：三处**含正文**的载体，都不在 `MEMORY_TARGETS` 里

| 载体 | 内容 | 为什么要紧 |
|---|---|---|
| `memory.backup.<ISO>.json`（`memory-store-io.ts:19-25`，**无保留期上限**） | `memory.json` 整份副本 | **留着 = 从备份回退时他会复活** |
| `memory-reconcile-backups/{memory,memory-store}.<ts>.json`（`memory-rag-reconciliation.ts:30-48`，每前缀留 3 份） | 记忆 + 向量库整份副本 | 同上 |
| `chat-api.log`（`chat-api-utils.ts:20-47`，由 `llm-client.ts:162` 每次模型调用后无条件写入；**无滚动上限、全仓无读取方**） | **完整 prompt messages + response** | 它是"他说过什么"最完整的副本，比 transcript 还全 |

**连带发现（既有缺陷，与 P3 同批修）**：`deleteAllMemory`（`memory-deletion.ts:61-93`）**不删任何记忆备份** → 点了「删除全部记忆」后磁盘上仍有若干份完整旧 `memory.json`（本机实测 2 个 `memory.backup.*.json`），与该按钮文案不符。P3 把 `memory-reconcile-backups/` 加进 `MEMORY_TARGETS`、把 `memory.backup.*.json` 做成单独 glob 清单，并在 `deleteAllMemory` 里展开。

**另一个既有缺陷（只记录，不在 P3 修）**：`chat-api.log` 没有任何大小上限，会无限增长且含全部 prompt 正文 —— 建议另立议题给它加「开关 + 上限」。

---

## 5. 明确不做的事

| 不做 | 原因 |
|---|---|
| **不给群成员建 L0/L1 分块** | L0 的五个固定格子（称呼/职业/长期兴趣/语言/永久备注）装不下"群成员的特点"；群聊几乎不会出现满足 `certainty=explicit + attribution=user_explicit` 的画像声明，格子会空着；而 LLM 成本 × 人数。**带标签的 L2 比强行压缩的画像更有用。** |
| **不迁移存量记忆的归属** | 老 L2 没有指针、老消息没有 id，**结构上无法回溯**。存量只能按域删或保持"来源未知"。 |
| **不引入 SQLite** | 本方案全程可在现有 `memory.json` + JSONL 上完成。Memory v2 那套（SQLite / Claim / Episode / Saga）与本需求赛道不同，且其"全局共享不做隔离"的原则与 Phase 2 冲突。 |
| **不做永久屏蔽 / 黑名单** | Q4 定为「重置」。 |
| **不动朋友圈 / 社交原子** | `moments.json` 的 author 只有 `user`/`cyrene`/角色，与外部人无关；`chat-social-atoms.json` 写入闸门要求 `isOwnerScope`（`build-options.ts:527-540`），而 `resolveScopeId` 对 `channel:*` 会话**永不返回 rootScope**（`zones/scope.ts:28-34`）→ **渠道会话永远不会写社交原子**（P3 侦察已逐条核实）。 |
| **不动 `channels-settings.json`** | 它有 `toolAccess.entries[].userId` / `pairingPending[].senderId`（QQ 号），但那是**访问控制配置**，`MEMORY_PRESERVED` 显式保留；删它等于悄悄撤权，且不含对话内容。 |
| **不动桌面对话里的渠道残留** | `ChatMessageChannelSource` 只有 `channel`/`chatType?`/`senderName?`（`chat-types.ts:112-116`），**没有 `senderId`**；按昵称匹配违反"宁可不删不可删错" → P3 只列清单。 |
| **不给 `channels/log.jsonl` 加 id** | 它是"给人看的运行日志"，与记忆链路无关；且滚动上限 1000 行，不适合做溯源。（⚠️ 注意：**擦除某人时仍会按 `senderId` 清掉它的相关行** —— 那是"清痕迹"，与"加 id 做溯源"是两件事。） |
| **🚫 不从群聊语料 `group-corpus/` 里删任何东西** | 语料是**只增不减的长期资产**（`docs/group-corpus.md:64-78` 的三道保护），且**只写不读、零生产消费方** → 它不进 prompt、不进召回，**不影响"昔涟认不认识他"**。所以 P3 的擦除范围里**整个不含语料**：不读、不写、不删，连路径字面量都不出现在擦除代码里（`group-corpus-isolation.test.ts` 的"零消费方"守卫会拦住）。<br>🔗 **将来自学习 T0 的正确做法**：在**蒸馏时按排除名单跳过**（建议哈希名单，只存 `sha256(personKey)`），**永远不就地删语料行**。记录在 `docs/group-corpus.md` §8 + P3 文档 §0.4 约束 2。 |

---

## 6. 数据模型变更总览（P1–P3 累计）

只列**新增字段**，不改现有字段语义：

```
channels/history/*.jsonl  HistoryEntry
  + id?: string                    (P1) ✅ 已落地

memory.json  L2Memory
  + speakerIds?: string[]          (P2)  谁说的 —— 证据归因
  + subjectIds?: string[]          (P2)  关于谁 —— 召回过滤/删除定位
  ~ sourceMessageIds              (P2)  由空转为真实填充

memory.json  MemoryEvidence
  ~ messageIds                    (P2)  同上
  ~ conversationId                (P2)  write_memory 工具路径补上（现在为空串）

relationship-log.json  RelationshipLogEntry        （P3）
  + personKey?: string            (P3)  该轮说话人的 personKey —— 按人擦除关系日志的唯一键
```

`personKey` 的格式在 P2 定义：`<channel>:<senderId>`（如 `qq:2914636187`）。**渠道 id 的字符集不含 `:`**（`conversation-binding-store.ts:43-46`），所以 P3 的解析规则是"在第一个 `:` 处切分"。

---

## 7. 施工顺序与产出物

| 阶段 | 详细方案文档 | 状态 |
|---|---|---|
| P0 | 本文件 §3.2（删除清单，不单独出文档） | ✅ **已施工完成 + 4 条手工验证通过**（记录见 §3.4） |
| P1 | `docs/construction/phase3-p1-message-identity.md` | ✅ **已施工完成 + §5.2 手工验证通过**（记录见 §3.5 / P1 文档 §9） |
| P2 | `docs/construction/phase3-p2-l2-person-attribution.md` | ✅ **已施工完成 + 自动化验收全绿**（记录见 §3.6 / P2 文档 §9；§5.2 手工验证待做） |
| P3 | `docs/construction/phase3-p3-erasure-and-console.md` | ✅ **已施工完成 + 自动化验收全绿**（记录见 §3.8 / P3 文档 §9）：删除内核 `deleteL2Cascade` + `erasePerson` 完全擦除 + 记忆管理控制台。**§5.2 手工验证进行中**：第 1–3 步通过（含"LLM 真会输出 `subjectNames`"与 K 类真实样本），第 2 步抓到 **D1「控制台删除漏删向量」并已修复**（记录见 P3 文档 §9.6 / §9.3b）。4–8 步待做 |
| P3.5 | 待定（P2 文档 §3.6 + §3.9 已记录完整范围，届时展开） | ⬜ 待 P3 完成后编写 |

**每阶段结束时的固定验收**（沿用本仓库既有标准）：

```powershell
npx vitest run            # 全量测试通过
npx tsc -p tsconfig.main.json     # 0 错误
npx tsc -p tsconfig.preload.json  # 0 错误
npx vite build            # 构建通过
```

> 注：本机 PowerShell 执行策略会拦截 `npx.ps1`，实际执行时改用 `node node_modules/vitest/vitest.mjs run` 等形式，或 `npm.cmd`。

---

## 8. 风险总览

| 风险 | 影响阶段 | 缓解 |
|---|---|---|
| assistant 消息时序 | P2 | §4.1：只指向 user 消息 |
| 镜像双 id 混用 | P2 | ✅ 已由 P0 消除（§3.2 / §4.2） |
| P0 误删 `externalChats`，区块选不出成员 | P0 | §3.2 已标注「必须保留」清单 |
| 私聊无 speakerId | P3 | §4.3：**私聊整会话删除**（不依赖 speakerId）；群聊才逐行过滤 |
| 压缩总结混合多人 | P3 | §4.4 的难点仍在，但 P3 选了**更省的解法**：**去压缩**（删总结 + 把幸存子条目确定性还原为 active 并重建向量，零 LLM、不丢别人的信息）。见 P3 文档 §2.6 |
| L0/L1 非结构化提及 | P3 | §4.5 已更新：**本地已知名字子串匹配**产出「疑似残留清单」+ 人工确认（不调 LLM，见 P3 文档 §2.12） |
| 群 transcript 过滤重写与并发追加冲突 | P3 | ⚠️ **原方案（走 `KeyedQueue`）不成立**：队列实例只在 `bootstrap.ts:347-348` 内部创建、不可从模块外取得，且旁听（`napcat-adapter.ts:575`）与主动投递（`proactive-delivery.ts:119`）两条写路径**根本不在队列里**。改用更强也更简单的保证：**`history-log` 全部 IO 是同步的 → 重写写成纯同步函数即不可能被 append 打断**（P3 §0.4 约束 4） |
| 存量数据无法回填 | P2/P3 | 明确不做（§5），UI 标"来源未知" |
| **测试文件不被任何 tsconfig 覆盖，"类型防线"写进 `.test.ts` 等于没写** | P2/P3 | P1 实测确认（§3.5 新发现 1）：类型防线必须配运行时断言，或新增覆盖测试的 tsconfig |
| **注入点用 `typeof 真实函数` 声明类型，被引用方返回值一改就波及调用方桩函数** | P2/P3 | P1 在 `proactive-delivery.ts` 撞到（§3.5 新发现 2）：注入点写显式函数类型，别用 `typeof` |
| 渠道消息 `id` 被调用方伪造 / 复用 | P1 | ✅ 已处理：`HistoryEntryMeta` 排除 `id` + `appendHistory` 白名单挑字段（类型 + 运行时双重，§3.5） |
| **「记忆格式升级」闸门 + `deleteAllMemory` 会连 `channels/history/` 与 `channels/archive/` 一起清空** | **P3** | ⚠️ P1 手工验证时实际发生（§3.5 新发现 4）：P3 的按人擦除（逐行过滤重写）**不得复用** `deleteAllMemory` 的整目录删实现；升级弹框文案也没提 transcript 会一起没 |
| **记忆备份留着 = 擦除后能复活被删者** | **P3** | §4.9：`memory.backup.*.json` 与 `memory-reconcile-backups/` 都不在 `MEMORY_TARGETS` 里；P3 整份销毁它们，并顺手补进 `deleteAllMemory` |
| **`chat-api.log` 含每次模型调用的完整 prompt 正文，且无上限** | **P3** | §4.9：擦除时整份删除（全仓无读取方，删了不影响功能）；无上限问题另立议题 |
| **transcript 逐行重写与并发 append 竞态 → 丢消息** | **P3** | P3 §0.4 约束 4：`history-log` 全部 IO **是同步的**，因此纯同步重写不会被 append 打断；**一旦在重写路径加 `await` 该保证立刻失效**（已列为 P3 的最高风险 + 专项用例） |
| **`deleteAllMemory` 的 5 条既有用例被 P3 破坏** | **P3** | P3 会动 `MEMORY_TARGETS`（加一项）与删除循环（加 glob 展开）→ 必须重跑 `memory-deletion.test.ts` 与 `group-corpus-isolation.test.ts` 的互斥断言 |
| **擦除流程误碰群聊语料（长期资产）** | **P3** | ⚠️ P3 原方案确实打算"擦除某人的语料行"，已按用户要求**整个撤掉**：语料不在 `PERSON_ERASABLE`、擦除链路零引用，并用**两条会变红的测试**锁住（"擦除后语料逐字节不变" + 架构守卫扫源码断言无 `group-corpus` 字面量/无 import）。见 §5 该行 + P3 §0.4 约束 2 |
| **召回侧在本阶段之后仍是「不认归属」** | **P3.5** | P3 只做存储层 + UI；`user_memory` / `read_memory` 仍返回原始命中（§4.8 事实二）。**P3 的 R1/R2/K 三分就是 P3.5 召回过滤的现成判据**，而 K 类的存在让这件事从"优化"变成"必须" |
| **「别人提到他的记忆」被模型当成「她认识他」** | **P3.5** | ⚠️ **这是 P3 有意留下的取舍**（§2 Q2：不删别人的记忆、且那条记忆常含别人的经历）。P3 的缓解：预演报告显式列出「保留 M 条」、控制台把两类记忆分开显示、验收按"来源"判定。**根治在 P3.5**：召回时把 `speakerIds ≠ 提问者` 的记忆降级为「群友提过」而非「我了解」 |
| **L2 不进主聊天 prompt** | **P3.5** | §4.8 事实一：主聊天路径只注入世界书/群上下文/L0-L1；接入方案已记录在 P2 文档 §3.9 |
| **串记忆（工具路径）才是当前主战场** | **P3.5** | §4.8 事实二：`user_memory` / `read_memory` 返回原始命中、无人物过滤，且被模型当作"你说过的话"复述 —— 比自动注入更严重。P3.5 第一优先项 |
| **P2 做完后「串味」与「针对性回复」都还没解决** | **P2** | ⚠️ **确定发生**，非风险而是设计取舍：P2 收窄为纯数据层（§4.8 处置）。P2 的验收标准只考核数据 |
| **「单人发言」被误判成「单人会话」→ 公共记忆挂错人** | **P2** | ⚠️ **实际发生过**：P2 原文的兜底判据（本批 personKey 去重后只剩一个）被新用例证伪，已改用 `chatType === "private"`（§3.6 新发现 1）。**P3.5 做"认提问者"时不得再用人数作代理** |
| **`require()` 懒加载点无法单测** | **P2/P3** | ⚠️ P2 在 `tool-registry.ts` 实测撞到（§3.6 新发现 3）：`require` 在 ESM 打包产物与 vitest 下都不可拦截。已改动态 `import()`；`fs-tools` 等同类点尚未处理 |

