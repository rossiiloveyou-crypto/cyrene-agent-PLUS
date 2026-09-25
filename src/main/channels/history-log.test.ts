// channels/history-log 单元测试
import { describe, it, expect, beforeEach, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// Mock electron
const HISTORY_TMP = path.join(os.tmpdir(), "cyrene-history-test");
fs.mkdirSync(HISTORY_TMP, { recursive: true });

vi.mock("electron", () => ({
  app: {
    getPath: () => HISTORY_TMP,
  },
}));

import {
  appendHistory,
  createMessageId,
  loadRecentHistory,
  migrateHistory,
  buildGroupContextBlock,
  listArchiveMonths,
  loadArchivedHistory,
} from "./history-log";
import type { HistoryEntryMeta, PersistedHistoryEntry } from "./history-log";
import { createChannelContext } from "./channel-context";

describe("channels/history-log", () => {
  beforeEach(() => {
    // 清理测试目录（热层 + 温层归档，否则用例之间互相污染）
    for (const sub of ["history", "archive"]) {
      const dir = path.join(HISTORY_TMP, "channels", sub);
      if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("loadRecentHistory: 不存在的 session → 空数组", () => {
    const r = loadRecentHistory("channel:feishu:notexist", 16);
    expect(r).toEqual([]);
  });

  it("appendHistory + loadRecentHistory round-trip", () => {
    const sid = "channel:feishu:abc123";
    appendHistory(sid, "user", "你好");
    appendHistory(sid, "assistant", "你好！有什么可以帮你的吗？");

    const history = loadRecentHistory(sid, 16);
    expect(history).toHaveLength(2);
    expect(history[0].role).toBe("user");
    expect(history[0].content).toBe("你好");
    expect(history[1].role).toBe("assistant");
    expect(history[1].content).toBe("你好！有什么可以帮你的吗？");
  });

  it("loadRecentHistory: limit 截断 (只取最近 N 条)", () => {
    const sid = "channel:feishu:limit-test";
    for (let i = 0; i < 10; i++) {
      appendHistory(sid, "user", `问题${i}`);
      appendHistory(sid, "assistant", `回答${i}`);
    }
    // 20 条写入，只取最近 4 条
    const history = loadRecentHistory(sid, 4);
    expect(history).toHaveLength(4);
    // 按时间顺序: 最后 2 轮 = [问9, 答9, 问10...不, 索引 0-9]
    // 第 9 轮: user="问题9", assistant="回答9"
    expect(history[0].content).toBe("问题8");
    expect(history[1].content).toBe("回答8");
    expect(history[2].content).toBe("问题9");
    expect(history[3].content).toBe("回答9");
  });

  it("appendHistory: 空 sessionId 或空 content 不落盘", () => {
    appendHistory("", "user", "hello");
    appendHistory("channel:feishu:x", "user", "");
    const history = loadRecentHistory("channel:feishu:x", 16);
    expect(history).toEqual([]);
  });

  it("多 session 隔离: 不同 sessionId 文件不同", () => {
    appendHistory("channel:feishu:userA", "user", "A 说的话");
    appendHistory("channel:feishu:userB", "user", "B 说的话");

    const a = loadRecentHistory("channel:feishu:userA", 16);
    const b = loadRecentHistory("channel:feishu:userB", 16);
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    expect(a[0].content).toBe("A 说的话");
    expect(b[0].content).toBe("B 说的话");
  });

  it("文件超过 MAX_FILE_LINES 时自动截断 (不丢失最新)", () => {
    const sid = "channel:feishu:trunc";
    // 写 250 条 (> MAX_FILE_LINES 200)
    for (let i = 0; i < 250; i++) {
      appendHistory(sid, "user", `msg${i}`);
    }
    const history = loadRecentHistory(sid, 250);
    // 截断后最多 200 条
    expect(history.length).toBeLessThanOrEqual(200);
    // 最新一条应该是 msg249
    expect(history[history.length - 1].content).toBe("msg249");
    // 最老一条应该是 msg50 (250 - 200 = 50)
    expect(history[0].content).toBe("msg50");
  });

  describe("migrateHistory", () => {
    it("旧键(senderId)历史迁移到新键(chatId)，升级不丢上下文", () => {
      const legacy = "channel:feishu:legacyhash";
      const fresh = "channel:feishu:freshhash";
      appendHistory(legacy, "user", "旧会话消息");

      migrateHistory(legacy, fresh);

      const history = loadRecentHistory(fresh, 16);
      expect(history).toHaveLength(1);
      expect(history[0].content).toBe("旧会话消息");
      // 原文件保留作兜底
      expect(loadRecentHistory(legacy, 16)).toHaveLength(1);
    });

    it("幂等：新键已有文件时不覆盖", () => {
      const legacy = "channel:feishu:legacyhash2";
      const fresh = "channel:feishu:freshhash2";
      appendHistory(legacy, "user", "旧会话消息");
      appendHistory(fresh, "user", "新会话消息");

      migrateHistory(legacy, fresh);

      const history = loadRecentHistory(fresh, 16);
      expect(history).toHaveLength(1);
      expect(history[0].content).toBe("新会话消息");
    });

    it("旧键无文件时静默无操作", () => {
      migrateHistory("channel:feishu:never-exist", "channel:feishu:never-fresh");
      expect(loadRecentHistory("channel:feishu:never-fresh", 16)).toEqual([]);
    });

    it("同键或空键直接返回", () => {
      expect(() => migrateHistory("channel:feishu:same", "channel:feishu:same")).not.toThrow();
      expect(() => migrateHistory("", "channel:feishu:x")).not.toThrow();
    });
  });

  describe("结构化字段 (群聊 transcript)", () => {
    it("appendHistory 透传 speaker / triggered 等字段，loadRecentHistory 原样读回", () => {
      const sid = "channel:qq:group123";
      appendHistory(sid, "user", "xxx是什么", {
        speakerId: "123456789",
        speakerName: "张三",
        isBot: false,
        triggered: false,
      });

      const [entry] = loadRecentHistory(sid, 10);
      expect(entry.speakerId).toBe("123456789");
      expect(entry.speakerName).toBe("张三");
      expect(entry.isBot).toBe(false);
      expect(entry.triggered).toBe(false);
      expect(entry.content).toBe("xxx是什么");
      expect(entry.role).toBe("user");
    });

    it("未传的字段不会写成 null (旧记录形态保持可读)", () => {
      const sid = "channel:qq:plain";
      appendHistory(sid, "assistant", "收到");
      const [entry] = loadRecentHistory(sid, 10);
      expect(entry).not.toHaveProperty("speakerId");
      expect(entry).not.toHaveProperty("triggered");
    });

    it("旧格式 [群聊发送者：] 前缀被拆成 speakerName + QQ 号 + 纯正文", () => {
      const sid = "channel:qq:legacy";
      const filePath = path.join(HISTORY_TMP, "channels", "history", `${sid.replace(/[:/\\<>:"|?*]/g, "_")}.jsonl`);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(
        filePath,
        JSON.stringify({
          role: "user",
          content: "[群聊发送者：李四 (10002)](@昔涟)\n你知道吗",
          at: "2024-01-15T10:31:00.000Z",
        }) + "\n",
        "utf8",
      );

      const [entry] = loadRecentHistory(sid, 10);
      expect(entry.speakerName).toBe("李四");
      expect(entry.speakerId).toBe("10002");
      expect(entry.triggered).toBe(true);
      expect(entry.content).toBe("你知道吗");
    });

    it("旧格式 @ 触发（真实写入格式，无标记）triggered 保持 undefined 以便进滑动窗口", () => {
      const sid = "channel:qq:legacy-at";
      const filePath = path.join(HISTORY_TMP, "channels", "history", `${sid.replace(/[:/\\<>:"|?*]/g, "_")}.jsonl`);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(
        filePath,
        JSON.stringify({
          role: "user",
          content: "[群聊发送者：小明 (10001)]\n大家好",
          at: "2024-01-15T10:33:00.000Z",
        }) + "\n",
        "utf8",
      );

      const [entry] = loadRecentHistory(sid, 10);
      expect(entry.speakerName).toBe("小明");
      expect(entry.speakerId).toBe("10001");
      expect(entry.triggered).toBeUndefined();
      expect(entry.content).toBe("大家好");
      // 不可推断的触发轮必须落进滑动窗口，而不是被判成旁听
      expect(loadRecentHistory(sid, 10, { conversationOnly: true })).toHaveLength(1);
      expect(loadRecentHistory(sid, 10, { observedOnly: true })).toEqual([]);
    });

    it("旧格式真实的关键词提示行被识别为 triggered，且提示行不进正文", () => {
      const sid = "channel:qq:legacy-kw-real";
      const filePath = path.join(HISTORY_TMP, "channels", "history", `${sid.replace(/[:/\\<>:"|?*]/g, "_")}.jsonl`);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(
        filePath,
        JSON.stringify({
          role: "user",
          content:
            "[群聊发送者：小明 (10001)]\n[本条消息命中触发关键词（未 @ 你），按约定需要你回复]\n你好",
          at: "2024-01-15T10:34:00.000Z",
        }) + "\n",
        "utf8",
      );

      const [entry] = loadRecentHistory(sid, 10);
      expect(entry.speakerName).toBe("小明");
      expect(entry.speakerId).toBe("10001");
      expect(entry.triggered).toBe(true);
      expect(entry.content).toBe("你好");
    });

    it("旧格式带引用的记录只剥发送者前缀，引用行保留", () => {
      const sid = "channel:qq:legacy-reply";
      const filePath = path.join(HISTORY_TMP, "channels", "history", `${sid.replace(/[:/\\<>:"|?*]/g, "_")}.jsonl`);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(
        filePath,
        JSON.stringify({
          role: "user",
          content: "[群聊发送者：小明 (10001)]\n引用 小红：前一条\n你好",
          at: "2024-01-15T10:35:00.000Z",
        }) + "\n",
        "utf8",
      );

      const [entry] = loadRecentHistory(sid, 10);
      expect(entry.content).toBe("引用 小红：前一条\n你好");
    });

    it("旧格式的触发词标记同样被识别为 triggered", () => {
      const sid = "channel:qq:legacy-kw";
      const filePath = path.join(HISTORY_TMP, "channels", "history", `${sid.replace(/[:/\\<>:"|?*]/g, "_")}.jsonl`);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(
        filePath,
        JSON.stringify({
          role: "user",
          content: "[群聊发送者：王五](触发词)\n在吗",
          at: "2024-01-15T10:32:00.000Z",
        }) + "\n",
        "utf8",
      );

      const [entry] = loadRecentHistory(sid, 10);
      expect(entry.speakerName).toBe("王五");
      expect(entry.triggered).toBe(true);
      expect(entry.content).toBe("在吗");
    });

    // —— 缺陷 #2 回归：昵称里带 `]` 会打穿旧前缀解析 ——
    it("旧格式昵称含 ] 时仍能拆出 speakerName + QQ 号 + 纯正文", () => {
      const sid = "channel:qq:legacy-bracket-name";
      const filePath = path.join(HISTORY_TMP, "channels", "history", `${sid.replace(/[:/\\<>:"|?*]/g, "_")}.jsonl`);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(
        filePath,
        JSON.stringify({
          role: "user",
          content: "[群聊发送者：[b°t]BEIKIA (2914636187)]\n111",
          at: "2024-01-15T10:36:00.000Z",
        }) + "\n",
        "utf8",
      );

      const [entry] = loadRecentHistory(sid, 10);
      // 昵称内部的 `]` 不能当成分隔符，否则会留下 "BEIKIA (2914636187)]\n111" 这种残片
      expect(entry.speakerName).toBe("[b°t]BEIKIA");
      expect(entry.speakerId).toBe("2914636187");
      expect(entry.content).toBe("111");
      expect(entry.content).not.toContain("]");
    });
  });

  describe("loadRecentHistory 过滤 (对话 / 旁听分流)", () => {
    it("conversationOnly 排除旁听，保留触发轮与 assistant", () => {
      const sid = "channel:qq:filter-conv";
      appendHistory(sid, "user", "闲聊一", { speakerId: "u9", triggered: false });
      appendHistory(sid, "user", "正式问", { speakerId: "u1", triggered: true });
      appendHistory(sid, "assistant", "昔涟答复", { isBot: true });
      appendHistory(sid, "user", "闲聊二", { speakerId: "u8", triggered: false });

      const got = loadRecentHistory(sid, 10, { conversationOnly: true });
      expect(got.map((e) => e.content)).toEqual(["正式问", "昔涟答复"]);
    });

    it("observedOnly 只保留未触发的 user", () => {
      const sid = "channel:qq:filter-obs";
      appendHistory(sid, "user", "闲聊", { speakerId: "u9", triggered: false });
      appendHistory(sid, "user", "正式问", { speakerId: "u1", triggered: true });
      expect(loadRecentHistory(sid, 10, { observedOnly: true }).map((e) => e.content))
        .toEqual(["闲聊"]);
    });

    it("triggered 缺失的记录（私聊/旧数据）默认进滑动窗口", () => {
      const sid = "channel:qq:filter-legacy";
      appendHistory(sid, "user", "私聊或旧消息"); // 无 meta
      const conv = loadRecentHistory(sid, 10, { conversationOnly: true });
      const obs = loadRecentHistory(sid, 10, { observedOnly: true });
      expect(conv.map((e) => e.content)).toEqual(["私聊或旧消息"]);
      expect(obs).toEqual([]);
    });

    it("先过滤再截断：刷屏旁听不会挤掉正式轮", () => {
      const sid = "channel:qq:filter-flood";
      appendHistory(sid, "user", "重要的正式问", { speakerId: "u1", triggered: true });
      for (let i = 0; i < 20; i++) {
        appendHistory(sid, "user", `旁听${i}`, { speakerId: "u9", triggered: false });
      }
      const got = loadRecentHistory(sid, 5, { conversationOnly: true });
      expect(got.map((e) => e.content)).toEqual(["重要的正式问"]);
    });

    it("两个开关同时为真时 observedOnly 优先", () => {
      const sid = "channel:qq:filter-both";
      appendHistory(sid, "user", "闲聊", { speakerId: "u9", triggered: false });
      appendHistory(sid, "user", "正式问", { speakerId: "u1", triggered: true });
      const got = loadRecentHistory(sid, 10, { observedOnly: true, conversationOnly: true });
      expect(got.map((e) => e.content)).toEqual(["闲聊"]);
    });

    it("不传 query 时行为不变（不过滤，只截断）", () => {
      const sid = "channel:qq:filter-none";
      appendHistory(sid, "user", "闲聊", { speakerId: "u9", triggered: false });
      appendHistory(sid, "user", "正式问", { speakerId: "u1", triggered: true });
      expect(loadRecentHistory(sid, 10).map((e) => e.content)).toEqual(["闲聊", "正式问"]);
    });
  });

  describe("温层归档 (超窗口原文不丢)", () => {
    it("超窗口被丢弃的行进入归档，最新数据仍留热层", () => {
      const sid = "channel:qq:archive-a";
      for (let i = 0; i < 250; i++) appendHistory(sid, "user", `msg${i}`);

      const months = listArchiveMonths(sid);
      expect(months.length).toBeGreaterThan(0);
      const archived = months.flatMap((m) => loadArchivedHistory(sid, m)).map((e) => e.content);
      expect(archived).toContain("msg0"); // 最老的被归档
      expect(archived).not.toContain("msg249"); // 最新的仍在热层
      // 热层既有的 "msg50 最老 / msg249 最新" 断言不因归档而改变（见上方截断用例）
      expect(loadRecentHistory(sid, 250)[0].content).toBe("msg50");
    });

    it("按月分桶", () => {
      const sid = "channel:qq:archive-months";
      const fp = path.join(
        HISTORY_TMP, "channels", "history",
        sid.replace(/[:/\\<>:"|?*]/g, "_") + ".jsonl",
      );
      fs.mkdirSync(path.dirname(fp), { recursive: true });
      fs.writeFileSync(
        fp,
        JSON.stringify({ role: "user", content: "九月", at: "2026-09-30T10:00:00.000Z" }) + "\n" +
        JSON.stringify({ role: "user", content: "十月", at: "2026-10-01T10:00:00.000Z" }) + "\n",
        "utf8",
      );
      for (let i = 0; i < 205; i++) appendHistory(sid, "user", `pad${i}`);

      expect(listArchiveMonths(sid).sort()).toEqual(["2026-09", "2026-10"]);
      expect(loadArchivedHistory(sid, "2026-09")[0].content).toBe("九月");
      expect(loadArchivedHistory(sid, "2026-10")[0].content).toBe("十月");
    });

    it("归档不进入 prompt 路径", () => {
      const sid = "channel:qq:archive-not-prompt";
      for (let i = 0; i < 250; i++) {
        appendHistory(sid, "user", `msg${i}`, { speakerId: "u1", triggered: false });
      }
      // 热层只有最近 200 条，旁听块也只从热层取
      const block = buildGroupContextBlock(sid, 500)!;
      expect(block).not.toContain("msg0");
    });

    it("读取不存在的月份返回空数组", () => {
      expect(loadArchivedHistory("channel:qq:archive-missing", "1999-01")).toEqual([]);
      expect(listArchiveMonths("channel:qq:archive-missing")).toEqual([]);
    });
  });

  describe("buildGroupContextBlock", () => {
    it("无记录时返回 null", () => {
      expect(buildGroupContextBlock("channel:qq:empty-group", 10)).toBeNull();
    });

    it("只渲染旁听消息（未触发昔涟的群友发言），触发轮交给滑动窗口", () => {
      const sid = "channel:qq:ctx";
      appendHistory(sid, "user", "有人知道 TypeScript 的联合类型怎么收窄吗", {
        speakerId: "u1", speakerName: "张三", isBot: false, triggered: false,
      });
      appendHistory(sid, "user", "用 type guard 啊", {
        speakerId: "u2", speakerName: "李四", isBot: false, triggered: false,
      });
      appendHistory(sid, "user", "你知道吗", {
        speakerId: "u3", speakerName: "王五", isBot: false, triggered: true,
      });

      const block = buildGroupContextBlock(sid, 10)!;
      expect(block).toContain("【群聊近期上下文】");
      expect(block).toContain("[张三]: 有人知道 TypeScript 的联合类型怎么收窄吗");
      expect(block).toContain("[李四]: 用 type guard 啊");
      // 被叫起来的轮次走滑动窗口，不在旁听块里重复出现
      expect(block).not.toContain("王五");
      expect(block).not.toContain("@昔涟");
      // 同一批消息不会两边都有：触发轮只出现在滑动窗口里
      expect(loadRecentHistory(sid, 10, { conversationOnly: true }).map((e) => e.speakerName))
        .toEqual(["王五"]);

      // limit 只保留最近 2 条旁听
      const tail = buildGroupContextBlock(sid, 2)!;
      expect(tail).toContain("最近的 2 条发言");
      expect(tail).toContain("张三");
      expect(tail).toContain("李四");
    });

    it("昔涟自己的回复不进旁听块（只有旁听时才有块）", () => {
      const sid = "channel:qq:ctx-bot";
      appendHistory(sid, "assistant", "我记得是 type guard", { isBot: true });
      // 没有旁听消息 → 不注入上下文块
      expect(buildGroupContextBlock(sid, 10)).toBeNull();
    });

    it("旁听块只含旁听消息，不含 assistant 回复", () => {
      const sid = "channel:qq:ctx-bot-mixed";
      appendHistory(sid, "user", "你知道吗", {
        speakerId: "u3", speakerName: "王五", isBot: false, triggered: true,
      });
      appendHistory(sid, "assistant", "我记得是 type guard", { isBot: true });
      appendHistory(sid, "user", "另外问一句", {
        speakerId: "u4", speakerName: "赵六", isBot: false, triggered: false,
      });

      const block = buildGroupContextBlock(sid, 10)!;
      expect(block).toContain("[赵六]: 另外问一句");
      expect(block).not.toContain("昔涟");
      expect(block).not.toContain("type guard");
      expect(block).not.toContain("王五");
    });

    it("没有昵称时回落到 speakerId", () => {
      const sid = "channel:qq:ctx-noname";
      appendHistory(sid, "user", "你好", { speakerId: "10086", isBot: false, triggered: false });
      expect(buildGroupContextBlock(sid, 10)).toContain("[10086]: 你好");
    });
  });

  describe("端到端分流：滑动窗口 + 旁听块互斥且不重复", () => {
    it("A 旁听提问 / B 触发请求：A 只在旁听块，B 只在滑动窗口", () => {
      const sid = "channel:qq:e2e";
      // A 未 @ 昔涟 → 旁听
      appendHistory(sid, "user", "TypeScript 联合类型怎么收窄", {
        speakerId: "10001", speakerName: "张三", isBot: false, triggered: false,
      });
      // B @ 昔涟 → 正式轮（写入时已剥掉发送者前缀）
      appendHistory(sid, "user", "你知道吗", {
        speakerId: "10002", speakerName: "李四", isBot: false, triggered: true,
      });
      appendHistory(sid, "assistant", "我记得是 type guard", { isBot: true });

      const block = buildGroupContextBlock(sid, 10)!;
      const window = loadRecentHistory(sid, 16, { conversationOnly: true });

      // A 只在旁听块
      expect(block).toContain("[张三]: TypeScript 联合类型怎么收窄");
      expect(window.map((e) => e.content)).not.toContain("TypeScript 联合类型怎么收窄");
      // B 只在滑动窗口
      expect(block).not.toContain("李四");
      expect(window.map((e) => e.content)).toEqual(["你知道吗", "我记得是 type guard"]);
    });

    it("滑动窗口条目保留说话人字段，供 bootstrap 补回 [说话人] 前缀", () => {
      const sid = "channel:qq:e2e-speaker";
      appendHistory(sid, "user", "你知道吗", {
        speakerId: "10002", speakerName: "李四", isBot: false, triggered: true,
      });

      const [entry] = loadRecentHistory(sid, 16, { conversationOnly: true });
      // history-log 只负责把说话人结构化，正文里不留前缀（由 bootstrap 统一补）
      expect(entry.content).toBe("你知道吗");
      expect(entry.speakerName).toBe("李四");
      expect(entry.content).not.toContain("[群聊发送者：");
    });
  });

  // Phase 3 P1：给每条渠道消息一个稳定 id，让 L2 记忆的 sourceMessageIds 能指回原话。
  // 本阶段只是"让数据存在"，没有任何用户可见行为变化。
  describe("消息身份 id (Phase 3 P1)", () => {
    const ID_RE = /^msg_\d+_[a-z0-9]+$/;

    it("createMessageId: 格式为 msg_<ts>_<rand6>", () => {
      expect(createMessageId()).toMatch(ID_RE);
      expect(createMessageId(1758681234567)).toMatch(/^msg_1758681234567_/);
    });

    it("createMessageId: 连续 1000 次无重复", () => {
      const ids = new Set<string>();
      for (let i = 0; i < 1000; i++) ids.add(createMessageId());
      expect(ids.size).toBe(1000);
    });

    it("appendHistory 返回带 id 的落盘对象", () => {
      const sid = "channel:qq:id-return";
      const entry = appendHistory(sid, "user", "你好", {
        speakerId: "10001", speakerName: "小明", isBot: false, triggered: true,
      });

      expect(entry).not.toBeNull();
      expect(entry!.id).toMatch(ID_RE);
      expect(entry!.role).toBe("user");
      expect(entry!.content).toBe("你好");
      expect(entry!.speakerId).toBe("10001");
    });

    it("返回值与落盘内容一致（同一个 id）", () => {
      const sid = "channel:qq:id-roundtrip";
      const entry = appendHistory(sid, "assistant", "收到", { isBot: true })!;

      const [persisted] = loadRecentHistory(sid, 10);
      expect(persisted.id).toBe(entry.id);
      expect(persisted.id).toBeDefined();
    });

    it("两次调用 id 不同", () => {
      const sid = "channel:qq:id-unique";
      const a = appendHistory(sid, "user", "第一句")!;
      const b = appendHistory(sid, "user", "第二句")!;
      expect(a.id).not.toBe(b.id);
      // 落盘的两行也必须是两个不同的 id
      expect(loadRecentHistory(sid, 10).map((e) => e.id)).toEqual([a.id, b.id]);
    });

    it("空 sessionId / 空 content 返回 null 且不写任何文件", () => {
      expect(appendHistory("", "user", "hello")).toBeNull();
      expect(appendHistory("channel:feishu:empty", "user", "")).toBeNull();

      const historyDir = path.join(HISTORY_TMP, "channels", "history");
      const files = fs.existsSync(historyDir) ? fs.readdirSync(historyDir) : [];
      expect(files).toEqual([]);
    });

    it("落盘 IO 失败时返回 null（不产生悬空指针）", () => {
      const sid = "channel:qq:id-iofail";
      // 把 history 目录占成"文件"，mkdirSync 必然失败 → 走落盘失败分支
      const historyDir = path.join(HISTORY_TMP, "channels", "history");
      fs.mkdirSync(path.dirname(historyDir), { recursive: true });
      fs.writeFileSync(historyDir, "not a directory", "utf8");
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

      try {
        expect(appendHistory(sid, "user", "写不进去")).toBeNull();
        // 指针若指向一条根本没落盘的消息，P3 擦除时无法区分"已删干净"和"从来没有"
        expect(loadRecentHistory(sid, 10)).toEqual([]);
        expect(warn).toHaveBeenCalled();
      } finally {
        warn.mockRestore();
        fs.rmSync(historyDir, { force: true }); // 清掉占位文件，别污染后续用例与 beforeEach
      }
    });

    it("老格式行（无 id）读回后 id === undefined 且不抛错", () => {
      const sid = "channel:qq:id-legacy-line";
      const fp = path.join(
        HISTORY_TMP, "channels", "history",
        `${sid.replace(/[:/\\<>:"|?*]/g, "_")}.jsonl`,
      );
      fs.mkdirSync(path.dirname(fp), { recursive: true });
      fs.writeFileSync(
        fp,
        JSON.stringify({ role: "user", content: "老消息", at: "2026-01-01T00:00:00.000Z" }) + "\n",
        "utf8",
      );

      const read = () => loadRecentHistory(sid, 10);
      expect(read).not.toThrow();
      const [entry] = read();
      expect(entry.id).toBeUndefined();
      expect(entry.content).toBe("老消息");
    });

    it("新旧混排时老行无 id、新行有 id，互不影响", () => {
      const sid = "channel:qq:id-mixed";
      const fp = path.join(
        HISTORY_TMP, "channels", "history",
        `${sid.replace(/[:/\\<>:"|?*]/g, "_")}.jsonl`,
      );
      fs.mkdirSync(path.dirname(fp), { recursive: true });
      fs.writeFileSync(
        fp,
        JSON.stringify({ role: "user", content: "老消息", at: "2026-01-01T00:00:00.000Z" }) + "\n",
        "utf8",
      );
      appendHistory(sid, "user", "新消息");

      const [oldEntry, newEntry] = loadRecentHistory(sid, 10);
      expect(oldEntry.id).toBeUndefined();
      expect(newEntry.id).toMatch(ID_RE);
    });

    it("归档保留 id（截断下来的 raw line 原样搬运）", () => {
      const sid = "channel:qq:id-archive";
      const returned: string[] = [];
      for (let i = 0; i < 250; i++) {
        returned.push(appendHistory(sid, "user", `msg${i}`)!.id);
      }

      const archived = listArchiveMonths(sid)
        .flatMap((m) => loadArchivedHistory(sid, m));
      expect(archived.length).toBeGreaterThan(0);
      // 归档是 raw line 搬运，id 必须跟着走，且不重复
      for (const e of archived) expect(e.id).toMatch(ID_RE);
      expect(archived[0].id).toBe(returned[0]);
      expect(new Set(archived.map((e) => e.id)).size).toBe(archived.length);
    });

    it("迁移保留 id（copyFileSync 原样搬运）", () => {
      const legacy = "channel:feishu:id-legacy";
      const fresh = "channel:feishu:id-fresh";
      const first = appendHistory(legacy, "user", "旧会话消息")!;
      const second = appendHistory(legacy, "assistant", "旧回复")!;

      migrateHistory(legacy, fresh);

      // 原文件保留作兜底，新键拿到同一批 id
      expect(loadRecentHistory(fresh, 16).map((e) => e.id))
        .toEqual([first.id, second.id]);
      expect(loadRecentHistory(legacy, 16).map((e) => e.id))
        .toEqual([first.id, second.id]);
    });

    it("旧前缀归一化不吞掉 id", () => {
      const sid = "channel:qq:id-legacy-prefix";
      const fp = path.join(
        HISTORY_TMP, "channels", "history",
        `${sid.replace(/[:/\\<>:"|?*]/g, "_")}.jsonl`,
      );
      fs.mkdirSync(path.dirname(fp), { recursive: true });
      fs.writeFileSync(
        fp,
        JSON.stringify({
          id: "msg_1758681234567_a3f9k2",
          role: "user",
          content: "[群聊发送者：李四 (10002)](@昔涟)\n你知道吗",
          at: "2026-01-01T00:00:00.000Z",
        }) + "\n",
        "utf8",
      );

      const [entry] = loadRecentHistory(sid, 10);
      expect(entry.id).toBe("msg_1758681234567_a3f9k2");
      expect(entry.speakerName).toBe("李四");
      expect(entry.content).toBe("你知道吗");
    });

    it("meta 里混进 id 不会被采纳（id 只能由 appendHistory 生成）", () => {
      const sid = "channel:qq:id-forgery";
      // 类型层已经排除 id（见下一个用例），这里再锁一层运行时行为：
      // 即便有 JS 调用方绕过类型塞进 id，appendHistory 也只挑白名单字段。
      const forged = { id: "msg_1_fake", speakerId: "10001" } as unknown as HistoryEntryMeta;
      const entry = appendHistory(sid, "user", "正文", forged)!;

      expect(entry.id).not.toBe("msg_1_fake");
      expect(entry.id).toMatch(ID_RE);
      expect(loadRecentHistory(sid, 10)[0].id).toBe(entry.id);
    });

    it("HistoryEntryMeta 不得包含 id（类型层防线，由 §4.3 编译期断言锁住）", () => {
      // ⚠️ 现状局限：本仓库没有覆盖 *.test.ts 的 tsconfig，vitest 走 esbuild 不做类型检查，
      //    所以这条断言在今天的流水线里**不会真的报错**（见施工记录"偏离"一节）。
      //    它仍然有价值：任何人日后加 test tsconfig / 开 vitest typecheck 时立刻生效。
      type HasId = "id" extends keyof HistoryEntryMeta ? true : false;
      const mustBeFalse: HasId = false;
      expect(mustBeFalse).toBe(false);

      // 运行时的等价保证由上一个用例（meta 里混进 id 不会被采纳）真正锁住。
      const persisted: PersistedHistoryEntry = appendHistory("channel:qq:id-type", "user", "x")!;
      expect(persisted.id).toMatch(ID_RE);
    });

    // §0.3 验收标准的自动化版本：不 mock appendChannelHistory，直接用它在本文件里
    // 已经 mock 掉 electron 的真实实现，接线方式与 bootstrap.ts 完全一致。
    it("验收：appendIncomingContext 返回的 id 就是落盘那一行的 id", async () => {
      const sid = "channel:qq:acceptance";
      const context = createChannelContext({
        appendChannelHistory: appendHistory, // = bootstrap.ts 的接线
        migrateHistory,
      });
      const msg = {
        channel: "qq",
        chatType: "group",
        senderId: "10001",
        senderName: "小明",
        chatId: "20001",
        text: "你好",
        at: new Date(0),
      } as const;

      const entry = await context.appendIncomingContext(msg, { sessionId: sid });

      expect(entry).not.toBeNull();
      expect(entry!.id).toMatch(ID_RE);
      // 落盘的最后一行的 id 必须与返回值一致，且正文已剥掉发送者前缀
      const persisted = loadRecentHistory(sid, 10).at(-1)!;
      expect(persisted.id).toBe(entry!.id);
      expect(persisted.content).toBe("你好");
      expect(persisted.speakerId).toBe("10001");
      expect(persisted.triggered).toBe(true);
    });
  });
});
