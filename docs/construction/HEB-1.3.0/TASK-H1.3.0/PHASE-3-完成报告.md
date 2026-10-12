# Phase 3 完成报告：冲突消解 · 真冲突类

> **对应蓝图**：`PHASE-3-冲突消解-真冲突类.md`
> **执行人**：agent · **执行日期**：2026-10-04
> **出口状态**：🔴 **合并仍在进行中**（`MERGE_HEAD` 在场、`HEAD = 9920635f` 未动、**未提交**）—— M7 分步合并的正确中间态
> **结论**：**40 个冲突块全部处置完毕（冲突 0）**；main / preload 编译全绿；全量测试**无本 Phase 引起的回归**；
> 但**发现并修复了一类蓝图未覆盖的静默删除**（见 §五 偏差 1，**本 Phase 最大发现**），并留下 **1 项未闭合缺口**（ja-JP 翻译，见 §五 偏差 4）。

---

## 一、范围与结论

| 项 | 计划（蓝图 §1.2） | 实测结果 |
|---|---|---|
| 作业面 | 20 个 UU / **40 个冲突块** | ✅ 一致（开工实测 20 UU / 40 块） |
| 冲突归零 | 冲突 0 | ✅ `git diff --diff-filter=U` = **0 行** |
| 三套编译 | 全绿 | ⚠️ **main / preload 绿；renderer 4 错**（全部为官方新依赖未安装，见 §五 偏差 2） |
| 全量测试 | 不退化 | ⚠️ **583 文件 / 5603 通过 / 1 skipped / 1 失败**（该失败**非本 Phase 引起**，见 §五 偏差 6；i18n 那条已按人拍板登记后转绿，见偏差 4） |
| 11 项功能基线 | 不退化 | ✅ **11/11 不退化**（其中 1 项数字与基线记录不符，已归因到**本任务之前**的删除，见 §五 偏差 5） |
| `wip/p3-src` | 建立 | ✅ `wip/p3-src`（= 索引态快照），逐文件比 blob **2683/2683 一致** |
| 提交 | **禁止** | ✅ 未提交（`HEAD` 仍 `9920635f`） |

**一句话结论**：**冲突块本身全部干净解完，但"解完冲突"远不等于"合并正确"** —— 真正的风险不在 40 个块里，而在**官方对非 UU 文件的静默删除**（`file-ingest.ts` 387→57 行、`retriever.ts` 411→160 行、`rag/index.ts` 删掉我方 8 个导出、`chat-ui-ipc.ts` 删掉我方 2 个 handler、`preload` 删掉 3 个桥方法、`ipc-channels.ts` 删掉 4 个 channel）。这些都**不产生冲突**，且**P2 的"18 救回 / 17 删除"清单完全看不到它们**。

---

## 二、产出物清单（逐条已核）

| # | 产出物 | 状态 | 实测规模 |
|---|---|---|---|
| 1 | `.cyrene-merge-analysis/heb-p3/p3-disposition.md` | ✅ | 40 行逐块处置表 + 3 组计划外改动 + 残留免责（18899 B → 补 i18n 账目后增长） |
| 2 | `.cyrene-merge-analysis/heb-p3/after-tsconfig.{main,preload,renderer}.log` | ✅ | main **exit 0 / 0 错** · preload **exit 0 / 0 错** · renderer **exit 2 / 4 错**；**每份末尾自带 `[运行痕迹]` 行（判据 J-23）** |
| 3 | `.cyrene-merge-analysis/heb-p3/fulltest.log` | ✅ | **583 文件 / 5603 通过 / 1 skipped / 1 失败**（i18n 登记后复跑；详见 §三 A9） |
| 4 | `.cyrene-merge-analysis/heb-p3/ipc-contract.log` | ✅ | **exit 0 / 8 通过**；**末尾自带 `[运行痕迹]` 行**<br>📌 **复核补正 1**：该文件在首版报告里被列为"已交付"但**实际未落盘**（复核人实测 `Test-Path` = False）—— **已按复核意见补跑并落盘**（11.3） |
| 5 | `wip/p3-src`（git ref） | ✅ | `wip/p3-src`（父 `9920635f`），731 文件 / src 598 |
| 6 | `docs/construction/HEB-1.3.0/TASK-H1.3.0/PHASE-3-完成报告.md` | ✅ | 本文件（**含 §十一 复核补正**） |
| 7 | `.cyrene-merge-analysis/heb-p3/probe-tsconfig.main.log`（逐块编译探针） | ✅ | 保留为过程证据（**0 B，按 J-23 属"未复核"形状**；其结论已被 A8 的正式日志取代） |
| 8 | 🆕 `.cyrene-merge-analysis/heb-p3/i18n-allowance-proof.js` | ✅ | **新增**：验证 `PARTIAL_LOCALES` 单向收紧断言的反证脚本（4 场景，退出码 0 = 全符合预期）—— 见 §五 偏差 4 |

> 📌 `.cyrene-merge-analysis/heb-p3/**` **未跟踪**（该目录不在 `.gitignore` 白名单里，与 P1/P2 同规）；
> **未改 `.gitignore`**（避免计划外改动扩大）。

---

## 三、验收测试实测（A1–A11 逐条）

| # | 判据 | 期望 | **实测** | 判定 |
|---|---|---|---|---|
| **A1** | 冲突标记归零 | `--diff-filter=U` = 0 行 | **0 行** | ✅ |
| | | 标记扫描只剩 2 个 P0 证据文件 | **恰 2 个**（`MERGE-REPORT.md` / `bak-modal-workspace.ts`） | ✅ |
| **A2** | 冲突块归零 | = 例外里的标记数 | 全仓 `^<<<<<<< ` 命中 **2 个文件**（即 A1 的两个例外） | ✅ |
| **A3** | 40 块逐块已处置 | 两方标识都在 | **58 个检查点，缺失 0** | ✅ |
| **A4** | 11 项功能基线不退化 | 每项 ≥ 基线 | **11/11 通过**；`groupContextLimit` 11→9，**已归因到本任务之前的删除**（§五 偏差 5） | ✅（带归因） |
| **A5** | 无对已删文件的引用 | 13 个 UD 目标零引用 | **零引用**（import 规格符口径） | ✅ |
| **A6** | 18 救回模块有消费者 | 每个 ≥1 | **11/12 有消费者**；1 个孤儿（`embedding-index-service.ts`）**已被官方新实现取代**（§五 偏差 3） | ⚠️ 带说明 |
| **A7** | 静默重叠 6 项 | 逐条确认 | ①`chat-ui-ipc.ts` **发现入口被删并已恢复** ②`settings-facade.test.ts` **9 条**用例在位 ③`+206/−189` ✅ ④`+243/−218` ✅ ⑤`+217/−20` ✅ ⑥`core-bootstrap.ts` 我方为**纯新增**（schema 门禁），无"被覆盖的 1 行删除" | ✅ |
| **A8** | 三套编译全绿 | 3 × exit 0 / 0 错 | main **exit 0 / 0 错**；preload **exit 0 / 0 错**；renderer **exit 2 / 4 错**（全为官方新依赖未安装） | ⚠️ 2/3 |
| | 🔴 **排除"空项目假绿"（经验 C14）** | 参与文件数非零且量级合理 | 两种口径并列（**均已写明，可复算**）：<br>· **口径 A**（本轮执行者用）= `--listFiles` 输出里**去掉首尾空白后以盘符开头、且以 `.ts`/`.tsx` 结尾**的行 → main **1656** · preload **314** · renderer **5638**<br>· **口径 B**（复核人用）= `--listFilesOnly` 输出里**以盘符开头**的行 → main **1771**（含 `.d.ts` 976） · preload **314**（含 `.d.ts` 210） · renderer **6623**（含 `.d.ts` 5343）<br>⇒ 两口径**差在 `.d.ts` 与少数非 `.ts` 条目**；**preload 两口径精确相同（314）** 可作交叉印证。P1 基线为 1793 / 399 / 6580（**同口径不可比**，仅作量级参照）<br>🔴 **P5 若要用文件数做前后对照，必须自己按同一口径重跑，不要引用本表数字**（判据 **J-22**：报数必须带口径）<br>另做**空跑反证**（不依赖文件数）：故意给 tsc 一个类型错误文件 → **exit 2 + `error TS2322`**，证明 tsc 确实在判 | ✅ |
| | 🔴 **绿格证据自带运行痕迹（判据 J-23，复核新增）** | 绿格日志须含退出码 | 三份日志**末尾均已追加** `# [运行痕迹] tsconfig.<c>.json  exit=<rc>  errorTS=<n>  cmd: …` ⇒ **不再有 0 字节日志**（main/preload 168/174 B，renderer 790 B） | ✅ |
| **A9** | 全量测试不退化 | 563 文件 / 5433 通过 | **583 文件 / 5603 通过 / 1 skipped / 1 失败**（**纯增**：+20 文件 / +170 通过）<br>· 1 条失败 = `class-name-contract.test.ts`（**早于本次合并**，见偏差 6）<br>· 另有 **4 个测试文件因缺 `@tanstack/react-virtual` 加载失败**（`0 test`，随 P5 装依赖消除）<br>· i18n 那条**已按人拍板登记后转绿**（偏差 4） | ✅（净增） |
| **A10** | IPC 契约测试单跑 | 全通过 | **exit 0 / 8 通过**（修复前为 2 失败 —— 正是它抓出了附件链断口）；**证据已落盘** `ipc-contract.log`（复核补正 1） | ✅ |
| **A11** | i18n JSON 可解析 + 键对称 | 解析 OK + 键一致 | `en` = `zh-CN` = **2480 键，双向差集 0**；ja-JP 比对见偏差 4 | ✅（en/zh） |

### 三条判据的**过程价值**（本 Phase 的实证）

| 判据 | 它实际抓到了什么 |
|---|---|
| **A10 `ipc-contract.test.ts`** | **两条断言直接定位了静默删除**：①「主进程外发但 preload 无监听」→ `CHAT_DOCUMENT_INDEX_PROGRESS`；②「IPC 注册点不在组合根可达路径内」→ `src/main/rag/document-index-ipc.ts`。**这是全 Phase 唯一"机器自动发现功能断链"的判据** |
| **A8 `tsc`** | 第一次真正跑起来（P2 因冲突未解无法跑）后，**报出 16 条真实语义错误**（此前被语法错误掩盖）——它们是「官方删符号、我方仍在用」的全部线索 |
| **A6（反向判据）** | 抓出唯一孤儿模块；其余 11 个救回模块的入口**都还在** |

---

## 四、数据面 / 跨文档交叉校验

