# Phase 4 施工蓝图：处理删除类冲突（Tier A）

> **执行者**：agent。本文件自包含，不需要对话历史即可执行。
> **风险等级**：**低**（只做删除与恢复，不改业务逻辑）
> **预计耗时**：15–25 分钟
> **文档规范**：见 [BLUEPRINT-总蓝图.md](BLUEPRINT-总蓝图.md) 第七节
> **前置**：P3 已完成，**合并仍处于暂停状态**（`MERGE_HEAD` 存在）

---

## 一、施工目标

### 核心问题

P3 把 46 个冲突收敛成精确的三类。其中 **20 个是"删除类冲突"** ——
不涉及代码逻辑合并，只涉及"这个文件该不该存在"。

| porcelain 码 | 含义 | 数量 | 本 Phase 任务 |
|---|---|---|---|
| `UU` | 双方都改（真三方冲突） | 26 | ❌ **不在本 Phase**（P5/P6） |
| `UD` | 官方删 / 本地改 | **15** | ✅ 本 Phase |
| `DU` | 本地删 / 官方改 | **5** | ✅ 本 Phase |

### 目标

- [ ] 20 个删除类冲突全部处置完毕
- [ ] **冲突数从 46 降到 26**（只剩 `UU`）
- [ ] 3 处"必须抢救的独有代码"已固化到 `.cyrene-merge-analysis/preserved/`
- [ ] 11 项受保护功能基线未退化
- [ ] **不提交**（提交时机在 P7）

### 非目标（明确不做）

| 不做 | 为什么 | 何时做 |
|---|---|---|
| ❌ 解决任何 `UU` 冲突 | P5/P6 的职责 | P5/P6 |
| ❌ 提交合并结果 | 冲突未解决完 | P7 之后 |
| ❌ 修复 `ChatPage.tsx` 的悬空 import | 它是 `UU`，属 P5/P6 | **P6（已记录）** |
| ❌ 处理 49 个"官方静默删除" | 不在 46 冲突内，且本地从未触碰（P3 偏差 3 已验） | 见 §三.4 的说明 |
| ❌ 把 `USAGE_BADGE_*` 实现成新模块 | 只固化素材，实现是 P5 的事 | P5 |
| ❌ `npm ci` / 改 `package.json` | P8 | P8 |
| ❌ `git merge --abort` | 会丢弃 P3 成果 | 永不（除非放弃合并） |

---

## 二、前置条件与停止条件

### 前置条件（不满足则**不得开始**）

```powershell
cd E:\AI_Chating\cyrene-agent
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# 前置 1：合并必须仍在进行中
Test-Path .git\MERGE_HEAD                       # 期望 True
git rev-parse --short HEAD                      # 期望 598dfb75
git rev-parse --short MERGE_HEAD                # 期望 b11b8851

# 前置 2：冲突数必须是精确的 46
$c = git status --porcelain
($c | Where-Object { $_ -match '^(UU|UD|DU)$' } | Measure-Object).Count   # 期望 46

# 前置 3：构成必须是 26/15/5
foreach($k in @('UU','UD','DU')){ "$k = $(($c | Where-Object { $_ -match "^$k" } | Measure-Object).Count)" }
#   期望 UU = 26 / UD = 15 / DU = 5

# 前置 4：权威清单必须存在且为 46 行
(Get-Content .cyrene-merge-analysis\90-p3-conflicts-actual.txt -Encoding UTF8).Count   # 期望 46

# 前置 5：回退网必须可用
git rev-parse --short phase3-work-snapshot      # 期望 586eae90
git rev-parse --short phase0-full               # 期望 34f0669f
```

### 停止条件（出现则**立即停止并报告**，不要自行绕过）

| 情况 | 为什么必须停 |
|---|---|
| `MERGE_HEAD` 不存在 | 合并已被 abort，P3 成果丢失 → 需重跑 P3 |
| 冲突数不是 46 | 有人在 P3 之后动过工作区 |
| 构成不是 26/15/5 | 基线漂移，需重新核对 |
| `phase3-work-snapshot` 标签缺失 | 抢救素材的唯一可靠来源，不可缺 |
| 删除后冲突数**不是 26** | 处置有误，立即 `git checkout` 恢复该文件 |

