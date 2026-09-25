// channels/message-log —— JSONL 落盘 + 内存最近 N 条，给 UI 提供消息日志查看。
//
// 数据流：
//   dispatcher 处理完入站/出站后 → appendLog(incoming) / appendLog(outgoing)
//   → 写入 userData/channels/log.jsonl (一行一 JSON)
//   → 同时维护内存 lastN 数组（默认 200 条）
//
// 读：
//   getRecentLog(limit) → 最近 N 条倒序
//   clearLog() → 清磁盘 + 内存
import * as fs from "fs";
import * as path from "path";
import { app } from "electron";

const LOG = "[ChannelLog]";

export interface LogEntry {
  /** ISO 时间戳 */
  at: string;
  /** "incoming" | "outgoing" | "error"（agent 调用/发送失败，打包版排障用） */
  dir: "incoming" | "outgoing" | "error";
  channel: string;
  senderId: string;
  senderName?: string;
  chatId: string;
  text: string;
  /** 是否有附件（不进 JSONL，只记布尔） */
  hasAttachments?: boolean;
}

const MAX_FILE_LINES = 1000;
const MAX_INMEM = 200;

const inMemory: LogEntry[] = [];

function filePath(): string {
  return path.join(app.getPath("userData"), "channels", "log.jsonl");
}

function ensureDir(): void {
  const dir = path.dirname(filePath());
  fs.mkdirSync(dir, { recursive: true });
}

/** 追加一条日志。失败不影响主流程。 */
export function appendLog(entry: Omit<LogEntry, "at">): void {
  const full: LogEntry = { at: new Date().toISOString(), ...entry };
  inMemory.push(full);
  if (inMemory.length > MAX_INMEM) {
    inMemory.splice(0, inMemory.length - MAX_INMEM);
  }
  try {
    ensureDir();
    fs.appendFileSync(filePath(), JSON.stringify(full) + "\n", "utf8");
    // 简单截断：超过 MAX_FILE_LINES 行就丢掉最老的
    const buf = fs.readFileSync(filePath(), "utf8");
    const lines = buf.split("\n");
    if (lines.length > MAX_FILE_LINES) {
      const trimmed = lines.slice(lines.length - MAX_FILE_LINES).join("\n");
      fs.writeFileSync(filePath(), trimmed + "\n", "utf8");
    }
  } catch (err) {
    console.warn(LOG, "写日志失败:", err instanceof Error ? err.message : err);
  }
}

/** 读最近 N 条（最新在前）。 */
export function getRecentLog(limit = 100): LogEntry[] {
  const n = Math.max(1, Math.min(MAX_INMEM, limit));
  if (inMemory.length > 0) {
    return [...inMemory].slice(-n).reverse();
  }
  // 内存空（刚启动）→ 从磁盘读
  try {
    const buf = fs.readFileSync(filePath(), "utf8");
    const lines = buf.split("\n").filter((l) => l.length > 0);
    const parsed: LogEntry[] = [];
    for (const line of lines) {
      try {
        parsed.push(JSON.parse(line) as LogEntry);
      } catch {
        /* skip */
      }
    }
    return parsed.slice(-n).reverse();
  } catch {
    return [];
  }
}

/** 清空日志（磁盘 + 内存）。 */
export function clearLog(): void {
  inMemory.length = 0;
  try {
    fs.unlinkSync(filePath());
  } catch {
    /* ignore */
  }
}

/**
 * 内部：`log.jsonl` 的原始行（已去掉空行）。**读失败会抛**，由调用方决定怎么记失败。
 * 保留原始行，是为了让逐行过滤重写能把别人的行按原字节写回（不让坏行被吃掉）。
 */
function readLogRawLines(): string[] {
  return fs.readFileSync(filePath(), "utf8").split("\n").filter((line) => line.length > 0);
}

/** 内部：只读场景的容错包装（文件不存在 / 读不了 → `[]`）。 */
function tryReadLogRawLines(): string[] {
  try {
    return readLogRawLines();
  } catch {
    return [];
  }
}

/**
 * 只读：这个人还有多少运行日志行（P3 预演用）。
 *
 * 口径与 `erasePersonLog().lines` 完全一致（同一份原始行 + 同一个 `senderId` 判据），
 * 这样预演报告的计数与执行后报告的删除数天然对得上。坏行不计入。
 * **不写任何东西**；文件不存在就是 0，绝不抛错。
 */
export function countPersonLog(senderId: string): number {
  let lines = 0;
  for (const line of tryReadLogRawLines()) {
    try {
      const parsed = JSON.parse(line) as LogEntry;
      if (parsed && parsed.senderId === senderId) lines += 1;
    } catch {
      /* 坏行不计入 */
    }
  }
  return lines;
}

/**
 * 擦除**某一个人**的运行日志（P3 擦除某人）：磁盘 JSONL 逐行过滤重写 + 内存数组清理。
 *
 * ① `channels/log.jsonl` 里 `senderId` 命中的行删掉，其余行按原顺序原样重写整个文件
 *    （保留 1000 行滚动语义：过滤只会让文件更短，再按 MAX_FILE_LINES 兜一次上限；
 *    坏行原样保留 —— 一行坏 JSON 不能让别人的日志消失）；
 * ② 内存 `inMemory` 数组里的同 senderId 条目清掉。
 *
 * 全同步实现：本模块 IO 本身即同步，**中间不能有 await**（Node 单线程 + 无让出点才保证
 * 不会与 appendLog 的追加交错，§0.4 约束 4）。`failed` 收集写失败的路径。
 */
export function erasePersonLog(senderId: string): { lines: number; failed: string[] } {
  const failed: string[] = [];

  // ② 内存：先清，这样即使磁盘失败 UI 也不会继续显示他的消息
  for (let i = inMemory.length - 1; i >= 0; i--) {
    if (inMemory[i].senderId === senderId) inMemory.splice(i, 1);
  }

  // ① 磁盘：读 → 过滤 → 写，全程同步
  const target = filePath();
  let lines = 0;
  try {
    if (fs.existsSync(target)) {
      const kept: string[] = [];
      for (const line of readLogRawLines()) {
        let parsed: LogEntry | null = null;
        try {
          parsed = JSON.parse(line) as LogEntry;
        } catch {
          kept.push(line); // 坏行保留
          continue;
        }
        if (parsed && parsed.senderId === senderId) {
          lines += 1;
          continue;
        }
        kept.push(line);
      }
      if (lines > 0) {
        const capped = kept.length > MAX_FILE_LINES ? kept.slice(kept.length - MAX_FILE_LINES) : kept;
        ensureDir();
        fs.writeFileSync(target, capped.length > 0 ? `${capped.join("\n")}\n` : "", "utf8");
      }
    }
  } catch (err) {
    failed.push(target);
    console.warn(LOG, "擦除日志失败:", err instanceof Error ? err.message : err);
  }

  return { lines, failed };
}

/** 启动时从磁盘 reload 到内存（避免重启后内存里没有历史）。 */
export function reloadLogFromDisk(): void {
  try {
    const buf = fs.readFileSync(filePath(), "utf8");
    const lines = buf.split("\n").filter((l) => l.length > 0);
    const parsed: LogEntry[] = [];
    for (const line of lines) {
      try {
        parsed.push(JSON.parse(line) as LogEntry);
      } catch {
        /* skip */
      }
    }
    inMemory.push(...parsed.slice(-MAX_INMEM));
  } catch (err) {
    if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(LOG, "从磁盘 reload 失败:", err.message);
    }
  }
}