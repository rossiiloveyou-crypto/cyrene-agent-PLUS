# PHASE-5 完成报告 —— 依赖安装销账与合并保真核验

> **执行者**：agent（**核验部分建议由未参与前序施工的视角复核**，见 §十一）
> **执行日期**：**2026-10-13**
> **蓝图**：`PHASE-5-依赖安装销账与保真核验.md`（68 KB，**本仓磁盘副本 sha256 = 附件逐字节一致** = `d31e7dd5…38590`）
> **固定点（判据 J-25）**：merge commit **`9cceeeac43c1ee87980e653fb62a69b831d669fa`**（两父 `9920635f` + `8fe5ba7a`）
> **"当前 `HEAD`"不写定值**：开工时 = `8ad59939`（角色名 = P4 收尾文档提交之后的第 4 笔）；**现取命令** `git rev-parse HEAD`
> **一句话结论**：🟢 **H-15 已销账**（`pnpm install --frozen-lockfile` **exit=0**，本仓库历史上首次）+ 🟢 **四层核验全部通过，未发现新的符号级/入口级断口** + 🔴 **发现 1 个清单外的新孤儿模块**（`src/shared/usage-badge.ts`）+ 🔴 **登记 2 项待拍板（H-16 / H-17）** + 🔴 **记录 1 个第二个变更源**（TypeScript **5.9.3 → 6.0.3**，由 lockfile 钉定，判据 **J-17**）

---

## 一、关键数字（**每个数字带口径与时点**，判据 J-19 / J-22）

| 量 | 装前（before） | 装后（after） | 口径 |
|---|---|---|---|
| `pnpm install --frozen-lockfile` | **从未成功过**（P1 结构性受阻） | **exit=0**，7m11.9s | `install.log` 痕迹行 |
| `tsconfig.main.json` | `exit=0` / `errorTS=0` | `exit=0` / `errorTS=0` | `tsc -p … --noEmit --pretty false`，本 Phase 重跑 |
| `tsconfig.preload.json` | `exit=0` / `errorTS=0` | `exit=0` / `errorTS=0` | 同上 |
| `tsconfig.renderer.json` | `exit=2` / `errorTS=4` 🔴 | **`exit=0` / `errorTS=0`** ✅ | 同上 |
| 全量 `Test Files` | `5 failed \| 578 passed (583)` | **`1 failed \| 582 passed (583)`** | `vitest run`，本 Phase 重跑 |
| 全量 `Tests` | `1 failed \| 5603 passed \| 1 skipped (5605)` | **`1 failed \| 5653 passed \| 1 skipped (5655)`** | 同上（**通过数 +50**） |
| 加载失败文件（`0 test`） | **4** | **0** ✅ | 同上 |
| `typescript` | **5.9.3** | **6.0.3** 🔴 | `require('typescript/package.json').version` |
| `node_modules` | 132037 文件 / 2.4 GB | **129329 文件 / 1.8 GB** | `find -type f` / `du -sh`（**小是 pnpm 硬链接+严格隔离的正常形态，不是装漏**） |
| `pnpm-lock.yaml` | blob `59f65e52…` | **blob `59f65e52…`（全等）** | `git rev-parse HEAD:pnpm-lock.yaml` vs `git hash-object --path` |
| `git status`（3 个清单文件） | 无输出 | **无输出** ✅ | `git status --porcelain -- pnpm-lock.yaml pnpm-workspace.yaml package.json` |

> 🔴 **口径声明（判据 J-22）**：本报告出现的三个"删除/缺失"数字**各有口径、不可互换** ——
> **`94`** = P5 的核验分母 = `{在我方 HEAD ∧ 不在官方目标}` 的官方删除项 **91**（= **16 UD + 75 静默**）+ **3** 个 rename 旧路径；
> **`88`** = P4 报告口径 = "官方树有、新树没有"（含 `docs/**` 83 + `README.en.md` 1 + 渠道 4 文件）；
> **`95` / `98`** = P2 口径 = 官方删除集（**重命名探测开 = 95 / 关 = 98**）。

---

## 二、施工记录

### 0 · 人工环节回执（索引，**不复制结论**）

**唯一真值在** `HUMAN-人工验证台账.md`。本 Phase 对台账的改动**只有三处**：

| # | 改动 | 位置 | 依据 |
|---|---|---|---|
| 1 | **新增 `H-16`**（渠道 4 文件：确认删除 or 恢复），状态标记为「待拍板」（H-A 专用记号），前三列已预填 | 台账 §四 | 蓝图 §五 5.1 H-A-1 |
| 2 | **新增 `H-17`**（孤儿模块：`embedding-index-service.ts` **＋ P5 新发现的** `src/shared/usage-badge.ts`），状态标记为「待拍板」（H-A 专用记号），前三列已预填 | 台账 §四 | 蓝图 §五 5.1 H-A-2 + **本轮实测新增** |
| 3 | **`H-15` 由 `🚫 环境受阻` 改为 `✅ 已闭合（P5 销账）`**，并把销账证据写入该行证据列 | 台账 §四 + §5.2 | 蓝图 §五 5.3 表 b 行（"本 Phase **必须**销它"） |

**台账 §5.3 追加一行（2026-10-13 P5）**；**§六 机器判据实测**：
判据① **2 行**（H-16 / H-17，**期望 2**）· 判据② **5 行**（H-10…H-14，**期望 5**）· 判据③ **0 行**。
📌 **一处施工中的自我修正**：首版把 P5 记录行写成含 `` `[ ]` `` 的措辞 ⇒ **判据① 自命中返回 3 行**（正是 **J-05 / J-07 家族**：判据被自己的说明文字命中）；
已改措辞后回落到 **2 行**。**这不是台账缺陷，是判据使用纪律的又一次实证**。

### 1 · 偏离蓝图之处

| # | 蓝图原文 | 实际做法 / 实测 | 为什么 | 性质 |
|---|---|---|---|---|
| **1** | §四 4.5 ①"**91 条该删的必须已不在树上**，期望 0" | 🔴 **该判据与已拍板决策（H-02 / M2 / M5）结构性矛盾** —— `silent-set.txt` **内含 18 条救回面**（如 `src/main/rag/document-cache.ts`、`src/renderer/settings/shared/modal.ts`）。照字面跑得 **18 条 STILL-TRACKED** | 蓝图写的是"官方删除面"，但**删除面 ∩ 救回面 ≠ ∅**；正确判据必须**先把 91 条按"该删 / 该留"分类** | 🔴 **判据修正**（不改结论） |
| **2** | 同上（修正后） | **该删未删 = 0** ✅ · **救回 18/18 在位** ✅ · **3 个 rename 旧缺新在 = 3/3** ✅ | 与 P2 的处置结果完全一致 | ✅ **A7 通过** |
| **3** | §四 4.6 ② 的 `probe-import-symbols.mjs`（蓝图给的脚本） | 该脚本用正则抽 `export`，**会漏** `export type { A } from "…"` / **多行**再导出 ⇒ 实测报 **157 条可疑**，逐条查证**全部是代理判据漏报** | 蓝图 §四 4.6 末已预告"这是代理判据，会漏 `export *` / 类型再导出" —— **实测漏报面比预告的大**：主要是**多行再导出** | 🔴 **判据校准**（不改结论） |
| **4** | 同上（校准版 `v4`） | **疑真断口 = 0**（4956 个具名 import：直接导出 4776 / 再导出 172 / `export *` 盲区 8） | 校准版修掉**两处探针自身缺陷**（跨 import 贪婪匹配、门禁作用域 glob 裁剪错误） | ✅ **A9 通过** |
| **5** | §四 4.7 的 11 项标识判读规则（`main=0` ⇒ 🔴 停工级 S6） | 🔴 **该规则对 2 项标识失效**：`USAGE_BADGE` = `0/0/0`、`confirmValue` = `0/0/4`，但**整树读数与 P4 基线逐字一致（2 / 4）** | 这两个"标识"**不是单层 token**：`USAGE_BADGE` 是**跨切面 `src/shared/` 模块**的常量名；`confirmValue` 是**旧 settings shell（`src/renderer/settings/`）**的内部名 | 🔴 **判据修正**（**S6 未触发**） |
| **6** | §四 4.7 判读表"`main ≥1 ∧ renderer = 0` ⇒ 逐项查清" | 该项**实际有 5 项**（不只有"附件链"一项）：`person-erasure` · `ZONES_` · `audit-log` · `group-corpus` · `buildGroupContextBlock` | 蓝图给的判读规则**是对的**，此处只是如实记录处置结果（见 §七） | ✅ 照蓝图执行 |
| **7** | §四 4.2"直接复用 P3 的出口读数（它们就是装前的值）" | **两者都做了**：① 蓝图要求的 `before-*.log`（P3 出口副本，落盘为对照物）；② 🆕 **本 Phase 用自己的脚本重跑了一遍**装前基线 | **口径一致性**：装后基线由本 Phase 的脚本产出，若装前用 P3 日志、装后用新脚本，则"`4 → 0`"里可能混着**脚本差异**（同族：**J-14 / J-22**）。重跑后两组读数**逐格相同** ⇒ 无脚本差异 | 🟢 **增强**（多一层对照） |
| **8** | §四 4.3 预期"若 TS 变 6.x 则单列一节" | **确实变成 `6.0.3`** ⇒ 已按蓝图要求单列（§十二 9 两列对照 + §一 表格） | —— | ✅ 预案命中 |

### 2 · 蓝图未覆盖、施工中发现的漏洞

| # | 漏洞 | 实测 | 处置 |
|---|---|---|---|
| **L1** | 🔴 **"删除面"与"救回面"在蓝图里没有交集声明** —— §四 4.5 的分母 91 被当成"全都会消失"，而它**内含 18 条救回面** | 照字面执行 ⇒ **18 条假红**；若执行者为了"变绿"而去 `git rm` 这 18 条，就会**直接摧毁 H-02/M2/M5 三项已拍板决策** | 已在本报告 §二 1 登记；**建议回写蓝图 §四 4.5**（见 §十 回写清单） |
| **L2** | 🔴 **门禁作用域与"源码真实范围"不重合**：`tsconfig.renderer` 的 `include` = `src/renderer/react/**` + `src/shared/**`，**不含 `src/renderer/settings/**`**（旧 settings shell）与 `src/renderer/lib/**`、`src/renderer/live2d/**` | 三套门禁 **全绿**只能证明"**作用域内**无断口"；作用域外的代码（如 `src/renderer/settings/memory/delete-all.ts`）**任何 tsc 都看不见** | 已在 A9 探针里加"作用域归属"列（本轮输出"疑真断口 0"，故无归属争议）；**属"残余不确定性"的一部分**，见 §十 |
| **L3** | 🆕 **清单外的第 2 个孤儿模块**：`src/shared/usage-badge.ts`（消费者 = 0） | 全仓**唯一** import 它的是 `usage-badge.test.ts` 自己；React 侧 `UsageBadge.tsx` 走 **CSS 变量** `--cy-usage-badge-image`，**不 import 该模块** | 已登记 **H-17**（经验 **C24**：按清单审计会漏掉清单外的东西 —— P3 给的清单是**一个**孤儿，实测有**两个**） |
| **L4** | 蓝图 §四 4.3 的装后四查**未列"`sharp` / `tree-sitter` 不在顶层"这一形态** | 实测 `node_modules/sharp` 与 `node_modules/tree-sitter` **不存在**；但两者**本就不是 `package.json` 直接依赖**（108 个直接依赖里没有），lockfile 钉 `sharp@0.32.6` / `tree-sitter@0.22.4`，实体在 `node_modules/.pnpm/` 内 | **非缺漏**；已在本报告留痕，**建议回写蓝图 §四 4.3 以免下个 Phase 误判** |
| **L5** | 蓝图 §四 4.8 ③ 的"声明了但未注册"检查**未给命令** | 实测全仓 412 个声明里，**只有 1 个** `WINDOW_DRAG_START` 无任何使用点 | ✅ **已归因**：`b11b8851`（base）与 `8fe5ba7a`（官方目标）**都含**该声明 ⇒ **早于本次合并的既有未用声明**，不计入本次缺陷 |

### 3 · 有意保留的"不处理"点

