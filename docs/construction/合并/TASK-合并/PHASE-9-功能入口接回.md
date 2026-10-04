# PHASE-9 施工蓝图：功能入口接回（Tier E）

> **状态**：⏳ 待执行
> **前置**：P8 已提交（`51a20338`，tag `phase8-merged`）；**P8.5 保真核验已完成**（[PHASE-8-合并保真核验报告.md](PHASE-8-合并保真核验报告.md)）
> **本 Phase 性质**：🔴 **Tier E —— 本任务第一个"往仓库里加代码"的 Phase**（P0–P8 全是"搬运/删除/修复"）
> **范围已被 D7 锁定**：**只做 3 条入口接回**（H-15 ①②③）+ 顺手修 2 条存量失败；**H-16 不做**（已拍板 B）
> **读者**：P9 执行者（无对话历史，只能读本蓝图 + 总蓝图 + 台账 + 源码）

---

## ★零、开工前必读（硬约束 + 陷阱）

### 0.1 六条硬约束（违反任一条 = 本 Phase 失败）

| # | 约束 | 理由 |
|---|---|---|
| **C1** | 🔴 **只在已提交的 `51a20338` 上开工**。开工前 `git log -1 --format=%h` 必须 = `51a20338`，`git status --porcelain` **只允许出现 `??`**（预期 17 条）。任何 `M`/`D`/`A` 都必须先查明来源 | P9 的第一个"已提交安全网"：`git reset --hard 51a20338` 可无痛回退 |
| **C2** | 🔴 **只加"入口"，不做"重排版"**。除 §四 4.4 的两处存量失败修复外，**不得改动官方既有组件的版面 / 样式 / 结构** | 项目所有者 D7 原话：「**我调了 UI 位置的原有功能**我后面再去改」——那类改动**不属于** P9 |
| **C3** | 🔴 **不许碰**：`src/main/channels/history-log.ts`、`src/main/corpus/**`、`src/main/channels/conversation-binding-store.ts`、`src/main/memory/**`、`src/main/zones/**`、`src/preload/index.ts` 的**既有方法签名** | 后端 + 桥**已实测完好**（P8.5 四层核验：本地能力丢失 = 0）。P9 是**纯渲染层接线**，一改后端就失去了"零风险"性质 |
| **C4** | 🔴 **不能直接 `import` H-07 保留的 4 个"里子"模块**（`settings/memory/{delete-all,erasure-flow,manager}.ts`、`settings/zones/panel.ts`） | ① 都耦合旧设置窗 DOM（`./dom`、`../shared/modal`）② `delete-all.ts` 依赖**已被 P4 删除**的 `../i18n` ③ `tsconfig.renderer.json` 的 include **不含 `src/renderer/settings/**`** → 它们**不在类型检查面内**，import 进来等于绕过类型门禁。**正确做法 = 抄其中的纯函数 + 新写测试** |
| **C5** | 🔴 新增 React 文件**必须**落在 `src/renderer/react/**` 内 | 同 C4 ③：只有这样才进 `tsconfig.renderer.json` 的 include 面 |
| **C6** | 🔴 **不推送**（`git push` = 非目标）；提交信息用 `-F` 且**文件必须无 BOM** | 沿用 P8 的 N1 + 经验 **X12**（PS 5.1 的 `-Encoding UTF8` 会写 BOM 并永久污染首行） |

### 0.2 六个陷阱（实测所得，照做即可避开）

| # | 陷阱 | 症状 / 对策 |
|---|---|---|
| **Y1** | `theme-token-contract.test.ts:73-74` 是**逐文件 fail-fast** —— 它遍历 `src/renderer/react/**` 下**全部** `.css`/`.tsx`，**第一个违规文件就抛错** | 修完 `ToolConsolePanel.css` **必须重跑**；可能还有下一个违规文件（**不要以为只有一个**）。改动面一旦超过 3 个 CSS 文件，**停下来报告**（可能超出"存量失败"的范围） |
| **Y2** | `default-dialogs-regression.test.ts` 用 **AST 扫全部 `.ts/.tsx/.js/.jsx`**（排除 `*.test.*` / `*.spec.*`） | 🔴 **新写的代码里也不许出现裸 `confirm(` / `alert(`**；`Modal.confirm(...)` 是**成员方法，明确豁免**（`default-dialogs-scanner.ts:7` 注释 + `:20-21` 自测） |
| **Y3** | **IPC 常量名 ≠ preload 方法名** | React 侧只能调 `window.memoryPanel.<方法名>`（如 `getZoneSnapshot()`），**不是** `IPC.ZONES_LIST`。写代码前先读 `src/preload/index.ts:600-638` |
| **Y4** | `deleteAll()` 与 `erasePerson()` 的**重启语义不同** | `deleteAll()` 之后**必须** `restartApp()`（`preload/index.ts:610` 注释：进程内缓存必须重启才失效）；`erasePerson()` **明确不需要**重启（`:618` 注释） |
| **Y5** | i18n **没有** zones 相关键 | 实测：`ui.toolConsole` **已存在**（`zh-CN.json:1952` = 控制台 / `en.json:1952` = Console）→ ①**不需要**补 i18n；但 `settingsPage.zones.*` 与记忆管理台的新键**必须自己加**（zh-CN + en **两个文件都要**，键集合必须一致 —— 台账 H-04 的代理指标要求两语言顶层键完全相同） |
| **Y6** | 官方 React 组件库是 **antd**（`Modal` / `Button` / `Input` / `Alert` / `Empty` / `Spin`）+ `lucide-react` 图标 | 新面板照 `MemorySettingsPanel.tsx:2-10` 的导入风格写，**不要引入新依赖** |

