import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { IncomingMessage, OutgoingMessage } from "../../types";

// 每次运行独立的 userData：channels/history/*.jsonl 直接落在它下面，
// 用共享的系统 TEMP 会让 history 断言跨测试运行累积，无法做精确计数。
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "cyrene-napcat-ud-"));

const mockedSettings = vi.hoisted(() => ({
  wechat: { enabled: false },
  feishu: { enabled: false },
  qq: {
    enabled: true,
    listenMode: "loopback" as const,
    port: 0,
    allowedGroupIds: ["2000", "2001"],
    groupRequireMention: true as const,
    groupReplyStyle: "reply-and-mention" as const,
    groupMemoryPolicy: "shared-personal" as const,
  },
  inboundPort: 0,
  sharedSecret: "",
  rateLimitPerUser: 10,
  rateLimitPerChannel: 100,
  ttsEnabled: false,
  stickerEnabled: false,
  toolSandbox: "all" as const,
  toolAccess: {
    groupMemberGate: true,
    toolGate: true,
    entries: [
      {
        channel: "qq" as const,
        userId: "1000",
        addedAt: 1,
        permissions: { private: true, group: true, tool: false },
      },
    ],
  },
  keywords: { intercept: [] as string[], trigger: [] as string[] },
  audit: { recordSuccessTurns: false },
}));

vi.mock("electron", () => ({
  app: { getPath: () => userDataDir },
}));

vi.mock("../../settings-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../settings-store")>();
  return { ...actual, loadChannelsSettings: () => mockedSettings };
});

import { NapCatAdapter } from "./napcat-adapter";
import { makeSessionId } from "../../channel-context";
import { loadRecentHistory } from "../../history-log";
import { corpusDir, corpusStats, type GroupCorpusEntry } from "../../../corpus/group-corpus";

const sockets: WebSocket[] = [];
const adapters: NapCatAdapter[] = [];

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.terminate();
  for (const adapter of adapters.splice(0)) await adapter.stop();
});

afterAll(() => {
  fs.rmSync(userDataDir, { recursive: true, force: true });
});

