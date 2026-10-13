# Phase 6 施工蓝图：运行期人工验证与收口

> **执行者**：**人 + agent 配对**（人负责**看界面 / 点按钮 / 接真实渠道**；agent 负责**开前置、跑机器判据、记录结果**）
> **风险等级**：**高**（🔴 **本 Phase 的第一次"运行应用"会把 `%APPDATA%\live2d-cyrene` 整体改名**；且是**唯一能发现运行期缺陷**的阶段）
> **预计耗时**：**90–180 分钟**（重建 15–30 分钟 + 人工验证 60–120 分钟 + 收口 20 分钟）
> **文档规范**：见 `../methodology/BLUEPRINT-撰写规范.md` §4（**跨目录相对路径，不写裸文件名**）
> **前置**：P5 已完工并复核（依赖树就位、四层核验通过）；本蓝图**取证于 2026-10-13**

> 🔴 **本 Phase 与前面五个 Phase 的根本差别**：**前五个 Phase 一个应用都没跑过**。
> ⇒ 本 Phase 是**唯一**能回答"**她还能不能正常用**"的阶段，也是**唯一会碰到真实用户数据**的阶段。
> ⇒ **两件事必须写在最前面**：① **先备份、后启动**（见 §四 1.1）；② **先重建、后验证**（见 §二 E2 的 `dist` 陈旧证据）。

---

## 一、施工目标

### 1.1 核心问题（带 `file:line` 根因）

**问题 A · 一个从未运行过的合并结果**

| 事实 | 实测 |
|---|---|
| 合并的**唯一**验证都是**静态**的 | P2（文件级取舍）· P3（40 个冲突块 + `tsc`）· P4（提交拓扑）· P5（四层 + 装依赖）—— **全部没有启动过 Electron** |
| `dist/` 是**合并前**的产物 | `dist/main/main/index.js` mtime = **2026-10-01 02:27**，而 merge commit = **2026-10-12 23:39** ⇒ **必须重建**（见 §二 E2） |
| 11 项功能基线只证明了"**标识在**" | P3 的 A4 与 P4 的 A9 都是 `git grep -l` 的**文件级读数**；**"入口在"** 由 P5 的入口层给出**静态**结论（`main ≥1`）；**"点得开、看得见、点了有反应"** —— **无人验证过** |

**问题 B · 🔴 首次启动会迁移用户数据（**不可逆**）**

| 事实 | 实测 |
|---|---|
| 旧数据目录**仍然存在且有真实数据** | `%APPDATA%\live2d-cyrene` = **624 MB / 5588 文件**（`C:\Users\beiki\AppData\Roaming\live2d-cyrene`） |
| 新目录**尚不存在** | `%APPDATA%\Cyrene` = **不存在** · `%APPDATA%\cyrene-agent` = **不存在** ⇒ **迁移尚未发生** |
| 迁移**已经在装配链上** | `src/main/application/pre-ready.ts:35` 调用 `deps.migrateLegacyUserData()`；实现在 `src/main/user-data-migration.ts`；**它在"单实例锁之后、任何 userData 读取之前"**（源码注释明确写了这条顺序） |
| 目标目录名由 Electron 决定 | `package.json`：`name = cyrene-agent` · `productName = **Cyrene**`（`electron-builder.yml` 同）⇒ Electron 用 **`productName`** 作 userData 目录名 ⇒ 目标是 **`%APPDATA%\Cyrene`** |
| **迁移是"整体原子重命名"** | `user-data-migration.ts` 的 `renamed` 分支：`fs.renameSync(legacyPath, targetUserDataPath)` —— 同卷内**一步到位**；失败才退化为逐项合并（`merged`/`partial`） |

⇒ **结论**：**第一次启动 = 把 624 MB 的真实数据从 `live2d-cyrene` 搬到 `Cyrene`**。
**这一步本身是设计好的（官方 `user-data-migration` + 迁移测试），但它不可逆** ⇒ **必须先有外部备份**（§四 1.1）。

**问题 C · 三项拍板卡在 P6 之前**

| # | 待拍板 | 出处 | 为什么必须 P6 前收口 |
|---|---|---|---|
| 1 | **渠道 4 文件**：确认删除 or 恢复 | 台账 **H-16** | 若选"恢复"⇒ 是**一笔独立施工**（补 2 处调用点），而 P6 要验的正是"渠道/群语料"这条线 ⇒ **不先定，验的东西就不确定** |
| 2 | **两个孤儿模块**：保留 or 删除 | 台账 **H-17** | 同上；且删除要留审计痕迹（**M6**） |
| 3 | 🔴 **渠道 4 文件 / 孤儿模块都不阻塞"机器判据"**，但**都阻塞"结项"** | P5 §十二 6 | 结项前必须 0 项待拍板 |

### 1.2 目标清单（可勾选）

| # | 目标 | 判据出处 |
|---|---|---|
| **T1** | 🔴 **数据安全**：`%APPDATA%\live2d-cyrene`（624 MB / 5588 文件）**在启动应用之前**完成外部备份，且**备份可核对** | §六 A1 |
| **T2** | 🔴 **重建产物**：`pnpm run build` 成功（含 `check:main` / `check:preload`），`dist/` 的 mtime **晚于** merge commit | §六 A2 |
| **T3** | **应用能启动**：主窗口出现、无致命报错、**迁移返回 `renamed`**（或 `merged`），`%APPDATA%\Cyrene` 出现且数据齐 | §六 A3 + A4 |
| **T4** | 🔴 **H-10**：附件文档链端到端（上传 → 提问只有该文档能答的问题 → 答得出） | §六 A6 |
| **T5** | 🔴 **H-11**：5 项"能力在、入口没了"逐项**看到入口**（`memory-console` / `ZONES_` / `keyword-policy` / `USAGE_BADGE` / `groupContextLimit`） | §六 A7 |
| **T6** | 🔴 **H-12**：设置页**全部面板**逐个打开（含官方新增：知识库 / 子代理 / 浏览器控制） | §六 A8 |
| **T7** | 🔴 **H-13**：记忆模式 `vector / summary / wiki / off` 与**本地域过滤**共存（含 `off` 下附件召回与域隔离） | §六 A9 |
| **T8** | **H-14**：真实渠道（QQ / NapCat）上的群语料与旁听上下文 —— **缺渠道就如实记 `🚫 无法验（缺 真实渠道）`，不填 ❌** | §六 A10 |
| **T9** | **11 项功能基线逐项"人眼确认"**（把 P3/P4/P5 的**文件级**结论升级为**界面级**结论） | §六 A11 |
| **T10** | **三项拍板收口**（H-16 / H-17；若选"恢复/删除"则各自独立一笔） | §六 A12 |
| **T11** | 🔴 **收口提交**：把 P4/P5/P6 的文档与证据一次性入库，`HEAD` 前进到"合并已完成"的干净状态 | §六 A13 |
| **T12** | **结项前的交接清单**（`node_modules.bak` / `wip/*` / 证据目录 / BACKLOG 遗留 全部有主） | §七 + §十 |

### 1.3 非目标（**明确不做**）

| 不做 | 为什么 | 何时做 |
|---|---|---|
| **不修任何源码** | 本 Phase 是**验证 + 收口**；发现缺陷**登记**（规范 §5.3：安全/隐私/数据类缺陷独立成报告） | 独立一笔 |
| **不为让判据变绿去改测试/文案** | `class-name-contract` 的 3 个未定义类名是**既有欠账**（P3 已归因）；日语 377 键是**已拍板登记** | 结项 / BACKLOG |
| **不动 `resources.test.ts` 的 `PARTIAL_LOCALES`** | 判据写明"增加即失败、减少要同步下调"（P3 拍板产物） | — |
| **不跑 `pnpm install`** | 依赖树已就位（P5 销账，`exit=0` + 锁文件三处 blob 全等） | — |
| **不删 `node_modules.bak` / `wip/*` / `p4-pre-commit`** | `node_modules.bak` 是**依赖级回退点**（R-1 实测可用）；`wip/*` 是**核验参照物** | **结项**（见 §七 表） |
| **不 `git clean`** | **72 条 `??`** 里有 B-01 三目录（`docs/design` 41 + `internal-issue` 15 + `refactor` 6 = 62）与 **6 个证据目录** | 结项 |
| **不改 `.gitignore`** | 证据目录入库需改它（属计划外扩张）⇒ **结项统一决定** | 结项 |
| 🔴 **不在没有备份的情况下启动应用** | 见 §1.1 问题 B | **永不**（那是唯一不可逆的一步） |
| **不做打包（`package:win:dir`）** | 那是**发布**动作，会跑 `electron-builder` + `prepare:mingit/mpv`（数十分钟、要下载）⇒ 与"验证功能"无关 | 发布时（**不在本任务范围**） |

---

## 二、实测证据（决定本 Phase 做法，**执行前请读**）★

> 全部数据测于 **2026-10-13**，时点 = P5 复核后。

### E1 · 起点

```bash
cd /e/AI_Chating/cyrene-agent
git log --oneline -1                 # 8ad59939 docs(P4): 校正完成报告的提交哈希口径…
git status --porcelain | grep -vc '^??'   # 3（= P4 复核 / P5 蓝图 / P5 复核 三份文档的未提交改动）
git status --porcelain | grep -c '^??'    # 72
git status --porcelain -- src | wc -l     # 0   ← 源码零改动
```

| 量 | 实测 |
|---|---|
| 固定点 | merge commit **`9cceeeac43c1ee87980e653fb62a69b831d669fa`**（🔴 引用它，**不要用 `HEAD`**；判据 **J-25**） |
| 依赖树 | **已就位**（P5：`--frozen-lockfile exit=0`；`tsc` 三套 **0/0/0**；全量 `1 failed \| 582 passed`） |
| TS | **6.0.3**（P5 的第二个变更源，**已分离归因**） |
| 回退点 | `node_modules.bak`（**132037 文件**）· `p4-pre-commit` = `9920635f` · `wip/p3-src` = `6a1fb6fe` |

### E2 · 🔴 **`dist/` 是合并前的产物**（本 Phase 的第一个硬前置）

```bash
echo "merge commit : $(git log -1 --format=%ci 9cceeeac)"   # 2026-10-12 23:39:42 +0800
echo "dist/ mtime  : $(stat -c%y dist | cut -d. -f1)"       # 2026-09-19 00:00:28
for f in dist/main/main/index.js dist/renderer/react/index.html; do stat -c '%y  %n' "$f"; done
```

