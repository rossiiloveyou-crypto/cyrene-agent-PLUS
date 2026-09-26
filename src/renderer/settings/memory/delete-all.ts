// 设置-记忆面板「删除全部记忆」危险操作。
//
// 流程：二次确认（必须手动输入确认短语，按钮才可点）→ 调 memoryPanel.deleteAll()
//      → 主进程返回 restartRequired 时提示「立即重启」→ memoryPanel.restartApp()。
//
// 为什么必须重启：删除后进程内还有 memoryStore / entityGraph / JsonVectorStore 三处缓存，
// 不重启就会把旧数据写回磁盘（见 src/main/memory/memory-user-ipc.ts 的注释）。

import { memoryDeleteAllBtn } from "./dom";
import { showHtmlModal, showInputModal, showModal } from "../shared/modal";
import { escapeHtml } from "../shared/format";
import { t } from "../i18n";
import type { DeleteAllMemoryResult } from "../shared/types";

/** 二次确认短语。必须严格相等（trim 不算数，避免"顺手粘贴带空格"也能过）。 */
export function deleteAllConfirmPhrase(): string {
  return t("settings.panel.memory.deleteAll.confirmPhrase");
}

/** 输入内容是否满足确认条件。 */
export function isDeleteAllConfirmed(input: string): boolean {
  return input === deleteAllConfirmPhrase();
}

/** 把失败路径列表拼成可读文本（逐行展示，含失败原因）。 */
export function describeDeleteAllFailure(failed: Array<{ path: string; error: string }>): string {
  if (failed.length === 0) return "";
  return failed.map((item) => `${item.path}（${item.error}）`).join("\n");
}

/** 失败提示正文（带换行的 HTML 片段，调用方负责已转义）。 */
export function buildDeleteAllFailureBody(failed: Array<{ path: string; error: string }>): string {
  const list = escapeHtml(describeDeleteAllFailure(failed)).replace(/\n/g, "<br>");
  return t("settings.panel.memory.deleteAll.failedMessage", { paths: list });
}

async function notifyDeleteAllFailed(failed: Array<{ path: string; error: string }>): Promise<void> {
  await showHtmlModal({
    title: t("settings.panel.memory.deleteAll.failedTitle"),
    icon: "⚠️",
    htmlBody: `<p>${buildDeleteAllFailureBody(failed)}</p>`,
    confirmText: t("settings.panel.memory.deleteAll.failedConfirm"),
  });
}

async function promptRestart(): Promise<void> {
  const restart = await showModal({
    title: t("settings.panel.memory.deleteAll.doneTitle"),
    message: t("settings.panel.memory.deleteAll.doneMessage"),
    icon: "✅",
    confirmText: t("settings.panel.memory.deleteAll.restartButton"),
    cancelText: t("settings.panel.memory.deleteAll.laterButton"),
  });
  if (restart) await window.memoryPanel?.restartApp();
}

/** 完整流程（导出以便测试与复用）。 */
export async function runDeleteAllMemoryFlow(): Promise<void> {
  const typed = await showInputModal({
    title: t("settings.panel.memory.deleteAll.confirmTitle"),
    message: t("settings.panel.memory.deleteAll.confirmMessage"),
    placeholder: deleteAllConfirmPhrase(),
    confirmText: t("settings.panel.memory.deleteAll.confirmButton"),
    cancelText: t("settings.panel.memory.deleteAll.cancelButton"),
    icon: "🗑️",
    confirmValue: deleteAllConfirmPhrase(),
  });
  if (typed === null || !isDeleteAllConfirmed(typed)) return;

  let result: DeleteAllMemoryResult | undefined;
  try {
    result = await window.memoryPanel?.deleteAll();
  } catch (err) {
    console.error("[settings] delete all memory failed", err);
    await showHtmlModal({
      title: t("settings.panel.memory.deleteAll.failedTitle"),
      icon: "⚠️",
      htmlBody: `<p>${escapeHtml(err instanceof Error ? err.message : String(err))}</p>`,
      confirmText: t("settings.panel.memory.deleteAll.failedConfirm"),
    });
    return;
  }
  if (!result) return;

  if (!result.ok) {
    await notifyDeleteAllFailed(result.failed ?? []);
    return;
  }
  if (result.restartRequired) await promptRestart();
}

/** 绑定「删除全部记忆」按钮（只绑一次，由 settings.ts 顶层调用）。 */
export function initDeleteAllMemoryUI(): void {
  memoryDeleteAllBtn?.addEventListener("click", () => void runDeleteAllMemoryFlow());
}
