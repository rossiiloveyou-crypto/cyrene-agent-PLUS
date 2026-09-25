import { describe, expect, it, vi } from "vitest";

vi.mock("../../../prompts/prompt-loader", () => ({
  loadPromptFile: vi.fn(() => "## 工具使用\n主动调用"),
}));

import {
  buildHarnessPromptLayers,
  buildHarnessSystemPrompt,
  materializeHarnessStartTranscript,
} from "./prompt-builder";

describe("harness prompt builder", () => {
  it("keeps recovery context outside the stable prefix", () => {
    const layers = buildHarnessPromptLayers({
      soulSystemBaseContent: "persona",
      toolSystemContent: "tools",
      recoveryContext: "恢复证据",
      responseContext: "响应引用",
    } as never);

    expect(layers.stablePrefix).not.toContain("RECOVERY_CONTEXT");
    expect(layers.stablePrefix).not.toContain("RESPONSE_CONTEXT");
    expect(layers.runtimeContext).toContain("恢复证据");
    expect(layers.runtimeContext).toContain("响应引用");
  });

  it("does not inject tool usage policy into chat mode", () => {
    const prompt = buildHarnessSystemPrompt({
      soulSystemBaseContent: "persona",
      toolSystemContent: "tools",
      conversationMode: "chat",
    } as never);

    expect(prompt).not.toContain("工具使用");
  });

  it("materializes runtime context as one internal transcript message", () => {
    const messages = materializeHarnessStartTranscript({
      messages: [{ role: "user", content: "继续" }],
      runId: "run-prompt",
      runtimeContext: "[RECOVERY_CONTEXT]\n恢复证据",
      kind: "recovery",
    } as never);

    expect(messages).toHaveLength(2);
    expect(messages[1]).toMatchObject({
      role: "user",
      content: "<internal_context type=\"recovery\">\n[RECOVERY_CONTEXT]\n恢复证据\n</internal_context>",
      internal: {
        kind: "recovery",
        revision: 1,
        runId: "run-prompt",
      },
    });
  });

  it("labels injected runtime facts so they cannot be read as user speech", () => {
    // 回归守卫：内部消息与用户真话同为 role:user，不裹 <internal_context> 时
    // 模型会把环境事实当成"用户又粘贴的一大串内容"（QQ 渠道实测：回一句
    // "剪贴板又捣蛋啦" 并把原文当成用户原话复述）。
    const messages = materializeHarnessStartTranscript({
      messages: [{ role: "user", content: "1" }],
      runId: "run-wrap",
      runtimeContext: "## 运行环境（机器实际状态，不要再凭印象猜）",
      kind: "run_start",
    } as never);

    const injected = messages[1];
    expect(injected.content).toContain("<internal_context type=\"run_start\">");
    expect(injected.content?.trimEnd().endsWith("</internal_context>")).toBe(true);
    // 用户那条真话必须原样保留：包裹只作用于注入事实，绝不改用户输入。
    expect(messages[0].content).toBe("1");
  });
});
