# Phase 3 施工蓝图：执行合并（分水岭）

> **执行者**：agent。本文件自包含，不需要对话历史即可执行。
> **风险等级**：**中**（本任务第一个真正改写工作区的 Phase）
> **预计耗时**：5–15 分钟（含沙箱演练）
> **文档规范**：见 [BLUEPRINT-总蓝图.md](BLUEPRINT-总蓝图.md) 第七节
>
> ## 🔴 执行前必读：两条已被实测推翻的旧认知
>
> | 旧认知（见 `BLUEPRINT-总蓝图.md`） | **实测真相** |
> |---|---|
> | 「类别 C（本地删/官方改）= **0**」 | ❌ **错。实测 = 5**（详见 [PHASE-2-完成报告.md](PHASE-2-完成报告.md) 偏差 2） |
> | 「用 `merge-tree … HEAD` 预估冲突」 | ❌ **会测出 0**（退化合并）。**必须先物化工作区**（偏差 1） |
>
> 总蓝图尚未修正这两处。**以本文件与 P2 报告为准。**

---

## 一、施工目标

### 核心问题

P0–P2 已把地基铺好：有回退网、有正确的 Node 环境、行尾配置已对齐。
**P3 是"分水岭"动作** —— 执行 `git merge`，一次性把官方 219 个提交引入工作区，
把剩余工作量**收敛成一份明确的冲突清单**。

### 目标

- [ ] 本地未提交工作被**固化为一个 commit**（不再依赖工作区）
- [ ] 合并已执行且**暂停在冲突状态**（不自动提交）
- [ ] 冲突构成**精确等于 26 / 15 / 5**（UU / UD / DU）
- [ ] 135+ 个未跟踪新文件**完好无损**
- [ ] 产出 P4/P5/P6 可直接消费的冲突清单

### 非目标（明确不做）

| 不做 | 为什么 | 何时做 |
|---|---|---|
| ❌ 解决任何冲突 | P4–P6 的职责 | P4–P6 |
| ❌ 提交合并结果 | 冲突未解决前提交 = 把破损状态固化 | P7 之后 |
| ❌ 加 `-X renormalize` | 配置已生效（P2）。重复加会掩盖"配置没生效"类问题 | 永不（配置已替代） |
| ❌ 改 `package.json` / 锁文件 | 依赖交换是 P8 的事 | P8 |
| ❌ `npm ci` | 依赖树要在最终代码就位后才装 | P8 |
| ❌ 逐个手工解决 46 个冲突 | 本 Phase 只负责"拿到冲突"，不负责"解决冲突" | P4–P6 |
| ❌ 删除任何未跟踪文件 | 它们是你 12 天工作的主体 | 永不 |

---

## 二、前置条件与停止条件

### 前置条件（不满足则**不得开始**）

```powershell
cd E:\AI_Chating\cyrene-agent
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# 前置 1：回退网必须在
git tag --list 'phase0*'
#   期望：phase0-full  与  phase0-tracked
git rev-parse --short phase0-full^{tree}
#   期望：00ae967e

# 前置 2：行尾配置必须生效
git config --local merge.renormalize
#   期望：true

# 前置 3：官方 ref 必须就位
git rev-parse --short refs/remotes/official/master
#   期望：b11b8851

# 前置 4：工作区基线（P2 交接值）
git ls-files -s | Measure-Object | Select-Object -ExpandProperty Count      # 期望 1894
git diff --name-only | Measure-Object | Select-Object -ExpandProperty Count # 期望 144
git ls-files --others --exclude-standard | Measure-Object | Select-Object -ExpandProperty Count  # 期望 ≥141
git status --porcelain | Measure-Object | Select-Object -ExpandProperty Count  # 期望 229（⚠️ 见坑 2）

# 前置 5：确认 HEAD 不是官方祖先（否则 --no-ff 可能行为不同）
git merge-base --is-ancestor HEAD refs/remotes/official/master
#   期望：退出码非 0（= 不是祖先）
```

### 停止条件（出现则**立即 `git merge --abort` 并报告**）

