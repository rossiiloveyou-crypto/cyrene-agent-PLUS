// channels/audit-events —— 「渠道控制台」里消息级 / 轮次级审计的构造助手。
//
// tool-guard 之外的三类记录都从这里产生，统一标题、摘要与日志段落格式，
// 让适配器（白名单拦截）与 dispatcher（关键词拦截、轮次结果）保持一行调用。
import {
  appendAudit,
  type ChannelAuditEntry,
  type ChannelMessageTrigger,
} from "./audit-log";
import type { ChannelChatType, ChannelId } from "./types";

/** 一条渠道消息的固定身份信息。 */
export interface ChannelAuditSubject {
  channel: ChannelId;
  chatType: ChannelChatType;
  chatId: string;
  senderId: string;
  senderName?: string;
  sessionId?: string;
  /** 消息进入链路的方式（@ / 触发词 / 私聊） */
  trigger?: ChannelMessageTrigger;
}

function senderLabel(subject: ChannelAuditSubject): string {
  return subject.senderName ? `${subject.senderName}（${subject.senderId}）` : subject.senderId;
}

function baseOf(subject: ChannelAuditSubject) {
  return {
    channel: subject.channel,
    chatType: subject.chatType,
    chatId: subject.chatId,
    senderId: subject.senderId,
    ...(subject.senderName ? { senderName: subject.senderName } : {}),
    ...(subject.sessionId ? { sessionId: subject.sessionId } : {}),
    ...(subject.trigger ? { trigger: subject.trigger } : {}),
  };
}

/**
 * 记录一条被拦截的消息（叫了昔涟却不在白名单、命中拦截关键词）。
 * 用户原文完整写进日志文件，摘要里也带上发送者与内容，便于直接扫列表。
 */
export function recordMessageBlocked(
  subject: ChannelAuditSubject,
  input: { text: string; reason: string },
): ChannelAuditEntry {
  const label = senderLabel(subject);
  const text = input.text.trim();
  return appendAudit({
    ...baseOf(subject),
    kind: "message_blocked",
    status: "blocked",
    title: `消息拦截 · ${label}`,
    summary: text ? `被拦截用户 ${label}：${text}` : `被拦截用户 ${label}（无文本内容）`,
    reason: input.reason,
    ...(text ? { userText: text } : {}),
    sections: [
      { heading: `被拦截用户 ${label} 发送给昔涟的内容`, body: text || "（无文本内容，可能是图片/语音等附件消息）" },
      { heading: "拦截理由", body: input.reason },
    ],
  });
}

/** 记录一次异常失败的对话轮次（超时 / 运行时错误 / 调用异常）。 */
export function recordTurnFailure(
  subject: ChannelAuditSubject,
  input: { userText?: string; reply?: string; reason: string; detail?: string; durationMs?: number },
): ChannelAuditEntry {
  const userText = input.userText?.trim() ?? "";
  return appendAudit({
    ...baseOf(subject),
    kind: "turn_failed",
    status: "failure",
    title: `对话失败 · ${senderLabel(subject)}`,
    summary: input.reason,
    reason: input.reason,
    ...(typeof input.durationMs === "number" ? { durationMs: input.durationMs } : {}),
    ...(userText ? { userText } : {}),
    sections: [
      { heading: "用户发送给昔涟的原文", body: userText || "（无文本内容）" },
      ...(input.reply ? [{ heading: "已生成但未收尾的回复", body: input.reply }] : []),
      { heading: "失败原因", body: input.detail || input.reason },
    ],
  });
}

/** 记录一次成功收尾的对话轮次（默认不记录，由控制台开关打开）。 */
export function recordTurnSuccess(
  subject: ChannelAuditSubject,
  input: { userText?: string; reply: string; durationMs?: number; tools?: string[] },
): ChannelAuditEntry {
  const userText = input.userText?.trim() ?? "";
  const reply = input.reply.trim();
  return appendAudit({
    ...baseOf(subject),
    kind: "turn_success",
    status: "success",
    title: `对话成功 · ${senderLabel(subject)}`,
    summary: reply ? `昔涟：${reply}` : "（本轮没有文本回复）",
    ...(typeof input.durationMs === "number" ? { durationMs: input.durationMs } : {}),
    ...(userText ? { userText } : {}),
    sections: [
      { heading: "用户发送给昔涟的原文", body: userText || "（无文本内容）" },
      { heading: "昔涟的回复", body: reply || "（本轮没有文本回复）" },
      ...(input.tools && input.tools.length > 0
        ? [{ heading: "本轮调用过的工具", body: input.tools.join("\n") }]
        : []),
    ],
  });
}