| 产物 | mtime | 判定 |
|---|---|---|
| `dist/` | **2026-09-19** | 🔴 **陈旧** |
| `dist/main/main/index.js`（`package.json` 的 `main`） | **2026-10-01 02:27** | 🔴 **早于 merge 12 天** |
| `dist/renderer/react/index.html` | **2026-09-29 23:57** | 🔴 陈旧 |
| `dist/main/plugins` | 存在（`build:main` 会重造） | ✅ |

⇒ **"直接 `pnpm start`"是错的**：`electron .` 会加载 `dist/main/main/index.js`（**合并前的代码**），
于是验证的是**旧应用** ⇒ **必须 `pnpm run build` 重建**（§四 1.2）。

### E3 · 数据目录与迁移（**本 Phase 最危险的一步**）

```bash
echo "old : $(test -d "$APPDATA/live2d-cyrene" && echo present || echo absent)"
du -sh "$APPDATA/live2d-cyrene" 2>/dev/null ; find "$APPDATA/live2d-cyrene" -type f 2>/dev/null | wc -l
echo "new Cyrene      : $(test -d "$APPDATA/Cyrene" && echo present || echo absent)"
echo "new cyrene-agent: $(test -d "$APPDATA/cyrene-agent" && echo present || echo absent)"
```

| 量 | 实测 |
|---|---|
| 旧目录 `%APPDATA%\live2d-cyrene` | **present** · **624 MB** · **5588 文件** |
| 目标 `%APPDATA%\Cyrene` | **absent**（`productName = Cyrene` ⇒ 这是 Electron 会用到的名字） |
| `%APPDATA%\cyrene-agent` | **absent**（若 Electron 改用 `name`，则会是它 —— **两种可能都要在启动后核对**） |
| 迁移触发点 | `src/main/application/pre-ready.ts:35` → `deps.migrateLegacyUserData()` → `src/main/user-data-migration.ts` |
| 迁移语义（源码级） | ① 目标不存在 ⇒ **整体原子 `renameSync`**（状态 `renamed`）② 两者并存 ⇒ **逐项并入、旧文件优先覆盖**（`merged`/`partial`）③ 整体失败 ⇒ `failed`（**应用将以全新目录启动** ⇒ 🔴 **数据看似"没了"**）④ 同一路径 ⇒ `skipped` ⑤ 旧目录不存在 ⇒ `none` |
| 运行时文件 | `lockfile` / `SingletonLock` / `SingletonSocket` / `SingletonCookie` 会被**丢弃旧版**（保留新目录版本） |

🔴 **P6 必读的三条推论**：
1. **备份必须在启动前做**（§四 1.1）—— 因为成功的迁移**会移走**旧目录（`renamed` 之后旧目录**不再存在**，回退只能靠备份）；
2. **日志里要能看到迁移状态**：`[Cyrene] 用户数据目录已整体迁移: … -> …`（`renamed`）或 `…合并迁移完成（merged/partial）: …`，以及失败时的 `[Cyrene] 用户数据目录整体迁移失败:` ；
3. **失败不等于数据丢**（源码写着"**绝不主动删除旧目录里有内容的东西**"；逐项失败会留在旧目录）—— 但**没有备份就无法区分"迁移成功但内容不对"和"迁移失败"**。

### E4 · 待验面（**台账 H-10…H-17 的原文摘要**）

| 编号 | 类型 | 要验什么 | P3/P4/P5 已给出的**静态**结论 | P6 要补的**运行期**结论 |
|---|---|---|---|---|
| **H-10** | B · H-B | **附件文档链端到端**：上传一个文档 → 提问**只有该文档才有**的答案 → 看模型答不答得出 | 源码层已恢复且可编译（7 文件 + 3 个 preload 桥）；IPC 契约 **8/8 绿**；🔴 **但 P5 复核：3 个桥方法的 renderer 命中仍 = 0（A56 未闭合）** | 🎯 **本次最关键的验证**：**上传入口到底在哪、点了有没有反应**（见 §四 2.1 的两种分支处置） |
| **H-11** | B · H-B | **5 项"能力在、入口没了"**逐项看入口 | 机器面 11/11 不退化；P5 入口层给出 `main ≥1` 与 renderer 命中的**计数** | 🎯 每项给"**点哪里 → 应看到什么**"，**界面文案从 i18n 取值粘贴**（经验 **F21**） |
| **H-12** | B · H-B | 设置页**各面板**逐个打开（含官方新增：知识库 / 子代理 / 浏览器控制） | P3 已核实导航 5 入口（`zones` / `knowledge` / `subagents` / `browser` / `memory`）**在源码里** | 🎯 **逐个点开截图/记文案**；日语缺口会**回退中文**（已拍板） |
| **H-13** | B · H-B | 记忆模式 `vector / summary / wiki / off` × **本地域过滤**共存 | 源码层按"**并集**"处置（官方 `isMemoryEnabled()` 守卫 × 我方 `scopeId`/`TurnAttribution`） | 🎯 **本 Phase 最大的语义验证点**：切 `off` 后附件召回与域隔离**仍符合预期**吗 |
| **H-14** | C · H-C | 真实渠道（QQ / NapCat）上的群语料与旁听上下文 | —— | ⚠️ **需要真实渠道**；不具备 ⇒ `🚫 无法验（缺 真实渠道）`（**不要填 ❌**） |
| **H-16** | A · H-A | 渠道 4 文件：**确认删除 or 恢复** | 删除出处 `598dfb75`（**同时清理了引用点**）；官方侧 blob 与 base 逐字节相同；选删除 ⇒ **不产生悬空引用** | 🎯 **人拍板**；选恢复 ⇒ 独立一笔（补 `init.ts` / `ChatPage.tsx` 调用点） |
| **H-17** | A · H-A | 两个孤儿模块（`embedding-index-service.ts` · 🆕 `usage-badge.ts`）：**保留 or 删除** | 消费者均 = 0；🔴 **`USAGE_BADGE` 的**功能**没丢**（`UsageBadge` 组件仍被 `ChatPageNavigation.tsx:121` 渲染）—— 死的只是"**设置项 → 徽章配色**"的配置管道 | 🎯 **人拍板**；选删除 ⇒ 先确认无仓外/动态消费者（**M6** 留痕） |

### E5 · 界面文案基线（**从 i18n 直接取，供 H-11 / H-12 对照**）

> 实测（`src/renderer/react/i18n/zh-CN.json`，共 **2480** 键）：

| 面板 / 项 | i18n 键 | 中文文案 | 键数 |
|---|---|---|---|
| 设置页 - 区块 | `settingsPage.zones.title` | **区块** | 57 |
| 设置页 - 知识库 | `settingsPage.knowledgeBase.title` | **知识库** | 24+（`create` / `collections` / `fileCount` …） |
| 设置页 - 子代理 | `settingsPage.subagents.title` | **子代理** | 16 |
| 设置页 - 浏览器控制 | `settingsPage.browserControl.navLabel` / `.title` | 取 `.navLabel`；`.title` = **浏览器控制** | 多个 |
| 设置页 - 记忆 | `settingsPage.memory.title` | **记忆** | 230 |
| 用量徽章 | `src/shared/usage-badge.ts` 的常量 + `UsageBadge.tsx` | （组件无独立 i18n 键） | — |

🔴 **两个易错点**：
① **"浏览器控制"的 i18n 前缀是 `settingsPage.browserControl.*`，不是 `settingsPage.browser.*`**（后者**不存在**）——
P3/P4 的文档里写的 `"browser"` 是**导航 section id**，不是 i18n 前缀；
② **没有 `settingsPage.wiki.*`**（wiki 记忆模式的界面在**记忆面板内部**，不在导航里）。

### E6 · 启动方式（**三种，本 Phase 选第 3 种**）

| 方式 | 命令 | 它会做什么 | 本 Phase 是否用 |
|---|---|---|---|
| ① 开发模式 | `pnpm run dev` | `build:main && build:preload && build:cli` + `concurrently "vite --strictPort" "cross-env VITE_DEV=1 electron ."` | ❌ 不用（它会**另起 vite 服务**，而验证目标是"打包后的产物"，且 `--strictPort` 会占端口） |
| ② 直接跑旧产物 | `pnpm start`（= `electron .`） | 加载 **`dist/`（陈旧）** | ❌ **绝对不用**（验的是旧应用，见 E2） |
| ③ 🔴 **重建后跑产物**（**本 Phase 采用**） | `pnpm run build` 然后 `pnpm start` | `check:main && check:preload && build:main && build:preload && build:cli && build:renderer` → `electron .` | ✅ **用这个**（与"发布产物"一致，且 `build` 自带两道 `check:*`） |

> 📌 **为什么不用 `dev`**：`dev` 用 `VITE_DEV=1` **走 vite dev server 的 HMR 路径**，
> 与"合并后的真实产物"**不是同一条代码路径**（`build:renderer` 走 `vite build`）。
> P6 要回答的是"**合并成不成功**"⇒ **必须验产物**。

### E7 · 环境与命令备忘（**实测值，不要照抄更早的 Phase**）

| 项 | 实测 | 备注 |
|---|---|---|
| 应用级 Node | `./.node24/node.exe` = **v24.21.0** | `engines` 要求 `node >=24 <25`；系统 node 是 **v22.23.2**（`pnpm install` 时出现过 `WARN Unsupported engine`） |
| pnpm | **10.33.0**（`pnpm -v` 直接可用） | ⚠️ **P3 的"系统 pnpm 已损坏"结论已被 P5 复核证伪** ⇒ **先探测再用** |
| electron | **44.4.3** | 🔴 **`electron.exe` 不在 `dist/`**：P5 §十 U7 已归因（`electron@44` 无 `postinstall`，二进制由 `require()` **懒下载**）⇒ **首次 `pnpm start` 可能需要联网下载** |
| 截图/取证 | Windows 截图工具 / 手工复制界面文案 | 建议**每项验证都留一张截图或一段文案**（判据要能复核） |

### E8 · 被推翻的原计划（**不要按旧描述执行**）

