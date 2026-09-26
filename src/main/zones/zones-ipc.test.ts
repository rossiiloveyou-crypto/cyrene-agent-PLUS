// 区块 IPC 的输入清洗：渲染进程是不可信输入源，任何字段都可能缺失或被构造。
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const electronMock = vi.hoisted(() => ({ userDataDir: "" }));

vi.mock("electron", () => ({
  app: { getPath: () => electronMock.userDataDir },
}));

import { IPC } from "../../shared/ipc-channels";
import { _resetZoneStoreForTest, ZoneStore, getZoneStore } from "./zone-store";
import { buildManualGroupMember, registerZonesIpc, sanitizeZoneMember } from "./zones-ipc";
import { isGroupInAnyZone, resolveScopeId } from "./scope";

type Handler = (event: unknown, payload: unknown) => unknown;

function createFakeIpc(): { handlers: Map<string, Handler>; ipc: never } {
  const handlers = new Map<string, Handler>();
  const ipc = {
    handle: (channel: string, handler: Handler) => { handlers.set(channel, handler); },
    on: vi.fn(),
    dispose: vi.fn(),
  };
  return { handlers, ipc: ipc as never };
}

describe("sanitizeZoneMember", () => {
  it("accepts a well-formed external member", () => {
    expect(sanitizeZoneMember({
      kind: "external",
      sessionId: "channel:qq:abc",
      channel: "qq",
      chatId: "123456",
      chatType: "group",
      senderName: "测试群",
    })).toEqual({
      kind: "external",
      sessionId: "channel:qq:abc",
      channel: "qq",
      chatId: "123456",
      chatType: "group",
      senderName: "测试群",
    });
  });

  it("rejects sessions that are not channel ids", () => {
    expect(sanitizeZoneMember({
      kind: "external",
      sessionId: "conv-1",
      channel: "qq",
      chatId: "1",
      chatType: "group",
    })).toBeNull();
  });

  it("rejects a missing or unknown chatType", () => {
    expect(sanitizeZoneMember({
      kind: "external",
      sessionId: "channel:qq:abc",
      channel: "qq",
      chatId: "1",
      chatType: "channel",
    })).toBeNull();
  });

  it("rejects blank and over-long identifiers", () => {
    expect(sanitizeZoneMember({
      kind: "external",
      sessionId: "channel:qq:abc",
      channel: "  ",
      chatId: "1",
      chatType: "group",
    })).toBeNull();
    expect(sanitizeZoneMember({
      kind: "external",
      sessionId: `channel:qq:${"x".repeat(500)}`,
      channel: "qq",
      chatId: "1",
      chatType: "group",
    })).toBeNull();
  });

  it("accepts a desktop member and rejects unknown kinds", () => {
    expect(sanitizeZoneMember({ kind: "desktop", conversationId: "conv-1" }))
      .toEqual({ kind: "desktop", conversationId: "conv-1" });
    expect(sanitizeZoneMember({ kind: "desktop" })).toBeNull();
    expect(sanitizeZoneMember({ kind: "root" })).toBeNull();
    expect(sanitizeZoneMember(null)).toBeNull();
    expect(sanitizeZoneMember("nope")).toBeNull();
  });
});

