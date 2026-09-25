import type { ChannelAdapter } from "../base";
import type {
  ChannelCapability,
  ChannelStatus,
  IncomingMessage,
  MessageHandler,
  OutgoingMessage,
  OutgoingPart,
} from "../../types";
import { loadChannelsSettings } from "../../settings-store";
import { OneBotActionClient } from "./onebot-action-client";
import { OneBotMediaManager, versionAtLeast, ONEBOT_STREAM_MIN_VERSION } from "./onebot-media";
import { normalizeOneBotMessage, textFromSegments } from "./onebot-normalizer";
import { findTriggerKeyword } from "../../keyword-policy";
import { recordMessageBlocked } from "../../audit-events";
import { appendHistory } from "../../history-log";
import { makeSessionId } from "../../channel-context";
import {
  DEFAULT_TOOL_ACCESS,
  resolveChannelMessageAccess,
  type ChannelToolAccessConfig,
} from "../../tool-access";
import { OneBotReverseWsServer, type OneBotListeningInfo } from "./onebot-reverse-ws";
import {
  isOneBotMessageEvent,
  oneBotId,
  type OneBotEvent,
  type OneBotLoginInfo,
  type OneBotSegment,
  type OneBotVersionInfo,
} from "./onebot-types";
import type { QqChannelConfig } from "../../settings-store";
import { isGroupInAnyZone, shouldObserveGroupInZone } from "../../../zones/scope";
import { writeGroupCorpus } from "../../../corpus/group-corpus";

const CAPABILITY: ChannelCapability = {
  text: true,
  image: true,
  audio: true,
  file: true,
  video: true,
  markdown: false,
  card: false,
  sticker: true,
  maxTextLength: 0,
};

const DEDUPE_TTL_MS = 10 * 60_000;
const TEXT_CHUNK_CODEPOINTS = 1500;

/** 纯附件消息在 transcript 里的占位描述（模型需要知道"有人发了东西"）。 */
const ATTACHMENT_PLACEHOLDER: Record<"image" | "audio" | "video" | "file", string> = {
  image: "[图片]",
  audio: "[语音]",
  video: "[视频]",
  file: "[文件]",
};

function describeAttachmentsOnly(
  attachments: IncomingMessage["attachments"],
): string {
  if (!attachments || attachments.length === 0) return "";
  const marks = attachments.map((attachment) => {
    const caption = attachment.caption?.trim();
    return caption ? `${ATTACHMENT_PLACEHOLDER[attachment.kind]} ${caption}` : ATTACHMENT_PLACEHOLDER[attachment.kind];
  });
  return marks.join(" ");
}

/**
 * 从原始 OneBot segments 里抽附件占位（群语料用）。
 *
 * 语料采集点跑在 `normalizeOneBotMessage` 之前（见 handleEvent 里的位置约束），
 * 那里拿不到 `IncomingMessage.attachments`，所以直接读 segment 类型。
 * at/reply/text 不算附件，跳过。
 */
const SEGMENT_PLACEHOLDER: Record<string, string> = {
  image: "[图片]",
  face: "[表情]",
  record: "[语音]",
  video: "[视频]",
  file: "[文件]",
  json: "[卡片]",
  mface: "[表情]",
  rps: "[猜拳]",
  dice: "[骰子]",
};

export function describeSegmentAttachments(segments: readonly OneBotSegment[]): string {
  const marks: string[] = [];
  for (const segment of segments) {
    const placeholder = SEGMENT_PLACEHOLDER[segment.type];
    if (placeholder) marks.push(placeholder);
  }
  return marks.join(" ");
}

export function splitQqText(text: string, maxCodepoints = TEXT_CHUNK_CODEPOINTS): string[] {
  const source = text.trim();
  if (!source) return [];
  const result: string[] = [];
  let rest = Array.from(source);
  while (rest.length > maxCodepoints) {
    const window = rest.slice(0, maxCodepoints);
    let splitAt = -1;
    for (let i = window.length - 1; i >= Math.floor(maxCodepoints * 0.55); i--) {
      if (/[。！？!?；;…\n]/u.test(window[i])) {
        splitAt = i + 1;
        break;
      }
    }
    if (splitAt < 0) splitAt = maxCodepoints;
    result.push(window.slice(0, splitAt).join("").trim());
    rest = rest.slice(splitAt);
  }
  const tail = rest.join("").trim();
  if (tail) result.push(tail);
  return result.filter(Boolean);
}

