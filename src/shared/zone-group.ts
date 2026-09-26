// 手动把「还没跟昔涟说过话的群」加入区块的共享规则。
//
// 背景：区块成员选择器只能列出**已经产生过对话**的外部会话（数据源是
// channels/context-bindings.json 的 externalChats）。而群白名单并入区块之后，
// 一个全新的群如果从没收到过消息，就既不在选择器里、也没有旧白名单输入框，
// 用户于是完全无法给新群加白。这个模块支撑「手动输入群号加入区块」这条路径。
//
// 为什么规则写在这里而不是各写一份：渲染进程要在输入框里即时提示格式错误，
// 主进程又不能信任渲染进程、必须再校验一遍。两份正则一旦漂移，就会出现
// 「界面说合法、主进程拒绝」或更糟的「界面放过、脏数据进 zones.json」。

/**
 * 支持手动加群的渠道。
 *
 * 只列**群访问由区块成员决定**的渠道：
 *   - qq    NapCat / OneBot：`classifyQqEvent` 的群白名单 = 区块成员 ∨ 旧 allowedGroupIds
 *   - qqbot QQ 官方机器人：`shouldRespondQqBotEvent` 的群白名单 = 区块成员 ∨ 旧 allowedGroupOpenids
 * 微信 / 飞书没有群白名单概念，加进区块只会改变记忆域、不会让机器人开始回话，
 * 所以不在这里提供，避免给出"加了就能用"的错误暗示。
 */
export const MANUAL_GROUP_CHANNELS = ["qq", "qqbot"] as const;

export type ManualGroupChannel = (typeof MANUAL_GROUP_CHANNELS)[number];

export function isManualGroupChannel(value: unknown): value is ManualGroupChannel {
  return typeof value === "string" && (MANUAL_GROUP_CHANNELS as readonly string[]).includes(value);
}

/** qq：NapCat 的 `group_id` 原样，就是大家说的「群号」。 */
const QQ_GROUP_ID_PATTERN = /^\d{5,12}$/;

/**
 * qqbot：官方机器人 API 的 `group_openid`。
 * 形如 `A1B2C3D4E5F6...`（大写十六进制风格的 32 位串），按宽松的
 * 「字母数字下划线连字符」接受，长度 6~64。
 */
const QQBOT_GROUP_OPENID_PATTERN = /^[A-Za-z0-9_-]{6,64}$/;

/**
 * qqbot 渠道下要额外拦掉的「这看起来是 QQ 群号」输入。
 *
 * 官方机器人只认 group_openid，群号填进来不会报错、但永远匹配不上任何群
 * （白名单判定比的是 openid），等于写了一条死配置。所以宁可当场拒绝，
 * 也不要让用户以为"加白成功了"。真正的 openid 是 32 位 token，不会被这条规则误伤。
 */
const QQBOT_QQ_GROUP_NUMBER_LIKE = /^\d{5,16}$/;

/** chatId 长度上限（与 zones-ipc 的 readString 上限一致）。 */
export const MANUAL_GROUP_CHAT_ID_MAX = 64;

/**
 * 清洗手动输入的群标识。
 *
 * @returns 规范化后的 chatId；渠道未知或格式不合时返回 null。
 */
export function normalizeManualGroupChatId(channel: string, raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const chatId = raw.trim();
  if (!chatId || chatId.length > MANUAL_GROUP_CHAT_ID_MAX) return null;
  if (channel === "qq") return QQ_GROUP_ID_PATTERN.test(chatId) ? chatId : null;
  if (channel === "qqbot") {
    if (QQBOT_QQ_GROUP_NUMBER_LIKE.test(chatId)) return null;
    return QQBOT_GROUP_OPENID_PATTERN.test(chatId) ? chatId : null;
  }
  return null;
}

/** 展示名清洗：可缺失，非法时返回 undefined（宁可不显示也不要脏数据）。 */
export function normalizeManualGroupName(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const name = raw.trim();
  if (!name) return undefined;
  return name.slice(0, 128);
}
