# Phase 0 完成报告：提交收口与锚点

> **状态**：✅ 已完成
> **执行日期**：2026-10-04
> **执行者**：agent（无对话历史，仅凭 `PHASE-0-提交收口与锚点.md` + `BLUEPRINT-总蓝图.md` 两份）
> **结论**：21 条未跟踪项**逐条归类完毕（未归类 = 0）**，一次提交 `6871f1f4`（**188 文件 / +79893 行 / 12.78 MB**）；
> 打两个 annotated 锚点 `pre-heb-1.3.0` / `official-target-8fe5ba7a`；`node_modules` 备份完成（132037 文件 / 2.08 GB）。
> **主判据 8 项全 PASS**，但**修正了 4 条蓝图判据**（J-10…J-13）——其中 **2 条若按蓝图字面执行会必然失败**。
> **报告规范**：见 `../methodology/BLUEPRINT-撰写规范.md` §5

## 一、执行摘要

| # | 验收项 | 结果 |
|---|---|---|
| A1 | 任务前累积改动已收口（**J-10 口径**） | ✅ **3 行** = 全部为已登记 B-01 的 D 类遗留；作用域内 **0 行** |
| A2 | 两个锚点存在且指向正确（**须 `^{commit}`**） | ✅ `pre-heb-1.3.0→6871f1f4` / `official-target-8fe5ba7a→8fe5ba7a`（**均为 annotated**） |
| A3 | 锚点的合并基点未变 | ✅ `b11b88512cf0cf6dace56b59ff9487947ef01c28` |
| A4 | 备份完整（`MATCH ✅`） | ✅ manifest 命中 `MATCH ✅`（132037 = 132037） |
| A5 | 备份规模符合实测 | ✅ 源 **132037 文件 / 2.08 GB**，与 E10 逐位一致（偏差 0%） |
| A6 | 白名单生效 | ⚠️ **判据本身写反，见 §五 偏差 3**（exit 0 而非 1；但**产出的结论不变**） |
| A7 | 提交未夹带 D 类遗留 | ✅ 0 行 |
| A8 | 合并前置四项就位 | ✅ HEAD `6871f1f4` / merge-base `b11b8851` / 目标 `8fe5ba7a` / 上游提交 **130** |

**验收总计**：8 项主判据 → PASS **7** / PASS（判据修正）**1** / FAIL **0**

## 二、最终状态（交接给 P1）

```
HEAD               = 6871f1f4   （chore(P0): 收口任务前累积改动）
branch             = master  →  origin/master (gitee) ahead 231
merge-base         = b11b88512cf0cf6dace56b59ff9487947ef01c28   （未变）
merge target       = 8fe5ba7a5b3a86043b8034abeaa98f72f7459039   （钉成 annotated tag）
上游提交数          = 130
工作区             = 仅 3 行 ??（D 类遗留，已登记 B-01）—— **无 M / 无暂存**
锚点 tag           = pre-heb-1.3.0（annotated，→ 6871f1f4）
                     official-target-8fe5ba7a（annotated，→ 8fe5ba7a）
备份               = E:\AI_Work\备份\cyrene-pre-P1-2026-10-04\  （MATCH ✅）
```

**产出物**：

| 文件 | 内容 | 规模 |
|---|---|---|
| `docs/construction/HEB-1.3.0/TASK-H1.3.0/BACKLOG-长期待办.md` | B-01…B-04（**新建**） | 4 条 |
| `docs/construction/HEB-1.3.0/TASK-H1.3.0/PHASE-0-完成报告.md` | 本文件（**新建**） | 10 节 |
| `docs/construction/HEB-1.3.0/TASK-H1.3.0/BLUEPRINT-总蓝图.md` | **回写**：§九 基线 + §9.1 J-10…J-13 + §9.3 ⑦⑧ | +4 判据 |
| `docs/construction/HEB-1.3.0/TASK-H1.3.0/HUMAN-人工验证台账.md` | **追加**：§三 Q5（P0 有意不提交三处 D 类） | +1 行 |
| `docs/construction/HEB-1.3.0/TASK-H1.3.0/PHASE-0-提交收口与锚点.md` | **回填**：§十一 目标核对 + §十二 施工记录 | 5 子节 |
| `E:\AI_Work\备份\cyrene-pre-P1-2026-10-04\` | `node_modules` + 锁文件 + `BACKUP-MANIFEST.txt` | 132037 文件 / 2.08 GB |

## 三、执行过程（含命令与实测输出）

### 3.1 前置条件 ①–⑥（不满足不得开工）

```powershell
# ① 工作区必须干净（无暂存、无修改）—— 实测 0 行 ✅
git -C $R status --porcelain | Where-Object { $_ -notmatch '^\?\?' }      # → (空)

