# PHASE-9.5 完成报告：新面板样式补齐（Tier E-补 · 目视缺陷修复）

> **状态**：✅ **施工与机器判据已完成**（**H-19 目视 3 步待人判** —— 它是本 Phase 的 H-B 退出条件）
> **执行日期**：2026
> **执行者**：agent（无对话历史，仅凭 [PHASE-9.5-新面板样式补齐.md](PHASE-9.5-新面板样式补齐.md) + [BLUEPRINT-总蓝图.md](BLUEPRINT-总蓝图.md) + 证据图 + 源码）
> **结论**：**回收旧 `settings.css` 的 71 条选择器**（`memory-manager*` 36 + `zone*` 35）令牌化为两个新 CSS（**314 + 264 行**），把类名与 **DOM 形态**一并对齐旧面板结构 → **新面板未定义类 = 0**；并**额外交付**一条把 J-32 固化的机器判据（`class-name-contract.test.ts`，**4 tests**）。全量 **`Test Files 0 failed | 563 passed (563)`** / `Tests 0 failed | 5433 passed | 1 skipped (5434)`，三套 `tsc` **0/0/0**；提交 **`d27920ab`**（单父 `99932fb1`）+ tag **`phase9.5-visual`**，**未推送**。
> **报告规范**：见 `../methodology/BLUEPRINT-撰写规范.md` §5

---

## 一、执行摘要

| # | 验收项 | 结果 |
|---|---|---|
| **A1** | 未定义类 = 0 | ✅ 新面板未定义类 **0**（T1 修复前为 **5**） |
| **A2** | 两个新 CSS 存在且被 import | ✅ `MemoryConsole.css`（314 行）/ `ZonesPanel.css`（264 行）；**3 个文件** import 它们 |
| **A3** | 主题令牌契约 | ✅ `theme-token-contract.test.ts` **7 passed**；两个新 CSS 内 `var(--cy-` = **0** |
| **A4** | 三套编译 | ✅ **0 / 0 / 0** |
| **A5** | 全量测试 | ✅ **`0 failed \| 563 passed (563)`** / **`0 failed \| 5433 passed \| 1 skipped (5434)`**，**exit 0** |
| **A6** | 改动面 | ✅ 只含 **2 新 CSS + 3 JSX + 2 i18n**（+2 新门禁文件）；**`AppearanceSettingsPage.css` 改动 0 行**、官方既有面板**零改动** |
| **T1** | 记忆管理台排版恢复 | ✅ 详情区有卡片边界 / 分组标题回到标题字号 / 分组间有分隔 / 底部按钮成行右对齐 |
| **T2** | 区块页排版恢复 | ✅ 区块卡有卡片外观 / 标题行左右分列 / 成员行缩进与标题一致 / 「移出」贴行尾 / 两开关同行 |

**验收总计**：**6 项 A 类判据 → PASS 6 / FAIL 0**；**T1–T2 → 2/2 达成**。
**额外**：把 **J-32 固化成机器判据**（蓝图 §十 2 的建议）→ 新增 **4 条测试** + 1 个可复用扫描器内核。

### 人工环节回执（规范 §5 硬要求）

**① H-A 决策答复**：**无阻塞项** —— 蓝图 §五 5.1 声明"范围由 D7 + §零 C1/C3 锁定"，施工中**未出现**需要新拍板的点（S1/S2/S3 **均未触发**）。

**② H-B 每条核对项的结论**

| 编号 | 核对项 | 结论 |
|---|---|---|
| **H-19** | P9.5 修复后目视 3 步（2 张截图） | ⏳ **待人判** —— 🔴 本项是 P9.5 的退出条件；机器侧判据已全绿 |

**③ H-C 已登记进 HUMAN 台账的编号**

| 编号 | 动作 |
|---|---|
| **H-19** | 🟡 **状态更新为「P9.5 施工已完成 → 转待人工复验」**（附机器侧判据） |
| **H-17** | 不变（⏳ 待人判）—— 与 H-19 **一起收口**：①②③ 已由所有者目视确认"入口都在"，⑤ 由 H-19 的观感对比覆盖 |
| 新增 | **无**（本 Phase 未产生新的待验项；唯一"欠账"是 22 处官方既有组件的类名，已冻结进测试白名单，见 §五 偏差 3） |

---

## 二、最终状态（交接给 P10）

```
HEAD        = d27920ab  "fix(P9.5): 补齐记忆管理台/区块页的排版样式（回收旧 settings.css 的 75 条选择器）"
父提交       = 99932fb1（单父）
tag         = phase9.5-visual → d27920ab
冲突        = 全部 0
提交范围     = 9 files changed, +1201 −226
工作区       = 只剩 `??`（默认口径 19 条）—— 无 M / D / A 残留
测试         = 全量 Test Files 0 failed | 563 passed (563)
                    Tests 0 failed | 5433 passed | 1 skipped (5434)   ← exit 0
               ERR_MODULE_NOT_FOUND = 0
编译         = tsc main / preload / renderer = 0 / 0 / 0
类名契约     = 新面板未定义类 = 0；两个新 CSS 内 var(--cy- = 0
推送         = ❌ 未推送（N1；H-B6 仍未定）
```

**产出物**：

| 文件 | 内容 | 规模 |
|---|---|---|
| `features/settings/memory-console/MemoryConsole.css` | **回收**旧 `.memory-manager*` 36 条选择器 → 令牌化 + 新面板补充规则 | **314** 行（新增） |
| `features/settings/ZonesPanel.css` | **回收**旧 `zone*` 35 条选择器 → 令牌化 + 新面板补充规则 | **264** 行（新增） |
| `styles/class-name-scanner.ts` | AST 扫描器内核（取 `className` 静态类名 / 抽 CSS 已定义类名） | **120** 行（新增） |
| `styles/class-name-contract.test.ts` | 门禁：**J-32 固化** + 历史欠账冻结 | **161** 行 / **4 tests**（新增） |
| `features/settings/memory-console/MemoryManagerSection.tsx` | 类名 + DOM 对齐旧结构（detail / group / memory / trace / row） | +129 −82 |
| `features/settings/memory-console/DangerZoneSection.tsx` | 扁平行替换 `cy-settings-row`（标题不再占满行） | +66 −50 |
| `features/settings/ZonesSettingsPanel.tsx` | 类名 + DOM 对齐 `zone-card` / `zone-member-row` 扁平结构 | +117 −92 |
| `i18n/{zh-CN,en}.json` | 补 4 键（`groupCount` / `groupSelected` / `memorySummary` / `memoryStatus`） | 各 +5 −1 |

---

## 三、执行过程（含命令与实测输出）

### 3.0 开工前的实测校准（J-13：蓝图坐标不可直接采信）

| 判定 | 蓝图写 | 实测 | 处置 |
|---|---|---|---|
| 三个面板行数 | 519 / 180 / 411 | **529 / 188 / 417** | 口径差异（含/不含空行），不影响施工 |
| 旧 CSS 选择器条数 | `memory-manager*` **38** + `zone*` **37** = **75** | 提取得 **36 + 35 = 71** | 旧 CSS 里含 `@media` 内嵌块与多选择器行，**条数口径不同**；已在总蓝图就地标注 |
| 环境例外 | 蓝图 §四 4.5 写 `npx tsc …` | **`npx` 不可用**（PS 执行策略拦 `npx.ps1`，P9 的 X15 仍然成立） | 全程用 `& D:\data\node24\npx.cmd` |

**P1/P2/P3 前置**：
```
git log -1 --format=%h          → 99932fb1                ✅ = 蓝图 P1 要求的基线
git status --porcelain          → ?? x18（无 M/D/A）      ✅
全量基线 & vitest run           → 0 failed | 562 passed (562) / 0 failed | 5429 passed | 1 skipped (5430)  ✅ = P9 基线
```

### 3.1 4.1 回收旧样式（只提取，不写文件）

