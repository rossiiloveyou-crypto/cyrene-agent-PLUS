/**
 * Transcript Erasure —— 按人清掉渠道 transcript（P3 §2.5 / §3.5）。
 *
 * ## 两种形态，取决于会话类型
 *
 * | 会话类型 | 判定 | 动作 | 为什么 |
 * |---|---|---|---|
 * | **私聊（他的）** | 会话 ∈ `privateSessions` | **整会话删除**（热层文件 + 归档目录整个 `rmSync`） | 私聊是一对一，整个文件都是他；而且私聊行**没有 `speakerId`**，逐行过滤根本匹配不到（总览 §4.3） |
 * | **群聊** | `speakerId` 匹配 | **逐行过滤重写**（热层 + 每个月文件） | 群里还有别人的话，删文件会连累别人 |
 *
 * ## 四条必须遵守的约束（§2.5）
 *
 * 1. **连她自己"复述"他的行也删** —— 这条**反转了 §2.5 约束 1 的原决策**（§5.2 第 7 步加测抓到 D5 后）。
 *    原决策是"不删 assistant 行，接受残留"；但实测她自己的回复会**逐字复述被擦者的信息**，
 *    例如 `学做菜好呀！以后搬去杭州就能自己开小灶啦♪` —— 而这些行**每一轮都进上下文窗口**，
 *    于是擦除后她仍能答出"他已经删掉的经历"，第 7 步的"完全不认识"因此不成立（证据链见 P3 §9.3c 第 21 条）。
 *    现行判据：**只在他真正说过话的会话里**，按"内容含他的任一别名"删 assistant 行。
 *    ⚠️ **限定会话**是硬要求：否则"他从未出现过的群"里别人叫同一个名字时会被误删。
 * 2. **不做通配文本匹配**。他的行只按 `speakerId`（结构化字段）匹配；`assistantMentionsPerson`
 *    是唯一一处文本级判据，且只用于 assistant 行。legacy 行由 `normalizeEntry` 在**读取时**反推。
 * 3. **重写必须是纯同步函数**（§0.4 约束 4）——本文件**不许出现 `await`**。
 * 4. **顺手收集「被删掉的 user 行正文」**（`removedUserTexts`）——它是关系日志存量
 *    指纹匹配（§2.10 第 3 步）的输入，不在这里收集就得回头再扫一遍文件。
 *
 * 🚫 **本文件不碰群聊语料**（`group-corpus/`）：既不读也不写也不删，连它的路径字面量
 * 都不出现（§0.4 约束 2）。擦除范围里唯一"有意保留"的载体就是它。
 */

import * as fs from "node:fs";
import {
  type HistoryEntry,
  filterTranscriptFile,
  listTranscriptFiles,
  pruneEmptyArchiveDirs,
  removeTranscriptSession,
  sessionIdFromFileName,
} from "./history-log";

/** 收集进 `removedUserTexts` 的正文长度上限（§2.5 约束 4）。 */
const REMOVED_TEXT_MAX = 200;

/**
 * assistant 行是否"复述了这个人"（按别名做子串匹配）。
 *
 * **这是全仓唯一一处文本级删除判据**（`filterTranscriptFile` 的谓词里用），
 * 只在 assistant 行上生效，且只在"他真正说过话的会话"里生效（见文件头约束 1）。
 * 预演（`scanPersonTranscripts`）与执行（`erasePersonTranscripts`）共用它，
 * 两边的数字才会同源。
 */
export function assistantMentionsPerson(content: unknown, names: readonly string[]): boolean {
  if (typeof content !== "string" || content.length === 0) return false;
  for (const name of names) {
    if (name && content.includes(name)) return true;
  }
  return false;
}

/**
 * 一行是不是"她对他那句话的回复"（轮次配对，D5 的第二条判据）。
 *
 * ⚠️ **只按名字匹配是不够的** —— 实测泄漏的那一行是
 * `学做菜好呀！以后搬去杭州就能自己开小灶啦♪`：**一个字都没提他**，
 * 但它就是对他「我最近在学做菜」的回复，也是她后来照答"他在学做菜"的来源。
 * 所以判据是"**上一行是不是他说的**"。
 */
