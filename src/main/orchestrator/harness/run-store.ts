import fs from "node:fs";
import path from "node:path";
import type { ChatMessage } from "../vendors/types";
import { INITIAL_HARNESS_CACHE_STATE, type AgentState, type HarnessCacheState, type SideEffectKind } from "./types";
import type { ToolOutputRef } from "./tool-output/tool-output-store";

const ROOT_DIR_NAME = "cyrene-runs";
const SESSIONS_DIR_NAME = "sessions";
const INDEX_FILE_NAME = "index.json";
const LEGACY_SCHEMA_VERSION = 1;
const SCHEMA_VERSION = 2;

export type HarnessRunStatus = "running" | "interrupted" | "completed" | "cancelled" | "failed";
export type PersistedToolCallStatus = "planned" | "started" | "committed" | "unknown" | "not_executed";

export interface HarnessRequestSnapshot {
  provider: string;
  model: string;
  contextWindowTokens: number;
  reasoning?: string;
  mode?: string;
  promptFingerprint: string;
  toolSchemaFingerprint: string;
  enabledToolIds?: string[];
  workspaceRoot?: string;
}

export interface PersistedToolCall {
  toolCallId: string;
  toolName: string;
  sideEffect: SideEffectKind;
  status: PersistedToolCallStatus;
  updatedAt: number;
}

interface HarnessRunMetadataBase {
  conversationId: string;
  runId: string;
  status: HarnessRunStatus;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

export interface HarnessRunMetadata extends HarnessRunMetadataBase {
  schemaVersion: typeof SCHEMA_VERSION;
}

export interface LegacyHarnessRunSession extends HarnessRunMetadataBase {
  schemaVersion: typeof LEGACY_SCHEMA_VERSION;
  messages: ChatMessage[];
  state: AgentState;
  toolOutputs: ToolOutputRef[];
  toolCalls: PersistedToolCall[];
  rounds: number;
  cache: HarnessCacheState;
  request: HarnessRequestSnapshot;
}

export type HarnessRunSession = HarnessRunMetadata | LegacyHarnessRunSession;

export interface CreateHarnessRunInput {
  conversationId: string;
  runId: string;
}

export interface HarnessRunCheckpoint {
  messages?: ChatMessage[];
  state?: AgentState;
  todoItems?: AgentState["todoItems"];
  toolOutputs?: ToolOutputRef[];
  rounds?: number;
  cache?: HarnessCacheState;
  request?: HarnessRequestSnapshot;
}

export interface HarnessRunStoreOptions {
  now?: () => number;
}

interface IndexRow {
  conversationId: string;
  runId: string;
  status: HarnessRunStatus;
  updatedAt: number;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function validRunId(value: string): boolean {
  return value.length > 0 && !value.includes("/") && !value.includes("\\") && value !== "." && value !== "..";
}

function isRunStatus(value: unknown): value is HarnessRunStatus {
  return value === "running" || value === "interrupted" || value === "completed" || value === "cancelled" || value === "failed";
}

function isCacheState(value: unknown): value is HarnessCacheState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<HarnessCacheState>;
  return typeof candidate.cacheEpoch === "number" && Number.isInteger(candidate.cacheEpoch) && candidate.cacheEpoch > 0
    && (candidate.epochReason === "run_start" || candidate.epochReason === "compaction"
      || candidate.epochReason === "recovery" || candidate.epochReason === "model_changed"
      || candidate.epochReason === "tool_catalog_changed" || candidate.epochReason === "prompt_version_changed");
}

function isSession(value: unknown): value is HarnessRunSession {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  const hasCommonMetadata = (candidate.schemaVersion === LEGACY_SCHEMA_VERSION || candidate.schemaVersion === SCHEMA_VERSION)
    && typeof candidate.conversationId === "string"
    && typeof candidate.runId === "string" && validRunId(candidate.runId)
    && isRunStatus(candidate.status)
    && typeof candidate.createdAt === "number" && Number.isFinite(candidate.createdAt)
    && typeof candidate.updatedAt === "number" && Number.isFinite(candidate.updatedAt);
  if (!hasCommonMetadata) return false;
  if (candidate.schemaVersion === SCHEMA_VERSION) return true;
  const state = candidate.state as Partial<AgentState> | undefined;
  return Array.isArray(candidate.messages)
    && !!state && Array.isArray(state.todoItems) && Array.isArray(state.uncertainEffects)
    && Array.isArray(candidate.toolOutputs) && Array.isArray(candidate.toolCalls)
    && typeof candidate.rounds === "number"
    && (candidate.cache === undefined || isCacheState(candidate.cache))
    && !!candidate.request && typeof candidate.request === "object";
}

/**
 * 主 Harness 的可恢复运行存储。使用既有 JSON + 原子 rename 方案，避免引入第二套数据库。
 */
export class HarnessRunStore {
  private readonly root: string;
  private readonly sessionsDir: string;
  private readonly indexPath: string;
  private readonly now: () => number;
  private index = new Map<string, IndexRow>();
  /** 问题 5 P0：写放大量度（实例生命周期累计；markTerminal 时输出一行日志）。 */
  private diskWrites = 0;
  private diskBytes = 0;

