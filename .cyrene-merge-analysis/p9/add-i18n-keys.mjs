// P9 T2/T3 一次性 i18n 键插入脚本（施工工具，不进提交）。
//
// 为什么用脚本而不是手改：Y5 要求 **zh-CN.json 与 en.json 的键集合必须一致**，
// 手改两份 30+ 键的嵌套 JSON 极易漏键。脚本用同一套键结构喂两个语言，
// 遇到"与已有键同名"的项直接 **复用既有键**（不重复添加，避免同名两处、改一处漏一处）。
//
// 保真要求：`Set-Content -Encoding UTF8` 在 PS 5.1 会写 BOM（X12）→ 这里用
// File 级写入 + UTF8Encoding(false)，并保留原文件的 2 空格缩进与 CRLF。

import { readFileSync, writeFileSync } from "node:fs";

const files = { "zh-CN": "src/renderer/react/i18n/zh-CN.json", en: "src/renderer/react/i18n/en.json" };

/** 与已有键重名 → 复用既有键，不重复添加。 */
const REUSE = {
  "settingsPage.memory.manager.cancel": "settingsPage.memory.cancel",
  "settingsPage.zones.cancel": "settingsPage.memory.cancel",
};

const MANAGER = {
  title: ["记忆管理台", "Memory Manager"],
  description: [
    "按人 / 按域 / 按会话查看具体记忆条目，可查询、可删除；「彻底擦除某个人」只在详情里出现。",
    "Browse memory entries by person, scope or session. Query and delete individual entries; per-person erasure only appears inside a person's detail view.",
  ],
  view: { people: ["按人", "By person"], zones: ["按域", "By scope"], sessions: ["按会话", "By session"] },
  refresh: ["刷新", "Refresh"],
  filterPlaceholder: ["筛选昵称 / 账号 / 会话", "Filter by name / account / session"],
  selectItem: ["选择该条目", "Select this entry"],
  selectMemory: ["选择这条记忆", "Select this memory"],
  openDetail: ["查看详情", "View details"],
  closeDetail: ["返回列表", "Back to list"],
  trace: ["溯源", "Trace"],
  traceEmpty: ["没有找到溯源记录。", "No source records found."],
  traceMissing: ["这条记忆已不存在（可能已被删除）。", "This memory no longer exists (it may have been deleted)."],
  traceFailed: ["溯源失败：{{error}}", "Trace failed: {{error}}"],
  empty: ["暂无记忆条目。", "No memory entries yet."],
  noMatch: ["没有匹配的条目。", "No matching entries."],
  loadFailed: ["记忆管理台加载失败：{{error}}", "Failed to load the memory manager: {{error}}"],
  actionFailed: ["操作失败：{{error}}", "Operation failed: {{error}}"],
  itemPeopleCounts: [
    "他说 {{own}} 条 · 别人提到他 {{mentioned}} 条 · 共 {{total}} 条 · {{sessions}} 个会话",
    "{{own}} said by them · {{mentioned}} mentioning them · {{total}} total · {{sessions}} sessions",
  ],
  itemContainerCounts: ["共 {{total}} 条 · {{sessions}} 个会话", "{{total}} total · {{sessions}} sessions"],
  detailSummary: ["共 {{total}} 条记忆，涉及 {{sessions}} 个会话。", "{{total}} memories across {{sessions}} sessions."],
  groupOwn: ["他的记忆", "Their memories"],
  groupOwnHint: [
    "他自己说过的，以及他的私聊内容。「彻底擦除」删除的就是这一组。",
    "What they said themselves plus their private-chat content. This is the group that full erasure removes.",
  ],
  groupMentioned: ["别人提到他", "Mentioning them"],
  groupMentionedHint: [
    "别人话里提到他的片段。默认保留；删掉等于删别人的经历片段。",
    "Fragments where others mention them. Kept by default; deleting removes part of other people's experience.",
  ],
  groupCount: ["{{count}} 条", "{{count}} entries"],
  groupSelected: ["已选 {{count}}", "{{count}} selected"],
  memorySummary: ["摘要（含 {{count}} 条子记忆）", "summary ({{count}} sub-entries)"],
  memoryStatus: ["状态：{{status}}", "status: {{status}}"],
  groupAll: ["全部记忆", "All memories"],
  groupAllHint: ["该容器下的全部记忆条目。", "Every memory entry in this container."],
  groupEmpty: ["这一组没有条目。", "No entries in this group."],
  unknownSource: ["来源未知", "unknown source"],
  mentionedUnknownSpeaker: ["未知发言人", "unknown speaker"],
  memoryAt: ["来自 {{source}}", "from {{source}}"],
  deleteSelected: ["删除选中（{{count}}）", "Delete selected ({{count}})"],
  deleteDetailSelected: ["删除选中记忆（{{count}}）", "Delete selected memories ({{count}})"],
  deleteConfirmTitle: ["删除选中的容器", "Delete selected containers"],
  deleteConfirmMessage: [
    "将删除 {{count}} 个容器下的全部记忆（含向量副本与关联证据），此操作不可撤销。",
    "This deletes every memory under {{count}} containers (including vector copies and linked evidence). It cannot be undone.",
  ],
  deleteConfirmButton: ["删除", "Delete"],
  deleteDone: ["已删除 {{removed}} 条记忆。", "Deleted {{removed}} memories."],
  deleteFailed: ["删除失败：{{error}}", "Delete failed: {{error}}"],
  deletePartialFailed: [
    "部分容器删除失败：{{failed}} 个失败，已删除 {{removed}} 条。",
    "Some containers failed: {{failed}} failed, {{removed}} memories deleted.",
  ],
  mentionedDeleteTitle: ["其中包含「别人提到他」的记忆", "This includes memories where others mention them"],
  mentionedDeleteMessage: [
    '选中的 {{count}} 条属于「别人提到他」（发言人：{{speakers}}）。删掉它们等于删掉别人的经历片段。确定继续？',
    '{{count}} of the selected memories are in the "mentioning them" group (speakers: {{speakers}}). Deleting them removes part of other people\'s experience. Continue?',
  ],
  mentionedDeleteConfirm: ["仍然删除", "Delete anyway"],
  eraseButton: ["彻底擦除这个人", "Erase this person completely"],
  eraseOnlyInDetail: [
    "「彻底擦除」只在详情里出现，列表行永远没有它（防误点）。",
    '"Erase completely" only appears in the detail view, never on a list row (to prevent misclicks).',
  ],
  erase: {
    confirmPhrase: ["彻底擦除", "ERASE COMPLETELY"],
    previewTitle: ["擦除预演 · {{name}}", "Erasure preview · {{name}}"],
    previewContinue: ["继续", "Continue"],
    previewFailedTitle: ["预演失败：{{error}}", "Preview failed: {{error}}"],
    confirmTitle: ["二次确认", "Confirm again"],
    confirmMessage: [
      "将彻底擦除「{{name}}」。请手动输入确认短语「{{phrase}}」后按钮才可点。",
      'This erases "{{name}}" completely. Type the confirmation phrase "{{phrase}}" to enable the button.',
    ],
    confirmButton: ["执行擦除", "Erase"],
    noRestartNote: [
      "擦除不需要重启：缓存会在原地失效（与「删除全部记忆」不同）。",
      "Erasure needs no restart: caches are invalidated in place (unlike deleting all memories).",
    ],
    willDelete: ["将删除 {{count}} 条（他说的 / 他的私聊）", "Will delete {{count}} entries (said by them / their private chats)"],
    willDeleteBreakdown: [
      "其中：他说 {{speaker}} 条 · 私聊 {{private}} 条 · 摘要 {{summaries}} 条（需要解压 {{decompressed}} 条）",
      "Breakdown: {{speaker}} said · {{private}} private · {{summaries}} summaries ({{decompressed}} need decompression)",
    ],
    keptMentioned: ["保留 {{count}} 条：别人提到他", "Keeping {{count}} entries: others mentioning them"],
    corpusUntouched: ["群聊语料未做任何改动。", "Group-chat corpus is left completely untouched."],
    preservedLead: ["有意不擦除的载体：", "Intentionally preserved:"],
    sessionsTitle: ["涉及的会话（{{count}} 个）", "Affected sessions ({{count}})"],
    sessionLine: [
      "{{sessionId}} · {{kind}} · L2 {{l2}} 条 · 热档 {{hot}} 行 · 归档 {{archive}} 行 · 其中她复述他 {{assistant}} 行",
      "{{sessionId}} · {{kind}} · {{l2}} L2 · {{hot}} hot lines · {{archive}} archived lines · {{assistant}} lines of her restating them",
    ],
    peripheralTitle: ["外围载体", "Peripheral carriers"],
    peripheralLine: [
      "向量副本 {{vectors}} 条 · 对话向量副本 {{chatVectors}} 条 · 证据 {{evidence}} 条 · DMAE 状态 {{dmae}} 条 · 冲突日志 {{conflicts}} 条 · 回顾日志 {{reflections}} 条",
      "{{vectors}} vector copies · {{chatVectors}} chat vector copies · {{evidence}} evidence · {{dmae}} DMAE states · {{conflicts}} conflict logs · {{reflections}} reflection logs",
    ],
    backupsLine: [
      "记忆备份将被整份销毁：{{files}} 个文件（{{size}}）",
      "Memory backups will be destroyed entirely: {{files}} files ({{size}})",
    ],
    apiLogLine: [
      "调试日志将被整份销毁（含完整 prompt 正文）：{{size}}",
      "Debug log will be destroyed entirely (includes full prompt text): {{size}}",
    ],
    apiLogAbsent: ["调试日志不存在，无需销毁。", "No debug log present; nothing to destroy."],
    residuesTitle: ["疑似残留（{{count}} 处）", "Possible residues ({{count}})"],
    reportTitle: ["擦除报告", "Erasure report"],
    reportComplete: ["擦除完成。", "Erasure complete."],
    reportPartial: [
      "部分完成：{{count}} 个步骤失败，可再次执行擦除以收敛。",
      "Partially complete: {{count}} steps failed; run the erasure again to converge.",
    ],
    reportFailedTitle: ["执行擦除失败：{{error}}", "Erasure failed: {{error}}"],
    reconfirmLimitReached: [
      "预演之后又新增了 {{count}} 条。已达重新预演次数上限，请稍后重新发起擦除。",
      "{{count}} new entries appeared after the preview. The re-preview limit was reached; start the erasure again later.",
    ],
    needsReconfirm: [
      "预演之后又新增了 {{count}} 条关于他的记忆，需要重新预演（最多 {{max}} 轮）。",
      "{{count}} new memories about them appeared after the preview; re-previewing (up to {{max}} rounds).",
    ],
  },
};

