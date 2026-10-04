# ABANDONED · 有意放弃清单（P10 T2 交付物）

> **本文件回答一个问题**：合并之后，**哪些本地改动被有意放弃了、为什么**。
> 这是 `00-总体任务预览.md` §五 的原话要求，也是**下一次上游同步时的对照表**
> （[SYNC-上游同步SOP.md](SYNC-上游同步SOP.md) §三 分支 B 第 3 步：「这个文件我们当初放弃过什么」）。
>
> **底稿**：P8.5 保真核验的 **Bucket2 = 79 条**（[PHASE-8-合并保真核验报告.md](PHASE-8-合并保真核验报告.md) §三 3.2）
> **判据 A4**：Bucket2 的 79 条**每条**都能在本清单里找到归属（**未归类 = 0**）
> **状态**：📝 已落地（P10）｜**读者**：下次做同步的人 + 项目所有者

---

## 一、口径：Bucket2 是怎么算出来的（**不要重新发明**）

P8.5 用三集合算术把"合并结果相对原始状态的差异"分桶：

```
L = diff(eb6c311a, phase0-full)   →  本地 12 天工作  = 277 路径
U = diff(eb6c311a, b11b8851)      →  官方 12 天工作  = 863 路径
X = diff(phase0-full, 51a20338)   →  原始状态 vs 合并结果 = 901 路径
```

| 分桶 | 定义 | 数量 | 含义 |
|---|---|---|---|
| Bucket1 | `X ∩ U` | 822 | 双方都动过 → 结果里含官方内容，**必然与原始状态不同**（预期，不登记） |
| **Bucket2** | **`X \ U`** | **79** | 🔴 **官方解释不了的差异** = **嫌疑清单** → **本清单的对象** |
| Bucket3 | `L \ X` | 191 | 本地改动路径**逐字未变**（保真证明，不登记） |

**复跑**（证据文件在 `.cyrene-merge-analysis/p8/`）：

```powershell
Get-Content .cyrene-merge-analysis/p8/p8-parity-bucket2.txt -Encoding UTF8 | Measure-Object | Select-Object -ExpandProperty Count
# 期望 79
node .cyrene-merge-analysis/p10/bucket2-classify.mjs      # 本清单 §四 的表格由它机械生成（79 → 79，未归类 0）
```

> ⚠️ **Bucket2 里的东西不全是"放弃"**：它同时也含**我们新加的东西**（官方当然解释不了）。
> 所以本清单**既有"放弃"，也有"不是放弃"的登记项**（见 §五 类⑧）—— 这是口径要求，不是分类混乱。

---

## 二、分类总表（8 类 · **79 条全归属**）

| 类 | 名称 | 条数 | 性质 |
|---|---|---|---|
| **①** | 功能级放弃（D1 / D2 / D3 / D5） | **0**（来自 Bucket2） | 放弃的是"能力面"，不是路径 → §五 ① |
| **②** | 入口级放弃（H-16 `ApiConfigSection`） | **0**（本体） | 同上 → §五 ②；其**测试**在类③ 里 |
| **③** | 测试级放弃（**H-07**） | **13** | 真放弃（12 整文件删 + 1 文件收窄） |
| **④** | 代码级放弃（P4 的 15 `UD` + 3 接受本地删 + 5 个 12 天本地删） | **0**（来自 Bucket2） | 它们都在 `U` 里 → 属 Bucket1 → §五 ④ |
| **⑤** | 有意保留但不接线（12 个本地独有 `settings/**`） | **1** | 保留而非放弃；**明确禁止 `import`** |
| **⑥** | 文档级放弃（**D6**：任何文档不进合并提交） | **56** | 真放弃（但**磁盘文件仍在**） |
| **⑦** | 过程产物（`.cyrene-merge-analysis/**` 证据目录） | **6** | 本就不入库（**不清理**，N6） |
| **⑧** | 显式交付物（**不是放弃**） | **3** | 只为闭合 79 条而登记 |
| | **合计** | **79** | ✅ 与 Bucket2 逐条相等 |

### ⚠️ 偏差登记：蓝图给的是**五类**，实测五类**结构上覆盖不了 79 条**

[PHASE-10-回落与加固.md](PHASE-10-回落与加固.md) §四 4.2 给的是五类（①功能级 ②入口级 ③测试级 ④代码级 ⑤有意保留）。
**实测**：Bucket2 里有 **65 条**落不进这五类 ——

| 落不进五类的部分 | 条数 | 为什么落不进 |
|---|---|---|
| `docs/**`（D6 排除的文档） | **56** | 五类里**没有任何一类**是"文档"。D6 是**独立决策**，不属于①②③④⑤ 中的任何一条 |
| `.cyrene-merge-analysis/**` | **6** | 是**过程产物/证据**，既不是功能、入口、测试、代码，也不是"保留但接线" |
| 三个**显式交付物** | **3** | 它们**根本不是放弃**（是 P5/P6 蓝图点名要新建的），不该被硬塞进"放弃"类 |

⇒ 若照字面只用五类，**未归类 = 65 条 ≫ 允许的 3 条**，**A4 必然失败**。
⇒ **处置：扩为 8 类**（新增 ⑥文档级 / ⑦过程产物 / ⑧显式交付物）。**这不是放松判据，而是让 A4 可判定**。
⇒ 旧口径（五类）**不移除**，记录在此（本任务惯例：偏差是最有价值的产出）。

---

## 三、逐条台账（79 条）

