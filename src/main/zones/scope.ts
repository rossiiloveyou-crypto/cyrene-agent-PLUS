// Scope 解析器 —— 把"一次运行属于哪个记忆域"收敛到一个纯函数入口。
//
// 规则（与用户约定一致）：
//   - 桌面对话：默认 root 区块（桌面隐式属于 root，不做成员存储）
//   - 外部会话：若在某区块 → 该区块；否则 → solo:<sessionId>（独立域）
//
// 注意：渠道 sessionId 是 `channel:<渠道>:<sha256 前 16 位>`，群/私聊形态相同，
// 所以这里**只按 sessionId 反查区块**，不尝试从 ID 解析群/私聊类型。

import { getZoneStore } from "./zone-store";
import { isSoloScope, rootScope, soloScope, zoneScope, type MemoryScopeId, type Zone } from "./types";

export { isSoloScope, rootScope, soloScope, zoneScope };
export type { MemoryScopeId };

export const CHANNEL_SESSION_PREFIX = "channel:";

/** 判断一个 id 是不是渠道会话 id（而非桌面对话 id）。 */
export function isChannelSessionId(id: string | undefined | null): boolean {
  return typeof id === "string" && id.startsWith(CHANNEL_SESSION_PREFIX);
}

/**
 * 解析一次运行所属的记忆域。
 *
 * @param sessionId 桌面对话 id（cyrene-chats）或渠道 sessionId（channel:...）
 */
export function resolveScopeId(sessionId: string | undefined | null): MemoryScopeId {
  if (!sessionId) return rootScope();
  if (!isChannelSessionId(sessionId)) return rootScope();

  const zone = getZoneStore().findZoneBySessionId(sessionId);
  return zone ? zoneScope(zone.zoneId) : soloScope(sessionId);
}

/**
 * 当前域是否允许注入 owner 的 L0/L1 画像。
 *
 * - root：是（桌面就是用户本人的空间）
 * - solo（未归区的外部会话，尤其群）：否 —— 私人画像绝不外泄到陌生群
 * - 自定义区块：看区块配置，默认 false
 */
export function shouldInjectOwnerProfile(scopeId: MemoryScopeId): boolean {
  if (scopeId === rootScope()) return true;
  if (isSoloScope(scopeId)) return false;
  const zoneId = scopeId.slice("zone:".length);
  return getZoneStore().getZone(zoneId)?.config.injectOwnerProfile ?? false;
}

/** 当前域是否旁听群消息（未归区的群默认旁听，因为能收到消息说明已被放行）。 */
export function shouldObserveGroupMessages(zoneId: string | null | undefined): boolean {
  if (!zoneId) return true;
  return getZoneStore().getZone(zoneId)?.config.observeGroupMessages ?? true;
}

/** 内部：把 sessionId 解析成所属 zone（可能为 null）。供白名单与旁听判定复用。 */
export function findZoneBySessionId(sessionId: string): Zone | null {
  return getZoneStore().findZoneBySessionId(sessionId);
}

// ── 群白名单 / 旁听判定（按 channel + chatId，不需要先算 sessionId）──

function isGroupMember(m: { kind: string; chatType?: string; channel?: string; chatId?: string }, channel: string, groupId: string): boolean {
  return m.kind === "external" && m.chatType === "group" && m.channel === channel && m.chatId === groupId;
}

/** 该群是否已加入某个区块（加入区块 = 加入白名单）。 */
export function isGroupInAnyZone(channel: string, groupId: string): boolean {
  return getZoneStore()
    .listZones()
    .some((zone) => zone.members.some((m) => isGroupMember(m, channel, groupId)));
}

/** 该群所在区块是否允许旁听；未归区（或未配置）时视为允许。 */
export function shouldObserveGroupInZone(channel: string, groupId: string): boolean {
  const zone = getZoneStore()
    .listZones()
    .find((z) => z.members.some((m) => isGroupMember(m, channel, groupId)));
  return zone ? zone.config.observeGroupMessages : true;
}
