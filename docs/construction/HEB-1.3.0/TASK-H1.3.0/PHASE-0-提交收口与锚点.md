# Phase 0 施工蓝图：提交收口与锚点（含 WIP 门禁销账）

> **执行者**：agent。本文件自包含，不需要对话历史即可执行。
> **风险等级**：**低**（只做提交与备份，不改任何源码）
> **预计耗时**：**20–35 分钟**（其中 `node_modules` 备份约 10–20 分钟，取决于磁盘）
> **文档规范**：见 `../methodology/BLUEPRINT-撰写规范.md` §4（**跨目录相对路径，不写裸文件名**）
> **前置**：`BLUEPRINT-总蓝图.md` §四 的 P0 行；`HUMAN-人工验证台账.md` 的 **H-01…H-09 已全部闭合**（9/9）
> **本 Phase 不合并、不改源码、不跑测试** —— 它只负责**把工作区收拾干净并打好回退锚点**。

---

## 一、施工目标

### 核心问题（带 `file:line` 根因）

本任务开工前，工作区处于**违规状态**，且这个状态正是上一轮合并灾难的根因：

1. 🔴 **WIP 阈值门禁已触发**（规范 §2.4 / 经验 **F23**）：
   - `git status --porcelain` = **21 条**（阈值 20）→ 超 1 条
   - `git log -1 --format=%cr` = **4 天前**（阈值 3 天）→ 超 1 天
   - **F23 的实测后果**：上一轮攒了 **12 天**未提交 → **46 个冲突**，且非冲突区被三方合并按"谁改谁赢"混入双方内容，**事后无法逐笔归因**。
2. 🔴 **那 21 条是"跨任务累积碎片"，不是单一任务的产物**（实测逐条分类见 §二 E2）：
   包含 `.cyrene-merge-analysis/**` 证据目录、`docs/construction/**` 施工记录、**上一个任务遗留的三处 `docs/` 目录**、以及一个 **2.0 MB 的 `dist/` 孤儿资产**。
   直接 `git add -A` 会把**不属于本任务的变化静默混进提交**，正是经验 **C23** 与 **A51** 的现场。
3. 🔴 **`node_modules` 无备份**：P1 的 `pnpm install` 会改写它（实测 **132037 文件 / 2.08 GB**）；
   当前装的是 TS **5.9.3**，而 P1 要升到 TS **6.x** —— 没有备份就**回不到升级前**。

### 目标清单（可勾选）

- [x] **T1** 逐条审计 21 条未跟踪项，把每一条**归入三类之一**（提交 / 排除 / 单独处理），**未归类 = 0**
- [x] **T2** 把该提交的内容**一次提交**（提交信息见 §四 4.3），提交后 `--porcelain` **= 0**
      ↳ ⚠️ **实测偏离**：做成 1 个改动提交 + 若干文档提交（不写条数，见完成报告 §五 偏差 8 的**自指限制**）
