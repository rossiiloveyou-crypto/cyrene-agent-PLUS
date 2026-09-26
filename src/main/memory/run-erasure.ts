/**
 * Run Store Erasure —— 「彻底擦除某人」时清掉 **agent 运行记录**（P3 §9.3c 第 19 条 / **D4**）。
 *
 * ## 为什么需要它
 *
 * `cyrene-runs/sessions/<runId>.json` 里存的是那一次运行喂给模型的**完整 messages**，
 * 逐字包含 `[小明]: 我还养了只鹦鹉` 这样的对话正文（实测 84/95 个 run 命中被擦者）。
 * 它原来**既不在 `PERSON_ERASABLE` 也不在 `MEMORY_PRESERVED`** —— §0.4 的"清单即边界"对它失效，
 * 于是"彻底擦除"之后，`cyrene-runs/` 里仍能一字不差地读出他说过的所有话。
 *
 * ## 判据（用户已定的口径：**按会话过滤**）
 *
 * `run.conversationId ∈ 他发过言的会话` → 删这个 run（session 文件 + 它的 `.events.jsonl`）。
 * 判据是**结构化的**（run 记录自带 `conversationId`），不依赖正文匹配，所以确定性最强；
 * 代价是同群别人的 run 记录也一并没了（与 transcript 侧"整会话/逐行"是同一个取舍）。
 *
 * `reviews/` 与 `tool-results/` **不删**，但进"疑似残留"清单（见 `person-erasure.collectResidues`）：
 * 它们是运行评审与工具输出，按内容删会误伤"路径里恰好含他的号"这类无关文件。
 *
 * ## 预览与执行同源
 *
 * - 预览：`countRunsForConversations()` **只读** `index.json`（绝不 initialize —— 那会写盘）；
 * - 执行：交给 `HarnessRunStore.deleteConversation()`（它同时清 events 与 index 行，
 *   下次启动的权威校正也会把孤儿行收走）。
 * 两边都只看 `conversationId`，数字口径一致。
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { getHarnessRunStore } from "../orchestrator/harness/run-store";

const RUNS_DIR_NAME = "cyrene-runs";
const INDEX_FILE_NAME = "index.json";

export const RUN_ERASABLE_DIR = `${RUNS_DIR_NAME}/sessions/`;
/**
 * 只报告、不自动删的运行产物（进疑似残留清单）。
 *
 * ⚠️ **`sessions/` 也在这里**：按会话过滤之后仍可能有 run 活下来
 * （例如"所有能指认他的结构性指针都已被前面的擦除抹掉"），而它的正文里**还带着他的话**。
 * 那种情况必须**看得见**，不能静默留下 —— 见 `person-erasure.collectResidues` 的第 ⑤ 类。
 */
export const RUN_RESIDUE_DIRS = [
  `${RUNS_DIR_NAME}/reviews`,
  `${RUNS_DIR_NAME}/tool-results`,
  RUN_ERASABLE_DIR.replace(/\/$/, ""),
] as const;

interface IndexRow {
  conversationId?: unknown;
  runId?: unknown;
}

/** 读 `index.json` 的行；文件不存在或坏掉时返回 `[]`（**绝不抛错、绝不写盘**）。 */
function readIndexRows(userDataDir: string): IndexRow[] {
  try {
    const file = path.join(userDataDir, RUNS_DIR_NAME, INDEX_FILE_NAME);
    if (!fs.existsSync(file)) return [];
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
    return Array.isArray(parsed) ? (parsed as IndexRow[]) : [];
  } catch {
    return [];
  }
}

/**
 * 预演用：**只读**数出"会被删掉的 run 数"。与执行侧同判据（只比 `conversationId`）。
 */
export function countRunsForConversations(userDataDir: string, conversationIds: ReadonlySet<string>): number {
  if (conversationIds.size === 0) return 0;
  return readIndexRows(userDataDir)
    .filter((row) => typeof row.conversationId === "string" && conversationIds.has(row.conversationId))
    .length;
}

/**
 * 执行用：删掉这些会话的全部 run（session 文件 + `.events.jsonl` + index 行）。
 *
 * 走 store 自己的 `deleteConversation()`，不手写 fs 逻辑 —— 它是 index 的唯一写者，
 * 绕过它就等于把 index 弄脏（下次启动虽有权威校正兜底，但没必要制造不一致）。
 */
export function eraseRunsForConversations(
  userDataDir: string,
  conversationIds: readonly string[],
): { runs: number; failed: Array<{ target: string; error: string }> } {
  const failed: Array<{ target: string; error: string }> = [];
  if (conversationIds.length === 0) return { runs: 0, failed };
  const ids = new Set(conversationIds);
  // **无事可做就别碰 store**：`index.json` 不存在/坏掉/没有命中行时，
  // 实例化 store 会 initialize（可能写盘），而这里本来一条都不会删 —— 宁可什么都不做。
  const before = countRunsForConversations(userDataDir, ids);
  if (before === 0) return { runs: 0, failed };
  let store: ReturnType<typeof getHarnessRunStore>;
  try {
    store = getHarnessRunStore(userDataDir);
  } catch (err) {
    return { runs: 0, failed: [{ target: RUNS_DIR_NAME, error: err instanceof Error ? err.message : String(err) }] };
  }
  // 先按 index 数一遍（与预演同口径），再逐个会话删；删完再数一次，差值就是真实删掉的 run 数。
  for (const conversationId of ids) {
    try {
      store.deleteConversation(conversationId);
    } catch (err) {
      failed.push({ target: conversationId, error: err instanceof Error ? err.message : String(err) });
    }
  }
  const after = countRunsForConversations(userDataDir, ids);
  return { runs: Math.max(0, before - after), failed };
}
