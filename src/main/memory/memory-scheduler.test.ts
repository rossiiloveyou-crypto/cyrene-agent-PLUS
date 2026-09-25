import { beforeEach, describe, expect, it, vi } from "vitest"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"

const electronMock = vi.hoisted(() => ({ userDataDir: "" }))

vi.mock("electron", () => ({
  app: { getPath: () => electronMock.userDataDir },
}))

import { MemoryScheduler } from "./memory-scheduler"
import type { MemorySchedulerDeps } from "./memory-scheduler"
import type { MemoryJudgeResult } from "./memory-schemas"
import type { MemoryCandidate, MemoryJudgeTurn } from "./memory-types"

function createScheduler(overrides: Partial<MemorySchedulerDeps> = {}) {
  const calls: string[] = []
  const enqueueLabels: string[] = []
  let roundCount = 0
  let queue = Promise.resolve()
  const deps: MemorySchedulerDeps = {
    ingestEntities: vi.fn((entities: unknown[], _scopeId: string) => {
      calls.push(`ingest:${entities.length}`)
    }),
    enqueueTask: <T>(label: string, task: () => Promise<T>) => {
      enqueueLabels.push(label)
      calls.push("enqueue")
      const run = queue.then(task)
      queue = run.then(() => undefined, () => undefined)
      return run
    },
    judgeMemory: vi.fn(async () => ({ candidates: [], entities: [] }) as MemoryJudgeResult),
    writeMemory: vi.fn(async () => {
      calls.push("write")
    }),
    getL1: vi.fn(async () => ({
      recentGoals: "",
      recentPreferences: "",
      currentProject: "",
      generatedAt: 0,
        roundCount,
      })),
    replaceL1Field: vi.fn(async (_field: "roundCount", value: number) => {
      roundCount = value
      calls.push(`round:${value}`)
    }),
    runReflectionAndCompression: vi.fn(async () => {
      calls.push("reflection")
    }),
    runResolverQueueOnce: vi.fn(async () => {
      calls.push("resolver")
    }),
    runDecay: vi.fn(async () => {
      calls.push("decay")
    }),
    ...overrides,
  }

  return { scheduler: new MemoryScheduler(deps), deps, calls, enqueueLabels }
}

