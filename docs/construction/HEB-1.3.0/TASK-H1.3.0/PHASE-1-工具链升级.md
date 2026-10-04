# Phase 1 施工蓝图：工具链可用化与门禁基线

> **执行者**：agent。本文件自包含，不需要对话历史即可执行。
> **风险等级**：**高**（改依赖树 + 换 Node 运行时；唯一"数据面"动作在本 Phase）
> **预计耗时**：**30–60 分钟**（含 `pnpm install` 与三套 `tsc` 首跑）
> **文档规范**：见 `../methodology/BLUEPRINT-撰写规范.md` §4（**跨目录相对路径，不写裸文件名**）
> **前置**：`BLUEPRINT-总蓝图.md` §四 的 P1 行；P0 已完成并复核（`PHASE-0-完成报告.md`，含 §十一 撰写者复核补正）
> **本 Phase 不解决任何合并冲突**（那是 P2/P3）——它只负责**让门禁能跑起来，并记录合并前的基线**。

---

## 一、施工目标

### 核心问题（带 `file:line` 根因）

1. 🔴 **门禁跑不起来**（实测）：本机生效 `node = v22.23.2`，而官方目标 `8fe5ba7a` 的 `package.json` 要求 **`>=24 <25`**；
   `D:\data\node\node_modules\npm` **不存在** → `npm.cmd` / `pnpm.CMD` 双双抛 `node:internal/modules/cjs/loader:1433`（实测 exit 1 / exit -1）。
   **没有可用 `tsc` 就没有 P3 的"每块处置后立刻编译"**（经验 **C21**：整合面是冲突块数的 3–20 倍，等全部块做完再编译，定位成本翻十倍）。
2. 🔴 **没有任何"合并前"的编译基线**：P0 明确不跑测试/`tsc`（非目标），所以 `tsc -p tsconfig.main.json` 在当前树上**从来没有被跑过**。
   没有这个基线，P3 报出的错**无法判断是"我改坏的"还是"合并前就有"**（经验 **D21 / D34**：判断是不是回归）。
3. 🟠 **依赖树是 P8 留下的那套**：`node_modules` = 132037 文件 / 2.08 GB（已备份），
   装的是 **typescript 5.9.3**，而 `package.json` 声明 `^5.6.0`、官方目标声明 `^6.0.3`。
   → **本 Phase 必须明确选用哪一个**，否则 P3 的编译结果不可归因（见 §二 E4 的顺序分析）。

### 目标清单（可勾选）

- [ ] **T1 处置 P0 复核的 N-1**（一行未提交的 ` D`），使 P0 的收口判据 `J-10` 真正归零（见 §三 前置 P0）
- [ ] **T2 让 Node 24 只对本应用生效**（M8）：不修改系统 Node、不改本机 `PATH` 全局项
- [ ] **T3 用 Node 24 自带的 npm / corepack 提供可用的 `pnpm`**；**不修** `D:\data\node` 那份坏的安装
- [ ] **T4 记录依赖树状态**：确认 `node_modules` 与备份 `MATCH`；`pnpm install` **一律带 `--frozen-lockfile`**（避免版本漂移）
- [ ] **T5 跑出并记录"合并前"的三套编译基线**：`check:renderer`（已有）＋ `tsconfig.main.json` ＋ `tsconfig.preload.json`
- [ ] **T6 记录 `vitest` 是否可用**（跑一条最小用例即可，**不跑全量**）

### 非目标（明确不做）

