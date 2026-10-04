# Phase 3 完成报告：执行合并（分水岭）

> **状态**：✅ **已完成**
> **执行日期**：2026-09-25
> **执行者**：agent（无对话历史，仅凭 [PHASE-3-执行合并.md](PHASE-3-执行合并.md) + [BLUEPRINT-总蓝图.md](BLUEPRINT-总蓝图.md)）
> **结论**：**A1–A7 全部通过（11/11 子项），冲突构成精确命中 26/15/5，零本地工作丢失。**
> **报告规范**：对齐 [PHASE-0-完成报告.md](PHASE-0-完成报告.md) / [PHASE-2-完成报告.md](PHASE-2-完成报告.md)

---

## 一、执行摘要

| 项目 | 结果 |
|---|---|
| 沙箱预演（步骤 3.1） | ✅ 46 冲突，与权威清单**逐项一致** |
| 本地工作固化（步骤 3.2） | ✅ 快照提交 `586eae90` + checkpoint 提交 `598dfb75` |
| 执行合并（步骤 3.3） | ✅ 暂停在冲突状态，`MERGE_HEAD` 存在 |
| 冲突数（A2） | ✅ **46**（精确命中） |
| 冲突构成（A3） | ✅ **UU 26 / UD 15 / DU 5**（精确命中） |
| 权威清单比对（A4） | ✅ 双向差集均为 **0** |
| 本地工作完好（A5） | ✅ 288 项工作资产，**0 项非预期丢失** |
| 11 项功能基线（A6） | ✅ **11/11 OK，退化 0** |
| 可回退性（A7） | ✅ 实测 `merge --abort` 完全回退，重跑合并结果一致 |

**验收总计**：11 项子判据全部 PASS，0 FAIL。

---

## 二、最终状态（交接给 P4）

```
HEAD        = 598dfb75  "merge(P3): checkpoint 本地工作（合并前基线）"
MERGE_HEAD  = b11b8851  （官方 master，合并中，未提交）
快照标签    = phase3-work-snapshot -> 586eae90（tree b1d0a8f2，2024 文件）
checkpoint  = 598dfb75（tree e869ffe7，2025 文件；比快照多 86-p3-tree.txt）
冲突        = 46（UU 26 / UD 15 / DU 5）
工作区      = 863 条 status：A 408 / M 349 / D 49 / R 10 / UU 26 / UD 15 / DU 5 / ?? 1
回退        = git merge --abort  或  git checkout phase3-work-snapshot -- .
```

### 产出物

| 文件 | 内容 |
|---|---|
| `.cyrene-merge-analysis/90-p3-conflicts-actual.txt` | 46 项实测冲突清单（`码<TAB>路径`），供 P4/P5/P6 直接消费 |
| `.cyrene-merge-analysis/85-p3-untracked-before.txt` | 合并前 142 项未跟踪基线（A5 判定依据） |
| `.cyrene-merge-analysis/86-p3-tree.txt` | 全量树对象 SHA（`b1d0a8f2…`） |
| 标签 `phase3-work-snapshot` | 本地工作快照（合并前全部内容） |
| 提交 `598dfb75` | checkpoint 本地工作（合并前基线） |

---

## 三、执行过程（含命令与实测输出）

### 3.1 沙箱预演（零风险验证）

沙箱 `E:\AI_Chating\_merge-sandbox`，checkpoint `008e8f16`，已设 `merge.renormalize=true`：

```powershell
git -C $s reset --hard 008e8f16
git -C $s clean -fdq -e node_modules
git -C $s -c user.email=a@b -c user.name=x merge --no-commit --no-ff refs/remotes/official/master
```

**实测**：`UU 26 / UD 15 / DU 5 = 46`，且与 `40-conflicts-with-renormalize.txt`
双向差集均为 **0**。预演后 `merge --abort` 复位成功（dirty=0，HEAD 回 `008e8f16`）。

