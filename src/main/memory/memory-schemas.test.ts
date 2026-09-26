import { describe, expect, test } from "vitest";
import {
  parseMemoryJudgeResult,
  validateMemoryJudgeBusiness,
  isValidSlug,
  isValidSourceQuote,
  parseSubjectNames,
  parseSourceTurnIndexes,
  MEMORY_JUDGE_JSON_SCHEMA,
  SUBJECT_NAME_MAX_LENGTH,
  SUBJECT_NAMES_MAX_ITEMS,
  SOURCE_TURN_INDEXES_MAX_ITEMS,
} from "./memory-schemas";

/** 最小可解析的 L2 候选，测试逐个字段替换。 */
function l2Candidate(extra: Record<string, unknown> = {}) {
  return {
    layer: "L2",
    content: "小明最近在学 Rust",
    confidence: 0.9,
    triggerText: "我最近在学 Rust",
    ...extra,
  };
}

describe("Memory Judge structured output schema", () => {
  test("accepts the B-tier JSON Object envelope", () => {
    expect(parseMemoryJudgeResult({
      candidates: [{
        layer: "L1",
        content: "用户正在迁移 React Chat 窗口",
        confidence: 0.9,
        triggerText: "我正在前端 chat 窗口迁移 react",
      }],
    })).toEqual({
      candidates: [{
        layer: "L1",
        content: "用户正在迁移 React Chat 窗口",
        confidence: 0.9,
        triggerText: "我正在前端 chat 窗口迁移 react",
      }],
      entities: [],
    });
  });

  test("treats an empty candidates envelope as a successful no-op", () => {
    const result = parseMemoryJudgeResult({ candidates: [] });

    expect(validateMemoryJudgeBusiness(result)).toEqual({
      status: "accepted",
      value: { candidates: [], entities: [] },
    });
  });

  test("parses entities alongside candidates and rejects bad types", () => {
    const result = parseMemoryJudgeResult({
      candidates: [],
      entities: [
        { name: "小张", type: "person", aliases: ["张三"] },
        { name: "北京", type: "place" },
      ],
    });

    expect(result.entities).toEqual([
      { name: "小张", type: "person", aliases: ["张三"] },
      { name: "北京", type: "place" },
    ]);

    expect(() => parseMemoryJudgeResult({
      candidates: [],
      entities: [{ name: "X", type: "unknown_type" }],
    })).toThrow();
  });

  test("parses slug for L2 candidates and trims whitespace", () => {
    const result = parseMemoryJudgeResult({
      candidates: [{
        layer: "L2",
        content: "用户喜欢香菇",
        confidence: 0.9,
        triggerText: "我喜欢香菇",
        slug: "  喜欢香菇  ",
      }],
      entities: [],
    });

    expect(result.candidates[0].slug).toBe("喜欢香菇");
  });

  test("drops invalid slug silently instead of failing the whole candidate", () => {
    // 含标点 → 非法，丢弃 slug，候选照常通过
    const withPunct = parseMemoryJudgeResult({
      candidates: [{
        layer: "L2",
        content: "用户喜欢香菇",
        confidence: 0.9,
        triggerText: "我喜欢香菇",
        slug: "喜欢香菇，很爱吃",
      }],
      entities: [],
    });
    expect(withPunct.candidates[0].slug).toBeUndefined();

    // 含 emoji → 非法
    const withEmoji = parseMemoryJudgeResult({
      candidates: [{
        layer: "L2",
        content: "用户喜欢香菇",
        confidence: 0.9,
        triggerText: "我喜欢香菇",
        slug: "喜欢香菇🍄",
      }],
      entities: [],
    });
    expect(withEmoji.candidates[0].slug).toBeUndefined();

    // 超长（>20）→ 非法
    const tooLong = parseMemoryJudgeResult({
      candidates: [{
        layer: "L2",
        content: "用户喜欢香菇",
        confidence: 0.9,
        triggerText: "我喜欢香菇",
        slug: "一二三四五六七八九十一二三四五六七八九十一",
      }],
      entities: [],
    });
    expect(tooLong.candidates[0].slug).toBeUndefined();
  });

  test("ignores slug on L0/L1 candidates even if LLM emits it", () => {
    const result = parseMemoryJudgeResult({
      candidates: [{
        layer: "L1",
        field: "recentPreferences",
        content: "近期偏好深色主题",
        confidence: 0.8,
        triggerText: "我最近偏好深色主题",
        slug: "深色偏好",
      }],
      entities: [],
    });

    expect(result.candidates[0].slug).toBeUndefined();
  });

  test("parses sourceQuote for L2 candidates and trims whitespace", () => {
    const result = parseMemoryJudgeResult({
      candidates: [{
        layer: "L2",
        content: "用户用 React 18.2 做前端",
        confidence: 0.9,
        triggerText: "我用 React 18.2 做的前端",
        sourceQuote: "  我用 React 18.2 做的前端，部署在 vercel 上  ",
      }],
      entities: [],
    });

    expect(result.candidates[0].sourceQuote).toBe("我用 React 18.2 做的前端，部署在 vercel 上");
  });

  test("sourceQuote allows punctuation, spaces, emoji (it is verbatim dialogue)", () => {
    const result = parseMemoryJudgeResult({
      candidates: [{
        layer: "L2",
        content: "用户喜欢香菇",
        confidence: 0.9,
        triggerText: "我喜欢香菇",
        sourceQuote: "我喜欢香菇，很爱吃！🍄",
      }],
      entities: [],
    });

    expect(result.candidates[0].sourceQuote).toBe("我喜欢香菇，很爱吃！🍄");
  });

  test("drops over-length sourceQuote silently instead of failing the whole candidate", () => {
    // 501 字 → 超过 500 上限，丢弃 sourceQuote，候选照常通过
    const tooLong = "x".repeat(501);
    const result = parseMemoryJudgeResult({
      candidates: [{
        layer: "L2",
        content: "用户喜欢香菇",
        confidence: 0.9,
        triggerText: "我喜欢香菇",
        sourceQuote: tooLong,
      }],
      entities: [],
    });
    expect(result.candidates[0].sourceQuote).toBeUndefined();
    // 候选本身仍然入库
    expect(result.candidates[0].content).toBe("用户喜欢香菇");
  });

  test("accepts sourceQuote at exactly 500 chars (boundary)", () => {
    const exact = "x".repeat(500);
    const result = parseMemoryJudgeResult({
      candidates: [{
        layer: "L2",
        content: "用户喜欢香菇",
        confidence: 0.9,
        triggerText: "我喜欢香菇",
        sourceQuote: exact,
      }],
      entities: [],
    });
    expect(result.candidates[0].sourceQuote).toBe(exact);
  });

  test("drops empty/whitespace-only sourceQuote silently", () => {
    const result = parseMemoryJudgeResult({
      candidates: [{
        layer: "L2",
        content: "用户喜欢香菇",
        confidence: 0.9,
        triggerText: "我喜欢香菇",
        sourceQuote: "   ",
      }],
      entities: [],
    });
    expect(result.candidates[0].sourceQuote).toBeUndefined();
  });

  test("ignores sourceQuote on L0/L1 candidates even if LLM emits it", () => {
    const result = parseMemoryJudgeResult({
      candidates: [{
        layer: "L1",
        field: "recentPreferences",
        content: "近期偏好深色主题",
        confidence: 0.8,
        triggerText: "我最近偏好深色主题",
        sourceQuote: "我最近偏好深色主题",
      }],
      entities: [],
    });

    expect(result.candidates[0].sourceQuote).toBeUndefined();
  });
});