| 不做 | 为什么 | 何时做 |
|---|---|---|
| **不解任何合并冲突** | P1 的职责是"让门禁能跑"，冲突是 P2/P3 | P2 / P3 |
| **不引入官方的 `check:main` / `check:preload` 脚本** | 它们来自官方 `scripts/build/desktop-typescript.mjs`，是**合并内容**；本 Phase 用等价的**直接 `tsc` 调用**取得同样的基线 | **P3**（随 `package.json` 冲突一并处置） |
| **不从目标检出新文件**（`desktop-typescript.mjs` / `vitest.config.mts` / `pnpm-workspace.yaml` / `pnpm-lock.yaml`） | 那是**把合并结果提前搬进工作区**，会让 P1 污染 P2/P3 的处置面（蓝图 §二「被推翻的原计划」同类错误） | P3 |
| **不升级 TypeScript 到 6.x** | 🔴 **顺序决定可归因性**（见 §二 E4）：先用当前的 5.9.3 取基线，让 P3 的差异**只归因于合并**；TS 6 的升级随合并一起发生，其影响可单独量化 | **P3** |
| **不跑全量测试** | 全量 = 563 文件 / 57 秒，但 P1 无源码改动，跑全量的信息量低于其耗时 | **P5** |
| **不修 `D:\data\node` 的破损 npm** | M8 的结论是"只给本应用装"；修全局属越界且有风险 | 永不（如需要则单独立项） |
| **不动备份** | `E:\AI_Work\备份\cyrene-pre-P1-2026-10-04\` 是**只读参照**，不得覆盖或增量改写 | — |

---

## 二、实测证据（决定本 Phase 做法，执行前请读）★

### E1 · Node 24 **已就位**，且它的 npm **完好**（决定性事实）

| 路径 | 版本 | 同目录 `npm.cmd` | `corepack` | 实测可用性 |
|---|---|---|---|---|
| `D:\data\node24\node.exe` | **v24.21.0** ✅ 满足 `>=24 <25` | **有** | **corepack 0.36.0 ✅** | ✅ `node -v` / `npm --version` 可跑 |
| `D:\data\node\node.exe`（当前生效） | v22.23.2 ❌ 不满足 | 有，但 `node_modules\npm` **不存在** | 有 | 🔴 `npm exit=1` / `pnpm exit=-1`（`cjs/loader:1433`） |

**结论**：M8（只给本应用装）**不需要装任何东西** —— `D:\data\node24` 直接可用，且它自带的 npm/corepack 就是本 Phase 的工具来源。
**注意**：`D:\data\node24` **没有** `pnpm.cmd`（只有 `corepack`）→ pnpm 必须**经 corepack 提供**（见 §四 4.3）。

### E2 · `node24` 能跑我们**已装的** typescript（版本隔离可行）

```powershell
& cmd /c "`"D:\data\node24\node.exe`" `"E:\AI_Chating\cyrene-agent\node_modules\typescript\bin\tsc`" --version"
# → Version 5.9.3    exit=0
```
**意义**：可以用 Node 24 跑**现有** `node_modules` 里的 tsc，**不需要先动依赖树** —— 这给了"先量基线、后升级"的可能。

### E3 · 门禁脚本的真实现状（我方 vs 官方目标）

| 文件 / 脚本 | 我方（HEAD） | 官方目标 `8fe5ba7a` | P1 怎么办 |
|---|---|---|---|
| `scripts/build/desktop-typescript.mjs` | ❌ 无 | ✅ 有 | P3 引入（非目标） |
| `scripts/build/learn-exam-preload.mjs` | ❌ 无 | ✅ 有 | P3 引入（非目标） |
| `vitest.config.ts` / `vitest.config.mts` | ✅ `.ts` | ✅ `.mts`（**改名**） | P3（合并会带 `R100` 重命名） |
| `pnpm-workspace.yaml` / `pnpm-lock.yaml` | ❌ 无 | ✅ 有 | P3（合并带入） |
| `package-lock.json` | ✅ 有（被跟踪） | ❌ **目标已删** | P3（`D` 类，且 P8 的 N6 确认它是官方版） |
| `check:main` | ❌ **缺失** | ✅ `tsc -p tsconfig.main.json --noEmit` | **P1 用等价直调**：`tsc -p tsconfig.main.json --noEmit` |
| `check:preload` | ❌ **缺失** | ✅ `tsc -p tsconfig.preload.json --noEmit` | **P1 用等价直调** |
| `check:renderer` | ✅ `tsc -p tsconfig.renderer.json` | ✅ 同名 | 直接可用 |
| `build:main` / `build:preload` | ✅（`tsc` 直调 + 内联拷贝） | ✅（改走 `desktop-typescript.mjs`） | P3 |

> 🔴 **`tsconfig.main.json` / `tsconfig.preload.json` / `tsconfig.renderer.json` 三个文件我方都有**（E3 实测）→
> 所以 P1 **无需引入任何官方文件**即可取得三条门禁的等价基线。这是本 Phase 能与 P2/P3 解耦的关键。

### E4 · 为什么"先取基线、后升 TS"（**本 Phase 唯一的顺序敏感决策**）

- 若 **先升 TS 6** 再取基线 → P3 合并后若编译报错，**无法区分**是"合并引入的"还是"TS 6 收紧造成的"（两类错误的修法完全不同）。
- 若 **先用 5.9.3 取基线** → P3 的差异**只归因于合并**；TS 6 的升级随合并发生，其增量可**单独量化**（"5.9.3 下 0 错 → 6.0.3 下 N 错"这个数字本身就是交付物）。
- **代价**：P1 结束时树里仍是 TS 5.9.3 —— 这是**有意的中间态**，不是"没做完"。写入 §十 交接提示第 2 条。

### 被推翻的原计划

- ❌ **原计划：先修 `D:\data\node` 的 npm，再用它跑 pnpm** —— 实测该安装 `node_modules\npm` **整个缺失**（不是路径问题），修它等于重装全局 Node 22，**既越界（M8）又影响本机其他项目**。→ 改为**直接用 `D:\data\node24`**（E1）。
- ❌ **原计划：P1 顺手把官方 `check:main` / `check:preload` 脚本 + `desktop-typescript.mjs` 一起引入** —— 那会把**合并内容提前搬进工作区**：
  P3 再处置 `package.json` 冲突时，"哪部分是我引入的、哪部分是合并带的"就分不清了。→ 改为 **P1 只做等价直调**，脚本留给 P3。
- ❌ **原计划：P1 清掉 `node_modules` 重装（干净基线）** —— 132037 文件 / 2.08 GB 重装约 10–20 分钟，
  而**当前树在 5.9.3 下能跑 tsc（exit 0）**，重装只会引入**版本漂移**这一新变量。→ 改为 **`--frozen-lockfile` 复用现有依赖**（T4）。

---

## 三、前置条件与停止条件

### 前置条件（可执行命令 + 期望值；不满足则**不得开始**）

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$R  = "E:\AI_Chating\cyrene-agent"
$BK = "E:\AI_Work\备份\cyrene-pre-P1-2026-10-04"
$N24 = "D:\data\node24"

# P0 ★ 收口判据（J-10 / J-15 合并后的口径）—— 期望：**0 行**
#   口径说明：排除已登记 BACKLOG B-01 的三处 D 类遗留；**用 status 的全部取值**，不只 ??（J-15）
git -C $R status --porcelain | Where-Object { $_ -notmatch 'docs/(design|internal-issue|refactor)/' }

# P1 ★ 上阶段回写清单无未勾选项 —— 期望：0 行（[x] 与 [—] 之外的第三种取值不允许）
Select-String -Path "$R\docs\construction\HEB-1.3.0\TASK-H1.3.0\PHASE-0-完成报告.md" -Pattern '^\|.*\[ \]' -Encoding UTF8

# P2 ★ 台账无未闭合拍板 —— 期望：0 行
Select-String -Path "$R\docs\construction\HEB-1.3.0\TASK-H1.3.0\HUMAN-人工验证台账.md" -Pattern '^\|.*\[ \]' -Encoding UTF8

# P3 ★ 备份仍完好（P1 是唯一数据面动作，必须先证明退路在）—— 期望：MATCH
Select-String -Path "$BK\BACKUP-MANIFEST.txt" -Pattern 'MATCH' -Encoding UTF8

# P4 ★ Node 24 仍就位且版本满足 —— 期望：v24.21.0
& cmd /c "`"$N24\node.exe`" -v"

