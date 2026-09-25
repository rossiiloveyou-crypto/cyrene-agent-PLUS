import * as fs from "fs"
import * as path from "path"
import { app } from "electron"
import type { ChannelId } from "../channels/types"

export type RelationshipChannel = "desktop" | ChannelId

export interface RelationshipTurnInput {
  userText: string
  assistantText: string
  cyreneFeeling: string
  channel: RelationshipChannel
  /**
   * 所属记忆域（Phase 2 引入）。取值见 zones/types.ts 的 MemoryScopeId。
   * 缺失视为 legacy：只有显式传 undefined 的调用方才看得到旧记录。
   */
  scope?: string
  /**
   * 本轮说话人 `<channel>:<senderId>`（Phase 3 P3 引入）。
   *
   * 关系日志是**唯一每轮都进主聊天 prompt** 的载体（【近期关系线索】），
   * 所以"擦除某人"必须能按人删它 —— 而它的既有字段里没有任何归属人信息。
   * 缺失 = P3 之前的存量条目：这些只能靠 §2.10 的「原文指纹」兜底匹配。
   */
  personKey?: string
}

export interface RelationshipLogEntry extends RelationshipTurnInput {
  id: string
  date: string
  createdAt: number
  userMood: string
  relationshipSignal: string
  importantMoment?: string
  nextCareCue: string
}

export interface RelationshipDailySummary {
  date: string
  updatedAt: number
  summary: string
  nextCareCue: string
  /**
   * 摘要归属的记忆域（Phase 2 缺陷 #1 修复引入）。与 entries[].scope 同源。
   * 缺失 = Phase 2 之前的 legacy 摘要（当时每天全局只有一条）。
   */
  scope?: string
}

interface RelationshipLogData {
  entries: RelationshipLogEntry[]
  dailySummaries: RelationshipDailySummary[]
}

const EMPTY_DATA: RelationshipLogData = {
  entries: [],
  dailySummaries: [],
}

const MAX_ENTRIES = 500
const MAX_DAILY_SUMMARIES = 90
/** 原文指纹匹配的默认前缀长度（24 字）；擦除链路两边必须用同一个值，否则预演与执行会漂移。 */
const LEGACY_MATCH_PREFIX_DEFAULT = 24

function defaultFilePath(): string {
  return path.join(app.getPath("userData"), "relationship-log.json")
}

