# Phase 4 完成报告：处理删除类冲突（Tier A）

> **状态**：✅ **已完成**
> **执行日期**：2026-09-25
> **执行者**：agent（无对话历史，仅凭 [PHASE-4-处理删除类冲突.md](PHASE-4-处理删除类冲突.md) + [BLUEPRINT-总蓝图.md](BLUEPRINT-总蓝图.md)）
> **结论**：**A1–A6 全部通过（26 精确命中），20 个删除类冲突处置完毕，3 处独有代码已固化，零本地工作丢失。**
> **报告规范**：对齐 [PHASE-0-完成报告.md](PHASE-0-完成报告.md) / [PHASE-2-完成报告.md](PHASE-2-完成报告.md) / [PHASE-3-完成报告.md](PHASE-3-完成报告.md)

---

## 一、执行摘要

| 项目 | 结果 |
|---|---|
| 前置条件（5 项） | ✅ 全部满足（`MERGE_HEAD` / 46 / 26-15-5 / 清单 46 行 / 双锚点） |
| 步骤 3.1 抢救独有代码 | ✅ 6 份素材落盘，自检**全绿** |
| 步骤 3.2 处置 15 个 `UD` | ✅ 15/15 `git rm` 成功（退出码 0），**无需 `-f`** |
| 步骤 3.3 处置 5 个 `DU` | ✅ 2 恢复官方版 + 3 接受本地删除 |
| A1 冲突数（期望 26） | ✅ **26**（精确命中） |
| A2 构成（期望仅 UU 26） | ✅ **UU = 26**，`UD` = 0，`DU` = 0 |
| A3 抢救素材完整 | ✅ 6/6 OK（`confirmValue` = 3 处，精确命中） |
| A4 两个恢复文件与官方一致 | ✅ 存在 True / 冲突标记 0 / `diff MERGE_HEAD` = 0 行 |
| A5 11 项功能基线 | ⚠️ **退化 2 项，均已查明为"承载文件被删"的预期结果**（详见偏差 2/3） |
| A6 锚点与回退网 | ✅ `586eae90` / `34f0669f` / `MERGE_HEAD` 存在 / HEAD 仍 `598dfb75` |
| 附加·定向 vitest 验证 | ✅ **13 tests passed**，证明两个恢复文件**确实被官方架构消费** |

**验收总计**：6 项主判据全部 PASS；A5 的 2 项退化经逐行根因分析判定为**预期且不损害功能**（非失败）。

---

## 二、最终状态（交接给 P5）

```
HEAD        = 598dfb75  （未变，本 Phase 零提交）
MERGE_HEAD  = b11b8851  （官方 master，合并仍在进行中）
冲突        = 26（全部 UU，UD/DU 已清零）
抢救素材    = .cyrene-merge-analysis/preserved/（6 份，见 §三）
回退        = phase3-work-snapshot（586eae90）/ phase0-full（34f0669f）
未提交      = 是（提交时机在 P7 之后）
```

### 产出物

| 文件 | 内容 | 行数 |
|---|---|---|
| `.cyrene-merge-analysis/preserved/bak-chat-appearance.ts` | `USAGE_BADGE` 全套实现（3 个导出） | 103 |
| `.cyrene-merge-analysis/preserved/bak-modal-ours.ts` | `confirmValue` 完整实现（**ours 权威视图**） | 216 |
| `.cyrene-merge-analysis/preserved/bak-i18n-en.json` | 旧设置窗口 i18n 键 | 263 |
| `.cyrene-merge-analysis/preserved/bak-i18n-zh-CN.json` | 旧设置窗口 i18n 键 | 1309 |
| `.cyrene-merge-analysis/preserved/bak-settings.ts` | `usageBadge` UI 接线参考 | 1175 |

> `bak-modal-ours.ts` 的 **216 行**与蓝图 §3.1 记载的"stage 2 = 216 行"**逐值吻合**，
> 确认抢救来源正确（`phase3-work-snapshot:src/renderer/settings/shared/modal.ts`）。

---

## 三、执行过程（含命令与实测输出）

### 3.1 前置条件核验（5/5 满足）

