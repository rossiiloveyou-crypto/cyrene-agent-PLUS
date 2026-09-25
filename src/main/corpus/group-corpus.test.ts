import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const electronMock = vi.hoisted(() => ({ userDataDir: "" }));

vi.mock("electron", () => ({
  app: { getPath: () => electronMock.userDataDir },
}));

import {
  _resetGroupCorpusForTest,
  corpusDir,
  corpusStats,
  dayFileOf,
  groupKeyOf,
  resolveGroupFolder,
  sanitizeFolderName,
  writeGroupCorpus,
  type GroupCorpusEntry,
  type GroupCorpusMessage,
} from "./group-corpus";

const GROUP_ID = "543627098";

function message(overrides: Partial<GroupCorpusMessage> = {}): GroupCorpusMessage {
  return {
    kind: "group",
    groupId: GROUP_ID,
    senderId: "2914636187",
    senderName: "BeiKia",
    messageId: "msg-1",
    text: "今天天气不错",
    at: new Date("2026-09-21T14:03:22.145Z"),
    groupAllowed: true,
    triggered: false,
    ...overrides,
  };
}

/** 读出某群某天的语料行。 */
function readEntries(folder: string, day = "2026-09-21"): GroupCorpusEntry[] {
  const file = path.join(corpusDir(), folder, `${day}.jsonl`);
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as GroupCorpusEntry);
}