| 情况 | 为什么必须停 |
|---|---|
| 锚点 `phase0-full` 不存在 | 没有回退网，不可继续 |
| `merge.renormalize` 读出空 | 会得到 50 个冲突（多 4 个行尾假冲突），判定基准失真 |
| 冲突数 **既不是 46 也不是 50** | 仓库状态已被意外改动，先查清 |
| 冲突构成为 26/15/5 之外的其他组合 | 说明基线漂移，需重新核对权威清单 |
| 未跟踪文件数**低于 141** | 可能已丢文件，先查清再继续 |
| 合并过程中出现 `error:` 级别的失败 | 不要强行 `--continue` |

---

## 三、改动清单（Agent 直接执行）

### 3.0 改动范围声明

| 项目 | 是否改动 |
|---|---|
| 你自己的代码内容 | ⚠️ **被"固化为提交"**（内容零变化，只是从工作区搬进版本库） |
| 工作区文件（被合并覆盖的） | ✅ **会变**（这是合并的本意）—— 未冲突的 862 个文件变成官方版 |
| 135+ 未跟踪新文件 | ❌ **不动**（官方无同名文件，git 不会碰它们） |
| git 索引 | ✅ 重建（合并结果） |
| git 提交 | ✅ **2 个**：① 本地工作快照 ② 合并提交（由 P7 之后完成） |
| `node_modules/` | ❌ |
| 配置 / 依赖 | ❌ |

### 步骤 3.1 · 沙箱预演（强烈建议，5 分钟，零风险）

**目的**：在执行真合并前，用独立副本确认结果符合预期。

```powershell
$s = 'E:\AI_Chating\_merge-sandbox'

# 回到干净的 checkpoint
git -C $s reset --hard 008e8f16
git -C $s clean -fdq -e node_modules

# 沙箱也需要这条配置（实测：沙箱默认没有）
git -C $s config --local merge.renormalize true

# 预演合并
git -C $s -c user.email=a@b -c user.name=x merge --no-commit --no-ff refs/remotes/official/master

# 核对
git -C $s status --porcelain |
  Where-Object { $_.Substring(0,2) -match '^(UU|UD|DU)$' } |
  ForEach-Object { $_.Substring(0,2) } | Group-Object | Select-Object Count,Name

# 复位
git -C $s merge --abort
```

**期望输出**：`UU 26` / `UD 15` / `DU 5`

### 步骤 3.2 · 固化本地未提交工作为提交 ★

**为什么必须做这一步**：
`git merge` **要求工作区没有未提交改动**，否则拒绝执行（或要求先 stash）。
而你的 144 个改动 + 141 个未跟踪文件**全部是未提交状态**。
所以必须先把它们固化成 commit，合并才能进行。

**做法**（已实测零副作用）：

```powershell
cd E:\AI_Chating\cyrene-agent
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# 3.2.1 暂存全部内容（含未跟踪文件）
git add -A

# 3.2.2 写出树对象
$TREE = (git write-tree).Trim()
Write-Output "全量树对象: $TREE"
git ls-tree -r --name-only $TREE | Measure-Object | Select-Object -ExpandProperty Count
#   期望：2022 个文件

# 3.2.3 用它创建备份提交（不切换分支、不动工作区）
$BACKUP = (git commit-tree $TREE -p HEAD -m "merge(P3): 本地工作快照（144 改动 + 141 未跟踪）").Trim()
Write-Output "备份提交: $BACKUP"
git tag -f phase3-work-snapshot $BACKUP

# 3.2.4 【关键】恢复索引（--mixed 只动索引，不动工作区文件）
git reset --mixed HEAD

# 3.2.5 让工作区变"干净"以便合并 —— 把改动提交到当前分支
git add -A
git commit -m "merge(P3): checkpoint 本地工作（合并前基线）"
Write-Output "新 HEAD: $(git rev-parse --short HEAD)"
```

**⚠️ 3.2.4 与 3.2.5 的区别（别搞混）**：
- 3.2.4 的 `reset --mixed` 是**为了回退索引**，此时工作区仍有未提交改动
- 3.2.5 才是**真正提交**，让 `git status` 变干净

**自检（必须全绿）**：

