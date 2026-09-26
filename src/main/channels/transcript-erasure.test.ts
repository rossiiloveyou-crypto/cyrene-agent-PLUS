/**
 * `transcript-erasure` + `history-log` 新增同步原语的单元测试（P3 §4.3）。
 *
 * 风格照抄 `history-log.test.ts`：真实 fs + 临时目录 + mock electron。
 *
 * ⚠️ 用例 12 / 13 是**专项风险用例**（§0.4 约束 4 / §6 风险评估的"高"档）：
 * 一旦有人往重写路径里加了 `await`，"读旧文件 → 别人追加 → 覆盖写回"的竞态会**丢真实聊天记录**。
 * 12 锁住"返回值是普通值不是 Promise"，13 锁住"重写前刚落盘的行不会被吃掉"。
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "cyrene-transcript-erase-"));

vi.mock("electron", () => ({
  app: { getPath: () => TMP },
}));

import {
  appendHistory,
  filterTranscriptFile,
  listTranscriptFiles,
  sessionIdFromFileName,
  transcriptFileBase,
} from "./history-log";
import type { HistoryEntry } from "./history-log";
import { erasePersonTranscripts, scanPersonTranscripts } from "./transcript-erasure";

const ME = "10001";
const OTHER = "10002";

const GROUP = "channel:qq:bbbbbbbbbbbbbbbb";
const OTHER_GROUP = "channel:qq:cccccccccccccccc";
const MY_PRIVATE = "channel:qq:aaaaaaaaaaaaaaaa";
const OTHER_CHANNEL = "channel:wechat:dddddddddddddddd";

function channelsDir(): string {
  return path.join(TMP, "channels");
}

function archiveFile(sessionId: string, month: string): string {
  return path.join(channelsDir(), "archive", transcriptFileBase(sessionId), `${month}.jsonl`);
}

function writeArchive(sessionId: string, month: string, entries: HistoryEntry[]): void {
  const file = archiveFile(sessionId, month);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n", "utf8");
}

function readLines(file: string): string[] {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split("\n").filter((line) => line.length > 0);
}

function knownOf(...sessionIds: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const sessionId of sessionIds) map.set(transcriptFileBase(sessionId), sessionId);
  return map;
}

const NO_PRIVATE: ReadonlySet<string> = new Set<string>();

describe("transcript-erasure", () => {
  beforeEach(() => {
    fs.rmSync(channelsDir(), { recursive: true, force: true });
  });

  it("1. 群文件逐行过滤：只删目标行，其余行字节不变", () => {
    appendHistory(GROUP, "user", "我的第一句", { speakerId: ME, speakerName: "小明" });
    appendHistory(GROUP, "user", "别人的话", { speakerId: OTHER, speakerName: "小红" });
    appendHistory(GROUP, "assistant", "昔涟的回复");
    appendHistory(GROUP, "user", "我的第二句", { speakerId: ME, speakerName: "小明" });

    const file = path.join(channelsDir(), "history", `${transcriptFileBase(GROUP)}.jsonl`);
    const before = readLines(file);
    const expectedSurvivors = before.filter((line) => !line.includes(`"${ME}"`));

    const result = erasePersonTranscripts({
      channel: "qq",
      senderId: ME,
      known: knownOf(GROUP),
      privateSessions: NO_PRIVATE,
    });

    expect(result.hotLines).toBe(2);
    expect(result.failed).toEqual([]);
    expect(readLines(file)).toEqual(expectedSurvivors);
    // 别人的行与昔涟的行一字不改
    expect(readLines(file).join("\n")).toContain("别人的话");
    expect(readLines(file).join("\n")).toContain("昔涟的回复");
  });

  it("2. 坏行不丢：非法 JSON 行原样保留", () => {
    appendHistory(GROUP, "user", "他的", { speakerId: ME });
    const file = path.join(channelsDir(), "history", `${transcriptFileBase(GROUP)}.jsonl`);
    fs.appendFileSync(file, "{ this is not json }\n", "utf8");
    appendHistory(GROUP, "user", "她的", { speakerId: OTHER });

    filterTranscriptFile(file, (entry) => entry.speakerId !== ME);

    const lines = readLines(file);
    expect(lines.some((line) => line.includes("this is not json"))).toBe(true);
    expect(lines.some((line) => line.includes("她的"))).toBe(true);
    expect(lines.some((line) => line.includes("\"他的\""))).toBe(false);
  });

  it("3. speakerId 缺失的行保留（私聊 / legacy 行不被误删）", () => {
    appendHistory(GROUP, "user", "没有归属字段的一行");
    const file = path.join(channelsDir(), "history", `${transcriptFileBase(GROUP)}.jsonl`);
    const result = filterTranscriptFile(file, (entry) => entry.speakerId !== ME);
    expect(result.removed).toBe(0);
    expect(readLines(file)).toHaveLength(1);
  });

  it("4. 归档同步：<月>.jsonl 里的目标行也被清掉，月份桶不变", () => {
    writeArchive(GROUP, "2026-09", [
      { role: "user", content: "九月的他", speakerId: ME, at: "2026-09-10T10:00:00.000Z" },
      { role: "user", content: "九月的别人", speakerId: OTHER, at: "2026-09-11T10:00:00.000Z" },
    ]);
    writeArchive(GROUP, "2026-10", [
      { role: "user", content: "十月的他", speakerId: ME, at: "2026-10-02T10:00:00.000Z" },
    ]);

    const result = erasePersonTranscripts({
      channel: "qq",
      senderId: ME,
      known: knownOf(GROUP),
      privateSessions: NO_PRIVATE,
    });

    expect(result.archiveLines).toBe(2);
    expect(result.archiveMonths).toBe(2);
    expect(readLines(archiveFile(GROUP, "2026-09")).join("\n")).toContain("九月的别人");
    expect(readLines(archiveFile(GROUP, "2026-09")).join("\n")).not.toContain("九月的他");
    // 十月那一桶被他一个人占满 → 整月被清空 → 空文件删掉；九月的桶（还有别人的话）留着
    expect(fs.existsSync(archiveFile(GROUP, "2026-10"))).toBe(false);
    expect(fs.existsSync(archiveFile(GROUP, "2026-09"))).toBe(true);
    expect(fs.existsSync(path.join(channelsDir(), "archive", transcriptFileBase(GROUP)))).toBe(true);
  });

  it("5. 私聊整会话：热层文件 + 归档目录一起删（私聊行没有 speakerId，只能整会话删）", () => {
    appendHistory(MY_PRIVATE, "user", "私聊里的话");
    appendHistory(MY_PRIVATE, "assistant", "私聊里的回复");
    writeArchive(MY_PRIVATE, "2026-09", [
      { role: "user", content: "归档里的私聊", at: "2026-09-01T10:00:00.000Z" },
    ]);

    const result = erasePersonTranscripts({
      channel: "qq",
      senderId: ME,
      known: knownOf(MY_PRIVATE),
      privateSessions: new Set([MY_PRIVATE]),
    });

    expect(result.privateSessions).toEqual([MY_PRIVATE]);
    expect(fs.existsSync(path.join(channelsDir(), "history", `${transcriptFileBase(MY_PRIVATE)}.jsonl`))).toBe(false);
    expect(fs.existsSync(path.join(channelsDir(), "archive", transcriptFileBase(MY_PRIVATE)))).toBe(false);
    // 正文被收集去做关系日志指纹匹配；assistant 的行不进集合
    expect(result.removedUserTexts).toContain("私聊里的话");
    expect(result.removedUserTexts).toContain("归档里的私聊");
    expect(result.removedUserTexts).not.toContain("私聊里的回复");
  });

  it("6. 归档目录变空即删", () => {
    writeArchive(GROUP, "2026-09", [
      { role: "user", content: "只有他", speakerId: ME, at: "2026-09-10T10:00:00.000Z" },
    ]);
    const dir = path.join(channelsDir(), "archive", transcriptFileBase(GROUP));
    expect(fs.existsSync(dir)).toBe(true);

    erasePersonTranscripts({ channel: "qq", senderId: ME, known: knownOf(GROUP), privateSessions: NO_PRIVATE });

    expect(fs.existsSync(dir)).toBe(false);
  });

  it("7. 群会话过滤后为空：文件仍存在且为空（不改变 existsSync 早退行为）", () => {
    appendHistory(GROUP, "user", "只有他", { speakerId: ME });
    const file = path.join(channelsDir(), "history", `${transcriptFileBase(GROUP)}.jsonl`);

    erasePersonTranscripts({ channel: "qq", senderId: ME, known: knownOf(GROUP), privateSessions: NO_PRIVATE });

    expect(fs.existsSync(file)).toBe(true);
    expect(fs.readFileSync(file, "utf8")).toBe("");
  });

  it("8. sessionIdFromFileName：权威名册优先（已知时不走正则）", () => {
    const known = new Map([["channel_qq_ab12cd34ef56ab78", "channel:qq:custom-name"]]);
    expect(sessionIdFromFileName("channel_qq_ab12cd34ef56ab78", known)).toBe("channel:qq:custom-name");
  });

  it("9. sessionIdFromFileName：退化正则", () => {
    expect(sessionIdFromFileName("channel_qq_ab12cd34ef56ab78", new Map())).toBe("channel:qq:ab12cd34ef56ab78");
    expect(sessionIdFromFileName("channel_qq_notahash", new Map())).toBeNull();
  });

  it("10. 含下划线的渠道名在无名册时返回 null（宁可不动）", () => {
    expect(sessionIdFromFileName("channel_my_channel_ab12cd34ef56ab78", new Map())).toBeNull();
  });

  it("11. 别的渠道不受影响", () => {
    appendHistory(GROUP, "user", "qq 的他", { speakerId: ME });
    appendHistory(OTHER_CHANNEL, "user", "wechat 的同号", { speakerId: ME });

    const result = erasePersonTranscripts({
      channel: "qq",
      senderId: ME,
      known: knownOf(GROUP, OTHER_CHANNEL),
      privateSessions: NO_PRIVATE,
    });

    expect(result.hotLines).toBe(1);
    const wechatFile = path.join(channelsDir(), "history", `${transcriptFileBase(OTHER_CHANNEL)}.jsonl`);
    expect(readLines(wechatFile).join("\n")).toContain("wechat 的同号");
  });

  it("12. 同步性回归：返回普通值而不是 Promise（锁住「无 await 即无竞态」）", () => {
    appendHistory(GROUP, "user", "x", { speakerId: ME });
    const file = path.join(channelsDir(), "history", `${transcriptFileBase(GROUP)}.jsonl`);

    const filterResult = filterTranscriptFile(file, () => true) as unknown as { then?: unknown };
    expect(filterResult.then).toBeUndefined();

    // erasePersonTranscripts 同样必须同步：一旦它变成 Promise，
    // "读旧文件 → 别人追加 → 覆盖写回"的窗口就打开了（§0.4 约束 4）。
    const eraseResult = erasePersonTranscripts({
      channel: "qq",
      senderId: ME,
      known: knownOf(GROUP),
      privateSessions: NO_PRIVATE,
    }) as unknown as { then?: unknown };
    expect(eraseResult.then).toBeUndefined();
  });

  it("13. 过滤与并发 append 交错：重写前刚落盘的那行仍在", () => {
    appendHistory(GROUP, "user", "他的旧话", { speakerId: ME });
    // 模拟"重写即将开始的那一瞬间，别人刚说了一句话"
    appendHistory(GROUP, "user", "重写前刚写入的一句", { speakerId: OTHER });

    erasePersonTranscripts({ channel: "qq", senderId: ME, known: knownOf(GROUP), privateSessions: NO_PRIVATE });

    const file = path.join(channelsDir(), "history", `${transcriptFileBase(GROUP)}.jsonl`);
    expect(readLines(file).join("\n")).toContain("重写前刚写入的一句");
  });

  it("scanPersonTranscripts 只读：不改动任何文件，并给出将被删掉的正文", () => {
    appendHistory(GROUP, "user", "他说的话", { speakerId: ME, speakerName: "小明" });
    appendHistory(MY_PRIVATE, "user", "私聊里的话");
    const before = readLines(path.join(channelsDir(), "history", `${transcriptFileBase(GROUP)}.jsonl`));

    const scan = scanPersonTranscripts({
      channel: "qq",
      senderId: ME,
      known: knownOf(GROUP, MY_PRIVATE),
      privateSessions: new Set([MY_PRIVATE]),
    });

    expect(scan.speakerNames).toEqual(["小明"]);
    expect(scan.sessions.sort()).toEqual([MY_PRIVATE, GROUP].sort());
    expect(scan.removedUserTexts).toContain("他说的话");
    expect(scan.removedUserTexts).toContain("私聊里的话");
    expect(readLines(path.join(channelsDir(), "history", `${transcriptFileBase(GROUP)}.jsonl`))).toEqual(before);
  });

  it("listTranscriptFiles 同时列出热层与归档层", () => {
    appendHistory(GROUP, "user", "hot");
    writeArchive(OTHER_GROUP, "2026-09", [{ role: "user", content: "archive", at: "2026-09-01T00:00:00.000Z" }]);
    const files = listTranscriptFiles();
    expect(files.some((item) => item.layer === "hot" && item.fileBase === transcriptFileBase(GROUP))).toBe(true);
    expect(files.some((item) => item.layer === "archive" && item.month === "2026-09" && item.fileBase === transcriptFileBase(OTHER_GROUP))).toBe(true);
  });

  // ── D5（§5.2 第 7 步加测抓到）：她复述他的行也要删 ────────────────────────
  //
  // 背景（P3 §9.3c 第 21 条）：群里 `role="assistant"` 的行没有 `speakerId`，
  // 原实现（§2.5 约束 1"不删昔涟自己的回复，接受残留"）一条都不动。
  // 但实测她的回复会**逐字复述被擦者的信息**，而这些行每轮都进上下文窗口 ——
  // 于是擦除后她仍能答出"他已经删掉的经历"。以下用例锁住反转后的判据。

  it("14. D5：他在这个会话里说过话 → 她复述他 / 回复他的 assistant 行一起删，并计入 assistantLines", () => {
    appendHistory(GROUP, "user", "我最近在学做菜", { speakerId: ME, speakerName: "小明" });
    // ⚠️ 这一行**一个字都没提他** —— 但它就是对上一句的回复，也是她后来照答"他在学做菜"的来源
    //（真实现场：`run-1790345147627-o5sb5o.json` 的 messages[10]）
    appendHistory(GROUP, "assistant", "学做菜好呀！以后搬去杭州就能自己开小灶啦♪");
    appendHistory(GROUP, "assistant", "今天天气不错呀♪");
    appendHistory(GROUP, "user", "别人的话", { speakerId: OTHER, speakerName: "小红" });
    appendHistory(GROUP, "assistant", "小红的回复，与他无关");

    const result = erasePersonTranscripts({
      channel: "qq",
      senderId: ME,
      known: knownOf(GROUP),
      privateSessions: NO_PRIVATE,
      knownNames: ["小明"],
    });

    const text = readLines(path.join(channelsDir(), "history", `${transcriptFileBase(GROUP)}.jsonl`)).join("\n");
    expect(text).not.toContain("学做菜好呀");
    expect(text).toContain("今天天气不错呀");
    expect(text).toContain("别人的话");
    expect(text).toContain("小红的回复，与他无关");
    expect(result.assistantLines).toBe(1);
    // 她复述的那一行也计入 hotLines（它确实是从 transcript 里删掉的一行）
    expect(result.hotLines).toBe(2);
  });

  it("15. D5：他在这个会话里**没说过话** → 同名的人的回复一行都不许动（不越界）", () => {
    appendHistory(OTHER_GROUP, "user", "小红说小明最近在学做菜", { speakerId: OTHER, speakerName: "小红" });
    appendHistory(OTHER_GROUP, "assistant", "学做菜好呀！小明真棒♪");
    appendHistory(GROUP, "user", "他在这里说过话", { speakerId: ME, speakerName: "小明" });
    appendHistory(GROUP, "assistant", "这里也提到了小明♪");

    const result = erasePersonTranscripts({
      channel: "qq",
      senderId: ME,
      known: knownOf(GROUP, OTHER_GROUP),
      privateSessions: NO_PRIVATE,
      knownNames: ["小明"],
    });

    const otherText = readLines(path.join(channelsDir(), "history", `${transcriptFileBase(OTHER_GROUP)}.jsonl`)).join("\n");
    expect(otherText).toContain("学做菜好呀");       // 他从未出现在这个群 → 不碰
    expect(otherText).toContain("小红说小明");
    expect(result.assistantLines).toBe(1);           // 只有 GROUP 里那一行
  });

  it("16. D5：不给 knownNames 时保持旧行为（只删他说的行）—— opt-in 语义", () => {
    appendHistory(GROUP, "user", "他说的", { speakerId: ME, speakerName: "小明" });
    appendHistory(GROUP, "assistant", "小明真棒♪");

    const result = erasePersonTranscripts({
      channel: "qq",
      senderId: ME,
      known: knownOf(GROUP),
      privateSessions: NO_PRIVATE,
    });

    const text = readLines(path.join(channelsDir(), "history", `${transcriptFileBase(GROUP)}.jsonl`)).join("\n");
    expect(text).toContain("小明真棒♪");
    expect(result.assistantLines).toBe(0);
  });

  it("17. D5：别人转述他的 user 行**保留**（K 类口径不许被文本匹配误伤）", () => {
    appendHistory(GROUP, "user", "他说的", { speakerId: ME, speakerName: "小明" });
    appendHistory(GROUP, "user", "小明上周跟我说他女朋友是兽医", { speakerId: OTHER, speakerName: "小红" });

    erasePersonTranscripts({
      channel: "qq",
      senderId: ME,
      known: knownOf(GROUP),
      privateSessions: NO_PRIVATE,
      knownNames: ["小明"],
    });

    const text = readLines(path.join(channelsDir(), "history", `${transcriptFileBase(GROUP)}.jsonl`)).join("\n");
    expect(text).toContain("小明上周跟我说他女朋友是兽医");
  });

  it("18. D5：预演与执行同源 —— scan 的 assistantLines 与执行结果一致", () => {
    appendHistory(GROUP, "user", "他说的", { speakerId: ME, speakerName: "小明" });
    appendHistory(GROUP, "assistant", "小明真棒♪");
    appendHistory(GROUP, "assistant", "与这件事无关的回复");
    writeArchive(GROUP, "2026-09", [
      { role: "user", content: "归档里的他", speakerId: ME, speakerName: "小明", at: "2026-09-01T00:00:00.000Z" },
      { role: "assistant", content: "归档里也提到小明", at: "2026-09-01T00:00:00.000Z" },
    ]);

    const scan = scanPersonTranscripts({
      channel: "qq",
      senderId: ME,
      known: knownOf(GROUP),
      privateSessions: NO_PRIVATE,
      knownNames: ["小明"],
    });
    const result = erasePersonTranscripts({
      channel: "qq",
      senderId: ME,
      known: knownOf(GROUP),
      privateSessions: NO_PRIVATE,
      knownNames: ["小明"],
    });

    expect(scan.assistantLines).toBe(2);
    expect(result.assistantLines).toBe(scan.assistantLines);
    expect(result.hotLines).toBe(scan.hotLines);
    expect(result.archiveLines).toBe(scan.archiveLines);
  });
});
