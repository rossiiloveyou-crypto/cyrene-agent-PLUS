import * as fs from "node:fs";
import * as path from "node:path";
import { app } from "electron";

/**
 * 群聊语料采集（自学习模块的数据前置层）。
 *
 * ── 这个模块的契约（改动前必读）────────────────────────────────
 *
 * 它**只写不读**，且**没有任何生产消费方**：
 *   - 不导出给对话链路 / prompt 构建 / 记忆系统 / 工具；
 *   - 落盘的内容不注入任何上下文，模型看不到它；
 *   - 因此它的存在不会改变昔涟的任何一句话。
 *
 * 它的唯一用途是：为排期在后面的「群聊风格自学习」模块攒原始数据。
 * 现在先攒，是因为代码还在改，等到要用的那天不一定还能顺手捞到这些消息。
 *
 * ── 为什么单独建目录，而不是复用 channels/history ─────────────────
 *
 *   `channels/history/` 和 `channels/archive/` 都在 `MEMORY_TARGETS` 里，
 *   用户点「清空记忆」会被整目录 rmSync；`history` 热文件还会在超过
 *   200 行时截断（老行搬去 archive）。而这个语料是**只增不减的长期资产**，
 *   被清空就等于前功尽弃。
 *
 *   所以它放在 userData **顶层** `group-corpus/`，与 `channels/` 平级 ——
 *   不在任何 MEMORY_TARGETS 条目的路径内，物理上不可能被记忆清理误伤；
 *   同时登记在 `MEMORY_PRESERVED` 里，并有回归测试锁住这条边界
 *   （见 memory-deletion.test.ts 与 group-corpus-isolation.test.ts）。
 *
 * ── 采集范围 ──────────────────────────────────────────────────
 *
 *   **群聊 + 私聊都采**（飞书/微信等其它渠道暂不采）。目标是收集「真人怎么说话」，
 *   私聊同样是真人语料，没有理由丢。
 *
 *   私聊的先天限制：只收得到**对方发来的**消息。昔涟自己发出去的不入语料
 *   （两处入口都以 `self_id` 过滤掉了），所以私聊语料是单向的 ——
 *   能学到对方的说话方式，学不到「昔涟在这一轮是怎么回的」。
 *
 * ── 已知取舍 ──────────────────────────────────────────────────
 *
 *   文件夹名规则是 `<id>__<名字快照>`，取不到名字时退化：
 *   群聊 = 纯 `<群号>`，私聊 = `<对方QQ号>__private`。
 *   当前 OneBot 消息事件只带 id、不带名字，所以实际落盘的就是这两种形态。
 *   刻意不用发言者昵称冒充会话名 —— 那会把目录名写错，比没有名字更糟。
 *   将来若要补名字，数据源是 `channels/context-bindings.json` 的 `externalChats`。
 *
 *   名字一旦拼进目录，改名后新消息会写进新文件夹、旧数据留在原地。
 *   JSONL 每行都带 `gid` + `kind`，所以文件夹叫什么都不影响归属。
 *
 *   I/O 代价：每条消息 = 一次 mkdir + 一次 readdir（目录名复用）+ 一次 appendFile，
 *   同步写。渠道聊天量级（每天几百条）下可以忽略；readdir 是为了稳定复用目录名，
 *   不值得为省这一次调用引入缓存。
 */

/** 采集总开关。关掉只影响新数据的落盘，已有文件不动。 */
const CORPUS_ENABLED = true;

/** 应急关闭：设置 `CYRENE_GROUP_CORPUS=0` / `false` / `off` / `no` 可停止采集（不必改代码）。 */
function envDisabled(): boolean {
  const raw = process.env.CYRENE_GROUP_CORPUS?.trim().toLowerCase();
  return raw === "0" || raw === "false" || raw === "off" || raw === "no";
}

/** 去重窗口：同一条 mid 在这个时间内只落一次。重连补投通常发生在分钟级。 */
const MESSAGE_ID_TTL_MS = 24 * 60 * 60_000;
/** 每群在内存里记住的 mid 数量上限，防止长跑进程无限增长。 */
const MESSAGE_ID_MAX_PER_GROUP = 5_000;

