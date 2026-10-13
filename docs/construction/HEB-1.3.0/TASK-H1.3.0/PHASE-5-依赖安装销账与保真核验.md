# Phase 5 施工蓝图：依赖安装销账与合并保真核验

> **执行者**：agent（**核验部分建议由未参与前序施工的视角复核**，见 §五 5.1）
> **风险等级**：**中—高**（**本 Phase 是本任务唯一动 `node_modules` 的阶段**；安装不可逆、耗时、且会改变工具链；核验部分为只读）
> **预计耗时**：**60–120 分钟**（安装 10–30 分钟 + 四层核验 40–80 分钟）
> **文档规范**：见 `../methodology/BLUEPRINT-撰写规范.md` §4（**跨目录相对路径，不写裸文件名**）
> **前置**：P4 已收口（merge commit `9cceeeac` 落库、工作树干净、冲突 0）

> ⚠️ **本蓝图的主线是"两个变更源严格分栏"**：
> **上半段（§四 4.1–4.4）动依赖树** —— 目的是销 **H-15**（P1 遗留：本仓库从来没有锁文件，`pnpm install` 结构上不可验证）；
> **下半段（§四 4.5–4.8）做保真核验** —— 只读，目的是回答"**这次合并到底有没有丢东西**"。
> 🔴 **两者必须分栏、分证据、分判定**：安装后**先复跑基线**（拿到"装完之后的状态"），**再开始核验**。
> 否则核验里任何一个红都无法归因（经验 **C37 / J-17**：顺序决定可归因性）。

---

## 一、施工目标

### 1.1 核心问题（带 `file:line` 根因）

**问题 A · 依赖树从未被验证过（H-15，P1 遗留至今）**

| 事实 | 实测 |
|---|---|
| 本仓库**从来没有** `pnpm-lock.yaml` | P1 实测：`pnpm install --frozen-lockfile` 报 `ERR_PNPM_NO_LOCKFILE`（exit 1）—— **结构性失败，不是网络/权限问题** |
| 官方 `pnpm-lock.yaml` | **已随本次合并进来**（`601159 B`，`lockfileVersion: '9.0'`，2026-10-04）⇒ **条件终于具备** |
| `pnpm-workspace.yaml` | 已在位（`onlyBuiltDependencies: electron / esbuild / protobufjs / sharp / tree-sitter`） |
| `packageManager` | `pnpm@10.33.0`；`engines`: `node >=24 <25`、`pnpm >=10.33.0` |
| **当前 `node_modules`** | **132037 文件 / 2.4 GB**，与 P1 备份 `MATCH ✅` —— 但**它是 P1 时点的、用 npm 装的** |
| **缺包** | `@mantine/core` · `@mantine/hooks` · `@tanstack/react-virtual` **均不存在**（官方新增依赖，合并带进来的） |

⇒ **直接后果**（P3/P4 已量化、P5 必须销账）：

```text
src/renderer/react/app/providers/AppProviders.tsx(3,33):        error TS2307: Cannot find module '@mantine/core'
src/renderer/react/components/ui/ModeSwitch.tsx(1,34):          error TS2307: Cannot find module '@mantine/core'
src/renderer/react/features/chat/components/VirtualChatMessageList.tsx(2,32):   error TS2307: Cannot find module '@tanstack/react-virtual'
src/renderer/react/features/chat/components/VirtualChatMessageList.tsx(88,27):  error TS7006: Parameter 'virtualRow' implicitly has an 'any' type
```

并有 **4 个测试文件**因缺 `@tanstack/react-virtual` 而**整个文件加载失败（`0 test`）**：
`ChatMessageList.test.ts` · `ChatMessageList.last-turn.test.ts` · `StreamdownMessageContent.test.ts` · `streamdown-message-content-state.test.ts`。

**问题 B · 合并保真没有做过分层核验**

P4 只证明了"**提交正确**"（两父 / 树 ≡ 索引 / 工作树干净）与"**11 项功能标识未退化**"。
**没有**回答三个更难的问题：

| 未回答的问题 | 为什么 11 项基线答不了 |
|---|---|
| **文件层**：P2 判"该删的 17 个删了、该留的 18 个留了"，但**那 91 个静默删除面**（16 UD + 75 静默）**逐条**验过了吗？ | 基线只数 11 个标识的命中文件数，**与删除面无关** |
| **符号层**：P3 发现"救回文件 ≠ 救回能力"（官方删了它们依赖的符号）。**还有没有第二处同类断口**？ | 编译绿**只覆盖被 `tsc` 见到的符号**；字符串 / 动态 `import` / 反射里的契约看不见 |
| **入口层 / 桥接层**：P3 发现附件链"**源码契约完整但渲染端无调用点**"（A56：能力在、入口没了）。**其余 10 项能力有没有同类问题**？ | 基线**只证明文件在**，不证明**可达** |

### 1.2 目标清单（可勾选）

| # | 目标 | 判据出处 |
|---|---|---|
| **T1** | 🔴 **销 H-15**：用 `packageManager` 声明的 pnpm 对 `pnpm-lock.yaml` 做**可验证的依赖安装**（`--frozen-lockfile`），并**记录锁文件未被改写** | §六 A1–A3 |
| **T2** | 🔴 **安装可回退**：动 `node_modules` **之前**建立**已验证可用**的回退路径（零拷贝策略优先） | §四 4.1 + §八 R-1/R-2 |
| **T3** | **安装后复跑三个基线数**：`tsconfig.renderer` **4 错 → 0 错** · 全量测试 **1 失败 → 期待 1 失败（只剩 `class-name-contract`）** · 4 个加载失败文件 **→ 全通过** | §六 A4–A6 |
| **T4** | 🔴 **文件层核验**：**91 条静默删除面 + 3 个 rename 旧路径**逐条判定（留下该留的 / 消失该消失的），**分母 91+3 = 94**（判据 **J-22**） | §六 A7 |
| **T5** | 🔴 **符号层核验**：18 个救回文件的 **`import` 目标符号**在树上存在；**且新增一道 P3 没做的检查**：全仓 `import` 的**目标符号级**断口扫描 | §六 A8–A9 |
| **T6** | 🔴 **入口层核验**：11 项能力**逐项**给出"**从组合根出发的调用路径是否存在**"（P3 只对附件链做了这一件事） | §六 A10 |
| **T7** | **桥接层核验**：IPC 三处（`shared/ipc-channels.ts` 声明 · `main` 注册 · `preload` 桥）**逐键对齐** | §六 A11 |
| **T8** | **残余不确定性显式声明**：机械证明不了的部分写清"**本次核验最大的残余不确定性**"+**代理覆盖** | §七 + §十一 |
| **T9** | **待拍板项落地**：§五 5.4 的**渠道 4 文件**（`conversation-binding-api{,.test}.ts` · `useChannelMirrorEvents{,.test}.ts`）给出结论或明确挂起 | §五 5.1 + §六 A12 |
| **T10** | **产出可复跑的核验报告与脚本** | §七 |

### 1.3 非目标（**明确不做**）

| 不做 | 为什么 | 何时做 |
|---|---|---|
| 🔴 **不升级 TypeScript** | 官方 lockfile 里**同时有 `typescript@5.4.5` 与 `typescript@6.0.3`**；`--frozen-lockfile` 会按 lockfile 落**官方钉的版本**。**若它把 TS 升到 6.0.3，那是一个独立的变更源** ⇒ 必须**单独记录、单独复跑编译**，不能与"装缺的 3 个包"混为一谈（判据 **J-17**） | 本 Phase **只记录**，不主动升；若 lockfile 导致升级 ⇒ 单独一节写清 |
| **不改任何源码** | 核验发现问题**登记**（BACKLOG / 缺陷报告），不顺手改（规范 §1 原则 2） | 独立一笔 |
| **不跑 `git clean` / 不清理 68 条未跟踪** | 含 B-01 三目录与 6 个证据目录 | 结项 |
| **不推送远端** | 不可逆的外向动作 | 人决定 |
| **不做运行期人工验证** | 那是 **P6**（需要人眼 + 真实渠道） | **P6** |
| 🔴 **不运行应用** | 合并后**首次启动会迁移 `%APPDATA%\live2d-cyrene`** ⇒ 属 **P6**，且**必须先外部备份** | **P6** |
| **不删 `wip/*` refs / 不删保护分支** | 它们是核验的**参照物**（§四 4.6） | 结项 |
| **不修 `class-name-contract` 的 3 个未定义类名** | 属**早于本次合并的既有欠账**（P3 已归因）；修它是产品/CSS 决策 | P6 / BACKLOG |
| **不处置 `embedding-index-service.ts` 孤儿** | 需与官方设计对齐 + 留审计痕迹（**M6**）；属"**保留 or 随官方删除**"的取舍 | §五 5.2 登记，人拍板 |

---

## 二、实测证据（决定本 Phase 做法，**执行前请读**）★

> 全部数据测于 **2026-10-12/13**，时点 = P4 收口后（`HEAD = 8ad59939`）。

### E1 · 起点状态

```bash
cd /e/AI_Chating/cyrene-agent
git log --oneline -1                      # 8ad59939 docs(P4): 校正完成报告的提交哈希口径…
git rev-parse HEAD                        # 8ad59939b4be27da609000be098ed0ebb2c0aa2e
git diff --name-only --diff-filter=U | wc -l   # 0
git status --porcelain | grep -vc '^??'        # 0（无未提交改动）
git status --porcelain | grep -c '^??'         # 68
```

| 量 | 实测 |
|---|---|
| 合并状态 | **已结束**（`MERGE_HEAD` / `MERGE_MSG` / `MERGE_MODE` 三者不在） |
| merge commit | **`9cceeeac43c1ee87980e653fb62a69b831d669fa`**（两父 `9920635f` + `8fe5ba7a`）—— 🔴 **核验的固定点用它，不要用 `HEAD`**（判据 **J-25**） |
| 分叉点 | `b11b8851` |
| 参照物 | `wip/p3-src` = `6a1fb6fe`（P3 出口的索引镜像）· `p4-pre-commit` = `9920635f` |
| 工作树 | 干净（仅 68 条 `??`） |

### E2 · 依赖与工具链现状