# ② HEAD 必须仍是上一任务的结项提交
git -C $R rev-parse HEAD                                                  # → 9ab0751717406f71d1ad2a0577ec0dc1a11ecf99 ✅

# ③ 上游目标 ref 必须在位
git -C $R rev-parse refs/remotes/official/master                          # → 8fe5ba7a5b3a86043b8034abeaa98f72f7459039 ✅
git -C $R config --get-regexp '^remote\.'                                 # → 只有 remote.origin.*  ⚠️ 见 §五 偏差 6

# ④ 备份盘余量 —— 实测 254.1 GB ✅（期望 > 10 GB）
# ⑤ P10 回写清单无未勾选项 —— 实测 0 行 ✅
# ⑥ 台账无未闭合拍板 —— 实测 0 行 ✅（H-01…H-09 已 9/9 闭合）
```

**结论**：①–⑥ **全部满足**，停止条件 **S1 未触发**，准予开工。

### 3.2 §四 4.1 逐条审计（与 E2 比对）

```powershell
$now = git -C $R status --porcelain
$now.Count                                                                # → 21（与 E2 的 21 条逐条一致）
```

**实测逐条比对结论**：**21 条逐条一致，无第 22 条** → 停止条件 **S3 未触发**。
注意 `git status` 给出的是**目录级条目**（如 `?? .cyrene-merge-analysis/p10/`），
**展开后才是 187 个文件**（见 §五 偏差 1）。

### 3.3 §四 4.2 `.gitignore` 追加白名单（+2 行）

```powershell
git -C $R diff --numstat -- .gitignore                                    # → 2	0	.gitignore ✅ 只追加、未改既有行
# 追加内容（写在同一白名单区 `!dist/renderer/splash.html` 之后）：
#   # 欢迎页海报：被 src/renderer/react/features/onboarding/WelcomeGate.tsx 引用（首次运行可见），必须进 Git。
#   !dist/renderer/cyrene-welcome.png
```

**编码纪律**（蓝图未写，自行实测确认）：该文件为 **UTF-8 无 BOM + CRLF**；
写入后复验 `CRLF 240 → 242`、中文按 UTF-8 正常解码 → **未引入编码/换行污染**。

### 3.4 §四 4.3 提交（显式路径，**未用 `git add -A`**）

```powershell
git -C $R add -- .gitignore
git -C $R add -- .cyrene-merge-analysis
git -C $R add -- docs/construction
git -C $R add -- dist/renderer/cyrene-welcome.png

# 守门判据 1：暂存条数
(git -C $R -c core.quotepath=false diff --cached --name-only).Count       # → 188（蓝图期望 ≈213，见 §五 偏差 1）
# 守门判据 2：D 类 0 命中
git -C $R -c core.quotepath=false diff --cached --name-only |
  Where-Object { $_ -match 'docs/(design|internal-issue|refactor)/' }     # → 0 行 ✅
# 追加自查：E 类（计划外）0 命中 —— 每条暂存路径都属 A/B/C/.gitignore  → 0 ✅

