# SYNC · 上游同步 SOP（P10 T1 交付物）

> **本文件回答一个问题**：上游又动了，我怎么办？
> **状态**：📝 已落地（P10）；⚠️ **本机制的第一次真实使用尚未发生**（当前上游无新提交，见 §二 基线），
> 它的价值要在**下一次上游更新时**才被检验 → BACKLOG 第一条就是「第一周例行体检」。
> **读者**：下次做同步的人（大概率是没有对话历史的 agent）+ 项目所有者
> **配套物**：`scripts/merge/upstream-sync.mjs`（脚本）+ `.cyrene-sync-state.json`（同步点登记）
> **判据**：[BLUEPRINT-总蓝图.md](BLUEPRINT-总蓝图.md) §二 **J-36** · [PHASE-10-回落与加固.md](PHASE-10-回落与加固.md) §四 4.1

---

## 一、这个机制是什么（30 秒版）

本仓的处境**天生危险**：上游作者与我们各自改了同一片区域，而我们的工作是**本地提交**，
上游不知道它存在。**攒 12 天再合一次**正是这次 46 个冲突的成因。

同步机制把它拆成**体检**与**合并**两件事：

```
node scripts/merge/upstream-sync.mjs --check --fetch     ← 体检（只读，随时可跑）
        │
        ├─ 退出码 0  →  RISK 为空，可以干净地跟（§三 分支 A）
        ├─ 退出码 1  →  RISK 非空，逐文件定处置（§三 分支 B）★ 这里的每一步都要人看
        ├─ 退出码 2  →  上游通道不可达 → 离线口径（§四）
        └─ 退出码 3  →  前置/内部错误（状态文件坏了 / ref 解析不了）
```

**唯一需要记住的一条判据（J-36）**：

> 🔴 **"能不能安全地跟"只看 `RISK = U_new ∩ L_dev` 是否为空，不看上游提交数。**
> 上游改 200 个文件、但一个都没碰我们改过的路径 → **安全**；
> 上游只改 1 个文件、而那 1 个正是我们改过的 → **必须先定处置**。
> 反之，"上游新提交 = 0"**不代表**没有风险（我们可能正在改上游将要改的地方）。

---

## 二、例行体检（建议每 **7 天**，或**每次开工前**）

```powershell
cd E:\AI_Chating\cyrene-agent
node scripts/merge/upstream-sync.mjs --check --fetch
$LASTEXITCODE        # 读这个数，比读输出更重要
```

- 加 `--fetch` 才会去上游取；不加就用本地已有的 `refs/remotes/official/master`（离线可用）。
- 抓取源的**优先顺序**由状态文件的 `upstream.mirrorPath` / `upstream.github` 决定：**先本地镜像、后 github**。
- 每次体检都会写一份报告：`.cyrene-merge-analysis/sync/<日期>-<时分秒>-报.md`
  （文件名带时分秒 —— 同一天跑多次**不会互相覆盖**，证据留得住）。
- 想看机器可读结果：`node scripts/merge/upstream-sync.mjs --check --json`（一行 JSON，不写报告）。

**例行体检的产出**：一句结论 ——「上游新提交 N 个 / RISK M 条 / 能不能干净地跟」。
`N = 0` 也要看一眼 `RISK`：**它恒为 0 是正常的**（没有新提交就没有新的交集）。

---

## 三、两种情况，两条路

### 分支 A · 上游有新提交，且 `RISK` 为空（可以干净地跟）

```powershell
cd E:\AI_Chating\cyrene-agent
git status --porcelain            # 🔴 先确认工作区干净 —— 有未提交改动就不要合并
git tag pre-sync-<日期>            # 例：git tag pre-sync-2026-10-08   ← 留锚点，先打再合
git merge refs/remotes/official/master
```

**为什么先打 tag**：合并一旦开始，回退就只剩 `git reset --hard` 这一条路；
一个 tag 是**最便宜**的后悔药（`git reset --hard pre-sync-2026-10-08`）。

合并后按 §五 收尾（**第一步就是更新同步点**）。

### 分支 B · 上游有新提交，且 `RISK` 非空（🔴 逐个文件定处置）

**不要直接 `git merge`。** 按下面的顺序做：

1. **打开报告**：`.cyrene-merge-analysis/sync/` 里最新的那份，看 §三「RISK · 会撞车的文件」；
2. **对每一条 RISK 路径问三个问题**（判据 **J-23**）——不要看到"文件没了"就喊丢功能：
   - ① 这个路径在**基点** `eb6c311a` 里存在吗？
   - ② 在**官方树** `b11b8851` 里存在吗？
   - ③ 本地有**依附它**的东西吗（组件 / import / 测试）？
   - 只有「基点有 · 官方无 · 本地无依附」才可能是"我方要的"；
   - 🔴 **反向陷阱**：官方删掉**宿主组件 / 宿主窗口文档**时，依附它的本地代码会**静默失去入口**，
     而这件事**不会**出现在冲突清单、`git status`、文件差异或符号差异里的任何一处。
