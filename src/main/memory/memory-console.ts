/**
 * Memory Console —— 「设置 → 记忆 → 记忆管理」控制台的主进程数据层（P3 §2.17 / §3.16）。
 *
 * > ⚠️ 文件名是 `memory-console.ts` 而不是文档里暗示的 `memory-manager.ts`，
 * > 因为 PMRS 的 `memory-manager.ts`（L0/L1 写入与域过滤）已经占用了那个名字。
 *
 * 三个视图，三种分组键：
 *
 * | 视图 | 分组键 | 数据来源 |
 * |---|---|---|
 * | 按人 | `personKey` | ① L2 的 `speakerIds` / `subjectIds`；② 存量兜底：`sourceConversationId` ∈ 私聊会话；③ 有私聊会话但 0 条记忆的人也列出来 |
 * | 按域 | `scope` | `memoryStore.getAllL2()` 按 `scope` 分组（含 `undefined` 的 legacy 组） |
 * | 按会话 | `sourceConversationId` | 同上；显示名从名册取，取不到则显示 sessionId |
 *
 * ## 「他的记忆 / 别人提到他」两组必须分开给（§2.3 的展示侧落地）
 *
 * `own`       = `speakerIds ∋ P` 或在他的私聊会话里 → **「彻底擦除」会删的就是这一组**
 * `mentioned` = 只有 `subjectIds ∋ P`、`speakerIds` 不含他 → **默认保留**。用户想手动删可以，
 *               但系统不替他做这个决定（那条记忆往往同时是**别人的经历**）。
 *
 * 删除一律走 `memoryStore.deleteL2Cascade`（唯一删除入口，§2.1）。
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { app } from "electron";
import { memoryStore } from "./memory-store";
import type { L2Memory } from "./memory-types";
import {
  type SessionRosterItem,
  buildPrivateSessions,
  buildSessionRoster,
  parsePersonKey,
} from "./person-erase-plan";
import { getChannelConversationBindingStore, type ExternalChannelChat } from "../channels/conversation-binding-store";
import { getZoneStore } from "../zones/zone-store";
import type { ZoneExternalMember } from "../zones/types";
import { listTranscriptFiles, transcriptFileBase } from "../channels/history-log";
import { deleteUserMemoryVectors } from "../rag/index";

export type MemoryManagerView = "people" | "zones" | "sessions";

/** 「无归属记忆」的合成分组键（P2 之前的存量没有 speakerIds/subjectIds）。 */
export const UNATTRIBUTED_KEY = "__unattributed__";
/** 「没有 scope 的 legacy 记忆」的合成分组键。 */
export const NO_SCOPE_KEY = "__no_scope__";

export interface MemoryManagerItem {
  key: string;
  label: string;
  sublabel?: string;
  total: number;
  /** 🗣 他的记忆（会被「彻底擦除」删掉）。 */
  own: number;
  /** 👥 别人提到他（默认保留）。 */
  mentioned: number;
  sessions: number;
  /** 是否可「彻底擦除」（仅按人视图、且 key 是合法 personKey）。 */
  erasable: boolean;
}

export interface MemoryManagerMemory {
  id: string;
  content: string;
  triggerText: string;
  createdAt: number;
  status: string;
  scope?: string;
  sourceConversationId: string;
  speakerIds?: string[];
  subjectIds?: string[];
  isSummary?: boolean;
  subEntryCount?: number;
  sourceMessageIds?: string[];
}

export interface MemoryManagerSessionRef {
  sessionId: string;
  label: string;
  count: number;
}

export interface MemoryManagerQueryMeta {
  total: number;
  own: number;
  mentioned: number;
  personKey?: string;
  sessions: MemoryManagerSessionRef[];
}

export interface MemoryManagerQueryResult {
  memories: MemoryManagerMemory[];
  meta: MemoryManagerQueryMeta;
}

export interface MemoryManagerDeleteResult {
  requested: number;
  removed: number;
  evidence: number;
  dmaeStates: number;
  conflictLogs: number;
  danglingRefsFixed: number;
  reflectionLogs: number;
  summariesRemoved: number;
  /**
   * 真正从向量库删掉的向量条数（P3 §5.2 第 2 步的验收点：该条 `ragId` 0 命中）。
   *
   * ⚠️ 这一项曾经缺失：`deleteL2Cascade` **有意不删向量**（它只管 store，先 store 后 vector，
   * §1.2），调用方必须拿 `removedRagIds` 去 `deleteUserMemoryVectors`。`erasePerson` /
   * `memory-compressor` / `obsidian-importer` 都接了这一步，**只有控制台删除忘了** ——
   * 结果是"记忆没了、向量还在"，语义召回仍能命中一条已不存在的记忆，
   * 要等到下次启动对账才被当孤儿回收（文档 §1.2 明写了这个窗口）。
   */
  vectors: number;
}

