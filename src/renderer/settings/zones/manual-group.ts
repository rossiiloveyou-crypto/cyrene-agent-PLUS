// 「手动加群」的纯逻辑：渠道清单 + 输入校验 + 提示文案映射。
//
// 为什么需要这条路：区块成员选择器的数据源是 channels/context-bindings.json 里的
// externalChats，只包含**已经产生过对话**的外部会话。群白名单并入区块之后，
// 一个全新的群（还没跟昔涟说过话）既不在选择器里、也没有旧的白名单输入框，
// 用户就完全没办法给它加白。这里补上"手动输入群号"这个入口。
//
// 校验规则本体在 src/shared/zone-group.ts：渲染进程要在输入框旁即时提示，
// 主进程不能信任渲染进程必须再校验，两边共用同一份规则，避免口径漂移。

import {
  MANUAL_GROUP_CHANNELS,
  normalizeManualGroupChatId,
  type ManualGroupChannel,
} from "../../../shared/zone-group";

export interface ManualGroupChannelOption {
  channel: ManualGroupChannel;
  /** 选择器里的主标题（i18n key）。 */
  labelKey: string;
  /** 选择器里的次要说明：这个渠道的群号长什么样（i18n key）。 */
  noteKey: string;
  /** 输入弹窗的正文（i18n key）。 */
  messageKey: string;
  /** 输入框占位符（i18n key）。 */
  placeholderKey: string;
}

/** 渠道清单：与共享规则里的 MANUAL_GROUP_CHANNELS 一一对应（顺序即展示顺序）。 */
export const MANUAL_GROUP_CHANNEL_OPTIONS: ManualGroupChannelOption[] = [
  {
    channel: "qq",
    labelKey: "settings.panel.zones.manualGroup.channel.qq",
    noteKey: "settings.panel.zones.manualGroup.channel.qqNote",
    messageKey: "settings.panel.zones.manualGroup.message.qq",
    placeholderKey: "settings.panel.zones.manualGroup.placeholder.qq",
  },
  {
    channel: "qqbot",
    labelKey: "settings.panel.zones.manualGroup.channel.qqbot",
    noteKey: "settings.panel.zones.manualGroup.channel.qqbotNote",
    messageKey: "settings.panel.zones.manualGroup.message.qqbot",
    placeholderKey: "settings.panel.zones.manualGroup.placeholder.qqbot",
  },
];

/** 共享规则里新增渠道时，UI 清单必须跟上（否则用户看不到那个渠道）。 */
export function missingManualGroupChannelOptions(): string[] {
  const covered = new Set(MANUAL_GROUP_CHANNEL_OPTIONS.map((option) => option.channel));
  return MANUAL_GROUP_CHANNELS.filter((channel) => !covered.has(channel));
}

export type ManualGroupInputCheck =
  | { ok: true; chatId: string }
  /** empty：没填；format：填了但格式不对（按渠道给不同提示）。 */
  | { ok: false; reason: "empty" | "format" };

/** 校验输入框内容。规范化后的 chatId 交给主进程；主进程会再算一次 sessionId。 */
export function checkManualGroupInput(channel: ManualGroupChannel, raw: string): ManualGroupInputCheck {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, reason: "empty" };
  const chatId = normalizeManualGroupChatId(channel, trimmed);
  return chatId ? { ok: true, chatId } : { ok: false, reason: "format" };
}

/** 输入错误 → i18n key。 */
export function manualGroupErrorKey(reason: "empty" | "format"): string {
  return reason === "empty"
    ? "settings.panel.zones.manualGroup.errorEmpty"
    : "settings.panel.zones.manualGroup.errorFormat";
}

/** 手动加群成功的提示（从别的区块移过来时额外说明）。 */
export function manualGroupAddedKey(movedFrom: unknown): string {
  return movedFrom
    ? "settings.panel.zones.manualGroup.addedMoved"
    : "settings.panel.zones.manualGroup.added";
}

/**
 * 成员显示名：手填的群只有群号，没有昵称。
 * 优先用手动填写时带的 senderName，其次用 externalChats 里渠道后来补齐的昵称
 * （群里说过话之后 context-bindings 会记下群名），最后才落到群号本身。
 */
export function resolveMemberDisplayName(
  member: { chatId: string; senderName?: string },
  externalChatName?: string,
): string {
  return member.senderName || externalChatName || member.chatId;
}