export type QqEventTrigger = "mention" | "trigger_keyword" | "private";

/** 三态决策: respond 起 LLM run / observe 只写 transcript / drop 丢弃. */
export type QqEventAction = "respond" | "observe" | "drop";

export type QqEventDecision =
  /** 在叫昔涟且全部校验通过 → 进入 dispatcher 起一轮 run */
  | { action: "respond"; trigger: QqEventTrigger }
  /**
   * 白名单群里的旁听消息: 只写群 transcript (带说话人) 供后续群上下文注入,
   * 不起 run、不回复、不进控制台。
   */
  | { action: "observe" }
  /**
   * allowlist=true：消息本身是在叫昔涟，只是群/成员不在白名单——属于"未授权请求"，写入控制台拦截记录。
   * allowlist=false：压根不是在跟昔涟说话（群友闲聊 / 未加白的群），静默丢弃即可，不留痕。
   * trigger：被拦下时这条消息本来是怎么叫到昔涟的（私聊 / @ / 触发词），供控制台展示。
   */
  | { action: "drop"; reason: string; allowlist: boolean; trigger?: QqEventTrigger };

/** 这条群消息是怎么叫到昔涟的：@ 优先，其次触发关键词；都没命中返回 null。 */
function resolveGroupTrigger(
  message: OneBotSegment[],
  selfId: string,
  triggerKeywords: readonly string[],
): QqEventTrigger | null {
  const mentioned = message.some((segment) =>
    segment.type === "at" && oneBotId(segment.data.qq) === selfId,
  );
  if (mentioned) return "mention";
  // 触发关键词是白名单群里的免 @ 暗号；已经 @ 了就无需再扫关键词。
  return findTriggerKeyword(textFromSegments(message), triggerKeywords)
    ? "trigger_keyword"
    : null;
}

/**
 * 判定一条 OneBot 消息事件是否进入处理链路，并给出三态动作。
 *
 * 顺序（与用户约定一致）：
 *   私聊：账号在「白名单与权限」里且勾了「私聊」权限
 *   群聊：群号白名单 → "这条消息是不是在叫昔涟"（@ 昔涟 或 命中触发关键词）
 *        → 群员发言限制开启时校验该账号的「群聊」权限
 *
 * 两条分界线：
 *   1. 群号白名单——决定这个群的消息能不能被昔涟看到。不在白名单的群一律 drop，
 *      连 transcript 都不写，否则没加白的群会被整群旁听进本地历史。
 *   2. "有没有在叫昔涟"——决定是 respond 还是 observe。白名单群里没 @ 也没命中触发词
 *      的消息走 observe：写进群 transcript 供下文理解，但不起 run（昔日是直接丢掉，
 *      导致群里 A 提问、B 只 @ 昔涟说"你知道吗"时，昔涟看不到 A 的问题）。
 *
 * 「未授权请求」仍然只在"真的在叫昔涟却没过校验"时留痕：没 @ 昔涟的群友闲聊即使
 * 发送者没授权也只是旁听（observe），不写拦截记录，避免控制台刷屏。
 */
/** classifyQqEvent 的可注入判定：让纯函数也能问"这个群在不在区块里"。 */
export interface QqGroupPolicyOptions {
  /**
   * 群是否被放行（加入任一区块 = 加入白名单）。
   * 与 config.allowedGroupIds（旧白名单）取并集，保证老配置仍可用。
   */
  isGroupAllowed?: (groupId: string) => boolean;
  /** 该群是否允许旁听（区块配置 observeGroupMessages）。缺省视为允许。 */
  shouldObserveGroup?: (groupId: string) => boolean;
}

/**
 * 生产环境的群策略接线：**加入任一区块 = 加入群白名单**。
 *
 * 抽成函数是为了让"加进区块 → 群里 @ 昔涟真的会被响应"这条链路可被测试直接验证
 * （之前这段是 handleEvent 里的内联对象字面量，测试碰不到，白名单断链也不会报警）。
 */
export function qqGroupPolicyOptions(): QqGroupPolicyOptions {
  return {
    isGroupAllowed: (groupId) => isGroupInAnyZone("qq", groupId),
    shouldObserveGroup: (groupId) => shouldObserveGroupInZone("qq", groupId),
  };
}