git -C $R commit -m "chore(P0): 收口任务前累积改动（证据目录 + 施工记录 + 欢迎页海报白名单）"
# → [master 6871f1f4] 188 files changed, 79893 insertions(+)
```

### 3.5 §四 4.4 打两个锚点 tag

```powershell
git -C $R tag -a pre-heb-1.3.0 -m "合并前基线：本地 1.2.2-PLUS 收口后（HEAD 9ab07517 的树 + P0 提交）"
git -C $R tag -a official-target-8fe5ba7a 8fe5ba7a5b3a86043b8034abeaa98f72f7459039 `
  -m "本次合并目标：官方 master 8fe5ba7a（含 v1.3.0 tag + 11 提交）"
git -C $R cat-file -t pre-heb-1.3.0                                        # → tag（annotated ✅）
git -C $R cat-file -t official-target-8fe5ba7a                             # → tag（annotated ✅）
git -C $R rev-parse pre-heb-1.3.0                                          # → 016338bc…（⚠️ tag 对象 SHA，非 commit —— J-12）
git -C $R rev-parse 'pre-heb-1.3.0^{commit}'                               # → 6871f1f4…（✅ 正确取法）
git -C $R merge-base pre-heb-1.3.0 official-target-8fe5ba7a                # → b11b8851… ✅（自动解包）
```

### 3.6 §四 4.5 备份（robocopy，**判定看 FAILED / Mismatch 两列**）

```powershell
robocopy "$R\node_modules" "$BK\node_modules" /E /NFL /NDL /NJH /NP /R:2 /W:2 /LOG:"$BK\_logs\robocopy-node_modules.log"
# 源 / 目标 文件数：132037 / 132037，字节 2.08 GB / 2.08 GB → 一致性 MATCH ✅
```

**三个 lockfile 逐个 `Test-Path`（兑现 J-09）**：

| 文件 | 磁盘实测 | 处置 |
|---|---|---|
| `package.json` | ✅ 6900 B | 已备份 |
| `package-lock.json` | ✅ 877384 B | 已备份 |
| `pnpm-lock.yaml` | ❌ **不存在** | 正确地**未去找**（且**未静默跳过**：已在 manifest 与总蓝图 §九 显式记录"确认不存在"） |
| `pnpm-workspace.yaml` | ❌ **不存在** | 同上 |

## 四、验收测试逐项结果

| # | 验收项 | 期望 | 实测 | 判定 |
|---|---|---|---|---|
| A1 | 收口 | 0 行（J-10 口径） | 作用域内 0 行；全量 3 行（= 已登记 B-01） | ✅ |
| A2 | 锚点指向 | P0 提交 / `8fe5ba7a` | `6871f1f4` / `8fe5ba7a`（用 `^{commit}` 取） | ✅ |
| A3 | merge-base | `b11b8851…` | `b11b88512cf0cf6dace56b59ff9487947ef01c28` | ✅ |
| A4 | 备份完整 | 命中 `MATCH` | `MATCH ✅`（双重数字：文件数 + 字节数） | ✅ |
| A5 | 备份规模 | 132037 / ≈2.08 GB | 132037 / 2.08 GB | ✅ |
| A6 | 白名单 | exit 1 | exit **0**（判据方向写反，见 §五 偏差 3） | ⚠️ |
| A7 | 无 D 类夹带 | 0 行 | 0 行 | ✅ |
| A8 | 前置四项 | 见左 | 全部符合 | ✅ |

```text
A1  git status --porcelain | Where-Object { $_ -notmatch 'docs/(design|internal-issue|refactor)/' }  →  0 行
    剩余 3 行：
      ?? docs/design/
      ?? docs/internal-issue/
      ?? docs/refactor/
A3  b11b88512cf0cf6dace56b59ff9487947ef01c28
A8  HEAD                                  = 6871f1f41c816ed8d1fa3b82320413d9ff8eb3a1
    merge-base(HEAD, target)              = b11b88512cf0cf6dace56b59ff9487947ef01c28
    target^{commit}                       = 8fe5ba7a5b3a86043b8034abeaa98f72f7459039
    rev-list --count b11b8851..target     = 130
    rev-list --count b11b8851..HEAD       = 12（原 11 + P0 提交）
```

## 五、关键偏差与判定修正（**给后续 Phase 必读**）★

