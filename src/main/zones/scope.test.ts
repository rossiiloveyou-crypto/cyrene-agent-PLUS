import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const electronMock = vi.hoisted(() => ({ userDataDir: "" }));

vi.mock("electron", () => ({
  app: { getPath: () => electronMock.userDataDir },
}));

import { ZoneStore, _resetZoneStoreForTest } from "./zone-store";
import {
  isChannelSessionId,
  resolveScopeId,
  rootScope,
  shouldInjectOwnerProfile,
  shouldObserveGroupMessages,
  soloScope,
  zoneScope,
} from "./scope";
import type { ZoneExternalMember } from "./types";

const GROUP_SESSION = "channel:qq:aaaaaaaaaaaaaaaa";
const PRIVATE_SESSION = "channel:qq:bbbbbbbbbbbbbbbb";

function external(sessionId: string, chatType: "private" | "group"): ZoneExternalMember {
  return {
    kind: "external",
    sessionId,
    channel: "qq",
    chatId: sessionId.slice(-4),
    chatType,
  };
}

describe("zones scope resolver", () => {
  let store: ZoneStore;

  beforeEach(() => {
    electronMock.userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "zone-scope-"));
    store = new ZoneStore();
    _resetZoneStoreForTest(store);
  });

  it("classifies channel session ids", () => {
    expect(isChannelSessionId(GROUP_SESSION)).toBe(true);
    expect(isChannelSessionId("7cd48f93-b31b-436c-a1e7-f975ae7fd597")).toBe(false);
    expect(isChannelSessionId(undefined)).toBe(false);
  });

  it("maps desktop conversations and missing ids to root", () => {
    expect(resolveScopeId("7cd48f93-b31b-436c-a1e7-f975ae7fd597")).toBe(rootScope());
    expect(resolveScopeId(undefined)).toBe(rootScope());
    expect(resolveScopeId(null)).toBe(rootScope());
    expect(resolveScopeId("")).toBe(rootScope());
  });

  it("maps an external session outside every zone to its solo scope", () => {
    expect(resolveScopeId(GROUP_SESSION)).toBe(soloScope(GROUP_SESSION));
  });

  it("maps an external session inside a zone to that zone's scope", () => {
    const zone = store.createZone({ name: "A" });
    store.addExternalMember(zone.zoneId, external(GROUP_SESSION, "group"));
    expect(resolveScopeId(GROUP_SESSION)).toBe(zoneScope(zone.zoneId));
  });

  it("keeps desktop conversations in root even when a zone holds desktop members", () => {
    const zone = store.createZone({ name: "A" });
    // 直接写入 desktop 成员（绕过 addExternalMember 的 external-only 校验）
    store.addExternalMember(zone.zoneId, external(GROUP_SESSION, "group"));
    expect(resolveScopeId("some-desktop-conversation")).toBe(rootScope());
  });

  it("injects the owner profile only in root (and per-zone opt-in)", () => {
    expect(shouldInjectOwnerProfile(rootScope())).toBe(true);
    expect(shouldInjectOwnerProfile(soloScope(GROUP_SESSION))).toBe(false);

    const zone = store.createZone({ name: "A" });
    expect(shouldInjectOwnerProfile(zoneScope(zone.zoneId))).toBe(false);
    store.updateZoneConfig(zone.zoneId, { injectOwnerProfile: true });
    expect(shouldInjectOwnerProfile(zoneScope(zone.zoneId))).toBe(true);

    // 未知区块不注入
    expect(shouldInjectOwnerProfile(zoneScope("zone_gone"))).toBe(false);
  });

  it("defaults group observation to on and honours the zone switch", () => {
    expect(shouldObserveGroupMessages(null)).toBe(true);
    expect(shouldObserveGroupMessages("zone_missing")).toBe(true);
    const zone = store.createZone({ name: "A" });
    expect(shouldObserveGroupMessages(zone.zoneId)).toBe(true);
    store.updateZoneConfig(zone.zoneId, { observeGroupMessages: false });
    expect(shouldObserveGroupMessages(zone.zoneId)).toBe(false);
  });

  it("relocates a session's scope when it moves between zones", () => {
    const a = store.createZone({ name: "A" });
    const b = store.createZone({ name: "B" });
    store.addExternalMember(a.zoneId, external(PRIVATE_SESSION, "private"));
    expect(resolveScopeId(PRIVATE_SESSION)).toBe(zoneScope(a.zoneId));
    store.addExternalMember(b.zoneId, external(PRIVATE_SESSION, "private"));
    expect(resolveScopeId(PRIVATE_SESSION)).toBe(zoneScope(b.zoneId));
    store.removeMember(b.zoneId, external(PRIVATE_SESSION, "private"));
    expect(resolveScopeId(PRIVATE_SESSION)).toBe(soloScope(PRIVATE_SESSION));
  });

  it("survives a home directory without zones.json", () => {
    fs.rmSync(path.join(electronMock.userDataDir, "zones.json"), { force: true });
    _resetZoneStoreForTest(null);
    expect(resolveScopeId(GROUP_SESSION)).toBe(soloScope(GROUP_SESSION));
    expect(resolveScopeId("desktop-conv")).toBe(rootScope());
  });
});
