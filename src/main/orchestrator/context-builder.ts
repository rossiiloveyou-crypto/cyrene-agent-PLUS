// Orchestrator Context Builder — post-chat 副作用（记忆写入 + Reflection）
import { memoryScheduler } from "../memory/memory-scheduler";
import type { TurnAttribution } from "../memory/memory-types";

/**
 * 调度一轮对话的记忆写入。
 *
 * @param attribution P2 归属（说话人 personKey / 昵称 / 本轮 user 消息 id）。
 *   桌面路径不传 —— 归属解析整体退化，行为与 P1 一致。
 */
export function scheduleMemoryWrite(
  userInput: string,
  assistantReply: string,
  conversationId?: string,
  attribution?: TurnAttribution,
): void {
  memoryScheduler.scheduleMemoryWrite(userInput, assistantReply, conversationId, attribution);
}
