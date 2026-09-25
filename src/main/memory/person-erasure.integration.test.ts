/**
 * 端到端擦除测试（P3 §4.5）—— **不需要真实 QQ**。
 *
 * 临时目录里铺真实文件（memory.json / transcript / 归档 / 审计 / 运行日志 / 实体图 /
 * 关系日志 / 外部会话观察 / 记忆备份 / 对账备份 / chat-api.log / 群聊语料），
 * 然后跑真实的 `previewPersonErase` + `executePersonErase`。
 *
 * 桩只有三处：向量库（`deleteVectors` / `addVector`）、LLM 队列（直通）、Obsidian（未绑定）。
 * 其余全是真实现 —— `memoryStore` / `entityGraph` / 审计 / 运行日志 / transcript 都指向临时目录。
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as crypto from "node:crypto";

const electronMock = vi.hoisted(() => ({ userDataDir: "" }));

vi.mock("electron", () => ({
  app: { getPath: () => electronMock.userDataDir },
}));

// ─────────────────────────────────────────────────────────────────────────────
// 常量：三个会话 + 主角
// ─────────────────────────────────────────────────────────────────────────────

const ME = "10001";
const OTHER = "10002";
const MY_KEY = "qq:10001";

const GROUP = "channel:qq:aaaaaaaaaaaaaaaa";
const MY_PRIVATE = "channel:qq:bbbbbbbbbbbbbbbb";
const OTHER_PRIVATE = "channel:qq:cccccccccccccccc";
const QQBOT_GROUP = "channel:qqbot:dddddddddddddddd";
const QQBOT_SAME_ID_GROUP = "channel:qqbot:eeeeeeeeeeeeeeee";
/** 只在 `chat_history` 向量里出现过的会话（transcript 里已经没有他的行）—— D4 的结构性补充用。 */
const VECTOR_ONLY_SESSION = "channel:qq:vectoronly00000000";

/** 一条 ≥24 字的他的发言（关系日志指纹匹配要求前缀足够长）。 */
const MY_LONG_LINE = "我最近在学 Rust 语言，已经能写一点小工具了";

function base(): string {
  return electronMock.userDataDir;
}

function fileBase(sessionId: string): string {
  return sessionId.replace(/[:/\\<>:"|?*]/g, "_");
}

function p(...parts: string[]): string {
  return path.join(base(), ...parts);
}

function writeJsonl(file: string, rows: Array<Record<string, unknown>>): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, rows.map((row) => JSON.stringify(row)).join("\n") + "\n", "utf8");
}

function historyLine(entry: {
  id: string;
  role: "user" | "assistant";
  content: string;
  speakerId?: string;
  speakerName?: string;
  at?: string;
}): Record<string, unknown> {
  return {
    id: entry.id,
    role: entry.role,
    content: entry.content,
    at: entry.at ?? "2026-09-20T10:00:00.000Z",
    ...(entry.speakerId ? { speakerId: entry.speakerId } : {}),
    ...(entry.speakerName ? { speakerName: entry.speakerName } : {}),
    ...(entry.role === "assistant" ? { isBot: true } : {}),
  };
}

/** 语料目录的整树指纹（用于"一个字节都不许变"）。 */
function treeSnapshot(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      const stat = fs.statSync(full);
      out[path.relative(root, full).split(path.sep).join("/")] =
        `${crypto.createHash("sha256").update(fs.readFileSync(full)).digest("hex")}|${stat.mtimeMs}`;
    }
  };
  if (fs.existsSync(root)) walk(root);
  return out;
}

interface Harness {
  memories: Record<string, { id: string }>;
  deps: Record<string, unknown>;
  deleteVectors: ReturnType<typeof vi.fn>;
  addVector: ReturnType<typeof vi.fn>;
  personErasure: typeof import("./person-erasure");
  memoryStore: typeof import("./memory-store").memoryStore;
  corpusSnapshot: Record<string, string>;
}

/**
 * 铺好整套 fixture。**必须在 `vi.resetModules()` 之后调用**，这样 memoryStore /
 * entityGraph / 关系日志都是全新的、指向本次的临时目录。
 */