---

## 三、改动清单（Agent 直接执行）

### 3.1 ★ 抢救：先固化 3 处独有代码（**必须最先做**）

**为什么必须先做**：`UD` 清单里的文件包含**官方没有、只有你写过**的代码。
执行 3.2 的删除后，这些实现将只存在于 `phase3-work-snapshot` 标签里。
**先抽取成可读文件，P5 才能直接用。**

```powershell
cd E:\AI_Chating\cyrene-agent
$dir = ".cyrene-merge-analysis\preserved"
New-Item -ItemType Directory -Force -Path $dir | Out-Null

# ① USAGE_BADGE 全套实现（在被删文件里，官方完全没有）
$ca = git show "phase3-work-snapshot:src/shared/chat-appearance.ts"
$ca | Set-Content "$dir\bak-chat-appearance.ts" -Encoding UTF8
Write-Output "① bak-chat-appearance.ts : $($ca.Count) 行"

# ② confirmValue 的完整实现（在被删文件 modal.ts 的不冲突区域）
$md = git show "phase3-work-snapshot:src/renderer/settings/shared/modal.ts"
$md | Set-Content "$dir\bak-modal-ours.ts" -Encoding UTF8
Write-Output "② bak-modal-ours.ts : $($md.Count) 行"

# ③ 旧设置窗口的 i18n 键（263 + 274 个，最有复用价值）
foreach($l in @('en','zh-CN')){
  $j = git show "phase3-work-snapshot:src/renderer/settings/i18n/$l.json"
  $j | Set-Content "$dir\bak-i18n-$l.json" -Encoding UTF8
  Write-Output "③ bak-i18n-$l.json : $($j.Count) 行"
}

# ④ usageBadge 的 UI 接线（在 settings.ts 里，供 P5 参考落点）
$st = git show "phase3-work-snapshot:src/renderer/settings/settings.ts"
$st | Set-Content "$dir\bak-settings.ts" -Encoding UTF8
Write-Output "④ bak-settings.ts : $($st.Count) 行"
```

**自检（必须全绿，否则不得进入 3.2）**：

```powershell
# USAGE_BADGE 的 3 个导出必须在
(Select-String -Path "$dir\bak-chat-appearance.ts" -Pattern 'USAGE_BADGE_PRESETS').Count        # 期望 ≥1
(Select-String -Path "$dir\bak-chat-appearance.ts" -Pattern 'normalizeUsageBadgeColor').Count   # 期望 ≥1
(Select-String -Path "$dir\bak-chat-appearance.ts" -Pattern 'resolveUsageBadgeImage').Count     # 期望 ≥1
# confirmValue 必须在（期望 3 处）
(Select-String -Path "$dir\bak-modal-ours.ts" -Pattern 'confirmValue').Count                     # 期望 3
# i18n 键必须在
(Select-String -Path "$dir\bak-i18n-zh-CN.json" -Pattern '"').Count                              # 期望 >200
```

> **权威依据**：`git show ":2:<path>"` 是"ours"的 git 权威视图。
> 实测 `modal.ts` stage 2 = **216 行，含 `confirmValue` 3 处**；
> 官方 stage 3 = 477 行，**0 处**。→ `confirmValue` 确实是你的独有能力。

### 3.2 处置 15 个 `UD`（官方删 / 本地改）

**统一动作：全部接受官方删除**（`git rm`）。依据逐项如下。

```powershell
cd E:\AI_Chating\cyrene-agent

# 接受官方删除（对本类 15 个文件全部执行）
$ud = git status --porcelain |
  Where-Object { $_ -match '^UD' } |
  ForEach-Object { $_.Substring(3) }

foreach($f in $ud){
  git rm --quiet -- "$f"
  Write-Output "removed: $f"
}
```

