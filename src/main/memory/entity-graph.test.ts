// entity-graph 的按名移除（P3 擦除某人）行为锁。
//
// 锁住四件事：
//   ① 名字精确匹配 / 别名匹配都能命中；
//   ② types 过滤生效（同名的人与地点不会被一起删）；
//   ③ 命中节点被删时，任一端指向它的 relations 一起清；
//   ④ 不命中时**一个字都不改、一次都不落盘**（擦除是常用操作，不能无谓重写）。
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const electronMock = vi.hoisted(() => ({ userDataDir: "" }));

vi.mock("electron", () => ({
  app: { getPath: () => electronMock.userDataDir },
}));

interface SeedEntity {
  id: string;
  name: string;
  type: "person" | "place" | "concept" | "preference" | "organization";
  aliases?: string[];
  scope?: string;
}

interface SeedRelation {
  id: string;
  sourceId: string;
  targetId: string;
  relation: string;
}

function seedGraph(entities: SeedEntity[], relations: SeedRelation[] = []): string {
  const filePath = path.join(electronMock.userDataDir, "entity-graph.json");
  fs.writeFileSync(filePath, JSON.stringify({
    entities: entities.map((e) => ({
      aliases: [],
      mentionCount: 1,
      firstMentionedAt: 1,
      lastMentionedAt: 1,
      ...e,
    })),
    relations: relations.map((r) => ({ confidence: 1, strength: 1, ...r })),
  }, null, 2), "utf8");
  return filePath;
}

describe("entityGraph.removeEntities", () => {
  beforeEach(() => {
    electronMock.userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "entity-graph-"));
    vi.resetModules();
  });

  it("按名字精确命中，只删命中节点", async () => {
    const filePath = seedGraph([
      { id: "ent_a", name: "小明", type: "person" },
      { id: "ent_b", name: "小红", type: "person" },
    ]);
    const { entityGraph } = await import("./entity-graph");

    const result = entityGraph.removeEntities({ names: ["小明"] });

    expect(result.nodes.map((n) => n.id)).toEqual(["ent_a"]);
    expect(result.relations).toBe(0);
    expect(entityGraph.load().entities.map((n) => n.name)).toEqual(["小红"]);
    // 磁盘同源：缓存 mutate 后必须已落盘
    const onDisk = JSON.parse(fs.readFileSync(filePath, "utf8")) as { entities: Array<{ name: string }> };
    expect(onDisk.entities.map((n) => n.name)).toEqual(["小红"]);
  });

  it("别名命中同样删掉该节点", async () => {
    seedGraph([
      { id: "ent_a", name: "小明", type: "person", aliases: ["明明", "小明同学"] },
      { id: "ent_b", name: "小红", type: "person", aliases: ["红红"] },
    ]);
    const { entityGraph } = await import("./entity-graph");

    const result = entityGraph.removeEntities({ names: ["明明"] });

    expect(result.nodes.map((n) => n.id)).toEqual(["ent_a"]);
    expect(entityGraph.load().entities.map((n) => n.name)).toEqual(["小红"]);
  });

  it("names 是精确全等匹配，不做子串匹配", async () => {
    seedGraph([{ id: "ent_a", name: "小明", type: "person" }]);
    const { entityGraph } = await import("./entity-graph");

    const result = entityGraph.removeEntities({ names: ["小"] });

    expect(result.nodes).toEqual([]);
    expect(entityGraph.load().entities).toHaveLength(1);
  });

  it("types 过滤：同名的人与地点不会一起删", async () => {
    seedGraph([
      { id: "ent_person", name: "小明", type: "person" },
      { id: "ent_place", name: "小明", type: "place" },
    ]);
    const { entityGraph } = await import("./entity-graph");

    const result = entityGraph.removeEntities({ names: ["小明"], types: ["person"] });

    expect(result.nodes.map((n) => n.id)).toEqual(["ent_person"]);
    expect(entityGraph.load().entities.map((n) => n.id)).toEqual(["ent_place"]);
  });

  it("types 可传多个；不传则不限类型", async () => {
    seedGraph([
      { id: "ent_person", name: "小明", type: "person" },
      { id: "ent_concept", name: "小明", type: "concept" },
      { id: "ent_place", name: "小明", type: "place" },
    ]);
    const { entityGraph } = await import("./entity-graph");

    const typed = entityGraph.removeEntities({ names: ["小明"], types: ["person", "concept"] });

    expect(typed.nodes.map((n) => n.id).sort()).toEqual(["ent_concept", "ent_person"]);
    expect(entityGraph.load().entities.map((n) => n.id)).toEqual(["ent_place"]);
  });

  it("任一端指向被删节点的 relations 一起清掉，并如实汇报条数", async () => {
    seedGraph(
      [
        { id: "ent_a", name: "小明", type: "person" },
        { id: "ent_b", name: "小红", type: "person" },
        { id: "ent_c", name: "测试群", type: "place" },
      ],
      [
        { id: "rel_out", sourceId: "ent_a", targetId: "ent_b", relation: "friend_of" },
        { id: "rel_in", sourceId: "ent_b", targetId: "ent_a", relation: "friend_of" },
        { id: "rel_keep", sourceId: "ent_b", targetId: "ent_c", relation: "lives_in" },
      ],
    );
    const { entityGraph } = await import("./entity-graph");

    const result = entityGraph.removeEntities({ names: ["小明"] });

    expect(result.nodes.map((n) => n.id)).toEqual(["ent_a"]);
    expect(result.relations).toBe(2);
    expect(entityGraph.load().relations.map((r) => r.id)).toEqual(["rel_keep"]);
  });

  it("不命中时实体、关系、磁盘字节全都不动，且不落盘", async () => {
    const filePath = seedGraph(
      [{ id: "ent_a", name: "小红", type: "person" }],
      [{ id: "rel_1", sourceId: "ent_a", targetId: "ent_a", relation: "friend_of" }],
    );
    const { entityGraph } = await import("./entity-graph");
    entityGraph.load();
    const before = fs.readFileSync(filePath, "utf8");
    const save = vi.spyOn(entityGraph, "save");

    const result = entityGraph.removeEntities({ names: ["查无此人"] });

    expect(result).toEqual({ nodes: [], relations: 0 });
    expect(save).not.toHaveBeenCalled();
    expect(entityGraph.load().entities.map((n) => n.id)).toEqual(["ent_a"]);
    expect(entityGraph.load().relations.map((r) => r.id)).toEqual(["rel_1"]);
    expect(fs.readFileSync(filePath, "utf8")).toBe(before);
  });

  it("命中时只落盘一次", async () => {
    seedGraph([{ id: "ent_a", name: "小明", type: "person" }]);
    const { entityGraph } = await import("./entity-graph");
    entityGraph.load();
    const save = vi.spyOn(entityGraph, "save");

    entityGraph.removeEntities({ names: ["小明"] });

    expect(save).toHaveBeenCalledTimes(1);
  });

  it("删除后不影响 reset() 的语义（reset 仍清空整图）", async () => {
    seedGraph([{ id: "ent_a", name: "小红", type: "person" }]);
    const { entityGraph } = await import("./entity-graph");

    entityGraph.removeEntities({ names: ["查无此人"] });
    entityGraph.reset();

    expect(entityGraph.load()).toEqual({ entities: [], relations: [] });
    expect(JSON.parse(fs.readFileSync(path.join(electronMock.userDataDir, "entity-graph.json"), "utf8")))
      .toEqual({ entities: [], relations: [] });
  });
});
