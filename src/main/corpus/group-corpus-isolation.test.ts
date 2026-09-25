import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const electronMock = vi.hoisted(() => ({ userDataDir: "" }));

vi.mock("electron", () => ({
  app: { getPath: () => electronMock.userDataDir },
}));

import { MEMORY_PRESERVED, MEMORY_TARGETS, deleteAllMemory } from "../memory/memory-deletion";

const repoRoot = process.cwd();

/**
 * 群语料模块的隔离边界。
 *
 * 它服务的「群聊风格自学习」排在很后面，现在的定位是**纯数据前置层**：
 * 只写不读、没有生产消费方、不注入任何上下文。这三条一旦破了，
 * 要么数据会被记忆清理误删（前功尽弃），要么会在没人察觉的时候开始影响昔涟说话。
 * 本文件把这三条锁成用例。
 */

/** 唯一的合法生产调用方；导入类型不算调用。 */
const ALLOWED_IMPORTERS = [
  "src/main/channels/adapters/qq/napcat-adapter.ts",
];

function productionSources(): Array<{ relativePath: string; source: string }> {
  const out: Array<{ relativePath: string; source: string }> = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.name.endsWith(".ts") || entry.name.endsWith(".test.ts")) continue;
      out.push({
        relativePath: path.relative(repoRoot, full).split(path.sep).join("/"),
        source: fs.readFileSync(full, "utf8"),
      });
    }
  };
  walk(path.join(repoRoot, "src"));
  return out;
}