> 表格由 `.cyrene-merge-analysis/p10/bucket2-classify.mjs` **机械生成**（不手抄，避免 79 条路径抄错）。
> `码` 列 = `git diff --name-status` 的状态码：`D` 删除 / `A` 新增 / `M` 修改（**相对 `phase0-full`**）。

| # | 路径 | 码 | 类别 | 依据（一句话） |
|---|---|---|---|---|
| 1 | `.cyrene-merge-analysis/80-renormalize-filelist.txt` | `A` | **⑦** 过程产物（证据目录） | 本就不入库；合并期间被脚本更新/新增 |
| 2 | `.cyrene-merge-analysis/85-p3-untracked-before.txt` | `A` | **⑦** 过程产物（证据目录） | 本就不入库；合并期间被脚本更新/新增 |
| 3 | `.cyrene-merge-analysis/86-p3-tree.txt` | `A` | **⑦** 过程产物（证据目录） | 本就不入库；合并期间被脚本更新/新增 |
| 4 | `.cyrene-merge-analysis/_probe-official-eol.ps1` | `A` | **⑦** 过程产物（证据目录） | 本就不入库；合并期间被脚本更新/新增 |
| 5 | `.cyrene-merge-analysis/protected-features-baseline.json` | `A` | **⑦** 过程产物（证据目录） | 本就不入库；合并期间被脚本更新/新增 |
| 6 | `.cyrene-merge-analysis/robocopy-phase0-summary.txt` | `A` | **⑦** 过程产物（证据目录） | 本就不入库；合并期间被脚本更新/新增 |
| 7 | `docs/design/2026-08-09-cyrene-harness-construction-status.md` | `D` | **⑥** 文档级放弃（D6） | D6：任何文档不进合并提交（docs/design） |
| 8 | `docs/design/2026-08-09-cyrene-harness-current-status.md` | `D` | **⑥** 文档级放弃（D6） | D6：任何文档不进合并提交（docs/design） |
| 9 | `docs/design/2026-08-09-cyreneHarness-construction-plan.md` | `D` | **⑥** 文档级放弃（D6） | D6：任何文档不进合并提交（docs/design） |
| 10 | `docs/design/2026-08-09-cyreneHarness-design-review.md` | `D` | **⑥** 文档级放弃（D6） | D6：任何文档不进合并提交（docs/design） |
| 11 | `docs/design/2026-08-09-harness-runtime-boundary/implementation-plan.md` | `D` | **⑥** 文档级放弃（D6） | D6：任何文档不进合并提交（docs/design） |
| 12 | `docs/design/2026-08-09-harness-runtime-boundary/runtime-boundary-and-change-plan.md` | `D` | **⑥** 文档级放弃（D6） | D6：任何文档不进合并提交（docs/design） |
| 13 | `docs/design/2026-08-12-code-git-live-refresh-construction-plan.md` | `D` | **⑥** 文档级放弃（D6） | D6：任何文档不进合并提交（docs/design） |
| 14 | `docs/design/2026-08-25-harness-parallel-scheduling-optimization-plan.md` | `D` | **⑥** 文档级放弃（D6） | D6：任何文档不进合并提交（docs/design） |
| 15 | `docs/design/2026-08-29-gamebot-p0-construction-plan.md` | `D` | **⑥** 文档级放弃（D6） | D6：任何文档不进合并提交（docs/design） |
| 16 | `docs/design/2026-08-30-main-process-composition-root-construction-plan.md` | `D` | **⑥** 文档级放弃（D6） | D6：任何文档不进合并提交（docs/design） |
| 17 | `docs/design/2026-08-30-main-process-composition-root-redesign.md` | `D` | **⑥** 文档级放弃（D6） | D6：任何文档不进合并提交（docs/design） |
| 18 | `docs/design/2026-09-03-bilinote-video-notes-design-reference.md` | `D` | **⑥** 文档级放弃（D6） | D6：任何文档不进合并提交（docs/design） |
| 19 | `docs/design/2026-09-03-chatpage-refactor-design.md` | `D` | **⑥** 文档级放弃（D6） | D6：任何文档不进合并提交（docs/design） |
| 20 | `docs/design/2026-09-03-chatpage-refactor-regression-checklist.md` | `D` | **⑥** 文档级放弃（D6） | D6：任何文档不进合并提交（docs/design） |
| 21 | `docs/design/2026-09-03-learn-mode-upgrade-construction-plan.md` | `D` | **⑥** 文档级放弃（D6） | D6：任何文档不进合并提交（docs/design） |
| 22 | `docs/design/2026-09-04-moments-social-feed-design.md` | `D` | **⑥** 文档级放弃（D6） | D6：任何文档不进合并提交（docs/design） |
| 23 | `docs/design/2026-09-06-moments-character-social-enhancement-design.md` | `D` | **⑥** 文档级放弃（D6） | D6：任何文档不进合并提交（docs/design） |
| 24 | `docs/design/2026-09-07-moments-mention-reply-and-liveliness-design.md` | `D` | **⑥** 文档级放弃（D6） | D6：任何文档不进合并提交（docs/design） |
| 25 | `docs/design/2026-09-09-attention-toast-center-design.md` | `D` | **⑥** 文档级放弃（D6） | D6：任何文档不进合并提交（docs/design） |
| 26 | `docs/design/2026-09-11-minecraft-goal-harness-headless-design.md` | `D` | **⑥** 文档级放弃（D6） | D6：任何文档不进合并提交（docs/design） |
| 27 | `docs/design/gamebot-Honkai-Star-Rail.md` | `D` | **⑥** 文档级放弃（D6） | D6：任何文档不进合并提交（docs/design） |
| 28 | `docs/design/plugin-marketplace.md` | `D` | **⑥** 文档级放弃（D6） | D6：任何文档不进合并提交（docs/design） |
| 29 | `docs/design/plugin-system/architecture.md` | `D` | **⑥** 文档级放弃（D6） | D6：任何文档不进合并提交（docs/design） |
| 30 | `docs/design/plugin-system/construction-progress.md` | `D` | **⑥** 文档级放弃（D6） | D6：任何文档不进合并提交（docs/design） |
| 31 | `docs/design/plugin-system/implementation-plan.md` | `D` | **⑥** 文档级放弃（D6） | D6：任何文档不进合并提交（docs/design） |
| 32 | `docs/design/snowluma-plugin.md` | `D` | **⑥** 文档级放弃（D6） | D6：任何文档不进合并提交（docs/design） |
| 33 | `docs/internal-issue/2026-08-25-harness-parallel-scheduling-known-issues.md` | `D` | **⑥** 文档级放弃（D6） | D6：任何文档不进合并提交（docs/internal-issue） |
| 34 | `docs/internal-issue/2026-08-26-image-context-screenshot-known-issues.md` | `D` | **⑥** 文档级放弃（D6） | D6：任何文档不进合并提交（docs/internal-issue） |
| 35 | `docs/internal-issue/2026-08-26-maxtoken-model-switch-glm53-known-issues.md` | `D` | **⑥** 文档级放弃（D6） | D6：任何文档不进合并提交（docs/internal-issue） |
| 36 | `docs/internal-issue/2026-08-27-runshell-hang-glm53-reasoning-known-issues.md` | `D` | **⑥** 文档级放弃（D6） | D6：任何文档不进合并提交（docs/internal-issue） |
| 37 | `docs/internal-issue/2026-09-05-minimax-m3-write-markdown-param-loss-report.md` | `D` | **⑥** 文档级放弃（D6） | D6：任何文档不进合并提交（docs/internal-issue） |
| 38 | `docs/internal-issue/2026-09-05-tool-mode-override-env-context-leak.md` | `D` | **⑥** 文档级放弃（D6） | D6：任何文档不进合并提交（docs/internal-issue） |
| 39 | `docs/internal-issue/2026-09-06-shell-output-truncation-timeout-known-issues.md` | `D` | **⑥** 文档级放弃（D6） | D6：任何文档不进合并提交（docs/internal-issue） |
| 40 | `docs/internal-issue/2026-09-09-architecture-review-verification-known-issues.md` | `D` | **⑥** 文档级放弃（D6） | D6：任何文档不进合并提交（docs/internal-issue） |
| 41 | `docs/internal-issue/2026-09-10-proactive-chat-user-report-unconfirmed.md` | `D` | **⑥** 文档级放弃（D6） | D6：任何文档不进合并提交（docs/internal-issue） |
| 42 | `docs/internal-issue/2026-09-25-channel-runtime-context-misread-as-user-paste.md` | `D` | **⑥** 文档级放弃（D6） | D6：任何文档不进合并提交（docs/internal-issue） |
| 43 | `docs/internal-issue/2026-09-25-reranker-cross-encoder-call-fix.md` | `D` | **⑥** 文档级放弃（D6） | D6：任何文档不进合并提交（docs/internal-issue） |
| 44 | `docs/merge-plan/00-æ»ä½ä»»å¡é¢è§.md` | `D` | **⑥** 文档级放弃（D6） | D6：任何文档不进合并提交（docs/merge-plan） |
| 45 | `docs/merge-plan/01-å·²ææ¿å³ç­ä¸ææ¯ä¿®æ­£.md` | `D` | **⑥** 文档级放弃（D6） | D6：任何文档不进合并提交（docs/merge-plan） |
| 46 | `docs/merge-plan/02-æå¬ä¸ä¸æè¿ç§»å¯è¡æ§ç»è®º.md` | `D` | **⑥** 文档级放弃（D6） | D6：任何文档不进合并提交（docs/merge-plan） |
| 47 | `docs/merge-plan/03-æå¬è¿ç§»æ¹æ¡ä¿®è®¢.md` | `D` | **⑥** 文档级放弃（D6） | D6：任何文档不进合并提交（docs/merge-plan） |
| 48 | `docs/merge-plan/04-å®¡è®¡-chats-storeä¸ä¼è¯IDç©ºé´.md` | `D` | **⑥** 文档级放弃（D6） | D6：任何文档不进合并提交（docs/merge-plan） |
| 49 | `docs/merge-plan/PHASE-0-å¤ä»½ä¸åééç¹.md` | `D` | **⑥** 文档级放弃（D6） | D6：任何文档不进合并提交（docs/merge-plan） |
| 50 | `docs/merge-plan/PHASE-1-å·¥å·é¾å¯¹é½.md` | `D` | **⑥** 文档级放弃（D6） | D6：任何文档不进合并提交（docs/merge-plan） |
| 51 | `docs/refactor/2026-08-31-agui-bridge-refactor.md` | `D` | **⑥** 文档级放弃（D6） | D6：任何文档不进合并提交（docs/refactor） |
| 52 | `docs/refactor/2026-08-31-build-options-refactor.md` | `D` | **⑥** 文档级放弃（D6） | D6：任何文档不进合并提交（docs/refactor） |
| 53 | `docs/refactor/2026-08-31-harness-adapter-refactor.md` | `D` | **⑥** 文档级放弃（D6） | D6：任何文档不进合并提交（docs/refactor） |
| 54 | `docs/refactor/2026-09-09-channels-dispatcher-refactor-plan.md` | `D` | **⑥** 文档级放弃（D6） | D6：任何文档不进合并提交（docs/refactor） |
| 55 | `docs/superpowers/plans/2026-08-31-agui-bridge-refactor.md` | `D` | **⑥** 文档级放弃（D6） | D6：任何文档不进合并提交（docs/superpowers） |
| 56 | `docs/superpowers/plans/2026-08-31-build-options-refactor.md` | `D` | **⑥** 文档级放弃（D6） | D6：任何文档不进合并提交（docs/superpowers） |
| 57 | `docs/superpowers/plans/2026-08-31-channel-dispatcher-refactor.md` | `D` | **⑥** 文档级放弃（D6） | D6：任何文档不进合并提交（docs/superpowers） |
| 58 | `docs/superpowers/plans/2026-08-31-god-file-refactor-index.md` | `D` | **⑥** 文档级放弃（D6） | D6：任何文档不进合并提交（docs/superpowers） |
| 59 | `docs/superpowers/plans/2026-08-31-harness-adapter-refactor.md` | `D` | **⑥** 文档级放弃（D6） | D6：任何文档不进合并提交（docs/superpowers） |
| 60 | `docs/superpowers/plans/2026-08-31-memory-store-refactor.md` | `D` | **⑥** 文档级放弃（D6） | D6：任何文档不进合并提交（docs/superpowers） |
| 61 | `docs/superpowers/specs/2026-08-26-windows-native-office-skills-design.md` | `D` | **⑥** 文档级放弃（D6） | D6：任何文档不进合并提交（docs/superpowers） |
| 62 | `docs/superpowers/specs/2026-08-30-god-file-refactor-design.md` | `D` | **⑥** 文档级放弃（D6） | D6：任何文档不进合并提交（docs/superpowers） |
| 63 | `src/main/channels/group-context-flow.test.ts` | `A` | **⑧** 显式交付物（非放弃） | P6 蓝图新建的静默失效探测器（4 tests，已突变验证） |
| 64 | `src/renderer/react/features/chat/components/api-config/api-config-source.test.ts` | `D` | **③** 测试级放弃（H-07） | H-07 整文件删（`0 test`）；⚠️ 与被放弃的 **H-16 入口**同源（宿主 ModelModePanel 被官方重构删除） |
| 65 | `src/renderer/react/features/chat/components/panel-layout.test.ts` | `M` | **③** 测试级放弃（H-07） | **文件收窄**：只删 2 条读已删 ModelModePanel.css 的红用例，保留 4 条绿守卫（J-20） |
| 66 | `src/renderer/settings/channels/panel.test.ts` | `D` | **③** 测试级放弃（H-07） | H-07 整文件删（`0 test`，失去被测对象） |
| 67 | `src/renderer/settings/dom-refs-consistency.test.ts` | `D` | **③** 测试级放弃（H-07） | H-07 整文件删（`0 test`，失去被测对象） |
| 68 | `src/renderer/settings/keywords-markup.test.ts` | `D` | **③** 测试级放弃（H-07） | H-07 整文件删（`0 test`，失去被测对象） |
| 69 | `src/renderer/settings/memory-manager-markup.test.ts` | `D` | **③** 测试级放弃（H-07） | H-07 整文件删（`0 test`，失去被测对象） |
| 70 | `src/renderer/settings/memory/delete-all.test.ts` | `D` | **③** 测试级放弃（H-07） | H-07 整文件删（`0 test`，失去被测对象） |
| 71 | `src/renderer/settings/memory/erasure-flow.test.ts` | `D` | **③** 测试级放弃（H-07） | H-07 整文件删（`0 test`，失去被测对象） |
| 72 | `src/renderer/settings/memory/manager.test.ts` | `D` | **③** 测试级放弃（H-07） | H-07 整文件删（`0 test`，失去被测对象） |
| 73 | `src/renderer/settings/memory/panel.test.ts` | `D` | **③** 测试级放弃（H-07） | H-07 整文件删（`0 test`，失去被测对象） |
| 74 | `src/renderer/settings/panel-migration-markup.test.ts` | `D` | **③** 测试级放弃（H-07） | H-07 整文件删（`0 test`，失去被测对象） |
| 75 | `src/renderer/settings/shared/modal-icon.test.ts` | `M` | **⑤** 有意保留但不接线 | 12 个本地独有 settings 文件之一；P5 偏差 4 夹具复位（不改产品行为） |
| 76 | `src/renderer/settings/zones-markup.test.ts` | `D` | **③** 测试级放弃（H-07） | H-07 整文件删（`0 test`，失去被测对象） |
| 77 | `src/renderer/settings/zones/panel.test.ts` | `D` | **③** 测试级放弃（H-07） | H-07 整文件删（`0 test`，失去被测对象） |
| 78 | `src/shared/usage-badge.test.ts` | `A` | **⑧** 显式交付物（非放弃） | P5 蓝图 §4.2/§4.3 明确「新建」（用量徽章从被删文件抢救） |
| 79 | `src/shared/usage-badge.ts` | `A` | **⑧** 显式交付物（非放弃） | P5 蓝图 §4.2/§4.3 明确「新建」（用量徽章从被删文件抢救） |

