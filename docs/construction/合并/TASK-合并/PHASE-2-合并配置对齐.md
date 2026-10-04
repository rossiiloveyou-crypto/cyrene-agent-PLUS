# Phase 2 施工蓝图：合并配置对齐（行尾处理）

> **执行者**：agent。本文件自包含，不需要对话历史即可执行。
> **风险等级**：零（**本 Phase 不修改仓库任何文件**，只写一条 git 本地配置）
> **预计耗时**：2–5 分钟
> **文档规范**：见 [BLUEPRINT-总蓝图.md](BLUEPRINT-总蓝图.md) 第七节

> ## ⚠️ 本 Phase 的做法已被实测推翻并替换（与原计划不同）
>
> **原计划**：加 `.gitattributes` + `git add --renormalize .` + 提交（会改动 **57 个文件的索引**）。
> **实测结论**：那套做法**没有收益**（冲突数一个都不减），却要动 57 个文件。
>
> **新做法**：只设一条 git 配置 `merge.renormalize=true` —— **零文件改动，达到同样效果**。
>
> 证据见第二节。**执行者请按本文档执行，不要按旧版的 P2 描述执行。**

---

## 一、施工目标

### 核心问题

跨仓库比较时，同一个源文件在两边的**索引行尾不同**，导致 `git diff` 把纯行尾差异误报成内容改动。实测最极端的例子：

| 文件 | 表面 diff 行数 | 真实内容差异 | 膨胀倍数 |
|---|---|---|---|
| `src/main/orchestrator/tools/registry/tool-registry.ts` | 475 + 475 − | **1 + 1 −** | **475×** |
| `src/main/memory/memory-user-ipc.ts` | 436 + 435 − | 9 + 8 − | 48× |
| `src/main/token-usage-store.ts` | 306 + 290 − | 18 + 2 − | 17× |

**根因**（实测）：`core.autocrlf=true` 来自 **system 级** gitconfig（两个仓库共享，均无本地覆盖、均无 `.gitattributes`）。但官方的索引**并非全部规整**：

| 仓库 | 文本源文件索引行尾分布 |
|---|---|
| 你（repo A） | `i/lf` 1495、`i/crlf` 46、`i/mixed` 10 |
| 官方（repo B） | 部分文件为 `i/crlf` / `i/mixed`（残留） |

> 📌 **修正一个此前的误判**：早期文档说"你 LF、官方 CRLF"过于简化。
> 实测**你的索引 96% 是 LF**，官方的也没讨论的那么整齐 —— 是**两边都有残留脏值**。

### 目标

- [ ] `merge.renormalize=true` 已设置
- [ ] 用只读手段证明行尾噪声已被消除（冲突数从 50 降到 46）
- [ ] **仓库状态与 Phase 0 基线完全一致**（本 Phase 零文件改动）

### 非目标（明确不做，且**这些是本次的刻意决定**）

| 不做 | 为什么 |
|---|---|
| ❌ 新增 `.gitattributes` | **实测零收益**：加与不加都是 46 个冲突（见第二节证据 3） |
| ❌ `git add --renormalize .` | 会改动 **57 个文件的索引**，收益为零，纯增加风险面 |
| ❌ 改工作区行尾 | 你的工作区是 `w/crlf`（1516 个文件），这是 `autocrlf=true` 的**设计行为**，不是问题 |
| ❌ 在任何文件中提交行尾变更 | 本 Phase **不产生任何提交** |
| ❌ 修复 `i/mixed` 文件 | 归入非目标；混合行尾不影响合并正确性 |

---

## 二、实测证据（决定本 Phase 做法，执行前请读）

全部在干净沙箱 `E:\AI_Chating\_merge-sandbox`（用户工作区的完整副本，HEAD `008e8f16`）中测得。

### 证据 1 · 真实 `git merge` 的硬数据

| 做法 | 冲突文件 | 冲突块 |
|---|---|---|
| ① 裸 merge（无任何行尾处理） | **50** | **69** |
| ② `git merge -X renormalize` | **46** | **64** |

→ **行尾处理确实有效**：消除 **4 个纯行尾假冲突**、**5 个假冲突块**。

### 证据 2 · `merge.renormalize` 配置与 `-X renormalize` 等效

```powershell
git -c merge.renormalize=true merge-tree --write-tree --name-only official/master HEAD
# → 46 个冲突
```
→ 在 `git merge-tree`（只读、无副作用）里，**一条配置即可复现 `-X renormalize` 的效果**。

### 证据 3 · `.gitattributes` 加不加都一样（推翻原计划的核心）

| 做法（均开 `merge.renormalize`） | 冲突文件 |
|---|---|
| 无 `.gitattributes` | **46** |
| 有 `.gitattributes`（`* text=auto eol=lf`） | **46** |

**差异 = 0。**

### 证据 4 · `git add --renormalize .` 的真实代价

