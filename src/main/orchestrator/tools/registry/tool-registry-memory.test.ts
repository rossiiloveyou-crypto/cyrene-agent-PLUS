import { describe, expect, it, vi } from "vitest";

// write_memory 的 execute 走 require() 懒加载 memory-manager / memory-store，
// 真加载会级联拉起 RAG / electron userData 等重依赖。这里把两者打成 spy：
// 本用例只关心「工具把哪些归属字段钉在了候选上」，落库本身由 memory-manager.test.ts 覆盖。
const memoryMocks = vi.hoisted(() => ({
  writeMemory: vi.fn(async () => undefined),
  getL0: vi.fn(async () => ({ isPinned: false })),
  getL2ForScope: vi.fn(async () => [] as unknown[]),
  getL1: vi.fn(async () => ({
    recentGoals: "",
    recentPreferences: "",
    currentProject: "",
    generatedAt: 0,
    roundCount: 0,
  })),
}));

vi.mock("../../../memory/memory-manager", () => ({
  memoryManager: { writeMemory: memoryMocks.writeMemory },
}));

vi.mock("../../../memory/memory-store", () => ({
  memoryStore: {
    getL0: memoryMocks.getL0,
    getL1: memoryMocks.getL1,
    getL2ForScope: memoryMocks.getL2ForScope,
  },
}));

// eslint-disable-next-line import/first
import { buildWriteCandidate, formatMemoryOverview, toolRegistry } from "./tool-registry";

describe("read_memory / write_memory 工具注册", () => {
  it("两个工具已注册且元数据正确", () => {
    const read = toolRegistry.getById("read_memory");
    expect(read).toBeTruthy();
    expect(read!.effectKind).toBe("read");

    const write = toolRegistry.getById("write_memory");
    expect(write).toBeTruthy();
    expect(write!.effectKind).toBe("mutation");
    // 引导约束：明确"仅限用户主动要求"，防止普通对话误触
    expect(write!.description).toContain("仅限用户主动要求");
    expect(write!.description).toContain("不要主动调用");
  });
});

describe("formatMemoryOverview", () => {
  it("空记忆 → 三层都显示（空）", () => {
    const out = formatMemoryOverview({}, {}, []);
    expect(out).toContain("核心画像（L0）");
    expect(out).toContain("- （空）");
    expect(out).toContain("共 0 条");
  });

  it("L0/L1 有值时展示，L0 锁定时提示", () => {
    const out = formatMemoryOverview(
      { preferredName: "P宝", occupation: "", isPinned: true },
      { recentGoals: "学 Rust" },
      [],
    );
    expect(out).toContain("称呼: P宝");
    expect(out).not.toContain("职业:");
    expect(out).toContain("近期目标: 学 Rust");
    expect(out).toContain("画像已被用户锁定");
  });

  it("L2 目录按时间倒序、超长内容截断、展示总数", () => {
    const items = [
      { id: "l2_old", title: "旧条目", createdAt: 1000, status: "active" },
      { id: "l2_new", title: "新条目", createdAt: 2000, status: "active" },
    ];
    const out = formatMemoryOverview({}, {}, items);
    expect(out).toContain("共 2 条");
    expect(out.indexOf("l2_new")).toBeLessThan(out.indexOf("l2_old"));
  });
});

describe("buildWriteCandidate", () => {
  it("合法参数 → explicit / user_explicit 候选（走 writeMemory 全部既有校验）", () => {
    const c = buildWriteCandidate({
      layer: "l2", content: " 用户下周三体检 ", slug: " 体检安排 ",
      sourceQuote: "记住我下周三要体检", triggerText: "记住我下周三要体检",
    });
    expect(c).toMatchObject({
      layer: "L2",
      content: "用户下周三体检",
      slug: "体检安排",
      certainty: "explicit",
      attribution: "user_explicit",
      shouldWrite: true,
    });
  });

  it("L0/L1 不吞 slug/sourceQuote（writeMemory 约定只有 L2 消费）", () => {
    const c = buildWriteCandidate({
      layer: "L0", field: "occupation", content: "前端工程师",
      slug: "不该出现", sourceQuote: "不该出现", triggerText: "x",
    });
    expect(c?.slug).toBeUndefined();
    expect(c?.sourceQuote).toBeUndefined();
    expect(c?.field).toBe("occupation");
  });

  it("非法 layer / 空 content → null", () => {
    expect(buildWriteCandidate({ layer: "L9", content: "x", triggerText: "x" })).toBeNull();
    expect(buildWriteCandidate({ layer: "L2", content: "  ", triggerText: "x" })).toBeNull();
  });
});