3. **查放弃清单**：[ABANDONED-有意放弃清单.md](ABANDONED-有意放弃清单.md) —— 「这个文件我们当初放弃过什么」。
   79 条里每一条都有归属，**照着它决定"这次是跟随上游，还是把我们的东西接回去"**；
4. **遵守已拍板决策 D1–D7**（总蓝图 §五）。特别地：
   - **D1** 桌面对话绑定 = 彻底删除（保留 `conversation-binding-store.ts`，zones 依赖它）；
   - **D2** 旧设置窗口 = 不救回，走官方 React 路线；
   - **D3/D4** 旁听 A/B **不迁移**；
   - **D6** 任何文档**不进**提交；
   - **D7** 🔴 **我方新增功能所依赖的 UI 入口必须原封不动加回**（这不是"版面调整"）。
5. 拿不准 → **停下来问人**，并在 `HUMAN-人工验证台账.md` 登记一个新 `H-编号`。

---

## 四、离线口径（`--fetch` 失败，退出码 2）

镜像目录不在 + 无网时会发生。**降级但不失败**：

1. 照常跑 `--check`（**不加** `--fetch`）—— 用本地已有的 `refs/remotes/official/master` 出结论；
2. 在报告/台账里写明「**本次未抓取，结论基于本地 ref，日期 <上次抓取日>**」；
3. 登记为 BACKLOG 一条：「有网后补跑 `--check --fetch`」。
4. 🔴 **不要伪造 fetch 结果** —— 编一个"上游没动"的结论，比明确说"我不知道"危险得多。

---

## 五、同步完成后的 checklist（**第 1 条最容易忘**）

1. 🔴 **更新 `.cyrene-sync-state.json` 的三个字段**：
   - `lastSyncedCommit` = 这次合进来的上游提交（合并后 = `git rev-parse <合并提交>^2`）
   - `lastSyncedAt` = 今天
   - `mergeCommit` = 本次合并提交的哈希
   > **机械自证**：`lastSyncedCommit` 必须 = `git rev-parse <mergeCommit>^2` 的前 8 位。
   > 例（本次基线）：`git rev-parse 51a20338^2` = `b11b8851…` → `lastSyncedCommit = "b11b8851"`。
2. 三套编译 + 全量测试（**先校准 PATH**，见 §六 第 3 条）；
3. 更新总蓝图 §九 的「当前基线」块（**新增 + 标注**，不静默删旧值）；
4. 这次同步里"有意放弃"的东西 → 追加进 [ABANDONED-有意放弃清单.md](ABANDONED-有意放弃清单.md)；
5. 撤回或确认 `pre-sync-<日期>` tag（留着不占地方，但要知道它在）。

---

## 六、纪律：**不要再攒 12 天未提交的改动**（这次的根因）

**明文阈值（可机械判定）**：

```powershell
# ① 工作区未提交改动条数（口径：git status --porcelain 的行数；每行一个路径，重命名占 2 行）
(git status --porcelain | Measure-Object).Count        # 🔴 阈值：> 20 就先提交

# ② 距上次提交多久（人类可读，如 "3 days ago" / "25 hours ago"）
git log -1 --format=%cr                                # 🔴 阈值：> 3 天就先提交
```

**任一条越线** → 先做下面之一，再继续手头的功能工作：

- **提交**（推荐）：哪怕是一次 `wip:` 提交；
- **开 `wip/` 分支**：`git switch -c wip/<主题>-<日期>`（把"半成品"隔离，`master` 保持可合并状态）。

> ⚠️ 两条命令的**口径**必须连在一起看：`(…).Count` 数的是**行数**（不是文件数），
> 而 `%cr` 是**相对时间**（会随后续操作变化）。
> ⚠️ 不要用 `Measure-Object -Line` 代替 `(…).Count` —— 它数的是**非空行**（判据 **J-31**：
> PowerShell 的计数口径必须写明，否则两个人会得出两个都"正确"的数字）。

---

## 七、本仓的三条机器判据与它们的维护点

> 这三条门禁是"改了代码但没人发现坏掉"的唯一防线。**维护它们 = 维护下一次同步的安全网。**

| 判据 | 测试文件 | 维护动作 |
|---|---|---|
| **类名契约**（J-32 / J-33） | `src/renderer/react/styles/class-name-contract.test.ts` | ① **新增面板** → 把路径加进 `COVERED_TSX`（**当前 3 条**：`memory-console/MemoryManagerSection.tsx` / `memory-console/DangerZoneSection.tsx` / `ZonesSettingsPanel.tsx`），否则新面板不受保护；② **修好一处官方欠账** → 从 `KNOWN_LEGACY_UNDEFINED`（**当前 21 个名字**）里**删掉**它 —— **这个集合只能收紧，不能放宽** |
| **群聊旁听探测器** | `src/main/channels/group-context-flow.test.ts` | 🔴 **P10 起不许从门禁名单里去掉**（它是全仓**唯一**能抓到"群聊旁听静默消失"的门禁，已用突变测试自证：摘掉 `appendIncomingContext` 调用 → 该文件 4 绿转 4 红）。只有动了旁听链路才需要重点看它 |
| **全量测试** | `vitest run` | 🔴 **先校准 PATH**（**J-35**）：`$env:PATH = 'D:\data\node24;' + $env:PATH`。不校准则 `work-verification-closure.test.ts`（会真的 `spawn npm run build`）**假红**为 `1 failed \| 562 passed` |

