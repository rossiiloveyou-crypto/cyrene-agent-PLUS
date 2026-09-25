import { beforeEach, describe, expect, it } from "vitest"
import {
  clearRecentMemoryInjections,
  forgetMemoryInjections,
  getRecentlyInjectedMemoryIds,
  recordRecentMemoryInjection,
  recordRecentMemorySearchEntries,
  wasRecentlyInjectedMemory,
} from "./recent-injected-memory"

describe("recent injected memory tracking", () => {
  beforeEach(() => {
    clearRecentMemoryInjections()
  })

  it("records and resolves recently injected L2 memory ids", () => {
    recordRecentMemoryInjection(["l2_a", "l2_b"], 1000)

    expect(wasRecentlyInjectedMemory("l2_a", 1000)).toBe(true)
    expect(wasRecentlyInjectedMemory("l2_b", 1000)).toBe(true)
    expect(wasRecentlyInjectedMemory("l2_missing", 1000)).toBe(false)
    expect(getRecentlyInjectedMemoryIds(1000)).toEqual(["l2_a", "l2_b"])
  })

  it("expires records outside the recent window", () => {
    recordRecentMemoryInjection(["l2_old"], 1000)

    expect(wasRecentlyInjectedMemory("l2_old", 1000 + 10 * 60 * 1000)).toBe(true)
    expect(wasRecentlyInjectedMemory("l2_old", 1000 + 10 * 60 * 1000 + 1)).toBe(false)
  })

  it("deduplicates ids and keeps the newest injection timestamp", () => {
    recordRecentMemoryInjection(["l2_same"], 1000)
    recordRecentMemoryInjection(["l2_same"], 2000)

    expect(getRecentlyInjectedMemoryIds(2000)).toEqual(["l2_same"])
    expect(wasRecentlyInjectedMemory("l2_same", 2000 + 10 * 60 * 1000)).toBe(true)
  })

  it("records l2 ids from RAG search entry metadata only", () => {
    recordRecentMemorySearchEntries([
      { text: "用户喜欢跑步", metadata: { l2Id: "l2_run" } },
      { text: "旧格式无 l2 id", metadata: {} },
      { text: "导入文档", metadata: { l2Id: 123 } },
    ], 1000)

    expect(getRecentlyInjectedMemoryIds(1000)).toEqual(["l2_run"])
  })

  // —— P3 擦除某人：把已删记忆从"近期注入"缓存里忘掉 ——
  describe("forgetMemoryInjections", () => {
    it("按 l2Id 删除指定条目，其余原样保留", () => {
      recordRecentMemoryInjection(["l2_a", "l2_b", "l2_c"], 1000)

      const removed = forgetMemoryInjections(["l2_b"])

      expect(removed).toBe(1)
      expect(getRecentlyInjectedMemoryIds(1000)).toEqual(["l2_a", "l2_c"])
      expect(wasRecentlyInjectedMemory("l2_b", 1000)).toBe(false)
      expect(wasRecentlyInjectedMemory("l2_a", 1000)).toBe(true)
    })

    it("未知 id 被忽略，不报错也不影响计数", () => {
      recordRecentMemoryInjection(["l2_a"], 1000)

      expect(forgetMemoryInjections(["l2_missing", "l2_nope"])).toBe(0)
      expect(forgetMemoryInjections([])).toBe(0)
      expect(getRecentlyInjectedMemoryIds(1000)).toEqual(["l2_a"])
    })

    it("忘掉之后重新注入同 id 会重新记上（缓存没有残留状态）", () => {
      recordRecentMemoryInjection(["l2_a", "l2_b"], 1000)

      expect(forgetMemoryInjections(["l2_a", "l2_b"])).toBe(2)
      expect(getRecentlyInjectedMemoryIds(1000)).toEqual([])

      recordRecentMemoryInjection(["l2_a"], 2000)
      expect(getRecentlyInjectedMemoryIds(2000)).toEqual(["l2_a"])
    })
  })
})