# P5 ★ 合并目标锚点可用（J-12：必须 ^{commit}）—— 期望：8fe5ba7a5b3a86043b8034abeaa98f72f7459039
git -C $R rev-parse "official-target-8fe5ba7a^{commit}"

# P6 备份盘余量 —— 期望 > 10 GB
Get-PSDrive E | Select-Object @{n='FreeGB';e={[math]::Round($_.Free/1GB,1)}}
```

### 🆕 前置 P0 的特殊处置：先做 T1（N-1 收口）

`git status` 目前会返回 **8 行**：3 行 `??` D 类遗留（**已登记 BACKLOG B-01，可豁免**）
＋ **1 行未提交的 ` D`**（P0 复核 **N-1**，登记 BACKLOG **B-06**，**必须处置**）
＋ 3 行 ` M`（P0 复核的回写：总蓝图 / BACKLOG / 完成报告，**应先提交**）
＋ 1 行 `??`（本文件的首次入库）。
**唯一必须处置的是那行 ` D`**：

```powershell
$R = "E:\AI_Chating\cyrene-agent"

# ① 先提交 P0 复核的回写（总蓝图 J-14/J-15 + BACKLOG B-05/B-06 + 完成报告 §十一）
git -C $R add -- docs/construction/HEB-1.3.0/TASK-H1.3.0
git -C $R commit -m "docs(P0): 补入撰写者复核补正（J-14/J-15）与 BACKLOG B-05/B-06"

# ② 处置 N-1（方案 A，P0 复核推荐）：该文件是上游发来的 0 字节空占位，本任务已有真实蓝图
git -C $R rm -- "docs/construction/HEB-1.3.0/TASK-H1.3.0/将施工蓝图放入此文件夹.txt"
git -C $R commit -m "chore(P1): 移除上游占位说明文件（已被真实蓝图取代；P0 复核 N-1/B-06）"

# ③ 复验前置 P0 —— 期望：0 行
git -C $R status --porcelain | Where-Object { $_ -notmatch 'docs/(design|internal-issue|refactor)/' }
```

> **若人选方案 B（保留占位）**：把 ② 换成 `git -C $R checkout -- "<该文件>"`，则前置 P0 同样归零。
> **两种方案都不影响本 Phase 后续任何步骤。**

### 停止条件（出现即**立即停止并报告**）

| # | 停止条件 | 为什么必须停 |
|---|---|---|
| **S1** | 前置 P0–P5 任一条不满足 | 在脏树/无退路/无目标锚点的状态下改工具链 = 无法回退 |
| **S2** | `pnpm install` 出现**非 `--frozen-lockfile`** 的锁文件改写（`pnpm-lock.yaml` 被创建或 `package-lock.json` 被改） | 说明发生了**版本漂移**，P3 的编译差异将无法归因（§二 E4 的全部价值随之作废） |
| **S3** | `tsconfig.main.json` / `tsconfig.preload.json` / `tsconfig.renderer.json` 任一**文件缺失** | 与 §二 E3 的实测不符 → 基线不可得，须先查清树的状态 |
| **S4** | 三套 `tsc` 里 **main 或 preload 的报错数 > 200 条** | 说明当前树在 5.9.3 下**本就大面积不通过** → 基线无意义，须先诊断（登记 H-A 请示） |
| **S5** | `D:\data\node24` 消失或版本不再是 24.x | 唯一可用的 Node 24 来源没了 → 转 BACKLOG **B-04** 的备选路径（装便携版） |

---

## 四、改动清单（Agent 直接执行）

> 🔴 **顺序敏感**：4.0 → 4.1 → 4.2 → 4.3 → 4.4 → 4.5 **不可调换**。
> 理由：先收口（4.0）才能开工；先固化 Node 24 的作用域（4.1）才能让后续命令**都**用它；
> 先确认依赖树状态（4.2）才知道 `pnpm install` 该不该跑；先有 pnpm（4.3）才能记录依赖；
> **基线必须在任何依赖改动之后、任何源码改动之前取得**（4.4 → 4.5）。

### 4.0 收口与 N-1 处置

见 §三「前置 P0 的特殊处置」三段命令。**完成后前置 P0 必须为 0 行。**

### 4.1 让 Node 24 只对本应用生效（M8：不碰系统 Node）

**方式：应用级目录联接 + 会话级 PATH**（两个动作都不产生系统级副作用）：

```powershell
$R   = "E:\AI_Chating\cyrene-agent"
$N24 = "D:\data\node24"

