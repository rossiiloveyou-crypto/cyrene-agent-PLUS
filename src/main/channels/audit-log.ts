// channels/audit-log —— 外部渠道的「渠道控制台」审计流水。
//
// 记录范围：
//   1. tool_call        工具调用（放行 / 失败 / 被白名单拦截）
//   2. message_blocked  消息拦截（叫了昔涟但不在白名单、命中拦截关键词）
//   3. turn_failed      异常失败的对话轮次（超时 / 运行时错误 / 调用异常）
//   4. turn_success     成功对话轮次（默认不记录，由控制台开关打开）
//
// 存储布局（userData/channels/audit/）：
//   index.jsonl        列表用的元数据（一行一 JSON，最新追加在末尾）
//   logs/<时间>-<类型>-<id>.log   单条记录的完整内容（不截断）
//
// 列表里只放摘要；详情页通过 logPath 直接打开完整日志文件，
// 因此超长参数/超长输出不需要在 UI 侧截断，也不会撑爆索引文件。
//
// 与 message-log.ts 同构：任何写失败都只告警，绝不影响渠道回复主流程。
import * as fs from "fs";
import * as path from "path";
import { app } from "electron";
import type { ChannelChatType, ChannelId } from "./types";

const LOG = "[ChannelAudit]";

export type ChannelAuditKind = "tool_call" | "message_blocked" | "turn_failed" | "turn_success";
export type ChannelAuditStatus = "success" | "failure" | "blocked";
/** 消息因何进入处理链路。 */
export type ChannelMessageTrigger = "mention" | "trigger_keyword" | "private" | "unknown";

/** 写入完整日志文件的段落（正文不做任何截断）。 */
export interface ChannelAuditSection {
  heading: string;
  body: string;
}

export interface ChannelAuditEntry {
  id: string;
  /** epoch ms */
  at: number;
  kind: ChannelAuditKind;
  status: ChannelAuditStatus;
  channel: ChannelId;
  chatType: ChannelChatType;
  chatId: string;
  senderId: string;
  senderName?: string;
  /** 渠道侧会话 id（dispatcher 传入的 sessionId），用于关联上下文 */
  sessionId?: string;
  /** 列表主文案（如工具名、拦截类型） */
  title: string;
  /** 列表副文案（摘要，完整内容在 logPath 指向的文件里） */
  summary: string;
  /** 失败/拦截原因 */
  reason?: string;
  /** 消息触发方式 */
  trigger?: ChannelMessageTrigger;
  /** 工具展示名（拿不到时回落 toolId） */
  toolName?: string;
  toolId?: string;
  /** 模型传入的参数摘要（索引里逐值截断；完整参数在日志文件里） */
  args?: Record<string, unknown>;
  /** 是否命中工具白名单（null = 该模式下未检查） */
  allowlisted?: boolean | null;
  durationMs?: number;
  /** 用户发给昔涟的原文（拦截/失败时保留，便于追溯） */
  userText?: string;
  /** 完整日志文件绝对路径 */
  logPath: string;
}

export interface ChannelAuditInput {
  kind: ChannelAuditKind;
  status: ChannelAuditStatus;
  channel: ChannelId;
  chatType: ChannelChatType;
  chatId: string;
  senderId: string;
  senderName?: string;
  sessionId?: string;
  title: string;
  summary?: string;
  reason?: string;
  trigger?: ChannelMessageTrigger;
  toolName?: string;
  toolId?: string;
  args?: Record<string, unknown>;
  allowlisted?: boolean | null;
  durationMs?: number;
  userText?: string;
  /** 完整日志文件的正文段落；不截断，仅在文件里出现 */
  sections?: ChannelAuditSection[];
  at?: number;
}

/** 控制台的审计开关（存在 channels-settings.json）。 */
export interface ChannelAuditConfig {
  /** 是否把「请求成功」的对话也计入控制台（默认关闭，只记录失败与拦截）。 */
  recordSuccessTurns: boolean;
}

export const DEFAULT_AUDIT_CONFIG: ChannelAuditConfig = { recordSuccessTurns: false };

