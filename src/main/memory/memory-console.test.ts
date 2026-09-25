/**
 * `memory-console` 单元测试（P3 §2.17 的主进程侧）。
 *
 * 三视图分组、`own` / `mentioned` 的分离（§2.3 在展示侧的落地）、容器删除的解析、
 * 以及溯源（`sourceMessageIds` → transcript 原文）。
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "memory-console-"));

vi.mock("electron", () => ({
  app: { getPath: () => TMP },
}));

import {
  NO_SCOPE_KEY,
  UNATTRIBUTED_KEY,
  deleteMemoryManager,
  listMemoryManager,
  queryMemoryManager,
  traceMemorySource,
} from "./memory-console";
import type { L2Memory } from "./memory-types";
import type { ExternalChannelChat } from "../channels/conversation-binding-store";
import type { ZoneExternalMember } from "../zones/types";
import { transcriptFileBase } from "../channels/history-log";

const ME = "qq:10001";
const OTHER = "qq:10002";
const GROUP = "channel:qq:aaaaaaaaaaaaaaaa";
const MY_PRIVATE = "channel:qq:bbbbbbbbbbbbbbbb";

function memory(overrides: Partial<L2Memory> & { id: string }): L2Memory {
  return {
    content: `content-${overrides.id}`,
    triggerText: `trigger-${overrides.id}`,
    sourceConversationId: GROUP,
    createdAt: 1,
    lastAccessedAt: 1,
    accessCount: 0,
    weight: 0,
    isPinned: false,
    status: "active",
    ...overrides,
  };
}

const memories: L2Memory[] = [
  memory({ id: "m1", speakerIds: [ME], scope: "zone:root" }),
  memory({ id: "m2", speakerIds: [ME], scope: "zone:root" }),
  memory({ id: "k1", speakerIds: [OTHER], subjectIds: [ME], scope: "zone:root" }),
  memory({ id: "o1", speakerIds: [OTHER], scope: `solo:${GROUP}` }),
  memory({ id: "legacy-private", sourceConversationId: MY_PRIVATE, scope: `solo:${MY_PRIVATE}` }),
  memory({ id: "anon", sourceConversationId: "", scope: undefined }),
];

const externalChats: ExternalChannelChat[] = [
  { sessionId: GROUP, channel: "qq", chatId: "543627098", chatType: "group", senderName: "测试群", lastAt: 5 },
  { sessionId: MY_PRIVATE, channel: "qq", chatId: "10001", chatType: "private", senderName: "小明", lastAt: 4 },
];

const zoneMembers: ZoneExternalMember[] = [
  { kind: "external", sessionId: GROUP, channel: "qq", chatId: "543627098", chatType: "group", senderName: "测试群" },
];

function deps(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    memories,
    externalChats,
    zoneMembers,
    userDataDir: TMP,
    deleteCascade: vi.fn(async (ids: readonly string[]) => ({
      requested: ids.length,
      removed: ids.map((id) => memories.find((m) => m.id === id)!).filter(Boolean),
      evidence: ids.length,
      dmaeStates: ids.length,
      conflictLogs: 0,
      danglingRefsFixed: 1,
      reflectionLogs: 0,
      summaries: [],
    })),
    ...overrides,
  };
}

describe("memory-console", () => {
  beforeEach(() => {
    fs.rmSync(path.join(TMP, "channels"), { recursive: true, force: true });
  });

  it("按人视图：own / mentioned 分开给，K 类不计进 own", async () => {
    const { items } = await listMemoryManager("people", deps());
    const mine = items.find((item) => item.key === ME)!;
    expect(mine.label).toBe("小明");
    expect(mine.erasable).toBe(true);
    expect(mine.own).toBe(3); // m1 + m2 + legacy-private（私聊会话里的旧记忆按 R1 兜底）
    expect(mine.mentioned).toBe(1); // k1
    expect(mine.total).toBe(4);
    expect(mine.sessions).toBe(2);

    const other = items.find((item) => item.key === OTHER)!;
    expect(other.own).toBe(2); // o1 + k1（他说的）
    expect(other.mentioned).toBe(0);

    // 无归属记忆单独一行，且不可擦除
    const unattributed = items.find((item) => item.key === UNATTRIBUTED_KEY)!;
    expect(unattributed.total).toBe(1);
    expect(unattributed.erasable).toBe(false);
  });

  it("按人视图：有私聊会话但 0 条记忆的人也列出来（否则「重置一个只聊过几句的人」无从下手）", async () => {
    const chats: ExternalChannelChat[] = [
      ...externalChats,
      { sessionId: "channel:qq:dddddddddddddddd", channel: "qq", chatId: "10009", chatType: "private", senderName: "只聊过几句的人", lastAt: 1 },
    ];
    const { items } = await listMemoryManager("people", deps({ externalChats: chats }));
    const item = items.find((entry) => entry.key === "qq:10009")!;
    expect(item).toBeTruthy();
    expect(item.label).toBe("只聊过几句的人");
    expect(item.total).toBe(0);
    expect(item.erasable).toBe(true);
  });

  it("按人查询：meta 里给 personKey，两组记忆都返回且分组判据与删除判据同源", async () => {
    const result = await queryMemoryManager("people", ME, deps());
    expect(result.meta.personKey).toBe(ME);
    expect(result.meta.own).toBe(3);
    expect(result.meta.mentioned).toBe(1);
    expect(result.memories.map((m) => m.id).sort()).toEqual(["k1", "legacy-private", "m1", "m2"]);
    expect(result.meta.sessions.length).toBe(2);
    // 每条都带归属字段，否则渲染侧无法分组
    expect(result.memories.every((m) => "speakerIds" in m && "subjectIds" in m)).toBe(true);
  });

  it("按域视图 + 查询：含无 scope 的 legacy 组", async () => {
    const { items } = await listMemoryManager("zones", deps());
    const root = items.find((item) => item.key === "zone:root")!;
    expect(root.label).toBe("桌面（root 区块）");
    expect(root.total).toBe(3);

    const solo = items.find((item) => item.key === `solo:${MY_PRIVATE}`)!;
    expect(solo.label).toContain("小明");

    const noScope = items.find((item) => item.key === NO_SCOPE_KEY)!;
    expect(noScope.total).toBe(1);

    const queried = await queryMemoryManager("zones", "zone:root", deps());
    expect(queried.meta.total).toBe(3);
  });

  it("按会话视图 + 查询", async () => {
    const { items } = await listMemoryManager("sessions", deps());
    expect(items.find((item) => item.key === GROUP)!.total).toBe(4);
    expect(items.find((item) => item.key === MY_PRIVATE)!.total).toBe(1);
    expect(items.find((item) => item.key === UNATTRIBUTED_KEY)!.total).toBe(1);

    const queried = await queryMemoryManager("sessions", MY_PRIVATE, deps());
    expect(queried.memories.map((m) => m.id)).toEqual(["legacy-private"]);
  });

  it("删除：显式 ids 走唯一入口 deleteL2Cascade", async () => {
    const d = deps();
    const result = await deleteMemoryManager({ ids: ["m1", "m2"] }, d);
    expect(d.deleteCascade).toHaveBeenCalledWith(["m1", "m2"]);
    expect(result.requested).toBe(2);
    expect(result.removed).toBe(2);
    expect(result.danglingRefsFixed).toBe(1);
  });

  it("删除：按人容器只删「他的记忆」，**不碰「别人提到他」**（D4）", async () => {
    const d = deps();
    await deleteMemoryManager({ view: "people", key: ME }, d);
    const ids = (d.deleteCascade as ReturnType<typeof vi.fn>).mock.calls[0][0] as string[];
    expect(ids.sort()).toEqual(["legacy-private", "m1", "m2"]);
    expect(ids).not.toContain("k1");
  });

  it("删除：按域容器删除该域全部条目", async () => {
    const d = deps();
    await deleteMemoryManager({ view: "zones", key: `solo:${MY_PRIVATE}` }, d);
    const ids = (d.deleteCascade as ReturnType<typeof vi.fn>).mock.calls[0][0] as string[];
    expect(ids).toEqual(["legacy-private"]);
  });

  it("删除：没有可删的东西时不落盘、返回全 0", async () => {
    const d = deps();
    const result = await deleteMemoryManager({ view: "sessions", key: "不存在" }, d);
    expect(d.deleteCascade).not.toHaveBeenCalled();
    expect(result).toEqual({
      requested: 0, removed: 0, evidence: 0, dmaeStates: 0,
      conflictLogs: 0, danglingRefsFixed: 0, reflectionLogs: 0, summariesRemoved: 0,
      vectors: 0,
    });
  });

  // ── 向量：deleteL2Cascade 有意不删，调用方必须补（P3 §1.2 / §5.2 第 2 步）──
  //
  // 这条曾经真的漏了：控制台删除只删了 store 侧（l2/evidence/dmae/冲突日志/悬空指针），
  // 向量留在 `rag-data/memory-store.json` 里 —— 语义召回仍能命中一条已不存在的记忆，
  // 且要等下次启动对账才回收。§5.2 第 2 步的验收点就是"该条 ragId 0 命中"。

  it("删除：级联之后把被删条目的 ragId 交给删向量（否则向量成孤儿）", async () => {
    const withRag = [
      memory({ id: "r1", ragId: "rag_1", speakerIds: [ME], scope: "zone:root" }),
      memory({ id: "r2", ragId: "rag_2", speakerIds: [ME], scope: "zone:root" }),
    ];
    const deleteVectors = vi.fn(() => 2);
    const d = deps({
      memories: withRag,
      deleteVectors,
      deleteCascade: vi.fn(async (ids: readonly string[]) => {
        const removed = withRag.filter((m) => ids.includes(m.id));
        return {
          requested: ids.length,
          removed,
          evidence: removed.length,
          dmaeStates: removed.length,
          conflictLogs: 0,
          danglingRefsFixed: 0,
          reflectionLogs: 0,
          summaries: [],
        };
      }),
    });

    const result = await deleteMemoryManager({ ids: ["r1", "r2"] }, d);

    expect(deleteVectors).toHaveBeenCalledWith(["rag_1", "rag_2"]);
    expect(result.vectors).toBe(2);
  });

  it("删除：ragId 为空时不调用删向量（不拿空数组/undefined 去打向量库）", async () => {
    const deleteVectors = vi.fn(() => 0);
    const d = deps({ deleteVectors });
    await deleteMemoryManager({ ids: ["m1"] }, d); // 这条 fixture 没有 ragId
    expect(deleteVectors).not.toHaveBeenCalled();
  });

  it("删除：没有任何可删条目时也不调用删向量", async () => {
    const deleteVectors = vi.fn(() => 0);
    const d = deps({ deleteVectors });
    await deleteMemoryManager({ view: "sessions", key: "不存在" }, d);
    expect(deleteVectors).not.toHaveBeenCalled();
  });

  it("删除：删向量失败不致命，store 侧的删除结果照常返回", async () => {
    const withRag = [memory({ id: "r1", ragId: "rag_1", speakerIds: [ME], scope: "zone:root" })];
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const d = deps({
      memories: withRag,
      deleteVectors: vi.fn(() => {
        throw new Error("vector store down");
      }),
      deleteCascade: vi.fn(async (ids: readonly string[]) => ({
        requested: ids.length,
        removed: withRag,
        evidence: 1,
        dmaeStates: 1,
        conflictLogs: 0,
        danglingRefsFixed: 0,
        reflectionLogs: 0,
        summaries: [],
      })),
    });

    const result = await deleteMemoryManager({ ids: ["r1"] }, d);

    expect(result.removed).toBe(1);
    expect(result.vectors).toBe(0);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("溯源：按 sourceMessageIds 取回 transcript 那几行 + 前后各 2 行", async () => {
    const lines = [
      { id: "msg_1", role: "user", content: "第一句", at: "2026-09-20T10:00:00.000Z", speakerId: "10002", speakerName: "小红" },
      { id: "msg_2", role: "assistant", content: "第二句", at: "2026-09-20T10:00:01.000Z" },
      { id: "msg_3", role: "user", content: "原话在这", at: "2026-09-20T10:00:02.000Z", speakerId: "10002", speakerName: "小红" },
      { id: "msg_4", role: "user", content: "第四句", at: "2026-09-20T10:00:03.000Z", speakerId: "10001", speakerName: "小明" },
      { id: "msg_5", role: "user", content: "第五句", at: "2026-09-20T10:00:04.000Z" },
      { id: "msg_6", role: "user", content: "第六句", at: "2026-09-20T10:00:05.000Z" },
    ];
    const file = path.join(TMP, "channels", "history", `${transcriptFileBase(GROUP)}.jsonl`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, lines.map((line) => JSON.stringify(line)).join("\n") + "\n", "utf8");

    const target = memory({ id: "traced", speakerIds: [ME], sourceMessageIds: ["msg_3"] });
    const result = await traceMemorySource("traced", deps({ memories: [...memories, target] }));

    expect(result.missing).toBe(false);
    expect(result.entries.map((entry) => entry.content)).toEqual(["第一句", "第二句", "原话在这", "第四句", "第五句"]);
    expect(result.entries[2].speakerName).toBe("小红");
  });

  it("溯源：没有 sourceMessageIds 或找不到对应行时 missing=true（UI 显示「来源不可用」）", async () => {
    const noIds = memory({ id: "no-ids" });
    const withMissingId = memory({ id: "gone", sourceMessageIds: ["msg_not_exist"] });
    const d = deps({ memories: [...memories, noIds, withMissingId] });

    expect((await traceMemorySource("no-ids", d)).missing).toBe(true);
    expect((await traceMemorySource("gone", d)).missing).toBe(true);
    expect((await traceMemorySource("查无此记忆", d)).missing).toBe(true);
  });
});
