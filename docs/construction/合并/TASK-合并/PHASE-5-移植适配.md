# Phase 5 施工蓝图：移植适配（Tier B）

> **执行者**：agent。本文件**自包含**，不需要对话历史即可执行。
> **风险等级**：中
> **预计耗时**：90–150 分钟
> **文档规范**：见 [`../methodology/BLUEPRINT-撰写规范.md`](../methodology/BLUEPRINT-撰写规范.md) §4（施工蓝图 **12 节**，缺一不可）
> **前置**：P4 已完成（[`PHASE-4-完成报告.md`](PHASE-4-完成报告.md)）——冲突 46 → **26**，且 26 个全部是 `UU`（真三方冲突）
> **读取纪律**：不要通读 `../methodology/`。本阶段只需 **3 份**：撰写规范**相关章节** + [`BLUEPRINT-总蓝图.md`](BLUEPRINT-总蓝图.md) **相关节** + 本文档。

> ⚠️ **本 Phase 的规模已被实测修正：原计划 15 文件 / 22 块 → 实测 16 文件 / 27 块。**
> 并且**做法发生了方向性改变**：原描述是"把本地改动搬回官方树"，实测证明正确做法是
> **"把本地能力重新挂到官方的新架构上，并删掉官方已经放弃的旧载体"**（见 §二 · 事实 2/3/4）。
> **执行者请按本文档执行，不要按旧版描述执行。**

---

## 一、施工目标

### 核心问题（为什么需要本 Phase）

P3 执行合并后，本地 12 天的自建能力与官方新版**落在同一批文件的同一片区域**，产生 **27 个冲突块**。
这些冲突块不是"谁覆盖谁"的选择题，而是三类真实故障：

| # | 故障类型 | 实测根因（`file:line`） |
|---|---|---|
| 1 | **编译直接失败** | `src/main/settings/settings-facade.ts:17-18` 仍 `import { normalizeChatAppearance } from "../../shared/chat-appearance"`，而该文件**已被 P4 删除**（`git ls-files src/shared/chat-appearance.ts` → 0 命中） |
| 2 | **悬空引用** | 同文件 `:56` 的 `usageBadgeColor: DEFAULT_CHAT_APPEARANCE.usageBadgeColor` **位于冲突块之外**，import 移除后必成悬空标识符 |
| 3 | **静默死功能** | `usageBadgeColor` 全仓库**只有 1 个出现点**（就是上面那个默认值，`:56`）；`--cy-usage-badge-image` **0 个 setter**；官方树对 `usageBadge` / `USAGE_BADGE` / `cy-usage-badge` / `usage-badge-color` 的检索**全部 0 命中** |

> 第 3 条是本任务最危险的失效模式：**代码能编译、测试全绿、功能已死**。
> [`BLUEPRINT-总蓝图.md`](BLUEPRINT-总蓝图.md) §六 的 11 项保护清单里，`USAGE_BADGE` 的基线是 2，
> P4 之后已退化为 **0**，本 Phase 必须把它**重新做出来**。

### 目标清单（可勾选）

- [ ] **T1** 16 个文件的 **27 个冲突块**全部解决，文件里 **0 个冲突标记**
- [ ] **T2** 本地 4 项独有能力在官方新架构上恢复：① 顶栏用量徽章 ② 群上下文条数 ③ 对话用量 IPC ④ 弹窗确认门 `confirmValue`
- [ ] **T3** 新增独立模块 `src/shared/usage-badge.ts`（3 个导出），并配一条新测试
- [ ] **T4** 删净官方已放弃的旧载体：`chat-appearance` 的一切引用、`CHAT_TYPOGRAPHY_CHANGED`、悬空的 `usageBadgeColor`
- [ ] **T5** `tsc` 三目标 + 定向 vitest 全绿（失败项必须能归因到 §六「不算失败」三类）
- [ ] **T6** 人工环节：4 项 H-C 登记进 [`HUMAN-人工验证台账.md`](HUMAN-人工验证台账.md)、2 项 H-B 评审拿到结论

### 非目标（明确不做）

| 不做 | 为什么 | 何时做 |
|---|---|---|
| ❌ 解决 `src/main/channels/**`、`src/main/orchestrator/**` 的冲突 | 那是 P6 的范围（**10 文件 / 37 块**，见 §二 事实 5） | P6 |
| ❌ `npm ci` / `npm install` / `npm install --package-lock-only` | 会改 `node_modules` 与锁文件，混淆本 Phase 的判定 | **P8** |
| ❌ 重新生成 `package-lock.json` | 属生成物；本 Phase 只做"消除冲突标记"这一步 | **P8**（`npm ci` 之后用 `npm install --package-lock-only` 重建） |
| ❌ 构建链切换 / 改 `package.json` / 改 `vite.config.ts` | 官方已把 `vite.config.ts` 换成新版，属 P7 | P7 |
| ❌ 重新引入 `src/shared/chat-appearance.ts` | 官方已用 `message-typography` 取代该概念（D2/D4 相关决策） | 永不 |
| ❌ 把 `usageBadgeColor` 做成"能用的设置" | 官方设置 UI 里**已没有**这个控件（官方树 0 命中 `usage-badge-color`），重做等于重造被删除的 UI | 只有项目所有者明确要求时 |
| ❌ 手工编辑 `package-lock.json` 的 JSON 内容 | JSON 手改必错，且 P8 会重建 | P8 |
| ❌ 提交 | 26 个 `UU` 全部解决后才提交 | **P7 之后** |
| ❌ `git merge --abort` | 会丢弃 P3/P4 全部成果 | **永不**（见 §八） |

---

## 二、实测证据（决定本 Phase 做法，执行前请读）★

> 全部证据采于本次撰写会话，**在同一台机器、同一工作区**上实测；
> 复现命令一律写成本节可粘贴的形式，**不要凭记忆推断**。

### 事实 1 · 27 个冲突块的精确坐标（权威，执行时照此核对）

复现命令（对 16 个文件逐行扫描 `<`×7 / `=`×7 / `>`×7 标记）：

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$env:PATH = "D:\data\node24;" + $env:PATH
$p5 = @(
 'README.md','package-lock.json','src/shared/ipc-channels.ts',
 'src/main/settings/settings-facade.ts','src/main/settings/general-settings.ts',
 'src/main/settings/general-settings-lifecycle.ts','src/main/channels/settings-store.ts',
 'src/renderer/settings/general/dom.ts','src/renderer/settings/shared/types.ts',
 'src/renderer/settings/memory/panel.ts','src/renderer/settings/shared/modal.ts',
 'src/renderer/react/i18n/en.json','src/renderer/react/i18n/zh-CN.json',
 'src/renderer/react/features/chat/components/ChatPageNavigation.tsx',
 'src/renderer/react/features/chat/components/ChatPagePanelHost.tsx',
 'src/renderer/react/features/chat/pages/ChatPage.tsx',
 'src/renderer/react/styles/react-root.css')      # ← P5 执行后补入（见下方"文件数修正"）
$tot = 0
foreach ($f in $p5) {
  $l = [System.IO.File]::ReadAllLines((Resolve-Path -LiteralPath $f))
  $spans = @(); $i = 0
  while ($i -lt $l.Count) {
    if ($l[$i] -match '^<{7} ') {
      $s = $i + 1; $m = -1; $e = -1; $j = $i + 1
      while ($j -lt $l.Count -and $m -lt 0) { if ($l[$j] -match '^={7}$') { $m = $j + 1 }; $j++ }
      while ($j -lt $l.Count -and $e -lt 0) { if ($l[$j] -match '^>{7} ') { $e = $j + 1 }; $j++ }
      $spans += "$s-$e"; $tot++; $i = $j
    } else { $i++ }
  }
  "{0,4} 行 | {1,2} 块 | {2}" -f $l.Count, $spans.Count, $f
  "         块行区间: " + ($spans -join ', ')
}
"===== P5 合计: $tot 块 / $($p5.Count) 文件（期望 27 块 / 16 文件）====="
```

**实测结果（判据：27 块 / 16 文件）**：

| 文件 | 总行数 | 块数 | 冲突块行区间（写本文档时） | 处置类型 |
|---|---|---|---|---|
| `README.md` | 997 | **5** | `14-32`, `66-98`, `350-382`, `398-478`, `484-997` | 结构重组（见 §四 · 步骤 4.9） |
| `package-lock.json` | 23264 | **1** | `3044-3404` | 取官方侧 `:3:`（`:3:` 已是双方合并结果） |
| `src/shared/ipc-channels.ts` | 554 | **1** | `133-139` | 追加合并 − 1 行（删 `CHAT_TYPOGRAPHY_CHANGED`） |
| `src/main/settings/settings-facade.ts` | 469 | **1** | `16-20` | 取官方（删 ours 两行 import） |
| `src/main/settings/general-settings.ts` | 209 | **1** | `185-208` | 追加合并（补回 `}`） |
| `src/main/settings/general-settings-lifecycle.ts` | 191 | **1** | `166-173` | 取官方（删 ours 8 行） |
| `src/main/channels/settings-store.ts` | 524 | **1** | `24-30` | 追加合并（3 行 + 1 行） |
| `src/renderer/settings/general/dom.ts` | 30 | **1** | `25-28` | 取 ours（留注释） |
| `src/renderer/settings/shared/types.ts` | 556 | **1** | `148-154` | 取 ours（补回 `}`） |
| `src/renderer/settings/memory/panel.ts` | 300 | **1** | `19-23` | 追加合并（两者都要） |
| `src/renderer/settings/shared/modal.ts` | 603 | **5** | `322-365`, `407-428`, `464-468`, `483-539`, `546-602` | **手工移植**（见 §四 · 步骤 4.7） |
| `src/renderer/react/i18n/en.json` | 2178 | **1** | `13-166` | 拼接 + **补 1 个逗号**（见事实 4） |
| `src/renderer/react/i18n/zh-CN.json` | 2178 | **1** | `13-166` | 同上 |
| `src/renderer/react/features/chat/components/ChatPageNavigation.tsx` | 190 | **3** | `12-17`, `23-32`, `115-157` | 追加合并（import + 面板联合类型 + 顶栏结构） |
| `src/renderer/react/features/chat/components/ChatPagePanelHost.tsx` | 34 | **2** | `2-9`, `23-30` | 追加合并（import + switch 分支联合） |
| `src/renderer/react/features/chat/pages/ChatPage.tsx` | 1981 | **1** | `67-71` | 追加合并 + **改 import 路径**（见事实 3） |

> ⚠️ **行号是"写本文档时"的坐标**。执行时**必须重新扫描**（命令在上），
> 若行号漂移**以新扫描结果为准**；只有"块数 = 27 / 文件数 = **17**"是硬判据。
>
> 🔴 **文件数修正（2026 · P5 执行后回写）：16 → 17。**
> 事实 1 的表与 §四/§六 的 `$p5` 数组**都漏了 `src/renderer/react/styles/react-root.css`**
> （§4.10 明确要求改它，所以它一直是本 Phase 的工作项，只是没进清单）。
> 该文件的 1 块在事实 1 的表里已被计入 27 块之内，**所以块数不变、只是文件数 16 → 17**。
> 执行者已按 §4.10 处理并 `git add`（否则它会一直是 `UU`，让 A2 看到 `UU = 10` 而误判）。

### 事实 2 · 原计划"15 文件 / 22 块"是**低估**，且清单本身也需修正

| 项 | 总蓝图旧描述 | **实测** |
|---|---|---|
| P5 文件数 | 15 | **16**（总蓝图漏了 `src/renderer/react/i18n/{en,zh-CN}.json` 与 `README.md`/`package-lock.json` 的归属） |
| P5 冲突块 | 22 | **27** |
| P6 文件数 / 块数 | 11 / 42 | ~~10 / 37~~ → **9 / 36**（见下「P6 修正」） |
| 合计 | 64 | **63**（27 + 36；旧口径 64 里含 1 块**重复计数**） |

> 🔴 **P6 修正（2026 · P5 执行后实测，采纳执行者结论）**：
> 本表当初把 `src/main/settings/general-settings-lifecycle.ts` 的 **1 块**同时算进了 P5（16 文件里的最后一个）**和** P6，导致 P6 被多算 1 块 / 1 文件 —— 而本表自己列出的 P6 清单**只有 9 个文件**（自相矛盾）。
> **以实测为准：P6 = 9 文件 / 36 块**（命令与逐文件块数见 [`PHASE-5-完成报告.md`](PHASE-5-完成报告.md) §二 2.1）。P5 的 16 文件 / 27 块不变。
> **27 + 36 = 63** 才是本任务冲突块的正确总数；**"64"只在"lifecycle 算两次"的口径下成立**
> —— 那是**本文档（蓝图）在把 64 拆给 P5/P6 时的算术失误**，不是文件被改动、也不是 P3 测量错。
> 留此说明的原因：后续 Phase 若在别处看到"64"，应知道它是**分配口径**问题，不必去追查丢失的冲突块。

**处置**：已在 [`BLUEPRINT-总蓝图.md`](BLUEPRINT-总蓝图.md) §四 就地修正并注明「曾错、已修正」（T3 回写）。
**执行者按本文档的 16/27 执行。**

### 事实 3 · 悬空 import 的**真实方向**（P4 偏差 4 的延续）

`src/renderer/react/features/chat/pages/ChatPage.tsx` 只有 1 个冲突块（`67-71`），两侧内容：

```
 67: <<<<<<< HEAD
 68: =======                      ← HEAD 侧【空】
 69: import { useChannelMirrorEvents } from "../hooks/useChannelMirrorEvents";
 70: import { useFeedback } from "../../../components/feedback/FeedbackProvider";
 71: >>>>>>> refs/remotes/official/master