在干净沙箱里实测：加 `.gitattributes` 后 `git add --renormalize .`
→ **57 个文件的索引被改写**（分布：`src/main` 35、`src/renderer` 14、其他 8），
其中 **11 个**属于 P3 的 69 个重叠文件、**6 个**属于 P3 的 46 个冲突文件。

**代价 57 个文件、收益 0 个冲突** → 不划算，放弃。

### 证据 5 · 磁盘内容是否安全（若仍需 renormalize 时参考）

```
实验前 ipc-channels.ts 磁盘 SHA256 = 58C883E3FA886BBD...
实验后 ipc-channels.ts 磁盘 SHA256 = 58C883E3FA886BBD...
→ 磁盘内容未被改动 ✔（git add --renormalize 只动索引）
```

> 虽然本 Phase 不再需要这一步，但**结论记下来**：
> `git add --renormalize` **不改磁盘**。若将来需要它，不必担心源码被改写。

### 证据 6 · `core.autocrlf` 的层级与影响

```
repo A local:  ''      repo A global: ''      repo A system: 'true'
repo B local:  ''      repo B global: ''
```
- 来自 **system 级**，两个仓库共享 → **不要改它**（会影响本机所有仓库）
- 实测：开/关 `core.autocrlf` 对冲突数**无影响**（都是 50）→ 它不是决定性变量

---

## 三、改动清单（Agent 直接执行）

### 3.0 改动范围声明

| 项目 | 是否改动 |
|---|---|
| 源代码 / 任何仓库文件 | ❌ |
| `.gitattributes` | ❌ **不创建** |
| git 索引 | ❌ **不动**（不跑 `--renormalize`） |
| git 提交 | ❌ **本 Phase 零提交** |
| `node_modules/` | ❌ |
| **git 本地配置** | ✅ **唯一改动**：`merge.renormalize=true` |

### 3.1 唯一的一步

```powershell
cd E:\AI_Chating\cyrene-agent
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# 前置确认：Phase 0 锚点必须在（这是回退网）
git tag --list 'phase0*'

# 唯一改动：开启合并时的行尾重归一化（写入 .git/config，不进版本控制）
git config --local merge.renormalize true
```

**为什么是 `--local` 而不是 `--global`**：
只影响本仓库。你还有官方 clone（`off-cyan\Cyrene-Agent`）和合并沙箱，
它们各自独立，不应被牵连。

### 3.2 明确不要做的事

```powershell
# ❌ 不要执行以下任何一条
# git config --global merge.renormalize true
# git config --system core.autocrlf false
# New-Item .gitattributes
# git add --renormalize .
# git commit
```

---

## 四、验收测试

### A1 · 配置已设置（核心验收）

```powershell
git config --local merge.renormalize
```
**期望输出**：`true`
**失败处置**：若为空 → 回到 3.1 重设。

### A2 · 行尾噪声已消除（只读证明，**这是本 Phase 的实质验收**）

```powershell
cd E:\AI_Chating\cyrene-agent
# merge-tree 是纯只读操作，不产生任何仓库改动
$r = git merge-tree --write-tree --name-only refs/remotes/official/master HEAD 2>$null
$c = ($r | Where-Object { $_ -match '^CONFLICT' } | Measure-Object).Count
Write-Output "冲突文件数: $c   (期望 46)"
```
**期望输出**：`冲突文件数: 46`
**判定依据**：

| 结果 | 含义 | 处置 |
|---|---|---|
| **46** | ✅ 行尾噪声已消除（对应 `-X renormalize` 的效果） | 通过 |
| 50 | ❌ 配置未生效 | 检查 A1；确认没有 `-c` 覆盖；重开终端 |
| 其他 | ⚠️ 仓库状态已变 | 停止，用 `git diff phase0-full --stat` 查清 |

> ⚠️ **A2 需要一个"对照组"认知**：46 是**期望值**，50 是**未处理时的值**。
> 若你的仓库状态与 P0 基线一致，就不该出现除 46 以外的结果。

### A3 · 官方 ref 可用

```powershell
git rev-parse --short refs/remotes/official/master
```
**期望**：`b11b8851`
**失败处置**：若报错 → 重新 fetch（见第七节）。

### A4 · 仓库零文件改动（最重要）

```powershell
cd E:\AI_Chating\cyrene-agent
Write-Output "status 行数: $((git status --porcelain).Count)   (期望 219)"
Write-Output "HEAD:        $(git rev-parse --short HEAD)   (期望 eb6c311a)"
Write-Output "索引条目:    $((git ls-files -s).Count)   (期望 1893)"
Write-Output "未跟踪数:    $((git ls-files --others --exclude-standard).Count)   (期望 >= 139)"
Write-Output ".gitattributes 存在? $(Test-Path .gitattributes)   (期望 False)"
```
**期望**：219 / eb6c311a / 1893 / ≥139 / False
**失败处置**：任何不符 → 停止。用 `git diff phase0-full --stat` 查清发生了什么。

