// 🔴 静默失效探测器（总蓝图 §8.2 A3 / P6 §四 4.8）
//
// 为什么必须有这个文件：
//   `history-log.test.ts` 直接调 `appendHistory`，**不走 dispatcher**。
//   所以当 dispatcher 因为某次合并而不再写渠道历史时，它【永远不会失败】。
//   群聊旁听（群友没 @ 昔涟时说过的话）是本任务**最危险的失效模式**：
//   文件都在、能编译、全部测试全绿，而"昔涟不知道群里刚聊了什么"。
//   本文件是本仓库里**唯一**能把这条链路钉住的门禁。
//
// 与 history-log.test.ts 的分工（避免写成"镜像实现"）：
//   ① 这里的写入**由真实 dispatcher 的处理路径产生**，不是测试自己调的 appendHistory；
//   ② 断言落在可观察产物上：落盘条目 + `buildGroupContextBlock` 的**渲染结果字符串**；
//   ③ 断言是等值/包含性的（`toContain("[小明]: 你好")`），不是"命中数 ≥ 1"。
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * ⚠️ 必须用 hoisted：`vi.mock` 的工厂在 import 之前执行，
 * 普通 `let` 会因 TDZ 报 "Cannot access before initialization"。
 * 这里用 `mkdtempSync` 造一个**真实目录**，因为本文件刻意使用**真实 history-log**
 * （它只碰文件系统）而不是 mock —— mock 掉它就等于把被测对象换成了桩。
 */
const env = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const nodeFs = require("node:fs") as typeof import("node:fs");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const nodeOs = require("node:os") as typeof import("node:os");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const nodePath = require("node:path") as typeof import("node:path");
  return { userDataDir: nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "cy-p6-groupctx-")) };
});

vi.mock("electron", () => ({
  app: {
    getPath: () => env.userDataDir,
    getAppPath: () => process.cwd(),
    getName: () => "Cyrene",
  },
  safeStorage: { isEncryptionAvailable: () => false },
}));

vi.mock("./message-log", () => ({ appendLog: vi.fn(), reloadLogFromDisk: vi.fn() }));
vi.mock("./audit-events", () => ({
  recordMessageBlocked: vi.fn(),
  recordTurnFailure: vi.fn(),
  recordTurnSuccess: vi.fn(),
}));

import { ChannelDispatcher, type DispatcherDeps } from "./dispatcher";
import { createChannelContext } from "./channel-context";
import { appendHistory, buildGroupContextBlock, loadRecentHistory, migrateHistory } from "./history-log";
import { createKeyedQueue } from "./keyed-queue";
import { createChannelRateLimiter } from "./rate-limiter";
import { createChannelDeliveryService } from "./delivery-service";
import { createOutgoingComposer } from "./outgoing-composer";
import type { ChannelsSettings } from "./settings-store";
import type { IncomingMessage } from "./types";

const HISTORY_DIR = path.join(env.userDataDir, "channels", "history");

function makeManager() {
  return {
    getAdapter: () => ({
      capability: {
        text: true, image: false, audio: false, file: false,
        video: false, markdown: false, card: false, sticker: false,
        maxTextLength: 4000,
      },
      send: vi.fn(async () => ({ ok: true })),
    }),
  } as never;
}

/**
 * 造一个**真实链路**的 dispatcher：
 * context 是真实 `createChannelContext` + 真实 `appendHistory`（写真实磁盘），
 * 只有 journal 是桩（它属 CTA 侧，本探测器不关心）。
 */