describe("buildManualGroupMember", () => {
  it("按渠道推导出与 Dispatcher 一致的 sessionId", () => {
    // makeSessionId("qq", "123456789") = channel:qq:<sha256("qq:123456789") 前 16 位>
    const member = buildManualGroupMember({ channel: "qq", chatId: "123456789" });
    expect(member).toMatchObject({
      kind: "external",
      channel: "qq",
      chatId: "123456789",
      chatType: "group",
    });
    expect(member?.sessionId).toMatch(/^channel:qq:[0-9a-f]{16}$/);
    // 同一个群永远算同一个 id（后续群消息才会落进同一个记忆域）
    expect(buildManualGroupMember({ channel: "qq", chatId: "123456789" })?.sessionId).toBe(member?.sessionId);
    expect(buildManualGroupMember({ channel: "qq", chatId: "123456790" })?.sessionId).not.toBe(member?.sessionId);
  });

  it("渠道与群标识必须同时合法", () => {
    expect(buildManualGroupMember({ channel: "wechat", chatId: "123456789" })).toBeNull();
    expect(buildManualGroupMember({ channel: "qq", chatId: "abc" })).toBeNull();
    expect(buildManualGroupMember({ channel: "qq", chatId: "" })).toBeNull();
    expect(buildManualGroupMember({ channel: "qq" })).toBeNull();
    expect(buildManualGroupMember(null)).toBeNull();
  });

  it("带上可选的展示名，非法展示名直接丢掉", () => {
    expect(buildManualGroupMember({ channel: "qq", chatId: "123456789", senderName: " 家族群 " })?.senderName)
      .toBe("家族群");
    expect(buildManualGroupMember({ channel: "qq", chatId: "123456789", senderName: "   " })?.senderName)
      .toBeUndefined();
  });
});