---

## 一、目标与非目标

### 1.1 目标（T1–T4）

| # | 目标 | 判定（可机器验） |
|---|---|---|
| **T1** | **① 渠道控制台接回**（最小改动：一行 import + 一行 JSX） | `ToolConsoleButton` 的非测试引用数 **≥1**；点开侧栏按钮 → 「控制台」面板真的渲染 |
| **T2** | **② 记忆台 + 按人擦除 + 删除全部记忆 + 群聊近期上下文条数**（在 `MemorySettingsPanel` 新增区块） | `src/renderer/react` 对 `listMemoryManager\|erasePerson\|erasePreview\|deleteAll\|groupContextLimit` 命中 **≥1**；4 个能力都能在 UI 上点到 |
| **T3** | **③ 区块页**（新建 `ZonesSettingsPanel.tsx` + 注册 `section="zones"`） | 新文件存在且被 `AppearanceSettingsPage` 引用；设置侧栏出现「区块」项；`getZoneSnapshot\|createZone\|deleteZone` 在 react 侧命中 ≥1 |
| **T4** | **顺手修掉两条存量失败**（③ `ToolConsolePanel.css` 令牌违规 / ④ `ToolConsolePanel.tsx:285` 的 `window.confirm`） | 全量测试 → **`Test Files 0 failed`**（两条都修好） |

> 🔴 **T4 的必要性**：控制台接回后（T1），这两条失败就从"存量问题"**升级为"用户可见面板的缺陷"**（红色面板 + 主题令牌不一致 + 原生弹窗）。不修等于把红点挂在自己的面板上。

### 1.2 非目标（N1–N6，越界即失败）

| # | 非目标 | 依据 |
|---|---|---|
| **N1** | **不推送** `origin`（Gitee `master`） | 沿用 P8 N1；推送由项目所有者决定 |
| **N2** | **不做 UI 重排版**：不改官方既有组件的布局/样式/文案 | **D7**（"我调了 UI 位置的原有功能"→ 所有者后续自改） |
| **N3** | 🔴 **不做 `ApiConfigSection`（H-16）** | 已拍板 **B 只登记、不接回**（D7 + 台账 H-16） |
| **N4** | **不改后端 IPC 契约**（不新增/改名 IPC 通道、不改 preload 方法签名） | P8.5 核验：后端 + 桥**完好**；改它们会引入新的端到端风险 |
| **N5** | **不引入新依赖**（antd / lucide-react / simple-icons 已在） | 保持 lockfile 不动（P8 的 N6 语义） |
| **N6** | **不动 4 个"里子"模块本身**（它们要"原封不动"留在仓库里当参照） | H-07 定案：保留 4 个 + 它们现在**无测试覆盖**，P9 的抄写不得反手改它们 |

---

## 二、事实清单（**全部为撰写者实测，执行者可直接采信；但按 J-13，动手前仍要自己扫一眼坐标**）

### F1 · ① 的四个前提**全部已就位**（只差两行代码）

| 事实 | 实测 |
|---|---|
| 面板类型已含 `"console"` | `ChatPageNavigation.tsx:25` → `export type ChatPagePanel = "plugin" \| "moments" \| "console" \| "scheduledTasks";` |
| 面板宿主已有 case | `ChatPagePanelHost.tsx:18` → `case "console": return <ToolConsolePanel />;`（且 `ToolConsolePanel.tsx` 存在） |
| 按钮组件存在且 props 已知 | `src/renderer/react/components/ui/ToolConsoleButton.tsx:3-6` → `{ active?: boolean; onClick?: () => void }` |
| **i18n 键已在** | `ui.toolConsole` = `zh-CN.json:1952`「控制台」/ `en.json:1952`「Console」 |
| 只差什么 | 该文件**当前对 `ToolConsoleButton` 的引用数 = 0**（P8.5 实测） |

**插入位置（实测坐标）**：`ChatPageNavigation.tsx`
- import 区：`:11` 是 `SidebarToggle`、`:12` 是 `UserAvatar` → **在 `:12` 位置插入新 import**（保持字母序）
- 按钮组容器：`<div className="cy-page-newtask">`（`:124`），其中 `:131` = `<ScheduledTasksModeButton …/>`、`:132` = `<MomentsModeButton …/>` → **在 `:132` 之后插入一行**

### F2 · React 侧访问记忆能力的**唯一**通道

`src/preload/index.ts:600-638`，`contextBridge.exposeInMainWorld("memoryPanel", memoryPanelApi)`（`:641`）。可用方法（**实测签名**）：