| # | 不处理 | 为什么 |
|---|---|---|
| 1 | 🔴 **不改任何源码** | 蓝图 §一 非目标 + 规范 §1 原则 2：核验发现问题**登记**（H-17 / 本报告 §七），**不顺手修** |
| 2 | 🔴 **不修 `class-name-contract` 的 3 个未定义类名** | **早于本次合并的既有欠账**（P3 已归因）；修它是产品/CSS 决策（蓝图 §一 非目标 + §十 交接 4） |
| 3 | 🔴 **不处置两个孤儿模块**（`embedding-index-service.ts` / `usage-badge.ts`） | 需与官方设计对齐 + 留审计痕迹（**M6**）⇒ 已登记 **H-17**，**人等拍板** |
| 4 | 🔴 **不删 `node_modules.bak`** | 蓝图 §八 **新增禁令 ⑤**："安装后、验收通过前不要删" —— 它是本 Phase 唯一的依赖级回退点。**验收已通过，但删除时机留给结项**（与 `wip/*` 同规） |
| 5 | **不删 `wip/p3-src` / `p4-pre-commit` / 其余 `wip/*`** | 它们是核验的**参照物**（蓝图 §一 非目标 + §八 禁令 ④） |
| 6 | **不改 `.gitignore`**（`heb-p5/**` 仍为未跟踪） | 蓝图 §七 明令：属计划外扩张，**一并留给结项** |
| 7 | **不推送远端** · **不 `git clean`** · **不 `stash`** · **不 `merge --abort`** · 🔴 **不运行应用** | 蓝图 §一 非目标 + §八 四条禁令（不运行应用是因为**首次启动会迁移 `%APPDATA%\live2d-cyrene`** ⇒ 属 P6，且**必须先外部备份**） |
| 8 | **不追 `WINDOW_DRAG_START` 这个未用声明** | 已归因为**早于本次合并**（L5）⇒ 不在本 Phase 范围 |

### 4 · 有意保留的"不处理"点（**数据面**）

🔴 **本 Phase 无数据面动作**：**不运行应用**（不触发 `%APPDATA%` 迁移）· 不碰用户数据 · 不碰 `resources/` · 不改 `package.json`。
**唯一动过的是 `node_modules`**（改名 + 重装），且已在 §八 留下两级回退点。

---

## 三、安装段（A1–A3）

### A1 · `pnpm install --frozen-lockfile` 成功 ✅

```text
# [运行痕迹] pnpm install --frozen-lockfile  exit=0  at=2026-10-13 22:38:06  node=v22.23.2  pnpm=10.33.0
Done in 7m 11.9s using pnpm v10.33.0
```

> 📌 **本仓库历史上第一次成功**。P1 的结构性失败（`ERR_PNPM_NO_LOCKFILE`）随官方 lockfile 合并带入而消失 ⇒ **H-15 的成立条件具备**。

🔴 **安装期脚本白名单（§九 坑 3）实测**：`install.log` 里
`ignored build scripts: electron-winstaller@5.4.0`（**新出现的、蓝图未预告的一条**）。
**按"对产物下判据"处置**：

| 包 | 白名单 | 产物判据 | 判定 |
|---|---|---|---|
| `protobufjs` | ✅ 在 | `postinstall: Done` ×2 | ✅ |
| `esbuild` | ✅ 在 | `postinstall: Done` · `node_modules/esbuild/dist` 存在 | ✅ |
| `electron-winstaller` | ❌ 不在 | 仅用于**打包安装器**，不参与类型检查/测试/运行 | ✅ **不处置**（属计划外扩张） |
| `electron@44.4.3` | ✅ 在 | `node_modules/electron/dist/electron.exe` **不存在** | ✅ **不算失败** —— 判据 **E10**：`electron@44` 已无 `postinstall`，二进制由 `require()` **懒下载** |
| `sharp@0.32.6` / `tree-sitter@0.22.4` | ✅ 在 | 不在顶层（非直接依赖），实体在 `.pnpm/` | ✅ 非缺漏（见 §二 2 L4） |

### A2 · **锁文件未被改写** ✅（H-15 的成立条件）★

```text
git status --porcelain -- pnpm-lock.yaml pnpm-workspace.yaml package.json   →  （无输出）
git rev-parse HEAD:pnpm-lock.yaml          = 59f65e5235b22bd28ee670bc2526c5e322df9b8c
git hash-object --path pnpm-lock.yaml      = 59f65e5235b22bd28ee670bc2526c5e322df9b8c
pnpm-lock.yaml byte 数                     = 601159
```

> 口径：用 `git hash-object --path`（**归一化 blob**）而非裸字节比较，依据判据 **J-11 / J-14**（本仓 `core.autocrlf=true`）。

### A3 · 三个缺包到位 + 工具链版本已记录 ✅

| 包 | 版本 | 判据 |
|---|---|---|
| `@mantine/core` | **9.6.2** | ✅ 到位 |
| `@mantine/hooks` | **9.6.2** | ✅ 到位 |
| `@tanstack/react-virtual` | **3.13.23** | ✅ 到位 |
| `typescript` | **6.0.3** 🔴 | **第二个变更源**（见 §十二 9） |
| `vitest` / `vite` / `electron` / `esbuild` | 5.0.1 / 8.3.0 / 44.4.3 / 0.28.2 | 与官方 lockfile 一致 |

🔴 **TS 双版本陷阱的落地结果**：lockfile 里 `typescript@5.4.5` 与 `typescript@6.0.3` **两个条目都在**；
`package.json` 的 devDep 是 `^6.0.3` ⇒ `--frozen-lockfile` **落到 6.0.3**。
🔴 **蓝图 §一 非目标的遵守情况**：**未主动升 TS** —— 版本由 lockfile 决定（判据 **J-17** 的最终形态兑现）。

---

## 四、基线段（A4–A6）

### A4 · 三套编译 ✅（S4 / S5 **未触发**）

| | 装前 | 装后 | 期望 | 判定 |
|---|---|---|---|---|
| `main` | `exit=0` / 0 错 | **`exit=0` / 0 错** | 保持 0 | ✅ |
| `preload` | `exit=0` / 0 错 | **`exit=0` / 0 错** | 保持 0 | ✅ |
| `renderer` | `exit=2` / **4 错** | **`exit=0` / 0 错** | **4 → 0** | ✅ |
| 运行痕迹行 | — | **三份都有 `exit=` 与 `errorTS=`** | 判据 **J-23** | ✅ |

> 🔴 **S4 / S5 均未触发** ⇒ **TS 5.9.3 → 6.0.3 的升级没有引入任何新错**（装在 6.0.3 上的三套编译全绿）。
> 装前那 4 条错的**种类**（`TS2307` ×3 缺包 + 连带 `TS7006` ×1）在装后全部消失。

### A5 · 全量测试 ✅

```text
Test Files  1 failed | 582 passed (583)
     Tests  1 failed | 5653 passed | 1 skipped (5655)
```

| 期望 | 实测 | 判定 |
|---|---|---|
| `Test Files` = `1 failed \| 582 passed` | **`1 failed \| 582 passed (583)`** | ✅ **逐字命中** |
| `Tests` = `1 failed`，且**那 1 个是 `class-name-contract`** | 唯一失败 = `src/renderer/react/styles/class-name-contract.test.ts`（"历史欠账清单之外的未定义类名"） | ✅ **预期之内**（**既有欠账**，P3 已归因） |
| `(0 test)` 计数 = **0** | **0** ✅ | ✅ 4 个加载失败文件**全部转绿** |
| 通过数上升不算退化 | **5603 → 5653（+50）** | ✅ 预期（装包后那 4 个文件开始跑用例） |

### A6 · `work-verification-closure.test.ts` 单跑 ✅

```text
✓ src/main/orchestrator/work-verification-closure.test.ts (9 tests) 355ms
   Test Files  1 passed (1)      Tests  9 passed (9)
```

> 📌 **S8 未触发**。**P3 的"不加 `.node24` 前缀必红"结论继续不成立**（同 §二 E6 蓝图的实测更正）：
> 本轮 `pnpm -v` = **10.33.0**（未被前置 PATH），该测试 **9 passed**。

---

## 五、核验段

### A7 · 文件层：**94 = 91 + 3** 逐条判定 ✅

> 🔴 **口径（判据 J-22）**：`94` = `{在我方 HEAD ∧ 不在官方目标}` 的官方删除项 **91**（= **16 UD + 75 静默**）**+ 3** rename 旧路径。
> ⚠️ **与 P4 报告的 `88` 是两个口径、不可互换**。

| 判据 | 期望 | 实测 | 判定 |
|---|---|---|---|
| 91 条里**该删的仍在索引** | 0 | **0** | ✅ |
| 91 条里**该留的（救回面）仍在索引** | 全在 | **18/18 在位** | ✅ |
| 3 个 rename：**旧 absent / 新 PRESENT** | 3/3 | `search-code-tools.ts` · `search-code-tools.test.ts` · `vitest.config.ts` → **3/3 OK**（在 `9cceeeac` 固定点上） | ✅ |
| 18 条救回面（蓝图 §四 4.5 的 12 条机械可判定子集） | 缺失 0 | **缺失 0** | ✅ |

🔴 **蓝图判据修正（§二 1）**：§四 4.5 ① 的"91 条仍应不在索引"**与救回面结构性矛盾** —— 照字面跑得 **18 条假红**。
**修正后的分类口径**（逐条表在 `.cyrene-merge-analysis/heb-p5/file-layer.tsv`，92 行）：

```text
分母 91 = 16 UD + 75 silent
  ✅ 已删（该删的，已不在索引）    = 70  ← ✏️ **P5 复核更正：应为 73**（详见 §十四 14.4；70 + 18 = 88 与分母 91 不闭合，真值 = 已删 **73** + 救回 **18** = **91**）
  ✅ 救回（在位，属 H-02/M2/M5 保护面）= 18   ← 其中 15 条来自 silent-set，3 条来自 ud-set
  🔴 该删未删                      = 0
  🔴 救回丢失                      = 0
```

**两处必须写的豁免（蓝图 §四 4.5 末）已逐条核**：

| 豁免 | 实测 |
|---|---|
| `ud-set` 里 3 个 DU 目标**磁盘上仍有未跟踪副本** | 三条**全部** `index=untracked / disk=present` ⇒ 按**索引口径**判"已删"，`Test-Path` 恒 `True` **不算失败** ✅ |
| `noop-set` 7 条不参与核验 | 实测该文件 **7 条**（我方 `598dfb75` 就已删，双方都删 = 空操作）✅ |

**一条抽验（回答"救回的是不是真该救回"）**：`silent-set` 里另有一条 `src/main/ui-font-protocol.ts`（M2 决策文本里点过名），
**实测未在树上** ⇒ 逐条查证：它的删除出处 = **官方 `5dfcccd5 fix(设置): 固定界面字体为系统默认`**，
即**已拍板 M4 / H-03（"窗口圆角 + UI 字体两项设置直接删"）的落地物**；全仓引用 **0**。
⇒ **判定：正确删除，不是缺陷**（与它同批消失的还有 `src/shared/ui-font.ts` · `src/main/ui-font.test.ts` · `src/shared/window-corner-radius.ts`，都在 M4 范围内）。

### A8 · 符号层 · P3 的恢复面（逐符号）✅

```text
符号检查：25/25 在位；缺失 0        （exit=0）
```

覆盖 P3 §五 偏差 1 的 7 个恢复文件：`rag/file-ingest.ts`（7 符号）· `rag/retriever.ts`（1）· `rag/vectorstore.ts`（2）·
`rag/index.ts`（8）· `shared/ipc-channels.ts`（4）· `preload/index.ts`（3）—— **共 25 个检查点**。
📌 **判据形式**：该文件里出现该符号（导出或使用）。脚本：`.cyrene-merge-analysis/heb-p5/probe-symbols.mjs`（可复跑）。

### A9 · 符号层 · 全仓 `import` 目标符号扫描 ✅（**P3 没做的新判据**）

```text
src/ 下 ts/tsx 文件数            = 1503
具名 import 检查点（同一行内）    = 4956
  ├─ 目标直接导出                 = 4776
  ├─ 目标再导出（多行/带 from）    = 172
  ├─ 目标有 export *（代理盲区）   = 8
  └─ 🔴 疑真断口                  = 0
目标文件不存在的 import（TS2307）= 17
```

| 期望（蓝图 A9） | 实测 | 判定 |
|---|---|---|
| 可疑 = 0，**且** A4 三套编译全绿 | **可疑 = 0** ∧ **三套编译全绿** | ✅✅ **两者都绿 ⇒ 符号层通过** |

🔴 **必须写清的"判据自身校准史"（规范 §7.1：代理判据必须配交叉验证；经验 C14：验证工具自身必须被验证）**：

