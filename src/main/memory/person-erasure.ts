/**
 * Person Erasure —— 「擦除某个人」的编排器（P3 §2.13 / §2.14 / §3.3）。
 *
 * 一次擦除 = **预演 → 二次确认 → 执行 → 报告**。判据不在这里，在
 * `person-erase-plan.ts`（纯函数）；本文件只负责"把判据跑遍 12 类载体"。
 *
 * ## 执行顺序（§2.14，共 12 步）
 *
 * ```
 * ①  入队            enqueueLLMTask("MemoryPersonErase", …)   ← 与 judge 写入天然串行，零竞态
 * ②  重算 + 校验     H / privateSessions / speakingSessions / knownNames ↔ previewId 快照
 * ③  记忆级联        memoryStore.deleteL2Cascade(H)
 * ④  向量            deleteUserMemoryVectors(H 的 ragId + 被删总结的 ragId)
 * ⑤  去压缩          幸存子条目 → active + 重建向量 + markSynced（零 LLM）
 * ⑥  transcript      同步单遍：热层 + 归档
 * ⑦  审计+日志+备份   audit / log.jsonl / memory 备份 / chat-api.log
 * ⑧  外部会话观察     forget(私聊 sessionId)
 * ⑨  实体 + 关系      removeEntities(knownNames) / 关系日志三档
 * ⑩  缓存            forgetMemoryInjections / l2DmaeManager.loadStates() / forgetSessionIndex
 * ⑪  Obsidian        若已绑定 vault：syncToBoundVault()
 * ⑫  审计 + 报告      appendMemoryTrace(memory.personErase) → PersonEraseReport
 * ```
 *
 * ## 三个顺序上的硬约束
 *
 * - ⑥ 的**会话集合**在 ③ 之前算好，但**重写发生在 ③ 之后**：这样"他刚发的消息"
 *   不会因为扫描时机而漏掉（⑥ 内部会重新扫一遍全量文件，不局限于 S 集合的结果）。
 * - ⑩ 的 `l2DmaeManager.loadStates()` **必须在 ③ 之后**（它按 store 重建）。
 * - ⑨ 的关系日志存量指纹匹配**必须在 ⑥ 之后**：它要用 ⑥ 产出的「被删行正文集合 D」，
 *   而 D **只活在本次调用的局部变量里** —— 放模块级单例会被并发擦除互相污染（`previewId`
 *   表已经给出了这个模式）。
 *
 * ## 失败语义：**不假装原子**
 *
 * 每一步独立 try/catch，失败记入 `failed[{ step, target, error }]`，其余步骤继续；
 * 报告里给 `partial: boolean`，UI 提示「部分完成，可再次执行擦除以收敛」。
 * **擦除天然幂等**（重跑时命中集合只会变小），所以"重试"就是恢复策略 —— 这也是不做事务的理由。
 *
 * ## 🚫 群聊语料（自学习模块的数据前置层）不在这条流水线的任何一步里
 *
 * 它是**只增不减的长期资产**，且只写不读、零生产消费方 → 它不影响"昔涟认不认识他"。
 * 本文件**连它的路径字面量都不出现**（§0.4 约束 2），有架构守卫测试锁着。
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { app } from "electron";
import { appendMemoryTrace } from "./memory-trace";
import { memoryStore } from "./memory-store";
import type { L2Memory } from "./memory-types";
import {
  type SessionRosterItem,
  buildPrivateSessions,
  buildSessionRoster,
  computeEraseHits,
  selectChatHistoryVectorIds,
} from "./person-erase-plan";
import { enqueueLLMTask } from "../llm-queue";
import {
  addL2MemoryVector,
  deleteChatHistoryVectors,
  deleteUserMemoryVectors,
  getEntriesBySource,
} from "../rag/index";
import { entityGraph } from "./entity-graph";
import { RelationshipLogStore, buildUserTextPrefixes, matchesRemovedUserTextFingerprint } from "../relationship/relationship-log";
import { getChannelConversationBindingStore, type ExternalChannelChat } from "../channels/conversation-binding-store";
import { getZoneStore } from "../zones/zone-store";
import { soloScope, type ZoneExternalMember } from "../zones/types";
import { scanPersonTranscripts, erasePersonTranscripts, type TranscriptScanResult } from "../channels/transcript-erasure";
import { transcriptFileBase } from "../channels/history-log";
import { countPersonAudit, erasePersonAudit } from "../channels/audit-log";
import { countPersonLog, erasePersonLog } from "../channels/message-log";
import { listMemoryBackupTargets, eraseMemoryBackups, MEMORY_PRESERVED_FOR_UI } from "./memory-deletion";
import { eraseApiLog } from "../chat-api-utils";
import { forgetMemoryInjections } from "./recent-injected-memory";
import { l2DmaeManager } from "./l2-dmae-manager";
import { forgetSessionIndex } from "../channels/channel-context";
import { countRunsForConversations, eraseRunsForConversations, RUN_RESIDUE_DIRS } from "./run-erasure";
import { loadObsidianVaultConfig } from "./obsidian-vault-config";

/** 关系日志存量指纹匹配的前缀长度（与 `RelationshipLogStore.eraseByUserTextFingerprint` 默认值一致）。 */
const LEGACY_MATCH_PREFIX = 24;

// ─────────────────────────────────────────────────────────────────────────────
// 类型：预演计划与执行报告
// ─────────────────────────────────────────────────────────────────────────────

export type EraseResidue = {
  kind: "l0" | "l1" | "relationship" | "desktop" | "assistantText" | "devOrphan" | "runArtefacts" | "entityDerived";
  file: string;
  snippet: string;
};

/** 预演报告（§2.13）。**用户按它决定要不要按下确认**，所以每一项都必须能对到真实载体。 */
export interface PersonErasePlan {
  personKey: string;
  channel: string;
  senderId: string;
  knownNames: string[];
  sessions: Array<{
    sessionId: string;
    kind: "private" | "group" | "unknown";
    l2Count: number;
    hotLines: number;
    archiveLines: number;
    archiveMonths: number;
    /** 其中"她复述他"的 assistant 行数（D5；已计入 hotLines / archiveLines）。 */
    assistantLines: number;
  }>;
  l2: {
    /** 将被删除的条数。 */
    total: number;
    byRule: { private: number; speaker: number };
    ids: string[];
    /** K 类：别人提到他、**保留**。 */
    keptSubjectOnly: number;
    keptSamples: Array<{ content: string; speakerIds: string[] }>;
  };
  summaries: { decompress: string[]; remove: string[] };
  /** L2 的向量副本将被删掉的条数（`user_memory_*`）。 */
  vectors: number;
  /**
   * **对话的向量副本**将被删掉的条数（`chat_history_*`，D2）。
   *
   * 与他有关的 `chat_history` 条目有两类：他说的（`role=user` + 带他的 senderId）与她复述他的
   * （`role=assistant` + 含他的别名，且落在他的域里）。**别人转述他的（K 类）不在此列**。
   */
  chatHistoryVectors: number;
  evidence: number;
  dmaeStates: number;
  conflictLogs: number;
  reflectionLogs: number;
  entities: Array<{ name: string; scope?: string; relations: number }>;
  relationshipEntries: { byPersonKey: number; byScope: number; byTextFingerprint: number; unmatched: number; summaries: number };
  audit: { entries: number; files: number };
  channelLogLines: number;
  externalChats: number;
  /**
   * **agent 运行记录**（`cyrene-runs/sessions/*.json`）会被删掉的 run 数（**D4**）。
   *
   * 判据是按会话过滤：`run.conversationId ∈ 他发过言的会话`。这些文件里是**逐字对话正文**，
   * 所以它原来"既不在可擦清单也不在保留清单"是真正的边界缺口。
   */
  runs: number;
  memoryBackups: { files: number; bytes: number };
  apiLog: { exists: boolean; bytes: number };
  residues: EraseResidue[];
  /**
   * **有意不擦的载体**（`MEMORY_PRESERVED` 的原样列表）。
   *
   * ⚠️ 这一格是为了让文案**不再超出证据**（O2）：弹窗原来写「全部痕迹」，
   * 而设计上会保留群聊语料、桌面对话、运行评审/工具输出、访问控制配置与区块成员。
   * 把清单交给 UI，它就能把"会保留什么"如实写出来，而不是让用户自己猜。
   */
  preservedPaths: string[];
  warnings: string[];
  previewId: string;
}

