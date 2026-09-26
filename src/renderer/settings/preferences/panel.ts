// 截图热键 + 表情包管理：热键捕获/录入、表情包列表渲染、添加/删除表情包
// 从 settings.ts 抽离。依赖 preferences/appearance DOM + shared/save-status + shared/shell。
// 副作用导入：模块加载时执行事件绑定 + 表情包列表加载。

import { setPreferencesSaveStatus } from "../shared/save-status";
import { screenshotHotkeyInput } from "../appearance/dom";
import { t } from "../i18n";
import { preferencesState } from "./state";
import { stickerAddError, stickerAddConfirm, stickerAddCancel, stickerAddPickBtn, stickerAddFileName, stickerAddId, stickerAddDesc, stickerAddPhrases, stickerAddOverlay } from "./dom";
import {
  interceptKeywordsInput,
  interceptKeywordsImportBtn,
  interceptKeywordsClearBtn,
  interceptKeywordsStatusEl,
  triggerKeywordsInput,
  triggerKeywordsImportBtn,
  triggerKeywordsStatusEl,
} from "./dom";
import { addStickerBtn, openStickerManagerBtn } from "../shared/shell";

// ── 截图热键捕获 ──
// 聚焦时临时挂起全局快捷键（防止录入时触发截图），失焦恢复。
const MODIFIER_KEYS = new Set(["Control", "Alt", "Shift", "Meta"]);

screenshotHotkeyInput?.addEventListener("focus", async () => {
  await window.settings!.beginScreenshotHotkeyCapture();
});

screenshotHotkeyInput?.addEventListener("blur", async () => {
  await window.settings!.endScreenshotHotkeyCapture();
});