describe("MemoryScheduler", () => {
  beforeEach(() => {
    electronMock.userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "memory-scheduler-"))
  })

  it("defers MemoryJudge until every sixth round", async () => {
    const { scheduler, deps, enqueueLabels } = createScheduler()

    for (let i = 1; i <= 5; i++) {
      scheduler.scheduleMemoryWrite(`user ${i}`, `assistant ${i}`)
    }
    await vi.waitFor(() => expect(deps.replaceL1Field).toHaveBeenCalledWith("roundCount", 5))

    // 实体抽取改由 judge 顺手产出，非 judge 轮（5 < 6）不 ingest 实体
    expect(deps.ingestEntities).not.toHaveBeenCalled()
    expect(enqueueLabels).toEqual(["MemoryMaintenance", "MemoryMaintenance", "MemoryMaintenance", "MemoryMaintenance", "MemoryMaintenance"])
    expect(deps.judgeMemory).not.toHaveBeenCalled()
    expect(deps.writeMemory).not.toHaveBeenCalled()
  })

  it("runs MemoryJudge on the sixth round with turns 1 through 6", async () => {
    const candidate: MemoryCandidate = {
      layer: "L2",
      summary: "用户喜欢香菇",
      content: "用户喜欢香菇",
      confidence: 0.9,
      triggerText: "我喜欢香菇",
      slug: "喜欢香菇",
      sourceQuote: "我喜欢香菇，尤其爱吃鲜香菇",
      importance: "medium",
      stability: "situational",
      certainty: "explicit",
      attribution: "user_explicit",
      evidenceQuotes: ["我喜欢香菇"],
      contextSummary: "用户表达食物偏好",
      shouldWrite: true,
      reason: "用户明确表达",
      forbiddenOverclaims: [],
    }
    const { scheduler, deps } = createScheduler({
      judgeMemory: vi.fn(async () => ({ candidates: [candidate], entities: [] }) as MemoryJudgeResult),
    })

    for (let i = 1; i <= 6; i++) {
      scheduler.scheduleMemoryWrite(`user ${i}`, `assistant ${i}`)
    }
    // 调度层给每个候选注入记忆域：无会话 id → root 域
    await vi.waitFor(() => expect(deps.writeMemory).toHaveBeenCalledWith([{ ...candidate, scope: "zone:root" }]))

    const turns = vi.mocked(deps.judgeMemory).mock.calls[0][0]
    expect(turns.map((turn: MemoryJudgeTurn) => turn.userInput)).toEqual([
      "user 1",
      "user 2",
      "user 3",
      "user 4",
      "user 5",
      "user 6",
    ])
    expect(deps.replaceL1Field).toHaveBeenCalledWith("roundCount", 6)
  })

  it("uses an overlapping 8-turn window on later MemoryJudge runs", async () => {
    const { scheduler, deps } = createScheduler()

    for (let i = 1; i <= 12; i++) {
      scheduler.scheduleMemoryWrite(`user ${i}`, `assistant ${i}`)
    }
    await vi.waitFor(() => expect(deps.replaceL1Field).toHaveBeenCalledWith("roundCount", 12))

    expect(deps.judgeMemory).toHaveBeenCalledTimes(2)
    const secondTurns = vi.mocked(deps.judgeMemory).mock.calls[1][0]
    expect(secondTurns.map((turn: MemoryJudgeTurn) => turn.userInput)).toEqual([
      "user 5",
      "user 6",
      "user 7",
      "user 8",
      "user 9",
      "user 10",
      "user 11",
      "user 12",
    ])
  })

  it("still increments round count when judging fails", async () => {
    const { scheduler, deps } = createScheduler({
      judgeMemory: vi.fn(async () => {
        throw new Error("judge failed")
      }),
    })

    scheduler.scheduleMemoryWrite("user", "assistant")
    await vi.waitFor(() => expect(deps.replaceL1Field).toHaveBeenCalledWith("roundCount", 1))

    expect(deps.judgeMemory).not.toHaveBeenCalled()
    expect(deps.writeMemory).not.toHaveBeenCalled()
  })

  it("runs reflection and compression on every twentieth round", async () => {
    const { scheduler, deps } = createScheduler({
      getL1: vi.fn(async () => ({
        recentGoals: "",
        recentPreferences: "",
        currentProject: "",
        generatedAt: 0,
        roundCount: 19,
      })),
    })

    scheduler.scheduleMemoryWrite("user", "assistant")
    await vi.waitFor(() => expect(deps.runReflectionAndCompression).toHaveBeenCalled())

    expect(deps.replaceL1Field).toHaveBeenCalledWith("roundCount", 20)
  })

  it("runs one resolver queue item every fifth round", async () => {
    const { scheduler, deps } = createScheduler({
      getL1: vi.fn(async () => ({
        recentGoals: "",
        recentPreferences: "",
        currentProject: "",
        generatedAt: 0,
        roundCount: 4,
      })),
    })

    scheduler.scheduleMemoryWrite("user", "assistant")
    await vi.waitFor(() => expect(deps.runResolverQueueOnce).toHaveBeenCalled())

    expect(deps.replaceL1Field).toHaveBeenCalledWith("roundCount", 5)
  })

  it("keeps turns from different memory scopes in separate buckets", async () => {
    const candidate: MemoryCandidate = {
      layer: "L2",
      content: "群里聊到的事",
      confidence: 0.9,
      triggerText: "聊到的事",
    }
    const { scheduler, deps } = createScheduler({
      judgeMemory: vi.fn(async () => ({ candidates: [candidate], entities: [] }) as MemoryJudgeResult),
    })

    // 3 轮群 A + 3 轮群 B。roundCount 是全局的，第 6 轮才触发 judge，
    // 但 judge 的输入必须是"触发时所在域"的那 3 轮，不能把 A/B 拼成一段对话。
    for (let i = 1; i <= 3; i++) {
      scheduler.scheduleMemoryWrite(`A ${i}`, `a ${i}`, "channel:qq:groupA")
    }
    for (let i = 1; i <= 3; i++) {
      scheduler.scheduleMemoryWrite(`B ${i}`, `b ${i}`, "channel:qq:groupB")
    }

    await vi.waitFor(() => expect(deps.judgeMemory).toHaveBeenCalled())

    const inputs = vi.mocked(deps.judgeMemory).mock.calls[0][0].map((turn: MemoryJudgeTurn) => turn.userInput)
    expect(inputs).toEqual(["B 1", "B 2", "B 3"])
    expect(inputs.some((text) => text.startsWith("A "))).toBe(false)

    // 候选被注入所属域（这两个群都没加入任何区块 → 各自独立域）
    const written = vi.mocked(deps.writeMemory).mock.calls[0][0]
    expect(written[0].scope).toBe("solo:channel:qq:groupB")
    expect(deps.ingestEntities).not.toHaveBeenCalled()
  })

  // ── P2 归属透传（第 4 参数 → turn 桶 → judge 输入 → 落库候选）──

  it("把 attribution 的三个字段带进 turn 桶，并原样交给 judge", async () => {
    const { scheduler, deps } = createScheduler()

    for (let i = 1; i <= 6; i++) {
      scheduler.scheduleMemoryWrite(`user ${i}`, `assistant ${i}`, "channel:qq:groupA", {
        personKey: "qq:10001",
        speakerName: "小明",
        messageId: `msg_${i}`,
      })
    }
    await vi.waitFor(() => expect(deps.judgeMemory).toHaveBeenCalled())

    const turns = vi.mocked(deps.judgeMemory).mock.calls[0][0] as MemoryJudgeTurn[]
    expect(turns).toHaveLength(6)
    expect(turns.map((turn) => turn.personKey)).toEqual(Array(6).fill("qq:10001"))
    expect(turns.map((turn) => turn.speakerName)).toEqual(Array(6).fill("小明"))
    expect(turns.map((turn) => turn.messageId)).toEqual([
      "msg_1", "msg_2", "msg_3", "msg_4", "msg_5", "msg_6",
    ])
  })

  it("无 attribution 时 turn 形状与 P1 完全一致（不多出 undefined 键）", async () => {
    const { scheduler, deps } = createScheduler()

    for (let i = 1; i <= 6; i++) {
      scheduler.scheduleMemoryWrite(`user ${i}`, `assistant ${i}`)
    }
    await vi.waitFor(() => expect(deps.judgeMemory).toHaveBeenCalled())

    const turns = vi.mocked(deps.judgeMemory).mock.calls[0][0] as MemoryJudgeTurn[]
    for (const turn of turns) {
      expect(Object.keys(turn).sort()).toEqual(["assistantReply", "userInput"])
    }
  })

  it("落库候选带 speakerIds / subjectIds / sourceMessageIds（判定后归属注入）", async () => {
    const candidate: MemoryCandidate = {
      layer: "L2",
      content: "小明最近在学 Rust",
      confidence: 0.9,
      triggerText: "我最近在学 Rust",
      // LLM 侧输出：人名 + 轮次号（1-based）
      subjectNames: ["小明"],
      sourceTurnIndexes: [2],
    }
    const { scheduler, deps } = createScheduler({
      judgeMemory: vi.fn(async () => ({ candidates: [candidate], entities: [] }) as MemoryJudgeResult),
    })

    for (let i = 1; i <= 6; i++) {
      scheduler.scheduleMemoryWrite(`user ${i}`, `assistant ${i}`, "channel:qq:groupA", {
        personKey: i === 2 ? "qq:10001" : "qq:10002",
        speakerName: i === 2 ? "小明" : "小红",
        messageId: `msg_${i}`,
      })
    }

    await vi.waitFor(() => expect(deps.writeMemory).toHaveBeenCalled())
    const written = vi.mocked(deps.writeMemory).mock.calls[0][0]

    expect(written[0]).toMatchObject({
      scope: "solo:channel:qq:groupA",
      // 第 2 轮是小明说的、也是关于小明的
      speakerIds: ["qq:10001"],
      subjectIds: ["qq:10001"],
      sourceMessageIds: ["msg_2"],
    })
  })

  it("说话人 ≠ 主体：小红说「小明在学 Rust」时两个字段分道扬镳", async () => {
    const candidate: MemoryCandidate = {
      layer: "L2",
      content: "小明最近在学 Rust",
      confidence: 0.9,
      triggerText: "小明最近在学 Rust",
      subjectNames: ["小明"],
      sourceTurnIndexes: [2],
    }
    const { scheduler, deps } = createScheduler({
      judgeMemory: vi.fn(async () => ({ candidates: [candidate], entities: [] }) as MemoryJudgeResult),
    })

    for (let i = 1; i <= 6; i++) {
      scheduler.scheduleMemoryWrite(`user ${i}`, `assistant ${i}`, "channel:qq:groupA", {
        // 第 1 轮小明说过话（进名册），第 2 轮是小红说的
        personKey: i === 1 ? "qq:10001" : "qq:10002",
        speakerName: i === 1 ? "小明" : "小红",
        messageId: `msg_${i}`,
      })
    }

    await vi.waitFor(() => expect(deps.writeMemory).toHaveBeenCalled())
    const written = vi.mocked(deps.writeMemory).mock.calls[0][0]

    expect(written[0].speakerIds).toEqual(["qq:10002"])
    expect(written[0].subjectIds).toEqual(["qq:10001"])
    expect(written[0].sourceMessageIds).toEqual(["msg_2"])
  })

  it("桌面路径（无归属）落库候选不带任何归属字段", async () => {
    const candidate: MemoryCandidate = {
      layer: "L2",
      content: "用户在重构记忆系统",
      confidence: 0.9,
      triggerText: "重构记忆系统",
    }
    const { scheduler, deps } = createScheduler({
      judgeMemory: vi.fn(async () => ({ candidates: [candidate], entities: [] }) as MemoryJudgeResult),
    })

    for (let i = 1; i <= 6; i++) {
      scheduler.scheduleMemoryWrite(`user ${i}`, `assistant ${i}`)
    }

    await vi.waitFor(() => expect(deps.writeMemory).toHaveBeenCalledWith([{ ...candidate, scope: "zone:root" }]))
    const written = vi.mocked(deps.writeMemory).mock.calls[0][0]
    expect("speakerIds" in written[0]).toBe(false)
    expect("subjectIds" in written[0]).toBe(false)
    expect("sourceMessageIds" in written[0]).toBe(false)
  })

  // ── 非 root 域只允许 L2：判据提前到提示词 ──
  //
  // memory-manager 本来就会丢弃非 root 域的 L0/L1 候选，但 LLM 不知道，
  // 会把 judge 那 800 token 的输出预算浪费在注定被丢弃的候选上（实测：4 轮群聊
  // 产出 2 条 L1 → 全被丢弃 → l2 = 0，而真正的 L2 连生成的机会都没有）。
  // 这两个用例锁住"判据在调度层算一次、并以 options 形式下传"。

  it("非 root 域（渠道会话）下传 l2Only=true", async () => {
    const { scheduler, deps } = createScheduler()

    for (let i = 1; i <= 6; i++) {
      scheduler.scheduleMemoryWrite(`user ${i}`, `assistant ${i}`, "channel:qq:groupA", {
        personKey: "qq:10001",
        speakerName: "小明",
        messageId: `msg_${i}`,
      })
    }

    await vi.waitFor(() => expect(deps.judgeMemory).toHaveBeenCalled())
    expect(vi.mocked(deps.judgeMemory).mock.calls[0][2]).toEqual({ l2Only: true })
  })

  it("root 域（桌面）下传 l2Only=false", async () => {
    const { scheduler, deps } = createScheduler()

    for (let i = 1; i <= 6; i++) {
      scheduler.scheduleMemoryWrite(`user ${i}`, `assistant ${i}`)
    }

    await vi.waitFor(() => expect(deps.judgeMemory).toHaveBeenCalled())
    expect(vi.mocked(deps.judgeMemory).mock.calls[0][2]).toEqual({ l2Only: false })
  })
})
