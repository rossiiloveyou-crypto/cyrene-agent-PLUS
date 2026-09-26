// Memory 面板业务逻辑：加载 / 编辑 / 保存 / 渲染
// 从 settings.ts 抽离。依赖 memory DOM 引用（./dom）、memoryState（./state）、
// shared 工具（renderInfoList / renderEmptyState / shallowEqual / formatDateTime / escapeHtml）。

import { memoryState } from "./state";
import {
  memoryL0NameInput, memoryL0OccupationInput, memoryL0InterestsInput,
  memoryL0LanguageInput, memoryL0NoteInput,
  memoryL1GoalsInput, memoryL1PreferencesInput, memoryL1ProjectInput,
  memoryL2SearchInput, memoryL2List,
  memoryImportedList, memoryReflectionList,
  memoryL0EditBtn, memoryL0CancelBtn,
  memoryL1EditBtn, memoryL1CancelBtn,
  memoryGroupContextLimitInput, memoryGroupContextStatus,
} from "./dom";
import { renderInfoList, renderEmptyState } from "../shared/render";
import { shallowEqual } from "../shared/utils";
import { formatDateTime, escapeHtml } from "../shared/format";
import { t } from "../i18n";

function renderL2List(query = ""): void {
  const list = memoryState.panelCache?.l2 ?? [];
  const normalized = query.trim().toLowerCase();
  const filtered = normalized
    ? list.filter((item) => {
        const haystack = [item.content, item.triggerText, item.status].join(" ").toLowerCase();
        return haystack.includes(normalized);
      })
    : list;

  renderInfoList(
    memoryL2List,
    filtered.map((item) => ({
      title: item.content,
      body: item.triggerText ? `触发片段：${item.triggerText}` : "无触发片段",
      meta: `状态：${item.status} · 权重：${item.weight.toFixed(1)} · 创建于：${formatDateTime(item.createdAt)}`,
    })),
    normalized ? "没有匹配的事件片段" : "暂无事件片段",
    normalized ? "换个关键词试试" : "聊天后昔涟会自动提炼重要信息",
  );
}

export async function loadMemoryPanel(): Promise<void> {
  void loadGroupContextLimit();
  try {
    const payload = await window.memoryPanel?.getData();
    if (!payload) return;
    memoryState.panelCache = payload;

    if (memoryL0NameInput) memoryL0NameInput.value = payload.l0.preferredName || "";
    if (memoryL0OccupationInput) memoryL0OccupationInput.value = payload.l0.occupation || "";
    if (memoryL0InterestsInput) memoryL0InterestsInput.value = payload.l0.longTermInterests || "";
    if (memoryL0LanguageInput) memoryL0LanguageInput.value = payload.l0.language || "";
    if (memoryL0NoteInput) memoryL0NoteInput.value = payload.l0.permanentNote || "";

    if (memoryL1GoalsInput) memoryL1GoalsInput.value = payload.l1.recentGoals || "";
    if (memoryL1PreferencesInput) memoryL1PreferencesInput.value = payload.l1.recentPreferences || "";
    if (memoryL1ProjectInput) memoryL1ProjectInput.value = payload.l1.currentProject || "";

    renderL2List(memoryL2SearchInput?.value || "");

    renderImportedDocs();

    renderInfoList(
      memoryReflectionList,
      payload.reflections,
      "暂无回顾",
      "当前项目里回顾还没真正生成落地",
    );

    if (memoryL0EditBtn) memoryL0EditBtn.disabled = false;
    if (memoryL1EditBtn) memoryL1EditBtn.disabled = false;
  } catch (err) {
    console.error("[settings] load memory panel failed", err);
    renderEmptyState(memoryL2List, "片段读取失败", "请查看终端日志");
    renderEmptyState(memoryImportedList, "导入知识读取失败", "请查看终端日志");
    renderEmptyState(memoryReflectionList, "回顾读取失败", "请查看终端日志");
  }
}

// ── 群聊上下文条数（通用设置 groupContextLimit，主进程范围 3~50，默认 10） ──

export const DEFAULT_GROUP_CONTEXT_LIMIT = 10;
export const MIN_GROUP_CONTEXT_LIMIT = 3;
export const MAX_GROUP_CONTEXT_LIMIT = 50;
const GROUP_CONTEXT_LIMIT_ERROR = "群聊上下文条数需在 3~50 之间";

