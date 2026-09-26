// 「加入区块 = 加入群白名单」的端到端守卫。
//
// 这是本轮修复的核心不变量：群白名单输入框从「连接手机」移除之后，区块成员关系成了
// 唯一的加白途径；如果这条接线断了，用户就会看到"群加进区块了但昔涟在群里根本不回话"。
// 所以这里不复刻接线，而是直接调用生产代码用的那两个策略函数
// （qqGroupPolicyOptions / qqBotGroupPolicyOptions），把
//   手动加群 IPC → zones.json 成员 → adapter 放行判定
// 整条链路串起来断言。

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const electronMock = vi.hoisted(() => ({ userDataDir: "" }));

vi.mock("electron", () => ({
  app: { getPath: () => electronMock.userDataDir },
}));

import { IPC } from "../../shared/ipc-channels";
import { classifyQqEvent, qqGroupPolicyOptions } from "../channels/adapters/qq/napcat-adapter";
import { isQqBotEventAllowed, qqBotGroupPolicyOptions } from "../channels/adapters/qqbot/qqbot-adapter";
import type { QqBotChannelConfig, QqChannelConfig } from "../channels/settings-store";
import { DEFAULT_TOOL_ACCESS, type ChannelToolAccessConfig } from "../channels/tool-access";
import { ZoneStore, _resetZoneStoreForTest } from "./zone-store";
import { registerZonesIpc } from "./zones-ipc";

type Handler = (event: unknown, payload: unknown) => unknown;

/** 只填与群白名单分支有关的字段（本文件不验证配置结构本身）。 */
const QQ_CONFIG = {
  allowedGroupIds: [],
  groupRequireMention: true,
} as QqChannelConfig;

const QQBOT_CONFIG = {
  allowAnyPrivate: false,
  allowedUserOpenids: [],
  allowedGroupOpenids: [],
} as QqBotChannelConfig;

/**
 * 关掉「群员发言限制」：本文件只验证**群白名单**分支，
 * 账号级权限（谁能在群里叫动昔涟）由 napcat-adapter.test.ts 负责。
 */
const OPEN_ACCESS: ChannelToolAccessConfig = { ...DEFAULT_TOOL_ACCESS, groupMemberGate: false };

/** 群里 @ 昔涟的一条消息（OneBot 形态）。 */
function groupMentionEvent(groupId: string) {
  return {
    message_type: "group" as const,
    user_id: "10001",
    group_id: groupId,
    message: [{ type: "at", data: { qq: "99999" } }, { type: "text", data: { text: " 在吗" } }],
  };
}

describe("群白名单接线：区块成员关系是唯一途径", () => {
  let handlers: Map<string, Handler>;
  let addManualGroup: Handler;

  beforeEach(() => {
    electronMock.userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "zone-whitelist-"));
    _resetZoneStoreForTest(new ZoneStore(path.join(electronMock.userDataDir, "zones.json")));
    handlers = new Map();
    registerZonesIpc({
      ipc: {
        handle: (channel: string, handler: Handler) => { handlers.set(channel, handler); },
        on: vi.fn(),
        dispose: vi.fn(),
      } as never,
    });
    addManualGroup = handlers.get(IPC.ZONES_ADD_MANUAL_GROUP) as Handler;
  });

  it("QQ：没加白的群 @ 昔涟 → drop；手动加进区块后 → respond", () => {
    const groupId = "123456789";
    // 未加白：群里 @ 了昔涟也算"未授权请求"（allowlist=true 会留痕）
    const before = classifyQqEvent(groupMentionEvent(groupId), QQ_CONFIG, "99999", [], OPEN_ACCESS, qqGroupPolicyOptions());
    expect(before).toMatchObject({ action: "drop", allowlist: true });

    const zone = handlers.get(IPC.ZONES_CREATE)?.({}, { name: "家人群" }) as { zoneId: string };
    expect(addManualGroup({}, { zoneId: zone.zoneId, channel: "qq", chatId: groupId })).toMatchObject({ ok: true });

    // 加白生效：adapter 侧不再拦截
    expect(classifyQqEvent(groupMentionEvent(groupId), QQ_CONFIG, "99999", [], OPEN_ACCESS, qqGroupPolicyOptions()))
      .toMatchObject({ action: "respond" });
    // 别的群不受影响（白名单是逐个群号的，不是"开了就全放行"）
    expect(classifyQqEvent(groupMentionEvent("987654321"), QQ_CONFIG, "99999", [], OPEN_ACCESS, qqGroupPolicyOptions()))
      .toMatchObject({ action: "drop" });
  });

  it("QQ：区块关掉「旁听群消息」后，白名单群里的闲聊被丢弃而不是旁听", () => {
    const groupId = "123456789";
    const zone = handlers.get(IPC.ZONES_CREATE)?.({}, { name: "家人群" }) as { zoneId: string };
    addManualGroup({}, { zoneId: zone.zoneId, channel: "qq", chatId: groupId });

    const chatter = {
      message_type: "group" as const,
      user_id: "10001",
      group_id: groupId,
      message: [{ type: "text", data: { text: "今天吃什么" } }],
    };
    expect(classifyQqEvent(chatter, QQ_CONFIG, "99999", [], OPEN_ACCESS, qqGroupPolicyOptions()))
      .toMatchObject({ action: "observe" });

    handlers.get(IPC.ZONES_UPDATE_CONFIG)?.({}, { zoneId: zone.zoneId, patch: { observeGroupMessages: false } });
    expect(classifyQqEvent(chatter, QQ_CONFIG, "99999", [], OPEN_ACCESS, qqGroupPolicyOptions()))
      .toMatchObject({ action: "drop", allowlist: false });
  });

  it("QQ 官方机器人：群 openid 手动加白后放行，且不与 qq 渠道串台", () => {
    const openid = "A1B2C3D4E5F6A7B8C9D0E1F2A3B4C5D6";
    expect(isQqBotEventAllowed({ chatType: "group", senderId: "u1", chatId: openid }, QQBOT_CONFIG, qqBotGroupPolicyOptions()))
      .toBe(false);

    const zone = handlers.get(IPC.ZONES_CREATE)?.({}, { name: "官方群" }) as { zoneId: string };
    addManualGroup({}, { zoneId: zone.zoneId, channel: "qqbot", chatId: openid });

    expect(isQqBotEventAllowed({ chatType: "group", senderId: "u1", chatId: openid }, QQBOT_CONFIG, qqBotGroupPolicyOptions()))
      .toBe(true);
    // 同一个标识在 qq 渠道不算加白：渠道必须一致
    expect(classifyQqEvent(groupMentionEvent(openid), QQ_CONFIG, "99999", [], OPEN_ACCESS, qqGroupPolicyOptions()))
      .toMatchObject({ action: "drop" });
  });

  it("旧配置 allowedGroupIds 仍然兼容：区块里没有也能放行", () => {
    const legacy = { ...QQ_CONFIG, allowedGroupIds: ["55555"] } as QqChannelConfig;
    expect(classifyQqEvent(groupMentionEvent("55555"), legacy, "99999", [], OPEN_ACCESS, qqGroupPolicyOptions()))
      .toMatchObject({ action: "respond" });
  });
});