| 校验 | 方法 | 结果 |
|---|---|---|
| 仓库未被破坏 | `git rev-parse HEAD` + `Test-Path .git/MERGE_HEAD` | `9920635f`（未动）+ `True`（在场） |
| 未执行禁令动作 | 全程人工纪律 | 未 `merge --abort` / 未重 `merge` / 未 `stash` / 未 `commit` / 未 `clean` / 未 `reset --hard` |
| 依赖树未漂移 | 未跑 `pnpm install` | `pnpm-lock.yaml` 保持合并带入态；`node_modules` 未重装 |
| 未改工具链 | `git status` 对照 | **未改** `tsconfig.*` / `vite.config.mts` / `electron-builder.yml`；**未升 TS**（仍 5.9.3） |
| 未增删文件 | 与 P2 出口对照 | **未删除任何文件**；唯一非我方新增的索引改动是 `built-in-tools.snapshot.test.ts.snap` 的**陈旧内容修复**（见 §五 偏差 7） |
| 快照不移动 HEAD | `rev-parse HEAD` 前后 | 前后均 `9920635f`；`wip/p3-src` 只在 refs 上 |

---

## 五、关键偏差（**本 Phase 的价值主要在这一节**）

> 规范 §5.1：与蓝图冲突时**以真实代码为准**，并逐条写明。

### 偏差 1 🔴（最重要）蓝图未覆盖「**救回文件所依赖的上游被删符号**」这一类

- **蓝图怎么说的**：§1.3 非目标 ③「**不动 17 个删除目标与 18 个救回文件** —— P2 已处置完毕；本 Phase 只**消费**它们（检查引用面），**不再增删**」；§1.3 非目标 ⑤「**不新增/删除任何文件** —— 文件级取舍已在 P2 完成」。
- **实测是什么**：**18 个救回文件"救回来了"，但它们依赖的上游符号被官方删掉了** —— 于是"文件在、代码编译不过"。
  官方 v1.3.0 的**有意设计**就是**删掉整条附件文档索引链**（`file-ingest.ts` 的新注释原文：「这里不读取文件内容，也不建立索引」），
  而**我方独有能力（M2）恰恰就是这条链**。被删的符号全部**不在 UU 里、不在 P2 的 18/17 清单里**：

  | 文件 | 官方改动 | 被删掉的、我方在用的符号 |
  |---|---|---|
  | `src/main/rag/file-ingest.ts` | **387 → 57 行**（`-345`） | `Attachment`/`AttachmentKind` · `isBinary` · `isTextExt` · `isUnsupportedExt` · `SMALL_THRESHOLD` · `DocumentImportControl` 等 12 个导出 |
  | `src/main/rag/retriever.ts` | **411 → 160 行**（`-266`） | `RetrieveOptions.importIds` 及其过滤逻辑 |
  | `src/main/rag/vectorstore.ts` | `-30` | `deleteImportedDoc` · `hasImportedDocumentChunks` |
  | `src/main/rag/index.ts` | 删 8 个导出 | `ImportedDocumentResult` · `ImportedDocumentChunk` · `PreparedDocumentEmbedding` · `appendPreparedDocumentBatch` · `importPreparedDocumentForTurn` · `importDocumentForTurn` · `importDocument` · `searchImportedDocumentChunksForImportIds` |
  | `src/shared/ipc-channels.ts` | 删 4 个 channel | `CHAT_DOCUMENT_INDEX_PROGRESS` · `CHAT_PROCESS_DOCUMENTS` · `CHAT_CANCEL_DOCUMENT_INDEX` · `MEMORY_PANEL_DELETE_IMPORTED_DOC` |
  | `src/main/chats/chat-ui-ipc.ts` | 删 2 个 handler + 4 行 import | `CHAT_PROCESS_DOCUMENTS` / `CHAT_CANCEL_DOCUMENT_INDEX` 两个 handler |
  | `src/preload/index.ts` | 删 3 个桥方法 + 1 行 import | `processDocuments` · `onDocumentIndexProgress` · `cancelDocumentIndex` |

- **为什么不能"按蓝图不动"**：若不恢复，则 **M2 决策（人拍板 2026-10-04「我的功能不能发生功能性变化和缺失」）在源码层即失效**：
  `document-index-ipc.ts` / `document-index-worker.ts` 编译不过，`file-ingest.test.ts`（426 行，我方）必红。
- **本 Phase 的做法**：**恢复**（`file-ingest.ts` 整文件取回我方 HEAD 版；其余按官方版结构**增量补回**缺失符号），并**逐条记录**进 `p3-disposition.md` §二。
- **🆕 建议入经验库（M 级）**：**「救回文件」不等于「救回能力」** —— 救回清单必须**同时覆盖该文件的依赖面**（它 import 的符号是否还在），
  否则 P2 的 18 个救回在 P3 会以"编译不过"或更糟的"编译过但没人调用"的形式全部失效。
  同族：蓝图 §九 坑 3（**按清单审计会漏掉清单外的东西**，本项目已复现 4 次）—— **这是第 5 次**。
- **判据建议**：把「救回 N 个文件」改写成「**救回 N 个文件 ∧ 它们的依赖面闭合**」，并给出可执行判据：
  `对每个救回文件，其全部相对 import 的目标符号必须在当前树上存在`（本 Phase 已脚本化验证，缺失 0）。

### 偏差 2 renderer 编译 4 错 = 官方新依赖未安装（**结构性，非解错**）

- **实测**：`@mantine/core` · `@mantine/hooks` · `@tanstack/react-virtual` 三个包**在 `package.json` 里（官方新增）但 `node_modules` 里没有**。
- **归因证据**：这三个包在**我方 HEAD 的 `package.json` 里不存在**、在**官方 `8fe5ba7a` 里存在** ⇒ 是合并带进来的**新依赖**；
  4 条错误的 3 个宿主文件**全部是官方新增/修改**的文件（`AppProviders.tsx` / `ModeSwitch.tsx` / `VirtualChatMessageList.tsx`）。
- **为什么不修**：蓝图 §1.3 明令「**不跑 `pnpm install`**」——依赖安装属**工具链变更源**，与冲突消解是**两个变更源**（规范 §4.1.3 硬要求 5）；
  混在本 Phase 会让 A8 的红绿**无法归因**。台账 **H-15** 已登记（P1 遗留），**销账点 = P5**。
- **对验收的影响**：A8 的 renderer 一格**不能在 P3 判绿**；P5 装依赖后必须复跑并记录「4 错 → 0 错」这个数字。
- **⚠️ 连带影响**：全量测试里 **4 个测试文件**（`ChatMessageList.test.ts` 等）因缺 `@tanstack/react-virtual` 而**整个文件加载失败（0 test）**——
  它们**不是断言失败**，而是**环境缺依赖**；装依赖后必须复跑（见偏差 6）。

### 偏差 3 `embedding-index-service.ts` 成为孤儿（A6 唯一未达标项）

- **实测**：P2 救回的 12 个可判定模块里，**只有它消费者 = 0**。
- **归因（实测证据）**：它的能力是「贴图 **embedding** 索引」，其 4 个原有消费者（`core-bootstrap.ts` / `default-dependencies.ts` /
  `memory-user-ipc.ts` / `settings-ipc.ts`）**全部被官方改造掉了**；官方用 `sticker-text-matcher.ts`（**text 索引**）取代它，
  且**复用同一个缓存文件名** `sticker-embedding-cache.json`（实测 `sticker-text-matcher.ts:44-45`）。
  ⇒ **不是"入口被误删"，而是"能力已被取代"**。
- **本 Phase 处置**：**不删**（§1.3 明令不增删文件）⇒ **转 P5**：P5 的保真核验须就"保留还是随官方删除"给出结论并留审计痕迹（M6）。
- **判据注记**：A6 的"18 个救回模块"在可机械判定口径下实为 **12 个**（另 6 个是测试文件/纯类型文件，按 A6 原文括注可豁免）。

### 偏差 4 ✅ **已闭合**（人拍板 2026-10-04「**不补日语翻译**」）：改为**显式登记缺口 + 单向收紧**

- **人拍板**：**不补日语翻译** ⇒ 处置方式 = 「**显式登记缺口 + 单向收紧**」（既不填 377 条翻译，也不让门禁长期带一条固定红灯）。
- **落点**：`src/renderer/react/i18n/resources.test.ts` 新增 `PARTIAL_LOCALES = { "ja-JP": 377 }`，断言改为三条：
  1. **多翻**：任何语言都不允许（原有断言，保留）；
  2. **完整翻译的语言**（如 `en`）：缺口必须为 **0**；
  3. **登记为部分翻译的语言**：`缺口 ≤ 登记值` **且** `缺口 === 登记值` ⇒
     **缺口扩大 → 报红**（真实漏翻会被拦住）；**缺口缩小 → 报红并提示下调登记值**（门禁**只能收紧，不能悄悄放宽**）。
- 🔴 **纪律已写进代码注释**：**不许为了让它变绿而上调 `PARTIAL_LOCALES` 的数字**；日语补齐后请删除该条目。
- **🔴 判据自身已被验证（经验 D29 / C14：不能只看它变绿）**：新增反证脚本
  `.cyrene-merge-analysis/heb-p3/i18n-allowance-proof.js`（可复跑），用桩数据在临时目录跑 4 个场景，实测：

  | 场景 | 期望 | 实测结果 |
  |---|---|---|
  | 缺口 == 登记值 | 绿 | ✅ 绿（exit 0） |
  | 缺口**扩大**（9 > 8） | 红 | ✅ 红 —— `未翻译 key 数（登记上限 8）: expected 9 to be less than or equal to 8` |
  | 缺口**缩小**（5 < 8） | 红 + 要求下调 | ✅ 红 —— `🎉 ja-JP 的缺口已缩小到 5（登记值 8）——请下调 or 删除 PARTIAL_LOCALES["ja-JP"]` |
  | 缺口为 0 但登记值仍 8 | 红 | ✅ 红 —— 同上提示 |

  ⇒ **这条门禁不是"放宽到失效"，而是"冻结 + 只能缩小"**。
- **实测账目（口径：键集合展平为点分路径逐一比对；基准 = `zh-CN`，即 `BASE_LOCALE`）**：

  | 时点 / 文件 | 键数 | 与基准的差集 |
  |---|---|---|
  | **官方 `8fe5ba7a`** zh-CN / en / ja-JP | **2103 / 2103 / 2103** | 三向**完全一致**（官方自己这门测试是绿的） |
  | **我方 HEAD**（合并前）zh-CN / en | **2118 / 2118** | 我方独有 **410**（相对官方）；官方独有 **395**（相对我方） |
  | **工作区**（合并后）zh-CN / en | **2480 / 2480** | 双向差集 **0** ✅ |
  | **工作区** ja-JP | **2103** | **缺 377 个**（多余 0）；内容**与官方 ja-JP 逐键相同** |

- **合并的收/发账（实测，可复算）**：
  - 官方新增的 **395** 个键 → **合并全部收下**（丢失 **0**）✅
  - 我方独有的 **410** 个键 → 合并后**仍在 377 个**，**丢失 33 个**
  - 校验：`2118 − 33 + 395 = 2480` ✅（与实测吻合）
  - ⇒ **ja-JP 缺的 377 = 我方保留下来、官方 ja-JP 里没有的那 377 个键**
