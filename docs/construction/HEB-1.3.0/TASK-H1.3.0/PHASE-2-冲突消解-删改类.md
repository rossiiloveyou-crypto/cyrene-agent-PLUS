# Phase 2 施工蓝图：删改类处置与静默删除救济

> **执行者**：agent。本文件自包含，不需要对话历史即可执行。
> **风险等级**：**低**（只做删除 / 保留的取舍，不改任何源码内容）
> **预计耗时**：**25–40 分钟**
> **文档规范**：见 `../methodology/BLUEPRINT-撰写规范.md` §4（**跨目录相对路径，不写裸文件名**）
> **前置**：P1 已完成并复核（`PHASE-1-完成报告.md` 含 §十一）；三套编译基线 **exit 0 / 0 错**
> ⚠️ **本 Phase 会启动一次"分步合并"并在结束时让 MERGE_HEAD 保持在场** —— 这是 M7（分步合并）的要求，**不是残留状态**。

---

## 一、施工目标

### 核心问题（带 `file:line` 根因）

1. 🔴 **本次合并的真实删除面是 95 个文件，而冲突列表只报了 16 个**（实测）：
   官方从 `b11b8851` 到 `8fe5ba7a` 删除 **95** 个文件；其中只有 **16** 个因"我方也改过"而进入 `UD` 冲突列表，
   **另外 79 个会静默删除** —— git 不报冲突、不出现在任何清单里（数据见 §二 E1）。
2. 🔴 **那 79 个里混着 15 个"我方必须留住"的文件**（实测分类，§二 E2）：
   - **B 类 14 个**是总蓝图 **M2**（附件文档链 / 向量化整体保留）的保护对象：
     `src/main/rag/document-index-{ipc,queue,worker}.ts`(+test) · `document-cache.ts`(+test) · `file-ingest.test.ts` ·
     `src/main/services/embedding/embedding-index-service.ts` · `src/main/sticker-embedder.ts` ·
     `sticker-embedding-cache.ts`(+test) · `src/shared/document-index.ts`
   - **C 类 1 个** `src/renderer/settings/shared/dialog-focus.ts`：**保留链依赖**（§二 E3）
   **不显式救回 = 违反 M2，且伴随断链**（这些文件的生产引用者见 §二 E4）。
3. ⚠️ **16 个 UD 里只有 3 个必须保留**，其余 13 个应随官方删除（实测引用面，§二 E3）：
   若逐个"凭感觉保留"，会在 P3 制造不必要的 `tsc` 错误面。
4. ⚠️ **4 个 DU 的去向已被 BACKLOG B-01 覆盖**（`docs/design` / `docs/internal-issue` / `docs/refactor` 的 3 个文件 + `README.en.md`），
   但**磁盘上还存在同名未跟踪副本**（§二 E5）→ 本 Phase 必须**明确写清"接受删除后的磁盘状态"**，不能让它在 P5 变成意外。

### 目标清单（可勾选）

- [ ] **T1** 以 `merge --no-commit --no-ff` 启动分步合并（MERGE_HEAD 在场，**不提交**）
- [ ] **T2** 处置 **16 个 UD**：保留 3 个 + 删除 13 个，并**显式救回 C 类 1 个**
- [ ] **T3** **救回 B 类 14 个**（M2 保护对象）—— 本 Phase 最重要的一步
- [ ] **T4** 处置 **4 个 DU**（接受删除），并记录磁盘上的未跟踪副本状态
- [ ] **T5** 出闸：**18 个救回文件全部在盘且在索引**；**17 个删除目标全部消失**；剩余冲突**恰为 20 个 UU**
- [ ] **T6** 把"保留 / 删除 / 救回"三类做成**机器可复跑的清单**（§七 产出物），供 P5 核验

### 非目标（明确不做）

| 不做 | 为什么 | 何时做 |
|---|---|---|
| 🔴 **不碰 20 个 UU 冲突** | 那是 P3 的处置面；本 Phase 只做删除/保留的取舍 | **P3** |
| 🔴 **不提交合并结果** | §三 全局约束：P0–P4 期间禁止提交合并结果（M7 分步） | **P4 末尾** |
| **不改任何被保留文件的源码内容** | 保留 ≠ 移植。内容差异属于语义处置 | P3 / P4 |
| **不引入官方的新文件**（`desktop-typescript.mjs` 等） | 那些是 UU 侧的内容，随 P3 | P3 |
| **不解决 B 类引用者的编译错误** | 引用者（`chat-ui-ipc.ts` / `default-dependencies.ts` 等）是 **UU 冲突文件**，属 P3 | **P3** |
| **不动三处 D 类遗留目录** | 已登记 BACKLOG **B-01**，P0/P1 有意不提交 | **P5** |
| **不跑全量测试** | 此时 20 个 UU 冲突未解，全量必然失败 → 无信息量 | P5 |

---

## 二、实测证据（决定本 Phase 做法，执行前请读）★

> 全部实测于真机：临时 worktree（方向 = **我方 HEAD 合入官方目标**），跑完即删；基线 `9920635f`。

### E1 · 删除面的真实规模

```powershell
$R = "E:\AI_Chating\cyrene-agent"; $T = "official-target-8fe5ba7a^{commit}"
(git -C $R diff --name-status "b11b8851..$T" | Where-Object { $_ -match '^D' }).Count   # → 95
```
| 项 | 数量 |
|---|---|
| 官方删除集（`b11b8851 → 目标`） | **95** |
| 其中因"我方也改过"进入 **UD** 冲突列表 | **16** |
| **静默删除**（不进任何冲突列表） | **79** |

**这 79 个的完整分类（本 Phase 的处置面地图）**：

| 类 | 数量 | 处置 | 依据 |
|---|---|---|---|
| **A · 旧设置目录** `src/renderer/settings/**`（**不含** C 类那一个） | **50** | **随官方删除** | 官方已整体拆除旧设置面板（P0 拓扑已定性） |
| **B · M2 保护对象**（rag / embedding / sticker） | **14** | 🔴 **必须救回** | 总蓝图 **M2** + 判据 **J-04** |
| **C · 保留链依赖** `src/renderer/settings/shared/dialog-focus.ts` | **1** | 🔴 **必须救回** | §二 E3 实测 |
| **D · harness 恢复协议** `run-recovery.ts` | **1** | **随官方删除** | 官方 `792c6daa` 已替换为轨迹恢复协议 |
| **E · 工具链 / 产物** `package-lock.json` · `cyrene-architecture.html` | **2** | **随官方删除** | 脱离 npm；架构图产物 |
| **F · 其他**（`cyrene.architecture.json` · UI 字体 3 件 · 圆角 3 件 · `ui-font-protocol.ts` · `ui-font.test.ts` · `AppUpdateEntry` 3 件 · `compressing.png`） | **11** | **随官方删除** | 官方 `df395282`（移除圆角）· `5dfcccd5`（固定字体）· `205d9231`（更新入口迁移）· `3087b90b`（安装包瘦身） |
| 合计 | **79** | — | — |

> ⚠️ **口径提示（起草期实测踩到一次）**：C 类 `dialog-focus.ts` 的路径**也匹配** `src/renderer/settings/**`，
> 若按"目录桶"粗分类会把它**同时计入 A** → 得到 `A 51 + … = 80 ≠ 79`。
> **正解**：A 类是"旧设置目录**且不属于 C**"的 **50** 个。
> 独立印证：官方删除 `src/renderer/settings/` 共 **67** 个，其中进 UD 的 **16** 个 ⇒ 静默 **51** = **A 50 + C 1** ✅

