# Phase 4 施工蓝图：合并收口提交与入口接回销账

> **执行者**：agent。本文件自包含，不需要对话历史即可执行。
> **风险等级**：**中**（**本 Phase 是全任务唯一产生 git 提交的阶段**；提交一旦生成，回退从"改文件"升级为"改历史"）
> **预计耗时**：**20–40 分钟**（提交本身很快；时间花在**提交前的三张确认表**与**提交后的双父核验**上）
> **文档规范**：见 `../methodology/BLUEPRINT-撰写规范.md` §4（**跨目录跨路径，不写裸文件名**）
> **前置**：P3 已完工并复核；**仓库仍处在"合并进行中"**（`MERGE_HEAD` 在场、冲突 0、未提交）

> ⚠️ **本 Phase 的做法已因实测收窄，执行者请按本文档执行，不要按旧版总蓝图的描述执行**
> —— **原计划**：P4 = "**5 处语义对撞处置** + 入口接回销账"。
> —— **实测结论**：那 5 处（更准确说是 **4 个 `双方base` 冲突块**：`build-options.ts#3` · `index.ts#3` ·
>   `tool-registry.ts#1#2`）**已在 P3 处置完毕** —— 因为**不解决它们 `UU` 不会消失、`tsc` 也就跑不了**，
>   P4 的结构性前提（"全绿后再提交"）**要求它们必须留在 P3**。
> —— **新做法**：**P4 = 把这一整棵合并树落成一个提交 + 核验 + 收口**（本文件）。

---

## 一、施工目标

### 1.1 核心问题（带 `file:line` 根因）

**当前仓库停在一个"即将提交的合并"上**，状态实测（2026-10-04，P3 出口 + 执行者回写后）：

```text
HEAD         = 9920635f52ca8c9e4b148a15c63e5135108dfdb0   ← 仍是合并前的那一笔（master）
MERGE_HEAD   = 8fe5ba7a5b3a86043b8034abeaa98f72f7459039   ← 官方目标（第 2 父）
merge-base   = b11b88512cf0cf6dace56b59ff9487947ef01c28
冲突          = 0                                        （`--diff-filter=U`）
索引 vs HEAD  = 726 files / +55924 −53108                （A 274 · D 70 · M 384 · R 3）
工作区        = 未跟踪 71 条，**无未暂存改动**
```

**问题**：这 726 项改动**全部只在索引里**。`git log` 里**看不到这次合并**，
`HEAD` 还指着合并前的状态 —— 任何人执行 `git checkout` / `reset --hard` / 换机器，
**P2 的 18 个救回 + P2/P3 的 40 个冲突块处置 + P3 的依赖面恢复会一起消失**。
⇒ **必须落成一个真实的 merge commit**（这既是 M7 分步合并的既定终点，也是 P5 能有稳定基线的唯一方式）。

**第二个问题（更隐蔽）**：`git` 已经准备好一份**会被误读的默认提交信息**（实测 `.git/MERGE_MSG` 原文）：

```text
Merge commit 'official-target-8fe5ba7a^{commit}'

# Conflicts:
#	.gitignore
#	README.en.md
#	README.md
#	… （共 41 个文件）
```

🔴 **这 41 个文件已经被处置完毕了**，但默认信息**把它们当成未解决的冲突列出来** ——
直接 `git commit`（不加 `-m` / `-F`）会把这个**误导性的列表写进永久历史**。
⇒ **本 Phase 必须自己写提交信息**（见 §四 4.3）。

### 1.2 目标清单（可勾选）

| # | 目标 | 判据出处 |
|---|---|---|
| **T1** | 🔴 **生成 merge commit**：`-p 9920635f -p 8fe5ba7a`（**两个父**），包含索引里全部 726 项改动 | §六 A1 / A2 |
| **T2** | 🔴 **提交信息不含"未解决冲突"的误导列表**，且**显式写出 3 类计划外改动** | §六 A5 |
| **T3** | **核验提交正确性**：提交树 ≡ 索引（**0 差异**）· 两父齐备 · 合并状态清空 · 工作树干净 | §六 A4 / A8 |
| **T4** | **文档入库**：把 9 个 `docs/construction/**` 文档落成**独立一笔提交**（不与合并混在一起） | §六 A6 |
| **T5** | **无内容丢失**：`HEAD^1` 侧的全部文件 ∧ `HEAD^2` 侧的官方文件**都在提交树里**（**0 缺失**） | §六 A3 |
| **T6** | **11 项功能基线在提交后不退化**（与 P3 出口实测值逐项相同） | §六 A9 |
| **T7** | **产出可复算的核验清单**（父 / 树 / 构成 / 异常），供 P5 直接消费 | §七 |
| **T8** | **收口决策落盘**：`wip/*` 三个 ref 的**删留与理由**写进施工记录 | §四 4.6 + §十二 |

### 1.3 非目标（**明确不做**）

| 不做 | 为什么 | 何时做 |
|---|---|---|
| 🔴 **不做保真核验（四层）** | 那是**独立视角**的核验（文件层 → 符号层 → 入口层 → 桥接层），由**未参与施工**的人做才有效（规范 §5.3） | **P5** |
| 🔴 **不跑 `pnpm install`** | 依赖安装是**工具链变更源**（**H-15** 的销账点）；与"提交"混在一起会让 P5 的红绿**无法归因** | **P5** |
| **不 `git clean` / 不清理 71 条未跟踪条目** | 其中 3 个（`docs/design` / `internal-issue` / `refactor`）是 **B-01 登记在案的遗留**；`clean` 分不清"合并中被删"与"未跟踪" | **P5 / 结项** |
| **不改任何源码** | 本 Phase 是**收口**，不是施工；发现源码问题**登记**而不是顺手改（规范 §1 原则 2） | 发现问题时登记 BACKLOG |
| **不升 TS、不装依赖、不动 `tsconfig.*`** | 同 P3（判据 **J-17**） | **P5** |
| **不跑全量测试** | P3 出口刚跑过（583 / 5603 / 1 失败，**已归因**）；本 Phase **只改索引与历史、不改工作树内容** ⇒ 测试结果不会变。**再跑一遍 = 花 60 秒买同一个结论** | **P5**（装依赖后必须重跑） |
| **不推送远端** | 本地 master 与 gitee 镜像的关系未在本任务范围内；**推送是不可逆的外向动作** | 人决定 |
| **不删除 `wip/*` 中仍有用的** | 见 §四 4.6 的决策表 | P5 / 结项 |
| **不整理 `??` 里的证据目录** | `.cyrene-merge-analysis/heb-p{1,2,3}/` 与复核目录的入库需**改 `.gitignore`**（属计划外改动扩张） | P5 / 结项 |

---

## 二、实测证据（决定本 Phase 做法，**执行前请读**）★

> 全部数据测于 **2026-10-04**，时点 = P3 出口 + 执行者回写（`wip/p3-src` 刷新为 `6a1fb6fe` 之后）。

### E1 · 出口状态与两个父

```powershell
$R = "E:\AI_Chating\cyrene-agent"
git -C $R rev-parse HEAD            # → 9920635f52ca8c9e4b148a15c63e5135108dfdb0
git -C $R rev-parse MERGE_HEAD      # → 8fe5ba7a5b3a86043b8034abeaa98f72f7459039
git -C $R merge-base HEAD MERGE_HEAD # → b11b88512cf0cf6dace56b59ff9487947ef01c28
Test-Path (Join-Path $R '.git\MERGE_HEAD')   # → True
(git -C $R diff --name-only --diff-filter=U | Measure-Object).Count   # → 0
```

| 量 | 实测 | 说明 |
|---|---|---|
| `HEAD`（第 1 父） | `9920635f` | 我方分支 tip（含 P0/P1/P2 的文档提交） |
| `MERGE_HEAD`（第 2 父） | `8fe5ba7a` | 官方目标 |
| merge-base | `b11b8851` | 分叉点（全程未变） |
| 冲突 | **0** | P3 已解完 |
| `.git/MERGE_HEAD` · `MERGE_MSG` · `MERGE_MODE` · `ORIG_HEAD` | **四个都在场** | 合并状态完整（见 E4） |

### E2 · 索引构成（**提交会包含什么**）

```powershell
git -C $R diff --cached --name-status HEAD | ForEach-Object { $_.Substring(0,1) } | Group-Object
#   A 274  /  D 70  /  M 384  /  R 3
git -C $R diff --cached --shortstat
#   726 files changed, 55924 insertions(+), 53108 deletions(-)
```