| 原计划（总蓝图/早期口径） | 实测结论 | 新做法 |
|---|---|---|
| "P6 = 运行期 B 类人眼验证 + 收口提交" | ✅ 成立，但**少了两件硬前置**：**重建 `dist`** 与 **备份用户数据** | §四 1.1 / 1.2 把它俩放在**最前** |
| "验证时直接 `pnpm start`" | ❌ `dist/` 是**合并前 12 天**的产物 | **必须先 `pnpm run build`**（E2） |
| "启动不会动数据" | ❌ **首次启动会把 624 MB / 5588 文件从 `live2d-cyrene` 改名到 `Cyrene`** | 🔴 **先备份**（E3） |
| "附件链 P3 已经修好了" | ⚠️ **只修到"源码层可编译"**；**渲染端仍无调用点**（P5 复核确认 3 个桥方法的 renderer 命中 = 0） | H-10 **要判"有没有上传入口"**，并按 §四 2.1 的**两种分支**处置 |
| "`settingsPage.browser.*` 是浏览器面板的键" | ❌ **不存在**；真前缀是 **`settingsPage.browserControl.*`** | 用 E5 的文案表 |
| "三项拍板可以留到结项" | ❌ **H-16 / H-17 必须在 P6 前收口**（台账 §5.2 明写"**P6 前必须收口**"） | §四 0.1 先收口 |

---

## 三、前置条件与停止条件

### 3.0 前置条件（**不满足则不得开始**）

```bash
cd /e/AI_Chating/cyrene-agent

# ① P5 报告的"回写清单"已闭合 —— 期望：0 行
grep -c '^|.*\[ \]' docs/construction/HEB-1.3.0/TASK-H1.3.0/PHASE-5-完成报告.md

# ② 台账：只剩 H-16 / H-17 两行待拍板（H-A 专用记号），其余无未闭合 —— 期望：2
grep -c '^|.*\[ \]' docs/construction/HEB-1.3.0/TASK-H1.3.0/HUMAN-人工验证台账.md

# ③ 工作树：源码零改动、无冲突 —— 期望：0 / 0
git status --porcelain -- src | wc -l
git diff --name-only --diff-filter=U | wc -l

# ④ 依赖树就位（P5 销账）—— 期望：三个包各打印版本 + 三套编译 0 错
for p in typescript @mantine/core @tanstack/react-virtual; do
  node -e "console.log('$p', require('./node_modules/$p/package.json').version)"; done
for c in main preload renderer; do
  printf "  %s errorTS=%s\n" "$c" "$(grep -c 'error TS' .cyrene-merge-analysis/heb-p5/after-tsconfig.$c.log)"; done

# ⑤ 🔴 数据备份就绪（本 Phase 的**安全前提**）—— 期望：备份目录存在且文件数与源一致
OLD="$APPDATA/live2d-cyrene"
echo "源： $(find "$OLD" -type f 2>/dev/null | wc -l) 文件 / $(du -sh "$OLD" 2>/dev/null | cut -f1)"
echo "备份：见 §四 1.1 建立的 BK 目录，核对文件数必须等于源"

# ⑥ 🔴 `dist/` 陈旧已被识别（不阻开工，但决定 §四 1.2 必做）—— 期望：dist mtime 早于 merge
echo "merge : $(git log -1 --format=%ci 9cceeeac)"
echo "dist  : $(stat -c%y dist | cut -d. -f1)"

# ⑦ electron 可执行体是否已在位（决定 `pnpm start` 会不会需要联网）—— 期望：给出 present/absent
ls -la node_modules/electron/dist/electron.exe 2>/dev/null || echo "  electron.exe 不在 ⇒ 首次 start 可能需联网下载（P5 §十 U7 已归因）"

# ⑧ 三项拍板的状态（H-16 / H-17）—— 期望：已答复，或明确记为"挂起 + 去路"
grep -E '^\| \*\*H-1[67]\*\*' docs/construction/HEB-1.3.0/TASK-H1.3.0/HUMAN-人工验证台账.md | cut -c1-120

# ⑨ 未跟踪面（禁用 clean 的依据）—— 期望：72
git status --porcelain | grep -c '^??'
```

| # | 前置 | 期望 | 不满足时 |
|---|---|---|---|
| ① | P5 回写清单闭合 | 0 行 | **不得开始**（规范 §5.1） |
| ② | 台账只剩 H-16/H-17 | 2 | >2 ⇒ 先弄清多的那行是什么 |
| ③ | 源码零改动 / 无冲突 | 0 / 0 | 🔴 **停工**：有源码改动 ⇒ 验的不是合并结果 |
| ④ | 依赖树就位 | 三包有版本 + 编译 0 错 | 🔴 **停工**：回到 P5（`node_modules.bak` 还在 ⇒ 可回退） |
| ⑤ | **数据备份就绪** | 备份文件数 = 源文件数（5588） | 🔴 **绝对停工**：**没有备份不许启动应用**（唯一不可逆动作） |
| ⑥ | `dist` 陈旧已识别 | mtime 早于 merge | 若 `dist` **竟然更新**（有人已重建）⇒ 记下它的 mtime，仍按 §四 1.2 重跑一遍（保证同源） |
| ⑦ | `electron.exe` 在位 | present（最好） | absent ⇒ **允许继续**，但 **§四 1.2 要留意首次 `start` 的下载**；若卡住 ⇒ 见 §九 坑 3 |
| ⑧ | H-16 / H-17 有答复或明确挂起 | 有记录 | ⚠️ **不阻塞"机器判据"**，但**阻塞 A12 与结项** ⇒ 可先做 §四 2–4 步 |
| ⑨ | `??` = 72 | 72 | 差异需归因（本 Phase 会新增 `heb-p6/` 与截图 ⇒ 允许 +N 并记录） |

### 3.1 停止条件（**命中即停工**）

| # | 触发 | 为什么必须停 | 停工后做什么 |
|---|---|---|---|
| **S1** | 🔴 **前置 ⑤ 不满足**（没有可核对的备份） | 迁移**会移走**旧目录；没有备份就**没有回退** | **绝对不启动应用**；先备份（§四 1.1） |
| **S2** | `pnpm run build` **失败** | 产物拿不到 ⇒ 无从验证；且失败可能在 `check:main` / `check:preload`（P5 时是 0 错） | 停工；先看**失败在哪一步**（`check:*` 失败 = 🔴 与 P5 结论矛盾，须归因；`build:*` 失败 = 构建脚本问题） |
| **S3** | 🔴 **迁移返回 `failed`**（日志有 `用户数据目录整体迁移失败`），或应用以**全新空目录**启动 | **数据看似"没了"**（其实可能还在旧目录） | **立即停应用**；核对旧目录是否仍在（`find "$APPDATA/live2d-cyrene" -type f \| wc -l`）；从**备份**恢复（§八 R-3） |
| **S4** | 应用**起不来**（主窗口不出现 / 立刻退出 / 白屏且无窗口） | 后续 5 项验证全部无法进行 | 停工；先取**启动日志**（见 §四 1.3 的日志捕获方式）；按 §九 坑 3/4 归因 |
| **S5** | 🔴 **发现数据缺失**（`%APPDATA%\Cyrene` 的文件数 / 关键文件明显少于备份） | 属**数据级缺陷**（规范 §5.3：单独立项） | **停应用**；写**缺陷报告**；从备份恢复；**不许"凑合继续"** |
| **S6** | 发现**新的功能缺失**（某能力在界面上完全不存在，且 P5 静态结论说"应有"） | 属功能缺陷，不是流程问题 | **不擅自修**；登记缺陷报告 + BACKLOG；**继续验其余项**（不要因一项卡死整轮） |
| **S7** | 需要**产品取向判断**（"这个界面算不算对"） | agent 不得替人判断 | 记录**原始观察**（截图/文案），标注"**待人判断**"，**不要下结论** |
| **S8** | 任何步骤要求**改源码**才能继续验证 | 本 Phase 非目标明令不改源码 | 登记缺陷，**把该验证项标为"被缺陷阻塞"**，继续其余项 |

### 3.2 顺序纪律（**本 Phase 的顺序不能动**）

```text
⓪ 三项拍板收口（H-16/H-17，可并行）
   ↓
① 外部备份 %APPDATA%\live2d-cyrene  ──→ 核对文件数 5588
   ↓
② pnpm run build（重建 dist；自带 check:main / check:preload）
   ↓
③ 启动应用（pnpm start）──→ 🔴 观察迁移日志 + 核对 %APPDATA%\Cyrene
   ↓
④ 界面验证 H-10…H-14（人眼，逐项截图/记文案）
   ↓
⑤ 11 项功能基线界面级确认
   ↓
⑥ 收口提交（P4/P5/P6 文档 + 证据一次性入库）
   ↓
⑦ 结项交接清单（node_modules.bak / wip/* / 证据目录 / BACKLOG）
```

🔴 **三条不许颠倒的顺序**：
1. **备份 → 重建 → 启动**（备份在任何"会碰数据"的动作之前；重建在任何"看界面"之前）；
2. **迁移核对 → 界面验证**（若迁移就不对，界面验证的前提不成立）；
3. **验证 → 收口提交**（不要在结论还没出来时提交文档）。

---

## 四、改动清单（**人 + agent 协作执行**）

> 本 Phase **不改源码**。"改动清单"= **动作清单**：每一步都写清**谁做**、**做什么**、**做完能立刻判什么**。

### 4.0 三项拍板收口（**H-16 / H-17**）

```bash
# agent：把待拍板项的证据一次性摊开，供人决策（不要替人下结论）
cd /e/AI_Chating/cyrene-agent
echo "=== H-16：渠道 4 文件 ==="
for f in src/main/channels/conversation-binding-api.ts src/main/channels/conversation-binding-api.test.ts \
         src/renderer/react/features/chat/hooks/useChannelMirrorEvents.ts \
         src/renderer/react/features/chat/hooks/useChannelMirrorEvents.test.ts; do
  printf "  %-70s HEAD=%s\n" "$f" "$(git cat-file -e "HEAD:$f" 2>/dev/null && echo present || echo absent)"
done
echo "  当前引用数（合并树）：$(git grep -l 'conversation-binding-api\|useChannelMirrorEvents' HEAD -- src | wc -l)  ← 期望 0（删干净了）"
echo "  官方侧是否改过这 4 个文件：$(git rev-parse '8fe5ba7a:src/main/channels/conversation-binding-api.ts') vs $(git rev-parse 'b11b8851:src/main/channels/conversation-binding-api.ts')  ← 相同 = 官方没动过"
echo
echo "=== H-17：两个孤儿 ==="
for f in src/main/services/embedding/embedding-index-service.ts src/shared/usage-badge.ts; do
  printf "  %-60s 消费者=%s\n" "$f" "$(git grep -l "$(basename "${f%.ts}")" HEAD -- src | grep -v "$f" | grep -vc 'test' || true)"
done
echo "  ⚠️ USAGE_BADGE 的功能没丢：UsageBadge 组件仍被渲染 ⇒ 死的只是「设置项 → 徽章配色」的配置管道"
```

