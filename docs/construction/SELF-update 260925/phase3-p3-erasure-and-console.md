# Phase 3 · P3 施工方案：精确删除、完全擦除与记忆管理控制台

> **上级文档**：`docs/construction/phase3-person-memory-overview.md`
> **本阶段目标**：把 P1/P2 攒下的「归属数据」变成**能用的东西** —— ① 修好删除内核（现在删一条会留下 6 处残渣）；② 实现「**擦除某个人**」（他在所有群/私聊/域的痕迹一次清干净，删完昔涟不认识他）；③ 给「设置 → 记忆」加一个按人浏览的控制台。
> **状态**：**已施工完成，自动化验收全绿**（施工记录见 §9：499 文件 / 4629 用例通过，两个 `tsconfig` 0 错误，`vite build` 通过）。
> **§5.2 手工验证八步已全部跑完；D1–D6 六条缺陷与 O2/O3/O4 三条观察全部落地**（真实 QQ + NapCat）：第 1–6c 步通过；**第 7 步主测（私聊）通过、群内加测暴露 D5**（`role="assistant"` 的行不在擦除范围内 —— 证据链见 §9.3c 第 21 条）；第 8 步改在群里做后通过。修复见 §9.3b 第 16 条（D1）、§9.3d 第 21–22 条（D5/D2）、§9.3e 第 23–25 条（D3/D6/D4）、§9.3f 第 26–29 条（O2/O3/O4 + §6② 判据修正），门禁 **500 文件 / 4655 通过 / tsc 0 错误 / vite build ✓**；**修复后复测与端到端证明见 §9.6.6**（现场 9 条 `chat_history` 向量逐条命中预注册；真实数据副本上"她的复述/回复 10 → 0"）。D5 的修复**反转了 §2.5 约束 1 / §0.2 排除表第 3 条**的原决策；D4 把 `PERSON_ERASABLE` 从 12 条扩到 **13 条**、`MEMORY_PRESERVED` 从 4 条扩到 **6 条**。
> **⚠️ 本阶段不碰召回侧**（`buildMemoryInjection` / `user_memory` / `read_memory` / DMAE 激活）—— 那是 P3.5。本阶段全部是**存储层 + UI**。

---

## 0. 阶段定位

### 0.1 本阶段交付三件事

```
① 删除内核        现有的 memoryStore.deleteL2() 只清 2 处，漏 6 处
   deleteL2Cascade(ids)  ──►  记忆/证据/向量/DMAE状态/冲突日志/悬空指针/压缩总结/反思日志
                             （重启对账不会复活，也不再留幽灵条目）

② 完全擦除        erasePerson(personKey)  ──►  12 类载体 + 6 处缓存 + 审计
   「删完就完全不认识，重头再来」

③ 记忆控制台      设置 → 记忆 → 「记忆管理」
   按人 / 按域 / 按会话 三个视图 ──► 查看、溯源、单条/批量删除、彻底擦除（含预演）
```

**为什么三者必须同阶段**：② 依赖 ①（擦除 = 批量级联 + 外围清理），③ 是 ①② 的唯一用户界面。① 单独交付没有入口，② 单独交付没有防呆（用户看不见自己要删什么）。

### 0.2 验收标准

#### A. 删除内核（数据级）

> 删掉一条 L2 之后，`memory.json` 与该条有关的**每一处**都应为 0 命中：
> `l2[]` / `evidence[]` / `l2DmaeStates[]` / `conflictLogs[]`（source/target/resolution）/
> 其他条目的 `conflictWith[]`·`supersededBy`·`mergedInto` / 向量库 / 引用它的压缩总结。
> **且重启后的 `memory-rag-reconciliation` 不会把它复活**。

#### B. 完全擦除（数据级）

```jsonc
// 执行 erasePerson("qq:10001") 之后，全量扫描应满足：
memory.json            speakerIds 里 "qq:10001" 命中 0 次          ← 「他说的」全清
                       subjectIds 里**允许残留**                   ← 那些是「别人提到他」，见 §2.3
channels/history/*     speakerId === "10001" 的行 0 条（别人的行保留）
channels/archive/**   同上（按月归档也同步过滤）
channels/audit/**     index.jsonl 里 senderId === "10001" 的行 0 条；其 .log 文件 0 个
channels/log.jsonl    senderId === "10001" 的行 0 条
context-bindings.json 该人的私聊 externalChats 记录 0 条（群记录保留）
entity-graph.json     由他名字命名的 person 节点 0 个、相关 relations 0 条
relationship-log.json personKey === "qq:10001" 的条目 0 条

// 下面三处是「回退/调试」类载体，含他的**正文**（见 §2.11）：
memory.backup.*.json          0 个（否则从备份回退会让他复活）
memory-reconcile-backups/     目录不存在（同上）
chat-api.log                  不存在（含每次模型调用的**完整 prompt 正文**）

// ⚠️ 明确**不在**这个清单里的：
group-corpus/**               一行不动 —— 见下
subjectIds 里的残留（别人转述他的记忆）  一条不动 —— 见 §2.3
```

> ⚠️ **验收扫描的写法要跟着改**：**不能**再用「`memory.json` 里 `"qq:10001"` grep 0 命中」当判据（`subjectIds` 会命中）。正确判据是：
> ① `speakerIds` 里 0 命中；
> ② `subjectIds` 里的每一条命中**都能在预演报告的「保留：别人提到他」清单里找到对应**（即残留是**已知且已声明**的，不是漏删的）。

> **`group-corpus/`（你攒的语料库）一行不动，这是本阶段的一条硬承诺（§0.4 约束 2）。**
> 理由有三条，第一条是决定性的：
> 1. **它不影响"昔涟认不认识他"** —— 语料是**只写不读、零生产消费方**的旁路（`docs/group-corpus.md:13-22`，`group-corpus-isolation.test.ts` 锁着），从不进 prompt、不进召回。所以本阶段的行为验收标准（§0.2 C）**与语料无关**：哪怕他的原话留在语料里，昔涟也永远不会看到它。
> 2. **它是"只增不减的长期资产"**，且你已经明确要求保护（§0.4 约束 2 的三道保护）。
> 3. **留数据比删数据更有价值**：将来自学习 T0 真正要用它时，正确做法是**在蒸馏时按名单跳过**（不改数据），而不是就地删行 —— 后者会让按人分层的统计基线失真，且不可逆。
>
> **将来怎么处理"语料里有已擦除的人"**：记录在 `docs/group-corpus.md` 的 T0 接力点里（**建议用哈希排除名单 + 蒸馏期过滤，不删数据**）。本阶段**不实现**（没有消费者就不写代码 —— 这是 P2 的教训）。

#### C. 完全擦除（行为级，手工验收）

> **在他自己的会话上下文里**（他的 QQ 私聊、他所在的群），你问「小明是谁」，昔涟应该反问「小明是谁呀？」

**⚠️ 这条标准要按「来源」理解，而不是按「名字」理解**（§2.3 的决定）：

- 判据是「**她不再拥有来自他本人的任何认知**」—— 他说的、他和她的私聊，全部消失；
- **不是**「这个名字在系统里 0 出现」。如果别人曾经当着昔涟的面提过他，那条记忆**会保留**（§2.3 的两条理由），于是她可能表现出「听说过有这么个人」；
- 因此验收时的提问方法很关键：**在一个没人转述过他的会话里问**（他的私聊，或他刚说过话的那个群）。若在「B 刚提过他」的群聊里问，她答出「小红好像提过一个叫小明的」**不算失败** —— 那是 B 的记忆，不是她对小明的认识。
- **这条取舍的真正补丁在 P3.5**：召回侧要学会「说话人 ≠ 提问者 → 不把这条当成『我了解他』来引用」（§7）。

**明确排除（不纳入验收）**：

| 排除项 | 依据 |
|---|---|
| **任何人**（不止别的域）提到他的记忆 —— 例如 B 在同群说「我和小明去看漫展」 | **§2.3 已定：不删**。三条理由：① B 不说就不会被调用；② 即便被调用，LLM 拿到的也只是「B 提过一个人」，够不上"认识"；③ 这条记忆可能同时是 **B 自己的经历**，删它等于抹掉 B 的事 |
| L0/L1/关系日志里的**文本级**提及（非结构化，无归属字段） | 本阶段只产出「疑似残留清单」，由人工确认（§2.12） |
| 他的**群聊 transcript 里昔涟自己的回复**（可能含他的名字） | 不做文本级删除（§2.5 明确理由） |
| 桌面对话里 P0 之前的镜像残留（`channelSource`） | `ChatMessageChannelSource` **没有 senderId**（`src/shared/chat-types.ts:112-116`），只能按昵称模糊匹配 → 违反「宁可不删不可删错」，只进清单（§2.12） |
| jieba 自定义词表里的他的名字 | 词表只增不减（`src/main/rag/retriever.ts:57-67` 无移除 API），只影响分词、不影响"认识" |
| **配置类痕迹**：`channels-settings.json` 的 `toolAccess.entries[].userId` / `pairingPending[].senderId` | 这是**访问控制配置**（谁被放行），不是记忆；`MEMORY_PRESERVED`（`memory-deletion.ts:36`）显式保留。删它等于悄悄撤权（且与 Q4「不做黑名单」的对称面冲突），不含对话内容 |
| **开发期副本**：`channels/*.p0-backup`、`channels/tool-audit.jsonl` | **源码零引用**（全仓 grep 无命中），是开发/验证期留在磁盘上的孤儿文件，不属于产品行为 → 只进清单（§2.12） |

#### D. 预演（dry-run）

> 擦除前必须能拿到一份**分类计数**（多少条记忆 / 多少个会话 / 多少行 transcript / 多少条审计 / 是否重算总结），并且**必须同时列出「将删除 N 条」与「保留 M 条（别人提到他的）」**（§2.13）。
> 执行时按同一判据**重算**，与预演快照不一致则**中止并要求重新确认**（§2.13）。
> 删除前必须输入确认短语（沿用 `delete-all.ts` 的 `confirmValue` 门控）。

#### E. 回归（本阶段最重要的一条）

> **不删别人的东西**：同群其他成员的 L2（包括**他们提到他的那些**）、transcript 行、语料行、关系条目、实体节点，一条不动。
> 不做擦除时，所有既有行为（对话、注入、召回、压缩、对账）**逐字节不变**。

### 0.3 范围边界

| 本阶段做 | 本阶段不做 |
|---|---|
| `deleteL2Cascade(ids)` 唯一删除入口 | ❌ 召回侧任何改动（→ P3.5） |
| 单条 / 批量 / 按域 / 按会话 / 按人 五种删除粒度 | ❌ `erasePerson` 之外的"按名字删"（同名误伤，永远不做） |
| `erasePerson(personKey)`：跨群跨私聊跨域 | ❌ 给群成员建 L0/L1（总概览 §5 已否决） |
| transcript 逐行过滤重写（热层 + 归档） | ❌ 删 `channels/history/<群>.jsonl` 整个文件（会连累别人） |
| audit / log.jsonl / entity-graph / relationship-log 的按人清理 | ❌ **群聊语料 `group-corpus/` 的任何读、写、删**（§0.2 B 的承诺 / §0.4 约束 2） |
| 记忆备份 / 对账备份 / `chat-api.log` 的销毁 | ❌ 从语料里删他的原话（将来由 T0 蒸馏期按名单跳过，见 `docs/group-corpus.md` §8） |
| relationship-log **新数据加 `personKey`** | ❌ 存量 relationship-log 的按人回填（结构上做不到） |
| 预演 + 二次确认 + 审计 | ❌ 回收站 / 删除快照 / 撤销（§2.13 说明理由） |
| 「疑似残留清单」（本地名字匹配 + 人工确认） | ❌ 用 LLM 扫描 L0/L1（§2.12 说明为什么不需要） |
| 记忆管理控制台（人 / 域 / 会话 三视图 + 溯源） | ❌ 多维筛选（时间/权重/状态）、导出、证据链回放动画（P4 再说） |
| 从区块移除该人 | ❌ 明确不做（§2.16 说明：区块成员是**会话**，不是人；移除等于改白名单配置，与 Q4「重置」冲突） |

### 0.4 ⚠️ 施工前必须知道的六条硬约束（本轮侦察新发现）

#### 1. `deleteAllMemory` 的「整目录删」不能复用

`deleteAllMemory`（`src/main/memory/memory-deletion.ts:61-93`）用 `fs.rmSync(recursive)` 扫掉 `MEMORY_TARGETS`（`:15-31`），其中**包含 `channels/history/` 与 `channels/archive/`（`:29-30`）**。

而「擦除一个人」要的是**逐行过滤重写、保留别人的话**。两者作用域重叠、语义互斥，**绝不能让擦除复用 `deleteAllMemory` 的任何一步**。

> 这条在 P1 手工验证时已经真实发生过一次：记忆格式升级闸门调用 `deleteAllMemory()`，两个老 transcript 文件被一并删除（总概览 §3.5 新发现 4）。

#### 2. 🚫 `group-corpus/`（群聊语料）：本阶段**一个字节都不碰**

`docs/group-corpus.md:64-78` 明确：语料是**只增不减的长期资产**，并写了三道保护 —— 物理隔离（在 `userData` 顶层）、`MEMORY_PRESERVED` 显式登记（`memory-deletion.ts:34-41`）、回归测试锁定（`group-corpus-isolation.test.ts`，还断言**保留名单与删除名单路径互不包含**）。

**本阶段的处置：比原计划更保守 —— 从擦除范围里整个拿掉。**

| 动作 | 做不做 |
|---|---|
| 擦除某人时删他的语料行 | ❌ **不做** |
| 擦除某人时**读**语料（哪怕只为了统计行数、或取他的昵称） | ❌ **不做** |
| 把 `group-corpus/` 加进 `MEMORY_TARGETS` | ❌ 永远不做 |
| `group-corpus/` 挪出 `MEMORY_PRESERVED` | ❌ 不做（它必须留在里面） |
| 拿 `corpusStats()` 或目录 `readdir` 产生擦除报告里的数字 | ❌ 不做（会让擦除模块碰到语料路径字面量，破坏"零消费方"守卫） |

**为什么这样是安全的（关键论证）**：语料**不进 prompt、不进召回、没有任何生产阅读方**（`group-corpus-isolation.test.ts` 锁着"生产代码只有 NapCat 适配器 import 它"）。所以"他的原话留在语料里"**不会让昔涟认识他** —— 本阶段的行为验收标准（§0.2 C：「问小明是谁 → 反问」）**不受影响**。

**为什么"读一下语料拿他的昵称"也要禁止**：`group-corpus-isolation.test.ts:119-131` 有一条守卫是「**除 `src/main/corpus/` 外，没有生产文件可以出现带引号的精确字面量 `"group-corpus"`**」（正则 `/"group-corpus"/`）。读语料至少要写 `"group-corpus"` 或用 `corpusDir()`，两条路都会让那条守卫变红；而那条守卫保护的正是你攒的语料资产。要么改守卫（放松了保护），要么绕开。**绕开更对**：他的昵称在 `externalChats.senderName`、transcript 的 `speakerName`、区块成员的 `senderName` 三处都有（§2.9），完全不缺这一处。

**将来的自学习 T0 怎么办**（记录设计，**本阶段不实现** —— 没有消费者就不写代码，这是 P2 的教训）：

> 当 T0 蒸馏真正要读语料时，"语料里有已擦除的人"这件事必须在**使用端**解决，而不是删数据：
> ① 擦除时在一个**不含 `group-corpus` 字面量**的文件里追加一条排除记录（建议 `userData/corpus-exclusions.json`，存 `{ channel, idHash: sha256(personKey) }` —— 只存哈希，不存 QQ 号）；
> ② T0 采样时跳过 `hash(channel:uid)` 命中名单的行；
> ③ **永远不就地删语料行** —— 那会让按人分层的统计基线失真且不可逆。
>
> 这条已同步进 `docs/group-corpus.md` §8 的 T0 接力点。

#### 3. 桌面对话的镜像残留**无法按人擦除**

`ChatMessageChannelSource`（`src/shared/chat-types.ts:112-116`）只有 `channel` / `chatType?` / `senderName?` —— **没有 `senderId`**。

P0 之后已无生产写入方（全仓 grep `channelSource` 的 42 处命中里，主进程侧只剩类型定义与渲染展示）。所以磁盘上的都是 P0 之前的遗留副本，**只能靠昵称匹配**。

**处置**：不自动删，进「疑似残留清单」（§2.12）。`chats-store` 有现成的 `replaceMessages(id, messages)`（`src/main/chats/chats-store.ts:404-415`）可以支撑将来要做，但判据不可靠，本阶段不做。

#### 4. `history-log` 的全部 IO 是**同步**的 —— 这是重写安全性的唯一保证

`appendHistory`（`src/main/channels/history-log.ts:264-314`）内部 `appendFileSync` + `readFileSync` + `writeFileSync`，**零 `await`**；`loadRecentHistory`（`:318-346`）也是同步的。

> **结论：只要「逐行过滤重写」写成一个纯同步函数（读→过滤→写，中间不 await），它就不可能被并发 append 打断** —— Node 单线程 + 无让出点。
>
> ⚠️ **一旦在重写循环里引入 `await`（例如 for-await 逐文件处理），这个保证立刻失效**，会退化成"读旧文件 → 别人追加 → 覆盖写回 → 丢消息"的经典竞态。

**注意现状的两条写方在队列之外**（`KeyedQueue` 只在 dispatcher 里，`bootstrap.ts:347-348` 创建、key = `external:<sessionId>`，`dispatcher.ts:113`）：

| 写方 | 是否走 KeyedQueue | 为什么仍然安全 |
|---|---|---|
| `channel-context.ts:165/188`（正式轮） | ✅ 队列内 | — |
| `napcat-adapter.ts:575`（群聊旁听） | ❌ 队列外 | 同步 append，不会与同步重写交错 |
| `proactive-delivery.ts:119`（主动消息） | ❌ 队列外 | 同上 |

#### 5. 渲染进程**没有 tsconfig、`vite build` 不做类型检查**

`tsconfig.main.json` / `tsconfig.preload.json` / `tsconfig.sim.json` 的 `include` **都不含 `src/renderer`**；根目录没有 `tsconfig.json`；`build:renderer` 就是裸 `vite build`（`package.json:14`），vite 只做 esbuild 转译。

→ **UI 侧的类型防线同样是纸做的**（呼应总概览 §3.5 新发现 1）。UI 的保障只有两种：**markup 字符串测试**（`dom-refs-consistency.test.ts` / `memory/panel.test.ts` / `zones-markup.test.ts` 那种）与 **jsdom 运行时用例**。

> 附带的坑：`applyTranslations`（`src/renderer/i18n-runtime/index.ts:81`）**全仓没有任何调用点**，所以 `index.html` 里的 `data-i18n` / `data-i18n-placeholder` 在当前窗口**根本不生效**（缺 key 的兜底是返回 key 本身，`i18n-runtime/index.ts:38`）。新 UI 的动态文本必须用 TS 侧 `t("settings.panel.memory.manager.…")` 赋值，静态骨架直接写中文（与现有面板一致）。

#### 6. ⚠️ 磁盘上还有**三处含正文的"回退/调试"载体**，它们都不在 `MEMORY_TARGETS` 里

| 载体 | 内容 | 为什么本阶段必须处理 |
|---|---|---|
| `memory.backup.<ISO>.json`（`memory-store-io.ts:19-25`，**无保留期上限**，每次记忆格式迁移写一份） | `memory.json` 的**整份副本**（含他的全部 L2 正文） | **留着 = 从备份回退时他会复活** —— 擦除后磁盘上仍有一份完整的他 |
| `memory-reconcile-backups/{memory,memory-store}.<ts>.json`（`memory-rag-reconciliation.ts:30-48`，每个前缀保留 3 份；只在 `changed` 时写，`:89-91`） | 同上 + 向量库整份副本 | 同上 |
| `chat-api.log`（`chat-api-utils.ts:20-47`，由 `llm-client.ts:162` 在**每次模型调用成功后**无条件写入） | **完整 request messages + raw/cleaned response** —— 等于把 prompt 正文（含他的对话、被注入的记忆）逐次落盘 | 它是"他在这里说过什么"的**最完整**副本，比 transcript 还全；且 `getApiLogPath()` **全仓无读取方**（只写不读），删除零功能影响 |

> **设计原则**：**这三处一律"整份销毁"，不做过滤**。理由是它们的存在本身与"完全擦除"矛盾 —— 备份的价值就是"回退到旧状态"，而擦除的目标正是"旧状态不能再回来"。逐份过滤还需要把级联逻辑重跑在裸 JSON 上，成本更高、更容易漏。
>
> **顺带记录的既有缺陷（不在本阶段修）**：`chat-api.log` **没有任何滚动/上限**（`appendApiLog` 只 append），会无限增长且含全部 prompt 正文。建议另立议题给它加"开关 + 大小上限"。

### 0.5 三张清单的分工

本阶段给 `memory-deletion.ts` 增加**第三张清单**，把「清空记忆」与「擦除某人」的边界写成可测试的事实：

| 清单 | 内容 | `deleteAllMemory` | `erasePerson` |
|---|---|---|---|
| `MEMORY_TARGETS`（`:15-31`，15 条） | `memory.json` / 向量库 / 实体图 / 关系日志 / `channels/history/` / `channels/archive/` … | ✅ 整个删 | ❌ **禁止复用** |
| `MEMORY_PRESERVED`（`:34-41`，4 条） | `cyrene-chats/` / `channels-settings.json` / `zones.json` / **`group-corpus/`** | ❌ 不动 | ❌ **一个字都不碰**（§0.4 约束 2）；其余三项同样不动 |
| **`PERSON_ERASABLE`（本阶段新增，**13 类**；第 13 条 `cyrene-runs/sessions/` 是 §9.3e 第 25 条补进）** | `memory.json`、`rag-data/memory-store.json`、`channels/history/`、`channels/archive/`、`channels/audit/`、`channels/log.jsonl`、`chat-api.log`、`memory.backup.*.json`、`memory-reconcile-backups/`、`entity-graph.json`、`relationship-log.json`、`channels/context-bindings.json`、`cyrene-runs/sessions/` | —— | ✅ 但**逐人过滤**（逐行重写/局部删除），**只有 `memory.json` / 向量库 / 备份 / 调试日志是整条或整份删**；`cyrene-runs/sessions/` 按 `conversationId` **按会话过滤**。<br>⚠️ **`group-corpus/` 不在这张清单里** |
| **`MEMORY_BACKUP_GLOBS`（本阶段新增）** | `memory.backup.*.json`（`memory-store-io.ts:19-25`，无上限）**+** `memory-reconcile-backups/`（目录） | ✅ **顺带补进 `deleteAllMemory`**（见下） | ✅ 整份销毁 |

**顺手修的既有缺陷**：`deleteAllMemory` 现在**不删任何记忆备份** —— 也就是说点了「删除全部记忆」之后，磁盘上仍躺着若干份完整的旧 `memory.json`（本机实测就有 2 个 `memory.backup.*.json`）。这与该按钮的文案（`index.html:738`「清空昔涟对你的所有记忆」）不符。

**处置**（改动很小，因为清单本身就该是"可测试的边界"）：

1. `MEMORY_TARGETS` 增加一项 `"memory-reconcile-backups/"`（目录，可直接进清单）；
2. 新增 `MEMORY_BACKUP_GLOBS = ["memory.backup.*.json"]`（glob 不能直接进 `MEMORY_TARGETS`，所以单独一条清单 + 在 `deleteAllMemory` 里展开成实际路径），保持"清单即边界"的可测试性；
3. 两个清单共用同一个展开函数 `listMemoryBackupTargets(root)`，`erasePerson` 直接复用它（避免两处各写一份 glob）。

---

## 1. 现状接线（施工前必读）

### 1.1 `deleteL2` 的实际缺口（逐行核实）

```ts
// src/main/memory/memory-store.ts:277-288
async deleteL2(id: string): Promise<void> {
  const store = await this.load()
  store.l2 = store.l2.filter((m) => m.id !== id)                                          // 清 ①
  store.evidence = (store.evidence ?? []).filter((e) => e.memoryId !== id)                 // 清 ②
  await this.save(store)
  appendMemoryTrace({ op: "l2.delete", layer: "L2", status: "ok", l2Id: id })
}
```

**漏掉的 6 处**（均在 `MemoryStore` 结构里，`memory-types.ts:291-303`）：

| # | 数据 | 现状 | 后果 |
|---|---|---|---|
| 3 | 向量（`ragId` → `rag-data/memory-store.json`） | 不调用任何向量 API | 语义召回仍能捞到已删记忆 |
| 4 | `l2DmaeStates[]`（key = `l2Id`，`memory-types.ts:281-289`） | 不触碰 | `memory.json` 里留孤儿状态行，越删越胖 |
| 5 | `conflictLogs[]`（`sourceL2Id` / `targetL2Id` / `resolutionMemoryId`） | 不触碰 | 冲突队列里出现幽灵条目；`applyResolverResolution` 因 `:536` 找不到端而整体放弃 |
| 6 | 其他条目的 `conflictWith[]`（存的是 **ragId**） | 不清理 | 悬空 ragId |
| 7 | 其他条目的 `supersededBy` / `mergedInto`（存的是 **l2Id**） | 不清理 | 悬空 l2Id |
| 8 | 引用它的压缩总结（`subEntryIds` 含被删 id） | 不处理 | 总结正文里仍有被删者的信息（总览 §4.4 的难点） |

