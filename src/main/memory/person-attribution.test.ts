import { describe, expect, it } from "vitest";
import {
  attributeCandidates,
  buildPersonKey,
  buildSpeakerRoster,
  channelFromSessionId,
  resolveSubjectIds,
  unionOf,
} from "./person-attribution";
import type { MemoryCandidate, MemoryJudgeTurn } from "./memory-types";

/** 构造一个 L2 候选；归属字段默认不填，由被测函数注入。 */
function candidate(overrides: Partial<MemoryCandidate> = {}): MemoryCandidate {
  return {
    layer: "L2",
    content: "小明最近在学 Rust",
    confidence: 0.9,
    triggerText: "我最近在学 Rust",
    ...overrides,
  };
}

function turn(overrides: Partial<MemoryJudgeTurn> = {}): MemoryJudgeTurn {
  return {
    userInput: "我最近在学 Rust",
    assistantReply: "好厉害呀",
    ...overrides,
  };
}

describe("buildPersonKey", () => {
  it("组合 <channel>:<senderId>", () => {
    expect(buildPersonKey("qq", "10001")).toBe("qq:10001");
    expect(buildPersonKey("wechat", "wxid_abc")).toBe("wechat:wxid_abc");
  });

  it("带 channel 前缀是为了跨渠道不撞车：QQ 与微信的同号不是同一个人", () => {
    expect(buildPersonKey("qq", "10001")).not.toBe(buildPersonKey("wechat", "10001"));
  });
});

describe("channelFromSessionId", () => {
  it("从渠道 sessionId 解析渠道前缀", () => {
    expect(channelFromSessionId("channel:qq:ab12cd34")).toBe("qq");
    expect(channelFromSessionId("channel:telegram:0123456789abcdef")).toBe("telegram");
  });

  it("桌面对话 id / 空值返回 null", () => {
    expect(channelFromSessionId("desktop-1")).toBeNull();
    expect(channelFromSessionId("c9a20793-0000-4000-8000-000000000000")).toBeNull();
    expect(channelFromSessionId(undefined)).toBeNull();
    expect(channelFromSessionId(null)).toBeNull();
    expect(channelFromSessionId("")).toBeNull();
  });

  it("只截到第一段：渠道名里不可能再有冒号，hash 部分照原样忽略", () => {
    expect(channelFromSessionId("channel:qq:")).toBe("qq");
  });
});

describe("buildSpeakerRoster", () => {
  it("按昵称建名册，all 保序去重", () => {
    const roster = buildSpeakerRoster([
      turn({ personKey: "qq:10001", speakerName: "小明" }),
      turn({ personKey: "qq:10002", speakerName: "小红" }),
      turn({ personKey: "qq:10001", speakerName: "小明" }),
    ]);

    expect(roster.byName.get("小明")).toBe("qq:10001");
    expect(roster.byName.get("小红")).toBe("qq:10002");
    expect(roster.byName.size).toBe(2);
    expect(roster.all).toEqual(["qq:10001", "qq:10002"]);
  });

  it("无归属的 turn（桌面路径）不进名册", () => {
    const roster = buildSpeakerRoster([turn(), turn({ personKey: "qq:10001", speakerName: "小明" })]);

    expect(roster.all).toEqual(["qq:10001"]);
    expect(roster.byName.size).toBe(1);
  });

  it("昵称缺失时只进 all、不进 byName（避免空串被当成可匹配的名字）", () => {
    const roster = buildSpeakerRoster([turn({ personKey: "qq:10001" })]);

    expect(roster.all).toEqual(["qq:10001"]);
    expect(roster.byName.size).toBe(0);
    expect(roster.byName.has("")).toBe(false);
  });
});

