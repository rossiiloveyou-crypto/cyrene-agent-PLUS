// 记忆区块（Zones）IPC —— 设置-记忆区块面板的服务端。
//
// 所有校验都在主进程做：渲染进程传来的成员对象一律当作不可信输入清洗后
// 再进 store，避免 UI bug 或恶意页面往 zones.json 里塞垃圾。

import { IPC } from "../../shared/ipc-channels";
import { isManualGroupChannel, normalizeManualGroupChatId, normalizeManualGroupName } from "../../shared/zone-group";
import { createIpcScope, type IpcScope } from "../application/ipc-scope";
import { makeSessionId } from "../channels/channel-context";
import { getChannelConversationBindingStore } from "../channels/conversation-binding-store";
import type { ChannelId } from "../channels/types";
import { listSessions } from "../chats/chats-store";
import { getZoneStore } from "./zone-store";
import type { ZoneExternalMember, ZoneMember } from "./types";

export interface ZonesIpcDependencies {
  /** 传入共享 scope 以便退出时统一注销；缺省时使用独立 scope。 */
  ipc?: IpcScope;
}

export interface ZonesSnapshot {
  zones: ReturnType<ReturnType<typeof getZoneStore>["listZones"]>;
  externalChats: ReturnType<ReturnType<typeof getChannelConversationBindingStore>["list"]>["externalChats"];
  conversations: Array<{ id: string; title: string; mode: string; updatedAt: number }>;
}

export type ZoneMutationResult = { ok: true; zone: unknown } | { ok: false; error: string };

/**
 * 手动加群的结果。
 *
 * `movedFrom` 会在该群原本属于别的区块时给出——加成员=自动从旧区块移出，
 * 不提示的话用户会以为"两个区块都有它"。
 */
export type AddManualGroupResult =
  | { ok: true; zone: unknown; sessionId: string; movedFrom: { zoneId: string; zoneName: string } | null }
  | { ok: false; error: string };

function readRecord(payload: unknown): Record<string, unknown> | null {
  return payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
}

function readString(value: unknown, max = 256): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return null;
  return trimmed;
}

/** 把渲染进程传来的成员对象清洗成可信的 ZoneMember；非法返回 null。 */
export function sanitizeZoneMember(raw: unknown): ZoneMember | null {
  const record = readRecord(raw);
  if (!record) return null;

  if (record.kind === "desktop") {
    const conversationId = readString(record.conversationId, 128);
    return conversationId ? { kind: "desktop", conversationId } : null;
  }

  if (record.kind === "external") {
    const sessionId = readString(record.sessionId, 256);
    const channel = readString(record.channel, 64);
    const chatId = readString(record.chatId, 128);
    const chatType = record.chatType === "group" ? "group" : record.chatType === "private" ? "private" : null;
    if (!sessionId || !channel || !chatId || !chatType) return null;
    if (!sessionId.startsWith("channel:")) return null;
    const senderName = typeof record.senderName === "string" && record.senderName.trim().length > 0
      ? record.senderName.trim().slice(0, 128)
      : undefined;
    return {
      kind: "external",
      sessionId,
      channel,
      chatId,
      chatType,
      ...(senderName ? { senderName } : {}),
    };
  }

  return null;
}

/**
 * 清洗「手动加群」的输入，并推导出该群真实的 sessionId。
 *
 * 关键点：sessionId **必须**用 `makeSessionId(channel, chatId)` 现算，不能由渲染进程
 * 提供。渠道会话 id 是 `channel:<渠道>:<sha256(渠道:chatId) 前 16 位>`，Dispatcher 收到
 * 群消息时也用同一个函数算 —— 只有两边一致，这个群后续发言才会落进同一个记忆域。
 * 顺手也就堵死了渲染进程伪造 sessionId 的可能。
 *
 * @returns 可交给 zone-store 的成员对象；渠道未知 / 群标识格式不合时返回 null。
 */
export function buildManualGroupMember(raw: unknown): ZoneExternalMember | null {
  const record = readRecord(raw);
  if (!record) return null;
  const channel = readString(record.channel, 64);
  if (!channel || !isManualGroupChannel(channel)) return null;
  const chatId = normalizeManualGroupChatId(channel, record.chatId);
  if (!chatId) return null;
  const senderName = normalizeManualGroupName(record.senderName);
  return {
    kind: "external",
    sessionId: makeSessionId(channel as ChannelId, chatId),
    channel,
    chatId,
    chatType: "group",
    ...(senderName ? { senderName } : {}),
  };
}

export function buildZonesSnapshot(): ZonesSnapshot {
  const bindingSnapshot = getChannelConversationBindingStore().list();
  return {
    zones: getZoneStore().listZones(),
    externalChats: bindingSnapshot.externalChats,
    conversations: listSessions().map((session) => ({
      id: session.id,
      title: session.title,
      mode: session.mode ?? "work",
      updatedAt: session.updatedAt,
    })),
  };
}

