# Phase 0 · 备份与回退锚点

> **阶段性质**：不改任何代码，只建立"存档点"和"回退网"。
> **风险等级**：零（纯增量操作）。
> **本阶段唯一目标**：让你 12 天的工作在物理上**不可能丢失**，然后再谈合并。
> **完成标志**：三个存档锚点全部验证通过 + 一份合并前状态清单。

---

## 一、为什么必须先做这一步（不是形式主义）

### 风险事实 1：你的仓库几乎没有回退网

```
$ git reflog
b11b8851 refs/remotes/official/master@{0}: fetch ... (我这次分析时加的)
eb6c311a refs/heads/master@{0}: clone: from https://gitee.com/playa0/cyrene-agent.git
eb6c311a refs/remotes/origin/HEAD@{0}: clone: from ...
eb6c311a HEAD@{0}: clone: from ...
```

**整个仓库只有"克隆"这一条记录，没有任何中间提交。**
含义：一旦未提交工作被 `checkout` / `merge` / `reset --hard` 覆盖，**git 层面没有任何东西可以恢复它**。

### 风险事实 2：有 121 个文件不在任何补丁里

我生成的分析补丁 `.cyrene-merge-analysis/10-my-uncommitted.patch`（2.2 MB）**只包含已跟踪文件**。
实测验证：你的 121 个未跟踪文件**没有一个**在这个补丁里。

这 121 个文件（**53,932 行**）包括你最重要的自建功能：

| 数量 | 位置 | 内容 |
|---|---|---|
| 18 | `src/main/memory/` | 记忆控制台、按人擦除、身份归属、schema 门禁 |
| 13 | `src/main/channels/` | 审计日志、工具白名单、关键词策略、transcript 擦除 |
| 8 | `src/main/zones/` | 区块（zones）全套 |
| 23 | `src/renderer/settings/` | 设置页区块/记忆面板 |
| 10 | `src/renderer/react/` | React 侧组件与 hook |
| 3 | `src/main/corpus/` | 群语料 |
| 其余 | `src/main/rag`、`orchestrator`、`docs` | reranker 修复、验证脚本 |

**这些文件目前只存在于你的磁盘上，任何版本控制之外的地方都没有副本。**

### 风险事实 3：自动化脚本会静默丢失文件（本次已踩到）

分析过程中我用 PowerShell 逐文件遍历，遇到了这个错误：

```
Test-Path : Illegal characters in path.
... \231\244.txt
```

原因：某些文件名含非 ASCII 字符，在 shell 之间传递时被转义成 `\231\244` 这样的八进制字面量，导致路径解析失败。
**后果：逐文件复制脚本会安静地跳过这些文件，而你以为备份成功了。**

> 这也解释了本次分析中"未跟踪文件数"几次变动（74 → 105 → 110 → 121）：
> 大部分是 `git status --porcelain` 把整个目录折叠成一行造成的计数差异，
> 但**非 ASCII 文件名确实是一个真实的、会丢数据的陷阱**。

**结论：备份必须用 git 自己的机制，不能用逐文件脚本。**

---

## 二、改动范围声明

| 项目 | 是否改动 |
|---|---|
| 任何源代码文件 | ❌ 不动 |
| 任何配置文件 | ❌ 不动 |
| git 工作区内容 | ❌ 不动（**本阶段绝不执行 checkout / reset --hard / stash pop**） |
| git 索引（暂存区） | ⚠️ 短暂变动，随即恢复原状 |
| git 对象库 | ✅ 新增对象（只增不减，安全） |
| git 引用（tag） | ✅ 新增标签 |
| 仓库外磁盘 | ✅ 新增一个备份目录 |

---

## 三、执行步骤

> **前置条件**：
> - 所有命令在 `E:\AI_Chating\cyrene-agent` 下执行
> - 先把 PowerShell 控制台切到 UTF-8，避免非 ASCII 文件名问题：
>   ```powershell
>   [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
>   $OutputEncoding = [System.Text.Encoding]::UTF8
>   ```
> - 确认没有其他 git 操作正在进行（无 `.git/MERGE_HEAD`、无 `.git/rebase-merge`）

---

### 步骤 0.1 · 记录合并前基线

**做什么**：把当前状态写进一份清单文件，供合并后逐项比对。

```powershell
cd E:\AI_Chating\cyrene-agent
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$out = ".cyrene-merge-analysis"
New-Item -ItemType Directory -Force -Path $out | Out-Null

git rev-parse HEAD                                              | Set-Content "$out\baseline-head.txt"
git status --porcelain                                          | Set-Content "$out\baseline-status.txt"
git -c core.quotepath=false ls-files --others --exclude-standard | Set-Content "$out\baseline-untracked.txt"
git ls-files -s                                                 | Set-Content "$out\baseline-index.txt"
git diff --shortstat                                            | Set-Content "$out\baseline-diffstat.txt"
```

