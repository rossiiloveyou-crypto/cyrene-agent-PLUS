// channels/bootstrap 生命周期测试。
// 核心回归点：createChannelsSubsystem 在构造期只创建对象并连接依赖，
// 不做任何初始化/启动 —— initialize / start / shutdown 必须显式调用。
import { describe, it, expect, vi, beforeEach } from "vitest";

const channelMocks = vi.hoisted(() => ({
  observe: vi.fn(),
  flush: vi.fn(),
  buildAndRunAgent: undefined as ((...args: unknown[]) => Promise<unknown>) | undefined,
  dispatcherDeps: [] as Array<Record<string, any>>,
  agentError: undefined as Error | undefined,
  agentResult: { reply: "渠道回复", toolResults: [] } as {
    reply: string;
    toolResults: unknown[];
    terminal?: {
      status: "success" | "timeout";
      reason: string;
      externalEffectsMayContinue: boolean;
    };
  },
}));

vi.mock("electron", () => ({
  app: { getPath: () => "/tmp", whenReady: async () => undefined },
  BrowserWindow: { getAllWindows: () => [], getFocusedWindow: () => null },
  ipcMain: { handle: vi.fn(), removeHandler: vi.fn() },
  safeStorage: { isEncryptionAvailable: () => false },
}));

// init.ts 会被 mock：bootstrap 默认 lifecycle 直接委托到这三个函数
vi.mock("./init", () => ({
  initializeChannels: vi.fn(),
  startChannels: vi.fn(async () => undefined),
  shutdownChannels: vi.fn(async () => undefined),
}));

// 捕获每个调度器实例的构造依赖，以验证真实渠道完成路径和实例隔离。
vi.mock("./dispatcher", () => ({
  ChannelDispatcher: class {
    private readonly deps: Record<string, any>;

    constructor(deps: Record<string, any>) {
      this.deps = deps;
      channelMocks.dispatcherDeps.push(deps);
      channelMocks.buildAndRunAgent = deps.buildAndRunAgent;
    }

    handleIncoming = async (msg: Record<string, unknown>, userMessageId?: string) => (
      this.deps.buildAndRunAgent(msg, `channel:${String(msg.channel)}:test`, [], userMessageId)
    );

    reloadSettings = vi.fn();
  },
}));

vi.mock("./channel-context", () => ({
  formatChannelUserText: vi.fn(() => "渠道问题"),
  createChannelContext: vi.fn(() => ({
    resolveDispatchContext: vi.fn(),
    recordIncomingSession: vi.fn(),
    resolvePriorMessages: vi.fn(),
    appendIncomingContext: vi.fn(),
    appendAssistantContext: vi.fn(),
  })),
}));

// 绑定存储只剩「见过的外部会话」观察记录；它仍是记忆区块成员选择器的数据源。
vi.mock("./conversation-binding-store", () => ({
  getChannelConversationBindingStore: () => ({ observe: channelMocks.observe, flush: channelMocks.flush }),
}));

// 避免拉起真实 tool registry（会级联 import RAG 等重依赖）
vi.mock("../orchestrator/tools/registry/tool-registry", () => ({
  toolRegistry: { getEnabledTools: () => [], getAllTools: () => [] },
}));
vi.mock("../orchestrator/tools/history-tools", () => ({
  indexConversationTurn: vi.fn(),
}));
vi.mock("../orchestrator/cyrene-agent", () => ({
  CyreneAgent: class {
    get lastResult() {
      return channelMocks.agentResult;
    }

    runWithEvents() {
      return { subscribe: ({ complete, error }: { complete: () => void; error: (err: Error) => void }) => {
        if (channelMocks.agentError) error(channelMocks.agentError);
        else complete();
      } };
    }
  },
}));
vi.mock("./settings-store", () => ({
  loadChannelsSettings: () => ({
    toolSandbox: "safe",
    audit: { recordSuccessTurns: false },
  }),
}));
vi.mock("../settings/settings-facade", () => ({
  loadGeneralSettings: () => ({}),
}));
vi.mock("../settings/model-settings", () => ({
  loadModelSettings: () => ({}),
  loadVisionConfig: () => undefined,
  resolveModelSettingsProfile: () => ({ multimodal: false }),
}));
vi.mock("../chat/image-send-strategy", () => ({
  decideImageSendStrategy: () => ({ mode: "none" }),
}));
vi.mock("./agent-input", () => ({
  buildChannelAttachmentInputs: async () => ({ attachments: [], imageAttachments: [] }),
}));
vi.mock("./agent-policy", () => ({
  resolveChannelAgentPolicy: () => ({ exposeTools: false, executionMode: "chat" }),
  enforceChannelAgentPolicy: vi.fn(),
}));

