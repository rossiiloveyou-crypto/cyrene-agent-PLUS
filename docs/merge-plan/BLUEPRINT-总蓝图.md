# 官方合并总蓝图（面向执行 Agent）

> **文档定位**：本目录是**施工蓝图**，读者是执行合并的 agent，不是人。
> 每个 Phase 文档必须能被一个**没有对话历史**的 agent 独立读懂并执行完毕。
> 写法对齐 `docs/construction/SELF-update 260925/` 的既有规范。
>
> 本文件 = **总索引 + 全局约束 + Agent 执行规约**。具体步骤在各 Phase 文档里。

---

## 一、任务背景（Agent 必读）

### 一句话

上游作者在 `eb6c311a` 之后又提交了 **219 个提交**（2026-09-15 → 09-25）。
本地有 **135 个未跟踪新文件 + 144 个已跟踪改动**（真实内容差异 `+10,645 / −5,931`）尚未提交。
两边改动了**同一片区域**。任务是把本地未提交工作**重新嫁接**到作者已大改的代码树上。

### 关键拓扑（决定策略，不可搞错）

```
官方 b11b8851  ←  领先 219 提交
      ↑
      │  你的 HEAD eb6c311a 是官方 HEAD 的【祖先】
      │  （官方已吸收你的已提交提交，例如插件市场双源）
      │
   你的工作区  ←  135 未跟踪 + 144 改动，【未提交】
```

**推论（必须理解，否则会用错策略）**：
1. `git merge official/master` 会 **fast-forward** —— 你的**已提交**历史不会冲突
2. 真正要合的是**未提交工作**，而它**不受 git 保护**
3. **不要**从官方树反向重贴改动：已跟踪改动有 2.2 MB 补丁，但未跟踪文件**连 diff 基线都没有**

### 实测结论（已跑过一次真实合并，可信）

| 指标 | 数值 |
|---|---|
| 自动合并成功（官方版自动就位） | **862 文件** |
| 你的未跟踪新文件 | **135 个全部保留，零 add/add 冲突** |
| 需人工处理的冲突 | **46 文件 / 64 冲突块** |

冲突分类（**P2 报告已用 `git status` 双字符码实测确认，以此为准**）：

| porcelain 码 | 类别 | 数量 | 含义 | 处置 |
|---|---|---|---|---|
| `UU` | 双方都改（真三方冲突） | **26** | 逐个手工解决 | P5/P6 |
| `UD` | 官方删 / 本地仍在改 | **15** | 本地工作落在被官方废弃的文件上 | P4 |
| `DU` | 本地删 / 官方在改 | **5** | 需拍板：跟随删除 or 恢复官方版 | P4 |
| | **合计** | **46** | | |

> ⚠️ **本节曾有两处错误，已修正**：
> 1. 旧版写「C 类 = 0」—— **实测为 5**。5 个文件是：
>    `README.en.md`、`useChannelMirrorEvents.ts`(+`.test.ts`)、
>    `settings/api/presets.ts`、`settings/tokens/panel.ts`
> 2. 旧版写「B = 31」—— 实测 `UU` = **26**（旧的 31 用的是另一套口径）
>
> 依据：[PHASE-2-完成报告.md](PHASE-2-完成报告.md) 偏差 2。

---

## 二、成功判据（Definition of Done）

全部满足才算合并成功：

1. ✅ `npm run build` 与 `npm run build:renderer` 成功
2. ✅ `npx tsc -p tsconfig.main.json`、`npx tsc -p tsconfig.preload.json`、`npm run check:renderer` 全绿
3. ✅ `npx vitest run` 全绿（含官方新增的 `ipc-contract.test.ts`）
4. ✅ **11 项自建功能全部存活**（见 `protected-features-baseline.json`，Phase 0 已生成）
5. ✅ **语料豁免边界完好**：`memory-deletion.test.ts` + `group-corpus-isolation.test.ts` 通过
6. ✅ 手工冒烟：记忆管理能开、区块能建、渠道控制台能看、审计有记录、渠道能收消息