function makeRealDispatcher() {
  const journal = {
    appendUser: vi.fn(async (_conversationId: string, input: { id?: string }) => ({ id: input.id ?? "user-1" })),
    appendPresentation: vi.fn(async () => undefined),
    buildModelContext: vi.fn(async () => ({ messages: [], uncertainEffects: [], throughSeq: 0 })),
    createRunSink: vi.fn(() => ({
      appendAssistant: vi.fn(async () => "assistant-1"),
      appendToolResult: vi.fn(async () => undefined),
      closeInterruption: vi.fn(async () => undefined),
      checkpoint: vi.fn(async () => undefined),
    })),
    appendDeliveryReceipt: vi.fn(async () => undefined),
  };
  const deps: DispatcherDeps = {
    queue: createKeyedQueue({ maxPendingPerKey: 20 }),
    limiter: createChannelRateLimiter({ limits: { perUser: 10, perChannel: 100 } }),
    context: createChannelContext({
      // 真实滑窗读取（与 bootstrap 注入的是同一口径）
      loadRecentChannelHistory: (sessionId, limit) =>
        loadRecentHistory(sessionId, limit, { conversationOnly: true }),
      // 🔴 真实写入器：这一行就是"旁听生命线"的注入点
      appendChannelHistory: appendHistory,
      migrateHistory,
    }),
    journal,
    composer: createOutgoingComposer({ resolveStickerImagePath: () => null }),
    delivery: createChannelDeliveryService(makeManager()),
    buildAndRunAgent: vi.fn(async () => ({ text: "收到啦", sticker: null })),
    loadSettings: () => ({
      rateLimitPerUser: 10,
      rateLimitPerChannel: 100,
      ttsEnabled: false,
      stickerEnabled: false,
      keywords: { intercept: [], trigger: [] },
      audit: { recordSuccessTurns: false },
    } as ChannelsSettings),
    loadGeneralSettings: () => ({}),
  };
  return new ChannelDispatcher(deps);
}

function makeIncoming(overrides: Partial<IncomingMessage> = {}): IncomingMessage {
  return {
    channel: "qq",
    chatType: "group",
    senderId: "10001",
    senderName: "小明",
    chatId: "20001",
    text: "你好",
    at: new Date(0),
    ...overrides,
  };
}

/** 把 sessionId 还原成 history-log 的磁盘文件名（它把 `:` 换成 `_`）。 */
function historyFilePath(sessionId: string): string {
  return path.join(HISTORY_DIR, `${sessionId.replace(/:/g, "_")}.jsonl`);
}

function readRawLines(sessionId: string): string[] {
  const file = historyFilePath(sessionId);
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split("\n").filter((line) => line.trim().length > 0);
}