| 量 | 实测 | 说明 |
|---|---|---|
| `pnpm-lock.yaml` | **601159 B**，`lockfileVersion: '9.0'` | 官方带进来的；**H-15 的前置条件** |
| `pnpm-workspace.yaml` | 124 B；`onlyBuiltDependencies`: electron / esbuild / protobufjs / sharp / tree-sitter | 官方带进来的 |
| `package.json` | `name: cyrene-agent` · `version: 1.3.0` · `packageManager: pnpm@10.33.0` · `engines: node >=24 <25, pnpm >=10.33.0` | P4 确认过的三处决策 |
| `node_modules` | **132037 文件 / 2.4 GB** | ✅ 与 P1 备份 `MATCH ✅` |
| 已装版本 | `typescript 5.9.3` · `vitest 5.0.1` · `vite 8.3.0` · `electron 44.4.3` · `esbuild 0.28.2` | **除 TS 外与官方 lockfile 一致** |
| 缺包 | `@mantine/core` · `@mantine/hooks` · `@tanstack/react-virtual` | 官方新增，merge 带进来 |
| 官方 lockfile 关键钉版 | `electron@44.4.3` · `esbuild@0.28.2` · `sharp@0.32.6` · `tree-sitter@0.22.4` · `vite@8.3.0` · `vitest@5.0.1` · **`typescript@5.4.5` 与 `6.0.3` 并存** | 🔴 **TS 双版本是本 Phase 最需要注意的点** |

### E3 · 待销账的三个数字（P3/P4 实测，**基数**）

| 判据 | 现状（安装前） | **安装后必须变成** |
|---|---|---|
| `tsconfig.renderer.json` | **exit 2 / 4 个 `error TS`**（全为缺包） | **exit 0 / 0 个 `error TS`** |
| 全量测试 | `Test Files 5 failed \| 578 passed (583)` · `Tests 1 failed \| 5603 passed \| 1 skipped (5605)` | `Test Files 1 failed \| 582 passed` · `Tests 1 failed`（**只剩 `class-name-contract`**） |
| 加载失败文件 | **4 个**（`0 test`，因缺 `@tanstack/react-virtual`） | **0 个** |
| `tsconfig.main.json` / `.preload.json` | **exit 0 / 0 错**（P3，带 `[运行痕迹]`） | **保持 0**（若装完变红 ⇒ **先归因到 TS 版本**，见 E5） |

### E4 · 四层核验的输入面（**已经存在的证据，不要重造**）

| 层 | 输入 | 位置 | 实测规模 |
|---|---|---|---|
| **文件层** | **91 条静默删除面 + 3 个 rename** | `.cyrene-merge-analysis/heb-review-p2/` | `ud-set.txt` **16** · `silent-set.txt` **75** · `official-deletions.txt` **98**（= 95 + 3 rename）· `noop-set.txt` **7** · `tree-{base,head,target}.txt` |
| **符号层** | P3 偏差 1 的 **7 个恢复文件**逐符号清单 | `.cyrene-merge-analysis/heb-p3/p3-disposition.md`（18899 B）§二 2.1/2.2/2.3 | 8 个 `rag/index` 导出 + 4 个 IPC channel + 3 个 preload 桥方法 + `file-ingest` 整文件取回 |
| **入口层** | P3 的"可达性"判据形状（`ipc-contract` 的第二条断言） | `src/main/application/ipc-contract.test.ts` | 它是**全任务唯一**"机器自动发现功能断链"的判据（P3 §四 自述） |
| **桥接层** | IPC 三处对齐 | `src/shared/ipc-channels.ts` · `src/main/**` 注册点 · `src/preload/index.ts` | `ipc-contract.log` 实测 **8/8 通过**（带 `[运行痕迹]`） |
| **功能基线** | 11 项标识 + 逐项读数 | `PHASE-4-完成报告.md` §三 A9 | `7/8/5/11/13/9/10/5/2/9/4` |

### E5 · 🔴 **四层核验必须知道的四个"历史断口"**（P3/P4 已发现，P5 要**复查它们已闭合**并**找同类**）

| # | 断口 | 性质 | 出处 |
|---|---|---|---|
| 1 | **救回文件依赖的上游符号被删** | **符号层** | P3 §五 偏差 1（`file-ingest.ts` 387→57 · `retriever.ts` 411→160 · `rag/index.ts` 删 8 导出 · `ipc-channels.ts` 删 4 channel · `chat-ui-ipc.ts` 删 2 handler · `preload` 删 3 桥方法） |
| 2 | **附件链渲染端无调用点** | **入口层**（A56） | P3 §六 第 8 项（`processDocuments` / `onDocumentIndexProgress` / `cancelDocumentIndex` **只有 preload 桥，无 React 调用点**） |
| 3 | **`embedding-index-service.ts` 孤儿** | **入口层**（能力被取代） | P3 §五 偏差 3（消费者 = **0**；官方用 `sticker-text-matcher.ts` 的 **text 索引**取代，且**复用同一缓存文件名** `sticker-embedding-cache.json`） |
| 4 | **渠道 4 文件"我方删、官方从未改"被静默执行** | **文件层**（**方向相反**的静默面） | P4 §五 5.4（删除出处 = **`598dfb75`**，该提交**同时清理了引用点**；官方侧 blob 与 base **逐字节相同**） |

> 🔴 **P5 的核心价值就是"用统一的四层口径把这 4 个断口复查一遍，并扫描同类的第 5、6… 个"**。
> **不要只复查这 4 个** —— 它们是**线索**，不是**清单**（经验 **C24**：按清单审计会漏掉清单外的东西，本项目已复现 5 次）。

### E6 · 环境可用性（**实测，不要照抄旧结论**）

```bash
cd /e/AI_Chating/cyrene-agent
node -v                      # v22.23.2   ← 系统 node（不是被要求的 24）
./.node24/node.exe -v        # v24.21.0   ← 应用级 node（P1 建，.gitignore:248 已忽略）
which pnpm                   # /d/data/node/pnpm
pnpm -v                      # 10.33.0    ← 本次实测：可用
PATH="/e/AI_Chating/cyrene-agent/.node24:$PATH" pnpm -v   # 10.33.0  ← 加 .node24 后同样可用
```

🔴 **一处口径更正（重要）**：P3 报告 §五 偏差 6 记"不带 `.node24` 时解析到系统 `D:\data\node\pnpm`（**已知损坏**），
导致 `work-verification-closure.test.ts` 失败"。**本轮实测：该 shim 现在是可用的（`pnpm -v` → 10.33.0）**，
且我**独立跑过** `work-verification-closure.test.ts` ⇒ **`9 passed (9)`**。
📌 **结论**：**"必须把 `.node24` 前置到 PATH"这条不是无条件成立的**；正确做法是**先探测**（§三 3.0 ⑥），
探测失败再前置。**照抄 P3 的绝对结论会让人误以为"不加就必红"**（同族 **J-19**：结论要带时点与环境）。

### E7 · 磁盘与备份

| 量 | 实测 |
|---|---|
| E: 可用空间 | **450 GB**（900 GB 总量，51% 已用） |
| P1 备份 | `E:\AI_Work\备份\cyrene-pre-P1-2026-10-04\`（含 `node_modules` / `package.json` / `package-lock.json` / `BACKUP-MANIFEST.txt` / `_logs`） |
| `node_modules` 体量 | 2.4 GB / 132037 文件 ⇒ **任何"整份复制"都要 2.4 GB + 时间** |

### E8 · 被推翻的原计划（**不要按旧描述执行**）

| 原计划（P0 总蓝图/旧口径） | 实测结论 | 新做法 |
|---|---|---|
| "P5 = 保真核验（四层）" | ✅ 成立，但**少了一半**：H-15 的销账点也在 P5，而它**必须先做**（否则 renderer 恒 4 错） | §四 4.1–4.4 先安装销账，4.5–4.8 再核验 |
| "P5 顺手把 TS 升到 6" | ❌ **lockfile 里有 `5.4.5` 与 `6.0.3` 两个条目** ⇒ 升不升**不由我们定**，由 `--frozen-lockfile` 定 | **只记录实际落地的版本**；若升到 6 则**单独复跑基线并单列**（判据 **J-17**） |
| "核验面 = 91 + 3 = 94" | ✅ 成立（**且必须写清口径**：这是"会从树上消失的路径"，与 P4 的 **88**（"官方树有、新树没有"）**是两个口径、不可互换**） | §六 A7 用 **94**；引用 P4 的 88 时**必须标注它是另一个口径**（**J-22**） |
| "P5 不需要人拍板" | ⚠️ **不成立**：渠道 4 文件（P4 §五 5.4）与 `embedding-index-service` 孤儿（P3 §五 偏差 3）都是**功能取舍** | §五 5.1 登记，**可挂起但不许静默略过** |

---

## 三、前置条件与停止条件

### 3.0 前置条件（**不满足则不得开始**）

```bash
cd /e/AI_Chating/cyrene-agent

# ① P4 报告的"回写清单"已闭合 —— 期望：0 行
grep -c '^|.*\[ \]' docs/construction/HEB-1.3.0/TASK-H1.3.0/PHASE-4-完成报告.md

# ② 台账无未闭合拍板 —— 期望：0 行
grep -c '^|.*\[ \]' docs/construction/HEB-1.3.0/TASK-H1.3.0/HUMAN-人工验证台账.md

# ③ 起点：无冲突、无未提交改动 —— 期望：0 / 0
git diff --name-only --diff-filter=U | wc -l
git status --porcelain | grep -vc '^??'

# ④ 合并已完成、固定点可用 —— 期望：三值正确
git rev-parse '9cceeeac^{commit}'
git rev-list --parents -n 1 9cceeeac | wc -w        # 期望 3（真合并）
git rev-parse p4-pre-commit                          # 期望 9920635f…

# ⑤ 锁文件与工作区声明就位 —— 期望：文件在 + packageManager 对
ls -la pnpm-lock.yaml pnpm-workspace.yaml
node -e 'const p=require("./package.json"); console.log(p.packageManager, JSON.stringify(p.engines))'

# ⑥ pnpm 可用性**探测**（不要照抄 P3 的绝对结论，见 §二 E6）—— 期望：打印一个 10.x 版本
pnpm -v 2>&1 | head -1
#    若上面失败 ⇒ 改用：
PATH="/e/AI_Chating/cyrene-agent/.node24:$PATH" pnpm -v 2>&1 | head -1