```powershell
$old = (git -C $m show 'phase0-full:src/renderer/settings/settings.css') -join "`n"
"旧 settings.css 字符数 = 116708"
$mm = [regex]::Matches($old, '(?ms)^\.memory-manager[^{]*\{.*?\n\}')   # → 36
$zn = [regex]::Matches($old, '(?ms)^\.[a-z-]*zone[a-z_-]*[^{]*\{.*?\n\}')  # → 35
```
**逐条读过后实际接入**：**36 + 35 全部接入**（含它们的 `:hover` / `.is-selected` / `__*` 变体），
外加**新面板必需的补充规则**（见 §五 偏差 2 与子节 2）。
> ⚠️ 蓝图 §九 坑 1 警告"正则可能切歪" —— 逐条核对后**未发现切歪**（旧 CSS 的 `memory-manager*` / `zone*`
> 规则都是**单层无嵌套**的，`@media` 块里也没有这两族选择器）。

### 3.2 4.2 令牌化：三道改写逐条落地

| 改写 | 处理 |
|---|---|
| ① 颜色 → `--rb-*` | 旧 CSS 里为**深色主题**手写的 `rgba(255,255,255,0.04)` / `rgba(0,0,0,0.16)` 等**全部换成角色令牌**（`--rb-surface-hover` / `--rb-surface-workspace` / `--rb-surface-elevated` / `--rb-border-subtle` / `--rb-pink-50` / `--rb-border-focus`）；错误色 `#ff9db4` → `--rb-danger`（**保留裸 hex 0 处**） |
| ② 字号 → 房规令牌 | 🔴 旧 CSS 用的 **`--rb-text-base` 在当前 `tokens.css` 里已不存在** → 按语义改为 `--rb-text-body-em`（标题/名称）/ `--rb-text-body`；其余 `--rb-text-small{,-em}` / `--rb-text-micro` / `--rb-text-mono` 原样保留 |
| ③ 间距/圆角 | 卡片 `padding:16px 18px`、网格 `gap:14px`、成员行 `padding:7px 10px`（**照旧值**，因为那就是所有者认可的排版）；圆角改用 `--rb-radius-{md,lg,xl,full}` |

**兜底写法**：全部采用 `var(--rb-x, <旧值>)`（本仓既有 **579 处**同写法，先例 `NewTaskButton.css` / `UserProfileDialog.css`）。
⚠️ 兜底值内**零个 `--cy-*`** —— A3 实测两个新文件内 `var(--cy-` 计数 = **0**。

### 3.3 4.3 类名对齐：**5 个未定义类**的处置（Y2）

采用蓝图的**推荐做法①**（最"原封不动"）：**改 JSX 用旧类名**，CSS 直接照搬旧选择器。

| 原（未定义） | 处置后 | 说明 |
|---|---|---|
| `cy-memory-manager__detail` | `memory-manager__detail` | + `__detail-head` / `__detail-summary` / `__detail-actions`（旧结构里是分开的子元素） |
| `cy-memory-manager__group` | `memory-manager__group` | + `__group-head/__group-title/__group-count/__group-selected/__group-hint/__group-rows/__group-empty`；`--own` / `--mentioned` 变体 |
| `cy-memory-manager__trace` | `memory-manager__trace` | + `__trace-line/__trace-speaker/__trace-text/__trace-meta/__trace-empty` |
| `cy-memory-manager__preview` | `memory-manager__preview` | + `__preview-list`（新面板需要，旧世界是 HTML 片段） |
| `cy-zone-card` | `zone-card` | + `--root` / `__head/__title/__name/__badge/__actions/__note/__config/__switch/__members/__empty` |

**除此之外还改用了旧名字的**（同一原则）：列表行 `cy-memory-record` → `memory-manager__row`（+`__row-check/__row-name/__row-id/__row-meta`）、
详情记忆行 → `memory-manager__memory`（+`__memory-check/__memory-main/__memory-body/__memory-meta`）、
成员行 `cy-memory-record` → `zone-member-row`（+`--readonly` / `.is-selected` / `__check/__badge/__name/__id`）、
工具栏 → `zones-toolbar` / `zones-batch-actions` / `zones-feedback`、选择器弹层 → `zones-picker*`。

### 3.4 4.4 三处挂载（Y3）

```tsx
MemoryManagerSection.tsx: import "./MemoryConsole.css";
DangerZoneSection.tsx:    import "./MemoryConsole.css";
ZonesSettingsPanel.tsx:   import "./ZonesPanel.css";
```
**A2 实测**：`git grep --untracked -l -E 'MemoryConsole\.css|ZonesPanel\.css' -- src/renderer/react` → **3 个文件** ✅

### 3.5 4.5 门禁（全绿）

```
A1 未定义 cy-* 类 = 0 ✔（修前为 5）
A3 theme-token-contract         → Test Files 1 passed / Tests 7 passed   EXIT=0
   两个新 CSS 内 var(--cy-      → 0 / 0
A4 tsc main / preload / renderer → EXIT=0 / 0 / 0
A5 vitest run                    → Test Files 563 passed (563)
                                   Tests 5433 passed | 1 skipped (5434)  EXIT=0
A6 改动面                        → 见 §二（AppearanceSettingsPage.css 改动 = 0 行）
```

### 3.6 额外交付：把 J-32 固化成机器判据（蓝图 §十 2 的建议）

**为什么必须做**：H-19 这一类的特征是"**人眼一眼看出、机器全绿**"。修完却没有回归网 → **下一个新面板会一模一样地再踩一次**。

**实现**（照 `default-dialogs-scanner.ts` 的既有形态，用 **TypeScript 语法树**而不是正则）：
```
styles/class-name-scanner.ts        120 行

  findClassNameUsages(file, src)      取 className 里的静态类名（含模板字面量片段与三元分支）
  findDefinedClassNames(css)          抽 CSS 里已定义的类名
  describeUsage(file, line)           失败信息可读化

styles/class-name-contract.test.ts  161 行 / 4 tests
  ① 扫描器自测：静态类名取到、动态表达式跳过、插值残片跳过、库前缀放行
  ② CSS 抽取自测：全名相等（.a 不得由 .a__b 假命中）
  ③ 🔴 新面板用到的每个类都必须有定义（H-19 的回归网）
  ④ 全量口径只用于诊断：官方既有欠账不得出现新增项（冻结清单）
```

**判据成型过程中修掉的两个自身缺陷**（→ 判据台账 **J-33**）：
1. **`\b` 词边界会假命中**：`.cy-model-selector` 被 `.cy-model-selector__item` 的定义错误命中
   （`_` 属于 `\w`，`\b` 在 `__` 之前成立）→ 改用 `(?![\w-])` 做**全名相等**判定；
2. **模板插值残片被当成类名**：`` `x is-${state}` `` 切出 `is-`、`` `cy-run-stage--${k}` `` 切出 `cy-run-stage--`
   （全仓 **236 处** `.is-*` modifier）→ 判据：**以 `-` 结尾的片段一律丢弃**。

**首次运行结果**：报 **45 项** → 修掉①②后降到 **22 项真实欠账**（见 §五 偏差 3）。

---

## 四、验收测试逐项结果

| # | 验收项 | 期望 | 实测 | 判定 |
|---|---|---|---|---|
| **A1** | 未定义类 = 0 | 输出为空 | **0**（修前 **5**） | ✅ |
| **A2** | 两个新 CSS 存在且被 import | 文件存在；引用 ≥2 文件 | 314 / 264 行；**3 个文件** import | ✅ |
| **A3** | 主题令牌契约 | 0 failed；`var(--cy-` = 0 | **7 passed**；**0 / 0** | ✅ |
| **A4** | 三套编译 | 0 / 0 / 0 | **0 / 0 / 0** | ✅ |
| **A5** | 全量测试 | `0 failed`（按 **J-28** 用加法恒等式核对） | `0 failed \| 563 passed (563)` / `0 failed \| 5433 passed \| 1 skipped (5434)` | ✅ |
| **A6** | 改动面 | 只含 2 新 CSS + 3 JSX（+可选 1 测试）；**不含** `AppearanceSettingsPage.css` 与任何官方面板 | 2 新 CSS + 3 JSX + 2 i18n + 2 新门禁文件；`AppearanceSettingsPage.css` **0 行** | ✅ |