export function normalizeAuditConfig(input: unknown): ChannelAuditConfig {
  const source = (input ?? {}) as Partial<ChannelAuditConfig>;
  return {
    recordSuccessTurns: typeof source.recordSuccessTurns === "boolean"
      ? source.recordSuccessTurns
      : DEFAULT_AUDIT_CONFIG.recordSuccessTurns,
  };
}

export const AUDIT_KIND_LABELS: Record<ChannelAuditKind, string> = {
  tool_call: "工具调用",
  message_blocked: "消息拦截",
  turn_failed: "对话失败",
  turn_success: "对话成功",
};

export const AUDIT_STATUS_LABELS: Record<ChannelAuditStatus, string> = {
  success: "成功",
  failure: "失败",
  blocked: "已拦截",
};

const MAX_INMEM = 400;
const MAX_FILE_LINES = 2000;
/** 单个参数值写进索引的长度上限（完整值在日志文件里） */
const ARG_VALUE_LIMIT = 400;
/** 列表摘要长度上限 */
const SUMMARY_LIMIT = 200;
/** 日志文件保留天数与数量上限（惰性清理） */
const LOG_RETENTION_DAYS = 30;
const MAX_LOG_FILES = 2000;
const PRUNE_EVERY = 50;

const inMemory: ChannelAuditEntry[] = [];
const listeners = new Set<(entry: ChannelAuditEntry) => void>();
let appendsSincePrune = 0;

/** 审计根目录（userData/channels/audit）。 */
export function auditRootDir(): string {
  return path.join(app.getPath("userData"), "channels", "audit");
}

/** 完整日志文件目录（userData/channels/audit/logs）。 */
export function auditLogsDir(): string {
  return path.join(auditRootDir(), "logs");
}

function indexPath(): string {
  return path.join(auditRootDir(), "index.jsonl");
}

function ensureDir(): void {
  fs.mkdirSync(auditLogsDir(), { recursive: true });
}

function nextId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, "0");
}