```powershell
MERGE_HEAD exists        = True
HEAD                     = 598dfb75   （期望 598dfb75）✔
MERGE_HEAD               = b11b8851   （期望 b11b8851）✔
phase3-work-snapshot     = 586eae90   （期望 586eae90）✔
phase0-full              = 34f0669f   （期望 34f0669f）✔
冲突总数                 = 46         （期望 46）✔
UU = 26 / UD = 15 / DU = 5            （期望 26/15/5）✔
90-p3-conflicts-actual.txt = 46 行    （期望 46）✔
status 总行数            = 868        （**不作判据**，见蓝图坑 8）
```

### 3.2 抢救独有代码（步骤 3.1，**最先执行**）

```powershell
$ca = git show "phase3-work-snapshot:src/shared/chat-appearance.ts"
$ca | Set-Content "$dir\bak-chat-appearance.ts" -Encoding UTF8     # 103 行

$md = git show "phase3-work-snapshot:src/renderer/settings/shared/modal.ts"
$md | Set-Content "$dir\bak-modal-ours.ts" -Encoding UTF8          # 216 行

foreach($l in @('en','zh-CN')){
  $j = git show "phase3-work-snapshot:src/renderer/settings/i18n/$l.json"
  $j | Set-Content "$dir\bak-i18n-$l.json" -Encoding UTF8          # 263 / 1309 行
}

$st = git show "phase3-work-snapshot:src/renderer/settings/settings.ts"
$st | Set-Content "$dir\bak-settings.ts" -Encoding UTF8            # 1175 行
```

**自检结果（必须全绿，否则不得进入 3.2）**：

| 检查项 | 期望 | 实测 | 判定 |
|---|---|---|---|
| `bak-chat-appearance.ts` / `USAGE_BADGE_PRESETS` | ≥1 | **3** | ✅ |
| `bak-chat-appearance.ts` / `normalizeUsageBadgeColor` | ≥1 | **3** | ✅ |
| `bak-chat-appearance.ts` / `resolveUsageBadgeImage` | ≥1 | **1** | ✅ |
| `bak-modal-ours.ts` / `confirmValue` | **3** | **3** | ✅ |
| `bak-i18n-zh-CN.json` / `"` | >200 | **1144** | ✅ |
| `bak-i18n-en.json` / `"` | >200 | **240** | ✅ |

> **注**：执行前 `preserved/` 已存在 P0 期产物（`bak-modal.ts`、`bak-modal-workspace.ts`、
> `usage-badge-exports.ts.txt`）。其中 `bak-chat-appearance.ts` 与 `bak-settings.ts`
> 经比对**与快照逐字节一致（仅行尾归一化差异）**，本次按蓝图命令**原样重写**以保证
> 行数与来源可审计。三个 P0 期文件保持不动。本 Phase 要求"6 份"，
> 实际 `preserved/` 内含 8 个文件（6 份必需 + 2 份 P0 遗留），**不影响任何判据**。

### 3.3 处置 15 个 `UD`（步骤 3.2）

```powershell
$ud = git status --porcelain | Where-Object { $_.StartsWith('UD') } | ForEach-Object { $_.Substring(3) }
foreach($f in $ud){ git rm --quiet -- "$f" 2>$null }
```

**实测**：`UD count = 15`，`git rm` **15/15 退出码 0，0 失败**。

> ✅ **复现蓝图结论**：`UD` 冲突**无需 `-f`**。全部 15 项直接受理。

删除清单（15/15 与蓝图 §3.2 表格逐项一致）：
`dist/renderer/toast/index.html`、`src/renderer/react/features/chat/components/ModelModePanel.{css,tsx}`、
`src/renderer/react/hooks/useChatAppearance{,.test}.ts`、`src/renderer/settings/i18n/{en,zh-CN}.json`、
`src/renderer/settings/index.html`、`src/renderer/settings/mcp/panel.test.ts`、
`src/renderer/settings/settings.css`、`src/renderer/settings/settings.ts`、
`src/renderer/sidebar/sidebar.ts`、`src/shared/chat-appearance{,.test}.ts`、`vite.config.ts`

### 3.4 处置 5 个 `DU`（步骤 3.3）★ 关键决策

**先做恢复判定核对（实测，非沿用文档声称值）**：