---

## 四、各类详述

> 每类给四件事：**放弃什么 / 为什么 / 依据 / 将来要恢复怎么办**。

### ① 功能级放弃（4 项）—— 来自 Bucket2 的条数 **0**

| # | 放弃什么 | 为什么 | 依据 | 将来要恢复怎么办 |
|---|---|---|---|---|
| **D1** | **桌面对话绑定**（`bind` / `unbind` / `resolve` 三个方法） | 实测这 3 个方法**已被自动合并干净删除**（索引取的是 HEAD 版）→ "保留官方绑定管道、零改动"的方案**在物理上不成立**，**删除是唯一自洽解** | 总蓝图 §五 D1 + [`PHASE-6-骨架重写与旁听保留.md`](PHASE-6-骨架重写与旁听保留.md) §零 决策 D-β | ⚠️ **保留物**：`conversation-binding-store.ts` **必须留着**（zones 依赖它）。要恢复绑定功能 = **新功能立项**（不是回退合并） |
| **D2** | **旧设置窗口**（`settings/index.html` + `settings.ts` + `settings.css` + `settings/i18n/**`） | 走官方 React 路线；旧窗口是官方自己重构掉的宿主 | 总蓝图 §五 D2 | 不恢复（官方已把能力迁入 `react/features/settings/*SettingsPanel.tsx`）。**要加设置项 → 加在 React 侧** |
| **D3** | **旁听 A 迁移进 CTA 轨迹**（`observed_message` 新 kind） | 🔴 属**协议级不可回撤**改动：`store.append` 不查 kind 白名单、**读盘才 fail-closed** → **写能成功、读会被拒**（`TRANSCRIPT_CORRUPT_ROW` → 整段对话加载失败），且全代码库**没有 `assertNever` 穷尽性守卫** → 编译器完全不提醒。**把"协议级不可回撤改动"与"结构重写"混进同一次验收，失败时无法归因** | 总蓝图 §五 D3（**已修订**）+ [`03-旁听迁移方案修订.md`](03-旁听迁移方案修订.md) | ✅ **旁听 A 仍在工作**：由 `history-log.ts` 的 `buildGroupContextBlock` 承担（**没有丢失**）。设计清单已备好（[`PHASE-6-骨架重写与旁听保留.md`](PHASE-6-骨架重写与旁听保留.md) §二 事实 6）→ **将来立项时直接取用** |
| **D5** | **旧版本兼容**（旧版数据/配置的向前兼容） | 默认放弃支持，README 加警告即可 | 总蓝图 §五 D5（用户确认） | 需要时按"数据迁移"单独立项 |