describe("isValidSourceQuote", () => {
  test("accepts non-empty strings up to 500 chars", () => {
    expect(isValidSourceQuote("我喜欢香菇")).toBe(true);
    expect(isValidSourceQuote("我用 React 18.2 做的前端，部署在 vercel 上")).toBe(true);
    expect(isValidSourceQuote("喜欢香菇，很爱吃！🍄")).toBe(true);
    expect(isValidSourceQuote("x".repeat(500))).toBe(true);
  });

  test("rejects empty, whitespace-only, and over-length", () => {
    expect(isValidSourceQuote("")).toBe(false);
    expect(isValidSourceQuote("   ")).toBe(false);
    expect(isValidSourceQuote("x".repeat(501))).toBe(false);
  });

  test("rejects non-string inputs", () => {
    expect(isValidSourceQuote(undefined)).toBe(false);
    expect(isValidSourceQuote(null)).toBe(false);
    expect(isValidSourceQuote(123)).toBe(false);
  });
});

describe("isValidSlug", () => {
  test("accepts Chinese, letters, digits, underscore, hyphen", () => {
    expect(isValidSlug("喜欢香菇")).toBe(true);
    expect(isValidSlug("和小张约饭")).toBe(true);
    expect(isValidSlug("ReactChat迁移")).toBe(true);
    expect(isValidSlug("react_chat-migration")).toBe(true);
    expect(isValidSlug("片段_2026")).toBe(true);
  });

  test("rejects empty, whitespace-only, and over-length", () => {
    expect(isValidSlug("")).toBe(false);
    expect(isValidSlug("   ")).toBe(false);
    expect(isValidSlug("一二三四五六七八九十一二三四五六七八九十一")).toBe(false);
  });

  test("rejects punctuation, quotes, spaces, emoji", () => {
    expect(isValidSlug("喜欢香菇，很爱吃")).toBe(false);
    expect(isValidSlug("喜欢 香菇")).toBe(false);
    expect(isValidSlug("喜欢「香菇」")).toBe(false);
    expect(isValidSlug("喜欢香菇🍄")).toBe(false);
    expect(isValidSlug("喜欢/香菇")).toBe(false);
  });

  test("rejects non-string inputs", () => {
    expect(isValidSlug(undefined)).toBe(false);
    expect(isValidSlug(null)).toBe(false);
    expect(isValidSlug(123)).toBe(false);
  });
});