```powershell
git status --porcelain          # 期望：只有 ?? 未跟踪项，无 M/D
git log -1 --pretty=%s          # 期望：merge(P3): checkpoint 本地工作…
git tag --list 'phase3*'        # 期望：phase3-work-snapshot
# 确认你的代码内容没变
git diff eb6c311a --shortstat   # 期望与 P2 交接的 144 文件一致（+ 少量文档）
```

### 步骤 3.3 · 执行合并（不自动提交）

```powershell
cd E:\AI_Chating\cyrene-agent

# 注意：不加 -X renormalize（配置已生效）
git -c user.email=merge@cyrene.local -c user.name=cyrene-merge `
    merge --no-commit --no-ff refs/remotes/official/master
```

**为什么用 `--no-commit`**：
它让合并**停在冲突状态**，把决定权交给后续 Phase。
不加它的话 git 会在冲突全解决后自动提交 —— 而本 Phase 不解决冲突。

**为什么用 `--no-ff`**：
强制产生真正的合并提交，语义清晰、便于回退。（前置条件 5 已确认 HEAD 不是官方祖先，
所以不会因为 fast-forward 而空跑。）

### 步骤 3.4 · 核对冲突构成（本 Phase 的实质验收）

```powershell
cd E:\AI_Chating\cyrene-agent

git status --porcelain |
  Where-Object { $_.Substring(0,2) -match '^(UU|UD|DU|DD|AA)$' } |
  ForEach-Object { $_.Substring(0,2) } | Group-Object | Select-Object Count,Name
```

**期望输出（精确）**：

| 码 | 含义 | 期望数量 |
|---|---|---|
| `UU` | 双方都改（真三方冲突） | **26** |
| `UD` | 官方删 / 本地改 | **15** |
| `DU` | 本地删 / 官方改 | **5** |
| **合计** | | **46** |

### 步骤 3.5 · 固化合并状态（可选但建议）

```powershell
# 把冲突清单落盘，供 P4/P5/P6 消费
git status --porcelain |
  Where-Object { $_.Substring(0,2) -match '^(UU|UD|DU)$' } |
  ForEach-Object { "$($_.Substring(0,2))`t$($_.Substring(3))" } |
  Set-Content -Encoding UTF8 .cyrene-merge-analysis\90-p3-conflicts-actual.txt
```

---

## 四、验收测试

### A1 · 合并已暂停且 MERGE_HEAD 存在

```powershell
Test-Path E:\AI_Chating\cyrene-agent\.git\MERGE_HEAD
```
**期望**：`True`
**失败处置**：`False` 说明合并没启动或被自动提交 → 检查是否漏了 `--no-commit`。

### A2 · 冲突数 = 46（核心验收）

```powershell
$st = git status --porcelain | Where-Object { $_.Substring(0,2) -match '^(UU|UD|DU|DD|AA)$' }
($st | Measure-Object).Count
```
**期望**：`46`
**判定表**：

| 结果 | 含义 | 处置 |
|---|---|---|
| **46** | ✅ 完全符合预期 | 通过，继续 A3 |
| 50 | 行尾配置未生效 | 回查 `git config --local merge.renormalize`；**不要**用 `-X` 掩盖 |
| 0 | HEAD 已等于官方（不该发生） | 停止，核对 HEAD 与 ref |
| 其他 | 仓库状态漂移 | **停止**，`git merge --abort`，报告 |

### A3 · 冲突构成 = 26/15/5（精确验收）

```powershell
git status --porcelain |
  Where-Object { $_.Substring(0,2) -match '^(UU|UD|DU)$' } |
  ForEach-Object { $_.Substring(0,2) } | Group-Object | Select-Object Name,Count
```
**期望**：`DU=5`、`UD=15`、`UU=26`
**为什么这项比 A2 更严**：总数对不代表构成对。P2 报告已实测确认这个精确构成。

### A4 · 与权威清单逐项一致（最强验收）

```powershell
$actual = git status --porcelain |
  Where-Object { $_.Substring(0,2) -match '^(UU|UD|DU)$' } |
  ForEach-Object { $_.Substring(3) } | Sort-Object
