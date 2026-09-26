import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyChatAppearance } from "./useChatAppearance";

describe("applyChatAppearance", () => {
  const setProperty = vi.fn();
  const dataset: Record<string, string> = {};

  beforeEach(() => {
    setProperty.mockReset();
    for (const key of Object.keys(dataset)) delete dataset[key];
    vi.stubGlobal("document", {
      documentElement: {
        dataset,
        style: { setProperty },
      },
    });
  });

  it("applies the global bubble-off state without changing message data", () => {
    applyChatAppearance({
      chatLineHeight: 1.6,
      assistantBubbleEnabled: false,
    });

    expect(setProperty).toHaveBeenCalledWith("--cy-chat-line-height", "1.6");
    expect(dataset.assistantBubble).toBe("off");
  });

  it("defaults existing settings to bubbles off", () => {
    applyChatAppearance({ chatLineHeight: 1.75 });

    expect(dataset.assistantBubble).toBe("off");
  });

  it("把用量徽章颜色写成 CSS 变量（默认桃-粉-晚霞紫渐变）", () => {
    applyChatAppearance({ chatLineHeight: 1.75 });

    const usageCall = setProperty.mock.calls.find(([name]) => name === "--cy-usage-badge-image");
    expect(usageCall?.[1]).toContain("linear-gradient(90deg, #ffb199");
  });

  it("自定义色时用量徽章使用同色渐变", () => {
    applyChatAppearance({ chatLineHeight: 1.75, usageBadgeColor: "#123456" });

    expect(setProperty).toHaveBeenCalledWith(
      "--cy-usage-badge-image",
      "linear-gradient(90deg, #123456 0%, #123456 100%)",
    );
  });
});
