# Phase 2 完成报告：合并配置对齐（行尾处理）

> **状态**：✅ **已完成**（2026-09-27）
> **执行依据**：[PHASE-2-合并配置对齐.md](PHASE-2-合并配置对齐.md)（sha256 `6cc755bd…`，与磁盘版逐字节一致）
> **风险等级**：零（仓库零内容改动、零代码提交）
> **验收**：A1–A5 **全部通过**
> **唯一配置改动**：`E:\AI_Chating\cyrene-agent\.git\config` 新增一行 `renormalize = true`
> **唯一提交**：一条仅含本报告的文档提交，**父提交 `eb6c311a`**，提交信息见第四节

---

## 一、执行摘要

下表「执行后」列为**配置改完、尚未提交报告时**的实测值（即 A1–A5 的验收时点），
与 P0 基线可直接逐项比对。报告提交后的增量见第四节「附加验收」。

| 项目 | 执行前 | 执行后（验收时点） |
|---|---|---|
| `merge.renormalize`（local） | 未设置 | **`true`** ✅ |
| 冲突文件数（工作区 vs 官方） | **50** | **46** ✅ |
| `git status --porcelain` 行数 | 219 | **219（零变化）** ✅ |
| HEAD | `eb6c311a` | **`eb6c311a`（未变）** ✅ |
| 索引条目 | 1893 | **1893（零变化）** ✅ |
| 未跟踪文件数（逐文件） | 141 | **141（零变化）** ✅ |
| 已跟踪改动 | 144（+10645 −5931） | **144（+10645 −5931，零变化）** ✅ |
| `.gitattributes` | 不存在 | **仍不存在** ✅ |
| 锚点 `phase0-full` / `phase0-tracked` | `34f0669f` / `d48b0cc8` | **均未变** ✅ |

**结论**：行尾噪声已消除（**50 → 46**，恰好消掉 **4 个纯行尾假冲突**），
与权威清单 `40-conflicts-with-renormalize.txt` **逐项完全一致（46/46，差异 0）**。
仓库**零内容改动**，P0 基线中的 144 个未提交工作改动**逐字节未变**；
本 Phase 唯一的提交是一条**仅含本报告**的文档提交（父提交 `eb6c311a`），
提交后**索引仅 +1、已跟踪改动仍为 144**（第四节已验证）。

---

## 二、与蓝图的偏差（2 处，均已查清）

### 偏差 1 · 🔴 **A2 的验证命令原样执行会得到 0，而不是 46**（最重要的方法论修正）

蓝图 A2 给的命令是：

```powershell
$r = git merge-tree --write-tree --name-only refs/remotes/official/master HEAD
# 期望 46
```

**实测结果 = `0`**（且 `merge-tree` 只输出一个树哈希 `8d3250ec…`，无任何 `CONFLICT` 行）。

**根因**（已实测确认，非推断）：

```
git rev-list --count refs/remotes/official/master..HEAD  →  0
git rev-list --count HEAD..refs/remotes/official/master  →  219
git merge-base refs/remotes/official/master HEAD         →  eb6c311a (= HEAD)
git merge-base --is-ancestor HEAD refs/remotes/official/master  →  YES
```

即 **HEAD 就是合并基**（总蓝图第一节的拓扑判断是对的）。
`merge-tree A B` 的语义是「以 `merge-base(A,B)` 为基，合 A 与 B」——
当合并基 = HEAD 时，**HEAD 一侧没有任何独有改动**，三方退化为二方，
必然**零冲突**。这是一个**退化合并**，测不出任何东西。

> ⚠️ 更关键的一点：**`merge-tree` 只读「已提交的树」，完全看不到未提交的工作区。**
> 本次要合的主体恰恰是**未提交工作**（135+ 未跟踪文件 + 144 已跟踪改动），
> 而它们**不在 HEAD 的树里**。所以原命令测的是「空改动 vs 官方」，结果必然是 0。

**正确测法（本报告实际采用的只读做法）**——先把工作区**物化**成一个 commit
（`git stash create` **只创建对象，不写 stash 栈、不动工作区与索引、不改 HEAD**）：

