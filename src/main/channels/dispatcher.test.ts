// dispatcher 核心单元测试：sessionId hash + 限速
import * as os from "node:os";
import { describe, it, expect, vi } from "vitest";
import {
  ChannelDispatcher,
  makeSessionId,
  type DispatcherDeps,
} from "./dispatcher";
import { appendHistory, migrateHistory } from "./history-log";
import { appendLog, reloadLogFromDisk } from "./message-log";
import { recordMessageBlocked } from "./audit-events";
import { createOutgoingComposer } from "./outgoing-composer";
import { createChannelContext, type ChannelContext } from "./channel-context";
import { createKeyedQueue } from "./keyed-queue";
import { createChannelRateLimiter } from "./rate-limiter";
import { createChannelDeliveryService } from "./delivery-service";
import type { ChannelsSettings } from "./settings-store";
import type { IncomingMessage, OutgoingMessage } from "./types";

vi.mock("electron", () => ({
  app: {
    getPath: () => os.tmpdir(),
    getAppPath: () => process.cwd(),
    getName: () => "Cyrene",
  },
  safeStorage: {
    isEncryptionAvailable: () => false,
  },
}));

vi.mock("./message-log", () => ({
  appendLog: vi.fn(),
  reloadLogFromDisk: vi.fn(),
}));

vi.mock("./history-log", () => ({
  appendHistory: vi.fn(),
  migrateHistory: vi.fn(),
}));

vi.mock("./audit-events", () => ({
  recordMessageBlocked: vi.fn(),
  recordTurnFailure: vi.fn(),
  recordTurnSuccess: vi.fn(),
}));

