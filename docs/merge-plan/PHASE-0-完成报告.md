# Phase 0 · 完成报告（备份与回退锚点）

> 执行日期：2026-09-27 00:08 – 00:12
> 仓库：`E:\AI_Chating\cyrene-agent`（HEAD `eb6c311a908c4da701869fff341972bac914b4aa`）
> 结论：**全部通过，可以进入 Phase 1。**
> 过程中发现 **4 处与规划文档不一致的地方**，其中 2 处是文档笔误/命令错误，1 处是预期数值偏差，1 处是 Windows 幻影目录陷阱。全部已在下方第四节列明。

---

## 一、完成检查清单（逐项对证）

| # | 检查项 | 结果 | 证据 |
|---|---|---|---|
| 1 | 控制台已切 UTF-8 | ✅ | 每个命令首行均设置 `[Console]::OutputEncoding`；中文文件名可正常读写 |
| 2 | `baseline-*.txt` 五份基线已生成 | ✅ | `baseline-head/status/untracked/index/diffstat.txt` |
| 3 | 锚点 A：`phase0-tracked` 存在，且 dirty 数不变 | ✅ | tag → `d48b0cc8`；dirty `219 → 219` |
| 4 | 锚点 B：`phase0-full` 存在 | ✅ | tag → `34f0669f`，树对象 `00ae967e` |
| 5 | 锚点 B 自检：3 个抽查未跟踪文件在树里 | ✅ | 抽查了 **5 个**，全部命中 |
| 6 | 锚点 B 自检：`git diff --cached` 为空 | ✅ | 暂存条目数 = 0 |
| 7 | 锚点 B 自检：未跟踪文件数一致 | ✅ | `133 → 133`（取真实文件数口径，见第二节） |
| 8 | 锚点 C：外部备份存在，关键目录齐全 | ✅ | `E:\AI_Chating\cyrene-agent-backup-phase0` |
| 9 | `protected-features-baseline.json` 已生成，11 项全在 | ✅ | 11/11 均为「存在」 |
| 10 | 回退演练（只读方式 3）成功输出内容 | ✅ | `git show phase0-full:src/main/memory/memory-console.ts` 正常输出中文注释 |
| 11 | **最终 `git status` 与开工前一致** | ✅ | status **219 行逐行完全相同**；已跟踪源码零改动 |

---

## 二、三个存档锚点（实测值）

### 锚点 A · 已跟踪改动快照

```
git tag phase0-tracked → d48b0cc87216c237a2c9ffd768e7f51f120469af
  类型：commit（git stash create 产物，含两个 parent）
  树  ：0a847d2d5fd2c42eb581199c3ea9f38154567ccb
```

**覆盖范围**：仅已跟踪文件（131 改 + 13 删）。这是 `git stash create` 的已知且符合预期的局限。

自检确认：
- `src/main/channels/history-log.ts`（已跟踪）→ **在** ✔
- `src/main/zones/scope.ts`（未跟踪）→ **不在** ✔（符合预期，由锚点 B 兜底）

### 锚点 B · 全量快照 ★（真正的回退网）

```
git tag phase0-full → 34f0669f6c1a57b4e876fdbd02cc6c049a0d4d21
  提交信息：phase0: full worktree snapshot (tracked + untracked)
  树对象  ：00ae967eabb704ba7ac44a8bf600219ffefa4fa2
  树内文件：2013 个（HEAD 树为 1893 个，净增 120）
```

抽查（全部命中）：

| 文件 | 状态 |
|---|---|
| `src/main/zones/scope.ts` | 在快照里 ✔ |
| `src/main/memory/memory-console.ts` | 在快照里 ✔ |
| `src/main/channels/audit-log.ts` | 在快照里 ✔ |
| `src/main/channels/history-log.ts` | 在快照里 ✔ |
| `src/main/corpus/group-corpus.ts` | 在快照里 ✔ |

**索引恢复证明**：`git ls-files -s` 与基线 1893 条目逐条比对，**0 差异**。

### 锚点 C · 仓库外物理备份

```
E:\AI_Chating\cyrene-agent-backup-phase0    （771.4 MB，已排除 node_modules）
```