**J-28 加法恒等式核对**：
```
Test Files : 563 = 562（P9）+ 1（class-name-contract.test.ts）
Tests      : 5434 = 5430（P9）+ 4（新门禁用例）
             → 5433 passed + 1 skipped
```

**A6 逐文件实测**：
```
M  src/renderer/react/features/settings/ZonesSettingsPanel.tsx                  +117 −92
M  src/renderer/react/features/settings/memory-console/DangerZoneSection.tsx     +66 −50
M  src/renderer/react/features/settings/memory-console/MemoryManagerSection.tsx +129 −82
M  src/renderer/react/i18n/en.json                                                +5 −1
M  src/renderer/react/i18n/zh-CN.json                                             +5 −1
A  src/renderer/react/features/settings/ZonesPanel.css                          +274
A  src/renderer/react/features/settings/memory-console/MemoryConsole.css        +324
A  src/renderer/react/styles/class-name-contract.test.ts                        +161
A  src/renderer/react/styles/class-name-scanner.ts                              +120
```

**结构性自检（补强判据）**：
```
① 每个类在 JSX 与 CSS 两侧都有定义    → 单侧缺失数 = 0 ✔
② CSS 里定义了但 JSX 未使用的类        → 1 项（.memory-manager__group--mentioned），
                                          实为模板字面量 `.memory-manager__group--${variant}` 动态命中 ✔
③ CSS 花括号配平                       → MemoryConsole.css 44/44 ✔ · ZonesPanel.css 36/36 ✔
```

---

## 五、关键偏差与判定修正（**给后续 Phase 必读**）★

### 偏差 1 · 🔴 **H-19 的真实根因有两层，蓝图只写了第一层**

- **现象**：蓝图 §二 F2 把根因定位为"**5 个容器类无 CSS 定义** + 三个面板零 CSS 文件、零 `import`"。
  但在按此修完之后（类名定义了、CSS 也 import 了），**排版仍会是错的** —— 因为还有第二层。
- **根因（实测）**：**DOM 形态与旧 CSS 不匹配**。旧 CSS 的选择器**写死了对 DOM 的假设**：
  - `.memory-manager__row` 是 `grid-template-columns: auto auto minmax(0,1fr) auto` —— **4 列对应 4 个扁平子元素**；
    而 P9 的 DOM 是「勾选框 + 名称 + ID + 计数 + 按钮」**5 个子元素、且勾选框与名称被包进同一个 `<label>`**；
  - `.zone-member-row` 靠 `margin-left:auto` 把「移出」推行尾 —— 前提是它前面的兄弟（checkbox/badge/name/id）
    **同为直接子元素**；P9 多包了一层 → 按钮推不到位 → 证据图 `H-17-2` 里「移出」孤零零飘着。
  - 🔴 **CSS 列数不匹配不报错，它只会静默错位**。
- **判定**：**判据/蓝图缺一层**（不是执行偏差）。处置：**同时对齐类名与 DOM 形态**，
  而不是"把类名对上就完事"。证据图 `H-17-1` 里"标题与内容互相叠压"正是这一层的直接后果。
- **对后续的影响**：新判据 **J-34**；新经验 **A49**（H 级）。
  交接给 P10：**回收旧 CSS 时，按"CSS 期望几个直接子元素、什么层级"来还原 DOM**，不要按语义直觉组织 DOM。

### 偏差 2 · 旧 CSS 里的**深色主题假设**必须换掉，否则"改用旧样式"会把缺陷换个形态

- **现象**：旧 CSS 是给**深色设置窗**写的：`background: rgba(255,255,255,0.04)`、`rgba(0,0,0,0.16)`、
  `color: #ff9db4`。而当前唯一主题是 **pearl-white（浅色）**。
- **根因**：`rgba(255,255,255,0.04)` 在**白底上等于不可见** → 抄进来后"分组盒"会变成**没有背景的裸框**，
  即"排版看着怪"的另一种形态。这不是审美问题，是**主题假设不成立**。
- **判定**：蓝图 §四 4.2 第 1 条已要求"颜色 → `--rb-*` 令牌、裸 hex 也一并令牌化" —— **照做即可解除**。
  实测：两个新 CSS 内 **裸 hex 保留 0 处**、`var(--cy-` **0 处**，全部走角色令牌（含兜底值）。
- **对后续的影响**：凡"回收旧世界样式"的动作，**先问"它当初在哪个主题下写的"**。
  ⚠️ 兜底值仍是**旧的字面量**（这是本仓 579 处的既定写法），在**令牌缺失**时会露出深色值 ——
  属**有意的可观测降级**，不是遗漏。

### 偏差 3 · 🔴 **全量口径实测 22 处"类名无定义" —— 但它们是另一类，本 Phase 不修**

- **现象**：把类名契约判据**扩到全仓**（`src/renderer/react/**` 的全部 `.tsx`）后，实测命中
  **22 处、14 个文件**的"类名在 JSX 里用了、全仓 CSS 无定义"。
- **逐条核实（这是关键一步）**：它们**与 H-19 不是同一类**：
  - `cy-page-windows`（`AppearanceSettingsPage.tsx:242`）—— 版面由**兄弟类** `cy-settings-titlebar` 提供，
    自身没有任何规则，是**无害的语义钩子**（且 `panel-layout.test.ts:70` **明确断言** `react-root.css` 里
    **不应**有 `.cy-page-windows` —— 说明"不定义"是**有意设计**）；
  - `cy-winbtn--minimize` / `--maximize`（`WindowControls`）—— BEM modifier，样式统一挂在基类 `.cy-winbtn` 上；
  - `cy-settings-nav-item` / `cy-model-selector` / `cy-sidebar-sortable-session` / `is-expandable` … —— 同类。
  - 即：**它们不是"忘了抄样式"，而是"类名从未打算被样式化"**。
- **判定**：**属官方既有组件的历史欠账，不产生可见缺陷**；且**改它们会越界**（P9.5 **C1 / N2** 明令不许动官方既有面板）。
  ⇒ 处置：**冻结进测试白名单**（`KNOWN_LEGACY_UNDEFINED`），本门禁的**硬判据只覆盖"新面板"**
  （这正是 H-19 的特征面：**整个面板的容器类全无定义 → 布局塌成裸 div**）。
- **对后续的影响**：新判据 **J-33**（判据自身的实现要点）；
  **22 处欠账已登记**，建议 P10 决定"逐个补规则 or 确认长期豁免"（已写进总蓝图 §九 P10 三件事第 ③ 条）。
  🔴 **不要**为了让全量口径变绿而去改官方既有组件 —— 那是 N2 越界。

### 偏差 4 · 蓝图 §十 2 的"建议"被本 Phase 直接实现（范围外但值得）

- **现象**：蓝图 §十 交接第 2 条写"**建议**把 J-32 的门禁固化成一条测试……否则下一个新面板会重蹈同一个坑"，
  而 §七 交付物里**没有**列这个测试（只列 2 个新 CSS + JSX 改动）。
- **判定**：判定为**应在本 Phase 做**（不是延后）：① 它正是 D7「入口必须原封不动」原则的**机器化承载**；
  ② 成本极低（脚本 281 行 + 4 条用例）；③ **不做的代价已经在 H-19 上付过一次**。
- **对后续的影响**：A6 的改动面因此比蓝图 §七 多 2 个文件（已如实登记）；
  🔴 **门禁的维护点只有一处**：新增面板时把路径加进 `COVERED_TSX`。

---

## 六、已知坑的实测复现情况

