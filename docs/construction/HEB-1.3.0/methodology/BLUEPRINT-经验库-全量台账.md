# 蓝图经验库 · 全量台账（溯源用）

> **与其他文档的关系**：
>
> | 文档 | 条数 | 用途 |
> |---|---|---|
> | **[BLUEPRINT-经验库-通用.md](BLUEPRINT-经验库-通用.md)** | **56（H 44 + M 12）** | **写蓝图前必读**：按类型分档 + 场景索引 + 四类通用形状，可快速检索 |
> | **[BLUEPRINT-经验库-具体坑.md](BLUEPRINT-经验库-具体坑.md)** | **54（L）** | **按技术栈检索**（不通读）：git / Windows·PowerShell / Electron·Node / TS·构建测试 / 本项目专有 / 正则等 API |
> | **本文件（全量台账）** | **186（R）+ 10（X）** | **面向考古与举证**：逐条带 `文件:行号`；附录 C 类型分布、附录 D 最珍贵的 10 条**只在这里** |
> | [BLUEPRINT-撰写规范.md](BLUEPRINT-撰写规范.md) | — | 写作规范（经验库的用法见其 §9） |
> | [模板-总蓝图.md](模板-总蓝图.md) | — | 总蓝图的 10 区块骨架（**本包不附带任何范例任务的基线数据**） |
>
> ⚠️ 两个"实用库"是**子集**（从原 100 条取样拆出 + 补入 X 系列，抽取时本台账尚在施工中），**全量以本文件为准**。
> 判不准某条该进哪个库时，回来查本文件的 `- 等级:`。

> **等级图例（H / M / L）**：**本台账是全量档案**（186 R + 10 X），每条正文末尾的 `- 等级:` 用于把条目归位到
> [BLUEPRINT-经验库-通用.md](BLUEPRINT-经验库-通用.md)（**H/M**）或 [BLUEPRINT-经验库-具体坑.md](BLUEPRINT-经验库-具体坑.md)（**L**）；
> 原「分类版」的 100 条 → 通用库 **56** 条（H 44 + M 12）+ 具体坑库 **44** 条（L，含 1 条由 H 改判的 A15）；
> 具体坑库另有 **10** 条来自本台账附录 B（X1–X10，全为 L），故该库共 **54** 条。
> **还有一批 R 条目只存在于本台账**（抽取时未进原 100 条取样）——它们是更细的实例，需要时按关键词在此检索。
>
> | 等级 | 判据（自评问句） | 读法 |
> |---|---|---|
> | **H** 跨环境通用 | 「换一种语言/框架，这条坑还成立吗？」→ 是 | 写蓝图前**必读** |
> | **M** 同类系统通用 | 「换一个同类系统/项目还成立吗？」→ 是，否 → L | 写蓝图前**必读** |
> | **L** 绑定具体技术栈 | 「核心是某条命令 / 某个 API / 某个库的行为吗？」→ 是 | **按当前技术栈检索，不通读** |
>
> **判定顺序**：先问 H（核心是推理方式 / 流程纪律 / 判据设计 / 逻辑顺序 / 语义建模，与语言和框架无关吗？）→ 再问 M（依赖某个运行时 / 某类系统的固有行为吗？）→ 否则 L（含"具体项目专有"的坑）。
> **同一条反例在通用库 / 具体坑库与本节里的等级必须一致**。

> **来源**：`SELF-update 260925/` 下的 8 份中文施工文档（实际行数：phase1-group-context-observe 1003 / phase1.5-speaker-attribution-patch 931 / phase1-manual-verification 332 / phase2-zones-and-memory-isolation 2280 / phase3-p1-message-identity 648 / phase3-p2-l2-person-attribution 938 / phase3-p3-erasure-and-console 1977 / phase3-person-memory-overview 664）。
> ⚠️ **这批原始文档未随本包分发**：每条末尾的 `- 出处:` 是**记录标识 + 行号**（形如 `SELF-update 260925/phase1-group-context-observe.md:5-7`、
> `task-仓库合并/PHASE-2-完成报告.md:44`），用于**溯源**与**唯一标识**，**不是本包内可打开的路径**；条目本身四段齐全，不去解析出处也照样可用。
> （同一批出处同时以键号形式出现在两个实用库里：H/M → [BLUEPRINT-经验库-通用.md](BLUEPRINT-经验库-通用.md)；L → [BLUEPRINT-经验库-具体坑.md](BLUEPRINT-经验库-具体坑.md)。）
> **抽取口径**：逐条抽取"错误做法 / 症状 / 根因 / 正确做法"，含 §9 及 §19/§20/§21 的编号偏离、"施工中发现的新坑"、显式 ⚠️🔴❌🚫 陷阱、被实测推翻的原认知（标"原计划 vs 实测"）、判据自身的修正、验证工具自身的错误。
> **行号口径**：行号以 `read` 工具切分（含文件内混合换行符）的行号为准，与原始文档目录中标注的总行数一致；`文件名:行号` 中的文件名省略 `.md`。
> **类型枚举**：命令与脚本 / 环境 / 文档与判据 / 验证方法 / 架构与实现 / 流程纪律。
> **附录 B** 单独收录"线索属于本 8 份之外文档"的核实结果（编号 X1–X10），不计入 R 台账条数。

---

## 一、phase1-group-context-observe.md（施工蓝图，A 组）

### R1
- 出处: SELF-update 260925/phase1-group-context-observe.md:5-7
- 错误做法: `classifyQqEvent`（`napcat-adapter.ts:125`）对"未 @ 且未命中触发词"的群消息直接返回 `{ allowed: false, allowlist: false }`，`onMessage` 根本不被调用。
- 症状: 群里 A 说"xxx是什么"（未 @），B 说"@昔涟 你知道吗"时，昔涟只能看到"你知道吗"四个字，无法理解 A 的上下文。
- 根因: "要不要回话"与"要不要记录"被压进同一个布尔 `allowed`，于是"丢弃"等于"不落盘"，旁听材料在源头就不存在。
- 正确做法: 把决策结果拆成三态 `respond` / `observe` / `drop`；`observe` 只写 transcript 不调 LLM，`drop` 才既不写也不回。
- 类型: 架构与实现
- 等级: H

### R2
- 出处: SELF-update 260925/phase1-group-context-observe.md:54
- 错误做法: 蓝图把 transcript 的"当前格式"示例写成 `{"content":"[群聊发送者：张三](@昔涟)\nxxx是什么"}`，即假定了 `(@昔涟)` 这个标记存在。
- 症状: `formatChannelUserText`（`channel-context.ts:92`）**从不产生** `(@昔涟)` / `(触发词)`；下游 `LEGACY_SPEAKER_PREFIX` 的捕获组 2 永不命中，`triggered` 恒为 `false`，且 `speakerName` 被提取成 `小明 (10001)`（把 QQ 号吞进名字）。
- 根因: 蓝图用"想象的示例数据"定义格式契约，没有对着真实写入函数的输出写；下游按这份示例写正则与测试，契约就永久错位。
- 正确做法: 格式示例必须逐字节复制自真实写入函数的实参；真实形态是 `[群聊发送者：小明 (10001)]\n<正文>`（触发词场景中间还有一行 `[本条消息命中触发关键词（未 @ 你），按约定需要你回复]`）。**原计划 vs 实测：示例 `(@昔涟)` → 实测生产代码从不产生该标记。**
- 类型: 文档与判据
- 等级: H

### R3
- 出处: SELF-update 260925/phase1-group-context-observe.md:78-79,904
- 错误做法: 向后兼容策略写成"content 若含 `[群聊发送者：xxx]` 前缀，**自动提取到 `speakerName`**"，但没规定提取后 content 里剩什么。
- 症状: Phase 1 实现（`normalizeEntry`）把前缀提取成 `speakerName` 并**从 content 里删掉**，而 `bootstrap.ts:177` 的映射只取 `role + content` → 群聊滑动窗口里所有历史消息变成"没有说话人的裸 user 消息"，看起来全像请求方说的，多人群聊会认错人（phase1.5 缺陷 D1）。
- 根因: "结构化字段"与"正文文本"是两个消费面，蓝图只声明了字段提取，没声明字段的**下游消费者是否已经改用字段**；旧消费者仍在读 content，信息就在中间层蒸发了。
- 正确做法: 拆字段时必须同时确认所有消费者；`bootstrap.ts` 的映射要带上 `speakerName/speakerId`，或在 content 里保留说话人（phase1.5 的处置是让映射与 ChatMessage 暴露说话人字段）。
- 类型: 架构与实现
- 等级: H

### R4
- 出处: SELF-update 260925/phase1-group-context-observe.md:104
- 错误做法: 群聊判定写成 `if (sessionId?.includes(":group:"))`。
- 症状: 真实渠道 sessionId 形态是 `channel:<渠道>:<sha256(渠道:chatId) 前 16 位>`（例如 `channel:qq:20b39082aa808213`，见 phase3-p1:609），**不含 `:group:`** → 该分支恒不成立，群上下文注入永远不会触发。
- 根因: 用"看起来像"的字符串片段当类型判据，而 sessionId 是哈希派生的不透明 id；`:group:` 这种分段只存在于早期设想里。
- 正确做法: 群/私聊要由 `IncomingMessage.chatType`（或渠道侧显式字段）判定，不要对会话 id 做子串猜测；需要从 id 反推时必须走权威映射函数（如 `channelFromSessionId`）。
- 类型: 文档与判据
- 等级: L

### R5
- 出处: SELF-update 260925/phase1-group-context-observe.md:971-973
- 错误做法: observe 模式让**每条**群消息都写 jsonl，每轮群触发再注入最近 N 条（约 +200 tokens），蓝图只写"建议考虑加 rate limit（但 Phase 1 不做）"。
- 症状: 写入频率与 token 消耗随群活跃度线性增长，蓝图未给出可测量上限或熔断条件。
- 根因: 把"功能可用"当成目标，未把"活跃群"这一真实工况写进验收判据（阈值、上限、降级行为全缺）。
- 正确做法: 在蓝图阶段就写明活跃度阈值与降级动作（如 >100 消息/分钟时限流或降采样），并把它写进验收测试；实现延后可以，判据不能缺。
- 类型: 文档与判据
- 等级: H

### R6
- 出处: SELF-update 260925/phase1-group-context-observe.md:914-917
- 错误做法: 回滚方案写 `git revert <commit-hash>` + `git push`。
- 症状: 该阶段及后续 P0/P1 的改动实际**停留在 working tree 未提交**（phase1.5:3 明确"当前在 working tree 未提交"；phase3-p1:503 明确"工作区含 P0 全部改动（未提交）"）→ 没有 commit-hash 可 revert，回滚步骤不可执行。phase2 又写"全部改动在 `feat(phase2-zones)` 分支"（phase2:1610），与前两份的记录不一致。
- 根因: 回滚方案照抄模板，没有与"实际提交状态"对齐；而"是否已提交"是回滚方案唯一的执行前提。
- 正确做法: 回滚方案必须写清当前的提交状态假设，并给出不依赖 git 历史的兜底（物理备份目录 + 逐文件恢复），或施工前强制建立可回退的基线提交。
- 类型: 流程纪律
- 等级: H

### R7
- 出处: SELF-update 260925/phase1-group-context-observe.md:1001
- 错误做法: 风险自评写"风险等级：🟡 中等（涉及核心消息处理流程，但有完善的测试覆盖 + 向后兼容保证）"。
- 症状: 该阶段上线后立刻产生回归 D1（说话人被从正文剥掉，滑窗丢人），"完善的测试覆盖"没有抓到——测试数据本身用的是生产不产生的格式（见 R19）。
- 根因: 风险自评把"有测试"当成降低风险的理由，而没验证"测试是否覆盖真实链路"；测试覆盖率的自我评价来自用例数量而非路径真实性。
- 正确做法: 风险等级要按"最坏后果 × 检出难度"定，并注明**哪条真实链路没有被任何测试覆盖**；核心消息处理流程默认至少 🟠 高。
- 类型: 流程纪律
- 等级: H

### R8
- 出处: SELF-update 260925/phase1-group-context-observe.md:919-923
- 错误做法: 数据兼容性写"**无需数据迁移或清理**"，向后兼容只讨论"新旧客户端互读"。
- 症状: Phase 2 引入启动期 schema 闸门后，用户点"清空记忆并继续"触发 `deleteAllMemory()`，`MEMORY_TARGETS`（`memory-deletion.ts:15-31`）**显式包含 `channels/history/` 与 `channels/archive/`** → 老 transcript 文件被整目录删除，"旧格式兼容"这条验收永久失去真实样本（phase3-p1:616-641）。
- 根因: 兼容性分析只看了"格式解析"，没看"生命周期"——数据可能被别的功能的删除路径带走。
- 正确做法: 兼容性结论必须列出"哪些既有路径会删除/迁移这份数据"；做 transcript 相关手工验证前**先备份 `channels/`**；删除类功能的提示文案要与 `MEMORY_TARGETS` 的实际范围一致。
- 类型: 文档与判据
- 等级: H

---

## 二、phase1.5-speaker-attribution-patch.md（缺陷清单，B 组）

### R9
- 出处: SELF-update 260925/phase1.5-speaker-attribution-patch.md:26-44
- 错误做法: Phase 1 的 `normalizeEntry` 把说话人前缀提取成 `speakerName` 后**从 content 里删掉**，而 `bootstrap.ts:177` 的映射只取 `role + content`：`.map((m) => ({ role: …, content: m.content }))`。
- 症状: 群聊滑动窗口里所有历史消息都成了"没有说话人的裸 user 消息"，看起来像请求方说的；多人群聊会认错人。**这是 Phase 1 引入的回归**（证据：`git diff HEAD -- src/main/channels/history-log.ts` 里 `parsed.push(e)` → `parsed.push(normalizeEntry(e))`）。
- 根因: 结构化改造只做了"写入侧"，读取侧消费者（滑窗映射）没有同步升级到新字段，信息在"提取出来但没人用"的中间层丢失。
- 正确做法: 拆字段的同一批次里必须改完所有消费者；`ChatMessage` 要暴露 `speakerName/speakerId`，滑窗映射把它们拼回模型可见文本（`[小明]: 大家好`）。
- 类型: 架构与实现
- 等级: H

### R10
- 出处: SELF-update 260925/phase1.5-speaker-attribution-patch.md:46-67
- 错误做法: `LEGACY_SPEAKER_PREFIX = /^\[群聊发送者：([^\]]+)\](\(@昔涟\)|\(触发词\))?\n?(.*)/s`，按"想象中的旧格式"写正则。
- 症状: 捕获组 2 永不命中 → `triggered` 恒为 `false`；`speakerName` 提取成 `小明 (10001)`（QQ 号被吞进名字），与旁听记录的 `小明` 不一致。
- 根因: 正则的契约来自文档示例而不是生产写入函数；且 `[^\]]+` 遇到含 `]` 的昵称会提前收尾（同一个缺陷半年后在 phase2 §21.10 再次爆雷）。
- 正确做法: 先跑一次真实链路把 jsonl 原样打出来，照抄字节写正则；`speakerName` 与 `speakerId` 要拆成两个捕获组，不要把 `昵称 (QQ号)` 当整体。
- 类型: 命令与脚本
- 等级: H

### R11
- 出处: SELF-update 260925/phase1.5-speaker-attribution-patch.md:69-76
- 错误做法: 滑动窗口取 `loadRecentHistory(sessionId, 16)`、旁听块取 `buildGroupContextBlock(sessionId, 10)`，两者读**同一个 jsonl** 且都不做类别过滤。
- 症状: 同一批群消息在 prompt 里出现两次；请求方自己那句话也出现两次（旁听块 + `agentUserText`）。
- 根因: 两个消费方各自"取最近 N 条"，缺少互斥谓词；重复注入不是 bug 而是缺一个划分。
- 正确做法: 引入互斥过滤谓词 `conversationOnly` / `observedOnly`（见 R13），并把"一条消息要么在滑窗、要么在旁听块"写成验收标准 V3。
- 类型: 架构与实现
- 等级: H

### R12
- 出处: SELF-update 260925/phase1.5-speaker-attribution-patch.md:78-87
- 错误做法: `channel-context.ts:171` 写群聊历史时漏传 meta：`await options.appendChannelHistory(context.sessionId, "user", modelText);`（第 4 个参数缺失）。
- 症状: 群聊正式轮**没有** `speakerId/speakerName/triggered` 结构化字段落盘，只能靠 R10 那个失效的正则去猜。
- 根因: 结构化字段是"可选第 4 参数"，写入侧漏传不会报错、不会有测试变红——可选参数是丢参载体。
- 正确做法: 结构化字段要么必传（类型层强制），要么在写入函数里对"群聊 + 缺 meta"直接抛错/告警；并补一条"正式轮落盘必须带 speakerId"的用例。
- 类型: 架构与实现
- 等级: M

### R13
- 出处: SELF-update 260925/phase1.5-speaker-attribution-patch.md:110-118
- 错误做法: 过滤谓词若写成 `triggered === true` 进滑窗、`triggered === false` 进旁听。
- 症状: 旧记录与私聊记录的 `triggered` 是 `undefined`，会被**全部排除** → 私聊滑动窗口清空、老群记录消失。
- 根因: 三值逻辑（`true`/`false`/`undefined`）被当成二值用；`undefined` 在"新写入的旧数据"里是常态而非异常。
- 正确做法: 用 `conversationOnly: role === "assistant" || triggered !== false`、`observedOnly: role === "user" && triggered === false`，让 `undefined` 与 `true` 同归滑窗，只有明确 `false` 进旁听块。
- 类型: 架构与实现
- 等级: H

### R14
- 出处: SELF-update 260925/phase1.5-speaker-attribution-patch.md:120-126
- 错误做法: 若先 `slice(-limit)` 再按类别过滤。
- 症状: 一个刷屏的群会让滑动窗口只捞到 2 条正式轮，"最后 N 条该类消息"的语义不成立。
- 根因: 截断与过滤的顺序决定了"窗口"的单位是"全部消息"还是"该类消息"；先截断等于在错误的集合上取窗口。
- 正确做法: `filterHistory(parsed, query).slice(-limit)` —— **先过滤再截断**；并把这条列为对既有 `loadRecentHistory` 语义的**有意变更**（无 query 时行为不变）。
- 类型: 架构与实现
- 等级: H

### R15
- 出处: SELF-update 260925/phase1.5-speaker-attribution-patch.md:414,519-520
- 错误做法: 写入侧两个看起来都对的候选：写 `msg.text`，或写 `modelText` 整段。
- 症状: 写 `msg.text` → **引用行丢失**；写 `modelText` 整段 → **双前缀**（`[小明]: [群聊发送者：小明 (10001)]\n…`）。
- 根因: `modelText` 里同时含"发送者前缀"和"引用行/触发提示行"，两者对正文的归属不同（前缀是元数据、引用行是正文语义），一刀切都会错。
- 正确做法: 群聊写 `stripSpeakerPrefix(modelText)` —— 只砍发送者前缀，保留引用行（见 phase2 §21.11.2 的 lookahead 实现）。
- 类型: 架构与实现
- 等级: L

### R16
- 出处: SELF-update 260925/phase1.5-speaker-attribution-patch.md:624
- 错误做法: 顺手"整理"截断算术，改 `MAX_FILE_LINES + 1` 与 `slice` 的写法。
- 症状: 既有测试 `history-log.test.ts:84-97` 断言截断后最老是 `msg50`、最新是 `msg249`（即刚好保留 200 条），改算术会让它红。
- 根因: 截断公式里的 `+1` 是实现细节与测试断言的隐式契约，不属于"可读性优化"范围。
- 正确做法: 明确标注"不要动 `MAX_FILE_LINES + 1` 和 `slice` 的写法"；要动就先改测试并说明语义变化。
- 类型: 命令与脚本
- 等级: L

### R17
- 出处: SELF-update 260925/phase1.5-speaker-attribution-patch.md:687
- 错误做法: 把"旁听块不再与滑窗重复"引起的既有断言变化当成回归去修。
- 症状: 若干既有测试因行为变更而失败，容易被误判为"补丁写坏了"。
- 根因: 验收体系里没有区分"回归"与"有意的行为变更"，两者都表现为测试变红。
- 正确做法: 在文档中显式登记"这是**有意的行为变更**（缺陷 D3 的修复），不是回归"，并在施工清单里单独列出"必须更新（会因行为变更而失败）"的测试清单（本文件 §4.1）。
- 类型: 流程纪律
- 等级: H

### R18
- 出处: SELF-update 260925/phase1.5-speaker-attribution-patch.md:797
- 错误做法: 只扩展了 `history-log.test.ts:20-28` 的 `beforeEach` 清理 `channels/history`，没清 `channels/archive`。
- 症状: 归档相关用例之间互相污染（上一个用例留下的归档文件被下一个用例读到）。
- 根因: 新增了一个持久化目录（温层归档），但测试夹具的清理清单没有同步扩展——夹具的生命周期与产物的生命周期脱钩。
- 正确做法: 每新增一个落盘目录，就在同一批次里把它加进所有相关套件的清理夹具；更稳的做法是夹具按"整个渠道数据根目录"清理。
- 类型: 验证方法
- 等级: L

### R19
- 出处: SELF-update 260925/phase1.5-speaker-attribution-patch.md:67
- 错误做法: `history-log.test.ts:199` 的测试数据写成 `[群聊发送者：王五](@昔涟)\n在吗` —— 生产代码从不产生的格式。
- 症状: **测试绿了但路径是死的**：正则的捕获组永远走不到，缺陷 D2 在测试里被"证明"不存在。
- 根因: 测试数据由人手写，来源是文档示例而非"真实链路产物"；测试断言的是"我写的输入能被解析"，不是"生产会写的输入能被解析"。
- 正确做法: 非法/格式类测试的输入必须从真实链路抓取（跑一次渠道消息，把 jsonl 原样粘进 fixture），或由生产函数生成（用 `formatChannelUserText` 造输入而不是手写）。
- 类型: 验证方法
- 等级: H

---

## 三、phase1-manual-verification.md（手工验证清单，C 组）

### R20
- 出处: SELF-update 260925/phase1-manual-verification.md:244-252
- 错误做法: 验证时发现 transcript 文件找不到，未先排查前置条件。
- 症状: `<userData>/channels/history/` 下没有群对应文件。
- 根因: 两个前置条件没满足——群不在 `allowedGroupIds` 白名单里；或配置改了但**没重启**昔涟（配置读取在启动期）。
- 正确做法: ① 检查 `channels-settings.json` 的 `qq.allowedGroupIds`；② 重启昔涟；③ 在群里发一条**不 @** 的消息，再去 `channels/history/` 找最新修改的文件。
- 类型: 环境
- 等级: L

### R21
- 出处: SELF-update 260925/phase1-manual-verification.md:254-263
- 错误做法: B 问"你知道吗"时昔涟答不上，直接怀疑模型能力。
- 症状: 昔涟看不到 A 的上下文。
- 根因: 三种可排查原因——A 的消息 `triggered: false` 没写进 transcript；`buildGroupContextBlock` 没被调用；取的条数太少（默认 10 条）导致 A 被挤出窗口。
- 正确做法: ① 打开 transcript 确认 A 的行在里面且 `triggered: false`；② 控制台搜 `【群聊近期上下文】` 看有没有 A；③ 日志里有但模型仍答不上，才考虑"模型理解问题"。按"数据 → 注入 → 模型"三层顺序定位。
- 类型: 验证方法
- 等级: H

### R22
- 出处: SELF-update 260925/phase1-manual-verification.md:265-273
- 错误做法: `buildGroupContextBlock` 调用了不存在的函数。
- 症状: 控制台报 `Cannot read property 'loadRecent' of undefined`。
- 根因: `orchestrator/index.ts` 的 import 与实际导出不匹配（`history-log.ts` 未导出该函数，或 import 名写错）。
- 正确做法: 检查 import：`import { loadRecentHistory, buildGroupContextBlock } from "../channels/history-log";` 并确认 `history-log.ts` 真的导出了这个函数（导入即断言的接口）。
- 类型: 命令与脚本
- 等级: H

### R23
- 出处: SELF-update 260925/phase1-manual-verification.md:275-278
- 错误做法: 把上下文块注入到滑动窗口（`recentMessages`）。
- 症状: 昔涟每次回复都重复说"以下是本群最近的消息"，形成循环引用。
- 根因: 上下文块进滑窗后，模型的输出又成为滑窗内容，于是"上一轮的注入"被当成"用户刚说的话"被复述。
- 正确做法: 上下文块**只注入 always-on context，不进滑窗**。清单明确写"当前不应该发生；如果出现了，说明代码有 bug"。
- 类型: 架构与实现
- 等级: M

### R24
- 出处: SELF-update 260925/phase1-manual-verification.md:104-105
- 错误做法: 把"昔涟没看到 A 的上下文"当成不可判定。
- 症状: 回答是"你想知道什么？"或"我不太明白你的意思"。
- 根因: 缺少"失败长什么样"的显式反例样本，验证者只能凭感觉判断。
- 正确做法: 在验收清单里直接写出 ❌ 反例应答（这两句），把"答不上"变成可判定的字符串特征。
- 类型: 验证方法
- 等级: H

### R25
- 出处: SELF-update 260925/phase1-manual-verification.md:319-323
- 错误做法: 收集配置文件时直接 `cat channels-settings.json` 并原样粘贴进问题报告。
- 症状: 报告里带出 QQ 号、token 等敏感信息。
- 根因: 排查素材与敏感数据同处一个文件，收集流程没有脱敏步骤。
- 正确做法: 复制内容时**敏感信息可打码**（清单原文即要求），并固定"日志收集"四件套：transcript 最后 20 行 + 控制台 50 行 + 脱敏配置 + 复现步骤。
- 类型: 流程纪律
- 等级: H