/**
 * 归一化群聊上下文条数：空值 / 非数字回落默认 10，越界夹到 3~50 的整数。
 * 与主进程 normalizeGroupContextLimit 的差别：那边把空字符串当 0 再夹到 3，
 * 这里把「用户清空输入框」视为恢复默认值，避免莫名变成最小值。
 */
export function normalizeGroupContextLimit(value: unknown): number {
  if (value === null || value === undefined) return DEFAULT_GROUP_CONTEXT_LIMIT;
  if (typeof value === "string" && value.trim() === "") return DEFAULT_GROUP_CONTEXT_LIMIT;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_GROUP_CONTEXT_LIMIT;
  return Math.min(MAX_GROUP_CONTEXT_LIMIT, Math.max(MIN_GROUP_CONTEXT_LIMIT, Math.round(parsed)));
}

function setGroupContextStatus(text: string, cls?: string): void {
  if (!memoryGroupContextStatus) return;
  memoryGroupContextStatus.textContent = text;
  memoryGroupContextStatus.className = "memory-field__status";
  if (cls) memoryGroupContextStatus.classList.add(cls);
}

/** 读通用设置里的 groupContextLimit 填进输入框（缺失/非法回落 10）。 */
export async function loadGroupContextLimit(): Promise<void> {
  if (!memoryGroupContextLimitInput) return;
  try {
    const cfg = await window.settings!.getGeneral();
    memoryGroupContextLimitInput.value = String(normalizeGroupContextLimit(cfg?.groupContextLimit));
    setGroupContextStatus("");
  } catch (err) {
    console.warn("[settings] load groupContextLimit failed", err);
    memoryGroupContextLimitInput.value = String(DEFAULT_GROUP_CONTEXT_LIMIT);
    setGroupContextStatus(GROUP_CONTEXT_LIMIT_ERROR, "is-error");
  }
}

/** 保存：先把输入值夹到 3~50 的整数并写回输入框，再落盘。 */
export async function saveGroupContextLimit(): Promise<void> {
  if (!memoryGroupContextLimitInput) return;
  const limit = normalizeGroupContextLimit(memoryGroupContextLimitInput.value);
  memoryGroupContextLimitInput.value = String(limit);
  try {
    await window.settings!.saveGeneral({ groupContextLimit: limit });
    setGroupContextStatus(t("settings.panel.memory.groupContext.saved"), "is-ok");
  } catch (err) {
    console.error("[settings] save groupContextLimit failed", err);
    setGroupContextStatus(t("settings.panel.memory.groupContext.saveFailed"), "is-error");
  }
}

/** change 事件只绑一次（由 settings.ts 顶层调用）。 */
export function initGroupContextLimitInput(): void {
  memoryGroupContextLimitInput?.addEventListener("change", () => void saveGroupContextLimit());
}

function takeL0Snapshot(): Record<string, string> {
  return {
    preferredName: memoryL0NameInput?.value ?? "",
    occupation: memoryL0OccupationInput?.value ?? "",
    longTermInterests: memoryL0InterestsInput?.value ?? "",
    language: memoryL0LanguageInput?.value ?? "",
    permanentNote: memoryL0NoteInput?.value ?? "",
  };
}

function takeL1Snapshot(): Record<string, string> {
  return {
    recentGoals: memoryL1GoalsInput?.value ?? "",
    recentPreferences: memoryL1PreferencesInput?.value ?? "",
    currentProject: memoryL1ProjectInput?.value ?? "",
  };
}

function setL0FieldsDisabled(disabled: boolean): void {
  if (memoryL0NameInput) disabled ? memoryL0NameInput.setAttribute("disabled", "") : memoryL0NameInput.removeAttribute("disabled");
  if (memoryL0OccupationInput) disabled ? memoryL0OccupationInput.setAttribute("disabled", "") : memoryL0OccupationInput.removeAttribute("disabled");
  if (memoryL0InterestsInput) disabled ? memoryL0InterestsInput.setAttribute("disabled", "") : memoryL0InterestsInput.removeAttribute("disabled");
  if (memoryL0LanguageInput) disabled ? memoryL0LanguageInput.setAttribute("disabled", "") : memoryL0LanguageInput.removeAttribute("disabled");
  if (memoryL0NoteInput) disabled ? memoryL0NoteInput.setAttribute("disabled", "") : memoryL0NoteInput.removeAttribute("disabled");
}

