# Phase 3 施工蓝图：冲突消解 · 真冲突类（20 个 UU / 40 个冲突块）

> **执行者**：agent。本文件自包含，不需要对话历史即可执行。
> **风险等级**：**中—高**（本 Phase 是全任务**唯一真正改动源码内容**的阶段；改动面 = 20 个双方都改过的文件）
> **预计耗时**：**150–240 分钟**（含逐块处置 + 逐块编译 + 全量测试）
> **文档规范**：见 `../methodology/BLUEPRINT-撰写规范.md` §4（**跨目录相对路径，不写裸文件名**）
> **前置**：P2（删改类消解）已完成并复核；**当前仓库处于"合并进行中"**（`MERGE_HEAD` 在场）

> ⚠️ **本 Phase 与"常规阶段"的根本差别**：树**不是干净的**、**不能提交**、**不能 abort**。
> 执行者面对的是**一个已经跑起来、停在半路的 `git merge`**。
> 任何"先 `git status` 清一清再开工"的直觉动作都**会毁掉 P2 的全部成果** —— 请先读完 §三 的停止条件再动手。

---

## 一、施工目标

### 1.1 核心问题（带 `file:line` 根因）

`git merge --no-commit --no-ff official-target-8fe5ba7a^{commit}` 已由 **P2** 启动（见 `PHASE-2-完成报告.md` §三 3.2）。
P2 只处置了**删除 / 保留**这类不需要读内容的冲突（UD 16 / DU 4 / 静默删除面），**一个 UU 都没碰**。

剩余 **20 个文件被双方都改过**，git 把它们标成 `UU` 并**在文件里写入了冲突标记**，实测：

```text
UU 文件数        = 20      （git diff --name-only --diff-filter=U）
冲突块总数       = 40      （逐文件数 ^<<<<<<< 标记，见 §二 E2 的逐块表）
含冲突标记的文件 = 22      = 这 20 个 + 2 个 P0 既有证据文件（见 §六 A1 的例外）
```

**根因**：这 20 个文件正好是"**我们新增功能**"与"**官方 1.3.0 重构**"**在同一段代码上相遇**"的地方 ——
它们不是"误改同一行"，而是**两边都在往同一个位置加东西**（实测 40 块里 **19 块是"双方各自新增"**，见 §二 E3）。

### 1.2 目标清单（可勾选）

| # | 目标 | 判据出处 |
|---|---|---|
| **T1** | **逐块处置 40 个冲突块**，按 §四 的**七类处置模式**给出判定，每块写清"取谁 / 为什么" | §四 4.2 + §六 A2/A3 |
| **T2** | 🔴 **保住我方新增功能**：11 项功能基线与 18 个救回链**一个不丢**（总蓝图 §七 + **M2 / J-04**） | §六 A4 / A5 |
| **T3** | 🔴 **收下官方全部新能力**：`memoryMode` 三模式、knowledge-base、wiki-memory、subagent / browser 设置页、compaction 相位事件等 | §四 4.2 逐块表 |
| **T4** | **处置 6 个静默重叠区**（git 自动合并了，但双方改动行区间相交 ⇒ 必须**人工确认"我方那部分还在"**） | §六 A7 + §二 E4 |
| **T5** | 🔴 **不引入对已删文件的引用**：17 个删除目标的 import/引用必须为 **0**；18 个救回模块**必须有消费者**（不许孤儿） | §六 A5 / A6 |
| **T6** | **三套编译全绿**：`tsconfig.main` / `.preload` / `.renderer` 各 **exit 0 / 0 个 `error TS`**（与 P1 基线同口径） | §六 A8 |
| **T7** | **全量测试基线不退化**：563 文件 / 5433 通过 / 1 skipped（P1 基线），且**允许按本 Phase 的删除面归因**（J-02 口径） | §六 A9 |
| **T8** | **产出可复跑的"处置清单"**（逐块：文件 / 块号 / 行号 / 取哪侧 / 一句话理由），供 P4 提交与 P5 保真核验消费 | §七 |
| **T9** | **P3 源码快照**（`wip/p3-src`，**兜底**，防 P4 提交前误操作） | §四 4.5 + §七 |

### 1.3 非目标（**明确不做**）

| 不做 | 为什么 | 何时做 |
|---|---|---|
| 🔴 **不提交**（不 `git commit`、不 `merge --continue`） | **M7 分步合并**：提交点固定在 **P4 末尾**；本 Phase 出口 = "冲突全解、索引就绪、**仍未提交**" | **P4** |
| 🔴 **不 `merge --abort` / 不重新 `merge` / 不 `git stash`** | 会**销毁 P2 的 18 个救回**与整个合并状态（见 §三 S3） | 永不（要中断就**停工**） |
| **不动 17 个删除目标与 18 个救回文件** | P2 已按 §四 4.3/4.4 处置完毕；本 Phase 只**消费**它们（检查引用面），**不再增删** | — |
| **不新增/删除任何文件** | 文件级取舍已在 P2 完成；本 Phase 只改**已有 20 个文件的内容** | — |
| **不跑 `pnpm install`** | 依赖安装属**工具链**，与冲突消解是**两个变更源**；混在本 Phase 会**无法归因**（规范 §4.1.3 硬要求 5）。`pnpm-lock.yaml` 已随合并进索引，**P1 的 `node_modules` 已实测满足**（vitest/vite/electron/esbuild 版本与官方 lockfile 一致，唯一例外 TS，见 §九 坑 6） | **P5**（若需要） |
| **不改 `tsconfig.*.json` / `vite.config.mts` / `electron-builder.yml`** | 它们**不是 UU**（索引态 `M `），合并已自动取官方版本 —— 属**已完成的合并结果**，本 Phase **不二次改动** | — |
| **不做 P5 的保真核验** | 那是**独立分层核验**（文件层/符号层/入口层/桥接层），需另一个视角 | **P5** |
| **不清理 66 个未跟踪条目** | 其中 3 个是 **B-01** 登记在案的遗留、其余是合并本身带来的；**禁用 `git clean`** | **P5 / 结项** |

---

## 二、实测证据（决定本 Phase 做法，**执行前请读**）★

> 全部数据测于 **2026-10-04**，起点 `HEAD = 9920635f`、`MERGE_HEAD = 8fe5ba7a5b3a86043b8034abeaa98f72f7459039`、
> merge-base = `b11b8851`。复现命令一律在 §二 各条给出。

### E1 · 冲突面（精确值）

```powershell
$R = "E:\AI_Chating\cyrene-agent"
git -C $R diff --name-only --diff-filter=U            # → 20 行
git -C $R status --porcelain | Where-Object { $_.Substring(0,2) -eq 'UU' }   # → 20 行
```

| 量 | 实测 | 口径 |
|---|---|---|
| UU 文件 | **20** | `diff --diff-filter=U` |
| 冲突块 | **40** | 逐文件数 `^<<<<<<< `（**逐块表见 E2**） |
| 含标记的文件 | **22** | `git grep -l -E '^<<<<<<< '` = 20 UU + 2 个 **P0 既有证据文件**（§六 A1 例外） |
| UD / DU 残留 | **0 / 0** | P2 已清空 |
| `MERGE_HEAD` | **在场** | `Test-Path .git\MERGE_HEAD` = `True` |

### E2 · **逐块表**（本 Phase 的作业面，40 行）★

> **列义**：`块@行` = 冲突块起始行（`<<<<<<<` 那一行）；
> `我/官` = 该侧行数；**`基线`** 列由"该侧首行是否出现在 merge-base 版本里"机械判定
> （`O=base` = 我方那侧仍是基线内容 ⇒ **只有官方在改这块**；`双方新` = 两边都是新内容 ⇒ **必须并集**）。

| # | 文件 | 块@行 | 我 | 官 | 基线判定 | 模式（§四 4.1） |
|---|---|---|---|---|---|---|
| 1 | `README.md` | #1 @137 | 14 | 1 | `O=base` | **P3** |
| 2 | `package.json` | #1 @2 | 2 | 9 | `T=base` | **P5 变体**（见 §四 4.2 第 2 行） |
| 3 | `package.json` | #2 @178 | 8 | 0 | `O-only` | **P6** |
| 4 | `src/main/application/default-dependencies.ts` | #1 @46 | 4 | 3 | 双方新 | **P1** |
| 5 | `src/main/memory/memory-scheduler.ts` | #1 @12 | 2 | 2 | `O=base` | **P3** |
| 6 | `src/main/memory/memory-scheduler.ts` | #2 @56 | 7 | 2 | `O=base` | **P3+P5** |
| 7 | `src/main/memory/memory-scheduler.ts` | #3 @91 | 8 | 4 | `O=base` | **P3+P5** |
| 8 | `src/main/memory/memory-scheduler.ts` | #4 @114 | 14 | 3 | `O=base` | **P3+P5** |
| 9 | `src/main/memory/memory-user-ipc.ts` | #1 @9 | 11 | 1 | 双方新 | **P1** |
| 10 | `src/main/memory/memory-user-ipc.ts` | #2 @170 | 74 | 10 | `T=base` | **P2**（见 §四 4.2 第 9 行**陷阱**） |
| 11 | `src/main/orchestrator/agent-runtime.ts` | #1 @115 | 19 | 2 | 双方新 | **P1** |
| 12 | `src/main/orchestrator/build-options.test.ts` | #1 @829 | 39 | 4 | 双方新 | **P1** |
| 13 | `src/main/orchestrator/build-options.ts` | #1 @222 | 6 | 9 | `O=base` | **P3** |
| 14 | `src/main/orchestrator/build-options.ts` | #2 @1192 | 8 | 2 | 双方新 | **P1** |
| 15 | `src/main/orchestrator/build-options.ts` | #3 @1231 | 9 | 13 | `双方base` | **P7**（见 §四 4.2 第 13 行） |
| 16 | `src/main/orchestrator/context-builder.ts` | #1 @3 | 15 | 5 | 双方新 | **P3** |
| 17 | `src/main/orchestrator/index.ts` | #1 @11 | 4 | 1 | 双方新 | **P1** |
| 18 | `src/main/orchestrator/index.ts` | #2 @40 | 1 | 1 | 双方新 | **P7** |
| 19 | `src/main/orchestrator/index.ts` | #3 @72 | 17 | 2 | `双方base` | **P2**（保住我方限域调用） |
| 20 | `src/main/orchestrator/index.ts` | #4 @163 | 57 | 32 | 双方新 | **P2**（保住我方群聊上下文块） |
| 21 | `src/main/orchestrator/tools/history-tools.ts` | #1 @14 | 1 | 1 | 双方新 | **P1** |
| 22 | `src/main/orchestrator/tools/history-tools.ts` | #2 @77 | 1 | 2 | `O=base` | **P4**（守卫下加回 `ctx`） |
| 23 | `src/main/orchestrator/tools/registry/tool-registry.ts` | #1 @240 | 4 | 3 | `双方base` | **P4** |
| 24 | `src/main/orchestrator/tools/registry/tool-registry.ts` | #2 @388 | 9 | 5 | `双方base` | **P4** |
| 25 | `src/main/rag/index.ts` | #1 @15 | 1 | 1 | 双方新 | **P1** |
| 26 | `src/main/rag/index.ts` | #2 @296 | 6 | 6 | 双方新 | **P1** |
| 27 | `src/main/rag/index.ts` | #3 @408 | 14 | 11 | `O=base` | **P7** |
| 28 | `src/main/rag/index.ts` | #4 @497 | 8 | 2 | `O=base` | **P2**（保住导入文档检索） |
| 29 | `src/main/rag/index.ts` | #5 @549 | 24 | 0 | `O-only` | **P6** |
| 30 | `src/main/settings/settings-facade.ts` | #1 @186 | 1 | 9 | 双方新 | **P1** |
| 31 | `src/preload/index.ts` | #1 @861 | 4 | 12 | 双方新 | **P1** |
| 32 | `src/renderer/react/features/settings/AppearanceSettingsPage.tsx` | #1 @3 | 1 | 1 | 双方新 | **P1** |
| 33 | `.../AppearanceSettingsPage.tsx` | #2 @42 | 1 | 2 | 双方新 | **P1** |
| 34 | `.../AppearanceSettingsPage.tsx` | #3 @88 | 1 | 1 | 双方新 | **P3** |
| 35 | `.../AppearanceSettingsPage.tsx` | #4 @282 | 1 | 1 | 双方新 | **P1** |
| 36 | `.../AppearanceSettingsPage.tsx` | #5 @304 | 2 | 2 | `O=base` | **P3**（见 §四 4.2 第 31 行**陷阱**） |
| 37 | `src/renderer/react/features/settings/MemorySettingsPanel.tsx` | #1 @11 | 2 | 1 | 双方新 | **P1** |
| 38 | `src/renderer/react/i18n/en.json` | #1 @1864 | 16 | 1 | `O=base` | **P3** |
| 39 | `src/renderer/react/i18n/zh-CN.json` | #1 @1864 | 16 | 1 | `O=base` | **P3** |
| 40 | `src/shared/ipc-channels.ts` | #1 @147 | 10 | 0 | `O-only` | **P6** |

**复现命令（生成上面这张表的同一脚本，口径可复算）**：

```powershell
$R = "E:\AI_Chating\cyrene-agent"; $base = 'b11b8851'
foreach ($f in (git -C $R diff --name-only --diff-filter=U)) {
  $lines = Get-Content -LiteralPath (Join-Path $R $f) -Encoding UTF8
  $baseText = git -C $R show "${base}:$f" 2>$null
  $i=0; $n=0
  while ($i -lt $lines.Count) {
    if ($lines[$i] -match '^<<<<<<< ') {
      $n++; $ours=@(); $theirs=@(); $mode='o'; $j=$i+1
      while ($j -lt $lines.Count -and $lines[$j] -notmatch '^>>>>>>> ') {
        if ($lines[$j] -match '^=======$') { $mode='t' }
        elseif ($lines[$j] -notmatch '^\|\|\|\|\|\|\| ') { if ($mode -eq 'o') { $ours+=$lines[$j] } else { $theirs+=$lines[$j] } }
        $j++
      }
      $oIn = ($ours.Count -gt 0) -and ($baseText -contains $ours[0])
      $tIn = ($theirs.Count -gt 0) -and ($baseText -contains $theirs[0])
      "{0} #{1} @L{2} ours={3} theirs={4} oInBase={5} tInBase={6}" -f $f,$n,($i+1),$ours.Count,$theirs.Count,$oIn,$tIn
      $i=$j
    } else { $i++ }
  }
}
```