export interface MemoryTraceSourceResult {
  entries: Array<{
    role: string;
    content: string;
    at: string;
    speakerName?: string;
    speakerId?: string;
    file: string;
  }>;
  missing: boolean;
}

export interface MemoryConsoleDeps {
  memories?: readonly L2Memory[];
  externalChats?: readonly ExternalChannelChat[];
  zoneMembers?: readonly ZoneExternalMember[];
  userDataDir?: string;
  deleteCascade?: (ids: readonly string[]) => Promise<{
    requested: number;
    removed: L2Memory[];
    evidence: number;
    dmaeStates: number;
    conflictLogs: number;
    danglingRefsFixed: number;
    reflectionLogs: number;
    summaries: L2Memory[];
  }>;
  /**
   * 删向量；默认 `rag.deleteUserMemoryVectors`（与 `person-erasure` 同一入口）。
   * 注入位只为测试 —— 生产路径不该有第二个实现。
   */
  deleteVectors?: (ragIds: string[]) => number;
}

// ─────────────────────────────────────────────────────────────────────────────
// 名册与显示名
// ─────────────────────────────────────────────────────────────────────────────

interface ConsoleContext {
  memories: L2Memory[];
  roster: SessionRosterItem[];
  bySessionId: Map<string, SessionRosterItem>;
  /** speakerId → 昵称（从名册覆盖到的那些 transcript 文件里收集）。 */
  speakerNames: Map<string, string>;
  userDataDir: string;
}

function zoneMembersFromStore(): ZoneExternalMember[] {
  const members: ZoneExternalMember[] = [];
  try {
    for (const zone of getZoneStore().listZones()) {
      for (const member of zone.members) {
        if (member.kind === "external") members.push(member);
      }
    }
  } catch {
    /* 没有 zones.json */
  }
  return members;
}

/**
 * 从 transcript 里收集 `speakerId → 昵称`，**只扫名册覆盖到的会话**。
 *
 * 为什么要这一步：群成员的昵称不在 `externalChats`（那里只有会话级展示名），
 * 而「按人」列表要显示昵称。名册（外部会话观察 + 区块成员）天然把范围限在
 * 用户真正关心的那批会话里，不会去扫全盘 —— 这是唯一一次为显示名付出的读取代价。
 */
function collectSpeakerNames(roster: readonly SessionRosterItem[]): Map<string, string> {
  const names = new Map<string, string>();
  const known = new Map<string, string>();
  for (const item of roster) known.set(transcriptFileBase(item.sessionId), item.sessionId);
  for (const ref of listTranscriptFiles()) {
    const sessionId = known.get(ref.fileBase);
    if (!sessionId) continue;
    let buf: string;
    try {
      buf = fs.readFileSync(ref.file, "utf8");
    } catch {
      continue;
    }
    for (const line of buf.split("\n")) {
      if (line.length === 0) continue;
      let entry: { speakerId?: unknown; speakerName?: unknown };
      try {
        entry = JSON.parse(line) as { speakerId?: unknown; speakerName?: unknown };
      } catch {
        continue;
      }
      if (typeof entry.speakerId !== "string" || typeof entry.speakerName !== "string") continue;
      const name = entry.speakerName.trim();
      if (name) names.set(entry.speakerId, name);
    }
  }
  return names;
}

async function buildContext(deps: MemoryConsoleDeps): Promise<ConsoleContext> {
  const memories = deps.memories ? [...deps.memories] : await memoryStore.getAllL2();
  const externalChats = deps.externalChats
    ? [...deps.externalChats]
    : getChannelConversationBindingStore().list().externalChats;
  const zoneMembers = deps.zoneMembers ? [...deps.zoneMembers] : zoneMembersFromStore();
  const roster = buildSessionRoster({ externalChats, zoneMembers, memories });
  return {
    memories,
    roster,
    bySessionId: new Map(roster.map((item) => [item.sessionId, item])),
    speakerNames: collectSpeakerNames(roster),
    userDataDir: deps.userDataDir ?? app.getPath("userData"),
  };
}

function personKeyOf(channel: string, senderId: string): string {
  return `${channel}:${senderId}`;
}