```
deleteAll()                                  // :609
restartApp()                                 // :611  ← deleteAll 之后必须调
listMemoryManager(view)                      // :613
queryMemoryManager(view, key)                // :614
deleteMemoryManager({ ids?, view?, key? })   // :615
erasePreview(personKey)                      // :617
erasePerson(personKey, previewId)            // :619  ← 不需要重启
traceMemorySource(memoryId)                  // :621
getZoneSnapshot()                            // :623
createZone(name)                             // :624
renameZone(zoneId, name)                     // :625
deleteZone(zoneId)                           // :626
updateZoneConfig(zoneId, patch)              // :627
addZoneMember(zoneId, member)                // :629
addZoneManualGroup(zoneId, channel, chatId, senderName?)  // :632
removeZoneMember(zoneId, member)             // :634
moveZoneMembers(targetZoneId, members)       // :636
```

### F3 · 记忆管理台的**视图枚举**（实测）

`src/main/memory/memory-console.ts:41` → `export type MemoryManagerView = "people" | "zones" | "sessions";`
旧面板 `settings/memory/manager.ts` 用的正是这三个视图（`:43` 默认 `"people"`，`:348` 切换，`:538` 列表，`:369` 查询，`:455/:510` 两种删除，`:318` 仅 `people` 视图可擦除）。

### F4 · 通用设置的读写模式（`groupContextLimit` 走这条）

`GeneralSettingsPanel.tsx` 实测：读 = `window.settings.getGeneral()`（`:52`）→ `readGeneral(config)`（`:54`）；写 = `window.settings.saveGeneral({ key: value })`（`:69 / :82 / :104`）。
`groupContextLimit` 的登记值（台账 H-02）：`DEFAULT_GROUP_CONTEXT_LIMIT = 10` / `MIN = 3` / `MAX = 50`，落在 `src/main/settings/general-settings.ts`。⚠️ **执行前自己复核这三个数**（J-13）。

### F5 · 设置页 section 有**三处**必须同改（漏一处就点不开）

`src/renderer/react/features/settings/AppearanceSettingsPage.tsx`：
- `:83` 联合类型：`\| "appearance" \| … \| "memory" \| "cyrene" \| …`
- `:266` 导航项：`<SettingsNavItem section="memory" currentSection={section} icon={…} label={t("settingsPage.memory.title")} onSelect={onSelectSection} />`
- `:282` 渲染三元链：`… : section === "memory" ? <MemorySettingsPanel /> : …`

### F6 · 两条存量失败的**确切根因**（实测）

| 项 | 根因 |
|---|---|
| **③** `theme-token-contract.test.ts:74` | 禁用正则（`:69`）= `var\(--cy-(?:accent(-hover)?\|bg(-(page\|workspace\|elevated\|hover\|active))?\|border\|danger\|surface\|text(-(primary\|secondary\|muted))?\|shadow-…)\b`；扫描面 = `src/renderer/react/**` 下**全部** `.css`/`.tsx`（`:70-71`）。`ToolConsolePanel.css` 实测 ~50 处 `var(--cy-…)` |
| **④** `default-dialogs-regression.test.ts:31` | AST 扫描器（`default-dialogs-scanner.ts:23-27`）只抓**裸调用** `alert/confirm` 与 `window.alert/confirm`；命中点 = `ToolConsolePanel.tsx:285` `if (!window.confirm(t("toolConsole.clearConfirm"))) return;`（在 `clearAudit` 内） |

**③ 的修复映射表**（`--rb-*` 全部已在 `ui/tokens.css` 声明，见 `requiredTokens` 列表）：

| 旧（被禁） | 新（角色令牌） |
|---|---|
| `var(--cy-bg-workspace, …)` | `var(--rb-surface-workspace, …)` |
| `var(--cy-bg-page, …)` | `var(--rb-surface-page, …)` |
| `var(--cy-text, …)` | `var(--rb-text-primary, …)` |
| `var(--cy-text-muted, …)` | `var(--rb-text-secondary, …)` |
| `var(--cy-border, …)` | `var(--rb-border-default, …)` |
| `var(--cy-accent, …)` | `var(--rb-accent, …)` |

> 注：**裸 hex（`#fff` / `#d4380d` / `rgba(…)`）不在禁用面内** —— 只有 `--cy-*` 变量别名被禁。修的时候**只换变量名**，不动其它颜色。

### F7 · 当前基线（P8.5 在 `51a20338` 上独立复跑，**执行者开工前应能复现**）

```
全量测试 = Test Files  2 failed | 559 passed (561)
           Tests  2 failed | 5403 passed | 1 skipped (5406)     Duration ≈ 53s
失败用例 = ③ theme-token-contract.test.ts:74 「共享颜色使用角色令牌…」
           ④ default-dialogs-regression.test.ts:31 「uses no browser alert or confirm calls…」
ERR_MODULE_NOT_FOUND = 0        三套 tsc = 0 / 0 / 0
11 项保护功能基线（P8 实测） = 4/8/5/11/13/6/10/5/2/8/4
```
> 🔴 **T4 完成后的目标值**：`Test Files 0 failed | 561 passed (561)` / `Tests 0 failed | 5405 passed | 1 skipped (5406)`。

### F8 · 入口可达性的**当前值**（P9 完成后必须变正）