// eslint-disable-next-line import/first
import { createChannelsSubsystem, type ChannelsSubsystemDeps } from "./bootstrap";
// eslint-disable-next-line import/first
import { initializeChannels, startChannels, shutdownChannels } from "./init";
// eslint-disable-next-line import/first
import type { IncomingMessage } from "./types";

function makeChannelsDeps(): ChannelsSubsystemDeps {
  return {
    agentRuntime: {} as ChannelsSubsystemDeps["agentRuntime"],
    ttsSynthesisService: {} as ChannelsSubsystemDeps["ttsSynthesisService"],
    getReactChatWindow: () => null,
  };
}

function makePublishLifecycle() {
  return {
    publishTurnStarted: vi.fn(),
    publishTurnFinished: vi.fn(),
    publishSchedulerFinished: vi.fn(),
    publishToolFinished: vi.fn(),
  };
}

function makeAgentRuntime(onRunFinished = vi.fn(async () => ({ sticker: null }))) {
  return {
    buildOptions: vi.fn(async () => ({
      options: { executionMode: "chat", conversationMode: "chat" },
      latestUserText: "unused",
    })),
    onRunFinished,
    buildSchedulerOptions: vi.fn(),
  } as unknown as ChannelsSubsystemDeps["agentRuntime"];
}

beforeEach(() => {
  vi.clearAllMocks();
  channelMocks.agentError = undefined;
  channelMocks.agentResult = { reply: "渠道回复", toolResults: [] };
  channelMocks.dispatcherDeps.length = 0;
});