- **丢失的 33 个键**：**逐键核验「是否仍被源码引用」= 全部 0 处引用**（`git grep -F '"<key>"'` 精确匹配，
  含 `appUpdate.restart` / `settingsPage.importingFont|fontApplied|fontImportFailed|fontReset` /
  `todo.projectStatus|gitComingSoon` / `workspaceNotices.compressingContext` / `settingsPage.disclaimer.section5|6.*`）。
  其中 **字体相关的 4 个键对应的是已被删除的字体设置功能**（M4：UI 字体设置直接删）；
  `appUpdate.restart` 对应的功能键在官方与工作区里都是 **`appUpdate.restartAction`**（存在）。
  ⇒ **这 33 个是"随功能删除而失效的死文案"，丢失去害**（**建议 P5 顺手确认后登记，不必恢复**）。
- **本 Phase 另做的补齐**：把官方 `settingsPage.channels` 里我方缺的 **18 个键**按官方原文补进 `zh-CN`/`en`
  （补齐后 en/zh 双向差集 **0**；这 18 个键正是官方在这两个文件里新增、而我方 16 行冲突块（官方加键之前的版本）没带上的）。
- **给 P5 的说明**：`resources.test.ts` 在 P3 出口**应为绿**；若它变红，**按缺口变化方向读**：
  **变大** ⇒ 有人新增文案没补日语（真问题）；**变小** ⇒ 有人补了日语但没下调登记值（去收紧门禁）。
- 📌 **判据教训**：这条缺口**在合并前不可能被发现**——`resources.test.ts` 与 `ja-JP.json` **都是官方带进来的新文件**
  （`git cat-file -e HEAD:src/renderer/react/i18n/ja-JP.json` → **不存在**；`b11b8851` 同样不存在）。
  ⇒ **合并会把上游新增的"更严的门禁"一起带进来，从而让"我方历史欠账"在合并后第一次暴露**（同族：经验 C21 的整合面）。

### 偏差 5 A4 的 `groupContextLimit` 11 → 9：基线值本身是**过期快照**（**不是本 Phase 退化**）

- **实测**：蓝图书面写 11；`protected-features-baseline.json` 写 **11**；但**我方 HEAD（合并前）实测就是 9**，工作区也是 **9** ⇒ **P3 前后完全一致，无退化**。
- **11 的来源已定位**：基线文件由 `598dfb75`（`merge(P3): checkpoint 本地工作（合并前基线）`）入库。该时点实测 **12** 个文件命中；
  其中 4 个（`settings/index.html` · `memory/panel.ts` · `memory/panel.test.ts` · `settings.ts`）在
  **`f228355e fix()/删除旧设置和日程窗口`（本任务之前）**被删，同时新增 `memory-console/DangerZoneSection.tsx` ⇒ 12 − 3 = **9**。
- **结论**：**11 是"写基线时的时点值"**，此后**本任务开始之前**的旧设置界面迁移让它变成 9。
  ⇒ 按 **J-02**，退化归因成立且**可归因到本任务主动删除的文件**（属"有意删除"），**不构成 P3 缺陷**。
- **建议**：P5 逐项比对时应**以 HEAD 实测值为准**并显式写明"基线列 11 为过期值"（否则会重复本 Phase 的排查成本）。

### 偏差 6 全量测试失败的归因（**均非本 Phase 引起**；i18n 那条已按人拍板闭合）

> **口径与时点**：下表的失败面**记于 i18n 登记之前**（首版全量跑）。
> **i18n 登记 + 复跑之后**（2026-10-04 末次）：`583 文件 / 5603 通过 / 1 skipped / **1 失败**` ——
> **失败面由 2 条收缩为 1 条**，剩余那条即下表第 2 行（`class-name-contract`）。

| 失败项 | 归因 | 证据 | 现状 |
|---|---|---|---|
| `resources.test.ts > ja-JP 与基准语言的 key 完全一致` | **官方带入的新测试 + 我方历史翻译缺口** | 见偏差 4 | ✅ **已闭合**（人拍板「不补日语」→ 显式登记 + 单向收紧，转绿） |
| `class-name-contract.test.ts > 官方既有组件的未定义类名不得出现新增项` | **我方既有测试 + 官方带入的新文件** | 报出 3 个未定义类名：<br>① `.cy-issue-report__secondary`（`IssueReportDialog.tsx`，**官方新增文件**，官方自己也未定义该 CSS）<br>② `.cy-session-time-tooltip`（`ConversationSidebar.tsx`，**HEAD 与官方都在用且都无定义**）<br>③ `.cy-streamdown-message`（`StreamdownMessageContent.tsx`，HEAD 与官方都在用；其 CSS 有定义，判为测试的已知欠账未登记）<br>⇒ 该测试**不存在于官方**（`git cat-file -e 8fe5ba7a:…` → 不存在），**是我方 161 行的测试**；三个类名的定义/使用在 HEAD 与工作区**完全一致** ⇒ **失败早于本次合并** | ⬜ **转 P5**（修 CSS 或收紧欠账清单） |

> 🔴 **`work-verification-closure.test.ts` 曾失败 1 条，已定位为"门禁命令缺应用级 PATH"并修复**：
> 它 `pnpm run build` 一个临时工作区；不带 `.node24` 上 PATH 时解析到系统 `D:\data\node\pnpm`（**已知损坏**，`Cannot find module …corepack\dist\pnpm.js`）。
> 按蓝图 §六 A8 口径②（**Node 一律全路径、`$env:PATH` 不跨进程**）补上 `PATH=<仓库>\.node24;%PATH%` 后 **9/9 通过**。
> ⇒ 这是**执行环境口径问题，不是代码问题**；已写入 §八 复现命令。

### 偏差 7 ✅ **已查清并修好**：`built-in-tools.snapshot.test.ts.snap` 的**陈旧快照**（**不是**测试副产物）

> ⚠️ **本节的结论曾被本报告自己写错一次**（首版写成"测试运行写入的副产物，已回退"）。
> 收尾自查时按 **J-24** 复核索引/工作区一致性，才查出**真相相反**：**该快照的 HEAD 版本本身是陈旧的**。
> 如实记录这个自我更正。

- **现象**：跑测试后该文件出现 `MM`；且**反复出现**（回退一次、跑一次、又出现）。
- **首版误判**：以为是"测试副产物"，`git checkout -- ` 回退 ⇒ 但**下一次跑测试它又变**，且**测试由绿转红**。
- **决定性实验（三步）**：

  | 步骤 | 做法 | 观测 |
  |---|---|---|
  | ① | 把索引/工作区都强制回 `HEAD` 版，跑该测试 | **5 个用例失败**（`Snapshots 5 failed`） |
  | ② | 再跑一次（不修任何东西） | **仍 5 失败**，且**文件没有被改写** ⇒ **测试不会自动写回**（vitest 非 `-u` 模式） |
  | ③ | 手工把快照里的诊断文案改成**代码实际产出**的名字，再跑 | **15/15 通过**，且**再跑不再改写**（blob 不变） |

  ⇒ **结论：`HEAD` 里提交的那个版本是陈旧的**（它写着 `→ read_file` / `→ list_dir` / `→ search_code`，
  而代码实际产出的是 `→ Read` / `→ Glob` / `→ Grep`）。**该测试在 HEAD 上本来就是红的**（5/15 失败），
  此前未被发现，是因为**每次跑测试后工作区都会被弄脏**，而"弄脏"被当成了"测试副产物"⇒ 回退 ⇒ 下次再红 ⇒ 循环。

- **内容修复（逐字，共 5 处）**：`→ read_file`→`→ Read` · `→ list_dir`→`→ Glob` · `→ search_text`→`→ Grep` ·
  `需要全文时用 read_file 读取`→`…用 Read 读取` · `读文件 → read_file（更安全）`→`…→ Read（更安全）` ·
  `列目录 → Glob`→`查找文件名 → Glob` · `搜索代码内容 → Grep`→`搜索文件内容 → Grep`（与官方 `8fe5ba7a` 的用词**同口径**）。
- **处置**：`git add` 该文件（索引 == 工作区，blob `75adee61`）；复跑该测试 **15/15 通过且不再改写**。
- **🔴 与官方的关系**：官方 `8fe5ba7a` 里该快照已是 `→ Read` 口径（实测命中 3 处、`read_file` 0 处）⇒
  **合并本应带来官方的新版**，但**冲突/合并结果取了旧的**（或该文件未随官方更新）⇒ 属**合并保真缺口**，本 Phase 已修。
- **纪律**：本 Phase 出口 **`git status` 无计划外 `M`**（已由 J-24 判据机械确认：工作区 vs 索引差异 = 0）。

> 📌 **与偏差 5 同族**：**"基线/快照类产物本身可能是陈旧的"** —— 偏差 5 是**基线数字**过期（`groupContextLimit` 11→9），
> 本条是**快照文件**过期。两者都**不会自己报错**，只能靠"换一个时点/换一个方向去核"才发现（**J-19 / J-22 / J-24** 的立意）。

---

## 六、已知问题 / 转下阶段

| # | 问题 | 转给谁 | 为什么本 Phase 不做 |
|---|---|---|---|
| 1 | 官方新依赖未安装（renderer 4 误 + 4 个测试文件加载失败） | **P5** | §1.3 明令不跑 `pnpm install`；两个变更源不叠加（台账 **H-15**） |
| 2 | `ja-JP.json` 缺 377 键（`resources.test.ts` 红 1 条） | **人拍板 + P6** | 翻译是产品/文案决策（规范 §4.1） |
| 3 | `class-name-contract` 红 1 条（3 个未定义类名） | **P5** | 早于本次合并的既有欠账；本 Phase 不改测试、不改非 UU 文件的样式 |
| 4 | `embedding-index-service.ts` 孤儿模块 | **P5** | 保留/删除需与官方设计对齐并留审计痕迹（M6）；§1.3 明令不增删文件 |
| 5 | `.cyrene-merge-analysis/heb-p3/**` 未跟踪 | **P5/结项** | 入库需改 `.gitignore`（计划外改动，本 Phase 不扩大改动面） |
| 6 | 66 个未跟踪条目（含 3 个 B-01 遗留） | **P5/结项** | 蓝图 §1.3 明令不清理、**禁用 `git clean`** |
| 7 | `package.json` 2 处计划外改动（`name` 取官方 `cyrene-agent`、`version` → `1.3.0`、`allowScripts` 的 electron 条目改 `44.4.3`） | **P4 提交时确认** | 已单列进 `p3-disposition.md`；P4 提交信息须能看出来 |
| 8 | 附件链在**渲染端无活跃调用者**（`processDocuments`/`onDocumentIndexProgress`/`cancelDocumentIndex` 只有 preload 桥，无 React 调用点） | **P6 人眼验证 + 可能的产品决策** | 实测：旧 settings shell 的调用者被本任务之前的迁移删除；React 侧目前只调 `ingestDroppedFiles`（只登记、不索引）。**本 Phase 只保证"源码契约完整、可达、契约测试绿"** |