/**
 * 名册里全部「私聊会话」的 sessionId。
 *
 * 用途只有一个：把**能被 R1 兜底定位**的记忆从「来源未知」分组里排除掉。
 * 否则同一批记忆会既出现在某人的「他的记忆」里、又出现在「来源未知」里，
 * 用户在控制台上会以为有两份。
 */
function privateSessionIds(context: ConsoleContext): Set<string> {
  const out = new Set<string>();
  for (const session of context.roster) {
    if (session.chatType === "private" && session.chatId) out.add(session.sessionId);
  }
  return out;
}

/** 「来源未知」的判据：既没有归属字段，也不在任何一个私聊会话里（后者能被 R1 定位）。 */
function isUnattributed(context: ConsoleContext, memory: L2Memory, privateSessions: ReadonlySet<string>): boolean {
  if ((memory.speakerIds?.length ?? 0) > 0) return false;
  if ((memory.subjectIds?.length ?? 0) > 0) return false;
  return !privateSessions.has(memory.sourceConversationId);
}

/** 某个 personKey 的私聊会话集合（R1 的展示侧，判定复用 `buildPrivateSessions`）。 */
function privateSessionsOf(context: ConsoleContext, personKey: string): Set<string> {
  return buildPrivateSessions({ personKey, memories: context.memories, sessions: context.roster });
}

function labelForPerson(context: ConsoleContext, personKey: string): { label: string; sublabel: string } {
  const parsed = parsePersonKey(personKey);
  if (!parsed) return { label: personKey, sublabel: "" };
  for (const session of context.roster) {
    if (session.channel !== parsed.channel) continue;
    if (session.chatType === "private" && session.chatId === parsed.senderId && session.senderName) {
      return { label: session.senderName, sublabel: parsed.senderId };
    }
  }
  const fromTranscript = context.speakerNames.get(parsed.senderId);
  return { label: fromTranscript ?? parsed.senderId, sublabel: parsed.senderId };
}

function scopeLabel(context: ConsoleContext, scope: string | undefined): string {
  if (!scope) return "来源未知（无记忆域）";
  if (scope.startsWith("solo:")) {
    const sessionId = scope.slice("solo:".length);
    const session = context.bySessionId.get(sessionId);
    return `独立会话 · ${session?.senderName ?? sessionId}`;
  }
  if (scope.startsWith("zone:")) {
    const zoneId = scope.slice("zone:".length);
    if (zoneId === "root") return "桌面（root 区块）";
    try {
      const zone = getZoneStore().getZone(zoneId);
      if (zone) return `区块 · ${zone.zoneName}`;
    } catch {
      /* ignore */
    }
    return `区块 · ${zoneId}`;
  }
  return scope;
}

function sessionLabel(context: ConsoleContext, sessionId: string): string {
  const session = context.bySessionId.get(sessionId);
  if (!session) return sessionId;
  const kind = session.chatType === "private" ? "私聊" : "群聊";
  return `${session.senderName ?? sessionId}（${kind}）`;
}

function toManagerMemory(memory: L2Memory): MemoryManagerMemory {
  return {
    id: memory.id,
    content: memory.content,
    triggerText: memory.triggerText,
    createdAt: memory.createdAt,
    status: memory.status,
    scope: memory.scope,
    sourceConversationId: memory.sourceConversationId,
    speakerIds: memory.speakerIds ? [...memory.speakerIds] : undefined,
    subjectIds: memory.subjectIds ? [...memory.subjectIds] : undefined,
    isSummary: memory.isSummary === true,
    subEntryCount: memory.subEntryIds?.length,
    sourceMessageIds: memory.sourceMessageIds ? [...memory.sourceMessageIds] : undefined,
  };
}

/** 一条记忆属于某人的「他的记忆」吗（R1 ∪ R2，与删除判据同源）。 */
function isOwnMemory(
  memory: L2Memory,
  personKey: string,
  privateSessions: ReadonlySet<string>,
): boolean {
  if (privateSessions.has(memory.sourceConversationId)) return true;
  return Array.isArray(memory.speakerIds) && memory.speakerIds.includes(personKey);
}

function isMentionedMemory(memory: L2Memory, personKey: string): boolean {
  if (Array.isArray(memory.speakerIds) && memory.speakerIds.includes(personKey)) return false;
  return Array.isArray(memory.subjectIds) && memory.subjectIds.includes(personKey);
}

// ─────────────────────────────────────────────────────────────────────────────
// 列表
// ─────────────────────────────────────────────────────────────────────────────

