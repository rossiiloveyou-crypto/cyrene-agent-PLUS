// channels/history-log —— 渠道侧每个会话的对话历史 (滑窗 + 群上下文用).
//
// 每个 sessionId 对应 userData/channels/history/<sessionId>.jsonl
// 读取按需扫描文件尾部, append 时只追加. 文件按 MAX_LINES 截断防膨胀.
// 截断丢掉的老行会先按月追加到 userData/channels/archive/<sessionId>/<YYYY-MM>.jsonl
// (温层归档: 只保证原文不丢, 不参与 prompt, 仅供将来的导出/翻查).
//
// 数据流:
//   dispatcher.handleIncoming 入站/出站 → appendHistory(sessionId, role, content)
//   dispatcher.handleIncoming 下一轮进 → loadRecentHistory(sessionId, 16) 拉最近 16 条
//   NapCatAdapter 群聊旁听 → appendHistory(sessionId, "user", text, {speakerId, triggered:false})
//   orchestrator.buildAlwaysOnContext 群聊 → buildGroupContextBlock(sessionId, 10) 补话题上下文
//
// 结构化字段 (speakerId / speakerName / isBot / triggered) 只对群聊有值:
// 群聊里"谁说的"和"有没有在叫昔涟"是理解上下文的关键, 不能再靠硬拼正文前缀表达.
// 旧记录 (正文含 [群聊发送者：xxx] 前缀) 在读取时自动还原成结构化字段, 无需数据迁移.
//
// 消息 id (Phase 3 P1 引入):
//   每条新写入的消息带 `id: msg_<ts>_<rand6>`, 用途是让长期记忆 (L2) 的
//   `sourceMessageIds` 能指回"这条记忆是从哪句话来的". 桌面对话消息本来就有 uuid,
//   渠道 transcript 之前是缺口, P1 补上.
//   老记录没有 id (磁盘上确实存在这种行), 所以 HistoryEntry.id 是可选字段;
//   写入方要强类型就用 appendHistory 的返回类型 PersistedHistoryEntry.
//   ⚠️ id 由 appendHistory 生成, 调用方不得通过 meta 提供 (见 HistoryEntryMeta).
//
// 跟 message-log 的区别:
//   message-log 是"运营可见"的人类可读日志 (UI 显示给人看)
//   history-log 是 agent 喂的"对话上下文", LLM 需要, 机器格式
//
// 跟 RAG 索引 (indexConversationTurn) 的区别:
//   RAG 是语义检索 (cosine similarity), 长期持久
//   history-log 是精确窗口 (sliding window), 短期明确
import * as fs from "fs";
import * as path from "path";
import { app } from "electron";

const LOG = "[ChannelHistory]";

/** 一条消息: 谁说的 + 内容 + 时间戳 ISO */
export interface HistoryEntry {
  /**
   * 消息稳定标识 (Phase 3 P1 引入), 形如 `msg_1758681234567_a3f9k2`.
   *
   * 可选是因为本阶段之前写入的老行没有这个字段 (`JSON.parse` 出来的对象就是没有),
   * 类型必须诚实反映磁盘现状. 需要"一定有 id"时用 PersistedHistoryEntry.
   */
  id?: string;
  /** 发言者的平台 ID (QQ 号 / openid). 群聊必填, 私聊可选 */
  speakerId?: string;
  /** 发言者昵称 (可选) */
  speakerName?: string;
  /** 是否是昔涟自己 (role === "assistant" 时固定为 true) */
  isBot?: boolean;
  /** 这条消息是否触发了昔涟回复 (只有 @ / 触发词才为 true; 旁听消息为 false) */
  triggered?: boolean;

  role: "user" | "assistant";
  content: string;
  at: string;
}

/** 已落盘的消息 (id 保证存在). appendHistory 的返回类型. */
export type PersistedHistoryEntry = HistoryEntry & { id: string };

/**
 * 除必填字段与 id 外的结构化元信息.
 *
 * ⚠️ 必须显式排除 `id`: 否则 Omit 会自动带上 `id?: string`, 调用方就能伪造或复用 id,
 * 而这条防线一旦漏掉**不会报错**, 只是静默失效.
 */