> ⚠️ **判据 4/5 是本任务特有的**。上游作者不知道这些功能存在（官方树 0 命中），
> 所以**标准测试无法发现它们的失效**。必须靠基线逐项核对。

---

## 三、全局约束（所有 Phase 共同遵守）

### 约束 1 · 工具边界

| 规则 | 说明 |
|---|---|
| **只读优先** | 分析类工作（审计、比对、核查）不得写文件 |
| **不碰工作区内容** | 除明确要求改动的文件外，不得 `checkout` / `reset --hard` / `stash push` |
| **非 ASCII 文件名** | 文件名含中文时，**禁止逐文件脚本复制**（会静默丢文件）。用 `git` 机制或 `robocopy` |
| **文件遍历** | 用 `git ls-files` / `git ls-tree`，不要用 `find`/`Get-ChildItem` 递归拼路径 |

### 约束 2 · 环境陷阱（Phase 0 实测踩到，必读）

| 陷阱 | 症状 | 正确处理 |
|---|---|---|
| **`NUL` 幻影目录** | 仓库根有个名为 `NUL` 的 Windows 保留设备条目；无法枚举/重命名/删除；**会吞掉 robocopy 的 `/LOG:` 输出（日志恒为 2 字节空白）** | 判定 robocopy 成功**看汇总的 `Files FAILED` 与 `Mismatch` 两列是否为 0**，不要只看退出码（9 可能是假警报）。要日志就用 `& robocopy.exe ... 2>&1 \| Set-Content` |
| **CRLF/LF 双口径 diff** | `git diff --shortstat` 在 `autocrlf=true` 下报 +10,645；关掉后变 +52,643 | 一律用默认（`autocrlf=true`）口径。**不存在"475 倍膨胀污染本地 diff"的问题**，它只污染**跨仓库比较** |
| **PowerShell 中文乱码** | `Get-Content` 读 UTF-8 中文注释出错 | 显式 `-Encoding UTF8`；或 `[System.IO.File]::ReadAllText($p, [System.Text.Encoding]::UTF8)` |
| **`git diff <普通文件>` 无效** | `fatal: ambiguous argument` | 普通文件不是 revision。要比对索引用 `Compare-Object (git ls-files -s) ...` |

### 约束 3 · 每步必须可验证

**任何 Phase 的每一步都必须附带一条可执行的验证命令**，且：
- 验证命令的输出必须是**可判定的**（数字比对 / 退出码 / 字符串存在性）
- **禁止**用"应该没问题""看起来对"这类主观判据
- 验证失败时必须有明确的**停止条件**（不要带着失败进下一个 Phase）

### 约束 3.5 · 🔴 预估冲突必须先"物化工作区"（P2 实测教训）

本任务的合并主体是**未提交工作**，而 `git merge-tree` **只读已提交的树**。
更糟的是：你的 `HEAD` 曾经就是合并基，所以

```powershell
git merge-tree --write-tree --name-only refs/remotes/official/master HEAD
# ❌ 得到 0 个冲突 —— 因为 merge-base(A,B) = HEAD，HEAD 一侧无独有改动
#    这是【退化合并】，测不出任何东西
```

**正确做法**：先用 `git stash create` 把工作区物化成一个 commit（**只创建对象，
不写 stash 栈、不动工作区与索引、不改 HEAD**），再拿它去测：

```powershell
$st = (git stash create "measure" 2>$null | Select-Object -Last 1)
git merge-tree --write-tree --name-only refs/remotes/official/master $st
# ✅ 得到 46 个冲突
```

> **任何 Phase 需要预估冲突数时，一律走这条路径。** 直接对 `HEAD` 测会得到误导性的 0。
> 依据：[PHASE-2-完成报告.md](PHASE-2-完成报告.md) 偏差 1。

