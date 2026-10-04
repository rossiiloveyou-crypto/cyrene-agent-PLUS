# PHASE-10 施工蓝图：回落与加固（上游同步机制）

> **状态**：📝 **蓝图已写，待执行**（施工 = 文档 + 1 个开发脚本；**产品代码 0 行**，T6 除外）
> 🔴 **两个拍板点已定（项目所有者，2026，答复原文「AA」）**：
> · **H-20 = A** → **允许提交**（提交 1 = 脚本 + 状态文件）**且做 T6 小修**（提交 2）→ 本 Phase 上限 **2 次提交**
> · **H-21 = A** → 「里子」模块（+ `zones/picker.ts`）**保持现状、登记为只读参照**；B/C 两个选项**不在本 Phase**（要动产品代码，须单独立项）
> **依据**：[BLUEPRINT-总蓝图.md](BLUEPRINT-总蓝图.md) §四 P10 行 · §九「P10 待办」· [00-总体任务预览.md](00-总体任务预览.md) §五 Phase 9（= 本 P10）
> **前置**：P9.5 已完成（`d27920ab`）；**唯一未闭合的人工项是 H-19**（它不阻塞本 Phase 的文档与脚本工作，见 §五）
> **读者**：执行本 Phase 的 agent（无对话历史）+ 项目所有者（§五 的两个人拍板点）
> **规范**：[`../methodology/BLUEPRINT-撰写规范.md`](../methodology/BLUEPRINT-撰写规范.md) §4（12 节）

---

## ★零、开工前必读（硬约束 + 陷阱）

### 0.1 六条硬约束（违反任一条 = 本 Phase 失败）

| # | 约束 | 判据 |
|---|---|---|
| **C1** | 🔴 **产品代码 0 行改动**。本 Phase 不碰 `src/**` 里任何**运行期**文件；允许新增的只有 §七 列出的 **1 个开发脚本 + 1 个状态文件**（都在产品运行路径之外） | `git diff --name-only <base> <head> -- src` = **空**（除 H-20 拍板放行的 T6 小修） |
| **C2** | **不重新论证已拍板决策**（D1–D7）。特别地：`ApiConfigSection` 仍是 **H-16 · 不接回**；旁听 A/B 仍按 D3/D4 **不迁移** | 文档里出现"建议重新考虑 D…"即为越界 |
| **C3** | **不推送**（H-B6 未定）。本 Phase 若有提交，**全部是本地提交** | `git rev-parse origin/master` 仍 = `eb6c311a` |
| **C4** | 🔴 **不删任何本地独有文件、不动官方既有面板**。4 个「里子」模块的处置**必须由人拍板**（§五 H-21）——执行者**不得**自行删除它们，也**不得**把它们 `import` 进 React 侧（它们依赖已删的 `../i18n`、且 DOM 耦合） | `git diff --name-only <base> <head> -- src/renderer/settings` 里**不含**这 4 个路径 |
| **C5** | **文档纪律不变**：任务文档仍**不入库**（D6）。若执行者认为某份 SOP 必须进版本库，**那是修改 D6 → 停下来走 S2**，不要自行 `git add` 任务文档 | `git ls-files "docs/construction/合并"` = **0** |
| **C6** | 任何**计数 / 差异 / 行数**结论必须**带口径**（J-24 / J-25 / J-31）；跑全量前**先校准 PATH**（J-35） | 报告里每个数字后面都有口径说明 |

### 0.2 七个陷阱（本 Phase 实测相关，照做即可避开）

| # | 陷阱 | 正确做法 |
|---|---|---|
| **Y1** | `npx` 在本机不可用（PS 执行策略拦 `npx.ps1`） | 一律 `& D:\data\node24\npx.cmd <tool>`（X15） |
| **Y2** | 🔴 **全量测试的绿色依赖宿主 PATH** | 先 `$env:PATH = 'D:\data\node24;' + $env:PATH`；否则 `work-verification-closure` 会**假红**（J-35 / X19 / D21） |
| **Y3** | `git grep` **默认不搜未跟踪文件** | 本 Phase 的新文件多半未跟踪 → 加 `--untracked`（J-26 / X16） |
| **Y4** | PS 5.1 计数陷阱 | `Get-Content` 一律带 `-Encoding UTF8`；行数权威口径见 J-31；日志用 `*> $log`，**不要用 `Tee-Object`**（X13） |
| **Y5** | **上游通道是本地镜像路径，不是 URL** | 用 §二 F2 给的两条命令；**网络不可达时走离线口径**（见 §四 4.1.2 的 exit 2 分支） |
| **Y6** | 🔴 探针式 `tsconfig` **必须放在仓库根**才与既有 config 的相对路径一致（本蓝图 §二 F7 实测踩过） | 放仓库根 → 用完**立刻删**（否则污染 `??` 计数）；参考副本已存 `.cyrene-merge-analysis/p10/probe{1,2}-*.tsconfig.json` |
| **Y7** | `git fetch` 会**写 refs** | 本 Phase 只允许写 `refs/remotes/official/*` 与探测用的**临时 ref**（用完删）；**不得**动 `refs/heads/master` |

---

## 一、目标与非目标

### 1.1 目标（T1–T6）

| # | 目标 | 交付物 | 判定 |
|---|---|---|---|
| **T1** | 🔴 **建立上游同步机制**（本 Phase 的核心）：一次 `fetch` + 一次增量比对 → 回答"上游动了吗 / 会不会撞上我们的改动 / 现在能不能干净地跟" | `scripts/merge/upstream-sync.mjs`（新增，开发脚本）+ `.cyrene-sync-state.json`（新增，仓库根）+ `SYNC-上游同步SOP.md`（任务文档） | 脚本在**当前状态**下跑出"待合并 = 0 / 风险重叠 = 0"，退出码 0（A1）；用伪造上游提交能报出重叠（A2） |
| **T2** | 🔴 **写清"哪些本地改动被有意放弃、为什么"**（00-总体任务预览 §五 的原话要求） | `ABANDONED-有意放弃清单.md`（任务文档） | 覆盖 P8.5 的 **Bucket2 全部 79 条**（逐条可追溯到 D1–D7 / H-07 / H-16 中的某一条）→ A4 |
| **T3** | **「里子」模块决策包**：把 3 个选项的成本**量化**后交人拍板（H-21） | 决策包写进本 Phase 的 §四 4.3 + 完成报告 §五 | 三个选项各带**实测数字**（本蓝图 §二 F6/F7 已给）→ 人拍板后**不再改动代码**（C1） |
| **T4** | **收口台账与结项清单**：H-19/H-17 的最终状态、B/C 类人验项、跨任务的长期待办 | 台账 §五 追加行 + `BACKLOG-长期待办.md`（任务文档） | 台账里**没有状态为"未知"的行**；BACKLOG 每条都有"谁来做 / 触发条件" |
| **T5** | **结项**：本任务的关闭说明（做完什么 / 没做什么 / 资产在哪 / 如何回退） | 本 Phase 的完成报告（= 结项报告） | 与总蓝图 §九 基线块**逐项一致** |
| **T6** | ✅ **小修（H-20 = A 已拍板 → 在范围内）**：① `MemoryManagerSection.tsx:274` 的 `MAX - MAX` 还原为 `0`；② `nextEraseStep` 的 `limit` 分支补真实轮次计数；③ `erase.previewContinue` 键的取舍 | 独立提交（**提交 2**，本 Phase 最后一次提交） | 见 §四 4.7；全量 `0 failed` + 两语言键集合差集 = 0 |

### 1.2 非目标（N1–N6，越界即失败）

