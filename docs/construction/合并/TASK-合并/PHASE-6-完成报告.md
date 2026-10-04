# Phase 6 完成报告：骨架重写与旁听保留（Tier C）

> **状态**：✅ **已完成**（`UU` = 0；9 文件 / 36 块全部归零）
> **执行日期**：2026（单次会话）
> **执行者**：agent（无对话历史，仅凭 [PHASE-6-骨架重写与旁听保留.md](PHASE-6-骨架重写与旁听保留.md) + [BLUEPRINT-总蓝图.md](BLUEPRINT-总蓝图.md)）
> **结论**：**36 个冲突块全部解决、全仓库冲突标记归零**；A9 定向门禁 **12 文件 / 269 tests 全绿**（无需归因）；`tsc` 的 **TS1185 = 0**（22 → 1 条，唯一剩余属①类）；**旁听生命线由一条经突变验证的探测器守住**；11 项受保护功能 **11/11 与基线一致**。
> **报告规范**：`../methodology/BLUEPRINT-撰写规范.md` §5（**10 节**）

---

## 一、执行摘要

| # | 验收项 | 结果 |
|---|---|---|
| A1 | 冲突标记归零（本 Phase 9 文件 + **全仓库**） | ✅ |
| A2 | 范围正确：`UU` = 0（且 `UD`/`DU`/`AA` = 0） | ✅ |
| A3 | D1 施工面清零 + `conversation-binding-store.ts` 保留 | ✅ |
| A4 | 隐私边界不回归（owner 域隔离 + `read_memory` 限域 + 真实测试） | ✅ |
| A5 | 群聊旁听链路在（`history-log` 零改动） | ✅ |
| A6 | **静默失效探测器**（新建 + **突变验证有效**） | ✅ |
| A7 | 语料豁免边界完好（D4 守卫） | ✅ |
| A8 | 静态检查（TS1185 = 0 + 逐条可归因） | ✅ |
| A9 | 定向 vitest 门禁 | ✅ **12 文件 / 269 tests 全绿** |

**验收总计**：9 项主判据 → **PASS 9 / FAIL 0**

**人工环节回执**（规范 §4.1；缺失即不能判定完成）：

- **① H-A 决策答复（原样抄录）**：
  - **H-A1 旁听是否迁进 CTA** = **不迁**（立项决定 C，施工前已拍板）
  - **H-A2 D1 是否仍成立** = **成立**（总蓝图 §五 D1）
  - **H-A3（= 台账 H-10）两处既有行为** = **「两处都保持现状（推荐）」** —— ① 区块 `injectOwnerProfile` 画像注入判定 ② `read_memory` 的 `getL2ForScope` 域过滤（P6 验收阶段取得；施工已按此执行并实测通过）
- **② H-B 每条核对项结论**：H-B1 ⏳ **待项目所有者逐条 ✅/❌**（数据已备齐，见 §四 子节 5）；H-B2 ✅ **由 A6 探测器代替**（含突变验证）
- **③ H-C 已登记进 HUMAN 台账的编号**：**H-08 / H-09 / H-11 / H-12 / H-13 / H-14**（§三；其中 **H-13 代码级部分本次已销账**，H-10 已销账）

---

## 二、最终状态（交接给 P7）

```
HEAD        = 598dfb75  "merge(P3): checkpoint 本地工作（合并前基线）"   ← P4/P5/P6 零提交
MERGE_HEAD  = b11b8851  （官方 master，**合并仍在进行中**）
冲突        = UU = 0 / UD = 0 / DU = 0 / AA = 0（git diff --diff-filter=U 无输出）
冲突块      = 0（**全仓库** src 的 <7 /=7/ >7 标记均为 0）
索引条目    = 2423（git ls-files -s）
未跟踪      = 26 行 ??（**不作判据**；P5 基线 24，+2 为本 Phase 产物）
Node        = v24.21.0（每条命令前需前置 PATH: D:\data\node24）
npm         = 11.19.0 ; registry = https://registry.npmmirror.com ; vitest 4.1.9
```

**产出物**：

| # | 文件 | 内容 | 规模 |
|---|---|---|---|
| 1 | `src/main/channels/{bootstrap,channel-context,dispatcher}.ts` | 渠道主链路：官方 CTA journal 骨架 + 本地历史/旁听能力并存 | 3 文件 |
| 2 | `src/main/orchestrator/{agent-runtime,build-options}.ts`、`tools/registry/tool-registry.ts` | `trace` 传参链 + owner 域隔离 + `read_memory` 限域 | 3 文件 |
| 3 | `src/main/channels/{bootstrap,channel-context,dispatcher}.test.ts` | 同侧改造后的回归网（22 + 17 + 29 = **68 tests**） | 3 文件 |
| 4 | **`src/main/channels/group-context-flow.test.ts`** | **新建 · 静默失效探测器（4 tests，已突变验证）** | **新文件** |
| 5 | `.cyrene-merge-analysis/p6/pre-hashes.txt` | 9 个文件改动前 blob 哈希 | 9 行 |
| 6 | `E:\AI_Chating\cyrene-agent-p6-backup` | 9 文件原始态备份（回退级 1） | 9 文件 |
| 7 | `BLUEPRINT-总蓝图.md` 回写 | §二 判据台账（+J-13/J-14）、§四 Phase 索引、§八 8.2 A3、§九 基线、§十一 文档索引 | 5 处 |
| 8 | `HUMAN-人工验证台账.md` 回写 | H-10 销账、H-13 代码级销账、H-13② 判据修正、H-08 说明、§五 记录 | 5 处 |
| 9 | `经验库-通用.md` / `经验库-具体坑.md` | 新增 **C21 / C22 / A40 / A41 / F17 / A42 / A43** 共 7 条 | 2 文件 |
| 10 | `PHASE-6-骨架重写与旁听保留.md` | §十一 目标达成核对回填 + §十二 施工记录 8 个子节 + §十三 回写清单全闭合 | 本 Phase 蓝图 |

---

## 三、执行过程（实际敲的命令与实测输出）

