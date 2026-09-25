import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const ROOT = path.join(os.tmpdir(), "cyrene-conversation-usage-test");

vi.mock("electron", () => ({
  app: {
    getPath: () => ROOT,
    once: () => undefined,
  },
}));

// 必须在 mock 之后 import
import {
  __resetConversationUsageCacheForTest,
  clearConversationUsage,
  currentConversationSessionId,
  flushConversationUsage,
  getConversationUsage,
  recordConversationUsage,
  runWithConversationScope,
  subscribeConversationUsage,
} from "./conversation-usage-store";
import { recordUsage } from "./token-usage-store";

describe("conversation-usage-store", () => {
  beforeEach(() => {
    __resetConversationUsageCacheForTest();
    fs.rmSync(ROOT, { recursive: true, force: true });
  });

  afterAll(() => {
    fs.rmSync(ROOT, { recursive: true, force: true });
  });

  it("累计输入/输出/缓存命中并算出命中率", () => {
    recordConversationUsage("s1", 100, 20, 1, 80, 5);
    recordConversationUsage("s1", 200, 40, 1, 100);

    const usage = getConversationUsage("s1");
    expect(usage.input).toBe(300);
    expect(usage.output).toBe(60);
    expect(usage.cachedInput).toBe(180);
    expect(usage.requests).toBe(2);
    expect(usage.totalTokens).toBe(360);
    expect(usage.cacheHitRate).toBeCloseTo(0.6);
    expect(usage.hasCacheData).toBe(true);
  });

  it("没有任何缓存上报时命中率为 null", () => {
    recordConversationUsage("s2", 100, 10);

    const usage = getConversationUsage("s2");
    expect(usage.hasCacheData).toBe(false);
    expect(usage.cacheHitRate).toBeNull();
  });

  it("cachedInput 会被夹在 input 之内，避免脏数据把命中率算爆", () => {
    recordConversationUsage("s3", 100, 0, 1, 5000);
    expect(getConversationUsage("s3").cachedInput).toBe(100);
    expect(getConversationUsage("s3").cacheHitRate).toBe(1);
  });

  it("作用域内的全局记账会自动落到该会话，作用域外不归属任何对话", () => {
    expect(currentConversationSessionId()).toBeUndefined();

    runWithConversationScope("session-a", () => {
      expect(currentConversationSessionId()).toBe("session-a");
      recordUsage(1000, 200, 1, 600, "test-model");
    });

    // 作用域外：只进全局统计，不进对话
    recordUsage(50, 5, 1, 0, "test-model");

    expect(getConversationUsage("session-a").totalTokens).toBe(1200);
    expect(getConversationUsage("session-a").cachedInput).toBe(600);
    expect(getConversationUsage("session-b").totalTokens).toBe(0);
  });

  it("订阅者能收到该会话的用量变化（节流后）", async () => {
    const seen: string[] = [];
    const off = subscribeConversationUsage((snapshot) => seen.push(snapshot.sessionId));
    recordConversationUsage("session-c", 1, 1);
    await new Promise((resolve) => setTimeout(resolve, 500));
    off();
    expect(seen).toContain("session-c");
  });

  it("flush 后能从磁盘读回", () => {
    recordConversationUsage("session-d", 10, 2, 1, 4);
    flushConversationUsage();

    expect(fs.existsSync(path.join(ROOT, "conversation-usage.json"))).toBe(true);

    __resetConversationUsageCacheForTest();
    const reloaded = getConversationUsage("session-d");
    expect(reloaded.input).toBe(10);
    expect(reloaded.output).toBe(2);
    expect(reloaded.cachedInput).toBe(4);
  });

  it("可以只清空一个会话", () => {
    recordConversationUsage("session-e", 1, 1);
    recordConversationUsage("session-f", 2, 2);
    clearConversationUsage("session-e");

    expect(getConversationUsage("session-e").totalTokens).toBe(0);
    expect(getConversationUsage("session-f").totalTokens).toBe(4);
  });
});
