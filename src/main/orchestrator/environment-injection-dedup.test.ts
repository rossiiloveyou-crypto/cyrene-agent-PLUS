/**
 * H-24 回归测试：**环境块在最终 runtime 上下文里只能出现一次**。
 *
 * 缺陷原状（2026-10-01 实测）：`build-options.ts` 把同一个 `environmentContext` 装了两条路 ——
 * ① 作为 `soulRuntimeContext` 数组的第 1 项；② 同时填进专用字段 `runtimeEnvironmentContext`。
 * 而 `prompt-builder` 会把两者**各自**推入 `runtimeParts`（prompt-builder.ts:93 与 :95），
 * 于是同一份环境块在请求里出现两次（实测 `## 运行环境` 与 `## 用户信息` 各 2 次，约 1300 字符/轮）。
 *
 * `prompt-builder.ts:102` 的去重只比较 `stablePrefix`，**挡不住「两个 runtime 部件互为子串」**，
 * 所以必须在**装配侧**保证只放一份。本文件从**消费端**断言（不检查实现细节）：
 * 走真实的 `buildHarnessPromptLayers`，数最终 runtime 上下文里那段标记出现了几次。
 */

import { describe, expect, it } from "vitest";

import { buildAgentRunOptions as buildAgentRunOptionsProduction, type BuildOptionsDeps } from "./build-options";
import { buildHarnessPromptLayers } from "./harness/adapter/prompt-builder";
import type { MaterializedTranscript } from "./conversation-transcript-context";

/** 独一无二的环境块标记 —— 用它数出现次数，避免误匹配真实文案。 */
const ENV_MARKER = "## 运行环境（H24-ENV-MARKER）";
const ENV_BLOCK = `${ENV_MARKER}\n- 当前时间：2026-10-01 周四 01:10\n- 操作系统：Windows\n\n## 用户信息\n\n- 昵称：H24-NICK`;

function createDeps(): BuildOptionsDeps {
  return {
    loadModelSettings: () => ({ provider: "test", baseUrl: "https://example.test", model: "m", apiKey: "k" }),
    loadGeneralSettings: () => ({
      currentStyleId: "default",
      customStyle: { diversity: { driver: "model-default" }, repetition: "model-default" },
      chatSocialContextEnabled: false,
    }),
    loadUserProfile: () => ({}),
    buildEnvironmentContext: () => ENV_BLOCK,
    buildSkillCatalog: () => "",
    buildAutoInjectedSkillContext: () => "",
    skillRegistry: {
      getEnabled: () => [],
      getEnabledForMode(this: { getEnabled(): ReadonlyArray<unknown> }, _mode: never) {
        return this.getEnabled();
      },
      getBody: () => null,
    },
    resolveSlashActivation: () => "",
    buildToneInjection: () => "",
    buildAlwaysOnContext: async () => "ALWAYS",
    buildRelationshipContext: async () => "RELATIONSHIP",
    buildSystemPrompt: () => "BASE_SYSTEM",
    buildToolSystemPrompt: () => "TOOL_SYSTEM",
    buildSoulSystemBasePrompt: () => "SOUL_SYSTEM_BASE",
    readStylePrompt: (styleId) => `STYLE_PROMPT:${styleId}`,
    resolveSoulSampling: () => ({}),
    toolRegistry: {
      getEnabled: () => [],
      getEnabledToolsForMode(this: { getEnabled(): ReadonlyArray<unknown> }, _mode: never) {
        return this.getEnabled();
      },
    },
    normalizeChatMessages: (raw) => raw as never,
    chatRequestTimeoutMs: 1000,
  } as BuildOptionsDeps;
}

async function buildOptions(mode: "chat" | "work" = "chat") {
  const messages = [{ role: "user", content: "你好" }];
  const modelContext = { messages, uncertainEffects: [], throughSeq: 0 } as MaterializedTranscript;
  return buildAgentRunOptionsProduction(
    {
      sessionId: `${mode}-session`,
      mode,
      executionMode: mode === "chat" ? "chat" : "work",
      modelContext,
    } as never,
    createDeps(),
  );
}

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe("H-24 · 环境块在 runtime 上下文里只出现一次", () => {
  it("soulRuntimeContext 不再携带环境块（专用字段才是它的归属）", async () => {
    const { options } = await buildOptions();
    expect(occurrences(options.soulRuntimeContext ?? "", ENV_MARKER)).toBe(0);
    // 专用字段仍然带着它 —— 修复不能把环境块整个弄丢
    expect(options.runtimeEnvironmentContext).toContain(ENV_MARKER);
  });

  it("最终 runtime 上下文（走真实 prompt-builder）里环境块恰好出现 1 次", async () => {
    const { options } = await buildOptions();
    const layers = buildHarnessPromptLayers({ ...options, conversationMode: "chat" } as never);

    const runtime = layers.runtimeContext ?? "";
    expect(occurrences(runtime, ENV_MARKER), "## 运行环境 重复注入").toBe(1);
    expect(occurrences(runtime, "## 用户信息"), "## 用户信息 重复注入").toBe(1);
    expect(occurrences(runtime, "H24-NICK")).toBe(1);
  });

  it("work 模式同样只出现一次（两条路径共用同一装配）", async () => {
    const { options } = await buildOptions("work");
    const layers = buildHarnessPromptLayers({ ...options, conversationMode: "work" } as never);

    expect(occurrences(layers.runtimeContext ?? "", ENV_MARKER)).toBe(1);
  });

  it("稳定层若不慎包含环境块，运行时层会被整体去掉（既有去重语义不被破坏）", async () => {
    const { options } = await buildOptions();
    const layers = buildHarnessPromptLayers({
      ...options,
      soulSystemBaseContent: `SOUL\n\n---\n\n${ENV_BLOCK}`,
      conversationMode: "chat",
    } as never);

    expect(occurrences(layers.stablePrefix, ENV_MARKER)).toBe(1);
    expect(occurrences(layers.runtimeContext ?? "", ENV_MARKER)).toBe(0);
  });
});