### 约束 4 · 提交粒度

- 每个 Phase 结束后**单独提交一次**（便于回退到任意 Phase 边界）
- 提交信息格式：`merge(P<n>): <做了什么>`
- **禁止**把多个 Phase 混在一个提交里

---

## 四、Phase 索引

| Phase | 名称 | 性质 | 风险 | 状态 | 文档 |
|---|---|---|---|---|---|
| **P0** | 备份与回退锚点 | 只增不改 | 零 | ✅ **已完成** | [PHASE-0-完成报告.md](PHASE-0-完成报告.md) |
| **P1** | 工具链对齐（Node 24 + npm 11） | 环境 | 零 | ✅ **已完成** | [PHASE-1-完成报告.md](PHASE-1-完成报告.md) |
| **P2** | 合并配置对齐（行尾处理） | 配置 | 零 | ✅ **已完成** | [PHASE-2-完成报告.md](PHASE-2-完成报告.md) |
| **P3** | 执行合并（沙箱先行） | 分水岭 | 中 | ⏳ 待执行 | [PHASE-3-执行合并.md](PHASE-3-执行合并.md) |
| P4 | Tier A：13 删 + 2 恢复 | 机械 | 低 | 待执行 | 待写 |
| P5 | Tier B：移植适配（React 设置页） | 搬运 | 中 | 待执行 | 待写 |
| P6 | Tier C：核心三文件重写 + 旁听迁移 | **重写** | **高** | 待执行 | 待写 |
| P7 | Tier D：边界编译修复 + 构建链切换 | 收尾 | 中 | 待执行 | 待写 |
| P8 | 验证与冒烟测试 | 验证 | 高 | 待执行 | 待写 |
| P9 | 回落与加固（同步机制） | 流程 | 零 | 待执行 | 待写 |

> **P2 已变更做法（实测推翻原计划）**：原计划是"加 `.gitattributes` + `git add --renormalize .`"
> （会改动 **57 个文件的索引**）。实测证明该做法**零收益**（冲突数一个不减），
> 已替换为**只设一条 git 配置** `merge.renormalize=true` —— 同样效果，零文件改动。
> 证据见 [PHASE-2-合并配置对齐.md](PHASE-2-合并配置对齐.md) 第二节。

### 依赖关系（不可跳过）

```
P0 ✅ ──► P1 ✅ ──► P2 ──► P3 ──► P4 ──► P5 ──► P6 ──► P7 ──► P8 ──► P9
        (无它无法验证)  (无它冲突判定多 4 个假项)   (先减数量→再搬功能→最后啃硬骨头)
```

**硬依赖理由**：
- **P0 → P3**：本地工作原本**没有任何回退网**（reflog 只有 1 条克隆记录）。P0 已消除此风险。
- **P1 → P8**：无 Node 24 则 `tsc`/`vitest`/`build` **全部跑不了** → 等于盲合并。**已解除**。
- **P2 → P3**：不加行尾处理则冲突为 **50 文件 / 69 块**；加上后为 **46 文件 / 64 块**。
  差的 4 个是纯行尾假冲突，不处理会让 P4/P5 的判断多 4 个干扰项。
- **P4 → P5 → P6**：先减少冲突数量（46→31），再处理中等难度，最后啃硬骨头。避免一开始就在最难的 3 个文件上耗尽注意力。

---

## 五、已拍板决策（Agent 不得重新论证）

以下决策已由项目所有者确认，**执行时直接采纳，不要重新评估**：