function localDate(ts: number): string {
  const d = new Date(ts)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

function compact(text: string, max = 120): string {
  const s = text.replace(/\s+/g, " ").trim()
  return s.length > max ? s.slice(0, max) + "..." : s
}

function detectUserMood(text: string): string {
  if (/累|疲惫|困|没精神|撑不住|倦/.test(text)) return "疲惫"
  // 仅匹配明确指向交互方式的边界表达，避免"别/不想/先不"等常用词误伤
  // （如"我今天不想xx"、"想吃点别的"不应触发低打扰偏好）
  if (/影响观感|太影响|不要.{0,4}(确认|弹|问|卡片)|别.{0,4}(问|弹|确认|卡片)|少问|别问了/.test(text)) return "明确边界"
  if (/焦虑|压力|烦|崩|紧张|担心|慌/.test(text)) return "焦虑"
  if (/难过|伤心|委屈|失落|想哭/.test(text)) return "低落"
  if (/开心|高兴|舒服|喜欢|好耶|太好了/.test(text)) return "开心"
  return "未知"
}

function deriveSignal(userText: string, userMood: string): {
  relationshipSignal: string
  importantMoment?: string
  nextCareCue: string
} {
  if (userMood === "明确边界") {
    return {
      relationshipSignal: "用户表达了低打扰偏好或体验边界，需要优先尊重，不要把关心做成打断。",
      importantMoment: "用户明确表示不喜欢影响观感的确认卡片或过度询问。",
      nextCareCue: "不要弹确认或反复追问；先按用户偏好安静执行，必要时用一句话确认。",
    }
  }

  if (userMood === "疲惫") {
    return {
      relationshipSignal: "用户显露疲惫状态，更需要低压力陪伴和短回应。",
      nextCareCue: "下次回应提示：少安排、少追问，语气放慢，先接住状态。",
    }
  }

  if (userMood === "焦虑") {
    return {
      relationshipSignal: "用户可能处在压力或焦虑里，需要稳定感和清晰的小步建议。",
      nextCareCue: "下次回应提示：先安抚，再给一两个可执行小步，不要铺太大。",
    }
  }

  if (userMood === "低落") {
    return {
      relationshipSignal: "用户情绪偏低，需要被理解和陪着，而不是立刻被纠正。",
      nextCareCue: "下次回应提示：先承认感受，再轻轻陪伴，不要急着总结道理。",
    }
  }

  if (userMood === "开心") {
    return {
      relationshipSignal: "用户反馈偏积极，可以保持轻快互动并记住触发愉快的点。",
      nextCareCue: "下次回应提示：可以更轻松一点，延续用户的好状态。",
    }
  }

  return {
    relationshipSignal: "本轮互动没有明显情绪峰值，保持自然陪伴即可。",
    nextCareCue: `下次回应提示：延续最近话题「${compact(userText, 40)}」，不要过度解读。`,
  }
}

function readData(filePath: string): RelationshipLogData {
  try {
    if (!fs.existsSync(filePath)) return { ...EMPTY_DATA, entries: [], dailySummaries: [] }
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as Partial<RelationshipLogData>
    return {
      entries: Array.isArray(parsed.entries) ? parsed.entries : [],
      dailySummaries: Array.isArray(parsed.dailySummaries) ? parsed.dailySummaries : [],
    }
  } catch {
    return { ...EMPTY_DATA, entries: [], dailySummaries: [] }
  }
}

function writeData(filePath: string, data: RelationshipLogData): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8")
}

function summarizeDate(
  date: string,
  scope: string | undefined,
  entries: RelationshipLogEntry[],
): RelationshipDailySummary {
  const moods = entries.map((e) => e.userMood).filter((m) => m !== "未知")
  const dominantMood = moods.at(-1) ?? "平稳"
  const important = [...entries].reverse().find((e) => e.importantMoment)?.importantMoment
  const cue = entries.at(-1)?.nextCareCue ?? "保持自然陪伴。"
  const signal = entries.at(-1)?.relationshipSignal ?? "今天互动平稳。"
  const parts = [
    `${date}：用户最近状态偏「${dominantMood}」。`,
    important ? `重要偏好：${important}` : signal,
    cue,
  ]
  return {
    date,
    updatedAt: Date.now(),
    summary: parts.join(" "),
    nextCareCue: cue,
    // 不写 undefined：无域轮次落盘形态与 legacy 摘要保持一致
    ...(scope === undefined ? {} : { scope }),
  }
}

/**
 * 取某个 (scope, date) 桶的摘要。
 *
 * 先精确匹配 scope；只有本域当天没有任何带 scope 的摘要时，才回退到同日的 legacy 摘要
 * （Phase 2 之前的文件每天全局一条、没有 scope 字段，回退一次是为了升级后当天不空档）。
 * 反向不成立：legacy 摘要不会顶掉本域已有的摘要，也不会跨域复用。
 */
function findDailySummary(
  data: RelationshipLogData,
  date: string,
  scope: string,
): RelationshipDailySummary | undefined {
  const sameDay = data.dailySummaries.filter((s) => s.date === date)
  return sameDay.find((s) => s.scope === scope)
    ?? (sameDay.some((s) => typeof s.scope === "string")
      ? undefined
      : sameDay.find((s) => s.scope === undefined))
}

