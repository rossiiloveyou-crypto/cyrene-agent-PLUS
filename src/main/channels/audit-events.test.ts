import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ChannelAuditInput, ChannelAuditEntry } from "./audit-log";
import { recordMessageBlocked, recordTurnFailure, recordTurnSuccess } from "./audit-events";

const captured: ChannelAuditInput[] = [];

vi.mock("./audit-log", () => ({
  appendAudit: (input: ChannelAuditInput) => {
    captured.push(input);
    return { ...input, id: "audit-1", at: 1, logPath: "/tmp/a.log" } as ChannelAuditEntry;
  },
}));

const subject = {
  channel: "qq" as const,
  chatType: "group" as const,
  chatId: "2000",
  senderId: "10001",
  senderName: "阿岚",
  sessionId: "session-1",
  trigger: "trigger_keyword" as const,
};

describe("channels/audit-events", () => {
  beforeEach(() => {
    captured.length = 0;
  });

  it("拦截记录带上发送者与原文，摘要形如「被拦截用户 A：内容」", () => {
    recordMessageBlocked(subject, { text: "加我微信", reason: "命中拦截关键词「加微信」" });

    expect(captured[0]).toMatchObject({
      kind: "message_blocked",
      status: "blocked",
      title: "消息拦截 · 阿岚（10001）",
      summary: "被拦截用户 阿岚（10001）：加我微信",
      reason: "命中拦截关键词「加微信」",
      userText: "加我微信",
      trigger: "trigger_keyword",
    });
    expect(captured[0].sections?.[0]).toEqual({
      heading: "被拦截用户 阿岚（10001） 发送给昔涟的内容",
      body: "加我微信",
    });
  });

  it("没有文本的拦截也留痕（图片/语音消息）", () => {
    recordMessageBlocked(subject, { text: "   ", reason: "群 2000 不在群聊白名单中" });

    expect(captured[0].summary).toBe("被拦截用户 阿岚（10001）（无文本内容）");
    expect(captured[0].userText).toBeUndefined();
    expect(captured[0].sections?.[0].body).toContain("附件消息");
  });

  it("失败轮次记录原因、原文与堆栈段落", () => {
    recordTurnFailure(subject, {
      userText: "帮我删掉整个目录",
      reply: "好的，我这就",
      reason: "运行时错误（E_MODEL_REQUEST_FAILED）",
      detail: "Error: boom",
      durationMs: 1234,
    });

    expect(captured[0]).toMatchObject({
      kind: "turn_failed",
      status: "failure",
      title: "对话失败 · 阿岚（10001）",
      reason: "运行时错误（E_MODEL_REQUEST_FAILED）",
      userText: "帮我删掉整个目录",
      durationMs: 1234,
    });
    expect(captured[0].sections?.map((section) => section.heading)).toEqual([
      "用户发送给昔涟的原文",
      "已生成但未收尾的回复",
      "失败原因",
    ]);
  });

  it("成功轮次只在开关打开时被调用，并写入回复全文", () => {
    recordTurnSuccess(subject, { userText: "在吗", reply: "在的呀" });

    expect(captured[0]).toMatchObject({
      kind: "turn_success",
      status: "success",
      summary: "昔涟：在的呀",
    });
    expect(captured[0].sections?.[1]).toEqual({ heading: "昔涟的回复", body: "在的呀" });
  });
});
