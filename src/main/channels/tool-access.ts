// channels/tool-access —— 外部渠道「白名单与权限」的配置模型与判定逻辑。
//
// 背景：QQ 群聊不再被强制降级为纯 Chat（见 agent-policy.ts）。渠道属于半公开场景，
// 所以「模型能看到工具」与「这个用户能不能真的调用工具 / 能不能让昔涟说话」
// 被拆成两层：
//   1. 全局「工具权限」开关（channels-settings.toolSandbox）决定这一轮是否暴露工具；
//   2. 本模块的「白名单与权限」既是消息准入名单（私聊 / 群聊），
//      也是工具调用的执行层名单，由两个总开关决定是否启用校验。
//
// 权限模型（勾选 = 授权 = 放行）：
//   - private：是否放行该账号的私聊消息（无总开关，始终按权限校验）
//   - group  ：是否放行该账号的群聊消息（受 groupMemberGate 总开关控制）
//   - tool   ：是否允许该账号调用工具（受 toolGate 总开关控制，私聊群聊通用）
//
// 纯函数，无 electron / fs 依赖，便于单测。
import type { ChannelChatType, ChannelId } from "./types";

/** 单条白名单记录的权限位。 */
export interface ChannelAccessPermissions {
  /** 私聊消息放行 */
  private: boolean;
  /** 群聊消息放行 */
  group: boolean;
  /** 工具调用放行 */
  tool: boolean;
}

/** 新增条目的默认权限：默认只获得群聊响应权限。 */
export const DEFAULT_ACCESS_PERMISSIONS: ChannelAccessPermissions = {
  private: false,
  group: true,
  tool: false,
};

/** 白名单条目：某渠道下的某个账号（QQ 号 / openid / 微信 id）及其权限。 */
export interface ChannelAccessEntry {
  channel: ChannelId;
  /** QQ 号（NapCat）或 openid（官方机器人）/ 微信用户标识 */
  userId: string;
  /** 可选备注，便于在控制台里认出是谁 */
  label?: string;
  /** 加入时间（epoch ms） */
  addedAt: number;
  permissions: ChannelAccessPermissions;
}

export interface ChannelToolAccessConfig {
  /** 群员发言限制：开 = 群聊按「群聊」权限校验；关 = 群聊不校验成员 */
  groupMemberGate: boolean;
  /** 工具调用拦截：开 = 工具调用按「工具」权限校验（私聊 + 群聊） */
  toolGate: boolean;
  entries: ChannelAccessEntry[];
}

export const DEFAULT_TOOL_ACCESS: ChannelToolAccessConfig = {
  // 两个总开关默认全开：拒绝优先，只有名单里勾了对应权限的账号才放行。
  groupMemberGate: true,
  toolGate: true,
  entries: [],
};

export interface ChannelAccessContext {
  channel: ChannelId;
  chatType: ChannelChatType;
  senderId: string;
}

export interface ChannelAccessDecision {
  /** 是否处于校验范围（false = 该模式下不检查，直接放行） */
  guarded: boolean;
  /** 是否拦截本次请求（guarded && 未命中白名单 / 未授予权限） */
  blocked: boolean;
  /** 拦截原因（blocked 时有值） */
  reason?: string;
  /** 命中的白名单条目 */
  entry?: ChannelAccessEntry;
  /** 命中的权限位（entry 存在时有值） */
  permissions?: ChannelAccessPermissions;
}

const CHANNEL_IDS: readonly ChannelId[] = ["wechat", "feishu", "qq", "qqbot"];

function isChannelId(value: unknown): value is ChannelId {
  return typeof value === "string" && (CHANNEL_IDS as readonly string[]).includes(value);
}

/** 归一化权限位：非法字段回落到默认值（默认只给群聊）。 */
export function normalizeAccessPermissions(input: unknown): ChannelAccessPermissions {
  const raw = (input ?? {}) as Partial<ChannelAccessPermissions>;
  const pick = (value: unknown, fallback: boolean): boolean =>
    typeof value === "boolean" ? value : fallback;
  return {
    private: pick(raw.private, DEFAULT_ACCESS_PERMISSIONS.private),
    group: pick(raw.group, DEFAULT_ACCESS_PERMISSIONS.group),
    tool: pick(raw.tool, DEFAULT_ACCESS_PERMISSIONS.tool),
  };
}