> 🔴 **第 8 项是本 Phase 的第二个重要发现**（详见 §九 施工记录 2）：
> **M2 的附件文档链在"源码层"是完整的（编译过、契约测试绿），但在"运行期调用层"可能没有入口** ——
> 这正是经验 **A56「能力在、入口没了」**，而且它**不产生任何 tsc 或契约测试失败**。
> 因此 **D3（附件上传后能召回）在 P3 无法判定**，必须由 P6 的人眼验证给出结论；若届时确认无入口，需按 **S4** 走人拍板。

---

## 七、回退方法（本 Phase 可用）

| 级别 | 动作 | 验证 |
|---|---|---|
| R-1 单文件回退 | `git -C <repo> checkout -m -- <file>` | 该文件重新出现冲突标记（`git status --porcelain -- <file>` = `UU`） |
| R-5 从快照恢复 | `git checkout wip/p3-src -- <file>` | `git diff --name-only wip/p3-src~1 wip/p3-src` = **726 个文件** |
| R-3 回到 P2 出口 | 逐个 `checkout -m` 20 个 UU + `git checkout wip/p2-docs -- docs/construction/` | `--diff-filter=U` = 20；`MERGE_HEAD` 仍在 |
| R-4 放弃整个合并 | 🔴 `git merge --abort`（**仅在确定重做 P2+P3 时**） | 回到 `9920635f`；**会丢失 P2 的 18 个救回** |

🔴 **三条禁令**：不 `merge --abort` · 不 `stash` · 不 `git clean`。

---

## 八、给下一个 Phase 的交接（P4 / P5）

1. 🔴 **P4 仍在同一个合并上提交**：`MERGE_HEAD` 在本 Phase 出口**继续在场**、**冲突 0**、**未提交**（`HEAD = 9920635f`）。
   若 P4 开工时看到 `UU ≠ 0` ⇒ 状态被人动过，先查 §七 R-1。
2. 🔴 **P4 提交前必须确认 3 处计划外改动有意进入提交**：`package.json`（`name`/`version`/`allowScripts`）、
   附件链依赖面恢复（7 个文件）、i18n 18 键补齐（2 个文件）——清单见 `p3-disposition.md` §二。
3. 🔴 **P5 的 `pnpm install` 是 H-15 的销账点**：装完必须复跑
   ① `tsconfig.renderer.json`（期望 4 错 → **0 错**）② 4 个测试文件（`ChatMessageList*` / `Streamdown*`）应当能加载并全通过（现因缺包 `0 test`）。<br>📌 **当前只剩 1 条断言失败**（`class-name-contract`，早于本次合并）—— 它**不属于**依赖安装能解决的范围，需单独处置。
4. 🔴 **P5 复核面新增两块**（不在 P2 的 91+3 里）：
   ① **偏差 1 的 7 个恢复文件**（官方版 + 我方补丁，须逐符号核）；② **`wip/p3-src` 与工作区的一致性**。
5. 🔴 **P5 删除判据一律用索引口径**（`git ls-files --error-unmatch` → exit ≠ 0），**不可只用 `Test-Path`**。
6. ⚠️ **门禁命令必须带应用级 PATH**：`set PATH=<仓库>\.node24;%PATH%`，否则 `pnpm` 会解析到**损坏的系统 shim**（偏差 6）。
7. ⚠️ **A4 的基线列 `groupContextLimit = 11` 是过期值**（偏差 5），P5 比对时以 HEAD 实测 9 为准。
8. ⚠️ **附件链的运行期可达性未定**（§六 第 8 项）⇒ **D3 必须由 P6 判定**，且 **P6 必须先备份 `%APPDATA%\live2d-cyrene`**（数据迁移风险）。

---

## 九、施工记录

### 0 · 人工环节回执（索引，不复制结论）

本 Phase **无新增 `H-nn`**（与蓝图 §五 5.1/5.3 一致）。真值在 `HUMAN-人工验证台账.md`。

### 1 · 偏离蓝图之处

| 偏离 | 蓝图原话 | 实际做法 | 依据 |
|---|---|---|---|
| 动了**非 UU** 文件（7 个） | §1.3「不动 17 个删除目标与 18 个救回文件」「不新增/删除任何文件」 | **恢复**被官方静默删除的依赖符号与 IPC 入口 | 不恢复则 M2 决策在源码层失效；真实代码优先（规范 §1 原则 3）；详见 §五 偏差 1 |
| 第 12 行（`build-options.test.ts`）**改了 2 个 deps 字段名** | 蓝图只说"我方整个 `it()` 保留 + 接官方 4 行" | 把 `stickerEmbeddingIndex`→`stickerTextIndex`、`getEmbeddingProvider`→`getStickerTextIndex` | 合并后 `OnRunFinishedDeps` 已无旧字段，**不改则 TS 报错**（官方把贴图匹配从 embedding 改为 text 索引） |
| 第 40 行（`ipc-channels.ts`）**保留 2 个而非 7 个** | 蓝图说"7 个接受删除 + 2 个必须保留" | 实测一致（7 删 2 留），**另补回 4 个被官方删掉的附件链 channel** | 引用面实测：7 个引用数=0；2 个有消费者；4 个由恢复的 handler/preload 使用 |
| 第 29 行（`rag#5`）**P6 转 P1** | 蓝图标 P6「先回答'谁还在用'」 | 实测三个导出**引用数均 ≥1** ⇒ **整块保留** | 蓝图 §四 4.3 的判定表（引用数 ≥1 必须保留） |
| i18n **补 18 键** | 蓝图只要求"保留我方形式 + 11 个新键" | 额外把官方新增的 18 个 `settingsPage.channels.*` 键补进 en/zh-CN | 保留我方 16 行 = 丢掉官方新键；补齐后 en/zh 双向差集 0 |
| 修复 **snapshot 陈旧内容** | — | 诊断文案 `read_file/list_dir/search_text` → `Read/Glob/Grep`（与官方同口径），修后 15/15 通过 | §五 偏差 7 |

### 2 · 蓝图未覆盖、施工中发现的漏洞

1. 🔴 **「救回文件」必须连同"依赖面"一起救**（§五 偏差 1）——**本 Phase 最大发现**，建议入经验库（M 级）。
   为什么蓝图没覆盖：蓝图的判据是**文件级**的（"17 个删除目标的 import 必须为 0 / 18 个救回模块必须有消费者"），
   而真实断口在**符号级**（文件还在，但它的 `import` 目标被删了）。**A5/A6 是文件级判据，抓不到符号级断口**；
   真正抓到它的是 **A8 的 `tsc`** 与 **A10 的 IPC 契约测试**。
2. 🔴 **"源码契约完整 ≠ 运行期可达"**（§六 第 8 项）：附件链在 preload/main 两侧契约齐全、契约测试全绿，
   但**渲染端目前没有调用点** ⇒ **A56 的另一种形态**（能力在、入口在"源码里"、但不在"调用链里"）。
   ⇒ **判据建议**：验证"某能力是否可达"时，除了"文件在 / 符号在 / 契约在"，还必须加一条
   **「从组合根出发，是否存在一条调用路径到达它」**（本 Phase 的 ipc-contract 第二条断言正是这个形状，**它抓到了 `document-index-ipc.ts` 不可达**）。
3. **静默删除比冲突危险**：40 个冲突块**全部按蓝图解对**（A1/A2/A3 全绿），
   但若不跑 A8/A10，**7 个文件的功能缺失会完全无声地进入 P4 提交**。建议后续 Phase 把"**编译 + 契约测试**"
   作为**冲突消解完成的前置**，而不是"最后一步的验收"。
4. **`git status` 的 `??` 与 `M` 不足以发现"能力断链"**：本 Phase 的所有断链都**不产生任何 `status` 异常**。

### 3 · 有意的"不处理"点（判据出口的例外）

1. 仓库内 **2 个文件仍含 `^<<<<<<< `**（`.cyrene-merge-analysis/MERGE-REPORT.md`、`.cyrene-merge-analysis/preserved/bak-modal-workspace.ts`）—— **P0 时代入库的历史内容**，本 Phase 未触碰。
2. `src/renderer/settings/**` 里被保留的 4 个模块（M5 有意保留）仍出现在类名/引用扫描里 —— **不算残留**。
3. `docs/design/` 等 3 个 DU 目标**仍在磁盘且未跟踪** —— 删除判据用索引口径，`Test-Path` 恒 `True` 不算失败。
4. `embedding-index-service.ts` 孤儿 —— 已归因（被官方新实现取代），**本 Phase 不删**。
5. `.cyrene-merge-analysis/heb-p3/**` 未跟踪 —— 与 P1/P2 同规，不补白名单。

### 4 · 验收（实测数字，全部带口径）

```text
# ── P3 出口状态（2026-10-04，本 Phase 施工实测）──
HEAD                = 9920635f52ca8c9e4b148a15c63e5135108dfdb0   （未动）
MERGE_HEAD          = 8fe5ba7a5b3a86043b8034abeaa98f72f7459039   （在场）
冲突面（--diff-filter=U） = 0
冲突块（^<<<<<<< 全仓）   = 0（除 2 个 P0 既有证据文件）
UU / UD / DU / AA    = 0 / 0 / 0 / 0
索引 vs HEAD         = 731 files changed, 56352 insertions(+), 53123 deletions(-)
工作区快照           = A 274 / M 378 + 1(MM) / D 70 / R 3 / ' M' 5 / ?? 70 / UU 0
  ↳ ?? 增量          = P2 出口 64 → 现 70（+6）。**逐条归因（按 mtime/创建时间实测）**：
       · 本 Phase 新建 **4**：`.cyrene-merge-analysis/heb-p3/`（23:20）·
         `.cyrene-merge-analysis/heb-p3-blueprint/`（23:11，内含起草蓝图时的 40 块原文转储 39729 B）·
         `PHASE-3-冲突消解-真冲突类.md`（23:15，蓝图）· `PHASE-3-完成报告.md`（本文件）
       · **P2 遗留但 P2 报告未计入 2**：`PHASE-2-冲突消解-删改类.md`（22:51）· `PHASE-2-完成报告.md`（23:05）
         —— P2 报告的"只新增 2 个"**少算了这 2 个 P2 自己的文档**（属**上一 Phase 的计数口径小误差**，非本 Phase 的问题）
  ↳ 其余 62 条        = `docs/design/` `docs/internal-issue/` `docs/refactor/`（B-01 遗留，J-10 口径②）
三套编译             = main exit 0 / 0 错 · preload exit 0 / 0 错 · renderer exit 2 / 4 错（缺包）
全量测试             = 583 文件 / 5603 通过 / 1 skipped / 1 失败（P1 基线 563 / 5433 / 1 / 0）
  ↳ 唯一失败 = class-name-contract.test.ts（3 个未定义类名，**早于本次合并**）
  ↳ 失败 2 = class-name-contract.test.ts（3 个未定义类名，早于本次合并）
  ↳ 另有 4 个测试文件因缺 @tanstack/react-virtual 加载失败（非断言失败）
11 项功能基线        = 11/11 不退化（groupContextLimit 11→9 为过期基线值，已归因）
A3 并集检查点        = 58 个，缺失 0
A5 删除目标引用      = 13 个目标零引用
A6 救回模块消费者    = 11/12 有消费者，1 个孤儿（已归因）
wip/p3-src           = wip/p3-src（父 9920635f）· 树 wip/p3-src · 2683 条目 · 逐文件比 blob 不一致 0
```