> `deleteL2` 的生产唯一调用点是压缩事务回滚（`memory-compressor.ts:146`）—— 也就是说**这个缺口从来没有在真实删除场景里被踩到过**，本阶段是第一次。

### 1.2 向量库与启动对账：为什么"只删 L2"和"只删向量"都不够

| 事实 | 位置 |
|---|---|
| `deleteEntriesByIds(ids, source?)` 会 `markIndexDirty()`（清 IVF）+ `save()` | `src/main/rag/vectorstore.ts:535-547` |
| 对外包装 `deleteUserMemoryVectors(ragIds)` 固定 `source="user_memory"` | `src/main/rag/index.ts:473-476` |
| **「只删向量不删 L2」会被复活**：对 `active/aging` 且向量缺失的 L2，对账会重新 `addVector` + `markSynced` | `src/main/memory/memory-rag-reconciliation.ts:64-76`（判据）、`:103-117`（重建） |
| **「只删 L2 不删向量」会被对账回收**（但期间仍可被召回命中） | 同上 `:78-80` → `:119-127` 删 stale |
| 召回要求**双向一致**：`entry.metadata.l2Id` 与 `L2.ragId` 必须互相指 | `src/main/rag/index.ts:211-217` |
| `deleteUserMemoryVectors` 只返回删除**条数**，无「哪些真删掉了」的回读 | `vectorstore.ts:535-547` / `rag/index.ts:473-476` |

→ **两边都要显式删**，且顺序是「先 store（含 status）后 vector」，因为 store 是对账的事实源。

### 1.3 transcript 层：路径、截断、归档、写方

```ts
// 全部在 src/main/channels/history-log.ts
dir()                = <userData>/channels/history                                   // :148-150
safeName(sessionId)  = sessionId.replace(/[:/\\<>:"|?*]/g, "_")                      // :152-156
filePath(sessionId)  = dir()/<safeName>.jsonl                                        // :158-160
archiveDir(sessionId)      = <userData>/channels/archive/<safeName>/                 // :163-165
archiveFilePath(s, month)  = archiveDir(s)/<month>.jsonl                             // :167-169
monthOf(line)        = JSON.parse(line).at.slice(0,7) 或 "unknown"                    // :172-183
MAX_FILE_LINES = 200                                                                 // :73
```

| 事实 | 位置 |
|---|---|
| 每行 = 一个 JSON 对象 + `\n`（非 pretty-print）；`id` 由 `createMessageId()` 独占生成，`meta` 里混进的 `id` 不被采纳 | `:264-282` |
| 截断条件 `lines.length > MAX_FILE_LINES + 1`；**先归档再截断**，归档失败则不截断 | `:295-311` |
| 归档是**原样搬运 raw line**，按 `at.slice(0,7)` 分月 | `:191-206` |
| 读取：`loadRecentHistory(sessionId, limit, query?)`（只读热层）、`buildGroupContextBlock`（只读旁听）、`loadArchivedHistory(sessionId, month)`（只读温层）、`listArchiveMonths(sessionId)` | `:318-346` / `:355-373` / `:226-245` / `:209-220` |
| **`loadArchivedHistory` / `listArchiveMonths` / `reloadAllHistory` 零生产调用**（只给"人"翻查） | 全仓 grep 确认 |
| 生产读取方只有 2 条链路：`bootstrap.ts:96-101`（→ `dispatcher.ts:185` 滑窗）与 `orchestrator/index.ts:157`（旁听块） | — |
| 旧格式行会被 `normalizeEntry` 反推 `speakerId`（仅当正文匹配 legacy 前缀且能拆出 `(\d+)`） | `:103-122`，前缀常量 `:92-93` |
| **私聊不写 `speakerId`**（`isGroup` 判断 + else 分支传 `undefined`） | `src/main/channels/channel-context.ts:160,168,177` |
| 群聊旁听写 `speakerId`，但**不走队列** | `napcat-adapter.ts:571-581` |
| `sessionId = channel:<channel>:sha256(`${channel}:${chatId}`).slice(0,16)`（**喂的是 `chatId`**） | `channel-context.ts:77-83`；调用点 `dispatcher.ts:107` |

> ⚠️ **文件名不可逆**：`safeName` 把 `:` 换成 `_`，而渠道 id 本身允许含 `_`（`isChannelId` 只要求 `^[a-z][a-z0-9_-]{0,31}$`，见 `conversation-binding-store.ts:43-46`）。`reloadAllHistory`（`:399`）用 `name.replace(/_/g, ":")` 反推是**有损的猜测**。本阶段必须用「sessionId 名册」做权威反查（§2.4）。
>
> 另：`dispatcher.ts:7-9` 的头注释写 `sha256(channel:senderId)`，与 `:107` 实际代码不符（陈旧注释，不在本阶段修）。

### 1.4 外围载体全清单与各自的删除粒度

| # | 载体 | 路径 / 键 | 含该人的什么 | 现有删除 API | 本阶段要做的 |
|---|---|---|---|---|---|
| 1 | `memory.json` | `userData/memory.json` | `speakerIds` / `subjectIds` / 相关 evidence | 只有 `deleteL2(id)`（漏 6 处） | 新增 `deleteL2Cascade` |
| 2 | 向量库 | `rag-data/memory-store.json` | `metadata.l2Id` | `deleteUserMemoryVectors(ids)` ✅ | 直接复用 |
| 3 | transcript 热层 | `channels/history/<safe>.jsonl` | `speakerId`（群聊）；私聊为**整个会话** | ❌ 无（只有整目录删） | 新增同步过滤重写 |
| 4 | transcript 温层 | `channels/archive/<safe>/<月>.jsonl` | 同上 | ❌ 无 | 同上 |
| 5 | **群聊语料** | `userData/group-corpus/<id>__…/<日>.jsonl` | **裸 `uid` = senderId，逐条原文** | ❌ 无（且被三道保护） | 🚫 **一个字节都不碰**（§0.4 约束 2）。擦除范围里唯一"有意保留"的载体 |
| 6 | 渠道审计 | `channels/audit/index.jsonl` + `logs/*.log` | `senderId` / `senderName` / `userText`（**原文**）；`senderId` 还被拼进 log **文件名** | 只有 `clearAudit()` 全清 | 新增 `erasePersonAudit` |
| 7 | 运行日志 | `channels/log.jsonl`（滚动 1000 行） | `senderId` / `senderName` / `text` | 只有 `clearLog()` 全清 | 新增 `erasePersonLog` |
| 8 | 外部会话观察 | `channels/context-bindings.json` | 私聊记录 = 对端 `chatId` + `senderName` | 只有 `observe/flush/list` | 新增 `forget(sessionId)` |
| 9 | 实体图谱 | `userData/entity-graph.json` | `name` / `aliases`（person 节点，`scope` 分域） | 只有 `reset()` 全清 | 新增 `removeEntities({names,…})` |
| 10 | 关系日志 | `userData/relationship-log.json` | `scope` / `channel` / `userText`（**无归属人字段**） | ❌ 无 | 加 `personKey` + `eraseByPersonKey` + `eraseByScope` + **存量原文指纹匹配**（§2.10）。⚠️ **它每轮都进主聊天**（【近期关系线索】） |
| 11 | 反思日志 | `memory.json` 的 `reflectionLogs[]` | `details` 里**含被压缩条目的原文** | ❌ 无 | 按正文指纹清理 |
| 12 | Obsidian vault | `<vault>/记忆·实体·回顾·冲突/*.md` | L2 正文；L2 md frontmatter 有 `id` | 只有「下次全量导出按 manifest 反删」 | **复用导出同步**，不新增 API |
| 13 | **记忆备份** | `userData/memory.backup.<ISO>.json` | `memory.json` 整份（**全文**） | ❌ 无（且**不在 `MEMORY_TARGETS`**） | 整份删除（§2.11） |
| 14 | **对账备份** | `userData/memory-reconcile-backups/{memory,memory-store}.<ts>.json` | 记忆 + 向量库整份 | ❌ 无（不在 `MEMORY_TARGETS`） | 整个目录删除 |
| 15 | **API 调试日志** | `userData/chat-api.log` | **每次模型调用的完整 prompt + response** | ❌ 无（`getApiLogPath()` 全仓无读取方） | 整份删除 |

**缓存（进程内）**：

| 缓存 | 位置 | 失效方式 |
|---|---|---|
| `memoryStore.cache` | `memory-store.ts:35` | ✅ **不需要 reload** —— 级联删除走 store 自己 mutate + `save()`，缓存与磁盘同源（§2.15） |
| `JsonVectorStore.entries` / `.ivf` | `rag/vectorstore.ts:165,170` | ✅ `deleteEntriesByIds` 内部已处理 |
| `entityGraph.cache` | `entity-graph.ts:64` | 新增的 `removeEntities` 内部 mutate + `save()` |
| `recentInjectedMemory` | `recent-injected-memory.ts:14` | ⚠️ 只有全清 `clearRecentMemoryInjections()`（`:30`）→ 新增 `forgetMemoryInjections(ids)` |
| `l2DmaeManager` 引擎 | `l2-dmae-manager.ts:61-74` | ✅ **有现成的全量失效 API**：`loadStates()`（`:77-91`）内部 `dmae.clear()` + 按 store 重建 → 擦除后直接调它 |
| jieba 自定义词表 | `retriever.ts:57-67` | ❌ 无移除 API → 接受残留（§0.2 排除表） |
| `channel-context.sessionIndex` | `channel-context.ts:71-74`（`sessionId → {channel,senderId}`，仅 5000 条 LRU，唯一读取方是"仅用于调试"的 `lookupOriginalSender`） | 新增 `forgetSessionIndex(senderId)`（5 行） |

### 1.5 「会话 ↔ 人」映射的三条来源（可靠性排序）

| 来源 | 能给什么 | 可靠性 | 覆盖面 |
|---|---|---|---|
| **A. L2 归属字段**（`speakerIds` / `subjectIds`） | `personKey` ↔ `sourceConversationId` | 高（P2 产出，映射失败宁可不标） | 只有 P2 之后新写入的记忆 |
| **B. `externalChats`**（`conversation-binding-store.ts:10-18`） | `sessionId` / `channel` / `chatId` / `chatType` / `senderName` | 高（每条入站消息都 `observe`，`dispatcher.ts:120`） | 上限 200 条（`:7`），且**没有 `senderId` 字段** |
| **C. `zones.json` 的外部成员**（`zones/types.ts:31-42`） | 同上四字段 | 高（用户显式配置） | 只覆盖已入区块的会话 |
| **D. `channels/history/*.jsonl` 的行** | `speakerId`（群聊）/ `speakerName` | 中（私聊缺 `speakerId`） | 全量，但需要 A/B/C 把文件名映射回 sessionId |

**私聊会话如何定位到人**（关键，因为私聊 transcript 没有 `speakerId`）：

| 渠道 | 私聊 `chatId` 与 `senderId` | 证据 |
|---|---|---|
| QQ（NapCat） | **相等** | `onebot-normalizer.ts:155`、`napcat-adapter.ts:464` |
| QQ 官方机器人 | **相等** | `qqbot-adapter.ts:97-98` |
| 微信 | **相等** | `ilink-bot-adapter.ts:344-345` |
| 飞书 | **不相等**（`oc_xxx` vs `ou_xxx`） | `history-log.ts:375-378` 的迁移注释 |

→ 所以：**QQ / QQBot / 微信 的私聊会话可由 `chatId === senderId` 精确映射到人；飞书只能靠 A（L2 归属）**。这条差异必须写进代码注释与预演报告的「无法判定」提示里。

### 1.6 后台写入的串行化现状

| 机制 | 位置 | 语义 |
|---|---|---|
| `enqueueLLMTask(label, task)` | `src/main/llm-queue.ts:45-62` | **全局 FIFO 串行** promise chain；错误被吞只为不断链，调用方仍能从返回的 promise 拿到 reject；限流错误重试 1 次（`:66-95`） |
| 记忆写入入队点 | `memory-scheduler.ts:145`（`enqueueTask: enqueueLLMTask`，label `"MemoryMaintenance"`，`:69-73`） | 所有 judge/压缩/消解写入都在这个队列里 |
| `KeyedQueue`（按 session 串行） | `bootstrap.ts:347-348` 创建；key = `external:<sessionId>` | **只服务 dispatcher 入站链路**，且实例不可从模块外取得 |

→ **擦除任务也入 `enqueueLLMTask`**：先入队的记忆写入必然先完成，擦除之后的新写入属于"他再来"（Q4 重置语义），天然无竞态（总览 §4.6）。
→ transcript 的安全**不依赖队列**，依赖 §0.4 约束 4（同步重写）。

---

## 2. 设计决策

### 2.1 五种删除粒度、三个入口

| 粒度 | 语义 | 入口 | 底层 |
|---|---|---|---|
| **D1 单条** | 删一条记忆 | UI 行内删除 | `deleteL2Cascade([id])` |
| **D2 批量（勾选）** | 删勾选的若干条 | UI 批量条 | `deleteL2Cascade(ids)` |
| **D3 按容器** | 清空某域 / 某会话 | UI 容器行按钮 | 先解析 ids，再 `deleteL2Cascade(ids)` |
| **D4 按人（局部）** | 删"他说的" + 他的私聊会话内的记忆（**不含**别人提到他的） | 「人」视图 → 「他的记忆」分组 → 删除 | 同上 |
| **D5 按人（完全擦除）** | 上面 + transcript + 外围 + 缓存 | 「人」视图 → 彻底擦除（预演 → 确认） | `erasePerson(personKey)` |

**`deleteL2Cascade(ids)` 是唯一删除入口** —— 不再保留任何"只删 l2 数组"的路径，避免将来又漏级联。

### 2.2 `erasePerson` 的命中规则（**两条删 + 一条留**）

**判据一句话**：**删「从他嘴里出来的」，留「别人提到他的」。**

```
输入：personKey = "<channel>:<senderId>"     （P2 约定，person-attribution.ts:26-28）
解析：parsePersonKey() 在**第一个** ":" 处切分（渠道 id 字符集不含 ":"，见 conversation-binding-store.ts:43-46）

第一步：算两个会话集合（用途不同，不要混）
  privateSessions（他的私聊会话，用于 R1）
    P1  名册里 chatType === "private" 且 chatId === senderId 的会话
    P2  命中集合 H 里那些 sourceConversationId（私聊会话的 L2 一定来自私聊会话）
  speakingSessions（他发过言的会话，**只用于 transcript 与报告展示，不参与 L2 判据**）
    S1  扫 transcript：所有含 speakerId === senderId 行的会话
    S2  H 的 sourceConversationId 并集

第二步：算命中集合 H（L2）—— 只有两条
  R1  私聊即人   sourceConversationId ∈ privateSessions                  → 删
  R2  他说的     speakerIds ∋ personKey                                  → 删
  K   （保留）   只有 subjectIds ∋ personKey、且 speakerIds 不含他        → **不删**
  —   其余一切                                                          → 不动
```

**与上一版的两处实质变化**（都由「不删别人转述」这个决定推出）：

| 变化 | 上一版 | 本版 | 收益 |
|---|---|---|---|
| 删掉 `subjectIds` 判据 | `subjectIds ∋ P` 且在同会话 → 删 | **不再看 `subjectIds` 决定删** | 误删面直接少一半：**`subjectIds` 只用于「展示」与「P3.5 召回重排」，不再用于「删」** |
| R2 不再需要「会话边界」 | 必须 `sourceConversationId ∈ eraseSessions` | **只要 `speakerIds ∋ P` 就删**，不看会话 | 少一个判据、少一类误判；「他说的」在哪个会话里都是他说的 |
| 旧的 `eraseSessions` 拆成两个集合 | 一个 `eraseSessions` 同时参与 L2 判据与 transcript | 拆成 `privateSessions`（管 R1）与 `speakingSessions`（只管 transcript 与报告） | 语义单一：**没有哪个集合能同时"决定删记忆"又"决定改文件"**，不会越算越宽 |

> **这条判据是「删除」与「展示」分离的**：控制台「按人」视图仍然把 K 类记忆列给他看（标成「别人提到他」），用户可以在那里**手动**单条/批量删（D1/D2 是显式操作）；但「彻底擦除」**默认不动**它们。UI 必须把这两类分开显示（§2.17）。

### 2.3 ✅ 为什么别人转述他的记忆**不删**（已定，三条理由）

总概览 §2 写过「小红说『我和小明去看漫展』→ **保留**」。本阶段把它从"一个边界特例"提升为**主判据**：**删「他的话」，留「关于他的话」**。

| 理由 | 说明 |
|---|---|
| ① **B 不说，就不会被调用** | 这条记忆由 B 的发言产生。B 不再提起，它在大多数会话里根本不会被召回；进了也不是"昔涟了解小明"，而是"昔涟记得 B 说过什么" |
| ② **即便被调用，也只是个模糊表述** | LLM 拿到的至多是"有人提过一个叫小明的人"。**够不上"认识"** —— 而验收标准（§0.2 C）要的正是"不再拥有来自他本人的认知" |
| ③ **删它是删别人的记忆，而且那条记忆里往往有 B 自己的事** | 「我和小明去看漫展」既是关于小明的，**也是 B 的经历**。删掉它等于替 B 抹掉他自己的事 —— 这比"留下一个名字"更糟。（**这是本方案最硬的一条理由**） |

**完整的场景表**（判据一目了然）：

| 场景 | 记忆所在会话 | 归属字段 | 本方案 | 理由 |
|---|---|---|---|---|
| 小明在私聊里说 | 他的私聊会话 | `speakerIds=[P]` | ✅ **删**（R1） | 私聊整个都是他；而且他的 transcript 也被整会话删了，**记忆必须跟着走，否则会留下"来源已被删除"的孤证** |
| 小明在群里说 | 群会话 | `speakerIds=[P]` | ✅ **删**（R2） | 他说的话 |
| 小明的私聊里提到第三方（「小红最近失恋了」） | 他的私聊会话 | `subjectIds=[小红]` 或空 | ✅ **删**（R1 优先） | 这是**他的**对话内容；同样必须与"私聊整会话删除"保持一致 |
| B 在同群说「小明最近在学 Rust」 | 群会话 | `speakerIds=[B]`、`subjectIds=[P]` | ❌ **保留**（K） | 见上三条理由 |
| B 在私聊/桌面说「我和小明去看漫展」 | B 的会话 | `subjectIds=[P]` | ❌ **保留**（K） | 同上（且这是 **B 自己的经历**） |
| B 在另一个群说「小明…」 | B 的群会话 | `subjectIds=[P]` | ❌ **保留**（K） | 同上 |
| 无归属的 legacy 碎片（P2 之前） | 任意 | 无 | ❌ 不删 | 结构上无法定位（总览 §5「不迁移存量归属」） |

> **R1 为什么仍然"无条件删"**（而不是也看 `subjectIds`）：因为私聊 transcript 是**整会话删除**的。如果留下一条"来源会话已被删掉"的记忆，它就是一条**无法溯源、也无法核对**的孤儿（`evidence.conversationId` 指向不存在的会话，`sourceMessageIds` 指向不存在的行）。**R1 是 L2 与 transcript 的一致性要求，不是"顺手多删"。**

**被否决的替代方案（附复活条件）**：如果将来你发现"听说过某个名字"确实造成困扰，可以加一个**默认关闭**的勾选项（擦除对话框里：「同时删除别人提到他的记忆（⚠️ 会连带删掉别人的经历片段）」）。**本阶段不实现、不默认**，只在 §8.2 记为 O8。

### 2.4 sessionId 名册：为什么不能靠文件名反推

`safeName` 有损（§1.3）。所以：

```ts
// 新增到 history-log.ts（纯函数，易测）
export function sessionIdFromFileName(
  fileBase: string,                       // "channel_qq_ab12cd34"
  known: ReadonlyMap<string, string>,     // safeName(sessionId) → sessionId
): string | null
// 1) 先查 known（权威）
// 2) 退化：^channel_([a-z][a-z0-9]*)_([0-9a-f]{16})$ → channel:<ch>:<hash>（渠道名不含 "_" 时成立）
// 3) 都不匹配 → null（预演里列为「无法识别来源的 transcript 文件」，不处理）
```

`known` 名册由三条来源并集构造（§1.5 的 B + C + `memoryStore.getAllL2()` 的 `sourceConversationId` 去重）。

### 2.5 transcript 的擦除形态：群逐行过滤 / 私聊整会话

| 会话类型 | 判定 | 动作 | 为什么 |
|---|---|---|---|
| **私聊（他的）** | 会话 ∈ S3（§1.5 的 `chatId === senderId`） | **整会话删除**：热层文件 + 归档目录整个 `rmSync` | 私聊 = 一对一，整个文件都是他；而私聊行**没有 `speakerId`**，逐行过滤根本匹配不到（总览 §4.3） |
| **群聊** | `speakerId` 匹配 | **逐行过滤重写**（热层 + 每个月文件） | 群里还有别人的话，删文件会连累别人 |
| 过滤后为空 | — | 群聊保留空文件（追加写自动处理）；归档目录若变空则删目录 | 避免 `loadRecentHistory` 的 `existsSync` 早退行为发生变化 |

**四条必须写进代码注释的约束**：

1. **不删昔涟自己的回复**。群里 assistant 行可能含他的名字（"小明你真厉害"），做文本级删除不可靠（会删错别人的句子）→ 接受残留（§0.2 排除表第 3 条）。
2. **不做文本匹配**。只按 `speakerId`（结构化字段）匹配；legacy 行由 `normalizeEntry` 的既有逻辑在**读取时**反推，写入侧不复制这套启发式。
3. **重写必须是纯同步函数**（§0.4 约束 4）。
4. **顺手收集「被删掉的 user 行正文」**（`removedUserTexts`，去重 + 截断 200 字）—— 它是 §2.10 关系日志存量指纹匹配的输入（D 集合），不收集就得回头再扫一遍文件。

### 2.6 压缩总结：**去压缩**，而不是重新生成

总览 §4.4 给的推荐是「重新生成，凑不够就删掉并记录」。**本方案改成「删总结 + 恢复幸存子条目」**（de-compress），理由：

| 方案 | 成本 | 风险 | 信息损失 |
|---|---|---|---|
| A. 重新生成（LLM） | 每条总结一次 LLM 调用 + 新 store API + 重嵌入 | LLM 可能再次写出被删者；重算文本不可控；事务复杂 | 无 |
| **B. 去压缩（本方案）** | **零 LLM**；幸存子条目重嵌入（走现成路径） | 几乎为零 | **无**（别人的信息回到碎片态） |
| C. 直接删总结 | 最低 | — | **丢失同组其他人的信息**（违反 Q2 精神） |

**B 为什么是正确的**：`memory-compressor.ts` 的候选集是 `status === "active" && !isSummary && ragId`（`:34`），也就是说**被压缩的子条目在被压缩前一定是 `active`**。所以「恢复」就是把它们置回 `active` 并重建向量 —— 这不是猜测，是**确定性地还原到压缩前状态**。

> **和 §2.3 的交互（重要）**：一条总结的 `speakerIds` 是子条目 `speakerIds` 的**并集**（`memory-compressor.ts:126`）。所以只要同组里有**一条是他说的**，这条总结就落在 R2 里（`speakerIds ∋ P`）→ 删总结 + 去压缩。而它的**幸存子条目**里可能既有"别人提到他的"（K 类，本该保留）、也有别人自己的事 —— 去压缩正好把 K 类**原样恢复回 `active`**，与 §2.3 的决定一致（**不因为一条总结里混了他的话，就连累 K 类**）。

```
对每个引用被删 id 的总结 s（s.isSummary && s.subEntryIds ∩ H ≠ ∅）：
  survivors = s.subEntryIds \ H
  if survivors 非空:
      deleteL2Cascade([s.id])                       // 连它的向量一起删
      updateL2Status(survivors, "active")           // 确定性还原
      for each survivor: 重建向量 + markL2SyncStatus("synced", ragId)
      记录 trace: op = "l2.decompress.restore"
  else:
      deleteL2Cascade([s.id])                       // 没有幸存者，直接删
```

**向量重建**沿用 `memory-compressor.ts:135-136` 与 `obsidian-importer.ts:168-183` 的同构写法：`addL2MemoryVector(content, l2Id, {triggerText, confidence}, scope)` → `markL2SyncStatus(l2Id, "synced", ragId)`。
**兜底**：即使这一步失败也不致命 —— 启动对账（`memory-rag-reconciliation.ts:64-76`）会自动为 `active` 且缺向量的条目重建。

### 2.7 悬空指针：**只清指针，不回滚状态**

| 字段 | 指向 | 处置 |
|---|---|---|
| `conflictWith[]` | ragId | 过滤掉属于 H 的 ragId |
| `supersededBy` / `mergedInto` | l2Id | 指向 H 时**删除该字段** |
| `conflictLogs[].sourceL2Id / targetL2Id` | l2Id | 命中 H 的整条日志删除 |
| `conflictLogs[].resolutionMemoryId` | l2Id | 命中 H 时清空该字段（日志本身保留，因为它是**历史事实**：那次消解确实发生过） |
| `evidenceIds[]` | evidence id | 被删条目的 evidence 随 `memoryId` 一起删（`:280` 已有）；幸存条目的 `evidenceIds` **不动**（它们指向自己的证据） |