interface PersonGroup {
  key: string;
  own: L2Memory[];
  mentioned: L2Memory[];
  sessions: Set<string>;
}

function groupByPerson(context: ConsoleContext): PersonGroup[] {
  const groups = new Map<string, PersonGroup>();
  const ensure = (personKey: string): PersonGroup => {
    let group = groups.get(personKey);
    if (!group) {
      group = { key: personKey, own: [], mentioned: [], sessions: new Set() };
      groups.set(personKey, group);
    }
    return group;
  };

  // ③ 有私聊会话但 0 条记忆的人也列出来 —— 否则「重置一个只聊过几句的人」无从下手。
  for (const session of context.roster) {
    if (session.chatType !== "private" || !session.chatId) continue;
    ensure(personKeyOf(session.channel, session.chatId));
  }

  for (const memory of context.memories) {
    for (const personKey of memory.speakerIds ?? []) ensure(personKey).own.push(memory);
    for (const personKey of memory.subjectIds ?? []) {
      const group = ensure(personKey);
      if (isMentionedMemory(memory, personKey)) group.mentioned.push(memory);
    }
  }

  // 存量兜底：私聊会话里的记忆没有归属字段时，按"会话即人"推出来（§2.17 ②）
  for (const key of [...groups.keys()]) {
    const privateSessions = privateSessionsOf(context, key);
    if (privateSessions.size === 0) continue;
    const group = groups.get(key)!;
    for (const memory of context.memories) {
      if (!privateSessions.has(memory.sourceConversationId)) continue;
      if (group.own.includes(memory) || group.mentioned.includes(memory)) continue;
      group.own.push(memory);
    }
  }

  for (const group of groups.values()) {
    for (const memory of [...group.own, ...group.mentioned]) group.sessions.add(memory.sourceConversationId);
  }
  return [...groups.values()];
}

export async function listMemoryManager(
  view: MemoryManagerView,
  deps: MemoryConsoleDeps = {},
): Promise<{ items: MemoryManagerItem[] }> {
  const context = await buildContext(deps);

  if (view === "people") {
    const items: MemoryManagerItem[] = groupByPerson(context).map((group) => {
      const { label, sublabel } = labelForPerson(context, group.key);
      return {
        key: group.key,
        label,
        sublabel: sublabel || undefined,
        total: group.own.length + group.mentioned.length,
        own: group.own.length,
        mentioned: group.mentioned.length,
        sessions: group.sessions.size,
        erasable: parsePersonKey(group.key) !== null,
      };
    });

    const privateSessions = privateSessionIds(context);
    const unattributed = context.memories.filter((memory) => isUnattributed(context, memory, privateSessions));
    if (unattributed.length > 0) {
      items.push({
        key: UNATTRIBUTED_KEY,
        label: "来源未知（无归属记忆）",
        sublabel: "P2 之前的存量",
        total: unattributed.length,
        own: unattributed.length,
        mentioned: 0,
        sessions: new Set(unattributed.map((m) => m.sourceConversationId)).size,
        erasable: false,
      });
    }

    items.sort((a, b) => (b.total - a.total) || a.label.localeCompare(b.label, "zh-CN"));
    return { items };
  }

  if (view === "zones") {
    const groups = new Map<string, L2Memory[]>();
    for (const memory of context.memories) {
      const key = memory.scope ?? NO_SCOPE_KEY;
      const bucket = groups.get(key);
      if (bucket) bucket.push(memory);
      else groups.set(key, [memory]);
    }
    const items: MemoryManagerItem[] = [...groups.entries()].map(([key, memories]) => ({
      key,
      label: scopeLabel(context, key === NO_SCOPE_KEY ? undefined : key),
      sublabel: key === NO_SCOPE_KEY ? undefined : key,
      total: memories.length,
      // `own` / `mentioned` 是「按人」视图的概念；容器视图里 total 就是全部可删条数。
      own: memories.length,
      mentioned: 0,
      sessions: new Set(memories.map((m) => m.sourceConversationId)).size,
      erasable: false,
    }));
    items.sort((a, b) => (b.total - a.total) || a.label.localeCompare(b.label, "zh-CN"));
    return { items };
  }

  const groups = new Map<string, L2Memory[]>();
  for (const memory of context.memories) {
    const key = memory.sourceConversationId || UNATTRIBUTED_KEY;
    const bucket = groups.get(key);
    if (bucket) bucket.push(memory);
    else groups.set(key, [memory]);
  }
  const items: MemoryManagerItem[] = [...groups.entries()].map(([key, memories]) => ({
    key,
    label: key === UNATTRIBUTED_KEY ? "来源未知（无来源会话）" : sessionLabel(context, key),
    sublabel: key === UNATTRIBUTED_KEY ? undefined : key,
    total: memories.length,
    own: memories.length,
    mentioned: 0,
    sessions: key === UNATTRIBUTED_KEY ? 0 : 1,
    erasable: false,
  }));
  items.sort((a, b) => (b.total - a.total) || a.label.localeCompare(b.label, "zh-CN"));
  return { items };
}

