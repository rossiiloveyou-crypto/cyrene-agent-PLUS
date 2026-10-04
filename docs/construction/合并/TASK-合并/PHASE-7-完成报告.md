# Phase 7 完成报告：边界编译修复与构建链切换（Tier D）

> **状态**：✅ **已完成**（`T1–T7` 全达成；`N1–N7` 全未越界；**零 `git commit`**）
> **执行日期**：2026（单次会话）
> **执行者**：agent（无对话历史，仅凭 [PHASE-7-边界编译修复与构建链切换.md](PHASE-7-边界编译修复与构建链切换.md) + [BLUEPRINT-总蓝图.md](BLUEPRINT-总蓝图.md)）
> **结论**：**三套编译面全部归零**（main 1→**0**、preload 0→**0**、renderer 48→**0**）；**构建链打通**（vite **8.3.0** + `build`/`build:renderer` exit 0 + **6/6 入口 html** + `npm run dev` **真的起得来**）；A9 定向门禁 **13 文件 / 273 tests 全绿**；全量 **31 failed 文件 → 15、9 failed tests → 4**，**①类依赖失败归零**；15 项依赖/工具链全部装齐；11 项受保护功能 **11/11 与 P6 一致**。
> **报告规范**：`../methodology/BLUEPRINT-撰写规范.md` §5（**10 节**）

---

## 一、执行摘要

| # | 验收项 | 结果 |
|---|---|---|
| A1 | 索引对齐（T1） | ✅ 4 文件工作区 ≡ 索引；索引侧 **+679 / −96** |
| A2 | 文档排除（T2 / D6） | ✅ 两路径 `git ls-files` 均 = **0** |
| A3 | 依赖装齐（T3） | ✅ 15 包 + `@types/qrcode` 全就位；**vite 8.3.0 / vitest 5.0.1 / electron 44.4.3 / esbuild 0.28.2** |
| A4 | 渲染层残留清零（T4） | ✅ 面板 / 测试 / 两套 i18n / CSS **全 0 命中** |
| A5 | 三套编译面（T5） | ✅ main **0** / preload **exit 0** / renderer **0** |
| A6 | 构建链（T6） | ✅ vite 8.3.0 + `build:renderer` exit 0 + **6/6 入口 html** + `build` exit 0 + **`dev` 起得来** |
| A7 | 语料豁免边界（A2 命令） | ✅ **22 passed** |
| A8 | 静默失效探测器（A3 命令） | ✅ **4 passed**（且仍在门禁名单） |
| A9 | 定向门禁 | ✅ **13 文件 / 273 tests 全绿**（无需归因） |
| A10 | 全量测试 | ✅ **15 failed 文件 / 4 failed tests**（①类**归零**；②③④类**只减不增**） |

**验收总计**：**10 项主判据 → PASS 10 / FAIL 0**。

**11 项受保护功能基线**：**11/11 与 P6 报告 §四 逐项一致**（4/8/5/11/13/6/10/5/2/10/5）——见 §五 偏差 6（脚本会误报，正文为准）。

**人工环节回执**（规范 §4.1；缺失即不能判定完成）：

- **① H-A 决策答复（原样抄录）**：
  - **H-A4 是否把 `npm ci` 从 P8 提到 P7 起手** = **「提到 P7」**（项目所有者拍板，2026 蓝图撰写轮）。**P7 已执行并证实该判断正确**：不装依赖则 §四 4.6 的 5 条判据**一条都验不了**（实测 `import('@tailwindcss/vite')` = `ERR_MODULE_NOT_FOUND`）。
  - **H-A5 渲染层是"删绑定 UI"还是"补回 3 个 IPC 声明"** = **「删 UI」**（由 D1 直接推出，无需新拍板）。**P7 已按此执行**：删 5 处调用 + 整套绑定 `<section>`，**未补任何声明**。经全仓复核，那 3 个 IPC 在 `preload`/`shared`/`main` 的定义面确为 **0 命中** → 补声明只会得到运行期 `undefined is not a function`。
- **② H-B 每条核对项结论**：**H-B3 ⏳ 待项目所有者逐条 ✅/❌**（4 条期望，数据已备齐，见 §八 第 11 条）；**H-B4 ⏳ 待项目所有者 ✅/❌**（agent 已判"**起得来**"并附日志证据，"**能用**"须人判）。
- **③ H-C 已登记进 HUMAN 台账的编号**：**H-14 第 5-6 步**（时点由「必须等 P8」→「**P7 后具备人验条件**」）；**H-02 / H-03 / H-05** 时点由「P7 装依赖后可做」→「**P7 已完成 → 现在可做**」；**H-13 运行期部分**仍待 P8。**本 Phase 未新增 H-C 欠账。**

---

## 二、最终状态（交接给 P8）

```
HEAD        = 598dfb75  "merge(P3): checkpoint 本地工作（合并前基线）"   ← P4/P5/P6/P7 零提交
MERGE_HEAD  = b11b8851  （官方 master，合并仍在进行中；.git/MERGE_HEAD 仍在 = True）
冲突        = UU = 0 / UD = 0 / DU = 0 / AA = 0
冲突块      = 0（全仓库 src 的 <7/=/ >7 标记均为 0）
索引条目    = 2361（git ls-files -s）
status 行数 = 885（A 410 / M 372 / D 77 / R 10 / ?? 10 / MM 3 / AM 3）【不作判据】
未跟踪      = 46（--untracked-files=all 口径）【不作判据】
Node        = v24.21.0（每条命令前需前置 PATH: D:\data\node24）
npm         = 11.19.0 ; registry = https://registry.npmmirror.com
工具链      = vite 8.3.0 / vitest 5.0.1 / electron 44.4.3 / esbuild 0.28.2
              @vitejs/plugin-react 6.1.1 / tailwindcss 4.3.3 / @tailwindcss/vite 4.3.3 / typescript 5.9.3
electron 二进制 = node_modules/electron/dist/electron.exe 已下载（&electron.exe --version → v44.4.3）
索引          = docs 任务文档已归零（D6 达成）；4 个 P6 代码/测试文件已入库
回退          = phase3-work-snapshot (586eae90) / phase0-full (34f0669f)
                + E:\AI_Chating\cyrene-agent-p7-backup（P7 的 7 文件原始态）
                + .cyrene-merge-analysis/p7/pre-hashes.txt（7 行 blob 哈希）
```

**产出物**：

| # | 文件 | 内容 | 规模 |
|---|---|---|---|
| 1 | `src/renderer/react/features/settings/ChannelsSettingsPanel.tsx` | 删绑定 UI + 镜像开关（D1 渲染层收尾） | 299 → **250 行** |
| 2 | `src/renderer/react/features/settings/ChannelsSettingsMigration.test.ts` | 夹具与断言同步（4 条用例仍全绿） | 143 → **138 行** |
| 3 | `src/renderer/react/i18n/{zh-CN,en}.json` | 各删 **18** 个 key（11 必删 + 7 按判据判定） | 各 2177 → **2159 行**；channels 下 74 → **56** key，两套一致 |
| 4 | `src/renderer/react/features/settings/ChannelsSettingsPanel.css` | 删 `.cy-channels-context*` / `.cy-channels-binding*` 死规则 8 处 | 140 → **106 行** |
| 5 | `package.json` | `allowScripts`：`esbuild@0.21.5` → `esbuild@0.28.2`（X1 处置副作用） | **2 行 diff**（**计划外，已单列**） |
| 6 | `.cyrene-merge-analysis/p7/pre-hashes.txt` | 7 个文件改动前 blob 哈希 | **7 行** |
| 7 | `E:\AI_Chating\cyrene-agent-p7-backup` | 7 文件原始态备份（回退级 1） | **7 文件** |
| 8 | `.cyrene-merge-analysis/p7/full-test.log` | 全量测试原始日志（6557 行） | 新增 |
| 9 | `dist/renderer/**` | 构建产物：**6 个入口 html** + 469 个 assets | 由 4.6 生成 |
| 10 | `BLUEPRINT-总蓝图.md` 回写 | §四 P7 行 + 顺序变更说明、§九 新增「P7 之后」基线 | 3 处 |
| 11 | `HUMAN-人工验证台账.md` 回写 | §一 前言/H-14 行/H-02·H-03·H-05 时点、§三 H-14 前置与证据 | 5 处 |
| 12 | `经验库-具体坑.md` / `经验库-通用.md` / `经验库-全量台账.md` | 新增 **X10 / E8 / X11 / A44 / A45** 共 **5** 条 + 全量台账附录 E | 3 文件 |
| 13 | `PHASE-7-边界编译修复与构建链切换.md` | §四 4.1/4.3/4.6 就地修正 + §十 交接追加 6 条 + §十一/§十二/§十三 全闭合 | 本 Phase 蓝图 |