const LOG = "[GroupCorpus]";

export type CorpusChatKind = "group" | "private";

export interface GroupCorpusMessage {
  /** 会话类型：群聊用群号，私聊用对方 QQ 号。 */
  kind: CorpusChatKind;
  /**
   * 会话 id（裸值，与 transcript 的 speakerId 约定一致）：
   * 群聊 = 群号；私聊 = 对方 QQ 号。
   *
   * 私聊只收得到**对方发来的**消息（昔涟自己发的在她发送时就已经存在，
   * 群里/私聊都不入语料），所以私聊语料是单向的。
   */
  groupId: string;
  /**
   * 会话名快照（可选）。群聊时是群名，私聊时是对方昵称。
   * OneBot 消息事件两个都不带，当前生产调用方不传。
   */
  groupName?: string;
  /** 发言者 QQ 号。 */
  senderId: string;
  /** 发言者群名片/昵称快照（会变，所以每条都记，不依赖单独的名册）。 */
  senderName?: string;
  /** OneBot 消息 id，用于去重；缺失时该条不参与去重但仍然落盘。 */
  messageId?: string;
  /** 纯正文（可能为空 —— 纯附件消息）。 */
  text: string;
  /** 纯附件占位描述（形如 `[图片]`），与 text 拼接后落盘。 */
  attachmentText?: string;
  /** 消息时间（用 OneBot 事件时间，比落盘时刻更准）。 */
  at: Date;
  /** 该会话是否通过白名单/权限校验（群 = 加入白名单，私聊 = 发送者获授权）。 */
  groupAllowed: boolean;
  /** 这条消息把昔涟叫起来了（群聊：@ / 触发词；私聊：对方说话就是找她）。 */
  triggered: boolean;
  trigger?: string;
}

export interface GroupCorpusEntry {
  /** ISO 时间戳。 */
  t: string;
  /** 会话类型。老数据没有这个字段，读取方应按 `group` 兜底。 */
  kind: CorpusChatKind;
  /** 群号（`kind=group`）或对方 QQ 号（`kind=private`）。 */
  gid: string;
  /** 会话名快照；取不到时省略。 */
  gname?: string;
  uid: string;
  /** 昵称快照；取不到时省略。 */
  uname?: string;
  msg: string;
  /** OneBot 消息 id；取不到时省略。 */
  mid?: string;
  /** respond = 这条把昔涟叫起来了；observe = 她只是看着。 */
  trig: "respond" | "observe";
  /** 该会话是否在白名单（加入区块）内。供将来 T2 过滤"被点名污染"的样本。 */
  allowed: boolean;
}

// ── 路径 ────────────────────────────────────────────────────────

/** 语料根目录：`<userData>/group-corpus`（与 channels/ 平级，不在 MEMORY_TARGETS 内）。 */
export function corpusDir(): string {
  return path.join(app.getPath("userData"), "group-corpus");
}