  constructor(userDataRoot: string, options: HarnessRunStoreOptions = {}) {
    this.root = path.join(userDataRoot, ROOT_DIR_NAME);
    this.sessionsDir = path.join(this.root, SESSIONS_DIR_NAME);
    this.indexPath = path.join(this.root, INDEX_FILE_NAME);
    this.now = options.now ?? Date.now;
    this.initialize();
  }

  create(input: CreateHarnessRunInput): HarnessRunSession {
    if (!input.conversationId || !validRunId(input.runId)) throw new Error("HARNESS_RUN_INVALID_ID");
    // canonical runId 在生产中唯一；但旧终态/中断记录不可阻碍一次新的同名测试或迁移运行。
    // 仅仍在执行的记录代表真实冲突，绝不覆盖。
    const existing = this.get(input.runId);
    if (existing?.status === "running") throw new Error("HARNESS_RUN_EXISTS");
    if (existing?.schemaVersion === LEGACY_SCHEMA_VERSION) throw new Error("HARNESS_RUN_LEGACY_READ_ONLY");
    const now = this.now();
    const session: HarnessRunMetadata = {
      schemaVersion: SCHEMA_VERSION,
      conversationId: input.conversationId,
      runId: input.runId,
      status: "running",
      createdAt: now,
      updatedAt: now,
    };
    this.write(session);
    this.appendEvent(session, "run_created");
    return clone(session);
  }

  get(runId: string): HarnessRunSession | null {
    const session = this.read(runId);
    if (!session) return null;
    const row = this.index.get(runId);
    if (session.schemaVersion === LEGACY_SCHEMA_VERSION && session.status === "running" && row?.status === "interrupted") {
      return clone({ ...session, status: "interrupted", updatedAt: row.updatedAt });
    }
    return clone(session);
  }

  /** Keep the old method name so stale callers fail visibly instead of writing full snapshots. */
  checkpoint(runId: string, _patch: HarnessRunCheckpoint): HarnessRunSession {
    if (!this.read(runId)) throw new Error("HARNESS_RUN_NOT_FOUND");
    throw new Error("HARNESS_RUN_CHECKPOINT_DISABLED");
  }

  /** Keep the old method name so stale callers fail visibly instead of rewriting session files. */
  recordTool(runId: string, _input: Omit<PersistedToolCall, "updatedAt">): HarnessRunSession {
    if (!this.read(runId)) throw new Error("HARNESS_RUN_NOT_FOUND");
    throw new Error("HARNESS_RUN_TOOL_LIFECYCLE_DISABLED");
  }

  recordCompaction(runId: string, input: { status: "started" | "committed"; messageCountBefore: number; messageCountAfter?: number }): void {
    const session = this.require(runId);
    this.appendEvent(session, `compaction_${input.status}`, {
      messageCountBefore: input.messageCountBefore,
      ...(input.messageCountAfter !== undefined ? { messageCountAfter: input.messageCountAfter } : {}),
    });
  }