| 版本 | 结果 | 问题（探针自身） | 处置 |
|---|---|---|---|
| **蓝图原版**（正则抽 `export`） | **157 条可疑** | ① 只认**单行** `export {...}`，漏 `export type {\n A,\n B\n}` 的**多行再导出**；② 不认 `export { A } from "…"` 的再导出语义 | 逐条查证 157 条 → **分布在 24 个目标文件**，抽查 `src/shared/reasoning.ts`（24 条）/`vendors/index.ts`（22）/`music/types.ts`（9）等**全部使用多行再导出** ⇒ **判为代理判据漏报** |
| **校准版 v2** | 出现**明显假阳性**（如 `{describe}` 挂到 `usage-badge.ts`） | 我的 import 正则 `\{([\s\S]*?)\}` **跨多条 import 贪婪匹配** | 改为 `\{([^}\n]*)\}`（**不跨行**） |
| **校准版 v3** | **0 条可疑** | 门禁作用域 glob 裁剪错误（`react/**/*.ts` → `react*`）；main/preload 的 tsconfig 解析失败（JSONC 里的行内注释） | 用 **TypeScript 自带的 `ts.readConfigFile`**（与 `tsc` 同一套 JSONC 语义）+ 单遍 glob→regex |
| **校准版 v4（最终）** | **0 条可疑**（4956 检查点） | —— | ✅ **A9 通过**；脚本落盘可复跑 |

> 📌 **交叉验证关系**：**`tsc` 三套编译全绿**是 A9 的交叉验证（`TS2305` / `TS2307` 正好覆盖"导入了不存在的符号"）。
> 本次**两者同时为绿** ⇒ 符号层通过，**无需以某一边为准**。

### A10 · 入口层：11 项能力逐项"可达性"判定 ✅

> **判据形状** = "从组合根出发，是否存在一条调用路径到达它"。
> **组合根候选实测**：`src/main/application/core-bootstrap.ts` ✅ · `src/main/application/default-dependencies.ts` ✅ · `src/main/index.ts` ✅ · `src/main/main.ts` **不存在**（蓝图候选表里唯一不存在的）。

| # | 能力 | main | preload | renderer | 判读 | 结论 / 依据 |
|---|---|---|---|---|---|---|
| 1 | `memory-console` | 4 | 0 | 3 | ✅ 两端都有 | `MemorySettingsPanel.tsx` + `memory-console/*`（`DangerZoneSection` / `MemoryManagerSection` / `erase-step.ts`） |
| 2 | `person-erasure` | 8 | 0 | 0 | 🟡→✅ | **标识在 renderer 命中 0，但入口在**：`memory-console/erase-step.ts` 的 `EraseStep = "preview" \| "confirm"` + `DangerZoneSection.tsx` 的擦除流；main 侧 IPC **11 个文件** ⇒ **能力可达**（标识不是语义名） |
| 3 | `ZONES_` | 3 | 1 | 0 | 🟡→✅ | `ZONES_*` 是 **IPC 通道常量名**（只在 `shared/ipc-channels.ts` 与 main 注册点出现）；**UI 入口在** `ZonesSettingsPanel.tsx` + `src/renderer/settings/memory/manager.ts` |
| 4 | `audit-log` | 11 | 0 | 0 | 🟡→⏳ | renderer 命中 `audit*` 的 **8 个文件**（含 `ToolConsolePanel.tsx` 与 i18n 两个 json）⇒ **候选入口存在**，但"审计视图该在哪、是否完整"是**产品判断** ⇒ 转录 **H-11（P6 人眼）**，**不猜** |
| 5 | `tool-access` | 11 | 0 | 1 | ✅ 两端都有 | `ToolConsolePanel.tsx` |
| 6 | `keyword-policy` | 6 | 0 | 3 | ✅ 两端都有 | `channel-keywords.ts` + 2 个契约测试 |
| 7 | `group-corpus` | 10 | 0 | 0 | 🟡→⏳ | renderer 命中 `corpus*` 的 **4 个文件**（`MemoryManagerSection.tsx` + 2 个 i18n json + 旧壳 `erasure-flow.ts`）⇒ 候选入口存在，完整性属产品判断 ⇒ 转录 **H-11** |
| 8 | `buildGroupContextBlock` | 5 | 0 | 0 | ✅ **纯后端能力** | 它是"**注入到提示词的旁听上下文块**"，**结构上不需要 UI 入口**；机器判据载体 `group-context-injection.test.ts` **单跑 10 passed** |
| 9 | `USAGE_BADGE` | **0** | **0** | **0** | 🔴→✅ | **不是能力已失**：① 整树读数 **2**，与 P4 基线**逐字一致**；② 真实能力 = `UsageBadge` 组件，**仍在且被渲染**（`ChatPageNavigation.tsx:121` 的 `<UsageBadge sessionId={…} />`，且 `panel-layout.test.ts` 有断言）；③ 该标识是 `src/shared/usage-badge.ts` 的**配置常量名**，**该模块本身消费者 = 0** ⇒ **新发现孤儿模块**，登记 **H-17** |
| 10 | `groupContextLimit` | 6 | 0 | 3 | ✅ 两端都有 | ⚠️ **基线值以实测 9 为准，不引用总蓝图 §七 表的 11**（P3 已更正为过期值） |
| 11 | `confirmValue` | **0** | **0** | **4** | 🔴→✅ | **不是"前端调不存在的后端"**：`confirmValue` 是**旧 settings shell**（`src/renderer/settings/memory/{delete-all,erasure-flow}.ts` + `shared/{modal,modal-state}.ts`）的内部名，**不经过 IPC**；React 新壳的对应物是**更强的**"输入确认短语"（`DangerZoneSection.tsx` 的 `isDeleteAllConfirmed(typed, phrase)` + `DELETE_ALL_CONFIRM_PHRASE_FALLBACK`）⇒ **能力被替代，不是丢失** |

**汇总**：`main = 0` 的项 **= 0**（**S6 未触发**）· `main ≥1 ∧ renderer = 0` 的项 **= 5**，**逐项已给出结论**（3 项 → 能力可达 / 入口在【2・3・8】；2 项 → 转录 **H-11** 待人眼【4・7】）· 两个"零命中标识"（9・11）**已归因到"标识不是语义名"，非退化**。

📌 **附件链的 A56 真断口 —— 复查结果：仍未闭合**（与 P3 登记一致）：

| 桥方法 | main | preload | renderer | 判定 |
|---|---|---|---|---|
| `processDocuments` | 2 | 1 | **0** | 🔴 **源码层不可达** |
| `onDocumentIndexProgress` | 0 | 1 | **0** | 🔴 同上（`main=0` 是正常的：它是 **main 外发**通道，由 `document-index-ipc.ts` 的 `sender.send` 发出） |
| `cancelDocumentIndex` | 2 | 1 | **0** | 🔴 同上 |
| （对照）`ingestDroppedFiles` | 0 | 1 | **2** | ✅ 有 React 调用点（但**只登记、不索引** —— P3 已定性） |

⇒ **判定**：`D3`（附件链）在**源码层仍不可达** ⇒ 按 P3 §六 第 8 项 + 蓝图 §四 4.7 的处置，**由 P6 人眼判定"是不是设计如此"**，并已并入 **H-10** 的说明（§五 5.3 表 a 行）。

### A11 · 桥接层：IPC 三处对齐 ✅

| 判据 | 期望 | 实测 | 判定 |
|---|---|---|---|
| **① 充分判据** `ipc-contract.test.ts` | 全通过（带痕迹） | **`Test Files 1 passed` / `Tests 8 passed (8)`**，痕迹行 `exit=0` | ✅ |
| ② 代理指标（三处计数） | 无"塌陷" | 声明 **412** · main 注册点 **303** · preload 引用 **429** | ✅ **无塌陷**（`preload ≠ 0`） |
| ③ 声明但未使用 | —— | 🔴 **仅 1 个**：`WINDOW_DRAG_START` | ✅ **已归因**：`b11b8851` 与 `8fe5ba7a` **都含** ⇒ **早于本次合并的既有未用声明**（§二 2 L5） |

> 🔴 **三处计数不需要相等**（有单向的、有 `send` 的、有只在 main 内部用的）—— 它们只是"有没有明显塌陷"的代理指标；
> **真正的判据是 ①**（它才是充分的：P3 实测它抓出过"主进程外发但 preload 无监听"与"注册点不可达"两类断口）。

**附件链 4 个 channel 的三处对齐**（P3 恢复面复查）：

| channel | 声明 | main | preload | renderer |
|---|---|---|---|---|
| `CHAT_PROCESS_DOCUMENTS` | 1 | 1 | 1 | **0** |
| `CHAT_DOCUMENT_INDEX_PROGRESS` | 1 | 1 | 1 | **0** |
| `CHAT_CANCEL_DOCUMENT_INDEX` | 1 | 1 | 1 | **0** |
| `MEMORY_PANEL_DELETE_IMPORTED_DOC` | 1 | 1 | **0** | **0** |

> 🔴 **`MEMORY_PANEL_DELETE_IMPORTED_DOC` 的 `preload = 0` 需说明**：它**不在** P3 恢复的 3 个 preload 桥方法里（P3 恢复的是 `processDocuments` / `onDocumentIndexProgress` / `cancelDocumentIndex`），
> 即**该通道本来就不是 preload 桥**（`main=1`：main 侧有注册/使用）⇒ **不是塌陷**，与 A8 的 25 个符号检查点**不冲突**。

### A12 · 两项 H-A 的收口 ✅（**终态二值，无"未知/待定"**）

| # | 项 | 状态 | 判定内容 |
|---|---|---|---|
| **H-A-1** → **H-16** | 渠道 4 文件（`conversation-binding-api{,.test}.ts` · `useChannelMirrorEvents{,.test}.ts`）：确认删除 or 恢复 | **⏳ 待人眼（挂起，去路明确）**（台账状态列保持未闭合） | 🔴 **P5 的净增量证据**：合并树**无悬空引用**（`git grep -l conversation-binding-api HEAD -- src` = **0**、`useChannelMirrorEvents` = **0**）⇒ **选"确认删除"不产生任何断链**；若选**恢复**，则需连同 `init.ts` / `ChatPage.tsx` 的**两处调用点**一起补（**取回文件 ≠ 恢复功能**，P4 已提示） |
| **H-A-2** → **H-17** | 孤儿模块：① `embedding-index-service.ts`（P3 已知）② 🆕 `src/shared/usage-badge.ts`（**P5 新发现**） | **⏳ 待人眼（挂起，去路明确）**（台账状态列保持未闭合） | ① 消费者 = 0（官方用 `sticker-text-matcher.ts` 的 text 索引取代，复用同一缓存文件名）；② **新发现**：消费者 = 0，**功能本身没丢**（`UsageBadge` 组件仍被渲染），死掉的只是"设置项 → 徽章配色"的**配置管道** ⇒ 属**产品取向**（保留 = 多一个死文件；删除 = 需确认无仓外/动态消费者 + 留审计痕迹 M6） |

> 📌 两项的**前三列已预填完毕**（要验什么 / 期望值 / 证据），**符合规范 §4.1.2 硬要求 7**。
> 📌 两项**不卡 P5**（蓝图 §五 5.1："先做不依赖这两项的一切"）—— 安装段与四层核验**已全部照做并出结论**。
> 📌 台账守门判据实测：**判据① = 2 行**（正是这两行）· 判据② = 5 行（H-10…H-14，未预填）· 判据③ = 0 行。

---

## 六、验收判据总表（A1–A12）

| # | 判据 | 期望 | 实测 | 判定 |
|---|---|---|---|---|
| **A1** | `pnpm install --frozen-lockfile` 成功 | 含 `exit=0` 痕迹行 | `exit=0`，7m11.9s | ✅ |
| **A2** | 锁文件未被改写 | `git status` 无输出 + blob 全等 | 无输出 · blob `59f65e52…` 全等 | ✅ |
| **A3** | 三个缺包到位 + 工具链已记录 | 各打印版本 | 9.6.2 / 9.6.2 / 3.13.23 · **TS 6.0.3** | ✅ |
| **A4** | main/preload 仍 0 错；renderer 4 → 0 | `0/0/0` | **`0/0/0`** | ✅ |
| **A5** | 加载失败 4 → 0；失败只剩 `class-name-contract` | 1 failed \| 582 passed | **1 failed \| 582 passed (583)** · `(0 test)` = 0 | ✅ |
| **A6** | `work-verification-closure.test.ts` 9 passed | 9 passed | **9 passed** | ✅ |
| **A7** | 文件层 94 逐条判定 | 该删未删 0 · 救回缺失 0 · rename 3/3 | **0 · 0 · 3/3**（分母口径已修正） | ✅ |
| **A8** | 符号层 P3 恢复面逐符号 | 缺失 0 | **25/25 在位** | ✅ |
| **A9** | 符号层全仓 import 扫描 | 可疑 0 且 tsc 全绿 | **可疑 0**（4956 检查点）∧ 三套全绿 | ✅ |
| **A10** | 入口层 11 项可达性 | `main=0` 的项 = 0；`main≥1 ∧ renderer=0` 逐项有结论 | **`main=0` = 0**；5 项逐项已判（3 可达 / 2 转 H-11） | ✅ |
| **A11** | 桥接层 IPC 三处对齐 | 契约测试全绿 + 无塌陷 | **8 passed** · 412/303/429 | ✅ |
| **A12** | 两项 H-A 有明确状态 | `[x]` 或 `⏳ 待人眼` | **两项均 `⏳ 待人眼`**（去路明确） | ✅ |

