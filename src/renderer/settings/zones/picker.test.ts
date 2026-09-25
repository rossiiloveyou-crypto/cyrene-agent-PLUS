// 记忆区块成员选择器（纯逻辑）：
// 关键不变量是「选择器永远不提供桌面对话」——desktop 成员只属于 root，
// 而 root 已经自动包含全部桌面对话，一旦这里放出桌面对话，UI 就会诱导用户
// 往自定义区块里塞 desktop 成员，被主进程拒绝。

import { describe, expect, it } from "vitest";
import { collectMemberPickEntries, pickEntryToMember, zoneMemberKey } from "./picker";
import type { ZonesSnapshot } from "../shared/types";

function makeSnapshot(over: Partial<ZonesSnapshot> = {}): ZonesSnapshot {
  return {
    zones: [
      {
        zoneId: "root",
        zoneName: "desktop",
        isRoot: true,
        createdAt: 1,
        members: [{ kind: "external", sessionId: "channel:qq:priv", channel: "qq", chatId: "10001", chatType: "private", senderName: "小明" }],
        config: { observeGroupMessages: true, injectOwnerProfile: true },
      },
      {
        zoneId: "zone_a",
        zoneName: "家人群",
        isRoot: false,
        createdAt: 2,
        members: [{ kind: "external", sessionId: "channel:qq:group", channel: "qq", chatId: "20001", chatType: "group", senderName: "家族群" }],
        config: { observeGroupMessages: true, injectOwnerProfile: false },
      },
    ],
    externalChats: [
      { sessionId: "channel:qq:priv", channel: "qq", chatId: "10001", chatType: "private", senderName: "小明", lastAt: 20 },
      { sessionId: "channel:qq:group", channel: "qq", chatId: "20001", chatType: "group", senderName: "家族群", lastAt: 10 },
      { sessionId: "channel:qq:fresh", channel: "qq", chatId: "30003", chatType: "group", lastAt: 30 },
    ],
    conversations: [{ id: "conv1", title: "和昔涟的对话", mode: "chat", updatedAt: 5 }],
    ...over,
  };
}

describe("zoneMemberKey", () => {
  it("桌面成员与外部成员使用不同前缀", () => {
    expect(zoneMemberKey({ kind: "desktop", conversationId: "conv1" })).toBe("desktop:conv1");
    expect(zoneMemberKey({ kind: "external", sessionId: "channel:qq:group", channel: "qq", chatId: "20001", chatType: "group" }))
      .toBe("external:channel:qq:group");
  });
});

describe("collectMemberPickEntries", () => {
  it("自定义区块的选择器不含任何桌面对话", () => {
    const entries = collectMemberPickEntries(makeSnapshot(), "zone_a");
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.key.startsWith("external:")).toBe(true);
      expect(entry.key).not.toContain("conv1");
      expect(entry.label).not.toContain("和昔涟的对话");
      expect(entry.note).not.toContain("和昔涟的对话");
    }
  });

  it("root 区块的选择器同样只列外部会话（桌面对话自动包含，不需要手动加）", () => {
    const entries = collectMemberPickEntries(makeSnapshot(), "root");
    expect(entries.every((entry) => entry.key.startsWith("external:"))).toBe(true);
    expect(entries.some((entry) => entry.key === "desktop:conv1")).toBe(false);
  });

  it("已在目标区块里的成员置灰", () => {
    const entries = collectMemberPickEntries(makeSnapshot(), "zone_a");
    const existing = entries.find((entry) => entry.key === "external:channel:qq:group");
    expect(existing?.disabled).toBe(true);
    const other = entries.find((entry) => entry.key === "external:channel:qq:fresh");
    expect(other?.disabled).toBe(false);
  });

  it("已在别的区块的成员标注来源区块（后端会自动把它从旧区块移出）", () => {
    const entries = collectMemberPickEntries(makeSnapshot(), "zone_a");
    const fromRoot = entries.find((entry) => entry.key === "external:channel:qq:priv");
    expect(fromRoot?.note).toContain("已在「desktop」");
  });

  it("没有昵称时用 chatId 兜底，并把渠道与类型写进说明", () => {
    const entries = collectMemberPickEntries(makeSnapshot(), "zone_a");
    const fresh = entries.find((entry) => entry.key === "external:channel:qq:fresh");
    expect(fresh?.label).toBe("30003");
    expect(fresh?.note).toContain("qq");
    expect(fresh?.note).toContain("群聊");
  });
});

describe("pickEntryToMember", () => {
  it("从 externalChats 还原可提交的成员对象", () => {
    const member = pickEntryToMember(makeSnapshot(), "external:channel:qq:fresh");
    expect(member).toEqual({
      kind: "external",
      sessionId: "channel:qq:fresh",
      channel: "qq",
      chatId: "30003",
      chatType: "group",
    });
  });

  it("聊天已不在 externalChats 里时，从区块成员里兜底（批量移动会用到）", () => {
    const snapshot = makeSnapshot({ externalChats: [] });
    const member = pickEntryToMember(snapshot, "external:channel:qq:group");
    expect(member?.chatId).toBe("20001");
    expect(member?.senderName).toBe("家族群");
  });

  it("桌面 key 与未知 key 都返回 null（不构造 desktop 成员）", () => {
    expect(pickEntryToMember(makeSnapshot(), "desktop:conv1")).toBeNull();
    expect(pickEntryToMember(makeSnapshot(), "external:channel:qq:missing")).toBeNull();
  });
});