export function registerZonesIpc(deps: ZonesIpcDependencies = {}): void {
  const ipc = deps.ipc ?? createIpcScope();

  ipc.handle(IPC.ZONES_LIST, () => buildZonesSnapshot());

  ipc.handle(IPC.ZONES_CREATE, (_event, payload: unknown) => {
    const record = readRecord(payload);
    return getZoneStore().createZone({ name: record?.name });
  });

  ipc.handle(IPC.ZONES_RENAME, (_event, payload: unknown) => {
    const record = readRecord(payload);
    const zoneId = readString(record?.zoneId, 128);
    if (!zoneId) return null;
    return getZoneStore().renameZone(zoneId, record?.name);
  });

  ipc.handle(IPC.ZONES_DELETE, (_event, payload: unknown) => {
    const record = readRecord(payload);
    const zoneId = readString(record?.zoneId, 128);
    if (!zoneId) return false;
    return getZoneStore().deleteZone(zoneId);
  });

  ipc.handle(IPC.ZONES_UPDATE_CONFIG, (_event, payload: unknown) => {
    const record = readRecord(payload);
    const zoneId = readString(record?.zoneId, 128);
    if (!zoneId) return null;
    const patch = readRecord(record?.patch) ?? {};
    return getZoneStore().updateZoneConfig(zoneId, {
      observeGroupMessages: typeof patch.observeGroupMessages === "boolean" ? patch.observeGroupMessages : undefined,
      injectOwnerProfile: typeof patch.injectOwnerProfile === "boolean" ? patch.injectOwnerProfile : undefined,
    });
  });

  ipc.handle(IPC.ZONES_ADD_MEMBER, (_event, payload: unknown): ZoneMutationResult => {
    const record = readRecord(payload);
    const zoneId = readString(record?.zoneId, 128);
    const member = sanitizeZoneMember(record?.member);
    if (!zoneId) return { ok: false, error: "区块标识无效" };
    if (!member) return { ok: false, error: "成员信息无效" };
    try {
      const zone = getZoneStore().addExternalMember(zoneId, member);
      if (!zone) return { ok: false, error: "区块不存在" };
      return { ok: true, zone };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipc.handle(IPC.ZONES_ADD_MANUAL_GROUP, (_event, payload: unknown): AddManualGroupResult => {
    const record = readRecord(payload);
    const zoneId = readString(record?.zoneId, 128);
    if (!zoneId) return { ok: false, error: "区块标识无效" };

    const member = buildManualGroupMember(record);
    if (!member) return { ok: false, error: "群标识无效（请检查渠道与群号格式）" };

    // 加成员会自动把它从旧区块移出：先打听到原属区块，好让 UI 把这件事说出来
    const previous = getZoneStore().findZoneBySessionId(member.sessionId);
    const target = getZoneStore().getZone(zoneId);
    if (!target) return { ok: false, error: "区块不存在" };

    try {
      const zone = getZoneStore().addExternalMember(zoneId, member);
      if (!zone) return { ok: false, error: "区块不存在" };
      const movedFrom = previous && previous.zoneId !== zoneId
        ? { zoneId: previous.zoneId, zoneName: previous.isRoot ? "desktop" : previous.zoneName }
        : null;
      return { ok: true, zone, sessionId: member.sessionId, movedFrom };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipc.handle(IPC.ZONES_REMOVE_MEMBER, (_event, payload: unknown): ZoneMutationResult => {
    const record = readRecord(payload);
    const zoneId = readString(record?.zoneId, 128);
    const member = sanitizeZoneMember(record?.member);
    if (!zoneId) return { ok: false, error: "区块标识无效" };
    if (!member) return { ok: false, error: "成员信息无效" };
    const zone = getZoneStore().removeMember(zoneId, member);
    if (!zone) return { ok: false, error: "区块不存在" };
    return { ok: true, zone };
  });

  ipc.handle(IPC.ZONES_MOVE_MEMBERS, (_event, payload: unknown) => {
    const record = readRecord(payload);
    const targetZoneId = readString(record?.targetZoneId, 128);
    const rawMembers = Array.isArray(record?.members) ? record.members : [];
    if (!targetZoneId) return { moved: 0, errors: ["目标区块标识无效"] };
    const members = rawMembers
      .map(sanitizeZoneMember)
      .filter((member): member is ZoneMember => member !== null && member.kind === "external");
    if (members.length === 0) return { moved: 0, errors: ["没有可移动的成员"] };
    return getZoneStore().moveMembers(targetZoneId, members);
  });
}