### 3.1 前置条件（P1–P10 逐条实测）

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$env:PATH = "D:\data\node24;" + $env:PATH
cd E:\AI_Chating\cyrene-agent
git rev-parse --short MERGE_HEAD          # b11b8851  ✅
git rev-parse --short HEAD                # 598dfb75  ✅
(git status --porcelain | Where-Object { $_.Substring(0,2) -eq 'UU' } | Measure-Object).Count   # 9  ✅
git status --porcelain | Where-Object { $_.Substring(0,2) -match '^(UD|DU)$' }                 # 无输出 ✅
git status --porcelain -- src/main/channels/history-log.ts                                     # 无输出 ✅
git rev-parse --short phase3-work-snapshot ; git rev-parse --short phase0-full                 # 586eae90 / 34f0669f ✅
node -v                                                                                        # v24.21.0 ✅
```

**P5 的 17 文件归零检查**：无输出 ✅ 　**P10 回写清单**：剩余 `[ ]` 全部为纯文档项（经验库追加 / 蓝图修正），**无"代码相关判据未回写"** → 允许开工 ✅

### 3.2 36 块坐标重扫（判据：36 块 / 9 文件）

```powershell
# 逐文件扫 ^<{7} ... ^={7}$ ... ^{7} 三段
# 实测输出：
 448 lines |  7 blocks | src/main/channels/bootstrap.ts          spans: 21-28,102-117,130-145,171-193,228-238,311-337,373-378
 559 lines |  4 blocks | src/main/channels/bootstrap.test.ts     spans: 9-13,63-79,84-92,220-264
 280 lines |  5 blocks | src/main/channels/channel-context.ts    spans: 2-8,13-48,56-97,185-200,211-264
 469 lines |  1 blocks | src/main/channels/channel-context.test.ts spans: 135-468
 497 lines |  6 blocks | src/main/channels/dispatcher.ts         spans: 45-48,113-120,219-238,244-281,306-345,376-380
1054 lines | 10 blocks | src/main/channels/dispatcher.test.ts    spans: 76-84,98-103,206-277,297-304,309-321,327-351,360-363,385-391,416-425,613-1052
 408 lines |  1 blocks | src/main/orchestrator/agent-runtime.ts  spans: 216-228
1201 lines |  1 blocks | src/main/orchestrator/build-options.ts  spans: 65-94
 484 lines |  1 blocks | src/main/orchestrator/tools/registry/tool-registry.ts spans: 376-391
===== P6 total: 36 blocks / 9 files (expect 36 / 9) =====   ✅ 逐条吻合
```

### 3.3 备份与哈希锚点（4.0）

```powershell
git hash-object -- <9 files> | Set-Content .cyrene-merge-analysis\p6\pre-hashes.txt   # 9 行 ✅
Copy-Item <9 files> E:\AI_Chating\cyrene-agent-p6-backup\<path 以 __ 替换斜杠>        # 9 文件 ✅
```

### 3.4 逐文件施工顺序（类型层 → 上游 → 主链路 → 装配层 → 测试）

按蓝图 §四 的顺序敏感链执行：`channel-context.ts` → `build-options.ts` → `agent-runtime.ts` → `tool-registry.ts` → `dispatcher.ts` → `bootstrap.ts` → 3 个测试文件 → 新增探测器。
**每块处置后立刻对该文件跑 `tsc`**（蓝图 §二 事实 2 的纪律），实测定位成本显著低于批量编译。

### 3.5 关键判定命令（逐文件，均以"期望/实测"给出）

| 文件 | 判定命令要点 | 期望 | **实测** |
|---|---|---|---|
| `channel-context.ts` | 标记数 / D1 三标识 / 本地三方法 / 结构化字段 | 0 / 0 / ≥6 / ≥6 | **0 / 0 / 7 / 9** ✅ |
| `build-options.ts` | 标记 / `ChannelTraceContext\|normalizeGroupContextLimit` / 转录 import / `resolveScopeId\|rootScope` | 0 / ≥4 / ≥3 / ≥3 | **0 / 5 / 8 / 4** ✅ |
| `agent-runtime.ts` | 标记 / `buildAlwaysOnContext` / scene 两项 | 0 / 1（带 trace） / 0 | **0 / 1（L217-218 带 trace） / 0** ✅ |
| `tool-registry.ts` | 标记 / `getL2ForScope` / `getAllL2` | 0 / ~~≥2~~→≥1 / 0 | **0 / 1 / 0** ✅（J-14） |
| `dispatcher.ts` | 标记 / 绑定三标识 / journal 四方法 / 本地三方法 | 0 / 0 / ≥4 / ≥3 | **0 / 0 / 4 / 7** ✅ |
| `bootstrap.ts` | 标记 / `resolveBoundConversationId` / `appendChannelHistory` / `loadRecentHistory` / `journal:` | 0 / 0 / ≥1 / ≥2 / ≥1 | **0 / 0 / 1 / 2 / 1** ✅ |

### 3.6 新增静默失效探测器 + **突变验证**（本 Phase 最关键的一步）

```powershell
npx vitest run src/main/channels/group-context-flow.test.ts      # 4 passed ✅

