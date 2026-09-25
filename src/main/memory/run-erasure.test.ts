/**
 * `run-erasure` 单元测试（P3 **D4**）：agent 运行记录的边界与删除判据。
 *
 * 背景：`cyrene-runs/sessions/*.json` 存着那一次运行的**完整 messages**（逐字对话正文），
 * 但它原来既不在 `PERSON_ERASABLE` 也不在 `MEMORY_PRESERVED`。用户定的口径是
 * **按会话过滤**：`run.conversationId ∈ 他发过言的会话` → 删；`reviews/` 与 `tool-results/`
 * 不删、但进疑似残留清单（那条在 `person-erasure` 的用例里锁）。
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "cyrene-run-erase-"));

vi.mock("electron", () => ({
  app: { getPath: () => TMP, getAppPath: () => process.cwd(), getName: () => "live2d-cyrene" },
}));

import { countRunsForConversations, eraseRunsForConversations } from "./run-erasure";

const GROUP = "channel:qq:group000000000000";
const MY_PRIVATE = "channel:qq:private0000000000";
const OTHER_GROUP = "channel:qq:other000000000000";

function root(): string {
  return TMP;
}

function sessionFile(runId: string): string {
  return path.join(root(), "cyrene-runs", "sessions", `${runId}.json`);
}
function eventFile(runId: string): string {
  return path.join(root(), "cyrene-runs", "sessions", `${runId}.events.jsonl`);
}

function seed(): void {
  fs.rmSync(path.join(root(), "cyrene-runs"), { recursive: true, force: true });
  fs.mkdirSync(path.join(root(), "cyrene-runs", "sessions"), { recursive: true });
  const rows = [
    { runId: "r1", conversationId: GROUP, status: "completed", updatedAt: 1 },
    { runId: "r2", conversationId: MY_PRIVATE, status: "completed", updatedAt: 2 },
    { runId: "r3", conversationId: OTHER_GROUP, status: "completed", updatedAt: 3 },
  ];
  fs.writeFileSync(path.join(root(), "cyrene-runs", "index.json"), JSON.stringify(rows), "utf8");
  for (const row of rows) {
    fs.writeFileSync(sessionFile(row.runId), JSON.stringify({
      schemaVersion: 1,
      conversationId: row.conversationId,
      runId: row.runId,
      status: row.status,
      createdAt: 1,
      updatedAt: row.updatedAt,
      messages: [{ role: "user", content: "[小明]: 我还养了只鹦鹉" }],
    }), "utf8");
    fs.writeFileSync(eventFile(row.runId), "{\"type\":\"run_created\"}\n", "utf8");
  }
}

describe("run-erasure（D4）", () => {
  beforeEach(() => {
    seed();
  });

  it("countRunsForConversations 只读：数出会被删的 run，且不改任何文件", () => {
    const before = fs.readFileSync(path.join(root(), "cyrene-runs", "index.json"), "utf8");
    expect(countRunsForConversations(root(), new Set([GROUP, MY_PRIVATE]))).toBe(2);
    expect(countRunsForConversations(root(), new Set([GROUP]))).toBe(1);
    expect(countRunsForConversations(root(), new Set())).toBe(0);
    expect(fs.readFileSync(path.join(root(), "cyrene-runs", "index.json"), "utf8")).toBe(before);
    expect(fs.existsSync(sessionFile("r1"))).toBe(true);
  });

  it("eraseRunsForConversations：删 session 文件 + events + index 行；别的会话一个不动", () => {
    const result = eraseRunsForConversations(root(), [GROUP, MY_PRIVATE]);
    expect(result.runs).toBe(2);
    expect(result.failed).toEqual([]);

    expect(fs.existsSync(sessionFile("r1"))).toBe(false);
    expect(fs.existsSync(eventFile("r1"))).toBe(false);
    expect(fs.existsSync(sessionFile("r2"))).toBe(false);
    expect(fs.existsSync(eventFile("r2"))).toBe(false);

    // 别人会话的 run 原样留着（含 events 与 index 行）
    expect(fs.existsSync(sessionFile("r3"))).toBe(true);
    expect(fs.existsSync(eventFile("r3"))).toBe(true);
    const rows = JSON.parse(fs.readFileSync(path.join(root(), "cyrene-runs", "index.json"), "utf8")) as Array<{ runId: string }>;
    expect(rows.map((r) => r.runId)).toEqual(["r3"]);
  });

  it("幂等：重复执行不会报错，也不会多删（第二次 runs = 0）", () => {
    eraseRunsForConversations(root(), [GROUP]);
    const second = eraseRunsForConversations(root(), [GROUP]);
    expect(second.runs).toBe(0);
    expect(second.failed).toEqual([]);
    expect(fs.existsSync(sessionFile("r3"))).toBe(true);
  });

  it("index.json 不存在时：计数 0、删除不抛错（宁可什么都不做）", () => {
    fs.rmSync(path.join(root(), "cyrene-runs"), { recursive: true, force: true });
    expect(countRunsForConversations(root(), new Set([GROUP]))).toBe(0);
    expect(eraseRunsForConversations(root(), [GROUP])).toEqual({ runs: 0, failed: [] });
  });

  it("坏 index.json：计数 0、删除不抛错", () => {
    fs.writeFileSync(path.join(root(), "cyrene-runs", "index.json"), "{ not json", "utf8");
    expect(countRunsForConversations(root(), new Set([GROUP]))).toBe(0);
    expect(eraseRunsForConversations(root(), [GROUP]).runs).toBe(0);
  });
});
