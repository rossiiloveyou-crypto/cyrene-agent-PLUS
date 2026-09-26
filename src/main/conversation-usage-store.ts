// conversation-usage-store —— 按「对话（会话）」累计的 Token 用量。
//
// 与 token-usage-store 的分工：
//   token-usage-store       全局按天/按模型统计（设置里的总览、Token 面板用）
//   conversation-usage-store 按 sessionId 统计本对话的总消耗与缓存命中率（聊天窗口顶栏用量徽章用）
//
// 归属方式：AsyncLocalStorage 环境作用域。
//   轮次入口用 runWithConversationScope(sessionId, fn) 包住整段运行，
//   期间所有 LLM 调用（chat-loop / harness 多轮 / 运行中压缩 / 子代理）里的
//   token-usage-store.recordUsage 都会自动落到该会话；记忆提炼、朋友圈、主动聊天、
//   通话等不在作用域内的调用不会被计入任何对话。
//
// 存储：<userData>/conversation-usage.json（防抖落盘，退出时 flush）。
import { AsyncLocalStorage } from "node:async_hooks";
import * as fs from "node:fs";
import * as path from "node:path";
import { app } from "electron";

const LOG = "[ConversationUsage]";
const SAVE_DEBOUNCE_MS = 800;
/** 最多保留多少个会话（按 updatedAt 保留最新） */
const MAX_SESSIONS = 300;
/** 同一会话的通知节流窗口 */
const NOTIFY_THROTTLE_MS = 400;

export interface ConversationUsageBucket {
  input: number;
  output: number;
  cachedInput: number;
  cacheCreation: number;
  requests: number;
  updatedAt: number;
}

export interface ConversationUsageSnapshot extends ConversationUsageBucket {
  sessionId: string;
  /** 输入 + 输出 */
  totalTokens: number;
  /** 缓存命中率（0~1）；没有任何缓存统计时为 null */
  cacheHitRate: number | null;
  hasCacheData: boolean;
}

interface ConversationUsageStore {
  schemaVersion: number;
  sessions: Record<string, ConversationUsageBucket>;
}

const DEFAULT_STORE: ConversationUsageStore = { schemaVersion: 1, sessions: {} };

const scope = new AsyncLocalStorage<{ sessionId: string }>();
let cache: ConversationUsageStore | null = null;
let saveTimer: NodeJS.Timeout | null = null;
let listening = false;
const listeners = new Set<(snapshot: ConversationUsageSnapshot) => void>();
const pendingNotify = new Map<string, NodeJS.Timeout>();

function filePath(): string {
  return path.join(app.getPath("userData"), "conversation-usage.json");
}

function emptyBucket(): ConversationUsageBucket {
  return { input: 0, output: 0, cachedInput: 0, cacheCreation: 0, requests: 0, updatedAt: 0 };
}

function normalizeBucket(value: unknown): ConversationUsageBucket {
  const source = (value ?? {}) as Partial<ConversationUsageBucket>;
  const safe = (n: unknown): number => (typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0);
  return {
    input: safe(source.input),
    output: safe(source.output),
    cachedInput: safe(source.cachedInput),
    cacheCreation: safe(source.cacheCreation),
    requests: safe(source.requests),
    updatedAt: safe(source.updatedAt),
  };
}

function loadFromDisk(): ConversationUsageStore {
  try {
    const raw = fs.readFileSync(filePath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<ConversationUsageStore>;
    const sessions: Record<string, ConversationUsageBucket> = {};
    for (const [sessionId, value] of Object.entries(parsed.sessions ?? {})) {
      if (!sessionId) continue;
      sessions[sessionId] = normalizeBucket(value);
    }
    return { schemaVersion: 1, sessions };
  } catch (err) {
    if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
      return { schemaVersion: 1, sessions: {} };
    }
    console.warn(LOG, "加载失败，重置为空:", err);
    return { schemaVersion: 1, sessions: {} };
  }
}

function ensureLoaded(): ConversationUsageStore {
  if (!cache) {
    cache = loadFromDisk();
    if (!listening) {
      listening = true;
      // app 退出前可能来不及触发防抖定时器，这里再挂一道兜底
      app.once?.("before-quit", () => flushConversationUsage());
    }
  }
  return cache;
}

function trimSessions(store: ConversationUsageStore): void {
  const entries = Object.entries(store.sessions);
  if (entries.length <= MAX_SESSIONS) return;
  entries.sort((left, right) => right[1].updatedAt - left[1].updatedAt);
  store.sessions = Object.fromEntries(entries.slice(0, MAX_SESSIONS));
}

