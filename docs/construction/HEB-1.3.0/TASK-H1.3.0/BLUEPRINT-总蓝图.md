# 总蓝图：HEB-1.3.0 —— 官方 1.3.0 合并

> **读取纪律**（规范 §3.3）：**不要通读 `../methodology/`**。执行一个阶段只需 **3 份** ——
> 规范相关章节（§4 / §5 / §8 / §10 的 T1–T4） + **本文件相关节** + 本阶段施工蓝图；
> 经验库先查 §0 场景索引、命中再展开单条；`BLUEPRINT-经验库-具体坑.md` 按技术栈检索，**不通读**；
> `BLUEPRINT-经验库-全量台账.md` 只用于溯源。
> **执行者须知**：遇到真实代码 / 真实数据与文档冲突时，**以真实代码为准**，并写进完成报告的「五、关键偏差」。
> **本文件必须标出它自己错过的地方** —— 见 §9.3「本文件的自我更正」。
> **前置**：<u>上一次上游同步已结项</u>（`TASK-合并` P10 结项提交 `07253ef2` + `732a6451`），
> 当前 HEAD `9ab07517`，工作区干净（仅 21 条未跟踪证据文件）。

---

## 一、任务背景与关键拓扑

- **一句话**：把官方 `Cyrene-Agent` 的 **`master` 最新（`8fe5ba7a`，含 v1.3.0 发布版）**合并进我们的 `1.2.2-PLUS` 分叉，
  在**不影响本地 11 项自建功能**的前提下吸收上游 130 个提交。
- **关键拓扑（决定策略，不可搞错）**：

  | 角色 | 位置 | 说明 |
  |---|---|---|
  | 我们的仓库（工作区） | `E:\AI_Chating\cyrene-agent` | HEAD `9ab07517`，分支 `master`，领先 gitee `origin/master` **230** 提交 |
  | 上游权威源 | `https://github.com/Playa-Cyrene/Cyrene-Agent.git` | **权威**；本地任何克隆都只是缓存 |
  | 上游本地镜像（**实际使用**） | `E:\AI_Work\Cyrene-Agent` | 实测 `master = 8fe5ba7a`（**新鲜**） |
  | 上游本地镜像（**状态文件里写的**） | `E:\AI_Chating\off-cyan\Cyrene-Agent` | 🔴 **落后**：`master = b11b8851`（差 130 提交） |
  | 合并目标 | `8fe5ba7a` = 官方 `master` 最新 | **含 v1.3.0 tag + 之后 11 个提交**（见 §六 M1：拍板于 2026-10-04 从 `789e5165` 改为本值） |

- **术语表**：

  | 术语 | 含义 |
  |---|---|
  | `b11b8851` | 分叉点（merge-base），2026-09-25，即上一次真正合并的官方提交 |
  | `L_dev` | 本地设备上的改动面 = 相对 `b11b8851` 我方改动的 357 个文件 + 工作区未跟踪文件 |
  | `U_new` | 上游新增面 = `b11b8851..目标` 的上游改动文件 |
  | `RISK` | `U_new ∩ L_dev`，**保守上界**，不是工作量（经验 **D36**） |
  | UU / UD / DU | git 冲突状态码：双方改 / 我方删上游改 / 我方改上游删 |
  | 静默重叠 | 双方改动落在同一文件、git **未报冲突**但改动行区间相交 |
  | 支柱文件 | 我方新代码 `import` 的、且上游也改动过的文件（共 **14** 个） |

---

## 二、成功判据（Definition of Done，逐条可验）

| # | 判据 | 怎么验（命令 / 观测） | 判定方式 |
|---|---|---|---|
| **D1** | 合并后能通过官方工具链三道类型门 | `pnpm run check:main` / `check:preload` / `check:renderer` 三者退出码均为 **0** | 退出码 |
| **D2** | 11 项本地自建功能**全部仍在** | `node docs/construction/tools/<基线核验脚本>`，与 `.cyrene-merge-analysis/protected-features-baseline.json` 的 **11 项 / 文件数**逐项比对：`memory-console 4` · `person-erasure 8` · `ZONES_ 5` · `audit-log 11` · `tool-access 13` · `keyword-policy 6` · `group-corpus 10` · `buildGroupContextBlock 4` · `USAGE_BADGE 2` · `groupContextLimit 11` · `confirmValue 4` | 数字比对（**退化必须能归因到本任务主动删除的文件**，判据 **J-02**） |
| **D3** | 附件文档链**功能未缺失**（本次核心风险点） | `importIds` 出现在 `retriever.ts` 与 `vectorstore.ts` 两处；附件上传后能召回（A 类机器判据 + B 类人眼，见 §七） | 字符串存在性 + 端到端行为 |
| **D4** | 上游 v1.3.0 的历史删除**不得静默生效** | `git ls-files src/renderer/settings/ \| Measure-Object` ≥ 4（四条被本地新代码依赖的模块仍在） | 数字比对（`≥ 4`，见 §六 M2） |
| **D5** | 40 个冲突全部处置完毕 | `git diff --name-only --diff-filter=U \| Measure-Object` = **0** | 数字比对 |
| **D6** | 无悬空引用 | 对上游删除的每个模块跑 `git grep -E "['\"][^'\"]*/<模块>['\"]" -- src` → 命中者**必须**同时出现在保留清单 | 字符串存在性 |
| **D7** | 全量测试不退化 | `pnpm test` ≥ **563 文件 / 5433 通过 / 1 skipped**（P10 基线） | 数字比对（允许**纯增**） |
| **D8** | 运行期可用（人眼） | 设置页打开、附件上传、Zones 面板、记忆台擦除门 —— 见 `HUMAN-人工验证台账.md` | B 类，人只判 ✅/❌ |

> 规范 §7.1 写法要求：**充分判据**优先（D1 / D4 / D5 是退出码或计数）；D2 / D6 / D7 属**启发式指标**，
> 必须配交叉验证 —— 已在各 Phase 蓝图里逐条给出。
> 三条「不算失败」（规范 §7.3）：<br>
> ① **时点断言**：D7 的测试计数取值于**全量跑完的那一刻**；<br>
> ② **有意保留项**：`src/renderer/settings/**` 里被保留的 4 个文件**出现在扫描结果里不算残留**；<br>
> ③ **外部增长量**：`.cyrene-merge-analysis/**` 是**只增不删**的证据目录，其文件数增长不算异常。