> 🔴 **`-Encoding UTF8` 必须写**：本仓是 Windows + `core.autocrlf=true`，不写编码时 `Get-Content` 按 ANSI 读，
> 中文会变乱码，而**乱码不影响 `Contains` 判定**（比的是同一份内存文本）——
> 但**人会看不懂自己的输出**，等于把一条判据变成不可复核（经验 **C48** 同族：**探针要能被人复核**）。

### E3 · 40 块的构成（决定 §四 的七类模式）

| 构成 | 块数 | 含义 |
|---|---|---|
| **双方各自新增**（`双方新` 19 + `双方base` 4 = **23**） | **23** | ⚠️ **必须并集**：取任何一侧 = **直接删掉另一侧的功能** |
| `T=base`（**只有我方在改**） | **5** | 官方那侧仍是基线 ⇒ 我方新功能**不能丢**；官方在这块**无主张** |
| `O=base`（**只有官方在改**） | **9** | 我方那侧仍是基线 ⇒ **收下官方**；但**注意别把我们的相邻新增一起丢掉** |
| `O-only`（官方删成空） | **3** | 官方**删掉了**这段 ⇒ 默认接受删除，**但必须先确认"我们为什么加它"** |

### E4 · 静默重叠区（git 不报冲突，但双方改动行区间相交）★

> **定义**：git 把两侧改动**自动合并**了，**没有写冲突标记** —— 但两侧的改动**行区间相交**，
> 于是**有可能**出现"自动合并按某一侧赢、另一侧的内容静默消失"。**必须逐个人工确认我方那部分还在。**

> 🔴 **蓝图的"8 个"与实测不符，本文档按实测改写（见 §二 E7 第 2 行）**。
> **实测（判据：该文件"我方 `b11b8851..HEAD` 有改动" ∧ "官方 `b11b8851..目标` 有改动" ∧ "git 未报冲突"）= 9 个文件**，
> 其中 **6 个需要人工确认**、**3 个是 P2 已确认的空操作**（见 §二 E5）。**原蓝图的"8 个"漏了 `core-bootstrap.ts`。**

| # | 文件 | 我方改动 | 官方改动 | 自动合并后**必须确认还在的** |
|---|---|---|---|---|
| 1 | `src/main/application/core-bootstrap.test.ts` | `+243 −218` | `+0 −1` | **我方 243 行新测试仍在**（官方只删 1 行） |
| 2 | 🆕 `src/main/application/core-bootstrap.ts` | `+0 −1` | `+3 −1` | ⚠️ **被原蓝图漏掉的一个**：我方只删 1 行、官方改 4 行 ⇒ 风险低，**但仍要确认我方那 1 行删除是有意的**（它可能是我方删掉的某个 1.2.2 遗留） |
| 3 | `src/main/chats/chat-ui-ipc.ts` | `+22 −1` | `+12 −29` | 🔴 **我方对 `document-index-{ipc,queue,worker}` 的 import 与调用仍在**（M2/J-04 的**入口**，**优先级最高**） |
| 4 | `src/main/settings/general-settings.ts` | `+206 −189` | `+14 −9` | **我方 206 行新增仍在**，且 official 14 行也已并入 |
| 5 | `src/main/settings/settings-facade.test.ts` | `+20 −0` | `+16 −4` | **我方 20 行 `groupContextLimit` 边界用例仍在**（实测 `settings-facade.test.ts:85-99` 共 8 条） |
| 6 | `src/renderer/settings/shared/types.ts` | `+217 −20` | `+362 −350` | **我方 217 行新增仍在**（该文件是**9 个新文件的 hub**，总蓝图 §9.5） |

```powershell
# 逐个人工核对（不可只看 status 的 M ）
foreach ($f in 'src/main/application/core-bootstrap.test.ts','src/main/chats/chat-ui-ipc.ts','src/main/settings/general-settings.ts','src/main/settings/settings-facade.test.ts','src/renderer/settings/shared/types.ts') {
  "--- $f"
  git -C $R grep -c 'document-index\|groupContextLimit' -- $f      # 我方标识必须 ≥1
  git -C $R diff --numstat b11b8851 HEAD -- $f                     # 我方改动规模（对照上表）
}
```

### E5 · 3 个"看着像重叠、其实是空操作"的文件（**P2 已确认，本 Phase 不处理**）

`src/renderer/settings/api/state.ts` · `memory/panel.ts` · `preferences/panel.ts`
—— 三者在 **`598dfb75`（本任务之前）已被我方删除**，官方也删（官方删除集内）
⇒ 双方都删 ⇒ 合并中**什么都不发生**，它们**当前不在索引里**（`ls-files --error-unmatch` → exit ≠ 0）。
🔴 **不要**因为"蓝图 §9.4 写过 8 个重叠文件"就去"找回"这三个（那会把已删文件复活）。
依据：`PHASE-2-完成报告.md` §五 偏差 2；判据 **J-22**。

### E6 · 3 个 rename（合并带进来的，**不是冲突**，但 P3/P5 都要知道）

```text
R091  src/main/orchestrator/tools/search-code-tools.test.ts -> src/main/orchestrator/tools/search-text-tools.test.ts
R089  src/main/orchestrator/tools/search-code-tools.ts      -> src/main/orchestrator/tools/search-text-tools.ts
R100  vitest.config.ts                                      -> vitest.config.mts
```

🔴 **`vitest.config.ts` 不许"改回去"** —— 它是**合并内容**，是官方的**有意改名**。
🔴 **P5 的核验面按 91 + 3 算**（判据 **J-22**）：这 3 个旧路径**也会从树上消失**，但 `git diff` 报 `R` 不报 `D`。

### E7 · 被推翻的原计划（**不要按旧描述执行**）

| 原计划（P0/P1/P2 文档里的旧说法） | 实测结论 | 新做法 |
|---|---|---|
| "P3 处置 20 个 UU" | ✅ 成立，但**粒度错了**：真正的作业面是 **40 个冲突块**，20 只是文件数 | §四 4.2 **逐块**处置，逐块记录 |
| "8 个静默重叠区" | ❌ **实测 9 个"双方都改过且未冲突"的文件**，其中 **6 个需人工确认**（原清单**漏了 `core-bootstrap.ts`**），另 3 个是空操作（E5） | §四 4.4 只查这 **6** 个 |
| "P3 结束时跑三套 `tsc` 全绿" | ✅ 成立（P2 没能跑是因为救回文件的引用者全在 UU 里，现在解完就能跑） | §六 A8 |
| "P3 完成后不提交" | ✅ 成立（M7）；但**必须留一个源码快照**，否则 P4 提交前的任何误操作都无从恢复 | §四 4.5 |
| "P3 顺手把 TS 升到 6" | ❌ **明确禁止**（判据 **J-17**）：TS 升级属**工具链变更**，与冲突消解是**两个变更源**（规范 §4.1.3 硬要求 5） | §九 坑 6；留给 P5 单独做 |

### E8 · 两个变更源的边界（**本 Phase 只碰"内容"**）

| 变更源 | 内容 | 本 Phase 是否碰 |
|---|---|---|
| **冲突消解** | 20 个 UU 文件的内容 | ✅ **本 Phase 的唯一工作面** |
| **工具链** | `package.json` 的 deps/scripts、`tsconfig.*`、`vite.config.mts`、`pnpm-lock.yaml`、Node 版本、TS 版本 | ⚠️ **只处置 `package.json` 这 2 个块**（它本身就是 UU ⇒ 属冲突消解）；**其余一律不动** |

---

## 三、前置条件与停止条件

### 3.0 前置条件（**不满足则不得开始**）

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$R   = "E:\AI_Chating\cyrene-agent"
$D   = Join-Path $R 'docs\construction\HEB-1.3.0\TASK-H1.3.0'
$N24 = Join-Path $R '.node24\node.exe'          # 🔴 P1 教训：门禁一律全路径（$env:PATH 不跨进程）
$TSC = Join-Path $R 'node_modules\typescript\lib\tsc.js'

# ① 上阶段（P2）完成报告的"回写清单"无未勾选项 —— 期望：0 行
#    ⚠️ 判据写法：找"表格行且含未勾选记号"的行。此处**不写出那个记号的字面**，
#       以免本蓝图自身被下阶段的前置判据命中（经验 D29 / J-05 / J-18）。
Select-String -Path (Join-Path $D 'PHASE-2-完成报告.md') -Pattern '^\|.*\[ \]' -Encoding UTF8

# ② 台账无未闭合拍板 —— 期望：0 行
Select-String -Path (Join-Path $D 'HUMAN-人工验证台账.md') -Pattern '^\|.*\[ \]' -Encoding UTF8

# ③ 🔴 合并仍在场（本 Phase 的**存在前提**）—— 期望：True
Test-Path (Join-Path $R '.git\MERGE_HEAD')

# ④ 🔴 HEAD 未被改动 —— 期望：9920635f52ca8c9e4b148a15c63e5135108dfdb0
git -C $R rev-parse HEAD

# ⑤ 🔴 MERGE_HEAD 是目标 —— 期望：8fe5ba7a5b3a86043b8034abeaa98f72f7459039
git -C $R rev-parse MERGE_HEAD

# ⑥ 冲突面恰为 20 个 UU —— 期望：20，且状态码分布只含 UU（无 UD / DU / AA / DD / AU / UA）
(git -C $R diff --name-only --diff-filter=U | Measure-Object).Count
git -C $R status --porcelain | ForEach-Object { $_.Substring(0,2) } | Group-Object | Format-Table Name,Count

# ⑦ 冲突块总数 —— 期望：40
$tot=0
foreach ($f in (git -C $R diff --name-only --diff-filter=U)) {
  $tot += ((Get-Content -LiteralPath (Join-Path $R $f) -Encoding UTF8 | Where-Object { $_ -match '^<<<<<<< ' }) | Measure-Object).Count
}
$tot

# ⑧ P1 三套编译基线仍在（本 Phase 的对照线）—— 期望：3 个 True
foreach ($c in 'main','preload','renderer') { Test-Path (Join-Path $R ".cyrene-merge-analysis\heb-p1\baseline-tsconfig.$c.log") }

# ⑨ 救回 18 / 删除 17 的索引态未被改动 —— 期望：18 个 rc=0；17 个 rc≠0
#    （完整清单见 .cyrene-merge-analysis/heb-p2/p2-disposition.txt，**只增不删**）

# ⑩ Node 24 与 tsc 入口可用 —— 期望：v24.21.0 / tsc.js 存在
& cmd /c "`"$N24`" -v"
Test-Path $TSC

# ⑪ WIP 阈值门禁（规范 §2.4）—— 见下方"本 Phase 的例外声明"
(git -C $R status --porcelain | Measure-Object).Count
```

| # | 前置条件 | 期望 | 不满足时 |
|---|---|---|---|
| ① | P2 报告回写清单已闭合 | 0 行 | **不得开始**：回写是"口径唯一来源"（规范 §5.1） |
| ② | 台账无未闭合 H-A 拍板 | 0 行 | **不得开始**：先要人拍板 |
| ③ | `MERGE_HEAD` 在场 | `True` | 🔴 **停工报告**：P2 的合并状态已丢，须重做 P2（§八 R-3） |
| ④ | HEAD = `9920635f` | 全等 | 🔴 **停工**：起点被改过，P2 的处置可能已被覆盖 |
| ⑤ | `MERGE_HEAD` = `8fe5ba7a…` | 全等 | 🔴 **停工**：合并目标变了 |
| ⑥ | 冲突面 = 20 UU | 20，且仅 `UU` | 🔴 **停工**：出现 `UD`/`DU` 说明 P2 成果被改；出现 `AA`/`DD` 说明有别的动作介入 |
| ⑦ | 冲突块 = 40 | 40 | ⚠️ **不立即停工**：**先按 J-21 归因** —— 差量能否 100% 归因到"已知的、本任务自己的改动"？能 ⇒ 照 §四 执行并记录偏差；不能 ⇒ 停工 |
| ⑧ | P1 三套基线日志在 | 3 × `True` | **停工**：没有对照线就无法判"编译是否退化"（J-14） |
| ⑨ | 救回 18 / 删除 17 未变 | 18 / 17 | 🔴 **停工**：P2 成果被动过 |
| ⑩ | Node 24 + `tsc.js` 可用 | v24.21.0 / True | **停工**：门禁跑不了 = 本 Phase 无法验收 |
| ⑪ | WIP 阈值门禁 | 见下 | — |

> 📌 **⑪ 本 Phase 对"WIP 阈值门禁"的例外声明（必须写明，否则执行者会误判）**：
> 规范 §2.4 要求"未提交改动 > 20 条 → 先提交再继续"。
> **本 Phase 结构性无法满足**：出口态 = **处在合并中的 727 项索引改动 + 20 个 UU**，
> 而**提交被 M7 明确禁止**（提交点固定在 P4）。
> ⇒ **等效补偿 = §四 4.5 的 `wip/p3-src` 快照**（把"未提交 = 无法回退"这个真实风险单独消掉），
> 并把"未提交改动 727 项"写进 §十二 施工记录。**这不是放宽门禁，是换一种方式满足它的立意**（可回退）。

### 3.1 停止条件（**命中即停工，不要"带着失败进入下一 Phase"**）

| # | 触发 | 为什么必须停 | 停工后做什么 |
|---|---|---|---|
| **S1** | 前置 ①–②、④–⑥、⑧–⑩ 任一不满足 | 状态前提被破坏，继续做只会把错误叠加 | 写报告说明哪条不满足 + 实测输出，**不动树** |
| **S2** | 冲突块 ≠ 40 且**无法 100% 归因** | 可能是目标 / 起点不对（J-21 的立意） | 停工；把逐块表与蓝图表**逐行比对**，找出多/少的那块 |
| **S3** | 🔴 任何时刻**误执行**了 `merge --abort` / `merge --continue` / `commit` / `stash` / `checkout -- .` / `reset --hard` / `clean` | 这些动作会**不可逆地销毁 P2 的 18 个救回**与合并状态 | **立即停工**，用 `wip/p2-docs` + `p2-disposition.txt` + §八 回退表评估损失，把**已丢失清单**写进报告 |
| **S4** | 某块的处置需要**产品取向判断**（不是技术判断） | agent 不得替人做产品决定（规范 §4.1） | 登记 **H-A** 拍板行（§五），**该块挂起**、先做其余块 |
| **S5** | 出现**计划外状态码**（`AA` / `DD` / `AU` / `UA`） | 说明有别的 git 动作介入了 | 停工，记录完整 `status --porcelain` |
| **S6** | 处置某块后，某文件**编译错误数上升且无法归因** | 可能是"取错侧"把功能删了（不是"暂时不编译"） | 回退**该文件**（§八 R-1），重读该块的 OURS/THEIRS 两侧原文 |
| **S7** | 全量测试**失败数 > 基线**且失败用例**落在本 Phase 改动面内** | 真回归 | 停工，按 §九 坑 7 的归因四步法定位 |