# ⑦ 安装前的三基线现状（**必须先取，装完才好比对**）—— 期望：renderer=4 错 / 全量=1 失败+4 加载失败
ls -la .cyrene-merge-analysis/heb-p3/after-tsconfig.{main,preload,renderer}.log .cyrene-merge-analysis/heb-p3/fulltest.log
grep -c 'error TS' .cyrene-merge-analysis/heb-p3/after-tsconfig.renderer.log     # 期望 4
grep -E 'Test Files|Tests  ' .cyrene-merge-analysis/heb-p3/fulltest.log | tail -2

# ⑧ 回退路径可用（本 Phase 的**安全前提**，见 §四 4.1）—— 期望：至少一条为真
ls -d node_modules 2>/dev/null && echo "node_modules 在（可改名或复制）"
ls -d /e/AI_Work/备份/cyrene-pre-P1-2026-10-04/node_modules 2>/dev/null && echo "P1 备份在"
test -d node_modules.bak && echo "已有 node_modules.bak（说明上次未清）"

# ⑨ 磁盘空间 —— 期望：> 10 GB 可用
df -h /e | tail -1

# ⑩ 四个参照物与证据输入在盘 —— 期望：全部存在
for p in .cyrene-merge-analysis/heb-review-p2/{ud-set.txt,silent-set.txt,official-deletions.txt} \
         .cyrene-merge-analysis/heb-p3/p3-disposition.md \
         .cyrene-merge-analysis/heb-p4/p4-verify.txt; do
  printf "  %-56s %s\n" "$(basename $p)" "$(test -f $p && echo OK || echo MISSING)"
done
git rev-parse --verify wip/p3-src p4-pre-commit
```

| # | 前置 | 期望 | 不满足时 |
|---|---|---|---|
| ① | P4 回写清单已闭合 | 0 行 | **不得开始**（规范 §5.1） |
| ② | 台账无未闭合 H-A | 0 行 | **不得开始**：先要人拍板 |
| ③ | 无冲突 / 无未提交改动 | 0 / 0 | ⚠️ 有 `M` ⇒ 先弄清是什么（若是本蓝图自己 ⇒ 正常） |
| ④ | 合并完成 + 固定点正确 | 三值对 | 🔴 **停工**：起点不对，核验全无意义 |
| ⑤ | 锁文件与 `packageManager` 就位 | 在 | 🔴 **停工**：H-15 的前置不具备（**那就诚实记"仍受阻"，不许降级成 `pnpm install`（无 frozen）**，经验 **C37/X20**） |
| ⑥ | pnpm 可用 | 10.x | ⚠️ **先试 `.node24` 前置**；两者都不可用 ⇒ 🔴 停工（**不许改用 npm**：那会改写锁文件与依赖树，破坏可归因性） |
| ⑦ | 装前三基线已取 | 4 错 / 1 失败 + 4 加载失败 | **先补取**（用 `.cyrene-merge-analysis/heb-p5/before-*`），否则装完无法判定 |
| ⑧ | 回退路径可用 | ≥1 条 | 🔴 **停工**：**没有回退就不许动 `node_modules`**（不可逆动作先备份，规范 §2.1） |
| ⑨ | 磁盘 > 10 GB | > 10 GB | ⚠️ 改用"改名策略"（零额外空间，见 §四 4.1 A 案） |
| ⑩ | 四个参照物在盘 | 全 OK | ⚠️ 缺哪个补哪个（P2 的是**文件层分母**，缺了核验没有分母） |

### 3.1 停止条件（**命中即停工**）

| # | 触发 | 为什么必须停 | 停工后做什么 |
|---|---|---|---|
| **S1** | 前置 ①②④⑤⑧ 任一不满足 | 前提被破坏；核验/安装都会固化的错 | 写报告说明哪条 + 实测输出，**不动 `node_modules`** |
| **S2** | 🔴 `pnpm install --frozen-lockfile` **返回非 0** | 说明锁文件与 `package.json` **不一致**（或网络/权限） | **不要**降级成 `pnpm install`（会**改写锁文件**，让 H-15 的"可验证"变成"自行其是"）；按 §九 坑 2 归因后停工 |
| **S3** | 安装后 **`pnpm-lock.yaml` 被改写**（`git status` 显示它 `M`） | `--frozen-lockfile` 的语义就是"**不许改**"；改了说明用了别的命令 | **立即停工**；`git checkout -- pnpm-lock.yaml` 复原，重查命令 |
| **S4** | 安装后 `tsconfig.renderer` 的错**未降到 0**，或**出现了新的错** | 可能与 TS 版本变化混淆（E2/E5） | 停工；**先归因到 TS 版本**（`node -e "console.log(require('typescript/package.json').version)"`）再决定 |
| **S5** | 安装后 `tsconfig.main` / `.preload` **从 0 错变红** | 那两个格子装前是全绿 ⇒ **只能是工具链变化造成的** | 停工；把差异归因到具体包版本（**这是本 Phase 最可能的真回归**） |
| **S6** | 核验发现**新的符号级/入口级断口**，且落在 M2 保护面内 | 属"功能缺失"，不是核验流程问题 | **不擅自修**；登记 **缺陷报告** + BACKLOG（规范 §5.3：安全/隐私/数据类缺陷单独立项） |
| **S7** | 需要**产品取向判断**（渠道 4 文件 / 孤儿模块） | agent 不得替人做取舍 | 登记 **H-A**，**该项挂起**，其余继续 |
| **S8** | `work-verification-closure.test.ts` 在装完后**变红** | 它依赖 PATH 上的 pnpm（E6 实测为绿）⇒ 变红说明环境或依赖树有变 | 停工；先按 §九 坑 5 探测 pnpm 解析路径 |

### 3.2 顺序纪律（**本 Phase 的成败在这条上**）

```text
① 取装前三基线        → ② 建回退路径        → ③ 安装（frozen）      → ④ 验锁文件未变
   ↓                                                                      ↓
⑧ 写报告与回写  ←  ⑦ 入口层/桥接层核验  ←  ⑥ 符号层核验  ←  ⑤ 复跑基线（拿到"装完后"的数）
```

🔴 **两条不许颠倒的顺序**：
1. **先取基线再安装** —— 否则"4 错 → 0 错"这个数字**没有对照物**（经验 **D33**：对照物为空时判据毫无意义）；
2. **先复跑基线再开始核验** —— 否则核验里任何红都可能是"缺包"造成的，**无法归因到合并**（经验 **C37 / J-17**）。

---

## 四、改动清单（Agent 直接执行）

### 4.1 建立回退路径（**动 `node_modules` 之前的唯一强制步骤**）

**两种方案，按磁盘与时延选**（**不许"不备份就装"**）：

| 方案 | 命令 | 成本 | 回退 | 适用 |
|---|---|---|---|---|
| **A · 改名法（推荐）** | `mv node_modules node_modules.bak` | **瞬时、零额外空间** | `rm -rf node_modules && mv node_modules.bak node_modules` | 磁盘紧 / 想快 |
| **B · robocopy 复制** | `robocopy node_modules "E:\AI_Work\备份\cyrene-pre-P5-<日期>\node_modules" /E /NFL /NDL /NJH` | **2.4 GB + 数分钟** | `robocopy` 回灌 | 想留**独立**副本（跨盘、跨时点） |

```bash
# A 案（推荐）：先确认没有进程占用 node_modules，再改名
cd /e/AI_Chating/cyrene-agent
test -d node_modules.bak && echo "🔴 已存在 node_modules.bak，先人工确认它是什么" && exit 1
mv node_modules node_modules.bak
ls -d node_modules.bak && echo "回退路径就绪：mv node_modules.bak node_modules"
```

> 🔴 **为什么"改名"等价于备份**：它把**整个旧依赖树**原地保留（同一分区 ⇒ 原子 rename），
> 而安装会**新建** `node_modules` ⇒ 两者**同时存在** ⇒ 回退只是再改一次名。
> 实测依据：`node_modules` = **132037 文件 / 2.4 GB**，复制要几分钟，改名是**毫秒级**。
> ⚠️ **`node_modules.bak` 会被 git 看到吗**？不会 —— `.gitignore` 已忽略 `node_modules`（同名前缀同样被忽略）。
> **装完并验收通过后**：`rm -rf node_modules.bak`（**这一步要等 §六 A1–A6 全绿再做**）。

### 4.2 取"装前三基线"（**落盘，作为对照物**）

```bash
cd /e/AI_Chating/cyrene-agent
mkdir -p .cyrene-merge-analysis/heb-p5
# ① 直接复用 P3 的出口读数（它们就是"装前"的值）
cp .cyrene-merge-analysis/heb-p3/after-tsconfig.renderer.log .cyrene-merge-analysis/heb-p5/before-tsconfig.renderer.log
cp .cyrene-merge-analysis/heb-p3/fulltest.log                .cyrene-merge-analysis/heb-p5/before-fulltest.log
# ② 把三个关键数写成一行，便于后面对比（判据 J-19：带时点）
{
  echo "# 装前三基线（取自 P3 出口，2026-10-04；本文件由 P5 生成）"
  echo "renderer errorTS   = $(grep -c 'error TS' .cyrene-merge-analysis/heb-p5/before-tsconfig.renderer.log)"
  echo "main errorTS       = $(grep -c 'error TS' .cyrene-merge-analysis/heb-p3/after-tsconfig.main.log)"
  echo "preload errorTS    = $(grep -c 'error TS' .cyrene-merge-analysis/heb-p3/after-tsconfig.preload.log)"
  echo "fulltest summary   = $(grep -E 'Test Files' .cyrene-merge-analysis/heb-p5/before-fulltest.log | tail -1 | xargs)"
  echo "fulltest tests     = $(grep -E '^ *Tests ' .cyrene-merge-analysis/heb-p5/before-fulltest.log | tail -1 | xargs)"
  echo "unloadable files   = 4 (ChatMessageList.test.ts / ChatMessageList.last-turn.test.ts / StreamdownMessageContent.test.ts / streamdown-message-content-state.test.ts)"
  echo "typescript version = $(node -e "console.log(require('typescript/package.json').version)")"
  echo "node_modules       = $(find node_modules -type f 2>/dev/null | wc -l) files / $(du -sh node_modules 2>/dev/null | cut -f1)"
} > .cyrene-merge-analysis/heb-p5/before-baseline.txt
cat .cyrene-merge-analysis/heb-p5/before-baseline.txt
```

### 4.3 执行安装（**H-15 的销账动作**）

```bash
cd /e/AI_Chating/cyrene-agent
# 🔴 必须带 --frozen-lockfile：它的语义是"锁文件与 package.json 必须一致，且不许改写锁文件"
#    这样"依赖树可验证"才成立（H-15 要的就是这个）
pnpm install --frozen-lockfile 2>&1 | tee .cyrene-merge-analysis/heb-p5/install.log
echo "install exit = ${PIPESTATUS[0]}" | tee -a .cyrene-merge-analysis/heb-p5/install.log
```

**装完立刻做四件事**（缺一件这条销账就不算成立）：

```bash
cd /e/AI_Chating/cyrene-agent
# ① 锁文件**未被改写** —— 期望：0 行
git status --porcelain -- pnpm-lock.yaml pnpm-workspace.yaml package.json
# ② 依赖树规模（对照 P1 的 132037）
echo "files = $(find node_modules -type f | wc -l) ; size = $(du -sh node_modules | cut -f1)"
# ③ 三个缺包到位 —— 期望：各打印一个版本
for p in @mantine/core @mantine/hooks @tanstack/react-virtual; do
  node -e "console.log('$p', require('./node_modules/$p/package.json').version)"
