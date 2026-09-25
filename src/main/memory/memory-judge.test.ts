import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  structuredOptions: undefined as { systemPrompt: string; userPrompt: string } | undefined,
}));

vi.mock("./memory-llm-client", () => ({
  getDefaultMaxOutputTokens: () => 800,
  invokeMemoryStructuredOutput: vi.fn(async (options: { systemPrompt: string; userPrompt: string }) => {
    mocks.structuredOptions = options;
    return { candidates: [], entities: [] };
  }),
}));

vi.mock("./memory-llm-shared", () => ({
  loadMemoryModelConfig: () => ({
    source: "inherited-main",
    provider: "DeepSeek（深度求索）",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-v4-pro",
    apiKey: "sk-test",
  }),
}));

import { MemoryJudge } from "./memory-judge";

describe("MemoryJudge B-tier output contract", () => {
  beforeEach(() => {
    mocks.structuredOptions = undefined;
  });

  test("asks for a candidates object envelope instead of a top-level array", async () => {
    await new MemoryJudge().judge("你好", "你好呀", "conversation-1");

    const prompt = mocks.structuredOptions?.systemPrompt ?? "";
    expect(prompt).toContain('顶层 JSON 对象');
    expect(prompt).toContain('{"candidates":[],"entities":[]}');
    expect(prompt).not.toContain("输出格式为 JSON 数组");
  });

  test("instructs LLM to emit slug for L2 candidates", async () => {
    await new MemoryJudge().judge("我喜欢香菇", "记下来了", "conversation-1");

    const prompt = mocks.structuredOptions?.systemPrompt ?? "";
    expect(prompt).toContain("L2 slug 抽取");
    expect(prompt).toContain("L2 片段必须输出 slug");
    // 校验规则要明确传给 LLM
    expect(prompt).toMatch(/≤20\s*字/);
    expect(prompt).toContain("禁止标点、引号、空格、emoji");
    // L0/L1 明确禁止 slug
    expect(prompt).toContain("L0 / L1 候选不要输出 slug 字段");
  });

  test("instructs LLM to emit sourceQuote for L2 candidates", async () => {
    await new MemoryJudge().judge("我用 React 18.2 做的前端", "记下来了", "conversation-1");

    const prompt = mocks.structuredOptions?.systemPrompt ?? "";
    expect(prompt).toContain("L2 sourceQuote 抽取");
    expect(prompt).toContain("L2 片段必须输出 sourceQuote");
    // 软上限 500 字要明确传给 LLM
    expect(prompt).toMatch(/500\s*字/);
    // 原文允许标点/空格/emoji（与 slug 严格规则不同）
    expect(prompt).toContain("允许标点、空格、emoji");
    // L0/L1 明确禁止 sourceQuote
    expect(prompt).toContain("L0 / L1 候选不要输出 sourceQuote 字段");
  });

  // ── P2 归属抽取 ──

  test("instructs LLM to emit subjectNames + sourceTurnIndexes for L2 candidates", async () => {
    await new MemoryJudge().judge("我最近在学 Rust", "好厉害", "conversation-1");

    const prompt = mocks.structuredOptions?.systemPrompt ?? "";
    expect(prompt).toContain("L2 归属抽取");
    expect(prompt).toContain("subjectNames");
    expect(prompt).toContain("sourceTurnIndexes");
    // 泛指词必须被明确排除（否则映射阶段会全军覆没）
    expect(prompt).toContain("不要填「用户」「对方」「群友」这类泛指");
    // 与具体的人无关时返回空数组
    expect(prompt).toContain("subjectNames 返回空数组 []");
    // 轮次号是 1-based
    expect(prompt).toContain("1-based 轮次号数组");
    // L0/L1 明确禁止这两个字段
    expect(prompt).toContain("L0 / L1 候选不要输出 subjectNames / sourceTurnIndexes 字段");
  });

  test("prompt 给出「说话人 ≠ 主体」的正例（小红转述小明）", async () => {
    await new MemoryJudge().judge("小明最近在学 Rust", "记下来了", "conversation-1");

    const prompt = mocks.structuredOptions?.systemPrompt ?? "";
    expect(prompt).toContain("第 2 轮中小明说「我最近在学 Rust」→ subjectNames=[\"小明\"], sourceTurnIndexes=[2]");
    expect(prompt).toContain("第 4 轮中小红说「小明最近在学 Rust」→ subjectNames=[\"小明\"], sourceTurnIndexes=[4]");
  });

  test("输出结构示例里带上两个归属字段", async () => {
    await new MemoryJudge().judge("你好", "你好呀", "conversation-1");

    const prompt = mocks.structuredOptions?.systemPrompt ?? "";
    expect(prompt).toContain('"subjectNames": ["小明"]');
    expect(prompt).toContain('"sourceTurnIndexes": [2]');
  });

  test("transcript 每轮显式标出说话人与 personKey，并保留 1-based 轮次号", async () => {
    await new MemoryJudge().judgeRecentTurns([
      { userInput: "我最近在学 Rust", assistantReply: "好厉害", personKey: "qq:10001", speakerName: "小明" },
      { userInput: "小明最近在学 Rust", assistantReply: "嗯嗯", personKey: "qq:10002", speakerName: "小红" },
    ], "conversation-1");

    const userPrompt = mocks.structuredOptions?.userPrompt ?? "";
    expect(userPrompt).toContain("第 1 轮：");
    expect(userPrompt).toContain("第 2 轮：");
    expect(userPrompt).toContain("说话人：小明（qq:10001）");
    expect(userPrompt).toContain("说话人：小红（qq:10002）");
    expect(userPrompt).toContain("conversationId: conversation-1");
  });

  test("无归属的轮次（桌面路径）说话人显示为「用户」，不出现多余括号", async () => {
    await new MemoryJudge().judge("你好", "你好呀", "conversation-1");

    const userPrompt = mocks.structuredOptions?.userPrompt ?? "";
    expect(userPrompt).toContain("说话人：用户\n");
    expect(userPrompt).not.toContain("（undefined）");
  });

  // ── 非 root 域只允许 L2（l2Only）──
  //
  // 判据与 memory-manager 里 `!isOwnerScope(scope) → 丢弃 L0/L1` 同源，
  // 提前到提示词里说，避免 LLM 把 800 token 的预算浪费在注定被丢弃的候选上。

  test("l2Only 时提示词禁止 L0/L1，并说明它们会被丢弃", async () => {
    await new MemoryJudge().judgeRecentTurns(
      [{ userInput: "我最近在学 Rust", assistantReply: "好厉害", personKey: "qq:10001", speakerName: "小明" }],
      "conversation-1",
      { l2Only: true },
    );

    const prompt = mocks.structuredOptions?.systemPrompt ?? "";
    expect(prompt).toContain("不在主人（root）域");
    expect(prompt).toContain('只能输出 layer="L2" 的候选');
    expect(prompt).toContain("禁止输出 L0 / L1");
    expect(prompt).toContain("会被系统直接丢弃");
    // 群聊里的发言人不是「主人」，要按具体的人处理
    expect(prompt).toContain("不要**把他当成「用户」或「主人」");
    // 归属字段仍然必须输出（否则 K 类样本无法映射回 personKey）
    expect(prompt).toContain("照常输出 subjectNames 与 sourceTurnIndexes");
  });

  test("默认（root 域 / 桌面）提示词里没有 l2Only 那一段", async () => {
    await new MemoryJudge().judge("你好", "你好呀", "conversation-1");

    const prompt = mocks.structuredOptions?.systemPrompt ?? "";
    expect(prompt).not.toContain("不在主人（root）域");
    expect(prompt).not.toContain("禁止输出 L0 / L1");
  });
});
