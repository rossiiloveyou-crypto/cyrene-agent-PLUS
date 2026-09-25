import * as fs from "fs";
import * as path from "path";
import { app } from "electron";
import { appendMemoryTrace } from "./memory-trace";

/**
 * 删除全部记忆时清理的路径（相对 userData）。目录用 trailing "/" 标记。
 *
 * 语义边界（务必与 UI 文案一致）：
 *   删除 = 昔涟"记得的一切"：L0/L1/L2、向量库、关系日志、实体图谱、
 *          朋友圈（含运行时状态与待处理反应队列）、社交原子、
 *          渠道 transcript（热层）、渠道按月归档（温层）、世界书运行时状态。
 *   保留 = 桌面对话记录（cyrene-chats/）、渠道配置、模型配置、表情包、定时任务、插件。
 */
export const MEMORY_TARGETS = [
  "memory.json",
  "memory-trace.log",
  "relationship-log.json",
  "entity-graph.json",
  "moments.json",
  "moments-state.json",
  "moments-reaction-queue.json",
  "chat-social-atoms.json",
  "worldbook-state.json",
  "proactive-state.json",
  "rag-data/memory-store.json",
  "rag-data/memory-store-meta.json",
  "rag-data/document-cache.json",
  "channels/history/",      // 目录：全部会话 transcript（热层）
  "channels/archive/",      // 目录：全部会话按月归档（温层，Phase 1.5 T7 引入）
  "memory-reconcile-backups/", // 目录：启动对账写下的 memory/vector 整份副本（P3 补进）
] as const;

/** 明确**不**删除的路径——写在这里是为了让"边界"可被测试锁定，而不是靠注释。 */
export const MEMORY_PRESERVED = [
  "cyrene-chats/",
  "channels-settings.json",
  "zones.json",
  // 群聊语料（自学习模块的数据前置层）：只增不减的长期资产，
  // 被清空等于前功尽弃，见 src/main/corpus/group-corpus.ts 顶部契约。
  "group-corpus/",
  // 运行产物：**不自动删**，但会进「疑似残留」清单（内容级删除会误伤无关文件）。
  "cyrene-runs/reviews/",
  "cyrene-runs/tool-results/",
] as const;

/**
 * 交给 UI 的「有意保留」清单（**O2**）：与 `MEMORY_PRESERVED` 同源，但**去掉群聊语料**。
 *
 * 为什么要去掉它：
 *   ① 弹窗里语料有**自己的一行**（§0.4 约束 2 要求"必须说出来"），列两遍是冗余；
 *   ② 预演负载里出现语料路径，会让 `person-erasure.integration.test.ts` 里
 *      "预演 JSON 不许含语料字面量"那条断言失效 —— 那条断言守的是**擦除链路不碰语料**，
 *      不该因为文案需要而被削弱。
 */
export const MEMORY_PRESERVED_FOR_UI: readonly string[] =
  MEMORY_PRESERVED.filter((rel) => rel !== "group-corpus/");

/**
 * 记忆备份的文件名模式（相对 userData 根目录）。
 *
 * `memory.backup.<ISO>.json` 由 memory-store-io.ts 的 backupMemoryFile() 写出，
 * 每次记忆格式迁移一份、**没有保留期上限**。glob 不能直接进 MEMORY_TARGETS，
 * 所以单独一条清单 + 由 listMemoryBackupTargets() 展开成实际路径 —— 保持"清单即边界"可测试。
 */
export const MEMORY_BACKUP_GLOBS = ["memory.backup.*.json"] as const;

/** 对账备份目录（相对 userData 根目录）；与 MEMORY_TARGETS 里那一项同源。 */
const RECONCILE_BACKUP_DIR = "memory-reconcile-backups";

