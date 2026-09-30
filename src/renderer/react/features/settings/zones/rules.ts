// P9 T3 · 区块页的纯规则函数。
//
// 抄写自 `src/renderer/settings/zones/picker.ts`（H-07 保留的「里子」模块，只读参照）里
// 与 DOM 无关的部分 —— 抄写理由同 memory-console/rules.ts（C4：里子模块不在
// `tsconfig.renderer.json` 的 include 面内，import 进来等于绕过类型门禁）。
//
// 出处对照：
//   · zoneMemberKey            ← src/renderer/settings/zones/picker.ts:15-17
//   · collectMemberPickEntries ← src/renderer/settings/zones/picker.ts:38-58
//   · pickEntryToMember        ← src/renderer/settings/zones/picker.ts:61-77
//
// ⚠️ 主进程 `zone-store` 是真正的规则权威，这里只做 UI 侧的呈现与预判：
//   1) `kind:"desktop"` 只允许出现在 root，且 root 自动包含全部桌面对话
//      → 选择器里**不提供**桌面对话选项；
//   2) 一个外部会话同一时刻只属于一个区块 → 已在目标区块里的项置灰，已在别处的标注来源区块。

import type { Zone, ZoneExternalMember, ZoneMember, ZonesSnapshot } from "../../../../settings/shared/types";

/** 成员稳定 key：与主进程 `zone-store` 的 memberKey 保持一致。 */
export function zoneMemberKey(member: ZoneMember): string {
  return member.kind === "desktop" ? `desktop:${member.conversationId}` : `external:${member.sessionId}`;
}

export interface ZonePickerEntry {
  /** 成员 key（external:<sessionId>）。 */
  key: string;
  /** 主标题（昵称 / 群名）。 */
  label: string;
  /** 次要说明（渠道 · 类型 · chatId，以及是否已在别的区块）。 */
  note: string;
  /** 已在目标区块里：置灰，点选无效。 */
  disabled: boolean;
}

function chatTypeLabel(chatType: "private" | "group"): string {
  return chatType === "group" ? "群聊" : "私聊";
}

/**
 * 收集某个区块可以加入的成员。
 * **只从 externalChats 里取**：桌面对话自动属于 root，永远不进选择器。
 */
export function collectMemberPickEntries(snapshot: ZonesSnapshot, targetZoneId: string): ZonePickerEntry[] {
  const target = snapshot.zones.find((zone) => zone.zoneId === targetZoneId) ?? null;
  const targetKeys = new Set((target?.members ?? []).map(zoneMemberKey));
  const ownerByKey = new Map<string, string>();
  for (const zone of snapshot.zones) {
    for (const member of zone.members) ownerByKey.set(zoneMemberKey(member), zone.zoneName);
  }

  return snapshot.externalChats.map((chat) => {
    const key = `external:${chat.sessionId}`;
    const parts = [chat.channel, chatTypeLabel(chat.chatType), chat.chatId].filter((part) => !!part);
    const owner = ownerByKey.get(key);
    if (owner) parts.push(`已在「${owner}」`);
    return {
      key,
      label: chat.senderName || chat.chatId,
      note: parts.join(" · "),
      disabled: targetKeys.has(key),
    };
  });
}

/** 把选择器条目还原成可提交给主进程的成员对象。 */
export function pickEntryToMember(snapshot: ZonesSnapshot, key: string): ZoneExternalMember | null {
  const sessionId = key.startsWith("external:") ? key.slice("external:".length) : "";
  if (!sessionId) return null;
  const chat = snapshot.externalChats.find((item) => item.sessionId === sessionId)
    ?? snapshot.zones.flatMap((zone) => zone.members).find(
      (member): member is ZoneExternalMember => member.kind === "external" && member.sessionId === sessionId,
    );
  if (!chat) return null;
  return {
    kind: "external",
    sessionId: chat.sessionId,
    channel: chat.channel,
    chatId: chat.chatId,
    chatType: chat.chatType,
    ...(chat.senderName ? { senderName: chat.senderName } : {}),
  };
}

/**
 * 成员数量：root 还要算上**自动包含**的桌面对话（它们不是显式成员）。
 * 出处：`panel.ts:70-72`。
 */
export function zoneMemberCount(zone: Zone, snapshot: ZonesSnapshot): number {
  return zone.members.length + (zone.isRoot ? snapshot.conversations.length : 0);
}

/**
 * root 的「私聊映射」说明（`panel.ts:81-90`）。
 * 历史：曾经显示「昵称 → 桌面对话（双向镜像）」，镜像功能已删除 →
 * 现在只说"这个私聊归在 root 里"，没有私聊成员时返回 null（由调用方显示"未绑定"）。
 */
export function findRootPrivateMember(zone: Zone): ZoneExternalMember | null {
  return zone.members.find(
    (member): member is ZoneExternalMember => member.kind === "external" && member.chatType === "private",
  ) ?? null;
}

/** 成员显示名：手填的群只有群号；优先 senderName，其次 externalChats 补齐的昵称，最后群号本身。 */
export function resolveMemberDisplayName(
  member: { chatId: string; senderName?: string },
  externalChatName?: string,
): string {
  return member.senderName || externalChatName || member.chatId;
}

/** 只读展示用的桌面对话行（root 自动包含，不可勾选、不可移出）。 */
export function desktopMemberRows(snapshot: ZonesSnapshot): Array<{ id: string; title: string }> {
  return snapshot.conversations.map((conversation) => ({ id: conversation.id, title: conversation.title }));
}

/** root 区块不渲染改名 / 删除按钮（主进程也会忽略由 UI 发起的改名）。 */
export function canRenameZone(zone: Zone): boolean {
  return !zone.isRoot;
}

export function canDeleteZone(zone: Zone): boolean {
  return !zone.isRoot;
}

/**
 * root 的 `injectOwnerProfile` 恒为开（关闭请求会被主进程忽略）→ 开关置灰。
 * root 的群消息旁听同样不给关的理由：root 只含桌面对话，没有"群"可旁听。
 */
export function isZoneConfigLocked(zone: Zone, key: "observeGroupMessages" | "injectOwnerProfile"): boolean {
  return zone.isRoot && key === "injectOwnerProfile";
}
