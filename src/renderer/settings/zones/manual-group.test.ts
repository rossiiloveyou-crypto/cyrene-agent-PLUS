// 「手动加群」的渲染侧纯逻辑：渠道清单、输入校验、提示文案映射、显示名回退。
//
// 这里最关键的一条是「UI 清单必须覆盖共享规则里的全部渠道」——
// 共享规则加渠道而 UI 忘了加，用户就会永远看不到那个渠道的入口。

import { describe, expect, it } from "vitest";
import { MANUAL_GROUP_CHANNELS } from "../../../shared/zone-group";
import {
  MANUAL_GROUP_CHANNEL_OPTIONS, checkManualGroupInput, manualGroupAddedKey,
  manualGroupErrorKey, missingManualGroupChannelOptions, resolveMemberDisplayName,
} from "./manual-group";

describe("MANUAL_GROUP_CHANNEL_OPTIONS", () => {
  it("覆盖共享规则里的全部渠道（顺序即展示顺序）", () => {
    expect(missingManualGroupChannelOptions()).toEqual([]);
    expect(MANUAL_GROUP_CHANNEL_OPTIONS.map((option) => option.channel)).toEqual([...MANUAL_GROUP_CHANNELS]);
  });

  it("每个渠道的 i18n key 都挂在 zones.manualGroup 下且各不相同", () => {
    const keys = MANUAL_GROUP_CHANNEL_OPTIONS.flatMap((option) => [
      option.labelKey, option.noteKey, option.messageKey, option.placeholderKey,
    ]);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(key.startsWith("settings.panel.zones.manualGroup.")).toBe(true);
  });
});

describe("checkManualGroupInput", () => {
  it("合法群号规范化后放行", () => {
    expect(checkManualGroupInput("qq", "123456789")).toEqual({ ok: true, chatId: "123456789" });
    expect(checkManualGroupInput("qq", "  123456789  ")).toEqual({ ok: true, chatId: "123456789" });
  });

  it("空输入与格式错误分别给不同原因（提示文案不一样）", () => {
    expect(checkManualGroupInput("qq", "")).toEqual({ ok: false, reason: "empty" });
    expect(checkManualGroupInput("qq", "   ")).toEqual({ ok: false, reason: "empty" });
    expect(checkManualGroupInput("qq", "12345a")).toEqual({ ok: false, reason: "format" });
    expect(checkManualGroupInput("qq", "1234")).toEqual({ ok: false, reason: "format" });
    // 与主进程同一份规则：qqbot 不认纯数字群号
    expect(checkManualGroupInput("qqbot", "123456789")).toEqual({ ok: false, reason: "format" });
  });

  it("qqbot 接受 openid", () => {
    const openid = "A1B2C3D4E5F6A7B8C9D0E1F2A3B4C5D6";
    expect(checkManualGroupInput("qqbot", openid)).toEqual({ ok: true, chatId: openid });
  });
});

describe("提示文案映射", () => {
  it("错误原因映射到不同 i18n key", () => {
    expect(manualGroupErrorKey("empty")).not.toBe(manualGroupErrorKey("format"));
    for (const key of [manualGroupErrorKey("empty"), manualGroupErrorKey("format")]) {
      expect(key.startsWith("settings.panel.zones.manualGroup.")).toBe(true);
    }
  });

  it("从别的区块移过来时用带来源的文案", () => {
    expect(manualGroupAddedKey(null)).toBe("settings.panel.zones.manualGroup.added");
    expect(manualGroupAddedKey(undefined)).toBe("settings.panel.zones.manualGroup.added");
    expect(manualGroupAddedKey({ zoneId: "zone_a", zoneName: "家人群" }))
      .toBe("settings.panel.zones.manualGroup.addedMoved");
  });
});

describe("resolveMemberDisplayName", () => {
  it("成员自带名字优先", () => {
    expect(resolveMemberDisplayName({ chatId: "123456", senderName: "家族群" }, "渠道群名")).toBe("家族群");
  });

  it("手动加的群一开始只有群号，渠道后来补齐群名时自动用上", () => {
    expect(resolveMemberDisplayName({ chatId: "123456" }, "家族群")).toBe("家族群");
    expect(resolveMemberDisplayName({ chatId: "123456" })).toBe("123456");
    expect(resolveMemberDisplayName({ chatId: "123456" }, "")).toBe("123456");
  });
});