| 状态码 | 数量 | 含义 |
|---|---|---|
| `A ` | 274 | 官方带进来的新文件（含 `desktop-typescript.mjs`、`learn-exam-*`、`vendor-registry/*` 等） |
| `D ` | 70 | 官方删除 + P2 确认接受删除的文件 |
| `M ` | 384 | 双方都动过、已处置的文件（含 20 个原 UU + P3 恢复的 7 个） |
| `R ` | 3 | 3 个改名（`search-code-tools*` → `search-text-tools*` · `vitest.config.ts` → `.mts`） |

### E3 · `.git/MERGE_MSG` 的原文（**本 Phase 必须替换它**）

见 §1.1 引用的原文。**要点**：它列出 **41 个** `# Conflicts:` —— 那是**P2/P3 的输入清单**，
**不是**提交时的未解决状态。**直接沿用 = 在历史里留一条假信息**（同族：**J-19** 报数不带时点）。

### E4 · 提交后必须消失 / 必须留下的东西

| `.git/` 下的文件 | 提交前 | 提交后 | 为什么 |
|---|---|---|---|
| `MERGE_HEAD` | 在 | **必须消失** | 合并由它标识；还在 = 没提交成功 |
| `MERGE_MSG` | 在 | **必须消失** | 同上 |
| `MERGE_MODE` | 在 | **必须消失** | 同上 |
| `ORIG_HEAD` | 在 | **保留**（值会变成提交前的 `HEAD`） | 它是"上一个位置"的记录，属正常 |

```powershell
foreach ($f in 'MERGE_HEAD','MERGE_MSG','MERGE_MODE','ORIG_HEAD') {
  "$f = $(Test-Path (Join-Path $R ".git\$f"))"
}
```

### E5 · 三条编译基线与全量测试（**P3 出口实测，本 Phase 不重跑**）

| 判据 | P3 出口实测 | 本 Phase 的态度 |
|---|---|---|
| `tsconfig.main.json` | **exit 0 / `errorTS=0`**（日志带 `[运行痕迹]`） | **不重跑**（本 Phase 不改工作树内容） |
| `tsconfig.preload.json` | **exit 0 / `errorTS=0`**（同上） | 不重跑 |
| `tsconfig.renderer.json` | **exit 2 / 4 错**（全为官方新依赖未安装：`@mantine/core` ×2 · `@tanstack/react-virtual` ×1 · 连带 `TS7006` ×1） | 不重跑；**P5 装依赖后必须复跑，期望 4 → 0** |
| 全量测试 | **583 文件 / 5603 通过 / 1 skipped / 1 失败**（失败 = `class-name-contract`，**早于本次合并的既有欠账**） | 不重跑；**P5 装依赖后复跑，期望 1 → 1（只剩它）** |
| 11 项功能基线 | **11/11 不退化**（`groupContextLimit` 实测 **9**，基线列的 11 是**过期值**） | **提交后复测一次**（§六 A9，**这是本 Phase 唯一要跑的东西，因为它零成本**） |

### E6 · 🔴 快照 `wip/p3-src` 与索引 **逐条全等**（**本 Phase 的"防丢"依据**）

> 这一条**必须写清楚测量口径**，因为**同一个问题在两种口径下会给出完全不同的答案**（实测）：

| 口径 | 结果 | 判定 |
|---|---|---|
| `git hash-object -- <file>`（**读工作区**）vs 快照 blob | **147 个不一致** | 🔴 **口径错**（见下面的根因） |
| **索引 blob**（`git rev-parse ":<path>"`）vs 快照 blob | **0 个不一致**（2683/2683 全等） | ✅ **正确口径** |

**根因（实测，非推断）**：本仓 **`core.autocrlf=true` 且没有 `.gitattributes`** ⇒
索引/blob 里存 **LF**，工作区是 **CRLF**；而 `git hash-object`（即使加 `--path=`）在这个配置下
**不会**做 CRLF→LF 归一化 ⇒ **同一份内容在两种口径下得到两个不同的 SHA**。
实测样本：`dist/renderer/splash.html` 的 `snap = HEAD = index = 2944579b57`，而 `hash-object = 914fe4ee8f`。

```powershell
# 正确口径（本 Phase 的防丢判据就用它）
$entries = git -C $R ls-tree -r -z wip/p3-src
$recs = @($entries -split "`0" | Where-Object { $_ -ne '' })
$bad = 0
foreach ($rec in $recs) {
  $tab = $rec -split "`t", 2
  if ($tab.Count -lt 2) { continue }
  $sha  = ($tab[0] -split '\s+')[2]
  $path = $tab[1]
  $idx  = git -C $R rev-parse ":$path" 2>$null
  if ($idx -ne $sha) { $bad++; Write-Host "🔴 不一致: $path" }
}
"快照 vs 索引：不一致 = $bad / $($recs.Count)   # 期望 0 / 2683"
```

⇒ **`wip/p3-src` 就是"索引区间的完整镜像"**：本 Phase 的任何失误都能从它恢复（§八 R-5）。

### E7 · 被推翻的原计划（**不要按旧描述执行**）

| 原计划（总蓝图旧文） | 实测结论 | 新做法 |
|---|---|---|
| "P4 = 5 处语义对撞处置 + 入口接回" | ❌ 那 4 个块**已在 P3 处置**（不解决就无法 `tsc`，P4 的前提就不成立） | P4 收窄为**收口提交 + 核验**（§1.1） |
| "提交用 `git commit`（默认信息即可）" | ❌ 默认信息里有 **41 行"未解决冲突"**的误导列表 | **自己写提交信息**（§四 4.3） |
| "P4 顺手把文档一起提交" | ⚠️ **合并进行中 git 结构性禁止部分提交**（P2 实证：`fatal: cannot do a partial commit during a merge.`，exit 128） | **先提交合并，再提交文档**（§四 4.5） |
| "`wip/p3-src` 可以删了" | ❌ 它是**当前唯一**能回到"P3 已处置完"状态的恢复点 | **提交并核验通过后才允许删**（§四 4.6） |

---

## 三、前置条件与停止条件

### 3.0 前置条件（**不满足则不得开始**）

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$R = "E:\AI_Chating\cyrene-agent"
$D = Join-Path $R 'docs\construction\HEB-1.3.0\TASK-H1.3.0'

# ① P3 报告的"回写清单"已闭合 —— 期望：0 行
#    ⚠️ 判据写法：找"表格行且含未勾选记号"的行。此处**不写出那个记号的字面**（防本蓝图自命中，D29 / J-05 / J-18）。
Select-String -Path (Join-Path $D 'PHASE-3-完成报告.md') -Pattern '^\|.*\[ \]' -Encoding UTF8

# ② 台账无未闭合拍板 —— 期望：0 行
Select-String -Path (Join-Path $D 'HUMAN-人工验证台账.md') -Pattern '^\|.*\[ \]' -Encoding UTF8

# ③ 合并仍在场、冲突 0 —— 期望：True / 0
Test-Path (Join-Path $R '.git\MERGE_HEAD')
(git -C $R diff --name-only --diff-filter=U | Measure-Object).Count

# ④ 两个父与 merge-base —— 期望三值全等
git -C $R rev-parse HEAD                      # 9920635f52ca8c9e4b148a15c63e5135108dfdb0
git -C $R rev-parse MERGE_HEAD                # 8fe5ba7a5b3a86043b8034abeaa98f72f7459039
git -C $R merge-base HEAD MERGE_HEAD          # b11b88512cf0cf6dace56b59ff9487947ef01c28

# ⑤ 索引里**没有未暂存改动**（工作树与索引一致）—— 期望：0 行
git -C $R status --porcelain | Where-Object { $_.Substring(0,2) -eq ' M' }
git -C $R status --porcelain | Where-Object { $_.Substring(0,2) -eq 'MM' }

# ⑥ 未跟踪条目数（基线，提交前后必须不变）—— 期望：71
(git -C $R status --porcelain | Where-Object { $_.Substring(0,2) -eq '??' } | Measure-Object).Count

# ⑦ 快照与索引全等（**E6 的正确口径**）—— 期望：0 / 2683
#    （脚本见 §二 E6；**不要**用 `git hash-object` 直接比，会得 147 个假不一致）

# ⑧ 三套编译与测试的 P3 出口证据在盘 —— 期望：全部存在且**带运行痕迹**
foreach ($n in 'after-tsconfig.main.log','after-tsconfig.preload.log','after-tsconfig.renderer.log','fulltest.log','ipc-contract.log') {
  $p = Join-Path $R ".cyrene-merge-analysis\heb-p3\$n"
  "$n : exists=$(Test-Path $p) size=$(if (Test-Path $p) { (Get-Item $p).Length } else { 0 })"
}
#    ⚠️ 两个编译日志必须含 `[运行痕迹]` 行（判据 J-23）；若为 0 字节 ⇒ 先按 §八 R-6 补跑

# ⑨ WIP 阈值门禁（规范 §2.4）—— 见下方"本 Phase 的例外声明"
(git -C $R status --porcelain | Measure-Object).Count
```