done
# ④ 🔴 TypeScript 实际落地版本（E2 的 TS 双版本陷阱）—— 期望：5.9.3 或 6.x，**必须记录**
node -e "console.log('typescript =', require('./node_modules/typescript/package.json').version)"
node -e "console.log('vitest =', require('./node_modules/vitest/package.json').version)"
node -e "console.log('electron =', require('./node_modules/electron/package.json').version)"
```

> 🔴 **若 TS 变成 `6.x`**：**这是本 Phase 的第二个变更源**（工具链）⇒ **必须在报告里单列一节**，
> 并把 §六 A4–A6 的每一个读数**同时给"装前 / 装后"两列**，让"缺包修复"与"TS 升级"**可分离归因**（规范 §4.1.3 硬要求 5）。
> 📌 **判据 J-17 的最终形态**：P1 故意留在 5.9.3，正是为了让"**5.9.3 下 0 错 → 6.x 下 N 错**"这个数字**自己成为交付物**。

### 4.4 复跑基线（**拿到"装完后"的数**）

```bash
cd /e/AI_Chating/cyrene-agent
N24=./.node24/node.exe
TSC=node_modules/typescript/lib/tsc.js

# ① 三套编译（**大写入同一份日志**：判据 J-23 —— 绿格必须自带运行痕迹）
for c in main preload renderer; do
  out=".cyrene-merge-analysis/heb-p5/after-tsconfig.$c.log"
  $N24 $TSC -p tsconfig.$c.json --noEmit --pretty false > "$out" 2>&1
  rc=$?
  echo "# [运行痕迹] tsconfig.$c.json  exit=$rc  errorTS=$(grep -c 'error TS' "$out")" >> "$out"
  echo "$c : exit=$rc  errorTS=$(grep -c 'error TS' "$out")"
done