/**
 * 「擦除某个人」时可被逐人处理的路径清单（Phase 3 P3 引入）。
 *
 * ⚠️ 三条必须写清的约定：
 *
 * 1. **群聊语料 `group-corpus/` 刻意不在这张清单里，而且永远不许加进来。**
 *    它是只写不读、没有任何生产消费方的长期资产（`group-corpus-isolation.test.ts` 锁着），
 *    擦除某人时**连它的路径字面量都不该出现**。它必须留在 MEMORY_PRESERVED 里。
 *
 * 2. 这些条目**是按人过滤的，不是整份删除**：只有 `memory.json` / 向量库
 *    （`rag-data/memory-store.json`）/ 备份（`memory.backup.*.json` + 对账备份目录）/
 *    调试日志（`chat-api.log`）是**整条或整份**销毁；其余（transcript、审计、运行日志、
 *    实体图、关系日志、外部会话观察）都必须**逐行过滤 / 局部删除**，保留别人的数据。
 *
 * 3. 本清单与 `deleteAllMemory` 的 `MEMORY_TARGETS` 语义互斥：
 *    `MEMORY_TARGETS` 是整目录清空，**擦除流程绝不能复用它**（§0.4 约束 1）。
 */
export const PERSON_ERASABLE = [
  "memory.json",
  "rag-data/memory-store.json",
  "channels/history/",
  "channels/archive/",
  "channels/audit/",
  "channels/log.jsonl",
  "chat-api.log",
  "memory.backup.*.json",
  "memory-reconcile-backups/",
  "entity-graph.json",
  "relationship-log.json",
  "channels/context-bindings.json",
  // 目录：agent 运行记录（`<runId>.json` + `<runId>.events.jsonl`），**按会话过滤**。
  // 里面是逐字对话正文（实测 84/95 个 run 命中被擦者），原来既不在可擦清单也不在保留清单
  // —— 边界缺口，见 P3 §9.3c 第 19 条（D4）。判据与删除实现都在 `run-erasure.ts`。
  "cyrene-runs/sessions/",
] as const;

export interface DeleteAllMemoryResult {
  deleted: string[];
  failed: Array<{ path: string; error: string }>;
}

export interface DeleteAllMemoryDeps {
  /** 覆盖 userData 根目录（测试用）。 */
  userDataDir?: string;
  /** 删除实现的注入点；默认 fs.rmSync。测试用它模拟 EBUSY 之类的失败。 */
  remove?: (target: string) => void;
}

/**
 * 把 `MEMORY_BACKUP_GLOBS` 的 `*` 展开成正则（只支持 `*`，够用且不引入依赖）。
 * 其余正则元字符一律转义，避免 `.` 被当成通配符（`memory.backup.` 里的点必须字面匹配）。
 */