---

## 三、全局约束（所有 Phase 共同遵守）

| 约束 | 说明 |
|---|---|
| 工具与工作区边界 | 分析类工作**只读**；除明确要求改动的文件外，**不得** `checkout` / `reset --hard` / `stash push`；试合并一律在**独立临时 worktree** 里做（不碰主工作区、不产生提交、跑完即删） |
| 非 ASCII 文件名 | 本仓库含大量中文路径（`docs/construction/合并/…`、`assets/**/*.png`）。**禁止逐文件脚本复制**（会静默丢文件）；一律用 `git` 机制或 `robocopy` |
| 文件遍历 | 一律用 `git ls-files` / `git ls-tree` / `git grep`，**不要** `Get-ChildItem` 递归拼路径 |
| 环境陷阱 | 本机 shell 是 **Windows PowerShell 5.1**（**无 `pwsh`**）：不能用 `&&`、括号表达式里不能用 `;` 连接命令、`-File` 执行策略受限（用 `&` 或内联亦可）；**执行策略禁止 `.ps1`**（实测 `UnauthorizedAccess`）→ 脚本一律用 `node` 或内联 PowerShell。每条命令前显式设 `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8`。`npm` / `pnpm` 的 `.ps1` shim 同样被执行策略拦（见 §九 已知坑）。 |
| 每步可验证 | 每条改动都要能落成「一条可执行命令 + 期望值 + 失败处置」 |
| 提交粒度 | 每个 Phase 单独提交一次：`<域>(P<n>): <做了什么>`；**P0–P4 期间禁止提交合并结果**（冲突未消解完不得提交），每个 Phase 蓝图里必须显式重写这句 |
| 🔴 **WIP 阈值门禁** | **实测已触发**：待提交 **21 条**（> 20）且最后一次提交距今 **4 天**（> 3 天）。→ **P0 必须先提交或开 `wip/` 分支**，否则违规（规范 §2.4 / 经验 **F23**） |
| 既有改动不得覆盖 | 本任务**不覆盖** `E:\AI_Chating\cyrene-agent` 以外的任何仓库；官方克隆 `E:\AI_Work\Cyrene-Agent` 与 `E:\AI_Chating\off-cyan\Cyrene-Agent` 一律**只读**（只 `fetch`，不 `checkout`、不 `reset`） |
| 🔴 **P1 数据面备份**（M9） | `pnpm install` 之前**必须**把 `node_modules` 备份到 `E:\AI_Work\备份`：<br>`robocopy "E:\AI_Chating\cyrene-agent\node_modules" "E:\AI_Work\备份\cyrene-node-modules-pre-p1" /E /NFL /NDL /NJH /NP`<br>**判定看汇总的 FAILED 与 Mismatch 列，不看退出码**（规范 §2.2：robocopy 的 9 可能是假警报）。<br>同时备份**磁盘上实际存在的**锁文件与 `package.json` —— ⚠️ **实测：本地只有 `package-lock.json`（877384 字节 / blob `05dcca09…`）**；`pnpm-lock.yaml` / `pnpm-workspace.yaml` **从未进入我们的 HEAD**（只在官方 `3470fea7` 里），它们是 **P1 才引入的**。备份命令须逐个 `Test-Path`，缺失时**报错而非静默跳过**（判据 **J-09**） |

---

## 四、Phase 索引（**这一节就是「合并计划」的主干**）

| Phase | 名称 | 性质 | 风险 | 状态 | 文档（同目录） |
|---|---|---|---|---|---|
| **P0** | 提交收口与锚点（含 WIP 门禁销账） | 收口 | 低 | ⬜ 未开始 | `PHASE-0-提交收口与锚点.md` |
| **P1** | 工具链升级（Node 24 + pnpm + TS 6）与门禁可用化 | 环境 | **高** | ⬜ 未开始 | `PHASE-1-工具链升级.md` |
| **P2** | 冲突消解 · 删改类（20 项） | 改造 | 低 | ⬜ 未开始 | `PHASE-2-冲突消解-删改类.md` |
| **P3** | 冲突消解 · 真冲突类（20 项 + 8 个静默重叠） | 改造 | **高** | ⬜ 未开始 | `PHASE-3-冲突消解-真冲突类.md` |
| **P4** | 语义对撞处置（5 处）与入口接回 | 改造 | **高** | ⬜ 未开始 | `PHASE-4-语义对撞与入口接回.md` |
| **P5** | 合并保真核验（分层：文件层→符号层→入口层→桥接层） | 验证 | 中 | ⬜ 未开始 | `PHASE-5-保真核验.md` |
| **P6** | 运行期人工验证与收口 | 验证 | 中 | ⬜ 未开始 | `PHASE-6-运行期验证与收口.md` |

> 状态取值：⬜ 未开始 / 🔄 进行中 / ✅ 完成 / ⛔ 停止。
> **Phase 数量与边界是「写的时候」的判断**，执行中被实测推翻时按 T3 回写本表（经验 **C21**：整合面是冲突块数的 3–20 倍）。

### 4.1 每 Phase 的目标 / 非目标一览

| Phase | 目标（做） | **非目标（不做）** —— 防越界 |
|---|---|---|
| P0 | 21 条未跟踪证据入库或归档；打锚点 tag；确认回退点 | 不合并、不改任何源码 |
| P1 | Node 24 + pnpm 10.33 + TS 6 可用；`check:main/preload/renderer` 能跑出**基线值** | **不解决任何冲突**；不动源码（除工具链配置） |
| P2 | 处置 16 UD + 4 DU；把「必须保留的 4 个删除项」显式留下 | **不碰 20 个 UU** |
| P3 | 处置 20 UU + 复查 8 个静默重叠；逐块处置后**立刻 tsc 该文件** | **不做产品决策**（遇到就登记 H-A） |
| P4 | 5 处语义对撞落地；被删入口接回（对照清单销账） | 不顺手重构、不扩大范围 |
| P5 | 四层核验 + 11 项功能基线逐项比对 | 不修代码（发现问题登记，回 P3/P4） |
| P6 | 运行期 B 类人眼验证 + 收口提交 + 回写清单闭合 | 不引入新功能 |

---

## 五、依赖关系（为什么不可跳过）

- **P1 依赖 P0 的锚点**：工具链升级会改 `package.json` / `pnpm-lock.yaml` / `tsconfig.*`，
  没有锚点就无法回退到"升级前"。不满足 → 门禁一旦起不来就没有退路。