**为什么**：合并后你需要回答"我到底有没有丢掉东西"。没有基线就无法回答。

**产出**：
- `baseline-status.txt` —— 应有 **144** 个已跟踪改动（131 ` M` + 13 ` D`）
- `baseline-untracked.txt` —— 应有 **123** 个未跟踪文件
- `baseline-diffstat.txt` —— 应约 `144 files changed, +43,3xx, -5,9xx`

> ⚠️ **关于未跟踪文件计数的说明（重要，否则你会误判丢文件）**
>
> 你可能会看到 **104 / 105 / 110 / 121 / 123** 这几个不同的数字，它们都是"对的"，区别在统计口径：
>
> | 数字 | 口径 |
> |---|---|
> | 104 | 纯业务新文件（排除全部分析/文档脚手架） |
> | 121 | + `.cyrene-merge-analysis/`（17 个分析产物） |
> | **123** | + `docs/merge-plan/`（本次交付的 2 份规划文档）← **执行 Phase 0 时的正确基线** |
>
> 所以：**只要 Phase 0 之后未跟踪数仍为 123（或你不删脚手架时保持一致），就没有丢文件。**
> 计数下降只有一个合法原因：你主动删了脚手架目录。

---

### 步骤 0.2 · 存档锚点 A —— 已跟踪改动快照

**做什么**：用 `git stash create` 生成一个**不触碰工作区**的提交对象。

```powershell
$snapA = git stash create "phase0-tracked-snapshot"
git tag -f phase0-tracked $snapA
git cat-file -t $snapA      # 应输出 commit
```

**为什么用 `git stash create`**：
它**只创建对象、不修改工作区、不修改 HEAD、不修改索引** —— 是 git 里唯一"纯读式"生成快照的方法。
（`git stash push` 会把改动移出工作区，**本阶段绝对不能用**。）

**实测验证**（我已在你的仓库跑过）：
```
生成的快照对象: 82734437fb4a0d56a5186e76e9bda5d0f821aca8
操作前 dirty 文件数: 219
操作后 dirty 文件数: 219
工作区是否被改动: 否 —— 安全 ✔
```

**已知局限（重要，所以才有锚点 B）**：
`git stash create` **只包含已跟踪文件**。实测确认：
```
zones/scope.ts 在快照里: NO      ← 未跟踪文件没进去
memory-console.ts 在快照里: NO   ← 未跟踪文件没进去
history-log.ts 在快照里: YES     ← 已跟踪文件进去了
```

---

### 步骤 0.3 · 存档锚点 B —— 全量快照（含 121 个未跟踪文件）★

**做什么**：临时把全部文件（含未跟踪）加入索引，写出一个树对象，然后**立即恢复索引原状**。

```powershell
# 1) 记录索引原状（步骤 0.1 已存 baseline-index.txt）
# 2) 临时暂存所有内容（含未跟踪文件）
git add -A

# 3) 写出树对象 —— 这就是包含全部 121 个新文件的完整快照
$treeB = git write-tree
Write-Output "全量树对象: $treeB"

# 4) 把树对象变成带标签的提交（便于日后 checkout）
$commitB = git commit-tree $treeB -p HEAD -m "phase0: full worktree snapshot (tracked + untracked)"
git tag -f phase0-full $commitB
Write-Output "全量快照提交: $commitB"

# 5) 【关键】恢复索引到基线状态（--mixed 只动索引，不动工作区）
git reset --mixed HEAD | Out-Null
```

**为什么这样安全**：
- `git add -A` 只写索引和对象库，**不修改任何文件内容**
- `git write-tree` 是纯读操作
- `git reset --mixed HEAD` **只重置索引**，**不触碰工作区文件**（那是 `--hard` 才做的）
- 全程没有任何命令会改写你磁盘上的源码

**实测验证**（沙箱内已跑通）：
```
暂存文件数: 847
树对象: b15d9694ff9709cce37d4952f0aeb79d7f7dc37e
zones/scope.ts:      YES ✔
memory-console.ts:   YES ✔
history-log.ts:      YES ✔
树里文件总数: 2352 个
```

**自检（必须做）**：

```powershell
# a) 工作区 dirty 数量应与步骤 0.1 完全一致
git status --porcelain | Measure-Object | Select-Object -ExpandProperty Count
#    应为 219（144 已跟踪 + 大致 75 个目录折叠项）；与 baseline-status.txt 行数一致

# b) 未跟踪文件必须全部回来
git ls-files --others --exclude-standard | Measure-Object | Select-Object -ExpandProperty Count
#    应仍为 121

# c) 索引必须与基线一致
git diff baseline-index.txt --stat   # 应无输出
git diff --cached --name-only        # 应为空（索引已恢复）

# d) 抽查三个关键未跟踪文件确实在树里
foreach($f in @('src/main/zones/scope.ts','src/main/memory/memory-console.ts','src/main/channels/audit-log.ts')){
  git cat-file -e "${commitB}:$f" 2>$null
  Write-Output "$f : $(if($LASTEXITCODE -eq 0){'在快照里 ✔'}else{'丢失 ✘'})"
}
```

