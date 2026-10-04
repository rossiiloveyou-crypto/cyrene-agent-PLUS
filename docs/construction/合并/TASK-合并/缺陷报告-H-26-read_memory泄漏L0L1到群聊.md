# 缺陷报告 · 🔴 隐私边界泄漏：`read_memory` 把 owner 的 L0/L1 画像喂进群聊轮次

> **发现时间**：2026-10-01 01:35（B-6 第 1 步验收时实测触发）
> **发现方式**：所有者按 B-6 步骤 1 在测试群询问「你知道我最近在准备什么考试吗？」→ **她说出了 CPA**
> **严重级别**：🔴 **高** —— 正在泄漏真实用户的私人信息到外部群聊
> **状态**：✅ **已修复并实测验证**（见 §八）
> **基线**：HEAD `732a6451`（P10 提交 2）

---

## 八、修复与验证（2026-10-01 01:41 ~ 01:50）

### 8.1 改动

| 文件 | 改动 |
|---|---|
| `src/main/orchestrator/tools/registry/tool-registry.ts` | ① `import { resolveScopeId, shouldInjectOwnerProfile } from "../../../zones/scope"`；② `read_memory` 里加 `const profileVisible = shouldInjectOwnerProfile(scopeId)`，L0/L1 只在可见时读取（否则 `[null, null]`）；③ `formatMemoryOverview` 的 `l0`/`l1` 参数改为可选，画像不可见时输出**明确的边界提示**（而不是空白段落，否则模型会把「边界」误读成「她没记住」）；④ 抽出 `appendL2Section` 供两条分支复用 |
| `src/main/orchestrator/tools/registry/tool-registry-memory-scope.test.ts`（新增） | **4 条回归测试**（见 8.3） |

**未动数据层**：L0/L1 依旧是全局单例，只是把「谁可以读」收敛到与注入层同一守卫。

### 8.2 修复后实测（测试群 `543627098`）

所有者复测同一问题（「你知道我最近在准备什么考试吗？」→ 追加一轮「那你知道我最近要去哪里吗」），
该轮 run 记录 `feb9f2af-dae8-4675-8d1a-0fac1174b8ba.json` 的本轮 prompt（`messages[18]`）内：

| 标记 | 出现次数 |
|---|---|
| `核心画像` / `固定备注` / `近期目标` / `CPA` / `[用户画像]` / `[近期状态]` | **全部 0 次** ✅ |
| `BeiKia` | 4 次 —— 但 4 处都在 `## 用户信息` 块的「昵称：BeiKia」，属**运行环境块**，**非 L0/L1 画像** |

**修复前那一轮的泄漏已被封堵**。所有者的结论也是「成功」。

### 8.2b 决定性反证（所有者的测试设计，比原方案更强）

所有者主动改动了 `l1.recentGoals`，把它设成**「去奶奶家」** —— 即**问题答案本身就在 L1 里**，
然后问「那你知道我最近要去哪里吗」。

| 判据 | 实测 |
|---|---|
| 该轮 prompt 内 `去奶奶家` | **0 次** |
| 该轮 prompt 内 `备考 CPA` / `我最近在准备 CPA` / `核心画像` / `固定备注` / `[用户画像]` / `[近期状态]` | **全部 0 次** |
| 该轮工具调用 | `user_memory`（目标「去哪里 出行 旅游」）→ **返回空**；`recall_history` ×2 → 「没有找到」；**没有 `read_memory` 成功返回画像** |
| 她的回复 | 「这个人家**还真不知道**呢……是打算去哪里呀？」 |

**为什么这比原始测法强**：

- 原始测法（L1 = 备考 CPA，问「准备什么考试」）：她拒绝 → **可能**被解释成「记忆里本来就没东西」⇒ **假通过风险**；
- 本次测法（L1 = **去奶奶家**，问「要去哪里」）：**答案就在 L1 里而她答不出、工具也返回空**
  ⇒ 只能解释为**域边界把工具路径封死了**，排除了「模型自己选择不说」这种解释。

> 注：`l0.permanentNote = 我最近在准备 CPA` 仍保留在 L0，故反证依然成立。
> `memory.json` 于 `01:49:30` 写入（`l1.recentGoals = 去奶奶家`，`roundCount = 9`）。


### 8.3 两个泄漏渠道都已关闭

排查中还确认了**第二条渠道**与它为什么是干净的：

