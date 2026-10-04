# PHASE-9.5 修复蓝图：新面板样式补齐（Tier E-补 · **目视缺陷修复**）

> **状态**：⏳ 待执行
> **前置**：P9 已提交（`99932fb1`，tag `phase9-entries`）
> **本 Phase 性质**：🔴 **修一个"机器判据全绿、人眼一眼就看出不对"的缺陷** —— 正是 **H-17 目视验收**存在的意义
> **触发**：项目所有者目视 H-17 后反馈「**记忆控制台-查看详情和区块设置的排版看起来怪怪的**」（附 2 张截图，见 §二 F6）
> **读者**：P9.5 执行者（无对话历史）

---

## ★零、开工前必读

### 0.1 四条硬约束

| # | 约束 | 理由 |
|---|---|---|
| **C1** | 🔴 **只动这两块新面板 + 它们新增的 CSS 文件**。**不许**改官方既有组件、**不许**改 `AppearanceSettingsPage.css` 里已有的规则 | 与 **D7 / N2** 一致：官方既有 UI 的排版不属本任务范围 |
| **C2** | 🔴 **配色一律用 `--rb-*` 角色令牌**（**禁用** `--cy-*` 颜色别名） | `theme-token-contract.test.ts` 会扫描 `src/renderer/react/**` 下**全部** `.css`，旧 CSS 里的旧变量/裸 hex 照抄进来会**直接判红**（P9 刚花 148 处修完这件事） |
| **C3** | 🔴 **原封不动优先**：优先**回收旧世界的选择器**（它们就是项目所有者原来的排版），而不是自己重新设计一套 | D7 原话：「我的新增功能依赖在某个 UI 上，**必须原封不动加回去**」 |
| **C4** | 🔴 4 个「里子」模块（`settings/memory/manager.ts`、`settings/zones/panel.ts` 等）**只读**，**不许改** | 它们是**样式与结构的权威参照物**（P9 的 N6 继续有效） |

### 0.2 三个陷阱

| # | 陷阱 | 对策 |
|---|---|---|
| **Y1** | 旧 CSS 是**旧 DOM 结构**的（`<section class="memory-manager__group">`、`input[type=checkbox]`…），直接照抄可能与新 JSX 结构不吻合 | **按需裁剪**：只搬与"卡片/分组/成员行/开关"相关的规则；结构对不上的规则**改写成对应新结构**，不要硬套 |
| **Y2** | 新 JSX 里用的类名与旧类名**不一致**（新：`cy-zone-card`；旧：`zone-card`） | **二选一，但必须全局一致**：① 推荐 **改 JSX 用旧类名**（最"原封不动"）；② 或在 CSS 里为 `cy-*` 起**同值别名**。**不许**出现"JSX 有类名、CSS 无定义"（这就是本缺陷的成因，见 **J-32**） |
| **Y3** | 新建 CSS 后**忘了 import** → vite 不打包、界面毫无变化，而 `tsc`/`vitest` 全绿 | 每个新 CSS 文件都必须在**它服务的组件**里 `import "./Xxx.css";`（照 `ChannelsSettingsPanel.tsx` 的写法）；判据 A3 会查 |

---

## 一、目标与非目标

| # | 目标 | 判定 |
|---|---|---|
| **T1** | **记忆管理台**（设置 → 记忆 → 记忆管理台 + 危险操作）恢复「有卡片、有分组、有分隔、标题不是小注释字号」的排版 | H-19 截图 + A1/A2 |
| **T2** | **区块页**（设置 → 区块）恢复「区块卡 = 一张卡、成员行有勾选框与操作、底部操作与标题左对齐」的排版 | H-19 截图 + A1/A2 |

| # | 非目标 |
|---|---|
| **N1** | **不改功能/交互/文案**：只碰样式与（必要的）类名对齐 |
| **N2** | **不改官方既有面板的外观**（记忆页里原有的 L0/L1/L2/导入知识/回顾/保险库 区块一个像素都不动） |
| **N3** | **不重做 H-16**（`ApiConfigSection` 仍按已拍板 B：不接回） |

---

## 二、事实清单（**撰写者实测**）

### F1 · 三个新面板**没有任何专属 CSS**，且**一个 CSS 都没 import**

| 文件 | 行数 | 有 `.css` import |
|---|---|---|
| `features/settings/memory-console/MemoryManagerSection.tsx` | 519 | ❌ |
| `features/settings/memory-console/DangerZoneSection.tsx` | 180 | ❌ |
| `features/settings/ZonesSettingsPanel.tsx` | 411 | ❌ |

