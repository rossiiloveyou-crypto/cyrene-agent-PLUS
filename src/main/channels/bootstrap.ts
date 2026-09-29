import { app, type BrowserWindow } from "electron";
import type { IpcScope } from "../application/ipc-scope";
import type { PluginPromptMode, PluginTurnStatus } from "../../plugins/api";
import { loadGeneralSettings } from "../settings/settings-facade";
import { loadModelSettings, resolveModelSettingsProfile } from "../settings/model-settings";
import type { LifecyclePublisher } from "../plugin-host/lifecycle-publisher";
import { CyreneAgent } from "../orchestrator/cyrene-agent";
import { toolRegistry } from "../orchestrator/tools/registry/tool-registry";
import { captionImageSafe, IMAGE_CAPTION_PROMPT } from "../chat/image-caption";
import { resolveCaptionVisionConfig, resolveImageRoute } from "../orchestrator/image-router";
import { ConversationJournalService } from "../orchestrator/conversation-journal-service";
import { getConversationTranscriptStore } from "../orchestrator/conversation-transcript-store";
import { getHarnessRunStore } from "../orchestrator/harness/run-store";
import { indexConversationTurn } from "../orchestrator/tools/history-tools";
import type { AgentRuntime } from "../orchestrator/agent-runtime";
import type { TtsSynthesisService } from "../services/tts/tts-synthesis-service";
import { buildChannelAttachmentInputs } from "./agent-input";
import { loadChannelsSettings } from "./settings-store";
import { enforceChannelAgentPolicy, resolveChannelAgentPolicy } from "./agent-policy";
import { applyChannelToolGuard } from "./tool-guard";
import { recordTurnFailure, recordTurnSuccess } from "./audit-events";
import { runWithConversationScope } from "../conversation-usage-store";
import { buildPersonKey } from "../memory/person-attribution";
import { getChannelConversationBindingStore } from "./conversation-binding-store";
import { ChannelDispatcher, type ChannelAgentInput, type DispatcherDeps } from "./dispatcher";
import {
  createChannelContext,
  formatChannelUserText,
} from "./channel-context";
import { appendHistory, migrateHistory } from "./history-log";
import { createKeyedQueue } from "./keyed-queue";
import { createChannelRateLimiter } from "./rate-limiter";
import { createChannelDeliveryService } from "./delivery-service";
import {
  createOutgoingComposer,
  type OutgoingComposer,
  type SynthesizeChannelTts,
} from "./outgoing-composer";
import { channelManager } from "./manager";
import {
  initializeChannels,
  startChannels,
  shutdownChannels,
} from "./init";

export interface ChannelsLifecycleAdapter {
  initialize(): void;
  start(signal?: AbortSignal): Promise<void>;
  shutdown(): Promise<void>;
}

export interface ChannelsSubsystem {
  initialize(): void;
  start(signal?: AbortSignal): Promise<void>;
  /** initialize() 同步注册全部内置 adapter 后解析，插件必须等待该边界。 */
  adaptersRegistered: Promise<void>;
  shutdown(): Promise<void>;
}

export interface ChannelsSubsystemDeps {
  agentRuntime: AgentRuntime;
  ttsSynthesisService: TtsSynthesisService;
  getReactChatWindow: () => BrowserWindow | null;
  /** 共享 IPC scope；传入后 channels IPC 由组合根统一注销。 */
  ipc?: IpcScope;
  /** 生命周期事件发布器：渠道轮次事件由此发布。 */
  publishLifecycle?: LifecyclePublisher;
  /** 可选注入共享 CTA journal；缺省复用主进程 transcript store 单例。 */
  conversationJournal?: ConversationJournalService;
}

/** 轮次终态 → 控制台里可读的失败原因。 */
function describeTerminal(status: string, reason?: string): string {
  const suffix = reason ? `（${reason}）` : "";
  switch (status) {
    case "timeout":
      return reason === "max_rounds"
        ? `对话超时：达到最大轮次${suffix}`
        : `对话超时${suffix}`;
    case "cancelled":
      return `对话被取消${suffix}`;
    case "runtime_error":
      return `运行时错误${suffix}`;
    default:
      return `非成功终态：${status}${suffix}`;
  }
}

/**
 * 组装渠道子系统。构造期只创建对象并连接依赖，
 * 不做任何初始化/启动 —— initialize / start / shutdown 必须显式调用。
 */
