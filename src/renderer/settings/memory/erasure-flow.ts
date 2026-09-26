// 设置-记忆面板「彻底擦除某个人」的三段式流程（P3 §3.20）。
//
//   ① 预演   erasePreview(personKey) → showHtmlModal(分类计数 + 保留清单 + 残留清单 + 警告)
//   ② 确认   showInputModal({ confirmValue: 确认短语 }) —— 严格相等才可点
//   ③ 执行   erasePerson(personKey, previewId) → showHtmlModal(报告：计数 + failed[] + 残留)
//   needsReconfirm → 说明「预演之后又出现了 N 条关于他的记忆」并回到 ①；最后刷新列表
//
// ⚠️ 三条与 delete-all.ts 的关键差异（别照抄那边的流程）：
// 1) **不弹重启**：擦除全程走内存缓存失效（§2.15 / §3.16），不需要重启；
// 2) 比那边多一段**预演**：用户在看清"会删什么、会留什么"之后才进入输入框；
// 3) 预演失败 / 用户取消 / 确认短语不严格相等（或 previewId 缺失）→ **绝不调用 erasePerson**。
//
// ⚠️ 预演与报告都必须把「将删除」与「保留」**分成两行**写出来（§2.13 / 验收 §5.2 第 4 步），
// 并且显式说明「群聊语料未做任何改动」与「备份 / 调试日志是整份销毁」——这三件事用户有权在
// 按下确认之前就知道。

import { memoryManagerEraseBtn } from "./dom";
import {
  bindManagerEvents, closeManagerDetail, loadMemoryManager, managerState, setManagerFeedback,
} from "./manager";
import { showHtmlModal, showInputModal } from "../shared/modal";
import { escapeHtml } from "../shared/format";
import { t } from "../i18n";
import type { PersonErasePlan, PersonEraseReport } from "../shared/types";

/** 确认短语的兜底值（i18n key 缺失时 t() 会返回 key 本身，见 i18n-runtime 的 parseMissingKeyHandler）。 */
const ERASE_CONFIRM_PHRASE_FALLBACK = "彻底擦除";
const ERASE_CONFIRM_PHRASE_KEY = "settings.panel.memory.manager.erase.confirmPhrase";

/** 「预演之后又出现了新记忆」最多允许回到预演的轮数（防止写入太频繁时无限循环）。 */
const MAX_ERASE_RECONFIRM_ROUNDS = 2;

/** 预演弹窗里最多列几条「保留：别人提到他」的样本（§2.13 建议 3 条）。 */
const ERASE_PLAN_SAMPLE_LIMIT = 3;

/** 预演弹窗里最多列几条疑似残留（全列会把弹窗撑爆，报告里也是清单性质）。 */
const ERASE_PLAN_RESIDUE_LIMIT = 10;

/** 预演弹窗里最多列几条「有意保留」的载体（O2：文案不许超出证据）。 */
const ERASE_PLAN_PRESERVED_LIMIT = 8;

/** 字节数 → 人类可读（备份与调试日志是"整份销毁"，必须让用户看见大小）。 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${unit === 0 ? value : value.toFixed(1)} ${units[unit]}`;
}

export function eraseConfirmPhrase(): string {
  const value = t(ERASE_CONFIRM_PHRASE_KEY);
  return typeof value === "string" && value.length > 0 && value !== ERASE_CONFIRM_PHRASE_KEY
    ? value
    : ERASE_CONFIRM_PHRASE_FALLBACK;
}

/** 严格相等（trim 不算数，避免"顺手粘贴带空格"也能过；与 delete-all 同一口径）。 */
export function isEraseConfirmed(input: string): boolean {
  return input === eraseConfirmPhrase();
}