function flushNow(): void {
  if (!cache) return;
  try {
    trimSessions(cache);
    const file = filePath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(cache, null, 2), "utf8");
    fs.renameSync(tmp, file);
  } catch (err) {
    console.warn(LOG, "落盘失败:", err);
  }
}

function scheduleFlush(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    flushNow();
  }, SAVE_DEBOUNCE_MS);
}

function emit(sessionId: string): void {
  if (listeners.size === 0) return;
  const existing = pendingNotify.get(sessionId);
  if (existing) return;
  pendingNotify.set(sessionId, setTimeout(() => {
    pendingNotify.delete(sessionId);
    const snapshot = getConversationUsage(sessionId);
    for (const listener of listeners) {
      try {
        listener(snapshot);
      } catch (err) {
        console.warn(LOG, "订阅者异常:", err);
      }
    }
  }, NOTIFY_THROTTLE_MS));
}

// ── 环境作用域 ────────────────────────────────────────────────

/**
 * 在「某个会话」的作用域内执行 fn。
 * 期间发生的所有 token 记账都会归到该 sessionId；返回值与 fn 一致。
 */
export function runWithConversationScope<T>(sessionId: string, fn: () => T): T {
  if (!sessionId) return fn();
  return scope.run({ sessionId }, fn);
}

/** 当前异步上下文所属的会话（不在作用域内返回 undefined）。 */
export function currentConversationSessionId(): string | undefined {
  return scope.getStore()?.sessionId;
}

// ── 记账与查询 ────────────────────────────────────────────────

/** 累加一次模型调用到某个会话。 */
export function recordConversationUsage(
  sessionId: string,
  input: number,
  output: number,
  requests = 1,
  cachedInput?: number,
  cacheCreation?: number,
): void {
  if (!sessionId) return;
  const store = ensureLoaded();
  const bucket = store.sessions[sessionId] ?? emptyBucket();
  const normalizedInput = Math.max(0, Math.round(input || 0));
  bucket.input += normalizedInput;
  bucket.output += Math.max(0, Math.round(output || 0));
  bucket.requests += Math.max(0, requests);
  if (typeof cachedInput === "number" && Number.isFinite(cachedInput)) {
    bucket.cachedInput += Math.max(0, Math.min(normalizedInput, Math.round(cachedInput)));
  }
  if (typeof cacheCreation === "number" && Number.isFinite(cacheCreation)) {
    bucket.cacheCreation += Math.max(0, Math.round(cacheCreation));
  }
  bucket.updatedAt = Date.now();
  store.sessions[sessionId] = bucket;
  scheduleFlush();
  emit(sessionId);
}

/** 累加一次「请求发生」（用于端点不返回 usage 时的请求计数）。 */
export function recordConversationRequest(sessionId: string, requests = 1): void {
  if (!sessionId) return;
  const store = ensureLoaded();
  const bucket = store.sessions[sessionId] ?? emptyBucket();
  bucket.requests += Math.max(0, requests);
  bucket.updatedAt = Date.now();
  store.sessions[sessionId] = bucket;
  scheduleFlush();
  emit(sessionId);
}

function toSnapshot(sessionId: string, bucket: ConversationUsageBucket): ConversationUsageSnapshot {
  const hasCacheData = bucket.cachedInput > 0 && bucket.input > 0;
  return {
    sessionId,
    ...bucket,
    totalTokens: bucket.input + bucket.output,
    cacheHitRate: hasCacheData ? bucket.cachedInput / bucket.input : null,
    hasCacheData,
  };
}

/** 读取某个会话的用量快照（不存在时返回全 0）。 */
export function getConversationUsage(sessionId: string): ConversationUsageSnapshot {
  const store = ensureLoaded();
  return toSnapshot(sessionId, store.sessions[sessionId] ?? emptyBucket());
}

/** 清空某个会话（不传则清空全部）。 */
export function clearConversationUsage(sessionId?: string): void {
  const store = ensureLoaded();
  if (sessionId) delete store.sessions[sessionId];
  else store.sessions = {};
  scheduleFlush();
}

/** 订阅某个会话的用量变化（已做节流）。返回取消订阅函数。 */
export function subscribeConversationUsage(
  listener: (snapshot: ConversationUsageSnapshot) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 立即落盘（应用退出时调用）。 */
export function flushConversationUsage(): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  flushNow();
}

/** 仅供测试：重置内存缓存。 */
export function __resetConversationUsageCacheForTest(): void {
  cache = null;
  for (const timer of pendingNotify.values()) clearTimeout(timer);
  pendingNotify.clear();
  listeners.clear();
}