function setL1FieldsDisabled(disabled: boolean): void {
  if (memoryL1GoalsInput) disabled ? memoryL1GoalsInput.setAttribute("disabled", "") : memoryL1GoalsInput.removeAttribute("disabled");
  if (memoryL1PreferencesInput) disabled ? memoryL1PreferencesInput.setAttribute("disabled", "") : memoryL1PreferencesInput.removeAttribute("disabled");
  if (memoryL1ProjectInput) disabled ? memoryL1ProjectInput.setAttribute("disabled", "") : memoryL1ProjectInput.removeAttribute("disabled");
}

export function enterL0EditMode(): void {
  if (memoryState.l0Editing) return;
  memoryState.l0Editing = true;
  memoryState.l0Snapshot = takeL0Snapshot();
  setL0FieldsDisabled(false);
  if (memoryL0EditBtn) memoryL0EditBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 48 48" fill="none" aria-hidden="true" style="display:inline;vertical-align:-2px"><path d="M6 9C6 7.34315 7.34315 6 9 6H30.3363C31.132 6 31.895 6.31607 32.4576 6.87868L36.3158 10.7368L41.1213 15.5424C41.6839 16.105 42 16.868 42 17.6637V39C42 40.6569 40.6569 42 39 42H9C7.34315 42 6 40.6569 6 39V9Z" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M31 26H17C15.3431 26 14 27.3431 14 29V42H34V29C34 27.3431 32.6569 26 31 26Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M29 16H17C15.3431 16 14 14.6569 14 13V6" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg> 保存`;
  if (memoryL0CancelBtn) memoryL0CancelBtn.classList.remove("is-hidden");
}

export function exitL0EditMode(): void {
  memoryState.l0Editing = false;
  memoryState.l0Snapshot = null;
  setL0FieldsDisabled(true);
  if (memoryL0EditBtn) memoryL0EditBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 48 48" fill="none" aria-hidden="true" style="display:inline;vertical-align:-2px"><path d="M5.32497 43.4996L13.81 43.4998L44.9227 12.3871L36.4374 3.90186L5.32471 35.0146L5.32497 43.4996Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M27.9521 12.3872L36.4374 20.8725" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg> 编辑`;
  if (memoryL0CancelBtn) memoryL0CancelBtn.classList.add("is-hidden");
}