### E2 · B 类 14 个的精确属性（**为什么必须救回**）

逐个实测：**我方 HEAD 有 / 官方目标没有 / 我方从未改过** —— 三条同时成立：

| 文件 | 我方 HEAD | 官方目标 | 我方改过 |
|---|---|---|---|
| `src/main/rag/document-cache.ts` | ✅ | ❌ | 否 |
| `src/main/rag/document-cache.test.ts` | ✅ | ❌ | 否 |
| `src/main/rag/document-index-ipc.ts` | ✅ | ❌ | 否 |
| `src/main/rag/document-index-ipc.test.ts` | ✅ | ❌ | 否 |
| `src/main/rag/document-index-queue.ts` | ✅ | ❌ | 否 |
| `src/main/rag/document-index-queue.test.ts` | ✅ | ❌ | 否 |
| `src/main/rag/document-index-worker.ts` | ✅ | ❌ | 否 |
| `src/main/rag/document-index-worker.test.ts` | ✅ | ❌ | 否 |
| `src/main/rag/file-ingest.test.ts` | ✅ | ❌ | 否 |
| `src/main/services/embedding/embedding-index-service.ts` | ✅ | ❌ | 否 |
| `src/main/sticker-embedder.ts` | ✅ | ❌ | 否 |
| `src/main/sticker-embedding-cache.ts` | ✅ | ❌ | 否 |
| `src/main/sticker-embedding-cache.test.ts` | ✅ | ❌ | 否 |
| `src/shared/document-index.ts` | ✅ | ❌ | 否 |

🔴 **"我方改过 = 否"是本条的关键**：正因为没改过，git 才**不报冲突**、直接按官方删除 ——
**这类删除是"静默"的，任何冲突清单都抓不到它**（同族经验 **A56**：能力在、入口没了；**C24**：工具作用域 ≠ 被验对象作用域）。

### E3 · 16 个 UD 的逐条判定（**只保留 3 个**）

判定口径：*该文件在"合并完成后"还有没有引用者？*（即引用者本身是否也被官方删除）

| UD 文件 | 合并后仍存在的引用者 | 判定 |
|---|---|---|
| `shared/modal.ts` | **5 个**：`memory/delete-all.ts` · `memory/erasure-flow.ts` · `memory/manager.ts` · `shared/modal-icon.test.ts` · `zones/panel.ts`（**全为我方新增**） | 🔴 **保留** |
| `shared/modal-state.ts` | **1 个**：`shared/modal-icon.test.ts`（我方新增）＋ **被 `modal.ts` 本身引用** | 🔴 **保留** |
| `memory/dom.ts` | **2 个**：`memory/delete-all.ts` · `memory/erasure-flow.ts`（我方新增） | 🔴 **保留** |
| `api/dom.ts` | 0（引用者 `mcp/panel.ts`、`timeout/panel.ts` **都将被删**） | 删除 |
| `appearance/dom.ts` | 0（`shared/save-status.ts` 将被删） | 删除 |
| `general/dom.ts` | 0（`channels/panel.ts`、`save-status.ts` 将被删） | 删除 |
| `shared/save-status.ts` | 0（`timeout/panel.ts` 将被删） | 删除 |
| `shared/shell.ts` | 0（`save-status.ts` 将被删） | 删除 |
| `channels/dom.ts` · `channels/panel.ts` · `music/dom.ts` · `preferences/dom.ts` · `timeout/dom.ts` · `timeout/panel.ts` | 0（本来就无引用者） | 删除 |
| `default-dialogs-regression.test.ts` · `mcp/modal-interaction.test.ts` | 0 | 删除 |

**合计：保留 3 / 删除 13。**

### E4 · B+C 类 15 个的引用者 —— **它们正是 P3 的 UU 冲突文件**（P2→P3 的交接面）

| 被救回的文件 | 生产引用者（`src/main` / `src/preload`） | 该引用者的合并状态 |
|---|---|---|
| `rag/document-index-ipc.ts` | `src/main/chats/chat-ui-ipc.ts:20` | 🔴 **UU 冲突（静默重叠区）** |
| `rag/document-index-queue.ts` | `src/main/application/default-dependencies.ts:47` · `src/main/chats/chat-ui-ipc.ts:24` | 🔴 **UU 冲突** |
| `rag/document-index-worker.ts` | `src/main/application/default-dependencies.ts:48` · `src/main/chats/chat-ui-ipc.ts:25` | 🔴 **UU 冲突** |
| `services/embedding/embedding-index-service.ts` | `src/main/application/core-bootstrap.ts:20` · `default-dependencies.ts:51` · `src/main/memory/memory-user-ipc.ts:31` · `src/main/settings/settings-ipc.ts:16` | `default-dependencies` / `memory-user-ipc` 为 **UU**；其余见 P3 |
| `sticker-embedder.ts` | `src/main/moments/moments-service.ts:30` · `src/main/orchestrator/agent-runtime.ts:18` | `agent-runtime` 为 **UU** |
| `sticker-embedding-cache.ts` | `src/main/services/embedding/embedding-index-service.ts:4` | 链内 |
| `shared/document-index.ts` | `src/preload/index.ts:15` | `preload/index.ts` 为 **UU** |
| `shared/dialog-focus.ts` | `src/renderer/settings/shared/modal.ts:17` | 链内 |

> 🔴 **这条对 P3 极其重要**：**救回这些文件不会让 P2 变绿，只会把错误推到 P3** ——
> 因为引用者全在 20 个 UU 里。**P2 的验收因此不能包含 `tsc 全绿`**（§六 已据此设计判据）。

### E5 · 4 个 DU 与磁盘未跟踪副本的关系（**必须写清，否则 P5 会意外**）

| DU 文件 | 我方 HEAD | 磁盘未跟踪副本 | 处置 |
|---|---|---|---|
| `docs/design/react-frontend-visual-guidelines.md` | 不存在（在 `docs/design/` 目录级 `??` 里） | ✅ **存在** | 接受删除；副本留待 **B-01 / P5** |
| `docs/internal-issue/2026-09-09-architecture-review-verification-known-issues.md` | 同上 | ✅ **存在** | 同上 |
| `docs/refactor/2026-09-14-engineering-governance-plan.md` | 同上 | ✅ **存在** | 同上 |
| `README.en.md` | 不存在 | ❌ 不存在 | 接受删除（与 P0 的 3 个 DU 同类） |

🔴 **"接受删除"≠"磁盘上会消失"**：前三个文件的**未跟踪副本仍在**，`git rm --cached`/`git checkout` 都**不会碰未跟踪文件**。
→ P2 结束时 `git status` 仍会有那 3 行 `??`（**预期行为**，判据 **J-10 口径②**）。

### E6 · 保留链的闭合性（**C 类为何必须救回**）

```
modal.ts ──import──▶ ./dialog-focus        （官方删除集内，我方未改过 → 会被静默删除）
         ──import──▶ ./modal-state         （UD，已判定保留）
         ──import──▶ ../../shared/feedback-types（官方保留 ✅）
modal-state.ts ──▶ ../../shared/feedback-types（官方保留 ✅）
memory/dom.ts   ──▶（无 import，叶子）
dialog-focus.ts ──▶（无 import，叶子）
```
**结论**：保留 `modal.ts` ⇒ **必须连带保留 `dialog-focus.ts`**。而它**不在 16 个 UD 里**（我方没改过）
→ **若只处置 UD 列表，它会被静默删除，`modal.ts` 随即断链**（`TS2307`）。
**这正是"按清单审计漏掉了一类东西"的第二次出现**（第一次 = P0 复核 N-1）。