```powershell
$st = (git -C $repo stash create "p2-measure" 2>$null | Select-Object -Last 1)
$r  = git -C $repo merge-tree --write-tree --name-only refs/remotes/official/master $st
$c  = ($r | Where-Object { $_ -match '^CONFLICT' } | Measure-Object).Count
# → 46 ✔
```

**处置结果**：用此法测得 **50（改配置前）→ 46（改配置后）**，
与蓝图期望值**完全吻合**。偏差仅存在于「测量命令的写法」，**不影响 P2 的结论与做法**。

**副作用核查**（已验，全部干净）：

| 检查项 | 结果 |
|---|---|
| `git stash list` 条目数 | **0**（`stash create` 不写栈）✅ |
| `git status --porcelain` | **219**（未变）✅ |
| `git rev-parse HEAD` | **`eb6c311a`**（未变）✅ |
| 工作区文件内容 | 未改动（未执行任何 `checkout`/`reset`/`stash pop`）✅ |

> 📌 **给 P3/P4/P5 的口径修正**：后续任何「用 `merge-tree` 预估冲突」的操作，
> **都必须先把工作区物化**（`stash create` 或临时 commit），否则一律测出 0。
> 这条应写进 P3 文档，避免 P3 用 0 冲突的错误结论开工。

### 偏差 2 · ⚠️ **总蓝图的「冲突三分类」C 项不是 0，实测为 5**

总蓝图第一节称：

| 类别 | 蓝图值 | **实测值** | 判定 |
|---|---|---|---|
| **A. 官方删除 / 本地仍在改** | 15 | **15** | ✅ 完全一致 |
| **B. 双方都改（真三方冲突）** | 31 | **41** | ⚠️ 见下 |
| **C. 本地删除 / 官方在改** | **0** | **5** | ❌ **蓝图有误** |

**实测冲突构成**（`merge-tree` 全量输出，46 条 `CONFLICT`）：

| 类型 | 数量 |
|---|---|
| `CONFLICT (content)` | **26** |
| `CONFLICT (modify/delete)` | **20** |
| **合计** | **46** ✅（与权威清单一致） |

`modify/delete` 再拆分：

- 官方删、本地改 → **15**（= 类别 A，与 `60-A_official_deleted.txt` 逐项一致 ✅）
- **本地删、官方改 → 5**（= 类别 C，蓝图称 0，**实际存在**）

**这 5 个文件已逐一独立交叉验证**（全部满足：`git status` 状态为 `D` + 磁盘不存在
+ HEAD 里存在 + 官方树里存在）：

```
README.en.md
src/renderer/react/features/chat/hooks/useChannelMirrorEvents.test.ts
src/renderer/react/features/chat/hooks/useChannelMirrorEvents.ts
src/renderer/settings/api/presets.ts
src/renderer/settings/tokens/panel.ts
```

**成因**：本地共删除 **13** 个已跟踪文件（`git status` 中 13 条 ` D`）；
其中这 **5 个**恰好**也被官方持续修改**，于是构成真正的
`modify/delete` 冲突 —— 这不是「无风险」，而是**需要拍板**的冲突
（选项：跟随本地删除 / 保留官方新版）。

**数字闭合难题（蓝图自身算术在实测口径下不闭合）**：

```
A(15) + B(31) = 46        ← 蓝图自己的算式，看似闭合
但实测: content(26) + A(15) = 41  ≠ 31
```

说明蓝图的「B = 31」用的是**另一套口径**（很可能把「本地删/官方改」的 5 个
连同另外若干项归入了别处）。**11 项受保护功能核对显示这 5 个文件与它们全部无关**
（对 11 个标识逐一检索 HEAD 版本，命中数 = **0**），因此**不构成受保护功能风险**。

**处置建议（本次未改，仅报告）**：

1. 将「类别 C = 0」修正为 **C = 5**，并列出上述 5 个文件；
2. 类别 B 建议按实测拆成两个子类，因为 P5/P6 的施工难度不同：
   - **B1 · `content` 真三方冲突 = 26**（逐个手工解决）
   - **B2 · 官方删/本地改 = 15**（= 类别 A，机械处置）
