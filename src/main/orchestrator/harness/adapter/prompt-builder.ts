import type { ChatMessage } from "../../vendors/types";
import {
  TODO_WORKING_NOTEBOOK_POLICY,
  buildCurrentTodoNotebookContext,
} from "../todo-working-notebook";
import { appendInternalTranscriptMessage, createInternalTranscriptMessage } from "../internal-transcript";
import type { AgentState } from "../types";
import type { PromptLayers } from "../../prompt-layers";
import type { CyreneRunOptions } from "../../cyrene-agent";
import { loadPromptFile } from "../../../prompts/prompt-loader";

/**
 * 组装 Harness 的提示词层。
 * stablePrefix 只放可复用的 persona/tool 内容；runtimeContext 是当前运行的动态尾部，
 * 两者分开后才能保持提示词缓存稳定，并避免把一次运行的状态污染到下一次运行。
 */
export function materializeHarnessStartTranscript(input: {
  messages: readonly ChatMessage[];
  runId: string;
  runtimeContext?: string;
  initialState?: AgentState;
  kind: "run_start" | "recovery";
}): ChatMessage[] {
  // 动态上下文在 run_start/recovery 时物化为内部消息，确保 Harness 与恢复流程看到同一份事实。
  const parts = [
    input.runtimeContext,
    input.initialState?.todoItems.length
      ? buildCurrentTodoNotebookContext(input.initialState.todoItems)
      : undefined,
  ].filter((part): part is string => Boolean(part?.trim()));
  if (parts.length === 0) return [...input.messages];

  const revision = input.messages.reduce(
    (current, message) => Math.max(current, message.internal?.revision ?? 0),
    0,
  ) + 1;
  return appendInternalTranscriptMessage(input.messages, createInternalTranscriptMessage({
    kind: input.kind,
    revision,
    runId: input.runId,
    content: wrapInternalContext(input.kind, parts.join("\n\n---\n\n")),
  }));
}

/**
 * 把运行时事实裹进 `<internal_context>`。
 *
 * ⚠️ 包这一层不是为了好看：内部 transcript 消息的 `role` 只能是 `user`
 * （见 internal-transcript.ts），而它紧跟在**用户那轮真话后面**。
 * 不包的话，同一上下文里就有两条 user 消息，模型无法区分
 * "哪条是用户打的字、哪条是机器塞的环境事实"——实测会被读成
 * "用户又粘贴了一大串运行环境/配置进来"，于是回一句
 * "你剪贴板又捣蛋啦"，甚至把这段原文当成用户原话复述回去。
 * 包上后与 ChatLoop 尾部注入的 `<runtime_context>` 同族，且与
 * chat-time-context.ts 的 Internal Context Policy 对齐
 * （该策略明确要求：内部上下文可以用于推理，但**不得出现在用户可见回复里**，
 * 不得引用、复述、解释，也不得暴露标签名）。
 */
function wrapInternalContext(kind: "run_start" | "recovery", content: string): string {
  return `<internal_context type="${kind}">\n${content}\n</internal_context>`;
}

export function buildHarnessPromptLayers(
  options: CyreneRunOptions,
): PromptLayers & { usageParts?: { personaContent: string; toolLayerContent: string; skillLayerContent?: string } } {
  const personaParts: string[] = [];
  if (options.soulSystemBaseContent) {
    personaParts.push(options.soulSystemBaseContent);
  }

  const harnessPersona = options.conversationMode === "chat"
    ? ""
    : loadPromptFile("cyrene_harness.md");
  if (harnessPersona) {
    personaParts.push(harnessPersona);
  }

  personaParts.push(TODO_WORKING_NOTEBOOK_POLICY);

  const toolParts: string[] = [];
  if (options.toolSystemContent) {
    toolParts.push(options.toolSystemContent);
  }
  if (options.conversationMode !== "chat") {
    const toolUsagePolicy = loadPromptFile("tool_usage.md");
    if (toolUsagePolicy) {
      toolParts.push(toolUsagePolicy);
    }
  }

  // 这里只收集语义上下文块；最终 prompt 的消息顺序由准备阶段/Harness 统一决定。
  const runtimeParts: string[] = [];
  if (options.soulRuntimeContext) runtimeParts.push(options.soulRuntimeContext);
  if (options.planSkillContext) runtimeParts.push(options.planSkillContext);
  if (options.runtimeEnvironmentContext) runtimeParts.push(options.runtimeEnvironmentContext);
  if (options.citaContextBlock) runtimeParts.push(options.citaContextBlock);
  if (options.recoveryContext) runtimeParts.push(`[RECOVERY_CONTEXT]\n${options.recoveryContext}`);
  if (options.responseContext) runtimeParts.push(`[RESPONSE_CONTEXT]\n${options.responseContext}`);

  const stablePrefix = [...personaParts, ...toolParts].join("\n\n---\n\n");
  // 调用方可能把同一段内容同时放进静态层和运行时层；这里去重，避免模型收到重复上下文。
  const uniqueRuntimeParts = runtimeParts.filter((part) => !stablePrefix.includes(part));
  return {
    stablePrefix,
    usageParts: {
      personaContent: personaParts.join("\n\n---\n\n"),
      toolLayerContent: toolParts.join("\n\n---\n\n"),
      ...(options.skillLayerContent ? { skillLayerContent: options.skillLayerContent } : {}),
    },
    ...(options.conversationMode ? { mode: options.conversationMode } : {}),
    ...(uniqueRuntimeParts.length ? { runtimeContext: uniqueRuntimeParts.join("\n\n---\n\n") } : {}),
  };
}

/** @deprecated 兼容外部调用；Harness 主路径改用 buildHarnessPromptLayers。 */
export function buildHarnessSystemPrompt(options: CyreneRunOptions): string {
  // 旧 API 仍返回单字符串；新路径消费分层结果，不要在这里反向改变层的职责。
  const layers = buildHarnessPromptLayers(options);
  return [layers.stablePrefix, layers.runtimeContext].filter(Boolean).join("\n\n---\n\n");
}