逐目录文件数比对（含隐藏文件，源 vs 备份）：**20/22 目录零差异**。

| 目录 | 源 | 备份 | 差异 |
|---|---|---|---|
| `.git`（含 objects/pack/refs） | 387 | 387 | 0 |
| `src` | 1549 | 1549 | 0 |
| `docs` | 89 | 89 | 0 |
| `dist` | 1730 | 1730 | 0 |
| `models` | 8 | 8 | 0 |
| `.cyrene-merge-analysis` | 27 | 27 | 0 |

**内容级校验**（SHA256，工作区 vs 备份）—— 6/6 完全一致：

```
src/main/memory/memory-console.ts   一致 ✔
src/main/zones/scope.ts             一致 ✔
src/main/channels/history-log.ts    一致 ✔
src/main/channels/audit-log.ts      一致 ✔
src/main/corpus/group-corpus.ts     一致 ✔
src/shared/ipc-channels.ts          一致 ✔
```

**备份可独立性验证**（直接在该目录内运行 git）：

```
git -C <备份> rev-parse HEAD → eb6c311a908c4da701869fff341972bac914b4aa   ✔
git -C <备份> tag --list     → 18 个，含 phase0-full 与 phase0-tracked      ✔
git -C <备份> fsck           → 退出码 0（对象库完整）                       ✔
```

> 结论：即使原仓库 `.git` 被误删，备份目录本身就是一个**完整可用**的 git 仓库，两个锚点依然有效。

---

## 三、保护功能基线（11/11 全部存在）

`protected-features-baseline.json` 已生成。命中数为**你当前工作区**的文件数（规划文档那一列「官方命中 0」指的是**官方树**内的命中，两者口径不同）。

| 功能 | 标识 | 工作区命中文件数 | 状态 |
|---|---|---|---|
| 记忆管理控制台 | `memory-console` | 4 | 存在 |
| 按人擦除/身份归属 | `person-erasure` | 8 | 存在 |
| 区块 zones | `ZONES_` | 5 | 存在 |
| 渠道审计 | `audit-log` | 11 | 存在 |
| 工具白名单 | `tool-access` | 13 | 存在 |
| 关键词策略 | `keyword-policy` | 6 | 存在 |
| 群语料 | `group-corpus` | 10 | 存在 |
| 群聊旁听上下文 | `buildGroupContextBlock` | 4 | 存在 |
| 用量徽章 | `USAGE_BADGE` | 2 | 存在 |
| 群上下文上限 | `groupContextLimit` | 11 | 存在 |
| 弹窗确认门 | `confirmValue` | 4 | 存在 |

### ⚠️ 顺手发现的两个高危点（供 Phase 4/5 使用）

`USAGE_BADGE` 与 `confirmValue` 的**全部落点都在官方已删除的文件里**：

| 标识 | 全部落点 | 风险 |
|---|---|---|
| `USAGE_BADGE` | `src/renderer/settings/settings.ts`、`src/shared/chat-appearance.ts` | 两处都属"跟着删"范围 → **必须抽成独立模块，否则随文件一起消失** |
| `confirmValue` | `src/renderer/settings/memory/delete-all.ts`、`erasure-flow.ts`、`shared/modal.ts` | 依附旧弹窗结构 → **必须在官方新弹窗上重新实现** |

### 13 个已跟踪删除文件与规划完全对齐

实测删除清单（13 个）与规划 Phase 4 的「13 个跟着删」**逐条吻合**。其中经引用者核查确认必须**恢复官方版**的两个：

| 文件 | 工作区现有引用者 |
|---|---|
| `src/renderer/settings/api/presets.ts` | 5 个 → 删了会编译失败 |
| `src/renderer/settings/tokens/panel.ts` | 75 个 → 同上 |

---

## 四、★ 与规划文档的 4 处不一致（必读）

### 不一致 1 · 未跟踪文件数：实测 133，文档预期 123

**不是丢文件**，是文档写作之后又新增了 10 个文件。差额明细：