| # | 非目标 |
|---|---|
| **N1** | **不改产品代码**（C1）。包括"顺手修一下"任何 `src/**` 里的东西 —— 唯一例外是 H-20 放行的 T6 |
| **N2** | **不动官方既有文件**：官方继承来的 80 个 `src/renderer/settings/**` 文件、官方 React 面板、i18n 既有键，全部**零改动**（P9.5 的 C1/N2 继续有效） |
| **N3** | **不删本地独有文件**（C4）：12 个本地独有的 `settings/**` 文件、4 个「里子」模块，一律**不动** |
| **N4** | **不推送、不 force、不 rewrite 历史**（C3）。🔴 永不 `git merge --abort` / `git checkout <ref> -- .` / `git push --force` |
| **N5** | **不迁移旁听**（D3/D4）、**不接回** `ApiConfigSection`（H-16）、**不重做**已拍板的 UI 决策 |
| **N6** | **不清理** `.cyrene-merge-analysis/**`（它是**证据目录**：P7–P9.5 的复现产物都在里面，删了就无法复跑核验）。要不要清理属**长期待办**，写进 BACKLOG 由人定 |

---

## 二、事实清单（**全部为撰写者实测**，执行者可直接采信；按 J-13，动手前仍要自己扫一眼坐标）

### F1 · 当前基线（P10 的 P1/P2）