function globToRegExp(pattern: string): RegExp {
  const source = pattern
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${source}$`);
}

/**
 * 列出「记忆备份」的实际路径（绝对路径），供 `deleteAllMemory` 与 `erasePerson` 共用。
 *
 * 展开 `MEMORY_BACKUP_GLOBS`（userData 根目录下的 `memory.backup.*.json`，
 * 命名由 memory-store-io.ts 的 backupMemoryFile() 决定，两边由测试锁死）
 * **加上**对账备份目录 `memory-reconcile-backups/`（存在时）。
 *
 * 语义：什么都不存在 → `[]`；根目录读不了 → `[]`；**绝不抛错**。
 * 返回绝对路径的原因：两个调用方都要直接把它交给 `fs.rmSync` / 注入的 remove。
 */
export function listMemoryBackupTargets(userDataDir?: string): string[] {
  const root = userDataDir ?? app.getPath("userData");
  const targets: string[] = [];
  try {
    const matchers = MEMORY_BACKUP_GLOBS.map(globToRegExp);
    for (const name of fs.readdirSync(root)) {
      if (matchers.some((matcher) => matcher.test(name))) targets.push(path.join(root, name));
    }
  } catch {
    // 根目录不存在或读不了：没有备份可列
  }
  try {
    const reconcileDir = path.join(root, RECONCILE_BACKUP_DIR);
    if (fs.existsSync(reconcileDir)) targets.push(reconcileDir);
  } catch {
    // 同上
  }
  return targets;
}

/** 统计一个文件/目录的字节数（目录递归累加）。算不出来时返回 0，绝不抛错。 */
function measureBytes(target: string): number {
  try {
    const stat = fs.statSync(target);
    if (!stat.isDirectory()) return stat.size;
    let total = 0;
    for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
      total += measureBytes(path.join(target, entry.name));
    }
    return total;
  } catch {
    return 0;
  }
}

/**
 * 递归数一个文件/目录里的**文件个数**。算不出来时返回 0，绝不抛错。
 *
 * 为什么要它：`files` 返回的是**目标**列表（`memory.backup.*.json` 文件 + `memory-reconcile-backups/`
 * **目录本身**），而预演侧的 `probeBackups` 是**递归数文件**的 —— 同一个"备份"在弹窗里是 4 个、
 * 在完成报告里是 3 个（2 文件 + 1 目录），用户会以为漏删了一个（**D3**，见 P3 §9.3c 第 18 条）。
 * 两边的口径必须一致，且"文件数"才是用户想知道的量。
 */
function countFiles(target: string): number {
  try {
    const stat = fs.statSync(target);
    if (!stat.isDirectory()) return 1;
    let total = 0;
    for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
      total += countFiles(path.join(target, entry.name));
    }
    return total;
  } catch {
    return 0;
  }
}

/**
 * 整份销毁所有记忆备份（Phase 3 P3，§0.4 约束 6）。
 *
 * **不做任何过滤**：备份的唯一用途是"回退到旧状态"，而擦除的目标正是"旧状态不能再回来" ——
 * 留一份含他的 `memory.json` 副本，等于一次误操作就能让他复活。
 *
 * 与 `listMemoryBackupTargets()` 同源（同一份 glob 展开函数），
 * 逐项独立 try/catch：一项失败不影响其余，失败项进 `failed`。
 */
export function eraseMemoryBackups(deps: {
  userDataDir?: string;
  remove?: (target: string) => void;
} = {}): { files: string[]; fileCount: number; bytes: number; failed: string[] } {
  const root = deps.userDataDir ?? app.getPath("userData");
  const remove = deps.remove ?? ((target: string) => {
    fs.rmSync(target, { recursive: true, force: true });
  });
  const files: string[] = [];
  const failed: string[] = [];
  let fileCount = 0;
  let bytes = 0;

  for (const target of listMemoryBackupTargets(root)) {
    bytes += measureBytes(target);
    fileCount += countFiles(target);
    try {
      remove(target);
      files.push(target);
    } catch (err) {
      failed.push(target);
      console.warn("[MemoryDeletion] 销毁备份失败:", target, err instanceof Error ? err.message : err);
    }
  }
  return { files, fileCount, bytes, failed };
}

/**
 * 删除全部长期记忆。
 *
 * 调用方责任：删除后必须让内存缓存失效（建议重启应用），
 * 否则 memoryStore / entityGraph / JsonVectorStore 会把缓存里的旧数据写回磁盘。
 */
export function deleteAllMemory(deps: DeleteAllMemoryDeps = {}): DeleteAllMemoryResult {
  const root = deps.userDataDir ?? app.getPath("userData");
  const remove = deps.remove ?? ((target: string) => {
    fs.rmSync(target, { recursive: true, force: true });
  });
  const deleted: string[] = [];
  const failed: Array<{ path: string; error: string }> = [];

  for (const rel of MEMORY_TARGETS) {
    const target = path.join(root, rel);
    try {
      if (!fs.existsSync(target)) continue;
      remove(target);
      deleted.push(rel);
    } catch (err) {
      failed.push({ path: rel, error: err instanceof Error ? err.message : String(err) });
    }
  }

  // 记忆备份（glob 展开 + 对账备份目录）：与上面同一个 try/catch-per-item 语义。
  // 注意在 MEMORY_TARGETS 循环**之后**展开：对账备份目录若已被上一步删掉，这里自然就列不出来。
  for (const target of listMemoryBackupTargets(root)) {
    try {
      if (!fs.existsSync(target)) continue;
      remove(target);
      deleted.push(target);
    } catch (err) {
      failed.push({ path: target, error: err instanceof Error ? err.message : String(err) });
    }
  }

  // trace 文件刚被删掉，重新建一条删除审计（appendMemoryTrace 会自动建目录）
  try {
    appendMemoryTrace({
      op: "memory.deleteAll",
      layer: "store",
      status: failed.length === 0 ? "ok" : "error",
      details: { deleted, failed: failed.map((f) => f.path) },
    });
  } catch {
    // 审计失败不影响删除结果
  }

  return { deleted, failed };
}