| 渠道 | 结论 |
|---|---|
| ① `read_memory` 工具直接读 L0/L1 | ✅ **已封堵**（本轮 0 次） |
| ② 群上下文块 `【群聊近期上下文】` 重放历史 | ✅ **本来就是干净的** —— `buildGroupContextBlock` 只取**旁听条目**（`triggered === false`），那条含 CPA 的 assistant 回复**不会被重放**。已实测核对该块内容：7 条全为旁听闲聊 |

### 8.4 唯一残留（**不是新泄漏，且不可追溯抹除**）

被泄漏那一轮（`01:35:39`）的 **tool 结果**（`[8] read_memory`）与**她的回复**（`[9]`，含 CPA）
仍留在**该会话自身的对话历史**里，会在后续轮次作为历史被重放。

- **性质**：等价于「她之前在群里说过这句话」—— 是**用户可见的既有对话**，不是仍在持续的画像注入；
- **修复后的表现**：她**不会再主动复述**（本轮问「我要去哪里」时答「这个人家还真不知道呢」）；
- **若要彻底清除**：删除 `channels/history/channel_qq_20b39082aa808213.jsonl` 里 `2026-09-30T17:35:49.807Z` 那条 assistant 记录
  （或清空该群会话历史重开）。**本轮未执行**，因为它是用户的真实对话记录，须由所有者决定。

### 8.5 验证结果汇总

| 项 | 结果 |
|---|---|
| `tsc` main / preload / renderer | 各 **0 错误** |
| 全量 `npm test` | **568 文件 / 5467 通过 · 0 失败**（修复前 567 / 5463） |
| 回归测试是否真能抓住该 bug | ✅ **已用故障注入证明**：把守卫临时改为 `true` 后，测试立即报出 `群聊输出不应包含「CPA」: expected '== 核心画像（L0）==\n- 称呼: BeiKia\n…' not to contain 'CPA'` —— **与线上事故同形态**；恢复守卫后全绿 |
| 人工复测 | ✅ 所有者确认「成功」 |

### 8.6 建议的后续（未做）

1. **`write_memory` 同类加固**：非 owner 域写 L0/L1 时工具仍会先回「已写入 …」，对模型是误导
   （落库会被 `MemoryManager` 按域丢弃，但**回话不诚实**）。建议同样用 `shouldInjectOwnerProfile` 前置拒绝。
2. **`buildAlwaysOnContext` 的 L0/L1 读取**（`orchestrator/index.ts:177-178`）已守卫，但它是**独立实现** ——
   与本修复共用 `shouldInjectOwnerProfile`，可考虑再抽一层 `readOwnerProfileForScope(scopeId)` 收敛成唯一入口。


---

## 一、结论（一句话）

**上下文注入层守住了，但 `read_memory` 工具绕过了域守卫** —— 它把 `memoryStore.getL0()` / `getL1()`
（**owner 本人的核心画像与近期状态**，且 L0/L1 是**全局单例、不带 `scope` 字段**）
无条件返回给任何域的会话，于是在群里被念了出来。

---

## 二、实测证据链（可复现）

### 2.1 前置（对照物必须存在，否则会「假通过」）

B-6 的第 5 步本意是验「开关双向可用」，但验收前 L0/L1 **全为空串**：

```
l0: preferredName="" occupation="" longTermInterests="" permanentNote="" language="zh-CN"
l1: recentGoals="" recentPreferences="" currentProject=""
```

而注入条件是 `if (l0Lines.length > 0 || l1Lines.length > 0)`（`orchestrator/index.ts:194`）——
**全空根本不拼这一段**，所以「她说不出」只能证明没东西可说。
→ 先请所有者在 设置 → 记忆 里填入 `永久备注 = 我最近在准备 CPA`、`最近目标 = 备考 CPA`
（落盘 `memory.json`，写入时间 `01:34:39`），对照物才成立。

### 2.2 泄漏发生的完整时序（审计索引 `channels/audit/index.jsonl`）

| 时间 | 事件 | 内容 |
|---|---|---|
| 01:35:32 | 群消息入站 | 测试群 `543627098` @ 她：「你知道我最近在准备什么考试吗？」 |
| 01:35:35 | `tool_call` 回忆历史 | `[recall_history] 没有找到关于 "考试" 的历史记录` |
| 01:35:39 | **`tool_call` 通读记忆** | **返回 owner 画像**（见下） |
| 01:35:49 | `turn_success` | 她答：「人家当然记得呀，你最近不是在全力备战 **CPA** 嘛♪复习得怎么样啦？」 |

