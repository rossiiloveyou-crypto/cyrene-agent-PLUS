/**
 * 架构守卫：**P3 的擦除链路一个字节都不许碰群聊语料**（P3 §4.4 / §0.4 约束 2）。
 *
 * 为什么要有这个文件：语料是"只增不减的长期资产"，而 P3 的擦除是本仓库里唯一一个
 * "按人删数据"的功能 —— 它离语料只有一步之遥（"把他的原话从语料里删掉"是**最直觉但错误**的做法）。
 * 口头承诺 + 文档约束挡不住将来的一次重构，所以把它变成**会变红的测试**。
 *
 * 三条防线（本文件负责后两条，第一条由 `group-corpus-isolation.test.ts` 负责）：
 *   ① 语料必须留在 `MEMORY_PRESERVED` 里、且不在 `MEMORY_TARGETS` / `PERSON_ERASABLE` 里；
 *   ② P3 新增/修改的**每一个生产文件**都不得 import 语料模块；
 *   ③ 它们连带引号的精确字面量 `"group-corpus"` 都不许出现
 *      （与 `group-corpus-isolation.test.ts:119-131` 同一套判据 —— 出现在源码里就说明有人在拼它的路径）。
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

import { MEMORY_BACKUP_GLOBS, MEMORY_PRESERVED, MEMORY_TARGETS, PERSON_ERASABLE } from "./memory-deletion";

const repoRoot = process.cwd();
const CORPUS_DIR = "group-corpus";

/** P3 新增（或实质修改）的生产文件 —— 擦除链路的全部落点。 */
const P3_FILES = [
  "src/main/memory/person-erase-plan.ts",
  "src/main/memory/person-erasure.ts",
  "src/main/memory/memory-console.ts",
  "src/main/memory/memory-store.ts",
  "src/main/memory/memory-deletion.ts",
  "src/main/memory/entity-graph.ts",
  "src/main/memory/recent-injected-memory.ts",
  "src/main/memory/memory-user-ipc.ts",
  "src/main/channels/transcript-erasure.ts",
  "src/main/channels/history-log.ts",
  "src/main/channels/audit-log.ts",
  "src/main/channels/message-log.ts",
  "src/main/channels/conversation-binding-store.ts",
  "src/main/channels/channel-context.ts",
  "src/main/relationship/relationship-log.ts",
  "src/main/chat-api-utils.ts",
  "src/renderer/settings/memory/manager.ts",
  "src/renderer/settings/memory/erasure-flow.ts",
];

function read(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("P3 擦除链路的语料守卫", () => {
  it("P3 的文件清单本身没有写错（文件都存在）", () => {
    for (const file of P3_FILES) {
      expect(fs.existsSync(path.join(repoRoot, file)), `${file} 不存在`).toBe(true);
    }
  });

  it("没有任何 P3 生产文件 import 语料模块", () => {
    const offenders = P3_FILES.filter((file) => (
      /from\s+["'][^"']*corpus\/group-corpus["']/.test(read(file))
    ));
    expect(offenders).toEqual([]);
  });

  it('没有任何 P3 生产文件出现带引号的精确字面量 "group-corpus"', () => {
    const offenders = P3_FILES.filter((file) => {
      const source = read(file);
      return /"group-corpus"/.test(source) || /'group-corpus'/.test(source);
    });
    expect(offenders).toEqual([]);
  });

  it("语料不在任何删除清单里，且必须在保留清单里", () => {
    const overlaps = (target: string): boolean => {
      const a = target.replace(/\/$/, "");
      const b = CORPUS_DIR;
      return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
    };
    expect(MEMORY_TARGETS.filter(overlaps)).toEqual([]);
    expect(PERSON_ERASABLE.filter(overlaps)).toEqual([]);
    // 备份 glob 也不能意外命中语料目录名
    expect(MEMORY_BACKUP_GLOBS.some((glob) => glob.includes(CORPUS_DIR))).toBe(false);
    expect(MEMORY_PRESERVED).toContain(`${CORPUS_DIR}/`);
  });

  it("PERSON_ERASABLE 与 MEMORY_PRESERVED 的路径互不包含（双向）", () => {
    for (const preserved of MEMORY_PRESERVED) {
      const preservedName = preserved.replace(/\/$/, "");
      for (const erasable of PERSON_ERASABLE) {
        const erasableName = erasable.replace(/\/$/, "");
        const overlapping = erasableName === preservedName
          || erasableName.startsWith(`${preservedName}/`)
          || preservedName.startsWith(`${erasableName}/`);
        expect(overlapping, `${erasable} 与 ${preserved} 路径重叠`).toBe(false);
      }
    }
  });

  it("擦除链路只做「逐人过滤」，不做整目录删（防止将来有人复用 deleteAllMemory）", () => {
    const erasure = read("src/main/memory/person-erasure.ts");
    // 擦除流程绝不能提 deleteAllMemory / MEMORY_TARGETS —— 它们是"整目录清空"的语义（§0.4 约束 1）
    expect(erasure).not.toContain("deleteAllMemory");
    expect(erasure).not.toContain("MEMORY_TARGETS");
  });
});