| # | 前置 | 期望 | 不满足时 |
|---|---|---|---|
| ① | P3 回写清单已闭合 | 0 行 | **不得开始**：回写是口径唯一来源（规范 §5.1） |
| ② | 台账无未闭合 H-A 拍板 | 0 行 | **不得开始**：先要人拍板 |
| ③ | `MERGE_HEAD` 在场 ∧ 冲突 0 | `True` ∧ `0` | 🔴 **停工**：前者=合并状态丢了（§八 R-7）；后者=有文件回退成 `UU` |
| ④ | 两父 + base 三值全等 | 全等 | 🔴 **停工**：起点/目标被改过 |
| ⑤ | 无未暂存改动 | 0 行 | ⚠️ **先弄清那是什么**：若是测试副产物（如 snapshot）⇒ 按 §八 R-4 处理；若是源码 ⇒ **停工报告** |
| ⑥ | 未跟踪 = 71 | 71 | ⚠️ 差异需归因；**若多于 71，先查是不是有人往仓库里写了新文件** |
| ⑦ | 快照 ≡ 索引 | 0 / 2683 | 🔴 **停工**：防丢依据失效，先弄清索引被谁改过 |
| ⑧ | P3 证据在盘且带运行痕迹 | 5 个文件 | ⚠️ 缺 `[运行痕迹]` ⇒ §八 R-6 补跑（**不阻塞提交**，但阻塞"用它当基线"） |
| ⑨ | WIP 门禁 | 见下 | — |

> 📌 **⑨ 本 Phase 对"WIP 阈值门禁"的例外声明（**必须写明**）**：
> 规范 §2.4 要求"未提交改动 > 20 条 ⇒ 先提交再继续"。本 Phase 开工时 `status` 有 **730+ 条**（726 索引项 + 71 未跟踪）——
> 但**这正是本 Phase 要解决的问题本身**：这些改动**就是这次合并**，而合并**只能整体提交**（git 禁止部分提交，见 §二 E7）。
> ⇒ **本 Phase 的存在就是这条门禁的销账动作**。**注意**：门禁的**时间维度仍然适用** ——
> 若 `git log -1 --format=%cr` 显示 `HEAD`（`9920635f`）距今 **> 3 天**，则**风险已实际累积**，
> 必须在 §十二 施工记录里写出这一事实与它的来源（合并跨越了 P2/P3 两个 Phase）。

### 3.1 停止条件（**命中即停工**）

| # | 触发 | 为什么必须停 | 停工后做什么 |
|---|---|---|---|
| **S1** | 前置 ①②③④⑦ 任一不满足 | 状态前提被破坏；**提交是"把当前索引固化成历史"**，索引错了就固化了错的东西 | 写报告说明哪条不满足 + 实测输出，**不提交** |
| **S2** | 🔴 **`git commit` 返回非 0** | 提交没成功，而 `.git/` 可能已被部分改写 | **立即**查 §二 E4 的四个文件 + `git status`；**不要**重试第二次 commit（可能造出重复提交） |
| **S3** | 提交后 `HEAD` 的父**不是** `9920635f` + `8fe5ba7a` | 提交的拓扑错了（例如误把 `MERGE_HEAD` 丢了） | **停工**；按 §八 R-1/R-2 处置 |
| **S4** | 提交后**出现未预期的文件变化**（`commit` 之外还有 `M`/`D`） | 可能是 hook / 编辑器 / 别的进程改了东西 | 停工，`git status` 全量留证 |
| **S5** | 需要**产品取向判断**（例如"要不要把某个功能改动一起带进提交"） | agent 不得替人做产品决定（规范 §4.1） | 登记 **H-A** 拍板行，**该步挂起** |
| **S6** | 11 项功能基线在提交后**低于** P3 出口实测值 | 说明提交把某些改动漏在外面了（**索引与工作树不一致**的典型症状） | 停工；`git diff HEAD -- <退化项所在文件>` 定位 |
| **S7** | 前置 ⑤ 发现**源码有未暂存改动** | 那说明"索引 ≠ 工作树"，提交会把工作树里那份**留在外面**（或把旧的那份固化） | 停工；先判断那份改动属谁（P3 遗漏？别的进程？） |

### 3.2 提交前的**最后一道自检**（建议做成一条命令块）

> 这套自检的立意：**提交是不可逆的历史动作**，而本 Phase 之前的三个 Phase 都验证过
> "**命令成功 ≠ 事情做对了**"（经验 **C49**）。所以**在按下提交之前**，把"要提交什么"完整打印一遍并逐条核对。

```powershell
# 打印"即将固化进历史的东西"，逐条与 §二 E2 / §四 4.2 的期望比对
git -C $R diff --cached --name-status HEAD | Measure-Object | ForEach-Object { "索引项 = $($_.Count)  （期望 726）" }
git -C $R diff --cached --shortstat                              # 期望 726 files, +55924 −53108
git -C $R diff --cached --name-status HEAD | Where-Object { $_ -match '^U' }   # 期望无输出（无未合并项）
git -C $R status --porcelain | Where-Object { $_.Substring(0,2) -in @(' M','MM','UU','AA','DD') }  # 期望无输出
```

---

## 四、改动清单（Agent 直接执行）

> **本 Phase 只做三件事**：① 提交合并；② 提交文档；③ 核验 + 收口决策。
> **不改任何源码**；每步都附"做完立刻能判的信号"。

### 4.1 顺序总览（**顺序敏感，不要重排**）

| 步 | 动作 | 为什么是这个顺序 |
|---|---|---|
| **①** | 跑 §三 3.0 的 9 条前置 + §三 3.2 的最后自检 | 先证"索引是对的"，再固化它 |
| **②** | 确认 §四 4.2 的**三张确认表**（计划外改动是否有意入库） | 提交后改就要 `--amend`（等于改历史） |
| **③** | 写提交信息文件（§四 4.3） | **不用** git 的默认 `MERGE_MSG`（E3） |
| **④** | `git commit -F <文件>` —— **这一步产生 merge commit** | 两个父由 `.git/MERGE_HEAD` 自动带入 |
| **⑤** | 立即核验（§六 A1–A5、A8、A9） | 提交后 30 秒内就能判对错；**错了越早发现越好** |
| **⑥** | 文档独立提交（§四 4.5） | 此时**合并已结束**，部分提交的限制消失 |
| **⑦** | 记录出口状态（§七 产出物） | 给 P5 一个明确的起点 |
| **⑧** | 收口决策：`wip/*` refs 的删留（§四 4.6） | 最后做，因为前面可能要回退 |

### 4.2 **提交前的三张确认表**（**逐条核，不许跳过**）

> 判据出处：规范 §4.1 硬要求 5「**两个变更源不叠在同一批验收里**」——
> 合并**必然**把三类"非冲突消解"的东西一起带进来；它们**必须被显式确认**，
> 否则将来没人分得清"这是合并带进来的"还是"有人顺手改的"（经验 **F3**：只写进报告的决定 = 失踪）。

#### 表 A · `package.json` 的三处**有意决策**（**本 Phase 最需要确认的一张**）

```powershell
git -C $R diff --cached HEAD -- package.json
```

| # | 改动 | 值 | 为什么是有意的 | 若判为"无意"怎么办 |
|---|---|---|---|---|
| A1 | `name` | `live2d-cyrene` → **`cyrene-agent`** | 它决定 Electron 的 `app.getPath("userData")`；官方配套 `src/main/user-data-migration.ts` 会把 `%APPDATA%\live2d-cyrene` **整体原子重命名**到新目录（P3 已核实该代码路径） | 改回会在**每次同步上游时再冲突一次**；且与官方的迁移链不自洽 |
| A2 | `version` | `1.2.2-PLUS` → **`1.3.0`** | 分叉期的临时标记；合并后必须跟上游，否则 `updater` 会认为"永远落后" | — |
| A3 | `allowScripts` 的 electron 条目 | `electron@43.1.0` → **`electron@44.4.3`** | 官方 lockfile 实测装的是 `44.4.3`，**旧条目已失配**（经验 **X20**：白名单条目带版本号，升级依赖会让旧条目失配） | — |

🔴 **A1 有用户可见后果**：合并后的**首次启动会移动用户数据目录**（`%APPDATA%\live2d-cyrene` → `%APPDATA%\Cyrene`）。
⇒ **已登记为 P6 的前置动作**（先备份再启动）；台账 `H-10`/`H-12` 已带这项期望值。
**本 Phase 只需确认"它是有意的"，不需要也不应该在提交里改它。**