const DANGER = {
  title: ["危险操作", "Danger zone"],
  description: [
    "删除全部记忆与群聊上下文条数。删除动作不可撤销，逐条擦除请用上面的记忆管理台。",
    "Delete all memories and configure group context size. Deletion cannot be undone; for per-person erasure use the memory manager above.",
  ],
  loadFailed: ["读取通用设置失败，请重试。", "Failed to load general settings; please retry."],
  limitTitle: ["群聊近期上下文条数", "Recent group-chat context size"],
  limitDescription: [
    "群聊里每次带给她多少条近期消息作为上下文（{{min}}–{{max}}，默认 {{default}}）。",
    "How many recent group-chat messages are given to her as context ({{min}}–{{max}}, default {{default}}).",
  ],
  limitSaved: ["群聊近期上下文条数已保存。", "Recent group context size saved."],
  limitSaveFailed: ["保存失败：{{error}}", "Save failed: {{error}}"],
  deleteAllTitle: ["删除全部记忆", "Delete all memories"],
  deleteAllDescription: [
    "删除画像、事件片段、向量库、关系日志、实体图谱、朋友圈与渠道聊天记录。",
    "Deletes profiles, event fragments, the vector store, relationship logs, the entity graph, moments and channel chat history.",
  ],
  deleteAllButton: ["删除全部记忆", "Delete all memories"],
  confirmPhrase: ["删除全部记忆", "DELETE ALL MEMORIES"],
  confirmTitle: ["确认删除全部记忆", "Confirm deleting all memories"],
  confirmMessage: [
    "这会清空她对你和所有渠道联系人的全部记忆。请手动输入确认短语「{{phrase}}」后按钮才可点。",
    'This clears every memory she has about you and all channel contacts. Type the confirmation phrase "{{phrase}}" to enable the button.',
  ],
  confirmButton: ["删除全部记忆", "Delete all memories"],
  restartHint: [
    "删除后必须重启应用：进程内还有三处缓存，不重启会把旧数据写回磁盘。",
    "The app must restart afterwards: three in-process caches remain and would write the old data back to disk.",
  ],
  restartRequired: ["删除成功，必须重启应用", "Deleted successfully — the app must restart"],
  restartDescription: [
    "进程内还有记忆库 / 实体图谱 / 向量库三处缓存，不重启会把旧数据写回磁盘。",
    "The in-process memory store, entity graph and vector store still hold caches; without a restart they write the old data back to disk.",
  ],
  restartNow: ["立即重启", "Restart now"],
  deleteDone: ["已删除全部记忆（{{count}} 项）。", "All memories deleted ({{count}} items)."],
  deleteFailed: ["删除失败：{{error}}", "Delete failed: {{error}}"],
  deletePartial: ["部分文件未能删除：\n{{paths}}", "Some files could not be deleted:\n{{paths}}"],
};