export function classifyQqEvent(
  event: { message_type: "private" | "group"; user_id: string | number; group_id?: string | number; message: OneBotSegment[] },
  config: QqChannelConfig,
  selfId: string,
  triggerKeywords: readonly string[] = [],
  access: ChannelToolAccessConfig = DEFAULT_TOOL_ACCESS,
  options: QqGroupPolicyOptions = {},
): QqEventDecision {
  const senderId = oneBotId(event.user_id);
  if (event.message_type === "private") {
    const decision = resolveChannelMessageAccess(access, {
      channel: "qq",
      chatType: "private",
      senderId,
    });
    if (decision.blocked) {
      return {
        action: "drop",
        reason: decision.reason ?? `发送者 ${senderId} 未获授权`,
        allowlist: true,
        trigger: "private",
      };
    }
    return { action: "respond", trigger: "private" };
  }

  const called = resolveGroupTrigger(event.message, selfId, triggerKeywords);

  // 群号白名单先行：不在白名单的群连旁听资格都没有。
  // 白名单 = 旧配置 allowedGroupIds ∨ 区块成员（加入区块 = 加入白名单）。
  const groupId = oneBotId(event.group_id);
  const groupAllowed = config.allowedGroupIds.includes(groupId)
    || (options.isGroupAllowed?.(groupId) ?? false);
  if (!groupAllowed) {
    // 只有真的 @ 了昔涟（或命中触发词）才算"未授权请求"要留痕；
    // 否则即使群关了「必须 @」，未加白群的聊天也只是路过——不然整群消息会刷进控制台。
    return called
      ? { action: "drop", reason: `群 ${groupId} 不在群聊白名单中`, allowlist: true, trigger: called }
      : { action: "drop", reason: `群 ${groupId} 不在群聊白名单中`, allowlist: false };
  }

  // 白名单群 + 没在叫昔涟 → 旁听：写 transcript，不起 run。
  if (!called && config.groupRequireMention) {
    const observeEnabled = options.shouldObserveGroup?.(groupId) ?? true;
    return observeEnabled
      ? { action: "observe" }
      : { action: "drop", reason: `群 ${groupId} 未开启旁听`, allowlist: false };
  }
  // 「必须 @」关闭时群消息一律按请求处理（尊重用户显式关掉的约定）。
  const trigger: QqEventTrigger = called ?? "mention";

  const memberDecision = resolveChannelMessageAccess(access, {
    channel: "qq",
    chatType: "group",
    senderId,
  });
  if (memberDecision.blocked) {
    return {
      action: "drop",
      reason: memberDecision.reason ?? `发送者 ${senderId} 未获授权`,
      allowlist: true,
      trigger,
    };
  }
  return { action: "respond", trigger };
}