```

| 事实 | 实测 |
|---|---|
| 这两行属于**官方侧（THEIRS）**，不属于我们 | `git show :2:` 该区域为空 |
| `useChannelMirrorEvents.ts` 已被 P4 删除（D1 决定） | `git status --porcelain -- <该路径>` → 无输出 |
| `useFeedback` 的 specifier **本身就是坏的** | ~~`../../../components/feedback/FeedbackProvider` → 解析为 `src/renderer/components/feedback/`，**该目录不存在**~~ **🔴 本条经 P5 实测证伪，见下** |
| 官方树里的真实路径 | `src/renderer/react/components/feedback/FeedbackProvider.tsx`（`git ls-tree -r --name-only MERGE_HEAD \| Select-String FeedbackProvider` 实测） |

> 🔴 **P5 执行时实测证伪（2026 修订，执行者必读）**：上表第 2 行的"specifier 是坏的"**判断错误**。
> `ChatPage.tsx` 位于 `src/renderer/react/features/chat/pages/`，**`../../../` = `src/renderer/react/`**（不是 `src/renderer/`），
> 所以官方原值 `../../../components/feedback/FeedbackProvider` **正好**指向
> `src/renderer/react/components/feedback/FeedbackProvider.tsx` —— **它本来就是对的**。
>
> 实测（Node `path.resolve` 双向核对）：
> ```
> ../../../components/feedback/FeedbackProvider
>    -> src\renderer\react\components\feedback\FeedbackProvider   EXISTS   ✅
> ../../../react/components/feedback/FeedbackProvider
>    -> src\renderer\react\react\components\feedback\FeedbackProvider  MISSING  ❌
> ```
> 按原结论改成带 `react/` 的版本会直接 `TS2307`（P5 首轮 `tsc renderer` 已复现，回退后归零）。

**结论（已按 P5 实测修正）**：该块**取官方侧但删掉第 69 行**（`useChannelMirrorEvents`，该文件已被 P4 按 D1 删除），
**`useFeedback` 的 specifier 保持官方原值 `"../../../components/feedback/FeedbackProvider"` 不动**。

### 事实 4 · i18n 三个键在两个语言文件里**完全对称**（拼接可判定）

用 Node 从索引三阶段（`:1:` base / `:2:` ours / `:3:` theirs）实测：

| 语言 | base 顶层键 | ours | theirs | **ours 独有** | **theirs 独有** |
|---|---|---|---|---|---|
| `en.json` | 37 | 40 | 43 | `apiConfig`, `toolConsole`, `usageBadge` | `onboarding`, `character`, `openWorkspace`, `fileTree`, `settingsPage`, `scheduler` |
| `zh-CN.json` | 37 | 40 | 43 | 同上（**完全一致**） | 同上（**完全一致**） |

→ **拼接后应为 46 个顶层键**。可判定、可复核。

> 🔴 **拼接处有一个必须补的逗号**：ours 侧末行是 `    }`（关闭 `apiConfig`），
> theirs 侧首行是 `  "onboarding": {`。直接拼接会得到**非法 JSON**
> （用 Node 实测报错：`Expected ',' or '}' after property value in JSON at position 4524 (line 139 column 2)`）。
> **必须在 ours 末行后补一个 `,`。**

### 事实 5 · `usageBadgeColor` 是**可编译的死设置**（关键判定）

| 检索 | 实测结果 |
|---|---|
| 全仓库 `usageBadgeColor` | **1 处**：`src/main/settings/settings-facade.ts:56`（默认值，冲突块**之外**） |
| 全仓库 `--cy-usage-badge-image` 的 setter | **0 处**（只有 `src/renderer/react/features/chat/components/UsageBadge.css:33,41` 的**消费**，带 fallback） |
| 官方树 `usageBadge` / `USAGE_BADGE` / `cy-usage-badge` | **0 命中** |
| 官方树 `usage-badge-color` | **0 命中**（官方设置 UI 里没有这个控件） |
| 工作区 `usage-badge-color` 残留 | `src/renderer/settings/appearance/dom.ts:19-20` 两个 `getElementById`（元素所在的 `settings/index.html` 已被 P4 删除）|
| 这两个残留的 import 者 | **0 个**（Grep `usageBadgeColorSelect\|usageBadgeColorCustom` 只命中定义处） |

**判定**：这条设置**写入端与读取端都不存在**，属"能编译、能保存、没有任何效果"的死代码。
本 Phase 按 **T4** 删除它（并写进 §十二 有意保留台账）——**不要**替官方重造这个 UI。

### 事实 6 · 弹窗确认门依附 **ours** 的弹窗实现，必须移植进官方队列

| 事实 | 实测 |
|---|---|
| `confirmValue` 的**活调用者** | `src/renderer/settings/memory/delete-all.ts:66`、`src/renderer/settings/memory/erasure-flow.ts:385` |
| `confirmValue` 的测试 | `src/renderer/settings/memory/delete-all.test.ts:60,90,108`（含"不传 confirmValue 时确认按钮保持可点"这条回归） |
| 官方侧的 `showInputModal` | **不再直接渲染**，改为 `enqueueBlockingDialog({ kind: "input", options, resolve })`，由 `renderInputDialog` 统一渲染 |
| 官方侧的输入框还有额外能力 | `activateDialogFocus(dialog, inputEl, onCancel)` 焦点环、`settled` 幂等标记、`finishBlockingDialog(request, ...)` 队列推进、`activeCancel` 供 Esc 统一取消 |
| ours 侧的 `showModal`（旧签名）**仍需保留** | 活调用者：`memory/delete-all.ts:47`、`memory/manager.ts:442,495`、`zones/panel.ts:400`；测试：`mcp/modal-interaction.test.ts:172,196`、`shared/modal-icon.test.ts:102,108` |

**结论**：`confirmValue` 必须**移植**进官方的 `renderInputDialog`，且**不能**丢掉队列/焦点/幂等这三项官方能力（§四 · 步骤 4.7 给出逐行写法）。

### 事实 7 · P5 完成后**必然**留下 37 个冲突块

`git status --porcelain | ForEach-Object { $_.Substring(0,2) } | Group-Object` 期望：
**`UU = 10`（P6 的 10 个文件），其它码为 0**。
**任何"用全局循环把所有冲突标记删掉"的写法都会误伤 P6 的范围** → 只允许对 §四 明确的 16 个文件动手。

### 事实 8 · 🔴 「合并前」测试基线已实测（**本 Phase 的门禁就建立在这上面**）

**测法**（只读、不污染主仓库；执行者可复现）：`git worktree add <临时目录> phase3-work-snapshot`
→ 把主仓库 `node_modules` 用 **junction/mklink /J** 联进工作树（不 `npm install`）→ 在工作树里跑 vitest。

**实测结果（vitest 4.1.9 / Node v24.21.0 / tag `phase3-work-snapshot` = `586eae90`）**：

| 分组 | 文件数 | 结果 |
|---|---|---|
| **合并前已存在的测试文件** | **16** | **全绿：`Test Files 16 passed (16)` / `Tests 151 passed (151)`，退出码 0** |
| 合并前不存在（**官方新增**，`git status` 全为 `A `） | 5 | 无基线（快照里没有这些文件）→ `No test files found` |

**逐文件基线（16 个可作门禁的文件，全部 PASS）**：

| 测试文件 | 基线 tests 数 |
|---|---|
| `src/renderer/settings/shared/modal-icon.test.ts` | 10 |
| `src/renderer/settings/mcp/modal-interaction.test.ts` | 10 |
| `src/renderer/settings/memory/delete-all.test.ts` | 8 |
| `src/renderer/settings/memory/erasure-flow.test.ts` | 25 |
| `src/renderer/settings/memory/manager.test.ts` | 21 |
| `src/renderer/settings/memory/panel.test.ts` | 10 |
| `src/renderer/settings/panel-migration-markup.test.ts` | 8 ⚠️ 见下 |
| `src/renderer/settings/dom-refs-consistency.test.ts` | 3 |
| `src/renderer/react/features/chat/components/panel-layout.test.ts` | 6 |
| `src/renderer/react/features/chat/components/ChatPageNavigation.test.ts` | 3 |
| `src/renderer/react/features/chat/pages/ChatPage.test.ts` | 1 |
| `src/renderer/react/styles/react-root.visual.test.ts` | 1 |
| `src/main/settings/settings-facade.test.ts` | 17 |
| `src/main/settings/general-settings-lifecycle.test.ts` | 7 |
| `src/main/channels/settings-store.test.ts` | 14 |
| `src/main/conversation-usage-store.test.ts` | 7 |

**🔴 四条由基线推出的结论（直接改变 §六 的写法）**：

1. **11 个文件是 `绿 → 绿` 门禁**（tests = **79**）：合并前全绿，所以 P5 之后**必须仍全绿**（test 数不得减少）。
   —— 这把判据从"通过就行"提升为**回归检测**，是本 Phase 最强的门禁。
2. 🔴 **有 6 个文件是"假基线"（合并前能绿、P5 之后必然红）**，**必须从门禁里剔除**，见下方「事实 9」。
   它们是：`memory/delete-all`(8) / `memory/erasure-flow`(25) / `memory/manager`(21) / `memory/panel`(10) /
   `panel-migration-markup`(8) / `dom-refs-consistency`(3)。
   剔除后门禁为 **10 个既有文件**；tests 总数以**逐文件基线**为准（约 71），
   **硬判据是"这 10 个文件失败数 = 0 + 退出码 0"**（详见 §六 A8-A）。
3. **合并前不可能出现 `@lobehub/icons` 类失败**：该依赖在快照的 `package.json` 里**完全不存在**
   （合并后的 `package.json:93` 才有），且快照 `src` 下对它 **0 处引用** —— 它是**合并侧新增**。
   → P5 之后若出现 `Failed to resolve import "@lobehub/icons"`，属 P8 的 `npm ci` 范围（第 ① 类），**不是** P5 缺陷。
4. ⚠️ **基线必须"分类"而不是"照抄"**：合并前的绿/红是**在旧世界成立的**。
   凡是**依赖被 P4 删除的文件**的测试，其"绿"**不会延续到合并后** —— 这类测试要在动手前就挑出来（事实 9）。

> ⚠️ **顺带实测出的一个高危操作陷阱（已写入 §九 K13）**：
> 用 junction 把 `node_modules` 联进临时工作树后，**必须先 `cmd /c rmdir <工作树>\node_modules` 解除联接，
> 再 `git worktree remove --force`**。否则 git 的递归删除会**穿透 junction 删掉主仓库真实的 `node_modules`**。
> （本次执行者按此顺序收尾，事后复核主仓库 `node_modules\vitest`、`node_modules\vite` 均完好。）

### 事实 9 · 🔴 P4 留下 **7 个**「失去被测对象」的测试（**本 Phase 执行时现场发现，已核实**）

**现象**：P5 执行者报告——`src/renderer/settings/{i18n/**,index.html}` 与 `src/renderer/i18n-runtime/index.ts`
已被 **P4 删除**，而 `src/renderer/settings/` 下 6 个模块仍在 `import { t } from "../i18n"`（229 处 `t()` 调用），
导致 4 个测试文件跑不起来。
**本条经蓝图作者独立复核两轮**：第一轮纠出 **6 个**（补 `dom-refs-consistency`），
第二轮（收到 P5 完成报告后）确认为 **7 个**（再补 `panel-layout`，死因是 `ModelModePanel.css` 被删，属**另一条**删除线）。

**复核结论（逐条实测，非推断）**：

| 检验 | 实测结果 |
|---|---|
| `src/renderer/settings/i18n/`（`index.ts` / `en.json` / `zh-CN.json`） | **工作区与官方树都不存在**；`git status` 显示 `D src/renderer/settings/i18n/{en.json,index.ts,zh-CN.json}` + `D src/renderer/i18n-runtime/index.ts` → **是本分支主动删除（P4，随旧设置窗口一起）**，不是官方删除 |
| 6 个 `import { t } from "../i18n"` 的模块 | `memory/{delete-all,erasure-flow,manager,panel}.ts`、`preferences/panel.ts`、`zones/panel.ts` |
| 这 6 个模块的**真实 import 者**（按相对 specifier 精确匹配 + `git grep` 反向复核） | **0 个**（除 `delete-all.ts` 被自己的测试 import）—— 旧宿主（`settings.ts` / `index.html`）已被 P4 删除，**整条链在运行时不可达** |
| `tsconfig.renderer.json` 的 include 范围 | **只有** `src/renderer/react/**`、`src/renderer/react-perf/**`、`src/renderer/global.d.ts`、`src/shared/**` → **`src/renderer/settings/**` 不在类型检查范围**，所以这不是编译错误，只在**测试运行期**暴露 |
| 因此受影响的基线测试 | **7 个**（见下表）：`memory/delete-all` / `memory/erasure-flow` / `memory/manager` / `memory/panel` / `panel-migration-markup` / `dom-refs-consistency` / **`panel-layout`** |

**这 7 个文件的具体死法（两条独立死因线，全部指向 P4 的删除动作）**：

| 测试 | 死因 | 证据 |
|---|---|---|
| `memory/erasure-flow.test.ts` | `:15` `readFileSync(path.resolve(__dirname, "..", "index.html"))` → **ENOENT** | `src/renderer/settings/index.html` 已被 P4 删除 |
| `memory/manager.test.ts` | `:16` 同上 | 同上 |
| `memory/panel.test.ts` | `:9` 同上 | 同上 |
| `panel-migration-markup.test.ts` | `:5` 读 `./index.html`、`:85` 读 `./settings.css` → **ENOENT** | 两个文件都被 P4 删除 |
| `dom-refs-consistency.test.ts` | `:16` `readFileSync(path.join(settingsDir, "index.html"))` → **ENOENT** | 同上（该文件正是"DOM 引用与 index.html 一致性守卫"，**被测对象没了，守卫本身失效**） |
| `memory/delete-all.test.ts` | `:13` `import … from "./delete-all"` → `delete-all.ts:12` → `../i18n` **解析失败** | `settings/i18n/**` 被 P4 删除 |
| **`panel-layout.test.ts`** | `:48` / `:54` 读 `./ModelModePanel.css` → **ENOENT**（该文件是本地自建、**官方侧没有**，P4 随组件一起删） | **P5 执行时现场发现（第 7 个）**：它三方都存在且无冲突，所以从冲突清单里永远看不到；`git status` 该 CSS 为 `D ` |

> 🔴 **P5 对 `panel-layout.test.ts` 的收窄处理（已验证，见执行报告 §五 偏差 9）**：
> 把两个 CSS 的 `readFileSync` **从模块顶层移进各自的 `describe`**（不删任何用例）→
> 该文件从"**整个 suite 加载失败**"变为"**可加载**"：实测 **`4 passed / 2 failed`**，其中
> **3 条「顶栏不重叠」守卫（正是 §4.10 修复的回归网）恢复运行且全绿**，剩下 2 条失败的堆栈精确指向已删 CSS。
> **这 3 条守卫绿 = §4.10 的验收证据**，不可丢。

**🔴 处置决定（蓝图作者拍板，执行者照做）**：

1. **不恢复** `settings/i18n/**` 或 `i18n-runtime/index.ts`。
   理由：它们**只服务于这条已死的旧设置窗口子树**（`git grep` 实测：旧宿主没了以后，除了这 6 个孤儿模块再无消费者）；
   **恢复它们等于把 P4 明确删掉的文件重新引入仓库**，与 D2（旧设置窗口走官方 React 路线）直接冲突。
   另：恢复也只能救活 `delete-all.test.ts` **一个**文件（其余 6 个死于 `index.html` / `settings.css` / `ModelModePanel.css` 被删）。
2. **本 Phase 也不删**这 6 个孤儿模块与 7 个死测试 —— 删源码/删测试是**产品决定**，不属于"解决合并冲突"。
3. **A8-A 的门禁按实测收窄**：`16 文件 / 151 tests` → **`10 个既有文件`**。
   剔除的 6 个文件（`delete-all` / `erasure-flow` / `manager` / `memory-panel` / `panel-migration-markup` / `dom-refs-consistency`）
   按合并前逐文件基线合计 75 tests；**第 7 个 `panel-layout` 按 P5 的收窄方案处理**（4 绿 / 2 预期红，见上）。
   **精确值以执行时 vitest 输出为准**，本 Phase 只用它做"有没有漏跑"的交叉验证。
   同批登记为 P8 待处置项（`HUMAN-人工验证台账.md` **H-07**）。
4. **判据修正登记为 J-06**（总蓝图 §二 判据台账）：门禁不再是"合并前全绿的文件"，而是
   **"合并前全绿**且**不依赖 P4 删除物的文件"**。

> 📌 **这个坑的"为什么以前没被发现"（规范 §8.1 必填项）**：
> P4 的判据是"46 → 26 个冲突"，它只数**冲突清单里的文件**；而 `settings/index.html` 属于
> **官方静默删除清单**（P3 偏差 3 的 49 项之一），**从不进冲突清单**。
> 于是"宿主被删、子模块变孤儿、测试仍在 import 它们"这三件事**没有任何一道门禁覆盖**
> —— 与本任务其余失效模式（`usageBadgeColor`、旁听断链）**同源**：**删文件类动作不会自动暴露它的依赖者**。

### 被推翻的原计划（必读）

| 原计划 | 实测结论 | 现在的做法 |
|---|---|---|
| P5 = 15 文件 / 22 块，纯"搬运" | 实测 16 / 27，且含**架构适配**（官方换掉了弹窗、标题栏、排版设置三套载体） | 按本文档 16 / 27 执行，逐块给出"追加合并 / 取官方 / 取 ours / 手工移植" |
| 把 `USAGE_BADGE_*` 原样搬回 | 承载文件已删、且全仓库无消费点 | 新建 `src/shared/usage-badge.ts`（T3）+ 新增测试 |
| 保留 `usageBadgeColor` 设置待后续接线 | 官方 UI 已无该控件，保留即死代码 | 删除（T4）+ 记入有意保留台账 |
| i18n 手工合并 | 两语言 3 键完全对称，可脚本判定 | 脚本拼接 + JSON 校验 + 补逗号（事实 4） |

---

## 三、前置条件与停止条件

### 前置条件（逐条给命令 + 期望值；**不满足不得开始**）

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$env:PATH = "D:\data\node24;" + $env:PATH
cd E:\AI_Chating\cyrene-agent
```

| # | 检查项 | 命令 | 期望 |
|---|---|---|---|
| P1 | 合并仍在进行 | `git rev-parse --short MERGE_HEAD` | `b11b8851` |
| P2 | HEAD 未变 | `git rev-parse --short HEAD` | `598dfb75` |
| P3 | 冲突构成 | `git status --porcelain \| Where-Object { $_.Substring(0,2) -eq 'UU' } \| Measure-Object \| Select-Object -Expand Count` | **26** |
| P4 | 无删除类残留 | `git status --porcelain \| Where-Object { $_.Substring(0,2) -match '^(UD\|DU)$' }` | **无输出** |
| P5 | 抢救素材在 | `Test-Path .cyrene-merge-analysis\preserved\bak-chat-appearance.ts` | `True` |
| P6 | 回退网在 | `git rev-parse --short phase3-work-snapshot` / `git rev-parse --short phase0-full` | `586eae90` / `34f0669f` |
| P7 | merge 配置在 | `git config --local --get merge.renormalize` | `true` |
| P8 | **Node 版本** | `node -v` | **`v24.21.0`**（若仍是 22 → PATH 未前置） |
| P9 | **上阶段回写清单无未勾选项** | 见下 | **无输出** |

```powershell
# P9 · 上阶段回写清单无未勾选项（v2.2 硬要求，见规范 §5.1）
Select-String -Path "docs\construction\合并\TASK-合并\PHASE-4-完成报告.md" -Pattern '^\s*-\s*\[ \]|\|\s*\[ \]\s*\|'
# 期望：无输出
```

> ⚠️ **P9 的已知情况**：`PHASE-4-完成报告.md` 是按**旧模板（9 节）**写的，
> **没有**「十、回写清单」这一节。P4 的偏差修正**只存在于报告正文**，
> 因此本蓝图的 §二/§四 已经把 P4 的两条关键修正（偏差 2 的 `USAGE_BADGE` 断链、偏差 4 的悬空 import 方向）
> **内联吸收**。若 P9 无输出即视为通过；若执行者发现 P4 报告里有**本蓝图未覆盖**的 `[ ]`，**立即停止并报告**。

### 停止条件（出现即**立即停止并报告**，不得带着失败进入下一步）

| # | 现象 | 为什么必须停 |
|---|---|---|
| S1 | `MERGE_HEAD` 不存在，或 HEAD ≠ `598dfb75` | 合并状态已被别人改动，本蓝图的全部坐标失效 |
| S2 | `UU` 计数 ≠ 26 | P4 的成果被改动过；继续动手会污染判定 |
| S3 | 某个文件的剩余冲突块**多于**它在 §二 事实 1 表里的原始块数 | 文件被外部修改过；按旧坐标改会改错位置（**注意**：本 Phase 已有部分块被解决过，所以判据是"**不多于**"而不是"等于 27"——实测：开工前 16 文件剩 **14** 块 / 10 个文件已清零） |
| S4 | `phase3-work-snapshot` 或 `phase0-full` 解析不出来 | 回退网断了，**不许在无回退网的情况下改代码** |
| S5 | 工作区出现 `<<<<<<<` 之外的异常标记（如 `\|\|\|\|\|\|\|` diff3 风格） | 说明合并用了别的 merge.conflictStyle，逐块判定口径不同 |
| S6 | 任何步骤后 `git status --porcelain` 的 `??` 数下降 | 有文件被误删（本 Phase **只改既有文件**） |
| S7 | 定向 vitest 出现**新失败**且无法归因到 §六「不算失败」三类 | 属真回归 |
| S8 | 你发现**必须**改 P6 的 10 个文件才能让本 Phase 通过 | 越界——停下来报告，不要替 P6 施工 |
| S9 | A8-A2 里某个"失去被测对象"的测试**死因与事实 9 的预测不符** | 说明还有**第二种**断链没被发现；继续施工会把未知缺陷埋进交付物 |
| S10 | 你产生了"**恢复** P4 删掉的文件（`settings/i18n/**`、`i18n-runtime`、`settings/index.html`）来让测试变绿"的念头 | 与 D2 冲突（旧设置窗口走官方 React 路线），且会把已删文件重新引入仓库；**该念头本身即触发停止**（事实 9 的处置决定 1） |

---

## 四、改动清单（Agent 直接执行）

### 执行总顺序（**顺序敏感，不得调换**）

```
4.0 预检与备份（只读 + 1 份备份）
 └─► 4.1 types.ts（接口先行）
      └─► 4.2 usage-badge.ts（新模块，被 4.4 依赖）
           └─► 4.3 usage-badge.test.ts（新测试）
                └─► 4.4 settings-facade.ts（消费新模块 + 删悬空 import 与死默认值）
                     └─► 4.5 ipc-channels.ts / 4.6 general-settings*.ts（类型与通道）
                          └─► 4.7 modal-state.ts + modal.ts（确认门移植，**最容易出错**）
                               └─► 4.8 settings-store.ts / general/dom.ts / memory/panel.ts（单块）
                                    └─► 4.10 react-root.css / 4.11 ChatPageNavigation.tsx
                                         │   / 4.12 ChatPagePanelHost.tsx / 4.13 ChatPage.tsx（React 顶栏）
                                         ├─► 4.9 i18n ×2（大块拼接，靠脚本）
                                         └─► 4.14 package-lock.json / 4.15 README.md（外围）
                                              └─► 4.16 自检与清理
```

**为什么这个顺序**：① 接口/新模块先改，调用方后改，避免中间态出现"引用还没定义"的反复；
② `modal.ts` 排在 `i18n` 之前，因为前者手工量大、后者靠脚本，先做易错的；
③ `README.md`/`package-lock.json` 放最后，它们是**不参与编译**的文件，不影响前面任何判定。

### 4.0 预检与备份（5 分钟）

```powershell
# ① 记录当前 16 文件的行号映射（写进完成报告，供审计）
$p5 = @('README.md','package-lock.json','src/shared/ipc-channels.ts',
 'src/main/settings/settings-facade.ts','src/main/settings/general-settings.ts',
 'src/main/settings/general-settings-lifecycle.ts','src/main/channels/settings-store.ts',
 'src/renderer/settings/general/dom.ts','src/renderer/settings/shared/types.ts',
 'src/renderer/settings/memory/panel.ts','src/renderer/settings/shared/modal.ts',
 'src/renderer/react/i18n/en.json','src/renderer/react/i18n/zh-CN.json',
 'src/renderer/react/features/chat/components/ChatPageNavigation.tsx',
 'src/renderer/react/features/chat/components/ChatPagePanelHost.tsx',
 'src/renderer/react/features/chat/pages/ChatPage.tsx')
New-Item -ItemType Directory -Force .cyrene-merge-analysis\p5 | Out-Null
foreach ($f in $p5) { git hash-object -- "$f" } | Set-Content -Encoding ASCII .cyrene-merge-analysis\p5\pre-hashes.txt
# 期望：16 行（每个文件一行的 blob 哈希）

# ② 备份 16 个文件到外部（回退用；P8 之前不要删）
$dst = "E:\AI_Chating\cyrene-agent-p5-backup"
New-Item -ItemType Directory -Force $dst | Out-Null
foreach ($f in $p5) {
  $t = Join-Path $dst ($f -replace '[\\/]', '__')
  Copy-Item -LiteralPath $f -Destination $t -Force
}
(Get-ChildItem $dst).Count      # 期望：16
```

> ⚠️ **非 ASCII 文件名的纪律**：本 Phase 的 16 个文件路径**全部是 ASCII**，
> 所以上面的逐文件 `Copy-Item` 是安全的；**不要**把它推广到含中文的文件/目录（会静默丢文件）。

### 4.1 `src/renderer/settings/shared/types.ts`（1 块，`148-154`）

**现状**：ours 侧 4 行（`groupContextLimit` + `chatParaSpacing` 两个字段与注释），theirs 侧空。
**落笔**：**取 ours**，删除 3 行标记，并把块尾补上 `}` 前的结构保持原样。

```
删 148 行（<<<<<<<）
留 149-152（ours 两个字段）
删 153 行（=======）
删 154 行（>>>>>>>）
```

**判定**：文件变为 553 行；`groupContextLimit` 在 `GeneralSettingsUi` 接口里保留。

> ⚠️ **必改且编译器不会提醒你的陷阱**：`chatParaSpacing` 是 ours 独有的**可选**字段，
> 官方没有对应字段。**保留它**（`?` 已标注可选，不会有类型报错），
> 但**不要**顺手给它加默认值 —— 没有消费方（实测 grep `chatParaSpacing` 只在类型/旧窗口出现）。

### 4.2 新建 `src/shared/usage-badge.ts`（T3 · 新文件）

**依据**：`.cyrene-merge-analysis/preserved/bak-chat-appearance.ts`（103 行，P4 抢救）
**只搬这 3 个导出**，其余（`ChatAppearanceSettings` / `chatLineHeight` / `assistantBubbleEnabled` / `normalizeChatAppearance` / `clampFiniteNumber`）**一律不搬**——官方已用 `src/shared/message-typography.ts` 取代那部分概念。

```ts
// 用量徽章外观 —— 与 Chat 排版解耦的独立模块。
//
// 历史：这三项原属 src/shared/chat-appearance.ts；官方已用 message-typography 取代该模块，
// 本文件把「用量徽章」这一项单独留下（承载文件在合并中删除，故重建为独立模块）。
//
// 颜色值语义：`preset:<id>` 或 `#rrggbb`（存字符串）。

/** 默认颜色（与旧 DEFAULT_CHAT_APPEARANCE.usageBadgeColor 保持一致，勿改）。 */
export const DEFAULT_USAGE_BADGE_COLOR = "preset:peach-sunset";

/** 用量徽章的预设渐变（桃-粉-晚霞紫为默认）。 */
export const USAGE_BADGE_PRESETS: ReadonlyArray<{ id: string; label: string; image: string }> = [
  { id: "peach-sunset", label: "桃-粉-晚霞紫（默认）", image: "linear-gradient(90deg, #ffb199 0%, #ff8fb1 45%, #b18cff 100%)" },
  { id: "peach",  label: "蜜桃粉", image: "linear-gradient(90deg, #ffd3a5 0%, #ff9a9e 100%)" },
  { id: "sunset", label: "晚霞紫", image: "linear-gradient(90deg, #ff8fb1 0%, #b18cff 100%)" },
  { id: "mint",   label: "薄荷青", image: "linear-gradient(90deg, #a8edea 0%, #6fd6c4 100%)" },
  { id: "sky",    label: "海盐蓝", image: "linear-gradient(90deg, #a1c4fd 0%, #7aa8ff 100%)" },
];

const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const PRESET_ID = /^preset:[a-z0-9-]{1,32}$/;

/** 归一化用量徽章颜色：只接受预设 id 或 #hex，其余回退默认。 */
export function normalizeUsageBadgeColor(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_USAGE_BADGE_COLOR;
  const trimmed = value.trim();
  if (!trimmed) return DEFAULT_USAGE_BADGE_COLOR;
  if (PRESET_ID.test(trimmed)) return trimmed;
  if (HEX_COLOR.test(trimmed)) return trimmed.toLowerCase();
  return DEFAULT_USAGE_BADGE_COLOR;
}

/**
 * 颜色值 → 可直接用于 `background-image` 的 CSS（配合 background-clip: text 做渐变字）。
 * 自定义纯色时退化为同色双停靠渐变，保证与预设走同一条渲染路径。
 */
export function resolveUsageBadgeImage(color: string): string {
  const normalized = normalizeUsageBadgeColor(color);
  if (normalized.startsWith("preset:")) {
    const preset = USAGE_BADGE_PRESETS.find((item) => `preset:${item.id}` === normalized);
    return preset?.image ?? USAGE_BADGE_PRESETS[0].image;
  }
  return `linear-gradient(90deg, ${normalized} 0%, ${normalized} 100%)`;
}
```

> 📌 **命名变更（有意）**：旧导出名是 `DEFAULT_CHAT_APPEARANCE.usageBadgeColor`（对象属性），
> 新模块导出的是**扁平常量** `DEFAULT_USAGE_BADGE_COLOR`。这样任何"忘了改的地方"会**编译报错**而不是静默取到旧值。
>
> 📌 **`resolveUsageBadgeImage` 当前无生产消费方（有意保留）**：它是纯函数（输入 → CSS 字符串），
> 在旧的设置窗口里负责把颜色写到 `--cy-usage-badge-image`。该窗口已被 D2 淘汰，
> **本 Phase 不为它新接一条链路**（那属于新功能，见 §一 非目标）。
> 保留它的理由：① 它是"预设 ↔ CSS"的唯一映射表，删了以后重建颜色能力要重新推导；
> ② 它被 §4.3 的新测试覆盖，**不是无主代码**。**不要**因为"没有调用方"就删掉它。

### 4.3 新建 `src/shared/usage-badge.test.ts`（T3 · 新测试）

旧测试 `src/shared/chat-appearance.test.ts` **已随文件被删**，因此本 Phase 必须补一条，否则新模块**没有门禁**。

```ts
import { describe, expect, it } from "vitest";
import {
  DEFAULT_USAGE_BADGE_COLOR,
  USAGE_BADGE_PRESETS,
  normalizeUsageBadgeColor,
  resolveUsageBadgeImage,
} from "./usage-badge";

describe("usage-badge 归一化", () => {
  it("默认值保持不变（1.x 的存量配置要能读回）", () => {
    expect(DEFAULT_USAGE_BADGE_COLOR).toBe("preset:peach-sunset");
  });

  it("接受预设 id 与 #hex，其余回退默认", () => {
    expect(normalizeUsageBadgeColor("preset:mint")).toBe("preset:mint");
    expect(normalizeUsageBadgeColor("#AABBCC")).toBe("#aabbcc");
    expect(normalizeUsageBadgeColor("#abc")).toBe("#abc");
    expect(normalizeUsageBadgeColor("javascript:alert(1)")).toBe(DEFAULT_USAGE_BADGE_COLOR);
    expect(normalizeUsageBadgeColor("preset:mint;background:url(x)")).toBe(DEFAULT_USAGE_BADGE_COLOR);
    expect(normalizeUsageBadgeColor("")).toBe(DEFAULT_USAGE_BADGE_COLOR);
    expect(normalizeUsageBadgeColor(undefined)).toBe(DEFAULT_USAGE_BADGE_COLOR);
    expect(normalizeUsageBadgeColor(42)).toBe(DEFAULT_USAGE_BADGE_COLOR);
  });

  it("resolveUsageBadgeImage：预设命中渐变、未知预设回退首个、纯色退化为双停靠", () => {
    expect(resolveUsageBadgeImage("preset:sky")).toBe(USAGE_BADGE_PRESETS.find((p) => p.id === "sky")!.image);
    expect(resolveUsageBadgeImage("#ff0000")).toBe("linear-gradient(90deg, #ff0000 0%, #ff0000 100%)");
    expect(resolveUsageBadgeImage("")).toBe(USAGE_BADGE_PRESETS[0].image);
  });
});
```

> ⚠️ **不要**把断言写成"命中数 ≥ 1"这类启发式判据；上面每条都是**等值断言**（充分判据）。

### 4.4 `src/main/settings/settings-facade.ts`（1 块，`16-20` + 块外 1 行）

**改 3 处**（**只改这 3 处，不要动别的**）：

| # | 位置 | 动作 | 为什么 |
|---|---|---|---|
| ① | `16-20`（冲突块） | **删掉 5 行标记与内容**（ours 的两行 `chat-appearance` import + 3 行标记），让 `:21` 的 `import {` 直接接 `:15` 的 `normalizeUiIcon` 行 | `chat-appearance.ts` 已被 P4 删除，这两个 import **必然** `TS2307` |
| ② | `:56`（**在冲突块之外**） | `usageBadgeColor: DEFAULT_CHAT_APPEARANCE.usageBadgeColor,` → **整行删除** | 悬空标识符；且该字段在 `GeneralSettings` 里**不存在**（见 4.6），保留会 `TS2353`；同时它是本 Phase 要清掉的死设置（事实 5） |
| ③ | `:8`（已有行，**不动**） | 确认仍是 `import { DEFAULT_MESSAGE_TYPOGRAPHY, normalizeMessageTypography } from "../../shared/message-typography";` | 官方侧已在 `:69` / `:248` 使用它，**不要**重复引入 |

**必改且编译器不会提醒你的陷阱**：`:56` 在冲突块之外，**冲突扫描器不会把它标出来**。
改完必须跑下面的交叉验证（该命令同时覆盖"有没有别的地方继续引用 chat-appearance"）：

```powershell
# 交叉验证（期望：全部 0 命中）
Select-String -Path "src\**\*.ts","src\**\*.tsx" -Pattern 'chat-appearance|DEFAULT_CHAT_APPEARANCE|normalizeChatAppearance' -Encoding UTF8
```

### 4.5 `src/shared/ipc-channels.ts`（1 块，`133-139`）

**落笔**：**追加合并 − 1 行**。

```
删 133 行（<<<<<<<）
留 134-135（CHAT_SESSION_USAGE_GET / CHAT_SESSION_USAGE_CHANGED —— 有真实接线：main 侧 window-system-ipc.ts:97 与 preload:879）
删 136（CHAT_TYPOGRAPHY_CHANGED —— 全仓库 0 引用，见下）
删 138-139（======= / >>>>>>>）
```

> 🔴 **`CHAT_TYPOGRAPHY_CHANGED` 必须删**：实测它的**唯一**使用点是
> `src/main/settings/general-settings-lifecycle.ts:170`（ours 侧），而那一块在 4.6 被官方侧取代。
> 官方用 `IPC.UI_FONT_CHANGED` + `message-typography` 承担同职责。
> 保留一个永不发出的通道常量的代价是：后续有人 grep 到它，以为排版变更还在广播。

**保留后自检**（期望：3 个通道各自在本文件命中 1 次）：

```powershell
Select-String -LiteralPath src\shared\ipc-channels.ts -Pattern 'CHAT_SESSION_USAGE_GET|CHAT_SESSION_USAGE_CHANGED|CHAT_TYPOGRAPHY_CHANGED' -Encoding UTF8
# 期望：前两条命中；CHAT_TYPOGRAPHY_CHANGED 无命中
```

### 4.6 三个"设置模型/生命周期"文件

#### 4.6.1 `src/main/settings/general-settings.ts`（1 块，`185-208`）

**落笔**：**追加合并 + 补回结构**。两侧都必须保留：

| 侧 | 内容 | 为什么不能丢 |
|---|---|---|
| ours（`186-202`） | `groupContextLimit: number` + 三条常量 + `normalizeGroupContextLimit()` | 官方树**没有** `groupContextLimit`（实测 `git show MERGE_HEAD:...` 该文件 0 命中）；丢了等于删掉一项受保护功能（基线 11 → 唯一丢失点在已删的 settings.ts，真实接线在 `memory/panel.ts` 19 处） |
| theirs（`204-207`） | `recentProjects: string[]` + `disclaimerAcceptedVersion?: string` | 官方新增字段，`general-settings-lifecycle.ts:36-38` 直接读 `disclaimerAcceptedVersion`，丢了必编译失败 |

**正确落笔（逐行）**：

```
185: <<<<<<<   → 删除
186-202:       → 保留（ours 的字段与 normalize 函数体）
203: =======   → 删除
204-207:       → 保留（官方的 recentProjects / disclaimerAcceptedVersion）
208: >>>>>>>   → 删除
209: }         → 保留（接口闭合）
```

> ⚠️ **陷阱（编译器会提醒，但错误信息不直观）**：ours 侧末行（`:202`）是
> `return Math.min(...);`，theirs 侧开头是注释 + 字段声明 —— 拼接后**必须**保证
> `normalizeGroupContextLimit` 函数体正常闭合（`}` 在 `:203` 之后原本属于 ours，
> **不要**把官方的字段声明塞进函数体里）。改完**立刻**用 `npx tsc -p tsconfig.main.json` 看这一段。

> 🔴 **P5 实测补正（照上面"逐行"清单做会编译失败）**：ours 段的 `:191` **自带一个 `}`**，
> 它已经把 `GeneralSettings` **接口关闭**了；而 theirs 段（`:204-207`）是**两个接口字段**
> （`recentProjects` / `disclaimerAcceptedVersion`）。按字面「留 186-202 + 留 204-207 + 留 209 `}`」拼接，
> 会得到：① 两个字段落在接口**外面**；② `normalizeGroupContextLimit` 的函数体被劈开（`return` 之后接字段，缺 `}`）；
> ③ 重复的 `}`。
> **正确落笔**：**删掉 ours 段那个过早的 `}`**，让官方两个字段并入接口，由块后的 `}`（原 `:209`）**统一关闭接口**，
> 随后才是 3 个常量与 `normalizeGroupContextLimit` 函数。P5 已按此实施，判定为 7 行命中、该文件 `tsc` 0 错误。

#### 4.6.2 `src/main/settings/general-settings-lifecycle.ts`（1 块，`166-173`）

**落笔**：**取官方（删除 ours 的 8 行）**。

```
166: <<<<<<<   → 删除
167-171:       → 删除（normalizeChatAppearance ×2 + broadcastToAllWindows(IPC.CHAT_TYPOGRAPHY_CHANGED, ...)）
172: =======   → 删除
173: >>>>>>>   → 删除
```

**为什么取官方**：
1. `normalizeChatAppearance` 来自已删的 `chat-appearance.ts` → 编译失败；
2. `broadcastToAllWindows` 在此文件里**既不是 import 也不是依赖项**（依赖接口 `:21` 只有 `broadcastToAuxWindows`）→ 第二处编译失败；
3. 官方已用 `:163-165` 的 `UI_FONT_CHANGED` 广播承担排版变更通知。

**保留后自检**（期望：3 条 `broadcast`，全部 `deps.windowManager?.broadcast`）：

```powershell
Select-String -LiteralPath src\main\settings\general-settings-lifecycle.ts -Pattern 'broadcast' -Encoding UTF8
```

#### 4.6.3 `src/main/channels/settings-store.ts`（1 块，`24-30`）

**落笔**：**追加合并（纯追加）**。

```
24: <<<<<<<   → 删除
25-27:         → 保留（ours 的 tool-access / keyword-policy / audit-log 三个 import）
28: =======   → 删除
29:            → 保留（官方的 `import { normalizeQqListenMode, type QqListenMode } from "../../shared/qq-listen";`）
30: >>>>>>>   → 删除
```

**判定依据（已实测，非推断）**：这三个模块**真实存在**且被本文件其余部分消费：

```powershell
Test-Path src\main\channels\tool-access.ts, src\main\channels\keyword-policy.ts, src\main\channels\audit-log.ts
# 期望：三个 True
```

> 参考：官方侧（`git show :3:` 该段）只有 `qq-listen` 一行 —— 官方把本地这三个模块**整块**换成了自己的实现，
> 因此本块是**双方都要**，不是"二选一"。

### 4.7 弹窗确认门移植（**本 Phase 最易出错的一步**）

#### 4.7.1 先改类型 `src/renderer/settings/shared/modal-state.ts`

在 `InputModalOptions` 里**追加一个可选字段**（该文件**没有冲突**，是本 Phase 的主动改动）：

```ts
export interface InputModalOptions {
  title: string;
  message: string;
  placeholder?: string;
  defaultValue?: string;
  icon?: string;
  confirmText?: string;
  cancelText?: string;
  /**
   * 确认门控：传入后，输入框内容必须**严格等于**该值，确认按钮才可点。
   * 用于「删除全部记忆」这类不可撤销操作（防误触，不只靠"点两下"）。
   */
  confirmValue?: string;
}
```

> **为什么放这里而不是 `modal.ts`**：官方的队列按 `kind` 分发，`options` 走的是
> `BlockingDialogRequest` 里的 `InputModalOptions` 类型；定义在 `modal-state.ts` 才能让
> `enqueueBlockingDialog` 与 `renderInputDialog` **共用同一份类型**。

#### 4.7.2 `src/renderer/settings/shared/modal.ts`（5 块，逐块落笔）

| 块 | 行区间 | 落笔 | 理由 |
|---|---|---|---|
| **①** | `322-365` | **取 ours**（删 3 行标记，保留 ours 的 `showModal` 实体函数），并把官方那段 `showConfirm` 包装**丢弃** | ours 的 `showModal` 是**自闭合**实现（自带 `_initModalOverlay` + cleanup）；官方的包装会走 `showConfirm` → 需要 `tone` 等参数，行为对旧调用方不等价。活调用方 3 处 + 测试 4 处（事实 6），**不能改行为** |
| **②** | `407-428` | **手工拼接**：ours 的 `_initHtmlModalOverlay();` 与 theirs 的 `const overlay = modalState.cyHtmlOverlay;` + 空值守卫 + `const options = request.options;` + 四个 `querySelector` 全部保留；**图标那行取 theirs** | 这一块是"同一个函数被两边各改了一半"：ours 少了 `request.options` 解引用（否则 `options` 未定义），theirs 少了 ours 的 `applyModalIcon`。**最终形态**：`_initHtmlModalOverlay()` → `const overlay = ...` → 空值 `console.error` + `finishBlockingDialog` 早退 → `const options = request.options;` → 4 个 `querySelector` → `const dialog = overlay.querySelector(".cy-modal") as HTMLElement;` → `iconEl.innerHTML = options.icon \|\| "📌";` |
| **③** | `464-468` | **取 theirs** | 官方输入框图标改为**内联 SVG**（`INPUT_ICON_SVG`）；配套测试 `shared/modal-icon.test.ts:93` 断言"传 SVG 渲染成图标"。ours 的 `DEFAULT_INPUT_MODAL_ICON` **仍需保留导出**（该测试 `:14` 直接 import 它） |
| **④** | `483-539` | **取 theirs**（`.cy-input-icon` 的两行图标判定 + `renderInputDialog` 的签名与守卫） | 这是官方新队列的入口；ours 的旧 `showInputModal` 函数体会在 ⑤ 之后被官方版替代 |
| **⑤** | `546-602` | **取 theirs 为骨架 + 移植 ours 的门控逻辑**（见下） | 官方骨架含队列推进 / 焦点管理 / 幂等，**丢了会让整个阻塞弹窗系统失效**；ours 的 `confirmValue` 是受保护功能，**必须移植** |

**⑤ 的逐行写法（最终形态，照抄）**：

```ts
  // 确认门控（未传 confirmValue 时恒可点）—— 由本分支移植进官方阻塞队列
  const syncConfirmState = (): void => {
    confirmBtn.disabled = options.confirmValue !== undefined && inputEl.value !== options.confirmValue;
  };
  inputEl.addEventListener("input", syncConfirmState);
  syncConfirmState();
  overlay.classList.remove("is-hidden");

  let settled = false;
  let releaseFocus: (() => void) | null = null;
  const settle = (result: string | null) => {
    if (settled) return;
    settled = true;
    releaseFocus?.();
    cancelBtn.removeEventListener("click", onCancel);
    confirmBtn.removeEventListener("click", onConfirm);
    inputEl.removeEventListener("keydown", onKey);
    inputEl.removeEventListener("input", syncConfirmState);   // ← 移植新增：解绑门控
    confirmBtn.disabled = false;                             // ← 移植新增：复位，避免影响下一次弹窗
    overlay.classList.add("is-hidden");
    finishBlockingDialog(request, () => request.resolve(result));
  };
  const onCancel = () => settle(null);
  const onConfirm = () => settle(inputEl.value);
  const onKey = (e: KeyboardEvent) => {
    // 门控未满足时回车不生效，与按钮 disabled 保持一致（← 移植新增的判断）
    if (e.key === "Enter") { e.preventDefault(); if (!confirmBtn.disabled) onConfirm(); }
  };
  activeCancel = onCancel;
  cancelBtn.addEventListener("click", onCancel);
  confirmBtn.addEventListener("click", onConfirm);
  inputEl.addEventListener("keydown", onKey);
  // 输入框立即聚焦；Esc 取消、Tab 循环、关闭后焦点恢复
  releaseFocus = activateDialogFocus(dialog, inputEl, onCancel);