| 项 | 人的答复（三值之一） | agent 的动作 |
|---|---|---|
| **H-16** | `确认删除` / `恢复` / `暂不决定（挂起，写明去路）` | 前者 ⇒ 台账写"跟随我方 `598dfb75` 既有决策"并**闭合**；中者 ⇒ 登记一笔独立施工（补 `init.ts` / `ChatPage.tsx` 调用点）；后者 ⇒ 台账保持未闭合并写明去路 |
| **H-17** | `保留` / `删除` / `暂不决定` | 选删除 ⇒ **先确认无仓外/动态消费者**，再删除并留审计痕迹（**M6**），**独立一笔**；选保留 ⇒ 台账写"保留（能力已被官方取代）"并**闭合** |

> 🔴 **不许填"未知 / 待定 / TBD"**（规范 §4.1.3：终态三值 = `[x] 已闭合` / `⏳ 待人眼` / `🚫 无法验（缺 X）`）。

### 4.1 【人】外部备份用户数据（**唯一强制的人工前置动作**）

🔴 **P6 实测修正（务必照新写法）**：**不要在 Git Bash 里调 `robocopy`** —— MSYS 会改写路径参数
（`E:/AI_Work/...` 与 `/E` 被翻译）⇒ 实测报 `ERROR : Invalid Parameter #3 : "E:/"`、
中文目录显示为 `????`、**exit=16、备份文件数 = 0**。改用 **PowerShell 原生路径**（实测一次通过）。

```powershell
# 【推荐】PowerShell 原生路径；robocopy 支持断点续传
$old = Join-Path $env:APPDATA 'live2d-cyrene'
$bk  = 'E:\AI_Work\备份\cyrene-pre-P6-userdata-' + (Get-Date -Format 'yyyyMMdd-HHmm')
New-Item -ItemType Directory -Path $bk -Force | Out-Null
& robocopy.exe $old (Join-Path $bk 'live2d-cyrene') /E /NFL /NDL /NJH /R:1 /W:1
"robocopy exit = $LASTEXITCODE   (0-7 = 成功；>=8 = 有失败，必须查)"
# 🔴 核对：文件数必须一致（这是"备份有效"的唯一判据，不看"命令没报错"）
$s = (Get-ChildItem -LiteralPath $old -Recurse -File -Force).Count
$d = (Get-ChildItem -LiteralPath (Join-Path $bk 'live2d-cyrene') -Recurse -File -Force).Count
"源=$s  备份=$d  （必须相等，实测基准 5588）"
```

```bash
# 【仅用于核对，不用于调用 robocopy】文件数/体量核对
OLD="$APPDATA/live2d-cyrene"
BK="E:/AI_Work/备份/cyrene-pre-P6-userdata-<时间戳>"
echo "源   : $(find "$OLD" -type f 2>/dev/null | wc -l)"
echo "备份 : $(find "$BK/live2d-cyrene" -type f 2>/dev/null | wc -l)"
du -sh "$OLD" "$BK/live2d-cyrene"
```

| 判据 | 期望 | 不满足时 |
|---|---|---|
| `robocopy` 退出码 | **0–7** | ≥8 ⇒ 有文件失败 ⇒ **重跑**（robocopy 支持续传），直到 0–7 |
| **文件数相等** | 源 = 备份（实测源 **5588**） | 不等 ⇒ 重跑；**不等就不许启动应用**（S1） |
| 体量相当 | 源 ≈ 624 MB | 差很多 ⇒ 查是不是漏了子目录 |

> 🔴 **为什么必须人做**：这是**唯一不可逆动作的前置**，且**备份的价值只能由人承担后果**（规范 §4.1 纪律 3）。
> 📌 **agent 可以代跑命令，但"确认备份可用"必须由人签字**（台账里要留这一行）。

### 4.2 【agent】重建产物

```bash
cd /e/AI_Chating/cyrene-agent
mkdir -p .cyrene-merge-analysis/heb-p6
# 🔴 用应用级 node（v24.21.0）；engines 要求 node >=24 <25
export PATH="/e/AI_Chating/cyrene-agent/.node24:$PATH"
pnpm -v                     # 先探测（P5 复核已证伪"必坏"的旧结论）
pnpm run build 2>&1 | tee .cyrene-merge-analysis/heb-p6/build.log
echo "# [运行痕迹] pnpm run build  exit=$?  at=$(date '+%F %T')" >> .cyrene-merge-analysis/heb-p6/build.log
grep -E '# \[运行痕迹\]' .cyrene-merge-analysis/heb-p6/build.log
```

**`build` 会依次跑**（`package.json` 实测）：

```text
check:main → check:preload → build:main → build:preload → build:cli → build:renderer
```

| 判据 | 期望 | 不满足时 |
|---|---|---|
| `check:main` / `check:preload` | **0 错**（P5 实测 0） | 🔴 **S2**：与 P5 结论矛盾，须归因（是不是构建期改了 `tsconfig`？） |
| `build:main` / `build:preload` / `build:cli` / `build:renderer` | 全部成功 | 🔴 **S2** |
| `dist/main/main/index.js` 的 mtime | **晚于** merge commit（`2026-10-12 23:39`） | 没更新 ⇒ 构建脚本没跑或输出到别处 ⇒ 停下来查 |
| `dist/preload/preload/index.js` | **存在**（🔴 **P6 实测修正**：原文写 `dist/preload/index.js`，**该路径不存在**；`build:preload` 的 104 文件产物在 **`dist/preload/preload/`**，`dist/preload` 下共 **220** 文件） | absence ⇒ `build:preload` 没成功 |
| `dist/main/plugins` | 存在（`build:main` 会重造） | — |

### 4.3 【agent + 人】启动应用并核对迁移（**最危险的一步**）

```bash
cd /e/AI_Chating/cyrene-agent
# 🔴 启动前再确认一次备份（S1 的最后一道闸）
echo "源文件数: $(find "$APPDATA/live2d-cyrene" -type f 2>/dev/null | wc -l)  （应仍为 5588）"
echo "备份文件数: $(find "E:/AI_Work/备份"/cyrene-pre-P6-userdata-* -type f 2>/dev/null | wc -l)"

# 启动（前台跑，日志直接可见；**不要**后台跑 —— 看不到迁移日志就失去了唯一证据）
pnpm start 2>&1 | tee .cyrene-merge-analysis/heb-p6/run.log
```

**启动后立刻（30 秒内）要核对的四件事**：

| # | 核对 | 期望 | 命令 / 观察点 |
|---|---|---|---|
| 1 | **迁移日志** | `[Cyrene] 用户数据目录已整体迁移: …\live2d-cyrene -> …\Cyrene`（`renamed`）或 `…合并迁移完成（merged/partial）` | `grep -E '用户数据目录' .cyrene-merge-analysis/heb-p6/run.log` |
| 2 | 🔴 **兜底：** 若出现 `用户数据目录整体迁移失败` | ⇒ **S3 停工** | 同上 |
| 3 | **新目录出现** | `%APPDATA%\Cyrene` 存在；`%APPDATA%\live2d-cyrene` 视分支：`renamed` ⇒ **消失**；`merged` ⇒ 可能剩空壳或残留 | `ls -d "$APPDATA/Cyrene" "$APPDATA/live2d-cyrene" 2>&1` |
| 4 | **新目录里的数据量** | 与备份**同量级**（≈624 MB / 5588 文件，允许 ±少量运行时文件） | `find "$APPDATA/Cyrene" -type f \| wc -l` · `du -sh "$APPDATA/Cyrene"` |

🔴 **若第 3 项显示 Electron 用了 `cyrene-agent` 而不是 `Cyrene`**：**也接受**（那是 `name` 分支），
但**必须记录实际目录名**（它决定后续所有"找数据"的动作），并核对数据量同样到位。

**关键数据文件抽查**（挑 3 个"一看就知道是不是真数据"的）：

```bash
# 🔴 P6 实测修正：原文给的是 "memory-store.json" "general.json"，**这两个文件都不存在**。
#    真实设置文件名：app-settings.json / memory.json / model-settings.json /
#    conversation-usage.json / token-usage.json / timeout-settings.json / channels-settings.json
for p in "channels/context-bindings.json" "app-settings.json" "memory.json" "model-settings.json" "conversation-usage.json" "token-usage.json" "timeout-settings.json"; do
  printf "  %-40s %s\n" "$p" "$(find "$APPDATA/Cyrene" -name "$(basename "$p")" 2>/dev/null | head -1)"
done
# 另：群语料 / transcripts 目录是否存在（H-14 的观察对象）
ls "$APPDATA/Cyrene/channels" "$APPDATA/Cyrene/transcripts" 2>/dev/null | head
```

### 4.4 【人】界面验证（**H-10 … H-14，逐项**）

> 编号与台账 `H-nn` **一一对应**；每项都要**记录"点哪里 → 看到什么"**（截图或文案），
> **文案从界面/`zh-CN.json` 逐字粘贴**（经验 **F21**：不要让执行者凭记忆复述 UI 文案）。

#### ① H-10 · 附件文档链端到端（**本次最关键**）

| 步 | 做什么 | 期望 | 若不符 |
|---|---|---|---|
| 1 | 在聊天里找**上传/添加文档**的入口 | 找得到入口 | 🔴 **找不到 ⇒ 这就是 A56 在界面上的体现**（P5 已确认 3 个桥方法的 renderer 命中 = 0）⇒ 记录"H-10 被 A56 阻塞"，**不要因此判合并失败** —— 它有独立去路（见下） |
| 2 | 上传一个**只有它才含某信息**的文档（对照物**必须非空**，经验 **D33**） | 上传成功、有进度/状态反馈 | 记缺陷 |
| 3 | 提问那个"只有该文档才答得出"的问题 | **模型答得出**（引用该文档内容） | 记缺陷（区分"没召回"与"召回了没说"） |
| 4 | 删除刚上传的文档 | 能删、且后续不再召回 | 记缺陷 |