### R26
- 出处: SELF-update 260925/phase1-manual-verification.md:282-291
- 错误做法: 环境准备写"至少有两个测试账号（A 和 B）在群里"（:9）与"改配置后需要重启"（:25），但验收标准只写"所有场景通过 = Phase 1 交付完成"。
- 症状: 其中场景 6（旧格式兼容）依赖真实老数据样本；该样本后来被 schema 闸门清空（phase3-p1:616-641），于是这条验收**永久无法在真实数据上复核**，只能退回单元测试（phase3-p1:612-614）。同类缺口延续到 P2/P3：phase3-p2:727/877 的 §5.2 手工验证长期停在"⬜ 待做（需真实 QQ 号）"。
- 根因: 验收清单把"需要真实账号/真实老数据"写成前置条件，却没有为"前置条件不满足时该验收如何降级"定规则，也没有在环境变化时重新取得样本。
- 正确做法: 每条手工验收都标注它的样本依赖，并在施工前**把样本备份出去**（P1 的教训原文："做 transcript 相关手工验证前，先备份 `channels/`"）；无法取得真实样本时，明确写成"由单元测试覆盖"并降低该条的结论强度。
- 类型: 流程纪律
- 等级: H

---

## 四、phase2-zones-and-memory-isolation.md（区块系统与记忆隔离，D 组）

### R27
- 出处: SELF-update 260925/phase2-zones-and-memory-isolation.md:1740
- 错误做法: 蓝图要求 `resolveScopeId` 里桌面会话查 `findZoneByConversationId`，为桌面对话持久化成区成员。
- 症状: 桌面会话若被写进成员表，删除/重建桌面对话后会留下悬空引用。
- 根因: 桌面隐式属于 root，把它物化成"成员记录"会引入一个本不需要维护的引用关系。
- 正确做法: 桌面**直接返回 `zone:root`**，不做成员存储（采纳蓝图 §10.5「简化实现」），从数据模型上消除悬空引用的可能。
- 类型: 架构与实现
- 等级: L

### R28
- 出处: SELF-update 260925/phase2-zones-and-memory-isolation.md:1741
- 错误做法: `l2-dmae-manager.getActiveL2ForPrompt` 加 scope 只用于 key 拼接。
- 症状: key 前缀拼接对"防漏"没有实际作用（该管理器内部本来就按 `l2Id` 索引）。
- 根因: 把"标识"当成"隔离"，隔离必须体现为一次真实的过滤/断言。
- 正确做法: 改成防御性过滤 `l2.scope === scopeId`，让越域数据在出口处被挡住。
- 类型: 架构与实现
- 等级: H

### R29
- 出处: SELF-update 260925/phase2-zones-and-memory-isolation.md:1742
- 错误做法: schema 闸门返回 `"aborted"` 后，调用方按普通错误抛出。
- 症状: 用户只是想"退出应用"，却看到"Cyrene 启动失败"红框——把用户的主动选择渲染成故障。
- 根因: "受控退出"与"启动失败"共用同一个错误通道，UI 无法区分二者。
- 正确做法: 闸门抛 `StartupAbortedError`（`code = E_STARTUP_ABORTED`），`application.ts` 识别哨兵后**跳过错误框**直接受控退出。
- 类型: 架构与实现
- 等级: L

### R30
- 出处: SELF-update 260925/phase2-zones-and-memory-isolation.md:1743
- 错误做法: 假定 `ZoneStore` 一定能落盘。
- 症状: 取不到 userData 时（测试环境 / Electron 未就绪）写盘会失败或抛错。
- 根因: 把"运行环境必然具备某能力"当成前提，而单测与启动早期阶段恰恰不满足。
- 正确做法: `zonesFilePath()` 取不到 userData 时返回 `null`，store 退化为纯内存；与 `memory-trace.ts` 的既有约定保持一致，同时让不 mock Electron 的单测可用。
- 类型: 架构与实现
- 等级: L

### R31
- 出处: SELF-update 260925/phase2-zones-and-memory-isolation.md:1744
- 错误做法: 蓝图把 `addExternalMember` 写成"先移出旧成员、再校验 root 上限"。
- 症状: 校验失败时旧成员已经被移出 → 内存与磁盘不一致（成员被静默挤掉）。
- 根因: 校验与副作用顺序错误：非幂等的写操作必须排在所有可能失败的检查之后。
- 正确做法: **先校验后移出**；同区块重复加入做成幂等 no-op。
- 类型: 架构与实现
- 等级: H

### R32
- 出处: SELF-update 260925/phase2-zones-and-memory-isolation.md:1745
- 错误做法: `MEMORY_TARGETS` 删除 `memory-trace.log`。
- 症状: 清空后测试若断言"该文件不存在"会红——文件仍在。
- 根因: 删除动作本身需要留审计，于是删完立刻又写了一条 `memory.deleteAll`。
- 正确做法: 明确登记为**有意行为**并在测试注释里写明"该文件在删除后仍存在"，避免后人把它当缺陷反复修。
- 类型: 文档与判据
- 等级: H

### R33
- 出处: SELF-update 260925/phase2-zones-and-memory-isolation.md:1746
- 错误做法: `deleteAllMemory()` 写死无参。
- 症状: ESM 下无法 `vi.spyOn(fs, ...)`，删除路径无法确定性测试。
- 根因: 依赖直接 import 而不是注入，于是测试只能靠全局 mock（ESM 下不可行）。
- 正确做法: 增加可选 `DeleteAllMemoryDeps { userDataDir?, remove? }` 作为确定性测试注入点。
- 类型: 验证方法
- 等级: H

### R34
- 出处: SELF-update 260925/phase2-zones-and-memory-isolation.md:232
- 错误做法: 直接读 `dialog.showMessageBoxSync(...)` 的返回值为 `number`。
- 症状: 在新版 Electron 下返回值是 `{ response: number }`，直接比较数字会走错分支。
- 根因: Electron 各版本该 API 返回类型不统一，而类型声明不足以暴露运行期差异。
- 正确做法: 用 `typeof result === "number" ? result : result.response` 兼容两种形态。
- 类型: 环境
- 等级: L

### R35
- 出处: SELF-update 260925/phase2-zones-and-memory-isolation.md:1752
- 错误做法: `memory-compressor.compressMemories()` 在**全局 L2** 上做聚类。
- 症状: 群聊记忆与桌面记忆被合并成同一条总结，且总结**不带 scope** → 既串味，又从此召回不到。
- 根因: 聚类的候选集没有按域分桶；而"总结不带 scope"让它在分域读取下变成不可见数据。
- 正确做法: 先按 `scope` 分桶再聚类；总结继承 `group[0].l2.scope`。
- 类型: 架构与实现
- 等级: L

### R36
- 出处: SELF-update 260925/phase2-zones-and-memory-isolation.md:1753
- 错误做法: `memory-compression-transaction.ts` 未传递 scope。
- 症状: 事务落盘的总结没有域信息，与 R35 同症状。
- 根因: 新增的隔离维度没有穿透到"事务/接口"这一层，调用链中间层成为丢参点。
- 正确做法: `CompressionTransactionInput.scope` + `createSummary(scope)` + `addSummaryVector(..., scope)` 三处一起加。
- 类型: 架构与实现
- 等级: H

### R37
- 出处: SELF-update 260925/phase2-zones-and-memory-isolation.md:1754
- 错误做法: `memory-store.applyConflictResolution` 消解产生的新 L2 不带 scope。
- 症状: 冲突消解后的记忆成为"无域条目"，从域过滤视角消失。
- 根因: 派生数据的域归属没有被显式继承；冲突双方的域在同一检测批次里其实已知。
- 正确做法: 继承冲突双方的 scope（冲突检测已限域，两者必然同域）。
- 类型: 架构与实现
- 等级: H

### R38
- 出处: SELF-update 260925/phase2-zones-and-memory-isolation.md:1755
- 错误做法: `obsidian-importer.ts` 回流后重建向量时丢掉 `metadata.scope`。
- 症状: 该条记忆从此对域过滤不可见（"回流即失踪"）。
- 根因: 向量重建走的是"新建"路径，只带内容不带元数据。
- 正确做法: 沿用 `existing.scope`；凡"重建"都必须视为"搬迁"，元数据要一起搬。
- 类型: 架构与实现
- 等级: H

### R39
- 出处: SELF-update 260925/phase2-zones-and-memory-isolation.md:1756
- 错误做法: 蓝图 §8 的读取点清单**未列出** `tool-registry.ts` 的 `user_memory` / `read_memory` / `write_memory` 三个工具。
- 症状: 这三个工具直接读写记忆，却不在"按域隔离"的改动清单里 → 域隔离在这条路径上完全失效（而这正是后来 P2 认定的串记忆主战场，phase3-person-memory-overview.md:519-537）。
- 根因: 隔离清单按"文件/模块"枚举，而真正的隔离面是"所有读写记忆的入口"；工具层被当成"上层"漏掉了。
- 正确做法: 三者都按 `ctx.conversationId` 解析域：读只读本域、写给候选钉上域。
- 类型: 文档与判据
- 等级: L

### R40
- 出处: SELF-update 260925/phase2-zones-and-memory-isolation.md:1758-1762
- 错误做法: 蓝图 §8.5 / §18.2 把「`recall_history` 的 execute 能否拿到 `conversationId`」列为最大不确定点，并预留了"若拿不到就退化为不过滤"的退路。
- 症状: 若按退路实现，域隔离会在 `recall_history` 上静默失效。
- 根因: 不确定点没有在写方案前查证，而是留到施工时；退路本身是"静默失效"的合法化。
- 正确做法: **实现前先查 `tool-registry` 的 execute 签名**：`ToolContext`（`tool-context.ts`）已含 `conversationId`，`harness/adapter/tool-runtime.ts:67` 用 `options.conversationId ?? "default"` 构造 → 四个工具全部接入域过滤，**没有退化为"不过滤"**。
- 类型: 流程纪律
- 等级: H

### R41
- 出处: SELF-update 260925/phase2-zones-and-memory-isolation.md:1780
- 错误做法: 蓝图假定 `index.html` 里的 `data-i18n` 短 key 会生效。
- 症状: 实际**不生效**——界面靠 HTML 里的中文硬编码兜底，英文/多语言切换在该窗口无效。
- 根因: `applyTranslations` 全仓无任何调用点，`data-i18n` 属性没有任何运行时消费者。
- 正确做法: 静态骨架直接写中文；动态文本用 TS 侧 `t("settings.…")` 赋值；`data-i18n` 与资源文件两套都补齐（短 key 给 HTML、`settings.` 前缀给 `t()`），并知悉 `data-i18n` 当前是死属性。
- 类型: 架构与实现
- 等级: L

### R42
- 出处: SELF-update 260925/phase2-zones-and-memory-isolation.md:1779
- 错误做法: 蓝图要求成员选择器同时列出 `externalChats` + `conversations`（桌面对话）。
- 症状: 与「`kind:"desktop"` 只属于 root」的契约冲突：桌面对话若可被选进自定义区块，就等于绕过 root 归属。
- 根因: UI 清单与"域归属不变量"没有对齐；可选项集合必须由不变量约束，而不是"能列就列"。
- 正确做法: **只列 `externalChats`**；桌面对话在 root 卡片只读展示。
- 类型: 架构与实现
- 等级: L

### R43
- 出处: SELF-update 260925/phase2-zones-and-memory-isolation.md:1781
- 错误做法: 预期"渲染进程保存配置时会清空 `allowedGroupIds`"（蓝图 §12.3 的迁移动作）。
- 症状: 实际**不清空**：渲染进程保存时**不带该字段**，而主进程 `saveChannelsSettings` 是**子对象合并** → 旧值原样保留。
- 根因: "保存"的语义是合并而非替换；未出现的字段不会被删掉。
- 正确做法: 接受"保留字段 + UI 引导迁移"，并在 UI 上单独提供"清空旧白名单"按钮；接受不了就显式写 `allowedGroupIds: []`。用户若确定要清，手工改 `channels-settings.json`。
- 类型: 架构与实现
- 等级: M

### R44
- 出处: SELF-update 260925/phase2-zones-and-memory-isolation.md:1782
- 错误做法: 让渲染进程与主进程共用同一套"空输入归一化"逻辑。
- 症状: 用户清空输入框后值莫名变成 3（主进程 `Number("") === 0` → 夹到最小值 3）。
- 根因: 渲染侧的"空输入"语义是"用户还没输"，主进程的"0"语义是"非法小值"，两者不该走同一条夹取规则。
- 正确做法: **有意差一处**：渲染侧空输入回落默认值 10，主进程保持夹到 3，并在文档里登记这处"有意不一致"（否则后人会来"统一"它）。
- 类型: 文档与判据
- 等级: H

### R45
- 出处: SELF-update 260925/phase2-zones-and-memory-isolation.md:1777
- 错误做法: 为实现"跨面板跳转"（channels → zones）直接 `import settings.ts`。
- 症状: 循环依赖（orchestrator ↔ settings 类的环在渲染侧复现）。
- 根因: 面板之间通过顶层入口互相引用，必然成环。
- 正确做法: 新增 `settings/shared/section-nav.ts` 作为跳转钩子；循环依赖风险在蓝图 §15 里已列出，缓解写的是"采用注入式，不 import settings"。
- 类型: 架构与实现
- 等级: L

### R46
- 出处: SELF-update 260925/phase2-zones-and-memory-isolation.md:1806-1817
- 错误做法: `showInputModal` 不传 `icon` 时执行 `iconEl.textContent = <svg …>…</svg>`（把默认图标这段 HTML 用 `textContent` 写进 DOM）。
- 症状: 整段标记被当普通文字渲染，从弹窗左上角铺满整个面板（用户截图里的"乱码"）。「新建区块」「重命名区块」都中招；`showModal` / `showHtmlModal` 用 `innerHTML` 所以没事。
- 根因: 同一个"设置图标"的语义在三个弹窗里实现不一致（`textContent` vs `innerHTML`），而默认值是 SVG 字符串。
- 正确做法: 新增 `applyModalIcon(el, icon, fallback)` —— 以 `<` 开头的值走 `innerHTML`（项目内固定 SVG 片段），否则走 `textContent`（emoji / 用户可控文本，不做 HTML 解析）；默认图标提成常量 `DEFAULT_INPUT_MODAL_ICON`；并加守卫用例断言"不传 icon 时渲染出 `<svg>` 元素、且可见文字不含 `<svg`"。
- 类型: 架构与实现
- 等级: L

### R47
- 出处: SELF-update 260925/phase2-zones-and-memory-isolation.md:1819-1829
- 错误做法: 群白名单并入区块时移除了「连接手机」里的群号输入框，却没补新入口；成员选择器的数据源 `channels/context-bindings.json` 的 `externalChats` **只含已产生过对话的会话**。
- 症状: "想给一个从没跟昔涟说过话的新群加白"在 UI 上**无路可走**（旧输入框没了，选择器里也没有）——把入口删掉却没补上新入口。
- 根因: 数据源被当成"全集"使用，而它其实是"历史观测集"；UI 的可选集合与业务上的可配置集合不等价。
- 正确做法: 区块卡片新增「**手动加群**」→ 选渠道 → 填群标识（新 IPC `zones:add-manual-group`）；**sessionId 由主进程用 `makeSessionId(channel, chatId)` 现算，不接受渲染进程传入**，否则会出现"加白了但记忆是另一个域"。
- 类型: 架构与实现
- 等级: L

### R48
- 出处: SELF-update 260925/phase2-zones-and-memory-isolation.md:1831-1833
- 错误做法: 手动加群对 `qqbot` 渠道接受纯数字群号。
- 症状: 填群号**不报错但永远匹配不上任何群**（官方机器人只认 openid）——等于写死配置、无法排查。
- 根因: 校验只做了"格式合法性"，没做"该渠道的语义可匹配性"。
- 正确做法: `qq` 认 5~12 位群号；`qqbot` 认群 openid 并**显式拒绝**群号形态的纯数字串；只开放 `qq` / `qqbot`（微信与飞书没有群白名单概念，列进来会给出"加了就能用"的错误暗示）；校验规则放 `src/shared/zone-group.ts`，渲染与主进程共用一份。
- 类型: 架构与实现
- 等级: L

### R49
- 出处: SELF-update 260925/phase2-zones-and-memory-isolation.md:1839-1840
- 错误做法: 群策略接线写在 `handleEvent` 私有方法里，测试碰不到。
- 症状: **白名单断链也不会有任何测试报警**（改了配置但放行判定没生效，全绿）。
- 根因: 关键判定逻辑藏在不可达的私有作用域内，测试无法覆盖 → 覆盖盲区不是"忘了写用例"，而是"写不出来"。
- 正确做法: 把两个 adapter 里内联的群策略对象提成 `qqGroupPolicyOptions()` / `qqBotGroupPolicyOptions()`，并新增 `zone-whitelist-wiring.test.ts` 把「手动加群 IPC → zones.json 成员 → adapter 放行判定」整条链路串起来断言。
- 类型: 验证方法
- 等级: H

### R50
- 出处: SELF-update 260925/phase2-zones-and-memory-isolation.md:1897-1901
- 错误做法: 清空记忆后**重启并立刻查 `memory.json`** 是否被重建，据此判断清空是否成功。
- 症状: 清空后启动 57 秒时该文件**仍不存在** → 得到"清空失败"的假结论。
- 根因: `memory.json` 是**懒创建**的，直到 `memoryStore.load()` 第一次被调用（本次为 01:13:06）才落盘；"文件不存在"在此处是正常态。
- 正确做法: 等 `memory-trace.log` 出现 `store.init` 再看文件（蓝图原文的判定标准会误判，这里做了口径修正）。
- 类型: 验证方法
- 等级: M

### R51
- 出处: SELF-update 260925/phase2-zones-and-memory-isolation.md:1902-1904
- 错误做法: 把"`rag-data/memory-store.json` 不存在"当成文件缺失/清空失败。
- 症状: 清空后 `rag-data/` 只剩一个空目录。
- 根因: `JsonVectorStore.save()` 只在写操作里被调用，`memory-store.json` 要等第一条向量写入才生成。
- 正确做法: 认定"空目录 + 无 `memory-store.json`"是清空后的**正常稳态**，不是缺陷。
- 类型: 验证方法
- 等级: M

### R52
- 出处: SELF-update 260925/phase2-zones-and-memory-isolation.md:1928-1929
- 错误做法: 在设置框里输入 `groupContextLimit` 后不回车、不切焦点，就去检查是否落盘。
- 症状: `app-settings.json` 里**根本没有** `groupContextLimit` 这个键，用的是默认值 10 → 误判"设置没生效"。
- 根因: 设置入口是 `change` 事件保存，`change` 只在回车/失焦时触发。
- 正确做法: 输入后必须回车或切走焦点；验证前先看 `app-settings.json` 的 mtime 与键是否存在（本清单用 mtime 01:21:51 / 01:28:39 作为落盘证据）。
- 类型: 环境
- 等级: L

### R53
- 出处: SELF-update 260925/phase2-zones-and-memory-isolation.md:1926-1927
- 错误做法: 用"@ 昔涟"的消息去攒群上下文样本。
- 症状: 旁听条数攒不起来，验证"群上下文条数"失败。
- 根因: `buildGroupContextBlock` 只统计 `observedOnly`（**没 @ 昔涟的旁听消息**）；触发轮不进这个块。
- 正确做法: 喂数据必须发**普通消息**（不 @、不命中触发词），并注意"@ 触发只攒不出旁听"。
- 类型: 验证方法
- 等级: L

### R54
- 出处: SELF-update 260925/phase2-zones-and-memory-isolation.md:1931-1949
- 错误做法: `relationship-log.recordTurn()`（:190-195）把当天**所有域**的 entries 汇总成一条、并按 `date` **覆盖写**进 `data.dailySummaries`（全局每天只有一条）；`buildContext(scopeId)`（:216-220）虽过滤了 `entries`，取摘要时却**只按日期匹配**：`find(s => s.date === scoped.at(-1).date)`。
- 症状: 🔴 **跨域穿透已实证**：01:29:38 在**桌面**说「我最近在学做菜」→ 01:32:50 群 X 那轮注入的 `【近期关系线索】/最近日记摘要` 里出现 `下次回应提示：延续最近话题「我最近在学做菜」`——这句话在群里从未出现过。反向也成立：当天最后写入的那个域决定了所有域看到的摘要。
- 根因: 存储结构是"按日期"一维的，而读取需要一个"按域"的维度；过滤写在 `entries` 上、摘要写在另一个结构上，两者不同源。
- 正确做法: `dailySummaries` 改按 `(scope, date)` 归属；`buildContext` 查自己域的那一条；`nextCareCue` 的 `join("；")` 限定在域内；legacy 兼容只允许"本域无摘要时回退到同日无 scope 摘要"这一种回退，**绝不拿别域的顶替**。并走"先写回归测试 → 确认旧代码上失败 → 再改实现"。
- 类型: 架构与实现
- 等级: L

### R55
- 出处: SELF-update 260925/phase2-zones-and-memory-isolation.md:1956-1958
- 错误做法: 把 `nextCareCue` 的"多域话题混在一起"记成"cue 在跨域累积"，准备单独修 `cues` 的累积逻辑。
- 症状: 修 `dailySummaries` 之后该现象**自动消失**——说明根因判断错了。
- 根因: `cues` 取自 `recent`，而 `recent` 一直是按域过滤的 `scoped.slice(-8)`；真正串味的是同一段输出里的「最近日记摘要」那一行。
- 正确做法: 归因时先确认每个输出的数据来源（此处两行来自不同结构），不要在没定位到"哪一行带进来的"之前就改代码。
- 类型: 验证方法
- 等级: H

### R56
- 出处: SELF-update 260925/phase2-zones-and-memory-isolation.md:1965-1985
- 错误做法: judge 的三条失败路径全部只写 `console`、不落盘。三条路径在磁盘上**完全同形**：① LLM 调用失败被 `catch` 兜底；② LLM 正常返回 `candidates: []`；③ 候选被 `postFilterCandidates` 全过滤。
- 症状: 手工验证卡在这里最久：`roundCount` 到 6（judge 触发点）、`l1.update` 一次不落，但 `memory.json` 的 `l2` 仍是 0、`entity-graph.json` 也一直没生成。**事后与线上都无法复盘"到底跑没跑、为什么没写"**。
- 根因: 可观测性缺口不在"日志级别"，而在"三条语义不同的路径产生了相同的磁盘痕迹"，`memory-trace.log` 里根本没有 judge 环节的事件。
- 正确做法: `judgeRecentTurns` 新增三个 trace 事件 `judge.run`（带轮数）/ `judge.result`（原始候选数、过滤后保留数、实体数、各候选 layer）/ `judge.error`（失败原因，含 missing api key 分支）。另注意：`entity-graph.json` 只在 **entities 非空**时才落盘，所以"该文件不存在"**不能**当作"judge 没跑"的证据。
- 类型: 验证方法
- 等级: H

### R57
- 出处: SELF-update 260925/phase2-zones-and-memory-isolation.md:1987-2009
- 错误做法: 判定"judge 判定失败"是区块/作用域逻辑引入的回归。
- 症状: `memory-trace.log` 抓到 `{"op":"judge.error", … "error":"Memory LLM [judge] protocol error: structured output failed: REPAIR_EXHAUSTED (stage: memory_judge)"}`；终端同步打印 `perAttempt=60000ms totalBudget=120000ms maxAttempts=2`。
- 根因: judge **确实跑了**，是 LLM 结构化输出两次修复都失败；属模型端点对 judge 复杂 schema（candidates/entities/slug/sourceQuote 多层嵌套）的协议兼容问题。
- 正确做法: 定性为"**非 Phase 2 问题**"，换模型或降 schema 复杂度才可能过；不要为了让它变绿去改区块逻辑。
- 类型: 文档与判据
- 等级: M

### R58
- 出处: SELF-update 260925/phase2-zones-and-memory-isolation.md:2011-2042
- 错误做法: 看到每轮都打印 `RAG not initialized` / `reconciliation skipped: vector store is not writable` / `StickerEmbedding Model not found` 就当成回归。
- 症状: `searchMemoryEntries` 返回 `[]`、L2 全部 `syncStatus=sync_failed`、`ragId` 为空、`rag-data/memory-store.json` 永不生成。
- 根因: `models` 是空目录（只有 `.gitignore`/`.gitkeep`），`getEmbeddingProvider()` 返回 null → `initRAG()` 里 `provider = null`，而 `addMemory` / `addL2MemoryVector` 第一行就是 `if (!store || !provider) throw ...`。**dev 环境的既定状态，不是引入的回归**（Phase 1 时期日志里还记过 `Provider: local-bge-m3 Dims: 1024`，模型后来被清掉了）。
- 正确做法: 记录为"环境说明（非缺陷）"，并明确它对结论的影响：向量召回路径不可用，因此跨域隔离只能通过 **L2 注入路径**验证；§8.4（`rag/index.ts` 按 scope 过滤）覆盖不到，只能靠单测 `rag/scope-filter.test.ts`。
- 类型: 环境
- 等级: L

### R59
- 出处: SELF-update 260925/phase2-zones-and-memory-isolation.md:2044-2049
- 错误做法: 依赖 `logs/cyrene.log` 作为排查依据。
- 症状: 该文件共 36 行，最后一条是 `01:08:40 ERROR Runtime fatal startup error: memory schema upgrade aborted by user`；此后 01:11、01:44 两次正常启动 + 十余轮渠道运行**都没写进这个文件**，而 `memory-trace.log` 正常追加。
- 根因: 应用主日志在某个时间点**静默停止落盘**（与 R56 同类的可观测性缺口），但表现是"看起来一切正常"。
- 正确做法: 记录为待查项并降级对它的依赖——排查改看 dev 终端与 `memory-trace.log`（后者不落盘的场景没有被观测到）。
- 类型: 环境
- 等级: L