- **P3 依赖 P1 的编译门禁**：经验 **C21** 明确要求「每块处置后**立刻**对该文件跑 `tsc`」。
  没有可用 `tsc` 就只能等全部块做完再一起编译，定位成本**翻十倍**（实测：`build-options.ts` 取 ours 后块外整片 18 条 `TS2304`）。
- **P2 依赖 P3 的顺序不能反**：删改类（20 项）的处置会**改变文件集合**，
  先做它才能让 P3 面对的是一棵"删除已定"的树；反过来做会让 P3 的 `tsc` 报出一堆将被删除文件的假错。
- **P4 依赖 P3 的冲突消解**：语义对撞（归并两套字段 / 两套记忆门禁）必须在冲突块处置完之后，
  否则块内的临时取舍会被后面推翻，白做两遍。
- **P6 依赖 P5 的核验**：核验报告是运行期验证的输入清单（哪些入口"没接回"要先机械找出来）。
- ⚠️ **P1 是本次相对上一次合并的**新增**前置**：上一次（`TASK-合并`）用的是本地 Node，
  本次上游把引擎抬到 `>=24 <25` + TS `^6.0.3`，本机实测 **Node v22.23.2 / tsc 5.9.3** —— **不达标**。
  这是**新出现的硬依赖**，不可跳过（详见 §二 D1 与 §九 已知坑）。

---

## 六、已拍板决策（**Agent 不得重新论证**）

| # | 决策 | 依据（文档 / 实测） | 拍板人 · 日期 |
|---|---|---|---|
| **M1** | 合并目标是**官方 master 最新 `8fe5ba7a`**（含 `v1.3.0` tag + 其后的 11 个厂商声明重构提交） | 用户原话「**7. 并到最新的 8fe5ba7a，反正也不影响**」· 2026-10-04。<br>⚠️ **本行曾被改写**：2026-10-03 的初版拍板是「只并 tag `v1.3.0`（`789e5165`）」，理由是"那 11 个提交与我方差集只重叠 3 个文件"；2026-10-04 人改为直接并最新 → 数字已按 §9.4 **E9** 全部重测（见 §9.2 历史基线） | 人 · 2026-10-04（原 2026-10-03） |
| **M7** | 合并手势 = **分步 `--no-ff --no-commit`**（不是一次性 `--no-ff`） | 用户原话「**6. 分布**」（＝分步）· 2026-10-04。与 §三「P0–P4 禁止提交合并结果」自洽：先试合并 → 逐 Phase 处置 → 最后统一提交 | 人 · 2026-10-04 |
| **M8** | Node 24 **只给本应用装**，不动本机全局 Node | 用户原话「**8. 只给 cynere 这个应用装即可**」· 2026-10-04。→ P1 用**应用局部** Node 24（便携版 / 局部 PATH / `.nvmrc`），**不修改系统 Node**，避免影响本机其他项目 | 人 · 2026-10-04 |
| **M9** | P1 的 `pnpm install` 之前，把 `node_modules` **整目录备份到 `E:\AI_Work\备份`** | 用户原话「**9. 备份到 E:\AI_Work\备份**」· 2026-10-04。实测该目录**已存在**；`node_modules` = 132037 文件 / 2.08 GB；`E:` 盘可用 254.1 GB（余量充足） | 人 · 2026-10-04 |
| **M2** | **附件文档链（向量化）整体保留**：`document-index-*` / `document-cache` / `embedding-index-service` / `sticker-embedder` / `sticker-embedding-cache` / `ui-font-protocol` 一律**不删** | 实测：官方 v1.3.0 **删除了** `imported_doc` 召回与附件索引（`orchestrator/index.ts` 删 `searchMemory(..., "imported_doc", 2)`；`file-ingest.ts` 345 → 76 行，注释「**这里不读取文件内容，也不建立索引**」）。这是**我方独有能力**，删了就违反「功能不得缺失」 | 人 · 2026-10-04（决策原文：「我的功能不能发生功能性变化和缺失，其余方面跟随官方或者审计」） |
| **M3** | **BM25 不是替代品，是已有能力**：`HybridRetriever`（`vectorWeight=0.7` / `bm25Weight=0.3`）在共同祖先 `b11b8851` 就已存在；官方只是把内联的 222 行 BM25 抽成 `text-ranking.ts`（`retriever.ts` 362 → 140 行），**算子参数逐字相同**（`k1=2.2` / `b=0.75` / 名词 ×1.3 / 停用词 ×0.3） | §9.4 实测证据 E3。官方新增的是**另一个系统**：本地知识库（`userData/knowledge/search.sqlite` + BM25 + `knowledge_search`/`knowledge_read` 工具），与附件链**存储与隔离维度都不同**，可并存 | agent 实测 · 2026-10-04，人已确认 |
| **M4** | **窗口圆角 + UI 字体两项设置直接删**，跟随官方（官方 `df395282` 移除圆角设置项 + `5dfcccd5` 固定字体为系统默认） | 用户决策「1. 直接删」 | 人 · 2026-10-04 |
| **M5** | **`src/renderer/settings/**` 里被本地新代码依赖的 4 个模块保留**：`shared/modal.ts`（477 行）/ `shared/modal-state.ts` / `memory/dom.ts` / 其连带；其余 51 个上游删除项**接受删除** | 用户决策「3. 连带文件保留」。实测依赖方：`zones/panel.ts`、`memory/delete-all.ts`、`memory/erasure-flow.ts`、`memory/manager.ts` | 人 · 2026-10-04 |
| **M6** | 「其余方面**跟随官方或者审计**」= 无本地功能性依赖的上游改动一律照收，**但必须逐条留审计痕迹**（进 `ABANDONED-有意放弃清单.md` 或完成报告 §五），不得静默接受 | 用户决策原文 | 人 · 2026-10-04 |

> 要推翻其中任何一条：**走 T3 回写**（规范 §5.1），不要在施工里"顺手改"。

---

## 七、必须保护的东西（基线文件与逐项清单）

- **基线文件（不得修改内容，只可读取比对）**：
  - `.cyrene-merge-analysis/protected-features-baseline.json` —— **11 项自建功能基线**（本任务 D2 的权威来源）
  - `.cyrene-merge-analysis/p10/baseline-fulltest.log` —— **563 文件 / 5433 通过 / 1 skipped**（本任务 D7 的权威来源）
  - `.cyrene-merge-analysis/**` —— **只增不删的证据目录**（P7–P10 的所有复跑命令都指着它）
