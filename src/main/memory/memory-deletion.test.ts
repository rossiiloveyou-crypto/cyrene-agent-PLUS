import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
const electronMock = vi.hoisted(() => ({ userDataDir: "" }));

vi.mock("electron", () => ({
  app: { getPath: () => electronMock.userDataDir },
}));

import {
  MEMORY_BACKUP_GLOBS,
  MEMORY_PRESERVED,
  MEMORY_TARGETS,
  PERSON_ERASABLE,
  deleteAllMemory,
  eraseMemoryBackups,
  listMemoryBackupTargets,
} from "./memory-deletion";
import { backupMemoryFile } from "./memory-store-io";

function touch(relative: string, content = "x"): string {
  const target = path.join(electronMock.userDataDir, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, "utf8");
  return target;
}

describe("deleteAllMemory", () => {
  beforeEach(() => {
    electronMock.userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "memory-deletion-"));
  });

  it("removes every memory file and directory, including channel archive", () => {
    for (const rel of MEMORY_TARGETS) {
      if (rel.endsWith("/")) touch(`${rel}some-session.jsonl`);
      else touch(rel);
    }

    const result = deleteAllMemory();

    expect(result.failed).toEqual([]);
    for (const rel of MEMORY_TARGETS) {
      // memory-trace.log 例外：删除审计会立刻把它重建，这是有意为之
      if (rel === "memory-trace.log") continue;
      expect(fs.existsSync(path.join(electronMock.userDataDir, rel))).toBe(false);
    }
    // 被删的路径要如实汇报（温层归档漏删是最危险的回归，这里锁死）
    expect(result.deleted).toContain("channels/history/");
    expect(result.deleted).toContain("channels/archive/");
    expect(result.deleted).toContain("memory.json");
    expect(result.deleted).toContain("rag-data/memory-store.json");
    // 朋友圈运行时状态与反应队列同样属于"昔涟记得的东西"
    expect(result.deleted).toContain("moments-state.json");
    expect(result.deleted).toContain("moments-reaction-queue.json");
  });

  it("preserves desktop chats, zone config and channel settings", () => {
    touch("cyrene-chats/sessions/conv-1.json");
    touch("zones.json", "{}");
    touch("channels-settings.json", "{}");
    // 群聊语料：只增不减的长期资产，被清空等于前功尽弃。
    // 这里只锁"没被删"；"内容一字没动"由 corpus/group-corpus-isolation.test.ts 锁。
    touch("group-corpus/543627098/2026-09-21.jsonl", "{}");
    // D4：运行产物**有意不自动删**（内容级删除会误伤无关文件），但会进疑似残留清单
    touch("cyrene-runs/reviews/run-1/journal.jsonl", "{}");
    touch("cyrene-runs/tool-results/abc/output.txt", "{}");
    touch("memory.json", "{}");

    deleteAllMemory();

    for (const rel of MEMORY_PRESERVED) {
      expect(fs.existsSync(path.join(electronMock.userDataDir, rel))).toBe(true);
    }
    expect(fs.existsSync(path.join(electronMock.userDataDir, "memory.json"))).toBe(false);
  });

  it("ignores absent targets instead of reporting them", () => {
    const result = deleteAllMemory();
    expect(result.deleted).toEqual([]);
    expect(result.failed).toEqual([]);
  });

  it("collects failures without aborting the rest of the sweep", () => {
    touch("memory.json");
    touch("relationship-log.json");
    touch("entity-graph.json");

    const result = deleteAllMemory({
      remove: (target) => {
        if (target.endsWith("memory.json")) throw new Error("EBUSY: locked");
        fs.rmSync(target, { recursive: true, force: true });
      },
    });

    expect(result.failed).toEqual([{ path: "memory.json", error: "EBUSY: locked" }]);
    // 其余目标照常删除
    expect(fs.existsSync(path.join(electronMock.userDataDir, "memory.json"))).toBe(true);
    expect(fs.existsSync(path.join(electronMock.userDataDir, "relationship-log.json"))).toBe(false);
    expect(fs.existsSync(path.join(electronMock.userDataDir, "entity-graph.json"))).toBe(false);
  });

  it("writes an audit trace entry after the sweep", () => {
    touch("memory.json");
    deleteAllMemory();

    const tracePath = path.join(electronMock.userDataDir, "memory-trace.log");
    expect(fs.existsSync(tracePath)).toBe(true);
    const events = fs.readFileSync(tracePath, "utf8").trim().split(/\r?\n/).map((line) => JSON.parse(line));
    expect(events.some((event) => event.op === "memory.deleteAll")).toBe(true);
  });

  // —— P3 §0.5：备份清单（memory.backup.*.json + memory-reconcile-backups/）——

  it("deleteAllMemory 现在也会销毁记忆备份与对账备份目录", () => {
    touch("memory.json", "{}");
    const backup = touch("memory.backup.2026-09-24T10-00-00-000Z.json", "旧的一份完整记忆");
    touch("memory-reconcile-backups/memory.1758681234567.json", "对账副本");
    touch("memory-reconcile-backups/memory-store.1758681234567.json", "向量副本");

    const result = deleteAllMemory();

    expect(result.failed).toEqual([]);
    // 不删备份 = 一次回退就能让他复活 —— 这条锁死"点了清空就真的清干净了"
    expect(fs.existsSync(backup)).toBe(false);
    expect(fs.existsSync(path.join(electronMock.userDataDir, "memory-reconcile-backups"))).toBe(false);
    expect(result.deleted).toContain("memory-reconcile-backups/");
    expect(result.deleted.some((rel) => path.basename(rel).startsWith("memory.backup."))).toBe(true);
  });

  it("listMemoryBackupTargets 在没有备份时返回空数组且不抛错", () => {
    expect(listMemoryBackupTargets()).toEqual([]);
    // userData 根目录都不存在时同样安全
    expect(listMemoryBackupTargets(path.join(electronMock.userDataDir, "not-created-yet"))).toEqual([]);
  });

  it("备份写入器产出的文件名被 MEMORY_BACKUP_GLOBS 命中（两处命名不会漂移）", () => {
    const memoryPath = touch("memory.json", JSON.stringify({ schemaVersion: 2 }));

    backupMemoryFile(memoryPath);

    const backups = fs.readdirSync(electronMock.userDataDir)
      .filter((name) => name.startsWith("memory.backup.") && name.endsWith(".json"));
    expect(backups).toHaveLength(1);
    // 关键断言：glob 展开函数真的能列出写入器刚写出的那一份
    expect(listMemoryBackupTargets()).toContain(path.join(electronMock.userDataDir, backups[0]));
    expect(MEMORY_BACKUP_GLOBS).toEqual(["memory.backup.*.json"]);
  });

  it("eraseMemoryBackups 整份销毁（文件 + 目录）并汇报总字节数", () => {
    const backup = touch("memory.backup.a.json", "x".repeat(100));
    touch("memory-reconcile-backups/memory.1.json", "y".repeat(50));

    const result = eraseMemoryBackups();

    expect(result.failed).toEqual([]);
    expect(result.files).toHaveLength(2);
    expect(result.bytes).toBe(150);
    expect(fs.existsSync(backup)).toBe(false);
    expect(fs.existsSync(path.join(electronMock.userDataDir, "memory-reconcile-backups"))).toBe(false);
  });

  it("eraseMemoryBackups 逐项容错：一项失败不影响其余，失败项进 failed", () => {
    const doomed = touch("memory.backup.a.json", "aaa");
    const keep = touch("memory-reconcile-backups/memory.1.json", "b");

    const result = eraseMemoryBackups({
      remove: (target) => {
        if (target.endsWith("memory.backup.a.json")) throw new Error("EBUSY: locked");
        fs.rmSync(target, { recursive: true, force: true });
      },
    });

    expect(result.failed).toEqual([doomed]);
    expect(result.files).toEqual([path.join(electronMock.userDataDir, "memory-reconcile-backups")]);
    expect(fs.existsSync(doomed)).toBe(true);
    expect(fs.existsSync(keep)).toBe(false);
  });

  it("eraseMemoryBackups 在没有备份时是 no-op", () => {
    expect(eraseMemoryBackups()).toEqual({ files: [], fileCount: 0, bytes: 0, failed: [] });
  });

  it("eraseMemoryBackups 的 fileCount 是**递归文件数**（D3：预演与报告必须同口径）", () => {
    const root = electronMock.userDataDir;
    fs.writeFileSync(path.join(root, "memory.backup.x.json"), "{}", "utf8");
    fs.mkdirSync(path.join(root, "memory-reconcile-backups"), { recursive: true });
    fs.writeFileSync(path.join(root, "memory-reconcile-backups", "memory.1.json"), "{}", "utf8");
    fs.writeFileSync(path.join(root, "memory-reconcile-backups", "memory-store.1.json"), "{}", "utf8");

    const result = eraseMemoryBackups();
    // 目标只有 2 个（1 个文件 + 1 个目录），但**文件**是 3 个 —— 预演数的是后者
    expect(result.files).toHaveLength(2);
    expect(result.fileCount).toBe(3);
  });

  // —— P3 §0.5：PERSON_ERASABLE 这张清单本身必须可测试 ——

  it("PERSON_ERASABLE 是 §0.5 的 13 条（D4 补进 `cyrene-runs/sessions/`），顺序锁定", () => {
    expect(PERSON_ERASABLE).toEqual([
      "memory.json",
      "rag-data/memory-store.json",
      "channels/history/",
      "channels/archive/",
      "channels/audit/",
      "channels/log.jsonl",
      "chat-api.log",
      "memory.backup.*.json",
      "memory-reconcile-backups/",
      "entity-graph.json",
      "relationship-log.json",
      "channels/context-bindings.json",
      "cyrene-runs/sessions/",
    ]);
  });

  it("PERSON_ERASABLE 里没有群聊语料，且与它没有任何路径包含关系（硬承诺）", () => {
    const corpusDir = "group-corpus";

    for (const rel of PERSON_ERASABLE) {
      const name = rel.replace(/\/$/, "");
      // 双向都不许包含：既不能把语料写进擦除清单，也不能写一个"会连累语料"的前缀
      expect(name.includes(corpusDir), `${rel} 命中语料目录`).toBe(false);
      expect(corpusDir.includes(name), `${rel} 反过来包含语料`).toBe(false);
    }
    // 它必须留在保留名单里（与 MEMORY_PRESERVED 的契约）
    expect(MEMORY_PRESERVED).toContain("group-corpus/");
  });

  it("PERSON_ERASABLE 与 MEMORY_PRESERVED 路径互斥（照抄 corpus 的互斥写法）", () => {
    for (const preserved of MEMORY_PRESERVED) {
      const preservedName = preserved.replace(/\/$/, "");
      for (const target of PERSON_ERASABLE) {
        const targetName = target.replace(/\/$/, "");
        const overlapping = targetName === preservedName
          || targetName.startsWith(`${preservedName}/`)
          || preservedName.startsWith(`${targetName}/`);
        expect(overlapping, `${target} 与 ${preserved} 路径重叠`).toBe(false);
      }
    }
  });
});
