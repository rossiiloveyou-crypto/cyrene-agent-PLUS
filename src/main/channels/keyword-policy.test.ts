import { describe, expect, it } from "vitest";
import {
  DEFAULT_KEYWORDS,
  MAX_KEYWORD_LENGTH,
  findInterceptKeyword,
  findTriggerKeyword,
  normalizeKeywordConfig,
  parseKeywordLines,
} from "./keyword-policy";

describe("channels/keyword-policy", () => {
  it("默认没有任何关键词", () => {
    expect(DEFAULT_KEYWORDS).toEqual({ intercept: [], trigger: [] });
    expect(normalizeKeywordConfig(undefined)).toEqual({ intercept: [], trigger: [] });
  });

  it("归一化：去空白、忽略大小写去重、丢弃超长项", () => {
    const config = normalizeKeywordConfig({
      intercept: [" 加微信 ", "加微信", "Spam", "spam", "", "z".repeat(MAX_KEYWORD_LENGTH + 1)],
      trigger: ["昔涟"],
    });

    expect(config.intercept).toEqual(["加微信", "Spam"]);
    expect(config.trigger).toEqual(["昔涟"]);
  });

  it("parseKeywordLines：每行一个，兼容逗号顿号与注释行", () => {
    const parsed = parseKeywordLines([
      "# 注释",
      "加微信",
      " 代练 , 刷单、外挂 ",
      "",
      "加微信",
    ].join("\n"));

    expect(parsed).toEqual(["加微信", "代练", "刷单", "外挂"]);
  });

  it("拦截关键词命中即返回命中的词（大小写不敏感、子串匹配）", () => {
    expect(findInterceptKeyword("你好，加微信详聊", ["加微信"])).toBe("加微信");
    expect(findInterceptKeyword("BUY NOW cheap", ["buy now"])).toBe("buy now");
    expect(findInterceptKeyword("正常聊天", ["加微信"])).toBeNull();
    expect(findInterceptKeyword("", ["加微信"])).toBeNull();
  });

  it("触发关键词独立于拦截关键词", () => {
    const trigger = ["昔涟在吗", "小涟"];
    expect(findTriggerKeyword("小涟，今天好累", trigger)).toBe("小涟");
    expect(findTriggerKeyword("今天好累", trigger)).toBeNull();
  });
});