> ✅ **沙箱实测**：`git rm` **无需 `-f`**（退出码 0）。`-f` 也能用，但没必要 —— git 把
> `UD` 冲突视为"待解决的删除"，`rm` 直接受理。

**逐项依据（已实测，非推断）**：

| # | 文件 | 残留引用者 | 处置依据 |
|---|---|---|---|
| 1 | `vite.config.ts` | — | 官方重命名为 `vite.config.mts`。**且它会静默遮蔽 `.mts`**（Vite 取第一个匹配就停）→ **必须删** |
| 2 | `src/renderer/settings/index.html` | 0 | 旧设置窗口入口，官方已 React 化 |
| 3 | `src/renderer/settings/settings.ts` | 0（唯一命中是**注释**+`window.settings` 全局，非 import） | 同上。⚠️ 抢救见 3.1④ |
| 4 | `src/renderer/settings/settings.css` | 0 | 同上 |
| 5 | `src/renderer/settings/i18n/en.json` | 0 | 官方 i18n 收敛到 `react/i18n`。⚠️ 抢救见 3.1③ |
| 6 | `src/renderer/settings/i18n/zh-CN.json` | 0 | 同上 |
| 7 | `src/renderer/settings/mcp/panel.test.ts` | 0 | MCP 页已迁 React（`1a8c6f78`） |
| 8 | `src/renderer/sidebar/sidebar.ts` | 0 | 旧 HTML 侧栏窗口已下线 |
| 9 | `src/renderer/react/hooks/useChatAppearance.ts` | 0 | 被 `src/shared/message-typography.ts` 取代 |
| 10 | `src/renderer/react/hooks/useChatAppearance.test.ts` | 0 | 同上 |
| 11 | `src/renderer/react/features/chat/components/ModelModePanel.tsx` | 0 | 面板迁至 `react/features/settings/*SettingsPanel.tsx` |
| 12 | `src/renderer/react/features/chat/components/ModelModePanel.css` | 0 | 同上 |
| 13 | `src/shared/chat-appearance.ts` | 0 | 被 `message-typography` 取代。⚠️ **抢救见 3.1①** |
| 14 | `src/shared/chat-appearance.test.ts` | 0 | 同上 |
| 15 | `dist/renderer/toast/index.html` | — | 构建产物。官方已 `d83a3d3b` 取消跟踪并加进 `.gitignore` → 接受删除 |

> **判据说明**：表中"残留引用者 = 0"是**实测值**（对本仓库合并树全量检索）。
> 判据是"**有无活 import**"（注释里的文件名不算引用）。
> `settings.ts` 那一项唯一的命中是 `ApiConfigSection.tsx:4` 的注释与 `:126` 的 `window.settings` 全局，
> **不是 import** → 删除安全。

### 3.3 处置 5 个 `DU`（本地删 / 官方改）★ 本 Phase 最关键决策

**这不是机械删除** —— 需要判断"官方是否有活引用者"。

**先做抢救判定核对**（防 3.1 遗漏）：

```powershell
# presets.ts 的官方引用者（决定必须恢复）
Select-String -Path "src\renderer\react\features\settings\ModelSettingsPanel.tsx" -Pattern 'settings/api/presets'
Select-String -Path "src\main\orchestrator\vendors\vendor-registry-consistency.test.ts" -Pattern 'settings/api/presets'
```

**分两组处置**：

#### 组 A · **必须恢复官方版**（2 个）

```powershell
cd E:\AI_Chating\cyrene-agent

# 恢复官方版（MERGE_HEAD = 官方 b11b8851）
git checkout MERGE_HEAD -- src/renderer/settings/api/presets.ts
git checkout MERGE_HEAD -- src/renderer/settings/tokens/panel.ts
git add src/renderer/settings/api/presets.ts src/renderer/settings/tokens/panel.ts
```

