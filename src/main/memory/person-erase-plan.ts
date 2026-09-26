/**
 * Person Erase Plan —— 「擦除某个人」的**唯一判据来源**（纯函数，零 IO）。
 *
 * Phase 3 P3 引入。与 `person-attribution.ts` 同一风格：不读文件、不调 LLM、可单测。
 *
 * ⚠️ **判据只在这一处**。预演（`previewPersonErase`）与执行（`executePersonErase`）
 * 共用同一个 `computeEraseHits()`，这是 §2.13「执行时按同一判据重算并与预演快照比对」
 * 能成立的前提 —— 两处各写一份判据，迟早会漂移。
 *
 * ## 判据（§2.2）：两条删 + 一条留
 *
 * > **删「从他嘴里出来的」，留「别人提到他的」。**
 *
 * | 规则 | 条件 | 处置 |
 * |---|---|---|
 * | R1 私聊即人 | `sourceConversationId ∈ privateSessions` | **删**（他的私聊整会话都会被删，记忆必须跟着走，否则留下"来源已删除"的孤证） |
 * | R2 他说的 | `speakerIds ∋ personKey` | **删**（无论在哪个会话里） |
 * | K 别人提到他 | 只有 `subjectIds ∋ personKey`、`speakerIds` 不含他 | **不删**（§2.3 三条理由；那条记忆往往同时是**别人的经历**） |
 * | — 其余一切 | — | 不动 |
 *
 * ⚠️ `subjectIds` **不参与任何删除判据**。所以 `computeEraseHits()` 的返回值里
 * 根本**没有**"按 subjectIds 命中"这一项 —— 将来若有人想加回"删别人转述的记忆"，
 * 他必须改这个函数的签名，而不是偷偷在某个 if 里加一个条件（§3.2 的类型层体现）。
 */

import type { L2Memory } from "./memory-types";
import type { ExternalChannelChat } from "../channels/conversation-binding-store";
import type { ZoneExternalMember } from "../zones/types";

/** 一条"会话 ↔ 人"名册记录（三条来源并集的产物，见 §1.5）。 */
export interface SessionRosterItem {
  sessionId: string;
  channel: string;
  /** 平台会话 id（群号 / 私聊对端 id）。L2 推出来的会话拿不到，为空串。 */
  chatId: string;
  chatType: "private" | "group";
  senderName?: string;
  /** 该会话在热层/归档里被扫到的"他的行"数（由 transcript 扫描侧注入，可为 0）。 */
  matchedLines?: number;
}

export interface EraseScopeInput {
  /** `<channel>:<senderId>`（P2 约定，见 person-attribution.ts）。 */
  personKey: string;
  /** 全量 L2。 */
  memories: readonly L2Memory[];
  /** 会话名册。 */
  sessions: readonly SessionRosterItem[];
}

/**
 * 解析 `personKey`：**在第一个 `:` 处切分**。
 *
 * 渠道 id 的字符集是 `^[a-z][a-z0-9_-]{0,31}$`（`conversation-binding-store.ts:43-46`），
 * 不含 `:`，所以第一个冒号必然是分隔符；`senderId` 侧则可能含 `:`（飞书 openid 不会，
 * 但插件渠道难说），所以**不能**用 `split(":")` 取第二段。
 *
 * 任一侧为空 → `null`（宁可什么都不做，也不要按 `qq:` 这种残键去扫）。
 */
export function parsePersonKey(personKey: string): { channel: string; senderId: string } | null {
  if (typeof personKey !== "string") return null;
  const index = personKey.indexOf(":");
  if (index <= 0) return null;
  const channel = personKey.slice(0, index);
  const senderId = personKey.slice(index + 1);
  if (!channel || !senderId) return null;
  return { channel, senderId };
}

/** `channel:<channel>:<hash16>` → 渠道 id；解析不出返回 null。 */
function channelOfSession(sessionId: string): string | null {
  const m = /^channel:([^:]+):/.exec(sessionId);
  return m ? m[1] : null;
}