$expect = Get-Content .cyrene-merge-analysis\40-conflicts-with-renormalize.txt | Sort-Object
Write-Output "实测有/清单无: $((Compare-Object $actual $expect | Where-Object SideIndicator -eq '<=' | Measure-Object).Count)"
Write-Output "清单有/实测无: $((Compare-Object $actual $expect | Where-Object SideIndicator -eq '=>' | Measure-Object).Count)"
```
**期望**：两项都是 `0`
**失败处置**：非 0 → 停止并报告差异清单。**不要**据不一致的基线进入 P4。

### A5 · 未跟踪文件完好（防"丢工作"验收）

```powershell
(git ls-files --others --exclude-standard | Measure-Object).Count
```
**期望**：**≥ 141**（不得低于）
**失败处置**：低于则**立即停止**，用 `git diff phase3-work-snapshot --stat` 查清。

```powershell
# 更严的核对：与 P3 备份提交逐项比对
git diff --name-status phase3-work-snapshot -- . | Where-Object { $_ -match '^D' } | Measure-Object
#   期望：0（没有任何文件相对备份提交"消失"）
```

### A6 · 11 项受保护功能基线核对（§8.2 A1）

```powershell
$base = Get-Content .cyrene-merge-analysis\protected-features-baseline.json -Encoding UTF8 | ConvertFrom-Json
foreach($p in $base){
  $hits = & findstr /S /M /C:"$($p.标识)" "src\*.ts" "src\*.tsx" 2>$null
  $now = if($hits){ ($hits | Measure-Object).Count } else { 0 }
  $mark = if($now -ge $p.文件数){ 'OK' } else { 'REGRESSED' }
  Write-Output ("{0,-22} base {1,2} -> now {2,2}  {3}" -f $p.功能, $p.文件数, $now, $mark)
}
```
**期望**：11 项全部 `OK`，退化数 = 0
**说明**：合并后代码是"官方版 + 未解决冲突"，某些标识的命中数**可能暂时变化** ——
只要不出现 `REGRESSED`（低于基线）即可。**低于基线必须查明原因再进 P4。**

### A7 · 可回退性已验证

```powershell
git merge --abort
git status --porcelain | Where-Object { $_ -notmatch '^\?\?' } | Measure-Object
```
**期望**：合并被完全撤销，无 `M`/`D`/冲突项（只剩 `??`）
**执行完后**：重新跑步骤 3.3 恢复合并状态。

> 实测依据：沙箱里 `merge --abort` 后 dirty = 0、HEAD 回到原值、`MERGE_HEAD` 消失。

---

## 五、产出物清单

| 产出 | 验证方式 |
|---|---|
| 本地工作快照提交 + 标签 `phase3-work-snapshot` | 步骤 3.2 |
| 工作区干净的 checkpoint 提交 | 步骤 3.2 |
| **合并已执行且暂停在冲突状态** | A1 |
| 冲突 46 个 | A2 |
| 构成 26/15/5 | A3 |
| 与权威清单逐项一致 | A4 |
| 未跟踪文件完好 | A5 |
| 11 项功能基线未退化 | A6 |
| `90-p3-conflicts-actual.txt` | 步骤 3.5 |

**交接给 P4 的状态**：
```
HEAD      = checkpoint 提交（本地工作）
MERGE_HEAD = 官方 b11b8851 合并中（未提交）
冲突      = 46（UU 26 / UD 15 / DU 5）
回退      = git merge --abort  或  git checkout phase3-work-snapshot -- .
```

---

## 六、回退方法

### 6.1 撤销合并（最常用，回到 P3 之前）

```powershell
cd E:\AI_Chating\cyrene-agent
git merge --abort
# 验证
git status --porcelain | Where-Object { $_ -notmatch '^\?\?' } | Measure-Object   # 期望 0
```

### 6.2 回到 P0 基线（放弃整个合并）

```powershell
git checkout phase0-full -- .
git status --porcelain | Where-Object { $_ -notmatch '^\?\?' } | Measure-Object
```

### 6.3 只恢复某个文件

```powershell
git checkout phase3-work-snapshot -- src/main/channels/history-log.ts   # 回到 P3 快照
git checkout phase0-full -- <path>                                      # 回到 P0 基线
```

### 6.4 连 .git 都没了

```powershell
robocopy E:\AI_Chating\cyrene-agent-backup-phase0 E:\AI_Chating\cyrene-agent /E /XD node_modules
```

---

## 七、已知坑

| 坑 | 症状 | 应对 |
|---|---|---|
| **🔴 `merge-tree … HEAD` 测出 0** | 想预估冲突却得 0，误以为"无需合并" | **必须先物化工作区**：<br>`$st = (git stash create "m" 2>$null \| Select-Object -Last 1)`<br>`git merge-tree --write-tree --name-only refs/remotes/official/master $st`<br>（P2 报告偏差 1） |
| **🔴 以为 C 类 = 0** | P4 漏排 5 个文件 | 实测 C = **5**：`README.en.md`、`useChannelMirrorEvents.ts`(+test)、`settings/api/presets.ts`、`settings/tokens/panel.ts` |
| **⚠️ `git status` 行数不可当判据** | 提交后 219 → 229，疑似被改写 | `status` 把**未跟踪目录折叠成 1 行**。判定改写看 `git diff --shortstat` 与 `git ls-files -s` |
| **`git merge` 拒绝执行** | 报 "Your local changes would be overwritten" | 步骤 3.2 没做完整 —— 工作区必须干净（`git status` 只剩 `??`） |
| **`stash create` 的 SHA 每次不同** | 两次测量无法直接比对 | 每次重新取；比对的量是**冲突文件名**，不是 SHA |
| **`2>&1` 污染变量** | `$st` 里塞满 `warning: …LF will be replaced…` | 用 `2>$null`，或 `\| Select-Object -Last 1`（P2 报告踩到） |
| **PS 5.1 语法限制** | `Missing closing ')'` | 本机是 **PS 5.1 无 `pwsh`**：不能用 `&&`；括号表达式里不能用 `;` 连接命令 |
| **本会话 `node -v` 仍是 v22** | 误判环境 | 本 Phase 不需要 Node。P8 才需要 → 先 `$env:PATH = "D:\data\node24;" + $env:PATH` |
| **在沙箱忘了设 renormalize** | 沙箱测出 50 而非 46 | 沙箱是独立仓库，需单独 `git -C $s config --local merge.renormalize true` |
| **`NUL` 幻影目录** | `git clean` 报 `failed to remove NUL/: Directory not empty` | **无害**，忽略即可。不要尝试修复 |

---

## 八、给 P4 的交接提示

1. ✅ **合并已暂停**：`MERGE_HEAD` 存在，46 个冲突待解决。**不要** `git merge --abort`（那会丢弃本 Phase 的成果）
2. 📋 **P4 的任务是处理删除类冲突**：`UD 15` + `DU 5` = **20 个**
   - `UD`（官方删/本地改，15 个）→ 多数"跟着删"，但 `presets.ts` 与 `tokens/panel.ts` 需**恢复官方版**（它们有活引用者）
   - `DU`（本地删/官方改，5 个）→ **需拍板**，其中 `presets.ts`、`tokens/panel.ts` 与上面重叠
3. ⚠️ **`settings/api/presets.ts` 与 `settings/tokens/panel.ts` 出现在两个类别里** —— 这是最容易搞错的地方：
   本地删了它们，官方改了它们，**而官方树里有活引用者**（`presets.ts` 5 个、`tokens/panel.ts` 75 个）。
   → **结论：必须恢复官方版，否则编译失败**
4. 📄 **权威清单**：`.cyrene-merge-analysis/40-conflicts-with-renormalize.txt`（46 项，与 A4 逐项验证一致）
5. 🎯 **P4 的完成判据**：冲突从 46 降到 **26**（只剩 `UU`）
6. ⚠️ **不要在本 Phase 之后重新合并**：一旦 `git merge --abort`，P3 的成果（含 46 个冲突的精确状态）就没了，需要重跑本 Phase
7. 💾 **回退网**：`phase3-work-snapshot`（本地工作）、`phase0-full`（P0 基线）
8. 🔴 **P4 改完后先别提交** —— 提交时机在 P7（冲突全部解决后）