### 3.2 本 Phase 的"做法已被实测推翻并替换"提示

> ⚠️ **原计划**：P0 总蓝图 §四 把 P3 描述为"**逐文件处置 20 个 UU**"。
> **实测结论**：作业面是 **40 个冲突块**；一个文件里最多有 **5 块**（`rag/index.ts`、`AppearanceSettingsPage.tsx`），
> 且**同一文件的不同块要取不同侧**（例：`build-options.ts` 的 3 块分别是 P3 / P1 / P7）。
> **新做法**：见 §四 4.2**逐块表**。
> 🔴 **执行者请按本文档执行，不要按"按文件取 ours/theirs"的旧理解执行** ——
> **对一个文件整体取一侧，必然删掉另一侧的某个功能**（实测 23/40 块是"双方各自新增"）。

---

## 四、改动清单（Agent 直接执行）

### 4.1 七类处置模式（**先认模式，再动手**）

| 模式 | 何时用 | 动作 | 为什么 |
|---|---|---|---|
| **P1 · 并集** | **双方各自新增**同一位置（23 块） | **两侧内容都留**，按"我方在前、官方在后"或"按语义归位"合并 | 取任一侧 = 删掉对方功能。**这是本 Phase 最容易犯的错** |
| **P2 · 保留我方** | `T=base`（官方无主张），或**官方那侧只是"同一段被整体重排"** | **保留我方内容**作为主体 | 我方改动是**新功能**；官方无主张 |
| **P3 · 收下官方** | `O=base`（我方那侧仍是基线） | **取官方版本**，并**逐字确认我方那侧确实等于基线** | 我方没有改动，取官方即正确 |
| **P4 · 官方守卫 + 我方实现** | 官方加了**前置守卫**（`if (!isXxxEnabled()) return …`），我方在同一函数上加了**作用域参数** | **守卫在上、我方实现在下** | 两个都成立：官方管"这个模式用不用记忆"，我方管"用哪个记忆域" |
| **P5 变体 · 字段级并集** | 配置文件里两侧各自新增了**不同的键** | **两组键都要** | 缺任一键 = 缺一项功能或设置 |
| **P6 · 接受官方删除（**必须验证**）** | `O-only`（官方把这段删成空） | **先回答"我方为什么加它"**：若其**唯一消费者已被 P2 删除** ⇒ 接受删除；若还有消费者 ⇒ **转为 P1** 保留 | 直接接受删除 = 可能删掉还在用的功能（§四 4.3） |
| **P7 · 逐案判断（危险）** | `双方base` —— 两侧都不等于基线，且**结构不同**（重排 / 换分支 / 改签名） | **读懂两侧的语义**，重写出"同时满足两者意图"的版本，**逐行写理由** | 这 4 块最容易"看着对、其实丢功能" |

### 4.2 **逐块处置表（40 行 → 29 个文件·块组合）★ 本 Phase 的核心作业单**

> 用法：按行执行。每行做完**立刻**：① 删掉三个标记行；② 保存；③ 若该文件**所有块都做完**了 ⇒ `git add -- <该文件>` 并**立刻**按 §六 A8 跑一次该文件所属 tsconfig 的编译（**C21：不要攒到最后**）。

#### A. `README.md`（1 块）

| 行 | 文件·块 | 我方（14 行，`O=base`） | 官方（1 行） | **处置** |
|---|---|---|---|---|
| 1 | `README.md` #1 @137 | 一段以 `> ⚠️ 升级上游时请注意批次 A、B 都带**数据破坏性迁移**…` 开头的**引用块** + `cyrene` CLI 用法示例 | `> [!IMPORTANT]`（GitHub 提示框语法） | **P3 变体**：官方的 `> [!IMPORTANT]` 是**官方那段的标题行**，我方那段是**独立一段**。⇒ **两段都保留**：官方 `> [!IMPORTANT]` 归位到官方原文处（本块的上方），我方那 14 行**原样接在其后**。<br>🔴 **不许只留一侧**：只留官方 ⇒ 丢掉"数据破坏性迁移必须先备份 `%APPDATA%\live2d-cyrene`"这条**唯一的安全警告**（它同时是 P6 人工步骤的文案来源） |

#### B. `package.json`（2 块）

| 行 | 文件·块 | 我方 | 官方 | **处置** |
|---|---|---|---|---|
| 2 | `package.json` #1 @2 | `"name": "live2d-cyrene"` / `"version": "1.2.2-PLUS"`（`T=base`，官方在这块无主张） | `"name": "cyrene-agent"` / `"productName": "Cyrene"` / `"version": "1.3.0"` / `"packageManager": "pnpm@10.33.0"` / `"pnpm": { "overrides": { "rxjs": "7.8.1" } }` | **P5 变体（字段级并集）**：<br>① **`name` 取官方 `"cyrene-agent"`** —— 🔴 **这是有意决策，不是顺手**：`name` 决定 Electron 的 `app.getPath("userData")`；官方已配套 `src/main/user-data-migration.ts` 把 `%APPDATA%\live2d-cyrene` **整体原子迁移**到新目录（见 §四 4.3 的验证结论）。**取我方名 = 保留旧目录 + 放弃官方迁移链**，会让后续每次同步都再冲突一次；<br>② **`productName` / `packageManager` / `pnpm.overrides` 取官方**（工具链字段，我方无主张）；<br>③ **`version` 取官方 `"1.3.0"`** —— 我方 `1.2.2-PLUS` 是**分叉期的临时标记**；合并后版本号必须跟上游，否则 `updater` 的比较逻辑会认为"永远落后"。🔴 **处置后必须在 §十二 施工记录里单列这一行**（它改变了用户可见的版本号与数据目录）；<br>④ `description` / `main` / `bin` 等**冲突区之外的字段不动** |
| 3 | `package.json` #2 @178 | `"allowScripts": { protobufjs@…, electron@43.1.0, sharp@0.32.6, tree-sitter@0.22.4, esbuild@0.28.2 }`（`O-only`，官方删成空） | （空） | **P6 + P1**：<br>① 官方改用 **pnpm**，白名单搬到了 `pnpm-workspace.yaml` 的 `onlyBuiltDependencies`（实测含 `electron / esbuild / protobufjs / sharp / tree-sitter`）⇒ **`allowScripts` 是 npm 机制，在 pnpm 下不再被读取**；<br>② **但不要删**：删了会**丢掉 npm 路径的兜底**（本项目历史上真的靠它装过 electron 二进制，见经验 **X20 / E10**）；<br>③ **保留 `allowScripts` 整块**，并把 **`electron@43.1.0` 更新为 `electron@44.4.3`** —— 官方 lockfile 实测装的就是 `electron@44.4.3`，**旧条目已失配**（X20 的原文就是"白名单条目带版本号，升级依赖会让旧条目失配"）。<br>🔴 **这一处是"计划外改动"，必须在 §十二 施工记录单列**（判据出处：经验 X20 要求"approve 引起的 `package.json` 改动必须单列"） |

#### C. `src/main/application/default-dependencies.ts`（1 块）

| 行 | 文件·块 | 我方（4 行，双方新） | 官方（3 行） | **处置** |
|---|---|---|---|---|
| 4 | #1 @46 | `runMemorySchemaGate`（记忆 schema 门禁）· `registerZonesIpc`（**ZONES 区块 IPC**）· `configureDocumentIndexQueue` · `runDocumentIndexJob`（**附件文档索引链**） | `registerWikiMemoryIpc` · `registerKnowledgeBaseIpc` · `initializeKnowledgeBase`（**官方知识库 + wiki 记忆**） | **P1 并集**：**7 行 import 全留**。<br>🔴 陷阱：这块是 **M2 / J-04 的四个入口之一** —— `document-index-queue/worker` 是 P2 从静默删除面救回的，**删掉这两行 import 等于让救回白做**（文件在、入口没了，经验 **A56**）。<br>📌 官方三行是**新增能力**，同样不能丢。<br>**验**：`git grep -n 'document-index-queue\|document-index-worker\|registerZonesIpc\|registerWikiMemoryIpc\|initializeKnowledgeBase' -- <该文件>` ⇒ 5 个标识各 ≥1 |

#### D. `src/main/memory/memory-scheduler.ts`（4 块）

> 背景：官方引入 **`memoryMode`**（`vector | summary | wiki | off`，见 `src/main/memory/memory-mode.ts`），
> 在调度入口加 `if (!isMemoryEnabled()) return;` 守卫；我方在同一批函数上加了 **`scopeId` / `TurnAttribution`**（群聊记忆隔离 + 说话人归属）。

| 行 | 文件·块 | 我方 | 官方 | **处置** |
|---|---|---|---|---|
| 5 | #1 @12 | `import type { …, TurnAttribution } from "./memory-types"` + `import { resolveScopeId, rootScope, type MemoryScopeId } from "../zones/scope"` | `import type { L1Profile, MemoryCandidate, MemoryJudgeTurn } from "./memory-types"`（少 `TurnAttribution`）+ `import { isMemoryEnabled } from "./memory-mode"` | **P1 并集**：`memory-types` 的 import **取我方的（含 `TurnAttribution`）**，另加官方的 `memory-mode` import。⇒ 3 行 import（2 行我方 + 1 行官方） |
| 6 | #2 @56 | `scheduleMemoryWrite(userInput, assistantReply, conversationId?, attribution?: TurnAttribution)` + `const scopeId = resolveScopeId(conversationId)` | `scheduleMemoryWrite(userInput, assistantReply, conversationId?)` + `if (!isMemoryEnabled()) return;` | **P3 + P5**：**签名取我方（4 参）**，**守卫取官方**并放在函数体第一行。⇒ 保留 4 参签名 + `if (!isMemoryEnabled()) return;` + `const scopeId = resolveScopeId(conversationId)` |
| 7 | #3 @91 | `runQueuedMemoryWrite(scopeId: MemoryScopeId, seq, conversationId?)`（多一个 `scopeId` 参数） | `runQueuedMemoryWrite(seq, conversationId?)` + `if (!isMemoryEnabled()) return;` | **P3 + P5**：**签名取我方（带 `scopeId`）**，**守卫取官方**（放函数体首行）。官方那侧在同一块里出现了**两次** `if (!isMemoryEnabled()) return;`（实测 ours=8 / theirs=4，their 侧第 2、4 行）⇒ **只保留一处**（函数入口），不要重复插入 |
| 8 | #4 @114 | `.map(…)` 展开 `personKey / speakerName / messageId / chatType` 四个可选字段 + `judgeMemory(turns, id, { l2Only: scopeId !== rootScope() })` | `.map(({ userInput, assistantReply }) => ({ userInput, assistantReply }))`（**丢弃归属字段**）+ 无 `l2Only` + 末尾 `if (!isMemoryEnabled()) return;` | **P3 + P5**：**取我方**（归属字段与 `l2Only` 都是**新功能**），**守卫取官方**（放在 `judgeMemory` 调用**之前**）。⇒ 我方 14 行 + 官方最后 1 行的守卫 |

🔴 **本文件的纪律**：官方的守卫是**功能开关**（`memoryMode === "off"` 时不该写记忆），我方的 `scopeId` 是**隔离边界**，
**两者不互斥、都必须留**。**任何"取整块一侧"的处置都会丢一个**。

#### E. `src/main/memory/memory-user-ipc.ts`（2 块）

| 行 | 文件·块 | 我方 | 官方 | **处置** |
|---|---|---|---|---|
| 9 | #1 @9 | `deleteAllMemory` · **memory-console 五件套**（`MemoryManagerView / deleteMemoryManager / listMemoryManager / queryMemoryManager / traceMemorySource`）· `executePersonErase / previewPersonErase`（**按人擦除**）· `deleteImportedDoc` | `import { CYRENE_AVATAR_EXTENSIONS, findCyreneAvatarPath, getCyreneAvatarPath, loadUserProfile, saveUserProfile, getAvatarPath } from "../settings-store"`（**一行并成 6 个符号**，含 3 个官方新增的头像符号） | **P1 并集**：保留我方 11 行 + 官方的**同一模块 import 合并为一行**（`settings-store` 我方那行只 import 3 个，官方 6 个）⇒ **净结果 = 我方 10 行 + 1 行 6 符号的 `settings-store` import**。<br>🔴 **不许保留两条 `../settings-store` import**（重复 import 同模块会让 lint/编译报错，且必被 `ipc-contract` 类判据连带影响） |
| 10 | #2 @170 | **74 行**：`MEMORY_DELETE_ALL` handler（含 `deleteAllMemory()` + `restartRequired: true`）· `APP_RESTART` handler · memory-console 六个 handler 的开头部分 | **10 行**：`MEMORY_PANEL_GET_SUMMARY` handler（官方 summary 记忆模式的读入口） | 🔴🔴 **P2（本表**最危险的一块**）**：<br>**现象**：官方那侧**没有闭合括号** —— 它那段以 `return { sessionId, ...context };` 结尾，**闭合的 `});` 在冲突区之外**（实测 `memory-user-ipc.ts` L257 = `  });`，**已由 git 自动合并保留**）。<br>**正确做法**：**先接我方 74 行**（它自带完整的 `});` 收尾 + 6 个 handler 的开头），**再接官方 10 行**，然后**让冲突区外的 `});` 去闭合官方那个 handler**。<br>⇒ 结果 = 我方 6 个 handler **完整** + 官方 `MEMORY_PANEL_GET_SUMMARY` handler **完整**。<br>🔴 **验证（必做）**：处置后该文件里 `ipc.handle(` 与 `});` 的**配对必须平衡**；且以下 8 个 channel 各命中 1 次：<br>`MEMORY_DELETE_ALL` · `APP_RESTART` · `MEMORY_MANAGER_LIST` · `MEMORY_MANAGER_QUERY` · `MEMORY_MANAGER_DELETE` · `MEMORY_ERASE_PREVIEW` · `MEMORY_ERASE_PERSON` · `MEMORY_PANEL_GET_SUMMARY` |