function listFolders(): string[] {
  try {
    return fs.readdirSync(corpusDir(), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

describe("group-corpus 采集", () => {
  beforeEach(() => {
    _resetGroupCorpusForTest();
    delete process.env.CYRENE_GROUP_CORPUS;
    electronMock.userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "group-corpus-"));
  });

  afterEach(() => {
    delete process.env.CYRENE_GROUP_CORPUS;
  });

  it("落在 userData 顶层的 group-corpus/，不在 channels/ 里面", () => {
    expect(corpusDir()).toBe(path.join(electronMock.userDataDir, "group-corpus"));

    writeGroupCorpus(message());

    // 关键边界：不能落在 channels/ 下——那两个目录都在 MEMORY_TARGETS 里会被清空
    expect(fs.existsSync(path.join(electronMock.userDataDir, "channels"))).toBe(false);
    expect(listFolders()).toEqual([GROUP_ID]);
    expect(readEntries(GROUP_ID)).toHaveLength(1);
  });

  it("行内容只含消息本身，不掺任何注入字段", () => {
    writeGroupCorpus(message({ triggered: true, trigger: "mention" }));

    const entry = readEntries(GROUP_ID)[0];
    expect(entry).toEqual({
      t: "2026-09-21T14:03:22.145Z",
      kind: "group",
      gid: GROUP_ID,
      uid: "2914636187",
      uname: "BeiKia",
      msg: "今天天气不错",
      mid: "msg-1",
      trig: "respond",
      allowed: true,
    });
    // 被点名这件事只作为一个标记记录，不改变"记录消息本身"的性质
    expect(entry.trig).toBe("respond");
  });

  it("私聊与群聊分开落盘，互不写入对方", () => {
    writeGroupCorpus(message());
    // 私聊：id 空间是「对方 QQ 号」，与群号同域，靠 kind + __private 后缀区分
    writeGroupCorpus(message({
      kind: "private",
      groupId: "2914636187",
      senderId: "2914636187",
      messageId: "msg-p1",
      text: "私聊里说的话",
    }));
    // 极端情况：某个群的群号恰好等于某人的 QQ 号
    writeGroupCorpus(message({
      groupId: "2914636187",
      messageId: "msg-g9",
      text: "同名群号里的话",
    }));

    expect(listFolders().sort()).toEqual(
      ["2914636187", "2914636187__private", GROUP_ID].sort(),
    );
    expect(readEntries("2914636187__private").map((e) => e.msg)).toEqual(["私聊里说的话"]);
    expect(readEntries("2914636187__private")[0].kind).toBe("private");
    expect(readEntries("2914636187").map((e) => e.msg)).toEqual(["同名群号里的话"]);
    expect(readEntries("2914636187")[0].kind).toBe("group");
  });

  it("私聊语料保留 respond 语义（对方说话就是在找她）", () => {
    writeGroupCorpus(message({
      kind: "private",
      groupId: "2914636187",
      messageId: "msg-p1",
      triggered: true,
    }));

    const entry = readEntries("2914636187__private")[0];
    expect(entry).toMatchObject({ kind: "private", gid: "2914636187", trig: "respond", allowed: true });
    // 私聊没有"触发词"概念，不该带 trigger 字段
    expect(entry).not.toHaveProperty("trigger");
  });

  it("每个群一份文件：两个群互不写入对方", () => {
    writeGroupCorpus(message());
    writeGroupCorpus(message({ groupId: "1055799748", messageId: "msg-2", text: "另一个群的话" }));

    expect(listFolders().sort()).toEqual(["1055799748", GROUP_ID].sort());
    expect(readEntries(GROUP_ID).map((e) => e.msg)).toEqual(["今天天气不错"]);
    expect(readEntries("1055799748").map((e) => e.msg)).toEqual(["另一个群的话"]);
  });

  it("按天分片：跨天写成两个文件", () => {
    writeGroupCorpus(message());
    writeGroupCorpus(message({
      messageId: "msg-2",
      text: "明天的消息",
      at: new Date("2026-09-22T00:10:00.000Z"),
    }));

    expect(fs.readdirSync(path.join(corpusDir(), GROUP_ID)).sort())
      .toEqual(["2026-09-21.jsonl", "2026-09-22.jsonl"]);
    expect(dayFileOf(new Date("2026-09-22T00:10:00.000Z"))).toBe("2026-09-22.jsonl");
  });

  it("同一条 mid 只落一次（重连补投不重复入语料）", () => {
    expect(writeGroupCorpus(message())).toBe(true);
    expect(writeGroupCorpus(message({ text: "重复投递的同一句话" }))).toBe(false);

    expect(readEntries(GROUP_ID)).toHaveLength(1);
    expect(readEntries(GROUP_ID)[0].msg).toBe("今天天气不错");
  });

  it("没有 mid 的消息不参与去重，全部保留", () => {
    writeGroupCorpus(message({ messageId: undefined, text: "第一条" }));
    writeGroupCorpus(message({ messageId: undefined, text: "第二条" }));

    expect(readEntries(GROUP_ID).map((e) => e.msg)).toEqual(["第一条", "第二条"]);
  });

  it("附件占位与正文拼在一起；纯附件也留一行", () => {
    writeGroupCorpus(message({ text: "看这个", attachmentText: "[图片]" }));
    writeGroupCorpus(message({ messageId: "msg-2", text: "", attachmentText: "[表情]" }));
    writeGroupCorpus(message({ messageId: "msg-3", text: "   ", attachmentText: "[语音]" }));

    expect(readEntries(GROUP_ID).map((e) => e.msg)).toEqual(["看这个 [图片]", "[表情]", "[语音]"]);
  });

  it("正文与附件都空的消息不占一行", () => {
    expect(writeGroupCorpus(message({ text: "   ", attachmentText: "" }))).toBe(false);
    expect(readEntries(GROUP_ID)).toHaveLength(0);
  });

  it("非白名单群照样采（将来加白名单时历史已经在攒）", () => {
    writeGroupCorpus(message({ groupAllowed: false, triggered: false }));

    const entry = readEntries(GROUP_ID)[0];
    expect(entry.allowed).toBe(false);
    // 非白名单群没有"被叫起来"这个概念，恒为 observe
    expect(entry.trig).toBe("observe");
  });

  it("CYRENE_GROUP_CORPUS=0 时停采，已有文件不受影响", () => {
    writeGroupCorpus(message());
    process.env.CYRENE_GROUP_CORPUS = "0";

    expect(writeGroupCorpus(message({ messageId: "msg-2", text: "停采后的消息" }))).toBe(false);
    expect(readEntries(GROUP_ID)).toHaveLength(1);
  });

  it("写入失败只打警告，不抛错（旁路绝不能拖垮消息链路）", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // 把 userData 指到一个**普通文件**的路径下：mkdirSync 必定 ENOTDIR。
    // 这是确定性的失败，不依赖盘符是否存在、也不依赖 Windows 设备名怪癖。
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "group-corpus-broken-"));
    const blocker = path.join(base, "not-a-directory");
    fs.writeFileSync(blocker, "x", "utf8");
    electronMock.userDataDir = blocker;

    expect(() => writeGroupCorpus(message())).not.toThrow();
    expect(writeGroupCorpus(message())).toBe(false);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("缺 groupId 直接跳过", () => {
    expect(writeGroupCorpus(message({ groupId: "" }))).toBe(false);
    expect(listFolders()).toEqual([]);
  });

  it("corpusStats 统计行数与时间跨度，只读不写", () => {
    writeGroupCorpus(message());
    writeGroupCorpus(message({
      messageId: "msg-2",
      at: new Date("2026-09-22T08:00:00.000Z"),
    }));

    const stats = corpusStats();
    expect(stats).toHaveLength(1);
    expect(stats[0].folder).toBe(GROUP_ID);
    expect(stats[0].groupId).toBe(GROUP_ID);
    expect(stats[0].kind).toBe("group");
    expect(stats[0].lines).toBe(2);
    expect(stats[0].bytes).toBeGreaterThan(0);
    expect(stats[0].firstAt).toBe("2026-09-21T14:03:22.145Z");
    expect(stats[0].lastAt).toBe("2026-09-22T08:00:00.000Z");
  });

  it("corpusStats 对空目录/缺失目录返回空数组", () => {
    expect(corpusStats()).toEqual([]);
    fs.mkdirSync(corpusDir(), { recursive: true });
    expect(corpusStats()).toEqual([]);
  });
});

