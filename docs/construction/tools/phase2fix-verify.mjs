#!/usr/bin/env node
/**
 * Phase 2 缺陷 #1/#2 修复 —— 机测检测器（只读）
 *
 *   node docs/construction/tools/phase2fix-verify.mjs rlog         [n]
 *   node docs/construction/tools/phase2fix-verify.mjs buckets
 *   node docs/construction/tools/phase2fix-verify.mjs speaker      [n]
 *   node docs/construction/tools/phase2fix-verify.mjs ctx  [convSubstr] [n]
 *   node docs/construction/tools/phase2fix-verify.mjs runs [n]
 *   node docs/construction/tools/phase2fix-verify.mjs zones
 *   node docs/construction/tools/phase2fix-verify.mjs memory
 */
import fs from "node:fs"
import path from "node:path"
import os from "node:os"

const UD = path.join(process.env.APPDATA, "live2d-cyrene")
const cmd = process.argv[2]
const arg1 = process.argv[3]
const arg2 = process.argv[4]

const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null)
const readJson = (p) => { const t = read(p); if (!t) return null; try { return JSON.parse(t) } catch { return null } }
const stamp = (p) => { const s = fs.statSync(p); return `${s.size}B ${s.mtime.toISOString().slice(0, 19).replace("T", " ")}` }
const scopeOf = (s) => (s ? s : "<legacy:no-scope>")
const cut = (s, n) => { s = String(s ?? "").replace(/\s+/g, " "); return s.length > n ? s.slice(0, n) + "…" : s }
const pad = (s, n) => { s = String(s ?? ""); return s.length >= n ? s : s + " ".repeat(n - s.length) }
const runFiles = () => {
  const dir = path.join(UD, "cyrene-runs", "sessions")
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir).filter((f) => f.startsWith("run-") && f.endsWith(".json") && !f.endsWith(".events.jsonl"))
    .map((f) => path.join(dir, f))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
}
const ctxOf = (rec) => {
  const msgs = rec.messages || []
  const hits = msgs.filter((m) => m.role === "user" && m.visibility === "internal" && /运行环境（机器实际状态/.test(String(m.content)))
  return hits.length ? String(hits[hits.length - 1].content) : null
}

function showRlog() {
  const p = path.join(UD, "relationship-log.json")
  const d = readJson(p)
  if (!d) return console.log("relationship-log.json 不存在")
  console.log(`PATH : ${p}\nSIZE : ${stamp(p)}\n`)
  console.log("=== entries（最近 25 条）===")
  console.log(`  ${pad("date", 12)} ${pad("mood", 8)} ${pad("scope", 40)} userText`)
  for (const e of (d.entries || []).slice(-25)) {
    console.log(`  ${pad(e.date, 12)} ${pad(e.userMood, 8)} ${pad(scopeOf(e.scope), 40)} ${cut(e.userText, 52)}`)
  }
  console.log("\n=== dailySummaries（按 (scope,date) 分桶）===")
  console.log(`  ${pad("date", 12)} ${pad("scope", 40)} nextCareCue`)
  for (const s of d.dailySummaries || []) {
    console.log(`  ${pad(s.date, 12)} ${pad(scopeOf(s.scope), 40)} ${cut(s.nextCareCue, 66)}`)
  }
  console.log("\n=== 桶唯一性（重复 = 缺陷 #1 复发）===")
  const key = {}
  for (const s of d.dailySummaries || []) {
    const k = `${scopeOf(s.scope)}|${s.date}`
    key[k] = (key[k] || 0) + 1
  }
  const dup = Object.entries(key).filter(([, v]) => v > 1)
  console.log(dup.length ? dup.map(([k, v]) => `  ✘ ${k} ×${v}`).join("\n") : "  ✔ 每个 (scope,date) 只有一条")
  console.log("\n=== 正文前缀残留（带 [群聊发送者：…] 的条目）===")
  const dirty = (d.entries || []).filter((e) => String(e.userText).includes("群聊发送者："))
  console.log(dirty.length ? dirty.map((e) => `  ✘ [${e.date}] ${scopeOf(e.scope)} :: ${cut(e.userText, 90)}`).join("\n") : "  ✔ 0 条")
}

function showBuckets() {
  const d = readJson(path.join(UD, "relationship-log.json"))
  if (!d) return console.log("relationship-log.json 不存在")
  const dates = [...new Set((d.entries || []).map((e) => e.date))]
  const scopes = [...new Set((d.entries || []).map((e) => e.scope).filter(Boolean))]
  for (const date of dates) {
    console.log(`\n===== date=${date} =====`)
    const sameDay = (d.dailySummaries || []).filter((s) => s.date === date)
    if (!sameDay.length) console.log("  （当天没有摘要）")
    for (const s of sameDay) console.log(`  桶 scope=${pad(scopeOf(s.scope), 40)} cue=${cut(s.nextCareCue, 70)}`)
    console.log("  --- 各域实际读到哪条（复刻 findDailySummary）---")
    for (const sc of scopes) {
      const exact = sameDay.find((s) => s.scope === sc)
      if (exact) { console.log(`    ${pad(sc, 40)} -> 本域摘要: ${cut(exact.nextCareCue, 70)}`); continue }
      const hasScoped = sameDay.some((s) => typeof s.scope === "string")
      if (hasScoped) console.log(`    ${pad(sc, 40)} -> (本域当天无摘要，legacy 回退已封堵 → 不注入)`)
      else console.log(`    ${pad(sc, 40)} -> legacy 兜底: ${cut(sameDay[0]?.nextCareCue, 70)}`)
    }
  }
}