describe("read_memory 工具（P2 顺带确认动态 import 后仍可调用）", () => {
  it("无 id 时返回本域概览，带 id 时返回该条全文", async () => {
    memoryMocks.getL0.mockResolvedValueOnce({
      isPinned: false,
      preferredName: "P宝",
      occupation: "",
      longTermInterests: "",
      language: "",
      permanentNote: "",
    } as never);
    memoryMocks.getL2ForScope.mockResolvedValue([
      {
        id: "l2_1",
        content: "小明最近在学 Rust",
        slug: "学Rust",
        status: "active",
        isPinned: false,
        createdAt: 1_700_000_000_000,
        lastAccessedAt: 1_700_000_000_000,
        accessCount: 2,
      },
    ] as never);
    const read = toolRegistry.getById("read_memory")!;

    const overview = await read.execute({}, { userQuery: "你记得我什么", conversationId: "desktop-1" } as never);
    expect(String(overview)).toContain("l2_1");
    expect(String(overview)).toContain("称呼: P宝");

    const detail = await read.execute({ id: "l2_1" }, { userQuery: "读这条", conversationId: "desktop-1" } as never);
    expect(String(detail)).toContain("小明最近在学 Rust");
    // 限域：读的是本会话所属记忆域
    expect(memoryMocks.getL2ForScope).toHaveBeenCalledWith("zone:root");
  });
});

describe("write_memory 落库字段（P2：补上 sourceConversationId 空串）", () => {  it("工具写入的 L2 候选带来源会话与记忆域", async () => {
    memoryMocks.writeMemory.mockClear();
    const write = toolRegistry.getById("write_memory")!;

    const output = await write.execute(
      { layer: "L2", content: "用户下周三要体检" },
      { userQuery: "记住我下周三要体检", conversationId: "channel:qq:ab12cd34" } as never,
    );

    expect(String(output)).toContain("已写入 L2");
    const candidates = memoryMocks.writeMemory.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(candidates).toHaveLength(1);
    // P2 之前不注入它，memory-manager 的 `?? ""` 会落成空串 —— 连"哪个会话说的"都追不回来
    expect(candidates[0].sourceConversationId).toBe("channel:qq:ab12cd34");
    // 域仍由调度层钉住（不是 LLM 决定）
    expect(candidates[0].scope).toBe("solo:channel:qq:ab12cd34");
  });

  it("桌面对话（非渠道 sessionId）解析成 root 域，且来源会话照常带上", async () => {
    memoryMocks.writeMemory.mockClear();
    const write = toolRegistry.getById("write_memory")!;

    await write.execute(
      { layer: "L2", content: "用户养了一只猫" },
      { userQuery: "记住我养猫", conversationId: "c9a20793-desktop" } as never,
    );

    const candidates = memoryMocks.writeMemory.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(candidates[0].scope).toBe("zone:root");
    expect(candidates[0].sourceConversationId).toBe("c9a20793-desktop");
  });

  it("无 conversationId（老调用方）时 sourceConversationId 为 undefined，落库仍是旧行为", async () => {
    memoryMocks.writeMemory.mockClear();
    const write = toolRegistry.getById("write_memory")!;

    await write.execute({ layer: "L2", content: "用户养了一只猫" }, { userQuery: "记住我养猫" } as never);

    const candidates = memoryMocks.writeMemory.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(candidates[0].sourceConversationId).toBeUndefined();
    expect(candidates[0].scope).toBe("zone:root");
  });

  it("L0 已锁定时直接跳过，不调 writeMemory", async () => {
    memoryMocks.writeMemory.mockClear();
    memoryMocks.getL0.mockResolvedValueOnce({ isPinned: true });
    const write = toolRegistry.getById("write_memory")!;

    const output = await write.execute(
      { layer: "L0", field: "preferredName", content: "P宝" },
      { userQuery: "叫我 P宝", conversationId: "desktop-1" } as never,
    );

    expect(String(output)).toContain("核心画像已被用户锁定");
    expect(memoryMocks.writeMemory).not.toHaveBeenCalled();
  });
});