### 5 · 计划外改动清单（**P4 提交前必须确认**）

| 类别 | 文件数 | 文件 |
|---|---|---|
| 附件链依赖面恢复 | 7 | `src/main/rag/file-ingest.ts` · `src/main/rag/vectorstore.ts` · `src/main/rag/retriever.ts` · `src/main/rag/index.ts` · `src/shared/ipc-channels.ts` · `src/main/chats/chat-ui-ipc.ts` · `src/preload/index.ts` |
| i18n 键补齐 | 2 | `src/renderer/react/i18n/en.json` · `zh-CN.json` |
| 工具链/版本字段（**有意决策**） | 1 | `package.json`（`name` → `cyrene-agent`、`version` → `1.3.0`、`allowScripts` electron 条目 → `44.4.3`） |
| 陈旧快照内容修复 | 1 | `src/main/orchestrator/tools/__snapshots__/built-in-tools.snapshot.test.ts.snap`（诊断文案口径，见偏差 7） |
| **人拍板产物**：i18n 部分翻译登记 | 1 | `src/renderer/react/i18n/resources.test.ts`（新增 `PARTIAL_LOCALES = { "ja-JP": 377 }`，见偏差 4） |
| **文档回写**（非源码，但同属本 Phase 交付） | 5 | `BLUEPRINT-总蓝图.md`（P3 行 / §四 4.1 / §七 / §九 新增「P3 实测」/ §9.3.3）· `HUMAN-人工验证台账.md`（H-10…H-13、H-15）· `经验库-通用.md`（F24/F25 + 计数校正）· `经验库-全量台账.md`（关系表计数校正）· 本报告 |

### 6 · 待做 / 未做

| # | 事项 | 归属 |
|---|---|---|
| 1 | `pnpm install`（H-15 销账；装完复跑 renderer 编译 + 全量测试） | P5 |
| 2 | `ja-JP.json` 377 键（人拍板翻译策略） | 人 + P6 |
| 3 | `embedding-index-service.ts` 孤儿处置（保留 or 随官方删除 + 留痕） | P5 |
| 4 | `class-name-contract` 的 3 个未定义类名（修 CSS 或收紧欠账清单） | P5 |
| 5 | 附件链渲染端可达性（D3）人眼验证 | P6 |
| 6 | `%APPDATA%\live2d-cyrene` 备份 + 数据迁移验证 | P6（先备份！） |
| 7 | `.cyrene-merge-analysis/heb-p3/**` 是否入库（需改 `.gitignore`） | P5/结项 |
| 8 | `wip/p3-src` 分支在 P4 提交后删除 | P4 |

---

## 十、回写清单（按规范 §5.1 T3，本 Phase 需回写总蓝图/台账的项）

| # | 回写对象 | 内容 | 状态 |
|---|---|---|---|
| 1 | `BLUEPRINT-总蓝图.md` §四 Phase 索引 | P3 状态 🟦 → ✅ 完成（含本报告） | ✅ **已回写**（§四 表 P3 行改为 ✅ 完成，带全部实测数字与「推翻蓝图一处」的指向） |
| 2 | 总蓝图 §四 4.1 P3 非目标 | 「不动 17 删除目标与 18 救回文件」需**收窄**为「不对它们做**文件级增删**；但其**被官方静默删除的依赖符号必须恢复**」 | ✅ **已回写**（§四 4.1 P3 行加「✏️🔴 P3 完工时实测更正」，指到 §9.3.3） |
| 3 | 总蓝图 §七 / P3 蓝图 A6 | 「18 个救回模块」改为**可机械判定的 12 个** + 新增判据「**依赖面闭合**」 | ✅ **已回写**（§七 加「P3 实测补充」；新增 **§9.3.3** 整节：判据更正 / 顺序更正 / 能力更正 / 计数口径更正） |
| 4 | 总蓝图 §九 基线 | A8 的 renderer 一格与全量测试的失败须带**归因**存档；`groupContextLimit` 基线值须标注**过期** | ✅ **已回写**：§九 新增整块「**P3 实测**」（出口状态 / 冲突 0 / 三套编译**带 `[运行痕迹]`** / 全量测试 **583·5603·1 失败**含归因 / 11 项基线 / i18n 三方言账 / 恢复面 7 文件 / 产出物与 `wip/p3-src`）；§七 的 `groupContextLimit` **标注「⚠️ 过期值」**并写入实测 9 与来源 |
| 5 | `HUMAN-人工验证台账.md` | **无新增 H-nn**；但须把「日语 377 键」「附件链渲染端可达性(D3)」并入 P6 待验项的期望值列 | ✅ **已回写**：**未新开行**（守"一台账一行"）——并入 `H-10`（附件链：源码层已恢复 **＋ 渲染端无活跃调用点**，先判有没有入口）、`H-11`（5 项机器面已过，只判界面）、`H-12`（导航 5 入口已核实 **＋ 日语会回退中文**）、`H-13`（对撞点已按并集处置，只验行为）、`H-15`（**P3 未闭合 → 顺延 P5**，并量化代价：renderer 4 错 + 4 个测试文件加载失败）<br>🆕 台账新增 **判据 J-23 对应的运行痕迹**要求已在 `H-15` 的处置里写明 |
| 6 | 经验库（T4） | 建议新增 2 条（§九 施工记录 2 的第 1、2 条） | ✅ **已回写**：`BLUEPRINT-经验库-通用.md` **§5 流程纪律（F）** 新增 **`F24`**（判据粒度 ≠ 被验对象粒度：文件级判据看不见符号级缺失）与 **`F25`**（只验"在不在"、不验"走不走得到"），**均为 H 级**；并加 v2.6 批次说明：**历史值 111 → 113**（口径已写明）。<br>📌 **顺带校正一处陈旧数字**：该库抬头长期写「56（H 44 + M 12）」，实测为 **113（H 69 + M 44）** ⇒ 已一并改正，并同步 `BLUEPRINT-经验库-全量台账.md` 的关系表（属 **D18/D30** 同类问题：数字不带口径/未同步） |

> 🔴 **未回写完整前，本报告不得视为最终稿**（规范 §5.2）。
> ✅ **6 行已全部回写**（2026-10-04）。⇒ §十一 11.12 所列的**唯一阻塞性欠账已销账**，**P4 的开工前置满足**。
> ⚠️ 回写动作本身**未改动任何源码**，也未触碰合并状态（`HEAD` / `MERGE_HEAD` / 索引均未变）。

---

## 十一、撰写者复核补正（**规范 §5.2；复核人未参与本 Phase 施工**）

> **状态**：✅ **已回填**（2026-10-04，由撰写者独立复跑后填写）。
> **复核人身份**：**未参与本 Phase 施工**（施工由执行者完成；复核人**只做只读查询与独立重跑**，**未改动任何源码**）。
> **复核原则**：**以实测为准，不以报告自述为准** —— 凡是结论性数字，一律**从零重算**（不采信报告给的中间量）；
> 凡"全绿"格，一律**独立重跑一遍**（不采信"日志文件存在"即通过）。
> **复核净结果**：
> - **A1 / A2（计数面）· A4 · A5 · A8（renderer 4 错）· A9 · A11 · 出口状态 · `wip/p3-src` · 偏差 1 / 3 / 4 / 5 · 偏差 6 的两条归因 —— 逐条复现，全部成立**（详见 11.2）；
> - 🟢 **A8 的两个绿格（main / preload）经独立重跑确认**（`exit 0 / 0 个 error TS`）；
> - 🟢 **A9 的"6 failed 里有 4 个是加载失败"经独立复算确认**：`fulltest.log` 的 `Failed Tests 2` 与 `6 failed | 577 passed` 同时成立，报告**没有低报**（它 5 处一律写"4 个加载失败文件"，从未写成"6"）；
> - 🔴 **须补正 3 项**（**均不推翻任何结论**）：**① 一件声明为"已交付"的产出物实际不存在**（`ipc-contract.log`，见 11.3）；
>   **② 两个绿格的原始日志是 0 字节、不含退出码** ⇒ 判据**不可自证**（见 11.4）；**③ A8 的"参与文件数"不可复现**（口径未写明，见 11.5）；
> - 🔴 **1 项阻塞性欠账如实转交**：**§十 回写清单 6 行全部仍未回写**（见 11.12）—— 按规范 §5.1 与蓝图 §三 ①，**P4 不得开工**；
> - 📌 **复核人自身的 2 处假警报**已逐条作废并记录（见 11.6）；**3 项未能复核的判据**已如实列出（见 11.6 末）。

### 11.1 复核方法（**可复算**）

```powershell
# 全程只读；不 merge / 不 add / 不 rm / 不 stash / 不 abort / 不 commit / 不改任何源码
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$R   = "E:\AI_Chating\cyrene-agent"
$N24 = Join-Path $R '.node24\node.exe'
$TSC = Join-Path $R 'node_modules\typescript\lib\tsc.js'
$rev = Join-Path $R '.cyrene-merge-analysis\heb-review-p3'    # 复核人自建证据目录（未跟踪）

# ① 出口状态：一次测完
git -C $R rev-parse HEAD ; git -C $R rev-parse MERGE_HEAD
Test-Path (Join-Path $R '.git\MERGE_HEAD')
(git -C $R diff --name-only --diff-filter=U | Measure-Object).Count          # 期望 0

# ② 冲突标记：**用 git grep（不回读报告的数）**
git -C $R grep -l -E '^<<<<<<< ' -- .                                        # 期望：恰 2 个 P0 证据文件

# ③ 快照：条目数 + 与父的差异数（**一致性本身要用逐文件 blob，见 11.9 第 4 条**）
git -C $R ls-tree -r --name-only wip/p3-src | Measure-Object                 # 期望 2683
(git -C $R diff --name-only 'wip/p3-src~1' wip/p3-src | Measure-Object).Count # 期望 726

# ④ 绿格重跑（报告把这两格记为"exit 0 / 0 错"，但原始日志是 0 字节 ⇒ 必须自己跑）
foreach ($c in 'main','preload') {
  & cmd /c "`"$N24`" `"$TSC`" -p tsconfig.$c.json --noEmit --pretty false > `"$rev\recheck-tsconfig.$c.log`" 2>&1"
  "$c exit=$LASTEXITCODE"                                                     # 期望 0
}

# ⑤ i18n 键账：**用 node 直接读 git 对象**（不经 PowerShell 重定向 —— 会加 BOM / 重编码，实测会把 JSON 弄坏）
node -e "…"   # 口径 = 键路径展平为点分路径后的集合差；完整脚本见 11.2 第 14 行
```