⇒ 它们**完全依赖**既有全局类，而其中 5 个**根本不存在**（F2）。

### F2 · 🔴 5 个"有类名、无定义"的类（**本缺陷的直接成因**）

实测命令（**这是新判据 J-32 的判据命令，修完必须为 0**）：

```powershell
$m = 'E:\AI_Chating\cyrene-agent'
$files = @(
  'src\renderer\react\features\settings\memory-console\MemoryManagerSection.tsx',
  'src\renderer\react\features\settings\memory-console\DangerZoneSection.tsx',
  'src\renderer\react\features\settings\ZonesSettingsPanel.tsx')
$used = @{}
foreach ($f in $files) {
  $t = [System.IO.File]::ReadAllText((Join-Path $m $f), [System.Text.Encoding]::UTF8)
  foreach ($mm in [regex]::Matches($t, '"([^"]*\bcy-[a-z0-9_-]+[^"]*)"')) {
    foreach ($c in ($mm.Groups[1].Value -split '\s+')) { if ($c -like 'cy-*') { $used[$c] = 1 } }
  }
}
$css = Get-ChildItem -Path (Join-Path $m 'src\renderer\react') -Recurse -Filter '*.css' -File
$all = (($css | ForEach-Object { [System.IO.File]::ReadAllText($_.FullName, [System.Text.Encoding]::UTF8) }) -join "`n")
$used.Keys | Sort-Object | Where-Object { $all -notmatch [regex]::Escape('.' + $_) }   # ← 期望【空】
```

当前结果（**5 个，全部是容器类**）：

| 未定义类 | 出现在 | 后果 |
|---|---|---|
| `cy-memory-manager__detail` | `MemoryManagerSection.tsx` ×1 | 详情区**没有卡片、没有分隔**，标题用的是 `cy-memory-card__top` 的**小注释字号**（`--rb-text-micro` + 次级色）→ 看起来像零散漂浮的文字 |
| `cy-memory-manager__group` | 同上 ×1 | 分组之间**没有分隔线/间距**（`gap: 4px` 的裸网格） |
| `cy-memory-manager__trace` | 同上 ×1 | 溯源区无排版 |
| `cy-memory-manager__preview` | 同上 ×1 | 擦除预览无排版 |
| `cy-zone-card` | `ZonesSettingsPanel.tsx` ×1 | 区块卡**没有卡片外观**；子元素继承 `cy-memory-record`（`grid; gap:4px; padding:12px 0`），而其中的成员列表 `cy-memory-list` 自带 `padding: 6px 16px` ⇒ **成员行比兄弟节点多缩进 16px**，底部「改名/删除」与标题**左对齐不一致** → 就是截图里"飘着的移出、散落的 `1 2个成员 改名 删除`" |

### F3 · 旧世界的样式**还在，可原样回收**（这是本 Phase 的关键资产）

| 事实 | 值 |
|---|---|
| 旧样式文件 | `src/renderer/settings/settings.css`（**5,300 行**）—— 已被 P4 随旧设置窗删除，**当前工作区不存在** |
| 回收位置（只读） | `git show phase0-full:src/renderer/settings/settings.css` |
| 其中与本缺陷相关的选择器 | **`memory-manager*` 38 条 + `zone*` 37 条**（共 75 条） |
| 当前 react 的 56 个 CSS 里 | 🔴 `zone-card*` / `zone-member-row*` / `zones-*` / `memory-manager__*` **一条都没有**（实测全部 `False`） |

### F4 · 旧面板的**类名清单**（权威 inventory，执行者照它对齐）

**`memory-manager*`（来自 `settings/memory/manager.ts`，25 个）**：
`memory-manager__feedback{,--ok,--err}`、`__group{,--<视图>}`、`__group-head`、`__group-title`、`__group-count`、`__group-hint`、`__group-rows`、`__group-empty`、`__group-selected`、`__memory`、`__memory-main`、`__memory-body`、`__memory-meta`、`__memory-check`、`__row`、`__row-check`、`__row-name`、`__row-id`、`__row-meta`、`__trace-line`、`__trace-speaker`、`__trace-text`、`__trace-meta`、`__trace-empty`

**`zone*`（来自 `settings/zones/panel.ts`，25 个）**：
`zones-toolbar`、`zones-list`、`zones-feedback{,--ok,--err}`、`zone-card{,--root}`、`zone-card__head`、`__title`、`__name`、`__badge`、`__actions`、`__note`、`__config`、`__switch`、`__members`、`__empty`、`zone-member-row{,--readonly,.is-selected}`、`zone-member-row__check`、`__name`、`__id`、`__badge`、`zone-action`、`zone-config`、`zone-id`

### F5 · 既有可复用的"好类"（**已经定义、且是官方设置页的房规**）

`cy-settings-section`、`cy-settings-section__heading`、`cy-memory-card`、`cy-memory-card__top`、`cy-memory-card__actions`、`cy-memory-list`、`cy-memory-record`、`cy-settings-intro`、`cy-settings-row`、`cy-settings-row__copy`、`cy-settings-row__control`、`cy-settings-button-group`、`cy-settings-alert`、`cy-settings-loading`、`cy-settings-theme-modal`
—— 它们的定义都在 `features/settings/AppearanceSettingsPage.css`（**只读参照**，房规：`display:grid + gap`，颜色 `--rb-*`，字体 `font: var(--rb-text-*)`）。

### F6 · 证据（项目所有者 2026 提供，已归档）

| 文件 | 说明 |
|---|---|
| [`证据/H-17-1-记忆页-排版问题-2026.png`](证据/H-17-1-记忆页-排版问题-2026.png) | 记忆管理台详情视图：标题像注释、分组无分隔、按钮与文字挤在一起 |
| [`证据/H-17-2-区块页-排版问题-2026.png`](证据/H-17-2-区块页-排版问题-2026.png) | 区块卡：无卡片外观、成员行缩进不一致、「移出」单独漂浮、底部操作散落 |
| [`证据/H-17-3-渠道控制台-2026.png`](证据/H-17-3-渠道控制台-2026.png) | ✅ **渠道控制台排版正常**（T1 不需要动它） |

---

## 三、前置与停止条件

| # | 前置 | 判定 |
|---|---|---|
| **P1** | 基线干净 | `git log -1 --format=%h` = `99932fb1`；`git status` 只有 `??` |
| **P2** | 全量基线 | `& D:\data\node24\npx.cmd vitest run` → **`0 failed \| 562 passed (562)`**（P9 之后的基线）🔴 日志用绝对路径 + 先建目录（X13）；**别用 `Tee-Object`**（P9 偏差 8） |
| **P3** | 备份将要改的文件 | `git hash-object` 记进 `.cyrene-merge-analysis/p95/pre-hashes.txt` |

| # | 停止条件 | 为什么停 |
|---|---|---|
| **S1** | 为修排版而需要改**官方既有面板**（记忆页 L0/L1/L2 区块、区块页以外的任何面板） | 越界（N2）→ 停下报告 |
| **S2** | 移植旧 CSS 时发现某规则**依赖已删除的 DOM 结构且无法改写** | 需要人决定"放弃该样式"还是"改结构" |
| **S3** | 全量测试出现**新的**失败文件 | P8 偏差 3 的教训（`readFileSync` 路径清单类守卫） |

---

## 四、施工步骤

### 4.1 回收旧样式（**只做提取，不写文件**）

```powershell
$m = 'E:\AI_Chating\cyrene-agent'
$old = (git -C $m show 'phase0-full:src/renderer/settings/settings.css') -join "`n"
# ① 提取 memory-manager 的 38 条
[regex]::Matches($old, '(?ms)^\.memory-manager[^{]*\{.*?\n\}') | ForEach-Object { $_.Value } |
  Set-Content -LiteralPath '.cyrene-merge-analysis\p95\old-memory-manager.css' -Encoding UTF8
