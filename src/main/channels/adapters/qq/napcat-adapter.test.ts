import * as os from "node:os";
import { describe, expect, it, vi } from "vitest";
import type { QqChannelConfig } from "../../settings-store";
import type { ChannelToolAccessConfig } from "../../tool-access";
import { isQqEventAllowed, classifyQqEvent, splitQqText } from "./napcat-adapter";

vi.mock("electron", () => ({ app: { getPath: () => os.tmpdir() } }));

const config: QqChannelConfig = {
  enabled: true,
  listenMode: "loopback",
  port: 6200,
  allowedGroupIds: ["2000"],
  groupRequireMention: true,
  groupReplyStyle: "reply-and-mention",
  groupMemoryPolicy: "shared-personal",
};

/** 1000 = 只给了私聊权限；1001 = 只给了群聊权限 */
const access: ChannelToolAccessConfig = {
  groupMemberGate: true,
  toolGate: true,
  entries: [
    { channel: "qq", userId: "1000", addedAt: 1, permissions: { private: true, group: false, tool: false } },
    { channel: "qq", userId: "1001", addedAt: 1, permissions: { private: false, group: true, tool: true } },
  ],
};

const atBot = [{ type: "at" as const, data: { qq: "9000" } }];
const chatter = [{ type: "text" as const, data: { text: "闲聊" } }];