```

> 🔴 **三处"少了会静默坏"的地方，必须逐一核对**：
> 1. `inputEl.addEventListener("input", syncConfirmState)` **与** `settle()` 里的 `removeEventListener` —— 只加不解绑，
>    连续弹两次输入框会叠加监听器（官方注释 `:510` 明确写过这个坑）。
> 2. `confirmBtn.disabled = false;` 必须在 `settle()` 里复位 —— 否则**下一次**输入弹窗打开时按钮还是灰的，
>    表现为"新建区块改不了名"，而且**没有任何报错**。
> 3. `onKey` 里的 `if (!confirmBtn.disabled)` —— 少了它，门控对**回车**无效（按钮灰着但回车能提交）。

**改完立刻跑（这一步的门禁）**：

```powershell
$env:PATH = "D:\data\node24;" + $env:PATH
npx vitest run src/renderer/settings/shared/modal.test.ts src/renderer/settings/shared/modal-icon.test.ts src/renderer/settings/memory/delete-all.test.ts src/renderer/settings/mcp/modal-interaction.test.ts
# 期望：全部通过；delete-all.test.ts 的 3 条 confirmValue 用例必须绿
```

### 4.8 三个"单块小文件"

| 文件 | 块 | 落笔 | 说明 |
|---|---|---|---|
| `src/renderer/settings/general/dom.ts` | `25-28` | **取 ours**（保留那行中文注释）：`// 「清空聊天记录」按钮已随通用设置的聊天记录管理行一起移除（记忆面板提供「删除全部记忆」）` | 它记录的是**本分支的产品决定**；theirs 侧为空（官方没有这个历史包袱）。删掉注释会让后续 agent 以为这里少了个按钮 |
| `src/renderer/settings/memory/panel.ts` | `19-23` | **追加合并（两行 import 都要）** | ours 的 `import { t } from "../i18n";` 被 `:133`/`:136` 使用（`t("settings.panel.memory.groupContext.saved")`）；theirs 的 `import { showNotice } from "../shared/modal";` 被 `:211`/`:260` 使用。**任一丢失都会编译失败** |
| `src/renderer/settings/shared/types.ts` | 见 4.1 | — | 已在 4.1 处理（放在最先做，因为其它文件可能引用这些类型） |