| 文件 | 为什么必须恢复 | 实测证据 |
|---|---|---|
| `src/renderer/settings/api/presets.ts` | 官方有 **3 个活 import** | `ModelSettingsPanel.tsx:52`、`ModelSettingsPanel.models.test.ts:10`、`vendor-registry-consistency.test.ts:15` —— **全部 `import { MODEL_PRESETS } from "../../../settings/api/presets"`**。不恢复 → **构建直接失败** |
| `src/renderer/settings/tokens/panel.ts` | 官方 `default-dialogs-regression.test.ts` 引用它 | 不恢复 → 测试失败 |

> ⚠️ **这是本 Phase 最容易搞错的地方**：你当初删掉这两个文件是对的（旧设置窗口死了），
> 但**官方把 `presets.ts` 复用到了新的 React 设置页**，所以它在新架构里是**活的**。
> P0 报告与 P3 报告都独立确认了这一点。

#### 组 B · **接受本地删除**（3 个）

```powershell
cd E:\AI_Chating\cyrene-agent

$duAccept = @(
  'README.en.md',
  'src/renderer/react/features/chat/hooks/useChannelMirrorEvents.ts',
  'src/renderer/react/features/chat/hooks/useChannelMirrorEvents.test.ts'
)
foreach($f in $duAccept){
  git rm --quiet -- "$f"
  Write-Output "removed (accord with local): $f"
}
```

| 文件 | 依据 |
|---|---|
| `README.en.md` | 官方新增 `README.en.md`？**不** —— 你删了它、官方改过它。项目只保留中文 README，删除符合本地意图 |
| `useChannelMirrorEvents.ts` | 你的决定 D1（桌面对话绑定彻底删除）已移除其数据源。官方保留该 hook，但它依赖的绑定查询已被你删除 |
| `useChannelMirrorEvents.test.ts` | 同上 |

> 🔴 **遗留问题（不在本 Phase 修复，已登记给 P6）**：
> `src/renderer/react/features/chat/pages/ChatPage.tsx:69` 仍有一行
> `import { useChannelMirrorEvents } from "../hooks/useChannelMirrorEvents";`
> 而该文件现在是 `UU` 冲突（未定稿）。**接受删除后这行会变成悬空 import**，
> 必须在 **P6** 解决 `ChatPage.tsx` 时一并移除。

---

## 四、验收测试

### A1 · 冲突数必须精确等于 26

```powershell
cd E:\AI_Chating\cyrene-agent
(git status --porcelain | Where-Object { $_ -match '^(UU|UD|DU)$' } | Measure-Object).Count
```
**期望**：`26`
**失败处置**：不是 26 → 停止。用 `git status --porcelain` 找出残留的 `UD`/`DU`，逐个核对。

### A2 · 剩余冲突必须全部是 `UU`

```powershell
git status --porcelain |
  Where-Object { $_ -match '^(UU|UD|DU)$' } |
  ForEach-Object { $_.Substring(0,2) } | Group-Object | Select-Object Name,Count
```
**期望**：只有 `UU 26`，**没有 `UD`/`DU`**

### A3 · 抢救素材完整

```powershell
$dir = ".cyrene-merge-analysis\preserved"
foreach($pair in @(
  @('bak-chat-appearance.ts','USAGE_BADGE_PRESETS'),
  @('bak-chat-appearance.ts','normalizeUsageBadgeColor'),
  @('bak-chat-appearance.ts','resolveUsageBadgeImage'),
  @('bak-modal-ours.ts','confirmValue'),
  @('bak-i18n-zh-CN.json','{'),
  @('bak-i18n-en.json','{')
)){
  $n = (Select-String -Path "$dir\$($pair[0])" -Pattern $pair[1] -SimpleMatch).Count
  Write-Output ("{0,-28} {1,-26} {2} 处 {3}" -f $pair[0], $pair[1], $n, $(if($n -gt 0){'OK'}else{'MISSING'}))
}
```
**期望**：全部 `OK`，`confirmValue` = 3 处

### A4 · 两个必须恢复的文件确实恢复成官方版

