# Phase 8 施工蓝图：提交合并与收口（Tier F）

> **状态**：⏳ 待执行
> **上游**：[`BLUEPRINT-总蓝图.md`](BLUEPRINT-总蓝图.md) §四（P8）· §八（验证机制）· §九（当前基线「P7 之后」）
> **前置交付**：[`PHASE-7-完成报告.md`](PHASE-7-完成报告.md) · [`验证作业单-执行报告.md`](验证作业单-执行报告.md) · [`验证作业单-缺陷报告.md`](验证作业单-缺陷报告.md)
> **依据规范**：`../methodology/BLUEPRINT-撰写规范.md` §4（12 节）· §4.1（人工环节）· §5.1（T1–T4 回写）
> **一句话**：把「进行中的合并」变成「**一个真正的提交**」——12 天未提交的工作第一次进入历史。

> 🔴 **本 Phase 是全任务唯一允许 `git commit` 的 Phase。**
> 在此之前 P0–P7 全部零提交；在此之后，工作区里的任何改动都不再是"孤本"。

---

## ★零、执行者先读这一节

### 0.1 三条已拍板（不要再论证）

| # | 事项 | 谁定的 | 落点 |
|---|---|---|---|
| **①** | **顺序：先提交合并，再做入口恢复** | 项目所有者（本轮） | §四 全节；恢复工作归 **P9** |
| **②** | **D6 扩展：任何文档都不进合并提交** | 项目所有者 | §四 **4.2**（含那 35 个官方新增文档） |
| **③** | **H-07 拆分执行**：保留 4 个「里子」纯逻辑模块 + 删 2 个空壳 + 处理 13 个失败测试 | 项目所有者（联动 H-15 后定案） | §四 **4.3** |

### 0.2 四条硬约束（违反即失败）

1. 🔴 **不得 `git push`** —— 远端是 `origin https://gitee.com/playa0/cyrene-agent.git`（分支 `master`）。**提交只落本地**，推送不在本任务范围。
2. 🔴 **永不 `git merge --abort`** —— 会一次性丢弃 P3–P8 的全部成果。
3. 🔴 **永不 `checkout` `src/main/channels/history-log.ts`** —— 16 个本地独有导出（含群聊旁听的 `buildGroupContextBlock`）。
4. 🔴 **不改任何主进程 / preload / 渲染层生产代码** —— 本 Phase 只做「入库 + 排除 + 删除死物 + 提交 + 销账」。任何代码改动都属 **P9**。

### 0.3 顺序敏感（不可颠倒）

```
4.0 备份与树哈希 → 4.1 索引对齐 → 4.2 D6 扩展 → 4.3 H-07 执行 → 4.4 提交前门禁 → 4.5 提交 → 4.6 提交后复核 → 4.7 销账
                                        ↑                                    ↑
                       4.3 会删测试文件 → 必须先删完再跑 4.4 的全量测试（否则你会对着旧数字判断）
                                                                    ↑
                                    4.4 全绿才允许提交；提交是一次性的，别拿它试验
```

### 0.4 四个陷阱

| # | 陷阱 | 后果 | 对策 |
|---|---|---|---|
| **Y1** | **提交后 `.git/MERGE_HEAD` 会消失** —— 「合并进行中」这个状态**不可自然恢复** | 若提交内容不对，`git reset` 回去会变成"**单亲**提交"（丢掉 `b11b8851` 这个父），不再是合并 | §四 4.0 先记 **`git write-tree` 的树哈希**当内容保险；§八 给出恢复 `MERGE_HEAD` 的手法（pseudoref） |
| **Y2** | **`git commit -F` 读到 BOM 会污染提交信息首行** | 提交信息第一行变成 `\ufeffmerge(P8): …` | §四 4.5 用 **.NET UTF8 无 BOM** 写消息文件，并**先回读校验首字节** |
| **Y3** | **`panel-layout.test.ts` 不是"整文件死"** —— 它 **4 passed / 2 failed**，其中 **3 条是「顶栏不重叠」守卫**（正是 H-05 那块**还没人验**的区域） | 照"删 13 个测试"字面全删 → **净损失 4 条绿守卫** | §四 **4.3.2 改为"只删那 2 条失败用例"**，保留 4 条绿 |
| **Y4** | 索引里此刻有 **852 文件的既存暂存内容**（2561 条索引） | "多暂存了什么"肉眼看不出来 | §四 4.0/4.4 用 **`git diff --cached --name-status` 前后快照 + `Compare-Object`** 做差集校验：只允许预期的 4 类差异 |