# 🔴 突变验证：证明它真的能红（不是"结构上不可能失败"的守卫）
Copy-Item src/main/channels/dispatcher.ts $env:TEMP\dispatcher.bak.ts
# 把 appendIncomingContext 调用替换为 null（模拟 bp-7 取 theirs）
npx vitest run src/main/channels/group-context-flow.test.ts      # 4 failed ✅（4 绿 → 4 红）
Copy-Item $env:TEMP\dispatcher.bak.ts src/main/channels/dispatcher.ts -Force
git hash-object -- src/main/channels/dispatcher.ts   # 1cc6d2127319cc1dfc60e1d273f3395ba595b88a
git hash-object -- $env:TEMP\dispatcher.bak.ts       # 1cc6d2127319cc1dfc60e1d273f3395ba595b88a  ← 逐字节一致 ✅
```

### 3.7 全量编译与测试

```powershell
npx tsc -p tsconfig.main.json      # 初始 22 条 → 修完 1 条；TS1185 = 0
npx tsc -p tsconfig.preload.json   # exit 0（全绿）
npx vitest run                     # Test Files 31 failed / 542 passed；Tests 9 failed / 5293 passed / 1 skipped
```

### 3.8 `git add` 与范围确认

```powershell
foreach ($f in $p6) { git add -- "$f" }
git add -- src/main/channels/group-context-flow.test.ts
git status --porcelain | ... # UU = 0 / UD = 0 / DU = 0 / AA = 0
```

---

## 四、验收测试逐项结果

| # | 验收项 | 期望 | 实测 | 判定 |
|---|---|---|---|---|
| A1 | 冲突标记归零 | 9 文件 + 全仓库均 0 | **9 文件 0 / 全仓库 0** | ✅ |
| A2 | 只剩 0 个 `UU` | `UU` = 0 | **UU 0 / UD 0 / DU 0 / AA 0**；`--diff-filter=U` 无输出 | ✅ |
| A3 | D1 施工面清零 | 0 命中 + 落点 1 + store 保留 | **0 命中；`dispatcher.ts:231` 1 命中；`Test-Path` = True** | ✅ |
| A4 | 隐私边界不回归 | ① ≥1 ② ~~≥2~~→≥1 / 0 ③ 全绿 | **① 4 ② 1 / 0 ③ 40 tests 全绿（5 文件）** | ✅ |
| A5 | 群聊旁听链路在 | 1 / ≥2 / ≥1 / 无输出 | **1 / 2 / 1 / 无输出** | ✅ |
| A6 | 静默失效探测器 | 全绿 + 断言落盘 + 含渲染字符串 | **4 passed**；断言 `toHaveLength(2)`（user+assistant 真实落盘）与 `toContain("[小红]: 在聊什么呢")`；**突变后 4 红** | ✅ |
| A7 | 语料豁免边界 | 全绿 | **22 passed**（memory-deletion 15 + group-corpus-isolation 7） | ✅ |
| A8 | 静态检查 | TS1185 = 0 + 逐条可归因；9 文件无 7 类错误 | **main：TS1185 = 0，22 → 1 条（①类，非 9 文件）**；**preload：exit 0** | ✅ |
| A9 | 定向 vitest | 每文件全绿或归因 | **12 文件 / 269 tests 全绿（零归因）** | ✅ |

### A1 · 冲突标记

```
9 文件标记: 0
全仓库（src/**/*.{ts,tsx,json,css,html}）标记: 0
```

### A2 · 范围

```
UU = 0    UD = 0    DU = 0    AA = 0
git diff --name-only --diff-filter=U  →  (none)
9 个文件状态: M（已 staged）；探测器: A
```

### A3 · D1 清零

```
Get-ChildItem -Recurse -Include *.ts,*.tsx -Path src | Select-String 'resolveChannelConversationTarget|resolveBoundConversationId'
→ 0 命中
Select-String src/main/channels/dispatcher.ts -Pattern 'target: ChannelConversationTarget = \{ conversationId: context.sessionId \}'
→ L231（1 命中）
Test-Path src/main/channels/conversation-binding-store.ts → True（N2 遵守）
```

### A4 · 隐私边界（含交叉验证）

```
index.ts  shouldInjectOwnerProfile|resolveScopeId            → 4（L11/168/170/175，判定 + if 分支俱在）
build-options.ts  rootScope()|resolveScopeId                 → 4
tool-registry.ts  getL2ForScope                              → 1（J-14 修正后达标）
tool-registry.ts  getAllL2                                   → 0
tool-registry.ts  resolveScopeId                             → 4（L5 导入 + :255 search / :383 read / :458 write）

npx vitest run src/main/zones/scope.test.ts src/main/memory/memory-scope-isolation.test.ts \
  src/main/orchestrator/tools/registry/tool-registry-memory.test.ts \
  src/main/orchestrator/group-context-injection.test.ts src/main/orchestrator/build-memory-injection.test.ts
→ Test Files 5 passed / Tests 40 passed
```

### A5 · 旁听链路 + `trace` 命脉

```
history-log.ts   export function buildGroupContextBlock        → 1
orchestrator/index.ts  buildGroupContextBlock                  → 2（L8 import + L157 调用）
bootstrap.ts     appendChannelHistory                          → 1（L322 注入点）
git status --porcelain -- src/main/channels/history-log.ts     → 无输出（N3 遵守）

trace 链（四点全通）:
  build-options.ts:127   trace?: ChannelTraceContext                       ← 形参在
  build-options.ts:667   deps.buildAlwaysOnContext(..., trace)             ← 传入
  agent-runtime.ts:217-218  ((userText, messages, trace) => ...)           ← 第 3 参保留 🔴
  orchestrator/index.ts:154  if (trace?.chatType === "group")              ← 消费
  orchestrator/index.ts:157  buildGroupContextBlock(trace.sessionId, limit)
```

### A6 · 探测器（4 tests）

```
✓ ① dispatcher 处理完一条群消息后，channels/history/<sessionId>.jsonl 真的多了一行
✓ ② 群聊 sessionId 的旁听条目能被 buildGroupContextBlock 渲染成 `[说话人]: 正文`
✓ ③ 私聊不触发群上下文块（旁听只服务群聊）
✓ ④ 助手侧也落本地历史（滑窗双向写入）
Tests  4 passed (4)

突变验证：摘掉 appendIncomingContext → Tests 4 failed (4)；还原后 blob 一致
```

### A7 · 语料边界

```
✓ src/main/memory/memory-deletion.test.ts (15 tests)
✓ src/main/corpus/group-corpus-isolation.test.ts (7 tests)
     ✓ 「彻底擦除某个人」跑完之后，语料整棵目录逐字节不变
Tests  22 passed (22)
```

### A8 · 静态检查（22 → 1 条）

```
npx tsc -p tsconfig.main.json
  初次（9 文件标记归零后）: errors = 22  |  TS1185 = 0
  修完 4 处缺口后        : errors =  1  |  TS1185 = 0
  剩余唯一条: src/main/windows/create-aux-windows.ts(36,55): error TS2694:
              Namespace 'Electron' has no exported member 'WindowStatePersistence'

