import * as fs from "fs"
import * as os from "os"
import * as path from "path"
import { beforeEach, describe, expect, it } from "vitest"

describe("relationship log", () => {
  let filePath: string

  beforeEach(() => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "relationship-log-"))
    filePath = path.join(dir, "relationship-log.json")
  })

  it("records relationship cues without asking for confirmation", async () => {
    const { RelationshipLogStore } = await import("./relationship-log")
    const store = new RelationshipLogStore(filePath)

    await store.recordTurn({
      userText: "记忆确认卡片不要，太影响观感了！",
      assistantText: "明白，这个不做。",
      cyreneFeeling: "温柔",
      channel: "desktop",
    })

    const data = JSON.parse(fs.readFileSync(filePath, "utf8")) as {
      entries: Array<{ userMood: string; relationshipSignal: string; nextCareCue: string }>
      dailySummaries: Array<{ summary: string }>
    }

    expect(data.entries).toHaveLength(1)
    expect(data.entries[0].userMood).toBe("明确边界")
    expect(data.entries[0].relationshipSignal).toContain("低打扰")
    expect(data.entries[0].nextCareCue).toContain("不要弹确认")
    expect(data.dailySummaries[0].summary).toContain("明确边界")
  })

  it("builds a compact context from recent cues", async () => {
    const { RelationshipLogStore } = await import("./relationship-log")
    const store = new RelationshipLogStore(filePath)

    await store.recordTurn({
      userText: "我今天有点累，先别安排太多",
      assistantText: "那就慢一点来。",
      cyreneFeeling: "担心",
      channel: "desktop",
    })

    const context = await store.buildContext()

    expect(context).toContain("【近期关系线索】")
    expect(context).toContain("用户最近状态")
    expect(context).toContain("疲惫")
    expect(context).toContain("下次回应提示")
  })

  it("does not misread common words as boundary signals", async () => {
    const { RelationshipLogStore } = await import("./relationship-log")
    const store = new RelationshipLogStore(filePath)

    for (const text of ["我今天不想吃火锅", "我今天想吃点别的", "先不管这个报错，帮我看下代码"]) {
      await store.recordTurn({
        userText: text,
        assistantText: "好的。",
        cyreneFeeling: "平稳",
        channel: "desktop",
      })
    }

    const data = JSON.parse(fs.readFileSync(filePath, "utf8")) as {
      entries: Array<{ userMood: string }>
    }
    expect(data.entries.every((e) => e.userMood === "未知")).toBe(true)
  })

  // —— 域隔离回归（缺陷 #1）：dailySummaries 必须按 (scope, date) 分桶 ——
  //
  // 旧实现：dailySummaries 每天全局只有一条（按 date 覆盖写、按 date 查），
  // 于是"桌面当天最后一条摘要"会通过 `- 最近日记摘要：…` 注入进群聊上下文，
  // 桌面私密话题就这样串进了群里（真机已实证）。
  describe("dailySummaries 按 (scope, date) 分桶", () => {
    const ROOT = "zone:root"
    const GROUP = "zone:zone_1_group"

    it("同一天的桌面摘要不会串进群聊上下文", async () => {
      const { RelationshipLogStore } = await import("./relationship-log")
      const store = new RelationshipLogStore(filePath)

      await store.recordTurn({
        userText: "我最近在学做菜",
        assistantText: "那很棒呀",
        cyreneFeeling: "开心",
        channel: "desktop",
        scope: ROOT,
      })
      await store.recordTurn({
        userText: "今天中午吃什么",
        assistantText: "吃面吧",
        cyreneFeeling: "平静",
        channel: "qq",
        scope: GROUP,
      })

      const desk = await store.buildContext(ROOT)
      const group = await store.buildContext(GROUP)

      // 各自只看到本域摘要
      expect(desk).toContain("我最近在学做菜")
      expect(desk).not.toContain("今天中午吃什么")
      expect(group).toContain("今天中午吃什么")
      // 关键断言：桌面私密话题不能进群
      expect(group).not.toContain("我最近在学做菜")
    })

    it("nextCareCue 累积也按域分桶（不跨域拼接）", async () => {
      const { RelationshipLogStore } = await import("./relationship-log")
      const store = new RelationshipLogStore(filePath)

      await store.recordTurn({
        userText: "桌面上聊到的私事",
        assistantText: "嗯嗯",
        cyreneFeeling: "平静",
        channel: "desktop",
        scope: ROOT,
      })
      await store.recordTurn({
        userText: "群里聊到的事",
        assistantText: "收到",
        cyreneFeeling: "平静",
        channel: "qq",
        scope: GROUP,
      })

      const group = await store.buildContext(GROUP)
      const cueLine = group.split("\n").find((l) => l.startsWith("- 下次回应提示："))
      expect(cueLine).toBeDefined()
      expect(cueLine).toContain("群里聊到的事")
      expect(cueLine).not.toContain("桌面上聊到的私事")
    })

    it("同一天两个域各存一条摘要，各自带 scope", async () => {
      const { RelationshipLogStore } = await import("./relationship-log")
      const store = new RelationshipLogStore(filePath)

      await store.recordTurn({
        userText: "桌面第一句",
        assistantText: "好",
        cyreneFeeling: "平静",
        channel: "desktop",
        scope: ROOT,
      })
      await store.recordTurn({
        userText: "群里第一句",
        assistantText: "好",
        cyreneFeeling: "平静",
        channel: "qq",
        scope: GROUP,
      })
      await store.recordTurn({
        userText: "桌面第二句",
        assistantText: "好",
        cyreneFeeling: "平静",
        channel: "desktop",
        scope: ROOT,
      })

      const data = JSON.parse(fs.readFileSync(filePath, "utf8")) as {
        dailySummaries: Array<{ date: string; scope?: string; summary: string }>
      }
      const date = data.dailySummaries[0].date
      const sameDay = data.dailySummaries.filter((s) => s.date === date)

      //（scope, date）唯一：桌面三句只留一条，群里一条，共 2 条
      expect(sameDay).toHaveLength(2)
      expect(sameDay.map((s) => s.scope).sort()).toEqual([GROUP, ROOT].sort())
      const deskSummary = sameDay.find((s) => s.scope === ROOT)!.summary
      const groupSummary = sameDay.find((s) => s.scope === GROUP)!.summary
      expect(deskSummary).toContain("桌面第二句")
      expect(groupSummary).toContain("群里第一句")
    })

    it("legacy 无 scope 摘要按日期兜底，不覆盖已分桶的新摘要", async () => {
      const { RelationshipLogStore } = await import("./relationship-log")
      const store = new RelationshipLogStore(filePath)

      await store.recordTurn({
        userText: "群里的新记录",
        assistantText: "好",
        cyreneFeeling: "平静",
        channel: "qq",
        scope: GROUP,
      })

      // 手工塞一条 Phase 2 之前的旧摘要（没有 scope 字段）
      const data = JSON.parse(fs.readFileSync(filePath, "utf8")) as {
        dailySummaries: Array<Record<string, unknown>>
      }
      const date = data.dailySummaries[0].date as string
      data.dailySummaries.push({
        date,
        updatedAt: 1,
        summary: "旧格式摘要：用户最近状态偏「平稳」。",
        nextCareCue: "保持自然陪伴。",
      })
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8")

      const group = await store.buildContext(GROUP)
      // 本域有自己的摘要时，优先用自己的，不能被 legacy 全量摘要顶掉
      expect(group).toContain("群里的新记录")
      expect(group).not.toContain("旧格式摘要")

      // 全量模式（管理面板 / 旧调用）仍能取到 legacy 摘要
      const all = await store.buildContext()
      expect(all).toContain("旧格式摘要")
    })

    it("只有 legacy 摘要而没有新域名时，全量模式行为不变", async () => {
      const { RelationshipLogStore } = await import("./relationship-log")
      const store = new RelationshipLogStore(filePath)

      // 旧调用方（无 scope）走一遍完整链路
      await store.recordTurn({
        userText: "我今天有点累",
        assistantText: "慢一点来。",
        cyreneFeeling: "担心",
        channel: "desktop",
      })

      const data = JSON.parse(fs.readFileSync(filePath, "utf8")) as {
        dailySummaries: Array<{ scope?: string; summary: string }>
      }
      expect(data.dailySummaries).toHaveLength(1)
      // 无 scope 的轮次不该被伪造成某个域
      expect(data.dailySummaries[0].scope).toBeUndefined()

      const all = await store.buildContext()
      expect(all).toContain("最近日记摘要")
      expect(all).toContain("疲惫")
    })
  })

  // —— P3 擦除某人：给关系日志补 personKey + 三个按人删除入口 ——
  //
  // 关系日志是**唯一每轮都进主聊天 prompt** 的载体（【近期关系线索】），
  // 所以"擦除某人"必须能按人删它；存量条目没有归属字段，只能靠原文指纹兜底。
  describe("P3 按人擦除", () => {
    const GROUP_A = "zone:zone_a"
    const GROUP_B = "zone:zone_b"

    function readData(): {
      entries: Array<{ userText: string; scope?: string; personKey?: string }>
      dailySummaries: Array<{ scope?: string }>
    } {
      return JSON.parse(fs.readFileSync(filePath, "utf8"))
    }

    async function makeStore() {
      const { RelationshipLogStore } = await import("./relationship-log")
      return new RelationshipLogStore(filePath)
    }

    it("personKey 落盘往返（无归属的轮次保持 undefined，不被伪造成空串）", async () => {
      const store = await makeStore()

      await store.recordTurn({
        userText: "我是小明",
        assistantText: "记住啦",
        cyreneFeeling: "开心",
        channel: "qq",
        scope: GROUP_A,
        personKey: "qq:10001",
      })
      await store.recordTurn({
        userText: "桌面上的话",
        assistantText: "嗯",
        cyreneFeeling: "平静",
        channel: "desktop",
        scope: "zone:root",
      })

      const data = readData()
      const mine = data.entries.find((e) => e.userText === "我是小明")
      const desktop = data.entries.find((e) => e.userText === "桌面上的话")
      expect(mine?.personKey).toBe("qq:10001")
      expect(desktop?.personKey).toBeUndefined()
    })

    it("eraseByPersonKey 清条目 + 清孤儿摘要，但保留仍有条目的域的摘要", async () => {
      const store = await makeStore()

      // GROUP_A：只有他的一条 → 删完该域再无条目，摘要应一并删除
      await store.recordTurn({
        userText: "A 群只有他说过话",
        assistantText: "好",
        cyreneFeeling: "平静",
        channel: "qq",
        scope: GROUP_A,
        personKey: "qq:10001",
      })
      // GROUP_B：他一条 + 别人一条 → 删完还剩别人的，摘要必须保留
      await store.recordTurn({
        userText: "B 群里他说的话",
        assistantText: "好",
        cyreneFeeling: "平静",
        channel: "qq",
        scope: GROUP_B,
        personKey: "qq:10001",
      })
      await store.recordTurn({
        userText: "B 群里别人说的话",
        assistantText: "好",
        cyreneFeeling: "平静",
        channel: "qq",
        scope: GROUP_B,
        personKey: "qq:10002",
      })

      const result = await store.eraseByPersonKey("qq:10001")

      expect(result).toEqual({ entries: 2, summaries: 1 })
      const data = readData()
      expect(data.entries.map((e) => e.userText)).toEqual(["B 群里别人说的话"])
      expect(data.dailySummaries.map((s) => s.scope)).toEqual([GROUP_B])
    })

    it("eraseByPersonKey 无命中时不改文件、不落盘", async () => {
      const store = await makeStore()
      await store.recordTurn({
        userText: "别人的话",
        assistantText: "好",
        cyreneFeeling: "平静",
        channel: "qq",
        scope: GROUP_A,
        personKey: "qq:10002",
      })
      const before = fs.readFileSync(filePath, "utf8")

      const result = await store.eraseByPersonKey("qq:10001")

      expect(result).toEqual({ entries: 0, summaries: 0 })
      expect(fs.readFileSync(filePath, "utf8")).toBe(before)
    })

    it("eraseByScope 整域删（条目 + 该域摘要），别的域一条不动", async () => {
      const store = await makeStore()
      await store.recordTurn({
        userText: "私聊域的话",
        assistantText: "好",
        cyreneFeeling: "平静",
        channel: "qq",
        scope: "solo:channel:qq:abc",
      })
      await store.recordTurn({
        userText: "别的域的话",
        assistantText: "好",
        cyreneFeeling: "平静",
        channel: "qq",
        scope: GROUP_A,
      })

      const result = await store.eraseByScope("solo:channel:qq:abc")

      expect(result).toEqual({ entries: 1, summaries: 1 })
      const data = readData()
      expect(data.entries.map((e) => e.userText)).toEqual(["别的域的话"])
      expect(data.dailySummaries.map((s) => s.scope)).toEqual([GROUP_A])
    })

    it("eraseByScope 无命中时原样返回、不落盘", async () => {
      const store = await makeStore()
      await store.recordTurn({
        userText: "别人的话",
        assistantText: "好",
        cyreneFeeling: "平静",
        channel: "qq",
        scope: GROUP_A,
      })
      const before = fs.readFileSync(filePath, "utf8")

      const result = await store.eraseByScope("solo:channel:qq:missing")

      expect(result).toEqual({ entries: 0, summaries: 0 })
      expect(fs.readFileSync(filePath, "utf8")).toBe(before)
    })

    it("原文指纹：只有前缀命中且无 personKey 的条目被删，短句/域外/有归属的一律不动", async () => {
      const store = await makeStore()
      const LONG = "我最近在学 Rust 而且已经写了一个小工具试试看" // > 24 字
      const OTHER = "我最近在学 Rust 而且已经写了一个小工具试试看" // 与 LONG 同前缀，但在域外

      // A：S1 域、无 personKey、长正文 → 前缀命中，删
      await store.recordTurn({
        userText: LONG,
        assistantText: "厉害",
        cyreneFeeling: "开心",
        channel: "qq",
        scope: GROUP_A,
      })
      // B：S1 域、无 personKey、短正文（< 24 字）→ 永不删，进 unmatched
      await store.recordTurn({
        userText: "在吗",
        assistantText: "在",
        cyreneFeeling: "平静",
        channel: "qq",
        scope: GROUP_A,
      })
      // C：域外，正文与 A 相同 → 一条不动（指纹只在 scopes 里跑）
      await store.recordTurn({
        userText: OTHER,
        assistantText: "哦",
        cyreneFeeling: "平静",
        channel: "qq",
        scope: GROUP_B,
      })
      // D：S1 域、长正文、但有 personKey → 指纹方法永不碰它
      await store.recordTurn({
        userText: LONG,
        assistantText: "嗯",
        cyreneFeeling: "平静",
        channel: "qq",
        scope: GROUP_A,
        personKey: "qq:10002",
      })
      // E：S3 域只有这一条 → 删完该域为空，摘要一并删
      await store.recordTurn({
        userText: LONG,
        assistantText: "好",
        cyreneFeeling: "平静",
        channel: "qq",
        scope: "zone:zone_c",
      })

      const result = await store.eraseByUserTextFingerprint(
        [GROUP_A, "zone:zone_c"],
        [LONG],
      )

      // A + E 被删；B 无 personKey 且没匹配上 → unmatched 1；D 有归属不计入
      expect(result).toEqual({ entries: 2, summaries: 1, unmatched: 1 })
      const data = readData()
      expect(data.entries.map((e) => e.userText).sort()).toEqual(["在吗", OTHER, LONG].sort())
      const personas = data.entries.filter((e) => e.personKey === "qq:10002")
      expect(personas).toHaveLength(1)
      // S3 域已无条目，摘要随之删除；GROUP_A（还有 B/D）与 GROUP_B（还有 C）的摘要保留
      expect(data.dailySummaries.map((s) => s.scope).sort()).toEqual([GROUP_A, GROUP_B].sort())
    })

    it("原文指纹：removedUserTexts 为空或全短于前缀长度 → 一条都不删，unmatched 如实计数", async () => {
      const store = await makeStore()
      await store.recordTurn({
        userText: "我最近在学 Rust 而且已经写了一个小工具",
        assistantText: "厉害",
        cyreneFeeling: "开心",
        channel: "qq",
        scope: GROUP_A,
      })
      const before = fs.readFileSync(filePath, "utf8")

      const result = await store.eraseByUserTextFingerprint([GROUP_A], ["在吗", "好呀"])

      expect(result).toEqual({ entries: 0, summaries: 0, unmatched: 1 })
      expect(fs.readFileSync(filePath, "utf8")).toBe(before)
    })

    it("readAll 返回只读深拷贝：预演不改磁盘，拿到后也不受后续写入影响", async () => {
      const store = await makeStore()
      await store.recordTurn({
        userText: "预演用的原话",
        assistantText: "好",
        cyreneFeeling: "平静",
        channel: "qq",
        scope: GROUP_A,
      })
      const before = fs.readFileSync(filePath, "utf8")

      const snapshot = await store.readAll()

      // 只读：预演本身不能落盘
      expect(fs.readFileSync(filePath, "utf8")).toBe(before)
      expect(snapshot.entries).toHaveLength(1)
      expect(snapshot.dailySummaries).toHaveLength(1)

      // 深拷贝：改快照不会污染 store 的下一份快照
      snapshot.entries[0].userText = "被改过了"
      snapshot.dailySummaries.length = 0
      const again = await store.readAll()
      expect(again.entries[0].userText).toBe("预演用的原话")
      expect(again.dailySummaries).toHaveLength(1)

      // 后续写入也不回流进旧快照
      await store.recordTurn({
        userText: "预演之后他又说话了",
        assistantText: "嗯",
        cyreneFeeling: "平静",
        channel: "qq",
        scope: GROUP_A,
      })
      expect(snapshot.entries).toHaveLength(1)
      expect((await store.readAll()).entries).toHaveLength(2)
    })

    it("导出的纯函数与 store 方法判据一致：命中即删，未命中即计入 unmatched", async () => {
      const {
        RelationshipLogStore,
        buildUserTextPrefixes,
        matchesRemovedUserTextFingerprint,
      } = await import("./relationship-log")
      const store = new RelationshipLogStore(filePath)
      const LONG = "我最近在学 Rust 而且已经写了一个小工具试试看"

      await store.recordTurn({
        userText: LONG,
        assistantText: "厉害",
        cyreneFeeling: "开心",
        channel: "qq",
        scope: GROUP_A,
      })
      await store.recordTurn({
        userText: "在吗",
        assistantText: "在",
        cyreneFeeling: "平静",
        channel: "qq",
        scope: GROUP_A,
      })
      await store.recordTurn({
        userText: LONG,
        assistantText: "嗯",
        cyreneFeeling: "平静",
        channel: "qq",
        scope: GROUP_A,
        personKey: "qq:10002",
      })

      const snapshot = await store.readAll()
      const scopes = new Set([GROUP_A])
      const prefixes = buildUserTextPrefixes([LONG], 24)
      const predicted = snapshot.entries
        .filter((e) => matchesRemovedUserTextFingerprint(e, scopes, prefixes, 24))
        .map((e) => e.id)

      const result = await store.eraseByUserTextFingerprint([GROUP_A], [LONG])

      // 预测的命中集合与真实删除条数一致
      expect(result.entries).toBe(predicted.length)
      const after = await store.readAll()
      expect(after.entries.some((e) => predicted.includes(e.id))).toBe(false)
      // 未命中的（域内、无 personKey、不在预测集合里）恰好等于 unmatched
      const expectedUnmatched = snapshot.entries
        .filter((e) => e.scope === GROUP_A && !e.personKey && !predicted.includes(e.id))
        .length
      expect(result.unmatched).toBe(expectedUnmatched)
    })
  })

  /**
   * D6（P3 §9.6.6）：预演必须**在与执行相同的顺序与判据下**算出五格（含 summaries）。
   * 这条用例锁的是"预演与执行不漂移"这个不变量本身，而不是某个具体数字。
   */
  it("previewErasePerson 与三个 eraseBy* 的实际结果逐格相等（含孤儿摘要）", async () => {
    const { RelationshipLogStore } = await import("./relationship-log")
    const MY = "qq:10001"
    const GROUP = "channel:qq:group000000000000"
    const MY_PRIVATE = "channel:qq:private0000000000"
    const LONG = "我最近在学 Rust 语言，已经能写一点小工具了"

    const build = async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "relationship-preview-"))
      const file = path.join(dir, "relationship-log.json")
      const store = new RelationshipLogStore(file)
      await store.recordTurn({ userText: "按人该删的那条", assistantText: "嗯", cyreneFeeling: "平静", channel: "qq", scope: "zone:root", personKey: MY })
      await store.recordTurn({ userText: "整域该删的那条", assistantText: "嗯", cyreneFeeling: "平静", channel: "qq", scope: "solo:" + MY_PRIVATE })
      await store.recordTurn({ userText: LONG, assistantText: "嗯", cyreneFeeling: "平静", channel: "qq", scope: "solo:" + GROUP })
      await store.recordTurn({ userText: "别人说的、匹配不上的存量条目", assistantText: "嗯", cyreneFeeling: "平静", channel: "qq", scope: "solo:" + GROUP })
      return { store, file }
    }

    const previewCase = await build()
    const preview = await previewCase.store.previewErasePerson({
      personKey: MY,
      soloScopes: ["solo:" + MY_PRIVATE],
      fingerprintScopes: ["solo:" + GROUP],
      removedUserTexts: [LONG],
    })
    // 预演是**只读**的：条目与摘要一个都不能少
    const untouched = JSON.parse(fs.readFileSync(previewCase.file, "utf8")) as { entries: unknown[]; dailySummaries: unknown[] }
    expect(untouched.entries).toHaveLength(4)
    expect(untouched.dailySummaries.length).toBeGreaterThan(0)

    const execCase = await build()
    const byKey = await execCase.store.eraseByPersonKey(MY)
    const byScope = await execCase.store.eraseByScope("solo:" + MY_PRIVATE)
    const byFp = await execCase.store.eraseByUserTextFingerprint(["solo:" + GROUP], [LONG])

    expect(preview.byPersonKey).toBe(byKey.entries)
    expect(preview.byScope).toBe(byScope.entries)
    expect(preview.byTextFingerprint).toBe(byFp.entries)
    expect(preview.unmatched).toBe(byFp.unmatched)
    expect(preview.summaries).toBe(byKey.summaries + byScope.summaries + byFp.summaries)
    expect(preview.summaries).toBeGreaterThan(0)
  })
})