export type HistoryEntryMeta = Omit<HistoryEntry, "id" | "role" | "content" | "at">;

const MAX_FILE_LINES = 200; // 最近 200 条, 远大于滑动窗口 16

/**
 * 旧格式 content 前缀解析。
 *
 * 真实写入格式（channel-context.formatChannelUserText）:
 *   @ 触发     : `[群聊发送者：小明 (10001)]\n你好`
 *   触发词触发 : `[群聊发送者：小明 (10001)]\n[本条消息命中触发关键词（未 @ 你），按约定需要你回复]\n你好`
 *   带引用     : `[群聊发送者：小明 (10001)]\n引用 小红：前一条\n你好`
 *
 * 另兼容历史遗留标记 `(@昔涟)` / `(触发词)`（当前生产代码不产生，但旧数据可能有）。
 * 只负责"剥前缀"，不负责拆名字里的 QQ 号——拆号在 parseLegacySender 里做。
 *
 * ⚠️ 昵称捕获组不能用 `[^\]\n]+`：QQ 昵称可以含 `]`（如 `[b°t]BEIKIA`），
 * 那样会在昵称内部的 `]` 上收尾，speakerName 只剩 `[b°t`，
 * 而 `BEIKIA (2914636187)]\n111` 这种残片会被当成正文留给模型。
 * 这里把「分隔 `]`」锚定成"行尾 / `(数字)` / legacy 标记之前"（lookahead 不消费），
 * 昵称内部的 `]` 不满足锚点会被跳过；惰性 `[^\n]{0,300}?` 保证正常昵称仍在第一个 `]` 收尾。
 */
const LEGACY_SPEAKER_PREFIX =
  /^\[群聊发送者：([^\n]{0,300}?)\](?=\n|$|\(\d{1,32}\)|\(@昔涟\)|\(触发词\))\n?(?:\((?:@昔涟|触发词)\)\n?)?(?:\[本条消息命中触发关键词[^\]]*\]\n?)?/;

/** 把 `小明 (10001)` 拆成 { name: "小明", id: "10001" }；拆不开时 name = 原串。 */
function parseLegacySender(raw: string): { name: string; id?: string } {
  const m = raw.match(/^(.*?)\s*\((\d+)\)$/);
  if (m) return { name: m[1].trim(), id: m[2] };
  return { name: raw.trim() };
}