| # | 议题 | 决定 | 依据文档 |
|---|---|---|---|
| D1 | 桌面对话绑定 | **彻底删除**（保留 `conversation-binding-store.ts`，它被 zones 依赖） | [01](01-已拍板决策与技术修正.md) |
| D2 | 旧设置窗口 | **走官方 React 路线**，不救回旧窗口 | [01](01-已拍板决策与技术修正.md) |
| D3 | 旁听 A（群近期上下文） | **迁移进 CTA 轨迹**（方案 1：新增 `observed_message` 类型） | [03](03-旁听迁移方案修订.md) |
| D4 | 旁听 B（自学习语料） | **原地不动，绝不迁入轨迹** | [03](03-旁听迁移方案修订.md) |
| D5 | 旧版本兼容 | **默认放弃支持**，README 加警告即可 | 用户确认 |

> **D4 是硬约束**：`src/main/corpus/**` 与 CTA 无关。
> 把它迁进轨迹会破坏"只增不减的长期资产"语义，并使两道豁免测试失效。
> 见 [03](03-旁听迁移方案修订.md) 第二节的原始注释证据。

---

## 六、必须保护的 11 项自建功能

官方树对这些标识的检索结果**全部为 0 命中** —— 它们是本地独有能力，标准测试发现不了它们的失效。

基线文件：`.cyrene-merge-analysis/protected-features-baseline.json`（Phase 0 已生成，11/11 存在）

| 功能 | 标识 | 工作区命中文件数（Phase 0 实测） |
|---|---|---|
| 记忆管理控制台 | `memory-console` | 4 |
| 按人擦除/身份归属 | `person-erasure` | 8 |
| 区块 zones | `ZONES_` | 5 |
| 渠道审计 | `audit-log` | 11 |
| 工具白名单 | `tool-access` | 13 |
| 关键词策略 | `keyword-policy` | 6 |
| 群语料 | `group-corpus` | 10 |
| 群聊旁听上下文 | `buildGroupContextBlock` | 4 |
| 用量徽章 | `USAGE_BADGE` | 2 |
| 群上下文上限 | `groupContextLimit` | 11 |
| 弹窗确认门 | `confirmValue` | 4 |

### ⚠️ Phase 0 发现的两个高危落点（P4/P5 必读）

这两个功能的**全部落点都在官方已删除的文件里**：

| 标识 | 全部落点 | 处置 |
|---|---|---|
| `USAGE_BADGE` | `src/renderer/settings/settings.ts`、`src/shared/chat-appearance.ts` | 两处都属"跟着删"范围 → **必须先抽成独立模块**（如 `src/shared/usage-badge.ts`），否则随文件一起消失 |
| `confirmValue` | `src/renderer/settings/memory/delete-all.ts`、`erasure-flow.ts`、`shared/modal.ts` | 依附旧弹窗结构 → **必须在官方新弹窗（queue-based `renderInputDialog`）上重新实现** |

---

## 七、每个 Phase 文档的必备结构

写新 Phase 文档时，必须包含以下 7 节（缺一不可）：

```markdown
# Phase N 施工蓝图：<名称>

## 一、施工目标
   - 核心问题（带 file:line 根因）
   - 目标清单（可勾选）
   - 非目标（明确划出范围，防止 agent 过度施工）

## 二、前置条件与停止条件
   - 前置：依赖哪个 Phase 的什么产物
   - 停止：出现什么情况必须停下来报告，而不是继续

## 三、改动清单（Agent 直接执行）
   - 逐条：文件路径 + 行号 + 改什么 + 为什么
   - 标注哪些是"必改且编译器不会提醒你"的陷阱

## 四、验收测试
   - 每条验收项 → 一条可执行命令 → 期望输出
   - 必改项要有"漏改会怎样"的失败场景说明

## 五、产出物清单

## 六、回退方法
   - 本 Phase 改坏了怎么退回

## 七、已知坑
```

---

## 八、验证机制

### 8.1 三层验证

| 层 | 手段 | 何时 |
|---|---|---|
| **L1 静态** | `tsc` / `check:renderer` | 每个改代码的 Phase 结束时 |
| **L2 测试** | `vitest run` | P6、P7、P8 |
| **L3 冒烟** | 启动应用，手工走一遍 11 项功能 | P8 |