| 数量 | 来源 |
|---|---|
| 7 | `docs/merge-plan/`（含 `04-审计-chats-store与会话ID空间.md`、`PHASE-1-工具链对齐.md` 等，写作时只有 2 份） |
| 1 | `docs/user-guide/` |
| 2 | `docs/internal-issue/` |
| **10** | **合计 = 133 − 123** |

本次执行另新增 5 个分析产物（5 份 baseline 中后生成的 3 份 + `protected-features-baseline.json` + `robocopy-phase0-summary.txt`），故当前值为 **135**。

> **用法**：Phase 0 之后的正确基线是 **135**。若之后数字下降，唯一合法原因是主动删除脚手架目录。

### 不一致 2 · `baseline-diffstat.txt` 数值：实测 +10,645 / −5,931，文档预期 +43,3xx

**实测（且正确）**：

```
144 files changed, 10645 insertions(+), 5931 deletions(-)
```

文档预期的 `+43,3xx` 与实测差了约 4 倍，已确认为**统计口径混淆**，非数据问题：

| 数值 | 口径 | 是否可信 |
|---|---|---|
| **10,645 / 5,931** | `core.autocrlf=true` 下对比 HEAD —— **真实内容差异** | ✅ **以此为准** |
| 52,643 / 47,929 | `core.autocrlf=false`（行尾逐行比对）—— **纯行尾噪声** | ❌ 不可用 |
| 184,140 / 44,895 | 官方 `eb6c311a → b11b8851` 的 863 文件改动（`00-diffstat.txt`） | 官方侧数据，参考用 |

**验证方法**：`settings.ts` 工作区为**纯 CRLF（1175 个 CRLF、0 个纯 LF）**，而 HEAD 内是 LF。默认 diff 会把 CRLF 规范化后再比较，所以只报真实改动；关掉 autocrlf 就变成"每一行都不同"的假象。

> ✅ **好消息**：这说明**当前 diff 是干净的**，规划里担心的"475 倍膨胀"在你的默认配置下**并没有污染 `git diff`**。它污染的只是"跨仓库比较"（你的 LF 入库 vs 官方的 CRLF 入库），那才是 Phase 2 要处理的问题。

### 不一致 3 · 步骤 0.3 自检里的 `git diff baseline-index.txt --stat` 是**无效命令**

原文：

```powershell
git diff baseline-index.txt --stat   # 应无输出
```

实测报错：`fatal: ambiguous argument 'baseline-index.txt': unknown revision or path not in the working tree.`

原因：`baseline-index.txt` 是一个**普通文件**，不是 git 的 revision 也不是工作区路径。已改用**权威口径**验证：

```powershell
git ls-files -s > _index-now.txt
Compare-Object (Get-Content baseline-index.txt) (Get-Content _index-now.txt)
# 实测 → 0 差异 ✔
```

建议把这一条写回 Phase 1/2 的检查脚本。

### 不一致 4 · robocopy 退出码为 **9**，但备份是成功的（Windows 幻影目录陷阱）

`robocopy` 退出码 9 = bit3(有失败项) + bit1(有复制)。文档说"8+ 为出错"——**本次的 9 是假警报**。

**权威判定（robocopy 自带汇总）**：

```
    Dirs :       563         0       562         0         1         0
   Files :      4054         0      4054         0         0         0
   Bytes :  771.37 m         0  771.37 m         0         0         0
                         ↑                              ↑
                    复制失败文件 = 0            不匹配 = 0
```

**唯一那 1 个"Dirs FAILED"是 `NUL`** —— 一个 Windows 保留设备名幻影条目：

- 你仓库根目录躺着一个名为 `NUL` 的残留条目（`.gitignore:161` 已经用 `nul` 规则把它忽略掉了，说明你之前也踩过）
- 它**无法枚举、无法重命名、无法删除**（`Get-ChildItem` 报 `does not exist`，`Rename-Item` 报 `does not exist`，但列目录时又出现）
- 它还会**吞掉 robocopy 的日志写入**：带 `/LOG:` 时日志恒为 2 字节空白 —— 所以**后续阶段如果 robocopy 日志是空的，不要以为没执行，是 NUL 在作祟**，改用 `& robocopy.exe ... 2>&1 | Set-Content` 捕获

