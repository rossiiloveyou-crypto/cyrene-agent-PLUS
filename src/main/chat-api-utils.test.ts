import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const ROOT = path.join(os.tmpdir(), "cyrene-chat-api-utils-test");

vi.mock("electron", () => ({
  app: { getPath: () => ROOT },
}));

// 必须在 mock 后 import
import {
  appendApiLog,
  buildChatCompletionsUrl,
  eraseApiLog,
  getApiLogPath,
  normalizeChatMessages,
} from "./chat-api-utils";

describe("chat-api-utils", () => {
  beforeEach(() => {
    fs.rmSync(ROOT, { recursive: true, force: true });
    // appendApiLog 是裸 appendFileSync（不建目录），所以 userData 根要先存在（真实环境里它总是存在）
    fs.mkdirSync(ROOT, { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(ROOT, { recursive: true, force: true });
  });

  it("getApiLogPath 指向 userData 根目录下的 chat-api.log", () => {
    expect(getApiLogPath()).toBe(path.join(ROOT, "chat-api.log"));
  });

  it("appendApiLog 把 request/response 正文逐次追加（既有行为不变）", () => {
    appendApiLog("label-1", [{ role: "user", content: "你好" }], "raw-1", "clean-1");
    appendApiLog("label-2", [{ role: "user", content: "在吗" }], "raw-2", "clean-2");

    const body = fs.readFileSync(getApiLogPath(), "utf8");
    expect(body).toContain("REQUEST");
    expect(body).toContain("你好");
    expect(body).toContain("clean-2");
  });

  // —— P3 擦除某人：这份日志含**每次模型调用的完整 prompt 正文**，整份销毁 ——

  describe("eraseApiLog（P3）", () => {
    it("整份删除并如实回报字节数", () => {
      appendApiLog("label", [{ role: "user", content: "他说的原话" }], "raw", "clean");
      const size = fs.statSync(getApiLogPath()).size;
      expect(size).toBeGreaterThan(0);

      const result = eraseApiLog();

      expect(result).toEqual({ deleted: true, bytes: size });
      expect(fs.existsSync(getApiLogPath())).toBe(false);
    });

    it("文件不存在时返回 deleted:false / bytes:0，且绝不抛错", () => {
      expect(eraseApiLog()).toEqual({ deleted: false, bytes: 0 });
      // 幂等：连续调用不报错
      expect(() => eraseApiLog()).not.toThrow();
    });

    it("删除失败（目标是目录）时不抛错，如实回报 deleted:false", () => {
      fs.mkdirSync(getApiLogPath(), { recursive: true });

      let result: { deleted: boolean; bytes: number } | null = null;
      expect(() => {
        result = eraseApiLog();
      }).not.toThrow();

      expect(result!.deleted).toBe(false);
      expect(fs.existsSync(getApiLogPath())).toBe(true);
    });
  });

  it("buildChatCompletionsUrl / normalizeChatMessages 既有行为不变", () => {
    expect(buildChatCompletionsUrl("https://api.example.com/v1/")).toBe("https://api.example.com/v1/chat/completions");
    expect(buildChatCompletionsUrl("https://api.example.com/v1/chat/completions")).toBe("https://api.example.com/v1/chat/completions");
    expect(normalizeChatMessages([{ role: "user", content: "你好" }])).toHaveLength(1);
  });
});