// ─────────────────────────────────────────────────────────────────────────────
// 查询
// ─────────────────────────────────────────────────────────────────────────────

function toSessionRefs(context: ConsoleContext, memories: readonly L2Memory[]): MemoryManagerSessionRef[] {
  const counts = new Map<string, number>();
  for (const memory of memories) {
    const key = memory.sourceConversationId || UNATTRIBUTED_KEY;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([sessionId, count]) => ({
      sessionId,
      label: sessionId === UNATTRIBUTED_KEY ? "来源未知" : sessionLabel(context, sessionId),
      count,
    }))
    .sort((a, b) => b.count - a.count);
}

export async function queryMemoryManager(
  view: MemoryManagerView,
  key: string,
  deps: MemoryConsoleDeps = {},
): Promise<MemoryManagerQueryResult> {
  const context = await buildContext(deps);

  if (view === "people") {
    if (key === UNATTRIBUTED_KEY) {
      const privateSessions = privateSessionIds(context);
      const memories = context.memories.filter((memory) => isUnattributed(context, memory, privateSessions));
      return {
        memories: memories.map(toManagerMemory),
        meta: { total: memories.length, own: memories.length, mentioned: 0, sessions: toSessionRefs(context, memories) },
      };
    }
    const privateSessions = privateSessionsOf(context, key);
    const own = context.memories.filter((memory) => isOwnMemory(memory, key, privateSessions));
    const ownIds = new Set(own.map((memory) => memory.id));
    const mentioned = context.memories.filter((memory) => !ownIds.has(memory.id) && isMentionedMemory(memory, key));
    const all = [...own, ...mentioned];
    return {
      memories: all.map(toManagerMemory),
      meta: {
        total: all.length,
        own: own.length,
        mentioned: mentioned.length,
        personKey: key,
        sessions: toSessionRefs(context, all),
      },
    };
  }

  const memories = view === "zones"
    ? context.memories.filter((memory) => (memory.scope ?? NO_SCOPE_KEY) === key)
    : context.memories.filter((memory) => (memory.sourceConversationId || UNATTRIBUTED_KEY) === key);
  return {
    memories: memories.map(toManagerMemory),
    meta: {
      total: memories.length,
      own: memories.length,
      mentioned: 0,
      sessions: toSessionRefs(context, memories),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 删除（唯一入口：deleteL2Cascade）
// ─────────────────────────────────────────────────────────────────────────────

async function resolveContainerIds(
  context: ConsoleContext,
  payload: { view: MemoryManagerView; key: string },
): Promise<string[]> {
  if (payload.view === "people") {
    if (payload.key === UNATTRIBUTED_KEY) {
      const privateSessions = privateSessionIds(context);
      return context.memories
        .filter((memory) => isUnattributed(context, memory, privateSessions))
        .map((memory) => memory.id);
    }
    // D4：只删「他的记忆」这一组，**不碰「别人提到他」**（§2.2）
    const privateSessions = privateSessionsOf(context, payload.key);
    return context.memories
      .filter((memory) => isOwnMemory(memory, payload.key, privateSessions))
      .map((memory) => memory.id);
  }
  if (payload.view === "zones") {
    return context.memories
      .filter((memory) => (memory.scope ?? NO_SCOPE_KEY) === payload.key)
      .map((memory) => memory.id);
  }
  return context.memories
    .filter((memory) => (memory.sourceConversationId || UNATTRIBUTED_KEY) === payload.key)
    .map((memory) => memory.id);
}

export async function deleteMemoryManager(
  payload: { ids?: string[]; view?: MemoryManagerView; key?: string },
  deps: MemoryConsoleDeps = {},
): Promise<MemoryManagerDeleteResult> {
  let ids: readonly string[] = payload.ids ?? [];
  if (ids.length === 0 && payload.view && payload.key) {
    const context = await buildContext(deps);
    ids = await resolveContainerIds(context, { view: payload.view, key: payload.key });
  }
  if (ids.length === 0) {
    return {
      requested: 0, removed: 0, evidence: 0, dmaeStates: 0,
      conflictLogs: 0, danglingRefsFixed: 0, reflectionLogs: 0, summariesRemoved: 0,
      vectors: 0,
    };
  }
  const cascade = deps.deleteCascade ?? ((targets) => memoryStore.deleteL2Cascade([...targets]));
  const result = await cascade(ids);

  // ④ 向量：`deleteL2Cascade` **有意不删**（store 是对账的事实源，顺序必须"先 store 后 vector"，
  // §1.2），所以这一刀必须由调用方补 —— 取法与 `person-erasure.ts:849` 完全一致：
  // 从 `removed[].ragId` 里拿（`L2CascadeResult` 的契约就是这么写的）。
  // 漏了它 = "记忆没了、向量还在"：语义召回会命中一条已不存在的记忆，
  // 直到下次启动对账才回收（§1.2 明写了这个窗口）。
  const ragIds = result.removed
    .map((memory) => memory.ragId)
    .filter((ragId): ragId is string => typeof ragId === "string" && ragId.length > 0);
  let vectors = 0;
  if (ragIds.length > 0) {
    const deleteVectors = deps.deleteVectors ?? ((targets: string[]) => deleteUserMemoryVectors([...targets]));
    try {
      vectors = deleteVectors(ragIds);
    } catch (err) {
      // 删向量失败不致命：启动对账会把孤儿向量当 stale 回收（memory-rag-reconciliation）。
      // 但绝不吞掉 store 侧已完成的删除 —— 那是幂等的，重跑一次即可收敛。
      console.warn("[MemoryConsole] 向量删除失败（启动对账会回收孤儿向量）:", err);
    }
  }

  return {
    requested: ids.length,
    removed: result.removed.filter((memory) => !memory.isSummary).length,
    evidence: result.evidence,
    dmaeStates: result.dmaeStates,
    conflictLogs: result.conflictLogs,
    danglingRefsFixed: result.danglingRefsFixed,
    reflectionLogs: result.reflectionLogs,
    summariesRemoved: result.summaries.length,
    vectors,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 溯源：sourceMessageIds → transcript 原文（含前后各 2 行）
// ─────────────────────────────────────────────────────────────────────────────

export async function traceMemorySource(
  memoryId: string,
  deps: MemoryConsoleDeps = {},
): Promise<MemoryTraceSourceResult> {
  const context = await buildContext(deps);
  const memory = context.memories.find((item) => item.id === memoryId);
  const ids = new Set(memory?.sourceMessageIds ?? []);
  if (!memory || ids.size === 0) return { entries: [], missing: true };

  for (const ref of listTranscriptFiles()) {
    let buf: string;
    try {
      buf = fs.readFileSync(ref.file, "utf8");
    } catch {
      continue;
    }
    const lines = buf.split("\n").filter((line) => line.length > 0);
    for (let index = 0; index < lines.length; index += 1) {
      let parsed: { id?: unknown } | null = null;
      try {
        parsed = JSON.parse(lines[index]) as { id?: unknown };
      } catch {
        continue;
      }
      if (typeof parsed?.id !== "string" || !ids.has(parsed.id)) continue;
      const entries: MemoryTraceSourceResult["entries"] = [];
      const from = Math.max(0, index - 2);
      const to = Math.min(lines.length - 1, index + 2);
      for (let cursor = from; cursor <= to; cursor += 1) {
        try {
          const entry = JSON.parse(lines[cursor]) as {
            role?: unknown; content?: unknown; at?: unknown;
            speakerName?: unknown; speakerId?: unknown;
          };
          if (typeof entry.content !== "string") continue;
          entries.push({
            role: typeof entry.role === "string" ? entry.role : "user",
            content: entry.content,
            at: typeof entry.at === "string" ? entry.at : "",
            speakerName: typeof entry.speakerName === "string" ? entry.speakerName : undefined,
            speakerId: typeof entry.speakerId === "string" ? entry.speakerId : undefined,
            file: path.basename(ref.file),
          });
        } catch {
          /* 坏行跳过 */
        }
      }
      return { entries, missing: false };
    }
  }
  // 记忆还在、但原文已经不在任何 transcript 里（他的行被擦除过 / 归档已清）
  return { entries: [], missing: true };
}

/** 让调用点更直观：独立域的 scope 构造在 `zones/types.ts`。 */