export function isQqEventAllowed(
  event: { message_type: "private" | "group"; user_id: string | number; group_id?: string | number; message: OneBotSegment[] },
  config: QqChannelConfig,
  selfId: string,
  triggerKeywords: readonly string[] = [],
  access: ChannelToolAccessConfig = DEFAULT_TOOL_ACCESS,
): boolean {
  return classifyQqEvent(event, config, selfId, triggerKeywords, access).action !== "drop";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class NapCatAdapter implements ChannelAdapter {
  readonly id = "qq" as const;
  readonly displayName = "QQ（NapCat）";
  readonly capability = CAPABILITY;
  onMessage: MessageHandler | null = null;

  private server: OneBotReverseWsServer | null = null;
  private client: OneBotActionClient | null = null;
  private media = new OneBotMediaManager(() => this.client, undefined, () => {
    this.supportsStream = false;
    this.setStatus({
      enabled: true,
      phase: "running",
      message: `NapCat Stream API 不可用；请升级到 ${ONEBOT_STREAM_MIN_VERSION}+`,
      detail: this.statusDetail(),
    });
  });
  private status: ChannelStatus = { enabled: false, phase: "offline", message: "未启用" };
  private selfId = "";
  private nickname = "";
  private appVersion = "";
  private supportsStream = false;
  private listeningInfo: OneBotListeningInfo | null = null;
  private dedupe = new Map<string, number>();

  constructor(private readonly onStatusChanged?: () => void) {}

  async start(): Promise<void> {
    const config = loadChannelsSettings().qq;
    if (!config.enabled) {
      this.setStatus({ enabled: false, phase: "offline", message: "未启用" });
      return;
    }
    this.setStatus({ enabled: true, phase: "starting", message: "正在启动 OneBot 监听" });
    await this.media.start();
    this.server = new OneBotReverseWsServer({
      listenMode: config.listenMode,
      customHost: config.customHost,
      port: config.port,
      accessToken: config.accessToken,
      onEvent: (event, client) => this.handleEvent(event, client),
      onClientConnected: (client, info) => this.handleConnected(client, info.headerSelfId),
      onClientDisconnected: () => {
        this.client = null;
        this.selfId = "";
        this.setStatus({
          enabled: true,
          phase: "starting",
          message: "监听中，等待 NapCat 重连",
          detail: this.statusDetail(),
        });
      },
      onError: (error) => {
        this.setStatus({
          enabled: true,
          phase: "error",
          message: error.message,
          detail: this.statusDetail(),
        });
      },
    });
    try {
      this.listeningInfo = await this.server.start();
      this.setStatus({
        enabled: true,
        phase: "starting",
        message: "监听中，等待 NapCat 连接",
        detail: this.statusDetail(),
      });
    } catch (error) {
      this.media.stop();
      this.server = null;
      const message = error instanceof Error ? error.message : String(error);
      this.setStatus({ enabled: true, phase: "error", message });
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.media.stop();
    await this.server?.stop();
    this.server = null;
    this.client = null;
    this.selfId = "";
    this.nickname = "";
    this.appVersion = "";
    this.supportsStream = false;
    this.listeningInfo = null;
    this.dedupe.clear();
    this.setStatus({ enabled: false, phase: "offline", message: "已停止" });
  }

  getStatus(): ChannelStatus {
    const config = loadChannelsSettings().qq;
    if (!config.enabled) return { enabled: false, phase: "offline", message: "未启用" };
    return this.status;
  }

  getConnectionInfo(): Record<string, unknown> {
    return this.statusDetail();
  }

  async testConnection(): Promise<{ ok: boolean; error?: string; detail?: Record<string, unknown> }> {
    if (!this.client || !this.selfId) return { ok: false, error: "NapCat 尚未连接" };
    try {
      const status = await this.client.call<Record<string, unknown>>("get_status");
      return { ok: true, detail: { ...this.statusDetail(), protocolStatus: status } };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async send(msg: OutgoingMessage): Promise<{ ok: boolean; error?: string }> {
    const client = this.client;
    if (!client || !this.selfId) return { ok: false, error: "NapCat 未连接" };
    const payloads: OneBotSegment[][] = [];
    let lastError: string | undefined;

    for (const part of msg.parts) {
      try {
        payloads.push(...await this.partToPayloads(part));
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }
    if (payloads.length === 0) return { ok: false, error: lastError || "没有可发送的 QQ 内容" };

    let sent = 0;
    for (let index = 0; index < payloads.length; index++) {
      const segments = [...payloads[index]];
      if (index === 0 && msg.chatType === "group" && msg.replyContext) {
        const prefix: OneBotSegment[] = [{ type: "reply", data: { id: msg.replyContext.messageId } }];
        if (msg.replyContext.mentionUserId) {
          prefix.push(
            { type: "at", data: { qq: msg.replyContext.mentionUserId } },
            { type: "text", data: { text: " " } },
          );
        }
        segments.unshift(...prefix);
      }
      try {
        if (msg.chatType === "group") {
          await client.call("send_group_msg", { group_id: msg.targetId, message: segments });
        } else {
          await client.call("send_private_msg", { user_id: msg.targetId, message: segments });
        }
        sent++;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
      if (index < payloads.length - 1) await delay(500);
    }
    if (sent > 0 && lastError) {
      console.warn("[NapCatAdapter] QQ 消息部分发送失败:", lastError);
    }
    return sent > 0 ? { ok: true } : { ok: false, error: lastError || "QQ 发送失败" };
  }

  private async handleConnected(client: OneBotActionClient, headerSelfId?: string): Promise<void> {
    const login = await client.call<OneBotLoginInfo>("get_login_info");
    const version = await client.call<OneBotVersionInfo>("get_version_info");
    const selfId = oneBotId(login.user_id);
    if (!selfId) throw new Error("NapCat get_login_info 未返回 user_id");
    if (headerSelfId && headerSelfId !== selfId) throw new Error("NapCat X-Self-ID 与 get_login_info 不一致");
    this.client = client;
    this.selfId = selfId;
    this.nickname = login.nickname ?? "";
    this.appVersion = version.app_version ?? "";
    this.supportsStream = versionAtLeast(this.appVersion, ONEBOT_STREAM_MIN_VERSION);
    this.setStatus({
      enabled: true,
      phase: "running",
      message: this.supportsStream ? "NapCat 已连接" : `NapCat 已连接；媒体流需要 ${ONEBOT_STREAM_MIN_VERSION}+`,
      detail: this.statusDetail(),
    });
  }

  private async handleEvent(event: OneBotEvent, client: OneBotActionClient): Promise<void> {
    if (!isOneBotMessageEvent(event) || event.post_type !== "message") return;
    if (!this.selfId || oneBotId(event.self_id) !== this.selfId || oneBotId(event.user_id) === this.selfId) return;

    const settings = loadChannelsSettings();
    const config = settings.qq;
    const senderId = oneBotId(event.user_id);
    const chatId = event.message_type === "group" ? oneBotId(event.group_id) : senderId;
    if (!chatId) return;
    const decision = classifyQqEvent(
      event,
      config,
      this.selfId,
      settings.keywords.trigger,
      settings.toolAccess,
      // 加入区块 = 加入群白名单（接线见 qqGroupPolicyOptions）
      qqGroupPolicyOptions(),
    );
    // 去重键必须带 chatId：`message_id` 只在**单个会话内**唯一 ——
    // 群 A 和群 B（或群与私聊）完全可能发出同一个 message_id，
    // 只按 selfId + message_id 做键会让后到的那条被当成重复而静默丢弃。
    const dedupeKey = `${this.selfId}:${chatId}:${oneBotId(event.message_id)}`;
    const now = Date.now();
    for (const [key, expiresAt] of this.dedupe) if (expiresAt <= now) this.dedupe.delete(key);
    if (this.dedupe.has(dedupeKey)) return;
    this.dedupe.set(dedupeKey, now + DEDUPE_TTL_MS);

    // 语料采集（群聊 + 私聊）：纯旁路，只落盘，不读、不注入、不影响本函数任何后续分支。
    //
    // 位置：在内存去重**之后**（重连补投不重复入语料）、在权限 `drop` 分支**之前**。
    //
    // 但"在 drop 之前"只适用于**群聊**：未加白群的闲聊也要采（将来把群加进白名单时
    // 历史已经在攒）。**私聊不能这样** —— 私聊没有"旁观"一说，被拒的消息（陌生人的
    // spam、黑名单里的人）如果也记进来，语料就被污染了，所以私聊只记放行的。
    //
    // 代价：这里拿不到 normalizeOneBotMessage 的成果（它在下方、且会 await），
    // 所以正文与附件占位都要自己从 segments 抽一遍。
    //
    // 私聊只收得到**对方发来的**消息：昔涟自己发出的在她发送时就已经存在，
    // 两处入口都以 self_id 过滤掉了，所以私聊语料是单向的。
    try {
      const isPrivate = event.message_type === "private";
      if (chatId && (!isPrivate || decision.action !== "drop")) {
        const corpusMessageId = oneBotId(event.message_id);
        const segmentAttachments = describeSegmentAttachments(event.message);
        writeGroupCorpus({
          kind: isPrivate ? "private" : "group",
          groupId: chatId,
          // 会话名不在消息事件里（OneBot 只给 group_id / user_id），所以文件夹名只有 id。
          // 这是有意的：宁可不拼名字，也不拿发言者昵称冒充会话名。
          senderId,
          ...(event.sender?.card || event.sender?.nickname
            ? { senderName: event.sender.card || event.sender.nickname }
            : {}),
          ...(corpusMessageId ? { messageId: corpusMessageId } : {}),
          text: textFromSegments(event.message),
          ...(segmentAttachments ? { attachmentText: segmentAttachments } : {}),
          // 与 onebot-normalizer 同款兜底：事件没带 time 时用当前时间，
          // 否则会按 1970 年分片，攒出一个假的 1970-01-01.jsonl。
          at: new Date((Number(event.time) || Math.floor(Date.now() / 1000)) * 1000),
          // 私聊到这里必定已放行（被拒的已在上面排除）。
          groupAllowed: isPrivate || config.allowedGroupIds.includes(chatId),
          // 私聊里对方说话就是在找她，不存在"只是看着"。
          triggered: isPrivate || decision.action === "respond",
          ...(!isPrivate && decision.action === "respond" ? { trigger: decision.trigger } : {}),
        });
      }
    } catch (corpusError) {
      console.warn("[NapCatAdapter] 语料采集失败（不影响消息链路）:",
        corpusError instanceof Error ? corpusError.message : String(corpusError));
    }

    if (decision.action === "drop") {
      // 只有"在叫昔涟但没被授权"才留痕；群友没 @ 也没命中触发词的闲聊不记录，避免刷屏。
      if (decision.allowlist) {
        this.recordBlocked(decision, {
          channel: "qq",
          chatType: event.message_type === "group" ? "group" : "private",
          chatId,
          senderId,
          ...(decision.trigger ? { trigger: decision.trigger } : {}),
        }, textFromSegments(event.message));
      }
      return;
    }

    try {
      const incoming = await normalizeOneBotMessage(event, {
        selfId: this.selfId,
        client,
        media: this.media,
        supportsStream: this.supportsStream,
      });

      // 旁听：只写群 transcript（带说话人），不起 run、不回复。
      if (decision.action === "observe") {
        this.writeObservedTranscript(incoming);
        return;
      }

      incoming.trigger = decision.trigger;
      await this.onMessage?.(incoming);
    } catch (error) {
      console.warn("[NapCatAdapter] QQ 消息处理失败:", error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * 旁听消息落群 transcript。
   *
   * 只处理群聊：私聊消息本来就会在 dispatcher 里落历史，旁听不覆盖私聊。
   * 正文为空但有附件时补一个占位标记——否则群里发图/发文件的那条消息会变成
   * 一条空记录，模型只知道"有人说过话"却不知道说了什么。
   */
  private writeObservedTranscript(msg: IncomingMessage): void {
    if (msg.chatType !== "group") return;
    const content = msg.text.trim() || describeAttachmentsOnly(msg.attachments);
    if (!content) return;
    appendHistory(makeSessionId(msg.channel, msg.chatId), "user", content, {
      speakerId: msg.senderId,
      ...(msg.senderName ? { speakerName: msg.senderName } : {}),
      isBot: false,
      triggered: false,
    });
  }

  /** 写控制台拦截记录；适配器只做数据搬运，失败不影响消息链路。 */
  private recordBlocked(
    decision: Extract<QqEventDecision, { action: "drop" }>,
    subject: Parameters<typeof recordMessageBlocked>[0],
    text: string,
  ): void {
    try {
      recordMessageBlocked(subject, { text, reason: decision.reason });
    } catch (error) {
      console.warn("[NapCatAdapter] 写拦截记录失败:", error instanceof Error ? error.message : String(error));
    }
  }

  private async partToPayloads(part: OutgoingPart): Promise<OneBotSegment[][]> {
    if (part.kind === "text") {
      return splitQqText(part.text).map((text) => [{ type: "text", data: { text } }]);
    }
    if (part.kind === "card") {
      const text = [part.title, part.markdown, ...(part.fields ?? []).map((field) => `${field.key}: ${field.value}`)]
        .filter(Boolean)
        .join("\n");
      return splitQqText(text).map((value) => [{ type: "text", data: { text: value } }]);
    }
    if (part.kind === "image") {
      const file = part.filePath
        ? await this.media.encodeOutbound(part.filePath, "image", this.supportsStream)
        : part.url;
      if (!file) throw new Error("QQ 图片缺少 filePath/url");
      return [[{ type: "image", data: { file } }]];
    }
    if (part.kind === "sticker") {
      const file = await this.media.encodeOutbound(part.imagePath, "image", this.supportsStream);
      return [[{ type: "image", data: { file } }]];
    }
    if (part.kind === "audio") {
      const file = await this.media.encodeOutbound(part.filePath, "audio", this.supportsStream);
      return [[{ type: "record", data: { file } }]];
    }
    if (part.kind === "file") {
      const file = await this.media.encodeOutbound(part.filePath, "file", this.supportsStream);
      return [[{ type: "file", data: { file, name: part.name } }]];
    }
    const file = await this.media.encodeOutbound(part.filePath, "video", this.supportsStream);
    return [[{ type: "video", data: { file } }]];
  }

  private statusDetail(): Record<string, unknown> {
    return {
      listenUrl: this.listeningInfo?.url,
      listenHost: this.listeningInfo?.host,
      listenMode: this.listeningInfo?.mode,
      selfId: this.selfId || undefined,
      nickname: this.nickname || undefined,
      appVersion: this.appVersion || undefined,
      supportsStream: this.supportsStream,
      streamMinimumVersion: ONEBOT_STREAM_MIN_VERSION,
    };
  }

  private setStatus(status: ChannelStatus): void {
    this.status = status;
    this.onStatusChanged?.();
  }
}