```powershell
cd E:\AI_Chating\cyrene-agent
foreach($f in @('src/renderer/settings/api/presets.ts','src/renderer/settings/tokens/panel.ts')){
  Write-Output "--- $f ---"
  Write-Output "  存在: $(Test-Path $f)"
  Write-Output "  无冲突标记: $((Select-String -Path $f -Pattern '^(<{7}|={7}|>{7})' | Measure-Object).Count -eq 0)"
  Write-Output "  与官方一致: $((git diff MERGE_HEAD -- $f | Measure-Object).Count -eq 0)"
}
```
**期望**：存在 = True、无冲突标记 = True、与官方一致 = True

### A5 · 11 项受保护功能基线未退化（**P3 报告要求 P4 后重跑**）

```powershell
cd E:\AI_Chating\cyrene-agent
$base = Get-Content .cyrene-merge-analysis\protected-features-baseline.json -Encoding UTF8 | ConvertFrom-Json
$regressed = 0
foreach($p in $base){
  $hits = & findstr /S /M /C:"$($p.标识)" "src\*.ts" "src\*.tsx" 2>$null
  $now = if($hits){ ($hits | Measure-Object).Count } else { 0 }
  if($now -lt $p.文件数){ $regressed++ ; Write-Output ("REGRESSED {0}: base {1} -> {2}" -f $p.功能, $p.文件数, $now) }
  else { Write-Output ("OK {0,-22} base {1,2} -> {2,2}" -f $p.功能, $p.文件数, $now) }
}
Write-Output "REGRESSED = $regressed"
```
**期望**：`REGRESSED = 0`

> ⚠️ **允许的变化**：删除 `chat-appearance.ts`、`settings.ts`、`useChatAppearance.ts` 后，
> `USAGE_BADGE`（基线 2）**可能降为 1 或 0** —— 这是**预期的**（实现已被删除，素材已抢救）。
> 若出现 `USAGE_BADGE` 退化，**不算失败**，但必须在报告中记录，并确认：
> ```powershell
> Test-Path .cyrene-merge-analysis\preserved\bak-chat-appearance.ts   # 必须 True
> ```
> 其余 10 项**不得退化**。

### A6 · 锚点与回退网仍可用

```powershell
git rev-parse --short phase3-work-snapshot    # 期望 586eae90
git rev-parse --short phase0-full             # 期望 34f0669f
Test-Path .git\MERGE_HEAD                     # 期望 True（合并仍在进行）
```

---

## 五、产出物清单

| 产出 | 验证方式 |
|---|---|
| 20 个删除类冲突处置完毕 | A1 / A2 |
| 6 份抢救素材 | A3 |
| 2 个文件恢复官方版 | A4 |
| 11 项功能基线 | A5 |
| 回退网完好 | A6 |

**交接给 P5 的状态**：
```
HEAD      = 598dfb75（未变）
MERGE_HEAD = b11b8851（合并中）
冲突      = 26（全部 UU）
抢救素材  = .cyrene-merge-analysis/preserved/（6 份）
未提交    = 是（提交在 P7 之后）
```

---

## 六、回退方法

### 6.1 撤销本 Phase 的全部删除（回到 P3 结束态）

```powershell
cd E:\AI_Chating\cyrene-agent
# 方式①：整棵树回到 P3 快照（会同时覆盖 P5/P6 的改动，慎重）
git checkout phase3-work-snapshot -- .

# 方式②：只恢复某个被误删的文件
git checkout phase3-work-snapshot -- vite.config.ts
git add vite.config.ts
```

### 6.2 撤销"恢复官方版"（把 presets.ts 改回删除态）

```powershell
git rm --quiet -- src/renderer/settings/api/presets.ts
```

### 6.3 放弃整个合并

```powershell
git merge --abort          # 回到 P3 之前（HEAD 598dfb75，工作区干净）
```

---

## 七、已知坑