- **本地独有能力清单（11 项，标准测试覆盖不到其失效方式）**：

  | 功能 | 标识 | 基线文件数 |
  |---|---|---|
  | 记忆管理控制台 | `memory-console` | 4 |
  | 按人擦除 / 身份归属 | `person-erasure` | 8 |
  | 区块 zones | `ZONES_` | 5 |
  | 渠道审计 | `audit-log` | 11 |
  | 工具白名单 | `tool-access` | 13 |
  | 关键词策略 | `keyword-policy` | 6 |
  | 群语料 | `group-corpus` | 10 |
  | 群聊旁听上下文 | `buildGroupContextBlock` | 4 |
  | 用量徽章 | `USAGE_BADGE` | 2 |
  | 群上下文上限 | `groupContextLimit` | 11 |
  | 弹窗确认门 | `confirmValue` | 4 |

- 🔴 **三条机器判据的载体不得从门禁名单去掉**（P10 交接 5）：
  `src/renderer/react/styles/class-name-contract.test.ts`（新面板要加进 `COVERED_TSX`，当前 **3** 条）·
  `src/main/orchestrator/group-context-injection.test.ts`（群聊旁听探测器）· 全量测试（**先校准 PATH**）
- 🔴 **必须人工确认的部分**（B 类，见 `HUMAN-人工验证台账.md`）：
  ① 附件文档链端到端（上传 → 召回）；② **11 项中「能力在、入口没了」的 5 项**（经验 **A56**：入口丢失**不产生任何 tsc 或测试失败**）：
  `memory-console` / `ZONES_` / `keyword-policy` / `USAGE_BADGE` / `groupContextLimit`；
  ③ 设置页各面板能打开；④ 记忆模式切换（vector/summary/wiki/off）与本地域过滤**共存**。

---

## 八、参考文档索引

| 我要找 | 去哪 |
|---|---|
| 写作规范 / 经验库 / 回写规范 / 模板 | `../methodology/`（**跨目录相对路径，不写裸文件名**） |
| 本任务的其他文档 | 本目录 `TASK-H1.3.0/` |
| 人工环节欠账 | 本目录 `HUMAN-人工验证台账.md`（编号 H-nn）—— **人工验证的唯一载体**：拍板 / 评审 / 待验**共用一张九列表**，验完就地回填，**不另开作业单或回执文件**（规范 §4.1.2） |
| **上一个任务的结论与经验** | `../合并/TASK-合并/PHASE-10-完成报告.md`（结项报告 §五 12 条偏差 / §八 交接清单 / §十 回写清单）<br>🔴 原始文档**在本仓库内**，可直接打开（与经验库「出处」列不同） |
| 上游同步规程 | `../合并/TASK-合并/SYNC-上游同步SOP.md` |
| 有意放弃清单 / 长期待办 | 本目录 `ABANDONED-有意放弃清单.md` / `BACKLOG-长期待办.md`（**本次需新建**，见 P4/P6） |
| 历史记录（经验条目的出处） | 只写「**记录标识**」（`task-合并/PHASE-6-完成报告.md §五 偏差 2`）—— 与本节上一行不同：**本仓库内真实存在的文档可以给路径**，方法论包的范例出处不给 |

---

## 九、当前基线（✅ 最新，供逐项比对）