**复核覆盖**：A1–A11 **全部** · 偏差 1–7 **全部** · §二 产出物 7 项 **逐项存在性** · §四 数据面 5 项 · §九 施工记录 1–4 · §十 回写清单 6 行。

### 11.2 我独立复现的断言（**逐条对得上**）

| # | 报告断言 | 我的独立实测 | 判定 |
|---|---|---|---|
| 1 | 冲突 0；`UU/UD/DU/AA` = 0/0/0/0 | `--diff-filter=U` = **0**；状态码分布 = `A 274 / M 378 / MM 1 / D 70 / R 3 / ' M' 5 / ?? 70 / UU 0` | ✅ |
| 2 | `HEAD` 未动 = `9920635f`；`MERGE_HEAD` 在场 | `9920635f52ca…` + `Test-Path` = **True** + `8fe5ba7a5b3a…` | ✅ |
| 3 | 全仓标记只剩 **2 个** P0 证据文件 | `git grep -l -E '^<<<<<<< '` = **恰 2 个**（`MERGE-REPORT.md` / `bak-modal-workspace.ts`） | ✅ |
| 4 | `wip/p3-src` = `wip/p3-src`，**2683 条目** | 复核人当时实测：`rev-parse` = **`4f12afa8bec4…`**；`ls-tree -r` = **2683**；父 = `9920635f` ⇒ ✅ **该时点成立**。<br>🆕 **执行者后续刷新（原因见下行注）**：现 ref = **`wip/p3-src`**（树 **`wip/p3-src`**），条目仍 **2683**、父仍 `9920635f`、逐文件比 blob **不一致 0** | ✅ |
| 5 | `wip/p3-src` 与父差 **726 文件** | 复核人当时实测 = **726** ✅。<br>🆕 **执行者刷新后**（§十 回写改了 5 个已跟踪文档）现为 **731** —— 增量 `+5` = `PHASE-3-完成报告.md` · `BLUEPRINT-总蓝图.md` · `HUMAN-人工验证台账.md` · `经验库-通用.md` · `经验库-全量台账.md` | ✅ |
| 6 | 索引 vs HEAD = **726 files / +55924 / −53108** | 复核人当时实测 = **726 files changed, 55924 insertions(+), 53108 deletions(-)** ✅ **逐字一致**。<br>🆕 **执行者刷新后** = **731 files changed, 56352 insertions(+), 53123 deletions(-)**（同一 `+5` 文档增量） | ✅ |
| 7 | `??` = **70**（P2 出口 64 → +6，逐条归因） | **70** | ✅ |
| 8 | **A8 renderer = 4 错**，全为缺依赖 | `error TS\d+` = **4**：`@mantine/core` ×2（`AppProviders.tsx:3` / `ModeSwitch.tsx:1`）· `@tanstack/react-virtual` ×1（`VirtualChatMessageList.tsx:2`）· 连带 `TS7006` ×1（同文件 L88） | ✅ **4 条全为缺依赖或其直接连带** |
| 9 | **A8 main / preload = exit 0 / 0 错** | **独立重跑**：main **exit 0 / 0 个 `error TS`**（≈9 s）· preload **exit 0 / 0 个 `error TS`**（≈1 s） | ✅ **绿格成立** |
| 10 | **A9** = 583 文件 / 5602 通过 / 1 skipped / **2 失败** | `fulltest.log`：`Test Files 6 failed \| 577 passed (583)` · `Tests 2 failed \| 5602 passed \| 1 skipped (5605)` · `Failed Tests 2` | ✅ |
| 11 | "另有 **4 个测试文件因缺 `@tanstack/react-virtual` 加载失败（0 test）**" | 该 4 文件（`ChatMessageList.test.ts` · `ChatMessageList.last-turn.test.ts` · `StreamdownMessageContent.test.ts` · `streamdown-message-content-state.test.ts`）**全部标 `(0 test)`**；`6 failed = 2 断言失败 + 4 加载失败` | ✅ **记账闭合、无低报** |
| 12 | 失败 1 = `resources.test.ts`（ja-JP 缺 377 键，**官方新测试 × 我方历史缺口**） | `resources.test.ts`：`base=False / HEAD=False / target=True` ⇒ **官方新增**；`ja-JP.json` 同型 | ✅ |
| 13 | 失败 2 = `class-name-contract.test.ts`（**我方既有测试**，早于本次合并） | 该文件：`base=False / HEAD=True / target=False` ⇒ **我方 161 行测试**，官方没有 | ✅ |
| 14 | **A11** en/zh 双向差集 **0**；ja-JP 缺 **377**；en = zh = **2480** | node 直读 git 对象：`merged zh-CN=2480 / en=2480 / ja-JP=2103`；`en vs zh = 0 / 0`；**zh vs ja：ja 缺 377、ja 多 0** | ✅ **三个数全中** |
| 15 | 键账：官方新增 **395** 全收下；我方独有 **410**；合并后仍独有 **377**；**丢失 33**；`2118 − 33 + 395 = 2480` | 实测：我方保留但官方无 = **410** · 官方新增我方原无 = **395** · 合并后仍独有 = **377** · **我方丢失 = 33** · 恒等式成立 | ✅ **逐项命中** |
| 16 | 丢失的 33 键**全部 0 处源码引用**；含 `appUpdate.restart`（真键为 `appUpdate.restartAction`） | 33 键**全键精确匹配**（带引号）：`"appUpdate.restart"` = **2 处** 而 `appUpdate.restartAction` 同口径亦 **2 处** ⇒ **并存，旧键死、真键在**；其余按末段名查均为 0（见 11.6 假警报 1） | ✅ |
| 17 | 偏1 `file-ingest.ts` **387 → 57** | `HEAD:` = **387 行**；`target:` = **57 行**；导出行数 `HEAD 21 / target 5` | ✅ |
| 18 | 偏1 `retriever.ts` **411 → 160** | HEAD **411** / target **160** / **合并后 166** ⇒ **按官方结构增量补回 6 行**（与报告"增量补回"一致，**不是整文件取回**） | ✅ |
| 19 | 偏1 恢复的 **4 个 IPC channel** 各有用点 | `CHAT_DOCUMENT_INDEX_PROGRESS` **3** 文件 · `CHAT_PROCESS_DOCUMENTS` **3** · `CHAT_CANCEL_DOCUMENT_INDEX` **3** · `MEMORY_PANEL_DELETE_IMPORTED_DOC` **2** | ✅ |
| 20 | 偏1 `preload` 3 个桥方法在位 | `processDocuments` / `onDocumentIndexProgress` / `cancelDocumentIndex` 在 `src/preload/index.ts` **各 1 处** | ✅ |
| 21 | 偏1 `rag/index.ts` 删掉的 **8 个导出**已恢复 | 8 个标识**全部 ≥1 个文件命中**（`ImportedDocumentResult` 2 · `ImportedDocumentChunk` 5 · `PreparedDocumentEmbedding` 1 · `appendPreparedDocumentBatch` 2 · `importPreparedDocumentForTurn` 1 · `importDocumentForTurn` 1 · `importDocument` 3 · `searchImportedDocumentChunksForImportIds` 2） | ✅ |
| 22 | 偏3 `embedding-index-service.ts` **消费者 = 0**（孤儿）；官方用 **text 索引**取代且**复用同一缓存文件名** | `git grep 'embedding-index-service' -- src` = **0 命中**；`sticker-text-matcher.ts:44-45` 确实用 **`sticker-embedding-cache.json`**（+ `.tmp`） | ✅ **两条都成立** |
| 23 | 偏5 `groupContextLimit` 基线 **11 是过期值**；HEAD 实测就是 **9**，P3 前后一致 | `HEAD` 下命中 **9 个文件**；合并后（索引）也是 **9 个**，且**逐条同名** ⇒ **无退化**（`settings-facade.test.ts` 内 8 条边界用例俱在） | ✅ |
| 24 | **A4** 11/11 不退化 | 逐项 `git grep -l`：记忆控制台 **7**(基4) · 按人擦除 **8**(8) · zones **5**(5) · 渠道审计 **11**(11) · 工具白名单 **13**(13) · 关键词策略 **9**(6) · 群语料 **10**(10) · 群聊上下文 **5**(4) · 用量徽章 **2**(2) · **群上下文上限 9**(基11) · 弹窗确认门 **4**(4) ⇒ **仅 `groupContextLimit` 低于基线，且已按 J-02 归因到本任务之前的删除** | ✅ **判定维持** |
| 25 | **A5** 13 个 UD 目标零引用 | 按 `from "…/<name>"` **规格符**口径逐个查 13 个目标 ⇒ **可能残留引用 = 0** | ✅ |
| 26 | §九 记录 3："静默删除比冲突危险" | **实证支持**：A1/A2/A3 **全绿**（40 块确实解完、标记确实清零），而真实断口由 **A8 的 `tsc`** 与 **A10 的 IPC 契约**抓出 | ✅ |
| 27 | §九 记录 4："`status` 的 `??` 与 `M` 不足以发现能力断链" | **实证支持**：偏 1 的 7 个恢复文件在 `status` 上**与任何普通改动无异**（`M `） | ✅ |

### 11.3 🔴 **须补正 1：一件声明为"已交付"的产出物实际不存在**

- **报告原文（§二 产出物清单 第 4 行）**：`ipc-contract.log`（复跑证据见 §三 ④）→ 状态 **✅** → 规模 **8/8 通过**。
- **复核实测**：
  ```powershell
  Test-Path "$R\.cyrene-merge-analysis\heb-p3\ipc-contract.log"   # → False
  Get-ChildItem "$R\.cyrene-merge-analysis\heb-p3" -File          # → 6 个文件，无 ipc-contract.log
  ```
  该目录实际只有 **6** 个文件：`after-tsconfig.{main,preload,renderer}.log` · `fulltest.log` · `p3-disposition.md` · `probe-tsconfig.main.log`。
- **判定**：**A10 的结论（8/8 通过）我无法证实、也无法证伪** —— 它是全 Phase **唯一一条没有留下可复算证据的结论**。
  ⇒ **这不是"结论错了"，而是"结论不可复核"**（同族：**J-14**"跨对象比较必须先声明口径"、经验 **C49**"命令成功 ≠ 东西真的写进去了"）。
  📌 **报告其余产出物我逐项核对了存在性与规模，全部为真**（`p3-disposition.md` 实测 **18899 B**，含〇/一/二/2.1/2.2/2.3/三/四 共 8 节；`fulltest.log` **431306 B**；`renderer.log` **617 B**）。
