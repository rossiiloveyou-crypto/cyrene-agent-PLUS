// 手动加群的共享校验规则。
//
// 这套规则同时被渲染进程（输入框即时提示）和主进程（写进 zones.json 前的最后一道闸）
// 使用，所以这里是**契约测试**：任何放宽/收紧都会同时改变两侧行为。

import { describe, expect, it } from "vitest";
import {
  MANUAL_GROUP_CHANNELS,
  isManualGroupChannel,
  normalizeManualGroupChatId,
  normalizeManualGroupName,
} from "./zone-group";

describe("MANUAL_GROUP_CHANNELS", () => {
  it("只包含群访问由区块成员决定的渠道", () => {
    // qq / qqbot 是仅有的两个「加入区块 = 加入群白名单」渠道；
    // 微信与飞书没有群白名单，列进来会误导用户以为"加了就能用"
    expect([...MANUAL_GROUP_CHANNELS]).toEqual(["qq", "qqbot"]);
  });

  it("isManualGroupChannel 只认清单内的渠道", () => {
    expect(isManualGroupChannel("qq")).toBe(true);
    expect(isManualGroupChannel("qqbot")).toBe(true);
    expect(isManualGroupChannel("wechat")).toBe(false);
    expect(isManualGroupChannel("feishu")).toBe(false);
    expect(isManualGroupChannel("QQ")).toBe(false);
    expect(isManualGroupChannel("")).toBe(false);
    expect(isManualGroupChannel(undefined)).toBe(false);
    expect(isManualGroupChannel(42)).toBe(false);
  });
});

describe("normalizeManualGroupChatId - qq", () => {
  it("接受常见群号并去掉首尾空白", () => {
    expect(normalizeManualGroupChatId("qq", "123456789")).toBe("123456789");
    expect(normalizeManualGroupChatId("qq", "  123456  ")).toBe("123456");
    expect(normalizeManualGroupChatId("qq", "123456789012")).toBe("123456789012");
  });

  it("拒绝过短、过长与非数字", () => {
    expect(normalizeManualGroupChatId("qq", "1234")).toBeNull();
    expect(normalizeManualGroupChatId("qq", "1234567890123")).toBeNull();
    expect(normalizeManualGroupChatId("qq", "12345a")).toBeNull();
    expect(normalizeManualGroupChatId("qq", "-123456")).toBeNull();
    expect(normalizeManualGroupChatId("qq", "群号")).toBeNull();
    expect(normalizeManualGroupChatId("qq", "")).toBeNull();
    expect(normalizeManualGroupChatId("qq", "   ")).toBeNull();
  });

  it("拒绝非字符串输入（渲染进程永远是不可信输入源）", () => {
    expect(normalizeManualGroupChatId("qq", 123456)).toBeNull();
    expect(normalizeManualGroupChatId("qq", null)).toBeNull();
    expect(normalizeManualGroupChatId("qq", { toString: () => "123456" })).toBeNull();
  });

  it("拒绝超过长度上限的输入", () => {
    expect(normalizeManualGroupChatId("qq", "1".repeat(65))).toBeNull();
    expect(normalizeManualGroupChatId("qqbot", "A".repeat(65))).toBeNull();
  });
});

describe("normalizeManualGroupChatId - qqbot", () => {
  it("接受群 openid（字母数字，大小写与下划线连字符都行）", () => {
    const openid = "A1B2C3D4E5F6A7B8C9D0E1F2A3B4C5D6";
    expect(normalizeManualGroupChatId("qqbot", openid)).toBe(openid);
    expect(normalizeManualGroupChatId("qqbot", "abc_DEF-123")).toBe("abc_DEF-123");
    // 去掉首尾空白（用户从控制台复制时经常带上空格）
    expect(normalizeManualGroupChatId("qqbot", "  A1B2C3D4E5F6A7B8  ")).toBe("A1B2C3D4E5F6A7B8");
  });

  it("拒绝群号形态的纯数字短串（那是 qq 渠道的输入，走错渠道要拦下来）", () => {
    // 群号填进 qqbot 不会报错但永远匹配不上任何群 → 等于死配置，必须当场拒绝
    expect(normalizeManualGroupChatId("qqbot", "123456789")).toBeNull();
    expect(normalizeManualGroupChatId("qqbot", "12345")).toBeNull();
    expect(normalizeManualGroupChatId("qqbot", "1234567890123456")).toBeNull();
    // 32 位 token 即便恰好全是数字也放行（不会被"像群号"规则误伤）
    expect(normalizeManualGroupChatId("qqbot", "1".repeat(32))).toBe("1".repeat(32));
  });

  it("拒绝空白与特殊字符", () => {
    expect(normalizeManualGroupChatId("qqbot", "")).toBeNull();
    expect(normalizeManualGroupChatId("qqbot", "has space")).toBeNull();
    expect(normalizeManualGroupChatId("qqbot", "open/id")).toBeNull();
  });

  it("长数字串是合法 openid 形态（不能误判成群号）", () => {
    expect(normalizeManualGroupChatId("qqbot", "12345678901234567")).toBe("12345678901234567");
  });
});

describe("normalizeManualGroupChatId - 未知渠道", () => {
  it("渠道不在清单里一律返回 null（不给其他渠道开后门）", () => {
    for (const channel of ["wechat", "feishu", "", "QQ", "telegram"]) {
      expect(normalizeManualGroupChatId(channel, "123456789")).toBeNull();
      expect(normalizeManualGroupChatId(channel, "A1B2C3D4E5")).toBeNull();
    }
  });
});

describe("normalizeManualGroupName", () => {
  it("可选，非法输入退化为 undefined 而不是脏数据", () => {
    expect(normalizeManualGroupName("家族群")).toBe("家族群");
    expect(normalizeManualGroupName("  家族群  ")).toBe("家族群");
    expect(normalizeManualGroupName("")).toBeUndefined();
    expect(normalizeManualGroupName("   ")).toBeUndefined();
    expect(normalizeManualGroupName(undefined)).toBeUndefined();
    expect(normalizeManualGroupName(123)).toBeUndefined();
  });

  it("截断到 128 字符", () => {
    expect(normalizeManualGroupName("x".repeat(300))).toHaveLength(128);
  });
});
