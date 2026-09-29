import { createHash } from "crypto";
// import type 是纯类型引用，编译后消失，不引入运行时循环依赖
// （history-log 也不反向依赖 channel-context）。
import type { PersistedHistoryEntry } from "./history-log";
import type { PreparedOutgoing } from "./outgoing-composer";
import type { ChannelId, IncomingMessage } from "./types";

const LOG = "[ChannelContext]";

/** 用于拼接历史对话的轻量消息结构。 */
export interface ChatMessage {
  role: "user" | "assistant" | "system" | "tool";
  content?: string;
  /** 群聊说话人昵称（仅渠道历史填充；私聊与绑定会话历史为空）。 */
  speakerName?: string;
  /** 群聊说话人平台 ID（QQ 号等）。 */
  speakerId?: string;
  /** 该条是否触发了昔涟回复。群聊旁听为 false；旧记录/私聊可能缺失。 */
  triggered?: boolean;
}

/**
 * 单条入站消息已经确定的上下文快照。
 *
 * 🔴 本分支决定（D1）：桌面对话绑定已**彻底删除**。
 * 官方在此处多一个「绑定的桌面对话 id」字段，本分支不带该字段 ——
 * 渠道会话自带短期上下文，不再绑定桌面对话（见 resolveDispatchContext 的注释）。
 */
export interface DispatchContext {
  sessionId: string;
}

/**
 * 队列内冻结的会话目标。
 *
 * ⚠️ 本分支保留该类型：`dispatcher.ts` 的 `ChannelAgentInput.target` 与非冲突区的
 * 6 处 `target.conversationId` 都用它，且 `acceptance.test.ts` 直接断言
 * `input.target.conversationId`。D1 只删**绑定语义**（原来的可选取 `boundConversationId`
 * 字段与那个解析函数），不删这个"纯会话目标"的形状。
 */
export interface ChannelConversationTarget {
  conversationId: string;
}

export interface ChannelContext {
  /** 解析一次上下文快照（渠道会话自带短期上下文，不再绑定桌面对话）。 */
  resolveDispatchContext(sessionId: string): DispatchContext;
  /** 迁移旧历史键并记录会话与原始发送者的关系。 */
  recordIncomingSession(msg: IncomingMessage, context: DispatchContext): void;
  /** 读取快照指向的渠道历史。 */
  resolvePriorMessages(
    context: DispatchContext,
    limit: number,
  ): Promise<ChatMessage[] | undefined>;
  /** 写入渠道用户历史，返回落盘对象（含 id）；未落盘时 null。 */
  appendIncomingContext(
    msg: IncomingMessage,
    context: DispatchContext,
  ): Promise<PersistedHistoryEntry | null>;
  /** 在发送确认后写入渠道助手历史，返回落盘对象（含 id）；未落盘时 null。 */
  appendAssistantContext(
    msg: IncomingMessage,
    context: DispatchContext,
    prepared: PreparedOutgoing,
  ): Promise<PersistedHistoryEntry | null>;
}

export interface CreateChannelContextOptions {
  loadRecentChannelHistory?: (
    sessionId: string,
    limit: number,
  ) => Promise<ChatMessage[]>;
  /**
   * 渠道历史写入. 返回落盘的消息对象 (含 id); 未落盘时 null.
   *
   * 返回类型放宽到 `undefined` 是因为这是**注入点**（测试桩/未来实现可能什么都不返回），
   * 实现侧的 `?? null` 正是为它准备的 —— 类型上写清楚，比让 `?? null` 无据可依更诚实。
   */
  appendChannelHistory: (
    sessionId: string,
    role: "user" | "assistant",
    content: string,
    meta?: { speakerId?: string; speakerName?: string; isBot?: boolean; triggered?: boolean },
  ) => PersistedHistoryEntry | null | undefined | Promise<PersistedHistoryEntry | null | undefined>;
  migrateHistory: (fromSessionId: string, toSessionId: string) => void;
}

/** 会话标识到原始发送者的调试索引。 */
const sessionIndex = new Map<
  string,
  { channel: ChannelId; senderId: string; lastAt: number }
>();

/** 计算稳定且匿名的渠道会话标识。 */
export function makeSessionId(channel: ChannelId, chatId: string): string {
  const hash = createHash("sha256")
    .update(`${channel}:${chatId}`)
    .digest("hex")
    .slice(0, 16);
  return `channel:${channel}:${hash}`;
}

/** 生成供模型和渠道历史使用的用户文本。 */
export function formatChannelUserText(msg: IncomingMessage): string {
  if (msg.chatType !== "group") return msg.text;
  const sender = msg.senderName
    ? `${msg.senderName} (${msg.senderId})`
    : msg.senderId;
  const reply = msg.reply?.text
    ? `\n引用 ${msg.reply.senderName || msg.reply.senderId || "未知用户"}：${msg.reply.text}`
    : "";
  // 触发关键词命中的群消息没有 @ 昔涟，必须显式告诉模型"这条是在叫你"
  const triggerNote = msg.trigger === "trigger_keyword"
    ? "\n[本条消息命中触发关键词（未 @ 你），按约定需要你回复]"
    : "";
  return `[群聊发送者：${sender}]${triggerNote}${reply}\n${msg.text}`;
}