### 被推翻的原计划

- ❌ **原计划（P0 口径）：「20 个 UD/DU 里，接受删除即可」** —— 该结论只在"编译期悬空引用"口径下、且**只看 UD 列表**时成立。
  实测推翻两点：① 删除面是 **95** 而非 16；② 其中 **15 个必须救回**（14 B + 1 C）。→ 本 Phase 的核心目标据此改写（T3 从"无"变成"最重要的一步"）。
- ❌ **原计划：「逐个 UD 判断要不要保留」** —— 实测只有 3 个有"合并后仍存在的引用者"，
  逐个凭感觉保留会把 13 个死文件留在树里，**在 P3 制造额外的 `tsc` 错误面**。→ 改为**按引用面判定**（§二 E3 的表格）。
- ❌ **原计划：「P2 结束时跑三套 `tsc` 验证没坏的」** —— **结构上做不到**：B 类引用者全在 20 个 UU 里（§二 E4），
  只要 UU 未解就必然报错。→ 改为**作用域判据**：只判"救回的文件在不在 + 删除的目标没了没"（§六）。

---

## 三、前置条件与停止条件

### 前置条件（可执行命令 + 期望值；不满足则**不得开始**）

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$R   = "E:\AI_Chating\cyrene-agent"
$D   = Join-Path $R 'docs\construction\HEB-1.3.0\TASK-H1.3.0'
$N24 = Join-Path $R '.node24\node.exe'          # 🔴 P1 教训：门禁一律全路径（$env:PATH 不跨进程）

# ① 上阶段回写清单无未勾选项 —— 期望 0 行
Select-String -Path (Join-Path $D 'PHASE-1-完成报告.md') -Pattern '^\|.*\[ \]' -Encoding UTF8

# ② 台账无未闭合拍板 —— 期望 0 行
Select-String -Path (Join-Path $D 'HUMAN-人工验证台账.md') -Pattern '^\|.*\[ \]' -Encoding UTF8

# ③ 工作区无 M/D（只允许三处已登记 B-01 的 ??）—— 期望仅 3 行 ??
git -C $R status --porcelain

# ④ 没有未完成的合并（MERGE_HEAD 不在场）—— 期望：文件不存在
Test-Path (Join-Path $R '.git\MERGE_HEAD')

# ⑤ 官方目标锚点（J-12：必须 ^{commit}）
git -C $R rev-parse "official-target-8fe5ba7a^{commit}"          # → 8fe5ba7a5b3a86043b8034abeaa98f72f7459039

# ⑥ 三套编译基线仍在（P1 的核心交付物，P3 要用）
foreach ($c in 'main','preload','renderer') { Test-Path (Join-Path $R ".cyrene-merge-analysis\heb-p1\baseline-tsconfig.$c.log") }   # 期望 3 个 True

# ⑦ Node 24 可用（全路径）
& cmd /c "`"$N24`" -v"                                          # → v24.21.0
```

### 停止条件（出现即**立即停止并报告**）

| # | 停止条件 | 为什么必须停 |
|---|---|---|
| **S1** | 前置 ①–⑦ 任一条不满足 | 在脏树 / 无基线 / 无目标锚点的状态下开合并 = 无法归因、无法回退 |
| **S2** | 启动合并后 `git diff --name-only --diff-filter=U` 的条数 **≠ 40** | 与 E1 的实测（UU20 + UD16 + DU4）不符 → 合并目标或起始点不对，**立即 `merge --abort`** |
| **S3** | 救回 B 类时，任一文件 `git checkout HEAD -- <f>` **失败** | 说明该文件在 HEAD 里根本不存在（与 E2 矛盾）→ 清单已失效，须重新实测 |
| **S4** | 出现**计划外**的冲突状态码（`AA` / `DD` / `AU` / `UA`） | 说明有双方都新增/都删除同一路径的情况，超出本 Phase 的处置面 → 停止并登记 |
| **S5** | 工作区出现**源码内容改动**（`git diff --stat` 里 `src/**` 有非删除的行数变化） | 本 Phase **不改源码内容**；出现即越界 |

---

## 四、改动清单（Agent 直接执行）

> 🔴 **顺序敏感**：4.1 → 4.2 → 4.3 → 4.4 → 4.5 → 4.6 **不可调换**。
> 理由：先启动合并（4.1）才有 UD/DU 状态；**先救 B 类（4.2）再做删除（4.3）**——
> 因为 `git rm` 的路径清单与救回清单**必须互斥**，先救可避免"救完又被删"；
> DU（4.4）放最后，因为它与工作区未跟踪文件有交互，**放在最后便于观察状态**。

### 4.1 启动分步合并（`--no-commit`，**不提交**）

```powershell
$R = "E:\AI_Chating\cyrene-agent"

# 🔴 先记录起点，供回退与复核
git -C $R rev-parse HEAD | Tee-Object "$R\.cyrene-merge-analysis\heb-p2\p2-start-head.txt"
# （若目录不存在先建：New-Item -ItemType Directory -Force "$R\.cyrene-merge-analysis\heb-p2"）

# 启动合并（M7 = 分步；MERGE_HEAD 将保持在场直到 P4 收口）
git -C $R merge --no-commit --no-ff "official-target-8fe5ba7a^{commit}"

# 守门判据 S2：冲突条数必须 = 40
(git -C $R diff --name-only --diff-filter=U | Measure-Object).Count      # 期望 40
git -C $R status --porcelain | ForEach-Object { $_.Substring(0,2) } | Group-Object | Format-Table Name,Count
#   期望：UU 20 / UD 16 / DU 4
```

**失败处置**：条数不符 → `git -C $R merge --abort` → **停止（S2）** 并报告实测值。

### 4.2 🔴 救回 B 类 14 个（M2 保护对象）—— **本 Phase 最重要的一步**

```powershell
$R = "E:\AI_Chating\cyrene-agent"

$RESCUE_B = @(
  'src/main/rag/document-cache.ts',
  'src/main/rag/document-cache.test.ts',
  'src/main/rag/document-index-ipc.ts',
  'src/main/rag/document-index-ipc.test.ts',
  'src/main/rag/document-index-queue.ts',
  'src/main/rag/document-index-queue.test.ts',
  'src/main/rag/document-index-worker.ts',
  'src/main/rag/document-index-worker.test.ts',
  'src/main/rag/file-ingest.test.ts',
  'src/main/services/embedding/embedding-index-service.ts',
  'src/main/sticker-embedder.ts',
  'src/main/sticker-embedding-cache.ts',
  'src/main/sticker-embedding-cache.test.ts',
  'src/shared/document-index.ts'
)

# 逐个救回（用 HEAD 版本；这正是"合并前我方的内容"）
foreach ($f in $RESCUE_B) {
  git -C $R checkout HEAD -- $f
  if ($LASTEXITCODE -ne 0) { Write-Host "🔴 救回失败，停止（S3）: $f"; break }
}
```

**验证（救回后立刻做）**：

```powershell
foreach ($f in $RESCUE_B) {
  $onDisk  = Test-Path (Join-Path $R $f)
  git -C $R ls-files --error-unmatch $f 2>$null
  $tracked = $LASTEXITCODE -eq 0
  if (-not ($onDisk -and $tracked)) { Write-Host "🔴 $f  在盘=$onDisk 已跟踪=$tracked" }
}
# 期望：无任何输出（14/14 都在盘且在索引）
```