/** 只有 "<channel>:<senderId>" 形态的 personKey 才允许彻底擦除（与主进程 parsePersonKey 同一判据）。 */
export function canErasePersonKey(personKey: string): boolean {
  return personKey.length > 0 && personKey !== "__unattributed__" && personKey.includes(":");
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function sessionKindLabel(kind: string): string {
  if (kind === "private") return t("settings.panel.memory.manager.erase.kindPrivate");
  if (kind === "group") return t("settings.panel.memory.manager.erase.kindGroup");
  return t("settings.panel.memory.manager.erase.kindUnknown");
}

function residueKindLabel(kind: string): string {
  const labels: Record<string, string> = {
    l0: t("settings.panel.memory.manager.erase.residueKind.l0"),
    l1: t("settings.panel.memory.manager.erase.residueKind.l1"),
    relationship: t("settings.panel.memory.manager.erase.residueKind.relationship"),
    desktop: t("settings.panel.memory.manager.erase.residueKind.desktop"),
    assistantText: t("settings.panel.memory.manager.erase.residueKind.assistantText"),
    devOrphan: t("settings.panel.memory.manager.erase.residueKind.devOrphan"),
    runArtefacts: t("settings.panel.memory.manager.erase.residueKind.runArtefacts"),
    entityDerived: t("settings.panel.memory.manager.erase.residueKind.entityDerived"),
  };
  return labels[kind] ?? kind;
}

function line(text: string, cls = ""): string {
  return `<p class="memory-erase__line${cls ? ` ${cls}` : ""}">${escapeHtml(text)}</p>`;
}

function sectionTitle(text: string): string {
  return `<h4 class="memory-erase__section">${escapeHtml(text)}</h4>`;
}

function bulletList(items: string[], cls: string): string {
  return `<ul class="${cls}">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

/**
 * 预演弹窗正文。
 *
 * 必须包含（§2.13 + 验收 §5.2 第 4 步）：
 * ① 一行「将删除 N 条（他说的 / 他的私聊）」；
 * ② **另一行**「保留 M 条：别人提到他」（附最多 3 条样本）；
 * ③ 一行「群聊语料未做任何改动」；
 * ④ 备份 / 调试日志的大小（整份销毁）。
 */
export function buildErasePlanBody(plan: PersonErasePlan): string {
  const name = plan.knownNames?.[0] || plan.personKey;
  const keptSamples = plan.l2?.keptSamples ?? [];
  const decompress = plan.summaries?.decompress ?? [];
  const remove = plan.summaries?.remove ?? [];
  const sessions = plan.sessions ?? [];
  const blocks: string[] = [];

  blocks.push(line(t("settings.panel.memory.manager.erase.planLead", { name, key: plan.personKey }), "memory-erase__lead"));

  // ① 将删除 —— 独立一行
  blocks.push(line(
    t("settings.panel.memory.manager.erase.willDelete", { count: plan.l2?.total ?? 0 }),
    "memory-erase__delete",
  ));
  blocks.push(line(t("settings.panel.memory.manager.erase.willDeleteBreakdown", {
    speaker: plan.l2?.byRule?.speaker ?? 0,
    private: plan.l2?.byRule?.private ?? 0,
    summaries: decompress.length + remove.length,
    decompressed: decompress.length,
  })));

  // ② 保留：别人提到他 —— 也必须是独立一行（用户要能一眼看出"会留什么"）
  const samples = keptSamples.slice(0, ERASE_PLAN_SAMPLE_LIMIT);
  blocks.push(line(
    t("settings.panel.memory.manager.erase.keptMentioned", { count: plan.l2?.keptSubjectOnly ?? 0 }),
    "memory-erase__kept",
  ));
  if (samples.length > 0) {
    blocks.push(bulletList(
      samples.map((sample) => t("settings.panel.memory.manager.erase.keptSample", { sample: sample.content })),
      "memory-erase__samples",
    ));
    if (keptSamples.length > samples.length) {
      blocks.push(line(t("settings.panel.memory.manager.erase.keptSampleMore", { count: keptSamples.length - samples.length })));
    }
  }

  // ③ 群聊语料一行（§0.4 约束 2：本阶段一个字节都不碰，但也必须说出来）
  blocks.push(line(t("settings.panel.memory.manager.erase.corpusUntouched"), "memory-erase__corpus"));

  // ③b **有意保留的全部载体**（O2）：文案不许超出证据 —— 原来只写「全部痕迹」，
  //     而设计上会保留桌面对话、运行评审/工具输出、访问控制配置与区块成员。清单由主进程给。
  {
    const preserved = plan.preservedPaths ?? [];
    if (preserved.length > 0) {
      blocks.push(sectionTitle(t("settings.panel.memory.manager.erase.preservedLead")));
      const shown = preserved.slice(0, ERASE_PLAN_PRESERVED_LIMIT);
      blocks.push(bulletList(shown.map((rel) => {
        const label = t(`settings.panel.memory.manager.erase.preservedLabel.${rel}`);
        // i18n 缺这条 key 时 t() 会原样回吐 key，此时退回路径本身
        return label.startsWith("settings.panel.") ? rel : label;
      }), "memory-erase__preserved"));
      if (preserved.length > shown.length) {
        blocks.push(line(t("settings.panel.memory.manager.erase.preservedMore", { count: preserved.length - shown.length })));
      }
    }
  }

  if (sessions.length > 0) {
    blocks.push(sectionTitle(t("settings.panel.memory.manager.erase.sessionsTitle", { count: sessions.length })));
    blocks.push(bulletList(sessions.map((session) => t("settings.panel.memory.manager.erase.sessionLine", {
      sessionId: session.sessionId,
      kind: sessionKindLabel(session.kind),
      l2: session.l2Count ?? 0,
      hot: session.hotLines ?? 0,
      archive: session.archiveLines ?? 0,
      months: session.archiveMonths ?? 0,
      // D5：她复述他的行（已计入 hot/archive）
      assistant: session.assistantLines ?? 0,
    })), "memory-erase__sessions"));
  }

  blocks.push(sectionTitle(t("settings.panel.memory.manager.erase.peripheralTitle")));
  blocks.push(line(t("settings.panel.memory.manager.erase.peripheralLine", {
    vectors: plan.vectors ?? 0,
    // D2：对话的向量副本（`chat_history_*`）—— 原来这里只有 user_memory，用户看不见这条通道
    chatVectors: plan.chatHistoryVectors ?? 0,
    evidence: plan.evidence ?? 0,
    dmae: plan.dmaeStates ?? 0,
    conflicts: plan.conflictLogs ?? 0,
    reflections: plan.reflectionLogs ?? 0,
  })));
  // 关系日志是唯一「每一轮都进主聊天」的载体，四档分开列（§2.10）
  blocks.push(line(t("settings.panel.memory.manager.erase.relationshipLine", {
    byPersonKey: plan.relationshipEntries?.byPersonKey ?? 0,
    byScope: plan.relationshipEntries?.byScope ?? 0,
    byTextFingerprint: plan.relationshipEntries?.byTextFingerprint ?? 0,
    unmatched: plan.relationshipEntries?.unmatched ?? 0,
    // D6：这一格执行报告里一直有、预演原来算不出来
    summaries: plan.relationshipEntries?.summaries ?? 0,
  })));
  blocks.push(line(t("settings.panel.memory.manager.erase.auditLine", {
    entries: plan.audit?.entries ?? 0,
    files: plan.audit?.files ?? 0,
    lines: plan.channelLogLines ?? 0,
    chats: plan.externalChats ?? 0,
    // D4：agent 运行记录（`cyrene-runs/sessions/*.json` 里是逐字对话正文）
    runs: plan.runs ?? 0,
  })));

  // ④ 整份销毁的两个载体：备份（回退能力）与调试日志（完整 prompt 正文）
  const backups = plan.memoryBackups ?? { files: 0, bytes: 0 };
  blocks.push(line(t("settings.panel.memory.manager.erase.backupsLine", {
    files: backups.files, size: formatBytes(backups.bytes),
  }), "memory-erase__destroy"));
  blocks.push(line(
    plan.apiLog?.exists
      ? t("settings.panel.memory.manager.erase.apiLogLine", { size: formatBytes(plan.apiLog.bytes) })
      : t("settings.panel.memory.manager.erase.apiLogAbsent"),
    "memory-erase__destroy",
  ));

  const entities = plan.entities ?? [];
  if (entities.length > 0) {
    blocks.push(sectionTitle(t("settings.panel.memory.manager.erase.entitiesTitle", { count: entities.length })));
    blocks.push(bulletList(entities.map((entity) => t("settings.panel.memory.manager.erase.entityLine", {
      name: entity.name,
      scope: entity.scope || t("settings.panel.memory.manager.erase.scopeUnknown"),
      relations: entity.relations ?? 0,
    })), "memory-erase__entities"));
  }

  const residues = plan.residues ?? [];
  if (residues.length > 0) {
    blocks.push(sectionTitle(t("settings.panel.memory.manager.erase.residuesTitle", { count: residues.length })));
    blocks.push(bulletList(residues.slice(0, ERASE_PLAN_RESIDUE_LIMIT).map((residue) => t(
      "settings.panel.memory.manager.erase.residueLine",
      { kind: residueKindLabel(residue.kind), file: residue.file, snippet: residue.snippet },
    )), "memory-erase__residues"));
    if (residues.length > ERASE_PLAN_RESIDUE_LIMIT) {
      blocks.push(line(t("settings.panel.memory.manager.erase.residueMore", { count: residues.length - ERASE_PLAN_RESIDUE_LIMIT })));
    }
  }

  const warnings = plan.warnings ?? [];
  if (warnings.length > 0) {
    blocks.push(sectionTitle(t("settings.panel.memory.manager.erase.warningsTitle")));
    blocks.push(bulletList(warnings, "memory-erase__warnings"));
  }

  return `<div class="memory-erase memory-erase--plan">${blocks.join("\n")}</div>`;
}

/** 擦除报告正文（含 failed[]，绝不吞掉失败步骤）。 */
export function buildEraseReportBody(report: PersonEraseReport): string {
  const blocks: string[] = [];
  const failed = report.failed ?? [];
  const residues = report.residues ?? [];

  blocks.push(line(
    report.partial
      ? t("settings.panel.memory.manager.erase.reportPartial", { count: failed.length })
      : t("settings.panel.memory.manager.erase.reportComplete"),
    report.partial ? "memory-erase__failed" : "memory-erase__ok",
  ));

  blocks.push(sectionTitle(t("settings.panel.memory.manager.erase.reportDetailTitle")));
  blocks.push(line(t("settings.panel.memory.manager.erase.reportL2", {
    requested: report.l2?.requested ?? 0,
    removed: report.l2?.removed ?? 0,
    decompressed: report.l2?.decompressed ?? 0,
    summaries: report.l2?.summariesRemoved ?? 0,
  })));
  blocks.push(line(t("settings.panel.memory.manager.erase.reportTranscript", {
    sessions: report.transcript?.sessions ?? 0,
    hot: report.transcript?.hotLines ?? 0,
    archive: report.transcript?.archiveLines ?? 0,
    // D5：其中"她复述他"的行数
    assistant: report.transcript?.assistantLines ?? 0,
  })));
  blocks.push(line(t("settings.panel.memory.manager.erase.reportVectors", {
    vectors: report.l2?.removed ?? 0,
    chatVectors: report.chatHistoryVectors ?? 0,
  })));
  blocks.push(line(t("settings.panel.memory.manager.erase.reportPeripheral", {
    entries: report.audit?.entries ?? 0,
    files: report.audit?.files ?? 0,
    lines: report.channelLog?.lines ?? 0,
    chats: report.externalChats ?? 0,
    runs: report.runs ?? 0,
    backups: report.backups?.files ?? 0,
    backupSize: formatBytes(report.backups?.bytes ?? 0),
    apiLog: report.apiLog?.deleted
      ? t("settings.panel.memory.manager.erase.reportApiLogDeleted", { size: formatBytes(report.apiLog.bytes) })
      : t("settings.panel.memory.manager.erase.reportApiLogKept"),
  })));
  blocks.push(line(t("settings.panel.memory.manager.erase.reportEntities", {
    nodes: report.entities?.nodes ?? 0,
    relations: report.entities?.relations ?? 0,
  })));
  blocks.push(line(t("settings.panel.memory.manager.erase.reportRelationship", {
    byPersonKey: report.relationship?.byPersonKey ?? 0,
    byScope: report.relationship?.byScope ?? 0,
    byTextFingerprint: report.relationship?.byTextFingerprint ?? 0,
    summaries: report.relationship?.summaries ?? 0,
  })));
  blocks.push(line(t("settings.panel.memory.manager.erase.reportCaches", {
    injections: report.caches?.injections ?? 0,
    sessionIndex: report.caches?.sessionIndex ?? 0,
    dmae: report.caches?.dmaeReloaded
      ? t("settings.panel.memory.manager.erase.reportDmaeOn")
      : t("settings.panel.memory.manager.erase.reportDmaeOff"),
  })));
  blocks.push(line(t("settings.panel.memory.manager.erase.reportObsidian", {
    synced: report.obsidian?.synced
      ? t("settings.panel.memory.manager.erase.reportObsidianSynced")
      : t("settings.panel.memory.manager.erase.reportObsidianSkipped"),
  })));
  blocks.push(line(t("settings.panel.memory.manager.erase.reportKept", { count: report.keptSubjectOnly ?? 0 })));

  if (residues.length > 0) {
    blocks.push(sectionTitle(t("settings.panel.memory.manager.erase.residuesTitle", { count: residues.length })));
    blocks.push(bulletList(residues.map((residue) => t(
      "settings.panel.memory.manager.erase.residueLine",
      { kind: residueKindLabel(residue.kind), file: residue.file, snippet: residue.snippet },
    )), "memory-erase__residues"));
  }

  // ⚠️ failed[] 必须出现在报告里（"部分完成，可再次执行擦除以收敛"的凭据）
  if (failed.length > 0) {
    blocks.push(sectionTitle(t("settings.panel.memory.manager.erase.failedTitle", { count: failed.length })));
    blocks.push(bulletList(failed.map((item) => t("settings.panel.memory.manager.erase.failedLine", {
      step: item.step, target: item.target, error: item.error,
    })), "memory-erase__failed-list"));
  }

  return `<div class="memory-erase memory-erase--report">${blocks.join("\n")}</div>`;
}

async function closeModal(title: string, message: string, icon: string): Promise<void> {
  await showHtmlModal({
    title,
    icon,
    htmlBody: `<p>${escapeHtml(message)}</p>`,
    confirmText: t("settings.panel.memory.manager.erase.close"),
  });
}

/** ① 预演。失败时给出提示并返回 null（调用方据此**中止**，绝不进入执行）。 */
async function loadErasePlan(personKey: string): Promise<PersonErasePlan | null> {
  const api = window.memoryPanel;
  if (!api) return null;
  try {
    const plan = await api.erasePreview(personKey);
    return plan ?? null;
  } catch (err) {
    console.error("[settings] erase preview failed", err);
    await closeModal(
      t("settings.panel.memory.manager.erase.previewFailedTitle"),
      t("settings.panel.memory.manager.erase.previewFailedMessage", { error: errorText(err) }),
      "⚠️",
    );
    return null;
  }
}

/** ② 二次确认（严格相等门控）。取消或输入不等 → 返回 null。 */
async function askEraseConfirmation(plan: PersonErasePlan): Promise<string | null> {
  const phrase = eraseConfirmPhrase();
  const name = plan.knownNames?.[0] || plan.personKey;
  return await showInputModal({
    title: t("settings.panel.memory.manager.erase.confirmTitle"),
    message: t("settings.panel.memory.manager.erase.confirmMessage", { name, phrase }),
    placeholder: phrase,
    confirmText: t("settings.panel.memory.manager.erase.confirmButton"),
    cancelText: t("settings.panel.memory.manager.cancel"),
    icon: "🧨",
    confirmValue: phrase,
  });
}

/** ③ 执行。异常时提示并返回 null。 */
async function executeErase(personKey: string, previewId: string): Promise<PersonEraseReport | null> {
  const api = window.memoryPanel;
  if (!api) return null;
  try {
    return await api.erasePerson(personKey, previewId) ?? null;
  } catch (err) {
    console.error("[settings] erase person failed", err);
    await closeModal(
      t("settings.panel.memory.manager.erase.reportFailedTitle"),
      t("settings.panel.memory.manager.erase.executeFailedMessage", { error: errorText(err) }),
      "⚠️",
    );
    return null;
  }
}

/** 擦除后刷新：收起详情 + 重新拉列表（不弹重启提示 —— §2.15 的缓存失效是原地生效的）。 */
async function refreshManagerAfterErase(): Promise<void> {
  closeManagerDetail();
  await loadMemoryManager();
  setManagerFeedback("ok", t("settings.panel.memory.manager.erasedFeedback"));
}

/**
 * 三段式流程（导出以便测试与复用）。
 *
 * 任何一处不满足条件都**直接返回**：预演失败、预演没拿到 previewId、用户取消二次确认、
 * 确认短语与 `eraseConfirmPhrase()` 不严格相等。
 */
export async function runPersonEraseFlow(personKey: string): Promise<void> {
  const api = window.memoryPanel;
  if (!api || !canErasePersonKey(personKey)) return;

  for (let round = 0; round <= MAX_ERASE_RECONFIRM_ROUNDS; round += 1) {
    const plan = await loadErasePlan(personKey);
    if (!plan) return;

    await showHtmlModal({
      title: t("settings.panel.memory.manager.erase.previewTitle", { name: plan.knownNames?.[0] || personKey }),
      icon: "🔍",
      htmlBody: buildErasePlanBody(plan),
      confirmText: t("settings.panel.memory.manager.erase.previewContinue"),
    });

    const typed = await askEraseConfirmation(plan);
    if (typed === null || !isEraseConfirmed(typed)) return;
    if (!plan.previewId) return;

    const report = await executeErase(personKey, plan.previewId);
    if (!report) return;

    if (report.needsReconfirm) {
      const lastRound = round >= MAX_ERASE_RECONFIRM_ROUNDS;
      await closeModal(
        t("settings.panel.memory.manager.erase.reconfirmTitle"),
        lastRound
          ? t("settings.panel.memory.manager.erase.reconfirmLimitReached", { count: report.addedSincePreview ?? 0 })
          : t("settings.panel.memory.manager.erase.needsReconfirm", { count: report.addedSincePreview ?? 0 }),
        "⚠️",
      );
      if (lastRound) {
        await refreshManagerAfterErase();
        return;
      }
      continue; // 回到 ① 重新预演
    }

    await showHtmlModal({
      title: t("settings.panel.memory.manager.erase.reportTitle"),
      icon: "🧹",
      htmlBody: buildEraseReportBody(report),
      confirmText: t("settings.panel.memory.manager.erase.close"),
    });
    await refreshManagerAfterErase();
    return;
  }
}

let eraseEventsBound = false;

/**
 * 顶层挂载（由 settings.ts 在模块顶层调用一次）：
 * 绑定控制台的事件委托 + 「彻底擦除」按钮（该按钮只在详情区出现）。
 */
export function initMemoryManagerUI(): void {
  bindManagerEvents();
  if (eraseEventsBound) return;
  eraseEventsBound = true;
  memoryManagerEraseBtn?.addEventListener("click", () => {
    const item = managerState.detail?.item;
    if (!item || item.erasable !== true || !canErasePersonKey(item.key)) return;
    void runPersonEraseFlow(item.key);
  });
}