- [x] **T3** 打两个锚点 tag：`pre-heb-1.3.0`（我方基线）+ `official-target-8fe5ba7a`（官方目标，抗 force-update）
- [x] **T4** 把 `node_modules` + 三个 lockfile 备份到 `E:\AI_Work\备份\`，并写**清单文件**
      ↳ 🔴 **实测更正**：磁盘上**只有 `package.json` + `package-lock.json`**；`pnpm-lock.yaml` / `pnpm-workspace.yaml`
      **不存在**（判据 **J-09** 实测确认，§九 坑 10）
- [x] **T5** 记录**合并前置四项**的实测值（HEAD / merge-base / 目标 ref / 冲突预期），写进 §十二 施工记录

### 非目标（明确不做）

| 不做 | 为什么 | 何时做 |
|---|---|---|
| **不合并**、不 `git merge` | 本 Phase 只打锚点；合并从 P2/P3 开始 | P2 起 |
| **不改任何源码** | 改源码会污染锚点，"合并前的我方基线"就不可信了 | P1 起（且仅限工具链配置） |
| **不跑测试、不跑 `tsc`** | 本机 Node 22 / TS 5.9 **不达标**，跑出来的结果不是基线而是噪声 | P1 装完 Node 24 后 |
| **不清理 `dist/`** | 它不是本 Phase 的职责；`git clean` 会误删产品资产（见 §九 坑 3） | BACKLOG（若需要） |
| **不动 `.gitignore` 的既有行** | 只允许 §四 4.2 指定的**两条新增**（否则会顺手改掉别人的规则） | 仅本 Phase 4.2 |

---

## 二、实测证据（决定本 Phase 做法，执行前请读）★

### E1 · WIP 门禁实测（2026-10-04）

```powershell
git -C E:\AI_Chating\cyrene-agent status --porcelain | Measure-Object        # → 21
git -C E:\AI_Chating\cyrene-agent log -1 --format="%h %cr %s"                # → 9ab07517 4 days ago feat(控制台): …
```
**判定**：21 > 20 且 4 > 3 → **门禁触发**，P0 是**阻塞项**，不是可选项。

### E2 · 21 条逐条审计（**本 Phase 的全部输入**）

| # | 路径 | 形态 | 规模 | 归属判定 |
|---|---|---|---|---|
| 1 | `.cyrene-merge-analysis/90-p3-conflicts-actual.txt` | file | 1.9 KB | **提交**（证据） |
| 2 | `.cyrene-merge-analysis/91-p3-silent-deletions.txt` | file | 2.3 KB | **提交**（证据） |
| 3 | `.cyrene-merge-analysis/95-p5-uu-list.txt` | file | 1.0 KB | **提交**（证据） |
| 4 | `.cyrene-merge-analysis/p10/` | dir | 11 文件 / 1510 KB | **提交**（证据；最大 `gate-fulltest.log` 715 KB） |
| 5 | `.cyrene-merge-analysis/p5/` | dir | 1 文件 / 0.7 KB | **提交** |
| 6 | `.cyrene-merge-analysis/p6/` | dir | 1 文件 / 0.4 KB | **提交** |
| 7 | `.cyrene-merge-analysis/p7/` | dir | 2 文件 / 418 KB | **提交** |
| 8 | `.cyrene-merge-analysis/p8/` | dir | 15 文件 / 1382 KB | **提交** |
| 9 | `.cyrene-merge-analysis/p85/` | dir | 1 文件 / 742 KB | **提交** |
| 10 | `.cyrene-merge-analysis/p9/` | dir | 22 文件 / 2267 KB | **提交** |
| 11 | `.cyrene-merge-analysis/p95/` | dir | 41 文件 / 4075 KB | **提交** |
| 12 | `.cyrene-merge-analysis/preserved/` | dir | 8 文件 / 203 KB | **提交** |
| 13 | `.cyrene-merge-analysis/review-final/` | dir | 10 文件 / 732 KB | **提交** |
| 14 | `.cyrene-merge-analysis/sync/` | dir | 13 文件 / 601 KB | **提交**（含本任务的 `2026-10-04-164501-报.md`） |
| 15 | 🔴 `dist/renderer/cyrene-welcome.png` | file | **1998 KB** | **提交** —— 见 E3（**是产品资产，不是构建产物**） |
| 16 | `docs/construction/HEB-1.3.0/` | dir | 13 文件 / 483 KB | **提交**（本任务的方法论包 + 两份新文档） |
| 17 | `docs/construction/合并/` | dir | — | **提交**（上一任务的 57 份施工记录；总蓝图 §八 直接引用它） |
| 18 | `docs/construction/蓝图体系结构对比.md` | file | — | **提交** |
| 19 | `docs/design/` | dir | **44 文件 / 1043 KB** | ⚠️ **遗留** —— 见 E4 |
| 20 | `docs/internal-issue/` | dir | **19 文件 / 2611 KB** | ⚠️ **遗留** —— 见 E4 |
| 21 | `docs/refactor/` | dir | 6 文件 / 112 KB | ⚠️ **遗留** —— 见 E4 |

**合计**：约 **212 个文件 / 17.8 MB**。

### E3 · `dist/renderer/cyrene-welcome.png` 的定性（**决定它是"提交"还是"排除"**）

```powershell
git -C E:\AI_Chating\cyrene-agent grep -n "cyrene-welcome" HEAD -- src
# → HEAD:src/renderer/react/features/onboarding/WelcomeGate.tsx:51:
#      <img className="cy-onboarding__poster" src={resolveAsset("cyrene-welcome.png")} … />
```
- **被源码引用** → 是**产品资产**（首次运行的欢迎页海报），不是 Vite 产物。
- `.gitignore` 第 4–23 行忽略 `dist/`，第 96–112 行**用白名单放行了 6 类**（`audio` / `avatars` / `stickers` / `icons` / `models` / `splash.html`）；
  第 51、59 行给 `build/installer/cyrene-installer-source.png` 单独写了 `!` 例外 —— **同一个仓库里已有先例**。
- **结论**：`cyrene-welcome.png` **是漏进白名单的产品资产**，按 §四 4.2 补 `!` 例外并提交。
  ⚠️ **反证**：它在 `dist/renderer/` 根下，而白名单只放行子目录与 `splash.html` —— 这正是它被漏掉的原因。

### E4 · 三处 `docs/` 目录是**上一任务的遗留**（跨任务碎片，必须单独定夺）

- `docs/design/`（44 文件）：**上游 `8fe5ba7a` 与共同祖先 `b11b8851` 都保留这个目录**，而我们本地**删过其中 4 个文件**（P2 的 4 个 DU 冲突就是它们）。
- `docs/internal-issue/`（19 文件）：上游同样保留，我们本地删过其中 1 个。
- `docs/refactor/`（6 文件）：同上，我们本地删过其中 2 个。
- **它们不是"新文件"，而是"工作区对已跟踪目录的删除被抵消后残留下来的副本"**。
- 🔴 **判定规则（本 Phase 的硬边界）**：**只接受能明确归因到"上一任务有意保留"的内容**；
  无法归因的**一律不提交**，登记进 `BACKLOG-长期待办.md` 并写明谁在什么条件下处理。
  **绝不 `git add -A` 把它们一起卷进来**（经验 **C23**：一次性提交 = 既存暂存内容 + 本次操作，而人对"既存"没有记忆）。

### 被推翻的原计划

- ❌ **原计划：`git add -A && git commit` 一把梭** —— 实测那 21 条里含**跨任务遗留的 3 个 `docs/` 目录**（69 个文件）与一个 2 MB 的 `dist/` 孤儿，一把梭会把它们静默混进"任务前基线"，**事后无法逐笔归因**（经验 **C23 / A51**）。→ 改为**逐条审计 + 只提交可归因项**（§四 4.1）。
- ❌ **原计划：`git clean -fd` 清掉 `dist/` 孤儿** —— 实测它是**被源码引用的产品资产**（E3），`clean` 会删掉它。→ 改为**补白名单并提交**。

### ✅ P0 执行期实测更正（**2026-10-04，曾错、已修正**）

> 本小节由 P0 执行者按回写清单第 3 条追加；**旧文一律保留不动**（只标注、不静默删除）。

| # | 本节（§二）原写法 | 实测更正 | 依据 |
|---|---|---|---|
| **①** | E4：三处 `docs/` 目录是"**上游 `8fe5ba7a` 与共同祖先 `b11b8851` 都保留这个目录**，而我们本地删过其中几个文件" → 暗示它们是**上游副本** | **更正（定性收窄）**：`docs/design`44 / `docs/internal-issue`19 / `docs/refactor`6 共 69 文件，**在`我方 HEAD` 与祖先里都存在**（`in-ancestor` = 44/17/6），**并非"上游独有"**。其中 **6 个文件内容与合并目标不同**、**2 个（`docs/internal-issue/2026-09-25-*`）在目标里根本不存在** → **混有本地独有内容**，**不是纯粹的"上游副本"** | P0 实测逐文件比对（见 `BACKLOG-长期待办.md` §二） |
| **②** | §四 4.2 标题与理由：「**补白名单 = 保住资产**」；§六 A6 期望 `check-ignore` **退出码 1** | **更正（判据方向 + 机制归因）**：`dist/renderer/` **未被任何规则整体忽略** → 该 png **本来就不被忽略**，加 `!` 条目**不改变任何 git 行为**（纯注释）。且加完后 `check-ignore` 返回 **0**（`!` 规则本身被 `-v` 报出），**不是 1**。<br>🔴 **更关键**：`!` 白名单**拦不住 `git clean -fd`** —— 该文件**仍会被删**。**正确结论不变**（P0 不做任何清理动作） | 判据 **J-13**；`git check-ignore -v` / `--no-index` 双路实测 |
| **③** | §四 4.3 守门判据：「暂存条数**期望 ≈213**（212 + `.gitignore`）」 | **更正（量纲混淆）**：`git status --porcelain` 的**条目数（21）是目录级**，实际文件数是 **187**；E2 表只列了 21 条中的 **18 条**（漏了 `protected-features-baseline.json` 等早已跟踪项），且其子目录行合计 **119** ≠ 实际的 118。→ **实测正确值是 188**（187 新增 + 1 修改） | P0 实测 `git diff --cached --name-only` |

> ⚠️ **给 P1 的提醒**：上面 ② 的 A6 判据**在蓝图 §六 里仍写着"期望退出码 1"** —— 那是**错的**，
> P1 若复跑 A6，**不要**据 exit 0 判定失败；正确复跑方式是 `git clean -ndX -- dist/renderer/cyrene-welcome.png`
> （**干跑**，看它会不会被清掉），而**不是**看 `check-ignore` 的退出码。

---

## 三、前置条件与停止条件

### 前置条件（可执行命令 + 期望值；不满足则**不得开始**）

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$R = "E:\AI_Chating\cyrene-agent"

# ① 工作区必须干净（无暂存、无修改）—— 期望：0 行
git -C $R status --porcelain | Where-Object { $_ -notmatch '^\?\?' }

# ② HEAD 必须仍是上一任务的结项提交 —— 期望：9ab0751717406f71d1ad2a0577ec0dc1a11ecf99
git -C $R rev-parse HEAD

# ③ 上游目标 ref 必须在位 —— 期望：8fe5ba7a5b3a86043b8034abeaa98f72f7459039
git -C $R rev-parse refs/remotes/official/master

# ④ 备份盘余量 —— 期望：可用 > 10 GB
Get-PSDrive E | Select-Object @{n='FreeGB';e={[math]::Round($_.Free/1GB,1)}}

# ⑤ 上阶段回写清单无未勾选项 —— 期望：0 行
$P10 = "E:\AI_Chating\cyrene-agent\docs\construction\合并\TASK-合并\PHASE-10-完成报告.md"
Select-String -Path $P10 -Pattern '^\|.*\[ \]' -Encoding UTF8

# ⑥ 台账无未闭合拍板 —— 期望：0 行（H-01…H-09 已全部闭合）
$L = "E:\AI_Chating\cyrene-agent\docs\construction\HEB-1.3.0\TASK-H1.3.0\HUMAN-人工验证台账.md"
Select-String -Path $L -Pattern '^\|.*\[ \]' -Encoding UTF8
```