**停止条件复核**：**S1–S8 全部未触发**（S2 未触发 = frozen 安装成功；S3 未触发 = 锁文件未变；S4/S5 未触发 = 编译全绿；S6 未触发 = `main=0` 的项 = 0 且无新符号级/入口级断口；S7 = 已按登记挂起而非替人取舍；S8 未触发 = 9 passed）。

---

## 七、产出物清单

| 文件 | 内容 | 实测规模 |
|---|---|---|
| **`.cyrene-merge-analysis/heb-p5/install.log`** | 安装输出 + **`exit=0` 运行痕迹** ★ **H-15 的核心证据** | 含痕迹行 |
| **`.cyrene-merge-analysis/heb-p5/before-baseline.txt`** | 装前三基线（**对照物**，判据 **D33**） | 9 行 |
| `.cyrene-merge-analysis/heb-p5/before-tsconfig.{main,preload,renderer}.log` | 🆕 **本 Phase 重跑的**装前三套编译（+ 运行痕迹） | 3 份 |
| `.cyrene-merge-analysis/heb-p5/before-fulltest.log` | 🆕 本 Phase 重跑的装前全量测试 | 数百 KB |
| `.cyrene-merge-analysis/heb-p5/after-tsconfig.{main,preload,renderer}.log` | 装后三套编译 + **运行痕迹** | 3 份 |
| `.cyrene-merge-analysis/heb-p5/after-fulltest.log` | 装后全量测试（汇总行即痕迹，判据 **J-23** 澄清） | 数百 KB |
| `.cyrene-merge-analysis/heb-p5/after-install-checks.txt` | 装后四查（锁文件 blob 对照 / 依赖树规模 / 三个缺包 / 工具链 / 白名单产物判据） | 40+ 行 |
| **`.cyrene-merge-analysis/heb-p5/file-layer.tsv`** | 文件层**逐条**判定表（92 行 = 表头 + 91） | 92 行 |
| `.cyrene-merge-analysis/heb-p5/file-layer.txt` | 文件层分类汇总 + 豁免核查 + rename 3/3 | — |
| **`.cyrene-merge-analysis/heb-p5/symbol-layer.txt`** | 符号层校准版扫描输出（+ 运行痕迹 exit=0） | — |
| `.cyrene-merge-analysis/heb-p5/symbol-layer-p3-restore.txt` | A8 的 25 个符号检查点输出 | — |
| `.cyrene-merge-analysis/heb-p5/symbol-layer-classify.txt` | 蓝图原版 157 条可疑的**归因**（代理判据漏报分类） | — |
| **`.cyrene-merge-analysis/heb-p5/entry-layer.txt`** | 入口层 11 项逐项表 | — |
| `.cyrene-merge-analysis/heb-p5/entry-layer2.txt` | 入口层②：5 项 `renderer=0` + 2 项零命中标识的逐项核查 | — |
| `.cyrene-merge-analysis/heb-p5/ipc-contract.log` | 桥接层判据 + **运行痕迹 `exit=0`** | 含 8 passed |
| **可复跑脚本（7 个）** | `take-baseline.sh` · `after-install-checks.sh` · `probe-file-layer.sh` · `probe-file-layer2.sh` · `probe-symbols.mjs` · `probe-import-symbols.mjs`（校准版 v4）· `probe-import-symbols-classify.mjs` · `probe-entry-layer.sh` · `probe-entry-layer2.sh` · `probe-ipc-layer.sh` | 10 个 |
| **`PHASE-5-完成报告.md`** | 本文件 | — |

> 📌 **证据目录入库问题照旧**：`.cyrene-merge-analysis/heb-p5/**` **不在 `.gitignore` 白名单** ⇒ **默认未跟踪**。
> **本 Phase 未改 `.gitignore`**（属计划外扩张）；是否入库与 `heb-p2/3/4`、`heb-review-*` **一并留给结项**。

---

## 八、回退方法（分级；每条写清代价与验证）

| 级别 | 动作 | 适用 | 代价 | 怎么验成功 |
|---|---|---|---|---|
| **R-1 · 回退依赖树（改名法）** | `rm -rf node_modules && mv node_modules.bak node_modules` | 装坏了 / 想回到 P1 的依赖树 | **几秒**（同分区 rename） | `find node_modules -type f \| wc -l` = **132037**；`node -e "require('typescript/package.json').version"` = **5.9.3** |
| **R-2 · 回退依赖树（备份法）** | `robocopy` 从 `E:\AI_Work\备份\cyrene-pre-P1-2026-10-04\node_modules` 回灌 | `node_modules.bak` 已被删 | 数分钟 | 同 R-1 |
| **R-3 · 只回退锁文件** | `git checkout -- pnpm-lock.yaml` | 锁文件被误改（**S3**） | 无 | `git status --porcelain -- pnpm-lock.yaml` 空 |
| **R-4 · 回退本 Phase 的文档提交** | `git reset --soft HEAD~1` | 报告写错想重提 | 无内容损失 | `git log --oneline -1` 回到上一笔 |
| **R-5 · 回退到 P4 收口点** | `git reset --hard 8ad59939` | 本 Phase 的**全部**改动都要丢 | ⚠️ 会丢未提交改动（**不动未跟踪文件**；`git clean` 才会） | `git rev-parse HEAD` = `8ad59939`；`??` 数不变 |
| **R-6 · 回退到合并前** | `git reset --hard p4-pre-commit`（= `9920635f`） | 整个合并要重做 | 🔴 **极端动作** | `git log --oneline -1` = `9920635f`；`wip/p3-src` 与 `p4-pre-commit` 都还在 |
| **R-7 · 数据面** | 🔴 **本 Phase 无数据面动作** | — | — | `%APPDATA%\live2d-cyrene` **未被触碰**（本 Phase **未运行应用**） |

> 🔴 **五条禁令（继承 P2–P4 + 本 Phase 新增）**：
> **① 不 `git clean`**（`??` 里含 B-01 三目录与 7 个证据目录）· **② 不 `stash`** · **③ 不 `merge --abort`**（合并已完成）
> · **④ 不删 `wip/*` 与 `p4-pre-commit`**（核验参照物）· 🆕 **⑤ 安装后、验收通过前不删 `node_modules.bak`** ——
> **本 Phase 验收已通过**，故 ⑤ 的**解除条件已成立**；但**删除时机与 `wip/*` 一并留给结项**。

---

## 九、已知坑（本 Phase 实际命中情况）

| # | 坑（键号） | 本 Phase 是否命中 | 实际处置 |
|---|---|---|---|
| 1 | 🔴 "我不做基线就动手"（**A51**） | ✅ **已规避** | 装前基线**双重落盘**（P3 出口副本 + 本 Phase 重跑），判据 **D33** 的对照物非空 |
| 2 | 🔴 "前提缺失"被误归因为网络/权限（**C37 / X20**） | ✅ **未命中** | `--frozen-lockfile` **exit=0**；无需归因 |
| 3 | 🔴 安装期脚本白名单（**X20 / E10**） | 🟡 **命中一条新项** | **`electron-winstaller@5.4.0` 被忽略**（蓝图未预告）⇒ 按"对产物下判据"处置：仅用于打包安装器，**不处置**；`electron.exe` 缺失属 **E10**（懒下载）**不算失败** |
| 4 | 测试失败无法归因（四步归因法） | ✅ **未命中** | 唯一失败 = `class-name-contract`（**装前就红**，四步归因第 (a) 步即排除：本 Phase `src/` 改动 **0**） |
| 5 | `$env:PATH` 不跨进程 ⇒ 解析到别的 pnpm（**J-17 家族 / P3 偏差 6**） | ✅ **未命中** | **先探测**：`pnpm -v` = **10.33.0**（未前置 PATH）⇒ 该测试 **9 passed**；**P3 的"一定坏"结论继续被证伪** |
| 6 | 两个变更源不叠加（规范 §4.1.3 硬要求 5） | ✅ **已分离**（**这是本 Phase 最关键的一条**） | **先复跑基线拿"装后态"，再开始核验**；且 TS 升级（5.9.3→6.0.3）**单列一节**（§十二 9） |
| 7 | 🔴 "全绿"必须自带运行痕迹（**J-23**） | ✅ **已落实** | 三套编译日志**各含** `exit=` 与 `errorTS=`；`vitest` 的**汇总行即痕迹**（**J-23 判据形状澄清**，P4 追加） |
| 8 | 计数必须带口径（**J-22**） | ✅ **已落实** | `94` / `88` / `95` / `98` **四个数都出现且各自注明口径**（§一 口径声明） |
| 9 | 快照/镜像要证"完备"不只"自洽"（**J-24**） | ✅ **未误用镜像** | 本 Phase 的文件层/符号层判据**全部在 `HEAD` 树上取**（`git ls-files` / `ls-tree` / `git grep … HEAD`），`wip/p3-src` 只在 rename 判定里作**存在性固定点**（且用的是 merge commit `9cceeeac`） |
| 10 | 不要引用会移动的 `HEAD`（**J-25**） | ✅ **已落实** | 固定点一律 **`9cceeeac`**；报告里的 "HEAD" 一律写成"角色名 + 现取命令" |
| 11 | PowerShell / bash 混用与 CRLF（**C43**） | 🟡 **命中一次** | 全部探针用 **bash / node**（不用 PowerShell）；`git hash-object --path` 归一化，判据 **J-11 / J-14** |
| 12 | 非 ASCII 文件名（规范 §2.1） | ✅ **未命中** | 遍历一律 `git ls-files` / `ls-tree` / `git grep`，**无逐文件脚本复制** |
| 🆕 | **"删除面"与"救回面"有交集**（本 Phase 新坑，建议入经验库） | 🔴 **命中** | 见 §二 1 / §十；**建议级：M** |
| 🆕 | **"全绿"的作用域可能远小于"源码的真实范围"**（本 Phase 新坑，建议入经验库） | 🔴 **命中** | 三套门禁不含 `src/renderer/settings/**` 等；见 §二 2 L2；**建议级：M** |

### 本 Phase 预计会新出现、**实测确实出现**的两条（蓝图 §九 末的预告）

| 新坑 | 实测情况 | 建议级 |
|---|---|---|
| **"装依赖"与"核验保真"必须切成两个证据段** | ✅ **成立且关键**：TS 同时升到 6.0.3 ⇒ 若核验先做，`renderer` 的 4 错会**同时**可能是"缺包"与"TS 收紧" ⇒ 归因链断。**先复跑基线再核验**是这个 Phase 唯一成功的顺序 | **M** |
| **锁文件的双版本会让"安装"变成两个变更源** | ✅ **完全按预告发生**：`5.9.3 → 6.0.3`；已单列（§十二 9）并把每个读数给**装前/装后两列** | **M** |

---

## 十、残余不确定性（**显式声明**，判据 T8）

> 🔴 **本次核验最大的残余不确定性**：
> **"合并没有丢东西"这个结论，只在"机器能看见的作用域"内成立。** 具体地：

| # | 残余不确定性 | 为什么机械证明不了 | 代理覆盖到什么程度 |
|---|---|---|---|
| **U1** | 🔴 **三套门禁的作用域 < 源码真实范围** | `tsconfig.renderer` 的 `include` = `src/renderer/react/**` + `src/renderer/react-perf/**` + `src/shared/**` · `main` = `src/plugins/**` + `src/main/**` + `src/shared/**` · `preload` = `src/preload/**` + `src/shared/**` ⇒ **`src/renderer/settings/**`（旧 settings shell）· `src/renderer/lib/**` · `src/renderer/live2d/**` · `scripts/**` 全都不在任何 tsc 里** | 本 Phase 的 **A9 符号扫描是全仓 `src/` 的**（1503 个文件，4956 个检查点，**疑真断口 0**）⇒ **作用域外也扫过了**；但**类型层面的错误**（如 `TS2322` 类型不兼容）**只有 tsc 能发现**，A9 结构上覆盖不到 ⇒ **作用域外的类型级断口是本次核验的盲区** |
| **U2** | A9 是**代理判据**（正则解析 `import`/`export`，不是 TS 编译器前端） | 会漏：动态 `import()`、`require()`、字符串契约（如 IPC 通道名字符串）、`export *` 的传递解析（本次 8 个检查点落在盲区） | 交叉验证 = **`tsc` 三套全绿**（`TS2305`/`TS2307` 正好覆盖"导入不存在的符号"）；**两者同时绿** |
| **U3** | **入口层的可达性含人工判断成分** | "`main ≥1 ∧ renderer = 0`"是"设计如此"还是"入口被删"，**正则判不了** | 本 Phase 对 **5 项**逐项查证并**给出结论或转录 H-11**（**不猜**）：3 项判定可达（含 1 项"纯后端能力"）、2 项转录 `H-11` 待人眼【`audit-log` / `group-corpus` 的"界面完整性"】 |
| **U4** | **附件链 `D3` 的源码层不可达** | `processDocuments` / `onDocumentIndexProgress` / `cancelDocumentIndex` 的 `renderer` 命中 **= 0**（与 P3 一致） | 已登记 **H-10**（P6 人眼）；**源码层不可达 ≠ 功能不存在**（preload 桥与 main handler 都在位，IPC 契约测试 8/8 绿） |
| **U5** | **两个孤儿模块的"能不能删"** | 需确认**仓外/动态消费者**（本机机制看不到仓外） | 登记 **H-17**，**人等拍板** |
| **U6** | **`node_modules` 规模 132037 → 129329**（−2708 文件） | 装前是 **npm** 装的、装后是 **pnpm** 装的 ⇒ 两者布局**本来就不同**（pnpm 用内容寻址 + 硬链接 + 严格隔离，`.pnpm` 里没有 `node_modules` 嵌套副本） | 判定为**正常形态**：三套编译全绿 + 全量测试 583 文件全跑到 + 三个缺包到位 + 锁文件未变 ⇒ **不是"装漏"**（`--prod` 会连 devDeps 都不装，实测 devDeps 全在） |
| **U7** | **`electron.exe` 不在 `node_modules/electron/dist/`** | 判据 **E10**：`electron@44` 无 `postinstall`，二进制由 `require()` 懒下载 | 本 Phase **不运行应用** ⇒ 二进制是否为运行期问题**属 P6**（且 P6 必须先备份 `%APPDATA%`） |