### 0.5 命令执行规范

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$env:PATH = "D:\data\node24;" + $env:PATH
cd E:\AI_Chating\cyrene-agent
```

- PowerShell **5.1**：无 `&&`；括号表达式里不能用 `;`；`for(...){} | Select-Object` 报 *Empty pipe element*（先收进数组）。
- 行尾比较一律 `--ignore-cr-at-eol`（经验 **A41**）。
- 蓝图行号是写作时快照 → 按 **J-13** 自己重扫。

---

## 一、目标与非目标

### 1.1 目标（T1–T6）

| # | 目标 | 判据（机器可判） |
|---|---|---|
| **T1** | **索引对齐**：P7 的 6 个文件真的进索引 | 提交前 `git diff --ignore-cr-at-eol --name-status` 里**不再有**那 6 个文件 |
| **T2** | **D6 扩展**：35 个官方新增文档出索引 | `git -c core.quotepath=false ls-files docs` 对 `design/internal-issue/superpowers/refactor` **四个前缀 = 0** |
| **T3** | **H-07 执行** | 12 个整文件死的测试**不存在**；`panel-layout.test.ts` **只剩 4 条且全绿**；2 个空壳模块**不存在**；4 个「里子」模块**仍在** |
| **T4** | **门禁复核** | 三套 `tsc` = 0；定向门禁 13 文件 / 273 tests 全绿；全量 = **`2 failed \| 559 passed (561)`**、`ERR_MODULE_NOT_FOUND` = 0 |
| **T5** | 🔴 **提交合并** | `git rev-list --parents -n 1 HEAD` 有 **2 个父**（`598dfb75` + `b11b8851`）；`.git/MERGE_HEAD` **不存在**；`git status` 无 `UU` |
| **T6** | **台账销账** | H-04 / H-14 / H-07 → ✅ 已销账（附证据）；其余条目标明"转 P9"或"待人验" |

### 1.2 非目标（N1–N7，越界即失败）

| # | 非目标 | 为什么 |
|---|---|---|
| **N1** | ❌ `git push` | 远端 `gitee/origin`；推送不在本任务范围（要推由项目所有者另行决定） |
| **N2** | ❌ 做 H-15 的入口恢复（控制台/记忆台/区块页） | 那是 **P9**；本 Phase 先让 12 天的工作落进历史 |
| **N3** | ❌ 修 ③④ 两类存量失败（`ToolConsolePanel.css` 令牌、`ToolConsolePanel.tsx:285` 的 `window.confirm`） | 存量问题；且 P9 接回控制台后会变成"用户可见面板的缺陷"，那时一并修更合适 |
| **N4** | ❌ 改任何生产代码（main / preload / renderer） | 见 §零 0.2 第 4 条 |
| **N5** | ❌ 动 `history-log.ts` / `corpus/**` / `conversation-binding-store.ts` / CTA transcript | 前几个 Phase 的硬约束继续有效 |
| **N6** | ❌ `npm install` 变更依赖或重建 `package-lock.json` | P7 已装齐；锁文件至今未变（哈希 `05dcca09…`） |
| **N7** | ❌ 把 `.cyrene-merge-analysis/**` 或 `dist/**` 加进索引 | 它们是过程产物/构建产物，保持未跟踪 |

---

## 二、实测证据（决定本 Phase 做法，**执行前请读**）

### 事实 1 · 6 个未入索引的文件（T1 的对象）

```powershell
git diff --ignore-cr-at-eol --name-only
# 实测 6 行：
#   package.json
#   src/renderer/react/features/settings/ChannelsSettingsMigration.test.ts
#   src/renderer/react/features/settings/ChannelsSettingsPanel.css
#   src/renderer/react/features/settings/ChannelsSettingsPanel.tsx
#   src/renderer/react/i18n/en.json
#   src/renderer/react/i18n/zh-CN.json
```

**索引侧后果（若不先 `git add` 就提交）**：索引里装的还是 P7 之前的版本 → 提交出来的树**渲染层 5 条 `TS2339` 复活、「设置 → 连接手机」页重新变成"必崩"**（`ChannelsSettingsPanel.tsx:115` 的 `Promise.all` 实参同步 `TypeError`）。

> 📌 其中 3 个（`.tsx` / `.test.ts` / `.css`）是**官方新增文件**（`git cat-file -e HEAD:<f>` = False，P3 已按其版本暂存）→ 它们的索引 blob 恰为 P7 的 **pre-hash**（`1d1ecab3…` / `a51124e6…` / `d44d52ac…`），这就是"索引装的是改之前"的铁证。

### 事实 2 · D6 扩展的 35 个文档（T2 的对象，**已纠正 P7 报告的一处小数**）

```powershell
git -c core.quotepath=false diff --cached --name-status -- docs | Where-Object { $_ -match '^A' }
# 实测 35 条，分布：
#   docs/design          17
#   docs/internal-issue   8   （含 perf/ 4）
#   docs/superpowers      8   （plans 3 + specs 5）
#   docs/refactor         2
#   合计                 35
```

> ⚠️ **P7 报告写的是 18/8/6/2 = 34，差 1** → **以本条实测 35 为准**（总蓝图 §五 D6 已同步）。
> ⚠️ **不在 D6 作用面内**：`docs/CONTRIBUTORS.md`、`docs/construction/SELF-update 260925/**`、`docs/construction/tools/**`
> 是 **`HEAD` 里早已提交的既有文档**（不是本次合并新增），**不要动它们**。

### 事实 3 · 🔴 H-07 的三类对象 + **一处事实更正**（直接影响 P9 怎么用）

**（a）4 个「里子」模块 —— 它们不是纯逻辑**（P8 撰写期实测）：

| 模块 | 行数 | 顶部 import（实测） |
|---|---|---|
| `memory/delete-all.ts` | 91 | `./dom` · `../shared/modal` · `../shared/format` · **`../i18n`** ← **该模块已被 P4 删除** · `../shared/types` |
| `memory/erasure-flow.ts` | 456 | `./dom` · `./manager` · `../shared/modal` |
| `memory/manager.ts` | 607 | （DOM/HTML 渲染向） |
| `zones/panel.ts` | 609 | `./state` · `./dom` · `./picker` |

> 🔴 **结论（必须传给 P9）**：这 4 个模块**不能被 React 侧直接 `import`** ——
> ① 它们都耦合 DOM（`./dom`、`../shared/modal` 是旧设置窗的元素句柄与弹窗）；
> ② `delete-all.ts` 依赖的 `../i18n` **已被 P4 删除**；
> ③ `tsconfig.renderer.json` 的 `include` **只有** `src/renderer/react/**` + `react-perf/**` + `global.d.ts` + `src/shared/**`
> —— 即 `settings/**` **完全不在类型检查范围内**（实测读过该 tsconfig）。
>
> **它们的真实价值 = 可"抄"的规则**（`isDeleteAllConfirmed` / `isEraseConfirmed` / `classifyManagerMemory` / `describePrivateMapping` 等若干纯函数 + HTML 结构参考），
> **不是"可直接引用的库"**。保留它们的代价 ≈ 0（已在仓库、0 引用者、不在任何 tsconfig 内），收益是 P9 有一份可 grep 的参考。

**（b）2 个待删空壳**（实测「被引用 = 0」）：`memory/panel.ts` · `preferences/panel.ts`。

**（c）13 个失败测试 —— 并非同一性质**（见事实 4）。

### 事实 4 · 🔴 13 个失败测试的真实构成（**判据修正 → 本 Phase 的 Y3**）

| 子类 | 文件数 | 现状 | 处置 |
|---|---|---|---|
| **整文件死**（`0 test`，加载期 ENOENT `settings/index.html` 或 `Failed to resolve import "../i18n"`） | **12** | `settings/{dom-refs-consistency, keywords-markup, memory-manager-markup, panel-migration-markup, zones-markup}` · `settings/channels/panel` · `settings/memory/{delete-all, erasure-flow, manager, panel}` · `settings/zones/panel` · `react/…/api-config/api-config-source` | **整文件删**（它们跑不了任何用例，且测的是旧 DOM 外壳） |
| **部分死** | **1** | `react/…/panel-layout.test.ts`：**6 用例 → 4 passed / 2 failed**；失败的 2 条（`面板本身是滚动容器` / `模型网格保持自然高度`）读已删的 `ModelModePanel.css`；**另 4 条绿**，其中 **3 条是「顶栏右上角：用量徽章与窗口控件并排不重叠」守卫** | 🔴 **只删那 2 条失败用例，保留 4 条绿**（它们护着 H-05「顶栏布局」—— 那块**目前还没人验**） |

> **若不修正会怎样**：照"删 13 个测试"字面执行 → **净损失 4 条绿守卫**，且其中 3 条正是 P5 特意恢复的顶栏回归网。
> **修正后**：12 删 + 1 收窄 → 全量失败文件 **15 → 2**、失败 tests **4 → 2**，而**绿的守卫一条不动**。

### 事实 5 · 提交后的预期数字（用于 4.6 复核）

| 指标 | 提交前（实测） | 提交后预期 |
|---|---|---|
| 全量测试 | `Test Files 15 failed \| 558 passed (573)` / `Tests 4 failed \| 5403 passed \| 1 skipped (5408)` | **`Test Files 2 failed \| 559 passed (561)`** / **`Tests 2 failed \| 5403 passed \| 1 skipped (5406)`** |
| 剩余 2 条失败 | — | ③ `theme-token-contract`（1 failed test）+ ④ `default-dialogs-regression`（1 failed test） |
| `ERR_MODULE_NOT_FOUND` | 0 | **0** |
| `git ls-files -s` | 2361 | 减去 35（官方文档）+ 13（旧 `docs/merge-plan` 从索引移出）+ 12（测试）+ 2（空壳）≈ **2299**（以实测为准，**不作硬判据**） |

### 事实 6 · 提交机制（**一次性的，别试错**）

```powershell
git rev-parse --short HEAD          # 598dfb75（本地合并前基线）
git rev-parse --short MERGE_HEAD    # b11b8851（官方 master）
Test-Path .git/MERGE_HEAD           # True → 此刻 commit 会生成【2 个父】的合并提交
git rev-parse --abbrev-ref HEAD     # master
git remote -v                       # origin https://gitee.com/playa0/cyrene-agent.git（本 Phase 不推送）
git log --oneline -2                # 风格：merge(P3): checkpoint 本地工作（合并前基线）
git diff --cached --ignore-cr-at-eol --shortstat   # 852 files changed, +166216 / −29300 ← 这就是提交内容
```

---

## 三、前置条件与停止条件

### 3.1 前置条件（**逐条给命令 + 期望值；不满足不得开工**）

```powershell
# P1 · 合并态仍在
git rev-parse --short HEAD            # 期望 598dfb75
git rev-parse --short MERGE_HEAD      # 期望 b11b8851
Test-Path .git/MERGE_HEAD             # 期望 True
git rev-parse --abbrev-ref HEAD       # 期望 master

# P2 · 冲突归零
(git status --porcelain | Where-Object { $_.Substring(0,2) -match '^(UU|UD|DU|AA)$' } | Measure-Object).Count   # 期望 0
(Get-ChildItem -Recurse -Include *.ts,*.tsx,*.json,*.css -Path src | Select-String -Pattern '^<{7} |^>{7} ' | Measure-Object).Count   # 期望 0

# P3 · T1 的对象确实还没入索引
(git diff --ignore-cr-at-eol --name-only | Measure-Object).Count      # 期望 6

# P4 · 提交前基线（全绿才允许提交）
npx tsc -p tsconfig.main.json      | Select-String 'error TS' | Measure-Object   # 期望 0
npx tsc -p tsconfig.preload.json   | Select-String 'error TS' | Measure-Object   # 期望 0（或看 $LASTEXITCODE = 0）
npx tsc -p tsconfig.renderer.json  | Select-String 'error TS' | Measure-Object   # 期望 0

# P5 · 回退网
Test-Path E:\AI_Chating\cyrene-agent-p7-backup                 # 期望 True
git rev-parse --short phase3-work-snapshot                     # 期望 586eae90
Test-Path .cyrene-merge-analysis\p7\pre-hashes.txt             # 期望 True

# P6 · 工具链
node -v    # 期望 v24.21.0
npx vite --version   # 期望 8.3.0

# P7 · 磁盘余量（提交会写 ~166k 行的对象）
Get-PSDrive E | Select-Object Used,Free     # 期望 Free ≥ 3 GB
```

### 3.2 停止条件（命中即停，**不要"顺手绕过"**）

| # | 触发 | 处置 |
|---|---|---|
| **S1** | `git write-tree` 返回空 / 报错 | 停 —— 索引有问题，先查 `git status`，**不要**直接 commit |
| **S2** | 4.3 之后全量测试**失败文件数 > 2** | 停 —— 删多了或删错了（对照事实 4 的 12 + 1 清单） |
| **S3** | 4.4 里任何一套 `tsc` 非 0 | 停 —— 本 Phase 不改代码，出现错误说明前序 Phase 有漏 |
| **S4** | 4.4 的索引差集出现**预期之外**的条目 | 停 —— 有东西被误暂存，先 `git diff --cached --name-status` 定位 |
| **S5** | 提交后 `git rev-list --parents -n 1 HEAD` 只有 **1 个父** | 停 —— **合并关系丢了**，按 §八 级 2 恢复 `MERGE_HEAD` 后重做 4.5 |
| **S6** | 任何时刻想 `git push` / `merge --abort` / `checkout history-log.ts` | 停 —— 违反 §零 0.2 |

---

## 四、改动清单（**顺序敏感，逐节做，每节做完立刻跑该节判据**）

### 4.0 备份与**树哈希安全网**（这一步是 Y1 的对策，不能省）

```powershell
New-Item -ItemType Directory -Force -Path .cyrene-merge-analysis\p8 | Out-Null
New-Item -ItemType Directory -Force -Path E:\AI_Chating\cyrene-agent-p8-backup | Out-Null

# ① 提交前的“内容保险”：把当前索引写成一个 tree 对象（只写对象库，不动任何 ref）
$tree = git write-tree
"MERGE TREE = $tree"
$tree | Set-Content .cyrene-merge-analysis\p8\pre-commit-tree.txt -Encoding UTF8

# ② 记录两个父与索引条目数
git rev-parse HEAD MERGE_HEAD | Set-Content .cyrene-merge-analysis\p8\parents.txt -Encoding UTF8
(git ls-files -s | Measure-Object).Count | Set-Content .cyrene-merge-analysis\p8\index-count.txt -Encoding UTF8
git diff --cached --ignore-cr-at-eol --name-status | Set-Content .cyrene-merge-analysis\p8\index-before.txt -Encoding UTF8

# ③ 关键文件备份（本 Phase 会删/改的东西）
$p8files = @(
  'package.json',
  'src/renderer/react/features/settings/ChannelsSettingsPanel.tsx',
  'src/renderer/react/features/settings/ChannelsSettingsMigration.test.ts',
  'src/renderer/react/i18n/zh-CN.json',
  'src/renderer/react/i18n/en.json',
  'src/renderer/react/features/chat/components/panel-layout.test.ts',
  'src/renderer/settings/memory/panel.ts',
  'src/renderer/settings/preferences/panel.ts'
)
foreach ($f in $p8files) { Copy-Item -LiteralPath $f -Destination ("E:\AI_Chating\cyrene-agent-p8-backup\" + ($f -replace '/','__')) -Force }
```

**判据**：

```powershell
Get-Content .cyrene-merge-analysis\p8\pre-commit-tree.txt      # 期望 40 位十六进制
git cat-file -t (Get-Content .cyrene-merge-analysis\p8\pre-commit-tree.txt)   # 期望 tree
(Get-Content .cyrene-merge-analysis\p8\parents.txt | Measure-Object).Count    # 期望 2
```

> 🔴 **这个 `$tree` 是本 Phase 最重要的东西**：提交后即使把提交 reset 掉，也能用
> `git read-tree <tree>` + `git checkout-index -a -f` 把索引与工作区原样恢复。

### 4.1 索引对齐（T1）—— 6 个文件

```powershell
git add -- package.json `
           src/renderer/react/features/settings/ChannelsSettingsPanel.tsx `
           src/renderer/react/features/settings/ChannelsSettingsMigration.test.ts `
           src/renderer/react/features/settings/ChannelsSettingsPanel.css `
           src/renderer/react/i18n/zh-CN.json `
           src/renderer/react/i18n/en.json
```

**判据**：

```powershell
git diff --ignore-cr-at-eol --name-only | Measure-Object   # 期望 0 行（工作区 ≡ 索引）
git diff --cached --ignore-cr-at-eol --stat -- src/renderer/react/features/settings/ChannelsSettingsPanel.tsx   # 期望非空（索引 vs HEAD 本来就有差异 —— 见 J-15）
```

> ⚠️ **J-15 提醒**：「工作区 vs 索引」用 `git diff`（期望**无输出**）；「索引 vs HEAD」用 `git diff --cached`（期望**非空**）。
> **不要把 `--cached` 的非空当成失败**，更**不要**去 revert 这次 `git add`。

### 4.2 D6 扩展（T2）—— 35 个官方新增文档出索引

```powershell
git rm -r --cached --quiet docs/design docs/internal-issue docs/superpowers docs/refactor
```

**判据**：

```powershell
git -c core.quotepath=false ls-files docs | Where-Object { $_ -match '^(docs/design|docs/internal-issue|docs/superpowers|docs/refactor)/' } | Measure-Object   # 期望 0
Test-Path docs/design        # 期望 True（磁盘文件一个没动）
Test-Path docs/superpowers   # 期望 True
```

> 📌 **`docs/merge-plan/` 的 13 个旧路径**已在 P7 出索引（`git ls-files docs/merge-plan` = 0）。若实测非 0，补一条 `git rm -r --cached --quiet docs/merge-plan`。
> 🔴 **不要**碰 `docs/CONTRIBUTORS.md` / `docs/construction/SELF-update 260925/**` / `docs/construction/tools/**`（见事实 2）。

### 4.3 H-07 执行（T3）—— 12 删 + 1 收窄 + 2 删 + 4 留

#### 4.3.1 先确认这些路径都在索引里（不在就换 `Remove-Item` + `git add -A`）

```powershell
$h07 = @(
  # —— 12 个整文件死的测试 ——
  'src/renderer/settings/dom-refs-consistency.test.ts',
  'src/renderer/settings/keywords-markup.test.ts',
  'src/renderer/settings/memory-manager-markup.test.ts',
  'src/renderer/settings/panel-migration-markup.test.ts',
  'src/renderer/settings/zones-markup.test.ts',
  'src/renderer/settings/channels/panel.test.ts',
  'src/renderer/settings/memory/delete-all.test.ts',
  'src/renderer/settings/memory/erasure-flow.test.ts',
  'src/renderer/settings/memory/manager.test.ts',
  'src/renderer/settings/memory/panel.test.ts',
  'src/renderer/settings/zones/panel.test.ts',
  'src/renderer/react/features/chat/components/api-config/api-config-source.test.ts',
  # —— 2 个空壳模块 ——
  'src/renderer/settings/memory/panel.ts',
  'src/renderer/settings/preferences/panel.ts'
)
$missing = $h07 | Where-Object { -not (Test-Path $_) }
if ($missing) { "❌ 磁盘上不存在："; $missing } else { "✅ 14 个路径全部存在" }
$tracked = git ls-files -- $h07
"索引内条目 = " + ($tracked | Measure-Object).Count + "（期望 14）"
```

#### 4.3.2 🔴 收窄 `panel-layout.test.ts`（**不要整文件删**）

**只删这 2 条失败用例**（它们读已被 P4 删除的 `ModelModePanel.css`）：
`:47 it("面板本身是滚动容器", …)` 与 `:53 it("模型网格保持自然高度，不参与 flex 高度分配", …)`（行号为写作时快照，**按 J-13 自己重扫**）。

**保留 4 条绿的**（含 3 条顶栏守卫）：
`:61 API 配置区保持自然高度` · `:68 用量徽章与窗口控件同属 .cy-page-top-right 分组` · `:77 不再使用两个独立的绝对定位容器` · `:84 右上角分组用 flex 排布，且窗口控件尺寸固定不被压缩`。

> 若那 2 条用例与保留的用例共用了读 `ModelModePanel.css` 的辅助函数，**保留辅助函数**（它对绿用例无害）。

**判据**：

```powershell
npx vitest run src/renderer/react/features/chat/components/panel-layout.test.ts
# 期望：Test Files 1 passed (1) / Tests 4 passed (4)（此前是 4 passed / 2 failed）
```

#### 4.3.3 删 12 个整文件死的测试 + 2 个空壳

```powershell
git rm --quiet -- $h07      # 若 4.3.1 报“索引内条目 < 14”，改用：Remove-Item <缺的> -Force; git add -A -- $h07
```

**判据**：

```powershell
($h07 | Where-Object { Test-Path $_ } | Measure-Object).Count    # 期望 0
git status --porcelain -- $h07 | Group-Object { $_.Substring(0,2) } | ForEach-Object { "$($_.Name) x$($_.Count)" }   # 期望 D x14
```

#### 4.3.4 4 个「里子」模块**保持不动**，但把事实钉在原地

```powershell
foreach ($f in 'src/renderer/settings/memory/delete-all.ts','src/renderer/settings/memory/erasure-flow.ts','src/renderer/settings/memory/manager.ts','src/renderer/settings/zones/panel.ts') {
  "{0,-52} 存在={1}  改动={2}" -f $f, (Test-Path $f), ((git status --porcelain -- $f | Measure-Object).Count)
}
# 期望：4 行，全部 存在=True、改动=0
```

### 4.4 提交前门禁（T4）—— **全绿才允许提交**

```powershell
# ① 索引差集校验（Y4）：只允许预期的 4 类差异
git diff --cached --ignore-cr-at-eol --name-status | Set-Content .cyrene-merge-analysis\p8\index-after.txt -Encoding UTF8
Compare-Object (Get-Content .cyrene-merge-analysis\p8\index-before.txt) (Get-Content .cyrene-merge-analysis\p8\index-after.txt) |
  ForEach-Object { "{0} {1}" -f $_.SideIndicator, $_.InputObject }
# 期望差异只有 4 类：
#   => 6 个 P7 文件的 M 行被新增（SideIndicator 为 =>）
#   <= 35 个官方文档的 A 行被移除（<=）
#   <= 12 个测试 A/M 行被移除
#   <= 2 个空壳模块行被移除
# 任何其它条目 → 停（S4）

# ② 三套编译面
"main     = " + (npx tsc -p tsconfig.main.json    2>&1 | Select-String 'error TS' | Measure-Object).Count   # 期望 0
"preload  = " + (npx tsc -p tsconfig.preload.json 2>&1 | Select-String 'error TS' | Measure-Object).Count   # 期望 0
"renderer = " + (npx tsc -p tsconfig.renderer.json 2>&1 | Select-String 'error TS' | Measure-Object).Count  # 期望 0

# ③ 定向门禁（13 文件 / 273 tests）
npx vitest run `
  src/main/channels/group-context-flow.test.ts src/main/channels/history-log.test.ts `
  src/main/channels/channel-context.test.ts src/main/channels/dispatcher.test.ts src/main/channels/bootstrap.test.ts `
  src/main/channels/settings-store.test.ts `
  src/main/orchestrator/tools/registry/tool-registry-memory.test.ts src/main/orchestrator/group-context-injection.test.ts `
  src/main/orchestrator/build-options.test.ts src/main/orchestrator/agent-runtime.test.ts `
  src/main/settings/settings-facade.test.ts src/main/conversation-usage-store.test.ts `
  src/renderer/react/features/settings/ChannelsSettingsMigration.test.ts
# 期望：13 passed / 273 passed

# ④ 全量（H-07 之后的 EXPECTED 值 —— 见事实 5）
npm test
# 期望：Test Files 2 failed | 559 passed (561)；Tests 2 failed | 5403 passed | 1 skipped (5406)
# 且剩余 2 个失败文件 = theme-token-contract（③）+ default-dialogs-regression（④）

# ⑤ 语料 + 探测器（最贵失效点的门禁）
npx vitest run src/main/memory/memory-deletion.test.ts src/main/corpus/group-corpus-isolation.test.ts src/main/channels/group-context-flow.test.ts
# 期望：Tests 26 passed
```

### 4.5 🔴 提交（T5）—— 全任务唯一一次 `git commit`

**① 写提交信息文件（**必须无 BOM**，Y2）**：

```powershell
$msg = @'
merge(P8): 完成三方合并 —— 本地 12 天工作重接到官方 b11b8851

范围：46 文件 / 64 冲突块（P3 实测）→ P4 15 删 + P5 17 文件/27 块 + P6 9 文件/36 块
状态：UU/UD/DU/AA = 0；全仓库冲突标记 = 0；三套 tsc = 0

关键决策
- D1 桌面对话绑定彻底删除（保留 conversation-binding-store，zones 仍依赖）
- D2 旧设置窗退场，设置走官方 React 路线
- D3 群聊旁听不迁进 CTA 轨迹（history-log 原样保留）
- D4 群语料原地不动（corpus 与 CTA 无关）
- D5 旧版本兼容默认放弃
- D6 任务文档不进本提交

验证（P7 收口 + 验证作业单实测）
- 定向门禁 13 文件 / 273 tests 全绿；语料豁免 22 passed；群聊旁听探测器 4 passed
- 全量仅剩 2 条存量失败（ToolConsolePanel 的令牌与 window.confirm），与合并无关
- 构建链：vite 8.3.0 / vitest 5.0.1 / electron 44.4.3；dist/renderer 6 个入口产物

已知遗留（P9 处理）
- 渠道控制台 / 记忆管理台（含按人擦除、删除全部记忆）/ 区块页 三项 UI 入口未接回官方 React 设置页；
  后端与 preload 桥完好（渲染层 0 调用）。判据 J-19、台账 H-15
'@
$msgPath = '.cyrene-merge-analysis\p8\commit-message.txt'
[System.IO.File]::WriteAllText((Join-Path $PWD $msgPath), $msg, (New-Object System.Text.UTF8Encoding($false)))

# 回读校验：首字节不能是 EF（BOM）
$b = [System.IO.File]::ReadAllBytes((Resolve-Path $msgPath))
"首 3 字节 = " + (($b[0..2] | ForEach-Object { $_.ToString('X2') }) -join ' ') + "（期望不是 EF BB BF）"
Get-Content $msgPath -TotalCount 1     # 期望就是 merge(P8): 开头
```

**② 提交**：

```powershell
git commit -F .cyrene-merge-analysis\p8\commit-message.txt
"exit=$LASTEXITCODE"      # 期望 0
```

**③ 判据（T5 的核心）**：

```powershell
git log --oneline -3
git rev-list --parents -n 1 HEAD        # 期望 3 段：<新提交> 598dfb75 b11b8851 ← 【2 个父】
git rev-parse --short HEAD              # 新的短哈希（记录到交付物）
Test-Path .git/MERGE_HEAD               # 期望 False（合并已完成）
(git status --porcelain | Where-Object { $_.Substring(0,2) -match '^(UU|UD|DU|AA)$' } | Measure-Object).Count   # 期望 0
```

### 4.6 提交后复核（T4 的收口）

```powershell
# ① 工作区状态：应只剩未跟踪（docs 22 + .cyrene-merge-analysis 7 + dist 少量）
git status --porcelain | Group-Object { $_.Substring(0,2) } | Sort-Object Name | ForEach-Object { "$($_.Name) x$($_.Count)" }
# 期望：只有 ?? 行；不应再出现 M / D / A（有则说明提交没吃下全部改动 → 停并报告）

# ② 提交内容抽查（防止把不该提交的吃进去）
git show --stat --oneline HEAD | Select-Object -First 8
git show --name-only --format="" HEAD | Select-String 'history-log|corpus/|\.cyrene-merge-analysis|^docs/' | ForEach-Object { "  ⚠️ " + $_.Line }
# 期望：① history-log.ts 只可能出现在“其它文件的附带”，不应有独立改动；② 不应有 corpus/** ；
#       ③ 不应有 .cyrene-merge-analysis/** ；④ docs/ 只允许出现【删除】的旧 merge-plan 条目（D6 的既定后果）

# ③ 关键文件在提交里的版本正确（T1 的最终验证）
git show HEAD:src/renderer/react/features/settings/ChannelsSettingsPanel.tsx | Select-String 'channelsContext|mirrorToDesktop' | Measure-Object   # 期望 0
git show HEAD:src/main/channels/history-log.ts | Measure-Object | Select-Object -Expand Count    # 期望 ≥ 590（16 个本地导出仍在）
```

### 4.7 销账与回写（T6）

```powershell
# 提交成功并复核通过后，打一个本地锚点 tag（沿用本任务既有约定）
git tag phase8-merged
git tag --list 'phase*'
# 期望看到：phase0-full / phase3-work-snapshot / phase8-merged
```

**台账销账（本 Phase 可销 3 条）**：

| 条目 | 结论 | 证据 |
|---|---|---|
| **H-04** 中文编码完整性 | ✅ **销账** | 验证作业单执行报告 §3.1 B-5：截图内全部中文正常（记忆/长期画像/外部渠道/连接手机/语音合成…），无 `????`/`æ¶`/`�` |
| **H-14** 绑定彻底消失 | ✅ **销账** | P7 已清死开关与崩溃根因 + 执行业务单 B-1 第 1 步（页面能开、不崩）+ 第 5 步机器侧 grep 0 + 第 6 步人眼通过 |
| **H-07** 死子树处置 | ✅ **销账** | 本 Phase 4.3 执行完毕：12 删 + 1 收窄 + 2 删 + 4 留 |
| H-05 / H-01 | ⏳ **留待**（缺顶栏截图 / 需选中会话后看徽章） | 作业单 B-4 / B-3 记 🚫 的理由 |
| H-02 / H-03 | ⏳ **转 P9**（缺入口：记忆页无该控件 / 无「删除全部记忆」按钮） | 缺陷报告 §4.1 |
| H-08 / H-09 / H-11 / H-12 / H-13（运行期） | ⏳ **留待**（缺模型服务与真实渠道；H-11/H-12 另缺控制台入口） | 作业单 C 类 |
| H-06 | ⏳ **待项目所有者书面点头** | 不属 agent 可判 |
| **H-15** | ⏳ **转 P9 执行** | 已拍板路线：C 立即接回 + ②③ React 重写 |

---

## 五、人工环节（规范 §4.1）

### 5.1 H-A 拍板（施工前）

**本 Phase 无新 H-A 阻塞项** —— H-07（拆分）、H-15（路线）、顺序（先提交）三项均已由项目所有者拍板并记入台账/总蓝图。

### 5.2 H-B 评审（施工后·退出条件）

| 编号 | 评审项 | 期望（agent 已预先算出） | 人只做判断 |
|---|---|---|---|
| **H-B5** | **提交内容是否符合预期** | commit message 首行 = `merge(P8): 完成三方合并 —— 本地 12 天工作重接到官方 b11b8851`；父提交 2 个（`598dfb75` + `b11b8851`）；不含 `docs/` 任务文档、不含 `.cyrene-merge-analysis/**` | ✅/❌ |
| **H-B6** | **是否同意推送到 origin（gitee）** | 本 Phase **未推送**；是否推送、何时推送由项目所有者决定 | ✅（推）/ ⏸（暂不推） |

### 5.3 H-C 登记

| 台账条目 | 本 Phase 动作 |
|---|---|
| H-04 / H-14 / H-07 | **销账**（证据见 §四 4.7） |
| H-02 / H-03 / H-15 | 标「**转 P9**」 |
| H-01 / H-05 | 标「**待人眼补验**」（补一张含顶栏的截图 + 选中会话后再看徽章） |
| H-08 / H-09 / H-11 / H-12 / H-13（运行期） | 标「**待模型服务与真实渠道**」 |

---

## 六、验收测试

### 6.1 A1–A9

| # | 验收项 | 命令 | 期望 |
|---|---|---|---|
| **A1** | 索引对齐 | `git diff --ignore-cr-at-eol --name-only` | **0 行** |
| **A2** | D6 扩展 | `git ls-files docs` 过滤四个前缀 | **0** |
| **A3** | H-07 执行 | §四 4.3 各步判据 | 12 测试不存在 / `panel-layout` **4 passed** / 2 空壳不存在 / 4 里子仍在且未改动 |
| **A4** | 三套编译面 | §四 4.4 ② | 全 **0** |
| **A5** | 定向门禁 | §四 4.4 ③ | **13 passed / 273 passed** |
| **A6** | 全量测试 | §四 4.4 ④ | **`2 failed \| 559 passed (561)`** / **`Tests 2 failed \| 5403 passed \| 1 skipped (5406)`** |
| **A7** | 语料 + 探测器 | §四 4.4 ⑤ | **26 passed** |
| **A8** | 🔴 **提交成立** | §四 4.5 ③ | **2 个父**；`.git/MERGE_HEAD` 不存在；`UU` = 0 |
| **A9** | 提交后复核 + 锚点 | §四 4.6 + 4.7 | 状态只剩 `??`；关键文件版本正确；`phase8-merged` tag 已打 |

### 6.2 四类"不算失败"（**本 Phase 后只剩 2 类**）

| 类 | 定义 | 本 Phase 后 |
|---|---|---|
| **① 依赖未装** | — | ✅ **已归零**（P7 装齐依赖，P8 复核仍为 0） |
| **② 失去被测对象** | P4 删文件的数学后果 | ✅ **已随 H-07 执行清零**（12 删 + 1 收窄） |
| **③ 存量违规** | `theme-token-contract.test.ts`：`ToolConsolePanel.css` 令牌违规 | ⚠️ **仍存在（1 failed test）** → **P9 接回控制台后升级为"用户可见面板的缺陷"**，建议 P9 一并修 |
| **④ 与合并无关的存量失败** | `default-dialogs-regression.test.ts`：`ToolConsolePanel.tsx:285` 的 `window.confirm` | ⚠️ **仍存在（1 failed test）** → 同上 |

### 6.3 保护功能基线（11 项）

```powershell
$base = Get-Content .cyrene-merge-analysis/protected-features-baseline.json | ConvertFrom-Json
foreach($p in $base){
  $hits = & findstr /S /M /C:"$($p.标识)" "src\*.ts" "src\*.tsx" 2>$null
  $now = if($hits){ ($hits | Measure-Object).Count } else { 0 }
  Write-Output ("{0,-22} 基线 {1,2} → 现在 {2,2} {3}" -f $p.功能, $p.文件数, $now, $(if($now -ge $p.文件数){'✔'}else{'✘ 退化!'}))
}
```

**判据（J-16：不看脚本的 ✘，看上一 Phase 报告）**：以 **P7 报告 §四 的 11/11** 为基准逐项比对
（`memory-console` 4 / `person-erasure` 8 / `ZONES_` 5 / `audit-log` 11 / `tool-access` 13 / `keyword-policy` 6 /
`group-corpus` 10 / `buildGroupContextBlock` 5 / `USAGE_BADGE` 2 / `groupContextLimit` 10 / `confirmValue` 5）。
**脚本对 2 项报"退化"属已知误报**（基线文件是 Phase 0 生成、从未更新）→ **不修脚本、不改基线**。

---

## 七、交付物

| # | 文件 / 对象 | 内容 |
|---|---|---|
| 1 | **新提交**（`git rev-parse HEAD`） | 🔴 **本任务第一个真正的提交**（合并提交，2 个父）；短哈希记入完成报告 |
| 2 | `.cyrene-merge-analysis/p8/commit-message.txt` | 提交信息原文（无 BOM） |
| 3 | `.cyrene-merge-analysis/p8/pre-commit-tree.txt` | **提交前索引的 tree 哈希**（回退保险） |
| 4 | `.cyrene-merge-analysis/p8/{parents,index-count,index-before,index-after}.txt` | 父提交 / 索引条目数 / 索引差集快照 |
| 5 | `E:\AI_Chating\cyrene-agent-p8-backup` | 8 个关键文件原始态 |
| 6 | 本地 tag `phase8-merged` | 提交锚点 |
| 7 | 删除项汇总 | 12 个死测试文件 + 2 个空壳模块（**14 个路径**，在报告里逐个列出） |
| 8 | `package.json`（2 行 `allowScripts` 的 `esbuild` 版本更新） | P7 的副作用，**本 Phase 让它随提交进入历史**（确认有意） |
| 9 | 蓝图 / 报告 / 台账回写 | 见 §十三 |

---

## 八、回退方法

```powershell
cd E:\AI_Chating\cyrene-agent
$env:PATH = "D:\data\node24;" + $env:PATH

# 级 1 · 提交前的内容保险（最稳）
$tree = Get-Content .cyrene-merge-analysis\p8\pre-commit-tree.txt
git read-tree $tree            # 只恢复索引
git checkout-index -a -f       # 需要时再把工作区刷成该 tree（⚠️ 会覆盖工作区，先确认没有别的未保存改动）

# 级 2 · 撤销提交但保留“合并进行中”的状态（Y1 的对策）
git reset --soft 598dfb75
git update-ref MERGE_HEAD b11b8851        # 恢复 pseudoref；此后 HEAD/索引 = 提交前一刻
git rev-parse --short MERGE_HEAD          # 期望 b11b8851

# 级 3 · 撤销提交并把改动退回工作区
git reset --mixed 598dfb75                # 索引回退，工作区文件不动

# 级 4 · 单文件回退
Copy-Item "E:\AI_Chating\cyrene-agent-p8-backup\<path 以 __ 替换斜杠>" <path> -Force
git checkout phase3-work-snapshot -- <path>

# 级 5 · 回到已完成的提交（若只是一时看错）
git reset --hard <新提交短哈希>            # ⚠️ 会丢工作区改动，先确认
```

> 🔴 **永不** `git merge --abort`（会丢 P3–P8 全部成果）。
> 🔴 **永不** `git checkout <ref> -- .`、**永不** `git push --force`。
> ⚠️ **提交后 `.git/MERGE_HEAD` 就没了** —— 这是**单向门**；要恢复只能按级 2 的 `update-ref` 手法。

---

## 九、已知坑

| 坑（键号） | 本次是否预计复现 | 说明 |
|---|---|---|
| **K10** PowerShell `-Pattern` 计数不可靠 | ✅ | 索引差集、测试计数都要**回读原文**复核（P6/P7 均踩过） |
| **K13** 临时 worktree + junction 删 `node_modules` 会误删主仓 | ❌ 本 Phase 不建 worktree | 不要在 worktree 里验提交 |
| **K15** 删宿主文件不会自动暴露依赖者 | ✅ | 删 2 个空壳前已实测「被引用 = 0」；删 12 个测试不会影响 `tsc`（它们不在任何 tsconfig 内） |
| **（新）** `git commit -F` 的 BOM 污染首行 | ✅ **Y2** | 用 .NET UTF8 **无 BOM** 写消息文件 + 回读首三字节校验 |
| **（新）** 提交后合并态不可自然恢复 | ✅ **Y1** | 提交前先 `git write-tree`；恢复手法见 §八 级 2 |
| **（新）** 「删 N 个测试」会把其中的**绿色守卫**一起删掉 | ✅ **Y3** | 必须按**用例粒度**看：`panel-layout` 是 4 绿 2 红，**只删红的 2 条** |
| **（新）** 852 文件的既存暂存内容里有没有混进别的东西，肉眼看不出来 | ✅ **Y4** | 索引**前后快照 + `Compare-Object`** 差集校验（§四 4.4 ①） |

---

## 十、交接给 P9（功能入口接回）

1. 🔴 **提交已完成**：`phase8-merged` tag 指向它。P9 的一切改动都建立在**已提交的干净基线**上，不再有"孤本"风险。
2. 🔴 **P9 的三件事**（已拍板路线）：
   - **① 渠道控制台最小接回**：`ChatPageNavigation.tsx` 补 `import { ToolConsoleButton }`（一行）+ 在侧栏按钮组（`ScheduledTasksModeButton` / `MomentsModeButton` 所在的容器）补一行 `<ToolConsoleButton active={activePanel === "console"} onClick={() => onTogglePanel("console")} />`。**`ChatPagePanel` 已含 `"console"`、`ChatPagePanelHost.tsx:18` 已有 `case`，都不要动。**
   - **② 记忆台 + 按人擦除 + 删除全部记忆**：在 `MemorySettingsPanel.tsx` 增区块，调 `useSettingsApi()` 上已就绪的 `deleteAll` / `listMemoryManager` / `queryMemoryManager` / `deleteMemoryManager` / `erasePreview` / `erasePerson`。
   - **③ 区块页**：新建 `ZonesSettingsPanel.tsx` 并注册 `section="zones"`，调 `getZoneSnapshot` / `createZone` / `renameZone` / `deleteZone` / `updateZoneConfig` / `addZoneMember` / `removeZoneMember` / `moveZoneMembers`。
3. 🔴 **4 个「里子」模块的正确用法**（见 §二 事实 3）：**不能直接 `import`**（DOM 耦合 + `delete-all.ts` 依赖已删的 `../i18n` + 不在 `tsconfig.renderer.json` 的 include 内）。正确做法是**把其中的纯函数抄/抽到 React 侧**（如 `src/renderer/react/features/settings/lib/`），并为它们**写新测试**——**保留的 4 个模块已无测试覆盖**（H-07 把测试删了）。
4. 📌 **P9 完成后必须复验被阻塞的 5 条**：B-6 第 5 步（H-13 区块开关）/ B-8（H-02）/ B-9（H-03）/ C-3（H-11）/ C-4（H-12）。
5. ⚠️ **③④ 两类失败在 P9 会"升级"**：接回控制台后，`ToolConsolePanel.css` 的令牌违规与 `ToolConsolePanel.tsx:285` 的 `window.confirm` 就从"存量问题"变成"**用户可见面板的缺陷**" → 建议 P9 顺手修掉（前者改角色令牌变量，后者换 Agent 的确认弹窗）。
6. 📌 **H-01 / H-05 的补验**：需要一张**含顶栏**的截图 + **选中一个会话后**再看用量徽章（`UsageBadge.tsx:171` 在 `sessionId` 为空时按设计不渲染）。
7. 📌 **推送仍未做**：远端是 `origin https://gitee.com/playa0/cyrene-agent.git`（`master`）。要不要推、什么时候推，由项目所有者决定。
8. 🔴 **门禁名单不许缩减**：`group-context-flow.test.ts`（群聊旁听探测器）必须留在 P9/P10 的门禁里。

---

## 十一、改动的目标达成核对（**执行后回填**）

| 目标（§一） | 状态 | 证据 |
|---|---|---|
| T1 索引对齐（6 文件） | ✅ **达成** | `git diff --ignore-cr-at-eol --name-only` = **0 行**（工作区 ≡ 索引）；6 文件均已入库 |
| T2 D6 扩展（35 文档） | ✅ **达成** | `git -c core.quotepath=false ls-files docs` 对四个前缀 = **0**；提交树里亦 **0**；85 个文档文件**磁盘一个没动** |
| T3 H-07 执行 | ✅ **达成**（规模按 **J-20 修正**） | **12 整文件删**（磁盘/索引/提交树三处均 0，`git status` = `D x14` 含 2 空壳）+ `panel-layout.test.ts` **收窄为 4 passed (4)**（保留 4 条绿守卫）+ **2 空壳删** + **4 里子留**（`存在=True 改动=0`）<br>⚠️ **不是"13 删"**：13 个里 1 个是"部分死"（4 绿 2 红） |
| T4 门禁复核 | ✅ **达成** | 三套 `tsc` = **0/0/0**；定向门禁 **13 passed / 273 passed**；全量 **`2 failed \| 559 passed (561)`** / **`2 failed \| 5403 passed \| 1 skipped (5406)`**；`ERR_MODULE_NOT_FOUND` = **0**；语料+探测器 **26 passed** |
| T5 🔴 提交合并 | ✅ **达成** | 新提交短哈希 = **`51a20338`**；`git rev-list --parents -n 1 HEAD` = **3 段（2 个父：`598dfb75` + `b11b8851`）**；`.git/MERGE_HEAD` = **False**；`UU` = **0**；tag `phase8-merged` |
| T6 台账销账 | ✅ **达成** | **H-04 / H-14 / H-07 → ✅ 已销账**（附证据）；H-01/H-05 标「待人眼补验」；H-02/H-03/H-15 标「转 P9」；H-06 待书面点头；运行期条目待模型服务 |

**非目标遵守情况**（执行后逐条填）

| 非目标 | 是否越界 | 证据 |
|---|---|---|
| N1 未 push | ✅ **未越界** | 全程**未执行任何 push**；`git status -sb` 显示 `## master`（无上游跟踪行、也未做推送动作）；远端 `origin https://gitee.com/playa0/cyrene-agent.git` 保持未触碰 |
| N2 未做入口恢复 | ✅ **未越界** | `ToolConsoleButton` 仍 **0 引用**（除自身文件外）；`src/renderer/react` 对 `getZoneSnapshot\|createZone\|erasePerson\|listMemoryManager\|deleteMemoryManager\|queryMemoryManager` 仍 **0 命中**（三项入口全部留给 P9） |
| N3 未修 ③④ | ✅ **未越界** | 提交后全量仍为 **2 failed**，且正是 ③ `theme-token-contract` + ④ `default-dialogs-regression`；未改 `ToolConsolePanel.css` / `ToolConsolePanel.tsx` |
| N4 未改生产代码 | ✅ **未越界**（**2 个测试文件的收窄除外**） | 本次仅动 **2 个测试文件**：`panel-layout.test.ts`（§4.3.2 收窄）+ `default-dialogs-regression.test.ts`（**§十二 子节 2 新增偏离**，同款收窄）。`git show --name-only` 中 **main / preload / renderer 的 `.ts`/`.tsx` 生产文件改动数 = 0**（仅 `package.json` 随 P7 副作用入库） |
| N5 未动 history-log / corpus / binding-store | ✅ **未越界** | 🔴 **逐字节取证**：`src/main/channels/history-log.ts` 在 `51a20338` 与 `598dfb75`（合并前基线）两侧 **blob 完全相同 = `c7e54e88…`**（598 行 / 19 处 export 字样 / `buildGroupContextBlock` 2 命中）；`src/main/corpus/**` 无改动；`src/main/channels/conversation-binding-store.ts` 保留（163 行，`bind`/`unbind`/`resolve` 实测 **0 命中** —— D1 的"删除"落地） |
| N6 未动依赖与锁 | ✅ **未越界**（**判据已按 J-21 修正**） | `package-lock.json`：**工作区 ≡ 索引**（`git diff --name-only` = 0）且**索引 blob = `05dcca09…` = `MERGE_HEAD` 的版本** ⇒ **本 Phase 未改动锁文件**。⚠️ 它**与 `HEAD` 不同**（`HEAD` = `c35efd99…`）是**P3 合并本身**把官方版装进索引的既定结果，**不是 P8 的动作**（原判据"哈希仍 `05dcca09…`"缺路，见 J-21） |
| N7 未提交过程/构建产物 | ✅ **未越界** | `git show --name-only HEAD` 中：`.cyrene-merge-analysis/**` **0**、`corpus/**` **0**、`dist/` 仅 1 个既有条目附带（`models/` 2 条、`.cyrene-merge-analysis` 30 条**均为 `HEAD` 既有已跟踪内容，索引 ≡ HEAD，非 P8 新增**）；`docs/` 仅 28 条**既有**文档（`CONTRIBUTORS.md` / `SELF-update 260925/**` / `construction/tools/**` / `user-guide/**` …），**D6 四前缀 + merge-plan + construction/合并 全部 0** |

---

## 十二、施工记录（执行者追加；**子节 0 为必需**）

### 子节 0 · 人工环节回执

| 编号 | 议题 | 答复原文 | 时间 |
|---|---|---|---|
| H-A | 本 Phase 无新拍板项（H-07 / H-15 / 顺序已拍板） | **无新拍板项** —— §零 0.1 的三条（① 先提交合并再做入口恢复 ② D6 扩展：任何文档不进合并提交 ③ H-07 拆分执行）均已由项目所有者拍板并记入总蓝图 §五 D6 / 台账 H-07 / H-15。执行者**逐条照做，未重新论证** | 2026（施工前） |
| H-B5 | 提交内容是否符合预期 | ⏳ **待人判** —— agent 已预先算出全部判据供人只做判断：<br>① 提交信息首行 = `merge(P8): 完成三方合并 —— 本地 12 天工作重接到官方 b11b8851`（**首三字节 `6D 65 72`，无 BOM**）✅<br>② 父提交 **2 个**（`598dfb75` + `b11b8851`）✅<br>③ **不含** `docs/` 任务文档（D6 四前缀 + `merge-plan` + `construction/合并` 全为 0）✅<br>④ **不含** `.cyrene-merge-analysis/**`（0 条）✅<br>⑤ 提交短哈希 = **`51a20338`** | 2026（施工后） |
| H-B6 | 是否推送 origin | ⏳ **待人定** —— **本 Phase 未推送**（非目标 N1）。远端 = `origin https://gitee.com/playa0/cyrene-agent.git`（分支 `master`）。**是否推送 / 何时推送由项目所有者决定** | 2026（施工后） |
| H-C | 销账编号 | **H-04 · H-14 · H-07 → ✅ 已销账**（证据见台账 §五 销账记录）<br>**H-01 · H-05 → 待人眼补验**（H-01 需先选中会话；H-05 缺含顶栏截图）<br>**H-02 · H-03 · H-15 → 转 P9**；**H-06 → 待项目所有者书面点头**<br>**H-08 · H-09 · H-11 · H-12 · H-13（运行期）→ 待模型服务与真实渠道** | 2026（施工后） |

### 子节 1 · 实际落地（偏离三列表）

| # | 蓝图要求 | 实际实现 | 原因 |
|---|---|---|---|
| 1 | §4.3.3 `git rm --quiet -- $h07` | **拆两步**：12 个测试用 `git rm --quiet`（exit 0）；**2 个空壳用 `git rm --quiet -f`** | 2 个空壳有**已暂存改动**（`M`）→ 无 `-f` 时 git 拒绝：`error: the following files have changes staged in the index`。蓝图括号里预告了"索引内条目 < 14 才换法"，实测是**另一种**原因（暂存改动而非未跟踪） |
| 2 | §4.0 写一次 `pre-commit-tree` | **写两次**：4.0 写索引原始态（`e7a7bced…`），4.5 提交前**刷新**为最终态（`5bc24f0a…`） | 4.1–4.3 会改索引 → 4.0 那个 tree 已不反映"提交前一刻"。仅写一次的话，回退保险指向的是**过时内容** |
| 3 | §4.4 ④ 期望全量 = `2 failed \| 559 passed (561)` / `2 failed \| 5403 passed \| 1 skipped (5406)` | ✅ **四个数字最终全部吻合** | 但达成路径与蓝图预设不同：中途出现**第 3 个**失败文件（见子节 2 ①），**必须先修它**才能收敛到蓝图数字 |
| 4 | §4.7 `git tag phase8-merged` | 照做，指向 `51a20338` | 无偏离 |

### 子节 2 · 蓝图未覆盖、施工中发现的漏洞

**① 🔴 `src/renderer/settings/default-dialogs-regression.test.ts` 被 H-07 连带打破（蓝图完全未提）**

- **现象**：删掉 2 个空壳后，该文件报 `Error: ENOENT: no such file or directory, open 'E:\…\src\renderer\settings\memory\panel.ts'` → 全量出现**第 3 个**失败文件（`3 failed | 558 passed`，Tests `3 failed | 5402 passed`）。
- **根因**：它**硬编码**了一张 8 个 `panel.ts` 的路径清单（`:7-11`）并逐个 `readFileSync`，其中 `memory/panel.ts`、`preferences/panel.ts` 正是 H-07 要删的 2 个空壳。**"被引用 = 0"的核查只查了代码 import 图，漏了"以路径字符串引用"**；且该文件**不在任何 tsconfig 的 include 内** → `tsc` 也看不见 → **两道静态门禁同时失明**。
- **处置**：按 §4.3.2 的**同款「收窄」**修（保留守卫、改为存在性过滤 `fs.existsSync` 才读）→ 修后 `Tests 2 passed (2)`。
- **🔴 危害量化（这是本 Phase 最重要的一处"必须记下来"）**：**若不修它，就永远收敛不到蓝图数字**，而且会得出**两个错误结论**之一：
  ⓐ "删多了 / 删错了"（触发假警报 S2）→ 可能去**恢复那 2 个空壳**，与 H-07 定案冲突；
  ⓑ 把这条失败**归入"与合并无关的存量失败"**混过去 → 守卫**永久假红**，从此没人再看它。
- **判据沉淀**：新增 **J-20**（用例粒度）× **F18**（路径字符串引用）两条经验；蓝图的 S2 停止条件应补一句"**≥3 时先逐条确认新增失败的死因，不要直接判为删多了**"。

**② 蓝图的索引条目数预估（≈2299）与实际（2262）差 37 —— 不是丢失，是预估口径漏了一层**

- 蓝图算式：`2361 − 35 − 13 − 12 − 2 ≈ 2299`。
- **实测正确算式**：`2025（HEAD 文件数） + 388（索引新增） − 151（索引移除） = 2262`。
- **差异来源**：蓝图只减了"本次出索引的 49 条"，却**没算 P3 合并本身**把一批文件（旧 `docs/merge-plan` 13 + P4–P6 删的代码）从索引移除、又把 388 条官方新文件加进来的净效应。
- **安全性结论（逐条实测）**：151 条移除**全部是预期项**（14 条 = H-07；其余 = P4/P5/P6/P7 已登记的删除或 `settings/**` 旧外壳）；且 `git status` 的 `'D '`（索引删了、工作区还在）**= 141 条全部有据可查、磁盘内容无一丢失**；`' D'`（两边都没了）**= 0**。⇒ 蓝图自己也写了"**不作硬判据**"，正确处理是**换成路径级集合比较**（见经验 C23）。

**③ 一处"受保护功能"的预期退化在提交后才被看清（`groupContextLimit` 11 → 10 → 8）**

- P7 报告记为 10，P8 实测 **8**。差值 2 来自 H-07 删掉的 2 个空壳，其中 `settings/memory/panel.ts` 一个文件里就有 **23 处**命中（`preferences/panel.ts` 为 0）。
- **已确认后端链路完好**（8 个文件覆盖 `general-settings.ts` → `settings-facade.ts` → `orchestrator/index.ts` + `build-options.ts`），**丢失的只是已死的旧设置窗 UI 控件位** → 与 H-15 同源，归 P9。
- ⚠️ **但这条退化在"提交前"没被单独判过**：§6.3 的脚本把它报成 `✘ 退化!`，而 J-16 允许"能归因到本 Phase 主动删除的文件即豁免"——**归因是在提交后才补做的**。⇒ 教训：**"删除动作"的连带退化应在删除前后各跑一次基线**，而不是等到复验收尾时才发现。

### 子节 3 · 提交记录

| 项 | 实测 |
|---|---|
| `pre-commit-tree.txt` | **`5bc24f0a03fdfe0fb964637faa8ae3b35f523927`**（提交前最终索引；4.0 的初版为 `e7a7bcedec19d3ca2a2a4be141fa61e1fdc3c354`） |
| 新提交短哈希 / `git rev-list --parents` | **`51a20338`** ／ `51a20338b9f4a6a23b9d7124bcb7476607ac3293 598dfb75d9cdcaa6929695026120a0fab38dc2ca b11b88512cf0cf6dace56b59ff9487947ef01c28` ⇒ **2 个父** ✅ |
| 提交信息首行 | `merge(P8): 完成三方合并 —— 本地 12 天工作重接到官方 b11b8851`（**首三字节 = `6D 65 72`**，无 BOM ✅） |
| 提交后 `git status` 分组 | 只剩 **`?? x16`**（无 `M` / `D` / `A` 残留）；明细 = `.cyrene-merge-analysis` 9 组 + 任务文档 13 + `dist/renderer/cyrene-welcome.png` |
| `phase8-merged` tag | ✅ 已打，指向 `51a20338`；`git tag --list 'phase*'` = `phase0-full` / `phase0-tracked` / `phase3-work-snapshot` / **`phase8-merged`** |
| 提交范围 | `878 files changed, 90361 insertions(+), 54688 deletions(-)`（`--ignore-cr-at-eol --shortstat`） |
| 索引 / 提交树一致 | `git ls-files` = 2262 == `git ls-tree -r HEAD` = 2262，`Compare-Object` 差集 **0** |

### 子节 4 · 测试基线对比

| 层 | 开工前（P7 末） | 完工后（P8） |
|---|---|---|
| 三套 tsc | 0 / exit 0 / 0 | ✅ **0 / 0 / 0**（未退化） |
| 定向门禁 | 13 文件 / 273 tests | ✅ **13 passed (13) / 273 passed (273)** |
| 全量 | `15 failed / 558 passed (573)`；`4 failed tests` | ✅ **`2 failed / 559 passed (561)`**；`Tests 2 failed / 5403 passed / 1 skipped (5406)` |
| 语料 + 探测器 | 26 passed | ✅ **26 passed**（`memory-deletion` 15 + `group-context-flow` 4 + `group-corpus-isolation` 7） |
| 11 项受保护功能 | 11/11（4/8/5/11/13/6/10/5/2/10/5） | ✅ **11/11**（4/8/5/11/13/6/10/5/2/**8**/4；`groupContextLimit` 的 10→8 **已归因**，见子节 2 ③） |
| `ERR_MODULE_NOT_FOUND` | 0 | ✅ **0**（①类保持归零） |