/** 本地时间戳，用于日志文件名与正文抬头。 */
function stamp(at: number): { fileName: string; display: string } {
  const d = new Date(at);
  const date = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return {
    fileName: `${date}-${time}`,
    display: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`,
  };
}

function truncate(text: string, limit: number): string {
  const points = Array.from(text);
  if (points.length <= limit) return text;
  return `${points.slice(0, limit).join("")}…(+${points.length - limit} 字符，完整内容见日志文件)`;
}

function summarizeValue(value: unknown): unknown {
  if (typeof value === "string") return truncate(value, ARG_VALUE_LIMIT);
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  try {
    const json = JSON.stringify(value);
    if (json === undefined) return String(value);
    return truncate(json, ARG_VALUE_LIMIT);
  } catch {
    return String(value);
  }
}

/** 参数摘要：逐值截断，保证索引文件不会被超大参数撑爆（完整值写进日志文件）。 */
export function summarizeToolArgs(args: unknown): Record<string, unknown> {
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    return args === undefined ? {} : { value: summarizeValue(args) };
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args as Record<string, unknown>)) {
    out[key] = summarizeValue(value);
  }
  return out;
}

/** 值 → 可写入日志文件的文本（对象走缩进 JSON，尽量保持可读）。 */
function stringifyForLog(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined) return "";
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

function buildLogBody(entry: ChannelAuditEntry, sections: ChannelAuditSection[] | undefined): string {
  const { display } = stamp(entry.at);
  const lines: string[] = [
    "Cyrene 渠道控制台 · 完整记录",
    "========================================",
    `时间: ${display}`,
    `类型: ${AUDIT_KIND_LABELS[entry.kind]}`,
    `状态: ${AUDIT_STATUS_LABELS[entry.status]}`,
    `渠道: ${entry.channel}`,
    `会话类型: ${entry.chatType === "group" ? "群聊" : "私聊"}`,
    `会话: ${entry.chatId}`,
    `发送者: ${entry.senderName ? `${entry.senderName} (${entry.senderId})` : entry.senderId}`,
  ];
  if (entry.sessionId) lines.push(`渠道会话 ID: ${entry.sessionId}`);
  if (entry.trigger) lines.push(`触发方式: ${entry.trigger}`);
  if (entry.toolId) lines.push(`工具: ${entry.toolName ?? entry.toolId} (${entry.toolId})`);
  if (entry.allowlisted !== undefined && entry.allowlisted !== null) {
    lines.push(`命中工具白名单: ${entry.allowlisted ? "是" : "否"}`);
  }
  if (typeof entry.durationMs === "number") lines.push(`耗时: ${entry.durationMs}ms`);
  lines.push(`记录 ID: ${entry.id}`);
  lines.push("", "── 摘要 ──", entry.summary);
  if (entry.reason) lines.push("", "── 失败/拦截原因 ──", entry.reason);
  if (entry.userText) lines.push("", "── 用户发送给昔涟的原文 ──", entry.userText);
  if (entry.args && Object.keys(entry.args).length > 0) {
    lines.push("", "── 工具调用参数（完整）──", stringifyForLog(entry.args));
  }
  for (const section of sections ?? []) {
    lines.push("", `── ${section.heading} ──`, section.body);
  }
  lines.push("", "========================================", "");
  return lines.join("\n");
}

function writeLogFile(entry: ChannelAuditEntry, sections?: ChannelAuditSection[]): string {
  ensureDir();
  const { fileName } = stamp(entry.at);
  const safeSender = auditSenderSlug(entry.senderId);
  const file = path.join(auditLogsDir(), `${fileName}-${entry.kind}-${safeSender}-${entry.id}.log`);
  fs.writeFileSync(file, buildLogBody(entry, sections), "utf8");
  return file;
}

/**
 * senderId → 日志文件名里使用的安全片段。
 *
 * ⚠️ 写入（writeLogFile）与擦除（erasePersonAudit）**必须共用这一个函数**：
 * 擦除判据是"文件名里含这个片段"，两处各写一份算法迟早漂移（改了一处忘了另一处），
 * 结果就是"删完还剩他的 .log 文件"这种静默漏删。
 */
export function auditSenderSlug(senderId: string): string {
  return senderId.replace(/[^\w.-]/g, "_").slice(0, 32) || "unknown";
}

/** 惰性清理：超期或超量的日志文件按修改时间从旧到新删除。 */
function pruneLogFiles(): void {
  try {
    const files = fs.readdirSync(auditLogsDir())
      .filter((name) => name.endsWith(".log"))
      .map((name) => {
        const full = path.join(auditLogsDir(), name);
        let mtime = 0;
        try {
          mtime = fs.statSync(full).mtimeMs;
        } catch {
          /* ignore */
        }
        return { full, mtime };
      })
      .sort((a, b) => a.mtime - b.mtime);
    const expireBefore = Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const doomed = files.filter((f, index) => f.mtime < expireBefore || index < files.length - MAX_LOG_FILES);
    for (const file of doomed) {
      try {
        fs.unlinkSync(file.full);
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
}

/**
 * 追加一条审计记录：先写完整日志文件，再把元数据追加进索引并通知订阅者。
 * 返回落库后的条目（含 logPath）；写盘失败也会返回内存条目，审计不阻塞主流程。
 */
export function appendAudit(input: ChannelAuditInput): ChannelAuditEntry {
  const at = input.at ?? Date.now();
  const summary = truncate(input.summary ?? input.reason ?? input.title, SUMMARY_LIMIT);
  const entry: ChannelAuditEntry = {
    id: nextId(),
    at,
    kind: input.kind,
    status: input.status,
    channel: input.channel,
    chatType: input.chatType,
    chatId: input.chatId,
    senderId: input.senderId,
    ...(input.senderName ? { senderName: input.senderName } : {}),
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    title: input.title,
    summary,
    ...(input.reason ? { reason: input.reason } : {}),
    ...(input.trigger ? { trigger: input.trigger } : {}),
    ...(input.toolName ? { toolName: input.toolName } : {}),
    ...(input.toolId ? { toolId: input.toolId } : {}),
    ...(input.args ? { args: summarizeToolArgs(input.args) } : {}),
    ...(input.allowlisted === undefined ? {} : { allowlisted: input.allowlisted }),
    ...(typeof input.durationMs === "number" ? { durationMs: input.durationMs } : {}),
    ...(input.userText ? { userText: input.userText } : {}),
    logPath: "",
  };

  try {
    entry.logPath = writeLogFile(entry, input.sections);
  } catch (err) {
    console.warn(LOG, "写日志文件失败:", err instanceof Error ? err.message : err);
  }

  inMemory.push(entry);
  if (inMemory.length > MAX_INMEM) inMemory.splice(0, inMemory.length - MAX_INMEM);

  try {
    ensureDir();
    fs.appendFileSync(indexPath(), `${JSON.stringify(entry)}\n`, "utf8");
    const buf = fs.readFileSync(indexPath(), "utf8");
    const lines = buf.split("\n").filter((line) => line.length > 0);
    if (lines.length > MAX_FILE_LINES) {
      fs.writeFileSync(indexPath(), `${lines.slice(lines.length - MAX_FILE_LINES).join("\n")}\n`, "utf8");
    }
  } catch (err) {
    console.warn(LOG, "写索引失败:", err instanceof Error ? err.message : err);
  }

  appendsSincePrune += 1;
  if (appendsSincePrune >= PRUNE_EVERY) {
    appendsSincePrune = 0;
    pruneLogFiles();
  }

  for (const listener of listeners) {
    try {
      listener(entry);
    } catch (err) {
      console.warn(LOG, "审计订阅者异常:", err instanceof Error ? err.message : err);
    }
  }
  return entry;
}

/** 读最近 N 条（最新在前）。内存为空时从磁盘恢复。 */
export function getAudit(limit = 200): ChannelAuditEntry[] {
  const n = Math.max(1, Math.min(MAX_INMEM, limit));
  if (inMemory.length > 0) return [...inMemory].slice(-n).reverse();
  return readFromDisk().slice(-n).reverse();
}

/** 按 id 找一条审计记录（打开日志文件前校验用）。 */
export function findAudit(id: string): ChannelAuditEntry | null {
  const fromMemory = inMemory.find((entry) => entry.id === id);
  if (fromMemory) return fromMemory;
  return readFromDisk().find((entry) => entry.id === id) ?? null;
}

/** 清空审计：索引、内存以及已落盘的日志文件全部删除。 */
export function clearAudit(): void {
  inMemory.length = 0;
  try {
    fs.rmSync(indexPath(), { force: true });
  } catch {
    /* ignore */
  }
  try {
    fs.rmSync(auditLogsDir(), { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

/**
 * 内部：`index.jsonl` 的原始行（已去掉空行）。**读失败会抛**，由调用方决定怎么记失败。
 *
 * 保留**原始行**而不是解析结果，是为了让"逐行过滤重写"能把别人的行按原字节写回
 * （JSON.parse → stringify 会改写别人的行，坏行也会被吃掉）。
 */
function readIndexRawLines(): string[] {
  return fs.readFileSync(indexPath(), "utf8").split("\n").filter((line) => line.length > 0);
}

/** 内部：只读场景的容错包装（文件不存在 / 读不了 → `[]`）。 */
function tryReadIndexRawLines(): string[] {
  try {
    return readIndexRawLines();
  } catch {
    return [];
  }
}

/**
 * 内部：`logs/` 下属于该 senderId 的日志文件（绝对路径）。
 *
 * **唯一**的文件名判据：与 `writeLogFile` 共用 `auditSenderSlug`，两侧由
 * `-<slug>-` 定界（写入格式固定为 `<时间>-<类型>-<slug>-<id>.log`）。
 * 预演计数（countPersonAudit）与执行删除（erasePersonAudit）都必须走这里，避免两处漂移。
 */
function auditLogFilesForSender(senderId: string): string[] {
  const needle = `-${auditSenderSlug(senderId)}-`;
  try {
    return fs.readdirSync(auditLogsDir())
      .filter((name) => name.endsWith(".log") && name.includes(needle))
      .map((name) => path.join(auditLogsDir(), name));
  } catch {
    return [];
  }
}

/**
 * 只读：这个人还有多少审计痕迹（P3 预演用）。
 *
 * `entries` = `index.jsonl` 里 `senderId === senderId` 的行数；
 * `files`   = `logs/` 下文件名命中同一 slug 的 `.log` 文件数。
 * **不写任何东西**（预演必须零副作用，§2.13）；读不了就是 0，绝不抛错。
 */
export function countPersonAudit(senderId: string): { entries: number; files: number } {
  let entries = 0;
  for (const line of tryReadIndexRawLines()) {
    try {
      const parsed = JSON.parse(line) as ChannelAuditEntry;
      if (parsed && parsed.senderId === senderId) entries += 1;
    } catch {
      /* 坏行不计入 */
    }
  }
  return { entries, files: auditLogFilesForSender(senderId).length };
}

/**
 * 擦除**某一个人**的渠道审计（P3 擦除某人）：索引行、日志文件、内存数组三处一起清。
 *
 * ① `index.jsonl` 逐行过滤（`JSON.parse` → 保留 `senderId !== senderId` 的行；
 *    坏行原样保留 —— 绝不因为一行坏 JSON 丢掉别人的审计）；
 * ② `logs/` 下属于该 senderId 的 `.log` 文件整份删除
 *    （判据见 auditLogFilesForSender / auditSenderSlug）；
 * ③ 内存数组 `inMemory` 里的同 senderId 条目清掉（否则控制台刷新前还看得见）。
 *
 * 全同步实现：本模块的 IO 本身即同步，不要在这条链路引入 `await`（§0.4 约束 4）。
 * `failed` 收集中途失败的文件路径/索引路径，擦除流程据此报"部分完成"。
 * `entries` / `files` 的口径与 countPersonAudit 完全一致（预演与执行对得上）。
 */
export function erasePersonAudit(senderId: string): { entries: number; files: number; failed: string[] } {
  const failed: string[] = [];

  // ③ 内存（先清，这样即使磁盘失败控制台也不会继续显示他的记录）
  for (let i = inMemory.length - 1; i >= 0; i--) {
    if (inMemory[i].senderId === senderId) inMemory.splice(i, 1);
  }

  // ① 索引逐行过滤
  let entries = 0;
  try {
    if (fs.existsSync(indexPath())) {
      const kept: string[] = [];
      for (const line of readIndexRawLines()) {
        let parsed: ChannelAuditEntry | null = null;
        try {
          parsed = JSON.parse(line) as ChannelAuditEntry;
        } catch {
          kept.push(line); // 坏行保留
          continue;
        }
        if (parsed && parsed.senderId === senderId) {
          entries += 1;
          continue;
        }
        kept.push(line);
      }
      if (entries > 0) {
        fs.writeFileSync(indexPath(), kept.length > 0 ? `${kept.join("\n")}\n` : "", "utf8");
      }
    }
  } catch (err) {
    failed.push(indexPath());
    console.warn(LOG, "擦除审计索引失败:", err instanceof Error ? err.message : err);
  }

  // ② logs/ 下属于该 senderId 的文件
  let files = 0;
  for (const full of auditLogFilesForSender(senderId)) {
    try {
      fs.unlinkSync(full);
      files += 1;
    } catch (err) {
      failed.push(full);
      console.warn(LOG, "擦除审计日志文件失败:", err instanceof Error ? err.message : err);
    }
  }

  return { entries, files, failed };
}

/** 启动时从磁盘 reload 到内存（重启后控制台仍能看到历史）。 */
export function reloadAuditFromDisk(): void {
  const parsed = readFromDisk();
  if (parsed.length === 0) return;
  inMemory.push(...parsed.slice(-MAX_INMEM));
}

/** 订阅新审计记录（实时推送给渲染端用）。返回取消订阅函数。 */
export function subscribeAudit(listener: (entry: ChannelAuditEntry) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function readFromDisk(): ChannelAuditEntry[] {
  try {
    const buf = fs.readFileSync(indexPath(), "utf8");
    const parsed: ChannelAuditEntry[] = [];
    for (const line of buf.split("\n")) {
      if (!line) continue;
      try {
        parsed.push(JSON.parse(line) as ChannelAuditEntry);
      } catch {
        /* 跳过坏行 */
      }
    }
    return parsed;
  } catch (err) {
    if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(LOG, "读审计失败:", err.message);
    }
    return [];
  }
}
