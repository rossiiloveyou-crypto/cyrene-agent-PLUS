import { describe, expect, it } from "vitest";
import { resolveMaxOutputTokens, getStageTokenPolicy } from "./token-budget";

describe("resolveMaxOutputTokens", () => {
  it("returns stage default when no override", () => {
    expect(resolveMaxOutputTokens({ stage: "task-plan" })).toBe(1200);
    expect(resolveMaxOutputTokens({ stage: "ask-soul" })).toBe(1600);
    // memory-judge：800 → 32768。一条候选 ≈1000 字符（含 sourceQuote 软上限 500 字），
    // 800 会让「一批里有 2 个以上话题」的判定必然被截断 → REPAIR_EXHAUSTED → 整批记忆丢失。
    // 直接拉到端点允许的上限，让"这批有几个话题"不再需要被猜。
    expect(resolveMaxOutputTokens({ stage: "memory-judge" })).toBe(32768);
    expect(resolveMaxOutputTokens({ stage: "memory-compressor" })).toBe(500);
    expect(resolveMaxOutputTokens({ stage: "memory-reflect" })).toBe(500);
    expect(resolveMaxOutputTokens({ stage: "memory-resolver" })).toBe(700);
  });

  it("override takes precedence over stage default", () => {
    expect(resolveMaxOutputTokens({ stage: "task-plan", override: 2400 })).toBe(2400);
  });

  it("override of 0 or negative falls back to stage default", () => {
    expect(resolveMaxOutputTokens({ stage: "task-plan", override: 0 })).toBe(1200);
    expect(resolveMaxOutputTokens({ stage: "task-plan", override: -100 })).toBe(1200);
  });

  it("override of NaN or Infinity falls back to stage default", () => {
    expect(resolveMaxOutputTokens({ stage: "task-plan", override: NaN })).toBe(1200);
    expect(resolveMaxOutputTokens({ stage: "task-plan", override: Infinity })).toBe(1200);
  });

  it("override rounds fractional values", () => {
    expect(resolveMaxOutputTokens({ stage: "task-plan", override: 1500.7 })).toBe(1501);
  });
});

describe("getStageTokenPolicy", () => {
  it("returns policy with defaultMaxOutputTokens for all stages", () => {
    const stages = ["task-plan", "ask-soul", "memory-judge", "memory-compressor", "memory-reflect", "memory-resolver"] as const;
    for (const stage of stages) {
      const policy = getStageTokenPolicy(stage);
      expect(policy.defaultMaxOutputTokens).toBeGreaterThan(0);
    }
  });

  it("returns a frozen-like object (read-only intent)", () => {
    const policy = getStageTokenPolicy("task-plan");
    expect(policy.defaultMaxOutputTokens).toBe(1200);
  });
});