> **全量数字的组成校验**：`573 − 12 = 561`（H-07 删的 12 个整文件死测试）；`5408 − 2 = 5406`（`panel-layout` 收窄掉的 2 条红用例）。
> **失败 tests 4 → 2** 的减法：`4 − 2`（panel-layout 收窄）= 2 → 恰好 = ③④ 两条存量失败 ⇒ 与蓝图预期**逐项吻合**。

### 子节 5 · 删除项清单（**逐条列全**）

**A · 整文件删（12 个测试，均实测 `(0 test)`）** —— 全部：磁盘不存在 ✅ / 索引 0 ✅ / 提交树 0 ✅

| # | 路径 | baseline 实测 |
|---|---|---|
| 1 | `src/renderer/settings/dom-refs-consistency.test.ts` | `(0 test)` 加载期 ENOENT |
| 2 | `src/renderer/settings/keywords-markup.test.ts` | `(0 test)` |
| 3 | `src/renderer/settings/memory-manager-markup.test.ts` | `(0 test)` |
| 4 | `src/renderer/settings/panel-migration-markup.test.ts` | `(0 test)` |
| 5 | `src/renderer/settings/zones-markup.test.ts` | `(0 test)` |
| 6 | `src/renderer/settings/channels/panel.test.ts` | `(0 test)` |
| 7 | `src/renderer/settings/memory/delete-all.test.ts` | `(0 test)`（`Failed to resolve import "../i18n"`，唯一死于 i18n 的那个） |
| 8 | `src/renderer/settings/memory/erasure-flow.test.ts` | `(0 test)` |
| 9 | `src/renderer/settings/memory/manager.test.ts` | `(0 test)` |
| 10 | `src/renderer/settings/memory/panel.test.ts` | `(0 test)` |
| 11 | `src/renderer/settings/zones/panel.test.ts` | `(0 test)` |
| 12 | `src/renderer/react/features/chat/components/api-config/api-config-source.test.ts` | `(0 test)` |