const ZONES = {
  title: ["区块", "Zones"],
  description: [
    "区块 = 记忆域。同一区块里的会话共享长期记忆，区块之间互相隔离；加入区块同时等于加入该渠道的白名单。",
    "A zone is a memory domain. Sessions in the same zone share long-term memory and stay isolated from other zones; joining a zone also whitelists that chat on its channel.",
  ],
  listTitle: ["记忆区块", "Memory zones"],
  listDescription: [
    "root 区块自动包含全部桌面对话，不可删除、不可改名。",
    "The root zone automatically contains every desktop conversation; it cannot be deleted or renamed.",
  ],
  rootName: ["desktop（root）", "desktop (root)"],
  rootHint: [
    "root 区块自动包含全部桌面对话（只读展示，不可移出）。",
    "The root zone automatically contains every desktop conversation (read-only, cannot be removed).",
  ],
  create: ["新建区块", "New zone"],
  createTitle: ["新建区块", "Create zone"],
  namePlaceholder: ["区块名称", "Zone name"],
  rename: ["改名", "Rename"],
  renameTitle: ["重命名区块", "Rename zone"],
  delete: ["删除", "Delete"],
  deleteTitle: ["删除区块", "Delete zone"],
  deleteMessage: [
    "将删除区块「{{name}}」。区块内的外部会话会回到独立域（各自隔离），桌面对话不受影响。",
    'This deletes the zone "{{name}}". Its external sessions fall back to standalone isolation; desktop conversations are unaffected.',
  ],
  created: ["区块已创建。", "Zone created."],
  renamed: ["区块已改名。", "Zone renamed."],
  deleted: ["区块已删除。", "Zone deleted."],
  empty: ["暂无区块。", "No zones yet."],
  noMembers: ["这个区块还没有外部会话成员。", "This zone has no external session members yet."],
  memberCount: ["{{count}} 个成员", "{{count}} members"],
  selectedCount: ["已选 {{count}} 个成员", "{{count}} members selected"],
  selectMember: ["选择该成员", "Select this member"],
  addMember: ["添加成员", "Add member"],
  removeMember: ["移出", "Remove"],
  memberAdded: ["成员已加入区块。", "Member added to the zone."],
  memberRemoved: ["成员已移出区块。", "Member removed from the zone."],
  moved: ["已移动 {{moved}} 个成员。", "Moved {{moved}} members."],
  movePartial: ["移动 {{moved}} 个，部分失败：{{errors}}", "Moved {{moved}}; some failed: {{errors}}"],
  moveTo: ['移动到「{{name}}」', 'Move to "{{name}}"'],
  badgeDesktop: ["桌面", "Desktop"],
  badgeGroup: ["群聊", "Group"],
  badgePrivate: ["私聊", "Private"],
  untitledConversation: ["未命名会话", "Untitled conversation"],
  privateMappingNone: ["root 未绑定私聊（可绑定 1 个）。", "Root has no bound private chat (it can bind one)."],
  privateMapping: ["root 已绑定的私聊：{{name}}。", "Private chat bound to root: {{name}}."],
  observeTitle: ["群消息旁听", "Observe group messages"],
  observeDescription: [
    "区块内未被 @ 的消息也写入上下文，供她理解群里的对话。",
    "Messages not addressed to her are still written to context so she can follow the conversation.",
  ],
  injectTitle: ["注入主人画像", "Inject owner profile"],
  injectDescription: [
    "在本区块注入你的 L0/L1 画像。群聊默认关闭（隐私）；root 恒为开。",
    "Inject your L0/L1 profile into this zone. Off by default in groups (privacy); always on for root.",
  ],
  loadFailed: ["区块加载失败：{{error}}", "Failed to load zones: {{error}}"],
  actionFailed: ["操作失败：{{error}}", "Operation failed: {{error}}"],
  refresh: ["刷新", "Refresh"],
  pickerTitle: ['添加成员到「{{name}}」', 'Add members to "{{name}}"'],
  pickerDescription: [
    "只列出已经产生过对话的外部会话。桌面对话自动属于 root，不在此列；已在别的区块的会标注来源，加入后自动从原区块移出。",
    "Only external sessions that already have conversations are listed. Desktop conversations belong to root automatically. Entries already in another zone are labelled and will be moved out of it.",
  ],
  pickerEmpty: [
    "还没有任何外部会话产生过对话。新群请用「手动按群号加白」。",
    'No external session has any conversation yet. For a new group use "Add group manually".',
  ],
  manualGroup: {
    button: ["手动按群号加白", "Add group manually"],
    title: ['手动加群到「{{name}}」', 'Manually add a group to "{{name}}"'],
    description: [
      "给一个还没产生过会话的群加白 —— 这是新群目前唯一能加白的入口。",
      "Whitelist a group that has no conversation yet — currently the only way to whitelist a new group.",
    ],
    placeholderQq: ["群号（5–12 位数字）", "Group number (5–12 digits)"],
    placeholderQqbot: ["group_openid（6–64 位字母数字）", "group_openid (6–64 alphanumerics)"],
    namePlaceholder: ["群名备注（可选）", "Group name note (optional)"],
    hint: [
      "QQ 机器人只认 group_openid，填 QQ 群号不会被接受；微信 / 飞书没有群白名单概念，因此不在此列出。",
      "The QQ bot only accepts group_openid, not a QQ group number. WeChat / Feishu have no group whitelist concept, so they are not listed.",
    ],
    confirm: ["加白", "Whitelist"],
    added: ["已加入区块白名单。", "Added to the zone whitelist."],
    addedMoved: [
      "已加入区块白名单（它原本在「{{name}}」，已自动移出）。",
      'Added to the zone whitelist (it was in "{{name}}" and has been moved out).',
    ],
    errorEmpty: ["请先填写群标识。", "Please enter a group identifier."],
    errorFormat: [
      "群标识格式不对（QQ 填 5–12 位群号；QQ 机器人填 group_openid）。",
      "Invalid group identifier (QQ wants a 5–12 digit group number; the QQ bot wants a group_openid).",
    ],
  },
};