#### 表 B · 附件链依赖面恢复（**7 个文件，P3 偏差 1 的产物**）

```powershell
foreach ($f in 'src/main/rag/file-ingest.ts','src/main/rag/vectorstore.ts','src/main/rag/retriever.ts','src/main/rag/index.ts','src/shared/ipc-channels.ts','src/main/chats/chat-ui-ipc.ts','src/preload/index.ts') {
  "{0,-42} {1}" -f $f, (git -C $R diff --cached HEAD --numstat -- $f)
}
```

**确认要点**：这 7 个文件的改动**全部是"补回被官方静默删除的我方符号/入口"**，**没有夹带别的重构**。
判据：与 P3 报告 §九 5 的清单逐条同名同数（7 个）。
🔴 **它是 M2 决策（"我的功能不能发生功能性变化和缺失"）在源码层的兑现** ⇒ **必须进提交**。

#### 表 C · i18n 与测试文件的改动（**3 个文件**）

| 文件 | 改动 | 确认要点 |
|---|---|---|
| `src/renderer/react/i18n/en.json` · `zh-CN.json` | 补入官方新增的 **18** 个 `settingsPage.channels.*` 键 | 补齐后 en/zh **双向差集 = 0**（P3 实测） |
| 🆕 `src/renderer/react/i18n/resources.test.ts` | **官方新测试 + 我方新增的 `PARTIAL_LOCALES` 登记**（`ja-JP: 377`，单向收紧） | 🔴 **这一处必须被显式确认**：它**修改了官方带来的门禁**（把一个"恒红的缺口"改成"登记 + 不许扩大"）。<br>**性质**：这是**产品/文案取向**的决定（"日语暂为部分翻译"），而 P3 报告 §五 偏差 4 曾**明确"不推荐"**这条路、并把它列为"**人拍板 + P6**"。<br>⇒ **本 Phase 的动作**：**如实单列进提交信息**（§四 4.3），并在 §十二 施工记录写清"**这条决定尚未经人拍板，P6 必须回溯确认**"；若人不同意，回退 = 删除 `PARTIAL_LOCALES` 表（§八 R-4） |

**另有一个文件必须确认"它在提交里"**：`.gitignore`（`M `）—— 它是 P2 的 `.gitignore` 消解（保留我方 12 行 + 收下上游新增）。
判据：`git -C $R diff --cached HEAD -- .gitignore | Select-String '^\+'` 应能看到我方那 12 行（`.node24/` 与证据白名单）。

### 4.3 写提交信息（**必须自己写，不用默认**）

**为什么**：见 §二 E3 —— git 的默认信息含 **41 行**"未解决冲突"，而它们**都已解决**。

**做法**：把信息写进一个**临时文件**（避免 PowerShell 引号 / 编码问题），再用 `-F` 读它。

```powershell
$msg = Join-Path $env:TEMP 'p4-merge-msg.txt'
$body = @'
merge(P4): 上游 1.3.0 (8fe5ba7a) 合入本地分叉 —— 收口提交

两父：9920635f（本地 1.2.2-PLUS 分支 tip） + 8fe5ba7a（官方目标）
merge-base：b11b8851
索引规模：726 files changed, +55924 −53108（A 274 / D 70 / M 384 / R 3）

── 冲突消解（P2 + P3）──
· P2 删改类：官方删除集处置完成；救回 18（B 14 + UD 3 + C 1）/ 删除 17；
  其中 15 个救回来自「静默删除面」（不在任何冲突列表里）。
· P3 真冲突类：20 个 UU / 40 个冲突块逐块处置（七类模式：并集 / 保留我方 /
  收下官方 / 官方守卫+我方实现 / 字段级并集 / 接受删除 / 逐案判断）。
· .gitignore：双方独立新增，保留我方 12 行 + 收下上游全部新增。

── 计划外改动（显式列出，均已在 P3 报告与 p3-disposition.md 单列）──
1) package.json 三处有意决策：
   name → cyrene-agent（决定 userData 目录；官方配套 user-data-migration 做整体迁移）
   version → 1.3.0
   allowScripts 的 electron 条目 → 44.4.3（旧条目已失配）
2) 附件链依赖面恢复（7 个文件）：官方静默删除了本分支依赖的符号与 IPC 入口
   （file-ingest 387→57、retriever 411→160、rag/index 删 8 导出、ipc-channels 删 4 channel、
    chat-ui-ipc 删 2 handler、preload 删 3 桥方法）⇒ 按官方结构增量补回。
   这是 M2 决策「功能不得缺失」在源码层的兑现。
3) i18n：补入官方新增的 18 个 settingsPage.channels.* 键（en/zh 双向差集归零）；
   resources.test.ts 增加 PARTIAL_LOCALES 登记（ja-JP 缺口 377，单向收紧）。
   ⚠️ 该登记属产品取向，尚待人工回溯确认（见 PHASE-3-完成报告.md §五 偏差 4）。

── 已知未闭合（不在本提交范围内，转后续 Phase）──
· renderer 编译 4 错：官方新依赖 @mantine/* 与 @tanstack/react-virtual 未安装
  （H-15 销账点 = P5；本提交不跑依赖安装，保持两个变更源不叠加）
· ja-JP 缺 377 键；class-name-contract 红 1 条（早于本次合并的既有欠账）
· 首次启动会迁移 %APPDATA%\live2d-cyrene → 新目录（P6 必须先备份）

── 施工与复核文档 ──
docs/construction/HEB-1.3.0/TASK-H1.3.0/（P0–P3 蓝图与完成报告 + 人工验证台账 + BACKLOG）
'@
[System.IO.File]::WriteAllText($msg, $body, (New-Object System.Text.UTF8Encoding($false)))
"提交信息已写入：$msg（$((Get-Item $msg).Length) B）"
```

> 🔴 **信息里必须有的三样**（缺一样就会在半年后被误读）：
> ① **两父 + merge-base 的哈希**（回答"这次合并到底合了哪两个点"）；
> ② **计划外改动的显式清单**（回答"除了冲突消解，还顺手改了什么"）；
> ③ **已知未闭合项及其归属 Phase**（回答"为什么 renderer 还红着就提交了"）。
> 📌 **不要**在信息里写"冲突 0"却不写"40 个块"—— 那样读的人会以为这次没冲突（**J-19** 报数带口径）。

### 4.4 提交（**本 Phase 的核心动作**）

```powershell
# 提交前再打一次"要提交什么"（§三 3.2），确认无 U 状态、无未暂存改动
git -C $R status --porcelain | Where-Object { $_.Substring(0,2) -in @(' M','MM','UU','AA','DD') }
git -C $R diff --cached --name-status HEAD | Where-Object { $_ -match '^U' }

# 生成 merge commit（两个父由 .git/MERGE_HEAD 自动带入；不要加 -m / 不要 --no-verify 之外的参数）
git -C $R commit -F (Join-Path $env:TEMP 'p4-merge-msg.txt')
"commit exit = $LASTEXITCODE"      # 期望 0
```

**关于 `-F` 与默认信息的取舍**：用 `-F` ⇒ **完全替换** git 的默认信息（含那 41 行 `# Conflicts:`），**这是要的效果**。
⚠️ **不要**用 `--no-edit`（会保留默认信息）· **不要**用 `-m` 多次（会与默认信息拼接）。

**提交后立刻（30 秒内）能判的信号**：

```powershell
git -C $R rev-parse HEAD                      # 一个新的 40 位哈希（不再是 9920635f）
git -C $R rev-parse HEAD^1                    # 期望 9920635f52ca…
git -C $R rev-parse HEAD^2                    # 期望 8fe5ba7a5b3a…
git -C $R rev-list --parents -n 1 HEAD        # 期望恰好 3 个字段：<新哈希> <父1> <父2>
foreach ($f in 'MERGE_HEAD','MERGE_MSG','MERGE_MODE') { "$f = $(Test-Path (Join-Path $R ".git\$f"))" }   # 期望三个 False
```

### 4.5 文档独立提交（**第二步；此时才允许**）

**为什么分两笔**：合并进行中 git **禁止部分提交**（P2 实证 `cannot do a partial commit during a merge`，exit 128）。
合并提交完成后该限制消失，文档就能**只含文档**地落库。