#### F. `src/main/orchestrator/agent-runtime.ts`（1 块）

| 行 | 文件·块 | 我方（19 行） | 官方（2 行） | **处置** |
|---|---|---|---|---|
| 11 | #1 @115 | `personKey?` / `speakerName?` / `userMessageId?` / `chatType?` 四个字段（**P1/P2 归属透传**，带中文注释） | `assistantEntryId?` / `userTurnId?`（官方 summary 模式要用的两个 id） | **P1 并集**：**6 个字段全留**。<br>🔴 我方 4 个字段是 `personKey` 链的**起点**（`channels/bootstrap.ts` → `agent-runtime` → `build-options` → `memory-scheduler` → L2 落库），删一个整条链断；官方 2 个字段是 `scheduleSummaryTurn` 的入参来源 |

#### G. `src/main/orchestrator/build-options.test.ts`（1 块）

| 行 | 文件·块 | 我方（39 行） | 官方（4 行） | **处置** |
|---|---|---|---|---|
| 12 | #1 @829 | 一个完整 `it("P3：关系日志拿到的 personKey 与 TurnAttribution 完全一致", …)` 用例（**含 deps 装配 + 双断言**）+ 下一个用例的开头 | **下一个用例**的开头 4 行：`it("uses the latest sticker **text** index …")` + `matchSticker = vi.fn(() => …)` + `latestIndex = [{ id, **text**: … }]` + `getSticker**Text**Index` | **P1 并集**：**我方整个 `it(...)` 用例完整保留**，**然后接官方那 4 行**（官方把贴纸匹配从"embedding 索引"改成了"**text 索引**"—— 这是官方的新实现，不能丢）。<br>🔴 注意：官方把 `getStickerEmbeddingIndex` 改名 `getStickerTextIndex`、`embedding` 字段改 `text`；**而 M2/J-04 保留了 `sticker-embedding-cache.ts`** ⇒ 本文件下方的**其他**用例可能仍用 embedding 版本。**处置完本块后必须整文件跑一次**（§四 4.6 ①），确认没有"半改半留" |

#### H. `src/main/orchestrator/build-options.ts`（3 块，**同一文件三种模式**）

| 行 | 文件·块 | 我方 | 官方 | **处置** |
|---|---|---|---|---|
| 13 | #1 @222 | `scheduleMemoryWrite: (userText, reply, conversationId?, attribution?: TurnAttribution) => void;`（4 参） | `scheduleMemoryWrite(userText, reply, conversationId?)`（3 参）+ **两个新回调** `scheduleSummaryTurn?` / `scheduleWikiTurn?` | **P1 并集**：**4 参签名取我方** + **官方两个新回调保留**。⇒ 3 个成员都在 |
| 14 | #2 @1192 | `personKey?` / `speakerName?` / `userMessageId?` / `chatType?`（4 个归属字段） | `assistantEntryId?` / `userTurnId?`（2 个官方字段） | **P1 并集**：**6 个字段全留**（与第 11 行同型） |
| 15 | #3 @1231 | `} else {` + `deps.scheduleMemoryWrite(sideEffectUserText, chatContent, conversationId, { personKey, speakerName, messageId, chatType })` —— **4 参调用 + 归属对象** | `}` + `if (memoryMode === "wiki" …) { scheduleWikiTurn } else if (memoryMode === "summary" …) { scheduleSummaryTurn } else if (memoryMode === "vector" && !socialContext) { deps.scheduleMemoryWrite(sideEffectUserText, chatContent, conversationId) }` —— **memoryMode 三分支 + 3 参调用** | 🔴 **P7 逐案判断（本表最难的一块）**：<br>**读懂两侧**：官方把"单一 `else`"重构成"**按 `memoryMode` 三分支**"；我方在 `else` 里**给 vector 路径补了归属参数**。<br>**正解 = 用官方的分支结构 + 在我方关心的那一条(vector)上保留 4 参调用**：<br>```text
}
if (memoryMode === "wiki" && conversationId) {
  deps.scheduleWikiTurn?.({ conversationId, userText: sideEffectUserText });
} else if (memoryMode === "summary" && conversationId && finishedContext?.assistantEntryId) {
  deps.scheduleSummaryTurn?.({ conversationId, assistantEntryId: finishedContext.assistantEntryId,
    ...(finishedContext.userTurnId ? { userTurnId: finishedContext.userTurnId } : {}),
    userText: sideEffectUserText, assistantText: chatContent });
} else if (memoryMode === "vector" && !socialContext) {
  // P2：把本轮说话人归属一并交给记忆调度层（桌面路径三字段为 undefined，整体退化，零行为变化）
  deps.scheduleMemoryWrite(sideEffectUserText, chatContent, conversationId, {
    personKey: finishedContext?.personKey,
    speakerName: finishedContext?.speakerName,
    messageId: finishedContext?.userMessageId,
    chatType: finishedContext?.chatType,
  });
}
```<br>🔴 **写完必须确认**：`memoryMode` 变量在该作用域**已定义**（官方在同一函数上文引入）；`socialContext` 的 `if/else` 结构**仍闭合**；本块**上方**那个 `} else {`（我方那侧的开头）**不要重复保留** —— 官方的 `}` 已经承担了闭合。 |

#### I. `src/main/orchestrator/context-builder.ts`（1 块）

| 行 | 文件·块 | 我方（15 行） | 官方（5 行） | **处置** |
|---|---|---|---|---|
| 16 | #1 @3 | `import type { TurnAttribution } from "../memory/memory-types"` + 带 JSDoc 的 `scheduleMemoryWrite(userInput, assistantReply, conversationId?, attribution?)` + 转调 `memoryScheduler.scheduleMemoryWrite(…, attribution)` | `import { isMemoryEnabled } from "../memory/memory-mode"` + `scheduleMemoryWrite(userInput, assistantReply, conversationId?)` + `if (!isMemoryEnabled()) return;` + 3 参转调 | **P3 + P5**：**签名取我方（4 参）**、**守卫取官方**（首行）、**转调取我方（带 `attribution`）**。⇒ 2 行 import（我方 1 + 官方 1）+ 4 参签名 + 守卫 + 4 参转调 |

#### J. `src/main/orchestrator/index.ts`（4 块，**同一文件四种模式**）

| 行 | 文件·块 | 我方 | 官方 | **处置** |
|---|---|---|---|---|
| 17 | #1 @11 | `import { resolveScopeId, rootScope, shouldInjectOwnerProfile, type MemoryScopeId } from "../zones/scope"` + `const DEFAULT_GROUP_CONTEXT_LIMIT = 10;` | `import { isMemoryEnabled } from "../memory/memory-mode"` | **P1 并集**：3 项都留（2 行 import + 1 个常量）。🔴 **`DEFAULT_GROUP_CONTEXT_LIMIT` 是 11 项基线之一「群上下文上限」的默认值**，删了 = 基线退化 |
| 18 | #2 @40 | `const scope = scopeId ?? rootScope();` | `if (!isMemoryEnabled()) return "";` | **P7 → 实为 P1 并集**：两行**都在函数开头、互不替代** ⇒ **两行都留**（守卫在前、`scope` 在后） |
| 19 | #3 @72 | `// 检索 top-2 导入文档片段` + `const docResults = await searchMemory(userInput, "imported_doc", 2);` + 维度不一致的**兜底提示**（`isDimensionMismatchError`）+ `} catch { … }` + **限域的实体图谱调用** `entityGraph.search(userInput, scope)` | `// 实体关系图谱` + `const entityInfo = entityGraph.search(userInput);`（**丢了 `scope`**） | **P2 保留我方**：**我方 17 行整体保留**（含导入文档检索 + 维度兜底 + 限域调用）。<br>🔴 **`entityGraph.search(userInput, scope)` 的第二参是「区块 zones」的隔离边界**，官方那侧是第一版（无限域）。<br>⚠️ **结构注意**：我方那侧以 `const entityInfo = …;` 结尾，官方那侧也以 `const entityInfo = …;` 结尾，**块外紧跟 `if (entityInfo) {`**（实测 L94）⇒ 处置后**只允许存在 1 条 `entityInfo` 赋值**，且必须是**带 `scope` 的那条** |
| 20 | #4 @163 | **57 行**：整个「群聊近期上下文」块（`if (trace?.chatType === "group") { … buildGroupContextBlock(trace.sessionId, limit) … }`）+ 「L0/L1 画像」块的我方版（`const scopeId = resolveScopeId(…); shouldInjectOwnerProfile(scopeId)` 门禁 + `l0.language` 字段） | **32 行**：「L0/L1 画像」块（`if (isMemoryEnabled()) { … }` 包裹 + **无** `l0.language`、**无** 限域门禁） | 🔴 **P2 保留我方 + P3 收下官方守卫（本表第二难的一块）**：<br>① **我方 57 行里的「群聊近期上下文」块整体保留** —— 它是 11 项基线之一「群聊旁听上下文」(`buildGroupContextBlock`) 的**唯一调用点**，删了该功能即刻消失；<br>② **「L0/L1 画像」部分**：**保留我方的限域门禁**（`scopeId` + `shouldInjectOwnerProfile`）与 **`l0.language` 字段**，**并把官方的 `if (isMemoryEnabled())` 包在外面**（两者不冲突：官方管"开不开记忆"，我方管"给谁看画像"）；<br>③ 官方的 `if (isMemoryEnabled())` 是**外层**守卫 ⇒ 最终结构 = `if (isMemoryEnabled()) { try { … 我方限域逻辑 … } catch {…} }`。<br>🔴 **验**：`git grep -c 'buildGroupContextBlock\|shouldInjectOwnerProfile\|l0.language' -- <该文件>` 三个标识各 ≥1 |

#### K. `src/main/orchestrator/tools/history-tools.ts`（2 块）

| 行 | 文件·块 | 我方（1 行） | 官方（1–2 行） | **处置** |
|---|---|---|---|---|
| 21 | #1 @14 | `import { resolveScopeId } from "../../zones/scope"` | `import { isMemoryEnabled } from "../../memory/memory-mode"` | **P1 并集**：2 行都留 |
| 22 | #2 @77 | `execute: async (args, ctx) => {`（**带 `ctx`** ⇒ 能拿到 `conversationId`） | `execute: async (args) => {` + `if (!isMemoryEnabled()) return "[recall_history] 记忆模式已关闭，历史召回当前不可用";` | **P4（守卫 + 我方签名）**：**签名取我方 `(args, ctx)`**（否则下面的 `resolveScopeId(ctx?.conversationId)` 无源），**守卫取官方**（首行）。<br>🔴 顺序：守卫在前（模式关了直接返回），`scopeId` 解析在后 |

#### L. `src/main/orchestrator/tools/registry/tool-registry.ts`（2 块，**同型**）

| 行 | 文件·块 | 我方 | 官方 | **处置** |
|---|---|---|---|---|
| 23 | #1 @240 | `execute: async (args, ctx) => {` + 注释 + `const scopeId = resolveScopeId(ctx?.conversationId);` + `searchMemory(…, { scopeId })` | `execute: async (args) => {` + `if (!isVectorMemoryEnabled()) return "[用户记忆] 当前模式不使用向量记忆";` + `searchMemory(…)`（**无限域参数**） | **P4**：**签名取我方 `(args, ctx)`** → **官方守卫**（`isVectorMemoryEnabled()`）→ **我方实现**（`scopeId` + `{ scopeId }` 第 4 参）。<br>③ 处都在同一块内 ⇒ 一次写全 |
| 24 | #2 @388 | `execute: async (args, ctx) => {` + 注释（**动态 `import` 而非 `require`，理由写在注释里**）+ `const scopeId = resolveScopeId(ctx?.conversationId);` + `const scopedL2 = await memoryStore.getL2ForScope(scopeId);` | `execute: async (args) => {` + `if (!isVectorMemoryEnabled()) return "[通读记忆] 当前模式不使用向量记忆";` + **`require(...)` 版本**的惰加载 | **P4 + P2**：**签名取我方** → **守卫取官方** → **惰加载取我方（`await import`）** → **限域取我方**。<br>🔴 **`require` vs `await import` 不许混**：我方注释已写明"`require` 在 ESM 打包产物与 vitest 下都不可拦截，这条路会因此完全无法单测（P2 实测撞到）" ⇒ **必须保留 `await import`**（官方那侧是被我方修过的旧写法） |

#### M. `src/main/rag/index.ts`（5 块，**本文件块数最多**）

