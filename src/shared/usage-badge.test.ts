import { describe, expect, it } from "vitest";
import {
  DEFAULT_USAGE_BADGE_COLOR,
  USAGE_BADGE_PRESETS,
  normalizeUsageBadgeColor,
  resolveUsageBadgeImage,
} from "./usage-badge";

describe("usage-badge 归一化", () => {
  it("默认值保持不变（1.x 的存量配置要能读回）", () => {
    expect(DEFAULT_USAGE_BADGE_COLOR).toBe("preset:peach-sunset");
  });

  it("接受预设 id 与 #hex，其余回退默认", () => {
    expect(normalizeUsageBadgeColor("preset:mint")).toBe("preset:mint");
    expect(normalizeUsageBadgeColor("#AABBCC")).toBe("#aabbcc");
    expect(normalizeUsageBadgeColor("#abc")).toBe("#abc");
    expect(normalizeUsageBadgeColor("javascript:alert(1)")).toBe(DEFAULT_USAGE_BADGE_COLOR);
    expect(normalizeUsageBadgeColor("preset:mint;background:url(x)")).toBe(DEFAULT_USAGE_BADGE_COLOR);
    expect(normalizeUsageBadgeColor("")).toBe(DEFAULT_USAGE_BADGE_COLOR);
    expect(normalizeUsageBadgeColor(undefined)).toBe(DEFAULT_USAGE_BADGE_COLOR);
    expect(normalizeUsageBadgeColor(42)).toBe(DEFAULT_USAGE_BADGE_COLOR);
  });

  it("resolveUsageBadgeImage：预设命中渐变、未知预设回退首个、纯色退化为双停靠", () => {
    expect(resolveUsageBadgeImage("preset:sky")).toBe(USAGE_BADGE_PRESETS.find((p) => p.id === "sky")!.image);
    expect(resolveUsageBadgeImage("#ff0000")).toBe("linear-gradient(90deg, #ff0000 0%, #ff0000 100%)");
    expect(resolveUsageBadgeImage("")).toBe(USAGE_BADGE_PRESETS[0].image);
  });
});