| # | 现象 | 根因（实测，非推断） | 判定 | 对后续的影响 |
|---|---|---|---|---|
| **1** | 蓝图期望暂存 **≈213**，实测 **188** | 蓝图把 **`??` 条目数（21）** 与 **文件数** 混为一谈，且 E2 表只列了 21 条中的 **18 条**（漏了 `protected-features-baseline.json` 等**早已跟踪**的同目录文件）。E2 表子目录行 **119** ＋ 单文件行 3 ＝ 122，而与 `.cyrene-merge-analysis` 相关的未跟踪文件实为 **118** —— 蓝图自身的 **212/213 无法从 E2 表推出** | **实测 188 为准**（187 新增 + 1 修改） | 🔴 **P1 不得把 213 当基线**；任何"文件数对不上"的告警都以 `git diff --cached --name-only` 为准 |
| **2** | 蓝图回写清单要求"追加 **J-09**（A1 口径）"与"追加 **J-10**（Test-Path）" | **J-09 已被总蓝图 §9.1 占用**（Test-Path，编号先行） | A1 口径改用 **J-10**；新增 **J-11 / J-12 / J-13** | 引用编号时以总蓝图 §9.1 为准 |
| **3** | A6「`check-ignore` 期望 exit 1」与 4.2「补白名单是为了保住资产」 | 实测 `dist/renderer/` **未被任何规则整体忽略** → `cyrene-welcome.png` **本来就不被忽略**。加 `!` 条目后 `check-ignore` 反而 **exit 0**（`!` 规则本身被 `-v` 报出） | **判据方向写反 + 保护机制归因错**，判据 **J-13** | ✅ **结论不变、动作不变**（该文件已正确进 git）；但 🔴 **P1+ 一律不得用 `git clean -fd`** —— `!` 拦不住它 |
| **4** | 蓝图 §六 A2/A8 用裸 `git rev-parse <tag>` 期望得 commit | 本 Phase 打的是 **annotated tag**，裸 `rev-parse` 返回 **tag 对象 SHA**（`016338bc…`） | 判据 **J-12**：必须 `<tag>^{commit}` | 🔴 **P1 起所有脚本引用锚点必须写 `^{commit}`**，否则 P1 的回退点判断会指向一个 tag 对象 |
| **5** | `.gitignore` 磁盘 blob `997b5b08` ≠ `HEAD:.gitignore` `d0138aeb`，但 `git diff` 为空 | `core.autocrlf=true`：git 比对前把 CRLF 归一化为 LF，`hash-object --path` 才是归一化哈希 | 判据 **J-11** | 🔴 后续**禁止**用裸 `hash-object` vs `HEAD:path` 判"是否改动" |
| **6** | 前置③ 用 `refs/remotes/official/master`，但该 ref 会被下次 `--fetch` 移动 | **实测本仓库根本没有 `remote.official`**（`git config` 只有 `remote.origin.*`），该 ref 是**裸远程跟踪 ref** | 蓝图的做法本身正确（已钉成 tag），但**原因要更正**：不是"防 fetch 移动"这么简单，而是**它没有配置来源、语义无保障** | ✅ 全程只用 tag `official-target-8fe5ba7a`；**不要**去掉 `^{commit}` |
| **7** | E4 把三处 `docs/` 目录定性为"上游保留、我方删除后残留的副本" | **实测更正**：`docs/design`(44) / `docs/internal-issue`(19) / `docs/refactor`(6) 在**我方 HEAD 与祖先中都存在**（`in-ancestor = 44/17/6`），**并非"上游独有"**；其中 **6 个文件内容与合并目标不同**、**2 个目标中根本没有** | 分类**不变**（仍属 D 类、仍不提交），但**定性收窄**：这 69 个文件里**混有本地独有内容**，**不是纯粹的"上游副本"** | 🔴 **P5 必须逐文件判**，不能整目录按"上游副本"处理；见 BACKLOG B-01 §二 |

## 六、已知坑的实测复现情况