**判定命令**（期望：两行 import 都在，且都各被用 ≥1 次）：

```powershell
Select-String -LiteralPath src\renderer\settings\memory\panel.ts -Pattern 'from "\.\./i18n"|from "\.\./shared/modal"|t\("settings\.panel\.memory\.groupContext|showNotice\(' -Encoding UTF8
# 期望：≥6 行命中（2 个 import + 至少 4 个使用点）
```

### 4.9 两个 i18n 文件（同法，逐文件执行）

**结论先行**：两个文件都是 **1 块，区间 `13-166`**，块内 ours = `14-151`（138 行）、theirs = `153-165`（13 行）。
**唯一正确的做法**：删掉三行标记，把两段**按 ours 在前、theirs 在后**拼接，**并在 ours 末行后补一个逗号**（事实 4）。

```powershell
$env:PATH = "D:\data\node24;" + $env:PATH
foreach ($lang in @('en','zh-CN')) {
  $path = "src/renderer/react/i18n/$lang.json"
  $lines = [System.IO.File]::ReadAllLines((Resolve-Path -LiteralPath $path))

  # ① 定位标记（不写死行号，避免漂移）
  $si = -1; $mi = -1; $ei = -1
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($si -lt 0 -and $lines[$i] -match '^<{7} ') { $si = $i }
    if ($mi -lt 0 -and $lines[$i] -match '^={7}$')  { $mi = $i }
    if ($ei -lt 0 -and $lines[$i] -match '^>{7} ')  { $ei = $i }
  }
  "== $lang : si=$si mi=$mi ei=$ei （0 基）"
  if ($si -lt 0 -or $mi -lt 0 -or $ei -lt 0) { throw "$lang 未找到三行标记，停止" }

  # ② 三段切片
  $head   = $lines[0..($si - 1)]
  $ours   = $lines[($si + 1)..($mi - 1)]
  $theirs = $lines[($mi + 1)..($ei - 1)]
  $tail   = $lines[($ei + 1)..($lines.Count - 1)]

  # ③ ours 末行补逗号（关键！否则非法 JSON）
  $ours[$ours.Count - 1] = $ours[$ours.Count - 1] + ","

  # ④ 重组 + 写回（**必须用 .NET 无 BOM 写入**，见下方陷阱）
  $merged = @($head) + @($ours) + @($theirs) + @($tail)
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllLines((Resolve-Path -LiteralPath $path), $merged, $utf8NoBom)
  "== $lang : 写回 $($merged.Count) 行（原 $($lines.Count) 行 - 3 行标记）"
}
```