| 标识 | 现在（P8.5 实测） | P9 之后期望 |
|---|---|---|
| `ToolConsoleButton`（import 说明符口径，非测试引用） | **0** | **≥1** |
| `src/renderer/react` 对 `getZoneSnapshot\|createZone\|erasePerson\|erasePreview\|listMemoryManager\|deleteAll` | **0 命中** | **≥1** |
| `ZonesSettingsPanel` | 文件不存在 | 存在且被 `AppearanceSettingsPage` 引用 |

---

## 三、前置条件与停止条件

### 3.1 前置（P1–P5，逐条打勾）

| # | 前置 | 判定命令 / 期望 |
|---|---|---|
| **P1** | 基线干净 | `git log -1 --format=%h` = `51a20338`；`git status --porcelain` **只有 `??`**（预期 17 条） |
| **P2** | **跑一次全量测试拿到开工前基线** | `npx vitest run` → 必须命中 F7 的四个数字。🔴 **日志落盘用绝对路径 + 先 `New-Item -ItemType Directory -Force`**（经验 **X13**：`Tee-Object` 的目标路径在管道启动时求值，目录不存在 → **测试一次都没跑**却表现为"作业完成"） |
| **P3** | 三套编译面 = 0 | `npx tsc -p tsconfig.main.json` / `-p tsconfig.preload.json` / `-p tsconfig.renderer.json` |
| **P4** | 备份将要改的文件 | `.cyrene-merge-analysis/p9/pre-hashes.txt`（`git hash-object` 记 `ChatPageNavigation.tsx` / `MemorySettingsPanel.tsx` / `AppearanceSettingsPage.tsx` / `ToolConsolePanel.css` / `ToolConsolePanel.tsx` / `zh-CN.json` / `en.json`） |
| **P5** | 记住 11 项基线（F7 末行） | 若本 Phase 之后要删任何文件，**先**记下这 11 个数字（P8 偏差 5 的教训） |

### 3.2 停止条件（S1–S4，命中即停并报告）

| # | 条件 | 为什么停 |
|---|---|---|
| **S1** | P2 的基线**不等于** F7 的四个数字 | 基线漂移 → 后续所有对比失效 |
| **S2** | 三套 `tsc` 出现**新增**错误 | 说明改坏了类型面 |
| **S3** | 全量测试出现**新的**失败文件（超出 ③④ 两个） | P8 偏差 3 的教训：改/删文件会打破**"路径字符串引用"**的隐藏依赖（`readFileSync` 清单 / fixture 列表），**import 图看不见**（经验 **F18**） |
| **S4** | T4 的 CSS 修复需要动 **>3** 个非 `ToolConsolePanel.css` 的文件 | 说明"存量失败"范围比预定大 → 停下来让人决定是否纳入 P9 |

---

## 四、施工步骤（按顺序，每步有判据）

### 4.0 备份

```powershell
$m = 'E:\AI_Chating\cyrene-agent'
$dir = Join-Path $m '.cyrene-merge-analysis\p9'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$files = @(
  'src/renderer/react/features/chat/components/ChatPageNavigation.tsx',
  'src/renderer/react/features/settings/MemorySettingsPanel.tsx',
  'src/renderer/react/features/settings/AppearanceSettingsPage.tsx',
  'src/renderer/react/features/chat/components/ToolConsolePanel.css',
  'src/renderer/react/features/chat/components/ToolConsolePanel.tsx',
  'src/renderer/react/i18n/zh-CN.json',
  'src/renderer/react/i18n/en.json'
)
$files | ForEach-Object { "{0}  {1}" -f (git -C $m hash-object -- $_), $_ } |
  Set-Content -LiteralPath (Join-Path $dir 'pre-hashes.txt') -Encoding UTF8
"行数 = " + (Get-Content -LiteralPath (Join-Path $dir 'pre-hashes.txt') | Measure-Object).Count   # 期望 7
```

### 4.1 T1 · ① 渠道控制台接回（两行）

**改 `src/renderer/react/features/chat/components/ChatPageNavigation.tsx`**：

1. import 区（`:12` 处，`SidebarToggle` 与 `UserAvatar` 之间）加：
```tsx
import { ToolConsoleButton } from "../../../components/ui/ToolConsoleButton";
```
2. 按钮组（`:132` 的 `<MomentsModeButton … />` 之后）加：
```tsx
<ToolConsoleButton active={activePanel === "console"} onClick={() => onTogglePanel("console")} />
```

**判据 A1**：
```powershell
Select-String -Path src\renderer\react\features\chat\components\ChatPageNavigation.tsx -Pattern 'ToolConsoleButton' | Measure-Object   # 期望 ≥2（1 import + 1 JSX）
```

> ⚠️ **不要**改 `ChatPagePanel` 类型、不要改 `ChatPagePanelHost.tsx`（两者已就位）。**不要**动同容器内其它按钮的顺序（N2）。

### 4.2 T2 · ② 记忆管理区块（本 Phase 最大的工作量）

**参照物（只读，不改）**：
| 参照 | 取什么 |
|---|---|
| `src/renderer/settings/memory/manager.ts` | 管理台的三视图（`people`/`zones`/`sessions`）、列表 / 查询 / 两种删除、**仅 `people` 可擦除** 的规则 |
| `src/renderer/settings/memory/erasure-flow.ts` | 「擦除预览 → 强确认 → 执行」的三段式流程与文案规则 |
| `src/renderer/settings/memory/delete-all.ts` | 「删除全部记忆」的**强确认词**规则 |
| `src/renderer/react/features/settings/MemorySettingsPanel.tsx` | **落点**：现成的 `Card className="cy-memory-card"` 区块写法 + `window.memoryPanel.getData()` 的加载模式 + 末尾 antd `<Modal>` 的写法 |