// ── P2 归属字段 ──

describe("parseSubjectNames", () => {
  test("保留非空字符串项并去重", () => {
    expect(parseSubjectNames(["小明"])).toEqual(["小明"]);
    expect(parseSubjectNames(["小明", "小红", "小明"])).toEqual(["小明", "小红"]);
    expect(parseSubjectNames([" 小明 "])).toEqual(["小明"]);
  });

  test("L0/L1 的「关于谁」没有粒度：空数组/全空白 → undefined（不落字段）", () => {
    expect(parseSubjectNames([])).toBeUndefined();
    expect(parseSubjectNames(["", "   "])).toBeUndefined();
    expect(parseSubjectNames(undefined)).toBeUndefined();
    expect(parseSubjectNames("小明")).toBeUndefined();
  });

  test(`最多 ${SUBJECT_NAMES_MAX_ITEMS} 项，超出部分丢弃（不抛错）`, () => {
    const names = parseSubjectNames(["a", "b", "c", "d", "e", "f", "g"]);
    expect(names).toHaveLength(SUBJECT_NAMES_MAX_ITEMS);
    expect(names).toEqual(["a", "b", "c", "d", "e"]);
  });

  test(`单项超过 ${SUBJECT_NAME_MAX_LENGTH} 字视为幻觉（复述整句），丢弃该项`, () => {
    expect(parseSubjectNames(["x".repeat(SUBJECT_NAME_MAX_LENGTH)])).toHaveLength(1);
    expect(parseSubjectNames(["x".repeat(SUBJECT_NAME_MAX_LENGTH + 1)])).toBeUndefined();
    expect(parseSubjectNames(["好", "x".repeat(99)])).toEqual(["好"]);
  });

  test("非字符串项被跳过", () => {
    expect(parseSubjectNames([1, null, "小明", {}])).toEqual(["小明"]);
  });
});

