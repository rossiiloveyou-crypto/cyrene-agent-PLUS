/**
 * `person-erase-plan` 单元测试（P3 §4.1）。
 *
 * 这是本阶段**最重要的一组用例**：删除判据只实现一次（在这个模块里），
 * 而"删错人的记忆"是 P3 的代价上限（§1.3）。所以 K 类（别人提到他）的防线
 * 在这里被反复锁：用例 6 / 7 / 7b 三条分别对应"同群转述""别的域转述""subjectIds 不参与删除"。
 */

import { describe, expect, it } from "vitest";
import {
  type EraseScopeInput,
  type SessionRosterItem,
  buildPrivateSessions,
  buildSessionRoster,
  buildSpeakingSessions,
  computeEraseHits,
  hasSubjectOnly,
  parsePersonKey,
  selectChatHistoryVectorIds,
} from "./person-erase-plan";
import type { L2Memory } from "./memory-types";
import type { ExternalChannelChat } from "../channels/conversation-binding-store";
import type { ZoneExternalMember } from "../zones/types";

const ME = "qq:10001";
const OTHER = "qq:10002";

function memory(overrides: Partial<L2Memory> & { id: string }): L2Memory {
  return {
    id: overrides.id,
    content: overrides.content ?? `content-${overrides.id}`,
    triggerText: overrides.triggerText ?? `trigger-${overrides.id}`,
    sourceConversationId: overrides.sourceConversationId ?? "channel:qq:group000000000000",
    createdAt: 1,
    lastAccessedAt: 1,
    accessCount: 0,
    weight: 0,
    isPinned: false,
    status: "active",
    ...overrides,
  };
}

/** 他的私聊会话（`channel:qq:<hash16>` 只是形状，测试里不必真的算哈希）。 */
const MY_PRIVATE = "channel:qq:aaaaaaaaaaaaaaaa";
const GROUP = "channel:qq:bbbbbbbbbbbbbbbb";
const OTHER_GROUP = "channel:qq:cccccccccccccccc";

const roster: SessionRosterItem[] = [
  { sessionId: MY_PRIVATE, channel: "qq", chatId: "10001", chatType: "private", senderName: "小明" },
  { sessionId: GROUP, channel: "qq", chatId: "543627098", chatType: "group", senderName: "测试群" },
  { sessionId: OTHER_GROUP, channel: "qq", chatId: "999999999", chatType: "group", senderName: "别的群" },
];

function input(memories: L2Memory[], sessions: readonly SessionRosterItem[] = roster): EraseScopeInput {
  return { personKey: ME, memories, sessions };
}