3. 该修正**不影响 P2 的验收结论**：P2 的判据是「46 个**文件**」，
   实测 46/46 与权威清单逐项一致 ✅。

---

## 三、改动清单（实际执行内容）

### 3.1 唯一的一步（已执行）

```powershell
git -C E:\AI_Chating\cyrene-agent config --local merge.renormalize true
```

**落点确认**（`git config --show-origin`）：

```
file:.git/config	true
```

即写入 `E:\AI_Chating\cyrene-agent\.git\config`，**不进版本控制、不影响其他仓库**。

### 3.2 明确未做的事（逐条核对为空）

| 禁止项 | 实测 |
|---|---|
| `git config --global merge.renormalize` | 未执行（global 读回**空**）✅ |
| `git config --system core.autocrlf false` | 未执行 ✅ |
| `New-Item .gitattributes` | 未执行（`Test-Path` = **False**）✅ |
| `git add --renormalize .` | 未执行（索引仍 **1893**）✅ |
| `git commit` | 未执行（HEAD 仍 **`eb6c311a`**）✅ |

---

## 四、验收测试结果（A1–A5）

### A1 · 配置已设置 ✅

```powershell
git config --local merge.renormalize
```

**实测输出**：`true` ✅

### A2 · 行尾噪声已消除 ✅（本 Phase 的实质验收）

```powershell
$st = (git -C $repo stash create "p2-measure" 2>$null | Select-Object -Last 1)
$r  = git -C $repo merge-tree --write-tree --name-only refs/remotes/official/master $st
($r | Where-Object { $_ -match '^CONFLICT' } | Measure-Object).Count
```

| 时点 | 冲突文件数 | 说明 |
|---|---|---|
| 改配置**前**（对照组，仅 `--unset` 前未设） | **50** | 与蓝图「未处理时期望 50」一致 ✅ |
| 改配置**后** | **46** | 与蓝图期望 **46** 一致 ✅ |

**逐项比对权威清单**（`40-conflicts-with-renormalize.txt`）：

| 方向 | 数量 |
|---|---|
| 清单有 / 实测缺失 | **0** ✅ |
| 实测有 / 清单没有 | **0** ✅ |

→ **46 个冲突文件与权威清单逐项完全一致** ✅

> 📌 **未采用原样命令的原因见偏差 1**（原命令测出退化合并的 0，非 46）。

### A3 · 官方 ref 可用 ✅

```powershell
git rev-parse --short refs/remotes/official/master
```

**实测输出**：`b11b8851` ✅（无需重新 fetch）

### A4 · 仓库零文件改动 ✅（最重要）

| 指标 | 期望 | **实测** | 判定 |
|---|---|---|---|
| `git status --porcelain` 行数 | 219 | **219** | ✅ |
| `git rev-parse --short HEAD` | `eb6c311a` | **`eb6c311a`** | ✅ |
| `git ls-files -s` 索引条目 | 1893 | **1893** | ✅ |
| `git ls-files --others --exclude-standard` | ≥139 | **141** | ✅ |
| `Test-Path .gitattributes` | False | **False** | ✅ |
| `git stash list` 条目数 | 0 | **0** | ✅（见偏差 1 副作用核查） |

**锚点完整性**（回退网仍在）：

```
phase0-tracked  -> d48b0cc8   ✅
phase0-full     -> 34f0669f   ✅
phase0-full^{tree} -> 00ae967e ✅
```

**未跟踪数 141 的增量归因**（P1 交接口径 139 → 现在 141，**非 P2 造成**）：

```
P0 快照记录 130
 +20（P0 之后的分析产物与 docs/merge-plan 文档）
 = 141 ✅
```

其中最后 4 个由 **P2 之前的分析阶段**产出，与本次 P2 执行无关：
`50-A_官方删除.txt`、`50-B_真冲突.txt`、`80-renormalize-filelist.txt`、`_probe-official-eol.ps1`。

> 📌 **口径修正建议**：未跟踪数应记为 **141**，判定条件维持「**不得低于**」语义
> （P2 文档的「≥139」已满足，无需改）。