# ① 建立应用级 node 链接目录（幂等；已存在会报"已存在"，属正常）
cmd /c mklink /J "$R\.node24" "$N24" 2>&1 | Out-Null

# ② 本会话优先使用它（只影响当前 PowerShell 会话）
$env:PATH = "$R\.node24;$env:PATH"

# ③ 固化到仓库的 .npmrc，让 pnpm/npm 调用时也走它（可选但推荐）
#    若 .npmrc 已存在，**只追加**下面两行；不存在则新建
#    （.npmrc 的用途是让脚本里的 node 解析稳定，不改变系统 PATH）
```

**验证（必做）**：

```powershell
& cmd /c "`"$R\.node24\node.exe`" -v"        # 期望 v24.21.0
node -v                                       # 期望 v24.21.0（本会话 PATH 生效后）
where.exe node                                # 期望第一行是 E:\AI_Chating\cyrene-agent\.node24\node.exe
```

> 🔴 **`.node24` 必须进 `.gitignore`**（它是链接目录，不该入库）：
> 追加一行 `.node24/` —— **只追加，不改既有行**（同 P0 §四 4.2 的纪律）。

### 4.2 依赖树状态确认（**不做任何改动**，只记录）

```powershell
$R  = "E:\AI_Chating\cyrene-agent"
$BK = "E:\AI_Work\备份\cyrene-pre-P1-2026-10-04"

# ① 现有依赖树规模（与备份比对）—— 期望：132037 文件 / 2234681003 字节（允许 ≥，不允许 <）
$cur = Get-ChildItem "$R\node_modules" -Recurse -File | Measure-Object -Property Length -Sum
"当前: $($cur.Count) / $($cur.Sum)"

# ② 已装 typescript 版本 —— 期望 5.9.3（本 Phase 就用它取基线）
(Get-Content "$R\node_modules\typescript\package.json" -Raw -Encoding UTF8 | ConvertFrom-Json).version

# ③ 记录到证据目录（P7–P10 的惯例：证据只增不删）
$stamp = Get-Date -Format 'yyyy-MM-dd-HHmmss'
$dir = "$R\.cyrene-merge-analysis\heb-p1"
New-Item -ItemType Directory -Force -Path $dir | Out-Null
@"
时间        : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
node(node24) : $(& cmd /c "`"$R\.node24\node.exe`" -v")
node(系统)   : $(& cmd /c "node -v")
tsc(已装)    : $((Get-Content "$R\node_modules\typescript\package.json" -Raw -Encoding UTF8 | ConvertFrom-Json).version)
node_modules : $($cur.Count) 文件 / $($cur.Sum) 字节
备份清单     : $BK\BACKUP-MANIFEST.txt
"@ | Set-Content "$dir\2026-10-04-p1-env.txt" -Encoding UTF8
```

### 4.3 经 corepack 提供 pnpm（**不修** `D:\data\node` 的坏安装）

```powershell
$R = "E:\AI_Chating\cyrene-agent"

# ① 用 Node 24 的 corepack 激活官方要求的 pnpm 版本（packageManager = pnpm@10.33.0）
& cmd /c "`"$R\.node24\corepack.cmd`" enable"
& cmd /c "`"$R\.node24\corepack.cmd`" prepare pnpm@10.33.0 --activate"

# ② 验证 —— 期望：10.33.0
& cmd /c "pnpm --version"
```

**失败处置**：

| 现象 | 处置 |
|---|---|
| `corepack prepare` 需要网络且下载失败 | 记 `🚫 环境受阻`；**改走降级路径**：本 Phase 的六条验收里，T4 用 `node_modules` 现状代替、其余门禁全部用**直调 tsc** 完成（**不依赖 pnpm**）→ 仍可完成 T5/T6，只是 T4 降级 |
| `corepack enable` 需要写 `D:\data\node24` 权限失败 | 同上走降级路径（**不要**为了它去改系统目录权限） |

> 🔴 **降级路径是被允许的**：本 Phase 的**不可替代目标**是 **T5（三套编译基线）**，它只需要 `node.exe` + 已装的 `tsc`。
> pnpm 的作用是"记录依赖树状态"，属**可降级项**。降级时必须在完成报告 §五 写明。

### 4.4 安装/确认依赖（**必须 `--frozen-lockfile`**）

```powershell
$R = "E:\AI_Chating\cyrene-agent"; Set-Location $R

