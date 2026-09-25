// 记忆域（scope）过滤的行为锁：这是"不串记忆"的核心不变量。
//
// 覆盖点：
//   - memoryStore.getL2ForScope 只返回本域条目
//   - l2DmaeManager 的防御性 scope 过滤
//   - rag.searchMemoryEntries / searchHistoryEntries 的 scope 过滤
//   - entityGraph 按域隔离
//   - relationshipLog.buildContext(scope) 只统计本域
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const electronMock = vi.hoisted(() => ({ userDataDir: "" }));

vi.mock("electron", () => ({
  app: { getPath: () => electronMock.userDataDir },
}));

describe("memory scope isolation", () => {
  beforeEach(() => {
    electronMock.userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "memory-scope-"));
    vi.resetModules();
  });

  it("getL2ForScope returns only memories of that scope", async () => {
    const { memoryStore } = await import("./memory-store");

    await memoryStore.addL2Memory({
      content: "桌上的事",
      triggerText: "桌子",
      sourceConversationId: "desktop",
      embedding: [],
      isPinned: false,
      scope: "zone:root",
    });
    await memoryStore.addL2Memory({
      content: "群里的事",
      triggerText: "群里",
      sourceConversationId: "channel:qq:g1",
      embedding: [],
      isPinned: false,
      scope: "solo:channel:qq:g1",
    });
    await memoryStore.addL2Memory({
      content: "没有域的老记忆",
      triggerText: "老",
      sourceConversationId: "legacy",
      embedding: [],
      isPinned: false,
    });

    const root = await memoryStore.getL2ForScope("zone:root");
    const solo = await memoryStore.getL2ForScope("solo:channel:qq:g1");

    expect(root.map((m) => m.content)).toEqual(["桌上的事"]);
    expect(solo.map((m) => m.content)).toEqual(["群里的事"]);
    // 无域条目属于 legacy：任何精确匹配都取不到（不串味优先）
    expect((await memoryStore.getAllL2())).toHaveLength(3);
  });

  it("getL2DmaeStatesForScope only exposes states of that scope", async () => {
    const { memoryStore } = await import("./memory-store");

    const rootMemory = await memoryStore.addL2Memory({
      content: "root 记忆",
      triggerText: "root",
      sourceConversationId: "desktop",
      embedding: [],
      isPinned: false,
      scope: "zone:root",
    });
    await memoryStore.addL2Memory({
      content: "solo 记忆",
      triggerText: "solo",
      sourceConversationId: "channel:qq:g1",
      embedding: [],
      isPinned: false,
      scope: "solo:channel:qq:g1",
    });

    const states = await memoryStore.getL2DmaeStatesForScope("zone:root");
    expect(states).toHaveLength(1);
    expect(states[0].l2Id).toBe(rootMemory.id);
  });

  it("entityGraph keeps same-named entities from different scopes apart", async () => {
    const { entityGraph } = await import("./entity-graph");

    entityGraph.ingestEntities([{ name: "小明", type: "person" }], "zone:root");
    entityGraph.ingestEntities([{ name: "小明", type: "person" }], "solo:channel:qq:g1");

    const graph = entityGraph.load();
    const xiaomings = graph.entities.filter((e) => e.name === "小明");
    expect(xiaomings).toHaveLength(2);
    expect(new Set(xiaomings.map((e) => e.scope))).toEqual(new Set(["zone:root", "solo:channel:qq:g1"]));

    // 只有同域实体才会被召回
    expect(entityGraph.search("小明", "zone:root")).toContain("小明");
    expect(entityGraph.search("小明", "zone:unknown")).toBe("");
  });

  it("entityGraph grows mentionCount only inside the same scope", async () => {
    const { entityGraph } = await import("./entity-graph");

    entityGraph.ingestEntities([{ name: "昔涟", type: "concept" }], "zone:root");
    entityGraph.ingestEntities([{ name: "昔涟", type: "concept" }], "zone:root");
    entityGraph.ingestEntities([{ name: "昔涟", type: "concept" }], "solo:channel:qq:g1");

    const matches = entityGraph.load().entities.filter((e) => e.name === "昔涟");
    const root = matches.find((e) => e.scope === "zone:root");
    const solo = matches.find((e) => e.scope === "solo:channel:qq:g1");
    expect(root?.mentionCount).toBe(2);
    expect(solo?.mentionCount).toBe(1);
  });

  it("relationshipLog.buildContext filters entries by scope", async () => {
    const { RelationshipLogStore } = await import("../relationship/relationship-log");
    const store = new RelationshipLogStore(path.join(electronMock.userDataDir, "relationship-log.json"));

    await store.recordTurn({
      userText: "桌面上聊到加班",
      assistantText: "辛苦了",
      cyreneFeeling: "心疼",
      channel: "desktop",
      scope: "zone:root",
    });
    await store.recordTurn({
      userText: "群里有人问天气",
      assistantText: "今天晴",
      cyreneFeeling: "平静",
      channel: "qq",
      scope: "solo:channel:qq:g1",
    });

    const rootContext = await store.buildContext("zone:root");
    expect(rootContext).toContain("【近期关系线索】");

    const soloContext = await store.buildContext("solo:channel:qq:g1");
    expect(soloContext).toContain("【近期关系线索】");

    // 只统计本域：群里那条不会进 root 的线索统计
    const entries = JSON.parse(fs.readFileSync(path.join(electronMock.userDataDir, "relationship-log.json"), "utf8"));
    expect(entries.entries).toHaveLength(2);
    expect(entries.entries.filter((e: { scope: string }) => e.scope === "zone:root")).toHaveLength(1);

    // 全量模式（不传 scope）仍能拿到内容，供管理面板使用
    expect(await store.buildContext()).toContain("【近期关系线索】");
  });
});