  markTerminal(runId: string, status: Exclude<HarnessRunStatus, "running" | "interrupted">): HarnessRunSession {
    const session = this.require(runId);
    if (session.schemaVersion !== SCHEMA_VERSION) throw new Error("HARNESS_RUN_LEGACY_READ_ONLY");
    session.status = status;
    session.completedAt = this.now();
    session.updatedAt = session.completedAt;
    this.write(session);
    this.appendEvent(session, `run_${status}`);
    // 写入量度用于观察运行元数据和索引的实际写放大。
    console.log(`[HarnessRunStore] run=${runId} terminal=${status} diskWrites=${this.diskWrites} diskBytes=${this.diskBytes}`);
    return clone(session);
  }

  deleteConversation(conversationId: string): void {
    const rows = [...this.index.values()].filter((row) => row.conversationId === conversationId);
    for (const row of rows) {
      const file = this.sessionPath(row.runId);
      if (fs.existsSync(file)) fs.unlinkSync(file);
      const events = this.eventPath(row.runId);
      if (fs.existsSync(events)) fs.unlinkSync(events);
      this.index.delete(row.runId);
    }
    this.writeIndexNow();
  }

  /**
   * 崩溃对账的数据源：返回全部 status=="interrupted" 的 run session。
   * interrupted 只由 initialize() 在启动时把滞留的 running 翻转而来
   * （正常终态都走 markTerminal），因此该集合即「进程崩溃遗留」的穷尽集合。
   */
  listInterruptedRuns(conversationId?: string): HarnessRunSession[] {
    const sessions: HarnessRunSession[] = [];
    for (const [runId, row] of this.index) {
      if (row.status !== "interrupted") continue;
      if (conversationId && row.conversationId !== conversationId) continue;
      const session = this.read(runId);
      if (session) {
        sessions.push(session.schemaVersion === LEGACY_SCHEMA_VERSION && session.status === "running"
          ? { ...session, status: "interrupted", updatedAt: row.updatedAt }
          : session);
      }
    }
    // 稳定排序：避免并发初始化因遍历顺序不同产生不同的对账写入顺序
    return sessions.sort((left, right) => left.createdAt - right.createdAt);
  }

  private initialize(): void {
    fs.mkdirSync(this.sessionsDir, { recursive: true });
    this.readIndex();
    let changed = false;

    // The index is a lookup cache, not the only recovery source. Rebuild rows
    // from valid session metadata so a missing or truncated index cannot hide
    // runs that need crash reconciliation.
    for (const name of fs.readdirSync(this.sessionsDir)) {
      if (path.extname(name) !== ".json") continue;
      const runId = path.basename(name, ".json");
      if (!validRunId(runId)) continue;
      const session = this.read(runId);
      if (!session || session.runId !== runId) continue;
      const current = this.index.get(runId);
      if (!current || current.conversationId !== session.conversationId
        || current.status !== session.status || current.updatedAt !== session.updatedAt) {
        this.index.set(runId, {
          conversationId: session.conversationId,
          runId: session.runId,
          status: session.status,
          updatedAt: session.updatedAt,
        });
        changed = true;
      }
    }

    for (const row of [...this.index.values()]) {
      // 孤儿行：session 文件已不存在（崩溃/手动清理遗留），直接清行
      if (!fs.existsSync(this.sessionPath(row.runId))) {
        this.index.delete(row.runId);
        changed = true;
        continue;
      }
      const session = this.read(row.runId);
      // 文件存在但解析失败：不动行，留待下次启动或人工收敛
      if (!session) continue;
      if (session.status !== "running") {
        // 权威校正：index 行滞后于 session 文件（防抖/崩溃遗留）时以文件为准
        if (row.status !== session.status || row.updatedAt !== session.updatedAt) {
          this.index.set(row.runId, {
            conversationId: session.conversationId,
            runId: session.runId,
            status: session.status,
            updatedAt: session.updatedAt,
          });
          changed = true;
        }
        continue;
      }
      if (session.schemaVersion === LEGACY_SCHEMA_VERSION) {
        // Preserve the old heavy file byte-for-byte. The index is enough to
        // discover the interrupted run; its transcript facts are read-only.
        this.index.set(row.runId, {
          conversationId: session.conversationId,
          runId: session.runId,
          status: "interrupted",
          updatedAt: this.now(),
        });
        changed = true;
        continue;
      }
      session.status = "interrupted";
      session.updatedAt = this.now();
      this.write(session);
      this.appendEvent(session, "run_interrupted");
      changed = true;
    }
    if (changed) this.writeIndexNow();
  }