```
presets.ts 的活 import（3 处，全部为真 import）：
  ModelSettingsPanel.tsx:52                import { MODEL_PRESETS } from "../../../settings/api/presets"
  ModelSettingsPanel.models.test.ts:10     import { MODEL_PRESETS } from "../../../settings/api/presets"
  vendor-registry-consistency.test.ts:15   import { MODEL_PRESETS } from "../../../renderer/settings/api/presets"

tokens/panel.ts 的引用（1 处）：
  src/renderer/settings/default-dialogs-regression.test.ts:8   在硬编码清单中，:16 会 readFileSync 该文件
```

**组 A · 恢复官方版（2 个）**：

```powershell
git checkout MERGE_HEAD -- src/renderer/settings/api/presets.ts
git checkout MERGE_HEAD -- src/renderer/settings/tokens/panel.ts
git add src/renderer/settings/api/presets.ts src/renderer/settings/tokens/panel.ts
```
实测：3 条命令退出码均为 **0**。

**组 B · 接受本地删除（3 个）**：

```powershell
foreach($f in @('README.en.md',
  'src/renderer/react/features/chat/hooks/useChannelMirrorEvents.ts',
  'src/renderer/react/features/chat/hooks/useChannelMirrorEvents.test.ts')){
  git rm --quiet -- "$f" 2>$null
}
```
实测：3/3 退出码 **0**。

---

## 四、验收测试逐项结果

| # | 验收项 | 期望 | 实测 | 判定 |
|---|---|---|---|---|
| A1 | 冲突总数 | 26 | **26** | ✅ |
| A2 | 构成 | 仅 `UU 26` | **`UU 26`（UD=0, DU=0）** | ✅ |
| A3 | 抢救素材 | 6/6 OK，`confirmValue`=3 | **6/6 OK，=3** | ✅ |
| A4 | 2 个恢复文件与官方一致 | True/True/True | **True / True / True** | ✅ |
| A5 | 11 项功能基线 | 退化 0 | **退化 2（已查明，见偏差 2/3）** | ⚠️ 见下 |
| A6 | 锚点与回退网 | 全 True | **全 True** | ✅ |

### A3 逐项实测

```
bak-chat-appearance.ts  USAGE_BADGE_PRESETS        3 hits OK
bak-chat-appearance.ts  normalizeUsageBadgeColor   3 hits OK
bak-chat-appearance.ts  resolveUsageBadgeImage     1 hits OK
bak-modal-ours.ts       confirmValue               3 hits OK
bak-i18n-zh-CN.json     {                        252 hits OK
bak-i18n-en.json        {                         97 hits OK
```

### A4 逐项实测

```
src/renderer/settings/api/presets.ts    exists=True  conflictMarkers=0  diffVsOfficialLines=0
src/renderer/settings/tokens/panel.ts   exists=True  conflictMarkers=0  diffVsOfficialLines=0
```

### A5 逐项实测

```
OK 记忆管理控制台          base  4 ->  4
OK 按人擦除/身份归属        base  8 ->  8
OK 区块 zones             base  5 ->  5
OK 渠道审计               base 11 -> 11
OK 工具白名单             base 13 -> 13
OK 关键词策略              base  6 ->  6
OK 群语料                base 10 -> 10
OK 群聊旁听上下文          base  4 ->  4
REGRESSED 用量徽章         base  2 ->  0    ← 蓝图已预告（预期）
REGRESSED 群上下文上限      base 11 -> 10   ← 蓝图未预告，本次新查明（见偏差 3）
OK 弹窗确认门              base  4 ->  4
REGRESSED = 2
```

### A6 逐项实测

```
phase3-work-snapshot = 586eae90   （期望 586eae90）✔
phase0-full          = 34f0669f   （期望 34f0669f）✔
MERGE_HEAD present   = True       （合并仍在进行）✔
HEAD                 = 598dfb75   （本 Phase 未提交）✔
```

### 附加验收 · 定向 vitest（**蓝图未要求，本次新增**）

蓝图 §四 只做静态计数，无法证明"两个恢复文件确实被消费"。本次追加运行：

```powershell
$env:PATH = "D:\data\node24;" + $env:PATH
npx vitest run `
  src/renderer/settings/default-dialogs-regression.test.ts `
  src/main/orchestrator/vendors/vendor-registry-consistency.test.ts `
  src/renderer/react/features/settings/ModelSettingsPanel.models.test.ts