**B · 空壳模块删（2 个，均实测「被引用 = 0」）** —— 磁盘 0 ✅ / 索引 0 ✅ / 提交树 0 ✅

| # | 路径 | 备注 |
|---|---|---|
| 13 | `src/renderer/settings/memory/panel.ts` | 死于 `../i18n`；**23 处 `groupContextLimit` 命中在此**（见子节 2 ③）；被 `default-dialogs-regression.test.ts` 以路径字符串引用（见子节 2 ①） |
| 14 | `src/renderer/settings/preferences/panel.ts` | 被引用 = 0 |

**C · 文件收窄（不是删文件）—— `panel-layout.test.ts` 被删的 2 条用例**

| # | 被删用例名 | 死因 |
|---|---|---|
| 1 | `面板本身是滚动容器` | `read("./ModelModePanel.css")` → 该 CSS 已被 P4 删除 |
| 2 | `模型网格保持自然高度，不参与 flex 高度分配` | 同上 |

> **保留的 4 条（全绿，一条未动）**：`API 配置区保持自然高度` ＋ **顶栏 3 条守卫**（`用量徽章与窗口控件同属 .cy-page-top-right 分组` / `不再使用两个独立的绝对定位容器` / `右上角分组用 flex 排布，且窗口控件尺寸固定不被压缩`）。
> **辅助函数 `read()` / `ruleBody()` 保留**（绿用例仍在用）。