```text
# ── 仓库状态（2026-10-04 17:2x 实测；**P0 收口后**，目标已改为 8fe5ba7a）──
ours HEAD          = 2c8d779d   （docs(P0): 校正 HEAD/提交数为实测值）
  ↳ P0 收口提交     = 6871f1f4   （chore(P0): 收口任务前累积改动 —— 188 文件，**唯一有"改动面"的提交**）
  ↳ P0 文档提交     = 7a35ad0b, 2c8d779d（完成报告 / BACKLOG / 总蓝图回写 / 数值校正；**只动 5 个文档**）
  ↳ 历史值         = 9ab07517   （feat(控制台): 触发/拦截关键词接线到渠道控制台；被 P0 取代，不删）
🔴 **P0 产生了 3 个提交**（蓝图 §四 4.3 期望 1 个）：1 个改动提交 + **2 个 P0 自己的文档提交**
  （完成报告 = §七 产出物之一，且它要记录提交哈希 → **不可能塞进它所描述的那个提交里**）。
  ⚠️ **P1 不要依赖本行给出的 HEAD 精确值**：只要 P0 的文档随后被再次修订，它就会再变一次。
  **要稳定引用请用**：`pre-heb-1.3.0`（= 合并起点 = 收口提交，**推荐**）或 `HEAD`（= P0 末态）。
  📌 `pre-heb-1.3.0` 打在**收口提交 `6871f1f4`**：既是 §六 A2 的字面要求（"前者 = P0 提交哈希"），
  也是语义上的"任务前基线"——两义**恰好重合**。
branch             = master  →  origin/master (gitee) ahead 233   （收口前 230；+3 个 P0 提交）
merge-base         = b11b8851   （2026-09-25 23:30，P0 后复测未变）
merge target       = 8fe5ba7a   （官方 master 最新 = v1.3.0 tag + 11 提交）
🆕 锚点 tag（P0 打）
  pre-heb-1.3.0        = 6871f1f4   （annotated；**我方基线**＝收口后的树）
  official-target-8fe5ba7a = 8fe5ba7a （annotated；**合并目标**，抗 force-update / ref 漂移）
  ↳ 取 commit 必须写 `official-target-8fe5ba7a^{commit}`（annotated tag 直接 rev-parse 给的是 tag 对象 SHA，见 J-12）
  ↳ refs/remotes/official/master 仍 = 8fe5ba7a，但**本仓库没有配置 remote.official**（该 ref 是裸远程跟踪 ref）
上游提交数          = 130        （v1.3.0 时是 119）
我方提交数          = 14         （原 11；+3 个 P0 提交）
双方改动文件        = 上游 756  /  我方 357  /  重叠 65（src 59 / 代码 55）
试合并冲突          = 40         （UU 20 / UD 16 / DU 4）—— **与 v1.3.0 完全一致，零新增**
静默重叠            = 8          （git 未报冲突但改动行区间相交；区间相交总数 32，其中 24 个已进冲突列表）
我方新增源码文件    = 90（src 内） / 142（含文档与配置）
  ↳ 被上游改动      = 0          ← 零撞名
  ↳ 直接依赖被删模块 = 4          （zones/panel.ts、memory/delete-all.ts、memory/erasure-flow.ts、memory/manager.ts）
  ↳ 依赖被改的支柱文件 = 14       （hub 文件，按被依赖次数排序见 §9.5）
git 自动合并        = 709 文件 / +53905 −53760

# ── P0 收口实测（2026-10-04，本节由 P0 施工回写）──
工作区收口          = 21 条未跟踪项 → **提交 6871f1f4**：188 文件 / +79893 行 / 12.78 MB
  ↳ 暂存构成        = A 证据 118 + B 施工记录 68 + C 资产 1 + `.gitignore` 1
  ↳ 归类结果        = A/B/C/D 全部归类，**未归类（E 类）= 0**；D 类 69 文件有意不提交 → BACKLOG **B-01**
  ↳ 21 条与 E2 比对 = **逐条一致**（无第 22 条）→ 停止条件 S3 **未触发**
  ↳ 量纲提醒        = `git status --porcelain` 的**行数（21）是目录级条目数**，**≠ 文件数（187）**；
                      **唯一权威是 `git diff --cached --name-only`**（见 J-11 同族的量纲坑）
🔴 A1 口径修正（判据 **J-10**）：`git status --porcelain` 收口后 = **3 行**（`?? docs/design/`、`?? docs/internal-issue/`、
  `?? docs/refactor/`），**不是 0 行** —— 三处是 D 类遗留，已登记 B-01，按 J-10 口径判定出口
`.gitignore` 改动   = +2 行（白名单区 `!dist/renderer/cyrene-welcome.png`）；**实测：这不改变任何 git 行为**，
  该文件本来就不被任何规则匹配（`dist/renderer/` 未被整体忽略）→ 见 J-13；它仍会被 `git clean -fd` 删掉
工具链基线（P0 后仍为 P10 值，**尚未跑过** `pnpm install`）
  node              = v22.23.2   （上游要求 >=24 <25）
  typescript        = 5.9.3      （package.json devDep `^5.6.0`；上游要求 ^6.0.3）
  npm / pnpm        = 🔴 **当前 `D:\data\node\` 的 npm/pnpm 安装已损坏**（`Cannot find module …npm-cli.js` /
                      corepack `pnpm.js` 缺失），且 `.ps1` shim 另被执行策略拦 → 可行性问题登记 BACKLOG **B-04**
  pwsh              = 本会话可用（`pwsh -Command`）；但**执行策略禁止 `.ps1`**（实测 `UnauthorizedAccess`）

# ── 本机环境（不达标，P1 要解决；M8 = 只给本应用装）──
🆕 第二处 Node    = **`D:\data\node24\node.exe` 已存在**（`where node` 列出两处；版本未验证）→ P1 第一步先验它
node               = v22.23.2   （当前生效的是 `D:\data\node\node.exe`；上游要求 >=24 <25）
typescript         = 5.9.3      （上游要求 ^6.0.3）

# ── 门禁基线（P10 结项值）──
全量测试            = 563 文件 / 5433 通过 / 1 skipped
三条机器判据        = class-name-contract（3 条 COVERED_TSX）/ group-context-injection / 全量
11 项功能基线       = 全部「存在 OK」（文件数见 §七 表）

# ── P0 数据面备份（M9 兑现；判定看 FAILED / Mismatch 两列，不看退出码）──
备份目录            = E:\AI_Work\备份\cyrene-pre-P1-2026-10-04\
  node_modules      = robocopy 汇总 **Dirs 10983/10983 · Files 132037/132037 · Mismatch 0 · FAILED 0 · Extras 0**
  BACKUP-MANIFEST   = 一致性 **`MATCH ✅`**（源 = 目标 = **132037 文件 / 2234681003 字节 / 2.08 GB**，偏差 0.00%）
  已备份文件        = package.json（6900 B）+ package-lock.json（877384 B）
  🔴 确认不存在     = `pnpm-lock.yaml` / `pnpm-workspace.yaml`（**实测 `Test-Path` = False**，兑现判据 **J-09**）
  E: 可用空间       = 254.1 GB（备份前）

# ── 上游同步口径（经验 D35：必须带「源 + 新鲜度」）──
权威源             = https://github.com/Playa-Cyrene/Cyrene-Agent.git
本次实测数据来源    = 本地克隆 E:\AI_Work\Cyrene-Agent （master = 8fe5ba7a）
本次新鲜度         = 2026-10-04 09:24:18（.git/FETCH_HEAD 时间戳）
🔴 状态文件里的镜像  = E:\AI_Chating\off-cyan\Cyrene-Agent （master = b11b8851，**落后 130 提交**）→ BACKLOG **B-03**
脚本实测            = `node scripts/merge/upstream-sync.mjs --check --fetch` → exit **1** /
                      RISK **746** / U_new 756 / L_dev 1041 / SAFE 10
                      stderr: 「镜像路径抓取失败，改试 github…」（**回源成功，非假安全**）
```

### 9.1 判据台账（`J-nn`，跨 Phase 累积）

> 本任务是**新任务**，编号从 `J-01` 起；**上一任务的 J-01…J-38 不继承**（规范 §7.2：台账属任务专属）。