async function waitFor(predicate: () => boolean, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("timed out waiting for fake NapCat flow");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe("NapCatAdapter fake reverse WebSocket integration", () => {
  it("handshakes, filters events, deduplicates, and sends private/group replies", async () => {
    const adapter = new NapCatAdapter();
    adapters.push(adapter);
    await adapter.start();
    const url = String(adapter.getConnectionInfo().listenUrl);
    const socket = new WebSocket(url, { headers: { "X-Self-ID": "9000" } });
    sockets.push(socket);
    const actions: Array<{ action: string; params: Record<string, unknown>; echo: string }> = [];

    socket.on("message", (raw) => {
      const request = JSON.parse(raw.toString()) as { action: string; params: Record<string, unknown>; echo: string };
      actions.push(request);
      const data = request.action === "get_login_info"
        ? { user_id: "9000", nickname: "昔涟测试号" }
        : request.action === "get_version_info"
          ? { app_name: "NapCat", app_version: "4.8.115", protocol_version: "v11" }
          : request.action === "get_status"
            ? { online: true, good: true }
          : { message_id: `sent-${actions.length}` };
      socket.send(JSON.stringify({ status: "ok", retcode: 0, data, echo: request.echo }));
    });
    await new Promise<void>((resolve, reject) => {
      socket.once("open", resolve);
      socket.once("error", reject);
    });
    await waitFor(() => adapter.getStatus().phase === "running");
    expect(adapter.getConnectionInfo()).toMatchObject({
      selfId: "9000",
      nickname: "昔涟测试号",
      appVersion: "4.8.115",
      supportsStream: true,
    });
    await expect(adapter.testConnection()).resolves.toMatchObject({
      ok: true,
      detail: { selfId: "9000", nickname: "昔涟测试号", appVersion: "4.8.115", supportsStream: true },
    });

    const incoming: IncomingMessage[] = [];
    adapter.onMessage = async (message) => {
      incoming.push(message);
      const outgoing: OutgoingMessage = {
        channel: "qq",
        chatType: message.chatType,
        targetId: message.chatId,
        replyContext: message.chatType === "group"
          ? { messageId: message.messageId!, mentionUserId: message.senderId }
          : undefined,
        parts: message.chatType === "group"
          ? [{ kind: "text", text: `收到：${message.text}` }, { kind: "text", text: "第二段" }]
          : [{ kind: "text", text: `收到：${message.text}` }],
      };
      await adapter.send(outgoing);
      return outgoing;
    };

    const groupEvent = {
      time: 1_700_000_000,
      self_id: "9000",
      post_type: "message",
      message_type: "group",
      message_id: "group-1",
      user_id: "1000",
      group_id: "2000",
      sender: { user_id: "1000", card: "群成员" },
      message: [
        { type: "at", data: { qq: "9000" } },
        { type: "text", data: { text: "你好" } },
      ],
    };
    socket.send(JSON.stringify(groupEvent));
    await waitFor(() => actions.filter((item) => item.action === "send_group_msg").length === 2);
    const groupSends = actions.filter((item) => item.action === "send_group_msg");
    const groupSend = groupSends[0];
    expect(groupSend.params.group_id).toBe("2000");
    expect(groupSend.params.message).toEqual([
      { type: "reply", data: { id: "group-1" } },
      { type: "at", data: { qq: "1000" } },
      { type: "text", data: { text: " " } },
      { type: "text", data: { text: "收到：你好" } },
    ]);
    expect(groupSends[1].params.message).toEqual([{ type: "text", data: { text: "第二段" } }]);

    socket.send(JSON.stringify(groupEvent));
    socket.send(JSON.stringify({ ...groupEvent, message_id: "group-no-at", message: [{ type: "text", data: { text: "不应回复" } }] }));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(actions.filter((item) => item.action === "send_group_msg")).toHaveLength(2);

    // 旁听（observe）：白名单群里未 @ 昔涟的消息不回复，但必须落进群 transcript，
    // 否则下一条 @ 昔涟的消息看不到"上一条在说什么"。
    const fresh = loadRecentHistory(makeSessionId("qq", "2000"), 50).filter(
      (entry) => entry.content === "不应回复" && entry.speakerId === "1000",
    );
    expect(fresh).toHaveLength(1);
    expect(fresh[0]).toMatchObject({
      role: "user",
      speakerId: "1000",
      speakerName: "群成员",
      isBot: false,
      triggered: false,
    });

    // 未加白的群既不回复也不旁听。
    const blockedSession = makeSessionId("qq", "9999");
    socket.send(JSON.stringify({
      ...groupEvent,
      message_id: "group-not-allowed",
      group_id: "9999",
      message: [{ type: "text", data: { text: "未加白群的闲聊" } }],
    }));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(loadRecentHistory(blockedSession, 50).map((entry) => entry.content))
      .not.toContain("未加白群的闲聊");

    socket.send(JSON.stringify({
      ...groupEvent,
      message_type: "private",
      message_id: "private-1",
      group_id: undefined,
      message: [{ type: "text", data: { text: "私聊" } }],
    }));
    await waitFor(() => actions.some((item) => item.action === "send_private_msg"));
    expect(actions.find((item) => item.action === "send_private_msg")?.params).toMatchObject({
      user_id: "1000",
      message: [{ type: "text", data: { text: "收到：私聊" } }],
    });

    socket.send(JSON.stringify({
      ...groupEvent,
      message_type: "private",
      message_id: "private-denied",
      user_id: "1001",
      group_id: undefined,
      message: [{ type: "text", data: { text: "不在白名单" } }],
    }));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(incoming).toHaveLength(2);

    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const handedOff: string[] = [];
    adapter.onMessage = async (message) => {
      handedOff.push(message.messageId!);
      if (message.messageId === "handoff-1") await firstGate;
      return null;
    };
    socket.send(JSON.stringify({ ...groupEvent, message_id: "handoff-1" }));
    socket.send(JSON.stringify({ ...groupEvent, message_id: "handoff-2" }));
    await waitFor(() => handedOff.length === 2);
    expect(handedOff).toEqual(["handoff-1", "handoff-2"]);
    releaseFirst();

    // ── 语料（旁路采集）最终断言 ──────────────────────────────
    // 与 transcript 的关键区别：未加白群的闲聊也采（将来加白名单时历史已经在攒）、
    // 私聊也采；transcript 只记白名单会话。
    // 按键 = kind + id —— 群号与 QQ 号同为数字，必须靠 kind 区分。
    const corpusOf = (kind: "group" | "private", id: string): GroupCorpusEntry[] => {
      const stat = corpusStats().find((item) => item.groupId === id && item.kind === kind);
      if (!stat) return [];
      const dir = path.join(corpusDir(), stat.folder);
      return fs.readdirSync(dir)
        .filter((name) => name.endsWith(".jsonl"))
        .sort()
        .flatMap((name) => fs.readFileSync(path.join(dir, name), "utf8")
          .split("\n")
          .filter((line) => line.length > 0)
          .map((line) => JSON.parse(line) as GroupCorpusEntry));
    };

    // 白名单群 2000：顺序 = 首次 group-1 / group-no-at / 重投的 group-1（被去重） /
    // handoff-1 / handoff-2。@ 那条记 respond，未 @ 那条记 observe。
    const allowed = corpusOf("group", "2000");
    expect(allowed.map((entry) => entry.msg)).toEqual(["你好", "不应回复", "你好", "你好"]);
    expect(allowed[0]).toMatchObject({
      kind: "group",
      gid: "2000",
      uid: "1000",
      uname: "群成员",
      trig: "respond",
      allowed: true,
    });
    expect(allowed[1]).toMatchObject({ msg: "不应回复", trig: "observe", allowed: true });
    // 去重生效：group-1 投了三次，只落一行
    expect(allowed.filter((entry) => entry.mid === "group-1")).toHaveLength(1);
    expect(allowed.filter((entry) => entry.mid === "handoff-2")).toHaveLength(1);

    // 未加白群 9999：transcript 不收，但语料照收
    expect(corpusOf("group", "9999").map((entry) => entry.msg)).toEqual(["未加白群的闲聊"]);
    expect(corpusOf("group", "9999")[0]).toMatchObject({ allowed: false, trig: "observe" });

    // 私聊：**也采**（目标是收集真人怎么说话，私聊同样是真人语料）。
    // 落在 `<对方QQ号>__private`，与同为数字 id 的群号天然分开。
    // 只采到对方发来的那一半 —— 昔涟自己发的在发送时就以 self_id 过滤掉了。
    expect(corpusOf("private", "1000").map((entry) => entry.msg)).toEqual(["私聊"]);
    expect(corpusOf("private", "1000")[0]).toMatchObject({
      kind: "private",
      gid: "1000",
      trig: "respond",
      allowed: true,
    });

    // 未授权发送者的私聊：权限校验在语料写入之前，所以整条都不进语料。
    // 注意不能用「语料里没有 id=1001」来断言 —— 1001 在群 9999 里发过言，
    // 那条**本来就该**采（未加白群的闲聊也采），所以必须限定 kind。
    expect(corpusOf("private", "1001")).toEqual([]);

    expect(corpusStats().map((item) => `${item.kind}:${item.groupId}`).sort())
      .toEqual(["group:2000", "group:9999", "private:1000"]);
  });
});