**为什么不回滚状态**：`supersededBy` 被清空后，如果把该条退回 `active`，等于**让一个已被新信息取代的旧记忆重新参与召回** —— 这是语义漂移。宁可留一条"状态是 superseded、但没有后继指针"的记录（读取侧本来就只把它当历史）。**只清指针、不动 status**。

### 2.8 `reflectionLogs`：以「被删条目正文」为指纹清理

`memory-compressor.ts:152-156` 写入的反思日志：

```ts
await memoryStore.appendReflectionLog({
  type: "compression",
  summary: `压缩 ${subEntryIds.length} 条记忆为一条总结`,
  details: `原条目：${texts.join(" | ")}\n总结：${cleanSummary}`,   // ← 含原文
})
```

它没有 `l2Id` 字段，**结构上无法按人定位**。但它有一个可用的强指纹：**被删条目的正文原样出现在 `details` 里**。

```
对每条 reflectionLog：
  if 存在 m ∈ H，使 m.content.length >= MIN_FINGERPRINT(=8) 且 log.details?.includes(m.content)
  → 删除该 log
```

**误伤分析**：指纹是"整条 content 的完整子串"，不是名字。只有当**别人的记忆正文恰好完整包含某条被删记忆的正文**时才会误伤 —— 那意味着两条记忆内容几乎相同（同一次压缩的重复输入），删掉它不损失信息。**长度下限 8** 是为了防"好的""嗯"这类极短正文污染匹配。

### 2.9 实体图谱：按名精确移除 + 预演确认

**为什么不能按 personKey**：`EntityNode` 只有 `id`（`ent_<ts>_<rand>`）、`name`、`aliases`、`type`、`scope`（`entity-graph.ts:16-29`），**与 QQ 号没有任何关联**；去重/匹配只按「同域内 name 或 aliases 全等」（`:107-110`）。

**做法**：

1. 用**三条**来源算出他的**已知名字集合** `knownNames`：`externalChats.senderName`（§1.5 来源 B）+ transcript 行里的 `speakerName`（该人的行）+ **区块成员里的 `senderName`**（来源 C）。
   > ⚠️ **不包含 `group-corpus` 的 `uname`** —— 读语料会破坏"零消费方"守卫（§0.4 约束 2）。三处来源覆盖同一批昵称快照，不缺这一处。
2. 移除 `type === "person"` 且（`name ∈ knownNames` 或 `aliases` 与 `knownNames` 有交集）的节点。
3. 同时移除 `relations` 中 `sourceId` / `targetId` 指向被删节点的条目。
4. **只在预演里列出来让用户确认**（列出名字、scope、关联关系数）—— 同名误伤（群里真有两个"小明"）由人兜底。
5. `feedEntityNamesToJieba` 的词表**不回退**（无 API，接受残留）。

**新增 API**（`entity-graph.ts`）：`removeEntities(criteria: { names: readonly string[]; types?: readonly EntityNode["type"][] }): { nodes: EntityNode[]; relations: number }` —— 内部 mutate `cache` + `save()`，返回被删内容供审计与报告。

> ⚠️ **这里有一个必须讲清的不对称**：实体节点是**按名字聚合**的派生数据，无法区分"由他自己的话产生"还是"由 B 提到他产生"。按 §2.3 我们保留 B 的 L2，但**实体节点仍然要删**。理由不是双标 —— 而是**两条注入路径的实际暴露面不一样**（下面三条事实都是本轮核实的，别凭印象）：
>
> | 载体 | 主聊天（桌面 / 群聊 / 私聊） | 语音通话 / 主动消息 | 依据 |
> |---|---|---|---|
> | **K 类 L2**（别人提到他） | ❌ **不进**自动注入（只有模型主动调 `user_memory` 工具才可能捞出） | ⚠️ 可能进（DMAE 门控后的 top-4） | `buildMemoryInjection` 的生产调用方**只有两处**：`call-prompt-builder.ts:58`、`proactive-lifecycle.ts:110`；主聊天走的 `buildAlwaysOnContext` 不调它（`orchestrator/index.ts:112-214` 只注入世界书/注入段/群上下文/L0-L1 画像） |
> | **实体图 person 节点**（【人物关系】块） | ❌ **不进** | ⚠️ 同上（`entityGraph.search` 的唯一调用点就在 `buildMemoryInjection` 内，`orchestrator/index.ts:80`） | `entityGraph` 的 `load()` 消费者只有 `:80` 与 `obsidian-exporter.ts:490`（导出 md） |
> | **关系日志条目**（【近期关系线索】） | ✅ **每一轮都进** | ✅ 也进 | `build-options.ts:567` 在主聊天组装的路径上调 `buildRelationshipContext(scopeId)` |
>
> 所以判据是**「删掉的代价」**，不是「删掉的效果」：
>
> - 实体节点是**纯派生 + 只有名字和关系标签**，删它**不损失任何人的经历** → 删（语音通话/主动消息是真实存在的注入路径，那里她确实会"认识"这个名字）；
> - K 类 L2 **装的是别人的经历**（"我和小明去看漫展"）→ 留；
> - **关系日志必须按人删**（这就是 §2.10 要给它加 `personKey` 的原因）—— 它是三者里唯一**每轮都进主聊天**的，留着它等于在群里继续"认识"他。
>
> 仍然保留**双重防呆**：① 只删 `type === "person"` 且名字**精确匹配** `knownNames` 的节点（不做子串、不做模糊）；② 预演里把候选节点（名字 / scope / 关联关系数）**列出来让用户确认**，同名误伤由人兜底。

### 2.10 关系日志：**必须按人删**（它是唯一每轮都进主聊天的载体）

**为什么这条不是可选项**：`buildRelationshipContext(scopeId)` 在主聊天的组装路径上被调用（`build-options.ts:567`，在 `buildAlwaysOnContext` 之后、与它同级），产物是【近期关系线索】。也就是说 —— **它是本阶段所有载体里唯一「每一轮都进主聊天 prompt」的那个**（L2 与实体图都不进，见 §2.9 的表）。关系日志里留着他的条目，等于**每轮都在提醒昔涟"有这么个人"**，这就是"删完还认识"的直接来源。

`relationship-log.json` 的 entries 有 `userText`（120 字截断）+ `scope` + `channel`，**没有归属人字段**。三步处理：

1. **给新数据补归属**（一处小改）：`RelationshipTurnInput` 加 `personKey?: string`；`build-options.ts:1044` 的调用点把已有的 `TurnAttribution.personKey` 传下去（P2 已经把它送到这一层了）。→ 新增 `RelationshipLogStore.eraseByPersonKey(personKey)`。
2. **私聊/独立域**：`solo:<他的私聊会话>` 可整域删 → `eraseByScope(scope)`（存量兜底，不需要 `personKey`）。
3. **⚠️ 群域里的存量条目（没有 `personKey`）—— 用「原文指纹」做确定性匹配**（不要只丢进残留清单）：

```
前提：步骤 ⑥ 过滤 transcript 时会收集「被删掉的那些行」的正文集合 D（见 §2.14 执行序）
对每条无 personKey 的 relationship entry：
  若 entry.userText 的前 LEGACY_MATCH_PREFIX(=24) 个字符出现在 D 里某一行 → 判定为他的轮次 → 删
```

- **为什么可靠**：`relationship entry` 的 `userText` 来源就是**那一轮触发者的消息正文**（`build-options.ts:1044` 传的 `userText`），与被删的 transcript 行**同源**；24 字前缀足以避开"在群里说过同样短句"的碰撞，而长度不足 24 字的短句（"在吗"）本就携带不了身份信息。
- **为什么不能靠 `scope` 删群域**：一个群域里混着所有人的关系条目，按域删会连累别人（与 §2.3 同一原则）。
- **顺序约束**：这条必须在 **transcript 之后**跑（要先有 D 集合）—— §2.14 的执行序满足（⑥ → ⑨）。
- **`dailySummaries`**：按 `(scope, date)` 聚合的文本，没有归属 —— 只能：若某 `scope` 的 entries 被删空（该 scope 再无 entry）则一并删除该摘要，否则保留并在预演报告里提示。

**预演报告**：把这四档**分开列** —— `relationshipEntries: { byPersonKey, byScope, byTextFingerprint, unmatched }`，让用户看得见哪一档生效了。

### 2.11 审计 / 运行日志 / 备份 / 调试日志：四个独立的擦除步骤（**语料不在其中**）

| 目标 | 新 API | 实现 |
|---|---|---|
| 渠道审计 | `erasePersonAudit(senderId): { entries: number; files: number }` | ① `index.jsonl` 逐行过滤 `entry.senderId === senderId`；② 删 `logs/` 下文件名含 `-<safeSender>-` 的日志文件（`audit-log.ts:254-255` 已把 `senderId` 拼进文件名）；③ 同步清理内存 `inMemory` 数组（`:135`） |
| 运行日志 | `erasePersonLog(senderId): number` | `channels/log.jsonl` 逐行过滤 `senderId`，并清 `message-log.ts:34` 的内存数组；保留 1000 行滚动语义（`MAX_FILE_LINES`，`:31`） |
| **记忆备份 + 对账备份** | `eraseMemoryBackups(): { files: string[]; sizeBytes: number }`（放在 `memory-deletion.ts`，与 `listMemoryBackupTargets` 同一处） | 删 `memory.backup.*.json` 与 `memory-reconcile-backups/` 整个目录。**整份销毁，不逐条过滤**（§0.4 约束 6） |
| **API 调试日志** | `eraseApiLog(): { deleted: boolean; sizeBytes: number }`（放在 `chat-api-utils.ts`，与 `getApiLogPath()` 同一处） | `fs.rmSync(getApiLogPath())`。**整份销毁**：① 它含每次调用的完整 prompt 正文；② `getApiLogPath()` 全仓无读取方（只写不读），删除不影响任何功能；③ 它是调试产物，不是用户资产 |

> 🚫 **`group-corpus/` 不在这个表里，而且永远不会进这个表。** 理由与完整论证见 §0.2 B 的承诺框与 §0.4 约束 2：它**不影响"认识"**（只写不读、零生产消费方），却是有长期价值的资产。**擦除流程里连它的路径字面量都不出现**（否则 `group-corpus-isolation.test.ts` 的"零消费方"守卫会变红）。
>
> 顺带记录一个**已经不需要解的**问题：`group-corpus.ts:145-163` 的目录名在"有名字"时一律是 `${id}__${name}`（`:152-157`），所以当"某个群号恰好等于某人的 QQ 号"时，`<QQ号>__<名字>` 是私聊目录还是群目录**无法从名字判断**。原方案为此设计了"只按行过滤 `uid`、不按目录名删"的绕法 —— 现在语料整个不碰，这个问题**自然消失**（将来自学习 T0 若真要过滤，仍然应沿用它：**只按行内 `kind`/`gid`/`uid` 判断，不信任目录名**）。

**为什么备份不能"过滤后保留"**：备份的**唯一用途**是回退到某个历史状态。擦除之后，任何一份包含他的备份都意味着"一次误操作就能让他回来"。所以"销毁备份"不是偷懒，而是**擦除语义的一部分**。

**为什么 `chat-api.log` 不能只删含他名字的块**：它是 `====` 分隔的**非结构化文本块**（`chat-api-utils.ts:32-43`），不是 JSONL，逐块解析/匹配"这条请求里有没有他"既不可靠（正文可能只是转述）也容易删错别人的轮次。整份删是唯一可靠解。

四者都是**同步**文件操作（`message-log.ts:46-65` / `audit-log.ts` / `memory-store-io.ts` / `chat-api-utils.ts` 本身即同步 IO）—— 与 §0.4 约束 4 同一原则，不要在这条链路上引入 `await`。

### 2.12 「疑似残留清单」：本地名字匹配，不调 LLM

总览 §4.5 原写的是「LLM 扫描 L0/L1，列出疑似提及」。**本方案降级为本地子串匹配**：

| 扫描对象 | 判据 | 为什么不用 LLM |
|---|---|---|
| L0 五字段 / L1 三字段 | `knownNames` 子串命中 | 名字匹配已经覆盖绝大多数情况；LLM 只多识别"代称"（"我那个网友"），价值低而成本/延迟高 |
| 银存 relationship-log entries（无 `personKey` 的） | 先按**原文指纹**匹配被删的 transcript 行（§2.10 第 3 步）；**匹配不上的**才进这份清单 | 指纹已有确定性判据，不需要 LLM |
| 桌面对话里的 `channelSource` 残留 | `channelSource.senderName ∈ knownNames` | 无 `senderId`，只能靠名字（§0.4 约束 3） |
| **开发期孤儿文件**：`channels/*.p0-backup`、`channels/tool-audit.jsonl` | 全仓 grep 零引用 → 扫一遍看是否含 `senderId` / `sessionId` / `knownNames` | 不属于产品产物，不自动删（避免动到开发者自己放的文件） |
| **别人提到他的记忆（K 类）** | **不扫、不删**（但会在控制台里列出来 + 在预演报告里计数） | **§2.3 的决定**：删它等于删别人的记忆、且那条记忆往往包含别人的经历 |
| **配置类痕迹**：`channels-settings.json` 的 `toolAccess` / `pairingPending` | 不扫、不删 | 访问控制配置（§0.2 排除表） |
| **群聊语料里他的原话** | **不扫、不读、不删** | **有意保留**：语料只写不读，不影响"认识"（§0.2 B / §0.4 约束 2） |

产出一个 `residues[]` 清单（`{ kind, file, snippet }`），在擦除报告的末尾展示给用户，**不自动修改**（L0/L1 是用户可编辑的结构化文本，误改代价高于漏改）。

> **这条同时修改了总览 §4.5 的结论**，已在总览里同步（见 §9 的概览改动清单）。

### 2.13 预演（dry-run）+ previewId + 二次确认；**不做回收站**

**预演**返回 `PersonErasePlan`：

```ts
export interface PersonErasePlan {
  personKey: string
  channel: string
  senderId: string
  knownNames: string[]
  sessions: Array<{
    sessionId: string
    kind: "private" | "group" | "unknown"
    l2Count: number
    hotLines: number          // 将被删/被过滤的行数
    archiveLines: number
    archiveMonths: number
  }>
  l2: {
    total: number                                        // 将被删除的条数
    byRule: { private: number; speaker: number }         // R1 / R2 各自的命中数
    ids: string[]
    keptSubjectOnly: number                              // K 类：别人提到他、**保留**
    keptSamples: Array<{ content: string; speakerIds: string[] }>   // 最多 5 条摘要，供用户核对
  }
  summaries: { decompress: string[]; remove: string[] }
  vectors: number
  evidence: number
  dmaeStates: number
  conflictLogs: number
  reflectionLogs: number
  entities: Array<{ name: string; scope?: string; relations: number }>
  relationshipEntries: { byPersonKey: number; byScope: number; byTextFingerprint: number; unmatched: number }
  audit: { entries: number; files: number }
  channelLogLines: number
  externalChats: number
  memoryBackups: { files: number; bytes: number }     // memory.backup.*.json + memory-reconcile-backups/
  apiLog: { exists: boolean; bytes: number }          // chat-api.log（整份删除）
  residues: Array<{ kind: "l0" | "l1" | "relationship" | "desktop" | "assistantText" | "devOrphan"; file: string; snippet: string }>
  warnings: string[]          // 例如「无法识别来源的 transcript 文件 N 个」「飞书私聊无法按 chatId 映射」
  previewId: string
}
```

> `memoryBackups` / `apiLog` 必须在预演里**显式列出**：这两项是"整份销毁"，用户有权在按下确认前知道自己会失去什么（备份回退能力 / 调试日志）。

**执行时的一致性校验**：

- 主进程持有 `Map<previewId, { personKey, ids: Set<string>, at: number }>`（**TTL 10 分钟**，只存 id 集合不存正文）。
- 执行时**按同一判据重算** H / `privateSessions` / `speakingSessions`；若重算出的 H 里出现了预演**没有的**条目（即"预演之后他又说了新的话"），**中止**并返回 `{ needsReconfirm: true, added: n }`，要求用户重新预演确认。
- 反之（重算后变少）不中止，正常执行并把差额写进报告。

**为什么不做快照 / 回收站**：

| 理由 | 说明 |
|---|---|
| **与"完全擦除"直接矛盾** | 删除内容快照=把被删正文留在磁盘上（`memory-deletion-log.json`），而 Q1 定的是"全局删除"、Q3 定的是"清掉被删对象的内容" |
| 与 Q3 的审计边界不一致 | 审计只记**动作**（`op` + `personKey` + 计数），不记内容 |
| 防呆已由预演 + previewId + 确认短语三层覆盖 | 误删风险主要在"不知道删了什么"，预演正好解决它 |

**可选的「导出」**（不在必做范围）：允许用户把即将删除的内容导出为一个 JSON 文件**到用户自己指定的位置**（由用户保管，不留在 `userData`）。列为 §8 的可选项。

### 2.14 执行顺序与失败语义

```
①  入队            enqueueLLMTask("MemoryPersonErase", …)
②  重算 + 校验     H / privateSessions / speakingSessions / knownNames，与 previewId 快照比对（§2.13）
③  记忆级联        deleteL2Cascade(H)  ← 含 evidence / DMAE / conflictLogs / 悬空指针 / 反思日志指纹
④  向量            deleteUserMemoryVectors(H 的 ragId + 被删总结的 ragId)
⑤  去压缩          幸存子条目 → active + 重建向量 + markSynced（§2.6）
⑥  transcript      同步单遍：热层 + 归档（§2.5）
⑦  审计+日志+备份   erasePersonAudit / erasePersonLog / eraseMemoryBackups / eraseApiLog
⑧  外部会话观察     forget(私聊 sessionId)
⑨  实体 + 关系      removeEntities(knownNames) / eraseByPersonKey
⑩  缓存            forgetMemoryInjections(H) / l2DmaeManager.loadStates() / forgetSessionIndex(senderId)
⑪  Obsidian         若已绑定 vault：syncToBoundVault() → manifest 反删孤儿 md
⑫  审计 + 报告      appendMemoryTrace({ op: "memory.personErase", … }) → PersonEraseReport

（共 12 步。**`group-corpus/` 不在这条流水线的任何一步里** —— §0.4 约束 2）
```

**顺序上的三个硬约束**：

- **⑥ 必须在 ③ 之前算好会话集合**，但**重写发生在 ③ 之后**：这样"他刚发的消息"不会因为 §2.2 的 S1 扫描时机而漏掉（⑥ 内部会重新扫一遍全量文件，不局限于 S1 的结果）。
- **⑩ 的 `l2DmaeManager.loadStates()` 必须在 ③ 之后**（它按 store 重建）。
- **⑨ 必须在 ⑥ 之后**：关系日志的存量指纹匹配要用 ⑥ 产出的「被删行正文集合 D」（§2.10），且 D 只活在本次调用的局部变量里（并发擦除不共享）。

**失败语义：不假装原子。** 每一步独立 try/catch，失败记入 `failed[{ step, target, error }]`，其余步骤继续；返回的报告里给出 `partial: boolean`，UI 提示「部分完成，可再次执行擦除以收敛」。
**擦除天然幂等**（重跑时命中集合只会变小），所以**"重试"就是恢复策略** —— 这也是不做事务的理由。

### 2.15 缓存：为什么 `memoryStore` 不需要 reload

`memoryStore.load()`（`:37-85`）命中 `this.cache` 直接返回同一个对象；所有写路径都是 **mutate 这个对象 + `save(store)`**（`:87-100`）。

级联删除同样走 `load()` → mutate → `save()`，所以**内存缓存与磁盘始终同源，不需要 `reload()`**。

> ⚠️ **但 `getAllL2()` 返回的是 `store.l2` 的数组引用**（`:364-367`）。级联删除里 `store.l2 = store.l2.filter(...)` **会换掉数组身份**，任何**长期持有旧引用**的消费者（例如面板缓存）会继续看到旧数据。规则：**删除后一律重新 `await memoryStore.getAllL2()`**，不要复用旧引用。

### 2.16 审计：`memory.personErase` 的命名与内容边界

| op | 何时 | `details` 里放什么 |
|---|---|---|
| `l2.delete.batch` | ③ 内部 | `{ requested, removed, evidence, dmaeStates, conflictLogs, dangling, decompressed, removedSummaries }`（**只有计数与 id 列表，无正文**） |
| `l2.decompress.restore` | ⑤ 内部 | `{ summaryId, survivors: n }` |
| `transcript.erase` | ⑥ 内部 | `{ sessions, hotLines, archiveLines, archiveMonths }` |
| `audit.erase` / `channels.log.erase` | ⑦ | `{ entries, files }` / `{ lines }` |
| `memory.backup.erase` / `chatApiLog.erase` | ⑦ | `{ files, bytes }` / `{ deleted, bytes }`（**只记大小，不记内容**） |
| `entity.erase` / `relationship.erase` | ⑩ | `{ names, nodes, relations }` / `{ entries, summaries }` |
| **`memory.personErase`** | ⑫ 收尾 | `{ personKey, channel, sessions, l2, transcriptLines, entities, relationshipEntries, residues, failed }`（**不记被删正文**，符合 Q3） |

`memory-trace.log` **本身不由擦除流程清理**（它是"删除动作"的审计载体，Q3 明确保留），也不在 `PERSON_ERASABLE` 里。

### 2.17 控制台 UI 形态

**放在哪**：`设置 → 记忆`（`#memory-panel`）内新增一张卡片「记忆管理」，**不新增侧边栏导航项**。理由：① 用户原话就是「设置-记忆-昔涟记忆变为一个类似控制台的页面」，入口保持一致；② 新增导航项要动 `NAV_LABELS`（`settings.ts:281-297`）、`switchSection`（`:913-986`）与 `panel-migration-markup.test.ts` 的排除条件，改动面与收益不成比例。

**形态**：**列表 ↔ 详情两态切换**（仓内先例：`memory/obsidian-vault-ui.ts:23-33` 的 unbound/bound、`settings.ts:1096-1100` 的 music home/detail；**不用 Tab** —— 全仓没有任何 tab 组件与样式）。

```
┌ 记忆管理 ────────────────────────────────────────────────┐
│ [按人] [按域] [按会话]   ⟳ 刷新            <反馈区>        │
│ ┌ 批量条（勾选后出现） 已选 N 项  [删除所选] ┐             │
│ ├─ 列表（#memory-manager-list）──────────────┐            │
│ │ ☐ 小明  10001   12 条 · 2 个会话  [查看]   │            │
│ │ ☐ 小红  10002    5 条 · 1 个会话  [查看]   │            │
│ │ ☐ 来源未知（无归属记忆）        37 条       │            │
│ └───────────────────────────────────────────┘            │
│ ── 详情（#memory-manager-detail，默认 is-hidden）────────  │
│  小明 (10001)                        [关闭]              │
│  🗣 他的记忆 4 条（会被擦除）                             │
│  👥 别人提到他 8 条（默认保留，可手动勾选删除）            │
│  来源：测试群 / 私聊                                      │
│  [彻底擦除此人]  ← 危险按钮，仅「按人」视图出现            │
│  ┌ 🗣 他的记忆（多选）  已选 N  [删除所选] ┐              │
│  │ ☐ 「我最近在学 Rust」 09-24 10:00        │             │
│  │    来自：测试群 · 原话：「我最近在学 Rust」[溯源] │      │
│  └──────────────────────────────────────────┘            │
│  ┌ 👥 别人提到他（多选）  已选 N  [删除所选] ┐            │
│  │ ☐ 「小明最近在学 Rust」 09-24 10:05       │            │
│  │    说话人：小红(10002) · ⚠️ 删它会连带动到小红的记录 │   │
│  └──────────────────────────────────────────┘            │
│  ── 溯源（#memory-manager-trace）──────────────────────   │
│   [小红]: 你不是讨厌美式吗？      ← sourceMessageIds 回溯  │
│   [小明]: 我最近改喝美式了，以前最讨厌                     │
└──────────────────────────────────────────────────────────┘
```

> ⚠️ **两组必须分开显示、分开勾选**（§2.3 的判据）：`🗣 他的记忆` = `speakerIds ∋ P` 或在他的私聊会话里（**「彻底擦除」会删的就是这一组**）；`👥 别人提到他` = 只有 `subjectIds ∋ P`（**默认保留**，勾选删除时给一句"会连带动到 XX 的记录"的提示）。这正是"删除判据"与"展示判据"分离在 UI 上的落地 —— 用户想手动删谁都可以，但系统**默认不替他做这个决定**。

**三个视图的数据来源**：

