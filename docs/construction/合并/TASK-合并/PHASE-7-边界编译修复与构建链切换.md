# Phase 7 施工蓝图：边界编译修复与构建链切换（Tier D）

> **状态**：⏳ 待执行
> **上游**：[`BLUEPRINT-总蓝图.md`](BLUEPRINT-总蓝图.md) §四（Phase 索引）· §八（验证机制）· §九（当前基线「P6 之后」）
> **前置交付**：[`PHASE-6-完成报告.md`](PHASE-6-完成报告.md) · [`PHASE-6-骨架重写与旁听保留.md`](PHASE-6-骨架重写与旁听保留.md) §二 **事实 8**（撰写者复核）
> **依据规范**：`../methodology/BLUEPRINT-撰写规范.md` §4（12 节）· §4.1（人工环节）· §5.1（T1–T4 回写）
> **一句话**：把三方合并后的边界从"**能编译**"推到"**能构建、能起应用、能测**"，并把 **D1 在渲染层的残留**清干净。

> 🔴 **本 Phase 有一处顺序变更（项目所有者已拍板）**：原计划把 `npm ci` 放在 **P8**，本 Phase 把它**提到 P7 起手（§四 4.3）**。
> **理由（实测，不是偏好）**：`vite.config.mts` 顶部 `import tailwindcss from "@tailwindcss/vite"`，而该包**未安装** →
> `node -e "import('@tailwindcss/vite')"` 实测 **`ERR_MODULE_NOT_FOUND`** → **vite 连配置都加载不了**。
> 于是 `npm run dev` / `npm run build:renderer` / `npm run check:renderer` 的判据**一条都验不了**。
> 不装依赖，本 Phase 就只剩"改代码"而没有"验收"。

---

## ★零、执行者先读这一节

### 0.1 三个已定的事（不要再论证）

| # | 事项 | 谁定的 | 落点 |
|---|---|---|---|
| **①** | **把 `npm ci` 提到 P7 起手** | 项目所有者（本轮拍板，2026） | §四 **4.3**；总蓝图 §四 P7 行的"顺序变更"注 |
| **②** | **任务文档不进合并提交（方案 A）** | 项目所有者（本轮拍板，记入总蓝图 §五 **D6**） | §四 **4.2** |
| **③** | **渲染层删「上下文绑定」UI，而不是把 3 个 IPC 声明补回来** | 由 **D1（彻底删除桌面对话绑定）** 直接推出 | §四 **4.4** |

> ③ 为什么不是"补回来"：那 3 个方法在 **preload / shared / main 里定义面实测 0 命中**（功能已被 D1 删除），
> 补声明只会得到一个"编译通过但运行时 `undefined is not a function`"的假修复，并与台账 **H-14**（不得有绑定入口）正面冲突。

### 0.2 三条硬约束（违反即失败）

1. 🔴 **不得 `git commit`** —— 提交时机在 P7 **之后**（见总蓝图 §四 · P6 报告 §八 第 11 条）。本 Phase **只到 `git add` 与索引对齐为止**。
2. 🔴 **永不 `git merge --abort`** —— 会一次性丢弃 P3/P4/P5/P6/P7 的全部成果。
3. 🔴 **永不 `checkout` `src/main/channels/history-log.ts`** —— 它带 16 个本地独有导出（含 `buildGroupContextBlock`，群聊旁听的命脉）。

### 0.3 顺序敏感（不可颠倒）

```
4.0 备份 → 4.1 索引对齐 → 4.2 文档排除 → 4.3 装依赖 → 4.4 渲染层清理 → 4.5 编译收口 → 4.6 构建链 → 4.7 门禁
                                                          ↑
                       4.4 必须在 4.3 之后：否则 `channelsContext*` 的 5 条 `TS2339` 会被
                       29 条 `TS2307`（缺模块）淹没，你分不清"真错"与"缺依赖"
```

### 0.4 三个陷阱（冲突扫描器与直觉都抓不到的）

| # | 陷阱 | 后果 | 对策 |
|---|---|---|---|
| **X1** | 本环境的 npm 有 **`install-scripts` 白名单**机制，`package.json` 的 `allowScripts` 里记的是 **`electron@43.1.0`**，而即将装的是 **44.4.3** | electron 的 postinstall 被拦 → **`electron .` 起不来**（`dist/` 没下载）。`esbuild@0.28.2` 同列被拦（vite 依赖它） | §四 4.3 的 **X1 处置**：装完先 `npm install-scripts ls`，按它自己的提示 `approve`，再验证 `node_modules/electron/dist/electron.exe` 存在 |
| **X2** | `vite.config.mts` 用的是 **`rolldownOptions`**（**vite 8 专属** API，即 rolldown 取代 rollup），且 plugins 里挂了 `@tailwindcss/vite` | 在 vite **7.3.6** 下：① 配置加载直接失败（缺包）② 即便装上包，`rolldownOptions` 也不被 7.x 识别 → 入口会静默退回默认（构建产物不含 6 个 html） | §四 4.6 用**产物清单**判定（6 个入口 html 必须都在 `dist/renderer/`），不是只看退出码 |
| **X3** | 删面板的绑定区块会**连带** 4 处：i18n（zh-CN + en 两套）、CSS 死规则、测试 fixture（3 处）、以及那个测试的**断言**（`headings.indexOf("上下文绑定")`） | 只删 TSX → 测试红、i18n 残留、CSS 死代码 | §四 4.4 按 4.4.1–4.4.4 四步走，每步都有 grep 判据 |