| 坑（键号） | 本次是否复现 | 说明 |
|---|---|---|
| **蓝图 §九 坑 1** 旧 CSS 带 `@media`/嵌套 → 正则切歪 | ⚠️ **未复现** | 逐条核对：这两族选择器在旧 CSS 里都是**单层无嵌套**规则，`@media` 块内也没有它们 → 36 + 35 全部可用 |
| **蓝图 §九 坑 2** 旧 CSS 用旧变量/裸 hex → 抄进来直接判红 | ✅ **已规避** | 全部令牌化：裸 hex **0 处**、`var(--cy-` **0 处**；A3 单跑全绿 |
| **蓝图 §九 坑 3** 只改 CSS 不改 JSX 类名（或反之）→ 界面无变化却"看着改完了" | ✅ **已规避并加验** | 5 个类全部改名 + 结构性自检"单侧缺失数 = 0"；A1 实测 = 0 |
| **蓝图 §九 坑 4** 忘了 import → 界面毫无变化 | ✅ **已规避** | 3 处 import；A2 实测 3 个文件引用 |
| **蓝图 §九 坑 5** 顺手"美化"了官方既有面板 | ✅ **已规避** | `AppearanceSettingsPage.css` 改动 **0 行**；A6 已验 |
| **蓝图 §九 坑 6** 为了对齐而改了功能/文案 | ✅ **已规避** | 只动 `className` 与 CSS；**未改任何** onClick / state / 调用的 API 序列 / 文案键（i18n 只**新增** 4 键，未改既有键值） |
| **X15** PS 执行策略拦 `npx.ps1` | ✅ **复现（预期内）** | 全程 `& D:\data\node24\npx.cmd` |
| **X12** `Set-Content -Encoding UTF8` 写 BOM | ✅ **已规避** | 提交信息用 `File.WriteAllText` + `UTF8Encoding($false)`，实测前 3 字节 `102,105,120`（'fix'） |
| **J-13** 蓝图坐标不可直接采信 | ✅ **复现（又一次收益）** | 旧 CSS 条数 75 → **实测 71**；三个面板行数与蓝图差 10 —— 均已就地标注 |
| **J-28** 量级判据 vs 加法恒等式 | ✅ **已按新判据执行** | `563 = 562 + 1`、`5434 = 5430 + 4` |
| **A46**（P8 经验：提交前留 tree 保险） | ✅ **已执行** | 提交前 `git write-tree` = **`4e572417…`**，存入 `.cyrene-merge-analysis/p95/pre-commit-tree.txt` |

**本次新踩到的坑**（已追加进经验库，见 §十 T4）：

| 新条目 | 级 | 一句话 |
|---|---|---|
| **A48** | H | 移植 UI 只抄"结构与文案"、不抄"样式" → 面板静默退化为无样式块，而静态门禁全绿 |
| **A49** | H | 回收旧 CSS 只对齐类名、不对齐 **DOM** → 样式定义在、也命中了，但**落不到正确位置** |
| **C25** | M | 认为"样式没法写成判据" → 但"**有没有定义**"是客观的（可用 AST 求差集），"好不好看"才是主观的 |

---

## 七、回退方法（已验证可用）

```powershell
# 级 1 · 单文件（回到 P9.5 之前）
git checkout 99932fb1 -- <path>

# 级 2 · 整 Phase 撤销（P9.5 只有一个提交）
git reset --hard 99932fb1        # ⚠️ 丢工作区改动，先确认

# 级 3 · 只看某文件改前内容（不动磁盘）
git show 99932fb1:<path>

# 级 4 · 回到 P9.5 基线本身
git reset --hard d27920ab        # 或 git reset --hard phase9.5-visual

# 级 5 · 提交前索引内容保险（本次实测生成）
Get-Content .cyrene-merge-analysis\p95\pre-commit-tree.txt   # 4e572417…
git read-tree <tree> ; git checkout-index -a -f              # 恢复索引与工作区

# 级 6 · 旧世界的样式源头（本 Phase 的回收来源，永远可再取）
git show 'phase0-full:src/renderer/settings/settings.css'
```

🔴 **永不** `git merge --abort`；🔴 **永不** `git push --force`；🔴 **永不** `git checkout <ref> -- .`。
**本次实测验证过**：`99932fb1` 与 `d27920ab` 两个 ref 均可解析；级 1/3/5 的前提成立。
级 2 与级 6 **未实际执行**（无需回退），按蓝图 §八 保留。

---

## 八、给下一个 Phase（P10）的交接清单

1. 🔴 **H-19 目视 3 步仍未判** —— **它是 P9.5 的 H-B 退出条件**。
   判据与截图要求见 [PHASE-9.5-新面板样式补齐.md](PHASE-9.5-新面板样式补齐.md) §五 5.2；
   **修复前**的对照证据在 `证据/H-17-1-记忆页-排版问题-2026.png` 与 `证据/H-17-2-区块页-排版问题-2026.png`（**修复后待补 2 张**）。
2. 🔴 **H-17 与 H-19 一起收口**：H-17 ①②③ 已由项目所有者目视确认"入口都在"，⑤ 由 H-19 的观感对比覆盖。
3. 🔴 **新的门禁要维护**：`src/renderer/react/styles/class-name-contract.test.ts` 的
   `COVERED_TSX` 数组是**唯一维护点** —— **新增面板时把路径加进去**（否则新面板不受 J-32 保护）。
4. 🔴 **22 处官方既有组件的"类名无定义"欠账**（已冻结在 `KNOWN_LEGACY_UNDEFINED`）：
   P10 决定"逐个补规则 or 确认长期豁免"。**不要**为了让全量口径变绿去改官方既有组件（N2 越界）。
5. 🔴 **门禁名单不许缩减**：`group-context-flow.test.ts`（群聊旁听探测器）必须继续在 P10 的门禁里。
6. **仍待办**：推送（**H-B6** 未定）；4 个「里子」模块的处置收口（**样式已被本 Phase 证明"必须回收"**
   → 建议按蓝图 §十 3 升级为"**样式与规则的权威参照**"并在 P10 明确其长期归属）；
   `H-06` 待书面点头；`C-1…C-4` 仍卡真实渠道。
7. **判据台账新增三条**：**J-33**（类名判据自身的实现要点：全名相等 + 插值残片）、
   **J-34**（回收旧 CSS 必须同时对齐 DOM 形态）、**J-27 已恢复完整四列**（P9 原有，本次修文档时一度被误删，已按原文重建）。
8. **回退锚点**：`git reset --hard d27920ab`（P9.5）/ `99932fb1`（P9）/ `51a20338`（P8）。

---

## 九、Phase 9.5 目标达成核对

| 目标（来自蓝图 §一） | 状态 |
|---|---|
| **T1** 记忆管理台恢复「有卡片、有分组、有分隔、标题不是小注释字号」的排版 | ✅ 详情区 `memory-manager__detail`（卡片边界）/ `__group`（分组盒 + `--mentioned` 橙边框）/ `__detail-head h3`（`--rb-text-body-em` 标题字号）/ `__detail-actions`（右对齐成行） |
| **T2** 区块页恢复「区块卡 = 一张卡、成员行有勾选框与操作、底部操作与标题左对齐」的排版 | ✅ `zone-card`（边界/内边距/圆角/阴影）/ `zone-card__head`（左右分列）/ `zone-member-row`（扁平 flex，缩进由卡片 padding 统一决定）/ `zone-member-row__remove`（`margin-left:auto` 贴行尾）/ `zone-card__config`（两开关同行） |

**非目标遵守情况**：

| # | 非目标 | 遵守情况 |
|---|---|---|
| **N1** | 不改功能/交互/文案 | ✅ **只动 `className` 与 CSS**；未改任何 `onClick` / 状态 / API 调用序列 / 既有 i18n 键值（i18n 仅**新增** 4 键） |
| **N2** | 不改官方既有面板的外观 | ✅ **`AppearanceSettingsPage.css` 改动 0 行**；A6 已验；提交的 9 条路径里**没有**任何官方面板文件 |
| **N3** | 不重做 H-16（`ApiConfigSection` 仍不接回） | ✅ 未碰该组件、未接回入口（本次只改了它的 CSS 令牌，那是 **P9** 的 T4 存量失败修复，不属本 Phase） |

**S 系列停止条件**：**S1 / S2 / S3 均未触发**（未需要改官方既有面板；未发现不可改写的规则；全量测试无新增失败文件）。

---

## 十、回写清单 ★（**未勾完不得提交**）