# ② 提取 zone 的 37 条
[regex]::Matches($old, '(?ms)^\.[a-z-]*zone[a-z_-]*[^{]*\{.*?\n\}') | ForEach-Object { $_.Value } |
  Set-Content -LiteralPath '.cyrene-merge-analysis\p95\old-zone.css' -Encoding UTF8
"提取条数 = " + ((Select-String -LiteralPath '.cyrene-merge-analysis\p95\old-memory-manager.css' -Pattern '^\.[a-z-]').Count) + " / " + ((Select-String -LiteralPath '.cyrene-merge-analysis\p95\old-zone.css' -Pattern '^\.[a-z-]').Count)
```
> ⚠️ 正则只是**提取助手**：提取后**必须逐条读一遍**（旧 CSS 有媒体查询、`@media`、`!important`、嵌套选择器——正则可能切歪）。宁可少搬几条，也不要搬进语法错误的块。

### 4.2 写成两个新 CSS 文件（**本 Phase 的主交付物**）

```
src/renderer/react/features/settings/memory-console/MemoryConsole.css   ← 记忆管理台 + 危险操作
src/renderer/react/features/settings/ZonesPanel.css                     ← 区块页
```

**每条规则都要过三道改写**：
1. **颜色 → `--rb-*` 令牌**（映射：`--cy-bg-*`→`--rb-surface-*`、`--cy-text*`→`--rb-text-*`、`--cy-border*`→`--rb-border-*`、`--cy-accent`→`--rb-accent`；裸 hex 也一并令牌化，实在没有对应令牌的**保留裸 hex**——该测试只禁 `--cy-*` 颜色别名）
2. **字号 → 房规令牌**（`font: var(--rb-text-micro | --rb-text-small | --rb-text-small-em | --rb-text-body)`，照 `AppearanceSettingsPage.css` 的用法）
3. **间距 → 与房规一致**（卡片 `padding:16px`、网格 `gap:16px`；列表内 `padding: 6px 16px`）

### 4.3 对齐类名（**Y2：全局一致**）

推荐做法（最"原封不动"）：**把 JSX 里的 5 个未定义类改成旧名**（`cy-zone-card`→`zone-card`、`cy-memory-manager__*`→`memory-manager__*`），CSS 直接照搬旧选择器。
若坚持 `cy-` 前缀，则在 CSS 里写**别名组**：`.cy-zone-card, .zone-card { … }`（**两种选择器都必须能命中 JSX 实际写的那个**）。

### 4.4 三处挂载（**Y3**）

```tsx
// MemoryManagerSection.tsx 顶部
import "./MemoryConsole.css";
// DangerZoneSection.tsx 顶部（与上同一个 CSS 文件即可）
import "./MemoryConsole.css";
// ZonesSettingsPanel.tsx 顶部
import "./ZonesPanel.css";
```
> 危险操作区（`DangerZoneSection`）若与记忆管理台同一页同一 CSS，**只需 import 一次**；但两处都写 import 也无害（vite 去重）。

### 4.5 门禁（**必须全绿**）

```powershell
$env:PATH = "D:\data\node24;" + $env:PATH
# ① J-32 新门禁：未定义类 = 0（命令见 §二 F2，期望空输出）
# ② 主题令牌契约（本缺陷最容易被它抓）
& D:\data\node24\npx.cmd vitest run src/renderer/react/styles/theme-token-contract.test.ts
# ③ 三套编译
npx tsc -p tsconfig.main.json ; npx tsc -p tsconfig.preload.json ; npx tsc -p tsconfig.renderer.json
# ④ 全量（期望仍是 0 failed | 562 passed (562)；新增测试的话按 J-28 用加法恒等式核对）
& D:\data\node24\npx.cmd vitest run
```

---

## 五、人工环节

### 5.1 H-A：无阻塞项（范围由 D7 + 本蓝图 §零 C1/C3 锁定）

### 5.2 **H-19**（施工后 · 本 Phase 的退出条件）

| 步骤 | 期望 | 实测 | 判定 |
|---|---|---|---|
| 1. 设置 → 记忆 → 记忆管理台，切「按人」，点一个条目进详情 | 详情区**有卡片边界**；「他自己说过的」「别人嘴里提到他的片段」是**分组标题（不是小注释字号）**，各自带数量徽标；分组之间**有分隔**；底部操作按钮**成行右对齐** | | |
| 2. 设置 → 区块 | 每个区块是**一张卡**（有边界/内边距）；标题行（`desktop (root)` + 成员数 + 操作）**一行内左右分列不挤压**；成员行**有勾选框**、缩进与标题**一致**；两个开关**成行**；底部「改名/删除」与卡片左边距一致 | | |
| 3. 对比官方既有面板（如 设置 → 常规） | 字号层级、卡片间距、圆角**观感一致**（不出现"另一套设计"） | | |

> 截图 2 张（记忆管理台详情 + 区块页），落到 [`证据/`](证据/)。

### 5.3 H-C：本 Phase 销账 **H-19**；**H-17** 的 ①②③ 保持"入口已接回 ✅"，等 H-19 一起收口

---

## 六、验证判据（A 类）

| # | 判据 | 期望 |
|---|---|---|
| **A1** | 未定义类 = 0 | §二 F2 的命令输出**为空** |
| **A2** | 两个新 CSS 文件存在且被 import | 文件存在；`git grep -l 'MemoryConsole.css\|ZonesPanel.css' -- src/renderer/react` ≥2 文件 |
| **A3** | 主题令牌契约 | `theme-token-contract.test.ts` **0 failed**（且两个新 CSS 内 `var(--cy-` 计数 = **0**） |
| **A4** | 三套编译 | 0 / 0 / 0 |
| **A5** | 全量测试 | `0 failed`（数字按 **J-28** 用加法恒等式核对） |
| **A6** | 改动面 | 提交只含：2 个新 CSS + 3 个 JSX（+ 可选 1 个测试）；**不含** `AppearanceSettingsPage.css` 与任何官方面板 |

---

## 七、交付物

| 交付物 | 内容 |
|---|---|
| 新 CSS | `memory-console/MemoryConsole.css`、`ZonesPanel.css`（回收旧样式 + 令牌化） |
| 改 JSX | 5 个未定义类名对齐 + 3 处 `import "./….css"` |
| 提交 | `fix(P9.5): 补齐记忆管理台/区块页的排版样式（回收旧 settings.css 的 75 条选择器）` + tag `phase9.5-visual` |
| 文档 | 台账 **H-19 销账** + 总蓝图 §四/§九 回写 |

---

## 八、回退

```powershell
git checkout 99932fb1 -- <path>      # 单文件
git reset --hard 99932fb1            # 整 Phase（P9.5 只有一个提交）
git show 99932fb1:<path>             # 只看改前内容
```

---

## 九、坑

| # | 坑 | 对策 |
|---|---|---|
| 1 | 旧 CSS 里带 `@media` / 嵌套块 → 正则提取切歪 | 4.1 的提取结果**逐条读**；宁可少搬 |
| 2 | 旧 CSS 用旧变量/裸 hex → 抄进新文件直接判红 | C2：全部令牌化；改完先单跑 `theme-token-contract` |
| 3 | 只改 CSS 不改 JSX 类名（或反之）→ 界面毫无变化却"看着改完了" | Y2 + A1 门禁 |
| 4 | 忘了 import → 同上 | Y3 + A2 门禁 |
| 5 | 顺手"美化"了官方既有面板 | C1 + A6 门禁 |
| 6 | 为了对齐而改了功能/文案 | N1（本 Phase 只碰样式） |

---

## 十、给 P10 的交接

1. H-19 销账后，**H-17（P9 目视 5 步）即可一并收口**：①②③ 已由项目所有者目视确认"入口都在"，⑤ 由 H-19 的观感对比覆盖。
2. **建议把 J-32 的门禁固化成一条测试**（"新面板用到的类必须都有定义"），否则**下一个新面板会重蹈同一个坑** —— 这是本缺陷最值得留下的东西。
3. 4 个「里子」模块的最终处置（P10）：它们现在既无测试覆盖、又不在类型检查面内，且**样式已被本 Phase 证明"必须回收"** ⇒ 建议升级为"**样式与规则的权威参照**"并在 P10 明确其长期归属。

---

## 十一、施工记录（执行者填写）

| 子节 | 内容 |
|---|---|
| 0 | 开工前状态（P1/P2 的四个数字） |
| 1 | 4.1 提取结果：两条正则各命中几条、逐条复核后**实际接入**几条 |
| 2 | 4.2 令牌化：改了多少处颜色 / 字号，有没有保留裸 hex 及原因 |
| 3 | 4.3 类名对齐：5 个类各自的处置（改名 or 别名） |
| 4 | 4.4 import 落点 |
| 5 | 门禁实测：A1–A6 原始输出（**回读原文**） |
| 6 | 偏差清单（蓝图坐标被实测推翻的项，按 **J-13** 以实测为准） |

---

## 十二、回写清单（T1–T4）

| 触发 | 目标 | 一句话 | 勾 |
|---|---|---|---|
| **T1** 判据被修正 | 总蓝图 §二 | 本 Phase 若发现新的判据缺陷 → 新增 **J-nn**（J-32 已由撰写者预立） | [ ] |
| **T2** 基线被改写 | 总蓝图 §四 / §九 | P9.5 → ✅ 已完成（提交哈希 + 门禁数字 + 新基线） | [ ] |
| **T1** 判据被修正 | 台账 §三/§四/§五 | **H-19 销账**（附 2 张截图）；H-17 标注"入口已确认 + 观感由 H-19 覆盖" | [ ] |
| **T4** 新增经验 | `../methodology/BLUEPRINT-经验库-通用.md` | 迁移 DOM 面板 → React 时**「抄结构必须连带抄样式」**（H 级，键号顺延） | [ ] |