npx tsc -p tsconfig.preload.json → exit 0（0 条）
```

### A9 · 定向门禁（12 文件 / 269 tests）

```
✓ src/main/channels/group-context-flow.test.ts              (4)
✓ src/main/channels/history-log.test.ts
✓ src/main/channels/channel-context.test.ts                 (22)
✓ src/main/channels/dispatcher.test.ts                      (29)
✓ src/main/channels/bootstrap.test.ts                       (17)
✓ src/main/channels/settings-store.test.ts
✓ src/main/orchestrator/tools/registry/tool-registry-memory.test.ts (12)
✓ src/main/orchestrator/group-context-injection.test.ts     (10)
✓ src/main/orchestrator/build-options.test.ts               (62)
✓ src/main/orchestrator/agent-runtime.test.ts               (19)
✓ src/main/settings/settings-facade.test.ts
✓ src/main/conversation-usage-store.test.ts                 (7)
Test Files  12 passed (12)
Tests       269 passed (269)
```

### A1（受保护功能基线）· 11/11 与基线一致

> ⚠️ **口径说明（重要）**：基线 JSON 的 `文件数` 是**含测试文件**的口径。
> 只数生产文件会得到 2/4/3/6/8/5/4/2/1/7/4 —— 那是**假退化**。
> 下表 `now` 列为**与基线同口径**（含 `*.test.ts`）的实测值。

| 功能 | 标识 | 基线 | **实测** | 判定 |
|---|---|---|---|---|
| 记忆管理控制台 | `memory-console` | 4 | **4** | ✅ |
| 按人擦除/身份归属 | `person-erasure` | 8 | **8** | ✅ |
| 区块 zones | `ZONES_` | 5 | **5** | ✅ |
| 渠道审计 | `audit-log` | 11 | **11** | ✅ |
| 工具白名单 | `tool-access` | 13 | **13** | ✅ |
| 关键词策略 | `keyword-policy` | 6 | **6** | ✅ |
| 群语料 | `group-corpus` | 10 | **10** | ✅ |
| 群聊旁听上下文 | `buildGroupContextBlock` | 4 | **5** | ✅ |
| 用量徽章 | `USAGE_BADGE` | 2 | **2** | ✅（P5 新建模块承接） |
| 群上下文上限 | `groupContextLimit` | 11 | **10** | ✅（P4 已归因，非本 Phase 退化） |
| 弹窗确认门 | `confirmValue` | 4 | **5** | ✅ |

### 子节 5 · 全仓库 vitest 的 9 条失败（逐条归因，按 §六 四类）

```
Test Files  31 failed | 542 passed (573)
Tests        9 failed | 5293 passed | 1 skipped (5303)
```

| # | 测试 | 类别 | 归因 |
|---|---|---|---|
| 1 | `VoiceCallPreviewDialog.test.ts` | ① | `motion/react` 未安装 |
| 2 | `AgentSettingsMigration.test.ts` | ① | `simple-icons` 未安装 |
| 3 | `AsrSettingsMigration.test.ts` | ① | `@lobehub/icons` 未安装 |
| 4 | `ChannelsSettingsMigration.test.ts` | ① | 同上 |
| 5 | `McpSettingsPanel.config.test.ts` | ① | 同上 |
| 6 | `ModelSettingsPanel.models.test.ts` | ① | 同上 |
| 7 | `ToolSettingsPanel.music.test.ts` | ① | `simple-icons` 未安装 |
| 8 | `UserAvatar.test.ts` | ① | `date-fns` 未安装 |
| 9~ | `ChatMessageList*` / `CommandTerminal` / `api-config-source` / `StreamdownMessageContent*` 等 | ① | `ansi-to-react` / `streamdown` 等未安装 |
| — | `index.test.ts`（4 条） | ① | `@modelcontextprotocol/server-filesystem` 未安装 |
| — | `renderer/settings/**`（11 文件） | ② | 依赖 P4 已删的 `settings/i18n` / `index.html` / `settings.css`（J-06/J-09 已定义） |
| — | `panel-layout.test.ts`（2 条） | ② | J-08/J-09：`ModelModePanel.css` 被 P4 删除（4 passed / 2 failed，符合 J-08 定义） |
| — | `theme-token-contract.test.ts`（1 条） | ③/④ | P5 已识别；`ToolConsolePanel.css` 存量令牌违规 |
| — | `ChatMarkdownStyles.test.ts`（1 条） | ① | Streamdown 未安装（"扫描已安装的 Streamdown 发行版"结构性不可达） |
| — | `default-dialogs-regression.test.ts`（1 条） | ④ | `ToolConsolePanel.tsx:285` 的 `window.confirm`——实测该文件在**工作区 / HEAD / `phase3-work-snapshot` 三者逐字节相同**，与 P6 无关 |

> ✅ **反查结论（方法论上比"逐条归因"更强）**：脚本反查全部 31 个失败测试文件，
> **0 个** import 本 Phase 的 9 个文件或 `channels/**`、`orchestrator/**` 施工面 → 失败与 P6 无因果。
>
> ✅ **本次顺带修好 1 条**：`conversation-transcript-phase2.acceptance.test.ts`（官方新文件，此前 5/6）→ **6/6 全绿**（见 §五 偏差 4）。

---

## 五、关键偏差与判定修正（**给后续 Phase 必读**）★

### 偏差 1 · `bootstrap.ts` 的本地注入面被官方块外代码"半保留"，导致助手侧历史静默丢失

- **现象**：`dispatcher.test.ts` 有 3 条红，报 `expected "vi.fn()" to be called with arguments: [..., "assistant", "传输成功", {isBot:true}]`，实际只收到 `["user", "你好", undefined]`。
- **根因（实测）**：自动合并把 `bootstrap.ts` 的**入站**注入项（`loadRecentChannelHistory` / `appendChannelHistory`）按 ours 保留在冲突块内，但 `dispatcher.ts` 的**成功路径**里 ours 的 `await this.deps.context.appendAssistantContext(msg, context, prepared)` 落在了「官方已重写掉的那段非冲突区」→ **没有任何地方调用它**。
- **判定**：属 A40（装配层/调用面被整段拿掉），**必须补回**。
- **处置**：在发送确认成功、写完 outgoing 审计后补调用，并注明"只在渠道确认发送成功后提交"。
- **影响**：若漏掉，本地滑窗永久只有 user 侧 → 模型看不到自己的历史回复（**能编译、能过大部分测试**）。

### 偏差 2 · 🔴 蓝图 §四 4.2 的"块外行号"是错的（判据修正 → **J-13**）

- **蓝图原文**：「theirs 的 5 个 import 已在非冲突区 `:95-99`（块之后）存在」→ 因此"唯一正确解：取 ours"。
- **实测**：`build-options.ts` 取 ours 并删掉冲突块后，块外**不存在**这 5 个 import：
  ```
  src/main/orchestrator/build-options.ts(150,16): error TS2304: Cannot find name 'MaterializedTranscript'.
  ... （共 18 条，含 UncertainEffect / resolveTranscriptRetainTokens /
        DEFAULT_HARNESS_CONFIG×5 / estimateMessageTokens×2 / createTranscriptCompactionRequiredError×2）
  ```
  而官方版**正是把它们放在 `:65-69`**，即**冲突块内**。
- **根因**：蓝图写作时的行号快照在 auto-merge 后失效；且"某符号在块外是否已存在"这一断言**从未被复核**。
- **处置**：取 ours（保住 `ChannelTraceContext` + 3 个本地 import）**并且**把 5 个转录 import 手工补回。**不存在重复声明风险**（块外确认为空，实测）。
- **判据修正**：新增 **J-13** —— 蓝图/台账给出的"块外行号/坐标"**不可直接采信**，执行前必须自己重扫。
- **影响**：**P7 若还要处理其他文件，请对每一处"块外已存在"的断言复核一次。**

### 偏差 3 · `dispatcher.ts` 的两处 `broadcast*` 是**永远不执行**的死代码（4 条 `TS2339`）

- **现象**：
  ```
  dispatcher.ts(424,24): error TS2339: Property 'mirrorToDesktop' does not exist on type 'ChannelsSettings'.
  dispatcher.ts(426,17): error TS2339: Property 'broadcastChat' does not exist on type 'DispatcherDeps'.
  （431/433 同）
  ```
- **根因（三条实测证据）**：
  1. `settings-store.ts:379` 明写「旧配置里的 `mirrorToDesktop`（渠道消息镜像到桌面对话）**已随该功能删除**」——**是本分支主动删的功能**；
  2. `ChannelsSettings` 已无该字段；`DispatcherDeps` 已无 `broadcastChat`。`types.ts:143` 那个同名 `broadcastChat` 是**另一个东西**（签名 `{ type: "bot:message"; payload: unknown }`，与本处用法不兼容）；
  3. `bootstrap.ts` **从不注入** `broadcastChat` → 即便编译通过，`?.` 也恒为 no-op。
  另：ours（HEAD）**从来没有**这两个方法——它们是官方块外新加的。
- **判定**：删的是**永远不执行的代码**，不是功能。**不属于 J-02 意义的"退化"**。
- **处置**：删两个私有方法 + 2 处调用，并在原位写明三条证据链（防后人"重新发现"）。

### 偏差 4 · 官方新测试 `conversation-transcript-phase2.acceptance.test.ts` 的夹具与本地设置 shape 不符

- **现象**：`TypeError: Cannot read properties of undefined (reading 'intercept')` at `dispatcher.ts:188`（`interceptByKeyword`）。
- **根因（实测）**：该文件**不在 `phase3-work-snapshot` 里**（官方新增）→ **它从未在本分支上跑通过**。其夹具 `loadSettings: () => ({ enabled, mirrorToDesktop, ... })` 缺 `keywords`（本分支 `dispatcher.ts` 必读），却带着**已被删除**的 `mirrorToDesktop`。
- **判定**：属"官方新增但无基线"（③类）的夹具缺口，**不是 P6 引入的回归**；但修复它成本极低且能恢复一条有价值的门禁。
- **处置**：改夹具为两套 shape 的交集（补 `keywords: { intercept: [], trigger: [] }`、删 `mirrorToDesktop`），并注明"本仓库所有 tsconfig 都 exclude `*.test.ts`，这类缺口编译器不会提醒"。
- **结果**：该文件 **6/6 全绿** —— 它是**唯一**端到端断言"渠道 dispatcher 写读同一 canonical journal 上下文"的测试，**P6 的 journal 骨架因此第一次有了真实回归网**。

### 偏差 5 · "官方改了 950 行"是 CRLF 假象，实际内容差 **1 行注释**

- **现象**：`tool-registry.ts` 解决后**与 HEAD 逐字节相同**（`617bb0f3…`）——即官方在该文件的改动**全部被丢弃**。这看起来像"取 ours 取错了"。
- **实测复核**：
  ```
  git diff --stat eb6c311a MERGE_HEAD -- tool-registry.ts                        # 950 行（475+/475−）
  git diff --ignore-cr-at-eol --stat eb6c311a MERGE_HEAD -- tool-registry.ts     # 1 insertion(+), 1 deletion(-)
  ```
  唯一内容差是**一句注释措辞**（「与 fs-tools 的 loadVisionConfigLazy 同模式」→「与 fs-tools 的视觉配置懒加载同模式」），且它**位于冲突块内**（该块 ours 已整体覆盖）。
- **判定**：**取 ours 不丢任何官方功能**。同时确立一条通用纪律（→ 经验库 A41）：**统计两侧改动量一律加 `--ignore-cr-at-eol`**。
- **影响**：后续 Phase 判断"官方是否重写了某文件"时，**不要看裸 `--numstat`**。

### 偏差 6 · 3 个测试桩的接口缺口（`tsc` 结构上抓不到）（判据修正 → **A42**）

- **现象**：补完助手侧历史写入后，`通过注入的上下文模块读取和提交会话状态` 抛 `TypeError: this.deps.context.resolvePriorMessages is not a function`。
- **根因（实测）**：该桩只实现了 `resolveDispatchContext` / `recordIncomingSession`，缺本地历史三方法；而 **`tsc -p tsconfig.main.json`（`:17`）与 `tsconfig.renderer.json` 都 exclude `*.test.ts`** → **测试桩的接口缺口编译器永不提醒**。
- **处置**：补齐 3 个桩；并把"测试文件不在类型检查范围内"写进经验库（L 级 A42）。
- **影响**：**P7/P8 若改动任何被测试桩 mock 的接口，请手工 grep 该接口名反查全部桩点**——编译器不会帮你。

### 偏差 7 · 删公共类型字段会同时打到"导出面"（→ 经验库 A43）

- **现象**：按蓝图 ② 删掉 `channel-context.ts` 的 `ChannelConversationTarget` 后：
  ```
  dispatcher.ts(35,8): error TS2305: Module '"./channel-context"' has no exported member 'ChannelConversationTarget'.
  dispatcher.ts(46,3): error TS2305: （同一标识符的另一处导入/导出）
  ```
- **根因**：蓝图 **§四 4.5 内部自相矛盾** —— ② 要求"整段删除"该 interface，同节又要求"**保留该 interface**，只删函数与字段"。而该类型是**跨 3 文件 + 3 测试的公共契约**：删字段同时打到"对象字面量面"（`TS2353`）与"导出面"（`TS2305`），后者只在**导入方**报错、离改动点很远。
- **处置**：取"保留"侧 —— 在 `channel-context.ts` 重新导出 `ChannelConversationTarget { conversationId: string }`（**已去掉绑定语义**，D1 不受影响）。另有硬约束支撑：`conversation-transcript-phase2.acceptance.test.ts` 直接断言 `input.target.conversationId`，且 `dispatcher.ts` 非冲突区有 6 处 `target.conversationId`。

### 判定修正汇总（已回写总蓝图 §二 判据台账）

| 编号 | 旧判据 | 新判据 | 依据 |
|---|---|---|---|
| **J-13** | 蓝图/台账给出的"块外行号/坐标"可直接采信 | **不可采信，执行前必须自己重扫**（`git show :3:<file>` 或直接读文件） | 本报告偏差 2（实测错 1 处，代价 18 条 `TS2304`） |
| **J-14** | `getL2ForScope` 在 `tool-registry.ts` 内命中 **≥2** | **≥1**（实测只有 `read_memory` 一处；`search_memory` 走 `searchMemory(..., {scopeId})` 参数限域，不调用它） | 本报告 §四 A4（原判据会把正确实现判成失败） |

---

## 六、已知坑的实测复现情况

| 坑（键号） | 本次是否复现 | 说明 |
|---|---|---|
| **K4** 会话 `node -v` 仍是 v22 | ❌ 未复现 | 每条命令首行即前置 `$env:PATH` |
| **K7** 冲突块方向易误读 | ✅ **复现** | `bootstrap.test.ts:220-264` 的 ours/theirs **交错**（ours 用例被 theirs 用例从中间打断）→ 必须**展开三行标记实际读**，不能按"整块二选一"处理 |
| **K10** PowerShell `-Pattern` 计数不可靠 | ✅ **复现** | `getL2ForScope` 的"≥2"判据即为此类（实为 1）；另 `require\(` 会命中**注释里**的 `require()` 字样 → 计数一律回读原文复核 |
| **K12** 合并态"全局替换冲突标记"会误伤 | ❌ 未发生 | 只对 §四 列出的 9 个文件动手 |
| **K15** 删宿主文件不会自动暴露依赖者 | ✅ **复现** | `tool-registry.ts` 的 `require()`、`broadcast*` 的 `mirrorToDesktop` 都是"宿主已删、引用还在"；**`tsc` 是唯一抓得住它们的工具** |
| **K16** i18n/JSON 大块拼接要按括号配平 | ❌ 未涉及 | 本 Phase 无 i18n/JSON 改动 |
| **K17** 官方阻塞队列重入语义 | ❌ 未涉及 | 属 P5 面 |
| **K18** "取 ours 还是 theirs" 要看测试属哪一侧 | ✅ **复现（核心）** | 删官方绑定用例 6 条、保留 ours 本地用例、改写 P2 归属 3 条 —— 详见下表 |
| **K19** 冲突块数 ≠ 整合面 | ✅ **复现（最贵）** | `build-options.ts` 1 块 → 块外 18 条错；`bootstrap.ts` 7 块 → 块外 3 处连带修改（B-1/B-2/B-3） |
| **K20** 签名类参数被"取 theirs"删掉后功能静默消失 | ✅ **复现** | `buildAlwaysOnContext` 的 `trace` 第 3 参（保住了）；`appendAssistantContext` 整条调用（**差点漏掉**，靠测试抓到） |

### 测试用例删/留台账（K18；蓝图 §四 4.7 要求留痕）

| 文件 | 删除（官方独有 / 与 D1 冲突） | 保留 | 改写 |
|---|---|---|---|
| `channel-context.test.ts` | 「绑定渠道使用桌面对话 journal…」1 条 + `:8` 的 import（**X1 块外**） | ours 22 条（前缀剥离 / 昵称含 `]` / 返回值冒泡…） | — |
| `bootstrap.test.ts` | 「把共享 journal 注入 dispatcher…」1 条（断言 `getSession`，该 mock 已随 `chats-store` 移除） | ours 4 + 共有 12（含 3 条 P2 归属） | harness 改传对象（B-3）；5 处直调改传完整对象（补 `runId`） |
| `dispatcher.test.ts` | 绑定用例 3 条（`uses bound desktop history...` / `keeps QQ group identity...` / `persists the same selected built-in sticker...`）+ 「falls back to the unbound channel path when binding lookup fails」1 条 + 3 个"尸体开关"（`resolveBoundConversationId?` / `loadBoundConversationHistory?` / `appendBoundConversationMessage?`） | 官方 canonical 9 条 + ours 拦截关键词 2 条 + 其余 | P2 归属 3 条：位置参数断言 → `input.userMessageId` |

> **每删一条的理由**：D1 已删除其被测实现；**测试必须与实现同侧**（K18），跨侧只能删用例并留痕。
> **未删任何一条 ours 的本地能力用例**（那是本地能力唯一的回归网）。

### 本 Phase 新踩到的坑（建议追加进经验库 → 已追加，见 §十）

| 坑 | 症状 | 根因 | 正确做法 | 键号 |
|---|---|---|---|---|
| 蓝图"块外行号"失效 | 按蓝图字面执行 → 块外 18 条 `TS2304` | 蓝图是写作时的快照，auto-merge 后行号漂移 | 执行前复核"某符号是否真在块外" | **C22** |
| 冲突块数 ≠ 整合面 | 36 块做完，块外还有 4 类错 | 非冲突区已混入双方 | 每块处置后立刻单文件 `tsc` | **C21** |
| 装配层注入面被整段拿掉 | 编译过、测试大多绿，助手侧历史永久丢失 | 官方把 `deps` 换成了自己的机制 | 逐项核对注入面清单 + 补真实路径集成测试 | **A40** |
| 裸 `--numstat` 把 CRLF 当内容 | "官方改了 950 行"实为 1 行注释 | 行尾污染跨两侧 diff | 一律 `--ignore-cr-at-eol` | **A41** |
| 守卫测试只验"现在是绿的" | 分不清"真在守"与"结构上不可能失败" | 守卫的价值 = 它能变红 | **突变验证**（破坏实现 → 确认变红 → 还原并核 blob） | **F17** |
| 测试桩缺口编译器不提醒 | 运行到第 3 个方法才抛 `TypeError` | 三份 tsconfig 全 exclude `*.test.ts` | 手工对齐接口；改接口时 grep 反查全部桩点 | **A42** |
| 删公共类型字段打到导出面 | `TS2305` 出现在**另一个文件** | 类型是跨文件公共契约 | 删字段后立刻全仓 `tsc`；检查导出链 | **A43** |

---

## 七、回退方法（**本次实测验证过**）

```powershell
cd E:\AI_Chating\cyrene-agent
$env:PATH = "D:\data\node24;" + $env:PATH

# 级 1 · 单文件（最常用）—— 本次**实测用过**（突变验证后还原 dispatcher.ts，blob 逐字节一致）
Copy-Item "E:\AI_Chating\cyrene-agent-p6-backup\<path 以 __ 替换斜杠>" <path> -Force
# 校验：git hash-object -- <path>  应与 .cyrene-merge-analysis/p6/pre-hashes.txt 对应行一致

# 级 1b · 按哈希核对"改前态"
Get-Content .cyrene-merge-analysis\p6\pre-hashes.txt      # 9 行
git hash-object -- src/main/channels/dispatcher.ts        # 当前值

# 级 2 · 取官方原始版（带标记）/ 合并前本地版
git checkout MERGE_HEAD -- <path>
git checkout phase3-work-snapshot -- <path>

# 级 3 · 本 Phase 的 9 个文件整批回退
foreach ($f in $p6) { git checkout phase3-work-snapshot -- $f }

# 级 4 · 放弃本 Phase
git checkout phase3-work-snapshot -- .

# 级 5 · 连 .git 都没了
robocopy E:\AI_Chating\cyrene-agent-backup-phase0 E:\AI_Chating\cyrene-agent /E /XD node_modules
```

> 🔴 **永不** `git merge --abort`（会丢弃 P3/P4/P5/P6 全部成果）。
> 🔴 **永不** 对 `src/main/channels/history-log.ts` 执行任何 `checkout`（会一次性丢掉 16 个本地独有导出）。
> 📌 **`git add` 已执行** → 若需回退**索引**，用级别 2/3 的 `git checkout <ref> -- <path>` 会同时刷新工作区与索引。

---

## 八、给下一个 Phase 的交接清单

1. 🔴 **P6 完成后 `UU` = 0（已 `git add`）**。验证：
   ```powershell
   (git status --porcelain | Where-Object { $_.Substring(0,2) -eq 'UU' } | Measure-Object).Count   # 期望 0
   git diff --name-only --diff-filter=U                                                            # 期望无输出
   ```
2. 🔴 **P7 的首要任务：全仓库边界编译修复**。当前 `tsc -p tsconfig.main.json` **只剩 1 条**：
   ```
   src/main/windows/create-aux-windows.ts(36,55): error TS2694:
     Namespace 'Electron' has no exported member 'WindowStatePersistence'.
   ```
   根因已查明：`node_modules/electron` 装的是 **43.1.0**，而 `package.json` 要求 **`^44.4.3`**
   （该类型只存在于新版）→ 属①类，**P8 的 `npm ci` 会解决**；`tsc -p tsconfig.preload.json` 已 **exit 0**。
3. 🔴 **不要动 `src/main/channels/history-log.ts`**（本地 16 个独有导出，含 `buildGroupContextBlock`）。本次实测 `git status` 对该文件**零改动**。
4. 📌 **`conversation-binding-store.ts` 保留**（被 `memory-console` / `person-erasure` / `zones-ipc` 使用）。
5. 🔴 **把 `src/main/channels/group-context-flow.test.ts` 留在门禁名单里**。它是**唯一**能抓住"群聊旁听静默消失"的测试，且已用**突变验证**证明有效。**不要因为"它只有 4 条用例"就把它从定向门禁里删掉。**
6. 📌 **新增的 3 处"块外连带修改"已在 `bootstrap.ts` 落地**（B-1 `appendHistory` import / B-2 `ChannelAgentInput.userMessageId` / B-3 测试 harness 传对象）。P7 若再动 `buildAndRunAgent` 的契约，**这三处必须同批次改**。
7. 📌 **`dispatcher.ts` 的 `ChannelAgentInput` 现在是 8 字段对象契约**（`sessionId/target/modelContext/transcriptSink/userTurnId/assistantTurnId/runId/userMessageId?`）。改它请 grep 反查：`bootstrap.ts`、`bootstrap.test.ts`、`conversation-transcript-phase2.acceptance.test.ts`。
8. 📌 **P8 待处置清单**：
   - ① **7 个"失去被测对象"的测试**（H-07，三选一待拍板）
   - ② `theme-token-contract` 的 `ToolConsolePanel.css` 存量违规
   - ③ **`default-dialogs-regression.test.ts`**：`ToolConsolePanel.tsx:285` 的 `window.confirm`（存量，与合并无关）
   - ④ `npm ci` 装齐依赖后重跑门禁（届时 ①类失败应全部消失）
9. 📌 **`package-lock.json` 收尾在 P8**：`npm ci` 之后用 `npm install --package-lock-only` 重建。
10. 💾 **回退网**：`phase3-work-snapshot`（`586eae90`）/ `phase0-full`（`34f0669f`）/ `cyrene-agent-p5-backup`（17 文件）/ **`cyrene-agent-p6-backup`（9 文件）** / `.cyrene-merge-analysis/p6/pre-hashes.txt`。
11. 🔴 **仍不要提交** —— 提交时机在 **P7 之后**（全部 `UU` 解决 + 边界编译修完）。
12. 📌 **本 Phase 的两条判据修正（J-13 / J-14）已回写总蓝图**；P7 处理任何"块外行号"断言前请先读 J-13。

---

## 九、Phase 6 目标达成核对

| 目标（来自蓝图 §一） | 状态 | 证据 |
|---|---|---|
| **T1** · 9 文件 / 36 块归零 | ✅ | A1（全仓库 0）+ A2（`UU/UD/DU/AA` 全 0） |
| **T2** · D1 落地（绑定链路删除） | ✅ | A3（0 命中；落点 1；store 保留） |
| **T3** · 群聊旁听仍可用 + 探测器测试 | ✅ | A5 + A6（含突变验证） |
| **T4** · 隐私边界不回归 | ✅ | A4（40 tests + 4 条 grep 判据） |
| **T5** · 全仓库首次能编译（TS1185 = 0） | ✅ | A8（22 → 1；preload 全绿） |
| **T6** · 语料豁免边界完好 | ✅ | A7（22 tests） |
| **T7** · 人工环节 | ✅ | §一 回执（H-A3 已拍板；H-10 与 H-13 代码级已销账） |

**非目标遵守情况**：

| 非目标 | 是否越界 | 证据 |
|---|---|---|
| **N1** ❌ 把旁听迁进 CTA 轨迹 | **未越界** | 未新增任何 transcript kind；`conversation-transcript-*` 零改动 |
| **N2** ❌ 删 `conversation-binding-store.ts` | **未越界** | `Test-Path` = True；其 4 个消费方未动 |
| **N3** ❌ 改 `history-log.ts` | **未越界** | `git status --porcelain` 对该文件**无输出** |
| **N4** ❌ 改 `src/main/corpus/**` | **未越界** | A7 的 `group-corpus-isolation` 7 tests 全绿 |
| **N5** ❌ 新增/删除任何 transcript kind | **未越界** | 同 N1 |
| **N6** ❌ `npm ci` / 改 `package.json` | **未越界** | `package.json` / `package-lock.json` 未在本次改动清单内 |
| **N7** ❌ 删除任何测试文件 | **未越界** | 只删**用例**（6 条，理由见 §六），未删任何**文件**；另新增 1 个文件 |
| **N8** ❌ 提交 | **未越界** | 仅 `git add`（合并需 staging 才能反映 `UU`），**未 commit** |

**超范围说明（已取得项目所有者确认）**：本 Phase 有 **4 处蓝图未覆盖的必要修正**，均已单独列出并获确认：
① `build-options.ts` 补回 5 个转录 import（偏差 2）；
② `dispatcher.ts` 删 `broadcast*` 死代码（偏差 3）；
③ 修官方新测试夹具（偏差 4）；
④ `channel-context.ts` 保留 `ChannelConversationTarget` 导出（偏差 7）。

> 📌 **撰写者复核补正（就地标注，原文保留不改）**：本节清单与实际送确认的清单**不完全对应** ——
> - **实际送确认的 4 条**：① `build-options` 补 5 个转录 import ② 删 `broadcast*` 死代码 ③ 修 acceptance 夹具 ④ **`tool-registry` 整体取 ours**（该条蓝图 §四 4.4 已定，送确认的是"官方对该文件实际只改 1 行注释"这一**复核证据**）。
> - **未经单独送确认的 2 处**：上表 ④「保留 `ChannelConversationTarget` 导出」、以及 §十二 子节 1 的「`bootstrap.ts` 删 `typeof input === "string"` 兼容分支」。
> - **处置**：项目所有者已在复核轮次对上述 2 处**追认**（实测两处均站得住：前者 1 处定义 + `dispatcher.ts` 4 处引用 + acceptance 测试断言 `input.target.conversationId`；后者的唯一调用方 `dispatcher.ts:115/309` 传的都是对象）。
> - **结论：本 Phase 实际超范围改动 = 5 处**（上述 ①②③ + 保留 `ChannelConversationTarget` + 删 legacy string 分支）。

---

## 十、回写清单 ★（**未勾完不得提交**）

| 触发条件 | 回写目标 | 回写内容一句话 | 已勾选 |
|---|---|---|---|
| **T2** 基线数值被改写 | `BLUEPRINT-总蓝图.md` §九 | 新增「当前工作基线（**P6 之后**）」；P5 段移入「历史基线（仅存档）」 | [x] |
| **T2** 基线数值被改写 | `BLUEPRINT-总蓝图.md` §四 | P6 状态 → **✅ 已完成**；`UU` = 0；补记"36 块逐条吻合，64/63 账目差额已收口" | [x] |
| **T1** 判据被修正 | `BLUEPRINT-总蓝图.md` §二 判据台账 | 新增 **J-13**（块外行号不可直接采信）与 **J-14**（`getL2ForScope` ≥2 → ≥1） | [x] |
| **T1** 判据被修正 | `HUMAN-人工验证台账.md` §三 H-13 ② | `getL2ForScope` 期望由 ≥2 改为 ≥1，并写明 `search_memory` 走参数限域 | [x] |
| **T3** 蓝图描述被推翻 | `BLUEPRINT-总蓝图.md` §八 8.2 A3 | 「P6 必须新增探测器」→ **已完成**（含突变验证结论）；明确 P7/P8 保留该门禁 | [x] |
| **T3** 蓝图描述被推翻 | `BLUEPRINT-总蓝图.md` §十一 文档索引 | P6 蓝图状态改为「已执行」；新增《PHASE-6-完成报告》条目并标"全部后续 Phase 必读" | [x] |
| **T3** 蓝图描述被推翻 | `PHASE-6-骨架重写与旁听保留.md` §四 4.2 / 4.5 | 就地记录"`:95-99` 是错的"与"4.5 内部自相矛盾" | [x] |
| **T2** 基线数值被改写 | `HUMAN-人工验证台账.md` §一 + §五 | H-10 销账（两处保持现状）；H-13 代码级销账；§五 追加 3 行销账记录 | [x] |
| **T4** 新增经验 | `methodology/BLUEPRINT-经验库-通用.md` | **C21 / C22**（§1）、**A40 / A41**（§4）、**F17**（§5）共 5 条 | [x] |
| **T4** 新增经验 | `methodology/BLUEPRINT-经验库-具体坑.md` §4 | **A42 / A43** 共 2 条（测试桩编译盲区 / 删类型字段打导出面） | [x] |
| **T4** 新增经验 | `HUMAN-人工验证台账.md` §三 H-08 | 补记"探测器已含突变验证"，说明"写入侧已被机器守住" | [x] |
| **T2** 基线数值被改写 | 本文件 §二 | 最终状态（HEAD / `UU` = 0 / 索引 2423 / 回退网） | [x] |
| — | — | 本 Phase **无其他触发**（已逐条核对 T1–T4） | [x] |

> **规则遵守**：回写只「新增 + 标注」，**未静默删除任何旧值**——P5 基线整段移入「历史基线（仅存档）」；
> 两处被证伪的蓝图原文均**就地保留 + 标注"曾错、已修正"**。
> **本表 13 行全部 `[x]` → 回写清单已闭合。**

---

## 十二、施工记录（执行者追加；子节 0 为必需）

> 完整版见 [`PHASE-6-骨架重写与旁听保留.md`](PHASE-6-骨架重写与旁听保留.md) §十二（已回填 8 个子节）。
> 此处仅列**本报告特有的**两条：

### 子节 6 · 验收后修复

| 现象 | 根因 | 修复 | 复验 |
|---|---|---|---|
| `tsc` 22 条（其中 4 条 `TS2339`） | `broadcast*` 死代码依赖已删的 `mirrorToDesktop` | 删方法 + 2 处调用 | `tsc` 该文件 0 条 |
| `tsc` 18 条 `TS2304` | 蓝图"块外行号"错误（偏差 2） | 补回 5 行转录 import | `tsc` 该文件 0 条 |
| 2 条 `TS2305` | 删 `ChannelConversationTarget` 打到导出面（偏差 7） | 保留并重新导出该 interface | `tsc` 该文件 0 条 |
| `dispatcher.test.ts` 3 红 | 合并丢了 `appendAssistantContext` 调用（偏差 1） | 成功路径补调用 | 29/29 绿 |
| `bootstrap.test.ts` 6 红 | harness 传位置参数 / 缺 `runId` | 改传完整对象 | 17/17 绿 |
| `default-dialogs-regression` 1 红 | 存量 `window.confirm`（三者逐字节相同） | **不修**，归④类 | P8 处置 |

### 子节 7 · 经验追加

| 经验 | 等级 | 归位 | 已追加 |
|---|---|---|---|
| 冲突块数 ≠ 整合面 | H | `经验库-通用.md` §1 **C21** | ✅ |
| 蓝图"块外行号"必须自己复核 | M | `经验库-通用.md` §1 **C22** | ✅ |
| 装配层块必须逐项核对注入面 | M | `经验库-通用.md` §4 **A40** | ✅ |
| "官方改了 N 行"须按去 CRLF 的内容差复核 | M | `经验库-通用.md` §4 **A41** | ✅ |
| 守卫测试必须做突变验证 | H | `经验库-通用.md` §5 **F17** | ✅ |
| tsconfig 全量 exclude 测试 → 桩缺口编译盲区 | L | `经验库-具体坑.md` §4 **A42** | ✅ |
| 删公共类型字段同时打"对象字面量面"与"导出面" | L | `经验库-具体坑.md` §4 **A43** | ✅ |