---

## 三、执行过程（实际敲的命令与实测输出）

### 3.1 前置条件（P1–P8 逐条实测）

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$env:PATH = "D:\data\node24;" + $env:PATH
cd E:\AI_Chating\cyrene-agent
git rev-parse --short HEAD          # 598dfb75  ✅
git rev-parse --short MERGE_HEAD    # b11b8851  ✅
(git status --porcelain | Where-Object { $_.Substring(0,2) -match '^(UU|UD|DU|AA)$' } | Measure-Object).Count   # 0  ✅
(Get-ChildItem -Recurse -Include *.ts,*.tsx,*.json,*.css -Path src | Select-String -Pattern '^<{7} |^>{7} ' | Measure-Object).Count   # 0  ✅
Test-Path E:\AI_Chating\cyrene-agent-p6-backup      # True  ✅
git rev-parse --short phase3-work-snapshot          # 586eae90  ✅
Test-Path .cyrene-merge-analysis\p6\pre-hashes.txt  # True  ✅
node -v ; npm -v                    # v24.21.0 / 11.19.0  ✅
npm ci --dry-run --no-audit --no-fund   # exit 0  ✅（"added 410 / removed 62 / changed 78"）
Get-PSDrive E | Select-Object Used,Free # Free = 269,740,556,288（≈251 GB）✅
Test-Path .cyrene-merge-analysis/protected-features-baseline.json   # True  ✅
```

> ✅ **P1–P8 全绿，开工。** 另记录一条环境事实（本次实测，供后续 Phase 直接引用）：
> **本会话跑的是真正的 PowerShell 5.1 Desktop**（`$PSVersionTable.PSVersion` = `5.1.26100.8875`，
> `Get-Command pwsh` **无输出**）→ 总蓝图 §九「环境三坑」的第三条**完全成立**：无 `&&`、括号内不能用 `;`、
> `Set-Content -Encoding UTF8` 写 BOM。本报告所有脚本均按此约束书写。

### 3.2 §四 4.0 备份与哈希锚点

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
# 实测：7 行
# 1d1ecab3907b4975fba48d27871161b797ec63f6   (ChannelsSettingsPanel.tsx)
# a51124e614a3a1181b279bbfc4cb397ddd737550   (ChannelsSettingsMigration.test.ts)
# c0c33e400fcce85375905005e8badfef105d26d2   (zh-CN.json)
# 451480ebc0b5c8451f837501c1dee676549e64f8   (en.json)
# d44d52acaf1f9c1274d2142a8795153c794fdab4   (ChannelsSettingsPanel.css)
# d487c9bc6374b9862f8ff57f72903ed645388de8   (package.json)
# 05dcca095d978cb2ade4d03166885ca13a2b1b11   (package-lock.json)
# 备份目录：7 文件全部就位 ✅
```

### 3.3 §四 4.1 索引对齐（T1）

```powershell
git add -- src/main/channels/dispatcher.ts src/main/channels/channel-context.ts `
           src/main/orchestrator/build-options.ts `
           src/main/orchestrator/conversation-transcript-phase2.acceptance.test.ts
# add exit=0

# 判据 ①（蓝图原文）：diff --name-status 里不再有那 4 个文件
git diff --ignore-cr-at-eol --name-status
# 实测：只剩台账 M 行 + 13 个 docs/merge-plan 的 D 行（4 个代码文件已消失）✅

# 判据 ②（蓝图原文，期望无输出）：
git diff --cached --ignore-cr-at-eol --stat -- src/main/channels/dispatcher.ts
# 实测：src/main/channels/dispatcher.ts | 313 ++++---  (255 insertions, 58 deletions)  ❌ 与蓝图期望不符

# 🔴 判据 ② 写反了方向（见 §五 偏差 1）。改用两个方向分别取证：
foreach ($f in 'src/main/channels/dispatcher.ts','src/main/channels/channel-context.ts',
               'src/main/orchestrator/build-options.ts',
               'src/main/orchestrator/conversation-transcript-phase2.acceptance.test.ts') {
  git diff --ignore-cr-at-eol --stat -- $f        # 方向 A：工作区 vs 索引 → 4 个全部无输出 ✅
}
git diff --cached --ignore-cr-at-eol --stat -- <同 4 文件>
# 方向 B：索引 vs HEAD → 679 insertions / 96 deletions ✅（修正真的进了索引）
```

### 3.4 §四 4.2 文档排除（T2 / D6）

```powershell
git rm -r --cached --quiet docs/merge-plan          # rm exit=0
git reset -q -- "docs/construction/合并"            # reset exit=0

# 判据
git ls-files docs/merge-plan                        # 0 行 ✅
git ls-files "docs/construction/合并"                # 0 行 ✅
Test-Path docs/construction/合并/TASK-合并/PHASE-6-完成报告.md   # True ✅（磁盘没动）
git status --porcelain -- docs | ForEach-Object { $_.Substring(0,2) } | Group-Object
# 实测：M x1 / A x35 / D x13 / ?? x2   ← 与蓝图的「D x13 + ?? x22」不同，见 §五 偏差 4
```

> 🔴 **一处必须澄清的"惊魂"**：`git status --porcelain -- docs` 出现 **`A x35`**，看似"文档被加进索引了"。
> 逐条核对后确认：那 35 个是 `docs/design/**`(18) / `docs/internal-issue/**`(8) / `docs/superpowers/**`(6) / `docs/refactor/**`(2)，
> **全部是 P3 期就已暂存的官方新增文档**，与 D6 的两条路径**无交集**，P7 的两条命令**在路径前缀上不可能碰到它们**。
> 另有两次**假阳性**需记录（`K10` 的两次实战复现）：
> - `git ls-files | Select-String 'construction'` 报了 21 行 —— 实为**子串匹配**命中了 `…-construction-plan.md` 等**文件名含该词**的无关文件，**不是** `docs/construction/**` 残留；
> - 精确定位后：`git ls-files | Select-String 'merge-plan'` = **0 行**（确证 T2 达成）。

### 3.5 §四 4.3 依赖装齐（T3）★ 本 Phase 起手动作

```powershell
# 装前锚点
git hash-object -- package-lock.json      # 05dcca095d978cb2ade4d03166885ca13a2b1b11
git hash-object -- package.json           # d487c9bc6374b9862f8ff57f72903ed645388de8
node -e "const p=require('./package.json'); console.log(JSON.stringify(p.allowScripts))"
# {"protobufjs@7.6.4":true,"protobufjs@6.11.6":true,"electron@43.1.0":true,
#  "esbuild@0.21.5":true,"sharp@0.32.6":true,"tree-sitter@0.22.4":true}
#  ← X1 陷阱成立：白名单记的是 electron@43.1.0 / esbuild@0.21.5，而即将装的是 44.4.3 / 0.28.2

# ① 装（后台作业跑，实测 2.74 分钟）
npm ci --no-audit --no-fund
# exit=0   added 1623 packages in 3m
# stderr 里唯一相关的两行：
#   npm warn install-scripts electron-winstaller@5.4.0 (install: node ./script/select-7z-arch.js)
#   npm warn install-scripts esbuild@0.28.2 (postinstall: node install.js)
#   ⚠️ electron 根本不在列表里 ← 见 §五 偏差 2

# ② X1 处置（实测版）
npm install-scripts ls
# 2 packages have install scripts not yet covered by allowScripts:
#   electron-winstaller@5.4.0 (install: node ./script/select-7z-arch.js)
#   esbuild@0.28.2 (postinstall: node install.js)
npm install-scripts approve esbuild
# Approved esbuild: removed-stale esbuild@0.21.5 / added esbuild@0.28.2
node -e "require('electron')"        # → "Downloading Electron binary..." + 返回 dist/electron.exe 路径
& node_modules\electron\dist\electron.exe --version    # → v44.4.3
npm install-scripts ls               # 剩 1 项：仅 electron-winstaller@5.4.0（有意不 approve）

# ③ 判据
$pkgs = @('simple-icons','radix-ui','@lobehub/icons','@lobehub/ui','motion','@dnd-kit/core',
          '@dnd-kit/sortable','@dnd-kit/utilities','streamdown','@streamdown/math',
          'react-resizable-panels','react-day-picker','date-fns','ansi-to-react',
          '@modelcontextprotocol/server-filesystem')
$pkgs | ForEach-Object { "{0,-42} {1}" -f $_, (Test-Path (Join-Path 'node_modules' $_)) }
# → 15 个全部 True ✅   未就位包数 = 0
Test-Path node_modules\@types\qrcode                        # True ✅
npx vite --version                                          # vite/8.3.0 win32-x64 node-v24.21.0 ✅
node -e "require('./node_modules/vitest/package.json').version"     # 5.0.1 ✅
node -e "require('./node_modules/electron/package.json').version"   # 44.4.3 ✅
node -e "require('./node_modules/esbuild/package.json').version"    # 0.28.2 ✅
node -e "require('./node_modules/@vitejs/plugin-react/package.json').version"  # 6.1.1 ✅
node -e "require('./node_modules/tailwindcss/package.json').version"          # 4.3.3 ✅
node -e "require('./node_modules/@tailwindcss/vite/package.json').version"    # 4.3.3 ✅
node -e "require('./node_modules/typescript/package.json').version"           # 5.9.3 ✅
Test-Path node_modules\electron\dist\electron.exe           # True ✅（X1 核心判据）
Test-Path node_modules\electron\path.txt                    # True ✅（内容：electron.exe）
node -e "import('@tailwindcss/vite').then(()=>console.log('OK')).catch(e=>console.log('FAIL '+e.code))"
# → OK ✅（事实 4 的 FAIL ERR_MODULE_NOT_FOUND 被解除）

# 锚点复验
git hash-object -- package-lock.json      # 05dcca095d978cb2ade4d03166885ca13a2b1b11  ← 未变 ✅（S1 未触发）
git hash-object -- package.json           # 06b2b5f994b5e0da235ea08e272dac9a139330a5  ← 已变 ⚠️（见偏差 3）
git diff -- package.json
# -    "esbuild@0.21.5": true,
# +    "esbuild@0.28.2": true
```