const LOCALE_INDEX = { "zh-CN": 0, en: 1 };

/** 把 [zh, en] 结构按语言摊平成普通对象。 */
function localize(node, index) {
  if (Array.isArray(node)) return node[index];
  const out = {};
  for (const [key, value] of Object.entries(node)) out[key] = localize(value, index);
  return out;
}

/** 只补缺失键；已存在则记入 reused（表示复用既有键）。 */
function mergeMissing(target, source, path, reused) {
  for (const [key, value] of Object.entries(source)) {
    const here = `${path}.${key}`;
    if (value && typeof value === "object") {
      if (!target[key] || typeof target[key] !== "object") target[key] = {};
      mergeMissing(target[key], value, here, reused);
    } else if (key in target) {
      reused.push(here);
    } else {
      target[key] = value;
    }
  }
}

for (const [locale, file] of Object.entries(files)) {
  const index = LOCALE_INDEX[locale];
  const raw = readFileSync(file, "utf8");
  const hadBom = raw.charCodeAt(0) === 0xfeff;
  const json = JSON.parse(hadBom ? raw.slice(1) : raw);
  const eol = raw.includes("\r\n") ? "\r\n" : "\n";
  const reused = [];

  const memory = json.settingsPage.memory;
  mergeMissing(memory, {
    manager: localize(MANAGER, index),
    danger: localize(DANGER, index),
  }, "settingsPage.memory", reused);
  mergeMissing(json.settingsPage, { zones: localize(ZONES, index) }, "settingsPage", reused);

  const serialized = JSON.stringify(json, null, 2);
  // 原件：无 BOM、CRLF、2 空格缩进、**末尾带一个换行** → 逐项对齐，避免整文件 diff 噪音
  const withEol = eol === "\r\n" ? serialized.replace(/\n/g, "\r\n") : serialized;
  writeFileSync(file, `${withEol}${eol}`, { encoding: "utf8" });

  console.log(`${locale}: BOM=${hadBom} EOL=${JSON.stringify(eol)} 复用既有键=${reused.length}`);
  for (const key of reused) console.log(`   复用: ${key} → ${REUSE[key] ?? "(未登记)"}`);
}