/**
 * 把「被删掉的 transcript 行正文」折成前缀集合（O(n)），供
 * `matchesRemovedUserTextFingerprint` 使用。
 *
 * ⚠️ 必须先构造集合再逐条比对 —— 绝不要在双重循环里对每次比对都 `slice`。
 * 短于 `prefixLength` 的正文直接丢弃（它们携带不了身份信息，不参与匹配）。
 */
export function buildUserTextPrefixes(
  removedUserTexts: readonly string[],
  prefixLength: number,
): Set<string> {
  const prefixes = new Set<string>()
  for (const text of removedUserTexts) {
    if (text.length >= prefixLength) prefixes.add(text.slice(0, prefixLength))
  }
  return prefixes
}

/**
 * 纯函数：无 `personKey` 的存量关系条目是否被「被删行正文」的前缀指纹命中。
 *
 * 三个条件同时成立才算命中（§2.10 第 3 步）：
 *   ① 条目在 `scopes` 限定的域里（全库扫会误伤别的群里"别人说过同样短句"）；
 *   ② 条目没有 `personKey`（有新归属的数据走 eraseByPersonKey，指纹只服务存量）；
 *   ③ `userText` 长度 ≥ `prefixLength` 且其前 `prefixLength` 个字符命中 `prefixes`。
 *
 * 预演（dry-run）与执行必须共用这一个判据，否则"D 集合的判定"会出现两份实现而漂移。
 */
export function matchesRemovedUserTextFingerprint(
  entry: Pick<RelationshipLogEntry, "userText" | "personKey" | "scope">,
  scopes: ReadonlySet<string>,
  prefixes: ReadonlySet<string>,
  prefixLength: number,
): boolean {
  if (entry.scope === undefined || !scopes.has(entry.scope)) return false
  if (entry.personKey) return false
  if (entry.userText.length < prefixLength) return false
  return prefixes.has(entry.userText.slice(0, prefixLength))
}

/**
 * 孤儿摘要清理：某个 scope 一条 entry 都不剩时，它的 dailySummary 一并删除。
 *
 * `dailySummaries` 是按 `(scope, date)` 聚合的**文本**，里面没有归属人字段，
 * 所以"按人精确删摘要"结构上做不到；能确定的只有这一条：
 * **域里已经没有条目了，摘要留着就是一条无源可溯的幽灵**（§2.10）。
 * 调用方：三个 eraseBy* 方法，都在 entries 过滤完之后调用。
 */
function dropOrphanSummaries(data: RelationshipLogData): {
  kept: RelationshipDailySummary[]
  removed: number
} {
  const scopesWithEntries = new Set<string | undefined>(
    data.entries.map((entry) => entry.scope ?? undefined),
  );
  const kept = data.dailySummaries.filter((s) => scopesWithEntries.has(s.scope ?? undefined));
  return { kept, removed: data.dailySummaries.length - kept.length };
}

export class RelationshipLogStore {
  constructor(private readonly filePath = defaultFilePath()) {}

  async recordTurn(input: RelationshipTurnInput): Promise<RelationshipLogEntry | null> {
    const userText = input.userText.trim()
    const assistantText = input.assistantText.trim()
    if (!userText && !assistantText) return null

    const now = Date.now()
    const userMood = detectUserMood(userText)
    const cue = deriveSignal(userText, userMood)
    const entry: RelationshipLogEntry = {
      ...input,
      userText: compact(userText, 500),
      assistantText: compact(assistantText, 500),
      id: `rel-${now}-${Math.random().toString(36).slice(2, 8)}`,
      date: localDate(now),
      createdAt: now,
      userMood,
      relationshipSignal: cue.relationshipSignal,
      importantMoment: cue.importantMoment,
      nextCareCue: cue.nextCareCue,
    }

    const data = readData(this.filePath)
    data.entries.push(entry)
    data.entries = data.entries.slice(-MAX_ENTRIES)

    // 摘要按 (scope, date) 分桶：旧实现每天全局只有一条（按 date 覆盖写、按 date 查），
    // 于是"桌面当天最后一条摘要"会经 buildContext 注入进群聊，桌面私密话题就这样串进群里。
    const entriesForBucket = data.entries.filter((item) => (
      item.date === entry.date && (item.scope ?? undefined) === (entry.scope ?? undefined)
    ))
    const summary = summarizeDate(entry.date, entry.scope, entriesForBucket)
    data.dailySummaries = [
      ...data.dailySummaries.filter((item) => !(
        item.date === entry.date && (item.scope ?? undefined) === (entry.scope ?? undefined)
      )),
      summary,
    ].slice(-MAX_DAILY_SUMMARIES)

    writeData(this.filePath, data)
    return entry
  }