/** 执行报告（§2.14 的收尾产物）。 */
export interface PersonEraseReport {
  personKey: string;
  partial: boolean;
  /** 预演之后他又说了新的话 → 中止，要求重新预演（**什么都没删**）。 */
  needsReconfirm: boolean;
  addedSincePreview: number;
  l2: { requested: number; removed: number; summariesRemoved: number; decompressed: number };
  transcript: { sessions: number; hotLines: number; archiveLines: number; assistantLines: number };
  /** 真正从向量库删掉的 `chat_history` 条数（D2）。 */
  chatHistoryVectors: number;
  audit: { entries: number; files: number };
  channelLog: { lines: number };
  externalChats: number;
  /** 真正删掉的 agent 运行记录数（D4）。 */
  runs: number;
  backups: { files: number; bytes: number };
  apiLog: { deleted: boolean; bytes: number };
  entities: { nodes: number; relations: number };
  relationship: { byPersonKey: number; byScope: number; byTextFingerprint: number; summaries: number };
  caches: { injections: number; sessionIndex: number; dmaeReloaded: boolean };
  obsidian: { synced: boolean };
  keptSubjectOnly: number;
  residues: EraseResidue[];
  failed: Array<{ step: string; target: string; error: string }>;
}

/** 关系日志存储需要的方法子集（便于注入桩）。 */
type RelationshipStoreLike = Pick<
  RelationshipLogStore,
  "readAll" | "eraseByPersonKey" | "eraseByScope" | "eraseByUserTextFingerprint" | "previewErasePerson"
>;