> ⑥ 是规范 §4.1.3 的**第二条件**（每阶段开工前查两条：回写清单 + 台账拍板）。

### 停止条件（出现即**立即停止并报告**）

| # | 停止条件 | 为什么必须停 |
|---|---|---|
| S1 | 前置 ①–⑥ 任一条不满足 | 在脏工作区上打锚点 = 锚点不可信，整条回退链失效 |
| S2 | `robocopy` 汇总的 **FAILED > 0** 或 **Mismatch > 0** | 备份不完整 = P1 升级后无法回退（规范 §2.2：看这两列，**不看退出码**） |
| S3 | 审计发现**第 22 条**未跟踪项（与 E2 的 21 条对不上） | 说明工作区在审计之后又被改动过 → 清单已失效，须重新审计 |
| S4 | 任一待提交文件的体积 **> 5 MB** 且不在 E3 的判定范围内 | 可能是新产生的日志/大产物，提交进 git 会污染仓库历史 |

---

## 四、改动清单（Agent 直接执行）

> 🔴 **顺序敏感**：4.1 → 4.2 → 4.3 → 4.4 → 4.5 **不可调换**。
> 理由：先审计（4.1）才能定 `.gitignore`（4.2）；先落 `.gitignore`（4.2）才能让 4.3 的提交**恰好**包含该包含的；
> 先提交（4.3）才能让锚点（4.4）落在**干净的树**上；备份（4.5）放最后，避免它把工作区搞脏。

### 4.1 逐条审计并与 E2 清单比对

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$R = "E:\AI_Chating\cyrene-agent"

# 当前实况 —— 期望：与 §二 E2 的 21 条**逐条一致**
$now = git -C $R status --porcelain
$now.Count                                                    # 期望 21
$now | ForEach-Object { $_.Substring(3).Trim('"') }
```

**逐条判定规则（写死，不留裁量）**：

| 类别 | 判据 | 动作 |
|---|---|---|
| **A 证据** | 路径以 `.cyrene-merge-analysis/` 开头 | **提交**（P10 交接 6 明确：只增不删的证据目录，清理它 = 让核验不可复跑） |
| **B 记录** | 路径以 `docs/construction/` 开头 | **提交**（蓝图体系的输入） |
| **C 资产** | `dist/renderer/cyrene-welcome.png` | **提交**（E3 已定性） |
| **D 遗留** | `docs/design/` · `docs/internal-issue/` · `docs/refactor/` | ⚠️ **本 Phase 不提交**，登记 BACKLOG（§四 4.6） |
| **E 计划外** | 以上四类之外的任何路径 | 🔴 **停止（S3）** |

### 4.2 `.gitignore` 补一条白名单（2 行，**只追加，不改既有行**）

在 `.gitignore` 的白名单区（现第 107–112 行 `!dist/renderer/...` 之后）**追加**：

```gitignore
# 欢迎页海报：被 src/renderer/react/features/onboarding/WelcomeGate.tsx 引用（首次运行可见），必须进 Git。
!dist/renderer/cyrene-welcome.png
```

**为什么必须写在白名单区之后**：`.gitignore` 是**后写的规则生效**；写在 `dist/` 忽略规则（第 4–23 行）**之前**会被覆盖掉。
**依据**：第 51、59 行已有同型先例（`cyrene-installer-source.png`）。

**验证**：

```powershell
git -C $R check-ignore -v dist/renderer/cyrene-welcome.png   # 期望：退出码 1（= 未被忽略）
git -C $R status --porcelain -- dist/renderer/cyrene-welcome.png   # 期望：?? dist/renderer/cyrene-welcome.png
```

### 4.3 提交（**按路径显式列出，禁止 `git add -A`**）

```powershell
$R = "E:\AI_Chating\cyrene-agent"

git -C $R add -- .gitignore
git -C $R add -- .cyrene-merge-analysis
git -C $R add -- docs/construction
git -C $R add -- dist/renderer/cyrene-welcome.png

# 🔴 提交前先看暂存清单，逐条确认只含 A/B/C 三类；任何 D/E 类出现 → 停止
git -C $R diff --cached --name-status | Measure-Object        # 期望：≈213（212 + .gitignore）
git -C $R diff --cached --name-status | Where-Object { $_ -match 'docs/(design|internal-issue|refactor)/' }   # 期望：0 行

git -C $R commit -m "chore(P0): 收口任务前累积改动（证据目录 + 施工记录 + 欢迎页海报白名单）"
```

**提交信息格式**：规范 §2.4 要求 `<域>(P<n>): <做了什么>`。

### 4.4 打两个锚点 tag

```powershell
$R = "E:\AI_Chating\cyrene-agent"

# ① 我方基线锚点（回退用）
git -C $R tag -a pre-heb-1.3.0 -m "合并前基线：本地 1.2.2-PLUS 收口后（HEAD 9ab07517 的树 + P0 提交）"

# ② 官方目标锚点（把 ref 钉成 tag，抗官方 force-update / ref 漂移）
git -C $R tag -a official-target-8fe5ba7a 8fe5ba7a5b3a86043b8034abeaa98f72f7459039 -m "本次合并目标：官方 master 8fe5ba7a（含 v1.3.0 tag + 11 提交）"
```

**为什么打第二个 tag**：总蓝图 §一 说"本地克隆只是缓存"；`refs/remotes/official/master` 会被下一次 `--fetch` 移动。
把目标钉成**不可变的 tag**，才能保证整个任务全程对着**同一个 commit** 施工（经验 **D35** 的同族纪律）。

### 4.5 备份 `node_modules` + 三个 lockfile

```powershell
$R = "E:\AI_Chating\cyrene-agent"
$BK = "E:\AI_Work\备份"