```powershell
$D = 'docs/construction/HEB-1.3.0/TASK-H1.3.0'
$M = 'docs/construction/HEB-1.3.0/methodology'
$DOCS = @(
  "$D/BLUEPRINT-总蓝图.md","$D/HUMAN-人工验证台账.md","$D/BACKLOG-长期待办.md",
  "$D/PHASE-0-提交收口与锚点.md","$D/PHASE-0-完成报告.md",
  "$D/PHASE-1-工具链升级.md","$D/PHASE-1-完成报告.md",
  "$D/PHASE-2-冲突消解-删改类.md","$D/PHASE-2-完成报告.md",
  "$D/PHASE-3-冲突消解-真冲突类.md","$D/PHASE-3-完成报告.md",
  "$D/PHASE-4-合并收口提交.md","$D/PHASE-4-完成报告.md",
  "$M/BLUEPRINT-经验库-通用.md","$M/BLUEPRINT-经验库-具体坑.md","$M/BLUEPRINT-经验库-全量台账.md",
  "$M/BLUEPRINT-撰写规范.md","$M/BLUEPRINT-回写规范与清单模板.md","$M/_先读这份-READ-FIRST.md",
  "$M/模板-总蓝图.md","$M/模板-施工蓝图.md","$M/模板-完成报告.md"
)
# 🔴 逐条 add + 必须写 --（经验 C49：数组 + 未入库路径会让整条 add 静默失败）
foreach ($f in $DOCS) { if (Test-Path (Join-Path $R ($f -replace '/','\'))) { git -C $R add -- $f } }
git -C $R status --porcelain -- docs/construction/          # 逐条确认 staged 的是什么
git -C $R diff --cached --name-only -- docs/construction/   # 期望：只有上面这批（**没有 src/**）
```

**提交信息**（同样写文件 + `-F`）：

```text
docs(P0–P4): HEB-1.3.0 合并施工的全套蓝图、完成报告、人工验证台账与经验库回写

含 P0–P4 各阶段的施工蓝图与完成报告（含撰写者复核补正 §十一）、HUMAN 人工验证台账
（H-01…H-15）、BACKLOG 长期待办，以及方法论经验库本轮新增条目（C44–C49 / F24 / F25 /
J-19…J-23 的对应回写）。

这些文档此前只存在于工作区（P0–P3 期间禁止提交合并结果），现随合并收口一并入库。
```

> 🔴 **`git add` 纪律**：**绝不** `git add docs/`（P0/P1/P2 各踩过一次：会把不该入库的
> 未跟踪占位文件一起加进来）。**逐条单文件 + 必须写 `--`**（经验 **C30 / C49**）。
> 🔴 **提交前必须看** `git diff --cached --name-only` —— **若列表里出现 `src/` 下的任何路径，停下来查**。

### 4.6 收口决策：`wip/*` 三个 ref 的删留（**写下理由，不要默默删**）

```powershell
git -C $R for-each-ref --format='%(refname:short) %(objectname:short) %(subject)' refs/heads/wip
```

| ref | 内容 | 提交并核验**通过后**的建议 | 理由 |
|---|---|---|---|
| `wip/p2-docs` | P2 的复核文档快照（19 文件） | **可删** | 其内容已在 `4.5` 的文档提交里（或已在工作区） |
| `wip/p3-docs` | P3 复核文档快照（9 文件） | **可删** | 同上 |
| `wip/p3-src` | **P3 出口的索引镜像（2683 条目 ≡ 索引）** | 🔴 **建议保留到 P5 结束** | 它是**唯一**能回到"P3 已处置完"状态的恢复点；P5 的保真核验若要对照"合并树 vs P3 出口"，它就是那个参照物（规范 §5.3：**参照物先校准**） |

**删除动作（确认后再执行，逐条）**：

```powershell
git -C $R branch -D wip/p2-docs
git -C $R branch -D wip/p3-docs
# wip/p3-src：**保留**（P5 参照物；结项时删）
```

> 📌 **若执行者认为 `wip/p3-src` 也该立刻删** ⇒ 走 §五 5.1 的 H-A 流程（**要人拍板**），不要自己决定。

---

## 五、人工环节 ★

### 5.1 H-A 阻塞性拍板（开工前）

**本 Phase 无新增 H-A 拍板。** 逐条说明为什么下面这些"看着像决策"的点其实不需要人拍板：

| 看着像决策的点 | 为什么不需要人拍板 |
|---|---|
| `package.json` 的 `name` / `version` / `allowScripts` 三处（表 A） | **已在 P3 决策并复核**（P3 报告 §四 4.2 第 2/3 行）；本 Phase 只**确认它们有意入库**，不重新论证 |
| 7 个恢复文件进提交（表 B） | **M2 决策**（人已拍板"我的功能不能发生功能性变化和缺失"）的源码层兑现；**不进才是错的** |
| i18n 的 18 键补齐 | 键值取自**官方原文**，不是我方发明的文案 ⇒ 属技术判断 |
| `wip/*` 的删留 | §四 4.6 已给建议与理由；**只有"提前删 `wip/p3-src`"才需要拍板** |
| 🔴 **`resources.test.ts` 的 `PARTIAL_LOCALES` 登记** | ⚠️ **这一条"应该"是人拍板的，但它已经发生了**（执行者在 P3 回写时做了）。<br>**本 Phase 不把它当作"待拍板"来阻塞提交**（回退它会重新引入一条恒红的门禁，代价更大），而是**如实写进提交信息 + 施工记录**，并把**回溯确认登记为 P6 的动作**（台账 `H-12` 已含"日语会回退中文"的期望值）。<br>⇒ **若人此时明确反对**：命中 **H-A**，动作见 §八 R-4 |

### 5.2 H-B 完工评审（**本 Phase 不要求人做**）

**理由**：

| 可能的评审点 | 为什么不做 |
|---|---|
| "这次合并提交对不对？" | **全部是机器判据**（父 / 树 / 构成 / 状态文件），人重算 = 负价值（规范 §4.1 纪律 1） |
| "开应用看看" | 🔴 **绝对不能**：本 Phase **不装依赖**（renderer 编译仍 4 错、应用起不来）；而且**首次启动会迁移用户数据目录** —— 必须等 **P6**（先备份）。<br>**让人点一个跑不起来、还会动数据的程序 = 负价值 + 风险**（规范 §4.1 纪律 3） |
| "日语 377 键怎么办？" | 已登记 **P6**（`H-12` 的期望值列）⇒ 在本 Phase 评审它**没有可用的界面**（应用起不来） |

### 5.3 H-C 待验项登记（本 Phase **验不了**的）

**本 Phase 无新增 `H-nn`**，但必须把下面两条**并入已有行的说明**（**不新开行**，守"一台账一行"）：

| 序号 | 要并入哪一行 | 追加什么 | 为什么本 Phase 验不了 |
|---|---|---|---|
| a | **`H-10`**（附件文档链端到端） | 提交信息与施工记录里的"**首次启动会迁移 `%APPDATA%\live2d-cyrene`**"必须与 H-10 的备份前置**同时执行**：**先备份，再启动** | 需要真实运行；且有数据风险 |
| b | **`H-12`**（设置页各面板） | `resources.test.ts` 的 `PARTIAL_LOCALES["ja-JP"] = 377` **尚待人工回溯确认**；若人不同意，界面验收时须记录"日语部分回退中文"的实际观感 | 需要真实运行 + 人的产品判断 |

> 📌 **唯一真值在 `HUMAN-人工验证台账.md`**；本节**只给索引、不复制结论**。
> 🔴 **若执行者认为需要新开 `H-nn`** ⇒ 走 §五 5.1 的 H-A 流程（**要人拍板**），**不许 agent 自行开行**。

---

## 六、验收测试

> **本 Phase 的判据几乎全是"结构判据"**（父 / 树 / 状态文件 / 状态码），**只有 A9 是"内容判据"**。
> **每条都给：命令 + 期望 + 失败处置**。**判据必须充分**（规范 §7.1）—— 不许只写"看着对"。

### A1 · 提交是**真合并**（两个父，且父正确）★

```powershell
$R = "E:\AI_Chating\cyrene-agent"
git -C $R rev-list --parents -n 1 HEAD
```

| 期望 | 失败处置 |
|---|---|
| 输出 **恰好 3 个字段**：`<新哈希> 9920635f52ca… 8fe5ba7a5b3a…` | 只有 2 个字段 ⇒ **它不是 merge commit**（`-p` 丢了）⇒ **S3 停工**，按 §八 R-1 处置 |

> 🔴 **为什么这一条是第一条**：`git commit -F` 在 `MERGE_HEAD` 在场时**应当**自动生成两父；
> 但"应当"不是判据（经验 **C49**）。**必须回读 `rev-list --parents`**。

### A2 · **提交树 ≡ 索引**（**0 差异**：没漏提交任何暂存项）

```powershell
git -C $R diff --cached HEAD --stat          # 期望：（无输出）
git -C $R diff --cached HEAD --name-only     # 期望：（无输出）
```

| 期望 | 失败处置 |
|---|---|
| 两条都**无输出** | 有输出 ⇒ 索引里有东西**没进提交** ⇒ **S2 停工**（提交可能被 hook 改动过） |