### 3.6 §四 4.4 D1 渲染层残留清理（T4）

**4.4.1 面板**（`ChannelsSettingsPanel.tsx`，按蓝图事实 6 行表逐条改，**动手前先重扫复核**）：

```powershell
# 复核蓝图行号（J-13：不要把蓝图行号当坐标直接采信）—— 实测逐条吻合
#   :3  import 含 Link2/Trash2      :19 ContextSnapshot      :26 mirrorToDesktop: true,
#   :78-80 context/sourceSession/targetConversation          :100-104 refreshContext
#   :112-129 挂载 useEffect（Promise.all 4 项 / 解构 4 个）    :166-175 bindContext
#   :177-186 unbindContext          :249-263 整个「上下文绑定」<section>   :281 mirrorDesktop 行
# 编辑后判据：
$f='src/renderer/react/features/settings/ChannelsSettingsPanel.tsx'
Select-String -LiteralPath $f -Pattern 'channelsContext|mirrorToDesktop|ContextSnapshot|sourceSession|targetConversation|Link2|Trash2' -Encoding UTF8
# → 0 命中 ✅
Select-String -LiteralPath $f -Pattern 'channelsGetConfig|channelsSaveConfig|channelsGetStatus|channelsLogGet|channelsRestart' -Encoding UTF8 | Measure-Object
# → Count = 8 ✅（期望 ≥6，其余功能完好）
# 行数：299 → 250
```

**4.4.2 测试**（`ChannelsSettingsMigration.test.ts`）：

```powershell
$f='src/renderer/react/features/settings/ChannelsSettingsMigration.test.ts'
Select-String -LiteralPath $f -Pattern 'channelsContext|mirrorToDesktop' -Encoding UTF8    # → 0 命中 ✅
foreach ($p in 'aria-expanded','你好','微信','cy-channels-global-select') { ... }          # → 1 / 3 / 2 / 1 ✅（保留的断言都在）
(Select-String -LiteralPath $f -Pattern '\bit\(' | Measure-Object).Count                  # → 4 ✅
# 行数：143 → 138
```

**4.4.3 i18n**（两套都改；**7 个待决 key 的判定过程**）：

```powershell
# 先判 7 个 key 的引用数（K10：计数不可靠，逐条回读原文行号复核）
foreach ($k in 'externalChat','desktopConversation','noRecentChats','noConversations',
               'untitledConversation','groupChat','privateChat') {
  (Get-ChildItem -Recurse -Include *.tsx,*.ts -Path src/renderer | Select-String -Pattern ("channels\." + $k) | Measure-Object).Count
}
# 实测：7 个 key 的引用数各 = 1，且全部落在 ChannelsSettingsPanel.tsx:253 / :254
#       —— 正是被删的那段 JSX 内 → 全部可删
# 另核非渲染层引用：src/main + src/shared + src/preload 对 7 个 key = 各 0 ✅
# 两套 i18n 里这 7 个 key 定义在 :1033-1039（连续），11 个必删 key 在 :1031-1047
#   → 一次删 :1031-1047 整段（17 个 key），再单独删 :1058 的 mirrorDesktop → 共 18 个

# 判据
# ① 逐 key 检查（初版用 '"bind"\s*:' 会因**子串**误报 saveAndConnect/testConnection → K10 第三次复现）
Select-String -LiteralPath $f -Pattern ('^\s*"(' + ($keys -join '|') + ')"\s*:') -Encoding UTF8
# 实测报出 3 条"残留"：:1588 "bind" / :1590 "unbind" / :1918 "contextDescription"
#   → 逐条回读路径确认：settingsPage.memory.vault.bind / .unbind / settingsPage.preferences.contextDescription
#   → **不同命名空间下的合法 key，不是残留** ✅
# ② 权威判据：key 集合逐一比对
node -e "const a=require('./src/renderer/react/i18n/zh-CN.json').settingsPage.channels,
         b=require('./src/renderer/react/i18n/en.json').settingsPage.channels;
         const bad=['contextTitle','contextDescription','externalChat','desktopConversation','noRecentChats',
                    'noConversations','untitledConversation','groupChat','privateChat','bind','unbind',
                    'noBindings','selectBoth','bindFailed','bound','unbindFailed','unbound','mirrorDesktop'];
         console.log('残留:',JSON.stringify(bad.filter(k=>k in a||k in b)),'zh',Object.keys(a).length,'en',Object.keys(b).length)"
# → 残留: []   zh keys 56   en keys 56 ✅（两套一一对应）
node -e "for (const f of ['src/renderer/react/i18n/zh-CN.json','src/renderer/react/i18n/en.json']) JSON.parse(require('fs').readFileSync(f,'utf8')); console.log('JSON OK')"
# → JSON OK ✅
```

**4.4.4 CSS**（蓝图标"可选"，**实做**）：

```powershell
Select-String -LiteralPath src/renderer/react/features/settings/ChannelsSettingsPanel.css -Pattern 'cy-channels-context|cy-channels-binding' -Encoding UTF8
# 删前：9 处（:1 :9 :19 :21 :26 :37 :41 :131 …）
# 删后：0 命中 ✅
# 存活选择器复核：cy-channels-field 6 / cy-channels-grid 2 / cy-channels-logs 9 /
#                 cy-channels-global-select 3 / cy-settings-row 2  ✅
# 行数：140 → 106
```

> ⚠️ **删除时避开两个共享选择器**（否则会连带删掉活规则）：
> ① `:9` 是 `.cy-channels-context__form label, .cy-channels-field { … }` **组合选择器** → 删前缀后**保留** `.cy-channels-field {...}`；
> ② `:131` 在 `@media (max-width: 760px)` 块内，与活规则同行 → 只删死规则那一行，**保留整块**。

### 3.7 §四 4.5 三套编译面收口（T5）

```powershell
npx tsc -p tsconfig.main.json | Select-String 'error TS' | Measure-Object | Select-Object -Expand Count      # 0 ✅
npx tsc -p tsconfig.preload.json ; "preload exit=$LASTEXITCODE"                                              # exit 0 ✅
npx tsc -p tsconfig.renderer.json | Select-String 'error TS' | Measure-Object | Select-Object -Expand Count  # 0 ✅
```

**开工前 → 完工后**：

```powershell
# 开工前（实测，与蓝图事实 1 逐类吻合）
npx tsc -p tsconfig.main.json      # 1 条：create-aux-windows.ts(36,55) TS2694 WindowStatePersistence
npx tsc -p tsconfig.preload.json   # exit 0
npx tsc -p tsconfig.renderer.json  # 48 条 = TS2307 x29 + TS7006 x12 + TS2339 x5 + TS7016 x1 + TS7031 x1
# 完工后：0 / 0 / 0
```