  /**
   * 构建【近期关系线索】注入块。
   *
   * scopeId 提供时只统计该域的记录与摘要：群里不该看到你和昔涟的私人关系线。
   * 未提供时保持旧行为（全量），供管理面板与旧测试使用。
   */
  async buildContext(scopeId?: string): Promise<string> {
    const data = readData(this.filePath)
    const scoped = scopeId === undefined
      ? data.entries
      : data.entries.filter((e) => e.scope === scopeId)
    const recent = scoped.slice(-8)
    if (recent.length === 0) return ""

    const lastMood = [...recent].reverse().find((e) => e.userMood !== "未知")?.userMood ?? "平稳"
    const latestDate = recent.at(-1)?.date
    const latestSummary = latestDate === undefined
      ? undefined
      : scopeId === undefined
        // 全量模式（管理面板）：优先取最近一条 legacy 摘要，保持升级前的行为
        ? (data.dailySummaries.filter((s) => s.date === latestDate && s.scope === undefined).at(-1)
            ?? data.dailySummaries.at(-1))?.summary
        : findDailySummary(data, latestDate, scopeId)?.summary
    const preference = [...recent].reverse().find((e) => e.importantMoment)?.importantMoment
    const cues = [...new Set(recent.map((e) => e.nextCareCue).filter(Boolean))].slice(-3)

    const lines = [
      "【近期关系线索】",
      `- 用户最近状态：${lastMood}`,
    ]
    if (latestSummary) lines.push(`- 最近日记摘要：${latestSummary}`)
    if (preference) lines.push(`- 重要互动偏好：${preference}`)
    if (cues.length > 0) lines.push(`- 下次回应提示：${cues.join("；")}`)
    return lines.join("\n")
  }

  /**
   * 只读快照（P3 预演用）：返回**深拷贝**，调用方不得修改。
   *
   * 预演必须在**不改动任何文件**的前提下算出报告（§2.13），所以不能把内部对象直接交出去；
   * entries / dailySummaries 的字段全是原始值，逐条展开即真正的深拷贝。
   * `readData` 每次调用都重新读盘，快照不会与后续写入共享引用。
   */
  async readAll(): Promise<{
    entries: RelationshipLogEntry[]
    dailySummaries: RelationshipDailySummary[]
  }> {
    const data = readData(this.filePath)
    return {
      entries: data.entries.map((entry) => ({ ...entry })),
      dailySummaries: data.dailySummaries.map((summary) => ({ ...summary })),
    }
  }

  /**
   * 按 personKey 删除关系条目（P3 擦除某人，新数据路径）。
   *
   * 关系日志是唯一每轮都进主聊天的载体，留着他的条目等于每轮都在提醒昔涟"有这么个人"。
   * 删完 entries 之后再清**孤儿摘要**：某域一条 entry 都不剩时，它的 dailySummary 一并删
   * （摘要文本里没有归属人字段，这是唯一能确定性判定的情形）。
   * 没命中时不落盘、不改文件。
   */
  async eraseByPersonKey(personKey: string): Promise<{ entries: number; summaries: number }> {
    const data = readData(this.filePath)
    const before = data.entries.length
    data.entries = data.entries.filter((entry) => entry.personKey !== personKey)
    const entries = before - data.entries.length
    if (entries === 0) return { entries: 0, summaries: 0 }

    const orphans = dropOrphanSummaries(data)
    data.dailySummaries = orphans.kept
    writeData(this.filePath, data)
    return { entries, summaries: orphans.removed }
  }