describe("person-erase-plan", () => {
  it("1. parsePersonKey 在第一个冒号处切分；任一侧为空则 null", () => {
    expect(parsePersonKey("qq:10001")).toEqual({ channel: "qq", senderId: "10001" });
    // 渠道 id 允许下划线；senderId 侧可能出现冒号，所以只能切第一刀
    expect(parsePersonKey("my_channel:ou_xxx")).toEqual({ channel: "my_channel", senderId: "ou_xxx" });
    expect(parsePersonKey("qq:a:b")).toEqual({ channel: "qq", senderId: "a:b" });
    expect(parsePersonKey("no-colon")).toBeNull();
    expect(parsePersonKey(":10001")).toBeNull();
    expect(parsePersonKey("qq:")).toBeNull();
  });

  it("2. buildSessionRoster 三源并集且字段不丢", () => {
    const externalChats: ExternalChannelChat[] = [
      { sessionId: GROUP, channel: "qq", chatId: "543627098", chatType: "group", senderName: "测试群", lastAt: 5 },
    ];
    const zoneMembers: ZoneExternalMember[] = [
      { kind: "external", sessionId: MY_PRIVATE, channel: "qq", chatId: "10001", chatType: "private", senderName: "小明" },
      // 与 externalChats 同会话：只补空缺字段，不覆盖已有信息
      { kind: "external", sessionId: GROUP, channel: "qq", chatId: "543627098", chatType: "group", senderName: "不该覆盖" },
    ];
    const memories = [memory({ id: "m1", sourceConversationId: OTHER_GROUP })];

    const result = buildSessionRoster({ externalChats, zoneMembers, memories });
    expect(result.map((item) => item.sessionId).sort()).toEqual([MY_PRIVATE, GROUP, OTHER_GROUP].sort());
    const group = result.find((item) => item.sessionId === GROUP)!;
    expect(group.senderName).toBe("测试群");
    // L2 推出来的会话拿不到 chatType → 缺省 group（安全侧：宁可漏判私聊，不可误判私聊）
    const derived = result.find((item) => item.sessionId === OTHER_GROUP)!;
    expect(derived.chatType).toBe("group");
    expect(derived.chatId).toBe("");
  });

  it("3. buildSpeakingSessions：扫描命中的会话 ∪ R2 命中条目的会话", () => {
    const sessions: SessionRosterItem[] = [
      { ...roster[1], matchedLines: 3 },
      { ...roster[2], matchedLines: 0 },
    ];
    const memories = [memory({ id: "m1", sourceConversationId: OTHER_GROUP, speakerIds: [ME] })];
    const speaking = buildSpeakingSessions(input(memories, sessions));
    expect(speaking.has(GROUP)).toBe(true);   // S1：扫到过他的行
    expect(speaking.has(OTHER_GROUP)).toBe(true); // S2：R2 命中的条目的来源会话
  });

  it("4. R1：他的私聊会话里，连 subjectIds 为空的 legacy L2 也命中", () => {
    const legacy = memory({ id: "legacy", sourceConversationId: MY_PRIVATE });
    const hits = computeEraseHits(input([legacy]));
    expect(hits.hits.map((m) => m.id)).toEqual(["legacy"]);
    expect(hits.byRule).toEqual({ private: 1, speaker: 0 });
  });

  it("5. R1 优先于 K：他的私聊里提到第三方，仍然命中（与「私聊整会话删除」一致）", () => {
    const aboutThirdParty = memory({
      id: "third",
      sourceConversationId: MY_PRIVATE,
      subjectIds: ["qq:10003"],
      speakerIds: [],
    });
    const hits = computeEraseHits(input([aboutThirdParty]));
    expect(hits.hits.map((m) => m.id)).toEqual(["third"]);
    expect(hits.byRule).toEqual({ private: 1, speaker: 0 });
  });

  it("6. K 类保留（核心防线）：同群里 B 提到他 → 绝不命中", () => {
    const mentioned = memory({
      id: "k-group",
      sourceConversationId: GROUP,
      speakerIds: [OTHER],
      subjectIds: [ME],
    });
    const hits = computeEraseHits(input([mentioned]));
    expect(hits.hits).toEqual([]);
    expect(hits.keptSubjectOnly.map((m) => m.id)).toEqual(["k-group"]);
    expect(hasSubjectOnly(mentioned, ME)).toBe(true);
  });

  it("7. K 类保留：别的域里 B 提到他 → 同样不命中", () => {
    const inOtherGroup = memory({
      id: "k-other-group",
      sourceConversationId: OTHER_GROUP,
      speakerIds: [OTHER],
      subjectIds: [ME],
    });
    const inPrivateOfOther = memory({
      id: "k-private",
      sourceConversationId: "channel:qq:dddddddddddddddd",
      speakerIds: [OTHER],
      subjectIds: [ME],
    });
    const hits = computeEraseHits(input([inOtherGroup, inPrivateOfOther]));
    expect(hits.hits).toEqual([]);
    expect(hits.keptSubjectOnly.map((m) => m.id).sort()).toEqual(["k-other-group", "k-private"]);
  });

  it("7b. subjectIds 不参与删除判据：subjectIds=[P] 且 speakerIds 缺失 → 永不进 ids", () => {
    // 哪怕它在 speakingSessions 里（R2 从别的条目推出该会话有他的行），也不删
    const subjectOnly = memory({ id: "sub-only", sourceConversationId: GROUP, subjectIds: [ME] });
    const fromMe = memory({ id: "from-me", sourceConversationId: GROUP, speakerIds: [ME] });
    const hits = computeEraseHits(input([subjectOnly, fromMe]));
    expect(hits.hits.map((m) => m.id)).toEqual(["from-me"]);
    expect(hits.hits.some((m) => m.id === "sub-only")).toBe(false);
    expect(hits.keptSubjectOnly.map((m) => m.id)).toEqual(["sub-only"]);
  });

  it("8. 无归属 legacy 不命中（既不是他说的，也不是关于他）", () => {
    const anonymous = memory({ id: "anon", sourceConversationId: GROUP });
    const hits = computeEraseHits(input([anonymous]));
    expect(hits.hits).toEqual([]);
    expect(hits.keptSubjectOnly).toEqual([]);
  });

  it("9. 跨渠道不误伤：qqbot:10001 的条目不被 qq:10001 命中", () => {
    const qqbotSameId = memory({ id: "qqbot", sourceConversationId: "channel:qqbot:eeeeeeeeeeeeeeee", speakerIds: ["qqbot:10001"], subjectIds: ["qqbot:10001"] });
    const hits = computeEraseHits(input([qqbotSameId]));
    expect(hits.hits).toEqual([]);
    expect(hits.keptSubjectOnly).toEqual([]);
  });

  it("10. 总结分类：还有幸存子条目 → decompress；全部被删 → remove", () => {
    const mine = memory({ id: "s1", sourceConversationId: GROUP, speakerIds: [ME] });
    const others = memory({ id: "s2", sourceConversationId: GROUP, speakerIds: [OTHER] });
    const mixed = memory({ id: "sum-mixed", sourceConversationId: GROUP, isSummary: true, subEntryIds: ["s1", "s2"], speakerIds: [ME, OTHER] });
    const allMine = memory({ id: "sum-all", sourceConversationId: GROUP, isSummary: true, subEntryIds: ["s1"], speakerIds: [ME] });

    const hits = computeEraseHits(input([mine, others, mixed, allMine]));
    expect(hits.summaries.decompress.map((m) => m.id)).toEqual(["sum-mixed"]);
    expect(hits.summaries.remove.map((m) => m.id)).toEqual(["sum-all"]);
    // 总结自己也因为 speakerIds ∋ P 落进 R2（§2.6 的交互）
    expect(hits.hits.map((m) => m.id).sort()).toEqual(["s1", "sum-all", "sum-mixed"]);
    expect(hits.keptSubjectOnly).toEqual([]);
  });

  it("11. 纯函数性：两次结果相等，且不修改入参数组", () => {
    const memories = [
      memory({ id: "a", sourceConversationId: MY_PRIVATE }),
      memory({ id: "b", sourceConversationId: GROUP, speakerIds: [ME] }),
      memory({ id: "c", sourceConversationId: GROUP, speakerIds: [OTHER], subjectIds: [ME] }),
    ];
    const snapshot = JSON.stringify(memories);
    const first = computeEraseHits(input(memories));
    const second = computeEraseHits(input(memories));
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(JSON.stringify(memories)).toBe(snapshot);
  });

  it("buildPrivateSessions 只认「名册里 chatType=private 且 chatId=senderId」", () => {
    const sessions = buildPrivateSessions(input([], roster));
    expect([...sessions]).toEqual([MY_PRIVATE]);
    // 一个私聊都没识别出来时不能把群会话卷进来
    expect(sessions.has(GROUP)).toBe(false);
  });

  it("buildPrivateSessions：飞书那种 chatId ≠ senderId 的私聊不会被误判", () => {
    const feishuRoster: SessionRosterItem[] = [
      { sessionId: "channel:feishu:ffffffffffffffff", channel: "feishu", chatId: "oc_x", chatType: "private", senderName: "小明" },
    ];
    const sessions = buildPrivateSessions({ personKey: "feishu:ou_x", memories: [], sessions: feishuRoster });
    expect(sessions.size).toBe(0);
  });
});