### 0.5 命令执行规范（沿用前几个 Phase）

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$env:PATH = "D:\data\node24;" + $env:PATH      # 每条命令前都要加（本机默认 node 不是 24）
cd E:\AI_Chating\cyrene-agent
```

- PowerShell **5.1**：无 `&&`；**括号表达式里不能用 `;`**；`for(...){} | Select-Object` 会报 *Empty pipe element*（要先收进数组）。
- 涉及行尾比较的 diff 一律加 **`--ignore-cr-at-eol`**（经验 **A41**：裸 `--numstat` 会把 CRLF 报成整文件改写，本例 `tool-registry.ts` 曾报 950 行、实为 1 行注释）。
- 蓝图给的行号是**本文件写作时的快照**；按 **J-13**：动手前自己重扫一次，**不要把蓝图行号当坐标直接采信**。

---

## 一、目标与非目标

### 1.1 目标（T1–T7，逐条给判据）

| # | 目标 | 判据（机器可判） |
|---|---|---|
| **T1** | **索引对齐**：P6 施工期最后那批修正真的进了索引 | `git diff --ignore-cr-at-eol --name-status` 里**不再有** 4 个代码/测试文件（只剩 docs 行） |
| **T2** | **文档排除（D6）**：任务文档不进合并提交 | `git ls-files docs/merge-plan` = **0** 且 `git ls-files "docs/construction/合并"` = **0** |
| **T3** | **依赖装齐**：15 个声明未装的包 + 8 项工具链对齐 | 15 个包 `node_modules` 存在 = True；`vite`=8.3.0、`vitest`=5.x、`electron`=44.x、`esbuild`=0.28.x、`@vitejs/plugin-react`=6.x、`tailwindcss`/`@tailwindcss/vite` 存在 |
| **T4** | **D1 渲染层残留清零** | 全渲染层 grep `channelsContext` = **0**、`mirrorToDesktop` = **0**（注释除外）；i18n 同上 |
| **T5** | **三套编译面收口** | `tsc -p tsconfig.main.json` = **0 条**；`tsc -p tsconfig.preload.json` = **exit 0**；`tsc -p tsconfig.renderer.json` = **0 条** |
| **T6** | **构建链可执行** | `npx vite --version` = 8.3.0；`npm run build` exit 0；`dist/renderer/` 下 **6 个入口 html** 全在；`npm run dev` 能起（agent 判"起得来"，人判"可用"） |
| **T7** | **门禁与保护功能不退化** | A2 语料 22 tests 全绿；A3 探测器 4 tests 全绿；定向门禁全绿；11 项保护功能基线不降 |

### 1.2 非目标（N1–N7，越界即失败）

| # | 非目标 | 为什么 |
|---|---|---|
| **N1** | ❌ `git commit` | 提交在 P7 之后（总蓝图 §四） |
| **N2** | ❌ 改动 `src/main/channels/history-log.ts` | 群聊旁听的唯一实现（16 个本地独有导出） |
| **N3** | ❌ 新增/修改任何 transcript kind、改 `conversation-transcript-*` | 协议级不可回撤（D3 修订：本任务不迁旁听） |
| **N4** | ❌ 修既有 ②③④ 类失败（`renderer/settings/**` 11 文件、`theme-token-contract`、`default-dialogs-regression`） | 它们与合并无关，按台账 **H-07/H-05** 由人在 P8 处置 |
| **N5** | ❌ 删 `conversation-binding-store.ts` / 动 `src/main/corpus/**` | N2（P6 已定）与 **D4 硬约束** |
| **N6** | ❌ 顺手"重构" `settings/shared/types.ts` 里绑定时代的**类型**（如 `ZoneExternalChat`） | 它被 zones 功能引用；本 Phase 只清**调用面**。要删必须"删后全仓 grep = 0"才可 |
| **N7** | ❌ 重建 `package-lock.json`（`npm install --package-lock-only`） | 除非 §四 4.3 的回退路径被触发（那时**必须**记录并作为交付物） |

---

## 二、实测证据（决定本 Phase 做法，**执行前请读**）

### 事实 1 · 三套编译面的真实状态（撰写者实测）

| 编译面 | 命令 | 错误数 | 性质 |
|---|---|---|---|
| 主进程 | `npx tsc -p tsconfig.main.json` | **1** | `src/main/windows/create-aux-windows.ts(36,55): TS2694 Namespace 'Electron' has no exported member 'WindowStatePersistence'` → **纯 ①类**（依赖版本），见事实 2 |
| preload | `npx tsc -p tsconfig.preload.json` | **exit 0** | 全绿 |
| 渲染层 | `npx tsc -p tsconfig.renderer.json` | **48** | 见下表 |

渲染层 48 条的构成（**P6 报告完全没跑这一层**）：

| 类别 | 条数 | 明细 | 是否本 Phase 可解 |
|---|---|---|---|
| `TS2307` 模块未安装 | **29** | `simple-icons` 9 / `radix-ui` 4 / `@lobehub/icons` 3 / `motion/react` 2 / `@dnd-kit/utilities`、`@streamdown/math`、`streamdown`、`@lobehub/ui/icons`、`react-resizable-panels`、`react-day-picker`、`date-fns/locale`、`date-fns`、`@dnd-kit/sortable`、`@dnd-kit/core`、`ansi-to-react` 各 1 | ✅ 4.3 装依赖即消 |
| `TS7006`/`TS7031` 隐式 `any` | **13** | 参数类型来自上面那些模块 | ✅ 同上（连带） |
| `TS7016` 无类型声明 | **1** | `qrcode`（`@types/qrcode` 声明了但**未装**） | ✅ 4.3 装依赖即消 |
| **`TS2339` 调已删除的 IPC** | **5** | 全在 `ChannelsSettingsPanel.tsx`：`channelsContextBindingsGet`（`:19`/`:102`/`:115`）、`channelsContextBind`（`:170`）、`channelsContextUnbind`（`:181`） | ✅ 4.4（**真问题**，非连带） |

> 🔴 **`build-options.ts` 那条已不在**：P6 修完后主进程只剩 1 条，所以本 Phase 的主进程工作是"**等 electron 44 装上后自动归零**"，不是改代码。

### 事实 2 · 15 个包"声明了但没装" + 8 项工具链版本对账（撰写者实测）

```powershell
# 逐包对账（实测输出）
simple-icons  nm=False pkg=1     radix-ui       nm=False pkg=1
@lobehub/icons nm=False pkg=1    @lobehub/ui    nm=False pkg=1
motion        nm=False pkg=1     @dnd-kit/core  nm=False pkg=1
@dnd-kit/sortable nm=False pkg=1 @dnd-kit/utilities nm=False pkg=1
streamdown    nm=False pkg=1     @streamdown/math nm=False pkg=1
react-resizable-panels nm=False pkg=1  react-day-picker nm=False pkg=1
date-fns      nm=False pkg=1     ansi-to-react  nm=False pkg=1
@modelcontextprotocol/server-filesystem nm=False pkg=1
```

**工具链对账（声明 vs 实装）**：

| 包 | `package.json` 声明 | `node_modules` 实装 | 差距 |
|---|---|---|---|
| `vite` | **8.3.0** | **7.3.6** | 大版本差（8 用 rolldown，见 X2） |
| `vitest` | **^5.0.1** | **4.1.9** | 大版本差（全量测试的报错口径会变） |
| `electron` | **^44.4.3** | **43.1.0** | 差的就是 `WindowStatePersistence` 那个类型（事实 1） |
| `esbuild` | **^0.28.2** | **0.25.12** | 中版本差 |
| `@vitejs/plugin-react` | **^6.0.5** | **4.7.0** | 大版本差（vite 8 配套） |
| `tailwindcss` | **^4.3.3** | **（未装）** | `vite.config.mts` 依赖它 |
| `@tailwindcss/vite` | **^4.3.3** | **（未装）** | 🔴 **vite 配置加载失败的直接原因** |
| `typescript` | ^5.6.0 | 5.9.3 | ✅ 一致（无需动） |

> 📌 **`@types/qrcode` 也在 `devDependencies` 里但未装** → 装上后事实 1 的那条 `TS7016` 自动消失。

### 事实 3 · 官方的"构建链切换"到底切了什么（`eb6c311a → MERGE_HEAD` 实测）

```powershell
git diff --ignore-cr-at-eol --name-status eb6c311a MERGE_HEAD 2>$null |
  Select-String 'package(-lock)?\.json|vite|tsconfig|\.html$|electron-builder'
```

| 变更 | 文件 | 说明 |
|---|---|---|
| **改名 + 重写** | `D vite.config.ts` → **`A vite.config.mts`** | 131 行；`rolldownOptions`（vite 8）+ 4 个插件（react / appVersion / CSP / tailwindcss） |
| **新增** | `A tsconfig.json`（根）、**`A tsconfig.renderer.json`** | 从此渲染层有了独立类型检查入口（`npm run check:renderer`） |
| **删旧窗口** | `D src/renderer/{settings,sidebar,tasks,call}/index.html`、`D dist/renderer/toast/index.html` | 已确认磁盘上**确实不存在**（实测 `Test-Path` = False） |
| **新增 React 入口** | `A src/renderer/call-react/index.html`、`A src/renderer/react-perf/index.html` | 与 `react/`、`music/`、`toast/`、`sticker-manager/` 并存 |
| **配置** | `M electron-builder.yml`、`M vitest.config.ts`、`M src/renderer/index.html`、`M src/renderer/ui/preview.html` | |
| **工具链抬版** | `vite 7.3.6→8.3.0`、`vitest ^4.1.9→^5.0.1`、`electron ^43→^44.4.3`、`esbuild ^0.25→^0.28.2`、`@vitejs/plugin-react ^4.7→^6.0.5` | 全部**尚未安装**（事实 2） |

**`vite.config.mts` 的 6 个构建入口**（`build.rolldownOptions.input`，实测全部存在）：

```
renderer    src/renderer/index.html
stickers    src/renderer/sticker-manager/index.html
call-react  src/renderer/call-react/index.html
chat-react  src/renderer/react/index.html
music       src/renderer/music/index.html
toast       src/renderer/toast/index.html
→ outDir = dist/renderer（emptyOutDir: true）；root = src/renderer；base = "./"
```

### 事实 4 · 🔴 `npm run dev` **现在起不来**（推翻台账里的一句旧结论）

```powershell
node -e "import('@tailwindcss/vite').then(()=>console.log('OK')).catch(e=>console.log('FAIL ' + e.code))"
# 实测：FAIL ERR_MODULE_NOT_FOUND
```

> `vite.config.mts:7` 有 `import tailwindcss from "@tailwindcss/vite";`，而该包未装 →
> **vite 加载配置即失败** → `npm run dev`（= `build:main && build:preload && build:cli && concurrently "vite" "cross-env VITE_DEV=1 electron ."`）
> 在 `vite` 这一步就死；`build:renderer` / `check:renderer` 同理。

**因此必须回写一句既有结论**：`HUMAN-人工验证台账.md` §一 的前言写着
「主进程与 preload 0 命中 → `npm run dev` **现在就能起来** → 带 🟢 的条目可以提前验，不必等 P8」——
该句**在渲染层依赖缺失的前提下不成立**（主进程干净 ≠ 应用能起）。已列入 §十三 回写清单，
且台账里 **H-02 / H-03 / H-05 / H-13（运行期部分）** 的 🟢"现在可做"应改为「**P7 装依赖后可做**」。

### 事实 5 · 渲染层那 5 条 `TS2339` 的根因链（**D1 的必然结果，不是 bug**）

```powershell
# 1) 官方侧有这三个方法
git show "MERGE_HEAD:src/renderer/settings/shared/types.ts" | Select-String 'channelsContext'
#    :334 channelsContextBindingsGet / :346 channelsContextBind / :347 channelsContextUnbind
# 2) 工作区没有
Select-String -LiteralPath src/renderer/settings/shared/types.ts -Pattern 'channelsContext'   # 0 命中
# 3) 定义面（preload / shared / main）全仓 0 命中；只有渲染层 8 处调用
Get-ChildItem -Recurse -Include *.ts,*.tsx -Path src | Select-String 'channelsContextBindingsGet|channelsContextBind\b|channelsContextUnbind' |
  Group-Object { $_.Path } # → 只有 ChannelsSettingsPanel.tsx(5) 与 ChannelsSettingsMigration.test.ts(3)
```

**根因**：`src/renderer/settings/shared/types.ts` 是 **P3 的 `UU` 冲突文件**，在 **P5** 被判定取 **ours**
（ours = **520 行**、含 209 行本地 API：记忆控制台 / 区块 / 按人擦除；官方 = **356 行**）——
代价是官方那 3 个 `channelsContext*` **声明一起被丢弃**，而**官方新的 React 面板仍在使用它们**。

| 侧 | 状态 |
|---|---|
| 官方新面板（`ChannelsSettingsPanel.tsx`） | 调 5 处，**编译报 5 条 `TS2339`**，且 `:115` 把它们写在 `Promise.all([...])` 的**实参**里 → **同步 `TypeError`，`.catch` 兜不住** → 「设置 → 渠道」页**会直接崩** |
| 该 IPC 的实现 | **不存在**（`conversation-binding-api.ts` 已在 P4/P6 被删） |
| 结论 | **只能删面板的绑定 UI**（③ 已定），不能补声明 |

### 事实 6 · 面板与测试的精确改动坐标（**动手前自己重扫**，见 J-13）

`src/renderer/react/features/settings/ChannelsSettingsPanel.tsx`（299 行）：

| 行 | 内容 | 处置 |
|---|---|---|
| `:3` | `import { … Link2 … Trash2 } from "lucide-react"` | 两个符号**只**被下面被删的两处用 → 删后从 import 移除（删前 grep 复核） |
| `:19` | `type ContextSnapshot = Awaited<ReturnType<SettingsApi["channelsContextBindingsGet"]>>` | **删**（引用了不存在的成员） |
| `:26` | `stickerEnabled: true, mirrorToDesktop: true, toolSandbox: "all",` | 删 `mirrorToDesktop: true,` |
| `:78-80` | `const [context, setContext] … / sourceSession / targetConversation` | **删三行** |
| `:100-104` | `const refreshContext = useCallback(… channelsContextBindingsGet() …)` | **整块删** |
| `:112-129` | 挂载 `useEffect` | 从 `Promise.all([...])` 里**去掉** `api.channelsContextBindingsGet()`；解构 `([config, status, entries, bindings])` → `([config, status, entries])`；删 `setContext(bindings)` |
| `:166-175` | `const bindContext = async () => {… channelsContextBind …}` | **整块删** |
| `:177-186` | `const unbindContext = async (sessionId) => {… channelsContextUnbind …}` | **整块删** |
| `:249-263` | 整个 `<section>`「上下文绑定」（heading + `<Card className="cy-channels-context">` + 表单 + 绑定列表） | **整段删**（含 `Link2`/`Trash2`/`SettingsSelect` 的那三处使用） |
| `:281` | `<div className="cy-settings-row">… mirrorDesktop …` | **整行删** |

`src/renderer/react/features/settings/ChannelsSettingsMigration.test.ts`（143 行）：

| 行 | 内容 | 处置 |
|---|---|---|
| `:63` | 用例名 `"shows global context bindings before the reused channel message log, …"` | **改名**为只描述"日志默认折叠"，例：`"keeps the channel message log collapsed by default"` |
| `:70` | 夹具 `… ttsEnabled: true, stickerEnabled: true, mirrorToDesktop: true, toolSandbox: "all",` | 删 `mirrorToDesktop: true,` |
| `:74` / `:103` / `:125` | 夹具 `channelsContextBindingsGet: async () => ({ externalChats: [], bindings: [], conversations: [] }),` | **删 3 处** |
| `:84` | `expect(headings.indexOf("上下文绑定")).toBeLessThan(headings.indexOf("最近收发记录"));` | **删**（该 heading 将不存在） |
| `:85-93` | 日志折叠 / 展开后含"你好" / 含"微信" / 工具权限行有 select | **全部保留**（这些才是这条测试的价值） |

### 事实 7 · `npm ci` 可行性实测（**dry-run，exit 0**）+ `install-scripts` 陷阱

```powershell
npm ci --dry-run --no-audit --no-fund
# 实测：exit 0
#   added 410 packages, removed 62 packages, and changed 78 packages in 6s
#   npm warn install-scripts 2 packages have install scripts not yet covered by allowScripts:
#     electron-winstaller@5.4.0 (install: node ./script/select-7z-arch.js)
#     esbuild@0.28.2 (postinstall: node install.js)
#   npm warn install-scripts Run `npm install-scripts ls` to review, or `npm install-scripts approve <pkg>` to allow.
```

- ✅ **锁文件与 `package.json` 不同步（lock 根 `version` = `1.2.2`，`package.json` = `1.2.2-PLUS`）不会让 `npm ci` 失败** —— 实测它就是跑通的。
- 🔴 **本环境的 npm 挂了 `install-scripts` 白名单机制**（`package.json:156` 的 `allowScripts` 是它的配置），当前记的是 **`electron@43.1.0`**、`esbuild@0.21.5`、`sharp@0.32.6`、`tree-sitter@0.22.4`、`protobufjs@*`。
  装上 **electron 44.4.3** 与 **esbuild 0.28.2** 后，白名单条目**未必匹配** → 安装脚本可能被跳过（→ 见 X1）。
- 📌 `npm ci` 会**先删掉整个 `node_modules`** 再装（`removed 62` 即旧树），耗时预计 **5–20 分钟**（含 electron 44 下载）。
  因此 **4.3 期间不要并行跑 vitest/tsc**（会读到半装状态）。

### 事实 8 · 索引与文档的当前状态（承接 P6 事实 8 ②③，并**修正 D6 的命令**）

```powershell
git diff --ignore-cr-at-eol --name-status
# M  src/main/channels/channel-context.ts
# M  src/main/channels/dispatcher.ts
# M  src/main/orchestrator/build-options.ts
# M  src/main/orchestrator/conversation-transcript-phase2.acceptance.test.ts
# M  docs/construction/合并/TASK-合并/HUMAN-人工验证台账.md
# D  docs/merge-plan/*.md   （13 个）
```

| 事实 | 数值 | 含义 |
|---|---|---|
| 4 个代码/测试文件"工作区已修、索引仍旧" | `channel-context.ts` / `dispatcher.ts` / `build-options.ts` / `…phase2.acceptance.test.ts` | **P6 的 4 处修正尚未入索引**；此刻提交会提交一棵**编译不过**的树（索引侧：4 条 `TS2339` + 18 条 `TS2304` + 2 条 `TS2305`） |
| `docs/merge-plan/` | **13 个文件在 `HEAD` 已提交**（`git ls-tree -r HEAD` = 13），磁盘上**已不存在** | 🔴 **D6 的初版命令是错的**：`git reset` 只会把索引恢复成 `HEAD` 状态 → 提交里**照样带着 13 个磁盘上不存在的文件**。正确做法是**从索引移除**（见 4.2） |
| `docs/construction/合并/TASK-合并/` | 索引里只有 **2** 个（台账 + `PHASE-5-完成报告.md`），磁盘上 **22** 个 | 22 个里 20 个未跟踪 |

---

## 三、前置条件与停止条件

### 3.1 前置条件（**逐条给命令 + 期望值；不满足不得开工**）

```powershell
# P1 · 合并仍在进行中（不许提交）
git rev-parse --short HEAD          # 期望 598dfb75
git rev-parse --short MERGE_HEAD    # 期望 b11b8851

# P2 · 冲突已归零
(git status --porcelain | Where-Object { $_.Substring(0,2) -match '^(UU|UD|DU|AA)$' } | Measure-Object).Count   # 期望 0
(Get-ChildItem -Recurse -Include *.ts,*.tsx,*.json,*.css -Path src | Select-String -Pattern '^<{7} |^>{7} ' | Measure-Object).Count   # 期望 0

# P3 · P6 的 4 处修正确实还在工作区（否则先查是不是被 checkout 掉了）
git diff --ignore-cr-at-eol --name-status   # 期望看到那 4 个 M + 台账 M + 13 个 docs D

# P4 · 备份网可用
Test-Path E:\AI_Chating\cyrene-agent-p6-backup                       # 期望 True
git rev-parse --short phase3-work-snapshot                           # 期望 586eae90
Test-Path .cyrene-merge-analysis\p6\pre-hashes.txt                   # 期望 True

# P5 · 工具链
node -v      # 期望 v24.21.0
npm -v       # 期望 11.x

# P6 · 依赖可装（dry-run，不产生任何改动）
npm ci --dry-run --no-audit --no-fund   # 期望 exit 0（事实 7 已实测）

# P7 · 磁盘余量（要 add 410 个包）
Get-PSDrive E | Select-Object Used,Free    # 期望 Free ≥ 8 GB

# P8 · 那份"起点基线"文件在
Test-Path .cyrene-merge-analysis/protected-features-baseline.json    # 期望 True
```

> 🔴 **P1–P8 全绿才开工。** 任何一条不符 → 停，先写清"哪条不符 + 实测输出"，不要先改代码。

### 3.2 停止条件（命中即停，**不要"顺手绕过"**）

| # | 触发 | 处置 |
|---|---|---|
| **S1** | `npm ci` 报 **硬失败**（`EUSAGE` / `ERESOLVE` 报错退出，而非 warning） | 停 → 改用 `npm install --no-audit --no-fund` → **必须**记录 `git diff --stat package-lock.json` 的差异，并在完成报告里标为"计划外锁变更" |
| **S2** | 4.3 之后出现**新**的编译错误，且无法归因到 ①–④ 类 | 停 → 逐条贴出错误原文，判断是"装依赖暴露的真问题"还是"装坏了" |
| **S3** | 4.4 之后 `ChannelsSettingsMigration.test.ts` 之外**还有 ≥3 个测试文件变红** | 停 → 说明删多了（对照事实 6 的行表逐条复核） |
| **S4** | `electron .` 起不来，且日志指向 electron 二进制缺失 | 停 → 走 X1（`npm install-scripts ls` → `approve`）后重试；**不要**去改 `main` 字段绕开 |
| **S5** | 任何时刻冒出了"需要改 `history-log.ts` / CTA / `corpus/**`"的冲动 | 停 → 越界（N2/N3/N5） |
| **S6** | 有人建议 `git merge --abort` 或 `git checkout <ref> -- .` | 停 → 会丢 P3–P7 全部成果 |
| **S7** | `npm run dev` 起得来但**窗口 10 秒内白屏/闪退** | 记录日志 → 交 **H-B4** 人判，本 Phase 不追查（属运行期问题，P8 面） |

---

## 四、改动清单（**顺序敏感，逐节做，每节做完立刻跑该节判据**）

### 4.0 备份与哈希锚点

```powershell
New-Item -ItemType Directory -Force -Path .cyrene-merge-analysis\p7 | Out-Null
New-Item -ItemType Directory -Force -Path E:\AI_Chating\cyrene-agent-p7-backup | Out-Null

$p7files = @(
  'src/renderer/react/features/settings/ChannelsSettingsPanel.tsx',
  'src/renderer/react/features/settings/ChannelsSettingsMigration.test.ts',
  'src/renderer/react/i18n/zh-CN.json',
  'src/renderer/react/i18n/en.json',
  'src/renderer/react/features/settings/ChannelsSettingsPanel.css',
  'package.json',
  'package-lock.json'
)
git hash-object -- $p7files | Set-Content .cyrene-merge-analysis\p7\pre-hashes.txt -Encoding UTF8
foreach ($f in $p7files) { Copy-Item -LiteralPath $f -Destination ("E:\AI_Chating\cyrene-agent-p7-backup\" + ($f -replace '/','__')) -Force }
(Get-Content .cyrene-merge-analysis\p7\pre-hashes.txt | Measure-Object).Count    # 期望 7
```

> 📌 **`package-lock.json` 也进锚点**：它是本 Phase 唯一可能被"安装动作"改到的文件（S1 触发时）。

### 4.1 索引对齐（T1）—— 4 个文件

```powershell
git add -- src/main/channels/dispatcher.ts `
           src/main/channels/channel-context.ts `
           src/main/orchestrator/build-options.ts `
           src/main/orchestrator/conversation-transcript-phase2.acceptance.test.ts
```

**判据**：

```powershell
git diff --ignore-cr-at-eol --name-status
# 期望：这 4 个文件**不再出现**；只剩 docs/merge-plan/* 的 D 行与台账 M 行
git diff --cached --ignore-cr-at-eol --stat -- src/main/channels/dispatcher.ts   # 期望无输出（工作区 = 索引）
```

> 🔴 **P7 施工实测：上面第二条判据写反了方向，已就地修正（见 §十二 子节 2 漏洞 1）**。
> `git diff --cached` 比的是「**索引 vs HEAD**」，`git add` 之后它**必然非空** ——
> 照字面执行会得到 `255 insertions / 58 deletions`，从而**误判"4.1 没做成"**，甚至可能去 revert 那次 `git add`（那才真会破坏 T1）。
> **正确判据要分两个方向验**：
>
> ```powershell
> # 方向 A：工作区 vs 索引 —— 期望「无输出」（= 已对齐）
> git diff --ignore-cr-at-eol --stat -- src/main/channels/dispatcher.ts
> # 方向 B：索引 vs HEAD —— 期望「非空」（= 修正真的进了索引）
> git diff --cached --ignore-cr-at-eol --stat -- src/main/channels/dispatcher.ts
> ```
>
> **P7 实测结果**：方向 A 对 4 个文件**全部无输出** ✔；方向 B 合计 **679 insertions / 96 deletions** ✔。

> ⚠️ **台账不要 `git add`** —— 它属于文档，4.2 会把它从索引里**移除**。

### 4.2 文档排除（T2 / D6）—— 索引里文档条目归零

```powershell
# ① 旧路径 13 个：它们在 HEAD 已提交，必须从索引移除（否则提交会带着 13 个磁盘上不存在的文件）
git rm -r --cached --quiet docs/merge-plan
# ② 新路径那 2 个：取消暂存（磁盘文件保持未跟踪）
git reset -q -- "docs/construction/合并"
```

**判据**：

```powershell
git ls-files docs/merge-plan                                    # 期望 0 行
git ls-files "docs/construction/合并"                            # 期望 0 行
Test-Path docs/construction/合并/TASK-合并/PHASE-6-完成报告.md    # 期望 True（磁盘没动）
git status --porcelain -- docs | ForEach-Object { $_.Substring(0,2) } | Group-Object | ForEach-Object { "$($_.Name) x$($_.Count)" }
# 期望： D x13（旧路径缺文件）+  ?? x22（新路径未跟踪）
```

> 🔴 **不要**用 `git reset -q -- docs/merge-plan`：那是 D6 的初版命令，**实测达不到目的**（见事实 8）。
> 🔴 **不要**顺手 `git add "docs/construction/合并"`：那是方案 B，本轮已排除。

### 4.3 依赖装齐（T3）★ 本 Phase 新增的起手动作

```powershell
# ① 装（会先删掉整个 node_modules 再装；预计 5–20 分钟）
npm ci --no-audit --no-fund
"exit=$LASTEXITCODE"        # 期望 0
```

**② X1 处置（装完立刻做，别等到起不来才查）**：

```powershell
npm install-scripts ls       # 看哪些包的安装脚本未覆盖
# 若 electron / esbuild 在"未覆盖"列表里 → 按它自己的提示批准（两条命令择一，以 ls 的输出为准）
npm install-scripts approve electron
npm install-scripts approve esbuild
# 批准后重新触发它们的安装脚本（最稳的是对这两个包做一次定向重装）
npm rebuild electron esbuild
```

> 🔴 **P7 施工实测：上面这段的 electron 部分不成立，已就地修正（见 §十二 子节 1 偏差 2 / 子节 3）**。
> **实测 `npm install-scripts ls` 只在未覆盖列表里报了 `esbuild@0.28.2` 与 `electron-winstaller@5.4.0`，根本没有 electron。**
> 原因：**electron@44 上游已删除 `scripts.postinstall`**（`node_modules/electron/package.json` 的 `scripts` = `undefined`），
> 二进制改由 `index.js` 在**被 `require()` 时懒下载**（`fs.existsSync(path.txt)` 为假即 `spawnSync(install.js)`）。
> 它**既没被白名单拦、也没被跳过**，只是"没人 require 过它"。
> **正确处置（P7 实做）**：
> ```powershell
> npm install-scripts approve esbuild      # 唯一需要批的
> node -e "require('electron')"            # 触发 electron 懒下载（实测下载成功）
> Test-Path node_modules\electron\dist\electron.exe   # True
> & node_modules\electron\dist\electron.exe --version # v44.4.3
> ```
> **不要**去改 `allowScripts` 里 `electron@43.1.0` 的条目（无关动作）；**也不要**盲做 `npm rebuild electron`。
> 📌 顺带：`esbuild` 的 `@esbuild/win32-x64/esbuild.exe` 本就随 **optional 依赖**就位，`rebuild` 同样非必需。
> `electron-winstaller` **有意不 approve**（仅打包安装包时用，P7 的 4 条判据都不需要）。
>
> ⚠️ **`approve` 的副作用（计划外改动，必须单列）**：它会**改写 `package.json`** 的 `allowScripts`——
> 实测 `esbuild@0.21.5` → `esbuild@0.28.2`（2 行 diff）。

**③ 判据**：

```powershell
# 15 个包全部就位
$pkgs = @('simple-icons','radix-ui','@lobehub/icons','@lobehub/ui','motion','@dnd-kit/core','@dnd-kit/sortable','@dnd-kit/utilities','streamdown','@streamdown/math','react-resizable-panels','react-day-picker','date-fns','ansi-to-react','@modelcontextprotocol/server-filesystem')
$pkgs | ForEach-Object { "{0,-42} {1}" -f $_, (Test-Path (Join-Path 'node_modules' $_)) }   # 期望全部 True
Test-Path node_modules\@types\qrcode        # 期望 True

# 工具链版本
npx vite --version      # 期望 8.3.0
npx vitest --version    # 期望 5.x
node -e "console.log(require('./node_modules/electron/package.json').version)"   # 期望 44.x

# electron 二进制真的下来了（X1 的核心判据）
Test-Path node_modules\electron\dist\electron.exe    # 期望 True
Test-Path node_modules\electron\path.txt             # 期望 True

# vite 配置现在能加载（事实 4 的那条命令，由 FAIL 变 OK）
node -e "import('@tailwindcss/vite').then(()=>console.log('OK')).catch(e=>console.log('FAIL '+e.code))"   # 期望 OK
```

> ⚠️ **4.3 期间不要跑 vitest/tsc**（半装状态会给出误导性结果）。装完再进 4.4。

### 4.4 D1 渲染层残留清理（T4）—— 4 个文件，按 4.4.1→4.4.4 顺序

#### 4.4.1 `ChannelsSettingsPanel.tsx`（按**事实 6** 的行表逐条改）

- 删：`:19`、`:26` 的 `mirrorToDesktop: true,`、`:78-80`、`:100-104`、`:166-175`、`:177-186`、`:249-263` 整段 `<section>`、`:281` 整行
- 改：`:112-129` 的挂载 `useEffect` → 去掉 `channelsContextBindingsGet()` 与 `bindings` 解构
- 清：`:3` 的 import 里删掉不再使用的 `Link2` / `Trash2`（**删前** `Select-String -LiteralPath <文件> -Pattern 'Link2|Trash2'`，确认 0 残留再删）

**判据**：

```powershell
$f='src/renderer/react/features/settings/ChannelsSettingsPanel.tsx'
Select-String -LiteralPath $f -Pattern 'channelsContext|mirrorToDesktop|ContextSnapshot|sourceSession|targetConversation|Link2|Trash2' -Encoding UTF8   # 期望 0 命中
Select-String -LiteralPath $f -Pattern 'channelsGetConfig|channelsSaveConfig|channelsGetStatus|channelsLogGet|channelsRestart' -Encoding UTF8 | Measure-Object | Select-Object -Expand Count   # 期望 ≥6（其余功能完好）
```

#### 4.4.2 `ChannelsSettingsMigration.test.ts`（按**事实 6** 的行表）

- 改名 `:63` 的用例（去掉 "global context bindings" 表述）
- 删 `:70` 的 `mirrorToDesktop: true,`、`:74`/`:103`/`:125` 的 `channelsContextBindingsGet` fixture、`:84` 的 heading 断言
- **保留** `:85-93` 的全部断言（日志默认折叠 / 展开后有"你好" / 有"微信" / 工具权限行有 select）

**判据**：

```powershell
npx vitest run src/renderer/react/features/settings/ChannelsSettingsMigration.test.ts   # 期望 4 passed（该文件共 4 条用例）
Select-String -LiteralPath src/renderer/react/features/settings/ChannelsSettingsMigration.test.ts -Pattern 'channelsContext|mirrorToDesktop' -Encoding UTF8   # 期望 0 命中
```

#### 4.4.3 i18n（zh-CN + en 各一处；**两套都要改**）

**确定要删的 11 个 key**（在 `settingsPage.channels` 下，实测 zh-CN 行号）：

| key | zh-CN 行 | 理由 |
|---|---|---|
| `contextTitle` | 1031 | 面板被删的 section 标题 |
| `contextDescription` | 1032 | 同上 |
| `bind` / `unbind` | 1040 / 1041 | 绑定按钮 |
| `noBindings` | 1042 | 空态 |
| `selectBoth` | 1043 | 未选提示 |
| `bindFailed` / `bound` / `unbindFailed` / `unbound` | 1044–1047 | 绑定反馈 |
| `mirrorDesktop` | 1058 | 镜像开关（`zh-CN` 与 `en` 都有，实测 `en.json:1058`） |

**需要按判据决定的 7 个 key**（它们只被"被删的那段 JSX"用过就删，否则保留）：

```powershell
# 对每个 key 跑一次：全渲染层 0 引用才删
foreach ($k in 'externalChat','desktopConversation','noRecentChats','noConversations','untitledConversation','groupChat','privateChat') {
  $n = (Get-ChildItem -Recurse -Include *.tsx,*.ts -Path src/renderer | Select-String -Pattern ("channels\." + $k) | Measure-Object).Count
  "{0,-24} 引用数={1}" -f $k, $n
}
```

> ⚠️ `groupChat` / `privateChat` **很可能还被别处用**（渠道日志、消息列表）→ 不要凭直觉删，看上面这条命令的输出。

**判据**（两套 i18n 都要过）：

```powershell
$keys='contextTitle','contextDescription','bind','unbind','noBindings','selectBoth','bindFailed','bound','unbindFailed','unbound','mirrorDesktop'
foreach ($f in 'src/renderer/react/i18n/zh-CN.json','src/renderer/react/i18n/en.json') {
  foreach ($k in $keys) { if (Select-String -LiteralPath $f -Pattern ('"' + $k + '"\s*:') -Encoding UTF8) { "残留: $f -> $k" } }
}
node -e "for (const f of ['src/renderer/react/i18n/zh-CN.json','src/renderer/react/i18n/en.json']) JSON.parse(require('fs').readFileSync(f,'utf8')); console.log('JSON OK')"
# 期望：无"残留"输出 + JSON OK（改 JSON 后必须验语法，逗号漏一个就整套 i18n 崩）
```

#### 4.4.4 CSS（可选清理，不影响判据）

```powershell
Select-String -LiteralPath src/renderer/react/features/settings/ChannelsSettingsPanel.css -Pattern 'cy-channels-context|cy-channels-binding' -Encoding UTF8
# 这些规则的 DOM 已不存在 → 可删；删后确认文件内不再出现这两个前缀
```

### 4.5 三套编译面收口（T5）

```powershell
npx tsc -p tsconfig.main.json | Select-String 'error TS' | Measure-Object | Select-Object -Expand Count      # 期望 0
npx tsc -p tsconfig.preload.json; "preload exit=$LASTEXITCODE"                                               # 期望 exit=0
npx tsc -p tsconfig.renderer.json | Select-String 'error TS' | Measure-Object | Select-Object -Expand Count  # 期望 0
```

- 主进程那条 `TS2694`（`WindowStatePersistence`）应随 **electron 44** 自动消失（事实 1 + 事实 2 已实测根因：43.1.0 的 `electron.d.ts` 里该标识符 **0 命中**）。
- 若渲染层仍有残留：**按四类逐条归因**（§六 6.2），**不许**用"反正是既有的"一句话放过。

### 4.6 构建链验证（T6）

```powershell
npx vite --version                       # 期望 8.3.0（< 8 则 rolldownOptions 是未知字段，X2 触发）
npm run build:renderer; "renderer exit=$LASTEXITCODE"     # 期望 0
Get-ChildItem dist/renderer -Recurse -Filter index.html | ForEach-Object { $_.FullName.Replace($PWD.Path+'\','') }
# 期望 6 个入口都在（X2 的产物判据）：
#   dist/renderer/index.html
#   dist/renderer/react/index.html
#   dist/renderer/call-react/index.html
#   dist/renderer/music/index.html
#   dist/renderer/toast/index.html
#   dist/renderer/sticker-manager/index.html
npm run build; "full exit=$LASTEXITCODE"                  # 期望 0（main + preload + cli + renderer）
```

> ✅ **P7 施工实测（§十三 T3「若 `rolldownOptions` 在 vite 8 下的行为与预期不同，就地记录」的答复：行为与预期一致）**：
> - `npx vite --version` = **`vite/8.3.0 win32-x64 node-v24.21.0`**（≥8，**X2 的前提不成立**）
> - `npm run build:renderer` **exit 0**；`npm run build` **exit 0**
> - **6/6 入口 html 全部生成** ✔（逐条 `Test-Path` = True，与上面清单逐一对应）
> - **旁证**：构建输出里出现 `Use build.rolldownOptions.output.codeSplitting to improve chunking: https://rolldown.rs/reference/OutputOptions...`
>   —— vite 自己按 **rolldown**（而非 rollup）的 API 提示，**证明 `rolldownOptions` 确实被 8.3.0 识别并生效**，
>   不是"退出码 0 但配置被忽略"的假通过。
> - 📌 构建产物只有 6 个入口 html（无第 7 个）：配置里另有第 7 个入口 `chat-perf`（`src/renderer/react-perf/index.html`），
>   但它只在 `CYRENE_PERF_OUT_DIR` 环境变量存在时才进 `input`（`vite.config.mts:96` 的 `perfOutDir` 守卫）→ **本次未设该变量，故预期不出**。**与 X2 无关**。

**`npm run dev` 冒烟**（agent 只判"起得来"，"能用"交人 → H-B4）：

```powershell
npm run dev
# 判据：vite 打印 ready（Local: http://localhost:5173/）且 10 秒内无致命错误
# 注意：这是 GUI 应用，会弹窗口 → 用后台作业起，别阻塞
```

> ✅ **P7 施工实测：`npm run dev` 起得来**（这同时**关闭了事实 4 的诊断**）：
> `build:main` / `build:preload` / `build:cli` 三步均先成功 → 然后
> `[0] VITE v8.3.0  ready in 334 ms` + `➜ Local: http://localhost:5173/`，且 `[1]` 侧 electron 44 打印启动横幅，
> 依次完成 `core/initSkills 102ms` → … → **`core/windows-revealed (at 14133ms)`** → `core/startCore-total 14133ms`，
> MCP 24 工具就绪、reranker ready。**全程无致命错误、无白屏/闪退迹象。**
> 📌 **这正是"事实 4"要推翻的那句旧结论的反证**：修之前 `vite` 在**加载配置**这一步就死（`@tailwindcss/vite` 未装 → `ERR_MODULE_NOT_FOUND`）。
> ⚠️ agent 只判"**起得来**"；"**能用**"（窗口是否正常、渠道页是否正常渲染）交 **H-B4 / H-B3** 人判。
> ⚠️ 启动日志里两处**非失败**观察：`[Screenshot] native helper prewarm failed … cyrene-screenshot.exe ENOENT`（Rust 原生助手未编译，与合并无关）、
> `[WechatBot] No credentials` / `[StickerEmbedding] Model not found`（未配置/未下载模型的预期提示）。

### 4.7 门禁重跑（T7）

```powershell
# A2 语料豁免（总蓝图 §八 8.2）
npx vitest run src/main/memory/memory-deletion.test.ts src/main/corpus/group-corpus-isolation.test.ts   # 期望 22 passed

# A3 静默失效探测器（唯一能抓"群聊旁听消失"的门禁；**必须留在名单里**）
npx vitest run src/main/channels/group-context-flow.test.ts                                             # 期望 4 passed

# P6 的定向门禁（12 文件）+ 本 Phase 新增的渲染层回归
npx vitest run `
  src/main/channels/group-context-flow.test.ts src/main/channels/history-log.test.ts `
  src/main/channels/channel-context.test.ts src/main/channels/dispatcher.test.ts src/main/channels/bootstrap.test.ts `
  src/main/channels/settings-store.test.ts `
  src/main/orchestrator/tools/registry/tool-registry-memory.test.ts src/main/orchestrator/group-context-injection.test.ts `
  src/main/orchestrator/build-options.test.ts src/main/orchestrator/agent-runtime.test.ts `
  src/main/settings/settings-facade.test.ts src/main/conversation-usage-store.test.ts `
  src/renderer/react/features/settings/ChannelsSettingsMigration.test.ts
# 期望：13 文件全绿（P6 基线 12 文件 / 269 tests → 现在 13 文件 / 273 tests）

# 全量
npm test
# 期望（与 P6 报告的 31 failed / 9 tests failed 对照）：
#   ①类（依赖未装）**归零**（本 Phase 已装齐）
#   ②③④类**只允许减少，不允许增加**
```

**①类为什么应当归零**：P6 报告列出的 ①类失败文件（`VoiceCallPreviewDialog` / `AgentSettingsMigration` / `AsrSettingsMigration` /
`ChannelsSettingsMigration` / `McpSettingsPanel.config` / `ModelSettingsPanel.models` / `ToolSettingsPanel.music` / `UserAvatar` /
`ChatMessageList*` / `CommandTerminal` / `api-config-source` / `StreamdownMessageContent*` / `packages/plugin-sdk …index.test.ts`）
根因都是"模块未安装"，而本 Phase 已把 15 个包 + `@types/qrcode` 装齐。
**若仍有 ①类失败** → 逐条查明是"还有别的包没装"还是"装完暴露的真问题"。

---

## 五、人工环节（规范 §4.1：H-A 施工前·阻塞 / H-B 施工后·退出条件 / H-C 欠账）

### 5.1 H-A 拍板（施工前）

| 编号 | 议题 | 状态 | 答复 |
|---|---|---|---|
| **H-A4** | **是否把 `npm ci` 从 P8 提到 P7 起手** | ✅ **已拍板**（2026，本轮） | **提到 P7**：不装依赖，本 Phase 的构建链判据一条都验不了（事实 4 实测 vite 配置加载失败） |
| **H-A5** | **渲染层是"删绑定 UI"还是"补回 3 个 IPC 声明"** | ✅ **已由 D1 推出**（无需新拍板） | **删 UI**。补声明 = 复活已删除的绑定功能，与 **D1** 和台账 **H-14** 直接冲突；且 preload/main 定义面实测 0 命中 → 补声明只能得到运行期 `TypeError` |

> 📌 **本 Phase 不新开 H-A 阻塞项**：D1（删绑定）、D6（文档排除）、顺序变更三项都已由项目所有者拍板。

### 5.2 H-B 评审（施工后·退出条件）

| 编号 | 评审项 | 期望（agent 已预先算出，**不许让人现场猜**） | 人只做判断 |
|---|---|---|---|
| **H-B3** | 打开**设置 → 渠道**页 | ① 页面**正常渲染**（不是白屏/控制台报错）② **找不到**「上下文绑定」区块（标题、外部聊天/桌面对话两个下拉、绑定按钮、绑定列表）③ **找不到**「镜像到桌面 / Mirror messages in desktop chat」开关 ④ 仍能看见：渠道卡片网格、速率限制、发送 TTS/贴纸、手机端工具权限、最近收发记录 | 逐条 ✅/❌ |
| **H-B4** | `npm run dev` 起来的应用 | 窗口正常出现、聊天页可交互、无白屏；打开渠道设置如上 | ✅/❌ |

> 🔴 **H-B3 的第 ① 条是本 Phase 的"可见性收口"**：`ChannelsSettingsPanel.tsx:115` 把已删除的 IPC 写在 `Promise.all([...])` 实参里，
> 方法不存在时是**同步 `TypeError`**、`.catch` 兜不住 → 修之前该页**必崩**。这条同时关闭台账 **H-14 第 6 步**。

### 5.3 H-C 登记（欠账，P8 统一销账）

| 台账条目 | 本 Phase 的动作 |
|---|---|
| **H-14**（绑定彻底消失） | 第 5 步（镜像开关）与第 6 步（渠道页可打开）**本 Phase 施工后具备人验条件** → 在台账里标"P7 后待验" |
| **H-02 / H-03 / H-05 / H-13（运行期）** | 时点由「🟢 现在可做」**改为「P7 装依赖后可做」**（事实 4） |
| **H-13（代码级）** | 已销账，本 Phase 不重复 |

---

## 六、验收测试

### 6.1 A1–A10

| # | 验收项 | 命令 | 期望 |
|---|---|---|---|
| **A1** | 索引对齐 | `git diff --ignore-cr-at-eol --name-status` | 不再含那 4 个代码/测试文件 |
| **A2** | 文档排除 | `git ls-files docs/merge-plan` / `git ls-files "docs/construction/合并"` | 均 **0** |
| **A3** | 依赖装齐 | §四 4.3 ③ 的三段命令 | 15 包 True + `@types/qrcode` True + vite 8.3.0 + vitest 5.x + electron 44.x + `electron.exe` True |
| **A4** | 渲染层残留清零 | §四 4.4 各步 grep 判据 | 全 **0** 命中（面板 / 测试 / 两套 i18n） |
| **A5** | 三套编译面 | §四 4.5 | main **0** / preload **exit 0** / renderer **0** |
| **A6** | 构建链 | §四 4.6 | vite 8.3.0 + `build:renderer` exit 0 + **6 个入口 html** + `npm run build` exit 0 |
| **A7** | 语料豁免边界 | §四 4.7 A2 命令 | **22 passed** |
| **A8** | 静默失效探测器 | §四 4.7 A3 命令 | **4 passed**（且该文件仍在门禁名单里） |
| **A9** | 定向门禁 | §四 4.7 的 13 文件命令 | **13 文件全绿 / 273 tests** |
| **A10** | 全量测试 | `npm test` | ①类**归零**；②③④类**不增加**（对照 P6 的 31 failed 文件） |

### 6.2 四类"不算失败"（**P6 的旧定义已按本 Phase 调整**）

| 类 | 定义 | 本 Phase 后是否仍豁免 |
|---|---|---|
| **① 依赖未装** | 因 `node_modules` 缺包/版本旧而失败 | 🔴 **不再豁免** —— 本 Phase 已装齐，若还失败必须逐条归因 |
| **② 失去被测对象** | 官方新测试依赖 P4 已删的资产（`renderer/settings/**` 11 文件、`panel-layout.test.ts`） | ✅ 仍豁免（J-06/J-08/J-09 已定义） |
| **③ 存量违规** | `theme-token-contract.test.ts` 的 `ToolConsolePanel.css` 令牌违规 | ✅ 仍豁免（P8 处置） |
| **④ 与合并无关的存量失败** | `default-dialogs-regression.test.ts`（`ToolConsolePanel.tsx:285` 的 `window.confirm`，三版本逐字节相同） | ✅ 仍豁免（P8 处置） |

> 归因纪律：**每条失败都要落到这四类之一并写出证据**；落不进任何一类 = **本 Phase 的失败**。

### 6.3 保护功能基线（A1 脚本，总蓝图 §八 8.2）

```powershell
$base = Get-Content .cyrene-merge-analysis/protected-features-baseline.json | ConvertFrom-Json
foreach($p in $base){
  $hits = & findstr /S /M /C:"$($p.标识)" "src\*.ts" "src\*.tsx" 2>$null
  $now = if($hits){ ($hits | Measure-Object).Count } else { 0 }
  Write-Output ("{0,-22} 基线 {1,2} → 现在 {2,2} {3}" -f $p.功能, $p.文件数, $now, $(if($now -ge $p.文件数){'✔'}else{'✘ 退化!'}))
}
```

**期望**：与 P6 报告 §四 的 **11/11** 一致（`memory-console` 4 / `person-erasure` 8 / `ZONES_` 5 / `audit-log` 11 /
`tool-access` 13 / `keyword-policy` 6 / `group-corpus` 10 / `buildGroupContextBlock` 5 / `USAGE_BADGE` 2 /
`groupContextLimit` 10 / `confirmValue` 5）。
**唯一允许的变化**：本 Phase **删掉渲染层的渠道绑定区块**，若某个基线项的标识恰好是 `channelsContext*`，需**说明原因**而不是当作退化。

---

## 七、交付物

| # | 文件 | 内容 |
|---|---|---|
| 1 | `src/renderer/react/features/settings/ChannelsSettingsPanel.tsx` | 删绑定 UI + 镜像开关（D1 渲染层收尾） |
| 2 | `src/renderer/react/features/settings/ChannelsSettingsMigration.test.ts` | 夹具与断言同步（4 条用例仍全绿） |
| 3 | `src/renderer/react/i18n/{zh-CN,en}.json` | 删 11 个 key（+ 按判据决定的 7 个） |
| 4 | （可选）`ChannelsSettingsPanel.css` | 删 `.cy-channels-context*` / `.cy-channels-binding*` 死规则 |
| 5 | `.cyrene-merge-analysis/p7/pre-hashes.txt` | 7 行改动前 blob 哈希 |
| 6 | `E:\AI_Chating\cyrene-agent-p7-backup` | 7 文件原始态备份 |
| 7 | （仅 S1 触发时）`package-lock.json` | 锁变更，**必须在报告里单列** |
| 8 | （仅 X1 触发时）`package.json` 的 `allowScripts` | 补 `electron@44.4.3` / `esbuild@0.28.2` 条目，**必须单列** |
| 9 | `dist/renderer/**` | 构建产物（6 个入口），由 4.6 生成 |

---

## 八、回退方法

```powershell
cd E:\AI_Chating\cyrene-agent
$env:PATH = "D:\data\node24;" + $env:PATH

# 级 1 · 单文件（最常用）：从 p7 备份还原
Copy-Item "E:\AI_Chating\cyrene-agent-p7-backup\src__renderer__react__features__settings__ChannelsSettingsPanel.tsx" `
  src/renderer/react/features/settings/ChannelsSettingsPanel.tsx -Force
# 校验：git hash-object -- <path> 应与 .cyrene-merge-analysis/p7/pre-hashes.txt 对应行一致

# 级 2 · 索引回退（只回索引，不动工作区）
git reset -q -- <path>

# 级 3 · 依赖回退（装坏了）
npm ci                     # 重装一遍（幂等；耗时同上）

# 级 4 · 回到 P6 末态
git checkout phase3-work-snapshot -- <path>     # 单个文件
# 或整批：见 P6 报告 §七 级 3/4

# 级 5 · 连 .git 都没了
robocopy E:\AI_Chating\cyrene-agent-backup-phase0 E:\AI_Chating\cyrene-agent /E /XD node_modules
```

> 🔴 **永不** `git merge --abort`。
> 🔴 **永不** 对 `src/main/channels/history-log.ts` 做任何 `checkout`。
> 🔴 **永不** `git checkout <ref> -- .`（工作区大面积覆盖 = 丢 P6/P7 成果）。
> ⚠️ `npm ci` 会**重建整个 `node_modules`** → 回退依赖的代价是 5–20 分钟，别把它当"轻量回退"。

---

## 九、已知坑（本 Phase 会撞到哪些）

| 坑（键号） | 本次是否预计复现 | 说明 |
|---|---|---|
| **K10** PowerShell `-Pattern` 计数不可靠 | ✅ | i18n key 计数、`channelsContext` 计数都要**回读原文复核**（P6 实测：`getL2ForScope` 的"≥2"实为 1） |
| **K13** 临时 worktree + junction 删 node_modules 会误删主仓 | ✅（若用 worktree 验依赖） | 本 Phase **不要**为验依赖建 worktree；直接在主仓 `npm ci` |
| **K15** 删宿主文件不会自动暴露依赖者 | ✅ | 删面板的绑定区块后，**依赖者散在 i18n / CSS / 测试** 三处（X3）—— `tsc` 只抓得到 TSX 那一处 |
| **K18** "取 ours 还是 theirs"要看测试属哪一侧 | ✅ | `ChannelsSettingsMigration.test.ts` 属**官方**侧（官方新测试）→ 官方侧要删的用例/断言，**删并留痕** |
| **K19** 冲突块数 ≠ 整合面 | ✅ | 事实 5：`settings/shared/types.ts` 在 P5 被取 ours，**代价延迟到 P7 才暴露**（5 条 `TS2339` + 一个会崩的页面） |
| **K20** 签名参数被取 theirs 删掉后功能静默消失 | 部分 | 本 Phase 主要风险是**反向**：删 UI 时把仍需的 import/状态一起删掉 |
| **（新）** `install-scripts` 白名单拦 postinstall | ✅ **新坑** | 见 X1。**必须追加进经验库**（L 级，`经验库-具体坑.md`） |
| **（新）** `rolldownOptions` 是 vite 8 专属字段 | ✅ **新坑** | 见 X2。老 vite 下**不报错、静默退回默认** → 必须用**产物清单**判定，而不是退出码 |
| **（新）** 主进程干净 ≠ 应用能起 | ✅ **新坑** | 见事实 4：`npm run dev` 还要过 vite 配置加载（渲染层依赖）。**必须追加进经验库**（M 级） |

---

## 十、交接给 P8

1. 🔴 **仍然不要提交**（除非项目所有者明确要求）：本 Phase 结束时索引已对齐、文档已排除，但**提交动作**按总蓝图留在 P8 之后。
2. 📌 **P8 的首要任务**：`npm ci` 已在本 Phase 完成 → P8 改为**"验证 + 人工台账逐条销账 + 提交"**。
3. 📌 **P8 待处置清单**（承接 P6 报告 §八 第 8 条，去掉已完成的依赖项）：
   - ① 7 个"失去被测对象"的测试（**H-07**，三选一待拍板）
   - ② `theme-token-contract` 的 `ToolConsolePanel.css` 存量违规
   - ③ `default-dialogs-regression.test.ts`（`ToolConsolePanel.tsx:285` 的 `window.confirm`，存量）
   - ④ `package-lock.json` 收尾：本 Phase 若未动锁，P8 需确认 `package-lock.json` 与 `package.json` 的关系（lock 根 `version` 仍是 `1.2.2`，而 `package.json` 是 `1.2.2-PLUS`）
4. 🔴 **门禁名单不许缩减**：`group-context-flow.test.ts`（群聊旁听探测器）必须继续在 P8 的门禁里。
5. 📌 **人验时点已前移**：装齐依赖后，台账里 H-02 / H-03 / H-05 / H-13（运行期）/ H-14 第 5-6 步都具备人验条件 → P8 销账时一并做。

> ## 🔴 P7 施工后追加的交接项（**这 6 条是 P7 实测新增的，P8 必读**）
>
> 6. 🔴 **提交前必须 `git add` P7 改过的 5 个文件**：`ChannelsSettingsPanel.tsx`、`ChannelsSettingsMigration.test.ts`、
>    `ChannelsSettingsPanel.css`（三个在索引里装的是**改之前**的版本，状态 `AM`）、
>    `i18n/zh-CN.json`、`i18n/en.json`（状态 `MM`）。
>    **若直接 `git commit`，这 5 个文件会提交"改之前"的版本 → 渲染层 5 条 `TS2339` 复活、渠道页重新变成会崩的状态。**
>    （P7 未做这一步的原因：§四 4.1 只要求对齐那 4 个 P6 文件，§七 交付物也未把这 5 个列为索引对齐对象 → **属 P8 的"提交"动作**，见 §十二 子节 2 漏洞 5。）
> 7. 📌 **`package.json` 有 2 行计划外改动**（`allowScripts` 里 `esbuild@0.21.5` → `esbuild@0.28.2`，P7 的 X1 处置副作用）。
>    **提交前确认它有意进入提交**（它让本机装 esbuild 时能跑 postinstall；对别人无副作用）。
>    `electron@43.1.0` 条目**原样保留**（不要去改成 44 —— 见 §十二 子节 1 偏差 2）。
> 8. 📌 **`package-lock.json` 未变**（`05dcca09…`）→ P8 的 ④ 收尾项（lock 根 `version` = `1.2.2` vs `package.json` = `1.2.2-PLUS`）**仍然存在**，需拍板。
> 9. 🔴 **§六 6.3 的基线脚本会误报**：它读 Phase 0 的基线文件，对 `群上下文上限` 会报 `✘ 退化!`（基线 11 vs 实测 10），
>    而该退化 **P4 已归因、P5/P6 报告已登记**（`groupContextLimit` 唯一丢失点在已删的 `settings.ts`；P6 报告 §四 的 11/11 用的就是 10）。
>    **P8 跑该脚本时请以「P6 报告 §四 的 11/11」为判据，不要以脚本输出为判据**；并考虑把基线文件升级为"带 Phase 修订记录"的形态。（见 §十二 子节 2 漏洞 2）
> 10. 📌 **D6 的措辞歧义待拍板**：`docs/**` 下另有 **35 个 P3 期就已暂存的官方新增文档**
>    （`docs/design/**` 18、`docs/internal-issue/**` 8、`docs/superpowers/**` 6、`docs/refactor/**` 2）。
>    D6 的字面定义是"**本任务的**文档"（两条路径），这 35 个不在其中，**P7 未动它们**。
>    若项目所有者的意图是"**任何文档都不进合并提交**"，则需另行拍板。（见 §十二 子节 2 漏洞 4）
> 11. ✅ **`npm run dev` 现在真的起得来**（P7 已实测：vite ready 334ms + electron 44 + `core/windows-revealed`）→
>    H-02 / H-03 / H-05 / H-13（运行期）/ H-14 第 5-6 步**现已具备人验条件**，不必再等。
> 12. ⚠️ **`electron-winstaller@5.4.0` 有意未 approve**（仅打包安装包时需要）。若 P8 要跑 `electron-builder` 出安装包，需先 `npm install-scripts approve electron-winstaller`。

---

## 十一、改动的目标达成核对（**执行后回填**）

| 目标（§一） | 状态 | 证据 |
|---|---|---|
| T1 索引对齐 | ✅ | 4 文件 `git diff --ignore-cr-at-eol --stat -- <f>` 全部**无输出**（工作区 ≡ 索引）；`git diff --cached --stat` 非空 = **679 insertions / 96 deletions**（修正真的进了索引）。见子节 1 偏差 1 |
| T2 文档排除 | ✅ | `git ls-files docs/merge-plan` = **0**；`git ls-files "docs/construction/合并"` = **0**；`Test-Path .../PHASE-6-完成报告.md` = **True**（磁盘未动） |
| T3 依赖装齐 | ✅ | 15 包 + `@types/qrcode` 全部 `True`；vite **8.3.0** / vitest **5.0.1** / electron **44.4.3** / esbuild **0.28.2** / plugin-react **6.1.1** / tailwindcss+@tailwindcss/vite **4.3.3** / typescript 5.9.3；`electron.exe` **True** 且 `--version` = `v44.4.3`；`import('@tailwindcss/vite')` = **OK** |
| T4 渲染层残留清零 | ✅ | 面板 grep 7 个符号 = **0 命中**；测试文件 grep = **0 命中**；两套 i18n 的 18 个 key 在 `settingsPage.channels` 下 **0 残留**（key 集合 56 = 56，两套一致）；CSS 死规则 = **0 命中** |
| T5 三套编译面收口 | ✅ | main = **0 条**；preload = **exit 0**；renderer = **0 条**（48 → 0） |
| T6 构建链可执行 | ✅ | `npx vite --version` = **8.3.0**；`build:renderer` **exit 0**；**6/6 入口 html** 全在；`npm run build` **exit 0**；`npm run dev` **起得来**（vite ready 334ms @ localhost:5173 + electron 44 启动 + `core/windows-revealed`） |
| T7 门禁不退化 | ✅ | A2 = **22 passed**；A3 = **4 passed**；A9 = **13 文件 / 273 tests 全绿**；全量 = **15 failed 文件 / 4 failed tests**（对照 P6 的 31 / 9 —— ①类**归零**，②③④类**只减不增**） |

**非目标遵守情况**（执行后逐条填 ✅）

| 非目标 | 是否越界 | 证据 |
|---|---|---|
| N1 未提交 | ✅ 未越界 | `git rev-parse --short HEAD` = **598dfb75**；`MERGE_HEAD` = **b11b8851**；`.git/MERGE_HEAD` 仍在 = True。**本 Phase 零 `git commit`** |
| N2 未动 `history-log.ts` | ✅ 未越界 | `git status --porcelain -- src/main/channels/history-log.ts` **无输出**；worktree blob = `c7e54e88…` |
| N3 未动 CTA | ✅ 未越界 | `conversation-transcript-store.ts` / `-compactor.ts` 的 `status` 为 **`A `（官方新增文件，非 P7 改动）**且** mtime = **2026/9/27 0:46**（P7 开工于 09/29 23:4x）→ 非本 Phase 触碰。**协议级 kind 一个未增未改** |
| N4 未修 ②③④ 类 | ✅ 未越界 | ②③④ 类文件（`renderer/settings/**`、`theme-token-contract`、`default-dialogs-regression`）均**不在** §四 4.0 的 7 文件清单内，也未被 P7 写过 |
| N5 未动 corpus / binding-store | ✅ 未越界 | `git status --porcelain -- src/main/corpus` = **0 条**；`Test-Path src/main/channels/conversation-binding-store.ts` = **True** 且无改动 |
| N6 未删 `settings/shared/types.ts` 的类型 | ✅ 未越界 | 该文件 `git diff --stat` **为空**（P7 只清**调用面**，未动类型定义面） |
| N7 未重建锁（除非 S1） | ✅ 未越界 | `package-lock.json` 哈希 **`05dcca09…` 前后一致**，`git diff --stat` 为空。**S1 未触发**。⚠️ **但 `package.json` 被改了 2 行**（`allowScripts`），见子节 1 偏差 2 —— 它属 X1 处置的**计划外改动，已单列** |

---

## 十二、施工记录（执行者追加；**子节 0 为必需**）

### 子节 0 · 人工环节回执

| 编号 | 议题 | 答复原文 | 时间 |
|---|---|---|---|
| H-A4 | 是否把 `npm ci` 提到 P7 起手 | **已拍板：提到 P7**（本轮，不经新确认 —— 蓝图 §零 0.1 ① 已记录为项目所有者拍板）。**P7 已执行并证实该判断正确**：不装依赖则 §四 4.6 的 5 条判据**一条都验不了**（`import('@tailwindcss/vite')` = `ERR_MODULE_NOT_FOUND`） | 2026（蓝图撰写轮） |
| H-A5 | 渲染层删 UI 还是补 IPC 声明 | **已由 D1 推出：删 UI**（不经新确认 —— 蓝图 §零 0.1 ③）。**P7 已按此执行**：删 5 处调用 + 整套绑定 `<section>`；**未补任何声明**。经全仓复核，那 3 个 IPC 在 `preload`/`shared`/`main` 的定义面确为 0 命中 → 补声明只会得到运行期 `undefined is not a function` | 2026（蓝图撰写轮） |
| H-B | H-B3 / H-B4 结论 | ⏳ **待项目所有者人验**（agent 只交判据，不代人判）。H-B3 期望 4 条 / H-B4 期望 2 条见 §五 5.2；**agent 已预先算出并在 §十二 子节 6 给出机器侧证据** | — |
| H-C | 登记的台账编号 | **H-14 第 5-6 步**（时点由「必须等 P8」→「**P7 后具备人验条件**」）；**H-02 / H-03 / H-05** 时点由「P7 装依赖后可做」→「**P7 已完成 → 现在可做**」；**H-13 运行期部分**仍待 P8。已回写台账 §一 与 §三 | 2026（P7 施工轮） |

> 📌 **本 Phase 未新开 H-A 阻塞项**：D1 / D6 / 顺序变更三项在蓝图撰写轮已由项目所有者拍板，P7 只执行。
> **无新增 H-C 欠账**：P7 未引入任何新的"机器验不了"事项。

### 子节 1 · 实际落地（偏离三列表）

| # | 蓝图要求 | 实际实现 | 原因 |
|---|---|---|---|
| **1** | §四 4.1 判据：`git diff --cached --ignore-cr-at-eol --stat -- src/main/channels/dispatcher.ts` **期望无输出** | **有输出**（`255 insertions / 58 deletions`）。**判据写错了，不是执行错**：`--cached` 是「索引 vs **HEAD**」，`git add` 之后它**必然非空**（HEAD 里是 P3 签入前的旧版）。蓝图想验"工作区 = 索引"，那一该用 `git diff --stat`（无 `--cached`） | 已用两条命令分别取证：`git diff --stat`（工作区 vs 索引）= **空** ✔；`git diff --cached --stat` = **679/96** ✔（证明修正真的入库）。**判据已就地修正并写进本条** |
| **2** | §四 4.3 X1：装完 `npm install-scripts ls`，若 electron/esbuild 在未覆盖列表里 → `approve` | **只有 `esbuild@0.28.2` 被列出**；**`electron` 根本不在列表里**。实做：`approve esbuild`（成功，并把 `allowScripts` 里 `esbuild@0.21.5` 替换为 `esbuild@0.28.2`）。electron 改走**懒下载**触发 | 🔴 **蓝图的 X1 假定对 electron 44 不成立**：electron@44 **上游已删除 `scripts.postinstall`**（`node_modules/electron/package.json` 的 `scripts` = `undefined`），二进制由 `index.js` 在 `require()` 时经 `spawnSync(install.js)` 下载。"既没被拦、也没被跳过，只是没人 require 过它"。**未执行 `npm rebuild electron esbuild`，也不需要**（esbuild 的 `@esbuild/win32-x64/esbuild.exe` 本就随 optional 依赖就位） |
| **3** | §十三 T4：新增 4 条经验 | 追加 **5 条**（多 1 条） | 拆分了 X1：蓝图想记 1 条，但实测暴露**两件不同的事** —— ①白名单会拦 postinstall（**L / X10，通例**）②electron 44 的 lazily-download（**L / E8，版本特定**）。合成一条会让后人照抄错误假定。另因 §6b/§7 的键号续编约定，L 级落位 §7 的 `X10`/`X11`（**与全量台账附录 B 的 X10/X11 同名，已在附录 E 标注两套命名空间**） |
| **4** | §四 4.4.4 CSS「可选清理」 | **已执行**（非"可选跳过"） | 死规则 8 处全删（140 → 106 行）。注意保留了两处**共享**选择器：`.cy-channels-field`（原与 `.cy-channels-context__form label` 同组，删了前缀后**该规则仍需保留**）与 media query 里的 `.cy-channels-grid`（原与死规则同行） |
| **5** | §四 4.4.3：删 11 个 key +「按判据决定的 7 个」 | 实际删 **18 个**（11 + 7 全部） | 那 7 个 key 的引用数**实测各 = 1**，且**全部落在被删的那段 JSX 内**（`K10` 复核：逐条回读原文行号确认，非凭计数）。`groupChat`/`privateChat` **并未**如蓝图预警那样"很可能还被别处用" —— 实测各 1 处，均在 `:253` |
| **6** | §十三「T2 时点被改写：H-02/H-03/H-05/H-13 由「🟢 现在可做」改为「P7 后」」 | **该回写在蓝图撰写轮已完成**（台账原文已是「🟢 P7 装依赖后可做」）；**P7 本轮把它再推进为「✅ P7 已完成 → 现在可做」** | P7 装完了依赖且 `npm run dev` 已实测起来 → 停留「P7 后」会**低估**当前可验性。这是一处**时序推进**而非改写 |

### 子节 2 · 蓝图未覆盖、施工中发现的漏洞

**漏洞 1（🔴 最重要）· 「索引对齐」的判据被写反了方向**
§四 4.1 的第二条判据用 `git diff --cached` 去验"工作区 = 索引"，而前一条判据（`git diff --name-status`）已经在验同一件事。
`--cached` 比较的是**索引 vs HEAD**，在 `git add` **之后必然非空** → **该判据在任何正确执行下都会失败**。
若执行者照字面把它当失败，会得出"4.1 没做成"的错误结论，进而**可能去 revert 那次 `git add`**（那才会真正破坏 T1）。
**对策（已落地）**：把"工作区 vs 索引"与"索引 vs HEAD"拆成两条命令、两个方向分别判，并把两侧期望值都写清（§四 4.1 判据已就地修正）。**这是 J-系判据缺陷类问题，建议登记进判据台账。**

**漏洞 2 · §六 6.3 的保护功能基线脚本，比对对象是**过期**的基线文件**
§6.3 的 A1 脚本读 `.cyrene-merge-analysis/protected-features-baseline.json`（**Phase 0 生成，此后从未更新**），
而 P4/P5 已**如实记录**过两项**预期退化**（`USAGE_BADGE` 2→0 后 P5 重建为 2；`groupContextLimit` 11→10）。
P7 实测：该脚本对 **`群上下文上限` 会报 `✘ 退化!`**（11 vs 实测 10），对 `buildGroupContextBlock` 报 5（基线 4）——
**两条都不是 P7 造成的，而是"脚本仍在跟 Phase 0 的旧数字比"**。
蓝图 §6.3 自己也写了"期望与 P6 报告 §四 的 11/11 一致（…`groupContextLimit` 10）"——
**即：脚本的判据与同节正文的期望值互相矛盾**，且**正文才是对的**（P7 实测 11/11 与 P6 逐项吻合）。
**对策**：P7 **未修脚本**（改基线文件会污染历史锚点），改为在报告中显式以「P6 报告 §四 的 11/11」为判据，
并在此登记：**该基线文件应升级为"带 Phase 修订记录"的形态，或让脚本接受一份 post-P4/P5 的修正表**。属 P8 收尾项。

**漏洞 3 · 验收判据里"未跟踪"的粒度陷阱**
§四 4.2 的期望是 `?? x22`（指新路径那 22 个文档），但 `git status --porcelain` **默认按目录折叠**（`?? docs/construction/合并/` 只算 **1** 行）。
实测：折叠口径 = **1** 条；`--untracked-files=all` = **31** 条。
**两者都不是 22**，因为该目录下还混着 `docs/construction/蓝图体系结构对比.md` 等**不属于任务文档**的文件。
**对策**：验"文档是否进索引"**只认 `git ls-files <dir>` = 0**（那才是权威判据，P7 两条均为 0 ✔）；
`??` 行数**不应**作为判据（蓝图自己也在 P5 基线段标注过「status 行数不作判据」）。

**漏洞 4 · `docs/**` 下另有一批**已暂存**的非任务文档（D6 作用域的边界）**
实测 `git status --porcelain -- docs` 报 **`A x35 / D x13`**，而非蓝图预期的 `D x13 + ?? x22`。
那 35 个 `A` 是 `docs/design/**`（18）、`docs/internal-issue/**`（8）、`docs/superpowers/**`（6）、`docs/refactor/**`（2）
—— **全部是 P3 期就已暂存的官方新增文档**，与 D6 的两条路径**无交集**（P7 的两条命令也不可能碰到它们：路径前缀不同）。
**判定：不属 D6 作用域**（D6 的定义是"**本任务的**文档"，即 `docs/merge-plan/**` 与 `docs/construction/合并/**`），
**P7 未动它们**（保持 P3 遗留状态）。但**如实登记**：若项目所有者的意图是"**任何文档都不进合并提交**"（而非"任务文档不进"），
则这 35 个需另行拍板 —— **这是 D6 措辞的一处歧义，留给 P8。**

**漏洞 5 · 面板删改后索引里留的是"旧版已暂存 + 新版在工作区"**
P7 改的 4 个面板文件在 `git status` 里是 **`AM` / `MM`**（不是 ` M`）：因为其中 3 个（`ChannelsSettingsPanel.tsx`、`.test.ts`、`.css`）
是**官方新增文件**（HEAD 中不存在、MERGE_HEAD 中存在），P3 已把它们暂存；
而索引里的 blob 恰为 P7 的 **pre-hash**（`1d1ecab3…` / `a51124e6…` / `d44d52ac…`）→ **证明索引装的是 P7 之前的版本**。
**这不构成 T1 失败**（§四 4.1 只对齐那 4 个 P6 文件；§七 交付物也**未把**这几个文件列为索引对齐对象），
**但它意味着：若 P8 直接 `git commit`，这 5 个文件会提交"改之前"的版本**。
**对策**：已写入 §十 交接第 6 条（P8 提交前必须 `git add` 这批文件）。

**漏洞 6 · `git reset -q -- "<中文路径>"` 的可用性未验证**
§四 4.2 ② 依赖 `git reset -q -- "docs/construction/合并"` 能命中中文路径。P7 实测**可行**（执行后 `git ls-files "docs/construction/合并"` = 0）。
记录原因：若该命令因路径解析失败而静默无效，T2 会**假通过**（因为另一条 `git rm --cached` 已掩盖问题）。**实测无此风险**。

### 子节 3 · 依赖安装记录

| 项 | 实测 |
|---|---|
| `npm ci` 退出码 / 耗时 | **exit 0** / **2.74 分钟**（蓝图预估 5–20 分钟，实测更快；registry = `https://registry.npmmirror.com`） |
| `npm ci` 动作量 | **added 1623 packages in 3m**（dry-run 曾报"added 410 / removed 62 / changed 78"） |
| `install-scripts ls` 输出 | **装后首次**：2 项未覆盖 —— `electron-winstaller@5.4.0`（install）/ **`esbuild@0.28.2`**（postinstall）。**electron 不在列表里**（见子节 1 偏差 2）。**approve 之后**：剩 1 项 —— 仅 `electron-winstaller@5.4.0`（**构建安装包时才用，P7 的 4 条判据都不需要它 → 有意不 approve**） |
| 是否 approve / rebuild | **approve 了 `esbuild`**（唯一需要的）；**未做 rebuild**（经查不需要：`@esbuild/win32-x64/esbuild.exe` 随 optional 依赖已就位）。**未 approve electron**（它没有 postinstall 可批；其二进制改用 `node -e "require('electron')"` 触发懒下载，实测下载成功） |
| `package-lock.json` 是否变化 | **未变**（blob `05dcca09…` 前后一致；`git diff --stat` 为空）→ **S1 未触发、N7 未越界** |
| ⚠️ `package.json` 是否变化 | 🔴 **变了 2 行**（唯一被 P7 改动的已跟踪配置）：`- "esbuild@0.21.5": true,` → `+ "esbuild@0.28.2": true`（另因 JSON 末尾逗号，`tree-sitter@0.22.4` 行也落在 diff 里）。**这是 `npm install-scripts approve` 的副作用，属计划外改动，按 §七 交付物第 8 条单列**。**`electron@43.1.0` 条目原样保留**（未去改它 —— 见子节 1 偏差 2） |
| electron 二进制 | `node_modules/electron/dist/electron.exe` **True**；`path.txt` **True**（内容 `electron.exe`）；`& electron.exe --version` → **`v44.4.3`** |
| vite 配置期依赖 | `node -e "import('@tailwindcss/vite')"` 由 **`FAIL ERR_MODULE_NOT_FOUND`** → **`OK`**（事实 4 的诊断被完整证实并解除） |

### 子节 4 · 三套编译面的前后对比

| 编译面 | 开工前 | 完工后 | 说明 |
|---|---|---|---|
| main | **1**（`create-aux-windows.ts(36,55): TS2694 WindowStatePersistence`） | **0** | **未改任何代码** —— 随 electron 43.1.0 → **44.4.3** 自动消失。**证实蓝图"事实 1/2 的根因判断"完全正确**（43.1.0 的 `electron.d.ts` 里该标识符 0 命中） |
| preload | **0**（exit 0） | **0**（exit 0） | 全程未动 |
| renderer | **48** = `TS2307`×29 + `TS7006`×12 + `TS2339`×5 + `TS7016`×1 + `TS7031`×1 | **0** | 48 条**逐类归零**：29+12+1 = **42 条**由 4.3 装依赖消除（含 `@types/qrcode` 一条）；**5 条 `TS2339`** 由 4.4 删除调用面消除。**开工前实测的构成与蓝图事实 1 的表逐类吻合** |

> 🔴 **一处需要留痕的"数字口径"**：蓝图事实 1 把 `TS7006`/`TS7031` 合记为 **13**，P7 实测为 **12 + 1 = 13**（分类不同、总数一致）。
> **蓝图的 48 = 29+13+1+5 与 P7 实测的 48 完全一致**，无偏差。

### 子节 5 · 测试基线对比

| 层 | 开工前（P6 末） | 完工后（P7 实测） | 判定 |
|---|---|---|---|
| 语料豁免（A2） | 22 passed | **22 passed**（2 文件：15 + 7） | ✅ 不退化 |
| 探测器（A3） | 4 passed | **4 passed** | ✅ 不退化（且**仍在门禁名单里**） |
| 定向门禁（A9） | 12 文件 / 269 tests | **13 文件 / 273 tests** | ✅ 全绿、**无需归因**（新增第 13 个文件 = `ChannelsSettingsMigration.test.ts`，贡献 4 tests → 269+4 = **273 恰好闭合**） |
| 全量 | **31 failed 文件 / 9 failed tests**（542 passed / 5293 passed） | **15 failed 文件 / 4 failed tests**（**558 passed / 5403 passed**） | ✅ **只减不增**：失败文件 **31 → 15（−16）**、失败 tests **9 → 4（−5）**；通过数 **542 → 558（+16）**、**5293 → 5403（+110）** |

**15 个失败文件的逐条归因**（§六 6.2 要求"每条都要落到四类之一并写出证据"）：

| 类 | 文件数 | 文件与根因（**原样错误**） | 是否 P7 造成 |
|---|---|---|---|
| **①** 依赖未装 | **0** | — | ✅ **归零**（§6.2 要求"①类不再豁免"，实测确为 0） |
| **②** 失去被测对象 | **13** | ① **11 个**报 `Error: ENOENT: no such file or directory, open 'E:\AI_Chating\cyrene-agent\src\renderer\settings\index.html'`（P4 删除的宿主）：`settings/dom-refs-consistency`、`settings/keywords-markup`、`settings/memory-manager-markup`、`settings/panel-migration-markup`、`settings/zones-markup`、`settings/channels/panel`、`settings/memory/{erasure-flow,manager,panel}`、`settings/zones/panel`、`react/.../api-config/api-config-source`；② **1 个**报 `Error: Failed to resolve import "../i18n" from "src/renderer/settings/memory/delete-all.ts"`（同一条删除线）；③ **1 个** `panel-layout.test.ts` 报 `ENOENT ... ModelModePanel.css`（**另一条删除线**，J-08/J-09 已定义：4 passed / 2 failed） | ❌ 全部**非** P7（P4 删除的数学后果，J-06/J-08/J-09 已定义并豁免） |
| **③** 存量违规 | **1** | `theme-token-contract.test.ts`：`AssertionError: features\chat\components\ToolConsolePanel.css should use shared role variables for colors` | ❌ 非 P7（P8 处置） |
| **④** 与合并无关的存量失败 | **1** | `default-dialogs-regression.test.ts`：`AssertionError: expected [ Array(1) ] to deeply equal []`（`ToolConsolePanel.tsx:285` 的 `window.confirm`，三版本逐字节相同） | ❌ 非 P7（P8 处置） |
| | **15** | | **无一归因到 P7** |

> ✅ **①类归零的直接证据**：P6 报告列出的 ①类失败文件（`VoiceCallPreviewDialog` / `AgentSettingsMigration` / `AsrSettingsMigration` /
> **`ChannelsSettingsMigration`** / `McpSettingsPanel.config` / `ModelSettingsPanel.models` / `ToolSettingsPanel.music` / `UserAvatar` /
> `ChatMessageList*` / `CommandTerminal` / `api-config-source` / `StreamdownMessageContent*` / `packages/plugin-sdk …index.test.ts`）
> 在 P7 的全量结果里**已全部不在失败名单**；且 `ChannelsSettingsMigration.test.ts` 由"①类失败"变为 **4 tests 全绿**（P7 还顺手清了它的夹具）。
> ⚠️ `api-config-source.test.ts` 仍在失败名单，**但根因已从①类变为②类**（错误信息由"缺模块"变为 `ENOENT settings/index.html`）——
> 这正是"装齐依赖后暴露出的真实死因"，**不是**装坏了。

### 子节 6 · 验收后修复

**无。** P7 一次通过，未发生"验收失败 → 回修"的循环。逐条说明：

| 验收项 | 是否触发回修 | 说明 |
|---|---|---|
| S1（`npm ci` 硬失败） | ❌ 未触发 | exit 0 |
| S2（4.3 后出现无法归因的新编译错误） | ❌ 未触发 | 三套编译面**全部归零**，无任何新错误 |
| S3（4.4 后 ≥3 个测试文件变红） | ❌ 未触发 | A9 的 13 文件**全绿**；全量失败数**下降** |
| S4（`electron .` 起不来） | ❌ 未触发 | 走 X1 处置后 `electron.exe --version` = v44.4.3；`npm run dev` 窗口 reveal 正常 |
| S5/S6（越界冲动） | ❌ 未触发 | 未碰 `history-log.ts` / CTA / `corpus/**`；未用 `merge --abort` |
| S7（dev 起来但 10 秒内白屏/闪退） | ❌ 未观察到 | dev 日志显示 `core/windows-revealed (at 14133ms)`、`core/startCore-total 14133ms`、MCP 24 工具就绪、reranker ready —— **无崩溃无白屏迹象**（是否"可用"仍交 **H-B4** 人判） |

**两处非失败的观察（记录，不修）**：
1. dev 日志有一行 `[Screenshot] native helper prewarm failed: Error: spawn ...native\cyrene-screenshot\target\release\cyrene-screenshot.exe ENOENT`
   —— **Rust 原生截图助手未编译**，属环境缺少本地产物，**与本次合并无关**（该路径不在 P7 改动面，也不在 11 项受保护功能内）。
2. `[WechatBot] No credentials, please run /wechat login` / `[StickerEmbedding] Model not found` —— 均为**未配置/未下载模型**的预期提示。

### 子节 7 · 经验追加

| 经验 | 等级 | 归位 | 键号 | 已追加 |
|---|---|---|---|---|
| **`install-scripts` 白名单会静默跳过 `postinstall`**；白名单条目**带版本号**，升级依赖即失配；症状只在 stderr 的几十行 warn 里，而 `npm ci` exit 0 | **L** | [经验库-具体坑 §7](../methodology/BLUEPRINT-经验库-具体坑.md)（§4 TS/构建工具链） | **X10** | ✅ |
| **electron 44 的二进制是"懒下载"而非"postinstall 被拦"**（上游已删 `scripts.postinstall`；`index.js` 在 `require()` 时触发）—— **P7 蓝图 X1 的假定在此版本上不成立** | **L** | [经验库-具体坑 §7](../methodology/BLUEPRINT-经验库-具体坑.md)（§3 Electron/Node） | **E8** | ✅ |
| **`rolldownOptions` 是 vite 8 专属字段，老 vite 静默退回默认**（不报错不警告）→ **必须用产物清单判定，不能用退出码** | **L** | [经验库-具体坑 §7](../methodology/BLUEPRINT-经验库-具体坑.md)（§4 TS/构建工具链） | **X11** | ✅ |
| **"主进程编译干净" ≠ "应用能起来"** —— 渲染层的**配置期**依赖会让 `dev` 在 vite 加载配置时就死；"某层干净"的结论必须写明它没覆盖哪一层 | **M** | [经验库-通用 §6c](../methodology/BLUEPRINT-经验库-通用.md)（§4 架构与实现） | **A44** | ✅ |
| **"取 ours 保住本地功能"的代价可能延迟两个 Phase 才暴露** —— 受害者全在 theirs 侧，且"缺声明"只在**没人跑的那套编译面**上报错；衍生：`TS2339 缺成员`要先确认该成员**还有没有实现**，无 → **删调用而非补声明**；`Promise.all([...])` 实参是同步求值区，`.catch` 兜不住 | **M** | [经验库-通用 §6c](../methodology/BLUEPRINT-经验库-通用.md)（§4 架构与实现） | **A45** | ✅ |

> 📌 蓝图 §九 标为"新坑"的 **3 条**（`install-scripts` 白名单 / `rolldownOptions` / "主进程干净 ≠ 应用能起"）**已全部追加**；
> 另按 §十三 T4 追加了第 4 条（"取 ours 的延迟代价"），并把 X1 拆成 2 条 → **共 5 条**。
> 已同步在 [经验库-全量台账.md](../methodology/BLUEPRINT-经验库-全量台账.md) **附录 E** 登记五元组，并标注 **L 级 `X10`/`X11` 与附录 B 的 `X10`/`X11` 属两套命名空间**（引用时须写全"经验库 §7 X10"）。

---

## 十三、回写清单（**规范 §5.1 的 T1–T4；未勾完不得提交**）

| 触发 | 回写目标 | 回写内容一句话 | 已勾选 |
|---|---|---|---|
| **T2** 基线数值改写 | [`BLUEPRINT-总蓝图.md`](BLUEPRINT-总蓝图.md) §四 P7 行 | 状态 → ✅ 已完成；并记"**顺序变更：`npm ci` 由 P8 提前到 P7**" | [x] |
| **T2** 基线数值改写 | [`BLUEPRINT-总蓝图.md`](BLUEPRINT-总蓝图.md) §九 | 新增「当前基线（**P7 之后**）」：vite 8.3.0 / vitest 5.x / electron 44.x / 三套 tsc = 0；P6 段移入历史基线 | [x] |
| **T3** 描述被推翻 | [`HUMAN-人工验证台账.md`](HUMAN-人工验证台账.md) §一 前言 | 🔴 **删/改**「`npm run dev` 现在就能起来」→ 「**P7 装依赖后可起**」（事实 4 实测 vite 配置加载失败） | [x] **蓝图撰写轮已完成**（台账 §一 `:18-22` 原文已是推翻后的表述） |
| **T2** 时点被改写 | [`HUMAN-人工验证台账.md`](HUMAN-人工验证台账.md) §一 H-02 / H-03 / H-05 / H-13 | 时点由「🟢 现在可做」改为「**P7 后**」 | [x] **蓝图撰写轮已完成**；**P7 本轮再推进为「✅ P7 已完成 → 现在可做」**（3 处；P7 已实测 dev 起得来 → 停留"P7 后"会低估可验性） |
| **T1** 判据被修正 | [`HUMAN-人工验证台账.md`](HUMAN-人工验证台账.md) §三 H-14 第 5-6 步 | 施工后标「**P7 后具备人验条件**」 | [x] §三 H-14 的「前置」已改为「✅ P7 已完成 → 第 5、6 步已具备人验条件」，并附 P7 清掉两个拦路问题的机器判据；§一 H-14 行时点同步改为「🟢 P7 后具备人验条件」 |
| **T3** 描述被推翻 | 本文件 §四 4.6 | 若 `rolldownOptions` 在 vite 8 下的行为与预期不同，就地记录 | [x] **行为与预期一致**（X2 未复现）：6/6 入口全生成 + rolldown 专属提示为旁证 → 已就地记录于 §四 4.6 |
| **T4** 新增经验 | [`../methodology/BLUEPRINT-经验库-具体坑.md`](../methodology/BLUEPRINT-经验库-具体坑.md) | L 级：**npm `install-scripts` 白名单会拦 postinstall**（electron/esbuild） | [x] **§7 / X10**（已按实测修正措辞：白名单**确实**会拦 `postinstall`，但**electron 不属此类**） |
| **T4** 新增经验 | [`../methodology/BLUEPRINT-经验库-具体坑.md`](../methodology/BLUEPRINT-经验库-具体坑.md) | L 级：**`rolldownOptions` 是 vite 8 专属字段，老 vite 静默退回默认** → 用产物清单判定 | [x] **§7 / X11** |
| **T4** 新增经验 | [`../methodology/BLUEPRINT-经验库-通用.md`](../methodology/BLUEPRINT-经验库-通用.md) | M 级：**"主进程依赖干净" ≠ "应用能起来"** —— 渲染层的配置期依赖会让 `dev` 直接死 | [x] **§6c / A44** |
| **T4** 新增经验 | [`../methodology/BLUEPRINT-经验库-通用.md`](../methodology/BLUEPRINT-经验库-通用.md) | M 级：**"取 ours 保住本地功能"的代价可能延迟暴露**（`settings/shared/types.ts` 在 P5 取 ours，5 条错到 P7 才现） | [x] **§6c / A45** |
| **T4** 新增经验（**本轮追加，蓝图未列**） | [`../methodology/BLUEPRINT-经验库-具体坑.md`](../methodology/BLUEPRINT-经验库-具体坑.md) | L 级：**electron 44 的二进制是"懒下载"，不是"postinstall 被拦"** → 蓝图的 X1 假定对 electron 不成立（见 §十二 子节 1 偏差 2） | [x] **§7 / E8**（追加理由：X1 实为**两件不同的事**，合成一条会让后人照抄错误假定） |
| **T2** 基线数值改写 | 本文件 §二 | 三套编译面 / 依赖版本 / 门禁数量的最终值 | [x] 见 **§十二 子节 4 / 子节 5**（开工前实测已与蓝图事实 1/2 逐类吻合，故 §二 正文无需改写；**最终值已写入总蓝图 §九「P7 之后」**） |
| — | — | 本 Phase 无其他触发（执行者须逐条再核对 T1–T4，**无触发时写"无"**） | [x] 已逐条核对 T1–T4，**另有 6 项蓝图未列的发现**，其中 1 项已追加为经验（上一条 E8），其余 5 项登记于 **§十二 子节 2**（漏洞 1–6） |

> 🔴 **本清单已全部勾完。** 但**提交时机仍在 P7 之后**（总蓝图 §四 / §零 0.2 硬约束 1）——
> **P7 只到 `git add` 与索引对齐为止，零 `git commit`**（实测 `HEAD` 仍 = `598dfb75`）。
>
> ⚠️ **P8 提交前必做的两件事**（P7 发现，见 §十二 子节 2 漏洞 5）：
> 1. `git add` P7 改过的 **5 个渲染层/配置文件**（4 个面板文件在索引里装的是**改之前**的版本，状态为 `AM`/`MM`）；
> 2. 确认 `package.json` 的 `allowScripts` 那 2 行（P7 的 X1 处置副作用）**有意进入提交**。