> 🔴 **两个必须照做的陷阱规避**：
> 1. **不要用 `Set-Content -Encoding UTF8`**：本机 PS 5.1 会写 **BOM**，`JSON.parse` 会失败，
>    且渲染进程 i18n 加载器可能把 BOM 当内容。**必须** `[System.IO.File]::WriteAllLines($p, $arr, (New-Object System.Text.UTF8Encoding($false)))`。
> 2. **不要手工 `edit` 这 138 行**：拼接是机械动作，手改必出错行；用上面的脚本。
> 3. 行尾保持文件原样（`ReadAllLines` + `WriteAllLines` 会统一为 CRLF）—— 本仓库口径是 `autocrlf=true`，CRLF 是正常落盘形态（与 `git diff` 口径一致，不会产生额外差异）。

**立刻验证（期望 46 键 / 两语言键集合完全相同）**：

```powershell
$env:PATH = "D:\data\node24;" + $env:PATH
node -e "
const fs=require('fs');
const en=JSON.parse(fs.readFileSync('src/renderer/react/i18n/en.json','utf8'));
const zh=JSON.parse(fs.readFileSync('src/renderer/react/i18n/zh-CN.json','utf8'));
const ke=Object.keys(en), kz=Object.keys(zh);
console.log('en keys =',ke.length,' zh keys =',kz.length);
console.log('both 46 :', ke.length===46 && kz.length===46);
console.log('key set equal :', JSON.stringify(ke)===JSON.stringify(kz));
"
# 期望：en keys = 46  zh keys = 46 / both 46 : true / key set equal : true
```

### 4.10 `src/renderer/react/styles/react-root.css`（1 块，`130-146`）

**落笔**：**追加合并（两侧保留）**。

```
130: <<<<<<<  → 删除
131-134:      → 保留（ours：display:flex / align-items / gap:10px / max-width）
135:          → 保留（ours 的空行 + 注释）
137-141:      → 保留（ours 的 `.cy-page-usage` 规则开头：display:flex / align-items / min-width:0）
142: =======  → 删除
143-145:      → 保留（theirs：z-index:51 / app-region:no-drag / -webkit-app-region:no-drag）
146: >>>>>>>  → 删除
```

**为什么必须这样留（不是审美问题，是门禁问题）**：`src/renderer/react/features/chat/components/panel-layout.test.ts` **已经存在**并锁死三条不变量：

| 测试断言（`panel-layout.test.ts`） | 本块必须满足 |
|---|---|
| `:67` `expect(reactRootCss).not.toContain(".cy-page-windows")` | **本文件里不许出现 `.cy-page-windows` 规则** |
| `:68-70` `.cy-page-usage` 规则不得含 `position: absolute`、不得含 `right:` | ours 的 `.cy-page-usage` 写法（flex）**必须留下** |
| `:73-79` `.cy-page-top-right` 必须含 `display:flex` / `right:20px` / `gap:` / `max-width:` | ours 的四条属性**必须留下** |

> ⚠️ **官方侧 `.cy-page-windows` 是"另一个绝对定位容器"**（官方 `react-root.css:122-129`），
> 与本分支"徽章与窗口控件同属一个 flex 组"的修复**直接冲突**。
> 这就是为什么 4.11 的顶栏结构要取 ours 的 `.cy-page-top-right` 分组。

> 🔴 **P5 实测补正（照上面逐行清单执行会产出非法 CSS）**：上面说的 `135` 是 **`}`**（关闭 `.cy-page-top-right`），
> 而 `137-141` 是 `/* 注释 */` + `.cy-page-usage {` + 3 条属性 —— **`.cy-page-usage` 的闭合 `}` 在冲突块之外（原 `:147`）**。
> 若照字面"删 130 / 留 131-141 / 删 142 / 留 143-145 / 删 146"，`z-index` 与 `app-region` 会掉进 `.cy-page-usage` 规则体。
> **实测佐证**：官方侧 `react-root.css` **完全没有 `.cy-page-usage` 规则**（`^\.cy-page-usage` 命中 0）→ `137-141` 是纯 ours 内容。
> **正确落笔**：`.cy-page-top-right` 保留 ours 的 4 条布局属性 **+** theirs 的 `z-index:51` / `app-region` ×2；
> 然后**另起** `.cy-page-usage { display:flex; align-items:center; min-width:0; }`。P5 已按此实施，4 条不变量测试全绿。

### 4.11 `src/renderer/react/features/chat/components/ChatPageNavigation.tsx`（3 块）

| 块 | 行区间 | 落笔 |
|---|---|---|
| **①** | `12-17` | **追加合并**：保留 ours 的 3 行（`SkillModeButton` / `ToolConsoleButton` / `ToolModeButton`） |
| **②** | `23-32` | **追加合并 + 联合类型**（见下） |
| **③** | `115-157` | **取 ours 的顶栏主体，但保留官方的 header 语义与官方新增项**（见下） |

**② 的正确写法**（两侧都保留，`ChatPagePanel` 取**联合**）：

```ts
import { UsageBadge } from "./UsageBadge";
import { SidebarSearchDialog } from "./SidebarSearchDialog";
import { reportChatPerfRender } from "./chat-perf-probe";

export type ChatPagePanel = "tool" | "skill" | "model" | "plugin" | "moments" | "console" | "scheduledTasks";
```

> ⚠️ **`ChatPagePanel` 的联合类型是必改且编译器不会提醒你的陷阱**：
> 少了 `scheduledTasks`，`ChatPagePanelHost` 的 `case "scheduledTasks"` 会 `TS2678`；
> 少了 `tool|skill|model|plugin|console`，`ChatPagePanelHost` 与本文件的按钮回调会 `TS2367`。
> 两边各自"恰好自洽"，只有**联合**才同时满足两侧。

**③ 的最终结构（照此落笔；`cy-page-titlebar` / `cy-page-toggle` / `cy-page-top-center` 属官方新结构，必须保留）**：

```tsx
      <header className="cy-page-titlebar">
        <div className="cy-page-toggle">
          <SidebarToggle collapsed={collapsed} onToggle={onToggleCollapsed} />
          <CharacterInfoPopover />
        </div>
        <div className="cy-page-top-center">
          {!hasOpenPanel && <ModeSwitch value={mode} onChange={onModeChange} />}
        </div>
        {/* 右上角：用量徽章与窗口控件同属一个 flex 组，永远并排不重叠（本分支修复，面板布局测试锁死） */}
        <div className="cy-page-top-right">
          <UsageBadge sessionId={activeSessionId} />
          <WindowControls onMinimize={onMinimize} onMaximize={onMaximize} onClose={onCloseWindow} />
        </div>
        <div className="cy-page-sidebar">
          <div className="cy-page-newtask">
            <NewTaskButton onClick={onNewTask} />
            <ToolModeButton active={activePanel === "tool"} onClick={() => onTogglePanel("tool")} />
            <SkillModeButton active={activePanel === "skill"} onClick={() => onTogglePanel("skill")} />
            <ModelModeButton active={activePanel === "model"} onClick={() => onTogglePanel("model")} />
            <PluginModeButton active={activePanel === "plugin"} onClick={() => onTogglePanel("plugin")} />
            <ToolConsoleButton active={activePanel === "console"} onClick={() => onTogglePanel("console")} />
            <button className="cy-side-action cy-side-action--search" onClick={() => setSearchOpen(true)} type="button">
              <span className="cy-side-action-icon"><Search size={18} strokeWidth={1.8} /></span>
              <span className="cy-side-action-label">{t("sidebar.searchAction")}</span>
              <kbd>Ctrl+K</kbd>
            </button>
            <ScheduledTasksModeButton active={activePanel === "scheduledTasks"} onClick={() => onTogglePanel("scheduledTasks")} />
            <MomentsModeButton active={activePanel === "moments"} onClick={() => onTogglePanel("moments")} />
          </div>
```

> 🔴 **三条不许动的东西**：
> 1. `<UsageBadge>` 必须在 `<WindowControls>` **之前**、且两者同在 `.cy-page-top-right` 内（`panel-layout.test.ts:58-63` 用**源码字符串顺序**断言）；
> 2. `SidebarToggle` 的 `collapsed` 属性（ours）不能丢 —— 官方那行没有它；
> 3. 块结束（原 `:157` 的 `>>>>>>>`）之后**保留** `MomentsModeButton` 与 `</div>` 的原有行 —— 本块只到 `ScheduledTasksModeButton` 为止，**不要**重复插入 `MomentsModeButton`。

### 4.12 `src/renderer/react/features/chat/components/ChatPagePanelHost.tsx`（2 块，共 34 行）

**落笔**：两处都是**追加合并（联合）**。

```tsx
import type { ChatPagePanel } from "./ChatPageNavigation";
import { ModelModePanel } from "./ModelModePanel";
import { PluginModePanel } from "./PluginModePanel";
import { SkillModePanel } from "./SkillModePanel";
import { ToolConsolePanel } from "./ToolConsolePanel";
import { ToolModePanel } from "./ToolModePanel";
import { MomentsPanel } from "../../moments/MomentsPanel";
import { ScheduledTasksPanel } from "../../scheduler/ScheduledTasksPanel";

// …（函数签名不动）…
  switch (panel) {
    case "model": return <ModelModePanel />;
    case "plugin": return <PluginModePanel />;
    case "skill": return <SkillModePanel />;
    case "tool": return <ToolModePanel />;
    case "console": return <ToolConsolePanel />;
    case "moments": return <MomentsPanel />;
    case "scheduledTasks": return <ScheduledTasksPanel onPickWorkspace={onPickWorkspace} onOpenSession={onOpenSession} />;
  }
```

> ⚠️ **`switch` 必须是穷尽的**：`ChatPagePanel` 联合还剩 `"tool"` 之外的成员时，
> 若某个 `case` 缺失，TS 会在**返回类型**上报错（函数声明返回 `JSX.Element`）；
> 官方那 5 个五模块（`ModelModePanel` 等）文件是否**存在**必须核对（下面的判定命令会替你查）。

**判定命令**（期望：8 个 import 目标文件全部存在）：

```powershell
$env:PATH = "D:\data\node24;" + $env:PATH
$dir = "src/renderer/react/features/chat/components"
foreach ($n in @('ModelModePanel','PluginModePanel','SkillModePanel','ToolConsolePanel','ToolModePanel','UsageBadge','SidebarSearchDialog')) {
  "{0,-22} {1}" -f $n, (Test-Path "$dir\$n.tsx")
}
"{0,-22} {1}" -f 'MomentsPanel', (Test-Path "src/renderer/react/features/moments/MomentsPanel.tsx")
"{0,-22} {1}" -f 'ScheduledTasksPanel', (Test-Path "src/renderer/react/features/scheduler/ScheduledTasksPanel.tsx")
```

### 4.13 `src/renderer/react/features/chat/pages/ChatPage.tsx`（1 块，`67-71`）

**落笔**（依事实 3）：

```
67: <<<<<<<   → 删除
68: =======   → 删除
69:            → 删除（useChannelMirrorEvents —— 该文件已被 P4 按 D1 删除）
70:            → 保留但**改路径**：
                import { useFeedback } from "../../../components/feedback/FeedbackProvider";
              → import { useFeedback } from "../../../react/components/feedback/FeedbackProvider";
71: >>>>>>>   → 删除
```

**为什么路径这么改**：本文件位于 `src/renderer/react/features/chat/pages/`，
`../../../` = `src/renderer/`；官方文件实际在 `src/renderer/react/components/feedback/FeedbackProvider.tsx`，
所以需要 `../../../react/components/feedback/FeedbackProvider`。

**判定命令**（期望：新路径 `True`、旧路径 `False`、`useChannelMirrorEvents` 0 命中）：

```powershell
Test-Path src\renderer\react\components\feedback\FeedbackProvider.tsx   # True
Test-Path src\renderer\components\feedback\FeedbackProvider.tsx         # False
Select-String -LiteralPath src\renderer\react\features\chat\pages\ChatPage.tsx -Pattern 'useChannelMirrorEvents' -Encoding UTF8   # 无输出
```

### 4.14 `package-lock.json`（1 块，`3044-3404`）

**落笔**：**整块取官方侧（`:3:`）**，即删除三个标记行并保留 `3044` 与 `3404` 之间的 theirs 段。

```powershell
# 用索引第 3 阶段（theirs = 官方在我们的合并基上算出的结果）整块覆盖该文件
git checkout --theirs -- package-lock.json
git add package-lock.json
```

> **为什么这是正确的**（实测，非推断）：本块中 **theirs 侧本身就是"双方合并结果"** ——
> 它含 `@lobehub/emojilib` 等官方新增包，也含 ours 的 `@llamaindex/workflow/node_modules/rxjs` 之外的部分；
> 而 ours 侧只是一个**孤立的 rxjs 条目片段**。手工合并这段 JSON 既无收益又极易错。
> **P8 会在 `npm ci` 之后用 `npm install --package-lock-only` 重建锁文件，届时权威性由 `package.json` 决定。**

**判定命令**（期望：0 个标记、JSON 可解析、`lockfileVersion` 存在）：

```powershell
$env:PATH = "D:\data\node24;" + $env:PATH
node -e "const j=require('./package-lock.json'); console.log('lockfileVersion =', j.lockfileVersion); console.log('packages =', Object.keys(j.packages||{}).length);"
Select-String -LiteralPath package-lock.json -Pattern '^(<{7}|={7}|>{7}) ' -Encoding UTF8   # 无输出
```

### 4.15 `README.md`（5 块，**结构重组，不是逐块二选一**）

**总原则（依 D5 与总蓝图 §二 判据 7）**：README 的**主体必须是官方的**（用户/访客要看到项目全貌与上游文档），
**本分支的身份声明与差异说明挂在官方结构上**，全部集中在文首。

| 块 | 行区间 | 落笔 |
|---|---|---|
| ① | `14-32` | **两侧都要**：先落 ours 的 fork 声明（`> ## 🚩 这是个人分支（fork），不是原项目` 那 9 行），紧跟 theirs 的项目简介（空行 + `**Cyrene-Agent 是一个以…**` 那 7 行）。**ours 在前**，因为"这不是官方仓库"必须第一眼看到 |
| ② | `66-98` | **取官方侧**，但把 ours 的 8 行差异总览表**搬成 `## 2.2 本分支相对上游的差异（1.2.2-PLUS）` 一节插入其后**。⚠️ **必须重编号**：官方已经用了 `## 2.1`，若照抄 ours 的 `## 2.1 差异总览` 会出现**两个 2.1** |
| ③ | `350-382` | **取官方侧**（克隆/安装/BGE-M3/音乐/构建那 30 行的开头部分），ours 侧为空 |
| ④ | `398-478` | **取官方侧**（77 行：`cyrene` CLI、BGE-M3、音乐、构建等），并**在同一位置保留 ours 的那 1 行 D5 警告**：`> ⚠️ 升级上游时请注意批次 A、B 都带数据破坏性迁移（记忆清空、白名单清空），合并后首次启动前先备份 %APPDATA%\live2d-cyrene。` |
| ⑤ | `484-997` | **取官方侧 508 行**（功能清单 / 技术栈 / 项目结构 / 免责声明 / 许可证 / 致谢 / 贡献者表），并在末尾**追加 ours 的 3 行许可与致谢**（MIT 说明 + MODEL_LICENSE 提示 + 给上游点 Star 的邀请） |

**D5 的落地物（本块的验收目标）**：README 里必须能搜到三件事 ——
① "这是个人分支/fork"的声明；② "不承诺跟进上游版本 / 不代表上游立场"；
③ "旧版本兼容默认放弃 + 升级前备份 `%APPDATA%\live2d-cyrene`"的警告。

> ⚠️ **陷阱**：块的原始行区间会因你自己的编辑而**整体失效**。**倒序施工**（先改 ⑤，再 ④、③、②，最后 ①），
> 这样前面的行号不会被后面的编辑推走；或每改一块就重新扫描一次标记。