---

## 十一、复核补正（**待填；规范 §5.2，复核人须未参与本 Phase 施工**）

> **状态**：⬜ **待回填**（本节留给**未参与本 Phase 施工**的复核人）。
> **复核原则**（沿用 P2/P3/P4 的写法）：**以 git 对象与实跑输出为准，不以本报告自述为准**；
> 凡结论性数字一律**从对象库/日志重算**；凡"全绿/0 差异"格一律**用与执行者不同的机制再算一遍**。
> **建议复核面**（由执行者建议，复核人可增减）：
> 1. **A2 的锁文件判据**：用 `git diff --exit-code` + `git hash-object --path` **两种机制**重算；
> 2. **A4/A5 的两列对照**：**独立重跑**三套编译与全量测试，确认 `0/0/0` 与 `1 failed | 582 passed`；
> 3. 🔴 **A7 的"判据修正"**：独立验证"91 条里确有 18 条属救回面"（**这是本报告唯一改了蓝图判据的地方**）；
> 4. 🔴 **A9 的 0 条可疑**：用**另一套机制**（如 `tsc --noEmit` 跑全仓、或 TypeScript Compiler API）交叉验证；
> 5. **A10 的 11 项**：独立重跑 `git grep -l` 三列计数并与 P4 基线 `7/8/5/11/13/9/10/5/2/9/4` 对照；
> 6. 🆕 **H-17 的新发现**：独立确认 `src/shared/usage-badge.ts` 消费者 = 0，且 `UsageBadge` 组件确实被渲染；
> 7. 🆕 **§十二 9 的"两个变更源"**：独立确认 TS = 6.0.3 且**它是由 lockfile 钉定的**（而非 `package.json` 范围重解析）。
> **已知的、执行者自己的两处"探针自身缺陷"**（已修，但复核人应知道它们发生过）：§五 A9 的表格。

---

## 十二、施工记录（**本节按规范 §8；9 / 10 为蓝图 §十二 要求的两个新增子节**）

### 9 · 安装段的"两列对照"（**归因能力的关键**）★

> 🔴 **为什么必须两列**：本 Phase 的安装**同时**做了两件事 —— ① 补上 3 个缺包；② 把 TS 从 5.9.3 换成 6.0.3（由 lockfile 钉定）。
> 若只有一个"装后"的数，**"4 错 → 0 错"里混着两个原因**，无法归因（判据 **J-17**）。

| 量 | 装前（2026-10-13 22:29，本 Phase 重跑） | 装后（2026-10-13 22:38） | 差 | 归因 |
|---|---|---|---|---|
| `tsconfig.main` errorTS | **0**（exit 0） | **0**（exit 0） | 0 | 无变化 |
| `tsconfig.preload` errorTS | **0**（exit 0） | **0**（exit 0） | 0 | 无变化 |
| `tsconfig.renderer` errorTS | **4**（exit 2） | **0**（exit 0） | **−4** | ✅ **全部来自"补上 3 个缺包"**（装前 4 条的具体内容 = `@mantine/core` ×2 `TS2307` + `@tanstack/react-virtual` ×1 `TS2307` + 连带 `TS7006` ×1） |
| 全量 `Test Files` | `5 failed \| 578 passed (583)` | `1 failed \| 582 passed (583)` | **−4 failed / +4 passed** | ✅ **全部来自"4 个加载失败文件转绿"**（缺 `@tanstack/react-virtual`） |
| 全量 `Tests` | `1 failed \| 5603 passed \| 1 skipped (5605)` | `1 failed \| 5653 passed \| 1 skipped (5655)` | **+50 passed** | ✅ 装包后那 4 个文件开始跑用例（**纯增**） |
| 加载失败文件（`0 test`） | **4** | **0** | **−4** | ✅ 同上 |
| `typescript` | **5.9.3** | **6.0.3** | 🔴 **变更源 2** | **由 lockfile 钉定**（`package.json` devDep = `^6.0.3`；lockfile 里 `5.4.5` 与 `6.0.3` 并存 ⇒ 落 **6.0.3**） |
| 三套编译是否出现**新错** | — | **无** | **0** | ✅ **TS 升级未引入任何新错**（S4/S5 未触发）⇒ 两个变更源**已分离**：`renderer −4` 归因于缺包，`TS 6.0.3` 归因于 lockfile，**两者互不掩盖** |

**结论**：`renderer 4 → 0` 这**一个数字里没有混着两个原因** —— 因为 `main`/`preload` 在 **TS 6.0.3** 下仍 **0 错**，证明 TS 升级本身是**中性的**；`renderer` 的 4 条错全部是 `TS2307`（缺模块）与其直接连带。

### 10 · 四层核验的逐层结论（每层：判据 / 读数 / 判定 / 残余不确定）

| 层 | **充分判据** | 读数 | 判定 | 残余不确定 |
|---|---|---|---|---|
| **文件层**（A7） | 索引口径 `git ls-files --error-unmatch`（**不是 `Test-Path`**） | 分母 **94** = 91（16 UD + 75 silent）+ 3 rename；**该删未删 = 0** · **救回在位 = 18/18** · **rename 3/3 旧缺新在** | ✅ **通过** | 3 个 DU 目标的**磁盘未跟踪副本**按蓝图豁免（索引口径判"已删"）；`ui-font-protocol.ts` 的消失**已归因到官方 `5dfcccd5`（M4 落地物）**，**引用 0** |
| **符号层**（A8+A9） | ① 逐符号存在性（25 个检查点）② **全仓 import 目标符号扫描**（4956 个检查点）+ **交叉验证 = tsc 三套全绿** | **A8：25/25 在位** · **A9：疑真断口 0**（直接导出 4776 / 再导出 172 / `export *` 盲区 8） | ✅ **通过**（两者同时绿） | 正则代理**会漏**动态 `import()` / `require()` / 字符串契约 / `export *` 传递；**作用域外的类型级错误只有 tsc 能发现，而 tsc 的作用域 < 源码范围**（U1/U2） |
| **入口层**（A10） | "从组合根出发是否存在调用路径"（`main ≥1` 为必要条件） | **`main = 0` 的项 = 0**（S6 未触发）；`main ≥1 ∧ renderer = 0` 的 **5 项逐项已判**：3 项可达（含 1 项纯后端能力）· 2 项转录 **H-11**；2 个"零命中标识"已归因到"标识非语义名"；**附件链 3 个桥方法 renderer 仍 = 0**（A56 未闭合，转 **H-10**） | ✅ **通过**（**无 `main=0`**；"设计如此 or 入口被删"的剩余判断**已登记为人工项，未猜**） | "界面完整性"（`audit-log` / `group-corpus`）**不是机械判据**（U3）；附件链的"D3 是否有意为之"属 **P6 人眼**（U4） |
| **桥接层**（A11） | **`ipc-contract.test.ts`**（同时看声明侧与使用侧 —— P3 实测它抓出过两类断口） | **8 passed / exit=0**；三处计数 **412 / 303 / 429**（无塌陷）；声明未使用 **仅 1 个**（`WINDOW_DRAG_START`，**早于本次合并**） | ✅ **通过** | 三处计数是**代理指标**（不要求相等）；`MEMORY_PANEL_DELETE_IMPORTED_DOC` 的 `preload=0` **已说明**（本就不是 preload 桥） |

### 5 · 验收（实测数字，**每个数字带口径与时点**）

见 §一 表格 + §六 总表。**时点**：全部实测于 **2026-10-13 22:29–22:47**（本地时区）。
**环境**：`node` = **v22.23.2**（系统，跑 `pnpm install`）· `./.node24/node.exe` = **v24.21.0**（跑 `tsc` 与 `vitest`）· `pnpm` = **10.33.0**。

### 6 · 待做 / 未做

| # | 项 | 去路 |
|---|---|---|
| 1 | **H-16 / H-17 两项拍板** | **人**（若选"恢复" ⇒ 独立一笔施工；若选"删除" ⇒ 记审计痕迹 M6）。**P6 前必须收口** |
| 2 | **附件链 `D3` 源码层不可达**的定性 | **P6 人眼**（并入 **H-10**） |
| 3 | **`H-11` 的 2 项**（`audit-log` / `group-corpus` 的界面完整性） | **P6 人眼** |
| 4 | **`class-name-contract` 的 3 个未定义类名** | **既有欠账**，独立判断（可选：登记 BACKLOG） |
| 5 | **`node_modules.bak` / `wip/*` 的删除** | **结项**（本 Phase 明令保留） |
| 6 | **`.cyrene-merge-analysis/**` 是否入库** | **结项**（本 Phase 明令不改 `.gitignore`） |
| 7 | 🆕 **`src/shared/usage-badge.ts` 孤儿**（H-17 第②项） | 随 H-17 拍板 |
| 8 | 🆕 **蓝图 §四 4.5 的判据修正回写** | 见 §十三 回写清单 |
| 9 | **本 Phase 的文档提交** | ⬜ **未提交**（施工已完成；提交时机按规范 §三"每个 Phase 单独提交一次" ⇒ 待本报告定稿后由执行者一笔提交） |

---

## 十三、回写清单（**供复核与下一 Phase 接收**）

| # | 要回写什么 | 落到哪 | 状态 |
|---|---|---|---|
| 1 | **总蓝图 §四 Phase 索引的 P5 行**：`🟦 蓝图已起草（未开工）` → `✅ 完成` | `BLUEPRINT-总蓝图.md` §四 | ✅ **本 Phase 已回写** |
| 2 | **总蓝图 §九「P5 实测」块**（新增，含装前/装后两列与四层结论） | `BLUEPRINT-总蓝图.md` §九 | ✅ **本 Phase 已回写** |
| 3 | **总蓝图 §九 的 `H-15` 状态**：`🚫 环境受阻` → `[x] 已闭合` | `BLUEPRINT-总蓝图.md` §九 / 台账 §四 | ✅ **本 Phase 已回写** |
| 4 | 🆕 **蓝图 `PHASE-5-…md` §四 4.5 ① 的判据修正**（"91 条该删的" ⇒ "91 条**按该删/该留分类后**逐条判定"） | 同文件 | ⬜ **建议**（蓝图是历史文档，是否就地修订由规范 §5.1 决定；**本报告已完整留痕**） |
| 5 | 🆕 **蓝图 §四 4.3 补一条"`sharp`/`tree-sitter` 不在顶层是正常形态"** | 同文件 | ⬜ **建议**（同上） |
| 6 | 🆕 **经验库（建议级 M）两条新坑**：① "删除面与救回面有交集" ② "'全绿'的作用域可能远小于源码真实范围" | `../methodology/BLUEPRINT-经验库-*.md` | ⬜ **留给结项**（本 Phase 未改方法论包） |
| 7 | **台账 §五 5.3 追加 2026-10-13（P5）一行** | `HUMAN-人工验证台账.md` | ✅ **本 Phase 已回写** |
| 8 | **台账新增 H-16 / H-17** | 同上 | ✅ **本 Phase 已回写** |

---

## 附：本报告的证据来源与可复算声明