**01:35:39 那条 `tool_call` 的原始摘要**（`index.jsonl`）：

```json
{"kind":"tool_call","title":"通读记忆","chatId":"543627098","senderId":"2914636187",
 "summary":"== 核心画像（L0）==\n- 语言习惯: zh-CN\n- 固定备注: 我最近在准备 CPA\n\n
            == 近期状态（L1）==\n- 近期目标: 备考 CPA\n\n
            == 对话记忆（L2，共 0 条，列出最新 0 条）==\n- （空）"}
```

从 `01:35:49` 的回复可见，她**在群里公开说出了**只有私聊语境下才该知道的私人信息。

### 2.3 逐层定界（证明「注入层没漏、工具层漏了」）

| 层 | 判据 | 实测 |
|---|---|---|
| **上下文注入**（`orchestrator/index.ts:167-175`） | 群里那轮 prompt 里有没有画像块 | ✅ **守住了**：`[用户画像]` **0 次**、`[近期状态]` **0 次**、`备注：我最近在准备 CPA` **0 次**、`最近目标：备考 CPA` **0 次** |
| **工具输出**（`tool-registry.ts` 的 `read_memory`） | prompt 里有没有工具返回的画像 | ❌ **漏了**：`核心画像` **3 次**、`固定备注` **3 次** |
| **L2 检索** | 是否有跨域 L2 | ✅ 干净：`getL2ForScope(scopeId)` 正确限域（`getAllL2` 全仓 0 命中，A-8 已核） |

> 该轮 run 记录：`cyrene-runs/sessions/18e775eb-cd8e-4b1c-b772-77b86d6e2d45.json`
> （`conversationId = channel:qq:20b39082aa808213`），messages 结构为
> `[1]user [2]assistant [3]user [4]user(2482) [5]assistant [6/tool] [7/tool] [8]assistant [9]tool(683) [10]assistant(33)`。

---

## 三、根因（`file:line`）

`src/main/orchestrator/tools/registry/tool-registry.ts` · `read_memory` 工具：

```ts
// :382-384  L2 走了域守卫 —— 这一段是对的
// 通读同样限域：本会话只应看到本域的记忆目录。
const scopeId = resolveScopeId(ctx?.conversationId);
const scopedL2 = await memoryStore.getL2ForScope(scopeId);

// :403-413  L0/L1 没有守卫 —— 这里漏了
const [l0, l1] = await Promise.all([
  memoryStore.getL0(),   // ❌ 全局单例，任何域都拿得到
  memoryStore.getL1(),   // ❌ 同上
]);
...
return formatMemoryOverview(l0, l1, items);
```

**为什么 L0/L1 没有 scope 可用**：`memory-store.ts` 里只有 L2 带 `scope` 字段
（`getL2ForScope` / `getL2DmaeStatesForScope`），L0/L1 是**全局单例**
（`memory-types.ts` 的 `L0Profile` / `L1Profile` 无 scope 概念）。

**所以设计意图只能是**：L0/L1 靠 `shouldInjectOwnerProfile(scopeId)` 把门 ——
`orchestrator/index.ts:167-175` 正是这么做的：

```ts
const scopeId = resolveScopeId(trace?.sessionId);
let injectProfile = true;
try { injectProfile = shouldInjectOwnerProfile(scopeId); } catch { ... }
if (injectProfile) { ...读 L0/L1 并拼进 prompt... }
```

**`read_memory` 恰好跳过了这道门** —— 同一份数据，一条路守住了，另一条路没守。

### 已排除的非泄漏点（防误报）

| 位置 | 是否泄漏 | 理由 |
|---|---|---|
| `tool-registry.ts:469`（`write_memory` 读 L0） | ❌ 不是 | 只读 `l0.isPinned` 标志，不返回内容；且 `candidate.scope = resolveScopeId(...)`（:458），非 root 域的 L0/L1 候选会被 `MemoryManager` 丢弃 |
| `tool-registry.ts:256`（`user_memory`） | ❌ 不是 | `searchMemory(..., { scopeId })` 已传域 |
| `memory/panel.ts` / `obsidian-exporter.ts` / `memory-compressor.ts` / `person-erasure.ts` | ❌ 不是 | 均为设置面板 / 导出 / 压缩 / 擦除等**本地管理动作**，不进入会话 prompt |