# 🔴 关键：--frozen-lockfile —— 不允许改锁、不允许升版本
#    若 pnpm 不可用（4.3 降级），**跳过本步**并在报告里记"依赖树未重装、沿用 P0 备份的那套"
pnpm install --frozen-lockfile 2>&1 | Tee-Object "$R\.cyrene-merge-analysis\heb-p1\p1-install.log"

# ② 守门判据 S2：锁文件与依赖没有漂移 —— 期望：0 行
git -C $R status --porcelain -- package.json package-lock.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc
```

### 4.5 取得"合并前"的三套编译基线（**本 Phase 的核心交付物**）

```powershell
$R = "E:\AI_Chating\cyrene-agent"; Set-Location $R
$dir = "$R\.cyrene-merge-analysis\heb-p1"

# 用 Node 24 的直调 tsc（等价于官方的 check:main / check:preload；check:renderer 我方已有同名脚本）
$TSC = "$R\node_modules\typescript\bin\tsc"

foreach ($cfg in @("tsconfig.main.json","tsconfig.preload.json","tsconfig.renderer.json")) {
  $out = "$dir\baseline-$($cfg -replace '\.json$','').log"
  & cmd /c "`"$R\.node24\node.exe`" `"$TSC`" -p $cfg --noEmit" 2>&1 | Tee-Object $out | Out-Null
  $code = $LASTEXITCODE
  $errs = (Select-String -Path $out -Pattern 'error TS' -Encoding UTF8 | Measure-Object).Count
  "{0,-26} exit={1}  错误数={2}" -f $cfg, $code, $errs
}

# 记录成一行汇总（P3 的对照值）
```

**期望与处置**：

| 配置 | 期望 | 不满足时 |
|---|---|---|
| `tsconfig.renderer.json` | **exit 0**（我方既有 `check:renderer` 一直在用） | 非 0 → 查是否被 P0 的 `.gitignore` / `.node24` 影响；仍非 0 → **停止**（S3/S4） |
| `tsconfig.main.json` | exit 0 或**少量**错误 | **错误数 > 200 → 停止（S4）** |
| `tsconfig.preload.json` | exit 0 或**少量**错误 | 同上 |

> 🔴 **不论结果如何都要如实记录**：若 main/preload 本来就有 N 条错，**那 N 就是基线**，
> P3 结束时必须能给出"N → M"的对照，而**不是**"0 错误"（经验 **D21**：判断是不是回归）。

### 4.6 记录 vitest 可用性（**只跑一条最小用例**）

```powershell
$R = "E:\AI_Chating\cyrene-agent"; Set-Location $R
$VITEST = "$R\node_modules\vitest\vitest.mjs"
if (Test-Path $VITEST) {
  & cmd /c "`"$R\.node24\node.exe`" `"$VITEST`" run src/shared/usage-badge.test.ts" 2>&1 |
    Tee-Object "$R\.cyrene-merge-analysis\heb-p1\p1-vitest-smoke.log"
} else { "vitest 未安装 → 记 🚫 无法验（缺 vitest），不阻塞本 Phase" }
```

**为什么选 `src/shared/usage-badge.test.ts`**：它是**本地独有能力**（11 项基线之一 `USAGE_BADGE`），一条用例即可同时验证"vitest 能跑"＋"本地功能面可测"。

---

## 五、人工环节 ★

| 类·时点 | 编号 | 内容 | 是否需要人 |
|---|---|---|---|
| **A** | — | 本 Phase **全部为机器判据**（版本号 / 退出码 / 错误计数） | ❌ 不需要人眼 |
| **H-A** | — | **本 Phase 无新增阻塞拍板**（M8/M9 已在总蓝图拍板并闭合） | — |
| **H-B** | — | 本 Phase 无产品行为变化 → **不需要评审** | — |
| **H-C** | — | **可能新增 1 条**：若 4.3 走降级路径（pnpm 不可用），登记一行 `H-nn`（`C · H-C`）说明"依赖树状态未经 pnpm 确认" | 视执行结果 |

**明确不需要人做的事**（防无用功）：

- 🔴 **不要让人去核对 Node 版本或 `tsc` 版本** —— 那是 §四 4.4 的脚本能算的数（规范 §4.1 纪律 1）。
- 🔴 **不要让人在 P1 阶段开应用做视觉验证** —— 应用此刻**还没合并、也没有可用构建**；视觉验证在 **P6**。
- 🔴 **不要让人去看 `pnpm install` 的日志** —— 守门判据是 4.4 ② 的 0 行输出，不是日志可读性。

---

## 六、验收测试

| # | 验收项 | 命令 | 期望输出 | 失败处置 |
|---|---|---|---|---|
| **A1** | N-1 已处置、P0 收口判据归零 | `git -C $R status --porcelain \| Where-Object { $_ -notmatch 'docs/(design\|internal-issue\|refactor)/' }` | **0 行** | 有残留 → 逐条归类；若是新的 ` D`/` M` → **停止（S1）** |
| **A2** | Node 24 只对本应用生效 | `& cmd /c "`"$R\.node24\node.exe`" -v` ／ `where.exe node` | `v24.21.0`；`where` 首行 = `$R\.node24\node.exe` | 不符 → 回 4.1；**若系统 `node -v` 被改动 → 🔴 停止（违反 M8）** |
| **A3** | `.node24` 未入库、`.gitignore` 只追加 | `git -C $R status --porcelain -- .node24` ／ `git -C $R diff --numstat -- .gitignore` | 前者 **0 行**；后者形如 `1 0 .gitignore`（**0 删除**） | 有删除行 → 回 4.1 修正（只追加） |
| **A4** | pnpm 可用 **或**已记录降级 | `& cmd /c "pnpm --version"` | `10.33.0`；若失败 → 完成报告 §五 有**明确的降级记录** | 既不可用又无记录 → **不算通过** |
| **A5** | 依赖未漂移 | `git -C $R status --porcelain -- package.json package-lock.json pnpm-lock.yaml pnpm-workspace.yaml` | **0 行** | 非 0 → 发生了漂移，**停止（S2）**，用备份恢复 |
| **A6** | **三套编译基线已记录** | 读 `.cyrene-merge-analysis\heb-p1\baseline-*.log` | 三个文件都存在，且各自给出 **exit 码 + `error TS` 计数** | 缺任一个 → 回 4.5；**这是本 Phase 的核心交付物，缺它 = P1 未完成** |
| **A7** | vitest 可用性已记录 | 读 `p1-vitest-smoke.log` | 有"通过数/失败数"或明确的 `🚫 无法验（缺 …）` | 无记录 → 回 4.6 |