> **主进程那条未改任何代码** —— 随 electron 43.1.0 → 44.4.3 自动消失。**蓝图事实 1/2 的根因判断完全正确。**

### 3.8 §四 4.6 构建链验证（T6）

```powershell
npx vite --version
# vite/8.3.0 win32-x64 node-v24.21.0 ✅（≥8，X2 前提不成立）
# 6 个源入口全部存在：src/renderer/{index.html, sticker-manager/, call-react/, react/, music/, toast/} ✅

npm run build:renderer ; "renderer exit=$LASTEXITCODE"
# ✓ built in 5.25s   exit=0 ✅
Get-ChildItem dist/renderer -Recurse -Filter index.html | ForEach-Object { $_.FullName.Replace($PWD.Path+'\','') }
# dist\renderer\index.html
# dist\renderer\call-react\index.html
# dist\renderer\music\index.html
# dist\renderer\react\index.html
# dist\renderer\sticker-manager\index.html
# dist\renderer\toast\index.html
# → 6/6 ✅（X2 产物判据通过；缺失数 = 0）

npm run build ; "full exit=$LASTEXITCODE"      # built in 4.34s，exit=0 ✅（main+preload+cli+renderer）
```

**X2 的旁证**（证明 rolldownOptions 真的被识别，不是"退出码 0 但配置被忽略"）：

```
[plugin builtin:vite-reporter]
(!) Some chunks are larger than 500 kB after minification.
    - Use build.rolldownOptions.output.codeSplitting to improve chunking:
      https://rolldown.rs/reference/OutputOptions.codeSplitting
```

> vite 自己按 **rolldown**（而非 `RollupOptions`）的 API 提示 → `rolldownOptions` **确实生效**。

**`npm run dev` 冒烟**（后台作业起，不阻塞）：

```
[0] VITE v8.3.0  ready in 334 ms
[0] ➜  Local:   http://localhost:5173/
[1] （electron 44 启动横幅）
[1] [StartupTiming] core/initSkills 102ms (at 3245ms)
[1] [StartupTiming] core/chat-load 8124ms (at 11912ms)
[1] [StartupTiming] core/windows-revealed (at 14133ms)
[1] [StartupTiming] core/startCore-total 14133ms
[1] [MCP Adapter] MCP server 就绪: Playwright 浏览器 (24 个工具)
[1] [Reranker] standard mode ready: bge-reranker-base
```

> ✅ **判据达成**："vite 打印 ready 且 10 秒内无致命错误" —— **且远超判据**（窗口已 reveal、core 启动完整走完）。
> 📌 **这是对蓝图事实 4 的完整反证**：修之前 `vite` 在**加载配置**这一步就死。

### 3.9 §四 4.7 门禁重跑（T7）

```powershell
# A2 语料豁免
npx vitest run src/main/memory/memory-deletion.test.ts src/main/corpus/group-corpus-isolation.test.ts
# ✓ memory-deletion.test.ts (15 tests)   ✓ group-corpus-isolation.test.ts (7 tests)
# Test Files 2 passed (2)   Tests 22 passed (22) ✅

# A3 静默失效探测器
npx vitest run src/main/channels/group-context-flow.test.ts
# ✓ (4 tests)   Test Files 1 passed (1)   Tests 4 passed (4) ✅

# A9 定向门禁（13 文件）
npx vitest run <13 文件，见蓝图 §四 4.7>
# Test Files 13 passed (13)   Tests 273 passed (273) ✅

# A10 全量
npm test
# test exit=1
# Test Files  15 failed | 558 passed (573)
# Tests       4 failed | 5403 passed | 1 skipped (5408)
# Duration    65.36s
```

**15 个失败文件的逐条归因**（§六 6.2 要求"每条落到四类之一并写出证据"）：

| 类 | 文件数 | 原样错误 | 是否 P7 造成 |
|---|---|---|---|
| **①** 依赖未装 | **0** | — | ✅ **归零**（§6.2 要求"①类不再豁免"，实测确为 0） |
| **②** 失去被测对象 | **13** | ① **11 个**报 `Error: ENOENT: no such file or directory, open 'E:\AI_Chating\cyrene-agent\src\renderer\settings\index.html'`（P4 删除的宿主）：`settings/dom-refs-consistency`、`settings/keywords-markup`、`settings/memory-manager-markup`、`settings/panel-migration-markup`、`settings/zones-markup`、`settings/channels/panel`、`settings/memory/{erasure-flow,manager,panel}`、`settings/zones/panel`、`react/.../api-config/api-config-source`；② **1 个**报 `Error: Failed to resolve import "../i18n" from "src/renderer/settings/memory/delete-all.ts"`（同一条删除线）；③ **1 个** `panel-layout.test.ts` 报 `ENOENT … ModelModePanel.css`（**另一条删除线**，J-08/J-09 已定义：4 passed / 2 failed） | ❌ 全部**非** P7（P4 删除的数学后果） |
| **③** 存量违规 | **1** | `theme-token-contract.test.ts`：`AssertionError: features\chat\components\ToolConsolePanel.css should use shared role variables for colors` | ❌ 非 P7（P8 处置） |
| **④** 与合并无关的存量失败 | **1** | `default-dialogs-regression.test.ts`：`AssertionError: expected [ Array(1) ] to deeply equal []`（`ToolConsolePanel.tsx:285` 的 `window.confirm`，三版本逐字节相同） | ❌ 非 P7（P8 处置） |
| | **15** | | **无一归因到 P7** |

**`Tests 4 failed` 的逐条对应**（15 个失败文件里只有 3 个有**可执行**的用例，其余 12 个是 suite 级加载失败 → 0 test）：

| 失败文件 | 该文件 tests | 失败 tests | 所属类 |
|---|---|---|---|
| `panel-layout.test.ts` | 6 | **2**（`面板本身是滚动容器` / `模型网格保持自然高度，不参与 flex`） | ②（J-08/J-09 已定义：**3 条"顶栏不重叠"守卫必须绿**，实测绿） |
| `theme-token-contract.test.ts` | 7 | **1**（`共享颜色使用角色令牌…`） | ③ |
| `default-dialogs-regression.test.ts` | 2 | **1**（`uses no browser alert or confirm…`） | ④ |
| **合计** | | **4** | ✅ 与 `Tests 4 failed` 吻合 |

**①类归零的直接证据**：P6 报告列出的 ①类失败文件（`VoiceCallPreviewDialog` / `AgentSettingsMigration` / `AsrSettingsMigration` / **`ChannelsSettingsMigration`** / `McpSettingsPanel.config` / `ModelSettingsPanel.models` / `ToolSettingsPanel.music` / `UserAvatar` / `ChatMessageList*` / `CommandTerminal` / `api-config-source` / `StreamdownMessageContent*` / `packages/plugin-sdk …index.test.ts`）**已全部不在失败名单**；且 `ChannelsSettingsMigration.test.ts` 由"①类失败"变为 **4 tests 全绿**。

> ⚠️ `api-config-source.test.ts` **仍在失败名单**，但**根因已从①类变为②类**（错误信息由"缺模块"变为 `ENOENT settings/index.html`）——这正是"装齐依赖后暴露出的真实死因"，**不是**装坏了。

---

## 四、验收测试逐项结果

| # | 验收项 | 期望 | 实测 | 判定 |
|---|---|---|---|---|
| **A1** | 索引对齐 | 不再含那 4 个代码/测试文件 | `git diff --name-status` 只剩台账 + 13 个 docs D 行；方向 A 全无输出、方向 B = +679/−96 | ✅ |
| **A2** | 文档排除 | 两条 `ls-files` 均 0 | **0 / 0**；磁盘 PHASE-6 报告 `Test-Path` = True | ✅ |
| **A3** | 依赖装齐 | 15 包 True + 版本对账 | 15/15 True；vite 8.3.0 / vitest 5.0.1 / electron 44.4.3 / esbuild 0.28.2 / plugin-react 6.1.1 / tailwindcss 4.3.3 / @tailwindcss/vite 4.3.3 / typescript 5.9.3；`electron.exe` True | ✅ |
| **A4** | 渲染层残留清零 | 全 0 命中 | 面板 0 / 测试 0 / i18n 残留 `[]` / CSS 0 | ✅ |
| **A5** | 三套编译面 | main 0 / preload exit 0 / renderer 0 | **0 / exit 0 / 0** | ✅ |
| **A6** | 构建链 | vite 8.3.0 + 2 个 build exit 0 + 6 入口 html | 全达成 + `dev` 起得来（ready 334ms、windows-revealed） | ✅ |
| **A7** | 语料豁免边界 | 22 passed | **22 passed**（15 + 7） | ✅ |
| **A8** | 静默失效探测器 | 4 passed | **4 passed** | ✅ |
| **A9** | 定向门禁 | 13 文件全绿 / 273 tests | **13 passed / 273 passed** | ✅ |
| **A10** | 全量测试 | ①类归零；②③④类不增加 | 15 failed / 4 failed tests（P6：31 / 9）；①类 = 0 | ✅ |