/**
 * 三源并集构造会话名册（§1.5 的来源 A/B/C）。
 *
 * 合并优先级：`externalChats`（每条入站消息都 observe，最新）> 区块成员（用户显式配置）
 * > L2 的 `sourceConversationId`（只有会话 id，没有 chatId/chatType）。**先到者胜**，
 * 后到的只补空缺字段，不覆盖已有信息。
 *
 * ⚠️ 只有会话 id 的那一档，`chatType` 缺省按 `"group"` 处理 —— 因为 L2 行里没有 chatType，
 * 而"把群误判成私聊"会导致 R1 **误删整个私聊会话**（§2.5 是整文件删，不是逐行过滤）。
 * 缺省的代价只是"私聊会话少一条 R1 兜底"，而他真正说过的话仍会被 R2 命中（speakerIds）。
 */
export function buildSessionRoster(input: {
  externalChats: readonly ExternalChannelChat[];
  zoneMembers: readonly ZoneExternalMember[];
  memories: readonly L2Memory[];
}): SessionRosterItem[] {
  const byId = new Map<string, SessionRosterItem>();

  const add = (
    item: { sessionId: string; channel: string; chatId: string; chatType: "private" | "group"; senderName?: string },
    overwrite: boolean,
  ): void => {
    if (!item.sessionId || !item.channel) return;
    const existing = byId.get(item.sessionId);
    if (!existing) {
      byId.set(item.sessionId, { ...item });
      return;
    }
    if (overwrite) {
      existing.channel = item.channel;
      existing.chatId = item.chatId;
      existing.chatType = item.chatType;
      if (item.senderName) existing.senderName = item.senderName;
      return;
    }
    if (!existing.senderName && item.senderName) existing.senderName = item.senderName;
  };

  for (const chat of input.externalChats) {
    add({ sessionId: chat.sessionId, channel: chat.channel, chatId: chat.chatId, chatType: chat.chatType, senderName: chat.senderName }, false);
  }
  for (const member of input.zoneMembers) {
    add({ sessionId: member.sessionId, channel: member.channel, chatId: member.chatId, chatType: member.chatType, senderName: member.senderName }, false);
  }
  for (const memory of input.memories) {
    const sessionId = memory.sourceConversationId;
    if (!sessionId || byId.has(sessionId)) continue;
    const channel = channelOfSession(sessionId);
    if (!channel) continue;
    // 见上方注释：拿不到 chatType 时按 group 处理（宁可不删，不可删错）。
    add({ sessionId, channel, chatId: "", chatType: "group" }, false);
  }

  return [...byId.values()];
}

/**
 * R1 的会话集合：**他的私聊会话**。
 *
 * 判据是「名册里 `chatType === "private"` 且 `chatId === senderId`」。
 * 同一个会话既可能出现在 `externalChats` 也可能出现在区块成员里，名册已去重。
 *
 * ## 关于设计文档里那个"P2 子句"
 *
 * P3 文档 §2.2 写的第二个来源是「命中集合 H 里那些 `sourceConversationId`」。实测**不可实现**：
 * 一条 L2 行里只有 `sourceConversationId`，**没有任何字段能说明那个会话是群还是私聊**，
 * 而 `speakerId` 的有无又要读完 transcript 才知道。更关键的是，猜错的代价是不对称的 ——
 * 把群猜成私聊会让 §2.5 的"整会话删除"落到一个**装着别人发言的群文件**上（§1.3 的代价）。
 * 所以这里只保留 P1 这一条**可判定**的判据，并按"宁可不删，不可删错"收敛。
 *
 * 代价（已接受）：对**飞书**私聊（`chatId` 是 `oc_*`、`senderId` 是 `ou_*`，两者不等）
 * 以及被 200 条上限裁掉观察记录的私聊会话，R1 覆盖不到；此时他真正说过的话仍由 R2
 * （`speakerIds ∋ P`）命中，不会漏删"他说的"。预演报告里会给出 warning。
 */
export function buildPrivateSessions(input: EraseScopeInput): Set<string> {
  const parsed = parsePersonKey(input.personKey);
  const out = new Set<string>();
  if (!parsed) return out;
  for (const session of input.sessions) {
    if (session.channel !== parsed.channel) continue;
    if (session.chatType !== "private") continue;
    if (session.chatId !== parsed.senderId) continue;
    out.add(session.sessionId);
  }
  return out;
}

