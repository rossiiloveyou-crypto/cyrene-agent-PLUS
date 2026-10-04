# PHASE-8.5 · 合并保真核验报告（撰写者独立核验）

> **核验命题（用户原话）**：「完成合并的同时，**我添加的功能不可以发生任何变化或缺失**」。
> **核验人**：撰写者（非施工 Phase，不改产品代码）。
> **被核验对象**：P8 合并提交 `51a20338`（tag `phase8-merged`，2 个父 `598dfb75` + `b11b8851`）。
> **参照物**：`phase0-full`（`34f0669f`，合并前本地完整状态）+ GitHub `cyrene-agent-PLUS`（`895749d5`，9/25 发布的早期快照）。
> **判据**：总蓝图 §二 **J-22 / J-23**（本次新增）。
> **结论**：**实现层零损失**（文件层 0 条无法解释、符号层 0 个本地独有符号丢失、桥接层 0 条本地能力丢失）；
> **入口层新发现 1 处不可达**（`ApiConfigSection`，登记 **H-16**），另有 3 处已知不可达（H-15）在本报告中获得独立复现与成因定性。

---

## 一、结论速览

| 层 | 度量 | 结果 |
|---|---|---|
| **① 文件层** | 合并前本地状态 vs 合并结果的全部差异 | **901** 条 = 822 条（官方也改过该文件 → 官方内容进结果，预期）+ **79 条**（官方解释不了）<br>🔴 **79 条逐条有台账，无法解释的 = 0** |
| **② 符号层** | 本地改动文件里"同文件内消失的导出符号" | **64** 个 → 分类：本地独有 **0** / 官方仍保留 **0** / **官方自己删的 64** |
| **③ 入口层** | 35 个本地新增源文件的 import 可达性（合并前 vs 合并后） | 33 个不变；**2 个从"有 1 个活引用"变为 0** → `ToolConsoleButton.tsx`（H-15 ①，已知）+ **`ApiConfigSection.tsx`（H-16，本次新发现）** |
| **④ 桥接层** | IPC 通道常量 + preload 暴露键 | 消失 25 通道 / 17 键 → **全部是官方自己删的**（基点有、官方树无）；20 个通道在合并后代码里 **0 引用**（死常量） |
| **⑤ 交叉验证** | GitHub PLUS（`895749d5`）相对基点的 230 条改动 vs 合并结果 | 逐字相同 **146**；不同且官方也改过 **44**；**余下 23 条全部落在同一份已登记偏差清单内**（12 个 H-07 删测试 + 8 篇搬家文档 + 1 篇 D6 文档 + 2 个已记录的测试改动） |

> **一句话**：**你添加的功能实现一处没丢、一处没被改写**；丢的是**入口**——
> 3 处是"官方把宿主窗口/宿主组件重构掉了"，1 处是"合并解决时把 import + JSX 一起丢了"。
> 4 处都能从 `phase0-full` 原样取回，P9 接回即可。

---

## 二、参照物认定（先把尺子校准，否则后面全部结论无效）

### 2.1 `phase0-full`（`34f0669f` / tree `00ae967e`）**= 合并前本地完整状态** ✅

与物理备份 `E:\AI_Chating\cyrene-agent-backup-phase0`（`HEAD = eb6c311a`，`git status` 219 条 = 131 ` M` + 13 ` D` + 75 `??`）逐文件比对：

| 比对 | 结果 |
|---|---|
| 备份工作区文件清单（`git ls-files --cached --others --exclude-standard`，2029 条）vs `phase0-full`（2013 条） | 差集 **16 条，全部只在备份侧** |
| 这 16 条的构成 | **13 条 = 原始状态自己就删掉的文件**（`README.en.md`、`conversation-binding-api.{ts,test.ts}`、`useChannelMirrorEvents.{ts,test.ts}`、`settings/api/{presets,state}.ts`、`custom-endpoint-markup.test.ts`、`settings/tokens/{cache-statistics.ts,cache-statistics.test.ts,panel.ts,state.ts}`、`vision/dom.ts`）+ **3 条 = P0 之后才生成的分析产物**（`protected-features-baseline.json`、`robocopy-phase0-summary.txt`、`docs/merge-plan/PHASE-0-完成报告.md`） |
| 6 条探针的 blob 哈希（`git hash-object` 对盘上文件 vs `git rev-parse phase0-full:<path>`） | **6/6 一致**，其中 4 条是当时**未跟踪**的新文件（`audit-log.ts` / `memory/delete-all.ts` / `ToolConsoleButton.tsx` / `user-guide/channel-console.md`），另 2 条是 `history-log.ts`（含 16 个本地独有导出）与 `docs/design/plugin-marketplace.md` |

