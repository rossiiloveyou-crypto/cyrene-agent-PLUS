/**
 * 控制台「关键词策略」区块的纯逻辑测试。
 *
 * 这三条函数决定了**写进 `channels-settings.json` 的内容**，所以断言的是
 * 「保存 patch 的形状」与「导入合并语义」，而不只是字符串加工。
 */

import { describe, expect, it } from "vitest";

import {
  buildKeywordsPatch,
  keywordsToText,
  mergeKeywordText,
  resolveKeywordsAfterSave,
  textToKeywords,
} from "./channel-keywords";

describe("关键词文本 ↔ 数组", () => {
  it("keywordsToText 一行一个词，空输入得到空串", () => {
    expect(keywordsToText(["昔涟", "ufhiuehfhefiwef"])).toBe("昔涟\nufhiuehfhefiwef");
    expect(keywordsToText([])).toBe("");
    expect(keywordsToText(undefined)).toBe("");
    expect(keywordsToText(null)).toBe("");
  });

  it("textToKeywords 去首尾空白、丢空行、兼容 CRLF", () => {
    expect(textToKeywords("  昔涟  \r\n\r\n  测试拦截\n\n")).toEqual(["昔涟", "测试拦截"]);
    expect(textToKeywords("")).toEqual([]);
    expect(textToKeywords("   \n  \n")).toEqual([]);
  });

  it("不做去重：归一化交给主进程 keyword-policy（避免两处规则各自演化）", () => {
    expect(textToKeywords("abc\nABC")).toEqual(["abc", "ABC"]);
  });

  it("往返稳定：数组 → 文本 → 数组不丢内容", () => {
    const list = ["昔涟", "测试拦截", "hello world"];
    expect(textToKeywords(keywordsToText(list))).toEqual(list);
  });
});

describe("从 txt 导入的合并语义", () => {
  it("追加到现有文本，而不是覆盖", () => {
    expect(mergeKeywordText("已有", ["新增"])).toBe("已有\n新增");
  });

  it("按小写去重，重复项跳过", () => {
    expect(mergeKeywordText("abc", ["ABC", "def"])).toBe("abc\ndef");
  });

  it("空数组不改动现有文本", () => {
    expect(mergeKeywordText("abc\ndef", [])).toBe("abc\ndef");
  });

  it("忽略空行与纯空白项", () => {
    expect(mergeKeywordText("", ["  ", "\t", "有效"])).toBe("有效");
  });

  it("保留用户已输入的顺序与原文大小写", () => {
    expect(mergeKeywordText("Zeta\nalpha", ["ALPHA", "beta"])).toBe("Zeta\nalpha\nbeta");
  });
});

describe("保存 patch 的形状（与主进程浅合并契约对齐）", () => {
  it("两类都带上：主进程是 `?? existing`，只传一类会让另一类保持旧值", () => {
    const patch = buildKeywordsPatch("拦截A\n拦截B", "触发A");
    expect(patch).toEqual({
      keywords: {
        intercept: ["拦截A", "拦截B"],
        trigger: ["触发A"],
      },
    });
  });

  it("清空某一类时提交空数组（能真正清空；空数组 !== undefined）", () => {
    const patch = buildKeywordsPatch("", "触发A");
    expect(patch.keywords.intercept).toEqual([]);
    expect(patch.keywords.trigger).toEqual(["触发A"]);
  });
});

describe("保存后回填", () => {
  it("优先用主进程归一化后的结果（去重 / 截断以磁盘为准）", () => {
    const next = resolveKeywordsAfterSave(
      { keywords: { intercept: ["a", "b"], trigger: ["c"] } },
      { interceptText: "a\nA\nb", triggerText: "c" },
    );
    expect(next.interceptText).toBe("a\nb");
    expect(next.triggerText).toBe("c");
  });

  it("主进程没回传时退化为本地归一化（去掉空行）", () => {
    const next = resolveKeywordsAfterSave(undefined, { interceptText: "a\n\n\nb\n", triggerText: "  " });
    expect(next.interceptText).toBe("a\nb");
    expect(next.triggerText).toBe("");
  });

  it("回传 keywords 但某一类缺失时，该类退化为空串而不是崩掉", () => {
    const next = resolveKeywordsAfterSave({ keywords: {} }, { interceptText: "x", triggerText: "y" });
    expect(next.interceptText).toBe("");
    expect(next.triggerText).toBe("");
  });
});