> 若自检 (a) 或 (b) 不通过 —— **立刻停止，不要进入 Phase 1**，先排查。

---

### 步骤 0.4 · 存档锚点 C —— 仓库外物理备份（双保险）

**做什么**：把整个工作树镜像到仓库外的目录。

**为什么还要物理备份**：git 对象库里的快照依赖 `.git` 目录本身完好。如果 `.git` 被误删或损坏，锚点 A/B 一起失效。物理备份是唯一独立于 git 的保险。

**必须用镜像复制工具，不能用逐文件脚本**（非 ASCII 文件名问题）：

```powershell
$src = "E:\AI_Chating\cyrene-agent"
$dst = "E:\AI_Chating\cyrene-agent-backup-phase0"

# robocopy 处理非 ASCII 文件名是安全的；排除 node_modules（可重装，体积大且无价值）
robocopy $src $dst /E /XD node_modules /NFL /NDL /NJH /NJS /NP
Write-Output "robocopy 退出码: $LASTEXITCODE   (0-7 均为成功，8+ 为出错)"
```

**产出核对**：

```powershell
# 文件总数应与 git 树接近（robocopy 还含 node_modules 之外的杂项）
(Get-ChildItem $dst -Recurse -File | Measure-Object).Count

# 关键目录抽查
foreach($d in @('src\main\memory','src\main\zones','src\main\corpus','src\main\channels','.git')){
  Write-Output ("{0,-28} 存在: {1}" -f $d, (Test-Path "$dst\$d"))
}
```

> **体积预估**：源码 + `.git`（含官方 219 提交对象）约 **1.5–3 GB**（已排除 `node_modules`）。
> 若磁盘紧张，最低限度也要备份 `src/` + `.git/` + `docs/`。

---

### 步骤 0.5 · 记录"不可丢失清单"（功能级存档）

**做什么**：把 Phase 0 的产出从"文件级"提升到"功能级" —— 列清楚哪些能力是官方**没有**的，合并后必须逐项确认存活。

**为什么**：文件没丢 ≠ 功能没坏。合并可能保留文件却切断调用链（例如 Phase 6 的静默失效问题）。

```powershell
$protected = @(
  @{Name='记忆管理控制台';    Key='memory-console'},
  @{Name='按人擦除/身份归属'; Key='person-erasure'},
  @{Name='区块 zones';        Key='ZONES_'},
  @{Name='渠道审计';          Key='audit-log'},
  @{Name='工具白名单';        Key='tool-access'},
  @{Name='关键词策略';        Key='keyword-policy'},
  @{Name='群语料';            Key='group-corpus'},
  @{Name='群聊旁听上下文';    Key='buildGroupContextBlock'},
  @{Name='用量徽章';          Key='USAGE_BADGE'},
  @{Name='群上下文上限';      Key='groupContextLimit'},
  @{Name='弹窗确认门';        Key='confirmValue'}
)
$report = foreach($p in $protected){
  $hits = & findstr /S /M /C:"$($p.Key)" "src\*.ts" "src\*.tsx" 2>$null
  [pscustomobject]@{
    功能   = $p.Name
    标识   = $p.Key
    文件数 = if($hits){ ($hits | Measure-Object).Count } else { 0 }
    状态   = if($hits){ '存在 ✔' } else { '缺失 ✘' }
  }
}
$report | Format-Table -AutoSize
$report | ConvertTo-Json -Depth 3 | Set-Content ".cyrene-merge-analysis\protected-features-baseline.json"
```

**产出**：`protected-features-baseline.json` —— 合并后逐项比对，任何一项从"存在"变"缺失"都必须立刻查。

**预期基线（我已实测，供你核对）**：

| 功能 | 标识 | 官方命中 |
|---|---|---|
| 记忆管理控制台 | `memory-console` | 0（独家自建） |
| 按人擦除 | `person-erasure` | 0 |
| 区块 | `ZONES_` | 0 |
| 渠道审计 | `audit-log` | 0 |
| 工具白名单 | `tool-access` | 0 |
| 关键词策略 | `keyword-policy` | 0 |
| 群语料 | `group-corpus` | 0 |
| 群聊旁听 | `buildGroupContextBlock` | 0 |
| 用量徽章 | `USAGE_BADGE` | 0 |
| 群上下文上限 | `groupContextLimit` | 0 |
| 弹窗确认门 | `confirmValue` | 0 |