**判定命令（充分判据）**：

```powershell
# ① 0 个冲突标记
Select-String -LiteralPath README.md -Pattern '^(<{7}|={7}|>{7}) ' -Encoding UTF8    # 无输出
# ② 章节编号不重复（期望：每个 ## N 只出现一次）
Select-String -LiteralPath README.md -Pattern '^##\s+\d' -Encoding UTF8 | ForEach-Object { $_.Line }
# ③ D5 三件事都在（期望：每条 ≥1 命中）
Select-String -LiteralPath README.md -Pattern 'fork|个人分支' -Encoding UTF8 | Measure-Object | Select-Object -Expand Count
Select-String -LiteralPath README.md -Pattern '不承诺跟进上游|不代表上游立场' -Encoding UTF8 | Measure-Object | Select-Object -Expand Count
Select-String -LiteralPath README.md -Pattern 'live2d-cyrene|数据破坏性迁移' -Encoding UTF8 | Measure-Object | Select-Object -Expand Count
# ④ 官方主体在（期望：≥1）
Select-String -LiteralPath README.md -Pattern 'live2dcubismcore|CyreneHarness|项目结构' -Encoding UTF8 | Measure-Object | Select-Object -Expand Count
```

### 4.16 自检与清理（**必做**）

> 🔴 **第一步：把本 Phase 已完成的 16 个文件 `git add`（否则 `UU` 计数不会变）**
> —— 合并态里"文件已改干净"**不会**自动改变 porcelain 状态码；只有 `git add` 才会把 `UU` 变成 `M `。
> 实测：施工中这 10 个已完成文件的 porcelain 码**仍然是 `UU`**。
> ```powershell
> foreach ($f in $p5) { git add -- "$f" }
> # 之后 A2 的 UU 计数才会降到 10（只剩 P6 的文件）
> ```

```powershell
$env:PATH = "D:\data\node24;" + $env:PATH

# ① 本 Phase 的 16 个文件必须 0 标记
foreach ($f in $p5) {
  $c = (Select-String -LiteralPath $f -Pattern '^(<{7}|={7}|>{7}) ' -Encoding UTF8 -ErrorAction SilentlyContinue | Measure-Object).Count
  if ($c -ne 0) { "✘ 仍有标记 $c 个: $f" } 
}
# 期望：无输出

# ② P6 的 10 个文件必须保持 37 个标记（不许被误伤）
$p6 = @('src/main/channels/bootstrap.test.ts','src/main/channels/bootstrap.ts',
 'src/main/channels/channel-context.test.ts','src/main/channels/channel-context.ts',
 'src/main/channels/dispatcher.test.ts','src/main/channels/dispatcher.ts',
 'src/main/orchestrator/agent-runtime.ts','src/main/orchestrator/build-options.ts',
 'src/main/orchestrator/tools/registry/tool-registry.ts')
$t = 0
foreach ($f in $p6) { $t += (Select-String -LiteralPath $f -Pattern '^<{7} ' -Encoding UTF8 | Measure-Object).Count }
"P6 剩余标记 = $t（期望 37）"
```

> 📌 **`src/renderer/settings/panel-migration-markup.test.ts` 的处理（本 Phase 的加项）**：
> 该测试 `:5` / `:85` 用 `readFileSync` 读 `./index.html` 与 `./settings.css`，
> 而这两个文件**已被 P4 删除**（官方树也没有）→ 该测试**必然 ENOENT 失败**，是"失去被测对象的测试"。
> **本 Phase 不删它**（删测试属产品决定，且它不在 16 文件清单内），改为**登记进 P8 验证清单**（§十 第 6 条）。
> 若执行者判断必须当场处理，**只能**加 `describe.skip` 并在完成报告 §五 写明；**不得**整文件删除。

---

## 五、人工环节 ★

> 规范依据：[`../methodology/BLUEPRINT-撰写规范.md`](../methodology/BLUEPRINT-撰写规范.md) §4.1。
> **四条纪律**：人只做机器做不了的事；期望值由 agent 预先算出；验不了就明说并登记；
> **不得为了凑内容发明无用的人工步骤**。

### H-A 阻塞性拍板（开工前；未答复不得开始）

| # | 议题 | 状态 | 为什么阻塞 |
|---|---|---|---|
| **H-A1** | 确认 **D1（桌面对话绑定彻底删除）** 仍然成立 | ✅ **已拍板**（总蓝图 §五 D1） | 事实 3 的 `useChannelMirrorEvents` 删除、以及本 Phase 的 ChatPage import 修剪，**全部由 D1 推出**。若 D1 反悔，4.13 的做法要重写 |

> **本 Phase 不新增拍板项**。执行者在 §十二 子节 0 里**原样抄录** D1 的答复（从总蓝图 §五 抄）。
> ⚠️ **同时登记进 §三 前置条件**（已作为 P1–P9 的一部分，无需另立）。

### H-B 完工评审（本 Phase 的**退出条件**）

| 编号 | 评审项 | 人只做判断 | 台账编号 |
|---|---|---|---|
| **H-B1** | 打开聊天窗口，目视顶栏 | 侧栏开关 / 模式切换 / 用量徽章 / 窗口控件**在同一行、互不重叠**、无元素越界 | H-05 |
| **H-B2** | 逐条确认本文档 §十 的 3 条 🔴 命令级提示 | 每条 ✅ 或 ❌；❌ 必须写理由 | H-06 |

> ⚠️ **P5 施工完成时应用大概率起不来**（`@lobehub/icons` 未安装，见 §六）：**H-B1 允许延后到 P8 执行**，
> 但**必须在 §十二 子节 0 里写明"延后 + 原因"**，并把 H-05 的状态保持为 `待验`。**不得**因为"没条件验"就假装通过。

### H-C 待验项登记（本 Phase 验不了 / 必须人眼确认的）

已登记进 [`HUMAN-人工验证台账.md`](HUMAN-人工验证台账.md)：**H-01**（用量徽章全链路）、
**H-02**（群上下文条数）、**H-03**（弹窗确认门）、**H-04**（中文编码）。

**登记要求**：每个条目的**期望值必须由 agent 预先算出**（台账 §三 已算好），
**不许**写成"看起来正常就行"。P8 统一销账，**未销账不得宣告合并完成**。

### 本 Phase 明确**不需要**人做的事（防无用功）

| 不需要 | 为什么 |
|---|---|
| ❌ 重算冲突块计数 / JSON 键数 / 导出命中数 | 全部由 §六 的脚本判定，人重算只会掩盖真正的判断点 |
| ❌ 在 P8 之前启动应用做冒烟 | `@lobehub/icons` 未安装 → 渲染进程起不来；让人点一个跑不起来的程序是负价值 |
| ❌ 人工核对 `package-lock.json` | 生成物；P8 用 `npm install --package-lock-only` 重建 |
| ❌ 逐个读 README 的 500 行 | 只看 §四 · 4.15 的三条 D5 声明是否在、章节编号是否重复 |

---

## 六、验收测试

> **判据纪律**：每条给「命令 → 期望 → 失败处置」。**充分判据优先**（等值断言 / 退出码 / 0 命中），
> 启发式计数（"命中数 ≥ N"）必须配交叉验证。

### A1 · 冲突标记归零（本 Phase 的**第一判据**）

```powershell
# 期望：17 个文件全部 0 标记
$p5 = @('README.md','package-lock.json','src/shared/ipc-channels.ts',
 'src/main/settings/settings-facade.ts','src/main/settings/general-settings.ts',
 'src/main/settings/general-settings-lifecycle.ts','src/main/channels/settings-store.ts',
 'src/renderer/settings/general/dom.ts','src/renderer/settings/shared/types.ts',
 'src/renderer/settings/memory/panel.ts','src/renderer/settings/shared/modal.ts',
 'src/renderer/react/i18n/en.json','src/renderer/react/i18n/zh-CN.json',
 'src/renderer/react/features/chat/components/ChatPageNavigation.tsx',
 'src/renderer/react/features/chat/components/ChatPagePanelHost.tsx',
 'src/renderer/react/features/chat/pages/ChatPage.tsx',
 'src/renderer/react/styles/react-root.css')      # ← P5 执行后补入
foreach ($f in $p5) {
  $c = (Select-String -LiteralPath $f -Pattern '^(<{7}|={7}|>{7}) ' -Encoding UTF8 -ErrorAction SilentlyContinue | Measure-Object).Count
  "{0,3}  {1}" -f $c, $f
}
# 期望：17 行全部为 0
```

**失败处置**：定位到具体行重新解决；**不要**用"全局替换标记"的手段糊过去（会误伤 P6 的 9 个文件）。

### A2 · P6 范围未被误伤

```powershell
$p6 = @('src/main/channels/bootstrap.test.ts','src/main/channels/bootstrap.ts',
 'src/main/channels/channel-context.test.ts','src/main/channels/channel-context.ts',
 'src/main/channels/dispatcher.test.ts','src/main/channels/dispatcher.ts',
 'src/main/orchestrator/agent-runtime.ts','src/main/orchestrator/build-options.ts',
 'src/main/orchestrator/tools/registry/tool-registry.ts')
$t = 0; foreach ($f in $p6) { $t += (Select-String -LiteralPath $f -Pattern '^<{7} ' -Encoding UTF8 | Measure-Object).Count }
"P6 未解决标记 = $t（期望 37）"
git status --porcelain | ForEach-Object { $_.Substring(0,2) } | Group-Object | Sort-Object Name | ForEach-Object { "{0} = {1}" -f $_.Name, $_.Count }
# 期望：UU = 10（只剩 P6 的 10 个文件）；UD = 0；DU = 0
```

### A3 · i18n 可解析且键集合正确

```powershell
$env:PATH = "D:\data\node24;" + $env:PATH
node -e "
const fs=require('fs');
for (const l of ['en','zh-CN']) {
  const p='src/renderer/react/i18n/'+l+'.json';
  const raw=fs.readFileSync(p);
  const hasBom = raw[0]===0xEF && raw[1]===0xBB && raw[2]===0xBF;
  const o=JSON.parse(raw.toString('utf8'));
  const k=Object.keys(o);
  console.log(l, 'BOM=',hasBom, 'keys=',k.length, 'has(apiConfig,toolConsole,usageBadge,onboarding)=',
    ['apiConfig','toolConsole','usageBadge','onboarding'].every(x=>k.includes(x)));
}
const a=Object.keys(JSON.parse(fs.readFileSync('src/renderer/react/i18n/en.json','utf8')));
const b=Object.keys(JSON.parse(fs.readFileSync('src/renderer/react/i18n/zh-CN.json','utf8')));
console.log('key set equal =', JSON.stringify(a)===JSON.stringify(b));
"
# 期望：两行 BOM= false / keys= 46 / has(...)= true；key set equal = true
```

**失败处置**：若 `BOM= true` → 用了 `Set-Content -Encoding UTF8`，改用 `[System.IO.File]::WriteAllLines` + `UTF8Encoding($false)` 重写；
若 `keys= 45` → 漏了一段，检查拼接顺序与那个**补上的逗号**。

### A4 · 新模块 `usage-badge.ts` 的导出面（充分判据）

```powershell
$env:PATH = "D:\data\node24;" + $env:PATH
node -e "
const fs=require('fs');
const s=fs.readFileSync('src/shared/usage-badge.ts','utf8');
for (const x of ['DEFAULT_USAGE_BADGE_COLOR','USAGE_BADGE_PRESETS','normalizeUsageBadgeColor','resolveUsageBadgeImage']) {
  console.log(x, s.includes('export const '+x) || s.includes('export function '+x) ? 'OK' : 'MISSING');
}
console.log('preset:peach-sunset =', s.includes('preset:peach-sunset'));
"
npx vitest run src/shared/usage-badge.test.ts
# 期望：4 个 OK / true / 测试文件全绿（≥3 tests passed）
```

### A5 · 旧载体已清干净（**0 命中是硬判据**）

```powershell
# ① chat-appearance 全面清除（期望：0 命中）
Get-ChildItem -Recurse -File -Include *.ts,*.tsx -Path src | Select-String -Pattern 'chat-appearance|DEFAULT_CHAT_APPEARANCE|normalizeChatAppearance' -Encoding UTF8
# ② 死设置已清（期望：0 命中）
Get-ChildItem -Recurse -File -Include *.ts,*.tsx -Path src | Select-String -Pattern 'usageBadgeColor' -Encoding UTF8
# ③ 已废弃通道已清（期望：0 命中）
Get-ChildItem -Recurse -File -Include *.ts,*.tsx -Path src | Select-String -Pattern 'CHAT_TYPOGRAPHY_CHANGED' -Encoding UTF8
# ④ 被删文件未被重新引入（期望：False）
Test-Path src\shared\chat-appearance.ts
# ⑤ 悬空 import 已修（期望：旧路径 False / 新路径 True）
Test-Path src\renderer\components\feedback\FeedbackProvider.tsx
Test-Path src\renderer\react\components\feedback\FeedbackProvider.tsx
```

### A6 · 中文编码完整性（无人条件时的**代理判据**）

```powershell
$env:PATH = "D:\data\node24;" + $env:PATH
node -e "
const fs=require('fs');
const files=['src/main/settings/settings-facade.ts','src/main/settings/general-settings.ts',
 'src/main/channels/settings-store.ts','src/renderer/settings/memory/panel.ts',
 'src/renderer/settings/shared/modal.ts','src/renderer/settings/general/dom.ts',
 'src/renderer/react/i18n/zh-CN.json','README.md'];
let bad=0;
for (const f of files) {
  const s=fs.readFileSync(f,'utf8');
  const n=(s.match(/\uFFFD/g)||[]).length;
  if (n) { console.log('✘ U+FFFD x'+n+' : '+f); bad++; }
}
console.log('损坏文件数 =', bad, '（期望 0）');
"
```

> **本条的定位**：这是**代理指标**（能抓编码损坏，抓不到"文案被换成了英文"）。
> 真实判据是人工台账 **H-04**（P8 时人扫视 UI 文案）。

### A7 · 11 项受保护功能基线（**判据已修正**）

```powershell
$base = Get-Content .cyrene-merge-analysis/protected-features-baseline.json | ConvertFrom-Json
foreach ($p in $base) {
  $hits = & findstr /S /M /C:"$($p.标识)" "src\*.ts" "src\*.tsx" 2>$null
  $now = if ($hits) { ($hits | Measure-Object).Count } else { 0 }
  "{0,-22} 基线 {1,2} → 现在 {2,2}" -f $p.功能, $p.文件数, $now
}
```

**判据（J-02，P4 已修正，本 Phase 沿用）**：
> **退化必须能归因到本 Phase 主动删除/替换的文件；不得出现无法归因的退化。**
> **不许**用"其余 10 项不得退化"这种旧口径（P4 已证明它是删除动作的数学后果，不是缺陷）。

**本 Phase 的预期**：
- `USAGE_BADGE`：基线 2 → P4 后 0 → **P5 后必须 ≥1**（新模块 `src/shared/usage-badge.ts` 含 `USAGE_BADGE_PRESETS` / `USAGE_BADGE_COLOR`）。
  实测判定：`Select-String src\shared\usage-badge.ts -Pattern 'USAGE_BADGE'` **≥2 命中**。
- 其余 10 项：**不得低于 P4 后的实测值**（P4 报告 A5 已给全表）。
- **任何一项低于 P4 后的值且无法归因 → 停止（S7）。**

补一条正向判据（证明 `groupContextLimit` 真的回到了数据模型）：

```powershell
Select-String -LiteralPath src\main\settings\general-settings.ts -Pattern 'groupContextLimit|DEFAULT_GROUP_CONTEXT_LIMIT|normalizeGroupContextLimit' -Encoding UTF8 | Measure-Object | Select-Object -Expand Count
# 期望：≥5（字段 + 3 个常量 + 1 个函数签名）
```

### A8 · 定向 vitest（**P5 的主门禁**）

**🔴 判据按「合并前基线」分成两组（依据 §二 事实 8 / 事实 9），不许混为一谈。**