export async function saveL0(): Promise<void> {
  const current = takeL0Snapshot();
  if (memoryState.l0Snapshot && shallowEqual(current, memoryState.l0Snapshot)) {
    exitL0EditMode();
    return;
  }
  try {
    await window.memoryPanel?.saveL0(current);
    await loadMemoryPanel();
    exitL0EditMode();
    if (memoryL0EditBtn) {
      memoryL0EditBtn.textContent = "✅ 已保存";
      setTimeout(() => { if (memoryL0EditBtn && !memoryState.l0Editing) memoryL0EditBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 48 48" fill="none" aria-hidden="true" style="display:inline;vertical-align:-2px"><path d="M5.32497 43.4996L13.81 43.4998L44.9227 12.3871L36.4374 3.90186L5.32471 35.0146L5.32497 43.4996Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M27.9521 12.3872L36.4374 20.8725" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg> 编辑`; }, 2000);
    }
  } catch (err) {
    console.error("[settings] save L0 failed", err);
    alert("保存失败，请重试");
  }
}

export function cancelL0Edit(): void {
  if (memoryState.l0Snapshot) {
    if (memoryL0NameInput) memoryL0NameInput.value = memoryState.l0Snapshot.preferredName;
    if (memoryL0OccupationInput) memoryL0OccupationInput.value = memoryState.l0Snapshot.occupation;
    if (memoryL0InterestsInput) memoryL0InterestsInput.value = memoryState.l0Snapshot.longTermInterests;
    if (memoryL0LanguageInput) memoryL0LanguageInput.value = memoryState.l0Snapshot.language;
    if (memoryL0NoteInput) memoryL0NoteInput.value = memoryState.l0Snapshot.permanentNote;
  }
  exitL0EditMode();
}

export function enterL1EditMode(): void {
  if (memoryState.l1Editing) return;
  memoryState.l1Editing = true;
  memoryState.l1Snapshot = takeL1Snapshot();
  setL1FieldsDisabled(false);
  if (memoryL1EditBtn) memoryL1EditBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 48 48" fill="none" aria-hidden="true" style="display:inline;vertical-align:-2px"><path d="M6 9C6 7.34315 7.34315 6 9 6H30.3363C31.132 6 31.895 6.31607 32.4576 6.87868L36.3158 10.7368L41.1213 15.5424C41.6839 16.105 42 16.868 42 17.6637V39C42 40.6569 40.6569 42 39 42H9C7.34315 42 6 40.6569 6 39V9Z" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M31 26H17C15.3431 26 14 27.3431 14 29V42H34V29C34 27.3431 32.6569 26 31 26Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M29 16H17C15.3431 16 14 14.6569 14 13V6" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg> 保存`;
  if (memoryL1CancelBtn) memoryL1CancelBtn.classList.remove("is-hidden");
}

export function exitL1EditMode(): void {
  memoryState.l1Editing = false;
  memoryState.l1Snapshot = null;
  setL1FieldsDisabled(true);
  if (memoryL1EditBtn) memoryL1EditBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 48 48" fill="none" aria-hidden="true" style="display:inline;vertical-align:-2px"><path d="M5.32497 43.4996L13.81 43.4998L44.9227 12.3871L36.4374 3.90186L5.32471 35.0146L5.32497 43.4996Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M27.9521 12.3872L36.4374 20.8725" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg> 编辑`;
  if (memoryL1CancelBtn) memoryL1CancelBtn.classList.add("is-hidden");
}

export async function saveL1(): Promise<void> {
  const current = takeL1Snapshot();
  if (memoryState.l1Snapshot && shallowEqual(current, memoryState.l1Snapshot)) {
    exitL1EditMode();
    return;
  }
  try {
    await window.memoryPanel?.saveL1(current);
    await loadMemoryPanel();
    exitL1EditMode();
    if (memoryL1EditBtn) {
      memoryL1EditBtn.textContent = "✅ 已保存";
      setTimeout(() => { if (memoryL1EditBtn && !memoryState.l1Editing) memoryL1EditBtn.textContent = "✏️ 编辑"; }, 2000);
    }
  } catch (err) {
    console.error("[settings] save L1 failed", err);
    alert("保存失败，请重试");
  }
}

export function cancelL1Edit(): void {
  if (memoryState.l1Snapshot) {
    if (memoryL1GoalsInput) memoryL1GoalsInput.value = memoryState.l1Snapshot.recentGoals;
    if (memoryL1PreferencesInput) memoryL1PreferencesInput.value = memoryState.l1Snapshot.recentPreferences;
    if (memoryL1ProjectInput) memoryL1ProjectInput.value = memoryState.l1Snapshot.currentProject;
  }
  exitL1EditMode();
}

export function renderImportedDocs(): void {
  const list = memoryState.panelCache?.importedDocs ?? [];
  if (!memoryImportedList) return;

  if (list.length === 0) {
    renderEmptyState(memoryImportedList, "暂无导入文档", "在聊天窗口上传文件后会自动索引");
    return;
  }

  memoryImportedList.innerHTML = list
    .map((item) => {
      const importId = item.importId || "";
      const fileName = escapeHtml(item.fileName);
      const chunkInfo = "已索引 " + item.chunkCount + " 个片段";
      const timeInfo = "最近导入：" + formatDateTime(item.lastImportedAt);
      return [
        '<article class="memory-record memory-record--doc">',
        '  <div class="memory-record__main">',
        '    <h3 class="memory-record__title">' + fileName + '</h3>',
        '    <p class="memory-record__body">' + escapeHtml(chunkInfo) + '</p>',
        '    <p class="memory-record__meta">' + escapeHtml(timeInfo) + '</p>',
        '  </div>',
        '  <button type="button" class="memory-record__delete" data-import-id="' + escapeHtml(importId) + '" data-file-name="' + fileName + '" title="删除此导入文档"><svg width="16" height="16" viewBox="0 0 48 48" fill="none" aria-hidden="true" style="vertical-align:-2px"><path fill-rule="evenodd" clip-rule="evenodd" d="M8 15H40L37 44H11L8 15Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M20.002 25.0024V35.0026" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="M28.0024 24.9995V34.9972" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="M12 14.9999L28.3242 3L36 15" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>',
        '</article>',
      ].join("\n");
    })
    .join("\n");
}