> 🔴 **D4 不是"放弃"而是"硬约束"**：旁听 B（自学习语料 `src/main/corpus/**`）**原地不动、绝不迁入轨迹** ——
> 它是"只增不减的长期资产"，迁进轨迹会破坏该语义并使**两道豁免测试**失效。**任何 Phase 都不得动它**。

### ② 入口级放弃（1 项）—— 来自 Bucket2 的条数 **0**（其**测试**在类③）

| 放弃什么 | 原物在哪（**都还在**） | 为什么 | 依据 | 将来要恢复怎么办 |
|---|---|---|---|---|
| **`ApiConfigSection`**（自定义端点 API 配置面板） | `src/renderer/react/features/chat/components/api-config/` 下 **3 个文件全在**：`ApiConfigSection.tsx` / `ApiConfigSection.css` / `presets.ts` | 它的**唯一活宿主** `ModelModePanel.tsx`（聊天窗「模型」面板）**被官方重构删除**（能力迁入 `react/features/settings/*SettingsPanel.tsx`），P4 按"跟随官方"跟删 → 渲染层活引用 = **0**。<br>按 **H-16 · 选项 B「只登记不接回」**：它的初衷是给旧设置栏减负，官方已重做设置页 → **"先不管他"** | 总蓝图 §六 核验补录 + §五 **D7** + [PHASE-8-合并保真核验报告.md](PHASE-8-合并保真核验报告.md) §五 新发现 **H-16** | **接回 = 一行 `import` + 一行 JSX**（P9 接回另外 3 条入口就是这么做的：在某个 `*SettingsPanel.tsx` 里挂上去）。**它的测试在同一批里被删了**（见类③ 第 64 条 `api-config-source.test.ts`）→ 接回时**要一并补测试** |