### R60
- 出处: SELF-update 260925/phase2-zones-and-memory-isolation.md:2051-2072
- 错误做法: `stripSpeakerPrefix` 写成 `/^\[群聊发送者：[^\]\n]+\]\n?/`，用 `[^\]\n]+` 匹配昵称。
- 症状: 对 `[群聊发送者：[b°t]BEIKIA (2914636187)]\n111`，`[^\]\n]+` 贪婪吃到 `[b°t` 撞上昵称**内部**的 `]`，pattern 里的 `\]` 正好匹配了那个内部 `]` → 只剥掉 `[群聊发送者：[b°t]`，剩下 `BEIKIA (2914636187)]\n111`（实测逐字节落在 `channels/history/channel_qq_9cdd5e32b57efa9e.jsonl`）。影响两条路径：滑窗里模型收到括号残缺的碎片；绑定桌面会话场景**发送者信息全丢**。**已污染下游**：`memory.json` 里两条 L2 的 `triggerText` 就是这个残缺前缀。
- 根因: 正则用"第一个 `]`"当分隔符，而昵称本身可以含 `]`；终止符没有锚定到"行尾 / `(数字)` 之前"这一结构性位置。
- 正确做法: 见 R63 的 lookahead 实现；两个文件（`channel-context.ts:124` 与 `history-log.ts:64` 的 `LEGACY_SPEAKER_PREFIX`）都要镜像修改。
- 类型: 架构与实现
- 等级: L

### R61
- 出处: SELF-update 260925/phase2-zones-and-memory-isolation.md:2074-2076
- 错误做法: 断言写成 `expect(content).not.toContain("[群聊发送者：")`（`channel-context.test.ts:202,234` 与 `history-log.test.ts:481`）。
- 症状: **部分剥离也能通过**——中文头确实没了，残片还在，测试全绿。且没有任何测试用带 `]` 的昵称。
- 根因: 负向断言只能证明"某个子串不在"，不能证明"正文完整"；判据强度低于被保护的契约。
- 正确做法: 改成对完整正文的**等值断言**（`content === "111"`），并补一条 `senderName = "[b°t]BEIKIA"` 的用例。
- 类型: 验证方法
- 等级: H