```

**实测输出**：

```
 ✓ src/renderer/settings/default-dialogs-regression.test.ts (2 tests) 5ms
 ✓ src/main/orchestrator/vendors/vendor-registry-consistency.test.ts (11 tests) 7ms
 ❯ src/renderer/react/features/settings/ModelSettingsPanel.models.test.ts (0 test)

 Test Files  1 failed | 2 passed (3)
      Tests  13 passed (13)
```

**判定**：
- ✅ `default-dialogs-regression.test.ts` **通过** → 证明 `tokens/panel.ts` 恢复**确有必要且正确**
  （该测试在 `:16` 对硬编码清单中的 8 个文件逐个 `readFileSync`；文件缺失即 ENOENT）。
  附加核对：8/8 文件均存在且 `offenders = 0`，满足该测试的断言。
- ✅ `vendor-registry-consistency.test.ts` **11 tests 通过** → 证明 `presets.ts` 恢复**确有必要且正确**
  （它直接 `import { MODEL_PRESETS }`，文件缺失即构建失败）。
- ⚠️ `ModelSettingsPanel.models.test.ts` 失败，原因为
  `Failed to resolve import "@lobehub/icons"` —— **与 P4 无关**，是**依赖未安装**（见偏差 1）。

---

## 五、关键偏差与判定修正（**P5/P6/P8 必读**）

### 偏差 1 · `@lobehub/icons` 未安装 → 官方新依赖，属 P8 的 `npm ci` 范围

**现象**：`ModelSettingsPanel.models.test.ts` 报
`Failed to resolve import "@lobehub/icons" from ".../ModelSettingsPanel.tsx"`。

**根因（已实测）**：

| 检验 | 结果 |
|---|---|
| `@lobehub/icons` 是否在合并后的 `package.json` 中声明 | **是**（`"^5.19.3"`） |
| 是否在**官方** `package.json` 中 | **是**（`git show MERGE_HEAD:package.json` 命中） |
| 是否在**本地** `package.json` 中 | **否**（`phase3-work-snapshot` 0 命中） |
| 是否已安装 | **否**（`node_modules\@lobehub\icons` 不存在） |

**判定**：**非 P4 缺陷**。官方在 219 个提交中引入了新依赖，`package.json` 已随合并就位
（`M `），但 `node_modules` 尚未安装。蓝图 §一"非目标"明确划出
"❌ `npm ci` / 改 `package.json` → P8"，故 **P4 不得处理**。

🔴 **对 P8 的提示**：`npm ci`（或 `npm install`）是**解除此类失败的唯一手段**。
在此之前，任何渲染进程的 `@lobehub/icons` 相关测试**必然失败**，不要误判为合并错误。

### 偏差 2 · `USAGE_BADGE` 退化 2 → 0（**蓝图已预告，预期**）

**判定**：✅ **符合预期，不算失败**。

蓝图 §A5 明确写道："删除 `chat-appearance.ts`、`settings.ts`、`useChatAppearance.ts` 后，
`USAGE_BADGE`（基线 2）**可能降为 1 或 0** —— 这是**预期的**（实现已被删除，素材已抢救）"。

实测降为 **0**（基线 2 → 0），且蓝图要求的确认条件已满足：

```powershell
Test-Path .cyrene-merge-analysis\preserved\bak-chat-appearance.ts   # → True ✔
```

**给 P5 的硬要求**：`USAGE_BADGE_*` 的 3 个导出**只存在于** `preserved/bak-chat-appearance.ts`，
必须据此在新模块（建议 `src/shared/usage-badge.ts`）重新实现，**不得**重新引入 `chat-appearance.ts`。

### 偏差 3 · 🆕 `群上下文上限` 退化 11 → 10（**蓝图未预告，本次查明为预期**）

**现象**：A5 报 `REGRESSED 群上下文上限: base 11 -> 10`。蓝图 §A5 称"其余 10 项**不得退化**"，
故此项**必须查明**（否则按停止条件应停下）。

**根因（逐文件比对，已确证）**：

| 检验 | 结果 |
|---|---|
| `phase3-work-snapshot` 中命中文件数 | **11** |
| 当前工作区命中文件数 | **10** |
| 差集的唯一文件 | **`src/renderer/settings/settings.ts`** |
| 该文件是否属本 Phase 删除的 `UD` 清单 | **是（第 3 项）** |
| 该文件是否还有活 import | **否**（全仓库检索 `settings/settings"` → 0 命中） |