**维护性检查（§五 5.2 / §六 6.3）**：

| 项 | 期望（agent 预先算出） | 实测 | 判定 |
|---|---|---|---|
| 11 项受保护功能 | 与 P6 报告 §四 的 11/11 一致（4/8/5/11/13/6/10/5/2/10/5） | **完全一致**（脚本原始输出对 2 项报"退化"，见偏差 6） | ✅ |
| H-B3（设置→渠道页 4 条） | ① 正常渲染 ② 找不到「上下文绑定」③ 找不到镜像开关 ④ 仍能看见 4 个区块 | ⏳ **待人判**（agent 只交出机器侧判据，见 §八 第 11 条） | ⏳ |
| H-B4（dev 起来的应用） | 窗口正常、可交互、无白屏 | ⏳ **待人判**；agent 已判"**起得来**" | ⏳ |

---

## 五、关键偏差与判定修正（**给后续 Phase 必读**）★

### 偏差 1 · 🔴 **蓝图 §四 4.1 的第二条判据写反了方向**（判据缺陷，非执行错误）

- **现象**：`git diff --cached --ignore-cr-at-eol --stat -- src/main/channels/dispatcher.ts` 蓝图**期望无输出**，实测输出 `255 insertions / 58 deletions`。
- **根因（实测）**：`--cached` 比较的是「**索引 vs HEAD**」，`git add` 之后它**必然非空**（HEAD 里是 P3 签入前的旧版）。蓝图想验的是"工作区 = 索引"，那不该加 `--cached`。
- **判定**：**判据写错，执行正确**。已用两条命令分方向取证：`git diff --stat`（工作区 vs 索引）= **空** ✅；`git diff --cached --stat` = **+679/−96** ✅。
- **影响（🔴 危害不小）**：若执行者照字面把输出当失败，会得出"4.1 没做成"的错误结论，进而**可能去 revert 那次 `git add`** —— **那才会真正破坏 T1**（4 个文件的索引重回收工前状态）。
- **处置**：§四 4.1 判据**已就地修正**（两个方向分别写清期望值）；建议登记进判据台账。

### 偏差 2 · 🔴 **蓝图的 X1 假定对 electron 不成立**（描述被实测推翻）

- **现象**：蓝图说"electron 的 postinstall 被 `install-scripts` 白名单拦掉 → `dist/` 没下载"。实测 `npm install-scripts ls` **只在未覆盖列表里报了 `esbuild@0.28.2` 与 `electron-winstaller@5.4.0`，根本没有 electron**。
- **根因（实测，非推断）**：**electron@44 上游已删除 `scripts.postinstall`** —— `node_modules/electron/package.json` 的 `scripts` 字段为 **`undefined`**；二进制改由 `bin: {"install-electron":"install.js"}` + `index.js` 在**被 `require()` 时懒下载**：
  ```js
  const pathFile = path.join(__dirname, 'path.txt');
  function getElectronPath() {
    if (fs.existsSync(pathFile)) { executablePath = fs.readFileSync(pathFile, 'utf-8'); }
    ...
    if (!fs.existsSync(fullPath)) { downloadElectron(); }   // spawnSync(install.js)
  }
  module.exports = getElectronPath();
  ```
  它**既没被白名单拦、也没被跳过**，只是"没人 require 过它"。
- **判定**：**蓝图描述被推翻**。蓝图的"症状"（`electron.exe` 缺失）是对的，**"根因"是错的**。
- **处置**：**未执行蓝图写的 `npm rebuild electron esbuild`**（不需要）；改用 `node -e "require('electron')"` 触发懒下载，实测成功。**未 approve electron**（它没有 postinstall 可批）。**未去改 `allowScripts` 里 `electron@43.1.0` 的条目**（那是无关动作 —— 若照"补 44 条目"的直觉去改，会得到一个既无用又让人误以为已修好的状态）。§四 4.3 已就地修正。**已追加为经验库 §7 / E8（L 级）**。
- **附带发现**：`esbuild` 的 `@esbuild/win32-x64/esbuild.exe` 本就随 **optional 依赖**（`@esbuild/win32-x64`）就位，**`rebuild` 同样非必需**。

### 偏差 3 · ⚠️ **`package.json` 被改了 2 行（计划外改动，已单列）**

- **现象**：`git hash-object -- package.json` 由 `d487c9bc…` 变为 `06b2b5f9…`；`git diff` 显示 `esbuild@0.21.5` → `esbuild@0.28.2`。
- **根因**：`npm install-scripts approve esbuild` 的**副作用** —— 它会自动把白名单里该包的**旧版本条目替换为新版本**。
- **判定**：属蓝图 §七 交付物第 8 条预留的情形（"仅 X1 触发时 `package.json` 的 `allowScripts`，**必须单列**"）→ **已单列**。
- **影响**：这是 P7 **唯一**被改动的已跟踪配置文件；`package-lock.json` **未变**（`05dcca09…` 前后一致）→ **S1 未触发、N7 未越界**。
- **给 P8**：提交前确认这 2 行**有意进入提交**；**不要**顺手把 `electron@43.1.0` 改成 44（见偏差 2）。

### 偏差 4 · ⚠️ **D6 的 status 期望值不准，且暴露 D6 的一处措辞歧义**

- **现象**：蓝图 §四 4.2 期望 `-- docs` 的分组为 `D x13 + ?? x22`；实测 **`M x1 / A x35 / D x13 / ?? x2`**（`??` 折叠口径）。
- **根因（两条，都已实测确认）**：
  1. **`??` 行数会随 `--untracked-files` 口径变化**：默认按目录折叠 → `docs/construction/合并/` 只算 **1** 行；`--untracked-files=all` → **31** 行。**两者都不是 22**，因为该目录下还混着 `docs/construction/蓝图体系结构对比.md` 等**不属于任务文档**的文件。
  2. **`A x35` 是 P3 期就已暂存的官方新增文档**：`docs/design/**`(18) / `docs/internal-issue/**`(8) / `docs/superpowers/**`(6) / `docs/refactor/**`(2)。与 D6 的两条路径**无交集**，P7 的两条命令**在路径前缀上不可能碰到它们**（已用前缀判断复核）。
- **判定**：**T2 达成**（判据只认 `git ls-files <dir>` = 0，两条均为 **0** ✅）。`??` 行数**本就不该作判据**（总蓝图 P5 基线段自己标注过「status 行数不作判据」）。
- **🔴 留给 P8 的歧义**：D6 的字面定义是"**本任务的**文档"（两条路径）。若项目所有者的意图是"**任何文档都不进合并提交**"，则这 35 个需另行拍板。

### 偏差 5 · ⚠️ **P7 改的 4 个面板文件在索引里装的是"改之前"的版本**

- **现象**：`git status --porcelain` 对这 4 个文件报 **`AM`（3 个）/ `MM`（1 个）**，而非 ` M`。
- **根因（实测）**：其中 3 个（`ChannelsSettingsPanel.tsx`、`.test.ts`、`.css`）是**官方新增文件** —— `git cat-file -e HEAD:<f>` 为 **False**（HEAD 中不存在），而 `MERGE_HEAD:<f>` 为 **True**，**P3 已把它们暂存**。索引里的 blob 恰为 P7 的 **pre-hash**（`1d1ecab3…` / `a51124e6…` / `d44d52ac…`）→ **证明索引装的是 P7 之前的版本**。
- **判定**：**不构成 T1 失败**（§四 4.1 只要求对齐那 4 个 P6 文件；§七 交付物也未把这几个列为索引对齐对象 → 属 P8 的"提交"动作）。
- **🔴 影响（必须交接）**：**若 P8 直接 `git commit`，这 5 个文件会提交"改之前"的版本 → 渲染层 5 条 `TS2339` 复活、渠道页重新变成"必崩"状态。**
- **处置**：已写入 §十 交接第 6 条 + 总蓝图 §九「P7 之后」基线的"P7 遗留给 P8"。