### ⚠️ 「21 个」vs「22 处」—— 两个口径，别以为是少了 1 个

| 数字 | 口径 | 含义 |
|---|---|---|
| **22 处** | **使用点**（usage sites） | 全量扫描时，官方既有组件里"用了一个没有 CSS 定义的类名"的**出现次数** |
| **21 个** | **去重后的类名**（`KNOWN_LEGACY_UNDEFINED` 的元素个数） | 同一个类名在多个文件里用 → 使用点多、名字少 |

⇒ 两个数**都对**，差额 = 有类名被用了两次以上。**写报告时标明用的是哪个口径**（J-31 型要求）。

---

## 八、本仓的"只读参照"（🔴 不要 `import`、不要改）

下面 5 个文件是 **P9 的权威参照物**（新面板的行为以它们为准，`rules.ts` 里有 **8 处** `← <文件>:<行号>` 指过来）。
**已拍板 H-21 = A：保持现状、登记为只读参照。** 动它们 = 动产品代码 = 必须**单独立项**。

| 文件 | 行数 | 为什么不能直接 `import` |
|---|---|---|
| `src/renderer/settings/memory/delete-all.ts` | 95 | ① 依赖**已删的** `../i18n`（`TS2307`）；② DOM 耦合；③ **不在**任何 `tsconfig` 的 include 面内 |
| `src/renderer/settings/memory/erasure-flow.ts` | 483 | 同上 |
| `src/renderer/settings/memory/manager.ts` | 619 | 同上（另有 1 处真实类型错 `manager.ts:472 vectors`） |
| `src/renderer/settings/zones/panel.ts` | 620 | 同上 |
| `src/renderer/settings/zones/picker.ts` | — | 同上（⚠️ 它**不在** H-07 登记的 4 个「里子」模块里，但同样是"本地独有 + 被 React 侧引用"的参照物） |

正确用法：**抄其中的纯函数到 React 侧**（`features/settings/*/rules.ts`）**并写新测试**。
若要改成"受编译器保护"或删掉 → 见 [BACKLOG-长期待办.md](BACKLOG-长期待办.md)（**须单独立项**）。

---

## 九、口径备忘（写报告时照抄，避免"两个都对的数字"）

| 事项 | 权威口径 | 反例（会算出另一个"对"的数） |
|---|---|---|
| 行数 | `git diff --numstat`（新增文件）= LF 计数 = `Get-Content -Encoding UTF8` | `Get-Content` **不带** `-Encoding UTF8` 读 BOM-less UTF-8 会**静默丢行**（实测偏 6–33 行且每文件不同）；`Measure-Object -Line` = **非空行数** |
| 文件增删行 | 必须标注**是否带** `--ignore-cr-at-eol` | 同一个提交：带 = 878 files，不带 = 901 files（差 23 条＝22 条 `dist/**` + 1 条 `CodeGitPanel.tsx`，**只差行尾**） |
| "某文件没被改" | 比 **blob**：`git rev-parse <ref>:<path>` | 比行数（同一文件能有 617 / 598 / 556 三个"正确"值） |
| 提交/索引/工作区三者 | ① 工作区 vs 索引 → `git diff --stat`（期望**空**）；② 索引 vs HEAD → `git diff --cached --stat`（**必然非空**） | 用 `--cached` 去验①，会把"已 add"误判成"没做成" |
| 搜未跟踪文件 | `git grep --untracked -- '*.ts' '*.tsx'` | 不加 `--untracked` → 新文件全搜不到（会把"已接线"判成"没接线"） |

---

## 十、命令清单（**逐条实测可跑**；本节 = 脚本 `--help` 的镜像）

```powershell
# 体检（离线：用本地 ref）
node scripts/merge/upstream-sync.mjs --check

# 体检（在线：先抓取再体检）
node scripts/merge/upstream-sync.mjs --check --fetch

# 机器可读（一行 JSON，不写报告）
node scripts/merge/upstream-sync.mjs --check --json

# 指向别的 ref（A2 伪造探针就是这么用的）
node scripts/merge/upstream-sync.mjs --check --ref refs/remotes/official/probe

# 帮助（退出码 / 副作用 / 只读保证都在里面）
node scripts/merge/upstream-sync.mjs --help
```

**退出码**：`0` RISK 空 · `1` RISK 非空 · `2` 上游通道不可达 · `3` 前置/内部错误。
**副作用**：除 `--fetch` 写 `refs/remotes/official/master` 外，不修改工作区、索引与 `refs/heads/**`。
