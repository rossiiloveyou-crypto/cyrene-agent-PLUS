import { describe, expect, it } from "vitest";
import {
  DEFAULT_CHAT_APPEARANCE,
  normalizeChatAppearance,
  normalizeUsageBadgeColor,
  resolveUsageBadgeImage,
} from "./chat-appearance";

describe("normalizeChatAppearance", () => {
  it("defaults Cyrene reply bubbles to disabled for existing settings", () => {
    expect(normalizeChatAppearance({ chatLineHeight: 1.6 })).toEqual({
      chatLineHeight: 1.6,
      assistantBubbleEnabled: false,
      usageBadgeColor: DEFAULT_CHAT_APPEARANCE.usageBadgeColor,
    });
  });

  it("preserves an explicit global Cyrene reply bubble choice", () => {
    expect(normalizeChatAppearance({
      chatLineHeight: 1.75,
      assistantBubbleEnabled: false,
    })).toEqual({
      chatLineHeight: 1.75,
      assistantBubbleEnabled: false,
      usageBadgeColor: DEFAULT_CHAT_APPEARANCE.usageBadgeColor,
    });
  });

  it("keeps a preset usage badge color and a custom hex color", () => {
    expect(normalizeChatAppearance({ usageBadgeColor: "preset:sky" }).usageBadgeColor).toBe("preset:sky");
    expect(normalizeChatAppearance({ usageBadgeColor: "#FF8FB1" }).usageBadgeColor).toBe("#ff8fb1");
  });
});

describe("usage badge color", () => {
  it("只接受预设 id 或 #hex，其余回退默认", () => {
    expect(normalizeUsageBadgeColor("preset:peach-sunset")).toBe("preset:peach-sunset");
    expect(normalizeUsageBadgeColor("#abc")).toBe("#abc");
    expect(normalizeUsageBadgeColor("red; background:url(x)")).toBe(DEFAULT_CHAT_APPEARANCE.usageBadgeColor);
    expect(normalizeUsageBadgeColor("preset:../etc")).toBe(DEFAULT_CHAT_APPEARANCE.usageBadgeColor);
    expect(normalizeUsageBadgeColor(undefined)).toBe(DEFAULT_CHAT_APPEARANCE.usageBadgeColor);
  });

  it("预设解析成渐变，自定义色解析成同色双停靠渐变", () => {
    expect(resolveUsageBadgeImage("preset:peach-sunset")).toContain("linear-gradient(90deg, #ffb199");
    expect(resolveUsageBadgeImage("#ff0000")).toBe("linear-gradient(90deg, #ff0000 0%, #ff0000 100%)");
  });

  it("未知预设回退到第一个预设而不是产生空背景", () => {
    expect(resolveUsageBadgeImage("preset:not-exist")).toContain("linear-gradient(90deg, #ffb199");
  });
});