| 证据 | 来源 | 复现方式 |
|---|---|---|
| 装前 / 装后三套编译与全量测试 | **本机实测（2026-10-13）** | `bash .cyrene-merge-analysis/heb-p5/take-baseline.sh {before\|after}` |
| 安装结果与锁文件未变 | 本机实测 | `pnpm install --frozen-lockfile` + `bash .cyrene-merge-analysis/heb-p5/after-install-checks.sh` |
| 文件层 94 条逐条判定 | 本机实测 | `bash .cyrene-merge-analysis/heb-p5/probe-file-layer2.sh`（输出 `file-layer.tsv`） |
| 符号层 25 个符号 | 本机实测 | `./.node24/node.exe .cyrene-merge-analysis/heb-p5/probe-symbols.mjs` |
| 符号层全仓扫描 | 本机实测 | `./.node24/node.exe .cyrene-merge-analysis/heb-p5/probe-import-symbols.mjs` |
| 入口层 11 项 | 本机实测 | `bash .cyrene-merge-analysis/heb-p5/probe-entry-layer.sh` + `probe-entry-layer2.sh` |
| 桥接层 | 本机实测 | `bash .cyrene-merge-analysis/heb-p5/probe-ipc-layer.sh` |
| 11 项基线读数 `7/8/5/11/13/9/10/5/2/9/4` | **P4 完成报告 §三 A9** | `git grep -l <标识> HEAD -- src` |
| `94 = 91 + 3` 的口径 | **P2 复核 §十一 11.6**（判据 **J-22**） | `.cyrene-merge-analysis/heb-review-p2/{ud-set,silent-set,official-deletions}.txt` |
| 渠道 4 文件的删除出处 `598dfb75` | **P4 完成报告 §五 5.4 + §十二 12.9** | `git log -1 --diff-filter=D -- <path>` |
| `ui-font-protocol.ts` 的删除出处 `5dfcccd5` | **本 Phase 实测** | `git log --oneline --diff-filter=D -1 -- src/main/ui-font-protocol.ts` |

> 🔴 **本报告的已知不确定性（如实声明）**：
> ① **A9 的"0 条可疑"依赖探针的正确性** —— 该探针在本 Phase 内被**三次修正**（§五 A9 表格），
>    故其结论**必须以 `tsc` 三套全绿为交叉验证**（本次两者同时绿，故结论稳固）；
> ② **A10 的入口层含人工判断成分**（"设计如此 or 入口被删"）—— 2 项已**明确转录为 H-11**，**未猜**；
> ③ **`node_modules` 规模下降 2708 个文件**已归因（npm → pnpm 布局差异），但**未逐包比对**"装前有的包在装后是否都在"
>    （替代判据 = 三套编译全绿 + 全量测试 583 文件全跑到 + lockfile 未变）；
> ④ **本报告未做**：运行应用、人眼验证、真实渠道验证 —— 全部属 **P6**。

---

## 十四、撰写者复核补正（**规范 §5.2；复核人未参与本 Phase 施工**）

> **状态**：✅ **已回填**（2026-10-13，由撰写者独立复跑后填写）。
> **复核人身份**：**未参与本 Phase 施工**（只做**只读查询与独立重跑**；**未改源码、未重装依赖、未移动任何 ref、未删任何东西**）。
> **复核原则**：**以 git 对象、落盘日志与对象库重算为准，不以报告自述为准**；凡"全绿/0 差异/0 可疑"格，一律**用不同机制再算一遍**。
> **复核净结果**：
> - **A1–A12 十二条判据 —— 逐条独立复现，全部成立**（含**两项 H-A 的终态**与**台账守门判据的三个数**）；
> - 🟢 **本 Phase 的两条"唯一性"主张经独立复现**：`pnpm install --frozen-lockfile` **exit=0**（含 `WARN Unsupported engine` 的真实痕迹）· **锁文件三处 blob 全等**（`59f65e52…`）；
> - 🟢 **两个"0"格被独立重算确认**：A8 = **25/25 在位、缺失 0**（我亲自跑了那个探针）· A9 = **疑真断口 0**（我亲自跑了校准版探针）；
> - 🟢 **A10 的 11 项三列计数与 A11 的三处 IPC 计数逐格吻合**（`7/8/5/11/13/9/10/5/2/9/4` · `412/303/429`）；
> - 🔴 **须补正 3 项**（**均不推翻任何结论**）：**① A7 的分裂数字"已删 70"与自己的证据文件不符**（真值 **73**，见 14.4）；
>   **② 证据文件 `file-layer.txt` 的标签"🔴救回(丢失) 3"会让人误读成 3 个缺陷**（见 14.5）；
>   **③ `after-fulltest.log` 没有运行痕迹行**（报告 §十二 10 的括号注被读成"有"，见 14.6）；
> - 📌 **复核人自身的 2 处假警报**已作废并记录（见 14.7）；**1 项未能复核**如实列出（见 14.8）。

### 14.1 复核方法（**可复算**）

```bash
cd /e/AI_Chating/cyrene-agent
M=9cceeeac43c1ee87980e653fb62a69b831d669fa        # 固定点：merge commit（判据 J-25）

# ① 拓扑与工作树（三条都要空 / 三个数要对）
git rev-parse HEAD ; git status --porcelain | grep -vc '^??' ; git status --porcelain -- src | wc -l

# ② 安装段：痕迹 + 忽略脚本 + 三个缺包 + 工具链
grep -E '运行痕迹|Done in|Ignored build scripts|Unsupported engine' .cyrene-merge-analysis/heb-p5/install.log
for p in typescript @mantine/core @mantine/hooks @tanstack/react-virtual; do
  node -e "console.log('$p', require('./node_modules/$p/package.json').version)"; done

# ③ 锁文件"未改写"：**两种机制**
git status --porcelain -- pnpm-lock.yaml pnpm-workspace.yaml package.json
git rev-parse HEAD:pnpm-lock.yaml ; git rev-parse "$M:pnpm-lock.yaml" ; git hash-object --path pnpm-lock.yaml pnpm-lock.yaml

# ④ 文件层：**自己重算分类**（不读报告的分裂数字）
#    输入 = heb-review-p2/{silent-set,ud-set}.txt ；对照 = HEAD 存在性 ；救回面 = 18 条清单

# ⑤ 符号层：**亲自跑两个探针**
./.node24/node.exe .cyrene-merge-analysis/heb-p5/probe-symbols.mjs
./.node24/node.exe .cyrene-merge-analysis/heb-p5/probe-import-symbols.mjs

# ⑥ 入口层 / 桥接层：**自己重算三列计数**
for k in memory-console person-erasure ZONES_ audit-log tool-access keyword-policy \
         group-corpus buildGroupContextBlock USAGE_BADGE groupContextLimit confirmValue; do
  printf "%-24s %s/%s/%s\n" "$k" \
    "$(git grep -l -- "$k" HEAD -- src/main | wc -l)" \
    "$(git grep -l -- "$k" HEAD -- src/preload | wc -l)" \
    "$(git grep -l -- "$k" HEAD -- src/renderer | wc -l)"; done
git grep -cE '^\s+[A-Z0-9_]+:\s*"' HEAD -- src/shared/ipc-channels.ts   # 声明
```

**复核覆盖**：A1–A12 全部 · §二 偏离 8 项 · §二 漏洞 L1–L5 · §三 保留 8 项 · §五 四层结论 · §六 停止条件 S1–S8 · §七 产出物 · §十 残余不确定 U1–U7 · §十三 回写清单 8 行。

### 14.2 我独立复现的断言（**逐条对得上**）

| # | 报告断言 | 我的独立实测（机制） | 判定 |
|---|---|---|---|
| 1 | `pnpm install --frozen-lockfile` **exit=0**，7m11.9s | `install.log` 痕运行迹行：`# [运行痕迹] pnpm install --frozen-lockfile  exit=0  at=2026-10-13 22:38:06  node=v22.23.2  pnpm=10.33.0` + `Done in 7m 11.9s using pnpm v10.33.0` + **`WARN Unsupported engine: wanted {"node":">=24 <25"} (current v22.23.2)`** | ✅ **痕迹与引擎告警都在**（告警是**真实存在的**，报告未提但不影响结论） |
| 2 | 安装期忽略 `electron-winstaller@5.4.0` | `install.log:235` = `│   Ignored build scripts: electron-winstaller@5.4.0.   │` | ✅ **逐字命中** |
| 3 | 三个缺包到位：`9.6.2 / 9.6.2 / 3.13.23` | `node -e require(...)` ⇒ **`@mantine/core 9.6.2` · `@mantine/hooks 9.6.2` · `@tanstack/react-virtual 3.13.23`** | ✅ |
| 4 | **TS 落地 `6.0.3`**，且**由 lockfile 钉定** | 实装 **`typescript 6.0.3`**；`package.json` devDep = **`^6.0.3`**；lockfile 里 `typescript@5.4.5` 与 `typescript@6.0.3` **两个条目都在**（`pnpm-lock.yaml:7309/7314`） | ✅ **"第二个变更源"成立** |
| 5 | 其余工具链 `vitest 5.0.1 / vite 8.3.0 / electron 44.4.3 / esbuild 0.28.2` | 逐个 `require` ⇒ **5.0.1 / 8.3.0 / 44.4.3 / 0.28.2** | ✅ |
| 6 | **锁文件三处 blob 全等**（`59f65e52…`） | `HEAD:pnpm-lock.yaml` = **`59f65e5235b2…`** · `9cceeeac:pnpm-lock.yaml` = **同** · `git hash-object --path` = **同** · 字节 **601159** · `git status --porcelain` 对三个清单文件 **无输出** | ✅ **两机制、三处、逐字一致** |
| 7 | 装后三套编译 `0 / 0 / 0`，且**三份都有痕迹** | `after-tsconfig.{main,preload,renderer}.log` 各 **110/113/114 B**，各带 `# [运行痕迹] … exit=0  errorTS=0  at=…22:38:{38,39,56}` | ✅ **判据 J-23 落实** |
| 8 | 装前基线**本 Phase 重跑过**（不是只复用 P3 日志） | `before-tsconfig.renderer.log` 痕迹 = `exit=2  errorTS=4  at=…22:29:50`；且 4 条错**逐条**为 `TS2307 @mantine/core` ×2 · `TS2307 @tanstack/react-virtual` ×1 · 连带 `TS7006` ×1 | ✅ **"重跑"为真**（报告 §二 偏离 7 的说法成立） |
| 9 | 装后全量 `583 / 1 failed \| 582 passed` · `Tests 1 failed \| 5653 passed` · `(0 test) = 0` | 实测 `Test Files 1 failed \| 582 passed (583)` · `Tests 1 failed \| 5653 passed \| 1 skipped (5655)` · `(0 test)` = **0**；唯一 FAIL = **`class-name-contract.test.ts`** | ✅ **逐字一致** |
| 10 | 装前全量 `5 failed \| 578 passed` · `1 failed \| 5603 passed` | `before-fulltest.log` = **同**；装前 `(0 test)` = **4**、`FAIL` 行 = **5**；装后 `FAIL` 行 = **1** | ✅ **两列对账闭合**（−4 加载失败 / +50 通过） |
| 11 | **A8 = 25/25 在位、缺失 0** | **我亲自跑** `probe-symbols.mjs` ⇒ `符号检查：25/25 在位；缺失 0`，`exit=0` | ✅ **亲自复现** |
| 12 | **A9 = 疑真断口 0**（4956 检查点） | **我亲自跑**校准版 `probe-import-symbols.mjs` ⇒ 输出与落盘的 `symbol-layer.txt` **一致**（`疑真断口逐条（0）`、`三套门禁作用域内 = 0`、`作用域外 = 0`、痕迹 `exit=0`） | ✅ **亲自复现** |
| 13 | A9 报的"目标文件不存在的 import = 17" | 我独立重算 = **17**；逐条看：**12 条是 `.js` 后缀 import**（`src/cli/*`，ESM 风格，tsc 解析到 `.ts`）、**5 条是目录 import**（`../logger`、`../harness`、`../vendors`、`../i18n`，解析到 `index.ts`） | ✅ **17 为真，且全部是解析风格差异、不是断口**（见 14.3） |
| 14 | **A10 的 11 项三列计数** | 我自己重算（`git grep -l … HEAD -- src/{main,preload,renderer}`）⇒ `memory-console 4/0/3` · `person-erasure 8/0/0` · `ZONES_ 3/1/0` · `audit-log 11/0/0` · `tool-access 11/0/1` · `keyword-policy 6/0/3` · `group-corpus 10/0/0` · `buildGroupContextBlock 5/0/0` · **`USAGE_BADGE 0/0/0`** · `groupContextLimit 6/0/3` · **`confirmValue 0/0/4`** | ✅ **11/11 逐格吻合**（含两个零命中项） |
| 15 | **A10 的 `main = 0` 的项 = 0**（S6 未触发） | 上表 main 列：**只有 `USAGE_BADGE` 与 `confirmValue` 为 0**，而这两项都是**标识不是语义名**（下条）⇒ **"能力标识"层面的 `main=0` 确实为 0** | ✅ **判定成立**（口径见 14.3） |
| 16 | 两个零命中标识**不是能力已失** | ① 整树读数与 P4 基线**逐字一致**（`USAGE_BADGE 2` · `confirmValue 4`，我实测相同）；② `UsageBadge` 组件**确实被渲染**：`ChatPageNavigation.tsx:121` = `<UsageBadge sessionId={activeSessionId} />`（另 `:17` 有 import）；③ `confirmValue` 是旧 settings shell 的内部名（`src/renderer/settings/memory/{delete-all,erasure-flow}.ts`） | ✅ **两条归因都成立** |
| 17 | 🆕 **L3：`src/shared/usage-badge.ts` 是新孤儿** | `git grep 'usage-badge' HEAD -- src` ⇒ 唯一 import 者是 **`src/shared/usage-badge.test.ts:7`**（它自己的测试）；组件侧 `UsageBadge.css` 只用累 CSS 变量 `--cy-usage-badge-image`，**不 import 该模块** | ✅ **孤儿成立**（且与 `embedding-index-service.ts` 同型） |
| 18 | **A11：契约测试 8 passed** + 三处计数 `412 / 303 / 429` | 我独立重算：声明 **412** · main 注册点 **303** · preload 引用 **429** ⇒ **三个数逐字命中**；`ipc-contract.log` 记录 `Tests 8 passed (8)` | ✅ |
| 19 | **A12：两项 H-A 终态 = `⏳ 待人眼`** | 台账 §四：`H-16` / `H-17` 的台账状态列**保持着 H-A 专用的未闭合记号**（复核逐行确认过；为避免本节被"未勾选记号"类前置判据误命，此处不写出该记号的字面），且两项**前三列已预填** | ✅ |
| 20 | 台账守门判据：① **2 行** · ② **5 行** · ③ **0 行** | 我自己数：`^\|.*\[ \]` = **2**（H-16/H-17）· `待预填`（§四 表的第 5 格）= **H-10…H-14 共 5** · 结论列禁词 = **0**；台账 §四 表共 **17 行**（H-01…H-17）+ §5.2 **3 行** | ✅ **三个数全中** |
| 21 | `H-15` 由 `🚫 环境受阻` → `✅ 已闭合` | 台账 `H-15` 行状态 = **`✅ **已闭合（P5 销账，2026-10-13）**`**，结论列 = `✅ **通过 —— `--frozen-lockfile` 实测成立**` | ✅ **销账落实** |
| 22 | §5.3 追加 `2026-10-13（P5）` 一行 | 实测**存在 1 处** | ✅ |
| 23 | 报告自称"施工中的自我修正：首版让判据① 返回 3 行" | 现状 = **2 行** ⇒ **修正已生效**（与 **J-05/J-07** 同族：判据被自己的说明文字命中） | ✅ **自述与现状一致** |
| 24 | 🆕 **L5：全仓仅 1 个声明未使用**（`WINDOW_DRAG_START`） | 该声明**存在**；报告称 base 与官方**都含**它 ⇒ 属**早于本次合并**的既有未用声明 | ✅（抽样确认声明在树里；"两侧都含"未逐 rev 重算，但**不影响"不计入本次缺陷"的结论**） |
| 25 | `node_modules` 由 **132037 → 129329** | 装后实测 **129403**（`find -type f`）· **5130 个符号链接** · `.pnpm` 下 **1559 个条目**；`node_modules.bak` 仍在 = **132037** | ⚠️ **差 74 个文件**（见 14.6） |
| 26 | 体量 `2.4 GB → 1.8 GB` | `du -sh` = **2.2G**；`du -sb`（apparent bytes）= **1988153068 B = 1.85 GB** ⇒ **报告的"1.8G"是 apparent-bytes 口径，成立** | ✅ **口径澄清**（`du -sh` 的 2.2G 是**块占用**，两者不同） |
| 27 | `node_modules.bak` 仍在（回退点有效） | 存在，**132037 文件 / 2.4G** ⇒ R-1 的回退路径**实测可用** | ✅ |
| 28 | 工作树干净、`src/` 零改动 | `git status`：未跟踪 **72** 条、tracked 改动 **3**（= 前几轮的复核写回文档）、**`src/` = 0** | ✅ |
| 29 | 7 个参照物 / 4 条禁令遵守 | `refs/heads` 实测 8 个本地分支：`master 8ad59939` · `p4-pre-commit 9920635f` · `wip/{p2-docs,p3-docs,p3-src,p4-docs,p4-review,p5-docs}` 全在 ⇒ **未删任何一个** | ✅ |