> 📌 **口径说明（重要）**：这一条比的是**索引 vs 新 HEAD**。提交成功后索引应当**等同于**新 HEAD
> ⇒ **空 diff 就是"提交把索引完整固化了"**。这是本 Phase 最强的结构判据。

### A3 · **无内容丢失**（从两个父各看一次）★

```powershell
# ① 我方的全部文件都在新树里（相对第 1 父，只有"合并带入的增删改"）
git -C $R diff --name-status HEAD^1 HEAD | ForEach-Object { $_.Substring(0,1) } | Group-Object   # 期望 A 274 / D 70 / M 384 / R 3
# ② 官方树的"官方独有文件"都在新树里
$off = git -C $R ls-tree -r --name-only '8fe5ba7a^{commit}'
$new = git -C $R ls-tree -r --name-only HEAD
$missing = $off | Where-Object { $new -notcontains $_ }
"官方独有但新树里没有的路径 = $(($missing | Measure-Object).Count)  （期望 0 —— 需扣除 P2/P3 主动删除的项）"
```

| 期望 | 失败处置 |
|---|---|
| ① 的分布 = **A 274 / D 70 / M 384 / R 3**（与 §二 E2 逐项相同） | 不一致 ⇒ 提交的内容与索引不符 ⇒ **S2/S3 停工** |
| ② 的缺失路径 **全部能归因到"P2 的删除 17 或 P2 确认接受的官方删除"** | 有**无法归因**的缺失 ⇒ **S6 停工**（可能是取错侧把文件删了） |

### A4 · 合并状态已清空、`ORIG_HEAD` 保留

```powershell
foreach ($f in 'MERGE_HEAD','MERGE_MSG','MERGE_MODE','ORIG_HEAD') { "$f = $(Test-Path (Join-Path $R ".git\$f"))" }
```

| 期望 | 失败处置 |
|---|---|
| 前三个 **False**、`ORIG_HEAD` **True** | 前三个还有 `True` ⇒ 提交没把合并状态清掉 ⇒ **S2 停工** |

### A5 · 提交信息正确（**可读、无误导列表**）

```powershell
git -C $R log -1 --format=%B HEAD | Select-String -Pattern '^# Conflicts:' -Encoding UTF8   # 期望：无输出
git -C $R log -1 --format=%B HEAD | Select-String -Pattern 'cyrene-agent|附件链|PARTIAL_LOCALES' -Encoding UTF8  # 期望：命中
git -C $R log -1 --format='%H%n%P%n%s' HEAD
```

| 期望 | 失败处置 |
|---|---|
| 无 `# Conflicts:` 行 | 有 ⇒ 用了默认信息 ⇒ **`git commit --amend -F <文件>`**（**注意：amend 会改哈希**，且必须重跑 A1–A3） |
| 三处计划外改动都能在信息里找到 | 缺 ⇒ 补写后 amend |
| `%P` 有**两个**哈希 | 同 A1 |

### A6 · 文档独立提交（且只含文档）

```powershell
git -C $R log -1 --format='%s' HEAD                 # 期望：docs(P0–P4): … 那种
git -C $R show --stat --format='' HEAD | Select-Object -Last 3
git -C $R diff --name-only HEAD~1 HEAD -- src/      # 期望：（无输出）
```

| 期望 | 失败处置 |
|---|---|
| 文档提交里 **`src/` 下 0 个文件** | 有 ⇒ **`git reset --soft HEAD~1`** 后重做（**只回退这一笔**，合并提交不受影响） |

### A7 · 工作树干净（P5 能从一个明确状态开工）

```powershell
git -C $R status --porcelain | ForEach-Object { $_.Substring(0,2) } | Group-Object
(git -C $R status --porcelain | Where-Object { $_.Substring(0,2) -eq '??' } | Measure-Object).Count
```

| 期望 | 失败处置 |
|---|---|
| 只有 `??`（**71 条**，与前置 ⑥ 相同） | 出现 `M`/`D`/`A`/`R`/`UU` ⇒ **S4 停工**（有东西没进提交） |
| `??` = 71 | 变了 ⇒ 逐条归因（多出来的是不是本 Phase 新建的 `heb-p4/`？那允许 +1） |

> ✅ **「不算失败」的情形（提前写明）**：
> ① **71 条 `??` 里包含 3 个 B-01 登记在案的遗留目录**（`docs/design/` · `docs/internal-issue/` · `docs/refactor/`）—— **有意保留**（规范 §7.3 第 2 类）；
> ② **`docs/construction/HEB-1.3.0/**` 若在文档提交后不再出现在 `??` 里，是正常的**（它们已入库）；
> ③ **`.cyrene-merge-analysis/heb-p4/` 会让 `??` 变成 72** —— 属本 Phase 新建证据目录，**允许**（但须在报告里写明）。

### A8 · 工作树未因提交而改变

```powershell
git -C $R diff --stat HEAD            # 期望：（无输出）
git -C $R diff --name-only HEAD       # 期望：（无输出）
```

| 期望 | 失败处置 |
|---|---|
| 无输出 | 有输出 ⇒ **提交时的索引 ≠ 工作树** ⇒ 说明前置 ⑤ 没查干净 ⇒ **S7 停工** |

> 📌 这一条与 A2 是**一对**：A2 判"索引是否全进提交"，A8 判"工作树是否与提交一致"。**两条都空 = 三者对齐**。

### A9 · 11 项功能基线在提交后不退化（**唯一的"内容判据"，零成本**）

```powershell
$R = "E:\AI_Chating\cyrene-agent"
# P3 出口实测值（逐项）：括号内为基线列的数值（已知 groupContextLimit 的 11 是过期值）
$expect = @{
  'memory-console'=7; 'person-erasure'=8; 'ZONES_'=5; 'audit-log'=11; 'tool-access'=13;
  'keyword-policy'=9; 'group-corpus'=10; 'buildGroupContextBlock'=5; 'USAGE_BADGE'=2;
  'groupContextLimit'=9; 'confirmValue'=4
}
foreach ($k in $expect.Keys) {
  $n = (git -C $R grep -l -- $k -- src | Measure-Object).Count
  # ⚠️ 先算好 $verdict 再格式化：PowerShell 5.1 里把 if 当表达式写进 -f 的参数列表不可靠
  $verdict = 'OK'
  if ($n -lt $expect[$k]) { $verdict = '🔴 退化' }
  "{0,-24} 实测={1,-3} 期望={2,-3} {3}" -f $k,$n,$expect[$k],$verdict
}
```

| 期望 | 失败处置 |
|---|---|
| 每项 **≥ P3 出口实测值** | 低于 ⇒ **S6 停工**；`git diff HEAD -- <该标识所在文件>` 定位（**最可能的原因：有文件没进提交**） |

> ⚠️ **注意这条判据读的是 `HEAD` 树**（`git grep <rev> -- src` 不写 rev 时读索引/工作树；
> 要判"提交里的值"，**显式写 `HEAD`**）：
> `git -C $R grep -l -- $k HEAD -- src`。**两种读法都做一遍**，不一致就说明 A8 没通过。

---

## 七、产出物清单

| 文件 / 对象 | 内容 | 规模（估） |
|---|---|---|
| **merge commit**（git 对象） | 本次合并的固化点；`-p 9920635f -p 8fe5ba7a` | 1 个提交 |
| **docs commit**（git 对象） | P0–P4 全套文档入库 | 1 个提交 |
| **`.cyrene-merge-analysis/heb-p4/p4-verify.txt`** ★ | **核验清单**：两父 / 树≡索引 / 状态码分布 / 三个 `.git/` 状态文件 / 11 项基线 / `??` 计数 / `wip/*` 决策 | 3–6 KB |
| `.cyrene-merge-analysis/heb-p4/p4-commit-msg.txt` | 实际使用的提交信息（**留档**，便于事后审计"当时写了什么"） | ≤ 4 KB |
| `.cyrene-merge-analysis/heb-p4/p4-status-after.txt` | 提交后的完整 `git status --porcelain` | 数十 KB |
| `docs/construction/HEB-1.3.0/TASK-H1.3.0/PHASE-4-完成报告.md` | 完成报告（10 节 + §十一 复核补正待填 + §十二 施工记录） | 文档 |

> 📌 **证据目录的入库问题照旧**：`.cyrene-merge-analysis/heb-p4/**` **不在 `.gitignore` 白名单**里
> （白名单只放开了 `heb-p1/*`）⇒ 默认**未跟踪**。
> **本 Phase 不改 `.gitignore`**（属计划外改动扩张）；是否入库**留给结项**（与 `heb-p2/`、`heb-p3/` 一起决定）。

---

## 八、回退方法（**分级；每条写清"代价"与"怎么验"**）