describe("zones IPC handlers", () => {
  let handlers: Map<string, Handler>;

  beforeEach(() => {
    electronMock.userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "zones-ipc-"));
    _resetZoneStoreForTest(new ZoneStore(path.join(electronMock.userDataDir, "zones.json")));
    const fake = createFakeIpc();
    handlers = fake.handlers;
    registerZonesIpc({ ipc: fake.ipc });
  });

  it("always ships a root zone in the snapshot", () => {
    const snapshot = handlers.get(IPC.ZONES_LIST)?.({}, undefined) as { zones: Array<{ isRoot: boolean }> };
    expect(snapshot.zones).toHaveLength(1);
    expect(snapshot.zones[0].isRoot).toBe(true);
  });

  it("creates, renames and deletes a zone", () => {
    const created = handlers.get(IPC.ZONES_CREATE)?.({}, { name: "工作" }) as { zoneId: string; zoneName: string };
    expect(created.zoneName).toBe("工作");

    const renamed = handlers.get(IPC.ZONES_RENAME)?.({}, { zoneId: created.zoneId, name: "工作 2" }) as { zoneName: string };
    expect(renamed.zoneName).toBe("工作 2");

    expect(handlers.get(IPC.ZONES_DELETE)?.({}, { zoneId: created.zoneId })).toBe(true);
    expect(getZoneStore().listZones()).toHaveLength(1);
  });

  it("refuses to delete root", () => {
    expect(handlers.get(IPC.ZONES_DELETE)?.({}, { zoneId: "root" })).toBe(false);
  });

  it("reports a friendly error when root already has a private mapping", () => {
    const add = handlers.get(IPC.ZONES_ADD_MEMBER) as Handler;
    const privateMember = (chatId: string) => ({
      kind: "external",
      sessionId: `channel:qq:${chatId}`,
      channel: "qq",
      chatId,
      chatType: "private",
    });

    expect(add({}, { zoneId: "root", member: privateMember("10001") })).toMatchObject({ ok: true });
    const second = add({}, { zoneId: "root", member: privateMember("10002") });
    expect(second).toMatchObject({ ok: false });
    expect((second as { error: string }).error).toContain("只能有一个私聊");
  });

  it("rejects invalid members before they reach the store", () => {
    const result = handlers.get(IPC.ZONES_ADD_MEMBER)?.({}, { zoneId: "root", member: { kind: "external" } });
    expect(result).toMatchObject({ ok: false, error: "成员信息无效" });
  });

  it("moves members in batch and reports errors", () => {
    const zone = handlers.get(IPC.ZONES_CREATE)?.({}, { name: "A" }) as { zoneId: string };
    const member = {
      kind: "external",
      sessionId: "channel:qq:g1",
      channel: "qq",
      chatId: "111",
      chatType: "group",
    };
    const result = handlers.get(IPC.ZONES_MOVE_MEMBERS)?.({}, { targetZoneId: zone.zoneId, members: [member] });
    expect(result).toEqual({ moved: 1, errors: [] });
    expect(getZoneStore().getZone(zone.zoneId)?.members).toHaveLength(1);

    const bad = handlers.get(IPC.ZONES_MOVE_MEMBERS)?.({}, { targetZoneId: "zone_missing", members: [member] });
    expect(bad).toMatchObject({ moved: 0 });
    expect((bad as { errors: string[] }).errors).toHaveLength(1);
  });

  it("removes a member from a zone", () => {
    const zone = handlers.get(IPC.ZONES_CREATE)?.({}, { name: "A" }) as { zoneId: string };
    const member = {
      kind: "external",
      sessionId: "channel:qq:g1",
      channel: "qq",
      chatId: "111",
      chatType: "group",
    };
    handlers.get(IPC.ZONES_ADD_MEMBER)?.({}, { zoneId: zone.zoneId, member });
    const removed = handlers.get(IPC.ZONES_REMOVE_MEMBER)?.({}, { zoneId: zone.zoneId, member }) as { ok: boolean };
    expect(removed.ok).toBe(true);
    expect(getZoneStore().getZone(zone.zoneId)?.members).toHaveLength(0);
  });

  it("手动加群：把全新的群加进区块，并立刻变成群白名单", () => {
    const zone = handlers.get(IPC.ZONES_CREATE)?.({}, { name: "家人群" }) as { zoneId: string };
    const add = handlers.get(IPC.ZONES_ADD_MANUAL_GROUP) as Handler;

    // 这个群从没跟昔涟说过话：externalChats 里没有它，加白前也不在任何区块
    expect(isGroupInAnyZone("qq", "123456789")).toBe(false);

    const result = add({}, { zoneId: zone.zoneId, channel: "qq", chatId: "123456789" });
    expect(result).toMatchObject({ ok: true, movedFrom: null });
    const member = getZoneStore().getZone(zone.zoneId)?.members[0];
    expect(member).toMatchObject({ kind: "external", channel: "qq", chatId: "123456789", chatType: "group" });

    // 加白生效：adapter 的 isGroupAllowed 走的就是这个判定
    expect(isGroupInAnyZone("qq", "123456789")).toBe(true);
    // 记忆域也跟着定下来：群里后续发言（Dispatcher 用同一个 sessionId）落进该区块
    const sessionId = (result as { sessionId: string }).sessionId;
    expect(resolveScopeId(sessionId)).toBe(`zone:${zone.zoneId}`);
    expect(getZoneStore().findZoneBySessionId(sessionId)?.zoneId).toBe(zone.zoneId);
  });

  it("手动加群：同一个群重复加是幂等的", () => {
    const zone = handlers.get(IPC.ZONES_CREATE)?.({}, { name: "A" }) as { zoneId: string };
    const add = handlers.get(IPC.ZONES_ADD_MANUAL_GROUP) as Handler;
    add({}, { zoneId: zone.zoneId, channel: "qq", chatId: "123456789" });
    const again = add({}, { zoneId: zone.zoneId, channel: "qq", chatId: " 123456789 " });
    expect(again).toMatchObject({ ok: true });
    expect(getZoneStore().getZone(zone.zoneId)?.members).toHaveLength(1);
  });

  it("手动加群：群原本在别的区块时报告 movedFrom（一个群只能属于一个区块）", () => {
    const first = handlers.get(IPC.ZONES_CREATE)?.({}, { name: "旧区块" }) as { zoneId: string };
    const second = handlers.get(IPC.ZONES_CREATE)?.({}, { name: "新区块" }) as { zoneId: string };
    const add = handlers.get(IPC.ZONES_ADD_MANUAL_GROUP) as Handler;

    add({}, { zoneId: first.zoneId, channel: "qq", chatId: "123456789" });
    // root 也走同一条路径：root 的 zoneName 在 UI 里固定显示 desktop
    const toRoot = add({}, { zoneId: "root", channel: "qq", chatId: "123456789" });
    expect(toRoot).toMatchObject({ ok: true, movedFrom: { zoneId: first.zoneId, zoneName: "旧区块" } });
    expect(getZoneStore().getZone(first.zoneId)?.members).toHaveLength(0);

    const moved = add({}, { zoneId: second.zoneId, channel: "qq", chatId: "123456789" });
    expect(moved).toMatchObject({ ok: true, movedFrom: { zoneId: "root", zoneName: "desktop" } });
    expect(getZoneStore().getZone(second.zoneId)?.members).toHaveLength(1);
  });

  it("手动加群：渠道 / 群标识 / 区块任一不合法都被拦下", () => {
    const zone = handlers.get(IPC.ZONES_CREATE)?.({}, { name: "A" }) as { zoneId: string };
    const add = handlers.get(IPC.ZONES_ADD_MANUAL_GROUP) as Handler;

    // 微信没有群白名单概念：不给它开后门
    expect(add({}, { zoneId: zone.zoneId, channel: "wechat", chatId: "123456789" })).toMatchObject({ ok: false });
    expect(add({}, { zoneId: zone.zoneId, channel: "qq", chatId: "abc" })).toMatchObject({ ok: false });
    // qqbot 只认 openid：群号填进来是死配置，当场拒绝
    expect(add({}, { zoneId: zone.zoneId, channel: "qqbot", chatId: "123456789" })).toMatchObject({ ok: false });
    expect(add({}, { zoneId: zone.zoneId, channel: "qq", chatId: "123456789", }) ).toMatchObject({ ok: true });
    expect(add({}, { zoneId: "zone_missing", channel: "qq", chatId: "987654321" })).toMatchObject({ ok: false, error: "区块不存在" });
    expect(add({}, { zoneId: "", channel: "qq", chatId: "987654321" })).toMatchObject({ ok: false });
    expect(add({}, undefined)).toMatchObject({ ok: false });
    // 任何一次失败都不该往 zones.json 里写脏数据
    expect(getZoneStore().getZone(zone.zoneId)?.members.map((m) => m.kind === "external" ? m.chatId : m.conversationId))
      .toEqual(["123456789"]);
  });

  it("手动加群：qqbot 渠道用 openid 建立成员", () => {
    const zone = handlers.get(IPC.ZONES_CREATE)?.({}, { name: "A" }) as { zoneId: string };
    const openid = "A1B2C3D4E5F6A7B8C9D0E1F2A3B4C5D6";
    const result = handlers.get(IPC.ZONES_ADD_MANUAL_GROUP)?.({}, { zoneId: zone.zoneId, channel: "qqbot", chatId: openid });
    expect(result).toMatchObject({ ok: true });
    expect(isGroupInAnyZone("qqbot", openid)).toBe(true);
    // 渠道隔离：同一个字符串在 qq 渠道不算加白
    expect(isGroupInAnyZone("qq", openid)).toBe(false);
  });

  it("updates the observe switch but never disables the root profile (privacy default stays)", () => {
    const zone = handlers.get(IPC.ZONES_CREATE)?.({}, { name: "A" }) as { zoneId: string };
    const updated = handlers.get(IPC.ZONES_UPDATE_CONFIG)?.({}, {
      zoneId: zone.zoneId,
      patch: { observeGroupMessages: false, injectOwnerProfile: true },
    }) as { config: { observeGroupMessages: boolean; injectOwnerProfile: boolean } };
    expect(updated.config).toEqual({ observeGroupMessages: false, injectOwnerProfile: true });

    const root = handlers.get(IPC.ZONES_UPDATE_CONFIG)?.({}, {
      zoneId: "root",
      patch: { injectOwnerProfile: false },
    }) as { config: { injectOwnerProfile: boolean } };
    expect(root.config.injectOwnerProfile).toBe(true);
  });
});