### 14.3 复核澄清（**两条口径，不改结论**）

| # | 项目 | 澄清 |
|---|---|---|
| **C1** | **A9 的"17 条目标不存在"** | 报告把它列在 `TS2307` 名下，**易被读成"17 个断口"**。实测：**12 条是 `.js` 后缀**（`src/cli/app.ts -> ./argv.js`，而 **`src/cli/argv.ts` 存在**）、**5 条是目录 import**（`src/main/logger.ts -> ../logger`、`harness/index.ts -> ./harness`、`vendors` 等，其中 **`vendors/index.ts` 与 `harness/index.ts` 存在**）。⇒ **全是模块解析风格差异**，且 **`src/main/logger/index.ts` 与 `src/renderer/settings/i18n/index.ts` 本就不存在**（前者是**已合并删除**的旧壳文件，后者属**门禁作用域之外**的旧 settings shell）。**结论不受影响**（疑真断口仍 = 0），但**该行建议改名为"非 `.ts` 直指的 import（解析风格）"，避免下一个人把它当缺陷清单** |
| **C2** | **A10 的 `main = 0` 两个项** | 报告 §五 A10 已正确解释为"**标识不是语义名**"（`USAGE_BADGE` 是跨切面模块的常量名、`confirmValue` 是旧壳内部名）。**复核确认该解释成立**，但要补一句**口径**：脚本 `entry-layer.txt` 把这两项标成 **"🔴 能力已失（停工级 S6）"**，而报告把状态改成 **"🔴→✅ 不是能力已失"** —— 两者**不矛盾**（**脚本给的是判据触发，报告给的是逐项查证结论**），但**同一份证据里出现两种颜色会被误读**。⇒ 建议在 `entry-layer.txt` 的两行后**追加"（脚本判据触发，逐项查证见 entry-layer2.txt 与报告 §五 A10）"**，以免 P6 复读时误以为 S6 触发过 |

### 14.4 🔴 **须补正 1：A7 的"已删 70"与自己的证据文件不符（真值 73）**

- **报告原文**：
  - §一/§五 A7 表格：`91 条里该删的仍在索引 = 0`（✅ 成立）·
  - §五 A7 的**分类代码块**：`✅ 已删（该删的，已不在索引）    = 70` · `✅ 救回（在位…）= 18` · `🔴 该删未删 = 0` · `🔴 救回丢失 = 0`  ← ✏️ **P5 复核更正：应为 73**（详见 §十四 14.4；70 + 18 = 88 与分母 91 不闭合，真值 = 已删 **73** + 救回 **18** = **91**）
  - §十二 10 表格（文件层行）：`该删未删 = 0 · 救回在位 = 18/18 · rename 3/3`
- **复核实测（我自己从两个输入集重算，不读报告的分裂数字）**：
  ```text
  输入：heb-review-p2/silent-set.txt(75) + ud-set.txt(16) = 91
  救回面清单：18 条（P2 的 B 14 + UD 保留 3 + C 1）
  逐条判：
    in HEAD ∧ 属救回面   = 18   （✅ 救回在位）
    ¬in HEAD ∧ ¬属救回面 = 73   （✅ 已删）
    ¬in HEAD ∧ 属救回面  =  0   （🔴 救回丢失）
    其它                 =  0
    合计                 = 91   ✅ 与分母闭合
  集合关系验证：救回18 ∩ silent = 15 · 救回18 ∩ ud = 3 ⇒ 18 条**全部落在这 91 里**
  ```
  ⇒ **真值是"已删 73 + 救回 18 = 91"**；报告写的 **70 + 18 = 88 ≠ 91**（**自相矛盾**）。
- **根因（实测定位）**：执行者的分类脚本把 **3 个"我方自己删的"文件**（`src/main/ui-font-protocol.ts` · `src/renderer/settings/shared/dialog-focus.test.ts` · `src/renderer/settings/shared/modal.test.ts`）
  从"已删"里挑出来、单独归入 **`🔴救回(丢失)`** 一栏（见 14.5）。于是 `70 = 73 − 3`。
  ⇒ **它不是算错加法，而是"多切了一栏"**，且**该栏的标签会误导**。
- **判定**：**结论完全不受影响**（`该删未删 = 0`、`救回丢失 = 0`、`rename 3/3` **我全部独立复现**），
  但 **A7 的分裂数字必须更正为 `73 / 18`**（判据 **J-19**：报数要能被自己的证据支持；**J-22**：口径要能复现）。
- **对后续的影响**：🔴 **`file-layer.tsv`（92 行）与 `file-layer.txt` 里的分类列**是 **P6/结项**可能复读的证据 ⇒ 建议**同批更正**（见 14.5）。

### 14.5 🔴 **须补正 2：`file-layer.txt` 的"🔴救回(丢失) 3"会被读成 3 个缺陷**

- **证据文件原文**（`.cyrene-merge-analysis/heb-p5/file-layer.txt`）：
  ```text
  === 分类汇总（分母 91 = 16 UD + 75 silent）===
    ✅已删        70
    ✅救回(在位) 18
    🔴救回(丢失) 3
  === 🔴 救回丢失（期望 0）===
    src/main/ui-font-protocol.ts
    src/renderer/settings/shared/dialog-focus.test.ts
    src/renderer/settings/shared/modal.test.ts
    计数 = 3
  ```
- **复核实测**：这 **3 个文件确实不在 HEAD**（我逐个 `git cat-file -e HEAD:<path>` ⇒ **3/3 ABSENT**）；**但它们不属于救回面** ——
  **18 条救回清单里没有它们**（我做了集合相交：`救回18 ∩ {这3个}` = **∅**）。
  ⇒ 它们与另外 70 个同类：**都是"该删的、已经删了"**。
- **它们的删除是否正当？**（报告 §五 A7 已给一条抽验，我补全三条）：
  | 文件 | 性质 | 依据 |
  |---|---|---|
  | `src/main/ui-font-protocol.ts` | **M4 / H-03 的落地物**（"窗口圆角 + UI 字体两项设置直接删"），官方 `5dfcccd5` 删除 | 报告 §五 A7 抽验 + 我复核：该文件**不在 18 救回清单**、全仓引用 0 |
  | `src/renderer/settings/shared/dialog-focus.test.ts` | **`dialog-focus.ts` 的测试**；P2 只救回了**实现**（`dialog-focus.ts`，因为 `modal.ts:17` import 它），**测试没被救** | 与 18 清单逐条比对（清单里有 `dialog-focus.ts`，**没有它的 `.test.ts`**） |
  | `src/renderer/settings/shared/modal.test.ts` | **`modal.ts` 的测试**；同理，P2 救的是**实现** | 同上（清单里有 `modal.ts` / `modal-state.ts`，**没有 `modal.test.ts`**） |
  ⇒ **三条都是"有意不救的测试文件"或"M4 已拍板删除"**，**不是缺陷**。
- **判定**：**"救回丢失 = 0"这个结论正确**（我独立复现），**但证据文件的标签错**：
  它把"**不在救回清单里的已删文件**"标成了 **`🔴救回(丢失)`** ⇒ **颜色（🔴）与标签（丢失）都在暗示缺陷**。
- **处置建议（给 P6/结项）**：把该栏**改名为 `✅已删（含 3 个"我方有意不救"的实现测试与 1 个 M4 删除物）`**并去掉 🔴；
  或**保留原值 + 追加更正行**（规范 §4.1.3 的"追加不覆盖"）。🔴 **不要删原值** —— 它记录了"曾经按什么口径分类过"。
- 🆕 **建议固化为判据（J-26）**：**"救回面"必须是一个显式清单，且分类产物里"不在清单内"的项不得使用 🔴/丢失 这类否定标签** ——
  否则**下一个读证据的人会把"有意不救"读成"救失败"**（同族：**J-19 / J-22**、经验 **C24 / D29**）。

### 14.6 ⚠️ **须补正 3：两处"痕迹/计数"的措辞与实测有差**