/**
 * 归一化白名单配置：丢弃非法条目、去掉首尾空白、按 (channel,userId) 去重，
 * 并给缺失权限位的条目补上默认权限。
 *
 * 注意：调用方若判定配置来自旧版本 schema，应当传 undefined 触发「清空」，
 * 见 settings-store 的 schemaVersion 迁移。
 */
export function normalizeToolAccessConfig(input: unknown): ChannelToolAccessConfig {
  const raw = (input ?? {}) as Partial<ChannelToolAccessConfig>;
  const pickGate = (value: unknown, fallback: boolean): boolean =>
    typeof value === "boolean" ? value : fallback;
  const seen = new Set<string>();
  const entries: ChannelAccessEntry[] = [];
  if (Array.isArray(raw.entries)) {
    for (const item of raw.entries) {
      const candidate = (item ?? {}) as Partial<ChannelAccessEntry>;
      const channel = candidate.channel;
      const userId = typeof candidate.userId === "string" ? candidate.userId.trim() : "";
      if (!isChannelId(channel) || !userId) continue;
      const key = `${channel}:${userId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const label = typeof candidate.label === "string" && candidate.label.trim()
        ? candidate.label.trim()
        : undefined;
      entries.push({
        channel,
        userId,
        ...(label ? { label } : {}),
        addedAt: Number.isFinite(candidate.addedAt) ? Number(candidate.addedAt) : Date.now(),
        permissions: normalizeAccessPermissions(candidate.permissions),
      });
    }
  }
  return {
    groupMemberGate: pickGate(raw.groupMemberGate, DEFAULT_TOOL_ACCESS.groupMemberGate),
    toolGate: pickGate(raw.toolGate, DEFAULT_TOOL_ACCESS.toolGate),
    entries,
  };
}

export function findAccessEntry(
  entries: readonly ChannelAccessEntry[],
  context: Pick<ChannelAccessContext, "channel" | "senderId">,
): ChannelAccessEntry | undefined {
  return entries.find((entry) => entry.channel === context.channel && entry.userId === context.senderId);
}

function chatLabel(chatType: ChannelChatType): string {
  return chatType === "group" ? "群聊" : "私聊";
}

function messagePermission(chatType: ChannelChatType): "private" | "group" {
  return chatType === "group" ? "group" : "private";
}

/**
 * 判定一条消息是否放行。
 * 私聊始终校验「私聊」权限；群聊只有在 groupMemberGate 打开时才校验「群聊」权限。
 */
export function resolveChannelMessageAccess(
  config: ChannelToolAccessConfig,
  context: ChannelAccessContext,
): ChannelAccessDecision {
  if (context.chatType === "group" && !config.groupMemberGate) {
    return { guarded: false, blocked: false };
  }
  const label = chatLabel(context.chatType);
  const entry = findAccessEntry(config.entries, context);
  if (!entry) {
    return {
      guarded: true,
      blocked: true,
      reason: `${context.channel} ${label}用户 ${context.senderId} 不在白名单中`,
    };
  }
  const key = messagePermission(context.chatType);
  if (!entry.permissions[key]) {
    return {
      guarded: true,
      blocked: true,
      entry,
      permissions: entry.permissions,
      reason: `${context.channel} ${label}用户 ${context.senderId} 未授予${key === "group" ? "群聊" : "私聊"}权限`,
    };
  }
  return { guarded: true, blocked: false, entry, permissions: entry.permissions };
}

/**
 * 判定一次工具调用是否放行。
 * toolGate 关闭时不做任何检查（记录里 allowlisted = null）；
 * 注意：只做判定，不记账——记账由 tool-guard 统一负责。
 */
export function resolveChannelToolAccess(
  config: ChannelToolAccessConfig,
  context: ChannelAccessContext,
): ChannelAccessDecision {
  if (!config.toolGate) {
    return { guarded: false, blocked: false };
  }
  const label = chatLabel(context.chatType);
  const entry = findAccessEntry(config.entries, context);
  if (!entry) {
    return {
      guarded: true,
      blocked: true,
      reason: `${context.channel} ${label}用户 ${context.senderId} 不在白名单中`,
    };
  }
  if (!entry.permissions.tool) {
    return {
      guarded: true,
      blocked: true,
      entry,
      permissions: entry.permissions,
      reason: `${context.channel} ${label}用户 ${context.senderId} 未授予工具权限`,
    };
  }
  return { guarded: true, blocked: false, entry, permissions: entry.permissions };
}