> 📌 **未跟踪数口径**：P1 交接时是 **139**。判定条件为「**不得低于 139**」（不是等于），
> 因为后续 Phase 会持续在同一目录产生分析产物。这条口径修正是 P1 报告提出的。

### A5 · 配置未污染其他仓库（隔离性验收）

```powershell
Write-Output "官方 clone: '$(git -C E:\AI_Chating\off-cyan\Cyrene-Agent config --local merge.renormalize 2>$null)'   (期望空)"
Write-Output "沙箱:      '$(git -C E:\AI_Chating\_merge-sandbox config --local merge.renormalize 2>$null)'   (期望空)"
Write-Output "全局:      '$(git config --global merge.renormalize 2>$null)'   (期望空)"
```
**期望**：三个都为空（配置只落在你的仓库）

---

## 五、产出物清单

| 产出 | 验证方式 |
|---|---|
| `merge.renormalize=true` 已设置（local） | A1 |
| 行尾噪声消除（冲突 50→46） | A2 |
| 官方 ref 可用 | A3 |
| **仓库零文件改动** | A4 |
| 配置隔离（不污染其他仓库） | A5 |
| 本 Phase **零提交** | A4（HEAD 未变即证明） |

**交接给 P3 的状态**：`merge.renormalize=true`；仓库仍是 P0 基线（219 / eb6c311a / 1893）；官方 ref `b11b8851` 就位。

---

## 六、回退方法

本 Phase 只改了一条配置，回退 = 删掉它：

```powershell
cd E:\AI_Chating\cyrene-agent
git config --local --unset merge.renormalize
git config --local merge.renormalize    # 验证：应为空
```

**回退后的预期**：P3 的冲突数会回到 **50**（而不是 46）—— 也就是行尾假冲突重新出现。
这**不会导致数据丢失**，只是让 P3 的工作量增加 4 个文件的判断。

> 已验证 `--unset` 可正常工作（实测：设置后读回 `true`，unset 后读回空），
> 且该操作不影响 `git status`（仍为 219）。

---

## 七、已知坑

| 坑 | 症状 | 应对 |
|---|---|---|
| **本机是 PowerShell 5.1（无 `pwsh`）** | 脚本里用了 `&&` / `\|\|` 报错；`-Encoding UTF8` 读回中文乱码 | 用 `;` 分隔；读文件用 `[System.IO.File]::ReadAllText($p, [System.Text.Encoding]::UTF8)`（P1 发现 3） |
| **当前会话 `node -v` 仍是 v22** | 误判环境未就绪 | 本 Phase **不需要 Node**。但 P3/P8 需要 → 先 `$env:PATH = "D:\data\node24;" + $env:PATH`（P1 发现 1） |
| **`merge-tree` 的 `-c` 覆盖会掩盖配置** | A2 测出 50 而非 46 | 确认命令里**没有** `-c merge.renormalize=false`；A2 用纯 `git merge-tree` 让配置自然生效 |
| **误以为要建 `.gitattributes`** | 按旧版文档执行，改了 57 个文件 | 本文档第一节已明确：**不建**。依据是证据 3 |
| **官方 ref 不存在** | A3 报 `unknown revision` | 重新 fetch：`git fetch --no-tags E:\AI_Chating\off-cyan\Cyrene-Agent master:refs/remotes/official/master` |
| **`NUL` 幻影目录** | 若本 Phase 用到 robocopy，退出码可能是 9 | 本 Phase 不需要 robocopy。若用到，看汇总的 `Files FAILED` 与 `Mismatch` 列是否为 0（P0 报告第四节） |
| **`--local` 写错成 `--global`** | 影响本机所有仓库 | A5 专门验这一点；若已误设，`git config --global --unset merge.renormalize` |

---

## 八、给 P3 的交接提示

1. ✅ **行尾处理已就位**：`merge.renormalize=true`（local）。P3 执行 `git merge` 时**无需再加 `-X renormalize`**，配置会自然生效
2. ⚠️ **P3 是本任务第一个真正改动工作区的 Phase**（本 Phase 没有改任何文件）。执行前请再次确认：
   ```powershell
   git tag --list 'phase0*'    # 两个锚点必须在
   ```
3. 📊 **P3 的期望值**：冲突 **46 文件 / 64 冲突块**。若出现 50/69，说明行尾配置没生效（回查 A1）
4. 🧹 **P3 建议先在沙箱演练**：`E:\AI_Chating\_merge-sandbox`（HEAD `008e8f16`，已含用户工作区完整副本）。沙箱已跑通过一次完整合并
5. 📁 **P3 的冲突清单已存在**：`.cyrene-merge-analysis/40-conflicts-with-renormalize.txt`（46 个文件的权威清单）
6. ⚠️ **P3 会大幅改写工作区** → 这是**预期行为**。判定方法是拿 `40-conflicts-with-renormalize.txt` 核对，而不是看 `git status` 的行数
7. 🔴 **不要加 `-X renormalize`**：配置已生效，重复加不会出错但会掩盖"配置没生效"这类问题，降低可诊断性