/** 本条记忆是不是"从他嘴里出来的"（R2）。 */
export function hasSpeaker(memory: L2Memory, personKey: string): boolean {
  return Array.isArray(memory.speakerIds) && memory.speakerIds.includes(personKey);
}

/** 本条记忆是不是"别人提到他的"（K 类，只用于展示与报告）。 */
export function hasSubjectOnly(memory: L2Memory, personKey: string): boolean {
  if (hasSpeaker(memory, personKey)) return false;
  return Array.isArray(memory.subjectIds) && memory.subjectIds.includes(personKey);
}

/**
 * S 集合：**他发过言的会话**。
 *
 * ⚠️ 它**只用于 transcript 与报告展示，不参与任何 L2 判据**（§2.2 的语义单一要求：
 * 没有哪个集合能同时"决定删记忆"又"决定改文件"）。
 *
 * 来源：名册里被扫到过他的行的会话（`matchedLines > 0`，由 transcript 扫描侧注入）
 * ∪ R2 命中条目的 `sourceConversationId`。
 */
export function buildSpeakingSessions(input: EraseScopeInput): Set<string> {
  const out = new Set<string>();
  for (const session of input.sessions) {
    if ((session.matchedLines ?? 0) > 0) out.add(session.sessionId);
  }
  for (const memory of input.memories) {
    if (hasSpeaker(memory, input.personKey)) out.add(memory.sourceConversationId);
  }
  out.delete("");
  return out;
}

export interface EraseHits {
  /** R1 ∪ R2 —— **将被删除**的条目（去重；R1 命中的排在前面）。 */
  hits: L2Memory[];
  /** R1 / R2 各自的命中数。两条都满足时只计入 R1（R1 优先，见 §2.3 的场景表）。 */
  byRule: { private: number; speaker: number };
  /** K 类：只有 `subjectIds ∋ P`。**只列出来，绝不并入 hits。** */
  keptSubjectOnly: L2Memory[];
  /**
   * 引用了被删 id 的压缩总结的分类（§2.6 去压缩）：
   * - `decompress`：还有幸存子条目 → 删总结 + 把幸存者还原为 `active`
   * - `remove`：全部子条目都被删 → 直接删
   */
  summaries: { decompress: L2Memory[]; remove: L2Memory[] };
}

/**
 * 算命中集合 H 与总结分类。**这是删除判据的唯一实现。**
 *
 * 纯函数：不修改入参数组（用例 11 锁住）；同一输入调用两次结果逐字段相等。
 */
export function computeEraseHits(input: EraseScopeInput): EraseHits {
  const privateSessions = buildPrivateSessions(input);

  const hits: L2Memory[] = [];
  const hitIds = new Set<string>();
  let privateHits = 0;
  let speakerHits = 0;

  // 第一遍：R1。单独一趟是为了让"两条都满足时计入 R1"这条统计规则显式可见。
  for (const memory of input.memories) {
    if (!privateSessions.has(memory.sourceConversationId)) continue;
    hits.push(memory);
    hitIds.add(memory.id);
    privateHits += 1;
  }
  // 第二遍：R2。已在 R1 里的不重复计入。
  for (const memory of input.memories) {
    if (hitIds.has(memory.id)) continue;
    if (!hasSpeaker(memory, input.personKey)) continue;
    hits.push(memory);
    hitIds.add(memory.id);
    speakerHits += 1;
  }

  const keptSubjectOnly = input.memories.filter((memory) => hasSubjectOnly(memory, input.personKey));

  const decompress: L2Memory[] = [];
  const remove: L2Memory[] = [];
  for (const memory of input.memories) {
    if (memory.isSummary !== true) continue;
    const subIds = Array.isArray(memory.subEntryIds) ? memory.subEntryIds : [];
    if (!subIds.some((id) => hitIds.has(id))) continue;
    const survivors = subIds.filter((id) => !hitIds.has(id));
    if (survivors.length > 0) decompress.push(memory);
    else remove.push(memory);
  }

  return {
    hits,
    byRule: { private: privateHits, speaker: speakerHits },
    keptSubjectOnly,
    summaries: { decompress, remove },
  };
}