/** 去掉 Windows/macOS 文件名非法字符，附带截断。导出仅为让测试覆盖边界。 */
export function sanitizeFolderName(raw: string): string {
  const cleaned = raw
    // 控制字符 + 路径非法字符 + 首尾点空格（Windows 不允许）
    .replace(/[\u0000-\u001f<>:"/\\|?*]/g, "_")
    .replace(/^[\s.]+|[\s.]+$/g, "");
  return cleaned.slice(0, 40);
}

/**
 * 文件夹名：`<id>` / `<id>__<名字快照>` / `<id>__private`。
 *
 * id 恒在，所以将来补上名字、或被改名，都不会丢归属。
 * 私聊用 `__private` 后缀而不是单独的子目录 —— 这样即使某个群号恰好等于
 * 某人的 QQ 号，两者也不会写进同一个文件夹。
 */
export function groupKeyOf(id: string, name?: string, kind: CorpusChatKind = "group"): string {
  const safeId = sanitizeFolderName(id) || "unknown";
  const cleanName = sanitizeFolderName(name?.trim() ?? "");
  if (cleanName) return `${safeId}__${cleanName}`;
  return kind === "private" ? `${safeId}__private` : safeId;
}

/** 从文件夹名里取出 `<id>` 部分（`__` 之前），用于判断某会话是否已有目录。 */
function folderIdOf(folder: string): string {
  const separator = folder.indexOf("__");
  return separator > 0 ? folder.slice(0, separator) : folder;
}

/** 从文件夹名里取出 `<名字>` 部分；没有时返回空串。 */
function folderNameOf(folder: string): string {
  const separator = folder.indexOf("__");
  return separator > 0 ? folder.slice(separator + 2) : "";
}

/**
 * 会话的存储键 = `<id>__<kind>`。
 *
 * ⚠️ 必须带 kind：群号与 QQ 号同为数字且可能相等，
 * 只按 id 判重会让同号的群聊与私聊互相吃掉对方的目录。
 */
function chatKeyOf(id: string, kind: CorpusChatKind): string {
  return `${id}__${kind}`;
}

/**
 * 从文件夹名反推存储键。
 *
 * 规则：`__private` 后缀 = 私聊，其它一切形态 = 群聊（含 `<id>__<群名>`）。
 * 这样将来若开始往目录拼群名，旧的带名目录仍会被认成同一个群并复用，
 * 不会因为"名字认不出来"就另起一个目录把历史劈开。
 *
 * 代价：群名恰好叫 "private" 的群会被误判成私聊。这种命名冲突在当前
 * 目录方案下无法避免，概率极低，不做处理。
 */
function folderChatKey(folder: string): string {
  const id = folderIdOf(folder);
  const kind: CorpusChatKind = folderNameOf(folder) === "private" ? "private" : "group";
  return chatKeyOf(id, kind);
}

/**
 * 判断某文件夹的名字部分是否被**别的 id** 占用（两个会话恰好同名）。
 *
 * 注意这里**不比较 kind**：无论是群还是私聊，只要名字部分撞了就算占用 ——
 * 否则两个同名会话会写进同一个目录。
 */
function nameTakenByOther(
  existing: readonly string[],
  name: string,
  ownId: string,
): boolean {
  return existing.some((folder) => folderNameOf(folder) === name && folderIdOf(folder) !== ownId);
}

/** 按天分片：一天一个文件，便于将来按时间窗抽样与清理。 */
export function dayFileOf(at: Date): string {
  const iso = at.toISOString();
  return `${iso.slice(0, 10)}.jsonl`;
}

/**
 * 解析某会话今天该写进哪个文件夹。
 *
 * 规则（按优先级）：
 *   1. 已有 id 部分等于本会话 id 的文件夹（`<id>` / `<id>__名字` / `<id>__private`）
 *      → 复用它，避免名字抖动把同一个会话劈成多个目录；
 *   2. 期望的 `<id>__<名字>` 的名字部分已被**别的 id** 占用（两个会话恰好同名）
 *      → **不拼名字**，退回本类型的基础名（群 = `<id>`，私聊 = `<id>__private`）；
 *   3. 否则用期望文件夹名。
 *
 * 第 2 条刻意只退回「基础名」而不是按某种规则再拼一个后缀 ——
 * 群的基础名 `<id>` 由 id 唯一确定、私聊的基础名 `<id>__private` 同理，
 * 所以退回后**不可能再撞**，不需要递归处理"降级目标也被占用"。
 *
 * 纯函数：不碰磁盘，`existing` 由调用方传入（便于单测与复用一次 readdir）。
 */
export function resolveGroupFolder(input: {
  groupId: string;
  groupName?: string;
  kind?: CorpusChatKind;
  existing: readonly string[];
}): string {
  const { groupId, groupName, kind = "group", existing } = input;
  const safeId = sanitizeFolderName(groupId) || "unknown";
  const ownKey = chatKeyOf(safeId, kind);
  const reuse = existing.find((name) => folderChatKey(name) === ownKey);
  if (reuse) return reuse;

  const base = kind === "private" ? `${safeId}__private` : safeId;
  const desired = groupKeyOf(groupId, groupName, kind);
  if (desired === base) return base;

  return nameTakenByOther(existing, folderNameOf(desired), safeId) ? base : desired;
}

// ── 去重（内存，不读磁盘）─────────────────────────────────────
//
// 调用点已在 NapCat 的 10 分钟内存去重**之后**，这里再记一层是为了覆盖
// 应用重启后的补投。刻意不读文件做持久去重：那会违背"只写不读"的契约。

interface SeenId {
  key: string;
  at: number;
}
const seenIds = new Map<string, SeenId[]>();

/** 测试用：清空去重记忆。 */
export function _resetGroupCorpusForTest(): void {
  seenIds.clear();
}

function pruneSeen(list: SeenId[], now: number): SeenId[] {
  const alive = list.filter((item) => now - item.at < MESSAGE_ID_TTL_MS);
  return alive.length > MESSAGE_ID_MAX_PER_GROUP
    ? alive.slice(alive.length - MESSAGE_ID_MAX_PER_GROUP)
    : alive;
}

/**
 * 去重命名空间的键。
 *
 * ⚠️ **必须带 `kind`**：群号和 QQ 号同为数字且可能相等（有人把自己的 QQ 号
 * 当成群号测试，或者恰好撞上），只按 id 去重会让后写的那条被当成重复投递丢掉。
 */
function dedupeScopeOf(kind: CorpusChatKind, id: string): string {
  return `${kind}:${id}`;
}

function isDuplicate(scope: string, messageId: string, now: number): boolean {
  const list = seenIds.get(scope);
  if (!list) return false;
  const alive = pruneSeen(list, now);
  seenIds.set(scope, alive);
  return alive.some((item) => item.key === messageId);
}

function rememberMessageId(scope: string, messageId: string, now: number): void {
  const list = pruneSeen(seenIds.get(scope) ?? [], now);
  list.push({ key: messageId, at: now });
  seenIds.set(scope, list);
}

// ── 写入 ────────────────────────────────────────────────────────

/**
 * 采集一条群消息。
 *
 * 契约：**永不抛错、永不阻塞**。任何失败都吞掉并打一行 warn ——
 * 采集是旁路，绝不能影响消息投递与回复。
 *
 * @returns 真正落盘时返回 `true`；被开关/去重/空内容拦下或写失败时 `false`。
 */
export function writeGroupCorpus(message: GroupCorpusMessage): boolean {
  try {
    if (!CORPUS_ENABLED || envDisabled()) return false;
    if (!message.groupId) return false;

    const messageId = message.messageId?.trim() ?? "";
    const nowMs = Date.now();
    const dedupeScope = dedupeScopeOf(message.kind, message.groupId);
    if (messageId && isDuplicate(dedupeScope, messageId, nowMs)) return false;

    const content = [message.text.trim(), (message.attachmentText ?? "").trim()]
      .filter(Boolean)
      .join(" ");
    // 正文和附件都空：这条消息没有任何可学的东西，不占一行。
    if (!content) return false;

    const root = corpusDir();
    fs.mkdirSync(root, { recursive: true });
    const existing = fs.readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    const folder = resolveGroupFolder({
      groupId: message.groupId,
      ...(message.groupName ? { groupName: message.groupName } : {}),
      kind: message.kind,
      existing,
    });

    const entry: GroupCorpusEntry = {
      t: message.at.toISOString(),
      kind: message.kind,
      gid: message.groupId,
      ...(message.groupName ? { gname: message.groupName } : {}),
      uid: message.senderId,
      ...(message.senderName ? { uname: message.senderName } : {}),
      msg: content,
      ...(messageId ? { mid: messageId } : {}),
      trig: message.triggered ? "respond" : "observe",
      allowed: message.groupAllowed,
    };

    // 会话文件夹在这一步才建：首次见到某个群/某个人时它还不存在。
    const chatDir = path.join(root, folder);
    fs.mkdirSync(chatDir, { recursive: true });
    const target = path.join(chatDir, dayFileOf(message.at));
    fs.appendFileSync(target, JSON.stringify(entry) + "\n", "utf8");
    // 落盘成功后才记去重，避免"记了却没写"造成永久丢条。
    if (messageId) rememberMessageId(dedupeScope, messageId, nowMs);
    return true;
  } catch (err) {
    console.warn(LOG, "落盘失败:", err instanceof Error ? err.message : err);
    return false;
  }
}

// ── 只读统计（唯一会碰语料文件的地方，**仅供测试与人工排查**）──────
//
// ⚠️ 生产链路不得调用。这里读文件是为了让测试能断言"确实写进去了"，
//    以及将来排查"到底攒了多少"。不存在任何把它接进 prompt 的用法。

export interface GroupCorpusStat {
  folder: string;
  /** 群号或对方 QQ 号。 */
  groupId: string;
  /**
   * 会话类型。
   *
   * ⚠️ 由**第一行正文**的 `kind` 字段判定，不是猜目录名：私聊若带了昵称，
   * 目录会是 `<id>__<昵称>`，靠后缀猜会把它误判成群。
   * 目录里一行都没有（或首行是旧格式）时取 `unknown`。
   */
  kind: CorpusChatKind | "unknown";
  lines: number;
  bytes: number;
  /** 该文件夹里最早/最晚一条消息的时间（取不到时省略）。 */
  firstAt?: string;
  lastAt?: string;
}

/**
 * 统计各会话语料规模。纯只读，缺失目录返回空数组。
 *
 * 只取每会话**首末两行**解析时间戳，不整文件读入 —— 语料可以很大。
 */
export function corpusStats(root = corpusDir()): GroupCorpusStat[] {
  let folders: string[];
  try {
    folders = fs.readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }

  const stats: GroupCorpusStat[] = [];
  for (const folder of folders) {
    const dir = path.join(root, folder);
    let lines = 0;
    let bytes = 0;
    const files: string[] = [];
    try {
      for (const name of fs.readdirSync(dir)) {
        if (!name.endsWith(".jsonl")) continue;
        const filePath = path.join(dir, name);
        const stat = fs.statSync(filePath);
        bytes += stat.size;
        lines += fs.readFileSync(filePath, "utf8").split("\n").filter((line) => line.length > 0).length;
        files.push(filePath);
      }
    } catch {
      continue;
    }
    const edges = files
      .sort()
      .map((filePath) => readEdges(filePath))
      .filter((value): value is CorpusEdges => value !== null);
    stats.push({
      folder,
      groupId: folderIdOf(folder),
      // 取第一个有 kind 的文件（按文件名升序，即最早那天）的判定结果
      kind: edges.find((edge) => edge.kind !== undefined)?.kind ?? "unknown",
      lines,
      bytes,
      ...(edges.length > 0
        ? { firstAt: edges[0].first, lastAt: edges[edges.length - 1].last }
        : {}),
    });
  }
  return stats;
}

interface CorpusEdges {
  first: string;
  last: string;
  /** 首行声明的会话类型；旧格式（无 `kind` 字段）时为 undefined。 */
  kind?: CorpusChatKind;
}

function readEdges(filePath: string): CorpusEdges | null {
  try {
    const rows = fs.readFileSync(filePath, "utf8").split("\n").filter((line) => line.length > 0);
    if (rows.length === 0) return null;
    const first = JSON.parse(rows[0]) as { t?: unknown; kind?: unknown };
    const last = JSON.parse(rows[rows.length - 1]) as { t?: unknown };
    if (typeof first.t !== "string" || typeof last.t !== "string") return null;
    const kind = first.kind === "group" || first.kind === "private" ? first.kind : undefined;
    return {
      first: first.t,
      last: last.t,
      ...(kind ? { kind } : {}),
    };
  } catch {
    return null;
  }
}
