import { describe, expect, it } from "vitest";
import {
  DEFAULT_TOOL_ACCESS,
  findAccessEntry,
  normalizeAccessPermissions,
  normalizeToolAccessConfig,
  resolveChannelMessageAccess,
  resolveChannelToolAccess,
  type ChannelAccessPermissions,
  type ChannelToolAccessConfig,
} from "./tool-access";

const perms = (over: Partial<ChannelAccessPermissions> = {}): ChannelAccessPermissions => ({
  private: false,
  group: true,
  tool: false,
  ...over,
});

const config = (over: Partial<ChannelToolAccessConfig> = {}): ChannelToolAccessConfig => ({
  groupMemberGate: true,
  toolGate: true,
  entries: [],
  ...over,
});

describe("normalizeToolAccessConfig", () => {
  it("缺失配置回落到默认值：两个总开关全开、名单为空", () => {
    expect(normalizeToolAccessConfig(undefined)).toEqual(DEFAULT_TOOL_ACCESS);
    expect(DEFAULT_TOOL_ACCESS).toMatchObject({ groupMemberGate: true, toolGate: true });
    expect(normalizeToolAccessConfig({ groupMemberGate: "yes", entries: "nope" })).toEqual({
      groupMemberGate: true,
      toolGate: true,
      entries: [],
    });
  });

  it("保留了显式关闭的总开关", () => {
    expect(normalizeToolAccessConfig({ groupMemberGate: false, toolGate: false }).entries).toEqual([]);
    const normalized = normalizeToolAccessConfig({ groupMemberGate: false, toolGate: false });
    expect(normalized.groupMemberGate).toBe(false);
    expect(normalized.toolGate).toBe(false);
  });

  it("去掉空白、按渠道+账号去重，并给缺失权限位的条目补默认权限", () => {
    const normalized = normalizeToolAccessConfig({
      entries: [
        { channel: "qq", userId: " 10001 ", label: " 阿岚 ", addedAt: 7, permissions: { private: true, group: false, tool: true } },
        { channel: "qq", userId: "10001", addedAt: 8 },
        { channel: "qqbot", userId: "   ", addedAt: 9 },
        { channel: "telegram", userId: "10002", addedAt: 10 },
        { channel: "wechat", userId: "wxid_a" },
      ],
    });

    expect(normalized.entries).toEqual([
      {
        channel: "qq",
        userId: "10001",
        label: "阿岚",
        addedAt: 7,
        permissions: { private: true, group: false, tool: true },
      },
      {
        channel: "wechat",
        userId: "wxid_a",
        addedAt: expect.any(Number),
        // 没有权限位的旧条目按「默认只给群聊」补齐
        permissions: { private: false, group: true, tool: false },
      },
    ]);
  });

  it("normalizeAccessPermissions 只接受布尔值", () => {
    expect(normalizeAccessPermissions(undefined)).toEqual(perms());
    expect(normalizeAccessPermissions({ private: "yes", group: false, tool: 1 })).toEqual({
      private: false,
      group: false,
      tool: false,
    });
  });
});

describe("resolveChannelMessageAccess", () => {
  const access = config({
    entries: [
      // 10001 = 只给了私聊权限；10002 = 只给了群聊权限
      { channel: "qq", userId: "10001", addedAt: 1, permissions: perms({ private: true, group: false }) },
      { channel: "qq", userId: "10002", addedAt: 1, permissions: perms({ private: false, group: true }) },
    ],
  });

  it("名单外的账号私聊一律拦截", () => {
    const decision = resolveChannelMessageAccess(access, { channel: "qq", chatType: "private", senderId: "99999" });
    expect(decision).toMatchObject({ guarded: true, blocked: true });
    expect(decision.reason).toContain("不在白名单中");
  });

  it("在名单里但没勾「私聊」权限时，拦截原因区分开", () => {
    const decision = resolveChannelMessageAccess(access, { channel: "qq", chatType: "private", senderId: "10002" });
    expect(decision).toMatchObject({ guarded: true, blocked: true });
    expect(decision.reason).toContain("未授予私聊权限");
  });

  it("勾了「私聊」权限才放行私聊", () => {
    const decision = resolveChannelMessageAccess(access, { channel: "qq", chatType: "private", senderId: "10001" });
    expect(decision).toMatchObject({ guarded: true, blocked: false });
    expect(decision.permissions?.private).toBe(true);
  });

  it("群员发言限制关闭时群聊不做任何检查", () => {
    expect(resolveChannelMessageAccess(config({ groupMemberGate: false }), {
      channel: "qq",
      chatType: "group",
      senderId: "99999",
    })).toEqual({ guarded: false, blocked: false });
  });

  it("群聊按「群聊」权限校验，私聊权限不影响群聊", () => {
    expect(resolveChannelMessageAccess(access, { channel: "qq", chatType: "group", senderId: "10001" }).blocked).toBe(true);
    expect(resolveChannelMessageAccess(access, { channel: "qq", chatType: "group", senderId: "10002" }).blocked).toBe(false);
  });});

describe("resolveChannelToolAccess", () => {
  const allowlisted = config({
    entries: [{ channel: "qq", userId: "10001", addedAt: 1, permissions: perms({ tool: true }) }],
  });

  it("工具拦截总开关关闭时不检查，也不记账", () => {
    expect(resolveChannelToolAccess(config({ toolGate: false }), {
      channel: "qq",
      chatType: "group",
      senderId: "99999",
    })).toEqual({ guarded: false, blocked: false });
  });

  it("名单外的调用者一律拦截", () => {
    const decision = resolveChannelToolAccess(allowlisted, { channel: "qq", chatType: "group", senderId: "99999" });
    expect(decision.guarded).toBe(true);
    expect(decision.blocked).toBe(true);
    expect(decision.reason).toContain("99999");
  });

  it("在名单里但没勾「工具」权限时，拦截原因是未授予工具权限", () => {
    const listedWithoutTool = config({
      entries: [{ channel: "qq", userId: "10002", addedAt: 1, permissions: perms({ tool: false }) }],
    });
    const decision = resolveChannelToolAccess(listedWithoutTool, { channel: "qq", chatType: "group", senderId: "10002" });
    expect(decision.blocked).toBe(true);
    expect(decision.reason).toContain("未授予工具权限");
  });

  it("勾了「工具」权限才放行（私聊群聊同口径）", () => {
    for (const chatType of ["group", "private"] as const) {
      const decision = resolveChannelToolAccess(allowlisted, { channel: "qq", chatType, senderId: "10001" });
      expect(decision).toMatchObject({ guarded: true, blocked: false });
      expect(decision.entry?.userId).toBe("10001");
    }
  });

  it("按渠道隔离名单", () => {
    const onlyQqBot = config({
      entries: [{ channel: "qqbot", userId: "10001", addedAt: 1, permissions: perms({ tool: true }) }],
    });
    expect(findAccessEntry(onlyQqBot.entries, { channel: "qq", senderId: "10001" })).toBeUndefined();
    expect(resolveChannelToolAccess(onlyQqBot, { channel: "qq", chatType: "group", senderId: "10001" }).blocked).toBe(true);
    expect(resolveChannelToolAccess(onlyQqBot, { channel: "qqbot", chatType: "group", senderId: "10001" }).blocked).toBe(false);
  });
});