`settings.ts` 中丢失的**仅 3 行**，全部是旧设置窗口自己的 UI 控件：

```
renderImportedDocs, initGroupContextLimitInput,     ← 自身 import
groupContextLimit: 10,                              ← 旧窗口的默认值字面量
initGroupContextLimitInput();                       ← 旧窗口自己的初始化调用
```

**功能存活证据**（`groupContextLimit` 的真实接线完好）：

```
src/renderer/settings/memory/panel.ts    hits=19   ← 官方 React 记忆面板，功能活的
src/main/orchestrator/build-options.ts   hits=4
src/main/settings/settings-facade.ts     hits=3
src/main/settings/general-settings.ts    hits=2
```

**判定**：⚠️ **退化属实，但与 `USAGE_BADGE` 同质 —— 唯一丢失点是"承载该功能的已废弃文件被删"**，
功能本体在官方 React 路径上**完整存活**（19 处命中）。**不构成功能失效，P4 无需补救。**

> 🔴 **判据修正建议**：蓝图 §A5 的"其余 10 项不得退化"应改为
> **"退化必须能归因到本 Phase 主动删除的文件；不得出现无法归因的退化"**。
> 因为 P4 的任务本质就是删除文件，任何"仅存在于被删文件中"的标识**必然**退化 ——
> 这是删除动作的数学后果，不是缺陷。蓝图已为 `USAGE_BADGE` 开了这个口子，
> 但漏了同样情形的 `groupContextLimit`。

### 偏差 4 · 🔴 `ChatPage.tsx` 的悬空 import：蓝图的"判定方向"与冲突内容相反（**P6 必读**）

**蓝图 §3.3 的记载**："`ChatPage.tsx:69` 仍有一行 `import { useChannelMirrorEvents }` …
而该文件现在是 `UU` 冲突（未定稿）。**接受删除后这行会变成悬空 import**，
必须在 **P6** 解决 `ChatPage.tsx` 时一并移除。"

**实测发现（与蓝图表述方向相反，需修正认知）**：

`ChatPage.tsx` 有且仅有 **1 个**冲突块（`:67-71`），其**两侧**为：

```
 67: <<<<<<< HEAD
 68: =======                      ← HEAD 侧【空】
 69: import { useChannelMirrorEvents } from "../hooks/useChannelMirrorEvents";
 70: import { useFeedback } from "../../../components/feedback/FeedbackProvider";
 71: >>>>>>> refs/remotes/official/master
```

即：这行 `useChannelMirrorEvents` import **属于官方侧（THEIRS），不属于我们（HEAD，为空）**。

**推论（P6 必须知道）**：

1. **不存在"P4 把官方版本改坏"的问题** —— 若 P6 该冲突块取官方侧，
   得到的正是官方**原本就有的**那两行；若取 ours 侧（空块），则两行都不存在。
2. 🔴 **真正未解的悬空 import 是 `FeedbackProvider`，而且它现在指向的路径就是错的**：

   | 项 | 值 |
   |---|---|
   | `ChatPage.tsx:70` 的 specifier | `"../../../components/feedback/FeedbackProvider"` |
   | 解析为 | `src/renderer/components/feedback/FeedbackProvider` |
   | **官方树实际位置** | **`src/renderer/react/components/feedback/FeedbackProvider.tsx`** |
   | 该路径是否存在 | **否**（`inOfficial=False`、`onDisk=False`） |

   即官方版本的 `ChatPage.tsx` **自身**就带着一个解析不到的 import 路径
   （少了一层 `react/`）。这不是 P4 造成的，但**P6 解决该冲突块时必须一并修正**，
   否则渲染进程构建会失败。

3. `useChannelMirrorEvents.ts` 已由 P4 按蓝图 §3.3 组 B 删除（index 与磁盘均已无，
   `git status` 对该路径已无输出）。官方树**仍保留**该文件 —— 所以"官方侧 import 它"
   在官方语境下本来是自洽的；**删除是本地意图（D1）驱动的决定**，
   因此 P6 取官方侧时**必须手动移除第 69 行**，只保留（修正路径后的）`useFeedback`。