**D · 收窄（蓝图外新增，子节 2 ①）—— `src/renderer/settings/default-dialogs-regression.test.ts`**
8 条路径清单**未删**，改为**存在性过滤**；用例 2 条全部保留且全绿。

**E · 保留不动（4 个「里子」模块）** —— 实测 `存在=True 改动=0`，提交树内均在
`memory/delete-all.ts` · `memory/erasure-flow.ts` · `memory/manager.ts` · `zones/panel.ts`

### 子节 6 · 经验追加

| 键号 | 级 | 落点 | 一句话 |
|---|---|---|---|
| **X12** | L | `经验库-具体坑.md` §1 git | `git commit -F <file>` 的提交信息文件**不能用 PS 5.1 的 `-Encoding UTF8` 写**（BOM 会永久污染首行）；用 .NET `UTF8Encoding($false)` + 回读首三字节校验 |
| **A46** | M | `经验库-通用.md` §6d → §4 架构 | **提交后合并态是单向门**：`git commit` 吃掉 `.git/MERGE_HEAD`，`reset` 回去变单亲提交；对策 = 提交前 `git write-tree` 留内容保险 |
| **A47** | H | `经验库-通用.md` §6d → §4 架构 | **"删 N 个测试"必须按用例粒度核对**：整文件死（`0 test`）才可整删；部分死只能收窄，否则**连绿色守卫一起删掉** |
| **C23** | M | `经验库-通用.md` §6d → §1 命令 | **大索引提交前先做 `--name-status` 前后差集**（852 行既存暂存内容里混进什么，肉眼看不出来） |
| **F18** | H | `经验库-通用.md` §6d → §5 流程 | 删文件前除 import 图外，**还要搜"路径字符串引用"**（`readFileSync` 清单/fixture 列表）；这类破损只有**全量测试**能发现 |
| **X13** | L | `经验库-具体坑.md` §4 TS/工具链 | `Tee-Object`/`Out-File` 的**目标路径在管道启动时求值** → 目录不存在则**测试一次都没跑**，却表现为"作业完成"；落盘前先建目录 + 用绝对路径 + 回读确认有内容 |