### 偏差 6 · ⚠️ **§六 6.3 的保护功能基线脚本会误报**（脚本判据与同节正文互相矛盾）

- **现象**：A1 脚本对 **`群上下文上限` 报 `✘ 退化!`**（基线 11 → 实测 10）；对 `buildGroupContextBlock` 报 5（基线 4）；对 `confirmValue` 报 5（基线 4）。
- **根因（实测）**：脚本读 `.cyrene-merge-analysis/protected-features-baseline.json` —— **Phase 0 生成，此后从未更新**（`git status` 显示其未跟踪、内容仍是 P0 的原始 11 项）。而 **P4 已如实记录**两项**预期退化**，P5 已重建 `USAGE_BADGE`。**蓝图 §6.3 自己的正文写着"期望与 P6 报告 §四 的 11/11 一致（…`groupContextLimit` 10）"** —— 即：**脚本判据与同节正文互相矛盾，正文才是对的**。
- **判定**：**P7 未造成任何退化**。以「P6 报告 §四 的 11/11」为判据，P7 实测 **11/11 逐项吻合**（4/8/5/11/13/6/10/5/2/10/5）。
- **处置**：**未修脚本、未改基线文件**（改基线会污染历史锚点）。已登记为 P8 收尾项：**该基线文件应升级为"带 Phase 修订记录"的形态，或让脚本接受一份 post-P4/P5 的修正表。**

### 判定修正汇总（供判据台账登记）

| 编号 | 旧判据 | 新判据 | 依据 |
|---|---|---|---|
| **（待登记）** | §四 4.1："`git diff --cached --stat -- <file>` 期望无输出（工作区 = 索引）" | **"工作区 vs 索引"用 `git diff --stat`（期望无输出）；"索引 vs HEAD"用 `git diff --cached --stat`（期望非空）"** | P7 实测：`--cached` 比的是索引 vs HEAD，`git add` 后必然非空 |
| **（待登记）** | §六 6.3："A1 脚本对基线文件逐项比对，任何 `✘ 退化` 都要查明" | **判据改为与「上一個 Phase 报告的实测 11 项」比对**；对基线文件本身的比对结果，凡能归因到"该 Phase 主动删除的文件"即豁免（**即 J-02 的适用面扩大到 §6.3**） | P7 实测：脚本对 2 项误报，而 P4/P5/P6 报告均已逐项登记并归因 |
| **（待登记）** | §四 4.2："`-- docs` 分组期望 `D x13 + ?? x22`" | **文档是否进索引只认 `git ls-files <dir>` = 0**；`??` 行数不作判据 | P7 实测：`??` 随 `--untracked-files` 口径在 1 / 31 之间变化；且目录下混有非任务文档 |

---

## 六、已知坑的实测复现情况

| 坑（键号） | 本次是否复现 | 说明 |
|---|---|---|
| **K10** PowerShell `-Pattern` 计数不可靠 | ✅ **复现两次** | ① i18n 逐 key 检查用 `'"bind"\s*:'` 会**子串命中** `"saveAndConnect"` / `"testConnection"`；② `git ls-files \| Select-String 'construction'` 报了 21 行，实为命中 `…-construction-plan.md` 等**文件名含该词**的无关文件。**两次都靠"回读原文逐条核对路径"排掉** → K10 的正确用法就是"任何计数结论都必须回读原文" |
| **K13** 临时 worktree + junction 删 node_modules 会误删主仓 | ⚪ **未复现（按蓝图规避）** | 未建 worktree，直接在主仓 `npm ci` |
| **K15** 删宿主文件不会自动暴露依赖者 | ✅ **复现** | 删面板的绑定区块后，依赖者散在 **i18n（18 key）/ CSS（8 处死规则）/ 测试（3 处 fixture + 1 条断言）** 三处 —— `tsc` **只抓得到 TSX 那一处**。蓝图 X3 的预判**完全正确**，4.4.1–4.4.4 四步走的安排避免了漏改 |
| **K18** "取 ours 还是 theirs"要看测试属哪一侧 | ✅ **适用** | `ChannelsSettingsMigration.test.ts` 属**官方**侧（官方新测试）→ 其夹具/断言按官方侧改动，**删并留痕**（改用例名 + 删 3 处 fixture + 删 1 条 heading 断言，保留 4 条有价值的断言） |
| **K19** 冲突块数 ≠ 整合面 | ✅ **复现（延迟暴露）** | 事实 5：`settings/shared/types.ts` 在 **P5** 取 ours，代价**延迟到 P7** 才暴露（5 条 `TS2339` + 一个必崩的页面）。**已追加为经验库 §6c / A45（M 级）** |
| **K20** 签名参数被取 theirs 删掉后功能静默消失 | ⚪ **未复现** | 本 Phase 的风险是**反向**（删 UI 时误删仍需的 import/状态）→ 用"删前 grep 复核 + 删后 8 处 API 引用仍在"双向判据规避 |
| **（新）** `install-scripts` 白名单拦 postinstall | ✅ **部分复现（且与蓝图假定不同）** | 白名单**确实**会拦 postinstall（`esbuild@0.28.2` 与 `electron-winstaller@5.4.0` 被列出），**但 electron 不属此类**（它没有 postinstall）。见偏差 2 |
| **（新）** `rolldownOptions` 是 vite 8 专属字段 | ⚪ **未复现** | 前提（vite < 8）不成立 —— 装齐后为 **8.3.0**，6/6 入口全部生成。**但"用产物清单判定而非退出码"这条纪律仍然有效**（它就是本次能证伪 X2 的手段） |
| **（新）** 主进程干净 ≠ 应用能起 | ✅ **复现并解除** | 事实 4 完全成立：`@tailwindcss/vite` 未装 → vite 加载配置即死。**已追加为经验库 §6c / A44（M 级）** |

**本次新踩到的坑**（已按 T4 追加进经验库）：

1. **`install-scripts` 白名单会静默跳过 postinstall，且条目带版本号** → 经验库 **§7 / X10**（L 级）
2. **electron 44 的二进制是"懒下载"而非"postinstall 被拦"** → 经验库 **§7 / E8**（L 级）
3. **`rolldownOptions` 是 vite 8 专属字段，老 vite 静默退回默认** → 经验库 **§7 / X11**（L 级）
4. **"主进程编译干净" ≠ "应用能起来"** → 经验库 **§6c / A44**（M 级）
5. **"取 ours 保住本地功能"的代价可能延迟两个 Phase 才暴露** → 经验库 **§6c / A45**（M 级）

> 📌 蓝图要求追加 **4** 条，实际追加 **5** 条：**把 X1 拆成了 2 条**（白名单通例 vs electron 版本特定行为）——
> 它们是**两件不同的事**，合成一条会让后人照抄错误假定。
> 已同步登记 [经验库-全量台账.md](../methodology/BLUEPRINT-经验库-全量台账.md) **附录 E**，并标注
> **L 级 `X10`/`X11` 与附录 B 的 `X10`/`X11` 属两套命名空间**（引用时须写全"经验库 §7 X10"）。

---

## 七、回退方法（已验证可用）

> ⚠️ **本节只写本次实测验证过的路径。**

```powershell
cd E:\AI_Chating\cyrene-agent
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$env:PATH = "D:\data\node24;" + $env:PATH

# 级 1 · 单文件（最常用）：从 p7 备份还原
Copy-Item "E:\AI_Chating\cyrene-agent-p7-backup\src__renderer__react__features__settings__ChannelsSettingsPanel.tsx" `
          src/renderer/react/features/settings/ChannelsSettingsPanel.tsx -Force
# 校验：git hash-object -- <path> 应与 .cyrene-merge-analysis/p7/pre-hashes.txt 对应行一致
#   （P7 实测：开工前 7 行哈希与工作区逐一吻合，可作为还原判据）

# 级 2 · 索引回退（只回索引，不动工作区）
git reset -q -- <path>

# 级 3 · 依赖回退（装坏了）
npm ci                    # 幂等；实测耗时 2.74 分钟（蓝图预估 5–20 分钟，实测更快）

# 级 4 · 回到 P6 末态
git checkout phase3-work-snapshot -- <path>       # 单个文件（586eae90）