### 8.2 针对本任务的特有验收（标准测试覆盖不到）

由于官方不知道这 11 项功能存在，必须**额外**做：

```powershell
# A1 · 基线逐项核对（每个改代码的 Phase 后都跑）
$base = Get-Content .cyrene-merge-analysis/protected-features-baseline.json | ConvertFrom-Json
foreach($p in $base){
  $hits = & findstr /S /M /C:"$($p.标识)" "src\*.ts" "src\*.tsx" 2>$null
  $now = if($hits){ ($hits | Measure-Object).Count } else { 0 }
  $mark = if($now -ge $p.文件数){ '✔' } else { '✘ 退化!' }
  Write-Output ("{0,-22} 基线 {1,2} → 现在 {2,2} {3}" -f $p.功能, $p.文件数, $now, $mark)
}
```

**判据**：任何一项 `✘ 退化` 都必须查明原因才能继续。

```powershell
# A2 · 语料豁免边界（P6/P7/P8 必跑）
npx vitest run src/main/memory/memory-deletion.test.ts src/main/corpus/group-corpus-isolation.test.ts
```
**判据**：全绿。这两条锁的是"语料不会被记忆清理误删"，破坏它等于毁掉自学习数据。

```powershell
# A3 · 静默失效探测器（P6 必跑，这是唯一能抓到"旁听断链"的手段）
# 背景：history-log.test.ts 直接调 appendHistory，不走 dispatcher，
#       所以 dispatcher 不再写 history 时它【永远不会失败】。
```

> ⚠️ **P6 必须新增一个集成测试**，断言"dispatcher 处理完一条渠道消息后，
> `channels/history/<sessionId>.jsonl` 确实多了一行"。
> 否则群聊旁听会静默消失而测试全绿 —— 这是本任务**最危险的失效模式**。

### 8.3 命令执行规范

```powershell
# 每条命令前显式设置编码（避免中文乱码）
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

# 文件遍历一律用 git（不要 Get-ChildItem 递归拼路径）
git -c core.quotepath=false ls-files --others --exclude-standard

# 判定 robocopy 成功：看 FAILED 与 Mismatch 列，不看退出码
```

---

## 九、当前基线（P1 之后，供逐项比对）

| 项目 | 基线值 |
|---|---|
| HEAD | `eb6c311a908c4da701869fff341972bac914b4aa` |
| 已跟踪改动 | **144**（131 ` M` + 13 ` D`） |
| `git status --porcelain` 行数 | **219** |
| 未跟踪文件数 | **≥ 139**（判定用"不得低于"，因为后续 Phase 持续产生分析产物） |
| 索引条目数 | **1893**（`git ls-files -s`） |
| 已跟踪 diffstat | **144 files changed, +10,645, −5,931** |
| `node_modules/vite` | **7.3.6**（尚未重装，P8 才换） |
| 锚点 A | `phase0-tracked` → `d48b0cc8` |
| 锚点 B | `phase0-full` → `34f0669f`（树 `00ae967e`，2013 文件） |
| 锚点 C | `E:\AI_Chating\cyrene-agent-backup-phase0`（771.4 MB，含完整 `.git`） |
| 官方 HEAD | `b11b88512cf0cf6dace56b59ff9487947ef01c28`（`refs/remotes/official/master`，已在本地） |
| Node（P1 后） | **v24.21.0** @ `D:\data\node24`；Node 22 保留在 `D:\data\node` |
| npm（P1 后） | **11.19.0** |
| registry | `https://registry.npmmirror.com` |

### ⚠️ 环境三坑（P1 实测，影响所有后续 Phase 的脚本）