/** 把一条磁盘记录归一化成结构化条目: 兼容旧格式前缀. */
function normalizeEntry(entry: HistoryEntry): HistoryEntry {
  // 新格式（写入时已结构化）不需要解析正文前缀。
  if (entry.speakerId) return { ...entry };

  const match = entry.content.match(LEGACY_SPEAKER_PREFIX);
  if (!match) return { ...entry };

  const sender = parseLegacySender(match[1]);
  const normalized: HistoryEntry = { ...entry };
  normalized.speakerName = normalized.speakerName ?? sender.name;
  if (sender.id) normalized.speakerId = sender.id;
  // 命中"关键词提示行"或遗留 `(触发词)` 标记才判定为触发；
  // @ 触发的旧记录正文里没有任何标记，无法推断，保持 undefined（会被归入滑动窗口）。
  const hadKeywordNote = /\[本条消息命中触发关键词/.test(match[0]);
  const hadLegacyMarker = /\((?:@昔涟|触发词)\)/.test(match[0]);
  const triggered = hadKeywordNote || hadLegacyMarker;
  normalized.triggered = normalized.triggered ?? (triggered ? true : undefined);
  normalized.content = entry.content.slice(match[0].length) || entry.content;
  return normalized;
}

/** 历史读取的过滤条件。两个开关互斥，同时为真时 observedOnly 优先。 */
export interface HistoryQuery {
  /**
   * 只取正式对话轮：assistant，或 triggered !== false 的 user。
   * 群聊滑动窗口用它，避免与【群聊近期上下文】块重复注入同一批消息。
   * 私聊消息的 triggered 为 undefined，因此不受影响（全部保留）。
   */
  conversationOnly?: boolean;
  /** 只取旁听消息：role === "user" 且 triggered === false。 */
  observedOnly?: boolean;
}

/** 按 HistoryQuery 过滤条目；未给 query 时原样返回。 */
function filterHistory(entries: HistoryEntry[], query?: HistoryQuery): HistoryEntry[] {
  if (!query) return entries;
  if (query.observedOnly) {
    return entries.filter((e) => e.role === "user" && e.triggered === false);
  }
  if (query.conversationOnly) {
    return entries.filter((e) => e.role === "assistant" || e.triggered !== false);
  }
  return entries;
}

function dir(): string {
  return path.join(app.getPath("userData"), "channels", "history");
}

/** sessionId 可能不安全做文件名, 用 sha256 hex 兜底. dispatcher 给的已是 hash+prefix 形式也 OK. */
function safeName(sessionId: string): string {
  // dispatcher 的 sessionId 形如 "channel:feishu:e72a9d...", 替换 : 为 _ 即可
  return sessionId.replace(/[:/\\<>:"|?*]/g, "_");
}

/**
 * sessionId → transcript 文件名主干（不含 `.jsonl`）。**导出是为了避免两处漂移**：
 * 按人擦除要把"名册里的 sessionId"对到"磁盘上的文件名"，如果调用方自己写一遍
 * `replace(/:/g, "_")`，哪天 `safeName` 的规则变了两边就会静默错位（§2.4）。
 */
export function transcriptFileBase(sessionId: string): string {
  return safeName(sessionId);
}

function filePath(sessionId: string): string {
  return path.join(dir(), `${safeName(sessionId)}.jsonl`);
}

/** 温层归档目录：按会话分文件夹。 */
function archiveDir(sessionId: string): string {
  return path.join(app.getPath("userData"), "channels", "archive", safeName(sessionId));
}

function archiveFilePath(sessionId: string, month: string): string {
  return path.join(archiveDir(sessionId), `${month}.jsonl`);
}

/** 从一行 JSONL 里取 `YYYY-MM`；取不到归入 "unknown"。 */
function monthOf(line: string): string {
  try {
    const at = (JSON.parse(line) as { at?: unknown }).at;
    if (typeof at === "string") {
      const m = at.slice(0, 7);
      if (/^\d{4}-\d{2}$/.test(m)) return m;
    }
  } catch {
    /* 落到 unknown */
  }
  return "unknown";
}

/**
 * 把被截断的行按月份追加到温层归档。
 *
 * 调用约定：**必须在截断热文件之前调用，且让异常向上抛**——
 * 归档失败时要放弃本次截断（宁可热文件胖一点，也不能丢原文）。
 */
function appendToArchive(sessionId: string, dropped: readonly string[]): void {
  const byMonth = new Map<string, string[]>();
  for (const line of dropped) {
    if (!line) continue; // split("\n") 会带出末尾空串
    const month = monthOf(line);
    const bucket = byMonth.get(month);
    if (bucket) bucket.push(line);
    else byMonth.set(month, [line]);
  }
  if (byMonth.size === 0) return;
  for (const [month, lines] of byMonth) {
    const fp = archiveFilePath(sessionId, month);
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.appendFileSync(fp, lines.join("\n") + "\n", "utf8");
  }
}

/** 列出某会话已归档的月份（升序，形如 ["2026-09","2026-10"]）。 */
export function listArchiveMonths(sessionId: string): string[] {
  try {
    const dirPath = archiveDir(sessionId);
    if (!fs.existsSync(dirPath)) return [];
    return fs.readdirSync(dirPath)
      .filter((n) => n.endsWith(".jsonl"))
      .map((n) => n.replace(/\.jsonl$/, ""))
      .sort();
  } catch {
    return [];
  }
}

/**
 * 读取某会话某月的归档（按写入顺序 = 时间顺序）。
 * 只给"人"用（导出/翻查）；**不要**把它接进 buildAlwaysOnContext。
 */
export function loadArchivedHistory(sessionId: string, month: string): HistoryEntry[] {
  const fp = archiveFilePath(sessionId, month);
  if (!fs.existsSync(fp)) return [];
  try {
    return fs.readFileSync(fp, "utf8")
      .split("\n")
      .filter((l) => l.length > 0)
      .map((line) => {
        try {
          return normalizeEntry(JSON.parse(line) as HistoryEntry);
        } catch {
          return null;
        }
      })
      .filter((e): e is HistoryEntry =>
        e !== null && (e.role === "user" || e.role === "assistant"));
  } catch {
    return [];
  }
}

/**
 * 生成消息稳定标识.
 *
 * 格式 `msg_<ts>_<rand6>`, 与 memory.json 的 `l2_` / `ev_` / `ent_` 风格保持一致
 * (见 memory-store.ts / entity-graph.ts / zone-store.ts), 短且日志里一眼可辨.
 * 纯函数: 给定 now 即确定前缀, 随机部分由 Math.random 提供.
 *
 * 唯一性: transcript 是单进程串行追加, rand6 的 base36 空间约 2.1e9,
 * 同一毫秒内写两条并碰撞的概率可忽略.
 */
export function createMessageId(now = Date.now()): string {
  return `msg_${now}_${Math.random().toString(36).slice(2, 8)}`;
}

/** 追加一条. role 只能是 user/assistant (dispatcher 内部强制).
 *  meta 承载结构化字段 (说话人 / 是否触发); 只写有值的字段, 保持旧记录可读.
 *  返回落盘的消息对象 (含 id); 未落盘时返回 null. */
export function appendHistory(
  sessionId: string,
  role: "user" | "assistant",
  content: string,
  meta?: HistoryEntryMeta,
): PersistedHistoryEntry | null {
  if (!sessionId || !content) return null;
  // 只写有值的字段：undefined 不落盘，旧读取端不会看到一堆 null。
  // id 只在这里生成：meta 里即便混进 id 也不会被采纳（HistoryEntryMeta 类型上已排除）。
  const entry: PersistedHistoryEntry = {
    id: createMessageId(),
    role,
    content,
    at: new Date().toISOString(),
    ...(meta?.speakerId !== undefined && { speakerId: meta.speakerId }),
    ...(meta?.speakerName !== undefined && { speakerName: meta.speakerName }),
    ...(meta?.isBot !== undefined && { isBot: meta.isBot }),
    ...(meta?.triggered !== undefined && { triggered: meta.triggered }),
  };
  const fp = filePath(sessionId);

  // ① 落盘：失败则本条消息不存在，返回 null。
  //    不能让下游拿到悬空指针——P3 按 id 擦除时无法区分"已经删干净"和"从来就没有"。
  try {
    fs.mkdirSync(dir(), { recursive: true });
    fs.appendFileSync(fp, JSON.stringify(entry) + "\n", "utf8");
  } catch (err) {
    console.warn(LOG, "appendHistory 落盘失败:", sessionId, err instanceof Error ? err.message : err);
    return null;
  }

  // ② 截断 + 归档：此刻消息已经在磁盘上了，失败不回滚、也不吞掉 id。
  //    先归档、后截断。appendToArchive 抛错就被这里接住，
  //    结果是"加了新行、但没截断"——热文件暂时变长，下次 append 再试。绝不丢原文。
  try {
    // 文件过大时截断 (只留最后 MAX_FILE_LINES 行)
    const buf = fs.readFileSync(fp, "utf8");
    const lines = buf.split("\n");
    if (lines.length > MAX_FILE_LINES + 1) {
      const cut = lines.length - MAX_FILE_LINES;
      const dropped = lines.slice(0, cut);
      const trimmed = lines.slice(cut).join("\n");
      appendToArchive(sessionId, dropped);
      fs.writeFileSync(fp, trimmed.endsWith("\n") ? trimmed : trimmed + "\n", "utf8");
    }
  } catch (err) {
    console.warn(LOG, "appendHistory 截断失败:", sessionId, err instanceof Error ? err.message : err);
  }

  return entry;
}

/** 读最近 N 条历史, 按时间顺序 (旧 → 新). 旧格式记录会被归一化.
 *  query 用于按"正式对话轮 / 旁听"分流; 先过滤再截断, 保证拿到最后 N 条该类消息. */
export function loadRecentHistory(
  sessionId: string,
  limit: number,
  query?: HistoryQuery,
): HistoryEntry[] {
  if (!sessionId || limit <= 0) return [];
  const fp = filePath(sessionId);
  if (!fs.existsSync(fp)) return [];
  try {
    const buf = fs.readFileSync(fp, "utf8");
    const lines = buf.split("\n").filter((l) => l.length > 0);
    const parsed: HistoryEntry[] = [];
    for (const line of lines) {
      try {
        const e = JSON.parse(line) as HistoryEntry;
        if (e && (e.role === "user" || e.role === "assistant") && typeof e.content === "string") {
          parsed.push(normalizeEntry(e));
        }
      } catch {
        /* skip bad line */
      }
    }
    // 先过滤再截断：保证拿到"最后 N 条该类消息"（刷屏群不会挤掉正式轮）
    return filterHistory(parsed, query).slice(-limit);
  } catch (err) {
    console.warn(LOG, "loadRecentHistory 失败:", sessionId, err instanceof Error ? err.message : err);
    return [];
  }
}

/**
 * 把最近 N 条群消息渲染成注入用的上下文块.
 *
 * 与 loadRecentHistory 的分工: 本函数只负责"给人/给模型看的排版",
 * 读取 + 归一化仍在 loadRecentHistory, 保证旁听消息与正式历史用同一份数据源.
 * 无有效记录时返回 null, 调用方据此决定是否注入.
 */
export function buildGroupContextBlock(sessionId: string, limit = 10): string | null {
  // 只取旁听消息（没在叫昔涟的群友发言）。
  // 被叫起来的轮次 + 昔涟的回复走滑动窗口，不在这里重复出现。
  const entries = loadRecentHistory(sessionId, limit, { observedOnly: true });
  if (entries.length === 0) return null;

  const lines = entries.map((entry) => {
    // 防御分支：observedOnly 已排除 assistant，保留以防未来复用本函数。
    if (entry.role === "assistant") return `[昔涟]: ${entry.content}`;
    const speaker = entry.speakerName || entry.speakerId || "用户";
    return `[${speaker}]: ${entry.content}`;
  });

  return [
    "【群聊近期上下文】",
    `以下是你没被叫到时，群里最近的 ${entries.length} 条发言，供你理解当前话题的来龙去脉：`,
    ...lines,
  ].join("\n");
}

/** 旧版历史迁移：sessionId 键控从 senderId 改为 chatId（QQ 群聊需要按会话聚合）后，
 *  飞书 p2p 的 chatId(oc_xxx) 与 senderId(ou_xxx) 属于不同 ID 空间，老用户升级后
 *  按新键找不到旧滑窗文件。这里一次性把旧文件 copy 到新键（保留原文件兜底），
 *  已存在新文件时不覆盖，保证幂等。 */
export function migrateHistory(fromSessionId: string, toSessionId: string): void {
  if (!fromSessionId || !toSessionId || fromSessionId === toSessionId) return;
  const from = filePath(fromSessionId);
  const to = filePath(toSessionId);
  try {
    if (!fs.existsSync(from) || fs.existsSync(to)) return;
    fs.mkdirSync(dir(), { recursive: true });
    fs.copyFileSync(from, to);
  } catch (err) {
    console.warn(LOG, "migrateHistory 失败:", fromSessionId, "->", toSessionId, err instanceof Error ? err.message : err);
  }
}

/** 启动时所有 session 文件预读 (可选, dispatcher 用不到, 预留给将来的调试 UI). */
export function reloadAllHistory(): Map<string, HistoryEntry[]> {
  const out = new Map<string, HistoryEntry[]>();
  try {
    fs.mkdirSync(dir(), { recursive: true });
    for (const name of fs.readdirSync(dir())) {
      if (!name.endsWith(".jsonl")) continue;
      const sid = name.replace(/\.jsonl$/, "").replace(/_/g, ":");
      // 不尝试反推回原 sessionId, 这里只是占位接口, 后续可优化
      out.set(sid, loadRecentHistory(sid, MAX_FILE_LINES));
    }
  } catch {
    /* ignore */
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 3 P3：按人擦除 transcript 用的同步原语
//
// ⚠️ **本节的每个函数都必须是同步的**（P3 §0.4 约束 4）。
// `appendHistory` 内部是 `appendFileSync` + `readFileSync` + `writeFileSync`，零 `await`；
// 因此只要"逐行过滤重写"也是"读→过滤→写"的纯同步函数，Node 单线程就**不可能**在中间
// 让出执行权，也就不会被并发 append 打断。
//
// **一旦在这里引入 `await`（例如 for-await 逐文件处理），保证立刻失效** ——
// 会退化成"读旧文件 → 别人追加 → 覆盖写回 → 丢消息"的经典竞态，且丢的是真实聊天记录。
// ─────────────────────────────────────────────────────────────────────────────

/** 一个 transcript 文件的位置描述。 */
export interface TranscriptFileRef {
  /** 绝对路径。 */
  file: string;
  /** 文件名去掉 `.jsonl`；归档层是**会话目录名**（不是文件名）。 */
  fileBase: string;
  layer: "hot" | "archive";
  /** 仅归档层有值：`YYYY-MM`。 */
  month?: string;
}

function archiveRoot(): string {
  return path.join(app.getPath("userData"), "channels", "archive");
}

/**
 * 列出全部 transcript 文件（热层 + 归档），同步。
 *
 * ⚠️ 这是本阶段唯一"扫全量文件"的地方（P3 §3.5）：每次擦除都要遍历
 * `channels/history/` 与 `channels/archive/` 的全部文件。当前量级（热层每会话 ≤200 行、
 * 归档按月分片）在**同步 IO 的一个 tick 内**即可完成。
 * **如果将来会话数上到万级，这里要改成先按渠道筛文件再处理。**
 */
export function listTranscriptFiles(): TranscriptFileRef[] {
  const out: TranscriptFileRef[] = [];
  try {
    for (const name of fs.readdirSync(dir())) {
      if (!name.endsWith(".jsonl")) continue;
      out.push({ file: path.join(dir(), name), fileBase: name.replace(/\.jsonl$/, ""), layer: "hot" });
    }
  } catch {
    /* 目录不存在 = 没有热层文件 */
  }
  try {
    for (const entry of fs.readdirSync(archiveRoot(), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const sessionDir = path.join(archiveRoot(), entry.name);
      let months: string[] = [];
      try {
        months = fs.readdirSync(sessionDir);
      } catch {
        continue;
      }
      for (const monthFile of months) {
        if (!monthFile.endsWith(".jsonl")) continue;
        out.push({
          file: path.join(sessionDir, monthFile),
          fileBase: entry.name,
          layer: "archive",
          month: monthFile.replace(/\.jsonl$/, ""),
        });
      }
    }
  } catch {
    /* 没有归档目录 */
  }
  return out;
}

/**
 * 文件名 → sessionId（**权威名册优先**，正则退化）。
 *
 * `safeName()` 把 `:` 换成 `_`，而渠道 id 本身允许含 `_`（`isChannelId` 只要求
 * `^[a-z][a-z0-9_-]{0,31}$`），所以 `name.replace(/_/g, ":")` 那种反推是**有损的猜测**
 * （`reloadAllHistory` 里就留着这个 bug）。这里：
 *
 * 1. 先查 `known`（调用方给的名册：`safeName(sessionId) → sessionId`）—— 权威；
 * 2. 退化：严格匹配 `channel_<渠道名>_<16位hex>` 且渠道名**不含下划线**时，可安全还原；
 * 3. 都不匹配 → `null`（预演里列为「无法识别来源的 transcript 文件」，**不处理**）。
 */
export function sessionIdFromFileName(fileBase: string, known: ReadonlyMap<string, string>): string | null {
  const authoritative = known.get(fileBase);
  if (authoritative) return authoritative;
  const m = /^channel_([a-z][a-z0-9]*)_([0-9a-f]{16})$/.exec(fileBase);
  if (!m) return null;
  return `channel:${m[1]}:${m[2]}`;
}

/**
 * 逐行过滤重写一个 transcript 文件。**同步**（见本节顶部约束）。
 *
 * - `keep` 的入参是解析后的 `HistoryEntry`（判定要看 `speakerId`），但写回的是**原始行**，
 *   别人那几行的字节不会被改写；
 * - **解析失败的行原样保留** —— 绝不因为一行坏 JSON 丢掉数据；
 * - 写回以 `\n` 结尾，与 `appendHistory` 的格式一致；过滤后为空则留下一个**空文件**
 *   （而不是删文件），以免 `loadRecentHistory` 的 `existsSync` 早退行为发生变化；
 * - **不做 legacy 正文前缀反推**（P3 §2.5 约束 2）：只按结构化 `speakerId` 判定，
 *   写入侧不复制 `normalizeEntry` 那套启发式 —— 猜错的代价是删掉别人的话。
 * - `keep` 的第二个入参是**上一行的解析结果**（原始文件顺序，坏行为 `null`）。
 *   擦除要用它做"轮次配对"：她对他那句话的回复里**可能一个字都不提他**（D5，见
 *   `transcript-erasure.ts` 文件头），只按正文匹配删不掉，必须知道"她在回谁"。
 */
export function filterTranscriptFile(
  file: string,
  keep: (entry: HistoryEntry, previous: HistoryEntry | null) => boolean,
): { total: number; kept: number; removed: number } {
  let buf: string;
  try {
    buf = fs.readFileSync(file, "utf8");
  } catch {
    return { total: 0, kept: 0, removed: 0 };
  }
  const lines = buf.split("\n").filter((line) => line.length > 0);
  const keptLines: string[] = [];
  let previous: HistoryEntry | null = null;
  for (const line of lines) {
    let entry: HistoryEntry | null = null;
    try {
      entry = JSON.parse(line) as HistoryEntry;
    } catch {
      entry = null;
    }
    // 坏行（entry === null）无条件保留。
    if (entry === null || keep(entry, previous)) keptLines.push(line);
    // `previous` 跟踪的是**原始文件**里的上一行（含将被删掉的那些）——
    // 配对判据要的正是"她的回复跟在谁后面"，而不是"跟在哪个幸存者后面"。
    if (entry !== null) previous = entry;
  }
  const removed = lines.length - keptLines.length;
  if (removed > 0) {
    fs.writeFileSync(file, keptLines.length > 0 ? keptLines.join("\n") + "\n" : "", "utf8");
  }
  return { total: lines.length, kept: keptLines.length, removed };
}

/**
 * 整个会话删除（热层文件 + 归档目录）。用于**他的私聊**（P3 §2.5）。
 *
 * 私聊 = 一对一，整个文件都是他；而私聊行**没有 `speakerId`**（`channel-context.ts`
 * 对非群聊传 `meta = undefined`，见总览 §4.3），逐行过滤根本匹配不到，
 * 所以只有"整会话删"这一条路。
 */
export function removeTranscriptSession(sessionId: string): { hot: boolean; archiveDir: boolean } {
  const hotPath = filePath(sessionId);
  const archivedPath = archiveDir(sessionId);
  const hot = fs.existsSync(hotPath);
  const archiveDirExisted = fs.existsSync(archivedPath);
  if (hot) fs.rmSync(hotPath, { force: true });
  if (archiveDirExisted) fs.rmSync(archivedPath, { recursive: true, force: true });
  return { hot, archiveDir: archiveDirExisted };
}

/**
 * 删掉归档根下**已经空了**的会话目录，返回删掉的目录数。同步。
 *
 * 群聊侧过滤后如果某会话的归档文件全被清空，会留下一个空目录（文件本身保留，
 * 见 `filterTranscriptFile` 的注释）；这里做收尾，纯属整洁，不影响任何读取行为。
 */
export function pruneEmptyArchiveDirs(): number {
  let removed = 0;
  let names: string[] = [];
  try {
    names = fs.readdirSync(archiveRoot());
  } catch {
    return 0;
  }
  for (const name of names) {
    const dirPath = path.join(archiveRoot(), name);
    try {
      if (!fs.statSync(dirPath).isDirectory()) continue;
      if (fs.readdirSync(dirPath).length > 0) continue;
      fs.rmSync(dirPath, { recursive: true, force: true });
      removed += 1;
    } catch {
      /* 单个目录失败不影响其余 */
    }
  }
  return removed;
}