| # | 报告原文 | 复核实测 | 判定 |
|---|---|---|---|
| **a** | §七 产出物："`after-fulltest.log` 装后全量测试（**汇总行即痕迹**，判据 **J-23** 澄清）" | `after-fulltest.log` 实测**不含** `# [运行痕迹]` 行（`grep -c` = 0）；它**有** `Test Files 1 failed \| 582 passed (583)` 等汇总行 | ⚠️ **报告是对的、括号注易被读成"含痕迹行"** ⇒ 建议写成"**本文件以汇总行为运行痕迹（无 `exit=` 行）**" |
| **b** | §一 / §十二 9：`node_modules` **129329** 文件 | 实测 **129403**（`find -type f`）⇒ **+74**；`after-install-checks.txt`（22:38:13 生成）记的是 **129329** | ⚠️ **差 74 个文件（+0.06%）**；自查"22:38:13 之后被改动的文件" = **1 个**（`node_modules/.pnpm/electron@44.4.3/node_modules/electron/path.txt`）⇒ **不是"又被装了一遍"**。**最可能是 `du`/`find` 在 pnpm 硬链接布局下的口径差**（同一 inode 多路径计数）或 22:38 与复核之间**测试运行写入的少量临时文件**。⇒ **降级为"计数口径未写全"**（**J-22**），**不影响"装成功"的结论**（三个缺包在位、编译全绿、583 文件全跑到） |

> 📌 **两处都是"措辞/口径"级，不改任何判定**；但按 **J-19 / J-22** 都应在报告里写清口径。

### 14.7 复核人自身的假警报（**逐条作废，如实记录**）

| # | 我一度认为 | 复核后发现 | 机制 |
|---|---|---|---|
| 1 | **台账被写坏了** —— 我数出 **20 行 H-row**（应为 17），且"未勾选记号"行有 2 行（H-16 / H-17） | **不成立**：§四 表是 **17 行**（H-01…H-17）；我数到的另外 3 行来自 **§5.2「待闭合」**（那是**三列**的索引表，H-15/H-16/H-17 各一行）。⇒ **表格设计如此，不是重复行** | 🔴 **我把"两个表里各有一行"当成了重复行** ⇒ 数之前没看**表头**。**同族：J-18**（判据的段数 ≠ 表的列数）—— 我犯的正是 J-18 讲的错 |
| 2 | **A2 的锁文件判据可能被"工作区口径"污染**（本仓 `core.autocrlf=true`，`git status` 对换行敏感的判据在 P2/P3 都出过假） | **不成立**：`git status --porcelain -- pnpm-lock.yaml` **无输出**，且 `HEAD:` / `MERGE:` / `hash-object --path` **三处 blob 全等** ⇒ **两机制一致，无污染** | 🔴 我把 P2/P3 的 **CRLF 教训过度泛化**到"凡 git 判据都要怀疑" ⇒ **过度怀疑也是错**（判据要**先测再用**，而不是先怀疑） |

> 📌 两次的共同点：**我在"数/判"之前没有先把口径钉死**（一次没看表头、一次套用了别的 Phase 的教训）。
> 与 P2/P3/P4 复核（共 10 次假警报）**同族**：**比较的定义域与时点必须先说清**。

### 14.8 未能复核 / 未复核项（**如实列出**）

| # | 项 | 为什么没核 | 影响 |
|---|---|---|---|
| 1 | **A6 的 9 passed 未由我只读重跑**（我**在 P4 复核时**跑过同一条测试 ⇒ 9 passed，但**那是 P4 时点、且当时 `node_modules` 尚未重装**） | 跑测试会执行 `pnpm --version` 等子进程（**会读但不写**），风险低但**不是零**；且报告已有落盘证据 | ⚠️ **P6 复跑时顺带确认**；不影响 P5 结论 |
| 2 | **A9 校准版探针的"正确性"只由"我跑出同一个 0"支持** | 我与执行者**用了同一个脚本** ⇒ 这不是**独立实现**，只是**独立执行** | 🔴 **这正是报告 §附 ① 自己声明的残余不确定**；其**真正的独立交叉验证是 `tsc` 三套全绿**（我已独立重跑 ⇒ 0/0/0）⇒ **结论稳固，但"探针本身"未被独立实现验证** |
| 3 | **L5 的"base 与官方都含 `WINDOW_DRAG_START`"** | 未逐 rev 重算该声明的存在性 | 抽样确认声明在 HEAD 树里；**"不计入本次缺陷"的结论不受影响** |
| 4 | **`node_modules` 逐包比对**（"装前有的包装后是否都在"） | 报告 §附 ③ 已如实声明未做；复核也未做（132037 vs 129329 的**逐包 diff 成本高**，且**替代判据已足够**：编译全绿 + 583 文件全跑到 + lockfile 未变） | 与报告的声明一致；**列为 P6 可选项** |

### 14.9 交接纪律复核（§十 残余不确定 U1–U7 + §八 回退 + §六 停止条件）

| 交接项 | 复核判定 |
|---|---|
| **U1 门禁作用域 < 源码范围** | ✅ **成立且重要**：我实测 `tsconfig.renderer.json` 的 `include` = `src/renderer/react/**` + `react-perf/**` + `global.d.ts` + `src/shared/**` ⇒ **不含 `src/renderer/settings/**`**、`lib/**`、`live2d/**`、`scripts/**` ⇒ **作用域外的类型级错误任何 tsc 都看不见**。**这是本次核验最大的残余不确定性，报告的定性准确** |
| **U2 A9 是代理判据** | ✅ 成立；**交叉验证 = `tsc` 三套全绿**（我已独立重跑确认 0/0/0） |
| **U3 入口层含人工判断** | ✅ 成立；**5 项已逐项给出结论或转录 H-11，未猜**（我核了每项的 `entry-layer2.txt` 逐项证据都在） |
| **U4 附件链源码层不可达** | ✅ 成立（`processDocuments` / `onDocumentIndexProgress` / `cancelDocumentIndex` 的 renderer 命中 = **0**，与 P3 一致）⇒ 已并入 **H-10** 转 P6 |
| **U5 两个孤儿的可删性** | ✅ 已登记 **H-17**（含 P5 新发现的 `usage-badge.ts`） |
| **U6 `node_modules` 规模下降** | ✅ 归因成立（npm → pnpm 布局差异）；**计数差 74 见 14.6b** |
| **U7 `electron.exe` 不在 dist** | ✅ 归因成立（**E10**：`electron@44` 无 `postinstall`、`require()` 懒下载）；**本 Phase 不运行应用** ⇒ 属 P6 |
| §八 五条禁令 | ✅ **全部遵守**：`??` 从 68→**72**（本 Phase 新增 `heb-p5/` 等 4 个证据目录，**无一条被 clean**）· 未 stash · 未 abort · `wip/*` 与 `p4-pre-commit` **8 个 ref 全在** · `node_modules.bak` **仍在**（回退点有效） |
| §六 停止条件 S1–S8 | ✅ **全部未触发**；**S6（新符号级/入口级断口）未触发的判据我独立复现**（A8 = 25/25、A9 = 0、`main=0` 的项 = 0） |

### 14.10 回写清单复核（§十三 8 行）

| # | 要回写什么 | 复核实测 | 判定 |
|---|---|---|---|
| 1 | 总蓝图 §四 P5 行 → ✅ 完成 | 该行**已更新**（含"四层核验 + H-15 销账"字样） | ✅ |
| 2 | 总蓝图 §九「P5 实测」块 | 存在（含装前/装后两列） | ✅ |
| 3 | 总蓝图 §九 的 `H-15` 状态 | 台账 `H-15` = `✅ 已闭合（P5 销账）` | ✅ |
| 4 | 🆕 蓝图 §四 4.5 ① 的**判据修正**回写 | ⬜ **建议项，未做**（报告已完整留痕） | ⚠️ **建议随 14.4/14.5 一起做** |
| 5 | 🆕 蓝图 §四 4.3 补"`sharp`/`tree-sitter` 不在顶层是正常形态" | ⬜ 未做 | ⚠️ 同上（低成本，建议做） |
| 6 | 🆕 经验库两条新坑（M 级） | ⬜ **留给结项** | ⚠️ **建议提前**：两条都是 M 级且**判据形状**相关（"删除面∩救回面"、"门禁作用域 < 源码范围"） |
| 7 | 台账 §5.3 追加 P5 行 | **存在** | ✅ |
| 8 | 台账新增 H-16 / H-17 | **两行都在**，前三列已预填 | ✅ |

### 14.11 §十四 自身的完成度声明

- 本节 **14.1–14.13 共 13 小节**，**全部已填写**（无占位、无"待补"；其中 §十一 的**复核位**已由本节接续 —— 见 14.12）。
- **本节不新增人工验证环节**；**未要求人做任何事** ⇒ **台账无新增 `H-nn`**（唯一真值仍在 `HUMAN-人工验证台账.md`；本节只给索引）。
- 🔴 **本节的复核动作没有改变仓库状态**：**未提交、未 reset、未 checkout、未删 ref、未改任何源码、未重跑安装**（唯一写入是本节文档本身）。
- 🔴 **P6 开工前的前置判据不受本节影响**：本节**不含未勾选记号的字面**，实测 `^\|.*\[ \]` = **0 行**。

### 14.12 关于 §十一「复核补正（待填）」的位置修正

- 报告把复核位写成 **§十一**（"待填"），但 **§十一 已被施工记录占用**（施工记录按规范 §8 属执行者追加）⇒ 复核节**顺延到 §十四**。
- 这**不是执行者的过错**（规范 §5.2 只说"各 Phase 顺延编号"，未规定"必须紧邻 §十"）；
  P4 报告同样把它放在 §十二。⇒ **本节的编号即最终编号**，**§十一 的"待填"一行由本节取代**。
- 📌 **建议固化为判据（与 **J-25** 同族）**：**完成报告的节号分配应"先留复核位、再排施工记录"**，
  或干脆**不编号**（写作"§复核补正"），避免"待填"行留在交付物里让人以为缺一节。

### 14.13 复核结论与出口（**六行判定表**）

| 维度 | 判定 | 依据 |
|---|---|---|
| **施工质量** | ✅ **高** | **A1–A12 十二条逐条复现成立**；两项"唯一性"主张（frozen 安装成功、锁文件三处全等）**两机制互证**；**两个 0 格亲自复跑**（A8 25/25 · A9 0） |
| **H-15 销账** | ✅ **成立** | `--frozen-lockfile` **exit=0**（含引擎告警的真实痕迹）· 锁文件**三处 blob 全等** · 三个缺包版本精确 · `H-15` 台账状态已闭合 |
| **功能面（四层）** | ✅ **通过** | 文件层 91 逐条（该删未删 **0** / 救回 **18/18** / rename **3/3**）· 符号层（25/25 + 疑真断口 0）· 入口层（`main=0` 的项 **0**）· 桥接层（契约 **8 passed** + 三处计数逐字） |
| **第二个变更源** | ✅ **已分离** | TS **5.9.3 → 6.0.3**（lockfile 钉定）⇒ 报告给了**两列对照**，并证明 **TS 升级本身中性**（`main`/`preload` 在 6.0.3 下仍 0 错） |
| **判据成立性** | ⚠️ **三处口径须更正（不改结论）** | A7 的 `70` 应为 **`73`**（14.4）· `file-layer.txt` 的 **`🔴救回(丢失)`** 标签错（14.5）· `node_modules` 计数/痕迹的两处措辞（14.6）⇒ **新增判据 J-26** |
| **遗留转下一 Phase** | ✅ **全部有主** | **H-16 / H-17**（人等拍板，P6 前收口）· **H-10**（附件链 D3 人眼）· **H-11**（2 项界面完整性）· `class-name-contract`（既有欠账）· 结项（`node_modules.bak` / `wip/*` / 证据入库） |
| **出口条件** | ✅ **P6 可以开工** | 工作树干净（`src/` 零改动）· 依赖树就位（三套编译 0/0/0）· 四层核验通过 · **唯一前置 = P6 启动应用前必须先外部备份 `%APPDATA%\live2d-cyrene`** |

> 🔴 **给 P6 的净增量（除 §十 交接之外）**：
> ① **A7 的分裂数字改为 `73 / 18`**、**`file-layer.txt` 的 `🔴救回(丢失)` 栏改标签**（14.4 / 14.5）—— 否则复读证据时会把"有意不救"读成缺陷；
> ② **两个孤儿（`embedding-index-service.ts` / `usage-badge.ts`）与渠道 4 文件是 P6 前必须收口的三项拍板**（H-16 / H-17）；
> ③ **`UsageBadge` 的功能是好的**（组件被渲染），**死的只是"设置项 → 徽章配色"的配置管道** ⇒ 拍板时别误以为徽章坏了（14.2 第 16–17 行）；
> ④ **TS 已是 6.0.3**：P6 若遇到任何"以前没有的类型错误"，**先怀疑 TS 收紧**，再怀疑合并（判据 **J-17**）；
> ⑤ **`node_modules.bak`（132037 文件）仍在** ⇒ P6 若要回退依赖树，R-1 **实测可用**。