describe("NapCatAdapter policy helpers", () => {
  it("私聊必须在该账号勾了「私聊」权限时才放行", () => {
    expect(isQqEventAllowed({ message_type: "private", user_id: "1000", message: [] }, config, "9000", [], access)).toBe(true);
    // 1001 在名单里，但没有私聊权限
    expect(isQqEventAllowed({ message_type: "private", user_id: "1001", message: [] }, config, "9000", [], access)).toBe(false);
    // 1002 根本不在名单里
    expect(isQqEventAllowed({ message_type: "private", user_id: "1002", message: [] }, config, "9000", [], access)).toBe(false);
  });

  it("群聊需要：在叫昔涟 + 群号白名单 + 该账号勾了「群聊」权限", () => {
    // 未加白的群：纯闲聊不进处理链路
    expect(isQqEventAllowed({ message_type: "group", user_id: "1001", group_id: "9999", message: [] }, config, "9000", [], access)).toBe(false);
    // 白名单群里的旁听消息算 allowed（会写 transcript，但不起 run）
    expect(isQqEventAllowed({ message_type: "group", user_id: "1001", group_id: "2000", message: [] }, config, "9000", [], access)).toBe(true);
    expect(isQqEventAllowed({ message_type: "group", user_id: "1001", group_id: "2000", message: atBot }, config, "9000", [], access)).toBe(true);
    // 1000 在名单里，但没有群聊权限：@ 了昔涟也不放行
    expect(isQqEventAllowed({ message_type: "group", user_id: "1000", group_id: "2000", message: atBot }, config, "9000", [], access)).toBe(false);
    // 1002 不在名单里
    expect(isQqEventAllowed({ message_type: "group", user_id: "1002", group_id: "2000", message: atBot }, config, "9000", [], access)).toBe(false);

    // 群员发言限制关闭时，加白群里的任何人在 @ 机器人都能被通过
    const openAccess = { ...access, groupMemberGate: false };
    expect(isQqEventAllowed({ message_type: "group", user_id: "1002", group_id: "2000", message: atBot }, config, "9000", [], openAccess)).toBe(true);
  });

  it("classifyQqEvent：被权限挡下的消息带原因与触发方式（用于控制台拦截记录）", () => {
    expect(classifyQqEvent(
      { message_type: "private", user_id: "1002", message: [] },
      config,
      "9000",
      [],
      access,
    )).toEqual({
      action: "drop",
      reason: "qq 私聊用户 1002 不在白名单中",
      allowlist: true,
      trigger: "private",
    });

    // 在名单里但没勾私聊权限：原因要和"不在名单"区分开
    expect(classifyQqEvent(
      { message_type: "private", user_id: "1001", message: [] },
      config,
      "9000",
      [],
      access,
    )).toMatchObject({
      action: "drop",
      allowlist: true,
      trigger: "private",
      reason: expect.stringContaining("未授予私聊权限"),
    });

    // 群不在白名单：群里 @ 了昔涟才算"未授权请求"，要留痕
    expect(classifyQqEvent(
      {
        message_type: "group",
        user_id: "1001",
        group_id: "9999",
        message: [...atBot, { type: "text", data: { text: "在吗" } }],
      },
      config,
      "9000",
      [],
      access,
    )).toMatchObject({
      action: "drop",
      allowlist: true,
      trigger: "mention",
      reason: expect.stringContaining("不在群聊白名单中"),
    });

    // 白名单群里的成员没勾「群聊」权限：@ 了才留痕，原因与"不在名单"区分开
    expect(classifyQqEvent(
      { message_type: "group", user_id: "1000", group_id: "2000", message: atBot },
      config,
      "9000",
      [],
      access,
    )).toMatchObject({
      action: "drop",
      allowlist: true,
      trigger: "mention",
      reason: expect.stringContaining("未授予群聊权限"),
    });
  });

  it("白名单群里未 @ 也未命中触发词的消息走 observe（旁听），不记录拦截", () => {
    // 已授权成员的闲聊
    expect(classifyQqEvent(
      { message_type: "group", user_id: "1001", group_id: "2000", message: chatter },
      config,
      "9000",
      ["昔涟"],
      access,
    )).toEqual({ action: "observe" });

    // 未授权成员在白名单群里闲聊：同样是旁听（不起 run，也不留拦截记录）
    expect(classifyQqEvent(
      { message_type: "group", user_id: "1002", group_id: "2000", message: chatter },
      config,
      "9000",
      ["昔涟"],
      access,
    )).toEqual({ action: "observe" });
  });

  it("未加白的群不旁听：闲聊静默丢弃，@ 了昔涟才留痕", () => {
    expect(classifyQqEvent(
      { message_type: "group", user_id: "1001", group_id: "9999", message: chatter },
      config,
      "9000",
      ["昔涟"],
      access,
    )).toMatchObject({
      action: "drop",
      allowlist: false,
      reason: expect.stringContaining("不在群聊白名单中"),
    });

    expect(classifyQqEvent(
      { message_type: "group", user_id: "1001", group_id: "9999", message: atBot },
      config,
      "9000",
      ["昔涟"],
      access,
    )).toMatchObject({ action: "drop", allowlist: true, trigger: "mention" });
  });

  it("关闭「必须 @」后，白名单群的群消息仍按请求处理（未授权群照旧不记录）", () => {
    const noMention = { ...config, groupRequireMention: false };
    expect(classifyQqEvent(
      { message_type: "group", user_id: "1001", group_id: "2000", message: chatter },
      noMention,
      "9000",
      [],
      access,
    )).toEqual({ action: "respond", trigger: "mention" });
    // 未加白的群即使关了「必须 @」也只是路过，不写拦截记录（不然整群消息刷控制台）
    expect(classifyQqEvent(
      { message_type: "group", user_id: "1001", group_id: "9999", message: chatter },
      noMention,
      "9000",
      [],
      access,
    )).toMatchObject({ action: "drop", allowlist: false, reason: expect.stringContaining("不在群聊白名单中") });
    // 没加白却真的 @ 了昔涟：算未授权请求，要留痕
    expect(classifyQqEvent(
      { message_type: "group", user_id: "1001", group_id: "9999", message: atBot },
      noMention,
      "9000",
      [],
      access,
    )).toMatchObject({ action: "drop", allowlist: true, trigger: "mention" });
  });

  it("触发关键词让已授权的群员免 @ 触发，并标出触发方式", () => {
    const event = {
      message_type: "group" as const,
      user_id: "1001",
      group_id: "2000",
      message: [{ type: "text" as const, data: { text: "昔涟在吗，帮我看下" } }],
    };

    expect(classifyQqEvent(event, config, "9000", ["昔涟在吗"], access)).toEqual({
      action: "respond",
      trigger: "trigger_keyword",
    });
    // 没授权的成员即使命中触发词也不放行
    expect(classifyQqEvent({ ...event, user_id: "1002" }, config, "9000", ["昔涟在吗"], access))
      .toMatchObject({ action: "drop", allowlist: true, trigger: "trigger_keyword" });
    // @ 昔涟 仍然走 mention
    expect(classifyQqEvent({
      ...event,
      message: atBot,
    }, config, "9000", ["昔涟在吗"], access)).toEqual({ action: "respond", trigger: "mention" });
  });

  it("splits long Unicode text without breaking surrogate pairs", () => {
    const chunks = splitQqText(`${"昔".repeat(1499)}。${"🌸".repeat(10)}`);
    expect(chunks).toHaveLength(2);
    expect(Array.from(chunks[0])).toHaveLength(1500);
    expect(chunks.join("")).toBe(`${"昔".repeat(1499)}。${"🌸".repeat(10)}`);
  });
});