describe("group-corpus 隔离边界", () => {
  beforeEach(() => {
    electronMock.userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "corpus-isolation-"));
  });

  it("「清空记忆」不会删掉群语料 —— 这是本模块存在的全部意义", () => {
    const corpusFile = path.join(
      electronMock.userDataDir,
      "group-corpus",
      "543627098",
      "2026-09-21.jsonl",
    );
    fs.mkdirSync(path.dirname(corpusFile), { recursive: true });
    fs.writeFileSync(
      corpusFile,
      JSON.stringify({ t: "2026-09-21T14:03:22.145Z", gid: "543627098", uid: "1", msg: "别把我删了" }) + "\n",
      "utf8",
    );

    const result = deleteAllMemory();

    // 文件还在，内容一字不少
    expect(fs.existsSync(corpusFile)).toBe(true);
    expect(fs.readFileSync(corpusFile, "utf8")).toContain("别把我删了");
    // 删除结果里不能出现语料目录（出现了就说明它被当成记忆目标了）
    expect(result.deleted.some((rel) => rel.includes("group-corpus"))).toBe(false);
  });

  it("group-corpus/ 显式登记在保留名单里", () => {
    expect(MEMORY_PRESERVED).toContain("group-corpus/");
  });

  it("保留名单与删除名单的路径互不包含（防止将来加错前缀）", () => {
    for (const preserved of MEMORY_PRESERVED) {
      const preservedName = preserved.replace(/\/$/, "");
      for (const target of MEMORY_TARGETS) {
        const targetName = target.replace(/\/$/, "");
        // 双向包含都算冲突：删 channels/ 会连累 channels/history/，反之前缀也算
        const overlapping = targetName === preservedName
          || targetName.startsWith(`${preservedName}/`)
          || preservedName.startsWith(`${targetName}/`);
        expect(overlapping, `${target} 与 ${preserved} 路径重叠`).toBe(false);
      }
    }
  });

  it("语料目录是 userData 顶层，不在 channels/ 之下", () => {
    // 结构性保证：channels/history 与 channels/archive 都是 MEMORY_TARGETS 成员，
    // 只要语料不在 channels/ 内，就不可能被那两条整目录删除命中。
    const channelsTargets = MEMORY_TARGETS.filter((rel) => rel.startsWith("channels/"));
    expect(channelsTargets.length).toBeGreaterThan(0);
    for (const target of channelsTargets) {
      expect("group-corpus/".startsWith(target)).toBe(false);
    }
  });

  it("生产代码里只有 NapCat 适配器调用它（没有对话链路消费方）", () => {
    const importers: string[] = [];
    for (const { relativePath, source } of productionSources()) {
      if (relativePath.startsWith("src/main/corpus/")) continue;
      // 只看真正的模块导入，不看注释里提到模块名
      if (/from\s+["'][^"']*corpus\/group-corpus["']/.test(source)) {
        importers.push(relativePath);
      }
    }

    expect(importers.sort()).toEqual([...ALLOWED_IMPORTERS].sort());
  });

  it("没有人读语料文件的内容（只允许本模块的统计函数碰）", () => {
    // corpusStats 是唯一的读取入口，且只被测试使用。
    const offenders: string[] = [];
    for (const { relativePath, source } of productionSources()) {
      if (relativePath.startsWith("src/main/corpus/")) continue;
      // 任何别的文件里出现 group-corpus 的路径字面量，都说明有人在读它
      if (/"group-corpus"/.test(source) || /'group-corpus'/.test(source)) {
        offenders.push(relativePath);
      }
    }

    expect(offenders).toEqual([]);
  });

  /**
   * P3 §4.4 新增：**跑完「彻底擦除某个人」之后，语料整棵目录逐字节 + mtime 不变**。
   *
   * 这是本阶段对语料唯一的新增测试，也是"P3 不碰语料"这条承诺的运行时防线
   * （静态防线是 `memory-erasure-corpus-guard.test.ts` 的源码扫描）。
   * 为什么语料可以不删：它**只写不读、零生产消费方**，不进 prompt、不进召回 ——
   * 所以"他的原话留在语料里"不会让昔涟认识他（§0.2 B 的关键论证）。
   */
  it("「彻底擦除某个人」跑完之后，语料整棵目录逐字节不变", async () => {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "corpus-erase-"));
    electronMock.userDataDir = userDataDir;

    // 语料：群 + 私聊 + "群号恰好等于某人 QQ 号"三种目录形态
    const corpusFiles = [
      path.join(userDataDir, "group-corpus", "543627098__测试群", "2026-09-20.jsonl"),
      path.join(userDataDir, "group-corpus", "10001__小明", "2026-09-20.jsonl"),
      path.join(userDataDir, "group-corpus", "10001__同号群", "2026-09-20.jsonl"),
    ];
    corpusFiles.forEach((file, index) => {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(
        file,
        JSON.stringify({ t: "2026-09-20T10:00:00.000Z", kind: "group", gid: "543627098", uid: "10001", uname: "小明", msg: `第 ${index} 条别删我` }) + "\n",
        "utf8",
      );
    });

    const snapshot = (): Record<string, string> => {
      const out: Record<string, string> = {};
      for (const file of corpusFiles) {
        const stat = fs.statSync(file);
        out[file] = `${fs.readFileSync(file, "utf8")}|${stat.mtimeMs}`;
      }
      return out;
    };
    const before = snapshot();

    // 造一个"可擦除的人"的最小现场：他在群里说过话
    fs.mkdirSync(path.join(userDataDir, "channels", "history"), { recursive: true });
    fs.writeFileSync(
      path.join(userDataDir, "channels", "history", "channel_qq_ab12cd34ef56ab78.jsonl"),
      JSON.stringify({ id: "msg_1", role: "user", content: "我最近在学 Rust 语言，已经能写点小工具了", at: "2026-09-20T10:00:00.000Z", speakerId: "10001", speakerName: "小明" }) + "\n",
      "utf8",
    );
    fs.writeFileSync(
      path.join(userDataDir, "channels", "context-bindings.json"),
      JSON.stringify({ version: 1, externalChats: [] }),
      "utf8",
    );

    vi.resetModules();
    const { memoryStore } = await import("../memory/memory-store");
    await memoryStore.addL2Memory({
      content: "他说的那句话",
      triggerText: "我最近在学 Rust",
      sourceConversationId: "channel:qq:ab12cd34ef56ab78",
      speakerIds: ["qq:10001"],
      isPinned: false,
    });
    const { previewPersonErase, executePersonErase } = await import("../memory/person-erasure");
    const deps = {
      llmQueue: async (_label: string, task: () => Promise<unknown>) => task(),
      deleteVectors: () => 0,
      addVector: async (_text: string, l2Id: string) => `rag_${l2Id}`,
      vaultPath: () => undefined,
      userDataDir,
    };

    const plan = await previewPersonErase("qq:10001", deps);
    await executePersonErase("qq:10001", plan.previewId, deps);

    // 语料：逐字节 + mtime 全等
    expect(snapshot()).toEqual(before);
    // 而他的那条 L2 真的被删了（证明擦除确实跑了，不是空转）
    const memories = await memoryStore.getAllL2();
    expect(memories).toEqual([]);
  });
});