describe("resolveSubjectIds", () => {
  const roster = buildSpeakerRoster([
    turn({ personKey: "qq:10001", speakerName: "小明" }),
    turn({ personKey: "qq:10002", speakerName: "小红" }),
  ]);

  it("名册命中的名字映射成 personKey", () => {
    expect(resolveSubjectIds(["小明"], roster)).toEqual(["qq:10001"]);
    expect(resolveSubjectIds(["小红", "小明"], roster)).toEqual(["qq:10002", "qq:10001"]);
  });

  it("⚠️ 不做子串匹配：小明 ≠ 小明明", () => {
    const onlyMingming = buildSpeakerRoster([
      turn({ personKey: "qq:99999", speakerName: "小明明" }),
    ]);

    expect(resolveSubjectIds(["小明"], onlyMingming)).toEqual([]);
    // 反向也一样：名册里只有"小明"时，"小明明"不该命中
    expect(resolveSubjectIds(["小明明"], roster)).toEqual([]);
  });

  it("忽略首尾空白后再精确匹配", () => {
    expect(resolveSubjectIds([" 小明 "], roster)).toEqual(["qq:10001"]);
    expect(resolveSubjectIds(["\t小红\n"], roster)).toEqual(["qq:10002"]);
  });

  it("undefined / 空数组 / 空白项 → []", () => {
    expect(resolveSubjectIds(undefined, roster)).toEqual([]);
    expect(resolveSubjectIds([], roster)).toEqual([]);
    expect(resolveSubjectIds(["   "], roster)).toEqual([]);
    expect(resolveSubjectIds(["查无此人"], roster)).toEqual([]);
  });

  it("重复名字去重，映射不上的项被丢弃", () => {
    expect(resolveSubjectIds(["小明", "小明", "查无此人"], roster)).toEqual(["qq:10001"]);
  });
});

describe("unionOf", () => {
  it("去重、保序、忽略 undefined", () => {
    expect(unionOf([["a", "b"], undefined, ["b", "c"]])).toEqual(["a", "b", "c"]);
  });

  it("全部 undefined → []", () => {
    expect(unionOf([undefined, undefined])).toEqual([]);
    expect(unionOf([])).toEqual([]);
  });

  it("忽略空串与纯空白项", () => {
    expect(unionOf([["a", "", "  "], ["b"]])).toEqual(["a", "b"]);
  });
});