describe("渠道消息 → 渠道历史 → 群聊旁听上下文（静默失效探测器）", () => {
  // 每个用例都从"零历史"起步：本文件用**真实** history-log 写真实磁盘，
  // userDataDir 在整个文件内共享，不清理就会出现跨用例串味
  //（表现为"我明明只写了一行，却有 7 行"这种与被测逻辑无关的红）。
  beforeEach(() => {
    fs.rmSync(HISTORY_DIR, { recursive: true, force: true });
  });

  it("① dispatcher 处理完一条群消息后，channels/history/<sessionId>.jsonl 真的多了一行", async () => {
    const dispatcher = makeRealDispatcher();
    const msg = makeIncoming({ text: "大家好", messageId: "om_group_1" });

    // 处理前：该会话没有任何落盘记录
    const sessionId = (await import("./channel-context")).makeSessionId("qq", "20001");
    expect(readRawLines(sessionId)).toHaveLength(0);

    await dispatcher.handleIncoming(msg);

    // 🔴 核心断言：不是"appendHistory 被调用过"，而是**磁盘上真的多了这一轮**。
    //    这正是"dispatcher 不再写 history"时唯一会亮的灯。
    //    一轮 = user + assistant 两条（助手侧见用例 ④）。
    const lines = readRawLines(sessionId);
    expect(lines).toHaveLength(2);

    const persisted = JSON.parse(lines[0]) as Record<string, unknown>;
    expect(persisted.role).toBe("user");
    // 群聊必须带结构化说话人（history-log 靠它渲染 `[说话人]: 正文`）
    expect(persisted.speakerName).toBe("小明");
    expect(persisted.speakerId).toBe("10001");
    // 🔴 `triggered: true` = 这条**触发了**昔涟 → 属滑动窗口，**不是**旁听条目。
    //    旁听条目（triggered: false）由 adapter 的 writeObservedTranscript 写。
    expect(persisted.triggered).toBe(true);
    // 写入前已剥掉 `[群聊发送者：…]` 前缀（否则渲染会双前缀）
    expect(String(persisted.content)).not.toContain("群聊发送者");
    expect(String(persisted.content)).toContain("大家好");
  });

  it("② 群聊 sessionId 的旁听条目能被 buildGroupContextBlock 渲染成 `[说话人]: 正文`", async () => {
    const dispatcher = makeRealDispatcher();
    const { makeSessionId } = await import("./channel-context");
    const sessionId = makeSessionId("qq", "20001");

    // 先让真实 dispatcher 写一条"被叫起来"的正式轮次
    await dispatcher.handleIncoming(makeIncoming({ text: "大家好", messageId: "om_group_1" }));

    // 旁听条目（没 @ 昔涟的群友发言）在生产里由 napcat-adapter 的
    // writeObservedTranscript 写入；这里直接用它同款的 appendHistory 语义补一条，
    // 因为本探测器的被测对象是**读取端 + 渲染端**的链路是否还活着。
    appendHistory(sessionId, "user", "在聊什么呢", {
      speakerId: "10002",
      speakerName: "小红",
      isBot: false,
      triggered: false,
    });

    // 滑窗（只看正式轮次）只应看到被触发的那条
    const conversation = loadRecentHistory(sessionId, 16, { conversationOnly: true });
    expect(conversation.map((entry) => entry.content)).toContain("大家好");
    expect(conversation.map((entry) => entry.content)).not.toContain("在聊什么呢");

    // 旁听读取端
    const observed = loadRecentHistory(sessionId, 16, { observedOnly: true });
    expect(observed.map((entry) => entry.content)).toEqual(["在聊什么呢"]);

    // 🔴 渲染端：D3 明确要求旁听 A 继续由 buildGroupContextBlock 承担。
    //    断言用**包含性等值**，不用"命中数 ≥ 1" —— 后者在排版回归时仍会通过。
    const block = buildGroupContextBlock(sessionId, 10);
    expect(block).not.toBeNull();
    expect(block).toContain("【群聊近期上下文】");
    expect(block).toContain("[小红]: 在聊什么呢");
    // 正式轮次不得混进旁听块（否则同一批消息注入两遍）
    expect(block).not.toContain("[小明]: 大家好");
  });

  it("③ 私聊不触发群上下文块（旁听只服务群聊）", async () => {
    const dispatcher = makeRealDispatcher();
    const { makeSessionId } = await import("./channel-context");
    // chatType 缺省 → 私聊口径
    const sessionId = makeSessionId("qq", "user-1");

    await dispatcher.handleIncoming(makeIncoming({
      chatType: "private",
      senderId: "user-1",
      senderName: undefined,
      chatId: "user-1",
      text: "在吗",
      messageId: "om_private_1",
    }));

    // 私聊写入照常（滑窗要用），但**不带群聊结构化字段**
    const lines = readRawLines(sessionId);
    expect(lines).toHaveLength(2);
    const persisted = JSON.parse(lines[0]) as Record<string, unknown>;
    expect(persisted.speakerName).toBeUndefined();
    expect(persisted.triggered).toBeUndefined();

    // 🔴 私聊没有任何旁听条目 → 群上下文块必须为 null（不得注入）
    expect(buildGroupContextBlock(sessionId, 10)).toBeNull();
  });

  it("④ 助手侧也落本地历史（滑窗双向写入），否则下一轮看不到自己说过什么", async () => {
    const dispatcher = makeRealDispatcher();
    const { makeSessionId } = await import("./channel-context");
    const sessionId = makeSessionId("qq", "20001");

    await dispatcher.handleIncoming(makeIncoming({ text: "在吗", messageId: "om_group_2" }));

    const lines = readRawLines(sessionId).map((line) => JSON.parse(line) as Record<string, unknown>);
    // 一轮对话 = user + assistant 两条；缺 assistant 会让滑窗里"昔涟的历史回复"永久消失
    expect(lines.map((entry) => entry.role)).toEqual(["user", "assistant"]);
    expect(lines[1].content).toBe("收到啦");
    expect(lines[1].isBot).toBe(true);
  });
});