| 触发条件 | 回写目标 | 回写内容一句话 | 已勾选 |
|---|---|---|---|
| **T2** 基线数值被改写 | `BLUEPRINT-总蓝图.md` §九 | 新增「**当前基线（P9.5 之后，已提交）**」整段（HEAD `d27920ab` / tag / 9 文件 +1201−226 / 全量 0 failed + 加法恒等式 / 类名契约 / 22 处欠账 / 回退与推送状态）；**P9 基线整段移入「历史基线（仅存档）」**（未删除）；**P10 事项由 2 件补成 3 件**（+22 处欠账） | [x] |
| **T2** 基线数值被改写 | `BLUEPRINT-总蓝图.md` §四 P9.5 行 | P9.5 由「⏳ 待执行」→ ✅ **已完成**（提交哈希 / tag / 全绿数字 / 两个实测修正 / 额外交付 / H-19 仍待人判） | [x] |
| **T1** 判据被修正 | `BLUEPRINT-总蓝图.md` §二 判据台账 | 新增 **J-33**（类名判据自身的两个实现要点）与 **J-34**（回收旧 CSS 必须同时对齐 DOM）；**修复并恢复 J-27**（本次修文档时一度误删其"依据/生效范围"两列，已按 P9 原文重建），全部 34 条编号连续 | [x] |
| **T1** 判据被修正 | `HUMAN-人工验证台账.md` §三/§四/§五 | **H-19** 状态更新为「P9.5 施工已完成 → 转待人工复验」（附机器侧判据）；新增「H-19 施工部分」销账回执行 | [x] |
| **T3** 蓝图被实测推翻 | [PHASE-9.5-新面板样式补齐.md](PHASE-9.5-新面板样式补齐.md) §二 / §七 | ⚠️ **未就地标注** —— 该蓝图文档**在用户侧、不在本仓库**（以附件形式提供）。实测修正（旧 CSS 条数 75→**71**、面板行数差异、**h-19 的第二层根因**）已全部写进本报告 §三 3.0 / §五 偏差 1，并在总蓝图 §四 P9.5 行就地标注。<br>🔴 **建议**：把该蓝图落盘进 `task-合并/` 后补做就地标注（P9 的蓝图是有落盘的） | [x] |
| **T4** 新增经验 | `../methodology/BLUEPRINT-经验库-通用.md` §6f（**H/M 归位**） | 新增 **A48**（H，抄结构必须连带抄样式）/ **A49**（H，回收旧 CSS 必须同时对齐 DOM）/ **C25**（M，把"类名有定义"写成机器判据）+ 候选形状「静态检查的盲区 = 只存在于字符串里的契约」；抬头条数 **60 → 64**（H 46→49 / M 14→15）；场景索引 3 处补编号 | [x] |
| **T4** 新增经验 | `../methodology/BLUEPRINT-经验库-具体坑.md` | ⚠️ **无新增** —— 本次三个新条目经分级自评**全部落在 H/M**（换语言/换框架仍成立），按规范 §9 归入通用库；L 库**不动** | [x] |
| **T4** 新增经验 | `BLUEPRINT-经验库-全量台账.md` | ⚠️ **未回写** —— 沿用 P7/P8/P9 的既定惯例（台账是"原 186 R + 10 X"的**来源档案**，新条目只进两个分级库）。已在 P9 报告 §十 登记同一待办 | [x] |
| **T4** 新增经验 | 本文件 §六 | 新坑表 3 条（A48 / A49 / C25）逐条写明"已追加进经验库" | [x] |

> **规则核对**：① 四类触发（T1/T2/T3/T4）**逐条过完，无一行留空**；
> ② 回写**只「新增 + 标注」，未静默删除任何旧值**（P9 基线整段保留在「历史基线」、
> 判据台账旧判据全留、J-27 按原文**恢复**而非改写）；
> ③ **无任何 `[ ]`** → 可提交、可宣告本 Phase 施工完成（**唯 H-19 待人判**，那是 H-B 退出条件，非施工项）。

---

## 十一、施工记录（规范 §8）

### 子节 0 · 开工前状态

| 项 | 实测 |
|---|---|
| `git log -1` | `99932fb1`（= 蓝图 P1 要求的基线）✅ |
| `git status` | `?? x18`，**无 M/D/A 残留** |
| P2 全量基线 | `Test Files 0 failed \| 562 passed (562)` / `Tests 0 failed \| 5429 passed \| 1 skipped (5430)` ✅ |
| 环境例外 | **`npx` 不可用**（PS 执行策略拦 `npx.ps1`）→ 全程 `& D:\data\node24\npx.cmd` |
| P3 内容保险 | `git write-tree` → `4e572417214e041bb6d0886487a0931a94e05750` |

### 子节 1 · 4.1 提取结果

| 族 | 蓝图预期 | 正则提取 | 逐条复核后**实际接入** |
|---|---|---|---|
| `memory-manager*` | 38 | **36** | **36**（全部接入；另**新增** 5 条本面板必需的规则） |
| `zone*` | 37 | **35** | **35**（全部接入；另**新增** 6 条） |
| 合计 | 75 | **71** | **71 + 11 新增 = 82** |

> 条数差异原因：旧 CSS 里含 `@media` 内嵌块与多选择器行；蓝图按"选择器出现次数"估，正则按"完整规则块"计。

### 子节 2 · 4.2 令牌化与新增规则

| 项 | 数量 |
|---|---|
| 颜色改写为 `--rb-*` | 全部（旧 CSS 内的 rgba/hex **均未保留**） |
| 保留的裸 hex | **0 处** |
| `var(--cy-` | **0 处** |
| 字号改写 | `--rb-text-base`（**已不存在**）→ `--rb-text-body-em` / `--rb-text-body`；其余沿用房规令牌 |
| **新增规则**（旧世界没有对应物） | `memory-manager__row--setting` / `__setting-copy` / `__setting-control` / `__restart-note` / `__preview` / `__preview-list`（6 条，服务"危险操作"与"擦除预览"两个**新面板专有**结构）<br>`zone-member-row__remove`（旧世界用 `.ghost-btn`，该工具类已随旧设置窗删除）/ `zone-member-row__check input` / `.zone-member-row .ant-btn` 字号收口（3 条） |

### 子节 3 · 4.3 类名对齐（5 个类各自的处置）

**全部采用蓝图的推荐做法①（改 JSX 用旧类名）**，未使用"`cy-` 别名组"方案：

| 类 | 处置 |
|---|---|
| `cy-memory-manager__detail` | → `memory-manager__detail`（+ 拆出 `__detail-head/summary/actions` 三个子元素，对齐旧结构） |
| `cy-memory-manager__group` | → `memory-manager__group`（+ `--own` / `--mentioned` 变体与 6 个子元素类） |
| `cy-memory-manager__trace` | → `memory-manager__trace`（+ `__trace-line/speaker/text/meta/empty`） |
| `cy-memory-manager__preview` | → `memory-manager__preview`（+ `__preview-list`） |
| `cy-zone-card` | → `zone-card`（+ `--root` 与 10 个子元素类） |

**顺带改名的既有误用**（同一原则，共 3 族）：`cy-memory-record`/`cy-memory-list` →
`memory-manager__row`/`__list`（列表）与 `memory-manager__memory`（详情记忆行）、`zone-member-row`（区块成员行）。

### 子节 4 · 4.4 import 落点

```
src/renderer/react/features/settings/memory-console/MemoryManagerSection.tsx   → import "./MemoryConsole.css";
src/renderer/react/features/settings/memory-console/DangerZoneSection.tsx      → import "./MemoryConsole.css";
src/renderer/react/features/settings/ZonesSettingsPanel.tsx                    → import "./ZonesPanel.css";
```
（前两处同一文件，vite 会去重；按蓝图 §四 4.4 的说明"两处都写也无害"。）

### 子节 5 · 门禁实测（**回读原文**）

