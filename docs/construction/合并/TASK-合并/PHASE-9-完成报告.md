# PHASE-9 完成报告：功能入口接回（Tier E）

> **状态**：✅ **已完成**（施工与机器判据全绿；**H-17 目视 5 步待人判** —— 它是本 Phase 的 H-B 退出条件）
> **执行日期**：2026
> **执行者**：agent（无对话历史，仅凭 [PHASE-9-功能入口接回.md](PHASE-9-功能入口接回.md) + [BLUEPRINT-总蓝图.md](BLUEPRINT-总蓝图.md) + [HUMAN-人工验证台账.md](HUMAN-人工验证台账.md) + 源码）
> **结论**：**三条丢失入口全部接回**（① 渠道控制台 ② 记忆管理台 + 按人擦除 + 删除全部记忆 + 群聊近期上下文条数 ③ 区块页），并**顺手修掉两条存量失败** → 全量测试 **`Test Files 0 failed | 562 passed (562)`** / **`Tests 0 failed | 5429 passed | 1 skipped (5430)`**，三套 `tsc` **0/0/0**；提交 **`99932fb1`**（单父 `51a20338`）+ tag **`phase9-entries`**，**未推送**。
> **报告规范**：见 `../methodology/BLUEPRINT-撰写规范.md` §5

---

## 一、执行摘要

| # | 验收项 | 结果 |
|---|---|---|
| **A1** | ① 渠道控制台接回 | ✅ `ToolConsoleButton` 命中 **2**、非测试引用 **0 → 1** |
| **A2** | ② 记忆调用面 | ✅ **3 个非测试文件**（`listMemoryManager`/`erasePreview`/`erasePerson`/`deleteAll`/`groupContextLimit` 全命中） |
| **A3** | ③ 区块页三处注册 | ✅ `zones` 命中 **4**；`ZonesSettingsPanel.tsx` 存在且被引用；区块调用面 **1** 文件 |
| **A4** | ② 新测试 | ✅ **24 passed**（`rules.test.ts`） |
| **A5** | 三套编译 | ✅ **0 / 0 / 0** |
| **A6** | 全量测试 | ✅ **`0 failed \| 562 passed (562)`** / **`0 failed \| 5429 passed \| 1 skipped (5430)`**，**exit 0** |
| **A7** | 定向门禁 | ✅ 13 文件 **273 passed**；语料 **22**；探测器 **4**（合计 26，**名单未缩**） |
| **A8** | 11 项保护功能 | ✅ **11/11 逐项 ≥ P8 实测值**（实测 6/8/5/11/13/6/10/5/2/**9**/4） |
| **A9** | 提交与工作区 | ✅ `99932fb1` 单父；tag `phase9-entries`；`git status` 只剩 `??` |
| **A10** | 无新依赖 | ✅ `package.json` / `package-lock.json` 改动 **0 行**（两口径均为 0） |
| **T1–T4** | 蓝图 §一 1.1 四个目标 | ✅ 全部达成（详见 §九） |

**验收总计**：**10 项主判据 → PASS 10 / FAIL 0**；蓝图 §一 的 **T1–T4 → 4/4 达成**。
**额外**：作业单 A 类 **10 条**逐条复跑，**全绿**（见 §四 表二）。

### 人工环节回执（规范 §5 硬要求）

**① H-A 决策答复（原样抄录）**

| 编号 | 问题 | **答复原文** | 处置 |
|---|---|---|---|
| **H-18**（本 Phase 施工中新登记） | §四 4.4 假定 T4 只需改 `ToolConsolePanel.css`，实测禁用面内违规为 **3 文件 / 148 处** → 触发蓝图自定的 **S4 停止条件**（">3 个文件 → 停下来让人决定"），请拍板范围 | **「A · 扩到 4 文件全修（推荐）」** | ✅ 按 A 执行：3 个 CSS 全修（纯令牌改名） |

> 蓝图 §五 5.1 声明的「H-A：**无**」在本 Phase **被实测推翻** —— 出现了一个蓝图未预见的阻塞拍板点。
> 按蓝图 §五 5.1 的明文要求「以下三项若执行者认为需要变更，**按 S 系列停下并报告**，不要自行决定」，
> 执行者**停下并报告**，取得答复后才继续。**未自行扩面**。
> ⚠️ 答复选项写的是"4 文件"（含 H-16 所属的 `ApiConfigSection.css`），实际改动 **3 个 CSS 文件**：
> 计数口径差异见 §五 偏差 1；**范围本身无争议**（三个文件全在其中）。

**② H-B 每条核对项的结论**

| 编号 | 核对项 | 结论 |
|---|---|---|
| **H-17** | P9 目视验收 5 步（3 张截图） | ⏳ **待人判** —— 🔴 **本项是 P9 的退出条件；机器侧判据已全绿，但"能不能看"只能由人判** |

**③ H-C 已登记进 HUMAN 台账的编号**

| 编号 | 动作 |
|---|---|
| **H-15** | ✅ **销账**（①②③ 三条入口已接回，附判据命令与结果） |
| **H-02 / H-03** | 🟡 **转「待人工复验」**（控件与入口已就位，等人点；**真实群聊生效**仍需环境） |
| **H-17** | ⏳ **状态更新为「P9 已施工完毕，等人判」** |
| **H-18** | 🆕 **新登记 + 当场拍板**（S4 范围裁定） |
| **H-01 / H-05 / H-16** | 不变（已在 P9 期由人眼验完 / 已拍板 B 不接回） |

---

## 二、最终状态（交接给 P10）

```
HEAD        = 99932fb1  "feat(P9): 接回渠道控制台/记忆管理台/区块页，并修掉两条存量失败"
父提交       = 51a20338（单父，不是合并提交）
tag         = phase9-entries → 99932fb1
冲突        = UU = 0 / UD = 0 / DU = 0 / AA = 0；冲突块 = 0
提交范围     = 15 files changed, +2295 −176
              ⚠️ `--ignore-cr-at-eol` 与原始口径【数字相同】= 本 Phase 未产生行尾 churn（判据台账 J-30）
工作区       = 只剩 `??`（默认口径 18 条 / `-uall` 展开 155 条）—— 无 M / D / A 残留
              （P9 前置实测：默认 17 条 / `-uall` 139 条）
测试         = 全量 Test Files 0 failed | 562 passed (562)
                    Tests 0 failed | 5429 passed | 1 skipped (5430)   ← exit 0
               ERR_MODULE_NOT_FOUND = 0
编译         = tsc main / preload / renderer = 0 / 0 / 0
11 项基线    = 6/8/5/11/13/6/10/5/2/9/4（逐项 ≥ P8 的 4/8/5/11/13/6/10/5/2/8/4）
推送         = ❌ 未推送（N1；H-B6 仍未定）
```

**产出物**：

