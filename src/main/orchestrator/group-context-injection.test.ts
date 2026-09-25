// orchestrator/group-context-injection —— 群聊上下文注入 always-on context 的回归测试。
//
// 覆盖 Phase 1 的核心验收场景：
//   群里 A 问"xxx是什么"（未 @ 昔涟，只是旁听）→ B 说"@昔涟 你知道吗"
//   → 昔涟本轮 prompt 里必须能看到 A 的问题。
import { beforeEach, describe, expect, it, vi } from "vitest";

const ragMock = vi.hoisted(() => ({
  searchMemory: vi.fn(),
  updateWorldbookActivation: vi.fn(),
  getPermanentWorldbookEntries: vi.fn(),
  getActiveWorldbookEntries: vi.fn(),
  getCascadeWorldbookEntries: vi.fn(),
  INJECTION_HEADER: "HEADER",
  INJECTION_PREAMBLE: "PREAMBLE",
}));

const memoryStoreMock = vi.hoisted(() => ({
  getAllL2: vi.fn(),
  getL0: vi.fn(),
  getL1: vi.fn(),
}));

const historyLogMock = vi.hoisted(() => ({
  buildGroupContextBlock: vi.fn(),
}));

vi.mock("../rag", () => ragMock);
vi.mock("../memory/memory-store", () => ({ memoryStore: memoryStoreMock }));
vi.mock("../memory/entity-graph", () => ({ entityGraph: { search: vi.fn(() => "") } }));
vi.mock("../memory/l2-dmae-manager", () => ({ l2DmaeManager: { getActiveL2ForPrompt: vi.fn(async () => []) } }));
vi.mock("./tools/registry/tool-registry", () => ({
  toolRegistry: { getEnabledTools: vi.fn(() => []), getEnabledToolsForMode: vi.fn(() => []) },
}));
vi.mock("../channels/history-log", () => historyLogMock);

import { buildAlwaysOnContext } from "./index";
import { ZoneStore, _resetZoneStoreForTest, getZoneStore } from "../zones/zone-store";

const GROUP_SESSION = "channel:qq:0f1e2d3c4b5a6978";
const PRIVATE_SESSION = "channel:qq:9988776655443322";

/** 把某个渠道会话放进一个开启「注入我的画像」的区块（模拟用户显式授权）。 */
function allowProfileInZone(sessionId: string): void {
  const zone = getZoneStore().createZone({ name: "测试区块" });
  getZoneStore().updateZoneConfig(zone.zoneId, { injectOwnerProfile: true });
  getZoneStore().addExternalMember(zone.zoneId, {
    kind: "external",
    sessionId,
    channel: "qq",
    chatId: sessionId.slice(-8),
    chatType: "group",
  });
}