### R62
- 出处: SELF-update 260925/phase2-zones-and-memory-isolation.md:2091-2092
- 错误做法: §21.10 原提案的修法是"贪婪 `[^\n]*`"`：`return text.replace(/^\[群聊发送者：[^\n]*\]\n?/, "")`。
- 症状: 文档自己回头标注：**"上面这个贪婪 `[^\n]*` 的修法实测是错的，不要照抄"** —— 对**无换行的旧记录**（`[群聊发送者：小明 (10001)]你好[图]`）会一路吞到最后一个 `]`，把用户正文吃掉。
- 根因: 贪婪匹配在"有换行的新格式"上恰好正确、在"无换行的旧格式"上错误；单一用例通过就写进文档，等于把陷阱传给下一个人。
- 正确做法: 在文档里**显式标注该提案已失效**并指向新方案（R63），而不是静默改掉——失效提案留在正文里比删掉更有价值，因为它记录了"为什么不能那么写"。
- 类型: 文档与判据
- 等级: L

### R63
- 出处: SELF-update 260925/phase2-zones-and-memory-isolation.md:2140-2163
- 错误做法: 依次尝试 `[^\]\n]+`（旧）、`[^\n]{0,300}?`（惰性有界）、`[^\n]*`（贪婪）。
- 症状: 旧版在昵称内部的 `]` 收尾；**惰性有界"照样错"**——正则引擎优先取**最早**的 `]`，惰性只是"在能满足 pattern 的前提下取最短"，昵称内部那个 `]` 正好能满足；贪婪版能过当前用例但吃掉无换行旧记录的正文。
- 根因: "惰性/贪婪"只调节匹配长度偏好，不改变"候选起点"；问题的本质是**终止符的位置需要结构性锚点**，而不是长度策略。
- 正确做法: 用 lookahead 把分隔 `]` 锚定成"行尾 / `(数字)` 之前"：`/^\[群聊发送者：[^\n]{0,300}?\](?=\n|$|\(\d{1,32}\))\n?/`；读取侧再加 `\(@昔涟\)|\(触发词\)` 两个锚点以把提示行收进结构化字段。两条路径的 lookahead **故意不同**（写入侧只剥发送者行、保留关键词提示行进正文；读取侧把提示行结构化掉），并用 11 组真实格式（多括号昵称、无 QQ 号、legacy `(@昔涟)`/`(触发词)`、带引用、命中触发词）验证 span。
- 类型: 命令与脚本
- 等级: L

### R64
- 出处: SELF-update 260925/phase2-zones-and-memory-isolation.md:2099,2165,2176
- 错误做法: 直接改实现，改完再补测试。
- 症状: 无法确认"新用例测的是不是原来那个缺陷"——改完之后测试全绿，但绿色可能来自实现已变而用例本来就抓不到。
- 根因: 缺少"用例必须先在旧代码上失败"这一步，回归测试的有效性未被证明。
- 正确做法: 两处修复都走"**先写回归测试 → 确认在旧代码上必须失败 → 再改实现**"。实测记录：改动前 3 条新用例失败，失败输出逐字复现了残留碎片（`"BEIKIA (2914636187)]\n引用 小红：前一条\n你好"`、`speakerName = "[b°t"`、`expected length 2 but got 1`）；改动后相关 7 个测试文件 148 通过。
- 类型: 验证方法
- 等级: H

### R65
- 出处: SELF-update 260925/phase2-zones-and-memory-isolation.md:2201-2202
- 错误做法: 复验时把群 X 和群 Y 放进**同一个区块**。
- 症状: 验证退化成"同区块共享"而不是"跨域隔离"——**§21.11 之前已经误判过一次**。
- 根因: 实验分组没有区分"同域内共享"与"跨域不串"这两个待证命题；同域放置让两组的预期输出无法区分。
- 正确做法: 群 X **故意留在 solo**（`solo:channel:qq:…`），群 Y 放区块「1」，桌面为 `zone:root`——三个域两两不同；顺带证明 `solo:…` → `zone:root` 与 `solo:…` → `zone:<其他区块>` 两个方向都不串。
- 类型: 验证方法
- 等级: L

### R66
- 出处: SELF-update 260925/phase2-zones-and-memory-isolation.md:2266-2272
- 错误做法: 看到 `relationship-log.json` 的 `entries[].userText` 带 `[群聊发送者：…]` 前缀，就判定"前缀剥离没生效"。
- 症状: 同一个系统里 `channels/history` 的 `content` 无前缀、而关系日志的 `userText` 有前缀 → 看起来像两条路径不一致的 bug。
- 根因: 二者契约不同：关系日志存的是 `formatChannelUserText()` 的输出（**模型侧文本**，天然带前缀，取自 `sideEffectUserText` ← `latestUserText`，`build-options.ts:496` / `:973`）；"无前缀"只是**写入侧**（`appendIncomingContext` → `stripSpeakerPrefix`）的契约。
- 正确做法: 明确写进文档："下次看到这种不对称，**两边都是对的**"。把它列为"一个**不是缺陷**的预期现象（免得下次误判）"。
- 类型: 文档与判据
- 等级: H

### R67
- 出处: SELF-update 260925/phase2-zones-and-memory-isolation.md:2274-2279
- 错误做法: 把"场景全绿"当作 L2 按域注入路径已被验证。
- 症状: **`【相关记忆】`（L2 按域注入）依然从未真正触发过**——两条 L2 的 `weight=0`、activation 未达阈值；复验轮 L2 全程为 0 条。所以该路径只验证到"没漏"，没验证到"有东西时能正确注进去"。
- 根因: 验证样本的激活强度不足（叠加 R58 环境缺 embedding、R57 judge 结构化输出失败），导致"有内容的路径"始终没有内容。
- 正确做法: 在覆盖表里显式登记未覆盖项并写明替代防线（该路径仍只有单测 `rag/scope-filter.test.ts` + `memory-scope-isolation.test.ts` 兜着）；不要用"总表全绿"掩盖"某条路径从未被执行"。
- 类型: 验证方法
- 等级: L

### R68
- 出处: SELF-update 260925/phase2-zones-and-memory-isolation.md:1599-1607
- 错误做法: 把"清空记忆"与"删除后缓存"当普通功能项，未在蓝图里给出不可逆提示与强制重启要求。
- 症状: 风险表列出两项 🔴 高：**清空流程误删用户数据**（缓解：弹窗明确告知；建议先在 UI 提供"打开 userData 目录"让用户备份）；**删除后内存缓存写回旧数据**（缓解：强制重启 + UI 明确提示）。
- 根因: 删除类功能的失败模式是"不可逆 + 静默"（旧缓存把数据写回磁盘），而常规测试不会覆盖"删完重启前"这段窗口。
- 正确做法: 蓝图阶段就把"不可逆"与"必须重启"写成硬约束与 UI 文案；后续 P3 更严格地要求"擦除全程不需要重启"（走内存缓存失效），两者形成对照。
- 类型: 文档与判据
- 等级: H

### R69
- 出处: SELF-update 260925/phase2-zones-and-memory-isolation.md:1610
- 错误做法: 回滚方案写"全部改动在 `feat(phase2-zones)` 分支；`git revert` 或删分支即可"，并补一句"数据层因已清空，回滚需用户自行接受"。
- 症状: 代码可回滚、**数据不可回滚**：回滚后代码是旧的、数据是空的，属半可回滚状态。且与前序文档记录的实际提交状态不一致（见 R6）。
- 根因: 回滚方案只覆盖代码维度，未把"数据是否可逆"作为回滚可行性的判据。
- 正确做法: 回滚方案必须分"代码回滚"与"数据回滚"两栏，并显式标注数据不可逆的功能点（清空、迁移、擦除）；施工前先做整份 userData 物理备份。
- 类型: 流程纪律
- 等级: H

### R70
- 出处: SELF-update 260925/phase2-zones-and-memory-isolation.md:1764-1771
- 错误做法: 追求"处处隔离"，把所有读取路径都加上域过滤。
- 症状: 管理面板、Obsidian 导出、全局衰减、分词词典等场景会因为过滤而看不到全量数据；`imported_doc` 加域会误伤 owner 路径。
- 根因: 隔离的目标是"注入路径不串味"，而不是"所有读取都按域"；管理/导出类读取与注入类读取的语义不同。
- 正确做法: 显式登记"有意保留的不隔离点"：`getAllL2()` / `getAllL2DmaeStates()` 仅供管理面板与导出；`rag.searchMemoryEntries(..., { scopeId: undefined })` 保持全库；`relationshipLog.buildContext()` 不传 scope 时全量；`entityGraph.feedEntityNamesToJieba()` 保持全局（分词词典无隐私语义）；`imported_doc` 不加域（只在 owner 路径被检索）；`channels/context-bindings.json` 保留不删（管消息映射，与管记忆域的区块是两件事）。
- 类型: 文档与判据
- 等级: H

---

## 五、phase3-p1-message-identity.md（消息身份，E 组）

### R71
- 出处: SELF-update 260925/phase3-p1-message-identity.md:544,549-551
- 错误做法: §4.3 用"在 `.test.ts` 里写类型断言"当编译期防线：`const mustBeFalse: HasId = false`，指望 `HasId` 变成 `true` 时会报错。
- 症状: **实测不会报错**。`tsconfig.main.json` 显式 `exclude: ["src/main/**/*.test.ts"]`，仓库**没有**覆盖测试的 tsconfig，`vitest` 与 `vite build` 都走 esbuild **不做类型检查** → 这条防线是"纸做的"。
- 根因: 类型检查的执行者（tsc）根本不看测试文件；把"类型系统"当成运行时会触发的东西。
- 正确做法: 保留断言（日后加 test tsconfig / 开 vitest typecheck 即刻生效），但**必须另加运行时用例**：往 meta 里塞 `id`，断言 `appendHistory` 只挑白名单字段、生成自己的 id。用一次性探针确认类型防线本身有效（`{ id }` 赋给 `HistoryEntryMeta` 报 `TS2353`，`HasId` 为 `false`）。此结论被 P2/P3 反复引用。
- 类型: 文档与判据
- 等级: M

### R72
- 出处: SELF-update 260925/phase3-p1-message-identity.md:545
- 错误做法: §3.2 改动 7 的文案里写了「`?? null` 是必要的：注入的实现可能返回 `undefined`」，但改动 5 给出的类型**不含** `undefined`。
- 症状: 类型与实现自相矛盾，且"返回 undefined"这条用例**写不出来**（`Mock<() => undefined>` 不可赋值给该字段的类型）。
- 根因: 文档的不同小节各自演进，接口类型没有跟着语义说明一起更新；矛盾在"想写用例"时才暴露。
- 正确做法: 类型改为 `PersistedHistoryEntry | null | undefined | Promise<...>`；对所有真实调用方**赋值兼容性不变**，只是让 `?? null` 有据可依。
- 类型: 文档与判据
- 等级: M

### R73
- 出处: SELF-update 260925/phase3-p1-message-identity.md:546
- 错误做法: 注入点字段用 `appendHistory?: typeof appendChannelHistory`（`typeof 真实函数`）声明类型。
- 症状: 被引用函数的返回值一变，该字段类型跟着变，`proactive-delivery.test.ts:192` 的 void 桩函数（只改 `committedText`）**从此不再可赋值** → §3.3 声称的"四个调用方零改动"出现例外。
- 根因: `typeof` 把"被引用实现的签名"耦合进了"注入契约"，而注入点要的是稳定的结构类型。
- 正确做法: 改成显式函数类型：`(...args: Parameters<...>) => ReturnType<...> | void`；运行时零影响，测试桩保持原样。原则：**注入点写显式函数类型，别用 `typeof`**。
- 类型: 架构与实现
- 等级: M

### R74
- 出处: SELF-update 260925/phase3-p1-message-identity.md:547,553
- 错误做法: §4 测试计划列了 1–15 条（含 §4.3 可选），按此估算工作量。
- 症状: 实际补到 **22 条**（`history-log.test.ts` 15 条 + `channel-context.test.ts` 7 条）——清单低估了 7 条边界。
- 根因: 计划里的用例数按"功能点"估，而边界（落盘 IO 失败返回 `null`、新旧混排、旧前缀归一化不吞 id、meta 伪造 id 被忽略、验收标准的自动化版本）是按"失败模式"长出来的。
- 正确做法: 用例数的偏差要在施工记录里显式登记（"新增用例数 15 → 22"），让"计划 vs 实际"可被后人校准估算。
- 类型: 流程纪律
- 等级: H

### R75
- 出处: SELF-update 260925/phase3-p1-message-identity.md:537
- 错误做法: §4.4 预判"新增返回值会打破大量 `toEqual` 整对象断言"。
- 症状: **没有发生**——"没有任何 `toEqual` 整对象断言变红，§4.4 预判的破坏没有发生"。
- 根因: 预判基于"返回值形状变化必然波及断言"的一般经验，而本仓库的断言粒度恰好是按字段而非整对象。
- 正确做法: 在施工记录里如实写"预判未发生"，避免后人把这条预判当作已知风险重复投入；预判与实测都要写。
- 类型: 文档与判据
- 等级: H

### R76
- 出处: SELF-update 260925/phase3-p1-message-identity.md:616-641
- 错误做法: 做 transcript 相关手工验证前没有备份 `channels/`；应用启动后直接开始验证。
- 症状: 验证前 `channels/history/` 有两个老文件（`channel_qq_9cdd5e32b57efa9e.jsonl` 54 行 = 群 `1055799748`、`channel_qq_afc083f8a0114240.jsonl` 2 行 = 私聊 `2914636187`，均无 id），**启动后这两个文件消失了**。
- 根因: 启动期 schema 闸门 `runMemorySchemaGate()` 发现 `memory.json` 还是 `schemaVersion: 2`，用户点「清空记忆并继续」后调用 `deleteAllMemory()`，而 `MEMORY_TARGETS`（`memory-deletion.ts:15-31`）显式包含 `channels/history/`（热层）与 `channels/archive/`（温层）。有审计证据：`memory-trace.log` 的 `memory.deleteAll` + `migration.zoneUpgrade` 两条。
- 正确做法: **不是 P1 的回归**（闸门与 `deleteAllMemory` 都是既有代码），但代价是 §5.2 第 5 条失去真实样本；首次验证前先把 `channels/` 备份出去。
- 类型: 验证方法
- 等级: L

### R77
- 出处: SELF-update 260925/phase3-p1-message-identity.md:646-647
- 错误做法: 升级弹框提示写"旧记忆将被清空（桌面对话记录会保留）"。
- 症状: **没提渠道聊天记录也会一起没** —— 文案与 `MEMORY_TARGETS` 的实际范围不一致，用户在被删掉东西之前没有被告知。
- 根因: 文案由功能作者按"记忆"这个词的直觉写，没有对着 `MEMORY_TARGETS` 逐项核对。
- 正确做法: 删除类文案必须由目标清单生成或逐项核对（P3 后来采用的做法：预演报告把 `MEMORY_PRESERVED` 与"整份销毁"三项显式列出，见 R146/R157）。
- 类型: 文档与判据
- 等级: L

### R78
- 出处: SELF-update 260925/phase3-p1-message-identity.md:642-645
- 错误做法: 把"删除全部记忆"与"删除某个人"当成同一族功能复用实现。
- 症状: 两者**语义不同、作用域重叠**：`deleteAllMemory` 是"整目录删"，按人擦除是"按 `speakerId` 逐行过滤重写、保留别人的话"；共用一套实现会让"删一个人"顺手动到别人的 transcript。
- 根因: 两个操作的粒度不同（目录级 vs 行级），复用点只能落在"路径清单"，绝不能落在"删除动作"。
- 正确做法: P3 设计时明确：记忆控制台的「删除」入口与「删除全部记忆」按钮**不能共用一套实现**，并用架构守卫测试断言"擦除链路源码里不许出现 `deleteAllMemory` / `MEMORY_TARGETS`"（见 R122）。
- 类型: 架构与实现
- 等级: L

### R79
- 出处: SELF-update 260925/phase3-p1-message-identity.md:137
- 错误做法: 让 `HistoryEntryMeta` 包含 `id` 字段（即"可传入的字段"与"落盘结构"用同一个类型）。
- 症状: 调用方可以伪造或复用 id（两条消息撞同一个 id，破坏后续按 id 溯源/删除）。
- 根因: 类型没有区分"由写入方生成"的字段与"由调用方提供"的字段。
- 正确做法: `HistoryEntryMeta = Omit<HistoryEntry, "id" | ...>`，并在 `appendHistory` 里**白名单挑字段**（类型 + 运行时双重防线）。
- 类型: 架构与实现
- 等级: M

### R80
- 出处: SELF-update 260925/phase3-p1-message-identity.md:83
- 错误做法: 设计时假定"记忆写入时 assistant 消息的 id 已经存在"，准备让 `sourceMessageIds` 同时指向 user 与 assistant 行。
- 症状: 渠道路径的真实顺序是 `218 appendIncomingContext`（user 落盘）→ `224 buildAndRunAgent`（run 期间触发 `onRunFinished` → `scheduleMemoryWrite`）→ `309 appendAssistantContext`（assistant 才落盘）。**`scheduleMemoryWrite` 触发时 assistant 的 id 还不存在。**
- 根因: 把"run 结束后"当成了"消息都写完了"，而 assistant 的落盘在 run 返回之后。
- 正确做法: 记忆只需指向 **user 消息**（judge prompt 本就要求"必须是用户主动表达的信息，不是 AI 说的"，assistant 侧对事实溯源价值很低）；P1 只保证 user 消息的 id 在 `appendIncomingContext` 返回时可取。
- 类型: 架构与实现
- 等级: L

### R81
- 出处: SELF-update 260925/phase3-p1-message-identity.md:612-614
- 错误做法: §5.2 第 5 条验收（"老行仍无 id 且读取正常"）被当作可真机验证的项。
- 症状: **无法在真实数据上复核**：该样本在启动时被闸门清空（R76），只能标 ⚠️ 并由单元测试覆盖（用例 8「老格式行读回 `id === undefined`」、用例 9「新旧混排」）。
- 根因: 验收项没有事先声明"它依赖哪份真实样本"，环境一变结论就失去支撑，且发现得太晚。
- 正确做法: 验收表里为每条注明"证据来源"（真机样本 / 单测 / 无法验证），无法验证的必须显式标注并说明替代防线。
- 类型: 验证方法
- 等级: H

### R82
- 出处: SELF-update 260925/phase3-p1-message-identity.md:503
- 错误做法: 施工文档用**代码行号**引用被改动的代码（如"§3.1 改动 1 在 history-log.ts:264-314"）。
- 症状: 施工后行号全部漂移，P1/P2/P3 各文档引用的同一函数行号互不相同（例如 `reloadAllHistory` 的 bug 在 p3 被记为 `:399`，而 `history-log.ts` 在 P1 施工时是另一套行号）。
- 根因: 文档与代码是两套生命周期的产物，行号是代码侧的实现细节，不是稳定标识。
- 正确做法: 文档显式声明「行号以施工当刻为准，**以符号名为准**」，引用一律以函数名/符号名为主、行号仅作辅助。
- 类型: 文档与判据
- 等级: H

---

## 六、phase3-p2-l2-person-attribution.md（L2 人格化，F 组）

### R83
- 出处: SELF-update 260925/phase3-p2-l2-person-attribution.md:900,926-928
- 错误做法: 单人兜底判据写成"本批 turns 的 `personKey` 去重后只剩一个"，并明确否掉了 `channelFromSessionId`（§3.3 关键实现要点 2）。
- 症状: **首次按原文实现后立即被新用例当场证伪**：`attributeCandidates` 的单人兜底把群聊公共记忆标成了 `qq:10002`。"群里只有小明说过一句话"也满足该判据，于是**纯项目进展（公共记忆）会被兜底成「关于小明」**。而 P3 的删除正是按 `subjectIds` 定位的 —— **标错就等于删错人的记忆**。恰好 §0.2 的验收样例（B 单人说「小明最近在学 Rust」，小明不在场）就落在这个坑里。
- 根因: 用"人数"当"会话类型"的代理变量；`人数 == 1` 与 `私聊` 在群聊场景下不等价。
- 正确做法: 改用**真实判据 `chatType === "private"`**（`IncomingMessage` 本来就带它，bootstrap 层直接透传，透传链从 3 字段变 4 字段）。**P3.5 做"认提问者"时不得再用人数作代理。**
- 类型: 架构与实现
- 等级: H

### R84
- 出处: SELF-update 260925/phase3-p2-l2-person-attribution.md:901,934-935
- 错误做法: `tool-registry.ts` 的 `read_memory` / `write_memory` 用 `require()` 懒加载 memory 模块。
- 症状: **这条路径完全无法单测**：`require` 在 ESM 打包产物与 vitest 下**都不可拦截**，首次尝试写用例时实测撞到 `Cannot find module`。
- 根因: `vi.mock` 只能拦截 ESM `import`；`require` 在 ESM 产物里是另一套解析机制，测试钩子挂不上。
- 正确做法: 改为动态 `import()`（懒加载语义不变，仍是调用时才解析，但可 mock）。顺带：这是 §4.2 要求的回归用例能写出来的前提。**本仓库其他 `require()` 懒加载点（如 `fs-tools`）有同样问题，尚未处理。**
- 类型: 架构与实现
- 等级: L

### R85
- 出处: SELF-update 260925/phase3-p2-l2-person-attribution.md:902
- 错误做法: §3.7 只写"改 `memory-compressor.ts` 的调用点"就以为归属能传进去。
- 症状: `CompressionTransactionInput` / `createSummary` 的入参类型里没有归属字段，**编译期根本传不进去**（而测试 tsconfig 不检查，所以"编译期"这条防线对测试无效）。
- 根因: 改动的传播路径跨了"事务接口"这一层，清单按文件枚举，漏掉了接口签名。
- 正确做法: 一并扩展 `CompressionTransactionInput` 与 `CompressionTransactionDeps.createSummary` 的签名，并遵守与 `writeL2` 一致的"空数组不落字段"约定。
- 类型: 架构与实现
- 等级: M

### R86
- 出处: SELF-update 260925/phase3-p2-l2-person-attribution.md:903
- 错误做法: §8.1 改动清单里没有 `context-builder.ts`。
- 症状: 它是 `memoryScheduler.scheduleMemoryWrite` 的**门面**（`orchestrator/index.ts` 从这里 re-export）；门面签名不加第 4 参数，上游的归属就传不进去。
- 根因: 清单按"逻辑位置"枚举，漏掉纯转发的门面层——门面零逻辑，但零逻辑不等于零改动。
- 正确做法: 门面签名同步加第 4 参数（纯转发，零逻辑），并把"re-export 门面"作为一类必查项写进清单规范。
- 类型: 文档与判据
- 等级: H

### R87
- 出处: SELF-update 260925/phase3-p2-l2-person-attribution.md:904
- 错误做法: 把归属字段加进 `AgentRunFinishedContext`，未考虑它与插件 `turn:completed` 事件**同源**。
- 症状: 存在**顺带把群成员 QQ 号泄进第三方插件事件流**的风险。
- 根因: 同一个 context 对象被两条消费者链共享（内部记忆链路 vs 插件契约），加字段等于同时扩了两边的接口。
- 正确做法: 新增用例锁住「归属只走记忆链路，不进插件事件契约」；凡改动共享 context，必须逐个消费者确认契约边界。
- 类型: 架构与实现
- 等级: L

### R88
- 出处: SELF-update 260925/phase3-p2-l2-person-attribution.md:911,913
- 错误做法: 让"无归属"与"有字段但为空数组"在磁盘上呈两种形状。
- 症状: 读取侧要判两种形态；桌面路径与"解析后无归属"看起来不同，回归比对会误报。
- 根因: 序列化层把"空"与"缺席"当成不同的东西，而语义上它们是同一件事。
- 正确做法: **空数组不落字段**（`writeL2` / 压缩事务一致）；`MemoryJudgeTurn` 的字段按需展开（不写 `undefined` 键），使桌面路径的 turn 形状与 P1 **逐键一致**（用 `Object.keys` 断言锁住）。
- 类型: 架构与实现
- 等级: L

### R89
- 出处: SELF-update 260925/phase3-p2-l2-person-attribution.md:908
- 错误做法: 只给 `subjectIds` / `sourceMessageIds` 定退化规则，`speakerIds` 遇到"来源轮取不到"时留空。
- 症状: 一批记忆没有说话人指针，"谁说的"不可溯。
- 根因: 同类字段的降级策略不统一，导致部分字段在最需要兜底时反而没有兜底。
- 正确做法: `speakerIds` 采用同一规则：从"来源轮"取，缺失时退化为整批（`resolveSourceTurns`）——**"一批指向"优于"没有指针"**。
- 类型: 架构与实现
- 等级: L

### R90
- 出处: SELF-update 260925/phase3-p2-l2-person-attribution.md:912
- 错误做法: 把"目前没有生产消费者的纯函数"（`channelFromSessionId`）当作无用代码删掉。
- 症状: 若删掉，P3 的擦除流程要重写一遍"从 sessionId 取渠道"的逻辑。
- 根因: "无消费者"被当成"无用"，但它的消费者在下一个阶段（P3 输入清单里已列）。
- 正确做法: 按完整规格实现并配 3 条用例，**不删**，并在文档里注明"先于消费者的纯函数"，防止后人清理。
- 类型: 流程纪律
- 等级: L

### R91
- 出处: SELF-update 260925/phase3-p2-l2-person-attribution.md:61-103,519-537
- 错误做法: 原认知：P2 做完"L2 人格化"就能解决串记忆；P2 的方案重心放在 `buildMemoryInjection`（`【相关记忆】` 块）上。
- 症状: 全仓核实（只列生产调用点）后推翻：`buildMemoryInjection()` **只有两个调用方**（`call-prompt-builder.ts:58` 语音通话、`proactive-lifecycle.ts:110` 主动消息）；主聊天走的 `buildAlwaysOnContext()`（`orchestrator/index.ts:112-214`）**不调用它**，只注入世界书/群上下文/L0-L1 画像。`l2DmaeManager.updateActivation()` 的生产调用点只有语音通话。**整套 L2 + DMAE v5 在主聊天路径上是空转的。**
- 根因: 方案针对的是"自动注入"这条通道，而真实的主战场是**工具路径**：模型调 `user_memory` → `searchMemory(query, 'user_memory', topK, { scopeId })` → `scopeId` 只到"哪个群"，返回的池子里混着所有人 → 模型把小红的事当成小明的事说出来。工具路径的候选**无任何人物过滤**，且模型**直接当成"你说过的话"复述**（"我记得你……"），出错可见度是"正面翻车"。
- 正确做法: 承认"串记忆没有消失，只是换了扇门——而且更严重"；把 P2 **收窄为纯铺垫**（只做采集与落库），召回侧独立为 P3.5。**原计划 vs 实测：以为问题在 `buildMemoryInjection` → 实测它在主聊天路径上根本没被调用。**
- 类型: 架构与实现
- 等级: L

### R92
- 出处: SELF-update 260925/phase3-p2-l2-person-attribution.md:136
- 错误做法: 原计划在 ALS（AsyncLocalStorage）作用域内取归属信息并透传到 scheduler。
- 症状: 透传链的**终点在 ALS 作用域之外**——run 结束回调（`onRunFinished`）已经离开了发起请求时的 ALS 上下文，取不到。
- 根因: ALS 的生存期与"一次 run"不重合；把"请求期上下文"当成"run 全生命周期可用"。
- 正确做法: 显式沿调用链透传（dispatcher → bootstrap → agent-runtime → build-options → scheduler），把归属做成参数而不是隐式上下文。
- 类型: 架构与实现
- 等级: L

### R93
- 出处: SELF-update 260925/phase3-p2-l2-person-attribution.md:211
- 错误做法: 指望 judge 能把"跨批提到的人"也映射成 `personKey`。
- 症状: `subjectNames` → `subjectIds` 的映射只能依赖"本批说过话的人"名册 → 跨批提到的人无法归属，会被丢弃。
- 根因: 名册的构造范围是"本批 turns"（受 prompt 长度与判定窗口限制），而人名可以出现在任何一批里。
- 正确做法: 把限制**写进 judge prompt**，并明确"这是可接受的降级，不是 bug"；映射不上就丢弃（配合三条防线用例 6/7/7b）。
- 类型: 文档与判据
- 等级: L

### R94
- 出处: SELF-update 260925/phase3-p2-l2-person-attribution.md:213-222
- 错误做法: 只要求 LLM 输出 `subjectNames`，不要求它指出"根据哪几轮得出的"。
- 症状: 归属结果无法回指到具体 turn，也就无法进一步落到 `sourceMessageIds`；错了只能靠猜。
- 根因: 判定的"结论"与"依据"被分开索取，模型只被要求给结论。
- 正确做法: 让 LLM **同时输出 `sourceTurnIndexes`**，把"依据"变成结构化输出的一部分，再由它推出消息 id。
- 类型: 架构与实现
- 等级: M

### R95
- 出处: SELF-update 260925/phase3-p2-l2-person-attribution.md:223-243,230-231
- 错误做法: 原计划在 P2 内一并实现召回策略（重排 + 硬过滤 + 对 DMAE 排序插权重因子）。
- 症状: 三种做法都被否掉或风险过高：硬过滤"只留关于提问者的"**会切断上下文**（昔涟在群里回复小明时，有时确实需要提"小红说的那个事"）；对 DMAE 排序插权重因子**会污染 DMAE 语义且难测**。
- 根因: 召回侧改造是一件带真实 prompt 行为风险的独立工作（串味、啰嗦、token 成本三重风险），混进"纯数据层改动"会让验收标准变得含糊。
- 正确做法: §2.5 整体移至 **P3.5**，本阶段只记录设计思路供直接取用；判据上明确"P3 的擦除不依赖召回侧"。
- 类型: 流程纪律
- 等级: H

### R96
- 出处: SELF-update 260925/phase3-p2-l2-person-attribution.md:727,877
- 错误做法: 把手工作为验收主通道，且前置条件写"需要测试 QQ 号"。
- 症状: §5.2 手工验证长期停在"⬜ **待做**（需真实 QQ 号）"——手工验收不是"做完了没通过"，而是"没条件做"。
- 根因: 验收设计没有区分"必须真机才能验的"与"可以自动化验的"；把大量可自动化项和一件真机项混在同一张表里。
- 正确做法: 明确分工——§9.6 新发现 2 证明"归属链可被完整自动化验证，不需要 QQ"（`memory-scheduler.test.ts` 用真 `MemoryScheduler` + 桩 judge 断言 `turns[].personKey` → `candidate.subjectIds` → `writeMemory` 收到的候选；`dispatcher.test.ts` 用真 `createChannelContext` + `appendHistory` 桩断言"第 4 参数 == 落盘 id"）。手工验证因此**只承担"LLM 真会输出 `subjectNames` 吗"这一件无法 mock 的事**。
- 类型: 验证方法
- 等级: H

### R97
- 出处: SELF-update 260925/phase3-p2-l2-person-attribution.md:915-922
- 错误做法: 声称"本阶段不改任何召回代码"却只用人工核对来证明。
- 症状: 越界改动是最容易悄悄发生的（顺手的重构、顺手加的过滤）。
- 根因: "没改"是一个**否定性断言**，需要证据而不是信心。
- 正确做法: 逐条给出可核对的证据：`user_memory` / `read_memory` 的检索、排序、返回内容一行未改；`buildMemoryInjection` / `buildAlwaysOnContext` / `l2DmaeManager` 完全未触碰；桌面路径端到端断言第 4 参数为"全 undefined 的归属对象"→ 落库与 P1 逐字段相同；P1 的既有用例零改动通过。
- 类型: 验证方法
- 等级: H

### R98
- 出处: SELF-update 260925/phase3-p2-l2-person-attribution.md:631-647,862
- 错误做法: 把 `write_memory` 的 `sourceConversationId` 空串当作"顺手修一行"写进清单。
- 症状: 这一行牵出了 `require()` → 动态 `import()` 的改造（R84）与两处加载方式变更，实际工作是清单描述的数倍。
- 根因: "顺手修"的判断只看了症状（字段为空），没看代码路径（该工具用 `require` 懒加载，无法 mock 也就无法验证修复）。
- 正确做法: 把"顺手修"显式登记为偏离项并写清牵连范围；修完必须能写出用例（这正是 §4.2 要求的那条回归用例能写出来的前提）。
- 类型: 流程纪律
- 等级: H

### R99
- 出处: SELF-update 260925/phase3-p2-l2-person-attribution.md:825-840,863-864
- 错误做法: 用"整体移至 P3.5"处理做不完的范围。
- 症状: §9.1 落地表里留下明确未做的行：`CyreneRunOptions.personKey` / `AguiRunInput.personKey` ⬜ 未加（按 §3.6 移出，确认无消费者）；§3.6 改动 13–16、§3.9 召回侧全部 ⬜ 未做。若无人维护这份清单，"移出"就等于"失踪"。
- 根因: 范围裁剪本身没错，但裁剪掉的项需要一个**承接位置**（下一阶段的输入清单）与一个**复核点**。
- 正确做法: 把移出项写成独立小节（§8.2 已移至 P3.5）并给出每一条的"为什么现在不做、将来在哪做"，让"没做"是显式状态而不是遗忘。
- 类型: 流程纪律
- 等级: H

---

## 七、phase3-p3-erasure-and-console.md（精确删除与完全擦除，G 组）

### R100
- 出处: SELF-update 260925/phase3-p3-erasure-and-console.md:126-132
- 错误做法: 打算把 `deleteAllMemory`（`memory-deletion.ts:61-93`）的 `fs.rmSync(recursive)` 扫 `MEMORY_TARGETS` 的做法复用到"擦除某个人"上。
- 症状: `MEMORY_TARGETS`（`:15-31`）**包含 `channels/history/` 与 `channels/archive/`（`:29-30`）** → 复用会让"删一个人"顺手动到别人的 transcript。**这条在 P1 手工验证时已经真实发生过一次**（记忆格式升级闸门调用 `deleteAllMemory()`，两个老 transcript 文件被一并删除）。
- 根因: 两个操作作用域重叠但语义互斥（整目录删 vs 逐行过滤重写保留他人的话）；复用的诱惑来自"路径清单看起来一样"。
- 正确做法: **绝不能让擦除复用 `deleteAllMemory` 的任何一步**；并把它变成可执行的守卫（架构守卫测试断言擦除链路源码里不出现 `deleteAllMemory` / `MEMORY_TARGETS`）。
- 类型: 架构与实现
- 等级: L

### R101
- 出处: SELF-update 260925/phase3-p3-erasure-and-console.md:134-150
- 错误做法: 原计划在擦除某人时"删掉他的语料行"，甚至"读一下语料拿他的昵称"。
- 症状: `group-corpus-isolation.test.ts:119-131` 有一条守卫「除 `src/main/corpus/` 外，没有生产文件可以出现带引号的精确字面量 `"group-corpus"`」（正则 `/"group-corpus"/`）→ 读语料至少要写该字面量或用 `corpusDir()`，**两条路都会让那条守卫变红**。
- 根因: 语料是"只增不减的长期资产"（`docs/group-corpus.md:64-78` 三道保护：物理隔离、`MEMORY_PRESERVED` 登记、回归测试锁定），且**只写不读、零生产消费方**——它不进 prompt、不进召回，不影响"昔涟认不认识他"。
- 正确做法: 从擦除范围里**整个拿掉**：不读、不写、不删，连路径字面量都不出现在擦除代码里。昵称从 `externalChats.senderName`、transcript 的 `speakerName`、区块成员的 `senderName` 三处取，不缺这一处。将来的自学习 T0 在**使用端**解决（`userData/corpus-exclusions.json` 存 `{ channel, idHash: sha256(personKey) }`，采样时跳过，**永远不就地删语料行**）。**原计划 vs 实测：原方案确实打算擦除语料行，已按用户要求整个撤掉。**
- 类型: 架构与实现
- 等级: H

### R102
- 出处: SELF-update 260925/phase3-p3-erasure-and-console.md:161-167
- 错误做法: 期望"桌面对话里的渠道镜像残留"也能按人擦除。
- 症状: `ChatMessageChannelSource`（`chat-types.ts:112-116`）只有 `channel` / `chatType?` / `senderName?` —— **没有 `senderId`**；P0 之后已无生产写入方，磁盘上的都是遗留副本。
- 根因: 判据（能唯一确定"这条属于谁"的字段）在数据模型里根本不存在，只能靠昵称匹配，而昵称会重复/会改。
- 正确做法: **不自动删**，进「疑似残留清单」；遵守"宁可不删，不可删错"。`chats-store.replaceMessages(id, messages)` 可支撑将来要做，但判据不可靠前不做。
- 类型: 架构与实现
- 等级: M

### R103
- 出处: SELF-update 260925/phase3-p3-erasure-and-console.md:169-183
- 错误做法: 以为"逐行过滤重写 transcript"需要与后台写入做队列协调（原方案走 `KeyedQueue`）。
- 症状: **原方案的队列保证不成立**：队列实例只在 `bootstrap.ts:347-348` 内部创建、不可从模块外取得，且旁听（`napcat-adapter.ts:575`）与主动投递（`proactive-delivery.ts:119`）两条写路径**根本不在队列里**。
- 根因: 用"给写方加锁"的思路解决竞态，但锁的作用域不覆盖全部写方；而真正的保证来自运行时特性：`appendHistory`（`history-log.ts:264-314`）内部 `appendFileSync + readFileSync + writeFileSync`，**零 `await`**，`loadRecentHistory`（`:318-346`）也是同步的 → Node 单线程 + 无让出点。
- 正确做法: 把"逐行过滤重写"写成**纯同步函数**（读→过滤→写，中间不 await），它就不可能被并发 append 打断。⚠️ **一旦在重写循环里引入 `await`（例如 for-await 逐文件处理），这个保证立刻失效**，会退化成"读旧文件 → 别人追加 → 覆盖写回 → 丢消息"的经典竞态——已列为最高风险 + 专项用例。
- 类型: 架构与实现
- 等级: L

### R104
- 出处: SELF-update 260925/phase3-p3-erasure-and-console.md:185-191
- 错误做法: 以为渲染侧也有类型防线（"tsc 会挡住 UI 侧的类型错误"）。
- 症状: `tsconfig.main.json` / `tsconfig.preload.json` / `tsconfig.sim.json` 的 `include` **都不含 `src/renderer`**；根目录没有 `tsconfig.json`；`build:renderer` 就是裸 `vite build`（`package.json:14`），vite 只做 esbuild 转译 → **UI 侧的类型防线同样是纸做的**（呼应 R71）。
- 根因: 多 tsconfig 工程里"默认有一个总 tsconfig"是错觉；不在 include 里的目录等于没有类型检查。
- 正确做法: UI 的保障只有两种——**markup 字符串测试**（`dom-refs-consistency.test.ts` / `memory/panel.test.ts` / `zones-markup.test.ts` 那种）与 **jsdom 运行时用例**。附带坑：`applyTranslations`（`i18n-runtime/index.ts:81`）**全仓没有任何调用点**，所以 `index.html` 里的 `data-i18n` / `data-i18n-placeholder` 在当前窗口**根本不生效**；新 UI 的动态文本必须用 TS 侧 `t("settings.panel.memory.manager.…")` 赋值，静态骨架直接写中文。
- 类型: 文档与判据
- 等级: M

### R105
- 出处: SELF-update 260925/phase3-p3-erasure-and-console.md:193-203
- 错误做法: 只按 `MEMORY_TARGETS` 清点要删的东西。
- 症状: 磁盘上还有**三处含正文的"回退/调试"载体，都不在 `MEMORY_TARGETS` 里**：`memory.backup.<ISO>.json`（无保留期上限，每次记忆格式迁移写一份）、`memory-reconcile-backups/{memory,memory-store}.<ts>.json`（每前缀留 3 份）、`chat-api.log`（每次模型调用无条件写入，**完整 request messages + raw/cleaned response**）。前两者**留着 = 从备份回退时他会复活**；后者是"他在这里说过什么"的**最完整**副本，比 transcript 还全。
- 根因: 清单是按"功能模块"编的，而这些文件是**副产物**（备份/对账/调试），没有归属模块；而它们的价值恰好是"保留旧状态"，与擦除目标直接冲突。
- 正确做法: 三处一律**整份销毁，不做过滤**（逐份过滤要把级联逻辑重跑在裸 JSON 上，成本更高更易漏）。顺带记录：`chat-api.log` 无滚动/上限，会无限增长且含全部 prompt 正文，建议另立议题加"开关 + 大小上限"。
- 类型: 文档与判据
- 等级: H

### R106
- 出处: SELF-update 260925/phase3-p3-erasure-and-console.md:57-72,1326
- 错误做法: 沿用"擦除后 `memory.json` 里 grep `"qq:10001"` 0 命中"作为验收判据。
- 症状: 该判据**结构上抓不到目标现象**：`subjectIds` 会命中（K 类记忆有意保留），于是"0 命中"永远不成立，而真正的残留（如 `chat_history` 向量里的**裸** `2914636187`）反而因为带了渠道前缀而 grep 不到。
- 根因: 判据建立在"名字在这个文件里出现"这一层，而残留是按**字段语义**分布的（`speakerIds` 该 0、`subjectIds` 该留、向量里是裸 id）。
- 正确做法: 把判据拆成可分别判定的多条：① `speakerIds` 里 0 命中；② 每一处命中都落在某条 `subjectIds` 里且与预演清单逐条对得上；③ 群 G 的 `history/*.jsonl` 里 `"speakerId":"10001"` 0 行、B 的行一行不少；④ 审计 `senderId` 0 行；⑤ 备份与对账备份一个不剩；⑥ `chat-api.log` 不存在。并写明**例外**（见 R151）与**时点性**（见 R172）。
- 类型: 文档与判据
- 等级: H

### R107
- 出处: SELF-update 260925/phase3-p3-erasure-and-console.md:267-293,435-443
- 错误做法: 从文件名反推 sessionId（`reloadAllHistory` 用 `name.replace(/_/g, ":")`）。
- 症状: `safeName(sessionId)` 把 `:` 换成 `_`，而渠道 id 本身**允许含 `_`**（`isChannelId` 只要求 `^[a-z][a-z0-9_-]{0,31}$`，见 `conversation-binding-store.ts:43-46`）→ 反推是**有损的猜测**，不同 sessionId 可能映射到同一个文件名。
- 根因: 文件名编码不是双射（多对一），却把它当成可逆映射使用。
- 正确做法: 用「sessionId 名册」（`safeName(sessionId) → sessionId` 的权威 `ReadonlyMap`）做反查；任何调用方都不许自己写一遍 `replace(/:/g, "_")`（规则一变就静默错位）——这也是 `transcriptFileBase()` 必须导出的原因（见 R156）。
- 类型: 架构与实现
- 等级: L

### R108
- 出处: SELF-update 260925/phase3-p3-erasure-and-console.md:711-718
- 错误做法: 打算给 `memoryStore` 加一个 `reload()`。
- 症状: 重新判断后发现**不需要**：所有写路径都是「mutate 缓存对象 + `save()`」，级联删除同样走这条路，缓存与磁盘始终同源。但 `getAllL2()` 返回的是 `store.l2` 的**数组引用**（`:364-367`），而级联删除里 `store.l2 = store.l2.filter(...)` **会换掉数组身份**。
- 根因: 把"缓存失效"当成删除的必要步骤，而真正的风险在**引用身份**：长期持有旧引用的消费者（例如面板缓存）会继续看到旧数据。
- 正确做法: 不需要 `reload()`；**删除后一律重新 `await memoryStore.getAllL2()`**，不复用旧引用。
- 类型: 架构与实现
- 等级: M

### R109
- 出处: SELF-update 260925/phase3-p3-erasure-and-console.md:895
- 错误做法: 允许"按 `subjectIds` 命中"混进删除判据（即在某个 `if` 里补一个条件）。
- 症状: 判据一旦可被局部修改，"删的是从他嘴里出来的、留的是别人提到他的"这条边界就会随时间腐化。
- 根因: 语义边界只写在文档里，没有落在**类型**上，于是它可以被静默绕过。
- 正确做法: 让 `computeEraseHits` 的返回值里**没有任何"按 `subjectIds` 命中"的项**——将来若有人想加回"删别人转述的记忆"，他必须**改这个函数的签名**，而不是偷偷加条件。`keptSubjectOnly` 只用于展示与报告。
- 类型: 架构与实现
- 等级: H

### R110
- 出处: SELF-update 260925/phase3-p3-erasure-and-console.md:916
- 错误做法: 把"步骤 ⑥（transcript）产生的被删行正文集合 D"存成模块级单例，供步骤 ⑨（关系日志的存量指纹匹配）使用。
- 症状: **并发两次擦除会互相污染**（两次擦除的 D 集合混在一起）。
- 根因: 跨步骤数据流被放在比"一次操作"更长的生命周期里。
- 正确做法: 放在**编排器的局部变量**里；`previewId` 表已经说明了这个模式（每次操作一份状态）。
- 类型: 架构与实现
- 等级: H

### R111
- 出处: SELF-update 260925/phase3-p3-erasure-and-console.md:1023-1024
- 错误做法: 对关系日志做存量原文指纹匹配时，在双重循环里对每次比对都做 `slice`；或不做域限定全库扫。
- 症状: 500 条 entry × 上千被删行会明显变慢；全库扫会把**别的群域里"别人说过同样短句"误伤**。
- 根因: 判据缺少两个必要条件——复杂度的预处理（前缀集合）与作用域的显式限定。
- 正确做法: **先构造前缀集合再逐条比对**（`Set<string>`，O(n+m)）；**只在 `scopes` 限定的域里跑**。
- 类型: 架构与实现
- 等级: M

### R112
- 出处: SELF-update 260925/phase3-p3-erasure-and-console.md:1080-1081
- 错误做法: 改 `MEMORY_TARGETS`（加一项）与删除循环（加 glob 展开）后，只跑新用例。
- 症状: `deleteAllMemory` 的既有 5 条测试（`memory-deletion.test.ts:25-99`：全量扫、保留名单、缺失不报错、失败继续、trace）可能被打破；`group-corpus-isolation.test.ts` 断言 `MEMORY_TARGETS` 与 `group-corpus/` **路径互不包含**，新增目录若与其重叠会变红。
- 根因: 动"清单类常量"的影响面在别的测试文件里，只看自己新增的用例发现不了。
- 正确做法: 显式列出"必须重跑的两个测试文件"，并为新加的 glob 补一条"备份也被删"的用例。
- 类型: 验证方法
- 等级: H

### R113
- 出处: SELF-update 260925/phase3-p3-erasure-and-console.md:561-583
- 错误做法: 把关系日志当成"次要派生数据"，擦除时留给其他步骤顺带处理。
- 症状: 它是**唯一每轮都进主聊天的载体**（【近期关系线索】），不按人删就等于每轮都在提醒她"你认识他"。
- 根因: 载体的重要性按"数据体量"评估，而实际决定影响的是"是否每轮进 prompt"。
- 正确做法: 关系日志**必须按人删**，并给新数据加 `personKey`；存量条目（无 `personKey`）用原文指纹做确定性匹配（不要只丢进残留清单）。
- 类型: 架构与实现
- 等级: H

### R114
- 出处: SELF-update 260925/phase3-p3-erasure-and-console.md:621-682
- 错误做法: 直接执行擦除（或做"回收站/删除快照/撤销"）。
- 症状: 擦除不可逆；若给撤销能力，就得把被删的一切再留一份——与"完全擦除"直接冲突。
- 根因: "安全"的直觉做法（回收站）在这个需求下是反向的：保留副本正是要消灭的东西。
- 正确做法: 预演（dry-run）+ `previewId` + 二次确认（确认短语严格相等）+ 执行 + 报告；**不做回收站**。预演必须列出"整份销毁"三项的大小（见 R159）。
- 类型: 架构与实现
- 等级: H

### R115
- 出处: SELF-update 260925/phase3-p3-erasure-and-console.md:603-620
- 错误做法: 原打算在擦除流程里加一步"**LLM 扫描 L0/L1，列出疑似提及，人工确认后编辑**"。
- 症状: L0/L1 是结构化文本（`permanentNote` 等），没有归属人字段，结构上无法定位；调 LLM 又要付出成本与不确定性。
- 根因: 用模型能力去补数据模型缺失的字段，把"确定性判据"换成"概率性判据"。
- 正确做法: **不调 LLM**，改用"已知名字集合的子串匹配"产出「疑似残留清单」，由人工确认后自行编辑。**原计划 vs 实测：LLM 扫描 → 降级为确定性名字匹配。**
- 类型: 架构与实现
- 等级: H

### R116
- 出处: SELF-update 260925/phase3-p3-erasure-and-console.md:1329,1333
- 错误做法: 行为验收时直接在 B 刚提过 A 的那个群里问"小明是谁"。
- 症状: 她可能答「小红好像提过一个叫小明的」——这**是设计允许的**（K 类记忆按 §2.3 有意保留），但会把"反问"的预期弄脏，看起来像擦除失败。
- 根因: 题面里带了"别人刚提过他"的上下文，召回命中 K 类记忆，而 K 类的存在是既定取舍。
- 正确做法: 在**没人转述过 A 的会话**里问（A 的私聊，或 A 刚说过话的群）；先等 B 的那条记忆滑出上下文窗口。文档同时列出两个"**不算失败**"的情形，把判据写死。
- 类型: 验证方法
- 等级: H

### R117
- 出处: SELF-update 260925/phase3-p3-erasure-and-console.md:1332
- 错误做法: 在做"擦除后数据核对"时让应用继续运行。
- 症状: 别的进程正在写 `memory.json`，核对结果随时被改写。
- 根因: 核对对象是活文件，而判据假设它静止。
- 正确做法: 先确认没有别的进程在写（退出应用再核对最稳）。
- 类型: 验证方法
- 等级: H

### R118
- 出处: SELF-update 260925/phase3-p3-erasure-and-console.md:78,409-433
- 错误做法: 把「完全擦除」的验收标准理解成"这个名字在系统里 0 出现"。
- 症状: 若按"名字"判定，永远不通过（别人转述他的记忆是有意保留的），且会把正确的行为判成失败。
- 根因: "擦除"这个词有两个读法（名字消失 / 来源消失），文档必须选一个并写清楚。
- 正确做法: 判据是**「来源」而不是「名字」**：要求她**不再拥有来自他本人的任何认知**（他说的、他和她的私聊全部消失），**不是**要求这个名字 0 出现。别人转述的**有意保留**。
- 类型: 文档与判据
- 等级: H

### R119
- 出处: SELF-update 260925/phase3-p3-erasure-and-console.md:376-433
- 错误做法: 用"删除判据"直接驱动 UI 展示（一个"删谁"的输入框）。
- 症状: 用户想手动删"别人提到他"的记忆时无处可点；而系统若默认删，"会连带删掉别人的经历片段"。
- 根因: 删除判据与展示判据被混为一谈；二者服务的目标不同（系统默认行为 vs 用户自主选择）。
- 正确做法: 两组**分开显示、分开勾选**：`🗣 他的记忆`（`speakerIds ∋ P` 或在他的私聊会话里，**「彻底擦除」会删的就是这一组**）与 `👥 别人提到他`（只有 `subjectIds ∋ P`，**默认保留**，勾选删除时提示"会连带动到 XX 的记录"）。被否决的替代方案（默认关闭的勾选项）附**复活条件**并登记为 O8。
- 类型: 架构与实现
- 等级: H

### R120
- 出处: SELF-update 260925/phase3-p3-erasure-and-console.md:1527-1529
- 错误做法: 原方案让预演的 `vectors / evidence / dmaeStates / conflictLogs / reflectionLogs` 计数在 `person-erasure.ts` 里**再算一遍**。
- 症状: 那就是**第二份级联分类逻辑**，迟早与 `deleteL2Cascade` 漂移；而 §2.13 的"执行时按同一判据重算"正建立在"只有一份判据"上。
- 根因: 预演与执行分别实现"同一件事"，两条路径的等价性只靠人工保证。
- 正确做法: 抽出纯函数 `planL2Cascade(store, ids)` + `previewL2Cascade(ids)`，`deleteL2Cascade` 先调 `planL2Cascade` 拿分类再逐行应用，预演直接调 `previewL2Cascade`；并加用例"previewL2Cascade 与 deleteL2Cascade 报告同一组数字（**预演 ≠ 假数据**）"。
- 类型: 架构与实现
- 等级: H

### R121
- 出处: SELF-update 260925/phase3-p3-erasure-and-console.md:1531-1532
- 错误做法: 按文档写 `attribution.personKey` 作为 `build-options` 的实参。
- 症状: 该调用点作用域里**没有 `TurnAttribution` 变量**，照抄会编译不过。
- 根因: 文档按"概念名"写实参，而实际作用域里的变量名是另一套（`finishedContext`，形状 `{runId, source, mode, personKey, speakerName, userMessageId, chatType}`）。
- 正确做法: 用 `finishedContext?.personKey`；只改那一处实参，`recordRelationshipTurn` 的形参类型无需改动（`RelationshipTurnInput` 已带可选字段）。
- 类型: 命令与脚本
- 等级: H

### R122
- 出处: SELF-update 260925/phase3-p3-erasure-and-console.md:1534-1536
- 错误做法: 原方案在 `filterTranscriptFile` 里做 legacy 正文前缀反推，以识别老记录的说话人。
- 症状: 会把写入侧那套启发式复制到读取侧（两份判据）；且**归档层某个 `YYYY-MM.jsonl` 被整月清空时没有删掉该空文件** → "归档目录变空即删目录"这条永远不会触发（原方案的低估）。
- 根因: 用"猜"补齐结构化字段缺失，而不是承认 legacy 行原样保留；空文件的清理条件依赖一个不会发生的状态。
- 正确做法: 只按结构化字段判定，legacy 行原样留下（代价已知：磁盘判据 `speakerId === "10001"` 0 行仍成立）；**归档层整月清空时删掉该空文件**，热层仍保留空文件以维持 `loadRecentHistory` 的 `existsSync` 早退行为。
- 类型: 架构与实现
- 等级: H

### R123
- 出处: SELF-update 260925/phase3-p3-erasure-and-console.md:1538-1539
- 错误做法: 原方案 §2.14 把"扫描 transcript"排在"算 `privateSessions`"之前。
- 症状: 私聊行没有 `speakerId`；扫描若不知道哪些会话是"整会话删"，既数不出会被删多少行，也取不到将被删掉的正文 → **预演报告会严重低估私聊部分**。
- 根因: 步骤顺序写反：私聊会话集合只依赖名册的 `chatType/chatId`，**不依赖扫描结果**，所以可以也应该先算。
- 正确做法: `scanPersonTranscripts` 接收 `privateSessions` 入参，且在算完 `privateSessions` 之后执行。
- 类型: 架构与实现
- 等级: H

### R124
- 出处: SELF-update 260925/phase3-p3-erasure-and-console.md:1541-1545
- 错误做法: 去压缩时按原方案"先删向量再重建"。
- 症状: 实测 `commitMemoryCompression` 只对子条目调 `archiveSources()`（把 `status` 置 `archived`），**并不删它们的向量**；而 `JsonVectorStore.addUnique()` **不做 l2Id 去重**。后果有两层：① 向量库里留下**同一 `l2Id` 的重复行**，而重复行会被 `rag/index.ts` 的"`metadata.l2Id` ↔ `L2.ragId` 双向一致"检查判成孤儿；② **平白删掉一条 K 类记忆的向量** —— 而 §4.5 用例 2 明确要求"别人提到他"的那条 `content / subjectIds / status / ragId` **全字段不变、向量未被删**。
- 根因: "先删后建"隐含假设"删除是幂等且去重的"，而存储层不提供这两个性质；且把"重建"当成了"必做"，而实际只需要"补缺"。
- 正确做法: `status` 确定性还原为 `active`（这一步是"回到压缩前状态"的全部必需）；向量**健康就原样复用**，缺失（`syncStatus !== "synced"` 或没有 `ragId`）才 `addVector + markSynced`。**原计划 vs 实测：先删后建 → 仅在向量缺失时重建。**
- 类型: 架构与实现
- 等级: M

### R125
- 出处: SELF-update 260925/phase3-p3-erasure-and-console.md:1547-1548
- 错误做法: §4.4 只提了一句"新增架构守卫"，没有把它当成一条**独立交付物**。
- 症状: "不碰语料""不复用 deleteAllMemory"这类承诺若只写在文档里，会在后续改动中被无声破坏。
- 根因: 承诺没有对应的可执行断言。
- 正确做法: 新增 `memory-erasure-corpus-guard.test.ts`：硬编码 P3 的 **18 个生产文件**清单，逐个断言 ①不 import 语料模块、②不出现带引号的精确字面量 `"group-corpus"`；再加 `PERSON_ERASABLE` / `MEMORY_TARGETS` / `MEMORY_BACKUP_GLOBS` 与语料路径互斥、`PERSON_ERASABLE ∩ MEMORY_PRESERVED = ∅`、以及**擦除链路源码里不许出现 `deleteAllMemory` / `MEMORY_TARGETS`**。
- 类型: 验证方法
- 等级: H

### R126
- 出处: SELF-update 260925/phase3-p3-erasure-and-console.md:1550
- 错误做法: 计划改动 §8.1 清单里的第 27/28 项（两份文档）。
- 症状: 逐条核对后发现**无需改动**：`docs/group-corpus.md` §9 与总览 §5 的相关纪律**在 P3 侦察阶段就已经落笔**，与实现一致。
- 根因: 清单的"待改"状态在侦察阶段已经过期，没有回头同步。
- 正确做法: 施工前逐条核对清单项的当前状态，把"已满足"的项标掉并写明理由，避免做无效改动（也避免误以为漏做）。
- 类型: 流程纪律
- 等级: H

### R127
- 出处: SELF-update 260925/phase3-p3-erasure-and-console.md:1552-1554
- 错误做法: 把 300+ 行的控制台数据层逻辑塞进 `memory-user-ipc.ts`；或把新文件命名为 `memory-manager.ts`。
- 症状: 前者让该文件失去"只做接线"的形态；后者**直接毁掉记忆写入链路**——`memory-manager.ts` 这个名字已被 PMRS 的 `memory-manager.ts`（L0/L1 写入与域过滤）占用，覆盖它会顶掉写入逻辑。
- 根因: 命名的唯一性没有全局检查；"顺手叫这个名字"在大型仓库里是破坏性操作。
- 正确做法: 主进程数据层单独开 `src/main/memory/memory-console.ts`；命名前全仓搜同名文件。
- 类型: 命令与脚本
- 等级: M

### R128
- 出处: SELF-update 260925/phase3-p3-erasure-and-console.md:1556-1557
- 错误做法: 「来源未知（无归属记忆）」分组不排除"能被私聊会话兜底定位"的旧记忆。
- 症状: **构造用例时实测撞到**：同一条记忆既出现在某人的「他的记忆」里、又出现在「来源未知」里（同一实体出现在两个互斥视图）。
- 根因: 分组判据只写了"无 `speakerIds`/`subjectIds`"，漏了第二个定位来源（私聊会话）。
- 正确做法: 判据补全为：无 `speakerIds`/`subjectIds` **且** 其 `sourceConversationId` 不在名册的任何私聊会话里。
- 类型: 架构与实现
- 等级: H

### R129
- 出处: SELF-update 260925/phase3-p3-erasure-and-console.md:1559-1561
- 错误做法: 按文档正文实现 UI 的 id 清单与报告字段名。
- 症状: 两处与实现不符：文档列了 **16 个 id**、实际需要 **17 个**（三个视图按钮各一个 id）；`PersonEraseReport` 的字段名正文写作 `added: n`、实现为 **`addedSincePreview`**。
- 根因: 文档正文的清单是设计草案，实现时按需要增补，但没有回头改正文；markup 测试与类型定义才是权威。
- 正确做法: 以**能双向断言的清单**为准（UI 侧按 17 个实现，`markup 测试双向断言`）；字段名以类型定义为准，并把这个偏差登记为偏离项。
- 类型: 文档与判据
- 等级: H

### R130
- 出处: SELF-update 260925/phase3-p3-erasure-and-console.md:1563
- 错误做法: `needsReconfirm` 回环只做单向跳转，不加轮数上限。
- 症状: 主进程若一直返回该状态，界面会**无限循环**；详情区若有多个删除按钮，用户可能在"两组分开勾选"的语义下点错目标。
- 根因: 交互协议允许"再确认"但没有终止条件；破坏性操作的入口数量没有约束。
- 正确做法: 回环加 **3 轮上限**；详情区只保留**一个**删除按钮（两组仍分开勾选、分开计数）；勾到「别人提到他」时先弹"会连带动到某人的记录"的警告。
- 类型: 架构与实现
- 等级: H

### R131
- 出处: SELF-update 260925/phase3-p3-erasure-and-console.md:1570-1572
- 错误做法: `runtime-policy/timeout-policy.ts` 把 `memory-llm` 阶段的超时设为 **30s**。
- 症状: 该阶段是**非流式**调用、prompt 又长（judge 的 system prompt 4.2k 字符 + JSON schema 说明），实测用户当时的端点单次要 **49s** → 30s 让 judge **每一次都必然超时**，而 judge 每 6 轮才跑一次，**失败一次等于那 6 轮的对话全部不落记忆**。
- 根因: 超时预算按"一般 LLM 调用"设定，没有把"非流式 + 长 prompt + 结构化 repair 需要第二次调用"算进去。
- 正确做法: 超时 **30s → 120s**，预算必须容得下"两次慢调用"；同步改 `timeout-policy.test.ts` 两处断言（30_000 → 120_000）。
- 类型: 环境
- 等级: M

### R132
- 出处: SELF-update 260925/phase3-p3-erasure-and-console.md:1574-1577
- 错误做法: `runtime-policy/token-budget.ts` 把 `memory-judge` 的 `maxOutputTokens` 设为 **800**。
- 症状: judge 每条候选要写全 `summary` / `slug` / `sourceQuote`（软上限 500 字）/ `content` / `contextSummary` / `evidenceQuotes` / `reason`，实测**一条候选 ≈1000 字符 ≈700 token**。一批里出现 2 个以上话题，800 就会把 JSON 从中间切断 → 校验失败 → repair 再切一次 → `REPAIR_EXHAUSTED`，**这一批对话的记忆全部丢失**（实测 `finish_reason=length`）。
- 根因: 输出预算按"一句话"估，而结构化输出的单条成本是 7 个字段之和；且"一批里几个话题"取决于群友说了什么，**不是可以假设的量**。
- 正确做法: **800 → 32768**（端点允许的上限）：与其猜一个够用的数字，不如让截断从根上不可能发生（`max_tokens` 只是上限，不会让模型多说话，也不按上限计费）；同步改 `token-budget.test.ts` 断言。
- 类型: 环境
- 等级: M

### R133
- 出处: SELF-update 260925/phase3-p3-erasure-and-console.md:1579-1583
- 错误做法: 只靠 `memory-manager.writeMemory` 里那道 `!isOwnerScope(scope) → 丢弃 L0/L1` 来约束非 root 域的输出。
- 症状: 实测：4 轮群聊 → 产出 2 条 L1 → **全被丢弃** → `l2` 一条都没有，而真正的 L2 **连生成机会都没有**（LLM 不知道自己的输出会被丢，把预算浪费在注定被丢弃的候选上）。
- 根因: 约束只存在于"事后丢弃"，没有前移到"事前提示"；生成侧与过滤侧的判据不同源。
- 正确做法: `memory-scheduler` 用 `scopeId !== rootScope()` 算出 `l2Only` 下传给 judge，judge 在提示词里明确"只能输出 L2、禁止 L0/L1、把发言人当成具体的人而不是「用户」"。⚠️ **判据只有一处**：调度层算一次，与 `writeMemory` 里那道丢弃规则同源（都是"域是不是 root"）。
- 类型: 架构与实现
- 等级: M

### R134
- 出处: SELF-update 260925/phase3-p3-erasure-and-console.md:1585-1592,1804-1813
- 错误做法: `memory-console.deleteMemoryManager` 在 `deleteL2Cascade` 之后**没有接"删向量"这一步**。
- 症状: 按域视图删掉一条记忆后，`l2` / `evidence` / `l2DmaeStates` 三处都正确级联，但 `rag-data/memory-store.json` **一条没少**、被删条目的 `ragId` 仍命中 1 次（向量库 21 条不变，**文件 mtime 停在写入那刻**）。影响：语义召回仍能命中一条**已经不存在的**记忆，要等下次启动对账才被当孤儿回收。
- 根因: `deleteL2Cascade` 的契约是**有意不删向量**（store 是对账的事实源，顺序必须"先 store 后 vector"），调用方要自己拿 `removed[].ragId` 去 `deleteUserMemoryVectors`。`person-erasure.ts:849` / `memory-compressor.ts:147` / `obsidian-importer.ts:176` 都接了这一步，**只有控制台这条路径没接**。
- 正确做法: `deleteMemoryManager` 在 cascade 之后按 `removed[].ragId`（与 `person-erasure` 同一取法）调 `deleteUserMemoryVectors`；`MemoryManagerDeleteResult` 新增 `vectors` 字段，删除完成提示与 i18n 双份同步；删向量失败**不致命**（启动对账兜底），只告警。**为什么以前没被发现**：它不影响最终数据一致性，差别只在"下次启动之前那段窗口里召回还能命中已删记忆"——只有"删完立刻去看向量文件"才会暴露。
- 类型: 架构与实现
- 等级: L

### R135
- 出处: SELF-update 260925/phase3-p3-erasure-and-console.md:1599-1604
- 错误做法: 只把 L2 cascade 的 `removedRagIds` 交给 `deleteUserMemoryVectors`，默认"向量残留已被覆盖"。
- 症状: 向量库 19 → 14，消失的**全是** `user_memory_`；**`chat_history_` 12 条一条没动**，其中 **8 条与他有关**（他说的 4 条原文 + 游戏专属号转述他 1 条 + 昔涟回复里点名他的 3 条）。更糟的是 `reconcileUserMemoryIndex`（`default-dependencies.ts:157`）取的是 `getEntriesBySource("user_memory")` —— **启动对账的视野里根本没有 `chat_history`**，所以它不像 D1 那样有兜底。结果：**"彻底擦除"之后，昔涟仍能通过历史语义召回拿到他已经删掉的经历。**
- 根因: `rag-data/memory-store.json` 明写在 `PERSON_ERASABLE` 里，但"文件在清单里"≠"文件里的每一类条目都被处理"；全仓**没有任何 `chat_history` 字面量**，而 §5.2 第 6② 条的 grep 用带渠道前缀的 `"qq:2914636187"` 做判据，向量条目正文里是**裸** `2914636187` → **这条清单结构上抓不到它**。
- 正确做法: 删「他说的 + 昔涟回复里点名他的」，**保留**别人转述他的（与 K 类口径一致）；落地在向量步骤（或新增 ④b），判据与 `computeEraseHits` 的 K 类口径**同源**，不能各写一套。复现证据：`checks.mjs` 的 6d 断言（修好前 4 条带裸 senderId，修好后应为 0）。
- 类型: 架构与实现
- 等级: L

### R136
- 出处: SELF-update 260925/phase3-p3-erasure-and-console.md:1606-1610,1855
- 错误做法: 预演用 `probeBackups()`（`person-erasure.ts:474`）**递归数文件**，报告用 `eraseMemoryBackups().files.length`（`memory-deletion.ts:182`）**数目标**。
- 症状: 预演 `memory.backup.*.json` ×2 + 对账目录里的 ×2 = **4**；报告 2 个文件 + 1 个目录 = **3**。字节数两边一致（635142 B），实际也**确实删干净了**（实测 0 个备份、目录不存在），但**用户看到「4 → 3」会合理怀疑漏删一个**。
- 根因: 同一个量有两把尺子（递归文件数 vs 目标数），而 UI 把两个数字并排展示。
- 正确做法: 二选一，但**必须让报告与预演说同一句话**（最终实现：报告侧也递归数文件，trace 里另记 `targets` 便于排查）。**别再让用户自己猜。**
- 类型: 文档与判据
- 等级: H

### R137
- 出处: SELF-update 260925/phase3-p3-erasure-and-console.md:1612-1615
- 错误做法: 只靠 `PERSON_ERASABLE` / `MEMORY_PRESERVED` 两张清单定义边界，未检查是否还有落在两者之外的载体。
- 症状: 实测（擦除后）`cyrene-runs/sessions/*.json` 里仍是 `messages: [{role:"user",content:"[小明]: 我还养了只鹦鹉"}, {role:"assistant",content:"…下个月一起搬去杭州…"} …]` **逐字正文**；共 ~90 个 run 文件命中裸 senderId，另有 `cyrene-runs/reviews/**`、`cyrene-runs/tool-results/**` 命中。
- 根因: §0.4 的原则是"清单即边界"，但 `cyrene-runs/` 与 `memory-trace.log` 落在两个数组之外 —— **实测行为是"保留"，但这不是被决定的，而是没被决定的**。
- 正确做法: 需要一次**显式决策**：把 run 存储按人过滤（`conversationId` / `messages[].content` 里的 `[别名]:` 前缀），还是明确写进 `MEMORY_PRESERVED` 并在文案里告知。
- 类型: 文档与判据
- 等级: H

### R138
- 出处: SELF-update 260925/phase3-p3-erasure-and-console.md:1617-1620
- 错误做法: 弹窗开头写「彻底擦除…的**全部痕迹**」，并把实体图删除判据限定为 `type === "person"` + 名字精确匹配。
- 症状: 两类落差：① `MEMORY_PRESERVED` **有意保留 4 类东西**（群聊语料、`cyrene-chats/`、`channels-settings.json`、`zones.json`），这四类**在弹窗里一个字都没提**；② 由他的记忆派生的**地点节点**留了下来（实测残留 `杭州`、`成都`，而 `relations` 已空）。
- 根因: 文案的强度超出了证据能支撑的范围；删除判据只覆盖 `person` 类型节点，非人节点的 `mentionCount` 却来自他的记忆。
- 正确做法: 两条都属"措辞与边界"问题——要么补进残留清单，要么把「全部痕迹」改成可被证据支撑的措辞（最终实现见 R148）。
- 类型: 文档与判据
- 等级: H

### R139
- 出处: SELF-update 260925/phase3-p3-erasure-and-console.md:1622-1628,1881-1886
- 错误做法: `transcript-erasure` 的逐行判据只写 `speakerId === senderId`。
- 症状: **本轮最重要的一条缺陷**。擦除后 7 分钟在群里问「小明最近在学什么呀」，昔涟答「**你最近不是正在认真学做菜嘛！当时还说以后去杭州开小灶呢**」——这两件事都已经随擦除删掉了（`l2` 里没有、他的 transcript 行 0 行、`chat_history` 向量里也没有"做菜"）。证据链（`cyrene-runs/sessions/run-1790345147627-o5sb5o.json`）：prompt 的 `messages[0..15]` 里有 **8 条 `role=assistant` 的行**在复述他的事实，最直接的一条是 `[10] assistant: 学做菜好呀！以后搬去杭州就能自己开小灶啦♪`，与她的最终回答 `[18]` **逐字同源**。
- 根因: **assistant 行没有 `speakerId`**，所以一条都不动；§5.2 第 6③ 条的断言是「`"speakerId":"<被擦者>"` 0 行 + B 的行一行不少」——**结构上抓不到 assistant 行**；§2.3 的 K 类逻辑只覆盖「**别人**提到他」（B 的 user 行），从没覆盖「**她自己**复述他」。影响：**这是比 D2 更直接的通道**——`chat_history` 向量要靠语义召回撞上，而 assistant 行就在普通上下文窗口里，**每问一次就重新喂一次**，"完全不认识、重头再来"在这个群里因此**并不成立**。
- 正确做法: 三选一并在用户拍板后落地（见 R140）。
- 类型: 架构与实现
- 等级: L

### R140
- 出处: SELF-update 260925/phase3-p3-erasure-and-console.md:1635-1645
- 错误做法: D5 修复只按"正文含他的任一别名"删 assistant 行。
- 症状: **只做①抓不到要害**：实测泄漏的那一行 `学做菜好呀！以后搬去杭州就能自己开小灶啦♪` **一个字都没提他**，只按名字匹配它活得好好的，而它正是她后来照答"他在学做菜"的来源。
- 根因: 复述有两种形态——"点名复述"（含名字）与"回话复述"（紧接着他的行、内容却是他的事实），后者不含任何可匹配的字符串。
- 正确做法: 判据两条且**都在 `transcript-erasure.ts`、预演与执行同源**：① 按名字（`assistantMentionsPerson`）；② **按轮次配对**（这一行的上一行就是他的行，`isReplyToPerson`）。两条都限定在"**他真正说过话的会话里**"（`heSpoke`），否则"他从未出现过的群"里别人叫同一个名字时会被误删；别人转述他的 `user` 行仍然保留（K 类）。支撑改动：`filterTranscriptFile` 的 `keep` 回调新增第二个入参"上一行"。
- 类型: 架构与实现
- 等级: L

### R141
- 出处: SELF-update 260925/phase3-p3-erasure-and-console.md:1642
- 错误做法: §2.5 约束 1 原决策是"不删昔涟自己的回复，接受残留"。
- 症状: 那条"接受"让 §5.2 第 7 步的"完全不认识"在群里**根本不成立**（见 R139）。
- 根因: 约束的制定依据是"删她的回复会伤及上下文"，但没有用行为验收去检验它的代价；代价在验收阶段才暴露。
- 正确做法: **反转该约束**，并把反转理由写进文件头（不是悄悄改）。教训：一条"接受残留"的决策必须同时写明"它会让哪条验收失败"，否则它会在验收时才被推翻并造成返工。
- 类型: 文档与判据
- 等级: H

### R142
- 出处: SELF-update 260925/phase3-p3-erasure-and-console.md:1647-1656
- 错误做法: 打算复用 `deleteUserMemoryVectors` 删 `chat_history` 向量。
- 症状: 后者**把 source 写死成 `user_memory`**，拿 `chat_history` 的 id 去调**一条都删不掉**（静默无效）。
- 根因: "删除向量的函数"在接口上隐含了"删的是哪一类向量"，而这一类信息被写死在实现里。
- 正确做法: 新增 `rag.deleteChatHistoryVectors(ids)`（`deleteEntriesByIds(ids, "chat_history")`），`person-erasure` 新增 ④b 步 + 两个注入点（`getChatHistoryVectors` / `deleteChatVectors`）。判据（`person-erase-plan.selectChatHistoryVectorIds`，纯函数，预演与执行共用）：① `role=user` 且正文含他的**裸 `senderId`** → 删；② `role=assistant` 且**轮次配对**命中他的某个 turn（同 `sessionId` + 同 `ts`）→ 删（**同样与正文是否提他无关**）；③ `role=assistant` 且落在他的域里、正文含他的别名 → 删；④ 其余一律不删。**轮次配对的依据是实测**：`indexConversationTurn` 给同一 turn 的 user / assistant 两条写入同一个 `ts` + 同一个 `sessionId`（在真实 `memory-store.json` 的 12 条上逐条确认过）。
- 类型: 架构与实现
- 等级: L

### R143
- 出处: SELF-update 260925/phase3-p3-erasure-and-console.md:1644
- 错误做法: 把新增的 `assistantLines` 计数**只**放在预演的报告格里。
- 症状: 它确实是从 transcript 里删掉的行，若不**同时计入 `hotLines`/`archiveLines`**，就会出现"预演比执行小"，§2.13 的"同源"就破了。
- 根因: 新增一个细分计数时，没有同步更新"总计"的口径定义。
- 正确做法: `assistantLines` 单独出（预演 per-session + 执行报告 + trace），并**同时计入** `hotLines`/`archiveLines`；加用例断言"预演与执行数字相等"。
- 类型: 架构与实现
- 等级: H

### R144
- 出处: SELF-update 260925/phase3-p3-erasure-and-console.md:1664-1667
- 错误做法: D3 的两种修法里挑"预演侧改成报目标数"。
- 症状: 那会让"含目录"这件事靠人记；同类问题（D6）还会再犯。
- 根因: 口径不一致的根因是"两把尺子"，正确的收敛方向是**让报告与预演说同一句话**，而不是在文案上打补丁。
- 正确做法: `eraseMemoryBackups` 新增 `fileCount`（递归数文件，与预演的 `probeBackups` 同口径），报告改用它；trace 里同时记 `targets` 便于排查；用例："目录里放两个文件时断言 `files`（目标）= 2、`fileCount` = 3"，集成用例断言预演与报告**都是 3**（修之前会是 3 vs 2）。
- 类型: 文档与判据
- 等级: H

### R145
- 出处: SELF-update 260925/phase3-p3-erasure-and-console.md:1669-1676
- 错误做法: 预演在 `person-erasure` 里**手写循环**数关系日志的四档。
- 症状: 算不出 `summaries`（"总结"格） → 报告里多一格「总结」，用户会看到"**预演没有、报告有 1**"（D6，低危·口径）。
- 根因: 预演是从外部"数"执行的结果，而不是"跑一遍同一套判据"；一旦执行侧有跨条目的连带逻辑（孤儿总结清理），外部数就数不出来。
- 正确做法: 新增 `RelationshipLogStore.previewErasePerson()` —— 在**内存副本**上按与三个 `eraseBy*` **相同的顺序**跑一遍（`eraseByPersonKey` → 逐个 `eraseByScope` → `eraseByUserTextFingerprint`），共用 `dropOrphanSummaries()` 与 `matchesRemovedUserTextFingerprint()`，返回五格；预演仍然**不落盘**（用例断言文件条目/摘要一个不少）。`RelationshipStoreLike` 的注入面同步加这个方法（测试桩少写一个就会编译不过）。
- 类型: 架构与实现
- 等级: H

### R146
- 出处: SELF-update 260925/phase3-p3-erasure-and-console.md:1686-1695
- 错误做法: "按会话过滤 run 存储"时，只把 **transcript 扫描出的会话**喂进判据。
- 症状: **副本复测抓到的第二个缺口**：在副本上算出 `runs = 19`，而 index 里属于他会话的其实有 **93** 个 —— 因为**他的行可能已被上一次擦除抹掉**，扫描结果就空了。
- 根因: 判据的**入参集**不完整：判据本身（只按 `conversationId` 过滤）是对的，但"他要删哪些会话"这个集合只从一个来源取，而结构化指针可能已被先前的操作破坏。
- 正确做法: `collectSpeakingSessionIds()` 把**六个来源并起来**：① transcript 扫描 ② 他的私聊 ③ 他的 L2 记忆的 `sourceConversationId` ④ `solo:<sessionId>` 形态的域 ⑤ `chat_history` 向量里带他 senderId 的条目的 `metadata.sessionId` ⑥ 关系日志里 `personKey` 是他的条目的域。**仍然只按 `conversationId` 过滤，不做正文匹配**；两个新读入口都包了 `safe*()`（读不到就当空，绝不让 RAG/关系日志的暂时不可用把整次擦除打挂）。
- 类型: 架构与实现
- 等级: H

### R147
- 出处: SELF-update 260925/phase3-p3-erasure-and-console.md:1681-1683
- 错误做法: 预演的 run 计数直接调 store 的正常初始化路径。
- 症状: 那会**写盘**——预演必须是只读的。
- 根因: "读取"在带缓存的 store 上隐含"初始化副作用"。
- 正确做法: `countRunsForConversations()` **只读 `index.json`，绝不 initialize**；执行侧 `eraseRunsForConversations()` 走 `HarnessRunStore.deleteConversation()`（一并清 session 文件、`.events.jsonl` 与 index 行），无事可做时**不碰 store**。加用例锁"预演只读"。
- 类型: 架构与实现
- 等级: M

### R148
- 出处: SELF-update 260925/phase3-p3-erasure-and-console.md:1706-1713
- 错误做法: 弹窗文案写「彻底擦除…的**全部痕迹**」，且不在 UI 里说明保留了什么。
- 症状: 文案超出证据（见 R138），用户无从知道还有 4~6 类东西被有意保留；若进一步把语料路径塞进预演负载，还会让 §0.4 约束 2 的断言失效。
- 根因: 文案的强度与"边界清单"脱钩；而边界清单又只有主进程知道。
- 正确做法: i18n `planLead` 从「全部痕迹」改成「擦除…的**对话与记忆痕迹**」；`confirmMessage`（zh/en）同样收敛，并写明"有意保留的部分已在预演里列出"；预演新增 **`preservedPaths`** 字段——由**主进程**把 `MEMORY_PRESERVED` 交给 UI（**UI 不硬编码**），弹窗用 `preservedLead` + 逐条本地化标签列出（缺 label 时退回路径本身）。⚠️ 交付给 UI 的是 **`MEMORY_PRESERVED_FOR_UI`（不含群聊语料）**：语料在弹窗里有自己的一行，而预演负载里出现语料路径会让"擦除链路负载不含语料字面量"的断言失效——那条断言守的是**链路不碰语料**，不该因为文案需要而被削弱。
- 类型: 文档与判据
- 等级: H

### R149
- 出处: SELF-update 260925/phase3-p3-erasure-and-console.md:1715-1718
- 错误做法: 期望实体图里"由他的记忆派生"的非人节点（`杭州 / 成都 / Rust`）能一并删掉。
- 症状: §2.9 的删除判据只匹配 `type === "person"` → 这类节点**结构上删不掉**，而它们的 `mentionCount` 正是来自他那几条记忆。
- 根因: 判据按"节点类型"划分，而残留按"数据来源"产生；两者的切面不同。
- 正确做法: 遍历非人节点，若其 `name` 出现在**任一将被删除的记忆正文**里，就以 `entityDerived` 进残留清单（附"出现在他的记忆里：…"的片段）。**只列不改** —— 误删地点会连累别人的提及。
- 类型: 架构与实现
- 等级: M

### R150
- 出处: SELF-update 260925/phase3-p3-erasure-and-console.md:1720-1726
- 错误做法: 只处理"会被删掉的行"，不管"按新判据不会被删、但显然在复述他的人"的行。
- 症状: 旧版本擦除留下的**孤儿 assistant 行**（user 行早被删、配对信息不存在）既不在删除集里、也不会被报告，等于静默保留。
- 根因: "删除"与"看得见"是两个不同的义务；只做前者会让不可判定的残留变成不可见。
- 正确做法: 启用声明已久的 `assistantText` 档：在他的会话里，assistant 行提到他的别名、**且按执行侧同一判据不会被删** → 进残留清单。这一档出现在弹窗里，就是"**重跑不会自动收敛**"的凭据。⚠️ **已知边界（如实记录）**：**一个字都没提他**的孤儿回复（真实现场的 `学做菜好呀…`）在"他的行已消失"之后**没有任何结构化判据能定位** —— 它既进不了删除集也进不了这一档残留；对**首次就用新代码擦除**的现场不存在这个问题（配对成立）。
- 类型: 文档与判据
- 等级: L

### R151
- 出处: SELF-update 260925/phase3-p3-erasure-and-console.md:1728-1732,1868,1877
- 错误做法: 判据写"grep 出的每一处 `"qq:10001"` 都落在某条 `subjectIds` 里"。
- 症状: 实测擦除会往 `memory-trace.log` 里写带 `personKey` 的**删除动作记录**（`l2.delete.batch` / `transcript.erase` / `runs.erase` …）→ 6② 判据出现 **6 处额外命中**、6e 判据"trace 里 0 命中 `personKey`"直接 ❌。
- 根因: trace 是 §2.11 / Q3 明确保留的**审计载体**（只记计数与 id 类信息，不记被删正文），它的存在与"0 命中"这条判据天然冲突——判据在设计时没有把"系统自己的动作记录"这一例外列出来。
- 正确做法: 判据补一句"**`memory-trace.log` 例外**"；`checks.mjs` 的 6e 同步从 `✗` 改成 `·`（只报数、不算失败），② 的扫描也跳过该文件。**这是一次判据本身的修正，而不是实现向判据让步。**
- 类型: 文档与判据
- 等级: H

### R152
- 出处: SELF-update 260925/phase3-p3-erasure-and-console.md:1740
- 错误做法: 把"K 类「女朋友是兽医」那句这次没被抽出"当成归属判据的缺陷去修。
- 症状: 同一批 4 轮里，模型对"B 说 A 的私事"**有时抽、有时跳过**（离线复现时抽到了、线上那次 `raw=4` 里没有）；换成"具体事件"（怕坐飞机/把车卖了）并在同一批里放两条之后命中。
- 根因: LLM 判定波动，不是判据问题；判据侧的三条防线（用例 6/7/7b）覆盖的是"映射不上就丢弃"，本来就允许"没抽到"。
- 正确做法: 登记为"**已知行为，非缺陷**"，并记录让它稳定命中的做法（用具体事件、同一批放两条）；不要把模型波动写成产品缺陷，那会导致错误地放宽判据。
- 类型: 文档与判据
- 等级: M

### R153
- 出处: SELF-update 260925/phase3-p3-erasure-and-console.md:1744-1745
- 错误做法: 想给某条记忆"重建向量"时无条件调 `addL2MemoryVector`；或相信 `JsonVectorStore.addUnique()` 的"unique"语义。
- 症状: **名字骗人**：`addUnique()` 实现是"直接 `addPreparedBatch`"，**没有** `add()` 那套相似度去重（`add()` 用 `search(..., 0.95)` 做语义去重）。任何"先删后建"的写法一旦只删了一半，就会留下**同一 `l2Id` 的重复向量行**；而重复行会让 `rag/index.ts` 的"`metadata.l2Id` ↔ `L2.ragId` 双向一致"检查把其中一行判成孤儿。
- 根因: 函数名承诺了实现不提供的性质，调用方按名字推断行为。
- 正确做法: P3.5 重建向量前**先确认该条当前有没有向量**，别无条件 add；凡涉及向量写入，行为以实现为准，不以命名为准。
- 类型: 架构与实现
- 等级: M

### R154
- 出处: SELF-update 260925/phase3-p3-erasure-and-console.md:1747-1748
- 错误做法: 以为"被压缩"等于"向量被删"，于是对 `archived` 条目做特殊处理，或在清向量时一并清掉它们。
- 症状: 压缩**不删**子条目的向量，只是把它们 `archive` —— `status: archived` 的条目仍有健康的 `ragId`，只是被 `isL2LocallyRecallable` 的状态过滤挡在召回外。"被压缩"与"被删向量"是两件事。
- 根因: 两个维度（状态、向量）被当成一个维度；状态变更被误认为资源回收。
- 正确做法: P3.5 做召回过滤时 `archived` 条目**不需要特殊处理**（现有过滤已经够了）；反过来，**任何按 `ragId` 清向量的动作都要先确认它对应的是"要删"还是"只是被压缩"**。
- 类型: 架构与实现
- 等级: M

### R155
- 出处: SELF-update 260925/phase3-p3-erasure-and-console.md:1750-1753
- 错误做法: 把"谁是说话人、谁是主语"的判定逻辑在擦除、召回、UI 三处各写一遍。
- 症状: 三份判据会漂移，而漂移的后果是"删错了"或"召回时说错了"。
- 根因: 判据没有被沉淀成可复用件，每次新需求都重写一遍。
- 正确做法: 沉淀成**三层可复用件**，P3.5 直接取用：**纯函数层** `computeEraseHits` / `buildPrivateSessions` / `buildSpeakingSessions`（`person-erase-plan.ts`）+ `matchesRemovedUserTextFingerprint`（`relationship-log.ts`）；**展示层** `memory-console.ts` 的 `own` / `mentioned` 分组判据（`isOwnMemory` / `isMentionedMemory`，与删除判据同源）；**失效层** `l2DmaeManager.loadStates()` 被正式当作"官方失效姿势"用了一次。
- 类型: 架构与实现
- 等级: H

### R156
- 出处: SELF-update 260925/phase3-p3-erasure-and-console.md:1755-1756
- 错误做法: 让每个调用方自己写一遍 `safeName` 规则（`replace(/:/g, "_")`）。
- 症状: `safeName` 把 `:` 换成 `_` 是**有损**的（渠道 id 允许含 `_`），规则一变所有副本静默错位；而 `history-log.reloadAllHistory()` 那个 `name.replace(/_/g, ":")` 反推 bug **仍在**（记为 §8.2 的 O6，本阶段没碰）。
- 根因: 编码规则被复制而不是被导出；"文件在哪个目录"这类知识散落在调用方。
- 正确做法: `transcriptFileBase()`（原 `safeName`）**必须导出**，把 fs/app 用法留在同一模块里（`pruneEmptyArchiveDirs()` 同理）；sessionId ↔ 文件名的映射只能靠**权威名册**。
- 类型: 架构与实现
- 等级: H

### R157
- 出处: SELF-update 260925/phase3-p3-erasure-and-console.md:1758
- 错误做法: 起草 `transcript-erasure.ts` 时为了拿 `path` 顺手写了 `require("node:path")`。
- 症状: 实测在 **vitest / ESM 下不可用**（P2 §3.6 新发现 3 的延续，又差点踩到一次）。
- 根因: CommonJS 习惯在 ESM 产物里的惯性使用；该错误只在测试/打包环境暴露，dev 直跑可能不报。
- 正确做法: 改为从 `history-log` 导出 `pruneEmptyArchiveDirs()`，把 fs/app 用法留在同一模块里；**新增文件时先确认模块系统的 import 形态**（顶部 `import * as path from "node:path"` 才是对的，phase2:399 即如此）。
- 类型: 命令与脚本
- 等级: L

### R158
- 出处: SELF-update 260925/phase3-p3-erasure-and-console.md:1760
- 错误做法: 语料不变性断言只比较内容（或只比较 mtime）。
- 症状: **只比内容会漏掉"重写了一遍同样的内容"**；**只比 mtime 会漏掉"改了内容但 mtime 精度不够"**。
- 根因: 单一指纹无法同时覆盖"内容相同但被改写"与"内容不同但时间戳未变"两类事件。
- 正确做法: 用 `sha256 + mtimeMs` **双指纹**；且断言必须用**真实文件**（集成用例 2b / isolation 新增用例）。
- 类型: 验证方法
- 等级: H

### R159
- 出处: SELF-update 260925/phase3-p3-erasure-and-console.md:1762
- 错误做法: 预演报告只列"会删什么"，不列"会整份销毁什么"的大小。
- 症状: `memory.backup.*.json` / `memory-reconcile-backups/` / `chat-api.log` 三项是**不可逆**的，且前两项会让"备份回退"这条退路消失 —— 用户在看到报告时并不知道自己正在放弃回退能力。
- 根因: 报告按"删除量"组织，没有按"可逆性"组织。
- 正确做法: §2.11 的"预演必须列出大小"是**硬要求**，UI 侧显式列出这三项（已实现，有用例）。
- 类型: 文档与判据
- 等级: H

### R160
- 出处: SELF-update 260925/phase3-p3-erasure-and-console.md:1764
- 错误做法: 测试断言 `deleteAllMemory().deleted` 里"全是相对路径"。
- 症状: 该字段现在会**混入绝对路径**（备份项来自 `listMemoryBackupTargets`，返回绝对路径；其余仍是相对 userData 的路径）。
- 根因: 两类目标的路径基准不同（有的在 userData 下、有的需要 glob 展开），而返回值用了同一个数组。
- 正确做法: 测试断言别写死"全是相对路径"；要么统一基准，要么在类型/文档上写明混合语义。
- 类型: 验证方法
- 等级: H

### R161
- 出处: SELF-update 260925/phase3-p3-erasure-and-console.md:1766-1775
- 错误做法: 按"文件清单"清点要擦除的痕迹（`PERSON_ERASABLE` 只覆盖载体的一部分）。
- 症状: §5.2 第 5 步之后实测到的残留形态**至少有 6 类**：结构化记忆（`memory.json` ✅）/ 记忆的向量副本（`user_memory_*` ✅）/ **对话的向量副本（`chat_history_*`，原来完全没碰且启动对账也看不见）** / 逐轮 transcript（✅ 含 D5 修复）/ **agent 运行的对话副本（`cyrene-runs/sessions/*.json`，逐字正文，边界未定义）** / 配置与派生物（`channels-settings.json`、`zones.json`、`entity-graph.json` 的地点节点）。
- 根因: 痕迹会以"副本"形式存在于多个载体，而清单是按"功能模块"编的，副本落在模块之外。
- 正确做法: **按"痕迹的形态"逐类清点，而不是按"文件清单"**。给 P3.5 的硬结论：**只要某条痕迹同时存在于"原始载体"和"向量/副本载体"里，单删原始载体就等于没删 —— 而且向量副本是会被模型读到的，比原始载体更危险。**
- 类型: 架构与实现
- 等级: H

### R162
- 出处: SELF-update 260925/phase3-p3-erasure-and-console.md:1777,1837-1844
- 错误做法: 用"数据副本 + 真实代码路径"产出对照值（ground truth）时，按**已知文件名**逐个人工拷贝副本。
- 症状: 第 4 步的残留数一开始对不上（**弹窗 3 / 我的 ground truth 2**），差点被记成产品缺陷。根因是**沙箱只拷了已知文件名、漏掉一个 `.p0-backup`**（`channels/` 下确实有**两个**孤儿文件）。**弹窗是对的。**
- 根因: 对照值的可信度依赖于副本的**完备性**，而"完备性"这件事本身没有被断言；漏拷文件必然表现为"假阴性"（把产品算少了/算错了）。
- 正确做法: 把沙箱改成"**整目录拷贝 + 只排除 Electron 缓存**"（`p3-verify/sandbox.mjs`），从根上消除"漏拷文件 → 假阴性"。方法论结论：**验证工具本身必须被验证** —— 凡是用"数据副本 + 真实代码路径"产出的对照值，副本的完备性本身就是断言的一部分；对照值的可信度必须先于结论。
- 类型: 验证方法
- 等级: H

### R163
- 出处: SELF-update 260925/phase3-p3-erasure-and-console.md:1790
- 错误做法: 用主模型跑 memory 的结构化输出（judge）。
- 症状: 该端点（`[抗截断B]gemini-3.8-flash`）**非流式请求恒返回空 `content`，正文全进 `reasoning_content`**，而 `openai-adapter.parseResponse` 只把 `content` 当正文 → 结构化管线永远拿不到内容；且它跑 judge prompt 要 **49s**（小请求也要 26s）。实测：小请求 26.2s、judge prompt 49.4s、`json_object` >120s、`json_schema` HTTP 400（`judge-endpoint-diag.cjs`）。
- 根因: 结构化输出依赖"正文通道"，而该端点的正文通道被推理内容占满；同时延迟与 schema 支持度都不满足要求。
- 正确做法: 换用专用记忆模型（见 R164），不要在一个不支持结构化输出的端点上调 prompt。
- 类型: 环境
- 等级: M

### R164
- 出处: SELF-update 260925/phase3-p3-erasure-and-console.md:1791
- 错误做法: 到处找"为什么 judge 不工作"，而不知道存在专用记忆模型配置。
- 症状: judge 每次都超时/协议错误，看起来像代码问题。
- 根因: `memory-llm-shared.ts` 里已有"专用记忆模型"配置（`memoryProvider/memoryBaseUrl/memoryModel/memoryApiKey`），但 **UI 未暴露**，容易被忽略。
- 正确做法: 实测 `SiliconFlow / Qwen/Qwen3-14B`：judge prompt 一次通过 **19.4s**、`finish=stop`、3 条 L2 全带 `subjectNames`。验证方式：**离线用 dist 里真实 judge 代码路径复现**（stub electron + 真实 prompt/schema/pipeline，`judge-probe*.cjs`）。并建议把该配置暴露到 UI。
- 类型: 环境
- 等级: M

### R165
- 出处: SELF-update 260925/phase3-p3-erasure-and-console.md:1792,1873
- 错误做法: 用手工验证判据"**全树逐字节不变**"来证明"擦除没有碰语料"。
- 症状: 实测 50 秒内：语料总字节 **304832 → 305379**（14 个群里 **12 个**在长，别的群同时在聊天），而测试群 `543627098` 那一个 4628B 逐字节不变 → 该判据**必然误报**（把"别的群在正常聊天"记成"擦除动了语料"）。
- 根因: 判据的作用域包含了与被测操作无关的活数据；"不变"这个断言在持续写入的系统里不成立。
- 正确做法: 判据改成三条：① 群 G 的语料逐字节不变；② 其余语料只允许**纯追加**（旧内容是新内容的前缀，靠 `snapshot.mjs` 新加的逐行哈希判定）；③ 没有任何语料文件被删或变小。已用真实 churn 验证通过。
- 类型: 验证方法
- 等级: H

### R166
- 出处: SELF-update 260925/phase3-p3-erasure-and-console.md:1802
- 错误做法: 以为"每条记忆唯一"，按条数核对记忆是否重复。
- 症状: **观察 O1（既有行为，非 P3 缺陷）**：judge 的批次是"最近 8 轮"、每次重叠 2 轮，而 store 对内容不做去重，所以 `小明计划下个月搬去杭州` / `小明喜欢跑步` 各被抽了两次（`#3/#5`、`#4/#6`）→ 9 条里有 2 条是重复。
- 根因: 批次重叠 + 写入侧无内容去重；两条同义记忆各自有独立 `l2Id`/`ragId`，所以删除与擦除不受影响，但记忆会膨胀。
- 正确做法: 明确"对 P3 无影响"；若将来要控制膨胀，**去重点在写入侧（不是删除侧）**。
- 类型: 架构与实现
- 等级: M

### R167
- 出处: SELF-update 260925/phase3-p3-erasure-and-console.md:1811,1833
- 错误做法: 单条删除后只看 `l2` / `evidence` / `l2DmaeStates` 三个计数。
- 症状: 三项都 ✅ 少 1，但"该条 `ragId` 在向量库 0 命中"的期望值 0 实测 **仍命中 1 次**（向量库 21 条不变，文件 mtime 停在写入那刻）。复测（D1 修复后）时，除计数外还多了两条断言才真正证明修复：向量库总数 20 → **19**、并且"消失的正好是目标那一条"（`user_memory_1790341429296_0_duop`，无新增、无误删第二条），以及"文件是否真被重写"= **mtime 前进**（`memory-store.json` 21:14:53 → **21:30:18**，是这次删除请求自己写的，**不是**启动对账兜的底）。
- 根因: 判据只看"结构计数"，没有验证"目标对象本身消失"与"写动作确实发生"。
- 正确做法: 删除类验证至少三条：① 计数变化；② **按 id 精确断言目标消失且无副作用**（无新增、无误删）；③ **mtime 前进**（区分"请求自己写的"与"启动兜底"）。
- 类型: 验证方法
- 等级: H

### R168
- 出处: SELF-update 260925/phase3-p3-erasure-and-console.md:1815-1823
- 错误做法: 用"删完立刻看向量文件"之外的方式判断"删除是否彻底"。
- 症状: 第 3 步"重启不复活"反而**顺带反证了 D1**：孤儿向量被启动对账回收（21 → 20，`memory-reconcile-backups` 也随之生成）。也就是说，缺陷的可见窗口只在"删完之后、下次启动之前"。
- 根因: 存在一条**兜底路径**（启动对账）会掩盖上游的漏删；兜底让缺陷"最终一致"但"短期可见"。
- 正确做法: 承认并写明"只删 L2 不删向量 → 会被对账回收（但期间仍可被召回命中）"这一窗口；判据必须在**窗口内**取值（删完立刻查）。
- 类型: 验证方法
- 等级: H

### R169
- 出处: SELF-update 260925/phase3-p3-erasure-and-console.md:1837-1844
- 错误做法: 发现"弹窗显示的残留数（3）与自己的 ground truth（2）不一致"时，倾向先怀疑产品。
- 症状: 差点把**工具缺陷**记成产品缺陷。
- 根因: 对照实验里"被测系统"与"测量工具"的出错概率没有被分开评估；工具是自己写的，反而默认它是对的。
- 正确做法: 先验证工具（见 R162），再下结论；文档明确写"**一处差异，且是验证工具自己的问题**……**弹窗是对的**"，并记录修复（整目录拷贝）。教训原文："**对照值的可信度必须先于结论**；这一次差点把工具缺陷记成产品缺陷。"
- 类型: 验证方法
- 等级: H

### R170
- 出处: SELF-update 260925/phase3-p3-erasure-and-console.md:1890-1892
- 错误做法: 第 8 步（重置验收）在主测路线——**主人的私聊**里做。
- 症状: 私聊路线**不成立**：主人的私聊域算 **root 域**（`l2Only=false`），实测那一轮 `judge.result` 是 `raw:1 kept:1 **layers:["L1"]**` → 写进 `l1.recentGoals`，`l2` 不动。而第 8 步的判据是 L2 字段，**只能在非 root 域满足**。
- 根因: 验收场景的选择没有核对"该场景下被测字段是否会产生"；域类型决定了能产出哪一层记忆（见 R133）。
- 正确做法: 改在群里（非 root 域）再发 4 句（`roundCount` 32 → **36** 触发 judge）；实测三条新记忆全部 `syncStatus: synced`，向量库 14 → **17**，关系日志新增 11 条 `personKey=qq:2914636187` 条目 → **「重头再来」成立**（他不是被拉黑，而是从零重新被认识）。
- 类型: 验证方法
- 等级: H

### R171
- 出处: SELF-update 260925/phase3-p3-erasure-and-console.md:1923-1925,1944
- 错误做法: 现场复测发现"擦除后仍有 6 行泄漏句留在群里"，判定为 D5 修复失败/回归。
- 症状: 现场那次 D5 只"**砍中一半**"。
- 根因: 那些行的 user 行是**擦除 #1（旧代码）**删掉的，于是这些回复**变成了孤儿** —— 新判据的"轮次配对"要求"上一行是他的行"，而那一行已经不在了。**这是历史残留，不是回归。**
- 正确做法: 用决定性证明区分二者：`d5-proof.cjs` 把**擦除 #1 之前**的整份备份（含**原始顺序**）复制成沙箱，stub electron 的 userData，用 `dist` 里真实的 `previewPersonErase` + `executePersonErase` 走一遍 → 群 G transcript 48 → 11（他的行 17 → 0、她的行 23 → 3、**泄漏句残留 10 → 0，包括那行"一个字都没提他"的**、B 的行 8 → 8），向量库 19 → 5、`chat_history` 12 → 3（留下的正是 K 类与别的 turn 的两条），他的私聊文件整份删除 ✓。**结论：新判据本身是对的；现场那一半残留是旧代码留下的孤儿。**
- 类型: 验证方法
- 等级: H

### R172
- 出处: SELF-update 260925/phase3-p3-erasure-and-console.md:1951-1960
- 错误做法: 在擦除完成后过一段时间再核对"transcript 里他的行 0 条"（§5.2 第 6③ 条）。
- 症状: **复测时就出现了这种情况**：擦除后他又开口说话，这条断言自然会有行 → 看起来像擦除失败。
- 根因: 该断言是**时点断言**（只在"擦除刚完成的那一刻"成立），而核对时机由人的操作节奏决定，天然漂移。
- 正确做法: 文档明确写明"第 6③ 条是擦除那一刻的断言，之后他再说话自然会有行——复测时要按擦除刚完成的那一刻取值"；同类时点断言要在判据表里逐条标注。
- 类型: 文档与判据
- 等级: H

### R173
- 出处: SELF-update 260925/phase3-p3-erasure-and-console.md:1498-1499
- 错误做法: 文档里给出 `npx vitest run` / `npx tsc` 等命令让 Agent 直接执行。
- 症状: **本机 PowerShell 会拦截 `npx.ps1`**（执行策略），命令跑不起来；而失败看起来像"测试没跑"而不是"命令没用对"。
- 根因: 命令写法依赖宿主环境的执行策略，文档默认了"npx 可用"。
- 正确做法: 实际用 `node node_modules/vitest/vitest.mjs run` / `node node_modules/typescript/lib/tsc.js` / `node node_modules/vite/bin/vite.js build`，或 `npx.cmd`。（总览 §7:632 与 phase3-p1:531-533 都记了同一处置。）
- 类型: 命令与脚本
- 等级: L

---

## 八、phase3-person-memory-overview.md（阶段总概览，H 组）

> 本文件是 P0–P3 的**总概览**，其"施工记录"分散在 §3.4–§3.8 与 §4/§8。下面只收**它作为第一手记录**的条目；与 P1/P2/P3 文档重复的结论已在正文标注"与 Rn 同源"。

### R174
- 出处: SELF-update 260925/phase3-person-memory-overview.md:11-21
- 错误做法: 把"串记忆"当成一个问题来修。
- 症状: 实际有**三种**「串记忆」，只修了两种：域间串（Phase 2 已修）、群内跨人串（P2/P3 修了归属与删除）、**域内跨人串 —— ❌ 未修，且无字段可依**（"小明的记忆被拿去回复小红"）。
- 根因: "串味"是一个症状族，不是单一缺陷；不先分类就会修完一种以为全好了。
- 正确做法: 开工前先把症状拆成互斥的几类，逐类标注"在哪修、靠什么字段判"；无字段可依的那类要显式登记为"未修 + 需要新增数据"（这一类被推到 P3.5）。
- 类型: 架构与实现
- 等级: H

### R175
- 出处: SELF-update 260925/phase3-person-memory-overview.md:23-53
- 错误做法: 认为"串记忆"的根因在上下文装配层。
- 症状: 逐层核实后发现**根因只有两条**，而**上下文层其实早就做对了**（`buildAlwaysOnContext` 的注入顺序与域过滤本来就是对的）。
- 根因: 症状出现在"最终回答"里，但产生它的环节可能在更下游（存储层的归属缺失 + 召回层无人物过滤）。
- 正确做法: 归因时把"症状出现的位置"与"缺陷产生的位置"分开；先证明每一层各自是对的，再定位唯一出错的那层。
- 类型: 文档与判据
- 等级: L

### R176
- 出处: SELF-update 260925/phase3-person-memory-overview.md:72,78,388
- 错误做法: 让 `subjectIds` 同时承担"展示归属"与"删除判据"两个角色。
- 症状: 若 `subjectIds` 参与删除，就会把"别人提到他"的记忆一并删掉 —— 而那常常是**别人的经历片段**（"我和小明去看漫展"）。
- 根因: 一个字段被两个目标争用；两个目标的正确答案不同（展示要全，删除要窄）。
- 正确做法: `subjectIds` 只服务「按人浏览」的展示与 P3.5 的召回重排，**不再参与任何删除判据**（P3 用类型设计锁住，见 R109）；判据是「来源」而不是「名字」（见 R118）。
- 类型: 文档与判据
- 等级: H

### R177
- 出处: SELF-update 260925/phase3-person-memory-overview.md:139,203-212
- 错误做法: 把 `channels/context-bindings.json` 的 `externalChats` 当成可以随手清理的绑定残留。
- 症状: 它同时是**区块成员选择器的唯一数据源**（`zones/picker.ts:36,46,64`）与"手动加群后补全群名"的来源（`zones/manual-group.ts:83`）—— 删掉它，区块就选不出成员了。
- 根因: 数据的"写入方"被删掉后，它的"读取方"仍在生产使用；清理时按写入方判断去留，必然误删。
- 正确做法: 删除任何字段/文件前先做**读取方普查**；P0 专门维护"必须保留（别误删）"清单并逐条复核（§3.2 F）。
- 类型: 架构与实现
- 等级: H

### R178
- 出处: SELF-update 260925/phase3-person-memory-overview.md:176,190,266
- 错误做法: 删 UI 元素时只删 HTML 或只删 `dom.ts` 引用的一侧。
- 症状: `dom-refs-consistency.test.ts` 会校验 HTML id 与 `dom.ts` 引用**双向一致** → 只删一侧会让测试变红（`zones-markup.test.ts` / `memory/panel.test.ts` 同理）。
- 根因: id 是 HTML 与 TS 之间的**接口**，两侧由不同文件维护。
- 正确做法: 两边必须同删；并把"某个面板的 id 必须都落在特定容器段内"写成测试（P3 的 `#memory-panel` 是硬要求，因为 `memory/panel.test.ts:9-29,42` 会把该段整体抽出来注入 jsdom，段外的 id 在测试里根本不存在）。
- 类型: 架构与实现
- 等级: H

### R179
- 出处: SELF-update 260925/phase3-person-memory-overview.md:231-239
- 错误做法: 按清单逐条删，清单只写"删三个导出"。
- 症状: **五处连带改动是清单没写到的**：① `conversation-binding-api.ts` **只**服务绑定 UI，删完就空了 → 整个文件 + `.test.ts` 一起删；② `index.html` 的整张「上下文绑定」卡片（同卡片里另 4 个 id 服务于同一套已删除的 IPC，留着就是死 UI）→ 整张删除；③ `zones/panel.ts` 的 i18n 模板 `私聊映射：{{name}} → {{conversation}}` 里的 `{{conversation}}` 永远取不到 → 模板简化；④ 两个测试文件里的 `ChannelsSettings` 字面量有三余属性 → `satisfies` 报错；⑤ 旧文件兼容"仅不校验还不够"（见 R180）。
- 根因: 清单按"导出/函数"枚举，而真实的删除边界是"**这张卡片 / 这套 UI / 这条 IPC 的全部消费者**"；删到边界的粒度比清单大。
- 正确做法: 删除前先按"消费面"画出完整边界（文件是否空掉、卡片是否有死 UI、i18n 模板的变量是否还能取到、测试字面量是否多余），把这些作为"清单外必查项"写进规范。
- 类型: 架构与实现
- 等级: H

### R180
- 出处: SELF-update 260925/phase3-person-memory-overview.md:239
- 错误做法: 旧配置兼容只做"**不校验**未知字段"。
- 症状: 旧文件的 `bindings` 字段会被**原样留在内存里**，下一次 `persist()` 又**写回磁盘**，永远清不掉（"忽略"变成了"搬运"）。
- 根因: 读取侧的宽容没有配上写入侧的白名单；序列化时用的是"内存里有什么就写什么"。
- 正确做法: `PersistedBindingState` **不声明** `bindings`，读取只校验自己认识的字段，写回时该字段自然消失；并加测试锁住（含"重启后磁盘上不再有 bindings"）。
- 类型: 架构与实现
- 等级: H

### R181
- 出处: SELF-update 260925/phase3-person-memory-overview.md:247-250
- 错误做法: 以为删掉镜像功能只是"少写一份数据"，语义不变。
- 症状: 两处行为语义确实变了：① **并发模型变了** —— 删掉 `queue.run("conversation:<id>")` 这层嵌套后，两个**不同**外部会话不再因为绑到同一个桌面对话而互相串行（只有同一 `external:<sessionId>` 仍串行）；② `conversation-binding-store` 的**裁剪语义变了** —— 从"已绑定会话优先保留"变成"最近活跃的优先保留"。
- 根因: 功能的"副作用"（串行化、保留优先级）没有被登记为契约，删除时只看了主功能。
- 正确做法: 施工记录里把语义变化单列一节（"行为上唯一需要注意的两点"），并把相关用例**改写为锁住新语义**（`dispatcher.test.ts` / `conversation-binding-store.test.ts`）。
- 类型: 文档与判据
- 等级: H

### R182
- 出处: SELF-update 260925/phase3-person-memory-overview.md:252-256
- 错误做法: 用"用例数是否增加"判断回归质量。
- 症状: 施工后 `vitest run` 是 **484 文件 / 4296 通过**（施工前 486 / 4321）—— 文件与用例数**都减少了**（-2 文件 / -25 用例），只看增减会误判为"删功能删过头"。
- 根因: 用例数的变化同时含"被删测试"与"新增测试"，一个净值无法表达两个方向。
- 正确做法: 在验收表里**逐个说明差额来源**：-2 文件来自 2 个被整体删除的绑定专属文件（`conversation-binding-api.ts` + `.test.ts`、`useChannelMirrorEvents.ts` + `.test.ts`）与各套件中被删/被改写的用例；同一批里也**新增**了锁住新语义的用例（`observeExternalChat 把见过的外部会话写进绑定存储`、旧 `bindings` key 兼容、同会话串行 / 跨会话并行）。
- 类型: 验证方法
- 等级: H

### R183
- 出处: SELF-update 260925/phase3-person-memory-overview.md:270-273
- 错误做法: 直接按现状验证"渠道消息不再镜像进桌面对话"。
- 症状: 会得到**假阴性** —— 原始那条私聊绑定指向的桌面对话（`c9a20793-…`）**已被删除**，而 `resolveBoundConversationId` 会校验桌面对话是否存在，因此原状态下它本来就返回 `null`，镜像路径**根本不可达**。
- 根因: 前置数据缺失导致"要测的路径"在物理上走不到；而"没发生"被误读为"验证通过"。
- 正确做法: 先把该绑定**改指向一个仍存在的桌面对话**再做验证，镜像路径才真正可达；并留下备份（`%APPDATA%\live2d-cyrene\channels\context-bindings.json.p0-backup`）。这条被显式标为"**验证 1 的方法学要点（下次复用）**"。
- 类型: 验证方法
- 等级: H

### R184
- 出处: SELF-update 260925/phase3-person-memory-overview.md:275-288
- 错误做法: 把手工验证期间观察到的一切异常都归到本次施工。
- 症状: 三件事各自有归属：① **模型把元叙述当正文吐出来**（私聊那轮 assistant 正文是"用户发送了"测试~"，需要确认连接正常…" + 真回复）—— 逐层排查确认渠道侧的 reasoning 分流是正确的（`openai-normalizer.ts` / `accumulator.ts` / `cyrene-harness.ts` 三处都没把思考混进正文），**结论是模型把元叙述写在了 `content` 通道里**，且该轮无工具调用 → 被 `commitProgressBuffer()` 直接 commit 成 `finalAnswer`；桌面路径共用同一套 harness/accumulator，**故不是渠道特有回归**。② **已知遗留（施工前就存在）**：`channels/panel.ts` 的 `hadQqToken` 在 `try` 内声明、却在 QQ 保存处理器里使用（**TS2304**），删掉绑定/镜像代码后该问题仍在，**未修**。③ **门禁局限**：渲染进程无 tsconfig、`vite build` 走 esbuild 不做类型检查（与 R104 同源）。
- 根因: "施工期间发现的"不等于"施工引起的"；归因需要把每条链路的每一层各自证伪。
- 正确做法: 单列"手工验证期间发现（**均与 P0 无关，另立议题**）"一节，逐条给出排除过程与最终归属，避免下个阶段重复排查。
- 类型: 文档与判据
- 等级: H

### R185
- 出处: SELF-update 260925/phase3-person-memory-overview.md:489-499
- 错误做法: 沿用"每个缓存都需要一个 `reload()`"的判断。
- 症状: 逐项核实后**其中两条与原判断不同**：① `memoryStore.cache` **不需要**新增 `reload()`（所有写路径都是「mutate 缓存对象 + `save()`」，缓存与磁盘始终同源），但 `getAllL2()` 返回**数组引用**（`:364-367`），`store.l2 = filter(...)` 会换掉数组身份 → 删除后必须重新取（与 R108 同源）；② `l2DmaeManager` **有现成的全量失效入口** `loadStates()`（`:77-91` 内部 `dmae.clear()` + 按 store 重建）→ 擦除后直接调用，**无需新增 API**。
- 根因: 缓存清单按"名字"罗列，没有逐项核实"缓存与事实源是否同源"以及"是否已有失效入口"。
- 正确做法: 缓存清单要逐项给出"现状与处置"三态（✅ 不需要动 / ⚠️ 需要新增入口 / ❌ 接受残留），并写明判据。本清单里 5 项需要新增入口、2 项不需要动、1 项明确接受残留（jieba 自定义词表只增不减、无移除 API → 只影响分词，不影响"认识"）。
- 类型: 文档与判据
- 等级: M

### R186
- 出处: SELF-update 260925/phase3-person-memory-overview.md:636-663
- 错误做法: 把跨阶段风险写成"注意事项"，不落到可判定的状态。
- 症状: 风险总览里有多条**已经发生**的事实被归在"风险"标题下，容易被读成"可能发生"：**「单人发言」被误判成「单人会话」→ 公共记忆挂错人** —— ⚠️ **实际发生过**（P2 原文的兜底判据被新用例证伪，已改用 `chatType === "private"`）；**群 transcript 过滤重写与并发追加冲突** —— ⚠️ **原方案（走 `KeyedQueue`）不成立**（队列实例不可从模块外取得，且两条写路径根本不在队列里），改用"同步重写"这条更强也更简单的保证；**擦除流程误碰群聊语料** —— ⚠️ P3 原方案确实打算"擦除某人的语料行"，已按用户要求**整个撤掉**；**P2 做完后「串味」与「针对性回复」都还没解决** —— ⚠️ **确定发生**，非风险而是设计取舍；**存量数据无法回填** —— 明确不做，UI 标"来源未知"。
- 根因: 表格用同一列承载"未来风险"与"已发生事实"，两者的处置动作完全不同（前者要缓解，后者要修复/接受）。
- 正确做法: 风险表增加"状态"语义（推测 / 已发生 / 已消除 / 有意接受），并对"已发生"的条目指向修复记录或明写"接受"。
- 类型: 文档与判据
- 等级: H

---

## 附录 A · 抽取方法与可信度说明

- **行号口径**：本目录的 markdown 文件存在混合换行符（例如 phase3-p3 用 `Get-Content` 数得 1460 行，而按 `\n`/`read` 口径为 1977 行 —— 与任务简报给出的行数一致）。**本台账所有行号均取后者**，即 `read` 工具与 `grep` 工具的行号，与简报标注的总行数同源。
- **每条都回到原文那一行确认**：出处为"证据所在行"，不是"章节起始行"；跨多行的证据写成 `文件名:起始-结束`。
- **未收录的相邻内容**：纯操作步骤（如"用账号 A 在群里发…"）、纯代码清单（如 §3 逐文件改动里的完整实现）、以及正面实践（不属于反例）不单独成条；但"正面实践若本身来自一次反例的修正"（如 R64 的"先写回归测试"、R162 的"验证工具必须被验证"）则收录，因为它们是可复用的纪律。
- **跨文档交叉发现**：少数条目的"根因/症状"需要用同批另一份文档的实测事实才能完整表述（如 R4 用 phase3-p1:609 的 sessionId 形态、R26 用 phase3-p1:612-641 的样本丢失、R6/R69 用三份文档的提交状态互证）。这类条目已在正文注明引用来源，不改变其"原文档确有该做法"的事实性。

## 附录 B · 跨文件线索核实（**不属于本 8 份文档**）

任务简报里给的"重点线索"中有 10 条**在本 8 份施工文档中并不存在**。逐条全仓检索后，它们的真实出处如下（同一五元组格式，编号 X 系列，**不计入 R 台账条数**）：

### X1 · `@(...)` 包裹 GroupInfo 破坏 `.Count`
- 出处: task-仓库合并/PHASE-4-处理删除类冲突.md:390；task-仓库合并/PHASE-3-完成报告.md:260；task-仓库合并/PHASE-4-完成报告.md:402
- 错误做法: 用 `@($g | Where-Object Name -eq 'UU').Count` 数冲突条数（`$g` 是 `Group-Object` 的产物）。
- 症状: 结果**恒为 1**，导致冲突构成被误判为 1/1/1（PHASE-3-完成报告记为"**已复现**"）。
- 根因: `@()` 作用在**单个 GroupInfo 对象**上得到的是"含一个元素的数组"，`.Count` 恒为 1；分组结果不是"可计数的行集合"。
- 正确做法: 直接对**原始码列表**用 `$_ -match '^UU'` / `$_ -eq 'XX'` 计数，**不要** `Group-Object` 后再 `@()` 取 `.Count`。
- 类型: 命令与脚本
- 等级: L

### X2 · `2>&1` 污染管道变量
- 出处: task-仓库合并/PHASE-4-处理删除类冲突.md:391；task-仓库合并/PHASE-3-执行合并.md:393；task-仓库合并/PHASE-2-完成报告.md:395；task-仓库合并/PHASE-3-完成报告.md:251
- 错误做法: `git rm ... 2>&1` / `git add -A 2>&1` / `$st = git stash create ... 2>&1`。
- 症状: **stderr 的 warning 被灌进管道变量** —— `$st` 里塞满 `warning: …LF will be replaced…`，后续 `rev-parse` 报 `Filename too long`（PHASE-3-完成报告记为"**已复现**"）。
- 根因: `2>&1` 把 stderr 合并进 stdout 流，于是"命令的输出"不再是"命令的结果"。
- 正确做法: 用 `2>$null` 抑制 stderr，或 `| Select-Object -Last 1` 只取最后一行。
- 类型: 命令与脚本
- 等级: L

### X3 · PowerShell 5.1 的语法与编码限制
- 出处: task-仓库合并/PHASE-4-处理删除类冲突.md:392；task-仓库合并/PHASE-5-移植适配.md:485；task-仓库合并/PHASE-2-合并配置对齐.md:265；task-仓库合并/BLUEPRINT-总蓝图.md:391；task-仓库合并/PHASE-4-完成报告.md:404
- 错误做法: 在脚本里用 `&&` / `||` 连接命令，或在括号内用 `;` 分隔语句，或用 `Set-Content -Encoding UTF8` 写中文再读回。
- 症状: `Missing closing ')'`（括号内不能用 `;`）；`&&` 不可用直接报错；`-Encoding UTF8` 写出 BOM 而读回按 ANSI → **中文乱码**（PHASE-1-完成报告.md:106 记录了该根因）。
- 根因: 本机只有 PowerShell 5.1（无 `pwsh`），其解析器与编码默认值与 7.x 不同。
- 正确做法: 用 `;` 分隔语句（不依赖 `&&`）；读文件一律 `[System.IO.File]::ReadAllText($p, [System.Text.Encoding]::UTF8)`；命令均拆为独立语句。
- 类型: 环境
- 等级: L

### X4 · `git merge-tree … HEAD` 测出 0 个冲突（退化合并）
- 出处: task-仓库合并/PHASE-2-完成报告.md:44,48,60-64,392-393,419-421；task-仓库合并/PHASE-3-执行合并.md:13,388；task-仓库合并/BLUEPRINT-总蓝图.md:105-122
- 错误做法: 执行 `git merge-tree --write-tree --name-only refs/remotes/official/master HEAD`，把输出里的 `CONFLICT` 行数当作冲突总数。
- 症状: **实测 = 0**（只输出一个树哈希 `8d3250ec…`，无任何 `CONFLICT` 行）→ 误判为"完美无冲突"，可以据此开工。而真实合并有 **46** 个冲突。
- 根因: `merge-tree A B` 的语义是「以 `merge-base(A,B)` 为基，合 A 与 B」，此时 `merge-base = HEAD`，**HEAD 一侧没有独有改动 → 退化合并，测不出任何东西**；更关键的是 **`merge-tree` 只读"已提交的树"，完全看不到未提交的工作区**，而本任务的合并主体正是未提交工作。
- 正确做法: **必须先物化工作区**：`$st = (git stash create "m" 2>$null | Select-Object -Last 1)`，再 `git merge-tree --write-tree --name-only refs/remotes/official/master $st`（得 46 个冲突）。所有"用 merge-tree 预估冲突"的操作都要按此口径修正。
- 类型: 命令与脚本
- 等级: L

### X5 · `--reporter=basic` 在 vitest 4 已移除
- 出处: task-仓库合并/PHASE-5-移植适配.md:480；task-仓库合并/PHASE-4-完成报告.md:414；internal-issue/2026-09-06-shell-output-truncation-timeout-known-issues.md:38
- 错误做法: 跑测试时加 `--reporter=basic`（旧版本常用）。
- 症状: `Failed to load custom Reporter from basic` + `Failed to load url basic`，**整个 vitest 启动失败**（看起来像代码坏了）。vitest 4.1.9 已删除 `basic` reporter。
- 根因: reporter 名称随大版本变更；启动失败与测试失败在输出上不易区分。
- 正确做法: 用默认 reporter 或 `--reporter=default`；**不要把这个启动错误误判为测试失败**。
- 类型: 命令与脚本
- 等级: L

### X6 · 冲突块方向易误读 / `if/else` 两侧语义可能颠倒
- 出处: task-仓库合并/PHASE-5-移植适配.md:478-479；task-仓库合并/PHASE-4-完成报告.md:415
- 错误做法: 凭蓝图/文档描述判断"某行属于 ours 还是 theirs"。
- 症状: P4 报告实测：原以为 `ChatPage.tsx` 的 `useChannelMirrorEvents` 在 ours 侧，**实际在 THEIRS 侧**（HEAD 侧为空块），导致对 P6 的指示方向相反；同一 `git status` 码下**两侧内容方向不固定**。
- 根因: 冲突标记的语义方向不由 status 码唯一决定，只能由 `<<<<<<< / ======= / >>>>>>>` 三行本身确定。
- 正确做法: **必须实际展开三行**判断归属，不能凭文档描述推断；每个冲突块单独读，不要批量套用；建议用脚本按 zone（HEAD/THEIRS/resolved）分类引用。
- 类型: 文档与判据
- 等级: L

### X7 · `NUL` 幻影目录吞掉 robocopy 日志
- 出处: task-仓库合并/BLUEPRINT-总蓝图.md:93；task-仓库合并/PHASE-1-工具链对齐.md:282；task-仓库合并/PHASE-0-完成报告.md:218
- 错误做法: 用 `robocopy /LOG:x` 记录日志并**以退出码**判断成功。
- 症状: 带 `/LOG:` 时**日志恒为 2 字节空白**（仓库根有个名为 `NUL` 的 Windows 保留设备条目，无法枚举/重命名/删除，会吞掉日志写入）；退出码 9 可能是假警报。
- 根因: Windows 保留设备名 `NUL` 在路径解析层吞掉写入；robocopy 的退出码语义（位标志）本身不表示成败。
- 正确做法: 判定成功**看汇总的 `Files FAILED` 与 `Mismatch` 两列是否为 0**，不要只看退出码；要日志就用 `& robocopy.exe ... 2>&1 | Set-Content` 捕获。
- 类型: 环境
- 等级: L

### X8 · `merge-tree` 的 `-c` 覆盖会掩盖仓库配置
- 出处: task-仓库合并/PHASE-2-合并配置对齐.md:267
- 错误做法: 在预估命令里带 `-c merge.renormalize=false`。
- 症状: A2 测出 **50** 而非 **46**（多出 4 个冲突）。
- 根因: 命令行 `-c` 覆盖了仓库里已配好的 `merge.renormalize=true`，于是测的不是真实合并行为。
- 正确做法: 确认命令里**没有** `-c` 覆盖，用纯 `git merge-tree` 让仓库配置自然生效。
- 类型: 命令与脚本
- 等级: L

### X9 · cmd 后台语法与 `--reporter=json --outputFile` 的连环弯路
- 出处: internal-issue/2026-09-06-shell-output-truncation-timeout-known-issues.md:36,38
- 错误做法: 用 `npm test > test-result.log 2>&1 &`（cmd 后台）跑测试；随后改用 `--reporter=json --outputFile`。
- 症状: cmd 的 `&` 后台语法导致 **exitCode 语义混乱，无法确认测试完成**；`--reporter=json --outputFile` **未产出文件**（连续弯路，记为 5–9 号问题）。
- 根因: 宿主 shell 的后台语义与"任务是否完成"的判定耦合；reporter 的输出落盘行为未经验证就依赖。
- 正确做法: 用受管后台作业并显式轮询结果文件；先验证 reporter 真的会写文件再用它做判据（与 R162"验证工具本身必须被验证"同一条纪律）。
- 类型: 命令与脚本
- 等级: L

### X10 · `safeName` / `sessionIdFromFileName` 反解风险（本 8 份之外的独立审计项）
- 出处: task-仓库合并/04-审计-chats-store与会话ID空间.md:52,73,118；task-仓库合并/01-已拍板决策与技术修正.md:138；task-仓库合并/02-旁听上下文迁移可行性结论.md:188；task-仓库合并/03-旁听迁移方案修订.md:168
- 错误做法: 依赖 `history-log` 的文件名反解（`safeName` / `sessionIdFromFileName`）把文件名还原成 sessionId。
- 症状: 该审计项在上游任务记录里**反复登记为"未审计"**（"官方 `chats-store.ts` 重写是否改变会话 ID 空间"），而它直接决定反解是否还成立；同文件另指出渠道名捕获组 `[a-z][a-z0-9]*` **不含下划线**，与 `safeName` 把 `:` 换成 `_` 会发生歧义。
- 根因: 文件名编码是**多对一**的，反解本就不可靠；再叠加会话 id 空间可能被上游重写，风险翻倍。
- 正确做法: 用权威名册而非反解（与 R107/R156 同结论）；把"id 空间是否变化"作为上游重写的必查项而非待办。
- 类型: 架构与实现
- 等级: L

> **补充说明**：简报里另外 6 条线索**确实在本 8 份文档内**，已收入 R 台账：`JsonVectorStore.addUnique()` 不去重 → **R153**（phase3-p3:1744）；压缩只置 `archived` 不删向量 → **R154**（phase3-p3:1747）；`safeName` 的 `:` → `_` 有损 + `reloadAllHistory()` 反推 bug → **R107 / R156**（phase3-p3:293,1755-1756）；`require("node:path")` 在 vitest/ESM 下不可用 → **R157**（phase3-p3:1758）；语料实时增长导致"全树字节不变"误报 → **R165**（phase3-p3:1792）；时点断言 → **R172 / R106**（phase3-p3:1326,1960）；验证工具自身必须被验证（沙箱漏拷 `.p0-backup`）→ **R162 / R169**（phase3-p3:1777,1843）。

## 附录 C · 类型分布

**总计 186 条**（R1–R186，脚本从文件正文逐条统计，无重号）。

| 类型 | 条数 | 占比 | 主要分布 |
|---|---:|---:|---|
| 架构与实现 | 81 | 43.5% | 全新：新增维度/字段/载体后，消费点、副本、清单、缓存、类型边界未同步（R3、R12、R35–R39、R78、R100、R107、R134–R142、R153–R156、R161 等） |
| 文档与判据 | 41 | 22.0% | 判据结构上抓不到目标现象、判据与实现不同源、文案超出证据、示例格式与生产不符（R2、R4、R8、R104–R106、R118、R136–R138、R144、R148、R150–R152、R159、R172） |
| 验证方法 | 34 | 18.3% | 假阴性、活数据断言、对照值可信度、验收样本丢失、覆盖缺口未登记、先红后绿的纪律（R18、R19、R21、R50、R55、R56、R61、R64、R81、R112、R158、R162、R165、R167–R171） |
| 流程纪律 | 13 | 7.0% | 回滚方案与实际提交状态脱节、风险自评失真、范围裁剪项失踪、"顺手修"的低估（R6、R7、R17、R25、R26、R40、R69、R74、R90、R95、R98、R99、R126） |
| 环境 | 9 | 4.8% | 端点不支持结构化输出、超时与输出预算、RAG 未装模型、日志静默停写、宿主 shell 限制（R20、R34、R52、R58、R59、R131、R132、R163、R164） |
| 命令与脚本 | 8 | 4.3% | 正则终止符、`require` 在 ESM 下、命名冲突、算术与夹具、npx 被拦截（R10、R16、R22、R63、R121、R127、R157、R173） |
| **合计** | **186** | **100%** | |

**条数最多、也最值得进规范正文的分布特征**：`架构与实现` 接近半数，说明这批文档记录的反例主要是**设计层的连带遗漏**（新增一个维度/字段/载体后，消费点、副本、清单、缓存没有同步），而不是"写错代码"。`验证方法` 与 `文档与判据` 合计 60+ 条，说明**判据本身的失效**是这类长周期施工的第二大成本来源（判据结构上抓不到目标现象、判据与实现不同源、判据依赖会漂移的样本）。`命令与脚本` 只有个位数，但每条都是"会浪费半天"的硬坑。

---

## 附录 D · 最珍贵的 10 条（反直觉、最值得进规范正文）

1. **R162 / R169 —— 验证工具本身必须被验证**（phase3-p3:1777,1843）：ground truth 与产品不一致时，先怀疑工具。沙箱只拷"已知文件名"漏掉一个 `.p0-backup`，差点把工具缺陷记成产品缺陷。凡用"数据副本 + 真实代码路径"产出对照值，**副本的完备性本身就是断言的一部分**。
2. **R165 —— 活数据的"不变"断言必然误报**（phase3-p3:1792）：语料 50 秒内 304832 → 305379 字节（别的群在聊天），"全树逐字节不变"把正常写入记成违规。**判据的作用域不能包含与被测操作无关的活数据**；改为"目标域逐字节不变 + 其余只允许纯追加 + 无删减小"。
3. **R124 —— 名字叫 unique 的函数不去重**（phase3-p3:1541-1545,1744）：`addUnique()` 不走 `add()` 的相似度去重，直接插入 → "先删后建"留下同一 `l2Id` 的重复行，还会平白删掉一条 K 类记忆的向量。**行为以实现为准，不以命名为准。**
4. **R140 —— "没提名字"的复述抓不到**（phase3-p3:1639）：泄漏的原句 `学做菜好呀！以后搬去杭州就能自己开小灶啦♪` **一个字都没提他**，只按名字匹配它活得好好的。复述有两种形态（点名复述 / 回话复述），必须加"按轮次配对"这条判据。**判据只覆盖了显性形态时，缺陷会以"看不见"的方式存活。**
5. **R83 —— "单人发言"不等于"单人会话"**（phase3-p2:900,926-928）：人数做代理会把群里的公共记忆挂到唯一发言者名下，而 P3 的删除正是按这个字段定位 → **标错就等于删错人的记忆**。正确判据是 `chatType === "private"`。
6. **R103 —— 同步 IO 是比队列更强的竞态保证**（phase3-p3:169-183）：原方案想用 `KeyedQueue` 串行化，但队列拿不到、两条写路径也不在队列里。真正的保证是"`history-log` 全部 IO 同步、零 `await`" → 纯同步重写不可能被打断。**一旦在重写循环里加 `await`，保证立刻失效。**
7. **R139 —— 她自己的回复在复述他，而且每轮都进上下文**（phase3-p3:1622-1628）：`speakerId` 判据天然漏掉 `role=assistant` 的行，而它们就在普通上下文窗口里，**每问一次重新喂一次**——比需要语义召回才撞上的向量残留更直接、更严重。**"按被擦者的标识字段过滤"这种方法论会系统性漏掉"由他派生但不由他署名"的内容。**
8. **R91 —— 原以为的主战场根本没被调用**（phase3-p2:61-103）：整套 L2 + DMAE 在主聊天路径上是空转的，`buildMemoryInjection()` 只有语音通话与主动消息两个调用方；串记忆真正发生在 `user_memory` 工具路径，且模型把它当成"你说过的话"复述。**"我以为它在工作"必须用"生产调用点全仓清单"来证伪。**
9. **R4 / R106 —— 判据在结构上抓不到目标现象**（phase1-group-context:104；phase3-p3:1326）：`:group:` 子串在真实 sessionId 里不存在；带渠道前缀的 grep 抓不到向量里的裸 id。**判据必须对着真实数据的形态写，而不是对着"看起来对"的字符串写。**
10. **R137 —— "不是被决定的，而是没被决定的"**（phase3-p3:1612-1615）：两张清单（可删/保留）之外的载体（`cyrene-runs/sessions/*.json`，含逐字正文）实测"保留"，但这是**缺省行为**而非决策。**凡以"清单即边界"为设计原则的系统，必须有一条断言证明"没有东西落在清单之外"。**

> 备选（第 11–15 名，同样值得进正文）：R71（类型防线写在 `.test.ts` 里是纸做的）、R163/R132（结构化输出的超时与预算必须按"两次慢调用 + 单条 7 字段"算）、R62（把失效提案留在正文并标注"不要照抄"）、R64（先写会红的回归测试再改实现）、R150（"一个字都没提他"的孤儿回复结构上无法定位 —— 如实记录产品边界）。

## 附录 E · v2.4 新增条目索引（P6–P10 合并任务 + 验收会话）

> **为什么是索引而不是五元组全文**：这 70 条的**完整五元组写在两个实用库里**（正文在那边维护），
> 本附录只保证**溯源**：键号 / 等级 / 一句话 / 出处。**口径**：表格行、按 ID 去重。
>
> - 通用库（H/M）**新增 50 条**：[BLUEPRINT-经验库-通用.md](BLUEPRINT-经验库-通用.md)
> - 具体坑库（L）**新增 20 条**：[BLUEPRINT-经验库-具体坑.md](BLUEPRINT-经验库-具体坑.md)
> - 🔴 **键号更正**：`E9` ← 原 E7；`C26–C29` ← 原 C20–C23；`D25` ← 原 D17；`E10` ← 原 E8；`X20` ← 原 X10（冲突原因见具体坑库抬头）

### E.1 通用库（H / M）新增 50 条

| 键号 | 级 | 一句话（错误做法） | 出处 |
|---|---|---|---|
| **C21** | H | 拿"冲突块数"当"整合面"，逐块二选一就算解决 | `task-合并/PHASE-6-完成报告.md §五 偏差 2` |
| **C22** | M | 采信蓝图/台账里写的块外行号（"该符号已在非冲突区 :95-99"），直接按字面执行 | `task-合并/PHASE-6-完成报告.md §五 偏差 2；判据台账 J-13` |
| **C23** | M | 在一个既有大量暂存内容的索引上做"排除/入库"操作（git add 几个 + git rm --cached 几个），然后直接提交 | `task-合并/PHASE-8-提交合并与收口.md §四 4.0/4.4 ①（陷阱 Y4）；判据台账 J-21` |
| **C24** | M | 用只搜已跟踪文件的检索工具去验证尚未入库的新产物是否接线成功（git grep … -- <dir>） | `判据台账 J-26；task-合并/PHASE-9-完成报告.md §四 A2` |
| **C25** | M | 认为"样式/类名这类东西没法写成判据"，于是只靠人眼验收 | `判据台账 J-32/J-33；task-合并/PHASE-9.5-完成报告.md §五 偏差 1` |
| **C30** | M | 把一批"破坏性删除"写成一条批量命令，不先看每个对象的版本控制状态 | `task-合并/PHASE-8-完成报告.md 偏差 3（实测 exit 1、12 个测试文件未删成）` |
| **C31** | M | 证据文件按"日期"命名（<日期>-报.md） | `task-合并/PHASE-10-完成报告.md 偏差 9（证据覆盖实测）` |
| **C32** | H | 用纯文本 grep 命中数判断"这个能力还有没有人调用"，不排除测试替身 | `task-合并/验证作业单-缺陷报告.md（mock 被当成唯一调用方）` |
| **E9** | M | 假定"文档里逐字写着的命令"在当前机器上一定能跑起来 | `task-合并/PHASE-9-完成报告.md §三 3.0（实测 npx.cmd --version → 11.19.0）`（原编号 E7，与具体坑库 E7 冲突，本包改为 E9） |
| **D18** | H | 把量级（文件数 / 用例数 / 命中数）写成硬判据，而不是写成含恒等式的判据 | `判据台账 J-28；task-合并/PHASE-9-完成报告.md §四 A6` |
| **D19** | H | 判据里写死一个相对 ref（HEAD~1 / HEAD^）来代表"上一个基线" | `判据台账 J-29；task-合并/PHASE-9-完成报告.md §四 A8` |
| **D20** | H | 把"某个检查工具报了几个违规"当成"总共只有几个" | `判据台账 J-27；task-合并/PHASE-9-完成报告.md §五 偏差 1（实测 80 + 57 + 11 = 148）` |
| **D21** | H | 把「全量测试 0 failed」当成自足判据（只要代码对就该绿），不记环境前提 | `判据台账 J-35；task-合并/PHASE-9.5-完成报告.md §十二 12.2（含复现脚本 repro-build-verify.mjs）` |
| **D22** | M | 写"删除某键/某标识后全仓 0 命中"这类验收判据 | `判据台账 J-37；task-合并/PHASE-10-完成报告.md §五 偏差 4` |
| **D23** | M | 把"必须落到 N 类之一"当成判据（N 是蓝图里拍脑袋定的类别数） | `判据台账 J-38；task-合并/ABANDONED-有意放弃清单.md §二 偏差登记` |
| **D24** | M | 往台账/清单表格里追加行时，拿"最后一行 + 它后面的分隔符"当替换锚点，而 new_string 里只顾着写新行、忘了把锚点行原样写回去 | `task-合并/PHASE-10-完成报告.md §五 偏差 12（恢复后判据台账 38 条、无缺号）` |
| **D26** | M | 不先校准参照物就拿它当尺子去核验 | `task-合并/PHASE-8-合并保真核验报告.md 事实 1（参照物认定）` |
| **D27** | H | 断言里写的是字符串字面量，而被断言的对象早已被删除 | `task-合并/PHASE-8-合并保真核验报告.md 观察项（假门禁）` |
| **D28** | M | 同一批数字/指针在多份文档里手工复制，没有单一出处 | `task-合并/PHASE-10-完成报告.md 偏差（多文档计数不一致实测）` |
| **D29** | M | 用字面搜索做"无遗留 / 无未勾选"这类收尾判据 | `task-合并/PHASE-10-完成报告.md 偏差 10（判据命中自己，机械命中 1 处）` |
| **D30** | M | 报告里的计数不写"数法" | `task-合并/PHASE-9-完成报告.md 偏差（150 vs 121，判据沉淀 J-31 型）` |
| **D31** | M | 写"改动面白名单"类判据时不写计数单位 | `task-合并/PHASE-10-完成报告.md 偏差 8（白名单 2 处 vs 4 路径）` |
| **D32** | H | 用计数型判据（grep 命中数 / 符号出现数）去守一个敏感数据的边界 | `task-合并/缺陷报告-H-26-read_memory泄漏L0L1到群聊.md（判据全绿、泄漏仍在）` |
| **D33** | H | 在对照物为空时执行否定型判据（"它不该说出 X"） | `task-合并/缺陷报告-H-26-read_memory泄漏L0L1到群聊.md（对照物为空 + 反证设计）` |
| **D34** | H | 把"测试是红的"直接当成"本次改动引入了回归" | `task-合并/验证作业单-执行报告.md（差集为空判 ✅）；人工验证-回执-V与C类-2026-10-01.md` |
| **D35** | H | 把缓存 / 本地镜像当成权威源，且结论不带"数据来源 + 新鲜度" | `task-合并/SYNC-上游同步SOP.md（先镜像后 github；无 lastFetchedAt）；PHASE-10-完成报告.md（N=0 假安全）` |
| **D36** | M | 把"上界指标"当成"工作量" | `task-合并/00-总体任务预览.md（69 vs 46）；ABANDONED-有意放弃清单.md（79 嫌疑 vs 0 代码级）` |
| **D37** | M | 清单类交付物的覆盖判据只数条数，不做三重咬合 | `task-合并/ABANDONED-有意放弃清单.md §七 校验（三条命令互相咬合）` |
| **A40** | M | 上游整体重写了某个"装配层"文件后，只按冲突块逐块合并，不逐项核对注入面清单 | `task-合并/PHASE-6-完成报告.md §五 偏差 1/4` |
| **A41** | M | 用"两边各改了多少行"判断合并工作量的分配（git diff --numstat base..A vs base..B） | `task-合并/PHASE-6-完成报告.md §五 偏差 5` |
| **A44** | M | 把"编译面干净"当成"应用能起来"的证据（tsc -p tsconfig.main.json 与 tsconfig.preload.json 全绿 → 宣布… | `task-合并/PHASE-7-边界编译修复与构建链切换.md §二 事实 4` |
| **A45** | M | 在冲突里"取 ours 保住本地功能"之后，只验证本地的功能还在，不验证 theirs 的调用面是否需要被放弃物 | `task-合并/PHASE-7-边界编译修复与构建链切换.md §二 事实 5；判据台账 J-19 同族` |
| **A46** | M | 把"git commit 成功了"当成"合并完成了"——不记录提交前的内容指纹 | `task-合并/PHASE-8-提交合并与收口.md §四 4.0（陷阱 Y1）+ §八 级 2（实测 pre-commit-tree = 5bc24f0a…）` |
| **A47** | H | 把"删除 N 个测试文件"当成同质动作，按文件粒度执行 | `task-合并/PHASE-8-提交合并与收口.md §二 事实 4（陷阱 Y3）；判据台账 J-20` |
| **A48** | H | 移植/重写一块 UI 时只抄"结构与文案"，不抄"样式" —— 认为"类名起得像、复用现有全局类"就够了 | `判据台账 J-32；task-合并/PHASE-9.5-完成报告.md §五 偏差 1；证据图 证据/H-17-1-记忆页-排版问题-2026.png` |
| **A49** | H | 回收旧 CSS 时只对齐类名，不对齐 DOM —— 认为"选择器命中就行" | `判据台账 J-34；task-合并/PHASE-9.5-完成报告.md §五 偏差 2；证据图 证据/H-17-2-区块页-排版问题-2026.png` |
| **A50** | M | 给危险动作做"多步确认"时，把几步 UI 同时打开（几个 <Modal> 共用一个 open 开关） | `task-合并/HUMAN-人工验证台账.md H-22；task-合并/BACKLOG-长期待办.md §二 第 6 条` |
| **A51** | H | 破坏性动作之前不记基线，删完才在收尾时"顺手"核对受保护项 | `task-合并/PHASE-8-完成报告.md（11→8 退化，提交后才归因）` |
| **A52** | M | 声明的改动面用一句「只动 X」概括 | `task-合并/PHASE-9.5-完成报告.md（N1 声明 vs 10 项实测）` |
| **A53** | M | 判据的扫描面小于"同类问题的全集" | `task-合并/PHASE-9-完成报告.md（7 处 var(--cy-pill-*) 面外残留）` |
| **A54** | M | 把一次删除归因给错误的阶段 | `task-合并/PHASE-10-完成报告.md（5 个文件归属更正）` |
| **A55** | H | 把守卫加在已知的那条调用路径上，而不是挂在数据出口 | `task-合并/缺陷报告-H-26-read_memory泄漏L0L1到群聊.md（注入层守住、工具层泄漏）` |
| **A56** | H | 合并时按"官方分支没有这个文件"就删本地入口，不做能力链路核对 | `task-合并/验证作业单-缺陷报告.md（四列对照、三层缺失）` |
| **A57** | H | UI 重构只保证"后端 + 桥"存在，不维护"配置项 → 入口"对照清单 | `task-合并/人工验证-回执-V与C类-2026-10-01.md（关键词策略接线前后）` |
| **F17** | H | 新增一个"防静默失效"的守卫测试后，只验证它现在是绿的 | `task-合并/PHASE-6-完成报告.md §四 A6（实测 4 绿 → 4 红，还原后 blob 1cc6d212… 一致）` |
| **F18** | H | 删除模块时，只核对该模块的代码引用者（grep import），不核对以路径字符串引用它的测试 | `task-合并/PHASE-8-完成报告.md §五 偏差 3（实测 Error: ENOENT: …\src\renderer\settings\memory\panel.ts）` |
| **F19** | H | 为了验证"开关双向可用"把系统打到非默认态，验完不复位 | `task-合并/人工验证-回执-V与C类-2026-10-01.md（injectOwnerProfile 停在 True、3 个群可见）` |
| **F21** | M | 人工验证步骤写的是代码里的名字，不是界面上的文案与路径 | `task-合并/验证作业单.md（渠道页实为「连接手机」）` |
| **F22** | H | 机制"从未被真实使用过"就宣布落地 | `task-合并/PHASE-10-完成报告.md（机制首用即假安全、判据只覆盖 N=0）` |
| **F23** | H | 未提交改动没有阈值纪律（"先攒着，等做完一起提交"） | `task-合并/PHASE-10-完成报告.md（WIP 阈值门禁：>20 条或 >3 天）；BLUEPRINT-总蓝图.md（12 天未提交 → 46 冲突）` |

### E.2 具体坑库（L）新增 20 条

| 键号 | 级 | 一句话（错误做法） | 出处 |
|---|---|---|---|
| **C26** | L | 用 git grep <字面量> 的全仓命中数当"删干净了"的判据 | `task-合并/PHASE-10-完成报告.md §五 偏差 4（判据 J-37）`〔原编号 C20；与通用库 C20 冲突，本包改为 **C26**〕 |
| **C27** | L | 用 git commit-tree 造"只改一个文件"的测试提交时，去动真实索引（git read-tree / 忘了给 GIT_INDEX_FILE 设临… | `.cyrene-merge-analysis/p10/a2-probe.mjs`（可复跑）〔原编号 C21；与通用库 C21 冲突，本包改为 **C27**〕 |
| **C28** | L | 解析 git diff --name-status / git ls-files 的输出时，直接按 UTF-8 文本处理 | `task-合并/PHASE-10-完成报告.md §六 新坑 6/7`〔原编号 C22；与通用库 C22 冲突，本包改为 **C28**〕 |
| **X16** | L | 用 git grep -u …（凭记忆写"含未跟踪"的短选项） | `判据台账 J-26；task-合并/PHASE-9-完成报告.md §五 偏差 2` |
| **D25** | L | 用 Set-Content -Encoding UTF8 写要给别的程序读的文本/JSON/清单 | `task-合并/PHASE-10-完成报告.md §六 新坑 6`〔原编号 D17；与通用库 D17 冲突，本包改为 **D25**〕 |
| **X12** | L | 用 PowerShell 的 Set-Content / Out-File / here-string + Set-Content -Encoding UT… | `task-合并/PHASE-8-提交合并与收口.md §零 0.4（陷阱 Y2）+ §四 4.5 ①` |
| **X14** | L | 在 PowerShell 5.1 里给 git ls-tree（或其它 git 命令）一次传多个 pathspec：git ls-tree -r --nam… | `task-合并/PHASE-8-完成报告.md §四 A3（实测：多路径 0 条 vs 单路径 4 条全在）` |
| **X15** | L | 在 Windows PowerShell 里按文档直接敲 npx <tool>（或 npm <script>） | `task-合并/PHASE-9-完成报告.md §三 3.0；Get-ExecutionPolicy -List 实测六项全 Undefined` |
| **E10** | L | 用 Test-Path node_modules/electron/dist/electron.exe 为 False 就断定"postinstall 被白… | `task-合并/PHASE-7-边界编译修复与构建链切换.md §四 4.3 X1；P7 实测 electron.exe --version → v44.4.3`〔原编号 E8（与本库 §5.1 的 E8 重复），本包改为 **E10**〕 |
| **X20** | L | 换依赖版本后只跑 npm ci 就认为安装期脚本都跑过了；不检查 install-scripts 白名单与真实产物 | `task-合并/PHASE-7-边界编译修复与构建链切换.md §四 4.3；P7 实测 approve esbuild 后 allowScripts 由 esbuild@0.21.5 变为 esbuild@0.28.2`〔原编号 X10；与全量台账附录 B 的 X10 重名，本包改为 **X20**〕 |
| **A42** | L | 以为"测试文件里的类型错误会被 tsc 抓到"，于是靠类型系统保证测试桩完整 | `task-合并/PHASE-6-完成报告.md §五 偏差 6；tsconfig.main.json:17` |
| **A43** | L | 删掉公共类型的一个字段后，只修"构造该类型字面量的地方" | `task-合并/PHASE-6-完成报告.md §五 偏差 7` |
| **C29** | L | 写"源码级守卫"测试时，按字面量在源文件里搜"某写法不得复发" | `task-合并/PHASE-10-完成报告.md §六 新坑 4`〔原编号 C23；与通用库 C23 冲突，本包改为 **C29**〕 |
| **X11** | L | 用 npm run build / npm run build:renderer 的退出码判断多入口构建是否真的产出了全部入口 | `task-合并/PHASE-7-边界编译修复与构建链切换.md §四 4.6 X2；P7 实测：vite 8.3.0 + 6/6 入口 True` |
| **X13** | L | 用 npx vitest run … 2>&1 \| Tee-Object -FilePath <目录>\xxx.txt 在后台作业里落盘测试日志，而该目录… | `task-合并/PHASE-8-完成报告.md §五 偏差 1（实测：第一次基线作业 EXIT=-1，日志未产出）` |
| **X17** | L | 在 useCallback / 回调里用 if (!obj?.method) return; 做守卫后，在闭包体内再调 obj.method() | `task-合并/PHASE-9-完成报告.md §五 偏差 3` |
| **X18** | L | 在 PowerShell 里用 Get-Content <file>（不带 -Encoding）读 BOM-less UTF-8 源码，再用 .Count … | `判据台账 J-31；task-合并/PHASE-9-完成报告.md §十二 12.2` |
| **X19** | L | 把"全量测试 0 failed"当成自足判据（代码对就该绿），跑之前不看宿主 PATH 上的工具链能不能用 | `判据台账 J-35；task-合并/PHASE-9.5-完成报告.md §十二 12.2` |
| **X22** | L | 改完源码、重启应用，就认为"跑的是新代码" | `task-合并/验证作业单-执行报告.md（产物新鲜度三重核验）；dist bundle 内 mirrorToDesktop 0 命中` |
| **X21** | L | 用"猜出来的文件名"核对"设置有没有保存" | `task-合并/人工验证-回执-V与C类-2026-10-01.md（general-settings.json vs 真实的 app-settings.json）` |
