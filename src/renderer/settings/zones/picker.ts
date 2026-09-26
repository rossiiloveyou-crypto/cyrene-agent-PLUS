// 「添加成员」选择器：列出可加入区块的外部会话（externalChats），点选后回调。
//
// 语义约束（主进程 zone-store 强制）：
//   1. kind:"desktop" 的成员只允许出现在 root，且 root 自动包含全部桌面对话
//      → 选择器里**不提供**桌面对话选项（snapshot.conversations 只用于 root 卡片只读展示）。
//   2. 一个会话同一时刻只属于一个区块 → 已在目标区块里的项置灰，已在别处的项标注来源区块。
//
// 弹层复用 settings.css 的 .cy-modal-overlay / .cy-modal 样式（与 showModal 同一套外观），
// 但不复用 showModal/showInputModal：那两个是「确认/输入」语义，没有列表点选与关闭钩子。

import { escapeHtml } from "../shared/format";
import type { ZoneExternalMember, ZoneMember, ZonesSnapshot } from "../shared/types";

/** 成员稳定 key：与主进程 zone-store 的 memberKey 保持一致。 */
export function zoneMemberKey(member: ZoneMember): string {
  return member.kind === "desktop" ? `desktop:${member.conversationId}` : `external:${member.sessionId}`;
}

export interface ZonePickerEntry {
  /** 成员 key（external:<sessionId>）。 */
  key: string;
  /** 主标题（昵称 / 群名）。 */
  label: string;
  /** 次要说明（渠道 · 类型 · chatId，以及是否已在别的区块）。 */
  note: string;
  /** 已在目标区块里：置灰，点选无效。 */
  disabled: boolean;
}

function chatTypeLabel(chatType: "private" | "group"): string {
  return chatType === "group" ? "群聊" : "私聊";
}

/**
 * 收集某个区块可以加入的成员。
 * 只从 externalChats 里取：桌面对话自动属于 root，永远不进选择器。
 */
export function collectMemberPickEntries(snapshot: ZonesSnapshot, targetZoneId: string): ZonePickerEntry[] {
  const target = snapshot.zones.find((zone) => zone.zoneId === targetZoneId) ?? null;
  const targetKeys = new Set((target?.members ?? []).map(zoneMemberKey));
  const ownerByKey = new Map<string, string>();
  for (const zone of snapshot.zones) {
    for (const member of zone.members) ownerByKey.set(zoneMemberKey(member), zone.zoneName);
  }

  return snapshot.externalChats.map((chat) => {
    const key = `external:${chat.sessionId}`;
    const parts = [chat.channel, chatTypeLabel(chat.chatType), chat.chatId].filter((part) => !!part);
    const owner = ownerByKey.get(key);
    if (owner) parts.push(`已在「${owner}」`);
    return {
      key,
      label: chat.senderName || chat.chatId,
      note: parts.join(" · "),
      disabled: targetKeys.has(key),
    };
  });
}

/** 把选择器条目还原成可提交给主进程的成员对象。 */
export function pickEntryToMember(snapshot: ZonesSnapshot, key: string): ZoneExternalMember | null {
  const sessionId = key.startsWith("external:") ? key.slice("external:".length) : "";
  if (!sessionId) return null;
  const chat = snapshot.externalChats.find((item) => item.sessionId === sessionId)
    ?? snapshot.zones.flatMap((zone) => zone.members).find(
      (member): member is ZoneExternalMember => member.kind === "external" && member.sessionId === sessionId,
    );
  if (!chat) return null;
  return {
    kind: "external",
    sessionId: chat.sessionId,
    channel: chat.channel,
    chatId: chat.chatId,
    chatType: chat.chatType,
    ...(chat.senderName ? { senderName: chat.senderName } : {}),
  };
}

// ── 弹层 ──

let pickerOverlay: HTMLElement | null = null;

function ensurePickerOverlay(): HTMLElement {
  if (pickerOverlay && pickerOverlay.isConnected) return pickerOverlay;
  pickerOverlay = document.createElement("div");
  pickerOverlay.id = "zones-picker-overlay";
  pickerOverlay.className = "cy-modal-overlay is-hidden";
  pickerOverlay.innerHTML = [
    '<div class="cy-modal zones-picker" role="dialog" aria-modal="true">',
    '  <div class="cy-modal__head">',
    '    <span class="cy-modal__icon">🧩</span>',
    '    <h3 class="cy-modal__title" id="zones-picker-title"></h3>',
    '  </div>',
    '  <hr class="cy-modal__divider">',
    '  <p class="cy-modal__body" id="zones-picker-desc"></p>',
    '  <div class="zones-picker__list" id="zones-picker-list"></div>',
    '  <div class="cy-modal__actions">',
    '    <button type="button" class="ghost-btn" id="zones-picker-cancel">取消</button>',
    '  </div>',
    '</div>',
  ].join("\n");
  document.body.appendChild(pickerOverlay);
  pickerOverlay.querySelector<HTMLButtonElement>("#zones-picker-cancel")?.addEventListener("click", closeZonePicker);
  pickerOverlay.addEventListener("click", (event) => {
    if (event.target === pickerOverlay) closeZonePicker();
  });
  return pickerOverlay;
}

/** 关闭选择器弹层（面板切走时也要调，避免残留遮罩）。 */
export function closeZonePicker(): void {
  pickerOverlay?.classList.add("is-hidden");
}

/** 弹层里每个选项的通用结构（成员选择与「移动到…」共用）。 */
export interface ZonePickerItem {
  key: string;
  label: string;
  note?: string;
  disabled?: boolean;
}

export interface ZonePickerOptions {
  title: string;
  description: string;
  items: ZonePickerItem[];
  emptyText: string;
  onPick: (key: string) => void;
}

/** 打开展示型选择弹层；点选一项后自动关闭并回调。 */
export function openZonePicker(options: ZonePickerOptions): void {
  const overlay = ensurePickerOverlay();
  const titleEl = overlay.querySelector<HTMLElement>("#zones-picker-title");
  const descEl = overlay.querySelector<HTMLElement>("#zones-picker-desc");
  const listEl = overlay.querySelector<HTMLElement>("#zones-picker-list");
  if (titleEl) titleEl.textContent = options.title;
  if (descEl) descEl.textContent = options.description;
  if (listEl) {
    if (options.items.length === 0) {
      listEl.innerHTML = `<p class="zones-picker__empty">${escapeHtml(options.emptyText)}</p>`;
    } else {
      listEl.innerHTML = options.items
        .map((item) => [
          `<button type="button" class="zones-picker__item${item.disabled ? " is-disabled" : ""}"`,
          ` data-picker-key="${escapeHtml(item.key)}"${item.disabled ? " disabled" : ""}>`,
          `  <span class="zones-picker__label">${escapeHtml(item.label)}</span>`,
          item.note ? `  <span class="zones-picker__note">${escapeHtml(item.note)}</span>` : "",
          '</button>',
        ].join("\n"))
        .join("\n");
      listEl.querySelectorAll<HTMLButtonElement>("button[data-picker-key]").forEach((button) => {
        button.addEventListener("click", () => {
          if (button.disabled) return;
          const key = button.dataset.pickerKey ?? "";
          closeZonePicker();
          options.onPick(key);
        });
      });
    }
  }
  overlay.classList.remove("is-hidden");
}