describe("buildAlwaysOnContext 群上下文注入", () => {
  beforeEach(() => {
    // 纯内存 zone store：filePath=null，单测不落盘、不依赖 Electron app
    _resetZoneStoreForTest(new ZoneStore(null));
    ragMock.getPermanentWorldbookEntries.mockReset().mockReturnValue([]);
    ragMock.getActiveWorldbookEntries.mockReset().mockReturnValue([]);
    ragMock.getCascadeWorldbookEntries.mockReset().mockReturnValue([]);
    memoryStoreMock.getL0.mockReset().mockResolvedValue({});
    memoryStoreMock.getL1.mockReset().mockResolvedValue({});
    historyLogMock.buildGroupContextBlock.mockReset().mockReturnValue(
      [
        "【群聊近期上下文】",
        "以下是你没被叫到时，群里最近的 2 条发言，供你理解当前话题的来龙去脉：",
        "[张三]: xxx是什么",
        "[李四]: 那联合类型呢",
      ].join("\n"),
    );
  });

  it("群聊会话注入群近期上下文，且带上旁听消息", async () => {
    const context = await buildAlwaysOnContext("你知道吗", [], {
      sessionId: GROUP_SESSION,
      chatType: "group",
    });

    expect(historyLogMock.buildGroupContextBlock).toHaveBeenCalledWith(GROUP_SESSION, expect.any(Number));
    expect(context).toContain("【群聊近期上下文】");
    expect(context).toContain("[张三]: xxx是什么");
    expect(context).toContain("[李四]: 那联合类型呢");
    // 旁听块不再渲染被叫起来的轮次（避免与滑动窗口重复注入）
    expect(context).not.toContain("@昔涟");
  });

  it("私聊会话不注入群上下文", async () => {
    const context = await buildAlwaysOnContext("你好", [], {
      sessionId: PRIVATE_SESSION,
      chatType: "private",
    });

    expect(historyLogMock.buildGroupContextBlock).not.toHaveBeenCalled();
    expect(context).not.toContain("【群聊近期上下文】");
  });

  it("会话信息缺失（桌面聊天）时不注入群上下文", async () => {
    const context = await buildAlwaysOnContext("你好", []);

    expect(historyLogMock.buildGroupContextBlock).not.toHaveBeenCalled();
    expect(context).not.toContain("【群聊近期上下文】");
  });

  it("chatType 缺失时不猜群聊（sessionId 是哈希，无法反推）", async () => {
    const context = await buildAlwaysOnContext("你好", [], { sessionId: GROUP_SESSION });

    expect(historyLogMock.buildGroupContextBlock).not.toHaveBeenCalled();
    expect(context).not.toContain("【群聊近期上下文】");
  });

  it("群上下文为空时不产生空段落，其余上下文照常构建", async () => {
    historyLogMock.buildGroupContextBlock.mockReturnValue(null);
    memoryStoreMock.getL0.mockResolvedValue({ preferredName: "小昔" });
    ragMock.getPermanentWorldbookEntries.mockReturnValue(["常驻设定"]);

    const context = await buildAlwaysOnContext("你好", [], {
      sessionId: GROUP_SESSION,
      chatType: "group",
    });

    expect(context).not.toContain("【群聊近期上下文】");
    expect(context).toContain("常驻设定");
    // 未归区的群属于独立域 → 不注入 owner 画像
    expect(context).not.toContain("小昔");
  });

  it("群上下文读取抛错时降级，不影响世界书注入", async () => {
    historyLogMock.buildGroupContextBlock.mockImplementation(() => {
      throw new Error("history 文件损坏");
    });
    ragMock.getPermanentWorldbookEntries.mockReturnValue(["常驻设定"]);

    const context = await buildAlwaysOnContext("你好", [], {
      sessionId: GROUP_SESSION,
      chatType: "group",
    });

    expect(context).toContain("常驻设定");
  });

  it("未归区的群里不注入 L0/L1 画像（隐私边界）", async () => {
    memoryStoreMock.getL0.mockResolvedValue({ preferredName: "小昔", occupation: "保密测试值" });

    const group = await buildAlwaysOnContext("你是谁", [], {
      sessionId: GROUP_SESSION,
      chatType: "group",
    });
    expect(group).not.toContain("[用户画像]");
    expect(group).not.toContain("保密测试值");

    const privateChat = await buildAlwaysOnContext("你是谁", [], {
      sessionId: PRIVATE_SESSION,
      chatType: "private",
    });
    expect(privateChat).not.toContain("保密测试值");

    // 桌面（无 trace）仍然是 owner 域，画像照常注入
    const desktop = await buildAlwaysOnContext("你是谁", []);
    expect(desktop).toContain("[用户画像]");
    expect(desktop).toContain("保密测试值");
  });

  it("区块显式开启画像注入后，该群的 prompt 里会有画像", async () => {
    memoryStoreMock.getL0.mockResolvedValue({ preferredName: "小昔" });
    allowProfileInZone(GROUP_SESSION);

    const context = await buildAlwaysOnContext("你好", [], {
      sessionId: GROUP_SESSION,
      chatType: "group",
    });

    expect(context).toContain("小昔");
  });

  it("群上下文块排在常驻背景之后、画像之前", async () => {
    ragMock.getPermanentWorldbookEntries.mockReturnValue(["常驻设定"]);
    memoryStoreMock.getL0.mockResolvedValue({ preferredName: "小昔" });
    allowProfileInZone(GROUP_SESSION);

    const context = await buildAlwaysOnContext("你好", [], {
      sessionId: GROUP_SESSION,
      chatType: "group",
    });

    expect(context.indexOf("常驻设定")).toBeLessThan(context.indexOf("【群聊近期上下文】"));
    expect(context.indexOf("【群聊近期上下文】")).toBeLessThan(context.indexOf("小昔"));
  });

  it("群上下文条数来自 trace（设置-记忆 的可配置项）", async () => {
    await buildAlwaysOnContext("你好", [], {
      sessionId: GROUP_SESSION,
      chatType: "group",
      groupContextLimit: 3,
    });
    expect(historyLogMock.buildGroupContextBlock).toHaveBeenCalledWith(GROUP_SESSION, 3);

    historyLogMock.buildGroupContextBlock.mockClear();
    await buildAlwaysOnContext("你好", [], {
      sessionId: GROUP_SESSION,
      chatType: "group",
    });
    // 未注入时回落默认值 10
    expect(historyLogMock.buildGroupContextBlock).toHaveBeenCalledWith(GROUP_SESSION, 10);
  });
});
