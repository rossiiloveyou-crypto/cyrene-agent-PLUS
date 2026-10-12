import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { ChatSessionMeta } from "../../../../../shared/chat-types";
import { collectNewlyUnreadSessionIds } from "./session-unread";

function meta(overrides: Partial<ChatSessionMeta> = {}): ChatSessionMeta {
  return {
    id: "session-a",
    title: "会话 A",
    identityId: null,
    createdAt: 1,
    updatedAt: 1,
    messageCount: 2,
    purpose: "chat",
    mode: "work",
    workspaceRoot: null,
    pinned: false,
    ...overrides,
  };
}

/**
 * 覆盖"不守着会话时 agent 回复完成 → 侧栏出现未读小点"的检测语义：
 * 以 messageCount 增加为收到新消息的基准，正在查看的会话不标记。
 */
describe("collectNewlyUnreadSessionIds", () => {
  const emptyViewing = new Set<string>();

  it("不守着的会话消息数增加（agent 回复完成落盘）→ 标记未读", () => {
    const prev = [meta({ id: "a", messageCount: 2 })];
    const next = [meta({ id: "a", messageCount: 3 })];
    expect(collectNewlyUnreadSessionIds(prev, next, emptyViewing)).toEqual(["a"]);
  });

  it("正守着的会话（属于任一模式当前查看）消息数增加 → 不标记", () => {
    const prev = [meta({ id: "a", messageCount: 2 })];
    const next = [meta({ id: "a", messageCount: 3 })];
    expect(collectNewlyUnreadSessionIds(prev, next, new Set(["a"]))).toEqual([]);
  });

  it("只改 updatedAt 的操作（重命名、置顶）→ 不标记", () => {
    const prev = [meta({ id: "a", messageCount: 2, updatedAt: 1, pinned: false })];
    const next = [meta({ id: "a", messageCount: 2, updatedAt: 99, pinned: true, title: "新名字" })];
    expect(collectNewlyUnreadSessionIds(prev, next, emptyViewing)).toEqual([]);
  });

  it("首次出现的会话（前值无基准）→ 不标记，避免新会话/启动加载误报", () => {
    const prev = [meta({ id: "a", messageCount: 2 })];
    const next = [meta({ id: "a", messageCount: 2 }), meta({ id: "b", messageCount: 5 })];
    expect(collectNewlyUnreadSessionIds(prev, next, emptyViewing)).toEqual([]);
  });

  it("会话被删除 → 不标记", () => {
    const prev = [meta({ id: "a", messageCount: 2 }), meta({ id: "b", messageCount: 3 })];
    const next = [meta({ id: "a", messageCount: 3 })];
    expect(collectNewlyUnreadSessionIds(prev, next, emptyViewing)).toEqual(["a"]);
  });

  it("混合场景：只有不守着且消息数增加的会话被标记", () => {
    const prev = [
      meta({ id: "watched", messageCount: 2 }),
      meta({ id: "away-grown", messageCount: 2 }),
      meta({ id: "away-same", messageCount: 2 }),
      meta({ id: "away-shrunk", messageCount: 5 }),
    ];
    const next = [
      meta({ id: "watched", messageCount: 4 }),
      meta({ id: "away-grown", messageCount: 3 }),
      meta({ id: "away-same", messageCount: 2 }),
      meta({ id: "away-shrunk", messageCount: 4 }),
    ];
    expect(collectNewlyUnreadSessionIds(prev, next, new Set(["watched"]))).toEqual(["away-grown"]);
  });
});

/**
 * 集成链路源码断言（与 feedback.test.ts 同风格）：
 * 检测在 ChatPage 生效、切换进入会话清除未读、侧栏两条渲染路径都画圆点。
 */
describe("session unread integration", () => {
  const chatPageSource = fs.readFileSync(
    fileURLToPath(new URL("../pages/ChatPage.tsx", import.meta.url)),
    "utf8",
  );
  const sidebarSource = fs.readFileSync(
    fileURLToPath(new URL("./ConversationSidebar.tsx", import.meta.url)),
    "utf8",
  );

  it("ChatPage 用 messageCount diff 检测未读，且切换进入会话即清除", () => {
    expect(chatPageSource).toContain("collectNewlyUnreadSessionIds(prev, sidebarSessions, viewingIds)");
    // 切进会话视为已读：从集合中删除
    expect(chatPageSource).toMatch(/setUnreadSessionIds[\s\S]*?next\.delete\(sessionId\)/);
    // 侧栏拿到未读集合
    expect(chatPageSource).toContain("unreadSessionIds={unreadSessionIds}");
  });

  it("侧栏两条渲染路径（项目视图行 + 普通对话列表）都渲染未读圆点", () => {
    expect(sidebarSource.match(/cy-session-unread-dot/g)?.length).toBeGreaterThanOrEqual(2);
    expect(sidebarSource).toContain('unread={unreadSessionIds?.has(session.id) ?? false}');
    expect(sidebarSource).toContain("unreadSessionIds?.has(session.id) && <span className=\"cy-session-unread-dot\" />");
  });
});