> 🔴 **H-10 的两种可能结论（都写清，不要含糊）**：
> **A · 有入口且能答** ⇒ H-10 **通过**（`[x]`），并在报告里写"附件链在界面层可达"；
> **B · 界面上找不到入口** ⇒ H-10 **被 A56 阻塞** ⇒ 台账终态写 **`⏳ 待人判定`** + 去路 = **一笔独立施工（补渲染端调用点）**，
> **并明确它不影响"合并保真"的结论**（源码层与 IPC 层都是好的：IPC 契约 8/8、7 个文件恢复到位）。

#### ② H-11 · 5 项"能力在、入口没了"逐项看入口

| # | 能力 | **点哪里**（导航/分区 id） | **应看到什么**（i18n 文案，逐字粘贴） |
|---|---|---|---|
| 1 | `memory-console` 记忆管理控制台 | 设置页 → **记忆**（`settingsPage.memory.title` = **记忆**） | 记忆管理区（列表 / 查询 / 删除 / 按人擦除） |
| 2 | `ZONES_` 区块 | 设置页 → **区块**（`settingsPage.zones.title` = **区块**） | 区块列表与白名单配置（57 个 i18n 键构成的界面） |
| 3 | `keyword-policy` 关键词策略 | 渠道/群相关设置里的**关键词**分区 | 关键词策略配置 |
| 4 | `USAGE_BADGE` 用量徽章 | **聊天页导航栏**（`ChatPageNavigation`） | 🔴 **徽章本身应该在**（组件被 `ChatPageNavigation.tsx:121` 渲染）；**但"设置项 → 徽章配色"的管道已死**（`usage-badge.ts` 孤儿）⇒ 记录"徽章在，配色不可配" |
| 5 | `groupContextLimit` 群上下文上限 | 设置页 → **记忆** → 危险区/群聊上下文条数 | 可调节的条数输入（默认 **10**，范围 **3–50**；实测边界用例 8 条） |

#### ③ H-12 · 设置页全部面板逐个打开

| # | 面板 | 导航标签（实测 i18n 键 → 中文） | 打开后要确认 |
|---|---|---|---|
| 1 | 通用 | `settingsPage.general.title` | 正常渲染 |
| 2 | 外观 | `settingsPage.appearance` | 正常渲染 |
| 3 | 偏好 | `settingsPage.preferencesLabel` | 正常渲染 |
| 4 | 模型 | `settingsPage.modelSettings.title` | 正常渲染 |
| 5 | 用量 | `settingsPage.usage.title` | 正常渲染 |
| 6 | **浏览器控制**（官方新增） | `settingsPage.browserControl.navLabel`（🔴 **不是** `settingsPage.browser.*`） | 面板出现、可交互 |
| 7 | **区块**（我方） | `settingsPage.zones.title` = **区块** | 面板出现 |
| 8 | **知识库**（官方新增） | `settingsPage.knowledgeBase.title` = **知识库** | 面板出现（资料集 / 添加文件 / 添加文件夹） |
| 9 | **子代理**（官方新增） | `settingsPage.subagents.title` = **子代理** | 面板出现（16 个 i18n 键） |
| 10 | **记忆** | `settingsPage.memory.title` = **记忆** | 面板出现（230 个 i18n 键） |
| 11 | **插件 / 维基等其余面板** | 按实际导航逐项点 | 逐个记录 |

> 📌 **日语缺口（已拍板）**：`ja-JP` 缺 **377** 键 ⇒ **日语界面的部分文案会回退中文**。
> 这是**已登记的产品决定**（P3 拍板"不补翻译 + 单向收紧"），**不是缺陷** ⇒ 记录观察，**不要报缺陷**。

#### ④ H-13 · 记忆模式 × 本地域过滤（**本 Phase 最大的语义验证点**）

| 步 | 做什么 | 期望 |
|---|---|---|
| 1 | 设置 → 记忆 → 把**记忆模式**依次切到 `vector` / `summary` / `wiki` / `off` | 每种模式都能切、界面有反馈 |
| 2 | 在 `vector` 下问一个**只存在桌面私聊记忆**里的问题 | 答得出（域内召回） |
| 3 | **在群聊里**问同一个问题 | 🔴 **不应捞出桌面私聊记忆**（域隔离：`scopeId`） |
| 4 | 切到 **`off`** 后：问附件文档里的问题 | 🔴 观察**附件召回**是否仍符合预期（这正是"官方开关 × 我方域过滤"的**并集处置点**） |
| 5 | 切到 `off` 后：群聊里问私聊记忆 | 预期：**答不出**（记忆关掉了）且**不越域** |
| 6 | 切回 `vector` | 恢复到步 2 的行为 |

> 🔴 **这一项的判据是"行为符合预期"，不是"某个数字"** ⇒ 属**人的判断**（S7）；
> **agent 只记录原始观察**（哪一步、看到什么），**不替人下结论**。

#### ⑤ H-14 · 真实渠道（QQ / NapCat）

| 步 | 做什么 | 期望 |
|---|---|---|
| 1 | 检查是否具备**真实渠道接入**（NapCat / QQ 账号在线） | 具备 ⇒ 继续；**不具备 ⇒ 台账终态写 `🚫 无法验（缺 真实渠道）`**（🔴 **不要填 ❌**） |
| 2 | 若具备：在群里发几条消息（含被 @ 的） | 群语料进库、旁听上下文生效（`buildGroupContextBlock`） |
| 3 | 触发一次**群聊提问** | 模型能用旁听上下文回答（这正是 11 项基线里"群聊旁听上下文"的运行期形态） |

### 4.5 【人 + agent】11 项功能基线**界面级**确认

> P3/P4/P5 的 11 项都是**文件级/计数级**结论。本步把它们升级为**界面级**：**每一项都能指到"点哪里、看到什么"**。

| # | 能力 | 界面确认方式 | 前序阶段给的静态结论 |
|---|---|---|---|
| 1 | 记忆管理控制台 `memory-console` | H-11 ① 同一步 | 7 文件（基 4） |
| 2 | 按人擦除 / 身份归属 `person-erasure` | 记忆面板里的**擦除流程**（预览 → 确认） | 8 文件（基 8） |
| 3 | 区块 zones `ZONES_` | H-11 ② 同一步 | 5 文件（基 5） |
| 4 | 渠道审计 `audit-log` | 渠道/工具控制台里的**审计视图** | 🔴 **P5 已转录 `H-11`**："审计视图该在哪、是否完整"是产品判断 |
| 5 | 工具白名单 `tool-access` | 工具控制台 / 工具面板 | 13 文件（基 13） |
| 6 | 关键词策略 `keyword-policy` | H-11 ③ 同一步 | 9 文件（基 6） |
| 7 | 群语料 `group-corpus` | 记忆面板里的**语料**分区 | 🔴 **P5 已转录 `H-11`**（同 4） |
| 8 | 群聊旁听上下文 `buildGroupContextBlock` | **纯后端能力、无需 UI**；用**群聊场景**间接验证（H-14 步 3） | 5 文件（基 4）；单测 10 passed |
| 9 | 用量徽章 `USAGE_BADGE` | H-11 ④ 同一步 | 2 文件（基 2） |
| 10 | 群上下文上限 `groupContextLimit` | H-11 ⑤ 同一步 | 9 文件（**基线列 11 是过期值**） |
| 11 | 弹窗确认门 `confirmValue` | 删除全部记忆时的**强确认短语**（`isDeleteAllConfirmed`） | 🔴 **`confirmValue` 是旧壳内部名**；新壳是**输入确认短语**（更强的确认门） |

> 🔴 **第 4 / 7 项是"产品判断"**（P5 已转录 H-11）⇒ 记录观察 + 标注"待人判定"，**不猜**。

### 4.6 【agent】收口提交（**把 5 个 Phase 的文档债务一次清掉**）

> **为什么现在才提交**：P4 之后**每个 Phase 的文档都只活在"工作区 + `wip/*` 快照"里** —— 这是**有意的**（M7 + 规范 §三"每 Phase 单独提交"）。
> 到 P6，**施工全部结束**，可以一次性入库。**这也让 `HEAD` 前进到"合并已完成"的干净状态**。

```bash
cd /e/AI_Chating/cyrene-agent
# 逐条 add + 必须写 --（经验 C30 / C49：数组 + 未入库路径会让整条 add 静默失败）
D='docs/construction/HEB-1.3.0/TASK-H1.3.0'; M='docs/construction/HEB-1.3.0/methodology'
DOCS=(
  "$D/BLUEPRINT-总蓝图.md" "$D/HUMAN-人工验证台账.md" "$D/BACKLOG-长期待办.md"
  "$D/PHASE-0-提交收口与锚点.md" "$D/PHASE-0-完成报告.md"
  "$D/PHASE-1-工具链升级.md" "$D/PHASE-1-完成报告.md"
  "$D/PHASE-2-冲突消解-删改类.md" "$D/PHASE-2-完成报告.md"
  "$D/PHASE-3-冲突消解-真冲突类.md" "$D/PHASE-3-完成报告.md"
  "$D/PHASE-4-合并收口提交.md" "$D/PHASE-4-完成报告.md"
  "$D/PHASE-5-依赖安装销账与保真核验.md" "$D/PHASE-5-完成报告.md"
  "$D/PHASE-6-运行期验证与收口.md" "$D/PHASE-6-完成报告.md"
  "$M/BLUEPRINT-经验库-通用.md" "$M/BLUEPRINT-经验库-具体坑.md" "$M/BLUEPRINT-经验库-全量台账.md"
  "$M/BLUEPRINT-撰写规范.md" "$M/BLUEPRINT-回写规范与清单模板.md" "$M/_先读这份-READ-FIRST.md"
  "$M/模板-总蓝图.md" "$M/模板-施工蓝图.md" "$M/模板-完成报告.md"
)
for f in "${DOCS[@]}"; do [ -f "$f" ] && git add -- "$f"; done
git status --porcelain -- docs/construction/          # 逐条确认 staged 了什么
git diff --cached --name-only -- docs/construction/   # 🔴 若出现 src/ 就停下来查
```

**提交信息**（写文件 + `-F`）：