> 结论：**真合并前已确证结果可预测**，为真合并提供了决策依据。

### 3.2 固化本地未提交工作

```powershell
git add -A
$TREE = (git write-tree).Trim()              # b1d0a8f281546f813f05647dee20781d27e8885c
$BACKUP = (git commit-tree $TREE -p HEAD -m "merge(P3): 本地工作快照…").Trim()   # 586eae90
git tag -f phase3-work-snapshot $BACKUP
git reset --mixed HEAD                        # 只回退索引，工作区不动
git add -A
git commit -m "merge(P3): checkpoint 本地工作（合并前基线）"   # 598dfb75
```

**自检**：`git status --porcelain` 非 `??` 项 = **0**；工作区已干净，满足 `git merge` 前置。

> ⚠️ **树文件数 = 2024，文档预期 2022**。差异 2 项已查明：执行过程中
> 新写入 `.cyrene-merge-analysis/85-p3-untracked-before.txt` 与 `86-p3-tree.txt`
> 被 `git add -A` 一并纳入。**属正常产物，非漂移**（见偏差 1）。

### 3.3 执行合并

```powershell
git -c user.email=merge@cyrene.local -c user.name=cyrene-merge merge --no-commit --no-ff refs/remotes/official/master
```

合并结果：`Automatic merge failed; fix conflicts and then commit the result.`，退出码 1（预期）。

**未加 `-X renormalize`** —— 遵守 P2 决策，配置 `merge.renormalize=true` 已生效。

### 3.4 / 3.5 核对与落盘

```powershell
git status --porcelain |
  Where-Object { $_.Substring(0,2) -match '^(UU|UD|DU)$' } |
  ForEach-Object { "$($_.Substring(0,2))`t$($_.Substring(3))" } |
  Set-Content -Encoding UTF8 .cyrene-merge-analysis\90-p3-conflicts-actual.txt