| 视图 | 分组键 | 数据来源 |
|---|---|---|
| **按人** | `personKey` | ① L2 的 `subjectIds` / `speakerIds`；② **存量兜底**：`sourceConversationId` ∈ 私聊会话（名册 B/C 里 `chatType==="private"` 且 `chatId===senderId`）→ 推出 `personKey`；③ 有私聊会话但 0 条记忆的人也**列出**（否则「重置一个只聊过几句的人」无从下手） |
| **按域** | `scope` | `memoryStore.getAllL2()` 按 `scope` 分组（含 `undefined` 的 legacy 组） |
| **按会话** | `sourceConversationId` | 同上；会话显示名从名册 B/C 取（群名/昵称），取不到则显示 sessionId |

**列表每行显示什么**（按人）：昵称（`knownNames` 最新一个）+ QQ 号 + 「他的记忆 N 条 / 别人提到他 M 条」+ 来源会话数 + 【查看】。**两个数字分开给**，用户一眼就能看出「彻底擦除」会动多少、会留多少。
**每行的删除按钮**：仅 D1/D2（单条/批量）与 D4（该人「他的记忆」全部），**「彻底擦除」只出现在详情区**（避免在列表里误点最危险的动作）。

**溯源**：点「溯源」→ `MEMORY_TRACE_SOURCE(memoryId)` → 主进程按 `sourceMessageIds` 去 transcript 里取那几行 + 前后各 2 行，返回 `{ entries: Array<{speakerName?, speakerId?, role, content, at, file}>, missing: boolean }`。**归档层也查**（`listArchiveMonths` + `loadArchivedHistory`）。

**新增 DOM id（16 个，全部放在 `#memory-panel` 段内）**：

```
memory-manager-view-people / -view-zones / -view-sessions   ← 三个视图按钮（radiogroup 形态）
memory-manager-refresh-btn
memory-manager-feedback
memory-manager-list
memory-manager-batch-bar / -batch-count / -batch-delete-btn
memory-manager-detail / -detail-title / -detail-summary / -detail-close-btn
memory-manager-detail-list / -detail-delete-btn / -erase-btn / -trace
```

> ⚠️ 放入 `#memory-panel` 是硬要求：`memory/panel.test.ts:9-29,42` 会把 `index.html` 里 `id="memory-panel"` 那一段整体抽出来注入 jsdom，段外的 id 在测试里根本不存在。
> ⚠️ 凡是被 `dom.ts` 用 `export const X = document.getElementById("id")` 引用的 id，必须同时出现在 `index.html` —— `dom-refs-consistency.test.ts:60-66` 双向校验（反向不校验）。

**CSS**：新增 `.memory-manager*` 一组类，批量条直接抄 `.zones-batch-actions` 的样式（`settings.css:4733-4753`），反馈区抄 `.zones-feedback`。

---

## 3. 逐文件改动

### A. 删除内核

#### 3.1 `src/main/memory/memory-store.ts`

**新增 1：`deleteL2Cascade(ids: readonly string[])`**

```ts
export interface L2CascadeResult {
  requested: number
  removed: L2Memory[]            // 被删的条目（调用方据此取 ragId）
  evidence: number
  dmaeStates: number
  conflictLogs: number
  danglingRefsFixed: number      // conflictWith / supersededBy / mergedInto
  reflectionLogs: number
  summaries: L2Memory[]          // 引用被删 id 的总结（`isSummary && subEntryIds ∩ ids`）
}

async deleteL2Cascade(ids: readonly string[]): Promise<L2CascadeResult>
```

逐项实现（**一次 `load()` + 一次 `save()`**）：

```
1. idSet = new Set(ids)，空则直接返回
2. removed = store.l2.filter(m => idSet.has(m.id))
3. store.l2 = store.l2.filter(m => !idSet.has(m.id))
4. store.evidence = (store.evidence ?? []).filter(e => !idSet.has(e.memoryId))
5. store.l2DmaeStates = (store.l2DmaeStates ?? []).filter(s => !idSet.has(s.l2Id))
6. removedRagIds = removed.map(m => m.ragId).filter(Boolean)
7. store.conflictLogs = (store.conflictLogs ?? [])
     .filter(l => !idSet.has(l.sourceL2Id) && !idSet.has(l.targetL2Id))
     .map(l => l.resolutionMemoryId && idSet.has(l.resolutionMemoryId)
                ? { ...l, resolutionMemoryId: undefined } : l)
8. 悬空指针（遍历幸存条目）：
     m.conflictWith    = m.conflictWith?.filter(r => !removedRagIds.includes(r))
     m.supersededBy    = idSet.has(m.supersededBy) ? undefined : m.supersededBy
     m.mergedInto      = idSet.has(m.mergedInto)   ? undefined : m.mergedInto
     （清空后字段置 undefined；保存时 JSON.stringify 会丢掉 undefined 键）
9. summaries = 幸存条目里 isSummary 且 subEntryIds 与被删 id 有交集
10. reflectionLogs 指纹清理（§2.8）：删除 details 含任一 removed[].content（长度 ≥ 8）的日志
11. await save(store)
12. appendMemoryTrace({ op: "l2.delete.batch", … })（计数，无正文）
```

**新增 2：`updateL2StatusBatch` 复用现有 `updateL2Status(ids, status)`（`:635`）** —— 去压缩恢复直接用，不新增 API。

**新增 3（可选，便于测试）**：把上面的第 9/10 步拆成纯函数导出：

```ts
export function collectSummaryDependents(l2: readonly L2Memory[], removedIds: ReadonlySet<string>): L2Memory[]
export function countReflectionLogsByFingerprint(logs: readonly ReflectionLog[], contents: readonly string[]): number
```

> 注意：`getAllL2()` 返回引用（`:364-367`）。本方法内部一律用 `store.l2`，**不经过 `getAllL2()`**。

#### 3.2 新增 `src/main/memory/person-erase-plan.ts`（纯函数，零 IO）

```ts
export interface EraseScopeInput {
  personKey: string
  memories: readonly L2Memory[]          // 全量 L2
  sessions: readonly SessionRosterItem[] // 名册（§1.5 B+C+sourceConversationId）
}

export interface SessionRosterItem {
  sessionId: string
  channel: string
  chatId: string
  chatType: "private" | "group"
  senderName?: string
  /** 该会话在热层/归档里被扫到的行数（由 transcript 扫描侧注入，可为 0） */
  matchedLines?: number
}

export function parsePersonKey(personKey: string): { channel: string; senderId: string } | null
export function buildSessionRoster(input: {
  externalChats: readonly ExternalChannelChat[]
  zoneMembers: readonly ZoneExternalMember[]
  memories: readonly L2Memory[]
}): SessionRosterItem[]
export function buildPrivateSessions(input: EraseScopeInput): Set<string>     // R1 用
export function buildSpeakingSessions(input: EraseScopeInput): Set<string>    // 仅 transcript / 报告用
export function computeEraseHits(input: EraseScopeInput): {
  hits: L2Memory[]                                  // R1 ∪ R2
  byRule: { private: number; speaker: number }
  keptSubjectOnly: L2Memory[]                       // K 类：只列出来，绝不并入 hits
  summaries: { decompress: L2Memory[]; remove: L2Memory[] }
}
```

> ⚠️ **`computeEraseHits` 的返回值里没有任何"按 `subjectIds` 命中"的项** —— 这是 §2.3 决定在**类型层面**的体现：将来若有人想加回"删别人转述的记忆"，他必须**改这个函数的签名**，而不是偷偷在某个 if 里加一个条件。返回值里 `keptSubjectOnly` 只用于展示与报告。

> **纯函数、零 IO、可单测** —— 与 `person-attribution.ts` 同一风格。**判据只在这一处**，预演与执行共用同一个函数，这是 §2.13 一致性校验能成立的前提。

#### 3.3 新增 `src/main/memory/person-erasure.ts`（编排器）

```ts
export interface PersonEraseDeps {
  userDataDir?: string
  llmQueue?: <T>(label: string, task: () => Promise<T>) => Promise<T>   // 默认 enqueueLLMTask
  now?: () => number
}
export async function previewPersonErase(personKey: string, deps?): Promise<PersonErasePlan>
export async function executePersonErase(
  personKey: string, previewId: string, deps?,
): Promise<PersonEraseReport>
export function _resetErasePreviewStoreForTest(): void
```

- `previewPersonErase`：构造名册 → 扫 transcript（只读）→ 算 H → 组装 plan → 存 `previewId`。
- `executePersonErase`：校验 previewId → 入 `llmQueue` → 按 §2.14 的 12 步执行 → 返回报告。
- ⚠️ **要维护一条跨步骤的数据流**：步骤 ⑥（transcript）产生的**被删行正文集合 D** 必须传给步骤 ⑨（关系日志的存量指纹匹配，§2.10）。实现上把它放在**编排器的局部变量**里（不要放模块级单例 —— 并发两次擦除会互相污染；`previewId` 表已经说明了这个模式）。
- 所有文件操作走依赖注入（`userDataDir`），便于测试用临时目录。

### B. transcript

#### 3.4 `src/main/channels/history-log.ts`

```ts
/** 列出全部 transcript 文件（热层 + 归档），同步。 */
export function listTranscriptFiles(): Array<{
  file: string
  fileBase: string                 // 不含 .jsonl
  layer: "hot" | "archive"
  month?: string
}>

/** 文件名 → sessionId（权威名册优先，正则退化，失败返回 null）。 */
export function sessionIdFromFileName(fileBase: string, known: ReadonlyMap<string, string>): string | null

/** 逐行过滤重写一个文件；返回行数统计。**同步**（见 §0.4 约束 4）。 */
export function filterTranscriptFile(
  file: string,
  keep: (entry: HistoryEntry) => boolean,
): { total: number; kept: number; removed: number }

/** 整个会话删除（热层文件 + 归档目录）。用于私聊。 */
export function removeTranscriptSession(sessionId: string): { hot: boolean; archiveDir: boolean }
```

实现要点：

- `filterTranscriptFile`：`readFileSync` → 按 `\n` 切 → `JSON.parse`（解析失败的行**原样保留**，绝不因坏行丢数据）→ 用 `keep` 判定 → `writeFileSync`（以 `\n` 结尾，与既有格式一致）。
  - `keep` 的入参是 `HistoryEntry`（**不是 raw line**），因为判定要看 `speakerId`；但写回的是**原始行**（不改写别人那几行的字节）。实现上保留 `{ raw, parsed }` 二元组。
- `removeTranscriptSession`：`fs.rmSync(filePath(sessionId), {force:true})` + `fs.rmSync(archiveDir(sessionId), {recursive:true, force:true})`。
- **不引入任何 `await`**。

#### 3.5 新增 `src/main/channels/transcript-erasure.ts`

```ts
export interface TranscriptEraseResult {
  sessions: number
  privateSessions: string[]
  hotLines: number
  archiveLines: number
  archiveMonths: number
  unknownFiles: string[]      // 无法识别 sessionId 的文件
  /** 被删掉的 user 行的正文（去重、截断到 200 字）—— 供 §2.10 的关系日志存量指纹匹配用 */
  removedUserTexts: string[]
  failed: Array<{ file: string; error: string }>
}

export function scanPersonTranscripts(input: {
  channel: string
  senderId: string
  known: ReadonlyMap<string, string>
}): { sessions: string[]; hotLines: number; archiveLines: number; unknownFiles: string[] }

export function erasePersonTranscripts(input: {
  channel: string
  senderId: string
  known: ReadonlyMap<string, string>
  privateSessions: ReadonlySet<string>   // §2.2 的 S3
}): TranscriptEraseResult
```

判定：`sessionId` 对应的渠道 ≠ 目标渠道 → 跳过（**跨渠道不会撞 id**，因为是 `channel:<ch>:<hash16>`，hash 里已含渠道）。

**这是本阶段唯一需要"扫全量文件"的地方**：每次擦除要遍历 `channels/history/` 与 `channels/archive/` 的全部文件。量级评估：热层每会话 ≤ 200 行；归档按月分片。对几千个会话也在**同步 IO 的一个 tick 内**完成（无 await）。**在文档与代码里都注明：如果将来会话数上到万级，这里要改成先按渠道筛文件再处理**。

### C. 外围

#### 3.6 `src/main/memory/entity-graph.ts`

```ts
removeEntities(criteria: {
  names: readonly string[]
  types?: readonly EntityNode["type"][]
}): { nodes: EntityNode[]; relations: number }
```

- 匹配：`(types ? types.includes(e.type) : true) && (names.includes(e.name) || e.aliases.some(a => names.includes(a)))`。
- 删除命中节点 + `relations` 里任一端指向被删节点的条目 → `save()`。
- **不改 `reset()` 的语义**。

#### 3.7 `src/main/relationship/relationship-log.ts`

```ts
export interface RelationshipTurnInput {
  userText: string; assistantText: string; cyreneFeeling: string
  channel: RelationshipChannel
  scope?: string
  personKey?: string          // ← 新增（P3）
}
export interface RelationshipLogEntry extends RelationshipTurnInput { … }   // 自动继承
// class RelationshipLogStore 新增：
async eraseByPersonKey(personKey: string): Promise<{ entries: number; summaries: number }>
async eraseByScope(scope: string): Promise<{ entries: number; summaries: number }>   // 存量私聊/独立域用
async eraseByUserTextFingerprint(
  scopes: readonly string[],                 // 只在「他发过言」的那些域里找，别全库扫
  removedUserTexts: readonly string[],       // 步骤 ⑥ 的产物 D
  prefixLength = 24,
): Promise<{ entries: number; summaries: number; unmatched: number }>   // 存量群域兜底（§2.10 第 3 步）
```

- `eraseByPersonKey`：过滤 `entries`；对 `dailySummaries`，若其 `scope` 下的 entries 已**全部**被删（即该 scope 不再有 entry）则一并删除。
- `eraseByScope`：整域删（用于存量 `solo:<他的私聊会话>`）。
- `eraseByUserTextFingerprint`：**确定性匹配**，不猜 —— 只比对 `entry.userText.slice(0, 24)` 是否命中 D 中任一被删行的开头；`unmatched` 计入预演报告的第四档。
  - ⚠️ **必须先构造前缀集合再逐条比对**（`Set<string>`，O(n+m)），不要在双重循环里对每次比对都做 `slice` —— 500 条 entry × 上千被删行会变慢。
  - ⚠️ **只在 `scopes` 限定的域里跑**：全库扫会把别的群域里"别人说过同样短句"误伤。

#### 3.8 `src/main/orchestrator/build-options.ts`

`:1044` 的 `recordRelationshipTurn({...})` 增加 `personKey: attribution.personKey`（P2 已经把 `TurnAttribution` 送到这一层；`build-options.ts:229` 的依赖类型同步加可选字段）。

#### 3.9 `src/main/memory/recent-injected-memory.ts`

```ts
export function forgetMemoryInjections(l2Ids: readonly string[]): number
```
按 `l2Id` 过滤内部数组（保留 `clearRecentMemoryInjections()`）。

#### 3.10 `src/main/memory/l2-dmae-manager.ts`

**不新增 API**：擦除后调用现成的 `await l2DmaeManager.loadStates()`（`:77-91` 内部 `dmae.clear()` + 按 store 重建 + `intrinsicValues.clear()`）。在文档与注释里写明这是**官方失效姿势**。

#### 3.11 `src/main/corpus/group-corpus.ts` —— 🚫 **本阶段不改这个文件**

**不做任何改动**：不加 `erasePersonCorpus`，不加 import，不在擦除链路里引用它，**连 `group-corpus` 这个字面量都不出现在本阶段新增的任何生产文件里**（否则 `group-corpus-isolation.test.ts` 的「没有任何别的文件碰语料路径字面量」守卫会变红，见 §0.4 约束 2）。

**要改的只有文档**：`docs/group-corpus.md` §8 的「下一步（T0–T3）」补一条 T0 前置约束 ——

> **T0 纪律：语料是只增资产，清理一律在使用端做。**
> 若届时存在"已被擦除的人"，正确做法是在采样时按**排除名单**跳过（建议 `userData/corpus-exclusions.json`，存 `{ channel, idHash: sha256(personKey) }`，只存哈希不存 QQ 号），
> **不要**在语料文件里就地删行 —— 那会让按人分层的统计基线失真且不可逆。
> 名单的写入方**将来**是记忆擦除流程（§3.12b 的收尾步骤）；本阶段**写入方与读取方都不实现**（没有消费者就不写代码 —— P2 的教训）。

> 换句话说：本阶段对语料的唯一贡献是**一条纪律 + 一段设计记录**，磁盘上的字节一个都不动。

#### 3.12 `src/main/channels/audit-log.ts` + `src/main/channels/message-log.ts`

```ts
// audit-log.ts
export function erasePersonAudit(senderId: string): { entries: number; files: number; failed: string[] }
// message-log.ts
export function erasePersonLog(senderId: string): { lines: number; failed: string[] }
```

- audit：过滤 `index.jsonl`（逐行 `JSON.parse` → `entry.senderId !== senderId`），删 `logs/` 下文件名含 `-${safeSender}-` 的文件（`safeSender` 的算法与 `:254` **必须完全一致**，抽成一个导出函数，避免两处漂移），同步清理 `inMemory`（`:135`）。
- log：过滤 `channels/log.jsonl`（保留 1000 行滚动语义，即过滤后重新写整个文件），清理 `message-log.ts:34` 的内存数组。

#### 3.12b `src/main/memory/memory-deletion.ts` + `src/main/chat-api-utils.ts`（`memory-store-io.ts` 只读依赖，不改）

```ts
// memory-deletion.ts
export const MEMORY_BACKUP_GLOBS = ["memory.backup.*.json"] as const
export function listMemoryBackupTargets(userDataDir?: string): string[]        // 展开 glob + memory-reconcile-backups/
export function eraseMemoryBackups(deps?): { files: string[]; bytes: number; failed: string[] }
// deleteAllMemory 内部新增：对 listMemoryBackupTargets() 的结果逐个 rmSync（与既有循环同一个 try/catch 语义）

// chat-api-utils.ts
export function eraseApiLog(): { deleted: boolean; bytes: number }
```

- `MEMORY_TARGETS` 增加 `"memory-reconcile-backups/"`（目录可进清单）；`memory.backup.*.json` 走 `MEMORY_BACKUP_GLOBS`（glob 不能直接进 `MEMORY_TARGETS`）。
- ⚠️ **`deleteAllMemory` 的既有 5 条测试必须仍然通过**（`memory-deletion.test.ts:25-99`：全量扫、保留名单、缺失不报错、失败继续、trace）；新增这条 glob 后要补一条"备份也被删"的用例。
- ⚠️ `group-corpus-isolation.test.ts` 断言 `MEMORY_TARGETS` 与 `group-corpus/` **路径互不包含** —— `memory-reconcile-backups/` 不与其重叠，但施工后**必须重跑该测试**确认。

#### 3.13 `src/main/channels/conversation-binding-store.ts`

```ts
forget(sessionIds: readonly string[]): number   // 从 externalChats 移除，persist()
```
⚠️ 只删**私聊**会话（群记录必须保留 —— 它是区块成员选择器的唯一数据源，`docs`/P0 记录已明确）。

#### 3.14 `src/main/channels/channel-context.ts`

```ts
export function forgetSessionIndex(senderId: string): number   // 清理 sessionIndex（:71）
```

#### 3.15 Obsidian：不新增 API，复用导出同步

擦除流程末尾（若 `loadObsidianVaultConfig().vaultPath` 非空）调用 `syncToBoundVault()`（`obsidian-exporter`）。它内部按 **manifest 反删**（`obsidian-exporter.ts:439-458`）：内存里已没有的 L2 / 实体 / 回顾 → 对应 `.md` 成为孤儿 → 被删。

> 这条替代了"按 id 删 md"的方案：**导出器本来就有孤儿回收，重复实现只会多一个分叉点。**

### D. IPC / preload / 渲染侧类型

#### 3.16 六条新通道

```ts
// src/shared/ipc-channels.ts（接在 :287 的 MEMORY_DELETE_ALL 之后）
MEMORY_MANAGER_LIST:       "memory-panel:manager-list",     // { view } → { items }
MEMORY_MANAGER_QUERY:      "memory-panel:manager-query",    // { view, key } → { memories, meta }
MEMORY_MANAGER_DELETE:     "memory-panel:manager-delete",   // { ids } 或 { container } → L2CascadeResult 摘要
MEMORY_ERASE_PREVIEW:      "memory-panel:erase-preview",    // { personKey } → PersonErasePlan
MEMORY_ERASE_PERSON:       "memory-panel:erase-person",     // { personKey, previewId } → PersonEraseReport
MEMORY_TRACE_SOURCE:       "memory-panel:trace-source",     // { memoryId } → { entries, missing }
```

- `memory-user-ipc.ts`：在 `:141-165` 之间插入 6 个 `ipc.handle`；`executePersonErase` 是唯一需要 `await` 的（跑几十秒），UI 侧要有 loading 态。
- `preload/index.ts`：`memoryPanelApi`（`:624-658`）加 6 个方法，写法照抄（一行一个 `ipcRenderer.invoke`，多参数打包成对象）。
- `src/renderer/settings/shared/types.ts`：`MemoryPanelApi`（`:193-231`）加 6 个方法签名 + `PersonErasePlan` / `PersonEraseReport` / `MemoryManagerItem` 三个类型（照抄主进程类型，**不 import 主进程模块**）。
- ⚠️ **`MEMORY_ERASE_PERSON` 不进 `restartRequired` 流程**：擦除全程走内存缓存失效（§2.15），**不需要重启**。这是与「删除全部记忆」最大的体验差别。

### E. UI

#### 3.17 `src/renderer/settings/index.html`

在 `#memory-panel` 的 L2 卡片之后（`:597` 附近）插入「记忆管理」卡片；静态骨架含 §2.17 的 16 个 id。
**注意**：`data-i18n` 当前不生效（§0.4 约束 5），所以静态文案直接写中文，动态文案由 TS 填。

#### 3.18 `src/renderer/settings/memory/dom.ts`

按现有写法追加 16 个 `export const memoryManagerXxx = document.getElementById("memory-manager-xxx") as HTMLElement | null`。
> 必须严格用这个正则形态（`dom-refs-consistency.test.ts:35` 只认 `export const X = document.getElementById("id")`），且 id 必须已在 HTML 里。

#### 3.19 新增 `src/renderer/settings/memory/manager.ts`

```ts
export type ManagerView = "people" | "zones" | "sessions"
export const managerState = { view: "people" as ManagerView, items: [], detail: null, selected: new Set<string>(), eventsBound: false }
export async function loadMemoryManager(): Promise<void>      // 进面板时调
export function disposeMemoryManager(): void                  // 离开面板时调（清勾选/关详情）
export function renderManagerList(): void
export function renderManagerDetail(): void
export function renderManagerBatchBar(): void
export function pruneManagerSelection(items: readonly MemoryManagerItem[]): void
function bindManagerEvents(): void                             // 事件委托，只绑一次
```

**形态照抄 `zones/panel.ts`**：`bindZonesPanelEvents`（`:548-592`）的 `data-*` + `closest()` 委托、`renderBatchBar`（`:208-215`）、`pruneSelection`（`:238-...`）、`setZonesFeedback`（`:29-55`）。
**风险区按钮**（彻底擦除）用 `.ghost-btn--danger`（与 `#memory-delete-all-btn` 一致）。

#### 3.20 新增 `src/renderer/settings/memory/erasure-flow.ts`

```ts
export function eraseConfirmPhrase(): string        // t("settings.panel.memory.manager.erase.confirmPhrase")，默认「彻底擦除」
export function isEraseConfirmed(input: string): boolean
export function buildErasePlanBody(plan: PersonErasePlan): string   // 供 showHtmlModal
export function buildEraseReportBody(report: PersonEraseReport): string
export async function runPersonEraseFlow(personKey: string): Promise<void>
export function initMemoryManagerUI(): void
```

流程（**三段式**，比 delete-all 多一段"预演"）：

```
点击「彻底擦除此人」
 → window.memoryPanel.erasePreview(personKey)        // ① 预演
 → showHtmlModal(分类计数 + 残留清单 + 警告)          //    用户在看清"要删什么"之后才进入确认
 → showInputModal({ confirmValue: eraseConfirmPhrase() })  // ② 二次确认（严格相等门控）
 → window.memoryPanel.erasePerson(personKey, previewId)    // ③ 执行
 → showHtmlModal(报告：各类计数 + failed 列表 + 残留清单)
 → 若 report.needsReconfirm → 提示「预演之后又出现了 N 条关于他的记忆，请重新预演」并回到 ①
 → 刷新列表
```

**不弹重启**（§3.16）。

#### 3.21 `src/renderer/settings/settings.ts` + i18n

- `settings.ts`：`switchSection` 的 memory 分支里加 `void loadMemoryManager()`（`:936-937` 附近）；非 memory 分支加 `disposeMemoryManager()`；顶层 `initMemoryManagerUI()`（与 `initDeleteAllMemoryUI()` 并列，`:1105-1107`）。
- i18n：新增 `settings.panel.memory.manager.*`（zh-CN + en **双份**，`zones-markup.test.ts:169-192` 那种双份校验测试要对新 key 生效）。
  需要的 key 至少：`title` / `viewPeople` / `viewZones` / `viewSessions` / `refresh` / `batchCount` / `deleteSelected` / `detailAbout` / `detailSaid` / `eraseButton` / `erase.confirmPhrase` / `erase.previewTitle` / `erase.reportTitle` / `trace.title` …

---

## 4. 测试计划