| 行 | 文件·块 | 我方 | 官方 | **处置** |
|---|---|---|---|---|
| 25 | #1 @15 | `import type { MemoryScopeId } from "../zones/types"` | `import { isMemoryEnabled } from "../memory/memory-mode"` | **P1 并集**：2 行都留 |
| 26 | #2 @296 | `const entry = await store.addUnique(text, "user_memory", provider, { ...metadata, l2Id, ...(scopeId ? { scope: scopeId } : {}) }); return entry.id;` —— **写入时打上 `scope` 标签** | `const currentStore = store; const currentProvider = provider; return trackVectorOperation(async () => { const entry = await currentStore.addUnique(…{ ...metadata, l2Id }); return entry.id; });` —— **包 `trackVectorOperation`**（向量操作观测/限流） | **P1 并集**：**保留官方的 `trackVectorOperation` 包装**（新能力：向量操作追踪），**在该包装内部保留我方的 `scope` 字段**。⇒ `trackVectorOperation(async () => { const entry = await store.addUnique(text, "user_memory", provider, { ...metadata, l2Id, ...(scopeId ? { scope: scopeId } : {}) }); return entry.id; })`。<br>🔴 **`currentStore` / `currentProvider` 的本地绑定**是官方为闭包捕获做的；若我方版本的 `store` / `provider` 已在同作用域且不被重赋值，可直接用 |
| 27 | #3 @408 | `if (scopeId !== undefined) { allowedEntryIds = getEntriesBySource("chat_history").filter(e => e.metadata?.scope === scopeId).map(e => e.id); }` + `retriever.retrieve(query, "chat_history", topK, { allowedEntryIds })` | `if (!isMemoryEnabled()) return [];` + `return trackVectorOperation(async () => { … retriever.retrieve(query, "chat_history", topK) … })` | 🔴 **P7 逐案判断**：官方把整个函数体包进 `trackVectorOperation`，我方在函数体里加了 `allowedEntryIds` **过滤**。<br>**正解**：**守卫在最外**（`if (!isMemoryEnabled()) return [];`）→ **`allowedEntryIds` 计算在包装外**（它只读索引、不是向量操作）→ **`retriever.retrieve(...)` 调用带 `{ allowedEntryIds }` 且仍在 `trackVectorOperation` 包装内**。<br>🔴 不许把 `allowedEntryIds` 计算放进 `trackVectorOperation` 的回调里（会把它算成一次向量操作） |
| 28 | #4 @497 | `// 2. Imported docs` + `const docResults = await searchMemory(userInput, "imported_doc", 5);` + `parts.push("【相关文件片段】\n" + …)` + `// 3. User memory（**按域过滤：调用方必须显式给域，否则等于全库召回**）` + `searchMemory(…, 3, { scopeId })` | `// 2. User memory` + `const memResults = await searchMemory(userInput, "user_memory", 3);`（**无限域**） | **P2 保留我方**：**我方 8 行整体保留**（导入文档检索 + 按域过滤的用户记忆检索）。<br>🔴 官方那侧把"导入文档检索"整段**删掉**了（编号从 2 开始）—— 那是**我方保留的附件链**（M2），**不能跟着删** |
| 29 | #5 @549 | **24 行**：`deleteChatHistoryVectors(ragIds)` + `deleteImportedDoc(importId, fileName?)` + `hasImportedDocumentChunks(importId)` 三个导出函数（带长注释解释"为什么 `chat_history` 要单独一个函数"） | （空 —— 官方删成空） | **P6**：**先回答"谁还在用"**（§四 4.3）。实测消费者：`deleteImportedDoc` ← `memory-user-ipc.ts`（**我方保留的 handler**，`MEMORY_PANEL_DELETE_IMPORTED_DOC`）；`deleteChatHistoryVectors` / `hasImportedDocumentChunks` 若消费者已随 P2 删除 ⇒ 可只留前两个。<br>🔴 **判定动作**：`git grep -n 'deleteChatHistoryVectors\|deleteImportedDoc\|hasImportedDocumentChunks' -- src` ⇒ **凡引用数 ≥1 的必须保留**；三个都是 0 才允许整块接受删除。<br>⚠️ 这是**"能力在、入口没了"的正向应用**（A56）：入口在 ⇒ 必须留 |

#### N. `src/main/settings/settings-facade.ts`（1 块）

| 行 | 文件·块 | 我方（1 行） | 官方（9 行） | **处置** |
|---|---|---|---|---|
| 30 | #1 @186 | `groupContextLimit: normalizeGroupContextLimit(input?.groupContextLimit),` | `taskCharacterPersonaEnabled` / `taskModelProfileId` / `taskModel` 三个字段的归一化 | **P1 并集**：**4 个字段全留**（我方 1 + 官方 3）。<br>🔴 **`groupContextLimit` 是 11 项基线之一，且它的类型声明在 `general-settings.ts:194`、边界用例在 `settings-facade.test.ts:85-99`（8 条）** ⇒ 这里删一行，**三处一起坏** |

#### O. `src/preload/index.ts`（1 块）

| 行 | 文件·块 | 我方（4 行） | 官方（12 行） | **处置** |
|---|---|---|---|---|
| 31 | #1 @861 | `openInReactChatWindow: (sessionId, panel?) => ipcRenderer.invoke(IPC.CHATS_OPEN_IN_REACT_WINDOW, sessionId, panel)` —— **多一个 `panel` 参数**（状态栏入口直达某个侧栏面板） | `onCompactionPhase: (callback) => { … ipcRenderer.on(IPC.CHATS_COMPACTION_PHASE, listener) … }` —— **上下文压缩相位事件**（**官方新能力**） + `openInReactChatWindow: (sessionId) => invoke(…, sessionId)`（**少 `panel`**） | **P1 并集**：**官方的 `onCompactionPhase` 整块保留** + **我方的 `openInReactChatWindow`（带 `panel?`）保留**。<br>🔴 **不要出现两个 `openInReactChatWindow`**（重复键：后者静默覆盖前者，编译不报错 —— **必被漏掉的一类错**）。<br>📌 `CHATS_COMPACTION_PHASE` 的声明在 `src/shared/ipc-channels.ts:250`（已随合并在位），**handler 在 `chats-ipc.ts:153`** ⇒ 三处齐全，不需要本块补声明 |

#### P. `src/renderer/react/features/settings/AppearanceSettingsPage.tsx`（5 块）

| 行 | 文件·块 | 我方 | 官方 | **处置** |
|---|---|---|---|---|
| 32 | #1 @3 | `lucide-react` 图标：`… Layers … Type Wrench`（含 `Layers`，供 zones 页） | `… BookOpen, Bot, … Globe …`（含 `BookOpen` / `Bot` / `Globe`，**少 `Layers` / `Type`**） | **P1 并集**：**图标名并集**（两边用到的都要 import）。<br>🔴 **判据**：处置后**本文件里每个 `<Xxx size=…>` 用的图标都必须在 import 列表里**（`tsc` 会抓，但 `Layers` 只在一处用，容易漏）|
| 33 | #2 @42 | `import { ZonesSettingsPanel } from "./ZonesSettingsPanel"` | `import { SubagentSettingsPanel } from "./SubagentSettingsPanel"` + `import { BrowserControlSettingsPanel } from "./BrowserControlSettingsPanel"` | **P1 并集**：3 行都留（我方 zones 面板 + 官方 subagents / browser 面板） |
| 34 | #3 @88 | 联合类型含 `"zones"`（**无** `"knowledge"` / `"subagents"` / `"browser"`） | 含 `"knowledge"` / `"subagents"` / `"browser"`（**无** `"zones"`） | **P1 并集**：**联合类型取并集** ⇒ 两侧字符串全在。<br>⚠️ 本块被判为 `双方新`（不是 `O=base`），因为**两侧的联合类型行都是新写的**（官方是重排 + 新增）。⇒ **不要"取官方那行"**（会丢 `"zones"` ⇒ 类型收窄 ⇒ **`section === "zones"` 的比较全部报 TS2367**） |
| 35 | #4 @282 | `<SettingsNavItem section="zones" … icon={<Layers …/>} label={t("settingsPage.zones.title")} …/>` | `<SettingsNavItem section="knowledge" … icon={<BookOpen …/>} label={t("settingsPage.knowledgeBase.title")} …/>` | **P1 并集**：**两个 `<SettingsNavItem>` 都留**（导航项是并列的，不是二选一） |
| 36 | #5 @304 | `className="cy-settings-content__inner"` + 一长串三元链，**含 `section === "zones" ? <ZonesSettingsPanel />`** | `className={\`cy-settings-content__inner${section === "knowledge" ? " is-knowledge-settings" : ""}\`}` + 一长串三元链，**含 `"browser"` / `"subagents"` / `"knowledge"`，不含 `"zones"`** | 🔴 **P3 变体（本表第三难的一块）**：**逐段并集** ——<br>① `className` **取官方**（它多了 `is-knowledge-settings` 条件类）；<br>② 三元链**取并集**：在官方那串里**插回** `section === "zones" ? <ZonesSettingsPanel />`（位置按我方原顺序，插在 `"memory"` 之后、`"cyrene"` 之前）；<br>③ **确认 `KnowledgeBaseSettingsPanel` / `SubagentSettingsPanel` / `BrowserControlSettingsPanel` 三个组件的 import 都存在**（第 33 行已并集）。<br>🔴 **陷阱**：三元链是一行超长表达式，**肉眼极难看出少了一项** ⇒ 处置后**必须**用计数判据验（§六 A3 的"面板数"条） |

#### Q. `src/renderer/react/features/settings/MemorySettingsPanel.tsx`（1 块）

| 行 | 文件·块 | 我方（2 行） | 官方（1 行） | **处置** |
|---|---|---|---|---|
| 37 | #1 @11 | `import { MemoryManagerSection } from "./memory-console/MemoryManagerSection"` + `import { DangerZoneSection } from "./memory-console/DangerZoneSection"` | `import { WikiKnowledgePanel } from "./WikiKnowledgePanel"` | **P1 并集**：3 行都留。<br>🔴 我方两行是 **11 项基线之一「记忆管理控制台」的入口**（`memory-console` 4 文件）；官方 `WikiKnowledgePanel` 是 wiki 记忆模式的入口。**两边都要** |

#### R. `src/renderer/react/i18n/{en,zh-CN}.json`（各 1 块）

| 行 | 文件·块 | 我方（16 行） | 官方（1 行） | **处置** |
|---|---|---|---|---|
| 38 | `en.json` #1 @1864 | `"status": { "active": "Active", "aging": "Aging", "archived": "Archived" }`（**展开成 5 行**）+ 11 个**导入文档管理**的新键（`importedTitle / importedDescription / chunkCount / lastImported / noDocuments / deleteDocument / deleteTitle / deleteMessage / confirmDelete / deleted / deleteFailed`） | `"status": { "active": "Active", "aging": "Aging", "archived": "Archived" },`（**压成 1 行**） | **P3 变体**：**保留我方的展开形式 + 11 个新键**（它们是 M2 附件链的 UI 文案，`memory-console` 与导入文档删除按钮要用）。<br>🔴 **JSON 语法**：官方那行**末尾有逗号**、我方那行**末尾逗号在 `}` 之后**（因为后面还有键）⇒ 处置后必须保证**该对象内每个键后有逗号、最后一个键后无逗号**。<br>🔴 **必做**：处置后 `node -e "JSON.parse(require('fs').readFileSync('<文件>','utf8'))"` **必须成功**（§六 A11） |
| 39 | `zh-CN.json` #1 @1864 | 同上，中文版 16 行（含「活跃 / 淡化中 / 已归档」） | 同上，1 行压缩形式（**注意官方那行本身是基线内容**） | **P3 变体**：同第 38 行。<br>⚠️ **i18n 键必须两边对称**：`en.json` 与 `zh-CN.json` 的键集合要一致（实测两边块的行数完全相同 = 16/16）⇒ 处置后**逐键比对两个文件的键集合**（§六 A4 第 3 条） |

#### S. `src/shared/ipc-channels.ts`（1 块）

| 行 | 文件·块 | 我方（10 行） | 官方（空） | **处置** |
|---|---|---|---|---|
| 40 | #1 @147 | 10 行 **IPC channel 声明**：`UI_WINDOW_CORNER_RADIUS_GET/CHANGED`、`UI_FONT_GET/CHANGED`、`CHAT_SESSION_USAGE_GET/CHANGED`（**用量徽章**，11 项基线之一）、`SETTINGS_PICK_UI_FONT` / `SETTINGS_IMPORT_UI_FONT` / `SETTINGS_RESET_UI_FONT` | （空 —— 官方删掉了前 4 个，并把 font 相关改成别的机制） | 🔴 **P6（**本表最需要先判断的一块**）**：<br>**逐条判"还有没有消费者"**（`git grep -n '<CHANNEL>' -- src`）：<br>① `UI_WINDOW_CORNER_RADIUS_*` / `UI_FONT_*` / `SETTINGS_*_UI_FONT`（**7 个**）—— 官方已删掉对应实现（`src/shared/ui-font.ts`、`src/main/ui-font-protocol.ts`、`src/renderer/ui/window-corner-radius.ts` 都在**删除 17** 里，且 **H-03 已拍板"直接删"**）⇒ **这 7 行接受删除**；<br>② `CHAT_SESSION_USAGE_GET/CHANGED`（**2 行**）—— **用量徽章是 11 项基线之一**，实现文件（`src/shared/usage-badge.ts`、`UsageBadge.tsx`、`ToolConsoleButton.tsx`）**都还在**（我方新文件，未被删）⇒ **必须保留**；<br>③ **判定动作（不可省）**：对 10 个 channel 逐个 `git grep -c`，**引用数 ≥1 的必须留，=0 的才允许删**。<br>🔴 **本文件的行为会被 `src/main/application/ipc-contract.test.ts` 检查**（它校验"每个声明的 IPC 键都有使用点"）⇒ 删多了会让该测试红、留多了可能触发"未使用"告警 ⇒ **处置后必须单独跑该测试文件**（§四 4.6 ③） |

### 4.3 `O-only` / `双方base` 两类的**强制前置判断**（**不许跳过**）

对 §四 4.2 里标记 **P6** 的行（第 3、29、40 行），**动手前必须先跑**：

```powershell
# 模板：把 <符号> 换成该块导出的每一个符号
git -C $R grep -n '<符号>' -- src
```

| 判定 | 动作 |
|---|---|
| 有 ≥1 个引用者，且**引用者本身未被 P2 删除** | ⇒ 该符号 **必须保留**（整块转 **P1/P2**，不接受删除） |
| 所有引用者都在 P2 的**删除 17** 名单里（或引用者本身也被官方删了） | ⇒ 接受删除（**P6 成立**），并在 §七 清单里记一行"为什么可以删" |
| 引用数为 0，但该符号是**导出 API**（`export function`） | ⚠️ 保守：**优先保留**（导出 API 可能有仓外/动态消费者），在 §十二 记一行不确定项 |

> 🔴 **这条判断就是"能力在、入口没了"的正向用法**（经验 **A56**）：**入口在 ⇒ 能力必须留**。
> P2 的教训是反过来的一面（能力在、入口没了 ⇒ 静默失效）；本 Phase 若**删掉了仍被引用的导出**，
> 结果是**编译期就红**（还算幸运）；若删掉的是**只在字符串/动态 `import` 里被引用**的，那就**编译不红、运行时才炸**。

### 4.4 静默重叠区核对（**6 个文件**，逐个人工确认）

按 §二 **E4** 的表，对 6 个文件逐个确认"我方那部分还在"。判据（每个文件一条）：