  /**
   * 整域删除关系条目与摘要（P3 擦除某人，存量私聊/独立域的兜底）。
   *
   * 只适用于「这个域就是这个人」的域（`solo:<他的私聊会话>`）—— 群域里混着所有人的条目，
   * 按域删会连累别人，那种情形必须走 eraseByUserTextFingerprint 的原文指纹匹配。
   */
  async eraseByScope(scope: string): Promise<{ entries: number; summaries: number }> {
    const data = readData(this.filePath)
    const beforeEntries = data.entries.length
    data.entries = data.entries.filter((entry) => entry.scope !== scope)
    const entries = beforeEntries - data.entries.length

    const beforeSummaries = data.dailySummaries.length
    data.dailySummaries = data.dailySummaries.filter((s) => s.scope !== scope)
    const summaries = beforeSummaries - data.dailySummaries.length

    if (entries === 0 && summaries === 0) return { entries: 0, summaries: 0 }
    writeData(this.filePath, data)
    return { entries, summaries }
  }

  /**
   * 存量条目（没有 personKey）的**原文指纹**匹配（P3 §2.10 第 3 步）。
   *
   * 为什么可靠：`entry.userText` 就是那一轮触发者的消息正文，与步骤 ⑥ 被删掉的 transcript 行**同源**；
   * 取前 `prefixLength`(=24) 个字符比 prefix 足以避开"在群里说过同样短句"的碰撞，
   * 而长度不足 24 字的短句（"在吗"）本就携带不了身份信息 → 永不删，只计入 `unmatched`。
   *
   * 三条硬约束：
   *   ① 先把 `removedUserTexts` 折成 `Set` 再逐条比对（O(n+m)）—— 绝不在双重循环里 slice；
   *   ② 只在 `scopes` 限定的域里跑（全库扫会把别的群域里"别人说过同样短句"误伤）；
   *   ③ 带 `personKey` 的条目一律不动（那是新数据，走 eraseByPersonKey，指纹只服务存量）。
   *
   * `unmatched` = 限定域里"无 personKey 且没被匹配上"的条目数，进 UI 的疑似残留清单。
   */
  async eraseByUserTextFingerprint(
    scopes: readonly string[],
    removedUserTexts: readonly string[],
    prefixLength = LEGACY_MATCH_PREFIX_DEFAULT,
  ): Promise<{ entries: number; summaries: number; unmatched: number }> {
    const data = readData(this.filePath)
    const scopeSet = new Set(scopes)
    const prefixes = buildUserTextPrefixes(removedUserTexts, prefixLength)

    const before = data.entries.length
    let unmatched = 0
    data.entries = data.entries.filter((entry) => {
      // 只有"限定域里的存量条目"才参与：域外 / 有 personKey 的一律原样保留，也不计入 unmatched
      if (entry.scope === undefined || !scopeSet.has(entry.scope) || entry.personKey) return true
      if (matchesRemovedUserTextFingerprint(entry, scopeSet, prefixes, prefixLength)) return false
      unmatched++
      return true
    })
    const entries = before - data.entries.length
    if (entries === 0) return { entries: 0, summaries: 0, unmatched }

    const orphans = dropOrphanSummaries(data)
    data.dailySummaries = orphans.kept
    writeData(this.filePath, data)
    return { entries, summaries: orphans.removed, unmatched }
  }