---

## 十三、回写清单（**规范 §5.1 的 T1–T4；未勾完不得提交**）

| 触发 | 回写目标 | 回写内容一句话 | 已勾选 |
|---|---|---|---|
| **T2** 基线数值改写 | [`BLUEPRINT-总蓝图.md`](BLUEPRINT-总蓝图.md) §四 P8 行 | 状态 → ✅ 已完成；记录**新提交短哈希 `51a20338`**（含 2 个父、tag、门禁数字）；P9 行同步标"前置已就绪" | [x] |
| **T2** 基线数值改写 | [`BLUEPRINT-总蓝图.md`](BLUEPRINT-总蓝图.md) §九 | 新增「当前基线（**P8 之后** / 已提交）」：提交哈希 / 2262 文件 / 测试 `2 failed` / tag `phase8-merged` / 11 项含 `groupContextLimit` 8；P7 段改为「历史基线（P7 之后，仅存档）」 | [x] |
| **T1** 判据被修正 | [`HUMAN-人工验证台账.md`](HUMAN-人工验证台账.md) §一 + §三 + §五 + §五之二 | **H-04 / H-14 / H-07 销账**（附证据 + P8 销账回执）；H-02/H-03/H-15 标「转 P9」；H-01/H-05 标「待人眼补验」；H-06 待书面点头 | [x] |
| **T3** 描述被推翻 | 本文件 §二 事实 4 | 记录「13 个失败测试并非同一性质：**12 整文件死 + 1 部分死（4 绿 2 红）**」→ 判据 **J-20**；并已在 §四 4.3.2 落地 | [x] |
| **T3** 描述被推翻 | 本文件 §二 事实 3 | 记录「4 个里子模块**不是纯逻辑**：DOM 耦合 + `delete-all.ts` 依赖已删的 `../i18n` + 不在 `tsconfig.renderer.json` 的 include 内」→ 已在台账 H-07 的 P8 执行实测中写明"**不能直接 import**" | [x] |
| **T2** 基线数值改写 | [`验证作业单.md`](验证作业单.md) | A-7 门禁期望值 → `2 failed / 559 passed (561)`（原文 15 failed 基线，**旧值保留**）；§「不算失败」条同步改写（②类已清零，③④ 升级为 P9 的用户可见缺陷） | [x] |
| **T4** 新增经验 | [`../methodology/BLUEPRINT-经验库-具体坑.md`](../methodology/BLUEPRINT-经验库-具体坑.md) §1 git | L 级 **X12**：`git commit -F` 的 **BOM 污染**首行（+ §4 新增 **X13**：vitest 日志落盘路径求值致"测试没跑却报完成"） | [x] |
| **T4** 新增经验 | [`../methodology/BLUEPRINT-经验库-通用.md`](../methodology/BLUEPRINT-经验库-通用.md) §6d | M 级 **A46**：**提交后合并态是单向门**（`MERGE_HEAD` 消失，恢复需 `update-ref` + 提交前 `write-tree` 留保险） | [x] |
| **T4** 新增经验 | [`../methodology/BLUEPRINT-经验库-通用.md`](../methodology/BLUEPRINT-经验库-通用.md) §6d | H 级 **A47**：**"删 N 个测试"必须按用例粒度核对**（整文件删会带走绿色守卫；处置分整删/收窄/保留三档） | [x] |
| **T4** 新增经验 | [`../methodology/BLUEPRINT-经验库-通用.md`](../methodology/BLUEPRINT-经验库-通用.md) §6d | M 级 **C23**：**大索引提交前先做 `--name-status` 前后差集**（852 文件看不出多暂存了什么） | [x] |
| **T4** 新增经验 | [`../methodology/BLUEPRINT-经验库-通用.md`](../methodology/BLUEPRINT-经验库-通用.md) §6d | H 级 **F18**（**蓝图外新发现**）：删文件前除 import 图外**还要搜"路径字符串引用"**（`readFileSync` 清单），这类破损只有**全量测试**能抓到 | [x] |
| **T1** 判据被修正 | [`BLUEPRINT-总蓝图.md`](BLUEPRINT-总蓝图.md) §二 判据台账 | **新增 J-20**（H-07 按用例粒度：12 删 + 1 收窄）与 **J-21**（N6 锁文件判据缺路：应比"索引 blob == `MERGE_HEAD` 版"而非"等于 HEAD"） | [x] |
| **T2** 基线数值改写 | 本文件 §十一 + §十二 | 目标达成核对 + 非目标逐条 + 施工记录 7 个子节全部回填（含 1 处蓝图外偏离、3 处发现） | [x] |
| **T3** 描述被推翻 | 本文件 §二 事实 5 | 「索引条目 ≈ 2299」**预估口径漏一层** → 实测 **2262** = `2025(HEAD) + 388(新增) − 151(移除)`；已在子节 2 ② 写明正确算式 | [x] |
| — | — | 本 Phase 无其他触发（已逐条再核对 T1–T4：另核实 **`git rm` 对空壳需 `-f`**、**tree 保险需二次刷新**两项，属施工记录非回写项） | [x] |

> **提交门禁**：本清单**无任何 `[ ]`** → 满足"未勾完不得提交"。
> ⚠️ **顺序说明（如实记录）**：本次提交**先于**文档回写发生（提交是全任务唯一动作，见 §零 0.2 的顺序敏感性）。
> 因此本清单的语义是"**提交后立即、且在本 Phase 收口前完成回写**"——回写已在**同一 Phase 内闭合**，
> 未留任何未勾项给 P9。**下不为例**的替代做法见子节 1 偏离 2（把"回写"并入提交范围会与 D6「任何文档不进合并提交」冲突 → **本 Phase 只能提交后回写**）。