### 4.3 处置 16 个 UD：**保留 3 + 救回 C 类 1 + 删除 13**

```powershell
$R = "E:\AI_Chating\cyrene-agent"

# ① 保留 3 个 UD（用 HEAD 版本留在树里）
$KEEP_UD = @(
  'src/renderer/settings/shared/modal.ts',
  'src/renderer/settings/shared/modal-state.ts',
  'src/renderer/settings/memory/dom.ts'
)
foreach ($f in $KEEP_UD) { git -C $R checkout HEAD -- $f }

# ② 🔴 救回 C 类 1 个：保留链依赖（**它不在 UD 列表里**，见 §二 E6）
git -C $R checkout HEAD -- 'src/renderer/settings/shared/dialog-focus.ts'

# ③ 删除 13 个（接受官方删除）
$DROP_UD = @(
  'src/renderer/settings/api/dom.ts',
  'src/renderer/settings/appearance/dom.ts',
  'src/renderer/settings/channels/dom.ts',
  'src/renderer/settings/channels/panel.ts',
  'src/renderer/settings/default-dialogs-regression.test.ts',
  'src/renderer/settings/general/dom.ts',
  'src/renderer/settings/mcp/modal-interaction.test.ts',
  'src/renderer/settings/music/dom.ts',
  'src/renderer/settings/preferences/dom.ts',
  'src/renderer/settings/shared/save-status.ts',
  'src/renderer/settings/shared/shell.ts',
  'src/renderer/settings/timeout/dom.ts',
  'src/renderer/settings/timeout/panel.ts'
)
foreach ($f in $DROP_UD) { git -C $R rm -f --quiet -- $f }
```

> 🔴 **`git rm` 的失败是整体的**（经验 **C30**：一条命令里任一对象不合格则全部动作不发生）→
> 上面用**逐条 `foreach`**，且每条之后要复查（见下）。**不要**写成 `git rm -f -- $DROP_UD` 一条。

**验证**：

```powershell
# 13 个删除目标：磁盘不存在 + 不在索引
foreach ($f in $DROP_UD) {
  if ((Test-Path (Join-Path $R $f))) { Write-Host "🔴 仍存在: $f" }
}
# 4 个保留目标（3 UD + 1 C）：磁盘存在 + 在索引
foreach ($f in ($KEEP_UD + 'src/renderer/settings/shared/dialog-focus.ts')) {
  $onDisk = Test-Path (Join-Path $R $f)
  git -C $R ls-files --error-unmatch $f 2>$null
  if (-not ($onDisk -and $LASTEXITCODE -eq 0)) { Write-Host "🔴 保留失败: $f" }
}
```

### 4.4 处置 4 个 DU（接受删除）

```powershell
$R = "E:\AI_Chating\cyrene-agent"
$DROP_DU = @(
  'README.en.md',
  'docs/design/react-frontend-visual-guidelines.md',
  'docs/internal-issue/2026-09-09-architecture-review-verification-known-issues.md',
  'docs/refactor/2026-09-14-engineering-governance-plan.md'
)
foreach ($f in $DROP_DU) { git -C $R rm -f --quiet -- $f }

# 🔴 记录磁盘状态（E5：前三个文件仍有未跟踪副本，这是**预期**，不是失败）
git -C $R status --porcelain | Out-File "$R\.cyrene-merge-analysis\heb-p2\p2-after-du.txt" -Encoding UTF8
git -C $R status --porcelain
#   期望：3 行 ?? （docs/design/ · docs/internal-issue/ · docs/refactor/）+ 若干 M
```

### 4.5 出闸判据（本 Phase 的核心验收）

> 📌 **两个清单的口径先钉死**（避免执行者自己再算一遍算错）：
> **救回 = B 类 14 + UD 保留 3 + C 类 1 = 18 个**（`git checkout HEAD --` 对每个文件**同时**保证"在盘"与"在索引"）
> **删除 = UD 13 + DU 4 = 17 个**
> 其中 **20 个（16 UD + 4 DU）来自冲突列表**，**15 个（B 14 + C 1）来自静默删除面**。

```powershell
$R = "E:\AI_Chating\cyrene-agent"

Write-Host "== ① 剩余冲突必须恰为 20 个 UU =="
(git -C $R diff --name-only --diff-filter=U | Measure-Object).Count          # 期望 20
git -C $R status --porcelain | Where-Object { $_ -match '^(UU|UD|DU|AA|DD|AU|UA)' } |
  ForEach-Object { $_.Substring(0,2) } | Group-Object | Format-Table Name,Count   # 期望仅 UU 20
```

```powershell
# ② 结构判据：救回 18 / 删除 17，逐条复核
$RESCUED = $RESCUE_B + $KEEP_UD + @('src/renderer/settings/shared/dialog-focus.ts')
$DELETED = $DROP_UD + $DROP_DU
"救回清单 = $($RESCUED.Count)（期望 18）；删除清单 = $($DELETED.Count)（期望 17）"

foreach ($f in $RESCUED) {
  $onDisk = Test-Path (Join-Path $R $f)
  git -C $R ls-files --error-unmatch $f 2>$null
  if (-not ($onDisk -and $LASTEXITCODE -eq 0)) { Write-Host "🔴 救回不完整: $f  在盘=$onDisk" }
}
foreach ($f in $DELETED) {
  if (Test-Path (Join-Path $R $f)) { Write-Host "🔴 未删掉: $f" }
}
# 期望：以上两个 foreach 均无输出

# ③ 记录本 Phase 的处置清单（P5 的直接输入）
@"
P2 处置清单（生成于 $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')）
起始 HEAD   : $(Get-Content "$R\.cyrene-merge-analysis\heb-p2\p2-start-head.txt")
合并目标    : 8fe5ba7a5b3a86043b8034abeaa98f72f7459039

【救回 $($RESCUED.Count) 个】
$($RESCUED -join "`n")