```powershell
$R = "E:\AI_Chating\cyrene-agent"
# ① chat-ui-ipc.ts：M2 入口（最重要，优先级最高）
git -C $R grep -n 'document-index-ipc\|document-index-queue\|document-index-worker' -- src/main/chats/chat-ui-ipc.ts
#    期望：≥3 个匹配（import + 调用），且 import 路径与实际文件名一致

# ② settings-facade.test.ts：11 项基线「群上下文上限」的边界用例
git -C $R grep -c 'groupContextLimit' -- src/main/settings/settings-facade.test.ts
#    期望：≥8（实测 8 条边界用例）

# ③ general-settings.ts：我方 206 行新增在
git -C $R diff --numstat b11b8851 HEAD -- src/main/settings/general-settings.ts
#    期望：与 §二 E4 表一致（+206 −189）

# ④ core-bootstrap.test.ts：我方 243 行新测试在
git -C $R diff --numstat b11b8851 HEAD -- src/main/application/core-bootstrap.test.ts
#    期望：+243 −218

# ⑤ shared/types.ts（9 个新文件的 hub）：我方新增在
git -C $R diff --numstat b11b8851 HEAD -- src/renderer/settings/shared/types.ts
#    期望：+217 −20

# ⑥ 🆕 core-bootstrap.ts：我方那 1 行删除是"有意的"还是"被官方覆盖掉了"
git -C $R diff b11b8851 HEAD -- src/main/application/core-bootstrap.ts
#    期望：恰好 1 行删除；**读懂它删的是什么**，并确认它不在 11 项基线的任何标识里
git -C $R grep -c 'runDataMigration\|migrateLegacyUserData\|user-data-migration' -- src/main/application/core-bootstrap.ts
#    ⚠️ 若这里命中 0，而官方把迁移调用放在 `core-bootstrap.ts` 里 ⇒ **它可能正是"我方那 1 行删除"的位置**
#       ⇒ 处置：**以官方为准**（迁移调用必须留），并在 §七 清单里记一行"我方那 1 行删除被官方取代"
```

> ⚠️ **③④⑤ 的"期望值"是 P2 时点的静态量**：本 Phase **不会改这三个文件**（它们不是 UU）⇒ 值应**完全不变**。
> 若变了 ⇒ **S5**（有别的动作介入了）。
> ⚠️ **⑥ 是本轮补充的一条**（原蓝图的 8 个清单里**没有它**）：它的风险低但**不能跳过** ——
> 我方与官方**同时改了 `core-bootstrap.ts`**，而 `core-bootstrap` 是**启动装配点**，
> 一旦"我方那 1 行删除"恰好删掉了官方的迁移调用位置，**首次启动就不会迁移用户数据**（§五 5.3 a 的数据风险会成真）。

### 4.5 P3 源码快照（`wip/p3-src`，**兜底**，不可省）

**为什么必须有**：本 Phase 出口 = "**727 项索引改动 + 0 个冲突，但未提交**"。
P4 提交前任何一次误操作（`reset --hard` / `checkout -- .`）都能**一次抹掉 40 个块的处置结果**。
P2 已经用同一手法保住了文档（`wip/p2-docs`），本 Phase **沿用**（经验 **C49** 的教训也要照做：**必须逐文件比对 blob**）。

```powershell
$R="E:\AI_Chating\cyrene-agent"
$tmp = Join-Path $env:TEMP ('dsh-p3snap-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$idxFile = Join-Path $tmp 'tmpindex'; $msgFile = Join-Path $tmp 'msg.txt'
[System.IO.File]::WriteAllText($msgFile, "wip(P3): 20 个 UU 的 40 个冲突块处置快照（未提交合并）", (New-Object System.Text.UTF8Encoding($false)))
$env:GIT_INDEX_FILE = $idxFile
git -C $R read-tree HEAD                       # 从 HEAD 建临时索引（**不碰主索引**）
foreach ($f in (git -C $R diff --name-only --diff-filter=U)) {
  git -C $R add -- $f                          # 🔴 逐条 + 必须写 --（经验 C49）
}
$tree = git -C $R write-tree
$head = git -C $R rev-parse HEAD
$new  = git -C $R commit-tree $tree -p $head -F $msgFile
Remove-Item Env:\GIT_INDEX_FILE
# 🔴 移 ref 之前先逐文件比 blob（C49 的核心教训）
$bad = 0
foreach ($f in (git -C $R diff --name-only --diff-filter=U)) {
  $cb = ((git -C $R ls-tree $new -- $f) -split '\s+')[2]
  $wt = git -C $R hash-object -- $f
  if ($cb -ne $wt) { $bad++; Write-Host "🔴 MISMATCH $f" }
}
"blob mismatches = $bad (期望 0)"
if ($bad -eq 0) { git -C $R update-ref refs/heads/wip/p3-src $new; "wip/p3-src -> $new" }
Remove-Item -Recurse -Force $tmp
```

**验收**：`blob mismatches = 0` + `git -C $R diff --name-only wip/p3-src~1 wip/p3-src` = **恰 20 个文件** + `git diff wip/p3-src wip/p3-src~1 -- src/` 非空。
🔴 **时序**：**在 20 个文件全部处置完、`git add` 完之后**做；**做完不要动 ref**（P4 提交后 `git branch -D wip/p3-src`）。

### 4.6 执行顺序（**顺序敏感，不要重排**）

| 步 | 动作 | 为什么这个顺序 |
|---|---|---|
| **①** | 按 §四 4.2 **逐块**处置；**每完成一个文件的所有块 ⇒ 立刻 `git add -- <该文件>`** | `git add` 把冲突标记消掉（`UU` → `M`），是"这块真的解决了"的**机器可判信号**（`git diff --diff-filter=U` 会少一行） |
| **②** | **每 `add` 一个文件，立刻对该文件所属 tsconfig 跑一次 `tsc`**（**C21**：不要攒到最后） | 最后一起跑时，**40 个块一起报错** ⇒ 无法归因到哪一块（经验 **C21 / D18**） |
| **③** | 全部 20 个文件处理完 ⇒ 跑 §四 4.3 的**强制前置判断**（对 P6 的三块） | 这三块的"能不能删"依赖**引用面**，而引用面在**其他块处置完**之后才稳定 |
| **④** | 做 §四 4.4 的**静默重叠 6 项核对** | 同上：自动合并的结果要等冲突全解才可判 |
| **⑤** | 跑 §六 **A1–A7**（标记 / 计数 / 引用面 / IPC） | 便宜且能快速证伪；**先跑便宜的** |
| **⑥** | 跑 §六 **A8**（三套编译） | 最贵的判据，放在结构判据之后 |
| **⑦** | 跑 §六 **A9**（全量测试） | 依赖 A8 通过（编译都不过，测试没有意义） |
| **⑧** | 做 §四 4.5 的 **`wip/p3-src` 快照** | 全部绿了再快照，快照才有价值 |
| **⑨** | 写 `PHASE-3-完成报告.md`（**10 节** + §十一 复核补正待撰写者填 + §十二 施工记录） | — |

> 🔴 **顺序理由一句话**：**先 cheap 后 expensive、先结构后语义、先红后绿** ——
> 每步都产出"能立刻判定的信号"，任何一步红都能**停在那一步**，而不是在最后一起爆炸（此时已无法归因）。

---

## 五、人工环节 ★

### 5.1 H-A 阻塞性拍板（开工前）

**本 Phase 无新增 H-A 拍板。** 理由：

| 可能的拍板点 | 为什么不需要人拍板 |
|---|---|
| "`package.json` 的 `name` 取官方 `cyrene-agent` 还是保留 `live2d-cyrene`？" | **不是产品取向，而是可判定的技术选择**：官方已配套 `user-data-migration.ts`，取官方名 ⇒ 数据**整体原子迁移**（§四 4.2 第 2 行已验证代码路径）。**取我方名的唯一后果**是"以后每次同步都再冲突一次" ⇒ 技术判断即可 |
| "`ipc-channels.ts` 那 10 个 channel 留哪个？" | **引用面可机械判定**（§四 4.3）⇒ 属技术判断 |
| "官方删掉的 7 个 UI channel 要不要留？" | **H-03 已拍板"直接删"**（台账 H-03 已闭合）⇒ 无需重新论证 |
| "某个功能该不该跟官方改成新模式？" | **M2 / J-04 已拍板"保留我方向量化与附件链"** ⇒ 无需重新论证 |

🔴 **若执行中真的遇到产品取向问题 ⇒ 命中 S4，登记新的 `H-nn`（`A · H-A`）并挂起该块**（§三 S4）。

### 5.2 H-B 完工评审（本 Phase 的**退出条件**）

> ⚠️ **本 Phase 不要求人做 H-B**，理由：**本 Phase 的产物是"源码内容"，而源码此刻还构不成可运行的应用** ——
> 它处在合并中、且**后续还有 P4（提交）+ P5（保真核验）**。
> **让 P3 就找人开应用 = 让人去点一个跑不起来的东西 = 负价值**（规范 §4.1 纪律 3）。
> **人眼评审集中在 P6**（`H-10…H-14` 已登记 `待预填（P6）`）。

**本 Phase 明确不需要人做的事**（照规范 §4.1 纪律 1）：

| 不做 | 为什么 |
|---|---|
| 不让人核对"这 40 个块该取哪侧" | 全部有**机械判据**（§二 E2 的基线判定 + §四 4.2 的逐块依据）⇒ 人重算 = 负价值 |
| 不让人看 `git status` 的 727 项改动 | 合并期间的正常状态，人会误判为"乱了" |
| 不让人开应用 / 跑测试 | 树处于合并中；且测试是 A 类（agent 跑） |
| 不让人决定 `name` / 版本号 | 技术判断（见 5.1） |

### 5.3 H-C 待验项登记（本 Phase **验不了**的）

**本 Phase 无新增 `H-nn`。** 但必须把**三条新增的"P6 必验项"**登记进台账（**追加到已有行的说明里，不新开行**）：

| 序号 | 要验什么（P6 时点） | 期望值（**已由本 Phase 预先算出**） | 为什么本 Phase 验不了 |
|---|---|---|---|
| a | 🔴 **首次启动前先备份 `%APPDATA%\live2d-cyrene`**，然后启动合并后的应用 | 旧目录被**整体重命名**为 `%APPDATA%\Cyrene`（或 `%APPDATA%\cyrene-agent`，取决于 Electron 解析），**记忆/语料/渠道绑定/设置全部还在** | 需要真实运行；且**有数据风险** ⇒ 必须由人执行（规范 §4.1.3 硬要求 3：**只验门、不执行**；真要执行**先外部备份**） |
| b | 设置页导航：`zones` / `knowledge` / `subagents` / `browser` / `memory` **五个入口都在**且能点开 | 五页各自渲染出面板（**不是空白、不是报错**） | 需要真实运行（P3 只能证明**代码在**，证不了**界面在**） |
| c | 群聊路径：`groupContextLimit` 生效 + 用量徽章显示 + 记忆控制台可打开 | 与 P1 基线一致（11 项功能基线逐条） | 同上 |

> 📌 **台账的写法**：这三条**并入** `H-10…H-14` 那几行（它们本来就是"待预填（P6）"的 B 类项）的**期望值列**，
> **不新开 `H-nn`** —— 因为它们是**同一个验收批**（P6 运行期），分开开行会让"一台账一行"的纪律失效（规范 §4.1.2）。
> 🔴 **若执行者认为需要新开行**：必须走 §5.1 的 H-A 流程（**人拍板**），**不许 agent 自行开行**。
> **唯一真值在 `HUMAN-人工验证台账.md`**，本节**只给索引、不复制结论**。

---

## 六、验收测试

> 判据分两类：**结构判据**（A1–A7，便宜、先行）与**编译/测试判据**（A8–A9，贵、后行）。
> 每条都给**命令 + 期望 + 失败处置**。**判据必须是充分的**（规范 §7.1），不许只写启发式指标。

### A1 · 冲突标记归零（**充分判据**）

```powershell
$R = "E:\AI_Chating\cyrene-agent"
git -C $R diff --name-only --diff-filter=U          # 期望：（无输出）
git -C $R grep -l -E '^<<<<<<< ' -- .              # 期望：只剩 2 个 P0 既有证据文件
```

| | 期望 | 失败处置 |
|---|---|---|
| `--diff-filter=U` | **0 行** | 还有未 `git add` 的文件；逐个 `git add --` |
| 标记扫描 | **只命中 2 个文件**：`.cyrene-merge-analysis/MERGE-REPORT.md` 与 `.cyrene-merge-analysis/preserved/bak-modal-workspace.ts` | 🔴 若命中**其他**文件 ⇒ **S1 类停工**：那些文件被"误 `add` 了带标记的内容" ⇒ 逐个回退（§八 R-1）后重做 |

> ✅ **「不算失败」的情形（提前写明）**：上述 2 个文件**本来就有标记**（P0 时代入库的历史内容），
> 且 `git status` 可证**本 Phase 未触碰**它们 ⇒ **它们出现在扫描结果里不算残留**（J-10 口径② / J-15）。
> 📌 **同样地**：`docs/design/react-frontend-visual-guidelines.md` 等 3 个 DU 目标**仍在磁盘且未跟踪** ⇒ `Test-Path` 恒 `True`，
> **不构成失败**（**删除判据一律用索引口径**：`git ls-files --error-unmatch` → exit ≠ 0）。

### A2 · 冲突块归零（**计数判据 + 交叉验证**）

```powershell
$tot = 0
foreach ($f in (git -C $R ls-files)) {
  $p = Join-Path $R $f
  if (Test-Path -LiteralPath $p) {
    $n = ((Get-Content -LiteralPath $p -Encoding UTF8 -ErrorAction SilentlyContinue |
           Where-Object { $_ -match '^<<<<<<< ' }) | Measure-Object).Count
    $tot += $n
  }
}
$tot    # 期望：2（就是 A1 的两个例外里的标记数）
```

| 期望 | 失败处置 |
|---|---|
| **= A1 例外文件里的标记数**（先数一遍那 2 个文件，得 N；本判据 = N） | 多出来的 = 有文件漏删标记 ⇒ 用 `git grep -l -E '^<<<<<<< '` 定位后逐个清 |

> 🔴 **为什么这条必须写"= 例外里的标记数"而不是"= 0"**：**判据的阈值要能解释来源**（经验 **J-19 / J-22**：报数必须带口径）。
> 直接写 0 会在 A1 已声明的例外上**自相矛盾**，逼执行者"人为放宽到失效"（D29 的教训）。

### A3 · 40 个块逐块已处置（**清单判据**）