> ⚠️ **D7 的边界（必须分清）**：① **我方搬运/挪动官方既有 UI 的位置**（纯版面调整）→ **不阻塞验收**，所有者自行改；
> ② 🔴 **我方新增功能所依赖的 UI 入口**（渠道控制台 / 区块页 / 记忆台 + 按人擦除 + 删除全部记忆）→ **必须原封不动加回**（P9 已完成）。
> `ApiConfigSection` 属 **H-16 单列**（**不接回**），不属于 ②。

### ③ 测试级放弃（H-07）—— **13 条**（Bucket2 中的 12 个 `D` + 1 个 `M`）

**放弃什么**：**12 个整文件删**（每文件 `0 test`，因为被测对象已随宿主一起被官方删除）：

```
src/renderer/settings/dom-refs-consistency.test.ts          src/renderer/settings/memory/delete-all.test.ts
src/renderer/settings/keywords-markup.test.ts               src/renderer/settings/memory/erasure-flow.test.ts
src/renderer/settings/memory-manager-markup.test.ts         src/renderer/settings/memory/manager.test.ts
src/renderer/settings/panel-migration-markup.test.ts        src/renderer/settings/memory/panel.test.ts
src/renderer/settings/zones-markup.test.ts                  src/renderer/settings/zones/panel.test.ts
src/renderer/settings/channels/panel.test.ts                src/renderer/react/features/chat/components/api-config/api-config-source.test.ts
```

**+ 1 个文件收窄**（🔴 **不是整文件删**）：