**新建（建议落点，必须在 `react/**` 内 —— C5）**：
```
src/renderer/react/features/settings/memory-console/
  ├── rules.ts            ← 从 3 个"里子"模块【抄】纯函数（如 isDeleteAllConfirmed / isEraseConfirmed /
  │                          classifyManagerMemory / describePrivateMapping —— ⚠️ 名字与签名以执行者实读为准，J-13）
  ├── rules.test.ts       ← 【必写】新测试（这 3 个模块现在【无测试覆盖】）
  ├── MemoryManagerSection.tsx   ← 三视图列表 + 查询 + 删除 + 按人擦除
  └── DangerZoneSection.tsx      ← 删除全部记忆（强确认 + 二次确认 + 重启）+ 群聊近期上下文条数
```

**必须实现的 4 个能力**（调用面见 F2/F3）：

| 能力 | 调用序列 | 关键约束 |
|---|---|---|
| **记忆管理台** | `listMemoryManager(view)` → `queryMemoryManager(view, key)` → `deleteMemoryManager({ids})` 或 `({view, key})` | `view ∈ people\|zones\|sessions`（F3） |
| **按人擦除** | `erasePreview(personKey)` → 展示预览（条数/范围）→ 用户确认 → `erasePerson(personKey, previewId)` | **不需要重启**（Y4）；预览必须真的展示（这是隐私操作的告知义务） |
| **删除全部记忆** | 强确认词输入 → `deleteAll()` → 提示 → `restartApp()` | 🔴 **必须 `restartApp()`**（Y4）；确认词规则**照抄** `delete-all.ts`，不得自创 |
| **群聊近期上下文条数** | `window.settings.getGeneral()` 读 → 数字输入 → `window.settings.saveGeneral({ groupContextLimit })` | 范围 `MIN/MAX`（登记值 3–50，默认 10 —— **自己复核**）；对应台账 **H-02 / 作业单 B-8** |

**i18n（Y5）**：新增键必须**同时**写 `zh-CN.json` 与 `en.json`，且**两文件键集合保持一致**（台账 H-04 的代理指标会验这一点）。

**判据 A2**：
```powershell
# ① 调用面真的接上了（非测试文件）
git grep -l -E 'listMemoryManager|erasePreview|erasePerson|deleteAll|groupContextLimit' -- src/renderer/react | Where-Object { $_ -notmatch '\.test\.' }   # 期望 ≥2 个文件
# ② 纯函数确有测试
npx vitest run src/renderer/react/features/settings/memory-console   # 期望全绿（0 failed）
# ③ 新文件在类型检查面内
npx tsc -p tsconfig.renderer.json                                    # 期望 exit 0
```

### 4.3 T3 · ③ 区块页（新建 + 三处注册）

**新建** `src/renderer/react/features/settings/ZonesSettingsPanel.tsx`。

**参照物**：`src/renderer/settings/zones/{panel,state,dom,picker,manual-group}.ts`（**只读**）+ `src/main/zones/types.ts`（区块/成员的**数据结构真相**，只读）。

**三处注册（F5，缺一不可）**：`AppearanceSettingsPage.tsx`
1. `:83` 联合类型加 `| "zones"`
2. `:266` 附近加一行导航项（图标建议 `lucide-react` 的 `Layers`；文案 `t("settingsPage.zones.title")`）
3. `:282` 三元链加 `section === "zones" ? <ZonesSettingsPanel /> :`

**功能面（对应旧区块页的能力，调 F2 的方法）**：
- 列出区块快照（`getZoneSnapshot()`）
- 建 / 改名 / 删（`createZone` / `renameZone` / `deleteZone`）
- 成员增删移（`addZoneMember` / `removeZoneMember` / `moveZoneMembers`）
- **手动按群号加白**（`addZoneManualGroup(zoneId, channel, chatId, senderName?)`）—— 旧代码注释写明这是"新群还没产生会话时**唯一**能加白的入口"，**不要漏**
- 区块配置（`updateZoneConfig(zoneId, patch)`）

**判据 A3**：
```powershell
git grep -l -F -e 'getZoneSnapshot' -e 'createZone' -- src/renderer/react | Where-Object { $_ -notmatch '\.test\.' }   # 期望 ≥1
Select-String -Path src\renderer\react\features\settings\AppearanceSettingsPage.tsx -Pattern 'zones' | Measure-Object   # 期望 ≥3（类型 + 导航 + 渲染）
```

### 4.4 T4 · 修掉两条存量失败

**③ `ToolConsolePanel.css`**：按 §二 F6 的映射表**逐个变量名**替换（`--cy-*` → `--rb-*`），**不动其它颜色**。

```powershell
npx vitest run src/renderer/react/styles/theme-token-contract.test.ts
```
🔴 **Y1**：该测试 fail-fast，**改完一个文件必须重跑**；若还有别的违规文件，逐个同样处理；一旦超过 3 个文件 → **S4 停止条件**。