/** 实体图谱视图（便于注入桩）。 */
interface EntityGraphView {
  entities: Array<{ id: string; name: string; type: string; aliases: string[]; scope?: string; mentionCount?: number }>;
  relations: Array<{ sourceId: string; targetId: string }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// 依赖注入（测试用临时目录 / 桩）
// ─────────────────────────────────────────────────────────────────────────────

export interface PersonEraseDeps {
  /** 覆盖 userData 根目录。默认 `app.getPath("userData")`。 */
  userDataDir?: string;
  /** 入队点；默认全局 FIFO 串行队列 `enqueueLLMTask`（§4.6）。 */
  llmQueue?: <T>(label: string, task: () => Promise<T>) => Promise<T>;
  now?: () => number;
  /** 删向量；默认 `rag.deleteUserMemoryVectors`。 */
  deleteVectors?: (ragIds: string[]) => number;
  /**
   * 读 `chat_history` 向量条目（**D2**：擦除必须连"对话的向量副本"一起清）。
   * 默认 `rag.getEntriesBySource("chat_history")`。
   */
  getChatHistoryVectors?: () => Array<{ id: string; text: string; metadata?: Record<string, unknown> }>;
  /** 删 `chat_history` 向量；默认 `rag.deleteChatHistoryVectors`（**不能**复用 `deleteVectors`）。 */
  deleteChatVectors?: (ragIds: string[]) => number;
  /** 建向量（去压缩还原用）；默认 `rag.addL2MemoryVector`。 */
  addVector?: (text: string, l2Id: string, metadata?: Record<string, unknown>, scope?: string) => Promise<string>;
  /** 实体图谱读入口（预演用）；默认 `entityGraph.load`。 */
  loadEntityGraph?: () => EntityGraphView;
  /** 实体移除；默认 `entityGraph.removeEntities`。 */
  removeEntities?: (criteria: { names: readonly string[]; types?: readonly string[] }) => { nodes: Array<{ name: string }>; relations: number };
  /** 关系日志存储；默认 `new RelationshipLogStore()`。 */
  relationshipStore?: RelationshipStoreLike;
  /** 外部会话观察存储；默认 `getChannelConversationBindingStore()`。 */
  bindingStore?: {
    list: () => { externalChats: ExternalChannelChat[] };
    forget: (sessionIds: readonly string[]) => number;
  };
  /** 区块外部成员；默认把 `getZoneStore().listZones()` 展平。 */
  listZoneMembers?: () => ZoneExternalMember[];
  /** 已绑定 vault 的同步入口；默认动态 import `syncToBoundVault`。 */
  syncVault?: () => Promise<{ ok: boolean; fileCount?: number; skipped?: boolean }>;
  /** chat-api.log 销毁；默认 `chat-api-utils.eraseApiLog`。 */
  eraseApiLog?: () => { deleted: boolean; bytes: number };
  /** 审计计数（预演用）；默认 `audit-log.countPersonAudit`。 */
  countAudit?: (senderId: string) => { entries: number; files: number };
  /** 运行日志计数（预演用）；默认 `message-log.countPersonLog`。 */
  countLog?: (senderId: string) => number;
  /** 内存注入缓存失效；默认 `forgetMemoryInjections`。 */
  forgetInjections?: (l2Ids: readonly string[]) => number;
  /** 会话索引缓存失效；默认 `forgetSessionIndex`。 */
  forgetSessionIndexFn?: (senderId: string) => number;
  /** DMAE 引擎失效；默认 `l2DmaeManager.loadStates`。 */
  reloadDmae?: () => Promise<void>;
  /** vault 绑定状态；默认 `loadObsidianVaultConfig().vaultPath`。 */
  vaultPath?: () => string | undefined;
}

interface ResolvedDeps {
  userDataDir: string;
  llmQueue: <T>(label: string, task: () => Promise<T>) => Promise<T>;
  now: () => number;
  deleteVectors: (ragIds: string[]) => number;
  getChatHistoryVectors: () => Array<{ id: string; text: string; metadata?: Record<string, unknown> }>;
  deleteChatVectors: (ragIds: string[]) => number;
  addVector: (text: string, l2Id: string, metadata?: Record<string, unknown>, scope?: string) => Promise<string>;
  loadEntityGraph: () => EntityGraphView;
  removeEntities: (criteria: { names: readonly string[]; types?: readonly string[] }) => { nodes: Array<{ name: string }>; relations: number };
  relationshipStore: RelationshipStoreLike;
  bindingStore: { list: () => { externalChats: ExternalChannelChat[] }; forget: (sessionIds: readonly string[]) => number };
  listZoneMembers: () => ZoneExternalMember[];
  syncVault: () => Promise<{ ok: boolean; fileCount?: number; skipped?: boolean }>;
  eraseApiLog: () => { deleted: boolean; bytes: number };
  countAudit: (senderId: string) => { entries: number; files: number };
  countLog: (senderId: string) => number;
  forgetInjections: (l2Ids: readonly string[]) => number;
  forgetSessionIndexFn: (senderId: string) => number;
  reloadDmae: () => Promise<void>;
  vaultPath: () => string | undefined;
}

let defaultRelationshipStore: RelationshipLogStore | null = null;

function resolveDeps(deps: PersonEraseDeps = {}): ResolvedDeps {
  return {
    userDataDir: deps.userDataDir ?? app.getPath("userData"),
    llmQueue: deps.llmQueue ?? ((label, task) => enqueueLLMTask(label, task)),
    now: deps.now ?? (() => Date.now()),
    deleteVectors: deps.deleteVectors ?? ((ragIds) => deleteUserMemoryVectors([...ragIds])),
    getChatHistoryVectors: deps.getChatHistoryVectors
      ?? (() => getEntriesBySource("chat_history").map((e) => ({ id: e.id, text: e.text, metadata: e.metadata }))),
    deleteChatVectors: deps.deleteChatVectors ?? ((ragIds) => deleteChatHistoryVectors([...ragIds])),
    addVector: deps.addVector ?? ((text, l2Id, metadata, scope) => addL2MemoryVector(text, l2Id, metadata, scope)),
    loadEntityGraph: deps.loadEntityGraph ?? (() => entityGraph.load()),
    removeEntities: deps.removeEntities
      ?? ((criteria) => entityGraph.removeEntities({
        names: criteria.names,
        types: criteria.types as Parameters<typeof entityGraph.removeEntities>[0]["types"],
      })),
    relationshipStore: deps.relationshipStore ?? (defaultRelationshipStore ??= new RelationshipLogStore()),
    bindingStore: deps.bindingStore ?? getChannelConversationBindingStore(),
    listZoneMembers: deps.listZoneMembers ?? (() => {
      const members: ZoneExternalMember[] = [];
      for (const zone of getZoneStore().listZones()) {
        for (const member of zone.members) {
          if (member.kind === "external") members.push(member);
        }
      }
      return members;
    }),
    syncVault: deps.syncVault ?? (async () => {
      const { syncToBoundVault } = await import("./obsidian-exporter");
      const result = await syncToBoundVault();
      return { ok: result.ok, fileCount: result.fileCount, skipped: result.skipped };
    }),
    eraseApiLog: deps.eraseApiLog ?? eraseApiLog,
    countAudit: deps.countAudit ?? countPersonAudit,
    countLog: deps.countLog ?? countPersonLog,
    forgetInjections: deps.forgetInjections ?? forgetMemoryInjections,
    forgetSessionIndexFn: deps.forgetSessionIndexFn ?? forgetSessionIndex,
    reloadDmae: deps.reloadDmae ?? (() => l2DmaeManager.loadStates()),
    vaultPath: deps.vaultPath ?? (() => loadObsidianVaultConfig().vaultPath || undefined),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// previewId 表（§2.13）
// ─────────────────────────────────────────────────────────────────────────────

const PREVIEW_TTL_MS = 10 * 60 * 1000;

interface PreviewRecord {
  personKey: string;
  /** 预演时的命中 id 集合。**只存 id 不存正文** —— 否则预演本身就成了一份删除快照。 */
  ids: Set<string>;
  at: number;
}

const previewStore = new Map<string, PreviewRecord>();

/** 仅供测试：清空 previewId 表。 */
export function _resetErasePreviewStoreForTest(): void {
  previewStore.clear();
}

function prunePreviews(now: number): void {
  for (const [id, record] of previewStore) {
    if (now - record.at >= PREVIEW_TTL_MS) previewStore.delete(id);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 共用：构造擦除上下文（预演与执行**共用同一段构造逻辑** —— §2.13 一致性的前提）
// ─────────────────────────────────────────────────────────────────────────────

interface EraseContext {
  channel: string;
  senderId: string;
  memories: L2Memory[];
  roster: SessionRosterItem[];
  privateSessions: Set<string>;
  known: Map<string, string>;
  knownNames: string[];
  hits: L2Memory[];
  hitIds: Set<string>;
  byRule: { private: number; speaker: number };
  keptSubjectOnly: L2Memory[];
  summaries: { decompress: L2Memory[]; remove: L2Memory[] };
  speakingScopes: Set<string>;
  soloScopes: Set<string>;
  /** 他发过言的会话 id（transcript 扫描出的 ∪ 他的私聊）—— D4 按它过滤 agent 运行记录。 */
  speakingSessionIds: Set<string>;
  scan: ReturnType<typeof scanPersonTranscripts>;
  /**
   * 第二遍扫描（带上 `knownNames`）的结果：多出 `assistantLines` —— "她复述他"的行数（D5）。
   *
   * 为什么要两遍：`knownNames` 的三个来源之一正是第一遍的 `speakerNames`。
   * 两遍之间只有"名字集合"这一个输入不同，他的行数完全一致。
   */
  assistantScan: TranscriptScanResult | null;
  warnings: string[];
}

function safeZoneMembers(deps: ResolvedDeps): ZoneExternalMember[] {
  try {
    return deps.listZoneMembers();
  } catch {
    return [];
  }
}

function buildKnownNames(input: {
  channel: string;
  senderId: string;
  roster: readonly SessionRosterItem[];
  privateSessions: ReadonlySet<string>;
  externalChats: readonly ExternalChannelChat[];
  scanSpeakerNames: readonly string[];
}): string[] {
  const names = new Set<string>();
  const add = (value: string | undefined): void => {
    const trimmed = value?.trim();
    if (trimmed) names.add(trimmed);
  };
  // ① 私聊会话的展示名 = 他的昵称（`externalChats` / 区块成员）
  for (const session of input.roster) {
    if (input.privateSessions.has(session.sessionId)) add(session.senderName);
  }
  for (const chat of input.externalChats) {
    if (chat.channel === input.channel && chat.chatType === "private" && chat.chatId === input.senderId) {
      add(chat.senderName);
    }
  }
  // ② transcript 里他自己的行上的 `speakerName`（"群里大家怎么喊他"最准的一处）
  for (const name of input.scanSpeakerNames) add(name);
  return [...names];
}

async function buildEraseContext(
  personKey: string,
  deps: ResolvedDeps,
  throwOnBadKey: boolean,
): Promise<EraseContext | null> {
  const parsed = /^([^:]+):(.+)$/.exec(personKey);
  if (!parsed) {
    if (throwOnBadKey) throw new Error(`无法解析 personKey：${personKey}（应形如 <channel>:<senderId>）`);
    return null;
  }
  const channel = parsed[1];
  const senderId = parsed[2];

  const memories = await memoryStore.getAllL2();
  const externalChats = deps.bindingStore.list().externalChats;
  let roster = buildSessionRoster({ externalChats, zoneMembers: safeZoneMembers(deps), memories });

  const known = new Map<string, string>();
  for (const item of roster) known.set(transcriptFileBase(item.sessionId), item.sessionId);

  // ⚠️ 顺序：先算 `privateSessions`（它只依赖名册的 chatType/chatId，不依赖扫描结果），
  // 再扫描。私聊行没有 `speakerId`，扫描必须知道哪些会话是"整会话删"才能数对行数、
  // 取对"将被删掉的正文"（否则预演报告会严重低估，§4.3）。
  const privateSessions = buildPrivateSessions({ personKey, memories, sessions: roster });
  const scan = scanPersonTranscripts({ channel, senderId, known, privateSessions });

  // 把扫描结果并回名册：`matchedLines` 是 S 集合（speakingSessions）的来源，
  // 扫描发现的、名册里没有的会话也要补进来（否则报告会少列会话）。
  const byId = new Map(roster.map((item) => [item.sessionId, item]));
  for (const detail of scan.bySession) {
    const existing = byId.get(detail.sessionId);
    if (existing) {
      existing.matchedLines = detail.hotLines + detail.archiveLines;
      continue;
    }
    byId.set(detail.sessionId, {
      sessionId: detail.sessionId,
      channel,
      chatId: "",
      // 扫描侧只认 sessionId，拿不到 chatType；缺省 group 是安全侧（见 person-erase-plan）。
      chatType: "group",
      matchedLines: detail.hotLines + detail.archiveLines,
    });
  }
  roster = [...byId.values()];

  const computed = computeEraseHits({ personKey, memories, sessions: roster });
  const hitIds = new Set(computed.hits.map((memory) => memory.id));

  // 关系日志要跑的两个域集合：私聊/独立域（整域删）与"他发过言的域"（指纹匹配）。
  const soloScopes = new Set<string>();
  for (const sessionId of privateSessions) soloScopes.add(soloScope(sessionId));
  const speakingScopes = new Set<string>();
  for (const sessionId of scan.sessions) speakingScopes.add(soloScope(sessionId));
  for (const memory of computed.hits) {
    if (memory.scope) speakingScopes.add(memory.scope);
  }

  const knownNames = buildKnownNames({
    channel,
    senderId,
    roster,
    privateSessions,
    externalChats,
    scanSpeakerNames: scan.speakerNames,
  });

  const warnings: string[] = [];
  if (privateSessions.size === 0) {
    warnings.push(
      "没有识别出他的私聊会话（可能未被外部会话观察记录覆盖，或该渠道的私聊 chatId 与 senderId 不同，例如飞书）。"
      + "「他说的」仍会被删除，但私聊会话内没有归属字段的旧记忆无法通过规则 R1 定位。",
    );
  }
  if (scan.unknownFiles.length > 0) {
    warnings.push(`有 ${scan.unknownFiles.length} 个 transcript 文件无法识别来源（文件名的 sessionId 不可无损还原），已跳过。`);
  }
  if (knownNames.length === 0) {
    warnings.push("没有取到他的任何昵称，实体图谱与 L0/L1 的疑似残留清单会是空的。");
  }

  // 第二遍：把 `knownNames` 喂回去，数出"她复述他"的 assistant 行（D5）。
  // 判据在 `transcript-erasure.assistantMentionsPerson`（全仓唯一一处文本级删除判据），
  // 执行侧用同一个函数 + 同一个"只在他说话过的会话里"限制，所以预演与执行同源。
  const assistantScan = knownNames.length > 0
    ? scanPersonTranscripts({ channel, senderId, known, privateSessions, knownNames })
    : null;

  return {
    channel,
    senderId,
    memories,
    roster,
    privateSessions,
    known,
    knownNames,
    hits: computed.hits,
    hitIds,
    byRule: computed.byRule,
    keptSubjectOnly: computed.keptSubjectOnly,
    summaries: computed.summaries,
    speakingScopes,
    soloScopes,
    speakingSessionIds: collectSpeakingSessionIds({
      scanSessions: scan.sessions,
      privateSessions,
      hitSessions: computed.hits.map((memory) => memory.sourceConversationId),
      soloScopes,
      // ⚠️ 这两个来源只是"补全入参集"，**读不到就当没有** —— 绝不能让 RAG 或关系日志
      // 的暂时不可用把整次擦除（乃至预演）打挂（它们各自的步骤有自己的 try/catch）。
      chatHistoryVectors: safeChatHistoryVectors(deps),
      senderId,
      personKey: `${channel}:${senderId}`,
      relationshipEntries: await safeRelationshipEntries(deps),
    }),
    scan,
    assistantScan,
    warnings,
  };
}

/** 读 chat_history 向量：读不到就当空（补全入参集不能成为新的失败点）。 */
function safeChatHistoryVectors(
  deps: ResolvedDeps,
): Array<{ text: string; metadata?: Record<string, unknown> }> {
  try {
    return deps.getChatHistoryVectors();
  } catch {
    return [];
  }
}

/** 读关系日志条目：读不到就当空（同上）。 */
async function safeRelationshipEntries(
  deps: ResolvedDeps,
): Promise<Array<{ personKey?: string; scope?: string }>> {
  try {
    return (await deps.relationshipStore.readAll()).entries;
  } catch {
    return [];
  }
}

/**
 * 「他发过言的会话」全集（**D4** 按会话过滤 run 记录时的输入）。
 *
 * ⚠️ **不能只看 transcript 扫描结果**：他的行可能已经被**上一次擦除**抹掉，
 * 而 run 记录那时还在 —— 只看 scan 会整段漏掉（实测：只看 scan 时 `runs` 算出 19、
 * 而这类会话在 index 里实际有 93 个 run）。
 *
 * 所以凡"能结构性指认他在此说过话"的载体都算上：
 *   ① transcript 扫描出的会话（他的行还在时的主来源）；
 *   ② 他的私聊会话（R1）；
 *   ③ 他的 L2 记忆的 `sourceConversationId`（记忆比 transcript 活得久）；
 *   ④ `solo:<sessionId>` 形态的域（私聊/独立域）；
 *   ⑤ `chat_history` 向量条目里带他 senderId 的那些，其 `metadata.sessionId`；
 *   ⑥ 关系日志里 `personKey` 是他的那些条目的域。
 *
 * 仍然**按 `conversationId` 过滤**（不做正文匹配），只是把入参集补全。
 */
function collectSpeakingSessionIds(input: {
  scanSessions: readonly string[];
  privateSessions: ReadonlySet<string>;
  hitSessions: ReadonlyArray<string | undefined>;
  soloScopes: ReadonlySet<string>;
  chatHistoryVectors: ReadonlyArray<{ text: string; metadata?: Record<string, unknown> }>;
  senderId: string;
  personKey: string;
  relationshipEntries: ReadonlyArray<{ personKey?: string; scope?: string }>;
}): Set<string> {
  const out = new Set<string>();
  const addIfSession = (value: unknown): void => {
    if (typeof value === "string" && value.startsWith("channel:")) out.add(value);
  };
  const fromSoloScope = (scope: unknown): void => {
    if (typeof scope !== "string" || !scope.startsWith("solo:")) return;
    addIfSession(scope.slice("solo:".length));
  };

  for (const sessionId of input.scanSessions) addIfSession(sessionId);
  for (const sessionId of input.privateSessions) addIfSession(sessionId);
  for (const sessionId of input.hitSessions) addIfSession(sessionId);
  for (const scope of input.soloScopes) fromSoloScope(scope);
  for (const entry of input.chatHistoryVectors) {
    if (input.senderId.length === 0 || !String(entry.text ?? "").includes(input.senderId)) continue;
    addIfSession(entry.metadata?.sessionId);
  }
  for (const entry of input.relationshipEntries) {
    if (entry.personKey !== input.personKey) continue;
    fromSoloScope(entry.scope);
  }
  return out;
}

function snippetsOf(memories: readonly L2Memory[], limit = 5): Array<{ content: string; speakerIds: string[] }> {
  return memories.slice(0, limit).map((memory) => ({
    content: memory.content.length > 160 ? `${memory.content.slice(0, 160)}…` : memory.content,
    speakerIds: [...(memory.speakerIds ?? [])],
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// 只读探针与疑似残留清单（§2.12）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 预演里的「记忆备份」体积。
 *
 * ⚠️ 必须**递归**统计：`listMemoryBackupTargets()` 返回的是"`memory.backup.*.json` 文件
 * + `memory-reconcile-backups/` **目录本身**"，只 `statSync` 目录会得到 0 字节，
 * 而用户要看的正是"我会失去多少"（§2.13：整份销毁必须在预演里显式列出大小）。
 */
function probeBackups(userDataDir: string): { files: number; bytes: number } {
  let files = 0;
  let bytes = 0;
  const countNode = (target: string): void => {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(target);
    } catch {
      return;
    }
    if (stat.isDirectory()) {
      let entries: string[] = [];
      try {
        entries = fs.readdirSync(target);
      } catch {
        return;
      }
      for (const entry of entries) countNode(path.join(target, entry));
      return;
    }
    files += 1;
    bytes += stat.size;
  };
  for (const target of safeListBackups(userDataDir)) countNode(target);
  return { files, bytes };
}

function safeListBackups(userDataDir: string): string[] {
  try {
    return listMemoryBackupTargets(userDataDir);
  } catch {
    return [];
  }
}

function probeApiLog(userDataDir: string): { exists: boolean; bytes: number } {
  try {
    const target = path.join(userDataDir, "chat-api.log");
    if (!fs.existsSync(target)) return { exists: false, bytes: 0 };
    return { exists: true, bytes: fs.statSync(target).size };
  } catch {
    return { exists: false, bytes: 0 };
  }
}

/**
 * 「疑似残留清单」（§2.12）：**本地名字子串匹配，不调 LLM**。
 *
 * 覆盖：L0/L1 的非结构化文本提及、关系日志里**无法**用指纹定位的存量条目、
 * 桌面对话里 P0 之前的镜像残留（`channelSource` 没有 senderId，只能按昵称）、
 * 开发期孤儿文件。**只列出，不自动修改** —— L0/L1 是用户可编辑的结构化文本，
 * 误改的代价高于漏改。
 */
async function collectResidues(context: EraseContext, deps: ResolvedDeps): Promise<EraseResidue[]> {
  const residues: EraseResidue[] = [];
  const names = context.knownNames;
  if (names.length === 0) return residues;
  const snippetOf = (text: string, at: number, len = 80): string => {
    const start = Math.max(0, at - 20);
    return text.slice(start, start + len);
  };
  const pushIfName = (kind: EraseResidue["kind"], file: string, value: unknown): void => {
    if (typeof value !== "string" || value.length === 0) return;
    for (const name of names) {
      const at = value.indexOf(name);
      if (at < 0) continue;
      residues.push({ kind, file, snippet: snippetOf(value, at) });
      return;
    }
  };

  // ① L0 / L1：结构化文本，没有归属字段，删不掉（总览 §4.5）
  try {
    const l0 = await memoryStore.getL0();
    for (const [field, value] of Object.entries(l0)) {
      if (field === "updatedAt" || field === "isPinned") continue;
      pushIfName("l0", `memory.json#l0.${field}`, value);
    }
    const l1 = await memoryStore.getL1();
    for (const [field, value] of Object.entries(l1)) {
      if (field === "generatedAt" || field === "roundCount") continue;
      pushIfName("l1", `memory.json#l1.${field}`, value);
    }
  } catch {
    /* ignore */
  }

  // ② 关系日志里"无法定位"的存量条目（指纹匹配不上的那些）
  try {
    const log = await deps.relationshipStore.readAll();
    const prefixes = buildUserTextPrefixes(context.scan.removedUserTexts, LEGACY_MATCH_PREFIX);
    for (const entry of log.entries) {
      if (entry.personKey === personKeyOf(context) || entry.personKey) continue;
      if (!entry.scope || !context.speakingScopes.has(entry.scope)) continue;
      if (matchesRemovedUserTextFingerprint(entry, context.speakingScopes, prefixes, LEGACY_MATCH_PREFIX)) continue;
      pushIfName("relationship", "relationship-log.json", entry.userText);
    }
  } catch {
    /* ignore */
  }

  // ③ 桌面对话里的镜像残留（P0 之前的遗留副本；`channelSource` 只有 senderName，没有 senderId）
  try {
    const sessionsDir = path.join(deps.userDataDir, "cyrene-chats", "sessions");
    let reported = 0;
    for (const name of fs.readdirSync(sessionsDir)) {
      if (reported >= 50) break;
      if (!name.endsWith(".json")) continue;
      const file = path.join(sessionsDir, name);
      let parsed: unknown;
      try {
        parsed = JSON.parse(fs.readFileSync(file, "utf8"));
      } catch {
        continue;
      }
      const messages = (parsed as { messages?: unknown }).messages;
      if (!Array.isArray(messages)) continue;
      for (const message of messages) {
        const senderName = (message as { channelSource?: { senderName?: unknown } })?.channelSource?.senderName;
        if (typeof senderName !== "string") continue;
        if (!names.includes(senderName.trim())) continue;
        residues.push({ kind: "desktop", file: `cyrene-chats/sessions/${name}`, snippet: `channelSource.senderName=${senderName}` });
        reported += 1;
        break;
      }
    }
  } catch {
    /* 没有桌面对话目录 */
  }

  // ④ 开发期孤儿文件（源码零引用，不属于产品产物 → 只报告，不自动删）
  try {
    const channelsDir = path.join(deps.userDataDir, "channels");
    for (const name of fs.readdirSync(channelsDir)) {
      const isOrphan = name.endsWith(".p0-backup") || name === "tool-audit.jsonl";
      if (!isOrphan) continue;
      const file = path.join(channelsDir, name);
      let text = "";
      try {
        text = fs.readFileSync(file, "utf8");
      } catch {
        continue;
      }
      if (!text.includes(context.senderId) && !names.some((n) => text.includes(n))) continue;
      residues.push({ kind: "devOrphan", file: `channels/${name}`, snippet: snippetOf(text, Math.max(0, text.indexOf(context.senderId))) });
    }
  } catch {
    /* 没有 channels 目录 */
  }

  // ⑤ 运行产物（D4）：`cyrene-runs/reviews`、`tool-results` 与**按会话过滤后剩下的 run**
  //    都**不自动删** —— 前两者是运行评审与工具输出（按内容删会误伤无关文件），
  //    后者是"判据覆盖不到"的那部分。但"里面有他的正文"这件事必须让用户看得见，
  //    所以统一进疑似残留清单（上限 50 条）。
  try {
    let reported = 0;
    const limit = 50;
    const scanNode = (target: string): void => {
      if (reported >= limit) return;
      let entries: fs.Dirent[] = [];
      try {
        entries = fs.readdirSync(target, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (reported >= limit) return;
        const full = path.join(target, entry.name);
        if (entry.isDirectory()) {
          scanNode(full);
          continue;
        }
        let text = "";
        try {
          text = fs.readFileSync(full, "utf8");
        } catch {
          continue;
        }
        const idAt = context.senderId ? text.indexOf(context.senderId) : -1;
        const nameAt = names.map((name) => text.indexOf(name)).filter((at) => at >= 0).sort((a, b) => a - b)[0] ?? -1;
        if (idAt < 0 && nameAt < 0) continue;
        residues.push({
          kind: "runArtefacts",
          file: full.slice(deps.userDataDir.length + 1).split(path.sep).join("/"),
          snippet: snippetOf(text, idAt >= 0 ? idAt : nameAt),
        });
        reported += 1;
      }
    };
    for (const rel of RUN_RESIDUE_DIRS) scanNode(path.join(deps.userDataDir, rel));
  } catch {
    /* 没有运行产物目录 */
  }

  // ⑥ 她的复述/回复行里**残留下来**的那些（O4：旧版本擦除留下的孤儿）。
  //
  //    新代码会把他说话过的会话里"提到他"或"紧接着他"的 assistant 行一起删，
  //    但**历史遗留**是删不掉的：那些回复的 user 行早已被旧代码删掉，配对信息不存在了。
  //    它们每轮都会进上下文，所以必须**看得见** —— 这正是 `assistantText` 这一档的用处
  //    （类型里早就声明了，此前没有任何实现）。
  try {
    let reported = 0;
    const limit = 50;
    for (const sessionId of context.speakingSessionIds) {
      if (reported >= limit) break;
      const fileBase = transcriptFileBase(sessionId);
      const candidates = [
        path.join(deps.userDataDir, "channels", "history", `${fileBase}.jsonl`),
        ...safeListArchiveFiles(path.join(deps.userDataDir, "channels", "archive", fileBase)),
      ];
      for (const file of candidates) {
        if (reported >= limit) break;
        let text = "";
        try {
          text = fs.readFileSync(file, "utf8");
        } catch {
          continue;
        }
        const entries: Array<{ role?: string; content?: string; speakerId?: string }> = [];
        for (const line of text.split("\n")) {
          if (line.length === 0) continue;
          try {
            entries.push(JSON.parse(line) as { role?: string; content?: string; speakerId?: string });
          } catch {
            /* 坏行不参与 */
          }
        }
        // 与执行侧同一判据：他在这个文件里说过话时，这些行**会被删掉**，不算残留
        const heSpoke = entries.some((entry) => entry.speakerId === context.senderId);
        let previous: { speakerId?: string } | null = null;
        for (const entry of entries) {
          if (reported >= limit) break;
          const content = typeof entry.content === "string" ? entry.content : "";
          const at = names.map((name) => content.indexOf(name)).filter((index) => index >= 0).sort((a, b) => a - b)[0];
          const willBeDeleted = heSpoke && entry.role === "assistant"
            && (at !== undefined || previous?.speakerId === context.senderId);
          if (!willBeDeleted && entry.role === "assistant" && at !== undefined) {
            residues.push({
              kind: "assistantText",
              file: file.slice(deps.userDataDir.length + 1).split(path.sep).join("/"),
              snippet: snippetOf(content, at),
            });
            reported += 1;
          }
          previous = entry;
        }
      }
    }
  } catch {
    /* 读不到 transcript 就不列 */
  }

  // ⑦ 实体图里**由他的记忆派生**的非人节点（O3："杭州 / 成都"这类地点）。
  //    §2.9 的删除判据只匹配 `type === "person"`，所以这些节点结构上删不掉 ——
  //    但它们的 mentionCount 来自他的那些记忆，留着等于留了个"他去过哪"的索引。
  //    与 L0/L1 同一处置：**只列不改**（误删地点会连累别人的提及）。
  try {
    const graph = deps.loadEntityGraph();
    let reported = 0;
    const limit = 50;
    for (const entity of graph.entities) {
      if (reported >= limit) break;
      if (entity.type === "person") continue;
      if (names.includes(entity.name)) continue;
      for (const memory of context.hits) {
        if (!String(memory.content ?? "").includes(entity.name)) continue;
        residues.push({
          kind: "entityDerived",
          file: "entity-graph.json",
          snippet: `「${entity.name}」（${entity.type}，提及 ${entity.mentionCount ?? "?"} 次）出现在他的记忆里：${String(memory.content).slice(0, 60)}`,
        });
        reported += 1;
        break;
      }
    }
  } catch {
    /* 实体图读不到就不列 */
  }

  return residues;
}

/** 列出归档目录下的 `<月>.jsonl`（读不到就当空）。 */
function safeListArchiveFiles(dir: string): string[] {
  try {
    return fs.readdirSync(dir)
      .filter((name) => name.endsWith(".jsonl"))
      .map((name) => path.join(dir, name));
  } catch {
    return [];
  }
}

function personKeyOf(context: EraseContext): string {
  return `${context.channel}:${context.senderId}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 预演
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 预演：只读，不写任何文件（只在内存里生成一个 `previewId`）。
 *
 * `personKey` 解析不出来时**抛错** —— UI 侧要能区分"预演失败"与"没有可删的东西"，
 * 前者绝不能进入确认流程（§2.13）。
 */
export async function previewPersonErase(personKey: string, deps: PersonEraseDeps = {}): Promise<PersonErasePlan> {
  const resolved = resolveDeps(deps);
  const context = await buildEraseContext(personKey, resolved, true);
  if (!context) throw new Error(`无法解析 personKey：${personKey}`);
  const now = resolved.now();
  prunePreviews(now);

  // ③ 的预演：与 `deleteL2Cascade` 共用 `planL2Cascade`，数字永远同源。
  const cascadeIds = [
    ...context.hitIds,
    ...context.summaries.decompress.map((m) => m.id),
    ...context.summaries.remove.map((m) => m.id),
  ];
  const cascade = await memoryStore.previewL2Cascade(cascadeIds);

  // 关系日志五格（§2.10），全部只读：**判据在 store 内部**（`previewErasePerson`），
  // 与三个 `eraseBy*` 共用同一套过滤与孤儿摘要回收逻辑 —— 预演与执行不会再漂移（D6）。
  //   byPersonKey —— 新数据，按 personKey 删
  //   byScope     —— 存量 `solo:<他的私聊会话>` 整域
  //   byTextFingerprint / unmatched —— 存量群域，靠"被删行正文"的前缀指纹
  //   summaries   —— 条目删光后变成孤儿的日摘要（execution 报告里一直有，预演原来算不出来）
  const personKeyValue = personKeyOf(context);
  const relationshipPreview = await resolved.relationshipStore.previewErasePerson({
    personKey: personKeyValue,
    soloScopes: [...context.soloScopes],
    fingerprintScopes: [...context.speakingScopes],
    removedUserTexts: context.scan.removedUserTexts,
    prefixLength: LEGACY_MATCH_PREFIX,
  });
  const { byPersonKey, byScope, byTextFingerprint, unmatched } = relationshipPreview;

  // 实体节点：按名精确匹配候选（同名误伤由用户在预演里兜底，§2.9）
  const entityData = resolved.loadEntityGraph();
  const knownNameSet = new Set(context.knownNames);
  const entities = entityData.entities
    .filter((entity) => entity.type === "person"
      && (knownNameSet.has(entity.name) || entity.aliases.some((alias) => knownNameSet.has(alias))))
    .map((entity) => ({
      name: entity.name,
      scope: entity.scope,
      relations: entityData.relations.filter((r) => r.sourceId === entity.id || r.targetId === entity.id).length,
    }));

  const residues = await collectResidues(context, resolved);

  const previewId = `erase_${now}_${Math.random().toString(36).slice(2, 10)}`;
  previewStore.set(previewId, { personKey: personKeyValue, ids: new Set(context.hitIds), at: now });

  const l2CountBySession = new Map<string, number>();
  for (const memory of context.hits) {
    const key = memory.sourceConversationId ?? "";
    l2CountBySession.set(key, (l2CountBySession.get(key) ?? 0) + 1);
  }
  const scanBySession = new Map(context.scan.bySession.map((item) => [item.sessionId, item]));
  const assistantBySession = new Map(
    (context.assistantScan?.bySession ?? []).map((item) => [item.sessionId, item.assistantLines]),
  );
  const sessionIds = new Set<string>([
    ...context.roster.map((item) => item.sessionId).filter((id) => l2CountBySession.has(id) || scanBySession.has(id)),
    ...context.privateSessions,
  ]);
  const sessions = [...sessionIds].sort().map((sessionId) => {
    const detail = scanBySession.get(sessionId);
    const rosterItem = context.roster.find((item) => item.sessionId === sessionId);
    return {
      sessionId,
      kind: context.privateSessions.has(sessionId)
        ? ("private" as const)
        : rosterItem?.chatType === "group"
          ? ("group" as const)
          : ("unknown" as const),
      l2Count: l2CountBySession.get(sessionId) ?? 0,
      hotLines: detail?.hotLines ?? 0,
      archiveLines: detail?.archiveLines ?? 0,
      archiveMonths: detail?.archiveMonths ?? 0,
      assistantLines: assistantBySession.get(sessionId) ?? 0,
    };
  });

  // D2：对话的向量副本（`chat_history_*`）。判据与执行侧共用 `selectChatHistoryVectorIds`。
  const chatHistoryVectorIds = selectChatHistoryVectorIds({
    entries: resolved.getChatHistoryVectors(),
    senderId: context.senderId,
    knownNames: context.knownNames,
    speakingScopes: context.speakingScopes,
  });

  return {
    personKey: personKeyValue,
    channel: context.channel,
    senderId: context.senderId,
    knownNames: context.knownNames,
    sessions,
    l2: {
      total: context.hits.length,
      byRule: context.byRule,
      ids: context.hits.map((memory) => memory.id),
      keptSubjectOnly: context.keptSubjectOnly.length,
      keptSamples: snippetsOf(context.keptSubjectOnly),
    },
    summaries: {
      decompress: context.summaries.decompress.map((memory) => memory.id),
      remove: context.summaries.remove.map((memory) => memory.id),
    },
    vectors: cascade.removedRagIds.length,
    chatHistoryVectors: chatHistoryVectorIds.length,
    evidence: cascade.evidence,
    dmaeStates: cascade.dmaeStates,
    conflictLogs: cascade.conflictLogs,
    reflectionLogs: cascade.reflectionLogs,
    entities,
    relationshipEntries: { ...relationshipPreview },
    audit: resolved.countAudit(context.senderId),
    channelLogLines: resolved.countLog(context.senderId),
    externalChats: context.privateSessions.size,
    // D4：agent 运行记录（按会话过滤）。只读 index.json —— 预演绝不 initialize（那会写盘）。
    runs: countRunsForConversations(resolved.userDataDir, context.speakingSessionIds),
    memoryBackups: probeBackups(resolved.userDataDir),
    apiLog: probeApiLog(resolved.userDataDir),
    residues,
    // O2：把"有意保留"如实交给 UI（文案不许超出证据）。语料不在此列 —— 它有自己的那一行，
    // 且擦除链路的负载里不该出现它的路径（§0.4 约束 2，有断言守着）。
    preservedPaths: [...MEMORY_PRESERVED_FOR_UI],
    warnings: context.warnings,
    previewId,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 执行
// ─────────────────────────────────────────────────────────────────────────────

function emptyReport(personKey: string, overrides: Partial<PersonEraseReport> = {}): PersonEraseReport {
  return {
    personKey,
    partial: false,
    needsReconfirm: false,
    addedSincePreview: 0,
    l2: { requested: 0, removed: 0, summariesRemoved: 0, decompressed: 0 },
    transcript: { sessions: 0, hotLines: 0, archiveLines: 0, assistantLines: 0 },
    chatHistoryVectors: 0,
    audit: { entries: 0, files: 0 },
    channelLog: { lines: 0 },
    externalChats: 0,
    runs: 0,
    backups: { files: 0, bytes: 0 },
    apiLog: { deleted: false, bytes: 0 },
    entities: { nodes: 0, relations: 0 },
    relationship: { byPersonKey: 0, byScope: 0, byTextFingerprint: 0, summaries: 0 },
    caches: { injections: 0, sessionIndex: 0, dmaeReloaded: false },
    obsidian: { synced: false },
    keptSubjectOnly: 0,
    residues: [],
    failed: [],
    ...overrides,
  };
}

/**
 * 执行擦除。**12 步，每步独立 try/catch，不假装原子**（§2.14）。
 *
 * @param previewId `previewPersonErase` 返回的 id（TTL 10 分钟）。
 *                  执行前会**按同一判据重算**，若出现了预演没有的命中条目则**中止且什么都不删**。
 */
export async function executePersonErase(
  personKey: string,
  previewId: string,
  deps: PersonEraseDeps = {},
): Promise<PersonEraseReport> {
  const resolved = resolveDeps(deps);
  const now = resolved.now();
  prunePreviews(now);

  return resolved.llmQueue("MemoryPersonErase", async () => {
    const context = await buildEraseContext(personKey, resolved, false);
    const report = emptyReport(personKey);

    // ② 校验：previewId 必须存在、未过期、且属于同一个人。
    const record = previewStore.get(previewId);
    if (!context || !record || record.personKey !== personKeyOf(context)) {
      report.failed.push({
        step: "preview",
        target: previewId,
        error: "previewId 不存在、已过期（TTL 10 分钟）或与 personKey 不匹配，请重新预演",
      });
      report.partial = true;
      return report;
    }
    // 预演之后他又说了新的话 → 中止，**什么都不删**（§2.13）。
    const added = [...context.hitIds].filter((id) => !record.ids.has(id));
    if (added.length > 0) {
      report.needsReconfirm = true;
      report.addedSincePreview = added.length;
      return report;
    }
    previewStore.delete(previewId);

    const step = async (name: string, target: string, task: () => void | Promise<void>): Promise<void> => {
      try {
        await task();
      } catch (err) {
        report.failed.push({ step: name, target, error: err instanceof Error ? err.message : String(err) });
      }
    };

    // ③ 记忆级联（含被删总结）
    const cascadeIds = new Set<string>([
      ...context.hitIds,
      ...context.summaries.decompress.map((m) => m.id),
      ...context.summaries.remove.map((m) => m.id),
    ]);
    let removedRagIds: string[] = [];
    await step("l2-cascade", `${cascadeIds.size} ids`, async () => {
      const result = await memoryStore.deleteL2Cascade([...cascadeIds]);
      report.l2.requested = context.hits.length;
      report.l2.removed = result.removed.filter((m) => context.hitIds.has(m.id)).length;
      report.l2.summariesRemoved = result.removed.filter((m) => m.isSummary === true).length;
      removedRagIds = result.removed
        .map((m) => m.ragId)
        .filter((ragId): ragId is string => typeof ragId === "string" && ragId.length > 0);
      report.keptSubjectOnly = context.keptSubjectOnly.length;
      appendMemoryTrace({
        op: "l2.delete.batch",
        layer: "L2",
        status: "ok",
        details: {
          personKey: personKeyOf(context),
          requested: context.hits.length,
          removed: report.l2.removed,
          removedSummaries: report.l2.summariesRemoved,
          evidence: result.evidence,
          dmaeStates: result.dmaeStates,
          conflictLogs: result.conflictLogs,
          danglingRefsFixed: result.danglingRefsFixed,
          reflectionLogs: result.reflectionLogs,
        },
      });
    });

    // ④ 向量（store 是对账的事实源，所以顺序必须是"先 store 后 vector"，§1.2）
    await step("vectors", `${removedRagIds.length} ragIds`, () => {
      if (removedRagIds.length === 0) return;
      resolved.deleteVectors(removedRagIds);
    });

    // ④b **对话的向量副本**（D2）：`chat_history_*` 既不在 `deleteL2Cascade` 的契约里，
    //    也不在启动对账的视野里（`reconcileUserMemoryIndex` 只取 `user_memory`）——
    //    不显式删，它就永久留在向量库里，还能被按域语义召回命中。
    //    判据与预演共用 `selectChatHistoryVectorIds`（与 K 类口径同源）。
    await step("chat-history-vectors", personKeyOf(context), () => {
      const ids = selectChatHistoryVectorIds({
        entries: resolved.getChatHistoryVectors(),
        senderId: context.senderId,
        knownNames: context.knownNames,
        speakingScopes: context.speakingScopes,
      });
      if (ids.length === 0) return;
      report.chatHistoryVectors = resolved.deleteChatVectors(ids);
      appendMemoryTrace({
        op: "chatHistory.delete.batch",
        layer: "store",
        status: "ok",
        details: { personKey: personKeyOf(context), selected: ids.length, deleted: report.chatHistoryVectors },
      });
    });

    // ⑤ 去压缩（§2.6）：零 LLM，把幸存子条目确定性还原为 active 并确保向量可用
    await step("decompress", `${context.summaries.decompress.length} summaries`, async () => {
      for (const summary of context.summaries.decompress) {
        const survivors = (summary.subEntryIds ?? []).filter((id) => !cascadeIds.has(id));
        if (survivors.length === 0) continue;
        await memoryStore.updateL2Status(survivors, "active");
        // ⚠️ 删除后一律重新取，不能复用旧数组引用（§2.15）。
        for (const id of survivors) {
          const current = (await memoryStore.getAllL2()).find((m) => m.id === id);
          if (!current) continue;
          // ⚠️ **压缩并不删子条目的向量**（`commitMemoryCompression` 只 `archiveSources`，
          // 把 status 置为 archived；向量行还在，只是被 `isL2LocallyRecallable` 的状态过滤挡在召回外）。
          // 所以：向量健康时**原样复用**，绝不先删后建 —— 否则
          // ① 会在向量库里留下同一 l2Id 的重复行（`addUnique` 不去重）；
          // ② 会平白删掉一条"别人提到他"的记忆的向量（§2.3 的 K 类，§4.5 用例 2 锁住它不许被删）。
          const healthy = current.syncStatus === "synced"
            && typeof current.ragId === "string" && current.ragId.length > 0;
          if (healthy) continue;
          const ragId = await resolved.addVector(
            current.content,
            current.id,
            { triggerText: current.triggerText, confidence: 1 },
            current.scope,
          );
          await memoryStore.markL2SyncStatus(current.id, "synced", ragId);
        }
        report.l2.decompressed += survivors.length;
        appendMemoryTrace({
          op: "l2.decompress.restore",
          layer: "L2",
          status: "ok",
          l2Id: summary.id,
          details: { summaryId: summary.id, survivors: survivors.length },
        });
      }
    });

    // ⑥ transcript（同步单遍；产出的 D 集合只活在本次调用的局部变量里）
    let removedUserTexts: string[] = [];
    await step("transcript", `${context.channel}:${context.senderId}`, () => {
      const result = erasePersonTranscripts({
        channel: context.channel,
        senderId: context.senderId,
        known: context.known,
        privateSessions: context.privateSessions,
        // D5：连"她复述他"的 assistant 行一起删（判据与预演同源）
        knownNames: context.knownNames,
      });
      removedUserTexts = result.removedUserTexts;
      report.transcript = {
        sessions: result.sessions,
        hotLines: result.hotLines,
        archiveLines: result.archiveLines,
        assistantLines: result.assistantLines,
      };
      for (const failure of result.failed) {
        report.failed.push({ step: "transcript", target: failure.file, error: failure.error });
      }
      appendMemoryTrace({
        op: "transcript.erase",
        layer: "L2",
        status: result.failed.length === 0 ? "ok" : "error",
        details: {
          personKey: personKeyOf(context),
          sessions: result.sessions,
          hotLines: result.hotLines,
          archiveLines: result.archiveLines,
          archiveMonths: result.archiveMonths,
        },
      });
    });

    // ⑦ 审计 / 运行日志 / 记忆备份 / 调试日志（四者都是同步文件操作）
    await step("audit", context.senderId, () => {
      const result = erasePersonAudit(context.senderId);
      report.audit = { entries: result.entries, files: result.files };
      for (const failure of result.failed) {
        report.failed.push({ step: "audit", target: failure, error: "删除审计文件失败" });
      }
      appendMemoryTrace({
        op: "audit.erase",
        layer: "store",
        status: result.failed.length === 0 ? "ok" : "error",
        details: { personKey: personKeyOf(context), entries: result.entries, files: result.files },
      });
    });
    await step("channel-log", context.senderId, () => {
      const result = erasePersonLog(context.senderId);
      report.channelLog = { lines: result.lines };
      appendMemoryTrace({
        op: "channels.log.erase",
        layer: "store",
        status: result.failed.length === 0 ? "ok" : "error",
        details: { personKey: personKeyOf(context), lines: result.lines },
      });
    });
    await step("memory-backups", "memory.backup.*.json + memory-reconcile-backups/", () => {
      const result = eraseMemoryBackups({ userDataDir: resolved.userDataDir });
      // D3：用**递归文件数**（与预演的 `probeBackups` 同口径），而不是"目标数"——
      // 后者会把一个目录算成 1 个，于是同一个"备份"在预演里是 4、在报告里是 3。
      report.backups = { files: result.fileCount, bytes: result.bytes };
      appendMemoryTrace({
        op: "memory.backup.erase",
        layer: "store",
        status: result.failed.length === 0 ? "ok" : "error",
        // 只记大小，不记内容（Q3）
        details: { files: result.fileCount, targets: result.files.length, bytes: result.bytes },
      });
    });
    await step("chat-api-log", "chat-api.log", () => {
      const result = resolved.eraseApiLog();
      report.apiLog = result;
      appendMemoryTrace({
        op: "chatApiLog.erase",
        layer: "store",
        status: "ok",
        details: { deleted: result.deleted, bytes: result.bytes },
      });
    });

    // ⑧ 外部会话观察（**只 forget 私聊**；群记录是区块成员选择器的唯一数据源）
    await step("external-chats", `${context.privateSessions.size} sessions`, () => {
      const ids = [...context.privateSessions];
      report.externalChats = ids.length === 0 ? 0 : resolved.bindingStore.forget(ids);
    });

    // ⑧b agent 运行记录（D4）：`cyrene-runs/sessions/*.json` 里是**逐字对话正文**，
    //     按 `conversationId ∈ 他发过言的会话` 过滤删除（session 文件 + events + index 行）。
    await step("runs", `${context.speakingSessionIds.size} sessions`, () => {
      const result = eraseRunsForConversations(resolved.userDataDir, [...context.speakingSessionIds]);
      report.runs = result.runs;
      for (const failure of result.failed) {
        report.failed.push({ step: "runs", target: failure.target, error: failure.error });
      }
      appendMemoryTrace({
        op: "runs.erase",
        layer: "store",
        status: result.failed.length === 0 ? "ok" : "error",
        details: { personKey: personKeyOf(context), sessions: context.speakingSessionIds.size, runs: result.runs },
      });
    });

    // ⑨ 实体 + 关系日志（**必须在 ⑥ 之后**：指纹要用 ⑥ 产出的 D 集合）
    await step("entities", context.knownNames.join(" / "), () => {
      if (context.knownNames.length === 0) return;
      const result = resolved.removeEntities({ names: context.knownNames, types: ["person"] });
      report.entities = { nodes: result.nodes.length, relations: result.relations };
      appendMemoryTrace({
        op: "entity.erase",
        layer: "store",
        status: "ok",
        details: { names: context.knownNames, nodes: result.nodes.length, relations: result.relations },
      });
    });
    await step("relationship-log", personKeyOf(context), async () => {
      const byPersonKey = await resolved.relationshipStore.eraseByPersonKey(personKeyOf(context));
      report.relationship.byPersonKey = byPersonKey.entries;
      report.relationship.summaries += byPersonKey.summaries;
      for (const scope of context.soloScopes) {
        const byScope = await resolved.relationshipStore.eraseByScope(scope);
        report.relationship.byScope += byScope.entries;
        report.relationship.summaries += byScope.summaries;
      }
      if (context.speakingScopes.size > 0 && removedUserTexts.length > 0) {
        const byFingerprint = await resolved.relationshipStore.eraseByUserTextFingerprint(
          [...context.speakingScopes],
          removedUserTexts,
          LEGACY_MATCH_PREFIX,
        );
        report.relationship.byTextFingerprint = byFingerprint.entries;
        report.relationship.summaries += byFingerprint.summaries;
      }
      appendMemoryTrace({
        op: "relationship.erase",
        layer: "store",
        status: "ok",
        details: {
          personKey: personKeyOf(context),
          byPersonKey: report.relationship.byPersonKey,
          byScope: report.relationship.byScope,
          byTextFingerprint: report.relationship.byTextFingerprint,
          summaries: report.relationship.summaries,
        },
      });
    });

    // ⑩ 进程内缓存（"不重启就生效"的关键）
    await step("cache-injections", `${cascadeIds.size} ids`, () => {
      report.caches.injections = resolved.forgetInjections([...cascadeIds]);
    });
    await step("cache-session-index", context.senderId, () => {
      report.caches.sessionIndex = resolved.forgetSessionIndexFn(context.senderId);
    });
    await step("cache-dmae", "l2DmaeManager", async () => {
      // `loadStates()` 是官方失效姿势：内部 `dmae.clear()` + 按 store 重建（§3.10）。
      await resolved.reloadDmae();
      report.caches.dmaeReloaded = true;
    });

    // ⑪ Obsidian：复用导出同步的"manifest 反删孤儿 md"，不新增 API（§3.15）
    await step("obsidian", "syncToBoundVault", async () => {
      if (!resolved.vaultPath()) return;
      const result = await resolved.syncVault();
      report.obsidian = { synced: result.ok && result.skipped !== true };
    });

    // ⑫ 残留清单重算 + 收尾审计 + 报告
    await step("residues", "post-erase", async () => {
      report.residues = await collectResidues(context, resolved);
    });

    report.partial = report.failed.length > 0;
    appendMemoryTrace({
      // ⚠️ Q3：只记**删除动作**（计数与 id 类信息），**不记被删正文**
      op: "memory.personErase",
      layer: "store",
      status: report.partial ? "error" : "ok",
      details: {
        personKey: personKeyOf(context),
        channel: context.channel,
        sessions: report.transcript.sessions,
        l2: report.l2.removed,
        transcriptLines: report.transcript.hotLines + report.transcript.archiveLines,
        // D5 / D2：这两条是手工验证抓到的残留通道，写进 trace 才能在事后复查"当时到底清了没有"
        assistantLines: report.transcript.assistantLines,
        chatHistoryVectors: report.chatHistoryVectors,
        entities: report.entities.nodes,
        relationshipEntries: report.relationship.byPersonKey + report.relationship.byScope + report.relationship.byTextFingerprint,
        residues: report.residues.length,
        failed: report.failed.length,
      },
    });

    return report;
  });
}
