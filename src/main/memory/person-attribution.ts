/**
 * Person Attribution —— L2 记忆的「谁说的 / 关于谁」解析。
 *
 * Phase 3 P2 引入。本模块**全部是纯函数**：零 IO、零 LLM 调用、可单测。
 *
 * 分工（为什么要把"认人"拆成两半）：
 *   - LLM 只负责**语义判断**：这条候选关于谁（输出人名 `subjectNames`）、来自第几轮
 *     （输出轮次号 `sourceTurnIndexes`）。它最可靠的能力是文本匹配，不是复述 ID。
 *   - 本模块负责**把名字映射回稳定 ID**（`personKey` = `<channel>:<senderId>`）。
 *
 * 设计原则：**映射不上就丢弃，绝不猜。**
 * 猜错的代价在「删除」场景下是删掉别人的记忆（总概览 §1.3），比漏标严重得多。
 */

import type { MemoryCandidate, MemoryJudgeTurn } from "./memory-types";

/**
 * 组合说话人稳定标识。
 *
 * 为什么带 channel 前缀：QQ 与微信的 senderId 空间独立，裸 id 会跨渠道撞车。
 * 而 `L2Memory.subjectIds` 是跨域查询的键（全局删除），必须全局唯一。
 *
 * ⚠️ transcript（`channels/history/*.jsonl`）里的 `speakerId` 保持**裸值**不动，
 * 需要 channel 时由 `channelFromSessionId()` 从会话 id 解析。
 */
export function buildPersonKey(channel: string, senderId: string): string {
  return `${channel}:${senderId}`;
}

/**
 * 从 `channel:<channel>:<hash>` 形式的 sessionId 解析渠道前缀。
 *
 * 渠道 sessionId 由 `makeSessionId()`（channel-context.ts）生成，群/私聊**同形**，
 * 所以这里只能拿到渠道，拿不到"是群还是私聊"—— 判单人会话请用
 * `attributeCandidates()` 里的「personKey 去重后只剩一个」判据。
 */
export function channelFromSessionId(sessionId: string | undefined | null): string | null {
  if (typeof sessionId !== "string") return null;
  const m = /^channel:([^:]+):/.exec(sessionId);
  return m ? m[1] : null;
}

/** 去重、保序、忽略 undefined/空串。compress / resolver 继承归属时用。 */
export function unionOf(lists: ReadonlyArray<readonly (string | undefined)[] | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (typeof item !== "string") continue;
      const value = item.trim();
      if (!value || seen.has(value)) continue;
      seen.add(value);
      out.push(value);
    }
  }
  return out;
}

/** 本批说话人的名册：昵称 → personKey，以及出现的全部 personKey（保序去重）。 */
export interface SpeakerRoster {
  byName: Map<string, string>;
  all: string[];
}

/**
 * 从本批 turns 里建名册。
 *
 * ⚠️ 名册**只有"本批说过话的人"**。跨批提到的人无法归属 —— 这是可接受的降级，
 * 不是 bug（已写进 judge prompt 的限制说明）。
 */
export function buildSpeakerRoster(turns: readonly MemoryJudgeTurn[]): SpeakerRoster {
  const byName = new Map<string, string>();
  const all = unionOf(turns.map((turn) => (turn.personKey ? [turn.personKey] : [])));
  for (const turn of turns) {
    if (!turn.personKey) continue;
    const name = turn.speakerName?.trim();
    // 昵称缺失时只进 all，不进 byName —— 否则会把 "" 当成一个可匹配的名字。
    if (!name) continue;
    // 同名冲突时保留先出现的：同一批里同名多人的概率极低，
    // 而"先出现"比"后出现"更可能是被称呼的那位。
    if (!byName.has(name)) byName.set(name, turn.personKey);
  }
  return { byName, all };
}

/**
 * 把 LLM 输出的 subjectNames 映射成 personKey；映射不上的丢弃。
 *
 * ⚠️ **精确匹配**（trim 后全等），不做模糊/子串匹配 ——
 * 否则「小明」会匹配到「小明明」，把记忆挂到错误的人身上。
 */
export function resolveSubjectIds(
  names: readonly string[] | undefined,
  roster: SpeakerRoster,
): string[] {
  if (!Array.isArray(names) || names.length === 0) return [];
  const resolved: string[] = [];
  for (const raw of names) {
    if (typeof raw !== "string") continue;
    const name = raw.trim();
    if (!name) continue;
    const personKey = roster.byName.get(name);
    if (!personKey) continue;
    resolved.push(personKey);
  }
  return unionOf([resolved]);
}