```powershell
# 逐块对照 §二 E2 表，检查每个文件里"我方标识"与"官方标识"是否同时存在
# 示例（完整清单见 §七 产出物 p3-disposition.md）
{ 'document-index-queue','registerZonesIpc','registerWikiMemoryIpc','initializeKnowledgeBase' } |
  ForEach-Object { "$_ = $((git -C $R grep -c -- $_ -- src | Measure-Object -Line).Lines)" }
# 期望：4 个标识的文件数都 ≥1
```

| 期望 | 失败处置 |
|---|---|
| §七 清单里每条"两方标识都应在"的都 **≥1** | 缺哪个 ⇒ 回到该块，说明**取了单侧** ⇒ 改为并集 |

> 📌 **这条判据的形状很关键**：它**不看"冲突标记有没有了"**（那是 A1），而看"**两侧的内容是不是都在**"。
> A1 全绿 + A3 红 = **最危险的情形**（标记删了、功能也删了，编译可能都不报错）。

### A4 · **11 项功能基线不退化**（**总蓝图 §七 的基线，逐项**）

```powershell
$R = "E:\AI_Chating\cyrene-agent"
# 逐条跑总蓝图 §七 的 11 项标识（示例 4 条，完整 11 条见总蓝图 §七 与 protected-features-baseline.json）
foreach ($k in 'memory-console','groupContextLimit','buildGroupContextBlock','USAGE_BADGE','ZONES_','confirmValue','audit-log','tool-access','keyword-policy','group-corpus','person-erasure') {
  "$k => $((git -C $R grep -c -- $k -- src | Measure-Object -Line).Lines) 个文件"
}
# 期望：每项 ≥ 基线文件数（见 .cyrene-merge-analysis/protected-features-baseline.json 的「文件数」列）
```

| 期望 | 失败处置 |
|---|---|
| 每项命中文件数 **≥ 基线**（**允许增加，不允许减少**） | 减少 ⇒ 定位到具体块，按 §四 4.2 对应行改回并集；**并在 §五 登记一条 H-C**（若确实无法在本 Phase 恢复） |

> 🔴 **退化必须能归因**（判据 **J-02**）：若某项确实降了，**唯一可接受的归因**是"**它的载体文件在 P2 的删除 17 里**"。
> 其他任何归因 ⇒ **S6 停工**。

### A5 · **引用面：无对已删文件的引用**（**充分判据**）

```powershell
$R = "E:\AI_Chating\cyrene-agent"
$DELETED = @(
  'src/renderer/settings/api/dom.ts','src/renderer/settings/appearance/dom.ts','src/renderer/settings/channels/dom.ts',
  'src/renderer/settings/channels/panel.ts','src/renderer/settings/default-dialogs-regression.test.ts',
  'src/renderer/settings/general/dom.ts','src/renderer/settings/mcp/modal-interaction.test.ts','src/renderer/settings/music/dom.ts',
  'src/renderer/settings/preferences/dom.ts','src/renderer/settings/shared/save-status.ts','src/renderer/settings/shared/shell.ts',
  'src/renderer/settings/timeout/dom.ts','src/renderer/settings/timeout/panel.ts'
)
foreach ($f in $DELETED) {
  $base = [System.IO.Path]::GetFileNameWithoutExtension($f)
  $hits = git -C $R grep -n -- "$base" -- src 2>$null | Where-Object { $_ -notmatch [regex]::Escape($f) }
  if ($hits) { "🔴 仍有引用: $f"; $hits | Select-Object -First 3 | ForEach-Object { "      $_" } }
}
"(以上无输出 = 13 个 UD 删除目标均无残留引用)"
```

| 期望 | 失败处置 |
|---|---|
| **无输出**（13 个删除目标零引用） | 有引用 ⇒ 那个引用点就在某个 UU 的冲突块里 ⇒ 回到该块，把引用**改成官方的新实现**（不是"把文件找回来"） |

### A6 · **18 个救回模块有消费者**（**反向判据：不许孤儿**）

```powershell
$R = "E:\AI_Chating\cyrene-agent"
$RESCUED = @(
  'src/main/rag/document-cache.ts','src/main/rag/document-index-ipc.ts','src/main/rag/document-index-queue.ts',
  'src/main/rag/document-index-worker.ts','src/main/services/embedding/embedding-index-service.ts',
  'src/main/sticker-embedder.ts','src/main/sticker-embedding-cache.ts','src/shared/document-index.ts',
  'src/renderer/settings/shared/modal.ts','src/renderer/settings/shared/modal-state.ts',
  'src/renderer/settings/shared/dialog-focus.ts','src/renderer/settings/memory/dom.ts'
)
foreach ($f in $RESCUED) {
  $n = (git -C $R grep -l -E ([regex]::Escape([System.IO.Path]::GetFileNameWithoutExtension($f))) -- src 2>$null | Measure-Object).Count
  "{0,-58} 消费者={1}" -f $f, $n
}
```

| 期望 | 失败处置 |
|---|---|
| 每个模块 **消费者 ≥1**（除纯类型/被同链文件引用者） | 消费者 = 0 ⇒ **"能力在、入口没了"**（经验 **A56**）⇒ 定位它原本的消费者（§七 清单里记着），回到那个 UU 块把 import 补回 |

> 🔴 **这条是 M2 / J-04 的最终验收**：P2 花了力气把这 18 个文件从静默删除面救回来，
> **如果 P3 在处置 UU 时把它们唯一的 import 删掉，救回就完全白做**（文件在、入口没了）。
> 📌 **已知必须存在的入口**（实测）：`default-dependencies.ts` ← `document-index-{queue,worker}`；
> `chat-ui-ipc.ts` ← `document-index-{ipc,queue,worker}`（**静默重叠区，见 §四 4.4 ①**）；
> `preload/index.ts` ← `shared/document-index`；`modal.ts` ← `dialog-focus.ts`。

### A7 · **静默重叠 6 项**（见 §四 4.4，逐条期望值已列）

### A8 · **三套编译全绿**（**本 Phase 的核心判据**）

```powershell
$R   = "E:\AI_Chating\cyrene-agent"
$N24 = Join-Path $R '.node24\node.exe'
$TSC = Join-Path $R 'node_modules\typescript\lib\tsc.js'
foreach ($c in 'main','preload','renderer') {
  $out = Join-Path $R ".cyrene-merge-analysis\heb-p3\after-tsconfig.$c.log"
  New-Item -ItemType Directory -Force -Path (Split-Path $out) | Out-Null
  & cmd /c "`"$N24`" `"$TSC`" -p tsconfig.$c.json --noEmit > `"$out`" 2>&1"
  $rc = $LASTEXITCODE
  $errs = (Select-String -Path $out -Pattern 'error TS\d+' -Encoding UTF8 | Measure-Object).Count
  "$c : exit=$rc  errorTS=$errs"
}
```

| | 期望 | 失败处置 |
|---|---|---|
| `exit` | **0**（三套都 0） | ≠0 ⇒ 看 `error TS\d+` 的行；**按"每个块的处置"归因**（§三 S6） |
| `error TS\d+` 计数 | **0** | >0 ⇒ 先看**文件**：错误落在哪个 UU ⇒ 回到那个块；落在**非 UU** ⇒ **S5/S6 停工**（本 Phase 不改非 UU 文件） |

> 🔴 **口径三条（经验 J-14 / J-19 / C41）**：
> ① **`error TS` 后面必须跟 `\d+`** —— 只写 `'error TS'` 会把**日志头部标签**也数进去（P1 复核实测：一条全绿的日志里 `'error TS'` 命中 **2** 行，那是表头）；
> ② **Node 一律全路径** `$R\.node24\node.exe` —— `$env:PATH` 不跨进程，会静默用机器上的 Node 22（**J-17 家族**）；
> ③ **`--noEmit` 对 `renderer` 是冗余的**（它的 tsconfig 里已经 `noEmit: true`），但**对 main/preload 是必需的**（否则会写 `dist/`，**污染工作区**、让 P4 的提交面变大）。
> 📌 **对照线是 P1 的三份基线日志** `.cyrene-merge-analysis/heb-p1/baseline-tsconfig.{main,preload,renderer}.log`（**全 0 错**）。
> 🔴 **不许把"P3 之后变绿/变红"归因给 TS 版本** —— 本 Phase 明确**不升 TS**（§九 坑 6）。

### A9 · **全量测试不退化**（**P5 的判据提前跑一次**）

```powershell
$R   = "E:\AI_Chating\cyrene-agent"
$N24 = Join-Path $R '.node24\node.exe'
$out = Join-Path $R '.cyrene-merge-analysis\heb-p3\fulltest.log'
& cmd /c "`"$N24`" `"$R\node_modules\vitest\vitest.mjs`" run > `"$out`" 2>&1"
Select-String -Path $out -Pattern 'Test Files|Tests ' -Encoding UTF8 | Select-Object -Last 4
```

| | 期望（**P1 基线**） | 失败处置 |
|---|---|---|
| 文件数 / 通过数 | **563 文件 / 5433 通过 / 1 skipped** | 见 §九 坑 7 的四步归因法 |
| 失败数 | **不高于基线**，且**失败用例必须能归因**到"P2 的删除 17"或"本 Phase 的某个块" | 不能归因 ⇒ **S7 停工** |

> ⚠️ **不算失败**：① 失败用例的文件**在 P2 的删除 17 里**（该测试文件已被删 ⇒ 它不会跑，"失败"其实是**别的**原因）；
> ② 与**外部服务 / 真实渠道**相关的用例（无网络 / 无 NapCat 时的 skip）；
> ③ 用例数**上升**（官方新增测试随合并带进来）—— **上升不算退化**。

### A10 · **IPC 契约测试单跑**（**本 Phase 特有的补充判据**）

```powershell
$out = Join-Path $R '.cyrene-merge-analysis\heb-p3\ipc-contract.log'
& cmd /c "`"$N24`" `"$R\node_modules\vitest\vitest.mjs`" run src/main/application/ipc-contract.test.ts > `"$out`" 2>&1"
Select-String -Path $out -Pattern 'Tests |Test Files' -Encoding UTF8
```

| 期望 | 失败处置 |
|---|---|
| **全通过** | 红 ⇒ 报错信息会指出**哪个 IPC 键**没有使用点/注册了多次 ⇒ 回到 `ipc-channels.ts`（第 40 行）或对应 handler 的块 |

> 🔴 **为什么单列**：`ipc-contract.test.ts` 是**唯一**会同时看"声明侧（`shared/ipc-channels.ts`）"与"使用侧（main / preload）"的测试，
> 而本 Phase **恰好在那两个地方都动了**（第 40 行删 channel、第 10/31 行动 handler）⇒ 它是**最可能红**的一条。

### A11 · **两个 i18n JSON 可解析且键对称**

```powershell
$R = "E:\AI_Chating\cyrene-agent"; $N24 = Join-Path $R '.node24\node.exe'
foreach ($f in 'src/renderer/react/i18n/en.json','src/renderer/react/i18n/zh-CN.json') {
  & cmd /c "`"$N24`" -e `"JSON.parse(require('fs').readFileSync('$f','utf8'));console.log('OK')\""
}
# 键对称（本 Phase 只动了一个块，比对整体键集合成本可接受；若太慢可只比该块所在对象的键）
```

| 期望 | 失败处置 |
|---|---|
| 两个文件都打印 `OK` | 解析失败 ⇒ 第 38/39 行的**逗号**没处理好 ⇒ 回去改 |
| 两个文件的键集合一致 | 不一致 ⇒ 漏了一侧 ⇒ 补 |

---

## 七、产出物清单

| 文件 | 内容 | 规模（估） |
|---|---|---|
| **`.cyrene-merge-analysis/heb-p3/p3-disposition.md`** ★ | **逐块处置清单**：40 行 × （文件 / 块号 / 行号 / 模式 / 取哪侧 / **一句话理由** / 引用依据）。**本 Phase 的核心交付物**，供 P4 与 P5 直接消费 | 8–12 KB |
| `.cyrene-merge-analysis/heb-p3/after-tsconfig.{main,preload,renderer}.log` | P3 的三套编译输出（与 P1 基线同名对照） | 3 × ≤ 5 KB |
| `.cyrene-merge-analysis/heb-p3/fulltest.log` | 全量测试输出 | 数十 KB |
| `.cyrene-merge-analysis/heb-p3/ipc-contract.log` | IPC 契约测试单跑输出 | 数 KB |
| `.cyrene-merge-analysis/heb-p3/uu-conflict-blocks.txt` | **起草本蓝图时生成的** 40 块原文转储（含乱码，**仅作原始证据**） | 39.7 KB |
| **`wip/p3-src`**（git ref） | 20 个 UU 处置后的**源码快照**（兜底） | ref |
| `docs/construction/HEB-1.3.0/TASK-H1.3.0/PHASE-3-完成报告.md` | 完成报告（10 节 + §十一 复核补正待填 + §十二 施工记录） | 文档 |

> 📌 **目录白名单提醒**：`.cyrene-merge-analysis/heb-p3/` 与 P1/P2 一样**不在 `.gitignore` 白名单里**
> （白名单只放开了 `heb-p1/*`，见 `.gitignore` 末段）⇒ 它们**默认是未跟踪**。
> 若要让它们入库，**必须先补白名单**（**这会改 `.gitignore`，属计划外改动，必须单列进 §十二**）。

---

## 八、回退方法（分级；**每条都写"怎么验"**）

| 级别 | 动作 | 适用 | 怎么验它成功了 |
|---|---|---|---|
| **R-1 · 单文件回退**（撤销某文件的处置） | `git -C $R checkout -m -- <file>` | 某个文件处置错了，想重做 | 该文件**重新出现冲突标记**（`UU` 状态回来）；`git status --porcelain -- <file>` = `UU` |
| **R-2 · 全部冲突回退**（放弃本 Phase 全部内容改动） | 逐个文件 `git -C $R checkout -m -- <20 个 UU>` | 想从头再来 | 冲突数回到 **20**；`wip/p3-src` **不受影响** |
| **R-3 · 回到 P2 出口**（回到"冲突 20、无内容改动"） | 同 R-2；再 `git checkout wip/p2-docs -- docs/construction/` 恢复文档 | 本 Phase 全线失败 | `diff --diff-filter=U` = **20**；`MERGE_HEAD` 仍在 |
| **R-4 · 放弃整个合并** | 🔴 `git -C $R merge --abort` | **只在"确定要重做 P2+P3"时** | 回到 `9920635f`；**⚠️ 会丢失 P2 的 18 个救回** ⇒ 必须重跑 P2 |
| **R-5 · 从快照恢复源码** | `git checkout wip/p3-src -- <file>` 或 `git cherry-pick wip/p3-src` | R-1 不够、想整体回到"P3 已处置完"的状态 | `git diff --name-only wip/p3-src~1 wip/p3-src` = 恰 **20** 个文件 |
| **R-6 · 数据面** | 🔴 **本 Phase 无数据面动作**：不碰 `node_modules`、不碰用户数据、不碰备份 | — | `node_modules` 文件数与 P1 基线一致（132037）；`%APPDATA%\live2d-cyrene` **未被本 Phase 触碰**（本 Phase 不运行应用） |