describe("channels/dispatcher", () => {
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

  function makeManager(
    send: (message: OutgoingMessage) => Promise<{ ok: boolean; error?: string }>
      = vi.fn(async () => ({ ok: true })),
  ) {
    return {
      getAdapter: () => ({
        capability: { text: true, image: true, audio: false, file: false, video: false, markdown: false, card: false, sticker: false, maxTextLength: 4000 },
        send,
      }),
    } as any;
  }

  type TestDispatcherOptions = Partial<DispatcherDeps> & {
    manager?: ReturnType<typeof makeManager>;
    loadRecentChannelHistory?: Parameters<typeof createChannelContext>[0]["loadRecentChannelHistory"];
  };

  function makeDispatcher(options: TestDispatcherOptions): ChannelDispatcher {
    const manager = options.manager ?? makeManager();
    const baseComposer = options.composer ?? createOutgoingComposer({
      resolveStickerImagePath: (stickerId) => stickerId === "OK" ? "C:/stickers/ok.png" : null,
    });
    return new ChannelDispatcher({
      queue: options.queue ?? createKeyedQueue({ maxPendingPerKey: 20 }),
      limiter: options.limiter ?? createChannelRateLimiter({
        limits: { perUser: 10, perChannel: 100 },
      }),
      context: options.context ?? createChannelContext({
        loadRecentChannelHistory: options.loadRecentChannelHistory,
        appendChannelHistory: appendHistory,
        migrateHistory,
      }),
      composer: {
        compose: (input) => baseComposer.compose({
          ...input,
          capability: manager.getAdapter(input.incoming.channel)?.capability,
        }),
        cleanupTransientFiles: (files) => baseComposer.cleanupTransientFiles(files),
      },
      delivery: options.delivery ?? createChannelDeliveryService(manager),
      buildAndRunAgent: options.buildAndRunAgent ?? (async (msg) => ({
        text: `[回声][${msg.channel}][${msg.senderId}] ${msg.text}`,
        sticker: null,
      })),
      loadSettings: options.loadSettings ?? (() => ({
        rateLimitPerUser: 10,
        rateLimitPerChannel: 100,
        ttsEnabled: true,
        stickerEnabled: true,
        keywords: { intercept: [], trigger: [] },
        audit: { recordSuccessTurns: false },
      } as ChannelsSettings)),
      loadGeneralSettings: options.loadGeneralSettings ?? (() => ({})),
      observeExternalChat: options.observeExternalChat,
    });
  }

  async function flushMicrotasks(rounds = 12): Promise<void> {
    for (let index = 0; index < rounds; index += 1) {
      await Promise.resolve();
    }
  }

  it("构造调度器时不读取消息日志", () => {
    vi.mocked(reloadLogFromDisk).mockClear();

    makeDispatcher({});

    expect(reloadLogFromDisk).not.toHaveBeenCalled();
  });

  it("uses channel history and channel session when the chat is unbound", async () => {
    const loadRecentChannelHistory = vi.fn(async () => [{ role: "user" as const, content: "渠道旧消息" }]);
    const buildAndRunAgent = vi.fn(async (_msg: IncomingMessage, sessionId: string, prior?: Array<{ role: string; content?: string }>) => {
      expect(sessionId).toBe(makeSessionId("qq", "chat-1"));
      expect(prior).toEqual([{ role: "user", content: "渠道旧消息" }]);
      return { text: "渠道回复", sticker: null };
    });
    const dispatcher = makeDispatcher({ manager: makeManager(), loadRecentChannelHistory, buildAndRunAgent });

    const result = await dispatcher.handleIncoming(makeIncoming());

    expect(result?.targetId).toBe("chat-1");
    expect(loadRecentChannelHistory).toHaveBeenCalledWith(makeSessionId("qq", "chat-1"), 16);
    expect(buildAndRunAgent).toHaveBeenCalledOnce();
  });

  it("通过注入的上下文模块读取和提交会话状态", async () => {
    const priorMessages = [{ role: "user" as const, content: "模块历史" }];
    const contextService: ChannelContext = {
      resolveDispatchContext: vi.fn((sessionId: string) => ({
        sessionId,
      })),
      recordIncomingSession: vi.fn(),
      resolvePriorMessages: vi.fn(async () => priorMessages),
      appendIncomingContext: vi.fn(async () => undefined),
      appendAssistantContext: vi.fn(async () => undefined),
    };
    const buildAndRunAgent = vi.fn(async (
      _msg: IncomingMessage,
      _sessionId: string,
      prior?: Array<{ role: string; content?: string }>,
    ) => {
      expect(prior).toEqual(priorMessages);
      return { text: "模块回复", sticker: null };
    });
    const dispatcher = makeDispatcher({
      manager: makeManager(),
      context: contextService,
      buildAndRunAgent,
    });

    await dispatcher.handleIncoming(makeIncoming());

    expect(contextService.recordIncomingSession).toHaveBeenCalledOnce();
    expect(contextService.appendIncomingContext).toHaveBeenCalledOnce();
    expect(contextService.appendAssistantContext).toHaveBeenCalledOnce();
  });

  it("does not persist a selected sticker when the channel capability rejects stickers", async () => {
    const contextService: ChannelContext = {
      resolveDispatchContext: vi.fn((sessionId: string) => ({ sessionId })),
      recordIncomingSession: vi.fn(),
      resolvePriorMessages: vi.fn(async () => []),
      appendIncomingContext: vi.fn(async () => undefined),
      appendAssistantContext: vi.fn(async () => undefined),
    };
    const appendAssistantContext = vi.mocked(contextService.appendAssistantContext);
    const dispatcher = makeDispatcher({
      // makeManager 的默认能力是 sticker: false；而 resolveStickerImagePath 能解析 "OK"，
      // 所以这里唯一会让表情包消失的就是渠道能力判定。
      manager: makeManager(),
      context: contextService,
      buildAndRunAgent: vi.fn(async () => ({ text: "收到", sticker: "OK" })),
    });

    await dispatcher.handleIncoming(makeIncoming());

    expect(appendAssistantContext).toHaveBeenCalledOnce();
    const prepared = appendAssistantContext.mock.calls[0][2];
    expect(prepared.message.parts.some((part) => part.kind === "sticker")).toBe(false);
    expect(prepared).not.toHaveProperty("stickerId");
  });

  it("渠道历史读取失败时照常回复（本轮不带历史）", async () => {
    const channelSessionId = makeSessionId("qq", "chat-1");
    const loadRecentChannelHistory = vi.fn(async () => {
      throw new Error("transcript 读不了");
    });
    const buildAndRunAgent = vi.fn(async (_msg: IncomingMessage, sessionId: string, prior?: Array<{ role: string; content?: string }>) => {
      expect(sessionId).toBe(channelSessionId);
      expect(prior).toBeUndefined();
      return { text: "回复", sticker: null };
    });
    const dispatcher = makeDispatcher({
      manager: makeManager(),
      loadRecentChannelHistory,
      buildAndRunAgent,
    });

    const result = await dispatcher.handleIncoming(makeIncoming());

    expect(loadRecentChannelHistory).toHaveBeenCalledWith(channelSessionId, 16);
    expect(buildAndRunAgent).toHaveBeenCalledOnce();
    expect(result?.targetId).toBe("chat-1");
  });

  it("适配器明确发送失败时不提交助手状态", async () => {
    vi.mocked(appendHistory).mockClear();
    vi.mocked(appendLog).mockClear();
    const send = vi.fn(async () => ({ ok: false, error: "offline" }));
    const channelContext = createChannelContext({
      appendChannelHistory: appendHistory,
      migrateHistory,
    });
    const appendAssistantContext = vi.fn(channelContext.appendAssistantContext);
    const dispatcher = makeDispatcher({
      manager: makeManager(send),
      context: { ...channelContext, appendAssistantContext },
      buildAndRunAgent: vi.fn(async () => ({ text: "回复", sticker: null })),
    });

    const result = await dispatcher.handleIncoming(makeIncoming());

    expect(result).toBeNull();
    expect(send).toHaveBeenCalledOnce();
    // 入站消息照常落库，助手状态只在渠道确认发送成功后提交：发送失败时必须一次都没提交。
    expect(appendHistory).toHaveBeenCalledTimes(1);
    expect(appendAssistantContext).not.toHaveBeenCalled();
    expect(appendHistory).not.toHaveBeenCalledWith(
      makeSessionId("qq", "chat-1"),
      "assistant",
      expect.any(String),
      expect.anything(),
    );
    expect(appendLog).not.toHaveBeenCalledWith(
      expect.objectContaining({ dir: "outgoing" }),
    );
  });

  it("通过注入的传输服务发送并在确认成功后提交", async () => {
    vi.mocked(appendHistory).mockClear();
    const dispatcher = makeDispatcher({
      manager: { getAdapter: () => undefined } as any,
      delivery: {
        send: vi.fn(async () => ({ ok: true })),
      },
      buildAndRunAgent: vi.fn(async () => ({ text: "传输成功", sticker: null })),
    });

    const result = await dispatcher.handleIncoming(makeIncoming());

    expect(result?.parts).toEqual([{ kind: "text", text: "传输成功" }]);
    expect(appendHistory).toHaveBeenCalledWith(
      makeSessionId("qq", "chat-1"),
      "assistant",
      "传输成功",
      { isBot: true },
    );
  });

  it.each([
    ["发送成功", { ok: true } as const, false],
    ["发送失败", { ok: false, error: "offline" } as const, true],
  ])("%s后清理本轮生成的临时音频", async (_name, deliveryResult, expectsNull) => {
    const files = new Map<string, Buffer>();
    let filePresentDuringSend = false;
    const composer = createOutgoingComposer({
      audioDirectory: "C:/virtual/channels/audio",
      createId: () => "reply-audio",
      writeFile: async (filePath, data) => {
        files.set(filePath, data);
      },
      removeFile: async (filePath) => {
        files.delete(filePath);
      },
      synthesizeTts: async () => Buffer.from("audio"),
      resolveStickerImagePath: () => null,
    });
    const manager = {
      getAdapter: () => ({
        capability: {
          text: true,
          image: true,
          audio: true,
          file: true,
          video: true,
          markdown: true,
          card: true,
          sticker: true,
          maxTextLength: 4000,
        },
      }),
    } as any;
    const dispatcher = makeDispatcher({
      manager,
      composer,
      delivery: {
        send: async (message) => {
          const audio = message.parts.find((part) => part.kind === "audio");
          filePresentDuringSend = Boolean(
            audio?.kind === "audio" && files.has(audio.filePath),
          );
          return deliveryResult;
        },
      },
      buildAndRunAgent: vi.fn(async () => ({ text: "语音回复", sticker: null })),
    });

    const result = await dispatcher.handleIncoming(makeIncoming({ channel: "feishu" }));

    expect(filePresentDuringSend).toBe(true);
    expect(files.size).toBe(0);
    expect(result === null).toBe(expectsNull);
  });

  it("同一个外部会话的消息必须串行执行完整处理链", async () => {
    const events: string[] = [];
    let releaseFirst!: () => void;
    let markFirstStarted!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const firstStarted = new Promise<void>((resolve) => {
      markFirstStarted = resolve;
    });
    let runCount = 0;
    const dispatcher = makeDispatcher({
      manager: makeManager(vi.fn(async (outgoing) => {
        events.push(`${outgoing.targetId}:sent`);
        return { ok: true };
      })),
      buildAndRunAgent: vi.fn(async (msg) => {
        runCount += 1;
        events.push(`${msg.text}:agent:start`);
        if (runCount === 1) {
          markFirstStarted();
          await firstGate;
        }
        events.push(`${msg.text}:agent:end`);
        return { text: `回复:${msg.text}`, sticker: null };
      }),
    });

    const first = dispatcher.handleIncoming(makeIncoming({ text: "第一条" }));
    await firstStarted;
    const second = dispatcher.handleIncoming(makeIncoming({ text: "第二条" }));
    await flushMicrotasks();

    try {
      expect(events).not.toContain("第二条:agent:start");
    } finally {
      releaseFirst();
      await Promise.all([first, second]);
    }
    expect(events.indexOf("第二条:agent:start"))
      .toBeGreaterThan(events.indexOf("chat-1:sent"));
  });

  it("不同外部会话之间互不等待，同一外部会话内仍然串行", async () => {
    const events: string[] = [];
    let releaseFirst!: () => void;
    let markFirstStarted!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const firstStarted = new Promise<void>((resolve) => {
      markFirstStarted = resolve;
    });
    let runCount = 0;
    const dispatcher = makeDispatcher({
      manager: makeManager(vi.fn(async (outgoing) => {
        events.push(`${outgoing.targetId}:sent`);
        return { ok: true };
      })),
      buildAndRunAgent: vi.fn(async (msg) => {
        runCount += 1;
        events.push(`${msg.text}:agent:start`);
        if (runCount === 1) {
          markFirstStarted();
          await firstGate;
        }
        events.push(`${msg.text}:agent:end`);
        return { text: `回复:${msg.text}`, sticker: null };
      }),
    });

    const first = dispatcher.handleIncoming(makeIncoming({ text: "第一条" }));
    await firstStarted;
    // 同一外部会话（chat-1）的第二条必须排在第一条整条处理链之后
    const second = dispatcher.handleIncoming(makeIncoming({ text: "第二条" }));
    // 另一条外部会话（chat-2）有自己的队列键，不受第一条阻塞
    const other = dispatcher.handleIncoming(makeIncoming({
      senderId: "user-2",
      chatId: "chat-2",
      text: "第三条",
    }));
    await flushMicrotasks();

    try {
      expect(events).not.toContain("第二条:agent:start");
      expect(events).toContain("第三条:agent:start");
    } finally {
      releaseFirst();
      await Promise.all([first, second, other]);
    }
    expect(events.indexOf("第二条:agent:start"))
      .toBeGreaterThan(events.indexOf("chat-1:sent"));
  });

  it("不同外部会话之间保持并行", async () => {
    const events: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const dispatcher = makeDispatcher({
      manager: makeManager(),
      buildAndRunAgent: vi.fn(async (msg) => {
        events.push(`${msg.chatId}:agent:start`);
        await gate;
        return { text: `回复:${msg.chatId}`, sticker: null };
      }),
    });

    const first = dispatcher.handleIncoming(makeIncoming({
      senderId: "user-a",
      chatId: "chat-a",
    }));
    const second = dispatcher.handleIncoming(makeIncoming({
      senderId: "user-b",
      chatId: "chat-b",
    }));
    await flushMicrotasks();

    try {
      expect(new Set(events)).toEqual(new Set([
        "chat-a:agent:start",
        "chat-b:agent:start",
      ]));
    } finally {
      release();
      await Promise.all([first, second]);
    }
  });

  it("命中拦截关键词时直接拦截：不进智能体、不消耗额度，并写入拦截记录", async () => {
    vi.mocked(recordMessageBlocked).mockClear();
    const buildAndRunAgent = vi.fn(async () => ({ text: "不该出现的回复", sticker: null }));
    const dispatcher = makeDispatcher({
      loadSettings: () => ({
        rateLimitPerUser: 10,
        rateLimitPerChannel: 100,
        keywords: { intercept: ["加微信"], trigger: [] },
      } as ChannelsSettings),
      buildAndRunAgent,
    });

    const result = await dispatcher.handleIncoming(makeIncoming({ text: "你好，加微信详聊" }));

    expect(result).toBeNull();
    expect(buildAndRunAgent).not.toHaveBeenCalled();
    expect(vi.mocked(recordMessageBlocked)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(recordMessageBlocked).mock.calls[0][0]).toMatchObject({
      channel: "qq",
      chatType: "private",
      chatId: "chat-1",
      senderId: "user-1",
      senderName: "测试用户",
    });
    expect(vi.mocked(recordMessageBlocked).mock.calls[0][1]).toEqual({
      text: "你好，加微信详聊",
      reason: "命中拦截关键词「加微信」",
    });
  });

  it("未命中拦截关键词时照常处理", async () => {
    vi.mocked(recordMessageBlocked).mockClear();
    const buildAndRunAgent = vi.fn(async () => ({ text: "在的呀", sticker: null }));
    const dispatcher = makeDispatcher({
      loadSettings: () => ({
        rateLimitPerUser: 10,
        rateLimitPerChannel: 100,
        keywords: { intercept: ["加微信"], trigger: [] },
      } as ChannelsSettings),
      buildAndRunAgent,
    });

    const result = await dispatcher.handleIncoming(makeIncoming({ text: "今天天气不错" }));

    expect(buildAndRunAgent).toHaveBeenCalledTimes(1);
    expect(result).not.toBeNull();
    expect(recordMessageBlocked).not.toHaveBeenCalled();
  });

  // ── P2 归属链路起点：第 4 参数 = P1 落盘消息 id ──

  it("把 appendIncomingContext 落盘得到的 id 作为第 4 参数交给 agent", async () => {
    const userEntry = {
      id: "msg_1758681234567_a3f9k2",
      role: "user" as const,
      content: "你好",
      at: new Date(0).toISOString(),
    };
    const contextService: ChannelContext = {
      resolveDispatchContext: vi.fn((sessionId: string) => ({ sessionId })),
      recordIncomingSession: vi.fn(),
      resolvePriorMessages: vi.fn(async () => undefined),
      appendIncomingContext: vi.fn(async () => userEntry),
      appendAssistantContext: vi.fn(async () => undefined),
    };
    const buildAndRunAgent = vi.fn(async () => ({ text: "在的呀", sticker: null }));
    const dispatcher = makeDispatcher({ context: contextService, buildAndRunAgent });

    await dispatcher.handleIncoming(makeIncoming());

    expect(buildAndRunAgent).toHaveBeenCalledOnce();
    const args = buildAndRunAgent.mock.calls[0] as unknown[];
    expect(args[0]).toMatchObject({ channel: "qq", senderId: "user-1" });
    expect(args[1]).toBe(makeSessionId("qq", "chat-1"));
    expect(args[2]).toBeUndefined();
    expect(args[3]).toBe("msg_1758681234567_a3f9k2");
  });

  it("落盘失败（appendIncomingContext 返回 null）时第 4 参数为 undefined，不阻断对话", async () => {
    const contextService: ChannelContext = {
      resolveDispatchContext: vi.fn((sessionId: string) => ({ sessionId })),
      recordIncomingSession: vi.fn(),
      resolvePriorMessages: vi.fn(async () => undefined),
      appendIncomingContext: vi.fn(async () => null),
      appendAssistantContext: vi.fn(async () => undefined),
    };
    const buildAndRunAgent = vi.fn(async () => ({ text: "在的呀", sticker: null }));
    const dispatcher = makeDispatcher({ context: contextService, buildAndRunAgent });

    const result = await dispatcher.handleIncoming(makeIncoming());

    expect(result).not.toBeNull();
    expect((buildAndRunAgent.mock.calls[0] as unknown[])[3]).toBeUndefined();
  });

  it("真链路（createChannelContext + appendHistory 桩）：第 4 参数就是落盘那条记录的 id", async () => {
    const appendChannelHistory = vi.fn(() => ({
      id: "msg_real_0001",
      role: "user" as const,
      content: "你好",
      at: new Date(0).toISOString(),
    }));
    const buildAndRunAgent = vi.fn(async () => ({ text: "在的呀", sticker: null }));
    const dispatcher = makeDispatcher({
      context: createChannelContext({ migrateHistory, appendChannelHistory }),
      buildAndRunAgent,
    });

    await dispatcher.handleIncoming(makeIncoming());

    // 落盘那条记录的 id 与交给 agent 的第 4 参数必须是同一个
    const persisted = appendChannelHistory.mock.results[0]?.value as { id: string };
    expect(persisted.id).toBe("msg_real_0001");
    expect((buildAndRunAgent.mock.calls[0] as unknown[])[3]).toBe(persisted.id);
  });
});