| 坑（键号） | 本次是否复现 | 说明 |
|---|---|---|
| 坑 10 · 把"文档里写的文件名"当"磁盘上存在的文件"（**C22 / D15**） | ✅ **复现（第二次）** | 蓝图 §四 4.5 已按 J-09 写成"逐个 `Test-Path`"；实测 `pnpm-lock.yaml` / `pnpm-workspace.yaml` **确实不存在** → 处置正确 |
| 坑 3 · 批量破坏性操作不先看对象状态（**C30**） | ✅ **复现（判据化）** | 本 Phase **未做任何清理动作**；并进一步查明 `!` 白名单**拦不住** `git clean -fd`（**J-13**） |
| 坑 6 · 判据的作用域不等于被验对象的范围（**D29**） | ✅ **复现** | A1 的 0 行口径与"D 类不算失败"自相矛盾 → **J-10** |
| 坑 1 · 缓存/本地镜像当权威源（**D35**） | ⚠️ 未直接踩到（已登记） | 目标已钉成 tag；`.cyrene-sync-state.json` 的 `mirrorPath` 仍指向落后镜像 → **B-03** |
| 坑 8 · 验证工具自身必须被验证（**C14**） | 🔴 **本次新踩 3 次** | **J-11 / J-12 / J-13** 三条都是"判据工具本身没被验证" |
| 坑 9 · 证据文件按日期命名会互相覆盖（**C31**） | 未复现 | 备份目录名带用途 + 日期（`cyrene-pre-P1-2026-10-04`） |

**本次新踩到的坑（建议追加进经验库，§十 登记为 T4）**：

1. **「容器计数 ≠ 内容计数」**：`git status --porcelain` 的**条目数**（21）与**文件数**（187）是两个不同量纲；
   把前者的期望值写成后者的判据 → 判据必然算错（蓝图的 213）。**建议 M 级**。
2. **「annotated tag 的裸 `rev-parse` 不解包」**：`<tag>^{commit}` 才是 commit。**建议 M 级**。
3. **「`!` 白名单不是删除保护」**：判"会不会被 `git clean` 删"要用 `git clean -ndX` 干跑。**建议 M 级**。
4. **「`core.autocrlf=true` 下裸 blob 哈希不可用于判改动」**：用 `git diff` 或 `hash-object --path`。**建议 L 级**。