### 4.1 新增 `src/main/memory/person-erase-plan.test.ts`（纯函数，核心）

| # | 用例 | 断言 |
|---|---|---|
| 1 | `parsePersonKey` | `"qq:10001"` → `{qq,10001}`；`"my_channel:ou_xxx"` → `{my_channel, ou_xxx}`；无 `:` → `null` |
| 2 | `buildSessionRoster` 三源并集 | externalChats + zones + L2 的 `sourceConversationId` 去重合并且字段不丢 |
| 3 | `computeEraseSessions` | 群会话由 `speakerId` 命中进入集合 |
| 4 | R1 私聊无条件 | 私聊会话里 `subjectIds` 为空的 legacy L2 也命中 |
| 5 | R1 私聊优先于 K | 他的私聊里提到第三方的 L2（`subjectIds=[小红]`）**命中 R1**（与"私聊整会话删除"保持一致） |
| 6 | **K 类保留（§2.3 的核心防线）** | 同群的 `speakerIds=[B]` + `subjectIds=[P]` → **不命中** |
| 7 | K 类保留（别的域同理） | 小红私聊域 / 他不在的群里的 `subjectIds=[P]` → 不命中 |
| 7b | **`subjectIds` 不参与删除判据** | 构造 `subjectIds=[P]` 且 `speakerIds` 缺失的条目，断言**永不进入 `ids`**（哪怕它在 `speakingSessions` 内） |
| 8 | 无归属 legacy 不命中 | 群里无 `speakerIds/subjectIds` 的 L2 → 不命中（转述也留，纯无归属也留） |
| 9 | 跨渠道不误伤 | `qqbot:10001` 的 L2 不被 `qq:10001` 命中 |
| 10 | 总结分类 | `subEntryIds` 有幸存 → `decompress`；全部被删 → `remove` |
| 11 | 纯函数性 | 同一输入调用两次结果逐字段相等；不修改入参数组 |

### 4.2 `src/main/memory/memory-store.test.ts` 增量（cascade 矩阵）

| # | 用例 | 断言 |
|---|---|---|
| 1 | 清 `l2` + `evidence` | 与既有 `:220` 用例一致（回归） |
| 2 | 清 `l2DmaeStates` | 孤儿状态 0 条 |
| 3 | 清 `conflictLogs`（source / target） | 命中即整条删 |
| 4 | 清 `resolutionMemoryId` | 日志保留、字段变 `undefined` |
| 5 | 修 `conflictWith` | 悬空 ragId 0 个 |
| 6 | 清 `supersededBy` / `mergedInto` | 指向被删 id 时字段消失；**status 不变** |
| 7 | 总结进入 `summaries` | 只有 `subEntryIds` 有交集的才进 |
| 8 | 反思日志指纹清理 | 短正文（<8）不参与匹配（防误伤） |
| 9 | 一次 `save()` | `save` 被调用 1 次（用 spy 断言，防止 N 次落盘） |
| 10 | 空入参 | 不改任何字段、不落盘 |

### 4.3 新增 `src/main/channels/transcript-erasure.test.ts`（真实临时目录）

风格照抄 `history-log.test.ts`：真实 fs + `vi.mock("electron", () => ({ app: { getPath: () => TMP } }))`。

| # | 用例 | 断言 |
|---|---|---|
| 1 | 群文件逐行过滤 | 同文件混排 3 个 `speakerId` → 只删目标行，其余**字节不变** |
| 2 | 坏行不丢 | 文件里插一行非法 JSON → 过滤后它仍在 |
| 3 | `speakerId` 缺失的行保留 | 私聊/legacy 行不被误删 |
| 4 | 归档同步 | 目标行在 `<月>.jsonl` 里也被清掉，月份桶不变 |
| 5 | 私聊整会话 | 热层文件 + 归档目录都被删 |
| 6 | 归档目录变空即删 | 目录不存在 |
| 7 | 群会话过滤后为空 | 文件仍存在且为空 |
| 8 | `sessionIdFromFileName` 权威名册优先 | `known` 命中时不走正则 |
| 9 | `sessionIdFromFileName` 退化正则 | `channel_qq_ab12cd34` → `channel:qq:ab12cd34` |
| 10 | 含 `_` 的渠道名不被错误切分 | `my_channel` 的文件在**无名册**时返回 `null`（宁可不动） |
| 11 | 别的渠道不受影响 | 只处理目标渠道的会话 |
| 12 | **同步性回归** | 断言 `filterTranscriptFile` 返回的是普通值而不是 Promise（`typeof x !== "object" \|\| !("then" in x)`）—— 锁住 §0.4 约束 4 |
| 13 | 过滤与并发 append 交错 | 先 append 一行再过滤 → 那行仍在（模拟"重写前刚写入"） |

### 4.4 各外围模块增量

| 文件 | 用例 |
|---|---|
| `entity-graph` | **新增测试文件**（现在没有）：`removeEntities` 按名/别名命中、按 type 过滤、relations 一起清、不命中不改、`save()` 只调一次 |
| `relationship-log.test.ts` | `personKey` 落盘；`eraseByPersonKey` 清 entries + 孤儿 dailySummary；`eraseByScope` 整域删；**`eraseByUserTextFingerprint`：前缀命中即删、前缀不足 24 字的条目不误删、不在 `scopes` 内的域一条不动、`unmatched` 计数正确**；老数据无 `personKey` 时不误删 |
| `recent-injected-memory.test.ts` | `forgetMemoryInjections` 按 id 删、其余保留、不存在 id 不报错 |
| `memory-rag-reconciliation.test.ts` | **新增一条**：L2 从 store 移除后，孤儿向量在下次对账被回收（锁住"不会复活"） |
| `group-corpus.test.ts` | **不改**（本阶段不碰语料模块） |
| `group-corpus-isolation.test.ts` | **新增 1 条**（这是本阶段对语料唯一的新增测试）：造一个含 `group-corpus/` 文件的临时 userData + 一个完整可擦除的人的痕迹，**跑完 `erasePerson` 后断言语料文件逐字节不变、mtime 未变**；外加既有断言回归：`group-corpus/` **不在 `PERSON_ERASABLE` 里**、`MEMORY_TARGETS` 与其路径互不包含 |
| **新增 `memory-erasure-corpus-guard.test.ts`**（架构守卫） | 扫描本阶段新增的全部生产文件（`person-erasure.ts` / `transcript-erasure.ts` / `memory-deletion.ts` 等），断言：① 没有 `from ".../corpus/group-corpus"` 形式的 import；② 没有带引号的精确字面量 `"group-corpus"`（与 `group-corpus-isolation.test.ts:111,125` 同一套判据）—— 把「不碰语料」从口头承诺变成会变红的测试 |
| `audit-log.test.ts` | `erasePersonAudit`：索引行、日志文件（文件名含 safeSender）、内存数组三处同时清 |
| `message-log.test.ts` | `erasePersonLog` 同样三处一致 |
| `conversation-binding-store.test.ts` | `forget` 只删指定 sessionId，`externalChats` 其余保留并落盘 |
| `channel-context.test.ts` | `forgetSessionIndex` 只清该 senderId 的条目 |
| `memory-deletion.test.ts` | **新增**：① `PERSON_ERASABLE` 与 `MEMORY_PRESERVED` 的路径互斥（照抄 corpus 那条互斥测试的写法）；② `deleteAllMemory` 现在会删 `memory.backup.*.json` 与 `memory-reconcile-backups/`（回归 + 新能力）；③ `listMemoryBackupTargets` 在无备份时返回空数组不报错 |
| `memory-store-io.test.ts`（若无则并入上一条） | `backupMemoryFile` 产出的文件名能被 `listMemoryBackupTargets` 的 glob 命中（**锁住两处模式串一致**，防止将来改命名规则后擦除漏掉备份） |
| `chat-api-utils.test.ts` | `eraseApiLog` 删文件并返回字节数；文件不存在时 `deleted: false` 不抛错 |
| `build-options.test.ts` | `recordRelationshipTurn` 收到的 `personKey` == `TurnAttribution.personKey` |
| `obsidian-exporter.test.ts` | 擦除后 `syncToBoundVault()` 会把孤儿 `.md` 删掉（复用既有 manifest 用例的形态） |

### 4.5 新增 `src/main/memory/person-erasure.integration.test.ts`（端到端，不依赖真实 QQ）

临时目录铺真实文件：`memory.json`（含 L2/evidence/l2DmaeStates/conflictLogs/reflectionLogs）+ `channels/history/*.jsonl` + `channels/archive/**` + **`group-corpus/**`（只为断言"没被碰"）** + `channels/audit/**` + `channels/log.jsonl` + `entity-graph.json` + `relationship-log.json` + `context-bindings.json` + **`memory.backup.<ts>.json`** + **`memory-reconcile-backups/**`** + **`chat-api.log`**。

桩：`memoryStore`（真 store，指向临时目录）+ 向量库（`deleteUserMemoryVectors` spy）+ LLM 队列（直通）。

| # | 用例 | 断言 |
|---|---|---|
| 1 | 全链路擦除 | §0.2 B 的每一条逐项断言 |
| 2 | 别人完好 | 同群另一个 `speakerId` 的行、L2、关系条目、实体节点**逐字节不变**；其中**必须包含一条"B 提到他"的 L2（K 类）**，断言它 `content` / `subjectIds` / `status` / `ragId` **全字段不变**、向量未被删 |
| 2b | **语料零改动（本阶段最该被守住的一条）** | 临时目录里的 `group-corpus/**` 三个文件（群 / 私聊 / 同号群）**逐字节不变、mtime 不变**；`erasePerson` 前后对整棵目录做哈希一致 |
| 2c | **K 类计数进入报告** | `plan.l2.keptSubjectOnly === 1`；`report` 里保留条数与执行后 store 里 `subjectIds ∋ P` 且 `speakerIds ∌ P` 的条数**完全相等**（"残留是已知且已声明"这条验收的自动化版本，§0.2 B） |
| 3 | 幂等 | 连续执行两次，第二次报告 `l2.total === 0` 且无错误 |
| 4 | 预演 ≠ 执行 | 预演后手动插入一条新命中 → 执行返回 `needsReconfirm: true` 且**什么都没删** |
| 5 | previewId 过期 | 伪造/过期 id → 拒绝执行 |
| 6 | 部分失败 | 注入某一步抛错 → 报告 `partial: true` 且 `failed` 里有该步；其余步骤已完成 |
| 7 | 去压缩 | 总结被删、幸存子条目 status 回 `active` 且向量重建被调用 |
| 8 | 无 Obsidian 绑定 | 步骤⑪ 跳过且不报错 |
| 9 | 审计 | `memory-trace.log` 有 `memory.personErase`，`details` 里**不含**任何被删正文 |
| 10 | **跨步骤数据流** | 造一条**无 `personKey` 的群域 relationship entry**，其 `userText` 与某个被删 transcript 行的正文一致 → 擦除后该 entry **被指纹匹配删掉**；而 `userText` 不同的另一条**留着**（锁住 §2.10 第 3 步 + ⑥→⑨ 的 D 传递） |

### 4.6 渲染侧

| 文件 | 用例 |
|---|---|
| 新增 `memory/manager.test.ts` | jsdom 注入 `#memory-panel` markup：三视图切换、列表渲染、勾选计数、`pruneManagerSelection`、详情开关 |
| 新增 `memory/erasure-flow.test.ts` | 确认短语严格相等；**取消预演弹窗不发起执行**；预演失败不进入确认；`needsReconfirm` 时回到预演；报告渲染不吞 `failed` |
| 新增 `memory-manager-markup.test.ts` | 16 个 id 都存在且都在 `#memory-panel` 段内；危险按钮默认 `disabled` 或无选中时为 disabled |
| `dom-refs-consistency.test.ts` | 既有，自动覆盖新加的 `dom.ts` 引用 |
| `settings-i18n-regression.test.ts` / 新增双份 key 校验 | `settings.panel.memory.manager.*` 在 zh-CN 与 en 都有非空值 |

### 4.7 回归关注点

1. **不做擦除时零行为变化**：本阶段的唯一生产调用点是新 IPC 与 `recordRelationshipTurn` 的一个可选字段 → 所有既有用例应逐字通过。
2. **`deleteL2` 保持原样**（压缩事务回滚仍用它），**新增** `deleteL2Cascade`。⚠️ 但要在 `deleteL2` 的注释里写明「**不要用它做用户删除**，用 `deleteL2Cascade`」，否则将来又漏级联。
3. **`MEMORY_PRESERVED` 不得改动**（`group-corpus/` 必须留在里面）。
4. **`deleteAllMemory` 不得被本阶段修改**（它是"清空记忆"，语义与"擦除某人"正交）。
5. **`history-log` 既有 50 个用例**（含 P1 的 id 用例）必须全绿 —— 新函数只增不改。
6. **`getAllL2()` 的引用语义**（§2.15）：新增代码不得长期持有旧数组。

---

## 5. 验收

### 5.1 命令

```powershell
npx vitest run
npx tsc -p tsconfig.main.json
npx tsc -p tsconfig.preload.json
npx vite build
```

> 注：本机 PowerShell 会拦截 `npx.ps1`，实际用 `node node_modules/vitest/vitest.mjs run` 或 `npm.cmd`。
> ⚠️ **`tsc` 不覆盖 `src/renderer`**（§0.4 约束 5）—— UI 侧的唯一防线是 §4.6 的 markup + jsdom 用例。

### 5.2 手工验证（真实 QQ + NapCat；**先备份 `channels/` 与 `memory.json`**）

> ⚠️ **这次备份尤其重要**：第 5 步会在**不重启**的前提下销毁 `memory.backup.*.json`、`memory-reconcile-backups/` 与 `chat-api.log`（§2.11）。手工验证前先把整个 `%APPDATA%\<app>` 复制一份，否则无法回退。

| # | 步骤 | 期望 |
|---|---|---|
| 1 | 账号 A(10001, 昵称"小明") 在群 G 里 @昔涟 说 3 件事；账号 B(10002) **说一句「小明最近在学 Rust」**再聊 1 件自己的事；凑够 6 轮 | `memory.json` 里出现 5 条带 `speakerIds`/`subjectIds` 的 L2；其中**至少有一条是 `speakerIds=["qq:10002"]` + `subjectIds=["qq:10001"]`**（B 转述 A —— 这是 K 类的真实样本） |
| 2 | **单条删除**：在控制台「按域」视图里删掉其中 1 条 | `l2` 少 1；`evidence` 少 1；`l2DmaeStates` 少 1；该条 `ragId` 在 `rag-data/memory-store.json` 里 0 命中 |
| 3 | **重启应用** | 该条**不再出现**（对账未复活） |
| 4 | **预演**：「按人」视图找到 `qq:10001` → 彻底擦除 → 看预演弹窗 | 分类计数与实际相符；列出 `knownNames`、涉及会话、transcript 行数、审计条数、**关系日志四档（byPersonKey / byScope / byTextFingerprint / unmatched）**、实体候选、备份/调试日志大小、残留清单。**弹窗里必须同时有两行**：①「将删除 N 条（他说的 / 他的私聊）」②「**保留 M 条：别人提到他**（附 3 条摘要）」；并有一行明确写「群聊语料未做任何改动」 |
| 5 | **确认并执行**（输入确认短语） | 无重启提示；报告显示各类完成计数、`partial: false` |
| 6 | **数据核对** | ⚠️ **不能再 grep `"qq:10001"` 等于 0**（`subjectIds` 会命中）。正确做法：① `speakerIds` 里 `"qq:10001"` **0 命中**；② grep 出的每一处 `"qq:10001"` 都落在**某条 `subjectIds`** 里，且与预演的第 ② 行清单**逐条对得上**；③ 群 G 的 `history/*.jsonl` 里 `"speakerId":"10001"` **0 行**、B 的行**一行不少**；④ `channels/audit/index.jsonl` 里 `"senderId":"10001"` 0 行；⑤ `memory.backup.*.json` 与 `memory-reconcile-backups/` **一个不剩**；⑥ `chat-api.log` **不存在**。<br>⚠️ **第 ② 条有一个例外：`memory-trace.log`** —— 它记的是**删除动作**（`l2.delete.batch` / `transcript.erase` / `runs.erase` …），带着 `personKey` 是预期行为；它是 §2.11 / Q3 明确保留的审计载体（只记计数与 id 类信息，不记被删正文）。此外 `channels/context-bindings.json.p0-backup` 与 `channels/tool-audit.jsonl` 两个开发期孤儿文件会在预演里**明确列为疑似残留**（有意不动）。<br>⚠️ 第 ③ 条是**时点断言**：擦除后他又开口说话，这条自然会有行 —— 复测时要按"擦除刚完成的那一刻"取值 |
| 6b | **语料完好核对（和上面同等重要）** | `group-corpus/` 整棵目录**逐字节不变**：先 `certutil -hashfile` 或记录文件数与大小，擦除后对比一致；**A 的语料行仍在**（因为取的是 `uid`／`msg` 原文，不会因擦除而消失） |
| 6c | **关系日志核对** | `relationship-log.json` 里 `personKey === "qq:10001"` 的条目 0 条；**存量**条目按预演的第 ③ 档（`byTextFingerprint`）数量减少；`unmatched` 档的条目仍在（那是无法定位的残留，报告里已声明） |
| 7 | **行为验收** | 在**没人转述过 A 的会话**里问「小明是谁」（例如 A 的私聊、或 A 刚说过话的群），昔涟反问「小明是谁呀？」。<br>⚠️ **两个已知的"不算失败"情形**：① 在**B 刚提过 A 的那个群**里问，她可能答「小红好像提过一个叫小明的」—— 那是 B 的记忆（K 类，按 §2.3 有意保留）；② 让 B 私聊问同一句 —— 同理 |
| 8 | **重置验收** | A 再说一句新的（例如「我最近在学画画」）→ 若干轮后 `memory.json` 里出现一条全新的、`subjectIds=["qq:10001"]` 的记忆（说明"重头再来"成立，不是拉黑） |

> ⚠️ **验证 6 的前置**：先确认没有别的进程正在写 `memory.json`（退出应用再核对最稳）。
> ⚠️ **验证 7 的方法学要点**：题面里**不能有"别人刚提过他"的上下文** —— 否则召回可能命中 K 类记忆（这是**设计允许**的），会把"反问"的预期弄脏。**先等 B 的那条记忆滑出上下文窗口**，或在 A 的私聊里问，结果最干净。
> 反过来说：`验证 7` 若在"B 刚提过他"的群里**没有**反问，**也不代表实现错了** —— 此时应改看 `验证 6` 的第 ② 条：那条记忆是不是 K 类？是则属预期。

### 5.3 通过标准

- §4 的全部新增用例 + 既有用例全绿；两个 tsconfig 0 错误；`vite build` 通过
- §5.2 手工验证 1–8 全部符合预期（含 **6b 语料完好**、**6 的第 ② 条"残留可对账"**、**6c 关系日志**）
- **回归**：不触发新 IPC 时，对话/注入/召回/压缩/对账行为与 P2 之后**逐字段一致**
- **不变量**：`MEMORY_PRESERVED` 四项不变；**`group-corpus/` 一个字节不变**（隔离测试 + 架构守卫测试都绿）；**K 类记忆一条不少**（§4.5 用例 2）；**关系日志的 `unmatched` 档一条不多不少**；`deleteAllMemory` 的 5 条用例仍绿

---

## 6. 风险与回滚

| 风险 | 评估 | 缓解 |
|---|---|---|
| **transcript 重写与并发 append 竞态 → 丢消息** | **高**（数据丢失不可逆） | §0.4 约束 4：纯同步重写 + §4.3 用例 12/13 显式锁住；**任何人不许在重写路径加 `await`**（代码注释里写明） |
| **误删别人的行/记忆** | **高** | 判据集中在 `person-erase-plan.ts` 一处（§3.2）+ §4.1 的 K 类三条防线（用例 6/7/7b）+ §4.5 用例 2 的"K 类逐字段不变"断言 |
| **K 类残留被模型当成"她认识他"** | **中**（**已接受的取舍**，非缺陷） | §2.3 三条理由 + §0.2 C 的验收措辞（按"来源"而非"名字"判定）+ 预演把 `keptSubjectOnly` 显式列给用户。**真正的补丁在 P3.5**：召回侧要做到"说话人 ≠ 提问者 → 不作为『我了解他』引用"（§7） |
| **文件名反推 sessionId 出错 → 处理了错的会话** | 中 | 权威名册优先（§2.4）；无法识别时**返回 null 不处理**并进预演警告 |
| **擦除流程误碰 `group-corpus/`（你最在意的资产）** | **中高** | 三重防线：① 语料**不在 `PERSON_ERASABLE`**（§0.5）；② 擦除链路**不读不写不删**，连路径字面量都不出现（§0.4 约束 2）；③ **两条会变红的测试** —— `group-corpus-isolation.test.ts` 新增"擦除后语料逐字节不变"+ 新增架构守卫扫源码断言零引用（§4.4） |
| **飞书私聊无法按 `chatId` 映射** | 中 | 只依赖 L2 归属（来源 A）；预演给出 warning「该渠道的私聊会话可能无法完整覆盖」 |
| **实体按名匹配误伤同名者** | 中 | 预演列出候选让用户确认；只在 `type === "person"` 且名字集合内匹配 |
| **关系日志存量指纹匹配误伤**（别人恰好说过同样开头的话） | 低 | 只比 24 字前缀、只在他发过言的域里比、被删行正文同源；预演把 `byTextFingerprint` 与 `unmatched` 分开列，用户可核对；`<24` 字的短条目**不参与**匹配 |
| **擦除中途失败留下半状态** | 中 | 不假装原子（§2.14）：报告 `partial` + `failed`；**幂等**，重跑即收敛 |
| **预演与执行之间长出新记忆** | 低 | previewId + 重算 + `needsReconfirm` 中止（§2.13） |
| **`previewId` 内存表泄漏** | 低 | TTL 10 分钟 + 只存 id 集合 |
| **全量扫描 transcript 在大规模下变慢** | 低（当前量级） | 同步单 tick 完成；代码注释写明"上万会话时要改成按渠道预筛" |
| **`deleteAllMemory` 的既有 5 条用例被破坏** | 中 | 本阶段会动 `MEMORY_TARGETS`（加一项目录）与删除循环（加 glob 展开）→ §4.4 已列回归用例；`group-corpus-isolation.test.ts` 的互斥断言必须重跑 |
| **备份文件让被删者复活** | **中高** | §0.4 约束 6 + §2.11：擦除时**整份销毁** `memory.backup.*.json` / `memory-reconcile-backups/`；`deleteAllMemory` 顺带修好同一漏洞 |
| **误删 `chat-api.log`（整份销毁）** | 低 | 它是纯调试产物、全仓无读取方；**但预演弹窗必须显式列出它的大小**，让用户知情（§2.13） |
| **UI 无类型检查导致静默失效** | 中 | §4.6 的 markup + jsdom 用例（`dom-refs-consistency` 只能保证 id 存在，保证不了行为） |

**回滚**：

- **代码层**：本阶段**不改任何存储格式的必填字段**（唯一新增持久化字段是 `relationship-log.entries[].personKey`，可选）。`git revert` 即可；旧代码读到 `personKey` 会当未知字段忽略。
- **数据层**：擦除**不可逆**（这是需求）。回滚代码不会让被删的数据回来 —— 所以 §5.2 第 1 步的**备份是必做动作**，不是建议。
- **配置层**：新增 6 条 IPC 不影响旧版本（旧 preload 不会调用）。

---

## 7. 为 P3.5 预留

| P3.5 需要 | P3 的产出 |
|---|---|
| 工具侧归属过滤（`user_memory` / `read_memory`） | `subjectIds` 的**语义与判据函数**在 P3 已经落地并测试（`person-erase-plan.ts` 的 K 类判定 + §4.1 用例 6/7/7b），P3.5 直接复用 |
| `ToolContext.speakerId` 通路 | P3 建立了「UI → IPC → 编排器 → store」的主进程调用范式，可照抄 |
| L2 底层注入接入 + DMAE 推进 | `l2DmaeManager.loadStates()` 在 P3 被正式用作失效入口（P3.5 会大量调用） |
| 召回硬过滤（隐私开关） | **P3 的 R1/R2/K 三分就是召回过滤的现成判据**：`speakerIds ∋ 提问者` → 可作"你的记忆"；`subjectIds ∋ 他但说话人不是他`（K 类）→ **只能作"某位群友提过"，不能作"我了解他"**。⚠️ **这正是 P3.5 的第一优先项** —— 因为按 §2.3 我们**有意留下了** K 类记忆，就必须在召回侧说清它是什么，否则"删完不认识"会被一条别人的转述打折 |

**P3 明确不做、留待 P3.5**：任何 `buildMemoryInjection` / `searchMemory` / `getL2ForScope` 的调用点改动。

---

## 8. 改动文件清单

### 8.1 必做（生产代码：新增 6 + 修改 19；测试：新增 9 + 修改 6；文档 2）