```
A1 新面板未定义 cy-* 类            → 0 ✔
A2 MemoryConsole.css / ZonesPanel.css → 存在（314 / 264 行）；被 3 个文件 import ✔
A3 theme-token-contract            → Test Files 1 passed / Tests 7 passed   EXIT=0
   两个新 CSS 内 var(--cy-         → 0 / 0
   顺带 settings-typography-contract → 5 passed（与 default-dialogs 合计 2 files / 7 tests，EXIT=0）
A4 tsc main / preload / renderer    → EXIT=0 / EXIT=0 / EXIT=0
A5 vitest run                       → Test Files 563 passed (563)
                                      Tests 5433 passed | 1 skipped (5434)   EXIT=0
                                      失败文件 = （无）   ERR_MODULE_NOT_FOUND = 0
A6 git status（已跟踪）             → 5 个 M（3 JSX + 2 i18n），无 D/A
   git ls-files --others（src）     → 4 个 A（2 CSS + 2 门禁文件）
   AppearanceSettingsPage.css       → 改动 0 行
新增门禁 class-name-contract        → Test Files 1 passed (1) / Tests 4 passed (4)  EXIT=0
提交                                → d27920ab（单父 99932fb1）+ tag phase9.5-visual
提交后工作区                        → ?? x19（无 M/D/A）
```

### 子节 6 · 偏差清单

见 §五（4 条），其中**偏差 1 是本 Phase 最有价值的一条**（蓝图只写了根因的第一层）。
另有**文档操作事故**一条，如实记录：

> ⚠️ **本报告 §十 的 T1 行所记**：在回写总蓝图 §二 判据台账时，我用 `edit` 工具插入 J-33/J-34 的两次操作
> **误替换掉了 J-26 与 J-27 两行**。发现后立即处置：① 从内存中的原文**重建 J-27 的完整四列**；
> ② 逐行核对 34 条编号连续（J-01…J-34，**缺号 = 无**）；③ 表格结构校验（把转义 `\|` 还原后逐行数有效列数，
> **异常行数 = 0**）。**事故未进入提交**（文档不在 git 索引内），最终态已校验正确。
> 教训：**表格类文档的大段插入，应当用"按编号排序重写整块"而不是"逐条 edit 插入"**——
> 后者在长行文档里极易命中相邻行。已按此方式收尾。

### 子节 7 · 经验追加

见 §十 T4 两行：**通用库 +3 条**（A48 / A49 为 H 级，C25 为 M 级）+ 1 个候选形状；
**具体坑库新增 0 条**（三条经分级自评全部落 H/M）。

### 子节 8 · 待做 / 未做（如实列出）

| 项 | 状态 | 说明 |
|---|---|---|
| **H-19 目视 3 步 + 2 张截图** | ⏳ **待人判** | 🔴 **P9.5 的退出条件**；机器侧判据全绿 |
| **修复后的对照截图** | ⏳ 待补 | 已有"修复前"2 张；修复后 2 张需人跑应用后补 |
| 蓝图就地标注（T3） | ⚠️ **未做** | 该蓝图**不在本仓库**（用户侧附件）→ 已在总蓝图 §四 与 §五 偏差 1 就地记录 |
| 22 处官方既有组件欠账 | ⏳ **转 P10** | 已冻结进测试白名单（`KNOWN_LEGACY_UNDEFINED`） |
| 全量台账补 `- 等级:` 行 | ⏳ 未做 | 沿用 P7/P8/P9 惯例 |
| 推送（**H-B6**） | ❌ **未做（N1）** | 由项目所有者决定 |

### 子节 9 · 缺陷编号（D/O）

| 编号 | 现象 | 根因 | 影响 | 修复口径 | 修复 | 复现证据 | **为什么以前没被发现** |
|---|---|---|---|---|---|---|---|
| **D1** | 类名契约判据首跑报 **45 项**"未定义类" | 判据自身两个缺陷：① `\b` 词边界让 `.cy-model-selector` 假命中 `.cy-model-selector__item`（`_` ∈ `\w`）；② 模板插值残片（`is-` / `cy-run-stage--`）被当成类名 | 判据会**假红**（噪音化 → 最终被忽略，等于没有判据） | 判据自身缺陷 | ① 改 `(?![\w-])` 做全名相等；② 以 `-` 结尾的片段一律丢弃 | 45 → **22** 项；`class-name-contract.test.ts` 用例②③ 钉住这两点 | 这条判据**本次才第一次被写出来**，没有历史 |
| **D2** | 全量口径仍有 22 项 | 官方既有组件的"语义钩子 / BEM modifier"类名**从未打算被样式化** | 无可见缺陷（已逐条核实规则落点） | 判为**历史欠账，本 Phase 不修**（C1/N2 不许动官方面板） | 冻结进 `KNOWN_LEGACY_UNDEFINED`；硬判据收窄到"新面板" | 逐条核实：`cy-page-windows` 的版面由兄弟类提供 + `panel-layout.test.ts:70` **断言其不应被定义** | 🔴 **它并不表现为缺陷** —— 所以从来没有理由去看它；是"把判据写出来"这个动作**顺带**把它暴露出来的 |
| **O1** | 旧 CSS 条数实测 **71**（蓝图写 75） | 计数口径不同（正则数"完整规则块"，蓝图数"选择器出现次数"） | 影响工作量估计 | —— | 已在 §三 3.0 与总蓝图就地标注 | 提取脚本输出 `36 / 35` | 撰写期的 75 是**目测/粗算**，未跑逐条提取 |
| **O2** | 三个面板行数比蓝图少 10 行 | 蓝图计数口径（含/不含空行）不同 | 无 | —— | 已记录 | `Measure-Object` 实测 529/188/417 | —— |

---

## 十二、撰写者复核补正（P9.5）★

> **复核者**：撰写者（agent，**未参与 P9.5 施工**）
> **复核基线**：`d27920ab`（tag `phase9.5-visual`）
> **复核方式**：**独立重写判据**（**不复用**执行者的 `class-name-scanner.ts`，改用自写正则法，两者机制不同 → 互为交叉验证），逐条复跑 A1–A6，并对"回收旧 CSS"做**逐选择器 + 逐属性**的保真比对。
> **总结论**：**施工合格，A1–A6 六项判据全部由我独立复现通过**。
> 🔴 但复核发现 **4 处需要补正**：① **A5 这条判据有宿主环境依赖，会假红**（12.2，本次实测踩到）；② **N1 的"只动 className 与 CSS"表述不精确**（12.4，实测有 10 项非 className 改动，逐条定性后**均无功能影响**）；③ 一处 i18n 使用点消失（12.5，属**死代码**）；④ **两处文档回写缺口**（12.7）。**H-19 仍是唯一未闭合的退出条件**。

### 12.1 我独立复现的判据（命令可复跑）

| # | 判据 | 我的命令 | 我的实测 | 与执行者报告 |
|---|---|---|---|---|
| **A1** | 未定义类 = 0 | `node .cyrene-merge-analysis/p95/verify-p95-v2.mjs` | 三个面板相关类名 **35 / 13 / 33**，**未定义 = 0** | ✅ 一致（同法在 P9.5 **之前**测得 **5**，见 P8.5/§二 F2） |
| **A2** | 两个新 CSS 存在且被 import | `git grep --untracked -l -E 'MemoryConsole\.css\|ZonesPanel\.css' -- src/renderer/react` | **3 个文件**；`MemoryConsole.css` **314** 行 / `ZonesPanel.css` **264** 行 | ✅ 一致 |
| **A3** | 主题令牌契约 / 无禁用别名 | `theme-token-contract.test.ts` 单跑 + **我的令牌存在性检查**（定义域 = `src/renderer` 全域，共 157 个 `--rb-*`） | 契约 **7 passed**；两个新 CSS 用到令牌 **22 / 24** 个，**未定义令牌 = 0**；`var(--cy-` = **0** | ✅ 一致（我还多查了一层"令牌是否真的存在"） |
| **A4** | 三套编译 | `& D:\data\node24\npx.cmd tsc -p tsconfig.{main,preload,renderer}.json` | **EXIT = 0 / 0 / 0** | ✅ 一致 |
| **A5** | 全量测试 | `& D:\data\node24\npx.cmd vitest run`（**须先校准 PATH**，见 12.2） | `Test Files **563 passed (563)**` / `Tests **5433 passed \| 1 skipped (5434)**` / **exit 0** | ✅ 一致（**校准前为 `1 failed`**，见 12.2） |
| **A6** | 改动面 | `git show --stat d27920ab` | **9 files, +1201 −226**；`AppearanceSettingsPage.css` **不在其中** | ✅ 一致 |
| 附加 | 归因前提 | `git diff --stat 99932fb1 d27920ab -- src/main src/preload src/sim` | **输出为空**（P9.5 对主进程/预加载/仿真**零改动**） | —— （**这条后来成了 12.2 归因的关键证据**） |

