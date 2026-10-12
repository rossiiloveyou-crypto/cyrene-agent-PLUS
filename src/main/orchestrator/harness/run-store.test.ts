import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HarnessRunStore } from "./run-store";

const roots: string[] = [];

function createStore() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cyrene-harness-run-"));
  roots.push(root);
  let now = 1_000;
  return {
    root,
    tick: () => { now += 1; },
    store: new HarnessRunStore(root, { now: () => now }),
    sessionPath: path.join(root, "cyrene-runs", "sessions", "run-1.json"),
    indexPath: path.join(root, "cyrene-runs", "index.json"),
  };
}

function createRun(store: HarnessRunStore, runId = "run-1") {
  return store.create({ conversationId: "chat-1", runId });
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("HarnessRunStore metadata-only runs", () => {
  it("persists only run identity and status at creation", () => {
    const { store, sessionPath } = createStore();
    expect(createRun(store)).toMatchObject({
      schemaVersion: 2, conversationId: "chat-1", runId: "run-1", status: "running",
    });
    const disk = JSON.parse(fs.readFileSync(sessionPath, "utf8")) as Record<string, unknown>;
    expect(Object.keys(disk).sort()).toEqual([
      "conversationId", "createdAt", "runId", "schemaVersion", "status", "updatedAt",
    ]);
  });

  it("rejects old full checkpoints and tool lifecycle writes without changing the file", () => {
    const { store, sessionPath } = createStore();
    createRun(store);
    const before = fs.readFileSync(sessionPath, "utf8");
    expect(() => store.checkpoint("run-1", { rounds: 2 }))
      .toThrow("HARNESS_RUN_CHECKPOINT_DISABLED");
    expect(() => store.recordTool("run-1", {
      toolCallId: "call-1", toolName: "write_file", sideEffect: "idempotent_mutation", status: "started",
    })).toThrow("HARNESS_RUN_TOOL_LIFECYCLE_DISABLED");
    expect(fs.readFileSync(sessionPath, "utf8")).toBe(before);
  });

  it("marks a running run interrupted on restart and lists only interrupted runs", () => {
    const { root, store } = createStore();
    createRun(store);
    createRun(store, "run-2");
    store.markTerminal("run-2", "completed");
    const restarted = new HarnessRunStore(root);
    expect(restarted.get("run-1")).toMatchObject({ status: "interrupted", runId: "run-1" });
    expect(restarted.listInterruptedRuns().map((run) => run.runId)).toEqual(["run-1"]);
    expect(new HarnessRunStore(root).listInterruptedRuns().map((run) => run.runId)).toEqual(["run-1"]);
  });

  it("keeps legacy v1 data read-only while exposing crash reconciliation", () => {
    const { root } = createStore();
    const legacyPath = path.join(root, "cyrene-runs", "sessions", "legacy.json");
    const legacy = {
      schemaVersion: 1, conversationId: "chat-1", runId: "legacy", status: "running",
      createdAt: 1, updatedAt: 1,
      messages: [{ role: "user", content: "旧任务" }],
      state: { todoItems: [], uncertainEffects: [] },
      toolOutputs: [], toolCalls: [], rounds: 1,
      request: {
        provider: "openai", model: "test", contextWindowTokens: 128_000,
        promptFingerprint: "prompt", toolSchemaFingerprint: "tools",
      },
    };
    fs.writeFileSync(legacyPath, JSON.stringify(legacy), "utf8");
    const original = fs.readFileSync(legacyPath, "utf8");
    const restarted = new HarnessRunStore(root);
    expect(restarted.get("legacy")).toMatchObject({ status: "interrupted", messages: legacy.messages });
    expect(restarted.listInterruptedRuns().map((run) => run.runId)).toEqual(["legacy"]);
    expect(fs.readFileSync(legacyPath, "utf8")).toBe(original);
    expect(() => restarted.markTerminal("legacy", "completed")).toThrow("HARNESS_RUN_LEGACY_READ_ONLY");
  });

  it("returns isolated values and permits replacing a terminal run id", () => {
    const { store } = createStore();
    createRun(store);
    expect(() => createRun(store)).toThrow("HARNESS_RUN_EXISTS");
    const value = store.get("run-1")!;
    value.status = "failed";
    expect(store.get("run-1")?.status).toBe("running");
    store.markTerminal("run-1", "completed");
    expect(createRun(store)).toMatchObject({ schemaVersion: 2, runId: "run-1", status: "running" });
  });

  it("writes compact one-line JSON and flushes terminal status to the index", () => {
    const { store, sessionPath, indexPath } = createStore();
    createRun(store);
    store.markTerminal("run-1", "completed");
    const sessionRaw = fs.readFileSync(sessionPath, "utf8");
    const indexRaw = fs.readFileSync(indexPath, "utf8");
    expect(sessionRaw).not.toContain("\n");
    expect(indexRaw).not.toContain("\n");
    expect(JSON.parse(indexRaw)).toEqual([expect.objectContaining({ runId: "run-1", status: "completed" })]);
  });

  it("repairs stale index rows and removes orphan rows at startup", () => {
    const { root, store, indexPath, sessionPath } = createStore();
    createRun(store);
    store.markTerminal("run-1", "completed");
    const rows = JSON.parse(fs.readFileSync(indexPath, "utf8")) as Array<{ status: string }>;
    rows[0]!.status = "running";
    fs.writeFileSync(indexPath, JSON.stringify(rows), "utf8");
    new HarnessRunStore(root);
    expect(JSON.parse(fs.readFileSync(indexPath, "utf8"))).toEqual([
      expect.objectContaining({ runId: "run-1", status: "completed" }),
    ]);
    fs.rmSync(sessionPath);
    new HarnessRunStore(root);
    expect(JSON.parse(fs.readFileSync(indexPath, "utf8"))).toEqual([]);
  });

  it("logs write amplification metrics on terminal settlement", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const { store } = createStore();
      createRun(store);
      store.markTerminal("run-1", "completed");
      expect(log.mock.calls.map((call) => call.join(" ")).some((line) =>
        line.includes("[HarnessRunStore]") && line.includes("run-1") && line.includes("completed")))
        .toBe(true);
    } finally {
      log.mockRestore();
    }
  });
});