/**
 * `selectChatHistoryVectorIds` —— **D2** 的判据（P3 §9.3c 第 17 条）。
 *
 * 覆盖三条规则 + 两条不许误伤：
 * ① 他的原话（`role=user` + 裸 senderId）→ 删
 * ② 她对他那句话的回复（**轮次配对**：同 `sessionId` + 同 `ts`）→ 删（正文里可能一个字都没提他）
 * ③ 她在他的域里点名提他 → 删
 * K 别人转述他的 user 条目 → **留**（§2.3）
 * ④ 别的域里的 assistant 条目 → **留**
 */
describe("selectChatHistoryVectorIds（D2）", () => {
  const GROUP = "channel:qq:group000000000000";
  const OTHER_GROUP = "channel:qq:group111111111111";
  const SCOPE = `solo:${GROUP}`;
  const scopes = new Set([SCOPE]);
  const ME_ID = "10001";

  const entry = (
    id: string,
    role: string,
    text: string,
    overrides: { sessionId?: string; ts?: number; scope?: string } = {},
  ) => ({
    id,
    text,
    metadata: {
      role,
      sessionId: overrides.sessionId ?? GROUP,
      ts: overrides.ts ?? 1000,
      scope: overrides.scope ?? SCOPE,
    },
  });

  it("① 他说的 → 删；K 类（别人转述他的）→ 留", () => {
    const ids = selectChatHistoryVectorIds({
      entries: [
        entry("his", "user", `[群聊发送者：小明 (${ME_ID})] 我最近在学 Rust`),
        entry("k-class", "user", "[群聊发送者：小红 (10002)] 小明最近在学 Rust"),
      ],
      senderId: ME_ID,
      knownNames: ["小明"],
      speakingScopes: scopes,
    });
    expect(ids).toEqual(["his"]);
  });

  it("② 轮次配对：她对他那句话的回复被删，哪怕正文里没提他", () => {
    const ids = selectChatHistoryVectorIds({
      entries: [
        entry("his", "user", `[群聊发送者：小明 (${ME_ID})] 我最近在学做菜`, { ts: 500 }),
        entry("her-reply", "assistant", "学做菜好呀！以后搬去杭州就能自己开小灶啦♪", { ts: 500 }),
        // 同一条回复，但 ts 与他的 turn 不同 → 不是对他说的，且正文不提他 → 留
        entry("her-reply-other", "assistant", "今天天气不错呀♪", { ts: 501 }),
      ],
      senderId: ME_ID,
      knownNames: ["小明"],
      speakingScopes: scopes,
    });
    expect(ids.sort()).toEqual(["her-reply", "his"]);
  });

  it("③ 她在他的域里点名提他 → 删", () => {
    const ids = selectChatHistoryVectorIds({
      entries: [entry("named", "assistant", "小明下个月要去杭州啦？", { ts: 900 })],
      senderId: ME_ID,
      knownNames: ["小明"],
      speakingScopes: scopes,
    });
    expect(ids).toEqual(["named"]);
  });

  it("④ 不许越界：别的域里的 assistant 条目一条都不动", () => {
    const ids = selectChatHistoryVectorIds({
      entries: [
        entry("other-scope", "assistant", "小明在这别的群", { scope: `solo:${OTHER_GROUP}` }),
        // 没有 scope 的老条目（P2 之前写入的）：拿不到域就不认，宁可留给人工残留清单
        { id: "no-scope", text: "小明没有域", metadata: { role: "assistant", sessionId: GROUP, ts: 7 } },
      ],
      senderId: ME_ID,
      knownNames: ["小明"],
      speakingScopes: scopes,
    });
    expect(ids).toEqual([]);
  });

  it("别名集合为空时：只删他的原话（assistant 条目一条不动）", () => {
    const ids = selectChatHistoryVectorIds({
      entries: [
        entry("his", "user", `[…] (${ME_ID}) x`, { ts: 1 }),
        entry("her-reply", "assistant", "与任何人无关", { ts: 1 }),
        entry("named", "assistant", "小明真棒", { ts: 2 }),
      ],
      senderId: ME_ID,
      knownNames: [],
      speakingScopes: scopes,
    });
    // 轮次配对不受别名集合影响（他的 turn 是结构化判定的），所以 her-reply 仍会被删
    expect(ids.sort()).toEqual(["her-reply", "his"]);
  });
});