```

落盘 **46 行**，构成 `UU 26 / UD 15 / DU 5`。

---

## 四、验收测试逐项结果

| # | 验收项 | 期望 | 实测 | 判定 |
|---|---|---|---|---|
| A1 | `MERGE_HEAD` 存在 | True | True（`b11b8851`） | ✅ |
| A2 | 冲突数 | 46 | **46** | ✅ |
| A3 | 构成 | 26/15/5 | **26/15/5** | ✅ |
| A4 | 与权威清单一致 | 双向 0 | **0 / 0** | ✅ |
| A5 | 未跟踪完好 / 无丢失 | ≥141 | 见下节（**0 非预期丢失**） | ✅ |
| A6 | 11 项功能基线 | 退化 0 | **11/11 OK** | ✅ |
| A7 | 可回退性 | abort 干净 | dirty=0，重跑一致 | ✅ |

### A6 逐项实测

```
记忆管理控制台      base  4 -> now  4  OK
按人擦除/身份归属    base  8 -> now  8  OK
区块 zones         base  5 -> now  5  OK
渠道审计           base 11 -> now 11  OK
工具白名单         base 13 -> now 13  OK
关键词策略          base  6 -> now  6  OK
群语料            base 10 -> now 10  OK
群聊旁听上下文      base  4 -> now  4  OK
用量徽章           base  2 -> now  2  OK
群上下文上限        base 11 -> now 11  OK
弹窗确认门          base  4 -> now  4  OK
REGRESSED count = 0
```

> 注意：A6 的 `findstr` 命中数**恰好等于**基线值（非仅"不低于"）。这是合并处于
> 冲突暂停态的合理结果 —— `UD` 类冲突保留了本地版（功能在），`DU` 类冲突被官方版
> 覆盖但官方版亦有同名标识。**P4 解决删除类冲突后必须重跑 A6**。

---

## 五、关键偏差与判定修正（**P4/P5/P6 必读**）

### 偏差 1 · 树文件数 2024 vs 文档 2022

**现象**：`git ls-tree -r $TREE | Measure-Object` 得 2024，文档步骤 3.2.2 写"期望 2022"。

**根因**：执行者在步骤 3.2 之前新建了 2 个分析产物文件（`85-p3-untracked-before.txt`、
`86-p3-tree.txt`），随后 `git add -A` 将它们纳入树。

**判定**：**非漂移，无需处理**。文档的 2022 是"以 1893 索引 + 129 新文件"推算的静态值，
而 90/85/86 系列分析产物在 P3 执行过程中必然新增。判据应改为"≥2022 且无文件缺失"。

### 偏差 2 · 🔴 A5 的"未跟踪数 ≥141"判据在本 Phase 下**必然为 0**（判据修正）

**现象**：A5 期望 `git ls-files --others | Count` **≥ 141**，实测为 **0**。

**根因（逻辑必然，非失败）**：
P3 的步骤 3.2 要求**把全部未跟踪文件 `git add -A` 并提交**（否则 `git merge`
拒绝执行）。所以到 A5 执行时，**142 个未跟踪文件已 100% 变成已跟踪**。
`??` 计数为 0 是"固化成功"的证据，**不是**"丢文件"。

> ⚠️ **A5 的原判据与步骤 3.2 自相矛盾**：3.2 要求清空未跟踪区，A5 却要求未跟踪区非空。
> 二者不可能同时成立。

**替代判据（本次实际采用，已实测通过）**：
不用 `??` 计数，改为**逐项核对工作资产是否仍在磁盘上**：

```powershell
# ① 本地改动的文件（相对合并基 eb6c311a）
$mine = git diff --name-only eb6c311a phase3-work-snapshot
# ② 合并前的未跟踪基线（142 项，见 85-p3-untracked-before.txt）
# ③ 基线里本就存在的本地删除（13 项，见 baseline-status.txt）
# 判据：union(①,②) 中每个文件要么在磁盘上，要么属于③
```

**实测结果**：

| 量 | 值 |
|---|---|
| 工作资产总数（union） | **288** |
| 仍在磁盘 | **280** |
| 不在磁盘、但属"本地主动删除" | **8** |
| **非预期丢失** | **0** ✅ |

> `88 - 8 = 280`，完全自洽。**本地 12 天工作零丢失。**

### 偏差 3 · 合并干净删除了 49 个本地存在的文件（**官方删除，属预期**）

**现象**：`git diff --name-status phase3-work-snapshot` 报 **49 个 `D`**，
而这些文件在合并前的 HEAD（`598dfb75`）中**确实存在**。

**根因**：官方在 219 个提交里**删除**了这些文件。对"官方删 / 本地未改"的文件，
git 会**静默干净删除**（不产生冲突、不进 `UD` 清单）。

**逐项验证**（49/49 全部满足）：

| 检验 | 结果 |
|---|---|
| 文件在合并基 `eb6c311a` 中存在 | 49/49 YES |
| 文件被本地修改过（`eb6c311a → snapshot`） | **0/49**（全部 `untouched`） |
| 文件在官方树中存在 | 0/49（全部已删） |

**判定**：**全部 49 项均为"官方删除 + 本地从未触碰"，属合并的正常语义，不是工作丢失。**

代表性的 49 项包含：`src/renderer/tasks/**`（整个任务面板）、`src/renderer/call/**`、
`src/renderer/public/feeling/*.png` 与 `status/*.png` 表情资源、
`src/main/scene-embedder.ts`、`src/main/embedding-manager.ts`、
`src/renderer/react/components/ui/*ModeButton.tsx` 等。

> 🔴 **给 P4 的提示**：这 49 项**不在** 46 个冲突清单里，因此 **P4 的"46 → 26"判据不会
> 覆盖它们**。若这些删除中有你仍需要的文件（尤其 `tasks` / `call` 面板、
> `feeling`/`status` 表情图片），必须在 P4 阶段**主动**从 `phase3-work-snapshot` 取回：
> ```powershell
> git checkout phase3-work-snapshot -- <path>
> ```
> 权威判据：`.cyrene-merge-analysis/90-p3-conflicts-actual.txt` 只有 46 项，
> **不含**这 49 项。二者的合集才是"合并改动了工作区什么"的完整答案。

### 偏差 4 · 前置条件的实测值与文档基线不同（已核对为正常演进）

| 项目 | 文档期望 | 实测 | 判定 |
|---|---|---|---|
| HEAD | `eb6c311a` | **`25366ee7`** | ✅ 正常 —— P2 完成后新增了 1 个文档提交 |
| 索引条目 | 1894 | **1894** | ✅ 精确一致 |
| 已跟踪改动 | 144 | **144** | ✅ 精确一致 |
| 未跟踪文件 | ≥141 | **142** | ✅ |
| status 行数 | 229 | **230** | ✅ 差 1，同上（P2 文档提交） |
| `merge.renormalize` | true | **true** | ✅ |
| 官方 ref | `b11b8851` | **`b11b8851`** | ✅ |
| HEAD 非官方祖先 | 退出码非 0 | **1** | ✅ |

> 文档步骤 3.2.3 的提交信息与 3.2.5 的 `git diff eb6c311a --shortstat` 期望值
> 按实测调整（未跟踪 **142** 而非 141），其余全部精确命中。

---

## 六、已知坑的实测复现情况

| 坑（来自蓝图第七节） | 本次是否复现 | 说明 |
|---|---|---|
| 🔴 `merge-tree … HEAD` 测出 0 | 未复现（**规避**） | 未使用该路径；改用沙箱真实合并预演 |
| 🔴 以为 C 类 = 0 | 未复现（**已按实测**） | DU 实测 = **5**，与 P2 报告一致 |
| ⚠️ `git status` 行数不可当判据 | **已复现** | 230 → 863，因缺省折叠未跟踪目录 |
| `git merge` 拒绝执行 | 未复现 | 步骤 3.2 完整执行，工作区已干净 |
| `stash create` 的 SHA 每次不同 | 未复现 | 本次改用 `write-tree` + `commit-tree`，未用 stash |
| `2>&1` 污染变量 | **已复现** | `git add -A 2>&1` 把 warning 灌进管道，改用 `2>$null` |
| PS 5.1 语法限制 | **已复现** | `(...; ...)` 在括号表达式内用 `;` 报 `Missing closing ')'`，已拆分语句 |
| 沙箱忘设 renormalize | 未复现 | 沙箱已确认 `true` |

### 🆕 本次新踩到的坑（建议追加进蓝图第七节）

| 坑 | 症状 | 应对 |
|---|---|---|
| **git 输出把非 ASCII 路径转义** | `git diff --name-only` 对中文/非 ASCII 路径输出 `"docs/merge-plan/00-\346\200\273…md"`（C 风格八进制转义），直接喂给 `Test-Path` 抛 `Illegal characters in path`，造成**大量假"文件丢失"** | 用 `-z` + NUL 分割，或自行解码 `\NNN` 八进制为 UTF-8 字节。**注意**：`git -c core.quotepath=false` 在某些调用形态（数组 splat `git @G …`）下**不生效**，需写成 `git -c core.quotepath=false diff …` |
| **`@(...)` 包裹 GroupInfo 破坏 `.Count`** | `@($g \| Where-Object Name -eq 'UU').Count` 恒为 **1**，导致冲突构成误判为 1/1/1 | 直接用 `$_ -eq 'XX'` 过滤原始码列表计数，**不要**对单个 GroupInfo 用 `@()` 再取 `.Count` |
| **`$script:` 作用域在函数内计数失效** | 自定义 `Chk` 函数里 `$script:P++` 报 `operand is a PSObject`，PASS/FAIL 统计错乱 | 用 `List[string]` 收集结果后再统计 |

---

## 七、回退方法（已验证）

```powershell
cd E:\AI_Chating\cyrene-agent

# ① 撤销合并，回到 P3 之前（已实测：dirty=0，HEAD 回 598dfb75）
git merge --abort

# ② 只恢复某个文件到 P3 快照
git checkout phase3-work-snapshot -- src/main/channels/history-log.ts

# ③ 回到 P0 基线
git checkout phase0-full -- .

# ④ 连 .git 都没了
robocopy E:\AI_Chating\cyrene-agent-backup-phase0 E:\AI_Chating\cyrene-agent /E /XD node_modules
```

> ✅ **A7 已实测**：`git merge --abort` 后 `MERGE_HEAD` 消失、`HEAD` 回到 `598dfb75`、
> 非 `??` dirty = **0**、`docs/merge-plan` 13 个文档完好。随后重跑步骤 3.3，
> 冲突构成**精确复原为 26/15/5** —— 合并过程**完全幂等可重放**。

---

## 八、给 P4 的交接清单

1. ✅ **合并已暂停**：`MERGE_HEAD = b11b8851`，46 个冲突待解决。
   🔴 **绝对不要** `git merge --abort`（会丢弃 P3 成果，需重跑本 Phase）。
2. 📋 **P4 任务 = 处理删除类冲突 20 个**：`UD 15` + `DU 5`
   - `UD`（官方删/本地改，15）→ 多数"跟着删"，但 `settings.css`、`settings.ts` 等需按蓝图判定
   - `DU`（本地删/官方改，5）→ `README.en.md`、`useChannelMirrorEvents.ts`(+test)、
     `settings/api/presets.ts`、`settings/tokens/panel.ts`
3. ⚠️ **`presets.ts` 与 `tokens/panel.ts` 出现在两个类别里**（本文件同时是 `DU`，
   而蓝图第八节称其为 `UD`）：实测 `status` 码为 **`DU`**（本地删、官方改），
   官方树留有活引用者（`presets.ts` 5 个、`tokens/panel.ts` 75 个）
   → **必须恢复官方版，否则编译失败**。
4. 🔴 **额外注意 49 个"官方静默删除"文件**（见偏差 3）—— 不在 46 清单内，
   若仍需使用须主动 `git checkout phase3-work-snapshot -- <path>` 取回。
5. 📄 **权威清单**：`.cyrene-merge-analysis/90-p3-conflicts-actual.txt`（46 项，实测）
   与 `.cyrene-merge-analysis/40-conflicts-with-renormalize.txt`（逐项一致）
6. 🎯 **P4 完成判据**：冲突从 46 降到 **26**（只剩 `UU`）
7. 💾 **回退网**：`phase3-work-snapshot`（本地工作）、`phase0-full`（P0 基线）
8. 🔴 **P4 改完后先别提交** —— 提交时机在 P7（冲突全部解决后）
9. ♻️ **P4 完成后必须重跑 A6**（11 项功能基线），因为解决删除类冲突会改变工作区文件

---

## 九、Phase 3 目标达成核对

| 目标（来自施工蓝图 §一） | 状态 |
|---|---|
| 本地未提交工作被固化为一个 commit | ✅ `586eae90` + `598dfb75` |
| 合并已执行且暂停在冲突状态（不自动提交） | ✅ `MERGE_HEAD` 存在，未提交 |
| 冲突构成精确等于 26 / 15 / 5 | ✅ 精确命中 |
| 135+ 未跟踪新文件完好无损 | ✅ 142 项全部固化进快照，零丢失 |
| 产出 P4/P5/P6 可直接消费的冲突清单 | ✅ `90-p3-conflicts-actual.txt` |

**非目标遵守情况**：未解决任何冲突 ✅ / 未提交合并结果 ✅ / 未加 `-X renormalize` ✅ /
未改 `package.json` ✅ / 未 `npm ci` ✅ / 未删除任何未跟踪文件 ✅

---

**Phase 3 结论：分水岭动作成功完成，46 个冲突已精确收敛，可进入 P4。**