> 🔴 **提交之后，回退的语义变了**：从"改文件"变成"**改历史**"。
> **凡涉及 `reset` / `amend` / `revert` 的动作，执行前先 `git branch <名字> HEAD` 打个保护分支**（本 Phase 的通行保险）。

| 级别 | 动作 | 适用 | 代价 | 怎么验成功 |
|---|---|---|---|---|
| **R-1 · 撤销提交、保留索引**（**最常用**） | `git -C $R reset --soft HEAD~1` | 提交信息写错 / 想重提 | **无内容损失**（改动全回到索引） | `git log -1 --format=%s` 回到 `9920635f` 的信息；`git diff --cached --stat` 仍有 726 项 |
| **R-2 · 撤销提交、保留工作树** | `git -C $R reset --mixed HEAD~1` | 想重新决定"哪些进提交" | 无内容损失，但**索引被清空成 HEAD 的内容** ⇒ 需要重新 `add`（**而合并状态已消失，不能再靠 `MERGE_HEAD` 自动生成两父**） | `git status` 出现大量改动；**此时若还要做 merge commit，须用 `git commit-tree` 手工指定两父**（§八 末） |
| **R-3 · 撤销两笔提交**（合并 + 文档） | `git -C $R reset --soft HEAD~2` | 两笔都要重做 | 同 R-1 | `git log --oneline -3` |
| **R-4 · 只撤 i18n 的登记**（**若人反对 `PARTIAL_LOCALES`**） | 编辑 `src/renderer/react/i18n/resources.test.ts` 删掉 `PARTIAL_LOCALES` 表与其分支 ⇒ 单独一笔提交 | 命中 §五 5.1 的 H-A | 会重新引入一条恒红的门禁（`resources.test.ts` 报 377 个缺键） | 跑 `resources.test.ts` 确认它变红（**这是"预期行为"，不是回归**） |
| **R-5 · 回到 P3 出口（源码层）** | `git checkout wip/p3-src -- <file>` 或整体 `git checkout wip/p3-src` | 提交后发现某个文件处置错了 | 只在**工作树/索引**上恢复；历史不动 | `git diff wip/p3-src -- <file>` 为空 |
| **R-6 · 补 `[运行痕迹]`**（前置 ⑧ 不满足时） | 重跑并落盘（**判据 J-23**）：`& cmd /c "… tsc … --pretty false > log 2>&1"` 之后**把 `exit=$LASTEXITCODE` 追加进同一文件** | 绿格不可复核 | 只花时间，不动历史 | 日志**非零字节**且含 `exit=` 与 `errorTS=` |
| **R-7 · 合并状态整个丢了**（前置 ③ 不满足：`MERGE_HEAD` 不在） | **不要**重新 `git merge`（会二次合并，产生新的冲突面）——改用 **`git commit-tree` 手工造两父提交**：<br>`git read-tree` 造树 → 确认树 ≡ 当前索引 → `git commit-tree <tree> -p 9920635f -p 8fe5ba7a -F <msg>` → `git update-ref refs/heads/master <新提交>` | 🔴 **灾难恢复** | 需要手工核对树与两父 | A1–A3 全部重跑 |
| **R-8 · 数据面** | 🔴 **本 Phase 无数据面动作**：不装依赖、不动 `node_modules`、**不运行应用**（所以不会触发 userData 迁移） | — | — | `node_modules` 文件数仍为 P1 基线（132037）；`%APPDATA%\live2d-cyrene` **未被触碰** |

> 🔴 **三条禁令（与 P2/P3 一致，且在本 Phase 更严厉）**：
> **① 不 `merge --abort`**（现在再 abort = 丢掉 P3 的全部处置）· **② 不 `stash`**（合并态下会破坏状态）· **③ 不 `git clean`**（71 条未跟踪里有 B-01 遗留与全部证据目录）。
> 🔴 **新增一条**：**④ 不在提交后立刻删 `wip/p3-src`** —— 它是 P5 的参照物，也是唯一的源码级回退点（§四 4.6）。

---

## 九、已知坑（本 Phase 相关 + 复现情况）

> 按 H/M/L 检索自 [BLUEPRINT-经验库-通用.md](../methodology/BLUEPRINT-经验库-通用.md) 与
> [BLUEPRINT-经验库-具体坑.md](../methodology/BLUEPRINT-经验库-具体坑.md)。**只列与本 Phase 相关的**。

| # | 坑（键号） | 本 Phase 的风险点 | **规避写法（直接照做）** |
|---|---|---|---|
| 1 | 🔴 **命令 exit 0 ≠ 内容写进去了**（**C49**，P2 复核实证） | `git commit` 返回 0 **不代表**两父正确、**不代表**索引全进提交 | **提交后回读**：`rev-list --parents -n 1 HEAD`（A1）+ `diff --cached HEAD`（A2）+ **逐条核 11 项基线**（A9） |
| 2 | 🔴 **按清单审计会漏掉清单外的东西**（**C24**，本项目已复现 **5 次**） | 只按"726 项"看提交 ⇒ 会漏掉**提交信息里的误导列表**、**漏在外面没进索引的改动**、**`.git/` 状态文件没清干净** | 本 Phase 的判据是**三视角交叉**：父（A1）· 树≡索引（A2）· 工作树（A8）+ 信息（A5） |
| 3 | 🔴 **"净差 ≠ 新增数" / 比较必须绑定同一基线**（**C47**） | 核验"有没有内容丢失"时用集合差 ⇒ 会把 **P2/P3 主动删除的项**误判成"丢失" | A3 的第 ② 条**必须**加"**缺失项要能归因到 P2 的删除 17 / P3 的处置**"，**阈值不能写 0** |
| 4 | 🔴 **`core.autocrlf=true` + 无 `.gitattributes` ⇒ blob 口径与工作区口径不一致**（**P3 复核实测**） | 用 `git hash-object -- <f>` 与快照 blob 比对，会得到 **147 个假不一致**（真值 **0**） | 比"快照/提交 vs 当前"时，**一律比索引 blob**（`git rev-parse ":<path>"`）或**比两个 git 对象**；**不要读工作区**（§二 E6） |
| 5 | **`git add` 的失败是整体的**（**C30**） | 批量 `git add docs/` 会把未跟踪的占位文件也加进来（P0/P1/P2 各踩过一次） | **逐条单文件 + 必须写 `--`**；**绝不** `git add -A` / `git add docs/` |
| 6 | **PowerShell 内联长命令失败会被吞成空数组**（**C48**） | §六 A3 的内联 `git ls-tree`（2683 项）会失败并静默给出空结果 ⇒ 判据**假绿** | 一律 **`Set-Content` 落盘 → `Get-Content` 读回**，并**校验行数 > 0**（或直接写成 `p4-verify.txt` 的一部分） |
| 7 | **报数不带口径 / 阈值是旧时点值**（**J-19 / J-21 / J-22**） | 提交信息里写"冲突 0"却不写"40 个块"；A3 的分布阈值若沿用旧值 | 提交信息**必须**同时给出：两父哈希 · 726 项构成 · 40 个冲突块 · 3 类计划外改动（§四 4.3） |
| 8 | 🔴 **"全绿"格的证据必须自带运行痕迹**（**J-23**，P3 复核实测） | 前置 ⑧ 若只看"日志文件存在" ⇒ 0 字节日志会被当成"编译干净" | 前置 ⑧ **必须检查日志里有 `[运行痕迹]` / `exit=`**；没有就先按 §八 R-6 补跑 |
| 9 | **annotated tag 的裸 `rev-parse` 不解包**（**J-12**） | 若用 tag 指目标 | 一律写 `official-target-8fe5ba7a^{commit}` |
| 10 | **表格单元格里的裸 `\|` 会撑破单元格**（**C39 / C40**） | 写 P4 完成报告时把命令/信息塞进表格 | 代码与提交信息一律放**代码块**；表格里只放短语（本蓝图已遵守） |
| 11 | **两个变更源不叠在同一批验收里**（规范 §4.1.3 硬要求 5） | 若本 Phase 顺手装依赖 / 升 TS ⇒ 提交后就再也分不清"哪些改动是合并的、哪些是工具链的" | **本 Phase 不装依赖、不升 TS**（判据 **J-17**）；`H-15` 留给 P5 |
| 12 | **已删除文档的旧值仍被引用**（**D18 / D30** 家族） | 提交信息与报告里若引用"计划 5 处语义对撞"这类**已被推翻的旧口径** | 一律引用**最新实测**（P3/P4 报告）；旧值只在"历史基线"节里出现 |

### 本次**新出现**、值得警惕的两条（建议入经验库，见 §十二 T4）

