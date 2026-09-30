import { describe, expect, it, vi } from "vitest";

/**
 * 🔴 H-26 回归测试：**L0/L1 是用户本人画像，只能出现在开启了「注入本人画像」的域**。
 *
 * 背景（2026-10-01 实测泄漏）：`read_memory` 曾无条件读 `memoryStore.getL0()` / `getL1()`，
 * 于是外部群聊里问「你知道我最近在准备什么考试吗」时，她照着工具输出念出了用户私聊里才说过的
 * 「我最近在准备 CPA」——**上下文注入层挡住了，工具层却原样送出**。
 *
 * 本文件锁两件事：
 * 1. 非 owner 域（外部群聊）调用 `read_memory` 时，输出里**不含**任何 L0/L1 字段；
 * 2. owner 域（桌面私聊）仍然照常读得到（别把功能一起修死）。
 *
 * 之所以用 `resolveScopeId` 的真实语义（而不是 mock 守卫）：泄漏点就在这条调用链上，
 * 守住它的正确性只能靠真实作用域解析 —— 而作用域解析本身零 electron 依赖。
 */

const memoryMocks = vi.hoisted(() => {
  const L0 = {
    preferredName: "BeiKia",
    occupation: "",
    longTermInterests: "",
    language: "zh-CN",
    permanentNote: "我最近在准备 CPA", // ← 泄漏样本
    isPinned: false,
  };
  const L1 = {
    recentGoals: "备考 CPA", // ← 泄漏样本
    recentPreferences: "",
    currentProject: "",
    generatedAt: 0,
    roundCount: 6,
  };
  return {
    L0,
    L1,
    getL0: vi.fn(async () => L0),
    getL1: vi.fn(async () => L1),
    getL2ForScope: vi.fn(async () => [] as unknown[]),
  };
});

vi.mock("../../../memory/memory-store", () => ({
  memoryStore: {
    getL0: memoryMocks.getL0,
    getL1: memoryMocks.getL1,
    getL2ForScope: memoryMocks.getL2ForScope,
  },
}));

// eslint-disable-next-line import/first
import { formatMemoryOverview, toolRegistry } from "./tool-registry";

/**
 * 泄漏样本里出现过的**数据**字符串 —— 输出里一个都不许有。
 *
 * 注意不要用 `"核心画像（L0）"` 这种**标题词**当判据：边界提示本身就含这个标题
 * （`== 核心画像（L0）/ 近期状态（L1）==`），拿它当断言会自己撞自己。
 * 真正要防的是**字段值**与**字段标签行**。
 */
const LEAK_MARKERS = ["CPA", "BeiKia", "备考", "zh-CN", "固定备注", "近期目标", "长期兴趣"];

/** 桌面会话 id（不以 `channel:` 开头）→ root 域 → 允许注入本人画像。 */
const DESKTOP_CONVERSATION_ID = "32f4e10b-799e-44c7-b191-63de5d8a02ea";
/** 渠道会话 id 且未归任何区块 → solo 域 → 绝不允许注入（与外部群聊同一条路径）。 */
const UNZONED_GROUP_SESSION_ID = "channel:qq:ffffffffffffffff";

async function runReadMemory(conversationId: string): Promise<string> {
  const read = toolRegistry.getById("read_memory");
  expect(read).toBeTruthy();
  const result = await read!.execute({}, { conversationId } as never);
  return String(result);
}

describe("H-26 · read_memory 的 L0/L1 域守卫", () => {
  it("外部群聊域：输出里不含任何 L0/L1 内容", async () => {
    const out = await runReadMemory(UNZONED_GROUP_SESSION_ID);

    for (const marker of LEAK_MARKERS) {
      expect(out, `群聊输出不应包含「${marker}」`).not.toContain(marker);
    }
    // 必须显式说明这是**边界**，否则模型会把「看不到」误判成「她没记住」
    expect(out).toContain("不提供本人画像");
    // L2 段照常输出（限域，不给画像不等于不给记忆目录）
    expect(out).toContain("对话记忆（L2");
  });

  it("且不得因此去读全局画像（守卫必须在读取之前生效）", async () => {
    memoryMocks.getL0.mockClear();
    memoryMocks.getL1.mockClear();

    await runReadMemory(UNZONED_GROUP_SESSION_ID);

    expect(memoryMocks.getL0).not.toHaveBeenCalled();
    expect(memoryMocks.getL1).not.toHaveBeenCalled();
  });

  it("桌面私聊（owner 域）：照常读得到 L0/L1", async () => {
    const out = await runReadMemory(DESKTOP_CONVERSATION_ID);

    expect(out).toContain("我最近在准备 CPA");
    expect(out).toContain("备考 CPA");
    expect(out).toContain("== 核心画像（L0）==");
    expect(memoryMocks.getL0).toHaveBeenCalled();
  });

  it("formatMemoryOverview：画像不可见时给边界提示，且不输出空段落", () => {
    const out = formatMemoryOverview(null, null, []);

    expect(out).toContain("不提供本人画像");
    for (const marker of LEAK_MARKERS) {
      expect(out).not.toContain(marker);
    }
    // 不该出现「（空）」——那会被读成「她没记住」；也不该出现 L0/L1 的独立标题段
    expect(out).not.toContain("== 核心画像（L0）==");
    expect(out).not.toContain("== 近期状态（L1）==");
    expect(out).toContain("对话记忆（L2");
  });
});