| 文件 | 动作 | 为什么不能整文件删 | 实测 |
|---|---|---|---|
| `src/renderer/react/features/chat/components/panel-layout.test.ts` | 只删 **2 条**读已删 `ModelModePanel.css` 的红用例，**保留 4 条绿守卫** | 🔴 其中 **3 条是「顶栏右上角：用量徽章与窗口控件并排不重叠」守卫** —— 正是 **H-05** 那块**至今还没有人验**的区域（P5 §4.10 特意恢复的回归网）。**照字面"删 13 个"会把 4 条绿守卫一起删掉** | 收窄前 `4 passed / 2 failed` → 收窄后 `Test Files 1 passed / Tests 4 passed (4)`（**J-20**） |

**为什么放弃**：被测对象（旧的 DOM 标记 / 已被官方删除的宿主文件）不存在了。这些测试的"绿"**只在旧世界成立** ——
它们在合并后的树里**结构上不可能转绿**（J-06 / J-09 / J-18）。

**依据**：[PHASE-8-提交合并与收口.md](PHASE-8-提交合并与收口.md)（H-07 拆分执行）+ 判据 **J-20**（"凡'删 N 个测试'，必须按**用例粒度**核对"）。

**将来要恢复怎么办**：**不要"恢复测试"，要"给新实现写新测试"**。
P9 已经示范过：把「里子」模块里的**纯函数抄到 React 侧**（`features/settings/*/rules.ts`）**并写新测试**（`rules.test.ts`）。
React 侧现有的等价门禁：`memory-console/rules.test.ts`（含三段式擦除守卫链、`nextEraseStep` 回归轮数）、`class-name-contract.test.ts`。

> ⚠️ **另外 2 个"空壳模块"的删除不在 Bucket2 里**（属 Bucket1）：`src/renderer/settings/memory/panel.ts`、
> `src/renderer/settings/preferences/panel.ts` —— 因为**官方也删了它们**（`U` 里有），所以不算"官方解释不了的差异"。
> 它们是 P8 按 H-07 删掉的**空壳**（P4 删宿主后剩下的孤儿），登记于此以免遗漏。

### ④ 代码级放弃 —— 来自 Bucket2 的条数 **0**（它们都在 `U` 里 → 属 Bucket1）

| 组 | 条数 | 内容 | 依据 |
|---|---|---|---|
| **P4 处置的 15 个 `UD`**（官方删 / 本地在改 → **跟随删除**） | 15 | `dist/renderer/toast/index.html`、`ModelModePanel.{css,tsx}`、`useChatAppearance{,.test}.ts`、`settings/i18n/{en,zh-CN}.json`、`settings/index.html`、`settings/mcp/panel.test.ts`、`settings.css`、`settings.ts`、`sidebar/sidebar.ts`、`shared/chat-appearance{,.test}.ts`、`vite.config.ts` | [PHASE-4-完成报告.md](PHASE-4-完成报告.md) §3.3 |
| **P4 组 B ·「接受本地删除」** | 3 | `README.en.md`、`useChannelMirrorEvents.ts`、`useChannelMirrorEvents.test.ts` | [PHASE-4-完成报告.md](PHASE-4-完成报告.md) §3.4 |
| **P4 组 A ·「恢复官方版」**（**不是放弃**，登记以防混淆） | 2 | `settings/api/presets.ts`、`settings/tokens/panel.ts` | 同上（组 A 有活 import 指向，故跟随官方恢复） |
| **12 天本地工作期就已删除**（⚠️ **实测更正**） | 5 | `settings/api/state.ts`、`settings/tokens/{cache-statistics.test.ts,cache-statistics.ts,state.ts}`、`settings/vision/dom.ts` | 见下方偏差 |

**实测复核（本次）**：上表 15 + 3 = **18 条**在 `HEAD` 里**全部不存在**（逐条 `git cat-file -e HEAD:<path>` = 未命中，18/18）。

> ⚠️ **偏差登记（PHASE-10 §四 4.2 ④ 的一处归属错误）**：蓝图把
> `api/state.ts`、`tokens/{cache-statistics,cache-statistics.test,state}.ts`、`vision/dom.ts` 写成
> 「**P4 「接受本地删除」组**」。**实测不成立** —— 这 5 个文件在 **`phase0-full` 里就已经不存在**
> （三方存在性：`基点 eb6c311a` = **有** · `官方 b11b8851` = **有** · `phase0-full` = **无** · `HEAD` = **无**）：
> ```
> src/renderer/settings/api/state.ts                    基点=True  官方=True  phase0full=False HEAD=False
> src/renderer/settings/tokens/cache-statistics.test.ts  基点=True  官方=True  phase0full=False HEAD=False
> src/renderer/settings/tokens/cache-statistics.ts       基点=True  官方=True  phase0full=False HEAD=False
> src/renderer/settings/tokens/state.ts                  基点=True  官方=True  phase0full=False HEAD=False
> src/renderer/settings/vision/dom.ts                    基点=True  官方=True  phase0full=False HEAD=False
> ```
> ⇒ 它们的删除发生在**合并之前**（本地 12 天工作期），**不是 P4 的动作**；P4 的「接受本地删除」是**另外 3 个**
> （`README.en.md` + `useChannelMirrorEvents.{ts,test.ts}`，见 §3.4 组 B 原文）。
> 合并只是**尊重了本地已有的删除**（`ours=删 / theirs=未改` → 删除胜出）。**结论不变，归属更正。**

### ⑤ 有意保留但不接线 —— **1 条**（Bucket2 第 75 条：`shared/modal-icon.test.ts`）