### A5 · 配置未污染其他仓库 ✅（隔离性）

| 位置 | 实测值 | 判定 |
|---|---|---|
| 官方 clone（`off-cyan\Cyrene-Agent`） | `''`（空） | ✅ |
| 合并沙箱（`_merge-sandbox`） | `''`（空） | ✅ |
| 全局（`--global`） | `''`（空） | ✅ |
| **本仓库（`--local`）** | **`true`** | ✅ |

### 附加验收 · §8.2 A1 受保护功能基线核对 ✅

**11/11 全部存活，退化项数 = 0**：

| 功能 | 标识 | 基线 | 现在 | 判定 |
|---|---|---|---|---|
| 记忆管理控制台 | `memory-console` | 4 | 4 | ✔ |
| 按人擦除/身份归属 | `person-erasure` | 8 | 8 | ✔ |
| 区块 zones | `ZONES_` | 5 | 5 | ✔ |
| 渠道审计 | `audit-log` | 11 | 11 | ✔ |
| 工具白名单 | `tool-access` | 13 | 13 | ✔ |
| 关键词策略 | `keyword-policy` | 6 | 6 | ✔ |
| 群语料 | `group-corpus` | 10 | 10 | ✔ |
| 群聊旁听上下文 | `buildGroupContextBlock` | 4 | 4 | ✔ |
| 用量徽章 | `USAGE_BADGE` | 2 | 2 | ✔ |
| 群上下文上限 | `groupContextLimit` | 11 | 11 | ✔ |
| 弹窗确认门 | `confirmValue` | 4 | 4 | ✔ |

### 附加验收 · 蓝图第二节证据的可复现性 ✅

P2 文档「证据 4」称 `git add --renormalize .` 会改写 **57** 个文件、其中 **6** 个
属于 46 冲突清单。用仓库内既存清单 `80-renormalize-filelist.txt` 独立复算：

| 项 | 文档值 | 复算值 | 判定 |
|---|---|---|---|
| 被改写文件数 | 57 | **57** | ✅ |
| 与 46 冲突清单交集 | 6 | **6** | ✅ |

```
src/main/settings/general-settings.ts
src/main/settings/settings-facade.ts
src/renderer/settings/general/dom.ts
src/renderer/settings/index.html
src/renderer/settings/shared/types.ts
vite.config.ts
```

→ 印证「**代价 57 文件、收益 0 冲突**」的结论成立，**放弃 `--renormalize` 的决定正确** ✅

---

### 附加验收 · 提交前后一致性 ✅

P2 的文档要求「本 Phase 零提交」，但项目所有者决定**以一次文档提交固化产出**。
该提交**只含本报告一个文件**，提交后已复核：**原 144 个已跟踪改动的内容零变化**。

| 指标 | 提交前 | 提交后 | 判定 |
|---|---|---|---|
| 索引条目 | 1893 | **1894**（+1，仅本报告） | ✅ |
| 工作区 vs HEAD 的已跟踪差异 | 144 / +10645 −5931 | **144 / +10645 −5931** | ✅ **零变化** |
| `git diff --shortstat eb6c311a` | — | 145 / +11045 −5931 | ✅ = 144 原改动 + 1 报告（+400 行） |
| 锚点 `phase0-full` | `34f0669f` | **`34f0669f`** | ✅ |
| 锚点 `phase0-tracked` | `d48b0cc8` | **`d48b0cc8`** | ✅ |

**提交内容**：

```
<HEAD>  merge(P2): 对齐合并配置（merge.renormalize=true，冲突 50→46）
          ↑ 父提交 = eb6c311a（P0 基线）
          1 file changed, 400 insertions(+)
          docs/merge-plan/PHASE-2-完成报告.md   （仅此一个文件）
```