| 编号 | 旧判据 | 新判据 | 依据（哪个 Phase 的哪条偏差） | 生效范围 |
|---|---|---|---|---|
| **J-01** | 未跟踪文件数 ≥ 141 | 逐项核对工作资产是否仍在磁盘上 | 沿用 `task-合并` 的 J-01（P3 偏差 2：判据与步骤自相矛盾） | 本任务全程 |
| **J-02** | 11 项功能基线不得退化 | 退化**必须能归因到本任务主动删除的文件** | 沿用 `task-合并` 的 J-02（P4 偏差 3） | P2 之后 |
| **J-03** | `RISK`（双方都动过）当工作量 | `RISK` 是**保守上界**；工作量以**试合并实测**为准，两者差额要写出来 | P0 实测：RISK **746** vs 试合并真正需人工处置 **40**（经验 **D36**） | 本任务全程 |
| **J-04** | 上游 v1.3.0 的所有删除都接受 | 上游删除项**凡被我方新代码 import 的必须保留**（当前 **4** 个模块） | P0 实测：4 个 UD 文件被我方新代码依赖（经验 **A56**） | P2 之后 |
| **J-05** | 「台账无未闭合拍板」的判据 = `Select-String -Pattern '未知\|待定\|TBD'`（规范 §4.1.3 给的**原式**） | 改用**限定到列**的写法：未闭合拍板 `^\|.*\[ \]`；未预填行 `^\| \*\*H-\d+\*\* \| [^|]* \| [^|]* \| [^|]* \| (待预填\|—)`（**不钉行尾**）；结论列禁词 `^\| \*\*H-\d+\*\* \| [^|]* \| [^|]* \| [^|]* \| [^|]* \| [^|]*(未知\|待定\|TBD)` | **P0 实测自命中**：原式在 `HUMAN-人工验证台账.md` 上返回 **3 行**，全部是判据自身的原文（判据代码块 2 行 + 下方警示注 1 行）→ 该判据**恒失败**，会被人为放宽到失效（经验 **D29**） | 本任务全程（含后续所有台账类判据） |
| **J-07** | 逐列通配正则 `^\| \*\*H-\d+\*\* \| [^|]* \| [^|]* \| [^|]* \| (待预填\|—) \|` | **`[^|]*` 是贪婪的**，它会一路吃到状态列，使得该式**恒返回 0 行（假绿）**；正解 = 用**非贪婪** `[^|]*?` **或**在状态值处**收尾、不在末尾钉 ` \|`** | **P0 实测假绿**：该式首跑返回 **0 行**，而台账里确实有 5 行写着 `待预填（P6）` → 若不复核就当成"全部预填完毕"（经验 **C14 / D29**：判据自身必须被验证） | 本任务全程（所有逐列正则） |
| **J-08** | 合并目标的 commit 变了 → 全部风险数字都要重测 | **实测结论：冲突面、重叠面、删除集、我方新增文件受影响面 —— 对目标全部不敏感** —— `v1.3.0`(119 提交) 与 `8fe5ba7a`(130 提交) 的**冲突数同为 40**（UU 20 / UD 16 / DU 4，**零新增**）、**重叠面同为 65**、**静默风险同为那 8 个文件**、**D 类删除集同为 95 个文件且逐条相同**。<br>只有三个数字会变：上游提交数 119→130、上游改动文件 734→756、自动合并 727→709 文件 / +51442−52549 → **+53905−53760**。 | 拍板 M1 由 `789e5165` 改为 `8fe5ba7a` 后按 §9.4 **E9** 重测（两次试合并均实测）。<br>**仍有价值的原因**：它把"要不要多跟 11 个提交"从**风险问题**降级为**纯数字问题**——风险面无任何变化；同时它让 **D4**（保留被依赖的删除项）与 **M5**（保留 4 模块）这两条判据在换目标后**无需重写** | 本任务全程 |
| **J-09** | 文档/蓝图里列出的"要操作的文件清单"可直接按字面执行 | **凡清单必逐个 `Test-Path` 验证**；缺失或与磁盘不符时**报错、不静默跳过** | **P0 起草期实测**：总蓝图 §三 曾列 `pnpm-lock.yaml` 为"要备份的锁文件"，而它**只存在于官方 `3470fea7`**、本地磁盘从未有过（P8 N6：未动依赖与锁）。同族教训 = 经验 **C22**（蓝图里的行号/路径是"写的时候"的快照）与 **D15**（行号不是稳定标识） | P0 起，本任务全程 |
| **J-06** | 台账里 B/C 行只要登记就算"已登记" | B/C 行**必须三列预填完毕**才允许进入验收；未预填的显式写 `待预填（P6）`，并由判据 ② 保证 **P6 收口时归零** | 规范 §4.1.2 硬要求 7（③④⑤ 三列预填完毕该行才允许出现）与"P0 就要登记 H-B 待验项"冲突 → 用**显式占位取值 + 归零判据**化解，而不是让占位静默留在表里 | P6 之后 |
| **J-10** | 收口判据 = `git status --porcelain` **= 0 行** | **收口判据必须写成"作用域内 0 行 ＋ 作用域外剩余项逐条已登记"两条**：<br>① `git status --porcelain \| Where-Object { $_ -notmatch 'docs/(design\|internal-issue\|refactor)/' }` = **0 行**；<br>② 剩余 `??` 项**必须逐条能在 `BACKLOG-长期待办.md` 里查到编号**（当前 = 3 条，全部 → **B-01**） | **P0 实测自相矛盾**：蓝图 §六 同时要求"A1 = 0 行"与"三处 D 类遗留不算失败"，两者不可能同时成立。若不复核就会重蹈 **J-01**（判据与步骤自相矛盾，`task-合并` P3 偏差 2）覆辙：要么把 D 类硬提交（污染基线），要么把 A1 放宽到失效 | P0 起收尾判据 |
| **J-11** | 用 `hash-object` 与 `HEAD:path` 比原始 SHA 判"文件是否被改动" | **禁止**这样判；一律用 `git diff` / `git status` / `git diff --cached`，或 `git hash-object --path <p> <file>` 取归一化值 | **P0 实测踩到**：本仓库 `core.autocrlf=true`，`.gitignore` 磁盘 blob `997b5b08` vs `HEAD:.gitignore` `d0138aeb` **不相等**，但 `git diff` **为空**（git 会把 CRLF 归一化成 LF 再比）。若据此判定"文件已被改"，会直接推翻"工作区干净"这一前置①的前提，**在错误前提上继续施工**（经验 **C14**：验证工具自身必须被验证） | 本任务全程（所有 blob 比对） |
| **J-12** | annotated tag 的 `git rev-parse <tag>` 就等于它指向的 commit | **`git rev-parse <tag>` 返回的是 tag 对象 SHA**；要 commit 必须写 `<tag>^{commit}` 或 `git rev-list -n1 <tag>` | **P0 实测**：`git rev-parse pre-heb-1.3.0` → `016338bc…`（tag 对象），而它指向的 commit 是 `6871f1f4`；蓝图 §六 **A2/A8 写的是裸 `rev-parse <tag>` 并期望得到 commit** → **按字面执行必然 FAIL**。反证：`git merge-base <两个 tag>` 与 `git rev-list --count <ref>..<tag>` **都正确**（它们自动解包），只有裸 `rev-parse` 不解包 | P0 起，本任务全程 |
| **J-13** | `.gitignore` 里的 `!` 白名单条目能"保护"产品资产不被 `git clean -fd` 删掉 | **`!` 只对"本会被忽略"的路径有用；对本来就没被忽略的路径，它是纯注释、零行为效果**。判定"某资产会不会被 `git clean -fd` 删"要看<u>`git clean -ndX` / `git clean -nd` 干跑</u>，**不是**看白名单里有没有它 | **P0 实测**：`dist/renderer/cyrene-welcome.png` 加 `!` 前后，`git status` 报的都是 `??`（都进得了 git），但 `dist/renderer/` **未被任何规则整体忽略**（`siblings = check-ignore` 全不匹配）→ 因此 **`git clean -fd` 会删掉它**，而那两行 `!` 拦不住。蓝图 §四 4.2 把它当成"补白名单 = 保住资产"来写，**保护机制归因错了**（正确结论不变：**P0 不做任何清理动作**，经验 **C30**） | P0 起，含所有"资产保护"类判据 |