**④ `ToolConsolePanel.tsx:285`**：把裸 `window.confirm(...)` 换成 **成员方法形式**（antd `Modal.confirm`，Y2 明确豁免），**保持 `clearAudit` 的既有行为**（确认后才 `channelsAuditClear()`，成功后 `setAudit([])` + `setSelectedId(null)`，失败仍 `console.warn`）。

```powershell
npx vitest run src/renderer/default-dialogs-regression.test.ts   # 期望 2 passed（含它自己的扫描器自测）
```

### 4.5 全量门禁（**必须全绿才提交**）

```powershell
$env:PATH = "D:\data\node24;" + $env:PATH
npx tsc -p tsconfig.main.json ; npx tsc -p tsconfig.preload.json ; npx tsc -p tsconfig.renderer.json
npx vitest run                      # 期望：Test Files 0 failed | 561 passed (561)
                                    #       Tests 0 failed | 5405 passed | 1 skipped (5406)
# P8 的定向门禁（13 文件 / 273 tests）与语料/探测器（26 tests）照旧必须全绿
# 门禁名单【不许缩减】：group-context-flow.test.ts（群聊旁听探测器）必须留在里面
```

### 4.6 提交（**唯一一次 commit**）

```powershell
# 提交信息：无 BOM（X12）
$msg = @'
feat(P9): 接回渠道控制台/记忆管理台/区块页，并修掉两条存量失败

- ① 渠道控制台：ChatPageNavigation 补 import + JSX（面板类型与宿主早已就位）
- ② 记忆管理台 + 按人擦除 + 删除全部记忆 + 群聊近期上下文条数（MemorySettingsPanel 新区块）
- ③ 区块页：新建 ZonesSettingsPanel 并注册 section="zones"（含手动按群号加白）
- ④ 修 theme-token-contract（ToolConsolePanel.css 改用 --rb-* 角色令牌）
     与 default-dialogs-regression（window.confirm → Modal.confirm）
- 规则来源：D7（凡我方新增功能所依赖的 UI 入口，必须原封不动加回）
'@
[System.IO.File]::WriteAllText((Join-Path $m '.cyrene-merge-analysis\p9\commit-message.txt'), $msg, (New-Object System.Text.UTF8Encoding($false)))
git -C $m add -- <改动过的路径…>
git -C $m commit -F .cyrene-merge-analysis\p9\commit-message.txt
git -C $m log -1 --format='%h %s'
git -C $m status --porcelain    # 期望只剩 ??
```
> 🔴 **不推送**（N1）。🔴 提交后 `git tag phase9-entries`。

### 4.7 台账与文档销账

| 目标 | 内容 |
|---|---|
| `HUMAN-人工验证台账.md` | **H-15 → ✅ 销账**（①②③ 已接回，附判据命令与结果）；**H-02 / H-03 → 转为"待人工复验"**（控件已就位，等人点）；**H-01 / H-05 不变**（仍需人眼）；新增 **H-17** 的登记（见 §五） |
| `BLUEPRINT-总蓝图.md` §四 | P9 行 → ✅ 已完成（记提交哈希 + 全绿数字）；§九 追加「P9 之后」新基线 |
| `验证作业单.md` | A 类门禁期望值更新为 `0 failed`；**C-3 / C-4 的前置阻塞解除**（控制台已有入口） |
| 经验库 | 若过程中踩到新坑，按 T4 追加（键号顺延） |

---

## 五、人工环节

### 5.1 H-A（施工前 · 阻塞项）：**无**

范围已由 **D7** 锁定（3 条接回 + 2 条存量失败），本 Phase **不需要新的拍板**。
以下三项若执行者认为需要变更，**按 S 系列停下并报告**，不要自行决定：
① 是否把 `ApiConfigSection`（H-16）也接回（**已拍板不做**）；② 是否扩大 UI 重排版（**D7 说不做**）；③ 是否改后端契约（**N4 说不做**）。

### 5.2 H-17（施工后 · **本 Phase 的退出条件，必须人判**）

| 步骤 | 期望 | 实测 | 判定 |
|---|---|---|---|
| 1. 打开聊天页，看左侧按钮列 | 出现**「控制台」**按钮（与「定时任务」「朋友圈」同列，位于其下方） | | |
| 2. 点它 | 右侧出现**工具调用控制台**面板（含「白名单与权限」「关键词策略」「审计日志」等区块），**不再有原生 confirm 弹窗** | | |
| 3. 设置 → 记忆 | 出现新区块：**记忆管理台**（people/zones/sessions 三视图可切、可查询、可删）+ **按人擦除**（可预览）+ **删除全部记忆**（强确认词 + 重启提示）+ **群聊近期上下文条数** | | |
| 4. 设置侧栏 | 出现**「区块」**项；点开后能建区块、加成员、**按群号手动加白** | | |
| 5. 控制台的颜色观感 | 与设置页其它面板**主题一致**（不再是另一套配色） | | |

> 截图 3 张：① 侧栏含「控制台」按钮 ② 控制台面板展开 ③ 设置 → 记忆新区块 + 区块页。

