import type { ChatSessionMeta } from "../../../../../shared/chat-types";

/**
 * 会话未读检测：对比侧栏列表前后两次快照的 messageCount，
 * 消息数增加且不属于任何模式当前正在查看的会话，视为收到新消息。
 * 首次出现的会话（前值无基准）不标记，避免新会话/启动加载误报；
 * 只改 updatedAt 的操作（重命名、置顶）不标记。
 */
export function collectNewlyUnreadSessionIds(
  prev: readonly ChatSessionMeta[],
  next: readonly ChatSessionMeta[],
  viewingIds: ReadonlySet<string>,
): string[] {
  const prevCounts = new Map(prev.map((session) => [session.id, session.messageCount]));
  const newlyUnread: string[] = [];
  for (const session of next) {
    const before = prevCounts.get(session.id);
    if (before !== undefined && session.messageCount > before && !viewingIds.has(session.id)) {
      newlyUnread.push(session.id);
    }
  }
  return newlyUnread;
}