function showSpeaker() {
  const n = Number(arg1 || 40)
  const dirs = ["channels/history", "channels/archive"].map((d) => path.join(UD, d))
  let found = false
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) { console.log(`[${dir}] 目录不存在`); continue }
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl"))
      .map((f) => path.join(dir, f)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs).slice(0, n)
    for (const f of files) {
      found = true
      console.log(`\n--- ${path.basename(f)}  (${stamp(f)}) ---`)
      const lines = read(f).split(/\r?\n/).filter(Boolean)
      for (const line of lines) {
        let e; try { e = JSON.parse(line) } catch { console.log(`    (解析失败) ${cut(line, 120)}`); continue }
        const c = String(e.content ?? "")
        const flags = []
        if (c.includes("群聊发送者：")) flags.push("含未剥离前缀")
        if (/^[^\n\[]{0,40}\)\]/.test(c) || /\w\s\(\d+\)\]/.test(c)) flags.push("⚠疑似残片")
        console.log(`    [${e.role}] spk=${e.speakerName ?? "-"} id=${e.speakerId ?? "-"} ${flags.join(" ")}`)
        console.log(`        ${cut(c, 150)}`)
      }
      console.log(`    (共 ${lines.length} 条)`)
    }
  }
  if (!found) console.log("channels/history 与 channels/archive 都没有 jsonl 文件")
}

function showCtx() {
  const conv = arg1 && !/^\d+$/.test(arg1) ? arg1 : ""
  const n = Number((conv ? arg2 : arg1) || 4)
  let files = runFiles()
  if (conv) files = files.filter((f) => (read(f) || "").includes(conv))
  for (const f of files.slice(0, n)) {
    const rec = readJson(f)
    const ctx = ctxOf(rec)
    console.log(`\n################ ${path.basename(f, ".json")}  ${fs.statSync(f).mtime.toISOString().slice(0, 19).replace("T", " ")}  conv=${rec?.conversationId} ################`)
    if (!ctx) { console.log("  (无 always-on 上下文)"); continue }
    const lines = ctx.split("\n")
    let cap = false
    for (const l of lines) {
      if (/【群聊近期上下文】|【近期关系线索】|【相关记忆】|\[用户画像\]|\[近期状态\]|【常驻背景】/.test(l)) cap = true
      if (cap) console.log(l)
      if (cap && /^---\s*$/.test(l)) cap = false
    }
  }
}

function showRuns() {
  const n = Number(arg1 || 20)
  console.log(`  ${pad("run", 28)} ${pad("mtime", 20)} ${pad("conversation", 34)} ${pad("ctxLen", 7)} tools`)
  for (const f of runFiles().slice(0, n)) {
    const rec = readJson(f)
    const ctx = ctxOf(rec)
    const tools = [...new Set((rec.toolCalls || []).map((t) => t.name))].join(",")
    console.log(`  ${pad(path.basename(f, ".json"), 28)} ${pad(fs.statSync(f).mtime.toISOString().slice(0, 19).replace("T", " "), 20)} ${pad(rec?.conversationId, 34)} ${pad(ctx ? ctx.length : 0, 7)} ${cut(tools, 46)}`)
  }
}

function showZones() {
  const z = readJson(path.join(UD, "zones.json"))
  if (!z) return console.log("zones.json 不存在")
  console.log(`zones.json ${stamp(path.join(UD, "zones.json"))}`)
  for (const zone of z.zones || []) {
    console.log(`\n[区块] ${zone.zoneName}  id=${zone.zoneId}  root=${zone.isRoot}  observe=${zone.config?.observeGroupMessages}  injectOwnerProfile=${zone.config?.injectOwnerProfile}`)
    for (const m of zone.members || []) {
      console.log(`    - ${pad(m.kind, 9)} chat=${pad(m.chatId, 14)} type=${pad(m.chatType, 8)} name=${m.senderName}  session=${m.sessionId}`)
    }
    if (!(zone.members || []).length) console.log("    (无成员)")
  }
  const cfg = readJson(path.join(UD, "channels-settings.json"))
  console.log(`\nQQ allowedGroupIds: ${JSON.stringify(cfg?.qq?.allowedGroupIds)}`)
}

function showMemory() {
  const p = path.join(UD, "memory.json")
  const m = readJson(p)
  if (!m) return console.log("memory.json 不存在（懒创建，正常）")
  console.log(`${stamp(p)}`)
  console.log(`schemaVersion=${m.schemaVersion}  l0.occupation='${m.l0?.occupation}'  l1.roundCount=${m.l1?.roundCount}  l2=${(m.l2 || []).length}  evidence=${(m.evidence || []).length}`)
  for (const e of m.l2 || []) console.log(`  L2 scope=${pad(e.scope, 40)} weight=${e.weight} status=${e.status} :: ${cut(e.content, 60)}`)
}

const table = { rlog: showRlog, buckets: showBuckets, speaker: showSpeaker, ctx: showCtx, runs: showRuns, zones: showZones, memory: showMemory }
if (!table[cmd]) { console.log(`用法: node phase2fix-verify.mjs <${Object.keys(table).join("|")}>`); process.exit(1) }
table[cmd]()