async function setup(): Promise<Harness> {
  const root = base();

  // ── ① transcript：群（热层 + 归档）、他的私聊、别人的私聊、别的渠道 ──
  writeJsonl(p("channels", "history", `${fileBase(GROUP)}.jsonl`), [
    historyLine({ id: "msg_g1", role: "user", content: MY_LONG_LINE, speakerId: ME, speakerName: "小明" }),
    historyLine({ id: "msg_g2", role: "assistant", content: "Rust 挺好的呀" }),
    historyLine({ id: "msg_g3", role: "user", content: "我最近在准备考试", speakerId: OTHER, speakerName: "小红" }),
  ]);
  writeJsonl(p("channels", "archive", fileBase(GROUP), "2026-09.jsonl"), [
    historyLine({ id: "msg_a1", role: "user", content: "九月的他", speakerId: ME, speakerName: "小明", at: "2026-09-05T10:00:00.000Z" }),
    historyLine({ id: "msg_a2", role: "user", content: "九月的别人", speakerId: OTHER, speakerName: "小红", at: "2026-09-06T10:00:00.000Z" }),
  ]);
  writeJsonl(p("channels", "history", `${fileBase(MY_PRIVATE)}.jsonl`), [
    historyLine({ id: "msg_p1", role: "user", content: "私聊里的话" }),
    historyLine({ id: "msg_p2", role: "assistant", content: "私聊里的回复" }),
  ]);
  writeJsonl(p("channels", "history", `${fileBase(OTHER_PRIVATE)}.jsonl`), [
    historyLine({ id: "msg_o1", role: "user", content: "小红私聊里的话" }),
  ]);
  writeJsonl(p("channels", "history", `${fileBase(QQBOT_SAME_ID_GROUP)}.jsonl`), [
    historyLine({ id: "msg_q1", role: "user", content: "qqbot 渠道里同号的人", speakerId: ME, speakerName: "小明" }),
  ]);
  // O4 的形态：这个会话在 transcript 里**已经没有他的行**了（旧版本擦除留下的孤儿情景），
  // 但她的回复里还提着他 —— 它必须进疑似残留清单，而不是静默留下
  writeJsonl(p("channels", "history", `${fileBase(VECTOR_ONLY_SESSION)}.jsonl`), [
    historyLine({ id: "msg_v1", role: "assistant", content: "小明最近在学 Rust 呢，天天念叨" }),
  ]);

  // ── ② 外部会话观察（区块成员选择器的数据源；也是私聊会话的权威来源）──
  fs.writeFileSync(p("channels", "context-bindings.json"), JSON.stringify({
    version: 1,
    externalChats: [
      { sessionId: GROUP, channel: "qq", chatId: "543627098", chatType: "group", senderName: "测试群", lastAt: 5 },
      { sessionId: MY_PRIVATE, channel: "qq", chatId: ME, chatType: "private", senderName: "小明", lastAt: 4 },
      { sessionId: OTHER_PRIVATE, channel: "qq", chatId: OTHER, chatType: "private", senderName: "小红", lastAt: 3 },
    ],
  }, null, 2), "utf8");

  // ── ③ 审计 / 运行日志 ──
  writeJsonl(p("channels", "audit", "index.jsonl"), [
    { id: "au1", senderId: ME, senderName: "小明", at: "2026-09-20T10:00:00.000Z" },
    { id: "au2", senderId: ME, senderName: "小明", at: "2026-09-20T10:01:00.000Z" },
    { id: "au3", senderId: OTHER, senderName: "小红", at: "2026-09-20T10:02:00.000Z" },
  ]);
  const { auditSenderSlug, auditLogsDir } = await import("../channels/audit-log");
  fs.mkdirSync(auditLogsDir(), { recursive: true });
  fs.writeFileSync(path.join(auditLogsDir(), `20260920-${auditSenderSlug(ME)}-abc.log`), "他的审计正文", "utf8");
  fs.writeFileSync(path.join(auditLogsDir(), `20260920-${auditSenderSlug(OTHER)}-def.log`), "别人的审计正文", "utf8");
  writeJsonl(p("channels", "log.jsonl"), [
    { at: "2026-09-20T10:00:00.000Z", level: "info", senderId: ME, senderName: "小明", text: "他的一行运行日志" },
    { at: "2026-09-20T10:01:00.000Z", level: "info", senderId: OTHER, senderName: "小红", text: "别人的一行运行日志" },
  ]);

  // ── ④ 回退/调试类载体（整份销毁）──
  fs.writeFileSync(p("memory.backup.2026-01-01T00-00-00-000Z.json"), JSON.stringify({ l2: [{ content: "他的旧记忆正文" }] }), "utf8");
  fs.mkdirSync(p("memory-reconcile-backups"), { recursive: true });
  // ⚠️ 目录里放**两个**文件：D3 的两个口径差异只有在"目录里不止一个文件"时才显形
  //（预演递归数文件 = 3，报告若数"目标"就只有 2：1 个文件 + 1 个目录）。
  fs.writeFileSync(p("memory-reconcile-backups", "memory.1.json"), "{}", "utf8");
  fs.writeFileSync(p("memory-reconcile-backups", "memory-store.1.json"), "{}", "utf8");
  fs.writeFileSync(p("chat-api.log"), "====\n完整 prompt 正文（含他的对话）\n", "utf8");

  // ── ④b agent 运行记录（D4）：`cyrene-runs/sessions/*.json` 里是逐字对话正文 ──
  // ⚠️ `index.json` 是**一个 JSON 数组**（不是 jsonl），store 与预演都按数组解析
  fs.mkdirSync(p("cyrene-runs"), { recursive: true });
  fs.writeFileSync(p("cyrene-runs", "index.json"), JSON.stringify([
    { runId: "run_a", conversationId: GROUP, status: "completed", updatedAt: 1 },
    { runId: "run_b", conversationId: MY_PRIVATE, status: "completed", updatedAt: 2 },
    { runId: "run_c", conversationId: OTHER_PRIVATE, status: "completed", updatedAt: 3 },
    // 只在向量里留过痕的会话：transcript 里没有他的行，靠 chat_history 向量指认（D4 结构性补充）
    { runId: "run_d", conversationId: VECTOR_ONLY_SESSION, status: "completed", updatedAt: 4 },
  ]), "utf8");
  fs.rmSync(p("cyrene-runs", "sessions"), { recursive: true, force: true });
  fs.mkdirSync(p("cyrene-runs", "sessions"), { recursive: true });
  for (const [runId, conversationId] of [["run_a", GROUP], ["run_b", MY_PRIVATE], ["run_c", OTHER_PRIVATE], ["run_d", VECTOR_ONLY_SESSION]] as const) {
    fs.writeFileSync(p("cyrene-runs", "sessions", `${runId}.json`), JSON.stringify({
      schemaVersion: 1, conversationId, runId, status: "completed", createdAt: 1, updatedAt: 1,
      messages: [{ role: "user", content: `[小明]: ${MY_LONG_LINE}` }],
    }), "utf8");
    fs.writeFileSync(p("cyrene-runs", "sessions", `${runId}.events.jsonl`), "{\"type\":\"run_created\"}\n", "utf8");
  }
  // 运行产物：**不自动删**，但必须出现在疑似残留清单里
  fs.mkdirSync(p("cyrene-runs", "reviews", "run-1"), { recursive: true });
  fs.writeFileSync(p("cyrene-runs", "reviews", "run-1", "journal.jsonl"),
    JSON.stringify({ type: "capture", note: `看了他的私聊 ${ME}` }) + "\n", "utf8");

  // ── ⑤ 实体图谱（真实单例，会真的重写这个文件）──
  fs.writeFileSync(p("entity-graph.json"), JSON.stringify({
    entities: [
      { id: "ent_me", name: "小明", type: "person", aliases: ["明明"], mentionCount: 3, firstMentionedAt: 1, lastMentionedAt: 2 },
      { id: "ent_other", name: "小红", type: "person", aliases: [], mentionCount: 2, firstMentionedAt: 1, lastMentionedAt: 2 },
      { id: "ent_place", name: "漫展", type: "place", aliases: [], mentionCount: 1, firstMentionedAt: 1, lastMentionedAt: 1 },
      // O3：这个非人节点的提及**来自他的记忆**，而 §2.9 只删 person 节点 → 留着要能看见
      { id: "ent_rust", name: "Rust", type: "concept", aliases: [], mentionCount: 3, firstMentionedAt: 1, lastMentionedAt: 2 },
    ],
    relations: [
      { id: "rel_1", sourceId: "ent_me", targetId: "ent_place", relation: "goes_to", confidence: 1, strength: 1 },
      { id: "rel_2", sourceId: "ent_other", targetId: "ent_place", relation: "goes_to", confidence: 1, strength: 1 },
    ],
  }, null, 2), "utf8");

  // ── ⑥ 群聊语料（只增不减的长期资产：整树必须逐字节不变）──
  writeJsonl(p("group-corpus", "543627098__测试群", "2026-09-20.jsonl"), [
    { t: "2026-09-20T10:00:00.000Z", kind: "group", gid: "543627098", uid: ME, uname: "小明", msg: MY_LONG_LINE },
    { t: "2026-09-20T10:00:05.000Z", kind: "group", gid: "543627098", uid: OTHER, uname: "小红", msg: "我最近在准备考试" },
  ]);
  writeJsonl(p("group-corpus", `${ME}__小明`, "2026-09-20.jsonl"), [
    { t: "2026-09-20T11:00:00.000Z", kind: "private", gid: ME, uid: ME, uname: "小明", msg: "私聊里的话" },
  ]);
  writeJsonl(p("group-corpus", `${ME}__同号群`, "2026-09-20.jsonl"), [
    { t: "2026-09-20T12:00:00.000Z", kind: "group", gid: ME, uid: "999", uname: "路人", msg: "群号恰好等于他的 QQ 号" },
  ]);
  const corpusSnapshot = treeSnapshot(p("group-corpus"));

  // ── ⑦ 记忆：走真实 store API 铺（避免手写 memory.json 撞上迁移逻辑）──
  const { memoryStore } = await import("./memory-store");
  const add = async (overrides: Record<string, unknown>): Promise<string> => {
    const memory = await memoryStore.addL2Memory({
      content: "占位",
      triggerText: "占位",
      sourceConversationId: GROUP,
      isPinned: false,
      ragId: `rag_${Math.random().toString(36).slice(2, 10)}`,
      syncStatus: "synced",
      ...overrides,
    } as Parameters<typeof memoryStore.addL2Memory>[0]);
    return memory.id;
  };

  const minePrivate = await add({ content: "他的私聊记忆", triggerText: "他的私聊触发", sourceConversationId: MY_PRIVATE, speakerIds: [MY_KEY] });
  const mineGroup = await add({ content: MY_LONG_LINE, triggerText: "我最近在学 Rust", sourceConversationId: GROUP, speakerIds: [MY_KEY] });
  const kClass = await add({ content: "小明最近在学 Rust", triggerText: "小明最近在学 Rust", sourceConversationId: GROUP, speakerIds: [`qq:${OTHER}`], subjectIds: [MY_KEY] });
  const otherOwn = await add({ content: "小红最近在准备考试", triggerText: "我最近在准备考试", sourceConversationId: GROUP, speakerIds: [`qq:${OTHER}`] });
  const legacyAnonymous = await add({ content: "群里一句无归属的旧记忆", triggerText: "无归属", sourceConversationId: GROUP });
  const minePrivateLegacy = await add({ content: "他私聊里的旧记忆", triggerText: "旧触发", sourceConversationId: MY_PRIVATE });
  const qqbotSameId = await add({ content: "qqbot 渠道同号的记忆", triggerText: "同号", sourceConversationId: QQBOT_GROUP, speakerIds: [`qqbot:${ME}`], subjectIds: [`qqbot:${ME}`] });
  // 被压缩过的一条（status 已被压缩器置为 archived）——它同时是 K 类：
  // 去压缩必须把它还原成 active，但**不许动它的向量**。
  const compressedSurvivor = await add({
    content: "小红提到小明的另一件事",
    triggerText: "小红提到小明的另一件事",
    sourceConversationId: GROUP,
    speakerIds: [`qq:${OTHER}`],
    subjectIds: [MY_KEY],
    status: "archived",
  } as Record<string, unknown>);
  // 向量缺失的幸存子条目：去压缩必须为它重建向量
  const survivorWithoutVector = await add({
    content: "幸存但没有向量的那条",
    triggerText: "幸存但没有向量的那条",
    sourceConversationId: GROUP,
    speakerIds: [`qq:${OTHER}`],
    ragId: undefined,
    syncStatus: "pending_sync",
  } as Record<string, unknown>);
  const mixedSummary = await add({
    content: "总结：他和小红都在学东西",
    triggerText: "总结",
    isSummary: true,
    subEntryIds: [mineGroup, compressedSurvivor, survivorWithoutVector],
    speakerIds: [MY_KEY, `qq:${OTHER}`],
  });
  const allMineSummary = await add({
    content: "总结：只有他",
    triggerText: "总结",
    isSummary: true,
    subEntryIds: [minePrivate],
    speakerIds: [MY_KEY],
  });

  // 冲突日志 + 反思日志：级联删除与指纹清理的对象
  await memoryStore.appendConflictLog({
    status: "candidate",
    sourceL2Id: mineGroup,
    targetL2Id: otherOwn,
    reason: "测试冲突",
    confidence: 0.5,
    detector: "local",
  });
  await memoryStore.appendConflictLog({
    status: "candidate",
    sourceL2Id: otherOwn,
    targetL2Id: legacyAnonymous,
    reason: "别人的冲突",
    confidence: 0.5,
    detector: "local",
  });
  await memoryStore.appendReflectionLog({
    type: "compression",
    summary: "压缩 2 条记忆为一条总结",
    details: `原条目：${MY_LONG_LINE} | 总结：...`,
  });

  // ── ⑧ 关系日志：四档各一条 ──
  const { RelationshipLogStore } = await import("../relationship/relationship-log");
  const relStore = new RelationshipLogStore(p("relationship-log.json"));
  await relStore.recordTurn({ userText: "按人该删的那条", assistantText: "嗯", cyreneFeeling: "平静", channel: "qq", scope: "zone:root", personKey: MY_KEY });
  await relStore.recordTurn({ userText: "整域该删的那条", assistantText: "嗯", cyreneFeeling: "平静", channel: "qq", scope: `solo:${MY_PRIVATE}` });
  await relStore.recordTurn({ userText: MY_LONG_LINE, assistantText: "嗯", cyreneFeeling: "平静", channel: "qq", scope: `solo:${GROUP}` });
  await relStore.recordTurn({ userText: "这条是别人说的、匹配不上的存量条目", assistantText: "嗯", cyreneFeeling: "平静", channel: "qq", scope: `solo:${GROUP}` });

  const { ChannelConversationBindingStore } = await import("../channels/conversation-binding-store");
  const bindingStore = new ChannelConversationBindingStore(p("channels", "context-bindings.json"));

  const deleteVectors = vi.fn(() => 0);
  const addVector = vi.fn(async (_text: string, l2Id: string) => `rag_rebuilt_${l2Id}`);
  // ── D2：`chat_history` 向量（真实形状照抄实测：同一个 turn 的 user/assistant 同 `ts`）──
  const deleteChatVectors = vi.fn((ids: string[]) => ids.length);
  const chatHistoryVectors = [
    // ① 他说的
    { id: "chat_his", text: `[群聊发送者：小明 (${ME})] ${MY_LONG_LINE}`, metadata: { role: "user", sessionId: GROUP, ts: 100, scope: `solo:${GROUP}` } },
    // ② 她对他那句话的回复 —— **正文里一个字都没提他**（实测那条泄漏的原样）
    { id: "chat_her_reply", text: "学做菜好呀！以后搬去杭州就能自己开小灶啦♪", metadata: { role: "assistant", sessionId: GROUP, ts: 100, scope: `solo:${GROUP}` } },
    // ③ K 类：别人转述他的 user 条目 → 不许删
    { id: "chat_k_class", text: `[群聊发送者：小红 (${OTHER})] 小明最近在学 Rust`, metadata: { role: "user", sessionId: GROUP, ts: 200, scope: `solo:${GROUP}` } },
    // ④ 别的域里的 assistant 条目（提到了他）→ 不许越界
    { id: "chat_other_scope", text: "小明在别的群里说过话", metadata: { role: "assistant", sessionId: QQBOT_GROUP, ts: 300, scope: `solo:${QQBOT_GROUP}` } },
    // ⑤ D4 的"结构性补充"：这个会话在 transcript 里已经**没有他的行了**，
    //    只有这条 chat_history 向量还能指认他在这儿说过话 —— run 记录必须能被它指认出来
    { id: "chat_vector_only", text: `[群聊发送者：小明 (${ME})] 早就被擦掉的旧话`, metadata: { role: "user", sessionId: VECTOR_ONLY_SESSION, ts: 500, scope: `solo:${VECTOR_ONLY_SESSION}` } },
  ];

  const personErasure = await import("./person-erasure");

  return {
    memories: {
      minePrivate: { id: minePrivate },
      mineGroup: { id: mineGroup },
      kClass: { id: kClass },
      otherOwn: { id: otherOwn },
      legacyAnonymous: { id: legacyAnonymous },
      minePrivateLegacy: { id: minePrivateLegacy },
      qqbotSameId: { id: qqbotSameId },
      compressedSurvivor: { id: compressedSurvivor },
      survivorWithoutVector: { id: survivorWithoutVector },
      mixedSummary: { id: mixedSummary },
      allMineSummary: { id: allMineSummary },
    },
    deps: {
      llmQueue: async (_label: string, task: () => Promise<unknown>) => task(),
      deleteVectors,
      addVector,
      getChatHistoryVectors: () => chatHistoryVectors,
      deleteChatVectors,
      bindingStore,
      vaultPath: () => undefined,
      userDataDir: base(),
    },
    deleteVectors,
    addVector,
    deleteChatVectors,
    chatHistoryVectors,
    personErasure,
    memoryStore,
    corpusSnapshot,
  };
}