| 新坑 | 一句话 | 建议级 |
|---|---|---|
| **git 的默认 merge 信息是"输入快照"，不是"结果状态"** | `.git/MERGE_MSG` 里的 `# Conflicts:` 列表记的是**冲突刚发生时的 41 个文件**；到提交时它们早已解决。**直接 `git commit` 会把它写进永久历史**，半年后读提交的人会以为"这次合并留下了 41 个未解决冲突" | **M** |
| **"合并进行中禁止部分提交"决定了文档与代码必须分两笔** | `git commit --only -- <paths>` 在合并态下**结构性失败**（`fatal: cannot do a partial commit during a merge.`）⇒ 任何"先提交文档再提交合并"的计划都**必须在蓝图层面就分两笔**，不能留到执行时发现 | **M** |

---

## 十、给下一个 Phase 的交接提示（**P5 保真核验**）

1. 🔴 **P5 的起点**：`HEAD` = 本 Phase 的 **merge commit**（两父 `9920635f` + `8fe5ba7a`）·
   `HEAD~1` = 文档提交 · **工作树干净（只剩 71–72 条 `??`）**。**合并状态已结束**（`MERGE_HEAD` 不在）。
2. 🔴 **P5 的第一件事是 `pnpm install`** —— 它是 **H-15** 的销账点（P1 遗留：本仓库从来没有锁文件，
   官方 `pnpm-lock.yaml` 随本次合并进来，现在才具备条件）。
   **装完必须复跑并记录两个数字**：① `tsconfig.renderer.json` 的 **4 错 → 0 错**；② 全量测试的 **1 失败 → 1 失败（只剩 `class-name-contract`）**。
   装之前**先备份 `node_modules`**（P1 的备份在 `E:\AI_Work\备份\cyrene-pre-P1-2026-10-04\`，实测 `MATCH ✅`）。
3. 🔴 **P5 的保真核验面（判据 J-22）**：一级面 **91**（= 16 UD + 75 静默）+ **3 个 rename 旧路径** ⇒
   **会从树上消失的路径 = 94**。**不要用 88 / 72 当分母**（见 `PHASE-2-完成报告.md` §十一 11.6）。
4. 🔴 **参照物先校准（规范 §5.3 / 经验 D26）**：本任务现在有**三个**可用参照物，**用法不同**：
   | 参照物 | 是什么 | 什么时候用它 |
   |---|---|---|
   | `wip/p3-src` | **P3 出口的索引镜像（2683 条目 ≡ 当时的索引）** | 要问"提交之后有没有东西被改动"时**与它逐文件比 blob** |
   | merge commit `HEAD` | 合并结果（本次落库的东西） | 要问"合并到底带来了什么" |
   | `b11b8851`（merge-base） | 分叉点 | 要问"我方改了什么 / 官方改了什么" |
5. 🔴 **删除判据一律用索引口径**（`git ls-files --error-unmatch` → exit ≠ 0），**不可只用 `Test-Path`**
   （P2 的 3 个 DU 目标**仍有未跟踪副本在磁盘**，`Test-Path` 恒 `True`）。
6. 🔴 **P5 复核面比原计划多两块**（P3 引入）：① **P3 偏差 1 的 7 个恢复文件**（官方版 + 我方补丁，须**逐符号核**）；
   ② **`resources.test.ts` 的 `PARTIAL_LOCALES` 登记**是否被人认可（**产品取向**，见 §五 5.1 与 §四 4.2 表 C）。
7. ⚠️ **A4 基线列 `groupContextLimit = 11` 是过期值**（P3 偏差 5 已证），P5 比对**以实测 9 为准**。
8. ⚠️ **门禁命令必须带应用级 PATH**（`set PATH=<仓库>\.node24;%PATH%`）——
   本机系统 `pnpm` 已知损坏（P3 偏差 6 实证），否则 `work-verification-closure.test.ts` 会假红。
9. ⚠️ **不要引用 P3 报告的 `--listFiles` 三个数（1656/314/5638）** —— 口径未写明、不可复现（P3 复核 11.5）；
   要对照就自己按同一口径重跑（并**把 exit code 写进同一份日志**，**J-23**）。
10. ⚠️ **未跟踪面照旧**：71–72 条 `??` 里含 **B-01 的三个遗留目录**（`docs/design/` · `docs/internal-issue/` · `docs/refactor/`）
    与 `.cyrene-merge-analysis/heb-p{1,2,3,4}/`、`heb-review-p{2,3}/`；**禁用 `git clean`**。
    它们是否入库（需改 `.gitignore`）**留给结项**统一决定。
11. ⚠️ **`ja-JP` 的 377 键**：`resources.test.ts` 已改成"登记 + 单向收紧"；**P5 不要为了让它变绿去动那个数字**
    （判据里已写明"增加即失败、减少要同步下调"）。**人的回溯确认在 P6**。
12. ⚠️ **数据面（P6 的前置）**：合并后**首次启动会迁移 `%APPDATA%\live2d-cyrene`**。
    **P5 不要运行应用**；P6 运行前**必须先外部备份**该目录。

---

## 十一、改动的目标达成核对（**执行后回填**）

> 执行者**完成本 Phase 后**逐条回填；**未回填完整不得写完成报告**。

| 目标（§1.2） | 状态 | 证据（命令 + 输出 / 哈希） |
|---|---|---|
| **T1** merge commit（两父） | ⬜ | 提交哈希：______ · `HEAD^1`：______ · `HEAD^2`：______ |
| **T2** 提交信息正确（无误导列表 + 三类计划外改动在） | ⬜ | |
| **T3** 提交树 ≡ 索引 · 状态清空 · 工作树干净 | ⬜ | |
| **T4** 文档独立提交 | ⬜ | 提交哈希：______ · 文件数：______ · `src/` 命中：______ |
| **T5** 无内容丢失（两父各看一次） | ⬜ | |
| **T6** 11 项基线不退化 | ⬜ | |
| **T7** `p4-verify.txt` 落盘 | ⬜ | 字节数：______ |
| **T8** `wip/*` 决策落盘 | ⬜ | 删了：______ · 留了：______ + 理由 |

**非目标遵守情况**（逐条确认）：
⬜ 未做保真核验 · ⬜ 未跑 `pnpm install` · ⬜ 未 `git clean` · ⬜ 未改源码 · ⬜ 未升 TS / 未动 `tsconfig.*` · ⬜ 未跑全量测试（或：跑了并说明为什么） · ⬜ 未推送远端

**人工环节达成核对**：⬜ 本 Phase 无新增 `H-nn`（§五）· ⬜ §五 5.3 的两条已并入 `H-10` / `H-12`

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
> 8 · 待做 / 未做（与 6 合并亦可）
> 🆕 **9 · 两个提交的哈希与它们的构成**（本 Phase 特有：必须留下"提交了什么"的自证）
> 🆕 **10 · `wip/*` refs 的最终处置与理由**

---

## 附：本蓝图的证据来源与可复算声明

| 证据 | 来源 | 复现方式 |
|---|---|---|
| 出口状态 / 两父 / merge-base | 本机实测（2026-10-04） | §二 E1 的命令 |
| 索引构成 726 项（A274/D70/M384/R3） | 本机实测 | §二 E2 |
| `.git/MERGE_MSG` 的 41 行冲突列表 | 本机实测（读 `.git/MERGE_MSG`） | §二 E3 |
| 四个 `.git/` 状态文件的在场性 | 本机实测 | §二 E4 |
| 三套编译与全量测试的 P3 出口值 | **P3 完成报告 §三 + 复核 §十一** | `.cyrene-merge-analysis/heb-p3/*.log`（**须含 `[运行痕迹]`**，J-23） |
| `wip/p3-src` ≡ 索引（2683/2683） | **本机实测（P4 蓝图起草时）** | §二 E6 的**正确口径**脚本 |
| 11 项基线的期望值 | P3 出口实测 | §六 A9 的脚本 |
| `package.json` 三处决策的语义 | P3 报告 §四 4.2 表 + 读官方 `src/main/user-data-migration.ts` | `git show :src/main/user-data-migration.ts` |

> 🔴 **本蓝图的已知不确定性（如实声明）**：
> ① **"提交信息写什么"没有唯一正确答案** —— 本蓝图给的模板覆盖了必要三项（两父 / 计划外改动 / 未闭合项），
>    执行者可增补，但**不许删那三项**；
> ② **A3 第 ② 条的"缺失项归因"需要人工判断** —— 它无法完全机械化（哪些缺失是"有意删除"要读 P2/P3 的清单）；
> ③ **`resources.test.ts` 的 `PARTIAL_LOCALES` 是否被人接受，本 Phase 无法判定** ⇒ 已登记 P6（§五 5.3 b），
>    并在提交信息里如实写明"尚待人工回溯确认"。