| 坑 | 现象 | 应对 |
|---|---|---|
| **PATH 不传播到运行中会话** | 改了用户 PATH，但当前会话 `node -v` **仍是 v22.23.2** | Windows 进程环境块是创建时快照。执行 npm/node 前**显式前置**：<br>`$env:PATH = "D:\data\node24;" + $env:PATH`<br>或注销/重启后新开终端 |
| **只有 PowerShell 5.1，无 `pwsh`** | `&&`/`\|\|` 不可用；`-Encoding UTF8` 写 BOM 而读回按 ANSI → 中文乱码 | 用 `;` 分隔；读文件一律 `[System.IO.File]::ReadAllText($p, [System.Text.Encoding]::UTF8)` |
| **`NUL` 幻影目录** | 仓库根的 Windows 保留设备名条目；无法枚举/重命名/删除；**吞掉 robocopy 的 `/LOG:` 输出** | robocopy 成功判定看汇总的 `Files FAILED` 与 `Mismatch` 是否为 0，**不看退出码**（9 是假警报） |

---

## 十、回退手册

```powershell
cd E:\AI_Chating\cyrene-agent

# ① 恢复单个文件（最常用，P4/P5/P6 会天天用）
git checkout phase0-full -- src/main/memory/memory-console.ts

# ② 只看快照内容，不动磁盘（安全探查）
git show phase0-full:src/main/channels/history-log.ts | Select-Object -First 30

# ③ 整体回滚到 Phase 0（危险：丢弃之后所有改动）
git checkout phase0-full -- .

# ④ .git 都没了 → 从物理备份重建
robocopy E:\AI_Chating\cyrene-agent-backup-phase0 E:\AI_Chating\cyrene-agent /E /XD node_modules

# ⑤ 查看丢了什么
git diff phase0-full --stat
```

> ⚠️ 锚点 A（`phase0-tracked`）**不含** 135 个未跟踪新文件。**回退一律用 `phase0-full`。**

---

## 十一、参考文档索引

| 文档 | 内容 | 读者 |
|---|---|---|
| [00-总体任务预览.md](00-总体任务预览.md) | 面向人的全局说明（通俗版） | 项目所有者 |
| [01-已拍板决策与技术修正.md](01-已拍板决策与技术修正.md) | D1/D2 决策 + 绑定链路真相 | 全部 |
| [02-旁听上下文迁移可行性结论.md](02-旁听上下文迁移可行性结论.md) | CTA 轨迹系统逐行分析（10 种类型、2 处 fail-closed 白名单） | P6 执行者 |
| [03-旁听迁移方案修订.md](03-旁听迁移方案修订.md) | D3/D4 决策 + 语料不可迁移的原始证据 | P6 执行者 |
| [04-审计-chats-store与会话ID空间.md](04-审计-chats-store与会话ID空间.md) | 审计结论：ID 空间未被改动 | P6 执行者 |
| [PHASE-0-完成报告.md](PHASE-0-完成报告.md) | P0 实测值与 4 处文档修正 | 全部 |
| [PHASE-1-工具链对齐.md](PHASE-1-工具链对齐.md) | P1 施工蓝图（已执行） | P1 |
| [PHASE-1-完成报告.md](PHASE-1-完成报告.md) | P1 实测值 + 环境三坑（PATH 传播 / PS 5.1 / 未跟踪口径 139） | **全部后续 Phase 必读** |
| [PHASE-2-合并配置对齐.md](PHASE-2-合并配置对齐.md) | P2 施工蓝图 + 行尾处理的 6 组实测证据 | P2 执行者 |
| `MERGE-REPORT.md` | 完整技术对比（逐文件冲突分级） | 排障时查 |
| `.cyrene-merge-analysis/40-conflicts-with-renormalize.txt` | 46 个冲突文件权威清单 | P3/P4 |
| `.cyrene-merge-analysis/60-A_official_deleted.txt` | 15 个"官方删/本地改" | P4 |
| `.cyrene-merge-analysis/60-C_both_modified.txt` | 31 个真三方冲突 | P5/P6 |
| `E:\AI_Chating\_merge-sandbox` | 合并沙箱（已跑过一次真实合并） | P3 演练 |