export function createChannelsSubsystem(
  deps: ChannelsSubsystemDeps,
  lifecycle?: ChannelsLifecycleAdapter,
): ChannelsSubsystem {
  const loadRecentChannelHistory = async (sessionId: string, limit: number) => {
    const { loadRecentHistory } = await import("./history-log");
    // 滑动窗口只放正式对话轮；未触发昔涟的群友发言交给
    // buildAlwaysOnContext 的【群聊近期上下文】块，避免同一批消息注入两遍。
    return loadRecentHistory(sessionId, limit, { conversationOnly: true });
  };

  const conversationJournal = deps.conversationJournal
    // runReader 接入 harness 运行存储：渠道会话同样需要把崩溃孤儿工具
    // 按运行状态归类为 unknown，避免被误判为 not_executed。
    ?? new ConversationJournalService({
      store: getConversationTranscriptStore(app.getPath("userData")),
      runReader: getHarnessRunStore(app.getPath("userData")),
    });

  const observeExternalChat: DispatcherDeps["observeExternalChat"] = (sessionId, msg) => {
    getChannelConversationBindingStore().observe({
      sessionId,
      channel: msg.channel,
      chatId: msg.chatId,
      chatType: msg.chatType ?? "private",
      ...(msg.senderName ? { senderName: msg.senderName } : {}),
      lastAt: msg.at.getTime(),
    });
  };

  const buildAndRunAgent: DispatcherDeps["buildAndRunAgent"] = async (
    msg,
    input,
  ) => {
    const channelInput = input as ChannelAgentInput;
    // 🔴 D1：桌面对话绑定已删除 → 渠道轮次一律归属渠道会话自身。
    //    官方此处是 channelInput.target.conversationId；D1 之后两者恒等。
    const channelConversationId = channelInput.target.conversationId;
    // P2 归属起点：dispatcher 把入站消息落盘后的 entry id 挂在这里。
    const userMessageId = channelInput.userMessageId;
    const channelResult: { text: string; sticker: string | null } = { text: "", sticker: null };

    // P2 归属：说话人的稳定标识。
    // 组合点放在这里，因为只有这一层同时持有 channel 与 senderId
    //（私聊与群聊都有值，不依赖 transcript 的 speakerId —— 私聊不写那个字段）。
    const personKey = buildPersonKey(msg.channel, msg.senderId);

    const sandbox = loadChannelsSettings().toolSandbox;
    const policy = resolveChannelAgentPolicy(sandbox);
    const allTools = toolRegistry.getEnabledTools();
    const exposedTools = policy.exposeTools ? allTools : [];
    console.log(
      "[Channels] bot run:",
      `msg.channel=${msg.channel} sandbox=${sandbox} tools=${exposedTools.length}/${allTools.length}`,
    );

    // 图片路由统一收口在 image-router（基于解析后的默认档案——顶层镜像可能是空壳）
    const channelModelSettings = resolveModelSettingsProfile(loadModelSettings());
    const channelImageRoute = resolveImageRoute("channel", channelModelSettings);
    const attachmentInputs = await buildChannelAttachmentInputs(msg, {
      // reject 时走 caption 分支：每张图会拿到路由的人话错误并诚实告知用户
      imageMode: channelImageRoute.mode === "direct" ? "direct" : "caption",
      captionImage: async (filePath: string) => {
        const settings = resolveModelSettingsProfile(loadModelSettings());
        const vision = resolveCaptionVisionConfig(settings);
        if (!vision.ok) return { ok: false, error: vision.error };
        return captionImageSafe(filePath, IMAGE_CAPTION_PROMPT, vision.config);
      },
    });
    const agentUserText = formatChannelUserText(msg);
    const { options } = await deps.agentRuntime.buildOptions({
      modelContext: channelInput.modelContext,
      currentUser: {
        turnId: channelInput.userTurnId,
        text: agentUserText,
        visibleContent: msg.text,
      },
      style: "01_default.md",
      sessionId: channelInput.target.conversationId,
      // 渠道绑定只共享文字上下文，不继承桌面对话的工作区权限。
      workspaceBindingSessionId: null,
      attachments: attachmentInputs.attachments,
      imageAttachments: attachmentInputs.imageAttachments,
      channel: msg.channel,
      chatType: msg.chatType ?? "private",
      executionMode: policy.executionMode,
      ...(policy.executionMode === "chat" ? {
        userTurnId: channelInput.userTurnId,
        assistantTurnId: channelInput.assistantTurnId,
      } : {}),
    });
    if (channelInput.transcriptSink) options.transcriptSink = channelInput.transcriptSink;
    // 运行标识贯通：sink 写入、runStore 会话与生命周期事件使用同一 runId，
    // 崩溃孤儿工具才能按 assistant 条目上的 runId 查回运行状态。
    options.runId = channelInput.runId;
    // 工具白名单在「执行层」逐次判定：非白名单用户的调用会被拦截并写入
    // 「工具调用控制台」审计，所以模型仍然看得到工具目录。
    const grantedTools = policy.exposeTools
      ? [...(options.capabilities?.tools ?? exposedTools)]
      : [];
    const channelTools = applyChannelToolGuard(grantedTools, {
      channel: msg.channel,
      chatType: msg.chatType ?? "private",
      chatId: msg.chatId,
      senderId: msg.senderId,
      ...(msg.senderName ? { senderName: msg.senderName } : {}),
      sessionId: channelConversationId,
    });
    options.tools = channelTools;
    // run-preparation 优先读 capabilities.tools，这里必须一起换掉，否则守卫被绕过。
    if (options.capabilities) {
      options.capabilities = { ...options.capabilities, tools: channelTools };
    }
    enforceChannelAgentPolicy(options, policy);

    const threadId = `thread-${channelInput.target.conversationId}-${Date.now()}`;
    const agent = new CyreneAgent({ threadId, description: `bot:${msg.channel}:${msg.senderId}` });
    // 轮次事件只带渠道会话标识，不提供桌面消息边界；绑定消息由 dispatcher 镜像写入。
    const mode: PluginPromptMode = options.conversationMode
      ?? (options.executionMode === "chat" ? "chat" : "work");
    const runId = channelInput.runId;
    const runStartedAt = Date.now();
    deps.publishLifecycle?.publishTurnStarted({
      source: "channel",
      channel: msg.channel,
      conversationId: channelInput.target.conversationId,
      runId,
      mode,
    });
    let lifecycleStatus: PluginTurnStatus = "runtime_error";
    // 轮次级审计主体（成功/失败都记在这里，失败永远记，成功由控制台开关决定）
    const auditSubject = {
      channel: msg.channel,
      chatType: msg.chatType ?? "private",
      chatId: msg.chatId,
      senderId: msg.senderId,
      ...(msg.senderName ? { senderName: msg.senderName } : {}),
      sessionId: channelConversationId,
      ...(msg.trigger ? { trigger: msg.trigger } : {}),
    };
    try {
      const reply = await new Promise<string>((resolve, reject) => {
        // 渠道轮次同样归属到自己的渠道会话（用量徽章也能看到这部分消耗）
        runWithConversationScope(channelConversationId, () => agent.runWithEvents(options).subscribe({
          complete: () => {
            resolve(agent.lastResult?.reply ?? "");
          },
          error: (err) => reject(err instanceof Error ? err : new Error(String(err))),
        }));
      });
      lifecycleStatus = agent.lastResult?.terminal?.status ?? "success";
      channelResult.text = reply;
      // Observable 在超时终态下也会正常 complete；只有成功终态才能进入记忆、表情等成功收尾。
      const terminalStatus = agent.lastResult?.terminal?.status;
      const runDurationMs = Date.now() - runStartedAt;
      if (agent.lastResult && (terminalStatus === undefined || terminalStatus === "success")) {
        const finished = await deps.agentRuntime.onRunFinished(agent.lastResult, agentUserText, {
          source: "channel",
          mode,
          conversationId: channelInput.target.conversationId,
          channel: msg.channel,
          // P2 归属：沿 build-options → memory-scheduler 透传到 L2 落库。
          // ⚠️ 这里在 runWithConversationScope 之外，ALS 已经退出，必须显式透传。
          personKey,
          ...(msg.senderName ? { speakerName: msg.senderName } : {}),
          ...(userMessageId ? { userMessageId } : {}),
          chatType: msg.chatType ?? "private",
        });
        channelResult.sticker = finished.sticker;
      }
      // 失败轮次（超时/取消/运行时错误）与可选的成功轮次都写进控制台
      try {
        if (terminalStatus && terminalStatus !== "success") {
          recordTurnFailure(auditSubject, {
            userText: agentUserText,
            reply,
            reason: describeTerminal(terminalStatus, agent.lastResult?.terminal?.reason),
            detail: agent.lastResult?.terminal?.reason
              ? `terminal.status=${terminalStatus}\nterminal.reason=${agent.lastResult.terminal.reason}`
              : `terminal.status=${terminalStatus}`,
            durationMs: runDurationMs,
          });
        } else if (loadChannelsSettings().audit.recordSuccessTurns) {
          recordTurnSuccess(auditSubject, {
            userText: agentUserText,
            reply,
            durationMs: runDurationMs,
          });
        }
      } catch (auditError) {
        console.warn("[Channels] 写轮次审计失败:", auditError);
      }
      void indexConversationTurn(channelInput.target.conversationId, agentUserText, reply);
      return channelResult;
    } catch (error) {
      // 智能体调用异常：同样记一条失败轮次，便于在控制台看到"哪句话把昔涟弄崩了"
      try {
        const message = error instanceof Error ? error.message : String(error);
        recordTurnFailure(auditSubject, {
          userText: agentUserText,
          reason: `智能体调用异常：${message}`,
          detail: error instanceof Error ? (error.stack ?? message) : message,
          durationMs: Date.now() - runStartedAt,
        });
      } catch (auditError) {
        console.warn("[Channels] 写失败轮次审计失败:", auditError);
      }
      throw error;
    } finally {
      // 无论成功、超时还是异常退出，轮次结束事件都要发布一次
      deps.publishLifecycle?.publishTurnFinished({
        source: "channel",
        channel: msg.channel,
        conversationId: channelInput.target.conversationId,
        runId,
        mode,
        status: lifecycleStatus,
        durationMs: Date.now() - runStartedAt,
      });
    }
  };

  const synthesizeTts: SynthesizeChannelTts = async (text, context) => {
    const cfg = loadGeneralSettings();
    return await deps.ttsSynthesisService.synthesizeChannelTts(text, cfg, context.channel);
  };

  const context = createChannelContext({
    loadRecentChannelHistory,
    appendChannelHistory: appendHistory,
    migrateHistory,
  });
  const baseComposer = createOutgoingComposer({ synthesizeTts });
  const composer: OutgoingComposer = {
    compose: (input) => baseComposer.compose({
      ...input,
      capability: channelManager.getAdapter(input.incoming.channel)?.capability,
    }),
    cleanupTransientFiles: (files) => baseComposer.cleanupTransientFiles(files),
  };
  // 首次处理消息前，调度器会用实际设置重新配置这两个占位上限。
  const limiter = createChannelRateLimiter({
    limits: {
      perUser: Number.MAX_SAFE_INTEGER,
      perChannel: Number.MAX_SAFE_INTEGER,
    },
  });
  const dispatcher = new ChannelDispatcher({
    queue: createKeyedQueue({ maxPendingPerKey: 20 }),
    limiter,
    context,
    composer,
    journal: conversationJournal,
    delivery: createChannelDeliveryService(channelManager),
    buildAndRunAgent,
    loadSettings: loadChannelsSettings,
    loadGeneralSettings,
    observeExternalChat,
  });

  // 默认生命周期：委托到 init.ts 的显式操作（幂等）
  const defaultLifecycle: ChannelsLifecycleAdapter = {
    initialize: () => initializeChannels({
      ipc: deps.ipc,
      handleIncoming: (msg) => dispatcher.handleIncoming(msg),
      reloadDispatcherSettings: () => dispatcher.reloadSettings(),
    }),
    start: (signal?: AbortSignal) => startChannels(signal),
    shutdown: () => shutdownChannels(),
  };
  const adapter = lifecycle ?? defaultLifecycle;

  let resolveAdaptersRegistered!: () => void;
  let rejectAdaptersRegistered!: (error: unknown) => void;
  const adaptersRegistered = new Promise<void>((resolve, reject) => {
    resolveAdaptersRegistered = resolve;
    rejectAdaptersRegistered = reject;
  });

  return {
    initialize: () => {
      try {
        adapter.initialize();
        resolveAdaptersRegistered();
      } catch (error) {
        rejectAdaptersRegistered(error);
        throw error;
      }
    },
    start: (signal?: AbortSignal) => adapter.start(signal),
    adaptersRegistered,
    shutdown: async () => {
      try {
        await adapter.shutdown();
      } finally {
        getChannelConversationBindingStore().flush();
      }
    },
  };
}
