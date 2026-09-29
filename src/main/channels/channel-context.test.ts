import { describe, expect, it, vi } from "vitest";
import {
  createChannelContext,
  forgetSessionIndex,
  formatChannelUserText,
  lookupOriginalSender,
  makeSessionId,
} from "./channel-context";
import type { IncomingMessage } from "./types";
import type { CreateChannelContextOptions } from "./channel-context";

function makeIncoming(overrides: Partial<IncomingMessage> = {}): IncomingMessage {
  return {
    channel: "qq",
    chatType: "private",
    senderId: "user-1",
    senderName: "测试用户",
    chatId: "chat-1",
    text: "你好",
    at: new Date(0),
    ...overrides,
  };
}

describe("渠道上下文", () => {
  it("为同一渠道会话生成稳定标识", () => {
    expect(makeSessionId("feishu", "ou_abc123"))
      .toBe(makeSessionId("feishu", "ou_abc123"));
  });

  it("隔离不同渠道和不同聊天", () => {
    expect(makeSessionId("feishu", "user-x"))
      .not.toBe(makeSessionId("wechat", "user-x"));
    expect(makeSessionId("qq", "10001"))
      .not.toBe(makeSessionId("qq", "10002"));
  });

  it("生成带渠道前缀和 16 位摘要的标识", () => {
    expect(makeSessionId("feishu", "ou_abc"))
      .toMatch(/^channel:feishu:[0-9a-f]{16}$/);
  });

  it("未知会话无法反查发送者", () => {
    expect(lookupOriginalSender("channel:feishu:0000000000000000")).toBeNull();
  });

  // P3：擦除某人时要一并清掉调试索引（唯一读取方是 lookupOriginalSender）
  describe("forgetSessionIndex（P3）", () => {
    it("只清该 senderId 的条目，别人的会话照常可反查", () => {
      const context = createChannelContext({
        appendChannelHistory: vi.fn(),
        migrateHistory: vi.fn(),
      });
      const mineA = makeSessionId("qq", "20001");
      const mineB = makeSessionId("qq", "20002");
      const theirs = makeSessionId("qq", "20003");

      context.recordIncomingSession(makeIncoming({ channel: "qq", senderId: "10001", chatId: "20001" }), { sessionId: mineA });
      context.recordIncomingSession(makeIncoming({ channel: "qq", senderId: "10001", chatId: "20002" }), { sessionId: mineB });
      context.recordIncomingSession(makeIncoming({ channel: "qq", senderId: "10002", chatId: "20003" }), { sessionId: theirs });

      const removed = forgetSessionIndex("10001");

      expect(removed).toBe(2);
      expect(lookupOriginalSender(mineA)).toBeNull();
      expect(lookupOriginalSender(mineB)).toBeNull();
      expect(lookupOriginalSender(theirs)).toEqual({ channel: "qq", senderId: "10002" });
    });

    it("幂等：重复清理同一个 senderId 返回 0，未知 senderId 也不报错", () => {
      const context = createChannelContext({
        appendChannelHistory: vi.fn(),
        migrateHistory: vi.fn(),
      });
      const sessionId = makeSessionId("qq", "20004");
      context.recordIncomingSession(makeIncoming({ channel: "qq", senderId: "10005", chatId: "20004" }), { sessionId });

      expect(forgetSessionIndex("10005")).toBe(1);
      expect(forgetSessionIndex("10005")).toBe(0);
      expect(forgetSessionIndex("查无此人")).toBe(0);
    });
  });

  it("群聊文本保留发送者和引用上下文", () => {
    expect(formatChannelUserText(makeIncoming({
      chatType: "group",
      senderId: "10001",
      senderName: "小明",
      chatId: "20001",
      text: "你好",
      reply: {
        messageId: "message-1",
        senderId: "10002",
        senderName: "小红",
        text: "前一条消息",
      },
    }))).toBe("[群聊发送者：小明 (10001)]\n引用 小红：前一条消息\n你好");
  });

  it("记录会话时迁移旧发送者键并支持反查", () => {
    const migrateHistory = vi.fn();
    const context = createChannelContext({
      migrateHistory,
    });
    const msg = makeIncoming({
      channel: "feishu",
      senderId: "ou_sender",
      chatId: "oc_chat",
    });
    const sessionId = makeSessionId(msg.channel, msg.chatId);

    context.recordIncomingSession(msg, { sessionId });

    expect(migrateHistory).toHaveBeenCalledWith(
      makeSessionId("feishu", "ou_sender"),
      sessionId,
    );
    expect(lookupOriginalSender(sessionId)).toEqual({
      channel: "feishu",
      senderId: "ou_sender",
    });
  });

  it("渠道历史读取失败时返回 undefined（不带历史）", async () => {
    const context = createChannelContext({
      loadRecentChannelHistory: async () => {
        throw new Error("transcript 读不了");
      },
      appendChannelHistory: vi.fn(),
      migrateHistory: vi.fn(),
    });

    await expect(context.resolvePriorMessages({
      sessionId: "channel:qq:abc",
    }, 16)).resolves.toBeUndefined();
  });

  it("群聊带引用时只剥发送者前缀，引用行保留在历史正文里", async () => {
    const appendChannelHistory = vi.fn();
    const context = createChannelContext({
      appendChannelHistory,
      migrateHistory: vi.fn(),
    });
    const msg = makeIncoming({
      chatType: "group",
      senderId: "10001",
      senderName: "小明",
      chatId: "20001",
      text: "你好",
      reply: {
        messageId: "message-1",
        senderId: "10002",
        senderName: "小红",
        text: "前一条消息",
      },
    });

    await context.appendIncomingContext(msg, {
      sessionId: makeSessionId("qq", "20001"),
    });

    const [sid, role, content, meta] = appendChannelHistory.mock.calls[0];
    expect(sid).toBe(makeSessionId("qq", "20001"));
    expect(role).toBe("user");
    // 不双前缀
    expect(content).not.toContain("[群聊发送者：");
    // 引用行是正文语义，必须保留
    expect(content).toBe("引用 小红：前一条消息\n你好");
    expect(meta).toEqual({
      speakerId: "10001",
      speakerName: "小明",
      isBot: false,
      triggered: true,
    });
  });

  it("群聊命中触发关键词时提示行保留在历史正文里", async () => {
    const appendChannelHistory = vi.fn();
    const context = createChannelContext({
      appendChannelHistory,
      migrateHistory: vi.fn(),
    });
    const msg = makeIncoming({
      chatType: "group",
      senderId: "10001",
      senderName: "小明",
      chatId: "20001",
      text: "你好",
      trigger: "trigger_keyword",
    });

    await context.appendIncomingContext(msg, {
      sessionId: makeSessionId("qq", "20001"),
    });

    const [, , content] = appendChannelHistory.mock.calls[0];
    expect(content).not.toContain("[群聊发送者：");
    expect(content).toBe(
      "[本条消息命中触发关键词（未 @ 你），按约定需要你回复]\n你好",
    );
  });

  // —— 缺陷 #2 回归：昵称里带 `]` 会打穿发送者前缀剥离 ——
  // 旧的 `[^\]\n]+` 在昵称内部的 `]` 上就收尾，剥出 "BEIKIA (2914636187)]\n111" 这种残片，
  // 再被 bootstrap 拼成 `[[b°t]BEIKIA]: BEIKIA (2914636187)]\n111` 喂给模型。
  it("昵称含 ] 时仍完整剥掉发送者前缀", async () => {
    const appendChannelHistory = vi.fn();
    const context = createChannelContext({
      appendChannelHistory,
      migrateHistory: vi.fn(),
    });
    const msg = makeIncoming({
      chatType: "group",
      senderId: "2914636187",
      senderName: "[b°t]BEIKIA",
      chatId: "20001",
      text: "111",
    });
    const dispatchContext = {
      sessionId: makeSessionId("qq", "20001"),
    };

    await context.appendIncomingContext(msg, dispatchContext);

    const [, , content, meta] = appendChannelHistory.mock.calls[0];
    expect(content).toBe("111");
    expect(content).not.toContain("[群聊发送者：");
    expect(content).not.toContain("2914636187");
    // 残缺括号绝不能漏进结构化字段（否则模型看到 `[[b°t]BEIKIA]: …`）
    expect(meta).toEqual({
      speakerId: "2914636187",
      speakerName: "[b°t]BEIKIA",
      isBot: false,
      triggered: true,
    });
  });

  it("昵称含 ] 且带引用 / 触发提示时，只剥前缀不伤正文", async () => {
    const appendChannelHistory = vi.fn();
    const context = createChannelContext({
      appendChannelHistory,
      migrateHistory: vi.fn(),
    });

    await context.appendIncomingContext(makeIncoming({
      chatType: "group",
      senderId: "2914636187",
      senderName: "[b°t]BEIKIA",
      chatId: "20001",
      text: "你好",
      reply: { messageId: "m1", senderId: "10002", senderName: "小红", text: "前一条" },
    }), {
      sessionId: makeSessionId("qq", "20001"),
    });
    expect(appendChannelHistory.mock.calls[0][2])
      .toBe("引用 小红：前一条\n你好");

    appendChannelHistory.mockClear();
    await context.appendIncomingContext(makeIncoming({
      chatType: "group",
      senderId: "2914636187",
      senderName: "[b°t]BEIKIA",
      chatId: "20001",
      text: "你好",
      trigger: "trigger_keyword",
    }), {
      sessionId: makeSessionId("qq", "20001"),
    });
    expect(appendChannelHistory.mock.calls[0][2])
      .toBe("[本条消息命中触发关键词（未 @ 你），按约定需要你回复]\n你好");
  });

  it("私聊写入渠道历史完全不变：原始文本、不传 meta", async () => {
    const appendChannelHistory = vi.fn();
    const context = createChannelContext({
      appendChannelHistory,
      migrateHistory: vi.fn(),
    });
    const msg = makeIncoming({ chatType: "private", senderId: "user-1", text: "你好" });

    await context.appendIncomingContext(msg, {
      sessionId: makeSessionId("qq", "user-1"),
    });

    expect(appendChannelHistory).toHaveBeenCalledWith(
      makeSessionId("qq", "user-1"),
      "user",
      "你好",
      undefined,
    );
  });

  it("助手上下文写入渠道历史并保留已发送表情", async () => {
    const appendChannelHistory = vi.fn();
    const context = createChannelContext({
      appendChannelHistory,
      migrateHistory: vi.fn(),
    });
    const msg = makeIncoming({ channel: "wechat" });
    const dispatchContext = {
      sessionId: makeSessionId("wechat", "chat-1"),
    };

    await context.appendAssistantContext(msg, dispatchContext, {
      message: {
        channel: "wechat",
        targetId: "chat-1",
        parts: [{ kind: "text", text: "收到" }],
      },
      assistantText: "收到",
      stickerId: "OK",
      transientFiles: [],
    });

    expect(appendChannelHistory).toHaveBeenCalledWith(
      dispatchContext.sessionId,
      "assistant",
      "收到",
      { isBot: true },
    );
  });

  // Phase 3 P1：把「写入点生成的 id」冒泡到 dispatcher 层（P2 才消费）。
  describe("历史写入返回值 (Phase 3 P1)", () => {
    const PERSISTED = {
      id: "msg_1758681234567_a3f9k2",
      role: "user" as const,
      content: "你好",
      at: "2026-09-24T00:00:00.000Z",
    };

    function makePrepared() {
      return {
        message: {
          channel: "wechat" as const,
          targetId: "chat-1",
          parts: [{ kind: "text" as const, text: "收到" }],
        },
        assistantText: "收到",
        stickerId: "OK",
        transientFiles: [],
      };
    }

    it("appendIncomingContext 原样返回 appendChannelHistory 落盘的对象", async () => {
      const appendChannelHistory = vi.fn(
        (_sessionId: string, _role: "user" | "assistant", _content: string) => PERSISTED,
      );
      const context = createChannelContext({ appendChannelHistory, migrateHistory: vi.fn() });
      const dispatchContext = { sessionId: makeSessionId("qq", "20001") };

      const entry = await context.appendIncomingContext(makeIncoming({
        chatType: "group", senderId: "10001", senderName: "小明", chatId: "20001",
      }), dispatchContext);

      expect(entry).toBe(PERSISTED);
      expect(entry?.id).toBe("msg_1758681234567_a3f9k2");
      // 入参没被返回值改动
      expect(appendChannelHistory.mock.calls[0][0]).toBe(dispatchContext.sessionId);
    });

    it("appendIncomingContext：appendChannelHistory 返回 null → null", async () => {
      const context = createChannelContext({
        appendChannelHistory: vi.fn(() => null),
        migrateHistory: vi.fn(),
      });
      await expect(context.appendIncomingContext(makeIncoming(), {
        sessionId: makeSessionId("qq", "user-1"),
      })).resolves.toBeNull();
    });

    it("appendIncomingContext：appendChannelHistory 返回 undefined → null（注入点可能不返回值）", async () => {
      const context = createChannelContext({
        appendChannelHistory: vi.fn(() => undefined),
        migrateHistory: vi.fn(),
      });
      await expect(context.appendIncomingContext(makeIncoming(), {
        sessionId: makeSessionId("qq", "user-1"),
      })).resolves.toBeNull();
    });

    it("appendIncomingContext：写入抛错时返回 null 且不冒泡（不中断对话主流程）", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        const context = createChannelContext({
          appendChannelHistory: vi.fn(() => { throw new Error("磁盘满了"); }),
          migrateHistory: vi.fn(),
        });
        await expect(context.appendIncomingContext(makeIncoming({
          chatType: "group", senderId: "10001", senderName: "小明", chatId: "20001",
        }), {
          sessionId: makeSessionId("qq", "20001"),
        })).resolves.toBeNull();
        expect(warn).toHaveBeenCalled();
      } finally {
        warn.mockRestore();
      }
    });

    it("appendIncomingContext：异步实现 reject 同样被吞掉并返回 null", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        const context = createChannelContext({
          appendChannelHistory: vi.fn(async () => { throw new Error("IO 失败"); }),
          migrateHistory: vi.fn(),
        });
        await expect(context.appendIncomingContext(makeIncoming(), {
          sessionId: makeSessionId("qq", "user-1"),
        })).resolves.toBeNull();
        expect(warn).toHaveBeenCalled();
      } finally {
        warn.mockRestore();
      }
    });

    it("appendAssistantContext 原样返回落盘对象", async () => {
      const persisted = { ...PERSISTED, id: "msg_1758681234999_b7c1x9", role: "assistant" as const };
      const appendChannelHistory = vi.fn(
        (_sessionId: string, _role: "user" | "assistant", _content: string) => persisted,
      );
      const context = createChannelContext({ appendChannelHistory, migrateHistory: vi.fn() });

      const entry = await context.appendAssistantContext(
        makeIncoming(),
        { sessionId: makeSessionId("wechat", "chat-1") },
        makePrepared(),
      );

      expect(entry).toBe(persisted);
      expect(entry?.id).toBe("msg_1758681234999_b7c1x9");
    });

    it("appendAssistantContext：null / undefined / 抛错都归一成 null", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        const dispatchContext = { sessionId: makeSessionId("wechat", "chat-1") };
        const impls: CreateChannelContextOptions["appendChannelHistory"][] = [
          () => null,
          () => undefined,
          () => { throw new Error("磁盘满了"); },
        ];
        for (const impl of impls) {
          const context = createChannelContext({
            appendChannelHistory: impl,
            migrateHistory: vi.fn(),
          });
          await expect(context.appendAssistantContext(makeIncoming(), dispatchContext, makePrepared()))
            .resolves.toBeNull();
        }
      } finally {
        warn.mockRestore();
      }
    });
  });
});