> 另有一条**非坑、但值得入库**的环境事实：本机 `D:\data\node\` 的 npm/pnpm **安装已损坏**
> （`Cannot find module …npm-cli.js`），且 `D:\data\node24\node.exe` **已存在** → 对 P1 是省事而非障碍（登记 **B-04**）。

## 七、回退方法（已验证可用）

| 级别 | 动作 | 本次验证 |
|---|---|---|
| **撤销 P0 提交（保留文件）** | `git reset --soft 9ab07517` → 回到"21 条未跟踪 + 已暂存"的起点 | ✅ 逻辑可验证（提交是**纯追加** + `.gitignore` 2 行） |
| **撤销 P0 提交（回到收口前树）** | `git reset --hard pre-heb-1.3.0~1` ⚠️ **必须带 `~1`** | ✅ 实测 `pre-heb-1.3.0^{commit}` = `6871f1f4`，其父 = `9ab07517` |
| **整棵树（收口后的基线）** | `git reset --hard pre-heb-1.3.0` → 即 **6871f1f4 的树**（D 类遗留**仍在磁盘上**，因它们从未被跟踪） | ✅ 实测锚点解包正确 |
| **撤销锚点** | `git tag -d pre-heb-1.3.0 official-target-8fe5ba7a` | ✅ 幂等、无副作用 |
| **撤销 `.gitignore` 那 2 行** | `git checkout pre-heb-1.3.0~1 -- .gitignore` | ✅ 实测该文件在收口前 = HEAD 版本（8127 B） |
| **数据面（备份回退）** | `robocopy "E:\AI_Work\备份\cyrene-pre-P1-2026-10-04\node_modules" "$R\node_modules" /E`（**先不加 `/PURGE`**） | 未验证（P1 出问题时才用） |

> 经验 **F1**：代码回滚与数据回滚分栏。本 Phase **无不可逆动作**（唯一的"数据面"是 4.5 的纯拷贝，不删源）。

## 八、给下一个 Phase 的交接清单

1. 🔴 **P1 第一条命令是复查 P0 出口**：
   `Select-String -Path "docs\construction\HEB-1.3.0\TASK-H1.3.0\PHASE-0-完成报告.md" -Pattern '^\|.*\[ \]'` → 期望 **0**。
2. 🔴 **合并目标只用 tag `official-target-8fe5ba7a`，且取 commit 必须写 `official-target-8fe5ba7a^{commit}`**（**J-12**）。
   不要用 `refs/remotes/official/master`（本仓库**未配置** `remote.official`，该 ref 无来源保障）。
3. 🔴 **P1 改 `package.json` / 锁文件之前，先确认 `E:\AI_Work\备份\cyrene-pre-P1-2026-10-04\BACKUP-MANIFEST.txt` 是 `MATCH ✅`。**
4. 🔴 **P1 第一步先验 `D:\data\node24\node.exe` 的版本**（`& cmd /c "D:\data\node24\node.exe -v"`）——它已存在，可能省掉装便携版；
   **但当前生效的 `D:\data\node\` 的 npm/pnpm 已损坏**（`npm-cli.js` / corepack `pnpm.js` 缺失）→ 必须先修好可用性（**B-04**）。
   Node 24 **只给本应用装**（M8），**不要**改系统 Node。
5. **P1 的验收要给出工具链基线值**（`check:main` / `check:preload` / `check:renderer` 的**初始**退出码）。
   本 Phase **未跑**任何测试/`tsc`（蓝图非目标），所以 P1 拿到的就是**首次真实基线**，无历史值可比 → 必须记录。
6. **B-03（状态文件镜像路径）留到结项时改**，P1 不要顺手改它（跨 Phase 职责）。
7. **`.cyrene-merge-analysis/**` 已是 git 跟踪目录** —— 后续往里面写证据会产生 `??`/`M`；属**纯追加**，
   但注意它**已被跟踪的 11 个文件**不算新增（见 §五 偏差 1 的量纲区分）。
8. 🔴 **三处 D 类目录（69 文件）仍在工作区且仍未被跟踪** —— 这是 **P0 的有意保留**：
   `git status` 会有 3 行 `??`，**不是异常**；去路见 **BACKLOG B-01**（P5 逐文件判定）。
   ⚠️ 其中 **67/69 个路径在合并目标里同名存在**，P2「我方删 / 上游保留」处置时**务必复查它们有没有被写回**。

## 九、Phase 0 目标达成核对

| 目标（来自蓝图 §一） | 状态 |
|---|---|
| T1 21 条逐条归类，未归类 = 0 | ✅ A 118 / B 68 / C 1 / D 69（D 登记 B-01）；**E 类 = 0** |
| T2 一次提交，`--porcelain` = 0 | ✅ 提交 `6871f1f4`（188 文件）；按 **J-10** 口径出口（作用域内 0 行） |
| T3 两个锚点 tag | ✅ `pre-heb-1.3.0` + `official-target-8fe5ba7a`（**均 annotated**） |
| T4 `node_modules` 备份 + 清单 | ✅ `MATCH ✅`，132037 文件 / 2.08 GB + `BACKUP-MANIFEST.txt` |
| T5 合并前置四项实测值入档 | ✅ 见 §四 A8 与总蓝图 §九 |

**非目标遵守情况**（逐条确认没越界）：

| 不做 | 是否越界 |
|---|---|
| 不合并、不 `git merge` | ✅ 未执行任何 merge（`merge-base` 只是只读查询） |
| 不改任何源码 | ✅ 唯一改动是 `.gitignore` +2 行；**`src/` 未被触碰** |
| 不跑测试、不跑 `tsc` | ✅ 未跑；仅读 `tsc.CMD --version` 取版本号（非门禁） |
| 不清理 `dist/` | ✅ 未做任何清理动作（`git clean` 一次都没跑） |
| 不动 `.gitignore` 既有行 | ✅ `--numstat` = `2 0`（**0 删除**） |

## 十、回写清单 ★

| 触发条件 | 回写目标 | 回写内容一句话 | 已勾选 |
|---|---|---|---|
| **T1 判据被修正** | `BLUEPRINT-总蓝图.md` §9.1 | 追加 **J-10**（A1 口径 = 作用域内 0 行 ＋ 域外逐条已登记）· **J-11**（禁用裸 blob 哈希判改动）· **J-12**（annotated tag 须 `^{commit}`）· **J-13**（`!` 白名单不是删除保护） | [x] |
| **T2 基线数值被改写** | `BLUEPRINT-总蓝图.md` §九 | ours HEAD `9ab07517` → **`6871f1f4`**（旧值保留并标注）；新增两个锚点 tag；我方提交数 11→12；ahead 230→231 | [x] |
| **T3 蓝图描述被实测推翻** | `PHASE-0-提交收口与锚点.md` §二 / 本报告 §五 | 21 条与 E2 **逐条一致**（无需改正）；但 **E4 的定性被收窄**（混有本地独有内容）、**4.2 的保护机制归因错**、**A2/A8 取 commit 写法错** → 三条全部就地记录 | [x] |
| **T4 新增一条经验** | `../methodology/BLUEPRINT-经验库-具体坑.md` | 4 条新坑（容器计数≠内容计数 / annotated tag 不解包 / `!` 非删除保护 / autocrlf 下裸哈希不可判改动）—— **待撰写者复核后按 H/M/L 归位、键号续编** | **[—]** |

> **T4 未勾的理由（必须写明，不许留空）**：经验库的**键号续编与 H/M/L 归位**属**撰写者**职责
> （规范 §5.2：执行者不自行扩写方法论包），且需先读过 `BLUEPRINT-经验库-具体坑.md` 的现有键号段位。
> 本 Phase **已把 4 条新坑写成可直接入库的形态**（见 §六），**不因 T4 未勾而阻塞 P1**。
> 其余三条 **T1 / T2 / T3 已全部勾选**。
>
> ### 本回写清单的闭合判据（**P0 新增，防判据自命中** —— 同族：台账 **J-05 / J-06 / J-07**、总蓝图 **J-10**）
>
> ```powershell
> # 期望：0 行。`已勾选` 列只有两种合法取值：[x] 已完成 ／ [—] 明确暂缓（须在下方理由里写明）
> Select-String -Path "docs\construction\HEB-1.3.0\TASK-H1.3.0\PHASE-0-完成报告.md" `
>   -Pattern '^\|.*\[ \]' -Encoding UTF8 | Where-Object { $_.LineNumber -ge 258 }
> ```
>
> **为什么不直接写"全文期望 0 行"**：本文件（以及施工蓝图 §十二、完成报告模板）**自身的正文里就含 `[ ]` 字样**
> —— 若按全文字面搜索判定，判据会**自命中恒失败**（经验 **D29**，`task-合并` 的 `未知|待定|TBD` 原式即此坑）；
> 而若为了让它变绿就把暂缓项一律改成 `[x]`，则等于**谎报撰写者已完成复核**（经验 **C14**：验证工具自身必须被验证）。
> → 正解 = **限定行号范围** ＋ 引入**第三种显式取值 `[—]`**（与台账判据 ② 用 `待预填（P6）` 化解同一类冲突）。

---

## 人工环节回执（索引，**不复制结论**）

| `H-nn` | 类·时点 | 状态 |
|---|---|---|
| H-01 … H-05 | A · H-A | ✅ 已闭合（答复原文见台账 `答复 / 结论` 列） |
| H-06 … H-09 | B · H-A | ✅ 已闭合（本 Phase 的开工门；答复原文见台账） |
| H-10 … H-14 | B/C · H-B/H-C | ⏳ 待人眼（**P6** 退出条件，不影响 P0–P5） |

- **本 Phase 无新增 H-nn**（提交与备份全部是机器判据）。
- 本 Phase 追加了 **台账 §三 Q5**（P0 有意不提交三处 D 类遗留 → 去路 B-01），属**说明**而非新增拍板。

## 十二、施工记录

见 `PHASE-0-提交收口与锚点.md` §十二（§十一 目标核对同时回填）。