| # | 文件 | 类型 |
|---|---|---|
| 1 | `src/main/memory/memory-store.ts` | 改（`deleteL2Cascade` + 两个纯函数 + `deleteL2` 注释警告） |
| 2 | **`src/main/memory/person-erase-plan.ts`** | **新增**（纯函数：判据 + 名册 + 计划） |
| 3 | **`src/main/memory/person-erasure.ts`** | **新增**（编排：预演 + 执行 + previewId 表） |
| 4 | `src/main/memory/memory-deletion.ts` | 改（`PERSON_ERASABLE` + `MEMORY_BACKUP_GLOBS` + `listMemoryBackupTargets` + `eraseMemoryBackups` + `MEMORY_TARGETS` 加一项 + `deleteAllMemory` 展开 glob） |
| 5 | `src/main/channels/history-log.ts` | 改（4 个新同步导出） |
| 6 | **`src/main/channels/transcript-erasure.ts`** | **新增**（scan + erase） |
| 7 | `src/main/memory/entity-graph.ts` | 改（`removeEntities`） |
| 8 | `src/main/relationship/relationship-log.ts` | 改（`personKey` + `eraseByPersonKey` + `eraseByScope`） |
| 9 | `src/main/orchestrator/build-options.ts` | 改（传 `personKey` 给 `recordRelationshipTurn`） |
| 10 | `src/main/memory/recent-injected-memory.ts` | 改（`forgetMemoryInjections`） |
| 11 | `src/main/channels/audit-log.ts` | 改（`erasePersonAudit` + 抽出 `auditSenderSlug`） |
| 12 | `src/main/channels/message-log.ts` | 改（`erasePersonLog`） |
| 13 | `src/main/channels/conversation-binding-store.ts` | 改（`forget`） |
| 14 | `src/main/channels/channel-context.ts` | 改（`forgetSessionIndex`） |
| 15 | `src/main/chat-api-utils.ts` | 改（`eraseApiLog`） |
| 16 | `src/shared/ipc-channels.ts` | 改（6 条通道） |
| 17 | `src/main/memory/memory-user-ipc.ts` | 改（6 个 handler） |
| 18 | `src/preload/index.ts` | 改（6 个转发） |
| 19 | `src/renderer/settings/shared/types.ts` | 改（API + 3 个类型） |
| 20 | `src/renderer/settings/index.html` | 改（记忆管理卡片 + 16 个 id） |
| 21 | `src/renderer/settings/memory/dom.ts` | 改（16 个引用） |
| 22 | **`src/renderer/settings/memory/manager.ts`** | **新增**（三视图 + 列表/详情） |
| 23 | **`src/renderer/settings/memory/erasure-flow.ts`** | **新增**（预演 → 确认 → 执行 → 报告） |
| 24 | `src/renderer/settings/settings.ts` | 改（接线） |
| 25 | `src/renderer/settings/settings.css` | 改（`.memory-manager*`） |
| 26 | `src/renderer/settings/i18n/zh-CN.json` + `en.json` | 改（`…manager.*` 双份） |
| 27 | `docs/group-corpus.md` | 改（§8 补 T0 纪律：用哈希排除名单，**不删数据**） |
| 28 | `docs/construction/phase3-person-memory-overview.md` | 改（同步 §5 的"不动语料"决定） |
| 29+ | 测试 15 个文件（§4.1–§4.6） | 新增 9 + 修改 6（含 `entity-graph.test.ts` —— **当前不存在，本阶段首次建**；以及新增的 `memory-erasure-corpus-guard.test.ts`） |
| — | 🚫 **`src/main/corpus/group-corpus.ts`** | **不在清单里 —— 本阶段一行都不改**（§3.11） |

### 8.2 可选（不阻塞交付）

| # | 内容 | 说明 |
|---|---|---|
| O1 | 「导出即将删除的内容」按钮 | 用户指定路径导出 JSON（§2.13）；**默认不做** |
| O2 | 「按容器删除」的独立 IPC | 目前并入 `MEMORY_MANAGER_DELETE` 的 `container` 入参 |
| O3 | 多维筛选（时间/权重/状态） | 控制台二期 |
| O4 | 溯源面板的"跳到 transcript 文件" | 现在只展示行内容 |
| O5 | jieba 词表移除 API | 需要给 `retriever.ts` 的 `customWords` 加删除；收益低 |
| O6 | `history-log` 的 `reloadAllHistory` 文件名反推 bug（`:399`） | 与本阶段无关，顺手记录 |
| O7 | **`erasePersonCorpus(senderId)`** —— 若将来你**主动**想从语料里清除某个人的原文 | **本阶段明确不实现、不接入擦除流程**。真要做时必须：① 单独立项、② 独立的入口与二次确认、③ **只按行内 `kind`/`gid`/`uid` 过滤（不信目录名，§2.11）**、④ 绝不进 `MEMORY_TARGETS`。**推荐优先级最低** —— 语料只写不读，几乎不可能成为隐私风险，而它是你的资产 |
| O8 | **擦除对话框里的「同时删除别人提到他的记忆」勾选项**（默认**不勾**） | §2.3 的**被否决替代方案**。只有当你实际观察到"听说过名字"造成困扰时才做。做的时候必须：① 默认关闭、② 文案写明「⚠️ 会连带删掉别人的经历片段」、③ 预演报告里单独计数组。**P3 不实现** |

### 8.3 §5.2 手工验证轮新增/修改的文件（对应 §9.3b 的 13–16）

| # | 文件 | 类型 |
|---|---|---|
| 30 | `src/main/runtime-policy/timeout-policy.ts` | 改（`memory-llm` 30s → 120s） |
| 31 | `src/main/runtime-policy/timeout-policy.test.ts` | 改（两处断言同步） |
| 32 | `src/main/runtime-policy/token-budget.ts` | 改（`memory-judge` 800 → 32768） |
| 33 | `src/main/runtime-policy/token-budget.test.ts` | 改（断言同步） |
| 34 | `src/main/memory/memory-judge.ts` | 改（`MemoryJudgeOptions.l2Only` + 非 root 域提示词段） |
| 35 | `src/main/memory/memory-judge.test.ts` | 改（+2 用例） |
| 36 | `src/main/memory/memory-scheduler.ts` | 改（算 `l2Only` 并下传） |
| 37 | `src/main/memory/memory-scheduler.test.ts` | 改（+2 用例） |
| 38 | **`src/main/memory/memory-console.ts`** | 改（**D1 修复**：cascade 之后删向量 + `vectors` 计数 + `deleteVectors` 注入位） |
| 39 | `src/main/memory/memory-console.test.ts` | 改（+4 用例：删向量、不调、空入参、失败容错） |
| 40 | `src/main/memory/memory-user-ipc.test.ts` | 改（断言补 `vectors`） |
| 41 | `src/renderer/settings/shared/types.ts` | 改（`MemoryManagerDeleteResult.vectors`） |
| 42 | `src/renderer/settings/memory/manager.ts` | 改（完成提示带向量条数） |
| 43 | `src/renderer/settings/memory/manager.test.ts` | 改（+1 断言） |
| 44 | `src/renderer/settings/memory/erasure-flow.test.ts` | 改（桩补 `vectors`） |
| 45 | `src/renderer/settings/i18n/zh-CN.json` + `en.json` | 改（`deleteDone` 双份加 `{{vectors}}`） |

---

## 9. 施工记录

> **施工进度**：§3 的 A–E 全部落地；§4 的用例全部写完；四个门禁全绿（数字见 §9.2）。
> **§5.2 的手工验证（真实 QQ + NapCat）未做** —— 本轮交付的是代码 + 自动化验收，见 §9.4。

### 9.1 逐条落地情况

| §3 条目 | 落地 | 说明 |
|---|---|---|
| 3.1 `memory-store.deleteL2Cascade` | ✅ | 另抽出**纯函数** `planL2Cascade(store, ids)` + `previewL2Cascade(ids)` / `collectSummaryDependents` / `countReflectionLogsByFingerprint`。分类逻辑只有一份，预演与执行共用（见 §9.3 偏离 1）。`deleteL2` 已加"不要用它做用户删除"的注释 |
| 3.2 `person-erase-plan.ts` | ✅ | 判据只在这一处；`computeEraseHits` 的返回值里仍然**没有任何按 `subjectIds` 命中的项** |
| 3.3 `person-erasure.ts` | ✅ | 12 步编排 + 逐条 try/catch + `previewId`（TTL 10min）+ `needsReconfirm` 中止；依赖注入覆盖每一步 |
| 3.4 `history-log` 4 个同步原语 | ✅ | 另加 `pruneEmptyArchiveDirs()`、`transcriptFileBase()`（避免 `safeName` 规则两处漂移）；**零 `await`** |
| 3.5 `transcript-erasure.ts` | ✅ | 另加 `speakerNames`（`knownNames` 的第二个来源）与 `removedUserTexts`（预演也要用同一套 D 集合） |
| 3.6 `entity-graph.removeEntities` | ✅ | 命中为空不落盘 |
| 3.7 `relationship-log` | ✅ | `personKey` + `eraseByPersonKey` / `eraseByScope` / `eraseByUserTextFingerprint`；指纹判据抽成两个**纯函数**导出，预演与执行共用 |
| 3.8 `build-options` 传 `personKey` | ✅ | 实际变量名是 `finishedContext` 不是 `TurnAttribution`（见 §9.3 偏离 2） |
| 3.9 `forgetMemoryInjections` | ✅ | 按 l2Id |
| 3.10 `l2DmaeManager.loadStates()` | ✅ | 未新增 API，直接复用；注释写明这是官方失效姿势 |
| 3.11 `group-corpus.ts` 一行不改 | ✅ | 生产文件零改动；新增 `memory-erasure-corpus-guard.test.ts` 把"不碰语料"变成会变红的测试（§9.3 偏离 6） |
| 3.12 `audit-log` / `message-log` | ✅ | `erasePersonAudit` / `erasePersonLog`，另加只读计数器 `countPersonAudit` / `countPersonLog`（预演与执行共用同一个 slug 助手，数字不可能漂移） |
| 3.12b `memory-deletion` / `chat-api-utils` | ✅ | `PERSON_ERASABLE`（12 条）+ `MEMORY_BACKUP_GLOBS` + `listMemoryBackupTargets` + `eraseMemoryBackups` + `MEMORY_TARGETS` 加 `memory-reconcile-backups/` + `deleteAllMemory` 展开 glob；`eraseApiLog` 在 `chat-api-utils` |
| 3.13 `conversation-binding-store.forget` | ✅ | 只删给定 sessionId；调用方只传私聊会话 |
| 3.14 `forgetSessionIndex` | ✅ | — |
| 3.15 Obsidian 复用导出同步 | ✅ | 第 ⑪ 步：未绑定 vault 时整个跳过；绑定后走 `syncToBoundVault()` 的 manifest 反删 |
| 3.16 六条 IPC | ✅ | `ipc-channels` + `memory-user-ipc`（6 个 handler）+ `preload`（6 个转发）。**不进 `restartRequired`** |
| 3.17–3.21 UI 五件 | ✅ | `index.html` 卡片 + 17 个 id、`memory/dom.ts`、`manager.ts`、`erasure-flow.ts`、`settings.ts` 接线、`settings.css`、i18n 双份（116 个 key） |
| §8.1 清单第 27/28 项（文档） | ✅ 无需改动 | `docs/group-corpus.md` §9「T0 前置纪律」与总览 §5「不从语料里删任何东西」**在侦察阶段就已经写好**，本轮核对后未再改（见 §9.3 偏离 7） |

### 9.2 验收结果

| 项 | 基线（P2 之后） | 施工后 | 手工验证后（本轮） |
|---|---|---|---|
| `vitest run` | 487 文件 / 4433 passed / 1 skipped | 499 文件 / 4621 passed / 1 skipped（+12 文件 / +188 用例，零回归） | **499 文件 / 4629 passed / 1 skipped**（+8 用例：控制台删向量 4 + 调度层 `l2Only` 2 + judge 提示词 2） |
| `tsc -p tsconfig.main.json` | 0 错误 | 0 错误 | **0 错误** |
| `tsc -p tsconfig.preload.json` | 0 错误 | 0 错误 | **0 错误** |
| `vite build` | 通过 | 通过（`✓ built in 33.25s`） | **通过** |

> 注：本机 PowerShell 会拦截 `npx.ps1`，实际用 `node node_modules/vitest/vitest.mjs run` /
> `node node_modules/typescript/lib/tsc.js` / `node node_modules/vite/bin/vite.js build`。

新增/修改的测试文件：

| 文件 | 用例 | 覆盖 |
|---|---|---|
| `src/main/memory/person-erase-plan.test.ts`（新） | 14 | §4.1 全部（含 K 类三条防线 6/7/7b、纯函数性、跨渠道、总结分类） |
| `src/main/channels/transcript-erasure.test.ts`（新） | 15 | §4.3 全部（含**同步性回归 12**、**过滤与 append 交错 13**、坏行不丢、私聊整会话、归档空目录） |
| `src/main/memory/person-erasure.integration.test.ts`（新） | 15 | §4.5 全部 + 语料逐字节不变 + 预演只读 + 报告字段 |
| `src/main/memory/memory-console.test.ts`（新） | 11 | 三视图分组、`own`/`mentioned` 分离、容器删除解析、溯源 |
| `src/main/memory/memory-user-ipc.test.ts`（新） | 7 | **IPC 接线冒烟**：模块可加载 + 6 条通道注册 + 参数解析与拒绝路径（`tsc` 看不出的启动期崩溃） |
| `src/main/memory/memory-erasure-corpus-guard.test.ts`（新） | 6 | **架构守卫**：P3 的 18 个生产文件零 import / 零 `"group-corpus"` 字面量；清单互斥；擦除链路不提 `deleteAllMemory`/`MEMORY_TARGETS` |
| `src/main/memory/memory-store.test.ts`（改） | +10 | §4.2 级联矩阵（含"预演与执行数字同源"） |
| `src/main/memory/memory-rag-reconciliation.test.ts`（改） | +1 | 孤儿向量被回收、**不被复活** |
| `src/main/corpus/group-corpus-isolation.test.ts`（改） | +1 | 跑完 `erasePerson` 后语料逐字节 + mtime 不变 |
| `src/main/memory/entity-graph.test.ts`（新） | 9 | `removeEntities` |
| `src/main/relationship/relationship-log.test.ts`（改） | +8 | `personKey` 落盘 + 三个 `eraseBy*` + 两个纯函数与 store 一致 |
| `src/main/memory/recent-injected-memory.test.ts`（改） | +3 | `forgetMemoryInjections` |
| `src/main/channels/audit-log.test.ts` / `message-log.test.ts`（改/新） | 13 / 8 | `erasePersonAudit` / `erasePersonLog` + 计数器与执行数字一致 |
| `src/main/channels/conversation-binding-store.test.ts`（改） | +3 | `forget` 只删指定 sessionId |
| `src/main/channels/channel-context.test.ts`（改） | +2 | `forgetSessionIndex` |
| `src/main/chat-api-utils.test.ts`（新） | 6 | `eraseApiLog` |
| `src/main/memory/memory-deletion.test.ts`（改） | +9 | §4.4：备份也被删、`PERSON_ERASABLE` 互斥、glob 与写出名一致 |
| `src/main/orchestrator/build-options.test.ts`（改） | +1 | `recordRelationshipTurn` 收到 `personKey` |
| 渲染侧 `memory/manager.test.ts` / `memory/erasure-flow.test.ts` / `memory-manager-markup.test.ts`（新） | 21 / 21 / 12 | 三视图与勾选、确认短语严格相等、预演失败/取消不执行、`needsReconfirm` 回环、17 个 id 全在 `#memory-panel` 内、危险按钮默认 disabled |

### 9.3 与原方案的偏离（施工中发现的）

1. **【§3.1】级联删除的分类逻辑抽成了纯函数 `planL2Cascade`，并新增 `previewL2Cascade`。**
   原方案里预演的 `vectors / evidence / dmaeStates / conflictLogs / reflectionLogs` 计数要在 `person-erasure.ts` 里再算一遍 —— 那就是**第二份级联分类逻辑**，迟早与 `deleteL2Cascade` 漂移，而 §2.13 的"执行时按同一判据重算"正建立在"只有一份判据"上。现在 `deleteL2Cascade` 先调 `planL2Cascade` 拿分类、再逐行应用，预演直接调 `previewL2Cascade`。
   → 新增用例："previewL2Cascade 与 deleteL2Cascade 报告同一组数字（预演 ≠ 假数据）"。

2. **【§3.8】`build-options` 的实参名不是 `attribution.personKey`，而是 `finishedContext?.personKey`。**
   该调用点作用域里没有 `TurnAttribution` 变量；`finishedContext` 的形状是 `{runId, source, mode, personKey, speakerName, userMessageId, chatType}`，`personKey` 就是 P2 送到这一层的那个值。只改了那一处实参，`recordRelationshipTurn` 的形参类型无需改动（`RelationshipTurnInput` 已带可选字段）。

3. **【§2.5 / §3.5】`filterTranscriptFile` 不做 legacy 正文前缀反推。**
   按 §2.5 约束 2（"写入侧不复制那套启发式"）与 §4.3 用例 3（"`speakerId` 缺失的行保留"）执行：只按结构化字段判定，legacy 行原样留下。代价已知且可接受 —— 磁盘判据（§0.2 B 的 `speakerId === "10001"` 0 行）成立；那些行只有在被重新读进 prompt 窗口时才会由 `normalizeEntry` 反推出说话人，而它们是短窗口里的旧数据。
   **同时修正了原方案的一处低估**：归档层某个 `YYYY-MM.jsonl` 被整月清空时**删掉这个空文件**（热层仍保留空文件，以维持 `loadRecentHistory` 的 `existsSync` 早退行为）—— 否则"归档目录变空即删目录"这条永远不会触发（§4.3 用例 4/6 锁住）。

4. **【§2.14 ⑥】扫描（`scanPersonTranscripts`）需要 `privateSessions` 入参，且必须在算 `privateSessions` 之后执行。**
   私聊行没有 `speakerId`（总览 §4.3），如果扫描不知道哪些会话是"整会话删"，就既数不出"会被删掉多少行"，也取不到"将被删掉的正文" —— **预演报告会严重低估私聊部分**（原方案 §2.14 的顺序注释把这件事写反了：私聊会话集合只依赖名册的 `chatType/chatId`，不依赖扫描结果，所以可以也应该先算）。

5. **⚠️【§2.6】去压缩的"重建向量"改成了"仅在向量缺失时重建"。**
   实测 `commitMemoryCompression` 只对子条目调 `archiveSources()`（把 `status` 置 `archived`），**并不删它们的向量**；而 `JsonVectorStore.addUnique()` **不做 l2Id 去重**。所以按原方案的"先删后建"会有两个真实后果：
   - ① 向量库里留下**同一 `l2Id` 的重复行**（召回要求 `entry.metadata.l2Id` 与 `L2.ragId` 双向一致，重复行会变成孤儿）；
   - ② **平白删掉一条 K 类记忆的向量** —— 而 §4.5 用例 2 明确要求"别人提到他"的那条 `content / subjectIds / status / ragId` 全字段不变、**向量未被删**。
   现在的实现：`status` 确定性还原为 `active`（这一步是"回到压缩前状态"的全部必需）；向量**健康就原样复用**，缺失（`syncStatus !== "synced"` 或没有 `ragId`）才 `addVector + markSynced`。用例 7 用两个幸存子条目分别覆盖两条分支。

6. **新增了原方案没有的架构守卫测试 `memory-erasure-corpus-guard.test.ts`。**
   原方案只在 §4.4 里提了一句"新增架构守卫"。实际做法：硬编码 P3 的 **18 个生产文件**清单，逐个断言 ①不 import 语料模块、②不出现带引号的精确字面量 `"group-corpus"`；再加上 `PERSON_ERASABLE` / `MEMORY_TARGETS` / `MEMORY_BACKUP_GLOBS` 与语料路径互斥、`PERSON_ERASABLE` ∩ `MEMORY_PRESERVED` = ∅、以及**擦除链路源码里不许出现 `deleteAllMemory` / `MEMORY_TARGETS`**（把 §0.4 约束 1 也变成测试）。

7. **§8.1 的第 27/28 项（两份文档）实际未改动** —— `docs/group-corpus.md` §9「T0 前置纪律：语料里的『已被擦除的人』」与总览 §5「🚫 不从群聊语料 `group-corpus/` 里删任何东西」在 P3 侦察阶段**就已经落笔**，本轮逐条核对后确认与实现一致（含"哈希排除名单 + 采样期跳过、永不就地删行"的设计记录），因此无需再改。

8. **【§3.16】控制台的主进程数据层单独开了一个文件 `src/main/memory/memory-console.ts`。**
   文档只写了"在 `memory-user-ipc.ts` 里插 6 个 handler"，但三视图分组 / 容器解析 / 溯源有 300+ 行逻辑，塞进 IPC 注册函数会让那个文件失去"只做接线"的形态。
   ⚠️ **文件名不是 `memory-manager.ts`** —— 那个名字已被 PMRS 的 `memory-manager.ts`（L0/L1 写入与域过滤）占用，覆盖它会直接毁掉记忆写入链路。

9. **【§2.17】「来源未知（无归属记忆）」分组排除了「能被私聊会话兜底定位」的旧记忆。**
   否则同一条记忆会既出现在某人的「他的记忆」里、又出现在「来源未知」里（构造用例时实测撞到）。判据：无 `speakerIds`/`subjectIds` **且** 其 `sourceConversationId` 不在名册的任何私聊会话里。

10. **【§2.17 草图的 id 清单】** 文档正文列了 16 个 id、实际需要 **17 个**（三个视图按钮各一个 id）。以清单为准（UI 侧已按 17 个实现，markup 测试双向断言）。

11. **【§2.13】** `PersonEraseReport` 的字段名是 **`addedSincePreview`**（文档正文 §2.13 写作 `added: n`）；类型定义与 UI 都按 `addedSincePreview` 实现。

12. **【§4.6】UI 侧的两处防呆强化**（超出文档要求）：`needsReconfirm` 回环加了 3 轮上限（防止主进程一直返回该状态时界面无限循环）；详情区只保留**一个**删除按钮（两组仍分开勾选、分开计数），勾到「别人提到他」时先弹"会连带动到某人的记录"的警告。

#### 9.3b §5.2 手工验证过程中改的四件事（13–16）

> 13–15 是**为了让判定链路在真实端点下跑得通**而改的，16 是**手工验证抓到的 P3 自身缺陷**。
> 前三条都不改变 P3 的删除/擦除语义，但都改了生产代码，因此逐条登记。

13. **【`runtime-policy/timeout-policy.ts`】`memory-llm` 阶段的超时 30s → 120s。**
    这个阶段是**非流式**调用、prompt 又长（judge 的 system prompt 4.2k 字符 + JSON schema 说明），实测用户当时的端点单次要 **49s**：30s 让 judge **每一次都必然超时**，而 judge 每 6 轮才跑一次 —— 失败一次等于那 6 轮的对话全部不落记忆。结构化输出的 repair 还要再来一次，所以预算必须容得下"两次慢调用"。
    → 同步改了 `timeout-policy.test.ts` 的两处断言（30_000 → 120_000）。

14. **【`runtime-policy/token-budget.ts`】`memory-judge` 的 `maxOutputTokens` 800 → 32768。**
    judge 的每条候选都要写全 `summary` / `slug` / `sourceQuote`（软上限 500 字）/ `content` / `contextSummary` / `evidenceQuotes` / `reason`，实测**一条候选 ≈1000 字符 ≈700 token**。只要一批里出现 2 个以上话题，800 就会把 JSON 从中间切断 → 校验失败 → repair 再切一次 → `REPAIR_EXHAUSTED`，**这一批对话的记忆全部丢失**（实测：`finish_reason=length`）。
    而"一批里几个话题"完全取决于群友说了什么，不是可以假设的量 —— 与其猜一个够用的数字，不如设成端点允许的上限，让截断从根上不可能发生（`max_tokens` 只是上限，不会让模型多说话，也不按上限计费）。
    → 同步改了 `token-budget.test.ts` 的断言。

15. **【`memory-judge.ts` + `memory-scheduler.ts`】非 root 域在**提示词**里就只允许输出 L2。**
    `memory-manager.writeMemory` 本来就有一道 `!isOwnerScope(scope) → 丢弃 L0/L1`，但 LLM 不知道，会把输出预算浪费在注定被丢弃的候选上（实测：4 轮群聊 → 产出 2 条 L1 → 全被丢弃 → `l2` 一条都没有，而真正的 L2 连生成机会都没有）。
    现在 `memory-scheduler` 用 `scopeId !== rootScope()` 算出 `l2Only` 下传给 judge，judge 在提示词里明确"只能输出 L2、禁止 L0/L1、把发言人当成具体的人而不是「用户」"。
    ⚠️ **判据只有一处**：调度层算一次，与 `writeMemory` 里那道丢弃规则同源（都是"域是不是 root"）。
    → 新增用例：`memory-scheduler.test.ts` 两条（非 root → `{l2Only:true}`、root → `{l2Only:false}`）；`memory-judge.test.ts` 两条（`l2Only` 时提示词含禁止段、默认不含）。