/**
 * 群聊正文去掉「发送者前缀」那一行，保留其余内容（引用行 / 触发提示行）。
 *
 * 为什么需要它：结构化字段（speakerId 等）会跟正文里的 `[群聊发送者：…]` 前缀重复表达同一件事，
 * 且 speakerId 存在会让 history-log 的 normalizeEntry 跳过剥前缀，再叠上滑动窗口映射的前缀
 * 就会变成 `[小明]: [群聊发送者：小明 (10001)]\n…`。所以写入时就要把前缀砍掉。
 *
 * 只砍前缀、不砍引用：`引用 小红：…` 与 `[本条消息命中触发关键词…]` 是正文语义，必须保留。
 *
 * ⚠️ 不能用 `[^\]\n]+` 吃昵称：QQ 昵称可以含 `]`（如 `[b°t]BEIKIA`），
 * 那样会在昵称内部的 `]` 上收尾，把 `BEIKIA (2914636187)]\n111` 这种残片留给模型。
 * 这里把「分隔 `]`」锚定成"行尾或 `(数字)` 之前"：昵称内部的 `]` 不满足锚点会被跳过，
 * 而惰性的 `[^\n]{0,300}?` 保证正常昵称（`[群聊发送者：小明 (10001)]`）仍在第一个 `]` 收尾，
 * 不会贪婪吞掉正文。
 *
 * 注意本函数只服务**本轮新消息**（入参就是 formatChannelUserText 的输出，形如 `[群聊发送者：X (id)]\n正文`），
 * 所以锚点不需要兼容 legacy 的 `(@昔涟)` / `(触发词)` 标记——那些只存在于磁盘旧记录里，
 * 由 history-log 的 LEGACY_SPEAKER_PREFIX 负责。
 */
function stripSpeakerPrefix(text: string): string {
  return text.replace(/^\[群聊发送者：[^\n]{0,300}?\](?=\n|$|\(\d{1,32}\))\n?/, "");
}

/** 按会话标识反查原始发送者，仅用于调试。 */
export function lookupOriginalSender(
  sessionId: string,
): { channel: ChannelId; senderId: string } | null {
  const entry = sessionIndex.get(sessionId);
  return entry ? { channel: entry.channel, senderId: entry.senderId } : null;
}

/**
 * 忘掉某个发送者在调试索引里的全部会话（P3 擦除某人）。
 *
 * sessionIndex 是进程内缓存（sessionId → 原始发送者），唯一读取方是"仅用于调试"的
 * lookupOriginalSender。擦除后他的 sessionId 已经没有任何意义，留着只会让调试视图
 * 继续显示这个人。返回实际清理的条数（幂等，不存在就是 0）。
 */
export function forgetSessionIndex(senderId: string): number {
  let removed = 0;
  for (const [sessionId, entry] of sessionIndex) {
    if (entry.senderId !== senderId) continue;
    sessionIndex.delete(sessionId);
    removed += 1;
  }
  return removed;
}

export function createChannelContext(
  options: CreateChannelContextOptions,
): ChannelContext {
  return {
    resolveDispatchContext(sessionId): DispatchContext {
      // 🔴 D1：桌面对话绑定已彻底删除 → 渠道会话一律使用自己的 sessionId 作为上下文键。
      //    （官方此处会查绑定存储并优先用之；其 else 分支正是本形态。）
      return { sessionId };
    },

    recordIncomingSession(msg, context): void {
      options.migrateHistory(
        makeSessionId(msg.channel, msg.senderId),
        context.sessionId,
      );
      recordSession(msg.channel, msg.senderId, context.sessionId);
    },

    async resolvePriorMessages(context, limit): Promise<ChatMessage[] | undefined> {
      if (!options.loadRecentChannelHistory) return undefined;
      try {
        return await options.loadRecentChannelHistory(context.sessionId, limit);
      } catch (err) {
        console.warn(LOG, "渠道历史读取失败，继续不带历史:", err);
        return undefined;
      }
    },

    async appendIncomingContext(msg, context): Promise<PersistedHistoryEntry | null> {
      const modelText = formatChannelUserText(msg);
      const isGroup = msg.chatType === "group";
      try {
        // ⚠️ 群聊写 stripSpeakerPrefix(modelText)：砍掉发送者前缀、保留引用行。
        //    写 msg.text 会丢引用；写 modelText 整段会双前缀。两者都不要。
        // `?? null` 是必要的：appendChannelHistory 是注入的，测试/未来实现可能返回 undefined。
        return (await options.appendChannelHistory(
          context.sessionId,
          "user",
          isGroup ? stripSpeakerPrefix(modelText) : modelText,
          isGroup
            ? {
                speakerId: msg.senderId,
                ...(msg.senderName ? { speakerName: msg.senderName } : {}),
                isBot: false,
                // 能走到 appendIncomingContext 就是被叫起来了（dispatcher 只处理 respond）
                triggered: true,
              }
            : undefined,
        )) ?? null;
      } catch (err) {
        // 历史写入失败不能中断对话主流程，所以这里吞掉异常并返回 null（不是抛错）。
        console.warn(LOG, "渠道用户历史写入失败:", err);
        return null;
      }
    },

    async appendAssistantContext(msg, context, prepared): Promise<PersistedHistoryEntry | null> {
      try {
        return (await options.appendChannelHistory(
          context.sessionId,
          "assistant",
          prepared.assistantText,
          { isBot: true },
        )) ?? null;
      } catch (err) {
        console.warn(LOG, "渠道助手历史写入失败:", err);
        return null;
      }
    },
  };
}

/** 更新调试索引，并限制进程内缓存规模。 */
function recordSession(
  channel: ChannelId,
  senderId: string,
  sessionId: string,
): void {
  sessionIndex.set(sessionId, { channel, senderId, lastAt: Date.now() });
  if (sessionIndex.size <= 5000) return;

  const oldest = [...sessionIndex.entries()]
    .sort((a, b) => a[1].lastAt - b[1].lastAt)[0];
  if (oldest) sessionIndex.delete(oldest[0]);
}