```text
docs(P5–P6): 保真核验与运行期验证收口 —— 文档入库

- P5：依赖安装销账（pnpm install --frozen-lockfile exit=0；锁文件三处 blob 全等）
  + 四层保真核验（文件层 94=91+3 / 符号层 25/25 与全仓扫描 0 / 入口层 11 项 / 桥接层契约 8 passed）
  + 撰写者复核补正（§十四）+ 判据 J-26
- P6：运行期人工验证（H-10…H-14 + 11 项功能基线界面级确认）+ 三项拍板收口
- 判据台账 J-01…J-26 连续；经验库与模板同步

已知未闭合（不属本次合并的缺陷）：class-name-contract 既有欠账、ja-JP 377 键（已拍板登记）。
```

| 判据 | 期望 | 不满足时 |
|---|---|---|
| staged 列表**只含 `docs/construction/**`** | `src/` 命中 = **0** | 🔴 停下；`git restore --staged <意外项>` |
| 提交后 `git status --porcelain -- src` | **空** | 有改动 ⇒ 有东西被误带进提交 |
| `HEAD` 前进 | 新的提交（`HEAD^` = `8ad59939` 或当时的上一笔） | — |

### 4.7 【agent】结项交接清单（**每项写明"谁删/何时删"**）

| 对象 | 现状 | 建议 | 依据 |
|---|---|---|---|
| `node_modules.bak`（**132037 文件 / 2.4 GB**） | 仍在 | **等 P6 全部验证通过后再删**（它是依赖级回退点；R-1 实测可用） | §八 R-1 |
| `wip/p2-docs` · `wip/p3-docs` · `wip/p4-docs` · `wip/p4-review` · `wip/p5-docs` · `wip/p5-review` | 6 个 | 内容均已入库 ⇒ **可删**（P4 §十二 12.5 已论证"无唯一内容"） | 建议结项统一删 |
| `wip/p3-src`（**P3 出口索引镜像**） | 1 个 | 核验参照物；P6 结束后使命完成 ⇒ **可删** | P5 §十 |
| `p4-pre-commit`（= `9920635f`） | 1 个 | 回退到"合并前"的一键保险 ⇒ **建议留到结项后** | P4 §十二 11.10 |
| `.cyrene-merge-analysis/heb-p{2,3,4,5,6}/` + `heb-review-p{2,3}` + `heb-p3-blueprint` | **7 个未跟踪目录** | 入库需改 `.gitignore`（计划外扩张）⇒ **结项统一决定**；若不入库则**归档到备份盘** | P5 §七 |
| `docs/design` 41 · `docs/internal-issue` 15 · `docs/refactor` 6（**B-01**） | 62 条未跟踪 | **BACKLOG B-01** 决定（补白名单 or 移出仓库） | BACKLOG |
| `class-name-contract` 3 个未定义类名 | 既有欠账 | 独立判断（修 CSS or 收紧欠账清单） | P3/P5 已归因 |
| `ja-JP` 377 键 | 已拍板 | 保持登记（"增加即失败、减少要同步下调"） | P3 拍板 |

---

## 五、人工环节 ★

> 🔴 **本 Phase 与前五个不同：它本身就是一个人工环节**。
> 因此这里要写清**谁做什么**、**哪些步骤 agent 不许代做**、**结果怎么落台账**。

### 5.1 H-A 阻塞性拍板（**本 Phase 要收口的两项**）

| # | 拍板项 | 台账编号 | 三值终态 | agent 的边界 |
|---|---|---|---|---|
| 1 | **渠道 4 文件**：确认删除 or 恢复 | **H-16** | `[x] 已闭合` / `⏳ 待人眼` / `🚫 无法验` | agent **只摊开证据**（§四 4.0），**不许替人下结论**；选"恢复"⇒ 登记独立施工 |
| 2 | **两个孤儿模块**：保留 or 删除 | **H-17** | 同上 | 同上；选"删除"⇒ **先确认无仓外/动态消费者**（**M6** 留痕） |

> 🔴 台账 §5.2 明写这两项"**P6 前必须收口**" ⇒ **它们是本 Phase 的开工前置之一**（但**不阻塞** §四 4.2–4.5 的机器与界面验证）。

### 5.2 H-B 完工评审（**本 Phase 的核心人工工作**）

| 编号 | 评审动作 | 谁做 | 结果落哪 | 不许怎么做 |
|---|---|---|---|---|
| **H-10** | 附件链端到端（上传 → 提问 → 答出） | **人** | 台账 `H-10` 的答复列 + 报告 §五 | 不许"因为源码在就算过" |
| **H-11** | 5 项入口逐项看 | **人** | 同上（每项给"点哪里 → 看到什么"） | 不许凭记忆复述文案（**F21**） |
| **H-12** | 设置页面板逐个打开 | **人** | 同上 | 不许跳过官方新增的 3 个面板 |
| **H-13** | 记忆模式 × 域过滤共存 | **人** | 同上 | 🔴 **不许 agent 替人判"行为符合预期"**（S7） |
| **H-14** | 真实渠道 | **人** | 同上；缺渠道 ⇒ `🚫 无法验（缺 真实渠道）` | 不许填 ❌ |
| **11 项基线** | 界面级确认 | **人**（第 4/7 项是产品判断） | 报告 §五 表 | 不许把"文件在"当"界面在" |
| 🔴 **数据核对** | **迁移后数据量与备份一致** | **人**（签字） | 报告 §五 + 台账 | 不许只看"命令没报错" |

### 5.3 H-C 待验项登记（本 Phase 之后**还剩什么**）

**本 Phase 预期不改任何 `H-nn` 的编号，只改状态**：

| 编号 | P6 结束时的可能终态 | 依据 |
|---|---|---|
| `H-10` | `[x] 已闭合`（有入口且能答）**或** `⏳ 待人判定`（A56 阻塞 ⇒ 独立施工） | §四 4.4 ① |
| `H-11` | `[x] 已闭合`（5 项都看到入口）**或** 部分项转 `⏳`（第 4/7 项属产品判断） | §四 4.4 ② + 4.5 |
| `H-12` | `[x] 已闭合`（面板逐个打开） | §四 4.4 ③ |
| `H-13` | `[x] 已闭合`**或** `⏳ 待人判定` | §四 4.4 ④ |
| `H-14` | `[x] 已闭合`**或** `🚫 无法验（缺 真实渠道）` | §四 4.4 ⑤ |
| `H-16` / `H-17` | `[x] 已闭合`（人已答）**或** `⏳ 待人眼`（挂起 + 去路） | §四 4.0 |
| `H-15` | **保持** `✅ 已闭合（P5 销账）` | P5 |

> 📌 **唯一真值在 `HUMAN-人工验证台账.md`**；本节**只给索引、不复制结论**。
> 🔴 **终态三值**：`[x] 已闭合` / `⏳ 待人眼` / `🚫 无法验（缺 X）` —— **禁止"未知/待定/TBD"**（规范 §4.1.3）。

---

## 六、验收测试

> **本 Phase 的判据分两类**：**机器判据（A1–A5、A13）** 与 **人工判据（A6–A12）**。
> 机器判据由 agent 跑并留痕（**J-23**）；人工判据由人给结论、agent 记录原话与截图。

### 机器判据

#### A1 · 🔴 数据备份有效（**唯一不可逆动作的前置**）

```bash
OLD="$APPDATA/live2d-cyrene"; BK=$(ls -d "E:/AI_Work/备份"/cyrene-pre-P6-userdata-* 2>/dev/null | head -1)
echo "源   : $(find "$OLD" -type f 2>/dev/null | wc -l) 文件"
echo "备份 : $(find "$BK/live2d-cyrene" -type f 2>/dev/null | wc -l) 文件"
du -sh "$OLD" "$BK/live2d-cyrene" 2>/dev/null
```

| 期望 | 失败处置 |
|---|---|
| 文件数**相等**（基准 **5588**）· 体量相当（≈624 MB）· `robocopy` 退出码 0–7 | 🔴 **S1：不许启动应用**（重跑 robocopy 直到 0–7 且文件数相等） |

#### A2 · `pnpm run build` 成功且产物新鲜

```bash
f=.cyrene-merge-analysis/heb-p6/build.log
grep -E '# \[运行痕迹\]' "$f"                       # 期望：exit=0 那行在
echo "merge : $(git log -1 --format=%ci 9cceeeac)"
stat -c '%y  %n' dist/main/main/index.js dist/preload/preload/index.js
# 🔴 P6 实测修正：原文写 dist/preload/index.js，该路径不存在。
#    另：dist/ **目录**的 mtime 重写子目录时不会更新（实测重建后仍为 2026-09-19）
#    ⇒ 新鲜度一律按**具体产物文件**判断，不要看 dist/ 本身。
```

| 期望 | 失败处置 |
|---|---|
| 痕迹行 **`exit=0`** | 🔴 **S2**（先看是 `check:*` 还是 `build:*` 失败） |
| `dist/main/main/index.js` mtime **晚于** merge（`2026-10-12 23:39`） | 没更新 ⇒ 构建没生效 ⇒ 停工查输出路径 |
| `dist/preload/preload/index.js` 存在（🔴 路径已修正，见上） | absence ⇒ `build:preload` 失败 |

#### A3 · 应用启动 & 迁移状态

```bash
grep -E '用户数据目录|Cyrene' .cyrene-merge-analysis/heb-p6/run.log | head -6
```

| 期望 | 失败处置 |
|---|---|
| 出现 `已整体迁移: …live2d-cyrene -> …Cyrene`（`renamed`）或 `合并迁移完成（merged/partial）` | 🔴 **S3 停工**；核对旧目录是否仍在；从备份恢复（§八 R-3） |
| 主窗口出现 | 🔴 **S4 停工**；取启动日志（§九 坑 3/4） |

#### A4 · 迁移后数据核对（**人签字**）

```bash
NEW="$APPDATA/Cyrene"; [ -d "$NEW" ] || NEW="$APPDATA/cyrene-agent"
echo "实际新目录 = $NEW"
echo "文件数: 源备份=$(find "$BK/live2d-cyrene" -type f | wc -l)  新目录=$(find "$NEW" -type f | wc -l)"
du -sh "$NEW"
```

| 期望 | 失败处置 |
|---|---|
| 新目录文件数与备份**同量级**（允许少量运行时新增：`lockfile` / `Singleton*` / 缓存） | 🔴 **S5**：写**缺陷报告** + 从备份恢复；**不许凑合继续** |
| 抽查关键文件都在（🔴 **P6 实测修正**：原判据给的 `memory-store.json` / `general.json` **均不存在**，改用真实名 `app-settings.json` / `memory.json` / `model-settings.json` / `conversation-usage.json` / `token-usage.json` / `timeout-settings.json` ＋ `channels/context-bindings.json`，共 **7** 个） | 缺 ⇒ 同上 |