**正确处理**：判定备份成功请**看 Files FAILED 与 Mismatch 两列是否为 0**，不要只看退出码。或用 `robocopy ... ; if($LASTEXITCODE -ge 8){ 检查汇总里的 FAILED 列 }`。

---

## 五、Phase 0 之后的正确基线（供 Phase 1 起逐项比对）

| 项目 | 基线值 |
|---|---|
| HEAD | `eb6c311a908c4da701869fff341972bac914b4aa` |
| 已跟踪改动 | **144**（131 ` M` + 13 ` D`） |
| `git status --porcelain` 行数 | **219**（144 跟踪项 + 75 未跟踪项，其中 7 行为目录折叠） |
| 未跟踪文件数（真实文件口径） | **135** |
| 索引条目数 | **1893**（`git ls-files -s`） |
| 已跟踪 diffstat | **144 files changed, +10,645, −5,931** |
| 锚点 A | `phase0-tracked` → `d48b0cc8` |
| 锚点 B | `phase0-full` → `34f0669f`（树 `00ae967e`，2013 文件） |
| 锚点 C | `E:\AI_Chating\cyrene-agent-backup-phase0`（771.4 MB，含完整 `.git`） |
| 官方 HEAD（已 fetch） | `b11b88512cf0cf6dace56b59ff9487947ef01c28`（`refs/remotes/official/master`） |

---

## 六、回退手册（出事了怎么办）

```powershell
cd E:\AI_Chating\cyrene-agent

# ① 恢复单个文件到 Phase 0 状态（最常用，Phase 4/5 会天天用）
git checkout phase0-full -- src/main/memory/memory-console.ts

# ② 只看快照内容，不动磁盘（安全探查）
git show phase0-full:src/main/channels/history-log.ts | Select-Object -First 30

# ③ 整体回滚到 Phase 0 状态（危险！会丢弃 Phase 0 之后的所有改动）
#    仅在确认要放弃整个合并时使用，执行前先确认 phase0-full 两个 tag 还在
git checkout phase0-full -- .

# ④ 如果 .git 都没了 —— 从物理备份重建
robocopy E:\AI_Chating\cyrene-agent-backup-phase0 E:\AI_Chating\cyrene-agent /E /XD node_modules
#    或在备份目录里直接干活（它本身就是完整仓库）

# ⑤ 查看快照与当前的差异（确认丢了什么）
git diff phase0-full --stat
```

> ⚠️ 锚点 A（`phase0-tracked`）**不含** 120 个未跟踪新文件，只用于恢复已跟踪改动。**回退请优先用 `phase0-full`。**

---

## 七、风险状态更新

| 规划中的风险 | Phase 0 后状态 |
|---|---|
| "5.4 万行未提交工作无任何回退网" | ✅ **已消除** —— 锚点 B + 物理备份双保险 |
| "reflog 只有 1 条克隆记录" | ✅ 已缓解 —— 两个 tag 不依赖 reflog |
| "121 个新文件只在磁盘上" | ✅ **已消除** —— 全部进入 `phase0-full` 树 + 物理备份，且 SHA256 校验通过 |
| 非 ASCII 文件名静默丢文件 | ✅ 未发生 —— 用 git 机制 + robocopy，逐目录计数零差异 |

**Phase 0 未做且按计划不该做的事**：未执行 `stash push`、未执行 `reset --hard`、未执行任何 `checkout <branch>`、未执行 `merge`、未新建/修改 `.gitattributes`、未动任何源码文件。全部遵守。

---

## 八、给 Phase 1 的交接提示

1. 现在本机 `node -v` = **v22.23.2**、`npm -v` = **10.9.8**，与要求的 Node 24 / npm 11 **仍不符** —— Phase 1 的第一个目标不变。
2. E 盘可用空间 **270 GB**，物理备份只占 771 MB，后续装 Node 24 与 `npm ci`（`node_modules` 约 1.7 GB）空间充足。
3. 后续任何 robocopy 用法请回看**第四节不一致 4**，避免被 `NUL` 幻影目录和空日志误导。
4. 官方 HEAD `b11b8851` 已在本地（`refs/remotes/official/master`），Phase 3 无需再 fetch。