  private require(runId: string): HarnessRunSession {
    const session = this.read(runId);
    if (!session) throw new Error("HARNESS_RUN_NOT_FOUND");
    return session;
  }

  private read(runId: string): HarnessRunSession | null {
    if (!validRunId(runId)) return null;
    const file = this.sessionPath(runId);
    if (!fs.existsSync(file)) return null;
    try {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
      if (!isSession(parsed)) return null;
      if (parsed.schemaVersion === SCHEMA_VERSION) {
        return parsed;
      }
      return {
        ...parsed,
        cache: isCacheState(parsed.cache) ? parsed.cache : { ...INITIAL_HARNESS_CACHE_STATE },
      };
    } catch {
      return null;
    }
  }

  /** 新运行只写运行元数据；旧版 session 文件保持只读。 */
  private write(session: HarnessRunMetadata): void {
    if (session.schemaVersion !== SCHEMA_VERSION) throw new Error("HARNESS_RUN_LEGACY_READ_ONLY");
    const persisted = {
      schemaVersion: SCHEMA_VERSION,
      conversationId: session.conversationId,
      runId: session.runId,
      status: session.status,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      ...(session.completedAt !== undefined ? { completedAt: session.completedAt } : {}),
    };
    this.atomicWrite(this.sessionPath(session.runId), persisted);
    this.index.set(session.runId, {
      conversationId: session.conversationId,
      runId: session.runId,
      status: session.status,
      updatedAt: session.updatedAt,
    });
    this.writeIndexNow();
  }

  private readIndex(): void {
    if (!fs.existsSync(this.indexPath)) return;
    try {
      const parsed = JSON.parse(fs.readFileSync(this.indexPath, "utf8")) as unknown;
      if (!Array.isArray(parsed)) return;
      for (const row of parsed) {
        if (!row || typeof row !== "object") continue;
        const candidate = row as Partial<IndexRow>;
        if (typeof candidate.conversationId !== "string" || typeof candidate.runId !== "string"
          || !validRunId(candidate.runId) || !isRunStatus(candidate.status) || typeof candidate.updatedAt !== "number") continue;
        this.index.set(candidate.runId, candidate as IndexRow);
      }
    } catch {
      this.index.clear();
    }
  }

  /** Run metadata changes only at creation, terminal settlement, and crash reconciliation. */
  private writeIndexNow(): void {
    this.atomicWrite(this.indexPath, [...this.index.values()]);
  }

  private appendEvent(session: HarnessRunSession, type: string, data?: Record<string, unknown>): void {
    fs.appendFileSync(this.eventPath(session.runId), `${JSON.stringify({ at: session.updatedAt, type, ...data })}\n`, "utf8");
  }

  private sessionPath(runId: string): string {
    return path.join(this.sessionsDir, `${runId}.json`);
  }

  private eventPath(runId: string): string {
    return path.join(this.sessionsDir, `${runId}.events.jsonl`);
  }

  private atomicWrite(file: string, value: unknown): void {
    const temporary = `${file}.${process.pid}.tmp`;
    // 机器格式（单行 JSON）：去掉 pretty-print，体积约减半（问题 5 P0）
    const content = JSON.stringify(value);
    fs.writeFileSync(temporary, content, "utf8");
    fs.renameSync(temporary, file);
    this.diskWrites += 1;
    this.diskBytes += content.length;
  }
}

/** 同一 Electron 进程每个 userData 根只初始化一次，避免并行 Run 被误判为重启中断。 */
const sharedStores = new Map<string, HarnessRunStore>();

export function getHarnessRunStore(userDataRoot: string): HarnessRunStore {
  const key = path.resolve(userDataRoot);
  let store = sharedStores.get(key);
  if (!store) {
    store = new HarnessRunStore(key);
    sharedStores.set(key, store);
  }
  return store;
}
