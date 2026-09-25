// 设置-记忆面板「记忆管理」控制台（P3 §2.17）。
//
// 形态：三个视图（按人 / 按域 / 按会话）+ 列表 ↔ 详情**两态**切换。
// 仓内先例：memory/obsidian-vault-ui.ts 的 unbound/bound、settings.ts 的 music home/detail；
// 全仓没有任何 tab 组件与样式，所以这里也不用 Tab。
//
// ⚠️ 三条硬约束（写在这里，避免将来被顺手改坏）：
// 1) 「彻底擦除」**只在详情区**出现，列表行永远拿不到它（最危险的动作不放列表里，防误点）；
// 2) 详情区把「🗣 他的记忆」与「👥 别人提到他」**分开显示、分开勾选**（§2.3 的判据：
//    删「他的话」、留「关于他的话」）。默认保留的那一组只有用户显式勾选才会被删，
//    而且会先弹一句「会连带动到别人的记录」的警告；
// 3) 事件委托**只绑一次**（managerState.eventsBound），形态照抄 zones/panel.ts 的
//    data-* + closest()。

import {
  memoryManagerViewPeople, memoryManagerViewZones, memoryManagerViewSessions,
  memoryManagerRefreshBtn, memoryManagerFeedback, memoryManagerList,
  memoryManagerBatchBar, memoryManagerBatchCount, memoryManagerBatchDeleteBtn,
  memoryManagerDetail, memoryManagerDetailTitle, memoryManagerDetailSummary,
  memoryManagerDetailCloseBtn, memoryManagerDetailList, memoryManagerDetailDeleteBtn,
  memoryManagerEraseBtn, memoryManagerTrace,
} from "./dom";
import { escapeHtml, formatDateTime } from "../shared/format";
import { showModal } from "../shared/modal";
import { t } from "../i18n";
import type {
  MemoryManagerDeleteResult, MemoryManagerItem, MemoryManagerMemory,
  MemoryManagerQueryMeta, MemoryManagerView,
} from "../shared/types";

export type ManagerView = MemoryManagerView;

/** 详情区里的两组：own = 🗣 他的记忆（彻底擦除会删的那一组）；mentioned = 👥 别人提到他。 */
export type ManagerGroup = "own" | "mentioned";

export interface ManagerDetailState {
  item: MemoryManagerItem;
  memories: MemoryManagerMemory[];
  meta: MemoryManagerQueryMeta;
}

export const managerState = {
  view: "people" as ManagerView,
  items: [] as MemoryManagerItem[],
  detail: null as ManagerDetailState | null,
  /** 列表行的勾选（key = personKey / scope / sourceConversationId / "__unattributed__"）。 */
  selected: new Set<string>(),
  /** 详情区「🗣 他的记忆」的勾选（memory id）。 */
  selectedOwn: new Set<string>(),
  /** 详情区「👥 别人提到他」的勾选（memory id）。 */
  selectedMentioned: new Set<string>(),
  /** 事件是否已绑定（loadMemoryManager 会被反复调用，绑定只做一次）。 */
  eventsBound: false,
  /** 是否正在请求（避免连点重复加载）。 */
  loading: false,
};

type FeedbackKind = "plain" | "ok" | "err";

let feedbackTimer: number | null = null;