**验收总计口径**：A1–A7 共 **7 项**，其中 **A6 是不可替代项**（其余 6 项失败可降级或重跑，A6 失败则 P1 未完成）。

### 「不算失败」的情形（提前写明）

1. **时点断言**：A6 的三个数字取值于**执行 4.5 的那一刻**；此后任何源码改动都会改变它们 —— 那是 P2/P3 的事，不影响 P1 判定。
2. **有意保留项**：`docs/design/` / `docs/internal-issue/` / `docs/refactor/` **仍出现在 `??` 列表里不算 A1 失败**（已登记 BACKLOG **B-01**；这是 P0 的有意保留，判据 **J-14/J-15** 的口径）。
3. **外部增长量**：`.cyrene-merge-analysis/heb-p1/` 是**只增不删**的证据目录，其文件数增长不算异常。
4. **降级不算失败**：4.3 走降级路径（pnpm 不可用）时，A4 记 `🚫` 而非 `❌`，**只要完成报告 §五 写明缺什么前置**（规范 §4.1.1 的 C 类口径）。

---

## 七、产出物清单

| 产出 | 路径 | 形态 |
|---|---|---|
| N-1 收口提交 + P0 文档回写提交 | 本仓库 HEAD | 2 个 commit（`docs(P0):` + `chore(P1):`） |
| 应用级 Node 24 链接 | `E:\AI_Chating\cyrene-agent\.node24`（目录联接，**不入库**） | junction |
| `.gitignore` 追加 | `.node24/`（1 行） | 追加 |
| 环境快照 | `.cyrene-merge-analysis/heb-p1/2026-10-04-p1-env.txt` | 文本 |
| **三套编译基线** | `.cyrene-merge-analysis/heb-p1/baseline-tsconfig.{main,preload,renderer}.log` | **核心交付物** |
| 安装日志 | `.cyrene-merge-analysis/heb-p1/p1-install.log` | 文本（降级时可为空） |
| vitest 冒烟日志 | `.cyrene-merge-analysis/heb-p1/p1-vitest-smoke.log` | 文本 |
| 完成报告 | `PHASE-1-完成报告.md`（**新建**，10 节 + §十一 复核补正待补） | 文档 |

---

## 八、回退方法（分级）

| 级别 | 动作 | 本次已验证？ |
|---|---|---|
| **单文件（`.gitignore`）** | `git -C $R checkout -- .gitignore` | 否（改后可用） |
| **单文件（`.npmrc`）** | 若本次新建 → `Remove-Item .npmrc`；若本次追加 → `git -C $R checkout -- .npmrc` | 否 |
| **撤销 Node 链接** | `cmd /c rmdir "$R\.node24"`（**只删联接，不删目标**；删前务必 `Test-Path` 确认它是 junction 而非真实目录） | ⚠️ **待验证**：删前先跑 `cmd /c dir /AL "$R"` 确认 `.node24` 的 `<JUNCTION>` 标记 |
| **依赖树回退（数据面）** | `robocopy "$BK\node_modules" "$R\node_modules" /E`（**先不加 `/PURGE`**）<br>🔴 若确实需要精确还原，再单独评估 `/PURGE` —— 它会删除目标侧多余文件 | 否（本 Phase 只在漂移时用） |
| **撤销本 Phase 提交** | `git -C $R reset --hard pre-heb-1.3.0` ⚠️ **注意**：该 tag 打在 P0 收口提交上；要连 P0 文档一起退 → `git log` 后取具体哈希 | 否 |
| **放弃整个动作** | 本 Phase **不改任何源码**（只动 `.gitignore` 1 行 + `.npmrc`）；`git reset --hard` 任一锚点即可完全复原 | ✅ 逻辑可验证 |