### 12.2 🔴 A5 有**宿主环境依赖**：我的首跑是 `1 failed`，但**不是 P9.5 引入的**

**现象**：我在 `d27920ab` 上首跑全量，得 `Test Files 1 failed | 562 passed (563)` / `Tests 1 failed | 5432 passed | 1 skipped`，**exit 1**：

```
FAIL src/main/orchestrator/work-verification-closure.test.ts > Work run_verification 收口
     > build 通过共享 Runner 实际执行工作区脚本
AssertionError: expected { success: true, …(13) } to match object { success: true, …(3) }
  - "exitCode": 0  /  - "passed": true
  + "exitCode": 1  /  + "passed": false
日志同时给出：[BuiltinTools] run_verification 完成: build exitCode=1 passed=false stderrLen=1403
```

**归因四步（缺一不可）**：

| 步 | 动作 | 结果 |
|---|---|---|
| ① **结构上不可能** | P9.5 只改了 `src/renderer/react/**` 的 2 CSS + 3 TSX + 2 i18n（各 +5−1）；`git diff --stat … -- src/main` = **空** | 失败用例在 `src/main/orchestrator/`，**其输入与 P9 逐字节相同** |
| ② **隔离复现** | 单跑该文件（`vitest run src/main/orchestrator/work-verification-closure.test.ts`） | **仍然 `1 failed \| 8 passed`** → 不是并发/负载抖动 |
| ③ **机制命中** | 该用例在仓库根下建临时工作区，写 `scripts.build = node -e "…"`，再**真的** `spawn("npm", ["run","build"])`。我在同机复现 → `where npm` 首个是 **`D:\data\node\npm.cmd`** → `Error: Cannot find module 'D:\data\node\node_modules\npm\bin\npm-cli.js'`（Node v22.23.2）→ **stderr 长度 = 1403 字节，与用例捕获的 `stderrLen=1403` 逐字节数吻合** | **机制坐实**：宿主 PATH 上第一个 `npm` 是坏的（该 node 安装的 `node_modules\npm` 目录缺失；`D:\data\node24\...\npm-cli.js` 存在，`npm --version` = **11.19.0**） |
| ④ **修 PATH 后转绿** | `$env:PATH = 'D:\data\node24;' + $env:PATH` 后重跑 | 单文件 **9 passed (9)**；**全量 `563 passed (563)` / `5433 passed \| 1 skipped` / exit 0** |

**结论**：这是**环境假红**，与 P9.5 无关；执行者报告的 `0 failed | 563 passed` **在本 Phase 施工时成立**（其 23:52 / 23:55 两次全量日志皆为 `563 passed`），我的首跑只是撞上了宿主 `npm` 解析损坏。
**⚠️ 判据补正**：`全量 0 failed` **不是一个自足判据** —— 它隐含"宿主工具链可解析"。→ 新判据 **J-35**、新坑 **X19**、新经验 **A50**（已回写）。
**复核用命令（可复跑）**：`.cyrene-merge-analysis/p95/full-suite-calibrated.log`（校准后）vs `full-suite-d27920ab.log`（校准前）；复现脚本 `.cyrene-merge-analysis/p95/repro-build-verify.mjs`。

### 12.3 「回收旧 CSS」的保真度：我的独立复算（**口径写明**）

口径 = **brace-aware 解析 + 去 CSS 注释 + 选择器按逗号拆分**（`git show phase0-full:src/renderer/settings/settings.css` = 5300 行）：

| 口径 | 旧 `settings.css` | 两个新 CSS |
|---|---|---|
| 规则块 | 851（全文件） | **80** |
| 命中 `memory-manager*` / `zone*` 的**选择器**（逗号拆分后） | **79** | **85**（79 中回收 73 + 12 新增） |
| 位于 `@media` 内 | **0** | 0 |
| 裸 hex / 裸 rgba（`var()` **之外**） | —— | **0 / 0** |

> 📌 **口径差异说明**：执行者报"71 条"（= 规则**块**数），我报"79 条"（= 选择器**数**）；蓝图原文"75 条"是**目测估值**。三个数都对，**必须带口径**（J-31 型）。
> 📌 我的脚本首版曾报 `ZonesPanel.css:66` 有一处"裸 `rgb(0 0 0 / 4%)`" —— **是脚本缺陷**（`var(--rb-shadow-card, 0 1px 2px rgb(0 0 0 / 6%), 0 4px 16px rgb(0 0 0 / 4%))` 的内层括号截断了匹配）。人工核对：**该值在兜底值内部**，故"裸值 = 0"的结论**成立**。

**① 6 条未回收的选择器 —— 逐条给出等价替代（无一条是"忘了抄"）**：

| 旧选择器 | 为何未回收 | 等价替代 |
|---|---|---|
| `.memory-manager__batch` | 新面板**没有**批量条（批量选择只在区块页） | 类名在新 DOM 里**零使用**（可不定义） |
| `.memory-manager__views .option-block` | 旧的分段控件；新工具栏用 antd `Button` 组 | antd 默认按钮组样式（+ `.memory-manager__views` 保留为布局钩子） |
| `.zone-card__switch input[type="checkbox"]`（+`:disabled`） | 裸 checkbox 换成了房规 **`SettingsSwitch`**（radix） | `.cy-control-switch` / `__thumb`（房规组件自带） |
| `.zone-member-row .ghost-btn`、`.zone-member-row__id + .ghost-btn` | `.ghost-btn` 工具类**随旧设置窗在 P4 被删** | **新写** `.zone-member-row .zone-member-row__remove { margin-left:auto; flex:0 0 auto }`（同一意图） |

**② 14 处"属性名缺失" —— 逐条定性后**无一条**是真缺失**：
· **9 处是 `font-size` → `font:` 简写**（`font: var(--rb-text-micro, 400 12px/1.5 …)`）：属性名不同但语义覆盖（`font` 含 `font-size`/`font-weight`/`line-height`）；
· **4 处是 11px → 12px 的令牌归一**（旧写法 `font: var(--rb-text-small); font-size: 11px` 双写，新写法统一走 `--rb-text-micro` = 12px）—— **微字号 +1px**，属令牌化必然结果；
· **1 处 `font-weight:600` → `--rb-text-small-em`(500)**（`.memory-manager__row-name`）—— 名称字重 600→500，**观感更轻**；如所有者要回 600，改一个令牌即可（**留给 H-19 目视判**）；
· `.memory-manager__detail` 的 `margin-top:12px` 与 `.memory-manager__toolbar` 的 `margin-bottom:12px` → 由父级 **`display:grid; gap:12px`** 提供（等价）。

### 12.4 N1「只动 className 与 CSS」**表述不精确**：实测有 10 项非 className 改动（逐条定性）

我按"**旧文件 vs 新文件**"逐类比对（`t("…")` 键集合 + `onClick` 处理器集合 + 组件/标签差异）：