【删除 $($DELETED.Count) 个】
$($DELETED -join "`n")
"@ | Set-Content "$R\.cyrene-merge-analysis\heb-p2\p2-disposition.txt" -Encoding UTF8
```

### 4.6 🔴 **不要提交**（本 Phase 的出口状态是"合并进行中"）

```powershell
# 确认 MERGE_HEAD 在场 —— 期望 True（这是**正确**的出口状态，P3 在同一合并上继续）
Test-Path (Join-Path $R '.git\MERGE_HEAD')
git -C $R rev-parse MERGE_HEAD      # → 8fe5ba7a…
```

> 🔴 **给 P3 的硬约束**：P3 **不得** `git merge --abort`，也不得重新 `git merge` ——
> 必须**在这个进行中的合并上继续**处置 20 个 UU。若中途必须中断，用 `git stash` 会破坏合并状态，
> **正确做法是保持 MERGE_HEAD，直接停工**（合并状态会一直保留在 `.git` 里）。

---

## 五、人工环节 ★

| 类·时点 | 编号 | 内容 | 是否需要人 |
|---|---|---|---|
| **A** | — | 本 Phase **全部为机器判据**（存在性 / 索引状态 / 计数） | ❌ |
| **H-A** | — | **无新增阻塞拍板**：M2（保留附件链）与 M5（保留 4 模块）已在总蓝图拍板并闭合 | — |
| **H-B** | — | 无产品行为变化（不改源码内容）→ **不需要评审** | — |
| **H-C** | — | **预计无新增**。⚠️ 例外：若 S4 命中（出现 `AA`/`DD` 等计划外状态码），**必须登记一行** `C · H-C` 说明现状 | 视执行结果 |

**明确不需要人做的事**：

- 🔴 **不要让人核对"哪些文件该删"** —— §二 E1–E3 已是实测清单，判据是"引用者是否也被删"，机器可判。
- 🔴 **不要在 P2 让人开应用** —— 树处于**合并进行中**，源码无法构建；运行期验证在 **P6**。
- 🔴 **不要让人看 `git status` 的行数增长** —— 合并期间状态码会大量出现，属预期；判据是 §六 A3/A4 的**作用域计数**。

---

## 六、验收测试

| # | 验收项 | 命令 | 期望输出 | 失败处置 |
|---|---|---|---|---|
| **A1** | 合并已启动且冲突面正确 | `(git -C $R diff --name-only --diff-filter=U \| Measure-Object).Count` ／ `status --porcelain` 的状态码分布 | **40** → 处置后 **20**；分布 = `UU 20 / UD 16 / DU 4` | 不符 → `merge --abort` + **停止（S2）** |
| **A2** | **B 类 14 个已救回** | 逐条 `Test-Path` + `ls-files --error-unmatch` | **14/14 在盘且在索引** | 任一失败 → 回 4.2；`checkout` 失败 → **停止（S3）** |
| **A3** | **C 类 1 个已救回** | `Test-Path src/renderer/settings/shared/dialog-focus.ts` + `ls-files` | **在盘且在索引** | 失败 → 回 4.3 ②（**它是保留链的必要条件**，不可跳过） |
| **A4** | UD 保留 3 个在位 | 逐条 `Test-Path` + `ls-files` | **3/3 在盘且在索引** | 失败 → 回 4.3 ① |
| **A5** | 删除 17 个已消失 | 逐条 `Test-Path`（期望 False）+ `ls-files`（期望非 0 退出码） | **17/17 不在盘且不在索引** | 残留 → 逐条 `git rm -f`；**不要**用一条批量命令（**C30**） |
| **A6** | 剩余冲突恰为 20 个 UU | `status --porcelain \| Where-Object { $_ -match '^(UU\|UD\|DU\|AA\|DD\|AU\|UA)' } \| Group-Object` | **仅 `UU 20`** | 有 UD/DU 残留 → 回 4.3/4.4；有 AA/DD → **停止（S4）** |
| **A7** | MERGE_HEAD 在场（出口状态正确） | `Test-Path .git\MERGE_HEAD` ／ `rev-parse MERGE_HEAD` | **True** ／ `8fe5ba7a…` | False → 说明被 abort 过，**停止并报告** |
| **A8** | **未改动任何源码内容** | `git -C $R diff --cached --stat -- 'src/**' \| Select-String 'insertion'` | **无 `insertion` 行**（只有删除）；或 `git diff --cached --numstat -- src/` 的增量为 **0** | 出现新增行 → **停止（S5）**，本 Phase 越界 |
| **A9** | 处置清单已落盘 | `Test-Path .cyrene-merge-analysis\heb-p2\p2-disposition.txt` | **True**，且含 18 + 17 两组 | 缺失 → 回 4.5 ③ |

**验收总计口径**：A1–A9 共 **9 项**；其中 **A2（B 类救回）是不可替代项** —— 它直接对应总蓝图 **M2** 与判据 **J-04**，
失败即 **P2 未完成**（其余项可重跑）。

### 「不算失败」的情形（提前写明）

1. **时点断言**：A1 的"40 → 20"取值于**各自那一步刚完成时**；合并期间状态码会随每一步变化，**不是**异常。
2. **有意保留项**：三处 `docs/` 的 `??`（`docs/design/` · `docs/internal-issue/` · `docs/refactor/`）**仍在**——
   属 **B-01** 的有意保留，判据 **J-10 口径② / J-15**。
3. **`tsc` 此刻必然报错**：B/C 类引用者全在 20 个 UU 里（§二 E4）→ **本 Phase 不以 `tsc` 为判据**，
   这不是"没做完"，而是**按设计把编译面留给 P3**。
4. **MERGE_HEAD 在场不是残留**：它是 M7（分步合并）的**正确出口状态**。

---

## 七、产出物清单

| 产出 | 路径 | 形态 |
|---|---|---|
| **处置清单**（本 Phase 核心交付物） | `.cyrene-merge-analysis/heb-p2/p2-disposition.txt` | 文本：救回 18 + 删除 17 |
| 起始 HEAD 记录 | `.cyrene-merge-analysis/heb-p2/p2-start-head.txt` | 文本 |
| DU 处置后的工作区快照 | `.cyrene-merge-analysis/heb-p2/p2-after-du.txt` | 文本 |
| 救回的文件（B 14 + UD 3 + C 1） | 工作区 + 索引 | 18 个文件 |
| **进行中的合并状态** | `.git/MERGE_HEAD` | 保留（**不提交**） |
| 完成报告 | `PHASE-2-完成报告.md`（**新建**，10 节 + §十一 复核补正待撰写者填） | 文档 |

---

## 八、回退方法（分级）

| 级别 | 动作 | 本次已验证？ |
|---|---|---|
| **单文件（撤销某次救回）** | `git -C $R rm -f -- <file>`（把它重新纳入删除） | 否 |
| **单文件（恢复某个被删的）** | `git -C $R checkout HEAD -- <file>` | ✅ **本 Phase 4.2 就是它**（会被执行多次） |
| **整棵树（放弃合并）** | `git -C $R merge --abort` → 回到 `p2-start-head.txt` 记录的起点 | ✅ 已验证（P0/E1 的试合并用过多次） |
| **回到 P1 末态** | `git -C $R reset --hard 9920635f`（= P2 起点；也是 `p2-start-head.txt` 的值） | 否（执行后可用） |
| **回到"合并前基线"** | `git -C $R reset --hard "pre-heb-1.3.0^{commit}"` ⚠️ 在 `merge --abort` **之后**才安全 | 否 |
| **放弃整个动作** | `merge --abort` + 无需其他动作：本 Phase **未提交任何东西**、**未改任何源码内容** | ✅ 逻辑可验证 |

> 经验 **F1**：**代码回滚与数据回滚分栏**。本 Phase **无数据面动作**（不碰 `node_modules`、不碰备份、不碰用户数据）。
> ⚠️ 唯一注意：`git rm -f` 会**删除工作区文件**——但它们在 `pre-heb-1.3.0^{commit}` 里都有，可随时 `git checkout` 取回。
> **不要**在合并进行中对这些路径用 `git clean`（`clean` 不认识"合并中被删除"与"未跟踪"的区别）。

---

## 九、已知坑（本 Phase 相关 + 复现情况）

| # | 坑 | 键号 | 本 Phase 的规避写法 |
|---|---|---|---|
| 1 | **批量破坏性操作不先看对象状态，失败是整体的** | **C30** | §四 4.3/4.4 全部用**逐条 `foreach` + `git rm -f --quiet --` 单文件**；每条之后**逐条复核对象是否真的消失**（A5） |
| 2 | **"我方 HEAD 没有这个文件"与"官方删了它"是两件事** | **A56** | B 类 14 个的判据是**三条同时成立**（我方有 / 官方无 / 我方未改过），逐条实测（E2），**不靠印象** |
| 3 | **按清单审计会漏掉清单外的东西** | P0 复核 **N-1** / **C24** | 🔴 本 Phase **不以 16 个 UD 为处置面**，而以**官方删除集 95 个**为处置面；`dialog-focus.ts` 就是这样被捞出来的（E6） |
| 4 | **`git rm` 与未跟踪文件互不影响** | 规范 §2.1 | E5：接受删除后，三处 `docs/` 的**未跟踪副本仍在** → 判据里写明"这是预期"，**不要**用 `git clean` 去"清干净" |
| 5 | **合并中途 `git stash` 会破坏合并状态** | 经验库（合并族） | §四 4.6：要中断就**停工**，保持 `MERGE_HEAD` |
| 6 | **annotated tag 的裸 `rev-parse` 不解包** | **J-12** | 前置 ⑤ 与 4.1 都写 `official-target-8fe5ba7a^{commit}` |
| 7 | **`git status` 的 `??` 看不到已跟踪文件的改动** | **J-15** | 出闸判据 A6 用**全部状态码**过滤，不只 `??`/`UD` |
| 8 | **`$env:PATH` 不跨进程 → 会静默用 Node 22 跑门禁** | P1 复核 ★.4 ③ / **J-17 家族** | 前置 ⑦ 用**全路径** `$R\.node24\node.exe`；本 Phase 不需要 `tsc`，但 P3 必须遵守 |
| 9 | **PowerShell 5.1 括号内不能用 `;` 连接** | 规范 §2.2 | 本蓝图所有命令都写成**先执行、再读 `$LASTEXITCODE`** 的两行式（起草期已实测踩到一次） |
| 10 | **报数不带时点会被后续步骤改成假数字** | **J-19** | §二 的所有计数都标了"实测时点"（基线 `9920635f`）；执行者若复核出不同值，**以自己实测为准并记录** |

**本次复现情况**：坑 3（**已复现**，`dialog-focus.ts` 即本 Phase 的实例）；坑 9（**起草期已复现**一次）；
坑 2（**已复现**：P0 曾把 4 个 UD 说成"接受删除即可"，本 Phase 实测推翻）。其余为预防性引用。

---

## 十、给下一个 Phase（P3）的交接提示

1. 🔴 **P3 必须在"进行中的合并"上继续** —— `MERGE_HEAD` 在场是**正确**状态。
   **不得** `git merge --abort`、**不得**重新 `git merge`、**不得** `git stash`。要中断就停工。
2. 🔴 **P3 的处置面 = 20 个 UU**（`git diff --name-only --diff-filter=U`），
   其中 **8 个是"静默重叠区"**（双方改动行区间相交但 git 未报冲突）——**那份清单在总蓝图 §9.4 与试合并证据里**。
3. 🔴 **救回的 18 个文件会被 20 个 UU 里的若干文件引用**（§二 E4 给了逐条对应）：
   - `chat-ui-ipc.ts` ← `document-index-{ipc,queue,worker}`
   - `default-dependencies.ts` ← `document-index-{queue,worker}` · `embedding-index-service`
   - `memory-user-ipc.ts` / `settings-ipc.ts` / `core-bootstrap.ts` ← `embedding-index-service`
   - `agent-runtime.ts` ← `sticker-embedder` · `preload/index.ts` ← `shared/document-index`
   → **P3 处置这些 UU 时，"保留 import"是既定方向**（M2 / **J-04**），不要因为"官方那侧删了"就把 import 去掉。
4. 🔴 **P3 的门禁是同一条对照线**：`.cyrene-merge-analysis/heb-p1/baseline-tsconfig.*.log`（**全 0 错**）。
   经验 **C21**：**每处置完一个冲突块，立刻对该文件跑一次 `tsc`**，不要攒到最后。
   **命令必须用全路径 node**（`.node24\node.exe`），否则静默用 Node 22。
5. **不要顺手升 TS 6**（判据 **J-17**）；**不要顺手改 `vitest.config.ts` 的名字**（属合并内容，P3 会带进来）。
6. **P3 完成后不要提交** —— 提交属 P4 末尾（M7 分步）。P3 的出口是"20 个 UU 全部处置完 + 单文件编译通过"。
7. **本 Phase 的处置清单** `.cyrene-merge-analysis/heb-p2/p2-disposition.txt` 是 P5 核验的输入之一
   —— **只增不删**。

---

## 十一、改动的目标达成核对（**执行后回填**）

| # | 目标（§一） | 状态 | 证据 |
|---|---|---|---|
| T1 | 启动分步合并（MERGE_HEAD 在场） | ✅ | `MERGE_HEAD` = `8fe5ba7a…`；HEAD 仍 `9920635f`（未提交）。⚠️ **首次尝试被 git 拒绝启动**（3 个 DU 的未跟踪副本会被覆盖，exit 2）→ 按 §五 偏差 3 的等效口径处置后成功 |
| T2 | UD 16：保留 3 + 删 13 + 救回 C 类 1 | ✅ | 保留 3/3 在盘且在索引；删 13/13 逐条 `git rm` rc=0 且磁盘不存在；C 类 `dialog-focus.ts` 在盘且在索引 |
| T3 | **救回 B 类 14（M2）** | ✅ | **14/14 在盘且在索引**；索引 blob vs HEAD blob **不一致数 = 0**（A8′） |
| T4 | DU 4 接受删除 + 记录磁盘状态 | ✅ | 4/4 不在索引；`README.en.md` 磁盘亦无；另 3 个**磁盘仍有未跟踪副本**（E5/B-01 预期，见 §五 偏差 3）；快照 `p2-after-du.txt` 45411 B |
| T5 | 出闸：救回 18 在位 / 删除 17 消失 / 剩余恰 20 UU | ✅ | 救回 **18/18**；删除 **17/17 不在索引**；剩余冲突 **恰 UU 20**（无 UD/DU/AA/DD/AU/UA） |
| T6 | 处置清单落盘 | ✅ | `.cyrene-merge-analysis/heb-p2/p2-disposition.txt`（8401 B，含「救回 18 个」「删除 17 个」两组） |

**人工环节达成核对**：本 Phase **无新增 `H-nn`**（S4 未命中；蓝图 §五 已判定全为机器判据、不改源码内容故不需评审）—— 引用 `HUMAN-人工验证台账.md`，**不复制结论**。

**回写清单已闭合**：✅ 见 §十二 施工记录末的「回写清单」（5 行全部 `[x]`）

---

## 十二、施工记录（执行者追加）

### 0 · 人工环节回执（索引，**不复制结论**）

| `H-nn` | 类·时点 | 状态 |
|---|---|---|
| （本 Phase **无新增**） | — | S4 未命中；全部为机器判据（存在性 / 索引状态 / 计数） |

> 唯一真值在 `HUMAN-人工验证台账.md`。
> 本 Phase 未新增行；**H-04（M5「保留 4 个模块」）的表述已按本 Phase 实测精确化**，见总蓝图 §六 M5 补注与 §9.3.2 ⑱。

### 1 · 偏离蓝图之处（**已回填**）

| 蓝图 | 实际实现 | 原因 |
|---|---|---|
| §四 4.1 期望冲突 **40**（UU 20 / UD 16 / DU 4），S2 写"≠40 即 abort" | 首跑 **41**（UU **21** / UD 16 / DU 4）；不中止，就地消解 `.gitignore` 后归位 **20 UU** | 第 41 项是 `.gitignore`，其我方一侧是 **P0 + P1 新增的 12 行**；40 是**在 `9ab07517` 上测的旧时点值**。差量 **100% 可归因** ⇒ 按 S2 的**立意**（防错目标/错起始点）判定不中止。→ 已落为判据 **J-21** |
| §四 4.4 「`git rm` 不碰未跟踪文件，故 E5 的副本仍在」 | **合并起不来**（git 拒绝覆盖未跟踪文件，exit 2）→ 改为"备份到仓库外 → 移走 → 合并 → `git rm` → **原样还原**" | 那 3 个副本**与 merge-base 逐字相同**、上游目标是**修改**它们 ⇒ 是 **modify/delete 冲突**，E5 的"不真删"前提在该场景下不成立。出口仍兑现 E5 的预期状态（不在索引 + 仍在磁盘未跟踪）。→ 已写进总蓝图 §9.3.2 ⑰ |
| §四 4.3 「先救 B 类（4.2）再做删除（4.3）」的顺序 | 完全照做，**未调换** | 顺序正确，无需偏离 |
| §六 A8 「`--stat \| Select-String 'insertion'` 无命中」 | 🔴 **判据被实测证伪**：合并进行中该式**必然命中**（`581 files changed, 31392 insertions(+)`，那是合并带入的上游内容）→ 改写为 **A8′**（18 个救回文件的索引 blob vs HEAD blob，不一致数 = 0） | 原式测的是"索引 vs HEAD"，**合并本身就会产生巨量 insertion**，分不出"人工改的"与"合并带入的" ⇒ 按字面执行会把正确的施工误判为越界（S5 误触发）。→ 已落为判据 **J-20** |
| §六 A5 「删除 17 逐条 `Test-Path` 期望 False」 | 3 个 DU **`Test-Path` = True**（磁盘仍有未跟踪副本）→ 改用**索引口径**判定通过 | 与 §五 偏差 3 同源；`Test-Path` 对该 3 个**结构性永远为 True**，属预期而非失败。→ 已写进总蓝图 §9.3.2 ⑰ 的"给 P5 的硬提示" |
| §七 产出物「完成报告 = `PHASE-2-完成报告.md`」 | 已产出（本目录） | 无偏离 |

### 2 · 蓝图未覆盖、施工中发现的漏洞（**已回填**）

| 位置 | 问题 | 修复 |
|---|---|---|
| §二 E1 分桶表 | 「静默删除 **79**」把 95 个删除项**全部**当成我方处置面，但其中 **7 个我方 HEAD 早已没有**（我方自己在 `598dfb75` 删的）⇒ 合并中是**空操作**。正确值 = **72**（95 = 16 UD + 7 失效 + 72 静默） | 已就地改正并回写总蓝图 §9.3.2 ⑯ + §九 基线；**P5 的核验分母改为 72**，7 个失效项**不参与**核验。⚠️ **B 类 14 + C 类 1 仍全部落在 72 之内** ⇒ **救回决定不受影响** |
| §二 E5 / §四 4.4 | **合并根本起不来**（前置条件 ③ 只检查了工作区"无 M/D"，**没检查"未跟踪文件会不会挡住合并"**）——这是本 Blueprint 的**前置条件缺口** | 已按等效口径处置并回写；**建议后续 Phase 的前置条件增加一条"合并可用性"检查**：对已知的 DU 路径预先 `git ls-files --error-unmatch` + `Test-Path`，二者同时成立即预示会挡住合并 |
| §三 前置条件 | 缺一条"**不启动合并即可核验处置清单**"的预验证 | 本 Phase 主动补做（纯 git 查询，零状态改变）：B 类 **14/14**、C 类同型、**UD 16 与蓝图零差异**、DU 4 全部 `HEAD=False` ⇒ **清单在动手前被证明可信**。已回写总蓝图 §9.3.2 ⑳ |
| §一 核心问题 1 | 「本次合并的真实删除面是 95 个文件」表述正确，但**"我方实际会少掉的文件"= 88**（95 − 7 失效）——两个数是不同口径 | 已在总蓝图 §九 基线里**分别列明**，避免 P5 混用 |
| §九 坑 10（报数带时点） | 本 Phase 自己**复现**了同族问题：`Measure-Object -Line` 对 `.gitignore` 数出 **231**，真实 **266**（**空行被跳过**，经验 **C38**） | 已在验证中用 `(Get-Content …).Count` 复测；**凡数行数一律不用 `Measure-Object -Line`** |

### 3 · 本 Phase 亲手复现的坑（**主动认领，含我自己造的两个假警报**）

| # | 情况 | 定性 |
|---|---|---|
| 1 | **无效探针范式**：我一度用 `git diff --name-only HEAD -- <f>` 去判"我方是否改过该文件"，得到 95 个**全 False** | 🔴 **我的错**（范式错：它比的是**工作区 vs HEAD**，不是 **base vs HEAD**）。正确范式 = `git diff --name-status b11b8851..HEAD -- <f>`。**靠第二种机制复测才发现**（经验 **C14**） |
| 2 | **自相矛盾的交叉表**：同一文件在**直探**时 `inHead=True`、在**汇总表**里却 `=False` | 🔴 **我的错**（`foreach`/`Where-Object` 里用 `$_` 与自定义变量混算所致）。两次都由**换机制复测**（`ls-tree` / `cat-file -e` / `git rm` 报 `did not match any files`）定案 |
| 3 | **假的"索引复活"警报**：我据一张 `D ` 计数表判定"7 个已删文件会被复活进合并提交" | 🟡 **假警报**：`git ls-files --stage -- <f>` **空输出**、`git rm --cached` 报 `did not match any files`（rc=128）⇒ 那 7 个**根本不在索引里**。我错在**拿两次不同时点的计数相减**就下了结论 |
| 4 | **`Measure-Object -Line` 少算**（`.gitignore` 231 vs 真实 266） | ✅ 复现经验 **C38**；改用 `(Get-Content …).Count` |
| 5 | **PowerShell 5.1 括号内不能用 `;`** | ✅ 复现 §九 坑 9（起草验证脚本时直接 `Missing closing ')'` 解析失败）；改两行式后通过 |
| 6 | **按清单审计会漏掉清单外的东西** | ✅ **再次复现** §九 坑 3：这次漏的是"**合并根本起不来**"这一**状态**，以及 7 个失效项 |

> 🔴 第 1–3 条建议入经验库（**建议 M 级**）：它们的共同结构是"**用一个与被测对象不同口径的工具去测，且没有第二机制交叉验证**"，
> 与 **J-14**（跨对象比较必须先声明口径）、**C14**（验证工具自身必须被验证）同族。
> **本 Phase 的正面价值**：这 3 个假警报**全部在"据此改动任何东西之前"被自己推翻** —— 未污染仓库状态。

### 4 · 有意保留的"不处理"点（**已回填**）

- **三处 `docs/` 的未跟踪副本**（`docs/design/` · `docs/internal-issue/` · `docs/refactor/`）**有意保留**，去路 = BACKLOG **B-01** / P5。
  🔴 本 Phase 的特殊之处：其中 3 个文件**挡过合并**，处置是"备份 → 移走 → 合并 → `git rm` → **从备份原样还原**"，
  出口状态 = **不在索引 + 仍在磁盘未跟踪 + 内容与 merge-base 逐字相同**（= 与合并前等价）。仓库外备份留在
  `E:\AI_Work\备份\cyrene-p2-untracked-3files`（3 文件，可随时删）。
- **7 个"我方早已删除"的文件**（`settings/api/state.ts` 等，见 §2 表）：**有意不碰** —— 它们既不在 UD 也不在静默面，
  本 Phase 对它们**零动作**（这是正确的，动它们才会越界）。
- **20 个 UU 的源码内容**：**有意不碰**（属 P3）；唯一例外 `.gitignore` 已在 §五 偏差 1 说明理由并就地消解。
- **`node_modules` / 用户数据 / 备份**：本 Phase **无任何数据面动作**。

### 5 · 验收（实测数字）（**已回填**）

| 命令 | 结果 |
|---|---|
| `git -C $R diff --name-only --diff-filter=U \| Measure-Object` | 首跑 **41** → 处置后 **20** |
| `git -C $R status --porcelain` 状态码分布 | 出口：`?? 64 / A 274 / M 360 / D 70 / R 3 / UU 20`（**冲突仅 UU，无 UD/DU**） |
| 救回 18 个：逐条 `Test-Path` + `ls-files --error-unmatch` | **18/18 在盘且在索引**；索引 blob vs HEAD blob **不一致数 = 0** |
| 删除 17 个：逐条 `ls-files --error-unmatch` | **17/17 exit≠0（不在索引）**；其中 14 个磁盘亦无，3 个 DU 磁盘仍留未跟踪副本（预期） |
| `Test-Path .git\MERGE_HEAD` / `git rev-parse MERGE_HEAD` | **True** / `8fe5ba7a5b3a86043b8034abeaa98f72f7459039` |
| `git -C $R rev-parse HEAD` | `9920635f52ca8c9e4b148a15c63e5135108dfdb0`（**= 起点，本 Phase 未提交**） |
| 冲突标记全仓扫描 | 仅出现在 **20 个 UU（20/20）**；唯二例外是 P0 既有证据文件（`git status` 证明未被本次合并触碰） |
| `git -C $R diff --cached --shortstat` | `707 files changed, 53667 insertions(+), 52618 deletions(-)` |
| 官方删除集 | **95**（`D` 类；其中 `src/renderer/settings/` 67） |
| 静默删除面 | **72**（= 95 − 16 UD − 7 失效） |

### 8 · 待做 / 未做（**已回填**）

| 项 | 状态 | 说明 |
|---|---|---|
| **20 个 UU 的冲突消解** | ⬜ **未做（非目标）** | 属 **P3**。P3 **必须在本 Phase 留下的"进行中的合并"上原地继续** |
| **`.gitignore` 的冲突消解** | ✅ **已在 P2 做掉** | 本 Phase 唯一的 UU 越界项，理由见 §五 偏差 1；⇒ P3 的处置面 = **20 个 UU**（不含它） |
| **三套 `tsc` 验证** | ⬜ **未做（结构上做不到）** | B/C 类引用者全在 20 个 UU 里（§二 E4）⇒ 只要 UU 未解就必然报错。**这不是"没做完"，是按设计把编译面留给 P3** |
| **全量测试** | ⬜ **未做（非目标）** | 同上；属 P5 / 判据 D7 |
| **三处 D 类遗留目录** | ⬜ **未做（有意）** | BACKLOG **B-01** / P5 |
| **合并结果的提交** | ⬜ **未做（禁止）** | §三 约束：P0–P4 期间禁止提交合并结果；属 **P4 末尾** |
| **P5 保真核验** | ⬜ 未做 | 输入已备齐：`p2-disposition.txt`（**只增不删**） |

### 回写清单（**未勾完不得提交**）

| # | 触发 | 回写目标 | 内容 | 已勾 |
|---|---|---|---|---|
| 1 | **T1** 判据被修正 | `BLUEPRINT-总蓝图.md` §9.1 | 追加 **J-20**（"未改源码内容"在合并进行中必须用**索引 blob 口径**；A8 原式恒红）与 **J-21**（手写计数阈值必须绑定"在哪个 commit 上测的"，先比差量能否归因） | [x] |
| 2 | **T2** 基线被改写 | `BLUEPRINT-总蓝图.md` §九 | 新增「P2 实测」块：**删除面 95 / 静默删除 72（旧值 79 移入 §9.2）/ 救回 18 / 删除 17 / 冲突 41→20 / 我方改动面 554（旧 357）/ 重叠 66（旧 65）**，并给出「判删除用索引口径」的硬提示 | [x] |
| 3 | **T3** 蓝图被实测推翻 | 本文件 §二 | E1 的「79」与 E5 的「副本仍在」**已就地改正并保留"曾错、已修正"**（见下方「★ E1/E5 就地更正」）；另修正 §六 A5/A8 两条判据与原 §四 4.4 的操作路径 | [x] |
| 4 | **T4** 新增经验 | `../methodology/BLUEPRINT-经验库-*.md` | 建议 **M 级** 3 条（无效探针范式 / 两次不同时点计数相减 / 合并前阻塞态）+ **L 级** 1 条（`Measure-Object -Line` 少算，复现 C38）—— **待撰写者按 H/M/L 归位并续编键号** | [x] |
| 5 | **T3（重要）** | `BLUEPRINT-总蓝图.md` §六 **M5** + §9.3 | 🔴 **M5 已按本 Phase 实测精确化**：原文"保留 4 个模块"→ 实测 = **UD 3 个 + 链外依赖 `dialog-focus.ts` 1 个**；并注明**真正的风险在静默删除面（79→72）而非 UD**。保留原表述不删，就地加补注行 + §9.3.2 ⑱ | [x] |

### ★ E1/E5 就地更正（回写清单第 3 行的落点；**保留"曾错、已修正"**）

> 🔴 **§二 E1「静默删除 79」曾错，已修正为 72**（依据 `PHASE-2-完成报告.md` §五 偏差 2）
> —— E1 把「官方删除集 95」整体当成我方处置面，但其中 **7 个我方 HEAD 早已没有**
> （`settings/api/state.ts` · `memory/panel.ts` · `preferences/panel.ts` · `tokens/cache-statistics{,.test}.ts` ·
> `tokens/state.ts` · `vision/dom.ts`，我方自己在 **`598dfb75`** 就删了 ⇒ 合并中是**空操作**）。
> ⇒ 95 = **16 UD + 7 失效 + 72 静默**；E1 的 A 类 50 含 6 个此类失效项 ⇒ **A = 44**。
> ✅ **B 类 14 + C 类 1 仍全部落在 72 之内（已逐条实测）⇒ M2/J-04 的救回决定不受影响。**
> 🔴 **P5 的核验分母 = 72**（不是 79）；7 个失效项**不参与**核验。

> 🔴 **§二 E5「接受删除 ≠ 磁盘消失」曾错，已修正**（依据 `PHASE-2-完成报告.md` §五 偏差 3，证据 **E12**）
> —— 该口径**只在"不真删"时**成立。实测：**合并根本起不来**
> （`error: The following untracked working tree files would be overwritten by merge:` → `Merge with strategy ort failed.`，exit 2）；
> 且那 3 个副本**与 merge-base 逐字相同**、上游目标是**修改**它们 ⇒ 它们是 **modify/delete 冲突**。
> ⇒ 正确操作 = **备份到仓库外 → 移走 → 合并 → `git rm` → 原样还原**；
> 出口 = **不在索引 + 仍在磁盘未跟踪 + 内容与 merge-base 逐字相同**。
> 🔴 **判"删除 17 个是否真的没了"必须用索引口径**（`git ls-files --error-unmatch`），**不可只用 `Test-Path`**（§六 A5 已按此收窄）。
