// 区块（Zone）—— 记忆域的用户可配置一等对象。
//
// 心智模型：
//   root 区块（唯一、不可删）
//     ├─ 所有桌面对话（隐式成员，自动包含）
//     └─ 最多 1 个 QQ 私聊（共享记忆域，但短期上下文各按会话隔离）
//   自定义区块（0..N 个）
//     └─ 只能包含外部会话（QQ 群 / QQ 私聊 / 其他渠道）
//
//   未加入任何区块的外部会话 = 独立域（standalone）
//
// 不变量：
//   1. 一个外部会话同一时刻只属于一个区块
//   2. 加入区块 = 加入该渠道的白名单
//   3. 区块只描述"记忆域"
//
// 历史说明：区块曾经还负责"消息映射"（渠道会话 ↔ 桌面对话双向镜像），
// 该功能已删除。现在渠道消息**不再**镜像进桌面对话文件；放进 root 的 QQ 私聊
// 仍然共享长期记忆（L0/L1/L2），但不再共享短期上下文 —— 短期上下文本就该按
// 房间隔离，只有长期记忆该共享。

/** 区块成员类型。desktop 只属于 root；其余为外部渠道会话。 */
export type ZoneMemberKind = "desktop" | "external";

export interface ZoneDesktopMember {
  kind: "desktop";
  /** 桌面对话 ID（cyrene-chats/sessions/<id>.json） */
  conversationId: string;
}

export interface ZoneExternalMember {
  kind: "external";
  /** 渠道会话 ID：与 channels/history/*.jsonl 文件键一致（channel:<channel>:<hash16>） */
  sessionId: string;
  /** 渠道 id（qq / wechat / feishu / qqbot / 插件动态渠道） */
  channel: string;
  /** 平台会话 id（群号 / 私聊对端 id）。仅用于展示与白名单判定。 */
  chatId: string;
  chatType: "private" | "group";
  /** 展示名（群名 / 昵称），可缺失 */
  senderName?: string;
}

export type ZoneMember = ZoneDesktopMember | ZoneExternalMember;

export interface ZoneConfig {
  /** 群消息旁听：区块内未 @ 昔涟的消息也写入 transcript 供上下文理解。默认 true。 */
  observeGroupMessages: boolean;
  /** 是否在本区块注入 owner 的 L0/L1 画像。群聊默认 false（隐私）。 */
  injectOwnerProfile: boolean;
}

export interface Zone {
  /** "root" 或 "zone_<timestamp>_<rand6>" */
  zoneId: string;
  /** 展示名。root 固定为 "desktop" */
  zoneName: string;
  /** root 区块：不可删除；自动包含全部桌面对话 */
  isRoot: boolean;
  createdAt: number;
  members: ZoneMember[];
  config: ZoneConfig;
}

export interface ZoneStoreData {
  version: 1;
  zones: Zone[];
}

// ── 记忆域标识 ──

/**
 * 记忆域标识。用字符串而非对象：它要持久化进 memory.json / 向量 metadata /
 * 关系日志，还要参与过滤比较，字符串最省事，过滤就是一行 `===`。
 *
 * - `zone:root`            root 区块
 * - `zone:<zoneId>`        自定义区块
 * - `solo:<sessionId>`     未加入任何区块的外部会话（独立域）
 */
export type MemoryScopeId = string;

export const ROOT_ZONE_ID = "root";

export function zoneScope(zoneId: string): MemoryScopeId {
  return `zone:${zoneId}`;
}

export function rootScope(): MemoryScopeId {
  return zoneScope(ROOT_ZONE_ID);
}

export function soloScope(sessionId: string): MemoryScopeId {
  return `solo:${sessionId}`;
}

export function isSoloScope(scopeId: MemoryScopeId): boolean {
  return scopeId.startsWith("solo:");
}