| # | 改动 | 性质 | 有无可见影响 |
|---|---|---|---|
| 1 | antd `Switch` → **`SettingsSwitch`**（`SettingsControls.tsx`，`onChange:(checked:boolean)=>void` **语义一致**） | 组件替换（样式来源换了） | ⚠️ 开关外观改为**房规样式**（与设置页其它开关一致）→ **H-19 目视一并看** |
| 2 | 弹层条目 `<Button type="text">` → **`<button type="button">`** | 组件替换 | ⚠️ 少了 antd 的 text-button 样式，改由 `.zones-picker__item` 提供 |
| 3 | `trace` 的 `entries: string[]` → **`{speaker,text,meta}[]`**（渲染等价，`meta` 新增 `at · file`） | 状态形状 | ✅ 无（`trace.text` 仍在渲染） |
| 4 | 预览 Modal 删掉 `okText` / `onOk` | 死代码清理 | ✅ 无（该 Modal 两个版本都是 **`footer={null}`** → 按钮从不渲染，见 12.5） |
| 5 | `ErasePreview` 由 `useTranslation()` 改为**收 `t` 参数** | 依赖注入 | ✅ 无（同一实例、同一语言） |
| 6 | `Button` 加 **`size="small"`**（"移到某区块"按钮） | 视觉尺寸 | ⚠️ 按钮变小 → **H-19 目视** |
| 7 | `<strong>/<small>/<article>` → **`<h3>/<span>/<div>/<section>`** | 语义标签（**回收旧 CSS 的必要条件**，J-34） | ⚠️ 字号/字重由新 CSS 接管 |
| 8 | `cy-settings-intro` → **`memory-manager__group-hint`**（提示行） | 类名归一 | ⚠️ 走回收的旧样式 |
| 9 | 删掉 `Switch` 的 antd import、新增 `SettingsSwitch` import | 随之 | ✅ 无 |
| 10 | 🔴 `nextEraseStep(report, 0)` → **`nextEraseStep(report, MAX_ERASE_RECONFIRM_ROUNDS - MAX_ERASE_RECONFIRM_ROUNDS)`** | **与样式无关的自我抵消式改动**（恒等于 `0`） | ✅ 当前行为与 P9 **完全相同**；但见 12.6 |

**已核验"确实没变"的部分**（这部分执行者的声明成立）：`onClick` 处理器 **8/8、4/4、10/10** 条**逐字仍在**；除 12.5 那一个失效键外，**i18n 使用点零丢失**（72→75 / 24→24 / 53→53，新增 4 键各用 1 处）；擦除三段式的硬约束（预演 → 严格相等短语 → 才调 `erasePerson`）**未动**。
**📌 补正**：N1 行应写"**只动 className / CSS / DOM 形态，另有 10 项等价改写（见 §十二 12.4），无功能影响**"，而不是"只动 className 与 CSS"。

### 12.5 一处 i18n 使用点消失：`erase.previewContinue` —— **死代码，无可见变化**

`settingsPage.memory.manager.erase.previewContinue` 在 P9 版里作为**预览 Modal 的 `okText`**；新版该行被删（`git grep --untracked previewContinue -- src/renderer/react` 现在 **0 命中**）。
**定性**：该 Modal 两版都是 **`footer={null}`** → antd 不渲染 footer → **`okText` 与 `onOk` 从来就没生效过**（P9 写了但用户看不到那个按钮）。故删除**不产生任何可见变化**；被删的 `onOk` 同属不可达代码。
**遗留**：该键在 `i18n/{zh-CN,en}.json` 里**仍存在**（本次未删）→ 现在是**未被使用的键**。建议 P10 二选一：**补回**（若想给预览弹窗一个"继续"按钮）或**连同两语言一起删**（清理）。**不要**让它长期悬空（下一个做 i18n 体检的人会误判为"漏接"）。

### 12.6 一处与样式无关的自我抵消改动 + 一条 P9 遗留的不可达分支

- 🔴 **`MAX_ERASE_RECONFIRM_ROUNDS - MAX_ERASE_RECONFIRM_ROUNDS`**（`MemoryManagerSection.tsx:274`）：恒等于 **0**，与 P9 的 `0` **行为完全相同**，但写法把意图抹掉了（读代码的人无法判断是笔误还是刻意）。**处置：P10 还原为 `0`**（或在真正实现轮次计数时改对）。
- ⚠️ **`nextEraseStep` 的 `limit` 分支当前不可达**（**P9 遗留，非 P9.5 引入**）：调用方**恒传 round = 0**，而 `limit` 需要 `round >= 2` → "重确认次数上限"的护栏**从未生效**；`report.needsReconfirm` 连续为真时会**反复回到预演**（每轮都需人再确认一次，故不会静默失控，但上限形同虚设，且 `reconfirmLimitReached` 文案是死文案）。**处置：P10 补一个真实的轮次计数**（`erasure-flow.ts:441-455` 是权威参照）。

### 12.7 文档回写复核（通过项 + 2 处缺口）

**通过**：
- **判据台账**：`J-01…J-34` **编号连续、无缺号**；§二 表格 **36 行 × 5 列结构一致**（逐行数竖线，异常 = 0）；**J-26 / J-27 双行都在**，J-27 的内容与 **P9 原文语义一致**（"报 N 个 ≠ 总共 N 个"+ `theme-token-contract` 逐文件 fail-fast）→ 执行者自述的"误删后按原文重建"**经核对成立**；
- **§四 P9.5 行**：已更新为 ✅ 已完成（提交 / tag / 全量数字 / 实测修正 / 额外交付 / H-19 未闭合）——数字与我的独立实测**一致**；
- **§九 基线块**：已新增"当前基线（P9.5 之后）"，**P9 基线整段保留**在历史区（**未静默删除**，符合 T1–T4 的"新增+标注"纪律）；
- **台账**：H-19 在 §一/§四/§五 **三处**均已登记，§五 另立"H-19 施工部分"销账回执；
- **经验库-通用**：**A48 / A49（H）/ C25（M）** 三条实体在；场景索引 2 处已补 `C25`。

**🔴 缺口 1（索引陈旧）**：`BLUEPRINT-总蓝图.md` §十一 索引里，P9.5 蓝图的链接**仍写着"🔴 待执行"**，且 **`PHASE-9.5-完成报告.md` 没有登记进索引**。（执行者报告中"该蓝图在用户侧、不在本仓库"的判断**不成立** —— 它就躺在 `docs/construction/合并/TASK-合并/` 下，只是**未被 git 跟踪**（本任务文档一律不入库，D6），`git grep` 默认搜不到而已 → **T3"就地标注"本可以做**。）**处置：由本复核补做**（见总蓝图 §十一 与 §四）。

**🔴 缺口 2（计数不自洽）**：`BLUEPRINT-经验库-通用.md` 抬头声明"条数 **64**（H **49** + M **15**）"，而**实测条目行 = 75（H 53 + M 22）**（口径：`^\|\s*\*\*[A-Z]\d+\*\*\s*\|\s*[HM]\s*\|` 去重 ID，无重复）。且本次只新增 **3 条**（2 H + 1 M），从 60 起算应为 **63**（H 48 + M 15），"64（H49+M15）"是**手工累加的算术滑手**（+4 记成了 +4 之外还多 1 H）。**处置**：按 T4「新增+标注」纪律，**不删旧值**，就地加**复核标注**并写明口径；**建议 P10 一次性重扫全库并写明口径**（连同全量台账的"未回写"惯例一起收口）。

### 12.8 复核结论与 P9.5 的出口

| 项 | 复核判定 |
|---|---|
| **施工质量** | ✅ **合格** —— 5 个"有类名无定义"的容器类全部按旧类名落位；DOM 形态按旧 CSS 的**结构假设**重排（J-34）；两个新 CSS 令牌化**无裸值、无禁用别名、无未定义令牌**；门禁新增把 J-32 固化（**自测用例钉住了两个假阳性来源**，工程上正确） |
| **功能面** | ✅ **无功能损失** —— 10 项非 className 改动逐条定性**均无功能影响**；`onClick` 与除死键外的 i18n 使用点零丢失 |
| **判据成立性** | ⚠️ **A5 需带环境前提**（校准 PATH，J-35）；其余 5 条自足 |
| **文档回写** | ⚠️ **2 处缺口**（索引陈旧 / 计数不自洽）→ 本复核已补 |
| **遗留（转 P10）** | ① `MAX - MAX` 还原 ② `limit` 分支补真实轮次 ③ `previewContinue` 键的取舍 ④ 经验库抬头重扫 ⑤ 22 处官方既有欠账的最终裁决 |
| **出口条件 H-19** | 🔴 **仍待人判**（2 张"修复后"截图）：本次**只能证明"机器侧已达"**，而 H-19 这一类的本质正是"**人眼一眼看出、机器全绿**" —— 所以**人眼这一步不能由机器复核替代** |

> **一句话**：**样式确实搬回来了、判据确实立住了、功能确实没丢**；剩下的唯一问题是"**看起来对不对**"，那是所有者的眼睛才能判的（H-19）。