🔴 **`phase0-tracked`（`d48b0cc8`）不可用作参照物**：它只有 **1880** 条，**缺全部 133 个未跟踪新文件**
（`audit-log.ts` / `memory-console.ts` / `person-erasure.ts` / `zones/*` / `ToolConsole*` / `UsageBadge*` …）。
用它当尺子会把"本来就有的新文件"误判成"合并偷偷加进来的"。

> 复跑：
> ```powershell
> $m='E:\AI_Chating\cyrene-agent'; $b='E:\AI_Chating\cyrene-agent-backup-phase0'
> (git -C $m ls-tree -r --name-only phase0-full | Measure-Object).Count          # 2013
> (git -C $b ls-files --cached --others --exclude-standard | Measure-Object).Count # 2029
> Compare-Object (git -C $m ls-tree -r --name-only phase0-full) (git -C $b ls-files --cached --others --exclude-standard)
> ```

### 2.2 GitHub PLUS（`895749d5`）**= 9/25 的本地快照**（比 R1 早约 12 天）

- 与本地**同源**：其历史里就有我们的合并基点 `eb6c311a`；其上只有 `d16d9bc first commit` + `895749d5 Create README.upstream.md`。
- 仓库属性：public、default branch `main`、`pushed_at = 2026-09-25T16:13:56Z`、1980 个文件。
- 取回方式（**blobless 部分克隆**，只拉 commit + tree，1.76 MiB）：
  ```powershell
  git clone --filter=blob:none --no-checkout --single-branch --branch main `
    https://github.com/rossiiloveyou-crypto/cyrene-agent-PLUS.git E:\AI_Chating\_plus-ref
  ```
- ⚠️ tree/blob 的哈希是**内容寻址**的，所以跨仓库可直接按 `<path, blob-hash>` 比对，**不需要下载任何 blob**。

### 2.3 四个锚点

| 角色 | 引用 | 说明 |
|---|---|---|
| 基点 | `eb6c311a` | merge base（本地与官方共同祖先） |
| 官方 | `b11b8851` | 官方 12 天工作（863 个路径与本仓库不同） |
| 本地 | `phase0-full`（`34f0669f`） | 合并前本地完整状态（277 个路径与基点不同） |
| 结果 | `51a20338`（`phase8-merged`） | P8 合并提交 |

---

## 三、层 ① · 文件层：**0 条无法解释的差异**

### 3.1 口径（三集合算术）

```
L = diff(eb6c311a, phase0-full)   →  本地 12 天工作 = 277 路径
U = diff(eb6c311a, b11b8851)      →  官方 12 天工作 = 863 路径
X = diff(phase0-full, 51a20338)   →  原始状态 vs 合并结果 = 901 路径
```

| 分桶 | 含义 | 数量 | 判定 |
|---|---|---|---|
| **Bucket1** = `X ∩ U` | 双方都动过的路径 → 结果里含官方内容，**必然与原始状态不同** | **822** | 预期 |
| **Bucket2** = `X \ U` | **官方解释不了的差异**（= 嫌疑清单） | **79** | 🔴 逐条核销，见 3.2 |
| **Bucket3** = `L \ X` | 本地改动路径**逐字未变** | **191** | ✅ 保真 |

### 3.2 Bucket2 的 79 条逐条核销（**无法解释的 = 0**）

| 类别 | 条数 | 依据 |
|---|---|---|
| 文档（D6 排除，**磁盘上仍在**） | **56** | `docs/design` 26 · `docs/internal-issue` 11 · `docs/superpowers` 8 · `docs/merge-plan` 7 · `docs/refactor` 4 —— 全部是 D6「文档不进提交」的执行结果（`git ls-files <dir>` = 0） |
| 分析产物（合并期间被脚本更新/新增） | **6** | `.cyrene-merge-analysis/**`（`80-renormalize-filelist` / `85-p3-untracked-before` / `86-p3-tree` / `robocopy-phase0-summary` / `protected-features-baseline.json` / `_probe-official-eol.ps1`），非产品文件 |
| **src（17 条，逐条列全）** | **17** | 见下表 |

| # | 路径 | 状态 | 台账依据 |
|---|---|---|---|
| 1 | `react/…/api-config/api-config-source.test.ts` | D | H-07 整文件删（`0 test`） |
| 2 | `settings/channels/panel.test.ts` | D | 同上 |
| 3 | `settings/dom-refs-consistency.test.ts` | D | 同上 |
| 4 | `settings/keywords-markup.test.ts` | D | 同上 |
| 5 | `settings/memory-manager-markup.test.ts` | D | 同上 |
| 6 | `settings/memory/delete-all.test.ts` | D | 同上 |
| 7 | `settings/memory/erasure-flow.test.ts` | D | 同上 |
| 8 | `settings/memory/manager.test.ts` | D | 同上 |
| 9 | `settings/memory/panel.test.ts` | D | 同上 |
| 10 | `settings/panel-migration-markup.test.ts` | D | 同上 |
| 11 | `settings/zones-markup.test.ts` | D | 同上 |
| 12 | `settings/zones/panel.test.ts` | D | 同上 |
| 13 | `react/…/chat/components/panel-layout.test.ts` | M | **H-07 收窄**（只删 2 条读已删 `ModelModePanel.css` 的红用例，保留 4 条绿；见 J-20） |
| 14 | `settings/shared/modal-icon.test.ts` | M | **P5 §五 偏差 4**（夹具复位，不改产品行为） |
| 15 | `src/shared/usage-badge.ts` | A | **P5 T3 蓝图 §4.2 明确"新建"** |
| 16 | `src/shared/usage-badge.test.ts` | A | **P5 T3 蓝图 §4.3 明确"新建"** |
| 17 | `src/main/channels/group-context-flow.test.ts` | A | **P6 蓝图 §4.x 明确"新建"**（静默失效探测器，4 tests，已突变验证） |

> 🔴 **第 15–17 条不是"合并偷偷加进来的"**：它们相对 `phase0-full` 是新增，因为 `phase0-full` 是 **P0 时点**的快照，
> 而这三个文件是 **P5 / P6 施工期**才创建的。三者在蓝图里都是**显式交付物**，P5/P6 完成报告已登记。

**⇒ 文件层结论：本地 277 个改动路径，191 条逐字保留、86 条差异全部可归因，不可归因 = 0。**

---

## 四、层 ② · 符号层：**0 个本地独有符号丢失**

文件在 ≠ 内容在。对本地改动过的每个 `.ts/.tsx`，抽 `phase0-full` 的导出面，与合并结果**同一文件**的导出面比对：

```
pre 导出文件数 = 749      合并后 = 842      同文件内消失的导出符号 = 64
```

64 个逐一三分类（是否在基点 `eb6c311a` 里、是否在官方 `b11b8851` 里）：

| 分类 | 数量 | 含义 |
|---|---|---|
| ① **本地独有**（基点无 · 官方无） | **0** | 🔴 若 >0 即"本地功能实现被删"——**没有** |
| ② **官方仍保留**（= 我们丢了官方内容） | **0** | 🔴 若 >0 即"合并把官方内容吃掉了"——**没有** |
| ③ 基点有 · 官方删了 | **64** | 官方自己的重构：`chats-store.ts` 的 `upsertMessage/appendMessage/replaceMessages/replaceMessagesTail/setMessageTtsCacheKey`（连同 `chats:upsert/append/…` 通道）、`create-aux-windows.ts` 的 `createSettingsWindow/createSidebarWindow/createTasksWindow`（多窗口架构退场）、`window-state.ts` 的 `sidebarWindow/settingsWindow/tasksWindow`、`shared/reasoning.ts` 的 8 个推理类型（官方 V4.1 Flash 适配重写）、`permission.ts` 的 `ApprovalRequest/ApprovalSettledPayload` 等 |

> 复跑：本报告 §四 的口径即 `git grep -n -o -E '^export (declare )?(async )?(function|const|let|class|interface|type|enum) [A-Za-z0-9_$]+' <ref> -- src`，再对 `{phase0-full, WORKTREE, eb6c311a, b11b8851}` 四份结果做集合差。
> ⚠️ PS 5.1 陷阱：`"^$ref:"` 会被解析成驱动器限定变量，**必须写 `"^${ref}:"`**（本次实测踩到，见 §八 环境记录）。

---

## 五、层 ③ · 入口层：**本次的关键发现**

### 5.1 方法

对 35 个本地新增源文件（`diff(eb6c311a, phase0-full)` 的 `A` 项，排除测试与 CSS），
用 **import 说明符**形态 `['"]…/<basename>['"]` 分别在 `phase0-full` 与工作区（= 合并结果）统计**非测试文件的引用数**：

| 判定 | 数量 | 说明 |
|---|---|---|
| `pre == now`（≥1） | **33** | 可达性未变（含 `zones/*`、`memory/*`、`audit-*`、`person-*`、`group-corpus`、`UsageBadge`、`ToolConsolePanel`、`api-config/presets` 等） |
| `pre ≥ 1 → now = 0` | **2** | 🔴 **入口丢失**，见 5.2 |
| `pre = 0` | 0 | — |

### 5.2 两处入口丢失（成因**不同**，必须分开定性）

| 模块 | 合并前的唯一活宿主 | 合并后 | 成因 | 归属 |
|---|---|---|---|---|
| `src/renderer/react/components/ui/ToolConsoleButton.tsx` | `ChatPageNavigation.tsx`（import `:11` + render `:84`） | **0 引用**（连 `ChatPageNavigation.test.ts` 也不引用了） | 🔴 **合并解决时把这个文件的 import 与 JSX 一起丢了** —— 该文件**存活**且被官方改过，`ToolConsoleButton` 却在 `git status` 里看不出任何异常 | **H-15 ①**（已知）→ P9 一行 import + 一行 JSX |
| `src/renderer/react/features/chat/components/api-config/ApiConfigSection.tsx` | `ModelModePanel.tsx`（聊天窗「模型」面板） | **0 引用** | 官方重构把 `ModelModePanel.{tsx,css}` 整体删除、能力迁入 `react/features/settings/*SettingsPanel.tsx`；P4 按"跟随官方"删除该宿主 → **依附其上的本地组件静默失去全部入口** | 🆕 **H-16（本次新发现）** |

> `ApiConfigSection` 的合并前引用者全集（实测）：`ModelModePanel.tsx`（唯一活宿主）、自身、
> `api-config-source.test.ts`（H-07 已删）、`panel-layout.test.ts`、`settings/mcp/panel.test.ts`。
> 合并后只剩"自身 + `panel-layout.test.ts`（测试）" ⇒ **渲染层 0 调用**。

### 5.3 另一类（已知，形态不同）：**宿主窗被官方删除**

| 现象 | 证据 |
|---|---|
| 官方删掉了 4 个渲染入口文档 | `src/renderer/settings/index.html`、`sidebar/index.html`、`tasks/index.html`、`call/index.html` 在 `eb6c311a` 与 `phase0-full` **都在**，在 `b11b8851` 与 `51a20338` **都没有**（官方同时新增了 `call-react/index.html`、`react-perf/index.html`） |
| 后果 | 旧设置窗的宿主消失 → `settings/zones/*`、`settings/memory/*`、`settings/shared/section-nav.ts` 整簇**只剩互相引用**（`zones/dom.ts` 20→17、`zones/state.ts` 14→13、`memory/manager.ts` 18→16 …每项都仍有引用，但引用者本身也是孤儿） |
| 归属 | **H-15 ②③**（已知）→ P9 在官方 React 设置页重写（`MemorySettingsPanel.tsx` 增区块 + 新建 `ZonesSettingsPanel.tsx`） |

> ⚠️ **入口层是"文件层 + 符号层"结构上看不见的一层**：H-15 的三项功能，其后端 / IPC / preload 桥**全部完好**，
> 文件数与符号数**全部达标**，只有"渲染层 0 调用"这一点异常 ⇒ 这正是 **J-19 / J-23** 要立的判据。

### 5.4 已确认**没有**入口损失的部分

- `zones` 后端链路（`zones/scope.ts`、`zones/types.ts`、`zone-store.ts`、`zones-ipc.ts`）引用数**逐项不变**；
- `memory` 后端链路（`memory-console.ts` / `person-erasure.ts` / `person-erase-plan.ts` / `memory-deletion.ts` / `run-erasure.ts` / `memory-schema-gate.ts`）引用数**逐项不变**；
- 渠道侧（`audit-log` / `audit-events` / `keyword-policy` / `tool-access` / `tool-guard` / `transcript-erasure`）、语料（`group-corpus`）、用量（`conversation-usage-store`、`UsageBadge.tsx`）、`UsageBadge` 顶栏位置断言 —— **全部未变**。

---

## 六、层 ④ · 桥接层（IPC 通道 / preload 暴露面）：**本地能力 0 丢失**

| 度量 | 结果 |
|---|---|
| `src/shared/ipc-channels.ts` 通道字面量 | 合并前 **358** → 合并后 **355**（**消失 25 / 新增 23**） |
| 消失的 25 个通道 | **全部**满足「基点在 · 官方树不在」⇒ **官方自己删的**；其中 **20 个**在合并后代码里**除常量文件外 0 引用**（死常量），无需处置 |
| 仍被引用的 5 个 | 仅出现在 `src/main/orchestrator/conversation-transcript-phase2.acceptance.test.ts:252` 的一个**字符串数组字面量**里（该测试仍通过）→ 见 §七 观察项 |
| preload 暴露键 | 合并前 **310** → 合并后 **320**（消失 18 / 新增 30） |
| 消失的 18 个键 | 逐条核对（`append` / `upsert` / `replaceMessages` / `replaceTail` / `setMessageTtsCacheKey` / `deleteEmbeddingModel` / `downloadEmbeddingModel` / `getEmbeddingStatus` / `getInterruptedRun` / `closeSidebar` / `closeTasks` / `openSettings` / `openSidebar` / `openTasks` / `toggleAlwaysOnTop` / `onSchedulerChanged` / `messages` / `runId`）→ **全部"pre 有 · 官方无"** ⇒ **官方架构替换，非本地能力丢失** |

> ⚠️ 口径说明：上述键里有 `messages` / `runId` / `id` / `sessionId` / `turnId` 这类**载荷对象字段名**（正则把 2 空格缩进的 `key:` 一并计入了），
> 所以"18 个消失键"应读作"消失的**名字**"，其中真正的 API 方法是与通道一一对应的那 16 个左右。这不影响结论：**没有一条是"我们丢了本该保留的本地能力"**。

---

## 七、PLUS 交叉验证（R2）：与 R1 结论一致

PLUS `895749d5` 相对基点 `eb6c311a` 的改动 = **230** 路径：

| 分类 | 数量 | 判读 |
|---|---|---|
| 与合并结果**逐字相同**（blob 哈希相等） | **146** | ✅ 发布版内容原样落进合并结果 |
| 不同 · 但官方也改过该文件（在 `U` 内） | **44** | 预期：合并结果 = 官方内容 + 本地内容 |
| 不同 · 官方没改过 | **2** | 全部有台账：`panel-layout.test.ts`（H-07 收窄）、`modal-icon.test.ts`（P5 偏差 4 夹具复位） |
| 合并结果里没有 · 官方删掉了 | **17** | 官方删除，预期 |
| 合并结果里没有 · 官方没动过 | **21** | **12 个 H-07 删除的测试** + **8 篇施工记录**（已搬到 `docs/construction/SELF-update 260925/`，在合并结果里**存在**）+ **1 篇 `docs/internal-issue/2026-09-25-…`**（D6 排除，磁盘仍在） |

**⇒ 交叉验证没有产生任何新疑点**：PLUS 侧的"不同/缺失"集合与本报告 §三 的 Bucket2 **是同一份已登记偏差清单**。

---

## 八、未覆盖 / 残余风险（必须显式声明）

| # | 项 | 状态 |
|---|---|---|
| 1 | **`npm test` 全量复跑** | ✅ **已复跑（2026，本次核验内完成）**：在已提交的 `51a20338` 上独立跑全量 = `Test Files 2 failed \| 559 passed (561)` / `Tests 2 failed \| 5403 passed \| 1 skipped (5406)` / `ERR_MODULE_NOT_FOUND` = **0** / Duration **52.97s** —— **与 P8 报告 §四 A6 逐字相同**；两条失败用例 = ③ `theme-token-contract.test.ts:74` + ④ `default-dialogs-regression.test.ts:31`（**均指向 `ToolConsolePanel`**）。→ **该残余风险已消除**，P9 以此为新基线 |
| 2 | Bucket1 的 **822 条"双方都改过"路径** | ⚠️ 无法机械证明"逐行语义"，本报告用**四重代理**覆盖：符号层（§四）+ 入口层（§五）+ 11 项功能基线 + A2 语料 22 / A3 探测器 4 tests。**这是本核验最大的残余不确定性** |
| 3 | `PHASE-8-完成报告.md` | ✅ **已归档并完成复核**（37,878 B / 447 行 / 无 BOM / sha256 `dd29adb9…`；归档后我加了 §十一 撰写者复核补正）→ **未发现虚假陈述**，12 项断言逐条独立复现；提出 **3 条口径补正**（J-24 / J-25 / `??` 计数 16→17） |
| 4 | 官方删掉的通道 → **用户可见能力** | 嵌入模型下载/状态、定时任务变更事件、多窗口控制等由官方新架构替代（`chats:pending-*`、`workspace-*`、`cta:presentation-checkpoint`…）。**不属本次合并责任**，但建议 P9 人工冒烟时确认官方新 UI 覆盖了这些操作 |
| 5 | 环境记录（复跑者注意） | PS 5.1：`"^$ref:"` 会被解析成**驱动器限定变量**（`$ref:` ⇒ 报 `InvalidVariableReferenceWithDrive`），必须写 `"^${ref}:"` |

---

## 九、观察项（不影响结论，建议顺手处理）

1. `src/main/orchestrator/conversation-transcript-phase2.acceptance.test.ts:252` 里仍写着一组**已被官方删除的通道名**（`chats:append` / `chats:upsert` / …）作为字符串字面量。测试仍通过，但这条断言**已不再对应任何真实通道** → 属"看起来在守、其实守空"的假门禁。
2. `panel-layout.test.ts` 保留了 4 条绿用例，其中仍会读到 `ApiConfigSection.css`（该 CSS 属本次新发现的孤儿）。H-16 处置时**不要连带破坏这 4 条**（其中 3 条是 H-05 顶栏布局守卫）。
3. H-07 删掉的 **12 个测试文件**全部可从 `phase0-full` 原样取回（`git show phase0-full:<path>`）。其中 4 个（`memory/{delete-all,erasure-flow,manager}.test.ts`、`zones/panel.test.ts`）测的是 **H-07 保留的那 4 个"里子"模块** —— P9 重写这些功能时，它们是**最有价值的参照物**（但要先脱掉对已删 DOM 外壳的依赖）。

---

## 十、回写清单（T1–T4）

| # | 目标文档 | 回写内容 | 状态 |
|---|---|---|---|
| 1 | `BLUEPRINT-总蓝图.md` §二 判据台账 | 新增 **J-22**（保真核验三层法：文件层 / 符号层 / 入口层）与 **J-23**（"宿主删除传递效应"） | 本次已执行 |
| 2 | `BLUEPRINT-总蓝图.md` §四 Phase 索引 | 新增 **P8.5** 行（本核验）+ 更新 P9 行（纳入 **H-16**） | 本次已执行 |
| 3 | `BLUEPRINT-总蓝图.md` §六 | 新增「核验补录」子节：**第 12 项本地自建功能** = 自定义端点 API 配置（`ApiConfigSection` / `api-config/presets.ts`） | 本次已执行 |
| 4 | `BLUEPRINT-总蓝图.md` §九 当前基线 | 追加核验实测值（三条集合算术 + 79 条分解 + 64 符号分类 + 2 处入口丢失） | 本次已执行 |
| 5 | `HUMAN-人工验证台账.md` | 新增 **H-16**（`ApiConfigSection` 入口缺失，待拍板处置）；H-07 状态更新为"已执行" | 本次已执行 |
| 6 | `PHASE-9-*` 蓝图（待写） | 起手加一步：复跑 `npm test` 建新基线；把 H-16 与 H-15 ①②③ 一并接回 | ⏳ 写 P9 蓝图时执行 |

### 建议（**✅ 已拍板：B —— 只登记、不接回**）

| 选项 | 做法 | 代价 / 风险 |
|---|---|---|
| **A（推荐）** | P9 把 `ApiConfigSection` 接回官方新设置页（或官方新的模型面板位）—— 与 H-15 ②③ 同批处理 | 需确认官方新设置页里"API 端点配置"的**官方对应物**是否已覆盖同等能力；若已覆盖，则改为"确认覆盖 + 决定是否保留本地实现" |
| **B ✅ 已拍板（2026，项目所有者）** | 只登记、不接回（理由：该面板初衷是给旧设置栏减负，官方已重做设置页 → "先不管他"；组件与 `presets.ts` 原物都在，所有者后续自行处理 UI） | 自定义端点配置在合并后**持续不可达**（但原物都在，随时可接） |
| C | 判定"官方已覆盖" → 归档本地实现，不接回 | 需先给出官方对应物的实测证据；**不建议在没有证据时选它** |

---

*核验证据文件（可复跑）：`.cyrene-merge-analysis/p8/p8-parity-X.txt`、`p8-parity-bucket2.txt`、`p8-parity-L.txt`、`p8-plus-diff.txt`、`p8-plus-gone.txt`*