# ② 全量测试（同样写入运行痕迹）
out=.cyrene-merge-analysis/heb-p5/fulltest.log
$N24 node_modules/vitest/vitest.mjs run > "$out" 2>&1
rc=$?
echo "# [运行痕迹] vitest run  exit=$rc" >> "$out"
grep -E 'Test Files|Tests  |Failed Tests' "$out" | tail -3
grep -E '^\s*FAIL|\(0 test\)' "$out" | sort -u
```

| 判据 | 装前 | **装后期望** | 若不符 |
|---|---|---|---|
| `main` / `preload` errorTS | 0 / 0 | **0 / 0** | 🔴 **S5 停工**（全绿格变红只能是工具链变化） |
| `renderer` errorTS | **4** | **0** | 🔴 **S4 停工**；先归因 TS 版本 |
| 全量 `Tests` | `1 failed \| 5603 passed \| 1 skipped` | **`1 failed \| 5603+ passed`**（失败仍只有 `class-name-contract`） | 见 §九 坑 4 |
| 加载失败文件（`0 test`） | **4** | **0** | 若仍有 ⇒ 缺的不是那 3 个包，需重查 |

> ✅ **「不算失败」的情形（提前写明）**：
> ① **`class-name-contract` 仍红 1 条** —— **预期之内**（早于本次合并的既有欠账，P3 已归因）；**不要为它改测试或改 CSS**；
> ② **通过数上升**（`5603 → 更多`）—— 装包后那 4 个文件开始跑用例 ⇒ **上升不算退化**；
> ③ **`skipped` 数与基线不同** —— 视**外部依赖可用性**而定（无渠道/无网络时的 skip），**不是回归**。

### 4.5 文件层核验（**分母 91 + 3 = 94**）

> **口径（写进报告，判据 J-22）**：`94` = `{在我方 HEAD ∧ 不在官方目标}` 的官方删除项 **91**（= **16 UD + 75 静默**）**＋ 3 个 rename 旧路径**。
> ⚠️ **与 P4 报告的 `88` 是两个口径、不可互换**：88 = "官方树有、新树没有"（含 `docs/**` 与渠道 4 文件）。

```bash
cd /e/AI_Chating/cyrene-agent
P2=.cyrene-merge-analysis/heb-review-p2
mkdir -p .cyrene-merge-analysis/heb-p5

# ① 91 条：该删的**必须已不在树上**（索引口径！**不可只用 Test-Path**）
: > .cyrene-merge-analysis/heb-p5/file-layer.txt
for f in $(cat $P2/ud-set.txt $P2/silent-set.txt); do
  if git ls-files --error-unmatch -- "$f" >/dev/null 2>&1; then
    echo "🔴 STILL-TRACKED $f" >> .cyrene-merge-analysis/heb-p5/file-layer.txt
  fi
done
echo "91 条中仍在索引的 = $(grep -c 'STILL-TRACKED' .cyrene-merge-analysis/heb-p5/file-layer.txt)  ← 期望 0（**但见下方豁免**）"

# ② 该留的 18 条**必须还在树上**（P2 的救回面）
RESCUED="src/main/rag/document-cache.ts src/main/rag/document-index-ipc.ts src/main/rag/document-index-queue.ts
src/main/rag/document-index-worker.ts src/main/services/embedding/embedding-index-service.ts
src/main/sticker-embedder.ts src/main/sticker-embedding-cache.ts src/shared/document-index.ts
src/renderer/settings/shared/modal.ts src/renderer/settings/shared/modal-state.ts
src/renderer/settings/shared/dialog-focus.ts src/renderer/settings/memory/dom.ts"
miss=0
for f in $RESCUED; do git ls-files --error-unmatch -- "$f" >/dev/null 2>&1 || { echo "🔴 RESCUED-MISSING $f"; miss=$((miss+1)); }; done
echo "18 条救回面缺失 = $miss  ← 期望 0"

# ③ 3 个 rename：**新路径在、旧路径不在**
for pair in "src/main/orchestrator/tools/search-code-tools.ts:src/main/orchestrator/tools/search-text-tools.ts" \
            "src/main/orchestrator/tools/search-code-tools.test.ts:src/main/orchestrator/tools/search-text-tools.test.ts" \
            "vitest.config.ts:vitest.config.mts"; do
  old="${pair%%:*}"; new="${pair##*:}"
  o=$(git cat-file -e "HEAD:$old" 2>/dev/null && echo PRESENT || echo absent)
  n=$(git cat-file -e "HEAD:$new" 2>/dev/null && echo PRESENT || echo absent)
  printf "  %-52s old=%s new=%s  %s\n" "$(basename $old)" "$o" "$n" "$([ "$o" = absent ] && [ "$n" = PRESENT ] && echo OK || echo 🔴)"
done
```

🔴 **必须写的两处豁免（否则会误判）**：

| 豁免 | 依据 |
|---|---|
| `ud-set.txt` 里那 **3 个 DU 目标**（`docs/design/react-frontend-visual-guidelines.md` · `docs/internal-issue/2026-09-09-….md` · `docs/refactor/2026-09-14-….md`）**磁盘上仍有未跟踪副本** | P2 §五 偏差 3；**删除判据用索引口径**（`ls-files --error-unmatch` → exit ≠ 0），`Test-Path` 恒 `True` **不算失败** |
| 上述 91 条里若有**被我方自己更早删除**的（`noop-set.txt` 那 7 条） | P2 §五 偏差 2；它们**不参与**核验 |

### 4.6 符号层核验（**P3 只做了一次，P5 要做成"扫描"**）

> **P3 的教训（§五 偏差 1）**：**"救回文件" ≠ "救回能力"** —— 文件在，但它 `import` 的符号被官方删了。
> **P5 要回答的是**：**还有没有第二处同类断口**（P3 只发现了附件链那一条）。

```bash
cd /e/AI_Chating/cyrene-agent
mkdir -p .cyrene-merge-analysis/heb-p5
N24=./.node24/node.exe

# ① P3 的 7 个恢复文件：其"被删符号"现在是否都在（逐符号）
cat > .cyrene-merge-analysis/heb-p5/probe-symbols.mjs <<'EOF'
import { execFileSync } from 'node:child_process';
const g = (a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 1 << 28 });
// P3 §五 偏差 1 的恢复清单（符号级）
const EXPECT = {
  'src/main/rag/file-ingest.ts': ['Attachment','AttachmentKind','isBinary','isTextExt','isUnsupportedExt','SMALL_THRESHOLD','DocumentImportControl'],
  'src/main/rag/retriever.ts': ['RetrieveOptions'],
  'src/main/rag/vectorstore.ts': ['deleteImportedDoc','hasImportedDocumentChunks'],
  'src/main/rag/index.ts': ['ImportedDocumentResult','ImportedDocumentChunk','PreparedDocumentEmbedding','appendPreparedDocumentBatch','importPreparedDocumentForTurn','importDocumentForTurn','importDocument','searchImportedDocumentChunksForImportIds'],
  'src/shared/ipc-channels.ts': ['CHAT_DOCUMENT_INDEX_PROGRESS','CHAT_PROCESS_DOCUMENTS','CHAT_CANCEL_DOCUMENT_INDEX','MEMORY_PANEL_DELETE_IMPORTED_DOC'],
  'src/preload/index.ts': ['processDocuments','onDocumentIndexProgress','cancelDocumentIndex'],
};
let bad = 0, checked = 0;
for (const [file, syms] of Object.entries(EXPECT)) {
  const src = g(['show', `HEAD:${file}`]);
  for (const s of syms) {
    checked++;
    // 判据：该文件里出现该符号（导出或使用）；更严格可用 `export (function|const|type|interface) <sym>`
    if (!new RegExp(`\\b${s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\b`).test(src)) { bad++; console.log('  🔴 MISSING', file, '->', s); }
  }
}
console.log(`  符号检查：${checked - bad}/${checked} 在位；缺失 ${bad}`);
process.exit(bad ? 1 : 0);
EOF
$N24 .cyrene-merge-analysis/heb-p5/probe-symbols.mjs

# ② 🔴 **新增扫描（P3 没做）**：全仓 `import` 的**目标符号**是否都在
#    形状：抽出所有 `import { A, B } from "./x"`，解析相对路径，检查目标文件是否真的导出 A、B
cat > .cyrene-merge-analysis/heb-p5/probe-import-symbols.mjs <<'EOF'
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
const g = (a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 1 << 28 });
const files = g(['ls-tree','-r','--name-only','HEAD']).split('\n').filter(f => /\.(ts|tsx)$/.test(f) && f.startsWith('src/'));
const IMPORT_RE = /import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+["'](\.[^"']+)["']/g;
const cache = new Map();
const head = (f) => { if (!cache.has(f)) { try { cache.set(f, g(['show', `HEAD:${f}`])); } catch { cache.set(f, null); } } return cache.get(f); };
const exported = (f) => {
  const s = head(f); if (s == null) return null;
  const names = new Set();
  for (const m of s.matchAll(/export\s+(?:async\s+)?(?:function|const|let|var|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  for (const m of s.matchAll(/export\s*\{([^}]+)\}/g)) for (const p of m[1].split(',')) { const n = p.trim().split(/\s+as\s+/).pop().trim(); if (n) names.add(n); }
  return names;
};
const resolve = (from, spec) => {
  const base = path.posix.join(path.posix.dirname(from), spec);
  for (const c of [base + '.ts', base + '.tsx', base + '/index.ts', base + '/index.tsx', base]) if (head(c) != null) return c;
  return null;
};
let bad = 0, checked = 0;
for (const f of files) {
  const s = head(f); if (!s) continue;
  for (const m of s.matchAll(IMPORT_RE)) {
    const target = resolve(f, m[2]);
    if (!target) continue;                       // 目标不存在 ⇒ 由 tsc 报 TS2307，不在此列
    const ex = exported(target); if (!ex) continue;
    for (const raw of m[1].split(',')) {
      const name = raw.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim();
      if (!name || name === '') continue;
      checked++;
      if (!ex.has(name) && !ex.has('default')) { bad++; if (bad <= 40) console.log(`  🔴 ${f}  imports {${name}} from ${target} —— 目标未导出`); }
    }
  }
}
console.log(`\n  import 符号检查：${checked - bad}/${checked} 在位；可疑 ${bad}`);
EOF
$N24 .cyrene-merge-analysis/heb-p5/probe-import-symbols.mjs | tee .cyrene-merge-analysis/heb-p5/symbol-layer.txt
```

> 🔴 **这个扫描是"代理判据"，不是充分判据**（规范 §7.1）—— 它用正则抽 `export`，`export *` / 动态导出 / 类型再导出会漏。
> ⇒ **必须配一条交叉验证**：**`tsc` 的三套编译全绿**（A4）就是它的交叉验证（`TS2305`/`TS2307` 正好覆盖"导入了不存在的符号"）。
> 📌 **两者都绿才算符号层通过**；**只有扫描绿而 `tsc` 红 ⇒ 以 `tsc` 为准**。

### 4.7 入口层核验（**11 项能力逐项问"从组合根可达吗"**）

> **P3 的教训（§六 第 8 项）**：附件链"**源码契约完整、契约测试全绿，但渲染端没有调用点**"（**A56**）。
> **P5 要把这件事对 11 项能力各做一遍** —— 判据形状 = **"从组合根出发，是否存在一条调用路径到达它"**。

```bash
cd /e/AI_Chating/cyrene-agent
# 组合根候选（本项目的入口装配点）
ROOTS="src/main/application/core-bootstrap.ts src/main/application/default-dependencies.ts src/main/index.ts src/main/main.ts"
echo "=== 组合根候选中实际存在的 ==="
for r in $ROOTS; do git cat-file -e "HEAD:$r" 2>/dev/null && echo "  OK  $r"; done

# 逐项：① 定义在哪 ② 谁引用 ③ 渲染端/主进程侧各有几个调用点
for k in memory-console person-erasure ZONES_ audit-log tool-access keyword-policy group-corpus buildGroupContextBlock USAGE_BADGE groupContextLimit confirmValue; do
  n_main=$(git grep -l -- "$k" HEAD -- 'src/main' | wc -l)
  n_pre =$(git grep -l -- "$k" HEAD -- 'src/preload' | wc -l)
  n_rnd =$(git grep -l -- "$k" HEAD -- 'src/renderer' | wc -l)
  printf "  %-24s main=%-3s preload=%-3s renderer=%-3s\n" "$k" "$n_main" "$n_pre" "$n_rnd"
done
```

🔴 **判读规则（写进报告）**：

| 形状 | 含义 | 动作 |
|---|---|---|
| `main ≥1` ∧ `renderer ≥1` | **两端都有入口** ⇒ 可达（仍建议人工抽验 1 项） | 记为 ✅ |
| `main ≥1` ∧ `renderer = 0` | 🔴 **可能是 A56**（能力在、界面无入口） | **逐项查清**：是"该功能本来就无 UI"（如纯 IPC 能力）还是"入口被合并删了"；**前者 ✅，后者登记缺陷** |
| `main = 0` | 🔴 **能力已失**（定义都没了） | **停工级**（S6），登记缺陷报告 |
| `main=0 ∧ renderer≥1` | 🔴 前端调一个不存在的后端 | 同 TS2307，**编译期应已红** ⇒ 与 A4 交叉核对 |

📌 **已知的 1 个真 A56**（P3 发现，**P5 要确认它是否已闭合**）：附件链的 `processDocuments` / `onDocumentIndexProgress` / `cancelDocumentIndex`
—— 判据：`git grep -n 'processDocuments\|onDocumentIndexProgress\|cancelDocumentIndex' HEAD -- src/renderer` ⇒ **若仍为 0，则 D3 在源码层不可达**，
必须由 **P6 人眼**判定"是不是设计如此"（P3 §六 第 8 项已如此登记）。

### 4.8 桥接层核验（**IPC 三处对齐**）

```bash
cd /e/AI_Chating/cyrene-agent
# ① 现成的强判据：ipc-contract 测试（它同时看"声明侧"与"使用侧"）
./.node24/node.exe node_modules/vitest/vitest.mjs run src/main/application/ipc-contract.test.ts 2>&1 | tail -8 | tee .cyrene-merge-analysis/heb-p5/ipc-contract.log
echo "# [运行痕迹] ipc-contract.test.ts exit=$?" >> .cyrene-merge-analysis/heb-p5/ipc-contract.log

# ② 独立的第三机制：三处计数对齐（声明 / 注册 / 桥）
decl=$(git grep -c -E '^\s+[A-Z0-9_]+:\s*"' HEAD -- src/shared/ipc-channels.ts | tail -1)
reg=$(git grep -c 'ipc\.\(handle\|on\)(IPC\.' HEAD -- src/main | awk -F: '{s+=$NF} END {print s}')
pre=$(git grep -c 'IPC\.' HEAD -- src/preload/index.ts | awk -F: '{s+=$NF} END {print s}')
echo "  channel 声明=$(decl)  main 注册点=$(reg)  preload 引用=$(pre)"
```

> 🔴 **三处计数不需要相等**（不是所有 channel 都同时被注册与桥接：有单向的、有 `send` 的、有只在 main 内部用的）。
> ⇒ **它们只是"有没有明显塌陷"的代理指标**（例如 `pre = 0` ⇒ 桥全没了）。
> **真正的判据是 ①**（`ipc-contract.test.ts`），**它才是充分的**（P3 实测：它抓出了"主进程外发但 preload 无监听"与"注册点不可达"两类断口）。

---

## 五、人工环节 ★

### 5.1 H-A 阻塞性拍板（**本 Phase 有 2 项，可挂起但不许略过**）

| # | 拍板项 | 现状（实测） | 为什么必须人定 | 挂起的后果 |
|---|---|---|---|---|
| **H-A-1** | **渠道 4 文件**：`src/main/channels/conversation-binding-api{,.test}.ts` · `src/renderer/react/features/chat/hooks/useChannelMirrorEvents{,.test}.ts` —— **确认删除** 还是 **恢复**？ | **我方在 `598dfb75`（本任务之前）就删了**，且**同时清理了引用点**（`init.ts` / `ChatPage.tsx`）；官方侧**从未改过这 4 个文件**（blob 与 merge-base 逐字节相同）⇒ 合并时**静默执行了删除** | "渠道会话绑定 / 渠道消息镜像"**要不要**是**产品判断**（M2 说"功能不得缺失"，但这 4 个是否属"要保留的功能"由人定） | 若选**恢复**：取回 4 个文件 **＋ 恢复 `init.ts` / `ChatPage.tsx` 的调用点**（**取回文件 ≠ 恢复功能**），作为**独立一笔** |
| **H-A-2** | **`src/main/services/embedding/embedding-index-service.ts` 孤儿**：**保留** 还是 **随官方删除**？ | 消费者 **= 0**；官方用 `sticker-text-matcher.ts` 的 **text 索引**取代它，且**复用同一缓存文件名**（`sticker-embedding-cache.json`） | 属"**能力已被取代**"的取舍；删它要留审计痕迹（**M6**） | 保留 = 多一个死文件；删除 = 需确认没有仓外/动态消费者 |

**登记方式（规范 §4.1.2）**：两项各占台账**一行** `H-nn`（`类·时点` = `A · H-A`），**前三列 agent 预填**，
`状态` 列写 `[ ]`（**只有 H-A 允许用这个记号**），并**同时登记进 §三 3.0 前置条件**（未答复不得开始**对应那一步**，但**其余步骤可以继续**）。

> 🔴 **本 Phase 的实际做法**：**先做不依赖这两项的一切**（安装、四层核验、基线复跑），
> 把这两项**作为 A12 的判定项**收口 —— **不要因为等人拍板就整段停工**（那会把 P5 卡住）。

### 5.2 H-B 完工评审（**本 Phase 不要求人做**）

| 可能的评审点 | 为什么不做 |
|---|---|
| "装完的依赖树对不对？" | 机器可判（`--frozen-lockfile` + 锁文件未变 + 三个包到位） |
| "核验结论对不对？" | 机器可判（四层各有一条充分判据） |
| 🔴 "**开应用看看**" | **绝对不做**：本 Phase **不运行应用**（首次启动会**迁移 `%APPDATA%\live2d-cyrene`**）⇒ 属 **P6**，且**必须先外部备份** |
| "日语界面文案" | 需真实界面 ⇒ **P6**（已并入 `H-12`） |

### 5.3 H-C 待验项登记（本 Phase **验不了**的）

**本 Phase 预期新增 2 行 H-A（§五 5.1），并把下面两条并入已有行的说明**（**不新开**）：

| 序号 | 并入哪一行 | 追加什么 | 为什么本 Phase 验不了 |
|---|---|---|---|
| a | **`H-10`**（附件文档链端到端） | 若 §四 4.7 确认"渲染端仍无调用点"，则**明确写**：*源码层不可达 ⇒ 该功能是否要补 UI 入口，属产品判断* | 需要真实界面 |
| b | **`H-15`**（依赖树） | 🔴 **本 Phase 的主要销账点**：装完后把 `H-15` 的状态从 `🚫 环境受阻` 改为 **`[x] 已闭合`**，证据 = `install.log` + 锁文件未变 + 三个包版本 + 复跑基线 | 本 Phase **必须**销它；若 `--frozen-lockfile` 失败 ⇒ 保持 `🚫` 并写清原因（**不许静默降级**） |

> 📌 **唯一真值在 `HUMAN-人工验证台账.md`**；本节**只给索引、不复制结论**。

---

## 六、验收测试

> **判据分三段**：**安装段（A1–A3）** → **基线段（A4–A6）** → **核验段（A7–A12）**。
> 每条都给：命令 + 期望 + 失败处置。**安装段的判据必须带"运行痕迹"（判据 J-23）**。

### 安装段

#### A1 · `pnpm install --frozen-lockfile` 成功

```bash
cd /e/AI_Chating/cyrene-agent
grep '# \[运行痕迹\]' .cyrene-merge-analysis/heb-p5/install.log || echo "缺少运行痕迹"
tail -3 .cyrene-merge-analysis/heb-p5/install.log
```

| 期望 | 失败处置 |
|---|---|
| 安装日志**含 `exit=0`** 的运行痕迹行（**不是只看"命令跑完了"**） | 非 0 ⇒ 🔴 **S2 停工**；**不许**降级成不带 `--frozen-lockfile` 的安装 |

> 📌 **必须把 exit code 追加进日志**（脚本见 §四 4.3）：**`pnpm install` 成功时的输出可能很短**，
> 不追加退出码就会出现 P3 那种"0 字节日志无法自证"的问题（**J-23**）。

#### A2 · **锁文件未被改写**（H-15 的成立条件）★

```bash
cd /e/AI_Chating/cyrene-agent
git status --porcelain -- pnpm-lock.yaml pnpm-workspace.yaml package.json     # 期望：（无输出）
git rev-parse HEAD:pnpm-lock.yaml ; git hash-object pnpm-lock.yaml
```

| 期望 | 失败处置 |
|---|---|
| `git status` 对这三个文件**无输出** | 有 `M` ⇒ 🔴 **S3 停工**：`git checkout -- pnpm-lock.yaml` 复原，重查用了什么命令 |
| `HEAD:pnpm-lock.yaml` 的 blob 与工作区一致 | 同上 |

#### A3 · 三个缺包到位 + 工具链版本已记录

```bash
cd /e/AI_Chating/cyrene-agent
for p in @mantine/core @mantine/hooks @tanstack/react-virtual; do
  node -e "console.log('$p', require('./node_modules/$p/package.json').version)"
done
for p in typescript vitest vite electron esbuild; do
  node -e "console.log('$p', require('./node_modules/$p/package.json').version)"
done
echo "files=$(find node_modules -type f | wc -l)  size=$(du -sh node_modules | cut -f1)"
```

| 期望 | 失败处置 |
|---|---|
| 三个包各打印版本 | 缺 ⇒ 重查 `install.log`；若 lockfile 里根本没有它们 ⇒ 🔴 停工（说明锁文件与 `package.json` 不一致） |
| **`typescript` 版本被明确记录**（`5.9.3` 或 `6.x`） | 若是 `6.x` ⇒ **单独一节**记录（判据 **J-17**：TS 升级是独立变更源） |
| 依赖树规模合理 | 与 P1 的 132037 对比；**大幅变小** ⇒ 可能装漏（如 `--prod`） |

### 基线段

#### A4 · 三套编译（**main / preload 必须仍 0 错；renderer 4 → 0**）★

```bash
cd /e/AI_Chating/cyrene-agent
for c in main preload renderer; do
  f=.cyrene-merge-analysis/heb-p5/after-tsconfig.$c.log
  printf "  %-9s %s  痕迹: %s\n" "$c" "$(grep -c 'error TS' $f) 个 error TS" "$(grep -o '# \[运行痕迹\].*' $f)"
done
```

| | 装前 | 期望（装后） | 失败处置 |
|---|---|---|---|
| `main` | 0 | **0** | 🔴 **S5 停工**（全绿格变红 ⇒ 只能归因工具链） |
| `preload` | 0 | **0** | 同上 |
| `renderer` | **4** | **0** | 🔴 **S4 停工**；先看是否是 TS 版本变化（`error TS` 的**种类**会不同：缺包是 `TS2307`） |
| 痕迹行 | — | 三份**都**有 `exit=` 与 `errorTS=` | 缺 ⇒ 按 **J-23** 重跑并追加 |

#### A5 · 全量测试（**4 个加载失败文件 → 0；失败仍只有 `class-name-contract`**）★

```bash
cd /e/AI_Chating/cyrene-agent
f=.cyrene-merge-analysis/heb-p5/fulltest.log
grep -E 'Test Files|Tests  |Failed Tests' $f | tail -3
echo "--- 加载失败（0 test）的文件 ---"
grep -oE '^\s*FAIL\s+\S+' $f | sort -u
grep -c '(0 test)' $f
grep -o '# \[运行痕迹\].*' $f
```

| 期望 | 失败处置 |
|---|---|
| `Test Files` = **1 failed \| 582 passed**（或更多 passed） | 若 >1 failed ⇒ 逐个看是否与本 Phase 改动面相关（本 Phase **不改源码** ⇒ 只能是"装包后新跑起来的文件里本来就红"） |
| `Tests` = **1 failed**，且**那 1 个是 `class-name-contract`** | 是别的 ⇒ 按 §九 坑 4 四步归因 |
| `(0 test)` 计数 = **0** | >0 ⇒ 缺的不是那 3 个包 ⇒ 重查 `install.log` 与 lockfile |

> ✅ **不算失败**：① `class-name-contract` 仍红（**既有欠账**，P3 已归因）；② passed 数**上升**（装包后那 4 个文件开始跑）；③ `skipped` 变化（外部依赖可用性）。

#### A6 · `work-verification-closure.test.ts` 单跑（**它对 PATH 上的 pnpm 敏感**）

```bash
cd /e/AI_Chating/cyrene-agent
./.node24/node.exe node_modules/vitest/vitest.mjs run src/main/orchestrator/work-verification-closure.test.ts 2>&1 | tail -6
```

| 期望 | 失败处置 |
|---|---|
| **9 passed**（实测基线） | 红 ⇒ 先看日志里 runner 解析到的 **executable 路径**；按 §九 坑 5 处理（**先探测 pnpm，再决定是否前置 `.node24`**） |

### 核验段

#### A7 · 文件层：**94 = 91 + 3** 逐条判定 ★

```bash
cd /e/AI_Chating/cyrene-agent
echo "仍在索引的（期望 0，含 3 个 DU 豁免）: $(grep -c 'STILL-TRACKED' .cyrene-merge-analysis/heb-p5/file-layer.txt)"
echo "18 条救回面缺失（期望 0）: （见 §四 4.5 ② 的输出）"
# 3 个 rename 的旧/新存在性（见 §四 4.5 ③）
```

| 期望 | 失败处置 |
|---|---|
| 91 条里**仍在索引的 = 0**（**豁免 3 个 DU 的磁盘未跟踪副本**） | >0 ⇒ 逐条查：是"该删没删"还是"该留被误判" ⇒ 若是后者 🔴 **S6 登记缺陷** |
| 18 条救回面**缺失 = 0** | >0 ⇒ 🔴 **S6**（M2 保护面被破坏） |
| 3 个 rename：**旧 absent / 新 PRESENT** | 不符 ⇒ 🔴 停工 |

> 🔴 **口径声明（必写进报告）**：本判据的分母是 **94**（"会从树上消失的路径"），
> **不是** P4 报告的 **88**（"官方树有、新树没有"）—— **两个口径不可互换**（判据 **J-22**）。

#### A8 · 符号层 · P3 的恢复面（**逐符号**）★

见 §四 4.6 ① 的脚本。| 期望：**缺失 = 0** | 失败 ⇒ 🔴 **S6 登记缺陷**（不许顺手补）。

#### A9 · 符号层 · **全仓 import 符号扫描**（P3 没做的新判据）★

见 §四 4.6 ② 的脚本。| 期望：可疑数 **= 0**（或全部能解释为"正则代理的已知漏报"） |

| 期望 | 失败处置 |
|---|---|
| 可疑 = 0，**且** A4 的三套编译全绿 | ✅ 符号层通过 |
| 可疑 > 0 但 `tsc` 全绿 | ⚠️ 大概率是**代理判据的漏报**（`export *` / 类型再导出）⇒ 逐条人工确认，**结论以 `tsc` 为准**，并在报告里写明"代理判据的已知盲区" |
| 可疑 > 0 且 `tsc` 有对应 `TS2305/TS2307` | 🔴 **真断口** ⇒ S6 |

#### A10 · 入口层：**11 项能力逐项"可达性"判定** ★

见 §四 4.7。| 期望：每项都能被归入 §四 4.7 判读规则的四类之一，**且"真 A56"项有明确结论** |

| 期望 | 失败处置 |
|---|---|
| `main = 0` 的项 **= 0** | 有 ⇒ 🔴 **S6**（能力已失） |
| `main ≥1 ∧ renderer = 0` 的项：**逐项给出"设计如此 or 入口被删"** | 判不了 ⇒ 登记 **H-C**（转 P6 人眼），**不要猜** |
| 附件链 3 个桥方法的 `renderer` 命中数被明确记录 | 若仍 = 0 ⇒ 按 P3 登记：**D3 由 P6 判定** |

#### A11 · 桥接层：IPC 三处对齐 ★

见 §四 4.8。| 期望：`ipc-contract.test.ts` **全通过**（痕迹行带 `exit=`） |

| 期望 | 失败处置 |
|---|---|
| 契约测试全绿 | 红 ⇒ 报错会指出**哪个 IPC 键**无使用点/重复注册 ⇒ 回到 `ipc-channels.ts` 或对应 handler |
| 三处计数无"塌陷"（如 `preload = 0`） | 有 ⇒ 🔴 **S6** |

#### A12 · 两项 H-A 的收口

| 期望 | 失败处置 |
|---|---|
| H-A-1 / H-A-2 **各有一个明确状态**：`[x] 已闭合`（人已答）或 `⏳ 待人眼`（挂起，写明去路） | **不允许"未知/待定"**（规范 §4.1.3；终态三值） |
| 台账里两行**前三列已预填**（要验什么 / 期望值 / 证据） | 缺 ⇒ 补 |

---

## 七、产出物清单

| 文件 | 内容 | 规模（估） |
|---|---|---|
| **`.cyrene-merge-analysis/heb-p5/install.log`** | 安装输出 + **`exit=` 运行痕迹** ★ H-15 的核心证据 | 数 KB |
| **`.cyrene-merge-analysis/heb-p5/before-baseline.txt`** | 装前三基线（对照物，**判据 D33 要求**） | < 1 KB |
| `.cyrene-merge-analysis/heb-p5/after-tsconfig.{main,preload,renderer}.log` | 装后三套编译 + **运行痕迹** | 3 × 数 KB |
| `.cyrene-merge-analysis/heb-p5/fulltest.log` | 装后全量测试 + 运行痕迹 | 数百 KB |
| `.cyrene-merge-analysis/heb-p5/ipc-contract.log` | 桥接层判据 + 运行痕迹 | 数 KB |
| **`.cyrene-merge-analysis/heb-p5/file-layer.txt`** | 文件层逐条判定（91 + 3） | 数 KB |
| **`.cyrene-merge-analysis/heb-p5/symbol-layer.txt`** | 符号层扫描输出（import 目标符号） | 数 KB |
| **`.cyrene-merge-analysis/heb-p5/entry-layer.txt`** | 入口层 11 项逐项表 | 数 KB |
| `.cyrene-merge-analysis/heb-p5/probe-*.mjs` | **可复跑**的核验脚本（symbols / import-symbols / entry） | 3 个 |
| **`PHASE-5-完成报告.md`** | 完成报告（10 节 + §十一 复核补正待填 + §十二 施工记录） | 文档 |
| （可选）`PHASE-5-保真核验报告.md` | 若核验结论复杂到需要独立成文（规范 §3.2 命名表内有此类型） | 文档 |

> 📌 **证据目录入库问题照旧**：`.cyrene-merge-analysis/heb-p5/**` **不在 `.gitignore` 白名单**
> （白名单只放开了 `heb-p1/*`）⇒ 默认**未跟踪**。**本 Phase 不改 `.gitignore`**（属计划外扩张）；
> 是否入库与 `heb-p2/3/4`、`heb-review-*` **一并留给结项**。

---

## 八、回退方法（**分级；每条写清代价与验证**）

| 级别 | 动作 | 适用 | 代价 | 怎么验成功 |
|---|---|---|---|---|
| **R-1 · 回退依赖树（改名法）** | `rm -rf node_modules && mv node_modules.bak node_modules` | 装坏了 / 想回到 P1 的依赖树 | **几秒**（同分区 rename）；**依赖树回到 132037 文件** | `find node_modules -type f \| wc -l` = **132037**；`node -e "require('typescript/package.json').version"` = **5.9.3** |
| **R-2 · 回退依赖树（备份法）** | `robocopy` 从 `E:\AI_Work\备份\cyrene-pre-P5-<日期>\node_modules` 回灌 | 用了 B 案（跨盘副本） | 数分钟 | 同 R-1 |
| **R-3 · 只回退锁文件** | `git checkout -- pnpm-lock.yaml` | 锁文件被误改（**S3**） | 无 | `git status --porcelain -- pnpm-lock.yaml` 空 |
| **R-4 · 回退本 Phase 的文档提交** | `git reset --soft HEAD~1` | 报告写错想重提 | 无内容损失 | `git log --oneline -1` 回到 `8ad59939`（或当时的上一笔） |
| **R-5 · 回退到 P4 收口点** | `git reset --hard 8ad59939`（或按角色：P4 收尾文档提交） | 本 Phase 的**全部**改动都要丢 | ⚠️ **会丢 `node_modules` 之外的一切未提交改动**（含本 Phase 生成的证据目录 —— 它们在 `??` 里，**`reset --hard` 不动未跟踪文件**，但 `git clean` 会） | `git rev-parse HEAD` = `8ad59939`；`??` 数不变 |
| **R-6 · 回退到合并前** | `git reset --hard p4-pre-commit`（= `9920635f`） | 整个合并要重做 | 🔴 **极端动作**：丢了 merge commit 之后的一切 | `git log --oneline -1` = `9920635f`；**注意 `wip/p3-src` 与 `p4-pre-commit` 都还在**（它们就是为这个场景留的） |
| **R-7 · 数据面** | 🔴 **本 Phase 无数据面动作**：**不运行应用**（所以不会触发 `%APPDATA%` 迁移）、不碰用户数据 | — | — | `%APPDATA%\live2d-cyrene` **未被触碰**（本 Phase 无运行期动作） |

> 🔴 **四条禁令（继承 P2–P4，本 Phase 同样适用）**：
> **① 不 `git clean`**（68 条 `??` 里含 B-01 三目录与 6 个证据目录）· **② 不 `stash`** · **③ 不 `merge --abort`**（合并已完成，无合并态可 abort）
> · **④ 不删 `wip/*` 与 `p4-pre-commit`** —— 它们是**本 Phase 核验的参照物**（§四 4.6 的入口层/符号层都要对它们比）。
> 🔴 **新增一条**：**⑤ 安装后、验收通过前，不要删 `node_modules.bak`** —— 它是本 Phase 唯一的依赖级回退点。

---

## 九、已知坑（本 Phase 相关 + 复现情况）

> 按 H/M/L 检索自 [BLUEPRINT-经验库-通用.md](../methodology/BLUEPRINT-经验库-通用.md) 与
> [BLUEPRINT-经验库-具体坑.md](../methodology/BLUEPRINT-经验库-具体坑.md)。

| # | 坑（键号） | 本 Phase 的风险点 | **规避写法（直接照做）** |
|---|---|---|---|
| 1 | 🔴 **"我不做基线就动手"**（**A51**） | 安装是**不可逆**动作；没有装前基线 ⇒ 装完无法判"修好了"还是"换了个坏法" | §四 4.2 **先落盘装前三基线**（判据 **D33**：对照物为空时判据毫无意义） |
| 2 | 🔴 **"前提缺失"被误归因为网络/权限**（**C37 / X20**） | `--frozen-lockfile` 失败最常见的**真实**原因是"**锁文件与 `package.json` 不一致**"，而不是网络 | 失败时**先读 `install.log` 的具体错误码**（`ERR_PNPM_OUTDATED_LOCKFILE` ⇒ 不一致；`ERR_PNPM_NO_LOCKFILE` ⇒ 没有锁文件）；**明确禁止**降级成不带 frozen 的安装 |
| 3 | 🔴 **安装期脚本白名单**（**X20 / E10**） | `onlyBuiltDependencies` 只列了 5 个包；**未被列出的包，其 `install`/`postinstall` 会被静默跳过** ⇒ "装完了但二进制没下" | ① 装完**必读 `install.log`** 里有没有 `ignored build scripts` 之类的提示；② **对产物下判据**而不是对退出码（`node_modules/electron/dist/electron.exe` 是否存在）；③ **不要**因为 `electron.exe` 缺失就去改白名单（**E10**：`electron@44` 已无 `postinstall`，二进制由 `require()` 懒下载） |
| 4 | **测试失败无法归因**（复核四步归因法，规范 §5.2） | A5 若红，容易误判为"合并坏了" | 四步：**(a)** 失败面是否落在本 Phase 改动面内（本 Phase **不改源码** ⇒ `git diff --stat HEAD -- <该目录>` 应为空）→ **(b)** 隔离复现（单跑该文件）→ **(c)** 机制命中 → **(d)** 修环境后是否转绿。**并先问：装前它是红的吗？** |
| 5 | **`$env:PATH` 不跨进程 ⇒ 解析到别的 pnpm**（**J-17 家族 / P3 偏差 6**） | `work-verification-closure.test.ts` 依赖 PATH 上的 `pnpm` | 🔴 **先探测**（§三 3.0 ⑥）；**P3 的"一定坏"结论本轮已被证伪**（实测 `pnpm -v` = 10.33.0，该测试 **9 passed**）⇒ **按实测写，不要照抄** |
| 6 | **两个变更源不叠加**（规范 §4.1.3 硬要求 5） | 安装（工具链）＋ 核验（证据）同处一个 Phase ⇒ 核验的红可能来自装包 | §三 3.2 的**顺序纪律**：**先复跑基线拿"装后态"，再开始核验**；报告里**基线段与核验段分节** |
| 7 | 🔴 **"全绿"必须自带运行痕迹**（**J-23**） | `tsc` / `vitest` 成功时**可能输出为空** | 每份日志**追加 `# [运行痕迹] … exit=<码> errorTS=<n>`**；引用绿格时**引用痕迹行**，不引用"文件存在" |
| 8 | **计数必须带口径**（**J-22**） | 核验面 **94** vs P4 的 **88** vs P2 的 **95/98** | 报告里每个数字**写清"怎么数出来的 + 在哪个 rev 上数的"**；**94/88/95 三个数都要出现且各自注明口径** |
| 9 | **快照/镜像的校验要证"完备"不只"自洽"**（**J-24**） | 若用 `wip/p3-src` 做参照物，必须同时问"它该包含的改动在不在" | 见 **J-24**；本 Phase 用它的方式是"**与 HEAD 逐文件比 blob**"，并**先声明它是 P3 出口的镜像** |
| 10 | **不要引用会移动的 `HEAD`**（**J-25**） | 报告里写"HEAD = xxx"会在下一次文档提交后失效 | 固定点一律用 **`9cceeeac`**（merge commit）；`HEAD` 只写"角色名 + 现取命令" |
| 11 | **PowerShell / bash 混用与 CRLF**（**C43 / 本轮复核实测**） | 在本仓（`core.autocrlf=true`）用只认 `\n` 的字符串判断会**静默失败** | 读写文本一律 **`split(/\r?\n/)` 且写回保留原 EOL**；**校验"某行是否以 `\|` 结尾"这类判断必须先 strip `\r`** |
| 12 | **非 ASCII 文件名**（规范 §2.1） | 逐文件脚本复制会**静默丢文件** | 遍历一律用 `git ls-files` / `ls-tree -z`；复制用 `robocopy` **或直接用 rename** |

### 本 Phase **预计会新出现**的两条（建议入经验库，见 §十二 T4）

| 新坑 | 一句话 | 建议级 |
|---|---|---|
| **"装依赖"与"核验保真"必须切成两个证据段** | 两者同处一个 Phase 时，**先装后验**的顺序一旦颠倒，核验里任何一个红都可能来自"缺包"，**归因链条直接断掉** | **M** |
| **锁文件的双版本（TS 5.4.5 与 6.0.3 并存）会让"安装"变成两个变更源** | `--frozen-lockfile` 落哪个版本**不由执行者决定**；若它顺带升了 TS，则"4 错 → 0 错"里**混着两个原因**，必须分列 | **M** |

---

## 十、给下一个 Phase 的交接提示（**P6 运行期验证与收口**）

1. 🔴 **P6 的第一件事：外部备份 `%APPDATA%\live2d-cyrene`** —— 合并后的**首次启动会把这个目录整体重命名**到新位置
   （官方 `src/main/user-data-migration.ts` 的 `renamed` 分支）。**备份前不要启动应用**。
2. 🔴 **P6 是"人眼 + 真实渠道"的阶段**：`H-10`（附件链端到端）· `H-11`（5 项入口）· `H-12`（设置页各面板 + 日语回退中文）·
   `H-13`（记忆模式 × 本地域过滤）· `H-14`（真实渠道：QQ / NapCat，缺则记 `🚫 无法验（缺 真实渠道）`，**不要填 ❌**）。
3. 🔴 **本 Phase 新增的 H-A 两项**（渠道 4 文件 / 孤儿模块）**若仍未闭合 ⇒ P6 必须一并收口**（不许留给结项）。
4. ⚠️ **不要**为了 `class-name-contract` 变绿去改测试或 CSS（**既有欠账**，需独立判断；可选：登记 BACKLOG）。
5. ⚠️ **不要**动 `resources.test.ts` 的 `PARTIAL_LOCALES["ja-JP"] = 377`（**增加即失败、减少要同步下调**）。
6. ⚠️ **引用固定点用 `9cceeeac`**（merge commit），不要用 `HEAD`（判据 **J-25**）。
7. ⚠️ **门禁命令**：`pnpm` 先探测；失败再 `PATH=<仓库>/.node24:$PATH` 前置（**P3 的"必坏"结论已证伪**，按实测写）。
8. ⚠️ **`wip/*` 与 `p4-pre-commit` 仍然保留**（核验参照物）；结项时一并决定删除。
9. ⚠️ **`node_modules.bak` 若还在** ⇒ 说明 R-1 的回退点仍有效；**结项时删**。

---

## 十一、改动的目标达成核对（**执行后回填**）

| 目标（§1.2） | 状态 | 证据（命令 + 输出 / 数字） |
|---|---|---|
| **T1** 销 H-15（frozen 安装成功 + 锁文件未变） | ⬜ | `install.log` 痕迹行：______ · 锁文件 status：______ |
| **T2** 回退路径已建（且验证可用） | ⬜ | 方案 A/B：______ · 回退验证：______ |
| **T3** 装后复跑三基线 | ⬜ | renderer：__→__ · 全量：__→__ · 加载失败：__→__ |
| **T4** 文件层 94 条逐条判定 | ⬜ | 仍在索引 = __ · 救回面缺失 = __ · rename 3/3 = __ |
| **T5** 符号层（P3 恢复面逐符号 + 全仓扫描） | ⬜ | 逐符号缺失 = __ · 扫描可疑 = __ |
| **T6** 入口层 11 项可达性 | ⬜ | `main=0` 的项 = __ · 真 A56 项 = __ |
| **T7** 桥接层 IPC 三处对齐 | ⬜ | 契约测试：__ · 三处计数：__/__/__ |
| **T8** 残余不确定性已声明 | ⬜ | 见报告 §十 |
| **T9** 两项 H-A 有明确状态 | ⬜ | H-A-1：__ · H-A-2：__ |
| **T10** 核验脚本可复跑 | ⬜ | `probe-*.mjs` 数量：__ |

**非目标遵守情况**：⬜ 未升 TS（或：升了并单列）· ⬜ 未改源码 · ⬜ 未 `git clean` · ⬜ 未推远端 · ⬜ 未运行应用 · ⬜ 未删 `wip/*`

**人工环节达成核对**：⬜ 台账新增 H-A 两行且前三列已预填 · ⬜ `H-15` 状态已更新 · ⬜ §五 5.3 两条已并入 `H-10` / `H-15`

**回写清单已闭合**：⬜（见完成报告 §十）

---

## 十二、施工记录（**执行者追加**，见规范 §8）

> 子节按需增减，**1 / 2 / 4 / 5 为必需**。
> 0 · 人工环节回执（索引，**不复制结论**）
> 1 · 偏离蓝图之处
> 2 · 蓝图未覆盖、施工中发现的漏洞
> 4 · 有意保留的"不处理"点
> 5 · 验收（实测数字，**每个数字带口径与时点**）
> 6 · 待做 / 未做
> 🆕 **9 · 安装段的"两列对照"**（装前 / 装后各一个数，**这是本 Phase 归因能力的关键**）
> 🆕 **10 · 四层核验的逐层结论**（每层：判据 / 读数 / 判定 / 残余不确定）

---

## 附：本蓝图的证据来源与可复算声明

| 证据 | 来源 | 复现方式 |
|---|---|---|
| 起点状态（HEAD / 冲突 0 / `??` 68） | 本机实测（2026-10-12/13） | §二 E1 |
| 锁文件 601159 B / `lockfileVersion 9.0` / TS 双版本 | 本机实测 | §二 E2；`grep -E '^  typescript@' pnpm-lock.yaml` |
| `node_modules` 132037 文件 / 2.4 GB | 本机实测 | §二 E2 |
| 三个缺包 | 本机实测 | `test -d node_modules/@mantine/core` 等 |
| renderer 4 错 / 全量 1 失败 + 4 加载失败 | **P3 完成报告 §三 + 复核 §十一**（带 `[运行痕迹]`） | `.cyrene-merge-analysis/heb-p3/*.log` |
| 91 = 16 UD + 75 静默；98 = 95 + 3 rename | **P2 复核 §十一 11.6**（判据 **J-22**） | `.cyrene-merge-analysis/heb-review-p2/{ud-set,silent-set,official-deletions}.txt` |
| 11 项基线读数 7/8/5/11/13/9/10/5/2/9/4 | **P4 完成报告 §三 A9** | `git grep -l <标识> HEAD -- src` |
| 渠道 4 文件与删除出处 `598dfb75` | **P4 完成报告 §五 5.4 + §十二 12.9** | `git log -1 --diff-filter=D -- <path>` |
| `embedding-index-service` 消费者 = 0 | **P3 完成报告 §五 偏差 3** | `git grep -l embedding-index-service HEAD -- src` |
| `work-verification-closure.test.ts` = **9 passed**；`pnpm -v` = **10.33.0** | **本机实测（P5 蓝图起草时）** | §二 E6 |
| 磁盘 450 GB 可用 | 本机实测 | `df -h /e` |

> 🔴 **本蓝图的已知不确定性（如实声明）**：
> ① **`pnpm install --frozen-lockfile` 的实际结果未知** —— 它在**本仓库历史上从未成功跑过**（P1 因无锁文件而结构性失败）。
>    本蓝图给的是**判据与失败处置**，不是"它一定会成功"的承诺。**若失败，按 S2 停工并如实记录**。
> ② **TypeScript 会落到 5.9.3 还是 6.0.3 未知** —— lockfile 里两个条目都在（§二 E2）。**这不是本蓝图能预测的**，
>    所以把它写成"**必须记录 + 若变化则单列**"，而不是"假定不变"。
> ③ **四层核验的"入口层"含人工判断成分** —— "`main ≥1 ∧ renderer = 0`" 到底是"设计如此"还是"入口被删"，
>    **正则判不了**。本蓝图把它写成"**逐项给出结论或登记 H-C**"，并明确**不许猜**。
> ④ **符号层的 `import` 扫描是代理判据**（会漏 `export *` / 类型再导出），**以 `tsc` 为交叉验证**（§四 4.6 末）。