**12 个本地独有的 `settings/**` 文件**（Phase 0 口径：官方树里**一个都没有**，本地全在）：

```
memory/{delete-all,erasure-flow,manager}.ts        shared/{modal-icon.test.ts, section-nav.ts}
zones/{dom.ts, manual-group.test.ts, manual-group.ts, panel.ts, picker.test.ts, picker.ts, state.ts}
```

| 问题 | 答案 |
|---|---|
| **放弃什么** | **什么都没放弃** —— 12 个文件**全部保留在磁盘上且未删**（`git cat-file -e HEAD:<path>` 逐个命中，12/12） |
| **为什么登记在这里** | 因为它们**不接线**：合并后没有任何运行期 `import` 指向它们（这就是"官方解释不了"的那部分差异） |
| **依据** | 总蓝图 F4/F5 + **H-21 = A**（「里子」模块保持现状、登记为**只读参照**） |
| **将来要恢复怎么办** | 它们的价值是**参照物**（新面板的行为以它们为准）。若要**纳入类型检查面（B）**或**删除（C）** → **须单独立项**，见 [BACKLOG-长期待办.md](BACKLOG-长期待办.md) |

> 🔴 **不要 `import` 它们**（硬原因：依赖**已删的** `../i18n`、DOM 耦合、**不在任何 `tsconfig` 的 include 面内**）。
> 正确用法：**抄其中的纯函数**到 React 侧并写新测试。详见 §六。

### ⑥ 文档级放弃（D6）—— **56 条**

| 目录 | 条数 | 处置 |
|---|---|---|
| `docs/design/**` | **26** | `git rm -r --cached --quiet docs/design` |
| `docs/internal-issue/**` | **11** | `git rm -r --cached --quiet docs/internal-issue` |
| `docs/superpowers/**` | **8** | `git rm -r --cached --quiet docs/superpowers` |
| `docs/merge-plan/**` | **7** | `git rm -r --cached --quiet docs/merge-plan` |
| `docs/refactor/**` | **4** | `git rm -r --cached --quiet docs/refactor` |
| | **56** | |

**放弃什么**：**任何文档都不进合并提交**（D6，含**官方新增的文档**）。
**为什么**：任务文档是**过程产物**；且索引里原本装着**旧路径** `docs/merge-plan/` 的 13 个**磁盘上已不存在**的文件。
**依据**：总蓝图 §五 **D6**（含"扩展"：官方新增文档一并排除；实测分布 `17/8/8/2 = 35` 是 **P3 期**口径，本次 Bucket2 口径为 `26/11/8/7/4 = 56` —— **两个数口径不同，都对**）。
**判据**：`git ls-files docs/design docs/internal-issue docs/superpowers docs/refactor docs/merge-plan` = **0**。
**将来要恢复怎么办**：🔴 **磁盘文件全部还在**（本清单只"放弃入库"，**没有删文件**）。
要收编进版本库 → 走**方案 B**：`git add "docs/construction/合并"` + `git rm -r --cached --quiet docs/merge-plan`
（⚠️ 这会**修改 D6** → 必须先**停下来问人**并登记 H 编号）。

### ⑦ 过程产物（`.cyrene-merge-analysis/**`）—— **6 条**

`80-renormalize-filelist.txt` / `85-p3-untracked-before.txt` / `86-p3-tree.txt` / `robocopy-phase0-summary.txt` /
`protected-features-baseline.json` / `_probe-official-eol.ps1`

**放弃什么**：不入库（合并期间被脚本更新/新增）。
**为什么**：这是**分析证据目录**（P7–P9.5 的全部复现命令都指着它），不是产品文件。
**依据**：**N6 —— 不清理**（清理它 = 让核验不可复跑）。要不要清理属**长期待办**（→ BACKLOG）。
**将来要恢复怎么办**：不需要"恢复"；它一直在磁盘上。若要清理 → **先确认所有 Phase 报告里的复跑命令都不再需要它**。

### ⑧ 显式交付物（**不是放弃**）—— **3 条**

| 路径 | 码 | 为什么在 Bucket2 里 | 依据 |
|---|---|---|---|
| `src/shared/usage-badge.ts` | `A` | 相对 `phase0-full` 是**新增** —— 因为 `phase0-full` 是 **P0 时点**的快照，而它是 **P5 施工期**才创建的 | P5 蓝图 §4.2 明确"新建"（用量徽章从被删的 `chat-appearance.ts` 抢救出来） |
| `src/shared/usage-badge.test.ts` | `A` | 同上 | P5 蓝图 §4.3 明确"新建"（旧测试随文件被删 → 新模块必须有门禁） |
| `src/main/channels/group-context-flow.test.ts` | `A` | 同上（**P6 施工期**创建） | P6 蓝图 §4.x 明确"新建"（**静默失效探测器**，4 tests，已用**突变测试**自证：摘掉 `dispatcher.ts` 的 `appendIncomingContext` 调用 → 4 绿转 4 红） |

> 🔴 **它们不是"合并偷偷加进来的"** —— 三者在蓝图里都是**显式交付物**，P5/P6 完成报告已登记。
> 登记在本清单只为**闭合 Bucket2 的 79 条**（A4 要求逐条有归属）。
> ⚠️ `group-context-flow.test.ts` 是**全仓唯一**能抓到"群聊旁听静默消失"的门禁 → **后续 Phase 不许把它从门禁名单里去掉**。

---

## 五、只读参照：这 **5 个文件不要 `import`、不要改**（H-21 = A）