> 🔴 **注意**：迁移**会丢弃旧目录的运行时文件**（`lockfile` / `SingletonLock` / `SingletonSocket` / `SingletonCookie`），
> 这是**设计行为**（`user-data-migration.ts` 的 `RUNTIME_FILE_NAMES`）⇒ **它们的缺失不算失败**。

#### A5 · 运行期无致命报错

```bash
grep -inE 'uncaught|unhandled|FATAL|Error:.*Cannot find|MODULE_NOT_FOUND' .cyrene-merge-analysis/heb-p6/run.log | head -20
```

| 期望 | 失败处置 |
|---|---|
| **无** `MODULE_NOT_FOUND` / `Cannot find module` / unhandled rejection | 有 ⇒ 可能是缺包或路径问题 ⇒ 记缺陷；**区分"启动期致命"与"某功能内部报错"**（后者不阻塞其余验证） |

### 人工判据（**每项都要"点哪里 → 看到什么"**）

#### A6 · **H-10** 附件链端到端

| 期望 | 失败处置 |
|---|---|
| 有上传入口 ∧ 上传成功 ∧ 提问能答出 ∧ 能删除 | 无上传入口 ⇒ **A56 阻塞** ⇒ 终态 `⏳ 待人判定` + 去路（独立施工），**并在报告里写明它不影响"合并保真"结论** |

#### A7 · **H-11** 5 项入口

| 期望 | 失败处置 |
|---|---|
| 5 项**都能指到"点哪里"** | 指不到 ⇒ 记原始观察 + 标"待人判定"（**不许猜**） |

#### A8 · **H-12** 设置页面板

| 期望 | 失败处置 |
|---|---|
| 11 个面板（含官方新增 3 个）**逐个打开无白屏/无报错** | 白屏 ⇒ 记缺陷；**日语部分文案回退中文不算缺陷**（已拍板） |

#### A9 · **H-13** 记忆模式 × 域过滤

| 期望 | 失败处置 |
|---|---|
| 6 个步骤的行为**符合 §四 4.4 ④ 的表** | 不符 ⇒ 记原始观察（哪一步、看到什么），**由人判"是否缺陷"**（S7） |

#### A10 · **H-14** 真实渠道

| 期望 | 失败处置 |
|---|---|
| 有渠道 ⇒ 群语料 + 旁听上下文生效；无渠道 ⇒ **`🚫 无法验（缺 真实渠道）`** | 🔴 **不许填 ❌**（缺前提 ≠ 失败） |

#### A11 · 11 项基线界面级确认

| 期望 | 失败处置 |
|---|---|
| 每项都能归入：`界面可达` / `纯后端（无需 UI）` / `属产品判断（待人判定）` | 出现"应当有但完全找不到" ⇒ 记缺陷（S6） |

#### A12 · 两项拍板收口

| 期望 | 失败处置 |
|---|---|
| `H-16` / `H-17` **各有明确终态** | 仍是"待定" ⇒ **不许结项**（规范 §4.1.2 终态三值） |

#### A13 · 收口提交（**机器判据**）

```bash
git log --oneline -3
git status --porcelain -- src | wc -l                       # 期望 0
git diff --name-only HEAD~1 HEAD -- src/ | wc -l            # 期望 0（提交不碰源码）
git status --porcelain | grep -vc '^??'                     # 期望 0（文档全部入库）
```

| 期望 | 失败处置 |
|---|---|
| 提交只含 `docs/construction/**`；`src/` 命中 **0**；提交后无未提交的 tracked 改动 | 有 `src` ⇒ 回到 §四 4.6 重做 |

---

## 七、产出物清单

| 文件 / 对象 | 内容 | 谁产出 |
|---|---|---|
| **P6 收口提交**（git） | 5 个 Phase 的文档债务一次清掉 | agent |
| `.cyrene-merge-analysis/heb-p6/build.log` | 重建输出 + **`exit=` 运行痕迹** | agent |
| `.cyrene-merge-analysis/heb-p6/run.log` | **应用启动日志**（含迁移状态 —— 数据面唯一证据） | agent |
| `.cyrene-merge-analysis/heb-p6/userdata-check.txt` | 备份 vs 新目录的文件数/体量/抽查结果（**人签字**） | agent + 人 |
| `.cyrene-merge-analysis/heb-p6/ui-verification.md` | **H-10…H-14 + 11 项基线**的逐项记录（"点哪里 → 看到什么" + 截图名） | 人 + agent |
| `.cyrene-merge-analysis/heb-p6/screenshots/`（可选） | 界面截图（每项 1–2 张） | 人 |
| `PHASE-6-完成报告.md` | 完成报告（10 节 + §十一 施工记录 + **§十二 撰写者复核补正待填**） | agent |
| （若发现数据/功能缺陷）**缺陷报告** | 独立成文（规范 §3.2 命名表内有此类型） | agent |

> 📌 **证据目录入库**：`.cyrene-merge-analysis/heb-p6/**` 与其余 7 个证据目录**一并由结项决定**
> （入库需改 `.gitignore`，属计划外扩张 ⇒ **本 Phase 不改**）。

---

## 八、回退方法（**分级；每条写清代价与验证**）

| 级别 | 动作 | 适用 | 代价 | 怎么验成功 |
|---|---|---|---|---|
| **R-1 · 回退依赖树** | `rm -rf node_modules && mv node_modules.bak node_modules` | 重建/启动失败且怀疑依赖 | **秒级**（同分区 rename） | `find node_modules -type f \| wc -l` = **132037**；`node -e "require('typescript/package.json').version"` = **5.9.3** |
| **R-2 · 回退产物** | 删掉新 `dist/` 后 `git checkout <某旧提交> -- dist`（或直接在旧提交上重建） | 新产物跑不起来、想对照旧产物 | 需重建 | `git status --porcelain dist` 干净；旧产物 mtime 恢复 |
| 🔴 **R-3 · 回退用户数据**（**数据面唯一回退**） | ① 停应用；② `rm -rf "$APPDATA/Cyrene"`；③ `robocopy <备份>/live2d-cyrene "$APPDATA/live2d-cyrene" /E` | 迁移结果不对 / 数据缺失 | **数分钟 + 必须停应用** | 文件数回到 **5588**；`%APPDATA\Cyrene` 不再存在（或已删） |
| **R-4 · 回退文档提交** | `git reset --soft HEAD~1` | 提交信息写错 | 无内容损失 | `git log --oneline -1` 回到 `8ad59939` |
| **R-5 · 回退到某个 Phase 的文档快照** | `git checkout wip/p4-review -- docs/construction/` 等 | 文档被误改 | 无 | `git diff wip/<ref> -- docs/construction/` 为空 |
| **R-6 · 回退到合并前** | `git reset --hard p4-pre-commit`（= `9920635f`） | 整个合并要重做 | 🔴 **极端**：丢失 merge commit 之后的一切（**但 `wip/*` 与备份都还在**） | `git rev-parse HEAD` = `9920635f` |
| **R-7 · 应用层"重启大法"** | 退出应用 → 重跑 `pnpm start` | 单次启动偶发（如首次下载 electron 二进制） | 秒级 | 日志里出现迁移**已完成**的状态（第二次启动应为 `skipped` 或 `none`） |

> 🔴 **五条禁令（继承 P2–P5）**：① **不 `git clean`**（72 条 `??` 含 B-01 与 7 个证据目录）· ② **不 `stash`** · ③ **不 `merge --abort`**（合并早已结束）· ④ **不删 `wip/*` / `p4-pre-commit`**（核验参照物）· ⑤ **不删 `node_modules.bak`**（依赖级回退点）。
> 🔴 **本 Phase 新增两条**：
> **⑥ 不在没有可核对备份的情况下启动应用**（S1）· **⑦ 不在应用运行时操作 `%APPDATA%`**（会锁文件 / 半途改名 ⇒ 先退出应用）。

---

## 九、已知坑（本 Phase 相关 + 复现情况）

> 按 H/M/L 检索自 [BLUEPRINT-经验库-通用.md](../methodology/BLUEPRINT-经验库-通用.md) 与
> [BLUEPRINT-经验库-具体坑.md](../methodology/BLUEPRINT-经验库-具体坑.md)。

| # | 坑（键号） | 本 Phase 的风险点 | **规避写法（直接照做）** |
|---|---|---|---|
| 1 | 🔴 **"不做基线就动手" / "不可逆动作先备份"**（**A51**） | 迁移**会移走**旧目录；没有备份就没有回退 | §四 4.1 **先备份 + 核对文件数**；**核对不通过不许启动**（S1） |
| 2 | 🔴 **"对照物必须非空"**（**D33**） | H-10 要问"只有该文档才答得出的问题"；若文档本身空/无特有信息，**判据毫无意义** | 上传前**先确认该文档含一段独有文本**，并把那段文本抄进报告 |
| 3 | **`electron@44` 无 `postinstall`，二进制懒下载**（**E10 / X20**） | 首次 `pnpm start` 可能**卡在下载**或报找不到 `electron.exe` | 启动前 `ls node_modules/electron/dist/electron.exe`；**缺就先联网跑一次**（或接受首次启动慢）；**不要**因此去改 `pnpm-workspace.yaml` 的白名单 |
| 4 | **"命令成功 ≠ 事情做对了"**（**C49**） | 迁移日志说 `renamed` **不等于**数据真的搬全了 | **必须做 A4**（文件数与体量核对），**不能只看日志** |
| 5 | 🔴 **"全绿"必须自带运行痕迹**（**J-23**） | `build.log` / `run.log` 若只看"命令跑完了" | ✅ **`exit=` 写进同一日志**；引用绿格时**引用痕迹行** |
| 6 | **计数与标签要能被成员支持**（**J-26**，P5 复核新增） | "界面验证通过"若写成"全部 OK"，会掩盖"属产品判断"的项 | 逐项三值化：`界面可达` / `纯后端` / `待人判定` |
| 7 | **不要引用会移动的 `HEAD`**（**J-25**） | 报告里写 `HEAD = xxx` 会在收口提交后失效 | 固定点用 **`9cceeeac`**；`HEAD` 写"角色名 + 现取命令" |
| 8 | **工具链与环境结论会过期**（**J-19**） | 照抄 P3 的"系统 pnpm 已损坏" | **先探测**（`pnpm -v`）；P5 复核已证伪该结论 |
| 9 | **PowerShell / bash 混用 + CRLF**（**C43** + P5 复核实测） | 在本仓（`core.autocrlf=true`）用只认 `\n` 的字符串判断会**静默失败** | 读写文本一律 `split(/\r?\n/)` 且**写回保留原 EOL** |
| 10 | **非 ASCII 路径**（规范 §2.1） | 截图/日志文件名含中文时容易被工具吞掉 | 遍历用 `git ls-files` / `ls-tree -z`；备份用 `robocopy` |
| 11 | **表格里的裸管道符撑破单元格**（**C39 / C40**） | 本蓝图若把命令塞进表格会撑破 | 代码一律放**代码块**（本蓝图已遵守） |
| 12 | **两个变更源不叠加**（规范 §4.1.3 硬要求 5） | 若 P6 顺手改源码 ⇒ "界面不对"就无法归因（是合并的错还是新改的错） | 🔴 **本 Phase 不改任何源码**；发现问题**登记**（S6/S8） |