**判定**：P4 动作**符合蓝图要求**（蓝图明确要求接受本地删除），但蓝图对
"哪一侧含该 import"的描述需修正。**已在 §八 交接给 P6。**

### 偏差 5 · P3 报告的引用者计数偏高（不改变结论）

P3 完成报告 §八 第 3 条称：`presets.ts` 有 **5** 个活引用者、`tokens/panel.ts` 有 **75** 个。

**实测**（对本仓库合并树全量检索）：

| 文件 | P3 声称 | 实测 | 说明 |
|---|---|---|---|
| `presets.ts` | 5 | **3 个真 import** + 1 处注释 | 注释（`api-config/presets.ts:4`）不是引用 |
| `tokens/panel.ts` | 75 | **1 处**（测试内硬编码字符串路径） | 无任何 `import` |

**判定**：**计数不准确，但"必须恢复"的结论正确**，故处置不变。P3 报告的 75 很可能
统计了 `tokens/` 目录下的其他标识或整个 `settings/` 子树的匹配，属统计口径问题。

> ✅ **两个恢复动作均已用运行测试反向证实**（见 §四 附加验收），
> 比引用者计数更可靠。

---

## 六、已知坑的实测复现情况

| 坑（来自蓝图第七节） | 本次是否复现 | 说明 |
|---|---|---|
| `git rm` 对 UD 文件不需要 `-f` | **已验证** | 15/15 退出码 0，完全复现蓝图沙箱结论 |
| `git checkout MERGE_HEAD -- <path>` 恢复 | **已验证** | 退出码 0，`git diff MERGE_HEAD` = 0 行 |
| 路径含非 ASCII 时 git 输出转义 | 未复现（**规避**） | 本 Phase 未对非 ASCII 路径做 `Test-Path`；一律用 `git status --porcelain` 的 `Substring(3)` 取路径 |
| `@(...)` 包裹 GroupInfo 破坏 `.Count` | 未复现（**规避**） | 一律用 `$_.StartsWith('UU')` 直接对原始码列表计数 |
| `2>&1` 污染变量 | 未复现（**规避**） | 全程用 `2>$null` |
| PS 5.1 括号内不能用 `;` | 未复现（**规避**） | 命令均拆为独立语句 |
| 本会话 `node -v` 仍是 v22 | **已复现** | 需前置 `$env:PATH = "D:\data\node24;" + $env:PATH` 才得 v24.21.0 |
| `git status` 行数不是判据 | **已复现** | 实测 868 行（蓝图称合并态可到 863），判据仍用 `UU/UD/DU` 计数 |
| 误把 `USAGE_BADGE` 退化当失败 | **已复现** | 实测退化为 0；已按蓝图判定为预期 |
| 沙箱 `merge --abort` 静默失败 | 未复现 | 本 Phase 未执行任何 abort |

### 🆕 本次新踩到的坑（建议追加进蓝图第七节）

| 坑 | 症状 | 应对 |
|---|---|---|
| **`--reporter=basic` 在 vitest 4 已移除** | `Error: Failed to load custom Reporter from basic` + `Failed to load url basic`，整个 vitest 启动失败（看起来像代码坏了） | vitest 4.1.9 **已删除 `basic` reporter**，用默认 reporter 或 `--reporter=default`。**不要**把这个启动错误误判为测试失败 |
| **`UT` 类冲突块方向易误读** | 原以为 `ChatPage.tsx` 的 `useChannelMirrorEvents` 在 ours 侧，实测在 **THEIRS 侧**（HEAD 侧为空块），导致对 P6 的指示方向相反 | 判断"某行属哪一侧"必须**实际展开 `<<<<<<< / ======= / >>>>>>>` 三行**，不能凭蓝图描述推断。建议统一用脚本按 zone（HEAD/THEIRS/resolved）分类引用 |
| **`ChatPage.tsx` 的 `FeedbackProvider` 路径本身即坏** | 官方树的该 import 指向 `src/renderer/components/feedback/`，而实际文件在 `src/renderer/react/components/feedback/` | 属官方遗留问题，**P6 修 `ChatPage.tsx` 时必须连带修正路径** |