| 文件 | 行数 | 已跟踪 | 被 React 侧引用 |
|---|---|---|---|
| `src/renderer/settings/memory/delete-all.ts` | 95 | ✅ | `memory-console/rules.ts:13` → `:21-23` |
| `src/renderer/settings/memory/erasure-flow.ts` | 483 | ✅ | `memory-console/rules.ts:14`（`:68-70`）· `:16`（`:419-466`）· `:17`（`:31`） |
| `src/renderer/settings/memory/manager.ts` | 619 | ✅ | `memory-console/rules.ts:15` → `:89-97` |
| `src/renderer/settings/zones/panel.ts` | 620 | ✅ | 仅 `zones/rules.ts:179` 一处**文字**提及（**非** `file:line` 引用） |
| `src/renderer/settings/zones/picker.ts` | — | ✅ | `zones/rules.ts:8/9/10` → `picker.ts:15-17 / 38-58 / 61-77` |
| **合计** | **1,817+ 行** | | **共 8 处 `file:line` 引用**（`memory-console/rules.ts` **5** + `zones/rules.ts` **3**） |

**它们"不是死代码，却也不活"的准确表述**：有**权威参照**身份，**无任何运行期 `import`**。

**为什么不能 `import`**（实测，两个探针）：

| 探针 | 覆盖范围 | 实测结果 |
|---|---|---|
| 探针 1 | **整棵** `src/renderer/settings/**` | **130 个 `error TS`**（官方自己的历史欠账：`channels/panel.ts` 46 / `tts/panel.ts` 24 / `user/panel.ts` 12 …） ⇒ **整棵纳入不可行** |
| 探针 2 | **只含 4 个「里子」模块**的闭包 | **11 个 `error TS`**：4 × `TS2307 Cannot find module '../i18n'`（`delete-all.ts:12` / `erasure-flow.ts:23` / `manager.ts:25` / `zones/panel.ts:24`）· 1 × `manager.ts:472 TS2345`（`vectors` 字段缺失的真实类型错）· 5 × `shared/modal.ts`（闭包噪声）· 1 × `shared/logger.ts TS2307 node:process`（照抄 renderer 的 exclude 即可消除） |

探针配置留存：`.cyrene-merge-analysis/p10/probe1-whole-subtree.tsconfig.json` / `probe2-four-modules.tsconfig.json`。

> 🔴 **H-21 = A（已拍板）**：**保持现状 + 登记为只读参照**，**本 Phase 不动这 5 个文件任何一行**。
> B（纳入窄类型检查面）/ C（删除）两个选项**成本已量化、将来若要做则单独立项**。

---

## 六、就地更正：总蓝图 §九 的一处**资产性质**偏差

> 规则：**只「新增 + 标注」，不静默删除旧值**（旧行保留在总蓝图里，此处就地更正其**性质**）。

**总蓝图 §九 的回退资产行**把 `E:\AI_Chating\cyrene-agent-p8-backup` 与 tag `phase0-full` **并列**，
容易被读成"**仓库级备份**"。**实测（F10）**：

| 资产 | 实测内容 | 真实性质 |
|---|---|---|
| `E:\AI_Chating\cyrene-agent-p8-backup` | **8 个扁平命名的单文件副本**（`package.json` / `panel-layout.test.ts` / `ChannelsSettingsMigration.test.ts` / `ChannelsSettingsPanel.tsx` / `i18n/{en,zh-CN}.json` / `settings/memory/panel.ts` / `settings/preferences/panel.ts`），**无 `.git`** | ⚠️ **P8 动手前的"单文件保险副本"**，**不是仓库级回退锚点** |
| tag `phase0-full`（`34f0669f`，tree `00ae967e`，2013 文件） | 存在、可 `git show` | ✅ **真正的**原始本地状态锚点（P8.5 认定 = 参照物） |
| `E:\AI_Chating\cyrene-agent-backup-phase0` | **3668 文件**、有 `.git`（HEAD = `eb6c311a`，1893 tracked，`status` **219 条**未提交改动） | ✅ 可用：**工作区**才是原始本地改动（219 条 = 那 12 天）；`.git` 只是 clone 时状态 |

⇒ **回退时请用 tag + `cyrene-agent-backup-phase0`，不要指望 `-p8-backup` 能整仓还原。**

---

## 七、校验（任何人可复跑）

```powershell
cd E:\AI_Chating\cyrene-agent

# ① Bucket2 底稿条数（A4 的分母）
(Get-Content .cyrene-merge-analysis/p8/p8-parity-bucket2.txt -Encoding UTF8 | Measure-Object).Count   # 期望 79

# ② 机械归类：逐条落类 + 未归类计数（A4 的分子）
node .cyrene-merge-analysis/p10/bucket2-classify.mjs      # 期望「已归类 = 79 ｜ 未归类 = 0」，exit 0

# ③ 本清单是否覆盖 79 条（表格行数）
(Select-String -Path "docs/construction/合并/TASK-合并/ABANDONED-有意放弃清单.md" -Pattern '^\| \d+ \|' -Encoding UTF8 | Measure-Object).Count   # 期望 79

# ④ 只读参照 5 个文件零改动（A5）
git diff --name-only d27920ab HEAD -- src/renderer/settings/memory/delete-all.ts src/renderer/settings/memory/erasure-flow.ts src/renderer/settings/memory/manager.ts src/renderer/settings/zones/panel.ts src/renderer/settings/zones/picker.ts
# 期望：空

# ⑤ 文档确实没进索引（D6）
git ls-files docs/design docs/internal-issue docs/superpowers docs/refactor docs/merge-plan   # 期望 0 行
```