> ⚠️ **门禁已按实测收窄（依据事实 9）**：合并前的 16 个绿文件里，有 **5 个依赖 P4 已删除的文件**
> （`settings/index.html`、`settings/i18n/**`），**它们不可能在 P5 之后转绿** —— 那是 P4 删文件的后果，不是回归。
> 因此有效门禁 = **既有 10 文件**（tests ≈ **71**，见 A8-A 的核对说明）；那 6 个文件改为「**按预期红 + 必须逐条给原始错误**」。

#### A8-A · 10 个"合并前已全绿且不依赖 P4 删除物"的文件 → **必须 全绿（tests = 71）**

```powershell
$env:PATH = "D:\data\node24;" + $env:PATH
npx vitest run `
  src/renderer/settings/shared/modal-icon.test.ts `
  src/renderer/settings/mcp/modal-interaction.test.ts `
  src/renderer/react/features/chat/components/panel-layout.test.ts `
  src/renderer/react/features/chat/components/ChatPageNavigation.test.ts `
  src/renderer/react/features/chat/pages/ChatPage.test.ts `
  src/renderer/react/styles/react-root.visual.test.ts `
  src/main/settings/settings-facade.test.ts `
  src/main/settings/general-settings-lifecycle.test.ts `
  src/main/channels/settings-store.test.ts `
  src/main/conversation-usage-store.test.ts `
  src/shared/usage-badge.test.ts
```

**判据**：
1. **上头 10 个合并前既有文件**全部通过，**失败数 = 0**。
   逐文件基线（合并前实测）：`modal-icon` 10 / `modal-interaction` 10 / `panel-layout` 6 / `ChatPageNavigation` 3 /
   `ChatPage` 1 / `react-root.visual` 1 / `settings-facade` 17 / `general-settings-lifecycle` 7 /
   `settings-store` 14 / `conversation-usage-store` 7。
2. `src/shared/usage-badge.test.ts`（本 Phase 新建）**全绿**（新增测试，不计入上面这组）。
3. **退出码 0**。

> ⚠️ **不要用"总数 = 71"当硬判据**：`modal-icon.test.ts` 的**合并前**用例数是记在基线表里的
> （实测那一次输出为 9），而这个文件在合并后**还会多出官方新增的用例**。
> **唯一硬判据是"这 10 个文件的失败数 = 0、退出码 0"**；总数只用于发现"**漏跑却报绿**"
> ——若实测总数**少于** 71，先查是不是某个文件没被 vitest 收进来。

> **为什么能这么硬**：这些文件在合并前全绿，且**不触碰任何被 P4 删除的文件**（逐个 import 已核对）。
> 所以**任何**失败都是本 Phase 引入的回归 —— 不存在"本来就坏"的借口。

#### A8-A2 · 7 个「失去被测对象」的文件 → **按预期红，但必须给原始错误 + 归因**

```powershell
$env:PATH = "D:\data\node24;" + $env:PATH
npx vitest run `
  src/renderer/settings/memory/delete-all.test.ts `
  src/renderer/settings/memory/erasure-flow.test.ts `
  src/renderer/settings/memory/manager.test.ts `
  src/renderer/settings/memory/panel.test.ts `
  src/renderer/settings/panel-migration-markup.test.ts `
  src/renderer/settings/dom-refs-consistency.test.ts `
  src/renderer/react/features/chat/components/panel-layout.test.ts
```

**判据（不是"必须绿"，是"必须与事实 9 的预测逐条对齐"）**：

| 测试文件 | 预期死因 | 通过条件 |
|---|---|---|
| `memory/erasure-flow.test.ts` | `ENOENT` @ `..\index.html` | 错误里出现 `index.html` 与 `ENOENT` |
| `memory/manager.test.ts` | `ENOENT` @ `..\index.html` | 同上 |
| `memory/panel.test.ts` | `ENOENT` @ `..\index.html` | 同上 |
| `panel-migration-markup.test.ts` | `ENOENT` @ `index.html` | 同上 |
| `dom-refs-consistency.test.ts` | `ENOENT` @ `index.html` | 同上 |
| `memory/delete-all.test.ts` | `Failed to resolve import "../i18n"` | 错误里出现 `../i18n` |
| **`panel-layout.test.ts`** | **`ENOENT` @ `ModelModePanel.css`，且必须正好是 2 条用例红** | 该文件**可加载**、**4 passed / 2 failed**，两条失败堆栈均指向 `ModelModePanel.css`；**3 条「顶栏不重叠」守卫必须绿** |

**🔴 若某个文件的死因与上表**不符**（例如报出完全不同的模块）→ 说明还有**第二种**断链没被发现 → **立即停止（S9）**并报告。**

#### A8-B · 5 个"官方新增"文件 → **报告制，不作门禁**（无基线可对照）

> 🔴 **本组不是门禁**（依据 §二 事实 9 与判据台账 **J-06**）：这 5 个文件是**官方新增、合并前不存在**，
> **无基线可对照**。它们的意义是"**首次建立基线 + 暴露环境问题**"：
> 若报 `Failed to resolve import "@lobehub/icons"` → 归「不算失败」①（P8 的 `npm ci` 负责）；
> 若因 P6 未解决的冲突块而红 → 归 ②。
> **不要**为了它们变绿去改产品代码；但**必须**逐条把原始错误写进完成报告。

```powershell
# 报告制命令（不作门禁；结果逐条写进完成报告 §四）
$env:PATH = "D:\data\node24;" + $env:PATH
npx vitest run `
  src/renderer/settings/shared/modal.test.ts `
  src/renderer/settings/shared/dialog-focus.test.ts `
  src/renderer/settings/default-dialogs-regression.test.ts `
  src/renderer/react/styles/settings-typography-contract.test.ts `
  src/renderer/react/styles/theme-token-contract.test.ts `
  src/shared/usage-badge.test.ts
```

**判据（分层，不要求全绿）**：

| 文件 | 期望 | 不通过时的处置 |
|---|---|---|
| `src/shared/usage-badge.test.ts`（**本 Phase 新建**） | ✅ **必须全绿** | 属本 Phase 缺陷 → 修到绿 |
| `src/renderer/settings/shared/modal.test.ts` | ⚠️ **力争全绿** | 它 `:4` 只 import `showAlert/showConfirm/showHtmlModal/showInputModal/showNotice` —— **全在 4.7 之后的 `modal.ts` 里**，理论上该绿。若失败**必须逐条给根因**；若根因是 `@lobehub/icons` 或 P6 未解决 → 归「不算失败」①/② |
| `src/renderer/settings/shared/dialog-focus.test.ts` | ⚠️ **力争全绿** | 只 import `./dialog-focus`（独立模块，无冲突）→ 失败必为真问题，**必须查明** |
| `src/renderer/settings/default-dialogs-regression.test.ts` | 📋 报告 | 只读文件清单 + 路径，**不 import 任何 UI 模块**；失败必须给原始错误 |
| `src/renderer/react/styles/settings-typography-contract.test.ts` | 📋 报告 | 纯 `readFileSync` 断言（新样式契约），失败必须给原始错误 |
| `src/renderer/react/styles/theme-token-contract.test.ts` | 📋 报告 | 同上 |

> ⚠️ **不要**加 `--reporter=basic`（vitest 4 已移除该 reporter，会导致启动失败，**不是**测试失败）。
> 🔴 **A8-B 的结论必须逐文件写进完成报告 §四**（哪个通过、哪个失败、失败原文关键字、归因到哪一类）。

### A9 · 静态检查（**"通过 或 已归因失败"，不做全绿硬判**）

```powershell
$env:PATH = "D:\data\node24;" + $env:PATH
npx tsc -p tsconfig.main.json     ; "main exit=$LASTEXITCODE"       # 覆盖 src/main + src/shared + src/plugins
npx tsc -p tsconfig.preload.json  ; "preload exit=$LASTEXITCODE"    # 覆盖 src/preload + src/shared
npx tsc -p tsconfig.renderer.json ; "renderer exit=$LASTEXITCODE"   # 等价于 npm run check:renderer
```

> 📌 **为什么用 `tsc` 而不是 `npm run build`**：本 Phase 只需要**类型门禁**，不需要产出物；
> `npm run build` 还会跑 vite 打包与 `build:cli`，耗时且引入与本 Phase 无关的失败面。
> 两个 tsconfig 的覆盖范围已实测确认：
> `tsconfig.main.json` = `src/plugins/**` + `src/main/**` + `src/shared/**`（**本 Phase 的新模块 `src/shared/usage-badge.ts` 在这里**）；
> `tsconfig.preload.json` = `src/preload/**` + `src/shared/**`；`tsconfig.renderer.json` = 渲染层。

**判据（两条都算通过）**：
- ✅ 退出码 0；**或**
- ✅ 退出码非 0，但**逐条错误**都能归因到「不算失败」三类，**并且**错误里**没有**本 Phase 16 个文件的
  `TS2307 / TS2304 / TS2353 / TS2678 / TS2367`（模块找不到 / 标识符未定义 / 属性不存在 / case 不可比 / 类型不可比）。

### 三类「不算失败」（**必须提前写明**）

| 类别 | 具体现象 | 为什么不算失败 |
|---|---|---|
| **① 依赖未安装** | 错误含 `Failed to resolve import "@lobehub/icons"` / `"@lobehub/ui"`（或其它官方新依赖），或 `Cannot find module '@lobehub/icons'` | 合并后的 `package.json` 已声明 `@lobehub/icons@^5.19.3` 与 `@lobehub/ui@^5.48.2`（实测），但 `node_modules` 未装；**P8 的 `npm ci` 是唯一解法**（P4 偏差 1 已定性，P5 事实 8 已证实它们是**合并侧新增**） |
| **② P6 范围未解决** | 报错指向 P6 的 10 个文件（`src/main/channels/**`、`src/main/orchestrator/**`）里的冲突标记 | 本 Phase **非目标**；P6 解决后自然消失 |
| **③ 失去被测对象的测试** | `src/renderer/settings/panel-migration-markup.test.ts` 报 `ENOENT … index.html` / `settings.css` | 被测文件已在 P4 删除（官方树亦无）；该测试的处置见 §十 第 6 条 |

> **除这三类之外的任何失败 → 立即停止（S7）并报告。**

---

## 七、产出物清单

| # | 产出 | 类型 | 验证方式 |
|---|---|---|---|
| 1 | **16 个文件冲突归零**（含 4 项能力恢复） | 代码 | A1 + A4–A7 |
| 2 | `src/shared/usage-badge.ts`（**新建**，3 导出） | 代码 | A4 |
| 3 | `src/shared/usage-badge.test.ts`（**新建**） | 测试 | A8 |
| 4 | `src/renderer/settings/shared/modal-state.ts`（**主动改动**：`InputModalOptions.confirmValue`） | 代码 | A8（delete-all 用例） |
| 5 | `.cyrene-merge-analysis/p5/pre-hashes.txt`（16 个 blob 哈希） | 证据 | §四 4.0 |
| 6 | `E:\AI_Chating\cyrene-agent-p5-backup`（16 文件外部备份） | 回退网 | §八 |
| 7 | [`HUMAN-人工验证台账.md`](HUMAN-人工验证台账.md)（**新建**，H-01…H-06） | 台账 | §五 |
| 8 | [`PHASE-5-完成报告.md`](PHASE-5-完成报告.md)（**10 节**，含「十、回写清单」） | 报告 | 规范 §5 |
| 9 | 总蓝图回写（T2/T3：P5=16/27、P6=10/37、基线刷新） | 文档 | §十二 回写清单 |
| 10 | 施工记录（**§十二 子节 0 人工环节回执**为必需） | 报告内 | 规范 §8 |

---

## 八、回退方法（分级）

> ⚠️ **回退网优先级**：单文件 → 整批 16 文件 → 放弃本 Phase 全部动作。
> **永远不要** `git merge --abort`（会丢掉 P3/P4 的成果，需要把整个合并重跑一遍）。

### 级 1 · 单文件回退（最常用）

```powershell
cd E:\AI_Chating\cyrene-agent
# 从 P4 结束态（合并中、该文件带标记）恢复
git checkout MERGE_HEAD -- <path>          # 得到官方版
# 或从"合并前本地状态"恢复（带本地全部工作）
git checkout phase3-work-snapshot -- <path>
# 或从本 Phase 的外部备份恢复（保留刚才的手工解决结果之外的原始标记态）
Copy-Item "E:\AI_Chating\cyrene-agent-p5-backup\<path 以 __ 替换斜杠>" <path> -Force
```

### 级 2 · 整批 16 文件回退（本 Phase 全部作废）

```powershell
foreach ($f in $p5) { git checkout phase3-work-snapshot -- $f }
# ⚠️ 注意：这会把 16 个文件恢复成【合并前本地版本】，冲突标记也随之消失
#    → 若你想回到"带标记的合并中态"，应先 git checkout MERGE_HEAD -- $f 再看
git status --porcelain | ForEach-Object { $_.Substring(0,2) } | Group-Object | Sort-Object Name
# 期望（回退后）：UU = 26 全回来
```

### 级 3 · 放弃整个 Phase（回到 P4 结束态）

```powershell
git checkout phase3-work-snapshot -- .      # 危险：丢弃 P5 全部改动
git status --porcelain | Measure-Object     # 核对行数回到 868 附近
```

### 级 4 · 连 `.git` 都没了

```powershell
robocopy E:\AI_Chating\cyrene-agent-backup-phase0 E:\AI_Chating\cyrene-agent /E /XD node_modules
```

---

## 九、已知坑（本 Phase 相关 + 复现情况）

> 来源：[`../methodology/BLUEPRINT-经验库-通用.md`](../methodology/BLUEPRINT-经验库-通用.md)（H/M，写蓝图前整份过一遍的产物）
> + [`../methodology/BLUEPRINT-经验库-具体坑.md`](../methodology/BLUEPRINT-经验库-具体坑.md)（L，只查 **git / Node / Electron / PowerShell** 那几章）。

| # | 坑 | 本次复现情况 | 应对（直接给写法） |
|---|---|---|---|
| K1 | **`Set-Content -Encoding UTF8` 写 BOM**，读回按 ANSI → 中文乱码 / JSON 解析失败 | **本次撰写阶段复现**（`git show > 文件` 得到 UTF-16 内容） | 一律 `[System.IO.File]::WriteAllLines($p, $arr, (New-Object System.Text.UTF8Encoding($false)))`；读用 `[System.IO.File]::ReadAllLines/ReadAllText` |
| K2 | **`2>&1` 污染变量**（git 警告灌进 `$st` 之类） | P2/P3 已复现 | 用 `2>$null` + `\| Select-Object -Last 1` |
| K3 | **PS 5.1 括号表达式内不能用 `;`** | P2/P3 已复现 | 拆成独立语句；`$LASTEXITCODE` 单独取 |
| K4 | **本会话 `node -v` 仍是 v22** | P4 已复现 | 每条 npm/npx/node 命令前 `$env:PATH = "D:\data\node24;" + $env:PATH` |
| K5 | **`git status` 行数不是判据** | P3/P4 已复现 | 只看 `UU/UD/DU` 计数与 `git ls-files -s` |
| K6 | **`--reporter=basic` 在 vitest 4 已移除** | P4 已复现 | 不加 reporter 参数 |
| K7 | **冲突块方向易误读**（以为某行属 ours，实际属 theirs） | **P4 偏差 4 复现过** | 判断某行属哪一侧**必须展开三行标记实际读**；本蓝图 §二 已把 ChatPage 的方向实测写死 |
| K8 | **官方树的 import 路径本身可能是坏的**（`FeedbackProvider` 少一层 `react/`） | **P4 偏差 4 已确证** | 改完用 `Test-Path` 双向核对（§四 4.13） |
| K9 | **`NUL` 幻影目录吞掉 robocopy 日志** | P0 已复现 | robocopy 成功看 `Files FAILED` 与 `Mismatch` 两列；本 Phase 用 `Copy-Item` 即可，不涉 robocopy |
| K10 | **`@(...)` 包裹 GroupInfo 破坏 `.Count`** | P3 已复现 | 计数一律 `foreach` 累加或用 `List[string]` |
| K11 | **非 ASCII 文件名逐文件复制会静默丢文件** | 未复现（本 Phase 16 个文件全 ASCII） | 不要把这个便利推广到中文路径 |
| K12 | **合并态下"全局替换冲突标记"会误伤其他 Phase** | 本 Phase **新引入的风险**（P5/P6 交错） | 只对 §四 列出的 16 个文件动手（A2 专门验这条） |
| K13 | 🔴 **junction 联接的 `node_modules` 会让 `git worktree remove` 穿透删掉主仓库依赖** | **本次基线测量时实测到风险并规避** | 临时工作树收尾**必须**：先 `cmd /c rmdir <工作树>\node_modules`（只解除联接，`rmdir` 不带 `/s` 不会删目标内容），**再** `git worktree remove --force`；事后用 `Test-Path node_modules\vitest\package.json` 复核主仓库依赖仍在 |
| K14 | **`git worktree add` 检出的是"已提交"内容，不含未提交工作** | 本次复现（若直接对 `598dfb75` 建工作树，会得到"没有本地 12 天工作"的假基线） | 复现基线时**必须**指定 `phase3-work-snapshot`（`586eae90`），**不要**用 HEAD |
| K15 | 🔴 **删掉"宿主文件"不会自动暴露它的依赖者** | **本 Phase 现场复现**（P4 删了 `settings/index.html` + `settings/i18n/**`，留下 6 个孤儿模块与 5 个死测试；冲突清单里**一个都没有**） | ① 删文件类 Phase 必须做**反向引用扫描**（对每个被删文件搜"谁 import 它"）；② 历史测试基线要**分类**：依赖被删物的"绿"是**假绿**（见事实 8/9 与判据台账 J-06） |