16. **⚠️【手工验证抓到并修复 · D1】控制台删除漏了「删向量」这一刀。**
    现象（§5.2 第 2 步实测）：按域视图删掉一条记忆后，`l2` / `evidence` / `l2DmaeStates` 三处都正确级联，但 `rag-data/memory-store.json` **一条没少**、被删条目的 `ragId` 仍命中 1 次。
    根因：`deleteL2Cascade` 的契约是**有意不删向量**（store 是对账的事实源，顺序必须"先 store 后 vector"，§1.2），调用方要自己拿 `removed[].ragId` 去 `deleteUserMemoryVectors`。`person-erasure.ts:849` / `memory-compressor.ts:147` / `obsidian-importer.ts:176` 都接了这一步，**只有 `memory-console.deleteMemoryManager` 没接**。
    影响：被删记忆的向量会一直留在向量库里，语义召回仍能命中一条**已经不存在的**记忆；要等下次启动对账才被当孤儿回收（§1.2 自己写明了这个窗口）。
    修复：`deleteMemoryManager` 在 cascade 之后按 `removed[].ragId`（与 `person-erasure` 同一取法）调 `deleteUserMemoryVectors`；`MemoryManagerDeleteResult` 新增 `vectors` 字段，删除完成提示与 i18n 双份同步；删向量失败**不致命**（启动对账兜底），只告警不吞掉 store 侧已完成的删除。
    → 新增用例：`memory-console.test.ts` 四条（删向量被调用且入参正确 / 无 ragId 时不调 / 空入参时不调 / 删向量抛错不影响 store 侧结果）；
    → 渲染侧 `manager.test.ts` 增加"完成提示里带向量条数"断言。
    为什么以前没被发现：它**不影响最终数据一致性**（对账会兜底），差别只在"下次启动之前那段窗口里召回还能命中已删记忆"—— 只有按 `§5.2 第 2 步`那样**删完立刻去看向量文件**才会暴露。

#### 9.3c 第 4–6c 步手工验证抓到的问题（D2/D5 已修，见 §9.3d；D3/D4 仍待办）

> D1 是"边验边修"；这一节先"取完证再修"——**D2 与 D5 已在 §9.3d 落地并复测**，D3 / D4 与两条观察仍待办。
> 逐条登记是为了让"P3 交付物还差什么"可被独立复核。

17. **⚠️【D2 · 功能级】`chat_history` 向量不在擦除链路里，而且不会自愈。**
    现象（§5.2 第 5 步后实测）：向量库 19 → 14，消失的**全是** `user_memory_`；`chat_history_` **12 条一条没动**，其中 **8 条与他有关**（他说的 4 条原文、游戏专属号转述他 1 条、昔涟回复里点名他的 3 条），全部挂在 `scope=solo:channel:qq:20b39082aa808213`。
    根因：`rag-data/memory-store.json` **明写在 `PERSON_ERASABLE` 里**，但 `person-erasure.ts` 只把 L2 cascade 的 `removedRagIds` 交给 `deleteUserMemoryVectors`，全仓**没有任何 `chat_history` 字面量**；更要紧的是 `reconcileUserMemoryIndex`（`default-dependencies.ts:157`）取的是 `getEntriesBySource("user_memory")` —— **启动对账的视野里根本没有 `chat_history`**，所以它不像 D1 那样有兜底。
    影响：`rag/index.ts` 的 `searchChatHistory(query, scopeId)` 按 `entry.metadata.scope` 过滤后即可召回这些条目 —— **"彻底擦除"之后，昔涟仍能通过历史语义召回拿到他已经删掉的经历**。§5.2 第 6② 条的 grep 用 `"qq:2914636187"`（带渠道前缀）做判据，而向量条目正文里是**裸** `2914636187`，所以这条清单**结构上抓不到它**。
    **修复口径（用户已定）**：删「他说的 + 昔涟回复里点名他的」，**保留**别人转述他的（与 K 类口径一致）。落地位置应在 `person-erasure` 的 ④ 向量步骤（或新增 ④b），判据要与 `computeEraseHits` 的 K 类口径同源，不能各写一套。
    **复现证据**：`E:\AI_Chating\p3-verify\checks.mjs` 的 **6d** 断言（修好前 `chat_history` 命中 4 条带裸 senderId 的条目，修好后应为 0）。

18. **【D3 · 低危】预演与报告的「备份」计数口径不一致：4 vs 3。**
    预演用 `probeBackups()`（`person-erasure.ts:474`）**递归数文件** → `memory.backup.*.json` ×2 + 对账目录里的 ×2 = **4**；
    报告用 `eraseMemoryBackups().files.length`（`memory-deletion.ts:182`）**数目标** → 2 个文件 + **1 个目录** = **3**。
    字节数两边一致（635142 B），实际也**确实删干净了**（实测 0 个备份、目录不存在），所以纯属口径问题；但用户看到「4 → 3」会合理怀疑漏删一个。
    → 修法二选一：报告侧也递归数文件，或预演侧改成报"目标数"并写明含目录。**别再让用户自己猜。**

19. **【D4 · 规格级】`cyrene-runs/` 既不在 `PERSON_ERASABLE` 也不在 `MEMORY_PRESERVED` —— 边界未定义，而它存着他的对话正文。**
    实测（擦除后）：`cyrene-runs/sessions/*.json` 里仍是 `messages: [{role:"user",content:"[小明]: 我还养了只鹦鹉"}, {role:"assistant",content:"…下个月一起搬去杭州…"} …]`，**逐字正文**；共 ~90 个 run 文件命中裸 senderId，另有 `cyrene-runs/reviews/**`、`cyrene-runs/tool-results/**` 命中。
    §0.4 的原则是"清单即边界"（两个数组就是全部边界），但 `cyrene-runs/` 与 `memory-trace.log` 落在两个数组之外 —— 实测行为是"保留"，但**这不是被决定的，而是没被决定的**。
    → 需要一次显式决策：把 run 存储按人过滤（`conversationId` / `messages[].content` 里的 `[别名]:` 前缀），还是明确写进 `MEMORY_PRESERVED` 并在文案里告知。

20. **【O2/O3 · 观察，非缺陷】文案与现实的落差。**
    - 预演弹窗开头写的是「彻底擦除…的**全部痕迹**」，而 `MEMORY_PRESERVED` 有意保留 4 类东西：群聊语料、`cyrene-chats/`（桌面会话）、`channels-settings.json`（工具白名单条目）、`zones.json`（区块成员）。这四类**在弹窗里一个字都没提**。
    - 实体图谱只按 `type === "person"` + 名字精确匹配删节点，所以**由他的记忆派生的地点节点留了下来**（实测残留 `杭州`、`成都`，而 `relations` 已空）。
    → 两条都属"措辞与边界"问题：要么补进残留清单，要么把「全部痕迹」改成可被证据支撑的措辞。

21. **⚠️【D5 · 功能级，本轮最重要】transcript 里 `role="assistant"` 的行不在擦除范围内 —— 而它们**逐字复述**了被擦者的信息，并且**每一轮都会进上下文**。**
    现象（§5.2 第 7 步加测，擦除后 7 分钟）：在群里问「小明最近在学什么呀」，昔涟答「**你最近不是正在认真学做菜嘛！当时还说以后去杭州开小灶呢**」—— 这两件事**都已经随擦除删掉了**（`l2` 里没有、他的 transcript 行 0 行、`chat_history` 向量里也没有"做菜"）。
    **证据链（`cyrene-runs/sessions/run-1790345147627-o5sb5o.json`，那次调用的完整 messages）**：prompt 的 `messages[0..15]` 里有 **8 条 `role=assistant` 的行**在复述他的事实，其中最直接的一条就是 `[10] assistant: 学做菜好呀！以后搬去杭州就能自己开小灶啦♪`，与她的最终回答 `[18]` **逐字同源**。
    根因：`transcript-erasure` 的逐行判据是 `speakerId === senderId`；**assistant 行没有 `speakerId`**，所以一条都不动。§5.2 第 6③ 条的断言是「`"speakerId":"<被擦者>"` 0 行 + B 的行一行不少」—— **结构上抓不到 assistant 行**；§2.3 的 K 类逻辑只覆盖「**别人**提到他」（B 的 user 行），从没覆盖「**她自己**复述他」。
    影响：**这是比 D2 更直接的通道** —— `chat_history` 向量要靠语义召回撞上，而 assistant 行就在普通上下文窗口里，**每问一次就重新喂一次**。"完全不认识、重头再来"（§5.2 第 7 步的验收措辞）在这个群里因此**并不成立**。
    对比：（私聊主测**通过** —— 她的私聊域里没有任何历史，她只把"小明"当成数学题里的通用人名，并反问"是想说哪一个他"。**群里的加测不通过**，且归因清楚，不是 K 类）
    **修复口径（待用户拍板）**：三选一 —— ① 按"内容里含被擦者的任一别名"逐行删 assistant 行（会连带删掉大段正常对话上下文）；② 只删"整段都在讲他"的行（需要一条明确的判据）；③ 承认并写进措辞与文档（"她的历史回复会保留他提过的信息"）。**只在 D2 上做功夫不够** —— assistant 行不清，群里的行为验收注定不通过。

#### 9.3d D5 + D2 的修复（21–22，**已落地**）

> 用户口径：**D5** —— "凡内容里提到他就删那一行"；**D2** —— "删他说的 + 昔涟回复里点名他的、保留别人转述他的"。
> 门禁：`vitest` **499 文件 / 4642 通过 / 1 跳过，exit 0**（基线 4629，**+13 条全是本轮新用例**）· `tsc` main/preload 各 **0 错误** · `vite build` ✓ 35.15s。

21. **【D5 · 已修】她复述他 / 回复他的 `assistant` 行，现在跟着一起删。**
    - **判据（两条，都在 `transcript-erasure.ts`，预演与执行同源）**：
      ① **按名字**：正文含他的任一别名（`assistantMentionsPerson`）；
      ② **按轮次配对**：这一行的上一行就是他的行（`isReplyToPerson`）。
      ⚠️ **② 是必须的，不能只做①** —— 实测泄漏的那一行是 `学做菜好呀！以后搬去杭州就能自己开小灶啦♪`，**一个字都没提他**，只按名字匹配它活得好好的，而它正是她后来照答"他在学做菜"的来源。
      ⚠️ **两条都限定在"他真正说过话的会话里"**（`heSpoke`）—— 否则"他从未出现过的群"里别人叫同一个名字时会被误删（有用例 15 锁住）。
      ⚠️ **别人转述他的 `user` 行仍然保留**（K 类，用例 17 锁住）。
    - **这也反转了 §2.5 约束 1**（原决策是"不删昔涟自己的回复，接受残留"，见 §0.2 排除表第 3 条）。反转理由写进了文件头：那条"接受"让 §5.2 第 7 步的"完全不认识"在群里根本不成立。
    - 支撑改动：`filterTranscriptFile` 的 `keep` 回调新增第二个入参**上一行**（`history-log.ts`）—— 配对判据需要知道"她在回谁"；坏行与未知 speakerId 的行为不变。
    - 计数：`assistantLines` 单独出（预演 per-session + 执行报告 + trace），并**同时计入 `hotLines`/`archiveLines`**（它确实是从 transcript 里删掉的行）——否则预演比执行小，§2.13 的"同源"就破了。
    - → 新增用例 5 条（`transcript-erasure.test.ts` 14–18）：他说过话→删（含"正文没提他"的那一行）/ 他没说过话→一个都不动 / 不给名字→保持旧行为 / K 类不误伤 / **预演与执行数字相等**。

22. **【D2 · 已修】`chat_history` 向量也进擦除链路。**
    - **判据（`person-erase-plan.selectChatHistoryVectorIds`，纯函数，预演与执行共用）**：
      ① `role=user` 且正文含他的裸 `senderId` → 删（他说的）；
      ② `role=assistant` 且**轮次配对**命中他的某个 turn（同 `sessionId` + 同 `ts`）→ 删（她对他说的，**同样与正文是否提他无关**）；
      ③ `role=assistant` 且落在他的域里、正文含他的别名 → 删；
      ④ 其余一律不删 —— **K 类（别人转述他的 user 条目）与别的域的条目一条不动**。
    - **轮次配对的依据是实测**：`indexConversationTurn` 给同一 turn 的 user / assistant 两条**写入同一个 `ts` + 同一个 `sessionId`**（在真实 `memory-store.json` 的 12 条上逐条确认过）。
    - 支撑改动：`rag.deleteChatHistoryVectors(ids)`（`deleteEntriesByIds(ids, "chat_history")`）—— **不能复用 `deleteUserMemoryVectors`**，后者把 source 写死成 `user_memory`，拿 chat_history 的 id 去调一条都删不掉；`person-erasure` 新增 ④b 步 + 两个注入点（`getChatHistoryVectors` / `deleteChatVectors`）。
    - UI：预演与报告都新增"**对话向量**"这一格（原来只显示 `user_memory` 的条数，用户根本看不见这条通道）。
    - → 新增用例 7 条：`person-erase-plan.test.ts` 5 条（他说的/轮次配对/点名/不越界/别名集合为空）、`person-erasure.integration.test.ts` 2 条（端到端删对了 id 且**没污染 `user_memory` 通道** / RAG 不可用时该步失败但整次擦除不崩、其余步骤照常）、`erasure-flow.test.ts` 1 条（弹窗与报告里这两格必须可见）。

#### 9.3e D3 + D6 + D4 的修复（23–25，**已落地**）

> 用户口径：**D3/D6** 都是"预演与报告口径不一致"，修正方向统一为**让报告与预演说同一句话**；
> **D4** 取"**按会话过滤 `cyrene-runs/sessions/`**，`reviews/` 与 `tool-results/` 不删但进疑似残留清单"。
> 门禁：`vitest` **500 文件 / 4653 通过 / 1 跳过，exit 0**（上轮 4646，**+7 条**）· `tsc` main/preload **0 错误** · `vite build` ✓ 33.11s。

23. **【D3 · 已修】备份计数改用"递归文件数"这一把尺子。**
    `eraseMemoryBackups` 新增 `fileCount`（递归数文件，与预演的 `probeBackups` 同口径），`person-erasure` 的报告改用它；
    trace 里同时记 `targets`（目标数）便于排查。→ 新增用例：目录里放**两个**文件时断言 `files`（目标）= 2、`fileCount` = 3；
    集成用例也改成"1 个备份文件 + 对账目录里 2 个文件"，预演与报告必须都是 **3**（修之前会是 3 vs 2）。

24. **【D6 · 已修】关系日志的「总结」格搬进 store，预演与执行共用一套判据。**
    预演原来在 `person-erasure` 里**手写循环**数四档，于是算不出 `summaries`；现在新增
    `RelationshipLogStore.previewErasePerson()` —— 在**内存副本**上按与三个 `eraseBy*` **相同的顺序**跑一遍
    （`eraseByPersonKey` → 逐个 `eraseByScope` → `eraseByUserTextFingerprint`），共用 `dropOrphanSummaries()`
    与 `matchesRemovedUserTextFingerprint()`，返回五格。预演仍然**不落盘**（用例断言文件条目/摘要一个不少）。
    `RelationshipStoreLike` 的注入面同步加了这个方法（测试桩少写一个就会编译不过）。
    → 新增用例：`relationship-log.test.ts` 一条"预演与三个 eraseBy* 的实际结果**逐格相等**"（含 summaries）；
    集成用例断言 `plan.relationshipEntries.summaries === report.relationship.summaries`。

25. **【D4 · 已修】`cyrene-runs/` 的边界一次定清。**
    - **新增 `cyrene-runs/sessions/` 到 `PERSON_ERASABLE`**（清单从 12 条变 **13 条**），判据是**按会话过滤**：
      `run.conversationId ∈ 他发过言的会话`（transcript 扫描出的会话 ∪ 他的私聊）。
    - **新增模块 `run-erasure.ts`**：`countRunsForConversations()`（**只读** `index.json`，预演用；绝不 initialize —— 那会写盘）
      + `eraseRunsForConversations()`（执行用，走 `HarnessRunStore.deleteConversation()`，一并清 session 文件、`.events.jsonl` 与 index 行；
      无事可做时**不碰 store**）。
    - **`reviews/` 与 `tool-results/` 写进 `MEMORY_PRESERVED`**，同时 `collectResidues` 新增第 ⑤ 类残留
      `runArtefacts`（扫这两棵目录里含他的 id 或别名的文件，上限 50 条）—— **不静默保留**。
    - 实测影响面：`sessions/` 95 个 run 里 **93 个**属于他的 4 个会话（群 `20b39…` 47 · 群 `9cdd…` 26 · 私聊 `afc0…` 19 · `2de1…` 1）。
    - **判据的入参集必须"结构性补全"（副本复测抓到的第二个缺口）**：最初只把 transcript 扫描出的会话喂进去，
      结果在副本上算出 `runs = 19`，而 index 里属于他会话的其实有 **93** 个 —— 因为**他的行可能已被上一次擦除抹掉**，
      扫描结果就空了。现在 `collectSpeakingSessionIds()` 把六个来源并起来：① transcript 扫描 ② 他的私聊
      ③ 他的 L2 记忆的 `sourceConversationId` ④ `solo:<sessionId>` 形态的域 ⑤ `chat_history` 向量里带他 senderId 的条目的
      `metadata.sessionId` ⑥ 关系日志里 `personKey` 是他的条目的域。**仍然只按 `conversationId` 过滤**，不做正文匹配。
      （这两个新读入口都包了 `safe*()` —— 读不到就当空，绝不让 RAG/关系日志的暂时不可用把整次擦除打挂，有用例锁。）
    - **"结构性指针也没了"的那种情况会被看见，而不是静默留下**：`RUN_RESIDUE_DIRS` 现在**包含 `sessions/`**，
      按会话过滤后仍幸存的 run 只要正文里带着他的 id/别名，就进「疑似残留」清单（副本上实测列出了一串
      `cyrene-runs/sessions/run-*.json`）。**首次擦除的现场（他的行还在）走的是删除路径**（集成用例锁定）。
    - → 新增用例 7 条：`run-erasure.test.ts` 5 条（只读计数 / 删对了且别人会话不动 / 幂等 / index 不存在 / index 坏掉）
      + 集成 2 条（端到端按会话删 + **只在向量里留过痕的会话也要被指认出来**）+ 渲染侧 1 条
      （弹窗与报告都列出"agent 运行记录 N 个"）；`memory-deletion.test.ts` 的清单断言同步为 13 条并锁进 `MEMORY_PRESERVED` 的两棵保留目录。

#### 9.3f O2 / O3 / O4 与 §6② 判据的收尾（26–28，**已落地**）

> 用户口径：一次做完。三条观察项里，O2 改文案、O3/O4 进残留清单（**只列不改**，与 L0/L1 同一处置），
> 外加**修正 §5.2 第 6② 条的判据**（把 `memory-trace.log` 明确写成例外）。
> 门禁：`vitest` **500 文件 / 4655 通过 / 1 跳过，exit 0** · `tsc` 0 错误 · `vite build` ✓。

26. **【O2 · 已修】弹窗文案不再超出证据。**
    - i18n `planLead` 从「彻底擦除…的**全部痕迹**」改成「擦除…的**对话与记忆痕迹**」；
      `confirmMessage`（zh/en）同样收敛，并写明"有意保留的部分已在预演里列出"。
    - 预演新增 **`preservedPaths`** 字段：由主进程把 `MEMORY_PRESERVED` 交给 UI（**UI 不硬编码**），
      弹窗用 `preservedLead` + 逐条本地化标签列出来（缺 label 时退回路径本身）。
      ⚠️ 交付给 UI 的是 **`MEMORY_PRESERVED_FOR_UI`（不含群聊语料）**：语料在弹窗里有自己的一行，
      而且预演负载里出现语料路径会让 §0.4 约束 2 的断言（"擦除链路负载不含语料字面量"）失效 ——
      那条断言守的是**链路不碰语料**，不该因为文案需要而被削弱。

27. **【O3 · 已修】实体图里"由他的记忆派生"的非人节点进残留清单（新档 `entityDerived`）。**
    §2.9 的删除判据只匹配 `type === "person"`，所以 `杭州 / 成都 / Rust` 这类节点**结构上删不掉**；
    而它们的 `mentionCount` 正是来自他那几条记忆。现在的做法：遍历非人节点，若其 `name` 出现在**任一将被删除的记忆正文**里，
    就以 `entityDerived` 进残留清单（附"出现在他的记忆里：…"的片段）。**只列不改** —— 误删地点会连累别人的提及。

28. **【O4 · 已修】她的复述行若"没被删掉"，必须看得见（启用声明已久的 `assistantText` 档）。**
    - 判据：在他的会话里，**assistant 行提到他的别名、且按执行侧同一判据不会被删**（他在这文件里没说过话，或既没提他也不紧跟他）→ 进残留清单。
      这正好覆盖"旧版本擦除留下的孤儿"：那些回复的 user 行早被删掉，配对信息不存在，新规则回收不了它们。
    - 同时**写进文案**的方向也定下来了：这一档出现在弹窗里，就是"重跑不会自动收敛"的凭据（§9.6.7 的 O4 说明）。
    - ⚠️ 已知边界（如实记录）：**一个字都没提他**的孤儿回复（真实现场的 `学做菜好呀…`）在"他的行已消失"之后
      没有任何结构化判据能定位 —— 它既进不了删除集也进不了这一档残留。对**首次就用新代码擦除**的现场不存在这个问题
      （配对成立，见 §9.6.6 的端到端证明）。

29. **【§5.2 第 6② 条判据修正】`memory-trace.log` 明确写成例外。**
    原文写的是"grep 出的每一处 `"qq:10001"` 都落在某条 `subjectIds` 里"。实测擦除会往 trace 里写带 `personKey` 的
    **删除动作记录**（`l2.delete.batch` / `transcript.erase` / `runs.erase` …），而 trace 是 §2.11 / Q3 明确保留的审计载体。
    → 判据补一句：**`memory-trace.log` 例外**（它只记计数与 id 类信息，不记被删正文 —— §9.2 用例 9 锁着）。
    `E:\AI_Chating\p3-verify\checks.mjs` 的 **6e** 同步从 `✗` 改成 `·`（只报数、不算失败），**②** 的扫描也跳过该文件。

### 9.4 未做 / 待做| 项 | 状态 | 说明 |
|---|---|---|
| **§5.2 手工验证（真实 QQ + NapCat）1–8 步** | ✅ **八步全部跑完**；**D1–D6 六条缺陷与 O2/O3/O4 三条观察全部落地，各配用例** | 记录见 §9.6（含修复后复测与端到端证明），修复见 §9.3b 第 16 条（D1）、§9.3d 第 21–22 条（D5/D2）、§9.3e 第 23–25 条（D3/D6/D4）、§9.3f 第 26–29 条（O2/O3/O4 + §6② 判据修正）。**无未落地项**；§9.6.7 只留三条如实记录的产品边界 |
| §4.4 的 `obsidian-exporter.test.ts` 增量 | ⬜ 未加 | 第 ⑪ 步**复用**导出器既有的 manifest 反删行为，未新增任何代码路径；该行为已由导出器自己的 manifest 用例覆盖。集成测试用例 8 锁住了"未绑定 vault 时整步跳过且不报错" |
| §8.2 的 8 个可选项（O1–O8） | ⬜ 未做 | 按文档"默认不做"处理 |
| `chat-api.log` 无大小上限 | ⬜ 未做 | 文档明确"只记录，不在本阶段修"（§0.4 约束 6 末） |
| **K 类「女朋友是兽医」那句有一次没被抽出** | ⬜ 已知行为，非缺陷 | 同一批 4 轮里，模型对"B 说 A 的私事"有时抽、有时跳过（离线复现时抽到了、线上那次 `raw=4` 里没有）。换成"具体事件"（怕坐飞机/把车卖了）并在同一批里放两条之后命中。**这是 LLM 判定波动，不是归属判据的问题** —— 判据侧的三条防线（用例 6/7/7b）已覆盖"映射不上就丢弃" |

### 9.5 施工中发现的新坑（对 P3.5 / 后续阶段有价值）

1. **⚠️ `JsonVectorStore.addUnique()` 不去重。** 名字叫 unique，实现是"直接 `addPreparedBatch`"，**没有** `add()` 那套相似度去重（`add()` 用 `search(..., 0.95)` 做语义去重）。所以任何"先删后建"的写法一旦只删了一半，就会留下同一 `l2Id` 的重复向量行；而重复行会让 `rag/index.ts` 的"`metadata.l2Id` ↔ `L2.ragId` 双向一致"检查把其中一行判成孤儿。
   → **P3.5 若要给某条记忆重建向量，先确认它当前有没有向量，别无条件 `addL2MemoryVector`。**

2. **⚠️ 压缩**不删**子条目的向量，只是把它们 `archive`。** 也就是说"被压缩"与"被删向量"是两件事：`status: archived` 的条目仍有健康的 `ragId`，只是被 `isL2LocallyRecallable` 的状态过滤挡在召回外。
   → **P3.5 做召回过滤时，`archived` 条目不需要特殊处理**（现有过滤已经够了）；反过来，**任何按 `ragId` 清向量的动作都要先确认它对应的是"要删"还是"只是被压缩"**。