  /**
   * 只读预演（P3 §2.13）：**在内存副本上按与三个 `eraseBy*` 完全相同的顺序与判据跑一遍**。
   *
   * 为什么不在这里另写一份计数逻辑：预演与执行各写一份判据迟早会漂移（§3.2）。
   * 之前 `previewPersonErase` 是手写循环数的，于是它**算不出 `summaries` 这一格**，
   * 而执行报告里有 —— 用户会看到"预演没有、报告有 1"（**D6**）。
   * 现在两边共用 `dropOrphanSummaries` 与 `matchesRemovedUserTextFingerprint`。
   *
   * 不读盘两次、不落盘、不改任何文件。
   */
  async previewErasePerson(input: {
    personKey: string
    /** 整域删的域（`solo:<他的私聊会话>`）—— 与执行侧 `eraseByScope` 的入参同源。 */
    soloScopes: readonly string[]
    /** 指纹匹配的域（他发过言的域）—— 与执行侧 `eraseByUserTextFingerprint` 的入参同源。 */
    fingerprintScopes: readonly string[]
    removedUserTexts: readonly string[]
    prefixLength?: number
  }): Promise<{
    byPersonKey: number
    byScope: number
    byTextFingerprint: number
    unmatched: number
    summaries: number
  }> {
    const prefixLength = input.prefixLength ?? LEGACY_MATCH_PREFIX_DEFAULT
    const data = readData(this.filePath)
    let summaries = 0

    // ① eraseByPersonKey
    const beforeKey = data.entries.length
    data.entries = data.entries.filter((entry) => entry.personKey !== input.personKey)
    const byPersonKey = beforeKey - data.entries.length
    if (byPersonKey > 0) {
      const orphans = dropOrphanSummaries(data)
      data.dailySummaries = orphans.kept
      summaries += orphans.removed
    }

    // ② eraseByScope（执行侧逐个 soloScope 调一次）
    let byScope = 0
    for (const scope of new Set(input.soloScopes)) {
      const before = data.entries.length
      data.entries = data.entries.filter((entry) => entry.scope !== scope)
      byScope += before - data.entries.length
      const beforeSummaries = data.dailySummaries.length
      data.dailySummaries = data.dailySummaries.filter((s) => s.scope !== scope)
      summaries += beforeSummaries - data.dailySummaries.length
    }

    // ③ eraseByUserTextFingerprint（执行侧只在"有域且有被删正文"时才跑）
    let byTextFingerprint = 0
    let unmatched = 0
    const scopeSet = new Set(input.fingerprintScopes)
    const prefixes = buildUserTextPrefixes(input.removedUserTexts, prefixLength)
    if (scopeSet.size > 0 && input.removedUserTexts.length > 0) {
      const before = data.entries.length
      data.entries = data.entries.filter((entry) => {
        if (entry.scope === undefined || !scopeSet.has(entry.scope) || entry.personKey) return true
        if (matchesRemovedUserTextFingerprint(entry, scopeSet, prefixes, prefixLength)) return false
        unmatched += 1
        return true
      })
      byTextFingerprint = before - data.entries.length
      if (byTextFingerprint > 0) {
        const orphans = dropOrphanSummaries(data)
        data.dailySummaries = orphans.kept
        summaries += orphans.removed
      }
    } else {
      // 与执行侧一致：没跑指纹匹配时，`unmatched` 按"限定域里无 personKey 的条目数"报（UI 的疑似残留口径）
      for (const entry of data.entries) {
        if (entry.scope === undefined || !scopeSet.has(entry.scope) || entry.personKey) continue
        unmatched += 1
      }
    }

    return { byPersonKey, byScope, byTextFingerprint, unmatched, summaries }
  }
}

let defaultStore: RelationshipLogStore | null = null

function getDefaultStore(): RelationshipLogStore {
  if (!defaultStore) defaultStore = new RelationshipLogStore()
  return defaultStore
}

export function recordRelationshipTurn(input: RelationshipTurnInput): Promise<RelationshipLogEntry | null> {
  return getDefaultStore().recordTurn(input)
}

export function buildRelationshipContext(scopeId?: string): Promise<string> {
  return getDefaultStore().buildContext(scopeId)
}
