import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const electronMock = vi.hoisted(() => ({ userDataDir: "" }));

vi.mock("electron", () => ({
  app: { getPath: () => electronMock.userDataDir },
}));

import { ZoneStore, createRootZone } from "./zone-store";
import type { ZoneExternalMember } from "./types";

function external(overrides: Partial<ZoneExternalMember> = {}): ZoneExternalMember {
  return {
    kind: "external",
    sessionId: "channel:qq:aaaaaaaaaaaaaaaa",
    channel: "qq",
    chatId: "123456",
    chatType: "group",
    ...overrides,
  };
}

describe("ZoneStore", () => {
  let store: ZoneStore;

  beforeEach(() => {
    electronMock.userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "zone-store-"));
    store = new ZoneStore();
  });

  it("starts with exactly one root zone named desktop", () => {
    const zones = store.listZones();
    expect(zones).toHaveLength(1);
    expect(zones[0].isRoot).toBe(true);
    expect(zones[0].zoneId).toBe("root");
    expect(zones[0].zoneName).toBe("desktop");
    expect(zones[0].config.injectOwnerProfile).toBe(true);
  });

  it("persists zones to zones.json and reloads them", () => {
    const created = store.createZone({ name: "工作项目组" });
    store.addExternalMember(created.zoneId, external());

    const reloaded = new ZoneStore();
    const zones = reloaded.listZones();
    expect(zones).toHaveLength(2);
    const work = zones.find((z) => !z.isRoot);
    expect(work?.zoneName).toBe("工作项目组");
    expect(work?.members).toHaveLength(1);
  });

  it("rebuilds the store when root is missing or duplicated", () => {
    const file = path.join(electronMock.userDataDir, "zones.json");
    fs.writeFileSync(file, JSON.stringify({ version: 1, zones: [] }), "utf8");
    const rebuilt = new ZoneStore();
    expect(rebuilt.listZones()).toHaveLength(1);
    expect(rebuilt.getRootZone().isRoot).toBe(true);

    fs.writeFileSync(
      file,
      JSON.stringify({ version: 1, zones: [createRootZone(), createRootZone()] }),
      "utf8",
    );
    expect(new ZoneStore().listZones()).toHaveLength(1);
  });

  it("falls back to an empty root zone on malformed JSON", () => {
    fs.writeFileSync(path.join(electronMock.userDataDir, "zones.json"), "{ not json", "utf8");
    expect(new ZoneStore().listZones()).toHaveLength(1);
  });

  it("refuses to delete or rename the root zone", () => {
    expect(store.deleteZone("root")).toBe(false);
    expect(store.listZones()).toHaveLength(1);

    const renamed = store.renameZone("root", "我的桌面");
    expect(renamed?.zoneName).toBe("desktop");
  });

  it("deletes a custom zone and its members become standalone", () => {
    const zone = store.createZone({ name: "临时" });
    store.addExternalMember(zone.zoneId, external());
    expect(store.deleteZone(zone.zoneId)).toBe(true);
    expect(store.listZones()).toHaveLength(1);
    expect(store.findZoneBySessionId("channel:qq:aaaaaaaaaaaaaaaa")).toBeNull();
  });

  it("allows at most one private chat in root", () => {
    const root = store.getRootZone();
    store.addExternalMember(
      root.zoneId,
      external({ sessionId: "channel:qq:p1", chatId: "10001", chatType: "private" }),
    );
    expect(() =>
      store.addExternalMember(
        root.zoneId,
        external({ sessionId: "channel:qq:p2", chatId: "10002", chatType: "private" }),
      ),
    ).toThrow(/只能有一个私聊/);

    // 失败的加入不能把已有成员挤掉
    const after = store.getRootZone();
    expect(after.members).toHaveLength(1);
    expect(after.members[0].kind === "external" && after.members[0].chatId).toBe("10001");
  });

  it("treats re-adding the same member to the same zone as a no-op", () => {
    const root = store.getRootZone();
    const member = external({ sessionId: "channel:qq:p1", chatId: "10001", chatType: "private" });
    store.addExternalMember(root.zoneId, member);
    expect(() => store.addExternalMember(root.zoneId, member)).not.toThrow();
    expect(store.getRootZone().members).toHaveLength(1);
  });

  it("moves a member out of its previous zone when added elsewhere", () => {
    const root = store.getRootZone();
    const zoneA = store.createZone({ name: "A" });
    const zoneB = store.createZone({ name: "B" });
    const member = external();

    store.addExternalMember(root.zoneId, member);
    store.addExternalMember(zoneA.zoneId, member);
    expect(store.getRootZone().members).toHaveLength(0);
    expect(store.getZone(zoneA.zoneId)?.members).toHaveLength(1);

    store.addExternalMember(zoneB.zoneId, member);
    expect(store.getZone(zoneA.zoneId)?.members).toHaveLength(0);
    expect(store.getZone(zoneB.zoneId)?.members).toHaveLength(1);
    expect(store.findZoneBySessionId(member.sessionId)?.zoneId).toBe(zoneB.zoneId);
  });

  it("rejects desktop members added through the external path", () => {
    const zone = store.createZone({ name: "A" });
    expect(() =>
      store.addExternalMember(zone.zoneId, { kind: "desktop", conversationId: "c1" }),
    ).toThrow(/only external/);
  });

  it("batch-moves members and reports per-member errors", () => {
    const zone = store.createZone({ name: "A" });
    const members: ZoneExternalMember[] = [
      external({ sessionId: "channel:qq:g1", chatId: "1" }),
      external({ sessionId: "channel:qq:g2", chatId: "2" }),
    ];
    expect(store.moveMembers(zone.zoneId, members)).toEqual({ moved: 2, errors: [] });
    expect(store.getZone(zone.zoneId)?.members).toHaveLength(2);

    const missing = store.moveMembers("zone_missing", members);
    expect(missing.moved).toBe(0);
    expect(missing.errors).toHaveLength(2);
  });

  it("reports allowed group keys by channel", () => {
    const zone = store.createZone({ name: "A" });
    store.addExternalMember(zone.zoneId, external({ sessionId: "channel:qq:g1", chatId: "111" }));
    store.addExternalMember(
      zone.zoneId,
      external({ sessionId: "channel:qq:p1", chatId: "222", chatType: "private" }),
    );
    const keys = store.listAllowedGroupKeys();
    expect(keys.has("qq:111")).toBe(true);
    expect(keys.has("qq:222")).toBe(false);
    expect(store.listAllowedSessionIds().size).toBe(2);
  });

  it("removes a member by key", () => {
    const zone = store.createZone({ name: "A" });
    const member = external();
    store.addExternalMember(zone.zoneId, member);
    const updated = store.removeMember(zone.zoneId, member);
    expect(updated?.members).toHaveLength(0);
  });

  it("keeps root injectOwnerProfile enabled even when patched off", () => {
    const updated = store.updateZoneConfig("root", { injectOwnerProfile: false });
    expect(updated?.config.injectOwnerProfile).toBe(true);
  });

  it("normalizes invalid zone names to a fallback", () => {
    const blank = store.createZone({ name: "   " });
    expect(blank.zoneName.length).toBeGreaterThan(0);
    const tooLong = store.createZone({ name: "x".repeat(65) });
    expect(tooLong.zoneName.length).toBeGreaterThan(0);
    expect(tooLong.zoneName).not.toBe("x".repeat(65));
  });

  it("returns clones so callers cannot mutate internal state", () => {
    const zone = store.createZone({ name: "A" });
    zone.members.push(external());
    zone.config.injectOwnerProfile = true;
    expect(store.getZone(zone.zoneId)?.members).toHaveLength(0);
  });
});
