// channels/tool-guard —— 外部渠道工具调用的执行层守卫 + 审计埋点。
//
// 为什么放在执行层而不是策略层：QQ 群聊里「用户 B 试图调用工具被拦截」这件事本身
// 需要被模型和用户看到，所以工具照常暴露给模型，真正执行前才判定权限。
// 拦截时返回 `[拒绝] …`——tool-executor 的 legacyFailure 会把它归类为
// permission_denied，模型能自然地向下解释"我没有这个权限"。
//
// 判定依据是「白名单与权限」（tool-access）里该账号的「工具」权限；
// 控制台把「工具调用拦截」总开关关掉时不做任何检查（记录里 allowlisted = null）。
//
// 每次调用（无论放行、失败还是拦截）都会写一条控制台审计；
// 完整参数与完整输出写进独立日志文件（audit/logs/），索引里只留摘要。
import type { ToolDefinition } from "../orchestrator/tools/registry/tool-registry";
import { loadChannelsSettings } from "./settings-store";
import { resolveChannelToolAccess, type ChannelToolAccessConfig } from "./tool-access";
import { appendAudit, type ChannelAuditEntry, type ChannelAuditInput } from "./audit-log";
import type { ChannelChatType, ChannelId } from "./types";

/** 渠道工具守卫的上下文：一次渠道轮次里固定的发送者身份。 */
export interface ChannelToolGuardContext {
  channel: ChannelId;
  chatType: ChannelChatType;
  chatId: string;
  senderId: string;
  senderName?: string;
  sessionId?: string;
}

export interface ChannelToolGuardDeps {
  /** 读取白名单配置；默认每次实时读盘，控制台改完立即生效 */
  loadConfig?: () => ChannelToolAccessConfig;
  appendAudit?: (input: ChannelAuditInput) => ChannelAuditEntry;
}

/** 与 tool-executor 的 legacy failure 标记保持一致 */
const LEGACY_FAILURE_PREFIXES = ["[错误]", "[拒绝]"];
/** 列表摘要取输出开头多少个字符（完整输出在日志文件里） */
const OUTPUT_PREVIEW_LIMIT = 200;

export function buildChannelToolBlockMessage(toolName: string, reason: string): string {
  return `[拒绝] 工具调用被渠道权限拦截：${reason}。`
    + `工具「${toolName}」没有执行。需要授权时，请在聊天窗口「控制台 → 白名单与权限」`
    + `找到该账号并勾上「工具」权限。`;
}

function classifyOutput(output: string): "success" | "failure" {
  const trimmed = output.trimStart();
  return LEGACY_FAILURE_PREFIXES.some((prefix) => trimmed.startsWith(prefix)) ? "failure" : "success";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function preview(text: string): string {
  const points = Array.from(text.trim());
  if (points.length <= OUTPUT_PREVIEW_LIMIT) return text.trim();
  return `${points.slice(0, OUTPUT_PREVIEW_LIMIT).join("")}…`;
}

/**
 * 用白名单守卫包裹这一轮渠道可见的工具集。
 *
 * - 返回新数组，不修改 registry 里的工具定义；
 * - 工具 schema/元数据原样保留（模型看到的能力不变）；
 * - 空数组直接返回，避免无意义包装。
 */
export function applyChannelToolGuard(
  tools: readonly ToolDefinition[],
  context: ChannelToolGuardContext,
  deps: ChannelToolGuardDeps = {},
): ToolDefinition[] {
  if (tools.length === 0) return [];
  const loadConfig = deps.loadConfig ?? (() => loadChannelsSettings().toolAccess);
  const audit = deps.appendAudit ?? appendAudit;

  return tools.map((tool) => {
    const original = tool.execute;
    const guarded = async (
      args: Record<string, unknown>,
      toolContext?: Parameters<ToolDefinition["execute"]>[1],
    ): Promise<string> => {
      const startedAt = Date.now();
      const config = loadConfig();
      const decision = resolveChannelToolAccess(config, {
        channel: context.channel,
        chatType: context.chatType,
        senderId: context.senderId,
      });
      const base: Omit<ChannelAuditInput, "sections" | "status"> = {
        kind: "tool_call",
        title: tool.name,
        channel: context.channel,
        chatType: context.chatType,
        chatId: context.chatId,
        senderId: context.senderId,
        ...(context.senderName ? { senderName: context.senderName } : {}),
        ...(context.sessionId ? { sessionId: context.sessionId } : {}),
        toolId: tool.id,
        toolName: tool.name,
        args,
        allowlisted: decision.guarded ? !decision.blocked : null,
      };

      if (decision.blocked) {
        const blockedReason = decision.reason ?? "不在白名单中";
        const message = buildChannelToolBlockMessage(tool.name, blockedReason);
        audit({
          ...base,
          status: "blocked",
          summary: blockedReason,
          reason: blockedReason,
          durationMs: Date.now() - startedAt,
          sections: [{ heading: "拦截说明", body: message }],
        });
        console.warn(
          `[ChannelToolGuard] 拦截 tool=${tool.id} channel=${context.channel} sender=${context.senderId} reason=${blockedReason}`,
        );
        return message;
      }

      try {
        const output = await original.call(tool, args, toolContext);
        const text = typeof output === "string" ? output : String(output);
        audit({
          ...base,
          status: classifyOutput(text),
          summary: preview(text) || "（无输出）",
          durationMs: Date.now() - startedAt,
          sections: [{ heading: "工具输出（完整）", body: text || "（无输出）" }],
        });
        return output;
      } catch (error) {
        const message = errorMessage(error);
        audit({
          ...base,
          status: "failure",
          summary: message,
          reason: message,
          durationMs: Date.now() - startedAt,
          sections: [
            { heading: "错误信息", body: message },
            ...(error instanceof Error && error.stack ? [{ heading: "错误堆栈", body: error.stack }] : []),
          ],
        });
        throw error;
      }
    };

    return { ...tool, execute: guarded };
  });
}
