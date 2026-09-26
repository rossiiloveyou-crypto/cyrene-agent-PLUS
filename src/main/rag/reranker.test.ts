import { describe, it, expect, vi } from "vitest";

// reranker.ts imports ./model-status, which imports electron.app
vi.mock("electron", () => ({
  app: { getAppPath: () => process.cwd() },
}));

import { extractRerankScores } from "./reranker";

describe("extractRerankScores", () => {
  it("单标签 cross-encoder：每个候选取自己的原始 logit", () => {
    // bge-reranker-base 实测形状 [batch=3, numLabels=1]
    const scores = extractRerankScores({ dims: [3, 1], data: [-0.18, -10.18, 2.5] });
    expect(scores).toEqual([-0.18, -10.18, 2.5]);
  });

  it("多标签 logits：按行取第 0 列，不能把整块 data 当成逐候选分数", () => {
    // [batch=2, numLabels=2] → [[1, 9], [2, 8]]
    expect(extractRerankScores({ dims: [2, 2], data: [1, 9, 2, 8] })).toEqual([1, 2]);
  });

  it("空 batch 返回空数组", () => {
    expect(extractRerankScores({ dims: [0, 1], data: [] })).toEqual([]);
  });

  it("dims 缺失时不臆测形状，返回空数组", () => {
    expect(extractRerankScores({ data: [3, 4] })).toEqual([]);
  });

  it("还原真实一次推理的排序结果", () => {
    // 实测：相关文档 -0.1773，无关文档 -10.177
    const scores = extractRerankScores({ dims: [2, 1], data: [-0.1773, -10.177] });
    const docs = ["相关文档", "无关文档"];
    const ranked = docs
      .map((text, i) => ({ text, score: scores[i] }))
      .sort((a, b) => b.score - a.score);
    expect(ranked.map((r) => r.text)).toEqual(["相关文档", "无关文档"]);
  });
});
