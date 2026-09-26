import { describe, expect, it } from "vitest";
import type { CyreneRunOptions } from "../orchestrator/cyrene-agent";
import { enforceChannelAgentPolicy, resolveChannelAgentPolicy } from "./agent-policy";

describe("mobile channel agent policy", () => {
  it("routes off through ChatLoop without tools", () => {
    expect(resolveChannelAgentPolicy("off")).toEqual({
      executionMode: "chat",
      exposeTools: false,
      includeInteractiveTools: false,
      permissionMode: "normal",
    });
  });

  it("routes all through CyreneHarness without Ask or approval", () => {
    expect(resolveChannelAgentPolicy("all")).toEqual({
      executionMode: "work",
      exposeTools: true,
      includeInteractiveTools: false,
      permissionMode: "allow_all",
    });
  });

  it("keeps the same policy for group chats (QQ groups are no longer forced to pure Chat)", () => {
    // 群聊与私聊同口径：拦截谁可以调用工具改由 tool-access 白名单在执行层决定。
    expect(resolveChannelAgentPolicy("all")).toEqual({
      executionMode: "work",
      exposeTools: true,
      includeInteractiveTools: false,
      permissionMode: "allow_all",
    });

    const options = {
      tools: [{ id: "shell" }],
      toolSystemContent: "TOOL CATALOG",
      skillLayerContent: "SKILL CATALOG",
      capabilities: {
        mode: "chat",
        tools: [{ id: "shell" }],
        toolIds: new Set(["shell"]),
        skills: [],
        skillIds: new Set<string>(),
      },
    } as unknown as CyreneRunOptions;
    enforceChannelAgentPolicy(options, resolveChannelAgentPolicy("off"));
    expect(options.tools).toEqual([]);
    expect(options.toolSystemContent).toBe("");
    expect(options.skillLayerContent).toBe("");
    expect(options.capabilities?.tools).toEqual([]);
    expect(options.capabilities?.toolIds.size).toBe(0);
  });
});