```
HEAD         = d27920ab   "fix(P9.5): 补齐记忆管理台/区块页的排版样式（回收旧 settings.css 的 75 条选择器）"
tag          = phase9.5-visual → d27920ab（另有 phase9-entries / phase8-merged / phase3-work-snapshot / phase0-full / phase0-tracked）
父提交        = 99932fb1（单父）
工作区        = 只剩 `??`：**18 条**（默认口径，撰写者实测 —— 本 Phase 新增 `.cyrene-merge-analysis/p10/**` 后会变成 19；⚠️ 探测用的 `tsconfig.p10-probe*.json` 曾让它短暂变成 20，用完已删）—— 无 M / D / A 残留
测试（校准 PATH 后，本次实测）= Test Files 563 passed (563) / Tests 5433 passed | 1 skipped (5434) / **exit 0**
编译          = tsc main / preload / renderer = 0 / 0 / 0
推送          = ❌ 未推送（origin/master = eb6c311a）
```
> 复跑命令：`$env:PATH = 'D:\data\node24;' + $env:PATH; & D:\data\node24\npx.cmd vitest run`
> 本次实测日志：`.cyrene-merge-analysis/p10/baseline-fulltest.log`

### F2 · 🔴 上游通道：**三个实体**，别搞混（这是 T1 的全部前提）

| 角色 | 实体 | 实测值 |
|---|---|---|
| **官方上游** | `https://github.com/Playa-Cyrene/Cyrene-Agent.git` | 合并对象 `b11b8851`（作者 `Playa-0v0`，2026-09-25） |
| **本地镜像**（离线可用） | `E:\AI_Chating\off-cyan\Cyrene-Agent` | 其 `master` = **`b11b8851`**（与我们的 `official/master` **同值**）→ **当前没有待合并的上游提交** |
| **我们的 fork** | `origin` = `https://gitee.com/playa0/cyrene-agent.git` | `master` = `eb6c311a`（9-13）；我们**领先 224 个提交**；**未推送** |
| 交叉验证参照（不是上游） | `E:\AI_Chating\_plus-ref` = `github.com/rossiiloveyou-crypto/cyrene-agent-PLUS.git` | P8.5 用它做过独立交叉验证 |

**两条 fetch 命令**（**不动工作区**，只写 `refs/remotes/official/master`）：
```powershell
# ① 离线优先（推荐；本次实测可用）
git fetch --no-tags E:\AI_Chating\off-cyan\Cyrene-Agent master:refs/remotes/official/master
# ② 有网时直连官方
git fetch --no-tags https://github.com/Playa-Cyrene/Cyrene-Agent.git master:refs/remotes/official/master
```
**同步点**：`b11b8851` —— 它**同时**是 P8 合并提交 `51a20338` 的第二个父提交（可用 `git rev-parse 51a20338^2` 机械复核）。

### F3 · 旧设置子树的**真实性质**（决定 T3 怎么写，别再误判为"死代码"）

| 事实 | 实测值 |
|---|---|
| `src/renderer/settings/**` 是不是本地遗留？ | ❌ **不是** —— 它是**官方代码**：官方树 `b11b8851` 有 **80** 个文件，基点 `eb6c311a` 有 **90**，当前 `HEAD` 有 **85**（83 个 `.ts/.tsx`） |
| 它在合并后是"死"的吗？ | ❌ **不是** —— 子树外有 **8 个模块被 React 设置页直接 `import`**：`shared/types`（**10 处**引用，含 3 个 P9 新面板）、`shared/format`、`timezone-options`、`api/presets`、`custom-endpoint-state`、`music/types`、`plugin-panels`、`scheduler/types` → 它是**活的共享层** |
| 它被类型检查覆盖吗？ | ❌ **不被任何 tsconfig 覆盖**：`tsconfig.renderer.json` 的 include 只有 `src/renderer/react/**` + `react-perf/**` + `global.d.ts` + `src/shared/**`（**官方原样**，不是我们改的） |
| 它被打包吗？ | ✅ 只打包 React 入口（`vite.config.mts` 的 `renderer` input = `src/renderer/react/index.html`；另有 `src/renderer/index.html` 走 Live2D 窗口）→ 旧面板代码不进 bundle，但**共享模块会被打进 React bundle** |

### F4 · 子树里**本地独有 12 个文件** vs **官方独有而本地缺 7 个**（J-23 三问的结论）

**本地独有（12）**：`memory/{delete-all,erasure-flow,manager}.ts`、`shared/{modal-icon.test.ts,section-nav.ts}`、`zones/{dom.ts,manual-group.test.ts,manual-group.ts,panel.ts,picker.test.ts,picker.ts,state.ts}`
**官方独有而本地缺（7）**：`api/state.ts`、`memory/panel.ts`、`preferences/panel.ts`、`tokens/{cache-statistics.test.ts,cache-statistics.ts,state.ts}`、`vision/dom.ts`
> 其中 `memory/panel.ts` + `preferences/panel.ts` = **P8 删的 2 个空壳**（H-07 已销账）；其余 5 个 = **P4「接受本地删除」组**的既有结论（`PHASE-4-完成报告.md` §3.3）。
> ⚠️ 本 Phase **不重新评估**这 12/7 的处置（C2/N3）；只在 T2 里把它们**逐条写成有据可查的登记项**。

### F5 · 4 个「里子」模块的现状（T3 的对象）

| 模块 | 行数 | 已跟踪 | 被谁引用 |
|---|---|---|---|
| `src/renderer/settings/memory/delete-all.ts` | 95 | ✅ | 无运行期引用；仅 `PHASE-9` 的 `rules.ts` 注释 + `memory-erasure-corpus-guard.test.ts` 的 `P3_FILES` 字符串 |
| `src/renderer/settings/memory/erasure-flow.ts` | 483 | ✅ | 同上 |
| `src/renderer/settings/memory/manager.ts` | 619 | ✅ | 同上 |
| `src/renderer/settings/zones/panel.ts` | 620 | ✅ | 同上（另有 1 处 `rules.ts:179` 注释引用） |
| **合计** | **1,817 行** | | **无任何运行期 import**（这是它们"不是死代码却也不活"的准确表述） |

**它们是 P9 的"权威参照"**：React 侧共 **8 处** `← <文件>:<行号>` 引用 —— `features/settings/memory-console/rules.ts` **5 处**（指向 `memory/{delete-all,erasure-flow,manager}.ts`）+ `features/settings/zones/rules.ts` **3 处**（指向 **`zones/picker.ts`**）。
> ⚠️ 口径更正（撰写者实测）：**参照物不止 4 个** —— `zones/picker.ts` 同样是"本地独有 + 被 React 侧引用"，但它**不在** H-07 登记的 4 个「里子」模块里；`zones/panel.ts` 则只有 `rules.ts:179` 一处**文字**提及（非 `file:line` 引用）。§四 4.3 的选项 C 已按这个口径写。

### F6 · 🔴 「纳入类型检查面」的成本 —— **两个探针的实测数字**（T3 决策的核心依据）

| 探针 | 覆盖范围 | 实测结果 |
|---|---|---|
| **探针 1** | **整棵** `src/renderer/settings/**` + `global.d.ts` + `src/shared/**` | **130 个 `error TS`**，集中在官方面板：`channels/panel.ts` **46** / `tts/panel.ts` 24 / `user/panel.ts` 12 / `asr/panel.ts` 9 / `plugins/panel.ts` 8 / `email/panel.ts` 7 … ⇒ **整棵纳入不可行**（那是上游自己的历史欠账，不是我们的） |
| **探针 2** | **只含 4 个「里子」模块**的闭包 | **11 个 `error TS`**：<br>· 4 × `TS2307 Cannot find module '../i18n'`（`delete-all.ts:12` / `erasure-flow.ts:23` / `manager.ts:25` / `zones/panel.ts:24`）← **这正是"不能直接 import"的硬原因**<br>· 1 × `manager.ts:472 TS2345`（`vectors` 字段缺失的真实类型错）<br>· 5 × `shared/modal.ts`（**闭包噪声**，该文件只被已删的旧面板用）<br>· 1 × `shared/logger.ts TS2307 node:process`（`tsconfig.renderer` 本来就 **exclude** 它 → 照抄 exclude 即可消除） |

**结论（可直接写进决策包）**：要让 4 个模块"受编译器保护"，需要先修 **5 处**（4 个 `../i18n` + 1 个 `vectors`），并处理闭包里的 `shared/modal.ts` 5 处 —— **约 10 处**，且必须新建一个**窄 tsconfig**（不能把整棵拉进 `tsconfig.renderer.json`，那会引入 130 个错）。
> 探针配置已留存：`.cyrene-merge-analysis/p10/probe1-whole-subtree.tsconfig.json` / `probe2-four-modules.tsconfig.json`（复跑：放到**仓库根**再 `& D:\data\node24\npx.cmd tsc -p <cfg>`，用完删）

### F7 · T2 的机械基底：P8.5 的三桶（**不要重新发明**）

| 桶 | 定义 | 数量 | 用途 |
|---|---|---|---|
| Bucket1 | `X ∩ U`（双方都动过） | **822** | 预期，不需登记 |
| **Bucket2** | `X \ U`（**官方解释不了的差异** = 嫌疑清单） | **79** | 🔴 **T2 的底稿**：79 条已由 P8.5 逐条核销（无法解释的 = 0），本 Phase 把它**翻译成人类可读的"有意放弃"清单** |
| Bucket3 | `L \ X`（本地改动路径逐字未变） | **191** | 保真证明，无需登记 |

证据文件（可复跑）：`.cyrene-merge-analysis/p8/p8-parity-bucket2.txt` 等（见 `PHASE-8-合并保真核验报告.md` §三）

### F8 · 类名契约门禁的唯一维护点（加固项，写进 SOP 而不是改代码）

`src/renderer/react/styles/class-name-contract.test.ts`：
- `COVERED_TSX`（**3 条路径**）= 硬判据的覆盖面 → **新增面板必须把路径加进来**，否则新面板不受 J-32 保护；
- `KNOWN_LEGACY_UNDEFINED`（**21 个名字**）= 官方既有欠账的冻结清单；P9.5 报告 §五 偏差 3 记的是"**22 处**"（**处**= 使用点，**个**= 去重类名）→ T1 的 SOP 里**必须写清这两个口径**，否则下一个读的人会以为少了 1 个。

### F9 · 未闭合的人工项（P10 收口时逐条落状态）

| 编号 | 内容 | 现在卡在哪 |
|---|---|---|
| **H-19** | P9.5 修复后的**目视 2 步 + 2 张截图** | 等人眼（**P9.5 的退出条件**） |
| **H-17 ⑤** | 控制台/新面板的观感与设置页一致 | 与 H-19 一起收口 |
| **H-02 / H-03** | 群聊上下文条数 / 删除全部记忆 | 待人工复验（H-03 **有数据风险**：先备份 `%APPDATA%\live2d-cyrene`） |
| **H-06** | 待项目所有者书面点头 | ⏳ |
| **C-1…C-4 / B-6 步骤 1–4** | 需**真实渠道**（飞书等） | 环境受阻（"模型服务可用"那一半已证明） |
| **H-B6** | 是否推送 | 由所有者决定 |

### F10 · 回退资产（**实测核对过，含一处需要更正**）

| 资产 | 实测状态 | 可用性 |
|---|---|---|
| tag `phase0-full`（`34f0669f`，tree `00ae967e`，2013 文件） | 存在 | ✅ 原始本地状态（P8.5 认定 = 参照物） |
| `E:\AI_Chating\cyrene-agent-backup-phase0` | **3668 个文件**、有 `.git`（HEAD=`eb6c311a`，1893 tracked，`status` **219 条**未提交改动） | ✅ 可用：**工作区**才是原始本地改动（219 条 = 那 12 天），`.git` 只是 clone 时状态 |
| `E:\AI_Chating\cyrene-agent-p8-backup` | **8 个扁平命名的单文件副本**（`package.json` / `panel-layout.test.ts` / `ChannelsSettingsMigration.test.ts` / `ChannelsSettingsPanel.tsx` / `i18n/{en,zh-CN}.json` / `settings/memory/panel.ts` / `settings/preferences/panel.ts`），**无 `.git`** | ⚠️ 它是 **P8 动手前的"单文件保险副本"**，**不是仓库级回退锚点** —— 但总蓝图 §九 把它与 tag 并列，容易被读成整仓备份 → 本 Phase 在放弃清单里**就地标注其真实性质**（不删旧行） |
| `.cyrene-merge-analysis/**` | 存在（P7–P9.5 的全部复现产物） | ✅ 证据目录，**不清理**（N6） |

---

## 三、前置与停止条件

### 3.1 前置（P1–P5，逐条打勾）

| # | 前置 | 复核命令 | 期望 |
|---|---|---|---|
| **P1** | HEAD = `d27920ab` 且工作区只剩 `??` | `git log -1 --format=%h` / `git status --porcelain` | `d27920ab` / 无 `M/D/A` |
| **P2** | 全量测试 **0 failed**（**校准 PATH 后**） | `$env:PATH='D:\data\node24;'+$env:PATH; & D:\data\node24\npx.cmd vitest run` | `563 passed (563)` / exit 0 |
| **P3** | 上游通道可解析 | `git rev-parse refs/remotes/official/master` | `b11b8851…`（缺失则按 §二 F2 的 fetch 命令补） |
| **P4** | 4 个「里子」模块**在磁盘上且未被改动** | `git diff --stat d27920ab -- src/renderer/settings` | 空 |
| **P5** | 目标文件不冲突：`scripts/merge/` 与 `.cyrene-sync-state.json` **尚不存在** | `Test-Path` | `False`（已存在 → 停，说明有人做过了） |

### 3.2 停止条件（S1–S4，命中即停并报告）

| # | 条件 | 处置 |
|---|---|---|
| **S1** | 发现"要达成 T1/T2 必须改**产品代码**"（例如脚本必须放进 `src/` 才能被某处引用） | **停** → 报告并交人（违反 C1） |
| **S2** | 需要**修改已拍板决策**（D1–D7）或**动 D6**（把任务文档入库）才能继续 | **停** → 登记一个新 H 编号 → 交人拍板 |
| **S3** | 🔴 发现任何**本地独有文件**（§二 F4 的 12 个、或 4 个里子模块）在磁盘上**缺失/被改**；或发现 `docs/construction/合并/**` 的文件数比 P9.5 结束时**减少** | **立即停**，先取证再谈别的（这可能意味着"我的东西被弄没了"） |
| **S4** | 上游通道**两条命令都不可达**（镜像目录没了 + 无网） | **降级但不失败**：SOP 里写明"离线口径"与"下次有网时补跑"，并把它登记为 BACKLOG 一条；**不要**伪造 fetch 结果 |

---

## 四、施工步骤（按顺序，每步都有判据）

### 4.0 备份与锚点（3 分钟，必做）

```powershell
cd E:\AI_Chating\cyrene-agent
git log -1 --format='%h %s'                       # 期望 d27920ab
git status --porcelain | Measure-Object           # 期望 18 条，且前缀全为 ??（本 Phase 自己新增的 p10/ 会让它 +1）
git write-tree                                    # 提交前索引内容保险（→ 记进 .cyrene-merge-analysis/p10/pre-commit-tree.txt）
git rev-parse refs/remotes/official/master        # 期望 b11b8851…
```

### 4.1 T1 · 上游同步机制（**本 Phase 的核心交付**）

#### 4.1.1 同步状态文件 `.cyrene-sync-state.json`（仓库根，新增）

```json
{
  "upstream": {
    "name": "Cyrene-Agent (official)",
    "github": "https://github.com/Playa-Cyrene/Cyrene-Agent.git",
    "mirrorPath": "E:/AI_Chating/off-cyan/Cyrene-Agent",
    "ref": "refs/remotes/official/master"
  },
  "lastSyncedCommit": "b11b8851",
  "lastSyncedAt": "2026-09-25",
  "mergeCommit": "51a20338",
  "fork": { "remote": "origin", "url": "https://gitee.com/playa0/cyrene-agent.git", "branch": "master" },
  "notes": "同步点 = 上一次真正合并的官方提交；改这个文件必须同时更新 lastSyncedAt。"
}
```
**判据**：`lastSyncedCommit` **必须** = `git rev-parse 51a20338^2` 的前 8 位（机械自证，见 F2）。

#### 4.1.2 脚本 `scripts/merge/upstream-sync.mjs`（新增，**开发脚本，不进产品路径**）

**行为规格**（执行者按此实现；参数名固定，便于 SOP 引用）：

```
node scripts/merge/upstream-sync.mjs [--check] [--fetch] [--json] [--ref <ref>]

（--ref 默认 refs/remotes/official/master；A2 的伪造探针用它指向临时 ref —— 见下方判据）

默认（--check）：
  1) 读 .cyrene-sync-state.json → lastSynced
  2) 若 --fetch：按 state 里的 mirrorPath 优先、github 兜底，执行
     git fetch --no-tags <source> master:refs/remotes/official/master
     （fetch 失败 → **exit 2**，并打印"上游通道不可达"，不写任何 ref）
  3) U_new  = git diff --name-only <lastSynced> refs/remotes/official/master      # 上游新动的文件
     L_dev  = git diff --name-only refs/remotes/official/master HEAD             # 我们相对上游的差异
     风险集 RISK = U_new ∩ L_dev                                                  # 下次合并会撞的文件
     安全可跟 SAFE = U_new \ L_dev                                                # 能干净吃进来的文件
  4) 打印：上游新提交数（git rev-list --count <lastSynced>..official/master）、U_new/L_dev/RISK/SAFE 的**数量与列表**
  5) 写报告 .cyrene-merge-analysis/sync/<日期>-报.md（含四条命令的原文与输出）
  6) 退出码：RISK 为空 → 0；RISK 非空 → **1**（并打印"下次合并前先读这份报告"）；通道不可达 → 2

--json：只输出一行 JSON（供将来接入其它工具）
```

**判据（A1/A2）**：
- **A1** 当前状态跑：上游新提交 = **0**、RISK = **0**、退出码 **0**；
- **A2** 伪造验证（**不动 `refs/heads/master`**）：从当前 `official/master` 造一个临时提交（改 1 个**我们已知在 L_dev 里**的文件）→ 打到 `refs/remotes/official/probe` → 用 `--ref refs/remotes/official/probe` 跑一次 → **RISK 必须包含那个文件**、退出码 1；跑完 `git update-ref -d refs/remotes/official/probe` 删掉。
  > ⚠️ 探针提交只能用 `git commit-tree` + `git update-ref` 造（**不要** checkout 或改工作区，C1/Y7）

#### 4.1.3 SOP 文档 `SYNC-上游同步SOP.md`（任务文档，**不入库**）

必须写清四件事（否则这份 SOP 没用）：
1. **例行体检**（建议每 **7 天**或每次开工前）：`node scripts/merge/upstream-sync.mjs --check --fetch` → 读退出码；
2. **上游有新提交但 RISK = 0**：可以直接 `git merge refs/remotes/official/master`（**先** `git tag pre-sync-<日期>` 留锚点）；
3. **上游有新提交且 RISK ≠ 0**：按**文件**逐个定处置（用 `ABANDONED-有意放弃清单.md` 对照"这个文件我们当初放弃过什么"），并遵守 D1–D7；
4. 🔴 **纪律（这次的根因）**：**不要再攒 12 天未提交的改动** —— 明文阈值：*工作区未提交改动 > 20 个文件、或距上次提交 > 3 天，就先提交（或开 `wip/` 分支）*；本条要写成**可机械判定**的两条命令（`git status --porcelain | Measure-Object` 与 `git log -1 --format=%cr`）。
5. **同步完成后**：更新 `.cyrene-sync-state.json` 的 `lastSyncedCommit` / `lastSyncedAt` / `mergeCommit`（**这一步最容易忘，写成 SOP 的第一条 checklist**）。

#### 4.1.4 交叉引用（加固：把 J-32/J-33/J-35 的维护点写进同一份 SOP）

SOP 末尾加一节「**本仓的三条机器判据与它们的维护点**」：
| 判据 | 测试文件 | 维护动作 |
|---|---|---|
| 类名契约（J-32/J-33） | `react/styles/class-name-contract.test.ts` | 新增面板 → 把路径加进 `COVERED_TSX`；修好一处官方欠账 → 从 `KNOWN_LEGACY_UNDEFINED` **删掉**它（只能收紧） |
| 群聊旁听探测器 | `react/features/**/group-context-flow.test.ts`（**P10 起不许从门禁名单里去掉**） | 动了旁听链路才需要看它 |
| 全量测试 | `vitest run` | **先校准 PATH**（J-35），否则 `work-verification-closure` 假红 |

### 4.2 T2 · 放弃清单 `ABANDONED-有意放弃清单.md`（任务文档）

**底稿 = P8.5 的 Bucket2（79 条）**（F7）。逐条落到下面**五类**之一（每类给"放弃什么 / 为什么 / 依据 / 将来要恢复怎么办"）：

| 类 | 内容 | 依据 |
|---|---|---|
| ① **功能级放弃** | 桌面对话绑定（D1：彻底删除，保留 `conversation-binding-store.ts` 供 zones 依赖）；旧设置窗口（D2）；旧版本兼容（D5）；旁听 A 迁移（D3 修订：本次不做） | D1/D2/D3/D5 |
| ② **入口级放弃** | `ApiConfigSection`（自定义端点 API 配置面板，H-16 **B 只登记不接回**）—— 写清"原物在哪、将来怎么接" | H-16 / D7 |
| ③ **测试级放弃** | H-07 的 **12 个整文件删** + 1 个文件收窄（`panel-layout.test.ts` 保留 4 条绿守卫）+ 2 个空壳模块删 | H-07 / J-20 |
| ④ **代码级放弃** | P4 的 **15 个 `UD` 删除** + **3 个「接受本地删除」**（`api/state.ts`、`tokens/{cache-statistics,cache-statistics.test,state}.ts`、`vision/dom.ts` 那一族） | `PHASE-4-完成报告.md` §3.3 |
| ⑤ **有意保留但不接线** | 12 个本地独有的 `settings/**` 文件（含 4 个「里子」模块）→ **只读参照**，明确写"**不要 import**"（缺 `../i18n`、DOM 耦合、不在类型检查面） | F4/F5 |

**判据 A4**：Bucket2 的 79 条**每条**都能在本清单里找到归属（允许 1 条 → 1 类；不允许"其它/未分类"兜底项超过 3 条）。
**同时**：在本清单 §尾部**就地标注总蓝图 §九 的一处资产性质的偏差**（`cyrene-agent-p8-backup` 是 8 个单文件保险副本，不是整仓备份，见 F10）。

### 4.3 T3 · 「里子」模块决策包（**交人拍板 H-21；执行者不自行决定**）

把下面这张表**原样**放进完成报告 §五（数字全部来自 F5/F6 实测）：

| 选项 | 做什么 | 实测成本 | 代价 / 收益 |
|---|---|---|---|
| **A ✅ 已选（2026 · H-21）保持现状 + 登记为只读参照** | 文件一行不改；在 T2 的 §⑤ 与 SOP 里写清"它们是 P9 的权威参照，改动前必须先看 `rules.ts` 的 **8 处** `file:line`" | **0** | ✅ 保留 D7 取证链（8 处 `file:line` 继续有效）<br>⚠️ 它们仍不受编译器保护（靠"没人会去改"的纪律） |
| **B（未选）只把 4 个模块纳入窄类型检查面** | 新建 `tsconfig.renderer-legacy.json`（includ 4 文件 + `global.d.ts` + `src/shared/**`，exclude 抄 renderer 的 `logger.ts`）→ 先修 **5 处**（4×`../i18n` + `manager.ts:472 vectors`）→ 把该配置加进门禁 | **≈10 处修复 + 1 个新 config** | ✅ 参照物不再漂移<br>⚠️ 触碰了 4 个本地独有文件（**改产品代码** → 需新开一个小 Phase，**不属 P10**） |
| **C（未选）删掉参照物（4 个模块 1,817 行；连带 `zones/picker.ts`）** | `git rm` 4 个路径（**若一并清理参照物，还要算上同样被 3 处引用的 `zones/picker.ts`**）+ 同步改 **8 处** `file:line` 注释（否则悬空引用） | 低 | ❌ 断掉"原封不动"的对照物；本地独有、删了只能从 `phase0-full` 取回<br>✅ 仓库少 1,817+ 行无主代码 |

> 🔴 **执行者注意**：**H-21 已拍板 = A** → **本 Phase 不动这 5 个文件一行**（C1/C4）；B/C 只是"成本已量化、将来若要做则单独立项"的存档。

### 4.4 T4 · 收口台账 + BACKLOG

1. **台账**（`HUMAN-人工验证台账.md`）§五 追加行：H-19（人判结果，若已给）、H-17⑤、H-02/H-03、H-06、C-1…C-4、H-B6 各一行**最终状态**（✅ 销账 / ⏳ 转长期 / 🚫 环境受阻 —— **不允许"未知"**）；
2. **BACKLOG**（`BACKLOG-长期待办.md`）：每条给 **谁做 / 触发条件 / 从哪开始**：
   - 推送（H-B6）；
   - H-19 目视（若仍未做）；
   - 「里子」模块的 B/C 选项（若选 B/C）；
   - 22 处官方既有类名欠账的最终裁决；
   - `.cyrene-merge-analysis/**` 的清理决策（N6）；
   - T6 小修（若 H-20 = B）；
   - 上游同步的**第一次例行体检**（SOP 落地后的第一周）。

### 4.5 全量门禁（**必须全绿才算完成**）

```powershell
$env:PATH = 'D:\data\node24;' + $env:PATH          # 🔴 J-35：不校准会假红
& D:\data\node24\npx.cmd vitest run                # 期望 Test Files 563 passed (563) / 0 failed / exit 0
& D:\data\node24\npx.cmd tsc -p tsconfig.main.json      # 0
& D:\data\node24\npx.cmd tsc -p tsconfig.preload.json   # 0
& D:\data\node24\npx.cmd tsc -p tsconfig.renderer.json  # 0
node scripts/merge/upstream-sync.mjs --check       # 期望 exit 0（A1）
```
> 本 Phase 的产物**不在** `tsconfig.*` 的 include 面内（`scripts/` 不是 TS 工程的一部分）→ 脚本**必须能被 `node` 直接跑**（`.mjs`，零依赖，只用 `node:child_process` / `node:fs`）。

### 4.6 提交（**H-20 = A：上限 2 次提交**）

```
提交 1（T1–T5）：chore(P10): 建立上游同步机制（脚本 + 状态文件）+ 放弃清单与结项收口
  期望改动面：A scripts/merge/upstream-sync.mjs（新增）
              A .cyrene-sync-state.json（新增）
  明确**不含**：任何 src/** 改动、任何官方面板、任何任务文档（D6）
提交 2（T6，可选）：fix(P10): 记忆台擦除流程的两处小修（MAX-MAX 还原 + 轮次计数 / i18n 键取舍）
```
**提交纪律**：`git add` **按路径显式列出**（不要 `git add -A` —— 工作区里有 20 条 `??`，其中含任务文档与证据目录，D6 明令不入库）。
**判据 A8**：`git show --stat <提交 1>` 的路径**只能**是上面 2 条（+ 若 SOP 入库被 H-20 放行，则再加 1 条 `.md`）。

### 4.7 T6 · 小修（✅ **H-20 = A 已拍板 → 执行**；独立提交 + 独立门禁）

| # | 位置 | 动作 | 判据 |
|---|---|---|---|
| ① | `features/settings/memory-console/MemoryManagerSection.tsx:274` | `nextEraseStep(report, MAX_ERASE_RECONFIRM_ROUNDS - MAX_ERASE_RECONFIRM_ROUNDS)` → **改回 `0`**，或按 ② 一并修 | 行为与 P9 完全一致（`X - X ≡ 0`），改动后**全量 0 failed** |
| ② | 同文件擦除流程 | 补一个**真实轮次计数**（`erasure-flow.ts:441-455` 是权威参照），使 `nextEraseStep` 的 `limit` 分支**可达** | 新增/更新 `rules.test.ts` 用例覆盖 `limit` 分支；`reconfirmLimitReached` 文案不再是死文案 |
| ③ | `i18n/{zh-CN,en}.json` + 预览 Modal | 二选一：**(a)** 给预览弹窗一个"继续"按钮并复用 `erase.previewContinue`；**(b)** 两语言一起删掉该键 | 两语言键集合**差集 = 0**；`git grep --untracked previewContinue` 的结果与选择一致（a=有使用点，b=0 命中） |

---

## 五、人工环节 ★

### 5.1 ✅ H-A（已拍板）：**H-20 —— 允许提交吗？T6 做不做？→ 答复「A」**

| 选项 | 含义 | 后果 |
|---|---|---|
| **A ✅ 已选（2026，答复原文「AA」）** | 允许提交：**提交 1**（脚本 + 状态文件）**+ 做 T6**（提交 2） | 同步机制进版本库（下一个 clone 也有）；两处小修一并清掉 |
| **B**（未选） | 允许提交，但**不做 T6** | 同步机制进库；T6 转 BACKLOG |
| **C**（未选） | **零提交**：只写任务文档 | 完全零风险；代价：脚本与状态文件不进版本库 |

**⇒ 执行者按 A 施工**：提交 1（§四 4.6）+ 提交 2（§四 4.7 T6），**两次为上限，不得再多**。

> 📌 选 A 会**偏离总蓝图 §四 P10 行写的"改动面 = 零"** —— 本蓝图把那条口径**精确化**为"**产品代码 0 行 + 允许 1 个开发脚本 + 1 个状态文件**"（新增+标注，不改旧值；已随 H-20 的拍板一并生效）。

### 5.2 ✅ H-A（已拍板）：**H-21 —— 「里子」模块的处置 → 答复「A」**

**结论（答复原文「AA」的第二个 A）**：选 **A · 保持现状 + 登记为只读参照**。

> ⇒ T3 的**决策包照 A 写**（§四 4.3 的表格里 A 行标 ✅ 已选、B/C 标"未选，须单独立项"）；
> ⇒ T2 的 §⑤ 与 SOP 里必须写清"**这 5 个文件是只读参照，不要 `import`、不要改**"（4 个「里子」模块 + `zones/picker.ts`）；
> ⇒ BACKLOG 里**只留一行**："若将来要把参照物纳入类型检查（B）或删除（C），单独立项"，**不展开**。
> 🔴 本 Phase **不动这 5 个文件任何一行**（C1/C4）。

### 5.3 H-19 / H-17⑤（P9.5 的出口，**仍是全任务最后的目视**）

- 需要：**2 张"修复后"截图**（记忆管理台详情 / 区块页）；
- 判据见 [`PHASE-9.5-新面板样式补齐.md`](PHASE-9.5-新面板样式补齐.md) §五 5.2 与 [`PHASE-9.5-完成报告.md`](PHASE-9.5-完成报告.md) §十二 12.8；
- **不阻塞 P10**（本 Phase 的交付物与它无关），但**它是"任务能不能宣告完成"的最后一道门**。

### 5.4 H-B6（推送）

`origin` = gitee `playa0/cyrene-agent`，我们领先 **224 个提交**、**从未推送**。本 Phase **不推**（C3）；只在 BACKLOG 里保留一行。

### 5.5 H-C（本 Phase 的销账）

| 编号 | 动作 |
|---|---|
| **H-19** | 若本次拿到截图 → 销账；否则**转 BACKLOG**（并保持"待人判"） |
| **H-17 ⑤** | 与 H-19 同步收口 |
| **H-20 / H-21** | 本次新登记（**施工前/施工中**拍板项），拍板后标 ✅ |
| 其余（H-02/H-03/H-06/C-1…C-4/H-B6） | 逐条落到 BACKLOG（**不允许留在"未知"**） |

---

## 六、验证判据（A 类，逐条可机器判）

| # | 判据 | 命令 / 方式 | 期望 |
|---|---|---|---|
| **A1** | 同步脚本在**当前状态**下判定"无待合并、无风险" | `node scripts/merge/upstream-sync.mjs --check` | 上游新提交 **0** / RISK **0** / exit **0** |
| **A2** | 脚本对**伪造的上游新提交**能报出重叠 | 见 §四 4.1.2 的探针流程 | RISK 含该文件 / exit **1**；探针 ref 用完即删 |
| **A3** | 状态文件与合并提交**机械自证** | `git rev-parse 51a20338^2` | 前 8 位 == `lastSyncedCommit` |
| **A4** | 放弃清单覆盖 Bucket2 全部 79 条 | 对着 `.cyrene-merge-analysis/p8/p8-parity-bucket2.txt` 数 | 未归类 ≤ 3 条 |
| **A5** | 4 个「里子」模块**零改动** | `git diff --name-only d27920ab HEAD -- <4 paths>` | 空 |
| **A6** | 全量测试与编译 | §四 4.5 的命令 | `0 failed` / `563 passed`；三套 `tsc` = 0/0/0 |
| **A7** | 官方既有文件零改动 | `git diff --name-only d27920ab HEAD -- src` | **空**（H-20=A 时仅允许 T6 的那 2 个文件） |
| **A8** | 改动面 = 白名单 | `git show --stat <提交>` | 只含 §四 4.6 列出的路径 |
| **A9** | 台账无"未知"状态 | 人读 + `Select-String '未知'` | F9 的 7 类都有终态 |
| **A10** | SOP 与脚本**能力一致**（不写脚本做不到的事） | 逐条对着脚本的 `--help` 输出核 | SOP 里出现的每个命令都能跑通 |

---

## 七、交付物

| 文件 | 类型 | 是否入库 |
|---|---|---|
| `scripts/merge/upstream-sync.mjs` | **开发脚本**（零依赖，`node:` 内置模块） | 仅 H-20 = A/B |
| `.cyrene-sync-state.json` | 状态文件（同步点登记） | 仅 H-20 = A/B |
| `docs/construction/合并/TASK-合并/SYNC-上游同步SOP.md` | 任务文档（SOP + 三条机器判据的维护点） | ❌（D6；除非 H-20/C 另有拍板） |
| `docs/construction/合并/TASK-合并/ABANDONED-有意放弃清单.md` | 任务文档（Bucket2 的 79 条翻译） | ❌ |
| `docs/construction/合并/TASK-合并/BACKLOG-长期待办.md` | 任务文档（跨任务的长期待办） | ❌ |
| `docs/construction/合并/TASK-合并/PHASE-10-完成报告.md` | **完成报告 = 结项报告**（规范 §5 的 10 节 + §十一/§十二） | ❌ |
| `.cyrene-merge-analysis/sync/<日期>-报.md` | 同步报告（脚本产物） | ❌（证据目录） |

---

## 八、回退方法（分级）

```powershell
# 级 1 · 只撤销本 Phase 的提交（若 H-20 = A/B）
git reset --hard d27920ab                 # 回到 P10 之前（⚠️ 丢工作区改动，先确认）

# 级 2 · 只删本 Phase 的新增文件（不碰历史）
Remove-Item scripts\merge\upstream-sync.mjs, .cyrene-sync-state.json

# 级 3 · 只看某个文件改前内容
git show d27920ab:.cyrene-sync-state.json

# 级 4 · 回到更早的锚点
git reset --hard 99932fb1     # P9
git reset --hard 51a20338     # P8（合并提交）
git reset --hard phase0-full  # 原始本地状态（⚠️ 只在"整个合并要推倒"时用）

# 级 5 · 原始 12 天未提交工作的物理副本（F10 实测可用）
#   E:\AI_Chating\cyrene-agent-backup-phase0  （3668 文件 / status 219 条 = 那 12 天的改动）
```
🔴 **永不**：`git merge --abort` / `git checkout <ref> -- .` / `git push --force`。

---

## 九、坑（本 Phase 特有 + 从经验库检索所得）

| # | 坑 | 关联 |
|---|---|---|
| 1 | 🔴 **全量测试的绿色依赖宿主 PATH**（`npm` 解析坏了 → `work-verification-closure` 假红） | **J-35 / X19 / D21** |
| 2 | `git grep` 默认不搜未跟踪 → 本 Phase 新文件全是未跟踪 | **J-26 / X16** |
| 3 | 计数必须带口径；`Get-Content` 不带 `-Encoding UTF8` 会**静默丢行** | **J-31 / X18** |
| 4 | `npx` 被 PS 执行策略拦 | **X15** |
| 5 | 探针 `tsconfig` 必须放**仓库根**（相对路径才一致），用完即删 | 本蓝图 §二 F6 实测 |
| 6 | **"官方解释不了的差异"清单不能重新发明**：P8.5 的 Bucket2 就是权威底稿 | **J-22 / J-23** |
| 7 | "有类名无定义"的判据**只覆盖 `COVERED_TSX` 里的面板**；全量口径的 21/22 是**冻结欠账**，不是缺陷 | **J-32 / J-33** |
| 8 | 判据若"看起来没做事就报绿"，先怀疑它**没扫到东西**（作用域比被验对象小） | **J-26 / D20** |
| 9 | 报告里"全量 0 failed"**必须带 PATH 前提**，否则复核者会看到假红 | **J-35** |
| 10 | `Tee-Object -FilePath` 会**先求值路径**，导致测试根本没跑还刷屏 | **X13** |

---

## 十、给「结项」的交接提示（本 Phase 是最后一个 Phase）

1. 🔴 **结项 ≠ 全部人工项都销完**：H-19 / H-B6 / C 类仍可能挂着 —— 它们的去处是 **BACKLOG**，不是"假装完成"。结项报告必须**逐条列出还欠什么**。
2. 🔴 **上游同步机制的第一次真实使用还没发生**（F2：当前上游无新提交）。SOP 的价值要在**下一次上游更新时**才被检验 → BACKLOG 第一条就是"第一周例行体检"。
3. **`.cyrene-merge-analysis/**` 是证据目录**：P7–P9.5 的所有复跑命令都指着它。清理它 = 让核验不可复跑（N6）。
4. **11 项受保护功能 + 8 条门禁**的现状写在 `BLUEPRINT-总蓝图.md` §六/§九 —— 结项报告只需**引用**，不要重抄（避免两处数字打架）。
5. **D7 的取证链**：新面板 ↔ 旧面板（`settings/**` 参照物）↔ 证据截图，三者要能互相指认；T2 的 §⑤ 是这条链的索引页。

---

## 十一、施工记录（执行者填写；规范 §8）

> 结构照 §8：子节 0 开工前状态 / 1 步骤逐条实测 / 2 门禁回读 / 3 偏差清单 / 4 缺陷编号（D/O）/ 5 经验追加 / 6 待做未做。
> 🔵 **本记录为「索引版」**：完整命令原文与输出在 [PHASE-10-完成报告.md](PHASE-10-完成报告.md)（§三 执行过程 / §四 验收逐项 / §五 偏差 / §六 新坑）。本节只登记**回读到的关键值**，不重抄。

### 子节 0 · 开工前状态（P1–P5 逐条实测）

| 前置 | 实测 |
|---|---|
| **P1** HEAD = `d27920ab` 且工作区只剩 `??` | ✅ `d27920ab`；`git status --porcelain` = **18 条，前缀全为 `??`** |
| **P2** 全量测试 `0 failed`（先校准 PATH） | ✅ `Test Files 563 passed (563)` / `Tests 5433 passed \| 1 skipped (5434)` / **exit 0**（日志 `.cyrene-merge-analysis/p10/baseline-fulltest.log`） |
| **P3** 上游通道可解析 | ✅ `refs/remotes/official/master` = `b11b88512cf0cf6dace56b59ff9487947ef01c28` |
| **P4** 4 个「里子」模块在磁盘且未改 | ✅ `git diff --stat d27920ab -- src/renderer/settings` = **空** |
| **P5** 目标文件不存在（有人做过就停） | ✅ `Test-Path scripts\merge\upstream-sync.mjs` / `.cyrene-sync-state.json` = **False / False** |
| 保险 | `git write-tree` = **`41f9b2435cc9db0b5fd248decd0572e031059ae2`** → `.cyrene-merge-analysis/p10/pre-commit-tree.txt` |

### 子节 1 · 步骤逐条实测（4.0 → 4.7）

| 步 | 做了什么 | 关键实测值 |
|---|---|---|
| **4.0** | 备份与锚点 | 见子节 0；`MERGE_HEAD` **不存在**、`UU` 文件数 **0** |
| **4.1** | T1 同步机制 | 状态文件 A3 ✅（`b11b8851` == `51a20338^2` 前 8 位）；脚本 A1 **exit 0**（上游新提交 0 / U_new 0 / L_dev **346** / RISK 0 / SAFE 0）；A2 探针 **exit 1**（RISK 1 = `README.en.md`，探针 ref 已删，`refs/heads/master` 未变）；`--fetch` 实测抓到镜像；`--help` 五选项齐 |
| **4.1.3** | SOP | 五条命令逐条实跑（A10）；**8 处** `file:line` 参照与 5 个只读参照写进 §八 |
| **4.2** | T2 放弃清单 | 机械归类：底稿 **79** → 已归类 **79** / 未归类 **0**（③13 / ⑤1 / ⑥56 / ⑦6 / ⑧3）；文档表格行数 **79** |
| **4.3** | T3 决策包 | 照 **H-21 = A** 写；探针数字复核**一致**（整棵 **130 错** / 只 4 模块 **11 错**） |
| **4.4** | T4 收口 | 台账 §五之三 **8 条终态**；BACKLOG **14 条** + 4 条"不在 BACKLOG" |
| **4.5** | 全量门禁 | `563 passed (563)` / `5435 passed \| 1 skipped (5436)` / **exit 0**；`tsc` **0/0/0**；脚本 **exit 0** |
| **4.6** | 提交 ×2 | 提交 1 = **`07253ef2`**（2 路径）→ 提交 2 = **`732a6451`**（4 路径）；**均单父**；🔴 **未推送**（领先 **226**） |
| **4.7** | T6 小修 | ① 恒 0 表达式 → `erase.round`；② `limit` 分支**可达** + 2 条新用例；③ 按 **(b)** 两语言删键。定向 `rules.test.ts` **26 passed**；i18n **2103 / 2103，差集 0** |

### 子节 2 · 门禁回读（A1–A10，**回读原文**）

**A1–A10 = 10/10 全过**（逐条期望/实测/判定见 [PHASE-10-完成报告.md](PHASE-10-完成报告.md) §四）。
两条**口径**必须连着读，否则会被误判：
- **A7**：蓝图括注"仅允许 T6 的 **2 个**文件"，**实测 4 个** —— 多出的 2 个是 **T6② 自己的判据要求改的**（`rules.test.ts`）+ 两个 i18n 各算一条（**按"位置"数 = 2，按"路径"数 = 4**）→ 判据成立（报告 §五 偏差 5）。
- **A9**：`Select-String '未知'` = **1 命中**，且该命中是 **判据 A9 的原文引用**（§五之三 抬头）→ 复核以"§五之三 8 条终态齐备"为准（报告 §五 偏差 10）。

### 子节 3 · 偏差清单（**12 条**，逐条见报告 §五）

| # | 一句话 | 处置 |
|---|---|---|
| 1 | 蓝图**五类**覆盖不了 Bucket2 的 79 条（65 条落不进） | 扩为 **8 类** → 未归类 0；判据修正 **J-38** |
| 2 | §4.1.4 探测器路径写错（`react/features/**` → 实为 `src/main/channels/`） | SOP 按实测路径写 |
| 3 | §4.2 ④ 归属错误：5 个文件不是 P4 组 B（`phase0-full` 里就已不存在） | 清单 §四 ④ 就地更正 |
| 4 | T6③「全仓 0 命中」**作用域**不可达 | 判据修正 **J-37**；分作用域列命中数（0/1/4/5） |
| 5 | A7 白名单"2 个文件"vs 实测 4 个 | 口径说明（按位置 vs 按路径） |
| 6 | 同步报告文件名同日**互相覆盖** | 改 `<日期>-<时分秒>-报.md`，同秒再加 `-2/-3` |
| 7 | 本 Phase **未新建 tag**（Y7 限定 ref 写入面） | 不自行扩面；回退用提交哈希；登记 BACKLOG |
| 8 | 退出码 **3**（超出蓝图的 0/1/2） | 在 `--help` + SOP 三处写明 |
| 9 | A2 探针实现比蓝图设想更干净（全程不碰索引） | 已可复跑（`.cyrene-merge-analysis/p10/a2-probe.mjs`） |
| 10 | A9 的机械命中（1 条 = 判据原文） | 复核口径写进子节 2 |
| 11 | 🆕 **H-22**：擦除预演弹窗被强确认弹窗**盖住**（知情同意未呈现） | 登记台账 **H-22** + BACKLOG §二 第 6 条（**不在本 Phase 修**） |
| 12 | 🔴 **执行者本人踩的**：回写追加 `J-36/37/38` 时**吃掉了 `J-35` 整行**（表格外观仍连贯）→ 编号连续性校验发现 → 从只读原件**逐字恢复** | 已恢复并复核（**38 条无缺号**）；教训进经验库 **`D24`** |

### 子节 4 · 缺陷编号（D/O）

| 编号 | 现象 | 根因 | 影响 | 口径 | 修复 | 证据 | 为什么以前没发现 |
|---|---|---|---|---|---|---|---|
| **H-22** | 「彻底擦除」的**预演**内容被**强确认**弹窗盖住 | 两个 `<Modal>` 的 `open` **都是 `Boolean(erase)`**；预演弹窗 `footer={null}`（无"继续"按钮） | 🔴 **知情同意静默失效**（安全关键流程） | 人工目视 `MemoryManagerSection.tsx:439-469` | **本 Phase 不修**（行为变更 + 零渲染层测试 + 安全关键）→ 推荐改法已写进 BACKLOG | `MemoryManagerSection.tsx:439/452`；台账 H-22 | 该组件**零渲染层测试**；类名/弹窗结构**不进类型检查**；`tsc` + 全量测试**全绿** |
| **DOC-1** | 经验库-具体坑库有 **2 个重复 ID**（`E8`、`X10` 各 2 次） | 两次追加时各自续编、无人查重 | "见 E8"这类交叉引用**有歧义** | 口径 `^\|\s*\*\*([A-Z]\d+)\*\*` 表格行 + ID 去重 | **本次不改已有编号**（守"键号续编"）→ 登记待办 | 报告 §十 回写第 6 条；经验库抬头重扫段 | 从来没做过"全库重扫"（P10 待办 ⑥ 才第一次做） |
| **DOC-2** | 经验库条数声明**三个值并存**（64 / 75 / 76） | 手工累加 + 口径不写明 | 读者无法判断"到底几条" | 必须写明正则与"表格行/去重" | 已写死**可复跑口径**（通用 79 / 具体坑 72 行·去重 70） | 经验库两库抬头 | **J-31 型**：计数不带口径 = 没写 |

| **DOC-3** | 🔴 **执行者回写时吃掉了 J-35 整行**（判据台账 J-34 直接接 J-36） | 追加型编辑把"锚点行 + 分隔符"整体消费掉，`new_string` 里**忘了写回锚点行** | 台账少 1 条判据（**外观仍连贯**，肉眼不可见） | `^\| \*\*J-\d+\*\*` 全量取出 → 与 `J-01…J-38` 求差集 | 从**只读原始副本逐字恢复**；复核 **38 条无缺号** | 判据台账行 118（恢复后）；报告 §五 **偏差 12** | 表格**外观连贯** → 只有"编号连续性校验"能抓到 |
### 子节 5 · 经验追加（按级归位，**9 条**）

| 级 | 条数 | 去向 | 编号 |
|---|---|---|---|
| **M** | **4** | `../methodology/BLUEPRINT-经验库-通用.md` **§6g** | `D22`（判据作用域小于被验对象）· `D23`（"分类数量"被当成判据）· `A50`（危险动作多步弹窗必须显式分步）· `D24`（**追加型编辑吃掉锚点行** —— 执行者本人踩的） |
| **L** | **5** | `../methodology/BLUEPRINT-经验库-具体坑.md` **§9** | `C20`（`git grep` 全仓命中被证据目录污染）· `C21`（`commit-tree` 探针的零副作用造法）· `C22`（`core.quotepath` 八进制转义 + BOM）· `D17`（PS 5.1 `-Encoding UTF8` **带 BOM**）· `C23`（源码级守卫被自己的注释触发） |

**顺手重扫抬头条数**（P10 待办 ⑥，**兑现 P9.5 抬头的"建议 P10 全库重扫"**）：
口径 = `^\|\s*\*\*([A-Z]\d+)\*\*\s*\|\s*([HML])\s*\|`（**表格行 / ID 去重**）→
**通用库 79（H 54 + M 25，无重复 ID）**· **具体坑库 72 行 / 去重 70**。旧的 **64 / 75 / 60** 全部保留、就地标注。

### 子节 6 · 待做未做（🔴 不许留空）

| # | 未做项 | 为什么 |
|---|---|---|
| 1 | **H-19 / H-17⑤ 的 2 张截图** | **无人到场**（本次会话没有人眼）→ 机器判据 A1–A6 已全绿，**唯独"看起来对不对"只能人判** → 转 BACKLOG（**任务能不能宣告完成的最后一道门**） |
| 2 | **H-02 / H-03 / H-06 / C-1…C-4** | 需**人**（真实渠道 / 数据风险 / 书面点头）→ 逐条转 BACKLOG，**无一条留"未知"** |
| 3 | **H-22 的修复** | 属**行为变更**（安全关键 + 零测试覆盖）→ **不塞进 P10 的小修**（C1/N1 + J-27 的"不自行扩面"） |
| 4 | **推送（H-B6）** | **C3 明令本 Phase 不推** → 由项目所有者决定 |
| 5 | **未新建 tag** | **Y7 限定了本 Phase 的 ref 写入面** → 不自行扩面（回退用提交哈希） |
| 6 | **`BLUEPRINT-经验库-全量台账.md` 未回写** | 沿用 P7–P9.5 惯例（已在报告 §十 回写第 7 行**明写"未回写"**） |
| 7 | **`.cyrene-merge-analysis/**` 未清理** | **N6：它是证据目录**（清理 = 让核验不可复跑）→ 决策属长期待办 |
| 8 | **上游同步的第一次真实使用** | 当前上游**无新提交**（`b11b8851` = 我们的同步点）→ 机制的价值要在**下一次上游更新**时才被检验 |

## 十二、回写清单（T1–T4；**未勾完不得宣告完成**）

| 触发 | 回写目标 | 内容 | 已勾 |
|---|---|---|---|
| **T2** 基线被改写 | `BLUEPRINT-总蓝图.md` §九 基线块 | ✅ 新增「**结项基线（P10 之后）**」；P9.5 基线整段**移入历史区（不删，内容一字未改）**；🔴 **更正 `cyrene-agent-p8-backup` 的资产行**（实测**只有 8 个文件、无 `.git`**；真正的整仓锚点 = tag `phase0-full` + `cyrene-agent-backup-phase0`） | [x] |
| **T2** 基线被改写 | `BLUEPRINT-总蓝图.md` §四 P10 行 | ✅ `待执行` → **已完成**（提交哈希 `07253ef2` + `732a6451` / 脚本与状态文件已入库 / A1–A10 = 10/10 / H-20 与 H-21 的拍板结果 / 未推送 / 未建 tag）；同时在 §十一 参考文档索引补了 4 行（完成报告 / BACKLOG / SOP / 放弃清单） | [x] |
| **T1** 判据被修正 | `BLUEPRINT-总蓝图.md` §二 判据台账 | ✅ 追加 **J-36**（同步安全 = `U_new ∩ L_dev`，不看上游提交数）+ **J-37**（删键验收必须限定作用域）+ **J-38**（分类**数量**不是判据，"未归类 = 0"才是） | [x] |
| **T1** 判据被修正 | `HUMAN-人工验证台账.md` §五 | ✅ H-20 / H-21 拍板回执（本次之前已在）+ 新增 **§五之三 P10 收口回执**：H-19 / H-17⑤ / H-02 / H-03 / H-06 / C-1…C-4 / H-B6 的**终态 + 去向**（转 BACKLOG 写到**具体条目号**），🆕 **H-22** | [x] |
| **T3** 蓝图被实测推翻 | 本文件 §二 F6 | ✅ **探针数字实测复核一致**（整棵 **130 错** / 只 4 模块 **11 错**）→ **无需标注偏差**（旧值保留） | [x] |
| **T4** 新增经验 | `../methodology/BLUEPRINT-经验库-通用.md` + `-具体坑.md` | ✅ **9 条按级归位**（M×4 → 通用库 §6g；L×5 → 具体坑库 §9）；**顺手重扫抬头条数并写明口径**（通用 **80 = H54+M26** / 具体坑 **72 行·去重 70**；旧值 64 / 75 / 60 全部保留）+ 🔴 顺带发现 **2 个重复 ID** | [x] |
| **T4** 新增经验 | `BLUEPRINT-经验库-全量台账.md` | ✅ **未回写**（沿用 P7–P9.5 惯例）—— 已在 [PHASE-10-完成报告.md](PHASE-10-完成报告.md) §十 回写第 7 行**明写"未回写"** | [x] |

> **规则**：① T1–T4 逐条过完，无一行留空；② 回写只**「新增 + 标注」**，**不静默删除**任何旧值；③ **判据命令** —— **本表行内**不得残留未勾选标记：
> ```powershell
> Select-String -Path 'docs/construction/合并/TASK-合并/PHASE-10-回落与加固.md' -Pattern '^\|.*\[ \]' -Encoding UTF8   # 期望 0 行
> ```
> ⚠️ **不要**用不带 `^\|` 的**全文字面**搜索 —— **本行自己**就含那个标记（即"判据作用域大于被验对象"，与 **J-37 是同一个坑**），故此处**就地给出可判定的作用域**。
> ✅ **本表 7 行全部 `[x]`**（2026，P10 执行完毕）；连同 §十一 施工记录一并填完。