> 🔴 **三条禁令（写进 §十二 也要再写一遍）**：
> **① 不 `merge --abort`**（在 P3 语境下它 = 销毁 P2 成果）· **② 不 `stash`**（会破坏合并状态，坑 5）· **③ 不 `git clean`**（它分不清"合并中被删"与"未跟踪"，坑：会把 3 个 B-01 遗留与 66 个未跟踪项一起删掉）。
> 🔴 **`checkout -m` 的 `-m` 是必需的**：不带 `-m` 时 git 会拒绝覆盖"有本地改动的冲突文件"（`error: you need to resolve your current index first`）。

---

## 九、已知坑（本 Phase 相关 + 复现情况）

> 按 H/M/L 检索自 [BLUEPRINT-经验库-通用.md](../methodology/BLUEPRINT-经验库-通用.md) 与
> [BLUEPRINT-经验库-具体坑.md](../methodology/BLUEPRINT-经验库-具体坑.md)。**只列与本 Phase 相关的**。

| # | 坑（键号） | 本 Phase 的风险点 | **规避写法（直接照做）** |
|---|---|---|---|
| 1 | **`git rm` / `git add` 的失败是整体的**（**C30 / C49**） | 批量 `git add` 某目录会把**不该入库的**一起加进来（P0/P1/P2 各踩过一次） | **逐条单文件** + **必须写 `--`**：`git add -- <file>`；**不许** `git add -A` / `git add docs/` |
| 2 | 🔴 **命令 exit 0 ≠ 内容写进去了**（**C49**，P2 复核实测） | 本 Phase 的快照步骤（§四 4.5）如果只看 `rc`，会造出**"成功但为空"**的快照 | 快照后**逐文件比 blob**：`git rev-parse <ref>:<f>` vs `git hash-object -- <f>`，**不一致数必须 0**，**且在校验通过前不移动 ref** |
| 3 | 🔴 **按清单审计会漏掉清单外的东西**（**C24**，本项目已复现 **4 次**） | 只按 §二 E2 的 40 行表处置 ⇒ 会漏掉：**静默重叠第 6 个（`core-bootstrap.ts`）**、**3 个 rename**、**7 个失效项**（E5） | 本蓝图已把它们**单列成节**（§二 E4/E5/E6）；执行时**逐节打勾**，不要只打 §四 4.2 的表 |
| 4 | **`Measure-Object -Line` 会少算**（**C38**，已复现 3 次） | 数行数 / 数块数时得到**假的偏小值** | 一律用 `(Get-Content … -Encoding UTF8).Count` 或 `(... \| Measure-Object).Count`（**不用 `-Line`**） |
| 5 | **合并中途 `stash` 会破坏合并状态** | 见 §八 禁令 | 全程不 stash；要"暂存"就用 `wip/` 分支快照（§四 4.5） |
| 6 | 🔴 **两个变更源不叠在同一批验收里**（规范 §4.1.3 硬要求 5） | 若本 Phase 顺手升 TS / 跑 `pnpm install`，**A8 的红绿将无法归因**（是冲突解错了？还是 TS 升级？） | 🔴 **本 Phase 不升 TS、不跑 install**（判据 **J-17**）；TS 升级与依赖安装**留给 P5 单独做**，并**单独记一次编译对比** |
| 7 | **"全绿"要从"判执行者对错"改成"判判据缺前提"**（复核四步归因法，规范 §5.2） | A8/A9 红时容易误判为"我改错了" | 四步：**(a)** 失败面是否落在本 Phase 改动面内（`git diff --stat wip/p3-src~1 <当前> -- <该目录>` 是否为空）→ **(b)** 隔离复现（单跑该文件）→ **(c)** 机制命中（工具捕获的 stderr 与手工复现是否吻合）→ **(d)** 修环境后是否转绿 |
| 8 | **annotated tag 的裸 `rev-parse` 不解包**（**J-12**） | 若要用 tag 取目标 | 一律写 `official-target-8fe5ba7a^{commit}` |
| 9 | **`$env:PATH` 不跨进程 ⇒ 静默用错 Node**（**J-17 家族**） | 编译门禁跑到 Node 22 上 | **全路径** `$R\.node24\node.exe`；且 `tsc` 用 `node_modules\typescript\lib\tsc.js`（**不依赖 PATH**） |
| 10 | **表格单元格里的裸 `\|` 会撑破单元格**（**C39 / C40**） | 本蓝图的**逐块表**里有大量代码片段 ⇒ 若写进表格会撑破列 | 本蓝图的代码片段一律放**代码块**，表格里只放**路径与短标识**（已遵守） |
| 11 | **PowerShell 内联长命令失败会被吞成空数组**（**C48**，P2 复核实测） | §六 的判据里若内联 `git ls-files`（2723 项）会失败 | 一律 **`Set-Content` 落盘 → `Get-Content` 读回**，并**校验行数 > 0** |
| 12 | **报数不带口径**（**J-19 / J-22**） | §七 清单里的"处置了 40 块"这类数字 | 每个计数**带时点与口径**（例："40 = 处置前数于 `9920635f` 的 `^<<<<<<<` 标记数"） |

### 本次**新出现**、值得警惕的两条（建议入经验库，见 §十二 T4）

| 新坑 | 一句话 | 建议级 |
|---|---|---|
| **"标记删了 = 冲突解了"是错的** | `git add` 之后 `UU` 消失，**看起来"解决了"**，但如果处置时只取了一侧，**功能也一起没了，而编译可能完全不报错**（例：只取官方那侧 ⇒ 丢的是我们自己的调用） | **M** |
| **"同一文件不同块要取不同侧"** | `build-options.ts` 的 3 块分别是 **P3 / P1 / P7**；`rag/index.ts` 的 5 块横跨 5 种模式 ⇒ **按文件整体取 ours/theirs 必然出错** | **M** |

---

## 十、给下一个 Phase 的交接提示（**P4 提交 / P5 保真核验**）

1. 🔴 **P4 必须仍在同一个合并上提交** —— `MERGE_HEAD` 会在本 Phase 出口**继续在场**（本 Phase **不提交**）。
   P4 的动作 = 一条 `git commit`（把整个合并落成一个提交）+ 把 §七 的文档与 `p2-disposition.txt` / `p3-disposition.md` 一起收口。
2. 🔴 **本 Phase 出口的索引状态**：冲突 **0**、`git status --porcelain` 里 **0 个 `UU`**、**未提交**（HEAD 仍是 `9920635f`）。
   若 P4 开工时看到 `UU ≠ 0` ⇒ **状态被人动过**，先查 §八 R-1。
3. 🔴 **不要动 `vitest.config.mts` 的名字**（E6 的 rename 是合并内容）；**不要"改回" `vitest.config.ts`**。
4. 🔴 **TS 仍是 5.9.3**（判据 **J-17**）。P5 若要做 TS 6 升级，**必须单独一次**并单独记编译对比 ——
   官方 lockfile 已钉 `typescript@6.0.3`（实测 `pnpm-lock.yaml` 里同时有 `5.4.5` 与 `6.0.3` 两个条目）。
5. 🔴 **依赖安装留给 P5**：本 Phase **没跑 `pnpm install`**。P5 若要跑，**必须先备份 `node_modules`**
   （P1 的备份在 `E:\AI_Work\备份\cyrene-pre-P1-2026-10-04\`，实测 `MATCH ✅`），
   而且**这是 H-15**（"依赖树未经 pnpm 验证"）的销账点 —— **H-15 在 P3 未闭合，转 P5**。
6. 🆕 🔴 **P5 的保真核验面（判据 J-22）**：一级面 **91**（= 16 UD + 75 静默），**另加 3 个 rename 旧路径** ⇒
   **会从树上消失的路径 = 94**。**不要用 88 / 72 当分母**（见 `PHASE-2-完成报告.md` §十一 11.6）。
7. 🆕 🔴 **P5 的删除判据一律用索引口径**（`git ls-files --error-unmatch` → exit ≠ 0），
   **不可只用 `Test-Path`**（3 个 DU 的未跟踪副本仍在磁盘，`Test-Path` 恒 `True`）。
8. 🆕 🔴 **`p3-disposition.md` 是 P5 的输入之一**（逐块理由）—— **只增不删**。
9. ⚠️ **退出前确认 `wip/p3-src` 已建**：它是 P4 提交前唯一能恢复"P3 已处置完"状态的兜底（§四 4.5）。
10. ⚠️ **`package.json` 有 2 处计划外改动**（`version` → `1.3.0`、`allowScripts` 的 electron 条目）
    ⇒ **P4 提交前确认它们有意进入提交**，并在提交信息里能看出来（§四 4.2 第 2/3 行）。
11. ⚠️ **首次启动的数据风险已登记**（§五 5.3 a）⇒ **P6 必须先备份 `%APPDATA%\live2d-cyrene`**。
12. ⚠️ **本 Phase 未处理 66 个未跟踪条目**（其中 3 个是 B-01 遗留）⇒ 归 **P5 / 结项**；**禁用 `git clean`**。

---

## 十一、改动的目标达成核对（**执行后回填**）

> 执行者**完成本 Phase 后**逐条回填；**未回填完整不得写完成报告**。

| 目标（§1.2） | 状态 | 证据（命令 + 输出 / 数字） |
|---|---|---|
| **T1** 40 个块逐块处置 | ⬜ | |
| **T2** 11 项功能基线 + 18 个救回链不丢 | ⬜ | |
| **T3** 收下官方全部新能力 | ⬜ | |
| **T4** 静默重叠 6 项核对 | ⬜ | |
| **T5** 无对已删文件的引用 / 救回模块有消费者 | ⬜ | |
| **T6** 三套编译全绿 | ⬜ | |
| **T7** 全量测试不退化 | ⬜ | |
| **T8** 处置清单落盘 | ⬜ | |
| **T9** `wip/p3-src` 快照 | ⬜ | |

**非目标遵守情况**（逐条确认）：
⬜ 未提交 · ⬜ 未 abort / 未重 merge / 未 stash · ⬜ 未增删文件 · ⬜ 未跑 install · ⬜ 未改 `tsconfig.*` / `vite.config.mts` / `electron-builder.yml` · ⬜ 未升 TS · ⬜ 未 `git clean`

**人工环节达成核对**：⬜ 本 Phase 无新增 `H-nn`（§五）· ⬜ §五 5.3 的三条已并入台账 `H-10…H-14` 的期望值列

**回写清单已闭合**：⬜（见完成报告 §十）

---

## 十二、施工记录（**执行者追加**，见规范 §8）

> 子节按需增减，**1 / 2 / 4 / 5 为必需**。
> 0 · 人工环节回执（索引，**不复制结论**）
> 1 · 偏离蓝图之处
> 2 · 蓝图未覆盖、施工中发现的漏洞
> 4 · 有意保留的"不处理"点
> 5 · 验收（实测数字）
> 8 · 待做 / 未做
> 🆕 **9 · 计划外改动（本 Phase 预期至少有 2 处：`package.json` 的 `version` 与 `allowScripts` 条目）**

---

## 附：本蓝图的证据来源与可复算声明

| 证据 | 来源 | 复现方式 |
|---|---|---|
| 冲突面 20 UU / 40 块 | 本机实测（2026-10-04，`HEAD=9920635f`） | §二 E1/E2 的命令 |
| 逐块基线判定（`O=base` / `T=base` / 双方新） | 本机实测（机械判定，非人工阅读） | §二 E2 的脚本 |
| 静默重叠 6 个（+ 3 个空操作） | 本机实测（`--numstat` 两侧相减 + `status` 判"未进冲突"） | §二 E4 / E5 的命令 |
| 3 个 rename | 本机实测（`git diff --name-status` 的 `R` 记录） | §二 E6 |
| 官方删除集 95 / 98（口径差异） | P2 复核实测 | `PHASE-2-完成报告.md` §十一 11.6；判据 **J-22** |
| `memoryMode` 四模式 | 读官方文件 `src/main/memory/memory-mode.ts`（已随合并在索引里） | `git show :src/main/memory/memory-mode.ts` |
| `user-data-migration` 的迁移语义 | 读官方文件 `src/main/user-data-migration.ts`（108 行，已在索引里） | `git show :src/main/user-data-migration.ts` |
| 依赖版本 | 读官方 `pnpm-lock.yaml`（601 KB，已在索引里） | `Select-String -Path pnpm-lock.yaml -Pattern 'typescript@\|electron@\|vitest@'` |
| 11 项功能基线 | P0 基线快照 | `.cyrene-merge-analysis/protected-features-baseline.json` |
| P1 编译基线 | P1 交付物 | `.cyrene-merge-analysis/heb-p1/baseline-tsconfig.*.log` |

> 🔴 **本蓝图的已知不确定性（如实声明）**：
> ① §四 4.2 的**逐块处置**是**基于"两侧各自在做什么"的语义判断**，不是机械可推导的 —— 其中 **4 个 `双方base` 块（第 15/18/19/23/24 行）** 的判断依据是"读懂两侧意图"，**执行者若发现更优解，以真实代码为准**（规范 §1 原则 3），并在 §十二 记明；
> ② §四 4.2 第 40 行（`ipc-channels.ts`）的"留哪几个"依赖**运行期引用面**，本 Phase 只能给**静态引用面**判据 ⇒ 已登记为 P6 待验项 a/b/c 之外的第 4 类不确定性（建议 P6 一并看）；
> ③ **本蓝图未逐行核对 `rag/index.ts` / `memory-user-ipc.ts` 两个大文件的冲突区外内容** —— 它们各有 400+ 行改动，属 **P5 保真核验**的范围（分层：文件层 / 符号层 / 入口层 / 桥接层）。