describe("group-corpus 命名与目录解析", () => {
  it("名字里的 Windows 非法字符被替换、首尾点空格被去掉", () => {
    expect(sanitizeFolderName('a<b>c:d"e/f\\g|h?i*j')).toBe("a_b_c_d_e_f_g_h_i_j");
    expect(sanitizeFolderName("  .群名.  ")).toBe("群名");
    expect(sanitizeFolderName("x".repeat(80))).toHaveLength(40);
  });

  it("群聊：没名字时文件夹就是群号，不拼多余后缀", () => {
    expect(groupKeyOf("543627098")).toBe("543627098");
    expect(groupKeyOf("543627098", "  ")).toBe("543627098");
    expect(groupKeyOf("543627098", "某某群")).toBe("543627098__某某群");
  });

  it("私聊：没名字时加 __private 后缀，与同名群号区分开", () => {
    expect(groupKeyOf("2914636187", undefined, "private")).toBe("2914636187__private");
    expect(groupKeyOf("2914636187", "  ", "private")).toBe("2914636187__private");
    // 传了昵称就用昵称
    expect(groupKeyOf("2914636187", "BeiKia", "private")).toBe("2914636187__BeiKia");
  });

  it("已有本会话目录时复用它，不因名字变化劈成两个目录", () => {
    expect(resolveGroupFolder({
      groupId: "123",
      groupName: "改过名的群",
      existing: ["123__老群名"],
    })).toBe("123__老群名");
  });

  it("前缀相同的两个 id 不会被误认成同一个会话", () => {
    // "123" 不能吃掉 "1234" 的目录（旧实现用 startsWith 判断，会误命中）
    expect(resolveGroupFolder({
      groupId: "123",
      existing: ["1234", "1234__别的群"],
    })).toBe("123");
  });

  it("私聊目录的存在不会挤掉同号群聊的目录", () => {
    // 群号与 QQ 号同为数字且可能相等：群的基础名是 `<id>`，私聊是 `<id>__private`
    expect(resolveGroupFolder({
      groupId: "2914636187",
      existing: ["2914636187__private"],
    })).toBe("2914636187");
    // 反过来也一样
    expect(resolveGroupFolder({
      groupId: "2914636187",
      kind: "private",
      existing: ["2914636187"],
    })).toBe("2914636187__private");
  });

  it("期望目录名被别的会话占用时退回基础名，且退回后不再冲突", () => {
    expect(resolveGroupFolder({
      groupId: "123",
      groupName: "同名群",
      existing: ["456__同名群"],
    })).toBe("123");
    // 私聊退回的是 `<id>__private`，不是裸 id（裸 id 是群聊的目录）
    expect(resolveGroupFolder({
      groupId: "123",
      groupName: "同名群",
      kind: "private",
      existing: ["456__同名群"],
    })).toBe("123__private");
    // 基础名也被占用时也不该继续降级：本会话就用自己的基础名，
    // 真正的冲突（同 id）在规则 1 就被复用掉了
    expect(resolveGroupFolder({
      groupId: "123",
      groupName: "同名群",
      existing: ["456__同名群", "789__同名群"],
    })).toBe("123");
  });

  it("全新群用带群名的期望目录名", () => {
    expect(resolveGroupFolder({
      groupId: "123",
      groupName: "新群",
      existing: [],
    })).toBe("123__新群");
  });
});