### 5.3 H-B6（仍未定）：是否推送 `origin`（Gitee `master`）
### 5.4 H-C：本次销账 **H-15**；`H-02 / H-03` 转为待人工复验

### 5.5 🔴 **B / C 类人验清单（P9 之后的状态）**

> 来源：`验证作业单.md` 的 A/B/C 三类 + `验证作业单-执行报告.md` 的实测结论 + 台账 H-nn。
> **A 类（机器判据）10 条**已全绿，不在此表。

| 编号 | 事项 | 现在能否验 | P9 之后 |
|---|---|---|---|
| **B-3** | H-01 顶栏「用量」徽章 | ⏳ **现在就能验**：`UsageBadge.tsx:171` 在 `sessionId` 为空时不渲染 → **先选中一个会话**，再看顶栏右侧 | 不变（与人/环境无关） |
| **B-4** | H-05 顶栏与聊天页布局 | ⏳ **现在就能验**：需一张**含顶栏**的截图（侧栏开关 / 模式切换 / 用量徽章 / 窗口控件同行不重叠 + 缩窄窗口不溢出） | 不变 |
| **B-8** | H-02 群聊近期上下文条数 | 🚫 **现在不能**（记忆页无该控件） | ✅ **P9 后可验**（T2 的第四个能力） |
| **B-9** | H-03 弹窗确认门（6 步） | 🚫 **现在不能**（缺「删除全部记忆」按钮） | ✅ **P9 后可验**（T2 + 第 5 步用区块命名弹窗） |
| **B-6** | H-13 运行期隐私边界 | 🚫 第 1–4 步需**模型服务 + 真实渠道**；第 5 步需**区块注入开关** | 🟡 **第 5 步 P9 后可验**；1–4 步仍待环境 |
| **C-1** | H-08 群聊旁听 | 🚫 需**模型服务 + 能收消息的真实渠道**（当前 `[WechatBot] No credentials`） | 不变（环境依赖） |
| **C-2** | H-09 渠道会话不落桌面对话 | 🚫 同上（另需读 `%APPDATA%\live2d-cyrene\transcripts\…`） | 不变 |
| **C-3** | H-11 渠道审计可见性 | 🚫 **双重缺失**：环境 + 控制台无入口 | 🟡 **入口已解除**（T1）；仍需环境 |
| **C-4** | H-12 工具白名单 + 拦截关键词 | 🚫 同上 | 🟡 **入口已解除**（T1）；仍需环境 |

> **一句话**：**现在立刻能验的只有 2 条（B-3 / B-4）**；**P9 完成后新增可验 3 条**（B-8 / B-9 / B-6 第 5 步）；**剩下 4 条（C-1…C-4 + B-6 的 1–4 步）卡在"模型服务 + 真实渠道"** —— 那需要一个真正配置好的 QQ/NapCat 或其它渠道。

---

## 六、验证判据（A 类，逐条可机器判）

| # | 判据 | 期望 |
|---|---|---|
| **A1** | ① 接回 | `ChatPageNavigation.tsx` 内 `ToolConsoleButton` 命中 **≥2**；该组件的**非测试引用数 ≥1** |
| **A2** | ② 调用面 | `git grep` 在 `src/renderer/react`（排除 test）命中 `listMemoryManager\|erasePreview\|erasePerson\|deleteAll\|groupContextLimit` **≥2 个文件** |
| **A3** | ③ 注册三处 | `AppearanceSettingsPage.tsx` 内 `zones` 命中 **≥3**；`ZonesSettingsPanel.tsx` 存在 |
| **A4** | ② 新测试 | `npx vitest run src/renderer/react/features/settings/memory-console` → **0 failed** |
| **A5** | 三套编译 | `tsc` main / preload / renderer = **0 / 0 / 0** |
| **A6** | 全量测试 | `Test Files 0 failed \| 561 passed (561)` / `Tests 0 failed \| 5405 passed \| 1 skipped (5406)` |
| **A7** | 定向门禁 | P8 的 13 文件 **273 passed**；语料 2 文件 **22 passed**；探测器 1 文件 **4 passed**（名单不许缩） |
| **A8** | 11 项保护功能 | 逐项 ≥ P8 实测值（4/8/5/11/13/6/10/5/2/8/4）；`groupContextLimit` 应**回升**（新增控件） |
| **A9** | 提交与工作区 | `git log -1` = P9 提交（单父）；tag `phase9-entries`；`git status` 只剩 `??` |
| **A10** | 无新依赖 | `package.json` / `package-lock.json` 本 Phase **零改动**（`git diff --name-only HEAD~1 -- package.json package-lock.json` = 0 行） |

---

## 七、交付物

| 交付物 | 内容 |
|---|---|
| **P9 提交** | `feat(P9): 接回渠道控制台/记忆管理台/区块页，并修掉两条存量失败` + tag `phase9-entries` |
| **新文件** | `features/settings/memory-console/{rules.ts,rules.test.ts,MemoryManagerSection.tsx,DangerZoneSection.tsx}`（**建议**落点，可调整，但必须在 `react/**` 内）+ `features/settings/ZonesSettingsPanel.tsx` |
| **改动文件** | `ChatPageNavigation.tsx`、`MemorySettingsPanel.tsx`、`AppearanceSettingsPage.tsx`、`ToolConsolePanel.css`、`ToolConsolePanel.tsx`、`i18n/{zh-CN,en}.json` |
| **测试** | 新增 `rules.test.ts`（纯函数规则）；全量 **0 failed** |
| **文档** | 台账 H-15 销账 + H-02/H-03 转待验 + H-17 登记；总蓝图 §四/§九 回写 |

