import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const ROOT = path.join(os.tmpdir(), "cyrene-message-log-test");

vi.mock("electron", () => ({
  app: { getPath: () => ROOT },
}));

// 必须在 mock 后 import
import {
  appendLog,
  clearLog,
  countPersonLog,
  erasePersonLog,
  getRecentLog,
  reloadLogFromDisk,
} from "./message-log";

function logPath(): string {
  return path.join(ROOT, "channels", "log.jsonl");
}

function baseEntry(senderId: string, text: string) {
  return { dir: "incoming" as const, channel: "qq", senderId, chatId: "20001", text };
}

describe("channels/message-log", () => {
  beforeEach(() => {
    clearLog();
    fs.rmSync(ROOT, { recursive: true, force: true });
  });

  afterAll(() => {
    fs.rmSync(ROOT, { recursive: true, force: true });
  });

  it("追加写入 JSONL（一行一 JSON）", () => {
    appendLog(baseEntry("10001", "你好"));

    const lines = fs.readFileSync(logPath(), "utf8").trim().split("\n");
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]).senderId).toBe("10001");
    expect(getRecentLog(10).map((entry) => entry.text)).toEqual(["你好"]);
  });

  // —— P3 擦除某人：磁盘逐行过滤重写 + 内存数组清理 ——

  describe("erasePersonLog / countPersonLog（P3）", () => {
    it("磁盘与内存同时清，别的发送者一条不动", () => {
      appendLog(baseEntry("10001", "我的话"));
      appendLog(baseEntry("10002", "别人的话"));
      appendLog(baseEntry("10001", "我又说了一句"));

      const result = erasePersonLog("10001");

      expect(result).toEqual({ lines: 2, failed: [] });
      const kept = fs.readFileSync(logPath(), "utf8").trim().split("\n").map((line) => JSON.parse(line));
      expect(kept.map((entry) => entry.text)).toEqual(["别人的话"]);
      // 内存数组也清了（getRecentLog 走内存）
      expect(getRecentLog(10).map((entry) => entry.text)).toEqual(["别人的话"]);
    });

    it("坏行原样保留，不因为一行坏 JSON 丢别人的日志", () => {
      appendLog(baseEntry("10001", "我的话"));
      fs.appendFileSync(logPath(), "{这不是 JSON\n", "utf8");
      appendLog(baseEntry("10002", "别人的话"));

      const result = erasePersonLog("10001");

      expect(result.lines).toBe(1);
      const body = fs.readFileSync(logPath(), "utf8");
      expect(body).toContain("{这不是 JSON");
      expect(body).toContain("别人的话");
      expect(body).not.toContain("我的话");
    });

    it("过滤后重写保持 JSONL 格式与结尾换行（重启后仍能读到别人的行）", async () => {
      appendLog(baseEntry("10001", "我的话"));
      appendLog(baseEntry("10002", "别人的话"));

      erasePersonLog("10001");

      const body = fs.readFileSync(logPath(), "utf8");
      expect(body.endsWith("\n")).toBe(true);
      expect(JSON.parse(body.trim()).text).toBe("别人的话");

      // 模拟重启：新模块实例从磁盘恢复，只能看到别人的行
      vi.resetModules();
      const fresh = await import("./message-log");
      fresh.reloadLogFromDisk();
      expect(fresh.getRecentLog(10).map((entry) => entry.text)).toEqual(["别人的话"]);
      expect(fresh.countPersonLog("10001")).toBe(0);
    });

    it("无命中时是 no-op：文件字节不变、返回 0", () => {
      appendLog(baseEntry("10001", "我的话"));
      const before = fs.readFileSync(logPath(), "utf8");

      const result = erasePersonLog("查无此人");

      expect(result).toEqual({ lines: 0, failed: [] });
      expect(fs.readFileSync(logPath(), "utf8")).toBe(before);
    });

    it("文件不存在时不抛错", () => {
      expect(() => erasePersonLog("10001")).not.toThrow();
      expect(erasePersonLog("10001")).toEqual({ lines: 0, failed: [] });
    });

    it("countPersonLog 只读，且与 erasePersonLog 的 lines 一致（预演 = 执行）", () => {
      appendLog(baseEntry("10001", "我的话"));
      appendLog(baseEntry("10002", "别人的话"));
      appendLog(baseEntry("10001", "我又说了一句"));
      const before = fs.readFileSync(logPath(), "utf8");

      const preview = countPersonLog("10001");

      // 预演零副作用
      expect(fs.readFileSync(logPath(), "utf8")).toBe(before);
      expect(preview).toBe(2);

      const executed = erasePersonLog("10001");
      expect(executed.lines).toBe(preview);

      // 执行后归零；别人一条不动
      expect(countPersonLog("10001")).toBe(0);
      expect(countPersonLog("10002")).toBe(1);
    });

    it("countPersonLog 在没有痕迹 / 文件不存在时返回 0", () => {
      expect(countPersonLog("查无此人")).toBe(0);
      fs.rmSync(logPath(), { force: true });
      expect(countPersonLog("10001")).toBe(0);
    });
  });
});