# 级 5 · 连 .git 都没了
robocopy E:\AI_Chating\cyrene-agent-backup-phase0 E:\AI_Chating\cyrene-agent /E /XD node_modules
```

> 🔴 **永不** `git merge --abort`（会一次性丢弃 P3/P4/P5/P6/P7 全部成果）。
> 🔴 **永不** 对 `src/main/channels/history-log.ts` 做任何 `checkout`（群聊旁听的唯一实现，16 个本地独有导出）。
> 🔴 **永不** `git checkout <ref> -- .`（工作区大面积覆盖 = 丢 P6/P7 成果）。
> ⚠️ `npm ci` 会**重建整个 `node_modules`**（实测 `added 1623 packages`）→ 别把它当"轻量回退"。

**P7 实测的"反悔成本"提示**：本次唯一"计划外"的已跟踪文件改动是 `package.json` 的 2 行（`allowScripts`）。
若要撤销它：`Copy-Item "E:\AI_Chating\cyrene-agent-p7-backup\package.json" package.json -Force`
—— 但**注意**：撤销后本机再装 esbuild 时其 postinstall 又会被跳过（对已装好的 `node_modules` 无影响）。

---

## 八、给下一个 Phase 的交接清单

1. 🔴 **仍然不要提交，除非项目所有者明确要求**：P7 结束时索引已对齐、文档已排除，但**提交动作**按总蓝图留在 P8。
2. 🔴 **提交前必须 `git add` P7 改过的 5 个文件**（**本条是 P7 新增的最重要交接项**，见偏差 5）：
   `src/renderer/react/features/settings/ChannelsSettingsPanel.tsx`、
   `.../ChannelsSettingsMigration.test.ts`、`.../ChannelsSettingsPanel.css`（三者索引里是**改之前**的版本，`AM`）、
   `src/renderer/react/i18n/zh-CN.json`、`src/renderer/react/i18n/en.json`（`MM`）。
   **若直接 commit，渲染层 5 条 `TS2339` 会复活、渠道页重新变成会崩的状态。**
3. 📌 **P8 的首要任务已从"装依赖"变为"验证 + 人工台账逐条销账 + 提交"**（`npm ci` 已在 P7 完成）。
4. 🔴 **门禁名单不许缩减**：`src/main/channels/group-context-flow.test.ts`（群聊旁听探测器，唯一能抓"旁听静默消失"的门禁，**必须留在 P8 名单里**）。
5. 📌 **P8 待处置清单**（承接 P6 报告 §八 第 8 条，去掉已完成的依赖项）：
   - ① 7 个"失去被测对象"的测试（**H-07**，三选一待拍板）—— ⚠️ **P7 实测该类实际为 13 个文件**，见偏差/§三 3.9 的归因表
   - ② `theme-token-contract` 的 `ToolConsolePanel.css` 存量违规
   - ③ `default-dialogs-regression.test.ts`（`ToolConsolePanel.tsx:285` 的 `window.confirm`，存量）
   - ④ `package-lock.json` 收尾：lock 根 `version` 仍是 `1.2.2`，而 `package.json` 是 `1.2.2-PLUS`（**P7 未动锁**）
6. 📌 **`package.json` 有 2 行计划外改动**（`allowScripts` 的 `esbuild@0.21.5` → `0.28.2`）→ 提交前确认它**有意进入提交**。**不要**去改 `electron@43.1.0` 条目。
7. 🔴 **§六 6.3 的基线脚本会误报**：跑它时**以「P6 报告 §四 的 11/11」为判据**，不要以脚本输出为判据；考虑把基线文件升级为"带 Phase 修订记录"的形态。
8. 📌 **D6 的措辞歧义待拍板**：`docs/**` 下另有 **35 个 P3 期就已暂存的官方新增文档**（`docs/design/**` 18 / `docs/internal-issue/**` 8 / `docs/superpowers/**` 6 / `docs/refactor/**` 2）。D6 字面只覆盖"本任务的文档"，**P7 未动它们**。若意图是"任何文档都不进合并提交"，需另行拍板。
9. ✅ **`npm run dev` 现在真的起得来**（P7 已实测：vite ready 334ms + electron 44 + `core/windows-revealed`）→ H-02 / H-03 / H-05 / H-13（运行期）/ H-14 第 5-6 步**现已具备人验条件，不必再等**。
10. ⚠️ **`electron-winstaller@5.4.0` 有意未 approve**（仅打包安装包时需要）。若 P8 要跑 `electron-builder` 出安装包，需先 `npm install-scripts approve electron-winstaller`。
11. 📌 **H-B3 / H-B4 的判据（agent 已预先算出，不许让人现场猜）**：
    - **H-B3**（设置 → 渠道）：① 页面**正常渲染**（非白屏/控制台报错）② **找不到**「上下文绑定」区块（标题、两个下拉、绑定按钮、绑定列表）③ **找不到**「镜像到桌面 / Mirror messages in desktop chat」开关 ④ **仍能看见**：渠道卡片网格、速率限制、发送 TTS/贴纸、手机端工具权限、最近收发记录。
      机器侧已备：面板 grep 7 符号 = 0、`tsc renderer` = 0、`ChannelsSettingsMigration.test.ts` 4 tests 全绿、i18n 18 key 已删。
    - **H-B4**（dev 起来的应用）：窗口正常出现、聊天页可交互、无白屏。
      agent 已判"**起得来**"（ready 334ms + windows-revealed + core 启动完整）；**"能用"须人判**。
12. 📌 **两条非失败的启动日志观察**（记录备查，**不需修**）：`[Screenshot] native helper prewarm failed … cyrene-screenshot.exe ENOENT`（**Rust 原生截图助手未编译**，与合并无关）、`[WechatBot] No credentials` / `[StickerEmbedding] Model not found`（未配置/未下载模型的预期提示）。

---

## 九、Phase 7 目标达成核对

| 目标（来自蓝图 §一） | 状态 | 证据 |
|---|---|---|
| **T1** 索引对齐 | ✅ | 4 文件方向 A 全无输出；方向 B = **+679/−96** |
| **T2** 文档排除 | ✅ | `git ls-files` 两条均 = **0**；磁盘文件未动 |
| **T3** 依赖装齐 | ✅ | 15 包 + `@types/qrcode` 全 True；8 项工具链版本全部到位；`electron.exe` 可执行 |
| **T4** D1 渲染层残留清零 | ✅ | 面板/测试/i18n/CSS **全 0 命中**；channels key 两套 56=56 一致 |
| **T5** 三套编译面收口 | ✅ | **0 / exit 0 / 0**（renderer 48 → 0） |
| **T6** 构建链可执行 | ✅ | vite 8.3.0 + 两个 build exit 0 + **6/6 入口** + `dev` 起得来 |
| **T7** 门禁与保护功能不退化 | ✅ | A2 22 / A3 4 / A9 273 全绿；全量 15 failed（P6：31）；11 项功能 **11/11** |

**非目标遵守情况**（逐条确认没越界）：

| 非目标 | 是否越界 | 证据 |
|---|---|---|
| **N1** 未 `git commit` | ✅ 未越界 | `HEAD` = **598dfb75**；`MERGE_HEAD` = **b11b8851**；`.git/MERGE_HEAD` 仍在 = True。**零 commit** |
| **N2** 未动 `history-log.ts` | ✅ 未越界 | `git status --porcelain` 无输出；worktree blob = `c7e54e88…` |
| **N3** 未动 CTA / transcript kind | ✅ 未越界 | `conversation-transcript-{store,compactor}.ts` 状态为 **`A `（官方新增，非 P7 改动）** 且 mtime = **2026/9/27 0:46**（P7 开工于 09/29 23:4x）→ 非本 Phase 触碰。**协议级 kind 一个未增未改** |
| **N4** 未修 ②③④ 类 | ✅ 未越界 | ②③④ 类文件均**不在** §四 4.0 的 7 文件清单内，未被 P7 写过；全量测试里它们的失败数**未增加** |
| **N5** 未动 `corpus/**` / `conversation-binding-store.ts` | ✅ 未越界 | `git status --porcelain -- src/main/corpus` = **0 条**；binding-store `Test-Path` = **True** 且无改动 |
| **N6** 未删 `settings/shared/types.ts` 的类型 | ✅ 未越界 | 该文件 `git diff --stat` = **0**（P7 只清**调用面**） |
| **N7** 未重建 `package-lock.json` | ✅ 未越界 | 哈希 **`05dcca09…` 前后一致**，`git diff --stat` 为空。**S1 未触发** |

---

## 十、回写清单 ★（**未勾完不得提交**）

| 触发条件 | 回写目标 | 回写内容一句话 | 已勾选 |
|---|---|---|---|
| **T2** 基线数值改写 | [BLUEPRINT-总蓝图.md](BLUEPRINT-总蓝图.md) §四 P7 行 | 状态 → ✅ 已完成；并记"**顺序变更：`npm ci` 由 P8 提前到 P7**" | [x] |
| **T2** 基线数值改写 | [BLUEPRINT-总蓝图.md](BLUEPRINT-总蓝图.md) §九 | 新增「当前基线（**P7 之后**）」：vite 8.3.0 / vitest 5.0.1 / electron 44.4.3 / 三套 tsc = 0；P6 段移入历史基线 | [x] |
| **T3** 描述被推翻 | [HUMAN-人工验证台账.md](HUMAN-人工验证台账.md) §一 前言 | 「`npm run dev` 现在就能起来」→ 「**P7 装依赖后可起**」 | [x] **蓝图撰写轮已完成**（台账 `:18-22` 原文已是推翻后的表述，P7 复核确认） |
| **T2** 时点被改写 | [HUMAN-人工验证台账.md](HUMAN-人工验证台账.md) §一 H-02 / H-03 / H-05 | 时点「🟢 现在可做」→「**P7 后**」 | [x] **蓝图撰写轮已完成**；**P7 本轮再推进为「✅ P7 已完成 → 现在可做」**（3 处） |
| **T1** 判据被修正 | [HUMAN-人工验证台账.md](HUMAN-人工验证台账.md) §三 H-14 第 5-6 步 | 标「**P7 后具备人验条件**」+ 附 P7 清掉两个拦路问题的机器判据 | [x] |
| **T2** 时点被改写 | [HUMAN-人工验证台账.md](HUMAN-人工验证台账.md) §一 H-14 行 | 时点「❌ 必须等 P8」→「**🟢 P7 后具备人验条件**」 | [x] |
| **T3** 描述被推翻 | [PHASE-7-边界编译修复与构建链切换.md](PHASE-7-边界编译修复与构建链切换.md) §四 4.1 | 🔴 **判据写反方向** → 拆成"工作区 vs 索引"与"索引 vs HEAD"两个方向分别写清期望值 | [x] **（本报告偏差 1）** |
| **T3** 描述被推翻 | 同上 §四 4.3 | 🔴 **X1 的 electron 假定不成立** → 就地改为"electron 44 无 postinstall、走懒下载"；并标注 `approve` 会改 `package.json` | [x] **（本报告偏差 2）** |
| **T3** 描述被推翻 | 同上 §四 4.6 | `rolldownOptions` 在 vite 8 下**行为与预期一致**（X2 未复现）+ rolldown 专属提示为旁证；`dev` 起得来的实测输出 | [x] |
| **T4** 新增经验 | [经验库-具体坑.md](../methodology/BLUEPRINT-经验库-具体坑.md) §7 | L 级 **X10**：`install-scripts` 白名单静默跳过 postinstall，且条目**带版本号** | [x] |
| **T4** 新增经验 | [经验库-具体坑.md](../methodology/BLUEPRINT-经验库-具体坑.md) §7 | L 级 **E8**：electron 44 的二进制是**懒下载**，不是 postinstall 被拦 | [x] **（蓝图未列，P7 追加）** |
| **T4** 新增经验 | [经验库-具体坑.md](../methodology/BLUEPRINT-经验库-具体坑.md) §7 | L 级 **X11**：`rolldownOptions` 是 vite 8 专属，老 vite **静默退回默认** → 用**产物清单**判定 | [x] |
| **T4** 新增经验 | [经验库-通用.md](../methodology/BLUEPRINT-经验库-通用.md) §6c | M 级 **A44**："主进程编译干净" ≠ "应用能起来" | [x] |
| **T4** 新增经验 | [经验库-通用.md](../methodology/BLUEPRINT-经验库-通用.md) §6c | M 级 **A45**："取 ours 保住本地功能"的代价**延迟两个 Phase** 才暴露 | [x] |
| **T4** 新增经验 | [经验库-全量台账.md](../methodology/BLUEPRINT-经验库-全量台账.md) 附录 E | 5 条经验的五元组登记 + **标注 L 级 X10/X11 与附录 B 同名编号属两套命名空间** | [x] |
| **T2** 基线数值改写 | 本文件 §二 | 三套编译面 / 依赖版本 / 门禁数量的最终值 | [x] 见 §三 3.7 / 3.9 与总蓝图 §九「P7 之后」 |
| — | — | 本 Phase 无其他触发 | [x] 已逐条核对 T1–T4；**另有 6 项蓝图未列的发现**（§五 偏差 1–6），其中 1 项追加为经验（E8），**3 项判据修正建议登记判据台账**（§五 末表） |

> **规则执行情况**：无触发的行已写"无（已核对）"；回写只「新增 + 标注」，未静默删除任何旧值
> （总蓝图 P6 段与 P5 段均**移入「历史基线（仅存档）」保留**）。
> **`[ ]` 计数 = 0 → 本 Phase 可宣告完成**（**但提交时机仍在 P7 之后**，见 §八 第 1 条）。

---

## 十一、施工记录（摘要）

> 完整施工记录见 [PHASE-7-边界编译修复与构建链切换.md](PHASE-7-边界编译修复与构建链切换.md) **§十二**（子节 0–7 已全部回填）。
> 本节只摘录**报告读者最需要的四条**。

### 11.1 三套编译面的前后对比

| 编译面 | 开工前 | 完工后 | 关键说明 |
|---|---|---|---|
| main | **1**（`create-aux-windows.ts(36,55): TS2694 WindowStatePersistence`） | **0** | **未改任何代码**，随 electron 43.1.0 → 44.4.3 自动消失 |
| preload | **0**（exit 0） | **0**（exit 0） | 全程未动 |
| renderer | **48** = `TS2307`×29 + `TS7006`×12 + `TS2339`×5 + `TS7016`×1 + `TS7031`×1 | **0** | 42 条由 4.3 装依赖消除；**5 条 `TS2339`** 由 4.4 删调用面消除 |

### 11.2 测试基线对比

| 层 | 开工前（P6 末） | 完工后（P7） | 判定 |
|---|---|---|---|
| 语料豁免（A2） | 22 passed | **22 passed** | ✅ 不退化 |
| 探测器（A3） | 4 passed | **4 passed** | ✅ 不退化（仍在名单） |
| 定向门禁（A9） | 12 文件 / 269 tests | **13 文件 / 273 tests** | ✅ 全绿（269 + 4 = **273 恰好闭合**） |
| 全量 | **31 failed 文件 / 9 failed tests**（542 passed / 5293 passed） | **15 failed 文件 / 4 failed tests**（**558 passed / 5403 passed**） | ✅ 失败 **−16 文件 / −5 tests**；通过 **+16 文件 / +110 tests** |

### 11.3 依赖安装记录

| 项 | 实测 |
|---|---|
| `npm ci` 退出码 / 耗时 | **exit 0** / **2.74 分钟**（`added 1623 packages`） |
| `install-scripts ls`（装后首次） | 2 项：`electron-winstaller@5.4.0`、**`esbuild@0.28.2`** —— **electron 不在列表** |
| approve / rebuild | **approve 了 `esbuild`**（唯一需要的）；**未 rebuild**（不需要）；**未 approve electron**（见偏差 2）。approve 后剩 1 项：仅 `electron-winstaller`（**有意不批**） |
| `package-lock.json` | **未变**（`05dcca09…`）→ **S1 未触发** |
| ⚠️ `package.json` | **变了 2 行**（`allowScripts` 的 esbuild 条目）→ **计划外，已单列**（偏差 3） |

### 11.4 验收后修复

**无。** P7 **一次通过**，未发生"验收失败 → 回修"的循环。停止条件 S1–S7 **全部未触发**（详见 §十二 子节 6）：
S1 `npm ci` 未硬失败 / S2 无新的无法归因编译错误（三面全归零）/ S3 无测试文件变红（A9 全绿、全量失败数下降）/
S4 `electron .` 起得来 / S5·S6 无越界冲动 / S7 未见白屏闪退迹象。

---

> **报告完毕。** P7 判据 **10/10 PASS**，非目标 **7/7 未越界**，回写清单 **`[ ]` = 0**。
> **下一步**：项目所有者人验 **H-B3 / H-B4**，然后进入 **P8（验证 + 人工台账逐条销账 + 提交）**
> —— 提交前务必先做 §八 第 2 条（`git add` 那 5 个文件）。