function isReplyToPerson(previous: HistoryEntry | null, senderId: string): boolean {
  return previous !== null && previous.speakerId === senderId;
}

/** 会话 id 的渠道前缀；解析不出渠道的会话一律跳过（不猜）。 */
function channelOfSession(sessionId: string): string | null {
  const m = /^channel:([^:]+):/.exec(sessionId);
  return m ? m[1] : null;
}

interface ScannedFile {
  file: string;
  fileBase: string;
  sessionId: string;
  layer: "hot" | "archive";
  month?: string;
  total: number;
  matched: number;
  /** 会被一起删掉的「她复述他」的 assistant 行数（D5；只在他说话过的会话里统计）。 */
  assistant: number;
}

function readFileLines(file: string): Array<{ raw: string; entry: HistoryEntry | null }> {
  let buf: string;
  try {
    buf = fs.readFileSync(file, "utf8");
  } catch {
    return [];
  }
  const out: Array<{ raw: string; entry: HistoryEntry | null }> = [];
  for (const line of buf.split("\n")) {
    if (line.length === 0) continue;
    let entry: HistoryEntry | null = null;
    try {
      entry = JSON.parse(line) as HistoryEntry;
    } catch {
      entry = null;
    }
    out.push({ raw: line, entry });
  }
  return out;
}

/**
 * 扫描全量 transcript，找出目标渠道里"含他的行"的会话。
 *
 * @returns 除文档 §3.5 约定的四个字段外，额外给出 `bySession` —— 预演报告需要
 *          **按会话**展示 `hotLines / archiveLines / archiveMonths`，扫描时顺手算掉，
 *          免得预演阶段再扫第二遍。
 */
export interface TranscriptScanResult {
  /** 含他的行的会话（升序去重）。 */
  sessions: string[];
  hotLines: number;
  archiveLines: number;
  unknownFiles: string[];
  /**
   * 他的行上出现过的 `speakerName`（去重保序）。
   *
   * 这是「已知名字集合」的三条来源之一（§2.9）：群里大家怎么喊他，只有 transcript 里
   * 最准。**刻意不读群聊语料**去拿昵称 —— 读语料会破坏"零消费方"守卫（§0.4 约束 2）。
   */
  speakerNames: string[];
  /**
   * 预演版的「将被删掉的 user 行正文」（去重、截断 200 字）。
   *
   * 与 `erasePersonTranscripts` 产出的 D 集合**同一套规则**（群聊取 `speakerId` 命中的
   * user 行；私聊整会话，取全部 user 行），这样预演报告里的
   * `relationshipEntries.byTextFingerprint` 与实际执行结果才会一致。
   */
  removedUserTexts: string[];
  /**
   * 会被一起删掉的「她复述他」的 assistant 行数（D5）。
   *
   * 判据与执行侧同源（`assistantMentionsPerson` + "只在他说话过的会话里"），
   * 所以预演报的数字与执行结果一致。
   */
  assistantLines: number;
  /** 按会话汇总（含私聊），供预演报告使用。 */
  bySession: Array<{
    sessionId: string;
    hotLines: number;
    archiveLines: number;
    archiveMonths: number;
    assistantLines: number;
  }>;
}