| 文件 | 内容 | 规模 |
|---|---|---|
| `features/settings/memory-console/rules.ts` | 从 3 个「里子」模块**抄写**的纯规则（含 6 条出处对照） | **197** 行（新增） |
| `features/settings/memory-console/rules.test.ts` | 新测试（这 3 个模块此前**无任何测试覆盖**） | **254** 行 / **24 tests**（新增） |
| `features/settings/memory-console/MemoryManagerSection.tsx` | 三视图列表 + 查询 + 两种删除 + **按人擦除三段式** | **529** 行（新增） |
| `features/settings/memory-console/DangerZoneSection.tsx` | 群聊近期上下文条数 + 删除全部记忆（强确认 + 重启） | **188** 行（新增） |
| `features/settings/ZonesSettingsPanel.tsx` | 区块页（建/改名/删/成员增删移/配置/**手动按群号加白**） | **417** 行（新增） |
| `features/settings/zones/rules.ts` | 从 `zones/picker.ts` 抄写的纯规则 | **131** 行（新增） |
| `ChatPageNavigation.tsx` | ① 两行接回 | +2 |
| `MemorySettingsPanel.tsx` | ② 挂载两个新区块 | +6 |
| `AppearanceSettingsPage.tsx` | ③ 三处注册（Layers 图标 + 导航 + 渲染） | +5 −3 |
| `ToolConsolePanel.tsx` | ④ `window.confirm` → `Modal.confirm` | +20 −9 |
| `ToolConsolePanel.css` / `ApiConfigSection.css` / `UsageBadge.css` | ④ `--cy-*` → `--rb-*` | **80 / 57 / 11** = **148** 处（纯改名） |
| `i18n/zh-CN.json` / `en.json` | 两语言各新增 **150** 个叶子键 | +198−7 / +200−9 |
| `.cyrene-merge-analysis/p9/**` | 分析产物（基线/门禁/预哈希/提交信息），**不进提交** | 17 个文件 |

---

## 三、执行过程（含命令与实测输出）

> 按步骤复述**实际敲的命令**与**实际输出**。🔴 凡与蓝图不同的命令，**都写明为什么**。

### 3.0 环境实测：**蓝图里逐字写着的 `npx` 在这台机器上跑不起来**

```powershell
PS> npx -v
npx : File D:\data\node24\npx.ps1 cannot be loaded because running scripts is disabled on this system.
At line:1 char:486  ... + CategoryInfo : SecurityError: (:) [], PSSecurityException
   + FullyQualifiedErrorId : UnauthorizedAccess
PS> Get-ExecutionPolicy -List
MachinePolicy Undefined / UserPolicy Undefined / Process Undefined
CurrentUser   Undefined / LocalMachine Undefined        ← 六项全 Undefined = 实际 Restricted
PS> & D:\data\node24\npx.cmd --version
11.19.0                                                  ← ✅ 可用
```

**处置**：本 Phase **全部** `npx` 调用一律改写为 `& D:\data\node24\npx.cmd …`。
**未改判据语义**，只换包装器。→ 新经验 **X15**。
> 🔴 **这是"执行者应实测每条判据命令，而非照抄"的第一个实证**：蓝图、总蓝图、**以及此前 8 份完成报告**
> 全都写 `npx …`。若照抄，本 Phase 的 P2 基线会**一条测试都没跑**（与 P8 偏差 1 的失效形态相同、根因不同）。

### 3.1 前置 P1–P5

```powershell
PS> git log -1 --format='%h %s'
51a20338 merge(P8): 完成三方合并 —— 本地 12 天工作重接到官方 b11b8851   ✅ = 蓝图 C1 要求的基线
PS> git log -1 --format='%p'
598dfb75 b11b8851                                                        ✅ 2 个父（仍是合并提交）
PS> git status --porcelain | Group-Object { $_.Substring(0,2) } | Select Name,Count
?? 17                                                                    ✅ 只有 ??（默认口径）
PS> git status --porcelain -uall | Group-Object { $_.Substring(0,2) } | Select Name,Count
?? 139                                                                   ⚠️ 口径差异，见 §五 偏差 4
```

**P4 备份（7 个文件的改动前 blob）** → `.cyrene-merge-analysis/p9/pre-hashes.txt`：

```
84302687792ece1737414d2c8f908c6f742fdb9d  …/ChatPageNavigation.tsx
96743abdd5af60cb520634a4c7c31c7ec1f4e6ba  …/MemorySettingsPanel.tsx
89804671f74c3a57a27eedb8999c50666982d616  …/AppearanceSettingsPage.tsx
59da327b82280667cb38196e970402af0b495e85  …/ToolConsolePanel.css
4f2c5a1fe041356d6d0376bd3c92b1013740c032  …/ToolConsolePanel.tsx
98003d310dde95179796380f16d2130cbeaaa26f  …/i18n/zh-CN.json
85cec8b552cb302b545ab5019d6e05a4aff8c1b8  …/i18n/en.json
行数 = 7    ✅
```

### 3.2 P2 · 开工前全量基线（**必须命中 F7 四个数字**）

```powershell
PS> $log = 'E:\AI_Chating\cyrene-agent\.cyrene-merge-analysis\p9\baseline-fulltest.txt'
PS> New-Item -ItemType Directory -Force -Path (Split-Path $log) | Out-Null   # ← 经验 X13：先建目录
PS> & D:\data\node24\npx.cmd vitest run *> $log                              # ← 绝对路径整文件重定向
EXIT=1
 Test Files  2 failed | 559 passed (561)
      Tests  2 failed | 5403 passed | 1 skipped (5406)
   Duration  52.29s
ERR_MODULE_NOT_FOUND 计数 = 0
失败文件 = ③ theme-token-contract.test.ts:74   ④ default-dialogs-regression.test.ts:31
```

✅ **与 F7 逐字相同** → P2 通过，S1 **未触发**。
> ⚠️ **命令与蓝图的差别（有意）**：蓝图 P2 写的是 `Tee-Object -FilePath`，但该写法会把 **758 KB** 的
> 测试 stdout **全部灌进会话**（实测第一次后台作业 `pwsh-9` 因此被中止）。
> 改用 `*> $log`（整文件重定向）+ 事后 `Select-String` 只取汇总行 —— **判据不变，输出面收窄**。

### 3.3 P3 · 三套编译面基线

```powershell
tsconfig.main.json           EXIT=0  输出行数=0
tsconfig.preload.json        EXIT=0  输出行数=0
tsconfig.renderer.json       EXIT=0  输出行数=0      ✅ 0/0/0
```

### 3.4 ★ T4 前置实测：**S4 停止条件命中**（本 Phase 最重要的一处现场判断）

蓝图的 T4 只提到 `ToolConsolePanel.css` 一个文件。按 **J-13**（"蓝图坐标不可直接采信，动手前自己重扫"）
先独立复扫整个扫描面，结果：

```powershell
# 用与测试同源的禁用正则，逐文件计数（而不是只看测试报了几个）
$re = 'var\(--cy-(?:accent(?:-hover)?|bg(?:-(?:page|workspace|elevated|hover|active))?|border|danger|surface|text(?:-(?:primary|secondary|muted))?|shadow-(?:workspace|bubble-(?:neutral|accent)|control-(?:hover|focus)))\b'
违规文件数 = 3
 57  src\renderer\react\features\chat\components\api-config\ApiConfigSection.css
 80  src\renderer\react\features\chat\components\ToolConsolePanel.css
 11  src\renderer\react\features\chat\components\UsageBadge.css
```

**根因**：`theme-token-contract.test.ts:73-74` 是**逐文件 fail-fast** —— 遍历到**第一个**违规文件就抛错，
**后面的违规文件被完全掩盖**。蓝图据"一个失败的测试"推定"1 个文件"，**规模被系统性低估**。

**两个附带实测（决定人该怎么拍板）**：

```powershell
# ① 三类违规全是"颜色令牌名"，映射表已备齐 → 纯改名，零版面风险
# ② --cy-* 这组别名【全仓根本没有声明】
PS> git grep -n -E '\-\-cy-[a-z-]+\s*:'   # 只有 --cy-message-reading-width / --cy-sticker-* / --cy-pill-*（都不是颜色别名）
PS> Select-String -LiteralPath src\renderer\ui\tokens.css -Pattern '--cy-'    # → 0 行（空）
```

⇒ 这 3 个面板**一直靠 `var(--cy-x, 兜底色)` 的兜底色渲染** —— 这正是 H-17 第 5 步"配色不一致"的机制根因。

**处置**：按蓝图 §五 5.1 的明文要求**停下并报告**（未自行扩面）→ 登记 **H-18** → 取得答复
**「A · 扩到 4 文件全修」** → 继续施工。→ 新判据 **J-27**、新经验 **D20**。

### 3.5 T1 · ① 渠道控制台接回（两行）

```diff
--- ChatPageNavigation.tsx
+import { ToolConsoleButton } from "../../../components/ui/ToolConsoleButton";      // :12 位置（保持字母序）
           <MomentsModeButton active={activePanel === "moments"} onClick={() => onTogglePanel("moments")} />
+          <ToolConsoleButton active={activePanel === "console"} onClick={() => onTogglePanel("console")} />
```

**未改** `ChatPagePanel` 类型、**未改** `ChatPagePanelHost.tsx`（两者已就位）、**未动**同容器其它按钮顺序（N2）。

### 3.6 T2 · ② 记忆管理台（本 Phase 最大工作量）

**抄写策略**（C4 / N6）：**不 import** 4 个「里子」模块，只把**纯判定逻辑**抄进
`memory-console/rules.ts`，逐条注明出处：

| 抄出的函数 | 出处（里子模块） |
|---|---|
| `isDeleteAllConfirmed` | `memory/delete-all.ts:21-23` |
| `isEraseConfirmed` / `canErasePersonKey` | `memory/erasure-flow.ts:63-65 / 68-70` |
| `classifyManagerMemory` / `groupManagerMemories` | `memory/manager.ts:89-97 / 257-281` |
| `canProceedToErase` / `nextEraseStep` / `MAX_ERASE_RECONFIRM_ROUNDS` | `memory/erasure-flow.ts:419-437 / 441-455 / 31` |
| `describeDeleteAllFailure` | `memory/delete-all.ts:26-29` |
| `normalizeGroupContextLimit` 语义 | `src/main/settings/general-settings.ts:202-206`（**镜像**，非 import） |

**4 个能力全部实现**（调用面实测命中数，非测试文件）：

```
listMemoryManager 1   queryMemoryManager 1   deleteMemoryManager 2   traceMemorySource 1
erasePreview 1        erasePerson 3          deleteAll 8             restartApp 2
groupContextLimit 3
```

**🔴 三条硬约束逐条落地**（抄自里子模块注释，重写时最容易丢的）：
1. 「彻底擦除」**只在详情区**出现 —— `canErase` 只在 `detail` 非空时计算，列表行**结构上拿不到**该按钮；
2. `own` / `mentioned` **分开显示、分开勾选**，删 `mentioned` 组前先弹「会连带动到别人的记录」+ 列出 speakers；
3. 三段式（预演 → 强确认 → 执行）：执行前过 `canProceedToErase` **守卫链**（personKey 形态 / 严格相等 / previewId 非空），
   **任一不满足绝不调用 `erasePerson`**。
4. **重启语义差异（Y4）**：`erasePerson` **不重启**（UI 上明写"擦除不需要重启"）；`deleteAll` **必须** `restartApp()`
   （删除成功后弹出"必须重启"警示 + 「立即重启」按钮）。

**测试**：`npx vitest run src/renderer/react/features/settings/memory-console`
```
✓ src/renderer/react/features/settings/memory-console/rules.test.ts (24 tests) 7ms
 Test Files  1 passed (1)      Tests  24 passed (24)          EXIT=0
```
> **测试跑出来的第一件事就是一个真 bug**（见 §五 偏差 5）：`normalizeGroupContextLimit(null, …)`
> 因 `Number(null) === 0` 被夹成 `min = 3`，**把"用户没填"静默变成"填了 3"**。已修 + 补 6 条边界用例。
> 另外补了一条**镜像值漂移守卫**：测试直接**读主进程源文件**逐字比对三个常量 —— 主进程改了而渲染侧没跟，测试立刻红。

### 3.7 T3 · ③ 区块页（新建 + 三处注册）

新建 `features/settings/ZonesSettingsPanel.tsx`；`AppearanceSettingsPage.tsx` 三处注册：

```diff
-  | "…" | "memory" | "cyrene" | …                                   // :83 联合类型
+  | "…" | "memory" | "zones" | "cyrene" | …
+import { ZonesSettingsPanel } from "./ZonesSettingsPanel";
+import { …, Layers, … } from "lucide-react";
+  <SettingsNavItem section="zones" … icon={<Layers …/>} label={t("settingsPage.zones.title")} … />   // :266 附近
+  … : section === "memory" ? <MemorySettingsPanel /> : section === "zones" ? <ZonesSettingsPanel /> : …  // :282 三元链
```

**能力面**（8 个 preload 方法全部接上）：`getZoneSnapshot` / `createZone` / `renameZone` / `deleteZone` /
`updateZoneConfig` / `addZoneMember` / `removeZoneMember` / `moveZoneMembers` + **`addZoneManualGroup`**
（🔴 旧代码注释写明这是"新群还没产生会话时**唯一**能加白的入口"，蓝图 §四 4.3 点名**不要漏**）。
校验规则**复用共享模块** `src/shared/zone-group.ts`（在 `tsconfig.renderer.json` 的 include 面内，
且主进程与渲染进程共用同一份正则 —— 正是为了避免口径漂移）。

### 3.8 T4 · ④ 修两条存量失败

**③ CSS 令牌（148 处，纯改名）**：

```
ToolConsolePanel.css        16 × --cy-text-muted → --rb-text-secondary
                            16 × --cy-text       → --rb-text-primary
                            15 × --cy-border     → --rb-border-default
                            15 × --cy-accent     → --rb-accent
                            11 × --cy-bg-workspace → --rb-surface-workspace
                             7 × --cy-bg-page     → --rb-surface-page      小计 80
ApiConfigSection.css        11+9+12+9+3+10+3 = 57
UsageBadge.css               5+3+2+1         = 11
复扫残留违规文件数 = 0
```
**机械证明为纯改名**（这是"没动版面"的判据，不是印象）：
```
去掉令牌名（--cy-* / --rb-* → --TOKEN）后比较增删两侧行：
ToolConsolePanel.css     - 80 行 / + 80 行 → 差异行 = 0
ApiConfigSection.css     - 57 行 / + 57 行 → 差异行 = 0
UsageBadge.css           - 11 行 / + 11 行 → 差异行 = 0
```
> `git diff --numstat` 与 `git diff --ignore-cr-at-eol --numstat` **数字相同** ⇒ 无行尾 churn（**J-30**）。

**④ `window.confirm` → `Modal.confirm`**（Y2：成员方法明确豁免）：
```diff
-  const clearAudit = useCallback(async () => {
-    if (!api?.channelsAuditClear) return;
-    if (!window.confirm(t("toolConsole.clearConfirm"))) return;
-    try { await api.channelsAuditClear(); setAudit([]); setSelectedId(null); }
-    catch (error) { console.warn("[ToolConsole] 清空失败:", error); }
-  }, [t]);
+  const clearAudit = useCallback(() => {
+    const api = consoleApi();
+    if (!api?.channelsAuditClear) return;
+    const clear = api.channelsAuditClear;              // ← 先把方法抓成局部 const（TS2722，见 §五 偏差 3）
+    Modal.confirm({ title: t("toolConsole.clearConfirm"), okText: t("toolConsole.clear"),
+      okButtonProps: { danger: true }, cancelText: t("settingsPage.channels.cancel"),
+      onOk: async () => { try { await clear(); setAudit([]); setSelectedId(null); }
+                          catch (error) { console.warn("[ToolConsole] 清空失败:", error); } } });
+  }, [t]);
```
**保持 `clearAudit` 的既有行为**：确认后才 `channelsAuditClear()`，成功后 `setAudit([])` + `setSelectedId(null)`，失败仍 `console.warn`。

**两条门禁测试**：
```
✓ src/renderer/react/styles/theme-token-contract.test.ts (7 tests) 33ms
✓ src/renderer/default-dialogs-regression.test.ts (2 tests) 454ms
 Test Files  2 passed (2)      Tests  9 passed (9)            EXIT=0
```

### 3.9 i18n（Y5：两语言键集合必须一致）

用一次性脚本（`.cyrene-merge-analysis/p9/add-i18n-keys.mjs`，**不进提交**）以**同一套键结构**喂两个语言，
从构造上保证结构相同；写入用 `File.WriteAllText` + `UTF8Encoding($false)`（**X12**：`Set-Content -Encoding UTF8`
在 PS 5.1 会写 BOM），保留原件的 2 空格缩进 / CRLF / 末尾换行。

```
zh-CN: BOM=false EOL="\r\n"      en: BOM=false EOL="\r\n"
递归键路径数：zh 2100 / en 2100     键路径差异数 = 0     ✅
```
**机械证明为纯追加**（逐键路径比较 HEAD 版 vs 工作区版）：
```
HEAD 叶子数 = 1950 ; 现在叶子数 = 2100
被移除的键 = 0 ; 值被改动的键 = 0                       ✅
```

### 3.10 全量门禁（**必须全绿才提交**）

```powershell
& D:\data\node24\npx.cmd tsc -p tsconfig.main.json      # EXIT=0  0 行
& D:\data\node24\npx.cmd tsc -p tsconfig.preload.json   # EXIT=0  0 行
& D:\data\node24\npx.cmd tsc -p tsconfig.renderer.json  # EXIT=0  0 行
& D:\data\node24\npx.cmd vitest run                     # EXIT=0
 Test Files  562 passed (562)
      Tests  5429 passed | 1 skipped (5430)
   Duration  52.34s
失败文件 = （无）      ERR_MODULE_NOT_FOUND = 0
```
**A7 定向门禁**（名单未缩，`group-context-flow.test.ts` 仍在）：
```
13 文件 → Test Files 13 passed (13) / Tests 273 passed (273)      EXIT=0
语料 2 + 探测器 1 → Test Files 3 passed (3) / Tests 26 passed (26) EXIT=0
   ✓ memory-deletion.test.ts (15)   ✓ group-corpus-isolation.test.ts (7)   ✓ group-context-flow.test.ts (4)
```

### 3.11 提交（**唯一一次 commit**，N1 不推送）

```powershell
# ① 提交信息：无 BOM（X12）
$b = [System.IO.File]::ReadAllBytes('…\p9\commit-message.txt')
前 3 字节 = 102,101,97   ('fea' → 无 BOM ✅)
# ② 逐条指定路径 add（15 条），不用 git add -A
# ③ 提交前 A10（此时 HEAD 就是 P8）
git diff --name-only HEAD -- package.json package-lock.json   → 0 行 ✅
git commit -F .cyrene-merge-analysis\p9\commit-message.txt
[master 99932fb1] feat(P9): 接回渠道控制台/记忆管理台/区块页，并修掉两条存量失败
 15 files changed, 2295 insertions(+), 176 deletions(-)
# ④ tag
git tag phase9-entries → 99932fb16c509c15258a3e8cf724c58018914a56
# ⑤ 提交后复验
父提交数 = 1 ✅ ；git status → ?? 18（默认口径）✅ ；A10（HEAD~1 口径）= 0 行 ✅
```

---

## 四、验收测试逐项结果

### 表一 · 蓝图 §六 A 类判据

| # | 验收项 | 期望 | 实测 | 判定 |
|---|---|---|---|---|
| **A1** | ① 接回 | `ChatPageNavigation.tsx` 内 `ToolConsoleButton` ≥2；非测试引用 ≥1 | **2** / 引用文件 = `ToolConsoleButton.tsx` + `ChatPageNavigation.tsx` | ✅ |
| **A2** | ② 调用面 | `git grep` 在 `src/renderer/react`（排除 test）命中 ≥**2 个文件** | **3 个文件**（见下） | ✅ |
| **A3** | ③ 注册三处 | `AppearanceSettingsPage.tsx` 内 `zones` ≥3；`ZonesSettingsPanel.tsx` 存在 | **4** 处；文件存在且被引用；区块调用面 1 文件 | ✅ |
| **A4** | ② 新测试 | `vitest run …/memory-console` → 0 failed | `1 passed (1)` / **24 passed** | ✅ |
| **A5** | 三套编译 | 0 / 0 / 0 | **0 / 0 / 0** | ✅ |
| **A6** | 全量测试 | 见 §五 偏差 6（**目标值本身被修正**） | **`0 failed \| 562 passed (562)`** / **`0 failed \| 5429 passed \| 1 skipped (5430)`** | ✅ |
| **A7** | 定向门禁 | 273 passed；语料 22；探测器 4 | **273** / **15+7 = 22** / **4** | ✅ |
| **A8** | 11 项保护功能 | 逐项 ≥ P8 实测值；`groupContextLimit` 应**回升** | **11/11**，`groupContextLimit` 8 → **9**（回升 ✅） | ✅ |
| **A9** | 提交与工作区 | 单父；tag `phase9-entries`；只剩 `??` | 父 = `51a20338` **1 个**；tag ✅；`?? x18` | ✅ |
| **A10** | 无新依赖 | `package.json` / lock 改动 0 行 | **0 行**（提交前 `HEAD` 口径 / 提交后 `HEAD~1` 口径**均 0**） | ✅ |

**A2 逐项实测输出**：
```
src/renderer/react/features/settings/memory-console/DangerZoneSection.tsx
src/renderer/react/features/settings/memory-console/MemoryManagerSection.tsx
src/renderer/react/features/settings/memory-console/rules.ts
```
**A8 逐项实测输出**：
```
记忆管理控制台  P8实测  4 → 现在  6 ✔     按人擦除/身份归属  P8实测  8 → 现在  8 ✔
区块 zones      P8实测  5 → 现在  5 ✔     渠道审计          P8实测 11 → 现在 11 ✔
工具白名单      P8实测 13 → 现在 13 ✔     关键词策略        P8实测  6 → 现在  6 ✔
群语料          P8实测 10 → 现在 10 ✔     群聊旁听上下文    P8实测  5 → 现在  5 ✔
用量徽章        P8实测  2 → 现在  2 ✔     群上下文上限      P8实测  8 → 现在  9 ✔（回升）
弹窗确认门      P8实测  4 → 现在  4 ✔
```

### 表二 · 作业单 A 类（**顺带全量复跑**，10 条）

| # | 内容 | 期望 | 实测 | 判定 |
|---|---|---|---|---|
| A-1 | 三套编译面 | 各 0 条 error TS | 0 / 0 / 0 | ✅ |
| A-2 | 冲突与索引 | 全符合 | UU/UD/DU/AA = 0；冲突块 0 | ✅ |
| A-3 | 构建产物 | **6 个** index.html | **6**（`/`、`call-react/`、`music/`、`react/`、`sticker-manager/`、`toast/`） | ✅ |
| A-4 | 语料豁免边界 | 22 passed | **15 + 7 = 22 passed** | ✅ |
| A-5 | 静默失效探测器 | 4 passed | **4 passed** | ✅ |
| A-6 | 定向门禁（13 文件） | 13 / 273 | **13 / 273** | ✅ |
| A-7 | 全量测试（对照基线） | 见 §五 偏差 6（**已更新为新口径**） | `0 failed \| 562 passed (562)` | ✅ |
| A-8 | H-13 代码级（隐私边界） | 4 条全达标 | 由 A7 门禁覆盖（`tool-registry-memory` + `group-context-injection` 均在全绿名单内） | ✅ |
| A-9 | 渲染层残留 | 0 命中 | **0** | ✅ |
| A-10 | D6 文档排除 | 两条均 0 | `docs/merge-plan` = **0**；`docs/construction/合并` = **0** | ✅ |

### 表三 · 蓝图 §十二 回写清单（T1–T4）

见 §十。

---

## 五、关键偏差与判定修正（**给后续 Phase 必读**）★

### 偏差 1 · 🔴 **S4 停止条件命中：T4 的真实规模是 3 个文件 / 148 处，不是 1 个文件**

- **现象**：蓝图 §四 4.4 只说改 `ToolConsolePanel.css`；按 **J-13** 独立复扫整个扫描面 → **违规 3 文件 / 148 处**
  （`ToolConsolePanel.css` 80 + `ApiConfigSection.css` 57 + `UsageBadge.css` 11）。蓝图 §四 4.4 的 Y1 自己写了
  「一旦超过 3 个文件 → **S4 停止条件**」，而 **3 个正是"超出 1 个文件"** 的情形。
- **根因（实测，非推断）**：`theme-token-contract.test.ts:73-74` 的循环体是
  `for (const file of styleFiles) { expect(...) }` —— **逐文件 fail-fast**，**第一个违规文件就抛错**，
  后面的违规文件**结构上不会被报告**。蓝图据"一个失败的测试文件"推定"一个违规 CSS 文件"，**把"首个"读成了"唯一"**。
- **判定**：**停下并报告**（蓝图 §五 5.1 明文要求）→ 登记 **H-18** → 答复 **「A」** → 扩到 3 文件全修。
  两个附带实测支撑该裁定：① 三类违规**全是颜色令牌名**（映射表已备齐）→ **纯改名、零版面风险**；
  ② `--cy-*` 别名**全仓无声明** → 这 3 个面板**本来就靠兜底色渲染**，与"主题一致"目标相矛盾。
- **对后续的影响**：① 新判据 **J-27**（"工具报 N 个 ≠ 总共 N 个"，定规模前必须独立复扫）；
  ② 新经验 **D20**；③ **`UsageBadge.css` 也被修了** —— 它是 H-01/H-05 已验证区域的组件，
  虽然改动是纯改名，**H-17 第 5 步的目视复核仍然必要**（人眼确认观感未变）。

### 偏差 2 · `git grep -u` 不是"含未跟踪"，A2 判据一度返回 **0**

- **现象**：按蓝图 §四 4.2 的 A2 逐字执行 `git grep -l -E '<5 个符号>' -- src/renderer/react`，返回的行只有
  **两个 i18n `.json`**，**三个已正确接线的新 `.tsx/.ts` 一个都没出现**；改用我记忆中的 `-u` 又得到
  `error: unknown switch 'u'` + 80 行 usage。
- **根因**：`git grep` 默认**只搜索引里的已跟踪文件**，而 P9 的新文件**尚未入库** —— 这是施工期常态。
  且本 git 构建里 **`-u` 不是 `git grep` 的选项**（它是 `git add`/`git status` 的短选项），正确写法是长选项 `--untracked`。
- **判定**：判据**缺路**，非执行错误。修正后（`--untracked` + 限定代码文件 + 先跑一次"不加开关"的对照）
  得 **3 个非测试文件**，与设计一致。
- **对后续的影响**：新判据 **J-26**；新经验 **C24**（M 级）+ **X16**（L 级）。
  🔴 **凡"验证还没 `git add` 的产物"的判据都要查这一条**。

### 偏差 3 · `tsc` 报 `TS2722`：**可选链窄化不跨越函数边界**

- **现象**：`ToolConsolePanel.tsx(294,17): error TS2722: Cannot invoke an object which is possibly 'undefined'`
  —— 而 `:285` 明写着 `if (!api?.channelsAuditClear) return;`，**看起来完全正确**。
- **根因**：`api?.channelsAuditClear` 的窄化只对**当前作用域**有效；`async () => { … }` 是**新作用域**，
  窄化在进入时已失效（编译器无法证明回调执行时 `api` 未变）。这是 **TypeScript 的固有行为**，不是本项目的缺陷。
- **判定**：改成**先把方法抓成局部 const 再进闭包**（`const clear = api.channelsAuditClear;` → 回调里 `await clear();`）→ `tsc` 0。
- **对后续的影响**：新经验 **X17**（L 级）。⚠️ 这条**容易反复踩** —— 凡"守卫 + 回调里再调"的形态都要注意。

### 偏差 4 · `git status` 的 `??` 计数**随 `--untracked-files` 口径在 17/139/155 之间变化**

- **现象**：蓝图 C1 / P1 写"**只允许出现 `??`（预期 17 条）**"，而 `-uall` 口径下同一次实测是 **139 条**（前置）/
  **155 条**（提交后）。
- **根因**：默认口径**折叠目录**（`.cyrene-merge-analysis/` 算 1 条），`-uall` **逐文件展开**。
  两者都正确，**差的是口径不是事实**（与 **J-17** 同型：`??` 行数不能作判据）。
- **判定**：**不算失败**。判据实为"**只有未跟踪文件、没有 M/D/A 残留**"，这一条两种口径下**都成立**。
- **对后续的影响**：报 `??` 条数时**必须写明口径**。

### 偏差 5 · 🔴 **新写的测试当场抓出一个真 bug**（`Number(null) === 0`）

- **现象**：`rules.test.ts` 首跑 **1 failed / 21 passed**：
  `AssertionError: expected 3 to be 10`（`normalizeGroupContextLimit(null, 10, 3, 50)` 返回 **3**）。
- **根因**：`typeof null !== "number"` → 走 `Number(null)` → **`0`**（不是 `NaN`！）→ `Number.isFinite(0)` 为真 →
  被 `Math.max(3, …)` **夹成 min = 3**。即：**"用户没填"被静默变成"填了 3"**。
  主进程的 `normalizeGroupContextLimit` 只面对 JSON 里的 `number`，所以那里不暴露；
  **UI 侧会收到空输入**，这里才暴露。
- **判定**：判定为**实现缺陷**（不是测试错），已修 —— 改为"只认 `number` / 非空十进制数字字符串，其余一律回落默认值"，
  并补 **6 条**边界用例（`null` / `undefined` / `""` / `"   "` / `{}` / `[]` / `false`）。
- **对后续的影响**：**这是"抄纯函数 + 写新测试"这条策略的直接收益** —— 里子模块**没有任何测试覆盖**，
  这个 bug 在旧实现里**同样存在**（旧面板也没测过它）。修在 React 侧；**4 个里子模块本身按 N6 保持原封不动**
  （P10 收口时需一并考虑）。

### 偏差 6 · 🔴 **蓝图 A6 的目标值本身写错了口径**（`5405` 不可达，且**更优**）

- **现象**：蓝图 F7 给的 T4 后目标值是 `Test Files 0 failed | 561 passed (561)` /
  `Tests 0 failed | 5405 passed | 1 skipped (5406)`；实测为 **`0 failed | 562 passed (562)`** /
  **`0 failed | 5429 passed | 1 skipped (5430)`** —— **多 1 个文件、多 24 条用例**。
- **根因**：F7 的 `5405 = 5403 + 2`，即撰写者**按"新增测试大约 2 条"估的**（或按"只算两个失败用例转绿"），
  而实际新写 **24 条**用例（`rules.test.ts`）。蓝图 §四 4.2 只写了"**rules.test.ts（必写）**"，
  **没有规定条数**，所以 5405 从来**不是可复现目标**。
- **判定**：**判定为蓝图的数字口径缺陷**（**不是**执行偏差；T4 的实质目标"两条存量失败修好 + 全量 0 failed"**完全达成**）。
  实测数字**优于**目标（失败 2 → **0**，用例 5403 → **5429**）。
- **对后续的影响**：新判据 **J-28** —— 硬判据只留**布尔量**（`0 failed` + 退出码 0），
  数字改用**加法恒等式**核对：`562 = 561 + 1`、`5429 = 5403 + 2 + 24`。**恒等式能同时证明"没退步"与"有增量"。**

### 偏差 7 · A10 判据里的 `HEAD~1` 在**提交前**指错了基线

- **现象**：蓝图 §六 把 A10 写成 `git diff --name-only HEAD~1 -- package.json package-lock.json` = 0 行，
  但 A10 属"提交前验收区"。提交前实测该命令返回 **2 行**（`package.json` + `package-lock.json`）——
  那是 **P3 合并**造成的、**与 P9 无关**（提交前 `HEAD` 还是 P8 `51a20338`，`HEAD~1` = P7 `598dfb75`）。
- **根因**：**相对 ref 的含义随"你站在哪一步"漂移**，而判据文本是静态的。
  这是本任务**第三次**踩同型坑（**J-15** `--cached` 比哪两边 / **J-21** 哈希该等于 HEAD 还是 MERGE_HEAD / 本条的 `HEAD~1`）。
- **判定**：判据**缺路**。提交前用 `HEAD` 口径 → **0 行**；提交后用 `HEAD~1` 口径 → **0 行**。**两口径均可复现为 0。**
- **对后续的影响**：新判据 **J-29**；新经验 **D19**（H 级）；
  **建议在通用库新增"形状 5 · 相对引用的语义会随执行位置漂移"**（已在通用库 §6e 末尾登记为候选）。

### 偏差 8 · 蓝图 P2 的命令形态会把 758 KB 测试输出灌进上下文

- **现象**：按蓝图 P2 的 `Tee-Object -FilePath` 在后台作业里跑，作业 `pwsh-9` 因输出量过大需人工中止。
- **根因**：`Tee-Object` **既写文件又回显 stdout**；vitest 全量的 stdout 是 **~740 KB**。
- **判定**：**不算失败**（判据是"拿到四个数字"）。改用 `*> $log`（整文件重定向）+ 事后 `Select-String` 取汇总行 ——
  **判据不变、输出面收窄**。日志落盘仍遵守 **X13**（先建目录 + 绝对路径）。
- **对后续的影响**：凡"全量测试落盘"的步骤，**不要用 `Tee-Object`**。

---

## 六、已知坑的实测复现情况

| 坑（键号） | 本次是否复现 | 说明 |
|---|---|---|
| **Y1** `theme-token-contract` fail-fast | ✅ **复现，且比蓝图预想严重** | 蓝图说"改完一个必须重跑，**可能还有下一个**"；实测**还有两个**（共 3 文件 / 148 处）→ 触发 S4，见 §五 偏差 1 |
| **Y2** 新代码里不许出现裸 `confirm(`/`alert(` | ✅ **已规避** | 新增 6 个文件**零**裸调用；`Modal.confirm` 用法实测通过 `default-dialogs-regression.test.ts` |
| **Y3** IPC 常量名 ≠ preload 方法名 | ✅ **已规避** | 全部走 `window.memoryPanel.<方法名>` / `window.settings.*`；**未碰**任何 `IPC.*` 常量 |
| **Y4** `deleteAll()` 必须重启 / `erasePerson()` 不需要 | ✅ **已按差异实现** | `DangerZoneSection` 删除成功 → 警示 + 「立即重启」；`MemoryManagerSection` 明写"擦除不需要重启" |
| **Y5** i18n 两语言键集合必须一致 | ✅ **已规避并加验** | 递归键路径 **2100 / 2100，差异 0**；且**逐键证明纯追加**（移除 0 / 改值 0） |
| **Y6** 官方组件库是 antd + lucide-react | ✅ **已遵守** | 未引入任何新依赖（A10 = 0）；`Modal/Button/Input/InputNumber/Switch/Alert/Empty/Spin` + `lucide-react` 图标 |
| **C1** 基线必须是 `51a20338` | ✅ **复现且吻合** | 开工前实测 `51a20338`、单父 2 个（仍是合并提交） |
| **C2** 只加入口、不重排版 | ✅ **已遵守** | 3 个 CSS 152 行改动经**机械证明为纯令牌改名**（去掉令牌名后差异行 = 0） |
| **C3** 不许碰的 6 处后端/桥 | ✅ **未碰** | `git diff --name-only` 的 15 条里**没有**任何 `src/main/**` 或 `src/preload/**` |
| **C4** 不直接 import 4 个「里子」模块 | ✅ **已遵守** | 只**抄**纯函数（6 条出处对照写在 `rules.ts` 头注释里）；里子模块**零改动** |
| **C5** 新 React 文件必须落在 `react/**` | ✅ **已遵守** | 6 个新文件全在 `src/renderer/react/features/settings/**` 内 → 进 `tsconfig.renderer.json` include 面 |
| **C6** 不推送 + 提交信息无 BOM | ✅ **已遵守** | 未 `git push`；提交信息前 3 字节 = `102,101,97`（'fea'，无 BOM） |
| **X12** PS 5.1 的 `-Encoding UTF8` 会写 BOM | ✅ **已规避** | i18n 与提交信息均用 `File.WriteAllText` + `UTF8Encoding($false)`；实测 `BOM=false` |
| **X13** `Tee-Object` 目标目录不存在 → **测试一次都没跑** | ⚠️ **变形复现** | 落盘步骤本身已按 X13（先建目录 + 绝对路径）；但**`Tee-Object` 的输出量问题**是新面孔 → 见 §五 偏差 8 |
| **F18** "被引用 = 0"只查 import 图不够（路径字符串引用） | ✅ **主动防守并复验** | 新增的 `rules.test.ts` 里**主动**写了一条"以路径字符串读主进程源文件"的漂移守卫（`readFileSync` + 正则比对三常量）；全量测试 0 failed 证明没有连带破损（**S3 未触发**） |
| **J-13** 蓝图坐标不可直接采信，动手前自己重扫 | ✅ **复现（收益最大的一条）** | 正是按 J-13 复扫才发现 T4 真实规模是 3 文件 → 见 §五 偏差 1 |

**本次新踩到的坑**（建议追加进经验库，已在 §十 登记为 T4）：

| 新条目 | 级 | 一句话 |
|---|---|---|
| **C24** | M | 用只搜已跟踪文件的检索工具验证**未入库的新产物** → 作用域错配，"做完了"被判成"没做" |
| **D18** | H | 把**量级**写成硬判据（而非含**加法恒等式**的判据）→ 新增测试必然让数字对不上 |
| **D19** | H | 判据写死相对 ref（`HEAD~1`）代表"上一个基线" → 含义随执行位置漂移（**本任务第三次**） |
| **D20** | H | 把"检查工具**报了**几个"当成"**总共只有**几个" → fail-fast 掩盖规模 |
| **E7** | M | 假定"文档里逐字写着的命令"在当前机器上能跑（PS 执行策略拦 `npx.ps1`） |
| **X15** | L | PS 执行策略拦 `npx.ps1`：`running scripts is disabled on this system` → 改用 `npx.cmd` |
| **X16** | L | `git grep` 的正确选项是长选项 `--untracked`；`-u` 会报 `unknown switch 'u'` |
| **X17** | L | 可选链窄化**不跨越函数边界** → `TS2722: Cannot invoke an object which is possibly 'undefined'` |

---

## 七、回退方法（已验证可用）

```powershell
# 级 1 · 单文件（回到 P9 之前）
git checkout 51a20338 -- <path>

# 级 2 · 整 Phase 撤销（P9 只有一个提交）
git reset --hard 51a20338        # ⚠️ 丢工作区改动，先确认

# 级 3 · 只看某文件改前内容（不动磁盘）
git show 51a20338:<path>

# 级 4 · 用 P9 自己的预哈希核对"是否被改过"（7 个文件，实测存在）
Get-Content .cyrene-merge-analysis\p9\pre-hashes.txt
git hash-object -- <path>        # 与文件内的哈希比对

# 级 5 · 回到 P9 基线本身
git reset --hard 99932fb1        # 或 git reset --hard phase9-entries

# 级 6 · 物理备份（P8 期的 8 个关键文件原始态 / Phase 0 全量）
#   E:\AI_Chating\cyrene-agent-p8-backup
#   E:\AI_Chating\cyrene-agent-backup-phase0
```

🔴 **永不** `git merge --abort`；🔴 **永不** `git push --force`；🔴 **永不** `git checkout <ref> -- .`。
**本次实测验证过的只有级 1 / 级 3 / 级 5 的可用性前提**（`51a20338` 与 `99932fb1` 两个 ref 都实测存在且可解析）；
级 2 与级 6 **未实际执行**（无需回退），按蓝图 §八 保留。

---

## 八、给下一个 Phase（P10）的交接清单

1. 🔴 **P9 之后，4 项本地能力的 UI 入口全部可达**（控制台 / 记忆管理台 / 按人擦除 / 删除全部记忆 / 区块页）
   —— "能力未迁移"的欠账**清零**。判据：§四 表一 A1/A2/A3。
2. 🔴 **H-17 目视 5 步仍未判** —— **它是 P9 的 H-B 退出条件**。
   机器侧已全绿，但"能不能看"只能由人判。判据与截图要求见
   [PHASE-9-功能入口接回.md](PHASE-9-功能入口接回.md) §五 5.2。
   ⚠️ 第 5 步（控制台配色与设置页一致）**现在覆盖 3 个文件**（含 `UsageBadge.css`）—— 见 §五 偏差 1。
3. 🔴 **P10 的两件事（蓝图 §十 已定）**：① 把"合并后同步机制"落到流程（下次上游更新怎么跟）；
   ② 把 4 个「里子」模块的处置收口（`memory/{delete-all,erasure-flow,manager}.ts`、`zones/panel.ts`）——
   它们是**参照物**：要么后续版本删掉，要么补上测试纳入类型检查面。
   ⚠️ **P9 的实测给这件事加了一条新理由**：新写的 `rules.test.ts` **当场就抓出了**里子模块里同样存在的
   `Number(null) === 0` 缺陷（见 §五 偏差 5）—— 证明"补测试"这条路的收益是**真实且立即可见的**。
4. 🔴 **门禁名单不许缩减**：`group-context-flow.test.ts`（群聊旁听探测器）必须继续在 P10 的门禁里。
   P9 实测：13 文件 **273 passed**、语料 2 文件 + 探测器 **26 passed**。
5. **仍未做**：推送（**H-B6** 仍未定）；`ApiConfigSection`（**H-16** 已拍板 B 不接回）；
   `H-06` 待项目所有者书面点头；`B-3` / `B-4` 已由人眼通过（P9 期）；
   `C-1` / `C-2` / `C-3` / `C-4` 与 `B-6` 第 1–4 步仍卡**真实渠道**（`C-3`/`C-4` 的**入口阻塞已解除**）。
6. **`??` 计数口径**：默认口径 **18** 条 / `-uall` 展开 **155** 条（**不要拿一个口径比另一个**，见 §五 偏差 4）。
7. **新判据已就位**：**J-26**（`git grep` 作用域）/ **J-27**（报数 ≠ 总数）/ **J-28**（量级 vs 恒等式）/
   **J-29**（相对 ref 漂移）/ **J-30**（行尾 churn 假警报）—— 全部已写进总蓝图 §二 判据台账。
8. **命令包装器**：本机 `npx` 必须用 `& D:\data\node24\npx.cmd`（**X15**），
   `npx <tool>` 会因 PS 执行策略**一条都不跑**。

---

## 九、Phase 9 目标达成核对

| 目标（来自蓝图 §一 1.1） | 状态 |
|---|---|
| **T1** ① 渠道控制台接回（最小改动：一行 import + 一行 JSX） | ✅ `ToolConsoleButton` 非测试引用 **0 → 1**（A1 = 2 命中） |
| **T2** ② 记忆台 + 按人擦除 + 删除全部记忆 + 群聊近期上下文条数 | ✅ 4 个能力全部实现；调用面 **3 个非测试文件**（A2）；新测试 **24 passed**（A4） |
| **T3** ③ 区块页（新建 `ZonesSettingsPanel.tsx` + 注册 `section="zones"`） | ✅ 三处注册到位（`zones` 命中 **4**）；8 个 preload 方法全接上（含 `addZoneManualGroup`） |
| **T4** 顺手修掉两条存量失败 | ✅ **`Test Files 2 failed → 0 failed`**；③ 148 处令牌改名 + ④ `window.confirm` → `Modal.confirm` |

**非目标遵守情况（N1–N6，逐条确认没越界）**：

| # | 非目标 | 遵守情况 |
|---|---|---|
| **N1** | 不推送 `origin` | ✅ **未推送**（`git push` 一次都没执行） |
| **N2** | 不做 UI 重排版（不改官方既有组件的布局/样式/文案） | ✅ 3 个 CSS 共 152 行改动**机械证明为纯令牌改名**（去掉令牌名后差异行 = **0**）；官方既有组件的布局/文案**零改动** |
| **N3** | 🔴 不做 `ApiConfigSection`（H-16） | ✅ **未接回**（该组件仍无入口，符合已拍板 B）<br>⚠️ **但它的 CSS 被改了令牌名** —— 属"修存量失败"的机械连带，**不是接回入口**；已登记 H-18 并在 §五 偏差 1 说明 |
| **N4** | 不改后端 IPC 契约 | ✅ 提交的 15 条路径里**没有** `src/main/**` 或 `src/preload/**`；未新增/改名任何 IPC 通道，未改任何 preload 方法签名 |
| **N5** | 不引入新依赖 | ✅ A10：`package.json` / `package-lock.json` 改动 **0 行** |
| **N6** | 不动 4 个「里子」模块本身 | ✅ `git diff --name-only` 里**没有** `src/renderer/settings/**` 任何路径；它们**原封不动**留在仓库里当参照 |

**S 系列停止条件核对**：

| # | 条件 | 结果 |
|---|---|---|
| **S1** | P2 基线 ≠ F7 四个数字 | ✅ **未触发**（逐字相同：`2 failed \| 559 passed (561)` / `2 failed \| 5403 passed \| 1 skipped (5406)`） |
| **S2** | 三套 `tsc` 出现新增错误 | ⚠️ **中途触发过两次，均已修复后才继续**：`TS2307`×5 + `TS7006`×10（`ZonesSettingsPanel.tsx` 的相对路径深度写错一层）→ 修正后 0；`TS2722`（§五 偏差 3）→ 修正后 0。**最终 0/0/0** |
| **S3** | 全量测试出现**新的**失败文件 | ✅ **未触发**（最终 `0 failed`；`default-dialogs-regression.test.ts` 的路径清单守卫**没有**被打破——本次未删任何文件） |
| **S4** | T4 的 CSS 修复需要动 >3 个文件 | 🔴 **触发**（实测 **3 个**文件 / 148 处）→ **停下报告** → H-18 拍板 A → 继续 |

---

## 十、回写清单 ★（**未勾完不得提交**）

| 触发条件 | 回写目标 | 回写内容一句话 | 已勾选 |
|---|---|---|---|
| **T2** 基线数值被改写 | `BLUEPRINT-总蓝图.md` §九 | 新增「**当前基线（P9 之后，已提交）**」整段（HEAD `99932fb1` / tag / 15 文件 +2295−176 / 全量 0 failed / 11 项 6/8/5/11/13/6/10/5/2/9/4 / 回退与推送状态）；**P8 基线整段移入「历史基线（仅存档）」**（未删除） | [x] |
| **T2** 基线数值被改写 | `BLUEPRINT-总蓝图.md` §四 P9 行 | P9 由「⏳ 待执行」→ ✅ **已完成**（提交哈希 / tag / 全绿数字 / S4 命中与 H-18 拍板），并链到本报告 | [x] |
| **T1** 判据被修正 | `BLUEPRINT-总蓝图.md` §二 判据台账 | 新增 **J-26 / J-27 / J-28 / J-29 / J-30** 五条（各含旧判据 / 新判据 / 依据 / 生效范围） | [x] |
| **T1** 判据被修正 | `HUMAN-人工验证台账.md` §三/§四/§五 | **H-15 销账**（①②③，附判据）；**H-02 / H-03 转「待人工复验」**；**H-17** 更新为「P9 已施工完毕，等人判」；**新增 H-18** 登记与拍板；新增「P9 销账回执」四行表 | [x] |
| **T2** 基线数值被改写 | `验证作业单.md` A 类 + §三 开头 | **A-7** 期望值更新为 `0 failed \| 562 passed (562)` / `0 failed \| 5429 passed \| 1 skipped (5430)`（**旧值 P8 / P8 前均保留**）；§三 开头「前置失效说明」→ **「前置失效已解除」**，5 条逐条给出 P9 后的入口状态 | [x] |
| **T3** 蓝图被实测推翻 | [PHASE-9-功能入口接回.md](PHASE-9-功能入口接回.md) §二 / §四 | 见下方「§十 附 · 蓝图就地标注」——按 **J-13** 一律以执行者实测为准，就地标注 4 处 | [x] |
| **T4** 新增经验 | `../methodology/BLUEPRINT-经验库-通用.md` §6e（**H/M 归位**） | 新增 **C24**（M）/ **D18**（H）/ **D19**（H）/ **D20**（H）四条 + 候选「形状 5」；抬头条数 **56 → 60**（H 44→46 / M 12→14）；场景索引 3 处补编号 | [x] |
| **T4** 新增经验 | `../methodology/BLUEPRINT-经验库-具体坑.md` §8（**L 归位**） | 新增 **X15 / X16 / X17** 三条（分落 §2 与 §4）；抬头条数 **57 → 60**（§2: 4→5 / §4: 7→10） | [x] |
| **T4** 新增经验 | `BLUEPRINT-经验库-全量台账.md` | ⚠️ **未回写** —— 该台账是"**原 186 R + 10 X**"的**来源档案**（逐条带 `文件:行号` 出处），P7/P8 的新增条目（X10/X11/X12/X13/X14）**同样未入**，沿用既有惯例：**新条目只进两个分级库**，台账保持"原取样"形态。**如需入账，应与 P7/P8 的 5 条一并补**（已在下条「待做」中登记） | [x] |
| **T4** 新增经验 | 本文件 §六 | 新坑表 8 条（C24 / D18 / D19 / D20 / E7 / X15 / X16 / X17）逐条写明"建议追加进经验库" | [x] |

> **规则核对**：① 四类触发（T1/T2/T3/T4）**逐条过完，无一行留空**；
> ② 回写**只「新增 + 标注」，未静默删除任何旧值**（P8 基线整段保留在「历史基线」、
> 作业单 A-7 的 P8 与 P8 前两版旧值均保留、判据台账旧判据全留）；
> ③ **无任何 `[ ]`** → 可提交、可宣告本 Phase 施工完成（**唯 H-17 待人判**，那是 H-B 退出条件，非施工项）。

### §十 附 · 蓝图就地标注（T3，按 J-13 以实测为准）

| 位置 | 蓝图原写法 | 实测 | 处理 |
|---|---|---|---|
| §四 4.4 / F6 ③ | 「`ToolConsolePanel.css` 实测 ~50 处 `var(--cy-…)`」，只提 1 个文件 | 禁-用面内**逐令牌**计 6 类共 **80** 处；**另有 2 个违规文件**（57 + 11） | 见 §五 偏差 1；**已触发 S4 并由 H-18 拍板** |
| §四 4.2 / A2 判据 | `git grep -l -E '…' -- src/renderer/react`（期望 ≥2 个文件） | 该命令**只搜已跟踪文件** → 返回 **0 个代码文件** | 见 §五 偏差 2；判据台账 **J-26** |
| §二 F7 / §六 A6 | T4 后目标 `561 passed` / `5405 passed` | 实测 `562 passed` / `5429 passed`（**多 1 文件 + 24 用例**） | 见 §五 偏差 6；判据台账 **J-28** |
| §六 A10 | `HEAD~1` 口径 | **提交前**该 ref 指 P7 而非 P8 → 得 2 行 | 见 §五 偏差 7；判据台账 **J-29** |
| §二 F2 行号 | `preload/index.ts:600-638` / `deleteAll :609` / `restartApp :611` / `erasePreview :617` / `erasePerson :619` / `getZoneSnapshot :623` / `addZoneManualGroup :632` | **逐条复核，全部吻合**（该方法块仍为 `:597-638`，`contextBridge` 在 `:641`） | ✅ **无需修正** |
| §二 F5 坐标 | `AppearanceSettingsPage.tsx` `:83` 联合类型 / `:266` 导航 / `:282` 三元链 | `:83` 与 `:266` **吻合**；三元链实测在 **`:282`**（+1 行 import 后仍吻合） | ✅ **无需修正** |
| §二 F1 坐标 | `ChatPageNavigation.tsx` `:12` 插 import / `:132` 后插 JSX | **逐条吻合**（`:11` = SidebarToggle、`:12` = UserAvatar、`:132` = MomentsModeButton） | ✅ **无需修正** |
| §二 F4 常量 | `DEFAULT = 10` / `MIN = 3` / `MAX = 50` | **逐条吻合**（`general-settings.ts:197-199`） | ✅ **无需修正**（并已写进 `rules.test.ts` 的漂移守卫） |

---

## 十一、施工记录（规范 §8）

### 子节 0 · 开工前状态

| 项 | 实测 |
|---|---|
| `git log -1` | `51a20338 merge(P8): 完成三方合并 —— 本地 12 天工作重接到官方 b11b8851` |
| 父提交 | `598dfb75 b11b8851`（**2 个** = 仍是合并提交） |
| `git status` 分组 | 默认口径 `?? x17`；`-uall` 口径 `?? x139`（**无 M / D / A**） |
| P2 全量测试四个数字 | `Test Files 2 failed \| 559 passed (561)` / `Tests 2 failed \| 5403 passed \| 1 skipped (5406)` / `ERR_MODULE_NOT_FOUND = 0` / `Duration 52.29s` ✅ **与 F7 逐字相同** |
| P3 三套编译 | `0 / 0 / 0` |
| 环境例外 | **`npx` 不可用**（PS 执行策略）→ 全程改用 `& D:\data\node24\npx.cmd`；`node` = v24.21.0 |

### 子节 1 · 主进程 / 实际落地（蓝图 → 实际 → 原因）

| 蓝图 | 实际实现 | 原因 |
|---|---|---|
| P2 用 `Tee-Object -FilePath` 落盘 | 改用 `*> $log` 整文件重定向 | `Tee-Object` 会把 **758 KB** stdout 灌进会话（作业被中止）；判据不变 |
| A2/A3 用 `git grep -l …` | 加 `--untracked` + 限定 `*.ts`/`*.tsx` | 默认只搜已跟踪文件 → 新文件**看不见**（**J-26**） |
| T4 只改 `ToolConsolePanel.css` | 改 **3 个** CSS（148 处） | S4 命中 → H-18 拍板 A |
| 4.2 「建议落点」`memory-console/{rules,rules.test,MemoryManagerSection,DangerZoneSection}.tsx` | **完全按建议落点** | 蓝图已给合理结构 |
| T3 参照物 `zones/{panel,state,dom,picker,manual-group}.ts` | 额外新建 `features/settings/zones/rules.ts` | 抄写需要落点；与 `memory-console/rules.ts` 对称 |
| 提交信息里的 scope 描述 | 逐字采用蓝图 §四 4.6 给的文本 | 蓝图已给全文 |

### 子节 2 · 蓝图未覆盖、施工中发现的漏洞

| 位置 | 问题 | 修复 |
|---|---|---|
| `rules.ts` `normalizeGroupContextLimit` | `Number(null) === 0` → 空输入被夹成 min=3（**里子模块同样有此缺陷，且从未被测过**） | 改为"只认 number / 非空数字字符串"；补 6 条边界用例（**§五 偏差 5**） |
| `rules.test.ts` 缺"镜像值漂移"守卫 | `DEFAULT/MIN/MAX` 是**镜像值**，主进程一改就静默漂移（**F18 同型**：`tsc` 看不见） | 新增 `describe`，**直接 `readFileSync` 主进程源文件**用正则逐字比对三常量（**§六 F18 行**） |
| `ToolConsolePanel.tsx` `clearAudit` | 可选链窄化不跨闭包 → `TS2722` | 先把方法抓成局部 `const clear`（**§五 偏差 3**） |
| `ZonesSettingsPanel.tsx` 相对路径深度 | 该文件比 `memory-console/*` **高一层**，import 前缀要少一级 → `TS2307`×5 + `TS7006`×10 | 修正 7 条 import 前缀（`../../..` 而非 `../../../..`）→ `tsc` 0 |

### 子节 3 · 蓝图最大不确定点的核实结论

蓝图 §二 抬头已提示"按 J-13，动手前仍要自己扫一眼坐标"。**逐条核实结果**：
§十附的 8 处坐标断言中，**6 处完全吻合**（F1 / F2 / F4 / F5 的 `:83`+`:266` / F6 根因 / F7 数字），
**4 处需要修正**（T4 规模、A2 命令、A6 目标值、A10 ref）—— 全部已就地标注并沉淀为 J-26…J-30。
**结论：J-13 的价值在本 Phase 再次被证实**（最严重的一处偏差就是靠它发现的）。

### 子节 4 · 有意保留的"不处理"点

| 项 | 为什么不管 |
|---|---|
| 4 个「里子」模块（`memory/{delete-all,erasure-flow,manager}.ts`、`zones/panel.ts`）**原封不动** | **N6 明文要求**（它们是参照物）。抄出来的 `rules.ts` 里**已修**的 `Number(null)` 缺陷**不回写进里子模块** —— 那会违反 N6，且它们无测试覆盖、不在类型检查面内，改动风险大于收益。**P10 收口时一并处置**（交接清单第 3 条） |
| `ApiConfigSection.css` 的令牌被改，但**组件仍不接回** | N3（H-16 已拍板 B）。**改的是令牌名（存量失败的机械连带），不是接回入口** —— 两者是不同的事 |
| 3 个 CSS 工作区是 **LF**（仓库约定 CRLF） | **实测为无害**：`core.autocrlf=true` 下 `git add` 会把 CRLF clean 成 LF，**索引/提交里的 blob 与"工作区本来就用 CRLF"逐字节相同**；且 `--ignore-cr-at-eol` 与原始口径的 `numstat` **数字相同**（**J-30**）。**不为消除一个警告去改 5 个文件的行尾**（那会引入真实的行尾 churn 风险） |
| `.cyrene-merge-analysis/p9/**` 17 个分析产物**不进提交** | 沿用 P0–P8 惯例（分析产物留工作区，`??` 态） |
| 未给 `MemoryManagerSection` / `DangerZoneSection` / `ZonesSettingsPanel` 写组件级渲染测试 | 仓内**没有** React 组件测试基础设施（既有测试均为 node 环境的纯逻辑/扫描型测试）；且这三处是**接线层**，其正误由 **H-17 目视 5 步**判定（蓝图 §五 5.2 已如此设计）。**纯逻辑部分已 100% 覆盖**（24 条） |

### 子节 5 · 验收（实测数字）

| 命令 | 结果 |
|---|---|
| `& D:\data\node24\npx.cmd tsc -p tsconfig.main.json` | **EXIT=0**，0 行输出 |
| `& D:\data\node24\npx.cmd tsc -p tsconfig.preload.json` | **EXIT=0**，0 行输出 |
| `& D:\data\node24\npx.cmd tsc -p tsconfig.renderer.json` | **EXIT=0**，0 行输出 |
| `& D:\data\node24\npx.cmd vitest run` | **EXIT=0**；`Test Files 562 passed (562)` / `Tests 5429 passed \| 1 skipped (5430)`；失败文件 0；`ERR_MODULE_NOT_FOUND` = 0 |
| `& D:\data\node24\npx.cmd vitest run <13 文件>` | **EXIT=0**；`13 passed (13)` / `273 passed (273)` |
| `& D:\data\node24\npx.cmd vitest run <语料2 + 探测器1>` | **EXIT=0**；`3 passed (3)` / `26 passed (26)` |
| `& D:\data\node24\npx.cmd vitest run …/memory-console` | **EXIT=0**；`1 passed (1)` / `24 passed (24)` |
| `& D:\data\node24\npx.cmd vitest run theme-token-contract default-dialogs-regression` | **EXIT=0**；`2 passed (2)` / `9 passed (9)` |
| 11 项保护功能基线 | **11/11 达标**（6/8/5/11/13/6/10/5/2/9/4） |
| `git log -1 --format='%h'` | **`99932fb1`** |
| `git status --porcelain` | `?? x18`（默认口径）—— **无 M/D/A 残留** |

### 子节 6 · 验收后修复

**无**（提交后未再改动任何源文件；提交后仅回写文档：总蓝图 / 台账 / 作业单 / 两个经验库 / 本报告）。

### 子节 7 · 经验追加

见 §十 回写清单的 T4 三行：**通用库 +4 条**（C24 / D18 / D19 / D20）、**具体坑库 +3 条**（X15 / X16 / X17）。
**全量台账未入**（理由已写在 §十 对应行，与 P7/P8 惯例一致）。

### 子节 8 · 待做 / 未做（如实列出）

| 项 | 状态 | 说明 |
|---|---|---|
| **H-17 目视 5 步 + 3 张截图** | ⏳ **待人判** | 🔴 **P9 的退出条件**；机器侧判据已全绿 |
| **H-02 / H-03 人工复验** | ⏳ 待人工 | 控件与入口已就位；真实群聊生效仍需环境 |
| 推送 `origin`（**H-B6**） | ❌ **未做（非目标 N1）** | 由项目所有者决定 |
| **`ApiConfigSection` 接回**（H-16） | ❌ **未做（已拍板 B）** | 原物都在，随时可接 |
| 4 个「里子」模块处置收口 | ⏳ **转 P10** | 删掉 or 补测试纳入类型检查面 |
| 全量台账补 `- 等级:` 行 | ⏳ 未做 | 与 P7/P8 的 5 条一并补（见 §十 对应行） |
| 组件级渲染测试 | ⏳ 未做 | 仓内无此基础设施；接线层由 H-17 人验覆盖（见子节 4） |

### 子节 9 · 施工记录里的缺陷编号（D/O）

| 编号 | 现象 | 根因 | 影响 | 修复口径 | 修复 | 复现证据 | **为什么以前没被发现** |
|---|---|---|---|---|---|---|---|
| **D1** | `normalizeGroupContextLimit(null,10,3,50)` → `3`（期望 `10`） | `Number(null) === 0`（**不是 NaN**）→ 通过 `isFinite` → 被夹成 min | 「用户没填」被静默写成「填了 3」；旧面板同样存在 | 执行者判定为实现缺陷 | 改类型门 + 补 6 条边界用例 | `rules.test.ts` 首跑 `1 failed / 21 passed` | 🔴 **里子模块从来没有测试**（H-07 之后它们既无覆盖、也不在类型检查面内）→ 这类缺陷**结构上无人能发现** |
| **D2** | A2 判据返回 0 个代码文件 | `git grep` 默认只搜已跟踪文件；新文件未 `git add` | 会把"做完了"判成"没做"，进而去改正确的代码 | 判据缺路（非代码缺陷） | 加 `--untracked` + 限定代码文件 + 先跑对照 | `git grep -l` = 2 个 `.json` → `--untracked` = 3 个 `.tsx/.ts` | 蓝图撰写期的文件**都已入库**，所以撰写者**从未遇到过这个状态** |
| **D3** | `TS2722` 于 `ToolConsolePanel.tsx:294` | 可选链窄化不跨函数边界 | 编译不过（S2 命中） | TypeScript 固有行为 | 抓局部 const | `tsc -p tsconfig.renderer.json` EXIT=2 → 修后 EXIT=0 | 原代码是 `window.confirm(...)`（**非**可选成员），改写成 `Modal.confirm` 时才**新引入**这个形态 |
| **D4** | `TS2307`×5 + `TS7006`×10 于 `ZonesSettingsPanel.tsx` | 该文件比 `memory-console/*` 高一层，import 前缀多写了一级 | 编译不过（S2 命中） | 位置判断失误 | 修正 7 条 import 前缀 | `tsc` EXIT=2 → 修后 EXIT=0 | —— |
| **O1** | `ToolConsolePanel.css` 实测 **80** 处违规（蓝图写"~50 处"） | 蓝图按"行数"粗估，未逐令牌计数 | 影响工作量估计 | —— | 逐令牌精确计数并记录 | 6 类令牌 16+16+15+15+11+7 = **80** | 撰写期的"~50"是**目测**而非 `Select-String -AllMatches` 计数 |
| **O2** | 提交范围 15 文件，比蓝图 §七 列出的 **12** 条多 **2** 个 CSS + 1 个 `zones/rules.ts` | 前 2 个来自 H-18 拍板 A；后 1 个来自抄写落点选择 | 无（均为必要改动） | —— | 已在 §二 产出物表逐条列明 | `git show --numstat` 15 行 | —— |

---

## 十二、撰写者复核补正（P9 期回填，2026）

> **复核人**：撰写者。**方式**：不采信报告自述，逐条独立复跑（含**全量测试独立复跑**）。
> **结论**：**采信**。10 项 A 判据 + T1–T4 + N1–N6 + S1–S4 **未发现一处虚假陈述**；8 条偏差与 D1–D4 / O1–O2 全部与我实测吻合。
> 下面 3 条是**口径 / 遗留补正** —— 其中第 1 条**顺带修掉撰写者自己在 P8 期的一处错误**。

### 12.1 我独立复现的断言（逐条对得上）

| 报告断言 | 我的独立实测 | 判定 |
|---|---|---|
| 提交 `99932fb1`，**单父** `51a20338` | `git log -1 --format='%h %p'` → 吻合 | ✅ |
| tag `phase9-entries` | `git tag -l 'phase9*'` → `phase9-entries` | ✅ |
| `15 files changed, +2295 −176` | `git diff --stat HEAD~1 HEAD` → **逐字相同**；`--name-only` = 15 条 | ✅ |
| **A6 全量 `0 failed \| 562 passed (562)`** | 🔴 **我独立复跑**（`& D:\data\node24\npx.cmd vitest run`）：`Test Files 562 passed (562)` / `Tests 5429 passed \| 1 skipped (5430)` / **exit 0** / `ERR_MODULE_NOT_FOUND` = 0 / Duration **53.13s** | ✅ **逐字相同，且 0 失败** |
| A1 ① 接回 | `git grep -l -F -e '/ToolConsoleButton' -- src` → 仅 `ChatPageNavigation.tsx`（非测试） | ✅ |
| A2 ② 调用面 = 3 个非测试文件 | 实测 `DangerZoneSection.tsx` + `MemoryManagerSection.tsx` + `rules.ts`（另 2 个 i18n json） | ✅ |
| A3 ③ 三处注册（`:84` 类型 / `:268` 导航 / `:284` 渲染） | 逐行吻合；区块调用面 = `ZonesSettingsPanel.tsx` | ✅ |
| A8 两项回升（`记忆管理控制台 4→6`、`群上下文上限 8→9`） | `git grep -l` 实测 **6** / **9** —— 与报告逐项吻合 | ✅ |
| A10 无新依赖 | `git diff --name-only HEAD~1 HEAD -- package.json package-lock.json` = **0** | ✅ |
| **N2** 3 个 CSS 是**纯令牌改名** | 🔴 我独立复算：把**整个 `var(--cy-*/--rb-*, <fallback>)` 表达式**归一后逐字比较 → **3/3 完全相同**（仅剩尾部空行的假差异）；`--cy-*` 残留：`ToolConsolePanel.css` 0 / `UsageBadge.css` 0 | ✅ **成立** |
| **N6** 4 个「里子」模块未动 | 提交的 15 条路径里**没有** `src/renderer/settings/**` | ✅ |
| N4 未碰后端 | 15 条路径里**没有** `src/main/**` 或 `src/preload/**` | ✅ |
| 6 个新增文件的行数 | `git diff --numstat` → `197 / 254 / 529 / 188 / 417 / 131` → **与报告逐字相同** | ✅ |
| T4-④ 无裸弹窗 | `src/renderer` 非测试代码里 `confirm(` / `alert(` 只剩 `default-dialogs-scanner.ts` 的**文档注释**与 `FeedbackProvider.tsx` 的**方法定义**（AST 扫描器按设计豁免） | ✅ |
| 回写清单 T1–T4 落地 | 总蓝图 `J-26…J-30` = **5 条**；`当前基线（P9 之后）` 段 = 1；台账 `H-18` = 3 处；作业单 `A-7` 新值已在 | ✅ |

### 12.2 补正 1 · 🔴 **PS 5.1 `Get-Content` 不带 `-Encoding UTF8` 会丢行**（顺带修掉我 P8 期的错）

- 本次核验我一度用 `(Get-Content <新文件>).Count` 数行数，得 `164 / 245 / 519 / 180 / 411 / 116`，**全部低于报告值**，**差点误判报告"数字虚高"**。
- 字节级复核（`rules.ts`）：**LF = 197**、`git diff --numstat` = **197**、`Select-String -Pattern '^'` = **197**，而 `Get-Content`（默认）= **164**；加 `-Encoding UTF8` = **197** ✅
  ⇒ **默认编码（本机 ANSI/GBK）读 BOM-less UTF-8 文件会静默丢行**。
- 🔴 **这同时结清了 P8 期那桩「598 / 556 / 617」悬案，并证明我在 [`PHASE-8-完成报告.md`](PHASE-8-完成报告.md) §十一 11.3 里写的「617」是错的**：
  - `history-log.ts` 的真实总行 = **598**（三口径一致）；`Measure-Object -Line` = **556 = 598 − 42 个空行** ⇒ "它不数空行"的解释**成立**；
  - 我写的 **617** 来自把 `git cat-file` 的输出**经 PS 重定向成 UTF-16** 后再数 `\n` 的**伪值**；
  - ⇒ **P8 报告原文的「598 行」从头到尾是对的**，错的是我的"更正"。已在两份文档里就地标注（**旧值保留**）。
- **权威口径（已验证四者一致）**：`git diff --numstat`（新增文件）＝ LF 计数 ＝ `Get-Content -Encoding UTF8` ＝ `Select-String`。
- ⇒ 判据沉淀 **J-31**；经验库新增 **X18**。

### 12.3 补正 2 · i18n「各新增 150 个叶子键」**不可复现**（口径缺失）

- 我按 `"key":` 出现次数口径实测：两语言**各新增 121 处**（去重 **115** 个名字）、**丢失 0**、**两语言键集合差集 = 0**（各 2230 处）。
- ⇒ 报告 §二 的 **150 无口径说明、不可复现**（与 **J-28** 同型）。**实质结论不受影响**：两语言一致 + 零丢失 + 全量 0 失败（H-04 的代理指标**通过**）。
- ⚠️ **不是缺陷**，只是口径缺失 —— 已并入 **J-31** 的"计数必须写口径"。

### 12.4 补正 3 · `ApiConfigSection.css` 仍有 **7 处** `var(--cy-pill-*)`（观察项，非缺陷）

- 实测残留：`:103 / :149 / :150 / :223 / :260 / :287 / :541` —— 全是 `--cy-pill-border`（6）与 `--cy-pill-bg`（1）。
- **不在禁用面内**：`theme-token-contract.test.ts:69` 的正则只覆盖 `accent / bg / border / danger / surface / text / shadow-*` 这些**颜色别名** ⇒ 测试全绿**合理** ✅。
- ⚠️ 但它们**全仓库无任何声明** ⇒ 这 7 处**永远走 hex 兜底**（`#ff9fbd` / `#fff9fb`）。该文件属 **H-16（已拍板 B：不接回）**，故**不影响当前 UI**；**将来若拾起 H-16，需一并处理这 7 处**（已作为 H-16 的遗留备注登记）。

### 12.5 本次复核的环境教训（给后续 Phase）

🔴 **本机 `npx` 不可用**（执行策略 `Restricted` → `npx.ps1` 被拒），**必须** `& D:\data\node24\npx.cmd <tool>`。
执行者已在 §三 3.0 实测并登记 **X15**；**我这次复跑也踩了同一个坑**（第一条复跑命令直接失败、日志都没生成）⇒ **建议把总蓝图 §三「环境三坑」升级为「环境四坑」**，写进所有后续 Phase 的必读项。

### 12.6 追加（P9.5 期）：🔴 **H-17 目视验收抓到一处机器判据结构上抓不到的缺陷**

项目所有者目视 H-17 后反馈：**「记忆控制台-查看详情和区块设置的排版看起来怪怪的」**（证据图：[`证据/H-17-1-记忆页-排版问题-2026.png`](证据/H-17-1-记忆页-排版问题-2026.png) · [`证据/H-17-2-区块页-排版问题-2026.png`](证据/H-17-2-区块页-排版问题-2026.png)）。
**入口本身全部正常**（[`证据/H-17-3-渠道控制台-2026.png`](证据/H-17-3-渠道控制台-2026.png) 显示控制台排版无误）—— 坏的只是**新面板的样式层**。

**根因（撰写者实测定位）**：

| # | 事实 |
|---|---|
| 1 | 三个新面板**一个 CSS 文件都没新建、一个 `import "./x.css"` 都没有** |
| 2 | 它们共用到 20 个 `cy-*` 类，其中 **5 个在 `src/renderer/react/**/*.css` 里查无定义**：`cy-memory-manager__detail` / `__group` / `__preview` / `__trace`、`cy-zone-card`（**全是容器类**） |
| 3 | 后果：容器退化为无样式块 ⇒ 记忆管理台详情区**无卡片、无分组分隔、标题用小注释字号**；区块卡**无卡片外观**，其成员列表 `cy-memory-list`（自带 `padding: 6px 16px`）比兄弟节点**多缩进 16px**，底部操作行左对齐不一致 → 即截图里"漂浮的移出、散落的 `1 2个成员 改名 删除`" |
| 4 | 🔴 **为什么 10 条 A 判据全绿也没抓到**：**CSS 类名不参与类型检查**、且**仓库没有任何测试覆盖"类名是否有定义"** —— 这是判据缺口，已立 **J-32**（含可复跑的判据命令） |
| 5 | ✅ **修复资产完好**：旧世界样式仍可从 `git show phase0-full:src/renderer/settings/settings.css`（**5,300 行**）回收 —— 其中 **`memory-manager*` 38 条 + `zone*` 37 条**，正是这两块所需的样式；当前 react 的 56 个 CSS 里这些选择器**一条都不剩**（随旧设置窗在 P4 被删） |

**判定**：**不是 P9 的功能缺陷**（入口、数据、交互全部正常），而是**样式层缺失** → 修复登记为 **H-19**，修复蓝图 [`PHASE-9.5-新面板样式补齐.md`](PHASE-9.5-新面板样式补齐.md)（回收旧选择器 + 令牌化 + 类名对齐 + 三处 import）。
**这也正是 H-17 这类人工环节存在的意义**：机器判据再全，也答不了"**看起来对不对**"。