screenshotHotkeyInput?.addEventListener("keydown", (e) => {
  e.preventDefault();

  if (e.key === "Escape") {
    screenshotHotkeyInput!.blur();
    return;
  }
  if (e.key === "Enter") {
    screenshotHotkeyInput!.blur();
    return;
  }

  const parts: string[] = [];
  if (e.ctrlKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  if (e.metaKey) parts.push("Super");

  // 纯修饰键不提交
  if (MODIFIER_KEYS.has(e.key)) return;

  const keyName = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  parts.push(keyName);

  // 至少需要一个修饰键
  if (parts.length < 2) return;

  screenshotHotkeyInput!.value = parts.join("+");
  setPreferencesSaveStatus("有未保存的更改");
});

openStickerManagerBtn.addEventListener("click", async () => {
  console.log("[settings] open sticker manager clicked");
  try {
    const result = await window.settings?.openStickerManager();
    if (!result?.ok) {
      console.error("[settings] open sticker manager failed", result?.error);
      window.alert("表情包管理窗口打开失败，请查看终端日志。" + (result?.error ? `\n${result.error}` : ""));
    }
  } catch (error) {
    console.error("[settings] open sticker manager error", error);
    window.alert("表情包管理窗口打开失败，请查看终端日志。");
  }
});

// ── 添加表情包弹窗 ──


function openStickerAddModal(): void {
  preferencesState.stickerAddPickedPath = null;
  stickerAddFileName.textContent = "未选择";
  stickerAddId.value = "";
  stickerAddDesc.value = "";
  stickerAddPhrases.value = "";
  stickerAddError.classList.add("is-hidden");
  stickerAddOverlay.classList.remove("is-hidden");
}

function closeStickerAddModal(): void {
  stickerAddOverlay.classList.add("is-hidden");
}

addStickerBtn.addEventListener("click", openStickerAddModal);
stickerAddCancel.addEventListener("click", closeStickerAddModal);

stickerAddPickBtn.addEventListener("click", async () => {
  const filePath = await window.settings?.stickerPickFile?.();
  if (filePath) {
    preferencesState.stickerAddPickedPath = filePath;
    const name = filePath.split(/[\\/]/).pop() || filePath;
    stickerAddFileName.textContent = name;
    if (!stickerAddId.value) {
      const baseName = name.replace(/\.[^.]+$/, "");
      stickerAddId.value = baseName.replace(/[^a-zA-Z0-9_-]/g, "");
    }
  }
});

stickerAddConfirm.addEventListener("click", async () => {
  stickerAddError.classList.add("is-hidden");

  if (!preferencesState.stickerAddPickedPath) {
    stickerAddError.textContent = "请先选择图片文件";
    stickerAddError.classList.remove("is-hidden");
    return;
  }
  const id = stickerAddId.value.trim();
  if (!id) {
    stickerAddError.textContent = "请填写英文名称";
    stickerAddError.classList.remove("is-hidden");
    return;
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    stickerAddError.textContent = "名称只能用英文字母、数字、下划线和连字符";
    stickerAddError.classList.remove("is-hidden");
    return;
  }
  const description = stickerAddDesc.value.trim();
  if (!description) {
    stickerAddError.textContent = "请填写图片描述";
    stickerAddError.classList.remove("is-hidden");
    return;
  }
  const phrases = stickerAddPhrases.value.split("\n").map((s) => s.trim()).filter(Boolean);
  if (phrases.length === 0) {
    stickerAddError.textContent = "请至少写一行相近语义";
    stickerAddError.classList.remove("is-hidden");
    return;
  }

  try {
    await window.settings?.stickerAdd?.({ sourcePath: preferencesState.stickerAddPickedPath, id, description, phrases });
    closeStickerAddModal();
  } catch (err) {
    stickerAddError.textContent = "添加失败：" + (err as Error).message;
    stickerAddError.classList.remove("is-hidden");
  }
});

// ── 拦截关键词 / 触发关键词 ──
// 关键词存在渠道设置里（channels-settings.json），因为渠道链路（dispatcher / adapter）
// 直接读它做拦截与免 @ 触发；这里只在「保存偏好」时整体写回。

const KEYWORD_STATUS_TIMEOUT_MS = 6000;
/** 清空的二级确认：首次点击后按钮进入待确认态，超时自动复位 */
const CLEAR_ARM_TIMEOUT_MS = 5000;

function splitKeywordLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

let keywordStatusTimer: number | null = null;

function setKeywordStatus(el: HTMLElement | null, text: string, isError = false): void {
  if (!el) return;
  el.textContent = text;
  el.classList.toggle("is-error", isError);
  if (keywordStatusTimer !== null) window.clearTimeout(keywordStatusTimer);
  if (!text) return;
  keywordStatusTimer = window.setTimeout(() => {
    el.textContent = "";
    el.classList.remove("is-error");
    keywordStatusTimer = null;
  }, KEYWORD_STATUS_TIMEOUT_MS);
}

async function loadKeywordSettings(): Promise<void> {
  try {
    const cfg = await window.settings?.channelsGetConfig?.() as
      | { keywords?: { intercept?: string[]; trigger?: string[] } }
      | undefined;
    const keywords = cfg?.keywords;
    if (interceptKeywordsInput) interceptKeywordsInput.value = (keywords?.intercept ?? []).join("\n");
    if (triggerKeywordsInput) triggerKeywordsInput.value = (keywords?.trigger ?? []).join("\n");
  } catch (error) {
    console.warn("[settings] 读取关键词配置失败", error);
  }
}

/** 把两个文本框写回渠道设置（跟随「保存偏好」一起提交）。 */
export async function saveKeywordSettings(): Promise<void> {
  if (!interceptKeywordsInput && !triggerKeywordsInput) return;
  try {
    await window.settings?.channelsSaveConfig?.({
      keywords: {
        intercept: splitKeywordLines(interceptKeywordsInput?.value ?? ""),
        trigger: splitKeywordLines(triggerKeywordsInput?.value ?? ""),
      },
    });
  } catch (error) {
    console.warn("[settings] 保存关键词失败", error);
    setKeywordStatus(interceptKeywordsStatusEl, t("settings.panel.preferences.keywords.saveFailed"), true);
  }
}

async function importKeywords(
  target: HTMLTextAreaElement | null,
  statusEl: HTMLElement | null,
): Promise<void> {
  if (!target) return;
  try {
    const result = await window.settings?.channelsKeywordsImportTxt?.();
    if (!result) return;
    if (!result.ok) {
      const failure = result as { ok: false; canceled?: boolean; error?: string };
      if (failure.canceled) return;
      setKeywordStatus(statusEl, failure.error ?? t("settings.panel.preferences.keywords.importFailed"), true);
      return;
    }
    const existing = splitKeywordLines(target.value);
    const seen = new Set(existing.map((item) => item.toLowerCase()));
    const added = (result.keywords ?? []).filter((item) => {
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    target.value = [...existing, ...added].join("\n");
    setPreferencesSaveStatus("有未保存的更改");
    setKeywordStatus(
      statusEl,
      t("settings.panel.preferences.keywords.imported", { n: added.length, file: result.fileName ?? "txt" }),
    );
  } catch (error) {
    console.warn("[settings] 导入关键词失败", error);
    setKeywordStatus(statusEl, t("settings.panel.preferences.keywords.importFailed"), true);
  }
}

/** 一键清空拦截词：二级确认（第二次点击才真正清空）。 */
function armClearInterceptKeywords(): void {
  const input = interceptKeywordsInput;
  const button = interceptKeywordsClearBtn;
  if (!input || !button) return;
  const label = button.querySelector("span") ?? button;
  const original = label.getAttribute("data-original-text") ?? label.textContent ?? "";
  if (button.dataset.armed === "1") {
    delete button.dataset.armed;
    label.textContent = original;
    input.value = "";
    setPreferencesSaveStatus("有未保存的更改");
    setKeywordStatus(interceptKeywordsStatusEl, t("settings.panel.preferences.keywords.cleared"));
    return;
  }
  button.dataset.armed = "1";
  if (!label.getAttribute("data-original-text")) label.setAttribute("data-original-text", original);
  label.textContent = t("settings.panel.preferences.keywords.clearArmed");
  setKeywordStatus(interceptKeywordsStatusEl, t("settings.panel.preferences.keywords.clearHint"));
  window.setTimeout(() => {
    if (button.dataset.armed !== "1") return;
    delete button.dataset.armed;
    label.textContent = label.getAttribute("data-original-text") ?? original;
  }, CLEAR_ARM_TIMEOUT_MS);
}

interceptKeywordsImportBtn?.addEventListener("click", () => {
  void importKeywords(interceptKeywordsInput, interceptKeywordsStatusEl);
});
triggerKeywordsImportBtn?.addEventListener("click", () => {
  void importKeywords(triggerKeywordsInput, triggerKeywordsStatusEl);
});
interceptKeywordsClearBtn?.addEventListener("click", armClearInterceptKeywords);
interceptKeywordsInput?.addEventListener("input", () => setPreferencesSaveStatus("有未保存的更改"));
triggerKeywordsInput?.addEventListener("input", () => setPreferencesSaveStatus("有未保存的更改"));

// 「保存偏好」提交时一并写回渠道设置
document.getElementById("preferences-form")?.addEventListener("submit", () => {
  void saveKeywordSettings();
});

void loadKeywordSettings();