/** 轮次号是否合法：1-based 正整数。 */
function isValidTurnIndex(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

/**
 * 把 `sourceTurnIndexes`（1-based 轮次号）解析成 turns 下标（0-based）。
 * 越界/非整数项直接忽略；去重保序。
 */
function resolveTurnIndexes(
  indexes: readonly number[] | undefined,
  turnCount: number,
): number[] {
  if (!Array.isArray(indexes) || indexes.length === 0) return [];
  const seen = new Set<number>();
  const out: number[] = [];
  for (const raw of indexes) {
    if (!isValidTurnIndex(raw)) continue;
    const zeroBased = raw - 1;
    if (zeroBased >= turnCount) continue;
    if (seen.has(zeroBased)) continue;
    seen.add(zeroBased);
    out.push(zeroBased);
  }
  return out;
}

/** 候选来自哪几轮：`sourceTurnIndexes` 命中则用命中集，缺失/全无效时退化为整批。 */
function resolveSourceTurns(
  candidate: MemoryCandidate,
  turns: readonly MemoryJudgeTurn[],
): number[] {
  const hit = resolveTurnIndexes(candidate.sourceTurnIndexes, turns.length);
  if (hit.length > 0) return hit;
  return turns.map((_, index) => index);
}

/**
 * 给一批候选注入归属。这是 P2 的核心函数。
 *
 * - `speakerIds`       ← 来源轮的 `personKey`（`sourceTurnIndexes` 缺失/全无效时退化为整批）
 * - `subjectIds`       ← `subjectNames` 名册映射；映射为空时，**私聊**（`chatType === "private"`）
 *                        退化为对端；群聊留空（视为公共记忆）
 * - `sourceMessageIds` ← 来源轮的 `messageId`（P1 的消息身份）
 *
 * 已有的 `speakerIds` / `subjectIds` / `sourceMessageIds`（来自上游或测试桩）予以保留，
 * 解析结果为空时不会把已有值抹掉。
 *
 * @param scopeId 仅为可读性与调用方对齐保留（归属解析本身与记忆域无关）；
 *                域注入仍由 memory-scheduler 负责。
 */
export function attributeCandidates(
  candidates: readonly MemoryCandidate[],
  turns: readonly MemoryJudgeTurn[],
  scopeId?: string,
): MemoryCandidate[] {
  void scopeId;
  const roster = buildSpeakerRoster(turns);
  const privateChatPersonKey = resolvePrivateChatFallback(turns);

  return candidates.map((candidate) => {
    const sourceTurns = resolveSourceTurns(candidate, turns);
    const speakerIds = unionOf([
      candidate.speakerIds,
      sourceTurns.map((index) => turns[index]?.personKey),
    ]);

    const resolvedSubjects = resolveSubjectIds(candidate.subjectNames, roster);
    const subjectIds = unionOf([
      candidate.subjectIds,
      resolvedSubjects.length > 0
        ? resolvedSubjects
        : (privateChatPersonKey ? [privateChatPersonKey] : []),
    ]);

    const sourceMessageIds = unionOf([
      candidate.sourceMessageIds,
      sourceTurns.map((index) => turns[index]?.messageId),
    ]);

    const next: MemoryCandidate = { ...candidate };
    if (speakerIds.length > 0) next.speakerIds = speakerIds;
    if (subjectIds.length > 0) next.subjectIds = subjectIds;
    if (sourceMessageIds.length > 0) next.sourceMessageIds = sourceMessageIds;
    return next;
  });
}

/**
 * 「单人会话兜底」判据：私聊里对端就是主语，映射失败时可以直接兜。
 *
 * ⚠️ **必须看 `chatType`，不能看"本批 personKey 去重后只剩一个"。**
 *
 * 后者是伪判据：群里只有小明说过话时，映射失败大多是"这条记忆和具体的人无关"
 * （纯项目进展），兜底会把**公共记忆**错误地标注成「关于小明」——
 * 而 P3 的删除正是按 `subjectIds` 定位的，标错就等于删错人的记忆。
 *
 * 桌面路径（无 chatType 且无 personKey）不兜底，与 P1 行为一致。
 */
function resolvePrivateChatFallback(turns: readonly MemoryJudgeTurn[]): string | undefined {
  const privatePersonKeys = unionOf(
    turns
      .filter((turn) => turn.chatType === "private")
      .map((turn) => (turn.personKey ? [turn.personKey] : [])),
  );
  // 一个私聊会话里出现两个说话人（异常数据：同一 chatId 换人发言）时不兜底 ——
  // 同上，宁可不标也不能标错人。
  if (privatePersonKeys.length !== 1) return undefined;
  return privatePersonKeys[0];
}