# ① 目录 + 清单
New-Item -ItemType Directory -Force -Path "$BK\cyrene-pre-P1-2026-10-04" | Out-Null

# ② 整目录备份（/E 含空目录；大文件用 /J 可减少碎片，但 /J 在跨卷时可能慢，按需选）
robocopy "$R\node_modules" "$BK\cyrene-pre-P1-2026-10-04\node_modules" /E /NFL /NDL /NJH /NP /R:2 /W:2

# 🔴 判定：看汇总的 FAILED 与 Mismatch 两列，**不看退出码**（规范 §2.2）
#    期望：Dirs/Files 计数一致、FAILED = 0、Mismatch = 0

# ③ 锁文件与 package.json（小、快、是关键回退点）
#    🔴 实测更正（见 §九 坑 10）：本仓库**磁盘上只有 package-lock.json**（877384 字节，blob 05dcca09…）。
#       `pnpm-lock.yaml` / `pnpm-workspace.yaml` **从未进入我们的 HEAD**（只在官方 3470fea7 里），
#       P8 的 N6 明确「未动依赖与锁」→ 它们是 **P1 才要引入的**，本 Phase **不要去找它们**。
Copy-Item "$R\package.json"      "$BK\cyrene-pre-P1-2026-10-04\package.json"
if (Test-Path "$R\package-lock.json") { Copy-Item "$R\package-lock.json" "$BK\cyrene-pre-P1-2026-10-04\package-lock.json" }
else { Write-Host "🔴 package-lock.json 缺失 —— 停止并报告（它是当前唯一的锁文件）" }
# 存在时才拷；P1 可能已生成它们
foreach ($f in 'pnpm-lock.yaml','pnpm-workspace.yaml') {
  if (Test-Path "$R\$f") { Copy-Item "$R\$f" "$BK\cyrene-pre-P1-2026-10-04\$f" }
}