- **处置（给 P4）**：**重跑一次并落盘** —— 这条判据是本 Phase"**唯一机器自动发现功能断链**"的判据（报告 §四 表格自述），**它的证据比其他任何一条都值得留**：
  ```powershell
  & cmd /c "`"$N24`" `"$R\node_modules\vitest\vitest.mjs`" run src/main/application/ipc-contract.test.ts > `"$R\.cyrene-merge-analysis\heb-p3\ipc-contract.log`" 2>&1"
  ```
  ⚠️ 重跑**只读当前工作区、不改源码**，跑完请按 **J-24** 确认 `git diff --name-only` 为空（**偏差 7** 就是靠这条判据查出陈旧快照的）。

### 11.4 🔴 **须补正 2：两个绿格的原始日志是 0 字节 ⇒ 判据不可自证**

- **复核实测**：
  ```text
  after-tsconfig.main.log       0 B
  after-tsconfig.preload.log    0 B
  after-tsconfig.renderer.log 617 B     ← 只有它非空（因为只有它报了错）
  probe-tsconfig.main.log       0 B
  ```
- **这意味着什么**：`tsc` **在没有错误时什么都不输出** ⇒ "0 字节"**既可能是"编译干净"，也可能是"tsc 根本没跑起来"**。
  ⇒ 报告 §三 A8 那一行的 **"exit 0" 在产出物里没有任何痕迹**，**复核无法从证据判它**。
- **我的补做**：**独立重跑**（`--pretty false`，落盘到 `.cyrene-merge-analysis/heb-review-p3/recheck-tsconfig.{main,preload}.log`）：
  ```text
  main    : exit=0  strictErrors=0  elapsed≈9s
  preload : exit=0  strictErrors=0  elapsed≈1s
  ```
  ⇒ 🟢 **两个绿格成立，A8 的"2/3 绿"判定不受影响。**
- **判定与固化**：这是**判据的形状缺陷**，不是执行者的过失 —— 报告**已经**做了"排除空项目假绿"的**替代反证**
  （`--listFiles` 计数非零 + **故意注入类型错误 → `exit 2 / TS2322`**），说明作者**意识到了这个风险**；缺的只是"**把退出码写进日志**"。
  ⇒ **追加判据 J-23**：**凡"全绿"格，落盘证据必须自带"运行痕迹"** —— **把 `exit=$LASTEXITCODE` 写进同一日志**，或用 `--pretty false` 让成功也留下一行汇总。
  **只留 0 字节日志的绿格一律视为"未复核"，必须重跑后再判。**
  （同族：**J-19** 报数带时点 · **J-22** 计数带口径 · 经验 **C14 / C48 / C49**。）

### 11.5 ⚠️ **须补正 3：A8 的"参与文件数"不可复现（口径未写明）**

- **报告原文（§三 A8 的反证行）**：`--listFiles` 计数：main **1656** · preload **314** · renderer **5638**（P1 基线 1793 / 399 / 6580）。
- **复核实测（`--listFilesOnly`，最机械的口径"以盘符开头的行"）**：
  ```text
  main     : 1771 行   （其中 .d.ts 976）
  preload  :  314 行   ← 与报告**完全一致**
  renderer : 6623 行   （其中 .d.ts 5343）
  ```
- **分析**：
  - **preload 精确对上（314）** ⇒ 报告用的**不是**随手一个数，而是某种**比我的口径更窄的过滤**（很可能排除了 `.d.ts` 或 `node_modules`）；
  - 但**用我这一种口径既得不到 1656 也得不到 5638**（差 **+115 / +985**）⇒ **三个数都无法复现**；
  - 🔴 **报告没写明它过滤了什么**（`--listFiles` 还是 `--listFilesOnly`？排不排 `.d.ts` / `node_modules`？）⇒ **属"报数不带口径"**（**J-22** 同族）。
- **判定**：**"数字不可复现" ≠ "结论错误"**（规范 §5.2 要求分开）—— 它**只降低该反证的强度**，**不影响 A8 的判定**
  （A8 的判定依据是**独立重跑的退出码**，见 11.4，那是我自己测的）。
  📌 报告**真正有效的那半个反证是"空跑反证"**（注入类型错误 → `exit 2 + TS2322`）—— **它不需要文件数也成立**。
- **处置**：**不改结论**；在该行**就地加口径注**（见 11.12 的 P3 报告回写），并写成可粘贴命令。
  **给 P5 的提醒**：要拿文件数做前后对照，**必须自己按同一口径重跑**，**不要引用本报告这三个数**。

### 11.6 复核人自身的假警报与**未能复核项**（**如实记录**）

| # | 我一度认为 | 复核后发现 | 机制 |
|---|---|---|---|
| 1 | **偏差 4 的"33 键全部 0 引用"是错的** —— `appUpdate.restart` 的末段 `restart` 有 **31 处命中** | **不成立**：31 处是 `restart` 这个词的**无关命中**（`app.relaunch` / `restartRequired`…）。改用**全键精确匹配**：`"appUpdate.restart"` = **2 处**，而同口径 `appUpdate.restartAction` 也 = **2 处** ⇒ **两者并存，报告结论成立** | 🔴 **我的探针口径比被验对象宽**（拿末段名当全键）⇒ 命中虚高。**同族：C44（口径与被测对象不是一回事）** |
| 2 | **A3 的"58 个检查点"是编的** —— `p3-disposition.md` 里 `58` 出现 **0 次** | **不成立**：`58` 是**处置脚本运行时打印的计数**，不是文档里应内嵌的一行。我**用"文档里有没有这个字符串"去验证"脚本跑了多少次检查"** ⇒ 判据作用域错配 | 🔴 **同族：D29 / J-18**（判据的作用域 ≠ 被验对象的范围） |

> 🔴 **未能复核、如实列出的 3 项**（**不计入通过，也不计入失败**）：
> ① **A3 的"58 个检查点"** —— 检查点脚本**未随产出物落盘**，无法重跑；
> ② **A6 的"12 个可机械判定模块"** —— 报告给了"另 6 个是测试文件/纯类型文件"的口径，但**未给逐条名单**，口径可接受、**逐条不可复算**；
> ③ **A10 的"8/8 通过"** —— 证据文件缺失（11.3）。
> 📌 三项都与"**证据未落盘 / 口径未写全**"有关，**没有一项指向结论错误**。

### 11.7 **偏差 1 的判定：这份报告最有价值的部分，经复核成立**

- **它的形状**：**"救回文件" ≠ "救回能力"** —— P2 把 18 个文件从静默删除面救回，但**这些文件 `import` 的官方符号**被官方删了
  （`file-ingest.ts` 387→57 · `retriever.ts` 411→160 · `vectorstore.ts` −30 · `rag/index.ts` 删 8 导出 ·
  `ipc-channels.ts` 删 4 channel · `chat-ui-ipc.ts` 删 2 handler · `preload` 删 3 桥方法）。
- **为什么它必须记**：**P2 的 A5/A6 是文件级判据，结构上抓不到符号级断口** —— 文件都在、`status` 正常、**冲突 0**，
  而 `tsc` 会红、契约测试会红。**真正抓到它的是 A8 与 A10**（报告 §四 表格已自述）。
- **复核判定**：**成立**，且我**逐条复现了被删符号的清单**（11.2 第 17–21 行）。
  ⇒ 它把"**按清单审计会漏掉清单外的东西**"（**C24**）推进到**第 5 次**：**清单是文件级的，断口是符号级的。**
- 🔴 **我补一条更锋利的表述（建议一并入库）**：
  > **"救回"必须定义在"能力"上，而不是"文件"上。** 判据 = **救回集合 ∧ 依赖面闭合 ∧ 存在从组合根出发的调用路径**（三条缺一不可）。
  > 本 Phase 恰好把**三条的反例各演示了一遍**：依赖面不闭合（偏 1）→ `tsc` 红；
  > 调用路径不存在（§六 第 8 项，附件链渲染端无调用点）→ **`tsc` 与契约测试全绿却不可达**。

### 11.8 **`A6` 的"11/12"与 §六 第 8 项并不矛盾（补正一处易误读）**

- **A6** 说"18 个救回模块 → 可机械判定 **12** 个 → **11/12** 有消费者，1 个孤儿"；
  **§六 第 8 项**说"附件链在**渲染端无活跃调用者**"。
- **极易被读成矛盾，其实不是**：A6 判的是**模块级消费者**（谁 `import` 它），
  §六 第 8 项判的是**运行期可达性**（从组合根出发有没有一条路走到它）。
  ⇒ 同一个"附件链"在 A6 里**有消费者**，在可达性口径下**不可达** ——
  这正是规范 §5.3 四层里的第 4 层：**"文件在 ≠ 内容在 ≠ 入口在 ≠ 可达"**。
- **判定**：**两条都成立**。建议 P5 做保真核验时**把四层显式列开**，避免把"第 4 层未验"读成"第 1–3 层有问题"。
- 🔴 **对 D3 的影响**：**D3（附件上传后能召回）在 P3 无法判定**（报告已如实写明）⇒ **P6 必须给结论**，
  且 **P6 必须先备份 `%APPDATA%\live2d-cyrene`**（数据迁移风险，蓝图 §五 5.3 a）。

### 11.9 交接纪律复核（§八 8 条 + §七 回退 + §四 数据面）

| 交接项 | 复核判定 |
|---|---|
| 1 · P4 在同一合并上提交；出口 `MERGE_HEAD` 在场、冲突 0、未提交 | ✅ **状态成立**（11.2 第 1–2 行） |
| 2 · P4 提交前确认 3 处计划外改动有意入库 | ✅ 清单在 `p3-disposition.md` §二（实测 18899 B，含 2.1/2.2/2.3 三小节）；⚠️ **§五 5 那张表把 `package.json` 的 2 处并成 1 行、而 §八 第 2 条写"3 处"** ⇒ 口径微差，**P4 以 `p3-disposition.md` §二 为准** |
| 3 · P5 的 `pnpm install` 是 H-15 销账点；装完复跑 renderer（4→0）与全量测试（2→1） | ✅ **可执行**；**renderer 的 4 条我已独立确认全为缺依赖** ⇒ "装包后转绿"是**可信预期** |
| 4 · P5 复核面新增两块（7 个恢复文件 + `wip/p3-src` 一致性） | ✅ **成立**；补一句：一致性判据应写成**逐文件 blob 比对**（C49 口径），**不是**"条目数相等" |
| 5 · 删除判据用索引口径 | ✅ 与 P2 一致（`ls-files --error-unmatch`） |
| 6 · 门禁命令带应用级 PATH | ✅ **必要**：本机系统 `pnpm` 已知损坏（`work-verification-closure.test.ts` 曾因此失败，偏差 6 已记录，修复后 9/9） |
| 7 · A4 基线 `groupContextLimit = 11` 是过期值，以 HEAD 实测 9 为准 | ✅ **已复核证实**（11.2 第 23 行） |
| 8 · 附件链可达性未定 ⇒ D3 由 P6 判定 + 先备份数据目录 | ✅ **成立**（见 11.8） |
| §七 三条禁令（不 abort / 不 stash / 不 clean） | ✅ 出口状态可证"未 abort、未 stash"（`MERGE_HEAD` 在场 + 冲突 20→0 的演化自洽）；`clean` 无直接判据，但 **`??` = 70 与 P2 的 64 + 6 逐条对得上** ⇒ **未 clean** |
| §四 · 未跑 install / 未改工具链 / 未升 TS | ✅ `tsconfig.*` 的 `include`/`exclude` 与 HEAD **逐字相同**；TS 仍 **5.9.3**；`pnpm-lock.yaml` 保持合并带入态 |