| 坑 | 症状 | 应对 |
|---|---|---|
| **`git rm` 对 UD 文件不需要 `-f`** | 以为必须强制，多余的 `-f` 引起困惑 | 沙箱实测：`git rm --quiet -- <path>` **退出码 0**，直接可用。`-f` 亦可 |
| **路径含非 ASCII 时 `git` 输出转义** | `git diff --name-only` 输出 `"docs/...\346\200\273...md"` 八进制转义，喂给 `Test-Path` 抛 `Illegal characters in path` | 用 `git -c core.quotepath=false …`（**注意**：数组 splat 形态下该选项不生效，需写成独立参数）；或直接用 `90-p3-conflicts-actual.txt` 里的路径 |
| **`@(...)` 包裹 GroupInfo 破坏 `.Count`** | `@($g \| Where-Object Name -eq 'UU').Count` 恒为 1 | 直接对**原始码列表**用 `$_ -match '^UU'` 计数，不要 `Group-Object` 后再 `@()` |
| **`2>&1` 污染变量** | `git rm ... 2>&1` 把 warning 灌进管道变量 | 用 `2>$null` |
| **PS 5.1 括号内不能用 `;`** | `Missing closing ')'` | 拆成独立语句；不能用 `&&` |
| **本会话 `node -v` 仍是 v22** | 误判环境 | 本 Phase 不需要 Node。P8 才需要 → `$env:PATH = "D:\data\node24;" + $env:PATH` |
| **`git status` 行数不是判据** | 合并态下会到 863 行 | 判据是 **`UU/UD/DU` 计数**，不是 status 总行数 |
| **误把 `USAGE_BADGE` 退化当失败** | A5 报 REGRESSED | 删除承载它的文件后退化是**预期**的；只要 `preserved/bak-chat-appearance.ts` 存在即可 |
| **复现沙箱时 `merge --abort` 报错导致后续静默失败** | 沙箱里 `merge --abort` 在无合并时报错，若接着跑 `merge` 被 `2>&1 \| Out-Null` 抑制，会误以为"合并成功但 0 冲突" | 沙箱复现时**不要抑制 `git merge` 的输出**；先 `reset --hard` + `clean` 再 merge |

### ✅ 本 Phase 命令的沙箱实测结论

| 命令 | 实测结果 |
|---|---|
| `git rm --quiet -- vite.config.ts`（UD 冲突） | 退出码 **0**，文件已删除 ✔ |
| `git rm -f --quiet -- src/shared/chat-appearance.ts`（UD 冲突） | 退出码 **0** ✔ |
| `git checkout MERGE_HEAD -- src/renderer/settings/api/presets.ts` | 退出码 **0**，文件恢复 ✔ |
| 恢复后 `git diff MERGE_HEAD -- <path>` | **0 行** → 与官方逐字节一致 ✔ |
| 删除 2 个 + 恢复 1 个后 | 冲突 `UU=26 UD=13 DU=4` ✔ 计数正确递减 |

---

## 八、给 P5 的交接提示

1. ✅ **删除类冲突已清空**：46 → 26，剩余全部是 `UU`（真三方冲突）
2. 📋 **P5 的任务**：处理 `UU` 中的**设置类与 i18n 类**（约 10 个），把功能移植进官方 React 设置页
3. 🔴 **P5 的第一件事应该是"重新实现 `USAGE_BADGE_*`"**，素材在：
   ```
   .cyrene-merge-analysis/preserved/bak-chat-appearance.ts   ← 3 个导出的完整实现
   ```
   建议落点 `src/shared/usage-badge.ts`（独立模块，不再依附已删文件）
4. 🔴 **P5/P6 不要重新引入 `chat-appearance.ts`** —— 官方已彻底移除该概念（`message-typography` 取代）
5. ⚠️ **`ChatPage.tsx:69` 的悬空 import 已登记给 P6**（`useChannelMirrorEvents` 已被删）
6. 📄 **P5 的冲突清单**：`.cyrene-merge-analysis/90-p3-conflicts-actual.txt` 中码为 `UU` 的 26 行
7. 💾 **回退网**：`phase3-work-snapshot`（P3 快照，含全部被删文件的原始内容）、`phase0-full`
8. 🔴 **仍不要提交** —— 提交时机在 P7（26 个 `UU` 全部解决后）