### 🆕 本 Phase 新发现（建议追加进经验库，见 §十二 回写清单 T4）

| 坑 | 症状 | 根因 | 正确做法 |
|---|---|---|---|
| **`git show :3:` 常常就是"双方合并结果"** | 以为 `:3:`（theirs）只有官方改动，于是"取 theirs"会担心丢本地工作 | `:3:` 是"官方在**合并基**上算出的版本"，它对**只被本地改过、官方没碰**的区域会**原样保留本地内容** | 对"生成物 / 无本地独有语义"的文件（锁文件），`:3:` 往往就是正确答案；但**必须**先用 `git cat-file blob $(git ls-files -s -u -- <path> 取 stage 3 哈希)` 实际看一眼，不要凭"theirs = 官方"的直觉判断 |
| **i18n 大块拼接时，两侧末行都可能缺逗号** | 拼接后 `JSON.parse` 报 `Expected ',' or '}' after property value` | 冲突块切在 JSON 对象中间，ours 末行是 `}`（无逗号），theirs 首行是下一个键 | 拼接前**先看两侧首末行**；本任务的规则是"ours 末行补 1 个逗号"，写进脚本 |
| **`--theirs/--ours` 在 `git checkout` 上的语义与 merge 相反** | 容易把"我们的"和"官方的"弄反 | `git checkout --ours` = 索引 stage 2 = **HEAD 侧** = 本地；`--theirs` = stage 3 = **官方侧** | 用词统一成"HEAD 侧 / 官方侧"，**不要**用"ours/theirs"口头表述 |

---

## 十、给下一个 Phase 的交接提示（编号清单，🔴 必读）

1. 🔴 **P6 的范围已实测修正为 10 文件 / 37 块**（不是旧文档的 11 / 42）：
   `bootstrap.test.ts(4)` / `bootstrap.ts(7)` / `channel-context.test.ts(1)` / `channel-context.ts(5)` /
   `dispatcher.test.ts(10)` / `dispatcher.ts(6)` / `agent-runtime.ts(1)` / `build-options.ts(1)` /
   `tool-registry.ts(1)`。
   **验证命令**：`$t=0; foreach($f in $p6){ $t += (Select-String -LiteralPath $f -Pattern '^<{7} ' -Encoding UTF8 | Measure-Object).Count }; $t` → 期望 **36**
   （🔴 **P5 实测修正**：原文写「10 文件 / 37 块」，但本清单**只有 9 个文件**、合计**36** 块 ——
   第 10 个 `general-settings-lifecycle.ts` 已归 P5，其 1 块被重复计入 P6。**以 9 / 36 为准**。）
2. 🔴 **【P5 实测作废本条】** ~~`ChatPage.tsx` 的 `useFeedback` 路径修正已在 P5 完成（`../../../react/components/feedback/FeedbackProvider`）。P6 若再次触碰该文件，不要退回旧路径。~~
   实测结论（见 §二 事实 3 的证伪段）：**带 `react/` 的版本是错的**，P5 保留的是**官方原值**
   `"../../../components/feedback/FeedbackProvider"`。**P6 若触碰该文件，不要改成带 `react/` 的版本**（会 `TS2307`）。
3. 🔴 **P6 必须新增"静默失效探测器"集成测试**（总蓝图 §8.2 A3）：
   断言"dispatcher 处理完一条渠道消息后，`channels/history/<sessionId>.jsonl` 确实多了一行"。
   理由：`history-log.test.ts` 直接调 `appendHistory`，**不走 dispatcher**，所以 dispatcher 不再写 history 时它**永远不会失败**。
   P5 已证明这类"结构上抓不到"的失效是本任务最大的风险（`usageBadgeColor` 即一例）。
4. ⚠️ **P7 建议扫一遍其余 28 个 `M` 类文件里的孤儿引用**：
   P5 已单点修掉 `settings-facade.ts:56` 这种"**在冲突块之外**的悬空引用"，
   同类问题**结构上不会出现在冲突清单里**。建议命令：
   ```powershell
   git status --porcelain | Where-Object { $_.Substring(0,2) -eq 'M ' } | ForEach-Object { $_.Substring(3) }
   # 再对每个文件跑一次"本地独有标识符是否仍有定义"的检索
   ```
5. 📌 **`package-lock.json` 的收尾在 P8**：P5 只做了"取官方侧消除标记"；
   `npm ci` 之后必须 `npm install --package-lock-only` 重建，使锁文件与合并后的 `package.json` 完全一致。
6. 📌 **`src/renderer/settings/panel-migration-markup.test.ts` 必然失败（ENOENT）**：
   它读的 `./index.html` / `./settings.css` 已被 P4 删除（官方树亦无）。
   **P8 必须二选一**：① 删除该测试（推荐，被测对象已不存在）；② 改写为对官方 React 设置页的等价断言。
   **在此之前不要把它算作合并缺陷。**
7. 📌 **`usageBadgeColor` 已被有意删除**（事实 5）：P8 不要把它当"回归"来找。
   若项目所有者要求恢复该自定义能力，那是一个**新功能**（官方设置 UI 里已无该控件），**不属于本次合并**。
8. 💾 **回退网**：`phase3-work-snapshot`（`586eae90`，合并前本地全量）/ `phase0-full`（`34f0669f`）/
   `E:\AI_Chating\cyrene-agent-p5-backup`（16 文件原始态）。
9. 🔴 **仍不要提交** —— 提交时机在 **P7 之后**（26 个 `UU` 全部解决）。
10. ✅ **P5 完成后（且 `git add` 过本 Phase 的 16 个文件之后）`git status --porcelain` 的 `UU` 必须精确等于 10**；
    `UD`/`DU` 必须为 0。**没有 `git add` 的话 `UU` 仍是 26** —— 那不是失败，是漏了一步（见 §四 4.16 开头）。
11. 🔴 **P6 的前置动作（必须在 P6 动手之前做）**：读**本地未提交**的
    `src/main/channels/history-log.ts` 里的 `buildGroupContextBlock`，用它校正"旁听消息载荷"的形状
    （`observed_message` 条目的字段）；这是 D3 方案 1（旁听迁进 CTA 轨迹）能否落对的前提。
    相关决策与语料边界见 [`02-旁听上下文迁移可行性结论.md`](02-旁听上下文迁移可行性结论.md) /
    [`03-旁听迁移方案修订.md`](03-旁听迁移方案修订.md)；**D4 是硬约束**：`src/main/corpus/**` **绝不迁入轨迹**。

---

## 十一、改动的目标达成核对（执行后回填）

| 目标（来自 §一） | 状态 | 证据 |
|---|---|---|
| T1 · 16 文件 / 27 块冲突归零 | ☐ | A1（16 行全 0）+ A2（P6 剩 37） |
| T2 · 4 项能力恢复 | ☐ | A4（新模块）+ A5（旧载体清空）+ A7（基线）+ A8（delete-all 门控用例） |
| T3 · 新增 `usage-badge.ts` + 测试 | ☐ | A4 |
| T4 · 旧载体删净 | ☐ | A5（4 条 0 命中 / 1 条 False / 2 条路径判定） |
| T5 · 静态 + 定向测试 | ☐ | A8 + A9 |
| T6 · 人工环节 | ☐ | §十二 子节 0（H-A 回执 / H-B 结论 / H-C 台账编号） |
| **非目标遵守** | ☐ | 未动 P6 的 10 个文件（A2）/ 未提交 / 未 `npm ci` / 未 `merge --abort` / 未重建 chat-appearance |

**回写清单已闭合**：☐（见 §十二 · 回写清单，未勾完不得提交）

---

## 十二、施工记录（执行者追加；**子节 0 为必需**）

> 规范依据：[`../methodology/BLUEPRINT-撰写规范.md`](../methodology/BLUEPRINT-撰写规范.md) §8。
> **原则**：遇到真实代码与蓝图冲突时，**以真实代码为准**，并在本节写明偏离与原因。

### 子节 0 · 人工环节回执（**Phase 5 起必需**）

**H-A 答复（原样抄录）**

| 编号 | 议题 | 答复原文 | 时间 |
|---|---|---|---|
| H-A1 | D1 桌面对话绑定彻底删除是否仍成立 | | |

**H-B 评审结论**

| 编号 | 评审项 | 结论（✅/❌/延后） | 说明 |
|---|---|---|---|
| H-B1 | 顶栏布局目视 | | （若延后到 P8，必须写明原因） |
| H-B2 | §十 的 3 条 🔴 提示逐条确认 | | |

**H-C 登记确认**

| 编号 | 台账条目 | 已登记 |
|---|---|---|
| H-01…H-04 | [`HUMAN-人工验证台账.md`](HUMAN-人工验证台账.md) §三 | ☐ |
| H-07 | [`HUMAN-人工验证台账.md`](HUMAN-人工验证台账.md) §三（P4 死子树处置：删 / 留待迁移 / 只删测试 —— **三选一**） | ☐ |

### 子节 1 · 实际落地（偏离三列表）

| 蓝图 | 实际实现 | 原因 |
|---|---|---|
| | | |

### 子节 2 · 蓝图未覆盖、施工中发现的漏洞

| 位置 | 问题 | 修复 |
|---|---|---|
| | | |

### 子节 3 · 蓝图最大不确定点的核实结论

| 蓝图原文 | 结论 | 证据 |
|---|---|---|
| §二 事实 5「`usageBadgeColor` 是死设置，可删」 | | 复核命令见 A5 ② |
| §四 4.15「README 取官方主体 + fork 声明前置」 | | A？ |

### 子节 4 · 有意保留的「不处理」点

| 项 | 为什么不管 |
|---|---|
| `src/renderer/settings/panel-migration-markup.test.ts` 必然失败 | 被测对象已被 P4 删除；处置权交 P8（§十 第 6 条） |
| `src/renderer/settings/appearance/dom.ts:19-20` 两个死 DOM 引用 | 该文件仍被 `preferences/panel.ts` / `shared/save-status.ts` 引用（不能说整文件是死的）；两个 `getElementById` 返回 `null` 无害，且**没有** import 者 |
| `src/renderer/settings/shared/types.ts` 的 `chatParaSpacing?` | 官方无此字段、无消费方；保留可避免"顺手删字段"引发别的类型差异 |

### 子节 5 · 验收（实测数字）

| 命令 | 结果 |
|---|---|
| | |

### 子节 6 · 验收后修复

| 现象 | 根因 | 修复 | 复验 |
|---|---|---|---|
| | | | |

### 子节 7 · 经验追加（按 H/M/L 归位到经验库）

| 经验 | 等级 | 归位 |
|---|---|---|
| `git show :3:` 常已是双方合并结果 | L | `经验库-具体坑.md` §git |
| i18n 大块拼接的补逗号规则 | L | `经验库-具体坑.md` §JSON |
| 合并态下"全局替换标记"会误伤其他 Phase | M | `经验库-通用.md` |

### 子节 8 · 待做 / 未做

| 项 | 状态 | 说明 |
|---|---|---|
| | | |

---

## 十三、回写清单（**规范 §5.1 的 T1–T4；未勾完不得提交**）

> 本节与 [`PHASE-5-完成报告.md`](PHASE-5-完成报告.md) §十 **必须一致**。
> 撰写本蓝图时**已经预置**三条回写（下方前三行），执行者只需**核对 + 补齐实测发现的新触发**。

| 触发条件 | 回写目标 | 回写内容一句话 | 已勾选 |
|---|---|---|---|
| T2 基线数值被改写 | [`BLUEPRINT-总蓝图.md`](BLUEPRINT-总蓝图.md) §四 Phase 索引 + §九 当前基线 | P5 = **16 文件 / 27 块**、P6 = **10 文件 / 37 块**；旧值 15/22、11/42 移入"历史基线（仅存档）" | [x] |
| T3 蓝图描述被实测推翻 | [`BLUEPRINT-总蓝图.md`](BLUEPRINT-总蓝图.md) §六 高危落点表 | `USAGE_BADGE` 的真实处置不是"搬回旧实现"而是**新建 `src/shared/usage-badge.ts`**；`usageBadgeColor` 属死设置，已删除 | [x] |
| T1 判据被修正 | [`BLUEPRINT-总蓝图.md`](BLUEPRINT-总蓝图.md) §九 判据修正段 | 新增 **J-04**：`USAGE_BADGE` 基线判据改为"**新模块内 `USAGE_BADGE` 命中 ≥2**"，旧判据"工作区命中 ≥2"作废（P4 已证明承载文件删除会让旧判据必然失败） | [x] |
| T1 判据被修正 | [`BLUEPRINT-总蓝图.md`](BLUEPRINT-总蓝图.md) §二 判据修正台账 | 新增 **J-06**：门禁由"合并前全绿的文件"收窄为"**合并前全绿且不依赖本任务已删除物**"（**10 文件 / 71 tests**）；**J-05 的 16 文件 / 143 tests 口径作废并保留存档** | [x] |
| T3 蓝图描述被实测推翻 | [`PHASE-5-移植适配.md`](PHASE-5-移植适配.md) §二 事实 9 + §六 A8-A2 | 新增事实 9：P4 删宿主留下 6 个孤儿模块 + **5 个**（不是 4 个）失去被测对象的测试；处置决定=**不恢复 P4 已删文件**，改登记 H-07 交人拍板 | [x] |
| T4 新增经验 | [`../methodology/BLUEPRINT-经验库-通用.md`](../methodology/BLUEPRINT-经验库-通用.md) | 新增 H/M 级条目：**删掉"宿主文件"不会自动暴露其依赖者**（删文件类 Phase 必须做反向引用扫描；测试基线里的"假绿"要分类） | [ ] |
| T4 新增经验 | [`../methodology/BLUEPRINT-经验库-具体坑.md`](../methodology/BLUEPRINT-经验库-具体坑.md) | 新增 L 级条目：`:3:` 常已是双方合并结果（取 theirs 前必须实看 blob） | [ ] |
| T4 新增经验 | [`../methodology/BLUEPRINT-经验库-具体坑.md`](../methodology/BLUEPRINT-经验库-具体坑.md) | 新增 L 级条目：i18n 大块拼接需补两侧末行逗号，并给 JSON.parse 校验命令 | [ ] |
| T4 新增经验 | [`../methodology/BLUEPRINT-经验库-通用.md`](../methodology/BLUEPRINT-经验库-通用.md) | 新增 M 级条目：多 Phase 交错解决冲突时，禁止"全局替换冲突标记" | [ ] |
| — | — | 本 Phase 无其他触发（执行者须逐条再核对一次 T1–T4，**无触发时写"无"**，不许留空） | [ ] |