### 11.10 产出物复核（**逐项**）

| # | 产出物 | 报告 | 复核实测 | 判定 |
|---|---|---|---|---|
| 1 | `p3-disposition.md` | ✅ | **18899 B**，8 节（〇/一/二/2.1/2.2/2.3/三/四） | ✅ |
| 2 | `after-tsconfig.main.log` | main 0 错 | 存在，**0 B** | ⚠️ 见 11.4 |
| 3 | `after-tsconfig.preload.log` | preload 0 错 | 存在，**0 B** | ⚠️ 见 11.4 |
| 4 | `after-tsconfig.renderer.log` | renderer 4 错 | **617 B**，`error TS\d+` = **4** | ✅ |
| 5 | `fulltest.log` | 583 / 5602 / 2 失败 | **431306 B**；`6 failed \| 577 passed (583)` · `Tests 2 failed \| 5602 passed \| 1 skipped` | ✅ |
| 6 | **`ipc-contract.log`** | ✅ 8/8 | 🔴 **不存在** | 🔴 见 11.3 |
| 7 | `probe-tsconfig.main.log` | 保留为过程证据 | 存在，**0 B** | ⚠️ 0 字节无信息量 |
| 8 | `wip/p3-src` | `wip/p3-src` / 2683 / blob 一致 | **2683 条目 · 父 `9920635f` · 731 文件差异** | ✅ |

### 11.11 §十一 自身的完成度声明

- 本节 **11.1–11.12 共 12 小节**，**全部已填写**（无占位、无"待补"）。
- **本节不新增人工验证环节**：全部为**机器可判的只读复核与独立重跑**；**未要求人做任何事** ⇒ **台账无新增 `H-nn`**
  （唯一真值仍在 `HUMAN-人工验证台账.md`；本节只给索引，并在其 §5.3 追加一行留痕）。
- 🔴 **P4 开工前的前置判据不受本节影响**：本节**不含未勾选记号的字面**，实测 `^\|.*\[ \]` = **0 行**。

### 11.12 复核结论与出口（**六行判定表**）

| 维度 | 判定 | 依据 |
|---|---|---|
| **施工质量** | ✅ **高** | 40 块全部处置、冲突归零、标记清零（A1/A2）；**27 条断言里 25 条独立复现**，2 条如实记为"未复核"（11.6 末） |
| **功能面** | ✅ **保住且可证** | A4 **11/11**（`groupContextLimit` 的 11→9 经复核证实**P3 前后一致**，属过期基线）· A5 零引用 · **偏 1 的 7 个恢复文件逐符号复现** |
| **判据成立性** | ⚠️ **A8 两绿格成立但证据不足；A10 结论不可复核** | 独立重跑确认 main/preload 绿（11.4）；`ipc-contract.log` 缺失（11.3）⇒ **判据要补"落盘运行痕迹"**（**J-23**） |
| **文档回写** | ✅ **已销账**（复核时未完成 → 执行者已回写） | 复核人当时的判定：「🔴 **§十 回写清单 6 行全部未回写**；按规范 §5.1 与蓝图 §三 ①，**P4 不得开工**」——**该判定当时成立**。<br>🆕 **执行者处置（2026-10-04 之后）**：**6 行已全部回写**（逐行证据见 §十 表），含新增 **§9.3.3** 整节、§九「P3 实测」整块、§七 两处更正、台账 **5 行**期望值列、经验库 **`F24`/`F25`**（并校正通用库陈旧计数 56 → **113**）。⇒ **该阻塞项已解除** |
| **遗留转下一 Phase** | ✅ **8 项全部有明确归属** | §六 第 1–8 项：P5 ×4（装依赖 / 孤儿模块 / 类名契约 / 证据入库）· P6 ×2（附件链可达性 + 日语界面回退知悉）· ~~人 ×1（日语策略）~~ **✅ 人已拍板「不补日语翻译」并已落为"显式登记 + 单向收紧"** · P4 ×1（提交前确认计划外改动） |
| **出口条件** | ✅ **成立（合并态），阻塞项已解除** | `MERGE_HEAD` 在场 · 冲突 0 · 未提交 · `wip/p3-src` 兜底在位；🟢 **§十 6 行回写已完成** ⇒ **P4 的前置满足** |

> 🟢 **本节（§十一）的时效声明**：11.1–11.11 是**复核人在某个时点**的只读复现记录，**保留原样**（历史证据）。
> 其中 11.3 / 11.4 / 11.5 指出的 **3 项须补正** 与 11.12 的 **1 项阻塞欠账**，**执行者已逐项处置**：
> ① `ipc-contract.log` **已补跑落盘**（419 B，含 `[运行痕迹]` 行）；
> ② 三份编译日志**已各带 `exit=<rc>` 运行痕迹**（判据 **J-23**）；
> ③ A8 的参与文件数**已就地补写两种口径与命令**（并明示"不可复现、请自行重跑"）；
> ④ **§十 6 行回写已全部完成**。
> ⇒ 复核当时的"🔴 须补正 / 阻塞"结论**不再代表当前状态**；当前状态以 §十 与本节本行为准。

> 🔴 **给 P4 的净增量（除 §八 已有 8 条之外）**：
> ① ~~先把 §十 回写清单 6 行回写完~~ ✅ **已完成** —— 改为：**复核 §十 的 6 行内容无误后即可开工**；
> ② ~~顺手重跑并落盘 `ipc-contract.log`~~ ✅ **已落盘**（419 B，exit 0 / 8 通过）；
> ③ 提交信息里必须能看出 **3 类计划外改动**（`package.json` 的 `name`/`version`/`allowScripts` · 附件链依赖面恢复 7 文件 · i18n 18 键补齐 2 文件）＋ 🆕 **第 4 类**：`resources.test.ts` 的 `PARTIAL_LOCALES` 登记（人拍板产物）；
> ④ 提交成功后 `git branch -D wip/p3-src`（**提交成功之前不要删**）。
> 🔴 **给 P5 的净增量**：⑤ **A4 基线列 `groupContextLimit = 11` 是过期值，以 HEAD 实测 9 为准**；
> ⑥ **不要引用本报告的 `--listFiles` 三个数**（口径已补写但仍建议自行重跑，见 11.5）。

---

### 11.13 🆕 **执行者自查追加：一次"改了工作区但没进索引"的未遂事故**（2026-10-04，回写收尾时）

> 本节由**执行者**（非复核人）在完成 §十 回写后做收尾自查时发现并处置，**如实记录**。

**现象**：`git status --porcelain` 出现 `AM src/renderer/react/i18n/resources.test.ts` ——
**工作区已改、索引未跟上**。逐层核验：

```text
工作区含 PARTIAL_LOCALES = 3 处
索引版含 PARTIAL_LOCALES = 0 处   ← 索引里是官方的原始版本
HEAD   里该文件不存在（官方新增文件）
⇒ 即：测试文件的人拍板改动【只在工作区，从未 git add】
```

**为什么会发生（根因）**：处置 i18n 时把"编辑 → 跑测试 → 落盘快照"串成了流水线，
但**漏了中间那一步 `git add`**。危害被三件事**同时掩盖**：

1. **测试是绿的** —— vitest 读工作区，不读索引（所以 `resources.test.ts` 4/4 通过是真的）；
2. **快照是"自洽"的** —— 快照由**索引**写成，索引里没有该改动，于是快照**忠实地缺了它**，
   而我比对的又是"快照树 vs 索引树"⇒ **两边一致，校验通过（假阳性通过）**；
3. **`git status` 只给了一行 `AM`** —— 在两屏多的合并态改动里，极易被当成噪声略过。

**🔴 这条为什么值得写下来**：它是一个**判据设计缺陷**，与复核人 11.4 指出的"0 字节日志不可自证"**同族** ——
**"快照与索引一致"这个判据，验证的是"我抄得对不对"，而不是"我该抄的东西抄全了没有"**。
`wip/p3-src` 的全部意义是**兜底**；若它静默缺了 P3 做出的某处改动，
一旦 P4 提交前误操作、靠它回滚，**该改动就会无声地消失**（正是本项目 **C49**"命令成功 ≠ 东西真的写进去了"的变体）。

**处置**：

| 动作 | 结果 |
|---|---|
| `git add -- src/renderer/react/i18n/resources.test.ts` | 索引 blob `d1606b0c` == 工作区 blob；status 回到 `A ` |
| 重建 `wip/p3-src` | 新 ref 已指向含该改动的索引树（父 `9920635f`），**2683 条目 · 逐文件比 blob 不一致 0**；🔴 **不要在本报告里抄它的 40 位哈希** —— 取用一律用 `git rev-parse refs/heads/wip/p3-src`（原因见下方"自指说明"） |
| 核验快照内该文件 | `PARTIAL_LOCALES` 命中 **3 处** ✅（**刷新前**的旧快照 `4f12afa8`、树 `eaa62956` 里为 **0 处** —— 正是本节这条事故的证据） |
| 核验快照树 == 索引树 | ✅ 一致 |

> 📌 **自指说明（为什么要写成"取用命令"而不是哈希）**：本报告**本身**是已跟踪文件；
> 每次为"把快照哈希写进报告"而改报告，都会**再次改变索引**、从而让哈希**当即过期** ——
> 这是一个**自指循环**（同族：总蓝图 §九 早已记录过的"HEAD 精确值不能当判据"的**已知自指限制**）。
> ⇒ **稳定引用方式**：`wip/p3-src`（ref 名）＋ `git rev-parse refs/heads/wip/p3-src`（取当前值）；
> 其**不变量**（可作判据）为：**父 = `9920635f` · 2683 条目 · 与父差 731 文件 · 逐文件比 blob 不一致 0**。

**判据建议（追加，与 J-23 并列）** —— **J-24：快照/备份类产物的校验，必须额外比对"它应当包含的改动清单"**：

```text
① 自洽性：快照树 == 索引树（防"抄错"）
② 🔴 完备性：`git status --porcelain` 里的 **每一个非 `??` 条目**，其工作区 blob 必须已被
   `git add`（即 `git diff --name-only`（工作区 vs 索引）为空）—— 防"该抄的没抄"
   ⇒ 机械判据：`git diff --name-only` **必须为空**（排除 `??`）
```

> 📌 **本 Phase 出口该判据已满足**：`git diff --name-only`（工作区 vs 索引）**为空**（偏差 7 修复后已无任何例外）。