function scanFiles(input: {
  channel: string;
  senderId: string;
  known: ReadonlyMap<string, string>;
  privateSessions: ReadonlySet<string>;
  /** 他的别名集合；为空时**不做** assistant 行统计（连她复述的行都不认）。 */
  knownNames?: readonly string[];
}): { files: ScannedFile[]; unknownFiles: string[]; speakerNames: string[]; removedUserTexts: string[] } {
  const files: ScannedFile[] = [];
  const unknownFiles: string[] = [];
  const speakerNames: string[] = [];
  const removedUserTexts: string[] = [];
  const seenNames = new Set<string>();
  const seenTexts = new Set<string>();
  const names = input.knownNames ?? [];
  const collectText = (content: unknown, role: unknown): void => {
    if (role !== "user") return;
    if (typeof content !== "string" || content.length === 0) return;
    const text = content.length > REMOVED_TEXT_MAX ? content.slice(0, REMOVED_TEXT_MAX) : content;
    if (seenTexts.has(text)) return;
    seenTexts.add(text);
    removedUserTexts.push(text);
  };

  for (const ref of listTranscriptFiles()) {
    const sessionId = sessionIdFromFileName(ref.fileBase, input.known);
    if (!sessionId) {
      unknownFiles.push(ref.file);
      continue;
    }
    // 跨渠道不会撞 id（sessionId 是 `channel:<ch>:<hash16>`，hash 里已含渠道），
    // 但名册可能给出非本渠道的会话 —— 一律跳过。
    if (channelOfSession(sessionId) !== input.channel) continue;

    const lines = readFileLines(ref.file);
    const isPrivate = input.privateSessions.has(sessionId);
    let matched = 0;
    let assistant = 0;
    for (const { entry } of lines) {
      if (!entry) continue;
      if (isPrivate) {
        // 私聊 = 整个会话都是他（§2.5）：全部行都会被删/被整文件删。
        matched += 1;
        collectText(entry.content, entry.role);
        continue;
      }
      if (entry.speakerId !== input.senderId) continue;
      matched += 1;
      collectText(entry.content, entry.role);
      const name = typeof entry.speakerName === "string" ? entry.speakerName.trim() : "";
      if (name && !seenNames.has(name)) {
        seenNames.add(name);
        speakerNames.push(name);
      }
    }
    // 第一遍确认"他在这个会话里说过话"，第二遍才数她的复述/回复行（顺序不能反）
    if (!isPrivate && matched > 0 && names.length > 0) {
      let previous: HistoryEntry | null = null;
      for (const { entry } of lines) {
        if (!entry) continue;
        if (entry.role === "assistant"
          && (assistantMentionsPerson(entry.content, names) || isReplyToPerson(previous, input.senderId))) {
          assistant += 1;
        }
        previous = entry;
      }
    }
    files.push({
      file: ref.file,
      fileBase: ref.fileBase,
      sessionId,
      layer: ref.layer,
      month: ref.month,
      total: lines.length,
      matched,
      assistant,
    });
  }
  return { files, unknownFiles, speakerNames, removedUserTexts };
}

function summarizeFiles(files: ReadonlyArray<Pick<ScannedFile, "sessionId" | "layer" | "month" | "matched" | "assistant">>): {
  sessions: string[];
  hotLines: number;
  archiveLines: number;
  assistantLines: number;
  bySession: TranscriptScanResult["bySession"];
} {
  const sessionIds = new Set<string>();
  const perSession = new Map<string, { hotLines: number; archiveLines: number; months: Set<string>; assistantLines: number }>();
  let hotLines = 0;
  let archiveLines = 0;
  let assistantLines = 0;
  for (const f of files) {
    if (f.matched <= 0) continue;
    sessionIds.add(f.sessionId);
    let bucket = perSession.get(f.sessionId);
    if (!bucket) {
      bucket = { hotLines: 0, archiveLines: 0, months: new Set(), assistantLines: 0 };
      perSession.set(f.sessionId, bucket);
    }
    bucket.assistantLines += f.assistant;
    assistantLines += f.assistant;
    // ⚠️ `assistant` 也要计入本层行数：执行侧删掉的行数**包含**她的复述/回复行，
    // 预演若只数 `matched` 就会比执行小 —— 两边的数字必须同源（§2.13）。
    if (f.layer === "hot") {
      bucket.hotLines += f.matched + f.assistant;
      hotLines += f.matched + f.assistant;
    } else {
      bucket.archiveLines += f.matched + f.assistant;
      archiveLines += f.matched + f.assistant;
      if (f.month) bucket.months.add(f.month);
    }
  }
  const bySession = [...perSession.entries()]
    .map(([sessionId, bucket]) => ({
      sessionId,
      hotLines: bucket.hotLines,
      archiveLines: bucket.archiveLines,
      archiveMonths: bucket.months.size,
      assistantLines: bucket.assistantLines,
    }))
    .sort((a, b) => (a.sessionId < b.sessionId ? -1 : a.sessionId > b.sessionId ? 1 : 0));
  return { sessions: [...sessionIds].sort(), hotLines, archiveLines, assistantLines, bySession };
}