/**
 * 挑出要从向量库里删掉的 **`chat_history`** 条目（§5.2 第 5 步抓到 **D2** 之后补）。
 *
 * ## 为什么需要它
 *
 * 向量库里有**两类**条目：`user_memory_*`（L2 的向量副本）与 `chat_history_*`
 * （每轮对话的 user/assistant 两条向量副本，供 `recall_history` 按域语义召回）。
 * 擦除链路原来只删前者 —— `chat_history` 既不删、**也不会被启动对账回收**
 * （`reconcileUserMemoryIndex` 取的是 `getEntriesBySource("user_memory")`），
 * 于是"彻底擦除"之后仍能按域召回他已经删掉的经历。
 *
 * ## 判据（与 §2.3 的 K 类口径同源）
 *
 * | 条目 | 处置 | 理由 |
 * |---|---|---|
 * | `role=user` 且正文含他的 `senderId` | **删** | "他说的" |
 * | `role=assistant` 且正文含他的任一别名（且落在他的域里） | **删** | "她复述他的"（D5 同一口径） |
 * | `role=user` 且只是**别人**提到他 | **留** | K 类：别人的经历片段（§2.3） |
 * | 落在他的域之外 | **留** | 不越界：别的群里同名的人不该被牵连 |
 *
 * ⚠️ 与 `computeEraseHits` 一样，**这是纯函数**，预演与执行共用它。
 */
export function selectChatHistoryVectorIds(input: {
  entries: ReadonlyArray<{ id: string; text: string; metadata?: Record<string, unknown> }>;
  senderId: string;
  knownNames: readonly string[];
  /** 他发过言的域（`solo:<sessionId>`）；assistant 条目必须落在这里才认。 */
  speakingScopes: ReadonlySet<string>;
}): string[] {
  const names = input.knownNames.filter((name) => name.length > 0);
  const textOf = (entry: { text: string }): string => (typeof entry.text === "string" ? entry.text : "");
  const isHisUtterance = (entry: { text: string; metadata?: Record<string, unknown> }): boolean =>
    entry.metadata?.role === "user" && input.senderId.length > 0 && textOf(entry).includes(input.senderId);

  /**
   * 轮次配对的键：`indexConversationTurn` 给同一个 turn 的 user / assistant 两条
   * **写入同一个 `ts`、同一个 `sessionId`**（实测确认）。所以"她的回复"可以精确到"回谁的"——
   * 这很关键：她对他那句话的回复里**可能一个字都不提他**
   * （实测泄漏的那条：`学做菜好呀！以后搬去杭州就能自己开小灶啦♪`），只按正文匹配是抓不到的。
   */
  const turnKey = (metadata: Record<string, unknown> | undefined): string | null => {
    const sessionId = metadata?.sessionId;
    const ts = metadata?.ts;
    if (typeof sessionId !== "string" || sessionId.length === 0) return null;
    if (typeof ts !== "number" && typeof ts !== "string") return null;
    return `${sessionId}|${ts}`;
  };

  const hisTurns = new Set<string>();
  for (const entry of input.entries) {
    if (!isHisUtterance(entry)) continue;
    const key = turnKey(entry.metadata);
    if (key) hisTurns.add(key);
  }

  const out: string[] = [];
  for (const entry of input.entries) {
    const text = textOf(entry);
    if (text.length === 0) continue;
    const role = entry.metadata?.role;
    const scope = entry.metadata?.scope;
    // ① 他的原话：正文带他的裸 senderId（别人不会带，所以不必限制域）
    if (isHisUtterance(entry)) {
      out.push(entry.id);
      continue;
    }
    if (role !== "assistant") continue;
    // ② 她对他那句话的回复：靠轮次配对（与正文是否提他无关）
    const key = turnKey(entry.metadata);
    if (key && hisTurns.has(key)) {
      out.push(entry.id);
      continue;
    }
    // ③ 她在他的域里点名提他：按别名匹配（必须限定域，否则别的群同名的人会被牵连）
    if (typeof scope !== "string" || !input.speakingScopes.has(scope)) continue;
    if (names.some((name) => text.includes(name))) out.push(entry.id);
  }
  return out;
}
