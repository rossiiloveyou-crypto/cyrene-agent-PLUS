import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const ROOT = path.join(os.tmpdir(), "cyrene-audit-log-test");

vi.mock("electron", () => ({
  app: { getPath: () => ROOT },
}));

// 必须在 mock 后 import
import {
  appendAudit,
  auditLogsDir,
  auditRootDir,
  auditSenderSlug,
  clearAudit,
  countPersonAudit,
  erasePersonAudit,
  findAudit,
  getAudit,
  normalizeAuditConfig,
  subscribeAudit,
  summarizeToolArgs,
} from "./audit-log";

const base = {
  kind: "tool_call" as const,
  status: "success" as const,
  channel: "qq" as const,
  chatType: "group" as const,
  chatId: "2000",
  senderId: "10001",
  senderName: "阿岚",
  title: "工具 shell",
};

describe("channels/audit-log", () => {
  beforeEach(() => {
    clearAudit();
    fs.rmSync(ROOT, { recursive: true, force: true });
  });

  afterAll(() => {
    fs.rmSync(ROOT, { recursive: true, force: true });
  });

  it("把完整内容写进独立日志文件，索引里只留摘要", () => {
    const long = "x".repeat(6000);
    const entry = appendAudit({
      ...base,
      summary: "跑了 shell",
      args: { command: long },
      sections: [{ heading: "工具输出（完整）", body: long }],
    });

    // 日志文件在专门的文件夹里，且内容不被截断
    expect(entry.logPath.startsWith(auditLogsDir())).toBe(true);
    const body = fs.readFileSync(entry.logPath, "utf8");
    expect(body).toContain("── 工具输出（完整） ──");
    expect(body).toContain(long);
    expect(body).not.toContain("已截断");

    // 索引里参数被截断，只用于列表展示
    const index = fs.readFileSync(path.join(auditRootDir(), "index.jsonl"), "utf8");
    expect(index).toContain(entry.id);
    expect(index).not.toContain(long);
    expect(JSON.parse(index.trim()).logPath).toBe(entry.logPath);
  });

  it("日志文件里保留用户发送的原文与拦截理由", () => {
    const entry = appendAudit({
      ...base,
      kind: "message_blocked",
      status: "blocked",
      title: "消息拦截 · 阿岚（10001）",
      summary: "被拦截用户 阿岚（10001）：加我微信",
      reason: "命中拦截关键词「加微信」",
      userText: "加我微信",
      sections: [{ heading: "拦截理由", body: "命中拦截关键词「加微信」" }],
    });

    const body = fs.readFileSync(entry.logPath, "utf8");
    expect(body).toContain("消息拦截");
    expect(body).toContain("命中拦截关键词「加微信」");
    expect(body).toContain("── 用户发送给昔涟的原文 ──");
    expect(body).toContain("加我微信");
  });

  it("getAudit 返回最新在前，findAudit 可按 id 定位", () => {
    const first = appendAudit({ ...base, summary: "第一条", at: 1_000 });
    const second = appendAudit({ ...base, summary: "第二条", at: 2_000 });

    expect(getAudit(10).map((entry) => entry.id)).toEqual([second.id, first.id]);
    expect(findAudit(first.id)?.summary).toBe("第一条");
    expect(findAudit("不存在")).toBeNull();
  });

  it("订阅者能收到新记录", () => {
    const seen: string[] = [];
    const off = subscribeAudit((entry) => seen.push(entry.id));
    const entry = appendAudit({ ...base, summary: "实时" });
    off();
    appendAudit({ ...base, summary: "订阅已取消" });

    expect(seen).toEqual([entry.id]);
  });

  it("清空会同时删除索引与日志文件", () => {
    const entry = appendAudit({ ...base, summary: "待清空" });
    expect(fs.existsSync(entry.logPath)).toBe(true);

    clearAudit();

    expect(getAudit(10)).toEqual([]);
    expect(fs.existsSync(entry.logPath)).toBe(false);
    expect(fs.existsSync(path.join(auditRootDir(), "index.jsonl"))).toBe(false);
  });

  it("summarizeToolArgs 逐值截断长字符串", () => {
    const summarized = summarizeToolArgs({ short: "ok", long: "y".repeat(1000) });
    expect(summarized.short).toBe("ok");
    expect(String(summarized.long)).toContain("完整内容见日志文件");
  });

  it("normalizeAuditConfig 默认不记录成功对话", () => {
    expect(normalizeAuditConfig(undefined)).toEqual({ recordSuccessTurns: false });
    expect(normalizeAuditConfig({ recordSuccessTurns: "yes" })).toEqual({ recordSuccessTurns: false });
    expect(normalizeAuditConfig({ recordSuccessTurns: true })).toEqual({ recordSuccessTurns: true });
  });

  // —— P3 擦除某人：索引行 / 日志文件 / 内存数组三处同时清 ——

  describe("erasePersonAudit / countPersonAudit（P3）", () => {
    function seedTwoPeople(): { mine: ReturnType<typeof appendAudit>; theirs: ReturnType<typeof appendAudit> } {
      const mine = appendAudit({ ...base, senderId: "10001", senderName: "阿岚", summary: "我的记录", at: 1_000 });
      const theirs = appendAudit({
        ...base,
        senderId: "10002",
        senderName: "小红",
        summary: "别人的记录",
        at: 2_000,
      });
      return { mine, theirs };
    }

    it("三处同时清：索引行、日志文件、内存数组", () => {
      const { mine, theirs } = seedTwoPeople();
      expect(fs.existsSync(mine.logPath)).toBe(true);
      expect(fs.existsSync(theirs.logPath)).toBe(true);

      const result = erasePersonAudit("10001");

      expect(result).toEqual({ entries: 1, files: 1, failed: [] });
      // ② 日志文件：他的删掉，别人的留着
      expect(fs.existsSync(mine.logPath)).toBe(false);
      expect(fs.existsSync(theirs.logPath)).toBe(true);
      // ① 索引：他的行 0 条，别人的行还在（按原字节）
      const index = fs.readFileSync(path.join(auditRootDir(), "index.jsonl"), "utf8");
      expect(index).not.toContain("我的记录");
      expect(index).toContain("别人的记录");
      // ③ 内存：getAudit 走内存，不能再看得到他
      expect(getAudit(10).map((entry) => entry.id)).toEqual([theirs.id]);
      expect(findAudit(mine.id)).toBeNull();
    });

    it("safeSender 片段由共享的 auditSenderSlug 决定（含特殊字符也擦得干净）", () => {
      const entry = appendAudit({
        ...base,
        senderId: "ou_abc:def/../x",
        summary: "带特殊字符的人",
      });
      // 文件名里的片段就是共享 helper 的输出 —— 两处不可能漂移
      expect(path.basename(entry.logPath)).toContain(`-${auditSenderSlug("ou_abc:def/../x")}-`);

      const result = erasePersonAudit("ou_abc:def/../x");

      expect(result.files).toBe(1);
      expect(fs.existsSync(entry.logPath)).toBe(false);
    });

    it("坏索引行原样保留，不因为一行坏 JSON 丢别人的审计", () => {
      appendAudit({ ...base, senderId: "10001", summary: "我的记录", at: 1_000 });
      const indexPath = path.join(auditRootDir(), "index.jsonl");
      fs.appendFileSync(indexPath, "{这不是 JSON\n", "utf8");

      const result = erasePersonAudit("10001");

      expect(result.entries).toBe(1);
      expect(fs.readFileSync(indexPath, "utf8")).toContain("{这不是 JSON");
    });

    it("无命中时是 no-op：索引字节不变、返回全 0", () => {
      seedTwoPeople();
      const indexPath = path.join(auditRootDir(), "index.jsonl");
      const before = fs.readFileSync(indexPath, "utf8");

      const result = erasePersonAudit("查无此人");

      expect(result).toEqual({ entries: 0, files: 0, failed: [] });
      expect(fs.readFileSync(indexPath, "utf8")).toBe(before);
    });

    it("countPersonAudit 只读，且与 erasePersonAudit 的计数一致（预演 = 执行）", () => {
      const { mine, theirs } = seedTwoPeople();
      const indexPath = path.join(auditRootDir(), "index.jsonl");
      const before = fs.readFileSync(indexPath, "utf8");

      const preview = countPersonAudit("10001");

      // 预演零副作用
      expect(fs.readFileSync(indexPath, "utf8")).toBe(before);
      expect(fs.existsSync(mine.logPath)).toBe(true);
      expect(fs.existsSync(theirs.logPath)).toBe(true);
      expect(preview).toEqual({ entries: 1, files: 1 });

      const executed = erasePersonAudit("10001");
      expect(executed.entries).toBe(preview.entries);
      expect(executed.files).toBe(preview.files);

      // 执行后预演数字归零
      expect(countPersonAudit("10001")).toEqual({ entries: 0, files: 0 });
      // 别人一条不动
      expect(countPersonAudit("10002")).toEqual({ entries: 1, files: 1 });
    });

    it("countPersonAudit 在没有痕迹时返回 0 且不抛错", () => {
      expect(countPersonAudit("查无此人")).toEqual({ entries: 0, files: 0 });
    });
  });
});