### 9.2 历史基线（仅存档）

```text
【2026-10-03 · 目标 = tag v1.3.0（789e5165）时测得，2026-10-04 被 8fe5ba7a 取代】
上游提交数          = 119
上游改动文件        = 734
重叠面              = 65（src 59 / 代码 55）
试合并冲突          = 40（UU 20 / UD 16 / DU 4）
静默重叠            = 8（区间相交总数 28，其中 20 个已进冲突列表）
git 自动合并        = 727 文件 / +51442 −52549
⚠️ 上表**不删除、仅供参考**：它记录了"按发布版合并"的口径。与现行基线的差异见判据 **J-08**。
```

### 9.3 本文件的自我更正

> ⚠️ **曾经错过的地方（记录在案，不掩盖）**：
> ① **BM25 曾被误判为"官方新增的替代方案"** —— 实测证明 `HybridRetriever`（0.7/0.3）在共同祖先 `b11b8851` 就已存在，
>    官方只是抽文件。已在 §六 M3 更正，依据 = §9.4 E3。
> ② **20 个 UD 类冲突曾被建议"一律接受删除"** —— 该结论只在「编译期悬空引用」口径下成立，
>    对**我方新代码的 import**不成立（实测 4 个文件依赖 `shared/modal.ts` 等）。
>    已在 §六 M5 更正，判据 **J-04**。
> ③ 🔴 **规范 §4.1.3 给的判据原式在台账上"自命中"** —— `'未知|待定|TBD'` 实测返回 **3 行**，
>    全是判据自身的原文（判据代码块 + 警示注），**恒失败**。已按经验 **D29** 改为**限定到列**的写法，判据 **J-05**。
>    这条是**规范本身的缺陷**，不是执行者的过失 —— 按规范抬头「修订原则」，以实测为准并在报告里指出。
> ④ **"B/C 行只登记 ≠ 已登记"** —— 规范硬要求 7（三列预填完毕才允许出现）与"P0 就要登记 H-B 待验项"冲突。
>    已用**显式占位取值 `待预填（P6）` + 归零判据**化解，判据 **J-06**。
> ⑤ **合并目标曾被拍板为 `v1.3.0`，2026-10-04 人改为 `8fe5ba7a`** —— 本文件全部风险数字已按新目标重测，
>    旧值移入 §9.2（不删）。实测结论：**风险面不随目标变化**（冲突同为 40），差的是提交数与文件数，判据 **J-08**。
> ⑥ 🔴 **把"官方 diff 输出里的文件名"当成"本地磁盘存在的文件"** —— 本文件 §三 曾写"备份 `package.json` + `package-lock.json` + `pnpm-lock.yaml` 三个文件"，
>    而 `pnpm-lock.yaml` **只存在于官方 `3470fea7`**，本地磁盘**从来没有过**（P8 的 N6 明确「未动依赖与锁」）。
>    已在 §三 就地改正并加判据 **J-09**：**凡列出"要操作的文件清单"，逐个 `Test-Path` 验证，缺失时报错而非静默跳过**（经验 **C22 / D15**：行号与文件名都不是稳定标识）。
> ⑦ 🔴 **本文件与 `PHASE-0-提交收口与锚点.md` 的判据自相矛盾**：一边要求收口判据 A1 = **0 行**，
>    一边又写"`docs/design|internal-issue|refactor` 仍出现在 `??` 列表里不算 A1 失败"。
>    **P0 实测：收口后 `git status --porcelain` = 3 行（就是那三处目录），不是 0** —— 二者不可能同时成立。
>    已按 **J-10** 改为**两条口径**（作用域内 0 行 ＋ 作用域外剩余项逐条已登记 BACKLOG），而不是把判据放宽到失效。
> ⑧ 🔴 **锚点 tag 的取 commit 命令写错了**：§六 A2/A8 用裸 `git rev-parse <tag>` 并期望得到 commit，
>    但本 Phase 打的是 **annotated tag**，裸 `rev-parse` 返回 **tag 对象 SHA**（实测 `016338bc…` ≠ commit `6871f1f4`），
>    **按字面执行必然 FAIL**。已按 **J-12** 改为 `<tag>^{commit}`。同族：**J-11**（`hash-object` vs `HEAD:path` 受 `core.autocrlf` 影响）、
>    **J-13**（`!` 白名单条目对"未被忽略的路径"零行为效果，"资产会不会被 `git clean` 删"要用 `-ndX` 干跑判）。
>    三条都是**"验证工具自身没被验证"**（经验 **C14**）的实例。

### 9.4 实测证据（决定本任务全部做法，不是推断）