describe("createChannelsSubsystem lifecycle", () => {
  it("为每个子系统保留独立的调度器依赖", async () => {
    const firstRuntime = makeAgentRuntime();
    const secondRuntime = makeAgentRuntime();
    const first = createChannelsSubsystem({
      ...makeChannelsDeps(),
      agentRuntime: firstRuntime,
    });
    const second = createChannelsSubsystem({
      ...makeChannelsDeps(),
      agentRuntime: secondRuntime,
    });

    // 每个子系统持有自己的调度器依赖实例，不共享队列/上下文
    expect(channelMocks.dispatcherDeps).toHaveLength(2);
    expect(channelMocks.dispatcherDeps[0]).not.toBe(channelMocks.dispatcherDeps[1]);

    first.initialize();
    second.initialize();
    const firstOptions = vi.mocked(initializeChannels).mock.calls[0]?.[0];
    const secondOptions = vi.mocked(initializeChannels).mock.calls[1]?.[0];

    expect(firstOptions?.handleIncoming).toBeTypeOf("function");
    expect(secondOptions?.handleIncoming).toBeTypeOf("function");
    const message: IncomingMessage = {
      channel: "qq",
      chatType: "private",
      senderId: "user-1",
      chatId: "chat-1",
      text: "你好",
      at: new Date(0),
    };
    await firstOptions?.handleIncoming?.(message);
    expect(firstRuntime.buildOptions).toHaveBeenCalledOnce();
    expect(secondRuntime.buildOptions).not.toHaveBeenCalled();

    await secondOptions?.handleIncoming?.(message);
    expect(firstRuntime.buildOptions).toHaveBeenCalledOnce();
    expect(secondRuntime.buildOptions).toHaveBeenCalledOnce();
  });

  it("observeExternalChat 把见过的外部会话写进绑定存储", () => {
    createChannelsSubsystem(makeChannelsDeps());
    const observeExternalChat = channelMocks.dispatcherDeps[0]?.observeExternalChat as
      | ((sessionId: string, msg: IncomingMessage) => void)
      | undefined;
    expect(observeExternalChat).toBeTypeOf("function");

    const at = new Date("2026-09-02T00:00:00Z");
    const groupMessage: IncomingMessage = {
      channel: "qq",
      chatType: "group",
      senderId: "user-1",
      senderName: "伙伴",
      chatId: "chat-1",
      text: "大家好",
      at,
    };
    observeExternalChat?.("channel:qq:chat-1", groupMessage);

    expect(channelMocks.observe).toHaveBeenCalledWith({
      sessionId: "channel:qq:chat-1",
      channel: "qq",
      chatId: "chat-1",
      chatType: "group",
      senderName: "伙伴",
      lastAt: at.getTime(),
    });

    // 私聊且无显示名：chatType 兜底为 private，且不写入 senderName 字段
    const privateMessage: IncomingMessage = {
      channel: "qq",
      senderId: "user-2",
      chatId: "user-2",
      text: "你好",
      at,
    };
    observeExternalChat?.("channel:qq:user-2", privateMessage);

    expect(channelMocks.observe).toHaveBeenLastCalledWith({
      sessionId: "channel:qq:user-2",
      channel: "qq",
      chatId: "user-2",
      chatType: "private",
      lastAt: at.getTime(),
    });
    expect(channelMocks.observe.mock.calls[1]?.[0]).not.toHaveProperty("senderName");
  });

  it.each([false, true])("flushes binding observations after shutdown (failure=%s)", async (fail) => {
    const lifecycle = { initialize: vi.fn(), start: vi.fn(), shutdown: vi.fn(async () => {
      expect(channelMocks.flush).not.toHaveBeenCalled();
      if (fail) throw new Error("shutdown failed");
    }) };
    const subsystem = createChannelsSubsystem(makeChannelsDeps(), lifecycle);
    if (fail) await expect(subsystem.shutdown()).rejects.toThrow("shutdown failed");
    else await subsystem.shutdown();
    expect(channelMocks.flush).toHaveBeenCalledOnce();
  });

  it("does not initialize or start channels during construction", () => {
    const lifecycle = { initialize: vi.fn(), start: vi.fn(), shutdown: vi.fn() };
    const subsystem = createChannelsSubsystem(makeChannelsDeps(), lifecycle);
    expect(lifecycle.initialize).not.toHaveBeenCalled();
    expect(lifecycle.start).not.toHaveBeenCalled();
    subsystem.initialize();
    expect(lifecycle.initialize).toHaveBeenCalledOnce();
  });

  it("starts channels only after explicit start", async () => {
    const lifecycle = { initialize: vi.fn(), start: vi.fn(async () => undefined), shutdown: vi.fn() };
    const subsystem = createChannelsSubsystem(makeChannelsDeps(), lifecycle);
    await subsystem.start();
    expect(lifecycle.start).toHaveBeenCalledOnce();
  });

  it("resolves adaptersRegistered only after synchronous adapter initialization succeeds", async () => {
    const lifecycle = { initialize: vi.fn(), start: vi.fn(async () => undefined), shutdown: vi.fn() };
    const subsystem = createChannelsSubsystem(makeChannelsDeps(), lifecycle);
    let settled = false;
    void subsystem.adaptersRegistered.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);

    subsystem.initialize();
    await expect(subsystem.adaptersRegistered).resolves.toBeUndefined();
    expect(settled).toBe(true);
  });

  it("rejects adaptersRegistered when adapter initialization fails", async () => {
    const lifecycle = {
      initialize: vi.fn(() => { throw new Error("adapter registration failed"); }),
      start: vi.fn(async () => undefined),
      shutdown: vi.fn(),
    };
    const subsystem = createChannelsSubsystem(makeChannelsDeps(), lifecycle);
    expect(() => subsystem.initialize()).toThrow("adapter registration failed");
    await expect(subsystem.adaptersRegistered).rejects.toThrow("adapter registration failed");
  });

  it("forwards the abort signal to the lifecycle start", async () => {
    const lifecycle = { initialize: vi.fn(), start: vi.fn(async () => undefined), shutdown: vi.fn() };
    const subsystem = createChannelsSubsystem(makeChannelsDeps(), lifecycle);
    const controller = new AbortController();
    await subsystem.start(controller.signal);
    expect(lifecycle.start).toHaveBeenCalledOnce();
    expect(lifecycle.start).toHaveBeenCalledWith(controller.signal);
  });

  it("delegates shutdown to the lifecycle adapter", async () => {
    const lifecycle = { initialize: vi.fn(), start: vi.fn(async () => undefined), shutdown: vi.fn() };
    const subsystem = createChannelsSubsystem(makeChannelsDeps(), lifecycle);
    await subsystem.shutdown();
    expect(lifecycle.shutdown).toHaveBeenCalledOnce();
  });

  it("defaults to the channels init module when no lifecycle adapter is provided", () => {
    const subsystem = createChannelsSubsystem(makeChannelsDeps());
    expect(initializeChannels).not.toHaveBeenCalled();
    expect(startChannels).not.toHaveBeenCalled();
    subsystem.initialize();
    expect(initializeChannels).toHaveBeenCalledOnce();
    void startChannels;
    void shutdownChannels;
  });

  it("渠道成功回复把规范化文本和渠道上下文交给统一收尾路径", async () => {
    const onRunFinished = vi.fn(async () => ({ sticker: null }));
    const agentRuntime = makeAgentRuntime(onRunFinished);
    const publishLifecycle = makePublishLifecycle();
    createChannelsSubsystem({
      ...makeChannelsDeps(),
      agentRuntime,
      publishLifecycle,
    });

    const buildAndRunAgent = channelMocks.buildAndRunAgent;
    if (!buildAndRunAgent) throw new Error("渠道 Agent 执行函数未注册");
    await buildAndRunAgent({
      channel: "telegram",
      chatType: "direct",
      senderId: "user-1",
      at: new Date("2026-09-02T00:00:00Z"),
    }, "channel-session", []);

    expect(onRunFinished).toHaveBeenCalledWith(
      { reply: "渠道回复", toolResults: [] },
      "渠道问题",
      {
        source: "channel",
        mode: "chat",
        conversationId: "channel-session",
        channel: "telegram",
        // P2 归属：speakerName 缺失（消息没带 senderName）时不落该字段
        personKey: "telegram:user-1",
        chatType: "direct",
      },
    );

    // 成功轮次：开始与结束事件各发布一次，携带渠道会话标识与运行 id
    expect(publishLifecycle.publishTurnStarted).toHaveBeenCalledTimes(1);
    const startedPayload = publishLifecycle.publishTurnStarted.mock.calls[0][0] as Record<string, unknown>;
    expect(startedPayload).toMatchObject({
      source: "channel",
      channel: "telegram",
      conversationId: "channel-session",
      mode: "chat",
    });
    expect(typeof startedPayload.runId).toBe("string");
    // 渠道不写桌面会话 Store，事件不提供消息边界
    expect("inputMessageId" in startedPayload).toBe(false);

    expect(publishLifecycle.publishTurnFinished).toHaveBeenCalledTimes(1);
    const finishedPayload = publishLifecycle.publishTurnFinished.mock.calls[0][0] as Record<string, unknown>;
    expect(finishedPayload).toMatchObject({
      source: "channel",
      channel: "telegram",
      conversationId: "channel-session",
      runId: startedPayload.runId,
      mode: "chat",
      status: "success",
    });
    expect(typeof finishedPayload.durationMs).toBe("number");
  });

  it("渠道超时终态不进入成功收尾", async () => {
    channelMocks.agentResult = {
      reply: "超时前的部分回复",
      toolResults: [],
      terminal: {
        status: "timeout",
        reason: "timeout",
        externalEffectsMayContinue: true,
      },
    };
    const onRunFinished = vi.fn(async () => ({ sticker: null }));
    const agentRuntime = makeAgentRuntime(onRunFinished);
    const publishLifecycle = makePublishLifecycle();
    createChannelsSubsystem({
      ...makeChannelsDeps(),
      agentRuntime,
      publishLifecycle,
    });

    const buildAndRunAgent = channelMocks.buildAndRunAgent;
    if (!buildAndRunAgent) throw new Error("渠道 Agent 执行函数未注册");
    const result = await buildAndRunAgent({
      channel: "telegram",
      chatType: "direct",
      senderId: "user-1",
      at: new Date("2026-09-02T00:00:00Z"),
    }, "channel-session", []) as { text: string };

    expect(result.text).toBe("超时前的部分回复");
    expect(onRunFinished).not.toHaveBeenCalled();

    // 超时终态仍发布一次结束事件，状态与 agent 终态一致
    expect(publishLifecycle.publishTurnStarted).toHaveBeenCalledTimes(1);
    expect(publishLifecycle.publishTurnFinished).toHaveBeenCalledTimes(1);
    expect(publishLifecycle.publishTurnFinished.mock.calls[0][0]).toMatchObject({
      source: "channel",
      status: "timeout",
      conversationId: "channel-session",
    });
  });

  it("渠道执行失败时不进入成功收尾路径", async () => {
    channelMocks.agentError = new Error("渠道执行失败");
    const onRunFinished = vi.fn(async () => ({ sticker: null }));
    const agentRuntime = makeAgentRuntime(onRunFinished);
    const publishLifecycle = makePublishLifecycle();
    createChannelsSubsystem({
      ...makeChannelsDeps(),
      agentRuntime,
      publishLifecycle,
    });

    const buildAndRunAgent = channelMocks.buildAndRunAgent;
    if (!buildAndRunAgent) throw new Error("渠道 Agent 执行函数未注册");
    await expect(buildAndRunAgent({
      channel: "telegram",
      chatType: "direct",
      senderId: "user-1",
      at: new Date("2026-09-02T00:00:00Z"),
    }, "channel-session", [])).rejects.toThrow("渠道执行失败");

    expect(onRunFinished).not.toHaveBeenCalled();

    // 异常退出也要发布一次 runtime_error 结束事件（finally 路径）
    expect(publishLifecycle.publishTurnStarted).toHaveBeenCalledTimes(1);
    expect(publishLifecycle.publishTurnFinished).toHaveBeenCalledTimes(1);
    expect(publishLifecycle.publishTurnFinished.mock.calls[0][0]).toMatchObject({
      source: "channel",
      status: "runtime_error",
      conversationId: "channel-session",
    });
  });

  // ── P2 归属透传 ──

  it("P2 归属：personKey / speakerName / userMessageId / chatType 一起进 onRunFinished 的 context", async () => {
    const onRunFinished = vi.fn(async () => ({ sticker: null }));
    createChannelsSubsystem({
      ...makeChannelsDeps(),
      agentRuntime: makeAgentRuntime(onRunFinished),
    });

    const buildAndRunAgent = channelMocks.buildAndRunAgent;
    if (!buildAndRunAgent) throw new Error("渠道 Agent 执行函数未注册");
    await buildAndRunAgent({
      channel: "qq",
      chatType: "group",
      senderId: "10001",
      senderName: "小明",
      at: new Date("2026-09-02T00:00:00Z"),
    }, "channel-session", [], "msg_1758681234567_a3f9k2");

    // personKey 在 bootstrap 层组合（唯一同时持有 channel 与 senderId 的一层）
    expect(onRunFinished).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        personKey: "qq:10001",
        speakerName: "小明",
        userMessageId: "msg_1758681234567_a3f9k2",
        chatType: "group",
      }),
    );
  });

  it("P2 归属：chatType 缺省视为 private（私聊兜底判据不能缺）", async () => {
    const onRunFinished = vi.fn(async () => ({ sticker: null }));
    createChannelsSubsystem({
      ...makeChannelsDeps(),
      agentRuntime: makeAgentRuntime(onRunFinished),
    });

    const buildAndRunAgent = channelMocks.buildAndRunAgent;
    if (!buildAndRunAgent) throw new Error("渠道 Agent 执行函数未注册");
    await buildAndRunAgent({
      channel: "qq",
      senderId: "10001",
      at: new Date("2026-09-02T00:00:00Z"),
    }, "channel-session", []);

    const context = onRunFinished.mock.calls[0][2] as Record<string, unknown>;
    expect(context.chatType).toBe("private");
    // 第 4 参数缺失（落盘失败 / 老调用方）时不落 userMessageId 字段
    expect("userMessageId" in context).toBe(false);
  });

  it("P2 归属：落盘失败（无 userMessageId）不阻断成功收尾", async () => {
    const onRunFinished = vi.fn(async () => ({ sticker: null }));
    createChannelsSubsystem({
      ...makeChannelsDeps(),
      agentRuntime: makeAgentRuntime(onRunFinished),
    });

    const buildAndRunAgent = channelMocks.buildAndRunAgent;
    if (!buildAndRunAgent) throw new Error("渠道 Agent 执行函数未注册");
    const result = await buildAndRunAgent({
      channel: "qq",
      chatType: "private",
      senderId: "10001",
      senderName: "小明",
      at: new Date("2026-09-02T00:00:00Z"),
    }, "channel-session", [], undefined) as { text: string };

    expect(result.text).toBe("渠道回复");
    expect(onRunFinished).toHaveBeenCalledOnce();
    expect((onRunFinished.mock.calls[0][2] as Record<string, unknown>).personKey).toBe("qq:10001");
  });
});
