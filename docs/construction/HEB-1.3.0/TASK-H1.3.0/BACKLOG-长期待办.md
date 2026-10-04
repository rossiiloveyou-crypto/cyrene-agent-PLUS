# BACKLOG · 长期待办 —— HEB-1.3.0（官方 1.3.0 合并）

> **文档定位**：本任务**有意不在当前 Phase 处理**的项，逐条登记，每条四字段（**编号 / 内容 / 谁做 / 触发条件**）。
> **纪律**：本文件是**欠账的唯一载体**——不许让未归属的项静默留在工作区或报告正文里（经验 **C23**）。
> **来源**：`PHASE-0-提交收口与锚点.md` §四 4.6（B-01…B-03）＋ P0 执行期实测补强（B-01 的逐条数字）。
> **配套**：`HUMAN-人工验证台账.md`（人工验证唯一载体）／`ABANDONED-有意放弃清单.md`（有意放弃项）。

---

## 一、待办清单

| 编号 | 内容 | 谁做 | 触发条件 |
|---|---|---|---|
| **B-01** | **三处未跟踪 `docs/` 目录的去路未定**：`docs/design/`（44 文件）· `docs/internal-issue/`（19 文件）· `docs/refactor/`（6 文件）＝ **69 文件**。它们 **不在我们的 HEAD**，但**同时存在于共同祖先 `b11b8851` 与合并目标 `8fe5ba7a`**。P0 实测逐条定性（见 §二）：**67 / 69 个路径在合并目标里同名存在**；**2 个只在我们磁盘上**（`docs/internal-issue/2026-09-25-*` 两份）；**6 个内容与目标不同**。→ 必须逐条判定 **提交 / 忽略 / 删除** 三选一。 | agent + 人 | **P5 保真核验时**逐条对照上游 `8fe5ba7a` 与本地 HEAD 后判定（**P0 有意不提交**，理由见 §三） |
| **B-02** | `docs/internal-issue/perf/a1-s-streamdown-report.json` 单文件 **2.1 MB**（机器生成的基准报告），另含 `a1-s-*` 系列 4 件共约 2.4 MB。 | 人 | **本次任务结项后**决定入 git 或用 `.gitignore` 排除 |
| **B-03** | 状态文件 `.cyrene-sync-state.json` 的 `mirrorPath` 指向**落后镜像** `E:\AI_Chating\off-cyan\Cyrene-Agent`（`b11b8851`，落后 **130** 提交），而新鲜镜像在 `E:\AI_Work\Cyrene-Agent`。 | agent | **本任务结项时**改正为 `E:\AI_Work\Cyrene-Agent` 或删除该字段（经验 **D35**：缓存/镜像当权威源，结论不带新鲜度） |
| **B-04** | **`Node 24` 可能已在本机就位**：P0 实测 `where node` 返回两处 —— `D:\data\node\node.exe`（v22.23.2，当前生效）与 **`D:\data\node24\node.exe`**（未验证版本）。另：当前生效的 `D:\data\node\` **npm/pnpm 安装已损坏**（`Cannot find module 'D:\data\node\node_modules\npm\bin\npm-cli.js'`、corepack `pnpm.js` 缺失）。 | agent | **P1 开工第一步**：先验证 `D:\data\node24` 的版本是否满足 `>=24 <25`；满足则直接用它（**不动系统 Node**，符合 M8），不满足才去装便携版。**必须先修好 npm/pnpm 可用性，否则 P1 的 `pnpm install` 无从谈起** |

---

## 二、B-01 的实测证据（P0 采集，供 P5 直接消费）

> 复现命令（P5 可原样重跑）：把 `$UP` 换成当时的合并目标 tag，逐文件比对 `git cat-file -e "$UP:<path>"` 与 `git hash-object <disk>`。

```text
目标 ref              = 8fe5ba7a5b3a86043b8034abeaa98f72f7459039（tag `official-target-8fe5ba7a`）
共同祖先              = b11b88512cf0cf6dace56b59ff9487947ef01c28

docs/design          : 磁盘 44 | 在目标中 44 | 在祖先中 44 | 内容与目标不同 1 | 目标中不存在 0
docs/internal-issue  : 磁盘 19 | 在目标中 17 | 在祖先中 17 | 内容与目标不同 1 | 目标中不存在 2
docs/refactor        : 磁盘  6 | 在目标中  6 | 在祖先中  6 | 内容与目标不同 4 | 目标中不存在 0
------------------------------------------------------------------------------
合计                  : 磁盘 69 | 目标中不存在 2 | 内容不同 6  ⇒  路径同名重合 67
```

**内容与目标不同的 7 个文件**（= 6 个同名不同内容 ＋ 见下）：

| 路径 | 说明 |
|---|---|
| `docs/design/react-frontend-visual-guidelines.md` | 磁盘 5764 B vs 目标 5735 B；该路径在**我方历史**里由 `d90c690e` 新增、`3ac9b8cc` 改过，**但不在 HEAD** |
| `docs/internal-issue/2026-09-09-architecture-review-verification-known-issues.md` | 同名不同内容 |
| `docs/refactor/2026-08-31-agui-bridge-refactor.md` | 同名不同内容 |
| `docs/refactor/2026-08-31-build-options-refactor.md` | 同名不同内容 |
| `docs/refactor/2026-08-31-harness-adapter-refactor.md` | 同名不同内容 |
| `docs/refactor/2026-09-14-engineering-governance-plan.md` | 同名不同内容 |

**只在磁盘、目标中不存在的 2 个文件**（本地独有内容，删除前务必确认无价值）：

| 路径 | 规模 |
|---|---|
| `docs/internal-issue/2026-09-25-channel-runtime-context-misread-as-user-paste.md` | 5 KB |
| `docs/internal-issue/2026-09-25-reranker-cross-encoder-call-fix.md` | 10 KB |

> 🔴 **给 P2/P3 的连带风险提示**：既然 **67 / 69** 个路径在合并目标里同名存在，
> 那么 P2「删改类」处置中凡遇到「**我方删 / 上游保留**」的路径，
> **P3/P5 复查时必须在工作区重新确认这些文件有没有被"保上游"的处置重新写回**——
> 它们不是"新文件"，而是**同名路径上的删除与保留之争**。

---

## 三、为什么 B-01 在 P0 **有意不提交**（判据依据）

1. **不可归因**：P0 的硬边界（`PHASE-0-提交收口与锚点.md` §二 E4）是「只接受能明确归因到上一任务有意保留的内容」。
   这三处目录**不在我们的 HEAD**，且 `git status` 只给出 `?? docs/design/` 这类**目录级**条目 ——
   **逐文件归属在 P0 阶段无法确定**，属于经验 **C23**（一次性提交 = 既存暂存内容 + 本次操作，
   而人对"既存"没有记忆）明令禁止的「静默混入」。
2. **它们不是"未跟踪的新内容"，而是"同名路径的删除之争"**：67 / 69 个路径在目标里存在，
   若 P0 把它们提交进"任务前基线"，就会**凭空把我方已删除的文件变成我方保留的文件**，
   直接污染 P2 的删除集判定与 D4（保留被依赖的删除项）的对照面。
3. **代价可控**：它们留在工作区里**不影响** P1（工具链）与 P2/P3（冲突消解）；
   而判据 **J-10** 已把 A1 的口径限定为"排除三处已登记 D 类遗留后为 0 行"，二者不矛盾。

---

## 四、销账记录（处理完就地追加，**不删除旧行**）

| 编号 | 处理结论 | 处理人 · 日期 | 证据 |
|---|---|---|---|
| （待 P5 / 结项时回填） | | | |