/** 面板内的即时反馈（加载失败 / 删除结果 / 擦除后的刷新都在这里说清楚）。 */
export function setManagerFeedback(kind: FeedbackKind, message: string): void {
  if (!memoryManagerFeedback) return;
  memoryManagerFeedback.textContent = message;
  memoryManagerFeedback.className = "memory-manager__feedback";
  if (kind === "ok") memoryManagerFeedback.classList.add("memory-manager__feedback--ok");
  if (kind === "err") memoryManagerFeedback.classList.add("memory-manager__feedback--err");
  if (feedbackTimer != null) window.clearTimeout(feedbackTimer);
  feedbackTimer = null;
  // 错误留在页面上直到下次操作；成功提示 4 秒后自动消失（与 zones 面板一致）
  if (kind === "ok") {
    feedbackTimer = window.setTimeout(() => {
      if (!memoryManagerFeedback) return;
      memoryManagerFeedback.textContent = "";
      memoryManagerFeedback.className = "memory-manager__feedback";
    }, 4000);
  }
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * 详情行的分组判据（§2.2）：**只有 subjectIds 命中、speakerIds 不命中**才是「别人提到他」（K 类）。
 * speakerIds 命中就是他说的（R2 优先）；两个字段都没命中说明这条来自他的私聊会话（R1，私聊即人）。
 */
export function classifyManagerMemory(
  memory: Pick<MemoryManagerMemory, "speakerIds" | "subjectIds">,
  personKey: string | undefined,
): ManagerGroup {
  if (!personKey) return "own";
  const said = (memory.speakerIds ?? []).includes(personKey);
  const mentioned = (memory.subjectIds ?? []).includes(personKey);
  return !said && mentioned ? "mentioned" : "own";
}

/** 详情区当前勾选的 memory id（两组分开存，删除时按需合并）。 */
export function selectedManagerMemoryIds(): string[] {
  return [...managerState.selectedOwn, ...managerState.selectedMentioned];
}

// ── 渲染：列表 ──────────────────────────────────────────────

function renderManagerEmptyState(title: string, hint: string): void {
  if (!memoryManagerList) return;
  memoryManagerList.innerHTML = [
    '<div class="memory-list__empty">',
    '  <span>📭</span>',
    `  <p>${escapeHtml(title)}</p>`,
    `  <p class="memory-list__hint">${escapeHtml(hint)}</p>`,
    '</div>',
  ].join("\n");
}

function managerRowMeta(item: MemoryManagerItem): string {
  if (managerState.view === "people") {
    // 按人视图：两个数字必须分开给，用户一眼能看出「彻底擦除」会动多少、会留多少
    return t("settings.panel.memory.manager.itemPeopleCounts", {
      own: item.own, mentioned: item.mentioned, total: item.total, sessions: item.sessions,
    });
  }
  return t("settings.panel.memory.manager.itemContainerCounts", { total: item.total, sessions: item.sessions });
}

function renderManagerRow(item: MemoryManagerItem): string {
  const key = escapeHtml(item.key);
  const selected = managerState.selected.has(item.key);
  const sublabel = item.sublabel
    ? `  <span class="memory-manager__row-id">${escapeHtml(item.sublabel)}</span>`
    : "";
  return [
    `<div class="memory-manager__row${selected ? " is-selected" : ""}" data-manager-key="${key}">`,
    '  <label class="memory-manager__row-check">',
    `    <input type="checkbox" data-manager-item="1" data-manager-key="${key}"${selected ? " checked" : ""}`,
    ` aria-label="${escapeHtml(t("settings.panel.memory.manager.selectItem"))}" />`,
    '  </label>',
    `  <span class="memory-manager__row-name">${escapeHtml(item.label || item.key)}</span>`,
    sublabel,
    `  <span class="memory-manager__row-meta">${escapeHtml(managerRowMeta(item))}</span>`,
    `  <button type="button" class="ghost-btn" data-manager-action="open-detail" data-manager-key="${key}">`,
    `${escapeHtml(t("settings.panel.memory.manager.openDetail"))}</button>`,
    '</div>',
  ].join("");
}

export function renderManagerList(): void {
  if (!memoryManagerList) return;
  if (managerState.items.length === 0) {
    renderManagerEmptyState(
      t(managerState.view === "people"
        ? "settings.panel.memory.manager.emptyPeople"
        : "settings.panel.memory.manager.empty"),
      t("settings.panel.memory.manager.emptyHint"),
    );
  } else {
    memoryManagerList.innerHTML = managerState.items.map((item) => renderManagerRow(item)).join("\n");
  }
  renderManagerBatchBar();
}

/** 批量条：勾选列表行后才出现；处于详情两态时不出现（详情区有自己的删除按钮）。 */
export function renderManagerBatchBar(): void {
  const count = managerState.selected.size;
  const visible = count > 0 && managerState.detail === null;
  memoryManagerBatchBar?.classList.toggle("is-hidden", !visible);
  if (memoryManagerBatchCount) {
    memoryManagerBatchCount.textContent = count > 0
      ? t("settings.panel.memory.manager.batchCount", { count })
      : "";
  }
  if (memoryManagerBatchDeleteBtn) {
    memoryManagerBatchDeleteBtn.disabled = count === 0;
    memoryManagerBatchDeleteBtn.textContent = t("settings.panel.memory.manager.deleteSelected");
  }
}

/** 丢弃列表里已不存在的勾选项（视图切换 / 重新加载后不能留下幽灵 key）。 */
export function pruneManagerSelection(items: readonly MemoryManagerItem[]): void {
  const alive = new Set(items.map((item) => item.key));
  for (const key of Array.from(managerState.selected)) {
    if (!alive.has(key)) managerState.selected.delete(key);
  }
}

// ── 渲染：详情 ──────────────────────────────────────────────

function renderManagerMemoryRow(memory: MemoryManagerMemory, group: ManagerGroup): string {
  const id = escapeHtml(memory.id);
  const selected = group === "own"
    ? managerState.selectedOwn.has(memory.id)
    : managerState.selectedMentioned.has(memory.id);
  const meta: string[] = [
    t("settings.panel.memory.manager.memoryAt", {
      time: formatDateTime(memory.createdAt),
      source: memory.sourceConversationId || t("settings.panel.memory.manager.unknownSource"),
    }),
  ];
  if (memory.triggerText) {
    meta.push(t("settings.panel.memory.manager.memoryTrigger", { text: memory.triggerText }));
  }
  if (memory.isSummary) {
    meta.push(t("settings.panel.memory.manager.memorySummary", { count: memory.subEntryCount ?? 0 }));
  } else {
    meta.push(t("settings.panel.memory.manager.memoryStatus", { status: memory.status }));
  }
  if (group === "mentioned") {
    const speakers = (memory.speakerIds ?? []).join("、")
      || t("settings.panel.memory.manager.mentionedUnknownSpeaker");
    // ⚠️ 这一句必须留在行上：删 K 类记忆等于删别人的经历片段（§2.3 理由③）
    meta.push(t("settings.panel.memory.manager.mentionedWarn", { speakers }));
  }
  return [
    `<div class="memory-manager__memory${selected ? " is-selected" : ""}">`,
    '  <label class="memory-manager__memory-check">',
    `    <input type="checkbox" data-manager-memory="1" data-manager-group="${group}" data-memory-id="${id}"`,
    `${selected ? " checked" : ""} aria-label="${escapeHtml(t("settings.panel.memory.manager.selectMemory"))}" />`,
    '  </label>',
    '  <div class="memory-manager__memory-main">',
    `    <p class="memory-manager__memory-body">${escapeHtml(memory.content)}</p>`,
    `    <p class="memory-manager__memory-meta">${escapeHtml(meta.join(" · "))}</p>`,
    '  </div>',
    `  <button type="button" class="ghost-btn" data-manager-action="trace" data-memory-id="${id}">`,
    `${escapeHtml(t("settings.panel.memory.manager.trace"))}</button>`,
    '</div>',
  ].join("");
}

interface ManagerGroupRender {
  group: ManagerGroup;
  title: string;
  hint: string;
  memories: MemoryManagerMemory[];
}

function renderManagerGroup(view: ManagerGroupRender): string {
  const selectedCount = view.group === "own"
    ? managerState.selectedOwn.size
    : managerState.selectedMentioned.size;
  const rows = view.memories.length > 0
    ? view.memories.map((memory) => renderManagerMemoryRow(memory, view.group)).join("\n")
    : `<p class="memory-manager__group-empty">${escapeHtml(t("settings.panel.memory.manager.groupEmpty"))}</p>`;
  return [
    `<section class="memory-manager__group memory-manager__group--${view.group}">`,
    '  <div class="memory-manager__group-head">',
    `    <strong class="memory-manager__group-title">${escapeHtml(view.title)}</strong>`,
    `    <span class="memory-manager__group-count">${escapeHtml(t("settings.panel.memory.manager.groupCount", { count: view.memories.length }))}</span>`,
    `    <span class="memory-manager__group-selected">${escapeHtml(t("settings.panel.memory.manager.groupSelected", { count: selectedCount }))}</span>`,
    '  </div>',
    `  <p class="memory-manager__group-hint">${escapeHtml(view.hint)}</p>`,
    `  <div class="memory-manager__group-rows">${rows}</div>`,
    '</section>',
  ].join("\n");
}

function managerDetailGroups(detail: ManagerDetailState): ManagerGroupRender[] {
  if (managerState.view !== "people") {
    return [{
      group: "own",
      title: t("settings.panel.memory.manager.groupAll"),
      hint: t("settings.panel.memory.manager.groupAllHint"),
      memories: detail.memories,
    }];
  }
  const personKey = detail.meta.personKey ?? detail.item.key;
  return [
    {
      group: "own",
      title: t("settings.panel.memory.manager.groupOwn"),
      hint: t("settings.panel.memory.manager.groupOwnHint"),
      memories: detail.memories.filter((memory) => classifyManagerMemory(memory, personKey) === "own"),
    },
    {
      group: "mentioned",
      title: t("settings.panel.memory.manager.groupMentioned"),
      hint: t("settings.panel.memory.manager.groupMentionedHint"),
      memories: detail.memories.filter((memory) => classifyManagerMemory(memory, personKey) === "mentioned"),
    },
  ];
}

export function renderManagerDetail(): void {
  if (!memoryManagerDetail) return;
  const detail = managerState.detail;
  // 列表 ↔ 详情两态：进详情就收起列表与列表批量条
  memoryManagerDetail.classList.toggle("is-hidden", detail === null);
  memoryManagerList?.classList.toggle("is-hidden", detail !== null);
  renderManagerBatchBar();
  if (!detail) {
    if (memoryManagerTrace) {
      memoryManagerTrace.innerHTML = "";
      memoryManagerTrace.classList.add("is-hidden");
    }
    return;
  }

  const { item, meta } = detail;
  if (memoryManagerDetailTitle) {
    memoryManagerDetailTitle.textContent = item.sublabel
      ? t("settings.panel.memory.manager.detailTitleWithId", { name: item.label, id: item.sublabel })
      : t("settings.panel.memory.manager.detailTitle", { name: item.label });
  }
  if (memoryManagerDetailSummary) {
    memoryManagerDetailSummary.textContent = managerState.view === "people"
      ? t("settings.panel.memory.manager.detailSummary", {
        total: meta.total, own: meta.own, mentioned: meta.mentioned, sessions: meta.sessions?.length ?? item.sessions,
      })
      : t("settings.panel.memory.manager.detailSummaryContainer", { total: meta.total, source: item.label });
  }
  if (memoryManagerDetailList) {
    memoryManagerDetailList.innerHTML = managerDetailGroups(detail)
      .map((group) => renderManagerGroup(group))
      .join("\n");
  }

  // 「彻底擦除」只在按人视图 + key 是合法 personKey 时出现（列表行永远没有这个按钮）
  const canErase = managerState.view === "people" && item.erasable === true;
  if (memoryManagerEraseBtn) {
    memoryManagerEraseBtn.classList.toggle("is-hidden", !canErase);
    memoryManagerEraseBtn.disabled = !canErase;
    memoryManagerEraseBtn.textContent = t("settings.panel.memory.manager.eraseButton");
  }
  if (memoryManagerDetailDeleteBtn) {
    const count = selectedManagerMemoryIds().length;
    memoryManagerDetailDeleteBtn.disabled = count === 0;
    memoryManagerDetailDeleteBtn.textContent = t("settings.panel.memory.manager.deleteDetailSelected", { count });
  }
}

// ── 视图切换 / 详情开关 ─────────────────────────────────────

function renderManagerViewButtons(): void {
  const buttons: Array<[ManagerView, HTMLElement | null]> = [
    ["people", memoryManagerViewPeople],
    ["zones", memoryManagerViewZones],
    ["sessions", memoryManagerViewSessions],
  ];
  for (const [view, el] of buttons) {
    if (!el) continue;
    const active = managerState.view === view;
    el.classList.toggle("is-active", active);
    el.setAttribute("aria-pressed", active ? "true" : "false");
  }
}

/** 切换视图：清空详情与两组勾选，再重新拉列表。 */
export function setManagerView(view: ManagerView): void {
  managerState.view = view;
  managerState.detail = null;
  managerState.selected.clear();
  managerState.selectedOwn.clear();
  managerState.selectedMentioned.clear();
  renderManagerViewButtons();
  renderManagerDetail();
  void loadMemoryManager();
}

/** 打开详情：按当前视图 + key 取记忆明细（列表进入隐藏态）。 */
export async function openManagerDetail(key: string): Promise<void> {
  const api = window.memoryPanel;
  // 列表里找不到时回落到当前详情的那一项：删除后重查不会因为"容器行消失"而卡住
  const item = managerState.items.find((entry) => entry.key === key)
    ?? (managerState.detail?.item.key === key ? managerState.detail.item : undefined);
  if (!api || !item) return;
  managerState.selectedOwn.clear();
  managerState.selectedMentioned.clear();
  try {
    const result = await api.queryMemoryManager(managerState.view, key);
    if (!result) return;
    managerState.detail = { item, memories: result.memories ?? [], meta: result.meta };
    renderManagerDetail();
  } catch (err) {
    console.error("[settings] query memory manager failed", err);
    setManagerFeedback("err", t("settings.panel.memory.manager.actionFailed", { error: errorText(err) }));
  }
}

export function closeManagerDetail(): void {
  managerState.detail = null;
  managerState.selectedOwn.clear();
  managerState.selectedMentioned.clear();
  renderManagerDetail();
}

// ── 溯源 ────────────────────────────────────────────────────

async function showMemoryTrace(memoryId: string): Promise<void> {
  const api = window.memoryPanel;
  if (!api || !memoryManagerTrace) return;
  memoryManagerTrace.classList.remove("is-hidden");
  try {
    const result = await api.traceMemorySource(memoryId);
    if (!result || result.missing) {
      memoryManagerTrace.innerHTML = `<p class="memory-manager__trace-empty">${escapeHtml(t("settings.panel.memory.manager.traceMissing"))}</p>`;
      return;
    }
    const entries = result.entries ?? [];
    if (entries.length === 0) {
      memoryManagerTrace.innerHTML = `<p class="memory-manager__trace-empty">${escapeHtml(t("settings.panel.memory.manager.traceEmpty"))}</p>`;
      return;
    }
    memoryManagerTrace.innerHTML = entries.map((entry) => {
      const speaker = entry.speakerName || entry.speakerId || entry.role;
      const meta = [entry.at, entry.file].filter(Boolean).join(" · ");
      return [
        '<div class="memory-manager__trace-line">',
        `  <span class="memory-manager__trace-speaker">${escapeHtml(`[${speaker}]:`)}</span>`,
        `  <span class="memory-manager__trace-text">${escapeHtml(entry.content)}</span>`,
        `  <span class="memory-manager__trace-meta">${escapeHtml(meta)}</span>`,
        '</div>',
      ].join("\n");
    }).join("\n");
  } catch (err) {
    console.error("[settings] trace memory source failed", err);
    memoryManagerTrace.innerHTML = `<p class="memory-manager__trace-empty">${escapeHtml(t("settings.panel.memory.manager.traceFailed", { error: errorText(err) }))}</p>`;
  }
}

// ── 删除（批量容器 / 详情单条） ─────────────────────────────

function deleteResultFeedback(result: Pick<
  MemoryManagerDeleteResult,
  "removed" | "evidence" | "dmaeStates" | "conflictLogs" | "danglingRefsFixed" | "vectors"
>): string {
  return t("settings.panel.memory.manager.deleteDone", {
    removed: result.removed,
    evidence: result.evidence,
    dmaeStates: result.dmaeStates,
    conflictLogs: result.conflictLogs,
    danglingRefsFixed: result.danglingRefsFixed,
    vectors: result.vectors ?? 0,
  });
}

/** 列表批量条：按容器删（每行一个 { view, key }）。 */
async function deleteSelectedContainers(): Promise<void> {
  const api = window.memoryPanel;
  if (!api) return;
  const keys = Array.from(managerState.selected);
  if (keys.length === 0) return;
  const confirmed = await showModal({
    title: t("settings.panel.memory.manager.deleteConfirmTitle"),
    message: t("settings.panel.memory.manager.deleteConfirmMessage", { count: keys.length }),
    icon: "⚠️",
    confirmText: t("settings.panel.memory.manager.deleteConfirmButton"),
    cancelText: t("settings.panel.memory.manager.cancel"),
  });
  if (!confirmed) return;

  const totals = { removed: 0, evidence: 0, dmaeStates: 0, conflictLogs: 0, danglingRefsFixed: 0 };
  let failed = 0;
  for (const key of keys) {
    try {
      const result = await api.deleteMemoryManager({ view: managerState.view, key });
      if (!result) { failed += 1; continue; }
      totals.removed += result.removed ?? 0;
      totals.evidence += result.evidence ?? 0;
      totals.dmaeStates += result.dmaeStates ?? 0;
      totals.conflictLogs += result.conflictLogs ?? 0;
      totals.danglingRefsFixed += result.danglingRefsFixed ?? 0;
    } catch (err) {
      console.warn("[settings] delete memory container failed", key, err);
      failed += 1;
    }
  }
  managerState.selected.clear();
  renderManagerBatchBar();
  if (failed > 0) {
    setManagerFeedback("err", t("settings.panel.memory.manager.deletePartialFailed", { failed, removed: totals.removed }));
  } else {
    setManagerFeedback("ok", deleteResultFeedback(totals));
  }
  await loadMemoryManager();
}

function mentionedSpeakers(detail: ManagerDetailState): string {
  const names = new Set<string>();
  for (const memory of detail.memories) {
    if (!managerState.selectedMentioned.has(memory.id)) continue;
    for (const speaker of memory.speakerIds ?? []) names.add(speaker);
  }
  return Array.from(names).join("、") || t("settings.panel.memory.manager.mentionedUnknownSpeaker");
}

/** 详情区：删掉勾选的记忆（含 K 类时先警告 —— 那是别人的经历片段）。 */
async function deleteSelectedMemories(): Promise<void> {
  const api = window.memoryPanel;
  const detail = managerState.detail;
  if (!api || !detail) return;
  const ids = selectedManagerMemoryIds();
  if (ids.length === 0) return;

  if (managerState.selectedMentioned.size > 0) {
    const confirmed = await showModal({
      title: t("settings.panel.memory.manager.mentionedDeleteTitle"),
      message: t("settings.panel.memory.manager.mentionedDeleteMessage", {
        count: managerState.selectedMentioned.size,
        speakers: mentionedSpeakers(detail),
      }),
      icon: "⚠️",
      confirmText: t("settings.panel.memory.manager.mentionedDeleteConfirm"),
      cancelText: t("settings.panel.memory.manager.cancel"),
    });
    if (!confirmed) return;
  }

  const key = detail.item.key;
  try {
    const result = await api.deleteMemoryManager({ ids });
    if (!result) return;
    // 列表计数与详情都要重算（getAllL2 换过数组身份，不能复用旧数据）
    await loadMemoryManager();
    await openManagerDetail(key);
    setManagerFeedback("ok", deleteResultFeedback(result));
  } catch (err) {
    console.error("[settings] delete memory manager rows failed", err);
    setManagerFeedback("err", t("settings.panel.memory.manager.deleteFailed", { error: errorText(err) }));
  }
}

// ── 生命周期 ────────────────────────────────────────────────

export async function loadMemoryManager(): Promise<void> {
  bindManagerEvents();
  renderManagerViewButtons();
  if (!memoryManagerList) return;
  if (!window.memoryPanel) {
    renderManagerEmptyState(
      t("settings.panel.memory.manager.loadFailed"),
      t("settings.panel.memory.manager.loadFailedHint"),
    );
    return;
  }
  if (managerState.loading) return;
  managerState.loading = true;
  try {
    const result = await window.memoryPanel.listMemoryManager(managerState.view);
    managerState.items = result?.items ?? [];
    pruneManagerSelection(managerState.items);
    renderManagerList();
  } catch (err) {
    console.error("[settings] load memory manager failed", err);
    setManagerFeedback("err", t("settings.panel.memory.manager.actionFailed", { error: errorText(err) }));
    renderManagerEmptyState(
      t("settings.panel.memory.manager.loadFailed"),
      t("settings.panel.memory.manager.loadFailedHint"),
    );
  } finally {
    managerState.loading = false;
  }
}

/** 离开面板：清勾选、关详情、清提示（下次进入会重新加载列表）。 */
export function disposeMemoryManager(): void {
  managerState.selected.clear();
  managerState.selectedOwn.clear();
  managerState.selectedMentioned.clear();
  managerState.detail = null;
  setManagerFeedback("plain", "");
  renderManagerDetail();
  renderManagerList();
}

/** 事件委托只做一次（loadMemoryManager 会在每次进入面板时被调用）。 */
export function bindManagerEvents(): void {
  if (managerState.eventsBound) return;
  managerState.eventsBound = true;

  memoryManagerViewPeople?.addEventListener("click", () => setManagerView("people"));
  memoryManagerViewZones?.addEventListener("click", () => setManagerView("zones"));
  memoryManagerViewSessions?.addEventListener("click", () => setManagerView("sessions"));
  memoryManagerRefreshBtn?.addEventListener("click", () => void loadMemoryManager());
  memoryManagerBatchDeleteBtn?.addEventListener("click", () => void deleteSelectedContainers());
  memoryManagerDetailCloseBtn?.addEventListener("click", () => closeManagerDetail());
  memoryManagerDetailDeleteBtn?.addEventListener("click", () => void deleteSelectedMemories());

  memoryManagerList?.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    const actionEl = target?.closest<HTMLElement>("[data-manager-action]");
    if (!actionEl) return;
    if (actionEl.dataset.managerAction === "open-detail") {
      void openManagerDetail(actionEl.dataset.managerKey ?? "");
    }
  });

  memoryManagerList?.addEventListener("change", (event) => {
    const target = event.target as HTMLInputElement | null;
    if (!target?.matches("[data-manager-item]")) return;
    const key = target.dataset.managerKey ?? "";
    if (!key) return;
    if (target.checked) managerState.selected.add(key);
    else managerState.selected.delete(key);
    target.closest(".memory-manager__row")?.classList.toggle("is-selected", target.checked);
    renderManagerBatchBar();
  });

  memoryManagerDetailList?.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    const actionEl = target?.closest<HTMLElement>("[data-manager-action]");
    if (!actionEl) return;
    const memoryId = actionEl.dataset.memoryId ?? "";
    if (!memoryId) return;
    if (actionEl.dataset.managerAction === "trace") void showMemoryTrace(memoryId);
  });

  memoryManagerDetailList?.addEventListener("change", (event) => {
    const target = event.target as HTMLInputElement | null;
    if (!target?.matches("[data-manager-memory]")) return;
    const memoryId = target.dataset.memoryId ?? "";
    if (!memoryId) return;
    const bucket = target.dataset.managerGroup === "mentioned"
      ? managerState.selectedMentioned
      : managerState.selectedOwn;
    if (target.checked) bucket.add(memoryId);
    else bucket.delete(memoryId);
    renderManagerDetail();
  });
}