describe("parseSourceTurnIndexes", () => {
  test("保留 1-based 正整数并去重", () => {
    expect(parseSourceTurnIndexes([2])).toEqual([2]);
    expect(parseSourceTurnIndexes([2, 3, 2])).toEqual([2, 3]);
  });

  test("0 / 负数 / 小数 / 非数字一律丢弃", () => {
    expect(parseSourceTurnIndexes([0])).toBeUndefined();
    expect(parseSourceTurnIndexes([-1])).toBeUndefined();
    expect(parseSourceTurnIndexes([1.5])).toBeUndefined();
    expect(parseSourceTurnIndexes(["2"])).toBeUndefined();
    expect(parseSourceTurnIndexes([3, 0, -2, 1.5, "4"])).toEqual([3]);
  });

  test(`最多 ${SOURCE_TURN_INDEXES_MAX_ITEMS} 项`, () => {
    const indexes = parseSourceTurnIndexes([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(indexes).toHaveLength(SOURCE_TURN_INDEXES_MAX_ITEMS);
  });

  test("空/非数组 → undefined", () => {
    expect(parseSourceTurnIndexes([])).toBeUndefined();
    expect(parseSourceTurnIndexes(undefined)).toBeUndefined();
    expect(parseSourceTurnIndexes(2)).toBeUndefined();
  });

  test("越界项不在这里判（校验层拿不到轮数），交给 person-attribution 忽略", () => {
    expect(parseSourceTurnIndexes([99])).toEqual([99]);
  });
});

describe("Memory Judge 候选的归属字段解析", () => {
  test("L2 候选读入 subjectNames 与 sourceTurnIndexes", () => {
    const result = parseMemoryJudgeResult({
      candidates: [l2Candidate({ subjectNames: ["小明"], sourceTurnIndexes: [2] })],
      entities: [],
    });

    expect(result.candidates[0].subjectNames).toEqual(["小明"]);
    expect(result.candidates[0].sourceTurnIndexes).toEqual([2]);
  });

  test("非法值逐项丢弃，候选照常入库（归属是增益信息，不该拖垮候选）", () => {
    const result = parseMemoryJudgeResult({
      candidates: [l2Candidate({
        subjectNames: ["", "x".repeat(99), "小明"],
        sourceTurnIndexes: [0, 2, "3"],
      })],
      entities: [],
    });

    expect(result.candidates[0].content).toBe("小明最近在学 Rust");
    expect(result.candidates[0].subjectNames).toEqual(["小明"]);
    expect(result.candidates[0].sourceTurnIndexes).toEqual([2]);
  });

  test("无归属字段时不落字段（老模型 / 弱模型输出仍可解析）", () => {
    const result = parseMemoryJudgeResult({ candidates: [l2Candidate()], entities: [] });

    expect("subjectNames" in result.candidates[0]).toBe(false);
    expect("sourceTurnIndexes" in result.candidates[0]).toBe(false);
  });

  test("两字段缺失不影响空候选no-op", () => {
    const result = parseMemoryJudgeResult({ candidates: [] });
    expect(result).toEqual({ candidates: [], entities: [] });
  });

  test("L0/L1 候选的 subjectNames 一律丢弃（画像没有「关于谁」的粒度）", () => {
    const result = parseMemoryJudgeResult({
      candidates: [{
        layer: "L1",
        field: "recentPreferences",
        content: "近期偏好深色主题",
        confidence: 0.8,
        triggerText: "我最近偏好深色主题",
        subjectNames: ["小明"],
        sourceTurnIndexes: [1],
      }],
      entities: [],
    });

    expect(result.candidates[0].subjectNames).toBeUndefined();
    expect(result.candidates[0].sourceTurnIndexes).toBeUndefined();
  });
});

describe("MEMORY_JUDGE_JSON_SCHEMA 的归属字段", () => {
  const candidateSchema = (MEMORY_JUDGE_JSON_SCHEMA.properties as any)
    .candidates.items as { properties: Record<string, unknown>; additionalProperties: boolean };

  test("schema 里声明了两个字段（additionalProperties:false 时不加会被 A 档模型拒绝）", () => {
    expect(candidateSchema.properties.subjectNames).toEqual({
      type: "array",
      items: { type: "string" },
    });
    expect(candidateSchema.properties.sourceTurnIndexes).toEqual({
      type: "array",
      items: { type: "number" },
    });
  });

  test("两个字段都不是必填（弱模型缺字段仍要能通过严格 schema）", () => {
    expect((candidateSchema as any).required).toEqual(["layer", "content", "confidence", "triggerText"]);
  });
});