---

## 八、回退

```powershell
# 级 1 · 单文件
git checkout 51a20338 -- <path>
# 级 2 · 整 Phase 撤销（P9 只有一个提交）
git reset --hard 51a20338        # ⚠️ 丢工作区改动，先确认
# 级 3 · 只看某文件改前内容（不动磁盘）
git show 51a20338:<path>
# 级 4 · 提交前索引保险（P8 遗留）
$tree = Get-Content .cyrene-merge-analysis\p8\pre-commit-tree.txt    # 5bc24f0a…（= P8 提交的树）
```
🔴 **永不** `git merge --abort`；🔴 **永不** `git push --force`；🔴 **永不** `git checkout <ref> -- .`。

---

## 九、坑（本 Phase 特有）

| # | 坑 | 对策 |
|---|---|---|
| 1 | `theme-token-contract` fail-fast → 以为只改一个文件 | Y1：改一个跑一次；>3 文件触发 S4 |
| 2 | 新写的代码里出现裸 `confirm(` → 又红一条 | Y2：只用 `Modal.confirm`（成员方法） |
| 3 | 新建面板放错目录（放 `settings/**`）→ 类型检查够不到 | C5/Y5：一律放 `react/**` |
| 4 | `deleteAll()` 后忘了 `restartApp()` → 用户以为删了其实缓存还在 | Y4：删完必须重启，且**要在 UI 上明确告知** |
| 5 | i18n 只加中文不加英文 → 两语言键集合不一致（H-04 的代理指标会红） | Y5：两个文件同改 |
| 6 | 抄纯函数时"顺手改"了 4 个里子模块 | N6：里子模块**只读**；要改就改抄出来的副本 |

---

## 十、给 P10（回落与加固）的交接

1. P9 之后，**4 项本地能力的 UI 入口全部可达**（控制台 / 记忆管理台 / 按人擦除 / 删除全部记忆 / 区块页）——"能力未迁移"的欠账清零。
2. **仍未做**：推送（H-B6）；`ApiConfigSection`（H-16，已拍板不做）；B-3 / B-4 / B-6(1–4) / C-1 / C-2 / C-3 / C-4 的人验（见 §五 5.5）。
3. **P10 的两件事**：① 把"合并后同步机制"落到流程（下次上游更新怎么跟）；② 把 4 个"里子"模块的处置收口（它们是**参照物**：要么后续版本删掉，要么补上测试纳入类型检查面）。
4. 🔴 **门禁名单不许缩减**：`group-context-flow.test.ts`（群聊旁听探测器）必须继续在 P10 的门禁里。

---

## 十一、施工记录（执行者填写；规范 §8）

| 子节 | 内容 |
|---|---|
| 0 | 开工前状态：`git log -1`、`git status` 分组计数、P2 全量测试的四个数字 |
| 1 | T1 实测：改动 diff 行数、A1 判据输出 |
| 2 | T2 实测：新文件清单与行数、抄了哪些纯函数（**逐个列名**）、A2/A4 输出 |
| 3 | T3 实测：新面板行数、三处注册的 diff、A3 输出 |
| 4 | T4 实测：③ 替换了多少处变量（**逐文件计数**）、④ 的改法、两条测试的输出 |
| 5 | 门禁实测：A5–A10 的原始输出（**回读原文**，不要凭印象写） |
| 6 | 偏差清单（含蓝图坐标被实测推翻的项 —— 按 **J-13** 一律以实测为准并就地记录） |
| 7 | 提交与 tag 的实测输出 |

---

## 十二、回写清单（T1–T4；未勾完不得宣告完成）

| 触发 | 目标 | 一句话 | 勾 |
|---|---|---|---|
| **T2** 基线被改写 | `BLUEPRINT-总蓝图.md` §四 P9 行 + §九 | P9 → ✅ 已完成（提交哈希 / 全绿数字 / 新增基线） | [ ] |
| **T1** 判据被修正 | `BLUEPRINT-总蓝图.md` §二 判据台账 | 若本 Phase 发现新判据缺陷（如"引用数 ≥1"被证伪），新增 **J-nn** | [ ] |
| **T1** 判据被修正 | `HUMAN-人工验证台账.md` §三/§五 | **H-15 销账**（附判据）；H-02 / H-03 转"待人工复验"；新增 **H-17** | [ ] |
| **T2** 基线被改写 | `验证作业单.md` A 类 + C 类 | A 类期望值 → `0 failed`；C-3 / C-4 的"控制台无入口"前置**已解除** | [ ] |
| **T3** 蓝图被实测推翻 | 本文件 §二 / §四 | 坐标、函数名、行号一律以执行者实测为准（J-13），就地标注 | [ ] |
| **T4** 新增经验 | `../methodology/BLUEPRINT-经验库-*.md` | 过程中新踩的坑（键号顺延：X15+ / A48+ / F19+） | [ ] |