describe("attributeCandidates", () => {
  it("说话人 ≠ 主体：小红说「小明在学 Rust」，小明不在本批名册里", () => {
    // 群里只有小红说过话 —— ⚠️ 这**不构成**单人会话，绝不能兜底成「关于小红」
    const turns = [
      turn({ personKey: "qq:10002", speakerName: "小红", messageId: "msg_2", chatType: "group" }),
    ];
    const [attributed] = attributeCandidates(
      [candidate({ subjectNames: ["小明"], sourceTurnIndexes: [1] })],
      turns,
    );

    // speakerIds 是小红（谁说的），subjectIds 为空（小明不在名册 → 丢弃，不猜）
    expect(attributed.speakerIds).toEqual(["qq:10002"]);
    expect(attributed.subjectIds).toBeUndefined();
    expect(attributed.sourceMessageIds).toEqual(["msg_2"]);
  });

  it("⚠️ 群聊单人发言不触发兜底（公共记忆不能被误标成「关于他」）", () => {
    const turns = [
      turn({ personKey: "qq:10001", speakerName: "小明", messageId: "msg_1", chatType: "group" }),
    ];
    const [attributed] = attributeCandidates([candidate({ subjectNames: [] })], turns);

    expect(attributed.speakerIds).toEqual(["qq:10001"]);
    expect(attributed.subjectIds).toBeUndefined();
  });

  it("名册里有小明时，主体的归属正确落到小明身上", () => {
    const turns = [
      turn({ personKey: "qq:10001", speakerName: "小明", messageId: "msg_1", chatType: "group" }),
      turn({ personKey: "qq:10002", speakerName: "小红", messageId: "msg_2", chatType: "group" }),
    ];
    const [attributed] = attributeCandidates(
      [candidate({ subjectNames: ["小明"], sourceTurnIndexes: [2] })],
      turns,
    );

    expect(attributed.speakerIds).toEqual(["qq:10002"]);
    expect(attributed.subjectIds).toEqual(["qq:10001"]);
    expect(attributed.sourceMessageIds).toEqual(["msg_2"]);
  });

  it("sourceTurnIndexes 定位到具体轮次，取该轮的 messageId 与 personKey", () => {
    const turns = [
      turn({ personKey: "qq:10001", speakerName: "小明", messageId: "msg_1" }),
      turn({ personKey: "qq:10002", speakerName: "小红", messageId: "msg_2" }),
      turn({ personKey: "qq:10001", speakerName: "小明", messageId: "msg_3" }),
    ];
    const [attributed] = attributeCandidates(
      [candidate({ subjectNames: ["小明"], sourceTurnIndexes: [3] })],
      turns,
    );

    expect(attributed.sourceMessageIds).toEqual(["msg_3"]);
    expect(attributed.speakerIds).toEqual(["qq:10001"]);
  });

  it("多轮综合：sourceTurnIndexes 指向多轮时取并集", () => {
    const turns = [
      turn({ personKey: "qq:10001", speakerName: "小明", messageId: "msg_1" }),
      turn({ personKey: "qq:10002", speakerName: "小红", messageId: "msg_2" }),
    ];
    const [attributed] = attributeCandidates(
      [candidate({ subjectNames: ["小明"], sourceTurnIndexes: [1, 2] })],
      turns,
    );

    expect(attributed.speakerIds).toEqual(["qq:10001", "qq:10002"]);
    expect(attributed.sourceMessageIds).toEqual(["msg_1", "msg_2"]);
  });

  it("sourceTurnIndexes 越界项被忽略，其余项照常生效", () => {
    const turns = [turn({ personKey: "qq:10001", speakerName: "小明", messageId: "msg_1" })];
    const [attributed] = attributeCandidates(
      [candidate({ subjectNames: ["小明"], sourceTurnIndexes: [1, 99, 0, -1] })],
      turns,
    );

    expect(attributed.sourceMessageIds).toEqual(["msg_1"]);
  });

  it("sourceTurnIndexes 缺失或全无效 → 退化为整批（指向一批好过没有指针）", () => {
    const turns = [
      turn({ personKey: "qq:10001", speakerName: "小明", messageId: "msg_1" }),
      turn({ personKey: "qq:10002", speakerName: "小红", messageId: "msg_2" }),
    ];

    for (const indexes of [undefined, [], [99], [0], [-3]]) {
      const [attributed] = attributeCandidates(
        [candidate({ subjectNames: ["小明"], ...(indexes ? { sourceTurnIndexes: indexes } : {}) })],
        turns,
      );
      expect(attributed.sourceMessageIds).toEqual(["msg_1", "msg_2"]);
      expect(attributed.speakerIds).toEqual(["qq:10001", "qq:10002"]);
    }
  });

  it("单人会话兜底：私聊里映射不上人名时，主体退化为该会话唯一的人", () => {
    // 私聊：名册只有对端；senderName 可能缺失
    const turns = [turn({ personKey: "qq:10001", messageId: "msg_1", chatType: "private" })];
    const [attributed] = attributeCandidates(
      [candidate({ subjectNames: [], sourceTurnIndexes: [1] })],
      turns,
    );

    expect(attributed.speakerIds).toEqual(["qq:10001"]);
    expect(attributed.subjectIds).toEqual(["qq:10001"]);
  });

  it("兜底判据只看 chatType：私聊里 senderName 缺失、LLM 说不出人名也能兜住", () => {
    const turns = [
      turn({ personKey: "qq:10001", chatType: "private", messageId: "msg_1" }),
      turn({ personKey: "qq:10001", chatType: "private", messageId: "msg_2" }),
    ];
    const [attributed] = attributeCandidates(
      [candidate({ subjectNames: ["用户"], sourceTurnIndexes: [2] })],
      turns,
    );

    // 「用户」这类泛指不在名册 → 映射失败 → 落到私聊兜底
    expect(attributed.subjectIds).toEqual(["qq:10001"]);
  });

  it("无 chatType（老调用方 / 桌面）不兜底，退化为 P1 行为", () => {
    const turns = [turn({ personKey: "qq:10001", messageId: "msg_1" })];
    const [attributed] = attributeCandidates([candidate({ subjectNames: [] })], turns);

    expect(attributed.speakerIds).toEqual(["qq:10001"]);
    expect(attributed.subjectIds).toBeUndefined();
  });

  it("私聊里出现两个说话人（异常数据）时不兜底 —— 宁可不标也不能标错人", () => {
    const turns = [
      turn({ personKey: "qq:10001", chatType: "private", messageId: "msg_1" }),
      turn({ personKey: "qq:10002", chatType: "private", messageId: "msg_2" }),
    ];
    const [attributed] = attributeCandidates([candidate({ subjectNames: [] })], turns);

    expect(attributed.subjectIds).toBeUndefined();
  });

  it("单人会话里 LLM 说了具体人名也照常映射（兜底不覆盖映射结果）", () => {
    const turns = [
      turn({ personKey: "qq:10001", speakerName: "小明", messageId: "msg_1", chatType: "private" }),
    ];
    const [attributed] = attributeCandidates(
      [candidate({ subjectNames: ["小明"], sourceTurnIndexes: [1] })],
      turns,
    );

    expect(attributed.subjectIds).toEqual(["qq:10001"]);
  });

  it("群聊（多人）映射失败 → subjectIds 留空，视为公共记忆", () => {
    const turns = [
      turn({ personKey: "qq:10001", speakerName: "小明", messageId: "msg_1", chatType: "group" }),
      turn({ personKey: "qq:10002", speakerName: "小红", messageId: "msg_2", chatType: "group" }),
    ];
    const [attributed] = attributeCandidates(
      [candidate({ subjectNames: ["查无此人"], sourceTurnIndexes: [1] })],
      turns,
    );

    expect(attributed.speakerIds).toEqual(["qq:10001"]);
    expect(attributed.subjectIds).toBeUndefined();
  });

  it("桌面路径（无 personKey）：完全退化为 P1 行为，不新增任何字段", () => {
    const [attributed] = attributeCandidates([candidate()], [turn()]);

    expect(attributed.speakerIds).toBeUndefined();
    expect(attributed.subjectIds).toBeUndefined();
    expect(attributed.sourceMessageIds).toBeUndefined();
  });

  it("纯项目进展（subjectNames 为空 + 群聊）不写 subjectIds 字段", () => {
    const turns = [
      turn({ personKey: "qq:10001", speakerName: "小明", messageId: "msg_1", chatType: "group" }),
      turn({ personKey: "qq:10002", speakerName: "小红", messageId: "msg_2", chatType: "group" }),
    ];
    const [attributed] = attributeCandidates(
      [candidate({ subjectNames: [], sourceTurnIndexes: [1] })],
      turns,
    );

    expect(attributed.subjectIds).toBeUndefined();
    expect("subjectIds" in attributed).toBe(false);
  });

  it("不修改入参（纯函数）", () => {
    const input = candidate({ subjectNames: ["小明"], sourceTurnIndexes: [1] });
    const turns = [turn({ personKey: "qq:10001", speakerName: "小明", messageId: "msg_1" })];

    attributeCandidates([input], turns);

    expect(input.speakerIds).toBeUndefined();
    expect(input.subjectIds).toBeUndefined();
    expect(input.sourceMessageIds).toBeUndefined();
  });

  it("保留上游已注入的归属，解析结果为空时不抹掉", () => {
    const [attributed] = attributeCandidates(
      [candidate({ speakerIds: ["qq:77777"], sourceMessageIds: ["msg_upstream"] })],
      [turn()],
    );

    expect(attributed.speakerIds).toEqual(["qq:77777"]);
    expect(attributed.sourceMessageIds).toEqual(["msg_upstream"]);
  });

  it("批量候选各自独立归属（一条关于小明、一条作为公共记忆）", () => {
    const turns = [
      turn({ personKey: "qq:10001", speakerName: "小明", messageId: "msg_1", chatType: "group" }),
      turn({ personKey: "qq:10002", speakerName: "小红", messageId: "msg_2", chatType: "group" }),
    ];
    const attributed = attributeCandidates(
      [
        candidate({ subjectNames: ["小明"], sourceTurnIndexes: [1] }),
        candidate({ subjectNames: [], sourceTurnIndexes: [2] }),
      ],
      turns,
    );

    expect(attributed[0].subjectIds).toEqual(["qq:10001"]);
    expect(attributed[0].speakerIds).toEqual(["qq:10001"]);
    expect(attributed[1].subjectIds).toBeUndefined();
    expect(attributed[1].speakerIds).toEqual(["qq:10002"]);
  });

  it("空候选列表 → 空数组", () => {
    expect(attributeCandidates([], [turn({ personKey: "qq:10001" })])).toEqual([]);
  });

  it("空 turns → 只保留候选自身字段", () => {
    const [attributed] = attributeCandidates([candidate({ subjectNames: ["小明"] })], []);

    expect(attributed.speakerIds).toBeUndefined();
    expect(attributed.subjectIds).toBeUndefined();
    expect(attributed.sourceMessageIds).toBeUndefined();
  });
});