**全部是"官方 0 命中"** —— 这正是它们必须被保护的原因。

---

### 步骤 0.6 · 确认回退路径可用（演练一次）

**做什么**：在真正合并前，**验证一次"如果搞砸了怎么回来"**。

```powershell
# 回退方式 1：从全量快照恢复单个文件（最常用）
git checkout phase0-full -- src/main/channels/history-log.ts

# 回退方式 2：把整个工作区恢复成 Phase 0 状态
#   ⚠️ 这会丢弃 Phase 0 之后的所有改动 —— 仅在确认要放弃合并时使用
git checkout phase0-full -- .

# 回退方式 3：只看快照里某个文件的内容（不改磁盘）
git show phase0-full:src/main/memory/memory-console.ts | Select-Object -First 20
```

**只需验证方式 3（只读）能成功输出内容即可**，不要真的执行方式 2。

---

## 四、完成检查清单

Phase 0 全部通过才能进入 Phase 1：

- [ ] 控制台已切 UTF-8（`[Console]::OutputEncoding` 为 UTF8）
- [ ] `.cyrene-merge-analysis/baseline-*.txt` 5 份基线文件已生成
- [ ] 锚点 A：`git tag --list phase0-tracked` 有输出，且工作区 dirty 数与操作前一致
- [ ] 锚点 B：`git tag --list phase0-full` 有输出
- [ ] 锚点 B 自检：3 个抽查的未跟踪文件都在快照树里
- [ ] 锚点 B 自检：`git diff --cached --name-only` 为空（索引已恢复）
- [ ] 锚点 B 自检：未跟踪文件数仍为 **123**（若你已删脚手架目录则相应减少，但必须是你主动删的）
- [ ] 锚点 C：外部备份目录存在，且 `src\main\zones`、`src\main\memory`、`.git` 都在
- [ ] `protected-features-baseline.json` 已生成，11 项功能全部为"存在"
- [ ] 回退演练（只读方式 3）成功输出文件内容
- [ ] **`git status` 的改动数量与开工前一致**（这是"没有意外副作用"的最终证明）

---

## 五、本阶段明确不做的事

| 不做 | 原因 |
|---|---|
| ❌ `git stash push` / `git stash -u` | 会把改动移出工作区，违反"不碰工作区"原则 |
| ❌ `git reset --hard` | 会销毁工作区改动 |
| ❌ `git checkout <branch>` | 同上 |
| ❌ 执行 `git merge` | 那是 Phase 3 的事 |
| ❌ 修改 `.gitattributes` | 那是 Phase 2 的事（且会改变 diff 表现） |
| ❌ 装 Node 24 | 那是 Phase 1 的事 |
| ❌ 逐文件脚本复制 | 非 ASCII 文件名会静默丢文件 |
| ❌ 删除 `.cyrene-merge-analysis/10-my-uncommitted.patch` | 它是已跟踪改动的一份额外保险 |

---

## 六、产出物清单

| 产出 | 路径 | 作用 |
|---|---|---|
| 基线 5 件套 | `.cyrene-merge-analysis/baseline-*.txt` | 合并后逐项比对 |
| 已跟踪快照 | git tag `phase0-tracked` | 恢复已跟踪改动 |
| **全量快照** | git tag `phase0-full` | **恢复含 121 个新文件的完整状态** |
| 物理备份 | `E:\AI_Chating\cyrene-agent-backup-phase0` | 独立于 git 的最终保险 |
| 保护功能基线 | `.cyrene-merge-analysis/protected-features-baseline.json` | 功能级存活核对 |

---

## 七、预计耗时与风险

| 项目 | 评估 |
|---|---|
| 耗时 | **10–20 分钟**（物理备份占大部分，取决于磁盘） |
| 磁盘占用 | 约 1.5–3 GB（备份目录） |
| 风险 | **零** —— 全部为只增操作，无破坏性命令 |
| 可逆性 | 完全可逆：删除 tag 与备份目录即可，源码不受影响 |

---

## 八、本阶段结束后你应该能回答的问题

1. 我到底有多少未提交工作？→ 144 已跟踪 + 121 未跟踪
2. 如果合并搞砸了，怎么回到今天？→ `git checkout phase0-full -- .`
3. 哪些功能是官方没有、我必须保护的？→ `protected-features-baseline.json` 里的 11 项
4. 我的工作有没有被 Phase 0 意外改动？→ 没有，`git status` 数量与开工前一致

---

> **下一阶段预告**：Phase 1 只装 Node 24 + npm 11，不碰代码。
> 它是后续所有验证（`tsc` / `vitest` / `build`）的前提 —— 没有它，合并完无法证明代码能跑。