3. **⭐ 本阶段把"判据"沉淀成了三层可复用件，P3.5 直接取用：**
   - **纯函数层**：`computeEraseHits` / `buildPrivateSessions` / `buildSpeakingSessions`（`person-erase-plan.ts`）+ `matchesRemovedUserTextFingerprint`（`relationship-log.ts`）；
   - **展示层**：`memory-console.ts` 里 `own` / `mentioned` 的分组判据（`isOwnMemory` / `isMentionedMemory`），与删除判据同源 —— 这正是 P3.5「召回时把 `speakerIds ≠ 提问者` 的记忆降级为『群友提过』」的原型；
   - **失效层**：`l2DmaeManager.loadStates()` 被正式当作"官方失效姿势"用了一次，P3.5 大量调用时的姿势已经验证过。

4. **`transcriptFileBase()`（原 `safeName`）必须导出。** `safeName` 把 `:` 换成 `_` 是**有损**的（渠道 id 允许含 `_`），所以"sessionId ↔ 文件名"这条映射只能靠**权威名册**（`safeName(sessionId) → sessionId`）。任何调用方自己写一遍 `replace(/:/g, "_")` 都会在 `safeName` 规则变化时静默错位。
   → `history-log.reloadAllHistory()` 那个 `name.replace(/_/g, ":")` 反推 bug 仍在（§8.2 O6 已记录），本阶段没碰它。

5. **`require()` 的老坑在本阶段又差点踩到一次**（P2 §3.6 新发现 3 的延续）：起草 `transcript-erasure.ts` 时为了拿 `path` 顺手写了 `require("node:path")`，实测在 vitest/ESM 下不可用。已改为从 `history-log` 导出 `pruneEmptyArchiveDirs()`，把 fs/app 用法留在同一模块里。

6. **测试目录里的"mtime 不变"断言必须用真实文件。** 语料不变性（集成用例 2b / isolation 新增用例）用的是 `sha256 + mtimeMs` 双指纹：只比内容会漏掉"重写了一遍同样的内容"，只比 mtime 会漏掉"改了内容但 mtime 精度不够"。

7. **预演报告里的"整份销毁"三项必须在 UI 上显式列出**（`memory.backup.*.json` / `memory-reconcile-backups/` / `chat-api.log`）。它们是**不可逆**的，且前两项会让"备份回退"这条退路消失 —— 所以 §2.11 的"预演必须列出大小"是硬要求，UI 侧已实现（有用例）。

8. **`deleteAllMemory` 的 `deleted` 字段现在会混入绝对路径**（备份项来自 `listMemoryBackupTargets`，返回绝对路径；其余仍是相对 userData 的路径）。测试断言别写死"全是相对路径"。

9. **⭐「删某人的痕迹」必须按"痕迹的形态"逐类清点，而不是按"文件清单"。** 本轮 §5.2 第 5 步之后实测到的残留形态至少有 6 类，而 `PERSON_ERASABLE` 只覆盖了其中一部分：
   | 形态 | 载体 | 本轮实测 |
   |---|---|---|
   | 结构化记忆 | `memory.json` | ✅ 已按人过滤 |
   | **记忆的向量副本** | `memory-store.json` 的 `user_memory_*` | ✅ 已删 |
   | **对话的向量副本** | `memory-store.json` 的 **`chat_history_*`** | ✅ **已修（§9.3d 第 22 条）** —— 原来完全没碰，且启动对账也看不见它 |
   | 逐轮 transcript | `channels/history` `archive` | ✅ 逐行过滤（含 **D5 修复**：她的复述/回复行也删） |
   | **agent 运行的对话副本** | **`cyrene-runs/sessions/*.json`**（`messages[].content` 是逐字正文） | ❌ 边界未定义（D4） |
   | 配置 / 派生物 | `channels-settings.json`（白名单）、`zones.json`、`entity-graph.json` 的**地点节点** | ⚠️ 前两个是 `MEMORY_PRESERVED`（有意），第三个是判据盲区（O3） |
   → **给 P3.5 的硬结论**：只要某条痕迹**同时存在于"原始载体"和"向量/副本载体"里**，单删原始载体就等于没删 —— 而且**向量副本是会被模型读到的**，比原始载体更危险。

10. **验证工具本身必须被验证（本轮最大的方法论收获）。** 第 4 步的残留数一开始对不上（弹窗 3 / 我的 ground truth 2），差点被记成产品缺陷；根因是**我的沙箱只拷了已知文件名、漏掉一个 `.p0-backup`**。凡是用"数据副本 + 真实代码路径"产出的对照值，副本的**完备性**本身就是断言的一部分（现已改成整目录拷贝 + 只排除 Electron 缓存）。

---

### 9.6 §5.2 手工验证记录（真实 QQ + NapCat，进行中）

> 施工环境：`E:\AI_Chating\cyrene-agent`（dev，`npm run dev`），userData 为 `%APPDATA%\live2d-cyrene`，测试群 `543627098`。
> **前置备份**：整份 `E:\AI_Chating\p3-verify\backup-20260925-1955\live2d-cyrene`（3019 文件 / 173.5 MB），另存全树 sha256 基线 `snap-pre.json`（681 文件，含语料 13 文件逐文件哈希）。

#### 9.6.0 环境侧的两个前置结论（都不是 P3 的问题，但不解决就做不下去）

| # | 结论 | 证据 |
|---|---|---|
| E1 | **主模型不能用于 memory 结构化输出。** 该端点（`[抗截断B]gemini-3.8-flash`）非流式请求恒返回空 `content`，正文全进 `reasoning_content`，而 `openai-adapter.parseResponse` 只把 `content` 当正文 → 结构化管线永远拿不到内容；且它跑 judge prompt 要 **49s**（小请求也要 26s） | `judge-endpoint-diag.cjs` 实测：小请求 26.2s、judge prompt 49.4s、`json_object` >120s、`json_schema` HTTP 400 |
| E2 | **解法是 `memory-llm-shared.ts` 里那条"专用记忆模型"配置**（`memoryProvider/memoryBaseUrl/memoryModel/memoryApiKey`，UI 未暴露但解析层已预留）。实测 `SiliconFlow / Qwen/Qwen3-14B`：judge prompt 一次通过 **19.4s**、`finish=stop`、3 条 L2 全带 `subjectNames` | 离线用 dist 里真实 judge 代码路径复现（stub electron + 真实 prompt/schema/pipeline），见 `E:\AI_Chating\p3-verify\judge-probe*.cjs` |
| E3 | **`group-corpus/` 是实时增长的，所以第 6b 步不能用"全树逐字节不变"做判据。** 实测 50 秒内：语料总字节 304832 → 305379（14 个群里 **12 个**在长，别的群同时在聊天），而测试群 `543627098` 那一个 4628B 逐字节不变 | `snap-probe1` → `snap-probe2` 对照。→ 判据改成三条：① 群 G 的语料逐字节不变；② 其余语料只允许**纯追加**（旧内容是新内容的前缀，靠 `snapshot.mjs` 新加的逐行哈希判定）；③ 没有任何语料文件被删或变小。已用真实 churn 验证通过 |

#### 9.6.1 第 1 步：造样本 —— ✅ 通过（超出预期）

- 6 轮真实群聊（A=小明 `2914636187`，B=游戏专属号 `910713550`），`roundCount` 到 6 触发 judge。
- **`judge.run` 首次仍然失败**（`MemoryLlmTimeoutError` 30s），诊断出 E1/E2；改完超时与 token 预算后 `judge.result: raw=5 kept=5 layers=["L2"×5]`，**9 条 L2 落库**（含 4 条 `evidence`/`dmae` 同步、`syncStatus=synced`）。
- **§5.2 第 1 行的原始期望是"5 条"，并且要求"至少一条 K 类"** —— 实测 9 条，其中 **K 类 1 条**（`speakerIds=[qq:910713550]` + `subjectIds=[qq:2914636187]`，"游戏专属号提到小明害怕坐飞机，出差时抓紧扶手"）。
- 每条 L2 的 `speakerIds` / `subjectIds` / `sourceMessageIds` / `scope` 全部正确，`sourceMessageIds` 能对回 transcript 里真实的 `msg_*` id。
- **这也回答了 P3 唯一无法 mock 的问题：LLM 确实会按 prompt 输出 `subjectNames`，并且人名能被精确映射回 `personKey`。**

**观察 O1（既有行为，非 P3 缺陷）**：judge 的批次是"最近 8 轮"、每次重叠 2 轮，而 store 对内容不做去重，所以 `小明计划下个月搬去杭州` / `小明喜欢跑步` 各被抽了两次（`#3/#5`、`#4/#6`）。9 条里有 2 条是重复。→ 对 P3 无影响（多条同义记忆各自有独立 `l2Id`/`ragId`，删除与擦除都按 id 走），但如果将来要控制记忆膨胀，去重点在**写入侧**（不是删除侧）。

#### 9.6.2 第 2 步：单条删除 —— ⚠️ 抓到 D1（已在同轮修复，待用户复测）

| 检查项 | 期望 | 实测 |
|---|---|---|
| `l2` 少 1 条 | 9 → 8 | ✅ |
| `evidence` 少 1 条 | 9 → 8 | ✅ |
| `l2DmaeStates` 少 1 条 | 9 → 8 | ✅ |
| 该条 `ragId` 在向量库 0 命中 | 0 | ❌ **仍命中 1 次**（向量库 21 条不变，文件 mtime 停在写入那刻） |

→ 根因与修复见 **§9.3b 第 16 条（D1）**。启动对账确实会兜底回收（见 9.6.3），所以这个缺陷的可见窗口是"删完之后、下次启动之前"。

#### 9.6.3 第 3 步：重启不复活 —— ✅ 通过（顺带反证 D1）

| 检查项 | 结果 |
|---|---|
| 被删的那条 L2 是否复活 | ✅ 没有（`l2` 仍 8，`l2Id` 仍不存在） |
| 孤儿向量是否被启动对账回收 | ✅ 21 → 20（`memory-reconcile-backups` 也随之生成） |
| 每条剩余 L2 是否都有配套向量 | ✅ 是 |

→ 这正是 §1.2 表格里"只删 L2 不删向量 → 会被对账回收（但期间仍可被召回命中）"的实测版本。

#### 9.6.2b 第 2 步复测（D1 修复后）：✅ 通过

| 检查项 | 期望 | 实测 |
|---|---|---|
| `l2` 少 1 | 8 → 7 | ✅ |
| `evidence` / `l2DmaeStates` 各少 1 | 8 → 7 | ✅ |
| 向量库总数 | 20 → **19** | ✅ |
| 该条 `ragId` 0 命中 | 0 | ✅ **消失的正好是目标那一条** `user_memory_1790341429296_0_duop`（无新增、无误删第二条） |
| 文件是否真被重写 | mtime 前进 | ✅ `memory-store.json` mtime 21:14:53 → **21:30:18**（是这次删除请求自己写的，**不是**启动对账兜的底） |

→ D1 修复在真实链路上生效；旧的 D1 症状（条数不变、mtime 不动）不再复现。

#### 9.6.3b 第 4 步：预演弹窗 —— ✅ 通过（逐行对照 16/16）

**方法**：用 `dist` 里**真实的 `previewPersonErase`** 在**数据副本**上跑一次，拿到弹窗背后那份 plan 的原始 JSON 作为 ground truth（`preview-truth.cjs`；electron 的 `userData` 被指向副本，真实数据零写入）。

逐行核对（弹窗 vs ground truth）：标题 `擦除预演｜AIKIEB`、`将删除 5 条`、其中 5/0/0、`保留 1 条`（含例子「游戏专属号提到小明害怕坐飞机…」）、`群聊语料未做任何改动` 那行在、涉及会话 3 个（`20b39…` 记忆 5 · 热层 17 · 归档 0；`9cdd…` 0 · 0 · 归档 19/1 个月；私聊 `afc0…` 0/0/0）、`向量 5 · 证据 5 · DMAE 5 · 冲突 0 · 反思 0`、关系日志 `14/0/0/1`、审计 `72 条 / 72 个文件 · 运行日志 122 行 · 外部会话 1 条`、备份 `4 个 · 620.3 KB`、`chat-api.log 不存在`、实体候选只有 `小明`（关系 0）—— **全部一致**。

**一处差异，且是验证工具自己的问题**：残留数弹窗是 **3 处**，我的 ground truth 算成 2 处。根因：沙箱第一版**只拷了已知文件名**，漏了 `channels/context-bindings.json.p0-backup`（而 `channels/` 下确实有**两个**孤儿文件）。**弹窗是对的。** → 已把沙箱改成"整目录拷贝 + 只排除 Electron 缓存"（`E:\AI_Chating\p3-verify\sandbox.mjs`），从根上消除"漏拷文件 → 假阴性"。
→ 教训：**对照值的可信度必须先于结论**；这一次差点把工具缺陷记成产品缺陷。

#### 9.6.3c 第 5 步：确认并执行 —— ✅ 通过

确认短语严格相等（`彻底擦除`）门控正常；**无重启提示**；报告 `✅ 已完成，没有失败步骤`（`partial: false`），逐行与期望一致：

| 报告行 | 实测 |
|---|---|
| 记忆 | 请求 5 · 实际 5 · 总结 0 · 去压缩 0 ✅ |
| transcript | 2 个会话 · 热层 17 行 · 归档 19 行 ✅（`history` 文件 48 → 31 行） |
| 审计 / 运行日志 / 外部会话 | 72 条 / 72 文件 · 122 行 · 1 条 ✅ |
| **备份** | 报告 **3 个**（620.3 KB）vs 预演 **4 个** → **D3 口径差异**（见 §9.3c 第 18 条），实际已删干净 |
| 实体图谱 | 节点 1 · 关系 0 ✅ |
| 关系日志 | 按人 14 · 按域 0 · 指纹 0 · 总结 0 ✅ |
| 缓存 | 召回注入 0 · 会话索引 0 · DMAE **已重建** ✅ |
| Obsidian / 保留 | 未绑定 vault 跳过 · 保留 1 条 ✅ |

#### 9.6.3d 第 6 / 6b / 6c 步：数据核对 —— ✅ 8/9 断言通过（另 2 条为新登记项）

一键断言见 `E:\AI_Chating\p3-verify\checks.mjs`（`--cur post-erase --base pre-erase`）。

| # | 检查项 | 实测 |
|---|---|---|
| 6① | `speakerIds` 里 `qq:2914636187` 0 命中 | ✅ 0 条 |
| 6② | 全树 `qq:2914636187` 每一处都落在 `subjectIds` 里 | ⚠️ `memory.json` 那 1 处 ✓（K 类）；**额外命中 `memory-trace.log` ×6**（擦除操作自身的 trace） |
| 6③ | transcript 里 `speakerId=2914636187` 0 行、B 一行不少 | ✅ 0 行；B 8 → 8 |
| 6④ | 审计里 `senderId=2914636187` 0 行 | ✅ `index.jsonl` 115 → 51 行，他 72 行清零 |
| 6⑤ | `memory.backup.*.json` 一个不剩 + 对账备份目录不存在 | ✅ 0 个 + 已销毁 |
| 6⑥ | `chat-api.log` 不存在 | ✅ 不存在（本来就没有） |
| 6b | 群 G 语料逐字节不变 + 他的语料行仍在 | ✅ 4628B 逐字节不变；他的 **15 行一字不少**；其余 7 个语料文件均为**纯追加**、无文件被删（判据见 E3） |
| 6c | 关系日志 `personKey` 0 条 · `unmatched` 仍在 | ✅ 0 条；条目 24 → 10（B 8 条 + 无 `personKey` 2 条，**unmatched 2 → 2 未变**） |
| 6d | **`user_memory` 向量 0 命中他** | ✅ 2 条里 0 条 |
| 6d | **`chat_history` 向量里含他的条数** | ❌ **4 条**（含裸 senderId；按名字算共 8 条）→ **D2**，见 §9.3c 第 17 条 |
| 6e | `memory-trace.log` 里 0 命中 `personKey` | ❌ 6 行（擦除操作 trace） |

**擦除后的数据快照**（可作为后续回归基线）：`l2` = 2（K 类「游戏专属号提到小明害怕坐飞机」+ B 自己的「艾尔登法环」）、`evidence`/`dmae` = 2、向量库 = 14（`user_memory_` 2 + `chat_history_` 12）、实体图剩 `游戏专属号 / 杭州 / 成都 / 艾尔登法环`（`relations` 已空）、关系日志 10 条。

#### 9.6.4 第 7 步（行为验收）：⚠️ 主测通过、加测暴露 D5

| 场景 | 原话 | 判定 |
|---|---|---|
| **主测 · 他的私聊**（`channel:qq:afc083f8a0114240`）问「小明是谁？」 | 「在数学题和冷笑话里，他永远在买苹果、追火车，还要被老师叫起来回答问题呢？如果你指的是身边哪位朋友，或者某部作品里的人，人家可就猜不到啦……BeiKia 是想说哪一个他呀？」 | ✅ **通过** —— 她把"小明"当通用人名，**没有**任何"我认识的某个人"的迹象，并反问是谁 |
| **加测 · 群** `543627098` 问「小明最近在学什么呀」 | 「小明自己怎么还考起人家来了呀♪ **你最近不是正在认真学做菜嘛！当时还说以后去杭州开小灶呢**，现在学会几道拿手好菜啦♪」 | ❌ **不通过，但不是 K 类** —— 证据链指向 **D5**（她自己的 assistant 行被保留并进了上下文），见 §9.3c 第 21 条 |

> 补充：这一轮也顺带证明了「关系日志按人重置」是有效的 —— 22:05 他再开口后，`relationship-log.json` 立刻新增了一条 `personKey=qq:2914636187` 的条目（擦除前的 14 条确实清掉了）。

#### 9.6.5 第 8 步（重置验收）：✅ 通过（改成在群里做之后）

- 私聊路线不成立：主人的私聊域算 **root 域**（`l2Only=false`），实测那一轮 `judge.result` 是 `raw:1 kept:1 **layers:["L1"]**` → 写进 `l1.recentGoals`，`l2` 不动。而第 8 步的判据是 L2 字段，**只能在非 root 域满足**。
- 改在群 `543627098` 里再发 4 句（`roundCount` 32 → **36**，judge 触发）：

| 新记忆 | `speakerIds` | `subjectIds` | 内容 |
|---|---|---|---|
| `l2_1790345767370_ho4yfa` | `qq:2914636187` | `qq:2914636187` | 小明最近在学画画，从素描开始，并打算买新的绘图板 |
| `l2_1790345767438_ycc2w8` | `qq:2914636187` | `qq:2914636187` | 小明周末喜欢去看艺术展 |
| `l2_1790345767485_r1mnsh` | `qq:910713550` | `qq:910713550` | 游戏专属号最近迷上了钓鱼 |

- 三条全部 `syncStatus: synced`（`l2.sync.success` + 各自 `ragId`），向量库 14 → **17**（`user_memory_` 2 → 5）。
- 关系日志也同步重建：擦除后新增 `personKey=qq:2914636187` 条目 11 条（擦除前那 14 条确实清掉了），说明**按人重置有效**。
- → **「重头再来」成立**：他不是被拉黑，而是从零重新被认识。

#### 9.6.6 修复后的复测（D1/D2/D5 三条都在真实数据上验过）

**A. 现场复测（应用重启到修复后的代码，再擦一次 `qq:2914636187`）**

预注册（在动手之前由**真实预演代码在副本上**算出）→ 实测**逐条命中**：

| 项 | 预注册 | 实测 |
|---|---|---|
| `l2` | 5 → 3 | ✅ |
| 向量库 | 17 → **6**（`chat_history_` 12→3 · `user_memory_` 5→3） | ✅ |
| 应删的 9 条 `chat_history` 向量 | 逐条列出（4 条他的原文 + 4 条她对他那几句的回复 + 1 条点名他的） | ✅ **逐条 0 命中** |
| 应留的 3 条 | B 的两条转述 + 她回 B 的那条 | ✅ **逐条仍在** |
| transcript | 他的行 0 · B 的 9 行一行不少 · 私聊整会话删 | ✅ |
| 她的复述/回复 | 删 **12** 行 | ✅（但见下面的孤儿说明） |
| 语料 | 群 G 逐字节不变；其余纯追加 | ✅ |
| 关系日志 / 审计 | 25 → 11（unmatched 2→2）/ 16 条清零 | ✅ |
| 备份 + 对账备份 / `chat-api.log` | 0 个 + 目录不存在 / 不存在 | ✅ |

**B. 现场那次 D5 只"砍中一半"—— 已定位为历史残留，不是回归**

现场擦除后仍有 6 行泄漏句（`学做菜好呀！以后搬去杭州就能自己开小灶啦♪` 等）留在群里。**根因**：它们的 user 行是**擦除 #1（旧代码）**删掉的，于是这些回复**变成了孤儿** —— 新判据的"轮次配对"要求"上一行是他的行"，而那一行已经不在了。

**C. 决定性证明（在真实数据的副本上跑真实代码）**

工具 `E:\AI_Chating\p3-verify\d5-proof.cjs`：把 **擦除 #1 之前**的整份备份（`backup-before-erase`，含**原始顺序**）复制成沙箱，stub 掉 electron 的 userData，用 `dist` 里真实的 `previewPersonErase` + `executePersonErase` 走一遍：

```
群 G transcript：48 行 = 他的 17 + B 的 8 + 她的 23
预演：将删除 5 条记忆 · 保留 1 条 · 群 G：他的 17 行 + 她的复述/回复 20 行 · 记忆向量 5 · 对话向量 9
执行：partial=false  failed=[]
群 G transcript 48 → 11
  他的行      17 → 0    ✓
  她的行      23 → 3（-20）
  泄漏句残留  10 → 0    ✓ 一句不剩   ← 包括那行**一个字都没提他**的 `学做菜好呀…`
  B 的行       8 → 8    ✓ 一行不少
向量库 19 → 5；chat_history 12 → 3（留下的正是 K 类与别的 turn 的两条）
他的私聊文件：已整份删除 ✓
```

→ **新判据本身是对的**：只要他的行还在，"配对 + 名字"两条就能把她**全部**复述/回复行清干净；现场那一半残留是**旧代码留下的孤儿**。

**D. 同轮新增的两条记录**

- **D6（低危 · 口径）**：预演的「关系日志」行只有四档（按人/按域/原文指纹/无法定位），**报告里多一格「总结」** —— 预演无法预测这一格，用户会看到"预演没有、报告有 1"。与 D3 同类，一并修。
- **O4（观察 · 需要文档写明）**：**旧代码擦除留下的孤儿 assistant 行不会被新规则回收**（判据已在，但"上一行"这个信息在历史残留里不存在）。对**首次就使用新代码**的擦除没有这个问题；对已经用旧代码擦过一次的数据，只能人工或一次性清理脚本。**产品文案与文档必须写明这一点**，不能让用户以为重跑一次会自动收敛。

#### 9.6.7 待做

**本轮全部收尾，无未落地项。** 下面三条是**如实记录的产品侧边界**（不是待办）：

- **`memory-trace.log`**：擦除会往里写带 `personKey` 的**删除动作记录**。它是有意保留的审计载体（§2.11 / Q3），
  §6② 的判据已按 §9.3f 第 29 条改成"该文件例外"，`checks.mjs` 的 6e 也从 `✗` 降为 `·`（只报数）。
- **O4 的已知边界**：**一个字都没提他**的孤儿 assistant 行（旧版本擦除留下的、如 `学做菜好呀…`），
  在"他的行已消失"之后没有任何结构化判据能定位 —— 既删不掉也列不进残留。
  它不是新代码的行为（首次擦除时配对成立，见 §9.6.6 的端到端证明），只能靠文案与文档说明。
- **时点性**：§5.2 第 6③ 条（transcript 里他的行 0 条）是**擦除那一刻**的断言；之后他再说话自然会有行（实测复测时就出现了这种情况）。

- **修 D1–D5 里剩下的四条**（D2 向量 / D3 计数口径 / D4 运行存储边界 / **D5 assistant 行**），见 §9.3c。
- **D5 与 D2 的修复口径需先拍板** —— D5 三选一（逐行删含别名的 assistant 行 / 只删"整段都在讲他"的行 / 承认并改措辞）；D2 已定"删他说的 + 昔涟回复里点名他的、保留别人转述他的"。
- 修完之后：§5.2 第 6② / 6c / **第 7 步加测**三条需要复测（第 7 步加测是 D5 的直接验收面）。

#### 9.6.7 本轮验证工具（都在 `E:\AI_Chating\p3-verify\`）

| 工具 | 作用 |
|---|---|
| `snapshot.mjs` | 全树 sha256 快照；**语料额外带逐行哈希**（为了判"纯追加"，见 E3） |
| `diff.mjs` | 两份快照差分 + 语料逐字节 + 被擦者每一处的上下文归类 |
| `checks.mjs` | 第 6 / 6b / 6c / **6d（D2 指标）** / **6e（trace 残留）** 一键断言 |
| `veccheck.mjs` | 向量库单独读数：`snap` / `diff` / `hit`（第 2 步 D1 复测的主力） |
| `sandbox.mjs` | 预演/报告要读的数据副本（整目录拷贝 + 只排除 Electron 缓存） |
| `preview-truth.cjs` | 用 dist 里真实的 `previewPersonErase` 在副本上产出 ground truth（第 4 步对照表） |