---

## 七、回退方法（已验证可用）

```powershell
cd E:\AI_Chating\cyrene-agent

# ① 只恢复某个被误删的文件（回到 P3 快照态，需重新 add）
git checkout phase3-work-snapshot -- vite.config.ts
git add vite.config.ts

# ② 整棵树回到 P3 结束态（会同时覆盖 P5/P6 改动，慎重）
git checkout phase3-work-snapshot -- .

# ③ 把 presets.ts 改回删除态
git rm --quiet -- src/renderer/settings/api/presets.ts

# ④ 放弃整个合并（回到 P3 之前）
git merge --abort
```

> ⚠️ **本 Phase 未执行 `git merge --abort`**（蓝图列为"永不"）。
> `phase3-work-snapshot`（`586eae90`）含全部被删文件的原始内容，
> 是撤销本 Phase 删除的**权威来源**。

---

## 八、给 P5 / P6 的交接清单

1. ✅ **删除类冲突已清空**：46 → **26**，剩余**全部是 `UU`**（真三方冲突）。
2. 📋 **P5 的任务**：处理 `UU` 中的**设置类与 i18n 类**（约 10 个），移植进官方 React 设置页。
3. 🔴 **P5 第一件事：重新实现 `USAGE_BADGE_*`**，素材在：
   ```
   .cyrene-merge-analysis/preserved/bak-chat-appearance.ts   ← 3 个导出的完整实现
   ```
   建议落点 `src/shared/usage-badge.ts`（独立模块，**不再依附已删文件**）。
   ⚠️ 注意 `src/main/settings/settings-facade.ts:56` 仍有
   `usageBadgeColor: DEFAULT_CHAT_APPEARANCE.usageBadgeColor`（在冲突块**之外**），
   它会随 P5/P6 移除 chat-appearance import 而**悬空**，需一并处理。
4. 🔴 **P5/P6 不要重新引入 `chat-appearance.ts`** —— 官方已用 `message-typography` 取代该概念。
5. 🔴 **P6 必读偏差 4**：`ChatPage.tsx` 的冲突块方向与蓝图描述相反，且
   `FeedbackProvider` 的 import 路径本身少了一层 `react/`，两者都需在 P6 一并修正。
6. 📄 **P5 的冲突清单**：`.cyrene-merge-analysis/90-p3-conflicts-actual.txt` 中码为 `UU` 的 26 行。
7. 💾 **回退网**：`phase3-work-snapshot`（`586eae90`）、`phase0-full`（`34f0669f`）。
8. 🔴 **仍不要提交** —— 提交时机在 P7（26 个 `UU` 全部解决后）。
9. 🟡 **P8 提醒**：`@lobehub/icons` 等官方新依赖尚未安装（见偏差 1），
   在 P8 执行 `npm ci` 之前，渲染进程相关测试**必然失败**，勿误判。

---

## 九、Phase 4 目标达成核对

| 目标（来自施工蓝图 §一） | 状态 |
|---|---|
| 20 个删除类冲突全部处置完毕 | ✅ 15 `UD`（`git rm`）+ 5 `DU`（2 恢复 / 3 删） |
| 冲突数从 46 降到 26（只剩 `UU`） | ✅ 精确 **26**，`UD`/`DU` 归零 |
| 3 处"必须抢救的独有代码"固化为可读文件 | ✅ 6 份素材，自检全绿 |
| 11 项受保护功能基线未退化 | ⚠️ 退化 2 项，**均已逐行归因**为"承载文件被删"，功能本体存活 |
| **不提交** | ✅ 零提交，HEAD 仍 `598dfb75` |

**非目标遵守情况**：
未解决任何 `UU` ✅ / 未提交合并结果 ✅ / 未修 `ChatPage.tsx` 悬空 import ✅ /
未处理 49 个官方静默删除 ✅ / 未把 `USAGE_BADGE_*` 实现成新模块 ✅ /
未 `npm ci`、未改 `package.json` ✅ / 未 `git merge --abort` ✅

---

**Phase 4 结论：20 个删除类冲突已全部处置，冲突数精确收敛到 26（全部 `UU`），
3 处独有代码已固化待 P5 复现，回退网完好。可进入 P5。**