### 本 Phase **预计会新出现**的两条（建议入经验库，见 §十一 T4）

| 新坑 | 一句话 | 建议级 |
|---|---|---|
| **"静态全绿"与"运行期可用"之间有一道无人的鸿沟** | P2–P5 把**文件级/符号级/入口级/契约级**全部验到了，但**没有一次启动过应用** ⇒ 一个"四层全绿却起不来"的合并会一路通过到 P6。**判据形态**：任何"合并/迁移/升级"类任务，**必须在早期就排一次"能不能启动"的烟测**，不要留到最后 | **H** |
| **首次启动可能夹带不可逆的数据迁移，而它不在任何"代码判据"的视野里** | `tsc` 绿、契约测试绿、四层核验绿 —— **都看不见 `fs.renameSync(%APPDATA%…)`**。**判据形态**：凡"改包名/改 productName/换框架大版本"的合并，**必须**在计划里显式列出"**数据目录会变**"并把它排成**人工前置步骤**（先备份） | **H** |

---

## 十、给结项（收尾）的交接提示

1. 🔴 **结项前必须 0 项待拍板**：`H-16` / `H-17` **必须有终态**（本 Phase 的 A12）。
2. 🔴 **`H-10` / `H-11` / `H-13` 若留 `⏳ 待人判定`** ⇒ 结项要写明**去路**（独立施工 or BACKLOG），**不许留悬空**。
3. 🔴 **数据面**：迁移已发生（`%APPDATA%\live2d-cyrene` → `%APPDATA%\Cyrene` 或 `cyrene-agent`）。
   ⇒ **备份目录要保留一段时间**（至少到"用户确认新版本一切正常"）；**不要**在 P6 结束就删备份。
4. ⚠️ **可回收清单**（逐项判断，**不要一把 clean**）：`node_modules.bak`（132037 文件）· 6 个 `wip/*` + `wip/p3-src` · `p4-pre-commit` · 7 个证据目录 · 62 条 B-01 遗留。
5. ⚠️ **`BACKLOG-长期待办.md` 要更新**：B-01（3 个 `docs/` 目录）· B-02（2.1 MB perf json）· B-03（陈旧镜像）· B-05（`dist/renderer/assets/` 469 文件）· B-06（未删的占位文件）**逐条给结论**（做 or 明确不做）。
6. ⚠️ **经验库两条 H 级新坑**（§九 末）建议**入库**；`J-26` 已入台账。
7. ⚠️ **上游同步 SOP**：本任务把"跟随上游"跑通了一遍 ⇒ 建议把**本任务的 Phase 划分 + 判据形状**沉淀成下一次同步的 SOP（规范 §7.6 `SYNC-<主题>SOP.md`）。
8. ⚠️ **不要推送远端**（除非人明确要求）：本地 `master` 与 gitee 镜像的关系**不在本任务范围**。

---

## 十一、改动的目标达成核对（**执行后回填**）

| 目标（§1.2） | 状态 | 证据 |
|---|---|---|
| **T1** 数据备份有效（5588 文件） | ⬜ | 源/备份文件数：____ / ____ · robocopy 退出码：____ |
| **T2** `pnpm run build` 成功、`dist` 新鲜 | ⬜ | 痕迹行 exit=____ · `dist/main/main/index.js` mtime：____ |
| **T3** 应用启动 + 迁移状态 | ⬜ | 迁移状态（`renamed`/`merged`/`failed`）：____ · 实际新目录：____ |
| **T4** H-10 附件链端到端 | ⬜ | 结论：`界面可达` / `A56 阻塞` |
| **T5** H-11 5 项入口 | ⬜ | 5 项逐项结论：____ |
| **T6** H-12 设置页面板 | ⬜ | 打开成功面板数：____ / 共 ____ |
| **T7** H-13 记忆模式 × 域过滤 | ⬜ | 6 步逐项观察：____ |
| **T8** H-14 真实渠道 | ⬜ | `[x]` / `🚫 无法验（缺 真实渠道）` |
| **T9** 11 项基线界面级 | ⬜ | 可达 __ / 纯后端 __ / 待人判定 __ |
| **T10** H-16 / H-17 收口 | ⬜ | H-16：____ · H-17：____ |
| **T11** 收口提交 | ⬜ | 提交哈希：____ · `src/` 命中：____ |
| **T12** 结项交接清单 | ⬜ | 见 §七 表，逐项有主：____ |

**非目标遵守情况**：⬜ 未改源码 · ⬜ 未改测试/文案 · ⬜ 未动 `PARTIAL_LOCALES` · ⬜ 未跑 install · ⬜ 未删 `node_modules.bak`/`wip/*`/`p4-pre-commit` · ⬜ 未 `git clean` · ⬜ 未改 `.gitignore` · ⬜ 未打包 · ⬜ 未推送远端

**人工环节达成核对**：⬜ 台账 `H-10…H-14` 状态已更新 · ⬜ `H-16`/`H-17` 已收口 · ⬜ **无"未知/待定"** · ⬜ 数据核对已由人签字

**回写清单已闭合**：⬜（见完成报告 §十）

---

## 十二、施工记录（**执行者追加**，见规范 §8）

> 子节按需增减，**1 / 2 / 4 / 5 为必需**。
> 0 · 人工环节回执（索引，**不复制结论**）
> 1 · 偏离蓝图之处
> 2 · 蓝图未覆盖、施工中发现的漏洞
> 4 · 有意保留的"不处理"点
> 5 · 验收（实测数字，**每个带口径与时点**）
> 6 · 待做 / 未做
> 🆕 **9 · 数据面记录**：备份路径 / 文件数 / 迁移状态 / 新目录实际名 / 抽查结果（**本 Phase 独有**）
> 🆕 **10 · 界面验证的逐项原始观察**（点哪里 → 看到什么；含"待人判定"的项与理由）

---

## 附：本蓝图的证据来源与可复算声明

| 证据 | 来源 | 复现方式 |
|---|---|---|
| `dist/` 陈旧（2026-09-19 / 10-01 vs merge 10-12） | 本机实测（2026-10-13） | §二 E2 |
| 数据目录 624 MB / 5588 文件；新目录尚不存在 | 本机实测 | §二 E3 |
| 迁移的 5 个状态与"整体原子重命名"语义 | 读源码 `src/main/user-data-migration.ts`（108 行）+ `src/main/application/pre-ready.ts:35` | `git show HEAD:src/main/user-data-migration.ts` |
| i18n 面板文案（区块 / 知识库 / 子代理 / 浏览器控制 / 记忆） | 本机实测（`zh-CN.json`，共 2480 键） | §二 E5 |
| 🔴 **"浏览器面板的键前缀是 `browserControl.` 而不是 `browser.`"** | 本机实测 | `git grep -o 'settingsPage\.browserControl\.' HEAD -- src/renderer/react/features/settings/BrowserControlSettingsPanel.tsx` |
| `H-10…H-17` 的要验项与静态结论 | 台账 §四 + P3/P4/P5 报告 | `HUMAN-人工验证台账.md` |
| A56 未闭合（3 个桥方法 renderer 命中 = 0） | **P5 完成报告 §五 A10 + §十四** | `git grep -c 'processDocuments' HEAD -- src/renderer` |
| 依赖树就位 / TS 6.0.3 / 三套编译 0/0/0 | **P5 完成报告 §一 + §十二 9** | `.cyrene-merge-analysis/heb-p5/*.log`（带 `[运行痕迹]`） |
| electron 二进制懒下载（`electron@44`） | **P5 完成报告 §十 U7** | — |

> 🔴 **本蓝图的已知不确定性（如实声明）**：
> ① **新 userData 目录的实际名字未知** —— 取决于 Electron 用 `productName`（`Cyrene`）还是 `name`（`cyrene-agent`）。
>    本蓝图给了**两个候选**与核对方法（§四 4.3 第 3 项），**不预判**。
> ② 🔴 **P6 实测推翻**：迁移**必然**走 **`merged`**（不是 `renamed`）—— 因为迁移调用点 `pre-ready.ts:35`
>    位于**单实例锁之后**，而单实例锁本身会先创建 userData 目录（Electron 在 `%APPDATA%\Cyrene` 下落 `SingletonLock`）
>    ⇒ 迁移跑 `fs.existsSync(target)` 时**目标已存在** ⇒ 落入 `merged`。实测日志：
>    `[Cyrene] 用户数据目录合并迁移完成（merged）: …\live2d-cyrene -> …\Cyrene`。
>    **`merged` 是首启正常终态**（源码注释称其为"安装版用户常态"），**不是缺陷**；旧目录搬空后被 `rmdir` ⇒ 实测 ABSENT。
>    ⇒ 原文"大概率 `renamed`"**作废**（旧值保留于此，不删除）。
> ③ **H-10 能否通过未知** —— P5 已确认"渲染端无调用点"（A56）⇒ **很可能在界面上找不到上传入口**。
>    本蓝图**不预判结果**，而是把它写成**两种分支**（§四 4.4 ①），并要求把"它不影响合并保真结论"写清。
> ④ **`pnpm run build` 的实际结果未知** —— P5 只跑过 `tsc` 三套与 `vitest`，**没有跑过 `vite build` / `build:cli` / `build:main` 的完整链**。
>    若 `build:renderer`（`vite build`）失败，那是**本 Phase 的第一个新发现**，按 **S2** 处置。