function readJson(file: string): any {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

describe("person-erasure 端到端", () => {
  beforeEach(() => {
    electronMock.userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "person-erase-"));
    vi.resetModules();
  });

  it("1. 全链路擦除：§0.2 B 的每一条都成立", async () => {
    const h = await setup();
    const plan = await h.personErasure.previewPersonErase(MY_KEY, h.deps);
    const report = await h.personErasure.executePersonErase(MY_KEY, plan.previewId, h.deps);

    expect(report.partial).toBe(false);
    expect(report.needsReconfirm).toBe(false);
    expect(report.failed).toEqual([]);

    // memory.json：speakerIds 里 0 命中；subjectIds 的残留必须与预演声明的"保留 M 条"对得上
    const store = readJson(p("memory.json"));
    const speakerHits = store.l2.filter((m: any) => (m.speakerIds ?? []).includes(MY_KEY));
    expect(speakerHits).toEqual([]);
    const subjectOnlySurvivors = store.l2.filter((m: any) => (m.subjectIds ?? []).includes(MY_KEY));
    // 两条 K 类：小红自己说的"小明最近在学 Rust" + 被压缩过的"小红提到小明的另一件事"
    expect(subjectOnlySurvivors.map((m: any) => m.id).sort()).toEqual(
      [h.memories.kClass.id, h.memories.compressedSurvivor.id].sort(),
    );
    expect(subjectOnlySurvivors).toHaveLength(plan.l2.keptSubjectOnly);
    // 他没有留下任何私有域记忆
    expect(store.l2.some((m: any) => m.sourceConversationId === MY_PRIVATE)).toBe(false);

    // transcript：他的行 0 条，别人的行一行不少
    const groupLines = fs.readFileSync(p("channels", "history", `${fileBase(GROUP)}.jsonl`), "utf8").split("\n").filter(Boolean);
    expect(groupLines.some((line) => line.includes(`"speakerId":"${ME}"`))).toBe(false);
    expect(groupLines.some((line) => line.includes("我最近在准备考试"))).toBe(true);
    const archiveLines = fs.readFileSync(p("channels", "archive", fileBase(GROUP), "2026-09.jsonl"), "utf8").split("\n").filter(Boolean);
    expect(archiveLines.some((line) => line.includes(`"speakerId":"${ME}"`))).toBe(false);
    expect(archiveLines.some((line) => line.includes("九月的别人"))).toBe(true);
    // 他的私聊整会话被删；小红私聊完好
    expect(fs.existsSync(p("channels", "history", `${fileBase(MY_PRIVATE)}.jsonl`))).toBe(false);
    expect(fs.existsSync(p("channels", "history", `${fileBase(OTHER_PRIVATE)}.jsonl`))).toBe(true);
    // 别的渠道同号的人一行不动
    expect(fs.readFileSync(p("channels", "history", `${fileBase(QQBOT_SAME_ID_GROUP)}.jsonl`), "utf8")).toContain("qqbot 渠道里同号的人");

    // 审计 / 运行日志：他的行 0 条，别人的留着
    const auditIndex = fs.readFileSync(p("channels", "audit", "index.jsonl"), "utf8").split("\n").filter(Boolean);
    expect(auditIndex.some((line) => line.includes(`"senderId":"${ME}"`))).toBe(false);
    expect(auditIndex).toHaveLength(1);
    const { auditLogsDir, auditSenderSlug } = await import("../channels/audit-log");
    expect(fs.readdirSync(auditLogsDir())).toEqual([`20260920-${auditSenderSlug(OTHER)}-def.log`]);
    const channelLog = fs.readFileSync(p("channels", "log.jsonl"), "utf8").split("\n").filter(Boolean);
    expect(channelLog.some((line) => line.includes(`"senderId":"${ME}"`))).toBe(false);
    expect(channelLog).toHaveLength(1);

    // 外部会话观察：他的私聊记录 0 条，群记录保留
    const bindings = readJson(p("channels", "context-bindings.json"));
    expect(bindings.externalChats.map((c: any) => c.sessionId)).toEqual([GROUP, OTHER_PRIVATE].sort((a, b) => a.localeCompare(b)));

    // 实体图：他的名字 0 个、相关 relations 0 条；小红与地点保留
    const graph = readJson(p("entity-graph.json"));
    expect(graph.entities.map((e: any) => e.name).sort()).toEqual(["Rust", "小红", "漫展"]);
    expect(graph.relations.map((r: any) => r.id)).toEqual(["rel_2"]);

    // 关系日志：按人 + 整域 + 指纹三档都生效，匹配不上的那条留着
    const rel = readJson(p("relationship-log.json"));
    expect(rel.entries.some((e: any) => e.personKey === MY_KEY)).toBe(false);
    expect(rel.entries.some((e: any) => e.scope === `solo:${MY_PRIVATE}`)).toBe(false);
    expect(rel.entries.some((e: any) => e.userText === MY_LONG_LINE)).toBe(false);
    expect(rel.entries.map((e: any) => e.userText)).toEqual(["这条是别人说的、匹配不上的存量条目"]);

    // 备份 / 调试日志：整份销毁
    expect(fs.readdirSync(base()).filter((n) => n.startsWith("memory.backup."))).toEqual([]);
    expect(fs.existsSync(p("memory-reconcile-backups"))).toBe(false);
    expect(fs.existsSync(p("chat-api.log"))).toBe(false);

    // 向量：被删条目的 ragId 都进了 deleteVectors
    expect(h.deleteVectors).toHaveBeenCalled();
    const deletedRagIds = h.deleteVectors.mock.calls.flatMap((call) => call[0] as string[]);
    expect(deletedRagIds.length).toBeGreaterThanOrEqual(4);
  });

  it("2. 别人完好：K 类记忆逐字段不变、向量未删；别人的 transcript / 关系条目 / 实体节点一行不动", async () => {
    const h = await setup();
    const before = readJson(p("memory.json")).l2.find((m: any) => m.id === h.memories.kClass.id);
    const plan = await h.personErasure.previewPersonErase(MY_KEY, h.deps);
    await h.personErasure.executePersonErase(MY_KEY, plan.previewId, h.deps);

    const after = readJson(p("memory.json")).l2.find((m: any) => m.id === h.memories.kClass.id);
    // ⚠️ §2.3 的核心防线：这条是"别人提到他"，删它等于抹掉小红的事
    expect(after).toEqual(before);
    expect(after.content).toBe("小明最近在学 Rust");
    expect(after.subjectIds).toEqual([MY_KEY]);
    expect(after.speakerIds).toEqual([`qq:${OTHER}`]);
    expect(after.status).toBe("active");
    expect(after.syncStatus).toBe("synced");

    const deletedRagIds = h.deleteVectors.mock.calls.flatMap((call) => call[0] as string[]);
    expect(deletedRagIds).not.toContain(after.ragId);

    // 别人自己的那条也在
    const otherOwn = readJson(p("memory.json")).l2.find((m: any) => m.id === h.memories.otherOwn.id);
    expect(otherOwn.content).toBe("小红最近在准备考试");
  });

  it("2b. 群聊语料零改动（本阶段最该被守住的一条）", async () => {
    const h = await setup();
    const plan = await h.personErasure.previewPersonErase(MY_KEY, h.deps);
    await h.personErasure.executePersonErase(MY_KEY, plan.previewId, h.deps);

    // 逐字节 + mtime 都不变
    expect(treeSnapshot(p("group-corpus"))).toEqual(h.corpusSnapshot);
    expect(fs.readFileSync(p("group-corpus", "543627098__测试群", "2026-09-20.jsonl"), "utf8")).toContain(MY_LONG_LINE);
  });

  it("2c. K 类计数进入报告，且与执行后的实际残留完全相等", async () => {
    const h = await setup();
    const plan = await h.personErasure.previewPersonErase(MY_KEY, h.deps);
    expect(plan.l2.keptSubjectOnly).toBe(2);
    expect(plan.l2.keptSamples.map((s) => s.content).join("|")).toContain("小明最近在学 Rust");

    const report = await h.personErasure.executePersonErase(MY_KEY, plan.previewId, h.deps);
    const survivors = readJson(p("memory.json")).l2.filter((m: any) => (
      (m.subjectIds ?? []).includes(MY_KEY) && !(m.speakerIds ?? []).includes(MY_KEY)
    ));
    expect(report.keptSubjectOnly).toBe(survivors.length);
  });

  it("3. 幂等：连续执行两次，第二次没有可删的东西且不报错", async () => {
    const h = await setup();
    const first = await h.personErasure.previewPersonErase(MY_KEY, h.deps);
    await h.personErasure.executePersonErase(MY_KEY, first.previewId, h.deps);

    const second = await h.personErasure.previewPersonErase(MY_KEY, h.deps);
    expect(second.l2.total).toBe(0);
    const report = await h.personErasure.executePersonErase(MY_KEY, second.previewId, h.deps);
    expect(report.failed).toEqual([]);
    expect(report.l2.removed).toBe(0);
  });

  it("4. 预演 ≠ 执行：预演之后他又说了新的话 → 中止，什么都不删", async () => {
    const h = await setup();
    const plan = await h.personErasure.previewPersonErase(MY_KEY, h.deps);
    expect(plan.l2.total).toBeGreaterThan(0);

    // 模拟"预演之后他又说了一句"（新命中，不在预演快照里）
    await h.memoryStore.addL2Memory({
      content: "他又说了一句新的",
      triggerText: "新的",
      sourceConversationId: GROUP,
      speakerIds: [MY_KEY],
      isPinned: false,
    } as Parameters<typeof h.memoryStore.addL2Memory>[0]);

    const report = await h.personErasure.executePersonErase(MY_KEY, plan.previewId, h.deps);
    expect(report.needsReconfirm).toBe(true);
    expect(report.addedSincePreview).toBeGreaterThan(0);
    expect(report.l2.removed).toBe(0);
    // 预演里那些条目一条都没被删
    const store = readJson(p("memory.json"));
    expect(store.l2.some((m: any) => m.id === h.memories.mineGroup.id)).toBe(true);
    expect(fs.existsSync(p("chat-api.log"))).toBe(true);
  });

  it("5. previewId 伪造 / 过期 → 拒绝执行", async () => {
    const h = await setup();
    const report = await h.personErasure.executePersonErase(MY_KEY, "erase_fake", h.deps);
    expect(report.partial).toBe(true);
    expect(report.failed[0].step).toBe("preview");
    expect(readJson(p("memory.json")).l2.some((m: any) => m.id === h.memories.mineGroup.id)).toBe(true);
  });

  it("6. 部分失败：某一步抛错 → partial=true + failed 有该步，其余步骤照常完成", async () => {
    const h = await setup();
    const plan = await h.personErasure.previewPersonErase(MY_KEY, h.deps);
    const report = await h.personErasure.executePersonErase(MY_KEY, plan.previewId, {
      ...h.deps,
      eraseApiLog: () => {
        throw new Error("boom: 文件被占用");
      },
    });

    expect(report.partial).toBe(true);
    expect(report.failed.map((f) => f.step)).toContain("chat-api-log");
    // 其余步骤仍然完成了
    expect(report.l2.removed).toBeGreaterThan(0);
    expect(fs.existsSync(p("channels", "history", `${fileBase(MY_PRIVATE)}.jsonl`))).toBe(false);
    expect(readJson(p("relationship-log.json")).entries.some((e: any) => e.personKey === MY_KEY)).toBe(false);
  });

  it("7. 去压缩：总结被删、幸存子条目回到 active，缺向量的才重建（零 LLM）", async () => {
    const h = await setup();
    const plan = await h.personErasure.previewPersonErase(MY_KEY, h.deps);
    expect(plan.summaries.decompress).toEqual([h.memories.mixedSummary.id]);
    expect(plan.summaries.remove).toEqual([h.memories.allMineSummary.id]);

    const report = await h.personErasure.executePersonErase(MY_KEY, plan.previewId, h.deps);

    const store = readJson(p("memory.json"));
    expect(store.l2.some((m: any) => m.id === h.memories.mixedSummary.id)).toBe(false);
    expect(store.l2.some((m: any) => m.id === h.memories.allMineSummary.id)).toBe(false);

    // 被压缩归档的幸存者 → 确定性还原为 active（压缩器的候选集只收 active，所以这就是压缩前状态）
    const restored = store.l2.find((m: any) => m.id === h.memories.compressedSurvivor.id);
    expect(restored.status).toBe("active");
    // ⚠️ 它同时是 K 类（"小红提到小明"）→ 它的向量与 ragId 必须原样保留
    const beforeVector = readJson(p("memory.json"));
    void beforeVector;
    expect(restored.syncStatus).toBe("synced");
    expect(typeof restored.ragId).toBe("string");

    // 向量缺失的幸存者 → 真的重建
    const rebuilt = store.l2.find((m: any) => m.id === h.memories.survivorWithoutVector.id);
    expect(rebuilt.status).toBe("active");
    expect(rebuilt.syncStatus).toBe("synced");
    expect(rebuilt.ragId).toBe(`rag_rebuilt_${h.memories.survivorWithoutVector.id}`);
    expect(h.addVector).toHaveBeenCalledTimes(1);
    expect(report.l2.decompressed).toBe(2);
  });

  it("8. 无 Obsidian 绑定：步骤 ⑪ 跳过且不报错", async () => {
    const h = await setup();
    const plan = await h.personErasure.previewPersonErase(MY_KEY, h.deps);
    const report = await h.personErasure.executePersonErase(MY_KEY, plan.previewId, h.deps);
    expect(report.obsidian.synced).toBe(false);
    expect(report.failed).toEqual([]);
  });

  it("9. 审计只记动作不记正文：memory.personErase 的 details 里不含任何被删内容", async () => {
    const h = await setup();
    const plan = await h.personErasure.previewPersonErase(MY_KEY, h.deps);
    await h.personErasure.executePersonErase(MY_KEY, plan.previewId, h.deps);

    const trace = fs.readFileSync(p("memory-trace.log"), "utf8");
    const events = trace.split("\n").filter(Boolean).map((line) => JSON.parse(line));
    const summary = events.find((event) => event.op === "memory.personErase");
    expect(summary).toBeTruthy();
    expect(summary.details.personKey).toBe(MY_KEY);
    // Q3：审计保留"删除动作"本身，清掉被删对象的内容
    expect(trace).not.toContain(MY_LONG_LINE);
    expect(trace).not.toContain("他的私聊记忆");
    expect(trace).not.toContain("他私聊里的旧记忆");
  });

  it("10. 跨步骤数据流：⑥ 产出的「被删行正文」驱动 ⑨ 的关系日志指纹匹配", async () => {
    const h = await setup();
    const plan = await h.personErasure.previewPersonErase(MY_KEY, h.deps);
    // 预演就应该看得见这一档（与执行共用同一套前缀判据）
    expect(plan.relationshipEntries.byTextFingerprint).toBe(1);
    expect(plan.relationshipEntries.unmatched).toBe(1);

    const report = await h.personErasure.executePersonErase(MY_KEY, plan.previewId, h.deps);

    expect(report.relationship.byTextFingerprint).toBe(1);
    const entries = readJson(p("relationship-log.json")).entries;
    expect(entries.some((e: any) => e.userText === MY_LONG_LINE)).toBe(false);
    // 匹配不上的那条留着，并出现在残留清单里（report.residues 是执行后重算的）
    expect(entries.map((e: any) => e.userText)).toEqual(["这条是别人说的、匹配不上的存量条目"]);
  });

  it("预演是只读的：不产生任何文件变更", async () => {
    const h = await setup();
    const snapshot = treeSnapshot(base());
    await h.personErasure.previewPersonErase(MY_KEY, h.deps);
    expect(treeSnapshot(base())).toEqual(snapshot);
  });

  it("预演报告包含备份/调试日志的整份销毁提示，并声明语料未改动", async () => {
    const h = await setup();
    const plan = await h.personErasure.previewPersonErase(MY_KEY, h.deps);
    // ⚠️ 递归统计：备份文件 + 对账备份目录里的**文件**都要算进去（只 statSync 目录会得到 0）
    const expectedBytes = fs.statSync(p("memory.backup.2026-01-01T00-00-00-000Z.json")).size
      + fs.statSync(p("memory-reconcile-backups", "memory.1.json")).size
      + fs.statSync(p("memory-reconcile-backups", "memory-store.1.json")).size;
    // D3：预演的"文件数"必须是**递归文件数**（1 个备份 + 对账目录里的 2 个 = 3）
    expect(plan.memoryBackups.files).toBe(3);
    expect(plan.memoryBackups.bytes).toBe(expectedBytes);
    expect(plan.apiLog.exists).toBe(true);
    expect(plan.apiLog.bytes).toBe(fs.statSync(p("chat-api.log")).size);

    // 预演说的"会销毁多少"必须与执行报告一致（§2.13：不能预演一套、执行另一套）
    const report = await h.personErasure.executePersonErase(MY_KEY, plan.previewId, h.deps);
    // ⚠️ D3 的回归点：修之前这里会是 3 vs 2（报告数的是"目标数"：文件 + 目录）
    expect(report.backups.files).toBe(plan.memoryBackups.files);
    expect(report.backups.bytes).toBe(plan.memoryBackups.bytes);
    expect(report.apiLog.deleted).toBe(true);
    expect(report.apiLog.bytes).toBe(plan.apiLog.bytes);

    expect(plan.knownNames).toContain("小明");
    expect(plan.sessions.some((s) => s.kind === "private" && s.sessionId === MY_PRIVATE)).toBe(true);
    expect(plan.audit.entries).toBe(2);
    expect(plan.channelLogLines).toBe(1);
    // D6：`summaries` 现在预演也算得出来 —— 1 条来自 ① 孤儿摘要（zone:root 的条目被删光）
    // + 1 条来自 ② 整域删（solo:私聊域 的日摘要）
    expect(plan.relationshipEntries).toEqual({ byPersonKey: 1, byScope: 1, byTextFingerprint: 1, unmatched: 1, summaries: 2 });
    // ⚠️ D6 的回归点：预演算出的 summaries 必须与执行报告里的一致
    expect(report.relationship.summaries).toBe(plan.relationshipEntries.summaries);
    // 语料从不进入任何计数（§0.4 约束 2：连字面量都不出现）
    expect(JSON.stringify(plan)).not.toContain("group-corpus");
  });

  it("无效 personKey → 预演抛错（UI 必须能区分「预演失败」与「没有可删的东西」）", async () => {
    const h = await setup();
    await expect(h.personErasure.previewPersonErase("no-colon", h.deps)).rejects.toThrow();
  });

  // ── D2（§9.3c 第 17 条）：对话的向量副本也必须清 ──────────────────────────
  //
  // 背景：`user_memory_*`（记忆的向量副本）一直有删，但 `chat_history_*`（每轮对话的
  // user/assistant 向量副本）**既不删、也不会被启动对账回收** ——
  // `reconcileUserMemoryIndex` 取的是 `getEntriesBySource("user_memory")`。
  // 结果：擦除后仍能按域语义召回到他已经删掉的经历。

  it("11. D2：chat_history 向量也要删 —— 他说的 + 她回他的（正文里没提他也算）；K 类与别的域不动", async () => {
    const h = await setup();
    const plan = await h.personErasure.previewPersonErase(MY_KEY, h.deps);

    // 预演必须先说清楚会删几条（§2.13：不能预演一套、执行另一套）
    // = 他说的 2 条（`chat_his` + `chat_vector_only`）+ 她回他的 1 条（`chat_her_reply`）
    expect(plan.chatHistoryVectors).toBe(3);

    const report = await h.personErasure.executePersonErase(MY_KEY, plan.previewId, h.deps);
    expect(report.partial).toBe(false);
    expect(report.chatHistoryVectors).toBe(plan.chatHistoryVectors);

    const deleted = h.deleteChatVectors.mock.calls.flatMap((call) => call[0] as string[]).sort();
    expect(deleted).toEqual(["chat_her_reply", "chat_his", "chat_vector_only"]);
    // K 类（别人转述他的 user 条目）与别的域的 assistant 条目都必须原样留着
    expect(deleted).not.toContain("chat_k_class");
    expect(deleted).not.toContain("chat_other_scope");
    // 它走的是**独立的**删除入口：`user_memory` 那条通道不许被它污染
    expect(h.deleteVectors.mock.calls.flatMap((call) => call[0] as string[])).not.toContain("chat_his");
  });

  it("12. D2：向量库不可用（retriever 未初始化）时，这一步不得让整次擦除失败", async () => {
    const h = await setup();
    const plan = await h.personErasure.previewPersonErase(MY_KEY, h.deps);
    const report = await h.personErasure.executePersonErase(MY_KEY, plan.previewId, {
      ...h.deps,
      getChatHistoryVectors: () => { throw new Error("RAG not initialized"); },
    });
    // 该步进 failed[]，其余步骤照常完成（§2.14 不假装原子）
    expect(report.partial).toBe(true);
    expect(report.failed.some((f) => f.step === "chat-history-vectors")).toBe(true);
    expect(readJson(p("memory.json")).l2.some((m: any) => (m.speakerIds ?? []).includes(MY_KEY))).toBe(false);
  });

  it("14. O2/O3/O4：预演如实列出「有意保留」的载体、实体图派生物、以及残留的她的复述行", async () => {
    const h = await setup();
    const plan = await h.personErasure.previewPersonErase(MY_KEY, h.deps);

    // O2：文案不许超出证据 —— 保留清单必须来自主进程（不是 UI 硬编码）
    expect(plan.preservedPaths).toContain("cyrene-chats/");
    expect(plan.preservedPaths).toContain("channels-settings.json");
    expect(plan.preservedPaths).toContain("cyrene-runs/reviews/");
    // 语料不在这张清单里：它自己有一行，且擦除链路负载里不该出现它的路径（§0.4 约束 2）
    expect(JSON.stringify(plan)).not.toContain("group-corpus");

    // O3：由他的记忆派生的非人节点（这里是他记忆里的 "Rust"）只列不改
    expect(plan.residues.some((r) => r.kind === "entityDerived" && r.snippet.includes("Rust"))).toBe(true);

    // O4：她的复述行在"他的行已经不在了"的会话里会残留 → 必须进清单（不会被自动回收）
    expect(plan.residues.some((r) => r.kind === "assistantText" && r.file.includes("vectoronly"))).toBe(true);
  });

  // ── D4（§9.3c 第 19 条）：agent 运行记录的边界 ────────────────────────────

  it("13. D4：按会话删掉 agent 运行记录（session 文件 + events + index 行）；别人会话的 run 一个不动", async () => {
    const h = await setup();
    const plan = await h.personErasure.previewPersonErase(MY_KEY, h.deps);

    // 预演：他的两个会话（群 + 私聊）各 1 个 run，加上"只在向量里留过痕"的那个 = 3；
    // ⚠️ 这一条锁的是**结构性补充**：不能只看 transcript 扫描结果（他的行可能已被上次擦除抹掉）
    expect(plan.runs).toBe(3);
    // 运行产物进疑似残留清单（不自动删，但必须可见）
    expect(plan.residues.some((r) => r.kind === "runArtefacts" && r.file.includes("cyrene-runs/reviews"))).toBe(true);

    const report = await h.personErasure.executePersonErase(MY_KEY, plan.previewId, h.deps);
    expect(report.partial).toBe(false);
    expect(report.runs).toBe(plan.runs);

    expect(fs.existsSync(p("cyrene-runs", "sessions", "run_a.json"))).toBe(false);
    expect(fs.existsSync(p("cyrene-runs", "sessions", "run_a.events.jsonl"))).toBe(false);
    expect(fs.existsSync(p("cyrene-runs", "sessions", "run_b.json"))).toBe(false);
    expect(fs.existsSync(p("cyrene-runs", "sessions", "run_d.json"))).toBe(false);
    // 别人的会话（OTHER_PRIVATE）的 run 原样留着
    expect(fs.existsSync(p("cyrene-runs", "sessions", "run_c.json"))).toBe(true);
    expect(fs.existsSync(p("cyrene-runs", "sessions", "run_c.events.jsonl"))).toBe(true);
    const rows = readJson(p("cyrene-runs", "index.json")) as Array<{ runId: string }>;
    expect(rows.map((r) => r.runId)).toEqual(["run_c"]);
    // reviews 不删（有意），但已在预演里报出来
    expect(fs.existsSync(p("cyrene-runs", "reviews", "run-1", "journal.jsonl"))).toBe(true);
  });
});