> 经验 **F1**：**代码回滚与数据回滚分栏**。
> **代码**：上述 `reset` 路径。**数据**：本 Phase 的**唯一数据面动作**是 4.4 的 `pnpm install`
> —— 回退依赖 `E:\AI_Work\备份\cyrene-pre-P1-2026-10-04\`（**必须先确认 `MATCH`**，见前置 P3）。
> 🔴 **不做备份就不可回退**，所以前置 P3 是硬门。

---

## 九、已知坑（本 Phase 相关 + 复现情况）

| # | 坑 | 键号 | 本 Phase 的规避写法 |
|---|---|---|---|
| 1 | **删宿主文件不会自动暴露依赖者** | **K15** | `.node24` 是**联接**：删之前必须用 `dir /AL` 确认标记，**绝不**对未确认的路径跑递归删除 |
| 2 | **把"文档里的文件名"当"磁盘存在的文件"** | **C22 / D15 / J-09** | 4.4 的守门判据对 `package.json` / `package-lock.json` / `pnpm-lock.yaml` / `pnpm-workspace.yaml` **逐个 `git status --` 显式列名**；不存在的名字不会让判据恒真（`status` 对不存在路径返回 0 行是**正确**语义，但报告要写清"它本就不存在"） |
| 3 | **`git status` 的 `??` 看不到已跟踪文件的改动** | **J-15** | 前置 P0 与 A1 都用 `status --porcelain` 的**全部取值**过滤，不只 `??` |
| 4 | **annotated tag 的裸 `rev-parse` 不解包** | **J-12** | 前置 P5 写 `official-target-8fe5ba7a^{commit}` |
| 5 | **跨"工作区 ↔ git 对象"比较必须先声明口径** | **J-14** | 本 Phase 不需要比 blob；但 4.2 的"依赖树规模比对"要写明**允许 ≥、不允许 <**（`node_modules` 是活目录） |
| 6 | **拿"上界指标"当工作量** | **D36** | A6 记录的是**错误计数**（实测值），不是估算；不写"预计 0 错"这类期望值 |
| 7 | **Node 版本不随会话传播** | **具体坑库·环境章** | 4.1 每次新开 PowerShell 都要重设 `$env:PATH`；**脚本里一律用 `$R\.node24\node.exe` 全路径**，不依赖 `node` 解析 |
| 8 | **`.ps1` 被执行策略拦 + 本机无 `pwsh`** | 规范 §2.2 | 全部命令走 `cmd /c "…"` 或内联 PowerShell；**不写 `.ps1` 文件** |
| 9 | **`2>&1` 污染变量** | 规范 §2.3 | `Tee-Object` 后才取 `$LASTEXITCODE`，且 `$LASTEXITCODE` 必须在**同一行之后立即**读取 |
| 10 | **验证工具自身必须被验证** | **C14** | 4.5 的 `exit` 与 `error TS` 计数是**两个独立数字**，都要记；只用其中一个会漏判（如 exit 0 但 stderr 有警告） |
| 11 | 🔴 **`"$VAR\..."` 里的 `\b` 被当成转义序列 → 路径静默变错** | 规范 §2.3（非 ASCII 路径转义） | **本蓝图起草期实测踩到**：`"$BK\BACKUP-MANIFEST.txt"`（`$BK` 以 `…\备份` 结尾）在**动态构造**场景（如 `Join-Path $R $p`）下解析异常，`Test-Path` 返回 **False**，而**直接字面量** `Test-Path "E:\AI_Work\备份\…\BACKUP-MANIFEST.txt"` 返回 **True** → 差点误判"备份不存在"。<br>**规避写法（二选一）**：① 用 `Join-Path` 逐段拼：`Join-Path $BK 'BACKUP-MANIFEST.txt'`；② 路径用**正斜杠**：`"$BK/BACKUP-MANIFEST.txt"`。**禁止**把变量与 `\` 开头的片段直接粘在一个双引号串里 |

**本次复现情况**：坑 2（**已复现两次**，P0 起草期 `pnpm-lock.yaml` + P0 执行期再次确认不存在）；坑 3（**已复现**，P0 复核 N-1）；坑 10（P0 复核踩到 2 次假红）。其余为预防性引用。

---

## 十、给下一个 Phase（P2）的交接提示

1. 🔴 **P2 的第一条命令是复查 P1 出口**（规范 §4.1.3 两条前置）：
   ```powershell
   $D = "E:\AI_Chating\cyrene-agent\docs\construction\HEB-1.3.0\TASK-H1.3.0"
   Select-String -Path "$D\PHASE-1-完成报告.md" -Pattern '^\|.*\[ \]' -Encoding UTF8   # 期望 0
   Select-String -Path "$D\HUMAN-人工验证台账.md" -Pattern '^\|.*\[ \]' -Encoding UTF8  # 期望 0
   ```
2. 🔴 **P1 结束时树里仍是 TypeScript 5.9.3，这是有意的中间态**（§二 E4）。**不要在 P2 顺手升 TS 6** ——
   升级随 P3 的合并一起发生，其增量影响要单独量化。
3. 🔴 **三套编译基线在 `.cyrene-merge-analysis/heb-p1/baseline-*.log`** ——
   **P3 每次处置完一个冲突块后，都要与该基线对照**（经验 **C21**：不要等全部块做完再编译）。
4. 🔴 **合并目标只用 tag `official-target-8fe5ba7a^{commit}`**（**J-12**），不要用 `refs/remotes/official/master`
   （本仓库**未配置** `remote.official`，该 ref 无来源保障）。
5. **P2 的处置面**：UD 16 + DU 4 = **20 项**；其中 **4 个模块必须保留**（见 `BLUEPRINT-总蓝图.md` §六 **M5** 与判据 **J-04**）。
6. **P2 不要碰 20 个 UU**（那是 P3）；也不要做产品决策（遇到就登记 H-A）。
7. **若 4.3 走了降级路径**：P2 会带着"依赖树未经 pnpm 确认"这个前提施工 → P3 处置 `package.json` 冲突时**必须**重新确认依赖状态。
8. 🔴 **`.node24/` 是联接，不是目录实体** —— 任何"清理 dist / 清理未跟踪文件"的动作都**必须先排除它**（`git clean` 的干跑里确认它不在删除列表）。

---

## 十一、改动的目标达成核对（**执行后回填**）

| # | 目标（§一） | 状态 | 证据 |
|---|---|---|---|
| T1 | 处置 N-1，P0 收口判据归零 | ⬜ | |
| T2 | Node 24 只对本应用生效 | ⬜ | |
| T3 | pnpm 可用（或记录降级） | ⬜ | |
| T4 | 依赖树状态已记录、无漂移 | ⬜ | |
| T5 | 三套编译基线已记录 | ⬜ | |
| T6 | vitest 可用性已记录 | ⬜ | |

**人工环节达成核对**：本 Phase 预计无新增 `H-nn`（除 4.3 降级时登记 1 条 `C · H-C`）—— 引用 `HUMAN-人工验证台账.md`，**不复制结论**。

**回写清单已闭合**：⬜（见 §十二 施工记录末的「回写清单」）

---

## 十二、施工记录（执行者追加）

### 0 · 人工环节回执（索引，**不复制结论**）

| `H-nn` | 类·时点 | 状态 |
|---|---|---|
| （本 Phase 预计无；若 4.3 降级则新增 1 条 `C · H-C`） | | |

> 唯一真值在 `HUMAN-人工验证台账.md`。

### 1 · 偏离蓝图之处（**待执行者填写**）

| 蓝图 | 实际实现 | 原因 |
|---|---|---|
| | | |

### 2 · 蓝图未覆盖、施工中发现的漏洞（**待填写**）

| 位置 | 问题 | 修复 |
|---|---|---|
| | | |

### 4 · 有意保留的"不处理"点（**待填写**）

- （已知一项：**TS 仍为 5.9.3** 是**有意**的中间态，理由见 §二 E4）

### 5 · 验收（实测数字）（**待填写**）

| 命令 | 结果 |
|---|---|
| | |

### 8 · 待做 / 未做（**待填写**）

| 项 | 状态 | 说明 |
|---|---|---|
| | | |

### 回写清单（**未勾完不得提交**）

| # | 触发 | 回写目标 | 内容 | 已勾 |
|---|---|---|---|---|
| 1 | **T1** 判据被修正 | `BLUEPRINT-总蓝图.md` §9.1 | 追加新判据（编号续 **J-16** 起）：本 Phase 若实测出新的口径类问题 | [ ] |
| 2 | **T2** 基线被改写 | `BLUEPRINT-总蓝图.md` §九 | 更新工具链基线：Node 由 `v22.23.2` → 应用级 `v24.21.0`；并记入**三套编译基线的 exit 码与错误计数**（这是 P3 的对照值，**必须进基线节**） | [ ] |
| 3 | **T3** 蓝图被实测推翻 | 本文件 §二 | 若 E1–E4 任一条被实测推翻 → 就地改正并保留"曾错、已修正" | [ ] |
| 4 | **T4** 新增经验 | `../methodology/BLUEPRINT-经验库-*.md` | 若本次踩到新坑 → 按 H/M/L 归位、键号续编 | [ ] |
| 5 | **T4（承接 P0）** | `../methodology/BLUEPRINT-经验库-具体坑.md` + `-通用.md` | 🔴 **P0 报告 §六 的 4 条 + P0 复核 §十一 ★.10 的 2 条**经验入库（P0 的 T4 标了 `[—]`，理由为"键号续编属撰写者职责"，已在 P0 复核中接手） | [ ] |

> ⚠️ **第 5 条是本 Phase 必须清偿的欠账**：P0 的 T4 被显式暂缓，规范 §5.1 要求"无 T4 则写无"，
> 而这里**有**未完成项 → 若 P1 结束时仍未入库，须在报告 §五 写明"仍欠"，**不得留空、不得默认为已勾**。