> ⚠️ **口径陷阱（本次实际踩到并查清，后续 Phase 必读）**：
> 提交后 `git status --porcelain` 的行数由 **219 跳到 229/230**，一度疑似工作区被改写。
> **实为口径差异，不是文件改动**：
>
> | 命令 | 单位 | 本次数值 |
> |---|---|---|
> | `git status --porcelain` | **未跟踪目录折叠成 1 行** | `??` 85 行 |
> | `git ls-files --others` | **逐文件列出** | **142 个文件** |
>
> 219 是「144 已跟踪 + 75 折叠行」，229 是「145 + 84 折叠行」——
> **两者不可直接相减**。判定仓库是否被改写，**必须看
> `git diff --shortstat` 与 `git ls-files -s` 计数，不要看 `git status` 行数**
> （此坑与 P2 文档第七节「不要看 git status 行数」的提示同源）。

---

## 五、产出物清单

| 产出 | 验证方式 | 状态 |
|---|---|---|
| `merge.renormalize=true` 已设置（**local**） | A1 | ✅ |
| 行尾噪声消除（**50 → 46**） | A2 | ✅ |
| 46 冲突与权威清单逐项一致（差异 0） | A2 | ✅ |
| 官方 ref 可用（`b11b8851`） | A3 | ✅ |
| **仓库零内容改动**（144 已跟踪改动零变化） | A4 + 附加验收 | ✅ |
| 配置隔离（不污染其他仓库） | A5 | ✅ |
| 11 项受保护功能全存活 | §8.2 A1 | ✅ |
| **本报告**（已提交，父提交 `eb6c311a`） | 附加验收 | ✅ |

**交接给 P3 的状态**：

```
配置：merge.renormalize = true（local，已生效）
仓库：219 status / 141 未跟踪 / eb6c311a / 索引 1893 / .gitattributes 不存在
锚点：phase0-full=34f0669f | phase0-tracked=d48b0cc8
官方：refs/remotes/official/master = b11b8851
预期：冲突 46 文件（26 content + 15 官方删 + 5 本地删）
```

---

## 六、回退方法

本 Phase 只改了一条配置，回退 = 删掉它：

```powershell
cd E:\AI_Chating\cyrene-agent
git config --local --unset merge.renormalize
git config --local merge.renormalize    # 验证：应为空
```

**回退后的预期**：冲突数回到 **50**（行尾假冲突重新出现）。
**不会导致数据丢失**，只让 P3 多 4 个文件的判断。

**回退后必须复查**（确认回退本身没出岔子）：`git status --porcelain` 应仍是 **219**。

---

## 七、已知坑（本 Phase 补充）

| 坑 | 症状 | 应对 |
|---|---|---|
| **🔴 `merge-tree` 测出 0 冲突** | 原样执行 A2 命令得 0，误判为「完美无冲突」 | **必须先把工作区物化为 commit**（`stash create`），否则测的是退化合并（偏差 1） |
| **`merge-tree` 看不见未提交工作** | 以为命令能覆盖工作区改动 | `merge-tree` 只读已提交的树；本任务的合并主体是未提交工作，一律需物化（偏差 1） |
| **`stash create` 的 SHA 每次都不同** | 两次测量结果无法直接比对 commit | 每次测量**重新取** `$st`；`--name-only` 输出的冲突**文件名**才是可比对的量 |
| **`2>&1` 会把 autocrlf 警告混进变量** | `$st` 变量里塞满 `warning: …LF will be replaced…`，后续 `rev-parse` 报 `Filename too long` | 用 `2>$null` 抑制 stderr，或 `| Select-Object -Last 1`（本 Phase 踩到并已修正） |
| **PS 5.1：`(cmd; $LASTEXITCODE -eq 0)` 解析失败** | `Missing closing ')'` 语法错误 | PS 5.1 不允许在括号表达式里用 `;` 连接命令；改为先执行、下一行再判 `$LASTEXITCODE` |
| **「C 类 = 0」的错误认知** | 以为没有「本地删/官方改」冲突，P4/P5 漏排 5 个文件 | 实测 C = **5**（偏差 2 已列名单），P4/P5 需纳入 |
| **`--local` 写错成 `--global`** | 影响本机所有仓库 | A5 专门验这一点；若误设 → `git config --global --unset merge.renormalize` |
| **⚠️ `git status` 行数提交后突增** | 219 → 229/230，疑似工作区被改写 | **口径差异**：`status` 把未跟踪**目录折叠成 1 行**，`ls-files --others` 是**逐文件**。判定改写看 `git diff --shortstat` 与 `ls-files -s`（附加验收） |
| **`git commit` 会刷新 stat 缓存** | 提交后 `status` 重新统计，原先被缓存的项复现 | 属 git 正常行为；用 `diff --shortstat` 确认内容未变即可（本次实测 144/+10645/−5931 完全一致） |

