import * as fs from "fs"
import * as os from "os"
import * as path from "path"
import { beforeEach, describe, expect, it, vi } from "vitest"

const electronMock = vi.hoisted(() => ({
  userDataDir: "",
}))

vi.mock("electron", () => ({
  app: {
    getPath: () => electronMock.userDataDir,
  },
}))

const obsidianExporterMock = vi.hoisted(() => ({
  notifyMemoryChanged: vi.fn(),
}))

vi.mock("./obsidian-exporter", () => ({
  notifyMemoryChanged: obsidianExporterMock.notifyMemoryChanged,
}))

function readTraceEvents(): Array<Record<string, unknown>> {
  const tracePath = path.join(electronMock.userDataDir, "memory-trace.log")
  if (!fs.existsSync(tracePath)) return []
  return fs.readFileSync(tracePath, "utf8")
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>)
}

describe("memoryStore", () => {
  beforeEach(() => {
    electronMock.userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "memory-store-"))
    vi.resetModules()
    obsidianExporterMock.notifyMemoryChanged.mockReset()
  })

  it("persists L2 conflict markers and status changes", async () => {
    const { memoryStore } = await import("./memory-store")
    const existing = await memoryStore.addL2Memory({
      content: "用户喜欢香菇",
      triggerText: "我喜欢香菇",
      sourceConversationId: "test",
      ragId: "rag_existing",
      isPinned: false,
    })

    const marked = await memoryStore.markL2Conflict(existing.id, "rag_new")

    expect(marked?.conflictWith).toEqual(["rag_new"])
    expect(marked?.status).toBe("aging")

    const persisted = JSON.parse(
      fs.readFileSync(path.join(electronMock.userDataDir, "memory.json"), "utf8"),
    )
    expect(persisted.l2[0].conflictWith).toEqual(["rag_new"])
    expect(persisted.l2[0].status).toBe("aging")

    const traceEvents = readTraceEvents()
    expect(traceEvents.some((event) => event.op === "l2.add" && event.l2Id === existing.id)).toBe(true)
    expect(traceEvents.some((event) => event.op === "l2.conflict.mark" && event.l2Id === existing.id)).toBe(true)
  })

  it("keeps pinned L2 memories active when marking conflicts", async () => {
    const { memoryStore } = await import("./memory-store")
    const existing = await memoryStore.addL2Memory({
      content: "用户喜欢平菇",
      triggerText: "我喜欢平菇",
      sourceConversationId: "test",
      ragId: "rag_existing",
      isPinned: true,
    })

    const marked = await memoryStore.markL2Conflict(existing.id, "rag_new")

    expect(marked?.conflictWith).toEqual(["rag_new"])
    expect(marked?.status).toBe("active")
  })

  it("decays only unpinned active L2 memories with positive weight", async () => {
    const { memoryStore } = await import("./memory-store")
    const active = await memoryStore.addL2Memory({
      content: "用户正在练琴",
      triggerText: "我最近在练琴",
      sourceConversationId: "test",
      ragId: "rag_active",
      isPinned: false,
    })
    const pinned = await memoryStore.addL2Memory({
      content: "用户固定喜欢中文",
      triggerText: "我一直用中文",
      sourceConversationId: "test",
      ragId: "rag_pinned",
      isPinned: true,
    })

    const store = await memoryStore.load()
    const activeEntry = store.l2.find((m) => m.id === active.id)!
    const pinnedEntry = store.l2.find((m) => m.id === pinned.id)!
    activeEntry.weight = 10
    pinnedEntry.weight = 10
    await memoryStore.save(store)

    const changed = await memoryStore.decayL2Weights()
    const persisted = JSON.parse(
      fs.readFileSync(path.join(electronMock.userDataDir, "memory.json"), "utf8"),
    )

    expect(changed).toBe(1)
    expect(persisted.l2.find((m: { id: string }) => m.id === active.id).weight).toBe(9)
    expect(persisted.l2.find((m: { id: string }) => m.id === active.id).status).toBe("archived")
    expect(persisted.l2.find((m: { id: string }) => m.id === pinned.id).weight).toBe(10)
    expect(persisted.l2.find((m: { id: string }) => m.id === pinned.id).status).toBe("active")
  })

  it("updates L0 and L2 through atomic write APIs", async () => {
    const { memoryStore } = await import("./memory-store")
    await memoryStore.upsertL0Field("preferredName", "伙伴")
    const memory = await memoryStore.addL2Memory({
      content: "用户最近在做记忆系统重构",
      triggerText: "我们重构记忆系统",
      sourceConversationId: "test",
      ragId: "rag_memory_refactor",
      isPinned: false,
    })
    await memoryStore.updateL2RecallStats(memory.id, 12)

    const l0 = await memoryStore.getL0()
    const allL2 = await memoryStore.getAllL2()
    const updated = allL2.find((item) => item.id === memory.id)!
    const traceEvents = readTraceEvents()

    expect(l0.preferredName).toBe("伙伴")
    expect(l0.updatedAt).toBeGreaterThan(0)
    expect(updated.weight).toBe(12)
    expect(updated.accessCount).toBe(1)
    expect(updated.status).toBe("active")
    expect(traceEvents.some((event) => event.op === "l0.update")).toBe(true)
    expect(traceEvents.some((event) => event.op === "l2.weight.update" && event.l2Id === memory.id)).toBe(true)
  })

  it("does not downgrade an active memory when recording a recall", async () => {
    const { memoryStore } = await import("./memory-store")
    const memory = await memoryStore.addL2Memory({
      content: "用户喜欢香菇",
      triggerText: "我喜欢香菇",
      sourceConversationId: "test",
      ragId: "rag_active_recall",
      isPinned: false,
    })

    await memoryStore.updateL2RecallStats(memory.id, 1)

    const updated = (await memoryStore.getAllL2()).find((item) => item.id === memory.id)!
    expect(updated.weight).toBe(1)
    expect(updated.status).toBe("active")
  })

  it.each(["archived", "superseded", "merged"] as const)(
    "does not let recall statistics reactivate %s L2 memories",
    async (status) => {
      const { memoryStore } = await import("./memory-store")
      const memory = await memoryStore.addL2Memory({
        content: `终止状态 ${status}`,
        triggerText: "测试终止状态",
        sourceConversationId: "test",
        ragId: `rag_${status}`,
        isPinned: false,
      })
      await memoryStore.updateL2Status([memory.id], status)

      await memoryStore.updateL2RecallStats(memory.id, 50)

      const persisted = (await memoryStore.getAllL2()).find((item) => item.id === memory.id)!
      expect(persisted.status).toBe(status)
      expect(persisted.weight).toBe(0)
      expect(persisted.accessCount).toBe(0)
    },
  )

  it("creates evidence for new L2 memories with bounded snippets", async () => {
    const { memoryStore } = await import("./memory-store")
    const longTrigger = "证据".repeat(180)
    const memory = await memoryStore.addL2Memory({
      content: "用户希望记忆系统保留证据链",
      triggerText: longTrigger,
      sourceConversationId: "conv_evidence",
      sourceMessageIds: ["msg_1", "msg_2"],
      ragId: "rag_evidence",
      isPinned: false,
    })

    const evidence = await memoryStore.getEvidenceByMemoryId(memory.id)
    const traceEvents = readTraceEvents()

    expect(memory.evidenceIds).toHaveLength(1)
    expect(evidence).toHaveLength(1)
    expect(evidence[0].id).toBe(memory.evidenceIds?.[0])
    expect(evidence[0].quoteSnippet.length).toBe(300)
    expect(evidence[0].conversationId).toBe("conv_evidence")
    expect(evidence[0].messageIds).toEqual(["msg_1", "msg_2"])
    expect(evidence[0].sourceStatus).toBe("active")
    expect(traceEvents.some((event) => event.op === "evidence.add" && event.l2Id === memory.id)).toBe(true)
  })

  it("deletes evidence together with a rolled-back L2 memory", async () => {
    const { memoryStore } = await import("./memory-store")
    const memory = await memoryStore.addL2Memory({
      content: "临时压缩摘要",
      triggerText: "compression",
      sourceConversationId: "test",
      isPinned: false,
      isSummary: true,
      syncStatus: "pending_sync",
    })

    await memoryStore.deleteL2(memory.id)

    const store = await memoryStore.load()
    expect(store.l2.some((item) => item.id === memory.id)).toBe(false)
    expect((store.evidence ?? []).some((item) => item.memoryId === memory.id)).toBe(false)
  })

  it("marks L2 sync status and persists rag ids", async () => {
    const { memoryStore } = await import("./memory-store")
    const memory = await memoryStore.addL2Memory({
      content: "用户喜欢可靠的长期记忆",
      triggerText: "长期记忆要可靠",
      sourceConversationId: "test",
      isPinned: false,
      syncStatus: "pending_sync",
    })

    const synced = await memoryStore.markL2SyncStatus(memory.id, "synced", "rag_synced")
    const persisted = JSON.parse(
      fs.readFileSync(path.join(electronMock.userDataDir, "memory.json"), "utf8"),
    )
    const traceEvents = readTraceEvents()

    expect(synced?.syncStatus).toBe("synced")
    expect(synced?.ragId).toBe("rag_synced")
    expect(persisted.l2[0].syncStatus).toBe("synced")
    expect(persisted.l2[0].ragId).toBe("rag_synced")
    expect(traceEvents.some((event) => event.op === "l2.sync.success" && event.l2Id === memory.id)).toBe(true)
  })

  it("stores conflict logs separately from reflection logs with a capped history", async () => {
    const { memoryStore } = await import("./memory-store")
    for (let i = 0; i < 101; i++) {
      await memoryStore.appendConflictLog({
        status: "candidate",
        sourceL2Id: `source_${i}`,
        targetL2Id: `target_${i}`,
        sourceRagId: `rag_source_${i}`,
        targetRagId: `rag_target_${i}`,
        reason: "test conflict",
        confidence: 0.7,
        detector: "local",
      })
    }

    const conflictLogs = await memoryStore.getConflictLogs()
    const reflectionLogs = await memoryStore.getReflectionLogs()
    const persisted = JSON.parse(
      fs.readFileSync(path.join(electronMock.userDataDir, "memory.json"), "utf8"),
    )

    expect(conflictLogs).toHaveLength(100)
    expect(conflictLogs[0].sourceL2Id).toBe("source_1")
    expect(reflectionLogs).toHaveLength(0)
    expect(persisted.conflictLogs).toHaveLength(100)
  })

  it("persists conflict scores and emits conflict.score trace", async () => {
    const { memoryStore } = await import("./memory-store")
    const log = await memoryStore.appendConflictLog({
      status: "candidate",
      sourceL2Id: "source",
      targetL2Id: "target",
      sourceRagId: "rag_source",
      targetRagId: "rag_target",
      reason: "rag candidate",
      confidence: 0.7,
      detector: "local",
    })

    const scored = await memoryStore.scoreConflictLog(log.id, {
      conflictScore: 55,
      resolverPriority: "normal",
      scoringSignals: {
        ragCandidate: true,
        evidenceAvailable: true,
        localContradiction: true,
        impactScope: "medium",
        penalties: [],
      },
    })

    const conflictLogs = await memoryStore.getConflictLogs()
    const traceEvents = readTraceEvents()

    expect(scored?.conflictScore).toBe(55)
    expect(conflictLogs[0].resolverPriority).toBe("normal")
    expect(conflictLogs[0].scoringSignals).toMatchObject({
      ragCandidate: true,
      evidenceAvailable: true,
      localContradiction: true,
      impactScope: "medium",
    })
    expect(traceEvents.some((event) => event.op === "conflict.score" && event.l2Id === "source")).toBe(true)
  })

  it("queues resolver-eligible conflict logs when scoring priority is not none", async () => {
    const { memoryStore } = await import("./memory-store")
    const log = await memoryStore.appendConflictLog({
      status: "candidate",
      sourceL2Id: "source",
      targetL2Id: "target",
      reason: "resolver eligible",
      confidence: 0.8,
      detector: "local",
    })

    await memoryStore.scoreConflictLog(log.id, {
      conflictScore: 75,
      resolverPriority: "high",
      scoringSignals: {
        ragCandidate: true,
        evidenceAvailable: true,
        localContradiction: true,
        penalties: [],
      },
    })

    const queue = await memoryStore.getResolverQueue()
    const traceEvents = readTraceEvents()

    expect(queue).toHaveLength(1)
    expect(queue[0]).toMatchObject({
      id: log.id,
      resolverStatus: "queued",
      resolverPriority: "high",
      resolverAttemptCount: 0,
    })
    expect(queue[0].resolverQueuedAt).toBeGreaterThan(0)
    expect(traceEvents.some((event) => event.op === "resolver.queue.add" && event.l2Id === "source")).toBe(true)
  })

  it("does not queue conflict logs with none resolver priority", async () => {
    const { memoryStore } = await import("./memory-store")
    const log = await memoryStore.appendConflictLog({
      status: "candidate",
      sourceL2Id: "source",
      targetL2Id: "target",
      reason: "low score",
      confidence: 0.35,
      detector: "local",
    })

    await memoryStore.scoreConflictLog(log.id, {
      conflictScore: 20,
      resolverPriority: "none",
      scoringSignals: {
        ragCandidate: false,
        localContradiction: true,
        penalties: [],
      },
    })

    const conflictLogs = await memoryStore.getConflictLogs()
    const queue = await memoryStore.getResolverQueue()

    expect(conflictLogs[0].resolverStatus).toBe("not_queued")
    expect(queue).toHaveLength(0)
  })

  it("returns queued resolver logs by priority and age", async () => {
    const { memoryStore } = await import("./memory-store")
    const idle = await memoryStore.appendConflictLog({
      status: "candidate",
      sourceL2Id: "idle_source",
      targetL2Id: "idle_target",
      reason: "idle",
      confidence: 0.4,
      detector: "local",
    })
    const high = await memoryStore.appendConflictLog({
      status: "candidate",
      sourceL2Id: "high_source",
      targetL2Id: "high_target",
      reason: "high",
      confidence: 0.9,
      detector: "local",
    })

    await memoryStore.scoreConflictLog(idle.id, {
      conflictScore: 40,
      resolverPriority: "idle",
      scoringSignals: { ragCandidate: true, penalties: [] },
    })
    await memoryStore.scoreConflictLog(high.id, {
      conflictScore: 80,
      resolverPriority: "high",
      scoringSignals: { ragCandidate: true, penalties: [] },
    })

    const queue = await memoryStore.getResolverQueue()

    expect(queue.map((entry) => entry.id)).toEqual([high.id, idle.id])
  })

  it("applies preference evolution by creating resolved memory and marking old entries", async () => {
    const { memoryStore } = await import("./memory-store")
    const oldMemory = await memoryStore.addL2Memory({
      content: "用户喜欢跑步",
      triggerText: "我喜欢跑步",
      sourceConversationId: "test",
      ragId: "rag_old",
      isPinned: false,
    })
    const newMemory = await memoryStore.addL2Memory({
      content: "用户不喜欢跑步",
      triggerText: "我现在不喜欢跑步",
      sourceConversationId: "test",
      ragId: "rag_new",
      isPinned: false,
    })
    const log = await memoryStore.appendConflictLog({
      status: "candidate",
      sourceL2Id: newMemory.id,
      targetL2Id: oldMemory.id,
      reason: "test",
      confidence: 0.8,
      detector: "local",
    })

    const applied = await memoryStore.applyResolverResolution(log.id, {
      resolutionType: "preference_evolution",
      resolvedSummary: "用户过去喜欢跑步，但现在不喜欢跑步。",
      reason: "用户表达了当前偏好变化。",
      confidence: 0.88,
      actions: {
        createResolvedMemory: true,
        oldMemoryStatus: "superseded",
        newMemoryStatus: "merged",
        shouldAskUser: false,
        clarificationNeeded: false,
      },
    })

    const allL2 = await memoryStore.getAllL2()
    const conflictLogs = await memoryStore.getConflictLogs()
    const resolvedMemory = allL2.find((memory) => memory.id === applied?.resolutionMemoryId)

    expect(resolvedMemory?.content).toBe("用户过去喜欢跑步，但现在不喜欢跑步。")
    expect(allL2.find((memory) => memory.id === oldMemory.id)?.status).toBe("superseded")
    expect(allL2.find((memory) => memory.id === newMemory.id)?.status).toBe("merged")
    expect(conflictLogs[0]).toMatchObject({
      status: "resolved",
      resolverStatus: "resolved",
      resolutionType: "preference_evolution",
      resolutionConfidence: 0.88,
    })
  })

  it("消解结果继承两条原条目的归属并集（P2）", async () => {
    const { memoryStore } = await import("./memory-store")
    const oldMemory = await memoryStore.addL2Memory({
      content: "用户喜欢跑步",
      triggerText: "我喜欢跑步",
      sourceConversationId: "test",
      ragId: "rag_old",
      isPinned: false,
      speakerIds: ["qq:10001"],
      subjectIds: ["qq:10001"],
    })
    const newMemory = await memoryStore.addL2Memory({
      content: "用户不喜欢跑步",
      triggerText: "我现在不喜欢跑步",
      sourceConversationId: "test",
      ragId: "rag_new",
      isPinned: false,
      // 新条目是小红转述的：说话人不同、主体相同
      speakerIds: ["qq:10002"],
      subjectIds: ["qq:10001"],
    })
    const log = await memoryStore.appendConflictLog({
      status: "candidate",
      sourceL2Id: newMemory.id,
      targetL2Id: oldMemory.id,
      reason: "test",
      confidence: 0.8,
      detector: "local",
    })

    const applied = await memoryStore.applyResolverResolution(log.id, {
      resolutionType: "preference_evolution",
      resolvedSummary: "用户过去喜欢跑步，但现在不喜欢跑步。",
      reason: "用户表达了当前偏好变化。",
      confidence: 0.88,
      actions: { createResolvedMemory: true },
    })

    const resolvedMemory = (await memoryStore.getAllL2())
      .find((memory) => memory.id === applied?.resolutionMemoryId)

    // 并集：两个说话人都保留（顺序按 applyResolverResolution 的 [新, 旧] 拼接）
    expect(resolvedMemory?.speakerIds).toEqual(["qq:10002", "qq:10001"])
    expect(resolvedMemory?.subjectIds).toEqual(["qq:10001"])
  })

  it("两条原条目都无归属时，消解结果不写归属字段（老数据不产生空数组）", async () => {
    const { memoryStore } = await import("./memory-store")
    const oldMemory = await memoryStore.addL2Memory({
      content: "用户喜欢跑步",
      triggerText: "我喜欢跑步",
      sourceConversationId: "test",
      ragId: "rag_old3",
      isPinned: false,
    })
    const newMemory = await memoryStore.addL2Memory({
      content: "用户不喜欢跑步",
      triggerText: "我现在不喜欢跑步",
      sourceConversationId: "test",
      ragId: "rag_new3",
      isPinned: false,
    })
    const log = await memoryStore.appendConflictLog({
      status: "candidate",
      sourceL2Id: newMemory.id,
      targetL2Id: oldMemory.id,
      reason: "test",
      confidence: 0.8,
      detector: "local",
    })

    const applied = await memoryStore.applyResolverResolution(log.id, {
      resolutionType: "preference_evolution",
      resolvedSummary: "用户过去喜欢跑步，但现在不喜欢跑步。",
      reason: "变化。",
      confidence: 0.88,
      actions: { createResolvedMemory: true },
    })

    const resolvedMemory = (await memoryStore.getAllL2())
      .find((memory) => memory.id === applied?.resolutionMemoryId)

    expect("speakerIds" in (resolvedMemory ?? {})).toBe(false)
    expect("subjectIds" in (resolvedMemory ?? {})).toBe(false)
  })

  it("marks direct conflicts as clarification needed without creating resolved memory", async () => {
    const { memoryStore } = await import("./memory-store")
    const oldMemory = await memoryStore.addL2Memory({
      content: "用户喜欢被叫 Playa",
      triggerText: "叫我 Playa",
      sourceConversationId: "test",
      ragId: "rag_old",
      isPinned: false,
    })
    const newMemory = await memoryStore.addL2Memory({
      content: "用户不喜欢被叫 Playa",
      triggerText: "别叫我 Playa",
      sourceConversationId: "test",
      ragId: "rag_new",
      isPinned: false,
    })
    const log = await memoryStore.appendConflictLog({
      status: "candidate",
      sourceL2Id: newMemory.id,
      targetL2Id: oldMemory.id,
      reason: "test",
      confidence: 0.8,
      detector: "local",
    })

    await memoryStore.applyResolverResolution(log.id, {
      resolutionType: "direct_conflict",
      reason: "称呼偏好直接冲突，需要自然澄清。",
      confidence: 0.82,
      actions: {
        createResolvedMemory: false,
        shouldAskUser: true,
        clarificationNeeded: true,
      },
    })

    const allL2 = await memoryStore.getAllL2()
    const conflictLogs = await memoryStore.getConflictLogs()

    expect(allL2).toHaveLength(2)
    expect(conflictLogs[0]).toMatchObject({
      status: "clarification_needed",
      resolverStatus: "resolved",
      shouldAskUser: true,
      clarificationNeeded: true,
    })
  })

  it("caps reflection logs separately from conflict logs", async () => {
    const { memoryStore } = await import("./memory-store")
    await memoryStore.appendConflictLog({
      status: "candidate",
      sourceL2Id: "source",
      targetL2Id: "target",
      reason: "test conflict",
      confidence: 0.35,
      detector: "local",
    })

    for (let i = 0; i < 51; i++) {
      await memoryStore.appendReflectionLog({
        type: "l1_update",
        summary: `reflection ${i}`,
      })
    }

    const reflectionLogs = await memoryStore.getReflectionLogs()
    const conflictLogs = await memoryStore.getConflictLogs()
    const traceEvents = readTraceEvents()

    expect(reflectionLogs).toHaveLength(50)
    expect(reflectionLogs[0].summary).toBe("reflection 1")
    expect(conflictLogs).toHaveLength(1)
    expect(traceEvents.some((event) => event.op === "reflection.log.add")).toBe(true)
    expect(traceEvents.some((event) => event.op === "conflict.log.add")).toBe(true)
  })

  it("migrates legacy memory files with a backup", async () => {
    const memoryPath = path.join(electronMock.userDataDir, "memory.json")
    fs.writeFileSync(
      memoryPath,
      JSON.stringify({
        l0: { preferredName: "伙伴" },
        l1: { roundCount: 7 },
        l2: [{
          id: "l2_legacy",
          content: "旧记忆",
          triggerText: "旧触发",
          sourceConversationId: "test",
          createdAt: 1,
          lastAccessedAt: 1,
          accessCount: 0,
          weight: 0,
          isPinned: false,
          status: "active",
          ragId: "rag_legacy",
        }],
        evidence: [],
        reflectionLogs: [],
        version: 1,
      }),
      "utf8",
    )

    const { memoryStore } = await import("./memory-store")
    const store = await memoryStore.load()
    const persisted = JSON.parse(fs.readFileSync(memoryPath, "utf8"))
    const backups = fs.readdirSync(electronMock.userDataDir).filter((name) => name.startsWith("memory.backup."))

    expect(store.schemaVersion).toBe(3)
    expect(persisted.schemaVersion).toBe(3)
    expect(store.l0.preferredName).toBe("伙伴")
    expect(store.l1.roundCount).toBe(7)
    expect(store.l2[0].syncStatus).toBe("synced")
    expect(store.l2[0].evidenceIds).toEqual([])
    expect(store.evidence).toEqual([])
    expect(store.conflictLogs).toEqual([])
    expect(backups).toHaveLength(1)
    expect(readTraceEvents().some((event) => event.op === "migration.upgrade")).toBe(true)
  })

  it("saves the transformed store before notifying Obsidian", async () => {
    const { memoryStore } = await import("./memory-store")
    await memoryStore.load()
    await vi.waitFor(() => expect(obsidianExporterMock.notifyMemoryChanged).toHaveBeenCalled())
    obsidianExporterMock.notifyMemoryChanged.mockClear()

    const trace: string[] = []
    const originalLoad = memoryStore.load.bind(memoryStore)
    const originalSave = memoryStore.save.bind(memoryStore)
    vi.spyOn(memoryStore, "load").mockImplementation(async () => {
      trace.push("load")
      return originalLoad()
    })
    vi.spyOn(memoryStore, "save").mockImplementation(async (store) => {
      trace.push(`save:${store.l0.preferredName}`)
      await originalSave(store)
    })
    obsidianExporterMock.notifyMemoryChanged.mockImplementation(() => {
      trace.push("notify")
    })

    await memoryStore.upsertL0Field("preferredName", "伙伴")
    await vi.waitFor(() => expect(trace).toContain("notify"))

    expect(trace).toEqual(["load", "save:伙伴", "notify"])
  })
})