| # | 证据 | 怎么复现 | 在哪测的 |
|---|---|---|---|
| **E1** | 试合并 40 冲突 / 727 文件自动合并 / +51442 −52549 | 独立 worktree：`git worktree add --detach <tmp> 9ab07517` → `git merge --no-commit --no-ff 789e5165` | 真机（worktree 已删） |
| **E2** | 静默重叠 **8** 个文件（`-U0` 双方改动行区间求交，git 未报冲突） | 取双方 `git diff -U0` 的行区间求交 | 真机 |
| **E3** | `b11b8851` 的 `retriever.ts` **已含** `HybridRetriever` + `vectorWeight=0.7` + `bm25Weight=0.3` | `git show b11b8851:src/main/rag/retriever.ts \| Select-String HybridRetriever` | 真机 |
| **E4** | 官方 `file-ingest.ts` 自 `b11b8851` 起 **−345/+15** 行，注释「不读取文件内容，也不建立索引」 | `git diff b11b8851..789e5165 -- src/main/rag/file-ingest.ts` | 真机 |
| **E5** | 官方 `retriever.ts` 362 → **140** 行（BM25 抽到 `text-ranking.ts`） | `git show <rev>:src/main/rag/retriever.ts \| Measure-Object -Line` | 真机 |
| **E6** | 我方 90 个新增源码文件里，**0** 个被上游改动 | `git diff --name-only b11b8851..789e5165` ∩ `…9ab07517` 的 A 类 | 真机 |
| **E7** | WIP 门禁**已触发**：21 条待提交 / 最后提交 4 天前 | `git status --porcelain \| Measure-Object` / `git log -1 --format=%cr` | 真机 |
| **E8** | 上游同步脚本本次**回源成功**（镜像落后但未被骗） | §九 代码块内的实跑输出 | 真机（`GIT_DIR` 隔离） |
| **E9** | **换目标重测**：`8fe5ba7a` 与 `v1.3.0` 的**冲突数完全相同（40 = UU 20 / UD 16 / DU 4，零新增）**；重叠面同为 65；静默风险同为那 8 个文件；差的是提交数 119→130、上游文件 734→756、自动合并 727→709 文件 / +51442−52549 → **+53905−53760** | 独立 worktree：`git worktree add --detach <tmp> 9ab07517` → `git merge --no-commit --no-ff 8fe5ba7a` → `diff --name-only --diff-filter=U` 计数（跑完 `merge --abort` + `worktree remove --force`） | 真机（worktree 已删） |
| **E10** | 备份条件已核：`E:\AI_Work\备份` **已存在**；`node_modules` = **132037 文件 / 2.08 GB**；`E:` 可用 **254.1 GB** | `Get-PSDrive` / `Get-ChildItem -Recurse \| Measure-Object Length -Sum` | 真机 |

### 9.5 支柱文件（我方新代码依赖 × 上游也改过，共 14 个）

| 被依赖次数 | 文件 | 谁在依赖（我方新增文件） |
|---|---|---|
| **9** | `src/renderer/settings/shared/types.ts` | `ZonesSettingsPanel.tsx`、`memory-console/DangerZoneSection.tsx`、`settings/zones/rules.ts`、`memory/delete-all.ts`、`memory/erasure-flow.ts`、`settings/zones/panel.ts`、`picker.ts`(+test)、`state.ts` |
| **7** | `src/renderer/react/i18n/index.ts` | `ToolConsoleButton.tsx`、`ToolConsolePanel.tsx`、`UsageBadge.tsx`、`ApiConfigSection.tsx`、`ZonesSettingsPanel.tsx`、`DangerZoneSection.tsx`、`MemoryManagerSection.tsx` |
| **5** | `src/renderer/settings/shared/modal.ts` | `memory/delete-all.ts`、`memory/erasure-flow.ts`、`memory/manager.ts`、`shared/modal-icon.test.ts`、`zones/panel.ts` |
| **4** | `src/main/orchestrator/tools/registry/tool-registry.ts` | `channels/tool-guard.ts`(+test)、`tool-registry-memory-scope.test.ts`、`tool-schema-structure.test.ts` |
| **4** | `src/shared/ipc-channels.ts` | `memory/memory-user-ipc.test.ts`、`zones/zone-whitelist-wiring.test.ts`、`zones/zones-ipc.ts`(+test) |
| **2** | `src/main/rag/index.ts` | `memory/memory-console.ts`、`rag/scope-filter.test.ts` |
| **2** | `src/renderer/settings/memory/dom.ts` | `memory/delete-all.ts`、`memory/erasure-flow.ts` |
| 1 ×7 | `memory-user-ipc.ts` / `harness/run-store.ts` / `build-options.ts` / `conversation-transcript-context.ts` / `orchestrator/index.ts` / `chats-store.ts` / `shared/modal-state.ts` | 见 P3 蓝图逐条 |

---

## 十、回退手册（分级）

| 级别 | 命令 / 动作 | 本次已验证？ |
|---|---|---|
| **单文件** | `git checkout -- <file>`（仅限**未提交**状态；已提交则用 `git checkout <锚点> -- <file>`） | 否（P0 后可用） |
| **整棵树（合并中）** | `git merge --abort` → 回到合并前 HEAD | ✅ 已验证（E1 试合并后实测可用） |
| **整棵树（已提交）** | `git reset --hard <P0 锚点 tag>` | 否（P0 打完 tag 后可用） |
| **放弃整个动作** | 删除试合并 worktree + `git update-ref -d <临时 ref>`；主工作区全程不受影响 | ✅ 已验证（本次评估即按此收尾） |
| **代码回滚与数据回滚分栏** | **代码**：上述四级。**数据**：🔴 本任务**不涉及不可逆数据动作**（不删用户数据、不改 `userData` 结构）；<br>唯一风险点是 **P1 的 `pnpm install`** 会改写 `node_modules` 与 lockfile → 回退 = 恢复 `package-lock.json` + `git checkout -- pnpm-lock.yaml`（**先备份这两个文件**） | 否（P1 执行前先备份） |

> 经验 **F1**：数据不可逆的功能点必须显式标注并写明物理备份路径。本任务**无**此类功能点，故此行写"无"而不是留空。

---

## 附：与本文件配套的另外两份模板（+ 人工台账）

| 抄哪份 | 落成什么文件 |
|---|---|
| `../methodology/模板-施工蓝图.md` | `TASK-H1.3.0/PHASE-<n>-<主题>.md`（12 节） |
| `../methodology/模板-完成报告.md` | `TASK-H1.3.0/PHASE-<n>-完成报告.md`（10 节 + 回写清单） |
| —（按规范 §4.1.2 的**九列表**自建，**开工前建好表头**） | `TASK-H1.3.0/HUMAN-人工验证台账.md`（H-nn，跨 Phase 累积；**人工验证唯一载体** —— 不另建作业单 / 回执） |

### 下一步（本文件之后立刻要做的两件事）

1. **建 `HUMAN-人工验证台账.md` 并预填表头**（规范 §3.3：**不必等有人工环节，开工前就建好**）。
   本任务至少已有 **2 条 H-A 拍板**要登记（见 §六 M1/M2 —— 人已答复，需**原样抄录**进台账）。
2. **写 `PHASE-0-提交收口与锚点.md`**（WIP 门禁是**阻塞项**，见 §三 最后一行）。
