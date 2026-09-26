import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChannelConversationBindingStore } from "./conversation-binding-store";

vi.mock("node:fs", async (importOriginal) => ({
  ...await importOriginal<typeof import("node:fs")>(),
}));

describe("ChannelConversationBindingStore", () => {
  let root: string;
  let filePath: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "cyrene-channel-bindings-"));
    filePath = path.join(root, "context-bindings.json");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("coalesces timestamp writes while keeping the live list current", () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(10_000);
    const store = new ChannelConversationBindingStore(filePath);
    const chat = { sessionId: "channel:qq:a", channel: "qq" as const,
      chatId: "a", chatType: "private" as const, lastAt: 100 };
    const writes = vi.spyOn(fs, "renameSync");
    store.observe(chat);
    for (let i = 1; i <= 100; i++) {
      clock.mockReturnValue(10_000 + i * 10);
      store.observe({ ...chat, lastAt: 100 + i });
    }
    expect(store.list().externalChats[0].lastAt).toBe(200);
    expect(writes).toHaveBeenCalledTimes(1);
    expect(new ChannelConversationBindingStore(filePath).list().externalChats[0].lastAt).toBe(100);
    clock.mockReturnValue(15_000);
    store.observe({ ...chat, lastAt: 300 });
    expect(writes).toHaveBeenCalledTimes(2);
    expect(new ChannelConversationBindingStore(filePath).list().externalChats[0].lastAt).toBe(300);
  });

  it("flushes pending timestamps and keeps metadata changes immediately durable", () => {
    vi.spyOn(Date, "now").mockReturnValue(10_000);
    const store = new ChannelConversationBindingStore(filePath);
    const chat = { sessionId: "channel:qq:a", channel: "qq" as const,
      chatId: "a", chatType: "private" as const, lastAt: 100 };
    store.observe(chat);
    store.observe({ ...chat, lastAt: 200 });
    store.flush();
    expect(new ChannelConversationBindingStore(filePath).list().externalChats[0].lastAt).toBe(200);
    const writes = vi.spyOn(fs, "renameSync");
    store.flush();
    expect(writes).not.toHaveBeenCalled();
    store.observe({ ...chat, lastAt: 300 });
    // 纯时间戳变化会被合并（间隔内不落盘），需要 flush 才可见
    store.flush();
    expect(new ChannelConversationBindingStore(filePath).list().externalChats[0].lastAt).toBe(300);
    // 元数据变更（昵称）立即落盘，无需 flush
    store.observe({ ...chat, senderName: "new name", lastAt: 400 });
    expect(new ChannelConversationBindingStore(filePath).list().externalChats[0].senderName).toBe("new name");
  });

  it("persists on clock rollback and retains a failed flush for retry", () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(10_000);
    const store = new ChannelConversationBindingStore(filePath);
    const chat = { sessionId: "channel:qq:a", channel: "qq" as const,
      chatId: "a", chatType: "private" as const, lastAt: 100 };
    store.observe(chat);
    clock.mockReturnValue(9_000);
    store.observe({ ...chat, lastAt: 200 });
    expect(new ChannelConversationBindingStore(filePath).list().externalChats[0].lastAt).toBe(200);
    store.observe({ ...chat, lastAt: 300 });
    vi.spyOn(fs, "renameSync").mockImplementationOnce(() => { throw new Error("disk unavailable"); });
    expect(() => store.flush()).toThrow("disk unavailable");
    store.flush();
    expect(new ChannelConversationBindingStore(filePath).list().externalChats[0].lastAt).toBe(300);
  });

  it("treats malformed persisted data as empty", () => {
    fs.writeFileSync(filePath, "{not json", "utf8");

    const store = new ChannelConversationBindingStore(filePath);

    expect(store.list()).toEqual({ externalChats: [] });
  });

  it("ignores the legacy bindings key left over from the removed mirror feature", () => {
    // 旧版本会把"渠道会话 ↔ 桌面对话"的镜像绑定写在同一个文件里。
    // 该功能已删除：旧文件必须能正常加载（忽略多出来的 key），而不是被判成脏数据清空。
    fs.writeFileSync(filePath, JSON.stringify({
      version: 1,
      externalChats: [
        { sessionId: "channel:qq:legacy", channel: "qq", chatId: "10001", chatType: "private", lastAt: 100 },
      ],
      bindings: [{ sessionId: "channel:qq:legacy", conversationId: "conversation-1", updatedAt: 200 }],
    }), "utf8");

    const store = new ChannelConversationBindingStore(filePath);
    expect(store.list().externalChats.map((chat) => chat.chatId)).toEqual(["10001"]);
    // 下一次落盘会把遗留字段彻底清掉
    store.observe({
      sessionId: "channel:qq:legacy",
      channel: "qq",
      chatId: "10001",
      chatType: "private",
      lastAt: 300,
    });
    store.flush();
    const onDisk = JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<string, unknown>;
    expect(onDisk).not.toHaveProperty("bindings");
    expect(onDisk.version).toBe(1);
  });

  it("keeps only the most recently observed external chats", () => {
    const store = new ChannelConversationBindingStore(filePath, 2);
    store.observe({
      sessionId: "channel:qq:first",
      channel: "qq",
      chatId: "1",
      chatType: "private",
      lastAt: 1,
    });
    store.observe({
      sessionId: "channel:qq:second",
      channel: "qq",
      chatId: "2",
      chatType: "private",
      lastAt: 2,
    });
    store.observe({
      sessionId: "channel:qq:third",
      channel: "qq",
      chatId: "3",
      chatType: "private",
      lastAt: 3,
    });

    expect(store.list().externalChats.map((chat) => chat.chatId)).toEqual(["3", "2"]);
  });

  it("re-reads the display limit on restart and keeps the most recent chats", () => {
    const store = new ChannelConversationBindingStore(filePath, 3);
    for (const [sessionId, chatId, lastAt] of [
      ["channel:qq:a", "a", 1],
      ["channel:qq:b", "b", 2],
      ["channel:qq:c", "c", 3],
    ] as const) {
      store.observe({ sessionId, channel: "qq", chatId, chatType: "private", lastAt });
    }

    // 换一个更小的上限重启：只保留最近活跃的那一条
    const restarted = new ChannelConversationBindingStore(filePath, 1);
    expect(restarted.list().externalChats.map((chat) => chat.chatId)).toEqual(["c"]);
  });

  // —— P3 擦除某人：只忘掉他的私聊会话，其余（尤其群）必须留下并落盘 ——
  //
  // externalChats 是「记忆区块成员选择器」的唯一数据源：群记录被删就等于区块选不出群，
  // 所以 forget 的契约是"只删给定 sessionId，别的一个不动"。
  describe("forget（P3）", () => {
    const privateChat = {
      sessionId: "channel:qq:private-1",
      channel: "qq",
      chatId: "10001",
      chatType: "private" as const,
      senderName: "小明",
      lastAt: 100,
    };
    const groupChat = {
      sessionId: "channel:qq:group-1",
      channel: "qq",
      chatId: "20001",
      chatType: "group" as const,
      senderName: "测试群",
      lastAt: 200,
    };
    const otherPrivate = {
      sessionId: "channel:qq:private-2",
      channel: "qq",
      chatId: "10002",
      chatType: "private" as const,
      senderName: "小红",
      lastAt: 300,
    };

    it("只移除给定 sessionId，群与其他私聊保留并持久化", () => {
      const store = new ChannelConversationBindingStore(filePath);
      store.observe(privateChat);
      store.observe(groupChat);
      store.observe(otherPrivate);

      const removed = store.forget([privateChat.sessionId]);

      expect(removed).toBe(1);
      expect(store.list().externalChats.map((chat) => chat.sessionId).sort())
        .toEqual([groupChat.sessionId, otherPrivate.sessionId].sort());
      // 落盘：新实例（等价于重启）读到的必须完全一致
      const restarted = new ChannelConversationBindingStore(filePath);
      expect(restarted.list().externalChats.map((chat) => chat.sessionId).sort())
        .toEqual([groupChat.sessionId, otherPrivate.sessionId].sort());
      expect(restarted.list().externalChats.map((chat) => chat.chatType).sort()).toEqual(["group", "private"]);
    });

    it("可一次忘掉多个会话；未知 id 返回值不受影响", () => {
      const store = new ChannelConversationBindingStore(filePath);
      store.observe(privateChat);
      store.observe(groupChat);
      store.observe(otherPrivate);

      const removed = store.forget([privateChat.sessionId, otherPrivate.sessionId, "channel:qq:missing"]);

      expect(removed).toBe(2);
      expect(store.list().externalChats.map((chat) => chat.sessionId)).toEqual([groupChat.sessionId]);
    });

    it("无命中时不落盘（不产生无谓写入）", () => {
      const store = new ChannelConversationBindingStore(filePath);
      store.observe(privateChat);
      store.observe(groupChat);
      const writes = vi.spyOn(fs, "renameSync");

      const removed = store.forget(["channel:qq:missing"]);
      const removedEmpty = store.forget([]);

      expect(removed).toBe(0);
      expect(removedEmpty).toBe(0);
      expect(writes).not.toHaveBeenCalled();
      expect(store.list().externalChats).toHaveLength(2);
    });
  });
});