/**
 * `deleteL2Cascade` 的级联矩阵（P3 §4.2）。
 *
 * 背景（§1.1）：原来的 `deleteL2` 只清 `l2` + `evidence`，漏了 6 处 ——
 * 向量、`l2DmaeStates`、`conflictLogs`、`conflictWith` / `supersededBy` / `mergedInto`
 * 三个悬空指针、以及引用它的压缩总结。这组用例逐处锁住。
 */
describe("memoryStore.deleteL2Cascade（P3 级联删除）", () => {
  beforeEach(() => {
    electronMock.userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "memory-cascade-"))
    vi.resetModules()
    obsidianExporterMock.notifyMemoryChanged.mockReset()
  })

  /** 直接铺一份 memory.json（绕过写入 API，才能造出"孤儿状态行""悬空指针"这类脏数据）。 */
  function seedStore(overrides: {
    l2: Array<Record<string, unknown>>
    evidence?: Array<Record<string, unknown>>
    l2DmaeStates?: Array<Record<string, unknown>>
    conflictLogs?: Array<Record<string, unknown>>
    reflectionLogs?: Array<Record<string, unknown>>
  }): string {
    const memoryPath = path.join(electronMock.userDataDir, "memory.json")
    fs.writeFileSync(
      memoryPath,
      JSON.stringify({
        schemaVersion: 3,
        l0: { nickname: "", preferredName: "", occupation: "", longTermInterests: "", language: "", permanentNote: "", isPinned: false, updatedAt: 0 },
        l1: { recentGoals: "", recentPreferences: "", currentProject: "", generatedAt: 0, roundCount: 0 },
        l2: overrides.l2,
        evidence: overrides.evidence ?? [],
        l2DmaeStates: overrides.l2DmaeStates ?? [],
        conflictLogs: overrides.conflictLogs ?? [],
        reflectionLogs: overrides.reflectionLogs ?? [],
        version: 1,
      }),
      "utf8",
    )
    return memoryPath
  }

  function l2(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      id,
      content: `content-${id}`,
      triggerText: `trigger-${id}`,
      sourceConversationId: "channel:qq:bbbbbbbbbbbbbbbb",
      createdAt: 1,
      lastAccessedAt: 1,
      accessCount: 0,
      weight: 0,
      isPinned: false,
      status: "active",
      ...extra,
    }
  }

  function readStore(memoryPath: string): Record<string, any> {
    return JSON.parse(fs.readFileSync(memoryPath, "utf8"))
  }

  it("1-3. 清 l2 + evidence + l2DmaeStates + conflictLogs（source / target 命中即整条删）", async () => {
    const memoryPath = seedStore({
      l2: [l2("a"), l2("b"), l2("keep")],
      evidence: [
        { id: "ev_a", memoryId: "a", quoteSnippet: "", createdAt: 1, sourceStatus: "active" },
        { id: "ev_b", memoryId: "b", quoteSnippet: "", createdAt: 1, sourceStatus: "active" },
        { id: "ev_keep", memoryId: "keep", quoteSnippet: "", createdAt: 1, sourceStatus: "active" },
      ],
      l2DmaeStates: [
        { l2Id: "a", activation: 0, intrinsicValue: 0, userSilence: 0, modelSilence: 0, recentUserHits: [], state: "archived" },
        { l2Id: "b", activation: 0, intrinsicValue: 0, userSilence: 0, modelSilence: 0, recentUserHits: [], state: "archived" },
        { l2Id: "keep", activation: 0, intrinsicValue: 0, userSilence: 0, modelSilence: 0, recentUserHits: [], state: "archived" },
      ],
      conflictLogs: [
        { id: "c1", createdAt: 1, status: "candidate", sourceL2Id: "a", targetL2Id: "keep", reason: "", confidence: 1, detector: "local" },
        { id: "c2", createdAt: 1, status: "candidate", sourceL2Id: "keep", targetL2Id: "b", reason: "", confidence: 1, detector: "local" },
        { id: "c3", createdAt: 1, status: "candidate", sourceL2Id: "keep", targetL2Id: "keep", reason: "", confidence: 1, detector: "local" },
      ],
    })
    const { memoryStore } = await import("./memory-store")

    const result = await memoryStore.deleteL2Cascade(["a", "b"])

    expect(result.removed.map((m) => m.id).sort()).toEqual(["a", "b"])
    expect(result.evidence).toBe(2)
    expect(result.dmaeStates).toBe(2)
    expect(result.conflictLogs).toBe(2)

    const persisted = readStore(memoryPath)
    expect(persisted.l2.map((m: any) => m.id)).toEqual(["keep"])
    expect(persisted.evidence.map((e: any) => e.id)).toEqual(["ev_keep"])
    expect(persisted.l2DmaeStates.map((s: any) => s.l2Id)).toEqual(["keep"])
    expect(persisted.conflictLogs.map((c: any) => c.id)).toEqual(["c3"])
  })

  it("4. resolutionMemoryId 命中只清字段：日志本身保留（它是历史事实）", async () => {
    const memoryPath = seedStore({
      l2: [l2("a"), l2("keep")],
      conflictLogs: [
        {
          id: "c1", createdAt: 1, status: "resolved", sourceL2Id: "keep", targetL2Id: "keep",
          reason: "", confidence: 1, detector: "local", resolutionMemoryId: "a",
        },
      ],
    })
    const { memoryStore } = await import("./memory-store")
    await memoryStore.deleteL2Cascade(["a"])

    const persisted = readStore(memoryPath)
    expect(persisted.conflictLogs).toHaveLength(1)
    expect(persisted.conflictLogs[0].resolutionMemoryId).toBeUndefined()
  })

  it("5-6. 修悬空指针：conflictWith（ragId）/ supersededBy / mergedInto，且 status 不变", async () => {
    const memoryPath = seedStore({
      l2: [
        l2("a", { ragId: "rag_a" }),
        l2("b", { ragId: "rag_b" }),
        l2("keep", {
          conflictWith: ["rag_a", "rag_b", "rag_other"],
          supersededBy: "a",
          mergedInto: "b",
          status: "superseded",
        }),
      ],
    })
    const { memoryStore } = await import("./memory-store")

    const result = await memoryStore.deleteL2Cascade(["a", "b"])

    // conflictWith 悬空 2 个（rag_a / rag_b）+ supersededBy 1 + mergedInto 1 = 4
    expect(result.danglingRefsFixed).toBe(4)
    const persisted = readStore(memoryPath)
    const survivor = persisted.l2[0]
    expect(survivor.conflictWith).toEqual(["rag_other"])
    expect(survivor.supersededBy).toBeUndefined()
    expect(survivor.mergedInto).toBeUndefined()
    // ⚠️ 只清指针、不回滚状态：把 superseded 退回 active 会让旧记忆重新参与召回
    expect(survivor.status).toBe("superseded")
  })

  it("7. 引用被删 id 的压缩总结进入 summaries（本方法不删它，交给去压缩）", async () => {
    seedStore({
      l2: [
        l2("a"),
        l2("b"),
        l2("sum_mixed", { isSummary: true, subEntryIds: ["a", "b", "keep"] }),
        l2("sum_all", { isSummary: true, subEntryIds: ["a"] }),
        l2("sum_none", { isSummary: true, subEntryIds: ["keep"] }),
      ],
    })
    const { memoryStore } = await import("./memory-store")

    const result = await memoryStore.deleteL2Cascade(["a"])

    expect(result.summaries.map((m) => m.id).sort()).toEqual(["sum_all", "sum_mixed"])
  })

  it("8. 反思日志指纹清理：整条正文原样出现在 details 里才删，短正文（<8）不参与", async () => {
    const memoryPath = seedStore({
      l2: [l2("long", { content: "用户说他最近在学 Rust 语言" }), l2("short", { content: "好的" }), l2("keep")],
      reflectionLogs: [
        { id: "r1", createdAt: 1, type: "compression", summary: "s", details: "原条目：用户说他最近在学 Rust 语言 | 总结：..." },
        { id: "r2", createdAt: 1, type: "compression", summary: "s", details: "原条目：好的" },
        { id: "r3", createdAt: 1, type: "compression", summary: "s", details: "与任何人都无关的反思" },
      ],
    })
    const { memoryStore } = await import("./memory-store")

    const result = await memoryStore.deleteL2Cascade(["long", "short"])

    expect(result.reflectionLogs).toBe(1)
    const persisted = readStore(memoryPath)
    expect(persisted.reflectionLogs.map((log: any) => log.id)).toEqual(["r2", "r3"])
  })

  it("9. 一次 save()：不逐条落盘", async () => {
    seedStore({ l2: [l2("a"), l2("b"), l2("c")] })
    const { memoryStore } = await import("./memory-store")
    const saveSpy = vi.spyOn(memoryStore, "save")

    await memoryStore.deleteL2Cascade(["a", "b"])

    expect(saveSpy).toHaveBeenCalledTimes(1)
  })

  it("10. 空入参 / 全部 id 都不存在：不改任何字段、不落盘", async () => {
    const memoryPath = seedStore({ l2: [l2("keep")] })
    const { memoryStore } = await import("./memory-store")
    const before = fs.readFileSync(memoryPath, "utf8")
    const saveSpy = vi.spyOn(memoryStore, "save")

    const empty = await memoryStore.deleteL2Cascade([])
    const missing = await memoryStore.deleteL2Cascade(["nope"])

    expect(empty.removed).toEqual([])
    expect(missing.removed).toEqual([])
    expect(saveSpy).not.toHaveBeenCalled()
    expect(fs.readFileSync(memoryPath, "utf8")).toBe(before)
  })

  it("previewL2Cascade 与 deleteL2Cascade 报告同一组数字（预演 ≠ 假数据）", async () => {
    const memoryPath = seedStore({
      l2: [l2("a", { ragId: "rag_a" }), l2("keep", { conflictWith: ["rag_a"] })],
      evidence: [{ id: "ev_a", memoryId: "a", quoteSnippet: "", createdAt: 1, sourceStatus: "active" }],
      l2DmaeStates: [{ l2Id: "a", activation: 0, intrinsicValue: 0, userSilence: 0, modelSilence: 0, recentUserHits: [], state: "archived" }],
    })
    const { memoryStore } = await import("./memory-store")

    const preview = await memoryStore.previewL2Cascade(["a"])
    const before = fs.readFileSync(memoryPath, "utf8")
    // 预演**绝不写盘**
    expect(fs.readFileSync(memoryPath, "utf8")).toBe(before)

    const applied = await memoryStore.deleteL2Cascade(["a"])

    expect(preview.removed.map((m) => m.id)).toEqual(applied.removed.map((m) => m.id))
    expect(preview.evidence).toBe(applied.evidence)
    expect(preview.dmaeStates).toBe(applied.dmaeStates)
    expect(preview.conflictLogs).toBe(applied.conflictLogs)
    expect(preview.danglingRefsFixed).toBe(applied.danglingRefsFixed)
    expect(preview.reflectionLogs).toBe(applied.reflectionLogs)
    expect(preview.removedRagIds).toEqual(["rag_a"])
  })
})