/** 只读扫描：预演用，不写任何文件。 */
export function scanPersonTranscripts(input: {
  channel: string;
  senderId: string;
  known: ReadonlyMap<string, string>;
  /**
   * §2.2 的 R1 会话集合。
   *
   * 扫描阶段就需要它，因为**私聊行没有 `speakerId`**（总览 §4.3）：不知道哪些会话是
   * 他的私聊，就既数不出"会被整会话删掉多少行"，也取不到"将被删掉的 user 正文"，
   * 预演报告会严重低估。
   */
  privateSessions: ReadonlySet<string>;
  /**
   * 他的别名集合（可选）。给了才会统计"她复述他"的 assistant 行（D5）。
   *
   * ⚠️ 调用方存在**先有鸡还是先有蛋**：`knownNames` 的三个来源之一正是本函数的
   * `speakerNames`。所以预演走两遍 —— 第一遍不带名字拿 `speakerNames`，拼出
   * `knownNames` 后再跑第二遍拿 `assistantLines`。他的行数两遍一致，不受影响。
   */
  knownNames?: readonly string[];
}): TranscriptScanResult {
  const { files, unknownFiles, speakerNames, removedUserTexts } = scanFiles(input);
  const summary = summarizeFiles(files);
  return { ...summary, unknownFiles, speakerNames, removedUserTexts };
}

export interface TranscriptEraseResult {
  /** 被处理过的会话数（整会话删除 + 逐行过滤的都算）。 */
  sessions: number;
  /** 真正被整会话删掉的私聊会话（升序）。 */
  privateSessions: string[];
  hotLines: number;
  archiveLines: number;
  /** 其中"她复述他"的 assistant 行数（D5；已计入 `hotLines` / `archiveLines`）。 */
  assistantLines: number;
  /** 有行被清掉的 (会话, 月份) 归档文件数。 */
  archiveMonths: number;
  /** 文件名无法还原成 sessionId 的文件（不动它们，只报告）。 */
  unknownFiles: string[];
  /** 被删掉的 user 行正文（去重、截断 200 字）—— 供关系日志存量指纹匹配用。 */
  removedUserTexts: string[];
  failed: Array<{ file: string; error: string }>;
}

/**
 * 执行 transcript 擦除。**同步**（§0.4 约束 4）——本函数体内不得出现 `await`。
 *
 * @param input.privateSessions §2.2 的 R1 会话集合；命中的会话**整会话删除**。
 * @param input.knownNames 他的别名集合；给了才会连"她复述他"的 assistant 行一起删（D5，
 *        且只在"他说话过的会话"里）。不给 = 旧行为（只删他说的行）。
 */