---

## 八、给 P3 的交接提示

1. ✅ **行尾处理已就位**：`merge.renormalize=true`（local）。
   P3 执行 `git merge` 时**无需再加 `-X renormalize`**，配置自然生效
2. 🔴 **不要再加 `-X renormalize`**：配置已生效，重复加会掩盖「配置没生效」类问题，降低可诊断性
3. ⚠️ **P3 是本任务第一个真正改动工作区的 Phase**。执行前再次确认：
   ```powershell
   git tag --list 'phase0*'      # 两个锚点必须在
   git config --local merge.renormalize   # 应为 true
   ```
4. 📊 **P3 的期望值**：冲突 **46 文件**（构成：`content` 26 + 官方删 15 + 本地删 5）。
   若出现 **50**，说明行尾配置没生效（回查 A1）
5. 🔴 **预估冲突必须物化工作区**（见偏差 1）：
   ```powershell
   $st = (git -C $repo stash create "p3-measure" 2>$null | Select-Object -Last 1)
   git -C $repo merge-tree --write-tree --name-only refs/remotes/official/master $st
   ```
   直接跑 `merge-tree … HEAD` 会得到 **0**，是退化合并，**不要据此开工**
6. 📁 **P3 的冲突清单已存在**：`.cyrene-merge-analysis/40-conflicts-with-renormalize.txt`（46 个文件的权威清单，本次已逐项验证一致）
7. ⚠️ **P3 会大幅改写工作区** → 这是**预期行为**。
   判定方法是拿 `40-conflicts-with-renormalize.txt` 核对，**而不是看 `git status` 的行数**
8. ⚠️ **类别 C 的 5 个文件需要拍板**（偏差 2 已列名单）：
   本地已删、官方仍改 → 需明确「跟随本地删除」还是「保留官方新版」。
   这 5 个文件**不含任何受保护功能标识**，风险可控
9. 🧹 **建议先在沙箱演练**：`E:\AI_Chating\_merge-sandbox`。
   注意：**沙箱没有** `merge.renormalize`（A5 已验），若要复现 46 需在沙箱内先设该配置

---

## 九、交接状态

```
P0 ✅ ──► P1 ✅ ──► P2 ✅ ──► P3 ⏳ 待执行
                              ↑ 你在这里

配置：merge.renormalize = true（local，仅本仓库）
仓库：144 已跟踪改动（+10645/−5931，零变化）/ 142 未跟踪 / 索引 1894
      HEAD = 文档提交（父 eb6c311a）/ .gitattributes 不存在
锚点：phase0-full=34f0669f | phase0-tracked=d48b0cc8
官方：refs/remotes/official/master = b11b8851
冲突：46 文件（content 26 + 官方删 15 + 本地删 5），与权威清单逐项一致
```

> 📌 **P2 的唯一提交**：仅含本报告一个文件（父提交 `eb6c311a`）。
> 提交的 SHA 因报告自身引用了它而**必然滞后一次 amend**，故此处**不写 SHA**；
> 用 `git log -1 --pretty=%H` 或 `git rev-parse HEAD` 取实际值即可。
> **原 144 个未提交工作改动仍是未提交状态**，P3 面对的输入与 P1 交接时**完全一致**。
>
> ⚠️ **既有蓝图文档未作修改**（按项目所有者决定）。
> 因此第二节的两项修正（**C 类 = 5**、**merge-tree 需先物化工作区**）
> **只存在于本报告内**。P3/P4/P5 执行前**必须先读本报告第二节**，
> 不要直接沿用 `BLUEPRINT-总蓝图.md` 的「C=0」与 P2 文档的 A2 命令。