---

## 四、修法（最小改动，不动数据层）

在 `read_memory` 里复用现成的守卫 —— 与 `orchestrator/index.ts:170` 同一实现，**语义完全一致**：

```ts
// :382-384 之后
const scopeId = resolveScopeId(ctx?.conversationId);
const scopedL2 = await memoryStore.getL2ForScope(scopeId);

// 新增：L0/L1 是 owner 全局画像，只有开启了「注入本人画像」的域才能读。
// 与 buildAlwaysOnContext 同一守卫，避免两条路各自演化。
const profileVisible = shouldInjectOwnerProfile(scopeId);
const [l0, l1] = profileVisible
  ? await Promise.all([memoryStore.getL0(), memoryStore.getL1()])
  : [null, null];
```

并在 `formatMemoryOverview` 的入参为空时**省略画像段**（或输出明确的
「（本域不提供个人画像）」而非空白，让模型知道这是**边界**而不是「没有记忆」）。

需要同步加 `import { shouldInjectOwnerProfile } from "../../../zones/scope";`
（该文件已 import 了 `resolveScopeId`）。

### 附带建议（同一根因的另一半）

- `write_memory` 应当**同样**拒绝非 owner 域对 L0/L1 的写入尝试（目前靠 MemoryManager 丢弃，
  但工具会先回一句「已写入 …」，**对模型是误导**）。
- 补一条**回归测试**：在非 root 域的 `ctx` 下调用 `read_memory`，断言返回里**不含** L0/L1 字段
  （当前测试面里没有这条 —— 现有 `tool-registry-memory.test.ts` 只覆盖了 L2 限域）。

---

## 五、风险与影响

| 项 | 说明 |
|---|---|
| **正在泄漏什么** | L0（称呼 / 职业 / 长期兴趣 / 固定备注）与 L1（近期目标 / 近期偏好 / 当前项目）—— 即**用户本人的私人信息** |
| **泄漏到哪** | 任何**非 owner 域**的会话轮次，包括**外部群聊**（本次实测发生在 QQ 群 `543627098`） |
| **是否需要她主动调用** | 需要 —— 是模型主动调工具触发的，不是无条件注入。但她在群里**倾向于调用**（问「你知道我…吗」正好命中该工具语义） |
| **暴露面** | 只要 L0/L1 非空，且群聊里问到与画像相关的问题，就会泄漏 |
| **不修的话** | B-6 / H-13 的隐私边界**名存实亡**：注入层挡住的部分，工具层原样送出 |

---

## 六、复现命令

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$app = "$env:APPDATA\live2d-cyrene"

# 1) 看 01:35:39 那条工具调用返回了什么（含 CPA）
Get-Content "$app\channels\audit\index.jsonl" -Encoding UTF8 |
  Select-String -Pattern '通读记忆' | Select-Object -Last 1

# 2) 证明注入层守住了（应为全 0）
$run = Get-ChildItem "$app\cyrene-runs\sessions" -Filter '*.json' |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1
$raw = Get-Content $run.FullName -Raw -Encoding UTF8
foreach ($k in '[用户画像]','[近期状态]','备注：我最近在准备 CPA') {
  "$k => " + ([regex]::Matches($raw, [regex]::Escape($k))).Count
}

# 3) 证明工具层漏了（应 >=1）
foreach ($k in '核心画像','固定备注') {
  "$k => " + ([regex]::Matches($raw, [regex]::Escape($k))).Count
}

# 4) 泄漏点代码
Select-String -LiteralPath src/main/orchestrator/tools/registry/tool-registry.ts -Pattern 'memoryStore.getL0\(\)|memoryStore.getL1\(\)' -Context 3,1
```

---

## 七、结论

1. **B-6 第 1 步失败成立**，不是误判、不是环境问题 —— 是**真实的隐私边界泄漏**。
2. **泄漏点是唯一的**：`tool-registry.ts:403-406` 的 `read_memory` 读 L0/L1 时缺域守卫。
3. **注入层（`orchestrator/index.ts`）与 L2 层（`getL2ForScope`）都是干净的** —— 修一处即可闭合。
4. **修法已验证可行**：复用 `shouldInjectOwnerProfile`，与注入层同一语义，不触数据层。
5. **本次汇报未改动任何生产代码** —— 待所有者确认后实施（见回执文档 §六）。