export function erasePersonTranscripts(input: {
  channel: string;
  senderId: string;
  known: ReadonlyMap<string, string>;
  privateSessions: ReadonlySet<string>;
  knownNames?: readonly string[];
}): TranscriptEraseResult {
  const unknownFiles: string[] = [];
  const removedUserTexts: string[] = [];
  const seenTexts = new Set<string>();
  const failed: Array<{ file: string; error: string }> = [];
  const privateSessionsRemoved: string[] = [];
  const touchedSessions = new Set<string>();
  const names = input.knownNames ?? [];
  let hotLines = 0;
  let archiveLines = 0;
  let assistantLines = 0;
  let archiveMonths = 0;

  const collect = (content: unknown, role: unknown): void => {
    if (role !== "user") return;
    if (typeof content !== "string" || content.length === 0) return;
    const text = content.length > REMOVED_TEXT_MAX ? content.slice(0, REMOVED_TEXT_MAX) : content;
    if (seenTexts.has(text)) return;
    seenTexts.add(text);
    removedUserTexts.push(text);
  };

  // **按会话分组**再处理。私聊要"整会话删"，而一个会话可能同时有热层文件与多个月份的归档
  // 文件 —— 必须先把这个会话的全部文件读完收集正文，再删，否则先删热层会把归档里的正文
  // 一起带走、D 集合就不完整了（关系日志的指纹匹配会漏）。
  interface SessionFiles { sessionId: string; refs: Array<ReturnType<typeof listTranscriptFiles>[number]> }
  const bySession = new Map<string, SessionFiles>();
  for (const ref of listTranscriptFiles()) {
    const sessionId = sessionIdFromFileName(ref.fileBase, input.known);
    if (!sessionId) {
      unknownFiles.push(ref.file);
      continue;
    }
    if (channelOfSession(sessionId) !== input.channel) continue;
    const bucket = bySession.get(sessionId);
    if (bucket) bucket.refs.push(ref);
    else bySession.set(sessionId, { sessionId, refs: [ref] });
  }

  for (const { sessionId, refs } of bySession.values()) {
    if (input.privateSessions.has(sessionId)) {
      for (const ref of refs) {
        const lines = readFileLines(ref.file);
        for (const { entry } of lines) {
          if (!entry) continue;
          collect(entry.content, entry.role);
        }
        if (ref.layer === "hot") hotLines += lines.length;
        else archiveLines += lines.length;
      }
      touchedSessions.add(sessionId);
      try {
        const result = removeTranscriptSession(sessionId);
        if (result.hot || result.archiveDir) privateSessionsRemoved.push(sessionId);
        archiveMonths += refs.filter((ref) => ref.layer === "archive").length;
      } catch (err) {
        failed.push({ file: sessionId, error: err instanceof Error ? err.message : String(err) });
      }
      continue;
    }

    // 群聊：逐行过滤（写回原始行，别人那几行的字节不动）。
    //
    // 两趟：先读完这个会话的全部文件，判定"他在这个会话里说过话"与各类行数；
    // 再动笔重写。**顺序不能反** —— assistant 行的文本级判据只在"他出现过"的会话里生效
    // （否则"他从未出现过的群"里同名的人会被误删，见文件头约束 1）。
    const snapshot = refs.map((ref) => ({ ref, lines: readFileLines(ref.file) }));
    const heSpoke = names.length > 0
      && snapshot.some(({ lines }) => lines.some(({ entry }) => entry?.speakerId === input.senderId));
    for (const { ref, lines } of snapshot) {
      let ownRemoved = 0;
      let assistantRemoved = 0;
      let previous: HistoryEntry | null = null;
      for (const { entry } of lines) {
        if (!entry) continue;
        if (entry.speakerId === input.senderId) {
          ownRemoved += 1;
          collect(entry.content, entry.role);
          previous = entry;
          continue;
        }
        if (heSpoke && entry.role === "assistant"
          && (assistantMentionsPerson(entry.content, names) || isReplyToPerson(previous, input.senderId))) {
          assistantRemoved += 1;
        }
        previous = entry;
      }
      if (ownRemoved + assistantRemoved === 0) continue;
      try {
        const result = filterTranscriptFile(ref.file, (entry, previousEntry) => {
          if (entry.speakerId === input.senderId) return false;
          if (heSpoke && entry.role === "assistant"
            && (assistantMentionsPerson(entry.content, names) || isReplyToPerson(previousEntry, input.senderId))) {
            return false;
          }
          return true;
        });
        touchedSessions.add(sessionId);
        const removedOwn = Math.min(ownRemoved, result.removed);
        const removedAssistant = Math.max(0, result.removed - removedOwn);
        if (ref.layer === "hot") {
          hotLines += removedOwn + removedAssistant;
        } else {
          archiveLines += removedOwn + removedAssistant;
          archiveMonths += 1;
        }
        assistantLines += removedAssistant;
        // 归档层没有生产读取方（只给"人"翻查），所以"整月都被清空"时把空文件删掉，
        // 让空目录也能被 pruneEmptyArchiveDirs() 收走。热层必须**保留空文件**，
        // 因为 loadRecentHistory 的 existsSync 早退行为要维持原样（§2.5）。
        if (ref.layer === "archive" && result.kept === 0) fs.rmSync(ref.file, { force: true });
      } catch (err) {
        failed.push({ file: ref.file, error: err instanceof Error ? err.message : String(err) });
      }
    }
  }

  // 归档目录若已变空，顺手删掉空目录（§2.5）。
  try {
    pruneEmptyArchiveDirs();
  } catch {
    /* 清空归档目录纯属收尾，失败不影响擦除结果 */
  }

  return {
    sessions: touchedSessions.size,
    privateSessions: privateSessionsRemoved.sort(),
    hotLines,
    archiveLines,
    assistantLines,
    archiveMonths,
    unknownFiles,
    removedUserTexts,
    failed,
  };
}