# ④ 写备份清单（含文件数与总字节，供 P1 回退时比对）
$src = Get-ChildItem "$R\node_modules" -Recurse -File | Measure-Object -Property Length -Sum
$dst = Get-ChildItem "$BK\cyrene-pre-P1-2026-10-04\node_modules" -Recurse -File | Measure-Object -Property Length -Sum
@"
备份时间      : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
源            : $R\node_modules
目标          : $BK\cyrene-pre-P1-2026-10-04\node_modules
源文件数/字节  : $($src.Count) / $($src.Sum)
目标文件数/字节: $($dst.Count) / $($dst.Sum)
一致性        : $(if ($src.Count -eq $dst.Count -and $src.Sum -eq $dst.Sum) { 'MATCH ✅' } else { 'MISMATCH 🔴 停止' })
node          : $(node -v)
tsc           : $(if (Test-Path "$R\node_modules\.bin\tsc.CMD") { & "$R\node_modules\.bin\tsc.CMD" --version } else { 'N/A' })
"@ | Set-Content "$BK\cyrene-pre-P1-2026-10-04\BACKUP-MANIFEST.txt" -Encoding UTF8
```

> **期望的源侧数字**（E2/E10 实测，供比对）：**132037 文件 / 2.08 GB**。
> ⚠️ **容差**：`node_modules` 是活目录，若在备份期间有其他进程写入，允许**目标 ≥ 源**；但**目标 < 源 → 停止（S2）**。

### 4.6 登记遗留项到 BACKLOG

新建 `../TASK-H1.3.0/BACKLOG-长期待办.md`（若不存在），加入三行（每条四字段：编号 / 内容 / 谁做 / 触发条件）：

| 编号 | 内容 | 谁做 | 触发条件 |
|---|---|---|---|
| **B-01** | `docs/design/`（44 文件）、`docs/internal-issue/`（19 文件）、`docs/refactor/`（6 文件）在工作区里未被跟踪，来源无法归因到本任务 | agent + 人 | **P5 保真核验时**逐条对照上游 `8fe5ba7a` 与本地 HEAD，判定"提交 / 忽略 / 删除"三选一 |
| **B-02** | `docs/internal-issue/perf/a1-s-streamdown-report.json` 单文件 **2.1 MB**（机器生成的基准报告） | 人 | **本次任务结项后**决定是否入 git 或用 `.gitignore` 排除 |
| **B-03** | 状态文件 `.cyrene-sync-state.json` 的 `mirrorPath` 指向落后镜像 `E:\AI_Chating\off-cyan\Cyrene-Agent`（`b11b8851`，落后 130 提交） | agent | **本任务结项时**改正为 `E:\AI_Work\Cyrene-Agent` 或删除该字段（详见 §九 坑 1） |

---

## 五、人工环节 ★

| 类·时点 | 编号 | 内容 | 期望值来源 |
|---|---|---|---|
| **A** | — | 本 Phase **无需人眼**：提交与备份全部是机器判据 | — |
| **H-A** | **H-06…H-09** | ✅ **已全部闭合**（9/9，见 `HUMAN-人工验证台账.md` §5.1） | 人已答复，agent 原样抄录 |
| **H-B** | — | 本 Phase **不需要评审**（无产品行为变化） | — |
| **H-C** | — | 本 Phase **不登记欠账**（H-10…H-14 已在台账占位，P6 处理） | — |

**本 Phase 明确不需要人做的事**（防止让人做无用功）：
🔴 **不要让人去核对 `node_modules` 的文件数** —— 那是 §四 4.5 的脚本能算的数字（规范 §4.1 纪律 1）。
🔴 **不要让人去确认提交内容** —— §四 4.3 的两条守门判据（暂存条数 + D 类 0 命中）已经覆盖。

---

## 六、验收测试

| # | 验收项 | 命令 | 期望输出 | 失败处置 |
|---|---|---|---|---|
| **A1** | 任务前累积改动已收口 | `git -C $R status --porcelain` | **0 行** | 若有残留 `??` → 回到 4.1 重新归类；**不得进入 4.4** |
| **A2** | 两个锚点存在且指向正确 | `git -C $R rev-parse pre-heb-1.3.0` / `official-target-8fe5ba7a` | 前者 = P0 提交哈希；后者 = **8fe5ba7a5b3a86043b8034abeaa98f72f7459039** | 后者不符 → 目标锚点错误，**立即停止**（整个任务对着错的 commit 施工） |
| **A3** | 锚点的合并基点未变 | `git -C $R merge-base pre-heb-1.3.0 official-target-8fe5ba7a` | **b11b88512cf0cf6dace56b59ff9487947ef01c28** | 不符 → 说明 P0 提交意外改了历史，**停止并报告** |
| **A4** | 备份完整 | `(Get-Content "$BK\cyrene-pre-P1-2026-10-04\BACKUP-MANIFEST.txt") -match 'MATCH'` | 命中 **MATCH ✅** | MISMATCH → 重跑 4.5 ②（`robocopy /E` 可增量续跑） |
| **A5** | 备份规模符合实测 | manifest 里的"源文件数/字节" | **132037 / ≈2.08 GB** | 差距 > 5% → 查是否有进程在写 `node_modules`，重备 |
| **A6** | 白名单生效 | `git -C $R check-ignore -v dist/renderer/cyrene-welcome.png` | **退出码 1**（未被忽略） | 退出码 0 → 规则位置写错，回到 4.2 |
| **A7** | 提交未夹带 D 类遗留 | `git -C $R show --stat --name-only HEAD \| Select-String 'docs/(design\|internal-issue\|refactor)/'` | **0 行** | 有命中 → `git reset --soft HEAD~1` 后回 4.3 重新 `add` |
| **A8** | 合并前置四项就位 | `git -C $R rev-parse HEAD` / `merge-base HEAD official-target-8fe5ba7a` / `rev-parse official-target-8fe5ba7a` / `rev-list --count b11b8851..official-target-8fe5ba7a` | HEAD = P0 提交；merge-base = **b11b8851**；目标 = **8fe5ba7a**；提交数 = **130** | 任一不符 → **停止**，写进施工记录并报告 |

### 「不算失败」的情形（提前写明）

1. **时点断言**：A5 的数字取值于**备份完成的那一刻**；此后 P1 的 `pnpm install` 会改变源侧 —— 那是预期的，不影响 P0 的判定。
2. **有意保留项**：`docs/design/` / `docs/internal-issue/` / `docs/refactor/` **仍出现在 `??` 列表里不算 A1 失败** ——
   🔴 **但那样 A1 就不是 0 行了**。这两条自相矛盾 → **本 Phase 的解法**：把它们登记进 BACKLOG（4.6）**并**在 `HUMAN-人工验证台账.md`
   的 §三 待拍板区加一行说明"P0 有意不提交这三处，去路 = BACKLOG B-01"；**A1 的判定口径随之改为**：
   ```powershell
   # A1'（本任务的实际口径）：排除已登记 BACKLOG 的 D 类遗留后应为 0 行
   git -C $R status --porcelain | Where-Object { $_ -notmatch 'docs/(design|internal-issue|refactor)/' }
   ```
   **这条口径修正必须同时回写 `BLUEPRINT-总蓝图.md` §9.1（判据台账），编号 J-09。**
3. **外部增长量**：`.cyrene-merge-analysis/sync/` 会因后续每次 `upstream-sync.mjs` 运行而增长 —— 本 Phase 之后的新增文件属**纯追加**，不算异常。

---

## 七、产出物清单

| 产出 | 路径 | 形态 |
|---|---|---|
| 收口提交 | 本仓库 HEAD | 1 个 commit，≈213 个文件 |
| 我方基线锚点 | tag `pre-heb-1.3.0` | annotated tag |
| 官方目标锚点 | tag `official-target-8fe5ba7a` | annotated tag |
| 备份 | `E:\AI_Work\备份\cyrene-pre-P1-2026-10-04\` | `node_modules` + 3 个 lockfile + `BACKUP-MANIFEST.txt` |
| 长期待办 | `../TASK-H1.3.0/BACKLOG-长期待办.md` | 3 条（B-01…B-03） |
| 施工记录 | 本蓝图的 §十二 | 追加 |

---

## 八、回退方法（分级）

| 级别 | 动作 | 本次已验证？ |
|---|---|---|
| **单文件** | `git -C $R checkout HEAD~1 -- <file>`（撤销 P0 提交里的某个文件） | 否（P0 提交后才可用） |
| **整棵树** | `git -C $R reset --hard pre-heb-1.3.0` ⚠️ **注意**：`pre-heb-1.3.0` 是**打在该提交上**的，所以它指向收口后的树；要回到收口**前**用 `git reset --hard pre-heb-1.3.0~1` | 否 |
| **撤销锚点** | `git -C $R tag -d pre-heb-1.3.0 official-target-8fe5ba7a` | 否（幂等、无副作用） |
| **放弃整个动作** | 提交是**纯追加**（未改任何已跟踪文件的内容除 `.gitignore` 一行）；最坏情况 `git reset --soft 9ab07517` 即回到起点，D 类遗留仍在磁盘上 | ✅ 逻辑上可验证 |
| **备份回退** | `robocopy "E:\AI_Work\备份\cyrene-pre-P1-2026-10-04\node_modules" "$R\node_modules" /E /PURGE`（`/PURGE` 会删除目标侧多余文件 → **慎用**；先跑不带 `/PURGE` 的版本） | 否（P1 出问题时才用） |

> 经验 **F1**：**代码回滚与数据回滚分两栏**。本 Phase **唯一的"数据面"动作是 4.5 的备份**（纯拷贝、不删源），
> 以及 **4.2 对 `.gitignore` 的一行追加**（有版本控制，可回退）。**无不可逆动作。**

---

## 九、已知坑（本 Phase 相关 + 复现情况）

| # | 坑 | 键号 | 本 Phase 的规避写法 |
|---|---|---|---|
| 1 | **把缓存/本地镜像当权威源，结论不带新鲜度** | **D35** | 状态文件 `.cyrene-sync-state.json` 的 `mirrorPath` 指着**落后的镜像**（`b11b8851`，落后 130 提交）。**本 Phase 不依赖该脚本**（目标已钉成 tag）；但**必须登记 B-03**，否则下一次同步又会踩 |
| 2 | **把"上界指标"当工作量** | **D36** | `RISK 746` 是**上界**，真正需人工处置的是试合并实测的 **40**。本 Phase 的 A8 只记"提交数 130"，**不把 746 写进任何工作量估计** |
| 3 | **批量破坏性操作不先看对象状态** | **C30** | 🔴 **不要用 `git clean -fd`** 清理 `dist/` —— 实测 `cyrene-welcome.png` 是**被源码引用的产品资产**（E3）。本 Phase **不做任何清理动作** |
| 4 | **一次性提交 = 既存暂存内容 + 本次操作** | **C23** | 提交前跑**两条守门判据**（§四 4.3）：暂存条数 ≈213、D 类 0 命中。**任何计划外条目 → 停** |
| 5 | **破坏性动作之前不记基线** | **A51** | 本 Phase 的 T5 就是"记基线"：把 HEAD / merge-base / 目标 / 冲突预期四项写进 §十二 |
| 6 | **判据的作用域不等于被验对象的范围** | **D29** | A1 的口径必须**排除已登记的 D 类遗留**（见 §六「不算失败」2），否则判据与任务自相矛盾（同 **J-01** 的教训） |
| 7 | **`git grep` / `git ls-files` 只看已跟踪文件** | **C24** | 本 Phase 的审计用 `git status --porcelain`（**含未跟踪**）而不是 `git grep`；E2 的逐条清单即由此产出 |
| 8 | **验证工具自身必须被验证** | **C14** | A4 的 `MATCH` 判定**同时比文件数与众数**（两个独立数字），不只比其中一个 |
| 9 | **证据文件按"日期"命名会互相覆盖** | **C31** | 备份目录名带**用途 + 日期**（`cyrene-pre-P1-2026-10-04`）；同一天再备份 → 追加 `-2` |
| 10 | 🔴 **把"文档里写的文件名"当成"磁盘上存在的文件"** | **C22 / D15** | **本次实测复现**：总蓝图 §一 曾写"备份 `package.json` + `package-lock.json` + `pnpm-lock.yaml` 三个文件"——`pnpm-lock.yaml` 是**从官方 diff 输出里误提取的**（它只存在于官方 `3470fea7`），本地磁盘**从来没有**。正解 = 备份命令对每个文件先 `Test-Path` 再拷，缺失时**明确报错而不是静默跳过**（§四 4.5 ③） |

**本次复现情况**：坑 1（**已复现**，真实踩到，见总蓝图 §九）；坑 3（**已复现**，差点误删产品资产，见 §二「被推翻的原计划」第 2 条）；其余为预防性引用。

---

## 十、给下一个 Phase（P1）的交接提示

1. 🔴 **P1 的第一条命令是复查 P0 的出口**（规范 §4.1.3 的两条前置）：
   ```powershell
   Select-String -Path "docs\construction\HEB-1.3.0\TASK-H1.3.0\PHASE-0-完成报告.md" -Pattern '^\|.*\[ \]'   # 期望 0
   ```
2. 🔴 **合并目标只用 tag `official-target-8fe5ba7a`**，不要用 `refs/remotes/official/master`（它会随 `--fetch` 移动）。
3. 🔴 **P1 改 `package.json` / lockfile 之前，先确认 `E:\AI_Work\备份\cyrene-pre-P1-2026-10-04\BACKUP-MANIFEST.txt` 是 `MATCH ✅`。**
4. **Node 24 只给本应用装**（M8）：**不要**改系统 Node；建议便携版 + 局部 PATH，并在 P1 蓝图里写明"怎么让本仓库的终端看到它"。
5. **P1 的验收要给出工具链基线值**（`check:main` / `check:preload` / `check:renderer` 的**初始**退出码）——
   没有这个基线，P3 的"每块处置后立刻 tsc"就无法判断"是不是我改坏的"。
6. **B-03（状态文件镜像路径）留到结项时改**，P1 不要顺手改它（跨 Phase 职责）。
7. **`.cyrene-merge-analysis/**` 已是 git 跟踪的目录** —— 后续往里面写证据会产生 `??`/`M`；按 §六「不算失败」3 判定，属**纯追加**。

---

## 十一、改动的目标达成核对（**执行后回填**）

| # | 目标（§一） | 状态 | 证据 |
|---|---|---|---|
| T1 | 21 条逐条归类，未归类 = 0 | ✅ | A 证据 118 文件 / B 施工记录 68 / C 资产 1 / D 遗留 69（→ BACKLOG **B-01**）；**E 类 = 0** |
| T2 | 一次提交，`--porcelain` = 0 | ✅ | 收口提交 **`6871f1f41c816ed8d1fa3b82320413d9ff8eb3a1`**（188 文件 / +79893 行 / 12.78 MB）＋ P0 自己的文档提交若干（**1 改动 + N 文档**，偏离说明见完成报告 §五 偏差 8）；按 **J-10** 口径判定出口（作用域内 0 行） |
| T3 | 两个锚点 tag | ✅ | `pre-heb-1.3.0` → `6871f1f4`（＝收口提交）；`official-target-8fe5ba7a` → `8fe5ba7a`（**均 annotated**，须用 `^{commit}` 取，**J-12**） |
| T4 | `node_modules` 备份 + 清单 | ✅ | `E:\AI_Work\备份\cyrene-pre-P1-2026-10-04\`；`BACKUP-MANIFEST.txt` = **`MATCH ✅`**（源 = 目标 = **132037 文件 / 2234681003 字节 / 2.08 GB**）；robocopy `Mismatch 0 · FAILED 0 · Extras 0` |
| T5 | 合并前置四项实测值入档 | ✅ | HEAD `7a35ad0b` / merge-base `b11b8851…` / 目标 `8fe5ba7a…` / 上游提交数 **130**（见 §十二 5） |

**人工环节达成核对**：本 Phase 无新增 H-nn；H-06…H-09 已在台账闭合（引用 §五，**不复制结论**）。
**台账追加**：§三 新增 **Q5**（P0 有意不提交三处 D 类遗留 → 去路 BACKLOG **B-01**），属**说明**而非新增拍板。

**回写清单已闭合**：✅ **T1 / T2 / T3 已勾**（见 §十二 施工记录末）；**T4 未勾且已写明理由**（经验库键号续编属**撰写者**职责，规范 §5.2）。

---

## 十二、施工记录（执行者追加）

### 0 · 人工环节回执（索引，**不复制结论**）

| H-nn | 类·时点 | 状态 |
|---|---|---|
| H-06 | B · H-A | ✅ 已闭合（分步合并 → 总蓝图 M7） |
| H-07 | B · H-A | ✅ 已闭合（目标 `8fe5ba7a` → 总蓝图 M1 改写） |
| H-08 | B · H-A | ✅ 已闭合（局部 Node 24 → 总蓝图 M8） |
| H-09 | B · H-A | ✅ 已闭合（备份到 `E:\AI_Work\备份` → 总蓝图 M9） |

> 唯一真值在 `HUMAN-人工验证台账.md` 的那四行。

### 1 · 偏离蓝图之处（**待执行者填写**）

| 蓝图 | 实际实现 | 原因 |
|---|---|---|
| §四 4.3「暂存条数**期望 ≈213**」 | 实测 **188**，并作为正式暂存条数 | 蓝图把 `git status --porcelain` 的**条目数（21，目录级）** 与**文件数（187）** 混为一谈，且 E2 表只列了 21 条中的 **18 条**（漏了 `protected-features-baseline.json` 等**早已被跟踪**的同目录文件）。**实测为准**（见 §二「P0 执行期实测更正」③） |
| §六 A6「`check-ignore -v` 期望**退出码 1**」 | 实测 **退出码 0**，且**追加前后 git 行为不变** | `dist/renderer/` **未被任何规则整体忽略** → 该 png 本来就不被忽略；`!` 条目是**纯注释**。判据方向写反 + 保护机制归因错（判据 **J-13**） |
| §六 A2/A8「`git rev-parse <tag>` 期望得到 commit」 | 改用 **`git rev-parse '<tag>^{commit}'`** | 打的是 **annotated tag**，裸 `rev-parse` 返回 **tag 对象 SHA**（`016338bc…`）。**按蓝图字面执行必然 FAIL**（判据 **J-12**） |
| §六「不算失败」2「A1 口径改为排除 D 类后为 0 行」 | 采纳，但**补第二条**：域外剩余项**必须逐条已登记 BACKLOG** | 只写"排除后为 0 行"会留下隐患：**将来可能有新的未跟踪项被"排除"掉而不被发现**。补第二条后，"剩下的 3 行"才是**可问责**的（判据 **J-10**） |
| §四 4.2「只追加 2 行」 | 采纳；**自行补做编码纪律验证** | 蓝图未写 `.gitignore` 的编码要求。实测该文件为 **UTF-8 无 BOM + CRLF**；若按 ANSI/UTF-8-BOM 写回会**污染全文件**。已复验：`CRLF 240 → 242`、中文按 UTF-8 正常解码 |
| §四 4.6「新建 `../TASK-H1.3.0/BACKLOG-长期待办.md`」 | 采纳；**登记 4 条（B-01…B-04）** | B-01…B-03 为蓝图原定；**B-04 为本 Phase 实测新增**（Node 24 可能已就位 ＋ npm/pnpm 安装已损坏），对 P1 是**可直接消费**的信息，见 §2 漏洞 5 |
| §九 坑 10「已具备入库形态：M 级」 | 采纳；另新增 3 条新坑 | 本次实测又踩到 3 条"验证工具自身没被验证"（**J-11/J-12/J-13**）→ 共 **4 条**待入库（§十二 5 与完成报告 §六） |

### 2 · 蓝图未覆盖、施工中发现的漏洞（**待填写**）

| 位置 | 问题 | 修复 |
|---|---|---|
| §四 4.5 ④ | 备份清单**只写了写入命令，没规定它落在哪**；若落在**被 robocopy 同步的目录内**，会被下一次增量备份当成"源里多出来的文件" | 本 Phase 把它写在**备份根目录**（`$BK\BACKUP-MANIFEST.txt`），**不在 `node_modules\` 内**；robocopy 日志另置 `$BK\_logs\` |
| §二 E4 → P2/P3 | **D 类遗留与合并目标的同名碰撞未被识别**：实测 **67 / 69** 个路径在合并目标里**同名存在** → P2「我方删 / 上游保留」处置时，这三个目录下的文件**可能被"保上游"重新写回**，**污染 D4 的"保留 4 模块"对照面** | 已写入 `BACKLOG-长期待办.md` §二 的**给 P2/P3 连带风险提示**；P2/P3 处置后**必须复查**这三处目录有无新增跟踪文件 |
| §六 A1 / §一 非目标 | 蓝图**只规定"不清理 dist/"，未规定"不清理 D 类遗留"** | 明确：D 类遗留**本 Phase 不做任何磁盘动作**（不删、不提交、不忽略），仅登记 |
| §十 交接 5 | 蓝图说"P1 的验收要给出工具链基线值"，但**未记录"P0 从未跑过门禁"这一事实** | 已在完成报告 §八 交接 5 写明：**P0 未跑任何测试/`tsc`**（非目标），因此 P1 拿到的是**首次真实基线，无历史值可比** → 必须完整记录 |
| §三 环境陷阱 / §十 交接 4 | **未记录本机已存在的 `D:\data\node24\node.exe`**，也未记录**当前生效 `D:\data\node\` 的 npm/pnpm 已损坏**（`Cannot find module …npm-cli.js` / corepack `pnpm.js` 缺失） | 登记 **B-04**；完成报告 §八 交接 4 要求 **P1 第一步先验 `node24` 的版本**，并**先修好 npm/pnpm 可用性**（否则 `pnpm install` 无从谈起） |
| 全文 | 未提醒**已完成 P0 的文件数与蓝图不符时如何自证** | 已在完成报告 §五 偏差 1 给出量纲区分，并给出自查命令：`git diff --cached --name-only` 是**唯一权威**；`git status --porcelain` 的行数**不是文件数** |
| §六 验收表 | 表的**行号缺 A5 的失败处置**（A4 有、A5 无） | 已按实测补：A5 差距 > 5% → 查是否有进程在写 `node_modules` 并重备（增量续跑） |

### 4 · 有意保留的"不处理"点（**待填写**）

- ✅ **三处 D 类遗留**（`docs/design/` 44 ＋ `docs/internal-issue/` 19 ＋ `docs/refactor/` 6 ＝ **69 文件**）：
  本 Phase **不提交、不删除、不 ignore**，去路 = `BACKLOG-长期待办.md` **B-01**（P5 逐文件判定）。
  理由见 §二「P0 执行期实测更正」① 与台账 §三 **Q5**。
- ✅ **`dist/` 不清理**（含 1998 KB 的 `cyrene-welcome.png`）：该文件已随 P0 提交进 git；本 Phase **未跑过任何 `git clean`**。
- ✅ **`.cyrene-sync-state.json` 的 `mirrorPath` 仍是错值**：跨 Phase 职责，去路 = **B-03**（结项时改）。
- ✅ **11 项功能基线的「存在 OK」判定**：本 Phase **不重跑**（非目标）；P1 装完 Node 24 后才具备重跑条件。

### 5 · 验收（实测数字）（**待填写**）

| 命令 | 结果 |
|---|---|
| `git status --porcelain`（收口后） | **3 行**（全部为 D 类遗留）；作用域内 **0 行** → **A1 ✅（J-10 口径）** |
| `git diff --cached --name-only`（提交前） | **188**（A 118 / B 68 / C 1 / `.gitignore` 1）；D 类 **0**；E 类 **0** |
| `git -C $R diff --numstat -- .gitignore` | **`2  0  .gitignore`** → 只追加、**未改既有行** ✅ |
| `git show --stat --name-only HEAD \| Select-String 'docs/(design\|internal-issue\|refactor)/'` | **0 行** → **A7 ✅** |
| `git log -1 --format=%H` | `7a35ad0b4891fcab3ca873268b5906396a90d993`（P0 文档提交）；收口提交 = `6871f1f4` |
| `git rev-parse 'pre-heb-1.3.0^{commit}'` | `6871f1f41c816ed8d1fa3b82320413d9ff8eb3a1` → **A2 ✅**（＝收口提交，符合 A2 字面 "P0 提交哈希"） |
| `git rev-parse 'official-target-8fe5ba7a^{commit}'` | `8fe5ba7a5b3a86043b8034abeaa98f72f7459039` → **A2 ✅** |
| `git cat-file -t pre-heb-1.3.0` / `official-target-8fe5ba7a` | `tag` / `tag` → **均 annotated** |
| `git merge-base pre-heb-1.3.0 official-target-8fe5ba7a` | `b11b88512cf0cf6dace56b59ff9487947ef01c28` → **A3 ✅** |
| `git rev-list --count b11b8851..official-target-8fe5ba7a` | **130** → **A8 ✅** |
| `git rev-list --count b11b8851..HEAD` | 原 11 ＋ P0（1 改动 + 若干文档）🔴 **不写定值、不作判据**（自指限制，见完成报告 §五 偏差 8） |
| `git status -sb`（首行） | `## master...origin/master`（收口前为 230）🔴 **ahead 数同上，不作判据** |
| `git diff --cached --name-only` 中单文件体积 | **最大 < 5 MB** → 停止条件 **S4 未触发** ✅ |
| 备份：源 / 目标 文件数·字节 | **132037 / 132037 文件**；**2.08 GB / 2.08 GB** → `MATCH ✅`（**A4 / A5 ✅**） |
| 锁文件 `Test-Path` 逐个实测 | `package.json` ✅ 6900 B ／ `package-lock.json` ✅ 877384 B ／ `pnpm-lock.yaml` ❌ ／ `pnpm-workspace.yaml` ❌（**兑现 J-09**，且**未静默跳过**） |
| 工具链（P0 后，**未跑任何门禁**） | `node v22.23.2` ／ `tsc 5.9.3` ／ `npm`·`pnpm` **不可用**（损坏 ＋ 执行策略，见 B-04） |
| `Get-PSDrive E` | 可用 **254.1 GB**（备份前，符合前置 ④） |

### 8 · 待做 / 未做（**待填写**）

| 项 | 状态 | 说明 |
|---|---|---|
| **B-01** 三处 `docs/` 遗留去路 | ⬜ 未做 | **P5** 触发；本 Phase 已完成"证据采集 + 风险提示"（BACKLOG §二） |
| **B-02** `a1-s-streamdown-report.json` 2.1 MB | ⬜ 未做 | **结项后**由**人**定夺 |
| **B-03** `mirrorPath` 指向落后镜像 | ⬜ 未做 | **结项时**由 agent 改（跨 Phase 职责） |
| **B-04** 验证 `D:\data\node24` ＋ 修 npm/pnpm 可用性 | ⬜ 未做 | **P1 第一步**（已写入完成报告 §八 交接 4） |
| 跑测试 / `tsc` 门禁取基线 | ⬜ 未做 | **本 Phase 的非目标**（本机 Node 22 / TS 5.9 不达标，跑出来是噪声不是基线）；P1 装完 Node 24 后 |
| 经验库 4 条新坑入库 | ⬜ 未做 | **T4**；属**撰写者**职责（规范 §5.2），不阻塞 P1 |
| 撰写者复核（规范 §5.2） | ⬜ 未做 | 完成报告 §十三 留白待**撰写者**回填 |

### 回写清单（**未勾完不得提交**）

| # | 触发 | 回写目标 | 内容 | 已勾 |
|---|---|---|---|---|
| 1 | **T1** 判据被修正 | `BLUEPRINT-总蓝图.md` §9.1 | 追加 **J-10**（A1 口径 = 作用域内 0 行 ＋ 域外逐条已登记）· **J-11**（禁用裸 blob 哈希判改动）· **J-12**（annotated tag 须 `^{commit}`）· **J-13**（`!` 白名单不是删除保护）。<br>⚠️ **编号说明**：蓝图此处写"追加 J-09 与 J-10"，但 **J-09 已被总蓝图 §9.1 占用**（Test-Path，编号先行）→ A1 口径改用 **J-10**，另新增 **J-11…J-13** | [x] |
| 2 | **T2** 基线被改写 | `BLUEPRINT-总蓝图.md` §九 | ours HEAD `9ab07517` → **P0 末态**（旧值**保留并标注**，未静默删除）＋ 注明 **P0 = 1 改动提交 + 若干文档提交**且锚点打在收口提交 `6871f1f4` ＋ 新增两个锚点 tag（含"须 `^{commit}`"提醒）＋ **声明"HEAD 定值/提交条数不作判据、按角色引用"** ＋ P0 收口实测块 ＋ 备份块 ＋ 环境块（`node24` / npm 损坏） | [x] |
| 3 | **T3** 蓝图被实测推翻 | 本文件 §二 | 21 条审计结果与 E2 **逐条一致**（无需改正）；但 **E4 定性收窄**、**4.2 保护机制归因错**、**4.3 期望 213 量纲混淆** → 三条已就地记录并**保留"曾错、已修正"** | [x] |
| 4 | **T4** 新增经验 | `../methodology/BLUEPRINT-经验库-*.md` | 4 条新坑（**容器计数≠内容计数** / **annotated tag 不解包** / **`!` 非删除保护** / **autocrlf 下裸哈希不可判改动**）—— 待**撰写者**按 H/M/L 归位、键号续编 | **[—]** |

> 🔴 **T4 未勾的理由（写明，不留空）**：经验库的**键号续编与 H/M/L 归位**属**撰写者**职责（规范 §5.2：执行者不自行扩写方法论包），
> 且需先核对 `BLUEPRINT-经验库-具体坑.md` 的现有键号段位。本 Phase **已把 4 条写成可直接入库的形态**（完成报告 §六），**不阻塞 P1**。
> **T1 / T2 / T3 已全部勾选**。**回写清单闭合状态 = 3/4 已勾 + 1 条已写明理由**。
>
> ### 本清单的闭合判据（**P0 新增，防判据自命中** —— 同族：判据 **J-05 / J-06 / J-07 / J-10**）
>
> ```powershell
> # 期望：0 行。取值只有两种：[x] 已完成 ／ [—] 明确暂缓（且必须在下方理由里写明）
> Select-String -Path "docs\construction\HEB-1.3.0\TASK-H1.3.0\PHASE-0-提交收口与锚点.md" `
>   -Pattern '^\|.*\[ \]' -Encoding UTF8 | Where-Object { $_.LineNumber -ge 459 }
> ```
>
> **为什么不能只写"期望 0 行"**：本文件**自己**的正文里就含 `[ ]` 字样（如上面这条判据的代码块、以及各 Phase 的模板行）。
> 若按"全文 `^\|.*\[ \]` = 0 行"判定，判据会**自命中恒失败**（经验 **D29**）；
> 若把 `[ ]` 一律改成 `[x]` 又会**谎报撰写者已完成**（经验 **C14**：验证工具自身必须被验证）。
> → 正解 = **限定行号范围** ＋ 引入**第三种显式取值 `[—]`**。
>
> 🔴 **本文件有 3 种清单格式，判据必须逐种覆盖**（P0 实测：首版判据只覆盖了"表格行"一种，
> 漏掉了 §一 的"`- [ ]` 复选框"格式 —— **这正是"判据作用域 ≠ 被验对象范围"**，经验 **D29 / 判据 J-10**）：
>
> ```powershell
> $F = "docs\construction\HEB-1.3.0\TASK-H1.3.0\PHASE-0-提交收口与锚点.md"
> # ① 目标清单（§一，`- [ ]` 复选框）—— 期望 0 行
> Select-String -Path $F -Pattern '^- \[ \]' -Encoding UTF8
> # ② 回写清单（§十二，表格行）—— 期望 0 行（合法取值只有 [x] / [—]）
> Select-String -Path $F -Pattern '^\|.*\[ \]' -Encoding UTF8 | Where-Object { $_.LineNumber -ge 470 }
> # ③ 全文件任何"清单条目形状"的 `[ ]` —— 期望 0 行（剩余命中只允许出现在说明文字/代码块里）
> Select-String -Path $F -Pattern '^\s*[-|].*\[ \]' -Encoding UTF8
> ```
>
> 📌 **P1 起请照抄这条"逐格式覆盖"的写法**：一个文件里有几种清单格式，就要有几种判据；
> 只写一种 = 给自己发假绿（本节即为实证）。
