import type { AgentExecutionMode, CyreneRunOptions } from "../orchestrator/cyrene-agent";
import type { ChannelToolSandbox } from "./settings-store";

export interface ChannelAgentPolicy {
  executionMode: AgentExecutionMode;
  exposeTools: boolean;
  includeInteractiveTools: boolean;
  permissionMode: NonNullable<CyreneRunOptions["permissionMode"]>;
}

/**
 * 外部渠道（微信/飞书/QQ/QQ 机器人）的 Agent 策略。
 *
 * 群聊与私聊一律只看全局「工具权限」开关，不再按渠道/群聊强制降级为纯 Chat。
 * 「谁可以真正调用工具」由渠道工具白名单（tool-access）在执行层逐次拦截，
 * 规则见 docs/user-guide/qqbot-official.md 与设置页「工具调用控制台」。
 */
export function resolveChannelAgentPolicy(toolSandbox: ChannelToolSandbox): ChannelAgentPolicy {
  if (toolSandbox === "off") {
    return {
      executionMode: "chat",
      exposeTools: false,
      includeInteractiveTools: false,
      permissionMode: "normal",
    };
  }
  return {
    executionMode: "work",
    exposeTools: true,
    includeInteractiveTools: false,
    permissionMode: "allow_all",
  };
}

/**
 * 在 buildOptions 之后再次收紧策略：全局工具权限为 off 时，
 * 把 capabilities/toolSystemContent 里已写入的工具目录一并清空，
 * 避免模型看到不可用的工具。
 */
export function enforceChannelAgentPolicy(
  options: CyreneRunOptions,
  policy: ChannelAgentPolicy,
): void {
  options.harnessInteractiveTools = policy.includeInteractiveTools;
  options.permissionMode = policy.permissionMode;
  if (policy.exposeTools) return;
  options.tools = [];
  options.toolSystemContent = "";
  options.skillLayerContent = "";
  if (options.capabilities) {
    options.capabilities = {
      ...options.capabilities,
      tools: [],
      toolIds: new Set<string>(),
    };
  }
}
